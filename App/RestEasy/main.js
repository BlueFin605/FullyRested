const { app, BrowserWindow, ipcMain, dialog } = require('electron')
// include the Node.js 'path' module at the top of your file
const path = require('node:path')
const fs = require('fs');
const url = require('url');
const axios = require('axios');
// var path = require('path');
// const prom = require('node:fs/promises');

let win;

const createWindow = () => {
    console.log('createWindow');
    win = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js')
        }
    })

    win.webContents.openDevTools();

    win.loadFile('dist/rest-easy/index.html');
    console.log('createWindow, done');
}

app.whenReady().then(() => {
    createWindow()

    // traverseDirectory();
    // console.log(prom);
    // const versions = process.versions;
    // console.log(versions);

    // prom.readdir(app.getPath("userData"), { recursive: true })
    //     .then(files => console.log(files))
    //     .catch(err => {
    //         console.log(err)
    //     });

    // const isDirectory = path => statSync(path).isDirectory();
    // const getDirectories = path =>
    //     fs.readdirSync(path).map(name => join(path, name)).filter(isDirectory);

    // const isFile = path => statSync(path).isFile();
    // const getFiles = path =>
    //     fs.readdirSync(path).map(name => join(path, name)).filter(isFile);

    // const getFilesRecursively = (path) => {
    //     let dirs = getDirectories(path);
    //     let files = dirs
    //         .map(dir => getFilesRecursively(dir)) // go through each directory
    //         .reduce((a, b) => a.concat(b), []);    // map returns a 2d array (array of file arrays) so flatten
    //     return files.concat(getFiles(path));
    // };

    // getFilesRecursively(app.getPath("userData"))
    //     .then(files => console.log(files))
    //     .catch(err => {
    //         console.log(err)
    //     });



    // tree = {};
    // for (const filePath of walkSync(app.getPath("userData"), tree)) {
    //     console.log(filePath);
    // }

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })


    ipcMain.handle("testRest", (event, request) => {
        return executeAction(event, request);
    });

    ipcMain.handle("readState", (event, request) => {
        return readState();
    });

    ipcMain.handle("traverseDirectory", (event, request) => {
        console.log('ipcMain.handle -> traverseDirectory');
        return traverseDirectory(request);
    });

    ipcMain.on("loadSolution", (event, request) => {
        console.log('ipcMain.handle -> loadSolution');
        return loadSolution();
    });

    ipcMain.on("loadSolutionFromFile", (event, request) => {
        console.log('ipcMain.handle -> loadSolutionFromFile');
        return loadSolutionFromFile(request.fullFileName, request.name, request.path);
    });

    ipcMain.on("saveState", (event, request) => {
        saveState(request);
    });

    ipcMain.on("saveSolution", (event, request) => {
        saveSolution(request);
    });

    ipcMain.on("saveAsRequest", (event,request) => {
        saveAsRequest(request);
    });
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
})

ipcMain.on("navigateDirectory", (event, path) => {
    process.chdir(path);
    getDirectory();
});

async function executeAction(event, request) {
    console.log(`request:[${JSON.stringify(request)})`);
    let axios_request = {
        // headers: { 'Authorization': `Basic ${auth(pat)}` },
        // validateStatus: function (status) {
        //     return status == 429 || status == 404 || (status >= 200 && status < 300);
        // }
    }

    var url = `${request.protocol}://${request.url}`;
    console.log(url);
    try {
        var response = await axios({
            method: request.verb,
            url: url,
            data: request.data,
            headers: request.headers,
            transformResponse: (r) => r,
            responseType: 'arraybuffer'
        })
        // var response = await axios.get(url, axios_request);
        console.log(response.statusText);
        console.log(`response data type:[${typeof (response.data)}][${response.data}]`);

        // console.log(`[${JSON.stringify(response.request)}]`)
        return {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
            headersSent: response.request._headers,
            body: { contentType: response.headers['content-type'], body: response.data }
        };
    }
    catch (error) {
        console.log(`Exception:[${JSON.stringify(error)}]`)
        if (error.response != undefined) {
            console.log(`[${error.response.status}, ${error.response.statusText}, ${error.response.headers}]`)
            return {
                status: error.response.status,
                statusText: error.response.statusText,
                headers: error.response.headers
            };
        }

        return { status: "", statusText: error.code };
    }
}

function saveState(request) {
    console.log(app.getPath("userData"));
    //  console.log(userPath);
    // https://stackoverflow.com/questions/30465034/where-to-store-user-settings-in-electron-atom-shell-application
    //    Just curious but what's the advantage of electron-json-storage vs just 
    // var someObj = JSON.parse(fs.readFileSync(path, { encoding: "utf8" }))
    fs.writeFileSync(buildStateFilename(), JSON.stringify(request, null, 4)); // Even making it async would not add more than a few lines
}

function readState() {
    try {
        console.log(buildStateFilename());
        var state = fs.readFileSync(buildStateFilename());
        console.log(state);
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

function buildStateFilename() {
    return path.join(app.getPath("userData"), "current_state.json");
}

function traverseDirectory(request) {
    console.log(`function traverseDirectory[${request.pathname}][${request.filter}]`);
    // var path = app.getPath("userData");
    //var path = `/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src`;
    var tree = { dir: { name: 'root', path: request.pathname, fullPath: request.pathname }, subdirs: [], files: [] };
    walkSync(request.pathname, request.filter, tree);
    // var json = JSON.stringify(tree);
    // console.log(json);
    console.log(`function traverseDirectory[${request.pathname}][${request.filter}], completed`);
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

function loadSolution() {
    dialog.showOpenDialog(win, { filters: [{ name: 'RestEasy Projects', extensions: ['reasycol'] }] }).then(file => {
        try {
            console.log(file);
            if (file.canceled == false) {
                var filename = file.filePaths[0];
                var pathname = path.dirname(filename);
                var name = path.basename(filename);
                loadSolutionFromFile(filename,name,pathname);
            }
        } catch (err) {
            console.log(`Open Dialog Failed!:[${JSON.stringify(file)}] - [${err}]`);
        }
    });
}

function loadSolutionFromFile(filename, name, path) {
    try {
        console.log(`loadSolutionFromFile(${filename}, ${name}, ${path})`);
        fs.readFile(filename, (err, data) => {
            console.log(`loadSolutionFromFile response (${err},${data}`);
            var solutionConfig = JSON.parse(data);
            if (solutionConfig.recentSolutions == undefined) {
                solutionConfig.recentSolutions = [];
            }

            console.log(solutionConfig);
            win.webContents.send("loadSolutionResponse", { config: solutionConfig, filename: filename, name: name, path: path });
        });
    }
    catch (err) {
        console.log(`Solution File not found!:[${JSON.stringify(file)}] - [${err}]`);
    }
}

function saveSolution(request) {
    fs.writeFileSync(request.solFile, JSON.stringify(request.solution)); // Even making it async would not add more than a few lines
}

function saveAsRequest(request){
    // app.getPath("desktop")       // User's Desktop folder
    // app.getPath("documents")     // User's "My Documents" folder
    // app.getPath("downloads")     // User's Downloads folder

//    var toLocalPath = path.resolve(app.getPath("desktop"), path.basename(remoteUrl);

// defaultPath: toLocalPath, 
    console.log(request);
    var userChosenPath = dialog.showSaveDialogSync({ defaultPath: request.name, filters: [{ name: 'RestEasy Projects', extensions: ['reasyreq'] }] });
    console.log(userChosenPath);
    if(userChosenPath == undefined){
        return;
    }
    saveRequest (userChosenPath, request);
    if (request.name.startsWith("<unnamed")) {
        console.log(request.name);
        var basename = path.basename(userChosenPath);
        console.log(basename);
        request.name = basename.substring(0,basename.length - 9);
        console.log(request.name);
    }
    win.webContents.send("savedAsCompleted", { id: request.id, fullFilename: userChosenPath, name: request.name });
}

function saveRequest (filename, request) {
    // var file = fs.createWriteStream(filename);
    fs.writeFileSync(filename, JSON.stringify(request, null, 4));
};