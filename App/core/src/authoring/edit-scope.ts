import { CollectionSink } from '../collection-sink';
import { LOCATOR_FORMS, Locator, LocatorKind, ResolvedScope, parseLocator, resolveLocator } from '../locator';
import {
    CollectionConfig, CreateEmptyFolderConfig, Environment, FolderConfig, HttpProtocol, RestAction, RestActionRun, RestTypeVerb, guidGenerator
} from '../model';
import { normaliseAction, normaliseCollectionConfig, normaliseFolderConfig } from '../normalise';
import { QueryError } from '../query-error';
import {
    SecretStore, secretServiceForCollection, secretServiceForFolder, secretServiceForRequest, storeSecrets
} from '../secrets';
import { CollectionSource, loadCollectionTree } from '../tree';

// The shared write path every authoring verb goes through, plus the few helpers more than one
// verb family needs. Split out of authoring.ts (AIF-13); the verbs themselves live in the
// sibling files and are re-exported from authoring.ts, which stays the only public entry point.

// What an authoring verb needs to read, write and keep secrets out of the files it writes.
// The host (the CLI, or Electron main) supplies the source, sink, secret store and guid generator.
export interface AuthoringContext {
    collectionFile: string;   // collection-relative name of the .frcol, e.g. 'api.frcol'
    source: CollectionSource;
    sink: CollectionSink;
    secrets: SecretStore;
    guid: guidGenerator;
}

export interface EditResult {
    file: string;        // the file written, collection-relative
    scope: string;       // the locator as given
    changed: boolean;    // false when the document was already in the asked-for state
    message: string;     // one line, e.g. "Set header 'Accept' on run:users/get.frreq#not found"
}

// The document a locator names, as a discriminated union. `settings` is the part of it the
// shared settings verbs (headers, variables, secrets, auth) edit.
export type ScopeTarget =
    | { document: 'collection'; config: CollectionConfig; settings: Environment }
    | { document: 'folder'; config: FolderConfig; settings: FolderConfig }
    | { document: 'request'; action: RestAction; settings: RestAction }
    | { document: 'request'; action: RestAction; settings: RestActionRun; run: RestActionRun };

const LOCATOR_PREFIXES: Record<LocatorKind, string> = {
    collection: 'collection',
    environment: 'env:',
    folder: 'folder:',
    request: 'request:',
    run: 'run:'
};

// `hint` is an extra clause a verb can add to say where the setting can go instead; without one
// the message ends in the locator forms, which is all a caller who mistyped the locator needs.
export function requireAllowed(verb: string, locator: Locator, allowed: LocatorKind[], hint: string | undefined): void {
    if (allowed.includes(locator.kind))
        return;

    const accepts = allowed.map(kind => LOCATOR_PREFIXES[kind]).join(', ');
    const only = allowed.length == 1 ? ' only' : '';
    const tail = hint == undefined ? `forms are ${LOCATOR_FORMS}` : hint;
    throw new QueryError(
        `${verb} accepts ${accepts}${only} (given ${LOCATOR_PREFIXES[locator.kind]}); ${tail}`
    );
}

// The raw document a locator names: read from the source so secrets stay as references and
// nothing inherited is baked in. A folder with no folder.frfolder yet starts from an empty one.
async function readDocument(ctx: AuthoringContext, resolved: ResolvedScope): Promise<unknown> {
    if (resolved.isNew)
        return CreateEmptyFolderConfig(ctx.guid.generateGUID());

    return JSON.parse(await ctx.source.readText(resolved.file));
}

// Fills in whatever the document is missing, in place. Run before apply() so a verb can count on
// the arrays being there, and again after it so anything the verb created is complete too: the
// normalise functions are idempotent, and their array reassignments keep the same element objects,
// so a ScopeTarget taken before the second pass still points at the objects that get written.
export function normaliseDocument(resolved: ResolvedScope, doc: unknown): void {
    switch (resolved.document) {
        case 'collection':
            normaliseCollectionConfig(doc as CollectionConfig);
            return;
        case 'folder':
            normaliseFolderConfig(doc as FolderConfig);
            return;
        case 'request':
            normaliseAction(doc as RestAction);
            return;
    }
}

// resolveLocator has already checked that the environment / run the locator names exists; these
// guards only keep a surprise from reaching apply() as an undefined settings object.
export function scopeTarget(resolved: ResolvedScope, doc: unknown): ScopeTarget {
    switch (resolved.document) {
        case 'collection': {
            const config = normaliseCollectionConfig(doc as CollectionConfig);
            const name = resolved.locator.name;
            if (name == undefined)
                return { document: 'collection', config, settings: config.collectionEnvironment };

            const environment = config.environments.find(e => e.id == name || e.name == name);
            if (environment == undefined)
                throw new QueryError(`Environment '${name}' is not in ${resolved.file}`);
            return { document: 'collection', config, settings: environment };
        }
        case 'folder': {
            const config = normaliseFolderConfig(doc as FolderConfig);
            return { document: 'folder', config, settings: config };
        }
        case 'request': {
            const action = normaliseAction(doc as RestAction);
            const idOrName = resolved.locator.run;
            if (idOrName == undefined)
                return { document: 'request', action, settings: action };

            const run = action.runs.find(r => r.id == idOrName || r.name == idOrName);
            if (run == undefined)
                throw new QueryError(`Run '${idOrName}' is not in ${resolved.file}`);
            return { document: 'request', action, settings: run, run };
        }
    }
}

function secretServiceFor(target: ScopeTarget): string {
    switch (target.document) {
        case 'collection':
            return secretServiceForCollection(target.config.collectionGuid);
        case 'folder':
            return secretServiceForFolder(target.config.folderId);
        case 'request':
            return secretServiceForRequest(target.action.id);
    }
}

// The read half of editScope, without the write back: resolve the locator against the loaded
// tree, read the document it names raw, and compute the typed target. editScope builds the write
// on top of this; rename's request: case uses it directly, since it writes the result to a
// different file than the one it read (a locator-move, not an in-place edit).
export async function resolveTarget(
    ctx: AuthoringContext,
    verb: string,
    scope: string,
    allowed: LocatorKind[],
    mismatchHint?: string
): Promise<{ resolved: ResolvedScope; doc: unknown; target: ScopeTarget }> {
    const locator = parseLocator(scope);
    requireAllowed(verb, locator, allowed, mismatchHint);

    const root = await loadCollectionTree(ctx.collectionFile, ctx.source, ctx.secrets);
    const resolved = resolveLocator(root, locator);

    const doc = await readDocument(ctx, resolved);
    const target = scopeTarget(resolved, doc);
    return { resolved, doc, target };
}

// The one write path every in-place authoring verb goes through: resolve the locator (see
// resolveTarget), let apply() mutate the document, move any secret values into the store, write.
// apply() returns the one-line message for the edit it made, or '' when there was nothing to do.
// `verb` is the name of the calling verb (e.g. 'set_url'); it only appears in error messages.
// `mismatchHint` replaces the locator-forms tail of the wrong-locator message, for a verb that
// has something more useful to say about where the edit belongs instead.
export async function editScope(
    ctx: AuthoringContext,
    verb: string,
    scope: string,
    allowed: LocatorKind[],
    apply: (target: ScopeTarget, resolved: ResolvedScope) => string,
    mismatchHint?: string
): Promise<EditResult> {
    const { resolved, doc, target } = await resolveTarget(ctx, verb, scope, allowed, mismatchHint);

    const message = apply(target, resolved);
    if (message == '')
        return { file: resolved.file, scope, changed: false, message: `${scope} is already in the asked-for state` };

    // Anything apply() created (a new run, a new environment) is normalised too, so what lands
    // on disk is always a complete document the app does not have to repair.
    normaliseDocument(resolved, doc);

    const stored = await storeSecrets(doc, ctx.secrets, secretServiceFor(target));
    await writeDocument(ctx, resolved.file, stored);
    return { file: resolved.file, scope, changed: true, message };
}

// For verbs that write a whole file rather than edit a scope (new_request, rename, move, delete)
export async function writeDocument(ctx: AuthoringContext, file: string, doc: unknown): Promise<void> {
    await ctx.sink.writeText(file, JSON.stringify(doc, null, 4));
}

// Splits a leading http:// or https:// off a url into { protocol, url }. A scheme-less url
// (including one holding a {{var}}) comes back with protocol undefined and the url untouched.
// Shared by newRequest and setUrl so the rule cannot drift between them: execute.ts:66 and
// inspect.ts:156 both rebuild `${protocol}://${url}`, so leaving a scheme inside url would
// double it up when the request fires or is displayed.
export function splitScheme(url: string): { protocol: HttpProtocol | undefined; url: string } {
    if (url.startsWith('https://'))
        return { protocol: HttpProtocol.https, url: url.slice('https://'.length) };
    if (url.startsWith('http://'))
        return { protocol: HttpProtocol.http, url: url.slice('http://'.length) };
    return { protocol: undefined, url };
}

// Creates a new .frreq at path. method is matched case-insensitively against RestTypeVerb; url is
// stored verbatim, except a leading http:// or https:// is stripped off into protocol (the app's
// own editor does the same split, and execute()/inspect() rebuild `${protocol}://${url}` when

// Every level of the hierarchy holds headers, so set_header takes any locator.
export const ALL_LOCATORS: LocatorKind[] = ['collection', 'environment', 'folder', 'request', 'run'];

export type SettingKind = 'header' | 'param' | 'variable' | 'secret' | 'validation-header' | 'capture';

// Which locators each kind of setting can live at. Variables and secrets are absent from
// request: because RestAction has no field for them (see the design spec).
export const SETTING_LOCATORS: Record<SettingKind, LocatorKind[]> = {
    'header': ALL_LOCATORS,
    'param': ['request', 'run'],
    'variable': ['collection', 'environment', 'folder', 'run'],
    'secret': ['collection', 'environment', 'folder', 'run'],
    'validation-header': ['request', 'run'],
    'capture': ['request', 'run']
};

// editScope has already refused the locators these verbs do not take; the guards are only so the
// compiler can see which part of the ScopeTarget union `settings` is.
export function requestSettings(target: ScopeTarget): RestAction | RestActionRun {
    if (target.document != 'request')
        throw new Error('wrong target');
    return target.settings;
}

// Both members of the 'request' half of ScopeTarget carry `action: RestAction` — the plain
// request and the run alike — so this is safe even though editScope's guard is what actually
// keeps a run from reaching the request-only verbs below (set_url/set_method/set_body).
export function requestAction(target: ScopeTarget): RestAction {
    if (target.document != 'request')
        throw new Error('wrong target');
    return target.action;
}

// Header and parameter names are matched without regard to case, as HTTP treats them.
export const sameName = (a: string, b: string) => a.toLowerCase() == b.toLowerCase();

// Replaces the entry whose name field matches `name`, or appends it when there is none.
// Keeps the existing entry's id so the row keeps its identity in the app's editor.
// Returns false when the entry is already exactly what was asked for, which is the caller's
// cue to report no change and leave the file alone.
// `equals` is the name matcher: each call site declares the semantics of its own table, so
// matching here always agrees with how the resolver looks that table up.
export function upsertNamed<T extends { value: string; active: boolean; id: string }>(
    list: T[],
    nameField: keyof T,
    name: string,
    entry: T,
    equals: (stored: string, asked: string) => boolean
): boolean {
    const index = list.findIndex(e => equals(String(e[nameField]), name));
    if (index < 0) {
        list.push(entry);
        return true;
    }

    const existing = list[index];
    if (existing[nameField] == entry[nameField] && existing.value == entry.value && existing.active == entry.active)
        return false;

    list[index] = { ...entry, id: existing.id };
    return true;
}
