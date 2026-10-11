import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { secretServiceForCollection, secretServiceForFolder, secretServiceForRequest } from '@fullyrested/core';
import { startFixture } from './fixture';
import { loadTree } from '../src/files';
import {
  WritableKeychain, createSecretStore, createSecretWriter, secretEnvironmentVariable, secretServiceForScope,
  secretWriterFor, stripTrailingNewline
} from '../src/secret-store';
import { UsageError } from '../src/run';

// Stands in for @napi-rs/keyring: a map of service -> account -> value, so a test can see
// exactly where createSecretWriter's set() landed a value without touching the real OS keychain.
function fakeKeychain(): { keychain: WritableKeychain; entries: Map<string, Map<string, string>> } {
  const entries = new Map<string, Map<string, string>>();
  const keychain: WritableKeychain = {
    async getPassword(service, account) {
      return entries.get(service)?.get(account) ?? null;
    },
    async setPassword(service, account, value) {
      (entries.get(service) ?? entries.set(service, new Map()).get(service)!).set(account, value);
    }
  };
  return { keychain, entries };
}

let fx: Awaited<ReturnType<typeof startFixture>>;

beforeEach(async () => {
  fx = await startFixture();
});

afterEach(() => fx.stop());

describe('secretServiceForScope', () => {
  // Step 1, case 1: each of the five locator kinds maps to the service the authoring verbs use.
  // Expected values come straight from core's own secretServiceFor* helpers (never re-derived),
  // against ids the fixture collection already carries: collectionGuid 'col-1', folder 'items'
  // with folderId 'items-folder', request 'items/ok.frreq' with id 'r-ok', and request
  // 'items/runs.frreq' (id 'r-runs') which owns run 'expects 404'.
  it.each([
    ['collection', () => secretServiceForCollection('col-1')],
    ['env:Dev', () => secretServiceForCollection('col-1')],
    ['folder:items', () => secretServiceForFolder('items-folder')],
    ['request:items/ok.frreq', () => secretServiceForRequest('r-ok')],
    ['run:items/runs.frreq#expects 404', () => secretServiceForRequest('r-runs')]
  ])('%s -> the same service editScope would write it under', async (scope, expected) => {
    const root = await loadTree(fx.collection, createSecretStore());
    expect(secretServiceForScope(root, scope)).toBe(expected());
  });

  // The same mapping, driven end to end through createSecretWriter with a fake keychain: set()
  // must land the value under the service secretServiceForScope names, for every locator kind.
  it('createSecretWriter.set stores under the resolved service, for every locator kind', async () => {
    const root = await loadTree(fx.collection, createSecretStore());
    const scopes: [string, string][] = [
      ['collection', secretServiceForCollection('col-1')],
      ['env:Dev', secretServiceForCollection('col-1')],
      ['folder:items', secretServiceForFolder('items-folder')],
      ['request:items/ok.frreq', secretServiceForRequest('r-ok')],
      ['run:items/runs.frreq#expects 404', secretServiceForRequest('r-runs')]
    ];

    for (const [scope, service] of scopes) {
      const { keychain, entries } = fakeKeychain();
      const writer = createSecretWriter(keychain);

      await writer.set(secretServiceForScope(root, scope), 'thename', 'thevalue');

      expect(entries.get(service)?.get('thename')).toBe('thevalue');
    }
  });

  // A folder: scope with no folder.frfolder yet has no folderId to key an entry on; the message
  // sends the user to the verb that creates one.
  it('a folder: scope with no folder.frfolder yet is a UsageError pointing at add-secret-ref', async () => {
    fs.mkdirSync(path.join(fx.folder, 'empty'));

    const root = await loadTree(fx.collection, createSecretStore());

    expect(() => secretServiceForScope(root, 'folder:empty')).toThrow(UsageError);
    expect(() => secretServiceForScope(root, 'folder:empty')).toThrow(/fullyrested edit add-secret-ref/);
  });
});

describe('createSecretStore', () => {
  // Step 1, case 2: the existing read-only store must still refuse to write.
  it('set still throws -- the CLI never writes secrets through the read-only store', async () => {
    const store = createSecretStore({}, undefined);
    await expect(store.set('service', 'name', 'value')).rejects.toThrow('The CLI does not store secrets');
  });
});

describe('createSecretWriter', () => {
  // Step 1, case 3: with no keychain, the error names the environment-variable alternative --
  // the only place left to put a secret on a headless machine -- and never a generic "not found".
  // Uses secretWriterFor directly (see its comment in secret-store.ts): createSecretWriter's own
  // default would auto-load the real keychain here, since @napi-rs/keyring actually works on
  // this machine, so passing it undefined would not reliably exercise the no-keychain branch.
  it('with no keychain available, set names FULLYRESTED_SECRET_<NAME> as the alternative', async () => {
    const writer = secretWriterFor(undefined);
    await expect(writer.set('service', 'api key', 'value')).rejects.toThrow(secretEnvironmentVariable('api key'));
  });

  it('get returns null with no keychain available, rather than throwing', async () => {
    const writer = secretWriterFor(undefined);
    await expect(writer.get('service', 'name')).resolves.toBeNull();
  });

  // A keychain binding failing must never surface its own error text: that text is not something
  // this code controls, and the value passed to set() must never reach it by any path.
  it('a keychain failure on set is reported without the binding error text or the value', async () => {
    const keychain: WritableKeychain = {
      async getPassword() { return null; },
      async setPassword() { throw new Error('native binding failure mentioning hunter2-the-value'); }
    };
    const writer = createSecretWriter(keychain);

    await expect(writer.set('service', 'name', 'hunter2-the-value')).rejects.toThrow(/Could not store secret/);
    await expect(writer.set('service', 'name', 'hunter2-the-value')).rejects.not.toThrow(/hunter2-the-value/);
  });
});

describe('stripTrailingNewline', () => {
  // The stdin behaviour this exists for: a piped value is read whole and only one trailing
  // newline is removed, so an interior newline (more value after it) survives, spaces survive,
  // and a value with no trailing newline at all (`echo -n`) passes through unchanged.
  it('removes exactly one trailing \\n', () => {
    expect(stripTrailingNewline('hunter2\n')).toBe('hunter2');
  });

  it('removes exactly one trailing \\r\\n', () => {
    expect(stripTrailingNewline('hunter2\r\n')).toBe('hunter2');
  });

  it('leaves a value with no trailing newline untouched (echo -n)', () => {
    expect(stripTrailingNewline('hunter2')).toBe('hunter2');
  });

  it('keeps spaces in the value intact', () => {
    expect(stripTrailingNewline('a value with spaces\n')).toBe('a value with spaces');
  });

  it('keeps a # in the value intact', () => {
    expect(stripTrailingNewline('value#withhash\n')).toBe('value#withhash');
  });

  it('keeps an interior newline -- only the trailing one is stripped', () => {
    expect(stripTrailingNewline('first line\nsecond line\n')).toBe('first line\nsecond line');
  });
});

// Runs the built CLI exactly as cli.test.ts does, so this exercises the real `secret set` command.
const cli = path.resolve(__dirname, '..', 'dist', 'index.js');

function fullyrested(args: string[], cwd: string): Promise<{ code: number; out: string; err: string }> {
  return new Promise(resolve => {
    execFile(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' }, (error, out, err) =>
      resolve({ code: error ? (error as { code?: number }).code ?? 1 : 0, out, err }));
  });
}

describe('fullyrested secret set', () => {
  const written: { service: string; account: string }[] = [];

  // Best-effort cleanup: on a machine with a real working keychain, a successful run above
  // actually wrote this entry to it. Remove it so the test leaves nothing behind.
  afterAll(async () => {
    if (written.length == 0) return;
    try {
      const { AsyncEntry } = require('@napi-rs/keyring') as typeof import('@napi-rs/keyring');
      for (const { service, account } of written)
        await new AsyncEntry(service, account).deletePassword();
    } catch {
      // no keychain to clean up from -- nothing was actually written
    }
  });

  // Step 1, case 4: whatever happens (a real keychain write, or none being available), the
  // value given with --value must never appear in stdout or stderr.
  it('never prints the value, on success or on failure', async () => {
    const value = 'cli-secret-super-value-xyz';
    const r = await fullyrested(['secret', 'set', '-c', fx.collection, '--scope', 'collection', '--name', 'apikey', '--value', value], fx.folder);

    expect(r.out).not.toContain(value);
    expect(r.err).not.toContain(value);

    if (r.code === 0) {
      written.push({ service: secretServiceForCollection('col-1'), account: 'apikey' });
      expect(r.out).toBe("Stored secret 'apikey' for collection\n(the reference itself is added with: fullyrested edit add-secret-ref …)\n");
      expect(r.err).toBe('');
    } else {
      // No working keychain on this machine (e.g. headless CI): the command still exits
      // cleanly, naming the environment-variable alternative instead of the secret value.
      expect(r.err).toContain(secretEnvironmentVariable('apikey'));
    }
  });
});
