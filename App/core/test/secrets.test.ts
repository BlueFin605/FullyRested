import { describe, it, expect } from 'vitest';
import { SecretStore, loadSecrets, secretServiceForCollection, secretServiceForRequest, storeSecrets } from '../src';

const memoryStore = () => {
  const data = new Map<string, string>();
  const store: SecretStore = {
    get: async (service, account) => data.get(`${service}/${account}`) ?? null,
    set: async (service, account, value) => { data.set(`${service}/${account}`, value); }
  };
  return { data, store };
};

// 'note: null' sits before the secrets on purpose: the old main.js loader stopped at the first null
const collection = () => ({
  collectionGuid: 'g1',
  note: null,
  collectionEnvironment: { secrets: [{ $secret: 'apiKey', $value: 'k1', active: true, id: '1' }] },
  environments: [{ secrets: [{ $secret: 'token', $value: 't1', active: true, id: '2' }, { $secret: 'unset', $value: '', active: true, id: '3' }] }]
});

describe('secret service names', () => {
  it('keeps the existing collection naming and adds one for requests', () => {
    expect(secretServiceForCollection('g1')).toBe('fullyrested-collection-g1');
    expect(secretServiceForRequest('r1')).toBe('fullyrested-request-r1');
  });
});

describe('storeSecrets', () => {
  it('moves every non-empty secret value into the store and strips it from the copy', async () => {
    const { data, store } = memoryStore();
    const stored = await storeSecrets(collection(), store, 'svc');

    expect(data.get('svc/apiKey')).toBe('k1');
    expect(data.get('svc/token')).toBe('t1');
    expect(data.has('svc/unset')).toBe(false);
    expect(JSON.stringify(stored)).not.toMatch(/k1|t1/);
    expect(stored.environments[0].secrets[0].$secret).toBe('token');
  });

  it('does not mutate its input', async () => {
    const input = collection();
    await storeSecrets(input, memoryStore().store, 'svc');
    expect(input.collectionEnvironment.secrets[0].$value).toBe('k1');
  });
});

describe('loadSecrets', () => {
  it('fills every secret value from the store, including ones after a null field', async () => {
    const { store } = memoryStore();
    const stored = await storeSecrets(collection(), store, 'svc');
    const loaded = await loadSecrets(stored, store, 'svc');

    expect(loaded.collectionEnvironment.secrets[0].$value).toBe('k1');
    expect(loaded.environments[0].secrets[0].$value).toBe('t1');
  });

  it('keeps a plain-text value from an older file when the store has none', async () => {
    const loaded = await loadSecrets(collection(), memoryStore().store, 'svc');
    expect(loaded.collectionEnvironment.secrets[0].$value).toBe('k1');
  });

  it('uses an empty string when neither the store nor the file has a value', async () => {
    const { store } = memoryStore();
    const stored = await storeSecrets(collection(), store, 'svc');
    const loaded = await loadSecrets(stored, memoryStore().store, 'svc');
    expect(loaded.environments[0].secrets[0].$value).toBe('');
  });
});
