// UISTEEL — continuous scroll-driven steel film (sections 2 → end of the home page).
// Three.js renders the products, GSAP ScrollTrigger maps scroll to one film time "T".
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { steelMaterial, streamGeometry, straightBar, Stirrup, RIB, noiseTexture } from './steel-geometry.js';

gsap.registerPlugin(ScrollTrigger);

const root = document.documentElement;
const journey = document.querySelector('.journey');
const stageEl = document.querySelector('.journey-stage');
const canvas = stageEl?.querySelector('canvas');
// ?capture=desktop|mobile renders the film offline at high quality (scripts/capture-film.mjs)
const CAPTURE = new URLSearchParams(location.search).get('capture');
if (CAPTURE) { root.classList.remove('journey-off'); root.classList.add('journey-on'); }

function disable(reason) {
  console.warn('[UISTEEL journey] fallback:', reason);
  root.classList.remove('journey-on');
  root.classList.add('journey-off');
  stageEl?.remove();
  ScrollTrigger.getAll().forEach(t => t.kill());
  window.__journeyReady = true;
}

try { if (root.classList.contains('journey-on') && journey && canvas) init(); else disable('not enabled'); }
catch (err) { disable(err); }

function init() {
  const isMobile = () => CAPTURE ? CAPTURE === 'mobile' : window.matchMedia('(max-width: 760px)').matches;
  const lite = !CAPTURE && (isMobile() || (navigator.hardwareConcurrency || 8) <= 4);
  let capW = 0, capH = 0;
  let stageVisible = false, Tcur = 0, Tdrawn = NaN, needsResize = true, W = 0, H = 0;
  const Q = CAPTURE
    ? { rings: 1800, radial: 64, heroPitch: 20, heroRadial: 56, lodPitch: 6, lodRadial: 18, coil: 640, stirPitch: 8, stirRadial: 22, dpr: 1 }
    : lite
    ? { rings: 640, radial: 26, heroPitch: 7, heroRadial: 22, lodPitch: 2.5, lodRadial: 8, coil: 260, stirPitch: 4, stirRadial: 10, dpr: 1.2 }
    : { rings: 900, radial: 36, heroPitch: 10, heroRadial: 30, lodPitch: 3, lodRadial: 10, coil: 420, stirPitch: 5, stirRadial: 12, dpr: 1.35 };

  // ------------------------------------------------------------------ renderer
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: CAPTURE ? false : !lite && (window.devicePixelRatio || 1) < 1.5, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: !!CAPTURE });
  if (!renderer.capabilities.isWebGL2) throw new Error('WebGL2 unavailable');
  renderer.setClearColor(0x0b0b0c, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  let dpr = Math.min(window.devicePixelRatio || 1, Q.dpr);
  renderer.setPixelRatio(dpr);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0c0c0d, 0.04);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.38;

  const camera = new THREE.PerspectiveCamera(34, 1, 0.05, 160);
  let composer = null, bloom = null;
  if (CAPTURE) {
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.42, 0.55, 0.92);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  }
  const renderFrame = () => composer ? composer.render() : renderer.render(scene, camera);

  // ------------------------------------------------------------------ lights
  const key = new THREE.DirectionalLight(0xfff4e8, 1.75); key.position.set(6, 11, 9); scene.add(key); scene.add(key.target);
  if (CAPTURE) {
    key.castShadow = true; key.shadow.mapSize.set(4096, 4096);
    Object.assign(key.shadow.camera, { left: -13, right: 13, top: 13, bottom: -13, near: 0.5, far: 60 });
    key.shadow.bias = -0.0003; key.shadow.normalBias = 0.025; key.shadow.radius = 3;
  }
  const rim = new THREE.DirectionalLight(0xa9bccd, 1.6); rim.position.set(-9, 5, -11); scene.add(rim);
  const fill = new THREE.HemisphereLight(0x8c96a3, 0x120c0b, 0.35); scene.add(fill);
  const accent = new THREE.PointLight(0xff6418, 0, 13, 2); scene.add(accent);
  const HOT = new THREE.Color(0xff6418), COILC = new THREE.Color(0xff5a12), SCANC = new THREE.Color(0xff1f3d);

  // ------------------------------------------------------------------ shared materials
  // worn industrial surfaces: mottled paint / grime and roughness breakup instead of flat CG colour
  const WORN_GLSL = `varying vec3 vWp; uniform sampler2D uNoise;
`;
  const NOISE = noiseTexture();
  const worn = (mat, amt = 1, scale = 1.6) => {
    const A = amt.toFixed(2), S1 = scale.toFixed(2), S2 = (scale * 4.3).toFixed(2);
    mat.onBeforeCompile = sh => {
      sh.uniforms.uNoise = { value: NOISE };
      sh.vertexShader = 'varying vec3 vWp;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = WORN_GLSL + sh.fragmentShader
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec2 wq = vWp.xz*0.11*${S1} + vWp.y*vec2(0.07,0.05)*${S1};
          float wA = texture2D(uNoise, wq).r*0.85 + texture2D(uNoise, wq*${(4.3).toFixed(1)} + 0.37).r*0.15;
          float wB = texture2D(uNoise, wq*14.0).g;
          diffuseColor.rgb *= mix(1.0, 0.55 + 0.8*wA, ${A}) * (0.9 + 0.2*wB);`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = clamp(roughnessFactor + (wA-0.5)*0.38*${A} + (wB-0.5)*0.12, 0.05, 1.0);`);
    };
    mat.customProgramCacheKey = () => 'worn' + A + S1;
    return mat;
  };
  const paint = worn(new THREE.MeshStandardMaterial({ color: 0x2a2b2e, roughness: 0.62, metalness: 0.3 }));
  const paintDark = worn(new THREE.MeshStandardMaterial({ color: 0x18191a, roughness: 0.74, metalness: 0.2 }), 1.2);
  const brandRed = worn(new THREE.MeshStandardMaterial({ color: 0xb40023, roughness: 0.5, metalness: 0.15 }), 0.6);
  const machined = worn(new THREE.MeshStandardMaterial({ color: 0x55585c, roughness: 0.44, metalness: 1, envMapIntensity: 0.7 }), 0.9, 2.4);
  const floorMat = new THREE.MeshLambertMaterial({ color: 0x0c0c0d });

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(260, 120), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.position.set(20, -1.6, 0); scene.add(floor);

  // ================================================================== SCENE 01 — rolling mill
  const STANDS = [0, 3, 6, 9];
  const SEC = [
    { a: 0.55, k: 1, oy: 1, oz: 1 },      // billet 150×150 (rounded square)
    { a: 0.40, k: 0.72, oy: 1, oz: 1 },   // box pass
    { a: 0.27, k: 0, oy: 1.3, oz: 0.7 },  // oval pass
    { a: 0.17, k: 0, oy: 1, oz: 1 },      // round pass
    { a: 0.11, k: 0, oy: 1, oz: 1 },      // finishing pass — ribs impressed by the grooved rolls
  ];
  const area = s => s.a * s.a * s.oy * s.oz * (Math.PI + (3.88 - Math.PI) * s.k);
  const E = SEC.map(s => area(SEC[0]) / area(s));
  const L0 = 3.2, GAP = 3, HEAD_X = 19.0, CUT_X = 9.62;
  const FEED_MAX = GAP / E[1] + GAP / E[2] + GAP / E[3] + (HEAD_X - STANDS[3]) / E[4];
  const BAR_R = SEC[4].a;
  const feedForHead = x => { if (x <= 0) return x; let acc = 0; for (let k = 1; k <= 3; k++) { if (x <= STANDS[k]) return acc + (x - STANDS[k - 1]) / E[k]; acc += GAP / E[k]; } return acc + (x - STANDS[3]) / E[4]; };
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp01 = x => Math.min(1, Math.max(0, x));

  const ringS = q => (q < 0.6 ? 0.1 * q / 0.6 : 0.1 + 0.9 * (q - 0.6) / 0.4);
  const xOf = (s, feed) => {
    let f = feed - s * L0;
    if (f < 0) return f;
    for (let k = 1; k <= 3; k++) {
      const need = GAP / E[k];
      if (f < need) return STANDS[k - 1] + f * E[k];
      f -= need;
    }
    return STANDS[3] + f * E[4];
  };
  const secAt = x => {
    const p = { ...SEC[0] };
    for (let k = 0; k < 4; k++) {
      const t = smooth(STANDS[k] - 0.5, STANDS[k] + 0.04, x);
      for (const key in p) p[key] = lerp(p[key], SEC[k + 1][key], t);
    }
    return p;
  };

  const NR = Q.rings;
  const ringA = new Float32Array(NR * 4), ringB = new Float32Array(NR * 4);
  const texA = new THREE.DataTexture(ringA, NR, 1, THREE.RGBAFormat, THREE.FloatType);
  const texB = new THREE.DataTexture(ringB, NR, 1, THREE.RGBAFormat, THREE.FloatType);
  const streamMat = steelMaterial('stream', { seed: 1.7 });
  Object.assign(streamMat.userData.u, { uRingA: { value: texA }, uRingB: { value: texB }, uRings: { value: NR } });
  const stream = new THREE.Mesh(streamGeometry(NR, Q.radial), streamMat);
  stream.frustumCulled = false; scene.add(stream);

  let lastFeed = NaN;
  function updateStream(feed) {
    if (feed === lastFeed) return; lastFeed = feed;
    const xHead = xOf(0, feed), xTail = xOf(1, feed);
    for (let i = 0; i < NR; i++) {
      const s = ringS(i / (NR - 1));
      const x = xOf(s, feed); const p = secAt(x);
      const dh = xHead - x, dt = x - xTail;
      const capH = Math.sqrt(1 - Math.pow(1 - clamp01(dh / (0.55 * p.a)), 2));
      const capT = Math.sqrt(1 - Math.pow(1 - clamp01(dt / 0.07), 2));
      let heat = x < 9.25 ? 0.93 - 0.05 * clamp01(x / 9) : lerp(0.82, 0.3, smooth(9.3, 10.9, x));
      ringA[i * 4] = x; ringA[i * 4 + 1] = p.a * Math.min(capH, capT); ringA[i * 4 + 2] = p.k; ringA[i * 4 + 3] = p.oy;
      ringB[i * 4] = smooth(STANDS[3] - 0.18, STANDS[3] + 0.03, x); ringB[i * 4 + 1] = heat;
      ringB[i * 4 + 2] = s * L0 * E[4]; ringB[i * 4 + 3] = p.oz;
    }
    texA.needsUpdate = true; texB.needsUpdate = true;
  }

  // roll stands (alternating horizontal / vertical, grooved rolls)
  const rolls = [];
  function grooveRoll(half) {
    const R0 = 0.9, w = half * 1.08, g = half * 0.86, pts = [];
    const N = 46;
    for (let i = 0; i <= N; i++) {
      const y = -1.15 + (2.3 * i) / N;
      let r = R0 - g * Math.sqrt(Math.max(0, 1 - (y / w) ** 2));
      if (Math.abs(y) > 1.05) r -= (Math.abs(y) - 1.05) * 0.9;
      pts.push(new THREE.Vector2(r, y));
    }
    pts.unshift(new THREE.Vector2(0.2, -1.15)); pts.push(new THREE.Vector2(0.2, 1.15));
    return { geo: new THREE.LatheGeometry(pts, 72), off: R0 - g + half + 0.008 };
  }
  STANDS.forEach((sx, k) => {
    const g = new THREE.Group(); g.position.x = sx; scene.add(g);
    const horiz = k % 2 === 0;
    const half = SEC[k + 1].a * (horiz ? SEC[k + 1].oy : SEC[k + 1].oz);
    const { geo, off } = grooveRoll(half);
    if (horiz) geo.rotateX(Math.PI / 2);
    const neck = new THREE.CylinderGeometry(0.34, 0.34, 3.6, 28); if (horiz) neck.rotateX(Math.PI / 2);
    [-1, 1].forEach(sgn => {
      const roll = new THREE.Mesh(geo, machined);
      const n = new THREE.Mesh(neck, paint);
      if (horiz) { roll.position.y = sgn * off; n.position.y = sgn * off; } else { roll.position.z = sgn * off; n.position.z = sgn * off; }
      g.add(roll, n);
      rolls.push({ mesh: roll, horiz, sgn, k });
    });
    const postZ = horiz ? 1.95 : 2.55;
    // cutaway: only the drive-side housing is modelled so the camera sees into the roll gap
    const post = new THREE.Mesh(new RoundedBoxGeometry(0.62, 4.6, 0.55, 3, 0.05), paint); post.position.set(0, 0.7, -postZ); g.add(post);
    const chock = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.78, 0.5, 3, 0.05), paintDark);
    chock.position.set(0, horiz ? off : 0, -(postZ - 0.5)); g.add(chock);
    if (horiz) { const c2 = chock.clone(); c2.position.y = -off; g.add(c2); }
    const beamLen = postZ + 1.0;
    const beam = new THREE.Mesh(new RoundedBoxGeometry(0.76, 0.56, beamLen, 3, 0.06), paint); beam.position.set(0, 3.0, -postZ + beamLen / 2 - 0.3); g.add(beam);
    const strip = new THREE.Mesh(new RoundedBoxGeometry(0.78, 0.07, beamLen + 0.01, 2, 0.02), brandRed); strip.position.set(0, 2.76, beam.position.z); g.add(strip);
    const base = new THREE.Mesh(new RoundedBoxGeometry(1.3, 0.32, postZ * 2 + 1.2, 3, 0.05), paintDark); base.position.y = -1.45; g.add(base);
  });

  // reheating furnace door + roller table the billet arrives on
  const furnace = new THREE.Group(); furnace.position.x = -4.4; scene.add(furnace);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(0.7, 5.6, 8), paintDark); wall.position.y = 1.2; furnace.add(wall);
  const doorGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.6), new THREE.MeshBasicMaterial({ color: 0xff7a26, fog: false }));
  doorGlow.rotation.y = Math.PI / 2; doorGlow.position.set(0.36, 0, 0); furnace.add(doorGlow);
  const tableRoll = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.16, 1.6, 20).rotateX(Math.PI / 2), machined, 6);
  for (let i = 0; i < 6; i++) tableRoll.setMatrixAt(i, new THREE.Matrix4().makeTranslation(-3.7 + i * 0.68, -0.72, 0));
  scene.add(tableRoll);

  // flying shear after the finishing stand
  const shear = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.2, 1.1), machined);
  shear.position.set(CUT_X, 1.4, 0); scene.add(shear);
  const shearBody = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 1.6), paint); shearBody.position.set(CUT_X, 2.3, 0); scene.add(shearBody);

  // ================================================================== SCENE 02 — bars, cutting, bending, cage
  const BAR_LEN = HEAD_X - CUT_X - 0.03, BAR_XC = (HEAD_X + CUT_X + 0.03) / 2;
  const mBar = x => HEAD_X - (BAR_XC + x);
  const heroGeo = straightBar({ length: BAR_LEN, R: BAR_R, perPitch: Q.heroPitch, radial: Q.heroRadial, mAt: mBar });
  const lodGeo = straightBar({ length: BAR_LEN, R: BAR_R, perPitch: Q.lodPitch, radial: Q.lodRadial, mAt: mBar });
  const BED = 7;
  const barsMat = steelMaterial('inst', { seed: 4.1 });
  const bars = new THREE.InstancedMesh(heroGeo, barsMat, BED);
  const barHeat = new THREE.InstancedBufferAttribute(new Float32Array(BED), 1);
  heroGeo.setAttribute('aHeat', barHeat);
  bars.frustumCulled = false; scene.add(bars);

  const BED_Y = -0.55;
  const CAGE = { y: 1.2, c: 1.1, stirPitch: 1.38, n: 7, x0: 10.25 };
  const STIR_R = 0.07, RB = BAR_R + STIR_R;
  const stirrup = new Stirrup({ R: STIR_R, rb: RB, side: 2 * CAGE.c, hook: 0.75, perPitch: Q.stirPitch, radial: Q.stirRadial });
  const stirFinal = stirrup.geometry.clone();
  const stirLod = new Stirrup({ R: STIR_R, rb: RB, side: 2 * CAGE.c, hook: 0.75, perPitch: 2.5, radial: 8 }).geometry;
  const stirMat = steelMaterial('static', { seed: 2.3 });
  const stirDyn = new THREE.Mesh(stirrup.geometry, stirMat); stirDyn.matrixAutoUpdate = false; stirDyn.frustumCulled = false; scene.add(stirDyn);
  const stirInstMat = steelMaterial('inst', { seed: 5.2 });
  stirFinal.setAttribute('aHeat', new THREE.InstancedBufferAttribute(new Float32Array(CAGE.n), 1));
  const stirInst = new THREE.InstancedMesh(stirFinal, stirInstMat, CAGE.n); stirInst.frustumCulled = false; scene.add(stirInst);
  const feedStub = new THREE.Mesh(straightBar({ length: 10, R: STIR_R, perPitch: 3, radial: 12 }), stirMat); feedStub.matrixAutoUpdate = false; scene.add(feedStub);

  // bending station
  const PIN = new THREE.Vector3(12.2, -0.1, 3.9);
  const station = new THREE.Group(); scene.add(station);
  const table = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.22, 3.6), paint); table.position.set(PIN.x + 0.6, PIN.y - 0.22, PIN.z + 0.6); station.add(table);
  const tableEdge = new THREE.Mesh(new THREE.BoxGeometry(5.41, 0.05, 3.61), brandRed); tableEdge.position.set(PIN.x + 0.6, PIN.y - 0.33, PIN.z + 0.6); station.add(tableEdge);
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(RB - STIR_R, RB - STIR_R, 0.36, 32), machined); station.add(pin);
  const pinArm = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.36, 20), machined); station.add(pinArm);
  const cutter = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.42), machined); station.add(cutter);
  const feeders = [-1, 1].map(s => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.3, 24), paint); station.add(m); return { m, s }; });
  const legGeo = new THREE.BoxGeometry(0.2, 1.3, 0.2);
  [[-1.9, -0.9], [3.1, -0.9], [-1.9, 2.1], [3.1, 2.1]].forEach(([dx, dz]) => { const l = new THREE.Mesh(legGeo, paintDark); l.position.set(PIN.x + dx, -0.98, PIN.z + dz); station.add(l); });

  // tie wire at every stirrup / main bar crossing
  const tieGeo = new THREE.TorusGeometry(0.125, 0.0105, 6, 28);
  const ties = new THREE.InstancedMesh(tieGeo, new THREE.MeshStandardMaterial({ color: 0x5e6064, roughness: 0.42, metalness: 1 }), CAGE.n * 4 * 2);
  ties.frustumCulled = false; ties.count = 0; scene.add(ties);
  const CORNERS = [[1, 1], [1, -1], [-1, -1], [-1, 1]];

  // canonical-stirrup → world helpers
  const M_TABLE = new THREE.Matrix4().makeTranslation(PIN.x, PIN.y, PIN.z).multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
  const CAGE_LOCAL = new THREE.Matrix4().makeRotationY(Math.PI / 2).multiply(new THREE.Matrix4().makeTranslation(-stirrup.center.x, -stirrup.center.y, -stirrup.center.z));
  const cagePose = (i, out = new THREE.Matrix4()) => out.makeTranslation(CAGE.x0 + i * CAGE.stirPitch, CAGE.y, 0).multiply(CAGE_LOCAL);
  const tmpM = new THREE.Matrix4(), tmpM2 = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpQ2 = new THREE.Quaternion();
  const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpS = new THREE.Vector3(1, 1, 1), tmpS2 = new THREE.Vector3();
  const blendMatrix = (a, b, t, out) => {
    a.decompose(tmpV, tmpQ, tmpS); b.decompose(tmpV2, tmpQ2, tmpS2);
    tmpV.lerp(tmpV2, t); tmpQ.slerp(tmpQ2, t);
    return out.compose(tmpV, tmpQ, tmpS.set(1, 1, 1));
  };

  // bend schedule over p ∈ [0,1]: feed → bend ×5 → feed hook → cut
  const BEND_STEPS = (() => {
    const steps = []; const arcs = stirrup.arcStart.map((s, k) => ({ s, len: stirrup.rb * stirrup.segs[stirrup.arcs[k]].ang }));
    let prev = 0;
    arcs.forEach((a, k) => { steps.push({ type: 'feed', from: prev, to: a.s, w: 0.055 }); steps.push({ type: 'bend', k, s: a.s, len: a.len, w: 0.13 }); prev = a.s + a.len; });
    steps.push({ type: 'feed', from: prev, to: stirrup.length - 0.25, w: 0.07 });
    steps.push({ type: 'cut', w: 0.06 });
    const tot = steps.reduce((t, s) => t + s.w, 0); let acc = 0;
    steps.forEach(s => { s.a = acc / tot; acc += s.w; s.b = acc / tot; });
    return steps;
  })();
  const amt = new Array(stirrup.arcs.length).fill(0);
  let lastBend = -1;
  function updateBending(p) {
    if (p === lastBend) return; lastBend = p;
    amt.fill(0); let anchor = 0, cut = 0;
    for (const st of BEND_STEPS) {
      const t = clamp01((p - st.a) / (st.b - st.a));
      if (st.type === 'bend') { amt[st.k] = p >= st.b ? 1 : t; if (p >= st.a) anchor = st.s + st.len * amt[st.k]; }
      else if (st.type === 'feed') { if (p >= st.a) anchor = lerp(st.from, st.to, t); }
      else if (st.type === 'cut') cut = p >= st.a ? Math.sin(t * Math.PI) : 0;
    }
    stirrup.update(amt);
    const a = stirrup.at(anchor), after = stirrup.at(Math.min(stirrup.length, anchor + 0.02));
    const hd = Math.atan2(after.y - a.y, after.x - a.x);
    const A2D = new THREE.Matrix4().makeRotationZ(Math.PI - hd).multiply(new THREE.Matrix4().makeTranslation(-a.x, -a.y, 0));
    state.bendMatrix.copy(M_TABLE).multiply(A2D);
    const tailLen = stirrup.length - anchor;
    feedStub.matrix.copy(M_TABLE).multiply(new THREE.Matrix4().makeTranslation(-tailLen - 5 - 0.012, 0, 0));
    feedStub.visible = true;
    pin.position.set(PIN.x, PIN.y, PIN.z + (RB)); // centre of curvature sits beside the bar
    pinArm.position.set(PIN.x + Math.cos(0.6 + p * 9) * 0.55, PIN.y, PIN.z + RB + Math.sin(0.6 + p * 9) * 0.55);
    cutter.position.set(PIN.x - 0.25, PIN.y + 0.32 - cut * 0.3, PIN.z);
    feeders.forEach(f => { f.m.position.set(PIN.x - 1.2, PIN.y, PIN.z + f.s * (STIR_R + 0.16)); f.m.rotation.y = p * 40 * f.s; });
  }

  // ================================================================== SCENE 03 — wire rod line & coil
  const WIRE_R = 0.04, COIL = { x: 28, y0: -1.6, h: 2.6, r: 1.5, off: 0.3 };
  const wirePath = new THREE.CurvePath();
  wirePath.add(new THREE.LineCurve3(new THREE.Vector3(19.6, CAGE.y, 0), new THREE.Vector3(25.4, CAGE.y, 0)));
  wirePath.add(new THREE.CubicBezierCurve3(new THREE.Vector3(25.4, CAGE.y, 0), new THREE.Vector3(26.6, CAGE.y, 0), new THREE.Vector3(26.6, 2.5, 0), new THREE.Vector3(27.5, 2.5, 0)));
  wirePath.add(new THREE.LineCurve3(new THREE.Vector3(27.5, 2.5, 0), new THREE.Vector3(28, 2.5, 0)));
  const wireMat = steelMaterial('static', { seed: 8.8, flow: true, heat: 0.86, scale: 1.4 });
  const wire = new THREE.Mesh(new THREE.TubeGeometry(wirePath, 420, WIRE_R, 10, false), wireMat);
  wire.geometry.setAttribute('aRib', new THREE.BufferAttribute(new Float32Array(wire.geometry.attributes.position.count), 1));
  scene.add(wire);
  const wireStands = [];
  [21.4, 23.0].forEach((sx, k) => {
    const g = new THREE.Group(); g.position.set(sx, CAGE.y, 0); g.scale.setScalar(0.32); scene.add(g);
    const { geo, off } = grooveRoll(WIRE_R / 0.32);
    if (k === 0) geo.rotateX(Math.PI / 2);
    [-1, 1].forEach(sgn => { const r = new THREE.Mesh(geo, machined); if (k === 0) r.position.y = sgn * off; else r.position.z = sgn * off; g.add(r); wireStands.push({ r, k, sgn }); });
    [-1, 1].forEach(sgn => { const p = new THREE.Mesh(new THREE.BoxGeometry(0.62, 4.4, 0.55), paint); p.position.set(0, 0.6, sgn * 2.4); g.add(p); });
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 5.3), paint); beam.position.y = 2.95; g.add(beam);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.71, 0.07, 5.31), brandRed); strip.position.y = 2.72; g.add(strip);
  });
  const layingHead = new THREE.Group(); layingHead.position.set(COIL.x, 2.5, 0); scene.add(layingHead);
  const lhHousing = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.95, 0.9, 40, 1, true), paint); lhHousing.position.y = 0.15; layingHead.add(lhHousing);
  const lhCap = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.75, 0.25, 40), paint); lhCap.position.y = 0.72; layingHead.add(lhCap);
  const lhRing = new THREE.Mesh(new THREE.TorusGeometry(0.93, 0.035, 8, 64).rotateX(Math.PI / 2), brandRed); lhRing.position.y = -0.3; layingHead.add(lhRing);
  const lhPipe = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0.1, 0), new THREE.Vector3(0.1, -0.3, 0), new THREE.Vector3(COIL.r, -0.55, 0)), 40, 0.07, 10), machined);
  layingHead.add(lhPipe);

  // coil rings (laid rings, centres precessing between ID and OD like a Stelmor-formed coil)
  const NC = Q.coil;
  const ringGeo = new THREE.TorusGeometry(COIL.r, WIRE_R, CAPTURE ? 10 : 5, CAPTURE ? 112 : lite ? 40 : 48).rotateX(Math.PI / 2);
  ringGeo.setAttribute('aRib', new THREE.BufferAttribute(new Float32Array(ringGeo.attributes.position.count), 1));
  const coilHeat = new THREE.InstancedBufferAttribute(new Float32Array(NC), 1);
  ringGeo.setAttribute('aHeat', coilHeat);
  const coil = new THREE.InstancedMesh(ringGeo, steelMaterial('inst', { seed: 3.3, scale: 1.6 }), NC);
  coil.frustumCulled = false; coil.count = 0; scene.add(coil);
  const ringFinal = [];
  for (let i = 0; i < NC; i++) {
    const ang = i * 2.39996, wob = Math.sin(i * 0.37) * 0.05 + Math.sin(i * 1.91) * 0.03;
    const pos = new THREE.Vector3(COIL.x + Math.cos(ang) * COIL.off * (0.85 + 0.15 * Math.sin(i * 1.7)), COIL.y0 + WIRE_R + (i / NC) * COIL.h, Math.sin(ang) * COIL.off * (0.85 + 0.15 * Math.sin(i * 1.7)));
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.cos(ang) * 0.06 + wob, ang * 0.5, Math.sin(ang) * 0.06));
    ringFinal.push(new THREE.Matrix4().compose(pos, q, new THREE.Vector3(1, 1, 1)));
  }
  // strapping bands
  const straps = new THREE.Group(); scene.add(straps);
  const rO = COIL.r + COIL.off + WIRE_R + 0.03, rI = COIL.r - COIL.off - WIRE_R - 0.03, yb = COIL.y0 - 0.01, yt = COIL.y0 + COIL.h + 0.06;
  const strapPath = new THREE.CurvePath();
  [[rO, yb], [rO, yt], [rI, yt], [rI, yb], [rO, yb]].reduce((a, b) => { strapPath.add(new THREE.LineCurve3(new THREE.Vector3(a[0], a[1], 0), new THREE.Vector3(b[0], b[1], 0))); return b; });
  const strapGeo = new THREE.TubeGeometry(strapPath, 64, 0.022, 6, true);
  const strapMat = new THREE.MeshStandardMaterial({ color: 0x8d9094, roughness: 0.35, metalness: 1 });
  for (let k = 0; k < 4; k++) { const s = new THREE.Mesh(strapGeo, strapMat); s.rotation.y = k * Math.PI / 4 + Math.PI / 8; s.position.set(COIL.x, 0, 0); straps.add(s); }
  straps.visible = false;

  // ================================================================== supports — nothing floats
  const FLOOR_Y = -1.6;
  const supports = new THREE.Group(); scene.add(supports);
  const box = (w, h, d, x, y, z, mat = paintDark, parent = supports) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); parent.add(m); return m; };
  const leg = (x, yTop, z, parent) => box(0.16, yTop - FLOOR_Y, 0.16, x, (yTop + FLOOR_Y) / 2, z, paintDark, parent);
  // inter-stand guides and the run-out roller table
  const rollerXs = [];
  for (let k = 0; k < 3; k++) for (let x = STANDS[k] + 0.9; x < STANDS[k + 1] - 0.7; x += 0.75) rollerXs.push(x);
  for (let x = STANDS[3] + 1.1; x < HEAD_X + 0.4; x += 0.95) rollerXs.push(x);
  const runRoll = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.1, 1.3, 18).rotateX(Math.PI / 2), machined, rollerXs.length);
  rollerXs.forEach((x, i) => {
    const p = secAt(x); const top = -(p.a * p.oy) - 0.004;
    runRoll.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, top - 0.1, 0));
    box(0.14, 0.12, 1.5, x, top - 0.26, 0, paint, supports); leg(x, top - 0.32, 0.6, supports); leg(x, top - 0.32, -0.6, supports);
  });
  supports.add(runRoll);
  // cooling-bed rails
  const bedGroup = new THREE.Group(); scene.add(bedGroup);
  for (let x = 10.4; x < 19; x += 2.05) { box(0.22, 0.14, 3.8, x, BED_Y - BAR_R - 0.07, 0, paint, bedGroup); leg(x, BED_Y - BAR_R - 0.14, 1.75, bedGroup); leg(x, BED_Y - BAR_R - 0.14, -1.75, bedGroup); }
  // trestles carrying the finished cage
  const trestles = new THREE.Group(); scene.add(trestles);
  [11.3, 17.4].forEach(x => {
    const yTop = CAGE.y - CAGE.c - BAR_R - 0.06;
    box(0.26, 0.12, 3.1, x, yTop, 0, paint, trestles);
    leg(x, yTop - 0.06, 1.85, trestles); leg(x, yTop - 0.06, -1.85, trestles);
  });
  // wire line pedestals and laying-head portal
  wireStands.forEach(s => { if (s.sgn > 0) { const g = s.r.parent; if (!g.userData.base) { g.userData.base = box(0.9, (CAGE.y - 0.55 - FLOOR_Y) / 0.32, 2.2, 0, (-(CAGE.y - 0.55 - FLOOR_Y) / 0.32) / 2 - 1.7, 0, paintDark, g); } } });
  const portal = new THREE.Group(); scene.add(portal);
  [-1, 1].forEach(sgn => box(0.3, 4.9, 0.3, COIL.x, FLOOR_Y + 2.45, sgn * 2.3, paint, portal));
  box(0.36, 0.34, 4.9, COIL.x, 3.3, 0, paint, portal);
  box(0.37, 0.06, 4.91, COIL.x, 3.1, 0, brandRed, portal);
  box(4.4, 0.08, 4.4, COIL.x, FLOOR_Y + 0.02, 0, paintDark, portal);

  // ================================================================== QUALITY — inspection beam
  const scanMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    uniforms: { uA: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'varying vec2 vUv; uniform float uA; void main(){ vec2 q = abs(vUv - 0.5) * 2.0; float e = pow(max(0.0, 1.0 - q.x*q.x), 2.0) * pow(max(0.0, 1.0 - q.y*q.y), 2.5); gl_FragColor = vec4(vec3(0.85,0.02,0.12)*e*uA*0.55, 1.0); }',
  });
  const scan = new THREE.Mesh(new THREE.PlaneGeometry(9, 6.5), scanMat); scan.rotation.y = Math.PI / 2; scan.position.y = 1.6; scene.add(scan);
  scan.layers.set(1); // kept as the scan position anchor; the flat glow plane read as a hard-edged slab, the red light + floor line carry the scan
  const scanLine = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 9), new THREE.MeshBasicMaterial({ color: 0xff2347, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  scanLine.rotation.x = -Math.PI / 2; scanLine.position.y = -1.59; scene.add(scanLine);

  // ================================================================== FIGURES — bundle of bars (6 ligatures)
  const HEX = [];
  for (let q = -3; q <= 3; q++) for (let r = -3; r <= 3; r++) { const s = -q - r; if (Math.abs(s) <= 3) HEX.push([(q + r / 2) * 0.232, r * 0.201]); }
  const BUNDLE = { x: 36.8, y: -1.6 + 0.7, n: HEX.length };
  const bundleGeo = lodGeo.clone(); bundleGeo.setAttribute('aHeat', new THREE.InstancedBufferAttribute(new Float32Array(BUNDLE.n), 1));
  const bundle = new THREE.InstancedMesh(bundleGeo, steelMaterial('inst', { seed: 6.6 }), BUNDLE.n);
  bundle.frustumCulled = false; scene.add(bundle);
  const ligs = new THREE.InstancedMesh(new THREE.TorusGeometry(0.86, 0.016, 6, 60).rotateY(Math.PI / 2), strapMat, 6); ligs.frustumCulled = false; scene.add(ligs);

  // ================================================================== CLOSING — a reinforced frame rising
  const STRUCT = { x: 54, cols: [], colH: BAR_LEN };
  [-4.5, 0, 4.5].forEach(dx => [-2.6, 2.6].forEach(dz => STRUCT.cols.push([STRUCT.x + dx, dz])));
  const sBarGeo = lodGeo.clone(); const SB = STRUCT.cols.length * 4 + 7 * 4 + 24;
  sBarGeo.setAttribute('aHeat', new THREE.InstancedBufferAttribute(new Float32Array(SB), 1));
  const sBars = new THREE.InstancedMesh(sBarGeo, steelMaterial('inst', { seed: 9.1 }), SB); sBars.frustumCulled = false; scene.add(sBars);
  const SS = STRUCT.cols.length * 7;
  const sStirGeo = stirLod.clone(); sStirGeo.setAttribute('aHeat', new THREE.InstancedBufferAttribute(new Float32Array(SS), 1));
  const sStir = new THREE.InstancedMesh(sStirGeo, steelMaterial('inst', { seed: 7.4 }), SS); sStir.frustumCulled = false; scene.add(sStir);
  const structPlan = (() => {
    const barsP = [], stirP = [];
    const colC = 0.36, sc = colC / CAGE.c;
    STRUCT.cols.forEach(([cx, cz], ci) => {
      CORNERS.forEach(([a, b]) => barsP.push({ kind: 'col', ci, m: new THREE.Matrix4().compose(new THREE.Vector3(cx + a * colC, -1.6 + BAR_LEN / 2, cz + b * colC), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2)), new THREE.Vector3(1, 1, 1)) }));
      for (let j = 0; j < 7; j++) {
        const m = new THREE.Matrix4().makeTranslation(cx, -0.6 + j * 1.25, cz).multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2)).multiply(new THREE.Matrix4().makeScale(sc, sc, sc)).multiply(new THREE.Matrix4().makeTranslation(-stirrup.center.x, -stirrup.center.y, -stirrup.center.z));
        stirP.push({ ci, j, m });
      }
    });
    const topY = -1.6 + BAR_LEN - 0.55;
    const beam = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(-(z1 - z0), x1 - x0);
      CORNERS.forEach(([a, b]) => {
        const off = new THREE.Vector3(0, a * 0.3, b * 0.3).applyAxisAngle(new THREE.Vector3(0, 1, 0), ang);
        barsP.push({ kind: 'beam', m: new THREE.Matrix4().compose(new THREE.Vector3((x0 + x1) / 2, topY, (z0 + z1) / 2).add(off), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ang), new THREE.Vector3(len / BAR_LEN, 1, 1)) });
      });
    };
    beam(STRUCT.x - 4.5, -2.6, STRUCT.x, -2.6); beam(STRUCT.x, -2.6, STRUCT.x + 4.5, -2.6);
    beam(STRUCT.x - 4.5, 2.6, STRUCT.x, 2.6); beam(STRUCT.x, 2.6, STRUCT.x + 4.5, 2.6);
    [-4.5, 0, 4.5].forEach(dx => beam(STRUCT.x + dx, -2.6, STRUCT.x + dx, 2.6));
    for (let i = 0; i < 12; i++) barsP.push({ kind: 'mat', i, m: new THREE.Matrix4().compose(new THREE.Vector3(STRUCT.x, -1.5, -5 + i * 0.9), new THREE.Quaternion(), new THREE.Vector3(12 / BAR_LEN, 1, 1)) });
    for (let i = 0; i < 12; i++) barsP.push({ kind: 'mat', i: i + 12, m: new THREE.Matrix4().compose(new THREE.Vector3(STRUCT.x - 5.4 + i * 0.98, -1.28, 0), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2), new THREE.Vector3(11 / BAR_LEN, 1, 1)) });
    return { barsP, stirP };
  })();

  // ================================================================== timeline state (GSAP)
  const state = {
    head: -1.15, cut: 0, cool: 0, lift: 0, spin: 0, bed: 0, bend: 0, transfer: 0, rise: 0, assemble: 0, tie: 0,
    wire: 0, flow: 0, coil: 0, coilCool: 0, straps: 0, scan: 0, bundle: 0, ligs: 0, struct: 0,
    furnace: 0, rebarV: 0, millV: 0, dim: 0, fog: 0.042, shift: 0.25, exposure: 1,
    bendMatrix: new THREE.Matrix4(),
  };
  const tl = gsap.timeline({ paused: true, defaults: { ease: 'sine.inOut' } });
  const to = (t0, t1, vars) => tl.to(state, { ...vars, duration: t1 - t0 }, t0);
  to(0.0, 1.15, { head: 0, ease: 'power1.inOut' });
  to(1.15, 2.36, { head: HEAD_X, ease: 'power1.in' });
  to(2.38, 2.48, { cut: 1, ease: 'none' });
  to(2.36, 2.95, { cool: 1, ease: 'power1.out' });
  to(2.42, 2.78, { lift: 1 });
  to(2.42, 3.02, { spin: 1, ease: 'none' });
  to(2.98, 3.28, { bed: 1 });
  to(3.28, 3.86, { bend: 1, ease: 'none' });
  to(3.7, 3.98, { rise: 1 });
  to(3.86, 4.0, { transfer: 1 });
  to(3.98, 4.22, { assemble: 1, ease: 'none' });
  to(4.12, 4.3, { tie: 1, ease: 'none' });
  to(4.42, 4.86, { wire: 1 });
  to(4.42, 5.72, { flow: 26, ease: 'none' });
  to(4.74, 5.62, { coil: 1, ease: 'none' });
  to(5.45, 6.1, { coilCool: 1 });
  to(5.6, 5.86, { straps: 1 });
  to(6.0, 7.05, { scan: 1, ease: 'none' });
  to(9.0, 9.62, { bundle: 1, ease: 'power1.inOut' });
  to(9.5, 9.78, { ligs: 1 });
  to(10.0, 10.95, { struct: 1, ease: 'none' });
  // atmosphere: Higgsfield footage behind the 3D layer
  to(0.45, 0.95, { furnace: 1 }); to(2.2, 2.6, { furnace: 0 });
  to(2.75, 3.1, { rebarV: 1 }); to(4.2, 4.5, { rebarV: 0 });
  to(4.45, 4.85, { millV: 1 }); to(5.95, 6.35, { millV: 0.35 }); to(8.6, 9.0, { millV: 0 });
  to(6.9, 7.3, { dim: 0.55 }); to(8.75, 9.05, { dim: 0 });
  to(1.0, 1.6, { fog: 0.03 }); to(2.5, 2.9, { fog: 0.045 }); to(6.1, 6.9, { fog: 0.018 }); to(8.9, 9.4, { fog: 0.035 }); to(10.0, 10.6, { fog: 0.02 });
  to(1.0, 1.4, { shift: 0.15 }); to(2.5, 2.8, { shift: 0.2 }); to(4.4, 4.8, { shift: 0.14 }); to(5.95, 6.3, { shift: 0 }); to(9.1, 9.5, { shift: 0.16 }); to(10.0, 10.4, { shift: 0.2 });
  tl.to({}, { duration: 0.01 }, 11);

  // camera rail: [T, position, target]
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const CAM = [
    [0.0, V(-3.4, 1.35, 6.9), V(-2.5, -0.05, 0)],
    [0.7, V(-2.6, 1.7, 7.0), V(-1.4, 0, 0)],
    [1.15, V(-1.6, 2.4, 8.2), V(0.2, -0.1, 0)],
    [1.55, V(0.2, 2.3, 8.6), V(1.9, -0.15, 0)],
    [1.85, V(3.2, 2.2, 8.4), V(5.0, -0.15, 0)],
    [2.1, V(7.2, 1.9, 7.4), V(9.0, -0.1, 0)],
    [2.36, V(10.6, 1.2, 5.0), V(12.2, 0.05, 0)],
    [2.66, V(12.5, 1.15, 3.2), V(13.9, 0.55, 1.1)],
    [2.95, V(15.4, 1.0, 2.9), V(14.6, 0.6, 1.1)],
    [3.22, V(15.6, 4.2, 8.4), V(14.3, -0.2, 0.5)],
    [3.46, V(13.6, 2.7, 7.8), V(12.3, -0.1, 3.4)],
    [3.62, V(12.9, 3.4, 5.7), V(12.2, -0.1, 3.8)],
    [3.78, V(12.6, 2.4, 6.9), V(11.6, 0.1, 3.5)],
    [4.02, V(7.2, 3.4, 7.6), V(13.6, 1.2, 0)],
    [4.16, V(9.0, 2.0, 3.9), V(13.2, 1.15, 0)],
    [4.32, V(10.2, 3.1, 4.3), V(11.9, 1.75, 0.6)],
    [4.56, V(16.4, 1.35, 1.6), V(22.0, 1.25, 0)],
    [4.88, V(21.2, 3.6, 7.4), V(25.2, 1.6, 0)],
    [5.08, V(25.9, 3.4, 3.6), V(28.0, 1.6, 0)],
    [5.3, V(24.6, 2.4, 7.8), V(28.0, 0.2, 0)],
    [5.66, V(30.8, 1.8, 6.0), V(28.0, -0.2, 0)],
    [6.02, V(32.8, 1.1, 5.4), V(28.2, -0.35, 0.2)],
    [6.5, V(25.0, 6.5, 17.0), V(17.0, 0, 0)],
    [7.05, V(14.0, 9.5, 27.0), V(14.0, 0, 0)],
    [8.0, V(5.0, 13.0, 22.0), V(16.0, 0, -2)],
    [8.95, V(31.0, 5.0, 12.0), V(34.5, -0.6, 0)],
    [9.6, V(44.4, -0.2, 2.6), V(41.4, -0.9, 0)],
    [10.0, V(45.4, 0.8, 4.4), V(40.5, -0.9, 0)],
    [10.5, V(41.0, 3.2, 20.0), V(52.5, 2.6, 0)],
    [11.0, V(43.0, 12.5, 26.0), V(52.5, 3.0, 0)],
  ];
  const posCurve = new THREE.CatmullRomCurve3(CAM.map(c => c[1]), false, 'centripetal');
  const tgtCurve = new THREE.CatmullRomCurve3(CAM.map(c => c[2]), false, 'centripetal');
  const camTarget = new THREE.Vector3(), tmpV3 = new THREE.Vector3(), KEY_OFF = new THREE.Vector3(6, 11, 9);
  function cameraAt(T) {
    let i = 0; while (i < CAM.length - 2 && T > CAM[i + 1][0]) i++;
    const f = clamp01((T - CAM[i][0]) / (CAM[i + 1][0] - CAM[i][0]));
    const u = (i + f) / (CAM.length - 1);
    camera.position.copy(posCurve.getPoint(u));
    tgtCurve.getPoint(u, camTarget);
    camera.lookAt(camTarget);
  }

  // ================================================================== HTML labels anchored to the 3D
  const labelLayer = stageEl.querySelector('.journey-labels');
  const heroLocal = (lx, th, out = new THREE.Vector3()) => out.set(lx, Math.sin(th) * BAR_R * 1.1, Math.cos(th) * BAR_R * 1.1);
  const heroWorld = new THREE.Matrix4();
  const LABELS = [
    { t: [1.25, 1.95], k: 'Laminage à chaud', v: 'Cages de laminoir', at: () => tmpV.set(3, 2.95, 0) },
    { t: [1.85, 2.4], k: 'Cage finisseuse', v: 'Nervures imprimées', at: () => tmpV.set(9, 2.95, 0) },
    { t: [2.62, 3.0], k: 'Nervures transversales', v: 'Pas régulier', at: () => heroLocal(-1.2, Math.PI / 2).applyMatrix4(heroWorld) },
    { t: [2.66, 3.0], k: 'Nervure longitudinale', v: '', at: () => heroLocal(0.9, 0).applyMatrix4(heroWorld), side: 'down' },
    { t: [2.7, 3.0], k: 'Dimensions', v: 'Ø 08 à 20 mm', at: () => heroLocal(2.1, Math.PI / 2).applyMatrix4(heroWorld) },
    { t: [2.74, 3.0], k: 'Nuance', v: 'FeE500 soudable', at: () => heroLocal(-2.7, Math.PI * 1.5).applyMatrix4(heroWorld), side: 'down' },
    { t: [3.42, 3.84], k: 'Façonnage', v: 'Coupe et cintrage sur plan', at: () => tmpV.copy(PIN).add(tmpV2.set(0, 0.25, RB)) },
    { t: [4.12, 4.42], k: 'Cadre façonné', v: 'Ø 06 à 40 mm', at: () => tmpV.set(CAGE.x0 + CAGE.stirPitch, CAGE.y + CAGE.c + RB, 0) },
    { t: [4.16, 4.42], k: 'Ligature', v: 'Nervuré et lisse', at: () => tmpV.set(CAGE.x0 + CAGE.stirPitch, CAGE.y - 0.3, CAGE.c + RB), side: 'down' },
    { t: [5.72, 6.08], k: 'Couronne', v: 'Acier en bobine', at: () => tmpV.set(COIL.x, COIL.y0 + COIL.h + 0.1, 0) },
    { t: [5.78, 6.08], k: 'Lisse', v: 'Ø 5,5 à 12 mm', at: () => tmpV.set(COIL.x + 1.75, COIL.y0 + 1.6, 0.8) },
    { t: [5.84, 6.08], k: 'Nervuré', v: 'Ø 06 à 12 mm', at: () => tmpV.set(COIL.x + 1.4, COIL.y0 + 0.6, 1.3), side: 'down' },
    { t: [6.25, 6.95], k: 'NM 01.4.097', v: 'ISO 9001:2015', at: () => tmpV.set(scan.position.x, 4.6, 0) },
    { t: [9.5, 10.05], k: 'Fardeaux', v: 'de 2 à 2,5 t', at: () => tmpV.set(BUNDLE.x + BAR_LEN / 2, BUNDLE.y + 0.75, 0) },
    { t: [9.62, 10.05], k: '6 ligatures', v: 'par fardeau', at: () => tmpV.set(BUNDLE.x + BAR_LEN / 2 - 1.6, BUNDLE.y - 0.78, 0.2), side: 'down' },
  ].map(l => {
    const el = document.createElement('div');
    el.className = 'j-label' + (l.side === 'down' ? ' is-down' : '');
    el.innerHTML = `<i></i><span><b>${l.k}</b>${l.v ? `<em>${l.v}</em>` : ''}</span>`;
    labelLayer.append(el);
    return { ...l, el };
  });
  const proj = new THREE.Vector3();
  function updateLabels(T, w, h) {
    for (const l of LABELS) {
      const a = fade(T, l.t[0], l.t[1], 0.08);
      if (a <= 0.001) { if (l.el.style.opacity !== '0') l.el.style.opacity = '0'; continue; }
      proj.copy(l.at()).project(camera);
      const vis = proj.z < 1 && Math.abs(proj.x) < 1.1 && Math.abs(proj.y) < 1.1;
      l.el.style.opacity = vis ? a.toFixed(3) : '0';
      const left = proj.x > 0.35; if (left !== l.left) { l.left = left; l.el.classList.toggle('is-left', left); }
      l.el.style.transform = `translate3d(${((proj.x * 0.5 + 0.5) * w).toFixed(1)}px,${((-proj.y * 0.5 + 0.5) * h).toFixed(1)}px,0)`;
    }
  }
  function fade(T, a, b, f) { return Math.min(smooth(a, a + f, T), 1 - smooth(b - f, b, T)); }

  // ================================================================== Higgsfield atmosphere videos
  const videos = [...stageEl.querySelectorAll('video[data-key]')].map(v => {
    const tex = new THREE.VideoTexture(v); tex.colorSpace = THREE.SRGBColorSpace; tex.generateMipmaps = false;
    return { v, key: v.dataset.key, loaded: false, playing: false, tex, max: CAPTURE ? 0 : (v.dataset.max ? +v.dataset.max : 0.4) };
  });
  const bgMat = new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false, toneMapped: false, fog: false,
    uniforms: {
      uV0: { value: videos[0]?.tex || null }, uV1: { value: videos[1]?.tex || null }, uV2: { value: videos[2]?.tex || null },
      uA: { value: new THREE.Vector3() }, uAspect: { value: 1 },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }',
    fragmentShader: `varying vec2 vUv; uniform sampler2D uV0, uV1, uV2; uniform vec3 uA; uniform float uAspect;
      vec3 grade(vec3 c){ float l = dot(c, vec3(0.299,0.587,0.114)); return mix(vec3(l), c, 0.72) * 0.78; }
      void main(){
        vec2 p = vUv - vec2(0.64, 0.46); p.x *= uAspect;
        vec3 col = mix(vec3(0.0072,0.0072,0.0082), vec3(0.0032,0.0032,0.0036), smoothstep(0.0, 0.95, length(p)));
        float va = 16.0/9.0; vec2 q = vUv - 0.5;
        if (uAspect > va) q.y *= va / uAspect; else q.x *= uAspect / va;
        q += 0.5;
        if (uA.x > 0.002) col = mix(col, grade(texture2D(uV0, q).rgb), uA.x);
        if (uA.y > 0.002) col = mix(col, grade(texture2D(uV1, q).rgb), uA.y);
        if (uA.z > 0.002) col = mix(col, grade(texture2D(uV2, q).rgb), uA.z);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bgMat);
  bg.frustumCulled = false; bg.renderOrder = -1000; scene.add(bg);
  let videoLive = false;
  function updateVideos() {
    videoLive = false;
    for (const [i, o] of videos.entries()) {
      const a = (state[o.key] || 0) * o.max;
      bgMat.uniforms.uA.value.setComponent(i, a);
      if (a > 0.01) videoLive = true;
      if (CAPTURE) continue;
      if (a > 0.01 && stageVisible) {
        if (!o.loaded) { o.v.src = o.v.dataset.src; o.loaded = true; }
        if (!o.playing) { o.playing = true; o.v.play().catch(() => {}); }
      } else if (o.playing) { o.playing = false; o.v.pause(); }
    }
  }

  // ================================================================== captions in the pinned product stage
  const dock = document.querySelector('.product-dock');
  const captions = {
    head: dock.querySelector('.dock-head'),
    rebar: dock.querySelector('[href$="#rebar"]'),
    armature: dock.querySelector('[href$="#armature"]'),
    wire: dock.querySelector('[href$="#wire"]'),
  };
  const rail = dock.querySelector('.stage-rail');
  const railSteps = rail ? [...rail.querySelectorAll('li')] : [];
  function updateCaptions(T) {
    if (!pinned) { Object.values(captions).forEach(c => c && (c.style.opacity = '')); return; }
    const set = (el, a) => { if (!el) return; el.style.opacity = a.toFixed(3); el.style.visibility = a < 0.01 ? 'hidden' : 'visible'; el.style.transform = `translate3d(0,${((1 - a) * 14).toFixed(1)}px,0)`; };
    set(captions.head, fade(T, 0.9, 1.3, 0.1));
    set(captions.rebar, fade(T, 1.38, 3.0, 0.1));
    set(captions.armature, fade(T, 3.02, 4.42, 0.12));
    set(captions.wire, fade(T, 4.55, 6.15, 0.12));
    const idx = T < 2.98 ? 0 : T < 4.45 ? 1 : 2;
    railSteps.forEach((li, i) => li.classList.toggle('is-active', i === idx));
    if (rail) rail.style.setProperty('--p', clamp01((T - 1) / 5).toFixed(4));
  }

  // ================================================================== apply state → scene
  const barPose = new THREE.Matrix4(), bedPose = new THREE.Matrix4(), cornerPose = new THREE.Matrix4(), mtx = new THREE.Matrix4();
  const showPose = new THREE.Matrix4(), tmpM3 = new THREE.Matrix4(), tmpE = new THREE.Euler();
  const Z_AXIS = new THREE.Vector3(0, 0, 1), X_AXIS = new THREE.Vector3(1, 0, 0);
  const STIR_ENTRY = cagePose(CAGE.n - 1, new THREE.Matrix4()).premultiply(new THREE.Matrix4().makeTranslation(3.5, 0, 0));
  let lastCoil = -1, lastCoilCool = -1;
  const BED_Z = k => (k - 3) * 0.5, CORNER_SLOTS = { 1: 0, 2: 1, 4: 2, 5: 3 };
  const heroSlot = 2;
  function apply(T) {
    state.feed = Math.min(feedForHead(state.head), FEED_MAX);
    updateStream(state.feed);
    stream.visible = T < 3.3 || (T > 5.9 && T < 7.2);
    streamMat.userData.u.uClipX.value = state.cut > 0.5 ? CUT_X : 1e4;
    shear.position.y = 1.4 - Math.sin(state.cut * Math.PI) * 1.05;

    // rolls spin with the mass flow they carry
    const fClamped = Math.max(0, Math.min(state.feed, FEED_MAX));
    rolls.forEach(r => { const ang = (fClamped * E[r.k + 1]) / 0.9 * r.sgn; if (r.horiz) r.mesh.rotation.z = ang; else r.mesh.rotation.y = -ang; });

    // hot light follows the hottest visible zone
    const hx = Math.min(9.5, Math.max(-1.6, state.head - 0.8));
    const hotI = 12 * (1 - smooth(2.4, 3.1, T)) * (T < 0.05 ? 0.6 : 1);
    doorGlow.material.color.setRGB(1, 0.48, 0.15).multiplyScalar(1.4 - smooth(1.4, 2.4, T) * 0.6);

    // --- hero bar: cut piece → showcase → cooling bed → cage corner
    const ready = state.cut > 0.5;
    bars.visible = ready && T < 9.2;
    bars.count = BED;
    if (bars.visible) {
    const lift = state.lift, spin = state.spin;
    barPose.makeTranslation(BAR_XC, 0, 0);
    showPose.compose(tmpV.set(lerp(BAR_XC, 14.0, lift), lerp(0, 0.6, lift), lerp(0, 1.1, lift)),
      tmpQ.setFromEuler(tmpE.set(spin * Math.PI * 1.25, -0.2 * lift, 0.05 * lift)), tmpS.set(1, 1, 1));
    for (let k = 0; k < BED; k++) {
      const slot = k === 0 ? heroSlot : (k <= heroSlot ? k - 1 : k);
      bedPose.makeTranslation(BAR_XC, BED_Y, BED_Z(slot));
      const ci = CORNER_SLOTS[slot];
      let m;
      if (k === 0) m = blendMatrix(showPose, bedPose, smooth(0, 1, state.bed), mtx);
      else { const d = smooth(0, 1, clamp01(state.bed * 1.6 - (k - 1) * 0.1)); m = mtx.compose(tmpV.set(BAR_XC, BED_Y + (1 - d) * 0.6, lerp(-10 - k, BED_Z(slot), d)), tmpQ.identity(), d > 0.001 ? tmpS.set(1, 1, 1) : tmpS.set(1e-4, 1e-4, 1e-4)); }
      if (ci !== undefined && state.rise > 0) {
        const [a, b] = CORNERS[ci];
        const r = smooth(0, 1, clamp01(state.rise * 1.3 - ci * 0.1));
        cornerPose.makeTranslation(BAR_XC, CAGE.y + a * CAGE.c, b * CAGE.c);
        m = blendMatrix(tmpM3.copy(m), cornerPose, r, mtx);
      }
      if (k === 0) heroWorld.copy(m);
      bars.setMatrixAt(k, m);
      barHeat.array[k] = k === 0 ? 0.3 * (1 - state.cool) : 0;
    }
    bars.instanceMatrix.needsUpdate = true; barHeat.needsUpdate = true;
    }

    // --- bending + cage
    const bendOn = T > 3.1 && T < 4.1;
    station.visible = T > 2.9 && T < 7.4;
    trestles.visible = T > 3.62;
    feedStub.visible = bendOn && state.transfer < 0.01;
    if (T > 3.1 && T < 4.1) updateBending(state.bend);
    if (state.transfer > 0) blendMatrix(state.bendMatrix, cagePose(0, tmpM), smooth(0, 1, state.transfer), stirDyn.matrix);
    else stirDyn.matrix.copy(state.bendMatrix);
    stirDyn.visible = bendOn && state.assemble <= 0.0001;
    let shown = 0;
    stirInst.visible = T > 3.9 && T < 9.2; ties.visible = T > 3.9 && T < 7.0;
    if (state.assemble > 0 && stirInst.visible) {
      for (let i = 0; i < CAGE.n; i++) {
        const a = i === 0 ? 1 : smooth(0, 1, clamp01(state.assemble * (CAGE.n - 1) - (i - 1) * 0.85));
        if (a <= 0) continue;
        cagePose(i, tmpM);
        tmpM2.copy(STIR_ENTRY);
        stirInst.setMatrixAt(shown++, blendMatrix(tmpM2, tmpM, a, mtx));
      }
    }
    stirInst.count = shown; stirInst.instanceMatrix.needsUpdate = true;
    // ties
    let tc = 0;
    if (state.tie > 0 && ties.visible) {
      const n = Math.floor(state.tie * CAGE.n * 4 + 0.001);
      for (let i = 0; i < CAGE.n && tc < n * 2; i++) for (const [a, b] of CORNERS) {
        if (tc >= n * 2) break;
        const p = tmpV.set(CAGE.x0 + i * CAGE.stirPitch, CAGE.y + a * (CAGE.c + 0.04), b * (CAGE.c + 0.04));
        const diag = tmpV2.set(0, a, b).normalize();
        for (const tw of [0.75, -0.75]) {
          tmpQ.setFromUnitVectors(Z_AXIS, diag).multiply(tmpQ2.setFromAxisAngle(X_AXIS, tw));
          ties.setMatrixAt(tc++, mtx.compose(p, tmpQ, tmpS.set(1, 1, 1)));
        }
      }
    }
    ties.count = tc; ties.instanceMatrix.needsUpdate = true;

    // --- wire rod + coil
    const wOn = state.wire > 0.001;
    wire.visible = wOn; layingHead.visible = T > 4.2; wireStands.forEach(s => (s.r.parent.visible = T > 4.2));
    const wireHeat = 0.86 * state.wire * (1 - state.coilCool);
    wireMat.userData.u.uHeat.value = wireHeat; wireMat.userData.u.uFlow.value = state.flow;
    wire.scale.setScalar(1);
    layingHead.rotation.y = state.flow * 2.2;
    wireStands.forEach(s => { const a = state.flow / 0.3 * s.sgn; if (s.k === 0) s.r.rotation.z = a; else s.r.rotation.y = -a; });
    const nShow = Math.floor(state.coil * NC);
    coil.count = Math.min(NC, nShow + 1);
    coil.visible = T > 4.6 && T < 7.3;
    if (coil.visible && (state.coil !== lastCoil || state.coilCool !== lastCoilCool)) { lastCoil = state.coil; lastCoilCool = state.coilCool;
    for (let i = Math.max(0, nShow - 4); i < coil.count; i++) {
      const fall = clamp01((state.coil * NC - i) / 4);
      const f = ringFinal[i];
      f.decompose(tmpV, tmpQ, tmpS);
      tmpV.y = lerp(1.75, tmpV.y, fall * fall);
      coil.setMatrixAt(i, mtx.compose(tmpV, tmpQ, tmpS)); ringFinal[i].__set = false;
    }
    for (let i = 0; i < Math.max(0, nShow - 4); i++) if (!ringFinal[i].__set) { coil.setMatrixAt(i, ringFinal[i]); ringFinal[i].__set = true; }
    for (let i = 0; i < coil.count; i++) coilHeat.array[i] = 0.82 * clamp01(1 - (state.coil * NC - i) / (NC * 0.3)) * (1 - state.coilCool);
    coil.instanceMatrix.needsUpdate = true; coilHeat.needsUpdate = true;
    }
    const coilI = 22 * state.coil * (1 - state.coilCool) * (T < 6.5 ? 1 : 0);
    straps.visible = state.straps > 0.01;
    straps.children.forEach(s => s.scale.set(1 + (1 - state.straps) * 0.25, 1, 1 + (1 - state.straps) * 0.25));

    // --- inspection beam
    const sOn = state.scan > 0 && state.scan < 1;
    scan.visible = sOn; scanLine.visible = sOn;
    const sx = lerp(-4, 31, state.scan);
    scan.position.x = sx; scanLine.position.x = sx;
    const sA = Math.sin(state.scan * Math.PI);
    scanMat.uniforms.uA.value = sA; scanLine.material.opacity = sA * 0.9;
    const scanI = sA * 40;
    if (scanI >= coilI && scanI >= hotI) { accent.position.set(sx, 2.2, 2); accent.color.copy(SCANC); accent.intensity = scanI; }
    else if (coilI >= hotI) { accent.position.set(28, 2.8, 2); accent.color.copy(COILC); accent.intensity = coilI; }
    else { accent.position.set(hx, 2.4, 3.2); accent.color.copy(HOT); accent.intensity = hotI; }

    // --- bundle
    bundle.visible = ligs.visible = T > 8.6 && T < 10.7;
    if (bundle.visible) {
    for (let i = 0; i < BUNDLE.n; i++) {
      const [hy, hz] = HEX[i];
      const d = smooth(0, 1, clamp01(state.bundle * 2.2 - (i / BUNDLE.n) * 1.2));
      bundle.setMatrixAt(i, mtx.compose(tmpV.set(BUNDLE.x, BUNDLE.y + hz + (1 - d) * (2.4 + (i % 5) * 0.5), hy + (1 - d) * ((i % 7) - 3) * 0.9), tmpQ.setFromAxisAngle(tmpV2.set(0, 1, 0), (1 - d) * 0.25 * ((i % 3) - 1)), tmpS.set(1, 1, 1)));
    }
    bundle.instanceMatrix.needsUpdate = true;
    ligs.visible = state.ligs > 0.01;
    for (let i = 0; i < 6; i++) { const s = 1 + (1 - state.ligs) * 0.35; ligs.setMatrixAt(i, mtx.compose(tmpV.set(BUNDLE.x - BAR_LEN / 2 + 0.6 + i * (BAR_LEN - 1.2) / 5, BUNDLE.y, 0), tmpQ.identity(), tmpS.set(1, s, s))); }
    ligs.instanceMatrix.needsUpdate = true;
    } else ligs.visible = false;

    // --- closing structure
    const sp = state.struct;
    sBars.visible = sStir.visible = T > 9.8;
    if (sBars.visible) {
    structPlan.barsP.forEach((b, i) => {
      let d, off;
      if (b.kind === 'mat') { d = smooth(0, 1, clamp01(sp * 4 - b.i / 24)); off = tmpV2.set(0, (1 - d) * 3, 0); }
      else if (b.kind === 'col') { d = smooth(0, 1, clamp01(sp * 3 - 0.45 - b.ci * 0.12)); off = tmpV2.set(0, -(1 - d) * (BAR_LEN + 0.2), 0); }
      else { d = smooth(0, 1, clamp01(sp * 4 - 3)); off = tmpV2.set(0, (1 - d) * 4, 0); }
      b.m.decompose(tmpV, tmpQ, tmpS); tmpV.add(off);
      sBars.setMatrixAt(i, mtx.compose(tmpV, tmpQ, d > 0.001 ? tmpS : tmpS.set(0.0001, 0.0001, 0.0001)));
    });
    sBars.instanceMatrix.needsUpdate = true;
    structPlan.stirP.forEach((s, i) => {
      const d = smooth(0, 1, clamp01(sp * 3.2 - 1.2 - s.ci * 0.1 - s.j * 0.05));
      s.m.decompose(tmpV, tmpQ, tmpS); tmpV.y += (1 - d) * 9;
      sStir.setMatrixAt(i, mtx.compose(tmpV, tmpQ, d > 0.001 ? tmpS : tmpS.set(0.0001, 0.0001, 0.0001)));
    });
    sStir.instanceMatrix.needsUpdate = true;
    }

    scene.fog.density = state.fog;
    renderer.toneMappingExposure = state.exposure;
    stageEl.style.setProperty('--stage-dim', state.dim.toFixed(3));
  }

  // ================================================================== scroll → film time
  const sections = {
    intro: document.querySelector('.intro-material'),
    pin: document.querySelector('.pinboard'),
    gallery: document.querySelector('.material-gallery'),
    index: document.querySelector('.visual-index'),
    metrics: document.querySelector('.section-paper'),
    ext: document.querySelector('.editorial-extension'),
  };
  const anchors = [];
  let pinned = false;
  const mm = gsap.matchMedia();
  const addAnchor = (st, T0, T1) => anchors.push({ st, T0, T1 });
  function buildTriggers() {
    anchors.length = 0;
    const desktop = !isMobile();
    pinned = desktop;
    dock.classList.toggle('is-pinned', desktop);
    addAnchor(ScrollTrigger.create({ trigger: sections.intro, start: 'top bottom', end: 'bottom top' }), 0, 1);
    addAnchor(ScrollTrigger.create(desktop
      ? { trigger: dock, start: 'top top', end: () => '+=' + Math.round(window.innerHeight * 2.6), pin: true, pinSpacing: true, anticipatePin: 1 }
      : { trigger: dock, start: 'top top', end: 'bottom bottom' }), 1, 6);
    addAnchor(ScrollTrigger.create({ trigger: sections.pin, start: 'top bottom', end: 'bottom bottom' }), 6, 7);
    addAnchor(ScrollTrigger.create({ trigger: sections.gallery, start: 'top bottom', end: 'bottom bottom' }), 7, 8);
    addAnchor(ScrollTrigger.create({ trigger: sections.index, start: 'top bottom', end: 'bottom bottom' }), 8, 9);
    addAnchor(ScrollTrigger.create({ trigger: sections.metrics, start: 'top bottom', end: 'bottom bottom' }), 9, 10);
    addAnchor(ScrollTrigger.create({ trigger: sections.ext, start: 'top bottom', end: 'bottom bottom' }), 10, 11);
    ScrollTrigger.create({ trigger: journey, start: 'top bottom', end: 'bottom top', onToggle: self => setVisible(self.isActive) });
    return () => { anchors.length = 0; };
  }
  mm.add({ desktop: '(min-width: 761px)', mobile: '(max-width: 760px)' }, () => buildTriggers());

  function targetT() {
    const y = window.scrollY;
    if (!anchors.length) return 0;
    if (y <= anchors[0].st.start) return 0;
    for (const a of anchors) {
      if (y <= a.st.end) return lerp(a.T0, a.T1, clamp01((y - a.st.start) / Math.max(1, a.st.end - a.st.start)));
    }
    return 11;
  }

  // ================================================================== loop
  Tcur = targetT();
  function setVisible(v) { stageVisible = v; stageEl.classList.toggle('is-visible', v); updateVideos(); }
  const ro = new ResizeObserver(() => { needsResize = true; }); ro.observe(stageEl);
  window.addEventListener('resize', () => { needsResize = true; }, { passive: true });

  let lastDraw = 0, lastVideoDraw = 0, frameAvg = 16, lastDprChange = 0, slowGpu = false, skip = false, drewLast = false;
  function resize() {
    W = capW || stageEl.clientWidth; H = capH || stageEl.clientHeight;
    renderer.setPixelRatio(CAPTURE ? 1 : dpr); renderer.setSize(W, H, false);
    if (composer) { composer.setSize(W, H); }
    camera.aspect = W / H;
    camera.fov = W < H ? Math.min(62, 2 * Math.atan(Math.tan((34 * Math.PI / 180) / 2) * (1.5 / camera.aspect) * 0.75) * 180 / Math.PI) : 34;
    camera.updateProjectionMatrix();
    needsResize = false; Tdrawn = NaN;
  }

  let lastTime = performance.now();
  gsap.ticker.add(() => {
    const now = performance.now(); const dt = Math.min(0.1, (now - lastTime) / 1000); lastTime = now;
    if (!stageVisible) return;
    // adaptive resolution from the real frame interval after a drawn frame (covers GPU cost that CPU timing misses)
    if (drewLast) {
      drewLast = false;
      frameAvg = frameAvg * 0.8 + dt * 1000 * 0.2;
      if (frameAvg > 22 && dpr > 0.6 && now - lastDprChange > 350) { dpr = Math.max(0.6, dpr - 0.2); needsResize = true; lastDprChange = now; frameAvg = 17; }
      else if (frameAvg < 13 && dpr < Q.dpr && now - lastDprChange > 3000) { dpr = Math.min(Q.dpr, dpr + 0.1); needsResize = true; lastDprChange = now; }
      if (!slowGpu && dpr <= 0.8 && frameAvg > 21) slowGpu = true;
    }
    if (needsResize) resize();
    const target = targetT();
    Tcur += (target - Tcur) * (1 - Math.exp(-dt * 9));
    if (Math.abs(target - Tcur) < 0.0004) Tcur = target;
    if (Tcur === Tdrawn) {
      if (videoLive && now - lastVideoDraw > 66) { lastVideoDraw = now; renderer.render(scene, camera); }
      return;
    }
    if (now - lastDraw < (slowGpu ? 31 : 15.5)) return;
    lastDraw = now;
    draw();
    drewLast = true;
  });
  function draw() {
    const t0 = performance.now();
    if (needsResize) resize();
    bgMat.uniforms.uAspect.value = W / Math.max(1, H);
    tl.time(Tcur, false);
    apply(Tcur);
    cameraAt(Tcur);
    const mob = isMobile();
    camera.setViewOffset(W, H, mob ? 0 : -state.shift * W, mob ? H * 0.17 : 0, W, H);
    if (CAPTURE) {
      tmpV3.copy(camTarget); key.target.position.copy(tmpV3); key.position.copy(tmpV3).add(KEY_OFF); key.target.updateMatrixWorld();
    }
    renderFrame();
    updateLabels(Tcur, W, H);
    updateCaptions(Tcur);
    updateVideos();
    Tdrawn = Tcur;
    void t0;
  }

  document.addEventListener('visibilitychange', () => { if (document.hidden) videos.forEach(o => { o.v.pause(); o.playing = false; }); else updateVideos(); });
  window.addEventListener('load', () => ScrollTrigger.refresh());
  if (CAPTURE) {
    const NO_CAST = new Set([stream, bg, floor, doorGlow, scan, scanLine]);
    scene.traverse(o => { if (o.isMesh) { o.receiveShadow = true; o.castShadow = !NO_CAST.has(o); } });
    stageEl.classList.add('is-visible'); stageVisible = true;
    const out = document.createElement('canvas'); const octx = out.getContext('2d');
    const seek = (v, t) => new Promise(res => { const done = () => { v.removeEventListener('seeked', done); res(); }; v.addEventListener('seeked', done); v.currentTime = t; setTimeout(done, 3000); });
    const ready = v => v.readyState >= 2 ? Promise.resolve() : new Promise(res => { v.addEventListener('loadeddata', res, { once: true }); setTimeout(res, 8000); });
    window.__capture = async (T, outW, outH, ss = 1.5, q = 0.8) => {
      capW = Math.round(outW * ss); capH = Math.round(outH * ss); needsResize = true;
      tl.time(T, false); apply(T);
      for (const [i, o] of videos.entries()) {
        const a = (state[o.key] || 0) * o.max;
        if (a > 0.01) {
          if (!o.loaded) { o.v.preload = 'auto'; o.v.src = o.v.dataset.src; o.loaded = true; }
          await ready(o.v);
          await seek(o.v, (T * 2.2) % Math.max(0.1, (o.v.duration || 8) - 0.05));
          o.tex.needsUpdate = true;
        }
        void i;
      }
      Tcur = T; draw();
      out.width = outW; out.height = outH;
      octx.imageSmoothingEnabled = true; octx.imageSmoothingQuality = 'high';
      octx.drawImage(renderer.domElement, 0, 0, outW, outH);
      const url = out.toDataURL('image/webp', q);
      const labels = LABELS.map(l => {
        const a = fade(T, l.t[0], l.t[1], 0.08);
        if (a <= 0.001) return 0;
        proj.copy(l.at()).project(camera);
        if (!(proj.z < 1 && Math.abs(proj.x) < 1.1 && Math.abs(proj.y) < 1.1)) return 0;
        return [+a.toFixed(3), +(proj.x * 0.5 + 0.5).toFixed(4), +(-proj.y * 0.5 + 0.5).toFixed(4)];
      });
      return { url, labels, dim: +state.dim.toFixed(3) };
    };
    window.__captureLabels = LABELS.map(l => ({ k: l.k, v: l.v, side: l.side || '' }));
  }
  window.__journeyReady = true;
  window.__journey = {
    state, get T() { return Tcur; }, renderer, scene, camera,
    renderAt(T) { Tcur = T; draw(); },
    scrollFor(T) { const a = anchors.find(x => T >= x.T0 && T <= x.T1) || anchors[anchors.length - 1]; return a.st.start + (a.st.end - a.st.start) * clamp01((T - a.T0) / (a.T1 - a.T0)); },
  };
}
