import { describe, expect, it } from 'vitest';
import { MemoryCollectionSink } from '../src/collection-sink';
import { newRun } from '../src/authoring';
import { QueryError } from '../src/query-error';

let n = 0;
const guid = { generateGUID: () => `g${++n}` };
const secrets = { get: async () => null, set: async () => { } };
const files = {
  'api.frcol': JSON.stringify({ collectionGuid: 'c1', environments: [] }),
  'users/get.frreq': JSON.stringify({ id: 'r1', name: 'Get user', verb: 'get', url: 'https://x/u', runs: [{ id: 'n1', name: 'happy path' }] })
};
const ctxFor = (sink: MemoryCollectionSink) => ({ collectionFile: 'api.frcol', source: sink, sink, secrets, guid });

describe('newRun', () => {
  it('adds a run that inherits validation', async () => {
    const sink = new MemoryCollectionSink(files);
    const result = await newRun(ctxFor(sink), 'users/get.frreq', 'not found');
    expect(result).toMatchObject({ file: 'users/get.frreq', changed: true });
    const runs = JSON.parse(sink.files.get('users/get.frreq')!).runs;
    expect(runs.map((r: any) => r.name)).toEqual(['happy path', 'not found']);
    const added = runs[1];
    expect(added.id).toBeTruthy();
    expect(added.validation.type).toBe('Inherit');
    expect(added.variables).toEqual([]);
    expect(added.secrets).toEqual([]);
  });

  it('refuses a duplicate name and an empty name', async () => {
    const sink = new MemoryCollectionSink(files);
    await expect(newRun(ctxFor(sink), 'users/get.frreq', 'happy path')).rejects.toThrow(QueryError);
    await expect(newRun(ctxFor(sink), 'users/get.frreq', 'happy path')).rejects.toThrow(/happy path/);
    await expect(newRun(ctxFor(sink), 'users/get.frreq', '')).rejects.toThrow(/name/);
  });

  it('reports an unknown request by listing the ones that exist', async () => {
    const sink = new MemoryCollectionSink(files);
    await expect(newRun(ctxFor(sink), 'users/nope.frreq', 'x')).rejects.toThrow(/users\/get.frreq/);
  });
});
