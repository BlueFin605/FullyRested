import { describe, expect, it } from 'vitest';
import { PreparedRequest } from '../src/auth';
import { RestActionResult } from '../src/builder';
import { SecretTable } from '../src/model';
import { AppSendInput, appSelection, buildAppRunRecord } from '../src/app-run';

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
