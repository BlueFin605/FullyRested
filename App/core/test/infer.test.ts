import { describe, expect, it } from 'vitest';
import { inferSchema } from '../src/infer';
import { compileSchema } from '../src/validate';

describe('inferSchema', () => {
  it('infers an object with every key required and no additionalProperties', () => {
    expect(inferSchema({ id: 1, name: 'a' })).toEqual({
      type: 'object',
      properties: { id: { type: 'integer' }, name: { type: 'string' } },
      required: ['id', 'name']
    });
  });

  it('merges array elements: properties unioned, required intersected', () => {
    expect(inferSchema([{ a: 1 }, { a: 2, b: 'x' }])).toEqual({
      type: 'array',
      items: {
        type: 'object',
        properties: { a: { type: 'integer' }, b: { type: 'string' } },
        required: ['a']
      }
    });
  });

  it('leaves items off an empty array', () => {
    expect(inferSchema([])).toEqual({ type: 'array' });
  });

  it('uses integer only when every value is integral', () => {
    expect(inferSchema([1, 2])).toEqual({ type: 'array', items: { type: 'integer' } });
    expect(inferSchema([1, 2.5])).toEqual({ type: 'array', items: { type: 'number' } });
  });

  it('unions null into the type', () => {
    expect(inferSchema({ a: null })).toEqual({
      type: 'object', properties: { a: { type: 'null' } }, required: ['a']
    });
    expect(inferSchema([null, 'x'])).toEqual({ type: 'array', items: { type: ['null', 'string'] } });
  });

  it('adds no enum, format or pattern for a string', () => {
    expect(inferSchema('2026-10-11T00:00:00Z')).toEqual({ type: 'string' });
  });

  it('nests', () => {
    expect(inferSchema({ user: { id: 1 }, tags: ['a'] })).toEqual({
      type: 'object',
      properties: {
        user: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
        tags: { type: 'array', items: { type: 'string' } }
      },
      required: ['user', 'tags']
    });
  });

  // Beyond the ticket's table: a mixed array of an object and a primitive. Properties/required
  // from the object branch are preserved as-is (a non-object element contributes no constraint,
  // rather than diluting required down to empty) since `properties`/`required` are no-ops against
  // a non-object instance anyway - this keeps per-branch information precise.
  it('merges an object and a primitive in the same array into a union type, keeping the object required intact', () => {
    expect(inferSchema([{ a: 1 }, 'x'])).toEqual({
      type: 'array',
      items: {
        type: ['object', 'string'],
        properties: { a: { type: 'integer' } },
        required: ['a']
      }
    });
  });

  // A genuinely empty object alongside a non-empty one *is* a real data point, and does narrow
  // required - unlike the non-object case above.
  it('intersects required down to empty when one element is an object with no keys', () => {
    expect(inferSchema([{ a: 1 }, {}])).toEqual({
      type: 'array',
      items: { type: 'object', properties: { a: { type: 'integer' } }, required: [] }
    });
  });

  // Differing primitive types at the same object key union, same as the top-level array case.
  it('unions differing primitive types observed at the same object key', () => {
    expect(inferSchema([{ a: 1 }, { a: 'x' }])).toEqual({
      type: 'array',
      items: {
        type: 'object',
        properties: { a: { type: ['integer', 'string'] } },
        required: ['a']
      }
    });
  });

  // Nested arrays merge their item schemas recursively, same as nested objects.
  it('merges an array of arrays', () => {
    expect(inferSchema([[1, 2], [3, 4]])).toEqual({
      type: 'array',
      items: { type: 'array', items: { type: 'integer' } }
    });
  });

  it('never emits $schema', () => {
    expect(inferSchema({ a: 1 })).not.toHaveProperty('$schema');
  });

  // Step 5: round-trip every case above through the real Ajv setup, so a schema that looks
  // plausible but does not actually validate its own sample is caught.
  describe('round-trip through compileSchema', () => {
    const cases: unknown[] = [
      { id: 1, name: 'a' },
      [{ a: 1 }, { a: 2, b: 'x' }],
      [],
      [1, 2],
      [1, 2.5],
      { a: null },
      [null, 'x'],
      '2026-10-11T00:00:00Z',
      { user: { id: 1 }, tags: ['a'] },
      [{ a: 1 }, 'x'],
      [{ a: 1 }, {}],
      [{ a: 1 }, { a: 'x' }],
      [[1, 2], [3, 4]]
    ];

    it.each(cases)('validates the original value against its inferred schema: %j', value => {
      const schema = inferSchema(value);
      const validate = compileSchema(schema);
      const ok = validate(value);
      expect(ok, JSON.stringify(validate.errors)).toBe(true);
    });
  });
});
