import { describe, it, expect } from 'vitest';
import { CaseRecord, RunRecord, MemoryRunStore, listingOf, newRunId } from '../src';

const kase = (index: number, outcome: CaseRecord['outcome']): CaseRecord => ({
  index, name: `c${index}`, requestFile: 'f.json', outcome, ms: 1,
  request: { method: 'GET', url: 'https://x.test', headers: {} }
});

const run = (runId: string, over: Partial<RunRecord> = {}): RunRecord => ({
  runId, startedAt: '2026-10-11T10:00:00.000Z', collection: 'c', selection: 'all', redacted: false,
  cases: [kase(0, 'pass'), kase(1, 'fail'), kase(2, 'error'), kase(3, 'pass')], ...over
});

describe('newRunId', () => {
  it('formats the UTC time and a 4-char suffix', () => {
    const id = newRunId(new Date(Date.UTC(2026, 9, 11, 7, 5, 9)), () => 'abcd');
    expect(id).toBe('20261011-070509-abcd');
  });
});

describe('listingOf', () => {
  it('summarises a run with outcome counts and environment', () => {
    expect(listingOf(run('r1', { environment: 'prod', selection: 'folder/x' }))).toEqual({
      runId: 'r1', startedAt: '2026-10-11T10:00:00.000Z', selection: 'folder/x', environment: 'prod',
      passed: 2, failed: 1, errored: 1, ms: 4
    });
  });
  it('omits environment when the run has none', () => {
    expect(listingOf(run('r1')).environment).toBeUndefined();
    expect('environment' in listingOf(run('r1'))).toBe(false);
  });
});

describe('MemoryRunStore', () => {
  it('loads a saved run and returns undefined for an unknown id', async () => {
    const store = new MemoryRunStore();
    await store.save(run('r1'));
    expect((await store.load('r1'))?.runId).toBe('r1');
    expect(await store.load('nope')).toBeUndefined();
  });

  it('lists runs newest first by run id', async () => {
    const store = new MemoryRunStore();
    await store.save(run('20261011-070509-aaaa'));
    await store.save(run('20261011-090000-bbbb'));
    await store.save(run('20261010-235959-cccc'));
    expect((await store.list()).map(l => l.runId)).toEqual([
      '20261011-090000-bbbb', '20261011-070509-aaaa', '20261010-235959-cccc'
    ]);
  });

  it('drops the oldest run once the 21st is saved', async () => {
    const store = new MemoryRunStore();
    for (let i = 0; i < 21; i++) {
      await store.save(run(`r${String(i).padStart(2, '0')}`));
    }
    const ids = (await store.list()).map(l => l.runId);
    expect(ids).toHaveLength(20);
    expect(ids).not.toContain('r00');
    expect(ids[0]).toBe('r20');
    expect(ids[19]).toBe('r01');
    expect(await store.load('r00')).toBeUndefined();
  });

  it('replaces a run saved again under the same id', async () => {
    const store = new MemoryRunStore();
    await store.save(run('r1', { selection: 'old' }));
    await store.save(run('r1', { selection: 'new' }));
    const list = await store.list();
    expect(list).toHaveLength(1);
    expect(list[0].selection).toBe('new');
  });
});

const caseOf = (index: number, ms: number, status?: number): CaseRecord => ({
  index, name: `case ${index}`, requestFile: 'a.frreq', outcome: 'pass', ms,
  request: { method: 'GET', url: 'https://x/y', headers: {} },
  ...(status === undefined ? {} : { response: { status, headers: {} } })
});

const runOf = (cases: CaseRecord[], selection = '--all'): RunRecord => ({
  runId: 'r', startedAt: '2026-10-15T10:00:00.000Z', collection: 'c.frcol',
  selection, redacted: true, cases
});

describe('listingOf ms and status', () => {
  it('sums the case times into ms', () => {
    expect(listingOf(runOf([caseOf(1, 40, 200), caseOf(2, 60, 201)])).ms).toBe(100);
  });

  it('reports status for a single-case run that got a response', () => {
    const listing = listingOf(runOf([caseOf(1, 42, 422)], 'request:a.frreq'));

    expect(listing.status).toBe(422);
    expect(listing.ms).toBe(42);
  });

  it('omits status for a multi-case run', () => {
    expect(listingOf(runOf([caseOf(1, 10, 200), caseOf(2, 10, 200)])).status).toBeUndefined();
  });

  it('omits status for a single case that got no response', () => {
    const listing = listingOf(runOf([caseOf(1, 0)], 'request:a.frreq'));

    expect(listing.status).toBeUndefined();
    expect(listing.ms).toBe(0);
  });

  it('reports ms 0 for a run with no cases', () => {
    const listing = listingOf(runOf([]));

    expect(listing.ms).toBe(0);
    expect(listing.status).toBeUndefined();
  });
});
