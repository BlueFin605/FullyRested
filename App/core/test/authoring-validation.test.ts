import { describe, expect, it, vi } from 'vitest';
import { removeSetting, setValidation, setValidationHeader } from '../src/authoring';
import { MemoryCollectionSink } from '../src/collection-sink';
import { QueryError } from '../src/query-error';
import { files } from './fixtures/collection';

const guid = { generateGUID: () => 'generated' };
const secrets = { get: async () => null, set: vi.fn(async () => { }) };
const ctxFor = (sink: MemoryCollectionSink) =>
  ({ collectionFile: 'api.frcol', source: sink, sink, secrets, guid });

const written = (sink: MemoryCollectionSink, file: string) => JSON.parse(sink.files.get(file)!);

const schema = JSON.stringify({ type: 'object', required: ['id'], properties: { id: { type: 'integer' } } });

// A fixture with a run that already has a schema-checking validation, for the "leaves it alone"
// and "clears it" cases: the shared fixture's run has no validation at all.
const filesWithSchema = {
  ...files,
  'users/get.frreq': JSON.stringify({
    id: 'r1', name: 'Get user', verb: 'get', url: 'https://x/u',
    runs: [{
      id: 'n1', name: 'not found',
      validation: { type: 'HeadersBody', httpCode: 200, body: 'JsonSchema', jsonSchema: { schema }, headers: [] }
    }]
  })
};

describe('setValidation', () => {
  it('sets httpCode on a run, leaving its existing schema intact', async () => {
    const sink = new MemoryCollectionSink(filesWithSchema);
    const result = await setValidation(ctxFor(sink), 'run:users/get.frreq#not found', { httpCode: 404 });

    expect(result).toMatchObject({ file: 'users/get.frreq', changed: true });
    const validation = written(sink, 'users/get.frreq').runs[0].validation;
    expect(validation.httpCode).toBe(404);
    expect(validation.type).toBe('HeadersBody');
    expect(validation.body).toBe('JsonSchema');
    expect(validation.jsonSchema).toEqual({ schema });
  });

  it("setting jsonSchema alone implies body: 'JsonSchema'", async () => {
    const sink = new MemoryCollectionSink(files);
    const result = await setValidation(ctxFor(sink), 'request:users/get.frreq', { jsonSchema: schema });

    expect(result.changed).toBe(true);
    const validation = written(sink, 'users/get.frreq').validation;
    expect(validation.body).toBe('JsonSchema');
    expect(validation.jsonSchema).toEqual({ schema });
  });

  it('accepts and stores a schema carrying a draft-07 $schema line, the same as validateJson does at send time', async () => {
    const sink = new MemoryCollectionSink(files);
    const draft07Schema = JSON.stringify({
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object', required: ['id'], properties: { id: { type: 'integer' } }
    });

    const result = await setValidation(ctxFor(sink), 'request:users/get.frreq', { jsonSchema: draft07Schema });

    expect(result.changed).toBe(true);
    const validation = written(sink, 'users/get.frreq').validation;
    expect(validation.jsonSchema).toEqual({ schema: draft07Schema });
  });

  it("setting jsonSchema together with body: 'None' in one call: the explicit body: 'None' wins and clears the schema", async () => {
    const sink = new MemoryCollectionSink(filesWithSchema);
    const otherSchema = JSON.stringify({ type: 'object', required: ['name'] });
    const result = await setValidation(ctxFor(sink), 'run:users/get.frreq#not found', { jsonSchema: otherSchema, body: 'None' });

    expect(result.changed).toBe(true);
    const validation = written(sink, 'users/get.frreq').runs[0].validation;
    expect(validation.body).toBe('None');
    expect(validation.jsonSchema).toBeUndefined();
  });

  it("setting body: 'None' clears jsonSchema to undefined", async () => {
    const sink = new MemoryCollectionSink(filesWithSchema);
    const result = await setValidation(ctxFor(sink), 'run:users/get.frreq#not found', { body: 'None' });

    expect(result.changed).toBe(true);
    const validation = written(sink, 'users/get.frreq').runs[0].validation;
    expect(validation.body).toBe('None');
    expect(validation.jsonSchema).toBeUndefined();
  });

  it('matches type and body without regard to case', async () => {
    const sink = new MemoryCollectionSink(files);
    const result = await setValidation(ctxFor(sink), 'request:users/get.frreq', { type: 'headersbody', body: 'jsonschema' });

    expect(result.changed).toBe(true);
    const validation = written(sink, 'users/get.frreq').validation;
    expect(validation.type).toBe('HeadersBody');
    expect(validation.body).toBe('JsonSchema');
  });

  it('rejects a schema that is not valid JSON', async () => {
    const sink = new MemoryCollectionSink(files);
    await expect(setValidation(ctxFor(sink), 'request:users/get.frreq', { jsonSchema: '{not json' }))
      .rejects.toThrow(QueryError);
    expect(sink.files.get('users/get.frreq')).toBe(files['users/get.frreq']);
  });

  it('rejects a schema that does not compile under Ajv, with the Ajv message', async () => {
    const sink = new MemoryCollectionSink(files);
    const badSchema = JSON.stringify({ type: 'not-a-real-type' });

    await expect(setValidation(ctxFor(sink), 'request:users/get.frreq', { jsonSchema: badSchema }))
      .rejects.toThrow(QueryError);
    // Pins a distinctive fragment of Ajv's own compiler message, not just the wrapper text
    // ("jsonSchema does not compile: ...") that would still pass even if Ajv's detail were dropped.
    await expect(setValidation(ctxFor(sink), 'request:users/get.frreq', { jsonSchema: badSchema }))
      .rejects.toThrow(/data\/type must be equal to one of the allowed values/);
    expect(sink.files.get('users/get.frreq')).toBe(files['users/get.frreq']);
  });

  it('rejects an unknown type with the list of values it takes', async () => {
    const sink = new MemoryCollectionSink(files);
    await expect(setValidation(ctxFor(sink), 'request:users/get.frreq', { type: 'Bogus' }))
      .rejects.toThrow(/Unknown validation type 'Bogus'.*Inherit, None, ResponseCode, Headers, Body, HeadersBody/);
    expect(sink.files.get('users/get.frreq')).toBe(files['users/get.frreq']);
  });

  it('rejects an unknown body with the list of values it takes', async () => {
    const sink = new MemoryCollectionSink(files);
    await expect(setValidation(ctxFor(sink), 'request:users/get.frreq', { body: 'Bogus' }))
      .rejects.toThrow(/Unknown validation body 'Bogus'.*None, JsonSchema/);
    expect(sink.files.get('users/get.frreq')).toBe(files['users/get.frreq']);
  });

  it('refuses a collection locator', async () => {
    const sink = new MemoryCollectionSink(files);
    await expect(setValidation(ctxFor(sink), 'collection', { httpCode: 200 }))
      .rejects.toThrow(/set_validation accepts request:, run: \(given collection\)/);
  });

  it('reports no change, and writes nothing, when the validation is already that', async () => {
    const sink = new MemoryCollectionSink(files);
    await setValidation(ctxFor(sink), 'request:users/get.frreq', { httpCode: 404 });
    const before = sink.files.get('users/get.frreq');

    const result = await setValidation(ctxFor(sink), 'request:users/get.frreq', { httpCode: 404 });
    expect(result.changed).toBe(false);
    expect(sink.files.get('users/get.frreq')).toBe(before);
  });
});

describe('setValidationHeader', () => {
  it('upserts a validation header, case-insensitively on the name', async () => {
    const sink = new MemoryCollectionSink(files);
    const result = await setValidationHeader(ctxFor(sink), 'run:users/get.frreq#not found', 'X-Trace', '1');

    expect(result).toMatchObject({ file: 'users/get.frreq', changed: true });
    expect(written(sink, 'users/get.frreq').runs[0].validation.headers)
      .toEqual([{ key: 'X-Trace', value: '1', active: true, id: 'generated' }]);

    const second = await setValidationHeader(ctxFor(sink), 'run:users/get.frreq#not found', 'x-trace', '2');
    expect(second.changed).toBe(true);
    // the new call's casing replaces the old entry, same as setHeader
    expect(written(sink, 'users/get.frreq').runs[0].validation.headers)
      .toEqual([{ key: 'x-trace', value: '2', active: true, id: 'generated' }]);
  });

  it('is removed by removeSetting, reading the same validation.headers it writes', async () => {
    const sink = new MemoryCollectionSink(files);
    await setValidationHeader(ctxFor(sink), 'request:users/get.frreq', 'X-Trace', '1');

    const result = await removeSetting(ctxFor(sink), 'request:users/get.frreq', 'validation-header', 'x-trace');
    expect(result.changed).toBe(true);
    expect(written(sink, 'users/get.frreq').validation.headers).toEqual([]);
  });

  it('refuses a collection locator', async () => {
    const sink = new MemoryCollectionSink(files);
    await expect(setValidationHeader(ctxFor(sink), 'collection', 'X-Trace', '1'))
      .rejects.toThrow(/set_validation_header accepts request:, run: \(given collection\)/);
  });

  it('reports no change, and writes nothing, when the header is already that', async () => {
    const sink = new MemoryCollectionSink(files);
    await setValidationHeader(ctxFor(sink), 'request:users/get.frreq', 'X-Trace', '1');
    const before = sink.files.get('users/get.frreq');

    const result = await setValidationHeader(ctxFor(sink), 'request:users/get.frreq', 'X-Trace', '1');
    expect(result.changed).toBe(false);
    expect(sink.files.get('users/get.frreq')).toBe(before);
  });
});
