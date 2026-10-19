import { describe, it, expect } from 'vitest';
import { createServer } from 'node:http';
import { AddressInfo } from 'node:net';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { RestAction, secretServiceForCollection } from '@fullyrested/core';
import { callTool, connectMcp } from './fixture';
import { loadTree } from '../src/files';
import { createSecretStore, createSecretWriter } from '../src/secret-store';

// A collection folder of its own per test: every scenario below builds its collection from
// nothing through the MCP tools, so nothing is shared and nothing is left behind.
function workspace(): { folder: string; collection: string; cleanup(): void } {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'fr-mcp-authoring-'));
  return {
    folder,
    collection: path.join(folder, 'api.frcol'),
    cleanup: () => fs.rmSync(folder, { recursive: true, force: true })
  };
}

// The server under test: one body at a time, swapped mid-test to prove the learnt schema is a
// real check rather than a snapshot nobody looks at again.
async function startApi(body: () => unknown) {
  const server = createServer((_req, res) => {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body()));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/thing`,
    stop: () => new Promise<void>(resolve => server.close(() => resolve()))
  };
}

const readAction = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8')) as RestAction;

// An in-memory keychain behind createSecretWriter: the one store in the CLI that can be written
// to. A real keychain is never touched by the test suite.
function memoryKeychain() {
  const values = new Map<string, string>();
  return {
    async getPassword(service: string, account: string) { return values.get(`${service}::${account}`) ?? null; },
    async setPassword(service: string, account: string, value: string) { values.set(`${service}::${account}`, value); }
  };
}

describe('websocket trigger over MCP', () => {
  it('sets, shows and clears a trigger', async () => {
    const ws = workspace();
    const client = await connectMcp({ secrets: createSecretStore({}, undefined) });
    const call = (name: string, args: Record<string, unknown> = {}) => callTool(client, name, args);
    const c = ws.collection;
    try {
      await call('new_collection', { file: c });
      await call('new_request', { collection: c, path: 'touch.frreq', method: 'put', url: 'http://localhost/touch' });
      await call('new_request', { collection: c, path: 'feed.frreq', method: 'get', url: 'ws://localhost/feed' });
      await call('set_type', { collection: c, scope: 'request:feed.frreq', type: 'websocket' });

      const set = await call('set_trigger', { collection: c, scope: 'request:feed.frreq', request: 'touch.frreq', repeat: 'once', delay: 20 });
      expect(set.isError, set.text).toBe(false);
      expect(readAction(path.join(ws.folder, 'feed.frreq')).trigger).toMatchObject({ request: 'touch.frreq', repeat: 'once', delay: 20 });

      const tree = (await call('tree', { collection: c })).json();
      const feed = tree.children.find((n: { name: string }) => n.name === 'feed');
      expect(feed.websocket.trigger).toMatchObject({ request: 'touch.frreq', repeat: 'once', delay: 20 });
      expect(feed.websocket.expect).toMatchObject({ count: 1, match: 'all', schema: false });
      expect(tree.children.find((n: { name: string }) => n.name === 'touch').websocket).toBeUndefined();

      const shown = (await call('show_request', { collection: c, action: 'feed.frreq' })).json();
      expect(shown.websocket.trigger.request).toBe('touch.frreq');
      expect(shown.websocket.expect.timeout).toBeGreaterThan(0);

      const bad = await call('set_trigger', { collection: c, scope: 'request:feed.frreq', request: 'feed.frreq' });
      expect(bad.isError).toBe(true);

      expect((await call('set_trigger', { collection: c, scope: 'request:feed.frreq', clear: true })).isError).toBe(false);
      expect(readAction(path.join(ws.folder, 'feed.frreq')).trigger).toBeUndefined();
    } finally {
      ws.cleanup();
    }
  });
});

describe('the authoring loop over MCP', () => {
  it('creates a collection, learns a validation from a run, and the learnt check then catches a change', async () => {
    const ws = workspace();
    let payload: unknown = { error: 'not found', code: 404 };
    const api = await startApi(() => payload);
    const client = await connectMcp({ secrets: createSecretStore({}, undefined) });
    const call = (name: string, args: Record<string, unknown> = {}) => callTool(client, name, args);

    try {
      // 1. the collection, the request and the run, all through the tools
      expect((await call('new_collection', { file: ws.collection })).isError).toBe(false);
      expect((await call('new_request', {
        collection: ws.collection, path: 'notfound.frreq', method: 'get', url: api.url
      })).isError).toBe(false);
      expect((await call('new_run', {
        collection: ws.collection, request: 'notfound.frreq', name: 'not found'
      })).isError).toBe(false);

      // 2. nothing is being checked yet: the run inherits, and what it inherits is None
      const before = (await call('tree', { collection: ws.collection })).json();
      expect(before.children).toHaveLength(1);
      expect(before.children[0].runs).toEqual([
        { name: 'not found', validation: { type: 'Inherit', effective: 'None', schema: false } }
      ]);

      // 3. with no validation configured a 404 still passes, as it does today
      const first = (await call('run', { collection: ws.collection })).json();
      expect(first.problems).toEqual([]);
      expect(first.passed).toBe(1);
      expect(first.runId).toBeTruthy();

      // 4. learn the check from what came back, and look at what was actually written.
      // A passing case is not in run's own answer, so its index comes from run_summary; the
      // case is named for the request AND the run ('notfound › not found'), not the run alone.
      const cases = (await call('run_summary', { runId: first.runId })).json().cases;
      expect(cases.map((c: { name: string }) => c.name)).toEqual(['notfound › not found']);
      const learnt = await call('validation_from_case', {
        collection: ws.collection, scope: 'run:notfound.frreq#not found', case: cases[0].index, runId: first.runId
      });
      expect(learnt.isError, learnt.text).toBe(false);
      expect(learnt.json().changed).toBe(true);
      const run = readAction(path.join(ws.folder, 'notfound.frreq')).runs[0]!;
      expect(run.validation.httpCode).toBe(404);
      expect(run.validation.body).toBe('JsonSchema');
      const schema = JSON.parse(run.validation.jsonSchema!.schema) as { required: string[] };
      expect(schema.required.sort()).toEqual(['code', 'error']);

      // 5. the tree now reports a real body check, with nothing missing
      const after = (await call('tree', { collection: ws.collection })).json();
      expect(after.children[0].runs).toEqual([{ name: 'not found', validation: { type: 'Body', schema: true, status: 404 } }]);

      // 6. and it passes, this time because the response really matches the schema
      const second = (await call('run', { collection: ws.collection })).json();
      expect(second.problems).toEqual([]);
      expect(second.passed).toBe(1);

      // 7. drop a property the schema requires: the learnt check is what catches it
      payload = { error: 'not found' };
      const third = (await call('run', { collection: ws.collection })).json();
      expect(third.passed).toBe(0);
      expect(third.failed).toBe(1);
      expect(third.problems).toHaveLength(1);
      expect(third.problems[0].name).toBe('notfound › not found');
      expect(third.problems[0].failedChecks.map((c: { check: string }) => c.check)).toEqual(['body']);
      expect(third.problems[0].failedChecks[0].errors.join(' ')).toContain("must have required property 'code'");
    } finally {
      await api.stop();
      ws.cleanup();
    }
  });

  it('refuses a scope that points outside the collection folder, and writes nothing there', async () => {
    const ws = workspace();
    const client = await connectMcp({ secrets: createSecretStore({}, undefined) });

    try {
      await callTool(client, 'new_collection', { file: ws.collection });
      const result = await callTool(client, 'set_header', {
        collection: ws.collection, scope: 'request:../outside.frreq', name: 'x-key', value: 'v'
      });

      expect(result.isError).toBe(true);
      expect(result.text).toContain('outside the collection folder');
      expect(fs.existsSync(path.join(ws.folder, '..', 'outside.frreq'))).toBe(false);
      expect(fs.readdirSync(ws.folder)).toEqual(['api.frcol']);
    } finally {
      ws.cleanup();
    }
  });

  // AIF-11: the whole point of the reference-only fields - an agent wires up basic auth end to
  // end, and the collection file holds the reference while the value stays in the keychain.
  it('wires up a basicauth password with only a secret reference, and refuses a value', async () => {
    const ws = workspace();
    const keychain = memoryKeychain();
    const secrets = createSecretWriter(keychain);
    const client = await connectMcp({ secrets });

    try {
      await callTool(client, 'new_collection', { file: ws.collection });
      await callTool(client, 'add_secret_ref', { collection: ws.collection, scope: 'collection', name: 'apiPass' });

      const set = await callTool(client, 'set_auth', {
        collection: ws.collection, scope: 'collection', type: 'basicauth',
        userName: 'api', password: '{{$apiPass}}'
      });
      expect(set.isError).toBe(false);

      const stored = JSON.parse(fs.readFileSync(ws.collection, 'utf8')).collectionEnvironment.auth;
      expect(stored.authentication).toBe('basicauth');
      expect(stored.basicAuth).toEqual({ userName: 'api', password: '{{$apiPass}}' });

      // the value is refused outright, so there is no path by which it could reach the file
      const refused = await callTool(client, 'set_auth', {
        collection: ws.collection, scope: 'collection', type: 'basicauth', password: 'hunter2'
      });
      expect(refused.isError).toBe(true);
      expect(refused.text).toMatch(/password takes a secret reference/);
      expect(fs.readFileSync(ws.collection, 'utf8')).not.toContain('hunter2');
    } finally {
      ws.cleanup();
    }
  });

  it('settings names a secret reference and never its value', async () => {
    const ws = workspace();
    const keychain = memoryKeychain();
    const secrets = createSecretWriter(keychain);
    const client = await connectMcp({ secrets });

    try {
      await callTool(client, 'new_collection', { file: ws.collection });
      const added = await callTool(client, 'add_secret_ref', {
        collection: ws.collection, scope: 'collection', name: 'apikey'
      });
      expect(added.isError).toBe(false);

      // Put a value where the collection's own secret service would find it, so there is
      // genuinely something to leak; without this the assertion below would be vacuous.
      const guid = (JSON.parse(fs.readFileSync(ws.collection, 'utf8')) as { collectionGuid: string }).collectionGuid;
      await secrets.set(secretServiceForCollection(guid), 'apikey', 'sk-must-not-leak');
      const loaded = await loadTree(ws.collection, secrets);
      expect(loaded.config.collectionEnvironment.secrets[0]!.$value).toBe('sk-must-not-leak');

      const settings = await callTool(client, 'settings', { collection: ws.collection });
      expect(settings.isError).toBe(false);
      expect(settings.text).toContain('apikey');
      expect(settings.text).not.toContain('sk-must-not-leak');
      expect(settings.json().scopes[0]).toMatchObject({ scope: 'collection', secrets: ['apikey'] });
    } finally {
      ws.cleanup();
    }
  });
});

describe('multipart body and run url over MCP', () => {
  it('sets file parts (base64, size, local path) and a run url override', async () => {
    const ws = workspace();
    const client = await connectMcp({ secrets: createSecretStore({}, undefined) });
    const c = ws.collection;
    try {
      await callTool(client, 'new_collection', { file: c });
      await callTool(client, 'new_request', { collection: c, path: 'up.frreq', method: 'post', url: 'http://localhost/up' });
      await callTool(client, 'new_run', { collection: c, request: 'up.frreq', name: 'bad' });
      fs.writeFileSync(path.join(ws.folder, 'a.bin'), Buffer.from([1, 2, 3]));
      const body = await callTool(client, 'set_body', {
        collection: c, scope: 'request:up.frreq', contentType: 'multipart/form-data',
        fields: [{ name: 'k', value: 'v' }, { name: 'f', value: '', path: path.join(ws.folder, 'a.bin') }, { name: 'g', value: '', size: 9, filename: 'g.bin' }]
      });
      expect(body.isError).toBe(false);
      const parts = readAction(path.join(ws.folder, 'up.frreq')).body.body as { key: string; base64?: string; size?: number; filename?: string }[];
      expect(parts.map(p => p.key)).toEqual(['k', 'f', 'g']);
      expect(parts[1]).toMatchObject({ filename: 'a.bin', base64: 'AQID' });
      expect(parts[2]).toMatchObject({ filename: 'g.bin', size: 9 });

      const url = await callTool(client, 'set_url', { collection: c, scope: 'run:up.frreq#bad', url: 'http://localhost/other' });
      expect(url.isError).toBe(false);
      expect(readAction(path.join(ws.folder, 'up.frreq')).runs[0]).toMatchObject({ url: 'localhost/other', protocol: 'http' });
    } finally {
      ws.cleanup();
    }
  });
});
