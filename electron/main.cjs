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
  const appRoot = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked')
    : path.join(__dirname, '..');

  const logFile = require('fs').createWriteStream(path.join(appRoot, 'app.log'), { flags: 'a' });
  logFile.write(`[${new Date().toISOString()}] appRoot: ${appRoot}\n`);

  serverProcess = spawn('node', ['server-dist/index.js'], {
    cwd: appRoot,
    env: { ...process.env, NODE_ENV: 'production' },
    stdio: ['ignore', logFile, logFile],
  });

  serverProcess.on('error', (err) => {
    logFile.write(`[${new Date().toISOString()}] Server error: ${err.message}\n`);
  });

  serverProcess.on('exit', (code) => {
    logFile.write(`[${new Date().toISOString()}] Server exited with code: ${code}\n`);
  });

  waitForServer(3001, createWindow);
});

function waitForServer(port, callback, retries = 20) {
  const net = require('net');
  const client = new net.Socket();
  client.connect(port, '127.0.0.1', () => {
    client.destroy();
    callback();
  });
  client.on('error', () => {
    client.destroy();
    if (retries > 0) setTimeout(() => waitForServer(port, callback, retries - 1), 500);
  });
}

app.on('window-all-closed', () => {
  if (serverProcess) serverProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});
