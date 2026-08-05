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
let restarting = false;

function restartApplication() {
  if (restarting) return;
  restarting = true;
  app.relaunch();
  app.exit();
}

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

// ─── Build helper (runs pnpm build before starting the server after an update) ─
function runBuild(cwd, logFile) {
  return new Promise((resolve, reject) => {
    logFile.write(`[${new Date().toISOString()}] Running pnpm build in ${cwd}\n`);
    const build = require('child_process').spawn(
      process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
      ['build'],
      {
        cwd,
        env: { ...process.env, CI: 'true' },
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
      }
    );

    build.stdout.on('data', (data) => logFile.write(`[BUILD] ${data}`));
    build.stderr.on('data', (data) => logFile.write(`[BUILD ERR] ${data}`));
    build.on('error', (err) => {
      logFile.write(`[${new Date().toISOString()}] Build spawn error: ${err.message}\n`);
      // Try npm as fallback
      const buildNpm = require('child_process').spawn(
        process.platform === 'win32' ? 'npm.cmd' : 'npm',
        ['run', 'build'],
        { cwd, env: { ...process.env, CI: 'true' }, stdio: ['ignore', 'pipe', 'pipe'], shell: true }
      );
      buildNpm.stdout.on('data', (d) => logFile.write(`[BUILD-NPM] ${d}`));
      buildNpm.stderr.on('data', (d) => logFile.write(`[BUILD-NPM ERR] ${d}`));
      buildNpm.on('close', (code) => code === 0 ? resolve() : reject(new Error(`npm build exited with code ${code}`)));
    });
    build.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`pnpm build exited with code ${code}`));
    });
  });
}

app.whenReady().then(async () => {
  const appRoot = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked')
    : path.join(__dirname, '..');

  const logPath = path.join(appRoot, 'app.log');
  const logFile = fs.createWriteStream(logPath, { flags: 'a' });

  logFile.write(`[${new Date().toISOString()}] appRoot: ${appRoot}\n`);
  logFile.write(`[${new Date().toISOString()}] __dirname: ${__dirname}\n`);

  // ─── Rebuild if an update was installed during the previous session ──────
  const rebuildFlagPath = path.join(appRoot, '.rebuild-needed');
  if (fs.existsSync(rebuildFlagPath)) {
    logFile.write(`[${new Date().toISOString()}] Rebuild flag detected — running pnpm build before starting server\n`);
    try {
      fs.unlinkSync(rebuildFlagPath);
      await runBuild(appRoot, logFile);
      logFile.write(`[${new Date().toISOString()}] Build completed successfully\n`);
    } catch (buildErr) {
      logFile.write(`[${new Date().toISOString()}] Build failed: ${buildErr.message}\n`);
      // Continue anyway — the previous build artifacts may still work
    }
  }

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

  // Wait for backend to be ready, then open window.
  // After a rebuild the server may take longer to start, so use a generous
  // retry count (120 × 1000ms = 2 minutes).
  waitForPort(3001, logPath, 120, 1000).then(() => {
    logFile.write(`[${new Date().toISOString()}] Server ready, creating window\n`);
    createWindow('http://localhost:3001');
  }).catch((err) => {
    logFile.write(`[${new Date().toISOString()}] Server not ready: ${err.message}\n`);
    createWindow('http://localhost:3001');
  });
});

function waitForPort(port, logPath, retries = 40, intervalMs = 500) {
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
          setTimeout(tryConnect, intervalMs);
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
  restartApplication();
});

// ─── Watch for restart flag file ─────────────────────────────────────────────────
const restartFlagPath = path.join(__dirname, '../.restart-flag');
if (fs.existsSync(restartFlagPath)) {
  fs.unlinkSync(restartFlagPath);
  restartApplication();
}

// The backend writes this flag after a successful update. Watching it makes
// the restart signal work immediately rather than only on a later launch.
fs.watchFile(restartFlagPath, { interval: 500 }, (current, previous) => {
  if (current.mtimeMs !== previous.mtimeMs && fs.existsSync(restartFlagPath)) {
    try { fs.unlinkSync(restartFlagPath); } catch (_) { /* restart still proceeds */ }
    restartApplication();
  }
});
