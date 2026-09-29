const { app, BrowserWindow, ipcMain, dialog } = require('electron')
// include the Node.js 'path' module at the top of your file
const path = require('node:path')
const fs = require('fs');
const keytar = require('keytar');
const { executeRequest, loadSecrets, storeSecrets, secretServiceForCollection, secretServiceForRequest } = require('@fullyrested/core');

// Secret values live in the OS keychain, never in collection or request files
const keychain = {
    get: (service, account) => keytar.getPassword(service, account),
    set: (service, account, value) => keytar.setPassword(service, account, value)
};

let win;

const createWindow = () => {
    win = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js')
        }
    })

    win.webContents.openDevTools();

    win.loadFile('dist/rest-easy/index.html');
}

app.whenReady().then(() => {
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

    ipcMain.handle("traverseDirectory", (event, request) => {
        return traverseDirectory(request);
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

ipcMain.on("navigateDirectory", (event, path) => {
    process.chdir(path);
    getDirectory();
});

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

function traverseDirectory(request) {

    // var path = app.getPath("userData");
    //var path = `/Users/deanmitchell/Projects/FullyRested/App/FullyRested/src`;
    var tree = { dir: { name: 'src', path: request.pathname, fullPath: request.pathname }, subdirs: [], files: [] };
    if (request.pathname == '')
        return tree;

    walkSync(request.pathname, request.filter, tree);
    // var json = JSON.stringify(tree);
    return tree;
}

function walkSync(dir, filter, tree) {
    const files = fs.readdirSync(dir, { withFileTypes: true });
    for (const file of files) {
        if (file.isDirectory()) {
            var fullPath = path.join(dir, file.name);
            var node = { dir: file, subdirs: [], files: [] };
            node.dir.fullPath = fullPath;
            tree.subdirs.push(node);
            walkSync(fullPath, filter, tree.subdirs[tree.subdirs.length - 1]);
        } else
            if (file.isFile() && filter.some(f => file.name.endsWith(f))) {
                file.fullPath = path.join(dir, file.name);
                tree.files.push(file);
            }
    }
}

async function loadCollection() {
    var file = await dialog.showOpenDialog(win, { filters: [{ name: 'FullyRested Projects', extensions: ['reasycol'] }] });

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
        var data = await new Promise((accept, reject) => {
            fs.readFile(filename, (err, data) => {
                if (err)
                    reject(err);

                accept(data);
            });
        });

        var parsed = JSON.parse(data);
        var collectionConfig = await loadSecrets(parsed, keychain, secretServiceForCollection(parsed.collectionGuid));
        win.webContents.send("loadCollectionResponse", { config: collectionConfig, filename: filename, name: name, path: path });
    }
    catch (err) {
        console.log(`Collection File load error!:[${err}]`);
    }
}

async function saveCollection(request) {
    var sanitised = await storeSecrets(request.config, keychain, secretServiceForCollection(request.config.collectionGuid));
    fs.writeFileSync(request.filename, JSON.stringify(sanitised, null, 4));
    win.webContents.send("loadCollectionResponse", request);
}

async function saveCollectionAs(request) {
    var userChosenPath = dialog.showSaveDialogSync({ defaultPath: request.name, filters: [{ name: 'FullyRested Collection', extensions: ['reasycol'] }] });
    if (userChosenPath == undefined) {
        return;
    }

    request.filename = userChosenPath
    request.path = path.dirname(request.filename);
    request.name = path.basename(request.filename);
    await saveCollection(request);
}

async function saveAsRequest(request) {
    var userChosenPath = dialog.showSaveDialogSync({ defaultPath: request.name, filters: [{ name: 'FullyRested Projects', extensions: ['reasyreq'] }] });
    if (userChosenPath == undefined) {
        return;
    }
    var sanitised = await storeSecrets(request, keychain, secretServiceForRequest(request.id));
    fs.writeFileSync(userChosenPath, JSON.stringify(sanitised, null, 4));
    if (request.name.startsWith("<unnamed")) {
        var basename = path.basename(userChosenPath);
        request.name = basename.substring(0, basename.length - 9);
    }
    win.webContents.send("savedAsCompleted", { id: request.id, fullFilename: userChosenPath, name: request.name });
}

async function saveRequest(request) {
    var sanitised = await storeSecrets(request.action, keychain, secretServiceForRequest(request.action.id));
    fs.writeFileSync(request.fullFilename, JSON.stringify(sanitised, null, 4));
    win.webContents.send("savedAsCompleted", { id: request.action.id, fullFilename: request.fullFilename, name: request.action.name });
}
