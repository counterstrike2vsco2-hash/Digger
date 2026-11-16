// Генерация бомбаря, поиск пути, лучи по сетке. Перенесено из 2D-версии.
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
  return t === WALL || t === PROP || (t === DOWN && G.downSolid);
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
  G.downSolid = false;
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
  G.downSolid = true;
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
function los(ax, ay, bx, by) {
  const d = dist(ax, ay, bx, by);
  return castRay(ax, ay, Math.atan2(by - ay, bx - ax), d, false) >= d - 0.05;
}

export {
  MW, MH, WALL, FLOOR, WATER, DOOR, EXIT, DOWN, PROP, mulberry32, ri, pick, clamp, dist, angDiff, shuffle,
  ROOM_TYPES, LOOT, SPOTS, GRAFFITI_TEXT, G, isSolid, blocksLight, tileAt, genLevel, bfsDist, findPath, castRay, los,
};
export function setRnd(f) { rnd = f; }
export function rand() { return rnd(); }
