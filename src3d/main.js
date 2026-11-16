// РЭГДОЛЛ ПЕСОЧНИЦА 3D — физическая песочница с человечками.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { QP, QNAME, QUALITY, GPU, AUTO, PERF, PERF_AUTO, WEAK_GPU, PRESETS, setPreset, setPerf, mat, OPT, saveOpt } from './quality.js';
import { Ragdoll, TOTAL_MASS } from './ragdoll.js';
import { Particles, Decals, blobTexture } from './fx.js';
import { SFX, audioInit } from './audio.js';

const $ = id => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);

// ============================================================
//  Рендер
// ============================================================
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: QP.aa, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); // родное разрешение, без понижения
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = QP.shadows;
renderer.shadowMap.type = QP.soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;

const SKY = 0xa9c9e6;
const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 45, 130);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 220);

const hemi = new THREE.HemisphereLight(0xdfefff, 0x6b6250, QP.lite ? 1.6 : 1.1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff3dd, QP.lite ? 1.7 : 2.4);
sun.position.set(10, 18, 7);
scene.add(sun, sun.target);
if (QP.shadows) {
  sun.castShadow = true;
  sun.shadow.mapSize.set(QP.shadowMap, QP.shadowMap);
  const sc = sun.shadow.camera; sc.left = -20; sc.right = 20; sc.top = 20; sc.bottom = -20; sc.near = 1; sc.far = 60;
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
}
let expLight = null;
if (QP.expLight) { expLight = new THREE.PointLight(0xffa050, 0, 22, 1.6); scene.add(expLight); }

// ---------- текстуры ----------
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = QP.lite ? 2 : 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
const gridTex = (base, alt, line) => canvasTex(256, 256, (g, w) => {
  g.fillStyle = base; g.fillRect(0, 0, w, w);
  g.fillStyle = alt; g.fillRect(0, 0, w / 2, w / 2); g.fillRect(w / 2, w / 2, w / 2, w / 2);
  g.strokeStyle = line; g.lineWidth = 2;
  for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * w / 4, 0); g.lineTo(i * w / 4, w); g.moveTo(0, i * w / 4); g.lineTo(w, i * w / 4); g.stroke(); }
  g.lineWidth = 4; g.strokeRect(0, 0, w, w);
});
const groundTex = gridTex('#b9bcb4', '#aeb1a9', 'rgba(70,75,70,0.35)'); groundTex.repeat.set(100, 100); groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
const devTex = (rx, ry) => { const t = gridTex('#e08a3a', '#d27b2c', 'rgba(60,30,10,0.45)'); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); return t; };
const crateTex = canvasTex(128, 128, (g, w) => {
  g.fillStyle = '#b07a3e'; g.fillRect(0, 0, w, w);
  for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? '#a06c33' : '#b8834a'; g.fillRect(0, i * w / 6, w, w / 6 - 2); }
  g.strokeStyle = '#6b4320'; g.lineWidth = 12; g.strokeRect(6, 6, w - 12, w - 12);
  g.beginPath(); g.moveTo(10, 10); g.lineTo(w - 10, w - 10); g.stroke();
});
const barrelTex = canvasTex(256, 128, (g, w, h) => {
  g.fillStyle = '#c92a1e'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#8f1b12'; g.fillRect(0, 18, w, 6); g.fillRect(0, h - 24, w, 6);
  g.fillStyle = '#f3c614'; g.fillRect(0, 48, w, 32);
  g.fillStyle = '#111'; for (let x = -32; x < w; x += 24) { g.beginPath(); g.moveTo(x, 80); g.lineTo(x + 12, 80); g.lineTo(x + 44, 48); g.lineTo(x + 32, 48); g.fill(); }
});
const brickTex = canvasTex(256, 128, (g, w, h) => {
  g.fillStyle = '#7a3a2a'; g.fillRect(0, 0, w, h);
  for (let r = 0; r < 8; r++) for (let c = -1; c < 9; c++) {
    g.fillStyle = `hsl(${10 + Math.random() * 10},${40 + Math.random() * 15}%,${33 + Math.random() * 10}%)`;
    g.fillRect(c * 32 + (r % 2) * 16 + 2, r * 16 + 2, 28, 12);
  }
}, [4, 2]);

// ============================================================
//  Физика
// ============================================================
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0), allowSleep: true });
world.broadphase = new CANNON.SAPBroadphase(world);
world.solver.iterations = 12;
const M_GROUND = new CANNON.Material('ground'), M_RAG = new CANNON.Material('rag'), M_OBJ = new CANNON.Material('obj');
world.defaultContactMaterial.friction = 0.5;
world.addContactMaterial(new CANNON.ContactMaterial(M_GROUND, M_RAG, { friction: 0.8, restitution: 0.05 }));
world.addContactMaterial(new CANNON.ContactMaterial(M_GROUND, M_OBJ, { friction: 0.6, restitution: 0.15 }));
world.addContactMaterial(new CANNON.ContactMaterial(M_RAG, M_RAG, { friction: 0.6, restitution: 0.05 }));
world.addContactMaterial(new CANNON.ContactMaterial(M_RAG, M_OBJ, { friction: 0.6, restitution: 0.1 }));
world.addContactMaterial(new CANNON.ContactMaterial(M_OBJ, M_OBJ, { friction: 0.5, restitution: 0.15 }));
// группы столкновений: 1 — статика, 2 — человечки, 4 — предметы
const G_STATIC = 1, G_RAG = 2, G_OBJ = 4;
const GRAVS = [{ g: -9.82, name: 'Земля' }, { g: -1.62, name: 'Луна' }, { g: 0, name: 'Невесомость' }];
let gravIdx = 0;
let simTime = 0, timeScale = 1, physPaused = false;

const pickables = [];      // всё, во что можно кликнуть
const rags = [];           // человечки
const objs = [];           // предметы
const pins = [];           // гвозди
const statics = [];        // статичные тела арены
const later = [];          // отложенные действия {t, fn}
const after = fn => later.push({ t: 0, fn });
const delay = (t, fn) => later.push({ t, fn });

const v3 = (x, y, z) => new CANNON.Vec3(x, y, z);
const toT = (v, out = new THREE.Vector3()) => out.set(v.x, v.y, v.z);

// ---------- арена ----------
function addStatic(size, pos, rot, material, opts = {}) {
  const body = new CANNON.Body({ mass: opts.kinematic ? 0 : 0, type: opts.kinematic ? CANNON.Body.KINEMATIC : CANNON.Body.STATIC, material: M_GROUND, collisionFilterGroup: G_STATIC });
  body.addShape(new CANNON.Box(v3(size[0] / 2, size[1] / 2, size[2] / 2)));
  body.position.set(pos[0], pos[1], pos[2]);
  if (rot) body.quaternion.setFromEuler(rot[0], rot[1], rot[2]);
  world.addBody(body);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material);
  mesh.position.copy(body.position); mesh.quaternion.copy(body.quaternion);
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.userData.static = true; mesh.userData.body = body; body.mesh = mesh;
  scene.add(mesh); pickables.push(mesh); statics.push(body);
  return body;
}
{
  const ground = new CANNON.Body({ mass: 0, material: M_GROUND, collisionFilterGroup: G_STATIC });
  ground.addShape(new CANNON.Plane());
  ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(ground);
  const gm = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), mat({ map: groundTex, roughness: 0.95 }));
  gm.rotation.x = -Math.PI / 2; gm.receiveShadow = true; gm.userData.static = true; gm.userData.ground = true;
  scene.add(gm); pickables.push(gm);

  const dev = mat({ map: devTex(2, 3), roughness: 0.8 });
  // пандус
  addStatic([6, 0.4, 11], [16, 1.55, 0], [-0.29, 0, 0], dev);
  // вышка с лестницей
  const devP = mat({ map: devTex(2, 2), roughness: 0.8 });
  addStatic([6, 0.5, 6], [-16, 6, -12], null, devP);
  const pil = mat({ color: 0x6d6d6d, roughness: 0.9 }, 'pillar');
  for (const [x, z] of [[-18.7, -14.7], [-13.3, -14.7], [-18.7, -9.3], [-13.3, -9.3]]) addStatic([0.5, 5.75, 0.5], [x, 2.875, z], null, pil);
  const step = mat({ color: 0x8d8d86, roughness: 0.9 }, 'step');
  for (let i = 0; i < 12; i++) { const h = 6 - i * 0.5; addStatic([2, h, 0.6], [-14, h / 2, -8.7 + i * 0.6], null, step); }
  // кирпичная стена
  addStatic([10, 3, 0.6], [0, 1.5, 14], null, mat({ map: brickTex, roughness: 0.95 }));
  // невысокие бортики-препятствия
  addStatic([0.6, 0.8, 6], [-8, 0.4, 3], null, pil);
}
// вращающаяся «мясорубка»
let spinner = null;
{
  const postM = mat({ color: 0x444444, roughness: 0.6 }, 'post');
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 1.4, 12), postM); post.position.set(12, 0.7, -16); post.castShadow = true; scene.add(post);
  const pb = new CANNON.Body({ mass: 0, material: M_GROUND, collisionFilterGroup: G_STATIC }); pb.addShape(new CANNON.Cylinder(0.3, 0.4, 1.4, 10)); pb.position.set(12, 0.7, -16); world.addBody(pb);
  post.userData.static = true; pickables.push(post);
  spinner = addStatic([11, 0.45, 0.45], [12, 1.15, -16], null, mat({ color: 0xd9c31f, roughness: 0.5 }, 'spin'), { kinematic: true });
  spinner.angularVelocity.set(0, 2.2, 0);
}

// ============================================================
//  Эффекты
// ============================================================
const fxAdd = new Particles(scene, Math.round(QP.particles * 0.6), true);
const fxNorm = new Particles(scene, QP.particles, false);
const decals = new Decals(scene, QP.lite ? 220 : 400);
fxNorm.onGround = (x, z) => { if (Math.random() < 0.35) decals.add(x, 0, z, rand(0.08, 0.22), '#5c0c0c'); };

function bloodBurst(p, dir, n, speed = 4) {
  if (OPT.blood) {
    for (let i = 0; i < n; i++) {
      const s = speed * rand(0.3, 1.1);
      fxNorm.spawn(p.x, p.y, p.z, (dir ? dir.x * s : 0) + rand(-2, 2), (dir ? dir.y * s : 0) + rand(0, 3), (dir ? dir.z * s : 0) + rand(-2, 2), rand(0.6, 1.4), rand(0.05, 0.11), 0.55, 0.03, 0.03, 1, 9.8, 0.4, 0, 1);
    }
    SFX.splat();
  } else {
    for (let i = 0; i < Math.ceil(n / 2); i++) fxAdd.spawn(p.x, p.y, p.z, rand(-3, 3), rand(-1, 3), rand(-3, 3), rand(0.2, 0.4), rand(0.06, 0.12), 1, 0.9, 0.5, 1, 6, 2, 0, 2);
  }
}
function dust(p, n = 6) {
  for (let i = 0; i < n; i++) fxNorm.spawn(p.x, p.y + 0.05, p.z, rand(-1.2, 1.2), rand(0.3, 1.5), rand(-1.2, 1.2), rand(0.4, 0.9), rand(0.12, 0.25), 0.55, 0.52, 0.47, 0.6, 1.5, 2, 0.6, 2);
}
let shake = 0;
function explosionFX(p, R) {
  const k = QP.lite ? 0.6 : 1;
  for (let i = 0; i < 6; i++) fxAdd.spawn(p.x, p.y, p.z, 0, 0, 0, 0.18, R * rand(0.8, 1.2), 1, 0.95, 0.75, 1, 0, 0, R * 2, 2);
  for (let i = 0; i < 34 * k; i++) { const a = rand(0, 6.28), e = rand(-0.2, 1.2), s = rand(2, 7); fxAdd.spawn(p.x, p.y + 0.3, p.z, Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s + 1, Math.sin(a) * Math.cos(e) * s, rand(0.35, 0.8), rand(0.6, 1.3), 1, rand(0.4, 0.65), 0.1, 0.9, -1, 2.5, 1.2, 2); }
  for (let i = 0; i < 26 * k; i++) { const a = rand(0, 6.28), s = rand(0.5, 3); fxNorm.spawn(p.x + rand(-1, 1), p.y + rand(0, 1.5), p.z + rand(-1, 1), Math.cos(a) * s, rand(1, 3.5), Math.sin(a) * s, rand(1.6, 3.2), rand(0.9, 1.6), 0.18, 0.17, 0.16, 0.55, -0.4, 1.2, 1.4, 2); }
  for (let i = 0; i < 40 * k; i++) { const a = rand(0, 6.28), e = rand(0, 1.3), s = rand(6, 16); fxAdd.spawn(p.x, p.y + 0.2, p.z, Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s, Math.sin(a) * Math.cos(e) * s, rand(0.4, 1.0), rand(0.05, 0.1), 1, 0.75, 0.3, 1, 9.8, 0.5, 0); }
  if (p.y < 1.6) decals.add(p.x, Math.max(0, p.y - 1.2) * 0, p.z, R * 0.32, '#151311');
  if (expLight) { expLight.position.set(p.x, p.y + 1, p.z); expLight.intensity = 90; }
  const dc = camera.position.distanceTo(p);
  shake = Math.max(shake, Math.max(0, 1 - dc / 45) * 0.8);
  SFX.explode(Math.max(0.15, 1 - dc / 70));
}

// ============================================================
//  Человечки
// ============================================================
const blobGeo = new THREE.PlaneGeometry(1, 1); blobGeo.rotateX(-Math.PI / 2);
const blobMat = new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
const env = {
  world, scene, material: M_RAG,
  onImpact(rd, part, v, other) {
    if (v > 2.5) SFX.thud(v);
    if (v < 6) return;
    if (other && other.isRocket) return;
    const died = rd.hurt((v - 6) * 5, part, Math.min(5, (v - 5) * 0.6));
    if (died) SFX.die(); else if (rd.alive && v > 7) SFX.ouch();
    if (v > 9) { const b = rd.by[part].body; bloodBurst(toT(b.position), null, Math.min(14, Math.round(v - 6))); }
    if (v > 24 && OPT.dismember && part !== 'pelvis' && part !== 'chest' && Math.random() < 0.5) after(() => detachPart(rd, part));
  },
};
function spawnRagdoll(p, faceTo) {
  if (rags.length >= QP.maxRagdolls) { toast(`Лимит человечков: ${QP.maxRagdolls}. Удали лишних (ластик или Del)`); return null; }
  const yaw = faceTo ? Math.atan2(faceTo.x - p.x, faceTo.z - p.z) : rand(0, 6.28);
  const rd = new Ragdoll(env, p, yaw);
  for (const part of rd.parts) { part.body.collisionFilterGroup = G_RAG; pickables.push(part.mesh); }
  if (QP.blobs) { rd.blob = new THREE.Mesh(blobGeo, blobMat.clone()); scene.add(rd.blob); }
  rags.push(rd);
  return rd;
}
function removeRagdoll(rd) {
  for (const pin of pins.slice()) if (pin.body.rd === rd) removePin(pin);
  if (grab && grab.body.rd === rd) releaseGrab();
  for (const part of rd.parts) { const i = pickables.indexOf(part.mesh); if (i >= 0) pickables.splice(i, 1); }
  if (rd.blob) { scene.remove(rd.blob); rd.blob.material.dispose(); }
  rd.remove();
  rags.splice(rags.indexOf(rd), 1);
}
function detachPart(rd, part) {
  if (rd.removed || !rd.joints[part]) return;
  const wasAlive = rd.alive;
  const p = rd.detach(part);
  if (!p) return;
  bloodBurst(p, null, 18, 5);
  if (wasAlive && !rd.alive) SFX.die(); else SFX.ouch();
}

// ============================================================
//  Предметы
// ============================================================
const crateGeo = new THREE.BoxGeometry(1, 1, 1);
const barrelGeo = new THREE.CylinderGeometry(0.4, 0.4, 1.1, 16);
const bombGeo = new THREE.SphereGeometry(0.3, 16, 12);
const crateMat = mat({ map: crateTex, roughness: 0.85 });
const barrelMat = [mat({ map: barrelTex, roughness: 0.5, metalness: 0.3 }), mat({ color: 0x9c2018, roughness: 0.5, metalness: 0.3 }, 'barrelTop'), mat({ color: 0x9c2018, roughness: 0.5, metalness: 0.3 }, 'barrelTop')];
const bombMat = mat({ color: 0x1b1b1b, roughness: 0.4, metalness: 0.5 }, 'bomb');

function addObj(kind, body, mesh, extra = {}) {
  body.collisionFilterGroup = body.type === CANNON.Body.STATIC ? G_STATIC : G_OBJ;
  body.sleepSpeedLimit = 0.2; body.sleepTimeLimit = 1;
  body.interpolatedPosition.copy(body.position); body.interpolatedQuaternion.copy(body.quaternion);
  world.addBody(body); scene.add(mesh);
  mesh.castShadow = true; mesh.receiveShadow = !QP.lite;
  const o = Object.assign({ kind, body, mesh }, extra);
  body.obj = o; mesh.userData.body = body; mesh.userData.obj = o; body.mesh = mesh;
  objs.push(o); pickables.push(mesh);
  return o;
}
function removeObj(o) {
  if (o.removed) return;
  o.removed = true;
  for (const pin of pins.slice()) if (pin.body === o.body) removePin(pin);
  if (grab && grab.body === o.body) releaseGrab();
  world.removeBody(o.body); scene.remove(o.mesh);
  const i = objs.indexOf(o); if (i >= 0) objs.splice(i, 1);
  const k = pickables.indexOf(o.mesh); if (k >= 0) pickables.splice(k, 1);
}
const MAX_OBJS = QP.lite ? 120 : 200;
function objLimit() { if (objs.length >= MAX_OBJS) { toast(`Лимит предметов: ${MAX_OBJS}. Очисти лишнее (Del)`); return true; } return false; }

function spawnCrate(p, s = 1) {
  if (objLimit()) return;
  const body = new CANNON.Body({ mass: 18 * s * s * s, material: M_OBJ });
  body.addShape(new CANNON.Box(v3(s / 2, s / 2, s / 2)));
  body.position.set(p.x, p.y + s / 2 + 0.02, p.z);
  body.quaternion.setFromEuler(0, rand(0, 6.28), 0);
  const mesh = new THREE.Mesh(crateGeo, crateMat); mesh.scale.setScalar(s);
  const o = addObj('crate', body, mesh);
  body.addEventListener('collide', e => { const v = Math.abs(e.contact.getImpactVelocityAlongNormal()); if (v > 2) SFX.crate(v); });
  return o;
}
function spawnBarrel(p) {
  if (objLimit()) return;
  const body = new CANNON.Body({ mass: 15, material: M_OBJ });
  body.addShape(new CANNON.Cylinder(0.4, 0.4, 1.1, 12));
  body.position.set(p.x, p.y + 0.57, p.z);
  const mesh = new THREE.Mesh(barrelGeo, barrelMat);
  const o = addObj('barrel', body, mesh, { explosive: true });
  body.addEventListener('collide', e => {
    const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
    if (v > 2) SFX.metal(v);
    if (v > 13) after(() => detonate(o));
  });
  return o;
}
function spawnBomb(p) {
  if (objLimit()) return;
  const body = new CANNON.Body({ mass: 8, material: M_OBJ, angularDamping: 0.4 });
  body.addShape(new CANNON.Sphere(0.3));
  body.position.set(p.x, p.y + 0.32, p.z);
  const mesh = new THREE.Mesh(bombGeo, bombMat);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0x550000 }));
  led.position.set(0, 0.3, 0); mesh.add(led);
  const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.18, 6), mat({ color: 0x8b6a3a }, 'fuse'));
  fuse.position.set(0.08, 0.32, 0); fuse.rotation.z = -0.5; mesh.add(fuse);
  return addObj('bomb', body, mesh, { explosive: true, fuse: 3, led, power: 27, R: 7 });
}
function spawnTrampoline(p) {
  if (objLimit()) return;
  const body = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC, material: M_GROUND });
  body.addShape(new CANNON.Box(v3(1.5, 0.15, 1.5)));
  body.position.set(p.x, p.y + 0.15, p.z);
  const mesh = makeTrampolineMesh();
  const o = addObj('tramp', body, mesh);
  body.addEventListener('collide', e => after(() => boing(e.body)));
  return o;
}
function makeTrampolineMesh() {
  const g = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(3, 0.25, 3), mat({ color: 0x2a2a2a, roughness: 0.6 }, 'trampFrame'));
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.04, 2.6), mat({ color: 0x2f7fe0, roughness: 0.5 }, 'trampTop'));
  top.position.y = 0.13; frame.castShadow = true; frame.receiveShadow = true; top.receiveShadow = true;
  g.add(frame, top);
  // Group не Mesh: для пиков добавим невидимый бокс
  const hit = new THREE.Mesh(new THREE.BoxGeometry(3, 0.3, 3), new THREE.MeshBasicMaterial({ visible: false }));
  g.add(hit);
  return g;
}
function boing(b) {
  if (!b || b.type !== CANNON.Body.DYNAMIC) return;
  const targets = b.rd ? b.rd.bodies : [b];
  const vUp = gravIdx === 2 ? 6 : 14;
  for (const t of targets) { t.wakeUp(); if (t.velocity.y < vUp) t.velocity.y = vUp; }
  if (b.rd) b.rd.stun = Math.max(b.rd.stun, 1.5);
  SFX.boing();
}
function spawnRocket(from, dir) {
  if (objLimit()) return;
  const body = new CANNON.Body({ mass: 3, material: M_OBJ, linearDamping: 0 });
  body.addShape(new CANNON.Sphere(0.15));
  body.position.set(from.x, from.y, from.z);
  body.velocity.set(dir.x * 38, dir.y * 38, dir.z * 38);
  body.isRocket = true; body.allowSleep = false;
  const mesh = new THREE.Group();
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.6, 8), mat({ color: 0x4d5a3a }, 'rocket')); tube.rotation.x = Math.PI / 2;
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, 8), mat({ color: 0xc23a2a }, 'nose')); nose.rotation.x = Math.PI / 2; nose.position.z = 0.4;
  mesh.add(tube, nose);
  const o = addObj('rocket', body, mesh, { explosive: true, life: 5, power: 24, R: 6.5 });
  body.collisionFilterMask = ~0;
  body.addEventListener('collide', () => after(() => detonate(o)));
  SFX.rocket();
  return o;
}

// ---------- взрыв ----------
function detonate(o) {
  if (o.removed) return;
  const p = toT(o.body.position);
  removeObj(o);
  explode(p, o.R || 6, o.power || 22);
}
function explode(p, R, power) {
  explosionFX(p, R);
  const c = new CANNON.Vec3(p.x, p.y, p.z), d = new CANNON.Vec3();
  const hitRags = new Map();
  for (const b of world.bodies) {
    if (b.type !== CANNON.Body.DYNAMIC) continue;
    b.position.vsub(c, d);
    const dist = d.length();
    if (dist > R) continue;
    const f = 1 - dist / R;
    d.y += 0.6 + dist * 0.15; d.normalize();
    const dv = power * f * rand(0.85, 1.15);
    b.wakeUp();
    b.applyImpulse(new CANNON.Vec3(d.x * dv * b.mass, d.y * dv * b.mass, d.z * dv * b.mass));
    b.angularVelocity.x += rand(-1, 1) * f * 6; b.angularVelocity.z += rand(-1, 1) * f * 6;
    if (b.rd) { const h = hitRags.get(b.rd) || { f: 0, parts: [] }; h.f = Math.max(h.f, f); h.parts.push([b.part, f]); hitRags.set(b.rd, h); }
    else if (b.obj && b.obj.explosive && !b.obj.removed && b.obj.kind !== 'rocket') { const o = b.obj; delay(rand(0.08, 0.25), () => detonate(o)); }
  }
  for (const [rd, h] of hitRags) {
    const wasAlive = rd.alive;
    rd.hurt(110 * h.f, 'chest', 6);
    if (OPT.dismember) for (const [part, f] of h.parts) if (part !== 'pelvis' && f > 0.45 && Math.random() < f * 0.8) detachPart(rd, part);
    bloodBurst(toT(rd.pelvis.position), null, Math.round(10 * h.f));
    if (wasAlive && !rd.alive) SFX.die();
  }
}

// ---------- гвозди ----------
const nailGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.25, 6);
const nailMat = new THREE.MeshBasicMaterial({ color: 0xd0d0d0 });
function addPin(body, point) {
  const anchor = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC, collisionFilterGroup: 0, collisionFilterMask: 0 });
  anchor.position.set(point.x, point.y, point.z);
  world.addBody(anchor);
  const local = new CANNON.Vec3(); body.pointToLocalFrame(new CANNON.Vec3(point.x, point.y, point.z), local);
  const c = new CANNON.PointToPointConstraint(body, local, anchor, new CANNON.Vec3(0, 0, 0), 4000);
  world.addConstraint(c);
  const mesh = new THREE.Mesh(nailGeo, nailMat); mesh.position.copy(point);
  scene.add(mesh); pickables.push(mesh);
  const pin = { body, anchor, c, mesh };
  mesh.userData.pin = pin;
  if (body.rd) body.rd.pinned++;
  pins.push(pin);
  SFX.pin();
}
function removePin(pin) {
  world.removeConstraint(pin.c); world.removeBody(pin.anchor); scene.remove(pin.mesh);
  const i = pickables.indexOf(pin.mesh); if (i >= 0) pickables.splice(i, 1);
  if (pin.body.rd) pin.body.rd.pinned--;
  pins.splice(pins.indexOf(pin), 1);
}

// ============================================================
//  Инструменты
// ============================================================
const TOOLS = [
  { id: 'hand', icon: '✋', name: 'Рука', hint: 'ЛКМ — схватить и тащить, отпусти — бросок. Колесо — ближе/дальше' },
  { id: 'human', icon: '🧍', name: 'Человечек', hint: 'ЛКМ — поставить человечка' },
  { id: 'crate', icon: '📦', name: 'Ящик', hint: 'ЛКМ — поставить ящик (Shift — большой)' },
  { id: 'barrel', icon: '🛢️', name: 'Бочка', hint: 'Взрывается от удара, выстрела или взрыва рядом' },
  { id: 'bomb', icon: '💣', name: 'Бомба', hint: 'Взрыв через 3 секунды' },
  { id: 'gun', icon: '🔫', name: 'Пистолет', hint: 'ЛКМ — выстрел (держи — очередь)' },
  { id: 'rocket', icon: '🚀', name: 'Базука', hint: 'ЛКМ — ракета, взрывается при ударе' },
  { id: 'tramp', icon: '🟦', name: 'Батут', hint: 'ЛКМ — поставить батут' },
  { id: 'pin', icon: '📌', name: 'Гвоздь', hint: 'ЛКМ — прибить часть тела или предмет к месту' },
  { id: 'erase', icon: '🧽', name: 'Ластик', hint: 'ЛКМ — удалить человечка, предмет или гвоздь' },
];
let tool = 'hand';
function setTool(id) {
  tool = id;
  document.querySelectorAll('#hotbar .slot').forEach(s => s.classList.toggle('on', s.dataset.tool === id));
  const t = TOOLS.find(t => t.id === id);
  $('toolHint').textContent = `${t.icon} ${t.name}: ${t.hint}`;
  canvas.style.cursor = id === 'hand' ? 'grab' : 'crosshair';
}

// ---------- лучи из мыши ----------
const ray = new THREE.Raycaster();
const mouse = new THREE.Vector2(), mousePx = { x: 0, y: 0 };
function pick() {
  ray.setFromCamera(mouse, camera);
  const hits = ray.intersectObjects(pickables, true);
  for (const h of hits) {
    let o = h.object;
    while (o && !o.userData.body && !o.userData.static && !o.userData.pin) o = o.parent;
    if (!o) continue;
    const n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : new THREE.Vector3(0, 1, 0);
    return { point: h.point, normal: n, mesh: o, body: o.userData.body, obj: o.userData.obj, pin: o.userData.pin, ground: !!o.userData.ground, static: !!o.userData.static, dist: h.distance };
  }
  return null;
}
// точка для установки предмета: верхняя поверхность под курсором
function placePoint() {
  const h = pick();
  if (!h) return null;
  const p = h.point.clone();
  if (h.normal.y < 0.5) p.addScaledVector(h.normal, 0.6); // кликнули в стену — ставим рядом
  return p;
}

// ---------- рука ----------
let grab = null;
function startGrab(h) {
  const b = h.body;
  if (!b || b.type !== CANNON.Body.DYNAMIC) return;
  const anchor = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC, collisionFilterGroup: 0, collisionFilterMask: 0 });
  anchor.position.set(h.point.x, h.point.y, h.point.z);
  world.addBody(anchor);
  const local = new CANNON.Vec3(); b.pointToLocalFrame(new CANNON.Vec3(h.point.x, h.point.y, h.point.z), local);
  const c = new CANNON.PointToPointConstraint(b, local, anchor, new CANNON.Vec3(0, 0, 0), b.rd ? 2600 : 1800);
  world.addConstraint(c);
  b.wakeUp();
  grab = { body: b, anchor, c, dist: h.dist, damp: b.linearDamping };
  b.linearDamping = 0.4;
  if (b.rd) { b.rd.grabbed++; for (const x of b.rd.bodies) x.wakeUp(); }
  canvas.style.cursor = 'grabbing';
}
function updateGrab() {
  if (!grab) return;
  ray.setFromCamera(mouse, camera);
  const p = ray.ray.origin.clone().addScaledVector(ray.ray.direction, grab.dist);
  p.y = Math.max(0.15, p.y);
  grab.anchor.position.set(p.x, p.y, p.z);
  grab.body.wakeUp();
}
function releaseGrab() {
  if (!grab) return;
  world.removeConstraint(grab.c); world.removeBody(grab.anchor);
  grab.body.linearDamping = grab.damp;
  if (grab.body.rd) { grab.body.rd.grabbed = Math.max(0, grab.body.rd.grabbed - 1); grab.body.rd.stun = Math.max(grab.body.rd.stun, 1.2); }
  grab = null;
  canvas.style.cursor = tool === 'hand' ? 'grab' : 'crosshair';
}

// ---------- пистолет ----------
let firing = false, fireCD = 0;
function shoot() {
  ray.setFromCamera(mouse, camera);
  const dir = ray.ray.direction.clone();
  const h = pick();
  SFX.shot();
  shake = Math.max(shake, 0.06);
  // трассер
  const from = camera.position.clone().addScaledVector(dir, 1).add(new THREE.Vector3(0, -0.25, 0));
  const to = h ? h.point : from.clone().addScaledVector(dir, 80);
  for (let i = 0; i < 6; i++) { const t = Math.random(); fxAdd.spawn(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, from.z + (to.z - from.z) * t, 0, 0, 0, 0.06, 0.06, 1, 0.9, 0.5, 0.8, 0, 0, 0, 2); }
  if (!h) return;
  const b = h.body;
  if (h.obj && h.obj.explosive) { const o = h.obj; after(() => detonate(o)); return; }
  if (b && b.type === CANNON.Body.DYNAMIC) {
    b.wakeUp();
    const rel = new CANNON.Vec3(h.point.x - b.position.x, h.point.y - b.position.y, h.point.z - b.position.z);
    const J = b.rd ? 22 : 30;
    b.applyImpulse(new CANNON.Vec3(dir.x * J, dir.y * J, dir.z * J), rel);
    if (b.rd) {
      const rd = b.rd, wasAlive = rd.alive;
      rd.hurt(b.part === 'head' ? 40 : 22, b.part, 2.5);
      bloodBurst(h.point, dir, 10, 3);
      bloodBurst(h.point, dir.clone().negate(), 4, 2);
      if (OPT.dismember && b.part !== 'pelvis' && b.part !== 'chest' && rd.by[b.part].dmg > (b.part === 'head' ? 110 : 75)) after(() => detachPart(rd, b.part));
      if (wasAlive && !rd.alive) SFX.die(); else if (rd.alive) SFX.ouch();
    } else {
      for (let i = 0; i < 6; i++) fxAdd.spawn(h.point.x, h.point.y, h.point.z, rand(-3, 3), rand(0, 3), rand(-3, 3), rand(0.15, 0.3), 0.05, 1, 0.8, 0.4, 1, 9.8, 0, 0, 2);
    }
  } else {
    dust(h.point, 5);
    for (let i = 0; i < 4; i++) fxAdd.spawn(h.point.x, h.point.y, h.point.z, rand(-3, 3), rand(0, 3), rand(-3, 3), rand(0.15, 0.3), 0.05, 1, 0.8, 0.4, 1, 9.8, 0, 0, 2);
    if (h.ground) decals.add(h.point.x, 0, h.point.z, 0.06, '#222');
  }
}

function useTool() {
  audioInit();
  const h = tool === 'gun' || tool === 'rocket' ? null : pick();
  switch (tool) {
    case 'hand': if (h && h.body) startGrab(h); break;
    case 'human': { const p = placePoint(); if (p && spawnRagdoll(p, camera.position)) SFX.spawn(); break; }
    case 'crate': { const p = placePoint(); if (p) { spawnCrate(p, keys.ShiftLeft || keys.ShiftRight ? 1.8 : 1); SFX.spawn(); } break; }
    case 'barrel': { const p = placePoint(); if (p) { spawnBarrel(p); SFX.spawn(); } break; }
    case 'bomb': { const p = placePoint(); if (p) { spawnBomb(p); SFX.spawn(); } break; }
    case 'tramp': { const p = placePoint(); if (p) { spawnTrampoline(p); SFX.spawn(); } break; }
    case 'gun': shoot(); firing = true; fireCD = 0.16; break;
    case 'rocket': {
      ray.setFromCamera(mouse, camera);
      const dir = ray.ray.direction.clone();
      const from = camera.position.clone().addScaledVector(dir, 1.2).add(new THREE.Vector3(0, -0.2, 0));
      spawnRocket(from, dir); shake = Math.max(shake, 0.12);
      break;
    }
    case 'pin': if (h && h.body && h.body.type === CANNON.Body.DYNAMIC) addPin(h.body, h.point); break;
    case 'erase':
      if (!h) break;
      if (h.pin) { removePin(h.pin); SFX.erase(); }
      else if (h.body && h.body.rd) { removeRagdoll(h.body.rd); SFX.erase(); }
      else if (h.obj) { removeObj(h.obj); SFX.erase(); }
      break;
  }
}

// ============================================================
//  Камера
// ============================================================
const cam = { yaw: 0.45, pitch: 0.3, dist: 11, target: new THREE.Vector3(-1, 1.1, 1) };
const keys = {};
let orbiting = false, panning = false, lastPX = 0, lastPY = 0;
function updateCamera(dt) {
  const sp = (keys.ShiftLeft || keys.ShiftRight ? 22 : 10) * dt;
  const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
  if (keys.KeyW) { cam.target.x += fx * sp; cam.target.z += fz * sp; }
  if (keys.KeyS) { cam.target.x -= fx * sp; cam.target.z -= fz * sp; }
  if (keys.KeyA) { cam.target.x -= rx * sp; cam.target.z -= rz * sp; }
  if (keys.KeyD) { cam.target.x += rx * sp; cam.target.z += rz * sp; }
  if (keys.KeyE) cam.target.y += sp;
  if (keys.KeyQ) cam.target.y -= sp;
  cam.target.y = Math.min(40, Math.max(0.3, cam.target.y));
  cam.target.x = Math.max(-150, Math.min(150, cam.target.x)); cam.target.z = Math.max(-150, Math.min(150, cam.target.z));
  const cp = Math.cos(cam.pitch);
  camera.position.set(cam.target.x + Math.sin(cam.yaw) * cp * cam.dist, cam.target.y + Math.sin(cam.pitch) * cam.dist, cam.target.z + Math.cos(cam.yaw) * cp * cam.dist);
  if (camera.position.y < 0.3) camera.position.y = 0.3;
  camera.lookAt(cam.target);
  if (shake > 0.001) {
    camera.position.x += rand(-1, 1) * shake * 0.4; camera.position.y += rand(-1, 1) * shake * 0.4; camera.position.z += rand(-1, 1) * shake * 0.4;
    shake *= Math.pow(0.02, dt);
  }
  // тень следует за камерой
  if (QP.shadows) {
    sun.target.position.copy(cam.target); sun.target.position.y = 0;
    sun.position.set(cam.target.x + 10, 18, cam.target.z + 7);
  }
}

// ============================================================
//  Ввод
// ============================================================
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', e => {
  if (state !== 'play') return;
  canvas.setPointerCapture(e.pointerId);
  setMouse(e);
  lastPX = e.clientX; lastPY = e.clientY;
  if (e.button === 0) useTool();
  else if (e.button === 2) orbiting = true;
  else if (e.button === 1) { panning = true; e.preventDefault(); }
});
function setMouse(e) {
  const r = canvas.getBoundingClientRect();
  mousePx.x = e.clientX; mousePx.y = e.clientY;
  mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  mouseMoved = true;
}
let mouseMoved = false;
window.addEventListener('pointermove', e => {
  setMouse(e);
  const dx = e.clientX - lastPX, dy = e.clientY - lastPY; lastPX = e.clientX; lastPY = e.clientY;
  if (orbiting) { cam.yaw -= dx * 0.005; cam.pitch = Math.min(1.45, Math.max(-0.1, cam.pitch + dy * 0.005)); }
  if (panning) {
    const k = cam.dist * 0.0018;
    cam.target.x -= (Math.cos(cam.yaw) * dx) * k; cam.target.z -= (-Math.sin(cam.yaw) * dx) * k; cam.target.y += dy * k;
  }
});
window.addEventListener('pointerup', e => {
  if (e.button === 0) { releaseGrab(); firing = false; }
  if (e.button === 2) orbiting = false;
  if (e.button === 1) panning = false;
});
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  if (grab) { grab.dist = Math.max(1.5, Math.min(60, grab.dist * (e.deltaY > 0 ? 0.9 : 1.1))); return; }
  cam.dist = Math.max(3, Math.min(70, cam.dist * (e.deltaY > 0 ? 1.12 : 0.89)));
}, { passive: false });

window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Escape') { if (state === 'play') openMenu(); else if (started) closeMenu(); return; }
  if (e.code === 'Backquote') { $('optFPS').checked = !OPT.fps; saveOpt('fps', !OPT.fps); applyFps(); return; }
  if (state !== 'play') return;
  if (/^Digit[0-9]$/.test(e.code)) { const n = +e.code[5]; const t = TOOLS[(n + 9) % 10]; if (t) { setTool(t.id); SFX.click(); } }
  if (e.code === 'KeyT') { timeScale = timeScale === 1 ? 0.25 : 1; updateStatus(); }
  if (e.code === 'KeyG') { gravIdx = (gravIdx + 1) % GRAVS.length; world.gravity.set(0, GRAVS[gravIdx].g, 0); for (const b of world.bodies) b.wakeUp(); updateStatus(); toast('Гравитация: ' + GRAVS[gravIdx].name); }
  if (e.code === 'KeyP') { physPaused = !physPaused; updateStatus(); }
  if (e.code === 'Delete' || e.code === 'Backspace') { clearAll(); toast('Всё очищено'); }
  if (e.code === 'KeyR') { resetScene(); toast('Сцена сброшена'); }
  if (e.code === 'KeyH') $('help').classList.toggle('hidden');
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; releaseGrab(); firing = false; orbiting = panning = false; });

// ============================================================
//  Сцена: очистка / сброс
// ============================================================
function clearAll() {
  releaseGrab();
  while (pins.length) removePin(pins[0]);
  while (rags.length) removeRagdoll(rags[0]);
  while (objs.length) removeObj(objs[0]);
  fxAdd.clear(); fxNorm.clear(); decals.clear();
  later.length = 0;
}
function resetScene() {
  clearAll();
  gravIdx = 0; world.gravity.set(0, -9.82, 0); timeScale = 1; physPaused = false;
  for (let i = 0; i < 4; i++) spawnRagdoll(new THREE.Vector3(-3 + i * 2, 0, 1), new THREE.Vector3(-3 + i * 2, 0, 20));
  for (let i = 0; i < 3; i++) spawnCrate(new THREE.Vector3(6, i * 1.0, -3));
  spawnCrate(new THREE.Vector3(7.2, 0, -3));
  spawnBarrel(new THREE.Vector3(-6, 0, -4)); spawnBarrel(new THREE.Vector3(-6.9, 0, -4.4));
  spawnTrampoline(new THREE.Vector3(-4, 0, 9));
  for (let i = 0; i < 2; i++) spawnRagdoll(new THREE.Vector3(-17 + i * 1.6, 6.25, -12.5), new THREE.Vector3(-14, 0, 10));
  updateStatus();
}

// ============================================================
//  Физика: шаг
// ============================================================
// силы прикладываем ДО шага (их видит решатель суставов и контактов)
const FIXED = 1 / 60;
let acc = 0;
function prePhysics() {
  simTime += FIXED;
  const gScale = Math.abs(world.gravity.y) / 9.82;
  for (const rd of rags) rd.preStep(FIXED, simTime, OPT.getup && gScale > 0.05, gScale);
  for (const o of objs) if (o.kind === 'rocket') o.body.force.y -= world.gravity.y * o.body.mass;
  for (const b of world.bodies) {
    if (b.type === CANNON.Body.STATIC) continue;
    if (!b._pp) { b._pp = new CANNON.Vec3(); b._pq = new CANNON.Quaternion(); }
    b._pp.copy(b.position); b._pq.copy(b.quaternion);
  }
}
const MAX_V = 70;
function postPhysics() {
  // страховка от «взрыва» решателя: ограничиваем скорость
  for (const b of world.bodies) {
    if (b.type !== CANNON.Body.DYNAMIC) continue;
    const v2 = b.velocity.lengthSquared();
    if (v2 > MAX_V * MAX_V) b.velocity.scale(MAX_V / Math.sqrt(v2), b.velocity);
    if (b.angularVelocity.lengthSquared() > 900) b.angularVelocity.scale(30 / b.angularVelocity.length(), b.angularVelocity);
    if (b.rd && b.position.y < -0.3 && Math.abs(b.position.x) < 1e4) { b.position.y = 0.2; b.velocity.y = Math.abs(b.velocity.y) * 0.2; } // провалился под пол
  }
}
function physicsStep(sdt) {
  acc += sdt;
  let n = 0;
  while (acc >= FIXED && n < 4) { prePhysics(); world.step(FIXED); postPhysics(); acc -= FIXED; n++; }
  if (n === 4 && acc > FIXED) acc = 0;
  // интерполяция между шагами: плавно и при замедлении времени
  const a = acc / FIXED;
  for (const b of world.bodies) {
    if (b.type === CANNON.Body.STATIC || !b._pp) continue;
    b._pp.lerp(b.position, a, b.interpolatedPosition);
    b._pq.slerp(b.quaternion, a, b.interpolatedQuaternion);
  }
}
world.addEventListener('postStep', () => {
  // кто стоит ногами на опоре
  for (const c of world.contacts) {
    const bi = c.bi, bj = c.bj;
    if (bi.rd && (bi.part === 'lLegL' || bi.part === 'lLegR') && c.ni.y < -0.5 && bj.rd !== bi.rd) bi.rd.groundT = simTime;
    if (bj.rd && (bj.part === 'lLegL' || bj.part === 'lLegR') && c.ni.y > 0.5 && bi.rd !== bj.rd) bj.rd.groundT = simTime;
  }
});

function updateObjects(dt) {
  for (const o of objs.slice()) {
    if (o.kind === 'bomb') {
      o.fuse -= dt;
      const rate = o.fuse < 1 ? 0.12 : 0.35;
      const on = (o.fuse % rate) < rate / 2;
      o.led.material.color.setHex(on ? 0xff2020 : 0x550000);
      if (on && !o.ledOn) SFX.beep(o.fuse < 1 ? 1600 : 1100);
      o.ledOn = on;
      if (o.fuse <= 0) detonate(o);
    } else if (o.kind === 'rocket') {
      o.life -= dt;
      const p = o.body.position, v = o.body.velocity;
      if (Math.random() < (QP.lite ? 0.5 : 1)) fxNorm.spawn(p.x, p.y, p.z, rand(-0.3, 0.3), rand(0, 0.5), rand(-0.3, 0.3), rand(0.6, 1.1), rand(0.2, 0.35), 0.7, 0.7, 0.7, 0.5, -0.2, 1, 0.8, 2);
      fxAdd.spawn(p.x - v.x * 0.01, p.y - v.y * 0.01, p.z - v.z * 0.01, 0, 0, 0, 0.08, 0.3, 1, 0.6, 0.2, 1, 0, 0, 0, 2);
      if (o.life <= 0 || p.y < -5) detonate(o);
    }
  }
}

function syncMeshes() {
  for (const o of objs) {
    const b = o.body; if (b.type === CANNON.Body.STATIC) continue;
    const p = b.interpolatedPosition, q = b.interpolatedQuaternion;
    o.mesh.position.set(p.x, p.y, p.z);
    if (o.kind === 'rocket') { const v = b.velocity; if (v.lengthSquared() > 1) o.mesh.lookAt(p.x + v.x, p.y + v.y, p.z + v.z); }
    else o.mesh.quaternion.set(q.x, q.y, q.z, q.w);
  }
  for (const rd of rags) rd.sync(true);
  spinner.mesh.position.copy(spinner.position); spinner.mesh.quaternion.copy(spinner.quaternion);
  // мягкие тени-пятна
  if (QP.blobs) {
    const from = new CANNON.Vec3(), to = new CANNON.Vec3(), res = new CANNON.RaycastResult();
    for (const rd of rags) {
      const p = rd.pelvis.interpolatedPosition;
      from.set(p.x, p.y, p.z); to.set(p.x, p.y - 30, p.z); res.reset();
      world.raycastClosest(from, to, { collisionFilterMask: G_STATIC | G_OBJ, skipBackfaces: true }, res);
      const gy = res.hasHit ? res.hitPointWorld.y : 0, h = Math.max(0, p.y - gy);
      const s = Math.max(0.3, 1.3 - h * 0.12);
      rd.blob.position.set(p.x, gy + 0.02, p.z); rd.blob.scale.set(s, 1, s);
      rd.blob.material.opacity = Math.max(0.1, 1 - h * 0.12);
    }
  }
  // кровь из ран
  if (OPT.blood) for (const rd of rags) for (const s of rd.stumps) {
    if (s.t <= 0) continue;
    s.t -= 1 / 60;
    if (Math.random() < 0.5) {
      const w = new CANNON.Vec3(); s.body.pointToWorldFrame(s.local, w);
      const dir = s.body.quaternion.vmult(s.local.clone().unit());
      const k = rand(1, 3) * Math.min(1, s.t);
      fxNorm.spawn(w.x, w.y, w.z, dir.x * k + rand(-0.4, 0.4), dir.y * k + rand(0, 0.8), dir.z * k + rand(-0.4, 0.4), rand(0.5, 1), rand(0.05, 0.09), 0.55, 0.03, 0.03, 1, 9.8, 0.3, 0, 1);
    }
  }
}

// ============================================================
//  Интерфейс
// ============================================================
let state = 'menu', started = false;
function openMenu() {
  state = 'menu'; releaseGrab(); firing = false;
  $('menu').classList.remove('hidden'); $('btnPlay').textContent = started ? 'ПРОДОЛЖИТЬ' : 'ИГРАТЬ';
}
function closeMenu() {
  audioInit();
  state = 'play'; started = true;
  $('menu').classList.add('hidden'); $('hud').classList.remove('hidden');
}
$('btnPlay').addEventListener('click', closeMenu);
$('btnReset').addEventListener('click', () => { resetScene(); closeMenu(); });

// hotbar
{
  const hb = $('hotbar');
  TOOLS.forEach((t, i) => {
    const d = document.createElement('div');
    d.className = 'slot'; d.dataset.tool = t.id; d.title = t.hint;
    d.innerHTML = `<span class="key">${(i + 1) % 10}</span><span class="ico">${t.icon}</span><span class="nm">${t.name}</span>`;
    d.addEventListener('click', () => { setTool(t.id); SFX.click(); });
    hb.appendChild(d);
  });
  setTool('hand');
}
let toastT = 0;
function toast(msg) { const el = $('toast'); el.textContent = msg; el.classList.add('show'); toastT = 2.2; }
function updateStatus() {
  const flags = [];
  if (physPaused) flags.push('⏸ Пауза физики');
  if (timeScale !== 1) flags.push('🐢 Замедление');
  if (gravIdx !== 0) flags.push('🪐 ' + GRAVS[gravIdx].name);
  $('flags').textContent = flags.join('  ·  ');
}
function updateCounters() {
  const alive = rags.filter(r => r.alive).length;
  $('counters').textContent = `Человечков: ${rags.length}/${QP.maxRagdolls} (живых ${alive}) · Предметов: ${objs.length}`;
}
// подсказка над человечком под курсором
function updateTip() {
  const tip = $('tip');
  if (state !== 'play' || orbiting || panning || grab) { tip.classList.add('hidden'); return; }
  const h = pick();
  if (h && h.body && h.body.rd) {
    const rd = h.body.rd;
    const st = !rd.alive ? '💀 мёртв' : rd.stun > 0 ? '😵 оглушён' : rd.canStand() ? '🙂 в норме' : '🤕 ранен';
    tip.innerHTML = `<b>Человечек #${rd.id}</b> ${st}<div class="hpbar"><i style="width:${Math.max(0, rd.hp)}%"></i></div>`;
    tip.style.left = (mousePx.x + 16) + 'px'; tip.style.top = (mousePx.y + 12) + 'px';
    tip.classList.remove('hidden');
  } else tip.classList.add('hidden');
}

// настройки в меню
{
  const perfBox = $('optPerf');
  perfBox.checked = PERF;
  perfBox.addEventListener('change', () => setPerf(perfBox.checked));
  $('quality').classList.toggle('disabled', PERF);
  document.querySelectorAll('#quality button').forEach(b => {
    b.classList.toggle('on', AUTO ? b.dataset.q === 'auto' : b.dataset.q === QUALITY);
    if (b.dataset.q === 'auto' && AUTO) b.textContent = `Авто: ${PRESETS[QUALITY].label}`;
    b.addEventListener('click', () => setPreset(b.dataset.q));
  });
  const gpuName = GPU ? GPU.replace(/^ANGLE \(|\)$/g, '').replace(/ Direct3D.*$/, '').slice(0, 70) : 'не определена';
  $('gpuInfo').textContent = `Видеокарта: ${gpuName}` + (PERF
    ? ` · включён режим производительности${PERF_AUTO ? ' (автоматически: слабая видеокарта)' : ''}`
    : (WEAK_GPU ? ' · видеокарта слабая — если тормозит, включи режим производительности' : ''));
  for (const [id, key] of [['optBlood', 'blood'], ['optDism', 'dismember'], ['optGetup', 'getup'], ['optFPS', 'fps']]) {
    const el = $(id); el.checked = OPT[key];
    el.addEventListener('change', () => { saveOpt(key, el.checked); if (key === 'fps') applyFps(); });
  }
}
function applyFps() { $('fps').classList.toggle('hidden', !OPT.fps); }
applyFps();

// ============================================================
//  Размер окна
// ============================================================
function resize() {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  const scale = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  fxAdd.mat.uniforms.uScale.value = scale; fxNorm.mat.uniforms.uScale.value = scale;
}
window.addEventListener('resize', resize);
resize();

// ============================================================
//  Главный цикл
// ============================================================
const FPS = { frames: 0, acc: 0 };
let last = performance.now(), idleT = 0, uiT = 0;
function frame(now) {
  const rawDt = Math.min(0.25, (now - last) / 1000), dt = Math.min(0.05, rawDt); last = now;
  FPS.frames++; FPS.acc += rawDt;
  if (FPS.acc >= 0.5) { $('fps').textContent = `${Math.round(FPS.frames / FPS.acc)} FPS · ${canvas.width}×${canvas.height}${PERF ? ' · ⚡' : ''}`; FPS.frames = 0; FPS.acc = 0; }

  if (state === 'play') {
    const sdt = physPaused ? 0 : dt * timeScale;
    if (firing && tool === 'gun') { fireCD -= dt; if (fireCD <= 0) { shoot(); fireCD = 0.14; } }
    updateGrab();
    if (sdt > 0) physicsStep(sdt);
    for (let i = later.length - 1; i >= 0; i--) { const l = later[i]; l.t -= sdt; if (l.t <= 0) { later.splice(i, 1); l.fn(); } }
    if (sdt > 0) updateObjects(sdt);
    syncMeshes();
    fxAdd.update(sdt); fxNorm.update(sdt);
    if (expLight && expLight.intensity > 0) expLight.intensity = Math.max(0, expLight.intensity - dt * 300);
    updateCamera(dt);
    // упавших далеко вниз (не должно случаться) — убираем
    uiT -= dt;
    if (uiT <= 0) {
      uiT = 0.25; updateCounters();
      for (const rd of rags.slice()) if (rd.pelvis.position.y < -20) removeRagdoll(rd);
      for (const o of objs.slice()) if (o.body.position.y < -20) removeObj(o);
    }
    if (mouseMoved || uiT === 0.25) { updateTip(); mouseMoved = false; }
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').classList.remove('show'); }
    renderer.render(scene, camera);
  } else {
    // меню: картинка стоит — перерисовываем редко, не грузим видеокарту
    idleT -= rawDt;
    if (idleT <= 0) { idleT = 0.5; updateCamera(0); syncMeshes(); renderer.render(scene, camera); }
  }
  requestAnimationFrame(frame);
}
resetScene();
updateCamera(0);
requestAnimationFrame(frame);

window.__rag = { physicsStep, world, rags, objs, pins, scene, camera, renderer, spawnRagdoll, spawnCrate, spawnBarrel, spawnBomb, explode, shoot, setTool, useTool, mouse, cam, resetScene, clearAll, closeMenu, get state() { return state; }, THREE, CANNON };
