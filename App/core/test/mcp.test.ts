import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  CollectionNode, CreateEmptyAction, CreateEmptyCollectionConfig, HttpProtocol, McpCall, RestAction, RestActionResult, ValidationType,
  bodyToString, buildCaseRecord, executeRequest, mcpEnvelope, normaliseAction, normaliseMcpResponse, prepareRequest, validateMcp, validateResponse
} from '../src';
import { FakeMcp, startFakeMcp } from './fixtures/fake-mcp-server';

let fake: FakeMcp;
beforeAll(async () => { fake = await startFakeMcp(); });
afterAll(() => fake.stop());

const guid = { generateGUID: () => 'g' };

function mcpAction(path: string, call: Partial<McpCall>, extra: Partial<RestAction> = {}): RestAction {
  return normaliseAction({
    ...CreateEmptyAction(), id: 'm', name: 'mcp', protocol: HttpProtocol.http, url: `{{host}}${path}`, type: 'mcp',
    mcp: call as McpCall, ...extra
  });
}

function nodeFor(action: RestAction) {
  const config = CreateEmptyCollectionConfig(guid);
  config.collectionEnvironment.variables = [
    { variable: 'host', value: fake.host, active: true, id: '1' },
    { variable: 'word', value: 'hello', active: true, id: '2' }
  ];
  return new CollectionNode(config, 'api.frcol').attach(action, 'mcp/call.frreq');
}

async function send(action: RestAction) {
  const request = nodeFor(action).resolve().replaceVariables();
  const response = await executeRequest(request);
  return { request, response, validation: validateResponse(request, response) };
}

const json = (r: RestActionResult) => JSON.parse(bodyToString(r.body?.contentType, r.body?.body));
const result = (body: object, contentType = 'application/json'): RestActionResult =>
  ({ status: 200, statusText: 'OK', headers: {}, headersSent: {}, body: { contentType, body: new TextEncoder().encode(JSON.stringify(body)).buffer as ArrayBuffer }, validated: undefined });

describe('mcpEnvelope', () => {
  it('wraps method and params in a JSON-RPC 2.0 envelope with id 1', () => {
    expect(JSON.parse(mcpEnvelope('tools/call', '{"name":"echo","arguments":{}}')))
      .toEqual({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'echo', arguments: {} } });
  });

  it('leaves params out when there are none, and gives initialize default params', () => {
    expect(JSON.parse(mcpEnvelope('tools/list', ''))).toEqual({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(JSON.parse(mcpEnvelope('initialize', '')).params).toMatchObject({ protocolVersion: expect.any(String), clientInfo: { name: 'FullyRested' } });
  });

  it('sends a notification without an id', () => {
    expect(JSON.parse(mcpEnvelope('notifications/initialized', ''))).toEqual({ jsonrpc: '2.0', method: 'notifications/initialized' });
  });
});

describe('resolving an MCP request', () => {
  it('is a POST of the envelope with Accept for JSON and SSE, whatever the request verb and body say', () => {
    const action = mcpAction('/stateless', { method: 'tools/call', params: '{"name":"echo","arguments":{"w":"{{word}}"}}' },
      { body: { contentType: 'text/plain', body: 'ignored' } });
    const prepared = prepareRequest(nodeFor(action).resolve().replaceVariables());
    expect(prepared.method).toBe('POST');
    expect(prepared.headers).toMatchObject({ Accept: 'application/json, text/event-stream', 'content-type': 'application/json' });
    expect(JSON.parse(prepared.body!)).toEqual({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'echo', arguments: { w: 'hello' } } });
  });

  it('keeps an Accept header set on the request', () => {
    const action = mcpAction('/stateless', { method: 'tools/list' }, { headers: [{ key: 'accept', value: 'application/json', active: true, id: 'h' }] });
    expect(prepareRequest(nodeFor(action).resolve()).headers).toEqual({ accept: 'application/json', 'content-type': 'application/json' });
  });

  it('leaves an http request without mcp', () => {
    const action = normaliseAction({ ...CreateEmptyAction(), url: 'x' });
    expect(nodeFor(action).resolve().mcp).toBeUndefined();
  });
});

describe('running an MCP request against a server', () => {
  it('passes a tools/call whose result is not an error', async () => {
    const { response, validation } = await send(mcpAction('/stateless', { method: 'tools/call', params: '{"name":"echo","arguments":{"a":1}}' }));
    expect(response.status).toBe(200);
    expect(json(response).result.content[0].text).toBe('{"a":1}');
    expect(validation).toMatchObject({ valid: true, checks: [{ check: 'mcp', passed: true, errors: [] }] });
  });

  it('fails a tool result with isError when a result is expected, naming the tool text', async () => {
    const { validation } = await send(mcpAction('/stateless', { method: 'tools/call', params: '{"name":"fail","arguments":{}}' }));
    expect(validation?.valid).toBe(false);
    expect(validation?.errors).toEqual(['Tool reported an error: boom']);
  });

  it('passes an expected tool error, and checks its text', async () => {
    const ok = await send(mcpAction('/stateless', { method: 'tools/call', params: '{"name":"fail"}', expect: { outcome: 'tool-error', text: 'boom' } }));
    expect(ok.validation?.valid).toBe(true);
    const wrongText = await send(mcpAction('/stateless', { method: 'tools/call', params: '{"name":"fail"}', expect: { outcome: 'tool-error', text: 'bang' } }));
    expect(wrongText.validation?.errors).toEqual(["Result text does not contain 'bang'"]);
  });

  it('checks a JSON-RPC error and its code', async () => {
    const call = { method: 'tools/call', params: '{"name":"nope"}' };
    expect((await send(mcpAction('/stateless', call))).validation?.errors).toEqual(['JSON-RPC error -32602: Unknown tool: nope']);
    expect((await send(mcpAction('/stateless', { ...call, expect: { outcome: 'rpc-error', code: -32602, text: 'Unknown tool' } }))).validation?.valid).toBe(true);
    expect((await send(mcpAction('/stateless', { ...call, expect: { outcome: 'rpc-error', code: -32601 } }))).validation?.errors)
      .toEqual(['JSON-RPC error -32602: Unknown tool: nope; expected code -32601']);
  });

  it('substitutes variables into the expected text', async () => {
    const { validation } = await send(mcpAction('/stateless', { method: 'tools/call', params: '{"name":"echo","arguments":{"w":"{{word}}"}}', expect: { outcome: 'result', text: '{{word}}' } }));
    expect(validation?.valid).toBe(true);
  });

  it('turns an SSE reply into its JSON-RPC message', async () => {
    const { response, validation } = await send(mcpAction('/sse', { method: 'tools/list' }));
    expect(response.body?.contentType).toBe('application/json');
    expect(json(response).result.tools.map((t: { name: string }) => t.name)).toEqual(['echo', 'fail']);
    expect(validation?.valid).toBe(true);
  });

  it('fails a stateful server without the handshake, and passes with it, carrying the session id', async () => {
    const without = await send(mcpAction('/stateful', { method: 'tools/list' }));
    expect(without.response.status).toBe(400);
    expect(without.validation?.errors?.[0]).toMatch(/^JSON-RPC error -32000/);

    fake.received.length = 0;
    const withIt = await send(mcpAction('/stateful', { method: 'tools/list', handshake: true }));
    expect(withIt.validation?.valid).toBe(true);
    expect(fake.received.map(r => r.body.method)).toEqual(['initialize', 'notifications/initialized', 'tools/list']);
    expect(fake.received[2]!.headers).toMatchObject({ 'mcp-session-id': 's-1', 'mcp-protocol-version': '2025-06-18' });
    expect(withIt.response.headersSent).toMatchObject({ 'mcp-session-id': 's-1' });
  });

  it('reports a failed initialize as the result, without sending the call', async () => {
    fake.received.length = 0;
    const { response, validation } = await send(mcpAction('/locked', { method: 'tools/list', handshake: true }));
    expect(response.status).toBe(401);
    expect(response.statusText).toMatch(/^MCP initialize failed: 401/);
    expect(fake.received.map(r => r.body.method)).toEqual(['initialize']);
    expect(validation?.errors).toEqual(['Response is not a JSON-RPC reply']);
  });

  it('runs HTTP validation alongside the MCP check, and skips the MCP check for outcome any', async () => {
    const statusOnly = mcpAction('/stateful', { method: 'tools/list', expect: { outcome: 'any' } });
    statusOnly.validation = { ...statusOnly.validation, type: ValidationType.ResponseCode, httpCode: 400 };
    expect((await send(statusOnly)).validation).toMatchObject({ valid: true, checks: [{ check: 'status', passed: true }] });

    const both = mcpAction('/stateless', { method: 'tools/list' });
    both.validation = { ...both.validation, type: ValidationType.ResponseCode, httpCode: 200 };
    expect((await send(both)).validation?.checks?.map(c => c.check)).toEqual(['status', 'mcp']);
  });

  it('records the envelope and the mcp check in a case record', async () => {
    const { request, response, validation } = await send(mcpAction('/stateless', { method: 'tools/call', params: '{"name":"fail"}' }));
    const record = buildCaseRecord({ index: 1, name: 'mcp', requestFile: 'mcp/call.frreq', ms: 1, request: prepareRequest(request), response, validation });
    expect(record.outcome).toBe('fail');
    expect(record.request.method).toBe('POST');
    expect(JSON.parse(record.request.body!.text!).method).toBe('tools/call');
    expect(record.validation?.checks).toEqual([{ check: 'mcp', passed: false, errors: ['Tool reported an error: boom'] }]);
  });
});

describe('validateMcp', () => {
  it('rejects a body that is not a JSON-RPC reply', () => {
    expect(validateMcp('tools/list', { outcome: 'result' }, result({ message: 'Unauthorized' })).errors).toEqual(['Response is not a JSON-RPC reply']);
  });

  it('checks nothing for a notification', () => {
    expect(validateMcp('notifications/initialized', { outcome: 'result' }, { ...result({}), body: undefined }).valid).toBe(true);
  });

  it('picks the reply with id 1 out of a batch', () => {
    const batch = result([{ jsonrpc: '2.0', id: 9, error: { code: 1, message: 'x' } }, { jsonrpc: '2.0', id: 1, result: {} }]);
    expect(validateMcp('tools/list', { outcome: 'result' }, batch).valid).toBe(true);
  });

  it('expects a JSON-RPC error and gets a result', () => {
    expect(validateMcp('tools/list', { outcome: 'rpc-error' }, result({ jsonrpc: '2.0', id: 1, result: {} })).errors).toEqual(['Expected a JSON-RPC error, got a result']);
  });
});

describe('normaliseMcpResponse', () => {
  it('leaves a JSON reply alone', () => {
    const r = result({ jsonrpc: '2.0', id: 1, result: {} });
    expect(normaliseMcpResponse(r)).toBe(r);
  });

  it('reads a multi-line SSE data event', () => {
    const sse = 'event: message\ndata: {"jsonrpc":"2.0",\ndata: "id":1,"result":{"ok":true}}\n\n';
    const r: RestActionResult = { ...result({}), body: { contentType: 'text/event-stream', body: new TextEncoder().encode(sse).buffer as ArrayBuffer } };
    expect(json(normaliseMcpResponse(r))).toEqual({ jsonrpc: '2.0', id: 1, result: { ok: true } });
  });
});
