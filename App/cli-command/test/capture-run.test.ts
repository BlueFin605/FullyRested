import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from 'node:http';
import { AddressInfo } from 'node:net';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { request } from './fixture';
import { runCollection } from '../src/run';
import { createSecretStore } from '../src/secret-store';

const noKeychain = createSecretStore({}, undefined);
let stop: () => Promise<void>;
let folder = '';
const seen: string[] = [];

beforeAll(async () => {
  const server = createServer((req, res) => {
    seen.push(`${req.method} ${req.url}`);
    if (req.url == '/create') {
      const port = (server.address() as AddressInfo).port;
      res.writeHead(201, { 'content-type': 'application/json', 'x-trace': 'trace-9' });
      res.end(JSON.stringify({ id: 'abc', uploadUrl: `http://127.0.0.1:${port}/upload?sig=1` }));
      return;
    }
    res.writeHead(req.url == '/items/abc' || req.url?.startsWith('/upload?sig=1') || req.url == '/trace/trace-9' ? 200 : 404, { 'content-type': 'text/plain' });
    res.end('x');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const host = `127.0.0.1:${(server.address() as AddressInfo).port}`;
  stop = () => new Promise(resolve => server.close(() => resolve()));

  folder = fs.mkdtempSync(path.join(os.tmpdir(), 'fullyrested-capture-'));
  const write = (name: string, doc: object) => fs.writeFileSync(path.join(folder, name), JSON.stringify(doc));
  write('api.frcol', {
    collectionGuid: 'col-1', selectedEnvironmentId: '',
    collectionEnvironment: { name: 'system.settings', variables: [{ variable: 'host', value: host, active: true, id: '1' }], secrets: [], auth: { authentication: 'none' } },
    environments: []
  });
  const plain = { headers: [] };
  write('1-create.frreq', request('r1', 'create', '{{host}}/create', {
    ...plain, validation: { type: 'None', httpCode: 200, headers: [], body: 'None' },
    capture: [
      { variable: 'newId', from: 'body', path: '$.id', id: 'c1' },
      { variable: 'uploadUrl', from: 'body', path: '$.uploadUrl', id: 'c2' },
      { variable: 'trace', from: 'header', path: 'X-Trace', id: 'c3' },
      { variable: 'code', from: 'status', path: '', id: 'c4' }
    ]
  }));
  write('2-get.frreq', request('r2', 'get', '{{host}}/items/{{newId}}', plain));
  write('3-upload.frreq', request('r3', 'upload', '{{uploadUrl}}', plain));
  write('4-trace.frreq', request('r4', 'trace', '{{host}}/trace/{{trace}}', plain));
  write('5-code.frreq', request('r5', 'code', '{{host}}/code/{{code}}', { ...plain, validation: { type: 'None', httpCode: 200, headers: [], body: 'None' } }));
  write('6-miss.frreq', request('r6', 'miss', '{{host}}/create', {
    ...plain, validation: { type: 'None', httpCode: 200, headers: [], body: 'None' },
    capture: [{ variable: 'nope', from: 'body', path: '$.missing', id: 'c5' }]
  }));
  write('7-run.frreq', request('r7', 'withrun', '{{host}}/items/{{newId}}', {
    ...plain,
    runs: [{ id: 'u1', name: 'one', variables: [], secrets: [], headers: [], parameters: [], authentication: { authentication: 'inherit' }, validation: { type: 'Inherit', httpCode: 200, headers: [], body: 'None' },
      capture: [{ variable: 'newId', from: 'body', path: '$.nothing', id: 'c9' }] }]
  }));
});

afterAll(() => stop());

describe('capture in a run', () => {
  it('feeds captured body, header and status values, and an absolute url, to later requests', async () => {
    const record = await runCollection({ collection: path.join(folder, 'api.frcol'), all: true }, noKeychain);
    expect(seen.slice(0, 5)).toEqual(['GET /create', 'GET /items/abc', 'GET /upload?sig=1', 'GET /trace/trace-9', 'GET /code/201']);
    const [create, get, upload, trace] = record.cases;
    expect(create).toMatchObject({ outcome: 'pass', captured: ['newId', 'uploadUrl', 'trace', 'code'] });
    expect([get!.outcome, upload!.outcome, trace!.outcome]).toEqual(['pass', 'pass', 'pass']);
    expect(upload!.request.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/upload\?sig=1$/);
  });

  it('errors a case whose capture finds nothing, naming the rule', async () => {
    const record = await runCollection({ collection: path.join(folder, 'api.frcol'), all: true }, noKeychain);
    const miss = record.cases.find(c => c.name == 'miss')!;
    expect(miss.outcome).toBe('error');
    expect(miss.error).toContain("capture 'nope': nothing at $.missing");
  });

  it('has nothing captured when a request is run on its own', async () => {
    seen.length = 0;
    await runCollection({ collection: path.join(folder, 'api.frcol'), action: '7-run.frreq', all: true }, noKeychain);
    expect(seen).toEqual(['GET /items/']);
  });
});
