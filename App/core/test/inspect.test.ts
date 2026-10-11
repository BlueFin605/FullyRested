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
    expect(req).toMatchObject({ name: 'get item', method: 'get', url: '{{host}}/items', runs: [{ name: 'happy', validation: { type: 'ResponseCode', schema: false } }] });
  });

  it('leaves out empty runs and warnings', async () => {
    const noRuns = JSON.stringify({ ...JSON.parse(request), id: 'r2', name: 'list items', runs: [] });
    const root = await loadCollectionTree('api.frcol', memory(files({ 'items/list.frreq': noRuns })), store);
    const view = treeView(root);
    expect(view).not.toHaveProperty('warnings');
    const list = (view.children[0] as any).children.find((c: any) => c.name === 'list items');
    expect(list).not.toHaveProperty('runs');
  });

  it('shows only one folder when asked', async () => {
    const root = await loadCollectionTree('api.frcol', memory(files({ 'other/x.frreq': request, 'items/sub/y.frreq': request })), store);
    const view = treeView(root, 'items/sub');
    expect(view).toMatchObject({ collection: 'api', folder: 'items/sub' });
    expect(view.children.map((c: any) => c.path)).toEqual(['items/sub/y.frreq']);
    expect(() => treeView(root, 'nope')).toThrow(QueryError);
    expect(() => treeView(root, 'nope')).toThrow("Folder 'nope' not found. Folders: items, items/sub, other");
  });
});

describe('treeView validation marker', () => {
  // One folder, five requests, each isolating one case from the ticket's fixture:
  // - a: a request with ResponseCode (no body check, so schema is always false)
  // - b: a run with Body and a real schema -> schema: true, no incomplete
  // - c: a run with Body and jsonSchema undefined -> schema: false, incomplete: true
  // - c2: a run with Body and jsonSchema.schema == '' -> same as c (empty is empty either way)
  // - d: a run with Inherit under a request with Body (a real schema) -> effective: 'Body'
  // - e: a request with Inherit under nothing -> unresolved, so effective: 'ResponseCode' (that
  //   is what validate.ts actually enforces for Inherit -- a live status check, not "no check")
  // - f: a run with Inherit under a request that is also Inherit -> both unresolved the same way
  const req = (body: object) => JSON.stringify({
    id: 'id', name: 'n', verb: 'get', protocol: 'https', url: '{{host}}/x', parameters: [], headers: [], ...body
  });
  const files = {
    'api.frcol': collection,
    'a.frreq': req({ validation: { type: 'ResponseCode', httpCode: 200, headers: [], body: 'None' } }),
    'b.frreq': req({
      runs: [{ id: 'u', name: 'r', variables: [], secrets: [], authentication: { authentication: 'inherit' }, parameters: [], headers: [],
        validation: { type: 'Body', httpCode: 200, headers: [], body: 'JsonSchema', jsonSchema: { schema: '{"type":"object"}' } } }]
    }),
    'c.frreq': req({
      runs: [{ id: 'u', name: 'r', variables: [], secrets: [], authentication: { authentication: 'inherit' }, parameters: [], headers: [],
        validation: { type: 'Body', httpCode: 200, headers: [], body: 'JsonSchema' } }]
    }),
    'c2.frreq': req({
      runs: [{ id: 'u', name: 'r', variables: [], secrets: [], authentication: { authentication: 'inherit' }, parameters: [], headers: [],
        validation: { type: 'Body', httpCode: 200, headers: [], body: 'JsonSchema', jsonSchema: { schema: '' } } }]
    }),
    'd.frreq': req({
      validation: { type: 'Body', httpCode: 200, headers: [], body: 'JsonSchema', jsonSchema: { schema: '{"type":"object"}' } },
      runs: [{ id: 'u', name: 'r', variables: [], secrets: [], authentication: { authentication: 'inherit' }, parameters: [], headers: [],
        validation: { type: 'Inherit', httpCode: 200, headers: [], body: 'None' } }]
    }),
    'e.frreq': req({ validation: { type: 'Inherit', httpCode: 200, headers: [], body: 'None' } }),
    'f.frreq': req({
      validation: { type: 'Inherit', httpCode: 200, headers: [], body: 'None' },
      runs: [{ id: 'u', name: 'r', variables: [], secrets: [], authentication: { authentication: 'inherit' }, parameters: [], headers: [],
        validation: { type: 'Inherit', httpCode: 200, headers: [], body: 'None' } }]
    }),
  };
  const byPath = async (path: string) => {
    const root = await loadCollectionTree('api.frcol', memory(files), store);
    return (treeView(root).children as any[]).find(c => c.path === path);
  };

  it('ResponseCode: no body check, so schema is false and there is no effective', async () => {
    expect((await byPath('a.frreq')).validation).toEqual({ type: 'ResponseCode', schema: false });
  });

  it('Body with a real schema: schema true, no incomplete', async () => {
    expect((await byPath('b.frreq')).runs[0].validation).toEqual({ type: 'Body', schema: true });
  });

  it('Body with jsonSchema undefined: schema false, incomplete true', async () => {
    expect((await byPath('c.frreq')).runs[0].validation).toEqual({ type: 'Body', schema: false, incomplete: true });
  });

  it('Body with jsonSchema.schema == "": same as undefined, incomplete true', async () => {
    expect((await byPath('c2.frreq')).runs[0].validation).toEqual({ type: 'Body', schema: false, incomplete: true });
  });

  it('a run with Inherit under a request with Body (real schema): effective Body, schema carried through', async () => {
    const d = await byPath('d.frreq');
    expect(d.validation).toEqual({ type: 'Body', schema: true });
    expect(d.runs[0].validation).toEqual({ type: 'Inherit', effective: 'Body', schema: true });
  });

  it('a request with Inherit under nothing: unresolved, so effective ResponseCode (not None)', async () => {
    expect((await byPath('e.frreq')).validation).toEqual({ type: 'Inherit', effective: 'ResponseCode', schema: false });
  });

  it('a run with Inherit under a request that is also Inherit: both unresolved to ResponseCode', async () => {
    const f = await byPath('f.frreq');
    expect(f.validation).toEqual({ type: 'Inherit', effective: 'ResponseCode', schema: false });
    expect(f.runs[0].validation).toEqual({ type: 'Inherit', effective: 'ResponseCode', schema: false });
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

  it('shows a secret encoded into a query parameter as its placeholder', async () => {
    const req = JSON.parse(request);
    // A literal secret value in a parameter is encoded by buildRequestUrl before showRequest sees it
    req.parameters = [{ key: 'key', value: 'p@ss word', active: true, id: 'p1' }];
    const root = await loadCollectionTree('api.frcol', memory(files({ 'items/get.frreq': JSON.stringify(req) })),
      keychain({ 'fullyrested-collection-c1/apikey': 'p@ss word' }));
    const shown = showRequest(root.find('items/get.frreq') as RequestNode);
    expect(shown.url).toBe('https://example.com/items?key={{$secret:apikey}}');
    expect(JSON.stringify(shown)).not.toContain('p@ss+word');
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
