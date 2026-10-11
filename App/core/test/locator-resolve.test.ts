import { describe, expect, it } from 'vitest';
import { MemoryCollectionSink } from '../src/collection-sink';
import { loadCollectionTree } from '../src/tree';
import { parseLocator, resolveLocator } from '../src/locator';
import { QueryError } from '../src/query-error';

const store = { get: async () => null, set: async () => { } };

const files = {
  'api.frcol': JSON.stringify({ collectionGuid: 'c1', environments: [{ name: 'Production', id: 'e1' }], selectedEnvironmentId: 'e1' }),
  'users/folder.frfolder': JSON.stringify({ folderId: 'f1' }),
  'users/get.frreq': JSON.stringify({ id: 'r1', name: 'Get user', verb: 'get', url: 'https://x/u', runs: [{ id: 'n1', name: 'not found' }] }),
  'orders/list.frreq': JSON.stringify({ id: 'r2', name: 'List orders', verb: 'get', url: 'https://x/o' })
};

const tree = async () => loadCollectionTree('api.frcol', new MemoryCollectionSink(files), store);

describe('resolveLocator', () => {
  it('resolves each kind to its document', async () => {
    const root = await tree();
    const at = (t: string) => resolveLocator(root, parseLocator(t));
    expect(at('collection')).toMatchObject({ document: 'collection', file: 'api.frcol', isNew: false });
    expect(at('env:Production')).toMatchObject({ document: 'collection', file: 'api.frcol' });
    expect(at('folder:users')).toMatchObject({ document: 'folder', file: 'users/folder.frfolder', isNew: false });
    expect(at('request:users/get.frreq')).toMatchObject({ document: 'request', file: 'users/get.frreq' });
    expect(at('run:users/get.frreq#not found')).toMatchObject({ document: 'request', file: 'users/get.frreq' });
  });

  it('marks a folder with no settings file as new', async () => {
    const root = await tree();
    expect(resolveLocator(root, parseLocator('folder:orders')))
      .toMatchObject({ document: 'folder', file: 'orders/folder.frfolder', isNew: true });
  });

  it('lists what exists when the target does not', async () => {
    const root = await tree();
    expect(() => resolveLocator(root, parseLocator('folder:nope'))).toThrow(QueryError);
    expect(() => resolveLocator(root, parseLocator('folder:nope'))).toThrow(/users[\s\S]*orders|orders[\s\S]*users/);
    expect(() => resolveLocator(root, parseLocator('env:Staging'))).toThrow(/Production/);
    expect(() => resolveLocator(root, parseLocator('request:users/nope.frreq'))).toThrow(/users\/get.frreq/);
    expect(() => resolveLocator(root, parseLocator('run:users/get.frreq#nope'))).toThrow(/not found/);
  });

  it('rejects an empty request/run path from a bare request:./ or request:/ locator', async () => {
    const root = await tree();
    expect(() => resolveLocator(root, parseLocator('request:./'))).toThrow(QueryError);
    expect(() => resolveLocator(root, parseLocator('request:./'))).toThrow(/users\/get.frreq/);
    expect(() => resolveLocator(root, parseLocator('request:/'))).toThrow(/orders\/list.frreq/);
  });
});
