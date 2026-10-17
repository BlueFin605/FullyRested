import { describe, expect, it } from 'vitest';
import { MemoryCollectionSink } from '../src/collection-sink';
import { move, remove, rename } from '../src/authoring';
import { files } from './fixtures/collection';

const guid = { generateGUID: () => 'g' };
const secrets = { get: async () => null, set: async () => { } };
const ctxFor = (sink: MemoryCollectionSink) => ({ collectionFile: 'api.frcol', source: sink, sink, secrets, guid });
const WS_FILE = 'orders/stream.frreq';
const trigger = (sink: MemoryCollectionSink, file = WS_FILE) => JSON.parse(sink.files.get(file)!).trigger;

// users/get.frreq is the trigger target of orders/stream.frreq
const setup = () => new MemoryCollectionSink({
    ...files,
    [WS_FILE]: JSON.stringify({
        id: 'w1', name: 'Stream', verb: 'get', url: 'wss://x/s', type: 'websocket', message: '',
        trigger: { request: 'users/get.frreq', run: 'n1', repeat: 'until-done', interval: 1000, delay: 0 }
    })
});

describe('a websocket trigger follows its target', () => {
    it('is rewritten when the target request is renamed', async () => {
        const sink = setup();
        const result = await rename(ctxFor(sink), 'request:users/get.frreq', 'fetch');

        expect(trigger(sink)).toEqual({ request: 'users/fetch.frreq', run: 'n1', repeat: 'until-done', interval: 1000, delay: 0 });
        expect(result.message).toContain('updated the trigger of 1 websocket request');
    });

    it('is rewritten when the target request is moved', async () => {
        const sink = setup();
        await move(ctxFor(sink), 'request:users/get.frreq', 'misc/get.frreq');

        expect(trigger(sink).request).toBe('misc/get.frreq');
    });

    it('is rewritten when the folder holding the target is renamed or moved', async () => {
        const renamed = setup();
        await rename(ctxFor(renamed), 'folder:users', 'people');
        expect(trigger(renamed).request).toBe('people/get.frreq');

        const moved = setup();
        await move(ctxFor(moved), 'folder:users', 'archive/users');
        expect(trigger(moved).request).toBe('archive/users/get.frreq');
    });

    it('is rewritten in a websocket request that itself moves with its folder', async () => {
        const sink = setup();
        await move(ctxFor(sink), 'folder:orders', 'sales');
        expect(trigger(sink, 'sales/stream.frreq').request).toBe('users/get.frreq');

        await rename(ctxFor(sink), 'request:users/get.frreq', 'fetch');
        expect(trigger(sink, 'sales/stream.frreq').request).toBe('users/fetch.frreq');
    });

    it('warns, naming the websocket request, when the target is deleted', async () => {
        const sink = setup();
        const result = await remove(ctxFor(sink), 'request:users/get.frreq');
        expect(result.message).toContain('warning');
        expect(result.message).toContain(WS_FILE);
    });

    it('warns when the folder holding the target is deleted, but not for a trigger inside that folder', async () => {
        const sink = setup();
        const result = await remove(ctxFor(sink), 'folder:users');
        expect(result.message).toContain(WS_FILE);

        const clean = await remove(ctxFor(setup()), 'folder:orders');
        expect(clean.message).not.toContain('warning');
    });
});
