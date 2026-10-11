import { CollectionSink } from './collection-sink';
import { LOCATOR_FORMS, Locator, LocatorKind, ResolvedScope, parseLocator, resolveLocator } from './locator';
import {
    CollectionConfig, CreateEmptyCollectionConfig, CreateEmptyEnvironment, CreateEmptyFolderConfig, Environment,
    FolderConfig, REConstants, RestAction, RestActionRun, guidGenerator
} from './model';
import { normaliseAction, normaliseCollectionConfig, normaliseFolderConfig } from './normalise';
import { extensionOf } from './paths';
import { QueryError } from './query-error';
import {
    SecretStore, secretServiceForCollection, secretServiceForFolder, secretServiceForRequest, storeSecrets
} from './secrets';
import { CollectionSource, loadCollectionTree } from './tree';

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

function requireAllowed(verb: string, locator: Locator, allowed: LocatorKind[]): void {
    if (allowed.includes(locator.kind))
        return;

    const accepts = allowed.map(kind => LOCATOR_PREFIXES[kind]).join(', ');
    const only = allowed.length == 1 ? ' only' : '';
    throw new QueryError(
        `${verb} accepts ${accepts}${only} (given ${LOCATOR_PREFIXES[locator.kind]}); forms are ${LOCATOR_FORMS}`
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
function normaliseDocument(resolved: ResolvedScope, doc: unknown): void {
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
function scopeTarget(resolved: ResolvedScope, doc: unknown): ScopeTarget {
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

// The one write path every authoring verb goes through: resolve the locator, read the document
// it names raw, normalise it, let apply() mutate it, move any secret values into the store, write.
// apply() returns the one-line message for the edit it made, or '' when there was nothing to do.
// `verb` is the name of the calling verb (e.g. 'set_url'); it only appears in error messages.
export async function editScope(
    ctx: AuthoringContext,
    verb: string,
    scope: string,
    allowed: LocatorKind[],
    apply: (target: ScopeTarget, resolved: ResolvedScope) => string
): Promise<EditResult> {
    const locator = parseLocator(scope);
    requireAllowed(verb, locator, allowed);

    const root = await loadCollectionTree(ctx.collectionFile, ctx.source, ctx.secrets);
    const resolved = resolveLocator(root, locator);

    const doc = await readDocument(ctx, resolved);
    const target = scopeTarget(resolved, doc);

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

// Writes a brand-new .frcol. This is the one verb that runs with no collection loaded, so it
// never reads ctx.collectionFile; `file` is the collection-relative name to create.
export async function newCollection(ctx: AuthoringContext, file: string, environments: string[] = []): Promise<EditResult> {
    if (extensionOf(file) != REConstants.CollectionExtension)
        throw new QueryError(`new_collection needs a name ending in ${REConstants.CollectionExtension} (given ${file})`);
    if (await ctx.sink.exists(file))
        throw new QueryError(`${file} already exists`);

    const config = CreateEmptyCollectionConfig(ctx.guid);
    config.environments = environments.map(name => ({ ...CreateEmptyEnvironment(), name, id: ctx.guid.generateGUID() }));
    if (config.environments.length > 0)
        config.selectedEnvironmentId = config.environments[0].id;

    normaliseCollectionConfig(config);
    await writeDocument(ctx, file, config);
    return { file, scope: file, changed: true, message: `Created collection ${file}` };
}

// Adds an environment to the loaded collection. Selects it when the collection had none at all.
export async function newEnvironment(ctx: AuthoringContext, name: string): Promise<EditResult> {
    return editScope(ctx, 'new_environment', 'collection', ['collection'], target => {
        if (target.document != 'collection')
            throw new Error('wrong target');

        const existing = target.config.environments.find(e => e.name == name);
        if (existing != undefined) {
            const names = target.config.environments.map(e => e.name).join(', ');
            throw new QueryError(`Environment '${name}' already exists (have ${names})`);
        }

        const hadNone = target.config.environments.length == 0;
        const environment: Environment = { ...CreateEmptyEnvironment(), name, id: ctx.guid.generateGUID() };
        target.config.environments.push(environment);
        if (hadNone)
            target.config.selectedEnvironmentId = environment.id;

        return `Added environment '${name}'`;
    });
}

// Switches which environment of the loaded collection is selected, by name or id.
export async function selectEnvironment(ctx: AuthoringContext, name: string): Promise<EditResult> {
    return editScope(ctx, 'select_environment', 'collection', ['collection'], target => {
        if (target.document != 'collection')
            throw new Error('wrong target');

        const environment = target.config.environments.find(e => e.id == name || e.name == name);
        if (environment == undefined) {
            const names = target.config.environments.map(e => e.name).join(', ');
            throw new QueryError(`Environment '${name}' is not in the collection (have ${names})`);
        }

        if (target.config.selectedEnvironmentId == environment.id)
            return '';

        target.config.selectedEnvironmentId = environment.id;
        return `Selected environment '${environment.name}'`;
    });
}
