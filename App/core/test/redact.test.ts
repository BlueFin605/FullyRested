import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { redactCase, maskPresignedUrl, maskPresignedText, CaseRecord, SecretTable, ExecuteRestAction, HttpProtocol, RestTypeVerb, buildRequestUrl, executeRequest, prepareRequest } from '../src';

const secret = (name: string, value: string, active = true): SecretTable => ({ $secret: name, $value: value, active, id: name });

const base = (over: Partial<CaseRecord['request']> = {}, response?: CaseRecord['response']): CaseRecord => ({
  index: 0, name: 'n', requestFile: 'f', outcome: 'pass', ms: 1,
  request: { method: 'GET', url: 'https://x.test/a', headers: {}, ...over },
  response,
});

describe('redactCase', () => {
  const post = (body: unknown, contentType: string) => prepareRequest(ExecuteRestAction.NewExecuteRestAction()
    .setProtocol(HttpProtocol.https).setUrl('x.test/a').setVerb(RestTypeVerb.post).setBody({ contentType, body }));

  it.each(['p@ss word', 'Pa$$w0rd!', 'a;b,c=d?e:f'])('replaces a secret %s in a query string built by buildRequestUrl', value => {
    const url = buildRequestUrl('https://x.test/a', [{ key: 'k', value, active: true, id: 'p' }]);
    const out = redactCase(base({ url }), [secret('pw', value)]);
    expect(out.request.url).toBe('https://x.test/a?k={{$secret:pw}}');
  });

  it.each(['p@ss word', 'Pa$$w0rd!', "it's (~ok)"])('replaces a secret %s in a form body built by prepareRequest', value => {
    const prepared = post([{ key: 'pw', value, active: true, id: 'f' }], 'application/x-www-form-urlencoded');
    const out = redactCase(base({ body: { bytes: 1, text: prepared.body } }), [secret('pw', value)]);
    expect(out.request.body?.text).toBe('pw={{$secret:pw}}');
  });

  it('replaces a JSON-escaped secret in a JSON body built by prepareRequest', () => {
    const value = 'a"bc\\d';
    const prepared = post({ pw: value }, 'application/json');
    const out = redactCase(base({ body: { bytes: 1, text: prepared.body } }), [secret('pw', value)]);
    expect(out.request.body?.text).toBe('{"pw":"{{$secret:pw}}"}');
  });

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

  it('redacts a secret echoed in the response statusText', () => {
    const rec = base({}, { status: -99, statusText: 'getaddrinfo failed for abcd1234.test', headers: {} });
    expect(redactCase(rec, [secret('key', 'abcd1234')]).response?.statusText).toBe('getaddrinfo failed for {{$secret:key}}.test');
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

  it('masks the sent Basic credentials, bearer token and security token wherever a response echoes them', () => {
    const rec = base(
      { headers: { Authorization: 'Basic dXNlcjpwYXNzd29yZA==', 'X-Amz-Security-Token': 'FwoGZXIvYXdzEJr' } },
      { status: 200, headers: { 'x-echo': 'Basic dXNlcjpwYXNzd29yZA==' },
        body: { bytes: 1, text: '{"auth":"dXNlcjpwYXNzd29yZA==","tok":"FwoGZXIvYXdzEJr"}' } },
    );
    const out = redactCase(rec, undefined);
    expect(out.response?.headers['x-echo']).toBe('Basic ***');
    expect(out.response?.body?.text).toBe('{"auth":"***","tok":"***"}');

    const bearer = redactCase(base({ headers: { authorization: 'Bearer abc.def.ghi' } },
      { status: 200, headers: {}, body: { bytes: 1, text: 'token=abc.def.ghi' } }), []);
    expect(bearer.response?.body?.text).toBe('token=***');
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

  it('treats regex-special characters in a secret literally', () => {
    const v = 'a.b*c+(d)[e]|f$g^';
    const out = redactCase(base({ url: `https://x.test/?a=${v}&b=aXb*c+(d)[e]|f$g^` }), [secret('rx', v)]);
    expect(out.request.url).toBe('https://x.test/?a={{$secret:rx}}&b=aXb*c+(d)[e]|f$g^');
  });

  it('treats $& in a secret value literally', () => {
    const out = redactCase(base({ url: 'https://x.test/?a=ab$&cd&b=abXXcd' }), [secret('d', 'ab$&cd')]);
    expect(out.request.url).toBe('https://x.test/?a={{$secret:d}}&b=abXXcd');
  });

  it('redacts secrets in error and validation check errors', () => {
    const rec: CaseRecord = {
      ...base(),
      outcome: 'error',
      error: 'connect failed https://x.test/?k=abcd1234',
      validation: {
        valid: false,
        checks: [
          { check: 'body', passed: false, errors: ['expected abcd1234', 'other'] },
          { check: 'status', passed: true, errors: [] },
        ],
      },
    };
    const out = redactCase(rec, [secret('key', 'abcd1234')]);
    expect(out.error).toBe('connect failed https://x.test/?k={{$secret:key}}');
    expect(out.validation?.checks[0].errors).toEqual(['expected {{$secret:key}}', 'other']);
    expect(out.validation?.checks[1].errors).toEqual([]);
    expect(out.validation?.valid).toBe(false);
    expect(rec.error).toContain('abcd1234');
    expect(rec.validation?.checks[0].errors[0]).toBe('expected abcd1234');
  });
});

describe('redactCase with an echo server', () => {
  let server: Server;
  let host = '';
  beforeAll(async () => {
    server = createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/plain' }); res.end(req.url); });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    host = `127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));

  it.each(['Pa$$ w0rd!(x)', `a"b<c>'d{e}`])('redacts a secret %s in the URL as the server reports it', async value => {
    const action = ExecuteRestAction.NewExecuteRestAction().setProtocol(HttpProtocol.http).setUrl(`${host}/p/${value}?q=${value}`);
    const result = await executeRequest(action);
    const echoed = new TextDecoder().decode(result.body!.body);
    expect(echoed).not.toContain(value);
    const out = redactCase(base({}, { status: 200, headers: {}, body: { bytes: 1, text: echoed } }), [secret('pw', value)]);
    expect(out.response?.body?.text).toBe('/p/{{$secret:pw}}?q={{$secret:pw}}');
  });

  it('does not register a fragment of a value the URL parser cuts short or normalises', () => {
    const out = redactCase(base({ url: 'https://x.test/abcd/b/zz' }), [secret('q', 'abcd?xyz'), secret('d', 'a/../b/zz')]);
    expect(out.request.url).toBe('https://x.test/abcd/b/zz');
  });

  it('skips values containing # without throwing', () => {
    const out = redactCase(base({ url: 'https://x.test/?a=ab#cd' }), [secret('h', 'ab#cd')]);
    expect(out.request.url).toBe('https://x.test/?a={{$secret:h}}');
  });
});

// A presigned SigV4 URL's signature, session token and credential scope are not declared secrets, so
// secretReplacer never sees them. FullyRested's own signUrl signing is applied inside executeRequest and
// that URL is never recorded, but a presigned URL pasted into a request's URL field is recorded as typed.
describe('maskPresignedUrl', () => {
  const presigned = 'https://b.s3.amazonaws.com/k?X-Amz-Algorithm=AWS4-HMAC-SHA256'
    + '&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130721%2Fus-east-1%2Fs3%2Faws4_request'
    + '&X-Amz-Date=20130721T201207Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host'
    + '&X-Amz-Security-Token=FQoDYXdzEPn%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaDA'
    + '&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404';

  it('masks the signature, the session token and the credential scope in a recorded URL', () => {
    const { request } = redactCase(base({ url: presigned }), []);
    expect(request.url).toBe('https://b.s3.amazonaws.com/k?X-Amz-Algorithm=AWS4-HMAC-SHA256'
      + '&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F***'
      + '&X-Amz-Date=20130721T201207Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host'
      + '&X-Amz-Security-Token=***&X-Amz-Signature=***');
  });

  it('keeps the access key id, which identifies the caller but is not a credential', () => {
    expect(maskPresignedUrl(presigned)).toContain('AKIAIOSFODNN7EXAMPLE');
  });

  it('masks a literal / separator in the credential as well as an encoded one', () => {
    expect(maskPresignedUrl('https://x.test/?X-Amz-Credential=AKIA1/20130721/us-east-1/s3/aws4_request'))
      .toBe('https://x.test/?X-Amz-Credential=AKIA1/***');
  });

  it('matches the parameter names whatever their case', () => {
    expect(maskPresignedUrl('https://x.test/?x-amz-signature=abc&X-AMZ-SECURITY-TOKEN=def'))
      .toBe('https://x.test/?x-amz-signature=***&X-AMZ-SECURITY-TOKEN=***');
  });

  it('leaves a credential that is only an access key id, with no scope to mask', () => {
    expect(maskPresignedUrl('https://x.test/?X-Amz-Credential=AKIA1')).toBe('https://x.test/?X-Amz-Credential=AKIA1');
  });

  it('leaves every other parameter, and a URL with no query, exactly as it was', () => {
    expect(maskPresignedUrl('https://x.test/a')).toBe('https://x.test/a');
    expect(maskPresignedUrl('https://x.test/a?')).toBe('https://x.test/a?');
    expect(maskPresignedUrl('https://x.test/a?k=v&X-Amz-Date=20130721T201207Z')).toBe('https://x.test/a?k=v&X-Amz-Date=20130721T201207Z');
  });

  it('preserves a fragment after the masked query', () => {
    expect(maskPresignedUrl('https://x.test/?X-Amz-Signature=abc#frag')).toBe('https://x.test/?X-Amz-Signature=***#frag');
  });

  it('leaves a URL holding an unsubstituted placeholder rather than failing to parse it', () => {
    expect(maskPresignedUrl('{{base}}/k?X-Amz-Signature=abc')).toBe('{{base}}/k?X-Amz-Signature=***');
  });

  it('leaves a valueless parameter alone', () => {
    expect(maskPresignedUrl('https://x.test/?X-Amz-Signature&k=v')).toBe('https://x.test/?X-Amz-Signature&k=v');
  });

  it('still replaces a declared secret elsewhere in a presigned URL', () => {
    const { request } = redactCase(base({ url: 'https://x.test/?key=topsecret&X-Amz-Signature=abc' }), [secret('k', 'topsecret')]);
    expect(request.url).toBe('https://x.test/?key={{$secret:k}}&X-Amz-Signature=***');
  });
});

describe('redactCase on a websocket case with trigger calls', () => {
  const wsCase = (error: string): CaseRecord => ({
    ...base(),
    request: { method: 'WS', url: 'wss://x.test/feed', headers: {} },
    websocket: {
      messages: [],
      errors: [`trigger returned ${error}`],
      triggerCalls: [{ at: 5, ms: 1, error }],
    },
  } as CaseRecord);

  it('masks the secrets of both the websocket and the trigger request, and presigned parameters', () => {
    const error = 'refused wsKeyValue and trigKeyValue at https://h/p?X-Amz-Signature=abc123&X-Amz-Credential=AKIDEXAMPLE%2F20261017%2Fus%2Fs&k=v';
    const out = redactCase(wsCase(error), [secret('ws', 'wsKeyValue'), secret('trig', 'trigKeyValue')]);

    const text = JSON.stringify(out.websocket);
    for (const leak of ['wsKeyValue', 'trigKeyValue', 'abc123', '20261017'])
      expect(text).not.toContain(leak);
    expect(out.websocket!.triggerCalls![0]!.error).toContain('{{$secret:trig}}');
    expect(out.websocket!.triggerCalls![0]!.error).toContain('X-Amz-Signature=***');
    expect(out.websocket!.triggerCalls![0]!.error).toContain('AKIDEXAMPLE');
    expect(out.websocket!.triggerCalls![0]!.error).toContain('&k=v');
  });
});

describe('maskPresignedText', () => {
  it('fully masks a security token that contains s or S', () => {
    expect(maskPresignedText('failed https://x.test/?X-Amz-Security-Token=AbsSSsTokenss&a=1'))
      .toBe('failed https://x.test/?X-Amz-Security-Token=***&a=1');
  });

  it('stops the masked value at whitespace', () => {
    expect(maskPresignedText('x-amz-signature=abc123 then more text')).toBe('x-amz-signature=*** then more text');
  });
});
