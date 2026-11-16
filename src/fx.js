// Частицы (кровь, искры, дым, огонь, гильзы, обломки) и слой пятен крови/копоти.
import { QP, OPT } from './settings.js';

export const WORLD = { x0: -40, x1: 40, top: 32 };
const parts = [];
export const tracers = [];
export const rings = [];
let stainCanvas, sctx, SPX;

export function initStains() {
  SPX = QP.stainPx;
  stainCanvas = document.createElement('canvas');
  stainCanvas.width = Math.ceil((WORLD.x1 - WORLD.x0) * SPX);
  stainCanvas.height = Math.ceil((WORLD.top + 1) * SPX);
  sctx = stainCanvas.getContext('2d');
}
export function clearStains() { sctx.clearRect(0, 0, stainCanvas.width, stainCanvas.height); }
const sx = x => (x - WORLD.x0) * SPX, sy = y => (WORLD.top - y) * SPX;

export function stain(x, y, r, color, flat) {
  sctx.fillStyle = color;
  sctx.beginPath();
  if (flat === 'floor') sctx.ellipse(sx(x), sy(y), r * SPX * 1.8, Math.max(1, r * SPX * 0.5), 0, 0, 7);
  else if (flat === 'wall') sctx.ellipse(sx(x), sy(y), Math.max(1, r * SPX * 0.5), r * SPX * 1.6, 0, 0, 7);
  else sctx.arc(sx(x), sy(y), r * SPX, 0, 7);
  sctx.fill();
}
export function scorch(x, y, R) {
  const g = sctx.createRadialGradient(sx(x), sy(y), 0, sx(x), sy(y), R * SPX);
  g.addColorStop(0, 'rgba(15,12,10,0.75)'); g.addColorStop(1, 'rgba(15,12,10,0)');
  sctx.fillStyle = g; sctx.beginPath(); sctx.ellipse(sx(x), sy(y), R * SPX, R * SPX * 0.6, 0, 0, 7); sctx.fill();
}
/** рисует видимую часть слоя пятен (ctx в мировых координатах, y вверх) */
export function drawStains(ctx, v) {
  const x0 = Math.max(WORLD.x0, v.x0), x1 = Math.min(WORLD.x1, v.x1);
  const y0 = Math.max(-1, v.y0), y1 = Math.min(WORLD.top, v.y1);
  if (x1 <= x0 || y1 <= y0) return;
  ctx.save(); ctx.scale(1, -1);
  ctx.drawImage(stainCanvas, sx(x0), sy(y1), (x1 - x0) * SPX, (y1 - y0) * SPX, x0, -y1, x1 - x0, y1 - y0);
  ctx.restore();
}

// ---------- частицы ----------
// type: 0 кровь, 1 искра, 2 дым, 3 огонь, 4 гильза, 5 обломок, 6 вспышка
function add(p) {
  if (parts.length >= QP.particles) { if (p.type === 2 || p.type === 0) return; parts.shift(); }
  parts.push(p);
}
const BLOOD = ['#8a0c0c', '#a01010', '#760808', '#951212'];
export function blood(x, y, vx, vy, n, spread = 2.5) {
  if (!OPT.blood) return;
  for (let i = 0; i < n; i++) {
    add({ type: 0, x, y, vx: vx + (Math.random() - 0.5) * spread, vy: vy + (Math.random() - 0.5) * spread, life: 3, size: 0.012 + Math.random() * 0.022, color: BLOOD[i & 3] });
  }
}
export function sparks(x, y, nx, ny, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.atan2(ny, nx) + (Math.random() - 0.5) * 1.8, s = 3 + Math.random() * 7;
    add({ type: 1, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.2 + Math.random() * 0.3, size: 0.02, color: '#ffd27a' });
  }
}
export function dust(x, y, nx, ny, n, color = '#8a8478') {
  for (let i = 0; i < n; i++) {
    const a = Math.atan2(ny, nx) + (Math.random() - 0.5) * 1.6, s = 1 + Math.random() * 3;
    add({ type: 5, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.6 + Math.random() * 0.5, size: 0.02 + Math.random() * 0.02, color, rot: 0, vr: 0 });
  }
}
export function smoke(x, y, n, R = 1, dark = 0.3) {
  n = Math.ceil(n * QP.smoke);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.283, s = Math.random() * R * 1.6;
    const g = Math.floor(40 + Math.random() * 50 * (1 - dark));
    add({ type: 2, x: x + Math.cos(a) * R * 0.3 * Math.random(), y: y + Math.sin(a) * R * 0.3 * Math.random(), vx: Math.cos(a) * s, vy: Math.sin(a) * s + 0.6,
      life: 1.6 + Math.random() * 1.8, max: 3.4, size: R * (0.25 + Math.random() * 0.35), color: `${g},${g},${g}` });
  }
}
export function fire(x, y, n, R) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.283, s = Math.random() * R * 5;
    add({ type: 3, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s + 1, life: 0.25 + Math.random() * 0.35, max: 0.6, size: R * (0.2 + Math.random() * 0.3) });
  }
}
export function flash(x, y, size) { add({ type: 6, x, y, vx: 0, vy: 0, life: 0.06, max: 0.06, size }); }
export function shell(x, y, dir) {
  add({ type: 4, x, y, vx: -dir * (1 + Math.random() * 1.5), vy: 2 + Math.random() * 1.5, life: 2.5, size: 0.02, rot: 0, vr: (Math.random() - 0.5) * 30, color: '#d4a640' });
}
export function debris(x, y, n, color, speed = 8) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.283, s = speed * (0.3 + Math.random());
    add({ type: 5, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s + 2, life: 1.5 + Math.random(), size: 0.03 + Math.random() * 0.05, color, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 20 });
  }
}
export function tracer(x0, y0, x1, y1) { tracers.push({ x0, y0, x1, y1, life: 0.07 }); }
export function ring(x, y, R) { rings.push({ x, y, R, life: 0.35 }); }
export function particleCount() { return parts.length; }
export function clearParticles() { parts.length = 0; tracers.length = 0; rings.length = 0; }

export function updateFX(dt, g) {
  let w = 0;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    p.life -= dt;
    if (p.life <= 0) continue;
    if (p.type === 2) { p.vx *= 1 - 1.5 * dt; p.vy = p.vy * (1 - 1.5 * dt) + 0.8 * dt; p.size += dt * 0.5; }
    else if (p.type === 3) { p.vx *= 1 - 4 * dt; p.vy = p.vy * (1 - 4 * dt) + 3 * dt; }
    else if (p.type !== 6) { p.vy += g * dt; p.vx *= 1 - 0.3 * dt; }
    if (p.rot !== undefined) p.rot += p.vr * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    // столкновение с полом и стенами
    if (p.type === 0) {
      if (p.y <= 0) { stain(p.x, 0.02, p.size * 1.6, p.color, 'floor'); continue; }
      if (p.x <= WORLD.x0 + 0.02 || p.x >= WORLD.x1 - 0.02) { stain(p.x, p.y, p.size * 1.4, p.color, 'wall'); continue; }
    } else if (p.y <= 0 && (p.type === 1 || p.type === 4 || p.type === 5)) {
      p.y = 0; p.vy *= -0.35; p.vx *= 0.6; if (p.vr) p.vr *= 0.5;
      if (p.type === 1) p.life = Math.min(p.life, 0.1);
    }
    parts[w++] = p;
  }
  parts.length = w;
  for (let i = tracers.length - 1; i >= 0; i--) if ((tracers[i].life -= dt) <= 0) tracers.splice(i, 1);
  for (let i = rings.length - 1; i >= 0; i--) if ((rings[i].life -= dt) <= 0) rings.splice(i, 1);
}

export function drawFX(ctx, v, px) {
  const m = 1;
  // дым — снизу, обычная прозрачность
  for (const p of parts) {
    if (p.x < v.x0 - m - p.size || p.x > v.x1 + m + p.size || p.y < v.y0 - m - p.size || p.y > v.y1 + m + p.size) continue;
    if (p.type === 2) {
      const a = Math.min(1, p.life / p.max * 2) * 0.35;
      ctx.fillStyle = `rgba(${p.color},${a})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 7); ctx.fill();
    }
  }
  for (const p of parts) {
    if (p.type === 2) continue;
    if (p.x < v.x0 - m || p.x > v.x1 + m || p.y < v.y0 - m || p.y > v.y1 + m) continue;
    switch (p.type) {
      case 0: ctx.fillStyle = p.color; ctx.fillRect(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2); break;
      case 1: { ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(0.015, 1.5 / px); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.02, p.y - p.vy * 0.02); ctx.stroke(); break; }
      case 3: {
        const k = p.life / p.max;
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = k > 0.65 ? `rgba(255,200,90,${k * 0.6})` : k > 0.3 ? `rgba(255,110,25,${k * 0.6})` : `rgba(140,40,10,${k * 0.8})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.6 + k * 0.6), 0, 7); ctx.fill();
        ctx.globalCompositeOperation = 'source-over'; break;
      }
      case 4: case 5: {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.color;
        ctx.fillRect(-p.size, -p.size * (p.type === 4 ? 0.45 : 0.7), p.size * 2, p.size * (p.type === 4 ? 0.9 : 1.4)); ctx.restore(); break;
      }
      case 6: {
        ctx.fillStyle = 'rgba(255,230,150,0.9)'; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,230,1)'; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 0.45, 0, 7); ctx.fill(); break;
      }
    }
  }
  if (tracers.length) {
    ctx.strokeStyle = 'rgba(255,230,160,0.8)'; ctx.lineWidth = Math.max(0.012, 1.5 / px); ctx.beginPath();
    for (const t of tracers) { ctx.moveTo(t.x0, t.y0); ctx.lineTo(t.x1, t.y1); }
    ctx.stroke();
  }
  for (const r of rings) {
    const k = 1 - r.life / 0.35;
    ctx.strokeStyle = `rgba(255,255,255,${0.5 * (1 - k)})`; ctx.lineWidth = 0.15 * (1 - k) + 0.02;
    ctx.beginPath(); ctx.arc(r.x, r.y, r.R * k, 0, 7); ctx.stroke();
  }
}
