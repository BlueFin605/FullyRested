import { BehaviorSubject } from 'rxjs';
import { CollectionConfig, CollectionNode, CreateEmptyAction, normaliseCollectionConfig } from '@fullyrested/core';
import { RestActionRunComponent } from './rest-action-run.component';

// Built without running the constructor: only the fields inheritedNode reads are set.
describe('RestActionRunComponent inheritedNode', () => {
  function setup() {
    const root = new CollectionNode(normaliseCollectionConfig({} as CollectionConfig), 'api');
    const component = Object.create(RestActionRunComponent.prototype) as any;
    component.action = CreateEmptyAction();
    component.fullFilename = '';
    component._runId = 'r1';
    component.trees = { tree: new BehaviorSubject(root), nodeFor: (action: any) => root.attach(action, undefined) };
    return { component: component as RestActionRunComponent, trees: component.trees, root };
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
});
