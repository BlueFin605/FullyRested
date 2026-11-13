import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { addSecretRef, setVariable } from '../src/authoring';
import { MemoryCollectionSink } from '../src/collection-sink';
import { QueryError } from '../src/query-error';
import { files } from './fixtures/collection';

const guid = { generateGUID: () => 'generated' };

// A fresh spy per test, so 'set was never called' means never called by that test.
let secrets: { get: () => Promise<null>; set: Mock<(service: string, account: string, value: string) => Promise<void>> };
beforeEach(() => {
  secrets = { get: async () => null, set: vi.fn(async () => { }) };
});

const ctxFor = (sink: MemoryCollectionSink) =>
  ({ collectionFile: 'api.frcol', source: sink, sink, secrets, guid });

const written = (sink: MemoryCollectionSink, file: string) => JSON.parse(sink.files.get(file)!);

describe('setVariable', () => {
  it('sets a variable on the collection environment', async () => {
    const sink = new MemoryCollectionSink(files);
    const result = await setVariable(ctxFor(sink), 'collection', 'host', 'api.example.com');
    expect(result).toMatchObject({ file: 'api.frcol', scope: 'collection', changed: true });
    const config = written(sink, 'api.frcol');
    expect(config.collectionEnvironment.variables)
      .toEqual([{ variable: 'host', value: 'api.example.com', active: true, id: 'generated' }]);
    expect(config.environments[0].variables).toEqual([]);
  });

  it('sets a variable on a named environment', async () => {
    const sink = new MemoryCollectionSink(files);
    const result = await setVariable(ctxFor(sink), 'env:Production', 'host', 'api.example.com');
    expect(result).toMatchObject({ file: 'api.frcol', changed: true });
    const config = written(sink, 'api.frcol');
    expect(config.environments[0].variables)
      .toEqual([{ variable: 'host', value: 'api.example.com', active: true, id: 'generated' }]);
    expect(config.collectionEnvironment.variables).toEqual([]);
  });

  it('sets a variable on a folder', async () => {
    const sink = new MemoryCollectionSink(files);
    const result = await setVariable(ctxFor(sink), 'folder:users', 'host', 'api.example.com');
    expect(result).toMatchObject({ file: 'users/folder.frfolder', changed: true });
    expect(written(sink, 'users/folder.frfolder').variables)
      .toEqual([{ variable: 'host', value: 'api.example.com', active: true, id: 'generated' }]);
  });

  it('sets a variable on a run', async () => {
    const sink = new MemoryCollectionSink(files);
    const result = await setVariable(ctxFor(sink), 'run:users/get.frreq#not found', 'host', 'api.example.com');
    expect(result).toMatchObject({ file: 'users/get.frreq', changed: true });
    expect(written(sink, 'users/get.frreq').runs[0].variables)
      .toEqual([{ variable: 'host', value: 'api.example.com', active: true, id: 'generated' }]);
  });

  it('refuses a request locator, saying where a variable can go instead', async () => {
    const sink = new MemoryCollectionSink(files);
    const edit = () => setVariable(ctxFor(sink), 'request:users/get.frreq', 'host', 'api.example.com');
    await expect(edit()).rejects.toThrow(QueryError);
    await expect(edit()).rejects.toThrow(/accepts collection, env:, folder:, run:/);
    await expect(edit()).rejects.toThrow(/no variables of its own/);
    expect(sink.files.get('users/get.frreq')).toBe(files['users/get.frreq']);
  });

  it('replaces a variable of the same name rather than duplicating it, keeping its id', async () => {
    const seeded = {
      ...files,
      'users/folder.frfolder': JSON.stringify({
        folderId: 'f1', variables: [{ variable: 'host', value: 'old', active: true, id: 'v1' }]
      })
    };
    const sink = new MemoryCollectionSink(seeded);

    const result = await setVariable(ctxFor(sink), 'folder:users', 'host', 'new');
    expect(result.changed).toBe(true);
    expect(written(sink, 'users/folder.frfolder').variables)
      .toEqual([{ variable: 'host', value: 'new', active: true, id: 'v1' }]);
  });

  it('treats a name differing only in case as a different variable, as substitution does', async () => {
    const sink = new MemoryCollectionSink(files);
    await setVariable(ctxFor(sink), 'folder:users', 'host', 'lower');
    const result = await setVariable(ctxFor(sink), 'folder:users', 'HOST', 'upper');

    expect(result.changed).toBe(true);
    expect(written(sink, 'users/folder.frfolder').variables).toEqual([
      { variable: 'host', value: 'lower', active: true, id: 'generated' },
      { variable: 'HOST', value: 'upper', active: true, id: 'generated' }
    ]);
  });

  it('reports no change, and writes nothing, when the variable already has that value', async () => {
    const sink = new MemoryCollectionSink(files);
    await setVariable(ctxFor(sink), 'folder:users', 'host', 'api.example.com');
    const before = sink.files.get('users/folder.frfolder');

    const result = await setVariable(ctxFor(sink), 'folder:users', 'host', 'api.example.com');
    expect(result.changed).toBe(false);
    expect(sink.files.get('users/folder.frfolder')).toBe(before);
  });
});

describe('addSecretRef', () => {
  it('writes a reference with no value, and never touches the secret store', async () => {
    const sink = new MemoryCollectionSink(files);
    const result = await addSecretRef(ctxFor(sink), 'folder:users', 'token');
    expect(result).toMatchObject({ file: 'users/folder.frfolder', changed: true });

    const text = sink.files.get('users/folder.frfolder')!;
    expect(text).not.toContain('$value');
    expect(written(sink, 'users/folder.frfolder').secrets)
      .toEqual([{ $secret: 'token', active: true, id: 'generated' }]);
    expect(secrets.set).not.toHaveBeenCalled();
  });

  it('adds a reference at the collection, an environment and a run', async () => {
    const sink = new MemoryCollectionSink(files);
    await addSecretRef(ctxFor(sink), 'collection', 'token');
    await addSecretRef(ctxFor(sink), 'env:Production', 'token');
    await addSecretRef(ctxFor(sink), 'run:users/get.frreq#not found', 'token');

    const config = written(sink, 'api.frcol');
    expect(config.collectionEnvironment.secrets).toEqual([{ $secret: 'token', active: true, id: 'generated' }]);
    expect(config.environments[0].secrets).toEqual([{ $secret: 'token', active: true, id: 'generated' }]);
    expect(written(sink, 'users/get.frreq').runs[0].secrets)
      .toEqual([{ $secret: 'token', active: true, id: 'generated' }]);
    expect(secrets.set).not.toHaveBeenCalled();
  });

  it('is idempotent: a reference of that name already there reports no change', async () => {
    const sink = new MemoryCollectionSink(files);
    await addSecretRef(ctxFor(sink), 'folder:users', 'token');
    const before = sink.files.get('users/folder.frfolder');

    const result = await addSecretRef(ctxFor(sink), 'folder:users', 'token');
    expect(result.changed).toBe(false);
    expect(sink.files.get('users/folder.frfolder')).toBe(before);
    expect(secrets.set).not.toHaveBeenCalled();
  });

  it('matches an existing reference case-sensitively, as substitution does', async () => {
    const sink = new MemoryCollectionSink(files);
    await addSecretRef(ctxFor(sink), 'folder:users', 'token');

    const result = await addSecretRef(ctxFor(sink), 'folder:users', 'TOKEN');
    expect(result.changed).toBe(true);
    expect(written(sink, 'users/folder.frfolder').secrets).toEqual([
      { $secret: 'token', active: true, id: 'generated' },
      { $secret: 'TOKEN', active: true, id: 'generated' }
    ]);
  });

  it('refuses a request locator, saying where a secret reference can go instead', async () => {
    const sink = new MemoryCollectionSink(files);
    const edit = () => addSecretRef(ctxFor(sink), 'request:users/get.frreq', 'token');
    await expect(edit()).rejects.toThrow(QueryError);
    await expect(edit()).rejects.toThrow(/accepts collection, env:, folder:, run:/);
    await expect(edit()).rejects.toThrow(/no secrets of its own/);
    expect(sink.files.get('users/get.frreq')).toBe(files['users/get.frreq']);
  });

  it('is idempotent: a disabled reference of that name is left disabled', async () => {
    const seeded = {
      ...files,
      'users/folder.frfolder': JSON.stringify({
        folderId: 'f1', secrets: [{ $secret: 'token', active: false, id: 's1' }]
      })
    };
    const sink = new MemoryCollectionSink(seeded);

    const result = await addSecretRef(ctxFor(sink), 'folder:users', 'token');
    expect(result.changed).toBe(false);
    expect(written(sink, 'users/folder.frfolder').secrets)
      .toEqual([{ $secret: 'token', active: false, id: 's1' }]);
    expect(secrets.set).not.toHaveBeenCalled();
  });
});
