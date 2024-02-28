import { contextBridge, ipcRenderer } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';
import url from 'url';
import { glob } from 'glob';

const listeners = {
  menu: null,
};

const windowParams = new URLSearchParams(document.location.search.substring(1));
const appPath = windowParams.get('appPath');

contextBridge.exposeInMainWorld('nodePath', path);

const RUNTIME_MODE_LIVE = 'live';
const RUNTIME_MODE_EXPORT = 'export';
let runtimeMode = RUNTIME_MODE_LIVE;
let currentFrame = 1;

function getRuntimeMode() {
  return runtimeMode;
}

function setRuntimeMode(mode) {
  if (mode === RUNTIME_MODE_LIVE || mode === RUNTIME_MODE_EXPORT) {
    runtimeMode = mode;
  }
}

function getCurrentFrame() {
  return currentFrame;
}

function setCurrentFrame(frame) {
  currentFrame = frame;
}

function getPackagedFile(filePath) {
  return path.resolve(appPath, filePath);
}

async function showOpenProjectDialog() {
  const filePath = await ipcRenderer.invoke('showOpenProjectDialog');
  return filePath;
}

async function showSaveProjectDialog() {
  const filePath = await ipcRenderer.invoke('showSaveProjectDialog');
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

async function showSaveImageDialog() {
  const filePath = await ipcRenderer.invoke('showSaveImageDialog');
  return filePath;
}

async function showNodeContextMenu() {
  await ipcRenderer.invoke('showNodeContextMenu');
}

async function showPortContextMenu(port) {
  await ipcRenderer.invoke('showPortContextMenu', { nodeId: port.node.id, portName: port.name, valueType: port._value.type });
}

async function addToRecentFiles(filePath) {
  await ipcRenderer.invoke('addToRecentFiles', filePath);
}

async function setFullScreen(fullscreen) {
  await ipcRenderer.invoke('setFullScreen', fullscreen);
}

async function readProjectFile(filePath) {
  const data = await fs.readFile(filePath, 'utf8');
  return data;
}

async function writeProjectFile(filePath, data) {
  await fs.writeFile(filePath, data);
}

async function ensureDirectory(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function globFiles(baseDir, pattern) {
  const globPattern = path.join(baseDir, pattern);
  return new Promise((resolve, reject) => {
    glob(globPattern, (err, files) => {
      if (err) {
        reject(err);
      } else {
        resolve(files);
      }
    });
  });
}

async function saveBufferToFile(buffer, filePath) {
  await fs.writeFile(filePath, Buffer.from(buffer));
}

const pathToFileURL = (filename) => url.pathToFileURL(filename).toString();

ipcRenderer.on('menu', (_, name, args) => {
  listeners['menu'](name, args);
});

function registerListener(name, fn) {
  listeners[name] = fn;
}

function oscSendMessage(ip, port, address, ...args) {
  ipcRenderer.invoke('oscSendMessage', { ip, port, address, args });
}

contextBridge.exposeInMainWorld('desktop', {
  getRuntimeMode,
  setRuntimeMode,
  getCurrentFrame,
  setCurrentFrame,
  getPackagedFile,
  showOpenProjectDialog,
  showSaveProjectDialog,
  showOpenFileDialog,
  showOpenDirectoryDialog,
  showSaveImageDialog,
  showNodeContextMenu,
  showPortContextMenu,
  addToRecentFiles,
  setFullScreen,
  readProjectFile,
  writeProjectFile,
  ensureDirectory,
  globFiles,
  saveBufferToFile,
  pathToFileURL,
  registerListener,
  oscSendMessage,
});
