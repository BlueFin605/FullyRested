import { describe, it, expect, afterEach } from 'vitest';
import * as http from 'http';
import { AddressInfo } from 'net';
import { WebSocketServer, WebSocket } from 'ws';
import { SocketConnectError } from '@fullyrested/core';
import { WsTransport } from '../src/ws-transport';

let server: http.Server;
let wss: WebSocketServer;
let upgradeHeaders: http.IncomingHttpHeaders | undefined;
let upgradeUrl: string | undefined;
let serverSockets: WebSocket[];

async function start(reject?: number): Promise<string> {
  serverSockets = [];
  upgradeHeaders = undefined;
  upgradeUrl = undefined;
  server = http.createServer();
  wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    upgradeHeaders = req.headers;
    upgradeUrl = req.url;
    if (reject) {
      socket.write(`HTTP/1.1 ${reject} Rejected\r\nContent-Length: 0\r\nConnection: close\r\n\r\n`);
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, ws => {
      serverSockets.push(ws);
      ws.on('message', (data, isBinary) => ws.send(data, { binary: isBinary }));
    });
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  return `ws://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

afterEach(async () => {
  for (const c of wss?.clients ?? []) c.terminate();
  wss?.close();
  await new Promise<void>(r => server?.close(() => r()));
});

describe('WsTransport', () => {
  it('connects, sends headers and the url query, and echoes a message', async () => {
    const base = await start();
    const t = new WsTransport();
    const got: string[] = [];
    t.onMessage(m => got.push(m));
    await t.connect(`${base}/chat?token=abc`, { 'X-Test': 'yes' });
    expect(upgradeHeaders?.['x-test']).toBe('yes');
    expect(upgradeUrl).toBe('/chat?token=abc');

    t.send('hello');
    await vi_waitFor(() => got.length === 1);
    expect(got).toEqual(['hello']);
    t.close();
  });

  it('receives server-pushed messages', async () => {
    const base = await start();
    const t = new WsTransport();
    const got: string[] = [];
    t.onMessage(m => got.push(m));
    await t.connect(base, {});
    serverSockets[0].send('pushed');
    await vi_waitFor(() => got.length === 1);
    expect(got).toEqual(['pushed']);
    t.close();
  });

  it('reports a client close with code and reason', async () => {
    const base = await start();
    const t = new WsTransport();
    const closed = new Promise<[number, string]>(r => t.onClose((c, reason) => r([c, reason])));
    await t.connect(base, {});
    t.close(1000, 'bye');
    expect(await closed).toEqual([1000, 'bye']);
    expect(() => t.send('late')).toThrow('Socket is not open');
  });

  it('reports a server close', async () => {
    const base = await start();
    const t = new WsTransport();
    const closed = new Promise<[number, string]>(r => t.onClose((c, reason) => r([c, reason])));
    await t.connect(base, {});
    serverSockets[0].close(4001, 'go away');
    expect(await closed).toEqual([4001, 'go away']);
  });

  it('maps a 401 handshake to SocketConnectError with status 401', async () => {
    const base = await start(401);
    const t = new WsTransport();
    const err = await t.connect(`${base}/?token=secret`, {}).then(() => undefined, e => e);
    expect(err).toBeInstanceOf(SocketConnectError);
    expect(err.status).toBe(401);
    expect(err.message).not.toContain('secret');
  });

  it('maps a 403 handshake to status 403', async () => {
    const base = await start(403);
    const err = await new WsTransport().connect(base, {}).then(() => undefined, e => e);
    expect(err).toBeInstanceOf(SocketConnectError);
    expect(err.status).toBe(403);
  });

  it('reports a refused connection as SocketConnectError without a status', async () => {
    const base = await start();
    await new Promise<void>(r => server.close(() => r()));
    const err = await new WsTransport().connect(base, {}).then(() => undefined, e => e);
    expect(err).toBeInstanceOf(SocketConnectError);
    expect(err.status).toBeUndefined();
  });
});

async function vi_waitFor(cond: () => boolean): Promise<void> {
  const end = Date.now() + 3000;
  while (!cond()) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise(r => setTimeout(r, 10));
  }
}
