import * as fs from 'fs';
import * as path from 'path';
import {
  CollectionNode, CollectionSink, CollectionSource, DirEntry, RestAction, SecretStore,
  hostPath, loadCollectionTree, loadSecrets, normaliseAction, relativePath, secretServiceForRequest
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

// The real path of a target that need not exist yet: the nearest existing ancestor is followed through
// any symlink, and the segments still to be created are appended to it. A symlink that cannot be followed
// (a dangling one) has no real path, so it is refused rather than written through.
function realTarget(full: string): string | undefined {
  const missing: string[] = [];
  let at = full;
  while (!pathExists(at)) {
    const parent = path.dirname(at);
    if (parent == at)
      return undefined; // not even the filesystem root exists: nothing to compare against
    missing.unshift(path.basename(at));
    at = parent;
  }
  try {
    return path.join(fs.realpathSync.native(at), ...missing);
  } catch {
    return undefined;
  }
}

// existsSync() is false for a dangling symlink; lstat sees the link itself
function pathExists(target: string): boolean {
  try {
    fs.lstatSync(target);
    return true;
  } catch {
    return false;
  }
}

// The collection folder on disk, for core's authoring verbs. Every path an agent names is confined to the
// folder: this is the CLI's only guard against a mistaken or malicious path reaching the rest of the disk.
export class FsCollectionSink implements CollectionSink {
  constructor(private readonly folder: string) { }

  async writeText(file: string, text: string): Promise<void> {
    const full = this.insideChild(file);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, text); // exactly the bytes core produced: no encoding juggling, no added newline
  }

  async mkdir(dir: string): Promise<void> {
    fs.mkdirSync(this.inside(dir).full, { recursive: true });
  }

  async remove(target: string): Promise<void> {
    fs.rmSync(this.insideChild(target), { recursive: true, force: true });
  }

  async exists(target: string): Promise<boolean> {
    return fs.existsSync(this.inside(target).full);
  }

  // Something named within the collection, never the folder itself: removing that would take the whole
  // collection with it, and writing it would reach for the folder's own parent.
  private insideChild(p: string): string {
    const { full, relative } = this.inside(p);
    if (relative == '')
      throw new Error(`${p} is the collection folder`);
    return full;
  }

  // The one place the guard lives, so no method can forget it. A collection-relative path becomes a host
  // path; an argument that carries a root of its own (an absolute path, a UNC share, a Windows drive letter)
  // is resolved as given rather than appended, so it cannot be smuggled past the comparison.
  private inside(p: string): { full: string; relative: string } {
    const full = path.resolve(path.parse(p).root == '' ? hostPath(this.folder, p) : p);
    const root = realTarget(path.resolve(this.folder));
    const real = realTarget(full);
    const relative = root == undefined || real == undefined ? undefined : relativePath(root, real);
    if (relative == undefined)
      throw new Error(`${p} is outside the collection folder`);
    return { full, relative };
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
