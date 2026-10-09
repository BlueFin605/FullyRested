import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, IncomingHttpHeaders, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runTests, UsageError } from '../src/run';
import { formatResult, toJUnit } from '../src/report';
import { createSecretStore, secretEnvironmentVariable } from '../src/secret-store';

let server: Server;
let host = '';
let lastHeaders: IncomingHttpHeaders = {};
let lastUrl = '';
let folder = '';

const noKeychain = createSecretStore({}, undefined);

function validation(type: string, httpCode: number) {
  return { type, httpCode, headers: [], body: 'None', jsonSchema: undefined };
}

function request(id: string, name: string, url: string, extra: object = {}) {
  return {
    id, name, verb: 'get', protocol: 'http', url,
    headers: [{ key: 'x-key', value: '{{$apikey}}', active: true, id: 'h1' }],
    parameters: [],
    body: { contentType: 'none', body: undefined },
    authentication: { authentication: 'inherit' },
    runs: [],
    validation: validation('ResponseCode', 200),
    ...extra
  };
}

beforeAll(async () => {
  server = createServer((req, res) => {
    lastHeaders = req.headers;
    lastUrl = req.url ?? '';
    const status = req.url?.startsWith('/missing') ? 404 : 200;
    res.writeHead(status, { 'content-type': 'text/plain' });
    res.end(`env=${new URL(req.url ?? '', 'http://x').searchParams.get('env')}`);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  host = `127.0.0.1:${(server.address() as AddressInfo).port}`;

  folder = fs.mkdtempSync(path.join(os.tmpdir(), 'fullyrested-cli-'));
  fs.writeFileSync(path.join(folder, 'api.frcol'), JSON.stringify({
    collectionGuid: 'col-1',
    selectedEnvironmentId: 'dev',
    collectionEnvironment: { name: 'system.settings', variables: [{ variable: 'host', value: host, active: true, id: '1' }], secrets: [{ $secret: 'apikey', active: true, id: 's' }], auth: { authentication: 'none' } },
    environments: [
      { name: 'Dev', id: 'dev', variables: [{ variable: 'env', value: 'dev', active: true, id: '2' }], secrets: [], auth: { authentication: 'inherit' } },
      { name: 'Prod', id: 'prod', variables: [{ variable: 'env', value: 'prod', active: true, id: '3' }], secrets: [], auth: { authentication: 'inherit' } }
    ]
  }));
  fs.mkdirSync(path.join(folder, 'items'));
  fs.writeFileSync(path.join(folder, 'items', 'ok.frreq'), JSON.stringify(request('r-ok', 'ok', '{{host}}/ok', {
    parameters: [{ key: 'env', value: '{{env}}', active: true, id: 'p' }]
  })));
  fs.writeFileSync(path.join(folder, 'items', 'runs.frreq'), JSON.stringify(request('r-runs', 'runs', '{{host}}/missing', {
    runs: [
      { id: 'run-404', name: 'expects 404', parameters: [], headers: [], variables: [], secrets: [], authentication: { authentication: 'inherit' }, validation: validation('ResponseCode', 404) },
      { id: 'run-inherit', name: 'inherits 200', parameters: [], headers: [], variables: [], secrets: [], authentication: { authentication: 'inherit' }, validation: validation('Inherit', 0) }
    ]
  })));
  fs.writeFileSync(path.join(folder, 'old.reasyreq'), JSON.stringify(request('r-old', 'old', '{{host}}/ok', { validation: undefined })));
  fs.writeFileSync(path.join(folder, 'down.frreq'), JSON.stringify(request('r-down', 'down', '127.0.0.1:1/nothing', { validation: undefined })));
});

afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
  fs.rmSync(folder, { recursive: true, force: true });
});

const collection = () => path.join(folder, 'api.frcol');

describe('runTests', () => {
  it('runs one request with the selected environment', async () => {
    const [result] = await runTests({ collection: collection(), action: path.join(folder, 'items', 'ok.frreq') }, noKeychain);
    expect(result).toMatchObject({ name: 'ok', status: 200, passed: true, errors: [] });
    expect(lastUrl).toBe('/ok?env=dev');
  });

  it('switches environment by name and finds the action relative to the collection', async () => {
    await runTests({ collection: collection(), environment: 'Prod', action: 'items/ok.frreq' }, noKeychain);
    expect(lastUrl).toBe('/ok?env=prod');
  });

  it('runs one named run and its own validation', async () => {
    const [result] = await runTests({ collection: collection(), action: path.join(folder, 'items', 'runs.frreq'), run: 'expects 404' }, noKeychain);
    expect(result).toMatchObject({ name: 'runs › expects 404', status: 404, passed: true });
  });

  it('fails a run that inherits a 200 check and gets a 404', async () => {
    const [result] = await runTests({ collection: collection(), action: path.join(folder, 'items', 'runs.frreq'), run: 'run-inherit' }, noKeychain);
    expect(result!.passed).toBe(false);
    expect(result!.errors[0]).toContain('200');
    expect(formatResult(result!)).toMatch(/^FAIL runs › inherits 200 404 \d+ms\n {4}Http response code/);
  });

  it('--all runs every request in the folder, each run separately, old extensions included', async () => {
    const results = await runTests({ collection: collection(), all: true }, noKeychain);
    expect(results.map(r => r.name)).toEqual(['down', 'ok', 'runs › expects 404', 'runs › inherits 200', 'old']);
    expect(results.map(r => r.passed)).toEqual([false, true, true, false, true]);
    expect(results[0]!.status).toBeLessThan(0);
    expect(results[0]!.errors[0]).toContain('No response');
  });

  it('reads secrets from FULLYRESTED_SECRET_<name>', async () => {
    const store = createSecretStore({ [secretEnvironmentVariable('apikey')]: 'from-env' }, undefined);
    await runTests({ collection: collection(), action: path.join(folder, 'items', 'ok.frreq') }, store);
    expect(lastHeaders['x-key']).toBe('from-env');
  });

  it('falls back to the keychain when the variable is not set', async () => {
    const keychain = { getPassword: async (service: string, account: string) => `${service}/${account}` };
    await runTests({ collection: collection(), action: path.join(folder, 'items', 'ok.frreq') }, createSecretStore({}, keychain));
    expect(lastHeaders['x-key']).toBe('fullyrested-collection-col-1/apikey');
  });

  it('rejects bad option combinations', async () => {
    await expect(runTests({ collection: collection() }, noKeychain)).rejects.toThrow(UsageError);
    await expect(runTests({ collection: collection(), run: 'x', all: true }, noKeychain)).rejects.toThrow(/--run needs --action/);
    await expect(runTests({ collection: collection(), environment: 'Nope', all: true }, noKeychain)).rejects.toThrow(/Nope.*Dev, Prod/);
    await expect(runTests({ collection: collection(), action: 'items/runs.frreq', run: 'nope' }, noKeychain)).rejects.toThrow(/nope/);
  });
});

describe('toJUnit', () => {
  it('writes passes and escaped failures', () => {
    const report = toJUnit('api.frcol', [
      { name: 'ok', status: 200, ms: 12, passed: true, errors: [] },
      { name: 'a <b> & "c"', status: 500, ms: 1500, passed: false, errors: ["code doesn't match"] }
    ]);
    expect(report).toContain('<testsuites tests="2" failures="1" time="1.512">');
    expect(report).toContain('<testcase classname="api.frcol" name="ok" time="0.012" />');
    expect(report).toContain('name="a &lt;b&gt; &amp; &quot;c&quot;"');
    expect(report).toContain('<failure message="code doesn&apos;t match">status 500\ncode doesn&apos;t match</failure>');
  });
});
