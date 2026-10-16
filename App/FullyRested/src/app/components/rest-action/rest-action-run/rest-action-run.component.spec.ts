import { BehaviorSubject } from 'rxjs';
import { CollectionConfig, CollectionNode, CreateEmptyAction, normaliseCollectionConfig } from '@fullyrested/core';
import { RestActionRunComponent } from './rest-action-run.component';
import { LatestResultsService, resultKey } from 'src/app/services/latest-results/latest-results.service';
import { EmptyActionResult } from 'src/app/services/execute-rest-calls/execute-rest-calls.service';

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

describe('RestActionRunComponent shared results', () => {
  const result = { ...EmptyActionResult, status: '200', statusText: 'OK' } as any;

  function setup() {
    const root = new CollectionNode(normaliseCollectionConfig({} as CollectionConfig), 'api');
    const latest = new LatestResultsService();
    const component = Object.create(RestActionRunComponent.prototype) as any;
    component.action = CreateEmptyAction();
    component.fullFilename = 'c:/api/a.frreq';
    component._runId = 'r1';
    component.latest = latest;
    component.sending = false;
    component.response = EmptyActionResult;
    component.trees = { tree: new BehaviorSubject(root), nodeFor: (action: any) => root.attach(action, 'a.frreq') };
    component.era = { executeNode: async (node: any) => (latest.set(resultKey(undefined, node.path, 'r1'), result), result) };
    return { component: component as RestActionRunComponent, latest };
  }

  it('shows the stored result for this run on init', () => {
    const { component, latest } = setup();
    latest.set(resultKey(undefined, 'a.frreq', 'r1'), result);
    component.ngOnInit();
    expect(component.response).toBe(result);
  });

  it('ignores the request result and other runs', () => {
    const { component, latest } = setup();
    component.ngOnInit();
    latest.set(resultKey(undefined, 'a.frreq'), result);
    latest.set(resultKey(undefined, 'a.frreq', 'r2'), result);
    expect(component.response).toBe(EmptyActionResult);
  });

  it('follows store updates while open', () => {
    const { component, latest } = setup();
    component.ngOnInit();
    latest.set(resultKey(undefined, 'a.frreq', 'r1'), result);
    expect(component.response).toBe(result);
  });

  it('stops following after destroy', () => {
    const { component, latest } = setup();
    component.ngOnInit();
    component.ngOnDestroy();
    latest.set(resultKey(undefined, 'a.frreq', 'r1'), result);
    expect(component.response).toBe(EmptyActionResult);
  });

  it('Send shows its result; executeNode is the only writer', async () => {
    const { component, latest } = setup();
    const set = spyOn(latest, 'set').and.callThrough();
    component.ngOnInit();
    await component.executeAction();
    expect(set).toHaveBeenCalledTimes(1);
    expect(component.response).toBe(result);
    expect(latest.get(resultKey(undefined, 'a.frreq', 'r1'))).toBe(result);
  });
});
