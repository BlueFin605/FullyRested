import { SecretStore } from '@fullyrested/core';

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
