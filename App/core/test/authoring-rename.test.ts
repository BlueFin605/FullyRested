import { describe, expect, it } from 'vitest';
import { MemoryCollectionSink } from '../src/collection-sink';
import { rename } from '../src/authoring';
import { QueryError } from '../src/query-error';
import { files } from './fixtures/collection';

let n = 0;
const guid = { generateGUID: () => `g${++n}` };
const secrets = { get: async () => null, set: async () => { } };
const ctxFor = (sink: MemoryCollectionSink) => ({ collectionFile: 'api.frcol', source: sink, sink, secrets, guid });

describe('rename', () => {
  describe('env:', () => {
    it('sets Environment.name, leaving selectedEnvironmentId untouched', async () => {
      const sink = new MemoryCollectionSink(files);
      const result = await rename(ctxFor(sink), 'env:Production', 'Prod');
      expect(result).toMatchObject({ file: 'api.frcol', changed: true });
      const config = JSON.parse(sink.files.get('api.frcol')!);
      expect(config.environments).toMatchObject([{ name: 'Prod', id: 'e1' }]);
      expect(config.selectedEnvironmentId).toBe('e1');
    });

    it('refuses a name another environment already has, listing them', async () => {
      const sink = new MemoryCollectionSink({
        ...files,
        'api.frcol': JSON.stringify({
          collectionGuid: 'c1',
          environments: [{ name: 'Production', id: 'e1' }, { name: 'Staging', id: 'e2' }],
          selectedEnvironmentId: 'e1'
        })
      });
      await expect(rename(ctxFor(sink), 'env:Production', 'Staging')).rejects.toThrow(QueryError);
      await expect(rename(ctxFor(sink), 'env:Production', 'Staging')).rejects.toThrow(/Production, Staging/);
    });
  });

  describe('run:', () => {
    it('sets RestActionRun.name', async () => {
      const sink = new MemoryCollectionSink(files);
      const result = await rename(ctxFor(sink), 'run:users/get.frreq#not found', 'missing');
      expect(result).toMatchObject({ file: 'users/get.frreq', changed: true });
      const action = JSON.parse(sink.files.get('users/get.frreq')!);
      expect(action.runs).toMatchObject([{ id: 'n1', name: 'missing' }]);
    });

    it('refuses a name another run of that request already has', async () => {
      const sink = new MemoryCollectionSink({
        ...files,
        'users/get.frreq': JSON.stringify({
          id: 'r1', name: 'Get user', verb: 'get', url: 'https://x/u',
          runs: [{ id: 'n1', name: 'not found' }, { id: 'n2', name: 'ok' }]
        })
      });
      await expect(rename(ctxFor(sink), 'run:users/get.frreq#not found', 'ok')).rejects.toThrow(QueryError);
      await expect(rename(ctxFor(sink), 'run:users/get.frreq#not found', 'ok')).rejects.toThrow(/not found, ok/);
    });
  });

  describe('request:', () => {
    it("renames the file, keeping action.name when the caller named the request explicitly", async () => {
      // the fixture's get.frreq is named 'Get user', which is not its file stem ('get')
      const sink = new MemoryCollectionSink(files);
      const result = await rename(ctxFor(sink), 'request:users/get.frreq', 'fetch');
      expect(result).toMatchObject({ file: 'users/fetch.frreq', changed: true });
      expect(await sink.exists('users/get.frreq')).toBe(false);
      const action = JSON.parse(sink.files.get('users/fetch.frreq')!);
      expect(action).toMatchObject({ id: 'r1', name: 'Get user', url: 'https://x/u' });
    });

    it("follows the rename when action.name still equalled the old file's stem", async () => {
      const sink = new MemoryCollectionSink({
        ...files,
        'users/get.frreq': JSON.stringify({ id: 'r1', name: 'get', verb: 'get', url: 'https://x/u', runs: [] })
      });
      const result = await rename(ctxFor(sink), 'request:users/get.frreq', 'fetch');
      expect(result).toMatchObject({ file: 'users/fetch.frreq', changed: true });
      const action = JSON.parse(sink.files.get('users/fetch.frreq')!);
      expect(action.name).toBe('fetch');
    });

    it('appends .frreq when newName has no extension', async () => {
      const sink = new MemoryCollectionSink(files);
      const result = await rename(ctxFor(sink), 'request:orders/list.frreq', 'all');
      expect(result.file).toBe('orders/all.frreq');
      expect(await sink.exists('orders/list.frreq')).toBe(false);
      expect(await sink.exists('orders/all.frreq')).toBe(true);
    });

    it('refuses a rename onto an existing file', async () => {
      const sink = new MemoryCollectionSink({
        ...files,
        'users/other.frreq': JSON.stringify({ id: 'r9', name: 'other', verb: 'get', url: 'https://x/o', runs: [] })
      });
      await expect(rename(ctxFor(sink), 'request:users/get.frreq', 'other')).rejects.toThrow(/already exists/);
      // nothing was touched
      expect(await sink.exists('users/get.frreq')).toBe(true);
    });

    it('rejects a newName containing a slash, naming move', async () => {
      const sink = new MemoryCollectionSink(files);
      await expect(rename(ctxFor(sink), 'request:users/get.frreq', 'sub/get')).rejects.toThrow(QueryError);
      await expect(rename(ctxFor(sink), 'request:users/get.frreq', 'sub/get')).rejects.toThrow(/move/);
      await expect(rename(ctxFor(sink), 'request:users/get.frreq', 'sub\\get')).rejects.toThrow(/move/);
    });
  });

  describe('folder:', () => {
    it('renames the directory, carrying a nested request (and folder.frfolder) with it', async () => {
      const sink = new MemoryCollectionSink(files);
      const result = await rename(ctxFor(sink), 'folder:users', 'members');
      expect(result.changed).toBe(true);

      expect(await sink.exists('users')).toBe(false);
      expect(await sink.exists('members/folder.frfolder')).toBe(true);
      expect(await sink.exists('members/get.frreq')).toBe(true);

      const folderConfig = JSON.parse(sink.files.get('members/folder.frfolder')!);
      expect(folderConfig.folderId).toBe('f1'); // unchanged, so keychain entries keep working

      const action = JSON.parse(sink.files.get('members/get.frreq')!);
      expect(action).toMatchObject({ id: 'r1', name: 'Get user', url: 'https://x/u' });
      expect(action.runs).toEqual([{ id: 'n1', name: 'not found' }]);
    });

    it('renames a directory with no folder.frfolder yet', async () => {
      const sink = new MemoryCollectionSink(files);
      const result = await rename(ctxFor(sink), 'folder:orders', 'purchases');
      expect(result.changed).toBe(true);
      expect(await sink.exists('orders')).toBe(false);
      expect(await sink.exists('purchases/list.frreq')).toBe(true);
      expect(await sink.exists('purchases/folder.frfolder')).toBe(false);
    });

    it('refuses a rename onto an existing directory', async () => {
      const sink = new MemoryCollectionSink(files);
      await expect(rename(ctxFor(sink), 'folder:users', 'orders')).rejects.toThrow(/already exists/);
      // nothing was touched
      expect(await sink.exists('users/get.frreq')).toBe(true);
      expect(await sink.exists('orders/list.frreq')).toBe(true);
    });

    it('rejects a newName containing a backslash, naming move', async () => {
      const sink = new MemoryCollectionSink(files);
      await expect(rename(ctxFor(sink), 'folder:users', 'sub\\members')).rejects.toThrow(QueryError);
      await expect(rename(ctxFor(sink), 'folder:users', 'sub\\members')).rejects.toThrow(/move/);
    });
  });

  it('refuses the collection locator, pointing at move', async () => {
    const sink = new MemoryCollectionSink(files);
    await expect(rename(ctxFor(sink), 'collection', 'whatever')).rejects.toThrow(QueryError);
    await expect(rename(ctxFor(sink), 'collection', 'whatever')).rejects.toThrow(/move/);
  });
});
