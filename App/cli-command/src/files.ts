import * as fs from 'fs';
import * as path from 'path';
import {
  ACTION_FILE_EXTENSIONS, CollectionConfig, RestAction, SecretStore,
  loadSecrets, normaliseAction, normaliseCollectionConfig, secretServiceForCollection, secretServiceForRequest
} from '@fullyrested/core';

function readJson<T>(file: string): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch (error) {
    throw new Error(`Cannot read ${file}: ${(error as Error).message}`);
  }
}

export async function loadCollection(file: string, store: SecretStore): Promise<CollectionConfig> {
  const config = normaliseCollectionConfig(readJson<CollectionConfig>(file));
  return loadSecrets(config, store, secretServiceForCollection(config.collectionGuid));
}

export async function loadAction(file: string, store: SecretStore): Promise<RestAction> {
  const action = normaliseAction(readJson<RestAction>(file));
  return loadSecrets(action, store, secretServiceForRequest(action.id));
}

// Every request file under the collection's folder, in a stable order
export function findActionFiles(folder: string): string[] {
  const found: string[] = [];
  const visit = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name != 'node_modules')
        visit(full);
      else if (entry.isFile() && ACTION_FILE_EXTENSIONS.includes(path.extname(entry.name).toLowerCase()))
        found.push(full);
    }
  };
  visit(folder);
  return found;
}
