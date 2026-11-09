// Renders the scroll film offline into WebP frame sequences + label tracks.
// Usage: serve the UISteel folder on :5173, then
//   node scripts/capture-film.mjs desktop|mobile [step] [from] [to]
// Needs puppeteer-core and Microsoft Edge (or set BROWSER=path to Chrome).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const variant = process.argv[2] || 'desktop';
const STEP = +(process.argv[3] || 0.02);
const FROM = +(process.argv[4] || 0), TO = +(process.argv[5] || 11);
const SIZE = variant === 'mobile' ? [720, 1440] : [1600, 900];
const outDir = process.env.OUT ? path.resolve(process.env.OUT, variant) : path.resolve(here, '../../assets/film', variant);
fs.mkdirSync(outDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: process.env.BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: false,
  args: ['--use-angle=d3d11', '--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--window-size=900,600'],
  protocolTimeout: 600000,
});
const page = await browser.newPage();
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text()); });
await page.goto(`http://localhost:5173/concept-01/index.html?capture=${variant}`, { waitUntil: 'networkidle0' });
await page.waitForFunction('window.__capture', { timeout: 60000 });
console.log('GPU:', await page.evaluate(() => { const g = document.createElement('canvas').getContext('webgl2'); const e = g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?'; }));

const n = Math.round((11 - 0) / STEP) + 1;
const metaPath = path.join(outDir, 'meta.json');
const meta = fs.existsSync(metaPath) && FROM > 0 ? JSON.parse(fs.readFileSync(metaPath, 'utf8'))
  : { step: STEP, count: n, width: SIZE[0], height: SIZE[1], labels: await page.evaluate(() => window.__captureLabels), tracks: [], dim: [] };
let bytes = 0; const t0 = Date.now();
for (let i = Math.round(FROM / STEP); i < n && i * STEP <= TO + 1e-6; i++) {
  const T = Math.min(11, +(i * STEP).toFixed(4));
  const r = await page.evaluate((T, w, h) => window.__capture(T, w, h, 1.5, 0.8), T, SIZE[0], SIZE[1]);
  const buf = Buffer.from(r.url.split(',')[1], 'base64'); bytes += buf.length;
  fs.writeFileSync(path.join(outDir, String(i).padStart(4, '0') + '.webp'), buf);
  meta.tracks[i] = r.labels; meta.dim[i] = r.dim;
  if (i % 25 === 0) console.log(`${variant} ${i}/${n - 1} T=${T} ${(buf.length / 1024).toFixed(0)}KB avg ${(bytes / 1024 / (i + 1 - Math.round(FROM / STEP))).toFixed(0)}KB ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
fs.writeFileSync(metaPath, JSON.stringify(meta));
console.log('done', variant, (bytes / 1048576).toFixed(1) + 'MB');
await browser.close();
