const { app, BrowserWindow, ipcMain, dialog } = require('electron')
// include the Node.js 'path' module at the top of your file
const path = require('node:path')
const fs = require('fs');
const url = require('url');
const axios = require('axios');
const keytar = require('keytar');
const { request } = require('node:http');
const { SignatureV4 } = require('@aws-sdk/signature-v4');
const { Sha256 }= require('@aws-crypto/sha256-js');
// import sigv4 from '@aws-sdk/signature-v4';
// const { SignatureV4 } = sigv4;

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

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })

    ipcMain.handle("testRest", (event, request) => {
        return executeAction(event, request);
    });

    ipcMain.handle("readState", (event, request) => {
        return readState();
    });

    ipcMain.handle("loadRequest", (event, request) => {
        return loadRequest(request);
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

    ipcMain.on("saveAsRequest", (event, request) => {
        saveAsRequest(request);
    });

    ipcMain.on("saveRequest", (event, request) => {
        saveRequest(request);
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

    var url = `${request.protocol}://${request.url}`;

    try {
        switch (request.authentication?.authentication) {
            case 'awssig':
                url = await addAwsSigToRequest(url, request)
                break;
        }

        request.headers['content-type'] = request.body.contentType;

        console.log('=========== request ===========`')
        console.log(url);
        console.log(request);
        console.log('--------------------------------')

        var axiosRequest = {
            method: request.verb,
            url: url,
            data: buildData(request.body),
            headers: request.headers,
            transformResponse: (r) => r,
            responseType: 'arraybuffer'
        }
        
        console.log(axiosRequest);
        
        console.log('--------------------------------')
        
        var response = await axios(axiosRequest);
        
        console.log('=========== response ===========`')
        console.log(response.statusText);
        console.log(`response data type:[${typeof (response.data)}]`);
        console.log(response.data);
        console.log(response.data.headers);
        
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

function buildData(body)
{
    switch (body.contentType)
    {
        case 'application/x-www-form-urlencoded':
        case 'none':
        {
            console.log('no body');
            return undefined;
        }
    }
    
    console.log(body.body);
    return body.body;
}

async function addAwsSigToRequest(url, rawrequest) {
    console.log('addAwsSigToRequest');
    console.log(url);
    console.log(rawrequest);

    const urlParts = new URL(url);
    
    const awsQueryParams = {};
    urlParts.searchParams.forEach((value, key) => {
        awsQueryParams[key] = value;
    });
    
    rawrequest.headers['host'] = urlParts.host;

    const request = {
        hostname: urlParts.hostname,
        path: urlParts.pathname,
        method: 'GET',
        protocol: urlParts.protocol,
        query: awsQueryParams,
        headers: rawrequest.headers
    };

    // console.log(request);
    console.log(request);

    const sigv4 = new SignatureV4({
        service: rawrequest.authentication.awsSig.serviceName,
        region: rawrequest.authentication.awsSig.awsRegion,
        credentials: {
          accessKeyId: rawrequest.authentication.awsSig.accessKey,
          secretAccessKey: rawrequest.authentication.awsSig.secretKey
        },
        sha256: Sha256,
      });

    var signedrequest = await sigv4.sign(request, { signableHeaders: new Set(), unsignableHeaders: new Set() });

    console.log(signedrequest);

    rawrequest.headers = signedrequest.headers;

    const searchParams = new URLSearchParams();
    for (const key in signedrequest.query) {
        if (signedrequest.query.hasOwnProperty(key)) {
            searchParams.append(key, signedrequest.query[key]);
        }
    }

    urlParts.search = searchParams.toString();
    const finalUrl = urlParts.toString();
    console.log(finalUrl);
    return finalUrl;
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

function loadRequest(fullFilename) {
    try {
        console.log(fullFilename);
        var request = fs.readFileSync(fullFilename);
        console.log(request);
        return JSON.parse(request);
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
    console.log(`function traverseDirectory[${request.pathname}][${request.filter}]`);
    // var path = app.getPath("userData");
    //var path = `/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src`;
    var tree = { dir: { name: 'src', path: request.pathname, fullPath: request.pathname }, subdirs: [], files: [] };
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

async function loadSolution() {
    var file = await dialog.showOpenDialog(win, { filters: [{ name: 'RestEasy Projects', extensions: ['reasycol'] }] });

    try {
        console.log(file);
        if (file.canceled == false) {
            var filename = file.filePaths[0];
            var pathname = path.dirname(filename);
            var name = path.basename(filename);
            await loadSolutionFromFile(filename, name, pathname);
        }
    } catch (err) {
        console.log(`Open Dialog Failed!:[${JSON.stringify(file)}] - [${err}]`);
    }
}

async function loadSolutionFromFile(filename, name, path) {
    try {
        var data = await new Promise((accept, reject) => {
            console.log(`loadSolutionFromFile(${filename}, ${name}, ${path})`);
            fs.readFile(filename, (err, data) => {
                console.log(`loadSolutionFromFile response (${err},${data}`);
                if (err)
                    reject(err);

                accept(data);
            });
        });

        var solutionConfig = await addSecrets(data);
        console.log(solutionConfig);
        win.webContents.send("loadSolutionResponse", { config: solutionConfig, filename: filename, name: name, path: path });
    }
    catch (err) {
        console.log(`Solution File load error!:[${err}]`);
    }
}

function saveSolution(request) {
    console.log(`saveSolution[${JSON.stringify(request)}]`)
    var sanitised = sanitiseObject(request.config);
    fs.writeFileSync(request.filename, JSON.stringify(sanitised, null, 4)); // Even making it async would not add more than a few lines
    win.webContents.send("loadSolutionResponse", request);
}

async function addSecrets(data) {
    var obj = JSON.parse(data);

    await addPasswords(obj, buildKeytarService(obj));

    return obj;
}

function sanitiseObject(solutionConfig) {
    var serviceName = buildKeytarService(solutionConfig);

    //make a copy
    var copy = JSON.parse(JSON.stringify(solutionConfig));
    stripPasswords(copy, serviceName);
    return copy;
}

function stripPasswords(obj, serviceName) {
    Object.keys(obj).forEach(key => {
        // console.log(`key: [${key}], value: [${obj[key]}]`)

        if (obj[key] === null) {
            return;
        }

        if (typeof obj[key] === 'object') {
            // console.log(`$secret: ${$secret}, $value: ${$value}`);
            var $secret = obj[key]['$secret'];
            var $value = obj[key]['$value'];

            if ($secret != undefined && $value != undefined) {
                console.log(`sanitise $secret[${$secret}] $value[${$value}] into [${serviceName}]`);
                keytar.setPassword(serviceName, $secret, $value);
                obj[key]['$value'] = undefined;
            }

            stripPasswords(obj[key], serviceName);
        }
    })
}

async function addPasswords(obj, serviceName) {
    for await (const key of Object.keys(obj)) {
        // Object.keys(obj).forEach(key => {
        // console.log(`key: [${key}], value: [${obj[key]}]`)

        if (obj[key] === null) {
            return;
        }

        if (typeof obj[key] === 'object') {
            // console.log(`$secret: ${$secret}, $value: ${$value}`);
            var $secret = obj[key]['$secret'];

            if ($secret != undefined) {
                var $value = await keytar.getPassword(serviceName, $secret);
                console.log(`retrieve $secret[${$secret}] from [${serviceName}]`);
                console.log($value);
                obj[key]['$value'] = $value;
                console.log(obj[key]);
            }

            await addPasswords(obj[key], serviceName);
        }
    }
}

function buildKeytarService(solutionConfig) {
    return `resteasy-solution-${solutionConfig.solutionGuid}`;
}

function saveAsRequest(request) {
    // app.getPath("desktop")       // User's Desktop folder
    // app.getPath("documents")     // User's "My Documents" folder
    // app.getPath("downloads")     // User's Downloads folder

    //    var toLocalPath = path.resolve(app.getPath("desktop"), path.basename(remoteUrl);

    // defaultPath: toLocalPath, 
    console.log(request);
    var userChosenPath = dialog.showSaveDialogSync({ defaultPath: request.name, filters: [{ name: 'RestEasy Projects', extensions: ['reasyreq'] }] });
    console.log(userChosenPath);
    if (userChosenPath == undefined) {
        return;
    }
    fs.writeFileSync(userChosenPath, JSON.stringify(request, null, 4));
    if (request.name.startsWith("<unnamed")) {
        console.log(request.name);
        var basename = path.basename(userChosenPath);
        console.log(basename);
        request.name = basename.substring(0, basename.length - 9);
        console.log(request.name);
    }
    win.webContents.send("savedAsCompleted", { id: request.id, fullFilename: userChosenPath, name: request.name });
}

function saveRequest(request) {
    console.log(request);

    fs.writeFileSync(request.fullFilename, JSON.stringify(request.action, null, 4));
    win.webContents.send("savedAsCompleted", { id: request.action.id, fullFilename: request.fullFilename, name: request.action.name });
};