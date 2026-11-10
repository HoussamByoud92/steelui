// Packs a rendered frame sequence (assets/film/<variant>/0000.webp …) into a few large chunk files,
// so the browser downloads ~40 files instead of ~1600 small ones. Chunk names carry a content hash
// and can be cached forever; meta.json (no hash) lists them with each frame's byte range.
// Usage: node scripts/pack-film.mjs desktop|mobile [framesPerChunk]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const variant = process.argv[2] || 'desktop';
const PER = +(process.argv[3] || 40);
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../assets/film', variant);
const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
const frames = fs.readdirSync(dir).filter(f => /^\d{4}\.webp$/.test(f)).sort();
if (frames.length !== meta.count) throw new Error(`expected ${meta.count} frames, found ${frames.length}`);

for (const f of fs.readdirSync(dir)) if (/^chunk-.*\.bin$/.test(f)) fs.unlinkSync(path.join(dir, f));
meta.chunks = [];
let total = 0;
for (let c = 0; c * PER < frames.length; c++) {
  const bufs = [], ranges = [];
  let off = 0;
  for (let i = c * PER; i < Math.min(frames.length, (c + 1) * PER); i++) {
    const b = fs.readFileSync(path.join(dir, frames[i]));
    ranges.push([off, b.length]); bufs.push(b); off += b.length;
  }
  const data = Buffer.concat(bufs);
  const hash = crypto.createHash('sha1').update(data).digest('hex').slice(0, 10);
  const file = `chunk-${String(c).padStart(2, '0')}-${hash}.bin`;
  fs.writeFileSync(path.join(dir, file), data);
  meta.chunks.push({ file, first: c * PER, ranges });
  total += data.length;
}
fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta));
for (const f of frames) fs.unlinkSync(path.join(dir, f));
console.log(`${variant}: ${frames.length} frames -> ${meta.chunks.length} chunks, ${(total / 1048576).toFixed(1)} MB`);
