import { describe, it, expect } from 'vitest';
import { buildCaseRecord, toCaseOutcomeCounts, PreparedRequest, RestActionResult, ResponseValidation } from '../src';

const enc = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;
const req: PreparedRequest = { method: 'POST', url: 'https://x.test/a', headers: { 'Content-Type': 'application/json' }, body: '{"a":"é"}' };
const res = (over: Partial<RestActionResult> = {}): RestActionResult => ({
  status: 200, statusText: 'OK', headers: { h: '1' }, headersSent: {},
  body: { contentType: 'application/json', body: enc('{"ok":true}') }, validated: undefined, ...over
});
const base = { index: 0, name: 'n', requestFile: 'f.json', ms: 5 };

describe('buildCaseRecord', () => {
  it('records a JSON response as text and request body with byte length', () => {
    const r = buildCaseRecord({ ...base, request: req, response: res() });
    expect(r.outcome).toBe('pass');
    expect(r.response?.body).toEqual({ contentType: 'application/json', bytes: 11, text: '{"ok":true}' });
    expect(r.request.body).toEqual({ contentType: 'application/json', bytes: 10, text: '{"a":"é"}' });
    expect(r.request.method).toBe('POST');
  });
  it('records a PNG response as base64 that round-trips', () => {
    const bytes = new Uint8Array([0, 255, 128, 10, 137, 80]);
    const r = buildCaseRecord({ ...base, request: req, response: res({ body: { contentType: 'image/png', body: bytes.buffer } }) });
    const b = r.response!.body!;
    expect(b.text).toBeUndefined();
    expect(b.bytes).toBe(6);
    expect(Array.from(atob(b.base64!), c => c.charCodeAt(0))).toEqual(Array.from(bytes));
  });
  it('omits body for empty response body', () => {
    const r = buildCaseRecord({ ...base, request: req, response: res({ body: { contentType: 'text/plain', body: new ArrayBuffer(0) } }) });
    expect(r.response?.body).toBeUndefined();
  });
  it('prefers headersSent over request headers', () => {
    const r = buildCaseRecord({ ...base, request: req, response: res({ headersSent: { Authorization: 'x' } }) });
    expect(r.request.headers).toEqual({ Authorization: 'x' });
    const r2 = buildCaseRecord({ ...base, request: req, response: res() });
    expect(r2.request.headers).toEqual(req.headers);
  });
  it('treats a negative status as an error with no response message', () => {
    const r = buildCaseRecord({ ...base, request: req, response: res({ status: -1, statusText: 'ECONNREFUSED', body: undefined }) });
    expect(r.outcome).toBe('error');
    expect(r.error).toBe('No response: ECONNREFUSED');
    expect(r.response?.status).toBe(-1);
  });
  it('treats a string status as an error', () => {
    const r = buildCaseRecord({ ...base, request: req, response: res({ status: 'ERR_X', statusText: 'boom' }) });
    expect(r.outcome).toBe('error');
    expect(r.error).toBe('No response: boom');
  });
  it('resolve error: no request, outcome error', () => {
    const r = buildCaseRecord({ ...base, error: 'bad var' });
    expect(r.outcome).toBe('error');
    expect(r.error).toBe('bad var');
    expect(r.request).toEqual({ method: '', url: '', headers: {} });
    expect(r.response).toBeUndefined();
  });
  it('fail vs pass from validation, with checks', () => {
    const checks = [{ check: 'status' as const, passed: false, errors: ['e'] }];
    const bad: ResponseValidation = { information: [], errors: ['e'], valid: false, checks };
    const f = buildCaseRecord({ ...base, request: req, response: res(), validation: bad });
    expect(f.outcome).toBe('fail');
    expect(f.validation).toEqual({ valid: false, checks });
    const p = buildCaseRecord({ ...base, request: req, response: res(), validation: { information: [], errors: [], valid: true } });
    expect(p.outcome).toBe('pass');
    expect(p.validation).toEqual({ valid: true, checks: [] });
  });
});

describe('toCaseOutcomeCounts', () => {
  it('counts outcomes', () => {
    const mk = (outcome: 'pass' | 'fail' | 'error') => ({ ...buildCaseRecord({ ...base }), outcome });
    expect(toCaseOutcomeCounts([mk('pass'), mk('pass'), mk('fail'), mk('error')])).toEqual({ passed: 2, failed: 1, errored: 1 });
  });
});
