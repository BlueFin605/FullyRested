import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from 'node:http';
import { AddressInfo } from 'node:net';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { request, validation } from './fixture';
import { runCollection } from '../src/run';
import { createSecretStore } from '../src/secret-store';

// The pattern for an endpoint whose success consumes its fixture (DELETE) or that must be tried with no
// body: one case creates the thing and captures its id, the next uses it, and a run with body 'none'
// sends an empty body. Cases run in tree order, so the files are named to put the create first.
const noKeychain = createSecretStore({}, undefined);
let stop: () => Promise<void>;
let folder = '';
const live = new Set<string>();
const seen: string[] = [];

beforeAll(async () => {
  const server = createServer((req, res) => {
    let data = '';
    req.on('data', c => data += c);
    req.on('end', () => {
      seen.push(`${req.method} ${req.url} [${data}]`);
      const send = (status: number, body: object) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
      if (req.method == 'POST' && req.url == '/things') {
        if (data == '') return send(400, { error: 'Request body is required' });
        const id = `t${live.size + 1}`;
        live.add(id);
        return send(201, { id });
      }
      const id = req.url?.split('/')[2] ?? '';
      if (req.method == 'DELETE') return live.delete(id) ? send(200, {}) : send(404, {});
      send(404, {});
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const host = `127.0.0.1:${(server.address() as AddressInfo).port}`;
  stop = () => new Promise(resolve => server.close(() => resolve()));

  folder = fs.mkdtempSync(path.join(os.tmpdir(), 'fullyrested-pattern-'));
  const write = (name: string, doc: object) => fs.writeFileSync(path.join(folder, name), JSON.stringify(doc));
  write('api.frcol', {
    collectionGuid: 'col-1', selectedEnvironmentId: '',
    collectionEnvironment: { name: 'system.settings', variables: [{ variable: 'host', value: host, active: true, id: '1' }], secrets: [], auth: { authentication: 'none' } },
    environments: []
  });
  const run = (id: string, name: string, extra: object) => ({
    id, name, variables: [], secrets: [], headers: [], parameters: [], authentication: { authentication: 'inherit' },
    validation: { type: 'Inherit', httpCode: 200, headers: [], body: 'None' }, ...extra
  });
  const post = { verb: 'post', headers: [], body: { contentType: 'application/json', body: '{"text":"hi"}' } };
  write('1-create.frreq', request('r1', 'create', '{{host}}/things', {
    ...post, validation: validation('ResponseCode', 201),
    runs: [
      run('u1', 'with body', { capture: [{ variable: 'thingId', from: 'body', path: '$.id', id: 'c1' }], validation: validation('ResponseCode', 201) }),
      run('u2', 'empty body', { body: { contentType: 'none', body: undefined }, validation: validation('ResponseCode', 400) })
    ]
  }));
  write('2-delete.frreq', request('r2', 'delete', '{{host}}/things/{{thingId}}', { verb: 'delete', headers: [], validation: validation('ResponseCode', 200) }));
  write('3-delete again.frreq', request('r3', 'delete again', '{{host}}/things/{{thingId}}', { verb: 'delete', headers: [], validation: validation('ResponseCode', 404) }));
});

afterAll(() => stop());

describe('fixture pattern: create inside the run, delete it, send an empty body', () => {
  it('passes every case and leaves nothing behind', async () => {
    const record = await runCollection({ collection: path.join(folder, 'api.frcol'), all: true }, noKeychain);
    expect(record.cases.map(c => [c.name, c.outcome])).toEqual([
      ['create › with body', 'pass'], ['create › empty body', 'pass'], ['delete', 'pass'], ['delete again', 'pass']
    ]);
    expect(seen).toEqual(['POST /things [{"text":"hi"}]', 'POST /things []', 'DELETE /things/t1 []', 'DELETE /things/t1 []']);
    expect(live.size).toBe(0);
  });
});
