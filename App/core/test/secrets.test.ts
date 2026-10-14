import { describe, it, expect } from 'vitest';
import { SecretStore, loadSecrets, secretServiceForCollection, secretServiceForFolder, secretServiceForRequest, storeSecrets } from '../src';

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


  // loadSecrets writes $value: '' into every reference the store has no entry for, so keeping an empty
  // one meant opening a collection on a machine missing a keychain entry and saving added `"$value": ""`
  // to the file -- a field an agent-authored document never has (AIF-10)
  it('strips an empty $value instead of leaving it in the document', async () => {
    const stored = await storeSecrets(collection(), memoryStore().store, 'svc');
    expect(stored.environments[0].secrets[1]).toEqual({ $secret: 'unset', active: true, id: '3' });
    expect(stored.environments[0].secrets[1]).not.toHaveProperty('$value');
  });

  it('leaves no $value anywhere after a load-then-save with no keychain entries at all', async () => {
    // $value is optional in the document: loadSecrets is what fills it in on the way out of the file
    const input: { secrets: { $secret: string; active: boolean; id: string; $value?: string }[] } =
      { secrets: [{ $secret: 'missing', active: true, id: '1' }] };
    const loaded = await loadSecrets(input, memoryStore().store, 'svc');
    expect(loaded.secrets[0]!.$value).toBe('');

    const stored = await storeSecrets(loaded, memoryStore().store, 'svc');
    expect(JSON.stringify(stored)).not.toContain('$value');
  });

  it('still moves a plain-text value from an older file into the store', async () => {
    const { data, store } = memoryStore();
    const stored = await storeSecrets({ secrets: [{ $secret: 'legacy', $value: 'plain', active: true, id: '1' }] }, store, 'svc');
    expect(data.get('svc/legacy')).toBe('plain');
    expect(stored.secrets[0]).not.toHaveProperty('$value');
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

describe('secretServiceForFolder', () => {
    it('names the keychain service for a folder', () => {
        expect(secretServiceForFolder('f1')).toBe('fullyrested-folder-f1');
    });
});
