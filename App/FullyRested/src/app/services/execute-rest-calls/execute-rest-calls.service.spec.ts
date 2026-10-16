import { TestBed } from '@angular/core/testing';
import { CollectionTreeService } from '../collection-tree/collection-tree.service';
import {
  CollectionConfig, CollectionNode, CreateEmptyAction, CreateEmptyEnvironment, CreateEmptyFolderConfig, FolderNode,
  CreateEmptyRestActionValidation, CreateEmptyRestActionRun, IExecuteRestAction, RunNode, RunRecord, ValidationType, normaliseCollectionConfig,
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

  it('checks the response against the request validation', async () => {
    (window as any).ipc = { invoke: async () => ({ status: 404, statusText: 'Not Found', headers: {}, headersSent: {}, body: undefined, validated: undefined }) };
    const node = rootNode().attach({ ...CreateEmptyAction(), url: 'x.example', validation: { ...CreateEmptyRestActionValidation(ValidationType.ResponseCode), httpCode: 200 } }, 'a.frreq');

    const result = await service.executeNode(node);

    expect(result.validated).toBeDefined();
    expect(result.validated!.valid).toBeFalse();
    expect(result.validated!.errors.join(' ')).toContain('200');
  });

  it('rejects without sending when the request cannot be resolved', async () => {
    const invoke = jasmine.createSpy('invoke');
    (window as any).ipc = { invoke };
    const tree = rootNode();
    const folder = new FolderNode(tree, 'f', CreateEmptyFolderConfig('f'), true);
    folder.loadError = { file: 'f/folder.frfolder', message: 'bad json' };
    tree.children.push(folder);

    await expectAsync(service.executeNode(tree.attach(CreateEmptyAction(), 'f/a.frreq'))).toBeRejectedWithError(/f\/folder\.frfolder is invalid/);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('rejects when the main process fails to send', async () => {
    (window as any).ipc = { invoke: () => Promise.reject(new Error('ipc down')) };
    await expectAsync(service.executeNode(nodeFor('x.example'))).toBeRejectedWithError('ipc down');
  });

  describe('recording the send', () => {
    let saved: Promise<{ root: string; record: RunRecord }>;
    let saves: { root: string; record: RunRecord }[];
    let ipcInvoke: jasmine.Spy;

    function openCollection(over: Partial<{ filename: string; path: string }> | undefined) {
      const trees = TestBed.inject(CollectionTreeService) as any;
      Object.defineProperty(trees, 'openCollection', {
        get: () => over == undefined ? undefined : ({ name: 'api', filename: 'C:/c/api.frcol', path: 'C:/c', config: rootNode().config, ...over }),
        configurable: true,
      });
    }

    // stubs ipc per channel and resolves `saved` with the saveRun payload
    function stubIpc(saveRun: () => Promise<void> = async () => undefined) {
      saves = [];
      let resolveSaved!: (v: { root: string; record: RunRecord }) => void;
      saved = new Promise(r => (resolveSaved = r));
      ipcInvoke = jasmine.createSpy('invoke').and.callFake(async (channel: string, args: any) => {
        if (channel == 'testRest') return { status: 200, statusText: 'OK', headers: {}, headersSent: {}, body: undefined, validated: undefined };
        if (channel == 'saveRun') {
          saves.push(args);
          resolveSaved(args);
          return saveRun();
        }
        throw new Error('unexpected channel ' + channel);
      });
      (window as any).ipc = { invoke: ipcInvoke };
    }

    const flush = () => new Promise(r => setTimeout(r));
    const saveCalls = () => ipcInvoke.calls.allArgs().filter(a => a[0] == 'saveRun');

    it('saves the record with the collection folder as root, the environment sent with and the request node', async () => {
      stubIpc();
      openCollection({});
      await service.executeNode(nodeFor('{{host}}/x'), 'test');
      const { root, record } = await saved;
      expect(root).toBe('C:/c');
      expect(record.collection).toBe('C:/c/api.frcol');
      expect(record.environment).toBe('test');
      expect(record.selection).toBe('request:a.frreq');
      expect(record.cases[0].request?.url).toBe('https://test.example/x');
    });

    it('takes the environment name from the environment sent with, not the collection selection', async () => {
      stubIpc();
      openCollection({});
      await service.executeNode(nodeFor('x.example'), 'test');
      expect((await saved).record.environment).toBe('test');
    });

    it('records no environment when sent without one', async () => {
      stubIpc();
      openCollection({});
      await service.executeNode(nodeFor('x.example'));
      expect((await saved).record.environment).toBeUndefined();
    });

    it('records a run node as kind run with its run name', async () => {
      stubIpc();
      openCollection({});
      const request = nodeFor('x.example');
      const run = { ...CreateEmptyRestActionRun({ generateGUID: () => 'r1' }, undefined), name: 'happy path' };
      await service.executeNode(new RunNode(request, run));
      const { record } = await saved;
      expect(record.selection).toBe('run:a.frreq#happy path');
    });

    it('does not fail the send when saving fails', async () => {
      stubIpc(() => Promise.reject(new Error('disk full')));
      openCollection({});
      spyOn(console, 'warn');
      const result = await service.executeNode(nodeFor('x.example'));
      expect(result.status).toBe(200);
      await saved;
      await flush();
      expect(console.warn).toHaveBeenCalledWith(jasmine.stringMatching(/disk full/));
    });

    it('does not wait for the disk write before answering', async () => {
      let release!: () => void;
      stubIpc(() => new Promise<void>(r => (release = r)));
      openCollection({});
      const result = await service.executeNode(nodeFor('x.example'));
      expect(result.status).toBe(200);
      release();
      await saved;
    });

    it('saves nothing when no collection is open', async () => {
      stubIpc();
      openCollection(undefined);
      await service.executeNode(nodeFor('x.example'));
      await flush();
      expect(saveCalls().length).toBe(0);
    });

    it('saves nothing for an unsaved collection', async () => {
      stubIpc();
      openCollection({ filename: '', path: '' });
      await service.executeNode(nodeFor('x.example'));
      await flush();
      expect(saveCalls().length).toBe(0);
    });

    it('records an error run, with no request, and rethrows when the request cannot be resolved', async () => {
      stubIpc();
      openCollection({});
      const tree = rootNode();
      const folder = new FolderNode(tree, 'f', CreateEmptyFolderConfig('f'), true);
      folder.loadError = { file: 'f/folder.frfolder', message: 'bad json' };
      tree.children.push(folder);

      await expectAsync(service.executeNode(tree.attach(CreateEmptyAction(), 'f/a.frreq'))).toBeRejectedWithError(/is invalid/);
      const { record } = await saved;
      expect(record.cases[0].outcome).toBe('error');
      expect(record.cases[0].error).toMatch(/is invalid/);
      expect(record.cases[0].request.url).toBe('');
    });

    it('records an error run and rethrows when the main process fails to send', async () => {
      stubIpc();
      ipcInvoke.and.callFake(async (channel: string, args: any) => {
        if (channel == 'testRest') throw new Error('ipc down');
        saves.push(args);
        return undefined;
      });
      openCollection({});
      await expectAsync(service.executeNode(nodeFor('x.example'))).toBeRejectedWithError('ipc down');
      await flush();
      expect(saves.length).toBe(1);
      expect(saves[0].record.cases[0].outcome).toBe('error');
      expect(saves[0].record.cases[0].error).toBe('ipc down');
      expect(saves[0].record.cases[0].request.url).toBe('');
    });
  });
});
