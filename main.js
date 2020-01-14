const { app, Menu, BrowserWindow, session, ipcMain, dialog } = require('electron');
const path = require('path');
const isWindows = process.platform === 'win32';
const isMac = process.platform === 'darwin';

let gMainWindow;

function emit(name) {
  return () => {
    gMainWindow.webContents.send('menu-event', { name });
  };
}

function createMainWindow() {
  gMainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    show: false,
    icon: path.join(__dirname, 'assets/icons/app-icon-512.png'),
    webPreferences: {
      nodeIntegration: true
    }
  });

  // Load the index.html of the app.
  if (process.env.NODE_ENV === 'development') {
    const Bundler = require('parcel-bundler');
    const entryFiles = path.join(__dirname, 'src/ui/index.html');
    const options = {
      outDir: path.join(__dirname, 'build'),
      target: 'electron'
    };
    const bundler = new Bundler(entryFiles, options);
    bundler.serve().then(x => {
      gMainWindow.loadURL('http://localhost:1234/');
      gMainWindow.webContents.openDevTools();
    });
  } else {
    gMainWindow.loadURL(`file:///${__dirname}/build/index.html`);
  }

  // Open the window
  gMainWindow.once('ready-to-show', () => {
    gMainWindow.show();
    gMainWindow.maximize();
  });
}

function createApplicationMenu() {
  const macAppMenu = {
    label: app.name,
    submenu: [
      {
        label: `Quit ${app.name}`,
        accelerator: 'CmdOrCtrl+Q',
        click: emit('quit')
      }
    ]
  };
  const fileMenu = {
    role: 'fileMenu',
    label: 'File',
    submenu: [
      { label: 'Open', accelerator: 'CmdOrCtrl+O', click: emit('open') },
      { label: 'Save', accelerator: 'CmdOrCtrl+S', click: emit('save') },
      {
        label: 'Save As...',
        accelerator: 'CmdOrCtrl+Shift+S',
        click: emit('save-as')
      }
    ]
  };
  if (!isMac) {
    fileMenu.submenu.push({
      label: 'Quit',
      accelerator: isWindows ? 'Alt+F4' : 'CmdOrCtrl+Q',
      click: emit('quit')
    });
  }
  const template = [
    ...(isMac ? [macAppMenu] : []),
    fileMenu,
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' }
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.on('ready', () => {
  createApplicationMenu();
  createMainWindow();
});
