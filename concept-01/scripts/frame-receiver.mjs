// Tiny local receiver for in-browser film capture: the capture page POSTs frames here.
// Usage: node scripts/frame-receiver.mjs  (listens on :5174, writes ../assets/film/<variant>/)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.env.OUT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../assets/film');
http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.end();
  const u = new URL(req.url, 'http://x');
  const variant = (u.searchParams.get('v') || 'desktop').replace(/[^a-z]/g, '');
  const name = (u.searchParams.get('f') || '').replace(/[^a-z0-9.]/gi, '');
  if (req.method !== 'POST' || !name) { res.statusCode = 400; return res.end(); }
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => {
    const dir = path.join(root, variant); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name), Buffer.concat(chunks));
    res.end('ok');
  });
}).listen(5174, () => console.log('receiver on :5174 ->', root));
