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
    const n = meta.count;
    const blobs = new Array(n).fill(null), bitmaps = new Map(), fetching = new Set(), decoding = new Set();
    let disposed = false, inflight = 0, decodes = 0;
    const url = i => new URL(`${v}/${String(i).padStart(4, '0')}.webp`, BASE);
    // coarse-to-fine global order, so any position has a nearby frame early
    const order = [];
    const seen = new Uint8Array(n);
    for (const stride of [64, 32, 16, 8, 4, 2, 1]) for (let i = 0; i < n; i += stride) if (!seen[i]) { seen[i] = 1; order.push(i); }
    let orderPos = 0;
    const BACK = 12, AHEAD = 28, MAX_FETCH = 8, MAX_DECODE = 4;

    function fetchFrame(i) {
      fetching.add(i); inflight++;
      fetch(url(i)).then(r => r.blob()).then(b => { if (!disposed) blobs[i] = b; })
        .catch(() => {}).finally(() => { fetching.delete(i); inflight--; });
    }
    function decodeFrame(i) {
      decoding.add(i); decodes++;
      createImageBitmap(blobs[i]).then(bm => { if (disposed) bm.close(); else bitmaps.set(i, bm); })
        .catch(() => {}).finally(() => { decoding.delete(i); decodes--; Tdrawn = NaN; });
    }
    function pump(cur, dir) {
      if (disposed) return;
      const c = Math.round(cur);
      // 1) frames around the playhead (biased in scroll direction), 2) global coarse-to-fine
      const lo = c - (dir < 0 ? AHEAD : BACK), hi = c + (dir < 0 ? BACK : AHEAD);
      for (let k = 0; k <= AHEAD && inflight < MAX_FETCH; k++) {
        for (const i of [c + k * (dir < 0 ? -1 : 1), c - k * (dir < 0 ? -1 : 1)]) {
          if (i >= 0 && i < n && !blobs[i] && !fetching.has(i) && inflight < MAX_FETCH) fetchFrame(i);
        }
      }
      while (inflight < MAX_FETCH && orderPos < order.length) {
        const i = order[orderPos++];
        if (!blobs[i] && !fetching.has(i)) fetchFrame(i);
      }
      // decode nearest first, release bitmaps outside the window
      for (let k = 0; k <= AHEAD && decodes < MAX_DECODE; k++) {
        for (const i of [c + k * (dir < 0 ? -1 : 1), c - k * (dir < 0 ? -1 : 1)]) {
          if (i >= lo && i <= hi && i >= 0 && i < n && blobs[i] && !bitmaps.has(i) && !decoding.has(i) && decodes < MAX_DECODE) decodeFrame(i);
        }
      }
      for (const [i, bm] of bitmaps) if (i < lo - 4 || i > hi + 4) { bm.close(); bitmaps.delete(i); }
    }
    function nearest(i, maxD = 80) {
      if (bitmaps.has(i)) return i;
      for (let d = 1; d <= maxD; d++) { if (bitmaps.has(i - d)) return i - d; if (bitmaps.has(i + d)) return i + d; }
      return -1;
    }
    return {
      meta, n, bitmaps, pump, nearest,
      dispose() { disposed = true; for (const bm of bitmaps.values()) bm.close(); bitmaps.clear(); },
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
      return { el, left: false, shown: false };
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
    pinned = desktop;
    dock.classList.toggle('is-pinned', desktop);
    if (!desktop) Object.values(captions).forEach(c => { if (c) { c.style.opacity = ''; c.style.visibility = ''; c.style.transform = ''; } });
    const add = (st, T0, T1) => anchors.push({ st, T0, T1 });
    add(ScrollTrigger.create({ trigger: sections.intro, start: 'top bottom', end: 'bottom top' }), 0, 1);
    add(ScrollTrigger.create(desktop
      ? { trigger: dock, start: 'top top', end: () => '+=' + Math.round(window.innerHeight * 5.2), pin: true, pinSpacing: true, anticipatePin: 1 }
      : { trigger: dock, start: 'top top', end: 'bottom bottom' }), 1, 6);
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
  function draw(T) {
    if (needsResize) resize();
    const m = seq.meta, f = frameAt(m, T), i0 = Math.min(seq.n - 1, Math.floor(f)), i1 = Math.min(seq.n - 1, i0 + 1), fr = f - i0;
    const cw = canvas.width, ch = canvas.height;
    const s = Math.max(cw / m.width, ch / m.height), dw = m.width * s, dh = m.height * s, dx = (cw - dw) / 2, dy = (ch - dh) / 2;
    const a = seq.nearest(i0), b = seq.bitmaps.has(i1) ? i1 : -1;
    if (a < 0) return false;
    ctx.globalAlpha = 1;
    ctx.drawImage(seq.bitmaps.get(a), dx, dy, dw, dh);
    if (a === i0 && b >= 0 && fr > 0.02) { ctx.globalAlpha = fr; ctx.drawImage(seq.bitmaps.get(b), dx, dy, dw, dh); ctx.globalAlpha = 1; }

    // labels + dim follow the same frame position (CSS px)
    const sc = s / (cw / W);
    fit.s = sc; fit.ox = dx / (cw / W); fit.oy = dy / (ch / H);
    const tA = m.tracks[i0], tB = m.tracks[i1];
    labels.forEach((l, k) => {
      const p = tA?.[k], q = tB?.[k] || p;
      if (!p) { if (l.shown) { l.shown = false; l.el.style.opacity = '0'; } return; }
      const op = lerp(p[0], q ? q[0] : 0, fr), u = lerp(p[1], q[1], fr), v = lerp(p[2], q[2], fr);
      l.shown = true;
      l.el.style.opacity = op.toFixed(3);
      const left = u > 0.675; if (left !== l.left) { l.left = left; l.el.classList.toggle('is-left', left); }
      l.el.style.transform = `translate3d(${(fit.ox + u * m.width * sc).toFixed(1)}px,${(fit.oy + v * m.height * sc).toFixed(1)}px,0)`;
    });
    stageEl.style.setProperty('--stage-dim', lerp(m.dim[i0] || 0, m.dim[i1] || 0, fr).toFixed(3));
    return a === i0;
  }

  let last = performance.now();
  gsap.ticker.add(() => {
    const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
    const target = targetT();
    Tcur += (target - Tcur) * (1 - Math.exp(-dt * 12));
    if (Math.abs(target - Tcur) < 0.0005) Tcur = target;
    if (target !== Tcur) lastDir = target > Tcur ? 1 : -1;
    if (!seq) return;
    seq.pump(frameAt(seq.meta, Tcur), lastDir);
    if (!stageVisible || Tcur === Tdrawn) return;
    updateCaptions(Tcur);
    if (draw(Tcur)) Tdrawn = Tcur; // exact frame not decoded yet → redraw when it arrives
  });

  window.addEventListener('load', () => ScrollTrigger.refresh());
  window.__journeyReady = true;
  window.__journey = {
    get T() { return Tcur; }, get seq() { return seq; },
    renderAt(T) { Tcur = T; updateCaptions(T); return draw(T); },
    scrollFor(T) { const a = anchors.find(x => T >= x.T0 && T <= x.T1) || anchors[anchors.length - 1]; return a.st.start + (a.st.end - a.st.start) * clamp01((T - a.T0) / (a.T1 - a.T0)); },
  };
}
