import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { FsCollectionSink } from '../src/files';

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frsink-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

// Symlink creation needs privileges on some Windows setups; a junction needs none, so it is tried next.
// When neither is available the test skips rather than fails.
function trySymlink(target: string, link: string): boolean {
  for (const type of ['dir', 'junction'] as const) {
    try {
      fs.symlinkSync(target, link, type);
      return true;
    } catch {
      // try the next kind of link
    }
  }
  return false;
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
      if (!trySymlink(away, path.join(dir, 'link')))
        return;
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

  it('refuses writing through a symlinked directory several levels below an existing one', async () => {
    const away = fs.mkdtempSync(path.join(os.tmpdir(), 'fraway-'));
    try {
      fs.mkdirSync(path.join(dir, 'real'), { recursive: true });
      if (!trySymlink(away, path.join(dir, 'real', 'out')))
        return;
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
      if (!trySymlink(gone, path.join(dir, 'dangling')))
        return;
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
    if (!trySymlink(inner, alias))
      return;
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
