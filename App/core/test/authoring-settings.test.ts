import { describe, expect, it, vi } from 'vitest';
import { removeSetting, setHeader, setParam } from '../src/authoring';
import { MemoryCollectionSink } from '../src/collection-sink';
import { QueryError } from '../src/query-error';
import { files } from './fixtures/collection';

const guid = { generateGUID: () => 'generated' };
const secrets = { get: async () => null, set: vi.fn(async () => { }) };
const ctxFor = (sink: MemoryCollectionSink) =>
  ({ collectionFile: 'api.frcol', source: sink, sink, secrets, guid });

const written = (sink: MemoryCollectionSink, file: string) => JSON.parse(sink.files.get(file)!);

describe('setHeader', () => {
  it('sets a header on the collection environment', async () => {
    const sink = new MemoryCollectionSink(files);
    const result = await setHeader(ctxFor(sink), 'collection', 'Accept', 'application/json');
    expect(result).toMatchObject({ file: 'api.frcol', scope: 'collection', changed: true });
    const config = written(sink, 'api.frcol');
    expect(config.collectionEnvironment.headers)
      .toEqual([{ key: 'Accept', value: 'application/json', active: true, id: 'generated' }]);
    expect(config.environments[0].headers).toEqual([]);
  });

  it('sets a header on a named environment', async () => {
    const sink = new MemoryCollectionSink(files);
    const result = await setHeader(ctxFor(sink), 'env:Production', 'Accept', 'application/json');
    expect(result).toMatchObject({ file: 'api.frcol', changed: true });
    const config = written(sink, 'api.frcol');
    expect(config.environments[0].headers)
      .toEqual([{ key: 'Accept', value: 'application/json', active: true, id: 'generated' }]);
    expect(config.collectionEnvironment.headers).toEqual([]);
  });

  it('sets a header on a folder', async () => {
    const sink = new MemoryCollectionSink(files);
    const result = await setHeader(ctxFor(sink), 'folder:users', 'Accept', 'application/json');
    expect(result).toMatchObject({ file: 'users/folder.frfolder', changed: true });
    expect(written(sink, 'users/folder.frfolder').headers)
      .toEqual([{ key: 'Accept', value: 'application/json', active: true, id: 'generated' }]);
  });

  it('sets a header on a request', async () => {
    const sink = new MemoryCollectionSink(files);
    const result = await setHeader(ctxFor(sink), 'request:users/get.frreq', 'Accept', 'application/json');
    expect(result).toMatchObject({ file: 'users/get.frreq', changed: true });
    const action = written(sink, 'users/get.frreq');
    expect(action.headers).toEqual([{ key: 'Accept', value: 'application/json', active: true, id: 'generated' }]);
    expect(action.runs[0].headers).toEqual([]);
  });

  it('sets a header on a run, and honours enabled: false', async () => {
    const sink = new MemoryCollectionSink(files);
    const result = await setHeader(ctxFor(sink), 'run:users/get.frreq#not found', 'Accept', 'application/json', false);
    expect(result).toMatchObject({ file: 'users/get.frreq', changed: true });
    const action = written(sink, 'users/get.frreq');
    expect(action.runs[0].headers)
      .toEqual([{ key: 'Accept', value: 'application/json', active: false, id: 'generated' }]);
    expect(action.headers).toEqual([]);
  });

  it('reports no change, and writes nothing, when the header already has that value', async () => {
    const sink = new MemoryCollectionSink(files);
    await setHeader(ctxFor(sink), 'request:users/get.frreq', 'Accept', 'application/json');
    const before = sink.files.get('users/get.frreq');

    const result = await setHeader(ctxFor(sink), 'request:users/get.frreq', 'Accept', 'application/json');
    expect(result.changed).toBe(false);
    expect(sink.files.get('users/get.frreq')).toBe(before);
  });

  it('replaces a header whose name differs only in case, rather than duplicating it', async () => {
    const sink = new MemoryCollectionSink(files);
    await setHeader(ctxFor(sink), 'request:users/get.frreq', 'Accept', 'application/json');

    const result = await setHeader(ctxFor(sink), 'request:users/get.frreq', 'ACCEPT', 'text/plain');
    expect(result.changed).toBe(true);
    expect(written(sink, 'users/get.frreq').headers)
      .toEqual([{ key: 'ACCEPT', value: 'text/plain', active: true, id: 'generated' }]);
  });
});

describe('setParam', () => {
  it('sets a parameter on a request', async () => {
    const sink = new MemoryCollectionSink(files);
    const result = await setParam(ctxFor(sink), 'request:users/get.frreq', 'page', '2');
    expect(result).toMatchObject({ file: 'users/get.frreq', changed: true });
    const action = written(sink, 'users/get.frreq');
    expect(action.parameters).toEqual([{ key: 'page', value: '2', active: true, id: 'generated' }]);
    expect(action.runs[0].parameters).toEqual([]);
  });

  it('sets a parameter on a run', async () => {
    const sink = new MemoryCollectionSink(files);
    const result = await setParam(ctxFor(sink), 'run:users/get.frreq#not found', 'page', '2');
    expect(result).toMatchObject({ file: 'users/get.frreq', changed: true });
    const action = written(sink, 'users/get.frreq');
    expect(action.runs[0].parameters).toEqual([{ key: 'page', value: '2', active: true, id: 'generated' }]);
    expect(action.parameters).toEqual([]);
  });

  it('refuses a collection locator, naming the locators it does accept', async () => {
    const sink = new MemoryCollectionSink(files);
    await expect(setParam(ctxFor(sink), 'collection', 'page', '2')).rejects.toThrow(QueryError);
    await expect(setParam(ctxFor(sink), 'collection', 'page', '2')).rejects.toThrow(/accepts request:, run:/);
    expect(sink.files.get('api.frcol')).toBe(files['api.frcol']);
  });
});

describe('removeSetting', () => {
  it('removes a header', async () => {
    const sink = new MemoryCollectionSink(files);
    await setHeader(ctxFor(sink), 'request:users/get.frreq', 'Accept', 'application/json');

    const result = await removeSetting(ctxFor(sink), 'request:users/get.frreq', 'header', 'accept');
    expect(result.changed).toBe(true);
    expect(written(sink, 'users/get.frreq').headers).toEqual([]);
  });

  it('reports no change, and writes nothing, when there is nothing to remove', async () => {
    const sink = new MemoryCollectionSink(files);
    const before = sink.files.get('users/get.frreq');

    const result = await removeSetting(ctxFor(sink), 'request:users/get.frreq', 'header', 'Accept');
    expect(result.changed).toBe(false);
    expect(result.message).toMatch(/nothing to remove/i);
    expect(sink.files.get('users/get.frreq')).toBe(before);
  });

  it('removes a variable from the collection environment', async () => {
    const seeded = {
      ...files,
      'api.frcol': JSON.stringify({
        collectionGuid: 'c1', selectedEnvironmentId: 'e1', environments: [{ name: 'Production', id: 'e1' }],
        collectionEnvironment: { name: 'system.settings', id: '', variables: [{ variable: 'host', value: 'x', active: true, id: 'v1' }] }
      })
    };
    const sink = new MemoryCollectionSink(seeded);

    const result = await removeSetting(ctxFor(sink), 'collection', 'variable', 'host');
    expect(result.changed).toBe(true);
    expect(written(sink, 'api.frcol').collectionEnvironment.variables).toEqual([]);
  });

  it('removes a secret reference from a folder', async () => {
    const seeded = {
      ...files,
      'users/folder.frfolder': JSON.stringify({ folderId: 'f1', secrets: [{ $secret: 'token', active: true, id: 's1' }] })
    };
    const sink = new MemoryCollectionSink(seeded);

    const result = await removeSetting(ctxFor(sink), 'folder:users', 'secret', 'token');
    expect(result.changed).toBe(true);
    expect(written(sink, 'users/folder.frfolder').secrets).toEqual([]);
  });

  it('refuses a request locator for a variable, which has nowhere to live on a request', async () => {
    const sink = new MemoryCollectionSink(files);
    await expect(removeSetting(ctxFor(sink), 'request:users/get.frreq', 'variable', 'host'))
      .rejects.toThrow(/accepts collection, env:, folder:, run:/);
  });

  it('removes a validation header from a run', async () => {
    const seeded = {
      ...files,
      'users/get.frreq': JSON.stringify({
        id: 'r1', name: 'Get user', verb: 'get', url: 'https://x/u',
        runs: [{
          id: 'n1', name: 'not found',
          validation: { type: 'Match', headers: [{ key: 'x-trace', value: '1', active: true, id: 'v1' }] }
        }]
      })
    };
    const sink = new MemoryCollectionSink(seeded);

    const result = await removeSetting(
      ctxFor(sink), 'run:users/get.frreq#not found', 'validation-header', 'X-Trace');
    expect(result.changed).toBe(true);
    expect(written(sink, 'users/get.frreq').runs[0].validation.headers).toEqual([]);
  });
});
