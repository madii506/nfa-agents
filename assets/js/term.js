// nfa terminal: a shell with history, completion and clickable output; an agent pane that reads the market; a
// market pane; docs you can cat. Commands live in modules: market.js (magic eden), launch.js (pump.fun, wallets).
import * as PX from './px.js';
import { installUX } from './ux.js';
const $ = s => document.querySelector(s);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const sleep = ms => new Promise(r => setTimeout(r, ms));
const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} } };
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------- the face, in text
const FACE = {
  top: '╭───      ───╮', side: '│            │', bot: '╰───      ───╯',
  eyes(open, look) { const pad = 4 + look, row = ' '.repeat(pad) + (open ? '██  ██' : '▄▄  ▄▄') + ' '.repeat(14 - pad - 6); return row; },
};
export function face({ blink = false, look = 0 } = {}) {
  const e = FACE.eyes(true, look), b = ' '.repeat(14);
  const rows = blink ? [FACE.top, FACE.side, b, FACE.eyes(false, look), b, FACE.side, FACE.bot] : [FACE.top, FACE.side, e, e, e, FACE.side, FACE.bot];
  return rows.join('\n');
}
// the wordmark in blocks, beside the face
const GL = {
  n: ['.....', '.....', '####.', '#...#', '#...#', '#...#', '#...#'],
  f: ['..###', '.#...', '####.', '.#...', '.#...', '.#...', '.#...'],
  a: ['.....', '.....', '####.', '....#', '.####', '#...#', '.####'],
  '.': ['..', '..', '..', '..', '..', '..', '##'],
};
function banner() {
  const f = face().split('\n'), out = [];
  for (let r = 0; r < 7; r++) {
    let line = esc(f[r]) + '   ';
    for (const ch of ['n', 'f', 'a']) line += GL[ch][r].replace(/#/g, '██').replace(/\./g, '  ') + '  ';
    line += GL['.'][r].replace(/#/g, '██').replace(/\./g, '  ');
    out.push(line);
  }
  return out.join('\n');
}

// ---------------------------------------------------------------- docs you can cat
const DOCS = {
  'readme.md': `<b>nfa — non-fungible agents</b>

launch a coin paired with an NFT collection.
its agent spends the coin's creator fees buying NFTs from that collection,
and sends each one to a holder, or to the burn.

  1  you launch a coin on pump.fun, paired with one collection.
  2  pump.fun's own fee sharing locks the creator fees at launch:
       80%  →  the coin's agent vault
       20%  →  the nfa treasury
     the admin is revoked in the same wallet prompt, so nobody can
     change the split again. not nfa, not you.
  3  the agent reads the collection's listings and picks NFTs with
     rare traits priced at or near the floor.             {pick}
  4  each NFT goes to a holder by a draw anyone can check,
     or to the burn. the coin chooses which at launch.    {draw}
  5  every buy gets a receipt with its transaction.       {receipts}

the treasury's 20% buys back and burns $NFA.

next:  {launch}  {how}  {cat custody.md}  {cat faq.md}`,
  'custody.md': `<b>who holds what</b>

  coin          created by your own wallet on pump.fun.
  creator fees  split on-chain by pump.fun's fee sharing program:
                80% to the coin's agent vault, 20% to the nfa treasury.
                locked at launch: the sharing admin is revoked.
  agent vault   an address derived from the nfa studio wallet and the
                coin's mint (createWithSeed). there is no separate key
                for it: only the studio wallet can move its SOL, and the
                published rule is that it only moves to buy NFTs from the
                paired collection.
  NFTs          bought into the vault, then sent to the drawn holder or
                to the burn. every move gets a receipt.
  treasury      the 20% buys back $NFA and burns it.
  your wallet   nfa never asks for a key, a seed phrase or a deposit.
                you sign the launch in your own wallet, once.

check any coin's split on-chain:  {coin}`,
  'fees.md': `<b>how the fees move</b>

pump.fun charges a creator fee on every trade of your coin. at launch,
nfa turns on pump.fun's fee sharing for the coin and sets two
shareholders, then revokes the admin:

  ${'agent vault'.padEnd(14)}8000 bps   80%
  ${'nfa treasury'.padEnd(14)}2000 bps   20%

fees collect in pump.fun's creator vault for the coin. anyone can
push them out to the two shareholders at any time: {feed} builds that
transaction for your wallet (you only pay the network fee).

after the coin graduates to PumpSwap the same split keeps applying.`,
  'agent.md': `<b>how the agent picks</b>

  1  read the collection's cheapest listings on magic eden (up to 100)
     and the floor.
  2  keep the ones priced at most 10% over the floor
     (25% if nothing is that close).
  3  rank them by rarity rank (magic eden, moonrank or howrare,
     whichever the listing carries).
  4  pick the rarest. a tie goes to the cheaper one.

run it live on any collection:  {pick mad_lads}
see every candidate it weighed: {scan mad_lads}`,
  'draw.md': `<b>the draw, checkable by anyone</b>

before a draw, nfa publishes sha256(server seed): the commit.
the snapshot is every holder's balance at a stated slot.
the public seed is that slot's blockhash, so nobody knows it early.

  roll   = hmac-sha256(server seed, public seed + ":" + nonce)
  n      = first 13 hex characters of roll, as a number
  ticket = n mod (total balance of the snapshot)
  winner = the holder whose balance range holds the ticket,
           walking the snapshot sorted by address

once the seed is revealed, anyone can replay it:  {draw}`,
  'faq.md': `<b>questions</b>

what is nfa?
  a launchpad. every coin is paired with an NFT collection and its fees
  pay an agent to buy that collection's NFTs for holders, or the burn.

which collections?
  any solana collection listed on magic eden. try {top}.

what does a launch cost?
  what pump.fun and solana charge (your wallet shows it before you
  sign), plus 0.001 SOL to open the agent vault. nfa takes no launch fee.

can the 80/20 change later?
  no. the admin is revoked in the launch itself.

who holds the NFTs?
  the agent vault, until the draw sends each one out or burns it.
  read {cat custody.md}.

is nfa financial advice?
  nfa. it is not. nothing here is a promise of price or profit.

is nfa part of pump.fun, magic eden or tensor?
  no. independent, and not affiliated with any of them.`,
  'links.txt': '',
};
const DIRS = { '/': ['readme.md', 'custody.md', 'fees.md', 'agent.md', 'draw.md', 'faq.md', 'links.txt', 'coins/'] };

// ---------------------------------------------------------------- the terminal
export function start({ sound, from, coins: initialCoins = [], mobile }) {
  const out = $('#out'), input = $('#cmd'), typed = $('#typed'), after = $('#after'), ghost = $('#ghost'), cur = $('#cur'), ps1 = $('#ps1');
  const app = $('#app'), alog = $('#alog'), faceEl = $('#face'), astat = $('#astat');
  const cmds = new Map(), alias = new Map();
  const hist = (() => { try { return JSON.parse(store.get('nfa:hist') || '[]'); } catch { return []; } })();
  let hi = hist.length, busy = false, ask = null, abort = null, fast = false, pinned = true, lastAborted = false;
  const t0 = Date.now();

  if (store.get('nfa:theme') === 'dark') app.classList.add('dark');

  // ---- output
  out.addEventListener('scroll', () => { pinned = out.scrollTop + out.clientHeight >= out.scrollHeight - 30; }, { passive: true });
  const scroll = () => { if (pinned) out.scrollTop = out.scrollHeight; };
  function print(html = '', cls = '') {
    const d = document.createElement('div'); d.className = 'ln in ' + cls; d.innerHTML = html; out.appendChild(d);
    while (out.children.length > 700) out.firstChild.remove();
    scroll(); return d;
  }
  function node(el) { out.appendChild(el); scroll(); return el; }
  const text = (s, cls) => print(esc(s), cls);
  const k = (cmd, label) => `<span class="k" data-cmd="${esc(cmd)}">${esc(label || cmd)}</span>`;
  const links = s => s.replace(/\{([^}]+)\}/g, (_, c) => k(c));
  async function type(s, cls = '', cps = 900) {      // a line that types itself; any key finishes it
    const d = print('', cls); if (reduce || fast) { d.textContent = s; return d; }
    const step = Math.max(1, Math.round(cps / 60));
    for (let i = 0; i <= s.length; i += step) { d.textContent = s.slice(0, i); scroll(); if (fast) break; await sleep(16); }
    d.textContent = s; return d;
  }
  async function lines(arr, gap = 28) { for (const l of arr) { print(l); if (!reduce && !fast) await sleep(gap); } }
  function spinner(label) {
    const F = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'; let i = 0;
    const d = print(`<span class="spin">${F[0]}</span> <span class="dim">${esc(label)}</span>`);
    const sp = d.querySelector('.spin'), lb = d.querySelector('.dim');
    const iv = setInterval(() => { sp.textContent = F[i = (i + 1) % F.length]; }, 80);
    return {
      set(l) { lb.textContent = l; },
      done(html, cls = '') { clearInterval(iv); d.innerHTML = `<span class="ok">✓</span> ${html}`; if (cls) d.classList.add(cls); return d; },
      fail(html) { clearInterval(iv); d.innerHTML = `<span class="red">✗</span> ${html}`; sound && sound.sfx('err'); return d; },
      stop() { clearInterval(iv); d.remove(); },
    };
  }
  const bar = (p, w = 24) => { const n = Math.round(Math.max(0, Math.min(1, p)) * w); return '█'.repeat(n) + '░'.repeat(w - n); };

  // ---- input line: a hidden input mirrored into the prompt
  const sug = document.createElement('ul'); sug.className = 'sug'; sug.hidden = true; $('#shell').appendChild(sug);
  let sugItems = [], sugSel = -1;
  function suggest() {
    const v = input.value;
    if (ask || !v.trim() || busy) { sugItems = []; }
    else {
      const parts = v.split(/\s+/);
      if (parts.length <= 1) { const q = v.toLowerCase(); sugItems = [...cmds.keys()].filter(n => !cmds.get(n).hidden && n.startsWith(q)).sort((a, b) => a.length - b.length).slice(0, 6).map(n => ({ fill: n, label: n, sub: cmds.get(n).desc || '' })); if (sugItems.length === 1 && sugItems[0].fill === q) sugItems = []; }
      else { const c = cmds.get(resolve(parts[0].toLowerCase())), last = parts[parts.length - 1].toLowerCase(); const cands = c && c.complete ? (c.complete(parts.slice(1), last) || []) : []; sugItems = cands.filter(x => x.toLowerCase().startsWith(last) && x.toLowerCase() !== last).slice(0, 7).map(x => ({ fill: parts.slice(0, -1).join(' ') + ' ' + x, label: x, sub: (T.market && T.market.nameOf && T.market.nameOf(x)) || '' })); }
    }
    if (!sugItems.length) { sug.hidden = true; sugSel = -1; return; }
    sugSel = Math.min(sugSel, sugItems.length - 1);
    sug.innerHTML = sugItems.map((x, i) => `<li class="${i === sugSel ? 'on' : ''}" data-i="${i}"><b>${esc(x.label)}</b><span>${esc(x.sub)}</span></li>`).join('');
    sug.hidden = false;
  }
  sug.addEventListener('pointerdown', e => { const li = e.target.closest('li'); if (!li) return; e.preventDefault(); const x = sugItems[+li.dataset.i]; input.value = x.fill + ' '; render(); input.focus(); if (!cmds.get(x.fill) || !(cmds.get(x.fill).usage || '').includes('<')) { const v = input.value.trim(); input.value = ''; render(); run(v); } });
  function render() {
    const v = input.value, c = input.selectionStart ?? v.length;
    typed.textContent = v.slice(0, c); after.textContent = v.slice(c);
    suggest();
    let g = '';
    if (!ask && c === v.length && v && !v.includes(' ')) { const m = [...cmds.keys()].filter(n => !cmds.get(n).hidden && n.startsWith(v.toLowerCase())).sort((a, b) => a.length - b.length)[0]; if (m && m !== v) g = m.slice(v.length); }
    else if (ask && ask.hint && !v) g = ask.hint;
    ghost.textContent = g;
  }
  ['input', 'keyup', 'click', 'select'].forEach(e => input.addEventListener(e, render));
  function setPrompt() {
    if (ask) { ps1.textContent = ask.label + ' ›'; ps1.classList.add('ask'); }
    else { ps1.textContent = 'nfa ~ $'; ps1.classList.remove('ask'); }
    cur.classList.toggle('busy', busy && !ask);
    $('#shellNote').textContent = ask ? 'enter to answer · esc to cancel' : busy ? 'running · ctrl+c stops it' : (mobile ? 'tap a chip or type' : 'tab completes · ↑ history');
    render();
  }
  const focus = () => { if (!mobile || document.activeElement === input) input.focus({ preventScroll: true }); };
  $('#shell').addEventListener('click', e => { if (e.target.closest('.k, a, button, input, textarea, select')) return; if (getSelection().toString()) return; input.focus({ preventScroll: true }); });
  addEventListener('keydown', e => {
    if (e.target === input || e.target.closest('input, textarea, select') || e.metaKey || e.ctrlKey && e.key !== 'c' && e.key !== 'l') return;
    if (e.key.length === 1 || e.key === 'Enter' || e.key === 'ArrowUp' || e.key === 'Tab') { input.focus({ preventScroll: true }); }
  });

  function complete() {
    const v = input.value, parts = v.split(/\s+/);
    if (parts.length <= 1) {
      const m = [...cmds.keys()].filter(n => !cmds.get(n).hidden && n.startsWith(v.toLowerCase())).sort();
      if (m.length === 1) { input.value = m[0] + ' '; }
      else if (m.length > 1) { const p = common(m); if (p.length > v.length) input.value = p; else print(m.map(n => k(n)).join('   '), 'dim'); }
    } else {
      const c = cmds.get(resolve(parts[0].toLowerCase()));
      const cands = c && c.complete ? c.complete(parts.slice(1), parts[parts.length - 1]) : [];
      const last = parts[parts.length - 1], m = (cands || []).filter(x => x.toLowerCase().startsWith(last.toLowerCase()));
      if (m.length === 1) { parts[parts.length - 1] = m[0]; input.value = parts.join(' ') + (m[0].endsWith('/') ? '' : ' '); }
      else if (m.length > 1) { const p = common(m); if (p.length > last.length) { parts[parts.length - 1] = p; input.value = parts.join(' '); } else print(m.slice(0, 40).map(x => k(parts.slice(0, -1).join(' ') + ' ' + x, x)).join('   '), 'dim'); }
    }
    input.setSelectionRange(input.value.length, input.value.length); render();
  }
  const common = a => { let p = a[0] || ''; for (const s of a) while (!s.startsWith(p)) p = p.slice(0, -1); return p; };

  input.addEventListener('keydown', e => {
    sound && sound.sfx('key');
    if (e.key === 'Enter') {
      e.preventDefault(); const v = input.value; input.value = ''; render();
      if (ask) { const a = ask; ask = null; print(`<span class="dim">${esc(a.label)} ›</span> ${esc(a.secret ? '•'.repeat(v.length) : v)}`); setPrompt(); a.resolve(v); return; }
      if (busy) { fast = true; return; }
      if (sugSel >= 0 && sugItems[sugSel]) { const f = sugItems[sugSel].fill; sugSel = -1; run(f); return; }
      run(v); return;
    }
    if (e.key === 'Tab') { e.preventDefault(); if (ghost.textContent && !ask) { input.value += ghost.textContent; render(); } else if (!ask) complete(); return; }
    if (e.key === 'ArrowRight' && ghost.textContent && input.selectionStart === input.value.length && !ask) { e.preventDefault(); input.value += ghost.textContent; render(); return; }
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !sug.hidden && input.value.trim()) { e.preventDefault(); sugSel = e.key === 'ArrowDown' ? Math.min(sugItems.length - 1, sugSel + 1) : Math.max(-1, sugSel - 1); suggest(); return; }
    if (e.key === 'Tab' && !sug.hidden && sugSel >= 0) { e.preventDefault(); input.value = sugItems[sugSel].fill + ' '; sugSel = -1; render(); return; }
    if (e.key === 'ArrowUp' && !ask) { e.preventDefault(); if (hi > 0) { hi--; input.value = hist[hi] || ''; requestAnimationFrame(() => { input.setSelectionRange(input.value.length, input.value.length); render(); }); } return; }
    if (e.key === 'ArrowDown' && !ask) { e.preventDefault(); if (hi < hist.length) { hi++; input.value = hist[hi] || ''; render(); } return; }
    if (e.key === 'Escape') { e.preventDefault(); if (ask) { const a = ask; ask = null; print('<span class="dim">cancelled.</span>'); setPrompt(); a.resolve(null); } else { input.value = ''; render(); } return; }
    if (e.ctrlKey && e.key === 'l') { e.preventDefault(); out.innerHTML = ''; return; }
    if (e.ctrlKey && e.key === 'c') {
      if (input.selectionStart !== input.selectionEnd) return;
      e.preventDefault();
      if (ask) { const a = ask; ask = null; print('<span class="dim">^C</span>'); setPrompt(); a.resolve(null); return; }
      if (busy && abort) { abort.abort(); print('<span class="dim">^C stopped.</span>'); return; }
      print(`<span class="dim">nfa ~ $ ${esc(input.value)}^C</span>`); input.value = ''; render();
    }
  });
  $('#cmdForm').addEventListener('submit', e => e.preventDefault());
  out.addEventListener('click', e => {
    const t = e.target.closest('[data-cmd]'); if (t) { e.preventDefault(); if (ask) { const a = ask; ask = null; print(`<span class="dim">${esc(a.label)} ›</span> ${esc(t.dataset.cmd)}`); setPrompt(); a.resolve(t.dataset.cmd); return; } run(t.dataset.cmd); return; }
    const f = e.target.closest('[data-fill]'); if (f) { input.value = f.dataset.fill; input.focus(); render(); }
  });

  // ---- asking for answers (wizards)
  function askFor(label, o = {}) {
    return new Promise(res => {
      ask = { label, hint: o.hint || '', secret: !!o.secret, resolve: res };
      if (o.choices) print(o.choices.map(c => k(c.value ?? c, c.label ?? c)).join('   '), 'dim');
      setPrompt(); if (!mobile) input.focus({ preventScroll: true });
    });
  }

  // ---- running commands
  const resolve = n => alias.get(n) || n;
  function parse(line) { const a = []; line.replace(/"([^"]*)"|'([^']*)'|(\S+)/g, (m, x, y, z) => { a.push(x ?? y ?? z); }); return a; }
  async function run(line, o = {}) {
    line = String(line || '').trim();
    if (o.echo !== false) print(`<span class="p">nfa ~ $</span> ${esc(line)}`, 'cmdl');
    if (!line) return;
    if (hist[hist.length - 1] !== line) { hist.push(line); while (hist.length > 120) hist.shift(); store.set('nfa:hist', JSON.stringify(hist)); }
    hi = hist.length;
    const [name, ...args] = parse(line), c = cmds.get(resolve(name.toLowerCase()));
    tabsOn(line);
    if (!c) { print(`<span class="red">${esc(name)}</span><span class="dim">: command not found. try </span>${k('help')}`); sound && sound.sfx('err'); return; }
    if (busy) { abort && abort.abort(); }
    busy = true; fast = false; abort = new AbortController(); setPrompt();
    try { await c.run(args, { signal: abort.signal, line }); }
    catch (e) { if (e && e.name === 'AbortError') {} else { print(`<span class="red">✗</span> ${esc((e && e.message) || e)}`); console.warn(e); T.blink && T.blink(3); } }
    finally { lastAborted = !!(abort && abort.signal.aborted); busy = false; abort = null; fast = false; setPrompt(); }
  }
  function tabsOn(line) { document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', line.split(' ')[0] === b.dataset.run.split(' ')[0])); }
  document.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', () => { sound && sound.sfx('open'); run(b.dataset.run); }));

  function reg(name, def) { cmds.set(name, def); (def.alias || []).forEach(a => alias.set(a, name)); }
  async function typeRun(line, signal) {          // types a command into the prompt, key by key, then runs it
    input.value = ''; render();
    for (const ch of line) { if (signal && signal.aborted) return; input.value += ch; render(); sound && sound.sfx('key'); await sleep(reduce ? 0 : 38 + Math.random() * 40); }
    await sleep(reduce ? 0 : 260); const v = input.value; input.value = ''; render();
    const saved = abort; busy = false; await run(v); abort = saved; busy = true; setPrompt();
    if (lastAborted && saved) saved.abort();
  }

  // ---- shared context for the command modules
  let charW = 0;
  const cols = () => { if (!charW) { const m = document.createElement('span'); m.textContent = '0000000000'; m.style.cssText = 'position:absolute;visibility:hidden;white-space:pre'; out.appendChild(m); charW = m.getBoundingClientRect().width / 10 || 8.4; m.remove(); } return Math.max(30, Math.floor((out.clientWidth - 36) / charW)); };
  addEventListener('resize', () => { charW = 0; });
  const T = { print, node, text, type, lines, spinner, bar, k, links, esc, sleep, ask: askFor, run, reg, sound, mobile, store, face, PX, cmds, coins: initialCoins, cols, typeRun,
    status, agentLog, agentState, agentStat, api, uptime: () => Date.now() - t0 };
  window.__term = T;

  // ---- api helper: JSON with a timeout and honest errors
  async function api(path, o = {}) {
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), o.timeout || 15000);
    if (o.signal) o.signal.addEventListener('abort', () => ctl.abort(), { once: true });
    try {
      const r = await fetch(path, { method: o.body ? 'POST' : 'GET', headers: o.body ? { 'content-type': 'application/json' } : {}, body: o.body ? JSON.stringify(o.body) : undefined, signal: ctl.signal });
      const j = await r.json().catch(() => null);
      if (!j) throw new Error(r.status === 404 ? 'that is not there.' : 'the server answered ' + r.status + '.');
      return j;
    } catch (e) { if (o.signal && o.signal.aborted) { const a = new Error('aborted'); a.name = 'AbortError'; throw a; } if (e.name === 'AbortError') throw new Error('it took too long to answer. try again.'); throw e; }
    finally { clearTimeout(to); }
  }

  // ---- status bar, agent pane
  function status(html, state) { $('#sLeft').innerHTML = `<i class="dot ${state || ''}"></i>${html}`; }
  function agentState(s) { $('#agentState').textContent = s; }
  const stats = { state: 'starting', seen: '—', last: '—' };
  function agentStat(key, val) { stats[key] = val; astat.innerHTML = Object.entries(stats).map(([a, b]) => `<div>${esc(a.padEnd(8))}<b>${b}</b></div>`).join(''); }
  function agentLog(html) { const d = document.createElement('div'); d.innerHTML = html; alog.appendChild(d); while (alog.children.length > 14) alog.firstChild.remove();
    const m = $('#sMid'); if (m) { const t = document.createElement('span'); t.className = 'tick'; t.innerHTML = html; m.innerHTML = ''; m.appendChild(t); } }
  let look = 0, lookT = 0, mouseLook = 0;
  T.look = v => { look = v; lookT = Date.now(); };
  addEventListener('pointermove', e => { const r = faceEl.getBoundingClientRect(); if (!r.width) return; mouseLook = Math.max(-1, Math.min(1, Math.round((e.clientX - (r.left + r.width / 2)) / 260))); }, { passive: true });
  T.blink = (n = 2) => { let i = 0; const f = () => { faceEl.textContent = face({ blink: true, look }); setTimeout(() => { faceEl.textContent = face({ look }); if (++i < n) setTimeout(f, 120); }, 110); }; f(); };
  (function blink() {
    const now = Date.now(); if (now - lookT > 2500) look = mouseLook;
    faceEl.textContent = face({ look });
    setTimeout(() => { faceEl.textContent = face({ blink: true, look }); setTimeout(() => { faceEl.textContent = face({ look }); setTimeout(blink, 2200 + Math.random() * 3200); }, 140); }, 10);
  })();
  setInterval(() => { if (Date.now() - lookT > 2500) look = mouseLook; faceEl.textContent = face({ look }); }, 120);
  const clock = $('#clock'); const tick = () => { const d = new Date(); clock.textContent = d.toTimeString().slice(0, 8); agentStat('uptime', fmtUp(Date.now() - t0)); }; tick(); setInterval(tick, 1000);
  function fmtUp(ms) { const s = Math.floor(ms / 1000); return [s / 3600, s / 60 % 60, s % 60].map(v => String(Math.floor(v)).padStart(2, '0')).join(':'); }

  // ---- sound button
  const snd = $('#snd'); if (sound) { sound.onChange(s => { snd.querySelector('span').textContent = s.muted || !s.on ? 'off' : 'on'; snd.classList.toggle('on', !s.muted && s.on); }); snd.addEventListener('click', () => sound.toggle()); }

  // ---- mobile chips
  const chips = $('#chips');
  ['help', 'top', 'pick', 'launch', 'coins', 'agent', 'neofetch', 'docs'].forEach(c => { const b = document.createElement('button'); b.type = 'button'; b.textContent = c; b.onclick = () => run(c === 'docs' ? 'cat readme.md' : c === 'pick' ? 'pick ' + ((T.market && T.market.first()) || 'mad_lads') : c); chips.appendChild(b); });

  // ================================================================ built-in commands
  const GROUPS = [
    ['market', 'live magic eden data', ['top', 'scan', 'pick', 'view', 'floor', 'watch', 'info']],
    ['launch', 'coins paired with collections', ['launch', 'coins', 'coin', 'feed', 'receipts', 'connect', 'wallet']],
    ['agent', 'the agent and the draw', ['agent', 'stats', 'compare', 'draw', 'neofetch', 'how', 'tour']],
    ['docs', 'read how it works', ['ls', 'cat', 'tree', 'about']],
    ['shell', 'the rest', ['clear', 'history', 'theme', 'sound', 'rain', 'date', 'whoami', 'echo', 'hall']],
  ];
  reg('help', { desc: 'list commands, or explain one', usage: 'help [command]', alias: ['?', 'commands', 'man'], complete: () => [...cmds.keys()],
    async run(a) {
      if (a[0]) { const c = cmds.get(resolve(a[0].toLowerCase())); if (!c) return print(`<span class="dim">no command called ${esc(a[0])}.</span>`); print(`<b>${esc(c.usage || a[0])}</b>`); print(`<span class="dim">${esc(c.desc || '')}</span>`); if (c.more) print(links(c.more), 'dim'); return; }
      for (const [g, d, list] of GROUPS) {
        print(`<b>${g}</b> <span class="dim">· ${d}</span>`);
        print(list.filter(n => cmds.has(n)).map(n => `  ${k(n === 'cat' ? 'cat readme.md' : n === 'scan' || n === 'pick' || n === 'view' || n === 'floor' || n === 'watch' || n === 'info' ? n + ' ' + ((T.market && T.market.first()) || 'mad_lads') : n, n)}${' '.repeat(Math.max(1, 10 - n.length))}<span class="dim">${esc((cmds.get(n).desc || '').slice(0, 60))}</span>`).join('\n'));
        if (!fast && !reduce) await sleep(40);
      }
      print('<span class="dim">tab completes · ↑ history · ctrl+c stops · ctrl+l clears · click anything underlined</span>');
    } });
  reg('clear', { desc: 'clear the screen', alias: ['cls'], run() { out.innerHTML = ''; } });
  reg('history', { desc: 'commands you ran', run() { if (!hist.length) return print('<span class="dim">nothing yet.</span>'); print(hist.slice(-30).map((h, i) => `<span class="mute">${String(hist.length - Math.min(30, hist.length) + i + 1).padStart(4)}</span>  ${k(h)}`).join('\n')); } });
  reg('echo', { desc: 'print what you type', run(a) { text(a.join(' ')); } });
  reg('date', { desc: 'the time here and in UTC', run() { const d = new Date(); print(`${esc(d.toString().slice(0, 24))}\n<span class="dim">${d.toISOString().replace('T', ' ').slice(0, 19)} utc</span>`); } });
  reg('whoami', { desc: 'who the shell thinks you are', run() { const w = T.wallet && T.wallet.me; print(w ? `${esc(w)}\n<span class="dim">connected wallet</span>` : `anon\n<span class="dim">no wallet connected. ${k('connect')}</span>`); } });
  reg('sudo', { hidden: true, desc: '', run() { print('<span class="dim">permission denied. nobody has root here, not even nfa. that is the point.</span>'); } });
  reg('nfa', { hidden: true, desc: '', run() { print('not financial advice. <span class="dim">also: non-fungible agents.</span>'); } });
  reg('exit', { hidden: true, desc: '', alias: ['quit', 'logout'], run() { print(`<span class="dim">there is no exit. only agents. walk the hall again:</span> ${k('hall')}`); } });
  reg('hall', { desc: 'walk the server hall again', run() { location.href = location.pathname; } });
  reg('theme', { desc: 'white or dark', usage: 'theme [white|dark]', complete: () => ['white', 'dark'],
    run(a) { const want = (a[0] || (app.classList.contains('dark') ? 'white' : 'dark')).toLowerCase(); const dark = want === 'dark' || want === 'black'; app.classList.toggle('dark', dark); store.set('nfa:theme', dark ? 'dark' : null); print(`<span class="dim">theme:</span> ${dark ? 'dark' : 'white'}`); } });
  reg('sound', { desc: 'music and machine noises on or off', usage: 'sound [on|off]', complete: () => ['on', 'off'],
    run(a) { if (!sound) return; if (a[0] === 'on') { sound.unlock(); sound.setMuted(false); } else if (a[0] === 'off') sound.setMuted(true); else sound.toggle(); setTimeout(() => print(`<span class="dim">sound:</span> ${sound.muted || !sound.on ? 'off' : 'on'}`), 50); } });
  reg('about', { desc: 'what nfa is, in one screen', run: () => run('cat readme.md', { echo: false }) });
  reg('ls', { desc: 'list the docs', alias: ['dir'], complete: () => DIRS['/'],
    async run(a) {
      const p = (a[0] || '').replace(/^\.?\//, '');
      if (p.startsWith('coins')) return run('coins', { echo: false });
      print(DIRS['/'].map(f => f.endsWith('/') ? k('coins', f) : k('cat ' + f, f)).join('    '));
    } });
  reg('tree', { desc: 'the docs, as a tree', run() { print(['<b>.</b>', ...DIRS['/'].map((f, i, l) => `${i === l.length - 1 ? '└──' : '├──'} ${f.endsWith('/') ? k('coins', f) : k('cat ' + f, f)}`)].join('\n')); } });
  reg('cd', { hidden: true, desc: '', run(a) { if ((a[0] || '').startsWith('coins')) return run('coins', { echo: false }); print('<span class="dim">you are already home: everything is one ls away.</span>'); } });
  reg('pwd', { hidden: true, desc: '', run() { text('/home/agent'); } });
  reg('cat', { desc: 'read a doc', usage: 'cat <file>', alias: ['open', 'less', 'more', 'read'], complete: () => DIRS['/'].filter(f => !f.endsWith('/')),
    async run(a) {
      const f = (a[0] || '').replace(/^\.?\//, '').toLowerCase();
      if (!f) return print(`<span class="dim">which one?</span> ${DIRS['/'].filter(x => !x.endsWith('/')).map(x => k('cat ' + x, x)).join('  ')}`);
      if (f === 'links.txt') return print(linksTxt());
      const d = DOCS[f] || DOCS[f + '.md']; if (!d) return print(`<span class="dim">cat: ${esc(f)}: no such file.</span> ${k('ls')}`);
      const ls = links(d).split('\n'); for (const l of ls) { print(l); if (!fast && !reduce) await sleep(12); }
    } });
  function linksTxt() {
    const C = window.NFA || {}, site = location.origin;
    const rows = [['site', `<a class="lk" href="${site}" target="_blank" rel="noopener">${esc(site.replace(/^https?:\/\//, ''))}</a>`]];
    if (C.x) rows.push(['x', `<a class="lk" href="https://x.com/${esc(C.x)}" target="_blank" rel="noopener">@${esc(C.x)}</a>`]);
    if (C.ca) { rows.push(['$' + (C.ticker || 'NFA'), `<span class="k" data-cmd="ca">${esc(C.ca)}</span>`]); rows.push(['buy', `<a class="lk" href="https://pump.fun/coin/${esc(C.ca)}" target="_blank" rel="noopener">pump.fun</a>`]); rows.push(['chart', `<a class="lk" href="https://dexscreener.com/solana/${esc(C.ca)}" target="_blank" rel="noopener">dexscreener</a>`]); }
    rows.push(['market', `<a class="lk" href="https://magiceden.io/solana" target="_blank" rel="noopener">magic eden</a>`]);
    return rows.map(([a, b]) => `${esc(a.padEnd(8))}${b}`).join('\n');
  }
  reg('how', { desc: 'the whole loop, drawn out', alias: ['flow'],
    async run() {
      const F = [
        '  your coin ──── creator fees ────┬──── 80% ───▶  agent vault',
        '  (pump.fun)                      │                    │',
        '                                  └──── 20% ───▶  treasury ─▶ buys + burns $NFA',
        '                                                       │',
        '                     reads listings · picks a rare one near the floor',
        '                                                       │',
        '                                                       ▼',
        '                                                 one NFT, bought',
        '                                                 ┌─────┴─────┐',
        '                                           a holder (draw)   the burn',
      ];
      for (const l of F) { print(`<span class="flow">${esc(l)}</span>`); if (!fast && !reduce) await sleep(70); }
      print(''); print(links('the split is locked at launch. read {cat fees.md} · {cat agent.md} · {cat draw.md}'), 'dim');
    } });
  reg('neofetch', { desc: 'this system, at a glance', alias: ['fetch', 'sysinfo'],
    async run() {
      const C = window.NFA || {}, mk = T.market && T.market.state ? T.market.state() : 'reading';
      const info = [
        ['', '<b>agent@nfa</b>'], ['', '<span class="mute">─────────</span>'],
        ['os', 'nfa term 1.0'], ['host', 'solana mainnet'], ['market', `magic eden · ${esc(mk)}`],
        ['split', '80% agent vault · 20% treasury'], ['policy', 'holders | burn'],
        ['agents', `${T.coins.length} online`], ['uptime', fmtUp(Date.now() - t0)],
        ['theme', app.classList.contains('dark') ? 'dark' : 'white'], ['shell', 'nfa-sh'],
        ['ticker', C.ca ? '$' + esc(C.ticker || 'NFA') : '$NFA · not live yet'],
      ];
      const f = face().split('\n');
      const rows = Math.max(f.length, info.length);
      for (let i = 0; i < rows; i++) { const L = (f[i] || '').padEnd(16); const [a, b] = info[i] || ['', '']; print(`<span class="hi">${esc(L)}</span>  ${a ? `<b>${esc(a.padEnd(8))}</b>` : ''}${b}`, 'tight'); if (!fast && !reduce) await sleep(25); }
      print(`${' '.repeat(18)}<span style="letter-spacing:0">${['#000', '#3a3c40', '#6b6f75', '#9a9ea5', '#c9ccd1', '#e8eaed', '#fff'].map(c => `<span style="color:${c}">███</span>`).join('')}</span>`);
    } });
  reg('rain', { desc: 'a screensaver of pixel agents. any key ends it', alias: ['screensaver', 'matrix'],
    run({ signal }) { return rain(signal); } });
  reg('draw', { desc: 'replay a fair draw from its seeds', usage: 'draw [example]', more: 'the method: {cat draw.md}', complete: () => ['example'],
    async run(a, { signal }) {
      if (!crypto.subtle) return print('<span class="dim">this browser has no web crypto here. open the site over https.</span>');
      let seed, commit, pub, snap;
      if (a[0] === 'example') {
        print('<span class="dim">an example with made-up inputs, so you can see the steps. real draws publish their own.</span>');
        seed = 'example-server-seed-7f3a'; commit = await sha(seed); pub = 'ExampleBlockhash1111111111111111111111111111'; snap = 'wallet-a 1200\nwallet-b 300\nwallet-c 5000\nwallet-d 50';
      } else {
        print(links('replays a draw from its published inputs. no inputs yet? try {draw example}. method: {cat draw.md}'), 'dim');
        seed = await askFor('server seed (revealed)'); if (seed == null || signal.aborted) return;
        commit = await askFor('commit (sha256, optional)', { hint: 'enter to skip' }); if (commit == null) return;
        pub = await askFor('public seed (blockhash)'); if (pub == null) return;
        print('<span class="dim">snapshot: one holder per line as "address balance". type done when finished.</span>');
        const rowsIn = []; for (;;) { const r = await askFor('holder', { hint: 'address balance, or done' }); if (r == null) return; if (/^done$/i.test(r.trim()) || !r.trim()) break; rowsIn.push(r); }
        snap = rowsIn.join('\n');
      }
      const list = snap.split('\n').map(l => l.trim().split(/[\s,]+/)).filter(x => x.length >= 2 && Number(x[1]) > 0).map(([addr, bal]) => ({ addr, bal: BigInt(Math.round(Number(bal))) })).sort((x, y) => x.addr < y.addr ? -1 : 1);
      if (!list.length) return print('<span class="dim">no holders to draw from.</span>');
      const h = await sha(seed);
      if (commit) print(`commit   ${h === commit.trim().toLowerCase() ? '<span class="ok">✓ sha256(seed) matches</span>' : '<span class="red">✗ sha256(seed) does not match the commit</span>'}`);
      const roll = await hmac(seed, pub + ':0'), n = BigInt('0x' + roll.slice(0, 13)), total = list.reduce((s, x) => s + x.bal, 0n), ticket = n % total;
      print(`roll     <span class="dim">${roll.slice(0, 13)}</span>${roll.slice(13, 32)}<span class="dim">…</span>`);
      print(`ticket   ${ticket} <span class="dim">of ${total}</span>`);
      let acc = 0n, win = null;
      for (const x of list) { const lo = acc; acc += x.bal; const hit = !win && ticket < acc; if (hit) win = x; print(`${hit ? '<b>▶</b>' : ' '} ${esc(x.addr.padEnd(14).slice(0, 44))} <span class="dim">${String(lo).padStart(6)}–${String(acc - 1n).padEnd(6)}</span>${hit ? ' <span class="tag">winner</span>' : ''}`); if (!fast && !reduce) await sleep(60); }
    } });
  async function sha(s) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
  async function hmac(key, msg) { const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); const b = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
  reg('agent', { desc: 'what the agent is doing right now', alias: ['status'],
    async run() {
      const f = face().split('\n'), s = T.market && T.market.summary ? T.market.summary() : null;
      const info = [['', '<b>the nfa agent</b>'], ['state', esc($('#agentState').textContent)], ['reads', 'magic eden listings, live'], ['rule', `rare + near the floor · ${k('cat agent.md', 'agent.md')}`],
        ['seen', s ? `${s.seen} collections this session` : '—'], ['last', s && s.last ? s.last : '—'], ['buys', T.coins.length ? 'from each coin’s vault · ' + k('receipts') : `none yet: no coin is live. ${k('launch')}`]];
      for (let i = 0; i < 7; i++) { const [a, b] = info[i] || ['', '']; print(`<span class="hi">${esc((f[i] || '').padEnd(16))}</span>  ${a ? `<b>${esc(a.padEnd(7))}</b>` : ''}${b}`, 'tight'); }
    } });
  reg('tour', { desc: 'a guided run through nfa, typed for you. ctrl+c stops', alias: ['demo', 'guide'],
    async run(a, { signal }) {
      const first = (T.market && T.market.first()) || 'mad_lads';
      const steps = [['', 'a 60-second tour. watch the prompt; ctrl+c stops it.'], ['how', 'first, the loop: a coin, its fees, an agent, NFTs.'], ['top', 'the market the agents read, live from magic eden.'], ['pick ' + first, 'the agent’s rule, run live on the busiest collection.'], ['neofetch', 'this system at a glance.'], ['', `your turn: ${k('launch')} a coin, or ${k('help')} for everything.`]];
      for (const [cmd, note] of steps) {
        if (signal.aborted) return;
        print(`<span class="tag">tour</span> ${note.includes('<') ? note : esc(note)}`); await sleep(reduce ? 0 : 900);
        if (cmd) { await typeRun(cmd, signal); await sleep(reduce ? 0 : 1600); }
      }
    } });
  reg('stats', { desc: 'a live dashboard: market, agent, coins', alias: ['dash', 'dashboard'],
    async run(a, { signal }) {
      const list = (T.market && T.market.list && T.market.list()) || [], sm = T.market && T.market.summary ? T.market.summary() : { seen: 0 };
      const cells = [['collections watched', list.length], ['read this session', sm.seen || 0], ['coins live', T.coins.length], ['receipts', T.receiptsCount || 0]];
      const row = document.createElement('div'); row.className = 'statrow';
      row.innerHTML = cells.map(([l, v]) => `<div><b data-v="${v}">0</b><span>${esc(l)}</span></div>`).join(''); node(row);
      row.querySelectorAll('b').forEach(b => { const v = +b.dataset.v, t0 = performance.now(); const f = t => { const p = Math.min(1, (t - t0) / 900); b.textContent = Math.round(v * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(f); }; requestAnimationFrame(f); });
      if (!list.length) { print('<span class="dim">the market hasn’t loaded yet. try again in a moment.</span>'); return; }
      print('<b>floor, by collection</b> <span class="dim">· ◎, log scale · live from magic eden</span>');
      const top = list.slice(0, T.mobile ? 8 : 12), W = Math.max(10, Math.min(36, T.cols() - 34)), lg = v => Math.log10(Math.max(.001, v) * 1000);
      const mx = Math.max(...top.map(p => lg(p.floor || 0)));
      for (const p of top) {
        const el = print(`<span class="row hbar" data-cmd="pick ${esc(p.c)}"><span class="hn">${esc(p.name.slice(0, 22))}</span><span class="ht"><i></i></span><span class="hv">${(p.floor != null ? p.floor.toFixed(p.floor >= 1 ? 2 : 3) : '—')}</span></span>`, 'tight');
        const w = Math.max(2, lg(p.floor || 0) / mx * 100); requestAnimationFrame(() => requestAnimationFrame(() => { el.querySelector('.ht i').style.width = w.toFixed(1) + '%'; }));
        if (!reduce) await sleep(45);
      }
      print('<span class="dim">click a bar for the agent’s pick in that collection</span>');
    } });
  reg('compare', { desc: 'two collections side by side', usage: 'compare <a> <b>', complete: () => (T.market && T.market.symbols && T.market.symbols()) || [], alias: ['vs'],
    async run(a, { signal }) {
      const sy = (T.market && T.market.symbols && T.market.symbols()) || [];
      const x = (a[0] || sy[0] || '').toLowerCase(), y = (a[1] || sy[1] || '').toLowerCase();
      if (!x || !y) return print('<span class="dim">compare two collections, like</span> ' + k('compare mad_lads okay_bears'));
      const s = spinner(`reading ${x} and ${y}`);
      const [A, B] = await Promise.all([api('/api/me?op=pick&c=' + encodeURIComponent(x), { signal, timeout: 20000 }), api('/api/me?op=pick&c=' + encodeURIComponent(y), { signal, timeout: 20000 })]);
      if (!A.ok || !B.ok) return s.fail(esc((!A.ok ? A : B).error));
      s.done(`<b>${esc(A.name)}</b> <span class="dim">vs</span> <b>${esc(B.name)}</b>`);
      const f = v => v == null ? '—' : v >= 100 ? v.toFixed(1) : v >= 1 ? v.toFixed(2) : v.toFixed(3);
      const rows = [['floor ◎', f(A.floor), f(B.floor)], ['listed', A.listed ?? '—', B.listed ?? '—'], ['24h avg ◎', f(A.avg24), f(B.avg24)], ['7d volume ◎', f(A.vol7), f(B.vol7)], ['agent pick', A.pick ? 'rank ' + A.pick.rank : '—', B.pick ? 'rank ' + B.pick.rank : '—'], ['pick price ◎', A.pick ? f(A.pick.price) : '—', B.pick ? f(B.pick.price) : '—']];
      const w = Math.max(10, Math.min(22, Math.floor((T.cols() - 14) / 2)));
      print(`<span class="hdr">${''.padEnd(14)}${A.name.slice(0, w - 1).padEnd(w)}${B.name.slice(0, w - 1).padEnd(w)}</span>`);
      for (const [l, p, q] of rows) { print(`${esc(l.padEnd(14))}${esc(String(p).padEnd(w))}${esc(String(q).padEnd(w))}`, 'tight'); if (!reduce) await sleep(40); }
      print(`${k('pick ' + A.c, 'pick in ' + A.c)}   ${k('pick ' + B.c, 'pick in ' + B.c)}`);
    } });
  reg('faq', { desc: 'common questions', run: () => run('cat faq.md', { echo: false }) });

  // ca / x / buy / chart only exist once they are set
  const C = window.NFA || {};
  if (C.ca) {
    reg('ca', { desc: 'copy the $NFA contract address', run() { navigator.clipboard && navigator.clipboard.writeText(C.ca).catch(() => {}); print(`${esc(C.ca)}  <span class="dim">copied</span>`); } });
    reg('buy', { desc: '$NFA on pump.fun', run() { window.open('https://pump.fun/coin/' + C.ca, '_blank', 'noopener'); print('<span class="dim">opened pump.fun.</span>'); } });
    reg('chart', { desc: '$NFA on dexscreener', run() { window.open('https://dexscreener.com/solana/' + C.ca, '_blank', 'noopener'); print('<span class="dim">opened dexscreener.</span>'); } });
  }
  if (C.x) reg('x', { desc: 'nfa on X', alias: ['twitter'], run() { window.open('https://x.com/' + C.x, '_blank', 'noopener'); print('<span class="dim">opened X.</span>'); } });
  reg('links', { desc: 'every link in one place', run() { print(linksTxt()); } });

  // ---- the rain screensaver: pixel agents falling in columns
  function rain(signal) {
    return new Promise(res => {
      const wrap = document.createElement('div'); wrap.className = 'rain'; wrap.innerHTML = '<canvas></canvas><p>any key or click to return</p>'; document.body.appendChild(wrap);
      const cv = wrap.querySelector('canvas'), g = cv.getContext('2d'); let W, H, cols;
      const size = mobile ? 28 : 36, faces = Array.from({ length: 24 }, (_, i) => PX.canvas(1000 + i * 7, 3));
      const fit = () => { W = cv.width = innerWidth; H = cv.height = innerHeight; cols = Array.from({ length: Math.ceil(W / size) }, () => ({ y: -Math.random() * H, v: .6 + Math.random() * 1.8, f: (Math.random() * 24) | 0 })); };
      fit(); addEventListener('resize', fit);
      let raf; const loop = () => {
        g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(0, 0, W, H); g.imageSmoothingEnabled = false;
        cols.forEach((c, i) => { c.y += c.v * size * .16; if (c.y > H + size) { c.y = -size * (1 + Math.random() * 6); c.f = (Math.random() * 24) | 0; } g.drawImage(faces[c.f], i * size + 2, c.y, size - 4, size - 4); });
        raf = requestAnimationFrame(loop);
      };
      loop();
      const end = () => { cancelAnimationFrame(raf); removeEventListener('resize', fit); removeEventListener('keydown', end, true); wrap.remove(); res(); };
      setTimeout(() => { addEventListener('keydown', end, true); wrap.addEventListener('click', end); }, 300);
      signal && signal.addEventListener('abort', end, { once: true });
    });
  }

  // ================================================================ modules, then the boot
  setPrompt();
  const mods = Promise.all([import('./market.js').then(m => m.install(T)).catch(e => console.warn('market', e)), import('./launch.js').then(m => m.install(T)).catch(e => console.warn('launch', e)), import('./live.js').then(m => m.install(T)).catch(e => console.warn('live', e))]);
  (async function boot() {
    status('agent starting', 'busy');
    const L = [
      [`<b>nfa agentd 1.0</b>  <span class="dim">solana mainnet</span>`],
      [`vault keys ............. <span class="hi">none held here</span>`],
      [`pump.fun programs ...... <span class="hi">linked</span>`],
      [`magic eden market ...... <span class="dim" id="bootMe">reading</span>`],
      [`agents online .......... <span class="hi">${T.coins.length ? T.coins.length : '0'}</span>${T.coins.length ? '' : ' <span class="dim">· launch one</span>'}`],
    ];
    for (const [l] of L) { print(l); if (!reduce) await sleep(from === 'dive' ? 90 : 40); }
    { const st = T.market && T.market.state && T.market.state(), el = document.querySelector('#bootMe'); if (el && st && st !== 'reading') { el.textContent = st === 'live' ? 'live' : 'offline, retrying'; el.className = st === 'live' ? 'hi' : 'red'; } }
    print('');
    print(`<span class="ascii big">${banner()}</span>`);
    print('');
    await type('launch a coin paired with an NFT collection. its agent spends the fees on NFTs for holders, or for the burn.', 'hi', 1400);
    print(`<span class="dim">try</span>  ${k('tour')}  ${k('help')}  ${k('top')}  ${k('launch')}  ${k('stats')}  <span class="dim">· ${mobile ? 'or just type' : 'ctrl+k searches everything'}</span>`);
    print('');
    await mods;
    try { installUX(T); } catch (e) { console.warn('ux', e); }
    T.ready = true;
    // links into the site: ?coin=<mint> opens a coin, ?launch (or ?pair=<collection>) opens the launch studio
    { const u = new URLSearchParams(location.search), c = u.get('coin'), pr = u.get('pair');
      if (c && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(c)) run(T.coins.some(x => x.mint === c) ? 'coin ' + c : 'pump ' + c);
      else if (u.has('launch') || pr) run('launch' + (pr && /^[a-z0-9_\-]{2,64}$/i.test(pr) ? ' ' + pr : '')); }
    if (!mobile) input.focus({ preventScroll: true });
    if (sound) sound.sfx('ok');
  })();
  return T;
}
