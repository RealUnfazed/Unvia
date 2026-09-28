const { app, BrowserWindow, shell } = require('electron');

// Set your Vercel URL before running `npm run desktop:build`
const URL = process.env.APP_URL || (app.isPackaged ? 'https://YOUR-APP.vercel.app' : 'http://localhost:3000');

app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 1100, height: 800, backgroundColor: '#000000', autoHideMenuBar: true });
  win.loadURL(URL);
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
