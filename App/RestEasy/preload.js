const {contextBridge,ipcRenderer} = require("electron");

//for an explanation on how this all works - see https://medium.com/swlh/how-to-safely-set-up-an-electron-app-with-vue-and-webpack-556fb491b83

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
    "ipc", {
        send: (channel, data) => {
            console.log(`send[${channel}][${data}]`);
            // whitelist channels
            let validChannels = ["loadSolution","loadSolutionFromFile","saveState", "saveSolution", "saveAsRequest", "saveRequest"];
            if (validChannels.includes(channel)) {
                ipcRenderer.send(channel, data);
            }
        },
        receive: (channel, func) => {
            console.log(`receieve[${channel}][${func}]`);
            let validChannels = ["loadSolutionResponse", "savedAsCompleted"];
            if (validChannels.includes(channel)) {
                // Deliberately strip event as it includes `sender` 
                ipcRenderer.on(channel, (event, ...args) => {
                    setTimeout(() => func(...args));
                });
            }
        },
        invoke: (channel, args) => {
            console.log(`invoke[${channel}][${args}]`);
            let validChannels = ["testRest", "readState", "traverseDirectory", "loadRequest"];
            if (validChannels.includes(channel)) {
                return ipcRenderer.invoke(channel, args);
            }
        }
    }
);