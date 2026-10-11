import { describe, expect, it } from 'vitest';
import { MemoryCollectionSink } from '../src/collection-sink';
import { newFolder, newRequest } from '../src/authoring';

let n = 0;
const guid = { generateGUID: () => `g${++n}` };
const secrets = { get: async () => null, set: async () => { } };
const ctxFor = (sink: MemoryCollectionSink) => ({ collectionFile: 'api.frcol', source: sink, sink, secrets, guid });
const base = { 'api.frcol': JSON.stringify({ collectionGuid: 'c1', environments: [] }) };

describe('newFolder / newRequest', () => {
  it('newFolder makes the directory and writes no settings file', async () => {
    const sink = new MemoryCollectionSink(base);
    await newFolder(ctxFor(sink), 'users/admin');
    expect(await sink.exists('users/admin')).toBe(true);
    expect(await sink.exists('users/admin/folder.frfolder')).toBe(false);
    await expect(newFolder(ctxFor(sink), 'users/admin')).rejects.toThrow(/already exists/);
  });

  it('newRequest writes a normalised request named after its file', async () => {
    const sink = new MemoryCollectionSink(base);
    const result = await newRequest(ctxFor(sink), 'users/get.frreq', 'GET', 'https://example.com/users');
    expect(result.file).toBe('users/get.frreq');
    const action = JSON.parse(sink.files.get('users/get.frreq')!);
    expect(action).toMatchObject({ name: 'get', verb: 'get', protocol: 'https', url: 'https://example.com/users' });
    expect(action.id).toBeTruthy();
    expect(action.headers).toEqual([]);
    expect(action.runs).toEqual([]);
    expect(action.validation.type).toBe('None');
  });

  it('newRequest refuses a bad extension, an unknown verb and an existing file', async () => {
    const sink = new MemoryCollectionSink(base);
    await expect(newRequest(ctxFor(sink), 'users/get.json', 'get', 'https://x')).rejects.toThrow(/\.frreq/);
    await expect(newRequest(ctxFor(sink), 'users/get.frreq', 'fetch', 'https://x')).rejects.toThrow(/get, post/);
    await newRequest(ctxFor(sink), 'users/get.frreq', 'get', 'https://x');
    await expect(newRequest(ctxFor(sink), 'users/get.frreq', 'get', 'https://x')).rejects.toThrow(/already exists/);
  });
});
