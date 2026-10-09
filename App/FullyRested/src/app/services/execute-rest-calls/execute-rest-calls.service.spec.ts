import { TestBed } from '@angular/core/testing';
import { Collection, CreateEmptyAuthenticationDetails, CreateEmptyEnvironment, ExecuteRestAction, HttpProtocol, IExecuteRestAction, RestTypeVerb } from '@fullyrested/core';

import { ExecuteRestCallsService } from './execute-rest-calls.service';

function request(url: string): ExecuteRestAction {
  return new ExecuteRestAction({
    verb: RestTypeVerb.get, protocol: HttpProtocol.https, url, headers: {}, body: {},
    authentication: CreateEmptyAuthenticationDetails('none'), secrets: [], variables: [], validation: undefined
  });
}

function collection(): Collection {
  const variable = (variable: string, value: string) => ({ variable, value, active: true, id: variable });
  return {
    filename: '', name: '', path: '',
    config: {
      collectionGuid: 'c1',
      selectedEnvironmentId: 'prod',
      collectionEnvironment: { ...CreateEmptyEnvironment(), variables: [variable('host', 'collection.example'), variable('version', 'v1')] },
      environments: [
        { ...CreateEmptyEnvironment(), id: 'test', name: 'test', variables: [variable('host', 'test.example')] },
        { ...CreateEmptyEnvironment(), id: 'prod', name: 'prod', variables: [variable('host', 'prod.example')] },
      ]
    }
  };
}

describe('ExecuteRestCallsService', () => {
  let service: ExecuteRestCallsService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ExecuteRestCallsService);
  });

  afterEach(() => delete (window as any).ipc);

  it('answers with the mock response in browser mode (no Electron ipc)', async () => {
    const result = await service.executeTest(request('anything.example'), undefined);
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

    const result = await service.executeTest(request('{{host}}/{{version}}/todos'), collection());

    expect(result.status).toBe(204);
    expect(sent.length).toBe(1);
    expect(sent[0].url).toBe('prod.example/v1/todos');
  });
});
