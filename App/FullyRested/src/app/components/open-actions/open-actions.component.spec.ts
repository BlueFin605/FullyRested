import { BehaviorSubject } from 'rxjs';
import { CollectionNode, CreateEmptyFolderConfig, FolderNode, normaliseCollectionConfig, CollectionConfig } from '@fullyrested/core';
import { OpenActionsComponent } from './open-actions.component';

// The component's constructor wires the whole shell, so these tests build it without running it
// and set only the fields the folder settings pane touches.
describe('OpenActionsComponent folder settings', () => {
  const folderHostPath = '/work/api/users';

  function setup() {
    const root = new CollectionNode(normaliseCollectionConfig({} as CollectionConfig), 'api');
    const folder = new FolderNode(root, 'api/users', CreateEmptyFolderConfig(''), false);
    root.children.push(folder);

    const component = Object.create(OpenActionsComponent.prototype) as any;
    component.collection = { path: '/work', name: 'api', filename: '/work/api.frcollection', config: root.config };
    component.trees = { tree: new BehaviorSubject(root) };
    component.systemSupport = { generateGUID: () => 'new-guid' };
    component.selectedTab = { selectedType: '', selectedSubType: '', selectedKey: '', runkey: undefined };
    component.selectedFolderPath = '';
    component.folderSaveError = '';
    component.repo = { saveFolder: jasmine.createSpy('saveFolder').and.resolveTo() };
    component.trees.reload = jasmine.createSpy('reload').and.callFake(async () => {
      // a reload builds new nodes
      const fresh = new CollectionNode(root.config, 'api');
      fresh.children.push(new FolderNode(fresh, 'api/users', CreateEmptyFolderConfig('x'), true));
      component.trees.tree.next(fresh);
      component.onTreeChange();
    });
    return { component: component as OpenActionsComponent, folder, root };
  }

  it('follows the tree to the new node after a save', async () => {
    const { component, folder } = setup();
    component.openFolderSettings(folderHostPath);

    await component.saveFolderSettings();

    expect(component.selectedFolder).toBeDefined();
    expect(component.selectedFolder).not.toBe(folder);
    expect((component as any).trees.tree.value.find('api/users')).toBe(component.selectedFolder);
  });

  it('tells the tree which folder it just saved', async () => {
    const { component } = setup();
    component.openFolderSettings(folderHostPath);
    await component.saveFolderSettings();
    expect((component as any).trees.reload).toHaveBeenCalledWith({ refreshed: 'api/users' });
  });

  it('hides the pane when the folder disappears from the tree', () => {
    const { component, root } = setup();
    component.openFolderSettings(folderHostPath);
    root.children.length = 0;
    component.onTreeChange();
    expect(component.selectedFolder).toBeUndefined();
    expect(component.folderSettingsVisible()).toBeFalse();
    // back to the open requests, not a blank workspace
    expect(component.selectedTab.selectedType).toBe('');
    expect(component.actionsVisible()).toBeTrue();
  });

  it('keeps the message when saving fails', async () => {
    const { component } = setup();
    component.openFolderSettings(folderHostPath);
    (component as any).repo.saveFolder.and.rejectWith(new Error('disk full'));

    await component.saveFolderSettings();

    expect(component.folderSaveError).toBe('Could not save: disk full');
    expect((component as any).trees.reload).not.toHaveBeenCalled();
  });

  it('says the save worked when only the reload after it fails', async () => {
    const { component } = setup();
    component.openFolderSettings(folderHostPath);
    (component as any).trees.reload.and.rejectWith(new Error('folder gone'));

    await component.saveFolderSettings();

    expect((component as any).repo.saveFolder).toHaveBeenCalled();
    expect(component.folderSaveError).toBe('Saved, but the collection could not be reloaded: folder gone');
  });

  it('falls back to an empty environment for a headers key naming an unknown environment', () => {
    const { component } = setup();
    const config = (component as any).collection.config;
    config.environments = [{ ...config.collectionEnvironment, id: 'env1', name: 'Prod', headers: [] }];

    component.openSystem({ type: 'system', subtype: 'headers', key: 'system.settings.environments.gone.headers' } as any);

    expect(component.headersVisible()).toBeTrue();
    expect(component.selectedEnvironment).not.toBe(config.collectionEnvironment);
    expect(component.selectedEnvironment).not.toBe(config.environments[0]);
    expect(component.selectedEnvironment.headers).toEqual([]);
  });

  it('opens the pane from the folderSettings command', async () => {
    const { component } = setup();
    await component.onExplorerCommand({
      name: 'folderSettings',
      item: { key: folderHostPath, type: 'dir', subtype: 'folder', runkey: undefined },
    } as any);
    expect(component.folderSettingsVisible()).toBeTrue();
  });

  it('opens the folder, giving it an id when it had none', () => {
    const { component, folder } = setup();
    expect(component.folderSettingsVisible()).toBeFalse();

    component.openFolderSettings(folderHostPath);

    expect(component.selectedFolder).toBe(folder);
    expect(folder.config.folderId).toBe('new-guid');
    expect(component.folderSettingsVisible()).toBeTrue();
    expect(component.actionsVisible()).toBeFalse();
  });

  it('points the headers pane at the collection or at one environment', () => {
    const { component } = setup();
    const config = (component as any).collection.config;
    config.environments = [{ ...config.collectionEnvironment, id: 'env1', name: 'Prod', headers: [] }];

    component.openSystem({ type: 'system', subtype: 'headers', key: 'system.settings.headers' } as any);
    expect(component.selectedEnvironment).toBe(config.collectionEnvironment);
    expect(component.headersVisible()).toBeTrue();

    component.openSystem({ type: 'system', subtype: 'headers', key: 'system.settings.environments.env1.headers' } as any);
    expect(component.selectedEnvironment).toBe(config.environments[0]);
  });

  it('does not show the headers pane for a folder', () => {
    const { component } = setup();
    component.openFolderSettings(folderHostPath);
    expect(component.headersVisible()).toBeFalse();
  });

  it('ignores a path that is not a folder in the tree', () => {
    const { component } = setup();
    component.openFolderSettings('/work/api/nothing');
    expect(component.selectedFolder).toBeUndefined();
    expect(component.folderSettingsVisible()).toBeFalse();
  });
});
