// The run store of the main process: core owns every rule (ids, naming, sorting, the cap); this file is
// only the node:fs half, the same shape App/cli-command/src/run-store.ts supplies for the CLI.
const fs = require('node:fs');
const path = require('node:path');
const { APP_RUN_CAP, fileRunStore } = require('@fullyrested/core');

const nodeRunStoreHost = {
    exists: p => fs.existsSync(p),
    readText: p => fs.readFileSync(p, 'utf8'),
    writeText: (p, text) => fs.writeFileSync(p, text),
    // a record file that is a symlink is skipped: it could point at anything outside the runs folder
    readdir: p => fs.readdirSync(p, { withFileTypes: true }).filter(e => !e.isSymbolicLink()).map(e => e.name),
    mkdir: p => { fs.mkdirSync(p, { recursive: true }); },
    remove: p => { fs.rmSync(p, { force: true }); },
    join: (...parts) => path.join(...parts)
};

// folder: the open collection's folder. Only app-written records (ids ending -app) are pruned.
function appRunStore(folder, cap = APP_RUN_CAP) {
    return fileRunStore(nodeRunStoreHost, folder, {
        cap,
        onWarning: message => console.log(`[FullyRested] ${message}`)
    });
}

// A record kept with secret values must never reach disk from the app: the app has no
// --include-secrets, and the MCP server refuses to serve a record that is not marked redacted. The
// renderer is our own code, so this cannot prove redaction -- it stops an accident, not an attacker.
async function saveRecord(store, record) {
    if (record == undefined || typeof record.runId != 'string' || record.runId == '')
        throw new Error('A run record needs a run id; the app will not save it');
    if (typeof record.collection != 'string' || record.collection == '')
        throw new Error(`Run ${record.runId} has no collection (an unsaved collection); the app will not save it`);
    if (record == undefined || record.redacted !== true)
        throw new Error(`Run ${record?.runId ?? '(none)'} is not marked as redacted; the app will not save it`);
    await store.save(record);
}

// The IPC handlers behind saveRun / listRuns / loadRun. Payloads: { root, record }, { root }, { root, runId }.
// root is the collection folder the renderer believes is open; access.runsPath refuses a stale one, a
// run id that is not a plain id, and a runs folder that resolves outside the collection.
function handleSaveRun(access, request) {
    access.runsPath(request?.root, request?.record?.runId);
    if (typeof request.record.runId != 'string')
        throw new Error('A run record needs a run id');
    return saveRecord(appRunStore(access.root), request.record);
}

function handleListRuns(access, request) {
    access.runsPath(request?.root);
    return appRunStore(access.root).list();
}

function handleLoadRun(access, request) {
    if (typeof request?.runId != 'string')
        throw new Error(`${request?.runId} is not a run id`);
    access.runsPath(request.root, request.runId);
    return appRunStore(access.root).load(request.runId);
}

module.exports = { nodeRunStoreHost, appRunStore, saveRecord, handleSaveRun, handleListRuns, handleLoadRun };
