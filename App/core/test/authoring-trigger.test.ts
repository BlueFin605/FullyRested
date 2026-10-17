import { describe, expect, it } from 'vitest';
import { setTrigger, setType } from '../src/authoring';
import { MemoryCollectionSink } from '../src/collection-sink';
import { files } from './fixtures/collection';

const guid = { generateGUID: () => 'g' };
const secrets = { get: async () => null, set: async () => { } };
const ctxFor = (sink: MemoryCollectionSink) => ({ collectionFile: 'api.frcol', source: sink, sink, secrets, guid });
const WS = 'request:orders/stream.frreq';
const WS_FILE = 'orders/stream.frreq';
const HTTP = 'users/get.frreq';

async function setup() {
    const sink = new MemoryCollectionSink({
        ...files,
        'orders/stream.frreq': JSON.stringify({ id: 'w1', name: 'Stream', verb: 'get', url: 'wss://x/s' }),
        'orders/other.frreq': JSON.stringify({ id: 'w2', name: 'Other', verb: 'get', url: 'wss://x/o' })
    });
    await setType(ctxFor(sink), WS, 'websocket');
    await setType(ctxFor(sink), 'request:orders/other.frreq', 'websocket');
    return sink;
}
const trigger = (sink: MemoryCollectionSink) => JSON.parse(sink.files.get(WS_FILE)!).trigger;

describe('setTrigger', () => {
    it('names the real type when the trigger request is not http', async () => {
        const sink = await setup();
        await setType(ctxFor(sink), 'request:orders/other.frreq', 'mcp');
        await expect(setTrigger(ctxFor(sink), WS, { request: 'orders/other.frreq' })).rejects.toThrow('is a mcp request; a trigger must be http');
    });

    it('sets a trigger with defaults, then updates only the given fields', async () => {
        const sink = await setup();
        const result = await setTrigger(ctxFor(sink), WS, { request: HTTP });
        expect(result).toMatchObject({ file: WS_FILE, changed: true });
        expect(trigger(sink)).toEqual({ request: HTTP, repeat: 'until-done', interval: 1000, delay: 0 });

        await setTrigger(ctxFor(sink), WS, { run: 'not found', interval: 250 });
        expect(trigger(sink)).toEqual({ request: HTTP, run: 'not found', repeat: 'until-done', interval: 250, delay: 0 });

        await setTrigger(ctxFor(sink), WS, { repeat: 'once', delay: 50 });
        expect(trigger(sink)).toEqual({ request: HTTP, run: 'not found', repeat: 'once', interval: 250, delay: 50 });

        await setTrigger(ctxFor(sink), WS, { run: '' });
        expect(trigger(sink).run).toBeUndefined();
    });

    it('accepts a run by name or by id and stores it as given', async () => {
        const sink = await setup();
        await setTrigger(ctxFor(sink), WS, { request: HTTP, run: 'n1' });
        expect(trigger(sink).run).toBe('n1');
        await setTrigger(ctxFor(sink), WS, { run: 'not found' });
        expect(trigger(sink).run).toBe('not found');
    });

    it('accepts a request: prefix and reports no change when nothing differs', async () => {
        const sink = await setup();
        await setTrigger(ctxFor(sink), WS, { request: `request:${HTTP}` });
        const result = await setTrigger(ctxFor(sink), WS, { request: HTTP });
        expect(result.changed).toBe(false);
    });

    it('clears the trigger', async () => {
        const sink = await setup();
        await setTrigger(ctxFor(sink), WS, { request: HTTP });
        const result = await setTrigger(ctxFor(sink), WS, { clear: true });
        expect(result.changed).toBe(true);
        expect(trigger(sink)).toBeUndefined();
        expect((await setTrigger(ctxFor(sink), WS, { clear: true })).changed).toBe(false);
    });

    const refusals: [string, string, object][] = [
        ['an http scope', 'request:users/get.frreq', { request: 'orders/list.frreq' }],
        ['an unknown request', WS, { request: 'nope/missing.frreq' }],
        ['itself', WS, { request: WS_FILE }],
        ['a websocket target', WS, { request: 'orders/other.frreq' }],
        ['an unknown run', WS, { request: HTTP, run: 'nope' }],
        ['a bad repeat', WS, { request: HTTP, repeat: 'forever' }],
        ['interval under 100', WS, { request: HTTP, interval: 99 }],
        ['a non-integer interval', WS, { request: HTTP, interval: 150.5 }],
        ['a negative delay', WS, { request: HTTP, delay: -1 }],
        ['no fields', WS, {}],
        ['clear with other fields', WS, { clear: true, delay: 5 }],
        ['a first call with no request', WS, { delay: 5 }]
    ];
    it.each(refusals)('refuses %s and leaves the files untouched', async (_label, scope, fields) => {
        const sink = await setup();
        const before = new Map(sink.files);
        await expect(setTrigger(ctxFor(sink), scope, fields)).rejects.toThrow();
        expect(sink.files).toEqual(before);
    });

    it('refuses a bad value on an existing trigger without changing it', async () => {
        const sink = await setup();
        await setTrigger(ctxFor(sink), WS, { request: HTTP });
        const before = sink.files.get(WS_FILE);
        await expect(setTrigger(ctxFor(sink), WS, { interval: 10 })).rejects.toThrow(/interval/);
        expect(sink.files.get(WS_FILE)).toBe(before);
    });
});
