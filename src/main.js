// РЭГДОЛЛ ЛАБ 2D — песочница с тряпичными человечками (вид сбоку).
import { World, Vec2, Box, MouseJoint, WeldJoint, RopeJoint, DistanceJoint, AABB } from 'planck';
import { Human, drawHuman, HUMAN_MASS } from './human.js';
import { CATALOG, CATEGORIES, byId, buildItem, makeFixtures, local, drawShapes, strokeShapes, fillShapes, iconCanvas } from './items.js';
import * as FX from './fx.js';
import { WORLD } from './fx.js';
import { QP, PERF, PERF_AUTO, GPU, OPT, saveOpt, setPerf } from './settings.js';
import { audioInit, SFX, setVolume, setRate } from './audio.js';

const FIXED = 1 / 60;
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const PART_RU = { head: 'голова', upper: 'грудь', lower: 'живот', uArmF: 'плечо (ближнее)', lArmF: 'предплечье (ближнее)', uArmB: 'плечо (дальнее)', lArmB: 'предплечье (дальнее)',
  uLegF: 'бедро (ближнее)', lLegF: 'голень (ближняя)', uLegB: 'бедро (дальнее)', lLegB: 'голень (дальняя)' };
const STATE_RU = { ok: 'в норме', pain: 'больно', out: 'без сознания', dead: 'мёртв', dummy: 'манекен' };

// ---------------- мир ----------------
const GRAV = [{ g: -9.8, name: 'Земля' }, { g: -1.62, name: 'Луна' }, { g: 0, name: 'Невесомость' }];
let gIndex = 0;
const world = new World({ gravity: Vec2(0, -9.8), allowSleep: true });
const ground = world.createBody({ type: 'static' });
ground.createFixture(new Box(80, 3, Vec2(0, -3)), { friction: 0.85 });
ground.createFixture(new Box(2, 30, Vec2(WORLD.x0 - 2, 27)), { friction: 0.6 });
ground.createFixture(new Box(2, 30, Vec2(WORLD.x1 + 2, 27)), { friction: 0.6 });
ground.setUserData({ kind: 'ground' });

const humans = [], items = [];
let links = [];        // верёвки, пружины и сварка от игрока: {type, joint, a, b, la, lb, len}
let wires = [];        // провода активации: {from: item, to: item}
const firePatches = []; // горящие лужи от «молотова»: {x, y, w, t}
const pressQ = [], beams = [];
let stuck = [];        // воткнутые ножи/шипы: {item, joint, other, spike, human}
const stabQ = [], slashQ = [], severQ = [], explQ = [];
const impacts = new Map();
let time = 0, paused = false, timeScale = 1, slowTarget = 1, shake = 0, physMs = 0;

const isDead = b => !b || b.__dead;
function ownerOf(b) { const u = b && b.getUserData(); return u || null; }
// кровь у людей, жёлтая пыль у краш-манекенов
function hBlood(h, x, y, vx, vy, n, spread) { if (h && h.dummy) FX.dust(x, y, vx, vy, Math.ceil(n / 4), '#c9a227'); else FX.blood(x, y, vx, vy, n, spread); }

// ---------------- контакты ----------------
world.on('begin-contact', c => {
  const fA = c.getFixtureA(), fB = c.getFixtureB();
  checkSharp(c, fA, fB); checkSharp(c, fB, fA);
  checkPress(fA, fB); checkPress(fB, fA);
});
function checkPress(f, fo) {
  const u = f.getBody().getUserData(); if (!u || u.kind !== 'item') return;
  const it = u.item, d = it.def;
  const ou = fo.getBody().getUserData();
  if (d.mine) { if (it.armT <= 0 && ou && ou.kind !== 'ground' && (ou.kind === 'part' || fo.getBody().getMass() > 1.5)) pressQ.push(it); return; }
  const ud = f.getUserData();
  if (d.button && ud && ud.press && ou && ou.kind !== 'ground') pressQ.push(it);
}
function checkSharp(c, fs, fo) {
  const sd = fs.getUserData(); if (!sd || !sd.sharp) return;
  const bs = fs.getBody(), bo = fo.getBody();
  const ou = bo.getUserData(); if (!ou) return;
  const su = bs.getUserData(); if (!su || su.kind !== 'item') return;
  const it = su.item;
  const isPart = ou.kind === 'part';
  if (!isPart && !(ou.kind === 'item' && ou.item.def.wood)) return;
  if (isPart && it.holder === ou.human) return;
  const wm = c.getWorldManifold(null); if (!wm || !wm.points || !wm.points.length) return;
  const p = Vec2(wm.points[0].x, wm.points[0].y);
  const rel = Vec2.sub(bs.getLinearVelocityFromWorldPoint(p), bo.getLinearVelocityFromWorldPoint(p));
  const axis = sd.spike ? bs.getWorldVector(Vec2(0, 1)) : bs.getWorldVector(Vec2(it.dir, 0));
  const along = Vec2.dot(rel, axis), speed = rel.length();
  const tipW = sd.tip ? bs.getWorldPoint(Vec2(sd.tip[0], sd.tip[1])) : p;
  const nearTip = Vec2.distance(tipW, p) < (sd.spike ? 0.12 : 0.15);
  if (nearTip && along > (sd.spike ? 3 : it.def.syringe ? 2.2 : 3.2) && (sd.spike || !it.stuck) && !(it.def.syringe && !isPart)) {
    stabQ.push({ item: it, body: bs, other: bo, p, axis, along, tip: sd.tip, spike: sd.spike });
    c.setEnabled(false);
  } else if (!sd.spike && isPart && speed > 6) {
    slashQ.push({ item: it, human: ou.human, part: ou.part, p, speed });
  }
}
world.on('post-solve', (c, imp) => {
  let n = 0; const ni = imp.normalImpulses; for (let i = 0; i < ni.length; i++) n += ni[i] || 0;
  if (n < 1.5) return;
  const fA = c.getFixtureA(), fB = c.getFixtureB();
  record(fA.getBody(), n, c, fB); record(fB.getBody(), n, c, fA);
});
function record(body, n, c, otherF) {
  const u = body.getUserData(); if (!u || u.kind === 'ground') return;
  const m = body.getMass(); if (!m) return;
  const dv = n / m;
  if (dv < 2.2) return;
  const prev = impacts.get(body);
  if (prev && prev.dv >= dv) return;
  const wm = c.getWorldManifold(null);
  const pt = wm && wm.points && wm.points.length ? Vec2(wm.points[0].x, wm.points[0].y) : body.getWorldCenter().clone();
  const od = otherF.getUserData();
  impacts.set(body, { dv, pt, sharp: !!(od && od.sharp), other: otherF.getBody(), nrm: wm ? Vec2(wm.normal.x, wm.normal.y) : Vec2(0, 1) });
}

// ---------------- создание/удаление ----------------
function spawnHuman(x, footY, dir = 1, opts = {}) {
  if (humans.length >= QP.maxHumans) { toast(`Предел людей: ${QP.maxHumans}`); return null; }
  const h = new Human(world, x, Math.max(0.005, footY), dir, opts);
  humans.push(h); return h;
}
function spawnItem(def, x, y, dir = 1, angle = 0) {
  const it = buildItem(world, def, x, y, dir, angle);
  // не проваливаться в пол
  let minY = 1e9;
  for (let f = it.body.getFixtureList(); f; f = f.getNext()) minY = Math.min(minY, f.getAABB(0).lowerBound.y);
  if (minY < 0.005) it.body.setTransform(Vec2(x, y + 0.005 - minY), angle);
  if (def.mine) it.armT = 1.5;
  items.push(it); return it;
}
function destroyBody(b) { if (b.__dead) return; b.__dead = true; world.destroyBody(b); }
function cleanup() {
  links = links.filter(l => !isDead(l.a) && !isDead(l.b));
  wires = wires.filter(w => !isDead(w.from.body) && !isDead(w.to.body));
  stuck = stuck.filter(s => {
    if (isDead(s.item.body) || isDead(s.other)) { if (!isDead(s.item.body) && !s.spike) releaseStuckState(s.item); return false; }
    return true;
  });
  if (drag && isDead(drag.body)) drag = null;
  if (toolA && isDead(toolA.body) && toolA.body !== ground) toolA = null;
  if (hover && isDead(hover.body)) hover = null;
}
function removeItem(it) {
  if (it.holder) dropHeld(it.holder);
  destroyBody(it.body);
  const i = items.indexOf(it); if (i >= 0) items.splice(i, 1);
  cleanup();
}
function removeHuman(h) {
  if (h.held) dropHeld(h);
  for (const b of h.bodies) destroyBody(b);
  const i = humans.indexOf(h); if (i >= 0) humans.splice(i, 1);
  cleanup();
}
function removeOwner(u) { if (!u) return; if (u.kind === 'part') removeHuman(u.human); else if (u.kind === 'item') removeItem(u.item); }
function clearAll() {
  for (const h of [...humans]) removeHuman(h);
  for (const it of [...items]) removeItem(it);
  links = []; stuck = []; wires = []; firePatches.length = 0; FX.clearStains(); FX.clearParticles();
}

// ---------------- оружие в руках ----------------
function giveItem(h, it) {
  if (!h.parts.lArmF.connected || !h.alive && false) return false;
  if (h.held) dropHeld(h);
  if (it.holder) dropHeld(it.holder);
  if (it.stuck) unstick(it);
  if (it.body.getType() !== 'dynamic') { it.body.setType('dynamic'); it.frozen = false; }
  it.dir = h.dir;
  makeFixtures(it, -h.gid);
  const arm = h.parts.lArmF.body;
  const th = arm.getAngle() - h.dir * Math.PI / 2;
  const hand = arm.getWorldPoint(Vec2(0, -0.155));
  const g = local(it, it.def.grip), c = Math.cos(th), s = Math.sin(th);
  it.body.setTransform(Vec2(hand.x - (g.x * c - g.y * s), hand.y - (g.x * s + g.y * c)), th);
  it.body.setLinearVelocity(arm.getLinearVelocity()); it.body.setAngularVelocity(0);
  const joint = world.createJoint(new WeldJoint({}, arm, it.body, hand));
  h.held = { item: it, joint, side: 'F' }; it.holder = h;
  SFX.click();
  return true;
}
function dropHeld(h) {
  const held = h.held; if (!held) return;
  if (!isDead(held.item.body)) {
    try { world.destroyJoint(held.joint); } catch (e) {}
    makeFixtures(held.item, 0);
  }
  held.item.holder = null; held.item.firing = false; h.held = null;
}
function nearestHandFor(it, maxD = 0.45) {
  const g = it.body.getWorldPoint(local(it, it.def.grip));
  let best = null, bd = maxD;
  for (const h of humans) {
    if (!h.parts.lArmF.connected) continue;
    const d = Vec2.distance(h.handPoint('F'), g);
    if (d < bd) { bd = d; best = h; }
  }
  return best;
}
function nearestHuman(p, maxD = 6) {
  let best = null, bd = maxD;
  for (const h of humans) { const d = Vec2.distance(h.torso.getPosition(), p); if (d < bd && h.parts.lArmF.connected) { bd = d; best = h; } }
  return best;
}

// ---------------- воткнутые предметы ----------------
function releaseStuckState(it) { it.stuck = null; if (!isDead(it.body)) makeFixtures(it, it.holder ? -it.holder.gid : 0); }
function unstick(it) {
  for (const s of stuck) if (s.item === it && !s.spike) { try { world.destroyJoint(s.joint); } catch (e) {} s.dead = true; }
  stuck = stuck.filter(s => !s.dead);
  releaseStuckState(it);
}
function processStabs() {
  for (const s of stabQ) {
    const it = s.item;
    if (isDead(s.body) || isDead(s.other) || (!s.spike && it.stuck)) continue;
    if (stuck.some(e => e.item === it && e.other === s.other)) continue;
    const ou = s.other.getUserData();
    if (!s.spike) {
      const depth = it.def.id === 'sword' || it.def.id === 'spear' ? 0.12 : it.def.syringe ? 0.05 : 0.07;
      const tipW = s.body.getWorldPoint(Vec2(s.tip[0], s.tip[1]));
      const want = Vec2(s.p.x + s.axis.x * depth, s.p.y + s.axis.y * depth);
      const pos = s.body.getPosition();
      s.body.setTransform(Vec2(pos.x + want.x - tipW.x, pos.y + want.y - tipW.y), s.body.getAngle());
      s.body.setLinearVelocity(s.other.getLinearVelocity()); s.body.setAngularVelocity(s.other.getAngularVelocity());
    }
    const joint = world.createJoint(new WeldJoint({}, s.body, s.other, s.p));
    const entry = { item: it, joint, other: s.other, spike: !!s.spike, human: ou.kind === 'part' ? ou.human : null };
    stuck.push(entry);
    if (!s.spike) { it.stuck = entry; if (!it.holder && entry.human) makeFixtures(it, -entry.human.gid); }
    if (ou.kind === 'part' && it.def.syringe) {
      const h = ou.human;
      h.damage(ou.part.name, 0.02, 'sharp', s.p);
      if (!it.used) { it.used = true; inject(h, it.def.syringe); }
      SFX.inject();
    } else if (ou.kind === 'part') {
      const h = ou.human, dmg = (it.def.id === 'sword' || it.def.id === 'spear' ? 0.35 : 0.22) + s.along * 0.02;
      h.damage(ou.part.name, dmg, 'sharp', s.p);
      hBlood(h, s.p.x, s.p.y, -s.axis.x * 3, -s.axis.y * 3, 14, 2);
      SFX.stab(); if (h.conscious) SFX.ouch();
    } else SFX.crate(6);
  }
  stabQ.length = 0;
}
function processSlashes() {
  for (const s of slashQ) {
    const it = s.item, h = s.human;
    if (isDead(it.body) || !humans.includes(h)) continue;
    const key = h.id + ':' + s.part.name;
    if (it.slashKey === key && time - it.slashT < 0.25) continue;
    it.slashKey = key; it.slashT = time;
    const heavy = it.def.id === 'sword' || it.def.id === 'axe';
    const dmg = ((s.speed - 6) * 0.035 + 0.06) * (heavy ? 1.8 : 1);
    h.damage(s.part.name, dmg, 'sharp', s.p);
    hBlood(h, s.p.x, s.p.y, 0, 1.5, 10, 3); SFX.stab();
    if (OPT.gore && heavy && s.speed > 10 && s.part.joint && Math.random() < 0.55) severQ.push({ h, part: s.part.name });
  }
  slashQ.length = 0;
}
function checkStuck() {
  let changed = false;
  for (const s of stuck) {
    if (isDead(s.item.body) || isDead(s.other)) continue;
    const f = s.joint.getReactionForce(1 / FIXED).length();
    const lim = s.spike ? 9000 : 2600;
    let out = f > lim;
    if (!s.spike && drag && drag.body === s.item.body && Vec2.distance(drag.target, s.item.body.getPosition()) > 0.55) out = true;
    if (out) {
      try { world.destroyJoint(s.joint); } catch (e) {}
      s.dead = true; changed = true;
      if (!s.spike) releaseStuckState(s.item);
      const p = s.item.body.getPosition();
      if (s.human) hBlood(s.human, p.x, p.y, 0, 1, 8, 2);
    }
  }
  if (changed) stuck = stuck.filter(s => !s.dead);
}

// ---------------- урон от ударов ----------------
function processImpacts() {
  for (const [body, r] of impacts) {
    if (isDead(body)) continue;
    const u = body.getUserData();
    if (u.kind === 'part') {
      const h = u.human, name = u.part.name;
      const thr = r.sharp ? 2.5 : 6.5;
      if (r.dv <= thr) continue;
      const dmg = (r.dv - thr) * (r.sharp ? 0.05 : 0.042) * (name === 'head' ? 1.6 : 1);
      const wasBroken = u.part.broken, wasAlive = h.alive;
      h.damage(name, dmg, r.sharp ? 'sharp' : 'blunt', r.pt);
      SFX.thud(r.dv);
      if (!wasBroken && u.part.broken) SFX.crack();
      if (dmg > 0.12 || r.sharp) hBlood(h, r.pt.x, r.pt.y, r.nrm.x * 2, Math.abs(r.nrm.y) * 2 + 1, Math.min(25, Math.ceil(dmg * 30)));
      if (h.conscious && dmg > 0.05) SFX.ouch();
      if (wasAlive && !h.alive) SFX.die();
      if (OPT.gore && dmg > 1.3 && u.part.joint) severQ.push({ h, part: name });
      if (r.other) { const ou = r.other.getUserData(); if (ou && ou.kind === 'part' && ou.part.burn > 0 && Math.random() < 0.3) ignite(u.part); }
    } else if (u.kind === 'item') {
      const it = u.item, ex = it.def.explosive;
      if (ex && ex.impact && r.dv > ex.impact) { detonate(it); continue; }
      if (it.def.molotov && r.dv > it.def.molotov.impact) { breakMolotov(it); continue; }
      if (r.dv > 2.5) { if (it.def.wood) SFX.crate(r.dv); else SFX.metal(r.dv); }
      if (r.dv > 9 && !it.def.wood) FX.sparks(r.pt.x, r.pt.y, r.nrm.x, r.nrm.y, 4);
    }
  }
  impacts.clear();
}
function processSevers() {
  for (const s of severQ) {
    if (!humans.includes(s.h)) continue;
    const wasAlive = s.h.alive;
    const at = s.h.sever(s.part);
    if (!at) continue;
    hBlood(s.h, at.x, at.y, 0, 2, 40, 5); if (!s.h.dummy) SFX.splat(); else SFX.crack();
    if (wasAlive && !s.h.alive) SFX.die();
  }
  severQ.length = 0;
}

// ---------------- взрывы ----------------
function detonate(it) {
  if (it.exploded) return; it.exploded = true;
  const p = it.body.getWorldCenter();
  explQ.push({ x: p.x, y: p.y, ex: it.def.explosive, item: it });
}
function processExplosions() {
  while (explQ.length) {
    const e = explQ.shift();
    if (e.item && !isDead(e.item.body)) removeItem(e.item);
    if (e.molotov) molotovBurst(e.x, e.y, e.molotov); else explode(e.x, e.y, e.ex);
  }
}
function explode(x, y, ex) {
  const R = ex.R, power = ex.power;
  SFX.explode(Math.min(1.2, power / 22));
  shake = Math.max(shake, power * 0.022);
  FX.flash(x, y, R * 0.35); FX.fire(x, y, 26, R * 0.35); FX.smoke(x, y, 22, R * 0.45, 0.5);
  FX.sparks(x, y, 0, 1, 30); FX.debris(x, y, 14, '#3a3530', power * 0.5); FX.ring(x, y, R * 1.1);
  if (y < R * 0.4) FX.scorch(x, 0.05, R * 0.5);
  if (x - WORLD.x0 < R * 0.4) FX.scorch(WORLD.x0, y, R * 0.4);
  if (WORLD.x1 - x < R * 0.4) FX.scorch(WORLD.x1, y, R * 0.4);
  const set = new Set();
  world.queryAABB(new AABB(Vec2(x - R, y - R), Vec2(x + R, y + R)), f => { set.add(f.getBody()); return true; });
  const hurt = new Set();
  for (const b of set) {
    if (b.getType() !== 'dynamic' || b.__dead) continue;
    const c = b.getWorldCenter();
    let dx = c.x - x, dy = c.y - y; const d = Math.hypot(dx, dy);
    if (d > R) continue;
    const f = 1 - d / R;
    if (d < 1e-3) { dx = 0; dy = 1; } else { dx /= d; dy /= d; }
    dy += 0.35; const n = Math.hypot(dx, dy); dx /= n; dy /= n;
    const J = power * f * Math.min(b.getMass(), 25);
    b.applyLinearImpulse(Vec2(dx * J, dy * J), c, true);
    b.applyAngularImpulse((Math.random() - 0.5) * J * 0.05, true);
    const u = b.getUserData();
    if (u && u.kind === 'part') {
      const h = u.human, dmg = ex.dmg * Math.pow(f, 1.5);
      h.damage(u.part.name, dmg, 'blast', c);
      hurt.add(h);
      if (dmg > 0.2) hBlood(h, c.x, c.y, dx * 4, dy * 4, Math.ceil(dmg * 10));
      if (f > 0.45 && Math.random() < (ex.fire || 0.25)) ignite(u.part);
      if (OPT.gore && f > 0.62 && dmg > 0.8 && u.part.joint && Math.random() < 0.3) severQ.push({ h, part: u.part.name });
    } else if (u && u.kind === 'item') {
      const it = u.item;
      if (it.def.explosive && !it.exploded) it.fuse = it.fuse > 0 ? Math.min(it.fuse, 0.15) : 0.08 + Math.random() * 0.2;
      if (it.stuck && f > 0.3) unstick(it);
      if (it.def.molotov) breakMolotov(it);
      if (it.def.wood && f > 0.45 && Math.random() < (ex.fire || 0.25)) ignite(it);
    }
  }
  for (const h of hurt) if (!h.alive) SFX.die();
}

// ---------------- стрельба ----------------
function fireGun(it) {
  const g = it.def.gun; if (!g || it.cd > 0 || isDead(it.body)) return;
  it.cd = g.rate;
  const b = it.body;
  const mz = b.getWorldPoint(local(it, it.def.muzzle));
  const ax = b.getWorldVector(Vec2(it.dir, 0));
  if (g.laser) return fireLaser(it, b, mz, ax);
  if (g.sound === 'sniper') SFX.sniper(); else SFX.gun(g.sound);
  FX.flash(mz.x + ax.x * 0.05, mz.y + ax.y * 0.05, g.pellets > 1 ? 0.14 : 0.09);
  FX.smoke(mz.x, mz.y, 2, 0.18, 0.1);
  if (g.pellets === 1) { const sp = b.getWorldPoint(Vec2(0, 0.03)); FX.shell(sp.x, sp.y, it.dir * Math.sign(ax.x || 1) * it.dir); }
  const holder = it.holder;
  const base = Math.atan2(ax.y, ax.x);
  for (let k = 0; k < g.pellets; k++) {
    const a = base + (Math.random() - 0.5) * 2 * g.spread;
    const dvx = Math.cos(a), dvy = Math.sin(a);
    const p2 = Vec2(mz.x + dvx * 70, mz.y + dvy * 70);
    const hits = [];
    world.rayCast(mz, p2, (fx, pt, nrm, frac) => {
      const bb = fx.getBody();
      if (bb === b) return -1;
      const u = bb.getUserData();
      if (holder && u && u.human === holder) return -1;
      hits.push({ fx, b: bb, pt: Vec2(pt.x, pt.y), nrm: Vec2(nrm.x, nrm.y), frac });
      return 1;
    });
    hits.sort((p, q) => p.frac - q.frac);
    let power = 1, end = p2;
    const seen = new Set();
    for (const h of hits) {
      if (seen.has(h.b)) continue; seen.add(h.b);
      const u = h.b.getUserData();
      if (!u || u.kind === 'ground') {
        FX.sparks(h.pt.x, h.pt.y, h.nrm.x, h.nrm.y, 5); FX.dust(h.pt.x, h.pt.y, h.nrm.x, h.nrm.y, 4);
        end = h.pt; break;
      }
      if (u.kind === 'part') {
        const H = u.human, wasAlive = H.alive;
        H.damage(u.part.name, g.dmg * power * (u.part.name === 'head' ? 3.5 : 1), 'bullet', h.pt);
        h.b.applyLinearImpulse(Vec2(dvx * g.impulse * power, dvy * g.impulse * power), h.pt, true);
        hBlood(H, h.pt.x, h.pt.y, -dvx * 2, -dvy * 2 + 1, 6, 2);
        hBlood(H, h.pt.x, h.pt.y, dvx * 5, dvy * 5 + 1, 10, 2.5);
        if (OPT.gore && g.dmg > 1 && u.part.joint && Math.random() < 0.35) severQ.push({ h: H, part: u.part.name });
        if (H.conscious) SFX.ouch();
        if (wasAlive && !H.alive) SFX.die();
        power *= g.pen || 0.5;
      } else {
        const I = u.item;
        h.b.applyLinearImpulse(Vec2(dvx * g.impulse * power, dvy * g.impulse * power), h.pt, true);
        if (I.def.explosive && I.def.activate === 'boom') detonate(I);
        if (I.def.molotov) breakMolotov(I);
        if (I.def.wood) { FX.dust(h.pt.x, h.pt.y, h.nrm.x, h.nrm.y, 5, '#b8894f'); power *= 0.55; }
        else { FX.sparks(h.pt.x, h.pt.y, h.nrm.x, h.nrm.y, 6); power *= 0.15; SFX.metal(4); }
      }
      if (power < 0.3) { end = h.pt; break; }
    }
    FX.tracer(mz.x, mz.y, end.x, end.y);
  }
  b.applyLinearImpulse(Vec2(-ax.x * g.recoil, -ax.y * g.recoil), mz, true);
  b.applyAngularImpulse(g.recoil * 0.015 * it.dir * (holder ? 0.3 : 1), true);
}
function activate(it, depth = 0) {
  if (isDead(it.body)) return;
  if (it.trigT === time && depth > 0) return; // защита от петель из проводов
  it.trigT = time;
  const d = it.def;
  if (d.gun) { if (d.gun.auto) { it.firing = !it.firing; SFX.click(); } else fireGun(it); }
  else if (d.activate === 'fuse') { if (it.fuse <= 0) { it.fuse = d.explosive.fuse; if (!d.mine) SFX.pin(); } }
  else if (d.activate === 'boom') { if (d.molotov) breakMolotov(it); else detonate(it); }
  else if (d.activate === 'signal') { it.pressT = 0.25; SFX.button(); }
  else if (d.activate === 'toggle') { it.on = !it.on; it.timerT = 0; SFX.click(); }
  else if (d.syringe) { toast('Шприц нужно воткнуть в человека'); }
  else if (depth === 0 && !wires.some(w => w.from === it)) toast('У этого предмета нет действия');
  // сигнал идёт дальше по проводам
  if (depth < 8) for (const w of wires) if (w.from === it) activate(w.to, depth + 1);
}
function signal(it) { // кнопка/таймер/мина: только передать сигнал
  if (depth0Guard(it)) return;
  for (const w of wires) if (w.from === it) activate(w.to, 1);
}
function depth0Guard(it) { if (it.sigT === time) return true; it.sigT = time; return false; }
function activateLabel(it) {
  const d = it.def;
  if (d.gun) return d.gun.auto ? (it.firing ? 'Прекратить огонь' : (d.gun.laser ? 'Включить лазер' : 'Огонь очередями')) : 'Выстрелить';
  if (d.mine) return 'Подорвать';
  if (d.activate === 'fuse') return d.id === 'grenade' ? 'Выдернуть чеку' : 'Запустить таймер';
  if (d.molotov) return 'Разбить';
  if (d.activate === 'boom') return 'Подорвать';
  if (d.button) return 'Нажать';
  if (d.activate === 'toggle') return it.on ? 'Выключить' : 'Включить';
  return null;
}

// ---------------- шприцы ----------------
function inject(h, kind) {
  if (h.dummy) return;
  if (kind === 'heal') { h.heal(); h.wake(); toast('Лечение подействовало'); }
  else if (kind === 'adren') { h.wake(); h.adren = 25; toast('Адреналин: боль не чувствует 25 с'); }
  else if (kind === 'death') { if (h.alive) h.poison = 0.01; toast('Яд начал действовать…'); }
  else if (kind === 'strong') { h.strong = 30; h.wake(); toast('Сила: мышцы в 2 раза сильнее на 30 с'); }
}

// ---------------- огонь ----------------
function flammable(t) { return !!t && (t.def && t.def.shapes ? !!(t.def.wood || t.def.id === 'ball') : true); }
function ignite(t) {
  if (!t || !flammable(t)) return;
  if (!(t.burn > 0)) SFX.fireOn();
  t.burn = Math.max(t.burn || 0, t.def && t.def.wood ? 14 : 9);
}
function bodyBurnTarget(b) { const u = b.getUserData(); if (!u) return null; return u.kind === 'part' ? u.part : u.kind === 'item' && flammable(u.item) ? u.item : null; }
function breakMolotov(it) {
  if (it.exploded || isDead(it.body)) return; it.exploded = true;
  const p = it.body.getWorldCenter(), R = it.def.molotov.R;
  explQ.push({ x: p.x, y: p.y, item: it, molotov: R });
}
function molotovBurst(x, y, R) {
  SFX.glass(); SFX.fireOn();
  FX.fire(x, y, 40, 0.8); FX.smoke(x, y, 8, 0.8, 0.6);
  firePatches.push({ x, y: Math.max(0, y), w: R, t: 9 });
  world.queryAABB(new AABB(Vec2(x - R, y - R), Vec2(x + R, y + R)), f => { const t = bodyBurnTarget(f.getBody()); if (t && Vec2.distance(f.getBody().getWorldCenter(), Vec2(x, y)) < R) ignite(t); return true; });
  if (y < 1.5) FX.scorch(x, 0.05, R * 0.6);
}
function burnStep(dt) {
  // лужи огня
  for (let i = firePatches.length - 1; i >= 0; i--) {
    const f = firePatches[i]; f.t -= dt;
    if (f.t <= 0) { firePatches.splice(i, 1); continue; }
    if (Math.random() < 0.5) world.queryAABB(new AABB(Vec2(f.x - f.w, f.y - 0.2), Vec2(f.x + f.w, f.y + 0.6)), fx => { const t = bodyBurnTarget(fx.getBody()); if (t) ignite(t); return true; });
  }
  const spread = (time % 0.25) < dt;
  const burnBody = (b, t, isPart, h) => {
    t.burn -= dt; t.char = Math.min(1, (t.char || 0) + dt * 0.06);
    if (isPart) { if (!h.dummy) { h.pain += dt * 0.25; } t.hp -= dt * 0.035; if (h.conscious && Math.random() < dt * 2) SFX.ouch(); if (t.hp < -0.6 && t.name === 'head') h.kill(); }
    if (spread) for (let ce = b.getContactList(); ce; ce = ce.next) { if (!ce.contact.isTouching()) continue; const o = bodyBurnTarget(ce.other); if (o && !(o.burn > 0) && Math.random() < 0.35) ignite(o); }
    if (t.burn <= 0) t.burn = 0;
  };
  for (const h of humans) {
    for (const n in h.parts) { const p = h.parts[n]; if (p.burn > 0) burnBody(p.body, p, true, h); }
    // огонь ползёт по телу через суставы
    if (spread) for (const jn in h.joints) {
      const J = h.joints[jn]; if (J.severed) continue;
      const A = h.parts[J.parent], C = h.parts[J.child];
      if (A.burn > 0 && !(C.burn > 0) && Math.random() < 0.3) ignite(C);
      else if (C.burn > 0 && !(A.burn > 0) && Math.random() < 0.3) ignite(A);
    }
  }
  for (const it of items) if (it.burn > 0) { burnBody(it.body, it, false); if (it.char >= 1 && it.def.wood && Math.random() < dt * 0.3) { removeQ.push(it); } }
  if (removeQ.length) { for (const it of removeQ.splice(0)) if (items.includes(it)) { const p = it.body.getPosition(); FX.debris(p.x, p.y, 8, '#2a1d12', 2); FX.smoke(p.x, p.y, 5, 0.6, 0.8); removeItem(it); } }
}
const removeQ = [];
function fireFX(dt, v) {
  const vis = (x, y) => x > v.x0 - 1 && x < v.x1 + 1 && y > v.y0 - 1 && y < v.y1 + 1;
  let any = false;
  for (const h of humans) for (const n in h.parts) { const p = h.parts[n]; if (p.burn > 0) { const q = p.body.getPosition(); any = true; if (vis(q.x, q.y) && Math.random() < dt * 13) FX.fire(q.x + (Math.random() - 0.5) * 0.12, q.y + (Math.random() - 0.5) * 0.12, 1, 0.2); } }
  for (const it of items) if (it.burn > 0) { const q = it.body.getPosition(); any = true; if (vis(q.x, q.y) && Math.random() < dt * 22) FX.fire(q.x + (Math.random() - 0.5) * it.rad, q.y + (Math.random() - 0.5) * it.rad * 0.5, 1, 0.32); if (Math.random() < dt * 4) FX.smoke(q.x, q.y + 0.3, 1, 0.4, 0.7); }
  for (const f of firePatches) { any = true; if (vis(f.x, f.y) && Math.random() < dt * 35) FX.fire(f.x + (Math.random() - 0.5) * 2 * f.w, f.y + 0.05, 1, 0.4 * Math.min(1, f.t / 2)); }
  if (any) SFX.crackle();
}

// ---------------- лазер ----------------
function fireLaser(it, b, mz, ax) {
  SFX.zap();
  const p2 = Vec2(mz.x + ax.x * 60, mz.y + ax.y * 60);
  let best = null;
  world.rayCast(mz, p2, (fx, pt, nrm, frac) => {
    const bb = fx.getBody(); if (bb === b) return -1;
    const u = bb.getUserData(); if (it.holder && u && u.human === it.holder) return -1;
    best = { b: bb, u, pt: Vec2(pt.x, pt.y), nrm: Vec2(nrm.x, nrm.y) }; return frac;
  });
  const end = best ? best.pt : p2;
  beams.push({ x0: mz.x, y0: mz.y, x1: end.x, y1: end.y, life: 0.1 });
  if (!best) return;
  FX.sparks(end.x, end.y, best.nrm.x, best.nrm.y, 3);
  if (best.u && best.u.kind === 'part') {
    const H = best.u.human, part = best.u.part, wasAlive = H.alive;
    H.damage(part.name, it.def.gun.dmg * (part.name === 'head' ? 2 : 1), 'blunt', null);
    part.char = Math.min(1, (part.char || 0) + 0.08);
    if (Math.random() < 0.25) ignite(part);
    if (OPT.gore && part.hp < -0.6 && part.joint && Math.random() < 0.2) severQ.push({ h: H, part: part.name });
    if (H.conscious) SFX.ouch(); if (wasAlive && !H.alive) SFX.die();
  } else if (best.u && best.u.kind === 'item') {
    const I = best.u.item;
    if (I.def.explosive && (I.def.activate === 'boom' || Math.random() < 0.2)) detonate(I);
    if (I.def.molotov) breakMolotov(I);
    if (flammable(I) && Math.random() < 0.15) ignite(I);
  }
  if (best.u && best.u.kind !== 'ground') best.b.applyLinearImpulse(Vec2(ax.x * it.def.gun.impulse, ax.y * it.def.gun.impulse), end, true);
}

// ---------------- разрыв суставов ----------------
const TEAR = { neck: 5200, spine: 13000, hipF: 11000, hipB: 11000, shoulderF: 6000, shoulderB: 6000, elbowF: 5000, elbowB: 5000, kneeF: 8000, kneeB: 8000 };
function tearStep(dt) {
  for (const h of humans) {
    const k = h.grabbed ? 3 : 1;
    for (const jn in h.joints) {
      const J = h.joints[jn]; if (J.severed) continue;
      const f = J.j.getReactionForce(1 / dt).length();
      if (f > TEAR[jn] * k * (J.broken ? 0.6 : 1)) {
        if (OPT.gore) severQ.push({ h, part: J.child });
        else if (!J.broken && h.breakBone(J.child)) SFX.crack();
      }
    }
  }
}

// ---------------- шаг симуляции ----------------
function tick(dt) {
  time += dt;
  const g = world.getGravity().y;
  for (const it of items) {
    if (it.cd > 0) it.cd -= dt;
    if (it.firing) fireGun(it);
    const d = it.def;
    if (d.mine && it.armT > 0) it.armT -= dt;
    if (it.pressT > 0) it.pressT -= dt;
    if (d.timer && it.on) { it.timerT = (it.timerT || 0) + dt; if (it.timerT >= d.timer) { it.timerT -= d.timer; SFX.beep(900); signal(it); } }
    if (d.thruster && it.on && !isDead(it.body)) {
      const ax = it.body.getWorldVector(Vec2(it.dir, 0));
      it.body.applyForceToCenter(Vec2(ax.x * d.thruster, ax.y * d.thruster), true);
      if (Math.random() < 0.6) { const n = it.body.getWorldPoint(Vec2(-0.3 * it.dir, 0)); FX.fire(n.x, n.y, 1, 0.12); }
      SFX.thrust();
    }
    if (d.wheel && it.on && !isDead(it.body)) {
      const w = it.body.getAngularVelocity(), want = -d.wheel.speed * it.dir;
      it.body.applyTorque(clamp((want - w) * 40, -d.wheel.torque, d.wheel.torque), true);
    }
    if (it.fuse > 0) {
      const before = it.fuse; it.fuse -= dt;
      if (it.def.id === 'c4' && Math.floor(before * 4) !== Math.floor(it.fuse * 4)) SFX.beep(it.fuse < 0.5 ? 1800 : 1200);
      if (it.fuse <= 0) detonate(it);
    }
  }
  for (const h of humans) {
    const wasAlive = h.alive;
    h.update(dt, time, OPT.getup, Math.abs(g) / 9.8);
    if (wasAlive && !h.alive) SFX.die();
    if (h.held && h.conscious && h.stand > 0.3) {
      const b = h.held.item.body; b.applyForceToCenter(Vec2(0, -g * b.getMass() * 0.9), true);
    }
  }
  if (drag) { drag.joint.setTarget(drag.target); if (drag.rot) drag.body.applyTorque(drag.rot * Math.min(400, drag.body.getMass() * 60 + 20), true); }
  const t0 = performance.now();
  world.step(dt, QP.vIter, QP.pIter);
  physMs = physMs * 0.9 + (performance.now() - t0) * 0.1;
  processImpacts(); processStabs(); processSlashes(); checkStuck(); tearStep(dt); processSevers(); processPresses(); burnStep(dt); processExplosions();
  // защита от разлёта и NaN
  const bad = [];
  for (let b = world.getBodyList(); b; b = b.getNext()) {
    if (b.getType() !== 'dynamic') continue;
    const v = b.getLinearVelocity(), p = b.getPosition();
    if (!isFinite(p.x) || !isFinite(p.y) || !isFinite(v.x) || p.y < -15 || p.y > 200) { bad.push(b); continue; }
    const s = v.x * v.x + v.y * v.y;
    if (s > 3600) { const k = 60 / Math.sqrt(s); b.setLinearVelocity(Vec2(v.x * k, v.y * k)); }
    const w = b.getAngularVelocity(); if (Math.abs(w) > 60) b.setAngularVelocity(Math.sign(w) * 60);
  }
  for (const b of bad) removeOwner(b.getUserData());
}

function processPresses() {
  for (const it of pressQ) {
    if (isDead(it.body)) continue;
    if (it.def.mine) { if (it.fuse <= 0) { it.fuse = it.def.explosive.fuse; SFX.beep(2000); } continue; }
    if (it.pressT > 0) continue;
    it.pressT = 0.35; SFX.button(); signal(it);
  }
  pressQ.length = 0;
}

// капли крови из ран и культей (визуально, раз в кадр)
function bleedFX(dt, v) {
  if (!OPT.blood) return;
  for (const h of humans) {
    for (const n in h.parts) {
      const p = h.parts[n];
      if (p.bleed < 0.02 || !p.wounds.length) continue;
      const pos = p.body.getPosition();
      if (pos.x < v.x0 - 2 || pos.x > v.x1 + 2 || pos.y < v.y0 - 2 || pos.y > v.y1 + 2) continue;
      if (Math.random() < p.bleed * dt * 25) {
        const w = p.wounds[Math.floor(Math.random() * p.wounds.length)];
        const wp = p.body.getWorldPoint(Vec2(w.x, w.y));
        FX.blood(wp.x, wp.y, 0, 0, 1, 0.4);
      }
    }
    if (h.dummy) continue;
    for (const s of h.stumps) {
      if (s.t <= 0) continue;
      s.t -= dt;
      const wp = s.part.body.getWorldPoint(s.local), c = s.part.body.getWorldCenter();
      let dx = wp.x - c.x, dy = wp.y - c.y; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
      if (Math.random() < 0.7) FX.blood(wp.x, wp.y, dx * 3 * Math.min(1, s.t), dy * 3 * Math.min(1, s.t), 1, 0.8);
    }
  }
}

// ---------------- камера ----------------
const canvas = $('game'), ctx = canvas.getContext('2d', { alpha: false });
let W = 0, H = 0, DPR = 1;
const cam = { x: 0, y: 3.4, zoom: 100 };
function resize() {
  DPR = window.devicePixelRatio || 1;
  W = canvas.width = Math.round(innerWidth * DPR); H = canvas.height = Math.round(innerHeight * DPR);
  canvas.style.width = innerWidth + 'px'; canvas.style.height = innerHeight + 'px';
}
addEventListener('resize', resize); resize();
cam.zoom = H / 9.5;
cam.x = 0.6 - 110 * DPR / cam.zoom; // центр сцены правее каталога
const toWorld = (sx, sy) => Vec2((sx * DPR - W / 2) / cam.zoom + cam.x, -(sy * DPR - H / 2) / cam.zoom + cam.y);
function view() {
  const hw = W / 2 / cam.zoom, hh = H / 2 / cam.zoom;
  return { x0: cam.x - hw, x1: cam.x + hw, y0: cam.y - hh, y1: cam.y + hh };
}
function clampCam() {
  cam.zoom = clamp(cam.zoom, H / 60, H / 2.2);
  cam.x = clamp(cam.x, WORLD.x0 - 4, WORLD.x1 + 4);
  cam.y = clamp(cam.y, -1 + H / 2 / cam.zoom * 0.6, WORLD.top);
}

// ---------------- ввод ----------------
let tool = 'drag', placing = null, placeDir = 1;
let mouse = { sx: 0, sy: 0, w: Vec2(0, 0), inside: false };
let drag = null, toolA = null, hover = null, pan = null;
const keys = new Set();
const TOOLS = [
  { id: 'drag', key: '1', name: 'Рука', hint: 'Тащите предметы и людей. Q/E — вращать. Оружие поднесите к руке человека, чтобы он его взял.' },
  { id: 'rope', key: '2', name: 'Верёвка', hint: 'Щёлкните по первому объекту, затем по второму (или по пустому месту — привязать к точке).' },
  { id: 'spring', key: '3', name: 'Пружина', hint: 'Щёлкните по двум объектам (или по объекту и пустому месту) — соединит упругой пружиной.' },
  { id: 'weld', key: '4', name: 'Сварка', hint: 'Щёлкните по двум объектам, чтобы намертво соединить их.' },
  { id: 'wire', key: '5', name: 'Провод', hint: 'Провод активации: щёлкните по источнику (кнопка, таймер…), затем по цели (бомба, оружие, ускоритель…).' },
  { id: 'freeze', key: '6', name: 'Заморозка', hint: 'Щёлкните по объекту, чтобы закрепить его в воздухе. Повторный щелчок — снять.' },
  { id: 'erase', key: '7', name: 'Ластик', hint: 'Щёлкните по объекту, верёвке или проводу, чтобы удалить.' },
  { id: 'fire', key: '8', name: 'Огонь', hint: 'Щёлкните по человеку или деревянному предмету, чтобы поджечь.' },
  { id: 'boom', key: '9', name: 'Взрыв', hint: 'Щёлкните, чтобы устроить взрыв в этом месте.' },
  { id: 'cut', key: '0', name: 'Скальпель', hint: 'Щёлкните по части тела, чтобы отрезать её (нужно включённое расчленение).' },
];

function pick(p) {
  const tol = 7 * DPR / cam.zoom;
  const pts = [p, Vec2(p.x + tol, p.y), Vec2(p.x - tol, p.y), Vec2(p.x, p.y + tol), Vec2(p.x, p.y - tol)];
  for (const q of pts) {
    let best = null, bestScore = -1;
    world.queryAABB(new AABB(Vec2(q.x - 0.001, q.y - 0.001), Vec2(q.x + 0.001, q.y + 0.001)), f => {
      const b = f.getBody();
      if (b === ground || !f.testPoint(q)) return true;
      const u = b.getUserData();
      // предмет в руке/ноже приоритетнее, ближние части тела приоритетнее дальних
      const score = u.kind === 'item' ? 3 : u.part.def.back ? 1 : 2;
      if (score > bestScore) { bestScore = score; best = { body: b, u, point: Vec2(p.x, p.y) }; }
      return true;
    });
    if (best) return best;
  }
  return null;
}
function linkAt(p) {
  const tol = 8 * DPR / cam.zoom;
  for (const l of links) {
    const a = l.a.getWorldPoint(l.la), b = l.b.getWorldPoint(l.lb);
    const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1;
    const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / L2, 0, 1);
    if (Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y) < tol) return l;
  }
  return null;
}
function wireAt(p) {
  const tol = 8 * DPR / cam.zoom;
  for (const w of wires) {
    const a = w.from.body.getPosition(), b = w.to.body.getPosition();
    const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1;
    const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / L2, 0, 1);
    if (Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y) < tol) return w;
  }
  return null;
}
function massOf(u) {
  if (u.kind === 'part') { let m = 0; for (const n in u.human.parts) { const p = u.human.parts[n]; if (p.connected === u.part.connected) m += p.body.getMass(); } return m; }
  return u.item.body.getMass() + (u.item.holder ? HUMAN_MASS : 0);
}

canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', e => {
  audioInit(); hideCtx();
  mouse.sx = e.clientX; mouse.sy = e.clientY; mouse.w = toWorld(e.clientX, e.clientY);
  canvas.setPointerCapture(e.pointerId);
  if (e.button === 1 || (e.button === 0 && keys.has(' ') && false)) { pan = { sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y, moved: true }; return; }
  if (e.button === 2) { pan = { sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y, moved: false, ctx: true }; return; }
  if (e.button !== 0) return;
  const p = mouse.w;
  if (placing) { placeAt(placing, p); return; }
  const hit = pick(p);
  switch (tool) {
    case 'drag': {
      if (!hit) { pan = { sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y, moved: true }; return; }
      if (hit.body.getType() !== 'dynamic') { toast('Объект заморожен — разморозьте (Z)'); return; }
      const m = massOf(hit.u);
      hit.body.setAwake(true);
      const joint = world.createJoint(new MouseJoint({ maxForce: 260 * m + 50, frequencyHz: 6, dampingRatio: 0.9 }, ground, hit.body, p));
      drag = { joint, body: hit.body, u: hit.u, target: Vec2(p.x, p.y), rot: 0 };
      if (hit.u.kind === 'part') hit.u.human.grabbed = 1;
      break;
    }
    case 'wire': {
      if (!hit || hit.u.kind !== 'item') { toast('Провод соединяет предметы (не людей)'); return; }
      if (!toolA) { toolA = { body: hit.body, point: Vec2(p.x, p.y), item: hit.u.item }; SFX.click(); return; }
      if (toolA.item === hit.u.item) { toast('Нужен другой предмет'); return; }
      if (!wires.some(w => w.from === toolA.item && w.to === hit.u.item)) wires.push({ from: toolA.item, to: hit.u.item });
      SFX.button(); toast(`Провод: ${toolA.item.def.name} → ${hit.u.item.def.name}`); toolA = null;
      break;
    }
    case 'fire': {
      if (!hit) return;
      const t = hit.u.kind === 'part' ? hit.u.part : hit.u.item;
      if (!flammable(t)) { toast('Это не горит'); return; }
      ignite(t); FX.fire(p.x, p.y, 8, 0.3);
      break;
    }
    case 'rope': case 'weld': case 'spring': {
      const pt = { body: hit ? hit.body : ground, point: Vec2(p.x, p.y) };
      if (!toolA) { toolA = pt; if (!hit && tool === 'weld') { toolA = null; toast('Щёлкните по объекту'); } SFX.click(); return; }
      if (pt.body === toolA.body) { toast('Нужен другой объект'); return; }
      makeLink(tool, toolA, pt); toolA = null;
      break;
    }
    case 'freeze': if (hit) toggleFreeze(hit); break;
    case 'erase': {
      if (hit) { removeOwner(hit.u); SFX.erase(); }
      else {
        const l = linkAt(p); if (l) { world.destroyJoint(l.joint); links = links.filter(x => x !== l); SFX.erase(); }
        else { const w = wireAt(p); if (w) { wires = wires.filter(x => x !== w); SFX.erase(); } }
      }
      break;
    }
    case 'boom': explode(p.x, p.y, { R: 4, power: 18, dmg: 1.2 }); break;
    case 'cut': {
      if (!hit || hit.u.kind !== 'part') return;
      if (!OPT.gore) { toast('Расчленение выключено в настройках'); return; }
      severQ.push({ h: hit.u.human, part: hit.u.part.name }); processSevers();
      break;
    }
  }
});
addEventListener('pointermove', e => {
  mouse.sx = e.clientX; mouse.sy = e.clientY; mouse.w = toWorld(e.clientX, e.clientY);
  if (pan) {
    const dx = e.clientX - pan.sx, dy = e.clientY - pan.sy;
    if (Math.abs(dx) + Math.abs(dy) > 4) pan.moved = true;
    if (pan.moved) { cam.x = pan.cx - dx * DPR / cam.zoom; cam.y = pan.cy + dy * DPR / cam.zoom; clampCam(); }
  }
});
addEventListener('pointerup', e => {
  if (pan) {
    if (pan.ctx && !pan.moved) {
      if (placing) { setPlacing(null); }
      else if (toolA) { toolA = null; }
      else openCtx(e.clientX, e.clientY);
    }
    pan = null;
  }
  if (drag && e.button === 0) endDrag();
});
function endDrag() {
  if (!drag) return;
  try { world.destroyJoint(drag.joint); } catch (e) {}
  const u = drag.u;
  if (u.kind === 'part') u.human.grabbed = 0;
  if (u.kind === 'item' && u.item.def.hold && !u.item.holder && !isDead(u.item.body)) {
    const h = nearestHandFor(u.item);
    if (h) giveItem(h, u.item);
  }
  drag = null;
}
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const before = toWorld(e.clientX, e.clientY);
  cam.zoom *= Math.pow(1.0015, -e.deltaY);
  clampCam();
  const after = toWorld(e.clientX, e.clientY);
  cam.x += before.x - after.x; cam.y += before.y - after.y; clampCam();
}, { passive: false });
canvas.addEventListener('pointerenter', () => mouse.inside = true);
canvas.addEventListener('pointerleave', () => mouse.inside = false);

addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  keys.add(k);
  if (e.repeat && !'wasdарсфцыв'.includes(k) && !k.startsWith('arrow')) return;
  const code = e.code;
  if (code === 'Escape') {
    if (!$('ctx').hidden) hideCtx();
    else if (placing) setPlacing(null);
    else if (toolA) toolA = null;
    else toggleMenu();
    return;
  }
  if (!$('menu').hidden) return;
  const tl = TOOLS.find(t => 'Digit' + t.key === code); if (tl) { setTool(tl.id); return; }
  const h = hover || null;
  switch (code) {
    case 'Space': e.preventDefault(); toggleSlow(); break;
    case 'KeyP': togglePause(); break;
    case 'KeyT': toggleSlow(); break;
    case 'Tab': e.preventDefault(); $('catalog').classList.toggle('hide'); break;
    case 'KeyG': cycleGravity(); break;
    case 'KeyF': if (h && h.u.kind === 'item') activate(h.u.item); else if (h && h.u.kind === 'part' && h.u.human.held) activate(h.u.human.held.item); break;
    case 'Delete': case 'Backspace': if (h) { removeOwner(h.u); SFX.erase(); } break;
    case 'KeyX': if (placing) placeDir = -placeDir; else if (h) flipOwner(h.u); break;
    case 'KeyZ': if (h) toggleFreeze(h); break;
    case 'KeyH': if (h && h.u.kind === 'part') { h.u.human.heal(); SFX.spawn(); } break;
    case 'KeyC': if (h) { const t = h.u.kind === 'part' ? h.u.part : h.u.item; if (flammable(t)) ignite(t); } break;
    case 'KeyQ': if (drag) drag.rot = 1; break;
    case 'KeyE': if (drag) drag.rot = -1; break;
  }
});
addEventListener('keyup', e => {
  keys.delete(e.key.toLowerCase());
  if ((e.code === 'KeyQ' || e.code === 'KeyE') && drag) drag.rot = 0;
});
addEventListener('blur', () => { keys.clear(); if (drag) endDrag(); });

function placeAt(def, p) {
  audioInit();
  if (def.human) { const h = spawnHuman(p.x, p.y - 0.95, placeDir, { dummy: def.dummy }); if (h) SFX.spawn(); return h; }
  const it = spawnItem(def, p.x, p.y, placeDir); SFX.spawn(); return it;
}
function makeLink(type, A, B) {
  let joint;
  if (type === 'rope') {
    const len = Math.max(0.05, Vec2.distance(A.point, B.point));
    joint = world.createJoint(new RopeJoint({ maxLength: len, localAnchorA: A.body.getLocalPoint(A.point), localAnchorB: B.body.getLocalPoint(B.point), collideConnected: true }, A.body, B.body));
    links.push({ type, joint, a: A.body, b: B.body, la: A.body.getLocalPoint(A.point), lb: B.body.getLocalPoint(B.point), len });
    SFX.rope();
  } else if (type === 'spring') {
    const len = Math.max(0.1, Vec2.distance(A.point, B.point));
    joint = world.createJoint(new DistanceJoint({ frequencyHz: 2.2, dampingRatio: 0.15, length: len, collideConnected: true }, A.body, B.body, A.point, B.point));
    links.push({ type, joint, a: A.body, b: B.body, la: A.body.getLocalPoint(A.point), lb: B.body.getLocalPoint(B.point), len });
    SFX.boing();
  } else {
    joint = world.createJoint(new WeldJoint({}, A.body, B.body, B.point));
    links.push({ type, joint, a: A.body, b: B.body, la: A.body.getLocalPoint(B.point), lb: B.body.getLocalPoint(B.point) });
    SFX.weld(); FX.sparks(B.point.x, B.point.y, 0, 1, 10);
  }
  A.body.setAwake(true); B.body.setAwake(true);
}
function toggleFreeze(hit) {
  const b = hit.body, u = hit.u;
  const fr = b.getType() !== 'static';
  if (fr && drag && drag.body === b) endDrag();
  b.setType(fr ? 'static' : 'dynamic');
  if (!fr) b.setAwake(true);
  if (u.kind === 'part') u.part.frozen = fr; else u.item.frozen = fr;
  SFX.freeze();
}
function flipOwner(u) {
  if (u.kind === 'item') {
    const it = u.item;
    if (it.holder) { toast('Сначала выпустите предмет из рук'); return; }
    if (it.stuck) unstick(it);
    it.dir = -it.dir; makeFixtures(it, 0); it.body.setAwake(true);
    return;
  }
  const h = u.human;
  if (h.stumps.length) { toast('Нельзя развернуть: не хватает частей тела'); return; }
  const lo = h.parts.lower.body.getPosition();
  const footY = Math.max(0.005, Math.min(h.parts.lLegF.body.getPosition().y, h.parts.lLegB.body.getPosition().y) - 0.22);
  const held = h.held ? h.held.item : null;
  const state = { look: h.look, blood: h.blood, alive: h.alive, pain: h.pain, parts: {} };
  for (const n in h.parts) { const p = h.parts[n]; state.parts[n] = { hp: p.hp, broken: p.broken, bleed: p.bleed, wounds: p.wounds.map(w => ({ ...w, x: -w.x })) }; }
  removeHuman(h);
  const nh = spawnHuman(lo.x, footY, -h.dir); if (!nh) return;
  nh.look = state.look; nh.blood = state.blood; nh.pain = state.pain;
  for (const n in state.parts) Object.assign(nh.parts[n], state.parts[n]);
  for (const n in nh.parts) if (nh.parts[n].broken) { const J = nh.joints[nh.parts[n].joint]; if (J) { J.broken = true; J.j.enableLimit(false); } }
  if (!state.alive) nh.kill();
  if (held && !isDead(held.body)) giveItem(nh, held);
}

// ---------------- UI ----------------
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.tm); toast.tm = setTimeout(() => t.classList.remove('show'), 1800);
}
function setTool(id) {
  tool = id; toolA = null; setPlacing(null);
  for (const b of document.querySelectorAll('#tools button')) b.classList.toggle('on', b.dataset.tool === id);
  $('hint').textContent = TOOLS.find(t => t.id === id).hint;
}
function setPlacing(def) {
  placing = def;
  for (const b of document.querySelectorAll('.item')) b.classList.toggle('on', !!def && b.dataset.id === def.id);
  if (def) $('hint').textContent = `${def.name}: щёлкните, чтобы поставить. X — развернуть, ПКМ/Esc — отмена.`;
  else $('hint').textContent = TOOLS.find(t => t.id === tool).hint;
}
function buildUI() {
  const tl = $('tools');
  for (const t of TOOLS) {
    const b = document.createElement('button'); b.dataset.tool = t.id; b.title = t.hint;
    b.innerHTML = `<span class="k">${t.key}</span>${t.name}`;
    b.onclick = () => setTool(t.id);
    tl.appendChild(b);
  }
  const cat = $('catalog');
  const tabs = document.createElement('div'); tabs.className = 'tabs'; cat.appendChild(tabs);
  const grid = document.createElement('div'); grid.className = 'grid'; cat.appendChild(grid);
  const showCat = c => {
    for (const t of tabs.children) t.classList.toggle('on', t.dataset.cat === c);
    grid.innerHTML = '';
    for (const d of CATALOG.filter(x => x.cat === c)) {
      const b = document.createElement('button'); b.className = 'item' + (placing === d ? ' on' : ''); b.dataset.id = d.id; b.title = d.name;
      b.appendChild(iconCanvas(d, 56));
      const s = document.createElement('span'); s.textContent = d.name; b.appendChild(s);
      b.onclick = () => { audioInit(); setPlacing(placing === d ? null : d); SFX.click(); };
      grid.appendChild(b);
    }
    localStorage.setItem('rl_tab', c);
  };
  for (const c of CATEGORIES) {
    const t = document.createElement('button'); t.className = 'tab'; t.dataset.cat = c;
    const first = CATALOG.find(x => x.cat === c);
    t.appendChild(iconCanvas(first, 30)); const s = document.createElement('span'); s.textContent = c; t.appendChild(s);
    t.onclick = () => { showCat(c); SFX.click(); };
    tabs.appendChild(t);
  }
  showCat(CATEGORIES.includes(localStorage.getItem('rl_tab')) ? localStorage.getItem('rl_tab') : CATEGORIES[0]);
  $('bHide').onclick = () => cat.classList.toggle('hide');
  $('bPause').onclick = togglePause; $('bSlow').onclick = toggleSlow; $('bGrav').onclick = cycleGravity;
  $('bClear').onclick = () => { clearAll(); toast('Всё очищено'); };
  $('bMenu').onclick = toggleMenu;
  $('play').onclick = () => { audioInit(); toggleMenu(false); };
  // настройки
  const perf = $('optPerf'); perf.checked = PERF;
  $('perfNote').textContent = (PERF_AUTO ? 'Выбрано автоматически. ' : '') + (GPU ? 'Видеокарта: ' + GPU : '');
  perf.onchange = () => setPerf(perf.checked);
  for (const k of ['blood', 'gore', 'getup', 'fps', 'sound']) {
    const el = $('opt_' + k); el.checked = OPT[k];
    el.onchange = () => { saveOpt(k, el.checked); if (k === 'sound') setVolume(el.checked ? vol() : 0); if (k === 'fps') $('stats').hidden = !el.checked; };
  }
  const vs = $('optVol'); vs.value = localStorage.getItem('rl_vol') || '0.55';
  vs.oninput = () => { localStorage.setItem('rl_vol', vs.value); if (OPT.sound) setVolume(+vs.value); };
  $('stats').hidden = !OPT.fps;
  setTool('drag');
}
const vol = () => +(localStorage.getItem('rl_vol') || 0.55);
function togglePause() { paused = !paused; $('bPause').classList.toggle('on', paused); $('bPause').textContent = paused ? '▶ Пуск (P)' : '⏸ Пауза (P)'; }
function toggleSlow() { slowTarget = slowTarget === 1 ? 0.2 : 1; $('bSlow').classList.toggle('on', slowTarget < 1); $('slowmo').classList.toggle('on', slowTarget < 1); }
function cycleGravity() {
  gIndex = (gIndex + 1) % GRAV.length; world.setGravity(Vec2(0, GRAV[gIndex].g));
  for (let b = world.getBodyList(); b; b = b.getNext()) b.setAwake(true);
  $('bGrav').textContent = '🌍 ' + GRAV[gIndex].name; toast('Гравитация: ' + GRAV[gIndex].name);
}
function toggleMenu(show) {
  const m = $('menu'); const v = show === undefined ? m.hidden : show;
  m.hidden = !v; menuPaused = v;
}
let menuPaused = true;

// контекстное меню
function hideCtx() { $('ctx').hidden = true; }
function openCtx(sx, sy) {
  const p = toWorld(sx, sy), hit = pick(p);
  const menu = $('ctx'); menu.innerHTML = '';
  const add = (label, fn, cls) => { const b = document.createElement('button'); b.textContent = label; if (cls) b.className = cls; b.onclick = () => { hideCtx(); fn(); }; menu.appendChild(b); };
  const title = t => { const d = document.createElement('div'); d.className = 'ttl'; d.textContent = t; menu.appendChild(d); };
  if (hit && hit.u.kind === 'part') {
    const h = hit.u.human, part = hit.u.part;
    title(`Человек #${h.id} · ${PART_RU[part.name]}`);
    add('Вылечить (H)', () => { h.heal(); SFX.spawn(); });
    if (h.alive && !h.conscious) add('Привести в чувство', () => h.wake());
    if (h.alive) add('Убить', () => { h.kill(); SFX.die(); });
    add('Развернуть (X)', () => flipOwner(hit.u));
    if (h.isBurning()) add('Потушить', () => { for (const n in h.parts) h.parts[n].burn = 0; });
    else add('Поджечь (C)', () => ignite(part));
    if (h.held) { add('Выстрелить / активировать (F)', () => activate(h.held.item)); add('Выронить оружие', () => dropHeld(h)); }
    if (part.joint && !part.broken) add('Сломать кость', () => { if (h.breakBone(part.name)) SFX.crack(); });
    if (part.joint && OPT.gore && !h.joints[part.joint].severed) add('Отрезать эту часть', () => { severQ.push({ h, part: part.name }); processSevers(); }, 'red');
    add(part.frozen ? 'Разморозить часть (Z)' : 'Заморозить часть (Z)', () => toggleFreeze(hit));
    add('Удалить (Del)', () => removeHuman(h), 'red');
  } else if (hit && hit.u.kind === 'item') {
    const it = hit.u.item;
    title(it.def.name);
    const al = activateLabel(it); if (al) add(al + ' (F)', () => activate(it));
    if (it.def.hold && !it.holder) { const nh = nearestHuman(p); if (nh) add('Дать ближайшему человеку', () => giveItem(nh, it)); }
    if (it.holder) add('Выпустить из рук', () => dropHeld(it.holder));
    if (it.stuck) add('Вытащить', () => unstick(it));
    if (it.burn > 0) add('Потушить', () => { it.burn = 0; }); else if (flammable(it)) add('Поджечь (C)', () => ignite(it));
    if (wires.some(w => w.from === it || w.to === it)) add('Убрать провода', () => { wires = wires.filter(w => w.from !== it && w.to !== it); });
    add('Развернуть (X)', () => flipOwner(hit.u));
    add(it.frozen ? 'Разморозить (Z)' : 'Заморозить (Z)', () => toggleFreeze(hit));
    if (links.some(l => l.a === it.body || l.b === it.body)) add('Убрать верёвки и сварку', () => {
      for (const l of links) if (l.a === it.body || l.b === it.body) world.destroyJoint(l.joint);
      links = links.filter(l => l.a !== it.body && l.b !== it.body);
    });
    add('Удалить (Del)', () => removeItem(it), 'red');
  } else {
    title('Пустое место');
    add('Создать человека здесь', () => { spawnHuman(p.x, Math.max(0, p.y - 0.95), 1); SFX.spawn(); });
    add('Взрыв здесь', () => explode(p.x, p.y, { R: 4, power: 18, dmg: 1.2 }));
    add('Убрать все пятна', () => FX.clearStains());
    add('Очистить всё', () => clearAll(), 'red');
  }
  menu.hidden = false;
  const r = menu.getBoundingClientRect();
  menu.style.left = Math.min(sx, innerWidth - r.width - 6) + 'px';
  menu.style.top = Math.min(sy, innerHeight - r.height - 6) + 'px';
}
document.addEventListener('pointerdown', e => { if (!$('ctx').contains(e.target) && e.target !== canvas) hideCtx(); });

// ---------------- отрисовка ----------------
let bgGrad = null, bgH = 0;
function drawItem(it, hl) {
  const b = it.body, p = b.getPosition();
  ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(b.getAngle());
  drawShapes(ctx, it.def, it.dir, it);
  if (it.char > 0.02) fillShapes(ctx, it.def, it.dir, `rgba(20,14,10,${Math.min(0.85, it.char)})`);
  if (it.frozen) strokeShapes(ctx, it.def, it.dir, '#6fd3ff', 0.025);
  if (hl) strokeShapes(ctx, it.def, it.dir, hl, 2.2 * DPR / cam.zoom);
  ctx.restore();
}
const inView = (x, y, r, v) => x + r > v.x0 && x - r < v.x1 && y + r > v.y0 && y - r < v.y1;
function humanInView(h, v) { for (const n in h.parts) { const p = h.parts[n].body.getPosition(); if (inView(p.x, p.y, 0.4, v)) return true; } return false; }
function drawLinks(px) {
  for (const l of links) {
    const a = l.a.getWorldPoint(l.la), b = l.b.getWorldPoint(l.lb);
    if (l.type === 'spring') {
      const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L, N = 14;
      ctx.strokeStyle = '#b8c4d0'; ctx.lineWidth = Math.max(0.02, 2 / px); ctx.beginPath(); ctx.moveTo(a.x, a.y);
      for (let i = 1; i < N; i++) { const t = i / N, o = (i % 2 ? 1 : -1) * 0.07; ctx.lineTo(a.x + dx * t + nx * o, a.y + dy * t + ny * o); }
      ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.fillStyle = '#6b7684'; for (const q of [a, b]) { ctx.beginPath(); ctx.arc(q.x, q.y, 0.035, 0, 7); ctx.fill(); }
    } else if (l.type === 'rope') {
      const d = Vec2.distance(a, b), slack = Math.max(0, l.len - d);
      ctx.strokeStyle = '#c9a86a'; ctx.lineWidth = Math.max(0.025, 2 / px);
      ctx.beginPath(); ctx.moveTo(a.x, a.y);
      if (slack > 0.02) ctx.quadraticCurveTo((a.x + b.x) / 2, (a.y + b.y) / 2 - slack * 0.7, b.x, b.y); else ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.fillStyle = '#8a6d3b';
      for (const q of [a, b]) { ctx.beginPath(); ctx.arc(q.x, q.y, 0.035, 0, 7); ctx.fill(); }
    } else {
      ctx.fillStyle = '#ffcf40'; ctx.beginPath(); ctx.arc(b.x, b.y, 0.04, 0, 7); ctx.fill();
      ctx.strokeStyle = '#7a5a00'; ctx.lineWidth = 0.012; ctx.stroke();
    }
  }
}
function render(dt) {
  if (bgH !== H) { bgGrad = ctx.createLinearGradient(0, 0, 0, H); bgGrad.addColorStop(0, '#2e3035'); bgGrad.addColorStop(1, '#1e1f22'); bgH = H; }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = bgGrad; ctx.fillRect(0, 0, W, H);
  const px = cam.zoom;
  const sx = shake > 0 ? (Math.random() - 0.5) * shake * px * 0.5 : 0, sy = shake > 0 ? (Math.random() - 0.5) * shake * px * 0.5 : 0;
  ctx.setTransform(px, 0, 0, -px, W / 2 - cam.x * px + sx, H / 2 + cam.y * px + sy);
  const v = view();
  // сетка: мелкая «миллиметровка» + метровые и пятиметровые линии
  const gridLines = (st, color) => {
    ctx.strokeStyle = color; ctx.beginPath();
    for (let x = Math.floor(v.x0 / st) * st; x <= v.x1; x += st) { ctx.moveTo(x, Math.max(0, v.y0)); ctx.lineTo(x, v.y1); }
    for (let y = Math.max(0, Math.floor(v.y0 / st) * st); y <= v.y1; y += st) { ctx.moveTo(v.x0, y); ctx.lineTo(v.x1, y); }
    ctx.stroke();
  };
  ctx.lineWidth = 1 / px;
  if (px > 70) gridLines(0.25, 'rgba(255,255,255,0.025)');
  if (px > 25) gridLines(1, 'rgba(255,255,255,0.05)');
  gridLines(5, 'rgba(255,255,255,0.085)');
  // стены и пол
  ctx.fillStyle = '#17181b';
  if (v.x0 < WORLD.x0) ctx.fillRect(v.x0, v.y0, WORLD.x0 - v.x0, v.y1 - v.y0);
  if (v.x1 > WORLD.x1) ctx.fillRect(WORLD.x1, v.y0, v.x1 - WORLD.x1, v.y1 - v.y0);
  if (v.y0 < 0) { ctx.fillStyle = '#1d1e21'; ctx.fillRect(v.x0, v.y0, v.x1 - v.x0, -v.y0); }
  ctx.fillStyle = '#4a4d52'; ctx.fillRect(v.x0, -0.06, v.x1 - v.x0, 0.06);
  FX.drawStains(ctx, v);
  const hl = hover && !drag ? hover : null;
  const hlColor = 'rgba(255,255,255,0.9)';
  // предметы позади людей (включая воткнутые — лезвие уходит «внутрь» тела)
  let drawnItems = 0, drawnHumans = 0;
  for (const it of items) {
    if (it.holder) continue;
    const p = it.body.getPosition();
    if (!inView(p.x, p.y, it.rad, v)) continue;
    drawItem(it, hl && hl.u.item === it ? hlColor : null); drawnItems++;
  }
  for (const h of humans) {
    if (!humanInView(h, v)) continue;
    drawHuman(ctx, h, hl && hl.u.human === h ? hlColor : null); drawnHumans++;
  }
  for (const it of items) {
    if (!it.holder) continue;
    const p = it.body.getPosition();
    if (!inView(p.x, p.y, it.rad, v)) continue;
    drawItem(it, hl && hl.u.item === it ? hlColor : null); drawnItems++;
  }
  drawLinks(px);
  // провода активации
  for (const w of wires) {
    const a = w.from.body.getPosition(), b = w.to.body.getPosition();
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 - Math.min(1, Math.hypot(b.x - a.x, b.y - a.y) * 0.15);
    ctx.strokeStyle = 'rgba(80,200,255,0.75)'; ctx.lineWidth = Math.max(0.015, 1.6 * DPR / px);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(mx, my, b.x, b.y); ctx.stroke();
    ctx.fillStyle = '#50c8ff'; ctx.beginPath(); ctx.arc(b.x, b.y, 0.03, 0, 7); ctx.fill();
  }
  // свет ламп
  for (const it of items) if (it.def.lamp && it.on) {
    const q = it.body.getWorldPoint(Vec2(0, 0.04)); if (!inView(q.x, q.y, 4, v)) continue;
    const g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, 3.5); g.addColorStop(0, 'rgba(255,240,170,0.35)'); g.addColorStop(1, 'rgba(255,240,170,0)');
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q.x, q.y, 3.5, 0, 7); ctx.fill(); ctx.globalCompositeOperation = 'source-over';
  }
  // лазерные лучи
  for (const bm of beams) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(80,160,255,${bm.life * 4})`; ctx.lineWidth = 0.06; ctx.beginPath(); ctx.moveTo(bm.x0, bm.y0); ctx.lineTo(bm.x1, bm.y1); ctx.stroke();
    ctx.strokeStyle = `rgba(220,240,255,${bm.life * 9})`; ctx.lineWidth = 0.018; ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }
  FX.drawFX(ctx, v, px);
  // перетаскивание
  if (drag) {
    const a = drag.body.getWorldPoint(drag.joint.m_localAnchorB || Vec2(0, 0));
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.5 * DPR / px; ctx.setLineDash([0.06, 0.05]);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(drag.target.x, drag.target.y); ctx.stroke(); ctx.setLineDash([]);
    if (drag.u.kind === 'item' && drag.u.item.def.hold && !drag.u.item.holder) {
      const h = nearestHandFor(drag.u.item, 0.45);
      if (h) { const hp = h.handPoint('F'); ctx.strokeStyle = '#6fe08a'; ctx.lineWidth = 2.5 * DPR / px; ctx.beginPath(); ctx.arc(hp.x, hp.y, 0.12, 0, 7); ctx.stroke(); }
    }
  }
  // первая точка верёвки/сварки
  if (toolA) {
    const a = toolA.body === ground ? toolA.point : toolA.body.getWorldPoint(toolA.body.getLocalPoint(toolA.point));
    ctx.strokeStyle = tool === 'rope' ? '#c9a86a' : tool === 'wire' ? '#50c8ff' : tool === 'spring' ? '#b8c4d0' : '#ffcf40'; ctx.lineWidth = 2 * DPR / px; ctx.setLineDash([0.08, 0.06]);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(mouse.w.x, mouse.w.y); ctx.stroke(); ctx.setLineDash([]);
  }
  // призрак размещаемого предмета
  if (placing && mouse.inside) {
    ctx.save(); ctx.globalAlpha = 0.45; ctx.translate(mouse.w.x, mouse.w.y);
    if (placing.human) {
      ctx.translate(0, -0.95); ctx.scale(placeDir, 1);
      ctx.fillStyle = '#9fc4ff';
      ctx.beginPath(); ctx.arc(0, 1.69, 0.13, 0, 7); ctx.fill();
      ctx.fillRect(-0.14, 1.13, 0.28, 0.4); ctx.fillRect(-0.13, 0.85, 0.26, 0.28); ctx.fillRect(-0.07, 0, 0.14, 0.85); ctx.fillRect(-0.05, 1.0, 0.1, 0.48);
    } else drawShapes(ctx, placing, placeDir, null);
    ctx.restore();
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return { drawnItems, drawnHumans };
}

// всплывающая подсказка о человеке под курсором
function updateTip() {
  const tip = $('tip');
  if (!hover || drag || !$('ctx').hidden) { tip.hidden = true; return; }
  const u = hover.u;
  let html;
  if (u.kind === 'part') {
    const h = u.human, p = u.part, st = h.state();
    html = `<b>${h.dummy ? 'Манекен' : 'Человек'} #${h.id}</b> — <span class="st-${st}">${STATE_RU[st]}</span><br>Кровь: ${Math.max(0, Math.round(h.blood * 100))}%` +
      `<br>${PART_RU[p.name]}: ${Math.max(0, Math.round(p.hp * 100))}%${p.broken ? ', <span class="st-dead">перелом</span>' : ''}${p.bleed > 0.02 ? ', кровотечение' : ''}` +
      (h.held ? `<br>В руке: ${h.held.item.def.name}` : '') + (h.isBurning() ? '<br><span class="st-dead">горит!</span>' : '') +
      (h.adren > 0 ? '<br>Адреналин' : '') + (h.strong > 0 ? '<br>Сила' : '') + (h.poison > 0 && h.alive ? '<br><span class="st-out">отравлен</span>' : '');
  } else {
    const it = u.item;
    html = `<b>${it.def.name}</b>` + (it.burn > 0 ? ' <span class="st-dead">горит</span>' : '') + (wires.some(w => w.from === it) ? '<br><small>провода: ' + wires.filter(w => w.from === it).length + '</small>' : '') + (it.def.hold && !it.holder ? '<br><small>поднесите к руке человека</small>' : '') + (activateLabel(it) ? `<br><small>F — ${activateLabel(it).toLowerCase()}</small>` : '') +
      (it.fuse > 0 ? `<br>Таймер: ${it.fuse.toFixed(1)} с` : '');
  }
  tip.innerHTML = html; tip.hidden = false;
  tip.style.left = Math.min(mouse.sx + 16, innerWidth - tip.offsetWidth - 6) + 'px';
  tip.style.top = Math.min(mouse.sy + 18, innerHeight - tip.offsetHeight - 6) + 'px';
}

// ---------------- главный цикл ----------------
let last = performance.now(), acc = 0, fpsT = 0, frames = 0, frameMs = 0, statT = 0, lastDraw = { drawnItems: 0, drawnHumans: 0 };
function frame(now) {
  const dtReal = Math.min(0.05, (now - last) / 1000); last = now;
  const t0 = performance.now();
  // панорама клавишами
  const ps = 9 / Math.max(0.5, cam.zoom / 100) * dtReal;
  if (keys.has('a') || keys.has('ф') || keys.has('arrowleft')) cam.x -= ps;
  if (keys.has('d') || keys.has('в') || keys.has('arrowright')) cam.x += ps;
  if (keys.has('w') || keys.has('ц') || keys.has('arrowup')) cam.y += ps;
  if (keys.has('s') || keys.has('ы') || keys.has('arrowdown')) cam.y -= ps;
  clampCam();
  mouse.w = toWorld(mouse.sx, mouse.sy);
  if (drag) drag.target = Vec2(mouse.w.x, mouse.w.y);
  hover = mouse.inside && !pan ? pick(mouse.w) : null;
  timeScale += (slowTarget - timeScale) * Math.min(1, dtReal * 6);
  if (Math.abs(timeScale - slowTarget) < 0.005) timeScale = slowTarget;
  setRate(0.45 + 0.55 * Math.sqrt(timeScale)); $('slowmo').style.opacity = ((1 - timeScale) / 0.8).toFixed(2);
  const running = !paused && !menuPaused;
  if (running) {
    acc += dtReal; let n = 0;
    while (acc >= FIXED && n < 3) { tick(FIXED * timeScale); acc -= FIXED; n++; }
    if (n === 3) acc = 0;
  }
  const v = view();
  if (running) {
    bleedFX(dtReal * timeScale, v); fireFX(dtReal * timeScale, v); FX.updateFX(dtReal * timeScale, world.getGravity().y);
    for (let i = beams.length - 1; i >= 0; i--) if ((beams[i].life -= dtReal * timeScale) <= 0) beams.splice(i, 1);
  }
  shake = Math.max(0, shake - dtReal * 2);
  lastDraw = render(dtReal);
  updateTip();
  frameMs = frameMs * 0.9 + (performance.now() - t0) * 0.1;
  frames++; fpsT += dtReal; statT += dtReal;
  if (statT > 0.5 && OPT.fps) {
    $('stats').textContent = `FPS ${Math.round(frames / fpsT)} · кадр ${frameMs.toFixed(1)} мс · физика ${physMs.toFixed(1)} мс · люди ${humans.length} (видно ${lastDraw.drawnHumans}) · предметы ${items.length} (видно ${lastDraw.drawnItems}) · частицы ${FX.particleCount()}${PERF ? ' · режим слабого ПК' : ''}`;
    frames = 0; fpsT = 0; statT = 0;
  }
  requestAnimationFrame(frame);
}

// ---------------- старт ----------------
FX.initStains();
buildUI();
setVolume(OPT.sound ? vol() : 0);
function demoScene() {
  const a = spawnHuman(-2.2, 0, 1), b = spawnHuman(0.6, 0, -1), c = spawnHuman(3.2, 0, -1);
  const gun = spawnItem(byId.pistol, -2, 1.2, 1); giveItem(a, gun);
  spawnItem(byId.crate, 5.6, 0.4); spawnItem(byId.crate, 5.7, 1.2); spawnItem(byId.barrel, 7, 0.45);
  spawnItem(byId.spikes, -5.5, 0.05); spawnItem(byId.knife, -4, 0.1); spawnItem(byId.grenade, -3.6, 0.1);
  // кнопка, подключённая проводом к бочке
  const btn = spawnItem(byId.button, 9, 0.05); const brl = spawnItem(byId.barrel, 11, 0.45); wires.push({ from: btn, to: brl });
  return [a, b, c];
}
demoScene();
requestAnimationFrame(frame);

// для отладки и автотестов
window.__lab = { world, humans, items, get wires() { return wires; }, ignite, inject, firePatches, setSlow: v => { slowTarget = v; }, get links() { return links; }, get stuck() { return stuck; }, spawnHuman, spawnItem, byId, giveItem, dropHeld, fireGun, activate, explode, tick, clearAll,
  cam, toWorld, removeHuman, removeItem, makeLink, ground, toggleFreeze, severQ, processSevers, FX, setPaused: v => { paused = v; }, closeMenu: () => toggleMenu(false), state: () => ({ time, paused, menuPaused, physMs, frameMs }) };
