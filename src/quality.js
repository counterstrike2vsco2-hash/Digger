// Пресеты графики + автоопределение видеокарты.
// Пресет выбирается один раз при загрузке страницы (смена = перезагрузка),
// чтобы не держать в сцене «лишние» источники света и шейдеры.
import * as THREE from 'three';

export const PRESETS = {
  // R7 350 DDR3, Vega 8 (Ryzen 3 3200G), GT 710–740, Intel HD/UHD
  potato: {
    label: 'Режим производительности', lite: true, aa: false, shadows: false, shadowMap: 0, shadowSoft: false,
    lamps: 2, guardSpots: 1, fill: false, moon: false, dust: 0, bump: false, aniso: 2,
    rocks: 140, papers: 60, beamSeg: 10, far: 30,
  },
  low: {
    label: 'Низкая', lite: true, aa: false, shadows: false, shadowMap: 0, shadowSoft: false,
    lamps: 2, guardSpots: 1, fill: true, moon: true, dust: 0, bump: false, aniso: 2,
    rocks: 220, papers: 80, beamSeg: 12, far: 34,
  },
  medium: {
    label: 'Средняя', lite: false, aa: false, shadows: true, shadowMap: 512, shadowSoft: false,
    lamps: 3, guardSpots: 2, fill: true, moon: true, dust: 120, bump: true, aniso: 4,
    rocks: 400, papers: 120, beamSeg: 20, far: 40,
  },
  high: {
    label: 'Высокая', lite: false, aa: true, shadows: true, shadowMap: 1024, shadowSoft: true,
    lamps: 4, guardSpots: 2, fill: true, moon: true, dust: 260, bump: true, aniso: 8,
    rocks: 500, papers: 120, beamSeg: 24, far: 50,
  },
};

// --- какая видеокарта?
export function detectGPU() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return '';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const s = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return String(s || '');
  } catch (e) { return ''; }
}
const WEAK = /R7 ?[23]\d\d|R5 ?[23]\d\d|R9 ?2[0-7]\d|HD ?[5-8]\d\d\d|Vega ?(3|6|8|9|10|11)\b|Radeon\(TM\) (R\d )?Graphics|Radeon Graphics|Intel|HD Graphics|UHD|Iris|GT ?[1-7]\d\d\b|GTX ?[4-7]\d\d\b|MX ?\d\d\d|Mali|Adreno|PowerVR|SwiftShader|llvmpipe|Microsoft Basic/i;
const STRONG = /RTX|GTX ?(10[6-8]0|16\d0|9[78]0)|RX ?(5[5-9]\d\d|6\d\d\d|7\d\d\d|Vega ?(56|64))|Radeon ?VII|Apple M\d|Arc A[57]/i;

export const GPU = detectGPU();
export const WEAK_GPU = WEAK.test(GPU);
// качество графики (когда режим производительности выключен)
export function autoPreset() {
  const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if (WEAK_GPU || touch) return 'low';
  if (STRONG.test(GPU)) return 'high';
  return 'medium';
}

// Режим производительности для слабых ПК: '1' — вкл, '0' — выкл, нет ключа — по видеокарте
const perfSaved = localStorage.getItem('digger3d_perf');
export const PERF_AUTO = perfSaved !== '1' && perfSaved !== '0';
export const PERF = PERF_AUTO ? WEAK_GPU : perfSaved === '1';

const saved = localStorage.getItem('digger3d_q2');
export const AUTO = !(saved in PRESETS) || saved === 'potato';
export const QUALITY = AUTO ? autoPreset() : saved;      // выбранное качество (без режима производительности)
export const QNAME = PERF ? 'potato' : QUALITY;           // что реально используется
export const QP = PRESETS[QNAME];

export function setPreset(name) {
  if (name === 'auto') localStorage.removeItem('digger3d_q2');
  else localStorage.setItem('digger3d_q2', name);
  location.reload();
}
export function setPerf(on) {
  localStorage.setItem('digger3d_perf', on ? '1' : '0');
  location.reload();
}

// --- фабрика материалов: на слабых пресетах — дешёвый Lambert без рельефа
const PBR_ONLY = ['roughness', 'metalness', 'roughnessMap', 'metalnessMap', 'envMapIntensity'];
export function stdMat(opts = {}) {
  const o = Object.assign({}, opts);
  if (!QP.bump) { delete o.bumpMap; delete o.bumpScale; }
  if (QP.lite) {
    for (const k of PBR_ONLY) delete o[k];
    return new THREE.MeshLambertMaterial(o);
  }
  return new THREE.MeshStandardMaterial(o);
}
// вода: на слабом железе — Phong (дешёвый блик вместо PBR)
export function waterMat(opts) {
  if (QP.lite) {
    const o = Object.assign({}, opts); for (const k of PBR_ONLY) delete o[k];
    if (!QP.bump) { delete o.bumpMap; delete o.bumpScale; }
    return new THREE.MeshPhongMaterial(Object.assign(o, { shininess: 80, specular: 0x557070 }));
  }
  return new THREE.MeshStandardMaterial(opts);
}
