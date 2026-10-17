import { describe, it, expect } from 'vitest';
import { MemoryRunStore, buildWebSocketCaseRecord, redactCase, summary, failures, runResult, RunRecord, SecretTable } from '../src';

const secret: SecretTable = { $secret: 'tok', $value: 'sup3r-s3cret', active: true, id: 'tok' };

const wsCase = (index: number, passed: boolean) => buildWebSocketCaseRecord({
  index, name: 'feed ' + index, requestFile: 'feed.frreq', ms: 7, url: 'wss://x.test/feed', headers: {}, message: 'hello',
  result: passed
    ? { passed: true, errors: [], messages: [{ text: '{"ok":1}', matched: true }] }
    : { passed: false, errors: ['Server closed the socket (code 1008, denied) after 0 of 1 expected messages'],
        messages: [{ text: '{"bad":"sup3r-s3cret"}', matched: false }], closeCode: 1008, closeReason: 'denied' }
});

const run = (cases: RunRecord['cases']): RunRecord =>
  ({ runId: '20261017-000000-aaaa', startedAt: new Date().toISOString(), collection: 'c', selection: 'all', redacted: true, cases });

describe('websocket cases in a run record', () => {
  it('records messages, close code and reason, and the failure reason', () => {
    const c = wsCase(1, false);
    expect(c.outcome).toBe('fail');
    expect(c.error).toContain('code 1008');
    expect(c.websocket).toMatchObject({ closeCode: 1008, closeReason: 'denied' });
    expect(c.websocket?.messages).toHaveLength(1);
    expect(c.request.body?.text).toBe('hello');
  });

  it('appears in summary, failures and runResult', () => {
    const r = run([wsCase(1, true), wsCase(2, false)]);
    expect(summary(r).cases).toEqual([
      { index: 1, name: 'feed 1', outcome: 'pass', ms: 7, messages: 1 },
      { index: 2, name: 'feed 2', outcome: 'fail', ms: 7, messages: 1, closeCode: 1008 }
    ]);
    expect(summary(r)).toMatchObject({ passed: 1, failed: 1, errored: 0 });
    const f = failures(r);
    expect(f.count).toBe(1);
    expect(f.cases[0]).toMatchObject({ index: 2, outcome: 'fail', closeCode: 1008, closeReason: 'denied', messages: 1 });
    expect(f.cases[0]!.error).toContain('after 0 of 1');
    expect(runResult(r).problems.map(p => p.index)).toEqual([2]);
  });

  it('redacts a secret in a received message, the error and the close reason', () => {
    const c = wsCase(1, false);
    c.websocket!.closeReason = 'bad sup3r-s3cret';
    c.error = 'Extra message: sup3r-s3cret';
    c.websocket!.errors = ['Extra message: sup3r-s3cret'];
    const out = redactCase(c, [secret]);
    expect(JSON.stringify(out)).not.toContain('sup3r-s3cret');
    expect(out.websocket?.messages[0]?.text).toBe('{"bad":"{{$secret:tok}}"}');
    expect(out.websocket?.closeReason).toBe('bad {{$secret:tok}}');
  });

  it('round-trips through a run store', async () => {
    const store = new MemoryRunStore();
    const r = run([wsCase(1, false)]);
    await store.save(r);
    expect((await store.load(r.runId))?.cases[0]?.websocket?.closeCode).toBe(1008);
  });
});
