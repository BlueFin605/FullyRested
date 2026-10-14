// The path guard both hosts share: the one piece of the collection-folder check that is pure decision
// logic rather than file system access.
//
// core is bundled into the Angular renderer as well as the CLI, so it cannot import node:fs or node:path.
// The host passes those four primitives in; what lives here is the part that was wrong in one host and
// right in the other -- resolving a path that need not exist yet without stepping through a dangling
// symlink.
//
// Deliberately NOT shared: how a host decides "inside". The desktop app compares with a case-sensitive
// path.relative, the CLI requires the relative path to rebuild the real path exactly. Both are stricter
// than core's relativePath(), which lowercases both sides -- right for the collection-relative paths core
// hands around, far too loose for a security boundary.
export interface GuardHost {
  // True when the name exists, the link itself and not its target: lstat, never stat or existsSync.
  // existsSync reports a dangling symlink as absent, which is the whole bug this guard closes.
  exists(path: string): boolean;
  // The fully resolved path, following every symlink. Throws when it cannot be resolved.
  realpath(path: string): string;
  dirname(path: string): string;
  join(base: string, ...rest: string[]): string;
}

/**
 * The real path of a target that need not exist yet: the nearest existing ancestor is followed through any
 * symlink and the segments still to be created are appended to it.
 *
 * Returns undefined when there is no real path to compare against -- a dangling symlink, or a parent that
 * cannot be resolved. A caller must treat that as a refusal, never as "not created yet": deciding
 * existence with existsSync instead reports a dead link as absent, so the guard steps past the link,
 * takes it for a plain name, and the write lands wherever the link pointed, outside the folder.
 */
export function guardedRealTarget(host: GuardHost, full: string): string | undefined {
  const missing: string[] = [];
  let at = full;
  while (!host.exists(at)) {
    const parent = host.dirname(at);
    if (parent === at)
      return undefined; // not even the filesystem root exists: nothing to compare against
    missing.unshift(basename(at, parent));
    at = parent;
  }
  try {
    return missing.length === 0 ? host.realpath(at) : host.join(host.realpath(at), ...missing);
  } catch {
    return undefined; // a dangling link, or an ancestor that cannot be resolved
  }
}

// The last segment of `full`, given its parent. Taken by length rather than by splitting on a separator
// so it holds for whatever separator the host's dirname uses, and so a trailing separator cannot turn
// into an empty segment.
function basename(full: string, parent: string): string {
  const base = full.slice(parent.length).replace(/^[\\/]+/, '');
  return base === '' ? full : base;
}
