/* ДИГГЕР: БОМБАРЬ — браузерная игра про диггерство в заброшенном бомбоубежище.
   Чистый JS + Canvas, без зависимостей. */
'use strict';

// ============================================================
//  Константы и утилиты
// ============================================================
const T = 32;                 // размер тайла в мировых пикселях
const MW = 60, MH = 44;       // размер карты в тайлах
const WALL = 0, FLOOR = 1, WATER = 2, DOOR = 3, EXIT = 4, DOWN = 5, PROP = 6;

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
let rnd = Math.random;
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = arr => arr[Math.floor(rnd() * arr.length)];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
function angDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function weighted(table) { // {key: weight}
  let sum = 0; for (const k in table) sum += table[k];
  let r = rnd() * sum;
  for (const k in table) { r -= table[k]; if (r <= 0) return k; }
  return Object.keys(table)[0];
}

// ============================================================
//  Данные: комнаты, хабар, фото-точки
// ============================================================
const ROOM_TYPES = {
  lock:     { name: 'Шлюз-тамбур · под вентшахтой', floor: 'metal',   props: ['locker'], pd: 0.35 },
  shelter:  { name: 'Отсек для укрываемых',          floor: 'concrete',props: ['bunk'], pd: 0.75 },
  fvk:      { name: 'ФВК — фильтровентиляционная камера', floor: 'concrete', props: ['filter', 'filter', 'fan'], pd: 0.6 },
  des:      { name: 'ДЭС — дизельная электростанция', floor: 'metal', props: ['barrel', 'panel'], pd: 0.4, big: 'machine' },
  med:      { name: 'Медпункт',                      floor: 'tile',    props: ['cabinet', 'cot', 'cot'], pd: 0.55 },
  control:  { name: 'Пункт управления',              floor: 'lino',    props: ['desk', 'panel', 'desk'], pd: 0.6 },
  wc:       { name: 'Санузел',                       floor: 'tile',    props: ['toilet', 'sink'], pd: 0.6 },
  store:    { name: 'Склад продовольствия',          floor: 'concrete',props: ['crate', 'crate', 'barrel'], pd: 0.6 },
  pump:     { name: 'Насосная · затоплено',          floor: 'concrete',props: ['barrel', 'fan'], pd: 0.3 },
  exitroom: { name: 'Лаз на нижний ярус',            floor: 'concrete',props: ['crate'], pd: 0.3 },
};

const LOOT = {
  battery:   { name: 'Батарейки',                pts: 0 },
  gasmask:   { name: 'Противогаз ГП-5',           pts: 50 },
  dosimeter: { name: 'Дозиметр ДП-5В',            pts: 120 },
  sign:      { name: 'Табличка «УБЕЖИЩЕ»',         pts: 200 },
  journal:   { name: 'Журнал дежурств 1983 г.',   pts: 80 },
  filter:    { name: 'Фильтр ФПУ-200',            pts: 60 },
  aid:       { name: 'Аптечка АИ-2',              pts: 50 },
  radio:     { name: 'Рация Р-105М',              pts: 150 },
  ozk:       { name: 'Костюм ОЗК',                pts: 90 },
};
const ROOM_LOOT = {
  lock:     { gasmask: 1 },
  shelter:  { gasmask: 4, ozk: 2, journal: 1 },
  fvk:      { filter: 4, gasmask: 2, dosimeter: 1 },
  des:      { radio: 1, filter: 2, dosimeter: 1, journal: 1 },
  med:      { aid: 5, gasmask: 1 },
  control:  { journal: 3, radio: 2, dosimeter: 2, sign: 1 },
  wc:       { aid: 1, gasmask: 1 },
  store:    { ozk: 2, gasmask: 2, aid: 2 },
  pump:     { dosimeter: 1, filter: 1 },
  exitroom: { sign: 1, radio: 1 },
};

const SPOTS = {
  poster:   { name: 'Плакат «Сигналы ГО»',     pts: 40 },
  scheme:   { name: 'Схема эвакуации',         pts: 50 },
  slogan:   { name: 'Лозунг «ГО — дело всех!»', pts: 60 },
  mosaic:   { name: 'Советская мозаика',       pts: 140 },
  panel:    { name: 'Щит управления',          pts: 70 },
  hermo:    { name: 'Гермодверь ЗД-1',         pts: 80 },
  graffiti: { name: 'Граффити диггеров',       pts: 30 },
  portrait: { name: 'Портрет вождя',           pts: 100 },
};
const ROOM_SPOTS = {
  shelter: ['poster', 'slogan', 'poster', 'mosaic'],
  fvk: ['panel', 'scheme'],
  des: ['panel', 'scheme'],
  med: ['poster', 'scheme'],
  control: ['portrait', 'scheme', 'slogan', 'mosaic'],
  wc: ['graffiti', 'poster'],
  store: ['scheme', 'slogan'],
  pump: ['panel', 'graffiti'],
  exitroom: ['scheme', 'slogan'],
};
const GRAFFITI_TEXT = ['ДИГГЕРЫ ТУТ', 'ЦОЙ ЖИВ', '1991', 'СТАЛК', 'НЕ ВЛЕЗАЙ', 'ВАСЯ+ЛЕНА', 'УЛЕТАЙ'];

// ============================================================
//  Состояние игры
// ============================================================
const G = {
  state: 'menu', level: 1, lootScore: 0, photoScore: 0, photos: 0, bag: [],
  map: null, zone: null, propKind: null, rooms: [], items: [], spots: [], guards: [], rats: [], lamps: [],
  bigProps: [], decals: [], player: null, explored: null, staticCv: null,
  exit: null, down: null, floats: [], rings: [], flash: 0, flashPoly: null,
  time: 0, showMap: true, curZone: -2, shake: 0, chaseT: 0, heartT: 0, dripT: 2, levelSeed: 1,
};

const isSolid = (x, y) => {
  if (x < 0 || y < 0 || x >= MW || y >= MH) return true;
  const t = G.map[y * MW + x];
  return t === WALL || t === PROP;
};
const blocksLight = (x, y) => (x < 0 || y < 0 || x >= MW || y >= MH) ? true : G.map[y * MW + x] === WALL;
const tileAt = (x, y) => {
  x = Math.floor(x); y = Math.floor(y);
  if (x < 0 || y < 0 || x >= MW || y >= MH) return WALL;
  return G.map[y * MW + x];
};

// ============================================================
//  Генерация уровня
// ============================================================
function genLevel(level) {
  G.levelSeed = (Date.now() ^ (level * 7919) ^ Math.floor(Math.random() * 1e9)) >>> 0;
  rnd = mulberry32(G.levelSeed);
  const map = new Uint8Array(MW * MH);
  const zone = new Int8Array(MW * MH).fill(-1);
  const propKind = new Array(MW * MH).fill(null);
  G.map = map; G.zone = zone; G.propKind = propKind;

  // --- комнаты
  let rooms = [];
  for (let tries = 0; tries < 600 && rooms.length < 13; tries++) {
    const w = ri(6, 12), h = ri(5, 9);
    const x = ri(2, MW - w - 2), y = ri(2, MH - h - 2);
    let ok = true;
    for (const r of rooms) {
      if (x < r.x + r.w + 3 && x + w + 3 > r.x && y < r.y + r.h + 3 && y + h + 3 > r.y) { ok = false; break; }
    }
    if (ok) rooms.push({ x, y, w, h, cx: Math.floor(x + w / 2), cy: Math.floor(y + h / 2) });
  }
  // стартовая — ближе всех к левому верхнему углу
  rooms.sort((a, b) => (a.cx + a.cy) - (b.cx + b.cy));
  rooms.forEach((r, i) => {
    r.id = i;
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) { map[y * MW + x] = FLOOR; zone[y * MW + x] = i; }
  });

  // --- коридоры (дерево Прима + несколько петель)
  const carve = (x, y) => {
    if (x < 1 || y < 1 || x >= MW - 1 || y >= MH - 1) return;
    if (map[y * MW + x] === WALL) map[y * MW + x] = FLOOR;
  };
  const carveH = (x1, x2, y) => { for (let x = Math.min(x1, x2); x <= Math.max(x1, x2) + 1; x++) { carve(x, y); carve(x, y + 1); } };
  const carveV = (y1, y2, x) => { for (let y = Math.min(y1, y2); y <= Math.max(y1, y2) + 1; y++) { carve(x, y); carve(x + 1, y); } };
  const edges = [];
  const inTree = [rooms[0]], rest = rooms.slice(1);
  while (rest.length) {
    let best = null, bd = 1e9;
    for (const a of inTree) for (const b of rest) {
      const d = Math.abs(a.cx - b.cx) + Math.abs(a.cy - b.cy);
      if (d < bd) { bd = d; best = [a, b]; }
    }
    edges.push(best); inTree.push(best[1]); rest.splice(rest.indexOf(best[1]), 1);
  }
  for (let i = 0; i < 3; i++) { const a = pick(rooms), b = pick(rooms); if (a !== b) edges.push([a, b]); }
  for (const [a, b] of edges) {
    if (rnd() < 0.5) { carveH(a.cx, b.cx, a.cy); carveV(a.cy, b.cy, b.cx); }
    else { carveV(a.cy, b.cy, a.cx); carveH(a.cx, b.cx, b.cy); }
  }

  // --- дверные проёмы
  for (const r of rooms) {
    const ring = [];
    for (let x = r.x - 1; x <= r.x + r.w; x++) { ring.push([x, r.y - 1]); ring.push([x, r.y + r.h]); }
    for (let y = r.y; y < r.y + r.h; y++) { ring.push([r.x - 1, y]); ring.push([r.x + r.w, y]); }
    for (const [x, y] of ring) {
      const i = y * MW + x;
      if (map[i] === FLOOR && zone[i] === -1) map[i] = DOOR;
    }
  }

  // --- расстояния от старта → самая дальняя комната = лаз вниз
  const start = rooms[0];
  const dmap = bfsDist(start.cx, start.cy);
  let downRoom = rooms[rooms.length - 1], md = -1;
  for (const r of rooms) { const d = dmap[r.cy * MW + r.cx]; if (d > md) { md = d; downRoom = r; } }
  for (const r of rooms) r.dist = dmap[r.cy * MW + r.cx];

  // --- типы комнат
  const pool = shuffle(['shelter', 'fvk', 'des', 'med', 'control', 'wc', 'store', 'shelter', 'fvk', 'store', 'shelter', 'control', 'med']);
  if (level >= 2) pool.unshift('pump');
  let pi = 0;
  for (const r of rooms) {
    if (r === start) r.type = 'lock';
    else if (r === downRoom) r.type = 'exitroom';
    else r.type = pool[pi++ % pool.length];
  }
  G.rooms = rooms;

  // --- крупный реквизит (дизель-генератор по центру)
  G.bigProps = [];
  for (const r of rooms) {
    if (ROOM_TYPES[r.type].big && r.w >= 6 && r.h >= 6) {
      const bx = r.cx - 1, by = r.cy - 1;
      for (let y = by; y < by + 2; y++) for (let x = bx; x < bx + 2; x++) { map[y * MW + x] = PROP; propKind[y * MW + x] = 'big'; }
      G.bigProps.push({ kind: ROOM_TYPES[r.type].big, x: bx, y: by });
    }
  }

  // --- мелкий реквизит вдоль стен
  const nearDoor = (x, y) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const t = map[(y + dy) * MW + x + dx]; if (t === DOOR) return true;
    }
    return false;
  };
  for (const r of rooms) {
    const rt = ROOM_TYPES[r.type];
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
      const edge = x === r.x || x === r.x + r.w - 1 || y === r.y || y === r.y + r.h - 1;
      if (!edge) continue;
      if (x === r.cx && y === r.cy) continue;
      if (nearDoor(x, y)) continue;
      if (map[y * MW + x] !== FLOOR) continue;
      if (rnd() < rt.pd) { map[y * MW + x] = PROP; propKind[y * MW + x] = pick(rt.props); }
    }
  }

  // --- вода
  const flood = (cx, cy, rad, p) => {
    for (let y = cy - rad; y <= cy + rad; y++) for (let x = cx - rad; x <= cx + rad; x++) {
      if (x < 1 || y < 1 || x >= MW - 1 || y >= MH - 1) continue;
      if (dist(x, y, cx, cy) > rad + 0.3) continue;
      if (map[y * MW + x] === FLOOR && rnd() < p) map[y * MW + x] = WATER;
    }
  };
  for (const r of rooms) if (r.type === 'pump') {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (map[y * MW + x] === FLOOR && rnd() < 0.9) map[y * MW + x] = WATER;
  }
  const corridorTiles = [];
  for (let i = 0; i < MW * MH; i++) if (map[i] === FLOOR && zone[i] === -1) corridorTiles.push(i);
  const blobs = level === 1 ? 2 : 2 + level;
  for (let b = 0; b < blobs && corridorTiles.length; b++) {
    const i = pick(corridorTiles);
    flood(i % MW, (i / MW) | 0, level === 1 ? ri(1, 2) : ri(2, 4), 0.85);
  }

  // --- выход и лаз
  map[start.cy * MW + start.cx] = EXIT;
  map[downRoom.cy * MW + downRoom.cx] = DOWN;
  G.exit = { x: start.cx, y: start.cy };
  G.down = { x: downRoom.cx, y: downRoom.cy };

  // --- достижимость (если лаз недостижим или комнат мало — генерируем заново)
  const reach = bfsDist(start.cx, start.cy);
  const reachable = i => reach[i] >= 0;
  if (rooms.length < 5 || !reachable(downRoom.cy * MW + downRoom.cx) || downRoom === start) return genLevel(level);

  // --- фото-точки
  G.spots = [];
  const usedWall = new Set();
  const addSpot = (x, y, kind, extra) => {
    usedWall.add(y * MW + x);
    G.spots.push(Object.assign({ x, y, kind, taken: false, px: x + 0.5, py: y + 1 }, extra || {}));
  };
  for (const r of rooms) {
    if (r.type === 'lock') {
      // гермодверь на верхней стене шлюза
      const cands = [];
      for (let x = r.x + 1; x < r.x + r.w - 1; x++) if (map[(r.y - 1) * MW + x] === WALL && x !== r.cx) cands.push(x);
      if (cands.length) addSpot(pick(cands), r.y - 1, 'hermo');
      continue;
    }
    const list = ROOM_SPOTS[r.type];
    if (!list || rnd() > 0.8) continue;
    const cands = [];
    for (let x = r.x + 1; x < r.x + r.w - 1; x++) {
      if (x === r.cx) continue;
      const wi = (r.y - 1) * MW + x;
      if (map[wi] === WALL && !usedWall.has(wi) && reachable(r.y * MW + x + (map[r.y * MW + x] === PROP ? MW : 0))) cands.push(x);
    }
    if (cands.length) {
      let kind = pick(list);
      if (kind === 'mosaic' && rnd() < 0.5) kind = 'poster';
      addSpot(pick(cands), r.y - 1, kind);
    }
  }
  // граффити в коридорах
  const gCands = [];
  for (let y = 1; y < MH - 1; y++) for (let x = 1; x < MW - 1; x++) {
    const i = y * MW + x;
    if (map[i] === WALL && (map[i + MW] === FLOOR || map[i + MW] === WATER) && zone[i + MW] === -1 && reachable(i + MW)) gCands.push(i);
  }
  shuffle(gCands);
  let gc = 0;
  for (const i of gCands) {
    if (gc >= 3) break;
    if ([...usedWall].some(u => Math.abs((u % MW) - (i % MW)) + Math.abs(((u / MW) | 0) - ((i / MW) | 0)) < 6)) continue;
    addSpot(i % MW, (i / MW) | 0, 'graffiti', { text: pick(GRAFFITI_TEXT), color: pick(['#d84a3a', '#5ec8e8', '#e8c547', '#9fd36a', '#e07ad8']) });
    gc++;
  }

  // --- хабар
  G.items = [];
  const occupied = (x, y) => G.items.some(it => Math.abs(it.x - x - 0.5) < 2 && Math.abs(it.y - y - 0.5) < 2);
  const freeTileInRoom = r => {
    for (let t = 0; t < 40; t++) {
      const x = ri(r.x, r.x + r.w - 1), y = ri(r.y, r.y + r.h - 1);
      const tt = map[y * MW + x];
      if ((tt === FLOOR || tt === WATER) && reachable(y * MW + x) && !occupied(x, y)) return [x, y];
    }
    return null;
  };
  const lootRooms = rooms.filter(r => r !== start);
  const lootCount = 7 + level;
  let signPlaced = false;
  for (let n = 0; n < lootCount; n++) {
    const r = pick(lootRooms);
    let type = weighted(ROOM_LOOT[r.type]);
    if (type === 'sign') { if (signPlaced) type = 'gasmask'; else signPlaced = true; }
    const pos = freeTileInRoom(r);
    if (pos) G.items.push({ type, x: pos[0] + 0.5, y: pos[1] + 0.5, ph: rnd() * 6 });
  }
  const batCount = Math.max(2, 5 - level);
  for (let n = 0; n < batCount; n++) {
    let pos = null;
    if (rnd() < 0.5 && corridorTiles.length) {
      for (let t = 0; t < 30 && !pos; t++) {
        const i = pick(corridorTiles);
        if (map[i] === FLOOR && reachable(i) && !occupied(i % MW, (i / MW) | 0)) pos = [i % MW, (i / MW) | 0];
      }
    }
    if (!pos) pos = freeTileInRoom(pick(lootRooms));
    if (pos) G.items.push({ type: 'battery', x: pos[0] + 0.5, y: pos[1] + 0.5, ph: rnd() * 6 });
  }

  // --- лампы аварийного освещения
  G.lamps = [];
  G.lamps.push({ x: start.cx + 0.5, y: start.cy + 0.5, rgb: '140,170,255', R: 4.2, base: 0.55, moon: true, broken: false });
  for (const r of rooms) {
    if (r === start) continue;
    if (r === downRoom || rnd() < 0.45) {
      let lx = r.cx; if (map[(r.y - 1) * MW + lx] !== WALL || usedWall.has((r.y - 1) * MW + lx)) continue;
      G.lamps.push({
        x: lx + 0.5, y: r.y + 0.12, rgb: r === downRoom ? '255,50,30' : pick(['255,60,40', '255,180,80', '200,255,170']),
        R: 5, base: 0.7, broken: rnd() < 0.4, on: true, t: 0, wx: lx, wy: r.y - 1,
      });
    }
  }
  for (const L of G.lamps) L.poly = radialPoly(L.x, L.y, L.R, 100);

  // --- охрана
  G.guards = [];
  const nG = Math.min(1 + Math.floor((level - 1) * 0.8), 5);
  const far = rooms.filter(r => r !== start && r.dist > md * 0.4);
  for (let n = 0; n < nG; n++) {
    const r = far.length ? far[n % far.length] : pick(lootRooms);
    const pos = freeTileInRoom(r) || [r.cx, r.cy + 1];
    G.guards.push({
      x: pos[0] + 0.5, y: pos[1] + 0.5, a: rnd() * 6.28, state: 'patrol', path: [], wait: ri(1, 3),
      susp: 0, lastX: 0, lastY: 0, repath: 0, lost: 0, timer: 0, lookBase: 0, seed: rnd() * 10, sees: false, stepT: 0,
    });
  }

  // --- крысы
  G.rats = [];
  const nR = ri(4, 7);
  for (let n = 0; n < nR; n++) {
    const pos = freeTileInRoom(pick(lootRooms));
    if (pos) G.rats.push({ x: pos[0] + 0.5, y: pos[1] + 0.5, a: rnd() * 6.28, t: 0, cd: 0, sp: 0 });
  }

  // --- декали
  G.decals = [];

  G.explored = new Uint8Array(MW * MH);
  renderStatic();
}

function bfsDist(sx, sy) {
  const d = new Int16Array(MW * MH).fill(-1);
  const q = [sy * MW + sx]; d[q[0]] = 0; let qi = 0;
  while (qi < q.length) {
    const c = q[qi++], cx = c % MW, cy = (c / MW) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (isSolid(nx, ny)) continue;
      const n = ny * MW + nx;
      if (d[n] === -1) { d[n] = d[c] + 1; q.push(n); }
    }
  }
  return d;
}

const bfsPrev = new Int32Array(MW * MH);
function findPath(sx, sy, tx, ty) {
  sx = Math.floor(sx); sy = Math.floor(sy); tx = Math.floor(tx); ty = Math.floor(ty);
  if (isSolid(tx, ty) || isSolid(sx, sy)) return [];
  const start = sy * MW + sx, goal = ty * MW + tx;
  if (start === goal) return [];
  bfsPrev.fill(-1); bfsPrev[start] = start;
  const q = [start]; let qi = 0;
  while (qi < q.length) {
    const c = q[qi++]; if (c === goal) break;
    const cx = c % MW, cy = (c / MW) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (isSolid(nx, ny)) continue;
      const n = ny * MW + nx;
      if (bfsPrev[n] === -1) { bfsPrev[n] = c; q.push(n); }
    }
  }
  if (bfsPrev[goal] === -1) return [];
  const path = []; let c = goal;
  while (c !== start) { path.push([c % MW, (c / MW) | 0]); c = bfsPrev[c]; }
  return path.reverse();
}

// ============================================================
//  Лучи / видимость
// ============================================================
function castRay(ox, oy, ang, maxD, mark) {
  let dx = Math.cos(ang), dy = Math.sin(ang);
  if (Math.abs(dx) < 1e-9) dx = 1e-9;
  if (Math.abs(dy) < 1e-9) dy = 1e-9;
  let mx = Math.floor(ox), my = Math.floor(oy);
  const ddx = Math.abs(1 / dx), ddy = Math.abs(1 / dy);
  let stepX, stepY, sdx, sdy;
  if (dx < 0) { stepX = -1; sdx = (ox - mx) * ddx; } else { stepX = 1; sdx = (mx + 1 - ox) * ddx; }
  if (dy < 0) { stepY = -1; sdy = (oy - my) * ddy; } else { stepY = 1; sdy = (my + 1 - oy) * ddy; }
  let d = 0;
  for (let it = 0; it < 200; it++) {
    if (mark && mx >= 0 && my >= 0 && mx < MW && my < MH) G.explored[my * MW + mx] = 1;
    if (sdx < sdy) { d = sdx; sdx += ddx; mx += stepX; } else { d = sdy; sdy += ddy; my += stepY; }
    if (d > maxD) return maxD;
    if (blocksLight(mx, my)) {
      if (mark && mx >= 0 && my >= 0 && mx < MW && my < MH) G.explored[my * MW + mx] = 1;
      return d;
    }
  }
  return maxD;
}
const EXT = 0.55; // насколько свет заходит на стену (чтобы стены/плакаты были видны)
function conePoly(ox, oy, ang, half, R, n, mark) {
  const pts = [[ox, oy]];
  for (let i = 0; i <= n; i++) {
    const a = ang - half + 2 * half * i / n;
    let d = castRay(ox, oy, a, R, mark);
    if (d < R) d += EXT;
    pts.push([ox + Math.cos(a) * d, oy + Math.sin(a) * d]);
  }
  return pts;
}
function radialPoly(ox, oy, R, n, mark) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2;
    let d = castRay(ox, oy, a, R, mark);
    if (d < R) d += EXT;
    pts.push([ox + Math.cos(a) * d, oy + Math.sin(a) * d]);
  }
  return pts;
}
function los(ax, ay, bx, by) {
  const d = dist(ax, ay, bx, by);
  return castRay(ax, ay, Math.atan2(by - ay, bx - ax), d, false) >= d - 0.05;
}

// ============================================================
//  Статическая отрисовка карты
// ============================================================
const FLOOR_COL = {
  concrete: '#4a4741', metal: '#3c4144', tile: '#6d716b', lino: '#5a4a3b', corridor: '#3d3a35',
};
function renderStatic() {
  const c = document.createElement('canvas');
  c.width = MW * T; c.height = MH * T;
  const g = c.getContext('2d');
  g.fillStyle = '#0a0a09'; g.fillRect(0, 0, c.width, c.height);
  const map = G.map;
  const isWallT = (x, y) => (x < 0 || y < 0 || x >= MW || y >= MH) ? true : map[y * MW + x] === WALL;

  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const i = y * MW + x, t = map[i];
    const tr = mulberry32(G.levelSeed + i * 31);
    const px = x * T, py = y * T;
    if (t === WALL) {
      let nearOpen = false;
      for (let dy = -1; dy <= 1 && !nearOpen; dy++) for (let dx = -1; dx <= 1; dx++) if (!isWallT(x + dx, y + dy)) { nearOpen = true; break; }
      if (!nearOpen) continue;
      // верх стены
      g.fillStyle = '#26231f'; g.fillRect(px, py, T, T);
      for (let k = 0; k < 10; k++) {
        g.fillStyle = tr() < 0.5 ? 'rgba(0,0,0,.25)' : 'rgba(255,255,255,.04)';
        g.fillRect(px + tr() * T, py + tr() * T, 2, 2);
      }
      // лицевая грань (если снизу пол)
      if (!isWallT(x, y + 1)) {
        g.fillStyle = '#7d7a6c'; g.fillRect(px, py + 10, T, 8);   // побелка
        g.fillStyle = '#3e5a4b'; g.fillRect(px, py + 18, T, 14);  // советская зелёная панель
        g.fillStyle = '#2b3f35'; g.fillRect(px, py + 18, T, 1.5);
        g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(px, py + 30, T, 2);
        for (let k = 0; k < 6; k++) { // облупленная краска
          g.fillStyle = tr() < 0.5 ? 'rgba(120,110,95,.6)' : 'rgba(30,30,25,.45)';
          g.beginPath(); g.ellipse(px + tr() * T, py + 12 + tr() * 18, 1 + tr() * 3, 1 + tr() * 2, 0, 0, 7); g.fill();
        }
        if (tr() < 0.25) { // потёк ржавчины
          g.fillStyle = 'rgba(110,60,25,.35)'; const sx = px + tr() * 26; g.fillRect(sx, py + 10, 2 + tr() * 3, 10 + tr() * 18);
        }
      }
      continue;
    }
    // --- пол
    const z = G.zone[i];
    let style = z >= 0 ? ROOM_TYPES[G.rooms[z].type].floor : 'corridor';
    if (t === DOOR) style = 'corridor';
    g.fillStyle = FLOOR_COL[style]; g.fillRect(px, py, T, T);
    if (style === 'tile') {
      g.strokeStyle = 'rgba(30,30,30,.45)'; g.lineWidth = 1;
      g.strokeRect(px + .5, py + .5, 15, 15); g.strokeRect(px + 16.5, py + .5, 15, 15);
      g.strokeRect(px + .5, py + 16.5, 15, 15); g.strokeRect(px + 16.5, py + 16.5, 15, 15);
      if (tr() < 0.3) { g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(px + (tr() < .5 ? 0 : 16), py + (tr() < .5 ? 0 : 16), 16, 16); }
    } else if (style === 'metal') {
      g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 1.5;
      for (let k = 0; k < 4; k++) for (let m = 0; m < 4; m++) {
        const cx = px + 4 + k * 8, cy = py + 4 + m * 8;
        g.beginPath(); g.moveTo(cx - 2, cy + (k + m) % 2 * 2 - 1); g.lineTo(cx + 2, cy - (k + m) % 2 * 2 + 1); g.stroke();
      }
      g.strokeStyle = 'rgba(0,0,0,.4)'; g.strokeRect(px + .5, py + .5, T - 1, T - 1);
    } else if (style === 'lino') {
      g.fillStyle = 'rgba(140,90,50,.15)';
      if ((x + y) % 2 === 0) g.fillRect(px, py, T, T);
    }
    for (let k = 0; k < 12; k++) {
      g.fillStyle = tr() < 0.5 ? 'rgba(0,0,0,.18)' : 'rgba(255,255,255,.05)';
      g.fillRect(px + tr() * T, py + tr() * T, 1 + tr() * 2, 1 + tr() * 2);
    }
    // трещины, мусор, лужи
    const dr = tr();
    if (dr < 0.07) {
      g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 1; g.beginPath();
      let cx = px + tr() * T, cy = py + tr() * T; g.moveTo(cx, cy);
      for (let k = 0; k < 4; k++) { cx += (tr() - .5) * 14; cy += (tr() - .5) * 14; g.lineTo(cx, cy); }
      g.stroke();
    } else if (dr < 0.12) { // обломки
      for (let k = 0; k < 5; k++) { g.fillStyle = ['#5c5850', '#2e2c28', '#6b665b'][k % 3]; g.fillRect(px + 4 + tr() * 22, py + 4 + tr() * 22, 2 + tr() * 4, 2 + tr() * 3); }
    } else if (dr < 0.15) { // бумажка
      g.save(); g.translate(px + 8 + tr() * 16, py + 8 + tr() * 16); g.rotate(tr() * 3);
      g.fillStyle = 'rgba(200,190,160,.75)'; g.fillRect(-5, -4, 10, 8);
      g.fillStyle = 'rgba(60,60,60,.5)'; g.fillRect(-4, -2, 7, 1); g.fillRect(-4, 0, 6, 1); g.restore();
    } else if (dr < 0.17) { // бутылка
      g.save(); g.translate(px + 8 + tr() * 16, py + 8 + tr() * 16); g.rotate(tr() * 6);
      g.fillStyle = 'rgba(60,110,60,.85)'; g.fillRect(-2, -6, 4, 9); g.fillRect(-1, -9, 2, 3); g.restore();
    } else if (dr < 0.21) {
      g.fillStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.ellipse(px + 16, py + 16, 6 + tr() * 8, 4 + tr() * 5, tr() * 3, 0, 7); g.fill();
    }
    // тень от стен (ambient occlusion)
    if (isWallT(x, y - 1)) { const gr = g.createLinearGradient(0, py, 0, py + 10); gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(px, py, T, 10); }
    if (isWallT(x - 1, y)) { const gr = g.createLinearGradient(px, 0, px + 6, 0); gr.addColorStop(0, 'rgba(0,0,0,.4)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(px, py, 6, T); }
    if (isWallT(x + 1, y)) { const gr = g.createLinearGradient(px + T, 0, px + T - 6, 0); gr.addColorStop(0, 'rgba(0,0,0,.4)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(px + T - 6, py, 6, T); }

    if (t === WATER) {
      g.fillStyle = 'rgba(22,52,58,.82)'; g.fillRect(px, py, T, T);
      g.fillStyle = 'rgba(120,170,170,.08)';
      for (let k = 0; k < 3; k++) g.fillRect(px + tr() * 24, py + tr() * 30, 6 + tr() * 8, 1);
    } else if (t === DOOR) {
      // порог гермопроёма
      g.fillStyle = '#2b2d2e'; g.fillRect(px, py, T, T);
      g.save(); g.beginPath(); g.rect(px + 2, py + 2, T - 4, T - 4); g.clip();
      for (let k = -T; k < T * 2; k += 8) { g.fillStyle = (k / 8) % 2 === 0 ? 'rgba(232,197,71,.35)' : 'rgba(0,0,0,.35)'; g.beginPath(); g.moveTo(px + k, py); g.lineTo(px + k + 4, py); g.lineTo(px + k + 4 - T, py + T); g.lineTo(px + k - T, py + T); g.fill(); }
      g.restore();
    } else if (t === EXIT) {
      drawExit(g, px, py);
    } else if (t === DOWN) {
      drawDown(g, px, py);
    } else if (t === PROP && G.propKind[i] !== 'big') {
      drawProp(g, G.propKind[i], px, py, tr);
    }
  }
  for (const b of G.bigProps) drawBig(g, b);
  for (const s of G.spots) drawSpot(g, s);
  G.staticCv = c;
}

function drawExit(g, px, py) {
  g.fillStyle = '#16191c'; g.beginPath(); g.arc(px + 16, py + 16, 15, 0, 7); g.fill();
  g.strokeStyle = '#6b7075'; g.lineWidth = 3; g.beginPath(); g.arc(px + 16, py + 16, 14, 0, 7); g.stroke();
  g.strokeStyle = '#a7acb0'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(px + 10, py + 4); g.lineTo(px + 10, py + 28); g.moveTo(px + 22, py + 4); g.lineTo(px + 22, py + 28); g.stroke();
  for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(px + 10, py + 7 + k * 6); g.lineTo(px + 22, py + 7 + k * 6); g.stroke(); }
}
function drawDown(g, px, py) {
  g.fillStyle = '#000'; g.fillRect(px + 2, py + 2, 28, 28);
  g.strokeStyle = '#e8c547'; g.lineWidth = 2; g.setLineDash([4, 4]); g.strokeRect(px + 2, py + 2, 28, 28); g.setLineDash([]);
  g.strokeStyle = '#555'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(px + 11, py + 4); g.lineTo(px + 11, py + 28); g.moveTo(px + 21, py + 4); g.lineTo(px + 21, py + 28); g.stroke();
  for (let k = 0; k < 4; k++) { g.strokeStyle = `rgba(90,90,90,${1 - k * 0.22})`; g.beginPath(); g.moveTo(px + 11, py + 7 + k * 6); g.lineTo(px + 21, py + 7 + k * 6); g.stroke(); }
}

function drawProp(g, kind, px, py, tr) {
  g.save();
  switch (kind) {
    case 'bunk':
      g.fillStyle = '#555'; g.fillRect(px + 2, py + 2, 28, 28);
      g.fillStyle = '#5c4630'; g.fillRect(px + 4, py + 4, 24, 24);
      g.strokeStyle = '#3a2c1e'; g.lineWidth = 1;
      for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(px + 4, py + 4 + k * 6); g.lineTo(px + 28, py + 4 + k * 6); g.stroke(); }
      if (tr() < 0.4) { g.fillStyle = '#6d6a55'; g.fillRect(px + 7, py + 7, 12, 8); }
      break;
    case 'filter':
      g.fillStyle = '#1d2e21'; g.beginPath(); g.arc(px + 16, py + 16, 13, 0, 7); g.fill();
      g.fillStyle = '#35553d'; g.beginPath(); g.arc(px + 16, py + 16, 11, 0, 7); g.fill();
      g.fillStyle = '#2a4431'; g.beginPath(); g.arc(px + 16, py + 16, 6, 0, 7); g.fill();
      g.fillStyle = '#999';
      for (let k = 0; k < 6; k++) { const a = k / 6 * 6.28; g.fillRect(px + 16 + Math.cos(a) * 9 - 1, py + 16 + Math.sin(a) * 9 - 1, 2, 2); }
      g.fillStyle = '#ddd'; g.font = 'bold 6px monospace'; g.textAlign = 'center'; g.fillText('ФП', px + 16, py + 18);
      break;
    case 'fan':
      g.fillStyle = '#4f5457'; g.fillRect(px + 2, py + 2, 28, 28);
      g.fillStyle = '#1b1d1e'; g.beginPath(); g.arc(px + 16, py + 16, 11, 0, 7); g.fill();
      g.strokeStyle = '#777'; g.lineWidth = 3;
      for (let k = 0; k < 3; k++) { const a = k * 2.09 + tr(); g.beginPath(); g.moveTo(px + 16, py + 16); g.lineTo(px + 16 + Math.cos(a) * 9, py + 16 + Math.sin(a) * 9); g.stroke(); }
      break;
    case 'barrel': {
      const col = tr() < 0.5 ? ['#7a4a26', '#5a3519'] : ['#2f4f6b', '#203648'];
      g.fillStyle = col[1]; g.beginPath(); g.arc(px + 16, py + 16, 12, 0, 7); g.fill();
      g.fillStyle = col[0]; g.beginPath(); g.arc(px + 16, py + 16, 10, 0, 7); g.fill();
      g.strokeStyle = col[1]; g.lineWidth = 1.5; g.beginPath(); g.arc(px + 16, py + 16, 6, 0, 7); g.stroke();
      g.fillStyle = '#222'; g.beginPath(); g.arc(px + 20, py + 12, 2, 0, 7); g.fill();
      break;
    }
    case 'cabinet':
      g.fillStyle = '#c9c5b8'; g.fillRect(px + 3, py + 3, 26, 26);
      g.strokeStyle = '#8a877c'; g.strokeRect(px + 3.5, py + 3.5, 25, 25);
      g.fillStyle = '#c0392b'; g.fillRect(px + 14, py + 8, 4, 16); g.fillRect(px + 8, py + 14, 16, 4);
      break;
    case 'cot':
      g.fillStyle = '#6f736c'; g.fillRect(px + 3, py + 2, 26, 28);
      g.fillStyle = '#a9a38e'; g.fillRect(px + 5, py + 4, 22, 24);
      g.fillStyle = '#d2ccb6'; g.fillRect(px + 7, py + 5, 18, 6);
      if (tr() < 0.5) { g.fillStyle = 'rgba(120,40,30,.4)'; g.beginPath(); g.ellipse(px + 18, py + 20, 4, 3, 0, 0, 7); g.fill(); }
      break;
    case 'desk':
      g.fillStyle = '#5b4127'; g.fillRect(px + 2, py + 4, 28, 24);
      g.strokeStyle = '#3e2c1a'; g.strokeRect(px + 2.5, py + 4.5, 27, 23);
      g.fillStyle = '#d8d2bd'; g.save(); g.translate(px + 11, py + 15); g.rotate(tr() - .5); g.fillRect(-5, -6, 10, 12); g.restore();
      if (tr() < 0.5) { g.fillStyle = '#1c1c1c'; g.fillRect(px + 19, py + 9, 8, 6); g.fillStyle = '#c0392b'; g.fillRect(px + 21, py + 10, 4, 1.5); }
      break;
    case 'panel':
      g.fillStyle = '#5d6468'; g.fillRect(px + 2, py + 2, 28, 28);
      g.strokeStyle = '#3a3f42'; g.strokeRect(px + 2.5, py + 2.5, 27, 27);
      for (let k = 0; k < 2; k++) {
        g.fillStyle = '#e0dccf'; g.beginPath(); g.arc(px + 10 + k * 12, py + 11, 4, 0, 7); g.fill();
        g.strokeStyle = '#111'; g.lineWidth = 1; g.beginPath(); g.moveTo(px + 10 + k * 12, py + 11); g.lineTo(px + 10 + k * 12 + 3 * Math.cos(tr() * 3 + 3), py + 11 + 3 * Math.sin(tr() * 3 + 3)); g.stroke();
      }
      g.fillStyle = '#7a1c14'; g.fillRect(px + 7, py + 21, 4, 4);
      g.fillStyle = '#1e5a1e'; g.fillRect(px + 14, py + 21, 4, 4);
      g.fillStyle = '#7a6a14'; g.fillRect(px + 21, py + 21, 4, 4);
      break;
    case 'sink':
      g.fillStyle = '#d7d7cf'; g.fillRect(px + 4, py + 6, 24, 18);
      g.fillStyle = '#8f9a98'; g.beginPath(); g.ellipse(px + 16, py + 16, 8, 5, 0, 0, 7); g.fill();
      g.fillStyle = '#666'; g.fillRect(px + 15, py + 6, 2, 5);
      break;
    case 'toilet': // чаша Генуя
      g.fillStyle = '#cfcfc6'; g.fillRect(px + 3, py + 3, 26, 26);
      g.fillStyle = '#9fa19a'; g.fillRect(px + 7, py + 8, 6, 10); g.fillRect(px + 19, py + 8, 6, 10);
      g.fillStyle = '#2a2a26'; g.beginPath(); g.ellipse(px + 16, py + 22, 4, 4, 0, 0, 7); g.fill();
      break;
    case 'crate':
      g.fillStyle = '#7b5a32'; g.fillRect(px + 3, py + 3, 26, 26);
      g.strokeStyle = '#4e3820'; g.lineWidth = 2; g.strokeRect(px + 4, py + 4, 24, 24);
      g.beginPath(); g.moveTo(px + 4, py + 4); g.lineTo(px + 28, py + 28); g.moveTo(px + 28, py + 4); g.lineTo(px + 4, py + 28); g.stroke();
      break;
    case 'locker':
      g.fillStyle = '#4d5a5e'; g.fillRect(px + 3, py + 2, 26, 28);
      g.strokeStyle = '#2e3739'; g.lineWidth = 1; g.beginPath(); g.moveTo(px + 16, py + 2); g.lineTo(px + 16, py + 30); g.stroke();
      g.fillStyle = '#2e3739'; for (let k = 0; k < 3; k++) { g.fillRect(px + 6, py + 6 + k * 3, 7, 1); g.fillRect(px + 19, py + 6 + k * 3, 7, 1); }
      g.fillStyle = '#aaa'; g.fillRect(px + 13, py + 16, 2, 4); g.fillRect(px + 17, py + 16, 2, 4);
      break;
  }
  g.restore();
}

function drawBig(g, b) {
  const px = b.x * T, py = b.y * T;
  if (b.kind === 'machine') {
    g.fillStyle = '#2c2f24'; g.fillRect(px + 2, py + 4, 60, 56);
    g.fillStyle = '#4a4f3a'; g.fillRect(px + 4, py + 6, 56, 52);
    g.fillStyle = '#3a3e2d'; g.fillRect(px + 8, py + 10, 30, 20);
    g.strokeStyle = '#25281d'; g.lineWidth = 2;
    for (let k = 0; k < 5; k++) { g.beginPath(); g.moveTo(px + 10, py + 13 + k * 4); g.lineTo(px + 36, py + 13 + k * 4); g.stroke(); }
    g.fillStyle = '#1f211a'; g.beginPath(); g.arc(px + 48, py + 20, 8, 0, 7); g.fill();
    g.fillStyle = '#7a1c14'; g.fillRect(px + 4, py + 40, 56, 4);
    g.fillStyle = '#6b6b5c'; g.fillRect(px + 10, py + 46, 12, 8); g.fillRect(px + 42, py + 46, 12, 8);
    g.fillStyle = '#ddd'; g.font = 'bold 7px monospace'; g.textAlign = 'center'; g.fillText('ДГА-48', px + 32, py + 38);
  }
}

function drawSpot(g, s) {
  const px = s.x * T, py = s.y * T;
  g.save();
  switch (s.kind) {
    case 'poster':
      g.fillStyle = '#d9cfae'; g.fillRect(px + 6, py + 11, 20, 19);
      g.fillStyle = '#b52a1e'; g.fillRect(px + 6, py + 11, 20, 5);
      g.fillStyle = '#333'; g.beginPath(); g.arc(px + 13, py + 21, 3, 0, 7); g.fill();
      g.fillRect(px + 12, py + 23, 2, 5);
      g.fillStyle = '#556'; g.fillRect(px + 18, py + 19, 6, 1.5); g.fillRect(px + 18, py + 22, 5, 1.5); g.fillRect(px + 18, py + 25, 6, 1.5);
      break;
    case 'scheme':
      g.fillStyle = '#e8e4d6'; g.fillRect(px + 4, py + 12, 24, 17);
      g.strokeStyle = '#2c4f8a'; g.lineWidth = 1;
      g.strokeRect(px + 7, py + 15, 7, 5); g.strokeRect(px + 17, py + 15, 8, 9); g.beginPath(); g.moveTo(px + 14, py + 18); g.lineTo(px + 17, py + 18); g.stroke();
      g.fillStyle = '#c0392b'; g.beginPath(); g.moveTo(px + 9, py + 25); g.lineTo(px + 13, py + 23); g.lineTo(px + 13, py + 27); g.fill();
      break;
    case 'slogan':
      g.fillStyle = '#9b1f16'; g.fillRect(px, py + 12, T, 10);
      g.fillStyle = '#f0e6c8'; g.font = 'bold 7px monospace'; g.textAlign = 'center'; g.fillText('ГО-ДЕЛО', px + 16, py + 20);
      break;
    case 'mosaic': {
      const cols = ['#c0392b', '#e8c547', '#2c6e9a', '#e8e4d6', '#3b7a3b', '#8a3a8a'];
      const tr = mulberry32(s.x * 77 + s.y);
      for (let yy = 0; yy < 5; yy++) for (let xx = 0; xx < 7; xx++) { g.fillStyle = cols[Math.floor(tr() * cols.length)]; g.fillRect(px + 2 + xx * 4, py + 11 + yy * 4, 3.5, 3.5); }
      g.fillStyle = '#e8c547'; g.beginPath(); g.arc(px + 16, py + 20, 4, 0, 7); g.fill();
      break;
    }
    case 'panel':
      g.fillStyle = '#505a5e'; g.fillRect(px + 4, py + 10, 24, 20);
      g.fillStyle = '#e0dccf'; g.beginPath(); g.arc(px + 11, py + 17, 3.5, 0, 7); g.arc(px + 21, py + 17, 3.5, 0, 7); g.fill();
      g.fillStyle = '#c0392b'; g.fillRect(px + 9, py + 24, 3, 3); g.fillStyle = '#2f8a2f'; g.fillRect(px + 15, py + 24, 3, 3); g.fillStyle = '#e8c547'; g.fillRect(px + 21, py + 24, 3, 3);
      break;
    case 'hermo':
      g.fillStyle = '#4c5256'; g.fillRect(px + 1, py + 6, 30, 26);
      g.strokeStyle = '#2b2f31'; g.lineWidth = 2; g.strokeRect(px + 2, py + 7, 28, 24);
      g.strokeStyle = '#a33'; g.lineWidth = 2.5; g.beginPath(); g.arc(px + 16, py + 19, 7, 0, 7); g.stroke();
      g.beginPath(); g.moveTo(px + 9, py + 19); g.lineTo(px + 23, py + 19); g.moveTo(px + 16, py + 12); g.lineTo(px + 16, py + 26); g.stroke();
      break;
    case 'graffiti':
      g.fillStyle = s.color; g.font = 'bold 7px monospace'; g.textAlign = 'center';
      g.save(); g.translate(px + 16, py + 22); g.rotate(-0.12); g.fillText(s.text, 0, 0); g.restore();
      g.strokeStyle = s.color; g.lineWidth = 1; g.globalAlpha = 0.6; g.beginPath(); g.moveTo(px + 4, py + 26); g.quadraticCurveTo(px + 16, py + 30, px + 28, py + 25); g.stroke();
      break;
    case 'portrait':
      g.fillStyle = '#7a5a2a'; g.fillRect(px + 7, py + 9, 18, 22);
      g.fillStyle = '#c8b68a'; g.fillRect(px + 9, py + 11, 14, 18);
      g.fillStyle = '#3a2e22'; g.beginPath(); g.arc(px + 16, py + 18, 4, 0, 7); g.fill(); g.fillRect(px + 11, py + 23, 10, 6);
      break;
  }
  g.restore();
}

// ============================================================
//  Аудио (WebAudio, всё синтезируется)
// ============================================================
const AU = { ctx: null };
function audioInit() {
  if (AU.ctx) { if (AU.ctx.state === 'suspended') AU.ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  try {
    const c = AU.ctx = new AC();
    AU.master = c.createGain(); AU.master.gain.value = 0.7; AU.master.connect(c.destination);
    const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    AU.noise = buf;
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 160;
    const g = c.createGain(); g.gain.value = 0.14;
    src.connect(lp); lp.connect(g); g.connect(AU.master); src.start();
    const o = c.createOscillator(); o.frequency.value = 48;
    const og = c.createGain(); og.gain.value = 0.02; o.connect(og); og.connect(AU.master); o.start();
  } catch (e) { AU.ctx = null; }
}
function outNode(pan) {
  const c = AU.ctx;
  if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); p.connect(AU.master); return p; }
  return AU.master;
}
function tone(f, dur, o = {}) {
  if (!AU.ctx) return;
  const c = AU.ctx, t = c.currentTime + (o.delay || 0);
  const osc = c.createOscillator(), g = c.createGain();
  osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(f, t);
  if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f * o.slide), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(o.vol || 0.2, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g); g.connect(outNode(o.pan)); osc.start(t); osc.stop(t + dur + 0.05);
}
function noise(dur, o = {}) {
  if (!AU.ctx) return;
  const c = AU.ctx, t = c.currentTime + (o.delay || 0);
  const src = c.createBufferSource(); src.buffer = AU.noise;
  const f = c.createBiquadFilter(); f.type = o.type || 'bandpass'; f.frequency.value = o.freq || 1000; f.Q.value = o.q || 1;
  const g = c.createGain();
  g.gain.setValueAtTime(o.vol || 0.2, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(outNode(o.pan));
  src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
}
const SFX = {
  step(run, water) {
    if (water) { noise(0.18, { vol: run ? 0.16 : 0.09, freq: 700, q: 0.6 }); noise(0.1, { vol: 0.05, freq: 2500, delay: 0.04 }); }
    else noise(0.06, { vol: run ? 0.1 : 0.045, freq: run ? 520 : 380, q: 0.9 });
  },
  drip(pan) { const f = 1300 + Math.random() * 900; tone(f, 0.12, { vol: 0.05, slide: 0.45, pan }); tone(f * 0.8, 0.12, { vol: 0.015, slide: 0.45, pan: -pan, delay: 0.18 }); },
  pickup() { tone(660, 0.1, { type: 'triangle', vol: 0.14 }); tone(990, 0.18, { type: 'triangle', vol: 0.14, delay: 0.08 }); },
  battery() { tone(400, 0.08, { type: 'square', vol: 0.05 }); tone(800, 0.12, { type: 'square', vol: 0.05, delay: 0.07 }); },
  shutter() { noise(0.04, { vol: 0.35, freq: 4000, type: 'highpass' }); noise(0.07, { vol: 0.25, freq: 2200, delay: 0.08 }); tone(2400, 0.25, { vol: 0.03, slide: 1.4, delay: 0.1 }); },
  alert() { tone(180, 0.6, { type: 'sawtooth', vol: 0.12, slide: 2.2 }); tone(270, 0.6, { type: 'sawtooth', vol: 0.08, slide: 2.2 }); noise(0.3, { vol: 0.15, freq: 300 }); },
  huh() { tone(260, 0.3, { type: 'triangle', vol: 0.08, slide: 1.5 }); },
  squeak(pan) { tone(2600, 0.07, { type: 'square', vol: 0.025, slide: 1.3, pan }); tone(2900, 0.06, { type: 'square', vol: 0.02, slide: 1.2, pan, delay: 0.1 }); },
  heart() { tone(60, 0.13, { vol: 0.3, slide: 0.6 }); tone(52, 0.13, { vol: 0.2, slide: 0.6, delay: 0.17 }); },
  click() { tone(1500, 0.03, { type: 'square', vol: 0.04 }); },
  descend() { for (let k = 0; k < 5; k++) noise(0.08, { vol: 0.12, freq: 600 - k * 60, delay: k * 0.22 }); tone(110, 1.2, { vol: 0.08, slide: 0.5 }); },
  caught() { tone(400, 0.8, { type: 'sawtooth', vol: 0.12, slide: 0.3 }); noise(0.4, { vol: 0.25, freq: 200 }); },
  win() { [523, 659, 784, 1046].forEach((f, k) => tone(f, 0.3, { type: 'triangle', vol: 0.12, delay: k * 0.12 })); },
  empty() { tone(300, 0.3, { type: 'square', vol: 0.04, slide: 0.5 }); },
};

// ============================================================
//  Ввод
// ============================================================
const keys = {};
const input = { mx: 0, my: 0, mouseX: 0, mouseY: 0, mouseActive: false, joyX: 0, joyY: 0, run: false, touch: false };
window.addEventListener('keydown', e => {
  const k = e.code;
  keys[k] = true;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(k)) e.preventDefault();
  if (G.state === 'play') {
    if (k === 'KeyF') toggleLight();
    if (k === 'KeyE' || k === 'Space' || k === 'Enter') interact();
    if (k === 'KeyM') G.showMap = !G.showMap;
    if (k === 'Escape' || k === 'KeyP') pauseGame();
  } else if (G.state === 'pause' && (k === 'Escape' || k === 'KeyP')) resumeGame();
  else if (G.state === 'menu' && k === 'Enter') startRun();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; if (G.state === 'play') pauseGame(); });
window.addEventListener('mousemove', e => { input.mouseX = e.clientX; input.mouseY = e.clientY; if (!input.touch) input.mouseActive = true; });
window.addEventListener('mousedown', e => { if (e.target === cv && G.state === 'play' && !input.touch) interact(); });

// --- тач
const joy = { id: null, ox: 0, oy: 0 };
const joyBase = document.getElementById('joyBase'), joyKnob = document.getElementById('joyKnob');
function enableTouch() {
  if (input.touch) return;
  input.touch = true; input.mouseActive = false;
  document.body.classList.add('touch');
  if (G.state === 'play' || G.state === 'trans') document.getElementById('touch').classList.remove('hidden');
}
window.addEventListener('touchstart', e => {
  enableTouch();
  if (G.state !== 'play') return;
  for (const t of e.changedTouches) {
    if (t.target.tagName === 'BUTTON') continue;
    if (joy.id === null && t.clientX < innerWidth * 0.55) {
      joy.id = t.identifier; joy.ox = t.clientX; joy.oy = t.clientY;
      joyBase.style.left = (t.clientX - 65) + 'px'; joyBase.style.top = (t.clientY - 65) + 'px'; joyBase.style.bottom = 'auto';
      joyBase.style.opacity = 1;
      e.preventDefault();
    }
  }
}, { passive: false });
window.addEventListener('touchmove', e => {
  for (const t of e.changedTouches) {
    if (t.identifier !== joy.id) continue;
    let dx = t.clientX - joy.ox, dy = t.clientY - joy.oy;
    const l = Math.hypot(dx, dy), m = 50;
    if (l > m) { dx = dx / l * m; dy = dy / l * m; }
    input.joyX = dx / m; input.joyY = dy / m;
    joyKnob.style.left = (37 + dx) + 'px'; joyKnob.style.top = (37 + dy) + 'px';
    e.preventDefault();
  }
}, { passive: false });
function joyEnd(e) {
  for (const t of e.changedTouches) {
    if (t.identifier !== joy.id) continue;
    joy.id = null; input.joyX = 0; input.joyY = 0;
    joyKnob.style.left = '37px'; joyKnob.style.top = '37px'; joyBase.style.opacity = 0.6;
  }
}
window.addEventListener('touchend', joyEnd);
window.addEventListener('touchcancel', joyEnd);
function bindBtn(id, down, up) {
  const el = document.getElementById(id);
  el.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); audioInit(); down(el); }, { passive: false });
  el.addEventListener('touchend', e => { e.preventDefault(); if (up) up(el); }, { passive: false });
  el.addEventListener('mousedown', e => { e.stopPropagation(); down(el); });
  el.addEventListener('mouseup', () => { if (up) up(el); });
}
bindBtn('btnRun', el => { input.run = true; el.classList.add('on'); }, el => { input.run = false; el.classList.remove('on'); });
bindBtn('btnAct', () => interact());
bindBtn('btnLight', () => toggleLight());
bindBtn('btnMap', () => { G.showMap = !G.showMap; });
bindBtn('btnPause', () => pauseGame());

// ============================================================
//  Холст / камера
// ============================================================
const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
const lightCv = document.createElement('canvas');
const lctx = lightCv.getContext('2d');
let DPR = 1, VW = 0, VH = 0, ZOOM = 1, camX = 0, camY = 0;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 1.5);
  VW = innerWidth; VH = innerHeight;
  cv.width = lightCv.width = Math.floor(VW * DPR);
  cv.height = lightCv.height = Math.floor(VH * DPR);
  cv.style.width = VW + 'px'; cv.style.height = VH + 'px';
  const base = clamp(Math.min(VW / (20 * T), VH / (13 * T)), 0.75, 2.2);
  ZOOM = base * DPR;
}
window.addEventListener('resize', resize);
resize();

// ============================================================
//  UI
// ============================================================
const $ = id => document.getElementById(id);
const ui = {
  hud: $('hud'), level: $('hLevel'), batFill: $('batFill'), batTxt: $('batTxt'), score: $('hScore'), photo: $('hPhoto'),
  room: $('roomName'), prompt: $('prompt'), log: $('log'), touch: $('touch'),
};
function msg(text, cls = '') {
  const d = document.createElement('div');
  d.textContent = text; if (cls) d.className = cls;
  ui.log.appendChild(d);
  while (ui.log.children.length > 5) ui.log.removeChild(ui.log.firstChild);
  setTimeout(() => { d.style.transition = 'opacity .6s'; d.style.opacity = 0; setTimeout(() => d.remove(), 650); }, 4200);
}
function setText(el, t) { if (el.textContent !== t) el.textContent = t; }
function bestScore() { return +(localStorage.getItem('digger_best') || 0); }
function showBest() {
  const b = bestScore(), d = +(localStorage.getItem('digger_depth') || 0);
  $('best').textContent = b ? `Рекорд: ${b} респекта · глубже всего: ярус −${d}` : '';
}
showBest();

// ============================================================
//  Игровой цикл
// ============================================================
function newPlayer() {
  const sx = G.exit.x + 0.5, sy = G.exit.y + 0.5;
  let px = sx, py = sy;
  for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) {
    if (!isSolid(G.exit.x + dx, G.exit.y + dy)) { px = sx + dx; py = sy + dy; break; }
  }
  const prev = G.player;
  G.player = {
    x: px, y: py, a: Math.PI / 2, r: 0.28, light: true, battery: prev ? prev.battery : 100,
    stepT: 0, moving: false, running: false,
  };
}

function startRun() {
  audioInit();
  G.level = 1; G.lootScore = 0; G.photoScore = 0; G.photos = 0; G.bag = []; G.player = null;
  $('menu').classList.add('hidden'); $('end').classList.add('hidden');
  enterLevel(true);
}
function enterLevel(first) {
  genLevel(G.level);
  newPlayer();
  G.floats = []; G.rings = []; G.flash = 0; G.curZone = -2; G.chaseT = 0;
  ui.log.innerHTML = '';
  G.state = 'trans';
  const tr = $('trans');
  $('transText').innerHTML = first ? 'ЛЕЗЕШЬ В ВЕНТШАХТУ…<br><small>ЯРУС −1</small>' : `СПУСКАЕШЬСЯ НИЖЕ…<br><small>ЯРУС −${G.level}</small>`;
  tr.classList.remove('hidden'); tr.style.animation = 'none'; void tr.offsetWidth; tr.style.animation = '';
  ui.hud.classList.remove('hidden');
  if (input.touch) ui.touch.classList.remove('hidden');
  setTimeout(() => {
    if (G.state !== 'trans') return;
    G.state = 'play';
    if (first) {
      msg('Ты пролез в бомбарь. Ищи хабар и не попадись ЧОПу.', 'info');
      msg(input.touch ? 'Свети, фоткай кнопками справа.' : 'F — фонарь, Shift — бег, E — фото. Свети мышкой.', 'info');
    } else {
      msg(`Ярус −${G.level}. Охраны тут больше: ${G.guards.length} чел.`, 'bad');
    }
  }, 900);
  setTimeout(() => tr.classList.add('hidden'), 1800);
}

function toggleLight() {
  const p = G.player;
  if (!p.light && p.battery <= 0) { SFX.empty(); msg('Батарейки сели. Ищи новые!', 'bad'); return; }
  p.light = !p.light; SFX.click();
}

function nearestAction() {
  const p = G.player;
  const tx = Math.floor(p.x), ty = Math.floor(p.y);
  if (dist(p.x, p.y, G.exit.x + 0.5, G.exit.y + 0.5) < 0.95) return { kind: 'exit' };
  if (dist(p.x, p.y, G.down.x + 0.5, G.down.y + 0.5) < 0.95) return { kind: 'down' };
  let best = null, bd = 1.75;
  for (const s of G.spots) {
    if (s.taken) continue;
    const d = dist(p.x, p.y, s.px, s.py);
    if (d < bd && los(p.x, p.y, s.px, s.py - 0.05)) { bd = d; best = s; }
  }
  if (best) return { kind: 'photo', spot: best };
  return null;
}

function interact() {
  if (G.state !== 'play') return;
  const a = nearestAction();
  if (!a) return;
  if (a.kind === 'exit') endRun(false);
  else if (a.kind === 'down') {
    G.level++;
    SFX.descend();
    enterLevel(false);
  } else if (a.kind === 'photo') {
    const s = a.spot, p = G.player, info = SPOTS[s.kind];
    s.taken = true;
    const pts = Math.round(info.pts * levelMult());
    G.photoScore += pts; G.photos++;
    G.flash = 1; G.flashPoly = radialPoly(p.x, p.y, 7, 90, true);
    SFX.shutter();
    G.floats.push({ x: s.px, y: s.py - 0.6, text: `📷 +${pts}`, t: 0, col: '#e8c547' });
    msg(`Сфоткал: ${info.name} (+${pts})`, 'good');
    // вспышка видна охране
    for (const g of G.guards) {
      const d = dist(g.x, g.y, p.x, p.y);
      if (d < 12 && los(g.x, g.y, p.x, p.y)) { g.susp = Math.max(g.susp, 0.75); investigate(g, p.x, p.y, 4); }
    }
    makeNoise(p.x, p.y, 4);
  }
}
const levelMult = () => 1 + 0.35 * (G.level - 1);

function makeNoise(x, y, radius, visual = true) {
  if (visual) G.rings.push({ x, y, r: 0.2, max: radius, t: 0 });
  for (const g of G.guards) {
    if (g.state === 'chase') continue;
    if (dist(g.x, g.y, x, y) < radius) {
      g.susp = Math.max(g.susp, 0.35);
      investigate(g, x, y, 3.5);
    }
  }
}
function investigate(g, x, y, t) {
  if (g.state === 'chase') return;
  if (g.state !== 'investigate') SFX.huh();
  g.state = 'investigate'; g.tx = x; g.ty = y; g.timer = t;
  g.path = findPath(g.x, g.y, x, y);
}

function endRun(caught) {
  G.state = 'end';
  ui.hud.classList.add('hidden'); ui.prompt.classList.add('hidden'); ui.touch.classList.add('hidden');
  const total = caught ? G.photoScore : G.photoScore + G.lootScore;
  const prevBest = bestScore();
  if (total > prevBest) localStorage.setItem('digger_best', total);
  if (G.level > +(localStorage.getItem('digger_depth') || 0)) localStorage.setItem('digger_depth', G.level);
  if (caught) {
    SFX.caught();
    $('endTitle').textContent = 'ПОВЯЗАЛИ';
    $('endTitle').style.color = '#e04b3a';
    $('endText').textContent = pick([
      'ЧОП скрутил тебя прямо у гермодвери. Весь хабар изъят «до выяснения». Хорошо хоть фотки успели улететь в облако.',
      'Охранник Михалыч светит тебе в лицо: «Ну что, сталкер, приехали». Хабар конфискован, фотки остались.',
      'Тебя вывели наверх под руки и сдали участковому. Хабар — в каморку ЧОПа. Зато фотки — твои.',
    ]);
  } else {
    SFX.win();
    $('endTitle').textContent = 'ВЫЛАЗКА УДАЛАСЬ';
    $('endTitle').style.color = '#e8c547';
    $('endText').textContent = G.bag.length || G.photos
      ? 'Ты вылез через люк в рассветный туман. Рюкзак приятно оттягивает плечи. Пост в паблик диггеров обеспечен.'
      : 'Ты вылез ни с чем. Ну хоть воздухом бомбаря подышал.';
  }
  $('endStats').innerHTML =
    `Глубина: ярус −${G.level}<br>` +
    `Хабар: ${caught ? '<s>' + G.lootScore + '</s> 0' : G.lootScore} · Фото: ${G.photos} шт. (+${G.photoScore})<br>` +
    `<b>ИТОГО: ${total} респекта</b>` + (total > prevBest && total > 0 ? '<br>🏆 НОВЫЙ РЕКОРД!' : '');
  const counts = {};
  for (const b of G.bag) counts[b] = (counts[b] || 0) + 1;
  const list = Object.entries(counts).map(([k, v]) => `${k}${v > 1 ? ' ×' + v : ''}`);
  $('endBag').innerHTML = list.length ? (caught ? 'Изъято: ' : 'В рюкзаке: ') + list.join(' · ') : '';
  $('end').classList.remove('hidden');
}

function pauseGame() {
  if (G.state !== 'play') return;
  G.state = 'pause'; $('pause').classList.remove('hidden');
}
function resumeGame() {
  if (G.state !== 'pause') return;
  G.state = 'play'; $('pause').classList.add('hidden'); audioInit();
}

$('btnStart').addEventListener('click', startRun);
$('btnAgain').addEventListener('click', () => { $('end').classList.add('hidden'); startRun(); });
$('btnResume').addEventListener('click', resumeGame);
$('btnQuit').addEventListener('click', () => { $('pause').classList.add('hidden'); G.state = 'play'; endRun(false); });

// ------------------------------------------------------------
function update(dt) {
  G.time += dt;
  const p = G.player;

  // --- движение игрока
  let mx = 0, my = 0;
  if (keys.KeyW || keys.ArrowUp) my -= 1;
  if (keys.KeyS || keys.ArrowDown) my += 1;
  if (keys.KeyA || keys.ArrowLeft) mx -= 1;
  if (keys.KeyD || keys.ArrowRight) mx += 1;
  if (input.joyX || input.joyY) { mx = input.joyX; my = input.joyY; }
  let len = Math.hypot(mx, my);
  if (len > 1) { mx /= len; my /= len; len = 1; }
  const moving = len > 0.15;
  const running = moving && (keys.ShiftLeft || keys.ShiftRight || input.run);
  const inWater = tileAt(p.x, p.y) === WATER;
  let sp = (running ? 4.3 : 2.6) * (input.joyX || input.joyY ? Math.max(len, 0.5) : 1);
  if (inWater) sp *= 0.6;
  if (moving) {
    const nx = p.x + mx * sp * dt; if (canStand(nx, p.y, p.r)) p.x = nx;
    const ny = p.y + my * sp * dt; if (canStand(p.x, ny, p.r)) p.y = ny;
  }
  p.moving = moving; p.running = running;

  // --- направление фонаря
  if (input.mouseActive && !input.touch) {
    const wx = (input.mouseX * DPR / ZOOM + camX) / T, wy = (input.mouseY * DPR / ZOOM + camY) / T;
    p.a = Math.atan2(wy - p.y, wx - p.x);
  } else if (moving) {
    const target = Math.atan2(my, mx);
    p.a += clamp(angDiff(p.a, target), -9 * dt, 9 * dt);
  }

  // --- шаги и шум
  if (moving) {
    p.stepT -= dt * sp;
    if (p.stepT <= 0) {
      p.stepT = 1.15;
      SFX.step(running, inWater);
      const r = running ? (inWater ? 8 : 6.5) : (inWater ? 3 : 1.2);
      makeNoise(p.x, p.y, r, running || inWater);
    }
  }

  // --- батарейка
  if (p.light) {
    p.battery -= dt * (0.6 + G.level * 0.07);
    if (p.battery <= 0) { p.battery = 0; p.light = false; SFX.empty(); msg('Фонарь погас! Нужны батарейки.', 'bad'); }
  }

  // --- подбор предметов
  for (let i = G.items.length - 1; i >= 0; i--) {
    const it = G.items[i];
    if (dist(it.x, it.y, p.x, p.y) < 0.6) {
      G.items.splice(i, 1);
      if (it.type === 'battery') {
        p.battery = Math.min(100, p.battery + 45); SFX.battery();
        msg('Батарейки «Крона» — фонарь +45%', 'good');
        G.floats.push({ x: it.x, y: it.y - 0.4, text: '🔋 +45%', t: 0, col: '#9fd36a' });
      } else {
        const L = LOOT[it.type], pts = Math.round(L.pts * levelMult());
        G.lootScore += pts; G.bag.push(L.name); SFX.pickup();
        msg(`Хабар: ${L.name} (+${pts})`, 'good');
        G.floats.push({ x: it.x, y: it.y - 0.4, text: `+${pts}`, t: 0, col: '#e8c547' });
      }
    }
  }

  // --- охрана / крысы
  let anyChase = false;
  for (const g of G.guards) { updateGuard(g, dt); if (g.state === 'chase') anyChase = true; if (G.state !== 'play') return; }
  for (const r of G.rats) updateRat(r, dt);

  // --- эффекты
  G.flash = Math.max(0, G.flash - dt * 3);
  for (const f of G.floats) f.t += dt;
  G.floats = G.floats.filter(f => f.t < 1.4);
  for (const r of G.rings) { r.t += dt; r.r = r.max * Math.min(1, r.t / 0.5); }
  G.rings = G.rings.filter(r => r.t < 0.7);
  G.shake = Math.max(0, G.shake - dt * 2);
  for (const L of G.lamps) {
    if (L.broken) { L.t -= dt; if (L.t <= 0) { L.on = !L.on; L.t = L.on ? 0.2 + Math.random() * 2.5 : 0.03 + Math.random() * 0.25; } }
  }

  // --- сердцебиение во время погони
  if (anyChase) {
    G.heartT -= dt;
    if (G.heartT <= 0) { SFX.heart(); G.heartT = 0.55; }
  }
  G.chaseT = anyChase ? Math.min(1, G.chaseT + dt * 2) : Math.max(0, G.chaseT - dt);

  // --- капли
  G.dripT -= dt;
  if (G.dripT <= 0) { SFX.drip(Math.random() * 1.6 - 0.8); G.dripT = 1.5 + Math.random() * 5; }

  // --- комната
  const z = G.zone[Math.floor(p.y) * MW + Math.floor(p.x)];
  if (z !== G.curZone) {
    G.curZone = z;
    setText(ui.room, z >= 0 ? '▸ ' + ROOM_TYPES[G.rooms[z].type].name : '▸ Коридор');
  }

  // --- подсказка
  const a = nearestAction();
  const key = input.touch ? '📷' : 'E';
  let pt = '';
  if (a) {
    if (a.kind === 'exit') pt = `${key} — вылезти наружу (закончить вылазку)`;
    else if (a.kind === 'down') pt = `${key} — спуститься на ярус −${G.level + 1}`;
    else pt = `${key} — сфоткать: ${SPOTS[a.spot.kind].name}`;
  }
  if (pt) { setText(ui.prompt, pt); ui.prompt.classList.remove('hidden'); } else ui.prompt.classList.add('hidden');

  // --- HUD
  setText(ui.level, `ЯРУС −${G.level}`);
  ui.batFill.style.width = p.battery.toFixed(1) + '%';
  ui.batFill.style.background = p.battery < 20 ? '#e04b3a' : p.battery < 45 ? '#e8c547' : '#9fd36a';
  setText(ui.batTxt, Math.ceil(p.battery) + '%');
  setText(ui.score, `Хабар: ${G.lootScore} · ${G.bag.length} шт.`);
  setText(ui.photo, `Фото: ${G.photos} (+${G.photoScore})`);
  if (input.touch) $('btnLight').classList.toggle('on', p.light);
}

function canStand(x, y, r) {
  return !isSolid(Math.floor(x - r), Math.floor(y - r)) && !isSolid(Math.floor(x + r), Math.floor(y - r)) &&
    !isSolid(Math.floor(x - r), Math.floor(y + r)) && !isSolid(Math.floor(x + r), Math.floor(y + r));
}

function updateGuard(g, dt) {
  const p = G.player;
  const dx = p.x - g.x, dy = p.y - g.y, d = Math.hypot(dx, dy);
  const angTo = Math.atan2(dy, dx);
  const range = p.light ? 8.5 : 4;
  let sees = false;
  if (d < 14) {
    const inCone = Math.abs(angDiff(g.a, angTo)) < 0.62;
    let cond = d < 1.2 || (inCone && d < range) || (p.light && d < 2.8);
    // светишь охраннику в лицо — он тебя точно видит
    if (!cond && p.light && d < 9 && Math.abs(angDiff(p.a, angTo + Math.PI)) < 0.5) cond = true;
    if (cond) sees = los(g.x, g.y, p.x, p.y);
  }
  g.sees = sees;
  if (sees) {
    const rate = d < 2 ? 3 : 0.8 + 2.2 * (1 - Math.min(d, range) / range);
    g.susp = Math.min(1.2, g.susp + rate * dt * (p.running ? 1.4 : 1));
    g.lastX = p.x; g.lastY = p.y;
  } else if (g.state !== 'chase') g.susp = Math.max(0, g.susp - dt * 0.18);

  if (sees && g.susp >= 1 && g.state !== 'chase') {
    g.state = 'chase'; g.repath = 0; g.lost = 0;
    SFX.alert(); G.shake = 0.4;
    msg(pick(['«Стоять! Охрана!»', '«Эй, ты! А ну стой!»', '«Опять диггеры, мать их!»', '«Стой, стрелять буду!» (не будет)']), 'bad');
  } else if (sees && g.state === 'patrol' && g.susp > 0.3) {
    investigate(g, p.x, p.y, 3);
  } else if (sees && g.state === 'investigate') {
    g.retarget = (g.retarget || 0) - dt;
    if (g.retarget <= 0) { g.retarget = 0.6; g.tx = p.x; g.ty = p.y; g.timer = 3; g.path = findPath(g.x, g.y, p.x, p.y); }
  }

  let speed = 1.45 + G.level * 0.07, targetAng = null;
  if (g.state === 'chase') {
    speed = 3.25 + G.level * 0.09;
    g.repath -= dt;
    if (sees) {
      g.lost = 0;
      if (g.repath <= 0) { g.path = findPath(g.x, g.y, p.x, p.y); g.repath = 0.3; }
      targetAng = angTo;
      if (!g.path.length) { g.x += Math.cos(angTo) * speed * dt; g.y += Math.sin(angTo) * speed * dt; }
    } else {
      g.lost += dt;
      if (g.repath <= 0) { g.path = findPath(g.x, g.y, g.lastX, g.lastY); g.repath = 1; }
      if ((!g.path.length && g.lost > 0.5) || g.lost > 7) {
        g.state = 'investigate'; g.timer = 4; g.susp = 0.7; g.path = []; g.lookBase = g.a; g.tx = g.x; g.ty = g.y;
        msg('Охранник потерял тебя из виду…', 'info');
      }
    }
  } else if (g.state === 'investigate') {
    speed = 2.1 + G.level * 0.07;
    if (!g.path.length) {
      if (g.timer === undefined) g.timer = 3;
      g.timer -= dt;
      if (g.timer <= 0) { g.state = 'patrol'; g.wait = 1; g.susp = Math.min(g.susp, 0.25); }
    }
  } else { // patrol
    if (!g.path.length) {
      g.wait -= dt;
      if (g.wait <= 0) {
        const r = pick(G.rooms);
        g.path = findPath(g.x, g.y, r.cx + ri(-1, 1) + 0.5, r.cy + ri(-1, 1) + 0.5);
        if (!g.path.length) g.path = findPath(g.x, g.y, r.cx + 0.5, r.cy + 0.5);
        g.wait = 1 + Math.random() * 2.5;
        g.lookBase = g.a;
      }
    }
  }

  // --- движение по пути
  let moved = false;
  if (g.path.length) {
    const [tx, ty] = g.path[0];
    const cx = tx + 0.5, cy = ty + 0.5;
    const ddx = cx - g.x, ddy = cy - g.y, dd = Math.hypot(ddx, ddy);
    const step = speed * dt * (tileAt(g.x, g.y) === WATER ? 0.7 : 1);
    if (dd <= step) { g.x = cx; g.y = cy; g.path.shift(); }
    else { g.x += ddx / dd * step; g.y += ddy / dd * step; }
    if (targetAng === null && dd > 0.01) targetAng = Math.atan2(ddy, ddx);
    moved = true;
    g.lookBase = targetAng;
    g.stepT -= dt * speed;
    if (g.stepT <= 0) {
      g.stepT = 1.2;
      if (d < 9) { const v = (1 - d / 9) * (g.state === 'chase' ? 0.14 : 0.07); noise(0.07, { vol: Math.max(0.005, v), freq: 260, q: 0.9, pan: clamp(dx === 0 ? 0 : -dx / 8, -1, 1) }); }
    }
  }
  if (targetAng === null) targetAng = g.lookBase + Math.sin(G.time * 1.3 + g.seed) * 1.1;
  const rotSpeed = g.state === 'chase' ? 9 : moved ? 5 : 2.2;
  g.a += clamp(angDiff(g.a, targetAng), -rotSpeed * dt, rotSpeed * dt);

  // --- поймал
  if (d < 0.62) endRun(true);
}

function updateRat(r, dt) {
  const p = G.player;
  const d = dist(r.x, r.y, p.x, p.y);
  r.cd -= dt;
  if (d < 2.4) {
    r.a = Math.atan2(r.y - p.y, r.x - p.x) + (Math.random() - 0.5) * 0.8;
    r.sp = 3.6;
    if (r.cd <= 0) {
      r.cd = 5; SFX.squeak(clamp((r.x - p.x) / 4, -1, 1));
      makeNoise(r.x, r.y, 5);
      if (Math.random() < 0.3) msg('Пи-пи! Крыса разбежалась — шумно…', 'info');
    }
  } else {
    r.t -= dt;
    if (r.t <= 0) { r.t = 0.5 + Math.random() * 2; r.sp = Math.random() < 0.4 ? 0 : 1 + Math.random(); r.a = Math.random() * 6.28; }
  }
  if (r.sp > 0) {
    const nx = r.x + Math.cos(r.a) * r.sp * dt, ny = r.y + Math.sin(r.a) * r.sp * dt;
    if (canStand(nx, r.y, 0.12)) r.x = nx; else r.a = Math.PI - r.a;
    if (canStand(r.x, ny, 0.12)) r.y = ny; else r.a = -r.a;
  }
}

// ============================================================
//  Отрисовка
// ============================================================
function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, cv.width, cv.height);
  if (!G.map || !G.player) return;
  const p = G.player;
  const viewW = cv.width / ZOOM, viewH = cv.height / ZOOM;
  const sh = G.shake > 0 ? (Math.random() - 0.5) * G.shake * 14 : 0;
  camX = p.x * T - viewW / 2 + sh; camY = p.y * T - viewH / 2 + sh;
  const wt = [ZOOM, 0, 0, ZOOM, -camX * ZOOM, -camY * ZOOM];
  ctx.setTransform(...wt);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(G.staticCv, 0, 0);

  const x0 = Math.max(0, Math.floor(camX / T) - 1), x1 = Math.min(MW - 1, Math.ceil((camX + viewW) / T) + 1);
  const y0 = Math.max(0, Math.floor(camY / T) - 1), y1 = Math.min(MH - 1, Math.ceil((camY + viewH) / T) + 1);

  // вода — рябь
  ctx.strokeStyle = 'rgba(160,210,210,.13)'; ctx.lineWidth = 1;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (G.map[y * MW + x] !== WATER) continue;
    const ph = G.time * 1.5 + x * 1.7 + y * 2.3;
    ctx.beginPath();
    ctx.moveTo(x * T + 4, y * T + 10 + Math.sin(ph) * 2); ctx.lineTo(x * T + 16, y * T + 10 + Math.sin(ph + 1) * 2);
    ctx.moveTo(x * T + 14, y * T + 22 + Math.sin(ph + 2) * 2); ctx.lineTo(x * T + 28, y * T + 22 + Math.sin(ph + 3) * 2);
    ctx.stroke();
  }

  // лампы-плафоны
  for (const L of G.lamps) {
    if (L.moon) continue;
    ctx.fillStyle = '#222'; ctx.fillRect(L.wx * T + 10, L.wy * T + 20, 12, 8);
    ctx.fillStyle = L.on ? `rgb(${L.rgb})` : '#3a2a2a'; ctx.fillRect(L.wx * T + 12, L.wy * T + 22, 8, 5);
  }

  // предметы
  for (const it of G.items) drawItem(it);
  // крысы
  for (const r of G.rats) drawRat(r);
  // охрана
  for (const g of G.guards) drawGuard(g);
  // игрок
  drawPlayer(p);

  // ---------- свет ----------
  renderLight(wt);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(lightCv, 0, 0);

  // цветные подсветки
  ctx.setTransform(...wt);
  ctx.globalCompositeOperation = 'lighter';
  for (const L of G.lamps) {
    if (!L.on && !L.moon) continue;
    if (Math.abs(L.x - p.x) > 25 || Math.abs(L.y - p.y) > 18) continue;
    const gr = ctx.createRadialGradient(L.x * T, L.y * T, 0, L.x * T, L.y * T, L.R * T);
    gr.addColorStop(0, `rgba(${L.rgb},.22)`); gr.addColorStop(1, `rgba(${L.rgb},0)`);
    ctx.fillStyle = gr; polyPath(ctx, L.poly); ctx.fill();
  }
  if (p.light && G.lastCone) {
    const gr = ctx.createRadialGradient(p.x * T, p.y * T, 0, p.x * T, p.y * T, 9 * T);
    gr.addColorStop(0, 'rgba(255,230,170,.10)'); gr.addColorStop(1, 'rgba(255,230,170,0)');
    ctx.fillStyle = gr; polyPath(ctx, G.lastCone); ctx.fill();
  }
  for (const g of G.guards) {
    if (!g.cone) continue;
    const gr = ctx.createRadialGradient(g.x * T, g.y * T, 0, g.x * T, g.y * T, 7 * T);
    const c = g.state === 'chase' ? '255,120,90' : '255,240,180';
    gr.addColorStop(0, `rgba(${c},.16)`); gr.addColorStop(1, `rgba(${c},0)`);
    ctx.fillStyle = gr; polyPath(ctx, g.cone); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';

  // поверх темноты: кольца шума, всплывающий текст, значки
  for (const r of G.rings) {
    ctx.strokeStyle = `rgba(255,255,255,${0.25 * (1 - r.t / 0.7)})`; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(r.x * T, r.y * T, r.r * T, 0, 7); ctx.stroke();
  }
  for (const s of G.spots) {
    if (s.taken || !G.explored[s.y * MW + s.x]) continue;
    const d = dist(p.x, p.y, s.px, s.py);
    if (d > 4.5) continue;
    ctx.globalAlpha = clamp(1.2 - d / 4.5, 0, 1) * (0.6 + 0.4 * Math.sin(G.time * 4));
    ctx.font = '14px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('📷', s.px * T, s.y * T + 6);
    ctx.globalAlpha = 1;
  }
  for (const g of G.guards) {
    if (dist(g.x, g.y, p.x, p.y) > 13) continue;
    let ch = null, col = '#e8c547';
    if (g.state === 'chase') { ch = '!'; col = '#ff4a3a'; }
    else if (g.state === 'investigate' || g.susp > 0.3) ch = '?';
    if (g.susp > 0.05 && g.state !== 'chase') { // шкала подозрения
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(g.x * T - 12, g.y * T - 26, 24, 4);
      ctx.fillStyle = g.susp > 0.7 ? '#ff7a3a' : '#e8c547'; ctx.fillRect(g.x * T - 12, g.y * T - 26, 24 * Math.min(1, g.susp), 4);
    }
    if (ch) {
      ctx.font = 'bold 20px monospace'; ctx.textAlign = 'center'; ctx.fillStyle = '#000';
      ctx.fillText(ch, g.x * T + 1, g.y * T - 29); ctx.fillStyle = col; ctx.fillText(ch, g.x * T, g.y * T - 30);
    }
  }
  for (const f of G.floats) {
    ctx.globalAlpha = 1 - f.t / 1.4;
    ctx.font = 'bold 14px monospace'; ctx.textAlign = 'center';
    ctx.fillStyle = '#000'; ctx.fillText(f.text, f.x * T + 1, (f.y - f.t * 0.8) * T + 1);
    ctx.fillStyle = f.col; ctx.fillText(f.text, f.x * T, (f.y - f.t * 0.8) * T);
    ctx.globalAlpha = 1;
  }

  // ---------- экранные эффекты ----------
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const W = cv.width, H = cv.height;
  const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.6)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  if (G.chaseT > 0) {
    const a = G.chaseT * (0.25 + 0.15 * Math.sin(G.time * 11));
    const rg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.7);
    rg.addColorStop(0, 'rgba(180,0,0,0)'); rg.addColorStop(1, `rgba(180,0,0,${a})`);
    ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
  }
  // зерно
  ctx.fillStyle = 'rgba(255,255,255,.025)';
  for (let k = 0; k < 60; k++) ctx.fillRect(Math.random() * W, Math.random() * H, 2 * DPR, 2 * DPR);

  if (G.showMap) drawMinimap();
}

function polyPath(c, pts) {
  c.beginPath();
  c.moveTo(pts[0][0] * T, pts[0][1] * T);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0] * T, pts[i][1] * T);
  c.closePath();
}
function cut(c, pts, ox, oy, R, inten) {
  const gr = c.createRadialGradient(ox * T, oy * T, 0, ox * T, oy * T, R * T);
  gr.addColorStop(0, `rgba(0,0,0,${inten})`);
  gr.addColorStop(0.5, `rgba(0,0,0,${inten * 0.8})`);
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = gr; polyPath(c, pts); c.fill();
}
function renderLight(wt) {
  const c = lctx, p = G.player;
  c.globalCompositeOperation = 'source-over';
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.fillStyle = '#000'; c.fillRect(0, 0, lightCv.width, lightCv.height);
  c.globalCompositeOperation = 'destination-out';
  c.setTransform(...wt);

  // окружающий полумрак вокруг игрока
  const amb = radialPoly(p.x, p.y, 2.2, 40, true);
  cut(c, amb, p.x, p.y, 2.2, 0.62);

  // фонарь
  G.lastCone = null;
  if (p.light) {
    let flick = 1;
    if (p.battery < 15) flick = Math.random() < 0.08 ? 0.25 : 0.75 + Math.random() * 0.25;
    else if (p.battery < 30) flick = 0.85 + Math.random() * 0.1;
    const R = 4 + 5.5 * Math.min(1, 0.45 + p.battery / 100);
    const wide = conePoly(p.x, p.y, p.a, 0.62, R, 70, true);
    const narrow = conePoly(p.x, p.y, p.a, 0.34, R * 1.08, 40, false);
    cut(c, wide, p.x, p.y, R + EXT, 0.75 * flick);
    cut(c, narrow, p.x, p.y, R * 1.08 + EXT, 0.7 * flick);
    G.lastCone = wide;
  }
  // лампы
  for (const L of G.lamps) {
    if (!L.on && !L.moon) continue;
    if (Math.abs(L.x - p.x) > 25 || Math.abs(L.y - p.y) > 18) continue;
    const f = L.moon ? 1 : 0.9 + 0.1 * Math.sin(G.time * 13 + L.x);
    cut(c, L.poly, L.x, L.y, L.R, L.base * f);
  }
  // фонари охраны
  for (const g of G.guards) {
    g.cone = null;
    if (Math.abs(g.x - p.x) > 25 || Math.abs(g.y - p.y) > 18) continue;
    g.cone = conePoly(g.x, g.y, g.a, 0.55, 7, 36, false);
    cut(c, g.cone, g.x, g.y, 7 + EXT, 0.7);
    const gg = c.createRadialGradient(g.x * T, g.y * T, 0, g.x * T, g.y * T, 0.9 * T);
    gg.addColorStop(0, 'rgba(0,0,0,.8)'); gg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = gg; c.beginPath(); c.arc(g.x * T, g.y * T, 0.9 * T, 0, 7); c.fill();
  }
  // вспышка фотоаппарата
  if (G.flash > 0 && G.flashPoly) cut(c, G.flashPoly, p.x, p.y, 7.5, G.flash);
}

function drawItem(it) {
  const x = it.x * T, y = it.y * T + Math.sin(G.time * 2 + it.ph) * 1.5;
  ctx.save(); ctx.translate(x, y);
  // тень
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(0, 8, 9, 3, 0, 0, 7); ctx.fill();
  switch (it.type) {
    case 'battery':
      ctx.fillStyle = '#222'; ctx.fillRect(-5, -8, 10, 15);
      ctx.fillStyle = '#e8c547'; ctx.fillRect(-5, -8, 10, 7);
      ctx.fillStyle = '#bbb'; ctx.fillRect(-2, -10, 4, 2);
      ctx.fillStyle = '#000'; ctx.font = 'bold 7px monospace'; ctx.textAlign = 'center'; ctx.fillText('+', 0, -2);
      break;
    case 'gasmask':
      ctx.fillStyle = '#5b6b55'; ctx.beginPath(); ctx.ellipse(0, -1, 9, 10, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#9ec2c8'; ctx.beginPath(); ctx.arc(-4, -4, 3, 0, 7); ctx.arc(4, -4, 3, 0, 7); ctx.fill();
      ctx.strokeStyle = '#333'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(-4, -4, 3, 0, 7); ctx.moveTo(7, -4); ctx.arc(4, -4, 3, 0, 7); ctx.stroke();
      ctx.fillStyle = '#3a3f37'; ctx.beginPath(); ctx.arc(0, 5, 3.5, 0, 7); ctx.fill();
      ctx.fillStyle = '#2b5a3a'; ctx.fillRect(-3, 8, 6, 4);
      break;
    case 'dosimeter':
      ctx.fillStyle = '#7d8a5a'; ctx.fillRect(-9, -7, 18, 14);
      ctx.fillStyle = '#e8e4d0'; ctx.beginPath(); ctx.arc(-2, -1, 4.5, Math.PI, 0); ctx.fill();
      ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-2, -1); ctx.lineTo(1, -4.5); ctx.stroke();
      ctx.fillStyle = '#222'; ctx.fillRect(5, -4, 2.5, 2.5); ctx.fillRect(5, 1, 2.5, 2.5);
      break;
    case 'sign':
      ctx.fillStyle = '#1f5a2e'; ctx.fillRect(-11, -7, 22, 14);
      ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1; ctx.strokeRect(-10, -6, 20, 12);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 6px monospace'; ctx.textAlign = 'center'; ctx.fillText('УБЕЖ.', 0, 2);
      break;
    case 'journal':
      ctx.fillStyle = '#6b3a22'; ctx.fillRect(-7, -9, 14, 17);
      ctx.fillStyle = '#d8d0b0'; ctx.fillRect(-5, -6, 10, 4);
      ctx.fillStyle = '#3a1f12'; ctx.fillRect(-7, -9, 2, 17);
      break;
    case 'filter':
      ctx.fillStyle = '#2f4a35'; ctx.fillRect(-6, -9, 12, 16);
      ctx.fillStyle = '#3d5c44'; ctx.beginPath(); ctx.ellipse(0, -9, 6, 2.5, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#888'; ctx.fillRect(-2, -12, 4, 3);
      break;
    case 'aid':
      ctx.fillStyle = '#e07a1f'; ctx.fillRect(-8, -7, 16, 13);
      ctx.fillStyle = '#fff'; ctx.fillRect(-1.5, -5, 3, 9); ctx.fillRect(-4.5, -2, 9, 3);
      break;
    case 'radio':
      ctx.fillStyle = '#4f5a3a'; ctx.fillRect(-8, -6, 16, 13);
      ctx.fillStyle = '#222'; ctx.fillRect(-6, -3, 6, 6);
      ctx.fillStyle = '#ddd'; ctx.beginPath(); ctx.arc(4, 0, 2, 0, 7); ctx.fill();
      ctx.strokeStyle = '#111'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(6, -6); ctx.lineTo(9, -14); ctx.stroke();
      break;
    case 'ozk':
      ctx.fillStyle = '#4b6b3a'; ctx.beginPath(); ctx.moveTo(-6, -9); ctx.lineTo(6, -9); ctx.lineTo(10, -2); ctx.lineTo(6, 0); ctx.lineTo(6, 9); ctx.lineTo(-6, 9); ctx.lineTo(-6, 0); ctx.lineTo(-10, -2); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#2e4424'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(0, 9); ctx.stroke();
      break;
  }
  // блик
  const s = (Math.sin(G.time * 3 + it.ph) + 1) / 2;
  if (s > 0.85) {
    ctx.fillStyle = `rgba(255,255,255,${(s - 0.85) * 6})`;
    ctx.beginPath(); ctx.moveTo(8, -12); ctx.lineTo(9, -9); ctx.lineTo(12, -8); ctx.lineTo(9, -7); ctx.lineTo(8, -4); ctx.lineTo(7, -7); ctx.lineTo(4, -8); ctx.lineTo(7, -9); ctx.fill();
  }
  ctx.restore();
}

function drawRat(r) {
  ctx.save(); ctx.translate(r.x * T, r.y * T); ctx.rotate(r.a);
  ctx.strokeStyle = '#6b5a55'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(-5, 0); ctx.quadraticCurveTo(-10, Math.sin(G.time * 12) * 3, -14, 0); ctx.stroke();
  ctx.fillStyle = '#4a403c'; ctx.beginPath(); ctx.ellipse(0, 0, 6, 3.5, 0, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(5, 0, 3, 2.2, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#d33'; ctx.fillRect(6.5, -1.5, 1, 1); ctx.fillRect(6.5, 0.5, 1, 1);
  ctx.restore();
}

function drawPerson(x, y, a, cols, walkPh) {
  ctx.save(); ctx.translate(x * T, y * T);
  ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.beginPath(); ctx.ellipse(2, 3, 11, 9, 0, 0, 7); ctx.fill();
  ctx.rotate(a);
  // ноги
  const sw = Math.sin(walkPh) * 4;
  ctx.fillStyle = cols.legs;
  ctx.fillRect(-3 + sw, -6, 7, 4); ctx.fillRect(-3 - sw, 2, 7, 4);
  // плечи
  ctx.fillStyle = cols.body; ctx.beginPath(); ctx.ellipse(0, 0, 7, 10, 0, 0, 7); ctx.fill();
  if (cols.pack) { ctx.fillStyle = cols.pack; ctx.fillRect(-10, -6, 6, 12); }
  // руки с фонарём
  ctx.fillStyle = cols.body; ctx.fillRect(2, 4, 8, 3.5);
  ctx.fillStyle = '#222'; ctx.fillRect(9, 4, 5, 3.5);
  ctx.fillStyle = cols.lamp; ctx.fillRect(13.5, 4.2, 1.5, 3);
  // голова
  ctx.fillStyle = cols.head; ctx.beginPath(); ctx.arc(1, 0, 5.5, 0, 7); ctx.fill();
  if (cols.cap) { ctx.fillStyle = cols.cap; ctx.fillRect(4, -4, 4, 8); }
  if (cols.helmetLamp) { ctx.fillStyle = cols.helmetLamp; ctx.fillRect(5, -1.5, 2.5, 3); }
  ctx.restore();
}
function drawPlayer(p) {
  const ph = p.moving ? G.time * (p.running ? 16 : 10) : 0;
  drawPerson(p.x, p.y, p.a, { legs: '#2a2a2a', body: '#5a5a3c', head: '#c8a020', pack: '#6b3a22', lamp: p.light ? '#fff6c0' : '#444', helmetLamp: p.light ? '#fff6c0' : '#555' }, ph);
}
function drawGuard(g) {
  const ph = g.path.length ? G.time * (g.state === 'chase' ? 15 : 8) : 0;
  drawPerson(g.x, g.y, g.a, { legs: '#111', body: '#1f2a3a', head: '#151515', cap: '#0d0d0d', lamp: '#fff6c0' }, ph);
}

const mini = { cv: null, g: null, t: 0, level: null };
function drawMinimap() {
  const s = Math.max(2, Math.floor(Math.min(VW, VH) / 160)) * DPR;
  const W = MW * s, H = MH * s;
  const ox = cv.width - W - 12 * DPR, oy = input.touch ? 66 * DPR : 12 * DPR;
  ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(ox - 4, oy - 4, W + 8, H + 8);
  ctx.strokeStyle = 'rgba(232,197,71,.4)'; ctx.lineWidth = 1; ctx.strokeRect(ox - 4.5, oy - 4.5, W + 9, H + 9);
  // карта перерисовывается в кэш раз в несколько кадров
  if (!mini.cv) { mini.cv = document.createElement('canvas'); mini.cv.width = MW * 3; mini.cv.height = MH * 3; mini.g = mini.cv.getContext('2d'); }
  if (--mini.t <= 0 || mini.level !== G.staticCv) {
    mini.t = 8; mini.level = G.staticCv;
    const g = mini.g; g.clearRect(0, 0, MW * 3, MH * 3);
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const i = y * MW + x;
      if (!G.explored[i]) continue;
      const t = G.map[i];
      g.fillStyle = t === WALL ? '#6a665a' : t === WATER ? '#2b5560' : t === EXIT ? '#6cf' : t === DOWN ? '#fc5' : t === PROP ? '#3e3a32' : '#2c2a25';
      g.fillRect(x * 3, y * 3, 3, 3);
    }
  }
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(mini.cv, ox, oy, W, H);
  const p = G.player;
  ctx.fillStyle = '#e8c547';
  ctx.beginPath(); ctx.arc(ox + p.x * s, oy + p.y * s, s * 1.2, 0, 7); ctx.fill();
  ctx.strokeStyle = '#e8c547'; ctx.beginPath(); ctx.moveTo(ox + p.x * s, oy + p.y * s); ctx.lineTo(ox + (p.x + Math.cos(p.a) * 3) * s, oy + (p.y + Math.sin(p.a) * 3) * s); ctx.stroke();
  // охранник в погоне виден на карте
  for (const g of G.guards) if (g.state === 'chase' || g.sees) { ctx.fillStyle = '#ff4a3a'; ctx.fillRect(ox + g.x * s - s, oy + g.y * s - s, s * 2, s * 2); }
}

// ------------------------------------------------------------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (G.state === 'play') update(dt);
  else if (G.state === 'trans' || G.state === 'pause' || G.state === 'end') G.time += dt * 0.2;
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// для тестов в node
if (typeof module !== 'undefined') module.exports = { G, genLevel, findPath, bfsDist, castRay, update, updateGuard, canStand, newPlayer, render, interact, keys, input };
