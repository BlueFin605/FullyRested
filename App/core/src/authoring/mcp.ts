import { McpCall, McpExpect, McpOutcome, RestAction } from '../model';
import { MCP_OUTCOMES, mcpToolName, normaliseMcpCall } from '../mcp';
import { QueryError } from '../query-error';
import { AuthoringContext, EditResult, editScope, requestAction } from './edit-scope';

// --- MCP verbs ----------------------------------------------------------------------------------

// The call and its expect live on the request alone; a run varies an MCP call through its
// variables, secrets, headers, auth and HTTP validation.
const runOverrideHint = (field: string): string =>
    `a run overrides variables, secrets, headers, parameters, auth and validation, not the ${field}; give a request: locator`;

function requireMcp(action: RestAction, verb: string): void {
    if (action.type != 'mcp')
        throw new QueryError(`${verb} applies to an MCP request; this one is ${action.type ?? 'http'} (use set_type mcp first)`);
}

// Params are JSON text that may hold {{variables}}. Each {{...}} is read as 0 for this check only,
// so '{"id":"{{pageId}}"}' and '{"n":{{count}}}' both pass; the text is stored as given.
function checkParams(params: string, label: string): void {
    if (params.trim() == '')
        return;
    let parsed: unknown;
    try {
        parsed = JSON.parse(params.replace(/\{\{[^{}]*\}\}/g, '0'));
    } catch {
        throw new QueryError(`${label} must be JSON (an object or array), not '${params}'`);
    }
    if (typeof parsed != 'object' || parsed == null)
        throw new QueryError(`${label} must be a JSON object or array, not '${params}'`);
}

// The fields of an MCP call. Each is optional so one call changes only what it names. `tool`
// (with `arguments`) is the short way to write a tools/call: method tools/call and params
// {"name": tool, "arguments": arguments}.
export interface McpCallFields {
    method?: string;
    params?: string;     // JSON text; '' clears it
    tool?: string;
    arguments?: string;  // JSON object text for the tool's arguments; needs tool, or a tools/call already naming one
    handshake?: boolean;
}

// Everything about McpCallFields that does not depend on the request's current call
function checkMcpCallFields(fields: McpCallFields): void {
    const given = [fields.method, fields.params, fields.tool, fields.arguments, fields.handshake].some(v => v !== undefined);
    if (!given)
        throw new QueryError('set_mcp needs at least one of method, params, tool, arguments or handshake');
    if (fields.method !== undefined && (typeof fields.method != 'string' || !/^\S+$/.test(fields.method)))
        throw new QueryError(`method must be a JSON-RPC method name such as tools/list, not '${fields.method}'`);
    if (fields.tool !== undefined && fields.params !== undefined)
        throw new QueryError('give tool (with arguments) or params, not both');
    if (fields.tool !== undefined && fields.method !== undefined && fields.method != 'tools/call')
        throw new QueryError(`tool makes the method tools/call; it cannot be combined with method '${fields.method}'`);
    if (fields.tool !== undefined && (typeof fields.tool != 'string' || fields.tool.trim() == ''))
        throw new QueryError('tool must name the tool to call');
    if (fields.params !== undefined) checkParams(fields.params, 'params');
    if (fields.arguments !== undefined) {
        checkParams(fields.arguments, 'arguments');
        if (fields.arguments.trim().startsWith('['))
            throw new QueryError('arguments must be a JSON object');
    }
}

// Validates McpCallFields and applies them to a copy of `current`. Pure, so an editor can share it.
// Throws QueryError.
export function applyMcpCallFields(current: Partial<McpCall> | undefined, fields: McpCallFields): McpCall {
    checkMcpCallFields(fields);
    const call = normaliseMcpCall(JSON.parse(JSON.stringify(normaliseMcpCall(current))));
    if (fields.method !== undefined) call.method = fields.method;
    if (fields.params !== undefined) call.params = fields.params;
    if (fields.handshake !== undefined) call.handshake = fields.handshake;
    if (fields.tool !== undefined || fields.arguments !== undefined) {
        const tool = fields.tool ?? mcpToolName(call);
        if (tool == undefined)
            throw new QueryError('arguments needs tool (or a tools/call that already names its tool)');
        const args = fields.arguments === undefined || fields.arguments.trim() == '' ? '{}' : fields.arguments.trim();
        call.method = 'tools/call';
        call.params = `{"name":${JSON.stringify(tool)},"arguments":${args}}`;
    }
    return call;
}

// Sets the JSON-RPC call an MCP request sends. Everything is checked before a file is touched.
export async function setMcp(ctx: AuthoringContext, scope: string, fields: McpCallFields): Promise<EditResult> {
    checkMcpCallFields(fields);

    return editScope(ctx, 'set_mcp', scope, ['request'], target => {
        const action = requestAction(target);
        requireMcp(action, 'set_mcp');
        const before = JSON.stringify(normaliseMcpCall(action.mcp));
        const next = applyMcpCallFields(action.mcp, fields);
        if (JSON.stringify(next) == before)
            return '';
        action.mcp = next;
        return `Set MCP call '${next.method}' on ${scope}`;
    }, runOverrideHint('MCP call'));
}

// The fields of an MCP request's expectation; each optional. code null clears it, text '' clears it.
export interface McpExpectFields {
    outcome?: string;
    code?: number | null;
    text?: string;
}

function matchOutcome(given: string): McpOutcome {
    const found = typeof given == 'string' ? MCP_OUTCOMES.find(o => o == given.toLowerCase()) : undefined;
    if (found == undefined)
        throw new QueryError(`Unknown outcome '${given}' (have ${MCP_OUTCOMES.join(', ')})`);
    return found;
}

// Validates McpExpectFields and applies them to a copy of `current`. Pure and shared. Throws QueryError.
export function applyMcpExpectFields(current: Partial<McpExpect> | undefined, fields: McpExpectFields): McpExpect {
    if (fields.outcome === undefined && fields.code === undefined && fields.text === undefined)
        throw new QueryError('set_mcp_expect needs at least one of outcome, code or text');
    const outcome = fields.outcome === undefined ? undefined : matchOutcome(fields.outcome);
    if (fields.code != undefined && !Number.isInteger(fields.code))
        throw new QueryError(`code must be a whole number (a JSON-RPC error code such as -32602), not '${fields.code}'`);
    if (fields.text !== undefined && typeof fields.text != 'string')
        throw new QueryError('text must be text');

    const expect: McpExpect = { ...normaliseMcpCall({ expect: current as McpExpect }).expect };
    if (outcome !== undefined) expect.outcome = outcome;
    if (fields.code === null) delete expect.code;
    else if (fields.code !== undefined) expect.code = fields.code;
    if (fields.text === '') delete expect.text;
    else if (fields.text !== undefined) expect.text = fields.text;
    if (expect.outcome != 'rpc-error') {
        if (fields.code != undefined)
            throw new QueryError(`code applies to outcome rpc-error, not '${expect.outcome}'`);
        delete expect.code;
    }
    return expect;
}

// Sets what an MCP request's reply must be. Everything is checked before a file is touched.
export async function setMcpExpect(ctx: AuthoringContext, scope: string, fields: McpExpectFields): Promise<EditResult> {
    if (fields.code != undefined && fields.outcome === undefined)
        applyMcpExpectFields({ outcome: 'rpc-error' }, fields);
    else
        applyMcpExpectFields(undefined, fields);

    return editScope(ctx, 'set_mcp_expect', scope, ['request'], target => {
        const action = requestAction(target);
        requireMcp(action, 'set_mcp_expect');
        const call = normaliseMcpCall(action.mcp);
        const before = JSON.stringify(call.expect);
        const expect = applyMcpExpectFields(call.expect, fields);
        if (JSON.stringify(expect) == before)
            return '';
        action.mcp = { ...call, expect };
        return `Set MCP expect on ${scope}`;
    }, runOverrideHint('MCP expect'));
}
