const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { RUNS_FOLDER } = require('@fullyrested/core');
const { CollectionAccess } = require('../collection-access');

let dir, collection, outside, trustedFile;

const write = (file, value) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof value == 'string' ? value : JSON.stringify(value));
    return file;
};

beforeEach(() => {
    dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'fr-access-')));
    collection = path.join(dir, 'col');
    outside = path.join(dir, 'elsewhere');
    trustedFile = path.join(dir, 'trusted.json');
    write(path.join(collection, 'my.frcol'), { collectionGuid: 'col-guid' });
    write(path.join(collection, 'api', 'folder.frfolder'), { folderId: 'folder-1' });
    write(path.join(collection, 'api', 'get.frreq'), { id: 'req-1' });
    write(path.join(outside, 'loose.frreq'), { id: 'req-2' });
    write(path.join(outside, 'secret.txt'), 'nope');
});

afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const opened = () => {
    const access = new CollectionAccess(trustedFile);
    access.openCollection(path.join(collection, 'my.frcol'), { collectionGuid: 'col-guid' });
    return access;
};

test('nothing is reachable before a collection is opened', () => {
    const access = new CollectionAccess(trustedFile);
    assert.throws(() => access.collectionPath(collection, 'api'), /No collection is open/);
    assert.throws(() => access.checkRequest(path.join(collection, 'api', 'get.frreq')), /outside/);
    assert.throws(() => access.checkSecret('fullyrested-collection-col-guid', 'key'), /not a secret/);
});

test('collectionPath resolves inside the open collection and refuses climbing out', () => {
    const access = opened();
    assert.equal(access.collectionPath(collection, 'api/get.frreq'), path.join(collection, 'api', 'get.frreq'));
    assert.equal(access.collectionPath(collection, ''), collection);
    assert.throws(() => access.collectionPath(collection, '../elsewhere/secret.txt'), /outside/);
});

test('collectionPath refuses a root that is not the open collection', () => {
    const access = opened();
    assert.throws(() => access.collectionPath(outside, 'secret.txt'), /not the open collection/);
    assert.throws(() => access.collectionPath(undefined, 'api'), /not the open collection/);
});

test('a symlink inside the collection cannot reach outside it', (t) => {
    const access = opened();
    try {
        fs.symlinkSync(outside, path.join(collection, 'link'), 'junction');
    } catch (err) {
        t.skip(`cannot create a link here: ${err.message}`);
        return;
    }
    assert.throws(() => access.collectionPath(collection, 'link/secret.txt'), /outside/);
    assert.throws(() => access.checkRequest(path.join(collection, 'link', 'loose.frreq')), /outside/);
});

test('requests inside the collection or chosen in a dialog are allowed; others are not', () => {
    const access = opened();
    const loose = path.join(outside, 'loose.frreq');
    assert.equal(access.checkRequest(path.join(collection, 'api', 'get.frreq')), path.join(collection, 'api', 'get.frreq'));
    assert.throws(() => access.checkRequest(loose), /outside/);
    assert.throws(() => access.checkRequest(path.join(collection, 'my.frcol')), /not a FullyRested request/);
    assert.throws(() => access.checkRequest(''), /not a FullyRested request/);

    access.trustRequest(loose);
    assert.equal(access.checkRequest(loose), loose);
});

test('dialog-chosen requests are remembered between runs', () => {
    const loose = path.join(outside, 'loose.frreq');
    new CollectionAccess(trustedFile).trustRequest(loose);
    assert.equal(new CollectionAccess(trustedFile).checkRequest(loose), loose);
});

test('the first run trusts the request files of the tabs already open', () => {
    const loose = path.join(outside, 'loose.frreq');
    const access = new CollectionAccess(trustedFile, () => [loose, path.join(outside, 'secret.txt'), path.join(outside, 'gone.frreq'), '']);
    assert.equal(access.checkRequest(loose), loose);
    assert.deepEqual(JSON.parse(fs.readFileSync(trustedFile, 'utf8')), [loose]);

    // once the trusted file exists it is not seeded again
    const later = new CollectionAccess(trustedFile, () => { throw new Error('seeded twice'); });
    assert.equal(later.checkRequest(loose), loose);
});

test('saveCollection writes only the open collection file', () => {
    const access = opened();
    assert.equal(access.checkCollectionToSave(path.join(collection, 'my.frcol')), path.join(collection, 'my.frcol'));
    assert.throws(() => access.checkCollectionToSave(path.join(outside, 'other.frcol')), /not the open collection/);
    assert.throws(() => access.checkCollectionToSave(''), /not the open collection/);
    assert.throws(() => new CollectionAccess(trustedFile).checkCollectionToSave(path.join(collection, 'my.frcol')), /not the open collection/);
});

test('only collection files can be opened by name', () => {
    const access = new CollectionAccess(trustedFile);
    assert.equal(access.checkCollectionToOpen('C:/x/my.FRCOL'), 'C:/x/my.FRCOL');
    assert.throws(() => access.checkCollectionToOpen(path.join(outside, 'secret.txt')), /not a FullyRested collection/);
    assert.throws(() => access.checkCollectionToOpen(undefined), /not a FullyRested collection/);
});

test('saveFolder writes folder.frfolder inside the collection under a well-formed id', () => {
    const access = opened();
    assert.equal(access.checkFolderSave(path.join(collection, 'api'), 'folder-1'), path.join(collection, 'api', 'folder.frfolder'));
    assert.throws(() => access.checkFolderSave(outside, 'folder-1'), /outside/);
    assert.throws(() => access.checkFolderSave(path.join(collection, 'api'), 'x/../collection-col-guid'), /not a folder id/);
    assert.throws(() => access.checkFolderSave(path.join(collection, 'api'), ''), /not a folder id/);
});

test('getSecret is limited to the services of the open collection, its folders and its requests', () => {
    const access = opened();
    assert.doesNotThrow(() => access.checkSecret('fullyrested-collection-col-guid', 'apiKey'));
    assert.throws(() => access.checkSecret('fullyrested-folder-folder-1', 'apiKey'), /not a secret/);
    assert.throws(() => access.checkSecret('fullyrested-request-req-1', 'apiKey'), /not a secret/);

    access.noteRead(path.join(collection, 'api', 'folder.frfolder'), JSON.stringify({ folderId: 'folder-1' }));
    access.noteRead(path.join(collection, 'api', 'get.frreq'), JSON.stringify({ id: 'req-1' }));
    access.noteRead(path.join(collection, 'notes.txt'), JSON.stringify({ id: 'req-9' }));
    access.noteRead(path.join(collection, 'bad.frreq'), 'not json');
    assert.doesNotThrow(() => access.checkSecret('fullyrested-folder-folder-1', 'apiKey'));
    assert.doesNotThrow(() => access.checkSecret('fullyrested-request-req-1', 'apiKey'));
    assert.throws(() => access.checkSecret('fullyrested-request-req-9', 'apiKey'), /not a secret/);
    assert.throws(() => access.checkSecret('fullyrested-collection-col-guid', ''), /Not a secret name/);
    assert.throws(() => access.checkSecret('fullyrested-collection-col-guid', 'a\nb'), /Not a secret name/);
});

test('opening another collection forgets the previous one\'s secrets', () => {
    const access = opened();
    access.noteRead(path.join(collection, 'api', 'get.frreq'), JSON.stringify({ id: 'req-1' }));
    const other = write(path.join(outside, 'other.frcol'), { collectionGuid: 'other-guid' });
    access.openCollection(other, { collectionGuid: 'other-guid' });
    assert.throws(() => access.checkSecret('fullyrested-request-req-1', 'apiKey'), /not a secret/);
    assert.throws(() => access.checkSecret('fullyrested-collection-col-guid', 'apiKey'), /not a secret/);
    assert.doesNotThrow(() => access.checkSecret('fullyrested-collection-other-guid', 'apiKey'));
    assert.throws(() => access.collectionPath(collection, 'api'), /not the open collection/);
});

// existsSync() reports a dangling symlink as ABSENT, so the old check stepped past a dead link inside the
// collection, took it for a not-yet-created plain name, and let the write land at the link's target
// outside the folder. The guard is now core's shared lstat-based walk (AIF-5).
test('a dangling symlink inside the collection is refused, not treated as a free name', (t) => {
    const access = opened();
    const gone = path.join(outside, 'gone');
    try {
        fs.symlinkSync(gone, path.join(collection, 'dead'), 'junction');
        fs.symlinkSync(path.join(outside, 'gone.frreq'), path.join(collection, 'dead.frreq'), 'junction');
    } catch (err) {
        t.skip(`cannot create a link here: ${err.message}`);
        return;
    }
    assert.throws(() => access.collectionPath(collection, 'dead'), /outside/);
    assert.throws(() => access.collectionPath(collection, 'dead/new.frreq'), /outside/);
    // a dangling request link inside the collection: refused even though it sits at an allowed name
    assert.throws(() => access.checkRequest(path.join(collection, 'dead.frreq')), /outside/);
});

test('a dangling symlink is never trusted as a dialog-chosen request', (t) => {
    const dead = path.join(outside, 'dead.frreq');
    try {
        fs.symlinkSync(path.join(outside, 'gone.frreq'), dead, 'junction');
    } catch (err) {
        t.skip(`cannot create a link here: ${err.message}`);
        return;
    }
    const access = new CollectionAccess(trustedFile);
    assert.throws(() => access.trustRequest(dead), /outside/);
    assert.throws(() => access.checkRequest(dead), /outside/);
});

// realpathing only the immediate parent cannot notice a link further up, which is what stopped the old
// check being reusable anywhere that creates parent directories
test('a symlinked grandparent is noticed, not only the immediate parent', (t) => {
    const access = opened();
    try {
        fs.symlinkSync(outside, path.join(collection, 'out'), 'junction');
    } catch (err) {
        t.skip(`cannot create a link here: ${err.message}`);
        return;
    }
    assert.throws(() => access.collectionPath(collection, 'out/a/b/new.frreq'), /outside/);
});

test('a name not created yet is still allowed inside the collection', () => {
    const access = opened();
    assert.equal(access.collectionPath(collection, 'api/new.frreq'), path.join(collection, 'api', 'new.frreq'));
    assert.equal(access.collectionPath(collection, 'fresh/deep/new.frreq'), path.join(collection, 'fresh', 'deep', 'new.frreq'));
});

test('runsPath is the runs folder inside the open collection', () => {
    const access = opened();

    assert.equal(access.runsPath(), path.join(collection, RUNS_FOLDER));
    assert.equal(access.runsPath('20261015-100000-aaaa-app'),
        path.join(collection, RUNS_FOLDER, '20261015-100000-aaaa-app.json'));
});

test('runsPath refuses a run id that is not a plain id', () => {
    const access = opened();

    assert.throws(() => access.runsPath('../../escaped'), /escaped/);
    assert.throws(() => access.runsPath('a/b'), /a\/b/);
    assert.throws(() => access.runsPath(path.join(dir, 'abs')), /abs/);
});

test('runsPath refuses when no collection is open', () => {
    const access = new CollectionAccess(trustedFile);

    assert.throws(() => access.runsPath(), /no collection/i);
});

test('runsPath refuses a runs folder symlinked out of the collection', (t) => {
    const access = opened();
    try {
        fs.symlinkSync(outside, path.join(collection, RUNS_FOLDER), 'junction');
    } catch {
        return t.skip('no symlink or junction available');
    }

    assert.throws(() => access.runsPath('20261015-100000-aaaa-app'), /outside the collection/i);
});
