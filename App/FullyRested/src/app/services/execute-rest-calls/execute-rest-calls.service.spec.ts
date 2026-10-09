import { TestBed } from '@angular/core/testing';
import {
  CollectionConfig, CollectionNode, CreateEmptyAction, CreateEmptyEnvironment, CreateEmptyFolderConfig, FolderNode,
  IExecuteRestAction, normaliseCollectionConfig,
} from '@fullyrested/core';

import { ExecuteRestCallsService } from './execute-rest-calls.service';

const variable = (name: string, value: string) => ({ variable: name, value, active: true, id: name });

function rootNode(): CollectionNode {
  return new CollectionNode(normaliseCollectionConfig({
    collectionGuid: 'c1',
    selectedEnvironmentId: 'prod',
    collectionEnvironment: { ...CreateEmptyEnvironment(), variables: [variable('host', 'collection.example'), variable('version', 'v1')] },
    environments: [
      { ...CreateEmptyEnvironment(), id: 'test', name: 'test', variables: [variable('host', 'test.example')] },
      { ...CreateEmptyEnvironment(), id: 'prod', name: 'prod', variables: [variable('host', 'prod.example')] },
    ],
  } as CollectionConfig), 'api.frcol');
}

function nodeFor(url: string, root = rootNode()) {
  return root.attach({ ...CreateEmptyAction(), url }, 'a.frreq');
}

describe('ExecuteRestCallsService', () => {
  let service: ExecuteRestCallsService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ExecuteRestCallsService);
  });

  afterEach(() => delete (window as any).ipc);

  it('answers with the mock response in browser mode (no Electron ipc)', async () => {
    const result = await service.executeNode(nodeFor('anything.example'));
    expect(result.status).toBe(200);
    expect(result.body?.contentType).toContain('application/json');
  });

  it('sends the request to the main process with the selected environment then the collection substituted', async () => {
    const sent: IExecuteRestAction[] = [];
    (window as any).ipc = {
      invoke: (channel: string, args: IExecuteRestAction) => {
        expect(channel).toBe('testRest');
        sent.push(args);
        return Promise.resolve({ status: 204 });
      }
    };

    const result = await service.executeNode(nodeFor('{{host}}/{{version}}/todos'), 'prod');

    expect(result.status).toBe(204);
    expect(sent.length).toBe(1);
    expect(sent[0].url).toBe('prod.example/v1/todos');
  });

  it('reports how long the request took and how big the body was', async () => {
    (window as any).ipc = {
      invoke: () => Promise.resolve({ status: 200, body: { contentType: 'text/plain', body: new Uint8Array(42).buffer } })
    };

    const result = await service.executeNode(nodeFor('x.example'));

    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.sizeBytes).toBe(42);
  });

  it('sends the request resolved through its folders', async () => {
    const sent: any[] = [];
    (window as any).ipc = {
      invoke: async (channel: string, request: any) => {
        sent.push([channel, request]);
        return { status: 200, statusText: 'OK', headers: {}, headersSent: {}, body: undefined, validated: undefined };
      },
    };
    const root = rootNode();
    const folder = new FolderNode(root, 'f', { ...CreateEmptyFolderConfig('f'), headers: [{ key: 'x-folder', value: 'yes', active: true, id: 'h' }] }, true);
    root.children.push(folder);

    const result = await service.executeNode(root.attach({ ...CreateEmptyAction(), url: 'example.com' }, 'f/a.frreq'));

    expect(sent[0][0]).toBe('testRest');
    expect(sent[0][1].headers['x-folder']).toBe('yes');
    expect(result.status).toBe(200);
  });
});
