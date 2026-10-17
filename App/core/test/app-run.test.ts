import { describe, expect, it } from 'vitest';
import { PreparedRequest } from '../src/auth';
import { RestActionResult } from '../src/builder';
import { SecretTable } from '../src/model';
import { AppSendInput, AppScopeCase, appSelection, buildAppRunRecord, buildAppWebSocketRunRecord, buildScopeRunRecord } from '../src/app-run';

const prepared: PreparedRequest = {
  method: 'POST', url: 'https://api.example.com/users?key=sw0rdf1sh-secret',
  headers: { 'content-type': 'application/json' }, body: '{"name":"a"}'
};

const result = (): RestActionResult => ({
  status: 422, statusText: 'Unprocessable', headers: { 'content-type': 'application/json' },
  headersSent: { 'content-type': 'application/json', authorization: 'AWS4-HMAC-SHA256 Credential=xyz' },
  body: { contentType: 'application/json', body: new TextEncoder().encode('{"error":"bad"}').buffer as ArrayBuffer },
  validated: undefined
});

const secrets: SecretTable[] = [{ $secret: 'API_KEY', $value: 'sw0rdf1sh-secret', active: true, id: 's1' }];

const input = (extra: Partial<AppSendInput> = {}): AppSendInput => ({
  collection: 'C:/work/api/api.frcol',
  environment: 'dev',
  node: { kind: 'request', name: 'Create user', path: 'users/create.frreq' },
  request: prepared,
  result: result(),
  secrets,
  ms: 61,
  runId: '20261015-143207-ab12-app',
  startedAt: '2026-10-15T14:32:07.000Z',
  ...extra
});

describe('appSelection', () => {
  it('is a request locator for a request', () => {
    expect(appSelection({ kind: 'request', name: 'n', path: 'users/create.frreq' }))
      .toBe('request:users/create.frreq');
  });

  it('is a run locator for a run', () => {
    expect(appSelection({ kind: 'run', name: 'n', path: 'users/create.frreq', runName: 'happy' }))
      .toBe('run:users/create.frreq#happy');
  });
});

describe('buildAppRunRecord', () => {
  it('builds a redacted one-case record', () => {
    const run = buildAppRunRecord(input());

    expect(run.runId).toBe('20261015-143207-ab12-app');
    expect(run.startedAt).toBe('2026-10-15T14:32:07.000Z');
    expect(run.collection).toBe('C:/work/api/api.frcol');
    expect(run.environment).toBe('dev');
    expect(run.selection).toBe('request:users/create.frreq');
    expect(run.redacted).toBe(true);
    expect(run.cases).toHaveLength(1);
    expect(run.cases[0].index).toBe(1);
    expect(run.cases[0].name).toBe('Create user');
    expect(run.cases[0].requestFile).toBe('users/create.frreq');
    expect(run.cases[0].ms).toBe(61);
  });

  it('redacts a secret value out of the url', () => {
    expect(buildAppRunRecord(input()).cases[0].request.url)
      .toBe('https://api.example.com/users?key={{$secret:API_KEY}}');
  });

  it('records the headers that were actually sent', () => {
    expect(Object.keys(buildAppRunRecord(input()).cases[0].request.headers)).toContain('authorization');
  });

  const authorizationFor = (value: string) => {
    const r = result();
    r.headersSent = { ...r.headersSent, authorization: value };
    return buildAppRunRecord(input({ result: r })).cases[0].request.headers['authorization'];
  };

  it('masks the signature part of an AWS Authorization header', () => {
    expect(authorizationFor('AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20261015/us-east-1/s3/aws4_request, Signature=deadbeef'))
      .toBe('AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/***');
  });

  it('masks a Bearer token', () => {
    expect(authorizationFor('Bearer abc.def.ghi-token')).toBe('Bearer ***');
  });

  it('masks a Basic credential', () => {
    expect(authorizationFor('Basic dXNlcjpwYXNz')).toBe('Basic ***');
  });

  it('records a run, with its run name and locator', () => {
    const run = buildAppRunRecord(input({
      node: { kind: 'run', name: 'Create user > happy', path: 'users/create.frreq', runName: 'happy' }
    }));

    expect(run.selection).toBe('run:users/create.frreq#happy');
    expect(run.cases[0].runName).toBe('happy');
  });

  it('omits environment when none is selected', () => {
    expect('environment' in buildAppRunRecord(input({ environment: undefined }))).toBe(false);
  });

  it('records a failure to resolve as an errored case with no response', () => {
    const run = buildAppRunRecord(input({ request: undefined, result: undefined, error: 'folder is broken' }));

    expect(run.cases[0].outcome).toBe('error');
    expect(run.cases[0].error).toBe('folder is broken');
    expect(run.cases[0].response).toBeUndefined();
  });

  it('generates an -app run id and an ISO time when none are given', () => {
    const run = buildAppRunRecord(input({ runId: undefined, startedAt: undefined }));

    expect(run.runId.endsWith('-app')).toBe(true);
    expect(Number.isNaN(Date.parse(run.startedAt))).toBe(false);
  });
});

describe('buildScopeRunRecord', () => {
  const okCase = (): AppScopeCase => ({
    node: { kind: 'request', name: 'List', path: 'users/list.frreq' },
    request: prepared, result: { ...result(), status: 200, statusText: 'OK' },
    validation: { information: [], errors: [], valid: true }, ms: 10, secrets: undefined
  });
  const failCase = (): AppScopeCase => ({
    node: { kind: 'request', name: 'Create', path: 'users/create.frreq' },
    request: prepared, result: result(),
    validation: { information: [], errors: ['bad'], valid: false, checks: [] }, ms: 20, secrets
  });
  const errorCase = (): AppScopeCase => ({
    node: { kind: 'run', name: 'Boom', path: 'users/boom.frreq', runName: 'x' },
    error: 'folder is broken', ms: 5, secrets: undefined
  });
  const build = (extra = {}) => buildScopeRunRecord({
    collection: 'C:/work/api/api.frcol', environment: 'dev', selection: 'folder:users',
    cases: [okCase(), failCase(), errorCase()],
    runId: '20261015-143207-ab12-app', startedAt: '2026-10-15T14:32:07.000Z', ...extra
  });

  it('builds one numbered case per input with pass/fail/error outcomes', () => {
    const run = build();

    expect(run.cases.map(c => c.index)).toEqual([1, 2, 3]);
    expect(run.cases.map(c => c.outcome)).toEqual(['pass', 'fail', 'error']);
    expect(run.cases[2].runName).toBe('x');
    expect(run.selection).toBe('folder:users');
    expect(run.redacted).toBe(true);
    expect(run.environment).toBe('dev');
  });

  it('generates an -app run id when none is pinned', () => {
    expect(build({ runId: undefined }).runId.endsWith('-app')).toBe(true);
  });

  it('omits environment when undefined', () => {
    expect('environment' in build({ environment: undefined })).toBe(false);
  });

  it('redacts each case with its own secrets only', () => {
    const run = build();

    expect(run.cases[0].request.url).toContain('sw0rdf1sh-secret');
    expect(run.cases[1].request.url).toBe('https://api.example.com/users?key={{$secret:API_KEY}}');
  });
});

describe('buildAppWebSocketRunRecord', () => {
  const wsInput = {
    collection: 'C:/work/api/api.frcol',
    node: { kind: 'request' as const, name: 'Feed', path: 'ws/feed.frreq' },
    url: 'wss://example.com/feed',
    headers: { authorization: 'Bearer sw0rdf1sh-secret' },
    message: 'hello sw0rdf1sh-secret',
    secrets,
    ms: 40,
    runId: '20261017-100000-ab12-app',
    startedAt: '2026-10-17T10:00:00.000Z'
  };

  it('records a passing run as one redacted WS case', () => {
    const run = buildAppWebSocketRunRecord({ ...wsInput, result: { passed: true, errors: [], messages: [{ text: '{"a":1}', matched: true }] } });

    expect(run.redacted).toBe(true);
    expect(run.selection).toBe('request:ws/feed.frreq');
    expect(run.cases).toHaveLength(1);
    expect(run.cases[0].outcome).toBe('pass');
    expect(run.cases[0].request.method).toBe('WS');
    expect(JSON.stringify(run)).not.toContain('sw0rdf1sh-secret');
  });

  it('records a failed test as fail and a thrown error as error', () => {
    const failed = buildAppWebSocketRunRecord({ ...wsInput, result: { passed: false, errors: ['timed out'], messages: [] } });
    const errored = buildAppWebSocketRunRecord({ ...wsInput, error: 'no main process' });

    expect(failed.cases[0].outcome).toBe('fail');
    expect(errored.cases[0].outcome).toBe('error');
  });
});
