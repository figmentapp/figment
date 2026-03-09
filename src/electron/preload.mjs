import { contextBridge, ipcRenderer, nativeImage } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';
import url from 'url';
import { glob } from 'glob';
import { createNativeImageEncoder } from './imageEncoding.js';

const listeners = {
  menu: null,
  osc: null,
  udp: null,
  shortcut: null,
  midi: null,
  midiDevices: null,
};
const nativeImageEncoder = createNativeImageEncoder({
  nativeImage,
  writeFile: fs.writeFile.bind(fs),
});

const windowParams = new URLSearchParams(document.location.search.substring(1));
const appPath = windowParams.get('appPath');

contextBridge.exposeInMainWorld('nodePath', path);

const RUNTIME_MODE_LIVE = 'live';
const RUNTIME_MODE_EXPORT = 'export';
let runtimeMode = RUNTIME_MODE_LIVE;
let currentFrame = 1;
let exportFps = 60; // Default export frame rate

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

function getExportFps() {
  return exportFps;
}

function setExportFps(fps) {
  exportFps = fps;
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

async function globFiles(baseDir, pattern, options = {}) {
  const globPattern = path.join(baseDir, pattern);
  const files = await glob(globPattern, { windowsPathsNoEscape: true });

  const { sortBy = 'alphabetical', order = 'ascending' } = options ?? {};
  const isDescending = order === 'descending';

  if (sortBy === 'alphabetical') {
    const sorted = [...files].sort((a, b) => a.localeCompare(b));
    return isDescending ? sorted.reverse() : sorted;
  }

  const sortKey = sortBy === 'created' ? 'created' : 'modified';
  const fileMeta = await Promise.all(
    files.map(async (file) => {
      try {
        const stats = await fs.stat(file);
        return {
          file,
          created: stats.birthtimeMs,
          modified: stats.mtimeMs,
        };
      } catch (err) {
        return {
          file,
          created: 0,
          modified: 0,
        };
      }
    })
  );

  fileMeta.sort((a, b) => {
    const diff = a[sortKey] - b[sortKey];
    if (diff === 0) {
      return a.file.localeCompare(b.file);
    }
    return isDescending ? -diff : diff;
  });

  return fileMeta.map(({ file }) => file);
}

async function saveBufferToFile(buffer, filePath) {
  await fs.writeFile(filePath, Buffer.from(buffer));
}

async function encodeAndSaveImage({ rgbaBuffer, width, height, filePath, imageType, imageQuality }) {
  return await nativeImageEncoder.encodeAndSaveImage({ rgbaBuffer, width, height, filePath, imageType, imageQuality });
}

const pathToFileURL = (filename) => url.pathToFileURL(filename).toString();

ipcRenderer.on('menu', (_, name, args) => {
  if (typeof listeners['menu'] === 'function') {
    listeners['menu'](name, args);
  }
});

ipcRenderer.on('osc', (_, name, args) => {
  if (typeof listeners['osc'] === 'function') {
    listeners['osc'](name, args);
  }
});

ipcRenderer.on('udp', (_, name, args) => {
  if (typeof listeners['udp'] === 'function') {
    listeners['udp'](name, args);
  }
});

ipcRenderer.on('shortcut', (_, payload) => {
  if (typeof listeners['shortcut'] === 'function') {
    listeners['shortcut'](payload);
  }
});

ipcRenderer.on('midi-update', (_, data) => {
  if (typeof listeners['midi'] === 'function') {
    listeners['midi'](data);
  }
});

ipcRenderer.on('midi-program-change', (_, data) => {
  if (typeof listeners['midiProgramChange'] === 'function') {
    listeners['midiProgramChange'](data);
  }
});

ipcRenderer.on('midi-devices', (_, data) => {
  if (typeof listeners['midiDevices'] === 'function') {
    listeners['midiDevices'](data);
  }
});

function registerListener(name, fn) {
  listeners[name] = fn;
}

function udpSendMessage(ip, port, data) {
  ipcRenderer.invoke('udpSendMessage', { ip, port, data });
}

function startUdpServer(port) {
  ipcRenderer.invoke('udpStartServer', { port });
}

function stopUdpServer(port) {
  ipcRenderer.invoke('udpStopServer', { port });
}

function oscSendMessage(ip, port, address, ...args) {
  ipcRenderer.invoke('oscSendMessage', { ip, port, address, args });
}

function startOscServer(port) {
  ipcRenderer.invoke('oscStartServer', { port });
}

function stopOscServer() {
  ipcRenderer.invoke('oscStopServer');
}

// Global shortcut helpers
async function registerGlobalShortcut(id, accel) {
  return await ipcRenderer.invoke('registerGlobalShortcut', { id, accel });
}

function unregisterGlobalShortcut(accel) {
  ipcRenderer.invoke('unregisterGlobalShortcut', { accel });
}

async function setRepresentedFilename(filePath) {
  await ipcRenderer.invoke('setRepresentedFilename', filePath);
}

async function setDocumentEdited(edited) {
  await ipcRenderer.invoke('setDocumentEdited', edited);
}

async function openExternal(url) {
  await ipcRenderer.invoke('openExternal', url);
}

async function getMidiDevices() {
  return await ipcRenderer.invoke('getMidiDevices');
}

contextBridge.exposeInMainWorld('desktop', {
  getRuntimeMode,
  setRuntimeMode,
  getCurrentFrame,
  setCurrentFrame,
  getExportFps,
  setExportFps,
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
  encodeAndSaveImage,
  pathToFileURL,
  registerListener,
  oscSendMessage,
  startOscServer,
  stopOscServer,
  udpSendMessage,
  startUdpServer,
  stopUdpServer,
  registerGlobalShortcut,
  unregisterGlobalShortcut,
  setRepresentedFilename,
  setDocumentEdited,
  getMidiDevices,
  openExternal,
});
