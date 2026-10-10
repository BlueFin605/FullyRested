import * as fs from 'fs';
import * as path from 'path';
import {
  CollectionNode, CollectionSource, DirEntry, RestAction, SecretStore,
  hostPath, loadCollectionTree, loadSecrets, normaliseAction, secretServiceForRequest
} from '@fullyrested/core';

function readJson<T>(file: string): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch (error) {
    throw new Error(`Cannot read ${file}: ${(error as Error).message}`);
  }
}

// The collection folder on disk, for core's tree loader
export class FsCollectionSource implements CollectionSource {
  constructor(private readonly folder: string) { }

  async listDir(dir: string): Promise<DirEntry[]> {
    return fs.readdirSync(hostPath(this.folder, dir), { withFileTypes: true })
      .map(e => ({ name: e.name, isDirectory: e.isDirectory() }));
  }

  async readText(file: string): Promise<string> {
    return fs.readFileSync(hostPath(this.folder, file), 'utf8');
  }
}

export async function loadTree(collectionFile: string, store: SecretStore): Promise<CollectionNode> {
  const full = path.resolve(collectionFile);
  try {
    return await loadCollectionTree(path.basename(full), new FsCollectionSource(path.dirname(full)), store);
  } catch (error) {
    throw new Error(`Cannot read ${collectionFile}: ${(error as Error).message}`);
  }
}

export async function loadAction(file: string, store: SecretStore): Promise<RestAction> {
  const action = normaliseAction(readJson<RestAction>(file));
  return loadSecrets(action, store, secretServiceForRequest(action.id));
}
