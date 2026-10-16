// The run store of the main process: core owns every rule (ids, naming, sorting, the cap); this file is
// only the node:fs half, the same shape App/cli-command/src/run-store.ts supplies for the CLI.
const fs = require('node:fs');
const path = require('node:path');
const { APP_RUN_CAP, fileRunStore } = require('@fullyrested/core');

const nodeRunStoreHost = {
    exists: p => fs.existsSync(p),
    readText: p => fs.readFileSync(p, 'utf8'),
    writeText: (p, text) => fs.writeFileSync(p, text),
    readdir: p => fs.readdirSync(p),
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

module.exports = { nodeRunStoreHost, appRunStore };
