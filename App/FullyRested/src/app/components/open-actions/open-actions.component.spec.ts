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
    return { component: component as OpenActionsComponent, folder };
  }

  it('opens the folder, giving it an id when it had none', () => {
    const { component, folder } = setup();
    expect(component.folderSettingsVisible()).toBeFalse();

    component.openFolderSettings(folderHostPath);

    expect(component.selectedFolder).toBe(folder);
    expect(folder.config.folderId).toBe('new-guid');
    expect(component.folderSettingsVisible()).toBeTrue();
    expect(component.actionsVisible()).toBeFalse();
  });

  it('ignores a path that is not a folder in the tree', () => {
    const { component } = setup();
    component.openFolderSettings('/work/api/nothing');
    expect(component.selectedFolder).toBeUndefined();
    expect(component.folderSettingsVisible()).toBeFalse();
  });
});
