// Пресеты графики + автоопределение видеокарты.
// Пресет выбирается один раз при загрузке страницы (смена = перезагрузка),
// чтобы не держать в сцене «лишние» источники света и шейдеры.
import * as THREE from 'three';

export const PRESETS = {
  // R7 350 DDR3, Vega 8 (Ryzen 3 3200G), GT 710–740, Intel HD/UHD
  potato: {
    label: 'Слабый ПК', lite: true, aa: false, shadows: false, shadowMap: 0, shadowSoft: false,
    lamps: 2, guardSpots: 1, fill: false, moon: false, dust: 0, bump: false, aniso: 2,
    rocks: 140, papers: 60, beamSeg: 10, scaleMin: 0.5, scaleMax: 0.85, scaleStart: 0.7, far: 30, targetFps: 55,
  },
  low: {
    label: 'Низкая', lite: true, aa: false, shadows: false, shadowMap: 0, shadowSoft: false,
    lamps: 2, guardSpots: 1, fill: true, moon: true, dust: 0, bump: false, aniso: 2,
    rocks: 220, papers: 80, beamSeg: 12, scaleMin: 0.55, scaleMax: 1.0, scaleStart: 0.85, far: 34, targetFps: 55,
  },
  medium: {
    label: 'Средняя', lite: false, aa: false, shadows: true, shadowMap: 512, shadowSoft: false,
    lamps: 3, guardSpots: 2, fill: true, moon: true, dust: 120, bump: true, aniso: 4,
    rocks: 400, papers: 120, beamSeg: 20, scaleMin: 0.6, scaleMax: 1.0, scaleStart: 1.0, far: 40, targetFps: 55,
  },
  high: {
    label: 'Высокая', lite: false, aa: true, shadows: true, shadowMap: 1024, shadowSoft: true,
    lamps: 4, guardSpots: 2, fill: true, moon: true, dust: 260, bump: true, aniso: 8,
    rocks: 500, papers: 120, beamSeg: 24, scaleMin: 0.7, scaleMax: 1.5, scaleStart: 1.25, far: 50, targetFps: 55,
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
export function autoPreset() {
  const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if (WEAK.test(GPU)) return 'potato';
  if (touch) return 'low';
  if (STRONG.test(GPU)) return 'high';
  return 'medium';
}

const saved = localStorage.getItem('digger3d_q2');
export const QNAME = PRESETS[saved] ? saved : autoPreset();
export const QP = PRESETS[QNAME];
export const AUTO = !PRESETS[saved];

export function setPreset(name) {
  if (name === 'auto') localStorage.removeItem('digger3d_q2');
  else localStorage.setItem('digger3d_q2', name);
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
