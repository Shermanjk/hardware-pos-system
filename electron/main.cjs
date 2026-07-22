const Module = require('module');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function(request, ...args) {
  if (request === 'electron') return request;
  return originalResolve.call(this, request, ...args);
};

const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const path = require('path');

let serverProcess;
let windowCreated = false;

function createWindow() {
  if (windowCreated) return;
  windowCreated = true;

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    fullscreen: true,
    icon: path.join(__dirname, '../client/public/Desktop Icon.ico'),
    webPreferences: { nodeIntegration: false, contextIsolation: true },
    title: 'Isra Hardware POS',
  });

  win.loadURL('http://localhost:3001');
  win.setMenuBarVisibility(false);
}

app.whenReady().then(() => {
  serverProcess = spawn('node', ['dist/index.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, NODE_ENV: 'production' },
    stdio: 'ignore',
  });

  serverProcess.on('error', () => {});

  serverProcess.on('exit', (code) => {
    if (code !== 0) createWindow();
  });

  setTimeout(createWindow, 2000);
});

app.on('window-all-closed', () => {
  if (serverProcess) serverProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});
