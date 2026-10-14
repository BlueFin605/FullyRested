import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryCollectionSink } from '../src/collection-sink';
import { editScope } from '../src/authoring';
import { QueryError } from '../src/query-error';
import { files } from './fixtures/collection';

const guid = { generateGUID: () => 'generated' };
const secrets = { get: async () => null, set: vi.fn(async () => { }) };
const ctxFor = (sink: MemoryCollectionSink) =>
  ({ collectionFile: 'api.frcol', source: sink, sink, secrets, guid });

beforeEach(() => {
  secrets.set.mockClear();
});

describe('editScope', () => {
  it('writes the mutated document at 4-space indent with no trailing newline', async () => {
    const sink = new MemoryCollectionSink(files);
    const result = await editScope(ctxFor(sink), 'set_url', 'request:users/get.frreq', ['request'], target => {
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
    await editScope(ctxFor(sink), 'set_header', 'request:orders/list.frreq', ['request'], () => 'touched');
    const action = JSON.parse(sink.files.get('orders/list.frreq')!);
    expect(action.headers).toEqual([]);
    expect(action.validation.type).toBe('None');
  });

  it('creates a folder settings file that does not exist yet, with a fresh folderId', async () => {
    const sink = new MemoryCollectionSink(files);
    await editScope(ctxFor(sink), 'set_header', 'folder:orders', ['folder'], () => 'touched');
    expect(JSON.parse(sink.files.get('orders/folder.frfolder')!).folderId).toBe('generated');
  });

  it('refuses a locator the verb does not accept, naming the verb and what it does accept', async () => {
    const sink = new MemoryCollectionSink(files);
    await expect(editScope(ctxFor(sink), 'set_url', 'run:users/get.frreq#not found', ['request'], () => 'x'))
      .rejects.toThrow(QueryError);
    await expect(editScope(ctxFor(sink), 'set_url', 'collection', ['request'], () => 'x'))
      .rejects.toThrow(/^set_url accepts request: only \(given collection\);/);
  });

  it('writes nothing when apply reports no change', async () => {
    const sink = new MemoryCollectionSink(files);
    const before = sink.files.get('users/get.frreq');
    const result = await editScope(ctxFor(sink), 'set_url', 'request:users/get.frreq', ['request'], () => '');
    expect(result.changed).toBe(false);
    expect(sink.files.get('users/get.frreq')).toBe(before);
  });

  it('moves a secret value into the store under the request service', async () => {
    const sink = new MemoryCollectionSink(files);
    await editScope(ctxFor(sink), 'set_secret', 'run:users/get.frreq#not found', ['run'], target => {
      (target.settings as any).secrets.push({ $secret: 'token', $value: 'hunter2' });
      return 'added';
    });
    expect(secrets.set).toHaveBeenCalledWith('fullyrested-request-r1', 'token', 'hunter2');
    expect(sink.files.get('users/get.frreq')).not.toContain('hunter2');
  });

  it('targets the collection environment for the collection locator, under the collection service', async () => {
    const sink = new MemoryCollectionSink(files);
    const result = await editScope(ctxFor(sink), 'set_secret', 'collection', ['collection'], target => {
      if (target.document !== 'collection') throw new Error('wrong target');
      expect(target.settings).toBe(target.config.collectionEnvironment);
      expect(target.settings.name).toBe('system.settings');
      target.settings.secrets.push({ $secret: 'apiKey', $value: 'shhh', active: true, id: 's1' });
      return 'added';
    });
    expect(result).toMatchObject({ file: 'api.frcol', changed: true });
    expect(secrets.set).toHaveBeenCalledWith('fullyrested-collection-c1', 'apiKey', 'shhh');
    const written = JSON.parse(sink.files.get('api.frcol')!);
    expect(written.collectionEnvironment.secrets).toEqual([{ $secret: 'apiKey', active: true, id: 's1' }]);
  });

  it('targets the named environment for an env: locator, under the collection service', async () => {
    const sink = new MemoryCollectionSink(files);
    const result = await editScope(ctxFor(sink), 'set_secret', 'env:Production', ['environment'], target => {
      if (target.document !== 'collection') throw new Error('wrong target');
      expect(target.settings).toBe(target.config.environments[0]);
      expect(target.settings.id).toBe('e1');
      target.settings.secrets.push({ $secret: 'prodKey', $value: 'shhh', active: true, id: 's2' });
      return 'added';
    });
    expect(result).toMatchObject({ file: 'api.frcol', changed: true });
    expect(secrets.set).toHaveBeenCalledWith('fullyrested-collection-c1', 'prodKey', 'shhh');
    const written = JSON.parse(sink.files.get('api.frcol')!);
    expect(written.environments[0].secrets).toEqual([{ $secret: 'prodKey', active: true, id: 's2' }]);
    expect(written.collectionEnvironment.secrets).toEqual([]);
  });

  it('reads an existing folder settings file and uses its folderId as the secret service', async () => {
    const sink = new MemoryCollectionSink(files);
    const result = await editScope(ctxFor(sink), 'set_secret', 'folder:users', ['folder'], target => {
      if (target.document !== 'folder') throw new Error('wrong target');
      expect(target.settings).toBe(target.config);
      expect(target.config.folderId).toBe('f1');
      target.settings.secrets.push({ $secret: 'folderKey', $value: 'shhh', active: true, id: 's3' });
      return 'added';
    });
    expect(result).toMatchObject({ file: 'users/folder.frfolder', changed: true });
    expect(secrets.set).toHaveBeenCalledWith('fullyrested-folder-f1', 'folderKey', 'shhh');
  });

  it('normalises a run that apply created, so the written file is never half-formed', async () => {
    const sink = new MemoryCollectionSink(files);
    await editScope(ctxFor(sink), 'new_run', 'request:users/get.frreq', ['request'], target => {
      if (target.document !== 'request') throw new Error('wrong target');
      target.action.runs.push({ id: 'n2', name: 'created' } as any);
      return 'added run';
    });
    const written = JSON.parse(sink.files.get('users/get.frreq')!);
    const run = written.runs.find((r: any) => r.id == 'n2');
    expect(run.variables).toEqual([]);
    expect(run.secrets).toEqual([]);
    expect(run.headers).toEqual([]);
    expect(run.parameters).toEqual([]);
    expect(run.authentication.authentication).toBe('inherit');
    expect(run.validation.type).toBe('None');
  });

  it('normalises an environment that apply created', async () => {
    const sink = new MemoryCollectionSink(files);
    await editScope(ctxFor(sink), 'new_environment', 'collection', ['collection'], target => {
      if (target.document !== 'collection') throw new Error('wrong target');
      target.config.environments.push({ id: 'e2', name: 'Staging' } as any);
      return 'added environment';
    });
    const written = JSON.parse(sink.files.get('api.frcol')!);
    const env = written.environments.find((e: any) => e.id == 'e2');
    expect(env.variables).toEqual([]);
    expect(env.secrets).toEqual([]);
    expect(env.headers).toEqual([]);
    expect(env.auth.authentication).toBe('inherit');
  });
});
