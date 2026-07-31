const Module = require('module');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function(request, ...args) {
  if (request === 'electron') return request;
  return originalResolve.call(this, request, ...args);
};

const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

let serverProcess;
let windowCreated = false;

function createWindow(url) {
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

  win.loadURL(url);
  win.setMenuBarVisibility(false);
}

app.whenReady().then(() => {
  const appRoot = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked')
    : path.join(__dirname, '..');

  const logPath = path.join(appRoot, 'app.log');
  const logFile = fs.createWriteStream(logPath, { flags: 'a' });

  logFile.write(`[${new Date().toISOString()}] appRoot: ${appRoot}\n`);
  logFile.write(`[${new Date().toISOString()}] __dirname: ${__dirname}\n`);

  const serverDistPath = path.join(appRoot, 'server-dist', 'index.js');
  logFile.write(`[${new Date().toISOString()}] server-dist/index.js exists: ${fs.existsSync(serverDistPath)}\n`);

  // Start the backend server using system Node.js
  try {
    serverProcess = spawn('node', ['server-dist/index.js'], {
      cwd: appRoot,
      env: { ...process.env, NODE_ENV: 'production' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    serverProcess.stdout.on('data', (data) => {
      logFile.write(`[${new Date().toISOString()}] Server stdout: ${data}\n`);
    });

    serverProcess.stderr.on('data', (data) => {
      logFile.write(`[${new Date().toISOString()}] Server stderr: ${data}\n`);
    });

    serverProcess.on('error', (err) => {
      logFile.write(`[${new Date().toISOString()}] Server error: ${err.message}\n`);
    });

    serverProcess.on('exit', (code, signal) => {
      logFile.write(`[${new Date().toISOString()}] Server exited code=${code} signal=${signal}\n`);
    });

    logFile.write(`[${new Date().toISOString()}] Backend server spawned, waiting for port 3001...\n`);
  } catch (spawnError) {
    logFile.write(`[${new Date().toISOString()}] spawn() error: ${spawnError.message}\n`);
  }

  // Wait for backend to be ready, then open window
  waitForPort(3001, logPath).then(() => {
    logFile.write(`[${new Date().toISOString()}] Server ready, creating window\n`);
    createWindow('http://localhost:3001');
  }).catch((err) => {
    logFile.write(`[${new Date().toISOString()}] Server not ready: ${err.message}\n`);
    createWindow('http://localhost:3001');
  });
});

function waitForPort(port, logPath, retries = 40) {
  const net = require('net');
  return new Promise((resolve, reject) => {
    let attempts = 0;
    function tryConnect() {
      attempts++;
      const client = new net.Socket();
      client.connect(port, '127.0.0.1', () => {
        fs.appendFileSync(logPath, `[${new Date().toISOString()}] Port ${port} ready after ${attempts} attempts\n`);
        client.destroy();
        resolve();
      });
      client.on('error', () => {
        client.destroy();
        if (attempts < retries) {
          setTimeout(tryConnect, 500);
        } else {
          reject(new Error(`Port ${port} not ready after ${retries} attempts`));
        }
      });
    }
    tryConnect();
  });
}

app.on('window-all-closed', () => {
  if (serverProcess) serverProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});

// ─── IPC Handler for Restart ─────────────────────────────────────────────────────
ipcMain.handle('restart-app', () => {
  app.relaunch();
  app.exit();
});

// ─── Watch for restart flag file ─────────────────────────────────────────────────
const restartFlagPath = path.join(__dirname, '../.restart-flag');
if (fs.existsSync(restartFlagPath)) {
  fs.unlinkSync(restartFlagPath);
  app.relaunch();
  app.exit();
}
