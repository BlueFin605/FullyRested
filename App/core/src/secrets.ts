// Where secret values live instead of the collection / request files (the OS keychain in the desktop app)
export interface SecretStore {
  get(service: string, account: string): Promise<string | null>;
  set(service: string, account: string, value: string): Promise<void>;
}

// Must stay the same: existing keychain entries were saved under this name
export function secretServiceForCollection(collectionGuid: string): string {
  return `fullyrested-collection-${collectionGuid}`;
}

export function secretServiceForRequest(requestId: string): string {
  return `fullyrested-request-${requestId}`;
}

// Returns a copy of value with every non-empty { $secret, $value } moved into the store (the $value is removed)
export async function storeSecrets<T>(value: T, store: SecretStore, service: string): Promise<T> {
  const copy = JSON.parse(JSON.stringify(value)) as T;
  await visitObjects(copy, async entry => {
    const name = entry['$secret'];
    const secret = entry['$value'];
    if (typeof name == 'string' && name != '' && typeof secret == 'string' && secret != '') {
      await store.set(service, name, secret);
      delete entry['$value'];
    }
  });
  return copy;
}

// Returns a copy of value with every { $secret } given its $value from the store.
// When the store has none, a $value already in the file is kept (older files saved secrets in plain text;
// the next save moves them into the store), otherwise it becomes ''.
export async function loadSecrets<T>(value: T, store: SecretStore, service: string): Promise<T> {
  const copy = JSON.parse(JSON.stringify(value)) as T;
  await visitObjects(copy, async entry => {
    const name = entry['$secret'];
    if (typeof name == 'string' && name != '')
      entry['$value'] = (await store.get(service, name)) ?? entry['$value'] ?? '';
  });
  return copy;
}

async function visitObjects(value: unknown, visit: (entry: { [key: string]: unknown }) => Promise<void>): Promise<void> {
  if (Array.isArray(value)) {
    for (const item of value)
      await visitObjects(item, visit);
    return;
  }

  if (value === null || typeof value != 'object')
    return;

  const entry = value as { [key: string]: unknown };
  await visit(entry);
  for (const child of Object.values(entry))
    await visitObjects(child, visit);
}
