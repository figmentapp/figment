import querystring from 'node:querystring';
import { app, Menu, BrowserWindow, session, ipcMain, dialog, systemPreferences, globalShortcut, shell } from 'electron';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';
import { oscSendMessage, oscStartServer, oscStopServer } from './osc.js';
import { udpSendMessage, udpStartServer, udpStopServer } from './udp.js';
import { midiStartServer, midiStopServer, midiEmitter, getMidiDevices } from './midi.js';
import { nodeServerStart, nodeServerStop, nodeServerSend, nodeServerStopAll } from './node-server.js';
import { parseRenderArgs, RenderCliError, USAGE } from './render-cli.js';
import { defaultDialogDirectory } from './dialog-paths.js';
const isWindows = process.platform === 'win32';
const isMac = process.platform === 'darwin';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FILTER_MAP = {
  project: { name: 'Figment Project', extensions: ['fgmt'] },
  image: { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif'] },
  video: { name: 'Videos', extensions: ['mp4', 'webm'] },
  onnx: { name: 'ONNX Models', extensions: ['onnx'] },
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
let gDocumentEdited = false;
let gPendingClose = false;
let gProjectFilePath = null;

function setProjectFilePath(filePath) {
  gProjectFilePath = filePath || null;
  if (!gMainWindow || gMainWindow.isDestroyed()) return;
  gMainWindow.setRepresentedFilename(gProjectFilePath || '');
}

function dialogDefaultPath() {
  return defaultDialogDirectory(gProjectFilePath, app.getPath('desktop'));
}

function emit(name, args = {}) {
  return () => {
    gMainWindow.webContents.send('menu', name, args);
  };
}

async function showOpenProjectDialog() {
  const { filePaths } = await dialog.showOpenDialog({
    title: 'Open Project',
    defaultPath: dialogDefaultPath(),
    properties: ['openFile'],
    filters: [FILTER_MAP.project],
  });
  if (!filePaths || filePaths.length < 1) {
    return;
  }

  const filePath = filePaths[0];
  gSettings.addRecentProject(filePath);
  setProjectFilePath(filePath);
  return filePath;
}
ipcMain.handle('showOpenProjectDialog', showOpenProjectDialog);

ipcMain.handle('getMidiDevices', () => {
  return getMidiDevices();
});

async function showOpenFileDialog(fileType = 'generic') {
  const { filePaths } = await dialog.showOpenDialog({
    title: 'Open Image',
    defaultPath: dialogDefaultPath(),
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
    defaultPath: dialogDefaultPath(),
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
    defaultPath: dialogDefaultPath(),
    filters: [FILTER_MAP.project],
  });
  if (result.canceled) return null;
  gSettings.addRecentProject(result.filePath);
  setProjectFilePath(result.filePath);
  return result.filePath;
}
ipcMain.handle('showSaveProjectDialog', showSaveProjectDialog);

async function showSaveImageDialog() {
  const result = await dialog.showSaveDialog({
    title: 'Save Image',
    defaultPath: dialogDefaultPath(),
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
  // Guard against destroyed window
  if (!gMainWindow || gMainWindow.isDestroyed()) {
    return;
  }

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
  if (!gMainWindow || gMainWindow.isDestroyed()) return;
  // Check if webContents is ready before sending
  if (!gMainWindow.webContents) return;
  gMainWindow.webContents.send(channel, ...args);
}

ipcMain.handle('addToRecentFiles', (_, filePath) => onTouchProject(filePath));
ipcMain.handle('openExternal', (_, url) => shell.openExternal(url));

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

ipcMain.handle('udpSendMessage', (_, { ip, port, data }) => {
  udpSendMessage(ip, port, Buffer.from(data));
});

ipcMain.handle('udpStartServer', (_, { port }) => {
  udpStartServer(port, sendIpcMessage);
});

ipcMain.handle('udpStopServer', (_, { port }) => {
  udpStopServer(port);
});

ipcMain.handle('nodeServerStart', async (_, { nodeId, html }) => {
  return await nodeServerStart(nodeId, html, sendIpcMessage);
});

ipcMain.handle('nodeServerStop', (_, { nodeId }) => {
  nodeServerStop(nodeId);
});

ipcMain.handle('nodeServerSend', (_, { nodeId, data }) => {
  nodeServerSend(nodeId, data);
});

// Register a system-wide shortcut. Returns true if successful.
ipcMain.handle('registerGlobalShortcut', async (_, { id, accel }) => {
  // Ensure the accelerator is not already registered by another Figment shortcut.
  if (globalShortcut.isRegistered(accel)) {
    globalShortcut.unregister(accel);
  }

  const ok = globalShortcut.register(accel, () => {
    // Relay the event to the renderer so nodes can react.
    sendIpcMessage('shortcut', { id, accel });
  });

  return ok;
});

// Unregister a previously registered shortcut.
ipcMain.handle('unregisterGlobalShortcut', async (_, { accel }) => {
  if (globalShortcut.isRegistered(accel)) {
    globalShortcut.unregister(accel);
  }
});

ipcMain.handle('setRepresentedFilename', (_, filePath) => {
  // Guard against destroyed window
  if (!gMainWindow || gMainWindow.isDestroyed()) {
    return;
  }

  setProjectFilePath(filePath);
  gMainWindow.setTitle(filePath ? path.basename(filePath) : 'Figment');
});

ipcMain.handle('setDocumentEdited', (_, edited) => {
  gDocumentEdited = edited;

  // Guard against destroyed window
  if (!gMainWindow || gMainWindow.isDestroyed()) {
    return;
  }

  try {
    gMainWindow.setDocumentEdited(edited);
  } catch (e) {
    console.error(`Error while calling setDocumentEdited: ${e}`);
  }

  // If we were waiting for save to complete before closing, close now
  if (gPendingClose && !edited) {
    gPendingClose = false;
    gMainWindow.destroy();
  }
});

async function startDevServer() {
  if (process.env.NODE_ENV !== 'development') return;
  const { createServer, createLogger, build } = await import('vite');
  debugger;

  const viteServer = await createServer({
    logLevel: 'info',
    server: {
      port: 3000,
      strictPort: true,
    },
  });
  await viteServer.listen();
  return viteServer;
}

// The renderer page, from the Vite dev server or the packaged build directory.
function appPageUrl(params) {
  const query = querystring.stringify({ appPath: app.getAppPath(), ...params });
  if (process.env.NODE_ENV === 'development') {
    return `http://localhost:3000/?${query}`;
  }
  const uiDir = path.join(__dirname, '../../build');
  return `file:///${uiDir}/index.html?${query}`;
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
      backgroundThrottling: false,
    },
  });

  gMainWindow.loadURL(appPageUrl({ filePath: filePath || '' }));
  if (process.env.NODE_ENV === 'development') {
    // Defer DevTools until after page load to avoid freezing the renderer's
    // event loop during WebGPU initialization (Chromium 140+ regression).
    gMainWindow.webContents.once('did-finish-load', () => {
      gMainWindow.webContents.openDevTools();
    });
  }

  // Handle window close with unsaved changes
  gMainWindow.on('close', (event) => {
    if (gDocumentEdited && !gPendingClose) {
      event.preventDefault();
      const choice = dialog.showMessageBoxSync(gMainWindow, {
        type: 'warning',
        buttons: ['Cancel', "Don't Save", 'Save'],
        defaultId: 2,
        cancelId: 0,
        title: 'Unsaved Changes',
        message: 'Do you want to save the changes you made to this document?',
        detail: "Your changes will be lost if you don't save them.",
      });

      if (choice === 1) {
        // Don't Save - close without saving
        gDocumentEdited = false;
        gMainWindow.destroy();
      } else if (choice === 2) {
        // Save - trigger save, then close when save completes
        gPendingClose = true;
        gMainWindow.webContents.send('menu', 'save');
        // Reset flag after 10 seconds in case save was cancelled or failed
        // This is a safety fallback - normal flow clears the flag in setDocumentEdited
        setTimeout(() => {
          if (gPendingClose) {
            console.warn('Save-before-close timeout expired, resetting pending close flag');
            gPendingClose = false;
          }
        }, 10000);
      }
      // choice === 0 (Cancel) - do nothing, window stays open
    }
  });

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
      { type: 'separator' },
      { label: 'Optimize ONNX Model…', click: emit('optimize-model-dialog') },
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
      { label: 'Toggle Performance Overlay', accelerator: 'CmdOrCtrl+Shift+P', click: emit('toggle-performance-overlay') },
      { type: 'separator' },
      { role: 'reload' },
      { role: 'forcereload' },
      { role: 'toggledevtools' },
      { type: 'separator' },
    ],
  };

  const editMenu = {
    label: 'Edit',
    submenu: [
      { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: emit('undo') },
      { label: 'Redo', accelerator: 'CmdOrCtrl+Shift+Z', click: emit('redo') },
      { label: 'Redo', accelerator: 'CmdOrCtrl+Y', click: emit('redo'), visible: false },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' },
    ],
  };

  const template = [...(isMac ? [macAppMenu] : []), fileMenu, editMenu, viewMenu, { role: 'windowMenu' }];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// In a packaged app the executable is argv[0]; under `electron .` the script path is argv[1].
const cliArgs = app.isPackaged ? process.argv.slice(1) : process.argv.slice(2);
let gRenderJob = null;
if (cliArgs.includes('--help')) {
  process.stdout.write(USAGE);
  app.exit(0);
}
try {
  gRenderJob = parseRenderArgs(cliArgs, process.cwd());
} catch (err) {
  if (!(err instanceof RenderCliError)) throw err;
  process.stderr.write(`${err.message}\n`);
  app.exit(2);
}

// Headless render: a hidden window runs the export loop and reports back over IPC.
// Progress goes to stdout, renderer errors to stderr, and the exit code says whether it worked.
async function startRender(job) {
  try {
    await fs.access(job.project);
  } catch (err) {
    process.stderr.write(`Project file not found: ${job.project}\n`);
    app.exit(2);
    return;
  }
  if (isMac) app.dock?.hide();

  gMainWindow = new BrowserWindow({
    width: 1200,
    height: 1000,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      webSecurity: false,
      nodeIntegration: true,
      // Keeps the hidden page "visible" so WebGPU hands out an adapter and timers run at full speed.
      backgroundThrottling: false,
    },
  });
  gMainWindow.webContents.on('console-message', (event) => {
    if (event.level === 'error') process.stderr.write(`${event.message}\n`);
  });
  gMainWindow.webContents.on('render-process-gone', (event, details) => {
    process.stderr.write(`Render process exited unexpectedly (${details.reason}).\n`);
    app.exit(1);
  });
  gMainWindow.loadURL(appPageUrl({ render: JSON.stringify(job) }));
}

ipcMain.on('render-started', (_, { frames, fps }) => {
  process.stdout.write(`Rendering ${frames} frame${frames === 1 ? '' : 's'} at ${fps} fps\n`);
});

ipcMain.on('render-progress', (_, frame, total) => {
  const line = `Frame ${frame}/${total}`;
  process.stdout.write(process.stdout.isTTY ? `\r${line}` : `${line}\n`);
});

ipcMain.handle('render-finished', (_, result) => {
  if (process.stdout.isTTY) process.stdout.write('\n');
  if (result.ok) {
    process.stdout.write(result.output ? `Wrote ${result.frames} frame${result.frames === 1 ? '' : 's'} to ${result.output}\n` : 'Done.\n');
  } else {
    process.stderr.write(`Render failed: ${result.message}\n`);
  }
  app.exit(result.ok ? 0 : 1);
});

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

// Enable WebGPU in Electron
app.commandLine.appendSwitch('enable-unsafe-webgpu');
app.commandLine.appendSwitch('enable-features', 'WebGPU,UseSkiaGraphite');

app.whenReady().then(async () => {
  await gSettings.load();
  gDevServer = await startDevServer();
  if (gRenderJob) {
    await startRender(gRenderJob);
    return;
  }
  // const status = systemPreferences.getMediaAccessStatus('camera');
  // if (status !== 'granted') {
  //   await systemPreferences.askForMediaAccess('camera');
  // }
  createApplicationMenu();

  // For macOS, use the filePathToOpen if it's been set by the 'open-file' event
  // For Windows/Linux, process command-line arguments to find a .fgmt file to open
  const fileArg = process.argv.find((arg) => arg.endsWith('.fgmt')) || filePathToOpen;
  createMainWindow(fileArg);

  // Initialize MIDI after window is created
  midiStartServer();
  midiEmitter.on('message', (channel, controller, value) => {
    sendIpcMessage('midi-update', { channel, controller, value });
  });
  midiEmitter.on('programChange', (channel, program) => {
    sendIpcMessage('midi-program-change', { channel, program });
  });
  midiEmitter.on('devices', (devices) => {
    sendIpcMessage('midi-devices', devices);
  });
});

app.on('will-quit', async (event) => {
  if (gDevServer) {
    event.preventDefault();
    await gDevServer.close();
    gDevServer = null;
    app.quit();
  }
  // Clean up MIDI
  midiStopServer();
  // Clean up node servers (drawing, etc.)
  nodeServerStopAll();
  // Clean up any global shortcuts we registered.
  globalShortcut.unregisterAll();
});
