import * as fs from 'fs';
import * as path from 'path';
import {
  CollectionNode, CollectionSink, CollectionSource, DirEntry, GuardHost, RestAction, SecretStore, guardedRealTarget,
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

// The file system primitives core's path guard needs. core is bundled into the Angular renderer too, so
// it cannot import node:fs or node:path itself; the walk that uses these lives in core and is shared with
// the desktop app's guard (collection-guard.ts).
const guardHost: GuardHost = {
  // existsSync() is false for a dangling symlink; lstat sees the link itself
  exists: target => {
    try {
      fs.lstatSync(target);
      return true;
    } catch {
      return false;
    }
  },
  realpath: target => fs.realpathSync.native(target),
  dirname: target => path.dirname(target),
  join: (base, ...rest) => path.join(base, ...rest),
};

// The real path of a target that need not exist yet. A symlink that cannot be followed (a dangling one)
// has no real path, so it is refused rather than written through.
function realTarget(full: string): string | undefined {
  return guardedRealTarget(guardHost, full);
}

function pathExists(target: string): boolean {
  return guardHost.exists(target);
}

// The collection folder on disk, for core's authoring verbs. Every path an agent names is confined to the
// folder: this is the CLI's only guard against a mistaken or malicious path reaching the rest of the disk.
export class FsCollectionSink implements CollectionSink {
  constructor(private readonly folder: string) { }

  async writeText(file: string, text: string): Promise<void> {
    const real = this.insideChild(file);
    fs.mkdirSync(path.dirname(real), { recursive: true });
    fs.writeFileSync(real, text); // exactly the bytes core produced: no encoding juggling, no added newline
  }

  async mkdir(dir: string): Promise<void> {
    fs.mkdirSync(this.inside(dir).real, { recursive: true });
  }

  async remove(target: string): Promise<void> {
    fs.rmSync(this.insideChild(target), { recursive: true, force: true });
  }

  async exists(target: string): Promise<boolean> {
    const full = this.argPath(target);
    const parent = path.dirname(full);
    // A dangling symlink has no real path of its own, yet it is an existing name inside the folder that a
    // new file would collide with, and core asks about exactly such collisions. Its parent still resolves,
    // so the guard is applied to that: a link reached from outside the folder is still refused.
    if (parent != full && pathExists(full) && realTarget(full) == undefined) {
      this.inside(parent, target);
      return true;
    }
    return fs.existsSync(this.inside(target).real);
  }

  // Something named within the collection, never the folder itself: removing that would take the whole
  // collection with it, and writing it would reach for the folder's own parent. The wording is the one
  // every refusal uses, so a caller never has to parse two shapes of message.
  private insideChild(p: string): string {
    const { real, relative } = this.inside(p);
    if (relative == '')
      throw new Error(`${p} is outside the collection folder`);
    return real;
  }

  // The one place the guard lives, so no method can forget it. The real path is what is checked and what is
  // returned, so the caller writes the very path that was verified rather than a lexical path that has to be
  // traversed through links a second time.
  private inside(p: string, reported: string = p): { real: string; relative: string } {
    const root = realTarget(path.resolve(this.folder));
    const real = realTarget(this.argPath(p));
    const relative = root == undefined || real == undefined ? undefined : relativePath(root, real);
    // relativePath ignores case and separator differences, which is right for the collection-relative paths
    // core hands it but far too loose for a security boundary: on a case-sensitive filesystem a sibling
    // folder differing only in case is a different directory. Requiring the relative path to rebuild the
    // real path exactly closes that, and the backslash variant with it. It costs nothing where the
    // filesystem really is case-insensitive: root and real both come from realpathSync.native, so their
    // case already agrees.
    if (relative == undefined || path.resolve(root!, relative) != real)
      throw new Error(`${reported} is outside the collection folder`);
    return { real: real!, relative };
  }

  // A collection-relative path becomes a host path; an argument that carries a root of its own (an absolute
  // path, a UNC share, a Windows drive letter) is resolved as given rather than appended, so it cannot be
  // smuggled past the comparison.
  private argPath(p: string): string {
    return path.resolve(path.parse(p).root == '' ? hostPath(this.folder, p) : p);
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
