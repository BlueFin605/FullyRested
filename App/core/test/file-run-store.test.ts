import { describe, expect, it } from 'vitest';
import { RunRecord } from '../src/run-record';
import { RUNS_FOLDER, RunStoreHost, fileRunStore } from '../src/file-run-store';

function memoryHost() {
  const files = new Map<string, string>();
  const dirs = new Set<string>();
  const host: RunStoreHost = {
    join: (...parts) => parts.filter(p => p !== '').join('/'),
    exists: p => files.has(p) || dirs.has(p),
    readText: p => {
      const text = files.get(p);
      if (text === undefined) throw new Error(`ENOENT: ${p}`);
      return text;
    },
    writeText: (p, text) => { files.set(p, text); },
    readdir: p => {
      if (!dirs.has(p)) throw new Error(`ENOENT: ${p}`);
      return [...files.keys()].filter(f => f.startsWith(`${p}/`)).map(f => f.slice(p.length + 1));
    },
    mkdir: p => { dirs.add(p); },
    remove: p => { files.delete(p); }
  };
  return { host, files, dirs };
}

const record = (runId: string, extra: Partial<RunRecord> = {}): RunRecord => ({
  runId, startedAt: '2026-10-15T10:00:00.000Z', collection: 'c.frcol',
  selection: '--all', redacted: true, cases: [], ...extra
});

describe('fileRunStore', () => {
  it('round-trips a saved run into the runs folder', async () => {
    const { host, files } = memoryHost();
    const store = fileRunStore(host, 'dir');
    const run = record('20261011-100000-aaaa', { environment: 'dev' });

    await store.save(run);

    expect(await store.load(run.runId)).toEqual(run);
    expect(files.has(`dir/${RUNS_FOLDER}/${run.runId}.json`)).toBe(true);
  });

  it('returns undefined for an unknown run', async () => {
    const { host } = memoryHost();
    expect(await fileRunStore(host, 'dir').load('missing')).toBeUndefined();
  });

  it('lists runs newest first', async () => {
    const { host } = memoryHost();
    const store = fileRunStore(host, 'dir');
    await store.save(record('20261011-100000-aaaa'));
    await store.save(record('20261011-120000-bbbb'));
    await store.save(record('20261010-090000-cccc'));

    expect((await store.list()).map(l => l.runId))
      .toEqual(['20261011-120000-bbbb', '20261011-100000-aaaa', '20261010-090000-cccc']);
  });

  it('lists an empty array when the runs folder is missing', async () => {
    const { host } = memoryHost();
    expect(await fileRunStore(host, 'dir').list()).toEqual([]);
  });

  it('skips a corrupt file in list with a warning', async () => {
    const { host, files } = memoryHost();
    const warnings: string[] = [];
    const store = fileRunStore(host, 'dir', { onWarning: m => warnings.push(m) });
    await store.save(record('20261011-100000-aaaa'));
    files.set(`dir/${RUNS_FOLDER}/bad.json`, '{not json');

    expect((await store.list()).map(l => l.runId)).toEqual(['20261011-100000-aaaa']);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('bad.json');
  });

  it('ignores a non-json file in list', async () => {
    const { host, files } = memoryHost();
    const store = fileRunStore(host, 'dir');
    await store.save(record('20261011-100000-aaaa'));
    files.set(`dir/${RUNS_FOLDER}/notes.txt`, 'hello');

    expect(await store.list()).toHaveLength(1);
  });

  it('throws from load for a corrupt file, naming it', async () => {
    const { host, files, dirs } = memoryHost();
    dirs.add(`dir/${RUNS_FOLDER}`);
    files.set(`dir/${RUNS_FOLDER}/bad.json`, '{not json');

    await expect(fileRunStore(host, 'dir').load('bad')).rejects.toThrow(/Run file .*bad\.json is corrupt/);
  });

  it('throws from load for a file that parses but is not an object', async () => {
    const { host, files, dirs } = memoryHost();
    dirs.add(`dir/${RUNS_FOLDER}`);
    files.set(`dir/${RUNS_FOLDER}/nul.json`, 'null');

    await expect(fileRunStore(host, 'dir').load('nul')).rejects.toThrow(/Run file .*nul\.json is corrupt/);
  });

  it('refuses traversal, backslash and absolute ids rather than reading outside the folder', async () => {
    const { host } = memoryHost();
    const store = fileRunStore(host, 'dir');

    expect(await store.load('../x')).toBeUndefined();
    expect(await store.load('..\\x')).toBeUndefined();
    expect(await store.load('/abs/x')).toBeUndefined();
  });

  it('throws from save for an invalid run id and writes nothing', async () => {
    const { host, files } = memoryHost();
    const store = fileRunStore(host, 'dir');

    await expect(store.save(record('../x'))).rejects.toThrow("Invalid run id '../x'");
    expect(files.size).toBe(0);
  });
});
