import { describe, expect, it } from 'vitest';
import { applyMcpCallFields, applyMcpExpectFields, setMcp, setMcpExpect, setType } from '../src/authoring';
import { MemoryCollectionSink } from '../src/collection-sink';
import { QueryError } from '../src/query-error';
import { loadCollectionTree } from '../src/tree';
import { showRequest, treeView } from '../src/inspect';
import { RequestNode } from '../src/scope';
import { files } from './fixtures/collection';

const guid = { generateGUID: () => 'g' };
const secrets = { get: async () => null, set: async () => { } };
const ctxFor = (sink: MemoryCollectionSink) => ({ collectionFile: 'api.frcol', source: sink, sink, secrets, guid });
const written = (sink: MemoryCollectionSink, file: string) => JSON.parse(sink.files.get(file)!);
const REQ = 'request:users/get.frreq';
const FILE = 'users/get.frreq';

async function mcpSink() {
  const sink = new MemoryCollectionSink(files);
  await setType(ctxFor(sink), REQ, 'mcp');
  return sink;
}

describe('set_type mcp', () => {
  it('switches a request to mcp and fills the call defaults', async () => {
    const sink = await mcpSink();
    expect(written(sink, FILE)).toMatchObject({ type: 'mcp', mcp: { method: 'tools/list', params: '', handshake: false, expect: { outcome: 'result' } } });
  });

  it('lists mcp among the types', async () => {
    const sink = new MemoryCollectionSink(files);
    await expect(setType(ctxFor(sink), REQ, 'grpc')).rejects.toThrow(/\(have http, websocket, mcp\)/);
  });
});

describe('set_mcp', () => {
  it('writes a tools/call from tool and arguments', async () => {
    const sink = await mcpSink();
    const result = await setMcp(ctxFor(sink), REQ, { tool: 'kanban_get', arguments: '{"guid":"{{ticket}}"}' });
    expect(result).toMatchObject({ changed: true, message: `Set MCP call 'tools/call' on ${REQ}` });
    expect(written(sink, FILE).mcp).toMatchObject({ method: 'tools/call', params: '{"name":"kanban_get","arguments":{"guid":"{{ticket}}"}}' });
  });

  it('changes only the arguments of a tools/call that already names its tool', async () => {
    const sink = await mcpSink();
    await setMcp(ctxFor(sink), REQ, { tool: 'echo' });
    await setMcp(ctxFor(sink), REQ, { arguments: '{"n":{{count}}}' });
    expect(written(sink, FILE).mcp.params).toBe('{"name":"echo","arguments":{"n":{{count}}}}');
  });

  it('sets method, params and handshake, and reports no change for the same values', async () => {
    const sink = await mcpSink();
    await setMcp(ctxFor(sink), REQ, { method: 'initialize', params: '', handshake: true });
    expect(written(sink, FILE).mcp).toMatchObject({ method: 'initialize', params: '', handshake: true });
    expect((await setMcp(ctxFor(sink), REQ, { handshake: true })).changed).toBe(false);
  });

  it.each([
    [{}, /needs at least one of/],
    [{ method: 'tools list' }, /method must be a JSON-RPC method name/],
    [{ params: 'not json' }, /params must be JSON/],
    [{ params: '"text"' }, /params must be a JSON object or array/],
    [{ tool: 'x', params: '{}' }, /give tool \(with arguments\) or params, not both/],
    [{ tool: 'x', method: 'tools/list' }, /tool makes the method tools\/call/],
    [{ tool: 'x', arguments: '[1]' }, /arguments must be a JSON object/]
  ])('rejects %j, writing nothing', async (fields, message) => {
    const sink = await mcpSink();
    const before = sink.files.get(FILE);
    await expect(setMcp(ctxFor(sink), REQ, fields)).rejects.toThrow(message);
    expect(sink.files.get(FILE)).toBe(before);
  });

  it('rejects arguments with no tool to call', async () => {
    const sink = await mcpSink();
    await expect(setMcp(ctxFor(sink), REQ, { arguments: '{}' })).rejects.toThrow(/arguments needs tool/);
  });

  it('rejects an http request and a run locator', async () => {
    const sink = new MemoryCollectionSink(files);
    await expect(setMcp(ctxFor(sink), REQ, { method: 'tools/list' })).rejects.toThrow(/set_mcp applies to an MCP request; this one is http \(use set_type mcp first\)/);
    await expect(setMcp(ctxFor(sink), 'run:users/get.frreq#not found', { method: 'tools/list' })).rejects.toThrow(QueryError);
  });
});

describe('set_mcp_expect', () => {
  it('sets outcome, code and text, and clears them', async () => {
    const sink = await mcpSink();
    await setMcpExpect(ctxFor(sink), REQ, { outcome: 'rpc-error', code: -32602, text: 'Unknown tool' });
    expect(written(sink, FILE).mcp.expect).toEqual({ outcome: 'rpc-error', code: -32602, text: 'Unknown tool' });

    await setMcpExpect(ctxFor(sink), REQ, { code: null, text: '' });
    expect(written(sink, FILE).mcp.expect).toEqual({ outcome: 'rpc-error' });
  });

  it('drops the code when the outcome moves off rpc-error', async () => {
    const sink = await mcpSink();
    await setMcpExpect(ctxFor(sink), REQ, { outcome: 'rpc-error', code: 1 });
    await setMcpExpect(ctxFor(sink), REQ, { outcome: 'tool-error' });
    expect(written(sink, FILE).mcp.expect).toEqual({ outcome: 'tool-error' });
  });

  it.each([
    [{}, /needs at least one of outcome, code or text/],
    [{ outcome: 'fine' }, /Unknown outcome 'fine' \(have result, tool-error, rpc-error, any\)/],
    [{ outcome: 'result', code: 1 }, /code applies to outcome rpc-error/],
    [{ code: 1.5 }, /code must be a whole number/]
  ])('rejects %j, writing nothing', async (fields, message) => {
    const sink = await mcpSink();
    const before = sink.files.get(FILE);
    await expect(setMcpExpect(ctxFor(sink), REQ, fields)).rejects.toThrow(message);
    expect(sink.files.get(FILE)).toBe(before);
  });
});

describe('the pure helpers', () => {
  it('apply fields to a copy, leaving the current value alone', () => {
    const current = { method: 'tools/list', params: '', handshake: false, expect: { outcome: 'result' as const } };
    expect(applyMcpCallFields(current, { tool: 'echo' }).params).toBe('{"name":"echo","arguments":{}}');
    expect(current.params).toBe('');
    expect(applyMcpExpectFields(current.expect, { text: 'x' })).toEqual({ outcome: 'result', text: 'x' });
    expect(current.expect).toEqual({ outcome: 'result' });
  });
});

describe('tree and show for an MCP request', () => {
  it('shows the method, tool and expect', async () => {
    const sink = await mcpSink();
    await setMcp(ctxFor(sink), REQ, { tool: 'echo', arguments: '{"w":"{{word}}"}', handshake: true });
    const root = await loadCollectionTree('api.frcol', sink, secrets);

    const view = treeView(root);
    const users = view.children.find(c => c.type == 'folder' && c.path == 'users');
    const get = users?.type == 'folder' ? users.children.find(c => c.type == 'request' && c.path == FILE) : undefined;
    expect(get).toMatchObject({ method: 'mcp', requestType: 'mcp', mcp: { method: 'tools/call', tool: 'echo', handshake: true, expect: { outcome: 'result' } } });

    const shown = showRequest(root.find(FILE) as RequestNode);
    expect(shown).toMatchObject({ method: 'mcp', requestType: 'mcp', mcp: { tool: 'echo', params: '{"name":"echo","arguments":{"w":"{{word}}"}}' } });
  });
});
