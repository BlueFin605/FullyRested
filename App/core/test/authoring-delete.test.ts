import { describe, expect, it } from 'vitest';
import { MemoryCollectionSink } from '../src/collection-sink';
import { remove } from '../src/authoring';
import { QueryError } from '../src/query-error';
import { files } from './fixtures/collection';

let n = 0;
const guid = { generateGUID: () => `g${++n}` };
const secrets = { get: async () => null, set: async () => { } };
const ctxFor = (sink: MemoryCollectionSink) => ({ collectionFile: 'api.frcol', source: sink, sink, secrets, guid });

describe('delete', () => {
  describe('env:', () => {
    it('removes the Environment from the collection, leaving selectedEnvironmentId alone when it was not the one removed', async () => {
      const sink = new MemoryCollectionSink({
        ...files,
        'api.frcol': JSON.stringify({
          collectionGuid: 'c1',
          environments: [{ name: 'Production', id: 'e1' }, { name: 'Staging', id: 'e2' }],
          selectedEnvironmentId: 'e1'
        })
      });
      const result = await remove(ctxFor(sink), 'env:Staging');
      expect(result).toMatchObject({ file: 'api.frcol', changed: true });
      const config = JSON.parse(sink.files.get('api.frcol')!);
      expect(config.environments).toMatchObject([{ name: 'Production', id: 'e1' }]);
      expect(config.selectedEnvironmentId).toBe('e1');
    });

    it('moves selectedEnvironmentId to the first remaining environment when the selected one is deleted', async () => {
      const sink = new MemoryCollectionSink({
        ...files,
        'api.frcol': JSON.stringify({
          collectionGuid: 'c1',
          environments: [{ name: 'Production', id: 'e1' }, { name: 'Staging', id: 'e2' }],
          selectedEnvironmentId: 'e1'
        })
      });
      const result = await remove(ctxFor(sink), 'env:Production');
      expect(result.changed).toBe(true);
      const config = JSON.parse(sink.files.get('api.frcol')!);
      expect(config.environments).toMatchObject([{ name: 'Staging', id: 'e2' }]);
      expect(config.selectedEnvironmentId).toBe('e2');
    });

    it("clears selectedEnvironmentId to '' when the last environment is deleted", async () => {
      const sink = new MemoryCollectionSink(files); // fixture has exactly one environment, selected
      const result = await remove(ctxFor(sink), 'env:Production');
      expect(result.changed).toBe(true);
      const config = JSON.parse(sink.files.get('api.frcol')!);
      expect(config.environments).toEqual([]);
      expect(config.selectedEnvironmentId).toBe('');
    });
  });

  describe('run:', () => {
    it('removes the RestActionRun from the .frreq', async () => {
      const sink = new MemoryCollectionSink(files);
      const result = await remove(ctxFor(sink), 'run:users/get.frreq#not found');
      expect(result).toMatchObject({ file: 'users/get.frreq', changed: true });
      const action = JSON.parse(sink.files.get('users/get.frreq')!);
      expect(action.runs).toEqual([]);
    });
  });

  describe('request:', () => {
    it('removes the .frreq via the sink', async () => {
      const sink = new MemoryCollectionSink(files);
      const result = await remove(ctxFor(sink), 'request:users/get.frreq');
      expect(result).toMatchObject({ file: 'users/get.frreq', changed: true });
      expect(await sink.exists('users/get.frreq')).toBe(false);
      // the sibling folder and its settings file are untouched
      expect(await sink.exists('users/folder.frfolder')).toBe(true);
    });
  });

  describe('folder:', () => {
    it('removes the directory and everything beneath it when every file is a request (current or legacy extension) or folder.frfolder', async () => {
      const sink = new MemoryCollectionSink({
        ...files,
        'users/legacy.reasyreq': 'legacy request body' // REConstants.LegacyActionExtension
      });
      const result = await remove(ctxFor(sink), 'folder:users');
      expect(result.changed).toBe(true);
      expect(await sink.exists('users')).toBe(false);
      expect(await sink.exists('users/folder.frfolder')).toBe(false);
      expect(await sink.exists('users/get.frreq')).toBe(false);
      expect(await sink.exists('users/legacy.reasyreq')).toBe(false);
      // sibling untouched
      expect(await sink.exists('orders/list.frreq')).toBe(true);
    });

    it('refuses a folder holding a stray file, naming it, and removes nothing', async () => {
      const sink = new MemoryCollectionSink({
        ...files,
        'users/notes.md': 'do not delete me'
      });
      await expect(remove(ctxFor(sink), 'folder:users')).rejects.toThrow(QueryError);
      await expect(remove(ctxFor(sink), 'folder:users')).rejects.toThrow(/notes\.md/);

      // nothing was removed
      expect(await sink.exists('users/folder.frfolder')).toBe(true);
      expect(await sink.exists('users/get.frreq')).toBe(true);
      expect(await sink.exists('users/notes.md')).toBe(true);
    });
  });

  it('refuses the collection locator', async () => {
    const sink = new MemoryCollectionSink(files);
    await expect(remove(ctxFor(sink), 'collection')).rejects.toThrow(QueryError);
  });
});
