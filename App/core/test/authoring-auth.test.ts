import { describe, expect, it, vi } from 'vitest';
import { setAuth } from '../src/authoring';
import { MemoryCollectionSink } from '../src/collection-sink';
import { QueryError } from '../src/query-error';
import { files } from './fixtures/collection';

const guid = { generateGUID: () => 'generated' };
const newSecrets = () => ({ get: async () => null, set: vi.fn(async () => { }) });
const ctxFor = (sink: MemoryCollectionSink, secrets = newSecrets()) =>
  ({ collectionFile: 'api.frcol', source: sink, sink, secrets, guid });

const written = (sink: MemoryCollectionSink, file: string) => JSON.parse(sink.files.get(file)!);

describe('setAuth', () => {
  it('sets bearertoken on a run, with the token held as a secret reference', async () => {
    const sink = new MemoryCollectionSink(files);
    const secrets = newSecrets();
    const result = await setAuth(ctxFor(sink, secrets), 'run:users/get.frreq#not found', 'bearertoken', { token: '{{$token}}' });

    expect(result).toMatchObject({ file: 'users/get.frreq', scope: 'run:users/get.frreq#not found', changed: true });
    const action = written(sink, 'users/get.frreq');
    expect(action.runs[0].authentication.authentication).toBe('bearertoken');
    expect(action.runs[0].authentication.bearerToken).toEqual({ token: '{{$token}}' });
    // the request itself is left alone, and no secret value ever reaches the store
    expect(action.authentication.authentication).toBe('inherit');
    expect(secrets.set).not.toHaveBeenCalled();
  });

  it('sets basicauth with a user name on a folder, leaving the password empty', async () => {
    const sink = new MemoryCollectionSink(files);
    const result = await setAuth(ctxFor(sink), 'folder:users', 'basicauth', { userName: 'api' });

    expect(result).toMatchObject({ file: 'users/folder.frfolder', changed: true });
    const config = written(sink, 'users/folder.frfolder');
    expect(config.auth.authentication).toBe('basicauth');
    expect(config.auth.basicAuth).toEqual({ userName: 'api', password: '' });
  });

  it('sets awssig with a region and a service on the collection, leaving the secret key empty', async () => {
    const sink = new MemoryCollectionSink(files);
    const result = await setAuth(ctxFor(sink), 'collection', 'awssig',
      { accessKey: 'AKIAEXAMPLE', awsRegion: 'ap-southeast-2', serviceName: 'execute-api', signUrl: true });

    expect(result).toMatchObject({ file: 'api.frcol', changed: true });
    const auth = written(sink, 'api.frcol').collectionEnvironment.auth;
    expect(auth.authentication).toBe('awssig');
    expect(auth.awsSig).toEqual({
      signUrl: true, accessKey: 'AKIAEXAMPLE', secretKey: '', sessionToken: '',
      awsRegion: 'ap-southeast-2', serviceName: 'execute-api'
    });
  });

  it('matches the type without regard to case', async () => {
    const sink = new MemoryCollectionSink(files);
    await setAuth(ctxFor(sink), 'env:Production', 'BearerToken', { token: '{{$token}}' });

    expect(written(sink, 'api.frcol').environments[0].auth.authentication).toBe('bearertoken');
  });

  it('sets inherit, keeping the fields of the type it switched away from', async () => {
    const sink = new MemoryCollectionSink(files);
    await setAuth(ctxFor(sink), 'env:Production', 'bearertoken', { token: '{{$token}}' });

    const result = await setAuth(ctxFor(sink), 'env:Production', 'inherit');
    expect(result.changed).toBe(true);
    const auth = written(sink, 'api.frcol').environments[0].auth;
    expect(auth.authentication).toBe('inherit');
    expect(auth.bearerToken).toEqual({ token: '{{$token}}' });
  });

  it('sets none', async () => {
    const sink = new MemoryCollectionSink(files);
    const result = await setAuth(ctxFor(sink), 'env:Production', 'none');

    expect(result.changed).toBe(true);
    expect(written(sink, 'api.frcol').environments[0].auth.authentication).toBe('none');
  });

  it('ignores fields belonging to another type rather than failing', async () => {
    const sink = new MemoryCollectionSink(files);
    await setAuth(ctxFor(sink), 'request:users/get.frreq', 'basicauth', { userName: 'api', token: '{{$token}}' });

    const auth = written(sink, 'users/get.frreq').authentication;
    expect(auth.authentication).toBe('basicauth');
    expect(auth.basicAuth.userName).toBe('api');
    // the token belongs to bearertoken, so it is dropped rather than written or refused
    expect(auth.bearerToken).toEqual({ token: '' });
  });

  it('rejects an unknown type with the list of the types it takes', async () => {
    const sink = new MemoryCollectionSink(files);
    await expect(setAuth(ctxFor(sink), 'collection', 'oauth2')).rejects.toThrow(QueryError);
    await expect(setAuth(ctxFor(sink), 'collection', 'oauth2'))
      .rejects.toThrow(/Unknown authentication type 'oauth2'.*inherit, none, basicauth, bearertoken, awssig/);
    expect(sink.files.get('api.frcol')).toBe(files['api.frcol']);
  });

  it('rejects a missing type with a QueryError rather than throwing on toLowerCase', async () => {
    const sink = new MemoryCollectionSink(files);
    await expect(setAuth(ctxFor(sink), 'collection', undefined as unknown as string))
      .rejects.toThrow(QueryError);
    await expect(setAuth(ctxFor(sink), 'collection', undefined as unknown as string))
      .rejects.toThrow(/Unknown authentication type 'undefined'.*inherit, none, basicauth, bearertoken, awssig/);
    expect(sink.files.get('api.frcol')).toBe(files['api.frcol']);
  });

  it('reports no change, and writes nothing, when the auth is already what was asked for', async () => {
    const sink = new MemoryCollectionSink(files);
    await setAuth(ctxFor(sink), 'request:users/get.frreq', 'basicauth', { userName: 'api' });
    const before = sink.files.get('users/get.frreq');

    const result = await setAuth(ctxFor(sink), 'request:users/get.frreq', 'basicauth', { userName: 'api' });
    expect(result.changed).toBe(false);
    expect(sink.files.get('users/get.frreq')).toBe(before);
  });

  it('writes authentication on a request and auth on a folder', async () => {
    const sink = new MemoryCollectionSink(files);
    await setAuth(ctxFor(sink), 'request:users/get.frreq', 'none');
    await setAuth(ctxFor(sink), 'folder:users', 'none');

    const action = written(sink, 'users/get.frreq');
    expect(action.authentication.authentication).toBe('none');
    expect(action.auth).toBeUndefined();

    const config = written(sink, 'users/folder.frfolder');
    expect(config.auth.authentication).toBe('none');
    expect(config.authentication).toBeUndefined();
  });
});
