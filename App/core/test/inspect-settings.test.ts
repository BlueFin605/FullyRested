import { describe, expect, it } from 'vitest';
import { MemoryCollectionSink } from '../src/collection-sink';
import { loadCollectionTree } from '../src/tree';
import { parseLocator, resolveLocator } from '../src/locator';
import { settingsView } from '../src/inspect';

// One of everything the ticket asks for, each value distinctive so a leak cannot pass by
// accident: a collection header, an environment variable, a folder secret reference, a
// request header and param, and a run variable. Two folders (and two requests) so the
// resolution order across groups -- collection, environments, folders, requests, runs --
// and the depth-first tree order within a group are both provable from one fixture.
const COLLECTION_HEADER_VALUE = 'COLLECTION_HEADER_VALUE_DO_NOT_LEAK';
const ENV_VARIABLE_VALUE = 'ENV_VARIABLE_VALUE_DO_NOT_LEAK';
const FOLDER_SECRET_VALUE = 'FOLDER_SECRET_VALUE_DO_NOT_LEAK';
const REQUEST_HEADER_VALUE = 'REQUEST_HEADER_VALUE_DO_NOT_LEAK';
const REQUEST_PARAM_VALUE = 'REQUEST_PARAM_VALUE_DO_NOT_LEAK';
const REQUEST_AUTH_TOKEN_VALUE = 'REQUEST_AUTH_TOKEN_VALUE_DO_NOT_LEAK';
const RUN_VARIABLE_VALUE = 'RUN_VARIABLE_VALUE_DO_NOT_LEAK';

const ALL_VALUES = [
  COLLECTION_HEADER_VALUE, ENV_VARIABLE_VALUE, FOLDER_SECRET_VALUE,
  REQUEST_HEADER_VALUE, REQUEST_PARAM_VALUE, REQUEST_AUTH_TOKEN_VALUE, RUN_VARIABLE_VALUE,
];

const files = {
  'api.frcol': JSON.stringify({
    collectionGuid: 'c1',
    selectedEnvironmentId: 'e1',
    collectionEnvironment: {
      name: 'system.settings',
      headers: [{ key: 'X-Collection-Header', value: COLLECTION_HEADER_VALUE, active: true, id: 'ch1' }],
      variables: [], secrets: [], auth: { authentication: 'none' },
    },
    environments: [
      {
        id: 'e1', name: 'Production',
        variables: [{ variable: 'baseUrl', value: ENV_VARIABLE_VALUE, active: true, id: 'ev1' }],
        secrets: [], headers: [], auth: { authentication: 'inherit' },
      },
    ],
  }),
  'orders/list.frreq': JSON.stringify({
    id: 'r2', name: 'List orders', verb: 'get', protocol: 'https', url: 'https://x/o', headers: [], parameters: [],
  }),
  'users/folder.frfolder': JSON.stringify({
    folderId: 'f1', variables: [], headers: [],
    secrets: [{ $secret: 'DbPassword', $value: FOLDER_SECRET_VALUE, active: true, id: 'fs1' }],
    auth: { authentication: 'inherit' },
  }),
  'users/get.frreq': JSON.stringify({
    id: 'r1', name: 'Get user', verb: 'get', protocol: 'https', url: 'https://x/u',
    headers: [{ key: 'X-Request-Header', value: REQUEST_HEADER_VALUE, active: true, id: 'rh1' }],
    parameters: [{ key: 'id', value: REQUEST_PARAM_VALUE, active: true, id: 'rp1' }],
    authentication: { authentication: 'bearertoken', bearerToken: { token: REQUEST_AUTH_TOKEN_VALUE } },
    runs: [{
      id: 'u1', name: 'happy',
      variables: [{ variable: 'runVar', value: RUN_VARIABLE_VALUE, active: true, id: 'rv1' }],
      secrets: [], headers: [], parameters: [],
      authentication: { authentication: 'inherit' },
      validation: { type: 'ResponseCode', httpCode: 200, headers: [], body: 'None' },
    }],
  }),
};

const store = { get: async () => null, set: async () => { } };
const tree = () => loadCollectionTree('api.frcol', new MemoryCollectionSink(files), store);

describe('settingsView', () => {
  it('lists every scope in resolution order, names only', async () => {
    const root = await tree();
    const view = settingsView(root);

    expect(view.collection).toBe('api');
    expect(view.scopes.map(s => s.scope)).toEqual([
      'collection',
      'env:Production',
      'folder:orders',
      'folder:users',
      'request:orders/list.frreq',
      'request:users/get.frreq',
      'run:users/get.frreq#happy',
    ]);

    expect(view.scopes).toEqual([
      { scope: 'collection', headers: ['X-Collection-Header'], variables: [], secrets: [], auth: 'none' },
      { scope: 'env:Production', headers: [], variables: ['baseUrl'], secrets: [], auth: 'inherit' },
      { scope: 'folder:orders', headers: [], variables: [], secrets: [], auth: 'inherit' },
      { scope: 'folder:users', headers: [], variables: [], secrets: ['DbPassword'], auth: 'inherit' },
      { scope: 'request:orders/list.frreq', headers: [], variables: [], secrets: [], auth: 'inherit', params: [] },
      { scope: 'request:users/get.frreq', headers: ['X-Request-Header'], variables: [], secrets: [], auth: 'bearertoken', params: ['id'] },
      { scope: 'run:users/get.frreq#happy', headers: [], variables: ['runVar'], secrets: [], auth: 'inherit', params: [] },
    ]);
  });

  it('never puts a value on the wire -- names only', async () => {
    const root = await tree();
    const json = JSON.stringify(settingsView(root));
    for (const value of ALL_VALUES) expect(json).not.toContain(value);
  });

  it('returns just the one scope when asked for folder:users', async () => {
    const root = await tree();
    const view = settingsView(root, parseLocator('folder:users'));
    expect(view.collection).toBe('api');
    expect(view.scopes).toEqual([
      { scope: 'folder:users', headers: [], variables: [], secrets: ['DbPassword'], auth: 'inherit' },
    ]);
  });

  it('every emitted scope is a locator an agent can feed straight back into a write verb', async () => {
    const root = await tree();
    const view = settingsView(root);

    const collectionScope = view.scopes.find(s => s.scope === 'collection')!.scope;
    const envScope = view.scopes.find(s => s.scope.startsWith('env:'))!.scope;
    const folderScope = view.scopes.find(s => s.scope.startsWith('folder:'))!.scope;
    const requestScope = view.scopes.find(s => s.scope.startsWith('request:'))!.scope;
    const runScope = view.scopes.find(s => s.scope.startsWith('run:'))!.scope;

    for (const scope of [collectionScope, envScope, folderScope, requestScope, runScope]) {
      const locator = parseLocator(scope);
      expect(() => resolveLocator(root, locator)).not.toThrow();
    }

    expect(parseLocator(collectionScope)).toEqual({ kind: 'collection' });
    expect(parseLocator(envScope)).toEqual({ kind: 'environment', name: 'Production' });
    expect(parseLocator(folderScope)).toMatchObject({ kind: 'folder' });
    expect(parseLocator(requestScope)).toMatchObject({ kind: 'request' });
    expect(parseLocator(runScope)).toMatchObject({ kind: 'run' });
  });
});
