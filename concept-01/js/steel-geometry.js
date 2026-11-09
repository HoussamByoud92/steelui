// UISTEEL — steel geometry & materials shared by the scroll journey.
// Rebar ribs follow the usual two-row transverse-rib pattern: two longitudinal ribs,
// crescent transverse ribs inclined ~54° to the axis, spacing ≈ 0.65·Ø, height ≈ 0.065·Ø.
import * as THREE from 'three';

export const RIB = { spacing: 0.65, height: 0.075, lon: 0.05, beta: 0.95, top: 0.11, flank: 0.1 };

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Rib height (world units) at angle th around the bar and material coordinate m along it.
export function ribHeight(th, m, R) {
  const d = 2 * R, c = RIB.spacing * d, TAU = Math.PI * 2;
  const t = ((th % TAU) + TAU) % TAU;
  const dl = Math.min(t, Math.abs(t - Math.PI), TAU - t);
  const lon = RIB.lon * d * (1 - smooth(0.06, 0.16, dl));
  const side = t >= Math.PI ? 1 : 0;
  const phi = t - side * Math.PI;
  const env = smooth(0.18, 0.55, Math.sin(phi));
  const shift = (phi - Math.PI / 2) * R / Math.tan(RIB.beta) * (side * 2 - 1);
  const zz = (m + shift) / c + side * 0.5;
  const u = Math.abs(zz - Math.floor(zz) - 0.5) * c;
  const k = 1 - smooth(RIB.top * d * 0.2, (RIB.top + RIB.flank) * d, u);
  return Math.max(lon, RIB.height * d * env * k);
}

export const GLSL_RIB = /* glsl */`
float ribH(float th, float m, float R){
  const float PI = 3.14159265, TAU = 6.2831853;
  float d = 2.0*R; float c = ${RIB.spacing.toFixed(3)}*d;
  float t = mod(th, TAU);
  float dl = min(t, min(abs(t-PI), TAU-t));
  float lon = ${RIB.lon.toFixed(3)}*d*(1.0-smoothstep(0.06,0.16,dl));
  float side = step(PI, t);
  float phi = t - side*PI;
  float env = smoothstep(0.18,0.55,sin(phi));
  float shift = (phi-PI*0.5)*R/tan(${RIB.beta.toFixed(3)})*(side*2.0-1.0);
  float zz = (m+shift)/c + side*0.5;
  float u = abs(fract(zz)-0.5)*c;
  float k = 1.0 - smoothstep(${(RIB.top*0.2).toFixed(4)}*d, ${(RIB.top+RIB.flank).toFixed(3)}*d, u);
  return max(lon, ${RIB.height.toFixed(3)}*d*env*k);
}`;

// ---------------------------------------------------------------------------
// Tube builder: rings along a framed path, optional ribs, flat end caps.
// samples: [{p, t, n, m}] — b is derived as n × t so the winding faces outward.
export function createTube(ringCount, radial, ribbed) {
  const rings = ringCount + 4; // cap centre + cap edge at each end
  const verts = rings * (radial + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
  g.setAttribute('aRib', new THREE.BufferAttribute(new Float32Array(verts), 1));
  const idx = [];
  for (let i = 0; i < rings - 1; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1, c = b + 1, d = a + 1;
    idx.push(a, b, d, b, c, d);
  }
  g.setIndex(idx);
  g.userData = { ringCount, radial, ribbed };
  return g;
}

const _b = new THREE.Vector3(), _o = new THREE.Vector3();
export function writeTube(g, samples, R) {
  const { ringCount, radial, ribbed } = g.userData;
  const pos = g.attributes.position.array, rib = g.attributes.aRib.array;
  const ribNorm = 1 / (RIB.height * 2 * R);
  let v = 0;
  const ring = (s, scale) => {
    _b.crossVectors(s.n, s.t).normalize();
    for (let j = 0; j <= radial; j++) {
      const th = (j / radial) * Math.PI * 2;
      const h = ribbed && scale > 0 ? ribHeight(th, s.m, R) : 0;
      const r = (R + h) * scale;
      _o.copy(s.n).multiplyScalar(Math.cos(th) * r).addScaledVector(_b, Math.sin(th) * r).add(s.p);
      pos[v * 3] = _o.x; pos[v * 3 + 1] = _o.y; pos[v * 3 + 2] = _o.z;
      rib[v] = Math.min(1, h * ribNorm); v++;
    }
  };
  ring(samples[0], 0); ring(samples[0], 1);
  for (let i = 0; i < ringCount; i++) ring(samples[i], 1);
  ring(samples[ringCount - 1], 1); ring(samples[ringCount - 1], 0);
  g.attributes.position.needsUpdate = true; g.attributes.aRib.needsUpdate = true;
  g.computeVertexNormals();
  g.computeBoundingSphere();
}

// Straight ribbed bar along +x, centred at origin. mAt(x) gives the rib material coordinate.
export function straightBar({ length, R, perPitch, radial, mAt = x => -x, ribbed = true }) {
  const pitch = RIB.spacing * 2 * R;
  const n = Math.max(8, Math.ceil(length / (pitch / perPitch)));
  const g = createTube(n, radial, ribbed);
  const t = new THREE.Vector3(1, 0, 0), nn = new THREE.Vector3(0, 0, 1);
  const samples = [];
  for (let i = 0; i < n; i++) {
    const x = -length / 2 + (i / (n - 1)) * length;
    samples.push({ p: new THREE.Vector3(x, 0, 0), t, n: nn, m: mAt(x) });
  }
  writeTube(g, samples, R);
  return g;
}

// ---------------------------------------------------------------------------
// Closed stirrup ("cadre") with 135° hooks, bent progressively like a CNC bender.
export class Stirrup {
  constructor({ R, rb, side, hook, perPitch, radial }) {
    Object.assign(this, { R, rb, side, hook });
    const D = Math.PI / 180;
    // segments from the head (first hook) to the tail (second hook)
    this.segs = [
      { k: 's', len: hook }, { k: 'a', ang: 135 * D }, { k: 's', len: side }, { k: 'a', ang: 90 * D },
      { k: 's', len: side }, { k: 'a', ang: 90 * D }, { k: 's', len: side }, { k: 'a', ang: 90 * D },
      { k: 's', len: side }, { k: 'a', ang: 135 * D }, { k: 's', len: hook },
    ];
    this.length = this.segs.reduce((l, s) => l + (s.k === 's' ? s.len : rb * s.ang), 0);
    const pitch = RIB.spacing * 2 * R;
    this.ds = pitch / perPitch;
    this.n = Math.ceil(this.length / this.ds) + 1;
    this.geometry = createTube(this.n, radial, true);
    this.arcs = this.segs.map((s, i) => (s.k === 'a' ? i : -1)).filter(i => i >= 0);
    this.lift = 2 * R * 1.05; // hooks overlap → stirrup climbs one bar diameter
    // arc start arc-lengths (all previous arcs fully bent)
    let acc = 0; this.arcStart = [];
    this.segs.forEach(s => { if (s.k === 'a') this.arcStart.push(acc); acc += s.k === 's' ? s.len : rb * s.ang; });
    this.update(Array(this.arcs.length).fill(1));
    // canonical centre of the finished stirrup
    const box = new THREE.Box3().setFromBufferAttribute(this.geometry.attributes.position);
    this.center = box.getCenter(new THREE.Vector3());
  }

  // Sample the centreline for bend amounts amt[k] ∈ [0,1].
  path(amt) {
    let x = 0, y = 0, h = -135 * Math.PI / 180, s = 0, ai = 0;
    const step = this.ds;
    const out = [];
    const push = (px, py, ph, ss) => out.push({ x: px, y: py, h: ph, s: ss });
    push(x, y, h, 0);
    for (const seg of this.segs) {
      if (seg.k === 's') {
        const k = Math.ceil(seg.len / step);
        for (let i = 1; i <= k; i++) { const l = seg.len * i / k; push(x + Math.cos(h) * l, y + Math.sin(h) * l, h, s + l); }
        x += Math.cos(h) * seg.len; y += Math.sin(h) * seg.len; s += seg.len;
      } else {
        const a = seg.ang * amt[ai++];
        const arcLen = this.rb * a, rest = this.rb * (seg.ang - a);
        const cx = x - Math.sin(h) * this.rb, cy = y + Math.cos(h) * this.rb;
        const k = Math.max(1, Math.ceil(arcLen / step));
        for (let i = 1; i <= k && arcLen > 0; i++) {
          const hh = h + a * i / k;
          push(cx + Math.sin(hh) * this.rb, cy - Math.cos(hh) * this.rb, hh, s + arcLen * i / k);
        }
        if (arcLen > 0) { h += a; x = cx + Math.sin(h) * this.rb; y = cy - Math.cos(h) * this.rb; s += arcLen; }
        if (rest > 0) {
          const k2 = Math.ceil(rest / step);
          for (let i = 1; i <= k2; i++) { const l = rest * i / k2; push(x + Math.cos(h) * l, y + Math.sin(h) * l, h, s + l); }
          x += Math.cos(h) * rest; y += Math.sin(h) * rest; s += rest;
        }
      }
    }
    return out;
  }

  // Resample path uniformly by arc-length into exactly n samples.
  update(amt) {
    const raw = this.path(amt);
    const L = raw[raw.length - 1].s;
    const samples = [];
    let j = 0;
    const nUp = new THREE.Vector3(0, 0, 1);
    for (let i = 0; i < this.n; i++) {
      const s = (i / (this.n - 1)) * L;
      while (j < raw.length - 2 && raw[j + 1].s < s) j++;
      const a = raw[j], b = raw[j + 1];
      const f = b.s > a.s ? (s - a.s) / (b.s - a.s) : 0;
      const h = a.h + (b.h - a.h) * f;
      const z = (s / L) * this.lift;
      samples.push({
        p: new THREE.Vector3(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, z),
        t: new THREE.Vector3(Math.cos(h), Math.sin(h), this.lift / L).normalize(),
        n: nUp, m: s, h, s,
      });
    }
    writeTube(this.geometry, samples, this.R);
    this.samples = samples;
    return samples;
  }

  // Sample at arc-length s of the current shape: position + heading.
  at(s) {
    const S = this.samples; const L = S[S.length - 1].s;
    const i = Math.min(S.length - 2, Math.max(0, Math.floor((s / L) * (S.length - 1))));
    const a = S[i], b = S[i + 1];
    const f = Math.min(1, Math.max(0, (s - a.s) / (b.s - a.s || 1)));
    return { x: a.p.x + (b.p.x - a.p.x) * f, y: a.p.y + (b.p.y - a.p.y) * f, h: a.h + (b.h - a.h) * f };
  }
}

// ---------------------------------------------------------------------------
// Tileable value-noise texture baked once on the CPU: R = fbm, G = fine grain, B = crack field.
// Sampling a texture is far cheaper per pixel than procedural hashing on weak GPUs.
let NOISE_TEX = null;
export function noiseTexture() {
  if (NOISE_TEX) return NOISE_TEX;
  const N = 256, data = new Uint8Array(N * N * 4);
  const lattice = (f, seed) => {
    const L = new Float32Array(f * f);
    let s = seed * 9973 + 1;
    for (let i = 0; i < L.length; i++) { s = (s * 16807) % 2147483647; L[i] = s / 2147483647; }
    return (x, y) => {
      const fx = x * f, fy = y * f, ix = Math.floor(fx), iy = Math.floor(fy);
      let tx = fx - ix, ty = fy - iy; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
      const a = L[(iy % f) * f + (ix % f)], b = L[(iy % f) * f + ((ix + 1) % f)];
      const c = L[((iy + 1) % f) * f + (ix % f)], d = L[((iy + 1) % f) * f + ((ix + 1) % f)];
      return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
    };
  };
  const o1 = lattice(8, 1), o2 = lattice(16, 2), o3 = lattice(32, 3), fine = lattice(128, 4), ck = lattice(24, 5);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N, i = (y * N + x) * 4;
    data[i] = Math.round((0.55 * o1(u, v) + 0.28 * o2(u, v) + 0.17 * o3(u, v)) * 255);
    data[i + 1] = Math.round(fine(u, v) * 255);
    data[i + 2] = Math.round(ck(u, v) * 255);
    data[i + 3] = 255;
  }
  NOISE_TEX = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  NOISE_TEX.wrapS = NOISE_TEX.wrapT = THREE.RepeatWrapping;
  NOISE_TEX.magFilter = THREE.LinearFilter; NOISE_TEX.minFilter = THREE.LinearMipmapLinearFilter;
  NOISE_TEX.generateMipmaps = true; NOISE_TEX.needsUpdate = true;
  return NOISE_TEX;
}

// ---------------------------------------------------------------------------
// Physically based steel with mill scale, rib wear, heat glow and optional ring-texture
// driven geometry (the rolling stream). mode: 'static' | 'inst' | 'stream'.
const NOISE = /* glsl */`
float jHash(vec3 p){ p = fract(p*0.3183099+0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float jNoise(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(jHash(i),jHash(i+vec3(1,0,0)),f.x),mix(jHash(i+vec3(0,1,0)),jHash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(jHash(i+vec3(0,0,1)),jHash(i+vec3(1,0,1)),f.x),mix(jHash(i+vec3(0,1,1)),jHash(i+vec3(1,1,1)),f.x),f.y),f.z); }
float jFbm(vec3 p){ return 0.55*jNoise(p)+0.28*jNoise(p*2.07+3.1)+0.17*jNoise(p*4.13+7.7); }
vec3 heatRamp(float h){
  vec3 c = mix(vec3(0.0), vec3(0.32,0.015,0.0), smoothstep(0.12,0.38,h));
  c = mix(c, vec3(0.9,0.1,0.008), smoothstep(0.38,0.64,h));
  c = mix(c, vec3(1.0,0.22,0.02), smoothstep(0.64,0.84,h));
  return mix(c, vec3(1.0,0.36,0.05), smoothstep(0.84,1.0,h)); }`;

export function steelMaterial(mode, opts = {}) {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff, metalness: 1, roughness: 0.45, envMapIntensity: opts.env ?? 0.85,
  });
  const U = {
    uHeat: { value: opts.heat ?? 0 }, uFlow: { value: 0 }, uClipX: { value: 1e4 },
    uTint: { value: new THREE.Color(opts.tint ?? 0xffffff) }, uSeed: { value: opts.seed ?? 0 },
    uScale: { value: opts.scale ?? 1 }, uNoise: { value: noiseTexture() }, uRingA: { value: null }, uRingB: { value: null }, uRings: { value: 1 },
  };
  mat.userData.u = U;
  mat.customProgramCacheKey = () => `steel-${mode}-${opts.flow ? 1 : 0}`;
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    let vs = sh.vertexShader, fs = sh.fragmentShader;
    const head = `varying float vHeat; varying float vRib; varying vec3 vObj; uniform float uHeat;\n`;
    vs = head + (mode === 'stream'
      ? `uniform sampler2D uRingA; uniform sampler2D uRingB; uniform float uRings; attribute float aRing; attribute float aTheta;\n${GLSL_RIB}
vec3 sPos(int i, float th, out float rib, out float heat){
  vec4 A = texelFetch(uRingA, ivec2(i,0), 0); vec4 B = texelFetch(uRingB, ivec2(i,0), 0);
  float c = cos(th), s = sin(th); float n = mix(2.0, 14.0, A.z);
  float sh = pow(pow(abs(c)+1e-5, n) + pow(abs(s)+1e-5, n), -1.0/n);
  float R = max(A.y, 1e-4); float h = B.x * ribH(th, B.z, R);
  rib = clamp(h / (0.13*R), 0.0, 1.0); heat = B.y;
  float r = R*sh + h; return vec3(A.x, r*s*A.w, r*c*B.w); }\n`
      : `attribute float aRib;\n${mode === 'inst' ? 'attribute float aHeat;\n' : ''}`) + vs;
    if (mode === 'stream') {
      vs = vs.replace('#include <beginnormal_vertex>', `
        int ri = int(aRing+0.5); int r0 = max(ri-1,0); int r1 = min(ri+1, int(uRings)-1);
        float jr, jh, jd1, jd2;
        vec3 jPos = sPos(ri, aTheta, jr, jh);
        vec3 pu = sPos(r1, aTheta, jd1, jd2) - sPos(r0, aTheta, jd1, jd2);
        vec3 pv = sPos(ri, aTheta+0.02, jd1, jd2) - sPos(ri, aTheta-0.02, jd1, jd2);
        vec3 objectNormal = cross(pv, pu);
        objectNormal = length(objectNormal) > 1e-9 ? normalize(objectNormal) : normalize(vec3(0.0, jPos.y, jPos.z)+vec3(1e-4,0,0));
        vRib = jr; vHeat = jh;`)
        .replace('#include <begin_vertex>', 'vec3 transformed = jPos; vObj = jPos;');
    } else {
      vs = vs.replace('#include <begin_vertex>', `#include <begin_vertex>
        vRib = aRib; ${mode === 'inst' ? 'vHeat = aHeat; vObj = transformed + instanceMatrix[3].xyz*0.37;' : 'vHeat = uHeat; vObj = transformed;'}`);
    }
    fs = head + `uniform float uFlow; uniform float uClipX; uniform vec3 uTint; uniform float uSeed; uniform float uScale; uniform sampler2D uNoise;\n${NOISE}\n` + fs;
    fs = fs.replace('#include <color_fragment>', `#include <color_fragment>
      ${mode === 'stream' ? 'if (vObj.x > uClipX) discard;' : ''}
      vec3 jp = vObj*uScale ${opts.flow ? '- vec3(uFlow,0.0,0.0)' : ''} + uSeed;
      vec2 jq = jp.xz*0.21 + jp.y*vec2(0.13,0.17) + jp.yx*0.09;
      float nA = texture2D(uNoise, jq).r; float nB = texture2D(uNoise, jq*9.0 + jp.zy*0.6).g;
      float scaleM = smoothstep(0.3, 0.62, nA);
      vec3 bare = vec3(0.3,0.302,0.31); vec3 oxide = vec3(0.088,0.086,0.088);
      vec3 jc = mix(bare, oxide, scaleM*0.82);
      jc = mix(jc, bare*1.15, smoothstep(0.55,1.0,vRib)*0.18);
      jc *= 0.9 + 0.2*nB;
      float jHot = smoothstep(0.22, 0.7, vHeat);
      jc = mix(jc, vec3(0.05,0.035,0.03), jHot);
      diffuseColor.rgb = jc * uTint;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = clamp(mix(0.4, 0.68, scaleM) + (nB-0.5)*0.16 - smoothstep(0.55,1.0,vRib)*0.05 + jHot*0.3, 0.08, 1.0);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
      metalnessFactor = mix(1.0, 0.62, max(scaleM*0.8, jHot));`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      float crack = 0.0; if (vHeat > 0.2) crack = smoothstep(0.6, 0.78, texture2D(uNoise, jq*3.3).b) * smoothstep(0.35, 0.8, nA);
      float glowVar = (0.5 + 0.95*nA) * (1.0 - 0.6*crack*jHot) * (0.9 + 0.2*nB);
      totalEmissiveRadiance += heatRamp(clamp(vHeat*(0.86+0.26*nA) - crack*0.12, 0.0, 1.0)) * (0.16 + 0.85*vHeat*vHeat) * glowVar;`);
    sh.vertexShader = vs; sh.fragmentShader = fs;
  };
  return mat;
}

// Rolling stream geometry: rings × radial grid whose shape comes from ring textures.
export function streamGeometry(rings, radial) {
  const n = rings * (radial + 1);
  const g = new THREE.BufferGeometry();
  const aRing = new Float32Array(n), aTheta = new Float32Array(n);
  for (let i = 0, v = 0; i < rings; i++) for (let j = 0; j <= radial; j++, v++) { aRing[v] = i; aTheta[v] = (j / radial) * Math.PI * 2; }
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('aRing', new THREE.BufferAttribute(aRing, 1));
  g.setAttribute('aTheta', new THREE.BufferAttribute(aTheta, 1));
  const idx = [];
  // ring 0 is the head (largest x) → reverse winding so faces point outward
  for (let i = 0; i < rings - 1; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1, c = b + 1, d = a + 1;
    idx.push(a, d, b, b, d, c);
  }
  g.setIndex(idx);
  return g;
}
