import { describe, it, expect } from 'vitest';
import { CollectionSource, RequestNode, SecretStore, loadCollectionTree, treeView, environmentsView, showRequest, QueryError } from '../src';

function memory(files: Record<string, string>): CollectionSource {
  return {
    async listDir(dir) {
      const prefix = dir == '' ? '' : dir + '/';
      const names = new Map<string, boolean>();
      for (const file of Object.keys(files)) {
        if (!file.startsWith(prefix)) continue;
        const [first, ...rest] = file.substring(prefix.length).split('/');
        names.set(first!, rest.length > 0 || names.get(first!) == true);
      }
      return [...names].map(([name, isDirectory]) => ({ name, isDirectory }));
    },
    async readText(file) {
      const text = files[file];
      if (text == undefined) throw new Error(`ENOENT ${file}`);
      return text;
    }
  };
}
const keychain = (values: Record<string, string>): SecretStore => ({
  get: async (service, account) => values[`${service}/${account}`] ?? null,
  set: async () => { }
});
const store = keychain({ 'fullyrested-collection-c1/apikey': 'sekret-123' });

const collection = JSON.stringify({
  collectionGuid: 'c1', selectedEnvironmentId: 'e1',
  collectionEnvironment: {
    name: 'system.settings', variables: [{ variable: 'host', value: 'example.com', active: true, id: 'v' }, { variable: 'off', value: 'x', active: false, id: 'v2' }],
    secrets: [{ $secret: 'apikey', active: true, id: 's' }], auth: { authentication: 'none' }
  },
  environments: [
    { id: 'e1', name: 'dev', variables: [{ variable: 'stage', value: 'd', active: true, id: 'a' }], secrets: [], auth: { authentication: 'inherit' }, headers: [] },
    { id: 'e2', name: 'prod', variables: [], secrets: [], auth: { authentication: 'inherit' }, headers: [] }
  ]
});
const request = JSON.stringify({
  id: 'r1', name: 'get item', verb: 'get', protocol: 'https', url: '{{host}}/items', parameters: [],
  headers: [{ key: 'x-key', value: '{{$secret:apikey}}', active: true, id: 'h1' }, { key: 'x-req', value: 'req', active: true, id: 'h2' }],
  runs: [{ id: 'u1', name: 'happy', variables: [], secrets: [], authentication: { authentication: 'inherit' }, parameters: [],
    headers: [{ key: 'x-req', value: 'run', active: true, id: 'h3' }], validation: { type: 'ResponseCode', httpCode: 200, headers: [], body: 'None' } }]
});
const folder = JSON.stringify({
  folderId: 'fi', variables: [], secrets: [], auth: { authentication: 'inherit' },
  headers: [{ key: 'x-folder', value: 'f', active: true, id: 'fh' }]
});
const files = (extra: Record<string, string> = {}) => ({
  'api.frcol': collection, 'items/folder.frfolder': folder, 'items/get.frreq': request, ...extra
});

describe('treeView', () => {
  it('shows folders, requests with raw urls and runs, and load errors', async () => {
    const root = await loadCollectionTree('api.frcol', memory(files({ 'items/bad.frreq': 'null' })), store);
    const view = treeView(root);
    expect(view.collection).toBe('api');
    const items = view.children[0] as any;
    expect(items).toMatchObject({ type: 'folder', name: 'items', path: 'items' });
    expect(items.children.find((c: any) => c.type === 'error')).toMatchObject({ file: 'items/bad.frreq' });
    const req = items.children.find((c: any) => c.type === 'request');
    expect(req).toMatchObject({ name: 'get item', method: 'get', url: '{{host}}/items', runs: [{ name: 'happy', validation: 'ResponseCode' }] });
  });
});

describe('environmentsView', () => {
  it('lists names only, active rows only', async () => {
    const root = await loadCollectionTree('api.frcol', memory(files()), store);
    const view = environmentsView(root.config);
    expect(view).toEqual({
      selected: 'dev',
      collection: { variables: ['host'], secrets: ['apikey'] },
      environments: [{ id: 'e1', name: 'dev', variables: ['stage'], secrets: [] }, { id: 'e2', name: 'prod', variables: [], secrets: [] }]
    });
    expect(JSON.stringify(view)).not.toContain('example.com');
  });
});

describe('showRequest', () => {
  it('reports sources and redacts secrets', async () => {
    const root = await loadCollectionTree('api.frcol', memory(files()), store);
    const node = root.find('items/get.frreq') as RequestNode;
    const shown = showRequest(node);
    expect(shown.url).toBe('https://example.com/items');
    expect(shown.headers.find(h => h.key === 'x-folder')).toMatchObject({ value: 'f', source: 'folder:items', overridden: false });
    expect(shown.headers.find(h => h.key === 'x-key')!.value).toBe('{{$secret:apikey}}');
    expect(shown.secrets).toEqual([{ name: 'apikey', source: 'collection:api', overridden: false }]);
    expect(shown.variables.map(v => v.variable)).toContain('stage');
    expect(JSON.stringify(shown)).not.toContain('sekret-123');
  });

  it('shows a {{$name}} secret reference in a header or variable as {{$secret:name}}', async () => {
    const req = JSON.parse(request);
    req.headers = [{ key: 'x-key', value: 'Bearer {{$apikey}}', active: true, id: 'h1' }, { key: 'x-other', value: '{{$unknown}}', active: true, id: 'h2' }];
    const withVar = JSON.parse(collection);
    withVar.collectionEnvironment.variables.push({ variable: 'token', value: '{{$apikey}}', active: true, id: 't' });
    const root = await loadCollectionTree('api.frcol', memory(files({ 'items/get.frreq': JSON.stringify(req), 'api.frcol': JSON.stringify(withVar) })), store);
    const shown = showRequest(root.find('items/get.frreq') as RequestNode);
    expect(shown.headers.find(h => h.key === 'x-key')!.value).toBe('Bearer {{$secret:apikey}}');
    expect(shown.headers.find(h => h.key === 'x-other')!.value).toBe('{{$unknown}}');
    expect(shown.variables.find(v => v.variable === 'token')!.value).toBe('{{$secret:apikey}}');
  });

  it.each(['key', 'secret', 'a', '1'])('keeps the placeholder intact when the secret value is %s', async value => {
    const req = JSON.parse(request);
    req.headers = [{ key: 'x-key', value: '{{$apikey}}', active: true, id: 'h1' }, { key: 'x-raw', value, active: true, id: 'h2' }];
    const root = await loadCollectionTree('api.frcol', memory(files({ 'items/get.frreq': JSON.stringify(req) })),
      keychain({ 'fullyrested-collection-c1/apikey': value }));
    const shown = showRequest(root.find('items/get.frreq') as RequestNode);
    expect(shown.headers.find(h => h.key === 'x-key')!.value).toBe('{{$secret:apikey}}');
    expect(shown.headers.find(h => h.key === 'x-raw')!.value).toBe('{{$secret:apikey}}');
  });

  it('redacts a secret value that appears in a variable value', async () => {
    const withVar = JSON.parse(collection);
    withVar.collectionEnvironment.variables.push({ variable: 'leak', value: 'sekret-123', active: true, id: 'l' });
    const root = await loadCollectionTree('api.frcol', memory(files({ 'api.frcol': JSON.stringify(withVar) })), store);
    const shown = showRequest(root.find('items/get.frreq') as RequestNode);
    expect(shown.variables.find(v => v.variable === 'leak')!.value).toBe('{{$secret:apikey}}');
  });

  it('marks a request header overridden by a run', async () => {
    const root = await loadCollectionTree('api.frcol', memory(files()), store);
    const run = (root.find('items/get.frreq') as RequestNode).runs()[0]!;
    const shown = showRequest(run);
    const reqHeaders = shown.headers.filter(h => h.key === 'x-req');
    expect(reqHeaders.find(h => h.source === 'run:happy')!.overridden).toBe(false);
    expect(reqHeaders.find(h => h.source === 'request:get item')!.overridden).toBe(true);
  });

  it('shows a secret substituted into the url or a query param as its placeholder', async () => {
    const req = JSON.parse(request);
    req.url = '{{host}}/items?key={{$apikey}}';
    const root = await loadCollectionTree('api.frcol', memory(files({ 'items/get.frreq': JSON.stringify(req) })), store);
    const shown = showRequest(root.find('items/get.frreq') as RequestNode);
    expect(shown.url).toContain('{{$secret:apikey}}');
    expect(JSON.stringify(shown)).not.toContain('sekret-123');
  });

  it('shows a short secret as its placeholder', async () => {
    const req = JSON.parse(request);
    req.url = '{{host}}/items/{{$apikey}}';
    const root = await loadCollectionTree('api.frcol', memory(files({ 'items/get.frreq': JSON.stringify(req) })),
      keychain({ 'fullyrested-collection-c1/apikey': 'ab' }));
    const shown = showRequest(root.find('items/get.frreq') as RequestNode);
    expect(shown.url).toBe('https://example.com/items/{{$secret:apikey}}');
  });

  it('redacts a secret substituted into the validation config', async () => {
    const req = JSON.parse(request);
    req.validation = { type: 'Headers', httpCode: 200, body: 'None', headers: [{ key: 'x-echo', value: '{{$apikey}}', active: true, id: 'vh' }] };
    const root = await loadCollectionTree('api.frcol', memory(files({ 'items/get.frreq': JSON.stringify(req) })), store);
    const shown = showRequest(root.find('items/get.frreq') as RequestNode);
    expect(JSON.stringify(shown.validation)).toContain('{{$secret:apikey}}');
    expect(JSON.stringify(shown)).not.toContain('sekret-123');
  });

  it('does not wrap programming errors in QueryError', () => {
    const broken = { name: 'x', resolve() { throw new TypeError('boom'); } } as unknown as RequestNode;
    expect(() => showRequest(broken)).toThrow(TypeError);
    expect(() => showRequest(broken)).not.toThrow(QueryError);
  });

  it('wraps resolve failures in QueryError', async () => {
    const root = await loadCollectionTree('api.frcol', memory(files({ 'items/folder.frfolder': '{oops' })), store);
    expect(() => showRequest(root.find('items/get.frreq') as RequestNode)).toThrow(QueryError);
  });
});
