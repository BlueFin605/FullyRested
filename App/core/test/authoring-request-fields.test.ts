import { describe, expect, it } from 'vitest';
import { setBody, setMethod, setUrl } from '../src/authoring';
import { MemoryCollectionSink } from '../src/collection-sink';
import { FORM_CONTENT_TYPE } from '../src/model';
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

  it('refuses a run: locator, saying what a run does override', async () => {
    const sink = new MemoryCollectionSink(files);
    await expect(setUrl(ctxFor(sink), 'run:users/get.frreq#not found', 'https://x/y')).rejects.toThrow(QueryError);
    await expect(setUrl(ctxFor(sink), 'run:users/get.frreq#not found', 'https://x/y'))
      .rejects.toThrow(/set_url accepts request: only \(given run:\); a run overrides variables, secrets, headers, parameters, auth and validation, not the url/);
    expect(sink.files.get('users/get.frreq')).toBe(files['users/get.frreq']);
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
      .rejects.toThrow(/set_method accepts request: only \(given run:\); a run overrides variables, secrets, headers, parameters, auth and validation, not the method/);
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

  it('refuses a run: locator, saying what a run does override', async () => {
    const sink = new MemoryCollectionSink(files);
    await expect(setBody(ctxFor(sink), 'run:users/get.frreq#not found', 'application/json', { text: '{}' }))
      .rejects.toThrow(/set_body accepts request: only \(given run:\); a run overrides variables, secrets, headers, parameters, auth and validation, not the body/);
    expect(sink.files.get('users/get.frreq')).toBe(files['users/get.frreq']);
  });
});
