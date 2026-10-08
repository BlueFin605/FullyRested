import { SecretStore } from '@fullyrested/core';

// FULLYRESTED_SECRET_<name>: the secret's name upper-cased, anything not a letter or digit as '_'
export function secretEnvironmentVariable(name: string): string {
  return `FULLYRESTED_SECRET_${name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
}

type Keychain = { getPassword(service: string, account: string): Promise<string | null> };

// keytar is optional: it needs a desktop keychain, which headless CI machines don't have
function loadKeychain(): Keychain | undefined {
  try {
    return require('keytar') as Keychain;
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
