// Синтезированные звуки (WebAudio): никаких файлов, всё генерируется на лету.
let ctx = null, master = null, noiseBuf = null;
const last = {};

export function audioInit() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.55;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp); comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { ctx = null; }
}
export function setVolume(v) { if (master) master.gain.value = v; }

// не чаще, чем раз в minGap секунд для одного типа звука
function gate(name, minGap) {
  if (!ctx) return false;
  const t = ctx.currentTime;
  if (last[name] && t - last[name] < minGap) return false;
  last[name] = t; return true;
}
function noise(dur, filterType, f0, f1, vol, q = 1) {
  const t = ctx.currentTime;
  const src = ctx.createBufferSource(); src.buffer = noiseBuf;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter(); f.type = filterType; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
}
function tone(type, f0, f1, dur, vol, delay = 0) {
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
}

export const SFX = {
  thud(v) { // удар тела/предмета, v — скорость удара
    if (!gate('thud', 0.045)) return;
    const vol = Math.min(0.9, 0.08 + v * 0.05);
    noise(0.12 + Math.min(0.2, v * 0.015), 'lowpass', 300 + v * 60, 80, vol);
    if (v > 6) tone('sine', 110, 45, 0.15, vol * 0.6);
  },
  crate(v) { if (!gate('crate', 0.06)) return; noise(0.09, 'bandpass', 900 + v * 50, 300, Math.min(0.7, 0.1 + v * 0.05), 2); },
  metal(v) { if (!gate('metal', 0.07)) return; const f = 500 + Math.random() * 300; tone('triangle', f, f * 0.97, 0.35, Math.min(0.35, 0.05 + v * 0.03)); tone('sine', f * 2.7, f * 2.6, 0.25, Math.min(0.15, v * 0.02)); },
  ouch() { // мультяшное «ой»
    if (!gate('ouch', 0.18)) return;
    const f = 380 + Math.random() * 260;
    tone('square', f, f * 0.55, 0.22, 0.07); tone('sine', f * 1.5, f * 0.8, 0.2, 0.05);
  },
  die() { if (!gate('die', 0.3)) return; const f = 300 + Math.random() * 100; tone('sawtooth', f, f * 0.3, 0.7, 0.06); },
  explode(power = 1) {
    if (!ctx) return;
    noise(1.4, 'lowpass', 2400, 60, 0.9 * power);
    noise(0.25, 'highpass', 3000, 800, 0.35 * power);
    tone('sine', 90, 28, 0.9, 0.8 * power);
  },
  shot() { if (!gate('shot', 0.03)) return; noise(0.16, 'bandpass', 2600, 500, 0.6, 0.8); tone('square', 180, 60, 0.07, 0.2); },
  rocket() { if (!ctx) return; noise(0.6, 'bandpass', 600, 2400, 0.35, 1.5); },
  spawn() { if (!gate('spawn', 0.05)) return; tone('sine', 300, 700, 0.12, 0.15); },
  boing() { if (!gate('boing', 0.08)) return; tone('sine', 140, 520, 0.35, 0.3); tone('triangle', 280, 900, 0.2, 0.08); },
  click() { if (!gate('click', 0.03)) return; tone('square', 900, 700, 0.03, 0.05); },
  erase() { if (!gate('erase', 0.05)) return; tone('sine', 600, 120, 0.15, 0.18); },
  beep(f = 1200) { if (!ctx) return; tone('square', f, f, 0.06, 0.06); },
  pin() { if (!gate('pin', 0.05)) return; noise(0.05, 'highpass', 4000, 2000, 0.3); tone('triangle', 1400, 1300, 0.12, 0.12); },
  splat() { if (!gate('splat', 0.08)) return; noise(0.18, 'lowpass', 900, 200, 0.25, 3); },
  gun(kind) {
    if (!gate('gun', 0.04)) return;
    if (kind === 'shotgun') { noise(0.35, 'lowpass', 3000, 150, 0.9, 0.7); tone('sine', 120, 40, 0.2, 0.5); }
    else if (kind === 'rifle') { noise(0.12, 'bandpass', 2000, 400, 0.6, 0.7); tone('square', 150, 50, 0.06, 0.18); }
    else { noise(0.16, 'bandpass', 2600, 500, 0.6, 0.8); tone('square', 180, 60, 0.07, 0.2); }
  },
  stab() { if (!gate('stab', 0.06)) return; noise(0.08, 'bandpass', 1800, 600, 0.35, 2); noise(0.15, 'lowpass', 700, 150, 0.25, 2); },
  crack() { if (!gate('crack', 0.08)) return; noise(0.05, 'highpass', 2500, 1500, 0.6, 1); tone('square', 700, 200, 0.04, 0.12); },
  weld() { if (!gate('weld', 0.05)) return; noise(0.25, 'highpass', 5000, 3000, 0.25, 1); },
  freeze() { if (!gate('freeze', 0.05)) return; tone('sine', 1800, 2600, 0.25, 0.08); tone('triangle', 2400, 3600, 0.18, 0.05, 0.05); },
  rope() { if (!gate('rope', 0.05)) return; noise(0.1, 'bandpass', 1200, 900, 0.25, 4); },
};
