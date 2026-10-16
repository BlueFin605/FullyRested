import {
    AuthenticationDetails, Environment, FolderConfig, HeaderTable, ParamTable, RestAction, RestActionRun, SecretTable, VariableTable
} from '../model';
import { normaliseAuthentication } from '../normalise';
import { QueryError } from '../query-error';
import { storeSecrets } from '../secrets';
import {
    AuthoringContext, EditResult, ScopeTarget, editScope, SettingKind, SETTING_LOCATORS, ALL_LOCATORS, requestSettings, sameName, upsertNamed
} from './edit-scope';

// --- settings verbs ----------------------------------------------------------------------------


function scopeSettings(target: ScopeTarget): Environment | FolderConfig | RestActionRun {
    if (target.document != 'request')
        return target.settings;
    if (!('run' in target))
        throw new Error('wrong target');
    return target.run;
}

// Variable and secret names are matched exactly: substitution looks them up by === (see
// substitution.ts lookup()), so 'host' and 'HOST' really are two different variables.
const exactName = (a: string, b: string) => a == b;

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
    // Where the token goes on a websocket handshake: 'header' or the name of a query parameter
    // (BlueFinWiki's realtime endpoint reads ?token=). Applies to any type.
    placement?: string;
}

// A query parameter name: what can go in a url without needing to be escaped.
const PLACEMENT_PARAM = /^[0-9a-zA-Z_.~-]+$/;

function parsePlacement(placement: string): string {
    if (typeof placement != 'string' || !PLACEMENT_PARAM.test(placement))
        throw new QueryError(`placement must be 'header' or a query parameter name like 'token', not '${placement}'`);
    return placement.toLowerCase() == 'header' ? 'header' : placement;
}

// One secret reference and nothing else. `[0-9a-zA-Z_-]` is the name substitution.ts actually
// resolves (its PLACEHOLDER regex), so a name this refuses would have been written to the file but
// never substituted at send time. Anchored rather than reusing isRawCredential, which is also
// false for '' and for two references run together — neither of which is a credential a single
// field can hold.
const SECRET_REF_ONLY = /^\{\{\$[0-9a-zA-Z_-]+\}\}$/;

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
// `name` must be `[0-9a-zA-Z_-]` only — that is all the substitution regex (substitution.ts)
// matches inside `{{...}}`, so anything else is written but never resolves. A collection holding
// such a name reports it as a warning when it loads (tree.ts warnUnsubstitutableNames).
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

    const placement = fields.placement == undefined ? undefined : parsePlacement(fields.placement);

    return editScope(ctx, 'set_auth', scope, ALL_LOCATORS, target => {
        const before = readAuth(target);
        const auth = JSON.parse(JSON.stringify(before)) as AuthenticationDetails;

        auth.authentication = authentication;
        applyAuthFields(auth, authentication, fields);
        if (placement != undefined)
            auth.placement = placement;

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
