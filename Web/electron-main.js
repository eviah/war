// Desktop launcher for Global Warfare (Electron).
// Serves the game over a local http server (so ES modules load) and shows it
// in a native window — no browser needed.
const { app, BrowserWindow } = require('electron');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = __dirname, PORT = 8754;
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css' };

const server = http.createServer((req, res) => {
  let u = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const fp = path.join(ROOT, decodeURIComponent(u));
  fs.readFile(fp, (e, d) => {
    if (e) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(fp)] || 'application/octet-stream' });
    res.end(d);
  });
});
// if the port is busy (a previous instance is still serving), just reuse it instead of crashing
server.on('error', (e) => { console.log('[server] ' + e.code + ' on ' + PORT + ' — reusing existing server'); });
server.listen(PORT, '127.0.0.1');

function createWindow() {
  const win = new BrowserWindow({
    width: 1366, height: 820, title: 'Global Warfare',
    backgroundColor: '#05070a', autoHideMenuBar: true,
    webPreferences: { backgroundThrottling: false }
  });
  win.setMenuBarVisibility(false);
  // forward renderer console + errors to stdout for diagnostics
  const LV = ['log','warn','error','info'];
  win.webContents.on('console-message', (e, level, message, line, src) => {
    console.log(`[renderer:${LV[level]||level}] ${message}  (${(src||'').split('/').pop()}:${line})`);
  });
  win.webContents.on('render-process-gone', (e, d) => console.log('[render-gone] ' + JSON.stringify(d)));
  win.webContents.on('did-fail-load', (e, code, desc, url) => console.log('[fail-load] ' + code + ' ' + desc + ' ' + url));
  win.loadURL('http://127.0.0.1:' + PORT + '/');
}

app.whenReady().then(createWindow);
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on('window-all-closed', () => app.quit());
