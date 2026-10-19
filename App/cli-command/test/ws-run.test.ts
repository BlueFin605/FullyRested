import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { AddressInfo } from 'net';
import { RequestNode } from '@fullyrested/core';
import { request } from './fixture';
import { createSecretStore } from '../src/secret-store';
import { loadTree } from '../src/files';
import { buildTriggerFirer, resolveWebSocketTarget } from '../src/ws-run';

const secrets = createSecretStore({}, undefined);
let server: http.Server;
let folder = '';
const paths: string[] = [];

beforeAll(async () => {
  server = http.createServer((req, res) => { paths.push(req.url ?? ''); res.writeHead(200).end('ok'); });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  folder = fs.mkdtempSync(path.join(os.tmpdir(), 'fullyrested-wsrun-'));
  fs.writeFileSync(path.join(folder, 'api.frcol'), JSON.stringify({
    collectionGuid: 'col-wsrun', selectedEnvironmentId: 'dev',
    collectionEnvironment: { name: 'system.settings', variables: [{ variable: 'http', value: `127.0.0.1:${port}`, active: true, id: '1' }], secrets: [], auth: { authentication: 'none' } },
    environments: [{ name: 'Dev', id: 'dev', variables: [], secrets: [], auth: { authentication: 'inherit' } }]
  }));
  const write = (name: string, body: object) => fs.writeFileSync(path.join(folder, name), JSON.stringify(body));
  write('touch.frreq', request('h1', 'touch', '{{http}}/touch/{{$guid}}', { type: 'http', headers: [] }));
  write('mcp.frreq', request('m1', 'mcp', '{{http}}/mcp', { type: 'mcp', headers: [] }));
  write('ws.frreq', request('w1', 'ws', 'ws://x/{{$guid}}', {
    type: 'websocket', headers: [{ key: 'x-id', value: '{{$guid}}', active: true, id: 'h' }], message: 'm {{$guid}}',
    expect: { count: 1, schema: { schema: '{"const":"{{$guid}}"}' } }, trigger: { request: 'touch.frreq', repeat: 'until-done', interval: 100, delay: 0 }
  }));
  write('ws-mcp.frreq', request('w2', 'ws-mcp', 'ws://x/', {
    type: 'websocket', headers: [], trigger: { request: 'mcp.frreq', repeat: 'once', interval: 100, delay: 0 }
  }));
});
afterAll(() => { server.close(); });

const node = async (file: string) => {
  const root = await loadTree(path.join(folder, 'api.frcol'), secrets);
  const n = root.find(file);
  if (!(n instanceof RequestNode)) throw new Error('missing ' + file);
  return { root, n };
};
const GUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

describe('resolveWebSocketTarget', () => {
  it('uses one {{$guid}} for url, headers, message and expect', async () => {
    const { n } = await node('ws.frreq');
    const t = await resolveWebSocketTarget(n, 'dev');
    const guid = GUID.exec(t.url)![0];
    expect(t.headers['x-id']).toBe(guid);
    expect(t.message).toBe('m ' + guid);
    expect(t.expect.schema?.schema).toBe(`{"const":"${guid}"}`);
  });

  it('returns the resolved secrets with the target', async () => {
    const { n } = await node('ws.frreq');
    expect((await resolveWebSocketTarget(n, 'dev')).secrets).toEqual(n.resolve({ environmentId: 'dev' }).secrets);
  });
});

describe('buildTriggerFirer', () => {
  it('substitutes the trigger request afresh on each firing', async () => {
    const { root, n } = await node('ws.frreq');
    paths.length = 0;
    const firer = buildTriggerFirer(n.action, root, 'dev')!;
    await firer.fire();
    await firer.fire();
    expect(paths).toHaveLength(2);
    expect(GUID.exec(paths[0])).toBeTruthy();
    expect(paths[0]).not.toBe(paths[1]);
  });

  it('names the real type when the trigger request is not http', async () => {
    const { root, n } = await node('ws-mcp.frreq');
    expect(() => buildTriggerFirer(n.action, root, 'dev')).toThrow('is a mcp request; a trigger must be http');
  });
});
