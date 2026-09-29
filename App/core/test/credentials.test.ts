import { describe, it, expect } from 'vitest';
import { isRawCredential } from '../src';

describe('isRawCredential', () => {
  it('accepts empty fields and fields made only of secret references', () => {
    expect(isRawCredential(undefined)).toBe(false);
    expect(isRawCredential('')).toBe(false);
    expect(isRawCredential('{{$awsSecret}}')).toBe(false);
    expect(isRawCredential(' {{$user}}{{$pass}} ')).toBe(false);
  });

  it('flags literal values, plain variables and partly-literal values', () => {
    expect(isRawCredential('AKIAEXAMPLE')).toBe(true);
    expect(isRawCredential('{{awsKey}}')).toBe(true);
    expect(isRawCredential('Bearer {{$token}}')).toBe(true);
  });
});
