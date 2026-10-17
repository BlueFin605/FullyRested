import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from 'node:http';
import { AddressInfo } from 'node:net';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { request, validation } from './fixture';
import { runCollection, UsageError } from '../src/run';
import { createSecretStore } from '../src/secret-store';

// {{$guid}} gives a create case a unique name each run; a runs-only request is never sent bare by a suite run.
const noKeychain = createSecretStore({}, undefined);
let stop: () => Promise<void>;
let folder = '';
const seen: string[] = [];
const names = new Set<string>();

beforeAll(async () => {
  const server = createServer((req, res) => {
    let data = '';
    req.on('data', c => data += c);
    req.on('end', () => {
      seen.push(`${req.method} ${req.url}`);
      const send = (status: number, body: object) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
      if (req.method == 'POST') {
        const name = JSON.parse(data).name as string;
        if (names.has(name)) return send(409, {});
        names.add(name);
        return send(201, { name });
      }
      send(req.method == 'DELETE' ? 204 : 200, {});
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const host = `127.0.0.1:${(server.address() as AddressInfo).port}`;
  stop = () => new Promise(resolve => server.close(() => resolve()));

  folder = fs.mkdtempSync(path.join(os.tmpdir(), 'fullyrested-builtins-'));
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
  write('1-create.frreq', request('r1', 'create', '{{host}}/tags', {
    verb: 'post', headers: [], body: { contentType: 'application/json', body: '{"name":"{{tagName}}"}' },
    validation: validation('ResponseCode', 201),
    runs: [run('u1', 'unique name', { variables: [{ variable: 'tagName', value: 'api-{{$guid}}', active: true, id: 'v1' }] })]
  }));
  write('2-delete.frreq', request('r2', 'delete', '{{host}}/tags/x', {
    verb: 'delete', headers: [], validation: validation('ResponseCode', 204), runsOnly: true,
    runs: [run('d1', 'removes it', {})]
  }));
});

afterAll(() => stop());

describe('built-in {{$guid}} and runs-only requests', () => {
  it('a suite run sends a different guid each time and never the runs-only request bare', async () => {
    for (let i = 0; i < 2; i++) {
      const record = await runCollection({ collection: path.join(folder, 'api.frcol'), all: true }, noKeychain);
      expect(record.cases.map(c => [c.name, c.outcome])).toEqual([['create › unique name', 'pass'], ['delete › removes it', 'pass']]);
    }
    expect(names.size).toBe(2);
    expect([...names].every(n => /^api-[0-9a-f-]{36}$/.test(n))).toBe(true);
    expect(seen.filter(s => s.startsWith('DELETE')).length).toBe(2);
  });

  it('refuses --action alone on a runs-only request, but --run works', async () => {
    const collection = path.join(folder, 'api.frcol');
    const before = seen.length;
    await expect(runCollection({ collection, action: '2-delete.frreq' }, noKeychain)).rejects.toThrow(UsageError);
    expect(seen.length).toBe(before);
    const record = await runCollection({ collection, action: '2-delete.frreq', run: 'removes it' }, noKeychain);
    expect(record.cases.map(c => c.outcome)).toEqual(['pass']);
  });
});
