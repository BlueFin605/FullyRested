import { parseLocator } from '../locator';
import { ExpectExtras, ExpectMatch, RequestType, RestAction, TriggerRepeat, WebSocketExpect } from '../model';
import { normaliseExpect, normaliseTrigger } from '../normalise';
import { normaliseMcpCall } from '../mcp';
import { QueryError } from '../query-error';
import { RequestNode } from '../scope';
import { loadCollectionTree } from '../tree';
import { validateTimeoutMs } from '../websocket/timeout';
import { AuthoringContext, EditResult, editScope, requestAction } from './edit-scope';
import { parseJsonSchema } from './validation';

// --- websocket verbs ----------------------------------------------------------------------------

// Websocket fields live on the request alone; a run overrides variables, secrets, headers,
// parameters, auth and validation, not these.
const runOverrideHint = (field: string): string =>
    `a run overrides variables, secrets, headers, parameters, auth and validation, not the ${field}`;

const REQUEST_TYPES: RequestType[] = ['http', 'websocket', 'mcp'];
const MATCHES: ExpectMatch[] = ['all', 'any'];
const EXTRAS: ExpectExtras[] = ['ignore', 'fail'];

function matchValue<T extends string>(values: T[], given: string, label: string): T {
    const match = typeof given == 'string' ? values.find(v => v == given.toLowerCase()) : undefined;
    if (match == undefined)
        throw new QueryError(`Unknown ${label} '${given}' (have ${values.join(', ')})`);
    return match;
}

function requireWebsocket(action: RestAction, verb: string): void {
    if (action.type != 'websocket')
        throw new QueryError(`${verb} applies to a websocket request; this one is ${action.type ?? 'http'} (use set_type websocket first)`);
}

function requireInt(field: string, value: number, min: number): number {
    if (!Number.isInteger(value) || value < min)
        throw new QueryError(`${field} must be a whole number of at least ${min}, not '${value}'`);
    return value;
}

// The pure part of set_type, shared with the Electron request editor: changes the type, fills the
// websocket defaults when switching to websocket, and leaves message and expect alone when switching
// back. Returns false when the request already had that type.
export function applyRequestType(action: RestAction, wanted: RequestType): boolean {
    if ((action.type ?? 'http') == wanted)
        return false;

    action.type = wanted;
    if (wanted == 'websocket') {
        action.message = action.message ?? '';
        action.expect = normaliseExpect(action.expect);
    }
    if (wanted == 'mcp')
        action.mcp = normaliseMcpCall(action.mcp);
    return true;
}

// Sets whether a request is plain HTTP, a websocket or an MCP call. Switching to websocket fills the websocket
// defaults (normaliseAction runs after apply); switching back leaves message and expect in the
// file, so flipping the type is not destructive.
export async function setType(ctx: AuthoringContext, scope: string, type: string): Promise<EditResult> {
    const wanted = matchValue(REQUEST_TYPES, type, 'request type');

    return editScope(ctx, 'set_type', scope, ['request'], target => {
        if (!applyRequestType(requestAction(target), wanted))
            return '';

        return `Set type '${wanted}' on ${scope}`;
    }, runOverrideHint('type'));
}

// Sets the text frame a websocket request sends once the socket opens. Stored verbatim (it may
// hold {{variables}} and {{$secrets}}).
export async function setMessage(ctx: AuthoringContext, scope: string, message: string): Promise<EditResult> {
    if (typeof message != 'string')
        throw new QueryError('message must be text');

    return editScope(ctx, 'set_message', scope, ['request'], target => {
        const action = requestAction(target);
        requireWebsocket(action, 'set_message');
        if (action.message == message)
            return '';

        action.message = message;
        return `Set message on ${scope}`;
    }, runOverrideHint('message'));
}

// The fields of a websocket test's expectation. Each is optional so one call sets only what it
// means to change.
export interface ExpectFields {
    count?: number;
    match?: string;      // 'all' | 'any'
    schema?: string;     // JSON Schema text; '' clears it
    extras?: string;     // 'ignore' | 'fail'
    timeout?: number;    // ms
    settle?: number;     // ms
}

// Validates ExpectFields and applies them to a copy of `current`, returning the new expect. Pure and
// shared: set_expect writes the result to the file, and the Electron request editor writes it to the
// open request, so both produce the same shape and reject the same values. Throws QueryError.
export function applyExpectFields(current: Partial<WebSocketExpect> | undefined, fields: ExpectFields): WebSocketExpect {
    const count = fields.count == undefined ? undefined : requireInt('count', fields.count, 1);
    const match = fields.match == undefined ? undefined : matchValue(MATCHES, fields.match, 'match');
    const extras = fields.extras == undefined ? undefined : matchValue(EXTRAS, fields.extras, 'extras');
    const timeout = fields.timeout == undefined ? undefined : validateTimeoutMs(fields.timeout);
    const settle = fields.settle == undefined ? undefined : requireInt('settle', fields.settle, 0);
    const schema = fields.schema == undefined || fields.schema == '' ? undefined : parseJsonSchema(fields.schema);

    const expect = normaliseExpect(JSON.parse(JSON.stringify(normaliseExpect(current))));
    if (count != undefined)
        expect.count = count;
    if (match != undefined)
        expect.match = match;
    if (extras != undefined)
        expect.extras = extras;
    if (timeout != undefined)
        expect.timeout = timeout;
    if (settle != undefined)
        expect.settle = settle;
    if (fields.schema != undefined)
        expect.schema = schema;
    return expect;
}

// Sets what a websocket test waits for. Everything is validated before editScope runs, so a
// rejection (including a schema that is not JSON or does not compile) never touches a file.
export async function setExpect(ctx: AuthoringContext, scope: string, fields: ExpectFields): Promise<EditResult> {
    applyExpectFields(undefined, fields);

    return editScope(ctx, 'set_expect', scope, ['request'], target => {
        const action = requestAction(target);
        requireWebsocket(action, 'set_expect');

        const before = JSON.stringify(normaliseExpect(action.expect));
        const expect = applyExpectFields(action.expect, fields);

        if (JSON.stringify(expect) == before)
            return '';

        action.expect = expect;
        return `Set expect on ${scope}`;
    }, runOverrideHint('expect'));
}

// --- set_trigger --------------------------------------------------------------------------------

const REPEATS: TriggerRepeat[] = ['once', 'until-done'];

// The fields of a websocket request's trigger. Each is optional so one call changes only what it
// names; `clear` removes the trigger and takes nothing else.
export interface TriggerFields {
    request?: string;    // an http request in the same collection, e.g. 'pages/touch.frreq'
    run?: string;        // a run of that request; '' clears it
    repeat?: string;     // 'once' | 'until-done'
    interval?: number;   // ms, at least 100
    delay?: number;      // ms, at least 0
    clear?: boolean;
}

// Accepts 'pages/touch.frreq' or 'request:pages/touch.frreq' and returns the collection-relative path.
function triggerPath(request: string): string {
    if (typeof request != 'string' || request.trim() == '')
        throw new QueryError('request must name an http request in this collection, e.g. pages/touch.frreq');
    const text = request.trim();
    return parseLocator(/^request:/i.test(text) ? text : `request:${text}`).path!;
}

// Sets, changes or clears the trigger of a websocket request: an http request in the same collection
// that a run fires after the message is sent. Every value is checked before anything is written.
export async function setTrigger(ctx: AuthoringContext, scope: string, fields: TriggerFields): Promise<EditResult> {
    const clear = fields.clear == true;
    const given = [fields.request, fields.run, fields.repeat, fields.interval, fields.delay].some(v => v !== undefined);
    if (clear && given)
        throw new QueryError('clear removes the trigger and cannot be combined with request, run, repeat, interval or delay');
    if (!clear && !given)
        throw new QueryError('set_trigger needs at least one of request, run, repeat, interval, delay or clear');

    const repeat = fields.repeat == undefined ? undefined : matchValue(REPEATS, fields.repeat, 'repeat');
    const interval = fields.interval == undefined ? undefined : requireInt('interval', fields.interval, 100);
    const delay = fields.delay == undefined ? undefined : requireInt('delay', fields.delay, 0);
    const path = fields.request == undefined ? undefined : triggerPath(fields.request);
    if (fields.run !== undefined && typeof fields.run != 'string')
        throw new QueryError('run must be text');

    const root = await loadCollectionTree(ctx.collectionFile, ctx.source, ctx.secrets);

    return editScope(ctx, 'set_trigger', scope, ['request'], (target, resolved) => {
        const action = requestAction(target);
        requireWebsocket(action, 'set_trigger');

        if (clear) {
            if (action.trigger == undefined)
                return '';
            delete action.trigger;
            return `Cleared trigger on ${scope}`;
        }

        const current = action.trigger;
        const requestPath = path ?? current?.request;
        if (requestPath == undefined)
            throw new QueryError('a new trigger needs a request (an http request in this collection)');

        const node = root.find(requestPath);
        if (!(node instanceof RequestNode)) {
            const known = root.requestNodes().map(r => r.path).join(', ') || 'none';
            throw new QueryError(`Trigger request '${requestPath}' not found (known: ${known})`);
        }
        if (node.path == resolved.file)
            throw new QueryError(`Trigger request '${requestPath}' is the websocket request itself`);
        if ((node.action.type ?? 'http') != 'http')
            throw new QueryError(`Trigger request '${requestPath}' is a ${node.action.type} request; a trigger must be http`);

        // Pointing at a different request drops the old run unless a run is given with it.
        const run = fields.run !== undefined ? (fields.run == '' ? undefined : fields.run)
            : (path != undefined && path != current?.request ? undefined : current?.run);
        // Stored as given (a name or an id); the resolvers and the editor's picker accept either.
        if (run != undefined && !node.action.runs.some(r => r.id == run || r.name == run)) {
            const known = node.action.runs.map(r => r.name).join(', ') || 'none';
            throw new QueryError(`Run '${run}' not found in '${node.name}' (known: ${known})`);
        }

        const next = normaliseTrigger({
            ...current, request: requestPath, run,
            ...(repeat != undefined && { repeat }),
            ...(interval != undefined && { interval }),
            ...(delay != undefined && { delay })
        });
        if (next.run === undefined)
            delete next.run;
        if (JSON.stringify(next) == JSON.stringify(current))
            return '';

        action.trigger = next;
        return `Set trigger on ${scope}`;
    }, runOverrideHint('trigger'));
}
