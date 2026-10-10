import { describe, it, expect } from 'vitest';
import { MemoryRunStore, QueryError, listRuns, resolveRun, findCase, summary, failures, runResult, caseRequest, caseResponse } from '../src';
import { fixtureRun } from './fixtures/run-record';

describe('resolveRun', () => {
  it('returns the newest run across stores', async () => {
    const a = new MemoryRunStore(); const b = new MemoryRunStore();
    await a.save(fixtureRun('20261011-100000-aaaa'));
    await b.save(fixtureRun('20261011-110000-bbbb'));
    await a.save(fixtureRun('20261011-090000-cccc'));
    expect((await resolveRun([a, b])).runId).toBe('20261011-110000-bbbb');
  });

  it('breaks a same-second run id tie on startedAt', async () => {
    const a = new MemoryRunStore(); const b = new MemoryRunStore();
    await a.save({ ...fixtureRun('20261011-100000-ffff'), startedAt: '2026-10-11T10:00:00.100Z' });
    await b.save({ ...fixtureRun('20261011-100000-0000'), startedAt: '2026-10-11T10:00:00.900Z' });
    expect((await resolveRun([a, b])).runId).toBe('20261011-100000-0000');
  });

  it('errors when nothing is recorded', async () => {
    await expect(resolveRun([new MemoryRunStore()])).rejects.toThrow('No runs recorded yet. Use run first.');
  });

  it('loads a given run from whichever store has it', async () => {
    const a = new MemoryRunStore(); const b = new MemoryRunStore();
    await b.save(fixtureRun('20261011-100000-aaaa'));
    expect((await resolveRun([a, b], '20261011-100000-aaaa')).runId).toBe('20261011-100000-aaaa');
  });

  it('lists recent ids for an unknown run', async () => {
    const a = new MemoryRunStore();
    for (let i = 1; i <= 6; i++) await a.save(fixtureRun(`20261011-10000${i}-aaaa`));
    const err = await resolveRun([a], 'nope').catch(e => e);
    expect(err).toBeInstanceOf(QueryError);
    expect(err.message).toContain("Run 'nope' not found. Recent runs: ");
    expect(err.message).toContain('20261011-100006-aaaa');
    expect(err.message).not.toContain('20261011-100001-aaaa');
  });
});

describe('listRuns', () => {
  it('merges stores, drops duplicates and lists newest first', async () => {
    const a = new MemoryRunStore(); const b = new MemoryRunStore();
    await a.save(fixtureRun('20261011-100000-aaaa'));
    await b.save(fixtureRun('20261011-100000-aaaa'));
    await b.save(fixtureRun('20261011-110000-bbbb'));
    await a.save({ ...fixtureRun('20261011-110000-0000'), startedAt: '2026-10-11T11:00:00.500Z' });
    expect((await listRuns([a, b])).map(l => l.runId)).toEqual(['20261011-110000-0000', '20261011-110000-bbbb', '20261011-100000-aaaa']);
  });
});

describe('findCase', () => {
  const r = fixtureRun();
  it('finds by number, digit string, name and lowercase name', () => {
    expect(findCase(r, 2).name).toBe('Get Pet');
    expect(findCase(r, '2').name).toBe('Get Pet');
    expect(findCase(r, 'Get Pet').index).toBe(2);
    expect(findCase(r, 'get pet').index).toBe(2);
  });
  it('lists cases for an unknown case', () => {
    expect(() => findCase(r, 'zzz')).toThrow("Case 'zzz' not found. The run has 3 cases: 1 Create Pet, 2 Get Pet, 3 Delete Pet");
    expect(() => findCase(r, 9)).toThrow(QueryError);
  });
});

describe('summary', () => {
  it('counts outcomes and lists cases', () => {
    const s = summary(fixtureRun());
    expect(s).toMatchObject({ runId: '20261011-100000-aaaa', environment: 'dev', selection: 'all', passed: 1, failed: 1, errored: 1 });
    expect(s.cases).toEqual([
      { index: 1, name: 'Create Pet', outcome: 'pass', status: 201, ms: 12 },
      { index: 2, name: 'Get Pet', outcome: 'fail', status: 200, ms: 8 },
      { index: 3, name: 'Delete Pet', outcome: 'error', ms: 3 }
    ]);
  });
});

describe('failures', () => {
  it('excludes passes and lists only failed checks', () => {
    const f = failures(fixtureRun());
    expect(f.count).toBe(2);
    expect(f.cases).toEqual([
      { index: 2, name: 'Get Pet', outcome: 'fail', status: 200, failedChecks: [{ check: 'body', errors: ['name must be string'] }] },
      { index: 3, name: 'Delete Pet', outcome: 'error', error: 'No response: ECONNREFUSED', failedChecks: [] }
    ]);
  });
});

describe('runResult', () => {
  it('gives the counts and only the cases that did not pass, in the failures row shape', () => {
    const r = runResult(fixtureRun());
    expect(r).toEqual({
      runId: '20261011-100000-aaaa', startedAt: '2026-10-11T10:00:00.000Z', environment: 'dev', selection: 'all',
      passed: 1, failed: 1, errored: 1, problems: failures(fixtureRun()).cases
    });
  });
  it('has an empty problems list when everything passes', () => {
    const run = fixtureRun();
    const allPass = { ...run, cases: [run.cases[0]!] };
    expect(runResult(allPass)).toMatchObject({ passed: 1, failed: 0, errored: 0, problems: [] });
  });
});

describe('caseRequest / caseResponse', () => {
  it('returns body metadata only', () => {
    const req = caseRequest(fixtureRun(), 1);
    expect(req).toEqual({
      index: 1, name: 'Create Pet', method: 'POST', url: 'https://x.test/pets',
      headers: { 'content-type': 'text/plain' }, body: { contentType: 'text/plain', bytes: 5 }
    });
    const res = caseResponse(fixtureRun(), 'Create Pet');
    expect(res).toMatchObject({ index: 1, status: 201, statusText: 'Created', ms: 12, body: { contentType: 'application/json', bytes: 21 } });
    expect(JSON.stringify(res)).not.toContain('Rex');
  });
  it('omits body when absent', () => {
    expect(caseRequest(fixtureRun(), 2)).not.toHaveProperty('body');
    expect(caseResponse(fixtureRun(), 2)).not.toHaveProperty('body');
  });
  it('errors when there is no response', () => {
    expect(() => caseResponse(fixtureRun(), 3)).toThrow('Case 3 got no response: No response: ECONNREFUSED');
  });
});
