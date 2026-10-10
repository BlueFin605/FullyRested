import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { request, startFixture } from './fixture';
import { runCollection, runTests, UsageError } from '../src/run';
import { formatResult, toJUnit } from '../src/report';
import { createSecretStore, secretEnvironmentVariable } from '../src/secret-store';
let fx: Awaited<ReturnType<typeof startFixture>>;
let host = '';
let folder = '';
const last = { get headers() { return fx.last.headers; }, set headers(v) { fx.last.headers = v; }, get url() { return fx.last.url; } };

const noKeychain = createSecretStore({}, undefined);

beforeAll(async () => {
  fx = await startFixture();
  host = fx.host;
  folder = fx.folder;
});

afterAll(() => fx.stop());

const collection = () => path.join(folder, 'api.frcol');

describe('runTests', () => {
  it('runs one request with the selected environment', async () => {
    const [result] = await runTests({ collection: collection(), action: path.join(folder, 'items', 'ok.frreq') }, noKeychain);
    expect(result).toMatchObject({ name: 'ok', status: 200, passed: true, errors: [] });
    expect(last.url).toBe('/ok?env=dev');
  });

  it('switches environment by name and finds the action relative to the collection', async () => {
    await runTests({ collection: collection(), environment: 'Prod', action: 'items/ok.frreq' }, noKeychain);
    expect(last.url).toBe('/ok?env=prod');
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
    expect(results.map(r => r.name)).toEqual(['ok', 'runs › expects 404', 'runs › inherits 200', 'down', 'old']);
    expect(results.map(r => r.passed)).toEqual([true, true, false, false, true]);
    expect(results[3]!.status).toBeLessThan(0);
    expect(results[3]!.errors[0]).toContain('No response');
  });

  it('reads secrets from FULLYRESTED_SECRET_<name>', async () => {
    const store = createSecretStore({ [secretEnvironmentVariable('apikey')]: 'from-env' }, undefined);
    await runTests({ collection: collection(), action: path.join(folder, 'items', 'ok.frreq') }, store);
    expect(last.headers['x-key']).toBe('from-env');
  });

  it('falls back to the keychain when the variable is not set', async () => {
    const keychain = { getPassword: async (service: string, account: string) => `${service}/${account}` };
    await runTests({ collection: collection(), action: path.join(folder, 'items', 'ok.frreq') }, createSecretStore({}, keychain));
    expect(last.headers['x-key']).toBe('fullyrested-collection-col-1/apikey');
  });

  it('rejects bad option combinations', async () => {
    await expect(runTests({ collection: collection() }, noKeychain)).rejects.toThrow(UsageError);
    await expect(runTests({ collection: collection(), run: 'x', all: true }, noKeychain)).rejects.toThrow(/--run needs --action/);
    await expect(runTests({ collection: collection(), environment: 'Nope', all: true }, noKeychain)).rejects.toThrow(/Nope.*Dev, Prod/);
    await expect(runTests({ collection: collection(), action: 'items/runs.frreq', run: 'nope' }, noKeychain)).rejects.toThrow(/nope/);
  });
});

describe('runCollection', () => {
  const ok = () => path.join(folder, 'items', 'ok.frreq');

  it('records the request, response and run metadata, with the secret redacted', async () => {
    const store = createSecretStore({ [secretEnvironmentVariable('apikey')]: 'from-env-key' }, undefined);
    const record = await runCollection({ collection: collection(), action: ok() }, store);
    expect(record).toMatchObject({ collection: collection(), environment: 'Dev', redacted: true });
    expect(record.runId).toBeTruthy();
    expect(new Date(record.startedAt).toString()).not.toBe('Invalid Date');
    expect(record.selection).toBe(`--action ${ok()}`);
    const [c] = record.cases;
    expect(c).toMatchObject({ index: 1, name: 'ok', requestFile: 'items/ok.frreq', outcome: 'pass' });
    expect(c!.request.url).toBe(`http://${host}/ok?env=dev`);
    expect(c!.request.headers['x-key']).toBe('{{$secret:apikey}}');
    expect(c!.response!.status).toBe(200);
    expect(c!.response!.body!.text).toBe('env=dev');
  });

  it('keeps the secret in clear with includeSecrets', async () => {
    const store = createSecretStore({ [secretEnvironmentVariable('apikey')]: 'from-env-key' }, undefined);
    const record = await runCollection({ collection: collection(), action: ok() }, store, { includeSecrets: true });
    expect(record.redacted).toBe(false);
    expect(record.cases[0]!.request.headers['x-key']).toBe('from-env-key');
  });

  it('names the run and reports each case through onCase', async () => {
    const seen: string[] = [];
    const record = await runCollection({ collection: collection(), action: 'items/runs.frreq', run: 'expects 404' }, noKeychain, { onCase: c => seen.push(c.name) });
    expect(seen).toEqual(['runs › expects 404']);
    expect(record.cases[0]).toMatchObject({ runName: 'expects 404', requestFile: 'items/runs.frreq', outcome: 'pass' });
    expect(record.selection).toBe('--action items/runs.frreq --run expects 404');
  });

  it('records a network failure on a checked request with no response and no validation', async () => {
    const file = path.join(folder, 'down-checked.frreq');
    fs.writeFileSync(file, JSON.stringify(request('r-down-checked', 'down checked', '127.0.0.1:1/nothing')));
    try {
      const record = await runCollection({ collection: collection(), action: 'down-checked.frreq' }, noKeychain);
      expect(record.cases[0]).toMatchObject({ outcome: 'error', error: 'No response: ECONNREFUSED' });
      expect(record.cases[0]!.response).toBeUndefined();
      expect(record.cases[0]!.validation).toBeUndefined();
      const [result] = await runTests({ collection: collection(), action: 'down-checked.frreq' }, noKeychain);
      expect(result).toMatchObject({ status: -4, passed: false, errors: ['No response: ECONNREFUSED'] });
    } finally {
      fs.rmSync(file);
    }
  });

  it('records a network failure as an error outcome', async () => {
    const record = await runCollection({ collection: collection(), action: 'down.frreq', environment: 'Prod' }, noKeychain);
    expect(record.environment).toBe('Prod');
    expect(record.cases[0]).toMatchObject({ outcome: 'error' });
    expect(record.cases[0]!.error).toContain('No response');
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

describe('folders', () => {
  it('sends headers inherited from the request\'s folder', async () => {
    await runTests({ collection: collection(), action: path.join(folder, 'items', 'ok.frreq') }, noKeychain);
    expect(last.headers['x-folder']).toBe('items');
  });

  it('runs every request under --folder', async () => {
    const results = await runTests({ collection: collection(), folder: 'items' }, noKeychain);
    expect(results.map(r => r.name)).toEqual(['ok', 'runs › expects 404', 'runs › inherits 200']);
  });

  it.each(['.', './', '.\\'])('treats --folder %s as the whole collection', async (dot) => {
    const results = await runTests({ collection: collection(), folder: dot }, noKeychain);
    expect(results.map(r => r.name)).toEqual(['ok', 'runs › expects 404', 'runs › inherits 200', 'down', 'old']);
  });

  it('keeps folder headers when the file name differs in case from the tree', async () => {
    // only meaningful on a case-insensitive file system
    if (!fs.existsSync(path.join(folder, 'items', 'OK.FRREQ')))
      return;
    await runTests({ collection: collection(), action: path.join(folder, 'items', 'OK.FRREQ') }, noKeychain);
    expect(last.headers['x-folder']).toBe('items');
  });

  it('runs a named run from the tree, so it inherits its folder', async () => {
    last.headers = {};
    await runTests({ collection: collection(), action: 'items/runs.frreq', run: 'expects 404' }, noKeychain);
    expect(last.headers['x-folder']).toBe('items');
  });

  it('inherits only from the collection for an action file outside the collection folder', async () => {
    const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'fullyrested-outside-'));
    try {
      const file = path.join(elsewhere, 'loose.frreq');
      fs.writeFileSync(file, JSON.stringify(request('r-loose', 'loose', '{{host}}/ok')));
      last.headers = {};
      const [result] = await runTests({ collection: collection(), action: file }, noKeychain);
      expect(result).toMatchObject({ name: 'loose', status: 200, passed: true });
      expect(last.headers['x-folder']).toBeUndefined();
      expect(last.headers['x-key']).toBe('');
    } finally {
      fs.rmSync(elsewhere, { recursive: true, force: true });
    }
  });

  it('accepts backslashes in --folder', async () => {
    const results = await runTests({ collection: collection(), folder: '.\\items\\' }, noKeychain);
    expect(results.map(r => r.name)).toEqual(['ok', 'runs › expects 404', 'runs › inherits 200']);
  });

  it('refuses --folder together with --action', async () => {
    await expect(runTests({ collection: collection(), folder: 'items', action: 'items/ok.frreq' }, noKeychain)).rejects.toThrow('Give --folder or --action, not both');
  });

  it('matches folder names ignoring case on a case-insensitive file system', async () => {
    if (!fs.existsSync(path.join(folder, 'ITEMS')))
      return;
    last.headers = {};
    await runTests({ collection: collection(), action: path.join(folder, 'ITEMS', 'ok.frreq') }, noKeychain);
    expect(last.headers['x-folder']).toBe('items');
    const results = await runTests({ collection: collection(), folder: 'ITEMS' }, noKeychain);
    expect(results.map(r => r.name)).toEqual(['ok', 'runs › expects 404', 'runs › inherits 200']);
  });

  it('rejects an unknown folder', async () => {
    await expect(runTests({ collection: collection(), folder: 'nope' }, noKeychain)).rejects.toThrow(UsageError);
  });

  it('reports requests under a broken folder file as failures and carries on', async () => {
    const broken = fs.mkdtempSync(path.join(os.tmpdir(), 'fullyrested-broken-'));
    try {
      fs.copyFileSync(collection(), path.join(broken, 'api.frcol'));
      fs.mkdirSync(path.join(broken, 'bad'));
      fs.writeFileSync(path.join(broken, 'bad', 'folder.frfolder'), '{oops');
      fs.writeFileSync(path.join(broken, 'bad', 'b.frreq'), JSON.stringify(request('r-b', 'b', '{{host}}/ok')));
      fs.writeFileSync(path.join(broken, 'good.frreq'), JSON.stringify(request('r-g', 'good', '{{host}}/ok')));

      const results = await runTests({ collection: path.join(broken, 'api.frcol'), all: true }, noKeychain);
      expect(results.map(r => [r.name, r.passed])).toEqual([['b', false], ['good', true]]);
      expect(results[0]!.errors[0]).toMatch(/bad\/folder\.frfolder is invalid/);
    } finally {
      fs.rmSync(broken, { recursive: true, force: true });
    }
  });

  it('passes on warnings', async () => {
    const warned = fs.mkdtempSync(path.join(os.tmpdir(), 'fullyrested-warn-'));
    try {
      fs.copyFileSync(collection(), path.join(warned, 'api.frcol'));
      fs.writeFileSync(path.join(warned, 'folder.frfolder'), '{}');
      const warnings: string[] = [];
      await runTests({ collection: path.join(warned, 'api.frcol'), all: true }, noKeychain, () => { }, w => warnings.push(w));
      expect(warnings).toHaveLength(1);
    } finally {
      fs.rmSync(warned, { recursive: true, force: true });
    }
  });
});
