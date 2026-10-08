import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { AuthenticationDetails, CreateEmptyAuthenticationDetails, PreparedRequest, applyAuthentication } from '../src';

// Credentials and date from the AWS SigV4 test suite
const signingDate = new Date(Date.UTC(2015, 7, 30, 12, 36, 0));
const aws = (signUrl: boolean): AuthenticationDetails => ({
  ...CreateEmptyAuthenticationDetails('awssig'),
  awsSig: { signUrl, accessKey: 'AKIDEXAMPLE', secretKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY', awsRegion: 'us-east-1', serviceName: 'service' }
});
const request = (method: string, body?: string): PreparedRequest =>
  ({ method, url: 'https://example.amazonaws.com/?Param1=value1', headers: { 'content-type': 'text/plain' }, body });
const signatureOf = (r: PreparedRequest) => r.headers['authorization']?.split('Signature=')[1];

describe('applyAuthentication', () => {
  it('leaves the request alone for none and inherit', async () => {
    expect(await applyAuthentication(request('GET'), CreateEmptyAuthenticationDetails('none'))).toEqual(request('GET'));
    expect(await applyAuthentication(request('GET'), undefined)).toEqual(request('GET'));
  });

  it('adds a bearer token', async () => {
    const auth = { ...CreateEmptyAuthenticationDetails('bearertoken'), bearerToken: { token: 'abc' } };
    expect((await applyAuthentication(request('GET'), auth)).headers['Authorization']).toBe('Bearer abc');
  });

  it('adds basic auth (RFC 7617 example)', async () => {
    const auth = { ...CreateEmptyAuthenticationDetails('basicauth'), basicAuth: { userName: 'Aladdin', password: 'open sesame' } };
    expect((await applyAuthentication(request('GET'), auth)).headers['Authorization']).toBe('Basic QWxhZGRpbjpvcGVuIHNlc2FtZQ==');
  });

  it('signs AWS SigV4 headers over the real method and body', async () => {
    const signed = await applyAuthentication(request('POST', 'hello'), aws(false), signingDate);

    expect(signed.headers['authorization']).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/20150830\/us-east-1\/service\/aws4_request, /);
    expect(signed.headers['x-amz-date']).toBe('20150830T123600Z');
    expect(signed.headers['x-amz-content-sha256']).toBe(createHash('sha256').update('hello').digest('hex'));
    expect(signed.url).toBe('https://example.amazonaws.com/?Param1=value1');
  });

  it('produces a different signature when the method or body changes', async () => {
    const get = signatureOf(await applyAuthentication(request('GET'), aws(false), signingDate));
    const post = signatureOf(await applyAuthentication(request('POST'), aws(false), signingDate));
    const postBody = signatureOf(await applyAuthentication(request('POST', 'hello'), aws(false), signingDate));

    expect(new Set([get, post, postBody]).size).toBe(3);
  });

  it('presigns the URL when signUrl is set', async () => {
    const signed = await applyAuthentication(request('GET'), aws(true), signingDate);
    const query = new URL(signed.url).searchParams;

    expect(query.get('Param1')).toBe('value1');
    expect(query.get('X-Amz-Credential')).toBe('AKIDEXAMPLE/20150830/us-east-1/service/aws4_request');
    expect(query.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('does not mutate the request it is given', async () => {
    const original = request('POST', 'hello');
    await applyAuthentication(original, aws(false), signingDate);
    expect(original).toEqual(request('POST', 'hello'));
  });
});
