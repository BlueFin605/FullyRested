import {
    ACTION_FILE_EXTENSIONS, CollectionConfig, CreateEmptyAction, CreateEmptyFolderConfig, FolderConfig, REConstants, RestAction, ScopeSettings
} from './model';
import { normaliseAction, normaliseCollectionConfig, normaliseFolderConfig } from './normalise';
import { extensionOf, joinPath } from './paths';
import { CollectionNode, ContainerNode, FolderNode, RequestNode } from './scope';
import { SecretStore, loadSecrets, secretServiceForCollection, secretServiceForFolder, secretServiceForRequest } from './secrets';
import { canSubstitute } from './substitution';

export interface DirEntry {
    name: string;
    isDirectory: boolean;
}

// How core reads a collection folder. The host (Electron main over IPC, or the CLI) owns the file system.
// Paths are relative to the collection folder, '/' separated; '' is the folder itself.
export interface CollectionSource {
    listDir(path: string): Promise<DirEntry[]>;
    readText(path: string): Promise<string>;
}

interface Loader {
    source: CollectionSource;
    store: SecretStore;
}

// Reads the collection file and everything below its folder into a tree, with secrets filled in
export async function loadCollectionTree(collectionFile: string, source: CollectionSource, store: SecretStore): Promise<CollectionNode> {
    const parsed = normaliseCollectionConfig(parseObject(await source.readText(collectionFile)) as CollectionConfig);
    const root = new CollectionNode(await loadSecrets(parsed, store, secretServiceForCollection(parsed.collectionGuid)), collectionFile);
    const loader: Loader = { source, store };

    const entries = await source.listDir('');
    if (entries.some(e => !e.isDirectory && e.name == REConstants.FolderSettingsFile))
        root.warnings.push(`${REConstants.FolderSettingsFile} next to ${collectionFile} is ignored; collection-wide settings belong in ${collectionFile}`);

    await loadEntries(root, '', entries, loader);
    warnUnsubstitutableNames(root);
    return root;
}

// A declared name that {{...}} cannot match is written to the file happily but resolves to '' at send
// time, so a credential goes out empty with nothing to show why. Nothing refuses such a name where it is
// declared -- addSecretRef and the desktop editor both take any string -- so the collection reports it on
// load, which is the one place both hosts already surface warnings.
function warnUnsubstitutableNames(root: CollectionNode): void {
    const report = (where: string, kind: string, names: string[]) => {
        for (const name of names)
            if (!canSubstitute(name))
                root.warnings.push(`${kind} '${name}' in ${where} can never be substituted: {{...}} matches only letters, digits, '-' and '_', so a reference to it resolves to an empty value`);
    };
    const scope = (where: string, settings: Partial<ScopeSettings> | undefined) => {
        report(where, 'Secret', (settings?.secrets ?? []).map(s => s.$secret));
        report(where, 'Variable', (settings?.variables ?? []).map(v => v.variable));
    };

    scope(`collection '${root.name}'`, root.config.collectionEnvironment);
    for (const env of root.config.environments)
        scope(`environment '${env.name}'`, env);
    for (const folder of root.folderNodes())
        scope(`folder '${folder.path}'`, folder.config);
    for (const request of root.requestNodes())
        for (const run of request.action.runs)
            scope(`run '${request.name} › ${run.name}'`, run);
}

async function loadEntries(container: ContainerNode, dir: string, entries: DirEntry[], loader: Loader): Promise<void> {
    const byName = (a: DirEntry, b: DirEntry) => a.name.localeCompare(b.name);
    const folders = entries.filter(e => e.isDirectory && !e.name.startsWith('.') && e.name != 'node_modules').sort(byName);
    const requests = entries.filter(e => !e.isDirectory && ACTION_FILE_EXTENSIONS.includes(extensionOf(e.name))).sort(byName);

    // read concurrently (each read is a round trip to the host), added in the order the explorer shows them
    container.children.push(...await Promise.all([
        ...folders.map(entry => loadFolder(container, joinPath(dir, entry.name), loader)),
        ...requests.map(entry => loadRequest(container, joinPath(dir, entry.name), loader))
    ]));
}

async function loadFolder(parent: ContainerNode, path: string, loader: Loader): Promise<FolderNode> {
    const entries = await loader.source.listDir(path);
    const hasSettings = entries.some(e => !e.isDirectory && e.name == REConstants.FolderSettingsFile);
    const folder = new FolderNode(parent, path, CreateEmptyFolderConfig(''), hasSettings);

    if (hasSettings) {
        try {
            folder.config = await readFolderConfig(folder.settingsFile, loader);
        } catch (error) {
            folder.loadError = { file: folder.settingsFile, message: (error as Error).message };
        }
    }

    await loadEntries(folder, path, entries, loader);
    return folder;
}

async function readFolderConfig(file: string, loader: Loader): Promise<FolderConfig> {
    const config = normaliseFolderConfig(parseObject(await loader.source.readText(file)) as FolderConfig);
    // a hand-written file may have no id yet; the app gives it one when it saves
    return config.folderId == '' ? config : loadSecrets(config, loader.store, secretServiceForFolder(config.folderId));
}

async function loadRequest(parent: ContainerNode, path: string, loader: Loader): Promise<RequestNode> {
    try {
        const action = normaliseAction(parseObject(await loader.source.readText(path)) as RestAction);
        return new RequestNode(parent, path, await loadSecrets(action, loader.store, secretServiceForRequest(action.id)));
    } catch (error) {
        const node = new RequestNode(parent, path, CreateEmptyAction());
        node.loadError = { file: path, message: (error as Error).message };
        return node;
    }
}

function parseObject(text: string): object {
    const parsed = JSON.parse(text);
    if (parsed == null || typeof parsed != 'object' || Array.isArray(parsed))
        throw new Error('not a JSON object');
    return parsed;
}
