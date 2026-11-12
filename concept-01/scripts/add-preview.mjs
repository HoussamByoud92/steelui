// Installs a low-res preview track (preview.bin + preview.json, built in the browser from the packed
// frames: every Nth frame, small WebP) next to a sequence, split into small content-hashed parts so the
// part under the playhead arrives first even on slow connections. Recorded in meta.json as meta.preview.
// The player shows preview frames whenever the sharp frame has not arrived yet.
// Usage: node scripts/add-preview.mjs <variant> <dir-with-preview.bin-and-preview.json> [framesPerPart]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const [variant, src, perArg] = process.argv.slice(2);
const PER = +(perArg || 90);
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../assets/film', variant);
const bin = fs.readFileSync(path.join(src, 'preview.bin'));
const info = JSON.parse(fs.readFileSync(path.join(src, 'preview.json'), 'utf8'));
for (const f of fs.readdirSync(dir)) if (/^preview-.*\.bin$/.test(f)) fs.unlinkSync(path.join(dir, f));
const parts = [];
for (let first = 0; first < info.ranges.length; first += PER) {
  const rs = info.ranges.slice(first, first + PER), start = rs[0][0], end = rs[rs.length - 1][0] + rs[rs.length - 1][1];
  const data = bin.subarray(start, end);
  const file = `preview-${String(parts.length).padStart(2, '0')}-${crypto.createHash('sha1').update(data).digest('hex').slice(0, 10)}.bin`;
  fs.writeFileSync(path.join(dir, file), data);
  parts.push({ file, first, ranges: rs.map(([o, l]) => [o - start, l]) });
}
const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
meta.preview = { every: info.every, width: info.width, height: info.height, count: info.ranges.length, per: PER, parts };
fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta));
console.log(`${variant}: ${info.ranges.length} preview frames in ${parts.length} parts, ${(bin.length / 1048576).toFixed(1)} MB`);
