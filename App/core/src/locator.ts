import { REConstants } from './model';
import { joinPath } from './paths';
import { QueryError } from './query-error';
import { CollectionNode, FolderNode, RequestNode, RunNode } from './scope';

// The single string every settings verb takes to say what it is editing.
// This module only parses the string; resolving it against a loaded
// collection tree is a separate step.
export type LocatorKind = 'collection' | 'environment' | 'folder' | 'request' | 'run';

export interface Locator {
    kind: LocatorKind;
    name?: string;   // environment name or id
    path?: string;   // folder path, or request file path (collection-relative)
    run?: string;    // run name or id
}

export const LOCATOR_FORMS =
    "collection | env:<name> | folder:<path> | request:<request path> | run:<request path>#<run name>";

// Backslashes to '/', then strip a leading './' or '/'.
//
// A '..' segment is refused here, in the one place every locator path passes through, with the
// same wording FsCollectionSink uses for a write that would leave the collection folder. Nothing
// is written either way -- resolveLocator would not find such a path in the tree -- but a plain
// "not found (known: ...)" says nothing about why it can never be found, and invites a caller
// that meant to reach outside the folder to try the next spelling. Saying where the boundary is
// is what lets an agent correct itself instead.
function normalisePath(path: string): string {
    const slashed = path.replace(/\\/g, '/');
    const stripped = slashed.startsWith('./') ? slashed.slice(2) : slashed.startsWith('/') ? slashed.slice(1) : slashed;
    const trimmed = stripped.endsWith('/') ? stripped.slice(0, -1) : stripped;
    if (trimmed.split('/').some(segment => segment === '..'))
        throw new QueryError(`'${path}' is outside the collection folder`);
    return trimmed;
}

export function parseLocator(text: string): Locator {
    const trimmed = text.trim();

    if (trimmed.toLowerCase() === 'collection') return { kind: 'collection' };

    const colon = trimmed.indexOf(':');
    if (colon < 0) throw new QueryError(`Unrecognised locator '${text}'; expected one of: ${LOCATOR_FORMS}`);

    const prefix = trimmed.slice(0, colon).toLowerCase();
    const rest = trimmed.slice(colon + 1);

    switch (prefix) {
        case 'env': {
            if (rest === '') throw new QueryError("An 'env:' locator needs a name, e.g. env:Production");
            return { kind: 'environment', name: rest };
        }
        case 'folder': {
            if (rest === '') throw new QueryError("A 'folder:' locator needs a path, e.g. folder:users");
            const path = normalisePath(rest);
            if (path === '' || path === '.')
                throw new QueryError(
                    "collection-wide settings belong in the collection file; use the 'collection' locator"
                );
            return { kind: 'folder', path };
        }
        case 'request': {
            if (rest === '') throw new QueryError("A 'request:' locator needs a path, e.g. request:users/get.frreq");
            return { kind: 'request', path: normalisePath(rest) };
        }
        case 'run': {
            const hash = rest.lastIndexOf('#');
            if (hash < 0 || rest.slice(hash + 1) === '')
                throw new QueryError(
                    "A 'run:' locator needs a run name, e.g. run:users/get.frreq#not found"
                );
            return { kind: 'run', path: normalisePath(rest.slice(0, hash)), run: rest.slice(hash + 1) };
        }
        default:
            throw new QueryError(`Unrecognised locator '${text}'; expected one of: ${LOCATOR_FORMS}`);
    }
}

export type DocumentKind = 'collection' | 'folder' | 'request';

export interface ResolvedScope {
    locator: Locator;
    document: DocumentKind;   // which kind of file holds it
    file: string;             // collection-relative path of that file
    isNew: boolean;           // true only for a folder with no folder.frfolder yet
    node?: FolderNode | RequestNode | RunNode;
}

// A node whose file core could not parse must never be written to.
function requireLoaded(node: FolderNode | RequestNode): void {
    if (node.loadError != undefined)
        throw new QueryError(`${node.loadError.file} is invalid: ${node.loadError.message}`);
}

function resolveEnvironment(root: CollectionNode, locator: Locator): ResolvedScope {
    const name = locator.name!;
    const found = root.config.environments.find(e => e.name == name || e.id == name);
    if (found == undefined) {
        const known = root.config.environments.map(e => e.name).join(', ') || 'none';
        throw new QueryError(`Environment '${name}' not found (known: ${known})`);
    }
    return { locator, document: 'collection', file: root.fileName, isNew: false };
}

function resolveFolder(root: CollectionNode, locator: Locator): ResolvedScope {
    const path = locator.path!;
    const node = root.find(path);
    if (!(node instanceof FolderNode)) {
        const known = root.folderNodes().map(f => f.path).join(', ') || 'none';
        throw new QueryError(`Folder '${path}' not found (known: ${known})`);
    }
    requireLoaded(node);
    return { locator, document: 'folder', file: joinPath(path, REConstants.FolderSettingsFile), isNew: !node.hasSettingsFile, node };
}

// Shared by 'request' and 'run': a run's path names the request that holds it.
// An empty path (from a bare 'request:./' or 'request:/') cannot match any request.
function findRequest(root: CollectionNode, path: string): RequestNode {
    const node = path === '' ? undefined : root.find(path);
    if (!(node instanceof RequestNode)) {
        const known = root.requestNodes().map(r => r.path).join(', ') || 'none';
        throw new QueryError(`Request '${path}' not found (known: ${known})`);
    }
    requireLoaded(node);
    return node;
}

function resolveRequest(root: CollectionNode, locator: Locator): ResolvedScope {
    const node = findRequest(root, locator.path!);
    return { locator, document: 'request', file: node.path, isNew: false, node };
}

function resolveRun(root: CollectionNode, locator: Locator): ResolvedScope {
    const request = findRequest(root, locator.path!);
    const idOrName = locator.run!;
    const run = request.action.runs.find(r => r.id == idOrName || r.name == idOrName);
    if (run == undefined) {
        const known = request.action.runs.map(r => r.name).join(', ') || 'none';
        throw new QueryError(`Run '${idOrName}' not found in '${request.name}' (known: ${known})`);
    }
    return { locator, document: 'request', file: request.path, isNew: false, node: new RunNode(request, run) };
}

// Turns a parsed locator into the document it names, against a loaded collection tree.
// Fails with a QueryError listing what does exist when the locator names nothing.
export function resolveLocator(root: CollectionNode, locator: Locator): ResolvedScope {
    switch (locator.kind) {
        case 'collection':
            return { locator, document: 'collection', file: root.fileName, isNew: false };
        case 'environment':
            return resolveEnvironment(root, locator);
        case 'folder':
            return resolveFolder(root, locator);
        case 'request':
            return resolveRequest(root, locator);
        case 'run':
            return resolveRun(root, locator);
    }
}
