// Каталог предметов. Каждый предмет описан фигурами в локальных координатах (лицом вправо):
// из них строится физика, отрисовка и иконка в каталоге.
import { Vec2, Box, Circle, Polygon } from 'planck';

const METAL = '#3b3f45', METAL2 = '#5a6068', WOOD = '#9a6a3a', WOOD2 = '#7d5229', GRIP = '#2a2420', STEEL = '#c9ced6';

export const CATALOG = [
  // ---------- манекены ----------
  { id: 'human', cat: 'Манекены', name: 'Человек', human: true },
  { id: 'dummy', cat: 'Манекены', name: 'Краш-манекен', human: true, dummy: true },

  // ---------- холодное оружие ----------
  { id: 'knife', cat: 'Холодное', name: 'Нож', hold: 'melee', density: 150,
    shapes: [{ box: [0.055, 0.016], at: [-0.06, 0], color: GRIP }, { poly: [[0, 0.016], [0.13, 0.008], [0.165, 0], [0, -0.014]], color: STEEL, sharp: true }],
    grip: [-0.06, 0], tip: [0.165, 0] },
  { id: 'sword', cat: 'Холодное', name: 'Меч', hold: 'melee', density: 70,
    shapes: [{ box: [0.07, 0.018], at: [-0.11, 0], color: GRIP }, { box: [0.013, 0.055], at: [-0.035, 0], color: '#b08d3a' },
      { poly: [[-0.02, 0.022], [0.62, 0.015], [0.69, 0], [0.62, -0.015], [-0.02, -0.022]], color: STEEL, sharp: true }],
    grip: [-0.11, 0], tip: [0.69, 0] },
  { id: 'spear', cat: 'Холодное', name: 'Копьё', hold: 'melee', density: 60,
    shapes: [{ box: [0.75, 0.018], at: [-0.15, 0], color: WOOD }, { poly: [[0.6, 0.035], [0.82, 0], [0.6, -0.035]], color: STEEL, sharp: true }],
    grip: [-0.3, 0], tip: [0.82, 0] },
  { id: 'axe', cat: 'Холодное', name: 'Топор', hold: 'melee',
    shapes: [{ box: [0.36, 0.022], at: [0, 0], color: WOOD, density: 60 }, { poly: [[0.26, 0.03], [0.4, 0.03], [0.46, 0.17], [0.3, 0.12]], color: STEEL, density: 300, sharp: true }],
    grip: [-0.26, 0], tip: [0.46, 0.17] },
  { id: 'hammer', cat: 'Холодное', name: 'Кувалда', hold: 'melee',
    shapes: [{ box: [0.38, 0.02], at: [0, 0], color: WOOD, density: 60 }, { box: [0.065, 0.11], at: [0.42, 0], color: METAL, density: 380 }],
    grip: [-0.28, 0] },

  // ---------- огнестрел ----------
  { id: 'pistol', cat: 'Огнестрел', name: 'Пистолет', hold: 'gun', density: 120,
    shapes: [{ box: [0.11, 0.026], at: [0.03, 0.03], color: METAL }, { box: [0.026, 0.055], at: [-0.045, -0.025], a: -0.25, color: GRIP }, { box: [0.02, 0.01], at: [0.0, -0.005], color: METAL2 }],
    grip: [-0.05, -0.06], muzzle: [0.145, 0.035], gun: { rate: 0.18, auto: false, dmg: 0.3, impulse: 9, spread: 0.012, pellets: 1, recoil: 1.6, sound: 'pistol', pen: 0.5 } },
  { id: 'rifle', cat: 'Огнестрел', name: 'Автомат', hold: 'gun', density: 60,
    shapes: [{ box: [0.27, 0.034], at: [0.08, 0.025], color: METAL }, { box: [0.1, 0.04], at: [-0.28, 0.005], a: 0.08, color: WOOD2 }, { box: [0.03, 0.075], at: [0.06, -0.07], a: 0.25, color: METAL2 },
      { box: [0.022, 0.05], at: [-0.11, -0.04], a: -0.2, color: GRIP }, { box: [0.08, 0.012], at: [0.4, 0.03], color: METAL2 }],
    grip: [-0.11, -0.08], muzzle: [0.49, 0.03], gun: { rate: 0.095, auto: true, dmg: 0.27, impulse: 10, spread: 0.03, pellets: 1, recoil: 2.4, sound: 'rifle', pen: 0.5 } },
  { id: 'shotgun', cat: 'Огнестрел', name: 'Дробовик', hold: 'gun', density: 60,
    shapes: [{ box: [0.3, 0.028], at: [0.12, 0.035], color: METAL }, { box: [0.12, 0.045], at: [-0.28, 0.0], a: 0.1, color: WOOD }, { box: [0.08, 0.024], at: [0.17, -0.012], color: WOOD2 },
      { box: [0.022, 0.05], at: [-0.13, -0.035], a: -0.2, color: GRIP }],
    grip: [-0.13, -0.075], muzzle: [0.43, 0.035], gun: { rate: 0.75, auto: false, dmg: 0.13, impulse: 4, spread: 0.1, pellets: 8, recoil: 6, sound: 'shotgun', pen: 0.4 } },
  { id: 'sniper', cat: 'Огнестрел', name: 'Снайперка', hold: 'gun', density: 50,
    shapes: [{ box: [0.4, 0.026], at: [0.2, 0.03], color: '#2e3a2a' }, { box: [0.13, 0.042], at: [-0.3, 0.005], a: 0.08, color: '#3d4a35' }, { box: [0.09, 0.022], at: [0.05, 0.085], color: '#1a1a1a' },
      { box: [0.022, 0.05], at: [-0.12, -0.035], a: -0.2, color: GRIP }, { box: [0.12, 0.012], at: [0.66, 0.03], color: METAL }],
    grip: [-0.12, -0.075], muzzle: [0.78, 0.03], gun: { rate: 1.2, auto: false, dmg: 1.3, impulse: 30, spread: 0.002, pellets: 1, recoil: 5, sound: 'sniper', pen: 0.8 } },
  { id: 'laser', cat: 'Огнестрел', name: 'Лазер', hold: 'gun', density: 70,
    shapes: [{ box: [0.24, 0.04], at: [0.06, 0.025], color: '#d8dde4' }, { box: [0.06, 0.03], at: [0.33, 0.025], color: '#3a7bd5' }, { box: [0.024, 0.05], at: [-0.1, -0.04], a: -0.2, color: '#444' },
      { box: [0.1, 0.012], at: [0.02, 0.07], color: '#3a7bd5' }],
    grip: [-0.1, -0.08], muzzle: [0.39, 0.025], gun: { rate: 0.12, auto: true, dmg: 0.16, impulse: 1.5, spread: 0, pellets: 1, recoil: 0.1, sound: 'laser', laser: true } },

  // ---------- взрывчатка ----------
  { id: 'grenade', cat: 'Взрывчатка', name: 'Граната', density: 50,
    shapes: [{ circle: 0.06, at: [0, 0], color: '#4d5a32' }, { box: [0.025, 0.02], at: [0, 0.07], color: METAL2 }],
    explosive: { fuse: 3, R: 4.5, power: 22, dmg: 2.1 }, activate: 'fuse' },
  { id: 'c4', cat: 'Взрывчатка', name: 'Взрывпакет', density: 60,
    shapes: [{ box: [0.13, 0.06], at: [0, 0], color: '#c9b98a' }, { box: [0.13, 0.012], at: [0, 0.02], color: '#555' }],
    explosive: { fuse: 1.2, R: 6.5, power: 28, dmg: 2.2 }, activate: 'fuse' },
  { id: 'barrel', cat: 'Взрывчатка', name: 'Бочка', density: 45,
    shapes: [{ box: [0.3, 0.44], at: [0, 0], color: '#b8261c' }],
    explosive: { fuse: 0, R: 5.5, power: 22, dmg: 1.6, impact: 11, fire: 0.5 }, activate: 'boom' },
  { id: 'molotov', cat: 'Взрывчатка', name: 'Молотов', density: 110,
    shapes: [{ box: [0.055, 0.09], at: [0, 0], color: '#5f7d2e' }, { box: [0.022, 0.05], at: [0, 0.13], color: '#5f7d2e' }, { box: [0.018, 0.04], at: [0, 0.2], color: '#e8e0c8' }],
    molotov: { impact: 4, R: 2.6 }, activate: 'boom' },
  { id: 'mine', cat: 'Взрывчатка', name: 'Мина', density: 400,
    shapes: [{ box: [0.2, 0.035], at: [0, 0], color: '#3e4a2c' }, { box: [0.06, 0.02], at: [0, 0.05], color: '#2a2a2a', press: true }],
    explosive: { fuse: 0.12, R: 4.5, power: 24, dmg: 1.8 }, activate: 'fuse', mine: true },

  // ---------- механизмы ----------
  { id: 'button', cat: 'Механизмы', name: 'Кнопка', density: 300,
    shapes: [{ box: [0.15, 0.04], at: [0, 0], color: '#555b63' }, { box: [0.08, 0.03], at: [0, 0.065], color: '#d9342b', press: true }], button: true, activate: 'signal' },
  { id: 'timer', cat: 'Механизмы', name: 'Таймер', density: 200,
    shapes: [{ box: [0.14, 0.1], at: [0, 0], color: '#2c3036' }], timer: 1, activate: 'toggle' },
  { id: 'thruster', cat: 'Механизмы', name: 'Ускоритель', density: 120,
    shapes: [{ box: [0.2, 0.07], at: [0, 0], color: '#8b9099' }, { poly: [[-0.2, 0.05], [-0.28, 0.08], [-0.28, -0.08], [-0.2, -0.05]], color: '#4a4e55' }], thruster: 900, activate: 'toggle' },
  { id: 'wheel', cat: 'Механизмы', name: 'Мотор-колесо', density: 60,
    shapes: [{ circle: 0.32, at: [0, 0], color: '#222' }, { circle: 0.16, at: [0, 0], color: '#9aa0a8' }], wheel: { torque: 260, speed: 14 }, activate: 'toggle', friction: 1.4 },
  { id: 'lamp', cat: 'Механизмы', name: 'Лампа', density: 150,
    shapes: [{ box: [0.07, 0.04], at: [0, -0.06], color: '#555' }, { circle: 0.08, at: [0, 0.04], color: '#e8e4c8' }], lamp: true, activate: 'toggle' },

  // ---------- медицина ----------
  { id: 'syrHeal', cat: 'Медицина', name: 'Лечение', hold: 'melee', density: 120, syringe: 'heal', liquid: '#4fd36a',
    shapes: [{ box: [0.1, 0.022], at: [0, 0], color: '#dfe7ef' }, { box: [0.015, 0.035], at: [-0.11, 0], color: '#9aa0a8' }, { poly: [[0.1, 0.006], [0.19, 0], [0.1, -0.006]], color: STEEL, sharp: true }],
    grip: [-0.08, 0], tip: [0.19, 0] },
  { id: 'syrAdr', cat: 'Медицина', name: 'Адреналин', hold: 'melee', density: 120, syringe: 'adren', liquid: '#ffd23a',
    shapes: [{ box: [0.1, 0.022], at: [0, 0], color: '#dfe7ef' }, { box: [0.015, 0.035], at: [-0.11, 0], color: '#9aa0a8' }, { poly: [[0.1, 0.006], [0.19, 0], [0.1, -0.006]], color: STEEL, sharp: true }],
    grip: [-0.08, 0], tip: [0.19, 0] },
  { id: 'syrDeath', cat: 'Медицина', name: 'Яд', hold: 'melee', density: 120, syringe: 'death', liquid: '#a24bd8',
    shapes: [{ box: [0.1, 0.022], at: [0, 0], color: '#dfe7ef' }, { box: [0.015, 0.035], at: [-0.11, 0], color: '#9aa0a8' }, { poly: [[0.1, 0.006], [0.19, 0], [0.1, -0.006]], color: STEEL, sharp: true }],
    grip: [-0.08, 0], tip: [0.19, 0] },
  { id: 'syrStr', cat: 'Медицина', name: 'Сила', hold: 'melee', density: 120, syringe: 'strong', liquid: '#ff5a3a',
    shapes: [{ box: [0.1, 0.022], at: [0, 0], color: '#dfe7ef' }, { box: [0.015, 0.035], at: [-0.11, 0], color: '#9aa0a8' }, { poly: [[0.1, 0.006], [0.19, 0], [0.1, -0.006]], color: STEEL, sharp: true }],
    grip: [-0.08, 0], tip: [0.19, 0] },

  // ---------- предметы ----------
  { id: 'crate', cat: 'Предметы', name: 'Ящик', density: 30, shapes: [{ box: [0.4, 0.4], at: [0, 0], color: '#a8743d' }], wood: true },
  { id: 'plank', cat: 'Предметы', name: 'Доска', density: 60, shapes: [{ box: [1.2, 0.055], at: [0, 0], color: '#b9884f' }], wood: true },
  { id: 'brick', cat: 'Предметы', name: 'Кирпич', density: 900, shapes: [{ box: [0.12, 0.055], at: [0, 0], color: '#a5482f' }] },
  { id: 'ball', cat: 'Предметы', name: 'Мяч', density: 8, restitution: 0.8, shapes: [{ circle: 0.25, at: [0, 0], color: '#e0503a' }] },
  { id: 'anvil', cat: 'Предметы', name: 'Наковальня', density: 2500,
    shapes: [{ poly: [[-0.32, 0.12], [0.38, 0.12], [0.24, 0.02], [-0.22, 0.02]], color: METAL }, { box: [0.1, 0.08], at: [0, -0.06], color: METAL }, { box: [0.22, 0.04], at: [0, -0.18], color: METAL }] },
  { id: 'spikes', cat: 'Предметы', name: 'Шипы', density: 400,
    shapes: [{ box: [0.6, 0.05], at: [0, 0], color: METAL },
      ...[-0.48, -0.24, 0, 0.24, 0.48].map(x => ({ poly: [[x - 0.07, 0.05], [x + 0.07, 0.05], [x, 0.3]], color: STEEL, sharp: true, spike: true }))] },
  { id: 'tramp', cat: 'Предметы', name: 'Батут', density: 200,
    shapes: [{ box: [0.9, 0.08], at: [0, 0], color: '#2a2a2a' }, { box: [0.82, 0.02], at: [0, 0.09], color: '#2f7fe0', bouncy: true }] },
  { id: 'steel', cat: 'Предметы', name: 'Стальная балка', density: 600, shapes: [{ box: [1.5, 0.08], at: [0, 0], color: '#6b7078' }] },
  { id: 'wall', cat: 'Предметы', name: 'Бетонная стена', density: 800, shapes: [{ box: [0.15, 1.2], at: [0, 0], color: '#77797c' }] },
  { id: 'chair', cat: 'Предметы', name: 'Стул', density: 70, wood: true,
    shapes: [{ box: [0.22, 0.03], at: [0, 0.45], color: '#a8743d' }, { box: [0.025, 0.22], at: [-0.19, 0.2], color: '#8a5d2e' }, { box: [0.025, 0.22], at: [0.19, 0.2], color: '#8a5d2e' }, { box: [0.025, 0.3], at: [-0.2, 0.78], color: '#8a5d2e' }] },
];
export const CATEGORIES = ['Манекены', 'Холодное', 'Огнестрел', 'Взрывчатка', 'Механизмы', 'Медицина', 'Предметы'];
export const byId = Object.fromEntries(CATALOG.map(d => [d.id, d]));

let NEXT = 1;
export function buildItem(world, def, x, y, dir = 1, angle = 0) {
  const body = world.createBody({ type: 'dynamic', position: Vec2(x, y), angle, angularDamping: 0.1, bullet: !!def.hold });
  const item = { id: NEXT++, def, body, dir, frozen: false, fuse: -1, cd: 0, armed: false };
  makeFixtures(item);
  item.rad = Math.max(...def.shapes.map(s => Math.hypot(s.at ? s.at[0] : 0, s.at ? s.at[1] : 0) + (s.box ? Math.hypot(s.box[0], s.box[1]) : s.circle || Math.max(...s.poly.map(p => Math.hypot(p[0], p[1]))))));
  body.setUserData({ kind: 'item', item });
  return item;
}
export function makeFixtures(item, groupIndex = 0) {
  const { def, body, dir } = item;
  for (let f = body.getFixtureList(); f;) { const n = f.getNext(); body.destroyFixture(f); f = n; }
  for (const s of def.shapes) {
    let shape;
    if (s.box) shape = new Box(s.box[0], s.box[1], Vec2(s.at[0] * dir, s.at[1]), (s.a || 0) * dir);
    else if (s.circle) shape = new Circle(Vec2(s.at[0] * dir, s.at[1]), s.circle);
    else { let pts = s.poly.map(p => Vec2(p[0] * dir, p[1])); if (dir < 0) pts = pts.reverse(); shape = new Polygon(pts); }
    const fx = body.createFixture(shape, { density: s.density || def.density || 100, friction: def.friction || 0.5, restitution: def.restitution ?? 0.1, filterGroupIndex: groupIndex });
    const tip = s.spike ? [s.poly[2][0] * dir, s.poly[2][1]] : s.sharp && def.tip ? [def.tip[0] * dir, def.tip[1]] : null;
    fx.setUserData({ sharp: !!s.sharp, spike: !!s.spike, bouncy: !!s.bouncy, press: !!s.press, tip });
    if (s.bouncy) fx.setRestitution(1.15);
  }
  body.resetMassData();
}
export const local = (item, p) => Vec2(p[0] * item.dir, p[1]);

// ---------- отрисовка ----------
function path(ctx, s) {
  ctx.beginPath();
  if (s.box) { ctx.save(); ctx.translate(s.at[0], s.at[1]); ctx.rotate(s.a || 0); ctx.roundRect(-s.box[0], -s.box[1], s.box[0] * 2, s.box[1] * 2, Math.min(s.box[0], s.box[1]) * 0.25); ctx.restore(); }
  else if (s.circle) ctx.arc(s.at[0], s.at[1], s.circle, 0, 7);
  else { ctx.moveTo(s.poly[0][0], s.poly[0][1]); for (let i = 1; i < s.poly.length; i++) ctx.lineTo(s.poly[i][0], s.poly[i][1]); ctx.closePath(); }
}
/** рисует фигуры предмета в его локальных координатах (вызывающий уже сделал translate/rotate) */
export function drawShapes(ctx, def, dir, item) {
  ctx.save(); ctx.scale(dir, 1);
  for (const s of def.shapes) { ctx.fillStyle = s.color; path(ctx, s); ctx.fill(); }
  // детали
  if (def.wood) {
    const s = def.shapes[0]; ctx.strokeStyle = 'rgba(60,35,15,0.55)'; ctx.lineWidth = Math.min(s.box[0], s.box[1]) * 0.12;
    if (def.id === 'crate') { ctx.strokeRect(-0.34, -0.34, 0.68, 0.68); ctx.beginPath(); ctx.moveTo(-0.34, -0.34); ctx.lineTo(0.34, 0.34); ctx.stroke(); }
    else { ctx.beginPath(); for (const x of [-0.8, -0.2, 0.5]) { ctx.moveTo(x, -0.03); ctx.lineTo(x + 0.25, -0.03); } ctx.stroke(); }
  }
  if (def.id === 'barrel') {
    ctx.fillStyle = '#7e1a12'; ctx.fillRect(-0.3, 0.28, 0.6, 0.04); ctx.fillRect(-0.3, -0.32, 0.6, 0.04);
    ctx.fillStyle = '#f2c414'; ctx.fillRect(-0.3, -0.08, 0.6, 0.16);
    ctx.fillStyle = '#1a1a1a'; for (let x = -0.3; x < 0.3; x += 0.12) { ctx.beginPath(); ctx.moveTo(x, -0.08); ctx.lineTo(x + 0.06, -0.08); ctx.lineTo(x + 0.12, 0.08); ctx.lineTo(x + 0.06, 0.08); ctx.fill(); }
  }
  if (def.id === 'c4') {
    const on = item && item.fuse > 0 && (item.fuse % 0.3) < 0.15;
    ctx.fillStyle = on ? '#ff3030' : '#601010'; ctx.beginPath(); ctx.arc(0.08, -0.025, 0.018, 0, 7); ctx.fill();
  }
  if (def.id === 'grenade') {
    ctx.strokeStyle = '#333'; ctx.lineWidth = 0.008; ctx.beginPath(); ctx.moveTo(-0.06, 0); ctx.lineTo(0.06, 0); ctx.moveTo(0, -0.06); ctx.lineTo(0, 0.06); ctx.stroke();
    if (!(item && item.fuse > 0)) { ctx.strokeStyle = METAL2; ctx.lineWidth = 0.008; ctx.beginPath(); ctx.arc(0.04, 0.085, 0.02, 0, 7); ctx.stroke(); }
    else if ((item.fuse % 0.4) < 0.2) { ctx.fillStyle = 'rgba(255,60,40,0.8)'; ctx.beginPath(); ctx.arc(0, 0.07, 0.02, 0, 7); ctx.fill(); }
  }
  if (def.syringe) {
    const full = !(item && item.used);
    ctx.fillStyle = def.liquid; if (full) ctx.fillRect(-0.085, -0.014, 0.17, 0.028); else ctx.fillRect(0.06, -0.014, 0.025, 0.028);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.004; ctx.beginPath(); for (let x = -0.06; x < 0.09; x += 0.03) { ctx.moveTo(x, 0.022); ctx.lineTo(x, 0.01); } ctx.stroke();
  }
  if (def.id === 'timer') {
    const on = item && item.on;
    ctx.fillStyle = '#0d1a0d'; ctx.fillRect(-0.11, -0.05, 0.22, 0.09);
    ctx.fillStyle = on ? '#58ff6a' : '#1e4a24'; ctx.font = 'bold 0.07px monospace'; ctx.save(); ctx.scale(1, -1); ctx.textAlign = 'center';
    ctx.fillText(on ? (item.timerT || 0).toFixed(1) : '0.0', 0, 0.03); ctx.restore();
    ctx.fillStyle = on && ((item.timerT || 0) % 1) > 0.8 ? '#ff4040' : '#5a1a1a'; ctx.beginPath(); ctx.arc(0.1, 0.075, 0.015, 0, 7); ctx.fill();
  }
  if (def.id === 'button' && item && item.pressT > 0) { ctx.fillStyle = '#ff7060'; ctx.fillRect(-0.08, 0.035, 0.16, 0.035); }
  if (def.id === 'thruster') { ctx.fillStyle = '#6a6f77'; ctx.fillRect(-0.1, -0.07, 0.02, 0.14); ctx.fillRect(0.08, -0.07, 0.02, 0.14); ctx.fillStyle = item && item.on ? '#ff9a30' : '#3a2a1a'; ctx.beginPath(); ctx.arc(0.13, 0, 0.02, 0, 7); ctx.fill(); }
  if (def.id === 'wheel') {
    ctx.strokeStyle = '#555'; ctx.lineWidth = 0.03; ctx.beginPath(); for (let k = 0; k < 3; k++) { const a = k * 2.094; ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 0.15, Math.sin(a) * 0.15); } ctx.stroke();
    ctx.fillStyle = item && item.on ? '#5aff6a' : '#444'; ctx.beginPath(); ctx.arc(0, 0, 0.04, 0, 7); ctx.fill();
  }
  if (def.id === 'lamp' && item && item.on) { ctx.fillStyle = '#fff6b0'; ctx.beginPath(); ctx.arc(0, 0.04, 0.08, 0, 7); ctx.fill(); }
  if (def.id === 'mine') { ctx.fillStyle = item && item.armT !== undefined && item.armT <= 0 ? '#ff3030' : '#553'; ctx.beginPath(); ctx.arc(0.13, 0.01, 0.015, 0, 7); ctx.fill(); }
  if (def.id === 'molotov' && item && item.lit) { ctx.fillStyle = '#ffb030'; ctx.beginPath(); ctx.arc(0, 0.25, 0.03, 0, 7); ctx.fill(); }
  if (def.id === 'tramp') { ctx.strokeStyle = '#555'; ctx.lineWidth = 0.02; ctx.beginPath(); for (const x of [-0.75, 0, 0.75]) { ctx.moveTo(x, -0.08); ctx.lineTo(x, -0.18); } ctx.stroke(); }
  ctx.restore();
}

export function fillShapes(ctx, def, dir, color) {
  ctx.save(); ctx.scale(dir, 1); ctx.fillStyle = color;
  for (const s of def.shapes) { path(ctx, s); ctx.fill(); }
  ctx.restore();
}
export function strokeShapes(ctx, def, dir, color, lw) {
  ctx.save(); ctx.scale(dir, 1); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineJoin = 'round';
  for (const s of def.shapes) { path(ctx, s); ctx.stroke(); }
  ctx.restore();
}

// иконки каталога
export function iconCanvas(def, size = 64) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  if (def.human) {
    g.translate(size / 2, size * 0.94); const k = size / 2.05; g.scale(k, -k);
    const col = def.dummy ? { skin: '#e8c23a', shirt: '#e8c23a', pants: '#d9b02a' } : { skin: '#e8b98f', shirt: '#4f7fc4', pants: '#36456b' };
    const R = (x, y, w, h, c) => { g.fillStyle = c; g.beginPath(); g.roundRect(x - w / 2, y - h / 2, w, h, Math.min(w, h) * 0.45); g.fill(); };
    R(-0.02, 1.33, 0.11, 0.32, '#3d628f'); R(-0.02, 0.645, 0.14, 0.42, '#2a3552'); R(0, 0.22, 0.12, 0.4, '#2a3552');
    R(0, 0.99, 0.26, 0.28, col.pants); R(0, 1.33, 0.28, 0.4, col.shirt);
    g.fillStyle = col.skin; g.beginPath(); g.arc(0, 1.69, 0.13, 0, 7); g.fill();
    R(0.03, 0.645, 0.14, 0.42, col.pants); R(0.03, 0.22, 0.12, 0.4, col.pants); R(0.03, 1.33, 0.11, 0.32, col.shirt); R(0.03, 1.02, 0.1, 0.3, col.skin);
    g.fillStyle = '#1a1a1a'; g.beginPath(); g.arc(0.065, 1.71, 0.018, 0, 7); g.fill();
    return c;
  }
  // габариты фигур
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const s of def.shapes) {
    const pts = s.box ? [[s.at[0] - s.box[0], s.at[1] - s.box[1]], [s.at[0] + s.box[0], s.at[1] + s.box[1]]] : s.circle ? [[s.at[0] - s.circle, s.at[1] - s.circle], [s.at[0] + s.circle, s.at[1] + s.circle]] : s.poly;
    for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  }
  const k = size * 0.82 / Math.max(x1 - x0, y1 - y0);
  g.translate(size / 2 - (x0 + x1) / 2 * k, size / 2 + (y0 + y1) / 2 * k); g.scale(k, -k);
  drawShapes(g, def, 1, null);
  return c;
}
