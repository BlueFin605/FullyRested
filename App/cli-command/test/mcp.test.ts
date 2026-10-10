import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { startFixture } from './fixture';
import { createServer } from '../src/mcp';
import { createSecretStore } from '../src/secret-store';

let fx: Awaited<ReturnType<typeof startFixture>>;
const secrets = createSecretStore({ FULLYRESTED_SECRET_APIKEY: 'sk-test-secret' }, undefined);

beforeAll(async () => { fx = await startFixture(); });
afterAll(() => fx.stop());

async function connect(defaultStore?: string) {
  const server = createServer({ defaultStore, secrets });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1' });
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content as { type: string; text: string }[])[0]!.text;
  return { isError: result.isError === true, text, json: () => JSON.parse(text) };
}

const TOOLS = [
  'case_body', 'case_request', 'case_response', 'environments', 'failures', 'list_runs',
  'run', 'run_summary', 'show_request', 'tree'
];

describe('mcp server', () => {
  it('lists exactly the tools (the ticket lists ten names) and none mentions secrets or include', async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools.map(t => t.name).sort()).toEqual(TOOLS);
    expect(JSON.stringify(tools.map(t => t.inputSchema))).not.toMatch(/secret|include/i);
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
    const index = summary.cases.find((c: { name: string }) => c.name === 'ok').index;
    const body = await call(client, 'case_body', { case: index, runId: summary.runId });
    expect(body.isError).toBe(false);
    expect(body.text).toContain('env=dev');
    const req = await call(client, 'case_request', { case: 'ok' });
    expect(req.text).not.toContain('sk-test-secret');
    expect((await call(client, 'case_response', { case: 'ok' })).isError).toBe(false);
    expect((await call(client, 'run_summary', {})).json().runId).toBe(summary.runId);
    expect(JSON.stringify((await call(client, 'list_runs', {})).json())).toContain(summary.runId);
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
      expect(fs.existsSync(path.join(dir, '.fullyrested-runs', summary.runId + '.json'))).toBe(true);
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
});
