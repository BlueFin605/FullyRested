import { CollectionSink } from './collection-sink';
import { inferSchema } from './infer';
import { sourceOf } from './inspect';
import { LOCATOR_FORMS, Locator, LocatorKind, ResolvedScope, parseLocator, resolveLocator } from './locator';
import {
    AuthenticationDetails, CollectionConfig, CreateEmptyAction, CreateEmptyActionBody, CreateEmptyCollectionConfig, CreateEmptyEnvironment,
    CreateEmptyFolderConfig, CreateEmptyRestActionRun, Environment, FolderConfig, FORM_CONTENT_TYPE, FormField, HeaderTable, HttpProtocol,
    ParamTable, REConstants, RestAction, RestActionRun, RestActionValidation, RestActionValidationJsonSchema, RestTypeVerb, SecretTable,
    ValidationType, ValidationTypeBody, VariableTable, guidGenerator
} from './model';
import {
    normaliseAction, normaliseAuthentication, normaliseCollectionConfig, normaliseFolderConfig
} from './normalise';
import { basenameOf, dirnameOf, extensionOf, joinPath } from './paths';
import { findCase, resolveRun } from './query';
import { QueryError } from './query-error';
import { RunStore } from './run-store';
import {
    SecretStore, secretServiceForCollection, secretServiceForFolder, secretServiceForRequest, storeSecrets
} from './secrets';
import { CollectionSource, loadCollectionTree } from './tree';
import { compileSchema } from './validate';

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
function requireAllowed(verb: string, locator: Locator, allowed: LocatorKind[], hint: string | undefined): void {
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

// The read half of editScope, without the write back: resolve the locator against the loaded
// tree, read the document it names raw, and compute the typed target. editScope builds the write
// on top of this; rename's request: case uses it directly, since it writes the result to a
// different file than the one it read (a locator-move, not an in-place edit).
async function resolveTarget(
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

// Makes a folder on disk. Writes no folder.frfolder: a folder needs one only once it has
// settings, and editScope creates it on demand (see readDocument).
export async function newFolder(ctx: AuthoringContext, path: string): Promise<EditResult> {
    if (path == '' || path == '.')
        throw new QueryError(`new_folder needs a path (given '${path}')`);
    if (await ctx.sink.exists(path))
        throw new QueryError(`${path} already exists`);

    await ctx.sink.mkdir(path);
    return { file: path, scope: path, changed: true, message: `Created folder ${path}` };
}

// Splits a leading http:// or https:// off a url into { protocol, url }. A scheme-less url
// (including one holding a {{var}}) comes back with protocol undefined and the url untouched.
// Shared by newRequest and setUrl so the rule cannot drift between them: execute.ts:66 and
// inspect.ts:156 both rebuild `${protocol}://${url}`, so leaving a scheme inside url would
// double it up when the request fires or is displayed.
function splitScheme(url: string): { protocol: HttpProtocol | undefined; url: string } {
    if (url.startsWith('https://'))
        return { protocol: HttpProtocol.https, url: url.slice('https://'.length) };
    if (url.startsWith('http://'))
        return { protocol: HttpProtocol.http, url: url.slice('http://'.length) };
    return { protocol: undefined, url };
}

// Creates a new .frreq at path. method is matched case-insensitively against RestTypeVerb; url is
// stored verbatim, except a leading http:// or https:// is stripped off into protocol (the app's
// own editor does the same split, and execute()/inspect() rebuild `${protocol}://${url}` when
// firing or displaying the request, so leaving the scheme in url would double it up).
export async function newRequest(ctx: AuthoringContext, path: string, method: string, url: string): Promise<EditResult> {
    if (extensionOf(path) != REConstants.ActionExtension)
        throw new QueryError(`new_request needs a name ending in ${REConstants.ActionExtension} (given ${path})`);
    if (await ctx.sink.exists(path))
        throw new QueryError(`${path} already exists`);

    const verbs = Object.values(RestTypeVerb);
    const verb = verbs.find(v => v.toLowerCase() == method.toLowerCase());
    if (verb == undefined)
        throw new QueryError(`Unknown method '${method}' (have ${verbs.join(', ')})`);

    const action = CreateEmptyAction();
    action.id = ctx.guid.generateGUID();
    action.name = basenameOf(path).slice(0, -extensionOf(path).length);
    action.verb = verb;
    const split = splitScheme(url);
    if (split.protocol != undefined)
        action.protocol = split.protocol;
    action.url = split.url;

    const dir = dirnameOf(path);
    if (!(await ctx.sink.exists(dir)))
        await ctx.sink.mkdir(dir);

    await writeDocument(ctx, path, action);
    return { file: path, scope: path, changed: true, message: `Created request ${path}` };
}

// --- settings verbs ----------------------------------------------------------------------------

// Every level of the hierarchy holds headers, so set_header takes any locator.
const ALL_LOCATORS: LocatorKind[] = ['collection', 'environment', 'folder', 'request', 'run'];

export type SettingKind = 'header' | 'param' | 'variable' | 'secret' | 'validation-header';

// Which locators each kind of setting can live at. Variables and secrets are absent from
// request: because RestAction has no field for them (see the design spec).
const SETTING_LOCATORS: Record<SettingKind, LocatorKind[]> = {
    'header': ALL_LOCATORS,
    'param': ['request', 'run'],
    'variable': ['collection', 'environment', 'folder', 'run'],
    'secret': ['collection', 'environment', 'folder', 'run'],
    'validation-header': ['request', 'run']
};

// editScope has already refused the locators these verbs do not take; the guards are only so the
// compiler can see which part of the ScopeTarget union `settings` is.
function requestSettings(target: ScopeTarget): RestAction | RestActionRun {
    if (target.document != 'request')
        throw new Error('wrong target');
    return target.settings;
}

// Both members of the 'request' half of ScopeTarget carry `action: RestAction` — the plain
// request and the run alike — so this is safe even though editScope's guard is what actually
// keeps a run from reaching the request-only verbs below (set_url/set_method/set_body).
function requestAction(target: ScopeTarget): RestAction {
    if (target.document != 'request')
        throw new Error('wrong target');
    return target.action;
}

function scopeSettings(target: ScopeTarget): Environment | FolderConfig | RestActionRun {
    if (target.document != 'request')
        return target.settings;
    if (!('run' in target))
        throw new Error('wrong target');
    return target.run;
}

// Header and parameter names are matched without regard to case, as HTTP treats them.
const sameName = (a: string, b: string) => a.toLowerCase() == b.toLowerCase();

// Variable and secret names are matched exactly: substitution looks them up by === (see
// substitution.ts lookup()), so 'host' and 'HOST' really are two different variables.
const exactName = (a: string, b: string) => a == b;

// Replaces the entry whose name field matches `name`, or appends it when there is none.
// Keeps the existing entry's id so the row keeps its identity in the app's editor.
// Returns false when the entry is already exactly what was asked for, which is the caller's
// cue to report no change and leave the file alone.
// `equals` is the name matcher: each call site declares the semantics of its own table, so
// matching here always agrees with how the resolver looks that table up.
function upsertNamed<T extends { value: string; active: boolean; id: string }>(
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

function removeWhere<T>(list: T[], match: (entry: T) => boolean): boolean {
    const index = list.findIndex(match);
    if (index < 0)
        return false;

    list.splice(index, 1);
    return true;
}

// Sets (or adds) a header at any level of the hierarchy. `settings.headers` is the headers array
// of whichever of the five documents the locator named.
export async function setHeader(
    ctx: AuthoringContext, scope: string, name: string, value: string, enabled: boolean = true
): Promise<EditResult> {
    return editScope(ctx, 'set_header', scope, SETTING_LOCATORS['header'], target => {
        const entry: HeaderTable = { key: name, value, active: enabled, id: ctx.guid.generateGUID() };
        if (!upsertNamed(target.settings.headers, 'key', name, entry, sameName))
            return '';

        return `Set header '${name}' on ${scope}`;
    });
}

// Sets (or adds) a query parameter. Only requests and runs have parameters.
export async function setParam(
    ctx: AuthoringContext, scope: string, name: string, value: string, enabled: boolean = true
): Promise<EditResult> {
    return editScope(ctx, 'set_param', scope, SETTING_LOCATORS['param'], target => {
        const entry: ParamTable = { key: name, value, active: enabled, id: ctx.guid.generateGUID() };
        if (!upsertNamed(requestSettings(target).parameters, 'key', name, entry, sameName))
            return '';

        return `Set parameter '${name}' on ${scope}`;
    });
}

// A request has no variables or secrets of its own, so both verbs below refuse request: and say
// where the setting can go instead rather than leaving the caller to guess.
const NO_REQUEST_VARIABLE_HINT =
    'a request has no variables of its own — put it on one of its runs or on the folder';
const NO_REQUEST_SECRET_HINT =
    'a request has no secrets of its own — put it on one of its runs or on the folder';

// Sets (or adds) a variable. Matched case-sensitively, because {{name}} substitution is.
export async function setVariable(
    ctx: AuthoringContext, scope: string, name: string, value: string
): Promise<EditResult> {
    return editScope(ctx, 'set_variable', scope, SETTING_LOCATORS['variable'], target => {
        const entry: VariableTable = { variable: name, value, active: true, id: ctx.guid.generateGUID() };
        if (!upsertNamed(scopeSettings(target).variables, 'variable', name, entry, exactName))
            return '';

        return `Set variable '${name}' on ${scope}`;
    }, NO_REQUEST_VARIABLE_HINT);
}

// Adds a reference to a secret, never its value: the document gets { $secret } with no $value, so
// storeSecrets has nothing to move and the keychain is never written. That is what lets this verb
// be served over MCP — an agent can wire a secret up by name without ever being able to read it.
// Idempotent: a reference of that name is left exactly as it is, including its active flag.
export async function addSecretRef(ctx: AuthoringContext, scope: string, name: string): Promise<EditResult> {
    return editScope(ctx, 'add_secret_ref', scope, SETTING_LOCATORS['secret'], target => {
        const secrets = scopeSettings(target).secrets;
        if (secrets.some(s => exactName(s.$secret, name)))
            return '';

        // $value is deliberately absent; SecretTable declares it because loadSecrets fills it in
        // on the way out of the file, not because a document on disk has to carry it.
        secrets.push({ $secret: name, active: true, id: ctx.guid.generateGUID() } as SecretTable);
        return `Added secret reference '${name}' on ${scope}`;
    }, NO_REQUEST_SECRET_HINT);
}

// The authentication types the app's editor offers and applyAuthentication() understands. Stored
// lower-case (see settings-manage-authentication.component.html and auth.ts); `type` is matched
// without regard to case, so a caller may also write them the way the sub-objects of
// AuthenticationDetails are named ('basicAuth', 'bearerToken', 'awsSig').
const AUTH_TYPES = ['inherit', 'none', 'basicauth', 'bearertoken', 'awssig'];

// The fields of each authentication type. The three secret-bearing ones are reference-only: they
// take a single `{{$name}}` and nothing else, so no credential value can pass through this verb —
// see setAuth and requireSecretRef.
export interface AuthFields {
    userName?: string;                        // basicauth
    password?: string;                        // basicauth — secret reference only
    token?: string;                           // bearertoken
    accessKey?: string;                       // awssig (the key id, not the secret)
    secretKey?: string;                       // awssig — secret reference only
    sessionToken?: string;                    // awssig — secret reference only
    awsRegion?: string;
    serviceName?: string;
    signUrl?: boolean;
}

// One secret reference and nothing else. `[0-9a-zA-Z]` is the name substitution.ts actually
// resolves (its PLACEHOLDER regex), so a name this refuses would have been written to the file but
// never substituted at send time. Anchored rather than reusing isRawCredential, which is also
// false for '' and for two references run together — neither of which is a credential a single
// field can hold.
const SECRET_REF_ONLY = /^\{\{\$[0-9a-zA-Z]+\}\}$/;

// Guards a reference-only field. Refusing a literal here is what keeps setAuth unable to carry a
// credential value, now that these three fields are writable at all.
function requireSecretRef(field: string, value: string): string {
    if (!SECRET_REF_ONLY.test(value))
        throw new QueryError(`${field} takes a secret reference like {{$name}}, not a value`);
    return value;
}

// Auth sits on a different property depending on the document: ScopeSettings — a collection
// environment, or a folder's folder.frfolder — calls it `auth`, while RestAction and RestActionRun
// both call it `authentication` (model.ts). Read the target's `document` rather than guessing.
function readAuth(target: ScopeTarget): AuthenticationDetails {
    const auth = target.document == 'request' ? target.settings.authentication : target.settings.auth;
    return normaliseAuthentication(auth, 'inherit');
}

function writeAuth(target: ScopeTarget, auth: AuthenticationDetails): void {
    if (target.document == 'request')
        target.settings.authentication = auth;
    else
        target.settings.auth = auth;
}

// Applies the given fields into the sub-object of the chosen type only. A field belonging to one
// of the other types is ignored rather than refused, so a caller switching type can pass the same
// field bag each time; the blocks of the other types are left exactly as the document had them.
// `inherit` and `none` take no fields at all.
function applyAuthFields(auth: AuthenticationDetails, type: string, fields: AuthFields): void {
    switch (type) {
        case 'basicauth':
            if (fields.userName != undefined)
                auth.basicAuth.userName = fields.userName;
            if (fields.password != undefined)
                auth.basicAuth.password = requireSecretRef('password', fields.password);
            return;
        case 'bearertoken':
            if (fields.token != undefined)
                auth.bearerToken.token = fields.token;
            return;
        case 'awssig':
            if (fields.accessKey != undefined)
                auth.awsSig.accessKey = fields.accessKey;
            if (fields.secretKey != undefined)
                auth.awsSig.secretKey = requireSecretRef('secretKey', fields.secretKey);
            if (fields.sessionToken != undefined)
                auth.awsSig.sessionToken = requireSecretRef('sessionToken', fields.sessionToken);
            if (fields.awsRegion != undefined)
                auth.awsSig.awsRegion = fields.awsRegion;
            if (fields.serviceName != undefined)
                auth.awsSig.serviceName = fields.serviceName;
            if (fields.signUrl != undefined)
                auth.awsSig.signUrl = fields.signUrl;
            return;
    }
}

// Sets the authentication of any level of the hierarchy. Starts from what is already there, so
// switching type keeps the blocks of the other types as they were, which is what the app's editor
// does; fields that belong to a type other than the one asked for are ignored, not refused.
//
// Secrets are references, never values. A secret-backed credential is stored as the text
// `{{$name}}` in the field itself — substitution.ts resolves `{{$name}}` against the scope's
// `secrets` array at send time — and the named entry is put there by addSecretRef, which writes
// `{ $secret: name }` with no `$value`. So the complete, agent-safe way to wire up a password,
// an AWS secret key or a session token is: addSecretRef(scope, name) to declare it, pass
// `{{$name}}` here as the field, then have a person set the value with the CLI's `secret set`.
//
// Those three fields — password, secretKey, sessionToken — are reference-only: requireSecretRef
// refuses anything but a single `{{$name}}`, so this verb still cannot carry a secret value and
// storeSecrets() finds nothing to move into the keychain on the way out. The guarantee holds by
// construction rather than by leaving the fields out, which is what let an agent configure
// bearertoken fully while basicauth and awssig needed a person to finish them in the app.
// `name` must be `[0-9a-zA-Z]` only — that is all the substitution regex (substitution.ts)
// matches inside `{{...}}`, so anything else is written but never resolves.
// (`{{$secret:name}}` is only the display form inspect.ts and redact.ts print; it is not what a
// document holds and would not substitute.)
export async function setAuth(
    ctx: AuthoringContext, scope: string, type: string, fields: AuthFields = {}
): Promise<EditResult> {
    if (typeof type != 'string')
        throw new QueryError(`Unknown authentication type '${type}' (have ${AUTH_TYPES.join(', ')})`);
    const authentication = AUTH_TYPES.find(t => t == type.toLowerCase());
    if (authentication == undefined)
        throw new QueryError(`Unknown authentication type '${type}' (have ${AUTH_TYPES.join(', ')})`);

    return editScope(ctx, 'set_auth', scope, ALL_LOCATORS, target => {
        const before = readAuth(target);
        const auth = JSON.parse(JSON.stringify(before)) as AuthenticationDetails;

        auth.authentication = authentication;
        applyAuthFields(auth, authentication, fields);

        // Both sides come out of the same normalise + copy path, so their keys are in the same
        // order and comparing the JSON is a deep equality check.
        if (JSON.stringify(auth) == JSON.stringify(before))
            return '';

        writeAuth(target, auth);
        return `Set auth '${authentication}' on ${scope}`;
    });
}

// Removes one setting of the given kind. An absent name is not an error: it reports no change,
// so an agent cleaning up can call this without first checking what is there.
export async function removeSetting(
    ctx: AuthoringContext, scope: string, kind: SettingKind, name: string
): Promise<EditResult> {
    const result = await editScope(ctx, 'remove_setting', scope, SETTING_LOCATORS[kind], target => {
        if (!removeNamedSetting(target, kind, name))
            return '';

        return `Removed ${kind} '${name}' from ${scope}`;
    });

    if (result.changed)
        return result;

    return { ...result, message: `No ${kind} '${name}' on ${scope}: nothing to remove` };
}

// Each kind of setting lives in its own array, on its own part of the target document.
function removeNamedSetting(target: ScopeTarget, kind: SettingKind, name: string): boolean {
    switch (kind) {
        case 'header':
            return removeWhere(target.settings.headers, h => sameName(h.key, name));
        case 'param':
            return removeWhere(requestSettings(target).parameters, p => sameName(p.key, name));
        case 'validation-header':
            return removeWhere(requestSettings(target).validation.headers, h => sameName(h.key, name));
        case 'variable':
            return removeWhere(scopeSettings(target).variables, v => v.variable == name);
        case 'secret':
            return removeWhere(scopeSettings(target).secrets, s => s.$secret == name);
    }
}

// Adds a run to the request at `request` (a collection-relative .frreq path). The run inherits
// the request's validation until something sets its own, matching what the app does when you
// add a run from the editor.
export async function newRun(ctx: AuthoringContext, request: string, name: string): Promise<EditResult> {
    if (name == '')
        throw new QueryError(`new_run needs a name (given '${name}')`);

    return editScope(ctx, 'new_run', `request:${request}`, ['request'], target => {
        if (target.document != 'request')
            throw new Error('wrong target');

        const existing = target.action.runs.find(r => r.name == name);
        if (existing != undefined) {
            const names = target.action.runs.map(r => r.name).join(', ');
            throw new QueryError(`Run '${name}' already exists (have ${names})`);
        }

        const run: RestActionRun = CreateEmptyRestActionRun(ctx.guid, ValidationType.Inherit);
        run.name = name;
        target.action.runs.push(run);

        return `Added run '${name}'`;
    });
}

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
    return { file: newPath, scope, changed: true, message: `Renamed ${oldPath} to ${newPath}` };
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

    return { file: newPath, scope, changed: true, message: `Renamed ${oldPath} to ${newPath}` };
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

    const oldChain = inheritsFrom(root, dirnameOf(oldPath));
    const newChain = inheritsFrom(root, dirnameOf(newPath));
    const inheritance = oldChain == newChain ? '' : `; it now inherits from ${newChain} instead of ${oldChain}`;

    return { file: newPath, scope, changed: true, message: `Moved ${oldPath} to ${newPath}${inheritance}` };
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

    return { file: newPath, scope, changed: true, message: `Moved ${oldPath} to ${newPath}` };
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

    await ctx.sink.remove(resolved.file);
    return { file: resolved.file, scope, changed: true, message: `Deleted ${resolved.file}` };
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

    await ctx.sink.remove(path);
    return { file: path, scope, changed: true, message: `Deleted ${path}` };
}

// --- request field verbs ------------------------------------------------------------------------

// These three verbs take request: only. A run overrides a request's variables, secrets, headers,
// parameters, auth and validation (see RestActionRun in model.ts) — it has no url, method or body
// of its own — so each verb says exactly that rather than leaving the caller to guess where the
// field it asked for actually lives.
const runOverrideHint = (field: string): string =>
    `a run overrides variables, secrets, headers, parameters, auth and validation, not the ${field}`;

// Sets the url of a request. Stored verbatim (it may hold `{{var}}` placeholders); a leading
// http:// or https:// is split off into protocol instead, matching newRequest (see splitScheme).
// A scheme-less url keeps whatever protocol the request already had.
export async function setUrl(ctx: AuthoringContext, scope: string, url: string): Promise<EditResult> {
    return editScope(ctx, 'set_url', scope, ['request'], target => {
        const action = requestAction(target);
        const split = splitScheme(url);

        const protocolChanged = split.protocol != undefined && action.protocol != split.protocol;
        if (action.url == split.url && !protocolChanged)
            return '';

        if (split.protocol != undefined)
            action.protocol = split.protocol;
        action.url = split.url;
        return `Set url '${split.url}' on ${scope}`;
    }, runOverrideHint('url'));
}

// Sets the method of a request. Matched case-insensitively against RestTypeVerb, same as
// newRequest, and rejected the same way when it does not match one of the six values.
export async function setMethod(ctx: AuthoringContext, scope: string, method: string): Promise<EditResult> {
    return editScope(ctx, 'set_method', scope, ['request'], target => {
        const action = requestAction(target);

        const verbs = Object.values(RestTypeVerb);
        const verb = verbs.find(v => v.toLowerCase() == method.toLowerCase());
        if (verb == undefined)
            throw new QueryError(`Unknown method '${method}' (have ${verbs.join(', ')})`);

        if (action.verb == verb)
            return '';

        action.verb = verb;
        return `Set method '${verb}' on ${scope}`;
    }, runOverrideHint('method'));
}

// Sets the body of a request. 'none' clears it and ignores any content given; the form content
// type (FORM_CONTENT_TYPE) takes content.fields and stores them as FormField[], keeping the id of
// any field whose name matches one already there (same idea as upsertNamed, but over the whole
// table at once since a body replaces its fields wholesale rather than upserting one at a time);
// every other content type takes content.text and stores it verbatim. Giving fields to a type that
// takes text, or text to the form type, is a QueryError naming what that content type actually wants.
export async function setBody(
    ctx: AuthoringContext, scope: string, contentType: string, content?: { text?: string; fields?: { name: string; value: string }[] }
): Promise<EditResult> {
    if (typeof contentType != 'string' || contentType == '')
        throw new QueryError('set_body needs a content type');

    return editScope(ctx, 'set_body', scope, ['request'], target => {
        const action = requestAction(target);

        if (contentType == 'none') {
            if (action.body.contentType == 'none')
                return '';
            action.body = CreateEmptyActionBody();
            return `Cleared the body on ${scope}`;
        }

        if (contentType == FORM_CONTENT_TYPE) {
            if (content?.text != undefined)
                throw new QueryError(`Content type '${contentType}' takes fields, not text`);

            const existing = Array.isArray(action.body.body) ? action.body.body as FormField[] : [];
            const fields: FormField[] = (content?.fields ?? []).map(field => {
                const match = existing.find(e => e.key == field.name);
                return { key: field.name, value: field.value, active: true, id: match?.id ?? ctx.guid.generateGUID() };
            });

            if (action.body.contentType == contentType && JSON.stringify(existing) == JSON.stringify(fields))
                return '';

            action.body = { contentType, body: fields };
            return `Set form body on ${scope}`;
        }

        if (content?.fields != undefined)
            throw new QueryError(`Content type '${contentType}' takes text, not fields`);

        const text = content?.text ?? '';
        if (action.body.contentType == contentType && action.body.body == text)
            return '';

        action.body = { contentType, body: text };
        return `Set body on ${scope}`;
    }, runOverrideHint('body'));
}

// --- validation verbs ---------------------------------------------------------------------------

// Both locators a request's validation can be edited through: a request: or run: locator, never
// the other three — validation lives on RestAction and RestActionRun alone.
const VALIDATION_LOCATORS: LocatorKind[] = ['request', 'run'];

// The fields of a validation a caller may touch. Each is optional so a single call can set only
// what it means to change — see setValidation.
export interface ValidationFields {
    type?: string;         // a ValidationType value, case-insensitive
    httpCode?: number;
    body?: string;         // a ValidationTypeBody value, case-insensitive
    jsonSchema?: string;   // the schema as a string, as RestActionValidationJsonSchema stores it
}

// Matches `given` against one of an enum's values without regard to case; an unknown value is a
// QueryError listing the ones it does take, the same shape as setAuth's and setMethod's rejections.
function matchEnumValue<T extends string>(values: T[], given: string, label: string): T {
    const match = values.find(value => value.toLowerCase() == given.toLowerCase());
    if (match == undefined)
        throw new QueryError(`Unknown validation ${label} '${given}' (have ${values.join(', ')})`);
    return match;
}

// Parses and compiles a schema up front, before editScope touches any file, so a bad schema never
// gets as far as a half-written document. Reuses validate.ts's Ajv setup (compileSchema) rather
// than building a second one; an uncompilable schema would otherwise make every run of the request
// fail with a confusing error at send time instead of a clear one now, at the point it was set.
function parseJsonSchema(text: string): RestActionValidationJsonSchema {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch (error) {
        throw new QueryError(`jsonSchema is not valid JSON: ${(error as Error).message}`);
    }

    try {
        compileSchema(parsed as object);
    } catch (error) {
        throw new QueryError(`jsonSchema does not compile: ${(error as Error).message}`);
    }

    return { schema: text };
}

// Sets the validation of a request or run. Starts from what is already there — already
// normalised, since scopeTarget runs the whole document through normaliseAction/normaliseRun
// before apply() is called — and applies only the fields given: setting httpCode alone leaves an
// existing schema untouched. type and body are matched
// case-insensitively against ValidationType and ValidationTypeBody; jsonSchema given with no body
// implies body: 'JsonSchema', and body: 'None' clears jsonSchema to undefined — both so an agent
// cannot leave a half-configured check (a schema nothing checks against, or a body check with no
// schema). All of fields.type/body/jsonSchema are validated before editScope runs, so a rejection
// never touches the file, matching setAuth and setMethod.
export async function setValidation(ctx: AuthoringContext, scope: string, fields: ValidationFields): Promise<EditResult> {
    const type = fields.type == undefined ? undefined : matchEnumValue(Object.values(ValidationType), fields.type, 'type');
    const body = fields.body == undefined ? undefined : matchEnumValue(Object.values(ValidationTypeBody), fields.body, 'body');
    const jsonSchema = fields.jsonSchema == undefined ? undefined : parseJsonSchema(fields.jsonSchema);

    return editScope(ctx, 'set_validation', scope, VALIDATION_LOCATORS, target => {
        const before = JSON.parse(JSON.stringify(requestSettings(target).validation));
        const validation = JSON.parse(JSON.stringify(before)) as RestActionValidation;

        if (type != undefined)
            validation.type = type;
        if (fields.httpCode != undefined)
            validation.httpCode = fields.httpCode;
        if (body != undefined)
            validation.body = body;
        if (jsonSchema != undefined) {
            validation.jsonSchema = jsonSchema;
            if (fields.body == undefined)
                validation.body = ValidationTypeBody.JsonSchema;
        }
        if (body == ValidationTypeBody.None)
            validation.jsonSchema = undefined;

        if (JSON.stringify(validation) == JSON.stringify(before))
            return '';

        requestSettings(target).validation = validation;
        return `Set validation on ${scope}`;
    });
}

// Sets (or adds) a header the response must have, on a request's or run's validation. Matched
// case-insensitively on the header name, like setHeader; removeSetting(…, 'validation-header', …)
// removes from the same validation.headers array this upserts into.
//
// `enabled` works exactly as setHeader's does — written unconditionally, so an omitted flag means
// true and re-enables a row that was off. A header check is a HeaderTable row like any other and
// validateHeaders skips an inactive one, so this is how an agent parks a check without deleting it.
export async function setValidationHeader(
    ctx: AuthoringContext, scope: string, name: string, value: string, enabled: boolean = true
): Promise<EditResult> {
    return editScope(ctx, 'set_validation_header', scope, SETTING_LOCATORS['validation-header'], target => {
        const entry: HeaderTable = { key: name, value, active: enabled, id: ctx.guid.generateGUID() };
        if (!upsertNamed(requestSettings(target).validation.headers, 'key', name, entry, sameName))
            return '';

        return `Set validation header '${name}' on ${scope}`;
    });
}

// Turns an inferred schema into the "...and ..." clause of validationFromCase's success message.
function describeSchema(schema: Record<string, unknown>): string {
    if (schema['type'] === 'object') {
        const count = Object.keys((schema['properties'] as object | undefined) ?? {}).length;
        return `a JSON body of ${count} propert${count === 1 ? 'y' : 'ies'}`;
    }
    if (schema['type'] === 'array')
        return 'a JSON array body';
    return `a JSON body of type ${schema['type']}`;
}

const SET_VALIDATION_HINT = 'use set_validation to set it by hand instead';

// Learns a validation from one recorded case of a run: the HTTP status it got back, plus a JSON
// Schema inferred (inferSchema, infer.ts) from its response body. This is the only authoring verb
// that reads the run store - `stores` is supplied by the host, exactly as the query functions
// (resolveRun, findCase, both reused unchanged from query.ts) already take it, so core still owns
// no storage.
//
// `type` depends on whether the TARGET already has validation headers of its own (HeadersBody) or
// not (Body) - read here via resolveTarget (the same read editScope does for every other verb)
// rather than from the recorded case, since setValidation's ValidationFields has no "whatever the
// headers already imply" option. The actual write goes through setValidation so its Ajv compile
// check still runs over the inferred schema; this function only decides what fields to give it.
export async function validationFromCase(
    ctx: AuthoringContext, stores: RunStore[], scope: string, caseRef: string | number, runId?: string
): Promise<EditResult> {
    const { target } = await resolveTarget(ctx, 'validation_from_case', scope, VALIDATION_LOCATORS);
    const hasOwnHeaders = requestSettings(target).validation.headers.length > 0;

    const run = await resolveRun(stores, runId);
    const c = findCase(run, caseRef);

    if (c.outcome === 'error')
        throw new QueryError(`case ${c.index} errored (no response to learn from): ${c.error}; ${SET_VALIDATION_HINT}.`);
    if (!c.response)
        throw new QueryError(`case ${c.index} got no response to learn from; ${SET_VALIDATION_HINT}.`);

    const body = c.response.body;
    const contentType = body?.contentType ?? 'none';
    let parsed: unknown;
    try {
        if (body?.text === undefined)
            throw new Error('no text');
        parsed = JSON.parse(body.text);
    } catch {
        throw new QueryError(`case ${c.index}'s response body is not JSON (content-type ${contentType}); ${SET_VALIDATION_HINT}.`);
    }

    const schema = inferSchema(parsed) as Record<string, unknown>;
    const type = hasOwnHeaders ? ValidationType.HeadersBody : ValidationType.Body;

    const result = await setValidation(ctx, scope, {
        type,
        httpCode: c.response.status,
        body: ValidationTypeBody.JsonSchema,
        jsonSchema: JSON.stringify(schema, null, 2)
    });

    // setValidation (via editScope) reports changed: false, with its own "already in the
    // asked-for state" message, when the inferred validation matches what is already there.
    // Keep that pairing intact rather than overwriting it with the "learned" message below,
    // which would otherwise claim something changed when it did not.
    if (!result.changed)
        return result;

    const message =
        `Set validation on ${scope} from run ${run.runId} case ${c.index}: expect ${c.response.status} and ${describeSchema(schema)}`;
    return { ...result, message };
}
