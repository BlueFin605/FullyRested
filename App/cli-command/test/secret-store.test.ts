import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFile } from 'node:child_process';
import { Readable, Writable } from 'node:stream';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { secretServiceForCollection, secretServiceForFolder, secretServiceForRequest } from '@fullyrested/core';
import { startFixture } from './fixture';
import { loadTree } from '../src/files';
import {
  WritableKeychain, createSecretStore, createSecretWriter, secretEnvironmentVariable, secretServiceForScope,
  stripTrailingNewline
} from '../src/secret-store';
import { formatSecretSetSuccess, promptHidden } from '../src/index';
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

  // A folder.frfolder that exists but was hand-written with no folderId yet (tree.ts:70
  // contemplates exactly this) has nothing to key an entry on either -- same message as isNew,
  // rather than silently writing under 'fullyrested-folder-' where add-secret-ref would never
  // look for it.
  it('a folder: scope whose folder.frfolder has no folderId yet is the same UsageError', async () => {
    fs.mkdirSync(path.join(fx.folder, 'blank'));
    fs.writeFileSync(path.join(fx.folder, 'blank', 'folder.frfolder'), JSON.stringify({
      folderId: '', variables: [], secrets: [], auth: { authentication: 'inherit' }, headers: []
    }));

    const root = await loadTree(fx.collection, createSecretStore());

    expect(() => secretServiceForScope(root, 'folder:blank')).toThrow(UsageError);
    expect(() => secretServiceForScope(root, 'folder:blank')).toThrow(/fullyrested edit add-secret-ref/);
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
  // Passes undefined explicitly (see createSecretWriter's comment in secret-store.ts): calling
  // createSecretWriter() with no argument at all would auto-load the real keychain here, since
  // @napi-rs/keyring actually works on this machine, so that would not reliably exercise the
  // no-keychain branch. This is also, deterministically and on every machine, the "no-keychain
  // message" half of what the old end-to-end CLI test below could only assert on a machine
  // without a working keychain.
  it('with no keychain available, set names FULLYRESTED_SECRET_<NAME> as the alternative', async () => {
    const writer = createSecretWriter(undefined);
    await expect(writer.set('service', 'api key', 'value')).rejects.toThrow(secretEnvironmentVariable('api key'));
  });

  it('get returns null with no keychain available, rather than throwing', async () => {
    const writer = createSecretWriter(undefined);
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

// Finding 1: this is the most security-relevant branch of `secret set` -- it must never echo a
// typed character back to the screen -- and before this test it was verified only by reading the
// code, because it hardcoded process.stdin/process.stdout. Injecting in-memory streams lets this
// assert the no-echo behaviour directly instead.
describe('promptHidden', () => {
  function recordingOutput() {
    const chunks: string[] = [];
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(chunk.toString());
        callback();
      }
    });
    return { stream, written: () => chunks.join('') };
  }

  // A plain Readable, not a real TTY -- terminal: true makes readline treat it as one regardless,
  // which is what lets this run outside an actual terminal at all.
  function typedInput(): Readable {
    return new Readable({ read() {} });
  }

  it('writes the prompt to output but never the typed characters', async () => {
    const input = typedInput();
    const { stream: output, written } = recordingOutput();

    const answer = promptHidden('Secret value: ', input, output);
    input.push('hunter2-the-value');
    input.push('\r');

    await expect(answer).resolves.toBe('hunter2-the-value');
    expect(written()).toContain('Secret value: ');
    expect(written()).not.toContain('hunter2-the-value');
  });

  it('closes the readline interface on an input error, instead of leaving it open', async () => {
    const input = typedInput();
    const { stream: output } = recordingOutput();

    const answer = promptHidden('Secret value: ', input, output);
    input.emit('error', new Error('boom'));

    await expect(answer).rejects.toThrow('boom');
  });
});

describe('formatSecretSetSuccess', () => {
  // The exact wording `secret set` prints on success, asserted directly and deterministically --
  // no process spawn, no keychain, real or fake.
  it('names the secret and the scope, and points at add-secret-ref for the reference', () => {
    expect(formatSecretSetSuccess('apikey', 'collection')).toBe(
      "Stored secret 'apikey' for collection\n(the reference itself is added with: fullyrested edit add-secret-ref …)"
    );
  });
});

// Runs the built CLI exactly as cli.test.ts does, so this exercises the real `secret set` command
// end to end -- but only on a path that fails in setup(), before createSecretWriter() is ever
// called, so it can never reach a real keychain (write or otherwise). The success wording and the
// no-keychain message are asserted deterministically instead, above and in the createSecretWriter
// tests, against a fake keychain -- see their comments for why an end-to-end assertion of either
// can't be made to behave the same way on every machine without one.
describe('fullyrested secret set', () => {
  const cli = path.resolve(__dirname, '..', 'dist', 'index.js');

  function fullyrested(args: string[], cwd: string): Promise<{ code: number; out: string; err: string }> {
    return new Promise(resolve => {
      execFile(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' }, (error, out, err) =>
        resolve({ code: error ? (error as { code?: number }).code ?? 1 : 0, out, err }));
    });
  }

  it('never prints the value, on a failure that never reaches the keychain', async () => {
    const value = 'cli-secret-super-value-xyz';
    const r = await fullyrested(
      ['secret', 'set', '-c', fx.collection, '--scope', 'folder:does-not-exist', '--name', 'apikey', '--value', value],
      fx.folder
    );

    expect(r.code).toBe(2);
    expect(r.out).not.toContain(value);
    expect(r.err).not.toContain(value);
    expect(r.err).toContain("Folder 'does-not-exist' not found");
  });

  // Step 7: an empty value (closed-but-empty stdin, or --value '') must not be stored silently.
  it('refuses an empty --value with a UsageError, without ever calling the keychain', async () => {
    const r = await fullyrested(
      ['secret', 'set', '-c', fx.collection, '--scope', 'collection', '--name', 'apikey', '--value', ''],
      fx.folder
    );

    expect(r.code).toBe(2);
    expect(r.err).toContain('Secret value must not be empty');
  });
});
