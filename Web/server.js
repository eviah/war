const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = __dirname, PORT = 8753;
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css' };
http.createServer((req, res) => {
  let u = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const fp = path.join(ROOT, decodeURIComponent(u));
  fs.readFile(fp, (e, d) => {
    if (e) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(fp)] || 'application/octet-stream' });
    res.end(d);
  });
}).listen(PORT, () => console.log('Global Warfare server on http://localhost:' + PORT));
