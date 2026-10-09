import { TestBed } from '@angular/core/testing';
import { CreateEmptyAction, FolderNode, hostPath } from '@fullyrested/core';
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
