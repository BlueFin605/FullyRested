import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawn } from 'node:child_process';
import { callTool as call, connectMcp, startFixture } from './fixture';
import { createSecretStore } from '../src/secret-store';

let fx: Awaited<ReturnType<typeof startFixture>>;
const secrets = createSecretStore({ FULLYRESTED_SECRET_APIKEY: 'sk-test-secret' }, undefined);

beforeAll(async () => { fx = await startFixture(); });
afterAll(() => fx.stop());

const connect = (defaultStore?: string) => connectMcp({ defaultStore, secrets });

// The query tools: nothing they take may name a secret or --include-secrets.
const QUERY_TOOLS = [
  'case_body', 'case_request', 'case_response', 'environments', 'failures', 'list_runs',
  'run', 'run_summary', 'show_request', 'tree'
];

// One tool per authoring verb, named as the spec names them, plus the read tool `settings`.
const EDIT_TOOLS = [
  'new_collection', 'new_folder', 'new_request', 'new_run', 'new_environment', 'select_environment',
  'set_header', 'set_param', 'set_variable', 'add_secret_ref', 'set_auth', 'remove_setting',
  'set_url', 'set_method', 'set_body', 'set_validation', 'set_validation_header',
  'validation_from_case', 'set_type', 'set_message', 'set_expect', 'set_trigger', 'rename', 'delete', 'move', 'settings'
];

const WS_TOOLS = ['ws_session_open', 'ws_session_events', 'ws_session_send', 'ws_session_close'];

const TOOLS = [...QUERY_TOOLS, ...EDIT_TOOLS, ...WS_TOOLS].sort();

describe('mcp server', () => {
  it('lists exactly the query and authoring tools, and no query tool mentions secrets or include', async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools.map(t => t.name).sort()).toEqual(TOOLS);
    const queries = tools.filter(t => QUERY_TOOLS.includes(t.name));
    expect(JSON.stringify(queries.map(t => t.inputSchema))).not.toMatch(/secret|include/i);
  });

  it('serves no secret-value tool: add_secret_ref is the only one, and it cannot carry a value', async () => {
    const { tools } = await connect().then(c => c.listTools());
    expect(tools.map(t => t.name).filter(n => /secret/.test(n))).toEqual(['add_secret_ref']);
    const ref = tools.find(t => t.name === 'add_secret_ref')!;
    expect(Object.keys((ref.inputSchema as { properties: object }).properties).sort())
      .toEqual(['collection', 'name', 'scope']);
    expect(JSON.stringify(ref.inputSchema)).not.toMatch(/value/i);
  });

  // AIF-12: set_validation_header gains the enabled flag its sibling set_header already had.
  it('set_validation_header serves an enabled flag, like set_header', async () => {
    const { tools } = await connect().then(c => c.listTools());
    const check = tools.find(t => t.name === 'set_validation_header')!;
    const props = (check.inputSchema as { properties: Record<string, { description?: string }> }).properties;
    expect(props.enabled).toBeTruthy();
    expect(props.enabled!.description).toMatch(/default: true/i);
  });

  // AIF-11: the three credential fields are writable, but reference-only. The description is the
  // part that matters for an agent - it is what stops it trying a literal and burning a call.
  it('set_auth serves the credential fields as reference-only', async () => {
    const { tools } = await connect().then(c => c.listTools());
    const auth = tools.find(t => t.name === 'set_auth')!;
    const props = (auth.inputSchema as { properties: Record<string, { description?: string }> }).properties;
    for (const field of ['password', 'secretKey', 'sessionToken']) {
      expect(props[field], field).toBeTruthy();
      expect(props[field]!.description, field).toMatch(/secret reference/i);
    }
  });

  it('every description is one line, and the authoring ones stay under 200 characters', async () => {
    const { tools } = await connect().then(c => c.listTools());
    for (const tool of tools) {
      expect(tool.description, tool.name).toBeTruthy();
      expect(tool.description, tool.name).not.toContain('\n');
      if (EDIT_TOOLS.includes(tool.name))
        expect(tool.description!.length, tool.name).toBeLessThan(200);
    }
  });

  it('tree, environments and show_request answer like the CLI', async () => {
    const client = await connect();
    const tree = (await call(client, 'tree', { collection: fx.collection })).json();
    expect(JSON.stringify(tree)).toContain('ok');
    const envs = (await call(client, 'environments', { collection: fx.collection })).text;
    expect(envs).toContain('Prod');
    const shown = await call(client, 'show_request', { collection: fx.collection, action: 'items/ok.frreq' });
    expect(shown.isError).toBe(false);
    expect(shown.text).not.toContain('sk-test-secret');
  });

  it('run -> failures -> case_body(path) drills in; secrets stay redacted', async () => {
    const client = await connect();
    const summary = (await call(client, 'run', { collection: fx.collection, all: true })).json();
    expect(summary.runId).toBeTruthy();
    expect(JSON.stringify(summary)).not.toContain('sk-test-secret');
    const failed = (await call(client, 'failures', {})).json();
    expect(JSON.stringify(failed)).toContain('down');
    const index = (await call(client, 'run_summary', {})).json().cases.find((c: { name: string }) => c.name === 'ok').index;
    const body = await call(client, 'case_body', { case: index, runId: summary.runId });
    expect(body.isError).toBe(false);
    expect(body.text).toContain('env=dev');
    const req = await call(client, 'case_request', { case: 'ok' });
    expect(req.text).not.toContain('sk-test-secret');
    expect((await call(client, 'case_response', { case: 'ok' })).isError).toBe(false);
    expect((await call(client, 'run_summary', {})).json().runId).toBe(summary.runId);
    expect(JSON.stringify((await call(client, 'list_runs', {})).json())).toContain(summary.runId);
  });

  it('run returns the counts and only the cases that did not pass', async () => {
    const client = await connect();
    const result = (await call(client, 'run', { collection: fx.collection, all: true })).json();
    expect(result).not.toHaveProperty('cases');
    expect(result.passed).toBeGreaterThan(0);
    expect(result.problems.length).toBe(result.failed + result.errored);
    expect(result.problems.every((c: { outcome: string }) => c.outcome !== 'pass')).toBe(true);
    const down = result.problems.find((c: { name: string }) => c.name === 'down');
    expect(down).toMatchObject({ outcome: 'error', failedChecks: [] });
    expect(down.error).toMatch(/^No response/);
  });

  it('run with no action, folder or all runs the whole collection', async () => {
    const client = await connect();
    const bare = await call(client, 'run', { collection: fx.collection });
    expect(bare.isError).toBe(false);
    const all = (await call(client, 'run', { collection: fx.collection, all: true })).json();
    const result = bare.json();
    expect(result.passed + result.failed + result.errored).toBe(all.passed + all.failed + all.errored);
    expect(result.selection).toBe(all.selection);
  });

  it('case_response keeps only the useful headers unless asked for more', async () => {
    const client = await connect();
    await call(client, 'run', { collection: fx.collection, action: 'items/ok.frreq' });
    const trimmed = (await call(client, 'case_response', { case: 'ok' })).json();
    expect(trimmed.headers).toHaveProperty('content-type');
    expect(trimmed.headers).not.toHaveProperty('date');
    expect(trimmed.headersOmitted).toBeGreaterThan(0);
    const all = (await call(client, 'case_response', { case: 'ok', headers: true })).json();
    expect(all.headers).toHaveProperty('date');
    expect(all).not.toHaveProperty('headersOmitted');
    const named = (await call(client, 'case_response', { case: 'ok', headers: ['Date'] })).json();
    expect(Object.keys(named.headers)).toEqual(['date']);
  });

  it('tree can show one folder and an unknown folder is an error', async () => {
    const client = await connect();
    const items = (await call(client, 'tree', { collection: fx.collection, folder: 'items' })).json();
    expect(items.folder).toBe('items');
    expect(items.children.every((c: { path: string }) => c.path.startsWith('items/'))).toBe(true);
    const bad = await call(client, 'tree', { collection: fx.collection, folder: 'nope' });
    expect(bad.isError).toBe(true);
    expect(bad.text).toContain("Folder 'nope' not found");
  });

  it('run without a store writes no .fullyrested-runs in the working directory', async () => {
    const cwd = process.cwd();
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fr-mcp-cwd-'));
    process.chdir(tmp);
    try {
      const client = await connect();
      await call(client, 'run', { collection: fx.collection, action: 'items/ok.frreq' });
      expect(fs.existsSync(path.join(tmp, '.fullyrested-runs'))).toBe(false);
    } finally {
      process.chdir(cwd);
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('run with a store writes a file a fresh server can read', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr-mcp-store-'));
    try {
      const summary = (await call(await connect(), 'run', { collection: fx.collection, action: 'items/ok.frreq', store: dir })).json();
      expect(fs.existsSync(path.join(dir, '.fullyrested-runs', summary.runId + '.frrun'))).toBe(true);
      const fresh = await connect();
      expect((await call(fresh, 'run_summary', { store: dir })).json().runId).toBe(summary.runId);
      expect(JSON.stringify((await call(fresh, 'list_runs', { store: dir })).json())).toContain(summary.runId);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('an unwritable store warns on stderr and the run still completes', async () => {
    const file = path.join(fx.folder, 'not-a-dir');
    fs.writeFileSync(file, 'x');
    const errors: string[] = [];
    const orig = console.error;
    console.error = (...a: unknown[]) => { errors.push(a.join(' ')); };
    try {
      const result = await call(await connect(), 'run', { collection: fx.collection, action: 'items/ok.frreq', store: file });
      expect(result.isError).toBe(false);
      expect(result.json().runId).toBeTruthy();
    } finally {
      console.error = orig;
    }
    expect(errors.join(' ')).toMatch(/could not record run/);
  });

  it('an unknown case is an error listing the cases', async () => {
    const client = await connect();
    await call(client, 'run', { collection: fx.collection, action: 'items/ok.frreq' });
    const result = await call(client, 'case_request', { case: 'nope' });
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/not found.*ok/);
  });

  it('a missing collection is an error result, not a crash', async () => {
    const result = await call(await connect(), 'tree', { collection: path.join(fx.folder, 'nope.frcol') });
    expect(result.isError).toBe(true);
  });

  it('the run tool with a missing collection is an error and the server keeps answering', async () => {
    const client = await connect();
    const bad = await call(client, 'run', { collection: path.join(fx.folder, 'nope.frcol'), all: true });
    expect(bad.isError).toBe(true);
    const runs = await call(client, 'list_runs', {});
    expect(runs.isError).toBe(false);
    expect(runs.json()).toEqual([]);
  });

  it('refuses a run recorded with --include-secrets', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr-mcp-unredacted-'));
    try {
      fs.mkdirSync(path.join(dir, '.fullyrested-runs'));
      const record = {
        runId: '20260101-000000-abcd', startedAt: '2026-01-01T00:00:00.000Z', collection: 'c', selection: '--all', redacted: false,
        cases: [{ index: 1, name: 'ok', requestFile: 'f', outcome: 'pass', ms: 1,
          request: { method: 'GET', url: 'https://x.test/?k=sk-test-secret', headers: {} },
          response: { status: 200, headers: {}, body: { bytes: 14, text: 'sk-test-secret' } } }]
      };
      fs.writeFileSync(path.join(dir, '.fullyrested-runs', `${record.runId}.frrun`), JSON.stringify(record));
      const client = await connect();
      for (const [tool, args] of [
        ['run_summary', {}], ['failures', { runId: record.runId }], ['case_request', { case: 1 }],
        ['case_response', { case: 1 }], ['case_body', { case: 1 }]
      ] as const) {
        const result = await call(client, tool, { ...args, store: dir });
        expect(result.isError, tool).toBe(true);
        expect(result.text).toBe(`Run ${record.runId} is not marked as redacted (recorded with --include-secrets?); it is not served over MCP`);
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a run id with path separators is not found and never reads a file outside .fullyrested-runs', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr-mcp-decoy-'));
    try {
      fs.mkdirSync(path.join(dir, '.fullyrested-runs'));
      fs.writeFileSync(path.join(dir, 'x.json'), JSON.stringify({ runId: 'x', startedAt: 'now', selection: 'decoy', redacted: true, cases: [] }));
      const result = await call(await connect(), 'run_summary', { runId: '../x', store: path.join(dir, '.fullyrested-runs', '..') });
      expect(result.isError).toBe(true);
      expect(result.text).toMatch(/not found/);
      expect(result.text).not.toContain('decoy');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('fullyrested mcp over stdio', () => {
  it('writes only JSON-RPC messages to stdout', async () => {
    const cli = path.resolve(__dirname, '..', 'dist', 'index.js');
    const child = spawn(process.execPath, [cli, 'mcp'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', () => { });
    const send = (m: object) => child.stdin.write(JSON.stringify(m) + '\n');
    send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
    send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    const started = Date.now();
    while (!out.includes('"id":2') && Date.now() - started < 10000)
      await new Promise(r => setTimeout(r, 50));
    child.kill();
    const lines = out.split('\n').filter(l => l.trim() !== '');
    expect(lines.length).toBeGreaterThanOrEqual(2);
    for (const line of lines)
      expect(JSON.parse(line).jsonrpc).toBe('2.0');
  });
});
