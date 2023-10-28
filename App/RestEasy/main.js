const { app, BrowserWindow, ipcMain } = require('electron')
// include the Node.js 'path' module at the top of your file
const path = require('node:path')
const fs = require('fs');
const url = require('url');
const axios = require('axios');

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

    // https://stackoverflow.com/questions/30465034/where-to-store-user-settings-in-electron-atom-shell-application
    //    Just curious but what's the advantage of electron-json-storage vs just 
    // var someObj = JSON.parse(fs.readFileSync(path, { encoding: "utf8" }))
    // fs.writeFileSync(path, JSON.stringify(someObj)}); // Even making it async would not add more than a few lines

    ipcMain.handle("testRest", async (event, request) => {
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
    });
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
})


function getImages() {
    console.log('getImages');
    const cwd = process.cwd();
    fs.readdir('.', { withFileTypes: true }, (err, files) => {
        if (!err) {
            const re = /(?:\.([^.]+))?$/;
            const images = files
                .filter(file => file.isFile() && ['jpg', 'png'].includes(re.exec(file.name)[1]))
                .map(file => `file://${cwd}/${file.name}`);
            win.webContents.send("getImagesResponse", images);
        }
    });
}

function isRoot() {
    return path.parse(process.cwd()).root == process.cwd();
}

function getDirectory() {
    console.log('getDirectory');
    fs.readdir('.', { withFileTypes: true }, (err, files) => {
        if (!err) {
            const directories = files
                .filter(file => file.isDirectory())
                .map(file => file.name);
            if (!isRoot()) {
                directories.unshift('..');
            }
            console.log(`directories:[${JSON.stringify(directories)}]`);
            win.webContents.send("getDirectoryResponse", directories);
        }
    });
    console.log('getDirectory, done');
}

ipcMain.on("navigateDirectory", (event, path) => {
    process.chdir(path);
    getImages();
    getDirectory();
});

