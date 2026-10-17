import { ExpectExtras, ExpectMatch, RequestType, RestAction, WebSocketExpect } from '../model';
import { normaliseExpect } from '../normalise';
import { QueryError } from '../query-error';
import { validateTimeoutMs } from '../websocket/timeout';
import { AuthoringContext, EditResult, editScope, requestAction } from './edit-scope';
import { parseJsonSchema } from './validation';

// --- websocket verbs ----------------------------------------------------------------------------

// Websocket fields live on the request alone; a run overrides variables, secrets, headers,
// parameters, auth and validation, not these.
const runOverrideHint = (field: string): string =>
    `a run overrides variables, secrets, headers, parameters, auth and validation, not the ${field}`;

const REQUEST_TYPES: RequestType[] = ['http', 'websocket'];
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
        throw new QueryError(`${verb} applies to a websocket request; this one is http (use set_type websocket first)`);
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
    return true;
}

// Sets whether a request is plain HTTP or a websocket. Switching to websocket fills the websocket
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
