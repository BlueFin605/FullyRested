// The main process's run store is core's, with a node:fs host and the app's cap. What matters here is
// that the wiring is real: a record written through it lands as a file the CLI's own store would read,
// and the cap prunes app records without touching a CLI record.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { RUNS_FOLDER } = require('@fullyrested/core');
const { appRunStore } = require('../run-records');

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
