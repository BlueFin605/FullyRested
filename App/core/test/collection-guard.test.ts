import { describe, it, expect } from 'vitest';
import { GuardHost, guardedRealTarget } from '../src';

// A fake POSIX-ish filesystem: `links` maps a path to what it points at (undefined = dangling), `dirs`
// and `files` are the names that exist. Keeps the escape cases readable without touching a real disk --
// and core has no fs to touch, which is why the host primitives are injected in the first place.
function host(tree: { dirs?: string[]; files?: string[]; links?: Record<string, string | undefined> }): GuardHost {
  const dirs = new Set(['/', ...(tree.dirs ?? [])]);
  const files = new Set(tree.files ?? []);
  const links = tree.links ?? {};

  const resolve = (path: string, depth = 0): string => {
    if (depth > 10) throw new Error('ELOOP');
    // resolve the longest ancestor that is a link, then re-resolve what it points at
    for (let at = path; at !== '/'; at = parent(at)) {
      if (!(at in links)) continue;
      const target = links[at];
      if (target === undefined) throw new Error('ENOENT'); // dangling: no real path exists
      return resolve(target + path.slice(at.length), depth + 1);
    }
    if (!dirs.has(path) && !files.has(path)) throw new Error('ENOENT');
    return path;
  };

  const parent = (p: string) => {
    const cut = p.replace(/\/+$/, '').lastIndexOf('/');
    return cut <= 0 ? '/' : p.slice(0, cut);
  };

  return {
    exists: p => dirs.has(p) || files.has(p) || p in links, // lstat: a dangling link still exists
    realpath: resolve,
    dirname: parent,
    join: (base, ...rest) => (base === '/' ? '' : base) + '/' + rest.join('/'),
  };
}

describe('guardedRealTarget', () => {
  it('resolves a path that already exists', () => {
    const fs = host({ dirs: ['/c'], files: ['/c/a.frreq'] });
    expect(guardedRealTarget(fs, '/c/a.frreq')).toBe('/c/a.frreq');
  });

  it('resolves a name not created yet against its existing parent', () => {
    const fs = host({ dirs: ['/c'] });
    expect(guardedRealTarget(fs, '/c/new.frreq')).toBe('/c/new.frreq');
  });

  it('appends every segment still to be created, not only the last', () => {
    const fs = host({ dirs: ['/c'] });
    expect(guardedRealTarget(fs, '/c/a/b/new.frreq')).toBe('/c/a/b/new.frreq');
  });

  it('follows an existing file through a symlink, so the real target is what is compared', () => {
    const fs = host({ dirs: ['/c', '/outside'], files: ['/outside/secret'], links: { '/c/link': '/outside/secret' } });
    expect(guardedRealTarget(fs, '/c/link')).toBe('/outside/secret');
  });

  it('follows a symlinked parent, so a name under it resolves outside the folder', () => {
    const fs = host({ dirs: ['/c', '/outside'], links: { '/c/sub': '/outside' } });
    expect(guardedRealTarget(fs, '/c/sub/new.frreq')).toBe('/outside/new.frreq');
  });

  it('follows a symlinked grandparent, which realpathing only the immediate parent would miss', () => {
    const fs = host({ dirs: ['/c', '/outside'], links: { '/c/sub': '/outside' } });
    expect(guardedRealTarget(fs, '/c/sub/a/b/new.frreq')).toBe('/outside/a/b/new.frreq');
  });

  // The defect this helper exists for: existsSync reports a dangling link as ABSENT, so the old app guard
  // stepped past the link, took it for a not-yet-created plain name, and the write landed at the link's
  // outside target. exists() is lstat-based here, and an unresolvable path is refused outright.
  it('refuses a dangling symlink rather than treating it as a name not yet created', () => {
    const fs = host({ dirs: ['/c'], links: { '/c/dead': undefined } });
    expect(guardedRealTarget(fs, '/c/dead')).toBeUndefined();
  });

  it('refuses a name under a dangling symlink', () => {
    const fs = host({ dirs: ['/c'], links: { '/c/dead': undefined } });
    expect(guardedRealTarget(fs, '/c/dead/new.frreq')).toBeUndefined();
  });

  it('refuses a path whose ancestor cannot be resolved at all', () => {
    const fs = host({ dirs: ['/c'], links: { '/c/loop': '/c/loop/self' } });
    expect(guardedRealTarget(fs, '/c/loop/x')).toBeUndefined();
  });

  it('returns undefined when not even the root exists, rather than looping', () => {
    const empty: GuardHost = {
      exists: () => false,
      realpath: p => p,
      dirname: () => '/',
      join: (base, ...rest) => base + '/' + rest.join('/'),
    };
    expect(guardedRealTarget(empty, '/c/a')).toBeUndefined();
  });
});
