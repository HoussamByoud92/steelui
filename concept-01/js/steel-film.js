// UISTEEL — scroll film player.
// The film is rendered offline at high quality (js/steel-journey.js ?capture=…, scripts/frame-receiver.mjs)
// into WebP frame sequences. Here, scroll only picks a frame and draws one image on a 2D canvas, so the
// cost per frame is tiny and constant on every device: no 3D work while the user scrolls.
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger.js';

gsap.registerPlugin(ScrollTrigger);

const root = document.documentElement;
const journey = document.querySelector('.journey');
const stageEl = document.querySelector('.journey-stage');
const canvas = stageEl?.querySelector('canvas');

function disable(reason) {
  console.warn('[UISTEEL film] fallback:', reason);
  root.classList.remove('journey-on');
  root.classList.add('journey-off');
  stageEl?.remove();
  ScrollTrigger.getAll().forEach(t => t.kill());
  window.__journeyReady = true;
}

const clamp01 = x => Math.min(1, Math.max(0, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const fade = (T, a, b, f) => Math.min(smooth(a, a + f, T), 1 - smooth(b - f, b, T));
const isMobile = () => window.matchMedia('(max-width: 760px)').matches;
// frame index for film time T: the product chapter is rendered denser than the rest (meta.segs)
// film time of frame i (inverse of frameAt)
const timeAt = (m, i) => { const segs = m.segs || [[0, m.step, 0]]; let k = segs.length - 1; while (k > 0 && i < segs[k][2]) k--; return segs[k][0] + (i - segs[k][2]) * segs[k][1]; };
const frameAt = (m, T) => { const segs = m.segs || [[0, m.step, 0]]; let k = segs.length - 1; while (k > 0 && T < segs[k][0]) k--; return Math.min(m.count - 1, Math.max(0, segs[k][2] + (T - segs[k][0]) / segs[k][1])); };

if (root.classList.contains('journey-on') && journey && canvas) init().catch(disable);
else disable('not enabled');

async function init() {
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('no 2d canvas');
  const BASE = new URL('../../assets/film/', import.meta.url);

  // ------------------------------------------------------------------ sequence (desktop / mobile)
  let seq = null, variant = '';
  async function loadVariant(v) {
    if (variant === v) return;
    variant = v;
    const meta = await (await fetch(new URL(v + '/meta.json', BASE))).json();
    if (variant !== v) return;
    if (seq) seq.dispose();
    seq = makeSequence(v, meta);
    buildLabels(meta.labels);
    Tdrawn = NaN;
  }

  function makeSequence(v, meta) {
    const n = meta.count, chunks = meta.chunks;
    const CH = chunks[0].ranges.length;
    const chunkData = new Array(chunks.length).fill(null), chunkLoading = new Set();
    const bitmaps = new Map(), decoding = new Set();
    let disposed = false, decodes = 0;
    const MAX_CHUNKS = 6, MAX_DECODE = 4, MAX_BITMAPS = 44, SPAN_SAMPLES = 24, AHEAD = 18;

    // ---- low-res preview track in small parts: the part under the playhead / scroll target loads first,
    //      and preview frames are shown whenever the sharp frame is not ready
    const pv = meta.preview, pvBitmaps = new Map(), pvDecoding = new Set();
    const pvParts = pv ? new Array(pv.parts.length).fill(null) : [], pvLoading = new Set();
    let pvDecodes = 0;
    const partOf = p => Math.min(pvParts.length - 1, Math.floor(p / pv.per));
    function loadPart(k) {
      pvLoading.add(k);
      fetch(new URL(`${v}/${pv.parts[k].file}`, BASE)).then(r => r.ok ? r.arrayBuffer() : null)
        .then(buf => { if (!disposed && buf) pvParts[k] = buf; }).catch(() => {}).finally(() => { pvLoading.delete(k); Tdrawn = NaN; });
    }
    // the parts that matter right now: under the playhead and under the scroll target
    const pvNeeded = (c, t) => pv ? [partOf(Math.round(c / pv.every)), partOf(Math.round(t / pv.every))] : [];
    const pvReadyFor = (c, t) => pvNeeded(c, t).every(k => pvParts[k]);
    function pumpPreview(c, t) {
      if (!pv) return;
      const pc = Math.round(c / pv.every), pt = Math.round(t / pv.every), dir = pt >= pc ? 1 : -1, last = pv.count - 1;
      if (pvLoading.size < 2) {
        const want = [partOf(pc), partOf(pt), partOf(Math.min(last, Math.max(0, pt + dir * pv.per)))];
        for (let d = 1; d < pvParts.length; d++) want.push(partOf(pc) + d * dir, partOf(pc) - d * dir);
        for (const k of want) { if (pvLoading.size >= 2) break; if (k >= 0 && k < pvParts.length && !pvParts[k] && !pvLoading.has(k)) loadPart(k); }
      }
      // where the scroll is heading first, then around the playhead, then samples in between
      const order = [], span = Math.abs(pt - pc), stride = Math.max(1, Math.ceil(span / 16));
      for (let k = -2; k <= 8; k++) order.push(pt + k * dir);
      for (let k = -3; k <= 4; k++) order.push(pc + k * dir);
      for (let k = stride; k < span; k += stride) order.push(pc + k * dir);
      for (let k = 1; k < span; k++) order.push(pt - k * dir);
      for (const p of order) {
        if (pvDecodes >= 3) break;
        if (p < 0 || p > last || pvBitmaps.has(p) || pvDecoding.has(p)) continue;
        const k = partOf(p); if (!pvParts[k]) continue;
        const [off, len] = pv.parts[k].ranges[p - pv.parts[k].first];
        pvDecoding.add(p); pvDecodes++;
        createImageBitmap(new Blob([new Uint8Array(pvParts[k], off, len)], { type: 'image/webp' }))
          .then(bm => { if (disposed) bm.close(); else pvBitmaps.set(p, bm); })
          .catch(() => {}).finally(() => { pvDecoding.delete(p); pvDecodes--; Tdrawn = NaN; });
      }
      if (pvBitmaps.size > 90) {
        const lo = Math.min(pc, pt) - 8, hi = Math.max(pc, pt) + 14;
        for (const [p, bm] of pvBitmaps) if (p < lo || p > hi) { bm.close(); pvBitmaps.delete(p); }
      }
    }
    function preview(f) {
      if (!pv) return null;
      const p = Math.round(f / pv.every);
      for (let d = 0; d <= 6; d++) { if (pvBitmaps.has(p - d)) return pvBitmaps.get(p - d); if (pvBitmaps.has(p + d)) return pvBitmaps.get(p + d); }
      return null;
    }
    const chunkOf = i => Math.min(chunks.length - 1, Math.floor(i / CH));

    function loadChunk(c) {
      chunkLoading.add(c);
      fetch(new URL(`${v}/${chunks[c].file}`, BASE)).then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
        .then(buf => { if (!disposed) chunkData[c] = buf; })
        .catch(() => {}).finally(() => { chunkLoading.delete(c); Tdrawn = NaN; });
    }
    const hasData = i => !!chunkData[chunkOf(i)];
    function decodeFrame(i) {
      const c = chunkOf(i), [off, len] = chunks[c].ranges[i - chunks[c].first];
      decoding.add(i); decodes++;
      createImageBitmap(new Blob([new Uint8Array(chunkData[c], off, len)], { type: 'image/webp' }))
        .then(bm => { if (disposed) bm.close(); else bitmaps.set(i, bm); })
        .catch(() => {}).finally(() => { decoding.delete(i); decodes--; Tdrawn = NaN; });
    }
    const want = [];
    function pump(cur, target) {
      if (disposed) return;
      const c = Math.round(cur), t = Math.round(target), dir = t >= c ? 1 : -1;
      pumpPreview(c, t);
      // ---- downloads: chunks under the playhead, then toward the scroll target, then everything outward
      // until the preview track is in, only fetch the chunk under the playhead (the preview gets the bandwidth)
      const maxChunks = pv && !pvReadyFor(c, t) ? 1 : MAX_CHUNKS;
      if (chunkLoading.size < maxChunks) {
        const order = [chunkOf(c), chunkOf(t), chunkOf(Math.max(0, Math.min(n - 1, t + dir * CH)))];
        for (let d = 1; d < chunks.length; d++) { order.push(chunkOf(c) + d * dir, chunkOf(c) - d * dir); }
        for (const k of order) {
          if (chunkLoading.size >= maxChunks) break;
          if (k >= 0 && k < chunks.length && !chunkData[k] && !chunkLoading.has(k)) loadChunk(k);
        }
      }
      // ---- decodes: frames from the playhead to where the scroll is heading (sparse first when far), then a bit beyond
      want.length = 0;
      const span = Math.abs(t - c), stride = Math.max(1, Math.ceil(span / SPAN_SAMPLES));
      for (let k = 0; k <= span; k += stride) want.push(c + k * dir);
      if (stride > 1) for (let k = 1; k <= Math.min(span, 8); k++) want.push(c + k * dir);
      for (let k = 1; k <= AHEAD; k++) want.push(t + k * dir);
      want.push(t, c - dir, c - 2 * dir);
      for (const i of want) {
        if (decodes >= MAX_DECODE) break;
        if (i >= 0 && i < n && !bitmaps.has(i) && !decoding.has(i) && hasData(i)) decodeFrame(i);
      }
      // ---- memory: keep the bitmaps closest to the playhead / target
      if (bitmaps.size > MAX_BITMAPS) {
        const lo = Math.min(c, t) - 3, hi = Math.max(c, t) + AHEAD;
        const keys = [...bitmaps.keys()].sort((a, b) => {
          const da = a >= lo && a <= hi ? 0 : Math.min(Math.abs(a - lo), Math.abs(a - hi));
          const db = b >= lo && b <= hi ? 0 : Math.min(Math.abs(b - lo), Math.abs(b - hi));
          return db - da;
        });
        for (let k = 0; k < keys.length && bitmaps.size > MAX_BITMAPS; k++) { bitmaps.get(keys[k]).close(); bitmaps.delete(keys[k]); }
      }
    }
    function nearest(i, maxD = 240) {
      if (bitmaps.has(i)) return i;
      for (let d = 1; d <= maxD; d++) { if (bitmaps.has(i - d)) return i - d; if (bitmaps.has(i + d)) return i + d; }
      return -1;
    }
    return {
      meta, n, bitmaps, pump, nearest, preview, get chunksLoaded() { return chunkData.filter(Boolean).length; },
      get previewReady() { return pvParts.filter(Boolean).length; }, get previewDecoded() { return pvBitmaps.size; },
      dispose() { disposed = true; for (const bm of bitmaps.values()) bm.close(); bitmaps.clear(); for (const bm of pvBitmaps.values()) bm.close(); pvBitmaps.clear(); },
    };
  }

  // ------------------------------------------------------------------ labels (positions tracked offline)
  const labelLayer = stageEl.querySelector('.journey-labels');
  let labels = [];
  function buildLabels(defs) {
    labelLayer.textContent = '';
    labels = defs.map(l => {
      const el = document.createElement('div');
      el.className = 'j-label' + (l.side === 'down' ? ' is-down' : '');
      const span = document.createElement('span');
      const b = document.createElement('b'); b.textContent = l.k; span.append(b);
      if (l.v) { const em = document.createElement('em'); em.textContent = l.v; span.append(em); }
      el.append(document.createElement('i'), span);
      labelLayer.append(el);
      return { el, left: false, shown: false, down: l.side === 'down', isDown: l.side === 'down' };
    });
  }

  // ------------------------------------------------------------------ captions in the pinned product stage
  const dock = document.querySelector('.product-dock');
  const captions = {
    head: dock.querySelector('.dock-head'),
    rebar: dock.querySelector('[href$="#rebar"]'),
    armature: dock.querySelector('[href$="#armature"]'),
    wire: dock.querySelector('[href$="#wire"]'),
  };
  const rail = dock.querySelector('.stage-rail');
  const railSteps = rail ? [...rail.querySelectorAll('li')] : [];
  let lastIdx = -1;
  function updateCaptions(T) {
    if (!pinned) return;
    const set = (el, a) => { if (!el) return; el.style.opacity = a.toFixed(3); el.style.visibility = a < 0.01 ? 'hidden' : 'visible'; el.style.transform = `translate3d(0,${((1 - a) * 14).toFixed(1)}px,0)`; };
    set(captions.head, fade(T, 0.9, 1.3, 0.1));
    set(captions.rebar, fade(T, 1.38, 3.0, 0.1));
    set(captions.armature, fade(T, 3.02, 4.42, 0.12));
    set(captions.wire, fade(T, 4.55, 6.15, 0.12));
    const idx = T < 2.98 ? 0 : T < 4.45 ? 1 : 2;
    if (idx !== lastIdx) { lastIdx = idx; railSteps.forEach((li, i) => li.classList.toggle('is-active', i === idx)); }
    if (rail) rail.style.setProperty('--p', clamp01((T - 1) / 5).toFixed(4));
  }

  // ------------------------------------------------------------------ scroll → film time
  const sections = {
    intro: document.querySelector('.intro-material'),
    pin: document.querySelector('.pinboard'),
    gallery: document.querySelector('.material-gallery'),
    index: document.querySelector('.visual-index'),
    metrics: document.querySelector('.section-paper'),
    ext: document.querySelector('.editorial-extension'),
  };
  const anchors = [];
  let pinned = false, stageVisible = false;
  function buildTriggers() {
    anchors.length = 0;
    const desktop = !isMobile();
    pinned = true; // pinned stage on phones too: title block on top, film below
    dock.classList.add('is-pinned');
    const add = (st, T0, T1) => anchors.push({ st, T0, T1 });
    add(ScrollTrigger.create({ trigger: sections.intro, start: 'top bottom', end: 'bottom top' }), 0, 1);
    {
      // products chapter: one long pin, with most of the scroll given to each product's key moment
      // [T0, T1, screens of scroll]
      const SEG = [
        [1.0, 1.38, 0.8],   // chapter intro
        [1.38, 2.36, 1.8],  // rolling through the stands
        [2.36, 3.0, 2.4],   // 01 finished bar, ribs close-up
        [3.0, 3.9, 2.2],    // 02 cutting and bending
        [3.9, 4.45, 2.4],   // 02 cage assembled
        [4.45, 5.6, 2.2],   // 03 wire laying into rings
        [5.6, 6.0, 2.2],    // 03 finished coil
      ];
      const total = SEG.reduce((s, x) => s + x[2], 0);
      const pinSt = ScrollTrigger.create({ trigger: dock, start: 'top top', end: () => '+=' + Math.round(window.innerHeight * total), pin: true, pinSpacing: true, anticipatePin: 1 });
      let acc = 0;
      for (const [T0, T1, w] of SEG) {
        const f0 = acc / total, f1 = (acc += w) / total;
        add({ get start() { return pinSt.start + (pinSt.end - pinSt.start) * f0; }, get end() { return pinSt.start + (pinSt.end - pinSt.start) * f1; } }, T0, T1);
      }
    }
    add(ScrollTrigger.create({ trigger: sections.pin, start: 'top bottom', end: 'bottom bottom' }), 6, 7);
    add(ScrollTrigger.create({ trigger: sections.gallery, start: 'top bottom', end: 'bottom bottom' }), 7, 8);
    add(ScrollTrigger.create({ trigger: sections.index, start: 'top bottom', end: 'bottom bottom' }), 8, 9);
    add(ScrollTrigger.create({ trigger: sections.metrics, start: 'top bottom', end: 'bottom bottom' }), 9, 10);
    add(ScrollTrigger.create({ trigger: sections.ext, start: 'top bottom', end: 'bottom bottom' }), 10, 11);
    ScrollTrigger.create({ trigger: journey, start: 'top bottom', end: 'bottom top', onToggle: self => setVisible(self.isActive) });
    loadVariant(desktop ? 'desktop' : 'mobile').catch(disable);
    return () => { anchors.length = 0; };
  }
  gsap.matchMedia().add({ desktop: '(min-width: 761px)', mobile: '(max-width: 760px)' }, () => buildTriggers());

  function targetT() {
    const y = window.scrollY;
    if (!anchors.length || y <= anchors[0].st.start) return 0;
    for (const a of anchors) if (y <= a.st.end) return lerp(a.T0, a.T1, clamp01((y - a.st.start) / Math.max(1, a.st.end - a.st.start)));
    return 11;
  }
  function setVisible(v) { stageVisible = v; stageEl.classList.toggle('is-visible', v); Tdrawn = NaN; }

  // ------------------------------------------------------------------ drawing
  let W = 0, H = 0, needsResize = true, Tcur = targetT(), Tdrawn = NaN, lastDir = 1;
  const fit = { s: 1, ox: 0, oy: 0 };
  new ResizeObserver(() => { needsResize = true; }).observe(stageEl);
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    W = stageEl.clientWidth; H = stageEl.clientHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    needsResize = false; Tdrawn = NaN;
  }
  function draw(T, settled) {
    if (needsResize) resize();
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = settled ? 'high' : 'medium';
    const m = seq.meta, fRaw = frameAt(m, T), f = settled ? Math.round(fRaw) : fRaw, i0 = Math.min(seq.n - 1, Math.floor(f + 1e-6)), i1 = Math.min(seq.n - 1, i0 + 1), fr = Math.max(0, f - i0);
    const cw = canvas.width, ch = canvas.height;
    const s = Math.max(cw / m.width, ch / m.height), dw = m.width * s, dh = m.height * s, dx = (cw - dw) / 2;
    // phones: during the products chapter the film sits below the pinned title block
    const mobShift = isMobile() ? smooth(0.85, 1.15, T) * (1 - smooth(5.85, 6.2, T)) : 0;
    const dy = (ch - dh) / 2 + mobShift * ch * 0.24;
    if (mobShift > 0) { ctx.fillStyle = '#0b0b0c'; ctx.fillRect(0, 0, cw, dy); }
    // sharp frame if it (or a very close one) is ready; otherwise the low-res preview, so the film never freezes
    let a = seq.nearest(i0, 3);
    const b = seq.bitmaps.has(i1) ? i1 : -1;
    ctx.globalAlpha = 1;
    if (a >= 0) {
      ctx.drawImage(seq.bitmaps.get(a), dx, dy, dw, dh);
      if (a === i0 && b >= 0 && fr > 0.02) { ctx.globalAlpha = fr; ctx.drawImage(seq.bitmaps.get(b), dx, dy, dw, dh); ctx.globalAlpha = 1; }
    } else {
      const pv = seq.preview(f);
      if (pv) { ctx.imageSmoothingQuality = 'high'; ctx.drawImage(pv, dx, dy, dw, dh); }
      else { a = seq.nearest(i0); if (a < 0) return false; ctx.drawImage(seq.bitmaps.get(a), dx, dy, dw, dh); }
    }

    // labels + dim follow the same frame position (CSS px)
    const sc = s / (cw / W);
    fit.s = sc; fit.ox = dx / (cw / W); fit.oy = dy / (ch / H);
    const tA = m.tracks[i0], tB = m.tracks[i1];
    labels.forEach((l, k) => {
      const p = tA?.[k], q = tB?.[k] || p;
      if (!p) { if (l.shown) { l.shown = false; l.el.style.opacity = '0'; } return; }
      const op = lerp(p[0], q ? q[0] : 0, fr), u = lerp(p[1], q[1], fr), v = lerp(p[2], q[2], fr);
      l.shown = true;
      const px = fit.ox + u * m.width * sc, py = fit.oy + v * m.height * sc;
      // keep labels out of the bottom band where the step rail / captions sit
      const limit = H * (pinned ? 0.76 : 0.86);
      // a label that would drop its text into the band flips to point upward instead
      const down = l.down && py + 90 < limit - 40;
      if (down !== l.isDown) { l.isDown = down; l.el.classList.toggle('is-down', down); }
      let keep = 1 - smooth(limit - 40, limit, py + (down ? 90 : 0));
      if (mobShift > 0) keep *= 1 - mobShift * (1 - smooth(H * 0.5, H * 0.58, py)); // not over the title block
      l.el.style.opacity = (op * keep).toFixed(3);
      const left = u > 0.675; if (left !== l.left) { l.left = left; l.el.classList.toggle('is-left', left); }
      l.el.style.transform = `translate3d(${px.toFixed(1)}px,${py.toFixed(1)}px,0)`;
    });
    stageEl.style.setProperty('--stage-dim', lerp(m.dim[i0] || 0, m.dim[i1] || 0, fr).toFixed(3));
    return a === i0;
  }

  let last = performance.now();
  gsap.ticker.add(() => {
    const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
    // the playhead always comes to rest exactly on a rendered frame: no blended, ghosted still when scrolling stops
    let target = targetT();
    if (seq) target = timeAt(seq.meta, Math.round(frameAt(seq.meta, target)));
    Tcur += (target - Tcur) * (1 - Math.exp(-dt * 12));
    if (Math.abs(target - Tcur) < 0.0005) Tcur = target;
    if (target !== Tcur) lastDir = target > Tcur ? 1 : -1;
    if (!seq) return;
    seq.pump(frameAt(seq.meta, Tcur), frameAt(seq.meta, target));
    if (!stageVisible || Tcur === Tdrawn) return;
    updateCaptions(Tcur);
    if (draw(Tcur, Tcur === target)) Tdrawn = Tcur; // exact frame not decoded yet → redraw when it arrives
  });

  window.addEventListener('load', () => ScrollTrigger.refresh());
  window.__journeyReady = true;
  window.__journey = {
    get T() { return Tcur; }, get seq() { return seq; },
    renderAt(T) { Tcur = T; updateCaptions(T); return draw(T); },
    scrollFor(T) { const a = anchors.find(x => T >= x.T0 && T <= x.T1) || anchors[anchors.length - 1]; return a.st.start + (a.st.end - a.st.start) * clamp01((T - a.T0) / (a.T1 - a.T0)); },
  };
}
