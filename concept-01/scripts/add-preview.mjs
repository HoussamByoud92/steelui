// Installs a low-res preview track (preview.bin + preview.json, built in the browser from the packed
// frames: every Nth frame, small WebP) next to a sequence and records it in meta.json.
// The player loads it first and shows it whenever the sharp frame has not arrived yet.
// Usage: node scripts/add-preview.mjs <variant> <dir-with-preview.bin-and-preview.json>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const [variant, src] = process.argv.slice(2);
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../assets/film', variant);
const bin = fs.readFileSync(path.join(src, 'preview.bin'));
const info = JSON.parse(fs.readFileSync(path.join(src, 'preview.json'), 'utf8'));
for (const f of fs.readdirSync(dir)) if (/^preview-.*\.bin$/.test(f)) fs.unlinkSync(path.join(dir, f));
const file = `preview-${crypto.createHash('sha1').update(bin).digest('hex').slice(0, 10)}.bin`;
fs.writeFileSync(path.join(dir, file), bin);
const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
meta.preview = { file, ...info };
fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta));
console.log(`${variant}: ${file}, ${info.ranges.length} preview frames, ${(bin.length / 1048576).toFixed(1)} MB`);
