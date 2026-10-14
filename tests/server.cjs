// Servidor local de pruebas: publica solo este checkout bajo la subruta de Pages.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json'
};

http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
  if (pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><title>Origen aislado de pruebas</title><link rel="icon" href="data:,">');
    return;
  }
  if (!pathname.startsWith('/App.N.O.A/')) {
    res.writeHead(404).end();
    return;
  }
  let file;
  try {
    const relative = decodeURIComponent(pathname.slice('/App.N.O.A/'.length)) || 'index.html';
    file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep)) throw new Error('Fuera del checkout');
  } catch {
    res.writeHead(400).end();
    return;
  }
  fs.readFile(file, (error, content) => {
    if (error) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, {
      'Content-Type': mime[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(req.method === 'HEAD' ? undefined : content);
  });
}).listen(8022, '127.0.0.1');
