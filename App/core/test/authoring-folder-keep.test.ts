import { describe, expect, it } from 'vitest';
import { MemoryCollectionSink } from '../src/collection-sink';
import { move, newFolder, remove, rename } from '../src/authoring';
import { treeView } from '../src/inspect';
import { loadCollectionTree } from '../src/tree';

let n = 0;
const guid = { generateGUID: () => `g${++n}` };
const secrets = { get: async () => null, set: async () => { } };
const ctxFor = (sink: MemoryCollectionSink) => ({ collectionFile: 'api.frcol', source: sink, sink, secrets, guid });
const base = () => new MemoryCollectionSink({ 'api.frcol': JSON.stringify({ collectionGuid: 'c1', environments: [] }) });

describe('new folder .gitkeep marker', () => {
  it('writes an empty .gitkeep so git keeps the folder', async () => {
    const sink = base();
    await newFolder(ctxFor(sink), 'users/admin');
    expect(sink.files.get('users/admin/.gitkeep')).toBe('');
    expect(await sink.exists('users/admin/folder.frfolder')).toBe(false);
  });

  it('the empty folder is listed in the tree and the marker is not a request', async () => {
    const sink = base();
    await newFolder(ctxFor(sink), 'users');
    const root = await loadCollectionTree('api.frcol', sink, secrets);
    expect(root.requestNodes()).toEqual([]);
    expect(treeView(root).children).toEqual([{ type: 'folder', name: 'users', path: 'users', children: [] }]);
  });

  it('keeps folders-first then name order', async () => {
    const sink = base();
    sink.files.set('b.frreq', JSON.stringify({ id: 'r1', name: 'b', verb: 'get', url: 'x', runs: [] }));
    await newFolder(ctxFor(sink), 'z');
    await newFolder(ctxFor(sink), 'a');
    const root = await loadCollectionTree('api.frcol', sink, secrets);
    expect(treeView(root).children.map(c => (c as { name: string }).name)).toEqual(['a', 'z', 'b']);
  });

  it('move and rename carry the marker with the folder', async () => {
    const sink = base();
    await newFolder(ctxFor(sink), 'users');
    await move(ctxFor(sink), 'folder:users', 'people');
    expect(sink.files.get('people/.gitkeep')).toBe('');
    await rename(ctxFor(sink), 'folder:people', 'staff');
    expect(sink.files.get('staff/.gitkeep')).toBe('');
    expect(await sink.exists('people')).toBe(false);
  });

  it('delete folder removes a folder holding only the marker', async () => {
    const sink = base();
    await newFolder(ctxFor(sink), 'users');
    await remove(ctxFor(sink), 'folder:users');
    expect(await sink.exists('users')).toBe(false);
  });
});
