// nfa boot: play the hall, then hand over to the terminal. ?term skips the hall; no WebGL skips it too.
import { createSound } from './sound.js';
const $ = s => document.querySelector(s);
const sound = createSound();
window.__sound = sound;
const mobile = matchMedia('(pointer:coarse)').matches || innerWidth < 760;
const q = new URLSearchParams(location.search);
const intro = $('#intro'), app = $('#app'), load = $('#iload');
const termMod = import('./term.js');                          // the terminal loads while the hall plays
let coins = [];

const unlock = () => { sound.unlock(); removeEventListener('pointerdown', unlock, true); removeEventListener('keydown', unlock, true); };
addEventListener('pointerdown', unlock, true); addEventListener('keydown', unlock, true);
const isnd = $('#isnd');
sound.onChange(s => { isnd.textContent = s.muted ? 'sound off' : 'sound on'; });
isnd.addEventListener('click', e => { e.stopPropagation(); sound.toggle(); });

let entered = false;
async function enter(how) {
  if (entered) return; entered = true;
  sound.scene('term');
  const T = await termMod;
  app.hidden = false; app.classList.add('boot');
  if (how === 'dive') $('#flash').classList.add('on');
  intro.classList.add('gone'); setTimeout(() => intro.remove(), 800);
  T.start({ sound, from: how, coins, mobile });
}
function webgl() { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } }

async function boot() {
  const p = v => load.style.setProperty('--p', v + '%');
  p(12);
  if (q.has('term') || !webgl()) { load.classList.add('done'); return enter('skip'); }
  const listed = fetch('/api/coin?list=1').then(r => r.ok ? r.json() : null).then(j => (j && j.coins) || []).catch(() => []);
  const [hallMod] = await Promise.all([import('./hall.js').then(m => { p(70); return m; }), Promise.race([listed.then(c => { coins = c; }), new Promise(r => setTimeout(r, 1800))])]);
  p(88);
  let hall;
  try {
    hall = await hallMod.run({
      canvas: $('#hall'), marks: $('#marks'), mobile, sound, coins: coins.map(c => ({ symbol: c.symbol, coll: c.coll_name || c.collection })),
      onPhase: ph => { intro.classList.remove('idle', 'film', 'ready', 'dive'); intro.classList.add(ph); },
      onEnter: () => enter('dive'),
    });
  } catch (e) { console.warn('hall', e); load.classList.add('done'); return enter('skip'); }
  p(100); setTimeout(() => load.classList.add('done'), 200);
  window.__hall = hall;
  $('#iskip').addEventListener('click', e => { e.stopPropagation(); if (hall.phase() === 'ready') hall.dive(); else hall.skip(); });
}
boot();
