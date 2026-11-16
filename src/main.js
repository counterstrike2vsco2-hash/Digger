// ДИГГЕР: БОМБАРЬ 3D — стелс от первого лица в заброшенном советском бомбоубежище.
import * as THREE from 'three';
import {
  MW, MH, WATER, EXIT, DOWN, G, LOOT, SPOTS, ROOM_TYPES, genLevel, findPath, castRay, los,
  isSolid, tileAt, dist, angDiff, clamp, pick, ri,
} from './level.js';
import { buildWorld, disposeWorld, S, WH } from './world.js';
import { M, labelTexture, beamTexture, glowTexture, setAniso } from './textures.js';
import { audioInit, SFX, noise as sndNoise } from './audio.js';
import { QP, QNAME, GPU, AUTO, PRESETS, setPreset, stdMat as qMat } from './quality.js';

const $ = id => document.getElementById(id);
const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
if (isTouch) document.body.classList.add('touch');

// ============================================================
//  Качество графики (выбирается при загрузке — см. quality.js)
// ============================================================
const Q = QP;

// ============================================================
//  Рендерер / сцена
// ============================================================
const renderer = new THREE.WebGLRenderer({ canvas: $('game'), antialias: Q.aa, powerPreference: 'high-performance', stencil: false });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = Q.lite ? 1.25 : 1.15;
renderer.shadowMap.enabled = Q.shadows;
renderer.shadowMap.type = Q.shadowSoft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
setAniso(renderer.capabilities.getMaxAnisotropy());

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
scene.fog = new THREE.FogExp2(0x020202, Q.far < 35 ? 0.068 : 0.06);

const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, Q.far);
camera.rotation.order = 'YXZ';
scene.add(camera);

// --- свет (количество источников фиксировано пресетом — каждый стоит дорого на слабой видеокарте)
const hemi = new THREE.HemisphereLight(0x3a4250, 0x0a0806, Q.lite ? 0.5 : 0.22);
scene.add(hemi);

const flashlight = new THREE.SpotLight(0xfff0d0, 0, Q.far, 0.46, Q.fill ? 0.5 : 0.8, 1.6);
flashlight.position.set(0.17, -0.16, -0.6); // у линзы, чтобы не засвечивать руку
const flTarget = new THREE.Object3D(); flTarget.position.set(0.08, -0.3, -7);
camera.add(flashlight, flTarget); flashlight.target = flTarget;
flashlight.castShadow = Q.shadows;
if (Q.shadows) {
  flashlight.shadow.mapSize.set(Q.shadowMap, Q.shadowMap);
  flashlight.shadow.camera.near = 0.2; flashlight.shadow.camera.far = 25;
  flashlight.shadow.bias = -0.0004; flashlight.shadow.normalBias = 0.03;
}

let fill = null; // отражённый свет фонаря
if (Q.fill) { fill = new THREE.PointLight(0xffe8c8, 0, 5, 2); camera.add(fill); fill.position.set(0, 0.2, -1.6); }

let moon = null; const moonTarget = new THREE.Object3D();
if (Q.moon) { moon = new THREE.SpotLight(0x8aa4ff, 0, 14, 0.75, 0.6, 1.4); scene.add(moon, moonTarget); moon.target = moonTarget; }

const lampPool = [], guardSpotPool = [];
for (let i = 0; i < Q.lamps; i++) { const l = new THREE.PointLight(0xff4020, 0, 10, 1.7); scene.add(l); lampPool.push(l); }
for (let i = 0; i < Q.guardSpots; i++) {
  const l = new THREE.SpotLight(0xfff2c8, 0, 18, 0.42, 0.5, 1.5); scene.add(l); scene.add(l.target); guardSpotPool.push(l);
}

// --- фонарь в руке (виден в кадре)
const handFL = new THREE.Group();
{
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.2, 12), M.darkMetal());
  body.rotation.x = Math.PI / 2; handFL.add(body);
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.024, 0.06, 14), M.darkMetal());
  head.rotation.x = Math.PI / 2; head.position.z = -0.12; handFL.add(head);
  handFL.lens = qMat({ color: 0x222222, emissive: 0xfff2c0, emissiveIntensity: 0 });
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.03, 14), handFL.lens); lens.position.z = -0.151; lens.rotation.y = Math.PI; handFL.add(lens);
  const glove = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.09), qMat({ color: 0x1a1a16, roughness: 1 }));
  glove.position.set(0.01, -0.02, 0.03); handFL.add(glove);
  handFL.scale.setScalar(0.75);
  handFL.position.set(0.17, -0.17, -0.42);
  camera.add(handFL);
}

// --- пыль в луче (только на средней/высокой)
let dust = null;
if (Q.dust) {
  const n = Q.dust, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - .5) * 12; pos[i * 3 + 1] = Math.random() * WH; pos[i * 3 + 2] = (Math.random() - .5) * 12; }
  const gm = new THREE.BufferGeometry();
  gm.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  gm.setAttribute('color', new THREE.BufferAttribute(col, 3));
  dust = new THREE.Points(gm, new THREE.PointsMaterial({ size: 0.025, map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  dust.frustumCulled = false;
  scene.add(dust);
}

// --- динамическое разрешение: держим ~55+ FPS, понижая/повышая внутреннее разрешение
const DR = { scale: Q.scaleStart, frames: 0, acc: 0, fps: 60, cooldown: 2, enabled: localStorage.getItem('digger3d_dr') !== '0' };
function applyScale() {
  const base = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(Math.max(0.35, base * DR.scale));
}
function updateDR(dt) {
  DR.frames++; DR.acc += dt;
  if (DR.acc < 1) return;
  DR.fps = DR.frames / DR.acc; DR.frames = 0; DR.acc = 0;
  const el = $('fps');
  if (el) el.textContent = `${Math.round(DR.fps)} FPS · ${Math.round(DR.scale * 100)}%`;
  if (!DR.enabled || G.state !== 'play') return;
  DR.cooldown--;
  if (DR.cooldown > 0) return;
  if (DR.fps < Q.targetFps - 8 && DR.scale > Q.scaleMin + 0.001) { DR.scale = Math.max(Q.scaleMin, DR.scale - (DR.fps < 35 ? 0.15 : 0.07)); applyScale(); DR.cooldown = 2; }
  else if (DR.fps > Q.targetFps + 3 && DR.scale < Q.scaleMax - 0.001) { DR.scale = Math.min(Q.scaleMax, DR.scale + 0.05); applyScale(); DR.cooldown = 3; }
}

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
}
window.addEventListener('resize', () => { applyScale(); resize(); });
applyScale(); resize();

// ============================================================
//  Модели: предметы, охрана, крысы
// ============================================================
const box = (w, h, d, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.castShadow = true; o.receiveShadow = true; return o; };
const cyl = (r1, r2, h, m, seg = 14) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), m); o.castShadow = true; o.receiveShadow = true; return o; };
const sph = (r, m) => { const o = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), m); o.castShadow = true; return o; };
const matCache = {};
const stdMat = (color, rough = 0.7, metal = 0, extra = {}) => { const k = [color, rough, metal, extra.emissive || 0].join(); return matCache[k] || (matCache[k] = qMat(Object.assign({ color, roughness: rough, metalness: metal }, extra))); };
const labelMat = (t, bg, fg) => matCache['l' + t] || (matCache['l' + t] = qMat({ map: labelTexture(t, bg, fg), roughness: 0.7 }));

function makeItem(type) {
  const g = new THREE.Group();
  switch (type) {
    case 'battery': {
      const lm = labelMat('КРОНА', '#d9b72c', '#111');
      for (let k = 0; k < 2; k++) { const b = box(0.1, 0.17, 0.06, [stdMat(0x222222), stdMat(0x222222), stdMat(0x999999, 0.3, 0.8), stdMat(0x222222), lm, lm]); b.position.set(k * 0.12 - 0.06, 0.085, 0); b.rotation.y = k * 0.3; g.add(b); }
      break;
    }
    case 'gasmask': {
      const rub = stdMat(0x55614f, 0.85);
      const face = sph(0.15, rub); face.scale.set(1, 1.15, 0.8); face.position.y = 0.13; g.add(face);
      for (const x of [-0.06, 0.06]) { const e = cyl(0.04, 0.04, 0.04, stdMat(0x9fc4cc, 0.05, 0.3, { emissive: 0x112222 }), 16); e.rotation.x = Math.PI / 2; e.position.set(x, 0.17, 0.11); g.add(e); }
      const fl = cyl(0.06, 0.06, 0.14, stdMat(0x2f4a35, 0.5, 0.4)); fl.position.set(0, 0.06, 0.16); fl.rotation.x = 1.2; g.add(fl);
      g.rotation.x = -0.6;
      break;
    }
    case 'dosimeter': {
      const dial = labelMat('ДП-5В', '#d9d4c0', '#8a1c14');
      const ol = stdMat(0x5d6a42, 0.6, 0.2);
      const db = box(0.3, 0.16, 0.18, [ol, ol, dial, ol, ol, ol]); db.position.y = 0.08; g.add(db);
      const h = box(0.2, 0.03, 0.03, M.black()); h.position.y = 0.19; g.add(h);
      break;
    }
    case 'sign': {
      const s = box(0.7, 0.35, 0.02, [M.greyMetal(), M.greyMetal(), M.greyMetal(), M.greyMetal(), labelMat('УБЕЖИЩЕ', '#1f5a2e', '#f0f0e0'), M.greyMetal()]);
      s.position.set(0, 0.17, 0); s.rotation.x = -0.35; g.add(s);
      break;
    }
    case 'journal': {
      const cov = labelMat('ЖУРНАЛ', '#6b3a22', '#e0d0a0');
      const j = box(0.22, 0.04, 0.3, [stdMat(0x6b3a22), stdMat(0x6b3a22), cov, stdMat(0xd8d0b0), stdMat(0x6b3a22), stdMat(0x6b3a22)]);
      j.position.y = 0.02; g.add(j);
      break;
    }
    case 'filter': {
      const f = cyl(0.1, 0.1, 0.22, M.filterGreen(), 18); f.position.y = 0.11; g.add(f);
      const c = cyl(0.04, 0.04, 0.05, M.steel()); c.position.y = 0.245; g.add(c);
      break;
    }
    case 'aid': {
      const lm = labelMat('АИ-2', '#e07a1f', '#fff');
      const a = box(0.2, 0.06, 0.14, [stdMat(0xe07a1f, 0.5), stdMat(0xe07a1f, 0.5), lm, stdMat(0xe07a1f, 0.5), stdMat(0xe07a1f, 0.5), stdMat(0xe07a1f, 0.5)]);
      a.position.y = 0.03; g.add(a);
      break;
    }
    case 'radio': {
      const ol = M.olive();
      const r = box(0.32, 0.36, 0.16, ol); r.position.y = 0.18; g.add(r);
      const ant = cyl(0.006, 0.01, 0.7, M.black(), 6); ant.position.set(0.12, 0.7, 0); ant.rotation.z = -0.15; g.add(ant);
      for (const x of [-0.08, 0.04]) { const k = cyl(0.025, 0.025, 0.03, M.black()); k.rotation.x = Math.PI / 2; k.position.set(x, 0.26, 0.09); g.add(k); }
      break;
    }
    case 'ozk': {
      const gr = stdMat(0x4b6b3a, 0.6);
      const b1 = box(0.45, 0.12, 0.32, gr); b1.position.y = 0.06; g.add(b1);
      const b2 = box(0.4, 0.1, 0.28, gr); b2.position.y = 0.17; b2.rotation.y = 0.2; g.add(b2);
      break;
    }
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xfff4c0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  glint.scale.set(0.35, 0.35, 1); glint.position.y = 0.35; g.add(glint); g.userData.glint = glint;
  return g;
}

function makeGuard() {
  const g = new THREE.Group(); // смотрит вдоль +X
  const cloth = M.guardCloth(), black = M.black(), skin = M.skin();
  const legL = new THREE.Group(), legR = new THREE.Group();
  for (const [leg, z] of [[legL, -0.11], [legR, 0.11]]) {
    const l = box(0.14, 0.82, 0.15, cloth); l.position.y = -0.41; leg.add(l);
    const boot = box(0.26, 0.1, 0.15, black); boot.position.set(0.05, -0.83, 0); leg.add(boot);
    leg.position.set(0, 0.88, z); g.add(leg);
  }
  const torso = box(0.28, 0.62, 0.48, cloth); torso.position.y = 1.2; g.add(torso);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.2), qMat({ map: labelTexture('ОХРАНА', '#1b2433', '#e8c547', 256, 128, 'bold 52px sans-serif'), roughness: 0.9 }));
  back.position.set(-0.141, 1.32, 0); back.rotation.y = -Math.PI / 2; g.add(back);
  const belt = box(0.3, 0.06, 0.5, black); belt.position.y = 0.92; g.add(belt);
  const head = sph(0.13, skin); head.position.y = 1.66; g.add(head);
  const cap = cyl(0.14, 0.14, 0.08, black, 16); cap.position.y = 1.76; g.add(cap);
  const visor = box(0.12, 0.02, 0.22, black); visor.position.set(0.12, 1.73, 0); g.add(visor);
  const armL = new THREE.Group(); const al = box(0.12, 0.6, 0.12, cloth); al.position.y = -0.3; armL.add(al); armL.position.set(0, 1.48, -0.3); g.add(armL);
  const armR = new THREE.Group(); const ar = box(0.12, 0.55, 0.12, cloth); ar.position.y = -0.27; armR.add(ar);
  const fl = cyl(0.03, 0.03, 0.22, M.darkMetal()); fl.position.set(0, -0.58, 0); armR.add(fl);
  armR.position.set(0, 1.48, 0.3); armR.rotation.z = Math.PI / 2 - 0.15; g.add(armR);
  // видимый луч
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 0.04, 7, Q.beamSeg, 1, true),
    new THREE.MeshBasicMaterial({ map: beamTexture(), color: 0xfff0c0, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  beam.rotation.z = -Math.PI / 2; beam.position.set(0.55 + 3.5, 1.4, 0.3);
  g.add(beam);
  const lensGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xfff0c0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  lensGlow.scale.set(0.5, 0.5, 1); lensGlow.position.set(0.6, 1.45, 0.3); g.add(lensGlow);
  g.userData = { legL, legR, armL, beam, lensGlow, head };
  return g;
}

function makeRat() {
  const g = new THREE.Group();
  const body = sph(0.08, M.rat()); body.scale.set(1.6, 0.8, 0.9); body.position.y = 0.07; g.add(body);
  const head = sph(0.05, M.rat()); head.scale.set(1.4, 0.9, 0.9); head.position.set(0.14, 0.07, 0); g.add(head);
  const tail = cyl(0.008, 0.004, 0.26, M.ratTail(), 5); tail.rotation.z = Math.PI / 2; tail.position.set(-0.24, 0.04, 0); g.add(tail);
  for (const z of [-0.025, 0.025]) { const e = sph(0.008, stdMat(0x000000, 0.1, 0, { emissive: 0x330000 })); e.position.set(0.2, 0.09, z); g.add(e); }
  return g;
}

// ============================================================
//  Состояние
// ============================================================
let world = null;
const ents = new THREE.Group(); scene.add(ents);
const P = { x: 0, y: 0, yaw: 0, pitch: 0, a: 0, light: true, battery: 100, stepT: 0, bob: 0, moving: false, running: false, crouch: false, r: 0.22, eyeY: 1.62 };
let caughtBy = null, caughtT = 0, lampTimer = 0, exploreTimer = 0, miniTimer = 0;

const w = v => v * S; // тайлы → метры

// ============================================================
//  Ввод
// ============================================================
const keys = {};
const input = { joyX: 0, joyY: 0, run: false, crouch: false, locked: false };
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
  if (G.state === 'play') {
    if (e.code === 'KeyF') toggleLight();
    if (e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter') interact();
    if (e.code === 'KeyM') G.showMap = !G.showMap;
    if (e.code === 'Backquote') { fpsBox.checked = !fpsBox.checked; showFps(fpsBox.checked); }
    if (e.code === 'KeyC' || e.code === 'ControlLeft') input.crouch = !input.crouch;
    if (e.code === 'KeyP' || (e.code === 'Escape' && isTouch)) pauseGame();
  } else if (G.state === 'pause' && e.code === 'KeyP') resumeGame();
  else if (G.state === 'menu' && e.code === 'Enter') startRun();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; if (G.state === 'play') pauseGame(); });

const cvs = $('game');
cvs.addEventListener('click', () => {
  if (isTouch || G.state !== 'play') return;
  if (!input.locked) { cvs.requestPointerLock?.(); return; }
  interact();
});
document.addEventListener('pointerlockchange', () => {
  input.locked = document.pointerLockElement === cvs;
  $('lockHint').classList.toggle('hidden', input.locked || isTouch || G.state !== 'play');
  if (!input.locked && G.state === 'play' && !isTouch) pauseGame();
});
document.addEventListener('mousemove', e => {
  if (!input.locked || G.state !== 'play') return;
  const sens = 0.0022 * (+localStorage.getItem('digger3d_sens') || 1);
  P.yaw -= e.movementX * sens; P.pitch -= e.movementY * sens;
  P.pitch = clamp(P.pitch, -1.35, 1.35);
});

// --- тач: джойстик слева, обзор пальцем справа
const joy = { id: null, ox: 0, oy: 0 }, look = { id: null, x: 0, y: 0 };
const joyBase = $('joyBase'), joyKnob = $('joyKnob');
window.addEventListener('touchstart', e => {
  if (G.state !== 'play') return;
  for (const t of e.changedTouches) {
    if (t.target.tagName === 'BUTTON') continue;
    if (joy.id === null && t.clientX < innerWidth * 0.45) {
      joy.id = t.identifier; joy.ox = t.clientX; joy.oy = t.clientY;
      joyBase.style.left = (t.clientX - 65) + 'px'; joyBase.style.top = (t.clientY - 65) + 'px'; joyBase.style.bottom = 'auto'; joyBase.style.opacity = 1;
    } else if (look.id === null) { look.id = t.identifier; look.x = t.clientX; look.y = t.clientY; }
  }
  e.preventDefault();
}, { passive: false });
window.addEventListener('touchmove', e => {
  for (const t of e.changedTouches) {
    if (t.identifier === joy.id) {
      let dx = t.clientX - joy.ox, dy = t.clientY - joy.oy; const l = Math.hypot(dx, dy), m = 50;
      if (l > m) { dx = dx / l * m; dy = dy / l * m; }
      input.joyX = dx / m; input.joyY = dy / m;
      joyKnob.style.left = (37 + dx) + 'px'; joyKnob.style.top = (37 + dy) + 'px';
    } else if (t.identifier === look.id) {
      P.yaw -= (t.clientX - look.x) * 0.006; P.pitch -= (t.clientY - look.y) * 0.006;
      P.pitch = clamp(P.pitch, -1.3, 1.3); look.x = t.clientX; look.y = t.clientY;
    }
  }
  if (G.state === 'play') e.preventDefault();
}, { passive: false });
function touchEnd(e) {
  for (const t of e.changedTouches) {
    if (t.identifier === joy.id) { joy.id = null; input.joyX = input.joyY = 0; joyKnob.style.left = joyKnob.style.top = '37px'; joyBase.style.opacity = 0.6; }
    if (t.identifier === look.id) look.id = null;
  }
}
window.addEventListener('touchend', touchEnd); window.addEventListener('touchcancel', touchEnd);
function bindBtn(id, down, up) {
  const el = $(id);
  el.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); audioInit(); down(el); }, { passive: false });
  el.addEventListener('touchend', e => { e.preventDefault(); up && up(el); }, { passive: false });
  el.addEventListener('mousedown', e => { e.stopPropagation(); down(el); });
  el.addEventListener('mouseup', () => up && up(el));
}
bindBtn('btnRun', el => { input.run = true; el.classList.add('on'); }, el => { input.run = false; el.classList.remove('on'); });
bindBtn('btnAct', () => interact());
bindBtn('btnLight', () => toggleLight());
bindBtn('btnCrouch', el => { input.crouch = !input.crouch; el.classList.toggle('on', input.crouch); });
bindBtn('btnMap', () => { G.showMap = !G.showMap; });
bindBtn('btnPause', () => pauseGame());

// ============================================================
//  UI
// ============================================================
const ui = { hud: $('hud'), level: $('hLevel'), batFill: $('batFill'), batTxt: $('batTxt'), score: $('hScore'), photo: $('hPhoto'), room: $('roomName'), prompt: $('prompt'), log: $('log'), touch: $('touch'), mini: $('minimap'), red: $('redOverlay'), flash: $('flashOverlay'), stance: $('hStance') };
const miniCtx = ui.mini.getContext('2d');
function msg(text, cls = '') {
  const d = document.createElement('div'); d.textContent = text; if (cls) d.className = cls;
  ui.log.appendChild(d);
  while (ui.log.children.length > 5) ui.log.removeChild(ui.log.firstChild);
  setTimeout(() => { d.style.transition = 'opacity .6s'; d.style.opacity = 0; setTimeout(() => d.remove(), 650); }, 4200);
}
const setText = (el, t) => { if (el.textContent !== t) el.textContent = t; };
function showBest() {
  const b = +(localStorage.getItem('digger_best') || 0), d = +(localStorage.getItem('digger_depth') || 0);
  $('best').textContent = b ? `Рекорд: ${b} респекта · глубже всего: ярус −${d}` : '';
}
showBest();
// --- меню графики
document.querySelectorAll('#quality button').forEach(b => {
  b.classList.toggle('on', AUTO ? b.dataset.q === 'auto' : b.dataset.q === QNAME);
  if (b.dataset.q === 'auto' && AUTO) b.textContent = `Авто: ${PRESETS[QNAME].label}`;
  b.addEventListener('click', () => setPreset(b.dataset.q));
});
$('gpuInfo').textContent = (GPU ? 'Видеокарта: ' + GPU.replace(/^ANGLE \(|\)$/g, '').replace(/ Direct3D.*$/, '').slice(0, 70) : 'Видеокарта не определена') + ` → пресет «${PRESETS[QNAME].label}»`;
const drBox = $('optDR'), fpsBox = $('optFPS');
drBox.checked = DR.enabled; drBox.addEventListener('change', () => { DR.enabled = drBox.checked; localStorage.setItem('digger3d_dr', DR.enabled ? '1' : '0'); if (!DR.enabled) { DR.scale = Math.min(1, Q.scaleMax); applyScale(); } });
const showFps = v => { $('fps').classList.toggle('hidden', !v); localStorage.setItem('digger3d_fps', v ? '1' : '0'); };
fpsBox.checked = localStorage.getItem('digger3d_fps') !== '0'; showFps(fpsBox.checked);
fpsBox.addEventListener('change', () => showFps(fpsBox.checked));

// ============================================================
//  Уровень
// ============================================================
function clearEntities() {
  while (ents.children.length) {
    const o = ents.children.pop();
    o.traverse(c => { if (c.geometry) c.geometry.dispose(); });
  }
}
function enterLevel(first) {
  G.state = 'trans';
  const tr = $('trans');
  $('transText').innerHTML = first ? 'ЛЕЗЕШЬ В ВЕНТШАХТУ…<br><small>ЯРУС −1</small>' : `СПУСКАЕШЬСЯ НИЖЕ…<br><small>ЯРУС −${G.level}</small>`;
  tr.classList.remove('hidden'); tr.style.animation = 'none'; void tr.offsetWidth; tr.style.animation = '';
  setTimeout(() => {
    disposeWorld(world, scene); clearEntities();
    genLevel(G.level);
    world = buildWorld(scene);
    // предметы
    for (const it of G.items) {
      const m = makeItem(it.type); m.position.set(w(it.x), tileAt(it.x, it.y) === WATER ? 0.04 : 0, w(it.y)); m.rotation.y = Math.random() * 6;
      it.mesh = m; ents.add(m);
    }
    for (const g of G.guards) { g.mesh = makeGuard(); g.walk = 0; ents.add(g.mesh); }
    for (const r of G.rats) { r.mesh = makeRat(); ents.add(r.mesh); }
    // игрок у люка
    P.x = G.exit.x + 0.5; P.y = G.exit.y + 0.5;
    for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) if (!isSolid(G.exit.x + dx, G.exit.y + dy)) { P.x += dx * 0.9; P.y += dy * 0.9; break; }
    // смотрим в сторону от люка, к центру комнаты
    const r0 = G.rooms[0];
    P.yaw = Math.atan2(-(r0.cx + 0.5 - P.x + 0.001), -(r0.cy + 2.5 - P.y));
    P.pitch = 0; P.light = P.battery > 0;
    // лунный свет
    if (moon) { moon.position.set(w(G.exit.x + 0.5), WH + 3.5, w(G.exit.y + 0.5)); moonTarget.position.set(w(G.exit.x + 0.5), 0, w(G.exit.y + 0.5)); moon.intensity = 60; }
    for (const L of G.lamps) L.on = true;
    G.curZone = -2; G.chaseT = 0; G.flash = 0; caughtBy = null;
    ui.log.innerHTML = '';
    lampTimer = 0;
    renderer.compile(scene, camera);
  }, 350);
  ui.hud.classList.remove('hidden');
  if (isTouch) ui.touch.classList.remove('hidden');
  setTimeout(() => {
    if (G.state !== 'trans') return;
    G.state = 'play';
    if (!isTouch && !input.locked) $('lockHint').classList.remove('hidden');
    if (first) {
      msg('Ты пролез в бомбарь. Ищи хабар и не попадись ЧОПу.', 'info');
      msg(isTouch ? 'Слева — идти, справа — смотреть. Кнопки: бег, фото, фонарь, присесть.' : 'WASD — идти, мышь — смотреть, Shift — бег, C — присесть, F — фонарь, E — фото.', 'info');
    } else msg(`Ярус −${G.level}. Охраны тут больше: ${G.guards.length} чел.`, 'bad');
  }, 1300);
  setTimeout(() => tr.classList.add('hidden'), 1900);
}

function startRun() {
  audioInit();
  G.level = 1; G.lootScore = 0; G.photoScore = 0; G.photos = 0; G.bag = []; P.battery = 100; input.crouch = false;
  $('menu').classList.add('hidden'); $('end').classList.add('hidden');
  if (!isTouch) cvs.requestPointerLock?.();
  enterLevel(true);
}
function pauseGame() {
  if (G.state !== 'play') return;
  G.state = 'pause'; $('pause').classList.remove('hidden'); $('lockHint').classList.add('hidden');
  if (document.pointerLockElement) document.exitPointerLock();
}
function resumeGame() {
  if (G.state !== 'pause') return;
  G.state = 'play'; $('pause').classList.add('hidden'); audioInit();
  if (!isTouch) cvs.requestPointerLock?.();
}
$('btnStart').addEventListener('click', startRun);
$('btnAgain').addEventListener('click', () => { $('end').classList.add('hidden'); startRun(); });
$('btnMenu').addEventListener('click', () => { $('end').classList.add('hidden'); $('menu').classList.remove('hidden'); G.state = 'menu'; showBest(); });
$('btnResume').addEventListener('click', resumeGame);
$('btnQuit').addEventListener('click', () => { $('pause').classList.add('hidden'); G.state = 'play'; endRun(false); });

function endRun(caught) {
  G.state = 'end';
  if (document.pointerLockElement) document.exitPointerLock();
  ui.hud.classList.add('hidden'); ui.prompt.classList.add('hidden'); ui.touch.classList.add('hidden'); $('lockHint').classList.add('hidden');
  ui.red.style.opacity = 0;
  const total = caught ? G.photoScore : G.photoScore + G.lootScore;
  const prevBest = +(localStorage.getItem('digger_best') || 0);
  if (total > prevBest) localStorage.setItem('digger_best', total);
  if (G.level > +(localStorage.getItem('digger_depth') || 0)) localStorage.setItem('digger_depth', G.level);
  if (caught) {
    SFX.caught();
    $('endTitle').textContent = 'ПОВЯЗАЛИ'; $('endTitle').style.color = '#e04b3a';
    $('endText').textContent = pick([
      'ЧОП скрутил тебя прямо у гермодвери. Весь хабар изъят «до выяснения». Хорошо хоть фотки успели улететь в облако.',
      'Охранник Михалыч светит тебе в лицо: «Ну что, сталкер, приехали». Хабар конфискован, фотки остались.',
      'Тебя вывели наверх под руки и сдали участковому. Хабар — в каморку ЧОПа. Зато фотки — твои.',
    ]);
  } else {
    SFX.win();
    $('endTitle').textContent = 'ВЫЛАЗКА УДАЛАСЬ'; $('endTitle').style.color = '#e8c547';
    $('endText').textContent = G.bag.length || G.photos
      ? 'Ты вылез через люк в рассветный туман. Рюкзак приятно оттягивает плечи. Пост в паблик диггеров обеспечен.'
      : 'Ты вылез ни с чем. Ну хоть воздухом бомбаря подышал.';
  }
  $('endStats').innerHTML = `Глубина: ярус −${G.level}<br>Хабар: ${caught ? '<s>' + G.lootScore + '</s> 0' : G.lootScore} · Фото: ${G.photos} шт. (+${G.photoScore})<br><b>ИТОГО: ${total} респекта</b>` + (total > prevBest && total > 0 ? '<br>🏆 НОВЫЙ РЕКОРД!' : '');
  const counts = {}; for (const b of G.bag) counts[b] = (counts[b] || 0) + 1;
  const list = Object.entries(counts).map(([k, v]) => `${k}${v > 1 ? ' ×' + v : ''}`);
  $('endBag').innerHTML = list.length ? (caught ? 'Изъято: ' : 'В рюкзаке: ') + list.join(' · ') : '';
  $('end').classList.remove('hidden');
}

// ============================================================
//  Действия
// ============================================================
function toggleLight() {
  if (!P.light && P.battery <= 0) { SFX.empty(); msg('Батарейки сели. Ищи новые!', 'bad'); return; }
  P.light = !P.light; SFX.click();
}
const levelMult = () => 1 + 0.35 * (G.level - 1);
function nearestAction() {
  if (dist(P.x, P.y, G.exit.x + 0.5, G.exit.y + 0.5) < 0.95) return { kind: 'exit' };
  if (dist(P.x, P.y, G.down.x + 0.5, G.down.y + 0.5) < 1.25) return { kind: 'down' };
  let best = null, bd = 2.3;
  for (const s of G.spots) {
    if (s.taken) continue;
    const d = dist(P.x, P.y, s.px, s.py);
    if (d > bd) continue;
    const ang = Math.atan2(s.py - P.y, s.px - P.x);
    if (Math.abs(angDiff(P.a, ang)) > 0.75) continue;
    if (!los(P.x, P.y, s.px, s.py + 0.05)) continue;
    bd = d; best = s;
  }
  return best ? { kind: 'photo', spot: best } : null;
}
function interact() {
  if (G.state !== 'play') return;
  const a = nearestAction(); if (!a) return;
  if (a.kind === 'exit') endRun(false);
  else if (a.kind === 'down') { G.level++; SFX.descend(); enterLevel(false); }
  else {
    const s = a.spot, info = SPOTS[s.kind]; s.taken = true;
    const pts = Math.round(info.pts * levelMult());
    G.photoScore += pts; G.photos++;
    G.flash = 1; SFX.shutter();
    ui.flash.style.transition = 'none'; ui.flash.style.opacity = 0.85; void ui.flash.offsetWidth; ui.flash.style.transition = 'opacity .45s'; ui.flash.style.opacity = 0;
    msg(`📷 Сфоткал: ${info.name} (+${pts})`, 'good');
    for (const g of G.guards) {
      const d = dist(g.x, g.y, P.x, P.y);
      if (d < 12 && los(g.x, g.y, P.x, P.y)) { g.susp = Math.max(g.susp, 0.75); investigate(g, P.x, P.y, 4); }
    }
    makeNoise(P.x, P.y, 4);
  }
}
function makeNoise(x, y, radius) {
  for (const g of G.guards) {
    if (g.state === 'chase') continue;
    if (dist(g.x, g.y, x, y) < radius) { g.susp = Math.max(g.susp, 0.35); investigate(g, x, y, 3.5); }
  }
}
function investigate(g, x, y, t) {
  if (g.state === 'chase') return;
  if (g.state !== 'investigate') SFX.huh();
  g.state = 'investigate'; g.tx = x; g.ty = y; g.timer = t;
  g.path = findPath(g.x, g.y, x, y);
}
const canStand = (x, y, r) => !isSolid(Math.floor(x - r), Math.floor(y - r)) && !isSolid(Math.floor(x + r), Math.floor(y - r)) && !isSolid(Math.floor(x - r), Math.floor(y + r)) && !isSolid(Math.floor(x + r), Math.floor(y + r));

// ============================================================
//  Обновление
// ============================================================
function update(dt) {
  G.time += dt;
  P.a = Math.atan2(-Math.cos(P.yaw), -Math.sin(P.yaw));

  if (caughtBy) { // анимация поимки
    caughtT += dt;
    const g = caughtBy, target = Math.atan2(-(w(g.x) - w(P.x)), -(w(g.y) - w(P.y)));
    P.yaw += angDiff(P.yaw, target) * Math.min(1, dt * 6); P.pitch += (0.1 - P.pitch) * Math.min(1, dt * 5);
    G.shake = 0.3;
    if (caughtT > 1.3) { caughtBy = null; endRun(true); }
    return;
  }

  // --- движение
  let f = 0, s = 0;
  if (keys.KeyW || keys.ArrowUp) f += 1;
  if (keys.KeyS || keys.ArrowDown) f -= 1;
  if (keys.KeyA) s -= 1;
  if (keys.KeyD) s += 1;
  if (keys.ArrowLeft) P.yaw += dt * 2.2;
  if (keys.ArrowRight) P.yaw -= dt * 2.2;
  if (input.joyX || input.joyY) { f = -input.joyY; s = input.joyX; }
  let len = Math.hypot(f, s); if (len > 1) { f /= len; s /= len; len = 1; }
  const moving = len > 0.15;
  P.crouch = input.crouch;
  const running = moving && !P.crouch && (keys.ShiftLeft || keys.ShiftRight || input.run);
  const inWater = tileAt(P.x, P.y) === WATER;
  let sp = (running ? 2.7 : P.crouch ? 0.8 : 1.55) * ((input.joyX || input.joyY) ? Math.max(len, 0.45) : 1);
  if (inWater) sp *= 0.65;
  const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
  if (moving) {
    const mx = (fx * f + rx * s), my = (fz * f + rz * s);
    const nx = P.x + mx * sp * dt; if (canStand(nx, P.y, P.r)) P.x = nx;
    const ny = P.y + my * sp * dt; if (canStand(P.x, ny, P.r)) P.y = ny;
  }
  P.moving = moving; P.running = running;

  // --- шаги / шум
  if (moving) {
    P.bob += dt * sp * 5.2;
    P.stepT -= dt * sp;
    if (P.stepT <= 0) {
      P.stepT = 0.42;
      if (!P.crouch || inWater) SFX.step(running, inWater);
      const r = running ? (inWater ? 8 : 6.5) : P.crouch ? (inWater ? 1.5 : 0) : (inWater ? 3 : 1.2);
      if (r > 0) makeNoise(P.x, P.y, r);
    }
  }
  const eyeTarget = P.crouch ? 1.0 : 1.62;
  P.eyeY += (eyeTarget - P.eyeY) * Math.min(1, dt * 8);

  // --- батарейка
  if (P.light) {
    P.battery -= dt * (0.55 + G.level * 0.06);
    if (P.battery <= 0) { P.battery = 0; P.light = false; SFX.empty(); msg('Фонарь погас! Нужны батарейки.', 'bad'); }
  }

  // --- подбор
  for (let i = G.items.length - 1; i >= 0; i--) {
    const it = G.items[i];
    if (dist(it.x, it.y, P.x, P.y) < 0.55) {
      G.items.splice(i, 1); ents.remove(it.mesh);
      if (it.type === 'battery') {
        P.battery = Math.min(100, P.battery + 45); SFX.battery(); msg('🔋 Батарейки «Крона» — фонарь +45%', 'good');
      } else {
        const L = LOOT[it.type], pts = Math.round(L.pts * levelMult());
        G.lootScore += pts; G.bag.push(L.name); SFX.pickup(); msg(`🎒 Хабар: ${L.name} (+${pts})`, 'good');
      }
    }
  }

  // --- охрана, крысы
  let anyChase = false;
  for (const g of G.guards) { updateGuard(g, dt); if (g.state === 'chase') anyChase = true; if (caughtBy || G.state !== 'play') return; }
  for (const r of G.rats) updateRat(r, dt);

  // --- эффекты
  G.flash = Math.max(0, G.flash - dt * 3.5);
  G.shake = Math.max(0, (G.shake || 0) - dt * 1.5);
  for (const L of G.lamps) if (L.broken) { L.t = (L.t || 0) - dt; if (L.t <= 0) { L.on = !L.on; L.t = L.on ? 0.2 + Math.random() * 2.5 : 0.03 + Math.random() * 0.25; } }
  if (anyChase) { G.heartT = (G.heartT || 0) - dt; if (G.heartT <= 0) { SFX.heart(); G.heartT = 0.55; } }
  G.chaseT = anyChase ? Math.min(1, G.chaseT + dt * 2) : Math.max(0, G.chaseT - dt);
  G.dripT = (G.dripT || 2) - dt;
  if (G.dripT <= 0) { SFX.drip(Math.random() * 1.6 - 0.8); G.dripT = 1.5 + Math.random() * 5; }

  // --- разведанная карта
  exploreTimer -= dt;
  if (exploreTimer <= 0) {
    exploreTimer = 0.1;
    const R = P.light ? 9 : 2.5;
    for (let k = 0; k <= 24; k++) castRay(P.x, P.y, P.a - 0.65 + 1.3 * k / 24, R, true);
    for (let k = 0; k < 16; k++) castRay(P.x, P.y, k / 16 * Math.PI * 2, 1.6, true);
  }

  // --- комната
  const z = G.zone[Math.floor(P.y) * MW + Math.floor(P.x)];
  if (z !== G.curZone) { G.curZone = z; setText(ui.room, z >= 0 ? '▸ ' + ROOM_TYPES[G.rooms[z].type].name : '▸ Коридор'); }

  // --- подсказка
  const a = nearestAction(), key = isTouch ? '📷' : 'E';
  let pt = '';
  if (a) pt = a.kind === 'exit' ? `${key} — вылезти наружу (закончить вылазку)` : a.kind === 'down' ? `${key} — спуститься на ярус −${G.level + 1}` : `${key} — сфоткать: ${SPOTS[a.spot.kind].name}`;
  if (pt) { setText(ui.prompt, pt); ui.prompt.classList.remove('hidden'); } else ui.prompt.classList.add('hidden');

  // --- HUD
  setText(ui.level, `ЯРУС −${G.level}`);
  ui.batFill.style.width = P.battery.toFixed(1) + '%';
  ui.batFill.style.background = P.battery < 20 ? '#e04b3a' : P.battery < 45 ? '#e8c547' : '#9fd36a';
  setText(ui.batTxt, Math.ceil(P.battery) + '%');
  setText(ui.score, `Хабар: ${G.lootScore} · ${G.bag.length} шт.`);
  setText(ui.photo, `Фото: ${G.photos} (+${G.photoScore})`);
  setText(ui.stance, P.crouch ? '🧎 крадёшься' : running ? '🏃 бежишь — шумно!' : '');
  if (isTouch) $('btnLight').classList.toggle('on', P.light);
}

function updateGuard(g, dt) {
  const dx = P.x - g.x, dy = P.y - g.y, d = Math.hypot(dx, dy), angTo = Math.atan2(dy, dx);
  let range = P.light ? 8.5 : 4;
  if (P.crouch) range *= 0.65;
  let sees = false;
  if (d < 14) {
    const inCone = Math.abs(angDiff(g.a, angTo)) < 0.6;
    let cond = d < (P.crouch ? 0.9 : 1.2) || (inCone && d < range) || (P.light && d < 2.6);
    if (!cond && P.light && d < 9 && Math.abs(angDiff(P.a, angTo + Math.PI)) < 0.45) cond = true; // светишь в лицо
    if (cond) sees = los(g.x, g.y, P.x, P.y);
  }
  g.sees = sees;
  if (sees) {
    const rate = d < 2 ? 3 : 0.75 + 2.1 * (1 - Math.min(d, range) / range);
    g.susp = Math.min(1.2, g.susp + rate * dt * (P.running ? 1.4 : 1));
    g.lastX = P.x; g.lastY = P.y;
  } else if (g.state !== 'chase') g.susp = Math.max(0, g.susp - dt * 0.18);

  if (sees && g.susp >= 1 && g.state !== 'chase') {
    g.state = 'chase'; g.repath = 0; g.lost = 0; SFX.alert(); G.shake = 0.25;
    msg(pick(['«Стоять! Охрана!»', '«Эй, ты! А ну стой!»', '«Опять диггеры, мать их!»', '«Стой, стрелять буду!» (не будет)']), 'bad');
  } else if (sees && g.state === 'patrol' && g.susp > 0.3) investigate(g, P.x, P.y, 3);
  else if (sees && g.state === 'investigate') {
    g.retarget = (g.retarget || 0) - dt;
    if (g.retarget <= 0) { g.retarget = 0.6; g.timer = 3; g.path = findPath(g.x, g.y, P.x, P.y); }
  }

  let speed = 0.85 + G.level * 0.04, targetAng = null;
  if (g.state === 'chase') {
    speed = 2.2 + G.level * 0.06;
    g.repath -= dt;
    if (sees) {
      g.lost = 0;
      if (g.repath <= 0) { g.path = findPath(g.x, g.y, P.x, P.y); g.repath = 0.3; }
      targetAng = angTo;
      if (!g.path.length) { g.x += Math.cos(angTo) * speed * dt; g.y += Math.sin(angTo) * speed * dt; }
    } else {
      g.lost += dt;
      if (g.repath <= 0) { g.path = findPath(g.x, g.y, g.lastX, g.lastY); g.repath = 1; }
      if ((!g.path.length && g.lost > 0.5) || g.lost > 7) {
        g.state = 'investigate'; g.timer = 4; g.susp = 0.7; g.path = []; g.lookBase = g.a;
        msg('Охранник потерял тебя из виду…', 'info');
      }
    }
  } else if (g.state === 'investigate') {
    speed = 1.25 + G.level * 0.05;
    if (!g.path.length) { g.timer -= dt; if (g.timer <= 0) { g.state = 'patrol'; g.wait = 1; g.susp = Math.min(g.susp, 0.25); } }
  } else if (!g.path.length) {
    g.wait -= dt;
    if (g.wait <= 0) {
      const r = pick(G.rooms);
      g.path = findPath(g.x, g.y, r.cx + ri(-1, 1) + 0.5, r.cy + ri(-1, 1) + 0.5);
      if (!g.path.length) g.path = findPath(g.x, g.y, r.cx + 0.5, r.cy + 1.5);
      g.wait = 1 + Math.random() * 2.5; g.lookBase = g.a;
    }
  }

  let moved = false;
  if (g.path.length) {
    const [tx, ty] = g.path[0], cx = tx + 0.5, cy = ty + 0.5;
    const ddx = cx - g.x, ddy = cy - g.y, dd = Math.hypot(ddx, ddy);
    const step = speed * dt * (tileAt(g.x, g.y) === WATER ? 0.7 : 1);
    if (dd <= step) { g.x = cx; g.y = cy; g.path.shift(); } else { g.x += ddx / dd * step; g.y += ddy / dd * step; }
    if (targetAng === null && dd > 0.01) targetAng = Math.atan2(ddy, ddx);
    moved = true; g.lookBase = targetAng;
    g.walk += dt * speed * 6;
    g.stepT = (g.stepT || 0) - dt * speed;
    if (g.stepT <= 0) {
      g.stepT = 0.45;
      if (d < 10) {
        const v = (1 - d / 10) * (g.state === 'chase' ? 0.16 : 0.08);
        sndNoise(0.07, { vol: Math.max(0.004, v), freq: 240, q: 0.9, pan: Math.sin(angDiff(P.a, angTo + Math.PI)) });
      }
    }
  }
  if (targetAng === null) targetAng = g.lookBase + Math.sin(G.time * 1.3 + g.seed) * 1.1;
  const rot = g.state === 'chase' ? 8 : moved ? 4.5 : 2;
  g.a += clamp(angDiff(g.a, targetAng), -rot * dt, rot * dt);

  if (d < 0.5) { caughtBy = g; caughtT = 0; SFX.alert(); msg('«Попался, голубчик!»', 'bad'); }
}

function updateRat(r, dt) {
  const d = dist(r.x, r.y, P.x, P.y);
  r.cd -= dt;
  if (d < 2.2) {
    r.a = Math.atan2(r.y - P.y, r.x - P.x) + (Math.random() - 0.5) * 0.8; r.sp = 2.4;
    if (r.cd <= 0) {
      r.cd = 5; SFX.squeak(Math.sin(angDiff(P.a, Math.atan2(r.y - P.y, r.x - P.x)))); makeNoise(r.x, r.y, 5);
      if (Math.random() < 0.3) msg('Пи-пи! Крыса разбежалась — шумно…', 'info');
    }
  } else {
    r.t -= dt;
    if (r.t <= 0) { r.t = 0.5 + Math.random() * 2; r.sp = Math.random() < 0.4 ? 0 : 0.6 + Math.random() * 0.6; r.a = Math.random() * 6.28; }
  }
  if (r.sp > 0) {
    const nx = r.x + Math.cos(r.a) * r.sp * dt, ny = r.y + Math.sin(r.a) * r.sp * dt;
    if (canStand(nx, r.y, 0.1)) r.x = nx; else r.a = Math.PI - r.a;
    if (canStand(r.x, ny, 0.1)) r.y = ny; else r.a = -r.a;
  }
}

// ============================================================
//  Синхронизация 3D
// ============================================================
const tmpV = new THREE.Vector3(), camFwd = new THREE.Vector3();
function sync3D(dt) {
  // камера
  const bobA = P.moving ? (P.running ? 0.06 : 0.035) : 0;
  const sh = (G.shake || 0) * 0.08;
  camera.position.set(w(P.x) + (Math.random() - .5) * sh, P.eyeY + Math.sin(P.bob) * bobA + (Math.random() - .5) * sh, w(P.y));
  camera.rotation.set(P.pitch, P.yaw + Math.cos(P.bob * 0.5) * bobA * 0.15, 0);
  const fovT = P.running ? 80 : 72;
  if (Math.abs(camera.fov - fovT) > 0.1) { camera.fov += (fovT - camera.fov) * Math.min(1, dt * 5); camera.updateProjectionMatrix(); }
  camera.getWorldDirection(camFwd);

  // фонарь в руке
  handFL.position.set(0.17 + Math.cos(P.bob * 0.5) * bobA * 0.3, -0.17 + Math.abs(Math.sin(P.bob * 0.5)) * bobA * 0.4, -0.42);
  let flick = 1;
  if (P.battery < 15) flick = Math.random() < 0.08 ? 0.2 : 0.75 + Math.random() * 0.25;
  else if (P.battery < 30) flick = 0.88 + Math.random() * 0.08;
  const strength = P.light ? (0.45 + 0.55 * Math.min(1, P.battery / 60)) * flick : 0;
  // вспышка фотоаппарата = короткое усиление фонаря (без отдельного источника света)
  flashlight.intensity = 72 * strength + G.flash * 600;
  flashlight.angle = 0.46 + G.flash * 0.6;
  if (fill) fill.intensity = 1.2 * strength + G.flash * 6;
  handFL.lens.emissiveIntensity = 1.5 * strength;

  // лампы: ближайшие получают настоящий свет
  lampTimer -= dt;
  const lamps = G.lamps.filter(L => !L.moon);
  if (lampTimer <= 0) {
    lampTimer = 0.25;
    lamps.sort((a, b) => dist(a.x, a.y, P.x, P.y) - dist(b.x, b.y, P.x, P.y));
    lampPool.forEach((l, i) => { l.userData.lamp = lamps[i] || null; if (lamps[i]) { l.position.copy(lamps[i].world); l.color.copy(lamps[i].color); } });
  }
  for (const L of lamps) if (L.bulb) L.bulb.emissiveIntensity = L.on ? 2.5 * (0.9 + 0.1 * Math.sin(G.time * 13 + L.x)) : 0.05;
  for (const l of lampPool) { const L = l.userData.lamp; l.intensity = L && L.on ? 5 * (0.9 + 0.1 * Math.sin(G.time * 13 + L.x)) : 0; }

  // вода
  if (world && world.waterMesh) { const b = world.waterMesh.material.bumpMap || world.waterMesh.material.map; if (b) { b.offset.x = G.time * 0.03; b.offset.y = Math.sin(G.time * 0.4) * 0.05; } }

  // охрана
  const byDist = [...G.guards].sort((a, b) => dist(a.x, a.y, P.x, P.y) - dist(b.x, b.y, P.x, P.y));
  guardSpotPool.forEach((l, i) => { l.userData.g = byDist[i] || null; });
  for (const g of G.guards) {
    const m = g.mesh, u = m.userData;
    m.position.set(w(g.x), 0, w(g.y)); m.rotation.y = -g.a;
    const swing = g.path.length ? Math.sin(g.walk) * 0.55 : 0;
    u.legL.rotation.z = swing; u.legR.rotation.z = -swing; u.armL.rotation.z = -swing * 0.6;
    const chase = g.state === 'chase';
    u.beam.material.color.setHex(chase ? 0xffb090 : 0xfff0c0);
    u.beam.material.opacity = chase ? 0.16 : 0.1;
  }
  for (const l of guardSpotPool) {
    const g = l.userData.g;
    if (!g) { l.intensity = 0; continue; }
    const ca = Math.cos(g.a), sa = Math.sin(g.a);
    l.position.set(w(g.x) + ca * 0.6 - sa * 0.3, 1.45, w(g.y) + sa * 0.6 + ca * 0.3);
    l.target.position.set(w(g.x) + ca * 8, 0.2, w(g.y) + sa * 8);
    l.color.setHex(g.state === 'chase' ? 0xffc4a0 : 0xfff2c8);
    l.intensity = 70;
  }

  // крысы
  for (const r of G.rats) { r.mesh.position.set(w(r.x), 0, w(r.y)); r.mesh.rotation.y = -r.a; }

  // блики на предметах, освещённых фонарём
  for (const it of G.items) {
    const gl = it.mesh.userData.glint;
    tmpV.set(w(it.x) - camera.position.x, 0.3 - camera.position.y, w(it.y) - camera.position.z);
    const dd = tmpV.length(); tmpV.divideScalar(dd);
    const lit = P.light && dd < 16 && tmpV.dot(camFwd) > 0.9;
    const tw = (Math.sin(G.time * 3 + it.ph) + 1) / 2;
    gl.material.opacity = lit ? 0.35 + 0.65 * tw * tw : 0;
    gl.material.rotation = G.time;
  }

  // пыль: светится только в луче фонаря
  if (dust) {
    const pos = dust.geometry.attributes.position, col = dust.geometry.attributes.color;
    const cx = camera.position.x, cz = camera.position.z;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      x += Math.sin(G.time * 0.3 + i) * dt * 0.05; y += Math.cos(G.time * 0.2 + i * 1.3) * dt * 0.04; z += Math.cos(G.time * 0.25 + i * 0.7) * dt * 0.05;
      if (x - cx > 6) x -= 12; if (x - cx < -6) x += 12; if (z - cz > 6) z -= 12; if (z - cz < -6) z += 12;
      if (y < 0) y += WH; if (y > WH) y -= WH;
      pos.setXYZ(i, x, y, z);
      tmpV.set(x - cx, y - camera.position.y, z - cz); const dd = tmpV.length(); tmpV.divideScalar(dd || 1);
      const c = P.light && dd < 7 ? Math.max(0, (tmpV.dot(camFwd) - 0.9) * 10) * (1 - dd / 7) * strength : 0;
      col.setXYZ(i, c, c * 0.95, c * 0.85);
    }
    pos.needsUpdate = true; col.needsUpdate = true;
  }

  // экранные эффекты
  ui.red.style.opacity = (G.chaseT * (0.6 + 0.4 * Math.sin(G.time * 11))).toFixed(3);
}

// ============================================================
//  Миникарта
// ============================================================
function drawMinimap() {
  const c = ui.mini;
  ui.mini.classList.toggle('hidden', !G.showMap || G.state !== 'play');
  if (!G.showMap) return;
  const s = 3; if (c.width !== MW * s) { c.width = MW * s; c.height = MH * s; }
  const g = miniCtx; g.clearRect(0, 0, c.width, c.height);
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const i = y * MW + x; if (!G.explored[i]) continue;
    const t = G.map[i];
    g.fillStyle = t === 0 ? '#6a665a' : t === WATER ? '#2b5560' : t === EXIT ? '#6cf' : t === DOWN ? '#fc5' : t === 6 ? '#3e3a32' : '#2c2a25';
    g.fillRect(x * s, y * s, s, s);
  }
  g.fillStyle = '#e8c547'; g.beginPath(); g.arc(P.x * s, P.y * s, 3.5, 0, 7); g.fill();
  g.strokeStyle = '#e8c547'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(P.x * s, P.y * s); g.lineTo((P.x + Math.cos(P.a) * 3) * s, (P.y + Math.sin(P.a) * 3) * s); g.stroke();
  for (const gu of G.guards) if (gu.state === 'chase' || gu.sees) { g.fillStyle = '#ff4a3a'; g.fillRect(gu.x * s - 3, gu.y * s - 3, 6, 6); }
}

// ============================================================
//  Главный цикл
// ============================================================
let last = performance.now();
function frame(now) {
  const rawDt = (now - last) / 1000, dt = Math.min(0.05, rawDt); last = now;
  updateDR(rawDt);
  if (G.state === 'play') update(dt);
  if (world) { sync3D(dt); renderer.render(scene, camera); }
  else { // меню: медленный пролёт по пустому бомбарю отрисовывается после первой загрузки
    renderer.render(scene, camera);
  }
  miniTimer -= dt;
  if (miniTimer <= 0 && world) { miniTimer = 0.15; drawMinimap(); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Отладка / автотесты
window.__digger = { G, P, startRun, interact, update, THREE, renderer, scene, camera };
