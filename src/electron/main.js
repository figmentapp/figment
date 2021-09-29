const { app, Menu, BrowserWindow, session, ipcMain, dialog, systemPreferences } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const isWindows = process.platform === 'win32';
const isMac = process.platform === 'darwin';

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

function emit(name, filePath) {
  return () => {
    gMainWindow.webContents.send('menu', { name, filePath });
  };
}

async function showOpenProjectDialog() {
  const { filePaths } = await dialog.showOpenDialog({
    title: 'Open Project',
    properties: ['openFile'],
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

async function showSaveProjectDialog() {
  const result = await dialog.showSaveDialog({
    title: 'Save Project',
  });
  // console.log('save', filePath);
  if (result.canceled) return null;
  gSettings.addRecentProject(result.filePath);
  gMainWindow.setRepresentedFilename(result.filePath);
  return result.filePath;
}
ipcMain.handle('showSaveProjectDialog', showSaveProjectDialog);

function onTouchProject(filePath) {
  gSettings.addRecentProject(filePath);
  createApplicationMenu();
}

async function onClearRecentProjects() {
  await gSettings.clearRecentProjects();
  createApplicationMenu();
}

ipcMain.on('open-project', (e, filePath) => onTouchProject(filePath));
ipcMain.on('save-project', (e, filePath) => onTouchProject(filePath));
ipcMain.on('window-created', () => {
  if (argv.file) {
    emit('open', argv.file)();
  }
});

async function startDevServer() {
  if (process.env.NODE_ENV !== 'development') return;
  const { createServer, createLogger, build } = require('vite');

  const viteServer = await createServer({
    port: 3000,
    root: path.resolve(__dirname, '../ui'),
    logLevel: 'info',
  });
  await viteServer.listen();
  return viteServer;
}

function createMainWindow(file) {
  gMainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    show: false,
    icon: path.join(__dirname, 'assets/icons/app-icon-512.png'),
    webPreferences: {
      nativeWindowOpen: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false,
    },
  });

  // Load the index.html of the app.
  if (process.env.NODE_ENV === 'development') {
    gMainWindow.loadURL('http://localhost:3000/');
    gMainWindow.webContents.openDevTools();
  } else {
    gMainWindow.loadURL(`file:///${__dirname}/build/index.html`);
  }

  // Open the window
  gMainWindow.once('ready-to-show', () => {
    gMainWindow.show();
    gMainWindow.maximize();
    if (file) emit('open', file)();
  });
}

function createApplicationMenu() {
  const macAppMenu = {
    label: app.name,
    submenu: [
      {
        role: 'quit',
      },
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
      click: emit('open', filePath),
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
        label: 'Save As...',
        accelerator: 'CmdOrCtrl+Shift+S',
        click: emit('save-as'),
      },
    ],
  };
  if (!isMac) {
    fileMenu.submenu.push({ type: 'separator' });
    fileMenu.submenu.push({
      role: 'quit',
    });
  }
  const template = [
    ...(isMac ? [macAppMenu] : []),
    fileMenu,
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

const argv = require('minimist')(process.argv.slice(2));

let gDevServer;
app.whenReady().then(async () => {
  await gSettings.load();
  gDevServer = await startDevServer();
  // const status = systemPreferences.getMediaAccessStatus('camera');
  // if (status !== 'granted') {
  //   await systemPreferences.askForMediaAccess('camera');
  // }
  createApplicationMenu();
  createMainWindow(argv.file);
});
