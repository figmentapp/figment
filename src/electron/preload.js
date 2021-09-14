const { contextBridge } = require('electron');
const fs = require('fs').promises;
const path = require('path');
const url = require('url');
const { ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nodeFs', fs);
contextBridge.exposeInMainWorld('nodePath', path);
contextBridge.exposeInMainWorld('nodeUrl', url);
contextBridge.exposeInMainWorld('ipcRenderer', ipcRenderer);

// process.once('loaded', () => {
//   global.fs = fs;
//   global.path = path;
//   global.url = url;
// });

// module.exports = { fs, path, url };
