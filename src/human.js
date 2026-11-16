// Человечек: 10 тел на шарнирах (вид сбоку), моторы в суставах держат позу.
// Здоровье тканей по частям, переломы, кровопотеря, боль, сознание, смерть.
import { Vec2, Box, Circle, RevoluteJoint } from 'planck';

// имя: форма, размеры (полуразмеры для box), центр (стоя, ступни на y=0, лицом вправо), масса
const PARTS = {
  head:  { circle: 0.13, c: [0, 1.69], mass: 5 },
  upper: { box: [0.14, 0.2], c: [0, 1.33], mass: 24 },
  lower: { box: [0.13, 0.14], c: [0, 0.99], mass: 14 },
  uArmF: { box: [0.055, 0.16], c: [0, 1.33], mass: 2.5 },
  lArmF: { box: [0.05, 0.15], c: [0, 1.02], mass: 1.8, hand: true },
  uArmB: { box: [0.055, 0.16], c: [0, 1.33], mass: 2.5, back: true },
  lArmB: { box: [0.05, 0.15], c: [0, 1.02], mass: 1.8, hand: true, back: true },
  uLegF: { box: [0.07, 0.21], c: [0, 0.645], mass: 8 },
  lLegF: { box: [0.06, 0.2], c: [0, 0.22], mass: 4.5, foot: true },
  uLegB: { box: [0.07, 0.21], c: [0, 0.645], mass: 8, back: true },
  lLegB: { box: [0.06, 0.2], c: [0, 0.22], mass: 4.5, foot: true, back: true },
};
// порядок отрисовки: дальние конечности, корпус, ближние
export const DRAW_ORDER = ['uArmB', 'lArmB', 'uLegB', 'lLegB', 'lower', 'upper', 'head', 'uLegF', 'lLegF', 'uArmF', 'lArmF'];
// сустав: родитель, ребёнок, точка, предел (лицом вправо, + = против часовой), момент мотора
const JOINTS = {
  neck:      ['upper', 'head',  [0, 1.545], -0.6, 0.5, 18],
  spine:     ['lower', 'upper', [0, 1.13], -0.8, 0.3, 170],
  shoulderF: ['upper', 'uArmF', [0, 1.48], -1.2, 3.0, 45],
  elbowF:    ['uArmF', 'lArmF', [0, 1.17], 0, 2.6, 28],
  shoulderB: ['upper', 'uArmB', [0, 1.48], -1.2, 3.0, 32],
  elbowB:    ['uArmB', 'lArmB', [0, 1.17], 0, 2.6, 20],
  hipF:      ['lower', 'uLegF', [0, 0.85], -0.6, 2.2, 170],
  kneeF:     ['uLegF', 'lLegF', [0, 0.435], -2.5, 0, 150],
  hipB:      ['lower', 'uLegB', [0, 0.85], -0.6, 2.2, 170],
  kneeB:     ['uLegB', 'lLegB', [0, 0.435], -2.5, 0, 150],
};
const STAND = { neck: 0, spine: 0.02, shoulderF: 0.12, elbowF: 0.15, shoulderB: -0.05, elbowB: 0.1, hipF: 0.06, kneeF: -0.06, hipB: -0.03, kneeB: -0.03 };
const AIM = { shoulderF: 1.52, elbowF: 0.04, shoulderB: 1.3, elbowB: 0.45 };
const MELEE = { shoulderF: 0.75, elbowF: 1.35 };
export const HUMAN_MASS = Object.values(PARTS).reduce((s, p) => s + p.mass, 0);

const SKINS = ['#f2c9a3', '#e3b088', '#c99063', '#9a643f', '#6e4429', '#f7dcc4'];
const SHIRTS = ['#4f7fc4', '#c44f4f', '#4fa66a', '#d9a33a', '#8455c4', '#e6e6e6', '#3b3b3b', '#3fb3b0', '#e07b39', '#a3a3a3'];
const PANTS = ['#36456b', '#3c3c3c', '#5b4630', '#4b5a3c', '#26324f', '#6d6d6d'];
const HAIR = ['#2b1d12', '#4a2f1b', '#7a5532', '#1a1a1a', '#b88a4a', '#8c8c8c'];
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const normA = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
let NEXT = 1;

export class Human {
  constructor(world, x, y, dir = 1, opts = {}) {
    this.world = world; this.id = NEXT++; this.dir = dir; this.gid = this.id;
    this.look = { skin: pick(SKINS), shirt: pick(SHIRTS), pants: pick(PANTS), hair: pick(HAIR), shoe: '#222222', bald: Math.random() < 0.15 };
    this.blood = 1; this.pain = 0; this.stun = 0; this.alive = true; this.conscious = true;
    this.stand = 1; this.groundT = -9; this.grabbed = 0; this.held = null; this.stumps = [];
    this.parts = {}; this.joints = {};
    for (const name in PARTS) {
      const d = PARTS[name];
      const body = world.createBody({ type: 'dynamic', position: Vec2(x + d.c[0] * dir, y + d.c[1]), angularDamping: 0.6, linearDamping: 0.02 });
      let area;
      const fx = [];
      if (d.circle) { fx.push(new Circle(d.circle)); area = Math.PI * d.circle * d.circle; }
      else { fx.push(new Box(d.box[0], d.box[1])); area = 4 * d.box[0] * d.box[1]; }
      if (d.foot) { fx.push(new Box(0.1, 0.035, Vec2(0.05 * dir, -0.17), 0)); area += 0.014; }
      if (d.hand) { fx.push(new Circle(Vec2(0, -0.155), 0.05)); area += Math.PI * 0.0025; }
      const density = d.mass / area;
      for (const s of fx) body.createFixture(s, { density, friction: d.foot ? 0.9 : 0.6, restitution: 0.04, filterGroupIndex: -this.gid });
      const part = { name, body, def: d, hp: 1, broken: false, wounds: [], bleed: 0, connected: true };
      body.setUserData({ kind: 'part', human: this, part });
      this.parts[name] = part;
    }
    for (const jn in JOINTS) {
      const [pa, ch, at, lo, hi, torque] = JOINTS[jn];
      const L = dir > 0 ? lo : -hi, H = dir > 0 ? hi : -lo;
      const j = world.createJoint(new RevoluteJoint({ enableLimit: true, lowerAngle: L, upperAngle: H, enableMotor: true, maxMotorTorque: torque, motorSpeed: 0, collideConnected: false },
        this.parts[pa].body, this.parts[ch].body, Vec2(x + at[0] * dir, y + at[1])));
      this.joints[jn] = { name: jn, j, parent: pa, child: ch, torque, broken: false, severed: false, anchor: at };
      this.parts[ch].joint = jn;
    }
  }

  get bodies() { return Object.values(this.parts).map(p => p.body); }
  get torso() { return this.parts.upper.body; }
  handPoint(side = 'F') { return this.parts['lArm' + side].body.getWorldPoint(Vec2(0, -0.17)); }

  state() {
    if (!this.alive) return 'dead';
    if (!this.conscious) return 'out';
    if (this.pain > 0.45 || this.stun > 0) return 'pain';
    return 'ok';
  }

  /** урон: amount ~ доля здоровья ткани; type: blunt | sharp | bullet | blast */
  damage(partName, amount, type, worldPoint) {
    const p = this.parts[partName];
    if (!p || amount <= 0) return;
    p.hp -= amount;
    this.pain += amount * (type === 'blunt' ? 1.3 : 1.8);
    if (worldPoint && (type === 'sharp' || type === 'bullet' || type === 'blast' && Math.random() < 0.5)) {
      const lp = p.body.getLocalPoint(worldPoint);
      if (p.wounds.length < 8) p.wounds.push({ x: lp.x, y: lp.y, r: type === 'bullet' ? 0.022 : 0.03 + Math.random() * 0.02 });
      p.bleed += type === 'bullet' ? 0.16 : type === 'sharp' ? 0.12 : 0.06;
    }
    if (type === 'blunt' && amount > 0.28 && p.joint && partName !== 'head' && Math.random() < 0.6) this.breakBone(partName);
    if (type === 'blast' && amount > 0.5 && p.joint && Math.random() < 0.4) this.breakBone(partName);
    if (partName === 'head') {
      if (amount > 0.12) this.stun = Math.max(this.stun, amount * 8);
      if (p.hp <= 0) this.kill();
    }
    if (partName === 'upper' && p.hp <= -0.3) this.kill();
    if (type === 'blunt' && amount > 0.08) this.stun = Math.max(this.stun, amount * 5);
  }
  breakBone(partName) {
    const p = this.parts[partName];
    if (p.broken || !p.joint) return false;
    p.broken = true;
    const J = this.joints[p.joint];
    if (J && !J.severed) { J.broken = true; J.j.enableLimit(false); }
    this.pain += 0.6;
    return true;
  }
  /** вызывать только когда мир не заблокирован (вне шага физики) */
  sever(partName) {
    const p = this.parts[partName];
    if (!p || !p.joint) return null;
    const J = this.joints[p.joint];
    if (!J || J.severed) return null;
    const anchorW = J.j.getAnchorB();
    this.world.destroyJoint(J.j);
    J.severed = true;
    const pa = this.parts[J.parent];
    this.stumps.push({ part: p, local: p.body.getLocalPoint(anchorW), t: 4 });
    this.stumps.push({ part: pa, local: pa.body.getLocalPoint(anchorW), t: 6 });
    p.bleed += 0.4; pa.bleed += 0.8;
    this.pain += 1.5;
    this._connectivity();
    if (partName === 'head' || partName === 'upper') this.kill();
    if (this.held && !this.parts['lArm' + this.held.side].connected) this.held = null;
    return anchorW;
  }
  _connectivity() {
    for (const n in this.parts) this.parts[n].connected = false;
    const stack = ['upper']; this.parts.upper.connected = true;
    while (stack.length) {
      const n = stack.pop();
      for (const jn in this.joints) {
        const J = this.joints[jn]; if (J.severed) continue;
        const other = J.parent === n ? J.child : J.child === n ? J.parent : null;
        if (other && !this.parts[other].connected) { this.parts[other].connected = true; stack.push(other); }
      }
    }
  }
  kill() { if (!this.alive) return; this.alive = false; this.conscious = false; this.stand = 0; }
  heal() {
    this.blood = 1; this.pain = 0; this.stun = 0;
    for (const n in this.parts) { const p = this.parts[n]; p.hp = 1; p.wounds = []; p.bleed = 0; p.broken = false; }
    for (const jn in this.joints) { const J = this.joints[jn]; if (!J.severed && J.broken) { J.broken = false; J.j.enableLimit(true); } }
    this.stumps = this.stumps.filter(s => false);
    if (this.parts.head.connected && this.joints.neck && !this.joints.neck.severed && !this.joints.spine.severed) { this.alive = true; this.conscious = true; }
  }
  wake() { if (this.alive) { this.stun = 0; this.pain = Math.min(this.pain, 0.2); if (this.blood < 0.55) this.blood = 0.55; } }
  canStand() {
    const J = this.joints;
    for (const n of ['neck', 'spine', 'hipF', 'kneeF', 'hipB', 'kneeB']) if (J[n].severed || J[n].broken) return false;
    return true;
  }

  /** логика каждого шага физики (до world.step) */
  update(dt, time, getup, gScale) {
    // кровь и боль
    let bleed = 0;
    for (const n in this.parts) { const p = this.parts[n]; bleed += p.bleed; p.bleed *= 1 - 0.015 * dt; }
    this.blood -= bleed * 0.03 * dt;
    this.pain = Math.max(0, this.pain - dt * 0.12);
    if (this.stun > 0) this.stun -= dt;
    if (this.alive && (this.blood < 0.18 || this.parts.head.hp <= 0)) this.kill();
    this.conscious = this.alive && this.blood > 0.45 && this.pain < 1.4 && this.stun <= 0 && this.parts.head.hp > 0.3;

    const active = this.conscious && getup && !this.grabbed && this.canStand();
    this.stand = clamp(this.stand + (active ? dt * 0.5 : -dt * 4), 0, 1);
    const s = this.stand, dir = this.dir;
    const heldKind = this.held ? this.held.item.def.hold : null;
    for (const jn in this.joints) {
      const J = this.joints[jn];
      if (J.severed) continue;
      const j = J.j;
      const connected = this.parts[J.child].connected && this.parts[J.parent].connected;
      if (J.broken || !connected || !this.alive) { j.setMaxMotorTorque(J.broken ? 0.2 : 0.4); j.setMotorSpeed(0); continue; }
      if (!this.conscious) { j.setMaxMotorTorque(J.torque * 0.05); j.setMotorSpeed(0); continue; }
      let target = STAND[jn];
      if (heldKind === 'gun' && AIM[jn] !== undefined) target = AIM[jn];
      if (heldKind === 'melee' && MELEE[jn] !== undefined) target = MELEE[jn];
      target *= dir;
      const ang = j.getJointAngle();
      j.setMotorSpeed(clamp((target - ang) * 10, -14, 14));
      j.setMaxMotorTorque(J.torque * (0.2 + 0.8 * s) * (this.parts[J.child].hp < 0.3 ? 0.4 : 1));
    }
    if (s <= 0.01) return;
    // ноги на опоре?
    const fF = this.parts.lLegF.body, fB = this.parts.lLegB.body, up = this.parts.upper.body, lo = this.parts.lower.body, hd = this.parts.head.body;
    let grounded = false;
    for (const f of [fF, fB]) {
      for (let ce = f.getContactList(); ce; ce = ce.next) {
        if (!ce.contact.isTouching()) continue;
        const ud = ce.other.getUserData();
        if (ud && ud.human === this) continue;
        grounded = true; break;
      }
    }
    if (grounded) this.groundT = time;
    if (time - this.groundT > 0.25) return;
    const W = HUMAN_MASS * 10 * gScale;
    const footY = Math.min(fF.getPosition().y, fB.getPosition().y) - 0.22;
    const lift = (b, h, k, c, ff, maxF) => {
      const dy = footY + h - b.getPosition().y;
      const f = clamp(ff + k * dy - c * b.getLinearVelocity().y, -80, maxF) * s * s;
      b.applyForceToCenter(Vec2(0, f), true);
    };
    lift(up, 1.33, 1700, 210, W * 0.42, W * 0.75);
    lift(hd, 1.69, 400, 40, W * 0.06, W * 0.15);
    lift(lo, 0.99, 500, 70, W * 0.08, W * 0.18);
    const upright = (b, k, c) => { const a = normA(b.getAngle()); b.applyTorque((-a * k - b.getAngularVelocity() * c) * s, true); };
    upright(up, 320, 26); upright(lo, 110, 9);
    // держим ноги под корпусом, чтобы не разъезжались
    const px = lo.getPosition().x;
    for (const f of [fF, fB]) { const dx = px - f.getPosition().x; f.applyForceToCenter(Vec2(clamp(dx * 300, -120, 120) * s, 0), true); }
  }
}

// ---------------- отрисовка ----------------
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * k), g = Math.round(((n >> 8) & 255) * k), b = Math.round((n & 255) * k);
  return `rgb(${Math.min(255, r)},${Math.min(255, g)},${Math.min(255, b)})`;
}
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }

export function drawHuman(ctx, h, highlight) {
  const L = h.look, dir = h.dir;
  for (const name of DRAW_ORDER) {
    const p = h.parts[name], d = p.def, b = p.body;
    const pos = b.getPosition();
    ctx.save();
    ctx.translate(pos.x, pos.y); ctx.rotate(b.getAngle());
    const k = d.back ? 0.78 : 1;
    if (name === 'head') {
      const r = d.circle;
      ctx.fillStyle = shade(L.skin, 1); ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
      // нос
      ctx.beginPath(); ctx.arc(r * 0.95 * dir, -0.005, 0.028, 0, 7); ctx.fill();
      // волосы: шапочка сверху и сзади
      if (!L.bald) {
        ctx.fillStyle = L.hair; ctx.beginPath();
        if (dir > 0) ctx.arc(0, 0, r * 1.04, Math.PI * 0.12, Math.PI * 1.18, false);
        else ctx.arc(0, 0, r * 1.04, Math.PI * -0.18, Math.PI * 0.88, false);
        ctx.lineTo(0, r * 0.15); ctx.closePath(); ctx.fill();
      }
      drawFace(ctx, h.state(), dir, r);
    } else {
      const [hx, hy] = d.box;
      let col = name === 'upper' || name.startsWith('uArm') ? L.shirt : name === 'lower' || name.includes('Leg') ? L.pants : L.skin;
      ctx.fillStyle = shade(col, k);
      rr(ctx, -hx, -hy, hx * 2, hy * 2, Math.min(hx, hy) * 0.9); ctx.fill();
      if (name === 'lower') { ctx.fillStyle = shade('#3a2a1a', k); ctx.fillRect(-hx, hy - 0.04, hx * 2, 0.035); }
      if (name === 'upper') { ctx.fillStyle = shade(col, 0.85); ctx.fillRect(-hx * 0.15 + hx * 0.55 * dir, -hy * 0.6, 0.012, hy * 1.3); }
      if (d.hand) { ctx.fillStyle = shade(L.skin, k * 0.95); ctx.beginPath(); ctx.arc(0, -0.155, 0.05, 0, 7); ctx.fill(); }
      if (d.foot) { ctx.fillStyle = shade(L.shoe, k); rr(ctx, 0.05 * dir - 0.1, -0.205, 0.2, 0.07, 0.03); ctx.fill(); }
    }
    // синяки и раны
    if (p.hp < 0.75) {
      ctx.fillStyle = `rgba(70,15,30,${Math.min(0.28, (0.75 - p.hp) * 0.4)})`;
      if (d.circle) { ctx.beginPath(); ctx.arc(0, 0, d.circle, 0, 7); ctx.fill(); }
      else { rr(ctx, -d.box[0], -d.box[1], d.box[0] * 2, d.box[1] * 2, Math.min(d.box[0], d.box[1]) * 0.9); ctx.fill(); }
    }
    for (const w of p.wounds) {
      ctx.fillStyle = '#6b0a0a'; ctx.beginPath(); ctx.arc(w.x, w.y, w.r, 0, 7); ctx.fill();
      ctx.fillStyle = '#2a0303'; ctx.beginPath(); ctx.arc(w.x, w.y, w.r * 0.5, 0, 7); ctx.fill();
    }
    if (highlight) {
      ctx.strokeStyle = highlight; ctx.lineWidth = 0.02;
      if (d.circle) { ctx.beginPath(); ctx.arc(0, 0, d.circle, 0, 7); ctx.stroke(); }
      else { rr(ctx, -d.box[0], -d.box[1], d.box[0] * 2, d.box[1] * 2, Math.min(d.box[0], d.box[1]) * 0.9); ctx.stroke(); }
    }
    if (p.frozen) {
      ctx.strokeStyle = '#6fd3ff'; ctx.lineWidth = 0.025;
      if (d.circle) { ctx.beginPath(); ctx.arc(0, 0, d.circle, 0, 7); ctx.stroke(); }
      else { rr(ctx, -d.box[0], -d.box[1], d.box[0] * 2, d.box[1] * 2, 0.03); ctx.stroke(); }
    }
    ctx.restore();
  }
  // культи
  for (const s of h.stumps) {
    const w = s.part.body.getWorldPoint(s.local);
    ctx.fillStyle = '#8e1010'; ctx.beginPath(); ctx.arc(w.x, w.y, 0.05, 0, 7); ctx.fill();
    ctx.fillStyle = '#e8dcc8'; ctx.beginPath(); ctx.arc(w.x, w.y, 0.018, 0, 7); ctx.fill();
  }
}
function drawFace(ctx, st, dir, r) {
  const ex = r * 0.5 * dir, ey = r * 0.18;
  ctx.strokeStyle = '#1a1a1a'; ctx.fillStyle = '#1a1a1a'; ctx.lineCap = 'round';
  if (st === 'dead') {
    ctx.lineWidth = 0.014; const s = 0.022;
    ctx.beginPath(); ctx.moveTo(ex - s, ey - s); ctx.lineTo(ex + s, ey + s); ctx.moveTo(ex - s, ey + s); ctx.lineTo(ex + s, ey - s); ctx.stroke();
    ctx.lineWidth = 0.01; ctx.beginPath(); ctx.moveTo(r * 0.35 * dir, -r * 0.5); ctx.lineTo(r * 0.75 * dir, -r * 0.45); ctx.stroke();
  } else if (st === 'out') {
    ctx.lineWidth = 0.012; ctx.beginPath(); ctx.moveTo(ex - 0.022, ey); ctx.lineTo(ex + 0.022, ey); ctx.stroke();
    ctx.lineWidth = 0.01; ctx.beginPath(); ctx.arc(r * 0.6 * dir, -r * 0.48, 0.018, 0, 7); ctx.stroke();
  } else if (st === 'pain') {
    ctx.lineWidth = 0.012;
    ctx.beginPath(); ctx.moveTo(ex - 0.024, ey + 0.02); ctx.lineTo(ex + 0.02, ey - 0.005); ctx.stroke();
    ctx.beginPath(); ctx.arc(ex, ey - 0.012, 0.014, 0, 7); ctx.fill();
    ctx.fillStyle = '#5a1515'; ctx.beginPath(); ctx.ellipse(r * 0.62 * dir, -r * 0.5, 0.03, 0.022, 0, 0, 7); ctx.fill();
  } else {
    ctx.beginPath(); ctx.arc(ex, ey, 0.017, 0, 7); ctx.fill();
    ctx.lineWidth = 0.012; ctx.beginPath(); ctx.moveTo(ex - 0.03, ey + 0.045); ctx.lineTo(ex + 0.025, ey + 0.05); ctx.stroke();
    ctx.lineWidth = 0.01; ctx.beginPath(); ctx.moveTo(r * 0.4 * dir, -r * 0.48); ctx.lineTo(r * 0.78 * dir, -r * 0.42); ctx.stroke();
  }
}
