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
// What the captured-value cases sent: the upgrade's url and x-token header, the first message, and the trigger's path
const chain = { upgradeUrl: '', upgradeToken: '', message: '', triggered: [] as string[] };

// One port serves both: every http hit to /touch pushes one ws message to every connected client; /locked is a 401.
// /mint answers {"id":"tok-42"} (captured by chain/1-mint); /touch-token/<id> pushes {"id":"<id>"} only.
beforeAll(async () => {
  wss = new WebSocketServer({ noServer: true });
  server = http.createServer((req, res) => {
    if (req.url == '/mint') {
      res.writeHead(200, { 'content-type': 'application/json' }).end('{"id":"tok-42"}');
      return;
    }
    if (req.url?.startsWith('/touch-token/')) {
      const id = decodeURIComponent(req.url.substring('/touch-token/'.length));
      chain.triggered.push(id);
      for (const c of wss.clients) c.send(JSON.stringify({ id }));
      res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
      return;
    }
    if (req.url?.startsWith('/locked')) {
      res.writeHead(401).end();
      return;
    }
    hits++;
    for (const c of wss.clients) c.send(EVENT);
    res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
  });
  server.on('upgrade', (req, socket, head) => wss.handleUpgrade(req, socket, head, client => {
    if (!req.url?.startsWith('/chain/')) return;
    chain.upgradeUrl = req.url;
    chain.upgradeToken = String(req.headers['x-token'] ?? '');
    client.once('message', m => { chain.message = m.toString(); });
  }));
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

  // chain/: an http case captures `token`; the websocket case after it uses the value in its url, header,
  // message and expect, and so does its trigger (which sits outside the folder, so is not itself a case)
  fs.mkdirSync(path.join(folder, 'chain'));
  fs.writeFileSync(path.join(folder, 'chain', '1-mint.frreq'), JSON.stringify(request('c1', 'mint', '{{http}}/mint', {
    ...ok, headers: [], capture: [{ variable: 'token', from: 'body', path: '$.id', id: 'cap1' }]
  })));
  fs.writeFileSync(path.join(folder, 'chain', '2-watch.frreq'), JSON.stringify(request('c2', 'watch-token', '{{ws}}/chain/{{token}}', {
    type: 'websocket', message: 'hello {{token}}', authentication: { authentication: 'inherit' },
    headers: [{ key: 'x-token', value: '{{token}}', active: true, id: 'xh' }],
    expect: { count: 1, timeout: 2500, schema: { schema: '{"type":"object","required":["id"],"properties":{"id":{"const":"{{token}}"}}}' } },
    trigger: { request: 'touch-token.frreq', repeat: 'until-done', interval: 200, delay: 0 }
  })));
  fs.writeFileSync(path.join(folder, 'touch-token.frreq'), JSON.stringify(request('h3', 'touch-token', '{{http}}/touch-token/{{token}}', { ...ok, headers: [] })));
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
    expect(record.redacted).toBe(true);
    expect(hits).toBeGreaterThanOrEqual(1);
    // the call that caused the pass is recorded, stamped in ms since the test started
    const calls = c.websocket?.triggerCalls ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls.every(t => t.status == 200)).toBe(true);
    expect(calls[0]!.at).toBeGreaterThanOrEqual(0);
    expect(calls[0]!.at).toBeLessThan(5000);
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
    // every recorded call has the 401, in firing order
    const calls = c.websocket?.triggerCalls ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(calls.every(t => t.status == 401)).toBe(true);
    expect(calls.map(t => t.at)).toEqual([...calls.map(t => t.at)].sort((a, b) => a - b));
  });

  it('returns an error case naming the trigger request when it cannot be resolved', { timeout: 60000 }, async () => {
    const record = await runCollection({ collection: collection(), action: 'watch-missing.frreq' }, secrets);
    expect(record.cases[0]!.outcome).toBe('error');
    expect(record.cases[0]!.error).toContain("'nope.frreq'");
  });

  it('gives a websocket case and its trigger the values captured earlier in the run', { timeout: 60000 }, async () => {
    chain.triggered = [];
    const record = await runCollection({ collection: collection(), folder: 'chain' }, secrets);
    expect(record.cases.map(c => [c.name, c.outcome])).toEqual([['mint', 'pass'], ['watch-token', 'pass']]);
    expect(record.cases[0]!.captured).toEqual(['token']);
    // url, header and message of the websocket case
    expect(chain.upgradeUrl).toBe('/chain/tok-42');
    expect(chain.upgradeToken).toBe('tok-42');
    expect(chain.message).toBe('hello tok-42');
    expect(record.cases[1]!.request?.url).toContain('/chain/tok-42');
    // the trigger request resolved with the captured value; the expect schema's const was substituted too
    expect(chain.triggered.length).toBeGreaterThanOrEqual(1);
    expect(chain.triggered.every(id => id == 'tok-42')).toBe(true);
    expect(record.cases[1]!.websocket?.messages[0]?.text).toBe('{"id":"tok-42"}');
  });

  it('runs the websocket case without the captured value when it runs alone', { timeout: 60000 }, async () => {
    chain.triggered = [];
    const record = await runCollection({ collection: collection(), action: 'chain/2-watch.frreq', timeout: 800 }, secrets);
    // nothing captured: {{token}} is empty everywhere, so the pushed {"id":""} matches the substituted const
    expect(chain.upgradeUrl).toBe('/chain/');
    expect(chain.triggered.every(id => id == '')).toBe(true);
    expect(record.cases[0]!.outcome).toBe('pass');
  });

  it('passes the captured-value chain through the MCP run tool', { timeout: 60000 }, async () => {
    const client = await connectMcp({ secrets });
    const run = await call(client, 'run', { collection: collection(), folder: 'chain' });
    expect(run.isError, run.text).toBe(false);
    expect(run.json()).toMatchObject({ passed: 2, failed: 0 });
  });

  it('passes through the MCP run tool', { timeout: 60000 }, async () => {
    const client = await connectMcp({ secrets });
    const run = await call(client, 'run', { collection: collection(), action: 'watch-touch.frreq' });
    expect(run.isError).toBe(false);
    expect(run.json()).toMatchObject({ passed: 1, failed: 0 });
  });
});
