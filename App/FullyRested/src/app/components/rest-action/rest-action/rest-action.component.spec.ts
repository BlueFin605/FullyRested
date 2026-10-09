import { BehaviorSubject } from 'rxjs';
import { CollectionConfig, CollectionNode, CreateEmptyAction, normaliseCollectionConfig } from '@fullyrested/core';
import { RestActionComponent } from './rest-action.component';

// Built without running the constructor: only the fields inheritedNode reads are set.
describe('RestActionComponent inheritedNode', () => {
  function setup() {
    const root = new CollectionNode(normaliseCollectionConfig({} as CollectionConfig), 'api');
    const component = Object.create(RestActionComponent.prototype) as any;
    component._action = CreateEmptyAction();
    component._fullFilename = '';
    component.trees = {
      tree: new BehaviorSubject(root),
      nodeFor: (action: any, file: string) => root.attach(action, undefined),
    };
    return { component: component as RestActionComponent, trees: component.trees, root };
  }

  it('returns the same node while nothing it depends on changes', () => {
    const { component } = setup();
    expect(component.inheritedNode).toBe(component.inheritedNode);
  });

  it('builds a new node when the tree reloads', () => {
    const { component, trees, root } = setup();
    const before = component.inheritedNode;
    trees.tree.next(new CollectionNode(root.config, 'api'));
    expect(component.inheritedNode).not.toBe(before);
  });

  it('shows nothing while the tree is loading', () => {
    const { component, trees } = setup();
    trees.nodeFor = () => {
      throw new Error('Collection is still loading');
    };
    trees.tree.next(undefined);
    expect(component.inheritedNode).toBeUndefined();
  });
});
