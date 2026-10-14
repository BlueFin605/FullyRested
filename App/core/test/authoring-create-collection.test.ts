import { describe, expect, it } from 'vitest';
import { MemoryCollectionSink } from '../src/collection-sink';
import { newCollection, newEnvironment, selectEnvironment } from '../src/authoring';
import { QueryError } from '../src/query-error';

let n = 0;
const guid = { generateGUID: () => `g${++n}` };
const secrets = { get: async () => null, set: async () => { } };
const ctxFor = (sink: MemoryCollectionSink) => ({ collectionFile: 'api.frcol', source: sink, sink, secrets, guid });

describe('create verbs', () => {
  it('newCollection writes a valid .frcol with the environments asked for', async () => {
    const sink = new MemoryCollectionSink();
    await newCollection(ctxFor(sink), 'api.frcol', ['Dev', 'Production']);
    const config = JSON.parse(sink.files.get('api.frcol')!);
    expect(config.collectionGuid).toBeTruthy();
    expect(config.environments.map((e: any) => e.name)).toEqual(['Dev', 'Production']);
    expect(config.selectedEnvironmentId).toBe(config.environments[0].id);
    expect(config.collectionEnvironment.headers).toEqual([]);
  });

  it('newCollection refuses a non-frcol name and an existing file', async () => {
    const sink = new MemoryCollectionSink({ 'api.frcol': '{}' });
    await expect(newCollection(ctxFor(sink), 'api.txt')).rejects.toThrow(/\.frcol/);
    await expect(newCollection(ctxFor(sink), 'api.frcol')).rejects.toThrow(/already exists/);
  });

  it('newEnvironment adds one and refuses a duplicate name', async () => {
    const sink = new MemoryCollectionSink({ 'api.frcol': JSON.stringify({ collectionGuid: 'c1', environments: [] }) });
    await newEnvironment(ctxFor(sink), 'Production');
    expect(JSON.parse(sink.files.get('api.frcol')!).environments[0].name).toBe('Production');
    await expect(newEnvironment(ctxFor(sink), 'Production')).rejects.toThrow(QueryError);
  });

  it('selectEnvironment sets the selection and is a no-op when already selected', async () => {
    const sink = new MemoryCollectionSink({ 'api.frcol': JSON.stringify({ collectionGuid: 'c1', environments: [{ name: 'Dev', id: 'e1' }, { name: 'Prod', id: 'e2' }], selectedEnvironmentId: 'e1' }) });
    expect((await selectEnvironment(ctxFor(sink), 'Prod')).changed).toBe(true);
    expect(JSON.parse(sink.files.get('api.frcol')!).selectedEnvironmentId).toBe('e2');
    expect((await selectEnvironment(ctxFor(sink), 'Prod')).changed).toBe(false);
    await expect(selectEnvironment(ctxFor(sink), 'Nope')).rejects.toThrow(/Dev/);
  });
});
