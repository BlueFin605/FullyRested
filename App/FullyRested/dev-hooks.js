// Opt-in launch hooks for screenshots and automation. Every hook is inert unless its
// FR_* variable is set, so a normal or packaged launch is unaffected.
const path = require('node:path');

function readHooks(env = process.env) {
    const port = (env.FR_REMOTE_DEBUGGING_PORT || '').trim();
    const collection = (env.FR_OPEN_COLLECTION || '').trim();
    const userData = (env.FR_USER_DATA || '').trim();
    const noDevTools = /^(1|true)$/i.test((env.FR_NO_DEVTOOLS || '').trim());
    return {
        remoteDebuggingPort: /^\d+$/.test(port) ? port : null,
        openCollection: collection ? path.resolve(collection) : null,
        userData: userData ? path.resolve(userData) : null,
        noDevTools
    };
}

// Call before app ready: userData and the debugging switch cannot change afterwards.
function applyEarlyHooks(app, hooks = readHooks()) {
    if (hooks.userData) app.setPath('userData', hooks.userData);
    if (hooks.remoteDebuggingPort) app.commandLine.appendSwitch('remote-debugging-port', hooks.remoteDebuggingPort);
    return hooks;
}

// Open the requested collection once the renderer has loaded.
function applyOpenCollection(webContents, hooks, loadFromFile) {
    if (!hooks.openCollection) return;
    webContents.once('did-finish-load', () => {
        loadFromFile(hooks.openCollection, path.basename(hooks.openCollection), path.dirname(hooks.openCollection));
    });
}

module.exports = { readHooks, applyEarlyHooks, applyOpenCollection };
