import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { AddressInfo } from 'net';
import { WebSocketServer, WebSocket } from 'ws';
import { callTool as call, connectMcp, request } from './fixture';
import { createSecretStore } from '../src/secret-store';
import { runCollection } from '../src/run';

const cli = path.resolve(__dirname, '..', 'dist', 'index.js');
const secrets = createSecretStore({}, undefined);
const EVENT = '{"event":"touched"}';

let server: http.Server;
let wss: WebSocketServer;
let folder = '';
let hits = 0;

// One port serves both: every http hit to /touch pushes one ws message to every connected client; /locked is a 401
beforeAll(async () => {
  wss = new WebSocketServer({ noServer: true });
  server = http.createServer((req, res) => {
    if (req.url?.startsWith('/locked')) {
      res.writeHead(401).end();
      return;
    }
    hits++;
    for (const c of wss.clients) c.send(EVENT);
    res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
  });
  server.on('upgrade', (req, socket, head) => wss.handleUpgrade(req, socket, head, () => { }));
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;

  folder = fs.mkdtempSync(path.join(os.tmpdir(), 'fullyrested-wstrigger-'));
  fs.writeFileSync(path.join(folder, 'api.frcol'), JSON.stringify({
    collectionGuid: 'col-trig',
    selectedEnvironmentId: 'dev',
    collectionEnvironment: {
      name: 'system.settings',
      variables: [
        { variable: 'http', value: `127.0.0.1:${port}`, active: true, id: '1' },
        { variable: 'ws', value: `ws://127.0.0.1:${port}`, active: true, id: '2' }
      ],
      secrets: [], auth: { authentication: 'none' }
    },
    environments: [{ name: 'Dev', id: 'dev', variables: [], secrets: [], auth: { authentication: 'inherit' } }]
  }));
  const ok = { type: 'http' };
  fs.writeFileSync(path.join(folder, 'touch.frreq'), JSON.stringify(request('h1', 'touch', '{{http}}/touch', { ...ok, headers: [] })));
  fs.writeFileSync(path.join(folder, 'locked.frreq'), JSON.stringify(request('h2', 'locked', '{{http}}/locked', { ...ok, headers: [] })));
  const ws = (id: string, name: string, trigger: object | undefined) => fs.writeFileSync(path.join(folder, `${name}.frreq`),
    JSON.stringify(request(id, name, '{{ws}}/events', {
      type: 'websocket', message: '', headers: [], authentication: { authentication: 'inherit' },
      expect: { count: 1, timeout: 2500 }, ...(trigger && { trigger })
    })));
  ws('w1', 'watch-touch', { request: 'touch.frreq', repeat: 'until-done', interval: 200, delay: 0 });
  ws('w2', 'watch-locked', { request: 'locked.frreq', repeat: 'until-done', interval: 200, delay: 0 });
  ws('w3', 'watch-missing', { request: 'nope.frreq', repeat: 'once', interval: 200, delay: 0 });
});

afterAll(async () => {
  for (const c of wss.clients) c.terminate();
  wss.close();
  await new Promise<void>(r => server.close(() => r()));
  fs.rmSync(folder, { recursive: true, force: true });
});

const collection = () => path.join(folder, 'api.frcol');

function fullyrested(args: string[]): Promise<{ code: number; out: string; err: string }> {
  return new Promise(resolve => {
    execFile(process.execPath, [cli, ...args], { cwd: folder, encoding: 'utf8' }, (error, out, err) =>
      resolve({ code: error ? (error as { code?: number }).code ?? 1 : 0, out, err }));
  });
}

describe('websocket trigger in run', () => {
  it('passes in one run, the trigger having hit the server', { timeout: 60000 }, async () => {
    hits = 0;
    const record = await runCollection({ collection: collection(), action: 'watch-touch.frreq' }, secrets);
    const c = record.cases[0]!;
    expect(c.outcome).toBe('pass');
    expect(hits).toBeGreaterThanOrEqual(1);
  });

  it('passes from the built CLI with no outside script', { timeout: 60000 }, async () => {
    const r = await fullyrested(['run', '-c', collection(), '-a', 'watch-touch.frreq']);
    expect(r.out).toContain('PASS watch-touch');
    expect(r.code).toBe(0);
  });

  it('times out naming the trigger when it returns 401', { timeout: 60000 }, async () => {
    const record = await runCollection({ collection: collection(), action: 'watch-locked.frreq', timeout: 800 }, secrets);
    const c = record.cases[0]!;
    expect(c.outcome).toBe('fail');
    expect(c.error).toContain('trigger returned 401');
  });

  it('returns an error case naming the trigger request when it cannot be resolved', { timeout: 60000 }, async () => {
    const record = await runCollection({ collection: collection(), action: 'watch-missing.frreq' }, secrets);
    expect(record.cases[0]!.outcome).toBe('error');
    expect(record.cases[0]!.error).toContain("'nope.frreq'");
  });

  it('passes through the MCP run tool', { timeout: 60000 }, async () => {
    const client = await connectMcp({ secrets });
    const run = await call(client, 'run', { collection: collection(), action: 'watch-touch.frreq' });
    expect(run.isError).toBe(false);
    expect(run.json()).toMatchObject({ passed: 1, failed: 0 });
  });
});
