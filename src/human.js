// Человек в стиле People Playground: 14 частей тела на шарнирах, пиксельные спрайты,
// моторы в суставах держат позу. Здоровье по частям, кровопотеря со свёртыванием,
// боль/шок, переломы, сознание. Смерть — только от мозга, сердца или потери крови.
import { Vec2, Box, RevoluteJoint } from 'planck';

export const PX = 1 / 28; // размер «пикселя» спрайта в метрах

// box: полуразмеры; c: центр (стоя, ступни на y=0, лицом вправо); mass: кг
const PARTS = {
  head:  { box: [0.12, 0.14], c: [0.01, 1.70], mass: 5, skin: true },
  upper: { box: [0.14, 0.12], c: [0, 1.43], mass: 16 },
  middle:{ box: [0.13, 0.10], c: [0, 1.21], mass: 10 },
  lower: { box: [0.135, 0.09], c: [0, 1.02], mass: 10 },
  uArmF: { box: [0.05, 0.15], c: [0, 1.39], mass: 2.5 },
  lArmF: { box: [0.045, 0.15], c: [0, 1.09], mass: 1.8, hand: true, skin: true },
  uArmB: { box: [0.05, 0.15], c: [0, 1.39], mass: 2.5, back: true },
  lArmB: { box: [0.045, 0.15], c: [0, 1.09], mass: 1.8, hand: true, skin: true, back: true },
  uLegF: { box: [0.065, 0.22], c: [0, 0.73], mass: 8 },
  lLegF: { box: [0.055, 0.2], c: [0, 0.31], mass: 4 },
  footF: { box: [0.1, 0.045], c: [0.04, 0.045], mass: 1.2, foot: true },
  uLegB: { box: [0.065, 0.22], c: [0, 0.73], mass: 8, back: true },
  lLegB: { box: [0.055, 0.2], c: [0, 0.31], mass: 4, back: true },
  footB: { box: [0.1, 0.045], c: [0.04, 0.045], mass: 1.2, foot: true, back: true },
};
export const PART_NAMES = Object.keys(PARTS);
export const PART_RU = {
  head: 'Голова', upper: 'Грудь', middle: 'Живот', lower: 'Таз',
  uArmF: 'Плечо (ближн.)', lArmF: 'Предплечье (ближн.)', uArmB: 'Плечо (дальн.)', lArmB: 'Предплечье (дальн.)',
  uLegF: 'Бедро (ближн.)', lLegF: 'Голень (ближн.)', footF: 'Стопа (ближн.)', uLegB: 'Бедро (дальн.)', lLegB: 'Голень (дальн.)', footB: 'Стопа (дальн.)',
};
// порядок отрисовки: дальние конечности, корпус, ближние
export const DRAW_ORDER = ['uArmB', 'lArmB', 'uLegB', 'lLegB', 'footB', 'lower', 'middle', 'upper', 'head', 'uLegF', 'lLegF', 'footF', 'uArmF', 'lArmF'];
// сустав: родитель, ребёнок, точка, предел (лицом вправо, + = против часовой), момент мотора
const JOINTS = {
  neck:      ['upper', 'head',   [0, 1.555], -0.5, 0.5, 25],
  chest:     ['middle', 'upper', [0, 1.31], -0.45, 0.3, 170],
  waist:     ['lower', 'middle', [0, 1.11], -0.55, 0.3, 170],
  shoulderF: ['upper', 'uArmF',  [0, 1.51], -1.2, 3.0, 45],
  elbowF:    ['uArmF', 'lArmF',  [0, 1.24], 0, 2.6, 28],
  shoulderB: ['upper', 'uArmB',  [0, 1.51], -1.2, 3.0, 32],
  elbowB:    ['uArmB', 'lArmB',  [0, 1.24], 0, 2.6, 20],
  hipF:      ['lower', 'uLegF',  [0, 0.93], -0.6, 2.2, 180],
  kneeF:     ['uLegF', 'lLegF',  [0, 0.51], -2.5, 0, 150],
  ankleF:    ['lLegF', 'footF',  [0, 0.1], -0.6, 0.6, 60],
  hipB:      ['lower', 'uLegB',  [0, 0.93], -0.6, 2.2, 180],
  kneeB:     ['uLegB', 'lLegB',  [0, 0.51], -2.5, 0, 150],
  ankleB:    ['lLegB', 'footB',  [0, 0.1], -0.6, 0.6, 60],
};
const STAND = { neck: 0, chest: 0.02, waist: 0.0, shoulderF: 0.12, elbowF: 0.15, shoulderB: -0.05, elbowB: 0.1, hipF: 0.06, kneeF: -0.06, ankleF: 0, hipB: -0.03, kneeB: -0.03, ankleB: 0 };
const AIM = { shoulderF: 1.52, elbowF: 0.04, shoulderB: 1.3, elbowB: 0.45 };
const MELEE = { shoulderF: 0.75, elbowF: 1.35 };
const WPH = { neck: 0.4, shoulderF: 0, elbowF: 1.3, shoulderB: 2.1, elbowB: 3.0, hipF: 0.8, kneeF: 2.4, hipB: 3.9, kneeB: 5.1, ankleF: 1.1, ankleB: 4.2 };
export const HUMAN_MASS = Object.values(PARTS).reduce((s, p) => s + p.mass, 0);
export const HAND_LOCAL = [0, -0.14];

// кровотечение (доля всей крови в секунду) от одной раны в этой части
const BLEED = { head: 0.008, upper: 0.012, middle: 0.012, lower: 0.01, uArmF: 0.006, uArmB: 0.006, lArmF: 0.004, lArmB: 0.004, uLegF: 0.009, uLegB: 0.009, lLegF: 0.005, lLegB: 0.005, footF: 0.003, footB: 0.003 };
// насколько больно получать урон в эту часть
const PAIN = { head: 1.5, upper: 1.2, middle: 1.2, lower: 1.0 };
export const VITAL = { head: 'мозг', upper: 'сердце и лёгкие' };

const SKINS = ['#f0c8a0', '#e3b088', '#c99063', '#9a643f', '#6e4429', '#f7dcc4'];
const SHIRTS = ['#4f6f9c', '#9c4f4f', '#4f8a5e', '#c9a03a', '#6e55a0', '#d8d8d8', '#3b3b3b', '#3f9a98', '#c06a32', '#8c8c8c'];
const PANTS = ['#3a4a70', '#3c3c3c', '#5b4630', '#4b5a3c', '#26324f', '#6d6d6d'];
const HAIR = ['#2b1d12', '#4a2f1b', '#7a5532', '#1a1a1a', '#b88a4a', '#8c8c8c'];
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const normA = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
let NEXT = 1;

export class Human {
  constructor(world, x, y, dir = 1, opts = {}) {
    this.world = world; this.id = NEXT++; this.dir = dir; this.gid = this.id;
    this.dummy = !!opts.dummy;
    this.look = this.dummy ? { skin: '#e8c23a', shirt: '#e8c23a', pants: '#d9b02a', hair: '#000', shoe: '#2a2a2a', bald: true }
      : { skin: pick(SKINS), shirt: pick(SHIRTS), pants: pick(PANTS), hair: pick(HAIR), shoe: '#262626', bald: Math.random() < 0.12 };
    this.adren = 0; this.strong = 0; this.poison = 0;
    this.blood = 1; this.pain = 0; this.stun = 0; this.alive = true; this.conscious = true; this.cause = '';
    this.stand = 1; this.groundT = -9; this.grabbed = 0; this.held = null; this.stumps = [];
    this.parts = {}; this.joints = {}; this.sprites = null;
    for (const name in PARTS) {
      const d = PARTS[name];
      const body = world.createBody({ type: 'dynamic', position: Vec2(x + d.c[0] * dir, y + d.c[1]), angularDamping: 0.6, linearDamping: 0.02 });
      const area = 4 * d.box[0] * d.box[1];
      body.createFixture(new Box(d.box[0], d.box[1]), { density: d.mass / area, friction: d.foot ? 0.95 : 0.6, restitution: 0.03, filterGroupIndex: -this.gid });
      const part = { name, body, def: d, hp: 1, broken: false, wounds: [], bleed: 0, connected: true, burn: 0, char: 0 };
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
  handPoint(side = 'F') { return this.parts['lArm' + side].body.getWorldPoint(Vec2(HAND_LOCAL[0], HAND_LOCAL[1])); }

  state() {
    if (this.dummy) return 'dummy';
    if (!this.alive) return 'dead';
    if (!this.conscious) return 'out';
    if (this.pain > 0.45 || this.stun > 0 || this.isBurning()) return 'pain';
    return 'ok';
  }

  /** урон: amount — доля здоровья части; type: blunt | sharp | bullet | blast | burn */
  damage(partName, amount, type, worldPoint, severity = 1) {
    const p = this.parts[partName];
    if (!p || amount <= 0) return;
    if (this.dummy) {
      p.hp -= amount;
      if (type === 'blunt' && amount > 0.35 && p.joint && Math.random() < 0.5) this.breakBone(partName);
      if (worldPoint && type !== 'blunt' && p.wounds.length < 10) { const lp = p.body.getLocalPoint(worldPoint); p.wounds.push({ x: lp.x, y: lp.y, s: 1, dent: true }); }
      return;
    }
    if (this.adren > 0) amount *= 0.7;
    p.hp -= amount;
    this.pain += amount * (PAIN[partName] || 0.8) * (type === 'blunt' ? 1 : 1.3) * (this.adren > 0 ? 0.15 : 1);
    if (worldPoint && (type === 'sharp' || type === 'bullet' || (type === 'blast' && Math.random() < 0.5))) {
      const lp = p.body.getLocalPoint(worldPoint);
      if (p.wounds.length < 10) p.wounds.push({ x: lp.x, y: lp.y, s: type === 'bullet' ? 1 : 2 });
      p.bleed += BLEED[partName] * severity * (type === 'blast' ? 0.6 : 1);
    }
    if (type === 'blunt' && amount > 0.3 && p.joint && partName !== 'head' && Math.random() < 0.55) this.breakBone(partName);
    if (type === 'blast' && amount > 0.5 && p.joint && Math.random() < 0.35) this.breakBone(partName);
    if (partName === 'head') {
      if (type === 'blunt' && amount > 0.1) this.stun = Math.max(this.stun, amount * 8);
      if (p.hp <= 0) this.kill('мозг разрушен');
    } else if (type === 'blunt' && amount > 0.15) this.stun = Math.max(this.stun, amount * 3);
    if (partName === 'upper' && p.hp <= -0.35) this.kill('сердце остановилось');
  }
  breakBone(partName) {
    const p = this.parts[partName];
    if (p.broken || !p.joint) return false;
    p.broken = true;
    const J = this.joints[p.joint];
    if (J && !J.severed) { J.broken = true; J.j.enableLimit(false); }
    this.pain += 0.5;
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
    this.stumps.push({ part: p, local: p.body.getLocalPoint(anchorW), t: 5 });
    this.stumps.push({ part: pa, local: pa.body.getLocalPoint(anchorW), t: 10 });
    if (!this.dummy) {
      const big = partName === 'head' || partName.startsWith('uLeg') || partName === 'upper' || partName === 'middle' ? 0.06 : partName.startsWith('uArm') ? 0.04 : 0.025;
      pa.bleed += big; p.bleed += big * 0.3;
      this.pain += 1.2;
    }
    this._connectivity();
    if (partName === 'head') this.kill('обезглавлен');
    else if (partName === 'upper' || partName === 'middle') this.kill('тело разорвано');
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
  kill(cause) { if (!this.alive) return; this.alive = false; this.conscious = false; this.stand = 0; this.cause = cause || this.cause || 'погиб'; }
  heal() {
    this.blood = 1; this.pain = 0; this.stun = 0; this.poison = 0;
    for (const n in this.parts) { const p = this.parts[n]; p.hp = 1; p.wounds = []; p.bleed = 0; p.broken = false; p.burn = 0; p.char = 0; }
    for (const jn in this.joints) { const J = this.joints[jn]; if (!J.severed && J.broken) { J.broken = false; J.j.enableLimit(true); } }
    this.stumps = this.stumps.filter(s => false);
    if (this.parts.head.connected && !this.joints.neck.severed && !this.joints.chest.severed && !this.joints.waist.severed) { this.alive = true; this.conscious = true; this.cause = ''; }
  }
  wake() { if (this.alive) { this.stun = 0; this.pain = Math.min(this.pain, 0.2); if (this.blood < 0.55) this.blood = 0.55; } }
  isBurning() { for (const n in this.parts) if (this.parts[n].burn > 0) return true; return false; }
  canStand() {
    const J = this.joints;
    for (const n of ['neck', 'chest', 'waist', 'hipF', 'kneeF', 'hipB', 'kneeB']) if (J[n].severed || J[n].broken) return false;
    for (const n of ['uLegF', 'lLegF', 'uLegB', 'lLegB']) if (this.parts[n].hp <= 0) return false;
    return true;
  }
  totalBleed() { let b = 0; for (const n in this.parts) b += this.parts[n].bleed; return b; }

  /** логика каждого шага физики (до world.step) */
  update(dt, time, getup, gScale) {
    if (this.dummy) {
      this.alive = false; this.conscious = false; this.stand = 0;
      for (const jn in this.joints) { const J = this.joints[jn]; if (!J.severed) { J.j.setMaxMotorTorque(J.broken ? 0.2 : 0.6); J.j.setMotorSpeed(0); } }
      return;
    }
    if (this.adren > 0) { this.adren -= dt; this.pain = Math.min(this.pain, 0.1); this.stun = Math.min(this.stun, 0); if (this.blood < 0.5) this.blood = 0.5; }
    if (this.strong > 0) this.strong -= dt;
    if (this.poison > 0) { this.poison += dt; this.pain += dt * 0.15; if (this.poison > 7) this.kill('отравлен'); }
    // кровь сворачивается: раны постепенно перестают кровить (культи — медленнее)
    let bleed = 0;
    for (const n in this.parts) { const p = this.parts[n]; bleed += p.bleed; p.bleed *= Math.exp(-dt / (this.stumpOn(p) ? 55 : 25)); if (p.bleed < 1e-4) p.bleed = 0; }
    this.blood = Math.max(0, this.blood - bleed * dt);
    this.pain = Math.max(0, this.pain - dt * 0.1);
    if (this.stun > 0) this.stun -= dt;
    if (this.alive && this.blood < 0.2) this.kill('потеря крови');
    if (this.alive && this.parts.head.hp <= 0) this.kill('мозг разрушен');
    this.conscious = this.alive && this.blood > 0.5 && this.pain < 1.6 && this.stun <= 0 && this.parts.head.hp > 0.25;

    const active = this.conscious && getup && !this.grabbed && this.canStand();
    const burning = this.isBurning();
    const writhe = this.alive && this.conscious && (burning || this.poison > 0 || (this.stand < 0.5 && (this.pain > 0.3 || !this.canStand())));
    const power = this.strong > 0 ? 2.2 : 1;
    this.stand = clamp(this.stand + (active ? dt * 0.5 : -dt * 4), 0, 1);
    const s = this.stand, dir = this.dir;
    const heldKind = this.held ? this.held.item.def.hold : null;
    for (const jn in this.joints) {
      const J = this.joints[jn];
      if (J.severed) continue;
      const j = J.j;
      const connected = this.parts[J.child].connected && this.parts[J.parent].connected;
      const dead = this.parts[J.child].hp <= -0.5; // часть размозжена — не слушается
      if (J.broken || !connected || !this.alive || dead) { j.setMaxMotorTorque(J.broken ? 0.2 : 0.4); j.setMotorSpeed(0); continue; }
      if (!this.conscious) { j.setMaxMotorTorque(J.torque * 0.05); j.setMotorSpeed(0); continue; }
      let target = STAND[jn];
      if (heldKind === 'gun' && AIM[jn] !== undefined) target = AIM[jn];
      if (heldKind === 'melee' && MELEE[jn] !== undefined) target = MELEE[jn];
      let tq = J.torque * (0.2 + 0.8 * s) * (this.parts[J.child].hp < 0.3 ? 0.4 : 1) * power;
      if (writhe && jn !== 'chest' && jn !== 'waist') {
        const ph = WPH[jn] || 0, fr = burning ? 9 : this.poison > 0 ? 14 : 4.5;
        target = target * 0.3 + Math.sin(time * fr + ph) * (jn === 'neck' || jn.startsWith('ankle') ? 0.35 : 1.0) + (burning ? Math.sin(time * 23 + ph * 3) * 0.3 : 0);
        tq = Math.max(tq, J.torque * 0.35);
      }
      target *= dir;
      const ang = j.getJointAngle();
      j.setMotorSpeed(clamp((target - ang) * 10, -14, 14));
      j.setMaxMotorTorque(tq);
    }
    if (s <= 0.01) return;
    // опора под ногами?
    const fF = this.parts.footF.body, fB = this.parts.footB.body;
    const up = this.parts.upper.body, mid = this.parts.middle.body, lo = this.parts.lower.body, hd = this.parts.head.body;
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
    const footY = Math.min(fF.getPosition().y, fB.getPosition().y) - 0.045;
    const lift = (b, h, k, c, ff, maxF) => {
      const dy = footY + h - b.getPosition().y;
      const f = clamp(ff + k * dy - c * b.getLinearVelocity().y, -80, maxF) * s * s;
      b.applyForceToCenter(Vec2(0, f), true);
    };
    lift(up, 1.43, 1500, 190, W * 0.36, W * 0.65);
    lift(mid, 1.21, 500, 60, W * 0.1, W * 0.2);
    lift(hd, 1.70, 400, 40, W * 0.06, W * 0.15);
    lift(lo, 1.02, 500, 70, W * 0.08, W * 0.18);
    const upright = (b, k, c) => { const a = normA(b.getAngle()); b.applyTorque((-a * k - b.getAngularVelocity() * c) * s, true); };
    upright(up, 300, 24); upright(mid, 120, 10); upright(lo, 110, 9);
    const px = lo.getPosition().x;
    for (const f of [this.parts.lLegF.body, this.parts.lLegB.body]) { const dx = px - f.getPosition().x; f.applyForceToCenter(Vec2(clamp(dx * 300, -120, 120) * s, 0), true); }
  }
  stumpOn(p) { for (const s of this.stumps) if (s.part === p) return true; return false; }
}

// ---------------- пиксельные спрайты ----------------
function rgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function col(c, k) { return `rgb(${Math.min(255, Math.round(c[0] * k))},${Math.min(255, Math.round(c[1] * k))},${Math.min(255, Math.round(c[2] * k))})`; }
function makeSprite(name, d, look) {
  const w = Math.max(3, Math.round(d.box[0] * 2 / PX)), h = Math.max(2, Math.round(d.box[1] * 2 / PX));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  const k = d.back ? 0.78 : 1;
  const skin = rgb(look.skin), shirt = rgb(look.shirt), pants = rgb(look.pants), hair = rgb(look.hair), shoe = rgb(look.shoe);
  // базовый цвет по строкам (сверху вниз)
  const rowColor = y => {
    switch (name) {
      case 'head': return skin;
      case 'upper': case 'middle': return shirt;
      case 'lower': return pants;
      case 'uArmF': case 'uArmB': return y < h * 0.45 ? shirt : skin;
      case 'lArmF': case 'lArmB': return skin;
      case 'footF': case 'footB': return shoe;
      default: return pants;
    }
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let base = rowColor(y), m = k;
    if (x === 1) m *= 1.1; else if (x === w - 2) m *= 0.88;
    if (name === 'lower' && y === 0) { base = [70, 48, 30]; }
    if (name === 'lower' && y === 0 && x === Math.floor(w * 0.65)) base = [200, 170, 80];
    if ((name === 'lArmF' || name === 'lArmB') && y >= h - 3) m *= 0.94;
    if ((name === 'footF' || name === 'footB') && y === h - 1) m *= 0.6;
    if (name === 'upper' && y === 0 && x > w * 0.3 && x < w * 0.7) base = skin; // шея/ворот
    if (name === 'head' && !look.bald && (y < 2 || (x < 2 && y < h * 0.7))) base = hair;
    g.fillStyle = col(base, m); g.fillRect(x, y, 1, 1);
  }
  // контур
  g.fillStyle = col(rowColor(Math.floor(h / 2)), 0.45 * k);
  g.fillRect(0, 0, w, 1); g.fillRect(0, h - 1, w, 1); g.fillRect(0, 0, 1, h); g.fillRect(w - 1, 0, 1, h);
  if (name === 'head' && !look.bald) { g.fillStyle = col(hair, 0.6); g.fillRect(0, 0, w, 1); g.fillRect(0, 0, 1, Math.round(h * 0.7)); }
  // ухо
  if (name === 'head') { g.fillStyle = col(skin, 0.85); g.fillRect(Math.floor(w * 0.35), Math.floor(h * 0.45), 1, 2); }
  return c;
}
function sprites(h) {
  if (h.sprites && h.sprites.look === h.look) return h.sprites;
  const S = { look: h.look };
  for (const n in h.parts) S[n] = makeSprite(n, h.parts[n].def, h.look);
  h.sprites = S; return S;
}

export function healthColor(hp, a = 0.6) {
  if (hp <= -0.5) return `rgba(25,0,0,${a + 0.2})`;
  const t = clamp(hp, 0, 1);
  return `hsla(${Math.round(t * 120)},85%,45%,${a})`;
}

export function drawHuman(ctx, h, highlight, healthView, lw = 0.015) {
  const L = h.look, dir = h.dir, S = sprites(h);
  const st = h.state();
  for (const name of DRAW_ORDER) {
    const p = h.parts[name], d = p.def, b = p.body;
    const pos = b.getPosition();
    const [hx, hy] = d.box;
    ctx.save();
    ctx.translate(pos.x, pos.y); ctx.rotate(b.getAngle());
    ctx.save(); ctx.scale(dir, -1); ctx.drawImage(S[name], -hx, -hy, hx * 2, hy * 2); ctx.restore();
    // бледность от потери крови / смерть
    if (d.skin && !h.dummy) {
      const pale = h.alive ? clamp((1 - h.blood) * 0.7, 0, 0.45) : 0.4;
      if (pale > 0.02) { ctx.fillStyle = `rgba(190,205,225,${pale})`; ctx.fillRect(-hx + PX, -hy + PX, hx * 2 - 2 * PX, hy * 2 - 2 * PX); }
    }
    if (name === 'head') drawFace(ctx, h, st, dir, hx, hy);
    // синяки и ожоги
    if (p.hp < 0.8) { ctx.fillStyle = `rgba(70,15,40,${Math.min(0.35, (0.8 - p.hp) * 0.4)})`; ctx.fillRect(-hx + PX, -hy + PX, hx * 2 - 2 * PX, hy * 2 - 2 * PX); }
    if (p.char > 0.02) { ctx.fillStyle = `rgba(20,14,10,${Math.min(0.85, p.char)})`; ctx.fillRect(-hx, -hy, hx * 2, hy * 2); }
    // раны — пиксельные
    for (const w of p.wounds) {
      const sz = PX * w.s;
      const qx = Math.round(w.x / PX) * PX, qy = Math.round(w.y / PX) * PX;
      ctx.fillStyle = w.dent ? '#4a3c14' : '#5e0808'; ctx.fillRect(qx - sz / 2 - PX / 2, qy - sz / 2 - PX / 2, sz + PX, sz + PX);
      ctx.fillStyle = w.dent ? '#2a2210' : '#2a0202'; ctx.fillRect(qx - sz / 2, qy - sz / 2, sz, sz);
    }
    if (healthView) {
      ctx.fillStyle = healthColor(p.hp); ctx.fillRect(-hx, -hy, hx * 2, hy * 2);
      if (p.broken) { ctx.strokeStyle = '#fff'; ctx.lineWidth = PX * 0.6; ctx.beginPath(); ctx.moveTo(-hx, -hy * 0.2); ctx.lineTo(hx, hy * 0.2); ctx.stroke(); }
    }
    if (highlight) { ctx.strokeStyle = highlight; ctx.lineWidth = lw; ctx.strokeRect(-hx, -hy, hx * 2, hy * 2); }
    if (p.frozen) { ctx.strokeStyle = '#6fd3ff'; ctx.lineWidth = 0.025; ctx.strokeRect(-hx, -hy, hx * 2, hy * 2); }
    ctx.restore();
  }
  for (const s of h.stumps) {
    const w = s.part.body.getWorldPoint(s.local);
    ctx.fillStyle = h.dummy ? '#555' : '#8e1010'; ctx.fillRect(w.x - PX * 1.5, w.y - PX * 1.5, PX * 3, PX * 3);
    ctx.fillStyle = '#e8dcc8'; ctx.fillRect(w.x - PX * 0.5, w.y - PX * 0.5, PX, PX);
  }
}
function drawFace(ctx, h, st, dir, hx, hy) {
  // в локальных координатах головы (y вверх); глаз у переднего края
  const ex = (hx - 3.5 * PX) * dir, ey = hy * 0.18;
  const R = (x, y, w, hh, c) => { ctx.fillStyle = c; ctx.fillRect(x - w / 2, y - hh / 2, w, hh); };
  if (h.dummy) {
    R(-PX * 0.5 * dir, 0, PX * 3, PX * 3, '#1a1a1a'); R(0, PX * 0.5, PX, PX, '#e8c23a'); R(-PX * dir, -PX * 0.5, PX, PX, '#e8c23a');
    return;
  }
  if (st === 'dead') {
    R(ex, ey, PX * 2, PX * 0.7, '#2a2a2a');
    R(ex + PX * 0.5 * dir, -hy * 0.45, PX * 2, PX, '#3a1a1a');
  } else if (st === 'out') {
    R(ex, ey, PX * 2, PX * 0.7, '#2a2a2a');
  } else if (st === 'pain') {
    R(ex, ey, PX, PX, '#111'); R(ex - PX * 0.5 * dir, ey + PX * 1.2, PX * 2, PX * 0.7, '#111');
    R(ex + PX * 0.5 * dir, -hy * 0.45, PX * 1.5, PX * 1.5, '#4a1010');
  } else {
    R(ex, ey, PX, PX, '#111');
    R(ex + PX * 0.5 * dir, -hy * 0.48, PX * 1.5, PX * 0.6, 'rgba(60,30,30,0.6)');
  }
}

/** силуэт с цветами здоровья для панели состояния (canvas 2D, своя система координат) */
export function drawHealthFigure(g, h, W, H) {
  g.clearRect(0, 0, W, H);
  const k = H / 1.95, ox = W / 2;
  g.save(); g.translate(ox, H - 4); g.scale(k, -k);
  for (const name of DRAW_ORDER) {
    const p = h.parts[name], d = p.def;
    let cx = d.c[0], cy = d.c[1];
    if (d.back) cx -= 0.09; else if (name.endsWith('F')) cx += 0.09;
    if (name.startsWith('foot')) cx += d.back ? 0 : 0;
    g.fillStyle = h.joints[p.joint] && h.joints[p.joint].severed ? 'rgba(80,80,80,0.35)' : healthColor(p.hp, 0.95);
    g.fillRect(cx - d.box[0], cy - d.box[1], d.box[0] * 2, d.box[1] * 2);
    g.strokeStyle = p.broken ? '#fff' : 'rgba(0,0,0,0.6)'; g.lineWidth = p.broken ? 0.02 : 0.01;
    g.strokeRect(cx - d.box[0], cy - d.box[1], d.box[0] * 2, d.box[1] * 2);
    if (p.bleed > 0.0005) { g.fillStyle = '#c00'; g.fillRect(cx - 0.02, cy - 0.02, 0.04, 0.04); }
  }
  g.restore();
}

/** пиксельная иконка человека для каталога */
export function humanIcon(dummy, size) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  const look = dummy ? { skin: '#e8c23a', shirt: '#e8c23a', pants: '#d9b02a', hair: '#000', shoe: '#2a2a2a', bald: true }
    : { skin: '#f0c8a0', shirt: '#4f6f9c', pants: '#3a4a70', hair: '#4a2f1b', shoe: '#262626', bald: false };
  const k = size / 1.95;
  g.translate(size / 2, size - 1); g.scale(k, -k);
  for (const name of DRAW_ORDER) {
    const d = PARTS[name], spr = makeSprite(name, d, look);
    g.save(); g.translate(d.c[0], d.c[1]); g.scale(1, -1); g.drawImage(spr, -d.box[0], -d.box[1], d.box[0] * 2, d.box[1] * 2); g.restore();
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  if (!dummy) { const ex = size / 2 + (0.12 - 3.5 * PX) * k, ey = size - 1 - (1.70 + 0.025) * k; g.fillStyle = '#111'; g.fillRect(Math.round(ex), Math.round(ey), Math.max(1, Math.round(PX * k)), Math.max(1, Math.round(PX * k))); }
  return c;
}
