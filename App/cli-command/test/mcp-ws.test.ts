import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { AddressInfo } from 'net';
import { WebSocketServer, WebSocket } from 'ws';
import { callTool as call, connectMcp, request } from './fixture';
import { createSecretStore, secretEnvironmentVariable } from '../src/secret-store';

const TOKEN = 'sekret-token-value';
const secrets = createSecretStore({ [secretEnvironmentVariable('tok')]: TOKEN }, undefined);
const GREETING = '{"hello":true}';

let server: http.Server;
let wss: WebSocketServer;
let base = '';
let folder = '';
let upgradeUrls: string[] = [];

// Greets, echoes every frame, and closes with 1000 'done' after "bye"
beforeAll(async () => {
  server = http.createServer();
  wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    upgradeUrls.push(req.url ?? '');
    // A server that accepts the socket and never says a word, to time a test out
    if ((req.url ?? '').startsWith('/silent')) {
      wss.handleUpgrade(req, socket, head, () => { });
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
      ws.send(GREETING);
      ws.on('message', data => {
        const text = data.toString();
        ws.send(text);
        if (text == 'bye') ws.close(1000, 'done');
      });
    });
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  base = `ws://127.0.0.1:${(server.address() as AddressInfo).port}`;

  folder = fs.mkdtempSync(path.join(os.tmpdir(), 'fullyrested-mcp-ws-'));
  fs.writeFileSync(path.join(folder, 'api.frcol'), JSON.stringify({
    collectionGuid: 'col-ws',
    selectedEnvironmentId: 'dev',
    collectionEnvironment: {
      name: 'system.settings',
      variables: [{ variable: 'base', value: base, active: true, id: '1' }],
      secrets: [{ $secret: 'tok', active: true, id: 's' }],
      auth: { authentication: 'none' }
    },
    environments: [{ name: 'Dev', id: 'dev', variables: [], secrets: [], auth: { authentication: 'inherit' } }]
  }));
  fs.writeFileSync(path.join(folder, 'chat.frreq'), JSON.stringify(request('w1', 'chat', '{{base}}/chat', {
    type: 'websocket', message: '{"ping":1}', headers: [],
    authentication: { authentication: 'bearertoken', bearerToken: { token: '{{$tok}}' }, placement: 'token' },
    expect: { count: 2, timeout: 3000 }
  })));
  fs.writeFileSync(path.join(folder, 'silent.frreq'), JSON.stringify(request('w9', 'silent', '{{base}}/silent', {
    type: 'websocket', message: '{"ping":1}', headers: [], authentication: { authentication: 'inherit' },
    expect: { count: 1, timeout: 20000 }
  })));
});

afterAll(async () => {
  for (const c of wss.clients) c.terminate();
  wss.close();
  await new Promise<void>(r => server.close(() => r()));
  fs.rmSync(folder, { recursive: true, force: true });
});

const collection = () => path.join(folder, 'api.frcol');
const connect = () => connectMcp({ secrets });

async function eventually<T>(read: () => Promise<T>, ok: (v: T) => boolean): Promise<T> {
  for (let i = 0; i < 100; i++) {
    const v = await read();
    if (ok(v)) return v;
    await new Promise(r => setTimeout(r, 25));
  }
  throw new Error('timed out waiting for events');
}

describe('mcp websocket session tools', () => {
  it('opens from a url, reads events by cursor, sends, and closes with the close code', async () => {
    const client = await connect();
    const open = await call(client, 'ws_session_open', { target: `${base}/plain` });
    expect(open.isError).toBe(false);
    const { sessionId } = open.json();
    expect(typeof sessionId).toBe('string');

    const first = await eventually(async () => (await call(client, 'ws_session_events', { sessionId })).json(), r => r.events.length >= 1);
    expect(first.events[0]).toMatchObject({ kind: 'message', text: GREETING });
    expect(first.closed).toBe(false);

    expect((await call(client, 'ws_session_send', { sessionId, message: 'hi' })).json()).toEqual({ sent: true });
    const next = await eventually(async () => (await call(client, 'ws_session_events', { sessionId, after: first.cursor })).json(), r => r.events.length >= 1);
    expect(next.events.map((e: { text: string }) => e.text)).toEqual(['hi']);
    expect(next.cursor).toBeGreaterThan(first.cursor);

    const none = (await call(client, 'ws_session_events', { sessionId, after: next.cursor })).json();
    expect(none.events).toEqual([]);

    const closed = await call(client, 'ws_session_close', { sessionId });
    expect(closed.json()).toMatchObject({ closed: true, code: 1000 });
  });

  it('returns an error result, not a throw, when sending to a session the server closed', async () => {
    const client = await connect();
    const { sessionId } = (await call(client, 'ws_session_open', { target: `${base}/plain` })).json();
    await call(client, 'ws_session_send', { sessionId, message: 'bye' });
    const read = await eventually(async () => (await call(client, 'ws_session_events', { sessionId })).json(), r => r.closed);
    expect(read.events[read.events.length - 1]).toMatchObject({ kind: 'close', code: 1000, reason: 'done' });

    const sent = await call(client, 'ws_session_send', { sessionId, message: 'late' });
    expect(sent.isError).toBe(true);
    expect(sent.text).toMatch(/closed/i);

    expect((await call(client, 'ws_session_close', { sessionId })).json()).toEqual({ closed: true, code: 1000, reason: 'done' });
  });

  it('reports an unknown session as an error result', async () => {
    const client = await connect();
    for (const name of ['ws_session_events', 'ws_session_close'])
      expect((await call(client, name, { sessionId: 'nope' })).isError, name).toBe(true);
    expect((await call(client, 'ws_session_send', { sessionId: 'nope', message: 'x' })).isError).toBe(true);
  });

  it('opens from a websocket request with a query token without ever returning the token', async () => {
    upgradeUrls = [];
    const client = await connect();
    const open = await call(client, 'ws_session_open', { target: 'chat.frreq', collection: collection() });
    expect(open.isError).toBe(false);
    expect(open.text).not.toContain(TOKEN);
    expect(upgradeUrls).toEqual([`/chat?token=${TOKEN}`]);
    const { sessionId } = open.json();
    const read = await eventually(async () => (await call(client, 'ws_session_events', { sessionId })).json(), r => r.events.length >= 1);
    expect(JSON.stringify(read)).not.toContain(TOKEN);
    await call(client, 'ws_session_close', { sessionId });
  });

  it('hides the token and url when the connect fails', async () => {
    const dead = await new Promise<number>(r => { const s = http.createServer().listen(0, '127.0.0.1', () => { const p = (s.address() as AddressInfo).port; s.close(() => r(p)); }); });
    const client = await connect();
    const open = await call(client, 'ws_session_open', { target: `ws://127.0.0.1:${dead}/x?token=${TOKEN}` });
    expect(open.isError).toBe(true);
    expect(open.text).toMatch(/Could not connect/);
    expect(open.text).not.toContain(TOKEN);
  });

  it('runs a websocket request through the existing run tool', async () => {
    const client = await connect();
    const run = await call(client, 'run', { collection: collection(), action: 'chat.frreq' });
    expect(run.isError).toBe(false);
    expect(run.text).not.toContain(TOKEN);
    expect(run.json()).toMatchObject({ passed: 1, failed: 0 });
  });

  it('timeoutMs overrides the wait for one run, without changing the saved request', async () => {
    const client = await connect();
    const file = path.join(folder, 'silent.frreq');
    const before = fs.readFileSync(file, 'utf8');
    const started = Date.now();
    const run = await call(client, 'run', { collection: collection(), action: 'silent.frreq', timeoutMs: 150 });
    expect(Date.now() - started).toBeLessThan(5000);
    expect(run.isError).toBe(false);
    expect(run.json()).toMatchObject({ passed: 0, failed: 1 });
    expect(run.text).toContain('Timed out');
    expect(fs.readFileSync(file, 'utf8')).toBe(before);
  });

  it.each([0, -1, 1.5])('rejects timeoutMs %s as an error result', async timeoutMs => {
    const client = await connect();
    const run = await call(client, 'run', { collection: collection(), action: 'silent.frreq', timeoutMs });
    expect(run.isError).toBe(true);
    expect(run.text).toMatch(/--timeout must be a positive whole number/);
  });
});
