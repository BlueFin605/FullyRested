import { describe, it, expect } from 'vitest';
import { FakeSocket, SocketConnectError, runWebSocketTest } from '../src/websocket';
import { CreateEmptyWebSocketExpect, WebSocketExpect } from '../src/model';

const schema = { schema: JSON.stringify({ type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' } } }) };
const ex = (o: Partial<WebSocketExpect> = {}): WebSocketExpect => ({ ...CreateEmptyWebSocketExpect(), schema, timeout: 200, settle: 40, ...o });
const run = (s: FakeSocket, e: WebSocketExpect, message?: string) => runWebSocketTest(s, { url: 'wss://x', headers: { a: 'b' }, message, expect: e });
const ready = () => new Promise(r => setTimeout(r, 0));
const good = '{"ok":true}';

describe('runWebSocketTest', () => {
  it('sends the message and passes when all N match', async () => {
    const s = new FakeSocket();
    const p = run(s, ex({ count: 2 }), 'hello');
    await ready();
    expect(s.sent).toEqual(['hello']);
    expect(s.connectedHeaders).toEqual({ a: 'b' });
    s.push(good); s.push(good);
    const r = await p;
    expect(r.passed).toBe(true);
    expect(r.messages.map(m => m.matched)).toEqual([true, true]);
    expect(s.isOpen).toBe(false);
  });

  it('fails at once on a non-matching message under all', async () => {
    const s = new FakeSocket();
    const p = run(s, ex({ count: 2 }));
    await ready();
    s.push('{"ok":"no"}');
    const r = await p;
    expect(r.passed).toBe(false);
    expect(r.errors[0]).toContain('did not match');
  });

  it('passes under any on one match; earlier non-matches are extras', async () => {
    const s = new FakeSocket();
    const p = run(s, ex({ match: 'any' }));
    await ready();
    s.push('{"ok":1}'); s.push(good);
    expect((await p).passed).toBe(true);
  });

  it('ignores extras by default', async () => {
    const s = new FakeSocket();
    const p = run(s, ex({ count: 1 }));
    await ready();
    s.push(good);
    expect((await p).passed).toBe(true);
    s.push('extra');
  });

  it('fails on a non-matching extra under any with extras fail', async () => {
    const s = new FakeSocket();
    const p = run(s, ex({ match: 'any', extras: 'fail' }));
    await ready();
    s.push('{"ok":1}');
    expect((await p).passed).toBe(false);
  });

  it('passes with extras fail when nothing arrives within settle', async () => {
    const s = new FakeSocket();
    const p = run(s, ex({ extras: 'fail' }));
    await ready();
    s.push(good);
    expect((await p).passed).toBe(true);
  });

  it('fails on a late extra inside settle', async () => {
    const s = new FakeSocket();
    const p = run(s, ex({ extras: 'fail', settle: 100 }));
    await ready();
    s.push(good);
    setTimeout(() => s.push(good), 20);
    const r = await p;
    expect(r.passed).toBe(false);
    expect(r.errors[0]).toContain('extra');
  });

  it('fails on timeout', async () => {
    const s = new FakeSocket();
    const r = await run(s, ex({ timeout: 30, count: 2 }));
    expect(r.passed).toBe(false);
    expect(r.errors[0]).toContain('Timed out');
  });

  it('does not match a non-JSON message', async () => {
    const s = new FakeSocket();
    const p = run(s, ex());
    await ready();
    s.push('not json');
    const r = await p;
    expect(r.passed).toBe(false);
    expect(r.messages[0].matched).toBe(false);
  });

  it('reports the close code when the server closes before count', async () => {
    const s = new FakeSocket();
    const p = run(s, ex({ count: 2 }));
    await ready();
    s.push(good);
    s.serverClose(1011, 'boom');
    const r = await p;
    expect(r.passed).toBe(false);
    expect(r.closeCode).toBe(1011);
    expect(r.errors[0]).toContain('1011');
    expect(r.errors[0]).toContain('boom');
  });

  it('fails with the reason when connect fails', async () => {
    const s = new FakeSocket();
    s.failConnectWith = new SocketConnectError('Unexpected server response: 401', 401);
    const r = await run(s, ex());
    expect(r.passed).toBe(false);
    expect(r.connectStatus).toBe(401);
    expect(r.errors[0]).toContain('401');
  });
});
