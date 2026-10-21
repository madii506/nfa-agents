// nfa markets: the room behind the hall's left screen (/?markets). Live crypto charts and nothing else: SOL, BTC and ETH from
// Coinbase, and a few Solana names priced by Jupiter and charted by GeckoTerminal. Every number is read live through
// /api/mkt; a dash means no data yet. Separate from the shell and from the launch studio.
const MARK = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M1.9 6.5V3.6Q1.9 1.9 3.6 1.9H6.5M13.5 1.9h2.9Q18.1 1.9 18.1 3.6V6.5M1.9 13.5v2.9Q1.9 18.1 3.6 18.1H6.5M13.5 18.1h2.9Q18.1 18.1 18.1 16.4V13.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><rect x="6.6" y="7.2" width="2.2" height="5.2" rx="1.1" fill="currentColor"/><rect x="11.2" y="7.2" width="2.2" height="5.2" rx="1.1" fill="currentColor"/></svg>';
const RANGES = ['1h', '1d', '1w', '1m'];
const ORDER = ['SOL', 'BTC', 'ETH', 'PUMP', 'JUP', 'BONK', 'WIF'];
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

export function mount({ sound } = {}) {
  const sfx = n => { try { sound && sound.sfx(n); } catch {} };
  const price = v => v == null || !isFinite(v) ? '—' : v >= 1000 ? '$' + v.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 }) : v >= 1 ? '$' + v.toFixed(2) : v >= .01 ? '$' + v.toFixed(4) : '$' + v.toPrecision(3);
  const pct = v => v == null || !isFinite(v) ? '—' : (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
  const dir = v => v == null ? '' : v >= 0 ? 'up' : 'dn';
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const getJ = async (u, ms = 15000) => { const c = new AbortController(), t = setTimeout(() => c.abort(), ms); try { const r = await fetch(u, { signal: c.signal }); return await r.json(); } catch { return null; } finally { clearTimeout(t); } };

  const S = { list: [], sel: 'SOL', r: '1d', pts: [], hov: -1, at: 0, minis: {}, loading: false };
  const root = document.createElement('div'); root.className = 'mx'; root.setAttribute('aria-label', 'nfa markets');
  root.innerHTML = `
    <header class="mx-top">
      <a class="mx-id" href="/?back" aria-label="back to the hall">${MARK}<b>nfa<i>.</i></b><span>markets</span></a>
      <div class="mx-mid"><i class="dot on"></i><span>live crypto charts</span><em id="mxClock"></em></div>
      <a class="mx-back" href="/?back">← back to the hall</a>
    </header>
    <div class="mx-prog"><i></i></div>
    <main class="mx-main">
      <section class="mx-focus" aria-live="polite">
        <div class="mx-h">
          <div class="mx-t"><b id="mxSym">SOL</b><span id="mxName">Solana</span></div>
          <div class="mx-p"><strong id="mxPrice">—</strong><em id="mxChg"></em></div>
        </div>
        <div class="mx-r">${RANGES.map(r => `<button type="button" data-r="${r}">${r}</button>`).join('')}<span id="mxSrc"></span></div>
        <div class="mx-c"><canvas id="mxCv"></canvas><div class="mx-tip" id="mxTip" hidden></div><div class="mx-load" id="mxLoad">reading the chart…</div></div>
        <div class="mx-stats" id="mxStats"></div>
      </section>
      <section class="mx-list" id="mxList" aria-label="coins"></section>
    </main>`;
  document.body.appendChild(root);
  requestAnimationFrame(() => root.classList.add('on'));
  const $ = s => root.querySelector(s), cv = $('#mxCv'), tip = $('#mxTip');

  // ---------------------------------------------------------------- the list: every coin, live, with its own line
  function tiles() {
    const el = $('#mxList');
    if (!S.list.length) { el.innerHTML = Array.from({ length: 7 }, (_, i) => `<div class="mx-tile sk" style="--i:${i}"></div>`).join(''); return; }
    el.innerHTML = S.list.map((p, i) => `<button type="button" class="mx-tile${p.s === S.sel ? ' on' : ''}" data-s="${esc(p.s)}" style="--i:${i}">
      <span class="k">${i + 1}</span><span class="s"><b>${esc(p.s)}</b><em>${esc(p.name)}</em></span>
      <span class="v"><b data-p="${esc(p.s)}">${price(p.price)}</b><em class="${dir(p.chg)}">${pct(p.chg)} 24h</em></span>
      <svg class="mx-sp ${dir(p.chg)}" viewBox="0 0 120 34" preserveAspectRatio="none" aria-hidden="true"><polyline points="${sparkPts(spark(p))}"/></svg></button>`).join('');
  }
  const spark = p => (p.spark && p.spark.length > 1 ? p.spark : S.minis[p.s]) || [];
  function sparkPts(a) {
    if (!a || a.length < 2) return '';
    const lo = Math.min(...a), hi = Math.max(...a), r = hi - lo || 1;
    return a.map((v, i) => `${(i / (a.length - 1) * 120).toFixed(1)},${(31 - (v - lo) / r * 28).toFixed(1)}`).join(' ');
  }
  async function minis() {     // the Solana names have no Coinbase candles: their day line comes from GeckoTerminal
    for (const p of S.list) {
      if (p.spark && p.spark.length > 1) continue; if (S.minis[p.s]) continue;
      const j = await getJ(`/api/mkt?op=chart&s=${encodeURIComponent(p.s)}&r=1d`);
      if (j && j.ok && j.pts && j.pts.length > 1) { S.minis[p.s] = j.pts.filter((_, i) => i % 4 === 0).map(x => x[1]); tiles(); }
    }
  }
  async function prices() {
    const j = await getJ('/api/mkt?op=prices');
    if (!j || !j.ok) { if (!S.list.length) $('#mxLoad').textContent = 'prices didn’t load. retrying…'; return; }
    const prev = Object.fromEntries(S.list.map(p => [p.s, p.price]));
    S.list = (j.list || []).filter(p => p.price != null).sort((a, b) => ORDER.indexOf(a.s) - ORDER.indexOf(b.s));
    S.at = Date.now();
    if (!document.querySelector('.mx-tile[data-s]')) tiles();
    else for (const p of S.list) {
      const b = root.querySelector(`.mx-tile[data-s="${p.s}"]`); if (!b) continue;
      const pv = b.querySelector('[data-p]'); pv.textContent = price(p.price);
      if (prev[p.s] != null && prev[p.s] !== p.price) { b.classList.remove('up', 'dn'); void b.offsetWidth; b.classList.add(p.price > prev[p.s] ? 'up' : 'dn'); }
      const e = b.querySelector('.v em'); e.className = dir(p.chg); e.textContent = pct(p.chg) + ' 24h';
    }
    head();
    // the focused chart's last point follows the live price between reads
    const cur = S.list.find(p => p.s === S.sel);
    if (cur && S.pts.length) { S.pts[S.pts.length - 1] = [Date.now(), cur.price]; draw(); }
  }

  // ---------------------------------------------------------------- the big chart
  function head() {
    const p = S.list.find(x => x.s === S.sel) || { s: S.sel, name: '' };
    $('#mxSym').textContent = p.s; $('#mxName').textContent = p.name || '';
    $('#mxPrice').textContent = price(p.price);
    const ys = S.pts.map(x => x[1]), ch = ys.length > 1 ? (ys[ys.length - 1] / ys[0] - 1) * 100 : p.chg;
    const e = $('#mxChg'); e.className = dir(ch); e.textContent = ch == null ? '' : `${pct(ch)} · ${S.r}`;
    root.querySelectorAll('.mx-r button').forEach(b => b.classList.toggle('on', b.dataset.r === S.r));
    const st = $('#mxStats');
    if (ys.length > 1) {
      const hi = Math.max(...ys), lo = Math.min(...ys);
      st.innerHTML = `<span>open <b>${price(ys[0])}</b></span><span>high <b>${price(hi)}</b></span><span>low <b>${price(lo)}</b></span><span>last <b>${price(ys[ys.length - 1])}</b></span><span>points <b>${ys.length}</b></span>`;
    } else st.innerHTML = '';
  }
  let seq = 0;
  async function load(sym, r) {
    const my = ++seq; S.loading = true; $('#mxLoad').hidden = false; $('#mxLoad').textContent = 'reading the chart…';
    const bar = $('.mx-prog i'); bar.style.transition = 'none'; bar.style.width = '0'; void bar.offsetWidth; bar.style.transition = ''; bar.style.width = '70%';
    const j = await getJ(`/api/mkt?op=chart&s=${encodeURIComponent(sym)}&r=${r}`);
    if (my !== seq) return;
    S.loading = false; bar.style.width = '100%'; setTimeout(() => { bar.style.width = '0'; }, 500);
    if (!j || !j.ok || !j.pts || j.pts.length < 2) { S.pts = []; $('#mxLoad').textContent = (j && j.error) || 'no chart for this one right now'; $('#mxSrc').textContent = ''; head(); draw(); return; }
    S.pts = j.pts; $('#mxLoad').hidden = true;
    $('#mxSrc').textContent = `${j.pts.length} points · ${j.src}${j.pool ? ' pool' : ''}`;
    head(); anim();
  }
  let animK = 1;
  function anim() { if (reduce) { animK = 1; draw(); return; } const t0 = performance.now(); (function f(t) { animK = Math.min(1, (t - t0) / 650); draw(); if (animK < 1) requestAnimationFrame(f); })(t0); }
  function css(v, d) { return getComputedStyle(root).getPropertyValue(v).trim() || d; }
  function draw() {
    const box = cv.parentElement.getBoundingClientRect(), w = Math.max(280, box.width), h = Math.max(200, box.height), dpr = Math.min(2, devicePixelRatio || 1);
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.width = w + 'px'; cv.style.height = h + 'px'; }
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    const ink = css('--ink', '#16181b'), line = css('--line', '#e5e7ea'), dim = css('--dim', '#777c83'), red = css('--red', '#c4302b');
    const P = S.pts; if (P.length < 2) return;
    const n = Math.max(2, Math.round(P.length * (animK < 1 ? .15 + .85 * (1 - Math.pow(1 - animK, 3)) : 1)));
    const ys = P.map(p => p[1]), lo = Math.min(...ys), hi = Math.max(...ys), pad = (hi - lo) * .14 || hi * .01 || 1;
    const L = 64, R = 16, T = 16, B = 28, X = i => L + i / (P.length - 1) * (w - L - R), Y = v => T + (1 - (v - (lo - pad)) / ((hi + pad) - (lo - pad))) * (h - T - B);
    const up = ys[ys.length - 1] >= ys[0], col = up ? ink : red;
    // grid + price labels
    g.font = '11px JBM, ui-monospace, monospace'; g.fillStyle = dim; g.strokeStyle = line; g.lineWidth = 1;
    for (let k = 0; k <= 4; k++) { const v = lo - pad + (hi + pad - (lo - pad)) * k / 4, y = Y(v); g.beginPath(); g.moveTo(L, y); g.lineTo(w - R, y); g.stroke(); g.fillText(price(v).replace('$', ''), 6, y + 4); }
    // time labels
    for (let k = 0; k <= 4; k++) { const i = Math.round(k / 4 * (P.length - 1)), d = new Date(P[i][0]); const tx = S.r === '1h' || S.r === '1d' ? d.toTimeString().slice(0, 5) : d.toISOString().slice(5, 10); g.fillText(tx, Math.min(w - R - 34, Math.max(L, X(i) - 16)), h - 8); }
    // open line
    g.setLineDash([3, 5]); g.beginPath(); g.moveTo(L, Y(ys[0])); g.lineTo(w - R, Y(ys[0])); g.stroke(); g.setLineDash([]);
    // area + line
    const grd = g.createLinearGradient(0, T, 0, h - B); grd.addColorStop(0, up ? 'rgba(11,12,14,.10)' : 'rgba(196,48,43,.10)'); grd.addColorStop(1, 'rgba(11,12,14,0)');
    g.beginPath(); for (let i = 0; i < n; i++) i ? g.lineTo(X(i), Y(ys[i])) : g.moveTo(X(i), Y(ys[i])); g.lineTo(X(n - 1), h - B); g.lineTo(X(0), h - B); g.closePath(); g.fillStyle = grd; g.fill();
    g.beginPath(); for (let i = 0; i < n; i++) i ? g.lineTo(X(i), Y(ys[i])) : g.moveTo(X(i), Y(ys[i])); g.strokeStyle = col; g.lineWidth = 2; g.lineJoin = 'round'; g.stroke();
    // the live end
    if (animK >= 1) { const x = X(P.length - 1), y = Y(ys[ys.length - 1]); g.fillStyle = col; g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); g.globalAlpha = .18 + .12 * Math.sin(performance.now() / 300); g.beginPath(); g.arc(x, y, 10, 0, 7); g.fill(); g.globalAlpha = 1; }
    // crosshair
    if (S.hov >= 0 && S.hov < P.length && animK >= 1) {
      const x = X(S.hov), y = Y(ys[S.hov]); g.strokeStyle = dim; g.lineWidth = 1; g.beginPath(); g.moveTo(x, T); g.lineTo(x, h - B); g.moveTo(L, y); g.lineTo(w - R, y); g.stroke();
      g.fillStyle = css('--panel', '#fff'); g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); g.stroke();
      const d = new Date(P[S.hov][0]), ch = (ys[S.hov] / ys[0] - 1) * 100;
      tip.hidden = false; tip.innerHTML = `<b>${price(ys[S.hov])}</b><span class="${dir(ch)}">${pct(ch)}</span><em>${S.r === '1h' || S.r === '1d' ? d.toTimeString().slice(0, 5) : d.toISOString().slice(0, 16).replace('T', ' ')}</em>`;
      tip.style.left = Math.min(w - 190, Math.max(0, x - 80)) + 'px'; tip.style.top = Math.max(0, y - 52) + 'px';
    } else tip.hidden = true;
  }
  const at = e => { const r = cv.getBoundingClientRect(), x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left; return Math.round((x - 64) / (r.width - 80) * (S.pts.length - 1)); };
  cv.addEventListener('pointermove', e => { if (S.pts.length < 2) return; S.hov = Math.max(0, Math.min(S.pts.length - 1, at(e))); draw(); });
  cv.addEventListener('pointerleave', () => { S.hov = -1; draw(); });
  new ResizeObserver(() => draw()).observe(cv.parentElement);
  setInterval(() => { if (!document.hidden && animK >= 1 && S.hov < 0) draw(); }, 120);   // the live dot breathes

  // ---------------------------------------------------------------- choosing
  function pick(sym, r = S.r) {
    if (sym === S.sel && r === S.r && S.pts.length) return;
    S.sel = sym; S.r = r; S.hov = -1;
    root.querySelectorAll('.mx-tile').forEach(b => b.classList.toggle('on', b.dataset.s === sym));
    $('.mx-focus').classList.remove('swap'); void $('.mx-focus').offsetWidth; $('.mx-focus').classList.add('swap');
    head(); load(sym, r); sfx('tick');
    try { localStorage.setItem('nfa:mx', JSON.stringify({ s: sym, r })); } catch {}
  }
  root.addEventListener('click', e => {
    const t = e.target.closest('.mx-tile[data-s]'); if (t) return pick(t.dataset.s);
    const r = e.target.closest('.mx-r button[data-r]'); if (r) return pick(S.sel, r.dataset.r);
  });
  addEventListener('keydown', e => {
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    const n = +e.key; if (n >= 1 && n <= S.list.length) { pick(S.list[n - 1].s); return; }
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const i = RANGES.indexOf(S.r) + (e.key === 'ArrowRight' ? 1 : -1); if (i >= 0 && i < RANGES.length) pick(S.sel, RANGES[i]); }
    if (e.key === 'Escape') location.href = '/?back';
  });
  const clock = () => { $('#mxClock').textContent = new Date().toTimeString().slice(0, 8) + (S.at ? ` · prices ${Math.max(0, Math.round((Date.now() - S.at) / 1000))}s ago` : ''); };
  setInterval(clock, 1000); clock();

  // ---------------------------------------------------------------- start
  try { const sv = JSON.parse(localStorage.getItem('nfa:mx') || 'null'); if (sv && ORDER.includes(sv.s)) S.sel = sv.s; if (sv && RANGES.includes(sv.r)) S.r = sv.r; } catch {}
  tiles(); head();
  prices().then(() => { tiles(); minis(); });
  load(S.sel, S.r);
  setInterval(() => { if (!document.hidden) prices(); }, 15000);
  setInterval(() => { if (!document.hidden && !S.loading) { const s = S.sel, r = S.r; getJ(`/api/mkt?op=chart&s=${encodeURIComponent(s)}&r=${r}`).then(j => { if (j && j.ok && j.pts && j.pts.length > 1 && s === S.sel && r === S.r) { S.pts = j.pts; head(); draw(); } }); } }, 60000);
  return { root };
}
