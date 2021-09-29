const { contextBridge } = require('electron');
const fs = require('fs').promises;
const path = require('path');
const url = require('url');
const { ipcRenderer } = require('electron');

const listeners = {
  openProject: null,
};

// contextBridge.exposeInMainWorld('nodeFs', fs);
contextBridge.exposeInMainWorld('nodePath', path);
// contextBridge.exposeInMainWorld('nodeUrl', url);
// contextBridge.exposeInMainWorld('ipcRenderer', ipcRenderer);

async function showOpenProjectDialog() {
  const filePath = await ipcRenderer.invoke('showOpenProjectDialog');
  return filePath;
}

async function showSaveProjectDialog() {
  const filePath = await ipcRenderer.invoke('showSaveProjectDialog');
  return filePath;
}

async function readProjectFile(filePath) {
  const data = await fs.readFile(filePath, 'utf8');
  return data;
}

async function writeProjectFile(filePath, data) {
  await fs.writeFile(filePath, data);
}

const pathToFileURL = (filename) => url.pathToFileURL(filename).toString();

ipcRenderer.on('menu', (event, args) => {
  listeners['menu'](args.name, args.filePath);
});

function registerListener(name, fn) {
  listeners[name] = fn;
}

contextBridge.exposeInMainWorld('desktop', {
  showOpenProjectDialog,
  showSaveProjectDialog,
  readProjectFile,
  writeProjectFile,
  pathToFileURL,
  registerListener,
});
