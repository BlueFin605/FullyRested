import { TestBed } from '@angular/core/testing';
import { RestAction } from '@fullyrested/core';

import { ActionRepositoryService } from './action-repository.service';

describe('ActionRepositoryService', () => {
  afterEach(() => delete (window as any).ipc);

  function create(): ActionRepositoryService {
    TestBed.configureTestingModule({});
    return TestBed.inject(ActionRepositoryService);
  }

  it('names new requests after the next free number and gives each a fresh id', () => {
    const service = create();
    const first = service.createNewAction(3);
    const second = service.createNewAction(Infinity);

    expect(first.action.name).toBe('new request 3');
    expect(second.action.name).toBe('new request');
    expect(first.action.id).not.toBe(second.action.id);
    expect(first.action.headers.map(h => h.key)).toEqual(['user-agent', 'accept', 'accept-encoding']);
  });

  it('returns an empty request for a request with no file', async () => {
    const service = create();
    const request = await service.loadRequest('');
    expect(request.url).toBe('');
  });

  it('serves the mock request and collection in browser mode (no Electron ipc)', async () => {
    const service = create();
    const request = await service.loadRequest('some/file.frreq');
    expect(request.id).toBe('some/file.frreq-mockrequest');
    expect(JSON.parse(request.body.body)).toEqual(jasmine.objectContaining({ products: jasmine.any(Array) }));

    await service.loadCollection();
    expect(service.collections.value?.name).toBe('collection name');
  });

  it('loads a request through the main process and fills in fields older files lack', async () => {
    const saved = { id: 'r1', name: 'old file', verb: 'get', protocol: 'https', url: 'x.example', headers: [], parameters: [], body: { contentType: 'none', body: '' } };
    (window as any).ipc = {
      receive: () => { },
      invoke: (channel: string, file: string) => {
        expect(channel).toBe('loadRequest');
        expect(file).toBe('c:/requests/r1.frreq');
        return Promise.resolve(saved);
      }
    };
    const service = create();

    const request: RestAction = await service.loadRequest('c:/requests/r1.frreq');

    expect(request.name).toBe('old file');
    expect(request.authentication).toBeDefined();
    expect(request.validation).toBeDefined();
    expect(request.runs).toEqual([]);
  });
});
