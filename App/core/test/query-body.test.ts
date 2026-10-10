import { describe, it, expect } from 'vitest';
import { caseBody, QueryError } from '../src';
import { fixtureRun } from './fixtures/run-record';

const withBody = (text: string | undefined, base64?: string) => {
  const r = fixtureRun();
  r.cases[0].response!.body = { contentType: 'application/json', bytes: 10, ...(text !== undefined ? { text } : {}), ...(base64 ? { base64 } : {}) };
  return r;
};

describe('caseBody', () => {
  it('returns response text by default', () => {
    const b = caseBody(fixtureRun(), 1);
    expect(b).toMatchObject({ index: 1, name: 'Create Pet', side: 'response', contentType: 'application/json', encoding: 'text', truncated: false, content: '{"id":1,"name":"Rex"}' });
  });
  it('returns the request body', () => {
    expect(caseBody(fixtureRun(), 1, { request: true })).toMatchObject({ side: 'request', content: 'hello', bytes: 5 });
  });
  it('errors when the side has no body', () => {
    expect(() => caseBody(fixtureRun(), 2)).toThrow(new QueryError('Case 2 has no response body'));
    expect(() => caseBody(fixtureRun(), 3, { request: true })).toThrow('Case 3 has no request body');
  });
  it('returns base64 bodies in plain mode', () => {
    const b = caseBody(withBody(undefined, 'AAEC'), 1);
    expect(b).toMatchObject({ encoding: 'base64', content: 'AAEC' });
  });
  it('applies path', () => {
    const b = caseBody(fixtureRun(), 1, { path: '$.name' });
    expect(b).toMatchObject({ encoding: 'json', content: ['Rex'], truncated: false });
  });
  it('errors for path or outline on non-JSON', () => {
    expect(() => caseBody(fixtureRun(), 1, { request: true, path: '$.a' })).toThrow('Body is not JSON');
    expect(() => caseBody(withBody(undefined, 'AAEC'), 1, { outline: true })).toThrow('Body is not JSON');
  });
  it('errors on unsupported path', () => {
    expect(() => caseBody(fixtureRun(), 1, { path: '$..x' })).toThrow('Unsupported path');
  });
  it('outlines structure', () => {
    const r = withBody(JSON.stringify({ n: 42, b: true, z: null, s: 'a'.repeat(40), list: [{ id: 1 }, { id: 2 }], empty: [] }));
    expect(caseBody(r, 1, { outline: true })).toMatchObject({
      encoding: 'json',
      content: {
        n: 'number 42', b: 'boolean true', z: 'null', s: `string "${'a'.repeat(30)}…"`,
        list: { $array: 2, item: { id: 'number 1' } }, empty: { $array: 0 }
      }
    });
  });
  it('outlines short strings whole, without an ellipsis', () => {
    const r = withBody(JSON.stringify({ short: 'abc', exact: 'b'.repeat(30) }));
    expect(caseBody(r, 1, { outline: true }).content).toEqual({
      short: 'string "abc"', exact: `string "${'b'.repeat(30)}"`
    });
  });
  it('outlines a 31-char string as its first 30 chars plus ellipsis', () => {
    const r = withBody(JSON.stringify({ long: 'c'.repeat(31) }));
    expect(caseBody(r, 1, { outline: true }).content).toEqual({ long: `string "${'c'.repeat(30)}…"` });
  });
  it('limits outline depth to 6', () => {
    const r = withBody(JSON.stringify({ a: { b: { c: { d: { e: { f: { g: 1 } } } } } } }));
    const c = caseBody(r, 1, { outline: true }).content as any;
    expect(c.a.b.c.d.e.f).toBe('…');
  });
  it('slices a character range', () => {
    expect(caseBody(fixtureRun(), 1, { range: [1, 5] })).toMatchObject({ content: '"id"', encoding: 'text' });
  });
  it('rejects range on base64', () => {
    expect(() => caseBody(withBody(undefined, 'AAEC'), 1, { range: [0, 1] })).toThrow(QueryError);
  });
  it('truncates over the cap unless full', () => {
    const b = caseBody(fixtureRun(), 1, { cap: 5 });
    expect(b).toMatchObject({ content: '{"id"', truncated: true });
    expect(caseBody(fixtureRun(), 1, { cap: 5, full: true })).toMatchObject({ truncated: false, content: '{"id":1,"name":"Rex"}' });
  });
  it('applies the default 32768 cap when no cap is given', () => {
    const r = withBody('x'.repeat(40000));
    const b = caseBody(r, 1);
    expect(b).toMatchObject({ truncated: true });
    expect(b.content).toHaveLength(32768);
  });
  it('truncates serialised json', () => {
    const b = caseBody(fixtureRun(), 1, { path: '$', cap: 6 });
    expect(b).toMatchObject({ encoding: 'json', truncated: true, content: '[{"id"' });
  });
});
