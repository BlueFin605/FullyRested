import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { setHeader, newCollection } from '@fullyrested/core';
import { startFixture } from './fixture';
import { edit, newGuid } from '../src/authoring';
import { createSecretStore } from '../src/secret-store';
import { UsageError } from '../src/run';

const noKeychain = createSecretStore({}, undefined);

let fx: Awaited<ReturnType<typeof startFixture>>;

beforeEach(async () => {
  fx = await startFixture();
});

afterEach(() => fx.stop());

describe('edit', () => {
  it('writes the .frcol on disk with the change, at 4-space indent', async () => {
    const result = await edit(fx.collection, noKeychain, ctx => setHeader(ctx, 'collection', 'Accept', 'application/json'));

    expect(result.changed).toBe(true);

    const raw = fs.readFileSync(fx.collection, 'utf8');
    expect(raw).toBe(JSON.stringify(JSON.parse(raw), null, 4)); // on-disk bytes are exactly 4-space pretty-printed JSON
    const written = JSON.parse(raw);
    expect(written.collectionEnvironment.headers).toEqual([
      { key: 'Accept', value: 'application/json', active: true, id: expect.any(String) }
    ]);
  });

  it('fails a collection path that does not exist with the standard setup error', async () => {
    const missing = path.join(fx.folder, 'nope.frcol');

    await expect(edit(missing, noKeychain, ctx => setHeader(ctx, 'collection', 'Accept', 'application/json')))
      .rejects.toThrow(UsageError);
  });

  it('serves new_collection, which has no collection to load yet', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fullyrested-new-'));
    try {
      const file = path.join(dir, 'brand-new.frcol');
      expect(fs.existsSync(file)).toBe(false);

      const result = await edit(file, noKeychain, ctx => newCollection(ctx, 'brand-new.frcol'));

      expect(result.changed).toBe(true);
      expect(fs.existsSync(file)).toBe(true);
      const raw = fs.readFileSync(file, 'utf8');
      expect(raw).toBe(JSON.stringify(JSON.parse(raw), null, 4));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('newGuid', () => {
  it('returns distinct values', () => {
    const guid = newGuid();

    expect(guid.generateGUID()).not.toBe(guid.generateGUID());
  });
});
