import { describe, expect, it, vi } from 'vitest';
import { validationFromCase } from '../src/authoring';
import { MemoryCollectionSink } from '../src/collection-sink';
import { QueryError } from '../src/query-error';
import { RunRecord } from '../src/run-record';
import { MemoryRunStore } from '../src/run-store';
import { files } from './fixtures/collection';

const guid = { generateGUID: () => 'generated' };
const secrets = { get: async () => null, set: vi.fn(async () => { }) };
const ctxFor = (sink: MemoryCollectionSink) =>
  ({ collectionFile: 'api.frcol', source: sink, sink, secrets, guid });

const written = (sink: MemoryCollectionSink, file: string) => JSON.parse(sink.files.get(file)!);

const runId = '20261011-142305-a1b2';

// Five cases, one per refusal/success class the ticket lists:
//   1 passes, with a JSON object body (the success path)
//   2 passes, but its body is not JSON
//   3 errored - no response to learn from
//   4 has no response at all (distinct from "errored")
//   5 passes, with a redacted secret inside its JSON body
const runRecord: RunRecord = {
  runId,
  startedAt: '2026-10-11T14:23:05.000Z',
  collection: 'api',
  selection: 'all',
  redacted: true,
  cases: [
    {
      index: 1, name: 'Get missing user', requestFile: 'users/get.frreq', runName: 'not found',
      outcome: 'pass', ms: 10,
      request: { method: 'GET', url: 'https://x/u', headers: {} },
      response: {
        status: 404, statusText: 'Not Found', headers: {},
        body: {
          contentType: 'application/json', bytes: 50,
          text: JSON.stringify({ id: 1, name: 'x', active: true, tags: ['a'] })
        }
      }
    },
    {
      index: 2, name: 'Non-JSON body', requestFile: 'users/get.frreq', outcome: 'pass', ms: 5,
      request: { method: 'GET', url: 'https://x/u', headers: {} },
      response: { status: 200, statusText: 'OK', headers: {}, body: { contentType: 'text/plain', bytes: 5, text: 'hello' } }
    },
    {
      index: 3, name: 'Errored', requestFile: 'users/get.frreq', outcome: 'error', ms: 2,
      request: { method: 'GET', url: 'https://x/u', headers: {} },
      error: 'No response: ECONNREFUSED'
    },
    {
      index: 4, name: 'No response', requestFile: 'users/get.frreq', outcome: 'pass', ms: 1,
      request: { method: 'GET', url: 'https://x/u', headers: {} }
    },
    {
      index: 5, name: 'Secretful', requestFile: 'users/get.frreq', outcome: 'pass', ms: 7,
      request: { method: 'GET', url: 'https://x/u', headers: {} },
      response: {
        status: 200, statusText: 'OK', headers: {},
        body: { contentType: 'application/json', bytes: 30, text: JSON.stringify({ token: '{{$secret:token}}' }) }
      }
    }
  ]
};

const storeWithRun = async () => {
  const store = new MemoryRunStore();
  await store.save(runRecord);
  return store;
};

describe('validationFromCase', () => {
  it('learns httpCode and a JSON-schema body validation from a passing case (case ref is 1-based)', async () => {
    const sink = new MemoryCollectionSink(files);
    const store = await storeWithRun();

    const result = await validationFromCase(ctxFor(sink), [store], 'run:users/get.frreq#not found', 1, runId);

    expect(result).toMatchObject({ file: 'users/get.frreq', scope: 'run:users/get.frreq#not found', changed: true });
    expect(result.message).toBe(
      `Set validation on run:users/get.frreq#not found from run ${runId} case 1: expect 404 and a JSON body of 4 properties`
    );

    const validation = written(sink, 'users/get.frreq').runs[0].validation;
    expect(validation.httpCode).toBe(404);
    expect(validation.type).toBe('Body');
    expect(validation.body).toBe('JsonSchema');
    expect(typeof validation.jsonSchema.schema).toBe('string'); // RestActionValidationJsonSchema.schema is raw JSON text
    expect(JSON.parse(validation.jsonSchema.schema)).toEqual({
      type: 'object',
      properties: {
        id: { type: 'integer' }, name: { type: 'string' }, active: { type: 'boolean' },
        tags: { type: 'array', items: { type: 'string' } }
      },
      required: ['id', 'name', 'active', 'tags']
    });
  });

  it("sets type 'HeadersBody' when the target already has validation headers of its own", async () => {
    const filesWithHeaders = {
      ...files,
      'users/get.frreq': JSON.stringify({
        id: 'r1', name: 'Get user', verb: 'get', url: 'https://x/u',
        runs: [{
          id: 'n1', name: 'not found',
          validation: { type: 'Headers', httpCode: 200, body: 'None', headers: [{ key: 'X-Trace', value: '1', active: true, id: 'h1' }] }
        }]
      })
    };
    const sink = new MemoryCollectionSink(filesWithHeaders);
    const store = await storeWithRun();

    await validationFromCase(ctxFor(sink), [store], 'run:users/get.frreq#not found', 1, runId);

    const validation = written(sink, 'users/get.frreq').runs[0].validation;
    expect(validation.type).toBe('HeadersBody');
    // the header check itself is untouched - only type/httpCode/body/jsonSchema change
    expect(validation.headers).toEqual([{ key: 'X-Trace', value: '1', active: true, id: 'h1' }]);
  });

  it('accepts request: too, reading the request’s own headers rather than a run’s', async () => {
    const sink = new MemoryCollectionSink(files);
    const store = await storeWithRun();

    const result = await validationFromCase(ctxFor(sink), [store], 'request:users/get.frreq', 1, runId);

    expect(result.changed).toBe(true);
    const validation = written(sink, 'users/get.frreq').validation;
    expect(validation.type).toBe('Body'); // the request itself has no validation headers of its own
    expect(validation.httpCode).toBe(404);
  });

  it('refuses a case that errored, naming set_validation as the alternative', async () => {
    const sink = new MemoryCollectionSink(files);
    const store = await storeWithRun();

    await expect(validationFromCase(ctxFor(sink), [store], 'run:users/get.frreq#not found', 3, runId))
      .rejects.toThrow(QueryError);
    await expect(validationFromCase(ctxFor(sink), [store], 'run:users/get.frreq#not found', 3, runId))
      .rejects.toThrow(/case 3 errored \(no response to learn from\): No response: ECONNREFUSED.*set_validation/);
    expect(sink.files.get('users/get.frreq')).toBe(files['users/get.frreq']); // refused before any write
  });

  it('refuses a case with no response at all, naming set_validation as the alternative', async () => {
    const sink = new MemoryCollectionSink(files);
    const store = await storeWithRun();

    await expect(validationFromCase(ctxFor(sink), [store], 'run:users/get.frreq#not found', 4, runId))
      .rejects.toThrow(/case 4 got no response to learn from.*set_validation/);
    expect(sink.files.get('users/get.frreq')).toBe(files['users/get.frreq']);
  });

  it('refuses a response body that does not parse as JSON, naming the content-type and set_validation', async () => {
    const sink = new MemoryCollectionSink(files);
    const store = await storeWithRun();

    await expect(validationFromCase(ctxFor(sink), [store], 'run:users/get.frreq#not found', 2, runId))
      .rejects.toThrow(/case 2's response body is not JSON \(content-type text\/plain\).*set_validation/);
    expect(sink.files.get('users/get.frreq')).toBe(files['users/get.frreq']);
  });

  // The guarantee that makes it safe to commit an inferred schema: a redacted secret in the
  // recorded body (`{{$secret:name}}`) must never reach the written .frreq, in any form.
  it('never lets a redacted secret reach the inferred schema', async () => {
    const sink = new MemoryCollectionSink(files);
    const store = await storeWithRun();

    await validationFromCase(ctxFor(sink), [store], 'run:users/get.frreq#not found', 5, runId);

    const rawWritten = sink.files.get('users/get.frreq')!;
    expect(rawWritten).not.toContain('{{$secret:token}}');
    expect(rawWritten).not.toContain('token}}');
    expect(rawWritten).not.toMatch(/\{\{\$secret:/);

    const validation = written(sink, 'users/get.frreq').runs[0].validation;
    expect(JSON.parse(validation.jsonSchema.schema)).toEqual({
      type: 'object', properties: { token: { type: 'string' } }, required: ['token']
    });
  });

  it('accepts request: and run: only', async () => {
    const sink = new MemoryCollectionSink(files);
    const store = await storeWithRun();

    await expect(validationFromCase(ctxFor(sink), [store], 'collection', 1, runId))
      .rejects.toThrow(/validation_from_case accepts request:, run: \(given collection\)/);
  });

  it('reuses resolveRun: an unknown run gives the standard QueryError', async () => {
    const sink = new MemoryCollectionSink(files);
    const store = new MemoryRunStore();

    await expect(validationFromCase(ctxFor(sink), [store], 'run:users/get.frreq#not found', 1, 'nope'))
      .rejects.toThrow(/Run 'nope' not found/);
  });

  it('reuses findCase: an unknown case gives the standard QueryError', async () => {
    const sink = new MemoryCollectionSink(files);
    const store = await storeWithRun();

    await expect(validationFromCase(ctxFor(sink), [store], 'run:users/get.frreq#not found', 99, runId))
      .rejects.toThrow(/Case '99' not found\. The run has 5 cases:/);
  });
});
