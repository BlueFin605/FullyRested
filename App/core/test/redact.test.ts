import { describe, it, expect } from 'vitest';
import { redactCase, CaseRecord, SecretTable } from '../src';

const secret = (name: string, value: string, active = true): SecretTable => ({ $secret: name, $value: value, active, id: name });

const base = (over: Partial<CaseRecord['request']> = {}, response?: CaseRecord['response']): CaseRecord => ({
  index: 0, name: 'n', requestFile: 'f', outcome: 'pass', ms: 1,
  request: { method: 'GET', url: 'https://x.test/a', headers: {}, ...over },
  response,
});

describe('redactCase', () => {
  it('replaces a secret in the query string, raw and URI-encoded', () => {
    const out = redactCase(base({ url: 'https://x.test/a?k=p@ss word&e=p%40ss%20word' }), [secret('pw', 'p@ss word')]);
    expect(out.request.url).toBe('https://x.test/a?k={{$secret:pw}}&e={{$secret:pw}}');
  });

  it('replaces a secret in request and response header values and JSON bodies', () => {
    const rec = base(
      { headers: { 'X-Key': 'abcd1234' }, body: { bytes: 21, text: '{"token":"abcd1234"}' } },
      { status: 200, headers: { 'Set-Cookie': 'sid=abcd1234' }, body: { bytes: 20, text: '{"echo":"abcd1234"}' } },
    );
    const out = redactCase(rec, [secret('key', 'abcd1234')]);
    expect(out.request.headers['X-Key']).toBe('{{$secret:key}}');
    expect(out.request.body?.text).toBe('{"token":"{{$secret:key}}"}');
    expect(out.request.body?.bytes).toBe(21);
    expect(out.response?.headers['Set-Cookie']).toBe('sid={{$secret:key}}');
    expect(out.response?.body?.text).toBe('{"echo":"{{$secret:key}}"}');
    expect(out.response?.body?.bytes).toBe(20);
  });

  it('leaves base64 bodies alone', () => {
    const rec = base({}, { status: 200, headers: {}, body: { bytes: 4, base64: 'abcd1234' } });
    expect(redactCase(rec, [secret('key', 'abcd1234')]).response?.body?.base64).toBe('abcd1234');
  });

  it('does not mutate the input', () => {
    const rec = base({ url: 'https://x.test/?k=abcd1234', headers: { Authorization: 'Bearer t' } });
    redactCase(rec, [secret('key', 'abcd1234')]);
    expect(rec.request.url).toBe('https://x.test/?k=abcd1234');
    expect(rec.request.headers['Authorization']).toBe('Bearer t');
  });

  it('masks Authorization keeping the scheme, case-insensitively, in request and response', () => {
    const out = redactCase(base(
      { headers: { authorization: 'Basic dXNlcjpwdw==' } },
      { status: 401, headers: { AUTHORIZATION: 'Bearer abc.def', 'x-amz-security-token': 'FwoGZX' } },
    ), undefined);
    expect(out.request.headers['authorization']).toBe('Basic ***');
    expect(out.response?.headers['AUTHORIZATION']).toBe('Bearer ***');
    expect(out.response?.headers['x-amz-security-token']).toBe('***');
  });

  it('masks SigV4 keeping only the access key id', () => {
    const out = redactCase(base({ headers: {
      Authorization: 'AWS4-HMAC-SHA256 Credential=AKIAEXAMPLE/20260101/us-east-1/s3/aws4_request, SignedHeaders=host, Signature=deadbeef',
      'X-Amz-Security-Token': 'tok',
    } }), []);
    expect(out.request.headers['Authorization']).toBe('AWS4-HMAC-SHA256 Credential=AKIAEXAMPLE/***');
    expect(out.request.headers['X-Amz-Security-Token']).toBe('***');
  });

  it('masks an unknown Authorization scheme entirely', () => {
    expect(redactCase(base({ headers: { Authorization: 'Digest abc' } }), undefined).request.headers['Authorization']).toBe('***');
  });

  it('ignores secrets shorter than 4 characters', () => {
    const out = redactCase(base({ url: 'https://x.test/abc' }), [secret('s', 'abc')]);
    expect(out.request.url).toBe('https://x.test/abc');
  });

  it('ignores inactive secrets', () => {
    const out = redactCase(base({ url: 'https://x.test/abcd' }), [secret('s', 'abcd', false)]);
    expect(out.request.url).toBe('https://x.test/abcd');
  });

  it('replaces the longer of overlapping secrets first', () => {
    const out = redactCase(base({ url: 'https://x.test/?a=abcdXYZ1' }), [secret('short', 'abcd'), secret('long', 'abcdXYZ1')]);
    expect(out.request.url).toBe('https://x.test/?a={{$secret:long}}');
  });
});
