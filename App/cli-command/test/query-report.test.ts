import { describe, it, expect } from 'vitest';
import { BodyResult, TreeRequest, TreeValidation, TreeView } from '@fullyrested/core';
import { formatBody, formatFailures, formatRequest, formatResponse, formatRuns, formatSummary, formatTree, parseRange, truncationNotice } from '../src/query-report';

const body = (o: Partial<BodyResult>): BodyResult =>
  ({ index: 0, name: 'n', side: 'response', bytes: 10, encoding: 'text', truncated: false, content: 'x', ...o });

const request = (validation: TreeValidation | undefined): TreeRequest =>
  ({ type: 'request', name: 'req', path: 'req.frreq', method: 'get', url: '/x', validation });
const tree = (validation: TreeValidation | undefined): TreeView =>
  ({ collection: 'api', children: [request(validation)] });

describe('query-report', () => {
  it('formats runs, with a message when empty', () => {
    expect(formatRuns([])).toBe('no runs');
    expect(formatRuns([{ runId: 'r1', startedAt: 't', selection: 'all', passed: 1, failed: 2, errored: 3 }]))
      .toBe('r1  t  1 passed, 2 failed, 3 errored  all');
  });

  it('formats summary rows', () => {
    const out = formatSummary({
      runId: 'r1', startedAt: 't', environment: 'Dev', selection: 'all', passed: 1, failed: 0, errored: 1,
      cases: [{ index: 1, name: 'ok', outcome: 'pass', status: 200, ms: 5 }, { index: 2, name: 'down', outcome: 'error', ms: 2 }]
    } as never);
    expect(out.split('\n')).toEqual(['r1  t  1 passed, 0 failed, 1 errored  all', '  1 PASS 200 5ms ok', '  2 ERROR - 2ms down']);
  });

  it('formats failures with checks or the error, and none', () => {
    expect(formatFailures({ runId: 'r', count: 0, cases: [] })).toBe('no failures');
    const out = formatFailures({
      runId: 'r', count: 2, cases: [
        { index: 1, name: 'a', outcome: 'fail', status: 404, failedChecks: [{ check: 'ResponseCode', errors: ['expected 200'] }] },
        { index: 2, name: 'b', outcome: 'error', error: 'boom', failedChecks: [] }
      ]
    });
    expect(out.split('\n')).toEqual(['  1 FAIL 404 a', '    [ResponseCode] expected 200', '  2 ERROR - b', '    boom']);
  });

  it('formats a case error before its failed checks', () => {
    const out = formatFailures({
      runId: 'r', count: 1, cases: [
        { index: 1, name: 'a', outcome: 'error', error: 'No response: ECONNREFUSED', failedChecks: [{ check: 'ResponseCode', errors: ['expected 200'] }] }
      ]
    });
    expect(out.split('\n')).toEqual(['  1 ERROR - a', '    No response: ECONNREFUSED', '    [ResponseCode] expected 200']);
  });

  it('formats request and response', () => {
    expect(formatRequest({ index: 0, name: 'n', method: 'GET', url: 'http://x', headers: { a: 'b' } }))
      .toBe('GET http://x\na: b\nno body');
    expect(formatResponse({ index: 0, name: 'n', status: 200, statusText: 'OK', ms: 3, headers: {}, body: { contentType: 'text/plain', bytes: 4 } }))
      .toBe('200 OK 3ms\nbody: text/plain, 4 bytes');
  });

  it('formats bodies and the truncation notice', () => {
    expect(formatBody(body({ encoding: 'json', content: { a: 1 } }))).toBe('{\n  "a": 1\n}');
    expect(formatBody(body({ content: 'abc' }))).toBe('abc');
    expect(truncationNotice(body({}))).toBeUndefined();
    expect(truncationNotice(body({ truncated: true, bytes: 100, content: 'abc' })))
      .toBe('-- truncated at 3 of 100 bytes; use --path, --outline, --range or --full');
    expect(truncationNotice(body({ truncated: true, bytes: 100, content: 'é€' })))
      .toBe('-- truncated at 5 of 100 bytes; use --path, --outline, --range or --full');
  });

  it('parses ranges strictly', () => {
    expect(parseRange('0:10')).toEqual([0, 10]);
    for (const bad of ['a:b', '1.5:3', '-1:3', '3', '1:2:3', ':']) expect(parseRange(bad)).toBeUndefined();
  });
});

describe('formatTree validation marker', () => {
  it('shows nothing for a row with no validation', () => {
    expect(formatTree(tree(undefined))).toBe('api/\n  req  GET /x');
  });

  it('shows the bare type when it checks no body', () => {
    expect(formatTree(tree({ type: 'ResponseCode', schema: false }))).toBe('api/\n  req  GET /x  [ResponseCode]');
  });

  it('flags a real schema', () => {
    expect(formatTree(tree({ type: 'Body', schema: true }))).toBe('api/\n  req  GET /x  [Body(schema)]');
  });

  it('flags a declared body check with an empty schema', () => {
    expect(formatTree(tree({ type: 'Body', schema: false, incomplete: true }))).toBe('api/\n  req  GET /x  [Body(no schema!)]');
  });

  it('shows what an Inherit row resolves to', () => {
    expect(formatTree(tree({ type: 'Inherit', effective: 'Body', schema: true }))).toBe('api/\n  req  GET /x  [Inherit→Body]');
  });

  it('shows a run row\'s own marker too', () => {
    const view: TreeView = {
      collection: 'api',
      children: [{ ...request({ type: 'None', schema: false }), runs: [{ name: 'happy', validation: { type: 'Body', schema: false, incomplete: true } }] }]
    };
    expect(formatTree(view)).toBe('api/\n  req  GET /x  [None]\n    › happy  [Body(no schema!)]');
  });
});
