import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer, IncomingMessage, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { RestAction } from '@fullyrested/core';
import { callTool, connectMcp } from './fixture';
import { createSecretStore } from '../src/secret-store';

// MCP requests against a real MCP server: the SDK's streamable HTTP transport in stateful mode,
// answering with SSE streams and requiring the Mcp-Session-Id it hands out on initialize. That is
// the harder case for a client; core's tests cover the stateless JSON one with a small fake.

const cli = path.resolve(__dirname, '..', 'dist', 'index.js');

function fullyrested(args: string[], workDir: string): Promise<{ code: number; out: string; err: string }> {
  return new Promise(resolve => {
    execFile(process.execPath, [cli, ...args], { cwd: workDir, encoding: 'utf8' }, (error, out, err) =>
      resolve({ code: error ? (error as { code?: number }).code ?? 1 : 0, out, err }));
  });
}

function mcpServer(): McpServer {
  const server = new McpServer({ name: 'test-server', version: '1' });
  server.registerTool('echo', { description: 'echo', inputSchema: { word: z.string() } },
    async a => ({ content: [{ type: 'text' as const, text: `you said ${a.word}` }] }));
  server.registerTool('fail', { description: 'fail', inputSchema: {} },
    async () => ({ content: [{ type: 'text' as const, text: 'boom' }], isError: true }));
  return server;
}

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise(resolve => {
    let text = '';
    req.on('data', c => text += c);
    req.on('end', () => { try { resolve(JSON.parse(text)); } catch { resolve(undefined); } });
  });
}

let http: Server;
let host = '';
let dir = '';
let collection = '';
const transports = new Map<string, StreamableHTTPServerTransport>();

beforeAll(async () => {
  http = createServer(async (req, res) => {
    const body = await readJson(req);
    const session = req.headers['mcp-session-id'];
    let transport = typeof session == 'string' ? transports.get(session) : undefined;
    if (transport == undefined && (body as { method?: string })?.method == 'initialize') {
      transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID(), onsessioninitialized: id => { transports.set(id, transport!); } });
      await mcpServer().connect(transport);
    }
    if (transport == undefined) {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Bad Request: No valid session ID provided' } }));
      return;
    }
    await transport.handleRequest(req, res, body);
  });
  await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve));
  host = `127.0.0.1:${(http.address() as AddressInfo).port}`;

  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fullyrested-mcp-request-'));
  collection = path.join(dir, 'api.frcol');
});

afterAll(async () => {
  for (const t of transports.values()) await t.close();
  await new Promise<void>(resolve => http.close(() => resolve()));
  fs.rmSync(dir, { recursive: true, force: true });
});

const readReq = (file: string) => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as RestAction;

describe('an MCP request from the CLI', () => {
  it('is authored with set-type, set-mcp and set-mcp-expect, shown in tree and show, and run', async () => {
    const edit = (...args: string[]) => fullyrested(['edit', ...args, '-c', collection], dir);
    expect((await fullyrested(['edit', 'new-collection', '--file', collection], dir)).code).toBe(0);
    expect((await edit('set-variable', '--scope', 'collection', '--name', 'host', '--value', host)).code).toBe(0);
    expect((await edit('set-variable', '--scope', 'collection', '--name', 'word', '--value', 'hi')).code).toBe(0);
    expect((await edit('new-request', '--path', 'mcp/echo.frreq', '--method', 'post', '--url', '{{host}}/mcp', '--protocol', 'http')).code).toBe(0);

    let r = await edit('set-mcp', '--scope', 'request:mcp/echo.frreq', '--tool', 'echo');
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/set_mcp applies to an MCP request; this one is http/);

    expect((await edit('set-type', 'mcp', '--scope', 'request:mcp/echo.frreq')).code).toBe(0);
    const argsFile = path.join(dir, 'args.json');
    fs.writeFileSync(argsFile, '{"word":"{{word}}"}');
    r = await edit('set-mcp', '--scope', 'request:mcp/echo.frreq', '--tool', 'echo', '--arguments', `@${argsFile}`, '--handshake', 'true');
    expect(r.code, r.err).toBe(0);
    r = await edit('set-mcp-expect', '--scope', 'request:mcp/echo.frreq', '--text', 'you said {{word}}');
    expect(r.code, r.err).toBe(0);
    expect(readReq('mcp/echo.frreq')).toMatchObject({
      type: 'mcp', mcp: { method: 'tools/call', params: '{"name":"echo","arguments":{"word":"{{word}}"}}', handshake: true, expect: { outcome: 'result', text: 'you said {{word}}' } }
    });

    for (const bad of [['--outcome', 'fine'], ['--code', 'x'], ['--outcome', 'result', '--code', '1']]) {
      r = await edit('set-mcp-expect', '--scope', 'request:mcp/echo.frreq', ...bad);
      expect(r.code, bad.join(' ')).toBe(2);
    }

    const tree = await fullyrested(['tree', '-c', collection], dir);
    expect(tree.out).toContain("mcp: tools/call echo, handshake; expect result, text 'you said {{word}}'");
    expect(tree.out).toContain('MCP {{host}}/mcp');
    const shown = JSON.parse((await fullyrested(['show', '-c', collection, '-a', 'mcp/echo.frreq', '--json'], dir)).out);
    expect(shown).toMatchObject({ requestType: 'mcp', mcp: { tool: 'echo', handshake: true } });

    const run = await fullyrested(['run', '-c', collection, '-a', 'mcp/echo.frreq', '--json'], dir);
    expect(run.code, run.out + run.err).toBe(0);
    const record = JSON.parse(run.out);
    expect(record.cases[0]).toMatchObject({ outcome: 'pass', request: { method: 'POST' }, validation: { checks: [{ check: 'mcp', passed: true }] } });
    expect(JSON.parse(record.cases[0].response.body.text).result.content[0].text).toBe('you said hi');
  }, 60000); // a dozen CLI spawns

  it('fails without the handshake against a stateful server, saying why', async () => {
    await fullyrested(['edit', 'set-mcp', '--scope', 'request:mcp/echo.frreq', '--handshake', 'false', '-c', collection], dir);
    const run = await fullyrested(['run', '-c', collection, '-a', 'mcp/echo.frreq', '--json'], dir);
    expect(run.code).toBe(1);
    const c = JSON.parse(run.out).cases[0];
    expect(c.outcome).toBe('fail');
    expect(c.validation.checks[0].errors[0]).toMatch(/^JSON-RPC error -32000: Bad Request/);
  }, 30000);
});

describe('an MCP request over FullyRested MCP', () => {
  it('is authored with set_type, set_mcp and set_mcp_expect and run with run', async () => {
    const client = await connectMcp({ secrets: createSecretStore({}, undefined) });
    const call = (name: string, args: Record<string, unknown> = {}) => callTool(client, name, args);
    const scope = 'request:mcp/fail.frreq';
    expect((await call('new_request', { collection, path: 'mcp/fail.frreq', method: 'post', url: '{{host}}/mcp', protocol: 'http' })).isError).toBe(false);
    expect((await call('set_type', { collection, scope, type: 'mcp' })).isError).toBe(false);
    const set = await call('set_mcp', { collection, scope, tool: 'fail', handshake: true });
    expect(set.isError, set.text).toBe(false);

    let result = (await call('run', { collection, action: 'mcp/fail.frreq' })).json();
    expect(result.failed).toBe(1);
    expect(result.problems[0].failedChecks).toEqual([{ check: 'mcp', errors: ['Tool reported an error: boom'] }]);

    const expectSet = await call('set_mcp_expect', { collection, scope, outcome: 'tool-error', text: 'boom' });
    expect(expectSet.isError, expectSet.text).toBe(false);
    result = (await call('run', { collection, action: 'mcp/fail.frreq' })).json();
    expect(result).toMatchObject({ passed: 1, failed: 0, errored: 0 });

    const bad = await call('set_mcp_expect', { collection, scope, code: 1 });
    expect(bad.isError).toBe(true);
    expect(bad.text).toMatch(/code applies to outcome rpc-error/);
  }, 30000);
});
