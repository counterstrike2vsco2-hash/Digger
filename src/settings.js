// Настройки: режим производительности (авто по видеокарте) и пользовательские опции.
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
export const GPU = detectGPU();
export const WEAK_GPU = WEAK.test(GPU);

const perfSaved = localStorage.getItem('rl_perf');
export const PERF_AUTO = perfSaved !== '1' && perfSaved !== '0';
export const PERF = PERF_AUTO ? WEAK_GPU : perfSaved === '1';
export function setPerf(on) { localStorage.setItem('rl_perf', on ? '1' : '0'); location.reload(); }

export const QP = PERF
  ? { particles: 700, stainPx: 16, maxHumans: 30, vIter: 6, pIter: 2, smoke: 0.5, glow: false }
  : { particles: 2000, stainPx: 28, maxHumans: 60, vIter: 8, pIter: 3, smoke: 1, glow: true };

const KEYS = { blood: 'rl_blood', gore: 'rl_gore', getup: 'rl_getup', fps: 'rl_fps', sound: 'rl_sound' };
export const OPT = {
  blood: localStorage.getItem(KEYS.blood) !== '0',
  gore: localStorage.getItem(KEYS.gore) !== '0',
  getup: localStorage.getItem(KEYS.getup) !== '0',
  fps: localStorage.getItem(KEYS.fps) === '1',
  sound: localStorage.getItem(KEYS.sound) !== '0',
};
export function saveOpt(k, v) { OPT[k] = v; localStorage.setItem(KEYS[k], v ? '1' : '0'); }
