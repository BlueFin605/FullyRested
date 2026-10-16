import { describe, it, expect } from 'vitest';
import { FakeSocket, SocketConnectError } from '../src/websocket';

describe('FakeSocket', () => {
  it('records the connect url and headers', async () => {
    const s = new FakeSocket();
    await s.connect('wss://x/y', { authorization: 'Bearer t' });
    expect(s.connectedUrl).toBe('wss://x/y');
    expect(s.connectedHeaders).toEqual({ authorization: 'Bearer t' });
  });

  it('delivers pushed messages in order to every handler', async () => {
    const s = new FakeSocket();
    const a: string[] = [];
    const b: string[] = [];
    s.onMessage(m => a.push(m));
    s.onMessage(m => b.push(m));
    await s.connect('wss://x', {});
    s.push('one');
    s.push('two');
    expect(a).toEqual(['one', 'two']);
    expect(b).toEqual(['one', 'two']);
  });

  it('closes with a code and reason, once, and drops later pushes', async () => {
    const s = new FakeSocket();
    const closes: [number, string][] = [];
    const got: string[] = [];
    s.onClose((c, r) => closes.push([c, r]));
    s.onMessage(m => got.push(m));
    await s.connect('wss://x', {});
    s.serverClose(4001, 'bye');
    s.serverClose(1000);
    s.push('late');
    expect(closes).toEqual([[4001, 'bye']]);
    expect(got).toEqual([]);
  });

  it('reports a client close request through onClose', async () => {
    const s = new FakeSocket();
    const closes: [number, string][] = [];
    s.onClose((c, r) => closes.push([c, r]));
    await s.connect('wss://x', {});
    s.close(1000, 'done');
    expect(s.closeRequest).toEqual({ code: 1000, reason: 'done' });
    expect(closes).toEqual([[1000, 'done']]);
  });

  it('fails a connect with the given error and stays closed', async () => {
    const s = new FakeSocket();
    s.failConnectWith = new SocketConnectError('Unexpected server response: 401', 401);
    await expect(s.connect('wss://x', {})).rejects.toMatchObject({ name: 'SocketConnectError', status: 401 });
    expect(s.isOpen).toBe(false);
    expect(() => s.send('hi')).toThrow('not open');
  });

  it('records sent text and throws on send after close', async () => {
    const s = new FakeSocket();
    await s.connect('wss://x', {});
    s.send('hello');
    expect(s.sent).toEqual(['hello']);
    s.serverClose(1001);
    expect(() => s.send('again')).toThrow('not open');
  });

  it('passes errors to error handlers', async () => {
    const s = new FakeSocket();
    const errs: string[] = [];
    s.onError(e => errs.push(e.message));
    s.raiseError(new Error('boom'));
    expect(errs).toEqual(['boom']);
  });
});
