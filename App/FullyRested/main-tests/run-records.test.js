// The main process's run store is core's, with a node:fs host and the app's cap. What matters here is
// that the wiring is real: a record written through it lands as a file the CLI's own store would read,
// and the cap prunes app records without touching a CLI record.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { RUNS_FOLDER } = require('@fullyrested/core');
const { appRunStore, saveRecord } = require('../run-records');

let dir;

beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-runs-'));
});

const record = (runId) => ({
    runId, startedAt: '2026-10-15T10:00:00.000Z', collection: 'c.frcol',
    selection: 'request:a.frreq', redacted: true, cases: []
});

test('writes a record into the runs folder and reads it back', async () => {
    const store = appRunStore(dir);

    await store.save(record('20261015-100000-aaaa-app'));

    const file = path.join(dir, RUNS_FOLDER, '20261015-100000-aaaa-app.json');
    assert.ok(fs.existsSync(file), `expected ${file} to exist`);
    assert.equal((await store.load('20261015-100000-aaaa-app')).selection, 'request:a.frreq');
});

test('lists newest first and refuses a traversal id', async () => {
    const store = appRunStore(dir);
    await store.save(record('20261014-100000-aaaa-app'));
    await store.save(record('20261015-100000-bbbb-app'));

    const ids = (await store.list()).map(l => l.runId);

    assert.deepEqual(ids, ['20261015-100000-bbbb-app', '20261014-100000-aaaa-app']);
    assert.equal(await store.load('../../etc/passwd'), undefined);
});

test('prunes app records beyond the cap but never a CLI record', async () => {
    const store = appRunStore(dir, 2);
    await store.save(record('20261010-100000-cli0'));
    for (const n of [1, 2, 3]) await store.save(record(`2026101${n}-100000-aaaa-app`));

    const ids = (await store.list()).map(l => l.runId).sort();

    assert.deepEqual(ids, ['20261010-100000-cli0', '20261012-100000-aaaa-app', '20261013-100000-aaaa-app'].sort());
});

test('saveRecord refuses a record that is not marked redacted', async () => {
    const store = appRunStore(dir);

    await assert.rejects(
        () => saveRecord(store, { ...record('20261015-100000-aaaa-app'), redacted: false }),
        /not marked as redacted/);

    const folder = path.join(dir, RUNS_FOLDER);
    assert.deepEqual(fs.existsSync(folder) ? fs.readdirSync(folder) : [], []);
});

test('saveRecord refuses a record with no redacted flag at all', async () => {
    const store = appRunStore(dir);
    const bad = record('20261015-100000-aaaa-app');
    delete bad.redacted;

    await assert.rejects(() => saveRecord(store, bad), /not marked as redacted/);
});

test('saveRecord saves a redacted record', async () => {
    const store = appRunStore(dir);

    await saveRecord(store, record('20261015-100000-aaaa-app'));

    assert.ok(await store.load('20261015-100000-aaaa-app'));
});

// --- the IPC handlers: { root, record } / { root } / { root, runId } ---
const { CollectionAccess } = require('../collection-access');
const { handleSaveRun, handleListRuns, handleLoadRun } = require('../run-records');

const openedAccess = () => {
    const collection = fs.realpathSync.native(fs.mkdtempSync(path.join(dir, 'col-')));
    fs.writeFileSync(path.join(collection, 'my.frcol'), JSON.stringify({ collectionGuid: 'g' }));
    const access = new CollectionAccess(path.join(dir, 'trusted.json'));
    access.openCollection(path.join(collection, 'my.frcol'), { collectionGuid: 'g' });
    return { access, collection };
};

test('handleSaveRun writes under the collection folder and the others read it back', async () => {
    const { access, collection } = openedAccess();
    const rec = record('20261015-100000-aaaa-app');

    await handleSaveRun(access, { root: collection, record: rec });

    assert.ok(fs.existsSync(path.join(collection, RUNS_FOLDER, '20261015-100000-aaaa-app.json')));
    assert.deepEqual((await handleListRuns(access, { root: collection })).map(l => l.runId), ['20261015-100000-aaaa-app']);
    assert.equal((await handleLoadRun(access, { root: collection, runId: rec.runId })).selection, 'request:a.frreq');
});

test('the handlers refuse a traversal run id', async () => {
    const { access, collection } = openedAccess();

    await assert.rejects(async () => handleSaveRun(access, { root: collection, record: record('../../escaped') }), /escaped/);
    await assert.rejects(async () => handleLoadRun(access, { root: collection, runId: '../../etc/passwd' }), /not a run id/);
});

test('the handlers refuse a missing run id', async () => {
    const { access, collection } = openedAccess();

    await assert.rejects(async () => handleSaveRun(access, { root: collection, record: record(undefined) }), /run id/);
    await assert.rejects(async () => handleLoadRun(access, { root: collection }), /run id/);
    await assert.rejects(async () => handleSaveRun(access, undefined), /open collection/);
});

test('the handlers refuse a stale root', async () => {
    const { access } = openedAccess();
    const stale = fs.mkdtempSync(path.join(dir, 'stale-'));

    await assert.rejects(async () => handleSaveRun(access, { root: stale, record: record('20261015-100000-aaaa-app') }), /not the open collection/);
    await assert.rejects(async () => handleListRuns(access, { root: stale }), /not the open collection/);
    await assert.rejects(async () => handleLoadRun(access, { root: stale, runId: '20261015-100000-aaaa-app' }), /not the open collection/);
    assert.equal(fs.existsSync(path.join(stale, RUNS_FOLDER)), false);
});

test('the handlers refuse a runs folder junctioned out of the collection', async (t) => {
    const { access, collection } = openedAccess();
    const elsewhere = fs.mkdtempSync(path.join(dir, 'elsewhere-'));
    try {
        fs.symlinkSync(elsewhere, path.join(collection, RUNS_FOLDER), 'junction');
    } catch {
        return t.skip('no symlink or junction available');
    }

    await assert.rejects(async () => handleSaveRun(access, { root: collection, record: record('20261015-100000-aaaa-app') }), /outside the collection/);
    await assert.rejects(async () => handleListRuns(access, { root: collection }), /outside the collection/);
    assert.deepEqual(fs.readdirSync(elsewhere), []);
});

test('handleSaveRun refuses a record of an unsaved collection', async () => {
    const { access, collection } = openedAccess();

    await assert.rejects(async () => handleSaveRun(access, { root: collection, record: { ...record('20261015-100000-aaaa-app'), collection: '' } }), /unsaved|collection/i);
    assert.equal(fs.existsSync(path.join(collection, RUNS_FOLDER)), false);
});

test('saveRecord refuses a record with an empty collection', async () => {
    await assert.rejects(() => saveRecord(appRunStore(dir), { ...record('20261015-100000-aaaa-app'), collection: '' }), /collection/);
});

test('saveRecord refuses a record with no run id', async () => {
    await assert.rejects(() => saveRecord(appRunStore(dir), record(undefined)), /run id/i);
});

test('the default store prunes after APP_RUN_CAP + 1 app records', async () => {
    const { APP_RUN_CAP } = require('@fullyrested/core');
    const store = appRunStore(dir);
    const idOf = n => `20261015-${100000 + n}-aaaa-app`;
    for (let n = 1; n <= APP_RUN_CAP + 1; n++) await store.save(record(idOf(n)));

    const ids = (await store.list()).map(l => l.runId);

    assert.equal(ids.length, APP_RUN_CAP);
    assert.ok(!ids.includes(idOf(1)));
    assert.ok(ids.includes(idOf(APP_RUN_CAP + 1)));
});

test('listing skips a record file that is a symlink', async (t) => {
    const store = appRunStore(dir);
    await store.save(record('20261015-100000-aaaa-app'));
    const outsideFile = path.join(dir, 'outside.json');
    fs.writeFileSync(outsideFile, JSON.stringify(record('20261016-100000-link-app')));
    try {
        fs.symlinkSync(outsideFile, path.join(dir, RUNS_FOLDER, '20261016-100000-link-app.json'), 'file');
    } catch {
        return t.skip('no symlink available');
    }

    assert.deepEqual((await store.list()).map(l => l.runId), ['20261015-100000-aaaa-app']);
    assert.equal(await store.load('20261016-100000-link-app'), undefined);
});
