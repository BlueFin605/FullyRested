import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { RunRecord } from '@fullyrested/core';
import { FsRunStore, RUNS_FOLDER } from '../src/run-store';

function record(runId: string, overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    runId,
    startedAt: '2026-10-11T10:00:00.000Z',
    collection: 'demo',
    selection: 'all',
    redacted: true,
    cases: [],
    ...overrides
  };
}

let dir = '';

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-store-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('FsRunStore', () => {
  it('round-trips a saved run', async () => {
    const store = new FsRunStore(dir);
    const run = record('20261011-100000-aaaa', { environment: 'dev' });

    await store.save(run);

    expect(await store.load(run.runId)).toEqual(run);
    expect(fs.existsSync(path.join(dir, RUNS_FOLDER, `${run.runId}.json`))).toBe(true);
  });

  it('returns undefined for an unknown run', async () => {
    const store = new FsRunStore(dir);

    expect(await store.load('missing')).toBeUndefined();
  });

  it('lists runs newest first', async () => {
    const store = new FsRunStore(dir);
    await store.save(record('20261011-100000-aaaa'));
    await store.save(record('20261011-120000-bbbb'));
    await store.save(record('20261010-090000-cccc'));

    const ids = (await store.list()).map(l => l.runId);

    expect(ids).toEqual(['20261011-120000-bbbb', '20261011-100000-aaaa', '20261010-090000-cccc']);
  });

  it('lists an empty array when the runs folder is missing', async () => {
    const store = new FsRunStore(dir);

    expect(await store.list()).toEqual([]);
  });

  it('skips a corrupt file in list with a warning', async () => {
    const warnings: string[] = [];
    const store = new FsRunStore(dir, m => warnings.push(m));
    await store.save(record('20261011-100000-aaaa'));
    fs.writeFileSync(path.join(dir, RUNS_FOLDER, 'bad.json'), '{not json');

    const ids = (await store.list()).map(l => l.runId);

    expect(ids).toEqual(['20261011-100000-aaaa']);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('bad.json');
  });

  it('throws from load for a corrupt file', async () => {
    const store = new FsRunStore(dir);
    fs.mkdirSync(path.join(dir, RUNS_FOLDER));
    fs.writeFileSync(path.join(dir, RUNS_FOLDER, 'bad.json'), '{not json');

    await expect(store.load('bad')).rejects.toThrow(/Run file .*bad\.json is corrupt/);
  });
});
