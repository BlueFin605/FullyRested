import { describe, it, expect } from 'vitest';
import { CollectionSource, FolderNode, RequestNode, SecretStore, loadCollectionTree, treeView } from '../src';

// A collection folder held in memory: file path → contents
function memory(files: Record<string, string>): CollectionSource {
    return {
        async listDir(dir) {
            const prefix = dir == '' ? '' : dir + '/';
            const names = new Map<string, boolean>();
            for (const file of Object.keys(files)) {
                if (!file.startsWith(prefix))
                    continue;
                const [first, ...rest] = file.substring(prefix.length).split('/');
                names.set(first!, rest.length > 0 || names.get(first!) == true);
            }
            return [...names].map(([name, isDirectory]) => ({ name, isDirectory }));
        },
        async readText(file) {
            const text = files[file];
            if (text == undefined)
                throw new Error(`ENOENT ${file}`);
            return text;
        }
    };
}

const keychain = (values: Record<string, string>): SecretStore => ({
    get: async (service, account) => values[`${service}/${account}`] ?? null,
    set: async () => { }
});

const collection = JSON.stringify({
    collectionGuid: 'c1', selectedEnvironmentId: '',
    collectionEnvironment: { name: 'system.settings', variables: [], secrets: [{ $secret: 'ck', active: true, id: 's' }], auth: { authentication: 'none' } },
    environments: []
});

const request = (id: string, name: string) => JSON.stringify({ id, name, verb: 'get', protocol: 'https', url: 'example.com', headers: [], parameters: [], secrets: [{ $secret: 'rk', active: true, id: 'r' }] });
const folderFile = (folderId: string, header: string) => JSON.stringify({
    folderId, variables: [], secrets: [{ $secret: 'fk', active: true, id: 'f' }], auth: { authentication: 'inherit' },
    headers: [{ key: 'x-folder', value: header, active: true, id: 'h' }]
});

function files(extra: Record<string, string> = {}): Record<string, string> {
    return {
        'api.frcol': collection,
        'z.frreq': request('rz', 'z'),
        'b/folder.frfolder': folderFile('fb', 'b'),
        'b/one.frreq': request('r1', 'one'),
        'b/inner/two.frreq': request('r2', 'two'),
        'a/old.reasyreq': request('r3', 'old'),
        'a/notes.txt': 'not a request',
        '.git/x.frreq': request('rx', 'hidden'),
        'node_modules/y.frreq': request('ry', 'module'),
        ...extra
    };
}

const store = keychain({
    'fullyrested-collection-c1/ck': 'collection secret',
    'fullyrested-folder-fb/fk': 'folder secret',
    'fullyrested-request-r1/rk': 'request secret'
});

describe('loadCollectionTree', () => {
    it('loads folders before requests, sorted, skipping hidden folders, node_modules and other files', async () => {
        const root = await loadCollectionTree('api.frcol', memory(files()), store);
        expect(root.children.map(c => c.path)).toEqual(['a', 'b', 'z.frreq']);
        expect(root.requestNodes().map(r => r.path)).toEqual(['a/old.reasyreq', 'b/inner/two.frreq', 'b/one.frreq', 'z.frreq']);
        expect(root.folderNodes().map(f => f.path)).toEqual(['a', 'b', 'b/inner']);
    });

    it('reads folder settings and fills secrets from the keychain for every level', async () => {
        const root = await loadCollectionTree('api.frcol', memory(files()), store);
        const b = root.find('b') as FolderNode;
        expect(b.hasSettingsFile).toBe(true);
        expect(b.config.secrets[0]!.$value).toBe('folder secret');
        expect(root.config.collectionEnvironment.secrets[0]!.$value).toBe('collection secret');
        expect(((root.find('b/one.frreq') as RequestNode).action as any).secrets[0].$value).toBe('request secret');
        expect((root.find('a') as FolderNode).hasSettingsFile).toBe(false);
    });

    it('sends folder headers from a loaded tree', async () => {
        const root = await loadCollectionTree('api.frcol', memory(files()), store);
        expect((root.find('b/inner/two.frreq') as RequestNode).resolve().headers).toEqual({ 'x-folder': 'b' });
    });

    it('keeps a broken folder file in the tree and refuses to resolve below it', async () => {
        const root = await loadCollectionTree('api.frcol', memory(files({ 'b/folder.frfolder': '{oops' })), store);
        expect(root.find('b')!.loadError?.file).toBe('b/folder.frfolder');
        expect(() => (root.find('b/one.frreq') as RequestNode).resolve()).toThrow(/b\/folder\.frfolder is invalid/);
        expect(() => (root.find('z.frreq') as RequestNode).resolve()).not.toThrow();
    });

    it('keeps a broken request file as a node with its error', async () => {
        const root = await loadCollectionTree('api.frcol', memory(files({ 'bad.frreq': 'null' })), store);
        const bad = root.find('bad.frreq') as RequestNode;
        expect(bad.loadError?.file).toBe('bad.frreq');
        expect(bad.name).toBe('bad');
    });

    it('ignores a folder file next to the collection file, with a warning', async () => {
        const root = await loadCollectionTree('api.frcol', memory(files({ 'folder.frfolder': folderFile('root', 'root') })), store);
        expect(root.warnings).toEqual(['folder.frfolder next to api.frcol is ignored; collection-wide settings belong in api.frcol']);
        expect((root.find('z.frreq') as RequestNode).resolve().headers).toEqual({});
    });

    it('loads request files whatever the case of their extension', async () => {
        const root = await loadCollectionTree('api.frcol', memory(files({ 'b/UPPER.FRREQ': request('ru', 'upper'), 'Legacy.ReasyReq': request('rl', 'legacy') })), store);
        expect(root.requestNodes().map(r => r.path)).toContain('b/UPPER.FRREQ');
        expect((root.find('Legacy.ReasyReq') as RequestNode).action.name).toBe('legacy');
    });

    it('reads sibling folders and requests concurrently, keeping their order', async () => {
        const source = memory(files());
        let inFlight = 0, most = 0;
        const slow = <T>(work: () => Promise<T>) => async () => {
            inFlight++;
            most = Math.max(most, inFlight);
            await new Promise(resolve => setTimeout(resolve, 5));
            try { return await work(); } finally { inFlight--; }
        };
        const counted: CollectionSource = {
            listDir: dir => slow(() => source.listDir(dir))(),
            readText: file => slow(() => source.readText(file))()
        };
        const root = await loadCollectionTree('api.frcol', counted, store);
        expect(most).toBeGreaterThan(1);
        expect(root.children.map(c => c.path)).toEqual(['a', 'b', 'z.frreq']);
        expect(root.requestNodes().map(r => r.path)).toEqual(['a/old.reasyreq', 'b/inner/two.frreq', 'b/one.frreq', 'z.frreq']);
    });

    it('throws when the collection file cannot be read', async () => {
        await expect(loadCollectionTree('missing.frcol', memory(files()), store)).rejects.toThrow('ENOENT missing.frcol');
    });
});

// {{...}} matches letters, digits, '-' and '_' only, but nothing refuses a name holding anything else
// where it is declared, so a reference to one resolves to '' and the request goes out with an empty
// credential. The collection reports such a name on load instead (AIF-2).
describe('warnings about names that can never substitute', () => {
    const named = (secretName: string, variableName = 'ok') => JSON.stringify({
        collectionGuid: 'c1', selectedEnvironmentId: 'e1',
        collectionEnvironment: {
            name: 'system.settings', variables: [{ variable: variableName, value: 'v', active: true, id: 'v1' }],
            secrets: [{ $secret: secretName, active: true, id: 's' }], auth: { authentication: 'none' }
        },
        environments: [{ id: 'e1', name: 'Production', variables: [], secrets: [], auth: { authentication: 'inherit' }, headers: [] }]
    });

    it('says nothing about a name holding only letters, digits, - and _', async () => {
        const root = await loadCollectionTree('api.frcol', memory(files({ 'api.frcol': named('api_key', 'base-url') })), store);
        expect(root.warnings).toEqual([]);
    });

    it('reports a secret in the collection environment that can never substitute', async () => {
        const root = await loadCollectionTree('api.frcol', memory(files({ 'api.frcol': named('api.key') })), store);
        expect(root.warnings).toEqual([
            "Secret 'api.key' in collection 'api' can never be substituted: {{...}} matches only letters, digits, '-' and '_', so a reference to it resolves to an empty value"
        ]);
    });

    it('reports a variable as well as a secret', async () => {
        const root = await loadCollectionTree('api.frcol', memory(files({ 'api.frcol': named('ok', 'a b') })), store);
        expect(root.warnings).toEqual([expect.stringContaining("Variable 'a b' in collection 'api'")]);
    });

    it('names the environment, the folder and the run a bad name sits in', async () => {
        const collectionWithEnv = JSON.stringify({
            collectionGuid: 'c1', selectedEnvironmentId: 'e1',
            collectionEnvironment: { name: 'system.settings', variables: [], secrets: [], auth: { authentication: 'none' } },
            environments: [{
                id: 'e1', name: 'Production', variables: [], headers: [],
                secrets: [{ $secret: 'env.key', active: true, id: 's' }], auth: { authentication: 'inherit' }
            }]
        });
        const folderWithBadName = JSON.stringify({
            folderId: 'fb', variables: [], headers: [], auth: { authentication: 'inherit' },
            secrets: [{ $secret: 'folder key', active: true, id: 'f' }]
        });
        const requestWithRun = JSON.stringify({
            id: 'r1', name: 'one', verb: 'get', protocol: 'https', url: 'example.com', headers: [], parameters: [],
            runs: [{
                id: 'run1', name: 'first', variables: [], headers: [], parameters: [],
                secrets: [{ $secret: 'run$key', active: true, id: 'rs' }], auth: { authentication: 'inherit' }
            }]
        });
        const root = await loadCollectionTree('api.frcol', memory(files({
            'api.frcol': collectionWithEnv, 'b/folder.frfolder': folderWithBadName, 'b/one.frreq': requestWithRun
        })), store);
        expect(root.warnings).toEqual([
            expect.stringContaining("Secret 'env.key' in environment 'Production'"),
            expect.stringContaining("Secret 'folder key' in folder 'b'"),
            expect.stringContaining("Secret 'run$key' in run 'one › first'")
        ]);
    });

    it('surfaces the warnings through treeView', async () => {
        const root = await loadCollectionTree('api.frcol', memory(files({ 'api.frcol': named('api.key') })), store);
        expect(treeView(root).warnings).toEqual([expect.stringContaining("Secret 'api.key'")]);
    });
});
