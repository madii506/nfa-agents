// nfa terminal, the feel: a viewfinder cursor that locks onto anything you can press, a command palette (ctrl+k),
// a sliding tab marker, a split you can drag, images that open large, and the agent's log ticking along the bottom.
const $ = s => document.querySelector(s);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(pointer: fine)').matches;

export function installUX(T) {
  if (fine && !reduce) cursor();
  try { agentMark(T); } catch (e) { console.warn('mark', e); }
  tabMarker(T);
  lightbox(T);
  if (!T.mobile) divider(T);
  palette(T);
}

// ---------------------------------------------------------------- the viewfinder cursor
function cursor() {
  const vf = document.createElement('div'); vf.className = 'vfc'; vf.innerHTML = '<i></i><i></i><i></i><i></i>'; document.body.appendChild(vf);
  const HIT = '.k, .row, .mrow[data-c], .crow[data-s], .prow[data-mint], button, a, .chips button, .pal li, .sug li, .card .shot, .grid a';
  let mx = -100, my = -100, tgt = null, on = false;
  const cur = { x: -100, y: -100, w: 22, h: 22 };
  addEventListener('pointermove', e => { mx = e.clientX; my = e.clientY; const el = e.target.closest && e.target.closest(HIT); tgt = el && el.getBoundingClientRect().width < 900 ? el : null; if (!on) { on = true; vf.style.opacity = 1; } }, { passive: true });
  document.addEventListener('pointerleave', () => { on = false; vf.style.opacity = 0; });
  addEventListener('pointerdown', () => vf.classList.add('press')); addEventListener('pointerup', () => vf.classList.remove('press'));
  (function loop() {
    let x = mx - 11, y = my - 11, w = 22, h = 22;
    if (tgt && document.body.contains(tgt)) { const r = tgt.getBoundingClientRect(); x = r.left - 5; y = r.top - 4; w = r.width + 10; h = r.height + 8; vf.classList.add('lock'); }
    else vf.classList.remove('lock');
    const k = tgt ? .3 : .45;
    cur.x += (x - cur.x) * k; cur.y += (y - cur.y) * k; cur.w += (w - cur.w) * k; cur.h += (h - cur.h) * k;
    vf.style.transform = `translate(${cur.x}px,${cur.y}px)`; vf.style.width = cur.w + 'px'; vf.style.height = cur.h + 'px';
    requestAnimationFrame(loop);
  })();
}

// ---------------------------------------------------------------- a marker that slides to the active tab
function tabMarker(T) {
  const nav = $('#tabs'); if (!nav) return;
  const ind = document.createElement('span'); ind.className = 'tabind'; nav.appendChild(ind);
  const place = b => { if (!b) { ind.style.opacity = 0; return; } ind.style.opacity = 1; ind.style.transform = `translateX(${b.offsetLeft}px)`; ind.style.width = b.offsetWidth + 'px'; };
  const active = () => nav.querySelector('button.on');
  nav.addEventListener('pointerover', e => { const b = e.target.closest('button'); if (b) place(b); });
  nav.addEventListener('pointerleave', () => place(active()));
  new MutationObserver(() => place(active())).observe(nav, { attributes: true, subtree: true, attributeFilter: ['class'] });
  addEventListener('resize', () => place(active()));
  setTimeout(() => place(active()), 300);
}

// ---------------------------------------------------------------- pictures open large, framed by the viewfinder
function lightbox(T) {
  const box = document.createElement('div'); box.className = 'lbox'; box.hidden = true;
  box.innerHTML = '<div class="lfr"><img alt=""><div class="vf wide"><i></i><i></i><i></i><i></i></div></div><p></p>';
  document.body.appendChild(box);
  const img = box.querySelector('img'), cap = box.querySelector('p'), vf = box.querySelector('.vf');
  const close = () => { box.classList.remove('on'); setTimeout(() => { box.hidden = true; }, 220); };
  box.addEventListener('click', close);
  addEventListener('keydown', e => { if (e.key === 'Escape' && !box.hidden) close(); });
  document.querySelector('#out').addEventListener('click', e => {
    const im = e.target.closest('.card .shot img, .grid a img'); if (!im) return;
    e.preventDefault(); e.stopPropagation();
    const big = im.src.replace(/([?&])w=\d+/, '$1w=720').replace(/([?&])h=\d+/, '$1h=720');
    img.src = big; const a = im.closest('a'), card = im.closest('.card');
    cap.innerHTML = a ? `${T.esc(a.querySelector('em') ? a.querySelector('em').textContent : '')} · <a class="lk" href="${a.href}" target="_blank" rel="noopener">magic eden ↗</a>` : card ? T.esc((card.querySelector('h4') || {}).textContent || '') : '';
    box.hidden = false; vf.classList.add('wide'); requestAnimationFrame(() => { box.classList.add('on'); setTimeout(() => vf.classList.remove('wide'), 80); });
    T.sound && T.sound.sfx('open');
  }, true);
}

// ---------------------------------------------------------------- drag the line between the shell and the side panes
function divider(T) {
  const panes = $('#panes'); if (!panes) return;
  const h = document.createElement('div'); h.className = 'split'; h.title = 'drag to resize'; panes.appendChild(h);
  const saved = parseFloat(T.store.get('nfa:split')); if (saved > .3 && saved < .8) panes.style.setProperty('--split', saved);
  const put = f => { f = Math.max(.38, Math.min(.78, f)); panes.style.setProperty('--split', f); return f; };
  let drag = false;
  h.addEventListener('pointerdown', e => { drag = true; h.setPointerCapture(e.pointerId); document.body.classList.add('resizing'); });
  h.addEventListener('pointermove', e => { if (!drag) return; const r = panes.getBoundingClientRect(); put((e.clientX - r.left) / r.width); });
  const end = () => { if (!drag) return; drag = false; document.body.classList.remove('resizing'); T.store.set('nfa:split', String(getComputedStyle(panes).getPropertyValue('--split')).trim()); };
  h.addEventListener('pointerup', end); h.addEventListener('pointercancel', end);
  h.addEventListener('dblclick', () => { panes.style.removeProperty('--split'); T.store.set('nfa:split', null); });
}

// ---------------------------------------------------------------- the command palette: ctrl+k, or the ⌘K chip
function palette(T) {
  const wrap = document.createElement('div'); wrap.className = 'pal'; wrap.hidden = true;
  wrap.innerHTML = '<div class="pbox"><div class="pin"><span>›</span><input placeholder="search commands, docs, collections, coins" spellcheck="false" autocomplete="off"></div><ul></ul><div class="pft">↑↓ move · enter runs · esc closes</div></div>';
  document.body.appendChild(wrap);
  const inp = wrap.querySelector('input'), ul = wrap.querySelector('ul');
  let items = [], sel = 0;
  const all = () => {
    const out = [];
    for (const [name, c] of T.cmds) if (!c.hidden) out.push({ run: name, title: name, sub: c.desc || '', kind: 'command' });
    for (const f of ['readme.md', 'custody.md', 'fees.md', 'agent.md', 'draw.md', 'faq.md']) out.push({ run: 'cat ' + f, title: f, sub: 'read the doc', kind: 'doc' });
    for (const c of (T.market && T.market.list ? T.market.list() : [])) { out.push({ run: 'pick ' + c.c, title: c.name, sub: `agent pick · floor ${c.floor != null ? c.floor.toFixed(c.floor >= 1 ? 2 : 3) : '—'} ◎`, kind: 'collection' }); out.push({ run: 'scan ' + c.c, title: c.name + ' · scan', sub: 'every candidate', kind: 'collection' }); }
    for (const c of T.coins || []) out.push({ run: 'coin ' + c.mint, title: '$' + c.symbol, sub: 'paired with ' + (c.coll_name || c.collection), kind: 'coin' });
    for (const c of (T.market && T.market.list ? T.market.list() : []).slice(0, 12)) out.push({ run: 'launch ' + c.c, title: 'launch · ' + c.name, sub: 'a coin paired with ' + c.name, kind: 'launch' });
    for (const p of (T.live && T.live.prices ? T.live.prices() : [])) out.push({ run: 'price ' + p.s.toLowerCase(), title: p.s + ' · ' + p.name, sub: 'live chart', kind: 'crypto' });
    for (const r of (T.live && T.live.pump ? T.live.pump() : []).slice(0, 12)) out.push({ run: 'pump ' + r.mint, title: '$' + (r.symbol || '?') + ' · ' + (r.name || ''), sub: 'new on pump.fun', kind: 'pump.fun' });
    return out;
  };
  const score = (q, s) => { s = s.toLowerCase(); if (!q) return 1; const i = s.indexOf(q); if (i === 0) return 100 - s.length * .1; if (i > 0) return 60 - i; let p = 0; for (const ch of q) { p = s.indexOf(ch, p); if (p < 0) return 0; p++; } return 20 - s.length * .05; };
  function render() {
    const q = inp.value.trim().toLowerCase();
    items = all().map(x => ({ ...x, s: Math.max(score(q, x.title), score(q, x.run) - 5, q.length > 2 ? score(q, x.sub) - 30 : 0) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 9);
    sel = Math.min(sel, Math.max(0, items.length - 1));
    ul.innerHTML = items.map((x, i) => `<li class="${i === sel ? 'on' : ''}" data-i="${i}"><b>${T.esc(x.title)}</b><span>${T.esc(x.sub)}</span><em>${x.kind}</em></li>`).join('') || '<li class="none">nothing matches</li>';
  }
  const open = () => { wrap.hidden = false; inp.value = ''; sel = 0; render(); requestAnimationFrame(() => wrap.classList.add('on')); setTimeout(() => inp.focus(), 30); T.sound && T.sound.sfx('open'); };
  const close = () => { wrap.classList.remove('on'); setTimeout(() => { wrap.hidden = true; }, 160); document.querySelector('#cmd').focus({ preventScroll: true }); };
  const go = i => { const x = items[i]; if (!x) return; close(); T.run(x.run); };
  inp.addEventListener('input', () => { sel = 0; render(); });
  inp.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); render(); }
    else if (e.key === 'Enter') { e.preventDefault(); go(sel); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  });
  ul.addEventListener('pointermove', e => { const li = e.target.closest('li[data-i]'); if (li && +li.dataset.i !== sel) { sel = +li.dataset.i; render(); } });
  ul.addEventListener('click', e => { const li = e.target.closest('li[data-i]'); if (li) go(+li.dataset.i); });
  wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
  addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); wrap.hidden ? open() : close(); } });
  const chip = document.querySelector('#palBtn'); if (chip) chip.addEventListener('click', open);
  T.palette = open;
}

// ---------------------------------------------------------------- the agent's mark: alive, and you can press it
// Brackets and two pill eyes, drawn live: the eyes follow the pointer, blink, scan while the agent works and smile
// when you poke it. Each press runs one of the agent's jobs.
function agentMark(T) {
  const pre = document.querySelector('#face'); if (!pre) return;
  const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'amark'; btn.setAttribute('aria-label', 'poke the agent');
  btn.innerHTML = '<canvas></canvas><span class="abub" aria-live="polite"></span>';
  pre.replaceWith(btn);
  const cv = btn.querySelector('canvas'), bub = btn.querySelector('.abub'), g = cv.getContext('2d');
  const S = 96; let dpr = 0;
  const st = { lx: 0, ly: 0, tx: 0, ty: 0, ins: 9, tins: 9, blink: 0, nextBlink: performance.now() + 1800, happy: 0, squash: 0, busy: false, t0: performance.now(), dirty: true };
  const size = () => { const d = Math.min(2.5, devicePixelRatio || 1); if (d !== dpr) { dpr = d; cv.width = cv.height = Math.round(S * d); cv.style.width = cv.style.height = S + 'px'; st.dirty = true; } };
  const color = () => getComputedStyle(document.querySelector('#app')).getPropertyValue('--hi').trim() || '#000';
  function rr(x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function draw(now) {
    size(); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, S, S);
    const c = color(); g.strokeStyle = c; g.fillStyle = c; g.lineCap = 'round';
    const sq = st.squash, sx = 1 + sq * .07, sy = 1 - sq * .09;
    g.translate(S / 2, S / 2); g.scale(sx, sy); g.translate(-S / 2, -S / 2);
    const a = st.ins, L = S * .27, R = 9, w = 5.6;
    g.lineWidth = w;
    const corner = (x, y, dx, dy) => { g.beginPath(); g.moveTo(x, y + dy * L); g.lineTo(x, y + dy * R); g.quadraticCurveTo(x, y, x + dx * R, y); g.lineTo(x + dx * L, y); g.stroke(); };
    corner(a, a, 1, 1); corner(S - a, a, -1, 1); corner(a, S - a, 1, -1); corner(S - a, S - a, -1, -1);
    const ew = S * .11, eh = S * .27, cy = S * .5 + st.ly * 3, gap = S * .115;
    let lx = st.lx * 4;
    if (st.busy && !st.happy) lx = Math.sin((now - st.t0) / 260) * 5;
    const b = st.blink > 0 ? Math.max(.12, Math.abs(Math.cos(st.blink * Math.PI))) : 1;
    for (const ex of [S / 2 - gap + lx, S / 2 + gap + lx]) {
      if (st.happy > 0) { g.lineWidth = 5; g.beginPath(); g.arc(ex, cy + 4, ew * .8, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); }
      else { const h = Math.max(2, eh * b * (st.busy ? .86 : 1)); rr(ex - ew / 2, cy - h / 2, ew, h, Math.min(ew, h) / 2); g.fill(); }
    }
  }
  function loop(now) {
    requestAnimationFrame(loop);
    if (document.hidden || !btn.isConnected || !btn.offsetParent) return;
    let ch = st.dirty; st.dirty = false;
    const k = .14; for (const [v, t] of [['lx', 'tx'], ['ly', 'ty'], ['ins', 'tins']]) { const d = st[t] - st[v]; if (Math.abs(d) > .005) { st[v] += d * k; ch = true; } }
    if (now > st.nextBlink && st.blink <= 0 && !st.happy) { st.blink = 1; st.nextBlink = now + 2200 + Math.random() * 3600; }
    if (st.blink > 0) { st.blink -= .085; if (st.blink < 0) st.blink = 0; ch = true; }
    if (st.happy > 0) { st.happy -= 1 / 60; if (st.happy < 0) st.happy = 0; ch = true; }
    if (st.squash > .001) { st.squash *= .86; ch = true; }
    if (st.busy) ch = true;
    if (ch) draw(now);
  }
  requestAnimationFrame(loop);
  addEventListener('pointermove', e => { const r = cv.getBoundingClientRect(); if (!r.width) return; st.tx = Math.max(-1, Math.min(1, (e.clientX - r.left - r.width / 2) / 320)); st.ty = Math.max(-1, Math.min(1, (e.clientY - r.top - r.height / 2) / 320)); }, { passive: true });
  btn.addEventListener('pointerenter', () => { st.tins = 4.5; say('poke me'); });
  btn.addEventListener('pointerleave', () => { st.tins = 9; });
  btn.addEventListener('pointerdown', () => { st.squash = 1; st.tins = 11; });
  btn.addEventListener('pointerup', () => { st.tins = 4.5; });
  const ACTS = [
    () => { const c = (T.market && T.market.first && T.market.first()) || 'mad_lads'; return ['pick ' + c, 'scanning ' + ((T.market && T.market.nameOf && T.market.nameOf(c)) || c)]; },
    () => ['pump new', 'watching pump.fun'],
    () => ['price sol', 'checking sol'],
    () => ['stats', 'counting what i’ve seen'],
    () => ['launch', 'let’s launch one'],
  ];
  let ai = 0, bt = 0;
  function say(t) { bub.textContent = t; bub.classList.add('on'); clearTimeout(bt); bt = setTimeout(() => bub.classList.remove('on'), 1600); }
  btn.addEventListener('click', () => {
    st.happy = .9; st.squash = 1; T.sound && T.sound.sfx('beep');
    const [cmd, line] = ACTS[ai++ % ACTS.length](); say(line);
    setTimeout(() => T.run(cmd), 180);
  });
  const as = document.querySelector('#agentState');
  if (as) new MutationObserver(() => { st.busy = as.textContent.trim() !== 'idle'; st.dirty = true; }).observe(as, { childList: true, characterData: true, subtree: true });
  T.mark = { happy: () => { st.happy = 1.2; st.squash = 1; }, say };
}
