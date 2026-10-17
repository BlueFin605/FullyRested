import { describe, it, expect } from 'vitest';
import { QueryError, validateTimeoutMs } from '../src';

describe('validateTimeoutMs', () => {
  it('accepts a positive whole number of milliseconds', () => {
    expect(validateTimeoutMs(1)).toBe(1);
    expect(validateTimeoutMs(5000)).toBe(5000);
  });

  it.each([0, -1, 1.5, NaN, Infinity, '100', undefined, null])('rejects %s with a QueryError naming the label', value => {
    expect(() => validateTimeoutMs(value, '--timeout')).toThrow(QueryError);
    expect(() => validateTimeoutMs(value, '--timeout')).toThrow(/--timeout must be a positive whole number/);
  });
});
