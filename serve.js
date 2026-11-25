import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {extname, normalize, join, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

// Servidor local: entrega qualquer arquivo público da pasta do app (CSS, SVG, fotos, ícones).
const root = fileURLToPath(new URL('.', import.meta.url));
const types = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json'
};
const blocked = /^(\.git|\.agents|\.openai|\.npm-cache|node_modules|supabase|handoff)(\/|$)/;

http.createServer(async (req, res) => {
  let path;
  try { path = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
  if (path === '/') path = '/index.html';
  const rel = normalize(path).replace(/^[\\/]+/, '').split(sep).join('/');
  const type = types[extname(rel).toLowerCase()];
  if (!type || rel.startsWith('..') || blocked.test(rel)) { res.writeHead(404).end(); return; }
  try {
    const body = await readFile(join(root, rel));
    res.setHeader('Content-Type', type + (type.startsWith('text/') || type.endsWith('json') ? '; charset=utf-8' : ''));
    res.end(body);
  } catch { res.writeHead(404).end(); }
}).listen(4173, '127.0.0.1', () => console.log('http://127.0.0.1:4173'));
