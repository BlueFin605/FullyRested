const { app, BrowserWindow, ipcMain } = require('electron')
// include the Node.js 'path' module at the top of your file
const path = require('node:path')
const fs = require('fs');
const url = require('url');

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
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
})


function getImages() {
    console.log('getImages');
    const cwd = process.cwd();
    fs.readdir('.', {withFileTypes: true}, (err, files) => {
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
    fs.readdir('.', {withFileTypes: true}, (err, files) => {
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
  
