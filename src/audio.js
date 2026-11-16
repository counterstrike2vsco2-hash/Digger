// Синтез звука на WebAudio
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const AU = { ctx: null };
export function audioInit() {
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
export function tone(f, dur, o = {}) {
  if (!AU.ctx) return;
  const c = AU.ctx, t = c.currentTime + (o.delay || 0);
  const osc = c.createOscillator(), g = c.createGain();
  osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(f, t);
  if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f * o.slide), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(o.vol || 0.2, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g); g.connect(outNode(o.pan)); osc.start(t); osc.stop(t + dur + 0.05);
}
export function noise(dur, o = {}) {
  if (!AU.ctx) return;
  const c = AU.ctx, t = c.currentTime + (o.delay || 0);
  const src = c.createBufferSource(); src.buffer = AU.noise;
  const f = c.createBiquadFilter(); f.type = o.type || 'bandpass'; f.frequency.value = o.freq || 1000; f.Q.value = o.q || 1;
  const g = c.createGain();
  g.gain.setValueAtTime(o.vol || 0.2, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(outNode(o.pan));
  src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
}
export const SFX = {
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

