/* Opportunity Hub — synthesized sound. UI Spec v2 section 14.4 to 14.6.
   No audio files: no licence risk, no weight, works offline. Every sound here has a visual twin,
   so sound never carries information alone. */

const NOTE = { C5:523.25, E5:659.25, G5:783.99, C6:1046.50, E6:1318.51, G6:1567.98 };

let ctx = null, master = null, comp = null, noiseBuf = null;
let volume = 0.7, muted = false, hoverBlips = false;
let live = 0;                     // polyphony counter
const MAX_VOICES = 8;
const PRIORITY = { save:5, levelup:5, delete:4, chime:4 };   // everything else = 1

/** Browsers require a user gesture. Call from the first click or keypress. */
export function init() {
  if (ctx) return ctx;
  const AC = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
  ctx = new AC({ latencyHint: 'interactive' });
  comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12; comp.ratio.value = 12;
  comp.attack.value = 0.003;   comp.release.value = 0.25;
  master = ctx.createGain();
  master.gain.value = gainNow();
  comp.connect(master).connect(ctx.destination);

  // 2 s of white noise, reused by every noise-based sound
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

const gainNow = () => (muted ? 0 : volume * volume * 0.6);   // master = volume squared * 0.6
export function setVolume(v) { volume = Math.min(1, Math.max(0, v)); if (master) master.gain.value = gainNow(); }
export function setMuted(m) { muted = !!m; if (master) master.gain.value = gainNow(); return muted; }
export function toggleMute() { return setMuted(!muted); }
export function setHoverBlips(on) { hoverBlips = !!on; }   // OFF by default, section 17.4
export const isMuted = () => muted;

/** Drop the lowest-priority sounds when more than 6 start inside 100 ms. */
function claim(name) {
  if (!ctx || muted) return false;
  if (live < 6) return true;
  if (live >= MAX_VOICES) return (PRIORITY[name] ?? 1) >= 4;
  return true;
}
function voice(ms) { live++; setTimeout(() => live--, ms + 40); }

/* ---- primitives ---- */
/**
 * @param {{type?: OscillatorType, from: number, to?: number, dur: number,
 *          gain?: number, at?: number, decay?: boolean}} opts
 */
function tone({ type = 'square', from, to, dur, gain = 0.1, at = 0, decay = false }) {
  const t = ctx.currentTime + at / 1000, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(from, t);
  if (to && to !== from) o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur / 1000);
  if (decay) { g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur / 1000); }
  else { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.004);
         g.gain.setValueAtTime(gain, t + dur / 1000 - 0.004); g.gain.linearRampToValueAtTime(0, t + dur / 1000); }
  o.connect(g).connect(comp);
  o.start(t); o.stop(t + dur / 1000 + 0.02);
}
/**
 * @param {{dur: number, gain?: number, at?: number, filter?: BiquadFilterType, freq?: number,
 *          q?: number, sweepTo?: number|null, fade?: 'in'|'bell'|null}} opts
 */
function noise({ dur, gain = 0.06, at = 0, filter = 'lowpass', freq = 2000, q = 1, sweepTo = null, fade = null }) {
  const t = ctx.currentTime + at / 1000;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const f = ctx.createBiquadFilter(); f.type = filter; f.Q.value = q;
  f.frequency.setValueAtTime(freq, t);
  if (sweepTo) f.frequency.linearRampToValueAtTime(sweepTo, t + dur / 1000);
  const g = ctx.createGain();
  if (fade === 'in')  { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + dur / 1000); }
  else if (fade === 'bell') { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + dur / 2000);
                              g.gain.linearRampToValueAtTime(0, t + dur / 1000); }
  else { g.gain.setValueAtTime(gain, t); g.gain.linearRampToValueAtTime(0, t + dur / 1000); }
  s.connect(f).connect(g).connect(comp);
  s.start(t); s.stop(t + dur / 1000 + 0.02);
}

/* ---- the kit. Names are what the UI calls, not what they sound like. ---- */
export const SFX = {
  hover()      { if (!hoverBlips || !claim('hover')) return; voice(20); tone({ from:660, dur:20, gain:0.04 }); },
  click()      { if (!claim('click')) return; voice(100); tone({ from:880, dur:40, gain:0.10 }); tone({ from:1320, dur:60, gain:0.10, at:40 }); },
  pressStart() { if (!claim('click')) return; voice(60); tone({ from:523, to:1047, dur:60, gain:0.10 }); },
  save()       { if (!claim('save')) return; voice(320);
                 tone({ from:NOTE.C6, dur:50, gain:0.12, decay:true });
                 tone({ from:NOTE.G6, dur:160, gain:0.12, at:50, decay:true });
                 tone({ type:'triangle', from:3136, dur:30, gain:0.04, at:120 }); },
  coin()       { if (!claim('save')) return; voice(300);
                 tone({ type:'sine', from:1568, dur:300, gain:0.10, decay:true });
                 tone({ type:'sine', from:2349, dur:300, gain:0.10, decay:true }); },
  back()       { if (!claim('back')) return; voice(110); tone({ from:440, dur:50, gain:0.08 }); tone({ from:330, dur:60, gain:0.08, at:50 }); },
  del()        { if (!claim('delete')) return; voice(190);
                 [880,740,622,523,440,349].forEach((f,i) => tone({ from:f, dur:30, gain:0.08, at:i*30 })); },
  levelUp()    { if (!claim('levelup')) return; voice(450);
                 [NOTE.C5,NOTE.E5,NOTE.G5].forEach((f,i) => tone({ from:f, dur:70, gain:0.12, at:i*70 }));
                 tone({ from:NOTE.C6, dur:240, gain:0.12, at:210, decay:true }); },
  chime()      { if (!claim('chime')) return; voice(320); tone({ type:'triangle', from:1318.5, dur:120, gain:0.08 });
                 tone({ type:'triangle', from:1760, dur:200, gain:0.08, at:120 }); },
  powerOn()    { if (!claim('power')) return; voice(220);
                 noise({ dur:120, gain:0.09, filter:'lowpass', freq:2000, fade:'in' });
                 tone({ from:60, dur:80, gain:0.09 });
                 tone({ type:'sine', from:2600, dur:40, gain:0.09, at:160 }); },
  powerOff()   { if (!claim('power')) return; voice(220);
                 tone({ type:'sine', from:400, to:40, dur:160, gain:0.08 });
                 tone({ type:'sine', from:2600, dur:40, gain:0.08, at:170 }); },
  notch()      { if (!claim('notch')) return; voice(40); tone({ from:120, dur:25, gain:0.12 }); noise({ dur:10, gain:0.06 }); },
  pin()        { if (!claim('pin')) return; voice(30);
                 noise({ dur:12, gain:0.10, filter:'highpass', freq:3000 }); tone({ from:1900, dur:8, gain:0.10 }); },
  pluck()      { if (!claim('pluck')) return; voice(280);
                 const pent = [392, 440, 523.25, 587.33, 659.25];
                 const f = pent[(Math.random() * pent.length) | 0];
                 tone({ type:'triangle', from:f, to:f * 0.97, dur:250, gain:0.08, decay:true }); },
  rustle()     { if (!claim('rustle')) return; voice(90); noise({ dur:80, gain:0.05, filter:'bandpass', freq:3000, q:1, fade:'bell' }); },
  crumple()    { if (!claim('crumple')) return; voice(240);
                 for (let i = 0; i < 5; i++) noise({ dur:20 + Math.random()*20, gain:0.09, freq:2500 - i*350, at:i*44 }); },
  drawer()     { if (!claim('drawer')) return; voice(230);
                 noise({ dur:180, gain:0.10, filter:'lowpass', freq:600, fade:'bell' });
                 tone({ from:90, dur:40, gain:0.07, at:180 }); },
  lamp()       { if (!claim('lamp')) return; voice(80);
                 tone({ from:1200, dur:6, gain:0.08 }); tone({ from:1200, dur:6, gain:0.08, at:60 }); noise({ dur:10, gain:0.05 }); },
  sip()        { if (!claim('sip')) return; voice(170);
                 tone({ type:'sine', from:300, to:600, dur:80, gain:0.05 });
                 tone({ type:'sine', from:300, to:600, dur:80, gain:0.05, at:90 }); },
  drop()       { if (!claim('drop')) return; voice(120);
                 tone({ type:'sine', from:900, to:1500, dur:70, gain:0.06 });
                 tone({ type:'sine', from:1200, to:700, dur:40, gain:0.06, at:70 }); },
  checkpoint() { if (!claim('checkpoint')) return; voice(280);
                 [NOTE.C6,NOTE.E6,NOTE.G6].forEach((f,i) => tone({ from:f, dur:50, gain:0.10, at:i*50 }));
                 tone({ type:'triangle', from:2093, dur:120, gain:0.10, at:150 }); },
  turn()       { if (!claim('turn')) return; voice(410); noise({ dur:400, gain:0.05, filter:'bandpass', freq:400, sweepTo:2000, q:1, fade:'bell' }); },
  /** Each bulb is one semitone above the last, up to 24. */
  bulb(n = 0)  { if (!claim('bulb')) return; voice(30); tone({ from:440 * Math.pow(2, Math.min(n,24)/12), dur:25, gain:0.06 }); },
  thud()       { if (!claim('thud')) return; voice(80); tone({ type:'sine', from:90, dur:60, gain:0.10, decay:true }); }
};

/* Suspend after 30 s idle: no battery burn on a tab nobody is looking at. */
let idle = null;
export function touch() {
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume();
  clearTimeout(idle);
  idle = setTimeout(() => { if (ctx && ctx.state === 'running' && live === 0) ctx.suspend(); }, 30000);
}
document.addEventListener('visibilitychange', () => {
  if (!ctx) return;
  if (document.hidden) ctx.suspend(); else ctx.resume();
});
