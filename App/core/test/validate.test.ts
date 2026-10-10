import { describe, it, expect } from 'vitest';
import {
  CreateEmptyRestActionValidation, ExecuteRestAction, RestActionResult, RestActionValidation, ValidationType, ValidationTypeBody,
  bodyToString, decodeContentType, validateResponse
} from '../src';

const response = (status: number, body: string | undefined, headers: { [h: string]: string } = {}): RestActionResult => ({
  status,
  statusText: '',
  headers,
  headersSent: {},
  body: body === undefined ? undefined : { contentType: 'application/json; charset=utf-8', body: new TextEncoder().encode(body).buffer },
  validated: undefined
});

const actionWith = (validation: Partial<RestActionValidation>) =>
  ExecuteRestAction.NewExecuteRestAction()
    .setValidation({ ...CreateEmptyRestActionValidation(ValidationType.ResponseCode), ...validation })
    .variables_pushFront([{ variable: 'expected', value: 'yes', active: true, id: '1' }]);

const schema = JSON.stringify({
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  required: ['id', 'title'],
  properties: { id: { type: 'integer' }, title: { type: 'string' } }
});

describe('content type helpers', () => {
  it('splits a content type and reads its charset', () => {
    expect(decodeContentType('text/html; charset=ISO-8859-1')).toEqual({ part1: 'text', part2: 'html', encoding: 'ISO-8859-1' });
    expect(decodeContentType('application/json')).toEqual({ part1: 'application', part2: 'json', encoding: 'utf-8' });
  });

  it('decodes a body using its charset, and returns empty text for no body', () => {
    expect(bodyToString('text/plain; charset=utf-8', new TextEncoder().encode('héllo').buffer)).toBe('héllo');
    expect(bodyToString('text/plain', undefined)).toBe('');
  });
});

describe('validateResponse', () => {
  it('returns undefined when validation is None', () => {
    expect(validateResponse(actionWith({ type: ValidationType.None }), response(200, '{}'))).toBeUndefined();
  });

  it('fails on a status code mismatch', () => {
    expect(validateResponse(actionWith({ httpCode: 201 }), response(200, '{}')))
      .toEqual({
        information: [], errors: ["Http response code does not match '201'"], valid: false,
        checks: [{ check: 'status', passed: false, errors: ["Http response code does not match '201'"] }]
      });
  });

  describe('reports every check', () => {
    const headers = [{ key: 'X-Test', value: 'yes', active: true, id: '1' }];
    const full = { type: ValidationType.HeadersBody, body: ValidationTypeBody.JsonSchema, jsonSchema: { schema }, headers };

    it('collects status, body and header failures in order', () => {
      const result = validateResponse(actionWith({ ...full, httpCode: 201 }), response(200, '{"id":"1","title":"x"}', { 'x-test': 'no' }));
      expect(result?.valid).toBe(false);
      expect(result?.checks?.map(c => [c.check, c.passed])).toEqual([['status', false], ['body', false], ['headers', false]]);
      expect(result?.errors).toEqual([
        "Http response code does not match '201'",
        '/id must be integer',
        'incorrect header key[X-Test] value[yes]'
      ]);
    });

    it('fails only the status check when body and headers are fine', () => {
      const result = validateResponse(actionWith({ ...full, httpCode: 201 }), response(200, '{"id":1,"title":"x"}', { 'x-test': 'yes' }));
      expect(result?.valid).toBe(false);
      expect(result?.checks?.map(c => [c.check, c.passed])).toEqual([['status', false], ['body', true], ['headers', true]]);
    });

    it('still runs headers when the body is not JSON', () => {
      const result = validateResponse(actionWith(full), response(200, '<html/>', { 'x-test': 'no' }));
      expect(result?.checks?.[1]).toEqual({ check: 'body', passed: false, errors: ['Response body is not valid JSON'] });
      expect(result?.checks?.[2].check).toBe('headers');
      expect(result?.checks?.[2].passed).toBe(false);
    });

    it('reports only the status check for ResponseCode validation', () => {
      expect(validateResponse(actionWith({}), response(200, '{}'))?.checks).toEqual([{ check: 'status', passed: true, errors: [] }]);
    });
  });

  it('passes a matching status code', () => {
    expect(validateResponse(actionWith({}), response(200, '{}'))?.valid).toBe(true);
  });

  it('checks headers case-insensitively after substituting variables', () => {
    const headers = [{ key: 'X-Test', value: '{{expected}}', active: true, id: '1' }];
    expect(validateResponse(actionWith({ type: ValidationType.Headers, headers }), response(200, '{}', { 'x-test': 'yes' }))?.valid).toBe(true);
    expect(validateResponse(actionWith({ type: ValidationType.Headers, headers }), response(200, '{}', { 'x-test': 'no' }))?.errors)
      .toEqual(['incorrect header key[X-Test] value[yes]']);
  });

  it('validates the body against a JSON schema (any $schema draft is treated as 2020-12)', () => {
    const validation = { type: ValidationType.Body, body: ValidationTypeBody.JsonSchema, jsonSchema: { schema } };
    expect(validateResponse(actionWith(validation), response(200, '{"id":1,"title":"x"}'))?.valid).toBe(true);
    expect(validateResponse(actionWith(validation), response(200, '{"id":"1"}'))?.errors)
      .toEqual(["/ must have required property 'title'", '/id must be integer']);
  });

  it('reports a body that is not JSON, and an invalid schema', () => {
    const validation = { type: ValidationType.Body, body: ValidationTypeBody.JsonSchema, jsonSchema: { schema } };
    expect(validateResponse(actionWith(validation), response(200, '<html/>'))?.errors).toEqual(['Response body is not valid JSON']);
    const badSchema = { ...validation, jsonSchema: { schema: '{"type":"nonsense"}' } };
    expect(validateResponse(actionWith(badSchema), response(200, '{}'))?.errors?.[0]).toMatch(/^JSON schema is invalid: /);
  });

  it('treats an empty body as no payload', () => {
    const validation = { type: ValidationType.Body, body: ValidationTypeBody.None };
    expect(validateResponse(actionWith(validation), response(200, ''))?.valid).toBe(true);
    expect(validateResponse(actionWith(validation), response(200, '{}'))?.errors).toEqual(['Response had payload when none was expected']);
  });
});
