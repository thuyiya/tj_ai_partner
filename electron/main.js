import { app, BrowserWindow, Menu, dialog, ipcMain } from 'electron';
import { spawn, execFile } from 'node:child_process';
import { existsSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const PORT = 4141;
const APP_NAME = 'TJ AI Partner';

// Must run before whenReady() to have any effect on the dock/menu name.
// Note: in dev mode (`npm run electron`), the bold macOS menu-bar title is
// still baked into Electron's own unpackaged Info.plist as "Electron" — this
// only fully resolves in the packaged build, where electron-builder gives
// the app its own bundle identity from `productName`.
app.setName(APP_NAME);

// Diagnostic trail for exactly this class of bug — a packaged, LaunchServices
// (Finder/`open`)-launched .app runs under a very different, minimal
// environment than a Terminal-launched one, and console.log has nowhere
// reliable to go in that context. Written unconditionally (not just on
// error) so a launch that silently fails still leaves a trail.
const startupLogPath = path.join(app.getPath('userData'), 'startup.log');
function logStartup(line) {
  try {
    appendFileSync(startupLogPath, `[${new Date().toISOString()}] ${line}\n`);
  } catch {
    // The log itself is best-effort — never let logging break startup.
  }
  console.log(line);
}

let mainWindow;
let serverProcess;

// A packaged, Finder-launched .app does NOT inherit a Terminal's PATH, so a
// bare `spawn('node', ...)` (which works fine under `npm run electron`) fails
// silently here — confirmed by shipping a first DMG build where the app
// launched but no server child process ever appeared. Check common install
// locations first (fast, no shell spawn); fall back to asking the user's own
// login shell, which sources .zshrc/.zprofile and finds version managers
// (mise, nvm, etc.) the same way a real Terminal would.
async function resolveNodeBinary() {
  const candidates = [
    path.join(os.homedir(), '.local', 'bin', 'node'),
    '/opt/homebrew/bin/node',
    '/usr/local/bin/node',
    '/usr/bin/node'
  ];
  for (const candidate of candidates) {
    const found = existsSync(candidate);
    logStartup(`Checking node candidate ${candidate}: ${found ? 'found' : 'not found'}`);
    if (found) return candidate;
  }

  const shell = process.env.SHELL || '/bin/zsh';
  logStartup(`No direct candidate found, falling back to login shell: ${shell} -lic 'command -v node'`);
  return new Promise((resolve, reject) => {
    execFile(shell, ['-lic', 'command -v node'], (error, stdout, stderr) => {
      logStartup(`Login shell result: error=${error?.message} stdout=${stdout?.trim()} stderr=${stderr?.trim()}`);
      if (error || !stdout.trim()) {
        reject(new Error('Could not locate a Node.js binary. Install Node.js (e.g. via mise, nvm, or nodejs.org) and make sure `node` works in a terminal.'));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

// Electron bundles its own Node.js build, which doesn't yet support the
// built-in `node:sqlite` module this app's database uses (confirmed by
// hitting ERR_UNKNOWN_BUILTIN_MODULE running it in-process). Rather than
// swapping in a native SQLite binding — which would need rebuilding for
// Electron's ABI, and again for plain `npm start`/`npm run cli` under system
// Node — the server runs as a child process under the resolved system
// `node`. Electron's main process just manages the window and this child's
// lifecycle.
function startServerProcess(nodeBin) {
  return new Promise((resolve, reject) => {
    logStartup(`Spawning server: ${nodeBin} --no-warnings ${path.join(rootDir, 'src', 'server.js')} (cwd=${rootDir}, PATH=${process.env.PATH})`);

    serverProcess = spawn(nodeBin, ['--no-warnings', path.join(rootDir, 'src', 'server.js')], {
      cwd: rootDir,
      env: { ...process.env, PORT: String(PORT) }
    });

    const timeout = setTimeout(() => {
      reject(new Error('Server did not start within 15 seconds.'));
    }, 15_000);

    const onData = (data) => {
      logStartup(`[server stdout] ${data}`.trimEnd());
      if (data.toString().includes('listening')) {
        clearTimeout(timeout);
        serverProcess.stdout.off('data', onData);
        resolve();
      }
    };
    serverProcess.stdout.on('data', onData);
    serverProcess.stderr.on('data', (data) => logStartup(`[server stderr] ${data}`.trimEnd()));
    serverProcess.on('error', (error) => {
      logStartup(`Server process error: ${error.stack || error.message}`);
      clearTimeout(timeout);
      reject(error);
    });
    serverProcess.on('exit', (code, signal) => {
      logStartup(`Server process exited: code=${code} signal=${signal}`);
    });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 760,
    minHeight: 560,
    title: APP_NAME,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#0b0b0c',
    icon: path.join(rootDir, 'build', 'icon-1024.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.webContents.session.clearCache().finally(() => {
    mainWindow.loadURL(`http://localhost:${PORT}`);
  });
}

function buildMenu() {
  const template = [
    {
      label: APP_NAME,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'New Chat',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow?.webContents.send('menu:new-chat')
        },
        {
          label: 'Open Project…',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
            if (!result.canceled) mainWindow?.webContents.send('menu:open-project', result.filePaths[0]);
          }
        }
      ]
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

ipcMain.handle('dialog:pick-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  return result.canceled ? null : result.filePaths[0];
});

app.whenReady().then(async () => {
  logStartup(`App ready. platform=${process.platform} execPath=${process.execPath}`);

  try {
    // Packaged builds pick up build/icon.icns automatically; in dev
    // (`npm run electron`) the dock icon defaults to Electron's own, so set
    // it explicitly from the same source PNG. Guarded on its own — an icon
    // problem must never be able to block the app from starting (it did
    // exactly that once: an unhandled rejection here silently prevented
    // the server from ever launching, with no window and no error shown).
    if (process.platform === 'darwin') {
      try {
        app.dock.setIcon(path.join(rootDir, 'build', 'icon-1024.png'));
      } catch (error) {
        logStartup(`Failed to set dock icon: ${error.message}`);
      }
    }

    const nodeBin = await resolveNodeBinary();
    logStartup(`Resolved node: ${nodeBin}`);
    await startServerProcess(nodeBin);
    logStartup('Server confirmed listening.');
  } catch (error) {
    logStartup(`STARTUP FAILED: ${error.stack || error.message}`);
    dialog.showErrorBox(`${APP_NAME} failed to start`, `${error.message}\n\nLog: ${startupLogPath}`);
    app.quit();
    return;
  }

  buildMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  serverProcess?.kill();
});
