import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FakeSocket, TriggerCall, TriggerFirer, runWebSocketTest } from '../src/websocket';
import { CreateEmptyWebSocketExpect, WebSocketExpect } from '../src/model';

const schema = { schema: JSON.stringify({ type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' } } }) };
const ex = (o: Partial<WebSocketExpect> = {}): WebSocketExpect => ({ ...CreateEmptyWebSocketExpect(), schema, timeout: 10000, settle: 0, ...o });
const good = '{"ok":true}';

const firer = (o: Partial<TriggerFirer> = {}, call: () => Promise<TriggerCall> = async () => ({ at: Date.now(), status: 200, ms: 1 })) => {
  const f = { repeat: 'until-done', interval: 1000, delay: 0, fire: vi.fn(call), ...o } as TriggerFirer & { fire: ReturnType<typeof vi.fn> };
  return f;
};
const start = (s: FakeSocket, trigger?: TriggerFirer, e: WebSocketExpect = ex()) =>
  runWebSocketTest(s, { url: 'wss://x', headers: {}, message: 'hi', expect: e, trigger });
const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms);

describe('runWebSocketTest trigger loop', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('fires after the message is sent and after the delay', async () => {
    const s = new FakeSocket(); const f = firer({ delay: 500 });
    const p = start(s, f);
    await tick(0);
    expect(s.sent).toEqual(['hi']);
    await tick(499);
    expect(f.fire).not.toHaveBeenCalled();
    await tick(1);
    expect(f.fire).toHaveBeenCalledTimes(1);
    s.push(good);
    const r = await p;
    expect(r.passed).toBe(true);
    expect(r.triggerCalls.length).toBe(1);
  });

  it('once fires exactly once', async () => {
    const s = new FakeSocket(); const f = firer({ repeat: 'once' });
    const p = start(s, f);
    await tick(10000 - 1);
    expect(f.fire).toHaveBeenCalledTimes(1);
    s.push(good);
    expect((await p).triggerCalls.length).toBe(1);
  });

  it('until-done repeats at the interval and stops on pass', async () => {
    const s = new FakeSocket(); const f = firer({ interval: 1000 });
    const p = start(s, f);
    await tick(0);
    expect(f.fire).toHaveBeenCalledTimes(1);
    await tick(1000);
    expect(f.fire).toHaveBeenCalledTimes(2);
    await tick(1000);
    expect(f.fire).toHaveBeenCalledTimes(3);
    s.push(good);
    const r = await p;
    await tick(5000);
    expect(f.fire).toHaveBeenCalledTimes(3);
    expect(r.triggerCalls.length).toBe(3);
  });

  it('stops on fail (match all mismatch)', async () => {
    const s = new FakeSocket(); const f = firer();
    const p = start(s, f);
    await tick(1000);
    s.push('{"ok":"no"}');
    expect((await p).passed).toBe(false);
    const n = f.fire.mock.calls.length;
    await tick(5000);
    expect(f.fire).toHaveBeenCalledTimes(n);
  });

  it('stops on timeout', async () => {
    const s = new FakeSocket(); const f = firer();
    const p = start(s, f, ex({ timeout: 2500 }));
    await tick(2500);
    const r = await p;
    expect(r.passed).toBe(false);
    const n = f.fire.mock.calls.length;
    expect(n).toBe(3);
    await tick(5000);
    expect(f.fire).toHaveBeenCalledTimes(n);
  });

  it('stops on server close', async () => {
    const s = new FakeSocket(); const f = firer();
    const p = start(s, f);
    await tick(1000);
    s.serverClose(1001);
    expect((await p).passed).toBe(false);
    const n = f.fire.mock.calls.length;
    await tick(5000);
    expect(f.fire).toHaveBeenCalledTimes(n);
  });

  it('never overlaps a slow fire and waits the interval after it settles', async () => {
    const s = new FakeSocket();
    let inFlight = 0, maxInFlight = 0;
    const f = firer({ interval: 100 }, async () => {
      inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise(r => setTimeout(r, 1000));
      inFlight--;
      return { at: 0, status: 200, ms: 1000 };
    });
    const p = start(s, f);
    await tick(0);
    await tick(1000);
    expect(f.fire).toHaveBeenCalledTimes(1);
    await tick(99);
    expect(f.fire).toHaveBeenCalledTimes(1);
    await tick(1);
    expect(f.fire).toHaveBeenCalledTimes(2);
    await tick(3000);
    expect(maxInFlight).toBe(1);
    s.push(good);
    await p;
  });

  it('does not fire after finish when a fire is in flight', async () => {
    const s = new FakeSocket();
    const f = firer({ interval: 100 }, async () => { await new Promise(r => setTimeout(r, 500)); return { at: 0, status: 200, ms: 500 }; });
    const p = start(s, f);
    await tick(100);
    s.push(good);
    await p;
    await tick(5000);
    expect(f.fire).toHaveBeenCalledTimes(1);
  });

  it('records a throwing fire as an error call', async () => {
    const s = new FakeSocket();
    const f = firer({ repeat: 'once' }, async () => { throw new Error('boom'); });
    const p = start(s, f);
    await tick(10);
    s.push(good);
    const r = await p;
    expect(r.triggerCalls[0].error).toBe('boom');
  });

  it('names an all-failed trigger in the timeout error', async () => {
    const s = new FakeSocket();
    const f = firer({}, async () => ({ at: 0, status: 404, ms: 1 }));
    const p = start(s, f, ex({ timeout: 2500 }));
    await tick(2500);
    const r = await p;
    expect(r.errors[0]).toContain('trigger returned 404 on all 3 calls');
  });

  it('names an erroring trigger in the timeout error', async () => {
    const s = new FakeSocket();
    const f = firer({ repeat: 'once' }, async () => ({ at: 0, error: 'ECONNREFUSED', ms: 1 }));
    const p = start(s, f, ex({ timeout: 500 }));
    await tick(500);
    expect((await p).errors[0]).toContain('trigger returned ECONNREFUSED on all 1 calls');
  });

  it('does not blame the trigger when some calls succeeded', async () => {
    const s = new FakeSocket();
    let n = 0;
    const f = firer({}, async () => ({ at: 0, status: n++ == 0 ? 200 : 500, ms: 1 }));
    const p = start(s, f, ex({ timeout: 2500 }));
    await tick(2500);
    expect((await p).errors[0]).not.toContain('trigger returned');
  });

  it('no trigger: empty triggerCalls and unchanged timeout message', async () => {
    const s = new FakeSocket();
    const p = start(s, undefined, ex({ timeout: 100 }));
    await tick(100);
    const r = await p;
    expect(r.triggerCalls).toEqual([]);
    expect(r.errors[0]).toBe('Timed out after 100ms with 0 of 1 expected messages');
  });
});
