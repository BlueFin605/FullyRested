import { describe, expect, it } from 'vitest';
import { newRun, setBody, setMethod, setProtocol, setRunsOnly, setUrl } from '../src/authoring';
import { MemoryCollectionSink } from '../src/collection-sink';
import { FORM_CONTENT_TYPE, MULTIPART_CONTENT_TYPE } from '../src/model';
import { QueryError } from '../src/query-error';
import { files } from './fixtures/collection';

let n = 0;
const guid = { generateGUID: () => `g${++n}` };
const secrets = { get: async () => null, set: async () => { } };
const ctxFor = (sink: MemoryCollectionSink) => ({ collectionFile: 'api.frcol', source: sink, sink, secrets, guid });

const written = (sink: MemoryCollectionSink, file: string) => JSON.parse(sink.files.get(file)!);

describe('setUrl', () => {
  it('splits a leading scheme off into protocol', async () => {
    const sink = new MemoryCollectionSink(files);
    const result = await setUrl(ctxFor(sink), 'request:users/get.frreq', 'http://example.com/users');

    expect(result).toMatchObject({ file: 'users/get.frreq', scope: 'request:users/get.frreq', changed: true });
    expect(written(sink, 'users/get.frreq')).toMatchObject({ protocol: 'http', url: 'example.com/users' });
  });

  it('stores a scheme-less url verbatim, keeping the protocol the request already had', async () => {
    const sink = new MemoryCollectionSink(files);
    await setUrl(ctxFor(sink), 'request:users/get.frreq', 'https://example.com/users');
    await setUrl(ctxFor(sink), 'request:users/get.frreq', 'other.example.com/orders');

    expect(written(sink, 'users/get.frreq')).toMatchObject({ protocol: 'https', url: 'other.example.com/orders' });
  });

  it('leaves a {{var}} placeholder untouched', async () => {
    const sink = new MemoryCollectionSink(files);
    await setUrl(ctxFor(sink), 'request:users/get.frreq', '{{host}}/users');

    expect(written(sink, 'users/get.frreq').url).toBe('{{host}}/users');
  });

  it('leaves a {{var}} placeholder untouched behind a scheme', async () => {
    const sink = new MemoryCollectionSink(files);
    await setUrl(ctxFor(sink), 'request:users/get.frreq', 'https://{{host}}/users');

    expect(written(sink, 'users/get.frreq')).toMatchObject({ protocol: 'https', url: '{{host}}/users' });
  });

  it('reports no change, and writes nothing, when the url and protocol are already those', async () => {
    const sink = new MemoryCollectionSink(files);
    await setUrl(ctxFor(sink), 'request:users/get.frreq', 'https://example.com/users');
    const before = sink.files.get('users/get.frreq');

    const result = await setUrl(ctxFor(sink), 'request:users/get.frreq', 'https://example.com/users');
    expect(result.changed).toBe(false);
    expect(sink.files.get('users/get.frreq')).toBe(before);
  });

  it('counts a changed protocol alone as a change', async () => {
    const sink = new MemoryCollectionSink(files);
    await setUrl(ctxFor(sink), 'request:users/get.frreq', 'https://example.com/users');

    const result = await setUrl(ctxFor(sink), 'request:users/get.frreq', 'http://example.com/users');
    expect(result.changed).toBe(true);
    expect(written(sink, 'users/get.frreq')).toMatchObject({ protocol: 'http', url: 'example.com/users' });
  });

  it('overrides the url on a run, leaving the request alone, and removes the override with an empty url', async () => {
    const sink = new MemoryCollectionSink(files);
    const run = 'run:users/get.frreq#not found';
    const result = await setUrl(ctxFor(sink), run, 'http://{{host}}/users/not-a-guid');

    expect(result.changed).toBe(true);
    const action = written(sink, 'users/get.frreq');
    expect(action.url).toBe('https://x/u');
    expect(action.runs[0]).toMatchObject({ url: '{{host}}/users/not-a-guid', protocol: 'http' });
    expect((await setUrl(ctxFor(sink), run, 'http://{{host}}/users/not-a-guid')).changed).toBe(false);

    expect((await setUrl(ctxFor(sink), run, '')).changed).toBe(true);
    expect(written(sink, 'users/get.frreq').runs[0].url).toBeUndefined();
    expect(written(sink, 'users/get.frreq').runs[0].protocol).toBeUndefined();
    expect((await setUrl(ctxFor(sink), run, '')).changed).toBe(false);
  });
});

describe('setBody multipart', () => {
  const run = 'run:users/get.frreq#not found';

  it('stores text, text-file, binary and generated parts', async () => {
    const sink = new MemoryCollectionSink(files);
    await setBody(ctxFor(sink), 'request:users/get.frreq', MULTIPART_CONTENT_TYPE, { fields: [
      { name: 'note', value: 'hi' },
      { name: 'doc', value: 'abc', filename: 'a.txt', contentType: 'text/plain' },
      { name: 'bin', value: '', filename: 'b.bin', base64: 'AAEC' },
      { name: 'big', value: '', size: 10 }
    ] });

    expect(written(sink, 'users/get.frreq').body).toEqual({ contentType: MULTIPART_CONTENT_TYPE, body: [
      { key: 'note', value: 'hi', active: true, id: expect.any(String) },
      { key: 'doc', value: 'abc', active: true, id: expect.any(String), filename: 'a.txt', contentType: 'text/plain' },
      { key: 'bin', value: '', active: true, id: expect.any(String), filename: 'b.bin', base64: 'AAEC' },
      { key: 'big', value: '', active: true, id: expect.any(String), filename: 'file', size: 10 }
    ] });
  });

  it('works as a run override and rejects bad input', async () => {
    const sink = new MemoryCollectionSink(files);
    await setBody(ctxFor(sink), run, MULTIPART_CONTENT_TYPE, { fields: [{ name: 'f', value: '', base64: 'AAEC' }] });
    expect(written(sink, 'users/get.frreq').runs[0].body.contentType).toBe(MULTIPART_CONTENT_TYPE);

    await expect(setBody(ctxFor(sink), run, MULTIPART_CONTENT_TYPE, { text: 'x' })).rejects.toThrow(/takes fields/);
    await expect(setBody(ctxFor(sink), run, MULTIPART_CONTENT_TYPE, { fields: [{ name: 'f', value: '', base64: '!!' }] })).rejects.toThrow(/not valid base64/);
    await expect(setBody(ctxFor(sink), run, MULTIPART_CONTENT_TYPE, { fields: [{ name: 'f', value: '', base64: 'AA==', size: 3 }] })).rejects.toThrow(/not both/);
    await expect(setBody(ctxFor(sink), run, MULTIPART_CONTENT_TYPE, { fields: [{ name: 'f', value: '', size: -1 }] })).rejects.toThrow(/whole number/);
    await expect(setBody(ctxFor(sink), run, 'application/json', { fields: [{ name: 'f', value: '', size: 1 }] })).rejects.toThrow(/Only multipart/);
  });
});

describe('setProtocol', () => {
  it('sets the protocol, matching case-insensitively, and reports no change when it already is', async () => {
    const sink = new MemoryCollectionSink(files);
    const result = await setProtocol(ctxFor(sink), 'request:users/get.frreq', 'HTTP');
    expect(result).toMatchObject({ file: 'users/get.frreq', changed: true });
    expect(written(sink, 'users/get.frreq')).toMatchObject({ protocol: 'http', url: 'https://x/u' });
    expect((await setProtocol(ctxFor(sink), 'request:users/get.frreq', 'http')).changed).toBe(false);
  });

  it('rejects an unknown protocol and a run scope', async () => {
    const sink = new MemoryCollectionSink(files);
    await expect(setProtocol(ctxFor(sink), 'request:users/get.frreq', 'ftp')).rejects.toThrow(/Unknown protocol 'ftp' \(have http, https\)/);
    await expect(setProtocol(ctxFor(sink), 'run:users/get.frreq#not found', 'http')).rejects.toThrow(/set_protocol accepts request: only/);
  });
});

describe('setMethod', () => {
  it('matches an upper-case method and stores it lower-case', async () => {
    const sink = new MemoryCollectionSink(files);
    const result = await setMethod(ctxFor(sink), 'request:users/get.frreq', 'POST');

    expect(result).toMatchObject({ file: 'users/get.frreq', changed: true });
    expect(written(sink, 'users/get.frreq').verb).toBe('post');
  });

  it('matches a lower-case method', async () => {
    const sink = new MemoryCollectionSink(files);
    await setMethod(ctxFor(sink), 'request:users/get.frreq', 'patch');

    expect(written(sink, 'users/get.frreq').verb).toBe('patch');
  });

  it('rejects an unknown method with the six it takes', async () => {
    const sink = new MemoryCollectionSink(files);
    await expect(setMethod(ctxFor(sink), 'request:users/get.frreq', 'fetch')).rejects.toThrow(QueryError);
    await expect(setMethod(ctxFor(sink), 'request:users/get.frreq', 'fetch'))
      .rejects.toThrow(/Unknown method 'fetch' \(have get, post, patch, option, delete, put\)/);
    expect(sink.files.get('users/get.frreq')).toBe(files['users/get.frreq']);
  });

  it('reports no change, and writes nothing, when the method is already that', async () => {
    const sink = new MemoryCollectionSink(files);
    const before = sink.files.get('users/get.frreq');

    const result = await setMethod(ctxFor(sink), 'request:users/get.frreq', 'GET');
    expect(result.changed).toBe(false);
    expect(sink.files.get('users/get.frreq')).toBe(before);
  });

  it('refuses a run: locator, saying what a run does override', async () => {
    const sink = new MemoryCollectionSink(files);
    await expect(setMethod(ctxFor(sink), 'run:users/get.frreq#not found', 'post'))
      .rejects.toThrow(/set_method accepts request: only \(given run:\); a run overrides variables, secrets, headers, parameters, auth, validation, capture rules, the body and the url, not the method/);
    expect(sink.files.get('users/get.frreq')).toBe(files['users/get.frreq']);
  });
});

describe('setBody', () => {
  it('stores a text content type as the text itself', async () => {
    const sink = new MemoryCollectionSink(files);
    const result = await setBody(ctxFor(sink), 'request:users/get.frreq', 'application/json', { text: '{"a":1}' });

    expect(result).toMatchObject({ file: 'users/get.frreq', changed: true });
    expect(written(sink, 'users/get.frreq').body).toEqual({ contentType: 'application/json', body: '{"a":1}' });
  });

  it('stores a form content type as a table of fields', async () => {
    const sink = new MemoryCollectionSink(files);
    const result = await setBody(ctxFor(sink), 'request:users/get.frreq', FORM_CONTENT_TYPE,
      { fields: [{ name: 'name', value: 'Ada' }, { name: 'role', value: 'admin' }] });

    expect(result.changed).toBe(true);
    const body = written(sink, 'users/get.frreq').body;
    expect(body.contentType).toBe(FORM_CONTENT_TYPE);
    expect(body.body).toEqual([
      { key: 'name', value: 'Ada', active: true, id: expect.any(String) },
      { key: 'role', value: 'admin', active: true, id: expect.any(String) }
    ]);
    expect(body.body[0].id).not.toBe(body.body[1].id);
  });

  it('keeps the id of a form field of the same name across an edit', async () => {
    const sink = new MemoryCollectionSink(files);
    await setBody(ctxFor(sink), 'request:users/get.frreq', FORM_CONTENT_TYPE, { fields: [{ name: 'name', value: 'Ada' }] });
    const id = written(sink, 'users/get.frreq').body.body[0].id;

    await setBody(ctxFor(sink), 'request:users/get.frreq', FORM_CONTENT_TYPE, { fields: [{ name: 'name', value: 'Grace' }] });
    expect(written(sink, 'users/get.frreq').body.body).toEqual([{ key: 'name', value: 'Grace', active: true, id }]);
  });

  it("clears the body with 'none', ignoring any content given", async () => {
    const sink = new MemoryCollectionSink(files);
    await setBody(ctxFor(sink), 'request:users/get.frreq', 'application/json', { text: '{"a":1}' });

    const result = await setBody(ctxFor(sink), 'request:users/get.frreq', 'none', { text: 'ignored' });
    expect(result.changed).toBe(true);
    // CreateEmptyActionBody() leaves body undefined, so the written document has no body member
    expect(written(sink, 'users/get.frreq').body).toEqual({ contentType: 'none' });
  });

  it('refuses fields for a content type that takes text', async () => {
    const sink = new MemoryCollectionSink(files);
    await expect(setBody(ctxFor(sink), 'request:users/get.frreq', 'application/json',
      { fields: [{ name: 'name', value: 'Ada' }] })).rejects.toThrow(QueryError);
    await expect(setBody(ctxFor(sink), 'request:users/get.frreq', 'application/json',
      { fields: [{ name: 'name', value: 'Ada' }] }))
      .rejects.toThrow(/Content type 'application\/json' takes text, not fields/);
    expect(sink.files.get('users/get.frreq')).toBe(files['users/get.frreq']);
  });

  it('refuses text for the form content type', async () => {
    const sink = new MemoryCollectionSink(files);
    await expect(setBody(ctxFor(sink), 'request:users/get.frreq', FORM_CONTENT_TYPE, { text: 'name=Ada' }))
      .rejects.toThrow(QueryError);
    await expect(setBody(ctxFor(sink), 'request:users/get.frreq', FORM_CONTENT_TYPE, { text: 'name=Ada' }))
      .rejects.toThrow(/takes fields, not text/);
    expect(sink.files.get('users/get.frreq')).toBe(files['users/get.frreq']);
  });

  it('refuses a missing content type', async () => {
    const sink = new MemoryCollectionSink(files);
    await expect(setBody(ctxFor(sink), 'request:users/get.frreq', undefined as unknown as string))
      .rejects.toThrow(/set_body needs a content type/);
  });

  it('reports no change, and writes nothing, when the body is already that text', async () => {
    const sink = new MemoryCollectionSink(files);
    await setBody(ctxFor(sink), 'request:users/get.frreq', 'application/json', { text: '{"a":1}' });
    const before = sink.files.get('users/get.frreq');

    const result = await setBody(ctxFor(sink), 'request:users/get.frreq', 'application/json', { text: '{"a":1}' });
    expect(result.changed).toBe(false);
    expect(sink.files.get('users/get.frreq')).toBe(before);
  });

  it('reports no change when the form fields are already those', async () => {
    const sink = new MemoryCollectionSink(files);
    await setBody(ctxFor(sink), 'request:users/get.frreq', FORM_CONTENT_TYPE, { fields: [{ name: 'name', value: 'Ada' }] });
    const before = sink.files.get('users/get.frreq');

    const result = await setBody(ctxFor(sink), 'request:users/get.frreq', FORM_CONTENT_TYPE, { fields: [{ name: 'name', value: 'Ada' }] });
    expect(result.changed).toBe(false);
    expect(sink.files.get('users/get.frreq')).toBe(before);
  });

  it("reports no change when the body is already 'none'", async () => {
    const sink = new MemoryCollectionSink(files);
    const before = sink.files.get('users/get.frreq');

    const result = await setBody(ctxFor(sink), 'request:users/get.frreq', 'none');
    expect(result.changed).toBe(false);
    expect(sink.files.get('users/get.frreq')).toBe(before);
  });

  it('overrides the body on a run, leaving the request body alone', async () => {
    const sink = new MemoryCollectionSink(files);
    await setBody(ctxFor(sink), 'request:users/get.frreq', 'application/json', { text: '{"a":1}' });
    const result = await setBody(ctxFor(sink), 'run:users/get.frreq#not found', 'none');

    expect(result).toMatchObject({ changed: true });
    const action = written(sink, 'users/get.frreq');
    expect(action.body).toEqual({ contentType: 'application/json', body: '{"a":1}' });
    expect(action.runs[0].body).toEqual({ contentType: 'none' });
    expect((await setBody(ctxFor(sink), 'run:users/get.frreq#not found', 'none')).changed).toBe(false);
  });

  it('sets a text body on a run and removes the override with inherit', async () => {
    const sink = new MemoryCollectionSink(files);
    await setBody(ctxFor(sink), 'run:users/get.frreq#not found', 'application/json', { text: '{}' });
    expect(written(sink, 'users/get.frreq').runs[0].body).toEqual({ contentType: 'application/json', body: '{}' });

    const result = await setBody(ctxFor(sink), 'run:users/get.frreq#not found', 'inherit');
    expect(result.changed).toBe(true);
    expect(written(sink, 'users/get.frreq').runs[0].body).toBeUndefined();
    expect((await setBody(ctxFor(sink), 'run:users/get.frreq#not found', 'inherit')).changed).toBe(false);
  });

  it('refuses inherit on a request', async () => {
    const sink = new MemoryCollectionSink(files);
    await expect(setBody(ctxFor(sink), 'request:users/get.frreq', 'inherit')).rejects.toThrow(/for a run/);
    expect(sink.files.get('users/get.frreq')).toBe(files['users/get.frreq']);
  });

  it('refuses a collection locator', async () => {
    const sink = new MemoryCollectionSink(files);
    await expect(setBody(ctxFor(sink), 'collection', 'none')).rejects.toThrow(/set_body accepts/);
  });
});

describe('setRunsOnly', () => {
  it('sets and clears the flag, reporting no change the second time', async () => {
    const sink = new MemoryCollectionSink(files);
    let r = await setRunsOnly(ctxFor(sink), 'request:users/get.frreq', true);
    expect(r.changed).toBe(true);
    expect(written(sink, 'users/get.frreq').runsOnly).toBe(true);

    r = await setRunsOnly(ctxFor(sink), 'request:users/get.frreq', true);
    expect(r.changed).toBe(false);

    r = await setRunsOnly(ctxFor(sink), 'request:users/get.frreq', false);
    expect(r.changed).toBe(true);
    expect(written(sink, 'users/get.frreq').runsOnly).toBeUndefined();
  });

  it('refuses a run scope', async () => {
    const sink = new MemoryCollectionSink(files);
    await newRun(ctxFor(sink), 'users/get.frreq', 'r');
    await expect(setRunsOnly(ctxFor(sink), 'run:users/get.frreq#r', true)).rejects.toThrow();
  });
});

describe('set_body content type shorthand', () => {
  it("stores 'json' as application/json (any case), and other shorthands as their media types", async () => {
    const sink = new MemoryCollectionSink(files);
    await setBody(ctxFor(sink), 'request:users/get.frreq', 'JSON', { text: '{"a":1}' });
    expect(written(sink, 'users/get.frreq').body).toMatchObject({ contentType: 'application/json', body: '{"a":1}' });
    await setBody(ctxFor(sink), 'request:users/get.frreq', 'xml', { text: '<a/>' });
    expect(written(sink, 'users/get.frreq').body.contentType).toBe('application/xml');
    await setBody(ctxFor(sink), 'request:users/get.frreq', 'text', { text: 'x' });
    expect(written(sink, 'users/get.frreq').body.contentType).toBe('text/plain');
  });

  it('leaves a full media type and none/inherit alone', async () => {
    const sink = new MemoryCollectionSink(files);
    await setBody(ctxFor(sink), 'request:users/get.frreq', 'application/vnd.api+json', { text: '{}' });
    expect(written(sink, 'users/get.frreq').body.contentType).toBe('application/vnd.api+json');
    await setBody(ctxFor(sink), 'request:users/get.frreq', 'none');
    expect(written(sink, 'users/get.frreq').body.contentType).toBe('none');
  });
});
