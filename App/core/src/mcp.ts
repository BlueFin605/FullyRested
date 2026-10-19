import { CreateEmptyMcpCall, McpCall, McpExpect, McpOutcome, ResponseValidation } from './model';
import { ExecuteMcp, IExecuteRestAction, RestActionResult } from './builder';
import { bodyToString } from './content-type';

// An MCP request (type 'mcp') is one JSON-RPC call over MCP streamable HTTP: a POST of the
// envelope to the request's url. Everything else -- variables, secrets, auth, headers, runs,
// capture, HTTP validation -- is the http request's.

export const MCP_OUTCOMES: McpOutcome[] = ['result', 'tool-error', 'rpc-error', 'any'];
export const MCP_ACCEPT = 'application/json, text/event-stream';
export const MCP_PROTOCOL_VERSION = '2025-06-18';
// The id every call is sent with; the handshake's initialize uses 0
export const MCP_CALL_ID = 1;

const isNotification = (method: string) => method.startsWith('notifications/');

export function normaliseMcpCall(call: Partial<McpCall> | undefined): McpCall {
    const empty = CreateEmptyMcpCall();
    const defined = Object.fromEntries(Object.entries(call ?? {}).filter(([, v]) => v !== undefined)) as Partial<McpCall>;
    return { ...empty, ...defined, expect: { ...empty.expect, ...(defined.expect ?? {}) } };
}

function defaultParams(method: string): string {
    return method == 'initialize'
        ? JSON.stringify({ protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'FullyRested', version: '1' } })
        : '';
}

// The JSON-RPC text for one call. params is JSON text (it may still hold {{variables}}, which are
// substituted later like any body), so it is spliced in rather than parsed. A notification has no id.
export function mcpEnvelope(method: string, params: string, id: number = MCP_CALL_ID): string {
    const text = params.trim() == '' ? defaultParams(method) : params.trim();
    const idPart = isNotification(method) ? '' : `"id":${id},`;
    return `{"jsonrpc":"2.0",${idPart}"method":${JSON.stringify(method)}${text == '' ? '' : `,"params":${text}`}}`;
}

// A tools/call's tool name, read from its params ({{variables}} read as 0); undefined otherwise
export function mcpToolName(call: McpCall): string | undefined {
    if (call.method != 'tools/call') return undefined;
    try {
        const name = JSON.parse(call.params.replace(/\{\{[^{}]*\}\}/g, '0'))?.name;
        return typeof name == 'string' ? name : undefined;
    } catch { return undefined; }
}

export function toExecuteMcp(call: McpCall): ExecuteMcp {
    return { method: call.method, handshake: call.handshake, expect: { ...call.expect } };
}

function headerValue(headers: { [h: string]: string } | undefined, name: string): string | undefined {
    const key = Object.keys(headers ?? {}).find(k => k.toLowerCase() == name);
    return key == undefined ? undefined : headers![key];
}

type JsonRpcMessage = { id?: unknown; result?: any; error?: { code?: unknown; message?: unknown; data?: unknown } };

function isReply(m: unknown): m is JsonRpcMessage {
    return typeof m == 'object' && m != null && !Array.isArray(m) && ('result' in m || 'error' in m);
}

// The JSON-RPC messages in an SSE stream body: each event's data lines joined
function sseMessages(text: string): unknown[] {
    const messages: unknown[] = [];
    for (const event of text.split(/\r?\n\r?\n/)) {
        const data = event.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).replace(/^ /, ''));
        if (data.length == 0) continue;
        try { messages.push(JSON.parse(data.join('\n'))); } catch { /* not JSON: skipped */ }
    }
    return messages;
}

// The reply to our call out of a parsed body: the message itself, or the one with our id in a batch
function pickReply(messages: unknown[], id: number): JsonRpcMessage | undefined {
    const flat = messages.flatMap(m => Array.isArray(m) ? m : [m]).filter(isReply);
    return flat.find(m => m.id === id) ?? flat[0];
}

// A server may answer with an SSE stream instead of JSON. The reply it carries is put in its place,
// as application/json, so the response view, validation, capture and run records all see one
// JSON-RPC message. Any other response is returned as it is.
export function normaliseMcpResponse(result: RestActionResult, id: number = MCP_CALL_ID): RestActionResult {
    const contentType = result.body?.contentType ?? '';
    if (!/text\/event-stream/i.test(contentType) || result.body == undefined)
        return result;
    const reply = pickReply(sseMessages(bodyToString(contentType, result.body.body)), id);
    if (reply == undefined)
        return result;
    const bytes = new TextEncoder().encode(JSON.stringify(reply));
    return { ...result, body: { contentType: 'application/json', body: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer } };
}

type Http = (action: IExecuteRestAction, options: { signal?: AbortSignal }) => Promise<RestActionResult>;

const ok = (r: RestActionResult) => typeof r.status == 'number' && r.status >= 200 && r.status < 300;

// Sends an MCP request. With handshake (and a method other than initialize) it first sends
// initialize and notifications/initialized, then the call with the Mcp-Session-Id (and
// MCP-Protocol-Version) the server gave. A failed initialize is returned as the result, its
// statusText saying so.
export async function executeMcp(action: IExecuteRestAction, options: { signal?: AbortSignal }, http: Http): Promise<RestActionResult> {
    const mcp = action.mcp!;
    const headers = { ...action.headers };
    if (mcp.handshake && mcp.method != 'initialize') {
        const init = normaliseMcpResponse(await http({ ...action, body: { contentType: 'application/json', body: mcpEnvelope('initialize', '', 0) } }, options), 0);
        if (!ok(init))
            return { ...init, statusText: `MCP initialize failed: ${init.status} ${init.statusText ?? ''}`.trim() };
        const session = headerValue(init.headers, 'mcp-session-id');
        if (session != undefined) headers['Mcp-Session-Id'] = session;
        const version = mcpReply(init, 0)?.result?.protocolVersion;
        if (typeof version == 'string') headers['MCP-Protocol-Version'] = version;
        await http({ ...action, headers, body: { contentType: 'application/json', body: mcpEnvelope('notifications/initialized', '') } }, options);
    }
    return normaliseMcpResponse(await http({ ...action, headers }, options));
}

function mcpReply(response: RestActionResult, id: number = MCP_CALL_ID): JsonRpcMessage | undefined {
    const text = bodyToString(response.body?.contentType, response.body?.body);
    try { return pickReply([JSON.parse(text)], id); } catch { return undefined; }
}

// The text of a tool result: every text content item, one per line; any other result as JSON
export function mcpResultText(result: unknown): string {
    const content = (result as { content?: unknown })?.content;
    if (Array.isArray(content))
        return content.filter(c => typeof c?.text == 'string').map(c => c.text as string).join('\n');
    return JSON.stringify(result ?? null);
}

const checked = (errors: string[]): ResponseValidation => ({ information: [], errors, valid: errors.length == 0 });

// The MCP check: the reply is what expect.outcome says, and its text holds expect.text.
// expect has had its variables substituted. A notification gets no reply, so nothing is checked.
export function validateMcp(method: string, expect: McpExpect, response: RestActionResult): ResponseValidation {
    if (isNotification(method))
        return checked([]);
    const reply = mcpReply(response);
    if (reply == undefined)
        return checked(['Response is not a JSON-RPC reply']);

    const error = reply.error;
    const errorText = error ? `JSON-RPC error ${String(error.code)}: ${String(error.message)}` : '';
    const errors: string[] = [];
    if (expect.outcome == 'result') {
        if (error) errors.push(errorText);
        else if (reply.result?.isError === true) errors.push(`Tool reported an error: ${mcpResultText(reply.result)}`);
    } else if (expect.outcome == 'tool-error') {
        if (error) errors.push(`Expected a tool error (isError), got ${errorText}`);
        else if (reply.result?.isError !== true) errors.push('Expected the tool to report isError, but it succeeded');
    } else if (expect.outcome == 'rpc-error') {
        if (!error) errors.push('Expected a JSON-RPC error, got a result');
        else if (expect.code != undefined && error.code !== expect.code) errors.push(`${errorText}; expected code ${expect.code}`);
    }

    if (errors.length == 0 && expect.text != undefined && expect.text != '') {
        const haystack = error ? `${String(error.message)}${error.data == undefined ? '' : ' ' + JSON.stringify(error.data)}` : mcpResultText(reply.result);
        if (!haystack.includes(expect.text))
            errors.push(`${error ? 'Error message' : 'Result text'} does not contain '${expect.text}'`);
    }
    return checked(errors);
}
