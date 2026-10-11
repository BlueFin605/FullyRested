import { describe, expect, it, vi } from 'vitest';
import { MemoryCollectionSink } from '../src/collection-sink';
import { editScope } from '../src/authoring';
import { QueryError } from '../src/query-error';
import { files } from './fixtures/collection';

const guid = { generateGUID: () => 'generated' };
const secrets = { get: async () => null, set: vi.fn(async () => { }) };
const ctxFor = (sink: MemoryCollectionSink) =>
  ({ collectionFile: 'api.frcol', source: sink, sink, secrets, guid });

describe('editScope', () => {
  it('writes the mutated document at 4-space indent with no trailing newline', async () => {
    const sink = new MemoryCollectionSink(files);
    const result = await editScope(ctxFor(sink), 'request:users/get.frreq', ['request'], target => {
      if (target.document !== 'request') throw new Error('wrong target');
      target.action.url = 'https://x/changed';
      return "Set url on request:users/get.frreq";
    });
    expect(result).toMatchObject({ file: 'users/get.frreq', changed: true });
    const written = sink.files.get('users/get.frreq')!;
    expect(JSON.parse(written).url).toBe('https://x/changed');
    expect(written).toBe(JSON.stringify(JSON.parse(written), null, 4));
    expect(written.endsWith('\n')).toBe(false);
  });

  it('normalises a document that is missing fields', async () => {
    const sink = new MemoryCollectionSink(files);
    await editScope(ctxFor(sink), 'request:orders/list.frreq', ['request'], () => 'touched');
    const action = JSON.parse(sink.files.get('orders/list.frreq')!);
    expect(action.headers).toEqual([]);
    expect(action.validation.type).toBe('None');
  });

  it('creates a folder settings file that does not exist yet, with a fresh folderId', async () => {
    const sink = new MemoryCollectionSink(files);
    await editScope(ctxFor(sink), 'folder:orders', ['folder'], () => 'touched');
    expect(JSON.parse(sink.files.get('orders/folder.frfolder')!).folderId).toBe('generated');
  });

  it('refuses a locator the verb does not accept, naming what it does', async () => {
    const sink = new MemoryCollectionSink(files);
    await expect(editScope(ctxFor(sink), 'run:users/get.frreq#not found', ['request'], () => 'x'))
      .rejects.toThrow(QueryError);
    await expect(editScope(ctxFor(sink), 'collection', ['request'], () => 'x'))
      .rejects.toThrow(/accepts request:/);
  });

  it('writes nothing when apply reports no change', async () => {
    const sink = new MemoryCollectionSink(files);
    const before = sink.files.get('users/get.frreq');
    const result = await editScope(ctxFor(sink), 'request:users/get.frreq', ['request'], () => '');
    expect(result.changed).toBe(false);
    expect(sink.files.get('users/get.frreq')).toBe(before);
  });

  it('moves a secret value into the store under the request service', async () => {
    const sink = new MemoryCollectionSink(files);
    await editScope(ctxFor(sink), 'run:users/get.frreq#not found', ['run'], target => {
      (target.settings as any).secrets.push({ $secret: 'token', $value: 'hunter2' });
      return 'added';
    });
    expect(secrets.set).toHaveBeenCalledWith('fullyrested-request-r1', 'token', 'hunter2');
    expect(sink.files.get('users/get.frreq')).not.toContain('hunter2');
  });
});
