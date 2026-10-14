import { describe, expect, it } from 'vitest';
import { MemoryCollectionSink } from '../src/collection-sink';
import { move } from '../src/authoring';
import { showRequest } from '../src/inspect';
import { QueryError } from '../src/query-error';
import { RequestNode } from '../src/scope';
import { loadCollectionTree } from '../src/tree';
import { files } from './fixtures/collection';

let n = 0;
const guid = { generateGUID: () => `g${++n}` };
const secrets = { get: async () => null, set: async () => { } };
const ctxFor = (sink: MemoryCollectionSink) => ({ collectionFile: 'api.frcol', source: sink, sink, secrets, guid });

describe('move', () => {
  describe('request:', () => {
    it('moves the file into another folder, leaving content and ids untouched', async () => {
      const sink = new MemoryCollectionSink(files);
      const before = sink.files.get('users/get.frreq')!;

      const result = await move(ctxFor(sink), 'request:users/get.frreq', 'orders/get.frreq');

      expect(result).toMatchObject({ file: 'orders/get.frreq', changed: true });
      expect(await sink.exists('users/get.frreq')).toBe(false);
      expect(sink.files.get('orders/get.frreq')).toBe(before);
      const action = JSON.parse(sink.files.get('orders/get.frreq')!);
      expect(action).toMatchObject({ id: 'r1', name: 'Get user', url: 'https://x/u' });
      expect(action.runs).toEqual([{ id: 'n1', name: 'not found' }]);
    });

    it('names the old and new inheritance in the message, using show_request\'s scope vocabulary', async () => {
      const sink = new MemoryCollectionSink(files);
      const result = await move(ctxFor(sink), 'request:users/get.frreq', 'orders/get.frreq');
      expect(result.message).toBe('Moved users/get.frreq to orders/get.frreq; it now inherits from folder:orders instead of folder:users');
    });

    it("names the collection root (collection:<name>) when the destination has no folder", async () => {
      const sink = new MemoryCollectionSink(files);
      const result = await move(ctxFor(sink), 'request:users/get.frreq', 'get.frreq');
      expect(result.message).toBe('Moved users/get.frreq to get.frreq; it now inherits from collection:api instead of folder:users');
    });

    it('names the collection root (collection:<name>) as the source when the request started at the collection root', async () => {
      const sink = new MemoryCollectionSink({ ...files, 'top.frreq': JSON.stringify({ id: 'r4', name: 'top', verb: 'get', url: 'https://x/t', runs: [] }) });
      const result = await move(ctxFor(sink), 'request:top.frreq', 'orders/top.frreq');
      expect(result.message).toBe('Moved top.frreq to orders/top.frreq; it now inherits from folder:orders instead of collection:api');
    });

    it('names each chain exactly as show_request would report it as the source of an inherited value', async () => {
      // Pins the consistency the string format alone cannot: whatever scope name move's message
      // uses for a request's parent, show_request must report the exact same string as the source
      // of a value the request inherits from that scope. Covers both a folder parent and the
      // collection root, each via a header only that scope sets.
      const sink = new MemoryCollectionSink({
        'api.frcol': JSON.stringify({
          collectionGuid: 'c1', environments: [{ name: 'Production', id: 'e1' }], selectedEnvironmentId: 'e1',
          collectionEnvironment: { name: 'system.settings', variables: [], secrets: [], auth: { authentication: 'none' },
            headers: [{ key: 'x-root', value: 'r', active: true, id: 'ch1' }] }
        }),
        'users/get.frreq': JSON.stringify({ id: 'r1', name: 'Get user', verb: 'get', url: 'https://x/u', runs: [] }),
        'orders/folder.frfolder': JSON.stringify({
          folderId: 'f9', variables: [], secrets: [], auth: { authentication: 'inherit' },
          headers: [{ key: 'x-orders', value: 'o', active: true, id: 'h1' }]
        })
      });

      const toFolder = await move(ctxFor(sink), 'request:users/get.frreq', 'orders/get.frreq');
      const afterFolderMove = await loadCollectionTree('api.frcol', sink, secrets);
      const inFolder = afterFolderMove.find('orders/get.frreq') as RequestNode;
      const folderHeaderSource = showRequest(inFolder).headers.find(h => h.key === 'x-orders')!.source;
      expect(toFolder.message).toContain(folderHeaderSource); // the new chain, e.g. 'folder:orders'

      const toRoot = await move(ctxFor(sink), 'request:orders/get.frreq', 'get.frreq');
      const afterRootMove = await loadCollectionTree('api.frcol', sink, secrets);
      const atRoot = afterRootMove.find('get.frreq') as RequestNode;
      const collectionHeaderSource = showRequest(atRoot).headers.find(h => h.key === 'x-root')!.source;
      expect(toRoot.message).toContain(collectionHeaderSource); // the new chain, e.g. 'collection:api'
      expect(toRoot.message).toContain(folderHeaderSource); // the old chain it moved out of
    });

    it('says nothing about inheritance when the folder does not change', async () => {
      const sink = new MemoryCollectionSink(files);
      const result = await move(ctxFor(sink), 'request:users/get.frreq', 'users/fetch.frreq');
      expect(result.message).toBe('Moved users/get.frreq to users/fetch.frreq');
    });

    it('refuses a move onto an existing path, touching nothing', async () => {
      const sink = new MemoryCollectionSink(files);
      await expect(move(ctxFor(sink), 'request:users/get.frreq', 'orders/list.frreq')).rejects.toThrow(QueryError);
      await expect(move(ctxFor(sink), 'request:users/get.frreq', 'orders/list.frreq')).rejects.toThrow(/already exists/);
      expect(await sink.exists('users/get.frreq')).toBe(true);
      const action = JSON.parse(sink.files.get('orders/list.frreq')!);
      expect(action.id).toBe('r2');
    });

    it('refuses a newPath not ending in .frreq, touching nothing', async () => {
      const sink = new MemoryCollectionSink(files);
      await expect(move(ctxFor(sink), 'request:users/get.frreq', 'orders/get.txt')).rejects.toThrow(QueryError);
      await expect(move(ctxFor(sink), 'request:users/get.frreq', 'orders/get.txt')).rejects.toThrow(/\.frreq/);
      expect(await sink.exists('users/get.frreq')).toBe(true);
      expect(await sink.exists('orders/get.txt')).toBe(false);
    });

    it('no-ops when newPath is the same as the current path', async () => {
      const sink = new MemoryCollectionSink(files);
      const before = JSON.stringify(Object.fromEntries(sink.files));

      const result = await move(ctxFor(sink), 'request:users/get.frreq', 'users/get.frreq');

      expect(result).toMatchObject({ file: 'users/get.frreq', changed: false });
      expect(JSON.stringify(Object.fromEntries(sink.files))).toBe(before);
    });
  });

  describe('folder:', () => {
    it('moves the directory with nested content, byte-identical, old path gone', async () => {
      const sink = new MemoryCollectionSink({
        ...files,
        'users/admin/folder.frfolder': JSON.stringify({ folderId: 'f2' }),
        'users/admin/roles/list.frreq': JSON.stringify({ id: 'r3', name: 'List roles', verb: 'get', url: 'https://x/roles', runs: [] })
      });

      const result = await move(ctxFor(sink), 'folder:users', 'archive/users');

      expect(result).toMatchObject({ file: 'archive/users', changed: true });
      expect(await sink.exists('archive/users/folder.frfolder')).toBe(true);
      expect(await sink.exists('archive/users/get.frreq')).toBe(true);
      expect(await sink.exists('archive/users/admin/folder.frfolder')).toBe(true);
      expect(await sink.exists('archive/users/admin/roles/list.frreq')).toBe(true);

      expect(await sink.exists('users')).toBe(false);
      expect(await sink.exists('users/admin/folder.frfolder')).toBe(false);
      expect(await sink.exists('users/admin/roles/list.frreq')).toBe(false);

      const topFolder = JSON.parse(sink.files.get('archive/users/folder.frfolder')!);
      expect(topFolder.folderId).toBe('f1'); // unchanged, so keychain entries keep working

      const getAction = JSON.parse(sink.files.get('archive/users/get.frreq')!);
      expect(getAction).toMatchObject({ id: 'r1', name: 'Get user', url: 'https://x/u' });

      const rolesAction = JSON.parse(sink.files.get('archive/users/admin/roles/list.frreq')!);
      expect(rolesAction).toMatchObject({ id: 'r3', name: 'List roles', url: 'https://x/roles' });
    });

    it('refuses a move onto an existing directory, touching nothing', async () => {
      const sink = new MemoryCollectionSink(files);
      await expect(move(ctxFor(sink), 'folder:users', 'orders')).rejects.toThrow(/already exists/);
      expect(await sink.exists('users/get.frreq')).toBe(true);
      expect(await sink.exists('orders/list.frreq')).toBe(true);
    });

    it('refuses moving a folder into itself, touching nothing', async () => {
      const sink = new MemoryCollectionSink(files);
      await expect(move(ctxFor(sink), 'folder:users', 'users/sub')).rejects.toThrow(QueryError);
      await expect(move(ctxFor(sink), 'folder:users', 'users/sub')).rejects.toThrow(/itself/);
      expect(await sink.exists('users/get.frreq')).toBe(true);
      expect(await sink.exists('users/sub')).toBe(false);
    });

    it('does not mistake a same-prefixed sibling (users2) for nesting inside users', async () => {
      const sink = new MemoryCollectionSink(files);
      const result = await move(ctxFor(sink), 'folder:users', 'users2/sub');
      expect(result.changed).toBe(true);
      expect(await sink.exists('users2/sub/get.frreq')).toBe(true);
      expect(await sink.exists('users2/sub/folder.frfolder')).toBe(true);
      expect(await sink.exists('users')).toBe(false);
    });

    it('no-ops when newPath is the same as the current path', async () => {
      const sink = new MemoryCollectionSink(files);
      const before = JSON.stringify(Object.fromEntries(sink.files));

      const result = await move(ctxFor(sink), 'folder:users', 'users');

      expect(result).toMatchObject({ file: 'users', changed: false });
      expect(JSON.stringify(Object.fromEntries(sink.files))).toBe(before);
    });
  });

  it('refuses the collection locator', async () => {
    const sink = new MemoryCollectionSink(files);
    await expect(move(ctxFor(sink), 'collection', 'whatever.frcol')).rejects.toThrow(QueryError);
  });

  it('refuses a run: locator', async () => {
    const sink = new MemoryCollectionSink(files);
    await expect(move(ctxFor(sink), 'run:users/get.frreq#not found', 'users/other.frreq')).rejects.toThrow(QueryError);
  });
});
