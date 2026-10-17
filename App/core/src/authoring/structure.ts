import { sourceOf } from '../inspect';
import { Locator, LocatorKind, parseLocator, resolveLocator } from '../locator';
import { Environment, REConstants, RestActionRun } from '../model';
import { basenameOf, dirnameOf, extensionOf, joinPath } from '../paths';
import { QueryError } from '../query-error';
import { SecretStore } from '../secrets';
import { CollectionNode } from '../scope';
import { CollectionSource, loadCollectionTree } from '../tree';
import {
    AuthoringContext, EditResult, requireAllowed, normaliseDocument, editScope, writeDocument, resolveTarget
} from './edit-scope';

// --- websocket triggers follow their target ---------------------------------------------------------

// A websocket request's trigger.request is a collection-relative path. When the request it names (or a folder
// above it) is renamed or moved, every trigger pointing at it is rewritten to the new path so it does not
// dangle. `mapPath` returns the new path for a trigger target, or undefined when it is untouched; `locate`
// says where a websocket file lives now (it may itself have just moved with a folder). Returns the count.
async function retargetTriggers(
    ctx: AuthoringContext, root: CollectionNode, mapPath: (target: string) => string | undefined, locate: (file: string) => string
): Promise<number> {
    let count = 0;
    for (const node of root.requestNodes()) {
        const trigger = node.action.trigger;
        const next = trigger == undefined ? undefined : mapPath(trigger.request);
        if (next == undefined)
            continue;
        const file = locate(node.path);
        const doc = JSON.parse(await ctx.source.readText(file));
        doc.trigger = { ...doc.trigger, request: next };
        await writeDocument(ctx, file, doc);
        count++;
    }
    return count;
}

const retargetNote = (count: number) => count == 0 ? '' : `; updated the trigger of ${count} websocket request${count == 1 ? '' : 's'}`;

// The websocket requests whose trigger names the path (or anything beneath it when it is a folder)
function triggersPointingAt(root: CollectionNode, path: string, folder: boolean): string[] {
    return root.requestNodes()
        .filter(n => n.action.trigger != undefined && (n.action.trigger.request == path || (folder && n.action.trigger.request.startsWith(path + '/'))))
        .map(n => n.path);
}

const deleteWarning = (files: string[]) => files.length == 0 ? '' : `; warning: the trigger of ${files.join(', ')} now names a request that no longer exists`;

// --- rename --------------------------------------------------------------------------------------

// Every kind rename accepts except the collection itself: renaming api.frcol has no settings to
// carry, just the file, so it is a move, not a rename.
const RENAME_LOCATORS: LocatorKind[] = ['environment', 'folder', 'request', 'run'];
const RENAME_COLLECTION_HINT = 'the collection file itself is renamed with move, not rename';

// request: and folder: take a bare name, not a path; a path belongs to move.
function requireBareName(verb: string, newName: string): void {
    if (newName.includes('/') || newName.includes('\\'))
        throw new QueryError(`${verb} needs a bare name, not a path (given '${newName}'); use move to change where it lives`);
}

// Renames an environment, run, request file or folder directory.
//
// env: and run: are in-place edits and go through editScope like every other settings verb.
// request: and folder: move a file or directory — editScope cannot express that, since it always
// writes back to the file it read — so they resolve the locator themselves and do the file work
// directly, reusing loadCollectionTree + resolveLocator (via resolveTarget for request:, which
// also needs the parsed document; folder: does not and calls them directly) rather than
// duplicating what those already check: existence, a node with a loadError, what exists.
export async function rename(ctx: AuthoringContext, scope: string, newName: string): Promise<EditResult> {
    const locator = parseLocator(scope);
    requireAllowed('rename', locator, RENAME_LOCATORS, locator.kind == 'collection' ? RENAME_COLLECTION_HINT : undefined);

    switch (locator.kind) {
        case 'environment':
            return renameEnvironment(ctx, scope, newName);
        case 'run':
            return renameRun(ctx, scope, newName);
        case 'request':
            return renameRequestFile(ctx, scope, newName);
        case 'folder':
            return renameFolderDir(ctx, locator, scope, newName);
        case 'collection':
            // unreachable: requireAllowed above has already thrown for 'collection'
            throw new Error('wrong target');
    }
}

function renameEnvironment(ctx: AuthoringContext, scope: string, newName: string): Promise<EditResult> {
    return editScope(ctx, 'rename', scope, ['environment'], target => {
        if (target.document != 'collection')
            throw new Error('wrong target');

        const environment = target.settings;
        if (environment.name == newName)
            return '';

        const clash = target.config.environments.find(e => e.name == newName && e.id != environment.id);
        if (clash != undefined) {
            const names = target.config.environments.map(e => e.name).join(', ');
            throw new QueryError(`Environment '${newName}' already exists (have ${names})`);
        }

        const oldName = environment.name;
        environment.name = newName;
        return `Renamed environment '${oldName}' to '${newName}'`;
    });
}

function renameRun(ctx: AuthoringContext, scope: string, newName: string): Promise<EditResult> {
    return editScope(ctx, 'rename', scope, ['run'], target => {
        if (target.document != 'request' || !('run' in target))
            throw new Error('wrong target');

        if (target.run.name == newName)
            return '';

        const clash = target.action.runs.find(r => r.name == newName && r.id != target.run.id);
        if (clash != undefined) {
            const names = target.action.runs.map(r => r.name).join(', ');
            throw new QueryError(`Run '${newName}' already exists (have ${names})`);
        }

        const oldName = target.run.name;
        target.run.name = newName;
        return `Renamed run '${oldName}' to '${newName}'`;
    });
}

// request: renames the file within its own directory. .frreq is appended to newName when it has
// no extension already. action.name follows the file only when it still equalled the OLD file's
// stem — a request the caller named explicitly keeps that name across the rename.
async function renameRequestFile(ctx: AuthoringContext, scope: string, newName: string): Promise<EditResult> {
    requireBareName('rename', newName);

    const { resolved, doc, target } = await resolveTarget(ctx, 'rename', scope, ['request']);
    if (target.document != 'request')
        throw new Error('wrong target');

    const oldPath = resolved.file;
    const oldBase = basenameOf(oldPath);
    const oldStem = oldBase.slice(0, oldBase.length - extensionOf(oldBase).length);

    const newBase = extensionOf(newName) == REConstants.ActionExtension ? newName : `${newName}${REConstants.ActionExtension}`;
    const newPath = joinPath(dirnameOf(oldPath), newBase);

    if (newPath == oldPath)
        return { file: oldPath, scope, changed: false, message: `${scope} is already in the asked-for state` };
    if (await ctx.sink.exists(newPath))
        throw new QueryError(`${newPath} already exists`);

    const newStem = newBase.slice(0, newBase.length - extensionOf(newBase).length);
    if (target.action.name == oldStem)
        target.action.name = newStem;

    // Whatever the name change above needed is already in shape; normalise again anyway so a
    // half-formed document never reaches disk, matching editScope's own write path.
    normaliseDocument(resolved, doc);

    await writeDocument(ctx, newPath, doc);
    await ctx.sink.remove(oldPath);
    const root = await loadCollectionTree(ctx.collectionFile, ctx.source, ctx.secrets);
    const updated = await retargetTriggers(ctx, root, t => t == oldPath ? newPath : undefined, f => f);
    return { file: newPath, scope, changed: true, message: `Renamed ${oldPath} to ${newPath}${retargetNote(updated)}` };
}

// Every file at or below dir, depth first — there is no recursive list on CollectionSource.
async function filesBeneath(source: CollectionSource, dir: string): Promise<string[]> {
    const entries = await source.listDir(dir);
    const files: string[] = [];
    for (const entry of entries) {
        const path = joinPath(dir, entry.name);
        if (entry.isDirectory)
            files.push(...await filesBeneath(source, path));
        else
            files.push(path);
    }
    return files;
}

// folder: renames the directory within its parent. The folder's own settings (including its
// folderId, so its keychain entries keep working) are never read as a typed document — they, and
// everything else under the old path, are copied across as raw text: mkdir the new path, writeText
// every file beneath the old one (read through ctx.source, which sees secrets as references, never
// values), then remove the old path.
async function renameFolderDir(ctx: AuthoringContext, locator: Locator, scope: string, newName: string): Promise<EditResult> {
    requireBareName('rename', newName);

    const root = await loadCollectionTree(ctx.collectionFile, ctx.source, ctx.secrets);
    const resolved = resolveLocator(root, locator);
    const oldPath = resolved.node!.path;
    const newPath = joinPath(dirnameOf(oldPath), newName);

    if (newPath == oldPath)
        return { file: oldPath, scope, changed: false, message: `${scope} is already in the asked-for state` };
    if (await ctx.sink.exists(newPath))
        throw new QueryError(`${newPath} already exists`);

    const files = await filesBeneath(ctx.source, oldPath);
    await ctx.sink.mkdir(newPath);
    for (const file of files)
        await ctx.sink.writeText(joinPath(newPath, file.slice(oldPath.length + 1)), await ctx.source.readText(file));
    await ctx.sink.remove(oldPath);
    const updated = await retargetTriggers(ctx, root, t => t.startsWith(oldPath + '/') ? newPath + t.slice(oldPath.length) : undefined, f => f.startsWith(oldPath + '/') ? newPath + f.slice(oldPath.length) : f);

    return { file: newPath, scope, changed: true, message: `Renamed ${oldPath} to ${newPath}${retargetNote(updated)}` };
}

// --- move ------------------------------------------------------------------------------------------

// request: and folder: only; a collection is moved by renaming the .frcol file itself (a host
// concern, not a verb here), and env:/run: have no file of their own to move.
const MOVE_LOCATORS: LocatorKind[] = ['request', 'folder'];

// The chain-above name a verb like show_request would print for the folder at `dir`: 'folder:<path>',
// or 'collection:<name>' at the root, using the collection name of the already-loaded tree. Reuses
// sourceOf() from inspect.ts (the same formatting show_request's source column uses) rather than
// recreating its 'kind:name' shape here, so the two can never drift apart.
function inheritsFrom(root: { name: string }, dir: string): string {
    return dir == '' ? sourceOf({ kind: 'collection', name: root.name }) : sourceOf({ kind: 'folder', name: dir });
}

// Moves a request file or folder directory to a new collection-relative path.
//
// Like rename's request:/folder: cases, this copies raw text through ctx.source/ctx.sink rather
// than reading a typed document: a move changes nothing about the document, so there is nothing
// to normalise or write back differently than what was already on disk — ids and action.name
// included, so keychain entries keep working and a move is never mistaken for a rename.
//
// Ordering matters for safety: refuse first, create what is needed, write every file at the new
// path, and only then remove the old path. A failure partway through then leaves files at both
// paths rather than losing them — not atomic, but never destructive.
export async function move(ctx: AuthoringContext, scope: string, newPath: string): Promise<EditResult> {
    const locator = parseLocator(scope);
    requireAllowed('move', locator, MOVE_LOCATORS, undefined);

    switch (locator.kind) {
        case 'request':
            return moveRequestFile(ctx, locator, scope, newPath);
        case 'folder':
            return moveFolderDir(ctx, locator, scope, newPath);
        case 'collection':
        case 'environment':
        case 'run':
            // unreachable: requireAllowed above has already thrown for every kind but request/folder
            throw new Error('wrong target');
    }
}

// Moving a request changes the folder chain it inherits from — headers, variables, secrets and
// auth all resolve through that chain — so the message names both chains when they differ, using
// the same names inheritsFrom() (and so show_request's source) would use.
async function moveRequestFile(ctx: AuthoringContext, locator: Locator, scope: string, newPath: string): Promise<EditResult> {
    if (extensionOf(newPath) != REConstants.ActionExtension)
        throw new QueryError(`move needs a path ending in ${REConstants.ActionExtension} (given ${newPath})`);

    const root = await loadCollectionTree(ctx.collectionFile, ctx.source, ctx.secrets);
    const resolved = resolveLocator(root, locator);
    const oldPath = resolved.file;

    if (newPath == oldPath)
        return { file: oldPath, scope, changed: false, message: `${scope} is already in the asked-for state` };
    if (await ctx.sink.exists(newPath))
        throw new QueryError(`${newPath} already exists`);

    const dir = dirnameOf(newPath);
    if (!(await ctx.sink.exists(dir)))
        await ctx.sink.mkdir(dir);

    await ctx.sink.writeText(newPath, await ctx.source.readText(oldPath));
    await ctx.sink.remove(oldPath);
    const updated = await retargetTriggers(ctx, root, t => t == oldPath ? newPath : undefined, f => f);

    const oldChain = inheritsFrom(root, dirnameOf(oldPath));
    const newChain = inheritsFrom(root, dirnameOf(newPath));
    const inheritance = oldChain == newChain ? '' : `; it now inherits from ${newChain} instead of ${oldChain}`;

    return { file: newPath, scope, changed: true, message: `Moved ${oldPath} to ${newPath}${inheritance}${retargetNote(updated)}` };
}

// Moving a directory carries everything beneath it (filesBeneath, under rename above), the same
// raw-text copy renameFolderDir uses. newPath must be neither the old path itself nor anywhere
// beneath it — checked with a '/' boundary so a sibling whose name merely starts with the same
// characters (folder:users moved to users2/sub) is never mistaken for nesting.
async function moveFolderDir(ctx: AuthoringContext, locator: Locator, scope: string, newPath: string): Promise<EditResult> {
    const root = await loadCollectionTree(ctx.collectionFile, ctx.source, ctx.secrets);
    const resolved = resolveLocator(root, locator);
    const oldPath = resolved.node!.path;

    if (newPath == oldPath)
        return { file: oldPath, scope, changed: false, message: `${scope} is already in the asked-for state` };
    if (newPath.startsWith(oldPath + '/'))
        throw new QueryError(`${newPath} is inside ${oldPath}; a folder cannot be moved into itself`);
    if (await ctx.sink.exists(newPath))
        throw new QueryError(`${newPath} already exists`);

    const files = await filesBeneath(ctx.source, oldPath);
    await ctx.sink.mkdir(newPath);
    for (const file of files)
        await ctx.sink.writeText(joinPath(newPath, file.slice(oldPath.length + 1)), await ctx.source.readText(file));
    await ctx.sink.remove(oldPath);
    const updated = await retargetTriggers(ctx, root, t => t.startsWith(oldPath + '/') ? newPath + t.slice(oldPath.length) : undefined, f => f.startsWith(oldPath + '/') ? newPath + f.slice(oldPath.length) : f);

    return { file: newPath, scope, changed: true, message: `Moved ${oldPath} to ${newPath}${retargetNote(updated)}` };
}

// --- delete --------------------------------------------------------------------------------------

// Every kind delete accepts except the collection itself: there is nothing to delete a collection
// into, unlike a folder or request, which still exist (just empty) once their contents are gone.
const DELETE_LOCATORS: LocatorKind[] = ['environment', 'folder', 'request', 'run'];
const DELETE_COLLECTION_HINT = 'the collection file itself is not something delete removes';

// Whether a file beneath a folder being deleted is one delete already knows is safe to lose: a
// request (current or legacy extension, matching ACTION_FILE_EXTENSIONS) or a folder's own
// settings file, wherever in the sub-tree it sits. Anything else is reported back to the caller
// rather than silently removed — an agent should never delete something it did not put there.
function isDeletableFolderFile(path: string): boolean {
    if (basenameOf(path) == REConstants.FolderSettingsFile)
        return true;

    const ext = extensionOf(path);
    return ext == REConstants.ActionExtension || ext == REConstants.LegacyActionExtension;
}

// Deletes an environment, run, request file or folder directory (and everything under it).
//
// env: and run: remove an element from an already-loaded document and go through editScope like
// every other settings verb. request: and folder: remove a file or directory — editScope has
// nothing to write back once the file itself is gone — so they resolve the locator themselves and
// call ctx.sink.remove directly, the same split rename uses (see its comment above).
//
// Keychain entries are never deleted by any of the four kinds: core has no list operation on
// SecretStore, so a delete has no way to find which entries belonged to what it just removed. A
// leftover entry is inert (nothing references its service/name any more) but not cleaned up.
export async function remove(ctx: AuthoringContext, scope: string): Promise<EditResult> {
    const locator = parseLocator(scope);
    requireAllowed('delete', locator, DELETE_LOCATORS, locator.kind == 'collection' ? DELETE_COLLECTION_HINT : undefined);

    switch (locator.kind) {
        case 'environment':
            return removeEnvironment(ctx, scope);
        case 'run':
            return removeRun(ctx, scope);
        case 'request':
            return removeRequestFile(ctx, locator, scope);
        case 'folder':
            return removeFolderDir(ctx, locator, scope);
        case 'collection':
            // unreachable: requireAllowed above has already thrown for 'collection'
            throw new Error('wrong target');
    }
}

// Removes the Environment itself from the collection's environments array. If it was the selected
// one, selection moves to the first environment left, or '' when none are — the collection must
// never be left pointing at an environment that no longer exists.
function removeEnvironment(ctx: AuthoringContext, scope: string): Promise<EditResult> {
    return editScope(ctx, 'delete', scope, ['environment'], target => {
        if (target.document != 'collection')
            throw new Error('wrong target');

        const environment = target.settings;
        target.config.environments.splice(target.config.environments.indexOf(environment), 1);

        if (target.config.selectedEnvironmentId == environment.id)
            target.config.selectedEnvironmentId = target.config.environments[0]?.id ?? '';

        return `Deleted environment '${environment.name}'`;
    });
}

// Removes the RestActionRun from the request's runs array.
function removeRun(ctx: AuthoringContext, scope: string): Promise<EditResult> {
    return editScope(ctx, 'delete', scope, ['run'], target => {
        if (target.document != 'request' || !('run' in target))
            throw new Error('wrong target');

        target.action.runs.splice(target.action.runs.indexOf(target.run), 1);
        return `Deleted run '${target.run.name}'`;
    });
}

// request: removes the .frreq file. No typed read is needed — delete has nothing to inspect in
// the document before removing it — so this resolves the locator directly rather than going
// through resolveTarget.
async function removeRequestFile(ctx: AuthoringContext, locator: Locator, scope: string): Promise<EditResult> {
    const root = await loadCollectionTree(ctx.collectionFile, ctx.source, ctx.secrets);
    const resolved = resolveLocator(root, locator);

    const dangling = triggersPointingAt(root, resolved.file, false);
    await ctx.sink.remove(resolved.file);
    return { file: resolved.file, scope, changed: true, message: `Deleted ${resolved.file}${deleteWarning(dangling)}` };
}

// folder: removes the directory and everything beneath it, but only once every file down there has
// been checked against isDeletableFolderFile — filesBeneath (see rename, above) does the walk, via
// ctx.source so nothing is touched while checking. Any stray file aborts before ctx.sink.remove is
// ever called, naming every one found so the caller knows exactly what is in the way.
async function removeFolderDir(ctx: AuthoringContext, locator: Locator, scope: string): Promise<EditResult> {
    const root = await loadCollectionTree(ctx.collectionFile, ctx.source, ctx.secrets);
    const resolved = resolveLocator(root, locator);
    const path = resolved.node!.path;

    const files = await filesBeneath(ctx.source, path);
    const strays = files.filter(file => !isDeletableFolderFile(file));
    if (strays.length > 0)
        throw new QueryError(`${scope} holds file(s) delete will not remove: ${strays.join(', ')}`);

    const dangling = triggersPointingAt(root, path, true).filter(f => !f.startsWith(path + '/'));
    await ctx.sink.remove(path);
    return { file: path, scope, changed: true, message: `Deleted ${path}${deleteWarning(dangling)}` };
}

