import { describe, it, expect } from 'vitest';
import { buildRequestUrl } from '../src';

const p = (key: string, value: string, active = true) => ({ key, value, active, id: key });

describe('buildRequestUrl', () => {
    it('appends active, non-empty parameters; later keys win', () => {
        expect(buildRequestUrl('api.example.com/items', [p('a', '1'), p('b', ''), p('c', '3', false), p('a', '2')])).toBe('api.example.com/items?a=2');
    });

    it('keeps {{variables}}, slashes and URL punctuation readable', () => {
        expect(buildRequestUrl('{{host}}/v1/items', [p('q', 'a b'), p('filter', '{{f}}'), p('r', 'x/y?z=1'), p('at', 'me@x:1,$;')]))
            .toBe('{{host}}/v1/items?q=a+b&filter={{f}}&r=x/y?z=1&at=me@x:1,$;');
    });

    it('escapes & and + in values, and parentheses in the path', () => {
        expect(buildRequestUrl('host/a(b)', [p('v', 'x&y+z')])).toBe('host/a%28b%29?v=x%26y%2Bz');
    });

    it('returns the bare url when there are no parameters', () => {
        expect(buildRequestUrl('host/path', [])).toBe('host/path');
    });
});
