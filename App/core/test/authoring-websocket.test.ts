import { describe, expect, it } from 'vitest';
import { setAuth, setExpect, setMessage, setType } from '../src/authoring';
import { MemoryCollectionSink } from '../src/collection-sink';
import { QueryError } from '../src/query-error';
import { files } from './fixtures/collection';

const guid = { generateGUID: () => 'g' };
const secrets = { get: async () => null, set: async () => { } };
const ctxFor = (sink: MemoryCollectionSink) => ({ collectionFile: 'api.frcol', source: sink, sink, secrets, guid });
const written = (sink: MemoryCollectionSink, file: string) => JSON.parse(sink.files.get(file)!);
const REQ = 'request:users/get.frreq';
const FILE = 'users/get.frreq';

async function websocketSink() {
  const sink = new MemoryCollectionSink(files);
  await setType(ctxFor(sink), REQ, 'websocket');
  return sink;
}

describe('setType', () => {
  it('switches a request to websocket and fills the websocket defaults', async () => {
    const sink = new MemoryCollectionSink(files);
    const result = await setType(ctxFor(sink), REQ, 'WebSocket');

    expect(result).toMatchObject({ file: FILE, changed: true });
    const action = written(sink, FILE);
    expect(action.type).toBe('websocket');
    expect(action.message).toBe('');
    expect(action.expect).toMatchObject({ count: 1, match: 'all', extras: 'ignore' });
  });

  it('reports no change for http on a request with no type', async () => {
    const sink = new MemoryCollectionSink(files);
    const before = sink.files.get(FILE);
    const result = await setType(ctxFor(sink), REQ, 'http');

    expect(result.changed).toBe(false);
    expect(sink.files.get(FILE)).toBe(before);
  });

  it('keeps message and expect when switching back to http', async () => {
    const sink = await websocketSink();
    await setMessage(ctxFor(sink), REQ, '{"hi":1}');
    await setType(ctxFor(sink), REQ, 'http');

    expect(written(sink, FILE)).toMatchObject({ type: 'http', message: '{"hi":1}' });
  });

  it('rejects an unknown type, writing nothing', async () => {
    const sink = new MemoryCollectionSink(files);
    const before = sink.files.get(FILE);
    await expect(setType(ctxFor(sink), REQ, 'grpc')).rejects.toThrow(/Unknown request type 'grpc' \(have http, websocket\)/);
    expect(sink.files.get(FILE)).toBe(before);
  });

  it('rejects a run locator', async () => {
    const sink = new MemoryCollectionSink(files);
    await expect(setType(ctxFor(sink), 'run:users/get.frreq#not found', 'websocket')).rejects.toThrow(QueryError);
  });
});

describe('setMessage', () => {
  it('sets the message, verbatim', async () => {
    const sink = await websocketSink();
    const result = await setMessage(ctxFor(sink), REQ, '{"op":"{{op}}"}');

    expect(result.changed).toBe(true);
    expect(written(sink, FILE).message).toBe('{"op":"{{op}}"}');
  });

  it('reports no change for the same message', async () => {
    const sink = await websocketSink();
    await setMessage(ctxFor(sink), REQ, 'x');
    expect((await setMessage(ctxFor(sink), REQ, 'x')).changed).toBe(false);
  });

  it('refuses an http request, pointing at set_type', async () => {
    const sink = new MemoryCollectionSink(files);
    const before = sink.files.get(FILE);
    await expect(setMessage(ctxFor(sink), REQ, 'x')).rejects.toThrow(/set_type websocket/);
    expect(sink.files.get(FILE)).toBe(before);
  });
});

describe('setExpect', () => {
  const schema = JSON.stringify({ type: 'object', required: ['id'] });

  it('sets the given fields and leaves the others', async () => {
    const sink = await websocketSink();
    const result = await setExpect(ctxFor(sink), REQ, { count: 3, match: 'ANY', extras: 'fail', timeout: 8000, settle: 200, schema });

    expect(result.changed).toBe(true);
    expect(written(sink, FILE).expect).toEqual({
      count: 3, match: 'any', extras: 'fail', timeout: 8000, settle: 200, schema: { schema }
    });

    await setExpect(ctxFor(sink), REQ, { count: 2 });
    expect(written(sink, FILE).expect).toMatchObject({ count: 2, match: 'any', schema: { schema } });
  });

  it('clears the schema with empty text', async () => {
    const sink = await websocketSink();
    await setExpect(ctxFor(sink), REQ, { schema });
    await setExpect(ctxFor(sink), REQ, { schema: '' });

    expect(written(sink, FILE).expect.schema).toBeUndefined();
  });

  it('reports no change when nothing differs', async () => {
    const sink = await websocketSink();
    expect((await setExpect(ctxFor(sink), REQ, { count: 1 })).changed).toBe(false);
  });

  it('rejects schema text that is not JSON, before any write', async () => {
    const sink = await websocketSink();
    const before = sink.files.get(FILE);
    await expect(setExpect(ctxFor(sink), REQ, { count: 5, schema: '{nope' })).rejects.toThrow(/jsonSchema is not valid JSON/);
    expect(sink.files.get(FILE)).toBe(before);
  });

  it('rejects schema text that does not compile, before any write', async () => {
    const sink = await websocketSink();
    const before = sink.files.get(FILE);
    await expect(setExpect(ctxFor(sink), REQ, { count: 5, schema: '{"type":"nonsense"}' })).rejects.toThrow(/jsonSchema does not compile/);
    expect(sink.files.get(FILE)).toBe(before);
  });

  it.each([
    [{ count: 0 }, /count must be/],
    [{ timeout: 1.5 }, /timeout must be/],
    [{ settle: -1 }, /settle must be/],
    [{ match: 'some' }, /Unknown match 'some' \(have all, any\)/],
    [{ extras: 'maybe' }, /Unknown extras 'maybe' \(have ignore, fail\)/]
  ])('rejects %j without writing', async (fields, message) => {
    const sink = await websocketSink();
    const before = sink.files.get(FILE);
    await expect(setExpect(ctxFor(sink), REQ, fields)).rejects.toThrow(message);
    expect(sink.files.get(FILE)).toBe(before);
  });

  it('refuses an http request', async () => {
    const sink = new MemoryCollectionSink(files);
    await expect(setExpect(ctxFor(sink), REQ, { count: 2 })).rejects.toThrow(/set_type websocket/);
  });
});

describe('setAuth placement', () => {
  it('puts the token in a query parameter', async () => {
    const sink = await websocketSink();
    await setAuth(ctxFor(sink), REQ, 'bearertoken', { token: '{{$token}}', placement: 'token' });

    const auth = written(sink, FILE).authentication;
    expect(auth).toMatchObject({ authentication: 'bearertoken', placement: 'token' });
    expect(auth.bearerToken.token).toBe('{{$token}}');
  });

  it("matches 'header' without regard to case", async () => {
    const sink = await websocketSink();
    await setAuth(ctxFor(sink), REQ, 'bearertoken', { token: '{{$t}}', placement: 'token' });
    await setAuth(ctxFor(sink), REQ, 'bearertoken', { placement: 'HEADER' });

    expect(written(sink, FILE).authentication.placement).toBe('header');
  });

  it('works on a folder', async () => {
    const sink = new MemoryCollectionSink(files);
    await setAuth(ctxFor(sink), 'folder:users', 'bearertoken', { token: '{{$t}}', placement: 'token' });
    expect(written(sink, 'users/folder.frfolder').auth.placement).toBe('token');
  });

  it('leaves placement alone when not given', async () => {
    const sink = await websocketSink();
    await setAuth(ctxFor(sink), REQ, 'bearertoken', { token: '{{$t}}', placement: 'token' });
    await setAuth(ctxFor(sink), REQ, 'bearertoken', { token: '{{$u}}' });
    expect(written(sink, FILE).authentication.placement).toBe('token');
  });

  it('rejects a placement that is not a parameter name, before any write', async () => {
    const sink = new MemoryCollectionSink(files);
    const before = sink.files.get(FILE);
    await expect(setAuth(ctxFor(sink), REQ, 'bearertoken', { placement: 'a b&c' })).rejects.toThrow(/placement must be/);
    expect(sink.files.get(FILE)).toBe(before);
  });
});
