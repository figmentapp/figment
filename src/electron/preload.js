const { contextBridge } = require('electron');
const fs = require('fs').promises;
const path = require('path');
const url = require('url');
const { ipcRenderer } = require('electron');
const glob = require('glob');

const listeners = {
  menu: null,
};

contextBridge.exposeInMainWorld('nodePath', path);

async function showOpenProjectDialog() {
  const filePath = await ipcRenderer.invoke('showOpenProjectDialog');
  return filePath;
}

async function showOpenFileDialog(fileType = 'generic') {
  const filePath = await ipcRenderer.invoke('showOpenFileDialog', fileType);
  return filePath;
}

async function showOpenDirectoryDialog() {
  const filePath = await ipcRenderer.invoke('showOpenDirectoryDialog');
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

async function globFiles(baseDir, pattern, cb) {
  const globPattern = path.join(baseDir, pattern);
  glob(globPattern, cb);
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
  showOpenFileDialog,
  showOpenDirectoryDialog,
  readProjectFile,
  writeProjectFile,
  globFiles,
  pathToFileURL,
  registerListener,
});
