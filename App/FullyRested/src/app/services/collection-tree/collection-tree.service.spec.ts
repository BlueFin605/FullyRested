import { TestBed } from '@angular/core/testing';
import { CollectionSource, CreateEmptyAction, FolderNode, hostPath } from '@fullyrested/core';
import { mockCollectionSource } from '../mocks/mock-collection-source';
import { ActionRepositoryService } from '../action-repository/action-repository.service';
import { mockCollection } from '../mocks/mock-collection';
import { CollectionTreeService } from './collection-tree.service';

describe('CollectionTreeService (browser mode)', () => {
  async function loaded(): Promise<CollectionTreeService> {
    TestBed.configureTestingModule({});
    const repo = TestBed.inject(ActionRepositoryService);
    const trees = TestBed.inject(CollectionTreeService);
    repo.collections.next(mockCollection);
    await trees.reload();
    return trees;
  }

  it('loads the mock collection folder as a tree', async () => {
    const root = (await loaded()).tree.value!;
    expect(root.folderNodes().map((f) => f.path)).toEqual(['google', 'json']);
    expect((root.find('google') as FolderNode).hasSettingsFile).toBeTrue();
  });

  it('places an open request under the folder its file is in', async () => {
    const trees = await loaded();
    const node = trees.nodeFor(CreateEmptyAction(), hostPath(mockCollection.path, 'google/new.frreq'));
    expect(node.resolve().headers['accept-language']).toBe('en-NZ');
  });

  it('treats an unsaved request as collection-level', async () => {
    const node = (await loaded()).nodeFor(CreateEmptyAction(), '');
    expect(node.resolve().headers['accept-language']).toBeUndefined();
  });

  it('keeps the loaded folders when the same collection re-emits with new settings', async () => {
    const trees = await loaded();
    const before = trees.tree.value;
    const repo = TestBed.inject(ActionRepositoryService);
    repo.collections.next({ ...mockCollection, config: { ...mockCollection.config, selectedEnvironmentId: 'other' } });
    expect(trees.tree.value).toBe(before);
    expect(trees.tree.value!.config.selectedEnvironmentId).toBe('other');
  });

  describe('unsaved folder edits across a reload', () => {
    const googleOf = (trees: CollectionTreeService) => trees.tree.value!.find('google') as FolderNode;

    it('survive a reload from an unrelated save', async () => {
      const trees = await loaded();
      const edited = googleOf(trees).config;
      edited.headers = [{ key: 'x-draft', value: '1', active: true, id: 'd' }];
      await trees.reload();
      expect(googleOf(trees).config).toBe(edited);
    });

    it('are replaced by disk for the folder just saved', async () => {
      const trees = await loaded();
      const edited = googleOf(trees).config;
      await trees.reload({ refreshed: 'google' });
      expect(googleOf(trees).config).not.toBe(edited);
    });

    it('are not carried when the folder was not edited, so a change on disk is picked up', async () => {
      const trees = await loaded();
      const repo = TestBed.inject(ActionRepositoryService);
      const onDisk = JSON.stringify({ folderId: 'mock-folder', variables: [], secrets: [], auth: { authentication: 'inherit' }, headers: [{ key: 'x-pulled', value: '1', active: true, id: 'p' }] });
      const changed: CollectionSource = {
        listDir: (dir) => mockCollectionSource.listDir(dir),
        readText: (file) => (file == 'google/folder.frfolder' ? Promise.resolve(onDisk) : mockCollectionSource.readText(file)),
      };
      spyOn(repo, 'collectionSource').and.returnValue(changed);
      await trees.reload();
      expect(googleOf(trees).config.headers.map((h) => h.key)).toEqual(['x-pulled']);
      expect(trees.isEdited(googleOf(trees))).toBeFalse();
    });

    it('do not count a folder id given when the settings are opened', async () => {
      const trees = await loaded();
      const google = googleOf(trees);
      google.config.folderId = 'assigned';
      expect(trees.isEdited(google)).toBeFalse();
      google.config.variables = [];
      expect(trees.isEdited(google)).toBeTrue();
    });

    it('are not carried from a node that failed to load', async () => {
      const trees = await loaded();
      const edited = googleOf(trees).config;
      googleOf(trees).loadError = { file: 'google/folder.frfolder', message: 'bad' };
      await trees.reload();
      expect(googleOf(trees).config).not.toBe(edited);
    });
  });

  it('has no tree, and nodeFor throws, while another collection is loading', async () => {
    const trees = await loaded();
    const repo = TestBed.inject(ActionRepositoryService);
    spyOn(console, 'error');
    repo.collections.next({ ...mockCollection, filename: 'other.frcollection', name: 'other.frcollection' });
    expect(trees.tree.value).toBeUndefined();
    expect(() => trees.nodeFor(CreateEmptyAction(), '')).toThrowError('Collection is still loading');
  });

  it('marks the root broken when the collection folder cannot be loaded', async () => {
    TestBed.configureTestingModule({});
    const repo = TestBed.inject(ActionRepositoryService);
    const trees = TestBed.inject(CollectionTreeService);
    spyOn(console, 'error');
    repo.collections.next({ ...mockCollection, name: 'missing.frcollection' });
    await trees.reload();
    expect(trees.tree.value!.loadError).toBeDefined();
    expect(() => trees.nodeFor(CreateEmptyAction(), '').resolve()).toThrow();
  });

  it('loads once, with the latest config, when the same collection re-emits before its first load finishes', async () => {
    TestBed.configureTestingModule({});
    const repo = TestBed.inject(ActionRepositoryService);
    const trees = TestBed.inject(CollectionTreeService);
    const source = spyOn(repo, 'collectionSource').and.callThrough();
    repo.collections.next(mockCollection);
    repo.collections.next({ ...mockCollection, config: { ...mockCollection.config, selectedEnvironmentId: 'second' } });
    await trees.reload();
    const settled = trees.tree.value!;
    expect(settled.folderNodes().map((f) => f.path)).toEqual(['google', 'json']);
    expect(settled.config.selectedEnvironmentId).toBe('second');
    expect(source).toHaveBeenCalled();
  });

  it('marks the root broken when the reload after a Save As cannot read the folder', async () => {
    const trees = await loaded();
    const repo = TestBed.inject(ActionRepositoryService);
    spyOn(console, 'error');
    spyOn(repo, 'collectionSource').and.returnValue({
      listDir: () => Promise.reject(new Error('gone')),
      readText: () => Promise.reject(new Error('gone')),
    });
    const settled = new Promise<void>((resolve) => {
      const sub = trees.tree.subscribe((t) => {
        if (t?.loadError != undefined) { sub.unsubscribe(); resolve(); }
      });
    });
    repo.savedAs.next({ id: 'x', fullFilename: hostPath(mockCollection.path, 'Hulu.frreq'), name: 'Hulu' });
    await settled;
    expect(trees.tree.value!.loadError!.message).toContain('gone');
    expect(console.error).toHaveBeenCalled();
    expect(() => trees.nodeFor(CreateEmptyAction(), '').resolve()).toThrow();
  });

  it('keeps a fresh load and the latest config when the collection re-emits mid-reload', async () => {
    TestBed.configureTestingModule({});
    const repo = TestBed.inject(ActionRepositoryService);
    const trees = TestBed.inject(CollectionTreeService);
    repo.collections.next(mockCollection);
    const pending = trees.reload();
    repo.collections.next({ ...mockCollection, config: { ...mockCollection.config, selectedEnvironmentId: 'newer' } });
    await pending;
    expect(trees.tree.value!.folderNodes().length).toBeGreaterThan(0);
    expect(trees.tree.value!.config.selectedEnvironmentId).toBe('newer');
  });
});
