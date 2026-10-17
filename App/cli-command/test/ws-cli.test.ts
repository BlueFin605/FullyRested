import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { AddressInfo } from 'net';
import { WebSocketServer, WebSocket } from 'ws';
import { FsRunStore } from '../src/run-store';
import { runCollection, toTestResult, UsageError } from '../src/run';
import { sendToActiveSession, watchSession } from '../src/ws';
import { createSecretStore, secretEnvironmentVariable } from '../src/secret-store';
import { request } from './fixture';

const cli = path.resolve(__dirname, '..', 'dist', 'index.js');
const TOKEN = 'sekret-token-value';
const store = createSecretStore({ [secretEnvironmentVariable('tok')]: TOKEN }, undefined);
const GREETING = '{"hello":true}';
const PING = '{"ping":1}';
const quiet = { out: () => { }, warn: () => { } };

let server: http.Server;
let wss: WebSocketServer;
let base = '';
let folder = '';
let upgradeUrls: string[] = [];
let upgradeHeaders: http.IncomingHttpHeaders[] = [];

// Greets with "hello", echoes every frame, and closes with 1000 after "bye"
beforeAll(async () => {
  server = http.createServer();
  wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    upgradeUrls.push(req.url ?? '');
    upgradeHeaders.push(req.headers);
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

  folder = fs.mkdtempSync(path.join(os.tmpdir(), 'fullyrested-ws-'));
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
  const bearer = (placement: string) => ({
    authentication: 'bearertoken', bearerToken: { token: '{{$tok}}' }, placement
  });
  fs.writeFileSync(path.join(folder, 'chat.frreq'), JSON.stringify(request('w1', 'chat', '{{base}}/chat', {
    type: 'websocket', message: PING, headers: [],
    authentication: bearer('token'),
    expect: { count: 2, timeout: 3000 }
  })));
  fs.writeFileSync(path.join(folder, 'chat-header.frreq'), JSON.stringify(request('w2', 'chat-header', '{{base}}/chat', {
    type: 'websocket', message: PING, headers: [],
    authentication: bearer('header'),
    expect: { count: 1, timeout: 3000 }
  })));
  fs.writeFileSync(path.join(folder, 'strict.frreq'), JSON.stringify(request('w3', 'strict', '{{base}}/chat', {
    type: 'websocket', message: PING, headers: [], authentication: { authentication: 'inherit' },
    expect: { count: 1, match: 'all', timeout: 3000, schema: { schema: '{"type":"array"}' } }
  })));
  fs.writeFileSync(path.join(folder, 'silent.frreq'), JSON.stringify(request('w9', 'silent', '{{base}}/silent', {
    type: 'websocket', message: PING, headers: [], authentication: { authentication: 'inherit' },
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

function fullyrested(args: string[]): Promise<{ code: number; out: string; err: string }> {
  const env = { ...process.env, [secretEnvironmentVariable('tok')]: TOKEN };
  return new Promise(resolve => {
    execFile(process.execPath, [cli, ...args], { cwd: folder, env, encoding: 'utf8' }, (error, out, err) =>
      resolve({ code: error ? (error as { code?: number }).code ?? 1 : 0, out, err }));
  });
}

describe('run on a websocket request', () => {
  it('passes against a local server, puts a query token on the connect url, and records without the token', async () => {
    upgradeUrls = [];
    const record = await runCollection({ collection: collection(), action: 'chat.frreq' }, store);
    const c = record.cases[0]!;
    expect(c.outcome).toBe('pass');
    expect(c.websocket?.messages.map(m => m.text)).toEqual([GREETING, PING]);
    expect(c.request.method).toBe('WS');
    expect(c.request.body?.text).toBe(PING);
    expect(toTestResult(c)).toMatchObject({ name: 'chat', status: 'WS', passed: true, errors: [] });

    expect(upgradeUrls).toEqual([`/chat?token=${TOKEN}`]);
    expect(JSON.stringify(record)).not.toContain(TOKEN);
    expect(c.request.url).toBe(`${base}/chat`);
  });

  it('sends header-placed auth as a header and keeps the token out of the record', async () => {
    upgradeUrls = []; upgradeHeaders = [];
    const record = await runCollection({ collection: collection(), action: 'chat-header.frreq' }, store);
    expect(record.cases[0]!.outcome).toBe('pass');
    expect(upgradeUrls).toEqual(['/chat']);
    expect(upgradeHeaders[0]!.authorization).toBe(`Bearer ${TOKEN}`);
    expect(JSON.stringify(record)).not.toContain(TOKEN);
  });

  it('fails a request whose messages do not match the schema', async () => {
    const record = await runCollection({ collection: collection(), action: 'strict.frreq' }, store);
    expect(record.cases[0]!.outcome).toBe('fail');
    expect(toTestResult(record.cases[0]!).passed).toBe(false);
  });

  it('lands in the run store like an HTTP run (CLI --record)', async () => {
    const storeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fullyrested-wsstore-'));
    try {
      const r = await fullyrested(['run', '-c', collection(), '-a', 'chat.frreq', '--record', '--store', storeDir]);
      expect(r.out).toMatch(/^PASS chat WS \d+ms\n1 passed, 0 failed\nrecorded run \S+ in /);
      expect(r.code).toBe(0);
      const runs = new FsRunStore(storeDir);
      const saved = await runs.load((await runs.list())[0]!.runId);
      expect(saved?.cases[0]?.websocket?.messages.length).toBe(2);
      expect(JSON.stringify(saved)).not.toContain(TOKEN);
    } finally {
      fs.rmSync(storeDir, { recursive: true, force: true });
    }
  });
});

describe('run --timeout on a websocket request', () => {
  const silentFile = () => path.join(folder, 'silent.frreq');

  it('shortens the wait for this run only: the test times out fast and the file is unchanged', async () => {
    const before = fs.readFileSync(silentFile(), 'utf8');
    const started = Date.now();
    const record = await runCollection({ collection: collection(), action: 'silent.frreq', timeout: 150 }, store);
    expect(Date.now() - started).toBeLessThan(5000);
    expect(record.cases[0]!.outcome).toBe('fail');
    expect(record.cases[0]!.error).toContain('Timed out');
    expect(fs.readFileSync(silentFile(), 'utf8')).toBe(before);
  });

  it('can also lengthen it: a generous override lets a normal test pass', async () => {
    const record = await runCollection({ collection: collection(), action: 'chat.frreq', timeout: 10000 }, store);
    expect(record.cases[0]!.outcome).toBe('pass');
  });

  it.each([0, -5, 1.5, NaN])('rejects %s as a usage error before anything runs', async timeout => {
    await expect(runCollection({ collection: collection(), action: 'silent.frreq', timeout }, store))
      .rejects.toBeInstanceOf(UsageError);
    await expect(runCollection({ collection: collection(), action: 'silent.frreq', timeout }, store))
      .rejects.toThrow(/--timeout must be a positive whole number/);
  });

  it('warns that --timeout is ignored for an http request', async () => {
    fs.writeFileSync(path.join(folder, 'plain-t.frreq'), JSON.stringify(request('h2', 'plain-t', 'http://127.0.0.1:1/x')));
    const warnings: string[] = [];
    await runCollection({ collection: collection(), action: 'plain-t.frreq', timeout: 100 }, store, { onWarning: w => warnings.push(w) });
    expect(warnings).toContain('--timeout applies to websocket requests only; it is ignored for http requests');
  });

  it('works from the built CLI, and a bad value exits 2', async () => {
    const started = Date.now();
    const slow = await fullyrested(['run', '-c', collection(), '-a', 'silent.frreq', '--timeout', '150']);
    expect(Date.now() - started).toBeLessThan(8000);
    expect(slow.code).toBe(1);
    expect(slow.out).toContain('Timed out');

    for (const bad of ['0', '-3', '1.5', 'abc']) {
      const r = await fullyrested(['run', '-c', collection(), '-a', 'silent.frreq', '--timeout=' + bad]);
      expect(r.code, bad).toBe(2);
      expect(r.err, bad).toMatch(/--timeout must be a positive whole number/);
    }
  });
});

describe('ws watch', () => {
  it('ignores --timeout with a warning on stderr, and rejects a non-positive one', async () => {
    const warnings: string[] = [];
    await watchSession(`${base}/live`, { send: ['bye'], timeout: 100 }, store,
      { out: () => { }, warn: l => warnings.push(l) }, new AbortController().signal);
    expect(warnings).toEqual(['warning: --timeout ignored: ws watch is a live session with no expect to time out']);

    await expect(watchSession(`${base}/live`, { timeout: 0 }, store, quiet, new AbortController().signal))
      .rejects.toBeInstanceOf(UsageError);
  });

  it('streams events to out until the server closes the session', async () => {
    const lines: string[] = [];
    const warnings: string[] = [];
    const clean = await watchSession(`${base}/live`, { send: ['one', 'bye'] }, store,
      { out: l => lines.push(l), warn: l => warnings.push(l) }, new AbortController().signal);
    expect(clean).toBe(true);
    expect(lines).toEqual([GREETING, 'one', 'bye', '[closed 1000 done]']);
    expect(warnings).toEqual([]);
  });

  it('opens a websocket request from a collection with its query token', async () => {
    upgradeUrls = [];
    const lines: string[] = [];
    await watchSession('chat.frreq', { collection: collection(), send: ['bye'], json: true }, store,
      { out: l => lines.push(l), warn: () => { } }, new AbortController().signal);
    expect(upgradeUrls).toEqual([`/chat?token=${TOKEN}`]);
    expect(lines.map(l => JSON.parse(l).kind)).toEqual(['message', 'message', 'close']);
    expect(JSON.parse(lines[0]!)).toMatchObject({ seq: 1, kind: 'message', text: GREETING });
  });

  it('closes the session when interrupted', async () => {
    const stop = new AbortController();
    const lines: string[] = [];
    const done = watchSession(`${base}/live`, {}, store,
      { out: l => { lines.push(l); stop.abort(); }, warn: () => { } }, stop.signal);
    expect(await done).toBe(true);
    expect(lines[0]).toBe(GREETING);
    expect(lines[lines.length - 1]).toBe('[closed 1000]');
  });

  it('rejects a request that is not a websocket request, and a missing collection', async () => {
    fs.writeFileSync(path.join(folder, 'plain.frreq'), JSON.stringify(request('h1', 'plain', '{{base}}/x')));
    await expect(watchSession('plain.frreq', { collection: collection() }, store, quiet, new AbortController().signal))
      .rejects.toThrow(/not a websocket request/);
    await expect(watchSession('chat.frreq', {}, store, quiet, new AbortController().signal)).rejects.toBeInstanceOf(UsageError);
  });

  it('reports a failed connect without the url', async () => {
    await expect(watchSession('ws://127.0.0.1:1/never?token=abc', {}, store, quiet, new AbortController().signal))
      .rejects.toThrow(/^Could not connect: (?!.*token=abc)/);
  });
});

describe('ws send', () => {
  it('sends into the session this process is watching, and refuses once it is gone', async () => {
    const lines: string[] = [];
    await watchSession(`${base}/live`, {}, store, {
      out: l => { lines.push(l); if (l == GREETING) sendToActiveSession('bye'); },
      warn: () => { }
    }, new AbortController().signal);
    expect(lines).toEqual([GREETING, 'bye', '[closed 1000 done]']);
    expect(() => sendToActiveSession('late')).toThrow(UsageError);
  });
});

describe('ws commands (built CLI)', () => {
  it('watch writes only the event stream to stdout', async () => {
    const r = await fullyrested(['ws', 'watch', `${base}/live`, '--send', 'bye']);
    expect(r.code).toBe(0);
    expect(r.out).toBe(GREETING + '\nbye\n[closed 1000 done]\n');
    expect(r.err).toBe('');
  });

  it('watch reports a usage problem on stderr with exit 2', async () => {
    const r = await fullyrested(['ws', 'watch', 'chat.frreq']);
    expect(r.code).toBe(2);
    expect(r.out).toBe('');
    expect(r.err).toMatch(/^error: Give a ws:\/\//);
  });

  it('send in a separate process has no session to send into', async () => {
    const r = await fullyrested(['ws', 'send', 'hi']);
    expect(r.code).toBe(2);
    expect(r.out).toBe('');
    expect(r.err).toMatch(/No open session/);
  });
});
