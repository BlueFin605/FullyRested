import { describe, expect, it } from 'vitest';
import { MemoryCollectionSink } from '../src/collection-sink';

describe('MemoryCollectionSink', () => {
  it('round-trips a file and reports it in its directory', async () => {
    const sink = new MemoryCollectionSink({ 'api.frcol': '{}' });
    await sink.writeText('users/get.frreq', '{"id":"1"}');
    expect(await sink.readText('users/get.frreq')).toBe('{"id":"1"}');
    expect(await sink.exists('users/get.frreq')).toBe(true);
    expect(await sink.listDir('')).toEqual([
      { name: 'api.frcol', isDirectory: false },
      { name: 'users', isDirectory: true }
    ]);
    expect(await sink.listDir('users')).toEqual([{ name: 'get.frreq', isDirectory: false }]);
  });

  it('reports a directory made with mkdir as existing and empty', async () => {
    const sink = new MemoryCollectionSink();
    await sink.mkdir('users');
    expect(await sink.exists('users')).toBe(true);
    expect(await sink.listDir('users')).toEqual([]);
  });

  it('remove deletes a file, or a directory and everything under it', async () => {
    const sink = new MemoryCollectionSink({ 'users/get.frreq': '{}', 'users/sub/post.frreq': '{}' });
    await sink.remove('users/get.frreq');
    expect(await sink.exists('users/get.frreq')).toBe(false);
    await sink.remove('users');
    expect(await sink.exists('users/sub/post.frreq')).toBe(false);
    expect(await sink.exists('users')).toBe(false);
  });

  it('readText on a missing file rejects', async () => {
    await expect(new MemoryCollectionSink().readText('nope.frreq')).rejects.toThrow(/nope.frreq/);
  });
});
