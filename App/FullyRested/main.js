const { app, BrowserWindow, ipcMain, dialog, Menu, nativeTheme } = require('electron')
// include the Node.js 'path' module at the top of your file
const path = require('node:path')
const fs = require('fs');
const { AsyncEntry } = require('@napi-rs/keyring');
const { CollectionAccess } = require('./collection-access');
const { handleSaveRun, handleListRuns, handleLoadRun } = require('./run-records');
const { executeRequest, loadSecrets, storeSecrets, secretServiceForCollection, secretServiceForRequest, secretServiceForFolder, COLLECTION_FILE_EXTENSIONS, ACTION_FILE_EXTENSIONS } = require('@fullyrested/core');

// The Squirrel installer runs the app with --squirrel-* flags to create/remove shortcuts; quit once that's done
if (require('electron-squirrel-startup')) app.quit();

// dialog filters want extensions without the dot
const withoutDot = extensions => extensions.map(e => e.substring(1));

// Secret values live in the OS keychain, never in collection or request files
const keychain = {
    get: async (service, account) => (await new AsyncEntry(service, account).getPassword()) ?? null,
    set: (service, account, value) => new AsyncEntry(service, account).setPassword(value)
};

let win;
let access;

const createWindow = () => {
    win = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 900,
        minHeight: 560,
        // match the app's light/dark surface so there is no white flash on start
        backgroundColor: nativeTheme.shouldUseDarkColors ? '#1e1f22' : '#ffffff',
        // the app draws its own File/Collection/View menus; Alt still shows this one
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js')
        }
    })

    if (!app.isPackaged)
        win.webContents.openDevTools();

    win.loadFile('dist/fullyrested/index.html');
}

// A small native menu: editing, reload, devtools and zoom. Request shortcuts (Ctrl+N, Ctrl+S, Ctrl+W, ...)
// are left to the app, so nothing here may claim them.
const appMenu = () => Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { role: 'editMenu' },
    {
        label: 'View',
        submenu: [
            { role: 'reload' },
            { role: 'toggleDevTools' },
            { type: 'separator' },
            { role: 'resetZoom' },
            { role: 'zoomIn' },
            { role: 'zoomOut' },
            { type: 'separator' },
            { role: 'togglefullscreen' }
        ]
    }
]);

app.whenReady().then(() => {
    access = new CollectionAccess(path.join(app.getPath("userData"), "trusted_requests.json"), openTabFiles);
    Menu.setApplicationMenu(appMenu())
    createWindow()

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })

    ipcMain.handle("testRest", (event, request) => {
        return executeRequest(request);
    });

    ipcMain.handle("readState", (event, request) => {
        return readState();
    });

    ipcMain.handle("loadRequest", (event, request) => {
        return loadRequest(request);
    });

    ipcMain.handle("listDir", (event, request) => {
        return fs.readdirSync(access.collectionPath(request.root, request.path), { withFileTypes: true }).map(e => ({ name: e.name, isDirectory: e.isDirectory() }));
    });

    ipcMain.handle("readText", (event, request) => {
        var file = access.collectionPath(request.root, request.path);
        var text = fs.readFileSync(file, 'utf8');
        access.noteRead(file, text);
        return text;
    });

    // The run history of the open collection: { root, record } / { root } / { root, runId }. The handlers
    // live in run-records.js and are confined by access.runsPath like readText.
    ipcMain.handle("saveRun", (event, request) => handleSaveRun(access, request));
    ipcMain.handle("listRuns", (event, request) => handleListRuns(access, request));
    ipcMain.handle("loadRun", (event, request) => handleLoadRun(access, request));

    ipcMain.handle("getSecret", (event, request) => {
        access.checkSecret(request.service, request.account);
        return keychain.get(request.service, request.account);
    });

    ipcMain.handle("saveFolder", (event, request) => {
        return saveFolder(request);
    });

    ipcMain.on("loadCollection", (event, request) => {
        return loadCollection();
    });

    ipcMain.on("loadCollectionFromFile", (event, request) => {
        return loadCollectionFromFile(request.fullFileName, request.name, request.path);
    });

    ipcMain.on("saveState", (event, request) => {
        saveState(request);
    });

    ipcMain.on("saveCollection", (event, request) => {
        saveCollection(request).catch(err => console.log(`saveCollection failed: ${err.message}`));
    });

    ipcMain.on("saveCollectionAs", (event, request) => {
        saveCollectionAs(request).catch(err => console.log(`saveCollectionAs failed: ${err.message}`));
    });

    ipcMain.on("saveAsRequest", (event, request) => {
        saveAsRequest(request).catch(err => console.log(`saveAsRequest failed: ${err.message}`));
    });

    ipcMain.on("saveRequest", (event, request) => {
        saveRequest(request).catch(err => console.log(`saveRequest failed: ${err.message}`));
    });
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
})

// The request files of the tabs left open last time: trusted once, when there is no trusted list yet
function openTabFiles() {
    try {
        return (readState().sessions ?? []).flatMap(s => (s.actions ?? []).map(a => a.fullFilename));
    } catch {
        return [];
    }
}

async function saveFolder(request) {
    var file = access.checkFolderSave(request.folderPath, request.config?.folderId);
    var sanitised = await storeSecrets(request.config, keychain, secretServiceForFolder(request.config.folderId));
    fs.writeFileSync(file, JSON.stringify(sanitised, null, 4));
}

function saveState(request) {
    // https://stackoverflow.com/questions/30465034/where-to-store-user-settings-in-electron-atom-shell-application
    //    Just curious but what's the advantage of electron-json-storage vs just 
    // var someObj = JSON.parse(fs.readFileSync(path, { encoding: "utf8" }))
    fs.writeFileSync(buildStateFilename(), JSON.stringify(request, null, 4)); // Even making it async would not add more than a few lines
}

function readState() {
    try {
        var state = fs.readFileSync(buildStateFilename());
        return JSON.parse(state);
    } catch (err) {
        if (err.code === 'ENOENT') {
            console.log(`File not found!:[${buildStateFilename()}]`);
            return { actions: [] };
        } else {
            throw err;
        }
    }
}

async function loadRequest(fullFilename) {
    fullFilename = access.checkRequest(fullFilename);
    try {
        var request = JSON.parse(fs.readFileSync(fullFilename));
        return await loadSecrets(request, keychain, secretServiceForRequest(request.id));
    } catch (err) {
        if (err.code === 'ENOENT') {
            console.log(`File not found!:[${fullFilename}]`);
            return { actions: {} };
        } else {
            throw err;
        }
    }
}

function buildStateFilename() {
    return path.join(app.getPath("userData"), "current_state.json");
}

async function loadCollection() {
    var file = await dialog.showOpenDialog(win, { filters: [{ name: 'FullyRested Collections', extensions: withoutDot(COLLECTION_FILE_EXTENSIONS) }] });

    try {
        if (file.canceled == false) {
            var filename = file.filePaths[0];
            var pathname = path.dirname(filename);
            var name = path.basename(filename);
            await loadCollectionFromFile(filename, name, pathname);
        }
    } catch (err) {
        console.log(`Open Dialog Failed!:[${JSON.stringify(file)}] - [${err}]`);
    }
}

async function loadCollectionFromFile(filename, name, path) {
    try {
        access.checkCollectionToOpen(filename);
        var data = await new Promise((accept, reject) => {
            fs.readFile(filename, (err, data) => {
                if (err)
                    reject(err);

                accept(data);
            });
        });

        var parsed = JSON.parse(data);
        access.openCollection(filename, parsed);
        var collectionConfig = await loadSecrets(parsed, keychain, secretServiceForCollection(parsed.collectionGuid));
        win.webContents.send("loadCollectionResponse", { config: collectionConfig, filename: filename, name: name, path: path });
    }
    catch (err) {
        console.log(`Collection File load error!:[${err}]`);
    }
}

async function saveCollection(request) {
    var filename = access.checkCollectionToSave(request.filename);
    await writeCollection(filename, request.config);
    win.webContents.send("loadCollectionResponse", request);
}

async function writeCollection(filename, config) {
    var sanitised = await storeSecrets(config, keychain, secretServiceForCollection(config.collectionGuid));
    fs.writeFileSync(filename, JSON.stringify(sanitised, null, 4));
    access.openCollection(filename, config);
}

async function saveCollectionAs(request) {
    var userChosenPath = dialog.showSaveDialogSync({ defaultPath: request.name, filters: [{ name: 'FullyRested Collection', extensions: withoutDot(COLLECTION_FILE_EXTENSIONS.slice(0, 1)) }] });
    if (userChosenPath == undefined) {
        return;
    }

    request.filename = userChosenPath
    request.path = path.dirname(request.filename);
    request.name = path.basename(request.filename);
    await writeCollection(request.filename, request.config);
    win.webContents.send("loadCollectionResponse", request);
}

async function saveAsRequest(request) {
    var userChosenPath = dialog.showSaveDialogSync({ defaultPath: request.name, filters: [{ name: 'FullyRested Request', extensions: withoutDot(ACTION_FILE_EXTENSIONS.slice(0, 1)) }] });
    if (userChosenPath == undefined) {
        return;
    }
    var sanitised = await storeSecrets(request, keychain, secretServiceForRequest(request.id));
    fs.writeFileSync(userChosenPath, JSON.stringify(sanitised, null, 4));
    access.trustRequest(userChosenPath);
    if (request.name.startsWith("<unnamed")) {
        var basename = path.basename(userChosenPath);
        request.name = basename.substring(0, basename.length - path.extname(basename).length);
    }
    win.webContents.send("savedAsCompleted", { id: request.id, fullFilename: userChosenPath, name: request.name });
}

async function saveRequest(request) {
    var filename = access.checkRequest(request.fullFilename);
    var sanitised = await storeSecrets(request.action, keychain, secretServiceForRequest(request.action.id));
    fs.writeFileSync(filename, JSON.stringify(sanitised, null, 4));
    win.webContents.send("savedAsCompleted", { id: request.action.id, fullFilename: request.fullFilename, name: request.action.name });
}
