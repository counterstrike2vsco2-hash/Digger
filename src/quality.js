// Настройки графики + режим производительности для слабых ПК.
// Смена пресета = перезагрузка страницы (чтобы не держать лишние шейдеры и тени).
import * as THREE from 'three';

export const PRESETS = {
  // R7 350 DDR3, Vega 8 (Ryzen 3 3200G), GT 710–740, Intel HD/UHD
  perf:   { label: 'Производительность', lite: true,  aa: false, shadows: false, shadowMap: 0,    soft: false, particles: 260, maxRagdolls: 20, blobs: true,  expLight: false },
  low:    { label: 'Низкая',             lite: true,  aa: false, shadows: false, shadowMap: 0,    soft: false, particles: 400, maxRagdolls: 30, blobs: true,  expLight: true },
  medium: { label: 'Средняя',            lite: false, aa: true,  shadows: true,  shadowMap: 1024, soft: false, particles: 600, maxRagdolls: 35, blobs: false, expLight: true },
  high:   { label: 'Высокая',            lite: false, aa: true,  shadows: true,  shadowMap: 2048, soft: true,  particles: 900, maxRagdolls: 45, blobs: false, expLight: true },
};

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
export function autoPreset() {
  const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if (WEAK_GPU || touch) return 'low';
  if (STRONG.test(GPU)) return 'high';
  return 'medium';
}

// режим производительности: '1' — вкл, '0' — выкл, нет ключа — по видеокарте
const perfSaved = localStorage.getItem('rag_perf');
export const PERF_AUTO = perfSaved !== '1' && perfSaved !== '0';
export const PERF = PERF_AUTO ? WEAK_GPU : perfSaved === '1';

const saved = localStorage.getItem('rag_q');
export const AUTO = !(saved in PRESETS) || saved === 'perf';
export const QUALITY = AUTO ? autoPreset() : saved;
export const QNAME = PERF ? 'perf' : QUALITY;
export const QP = PRESETS[QNAME];

export function setPreset(name) {
  if (name === 'auto') localStorage.removeItem('rag_q'); else localStorage.setItem('rag_q', name);
  location.reload();
}
export function setPerf(on) { localStorage.setItem('rag_perf', on ? '1' : '0'); location.reload(); }

// материалы: на слабых пресетах — дешёвый Lambert
const PBR_ONLY = ['roughness', 'metalness', 'roughnessMap', 'metalnessMap', 'envMapIntensity'];
const cache = new Map();
export function mat(opts = {}, key) {
  if (key && cache.has(key)) return cache.get(key);
  const o = Object.assign({}, opts);
  let m;
  if (QP.lite) { for (const k of PBR_ONLY) delete o[k]; m = new THREE.MeshLambertMaterial(o); }
  else m = new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.75, metalness: 0 }, o));
  if (key) cache.set(key, m);
  return m;
}

// пользовательские опции (без перезагрузки)
export const OPT = {
  blood: localStorage.getItem('rag_blood') !== '0',
  dismember: localStorage.getItem('rag_dism') !== '0',
  getup: localStorage.getItem('rag_getup') !== '0',
  fps: localStorage.getItem('rag_fps') === '1',
};
export function saveOpt(k, v) {
  OPT[k] = v;
  localStorage.setItem({ blood: 'rag_blood', dismember: 'rag_dism', getup: 'rag_getup', fps: 'rag_fps' }[k], v ? '1' : '0');
}
