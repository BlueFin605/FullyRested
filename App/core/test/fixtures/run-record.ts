import { RunRecord } from '../../src';

const json = '{"id":1,"name":"Rex"}';

// 1 passes (JSON response body, text request body), 2 fails validation, 3 errors with no response.
export const fixtureRun = (runId = '20261011-100000-aaaa'): RunRecord => ({
  runId,
  startedAt: '2026-10-11T10:00:00.000Z',
  collection: 'pets',
  environment: 'dev',
  selection: 'all',
  redacted: false,
  cases: [
    {
      index: 1, name: 'Create Pet', requestFile: 'create.json', ms: 12, outcome: 'pass',
      request: {
        method: 'POST', url: 'https://x.test/pets', headers: { 'content-type': 'text/plain' },
        body: { contentType: 'text/plain', bytes: 5, text: 'hello' }
      },
      response: {
        status: 201, statusText: 'Created', headers: { 'content-type': 'application/json' },
        body: { contentType: 'application/json', bytes: json.length, text: json }
      },
      validation: { valid: true, checks: [{ check: 'status', passed: true, errors: [] }] }
    },
    {
      index: 2, name: 'Get Pet', requestFile: 'get.json', ms: 8, outcome: 'fail',
      request: { method: 'GET', url: 'https://x.test/pets/1', headers: {} },
      response: { status: 200, statusText: 'OK', headers: {} },
      validation: {
        valid: false,
        checks: [
          { check: 'status', passed: true, errors: [] },
          { check: 'body', passed: false, errors: ['name must be string'] }
        ]
      }
    },
    {
      index: 3, name: 'Delete Pet', requestFile: 'delete.json', ms: 3, outcome: 'error',
      request: { method: 'DELETE', url: 'https://x.test/pets/1', headers: {} },
      error: 'No response: ECONNREFUSED'
    }
  ]
});
