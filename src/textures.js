// Процедурные текстуры на canvas — никаких внешних картинок.
import * as THREE from 'three';
import { mulberry32 } from './level.js';

let maxAniso = 4;
export function setAniso(a) { maxAniso = a; }

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// шум с накоплением пятен
function speckle(g, w, h, r, n, cols, smin = 1, smax = 3) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = cols[Math.floor(r() * cols.length)];
    const s = smin + r() * (smax - smin);
    g.fillRect(r() * w, r() * h, s, s);
  }
}
function blotches(g, w, h, r, n, rgba, rmin, rmax) {
  for (let i = 0; i < n; i++) {
    const x = r() * w, y = r() * h, rad = rmin + r() * (rmax - rmin);
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, rgba); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
}
function cracks(g, w, h, r, n, col = 'rgba(0,0,0,.5)') {
  g.strokeStyle = col; g.lineWidth = 1.2;
  for (let i = 0; i < n; i++) {
    let x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y);
    const steps = 4 + Math.floor(r() * 8);
    for (let k = 0; k < steps; k++) { x += (r() - .5) * 40; y += (r() - .5) * 40; g.lineTo(x, y); }
    g.stroke();
  }
}

// карта высот = яркость → bumpMap
function toBump(src) {
  const c = canvas(src.width, src.height), g = c.getContext('2d');
  g.filter = 'grayscale(1) contrast(1.4)';
  g.drawImage(src, 0, 0);
  return c;
}

function tex(c, repeat = 1, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = maxAniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const cache = {};
function mat(key, make) { return cache[key] || (cache[key] = make()); }

// ---------------- поверхности ----------------
function concreteCanvas(seed, base, dark) {
  const w = 512, c = canvas(w, w), g = c.getContext('2d'), r = mulberry32(seed);
  g.fillStyle = base; g.fillRect(0, 0, w, w);
  blotches(g, w, w, r, 40, 'rgba(0,0,0,.18)', 30, 120);
  blotches(g, w, w, r, 25, 'rgba(255,255,255,.05)', 20, 90);
  speckle(g, w, w, r, 9000, ['rgba(0,0,0,.25)', 'rgba(255,255,255,.07)', 'rgba(60,50,40,.2)'], 1, 2.5);
  blotches(g, w, w, r, 8, dark, 20, 70);  // масляные пятна / сырость
  cracks(g, w, w, r, 6);
  return c;
}

export function floorMaterial(style) {
  return mat('floor_' + style, () => {
    let c;
    const r = mulberry32(style.length * 977);
    if (style === 'tile') {
      c = canvas(512, 512); const g = c.getContext('2d');
      g.fillStyle = '#5c5f5a'; g.fillRect(0, 0, 512, 512);
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        const v = 170 + r() * 30 | 0;
        g.fillStyle = `rgb(${v},${v + 4},${v - 4})`;
        g.fillRect(x * 64 + 2, y * 64 + 2, 60, 60);
        if (r() < 0.12) { g.fillStyle = 'rgba(40,40,30,.55)'; g.fillRect(x * 64 + 2, y * 64 + 2, 60, 60); }
        if (r() < 0.15) cracks(g, 0, 0, r, 0);
      }
      blotches(g, 512, 512, r, 30, 'rgba(80,60,30,.25)', 30, 100);
      speckle(g, 512, 512, r, 3000, ['rgba(0,0,0,.2)'], 1, 2);
      cracks(g, 512, 512, r, 8, 'rgba(0,0,0,.6)');
    } else if (style === 'metal') {
      c = canvas(256, 256); const g = c.getContext('2d');
      g.fillStyle = '#4a5054'; g.fillRect(0, 0, 256, 256);
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        g.save(); g.translate(x * 16 + 8, y * 16 + 8); g.rotate((x + y) % 2 ? 0.7 : -0.7);
        g.fillStyle = '#6d7479'; g.fillRect(-5, -1.5, 10, 3); g.fillStyle = '#2e3235'; g.fillRect(-5, 1.5, 10, 1); g.restore();
      }
      blotches(g, 256, 256, r, 25, 'rgba(120,60,20,.35)', 10, 50);
      speckle(g, 256, 256, r, 2000, ['rgba(0,0,0,.25)', 'rgba(140,80,30,.2)'], 1, 2);
    } else if (style === 'lino') {
      c = canvas(512, 512); const g = c.getContext('2d');
      g.fillStyle = '#6b4a33'; g.fillRect(0, 0, 512, 512);
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        g.fillStyle = (x + y) % 2 ? 'rgba(160,110,70,.25)' : 'rgba(40,20,10,.15)'; g.fillRect(x * 128, y * 128, 128, 128);
      }
      blotches(g, 512, 512, r, 30, 'rgba(0,0,0,.25)', 30, 110);
      speckle(g, 512, 512, r, 4000, ['rgba(0,0,0,.15)', 'rgba(255,220,180,.06)'], 1, 3);
      g.strokeStyle = 'rgba(30,15,5,.6)'; g.lineWidth = 3; cracks(g, 512, 512, r, 5, 'rgba(30,15,5,.6)');
    } else if (style === 'corridor') {
      c = concreteCanvas(11, '#4b4843', 'rgba(20,25,20,.4)');
      const g = c.getContext('2d'); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, 254, 512, 4); g.fillRect(254, 0, 4, 512);
    } else if (style === 'door') {
      c = canvas(256, 256); const g = c.getContext('2d');
      g.fillStyle = '#2e3133'; g.fillRect(0, 0, 256, 256);
      g.save(); g.beginPath(); g.rect(16, 16, 224, 224); g.clip();
      for (let k = -256; k < 512; k += 48) { g.fillStyle = '#c9a634'; g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 24, 0); g.lineTo(k + 24 - 256, 256); g.lineTo(k - 256, 256); g.fill(); }
      g.restore();
      speckle(g, 256, 256, r, 4000, ['rgba(0,0,0,.35)', 'rgba(90,50,20,.3)'], 1, 3);
      blotches(g, 256, 256, r, 10, 'rgba(0,0,0,.4)', 20, 60);
    } else {
      c = concreteCanvas(7, '#56524b', 'rgba(30,25,15,.35)');
    }
    const t = tex(c), b = tex(toBump(c), 1, false);
    return new THREE.MeshStandardMaterial({ map: t, bumpMap: b, bumpScale: style === 'metal' ? 3 : 1.5, roughness: style === 'tile' ? 0.45 : style === 'metal' ? 0.55 : 0.92, metalness: style === 'metal' ? 0.4 : 0 });
  });
}

// Советская стена: низ — зелёная масляная краска, верх — побелка. Текстура 1 тайл шириной, вся высота.
export function wallMaterial(variant = 0) {
  return mat('wall' + variant, () => {
    const w = 512, h = 768, c = canvas(w, h), g = c.getContext('2d'), r = mulberry32(42 + variant);
    const split = h * 0.5;
    // побелка
    g.fillStyle = '#a8a493'; g.fillRect(0, 0, w, split);
    blotches(g, w, split, r, 40, 'rgba(90,80,60,.25)', 30, 140);
    speckle(g, w, split, r, 5000, ['rgba(0,0,0,.15)', 'rgba(255,255,255,.1)'], 1, 3);
    // краска
    const green = variant === 1 ? '#3d5566' : '#3f5f4c';
    g.fillStyle = green; g.fillRect(0, split, w, h - split);
    const gr = g.createLinearGradient(0, split, 0, h); gr.addColorStop(0, 'rgba(255,255,255,.06)'); gr.addColorStop(1, 'rgba(0,0,0,.35)');
    g.fillStyle = gr; g.fillRect(0, split, w, h - split);
    g.fillStyle = '#2a3d31'; g.fillRect(0, split - 4, w, 8); // разделительная полоса
    // облупленная краска — видна штукатурка
    for (let i = 0; i < 45; i++) {
      const x = r() * w, y = split + r() * (h - split), rx = 2 + r() * r() * 30, ry = 2 + r() * r() * 16;
      g.fillStyle = 'rgba(140,130,110,.9)'; g.beginPath(); g.ellipse(x, y, rx, ry, r() * 3, 0, 7); g.fill();
      g.strokeStyle = 'rgba(20,30,22,.6)'; g.lineWidth = 1.5; g.stroke();
    }
    // потёки ржавчины и сырости
    for (let i = 0; i < 9; i++) {
      const x = r() * w, len = 80 + r() * 400, wd = 3 + r() * 12;
      const lg = g.createLinearGradient(0, 0, 0, len); lg.addColorStop(0, 'rgba(100,55,20,.55)'); lg.addColorStop(1, 'rgba(100,55,20,0)');
      g.fillStyle = lg; g.fillRect(x, 0, wd, len);
    }
    blotches(g, w, h, r, 10, 'rgba(10,20,10,.35)', 40, 120);
    // плинтус-грязь снизу
    const bg = g.createLinearGradient(0, h - 90, 0, h); bg.addColorStop(0, 'rgba(0,0,0,0)'); bg.addColorStop(1, 'rgba(15,12,8,.75)');
    g.fillStyle = bg; g.fillRect(0, h - 90, w, 90);
    cracks(g, w, h, r, 10);
    const t = tex(c); t.repeat.set(1, 1);
    const b = tex(toBump(c), 1, false);
    return new THREE.MeshStandardMaterial({ map: t, bumpMap: b, bumpScale: 2, roughness: 0.88 });
  });
}

export function ceilingMaterial() {
  return mat('ceil', () => {
    const c = concreteCanvas(99, '#4a4740', 'rgba(20,30,20,.45)'), g = c.getContext('2d');
    g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(0, 0, 512, 6); g.fillRect(0, 0, 6, 512);
    const r = mulberry32(5); blotches(g, 512, 512, r, 6, 'rgba(60,80,50,.35)', 30, 90); // плесень
    const t = tex(c), b = tex(toBump(c), 1, false);
    return new THREE.MeshStandardMaterial({ map: t, bumpMap: b, bumpScale: 1.5, roughness: 0.95 });
  });
}

export function waterMaterial() {
  return mat('water', () => {
    const c = canvas(256, 256), g = c.getContext('2d'), r = mulberry32(3);
    g.fillStyle = '#808080'; g.fillRect(0, 0, 256, 256);
    blotches(g, 256, 256, r, 120, 'rgba(255,255,255,.18)', 6, 30);
    blotches(g, 256, 256, r, 120, 'rgba(0,0,0,.18)', 6, 30);
    const b = tex(c, 1, false);
    return new THREE.MeshStandardMaterial({ color: 0x0c1c1e, roughness: 0.08, metalness: 0.7, transparent: true, opacity: 0.86, bumpMap: b, bumpScale: 0.6 });
  });
}

function simpleMat(key, draw, opts = {}, size = 256) {
  return mat(key, () => {
    const c = canvas(size, size), g = c.getContext('2d'), r = mulberry32(key.length * 131 + 7);
    draw(g, size, r);
    const { bump, bumpScale, ...rest } = opts;
    const m = new THREE.MeshStandardMaterial(Object.assign({ map: tex(c), roughness: 0.8 }, rest));
    if (bump !== false) { m.bumpMap = tex(toBump(c), 1, false); m.bumpScale = bumpScale || 1.5; }
    return m;
  });
}

export const M = {
  wood: () => simpleMat('wood', (g, s, r) => {
    g.fillStyle = '#6e4f2c'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 60; i++) { g.strokeStyle = `rgba(${40 + r() * 30},${25 + r() * 15},10,.5)`; g.lineWidth = 1 + r() * 2; g.beginPath(); const y = r() * s; g.moveTo(0, y); g.bezierCurveTo(s * .3, y + (r() - .5) * 10, s * .6, y + (r() - .5) * 10, s, y); g.stroke(); }
    for (let k = 0; k < 4; k++) { g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(0, k * s / 4, s, 3); }
    blotches(g, s, s, r, 10, 'rgba(0,0,0,.3)', 10, 50);
  }, { roughness: 0.85 }),
  rust: () => simpleMat('rust', (g, s, r) => {
    g.fillStyle = '#6f4425'; g.fillRect(0, 0, s, s);
    blotches(g, s, s, r, 60, 'rgba(160,80,30,.5)', 6, 40);
    blotches(g, s, s, r, 40, 'rgba(30,20,10,.5)', 6, 30);
    speckle(g, s, s, r, 3000, ['rgba(0,0,0,.3)', 'rgba(200,120,50,.25)'], 1, 3);
  }, { roughness: 0.9, metalness: 0.3, bumpScale: 3 }),
  bluePaint: () => simpleMat('bluePaint', (g, s, r) => {
    g.fillStyle = '#2f4f6b'; g.fillRect(0, 0, s, s);
    blotches(g, s, s, r, 30, 'rgba(120,60,20,.6)', 4, 25);
    speckle(g, s, s, r, 2000, ['rgba(0,0,0,.3)'], 1, 2);
  }, { roughness: 0.6, metalness: 0.3 }),
  olive: () => simpleMat('olive', (g, s, r) => {
    g.fillStyle = '#4a5238'; g.fillRect(0, 0, s, s);
    blotches(g, s, s, r, 30, 'rgba(0,0,0,.3)', 5, 30);
    blotches(g, s, s, r, 20, 'rgba(120,70,30,.4)', 3, 15);
    speckle(g, s, s, r, 2000, ['rgba(0,0,0,.2)', 'rgba(255,255,255,.05)'], 1, 2);
  }, { roughness: 0.6, metalness: 0.35 }),
  greyMetal: () => simpleMat('greyMetal', (g, s, r) => {
    g.fillStyle = '#5c6366'; g.fillRect(0, 0, s, s);
    blotches(g, s, s, r, 25, 'rgba(0,0,0,.3)', 5, 30);
    blotches(g, s, s, r, 15, 'rgba(130,70,30,.4)', 3, 14);
    speckle(g, s, s, r, 2500, ['rgba(0,0,0,.2)', 'rgba(255,255,255,.06)'], 1, 2);
  }, { roughness: 0.5, metalness: 0.55 }),
  darkMetal: () => mat('darkMetal', () => new THREE.MeshStandardMaterial({ color: 0x24282a, roughness: 0.5, metalness: 0.7 })),
  steel: () => mat('steel', () => new THREE.MeshStandardMaterial({ color: 0x8a9196, roughness: 0.35, metalness: 0.85 })),
  white: () => simpleMat('whiteEnamel', (g, s, r) => {
    g.fillStyle = '#c9c6ba'; g.fillRect(0, 0, s, s);
    blotches(g, s, s, r, 20, 'rgba(110,80,40,.3)', 5, 30);
    speckle(g, s, s, r, 800, ['rgba(60,40,20,.4)'], 1, 3);
  }, { roughness: 0.35 }),
  filterGreen: () => simpleMat('filterGreen', (g, s, r) => {
    g.fillStyle = '#34503b'; g.fillRect(0, 0, s, s);
    blotches(g, s, s, r, 30, 'rgba(0,0,0,.35)', 5, 30);
    blotches(g, s, s, r, 15, 'rgba(140,80,30,.45)', 3, 20);
    g.fillStyle = 'rgba(230,230,210,.85)'; g.font = 'bold 28px monospace'; g.fillText('ФП-300', 70, 130);
  }, { roughness: 0.6, metalness: 0.3 }),
  fabric: () => simpleMat('fabric', (g, s, r) => {
    g.fillStyle = '#7d7660'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < s; i += 4) { g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(i, 0, 2, s); g.fillRect(0, i, s, 2); }
    blotches(g, s, s, r, 12, 'rgba(70,40,20,.4)', 10, 50);
  }, { roughness: 1 }),
  guardCloth: () => mat('guardCloth', () => new THREE.MeshStandardMaterial({ color: 0x1b2433, roughness: 0.9 })),
  black: () => mat('black', () => new THREE.MeshStandardMaterial({ color: 0x0b0b0b, roughness: 0.8 })),
  skin: () => mat('skin', () => new THREE.MeshStandardMaterial({ color: 0xb08468, roughness: 0.7 })),
  rat: () => mat('rat', () => new THREE.MeshStandardMaterial({ color: 0x3e3531, roughness: 0.95 })),
  ratTail: () => mat('ratTail', () => new THREE.MeshStandardMaterial({ color: 0x9a7b72, roughness: 0.7 })),
  hole: () => mat('hole', () => new THREE.MeshBasicMaterial({ color: 0x000000 })),
};

// панели/лицевые стороны с рисунком (передняя грань предметов)
export function faceMaterial(kind) {
  return simpleMat('face_' + kind, (g, s, r) => {
    if (kind === 'cabinet') {
      g.fillStyle = '#c9c6ba'; g.fillRect(0, 0, s, s);
      g.strokeStyle = '#8a877c'; g.lineWidth = 4; g.strokeRect(10, 10, s - 20, s - 20); g.beginPath(); g.moveTo(s / 2, 10); g.lineTo(s / 2, s - 10); g.stroke();
      g.fillStyle = '#b0281c'; g.fillRect(s / 2 - 70, 50, 40, 110); g.fillRect(s / 2 - 105, 85, 110, 40);
      blotches(g, s, s, r, 15, 'rgba(110,80,40,.3)', 5, 30);
    } else if (kind === 'panel') {
      g.fillStyle = '#5d6468'; g.fillRect(0, 0, s, s);
      for (let k = 0; k < 4; k++) {
        const x = 40 + (k % 2) * 120, y = 50 + Math.floor(k / 2) * 90;
        g.fillStyle = '#e0dccf'; g.beginPath(); g.arc(x + 20, y + 20, 28, 0, 7); g.fill();
        g.strokeStyle = '#111'; g.lineWidth = 2; g.beginPath(); g.arc(x + 20, y + 20, 28, 0, 7); g.stroke();
        g.lineWidth = 3; g.beginPath(); g.moveTo(x + 20, y + 20); const a = Math.PI + r() * Math.PI; g.lineTo(x + 20 + Math.cos(a) * 22, y + 20 + Math.sin(a) * 22); g.stroke();
      }
      ['#a01e14', '#1e6a1e', '#a08a14', '#a01e14'].forEach((c, k) => { g.fillStyle = c; g.fillRect(30 + k * 52, 220, 26, 20); });
      blotches(g, s, s, r, 15, 'rgba(0,0,0,.3)', 5, 30);
    } else if (kind === 'locker') {
      g.fillStyle = '#4d5a5e'; g.fillRect(0, 0, s, s);
      g.fillStyle = '#2e3739'; g.fillRect(s / 2 - 2, 0, 4, s);
      for (let k = 0; k < 6; k++) { g.fillRect(30, 30 + k * 12, 70, 5); g.fillRect(s - 100, 30 + k * 12, 70, 5); }
      g.fillStyle = '#999'; g.fillRect(s / 2 - 16, s / 2, 8, 24); g.fillRect(s / 2 + 8, s / 2, 8, 24);
      blotches(g, s, s, r, 15, 'rgba(120,60,20,.35)', 5, 25);
    } else if (kind === 'crate') {
      g.fillStyle = '#7b5a32'; g.fillRect(0, 0, s, s);
      for (let i = 0; i < 40; i++) { g.strokeStyle = 'rgba(50,30,10,.4)'; g.beginPath(); const y = r() * s; g.moveTo(0, y); g.lineTo(s, y + (r() - .5) * 8); g.stroke(); }
      g.strokeStyle = '#4e3820'; g.lineWidth = 16; g.strokeRect(8, 8, s - 16, s - 16);
      g.beginPath(); g.moveTo(16, 16); g.lineTo(s - 16, s - 16); g.stroke();
      g.fillStyle = 'rgba(20,20,20,.75)'; g.font = 'bold 30px monospace'; g.fillText(r() < .5 ? 'НЗ-1' : 'ГО', 90, 140);
    } else if (kind === 'machine') {
      g.fillStyle = '#4a5238'; g.fillRect(0, 0, s, s);
      g.fillStyle = '#373d2a'; for (let k = 0; k < 9; k++) g.fillRect(20, 30 + k * 14, s - 40, 7);
      g.fillStyle = '#8a1c14'; g.fillRect(0, s - 50, s, 14);
      g.fillStyle = '#e8e4d0'; g.font = 'bold 24px monospace'; g.fillText('ДГА-48', 80, s - 70);
      blotches(g, s, s, r, 20, 'rgba(0,0,0,.35)', 5, 40);
      blotches(g, s, s, r, 15, 'rgba(120,70,30,.4)', 3, 20);
    }
  }, { roughness: 0.6, metalness: kind === 'crate' ? 0 : 0.3 }, 256);
}

// ---------------- плакаты / фото-точки ----------------
export function spotTexture(spot) {
  const key = 'spot_' + spot.kind + (spot.text || '');
  if (cache[key]) return cache[key];
  const w = 512, h = 512, c = canvas(w, h), g = c.getContext('2d'), r = mulberry32(key.length * 51);
  g.clearRect(0, 0, w, h);
  const aged = () => { blotches(g, w, h, r, 25, 'rgba(90,70,30,.3)', 20, 80); speckle(g, w, h, r, 2500, ['rgba(60,40,10,.25)'], 1, 3); };
  g.textAlign = 'center';
  switch (spot.kind) {
    case 'poster':
      g.fillStyle = '#ddd2b0'; g.fillRect(40, 20, 432, 472);
      g.fillStyle = '#b52a1e'; g.fillRect(40, 20, 432, 100);
      g.fillStyle = '#f2e8cc'; g.font = 'bold 32px sans-serif'; g.fillText('СИГНАЛЫ', 256, 70); g.fillText('ГРАЖДАНСКОЙ ОБОРОНЫ', 256, 108);
      g.fillStyle = '#222'; g.beginPath(); g.arc(150, 230, 40, 0, 7); g.fill(); g.fillRect(130, 270, 40, 110); // фигура в противогазе
      g.fillStyle = '#7a8a70'; g.beginPath(); g.arc(150, 240, 26, 0, 7); g.fill();
      g.fillStyle = '#333'; g.font = 'bold 22px sans-serif'; g.textAlign = 'left';
      ['«ВНИМАНИЕ ВСЕМ!»', 'ВОЗДУШНАЯ ТРЕВОГА', 'ОТБОЙ ТРЕВОГИ', 'РАДИАЦИОННАЯ', 'ОПАСНОСТЬ'].forEach((t, k) => g.fillText(t, 220, 190 + k * 42));
      g.textAlign = 'center';
      aged(); break;
    case 'scheme':
      g.fillStyle = '#e8e4d6'; g.fillRect(30, 60, 452, 380);
      g.fillStyle = '#2a2a2a'; g.font = 'bold 30px sans-serif'; g.fillText('СХЕМА ЭВАКУАЦИИ', 256, 100);
      g.strokeStyle = '#2c4f8a'; g.lineWidth = 6;
      g.strokeRect(70, 140, 120, 90); g.strokeRect(240, 140, 200, 160); g.strokeRect(70, 280, 140, 120);
      g.beginPath(); g.moveTo(190, 185); g.lineTo(240, 185); g.moveTo(140, 230); g.lineTo(140, 280); g.stroke();
      g.fillStyle = '#c0392b'; g.beginPath(); g.moveTo(330, 360); g.lineTo(420, 330); g.lineTo(420, 390); g.fill();
      g.fillStyle = '#c0392b'; g.font = 'bold 22px sans-serif'; g.fillText('ВЫ ЗДЕСЬ ●', 330, 420);
      aged(); break;
    case 'slogan':
      g.fillStyle = '#9b1f16'; g.fillRect(0, 160, 512, 190);
      g.fillStyle = '#f0e6c8'; g.font = 'bold 34px sans-serif';
      g.fillText('ГРАЖДАНСКАЯ ОБОРОНА —', 256, 235); g.fillText('ДЕЛО ВСЕХ И КАЖДОГО!', 256, 300);
      aged(); break;
    case 'mosaic': {
      const cols = ['#c0392b', '#e8c547', '#2c6e9a', '#e8e4d6', '#3b7a3b', '#8a3a8a', '#d9822b'];
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
        const dx = x - 16, dy = y - 14, d = Math.hypot(dx, dy);
        let col = cols[Math.floor(r() * 3) + 2];
        if (d < 6) col = '#e8c547'; else if (Math.abs(Math.atan2(dy, dx) * 6 % 1.6) < 0.35 && d < 13) col = '#d9822b';
        if (y > 24) col = r() < 0.6 ? '#3b7a3b' : '#2c6e9a';
        if (r() < 0.05) continue; // выпавшая смальта
        g.fillStyle = col; g.fillRect(x * 16 + 1, y * 16 + 1, 14, 14);
      }
      g.fillStyle = '#a01e14'; g.beginPath(); // звезда
      for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? 22 : 55; g.lineTo(256 + Math.cos(a) * rr, 225 + Math.sin(a) * rr); } g.fill();
      aged(); break;
    }
    case 'panel':
      g.fillStyle = '#505a5e'; g.fillRect(40, 40, 432, 432);
      g.strokeStyle = '#2b3133'; g.lineWidth = 8; g.strokeRect(44, 44, 424, 424);
      for (let k = 0; k < 3; k++) { g.fillStyle = '#e0dccf'; g.beginPath(); g.arc(130 + k * 125, 170, 48, 0, 7); g.fill(); g.strokeStyle = '#111'; g.lineWidth = 4; g.beginPath(); g.moveTo(130 + k * 125, 170); g.lineTo(130 + k * 125 - 30 + k * 20, 140); g.stroke(); }
      ['#c0392b', '#2f8a2f', '#e8c547', '#c0392b', '#2f8a2f'].forEach((c, k) => { g.fillStyle = c; g.beginPath(); g.arc(110 + k * 72, 320, 18, 0, 7); g.fill(); });
      g.fillStyle = '#ddd'; g.font = 'bold 26px monospace'; g.fillText('ЩИТ ФВК · РЕЖИМ I-II-III', 256, 410);
      aged(); break;
    case 'graffiti':
      g.save(); g.translate(256, 256); g.rotate(-0.12);
      g.font = 'bold 74px sans-serif'; g.lineWidth = 12; g.strokeStyle = 'rgba(0,0,0,.6)'; g.strokeText(spot.text, 0, 20);
      g.fillStyle = spot.color; g.fillText(spot.text, 0, 20);
      g.restore();
      for (let i = 0; i < 40; i++) { g.fillStyle = spot.color; g.globalAlpha = 0.5; g.fillRect(60 + r() * 400, 290 + r() * 60, 2, 5 + r() * 40); }
      g.globalAlpha = 1; break;
    case 'portrait':
      g.fillStyle = '#6b4a1e'; g.fillRect(110, 30, 292, 400);
      g.fillStyle = '#c8b68a'; g.fillRect(130, 50, 252, 360);
      g.fillStyle = '#3a2e22'; g.beginPath(); g.ellipse(256, 190, 62, 78, 0, 0, 7); g.fill();
      g.beginPath(); g.moveTo(140, 410); g.quadraticCurveTo(256, 250, 372, 410); g.fill();
      g.fillStyle = '#c8b68a'; g.beginPath(); g.ellipse(256, 200, 44, 56, 0, 0, 7); g.fill();
      g.fillStyle = '#3a2e22'; g.fillRect(226, 190, 18, 6); g.fillRect(268, 190, 18, 6); g.fillRect(236, 232, 40, 8);
      g.fillStyle = '#b52a1e'; g.fillRect(110, 440, 292, 40); g.fillStyle = '#f0e6c8'; g.font = 'bold 26px sans-serif'; g.fillText('СЛАВА ТРУДУ!', 256, 470);
      aged(); break;
    case 'hermo':
      g.fillStyle = '#e8c547'; g.font = 'bold 60px sans-serif'; g.fillText('ЗД-1', 256, 120);
      g.fillStyle = '#c0392b'; g.font = 'bold 34px sans-serif'; g.fillText('ЗАКРЫВАТЬ ПЛОТНО', 256, 420);
      break;
  }
  const t = tex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return (cache[key] = t);
}

// текстура-подпись (табличка УБЕЖИЩЕ, ЧОП на спине и т.п.)
export function labelTexture(text, bg, fg, w = 256, h = 128, font = 'bold 44px sans-serif') {
  const key = 'lbl_' + text + bg + fg;
  if (cache[key]) return cache[key];
  const c = canvas(w, h), g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(8, 8, w - 16, h - 16);
  g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 2);
  const t = tex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return (cache[key] = t);
}

// мягкий градиент для объёмного луча фонаря
export function beamTexture() {
  if (cache.beam) return cache.beam;
  const c = canvas(64, 256), g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, 'rgba(255,255,255,0)');
  gr.addColorStop(0.75, 'rgba(255,255,255,.35)');
  gr.addColorStop(1, 'rgba(255,255,255,.9)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 256);
  const t = new THREE.CanvasTexture(c);
  return (cache.beam = t);
}
export function glowTexture() {
  if (cache.glow) return cache.glow;
  const c = canvas(64, 64), g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return (cache.glow = new THREE.CanvasTexture(c));
}
