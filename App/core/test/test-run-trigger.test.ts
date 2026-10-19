import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FakeSocket, TRIGGER_FINISH_GRACE_MS, TriggerFirer, TriggerOutcome, fireTriggerRequest, runWebSocketTest } from '../src/websocket';
import { ExecuteRestAction } from '../src/builder';
import { HttpProtocol, RestTypeVerb } from '../src/model';
import { newBuiltIns, substituteDeep } from '../src/substitution';
import { CreateEmptyWebSocketExpect, WebSocketExpect } from '../src/model';

const schema = { schema: JSON.stringify({ type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' } } }) };
const ex = (o: Partial<WebSocketExpect> = {}): WebSocketExpect => ({ ...CreateEmptyWebSocketExpect(), schema, timeout: 10000, settle: 0, ...o });
const good = '{"ok":true}';

const firer = (o: Partial<TriggerFirer> = {}, call: (signal?: AbortSignal) => Promise<TriggerOutcome> = async () => ({ status: 200, ms: 1 })) => {
  const f = { repeat: 'until-done', interval: 1000, delay: 0, fire: vi.fn(call), ...o } as TriggerFirer & { fire: ReturnType<typeof vi.fn> };
  return f;
};
const start = (s: FakeSocket, trigger?: TriggerFirer, e: WebSocketExpect = ex()) =>
  runWebSocketTest(s, { url: 'wss://x', headers: {}, message: 'hi', expect: e, trigger });
const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

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
    expect(r.triggerCalls).toEqual([{ at: 500, status: 200, ms: 1 }]);
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
    expect(r.triggerCalls.map(c => c.at)).toEqual([0, 1000, 2000]);
  });

  it('stops firing once the count is reached while settling for extras', async () => {
    // Every firing provokes one message: firing on through the settle window would fail the test
    const s = new FakeSocket();
    const f = firer({ interval: 100 }, async () => { s.push(good); return { status: 200, ms: 1 }; });
    const p = start(s, f, ex({ count: 1, match: 'any', extras: 'fail', settle: 500 }));
    await tick(2000);
    const r = await p;
    expect(r.errors).toEqual([]);
    expect(r.passed).toBe(true);
    expect(f.fire).toHaveBeenCalledTimes(1);
    expect(r.triggerCalls).toEqual([{ at: 0, status: 200, ms: 1 }]);
  });

  it('records the call that caused the pass before resolving', async () => {
    const s = new FakeSocket();
    const f = firer({ repeat: 'once' }, async () => { s.push(good); await sleep(200); return { status: 202, ms: 200 }; });
    const p = start(s, f);
    let resolved = false;
    void p.then(() => { resolved = true; });
    await tick(0);
    expect(resolved).toBe(false); // waiting for the in-flight call
    await tick(200);
    const r = await p;
    expect(r.passed).toBe(true);
    expect(r.triggerCalls).toEqual([{ at: 0, status: 202, ms: 200 }]);
    const snapshot = JSON.stringify(r);
    await tick(5000);
    expect(JSON.stringify(r)).toBe(snapshot);
  });

  it('records a call still pending after the finish grace as pending and aborts it', async () => {
    const s = new FakeSocket();
    let signal: AbortSignal | undefined;
    const f = firer({ repeat: 'once' }, sig => { signal = sig; s.push(good); return new Promise(() => { /* hangs */ }); });
    const p = start(s, f);
    await tick(TRIGGER_FINISH_GRACE_MS);
    const r = await p;
    expect(r.passed).toBe(true);
    expect(signal?.aborted).toBe(true);
    expect(r.triggerCalls).toEqual([{ at: 0, error: 'still pending when the test finished', ms: TRIGGER_FINISH_GRACE_MS }]);
  });

  it('times out a hanging trigger call and aborts it', async () => {
    const s = new FakeSocket();
    let signal: AbortSignal | undefined;
    const f = firer({ interval: 100 }, sig => { signal = sig; return new Promise(() => { /* hangs */ }); });
    const p = start(s, f, ex({ timeout: 30000 }));
    await tick(10000);
    expect(signal?.aborted).toBe(true);
    await tick(100);
    expect(f.fire).toHaveBeenCalledTimes(2);
    s.push(good);
    await tick(TRIGGER_FINISH_GRACE_MS);
    const r = await p;
    expect(r.triggerCalls[0]).toEqual({ at: 0, error: 'timed out after 10000ms', ms: 10000 });
  });

  it('says the trigger call is still pending when the test times out on it', async () => {
    const s = new FakeSocket();
    const f = firer({ repeat: 'once' }, () => new Promise(() => { /* hangs */ }));
    const p = start(s, f, ex({ timeout: 2000 }));
    await tick(2000 + TRIGGER_FINISH_GRACE_MS);
    const r = await p;
    expect(r.errors[0]).toBe('Timed out after 2000ms with 0 of 1 expected messages; trigger call still pending');
    expect(r.triggerCalls.length).toBe(1);
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

  it('keeps a fixed beat: the next firing is interval after the previous one started', async () => {
    const s = new FakeSocket();
    const f = firer({ interval: 1000 }, async () => { await sleep(300); return { status: 200, ms: 300 }; });
    const p = start(s, f, ex({ timeout: 10000 }));
    await tick(3500);
    s.push(good);
    await tick(500);
    const r = await p;
    expect(r.triggerCalls.map(c => c.at)).toEqual([0, 1000, 2000, 3000]);
  });

  it('clamps an interval below 100ms at run time', async () => {
    const s = new FakeSocket();
    const f = firer({ interval: 1 });
    const p = start(s, f, ex({ timeout: 1000 }));
    await tick(1000);
    await p;
    expect(f.fire.mock.calls.length).toBeLessThanOrEqual(11);
  });

  it('treats a non-numeric interval as the minimum', async () => {
    const s = new FakeSocket();
    const f = firer({ interval: NaN });
    const p = start(s, f, ex({ timeout: 500 }));
    await tick(500);
    await p;
    expect(f.fire.mock.calls.length).toBeLessThanOrEqual(6);
  });

  it('never overlaps a slow fire and fires right after an overrun', async () => {
    const s = new FakeSocket();
    let inFlight = 0, maxInFlight = 0;
    const f = firer({ interval: 100 }, async () => {
      inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
      await sleep(1000);
      inFlight--;
      return { status: 200, ms: 1000 };
    });
    const p = start(s, f);
    await tick(0);
    await tick(999);
    expect(f.fire).toHaveBeenCalledTimes(1);
    await tick(1);
    await tick(5);
    expect(f.fire).toHaveBeenCalledTimes(2);
    await tick(3000);
    expect(maxInFlight).toBe(1);
    s.push(good);
    await tick(1000);
    await p;
  });

  it('does not fire after finish when a fire is in flight, and records that call', async () => {
    const s = new FakeSocket();
    const f = firer({ interval: 100 }, async () => { await sleep(500); return { status: 200, ms: 500 }; });
    const p = start(s, f);
    await tick(100);
    s.push(good);
    await tick(400);
    const r = await p;
    await tick(5000);
    expect(f.fire).toHaveBeenCalledTimes(1);
    expect(r.triggerCalls).toEqual([{ at: 0, status: 200, ms: 500 }]);
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
    const f = firer({}, async () => ({ status: 404, ms: 1 }));
    const p = start(s, f, ex({ timeout: 2500 }));
    await tick(2500);
    const r = await p;
    expect(r.errors[0]).toContain('trigger returned 404 on all 3 calls');
  });

  it('names an erroring trigger in the timeout error', async () => {
    const s = new FakeSocket();
    const f = firer({ repeat: 'once' }, async () => ({ error: 'ECONNREFUSED', ms: 1 }));
    const p = start(s, f, ex({ timeout: 500 }));
    await tick(500);
    expect((await p).errors[0]).toContain('trigger returned ECONNREFUSED on all 1 calls');
  });

  it('summarises mixed failures by count per status or error', async () => {
    const s = new FakeSocket();
    const results = [{ status: 500, ms: 1 }, { status: 401, ms: 1 }, { status: 500, ms: 1 }];
    let n = 0;
    const f = firer({}, async () => results[n++]);
    const p = start(s, f, ex({ timeout: 2500 }));
    await tick(2500);
    const r = await p;
    expect(r.errors[0]).toContain('trigger returned 500 ×2, 401 ×1 across 3 calls');
    expect(r.errors[0]).not.toContain('on all');
  });

  it('does not blame the trigger when some calls succeeded', async () => {
    const s = new FakeSocket();
    let n = 0;
    const f = firer({}, async () => ({ status: n++ == 0 ? 200 : 500, ms: 1 }));
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

describe('fireTriggerRequest', () => {
  it('substitutes the request afresh on every firing, so built-ins differ', async () => {
    const urls: string[] = [];
    const execute = (async (r: { url: string }) => { urls.push(r.url); return { status: 200 }; }) as any;
    const request = new ExecuteRestAction({
      verb: RestTypeVerb.get, protocol: HttpProtocol.https, url: 'x.test/{{$guid}}', headers: {}, body: {},
      authentication: undefined, secrets: undefined, variables: undefined, validation: undefined
    });
    await fireTriggerRequest(request, undefined, execute);
    await fireTriggerRequest(request, undefined, execute);
    expect(urls[0]).toMatch(/^x\.test\/[0-9a-f-]{36}$/);
    expect(urls[1]).toMatch(/^x\.test\/[0-9a-f-]{36}$/);
    expect(urls[0]).not.toBe(urls[1]);
  });
});

describe('replaceVariables', () => {
  it('shares one guid with other values when given the same built-ins', () => {
    const request = new ExecuteRestAction({
      verb: RestTypeVerb.get, protocol: HttpProtocol.https, url: 'x/{{$guid}}', headers: { h: '{{$guid}}' }, body: {},
      authentication: undefined, secrets: undefined, variables: undefined, validation: undefined
    });
    const builtins = newBuiltIns();
    const replaced = request.replaceVariables(builtins);
    expect(substituteDeep('{{$guid}}', undefined, undefined, builtins)).toBe(replaced.headers['h']);
    expect(replaced.url).toBe('x/' + replaced.headers['h']);
  });
});
