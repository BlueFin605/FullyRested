import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { FsCollectionSink } from '../src/files';

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frsink-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

// Symlink creation needs privileges on some Windows setups; a junction needs none there, and symlinks work
// on POSIX, so on no supported platform should both fail. A failure is therefore a real one: it is reported
// rather than swallowed, because a silently skipped security test passes while proving nothing.
function makeLink(target: string, link: string): void {
  const failures: string[] = [];
  for (const type of ['dir', 'junction'] as const) {
    try {
      fs.symlinkSync(target, link, type);
      return;
    } catch (error) {
      failures.push(`${type}: ${(error as Error).message}`);
    }
  }
  throw new Error(`Cannot link ${link} -> ${target}; ${failures.join('; ')}`);
}

// Windows can mark a single NTFS folder case-sensitive, which lets the case-sensitivity test run for real
// here and not only on POSIX CI. It needs the WSL optional component, so a failure is expected and simply
// leaves the folder case-insensitive; the caller handles both.
function makeCaseSensitive(folder: string): void {
  if (process.platform != 'win32')
    return;
  try {
    execFileSync('fsutil', ['file', 'setCaseSensitiveInfo', folder, 'enable'], { stdio: 'ignore' });
  } catch {
    // not available: the test falls back to its case-insensitive expectations
  }
}

describe('FsCollectionSink', () => {
  it('writes a file, creating its parent directory, with the exact bytes given', async () => {
    const sink = new FsCollectionSink(dir);
    await sink.writeText('users/get.frreq', '{\n    "id": "r1"\n}');
    expect(fs.readFileSync(path.join(dir, 'users', 'get.frreq'), 'utf8')).toBe('{\n    "id": "r1"\n}');
  });

  it('reports existence, makes directories and removes recursively', async () => {
    const sink = new FsCollectionSink(dir);
    expect(await sink.exists('users')).toBe(false);
    await sink.mkdir('users/admin');
    expect(await sink.exists('users/admin')).toBe(true);
    await sink.writeText('users/admin/get.frreq', '{}');
    await sink.remove('users');
    expect(await sink.exists('users')).toBe(false);
  });

  it('refuses a path that escapes the collection folder, and writes nothing', async () => {
    const sink = new FsCollectionSink(dir);
    const outside = path.join(dir, '..', 'escaped.frreq');
    await expect(sink.writeText('../escaped.frreq', '{}')).rejects.toThrow(/outside the collection folder/);
    await expect(sink.writeText(path.resolve(dir, '..', 'escaped.frreq'), '{}')).rejects.toThrow(/outside/);
    await expect(sink.remove('../')).rejects.toThrow(/outside/);
    expect(fs.existsSync(outside)).toBe(false);
  });

  it('refuses a symlinked directory that points out of the folder', async () => {
    const away = fs.mkdtempSync(path.join(os.tmpdir(), 'fraway-'));
    try {
      makeLink(away, path.join(dir, 'link'));
      const sink = new FsCollectionSink(dir);
      await expect(sink.writeText('link/escaped.frreq', '{}')).rejects.toThrow(/outside/);
      expect(fs.existsSync(path.join(away, 'escaped.frreq'))).toBe(false);
    } finally {
      fs.rmSync(away, { recursive: true, force: true });
    }
  });

  // Beyond the four above: the guard has to hold for every method and every shape of argument

  it('guards every method, not just writeText', async () => {
    const sink = new FsCollectionSink(dir);
    const outside = path.resolve(dir, '..', 'escaped-all');
    await expect(sink.mkdir('../escaped-all')).rejects.toThrow(/outside the collection folder/);
    await expect(sink.remove('../escaped-all')).rejects.toThrow(/outside the collection folder/);
    await expect(sink.exists('../escaped-all')).rejects.toThrow(/outside the collection folder/);
    await expect(sink.mkdir(outside)).rejects.toThrow(/outside/);
    await expect(sink.remove(outside)).rejects.toThrow(/outside/);
    await expect(sink.exists(outside)).rejects.toThrow(/outside/);
    expect(fs.existsSync(outside)).toBe(false);
  });

  it('refuses a deep escape whose leading segments do not exist', async () => {
    const sink = new FsCollectionSink(dir);
    const outside = path.resolve(dir, '..', 'deep-escape');
    await expect(sink.writeText('a/b/../../../deep-escape/c/d.frreq', '{}')).rejects.toThrow(/outside/);
    expect(fs.existsSync(outside)).toBe(false);
    expect(fs.existsSync(path.join(dir, 'a'))).toBe(false);
  });

  it('refuses a sibling folder whose name merely starts with the collection folder name', async () => {
    const sibling = `${dir}-backup`;
    fs.mkdirSync(sibling, { recursive: true });
    try {
      const sink = new FsCollectionSink(dir);
      await expect(sink.writeText(`../${path.basename(sibling)}/escaped.frreq`, '{}')).rejects.toThrow(/outside/);
      await expect(sink.writeText(path.join(sibling, 'escaped.frreq'), '{}')).rejects.toThrow(/outside/);
      expect(fs.readdirSync(sibling)).toEqual([]);
    } finally {
      fs.rmSync(sibling, { recursive: true, force: true });
    }
  });

  it('refuses a sibling folder whose name differs from the collection folder only in case', async () => {
    // A case-insensitive filesystem makes <dir>/coll and <dir>/COLL one folder, so the escape cannot be
    // staged there and the assertion is that the (genuinely inside) write still works. Where the two names
    // are two folders — Linux and macOS CI, or an NTFS folder with the case-sensitive attribute set, which
    // is attempted below so Windows gets the real test too — the write must be refused.
    const coll = path.join(dir, 'coll');
    const other = path.join(dir, 'COLL');
    makeCaseSensitive(dir);
    fs.mkdirSync(coll, { recursive: true });
    const oneFolder = fs.existsSync(other);
    if (!oneFolder)
      fs.mkdirSync(other, { recursive: true });

    const sink = new FsCollectionSink(coll);
    if (oneFolder) {
      await sink.writeText(path.join(other, 'inside.frreq'), '{}');
      expect(fs.readFileSync(path.join(coll, 'inside.frreq'), 'utf8')).toBe('{}');
    } else {
      await expect(sink.writeText(path.join(other, 'escaped.frreq'), '{}')).rejects.toThrow(/outside/);
      await expect(sink.writeText('../COLL/escaped.frreq', '{}')).rejects.toThrow(/outside/);
      await expect(sink.mkdir(path.join(other, 'escaped'))).rejects.toThrow(/outside/);
      await expect(sink.remove(path.join(other, 'escaped.frreq'))).rejects.toThrow(/outside/);
      expect(fs.readdirSync(other)).toEqual([]);
    }
  });

  it('reports a dangling symlink inside the folder as existing rather than refusing it', async () => {
    makeLink(path.join(dir, 'gone'), path.join(dir, 'dead.frreq'));
    const sink = new FsCollectionSink(dir);
    // core checks exists() for name collisions: a dead link is a name that collides, not an escape
    expect(await sink.exists('dead.frreq')).toBe(true);
    expect(await sink.exists('alive.frreq')).toBe(false);
    // writing or removing it is still refused: there is no real path to confine
    await expect(sink.writeText('dead.frreq', '{}')).rejects.toThrow(/outside/);
  });

  it('refuses a dangling symlink outside the folder even when only its existence is asked', async () => {
    const away = fs.mkdtempSync(path.join(os.tmpdir(), 'fraway-'));
    try {
      makeLink(path.join(away, 'gone'), path.join(away, 'dead.frreq'));
      const sink = new FsCollectionSink(dir);
      await expect(sink.exists(path.join(away, 'dead.frreq'))).rejects.toThrow(/outside/);
    } finally {
      fs.rmSync(away, { recursive: true, force: true });
    }
  });

  it('refuses to write or remove the collection folder itself with the standard wording', async () => {
    const sink = new FsCollectionSink(dir);
    for (const self of ['', '.', './', path.resolve(dir)]) {
      await expect(sink.writeText(self, '{}')).rejects.toThrow(/outside the collection folder/);
      await expect(sink.remove(self)).rejects.toThrow(/outside the collection folder/);
    }
    // mkdir of the folder itself names something inside it, so it is a harmless no-op rather than a refusal
    await sink.mkdir('');
    expect(fs.existsSync(dir)).toBe(true);
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('refuses writing through a symlinked directory several levels below an existing one', async () => {
    const away = fs.mkdtempSync(path.join(os.tmpdir(), 'fraway-'));
    try {
      fs.mkdirSync(path.join(dir, 'real'), { recursive: true });
      makeLink(away, path.join(dir, 'real', 'out'));
      const sink = new FsCollectionSink(dir);
      await expect(sink.writeText('real/out/x/y/escaped.frreq', '{}')).rejects.toThrow(/outside/);
      await expect(sink.mkdir('real/out/x/y')).rejects.toThrow(/outside/);
      await expect(sink.remove('real/out')).rejects.toThrow(/outside/);
      expect(fs.readdirSync(away)).toEqual([]);
    } finally {
      fs.rmSync(away, { recursive: true, force: true });
    }
  });

  it('refuses a dangling symlink rather than following it out of the folder', async () => {
    const away = fs.mkdtempSync(path.join(os.tmpdir(), 'fraway-'));
    const gone = path.join(away, 'gone');
    try {
      makeLink(gone, path.join(dir, 'dangling'));
      const sink = new FsCollectionSink(dir);
      await expect(sink.writeText('dangling/escaped.frreq', '{}')).rejects.toThrow(/outside/);
      await expect(sink.writeText('dangling', '{}')).rejects.toThrow(/outside/);
      expect(fs.existsSync(gone)).toBe(false);
    } finally {
      fs.rmSync(away, { recursive: true, force: true });
    }
  });

  it('refuses to remove the collection folder itself', async () => {
    const sink = new FsCollectionSink(dir);
    await sink.writeText('keep.frreq', '{}');
    for (const self of ['', '.', './', path.resolve(dir)]) {
      await expect(sink.remove(self)).rejects.toThrow(/collection folder/);
    }
    expect(fs.existsSync(dir)).toBe(true);
    expect(fs.existsSync(path.join(dir, 'keep.frreq'))).toBe(true);
  });

  it('treats the collection folder itself as existing', async () => {
    const sink = new FsCollectionSink(dir);
    expect(await sink.exists('')).toBe(true);
    expect(await sink.exists('.')).toBe(true);
  });

  it('writes through a collection folder that is itself reached by a symlink', async () => {
    const inner = path.join(dir, 'inner');
    fs.mkdirSync(inner, { recursive: true });
    const alias = path.join(dir, 'alias');
    makeLink(inner, alias);
    const sink = new FsCollectionSink(alias);
    await sink.writeText('users/get.frreq', '{}');
    expect(fs.readFileSync(path.join(inner, 'users', 'get.frreq'), 'utf8')).toBe('{}');
    await expect(sink.writeText('../escaped.frreq', '{}')).rejects.toThrow(/outside/);
    expect(fs.existsSync(path.join(dir, 'escaped.frreq'))).toBe(false);
  });

  it.runIf(process.platform == 'win32')('refuses Windows drive-relative and UNC arguments', async () => {
    const sink = new FsCollectionSink(dir);
    await expect(sink.writeText('C:escaped.frreq', '{}')).rejects.toThrow(/outside/);
    await expect(sink.writeText('\\\\server\\share\\escaped.frreq', '{}')).rejects.toThrow(/outside/);
    await expect(sink.writeText('/windows/escaped.frreq', '{}')).rejects.toThrow(/outside/);
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it.runIf(process.platform == 'win32')('accepts a collection folder given in a different case', async () => {
    const sink = new FsCollectionSink(dir.toUpperCase());
    await sink.writeText('users/get.frreq', '{}');
    expect(fs.readFileSync(path.join(dir, 'users', 'get.frreq'), 'utf8')).toBe('{}');
    await expect(sink.writeText('../escaped.frreq', '{}')).rejects.toThrow(/outside/);
  });

  it('names the offending argument in the error', async () => {
    const sink = new FsCollectionSink(dir);
    await expect(sink.writeText('../escaped.frreq', '{}'))
      .rejects.toThrow('../escaped.frreq is outside the collection folder');
  });
});
