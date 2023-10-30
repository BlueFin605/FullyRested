const {contextBridge,ipcRenderer} = require("electron");

//for an explanation on how this all works - see https://medium.com/swlh/how-to-safely-set-up-an-electron-app-with-vue-and-webpack-556fb491b83

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
    "ipc", {
        send: (channel, data) => {
            // whitelist channels
            let validChannels = ["saveState"];
            if (validChannels.includes(channel)) {
                ipcRenderer.send(channel, data);
            }
        },
        receive: (channel, func) => {
            let validChannels = ["getDirectoryResponse","getImagesResponse"];
            if (validChannels.includes(channel)) {
                // Deliberately strip event as it includes `sender` 
                ipcRenderer.on(channel, (event, ...args) => func(...args));
            }
        },
        invoke: (channel, args) => {
            let validChannels = ["testRest","readState"];
            if (validChannels.includes(channel)) {
                return ipcRenderer.invoke(channel, args);
            }
        }
    }
);