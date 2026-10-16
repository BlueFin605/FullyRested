import { describe, expect, it } from 'vitest';
import { RunRecord } from '../src/run-record';
import { APP_RUN_CAP, APP_RUN_SUFFIX, RUNS_FOLDER, RunStoreHost, fileRunStore, isAppRunId, newAppRunId } from '../src/file-run-store';

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
    expect(files.has(`dir/${RUNS_FOLDER}/${run.runId}.frrun`)).toBe(true);
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

  it('ignores a stray .json file in the runs folder', async () => {
    const { host, files } = memoryHost();
    const store = fileRunStore(host, 'dir');
    await store.save(record('20261011-100000-aaaa'));
    files.set(`dir/${RUNS_FOLDER}/old.json`, JSON.stringify(record('old')));

    expect((await store.list()).map(l => l.runId)).toEqual(['20261011-100000-aaaa']);
  });

  it('skips a corrupt file in list with a warning', async () => {
    const { host, files } = memoryHost();
    const warnings: string[] = [];
    const store = fileRunStore(host, 'dir', { onWarning: m => warnings.push(m) });
    await store.save(record('20261011-100000-aaaa'));
    files.set(`dir/${RUNS_FOLDER}/bad.frrun`, '{not json');

    expect((await store.list()).map(l => l.runId)).toEqual(['20261011-100000-aaaa']);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('bad.frrun');
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
    files.set(`dir/${RUNS_FOLDER}/bad.frrun`, '{not json');

    await expect(fileRunStore(host, 'dir').load('bad')).rejects.toThrow(/Run file .*bad.frrun is corrupt/);
  });

  it('throws from load for a file that parses but is not an object', async () => {
    const { host, files, dirs } = memoryHost();
    dirs.add(`dir/${RUNS_FOLDER}`);
    files.set(`dir/${RUNS_FOLDER}/nul.frrun`, 'null');

    await expect(fileRunStore(host, 'dir').load('nul')).rejects.toThrow(/Run file .*nul.frrun is corrupt/);
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

describe('app run ids', () => {
  it('marks an app run id with the suffix, and recognises it', () => {
    const id = newAppRunId(new Date('2026-10-15T14:32:07Z'));

    expect(id.startsWith('20261015-143207-')).toBe(true);
    expect(id.endsWith(APP_RUN_SUFFIX)).toBe(true);
    expect(isAppRunId(id)).toBe(true);
    expect(isAppRunId('20261015-143207-ab12')).toBe(false);
  });

  it('is a valid run id, so it saves and loads like any other', async () => {
    const { host } = memoryHost();
    const store = fileRunStore(host, 'dir');
    const run = record(newAppRunId(new Date('2026-10-15T14:32:07Z')));

    await store.save(run);

    expect(await store.load(run.runId)).toEqual(run);
  });
});

describe('fileRunStore pruning', () => {
  const appId = (n: number) => `202610${String(10 + n).padStart(2, '0')}-100000-aaaa${APP_RUN_SUFFIX}`;

  it('keeps the newest cap app records and deletes the rest', async () => {
    const { host, files } = memoryHost();
    const store = fileRunStore(host, 'dir', { cap: 3 });
    for (let n = 1; n <= 5; n++) await store.save(record(appId(n)));

    expect((await store.list()).map(l => l.runId)).toEqual([appId(5), appId(4), appId(3)]);
    expect(files.has(`dir/${RUNS_FOLDER}/${appId(1)}.frrun`)).toBe(false);
  });

  it('prunes only *-app.frrun files, leaving a stray .json alone', async () => {
    const { host, files } = memoryHost();
    const store = fileRunStore(host, 'dir', { cap: 1 });
    const stray = `dir/${RUNS_FOLDER}/20261001-090000-aaaa${APP_RUN_SUFFIX}.json`;
    files.set(stray, 'stray');
    await store.save(record(appId(1)));
    await store.save(record(appId(2)));

    expect(files.has(`dir/${RUNS_FOLDER}/${appId(1)}.frrun`)).toBe(false);
    expect(files.has(`dir/${RUNS_FOLDER}/${appId(2)}.frrun`)).toBe(true);
    expect(files.has(stray)).toBe(true);
  });

  it('never deletes a record without the -app suffix', async () => {
    const { host } = memoryHost();
    const store = fileRunStore(host, 'dir', { cap: 1 });
    await store.save(record('20261001-090000-cli1'));
    await store.save(record('20261002-090000-cli2'));
    await store.save(record(appId(1)));
    await store.save(record(appId(2)));

    expect((await store.list()).map(l => l.runId).sort())
      .toEqual(['20261001-090000-cli1', '20261002-090000-cli2', appId(2)].sort());
  });

  it('prunes nothing when no cap is given', async () => {
    const { host } = memoryHost();
    const store = fileRunStore(host, 'dir');
    for (let n = 1; n <= 5; n++) await store.save(record(appId(n)));

    expect(await store.list()).toHaveLength(5);
  });

  it('warns but still saves when a delete fails', async () => {
    const { host } = memoryHost();
    const warnings: string[] = [];
    const failing: RunStoreHost = { ...host, remove: () => { throw new Error('EBUSY'); } };
    const store = fileRunStore(failing, 'dir', { cap: 1, onWarning: m => warnings.push(m) });
    await store.save(record(appId(1)));

    await store.save(record(appId(2)));

    expect(await store.load(appId(2))).toBeDefined();
    expect(warnings.join(' ')).toContain('EBUSY');
  });

  it('keeps exactly APP_RUN_CAP app records when given that cap', async () => {
    const { host } = memoryHost();
    const store = fileRunStore(host, 'dir', { cap: APP_RUN_CAP });
    const idOf = (n: number) => `20261015-${100000 + n}-aaaa${APP_RUN_SUFFIX}`;
    for (let n = 1; n <= APP_RUN_CAP + 1; n++) await store.save(record(idOf(n)));

    const ids = (await store.list()).map(l => l.runId);

    expect(APP_RUN_CAP).toBe(200);
    expect(ids).toHaveLength(APP_RUN_CAP);
    expect(ids).not.toContain(idOf(1));
    expect(ids).toContain(idOf(APP_RUN_CAP + 1));
  });

  it('refuses a missing or non-string run id', async () => {
    const { host, files } = memoryHost();
    const store = fileRunStore(host, 'dir');

    await expect(store.save(record(undefined as unknown as string))).rejects.toThrow(/Invalid run id/);
    expect(await store.load(undefined as unknown as string)).toBeUndefined();
    expect(await store.load(42 as unknown as string)).toBeUndefined();
    expect([...files.keys()]).toEqual([]);
  });
});
