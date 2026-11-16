// Рэгдолл-человечек: 11 физических тел, 10 суставов ConeTwist с ограничением углов.
// Живой человечек «держит равновесие» (активный рэгдолл): поднимает голову и корпус,
// выпрямляет спину и ноги. После сильного удара — оглушение (обмякает), потом встаёт.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { mat, QP } from './quality.js';

const PI = Math.PI;
// имя, форма, размеры, центр (в позе стоя, ступни на y=0), масса, цвет
const PARTS = [
  ['head',   'sphere', 0.13,              [0, 1.79, 0],     4.5, 'skin'],
  ['chest',  'box',    [0.38, 0.48, 0.2], [0, 1.36, 0],     22,  'shirt'],
  ['pelvis', 'box',    [0.32, 0.22, 0.18],[0, 1.01, 0],     12,  'pants'],
  ['uArmL',  'cap',    [0.1, 0.32],       [-0.25, 1.41, 0], 2.5, 'shirt'],
  ['lArmL',  'cap',    [0.09, 0.32],      [-0.25, 1.09, 0], 2,   'skin'],
  ['uArmR',  'cap',    [0.1, 0.32],       [0.25, 1.41, 0],  2.5, 'shirt'],
  ['lArmR',  'cap',    [0.09, 0.32],      [0.25, 1.09, 0],  2,   'skin'],
  ['uLegL',  'cap',    [0.15, 0.45],      [-0.09, 0.675, 0],9,   'pants'],
  ['lLegL',  'cap',    [0.13, 0.45],      [-0.09, 0.225, 0],4.5, 'pants'],
  ['uLegR',  'cap',    [0.15, 0.45],      [0.09, 0.675, 0], 9,   'pants'],
  ['lLegR',  'cap',    [0.13, 0.45],      [0.09, 0.225, 0], 4.5, 'pants'],
];
// ребёнок, родитель, точка сустава, конус, скрутка
const JOINTS = [
  ['head',  'chest',  [0, 1.635, 0],     PI / 4,    PI / 5],
  ['chest', 'pelvis', [0, 1.12, 0],      PI / 6,    PI / 8],
  ['uArmL', 'chest',  [-0.25, 1.57, 0],  PI * 0.65, PI / 5],
  ['lArmL', 'uArmL',  [-0.25, 1.25, 0],  PI / 3,    PI / 12],
  ['uArmR', 'chest',  [0.25, 1.57, 0],   PI * 0.65, PI / 5],
  ['lArmR', 'uArmR',  [0.25, 1.25, 0],   PI / 3,    PI / 12],
  ['uLegL', 'pelvis', [-0.09, 0.9, 0],   PI / 3.5,  PI / 10],
  ['lLegL', 'uLegL',  [-0.09, 0.45, 0],  PI / 4,    PI / 16],
  ['uLegR', 'pelvis', [0.09, 0.9, 0],    PI / 3.5,  PI / 10],
  ['lLegR', 'uLegR',  [0.09, 0.45, 0],   PI / 4,    PI / 16],
];
export const TOTAL_MASS = PARTS.reduce((s, p) => s + p[4], 0);

const SKINS = ['#f1c7a0', '#e0ac7e', '#c68b5e', '#8d5a3b', '#f5d6bd'];
const SHIRTS = ['#d64545', '#3d7fd6', '#3fae5a', '#e3a32b', '#8a4fd1', '#e8e8e8', '#2b2b2b', '#e05fa8', '#1fb5b0', '#f07a2a'];
const PANTS = ['#2c3e66', '#3a3a3a', '#6b4f2e', '#4a5a3a', '#1f2a44', '#7a7a7a'];
const pick = a => a[Math.floor(Math.random() * a.length)];

// ---------- общая геометрия ----------
const GEO = {};
function geo(kind, size) {
  const key = kind + JSON.stringify(size);
  if (GEO[key]) return GEO[key];
  let g;
  if (kind === 'sphere') g = new THREE.SphereGeometry(size, 18, 12);
  else if (kind === 'box') g = new THREE.BoxGeometry(size[0], size[1], size[2]);
  else g = new THREE.CapsuleGeometry(size[0] / 2, size[1] - size[0], 3, 10);
  return (GEO[key] = g);
}
const SHOE_GEO = new THREE.BoxGeometry(0.14, 0.08, 0.24);

// ---------- лицо (текстура на сфере: лицо смотрит в +Z, это u≈0.25) ----------
const FACES = {};
function faceTex(skin, state) {
  const key = skin + state;
  if (FACES[key]) return FACES[key];
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = skin; g.fillRect(0, 0, 256, 128);
  // волосы сверху и сзади
  g.fillStyle = 'rgba(40,25,15,0.9)'; g.fillRect(0, 0, 256, 30);
  g.fillRect(96, 0, 160, 60);
  const cx = 64, ey = 58;
  g.lineCap = 'round';
  if (state === 'dead') {
    g.strokeStyle = '#111'; g.lineWidth = 4;
    for (const dx of [-11, 11]) { g.beginPath(); g.moveTo(cx + dx - 5, ey - 5); g.lineTo(cx + dx + 5, ey + 5); g.moveTo(cx + dx + 5, ey - 5); g.lineTo(cx + dx - 5, ey + 5); g.stroke(); }
    g.lineWidth = 3; g.beginPath(); g.moveTo(cx - 9, ey + 22); g.quadraticCurveTo(cx - 4, ey + 17, cx, ey + 22); g.quadraticCurveTo(cx + 4, ey + 27, cx + 9, ey + 22); g.stroke();
  } else if (state === 'stun') {
    g.strokeStyle = '#111'; g.lineWidth = 2.5;
    for (const dx of [-11, 11]) { g.beginPath(); for (let a = 0; a < 12; a += 0.4) { const r = a * 0.55; g.lineTo(cx + dx + Math.cos(a) * r, ey + Math.sin(a) * r); } g.stroke(); }
    g.fillStyle = '#5a1a1a'; g.beginPath(); g.ellipse(cx, ey + 21, 6, 7, 0, 0, 7); g.fill();
  } else {
    for (const dx of [-11, 11]) {
      g.fillStyle = '#fff'; g.beginPath(); g.ellipse(cx + dx, ey, 6, 7, 0, 0, 7); g.fill();
      g.fillStyle = '#111'; g.beginPath(); g.arc(cx + dx, ey + 1, 3.2, 0, 7); g.fill();
    }
    g.strokeStyle = '#3a1a1a'; g.lineWidth = 3; g.beginPath(); g.arc(cx, ey + 12, 9, 0.25 * PI, 0.75 * PI); g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 2;
  return (FACES[key] = t);
}

const V = new CANNON.Vec3(), V2 = new CANNON.Vec3(), UP = new CANNON.Vec3(0, 1, 0);
let NEXT_ID = 1;

export class Ragdoll {
  /** env: { world, scene, material, onImpact(rd, part, v, other), time() } */
  constructor(env, pos, yaw = 0) {
    this.env = env; this.id = NEXT_ID++;
    this.hp = 100; this.alive = true; this.stun = 0; this.stand = 1; this.groundT = -1;
    this.grabbed = 0; this.pinned = 0; this.parts = []; this.by = {}; this.joints = {}; this.stumps = [];
    this.colors = { skin: pick(SKINS), shirt: pick(SHIRTS), pants: pick(PANTS) };
    this.faceState = 'ok';
    const q = new CANNON.Quaternion().setFromEuler(0, yaw, 0);
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    for (const [name, kind, size, c, mass, colKey] of PARTS) {
      const body = new CANNON.Body({ mass, material: env.material, linearDamping: 0.04, angularDamping: 0.35 });
      if (kind === 'sphere') body.addShape(new CANNON.Sphere(size));
      else if (kind === 'box') body.addShape(new CANNON.Box(new CANNON.Vec3(size[0] / 2, size[1] / 2, size[2] / 2)));
      else body.addShape(new CANNON.Box(new CANNON.Vec3(size[0] / 2, size[1] / 2, size[0] / 2)));
      // поворот позы вокруг Y
      body.position.set(pos.x + c[0] * cy + c[2] * sy, pos.y + c[1], pos.z - c[0] * sy + c[2] * cy);
      body.quaternion.copy(q);
      body.sleepSpeedLimit = 0.15; body.sleepTimeLimit = 1.5;
      body.interpolatedPosition.copy(body.position); body.interpolatedQuaternion.copy(body.quaternion);
      body.rd = this; body.part = name;
      const faceOpts = { map: faceTex(this.colors.skin, 'ok') };
      const m = name === 'head'
        ? (QP.lite ? new THREE.MeshLambertMaterial(faceOpts) : new THREE.MeshStandardMaterial(Object.assign(faceOpts, { roughness: 0.7 })))
        : mat({ color: this.colors[colKey], roughness: 0.8 }, 'rag' + this.colors[colKey]);
      const mesh = new THREE.Mesh(geo(kind, size), m);
      if (name.startsWith('lLeg')) { const shoe = new THREE.Mesh(SHOE_GEO, mat({ color: '#1d1d1d' }, 'shoe')); shoe.position.set(0, -0.2, 0.04); shoe.castShadow = true; mesh.add(shoe); }
      mesh.castShadow = true; mesh.receiveShadow = !QP.lite;
      mesh.userData.body = body;
      body.mesh = mesh;
      body.addEventListener('collide', e => this._collide(body, e));
      // проснулась одна часть — просыпается весь человечек
      body.addEventListener('wakeup', () => { for (const q of this.parts) if (q.body.sleepState) q.body.wakeUp(); });
      const p = { name, body, mesh, dmg: 0, center: c, size, kind };
      this.parts.push(p); this.by[name] = p;
      env.world.addBody(body); env.scene.add(mesh);
    }
    for (const [child, parent, pv, angle, twist] of JOINTS) {
      const a = this.by[child], b = this.by[parent];
      const pivotA = new CANNON.Vec3(pv[0] - a.center[0], pv[1] - a.center[1], pv[2] - a.center[2]);
      const pivotB = new CANNON.Vec3(pv[0] - b.center[0], pv[1] - b.center[1], pv[2] - b.center[2]);
      const c = new CANNON.ConeTwistConstraint(a.body, b.body, {
        pivotA, pivotB, axisA: CANNON.Vec3.UNIT_Y, axisB: CANNON.Vec3.UNIT_Y, angle, twistAngle: twist, collideConnected: false, maxForce: 1e6,
      });
      env.world.addConstraint(c);
      this.joints[child] = { c, parent, pivotA };
    }
    this.headMat = this.by.head.mesh.material;
  }

  get bodies() { return this.parts.map(p => p.body); }
  get pelvis() { return this.by.pelvis.body; }

  _collide(body, e) {
    const other = e.body;
    if (other.rd === this) return;
    const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
    this.env.onImpact(this, body.part, v, other);
  }

  /** урон: amount — HP, part — какая часть тела, stun — сколько секунд оглушения */
  hurt(amount, part, stun = 0) {
    if (part && this.by[part]) this.by[part].dmg += amount;
    if (stun > 0) this.stun = Math.max(this.stun, stun);
    if (!this.alive) return false;
    this.hp -= amount * (part === 'head' ? 2.2 : 1);
    if (this.hp <= 0) { this.kill(); return true; }
    return false;
  }
  kill() {
    if (!this.alive) return;
    this.alive = false; this.hp = 0; this.stand = 0;
    this.setFace('dead');
    for (const p of this.parts) { p.body.angularDamping = 0.5; }
  }
  setFace(state) {
    if (this.faceState === state) return;
    this.faceState = state;
    this.headMat.map = faceTex(this.colors.skin, state); this.headMat.needsUpdate = true;
  }

  /** оторвать часть тела от родителя; возвращает мировую точку разрыва или null */
  detach(name) {
    const j = this.joints[name];
    if (!j) return null;
    this.env.world.removeConstraint(j.c);
    delete this.joints[name];
    const b = this.by[name].body;
    const p = new THREE.Vector3();
    b.pointToWorldFrame(j.pivotA, V); p.set(V.x, V.y, V.z);
    this.stumps.push({ body: b, local: j.pivotA.clone(), t: 2.5 });
    this.stumps.push({ body: this.by[j.parent].body, local: (() => { this.by[j.parent].body.pointToLocalFrame(V, V2); return V2.clone(); })(), t: 3.5 });
    if (name === 'head' || name === 'chest') this.kill();
    else this.hurt(35, name, 4);
    return p;
  }
  canStand() {
    return this.alive && this.joints.head && this.joints.chest && this.joints.uLegL && this.joints.lLegL && this.joints.uLegR && this.joints.lLegR;
  }

  /** вызывается перед каждым шагом физики */
  preStep(dt, time, getup, gScale = 1) {
    if (this.stun > 0) this.stun -= dt;
    if (this.alive) this.setFace(this.stun > 0 || this.grabbed ? 'stun' : 'ok');
    const active = getup && this.stun <= 0 && !this.grabbed && this.canStand();
    if (!active) { this.stand = 0; return; }
    this.stand = Math.min(1, this.stand + dt * 0.6);
    if (time - this.groundT > 0.25) return; // ноги не на опоре — висит/летит
    const s = this.stand * this.stand;
    const head = this.by.head.body, chest = this.by.chest.body, pelvis = this.by.pelvis.body;
    const fl = this.by.lLegL.body, fr = this.by.lLegR.body;
    for (const b of this.parts) if (b.body.sleepState) b.body.wakeUp();
    const footY = Math.min(fl.position.y, fr.position.y) - 0.2;
    // вертикальная «пружина» + компенсация веса
    const W = TOTAL_MASS * 9.82 * gScale;
    const lift = (b, targetH, k, c, ff, maxF) => {
      const dy = footY + targetH - b.position.y;
      const f = Math.max(-80, Math.min(maxF, ff + k * dy - c * b.velocity.y)) * s;
      b.force.y += f;
    };
    // в сумме меньше веса: часть веса всегда на ногах (трение, никаких подпрыгиваний)
    lift(chest, 1.36, 1800, 220, W * 0.42, W * 0.75);
    lift(head, 1.79, 500, 50, W * 0.08, W * 0.2);
    lift(pelvis, 1.01, 500, 80, W * 0.08, W * 0.18);
    // держим корпус и ноги вертикально
    const upright = (b, k, c) => {
      b.quaternion.vmult(UP, V);         // текущий «верх» тела
      V.cross(UP, V2);                   // ось поворота к вертикали
      b.torque.x += (V2.x * k - b.angularVelocity.x * c) * s;
      b.torque.z += (V2.z * k - b.angularVelocity.z * c) * s;
      b.torque.y += (-b.angularVelocity.y * c * 0.5) * s;
    };
    upright(chest, 260, 28);
    upright(pelvis, 70, 7);
    upright(this.by.uLegL.body, 45, 5); upright(this.by.uLegR.body, 45, 5);
    upright(fl, 25, 3); upright(fr, 25, 3);
    // лёгкое покачивание, чтобы стоял «живо»
    const sway = Math.sin(time * 1.3 + this.id) * 6 * s;
    chest.torque.x += sway; chest.torque.z += Math.cos(time * 0.9 + this.id * 2) * 4 * s;
  }

  sync(interp) {
    for (const p of this.parts) {
      const b = p.body, m = p.mesh;
      const pp = interp ? b.interpolatedPosition : b.position, qq = interp ? b.interpolatedQuaternion : b.quaternion;
      m.position.set(pp.x, pp.y, pp.z); m.quaternion.set(qq.x, qq.y, qq.z, qq.w);
    }
  }

  remove() {
    const { world, scene } = this.env;
    for (const k in this.joints) world.removeConstraint(this.joints[k].c);
    this.joints = {};
    for (const p of this.parts) { world.removeBody(p.body); scene.remove(p.mesh); }
    this.headMat.dispose();
    this.removed = true;
  }
}
