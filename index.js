const { app, Menu, BrowserWindow, session, ipcMain, dialog, systemPreferences } = require('electron');
const path = require('path');

let gMainWindow;
function createMainWindow(file) {
  gMainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    show: false,
    icon: path.join(__dirname, 'assets/icons/app-icon-512.png'),
    webPreferences: {
      nodeIntegration: true,
      webSecurity: false
    }
  });

  // gMainWindow.loadURL(`file:///${__dirname}/build/index.html`);
  gMainWindow.loadURL(`file:///${__dirname}/src/index.html`);

  gMainWindow.once('ready-to-show', () => {
    gMainWindow.show();
    gMainWindow.maximize();
    if (file) emit('open', file)();
  });
}

app.on('ready', async () => {
  // await gSettings.load();
  // const status = systemPreferences.getMediaAccessStatus('camera');
  // if (status !== 'granted') {
  //   await systemPreferences.askForMediaAccess('camera');
  // }
  // createApplicationMenu();
  createMainWindow();
});
