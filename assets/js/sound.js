// nfa sound: a slow, cold track written in code with the Web Audio API, the hall's hum and a few small machine noises.
// Nothing is downloaded. Browsers only allow sound after a click or a key, so it starts on the first one.
const PROG = [                                            // Em9 · Cmaj9 · Am9 · Bsus4, two bars each, 64 bpm
  { bass: 28, pad: [52, 55, 59, 62, 66], arp: [64, 66, 67, 71, 74, 76] },
  { bass: 24, pad: [48, 52, 55, 59, 62], arp: [64, 67, 69, 71, 74, 76] },
  { bass: 33, pad: [45, 52, 55, 59, 60], arp: [64, 67, 69, 71, 72, 76] },
  { bass: 35, pad: [47, 52, 54, 59, 64], arp: [64, 66, 69, 71, 73, 76] },
];
const BPM = 64, BEAT = 60 / BPM, BAR = BEAT * 4;
const hz = m => 440 * Math.pow(2, (m - 69) / 12);
const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
};

export function createSound() {
  let ctx = null, master, musicBus, sfxBus, verb, echo, noiseBuf, hum = null, started = false, timer = 0;
  let muted = store.get('nfa:mute') === '1', vol = .62, scene = 'hall';
  let step = 0, nextT = 0, seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const listeners = new Set();
  const running = () => !!ctx && started && ctx.state === 'running';
  const emit = () => listeners.forEach(f => f({ muted, on: running() }));
  function impulse(sec, decay) {
    const n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay); }
    return b;
  }
  function init() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
    try { ctx = new AC(); } catch { return false; }
    ctx.onstatechange = () => emit();
    master = ctx.createGain(); master.gain.value = muted ? 0 : vol;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -20; comp.ratio.value = 3; master.connect(comp).connect(ctx.destination);
    verb = ctx.createConvolver(); verb.buffer = impulse(3.4, 2.6); const vg = ctx.createGain(); vg.gain.value = .22; verb.connect(vg).connect(master);
    echo = ctx.createDelay(2); echo.delayTime.value = BEAT * .75; const fb = ctx.createGain(); fb.gain.value = .24; const eg = ctx.createGain(); eg.gain.value = .14;
    echo.connect(fb).connect(echo); echo.connect(eg).connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = 0; musicBus.connect(master); musicBus.connect(verb);
    sfxBus = ctx.createGain(); sfxBus.gain.value = .8; sfxBus.connect(master); sfxBus.connect(verb);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    return true;
  }
  const env = (g, t, a, peak, d, sus, r, end) => { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.setTargetAtTime(sus, t + a, d); g.gain.setTargetAtTime(0, end, r); };
  function pad(notes, t, len, level) {
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1150; lp.Q.value = .4;
    const g = ctx.createGain(); env(g, t, 2.4, level, 1.8, level * .8, 1.2, t + len); lp.connect(g).connect(musicBus);
    notes.forEach(m => [-4, 4].forEach(cents => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(m); o.detune.value = cents; const og = ctx.createGain(); og.gain.value = .06; o.connect(og).connect(lp); o.start(t); o.stop(t + len + 5); }));
  }
  function bell(m, t, level) {
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(level, t + .008); g.gain.exponentialRampToValueAtTime(.0004, t + 2.4);
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = hz(m);
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = hz(m) * 3.01; const g2 = ctx.createGain(); g2.gain.value = .08;
    o.connect(g); o2.connect(g2).connect(g); g.connect(musicBus); g.connect(echo);
    o.start(t); o2.start(t); o.stop(t + 2.5); o2.stop(t + 2.5);
  }
  function bass(m, t, len, level) {
    const g = ctx.createGain(); env(g, t, .3, level, .8, level * .7, .6, t + len - .2);
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = hz(m); o.connect(g).connect(musicBus); o.start(t); o.stop(t + len + 1.5);
  }
  function noise(t, dur, type, freq, q, level, bus) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(level, t); g.gain.exponentialRampToValueAtTime(.0004, t + dur);
    s.connect(f).connect(g).connect(bus || sfxBus); s.start(t, rnd() * 1.5); s.stop(t + dur + .05);
  }
  function tick(t, level) { noise(t, .03, 'highpass', 6500, .8, level, musicBus); }
  function schedule() {
    const ahead = ctx.currentTime + .3;
    while (nextT < ahead) {
      const t = nextT, s16 = step % 16, bar = Math.floor(step / 16), ch = PROG[Math.floor(bar / 2) % 4], term = scene === 'term';
      if (step % 32 === 0) { pad(ch.pad, t, BAR * 2, term ? .05 : .06); bass(ch.bass, t, BAR * 2, term ? .1 : .13); }
      if (s16 % 4 === 2 && rnd() < (term ? .42 : .3)) bell(ch.arp[Math.floor(rnd() * ch.arp.length)], t + (rnd() - .5) * .03, term ? .035 : .04);
      if (term && s16 % 2 === 0 && rnd() < .5) tick(t, .012 + (s16 % 8 === 0 ? .008 : 0));
      nextT += BEAT / 4; step++;
    }
  }
  function startHum() {                       // the hall: air handlers and a low electrical hum
    if (hum) return;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    const g = ctx.createGain(); g.gain.value = 0; g.gain.setTargetAtTime(scene === 'hall' ? .09 : .02, ctx.currentTime, 2);
    const o = ctx.createOscillator(); o.frequency.value = 60; const og = ctx.createGain(); og.gain.value = .07; o.connect(og).connect(g);
    s.connect(lp).connect(g).connect(master); s.start(); o.start();
    hum = { g };
  }
  function startMusic() {
    if (timer) return;
    nextT = ctx.currentTime + .2; step = 0;
    musicBus.gain.setValueAtTime(0, ctx.currentTime); musicBus.gain.linearRampToValueAtTime(scene === 'term' ? .42 : .55, ctx.currentTime + 4);
    timer = setInterval(schedule, 70); schedule();
  }
  const SFX = {
    power: t => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(140, t + .25); g.gain.setValueAtTime(.18, t); g.gain.exponentialRampToValueAtTime(.001, t + .5); o.connect(g).connect(sfxBus); o.start(t); o.stop(t + .55); },
    beep: t => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = 1320; g.gain.setValueAtTime(.04, t); g.gain.exponentialRampToValueAtTime(.0005, t + .16); o.connect(g).connect(sfxBus); o.start(t); o.stop(t + .18); },
    tick: t => noise(t, .018, 'highpass', 5200, .7, .04),
    key: t => { noise(t, .025, 'bandpass', 3000 + rnd() * 1200, 1.6, .045); },
    whoosh: t => { const s = ctx.createBufferSource(); s.buffer = noiseBuf; const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = .8; f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(1800, t + 1.4); const g = ctx.createGain(); g.gain.setValueAtTime(.001, t); g.gain.exponentialRampToValueAtTime(.06, t + .7); g.gain.exponentialRampToValueAtTime(.001, t + 2.2); s.connect(f).connect(g).connect(sfxBus); s.start(t); s.stop(t + 2.3); },
    scan: t => { [0, .09, .18].forEach((d, i) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'triangle'; o.frequency.value = [1568, 1976, 2349][i]; g.gain.setValueAtTime(.025, t + d); g.gain.exponentialRampToValueAtTime(.0004, t + d + .25); o.connect(g).connect(sfxBus); o.connect(echo); o.start(t + d); o.stop(t + d + .3); }); },
    dive: t => { const o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(720, t + 1.8); og.gain.setValueAtTime(.001, t); og.gain.exponentialRampToValueAtTime(.07, t + 1.5); og.gain.exponentialRampToValueAtTime(.001, t + 2.0); o.connect(og).connect(sfxBus); o.start(t); o.stop(t + 2.1); noise(t + .2, 1.8, 'bandpass', 900, .6, .05); },
    ok: t => { [76, 83].forEach((m, i) => { const at = t + i * .09, o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = hz(m); g.gain.setValueAtTime(.045, at); g.gain.exponentialRampToValueAtTime(.0005, at + .7); o.connect(g).connect(sfxBus); o.start(at); o.stop(at + .75); }); },
    err: t => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'square'; o.frequency.value = 180; g.gain.setValueAtTime(.025, t); g.gain.exponentialRampToValueAtTime(.0005, t + .16); o.connect(g).connect(sfxBus); o.start(t); o.stop(t + .18); },
    open: t => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(660, t); o.frequency.exponentialRampToValueAtTime(990, t + .06); g.gain.setValueAtTime(.025, t); g.gain.exponentialRampToValueAtTime(.0005, t + .12); o.connect(g).connect(sfxBus); o.start(t); o.stop(t + .14); },
  };
  const lastSfx = {};
  return {
    unlock() { if (!init()) return; if (ctx.state === 'suspended') ctx.resume().then(emit, () => {}); if (!started) { started = true; startHum(); startMusic(); emit(); } },
    toggle() { if (!running()) { this.unlock(); if (muted) this.setMuted(false); return; } this.setMuted(!muted); },
    scene(name) {
      scene = name; if (!ctx) return; const t = ctx.currentTime;
      musicBus.gain.cancelScheduledValues(t); musicBus.gain.setValueAtTime(musicBus.gain.value, t); musicBus.gain.linearRampToValueAtTime(name === 'term' ? .42 : .55, t + 2.5);
      if (hum) hum.g.gain.setTargetAtTime(name === 'hall' ? .09 : .018, t, 1.6);
    },
    sfx(name, arg) {
      if (!ctx || !started || muted || !SFX[name]) return;
      const now = performance.now(); if (lastSfx[name] && now - lastSfx[name] < 35) return; lastSfx[name] = now;
      try { SFX[name](ctx.currentTime + .005, arg); } catch {}
    },
    setMuted(v) { muted = !!v; store.set('nfa:mute', muted ? '1' : '0'); if (ctx) { const t = ctx.currentTime; master.gain.cancelScheduledValues(t); master.gain.setTargetAtTime(muted ? 0 : vol, t, .08); } emit(); },
    get muted() { return muted; }, get on() { return running(); },
    onChange(f) { listeners.add(f); f({ muted, on: running() }); return () => listeners.delete(f); },
  };
}
