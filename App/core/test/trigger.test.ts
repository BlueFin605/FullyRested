import { describe, it, expect } from 'vitest';
import { normaliseAction, normaliseTrigger, RestAction, WebSocketTrigger } from '../src';

const wsAction = () => ({ id: 'w', name: 'ws', type: 'websocket', url: 'wss://x/prod' }) as unknown as RestAction;

describe('websocket trigger', () => {
    it('leaves a request with no trigger unchanged', () => {
        expect(normaliseAction(wsAction()).trigger).toBeUndefined();
        const http = { id: 'h', name: 'h', url: 'https://x' } as unknown as RestAction;
        expect(normaliseAction(http).trigger).toBeUndefined();
    });

    it('fills defaults', () => {
        expect(normaliseTrigger({ request: 'poke' })).toEqual({ request: 'poke', repeat: 'until-done', interval: 1000, delay: 0 });
    });

    it('keeps given values', () => {
        const t: WebSocketTrigger = { request: 'poke', run: 'r1', repeat: 'once', interval: 250, delay: 100 };
        expect(normaliseTrigger({ ...t })).toEqual(t);
        expect(normaliseTrigger({ request: 'p', interval: undefined })).toMatchObject({ interval: 1000 });
    });

    it('normalises a trigger on a websocket action', () => {
        const a = wsAction();
        a.trigger = { request: 'poke' } as WebSocketTrigger;
        expect(normaliseAction(a).trigger).toEqual({ request: 'poke', repeat: 'until-done', interval: 1000, delay: 0 });
    });
});
