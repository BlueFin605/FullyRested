import { describe, expect, it } from 'vitest';
import {
  RestActionResult, addCaptured, captureFromResponse, mergeCaptureRules, prepareRequest, requestUrl, setCapture, removeSetting,
  ExecuteRestAction, HttpProtocol, validateCaptureRule, QueryError, MemoryCollectionSink
} from '../src';
import { files } from './fixtures/collection';

const guid = { generateGUID: () => 'generated' };
const ctxFor = (sink: MemoryCollectionSink) =>
  ({ collectionFile: 'api.frcol', source: sink, sink, secrets: { get: async () => null, set: async () => { } }, guid });
const written = (sink: MemoryCollectionSink, file: string) => JSON.parse(sink.files.get(file)!);

const response = (body: unknown, headers: Record<string, string> = {}, status = 201): RestActionResult => ({
  status, statusText: '', headers, headersSent: {},
  body: { contentType: 'application/json', body: new TextEncoder().encode(typeof body == 'string' ? body : JSON.stringify(body)).buffer as ArrayBuffer },
  validated: undefined
});
const rule = (variable: string, from: 'body' | 'header' | 'status', path = '') => ({ variable, from, path, id: variable });

describe('captureFromResponse', () => {
  it('takes strings, numbers, objects, headers and the status', () => {
    const out = captureFromResponse(
      [rule('id', 'body', '$.id'), rule('n', 'body', '$.items[0].n'), rule('obj', 'body', '$.o'), rule('etag', 'header', 'ETag'), rule('code', 'status')],
      response({ id: 'g-1', items: [{ n: 7 }], o: { a: 1 } }, { etag: '"x"' }));
    expect(out.errors).toEqual([]);
    expect(out.values.map(v => [v.variable, v.value])).toEqual([['id', 'g-1'], ['n', '7'], ['obj', '{"a":1}'], ['etag', '"x"'], ['code', '201']]);
  });

  it('reports a rule that finds nothing, and keeps the others', () => {
    const out = captureFromResponse([rule('a', 'body', '$.nope'), rule('b', 'header', 'x-none'), rule('c', 'body', '$.id')], response({ id: 1 }));
    expect(out.values.map(v => v.variable)).toEqual(['c']);
    expect(out.errors).toEqual(["capture 'a': nothing at $.nope", "capture 'b': no response header 'x-none'"]);
  });

  it('reports a body that is not json', () => {
    expect(captureFromResponse([rule('a', 'body', '$.id')], response('plain')).errors[0]).toContain('not JSON');
  });
});

describe('capture plumbing', () => {
  it('a run rule replaces the request rule for the same variable', () => {
    expect(mergeCaptureRules([rule('a', 'status'), rule('b', 'status')], [rule('a', 'header', 'h')]).map(r => [r.variable, r.from])).toEqual([['a', 'header'], ['b', 'status']]);
  });

  it('a later capture replaces an earlier one', () => {
    const held = [{ variable: 'a', value: '1', active: true, id: 'a' }];
    addCaptured(held, [{ variable: 'a', value: '2', active: true, id: 'a' }]);
    expect(held.map(v => v.value)).toEqual(['2']);
  });

  it('a url that already has a scheme is not given the protocol again', () => {
    expect(requestUrl('https', 'host/a')).toBe('https://host/a');
    expect(requestUrl('https', 'http://x.test/up?sig=1')).toBe('http://x.test/up?sig=1');
    const action = ExecuteRestAction.NewExecuteRestAction().setProtocol(HttpProtocol.https).setUrl('{{u}}')
      .variables_pushFront([{ variable: 'u', value: 'https://s3.test/k?X-Amz-Signature=a', active: true, id: 'u' }]).replaceVariables();
    expect(prepareRequest(action).url).toBe('https://s3.test/k?X-Amz-Signature=a');
  });

  it('refuses a bad rule before writing it', () => {
    expect(() => validateCaptureRule('a.b', 'body', '$.id')).toThrow(QueryError);
    expect(() => validateCaptureRule('a', 'cookie', 'x')).toThrow(/not one of/);
    expect(() => validateCaptureRule('a', 'body', undefined)).toThrow(/needs a path/);
    expect(() => validateCaptureRule('a', 'body', 'id')).toThrow(/Unsupported path/);
    expect(validateCaptureRule('a', 'status', 'ignored')).toEqual({ from: 'status', path: '' });
  });
});

describe('setCapture', () => {
  it('writes a rule on a request and on a run, and is idempotent', async () => {
    const sink = new MemoryCollectionSink(files);
    expect(await setCapture(ctxFor(sink), 'request:users/get.frreq', 'userId', 'body', '$.id')).toMatchObject({ changed: true, file: 'users/get.frreq' });
    expect(written(sink, 'users/get.frreq').capture).toEqual([{ variable: 'userId', from: 'body', path: '$.id', id: 'generated' }]);
    expect(await setCapture(ctxFor(sink), 'request:users/get.frreq', 'userId', 'body', '$.id')).toMatchObject({ changed: false });
    await setCapture(ctxFor(sink), 'request:users/get.frreq', 'userId', 'header', 'x-id');
    expect(written(sink, 'users/get.frreq').capture).toEqual([{ variable: 'userId', from: 'header', path: 'x-id', id: 'generated' }]);
    await setCapture(ctxFor(sink), 'run:users/get.frreq#not found', 'userId', 'status');
    expect(written(sink, 'users/get.frreq').runs[0].capture).toEqual([{ variable: 'userId', from: 'status', path: '', id: 'generated' }]);
  });

  it('refuses folder scope', async () => {
    await expect(setCapture(ctxFor(new MemoryCollectionSink(files)), 'folder:users', 'a', 'status')).rejects.toThrow(QueryError);
  });

  it('removes a rule through remove_setting', async () => {
    const sink = new MemoryCollectionSink(files);
    await setCapture(ctxFor(sink), 'request:users/get.frreq', 'userId', 'status');
    expect(await removeSetting(ctxFor(sink), 'request:users/get.frreq', 'capture', 'userId')).toMatchObject({ changed: true });
    expect(written(sink, 'users/get.frreq').capture).toEqual([]);
    expect(await removeSetting(ctxFor(sink), 'request:users/get.frreq', 'capture', 'userId')).toMatchObject({ changed: false });
  });
});
