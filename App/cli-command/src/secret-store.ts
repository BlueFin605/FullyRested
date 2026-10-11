import {
  CollectionNode, FolderNode, RequestNode, RunNode, SecretStore,
  parseLocator, resolveLocator, secretServiceForCollection, secretServiceForFolder, secretServiceForRequest
} from '@fullyrested/core';
import { UsageError } from './run';

// FULLYRESTED_SECRET_<name>: the secret's name upper-cased, anything not a letter or digit as '_'
export function secretEnvironmentVariable(name: string): string {
  return `FULLYRESTED_SECRET_${name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
}

type Keychain = { getPassword(service: string, account: string): Promise<string | null> };

// The same OS keychain entries the desktop app writes. Loaded lazily so a platform without a
// prebuilt @napi-rs/keyring binary still runs on environment variables; headless CI machines
// with no keychain service fail per lookup instead, which get() treats as "not found".
function loadKeychain(): Keychain | undefined {
  try {
    const { AsyncEntry } = require('@napi-rs/keyring') as typeof import('@napi-rs/keyring');
    return { getPassword: async (service, account) => (await new AsyncEntry(service, account).getPassword()) ?? null };
  } catch {
    return undefined;
  }
}

// Environment variables first, then the OS keychain the desktop app saves secrets in.
// The CLI never writes secrets.
export function createSecretStore(env: NodeJS.ProcessEnv = process.env, keychain: Keychain | undefined = loadKeychain()): SecretStore {
  return {
    async get(service: string, account: string): Promise<string | null> {
      const fromEnv = env[secretEnvironmentVariable(account)];
      if (fromEnv != undefined)
        return fromEnv;

      if (keychain == undefined)
        return null;

      try {
        return await keychain.getPassword(service, account);
      } catch {
        return null;
      }
    },
    async set(): Promise<void> {
      throw new Error('The CLI does not store secrets');
    }
  };
}

// The keychain surface `secret set` needs on top of the read-only Keychain above.
export type WritableKeychain = {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(service: string, account: string, value: string): Promise<void>;
};

// Loads @napi-rs/keyring's AsyncEntry the same lazy way loadKeychain() does, so a platform with
// no prebuilt binary for it still runs -- just with nowhere to write a secret to (see set() below).
function loadWritableKeychain(): WritableKeychain | undefined {
  try {
    const { AsyncEntry } = require('@napi-rs/keyring') as typeof import('@napi-rs/keyring');
    return {
      getPassword: async (service, account) => (await new AsyncEntry(service, account).getPassword()) ?? null,
      setPassword: async (service, account, value) => { await new AsyncEntry(service, account).setPassword(value); }
    };
  } catch {
    return undefined;
  }
}

// The only writable store: used solely by the `secret set` command. A separate factory from
// createSecretStore() above -- never a delegate to it and never built by making that one
// writable -- so every existing caller keeps a store whose set() still throws.
//
// Split from createSecretWriter() below so a test can force the no-keychain branch directly:
// `keychain` there defaults to loadWritableKeychain(), and JS applies that default on an
// explicit undefined argument exactly as it does on an omitted one, so a test cannot reach
// "no keychain" that way on a machine where @napi-rs/keyring actually loads (as it does here).
// Calling this one directly with undefined has no such default to collapse into.
export function secretWriterFor(keychain: WritableKeychain | undefined): SecretStore {
  return {
    async get(service: string, account: string): Promise<string | null> {
      if (keychain == undefined)
        return null;

      try {
        return await keychain.getPassword(service, account);
      } catch {
        return null;
      }
    },
    async set(service: string, account: string, value: string): Promise<void> {
      if (keychain == undefined)
        throw new Error(
          `No OS keychain is available on this machine. Set ${secretEnvironmentVariable(account)} instead.`
        );

      try {
        await keychain.setPassword(service, account, value);
      } catch {
        // Never surface the binding's own error text here: it is not something we control, and
        // `value` must never reach stdout/stderr by any path, including a rejected promise's message.
        throw new Error(`Could not store secret '${account}' in the OS keychain on this machine.`);
      }
    }
  };
}

// The public factory: with no keychain given, loads @napi-rs/keyring's AsyncEntry the same
// lazy way loadKeychain() does.
export function createSecretWriter(keychain: WritableKeychain | undefined = loadWritableKeychain()): SecretStore {
  return secretWriterFor(keychain);
}

// Resolves a `secret set --scope` locator to the keychain service name the authoring verbs use
// for it -- the same resolution editScope/secretServiceFor apply in core/src/authoring.ts:
// collection and env: -> the collection's service; folder: -> the folder's; request: and run: ->
// the request's. Reuses resolveLocator rather than re-deriving that mapping.
export function secretServiceForScope(root: CollectionNode, scope: string): string {
  const locator = parseLocator(scope);
  const resolved = resolveLocator(root, locator);

  // Only a folder: locator can be new: the folder has no folderId until add-secret-ref creates
  // folder.frfolder for it, so there is nothing yet to key the keychain entry on.
  if (resolved.isNew)
    throw new UsageError(
      `Folder '${locator.path}' has no secret reference yet. Add one first with: fullyrested edit add-secret-ref`
    );

  switch (resolved.document) {
    case 'collection':
      return secretServiceForCollection(root.config.collectionGuid);
    case 'folder':
      return secretServiceForFolder((resolved.node as FolderNode).config.folderId);
    case 'request': {
      const node = resolved.node as RequestNode | RunNode;
      const action = node instanceof RunNode ? node.request.action : node.action;
      return secretServiceForRequest(action.id);
    }
  }
}

// Strips exactly one trailing newline (\r\n or \n) from a value read from a pipe, so a value
// that itself contains a newline further along is kept whole, and one with none at all
// (`echo -n value | ...`) passes through unchanged.
export function stripTrailingNewline(text: string): string {
  if (text.endsWith('\r\n')) return text.slice(0, -2);
  if (text.endsWith('\n')) return text.slice(0, -1);
  return text;
}
