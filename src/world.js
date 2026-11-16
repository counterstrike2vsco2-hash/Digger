// Построение 3D-геометрии яруса из сетки.
import * as THREE from 'three';
import { MW, MH, WALL, FLOOR, WATER, DOOR, EXIT, DOWN, PROP, G, ROOM_TYPES, mulberry32 } from './level.js';
import { floorMaterial, wallMaterial, ceilingMaterial, waterMaterial, M, faceMaterial, spotTexture, labelTexture, beamTexture } from './textures.js';

export const S = 2;      // размер тайла в метрах
export const WH = 3;     // высота потолка

// ---------- сборщик склеенной геометрии ----------
class GeoBuilder {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.idx = []; }
  quad(p, n, uv) {
    // гарантируем правильный обход относительно нормали
    const ax = p[1][0] - p[0][0], ay = p[1][1] - p[0][1], az = p[1][2] - p[0][2];
    const bx = p[2][0] - p[0][0], by = p[2][1] - p[0][1], bz = p[2][2] - p[0][2];
    const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
    if (cx * n[0] + cy * n[1] + cz * n[2] < 0) { p = [p[0], p[3], p[2], p[1]]; uv = [uv[0], uv[3], uv[2], uv[1]]; }
    const b = this.pos.length / 3;
    for (let k = 0; k < 4; k++) { this.pos.push(...p[k]); this.nor.push(...n); this.uv.push(...uv[k]); }
    this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  box(x0, y0, z0, x1, y1, z1, uvScale = 1) {
    const s = uvScale;
    this.quad([[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], [0, 1, 0], [[x0 * s, z0 * s], [x0 * s, z1 * s], [x1 * s, z1 * s], [x1 * s, z0 * s]]);
    this.quad([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0], [[x0 * s, z0 * s], [x1 * s, z0 * s], [x1 * s, z1 * s], [x0 * s, z1 * s]]);
    this.quad([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], [[x0 * s, y0 * s], [x1 * s, y0 * s], [x1 * s, y1 * s], [x0 * s, y1 * s]]);
    this.quad([[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]], [0, 0, -1], [[x0 * s, y0 * s], [x0 * s, y1 * s], [x1 * s, y1 * s], [x1 * s, y0 * s]]);
    this.quad([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], [1, 0, 0], [[z0 * s, y0 * s], [z0 * s, y1 * s], [z1 * s, y1 * s], [z1 * s, y0 * s]]);
    this.quad([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], [[z0 * s, y0 * s], [z1 * s, y0 * s], [z1 * s, y1 * s], [z0 * s, y1 * s]]);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
  get empty() { return this.idx.length === 0; }
}

// ---------- общие геометрии ----------
const GEO = {};
function geo(key, make) { return GEO[key] || (GEO[key] = make()); }
const boxG = (w, h, d) => geo(`b${w}_${h}_${d}`, () => new THREE.BoxGeometry(w, h, d));
const cylG = (rt, rb, h, seg = 20, open = false) => geo(`c${rt}_${rb}_${h}_${seg}_${open}`, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open));

function mesh(g, m, x = 0, y = 0, z = 0, cast = true) {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z); o.castShadow = cast; o.receiveShadow = true;
  return o;
}
function multiMat(front, side) { return [side, side, side, side, front, side]; } // +Z — лицевая грань

// ---------- реквизит ----------
function makeProp(kind, r) {
  const g = new THREE.Group();
  switch (kind) {
    case 'bunk': { // двухъярусные нары
      const met = M.greyMetal(), wood = M.wood();
      for (const [x, z] of [[-0.85, -0.38], [0.85, -0.38], [-0.85, 0.38], [0.85, 0.38]]) g.add(mesh(boxG(0.06, 1.9, 0.06), met, x, 0.95, z));
      for (const y of [0.45, 1.35]) {
        g.add(mesh(boxG(1.78, 0.06, 0.82), wood, 0, y, 0));
        if (r() < 0.6) { const mt = mesh(boxG(1.6, 0.1, 0.72), M.fabric(), (r() - .5) * 0.1, y + 0.08, 0); mt.rotation.y = (r() - .5) * 0.1; g.add(mt); }
      }
      break;
    }
    case 'filter': {
      const body = mesh(cylG(0.5, 0.5, 1.6, 24), M.filterGreen(), 0, 0.8, 0); g.add(body);
      for (const y of [0.1, 0.8, 1.55]) g.add(mesh(cylG(0.54, 0.54, 0.06, 24), M.darkMetal(), 0, y, 0));
      g.add(mesh(cylG(0.12, 0.12, WH - 1.6, 12), M.greyMetal(), 0, 1.6 + (WH - 1.6) / 2, 0));
      break;
    }
    case 'fan': {
      g.add(mesh(boxG(1.2, 1.1, 0.9), M.greyMetal(), 0, 0.55, 0));
      const grille = mesh(cylG(0.4, 0.4, 0.06, 24), M.darkMetal(), 0, 0.6, 0.46); grille.rotation.x = Math.PI / 2; g.add(grille);
      for (let k = 0; k < 3; k++) { const b = mesh(boxG(0.7, 0.08, 0.02), M.steel(), 0, 0.6, 0.5); b.rotation.z = k * Math.PI / 3 + r(); g.add(b); }
      g.add(mesh(cylG(0.25, 0.25, WH - 1.1, 12), M.greyMetal(), 0, 1.1 + (WH - 1.1) / 2, -0.1));
      break;
    }
    case 'barrel': {
      const m = r() < 0.5 ? M.rust() : M.bluePaint();
      g.add(mesh(cylG(0.38, 0.38, 0.95, 20), m, 0, 0.475, 0));
      for (const y of [0.3, 0.65]) g.add(mesh(cylG(0.4, 0.4, 0.04, 20), m, 0, y, 0));
      if (r() < 0.4) { const b2 = mesh(cylG(0.38, 0.38, 0.95, 20), m, 0.5, 0.38, 0.3); b2.rotation.z = Math.PI / 2; b2.rotation.y = r(); g.add(b2); }
      break;
    }
    case 'cabinet':
      g.add(mesh(boxG(0.9, 1.8, 0.45), multiMat(faceMaterial('cabinet'), M.white()), 0, 0.9, -0.2));
      break;
    case 'cot':
      g.add(mesh(boxG(0.8, 0.05, 1.8), M.greyMetal(), 0, 0.42, 0));
      for (const [x, z] of [[-0.37, -0.85], [0.37, -0.85], [-0.37, 0.85], [0.37, 0.85]]) g.add(mesh(boxG(0.04, 0.42, 0.04), M.greyMetal(), x, 0.21, z));
      g.add(mesh(boxG(0.74, 0.12, 1.7), M.fabric(), 0, 0.5, 0));
      g.add(mesh(boxG(0.5, 0.1, 0.3), M.white(), 0, 0.6, -0.65));
      break;
    case 'desk': {
      g.add(mesh(boxG(1.4, 0.05, 0.75), M.wood(), 0, 0.76, 0));
      for (const [x, z] of [[-0.65, -0.33], [0.65, -0.33], [-0.65, 0.33], [0.65, 0.33]]) g.add(mesh(boxG(0.05, 0.76, 0.05), M.wood(), x, 0.38, z));
      const paper = mesh(boxG(0.3, 0.005, 0.4), M.white(), -0.3, 0.79, 0.05); paper.rotation.y = r() - 0.5; g.add(paper);
      g.add(mesh(boxG(0.22, 0.09, 0.2), M.black(), 0.4, 0.83, -0.1)); // телефон
      g.add(mesh(boxG(0.2, 0.04, 0.06), M.black(), 0.4, 0.9, -0.1));
      if (r() < 0.5) { const ch = mesh(boxG(0.45, 0.04, 0.45), M.wood(), (r() - .5) * 0.6, 0.45, 0.6); g.add(ch); g.add(mesh(boxG(0.45, 0.5, 0.04), M.wood(), ch.position.x, 0.7, 0.82)); }
      break;
    }
    case 'panel':
      g.add(mesh(boxG(1.1, 2.0, 0.45), multiMat(faceMaterial('panel'), M.greyMetal()), 0, 1.0, -0.25));
      break;
    case 'sink':
      g.add(mesh(boxG(0.6, 0.2, 0.45), M.white(), 0, 0.85, -0.5));
      g.add(mesh(cylG(0.04, 0.04, 0.85, 8), M.steel(), 0, 0.42, -0.6));
      g.add(mesh(cylG(0.02, 0.02, 0.2, 6), M.steel(), 0, 1.05, -0.65));
      break;
    case 'toilet': // чаша Генуя
      g.add(mesh(boxG(0.9, 0.18, 1.1), M.white(), 0, 0.09, 0));
      g.add(mesh(cylG(0.15, 0.15, 0.01, 16), M.hole(), 0, 0.185, 0.25, false));
      for (const x of [-0.25, 0.25]) g.add(mesh(boxG(0.18, 0.02, 0.35), M.greyMetal(), x, 0.19, -0.15));
      break;
    case 'crate': {
      const fm = faceMaterial('crate');
      g.add(mesh(boxG(1, 1, 1), fm, 0, 0.5, 0));
      if (r() < 0.45) { const c2 = mesh(boxG(0.8, 0.8, 0.8), fm, (r() - .5) * 0.2, 1.4, (r() - .5) * 0.2); c2.rotation.y = r() - .5; g.add(c2); }
      break;
    }
    case 'locker':
      g.add(mesh(boxG(0.9, 1.9, 0.5), multiMat(faceMaterial('locker'), M.greyMetal()), 0, 0.95, -0.2));
      break;
  }
  return g;
}

function makeMachine() { // дизель-генератор, занимает 2×2 тайла
  const g = new THREE.Group();
  const side = M.olive(), face = faceMaterial('machine');
  g.add(mesh(boxG(3.2, 1.5, 1.8), [face, face, side, side, face, face], 0, 0.75, 0));
  g.add(mesh(boxG(1.2, 0.5, 1.4), side, -0.6, 1.75, 0));
  g.add(mesh(cylG(0.15, 0.15, WH - 2, 12), M.rust(), 1.1, 2 + (WH - 2) / 2, 0.4));
  g.add(mesh(cylG(0.45, 0.45, 0.4, 24), M.darkMetal(), 1.2, 1.7, -0.3));
  g.add(mesh(boxG(3.4, 0.15, 2.0), M.darkMetal(), 0, 0.075, 0));
  return g;
}

function makeHermo() { // гермодверь в стене
  const g = new THREE.Group();
  g.add(mesh(boxG(1.9, 2.4, 0.15), M.darkMetal(), 0, 1.2, 0.02));
  const door = mesh(boxG(1.5, 2.1, 0.22), M.greyMetal(), 0, 1.07, 0.12); g.add(door);
  const wheel = new THREE.Mesh(geo('torus', () => new THREE.TorusGeometry(0.32, 0.035, 10, 32)), new THREE.MeshStandardMaterial({ color: 0x8a1d14, roughness: 0.5, metalness: 0.4 }));
  wheel.position.set(0, 1.15, 0.28); wheel.castShadow = true; g.add(wheel);
  for (let k = 0; k < 3; k++) { const sp = mesh(boxG(0.64, 0.04, 0.04), wheel.material, 0, 1.15, 0.28); sp.rotation.z = k * Math.PI / 3; g.add(sp); }
  for (const y of [0.45, 1.75]) g.add(mesh(boxG(0.5, 0.12, 0.12), M.steel(), 0.62, y, 0.26));
  const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.35), new THREE.MeshStandardMaterial({ map: labelTexture('ЗД-1', '#3a3f42', '#e8c547'), roughness: 0.7 }));
  lbl.position.set(0, 1.85, 0.235); g.add(lbl);
  return g;
}

function makeLadder(h) {
  const g = new THREE.Group(), m = M.steel();
  for (const x of [-0.25, 0.25]) g.add(mesh(boxG(0.05, h, 0.05), m, x, h / 2, 0));
  for (let y = 0.3; y < h; y += 0.32) g.add(mesh(boxG(0.5, 0.03, 0.03), m, 0, y, 0, false));
  return g;
}

// ---------- построение мира ----------
export function buildWorld(scene, quality) {
  const group = new THREE.Group();
  const map = G.map, zone = G.zone;
  const isWall = (x, y) => (x < 0 || y < 0 || x >= MW || y >= MH) ? true : map[y * MW + x] === WALL;
  const r = mulberry32(G.levelSeed ^ 0x5bd1e995);

  const floors = {}, walls = {}, ceil = new GeoBuilder(), water = new GeoBuilder(), lintel = new GeoBuilder(), shaft = new GeoBuilder(), pit = new GeoBuilder();
  const fb = k => floors[k] || (floors[k] = new GeoBuilder());
  const wb = k => walls[k] || (walls[k] = new GeoBuilder());
  const U = 1 / (2 * S); // одна текстура на 2 тайла

  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const i = y * MW + x, t = map[i];
    const x0 = x * S, x1 = x0 + S, z0 = y * S, z1 = z0 + S;
    if (t === WALL) {
      // вертикальные грани к открытым соседям
      const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
      for (const [dx, dy] of dirs) {
        if (isWall(x + dx, y + dy)) continue;
        const nz = zone[(y + dy) * MW + x + dx];
        const rt = nz >= 0 ? G.rooms[nz].type : null;
        const b = wb(rt === 'med' || rt === 'wc' ? 1 : 0);
        if (dy === 1) b.quad([[x0, 0, z1], [x1, 0, z1], [x1, WH, z1], [x0, WH, z1]], [0, 0, 1], [[x0 * U, 0], [x1 * U, 0], [x1 * U, 1], [x0 * U, 1]]);
        else if (dy === -1) b.quad([[x1, 0, z0], [x0, 0, z0], [x0, WH, z0], [x1, WH, z0]], [0, 0, -1], [[-x1 * U, 0], [-x0 * U, 0], [-x0 * U, 1], [-x1 * U, 1]]);
        else if (dx === 1) b.quad([[x1, 0, z1], [x1, 0, z0], [x1, WH, z0], [x1, WH, z1]], [1, 0, 0], [[-z1 * U, 0], [-z0 * U, 0], [-z0 * U, 1], [-z1 * U, 1]]);
        else b.quad([[x0, 0, z0], [x0, 0, z1], [x0, WH, z1], [x0, WH, z0]], [-1, 0, 0], [[z0 * U, 0], [z1 * U, 0], [z1 * U, 1], [z0 * U, 1]]);
      }
      continue;
    }
    // потолок
    if (t !== EXIT) ceil.quad([[x0, WH, z0], [x1, WH, z0], [x1, WH, z1], [x0, WH, z1]], [0, -1, 0], [[x0 * U, z0 * U], [x1 * U, z0 * U], [x1 * U, z1 * U], [x0 * U, z1 * U]]);
    if (t === DOWN) continue;
    // пол
    const z = zone[i];
    let style = z >= 0 ? ROOM_TYPES[G.rooms[z].type].floor : 'corridor';
    if (t === DOOR) style = 'door';
    const fuv = style === 'door' ? 1 / S : U;
    fb(style).quad([[x0, 0, z0], [x0, 0, z1], [x1, 0, z1], [x1, 0, z0]], [0, 1, 0], [[x0 * fuv, -z0 * fuv], [x0 * fuv, -z1 * fuv], [x1 * fuv, -z1 * fuv], [x1 * fuv, -z0 * fuv]]);
    if (t === WATER) water.quad([[x0, 0.07, z0], [x0, 0.07, z1], [x1, 0.07, z1], [x1, 0.07, z0]], [0, 1, 0], [[x0 * U, z0 * U], [x0 * U, z1 * U], [x1 * U, z1 * U], [x1 * U, z0 * U]]);
    if (t === DOOR) lintel.box(x0, 2.35, z0, x1, WH, z1, 0.5);
  }

  // шахта люка (выход) — вверх
  {
    const x0 = G.exit.x * S, x1 = x0 + S, z0 = G.exit.y * S, z1 = z0 + S, h0 = WH, h1 = WH + 4;
    shaft.quad([[x0, h0, z0], [x1, h0, z0], [x1, h1, z0], [x0, h1, z0]], [0, 0, 1], [[0, 0], [1, 0], [1, 2], [0, 2]]);
    shaft.quad([[x0, h0, z1], [x1, h0, z1], [x1, h1, z1], [x0, h1, z1]], [0, 0, -1], [[0, 0], [1, 0], [1, 2], [0, 2]]);
    shaft.quad([[x0, h0, z0], [x0, h0, z1], [x0, h1, z1], [x0, h1, z0]], [1, 0, 0], [[0, 0], [1, 0], [1, 2], [0, 2]]);
    shaft.quad([[x1, h0, z0], [x1, h0, z1], [x1, h1, z1], [x1, h1, z0]], [-1, 0, 0], [[0, 0], [1, 0], [1, 2], [0, 2]]);
  }
  // яма вниз
  {
    const x0 = G.down.x * S, x1 = x0 + S, z0 = G.down.y * S, z1 = z0 + S, h0 = -5, h1 = 0;
    pit.quad([[x0, h0, z0], [x1, h0, z0], [x1, h1, z0], [x0, h1, z0]], [0, 0, 1], [[0, 0], [1, 0], [1, 2], [0, 2]]);
    pit.quad([[x0, h0, z1], [x1, h0, z1], [x1, h1, z1], [x0, h1, z1]], [0, 0, -1], [[0, 0], [1, 0], [1, 2], [0, 2]]);
    pit.quad([[x0, h0, z0], [x0, h0, z1], [x0, h1, z1], [x0, h1, z0]], [1, 0, 0], [[0, 0], [1, 0], [1, 2], [0, 2]]);
    pit.quad([[x1, h0, z0], [x1, h0, z1], [x1, h1, z1], [x1, h1, z0]], [-1, 0, 0], [[0, 0], [1, 0], [1, 2], [0, 2]]);
  }

  const add = (b, m, cast = true) => { if (b.empty) return null; const o = new THREE.Mesh(b.build(), m); o.receiveShadow = true; o.castShadow = cast; group.add(o); return o; };
  for (const k in floors) add(floors[k], floorMaterial(k), false);
  for (const k in walls) add(walls[k], wallMaterial(+k));
  add(ceil, ceilingMaterial(), false);
  add(lintel, M.greyMetal());
  add(shaft, M.rust(), false);
  add(pit, new THREE.MeshStandardMaterial({ color: 0x15130f, roughness: 1, map: wallMaterial(0).map }), false);
  const waterMesh = add(water, waterMaterial(), false);
  if (waterMesh) waterMesh.receiveShadow = true;

  // ---------- трубы вдоль коридоров (instanced) ----------
  const pipeSegs = [];
  for (let y = 1; y < MH - 1; y++) for (let x = 1; x < MW - 1; x++) {
    if (map[y * MW + x] !== WALL) continue;
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const nx = x + dx, ny = y + dy, nt = map[ny * MW + nx];
      if (nt === WALL || zone[ny * MW + nx] !== -1) continue;
      pipeSegs.push([x, y, dx, dy]);
    }
  }
  if (pipeSegs.length) {
    const pipeGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
    const pipes = new THREE.InstancedMesh(pipeGeo, M.rust(), pipeSegs.length * 2);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    let n = 0;
    for (const [x, y, dx, dy] of pipeSegs) {
      for (const [h, rad, off] of [[2.62, 0.09, 0.18], [2.35, 0.05, 0.12]]) {
        if (dy !== 0) { // стена вдоль X
          p.set((x + 0.5) * S, h, (dy > 0 ? (y + 1) * S + off : y * S - off));
          q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
        } else {
          p.set((dx > 0 ? (x + 1) * S + off : x * S - off), h, (y + 0.5) * S);
          q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
        }
        sc.set(rad, S + 0.01, rad);
        m4.compose(p, q, sc); pipes.setMatrixAt(n++, m4);
      }
    }
    pipes.count = n; pipes.castShadow = true; pipes.receiveShadow = true;
    group.add(pipes);
  }

  // ---------- мусор: камни и бумажки ----------
  {
    const openTiles = [];
    for (let i = 0; i < MW * MH; i++) if (map[i] === FLOOR) openTiles.push(i);
    const nRocks = quality === 'low' ? 200 : 500;
    const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), floorMaterial('concrete'), nRocks);
    const papers = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), M.white(), 120);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    for (let k = 0; k < nRocks; k++) {
      const i = openTiles[Math.floor(r() * openTiles.length)];
      const s = 0.03 + r() * r() * 0.16;
      p.set((i % MW + r()) * S, s * 0.5, (Math.floor(i / MW) + r()) * S);
      e.set(r() * 6, r() * 6, r() * 6); q.setFromEuler(e); sc.set(s, s * (0.5 + r() * 0.5), s);
      m4.compose(p, q, sc); rocks.setMatrixAt(k, m4);
    }
    for (let k = 0; k < 120; k++) {
      const i = openTiles[Math.floor(r() * openTiles.length)];
      p.set((i % MW + r()) * S, 0.01 + r() * 0.01, (Math.floor(i / MW) + r()) * S);
      e.set(-Math.PI / 2 + (r() - .5) * 0.2, 0, r() * 6); q.setFromEuler(e); sc.set(0.21, 0.297, 1);
      m4.compose(p, q, sc); papers.setMatrixAt(k, m4);
    }
    rocks.castShadow = true; rocks.receiveShadow = true; papers.receiveShadow = true;
    group.add(rocks, papers);
  }

  // ---------- реквизит ----------
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const i = y * MW + x;
    if (map[i] !== PROP || G.propKind[i] === 'big') continue;
    const o = makeProp(G.propKind[i], r);
    let rot = (r() - 0.5) * 0.15, bx = 0, bz = 0;
    if (isWall(x, y - 1)) { rot += 0; bz = -1; }
    else if (isWall(x, y + 1)) { rot += Math.PI; bz = 1; }
    else if (isWall(x - 1, y)) { rot += Math.PI / 2; bx = -1; }
    else if (isWall(x + 1, y)) { rot -= Math.PI / 2; bx = 1; }
    o.rotation.y = rot;
    o.position.set((x + 0.5) * S + bx * 0.35, 0, (y + 0.5) * S + bz * 0.35);
    group.add(o);
  }
  for (const b of G.bigProps) { const o = makeMachine(); o.position.set((b.x + 1) * S, 0, (b.y + 1) * S); o.rotation.y = r() < 0.5 ? 0 : Math.PI; group.add(o); }

  // ---------- фото-точки ----------
  for (const s of G.spots) {
    const fx = (s.x + 0.5) * S, fz = (s.y + 1) * S;
    if (s.kind === 'hermo') {
      const o = makeHermo(); o.position.set(fx, 0, fz); group.add(o);
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), new THREE.MeshStandardMaterial({ map: spotTexture(s), transparent: true, alphaTest: 0.05 }));
      pl.position.set(fx, 1.2, fz + 0.01); group.add(pl);
      s.mesh = o;
      continue;
    }
    const big = s.kind === 'graffiti' ? [1.9, 1.9] : s.kind === 'slogan' ? [1.9, 1.9] : [1.25, 1.25];
    const m = new THREE.MeshStandardMaterial({ map: spotTexture(s), transparent: true, alphaTest: 0.05, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2 });
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(big[0], big[1]), m);
    pl.position.set(fx, s.kind === 'graffiti' ? 1.3 : 1.65, fz + 0.012);
    pl.rotation.z = (r() - .5) * 0.06;
    pl.receiveShadow = true;
    group.add(pl);
    s.mesh = pl;
  }

  // ---------- аварийные лампы ----------
  const lampMeshes = [];
  for (const L of G.lamps) {
    if (L.moon) continue;
    const col = new THREE.Color(`rgb(${L.rgb})`);
    const fx = (L.wx + 0.5) * S, fz = (L.wy + 1) * S;
    const base = mesh(boxG(0.36, 0.22, 0.12), M.darkMetal(), fx, 2.45, fz + 0.06, false);
    const bulbM = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 2.5, roughness: 0.3 });
    const bulb = mesh(boxG(0.28, 0.15, 0.1), bulbM, fx, 2.45, fz + 0.15, false);
    for (let k = -1; k <= 1; k++) group.add(mesh(boxG(0.015, 0.17, 0.02), M.darkMetal(), fx + k * 0.08, 2.45, fz + 0.21, false));
    group.add(base, bulb);
    L.world = new THREE.Vector3(fx, 2.35, fz + 0.45);
    L.color = col; L.bulb = bulbM;
    lampMeshes.push(bulbM);
  }

  // ---------- люк: лестница, лунный свет ----------
  {
    const ex = (G.exit.x + 0.5) * S, ez = (G.exit.y + 0.5) * S;
    const lad = makeLadder(WH + 4); lad.position.set(ex, 0, ez - S / 2 + 0.12); group.add(lad);
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(S, S), new THREE.MeshBasicMaterial({ color: 0x24324d }));
    sky.rotation.x = Math.PI / 2; sky.position.set(ex, WH + 3.99, ez); group.add(sky);
    // кольцо люка в потолке
    const ring = new THREE.Mesh(new THREE.TorusGeometry(S * 0.48, 0.08, 8, 32), M.darkMetal());
    ring.rotation.x = Math.PI / 2; ring.position.set(ex, WH - 0.02, ez); group.add(ring);
    // видимый луч
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 0.85, WH + 3.5, 24, 1, true),
      new THREE.MeshBasicMaterial({ map: beamTexture(), color: 0x6680c0, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.set(ex, (WH + 3.5) / 2, ez); beam.rotation.x = Math.PI; group.add(beam);
  }
  // ---------- яма вниз ----------
  {
    const dx = (G.down.x + 0.5) * S, dz = (G.down.y + 0.5) * S;
    const bottom = new THREE.Mesh(new THREE.PlaneGeometry(S, S), M.hole()); bottom.rotation.x = -Math.PI / 2; bottom.position.set(dx, -4.99, dz); group.add(bottom);
    const lad = makeLadder(5.8); lad.position.set(dx, -5, dz - S / 2 + 0.12); group.add(lad);
    const hz = new THREE.MeshStandardMaterial({ map: floorMaterial('door').map, roughness: 0.6 });
    for (const [x, z, w, d] of [[0, -S / 2, S + 0.2, 0.12], [0, S / 2, S + 0.2, 0.12], [-S / 2, 0, 0.12, S], [S / 2, 0, 0.12, S]]) group.add(mesh(boxG(w, 0.08, d), hz, dx + x, 0.04, dz + z, false));
    // ограждение
    for (const [x, z] of [[-S / 2, S / 2], [S / 2, S / 2]]) group.add(mesh(boxG(0.06, 1.0, 0.06), M.steel(), dx + x, 0.5, dz + z));
    group.add(mesh(boxG(S, 0.05, 0.05), new THREE.MeshStandardMaterial({ color: 0xc9a634, roughness: 0.5 }), dx, 1.0, dz + S / 2));
  }

  // ---------- мёртвые плафоны на потолке комнат ----------
  for (const room of G.rooms) {
    const n = Math.max(1, Math.floor(room.w * room.h / 30));
    for (let k = 0; k < n; k++) {
      const x = (room.x + 1 + r() * (room.w - 2)) * S, z = (room.y + 1 + r() * (room.h - 2)) * S;
      group.add(mesh(cylG(0.25, 0.32, 0.18, 16), M.darkMetal(), x, WH - 0.09, z, false));
      group.add(mesh(cylG(0.24, 0.24, 0.02, 16), new THREE.MeshStandardMaterial({ color: 0x6a6a60, roughness: 0.3 }), x, WH - 0.19, z, false));
    }
  }

  scene.add(group);
  return { group, waterMesh, lampMeshes };
}

export function disposeWorld(world, scene) {
  if (!world) return;
  scene.remove(world.group);
  world.group.traverse(o => {
    if (o.geometry && !Object.values(GEO).includes(o.geometry)) o.geometry.dispose();
  });
}
