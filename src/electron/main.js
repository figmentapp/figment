import querystring from 'node:querystring';
import { app, Menu, BrowserWindow, session, ipcMain, dialog, systemPreferences } from 'electron';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';
import { oscSendMessage, oscStartServer, oscStopServer } from './osc.js';
import minimist from 'minimist';
const isWindows = process.platform === 'win32';
const isMac = process.platform === 'darwin';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FILTER_MAP = {
  project: { name: 'Figment Project', extensions: ['fgmt'] },
  image: { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif'] },
  video: { name: 'Videos', extensions: ['mp4', 'webm'] },
  generic: { name: 'All Files', extensions: ['*'] },
};

class Settings {
  settingsPath = path.join(app.getPath('userData'), 'settings.json');

  async load() {
    try {
      this._raw = JSON.parse(await fs.readFile(this.settingsPath, 'utf-8'));
    } catch (e) {
      this._raw = {};
    }
  }

  async save() {
    await fs.writeFile(this.settingsPath, JSON.stringify(this._raw, null, 2));
  }

  _assertLoaded() {
    if (this._raw === undefined) {
      throw new Error(`Trying to access settings ${this.settingsPath} but they are not loaded yet.`);
    }
  }

  getRecentProjects() {
    this._assertLoaded();
    return (this._raw.recentProjects || []).slice();
  }

  async addRecentProject(filePath) {
    let recents = this._raw.recentProjects || [];
    recents = recents.filter((r) => r !== filePath);
    recents.unshift(filePath);
    recents = recents.slice(0, 10);
    this._raw.recentProjects = recents;
    await this.save();
  }

  async clearRecentProjects() {
    this._raw.recentProjects = [];
    await this.save();
  }
}

let gMainWindow;
let gSettings = new Settings();

function emit(name, args = {}) {
  return () => {
    gMainWindow.webContents.send('menu', name, args);
  };
}

async function showOpenProjectDialog() {
  const { filePaths } = await dialog.showOpenDialog({
    title: 'Open Project',
    properties: ['openFile'],
    filters: [FILTER_MAP.project],
  });
  if (!filePaths || filePaths.length < 1) {
    return;
  }

  const filePath = filePaths[0];
  gSettings.addRecentProject(filePath);
  gMainWindow.setRepresentedFilename(filePath);
  // gMainWindow.webContents.send('open-project', filePath);
  return filePath;
}
ipcMain.handle('showOpenProjectDialog', showOpenProjectDialog);

async function showOpenFileDialog(fileType = 'generic') {
  const { filePaths } = await dialog.showOpenDialog({
    title: 'Open Image',
    properties: ['openFile'],
    filters: [FILTER_MAP[fileType]],
  });
  if (!filePaths || filePaths.length < 1) {
    return;
  }

  const filePath = filePaths[0];
  return filePath;
}
ipcMain.handle('showOpenFileDialog', showOpenFileDialog);

async function showOpenDirectoryDialog() {
  const { filePaths } = await dialog.showOpenDialog({
    title: 'Choose Directory',
    button: 'Choose Directory',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (!filePaths || filePaths.length < 1) {
    return;
  }
  const filePath = filePaths[0];
  return filePath;
}
ipcMain.handle('showOpenDirectoryDialog', showOpenDirectoryDialog);

async function showSaveProjectDialog() {
  const result = await dialog.showSaveDialog({
    title: 'Save Project',
    filters: [FILTER_MAP.project],
  });
  if (result.canceled) return null;
  gSettings.addRecentProject(result.filePath);
  gMainWindow.setRepresentedFilename(result.filePath);
  return result.filePath;
}
ipcMain.handle('showSaveProjectDialog', showSaveProjectDialog);

async function showSaveImageDialog() {
  const result = await dialog.showSaveDialog({
    title: 'Save Image',
    filters: [FILTER_MAP.image],
  });
  if (result.canceled) return null;
  return result.filePath;
}
ipcMain.handle('showSaveImageDialog', showSaveImageDialog);

function showNodeContextMenu(nodeId) {
  const menu = Menu.buildFromTemplate([
    {
      label: 'Export Image…',
      click: emit('export-image'),
    },
    { type: 'separator' },
    {
      label: 'View Node Source',
      click: emit('view-node-source'),
    },
  ]);
  menu.popup(gMainWindow);
}
ipcMain.handle('showNodeContextMenu', showNodeContextMenu);

function showPortContextMenu(_, { nodeId, portName, valueType }) {
  let menuItems = [];
  menuItems.push({ label: 'Revert to Default', click: emit('revert-to-default', { nodeId, portName }) });
  if (valueType === 'expression') {
    menuItems.push({ label: 'Delete Expression', click: emit('delete-expression', { nodeId, portName }) });
  } else {
    menuItems.push({ label: 'Edit Expression', click: emit('edit-expression', { nodeId, portName }) });
  }
  const menu = Menu.buildFromTemplate(menuItems);
  menu.popup(gMainWindow);
}
ipcMain.handle('showPortContextMenu', showPortContextMenu);

function setFullScreen(_, fullscreen) {
  gMainWindow.setFullScreen(fullscreen);
  gMainWindow.setMenuBarVisibility(!fullscreen);
}
ipcMain.handle('setFullScreen', setFullScreen);

function onTouchProject(filePath) {
  gSettings.addRecentProject(filePath);
  createApplicationMenu();
}

async function onClearRecentProjects() {
  await gSettings.clearRecentProjects();
  createApplicationMenu();
}

function sendIpcMessage(channel, ...args) {
  if (gMainWindow.isDestroyed()) return;
  gMainWindow.webContents.send(channel, ...args);
}

ipcMain.handle('addToRecentFiles', (_, filePath) => onTouchProject(filePath));

ipcMain.handle('oscSendMessage', (_, { ip, port, address, args }) => {
  oscSendMessage(ip, port, address, args);
});

let _serverHandle = null;
ipcMain.handle('oscStartServer', (_, { port }) => {
  if (_serverHandle) {
    oscStopServer(_serverHandle);
    sendIpcMessage('osc', 'stop-server');
  }
  _serverHandle = oscStartServer(port, sendIpcMessage);
  sendIpcMessage('osc', 'start-server', { port });
});

ipcMain.handle('oscStopServer', (_) => {
  if (_serverHandle) {
    oscStopServer(_serverHandle);
    sendIpcMessage('osc', 'stop-server');
    _serverHandle = null;
  }
});

async function startDevServer() {
  if (process.env.NODE_ENV !== 'development') return;
  const { createServer, createLogger, build } = await import('vite');
  debugger;

  const viteServer = await createServer({
    root: path.resolve(__dirname, '../ui'),
    logLevel: 'info',
    server: {
      port: 3000,
      strictPort: true,
    },
  });
  await viteServer.listen();
  return viteServer;
}

function createMainWindow(filePath) {
  gMainWindow = new BrowserWindow({
    width: 1200,
    height: 1000,
    show: false,
    icon: path.join(__dirname, 'assets/icons/app-icon-512.png'),
    webPreferences: {
      nativeWindowOpen: true,
      preload: path.join(__dirname, 'preload.mjs'),
      webSecurity: false,
      nodeIntegration: true,
    },
  });

  const encodedFilePath = filePath ? querystring.escape(filePath) : '';
  // Load the index.html of the app.
  if (process.env.NODE_ENV === 'development') {
    gMainWindow.loadURL(`http://localhost:3000/?appPath=${app.getAppPath()}&filePath=${encodedFilePath}`);
    gMainWindow.webContents.openDevTools();
  } else {
    const electronDir = __dirname;
    const asarDir = path.join(electronDir, '../../');
    const uiDir = path.join(asarDir, 'build');
    gMainWindow.loadURL(`file:///${uiDir}/index.html?appPath=${app.getAppPath()}&filePath=${encodedFilePath}`);
  }

  // Open the window
  gMainWindow.once('ready-to-show', () => {
    gMainWindow.show();
  });
}

function createApplicationMenu() {
  const macAppMenu = {
    label: app.name,
    submenu: [
      { role: 'about' },
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit' },
    ],
  };

  const recentProjects = gSettings.getRecentProjects();
  let recentItems;
  if (recentProjects.length === 0) {
    recentItems = [{ key: 'null', label: 'No Recent Projects', enabled: false }];
  } else {
    recentItems = recentProjects.map((filePath) => ({
      key: filePath,
      label: path.basename(filePath),
      click: emit('open', { filePath }),
    }));
    recentItems.push({ type: 'separator' });
    recentItems.push({ label: 'Clear Recent Projects', click: onClearRecentProjects });
  }

  const fileMenu = {
    role: 'fileMenu',
    label: 'File',
    submenu: [
      { label: 'New Project', accelerator: 'CmdOrCtrl+N', click: emit('new') },
      { type: 'separator' },
      { label: 'Open Project…', accelerator: 'CmdOrCtrl+O', click: emit('open') },
      {
        key: 'recentProjects',
        label: 'Open Recent',
        submenu: recentItems,
      },
      { type: 'separator' },
      { label: 'Save', accelerator: 'CmdOrCtrl+S', click: emit('save') },
      {
        label: 'Save As…',
        accelerator: 'CmdOrCtrl+Shift+S',
        click: emit('save-as'),
      },
      { type: 'separator' },
      { label: 'Project Settings…', accelerator: 'CmdOrCtrl+;', click: emit('project-settings-dialog') },
      { type: 'separator' },
      { label: 'Render…', accelerator: 'CmdOrCtrl+Shift+E', click: emit('render-dialog') },
    ],
  };
  if (!isMac) {
    fileMenu.submenu.push({ type: 'separator' });
    fileMenu.submenu.push({
      role: 'quit',
    });
  }

  const viewMenu = {
    role: 'viewMenu',
    label: 'View',
    submenu: [
      { label: 'Enter Full Screen', accelerator: 'CmdOrCtrl+Shift+F', click: emit('enter-full-screen') },
      { type: 'separator' },
      { role: 'reload' },
      { role: 'forcereload' },
      { role: 'toggledevtools' },
      { type: 'separator' },
    ],
  };

  const template = [...(isMac ? [macAppMenu] : []), fileMenu, { role: 'editMenu' }, viewMenu, { role: 'windowMenu' }];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

const argv = minimist(process.argv.slice(2));

let gDevServer;
let filePathToOpen = null;

app.on('open-file', (event, filePath) => {
  event.preventDefault();
  // Handle the file only if the app is ready, otherwise store the path for later processing
  if (app.isReady()) {
    createMainWindow(filePath);
  } else {
    filePathToOpen = filePath;
  }
});

app.whenReady().then(async () => {
  await gSettings.load();
  gDevServer = await startDevServer();
  // const status = systemPreferences.getMediaAccessStatus('camera');
  // if (status !== 'granted') {
  //   await systemPreferences.askForMediaAccess('camera');
  // }
  createApplicationMenu();

  // For macOS, use the filePathToOpen if it's been set by the 'open-file' event
  // For Windows/Linux, process command-line arguments to find a .fgmt file to open
  const fileArg = process.argv.find((arg) => arg.endsWith('.fgmt')) || filePathToOpen;
  createMainWindow(filePathToOpen);
});
