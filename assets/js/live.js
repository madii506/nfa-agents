// nfa live: the market pane's other two tabs (crypto, and pump.fun as it happens), the tape under the header, and the
// commands behind them: crypto, price <coin> (a chart you can scrub), pump (the newest pump.fun coins) and pump <mint>.
// pump.fun streams in from PumpPortal's public websocket; prices come from Coinbase and Jupiter through /api/mkt;
// a coin's curve is read from the chain. Nothing here is made up: a dash means no data yet.
export function install(T) {
  const { print, k, esc, spinner, api } = T;
  const $ = s => document.querySelector(s);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const img = (u, w = 64) => u ? `https://wsrv.nl/?url=${encodeURIComponent(u)}&w=${w}&h=${w}&fit=cover&output=webp&q=80` : '';
  const usd = v => v == null || !isFinite(v) ? '—' : v >= 1e9 ? '$' + (v / 1e9).toFixed(2) + 'B' : v >= 1e6 ? '$' + (v / 1e6).toFixed(2) + 'M' : v >= 1e4 ? '$' + (v / 1e3).toFixed(1) + 'K' : v >= 1000 ? '$' + (v / 1e3).toFixed(2) + 'K' : '$' + Math.round(v);
  const price = v => v == null || !isFinite(v) ? '—' : v >= 1000 ? '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 }) : v >= 1 ? '$' + v.toFixed(2) : v >= .01 ? '$' + v.toFixed(4) : '$' + v.toPrecision(3);
  const pct = v => v == null || !isFinite(v) ? '—' : (v >= 0 ? '+' : '') + v.toFixed(Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2) + '%';
  const dir = v => v == null ? '' : v >= 0 ? 'up' : 'dn';
  const ago = t => { const s = Math.max(0, (Date.now() - t) / 1000); return s < 60 ? Math.floor(s) + 's' : s < 3600 ? Math.floor(s / 60) + 'm' : s < 86400 ? Math.floor(s / 3600) + 'h' : Math.floor(s / 86400) + 'd'; };
  const short = a => a ? a.slice(0, 4) + '…' + a.slice(-4) : '';
  const isMint = s => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s || '');
  const visible = () => document.visibilityState === 'visible';
  let PX = null; import('./px.js').then(m => { PX = m; }).catch(() => {});
  const faces = {}; const face = m => faces[m] || (PX ? (faces[m] = PX.canvas(PX.hashSeed(m), 4).toDataURL()) : '');

  // ================================================================ crypto: SOL, BTC, ETH and a few Solana names
  let prices = [], pState = 'reading', pAt = 0;
  const solUsd = () => { const s = prices.find(p => p.s === 'SOL'); return s ? s.price : null; };
  async function loadPrices() {
    try {
      const j = await api('/api/mkt?op=prices', { timeout: 15000 }); if (!j.ok) throw new Error(j.error);
      const prev = Object.fromEntries(prices.map(p => [p.s, p.price]));
      prices = (j.list || []).filter(p => p.price != null); pState = prices.length ? 'live' : 'offline'; pAt = Date.now();
      paintCrypto(prev); paintTapeCrypto(prev); repaintPump();
      T.livePrices = prices;
    } catch { pState = prices.length ? 'stale' : 'offline'; paintCrypto({}); }
  }
  const spark = (pts, w = 72, h = 22) => {
    if (!pts || pts.length < 2) return '';
    const lo = Math.min(...pts), hi = Math.max(...pts), r = hi - lo || 1;
    return `<svg class="sp ${pts[pts.length - 1] >= pts[0] ? 'up' : 'dn'}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts.map((v, i) => `${(i / (pts.length - 1) * w).toFixed(1)},${(h - 2 - (v - lo) / r * (h - 4)).toFixed(1)}`).join(' ')}"/></svg>`;
  };
  function paintCrypto(prev) {
    const el = $('#mktC'); if (!el) return;
    setState('crypto', pState === 'live' ? 'live · ' + new Date(pAt).toTimeString().slice(0, 5) : pState === 'stale' ? 'stale · retrying' : pState);
    if (!prices.length) { el.innerHTML = `<div class="mnote">${pState === 'offline' ? 'Prices didn’t load. Retrying shortly.' : 'Reading prices…'}</div>`; return; }
    el.innerHTML = `<div class="crow hd"><span>coin</span><span>24h</span><span>price</span><span>24h</span></div>` + prices.map((p, i) =>
      `<div class="crow${prev[p.s] != null && prev[p.s] !== p.price ? ' tick ' + (p.price > prev[p.s] ? 'up' : 'dn') : ''}" data-s="${esc(p.s)}" title="chart ${esc(p.s)}" style="animation-delay:${i * 30}ms"><span class="sy"><b>${esc(p.s)}</b><em>${esc(p.name)}</em></span>${spark(p.spark) || '<span class="sp none"></span>'}<span class="px">${price(p.price)}</span><span class="ch ${dir(p.chg)}">${pct(p.chg)}</span></div>`).join('')
      + `<div class="mfoot">sol, btc, eth from coinbase · solana tokens from jupiter · click one for its chart</div>`;
  }

  // ================================================================ pump.fun, live
  const P = { list: [], by: new Map(), hot: [], hotAt: 0, ws: null, state: 'connecting', subs: new Set(), creates: [], fails: 0, poll: 0, watch: new Map() };
  const WS_URL = 'wss://pumpportal.fun/api/data';
  function rec(x) { let r = P.by.get(x.mint); if (!r) { r = { mint: x.mint, t: Date.now(), trades: 0 }; P.by.set(x.mint, r); } return Object.assign(r, Object.fromEntries(Object.entries(x).filter(([, v]) => v != null))); }
  function mcapOf(r) { if (r.mcapSol != null && solUsd()) return r.mcapSol * solUsd(); return r.mcapUsd ?? null; }
  function addCoin(x, live) {
    if (P.by.has(x.mint) && P.list.some(r => r.mint === x.mint)) { rec(x); return; }
    const r = rec(x); P.list.unshift(r); P.list.sort((a, b) => b.t - a.t);
    if (P.list.length > 60) for (const o of P.list.splice(60)) { if (!P.watch.has(o.mint)) P.by.delete(o.mint); }
    if (live) { P.creates.push(Date.now()); newRow(r); tapeCoin(r); }
    if (!r.icon) meta(r);
  }
  // pictures: the coin's own metadata first (its uri), Jupiter for the ones that don't answer
  const mq = []; let mActive = 0;
  function meta(r) { if (r.uri && !r._m) { r._m = 1; mq.push(r); pumpMeta(); } }
  function pumpMeta() {
    while (mActive < 3 && mq.length) {
      const r = mq.shift(); if (!P.by.has(r.mint)) continue; mActive++;
      const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 5000);
      fetch(r.uri, { signal: ctl.signal }).then(x => x.json()).then(j => { if (j && typeof j.image === 'string') { r.icon = j.image; if (!r.x && j.twitter) r.x = String(j.twitter); if (!r.web && j.website) r.web = String(j.website); paintRow(r); tapeIcon(r); } }).catch(() => {}).finally(() => { clearTimeout(to); mActive--; pumpMeta(); });
    }
  }
  async function jupFill() {
    const need = P.list.filter(r => (!r.icon || r.mcapSol == null && r.mcapUsd == null) && Date.now() - r.t > 6000 && !r._j).slice(0, 30);
    if (!need.length) return;
    need.forEach(r => { r._j = 1; });
    try { const j = await api('/api/mkt?op=tokens&ids=' + need.map(r => r.mint).join(','), { timeout: 15000 }); if (j.ok) for (const t of j.list) { const r = P.by.get(t.mint); if (r) { if (!r.icon && t.icon) r.icon = t.icon; if (t.mcap != null && r.mcapSol == null) r.mcapUsd = t.mcap; r.holders = t.holders; paintRow(r); tapeIcon(r); } } } catch {}
  }
  async function seed() {
    try {
      const j = await api('/api/mkt?op=pump&k=new', { timeout: 15000 }); if (!j.ok) return;
      for (const t of j.list.slice().reverse()) addCoin({ mint: t.mint, name: t.name, symbol: t.symbol, icon: t.icon, mcapUsd: t.mcap, holders: t.holders, t: t.created ? Date.parse(t.created) || Date.now() : Date.now() }, false);
      renderPump();
    } catch {}
  }
  function connect() {
    if (P.ws && P.ws.readyState <= 1) return;
    let ws; try { ws = new WebSocket(WS_URL); } catch { return fallback(); }
    P.ws = ws; P.state = 'connecting'; paintPumpState();
    ws.onopen = () => { P.state = 'live'; P.fails = 0; P.subs = new Set(); ws.send(JSON.stringify({ method: 'subscribeNewToken' })); ws.send(JSON.stringify({ method: 'subscribeMigration' })); syncSubs(); paintPumpState(); };
    ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch { return; } onMsg(m); };
    ws.onclose = () => { if (P.ws !== ws) return; P.ws = null; P.state = 'reconnecting'; paintPumpState(); if (++P.fails >= 3) fallback(); if (!document.hidden) setTimeout(connect, Math.min(30000, 1500 * 2 ** P.fails)); };
    ws.onerror = () => { try { ws.close(); } catch {} };
  }
  function fallback() { if (P.poll) return; P.state = P.state === 'live' ? 'live' : 'polling'; paintPumpState(); P.poll = setInterval(() => { if (visible() && (!P.ws || P.ws.readyState !== 1)) seed(); }, 12000); }
  function syncSubs() {
    const ws = P.ws; if (!ws || ws.readyState !== 1) return;
    const want = new Set([...P.list.slice(0, 10).map(r => r.mint), ...P.watch.keys(), ...(T.coins || []).slice(0, 20).map(c => c.mint)]);
    const add = [...want].filter(m => !P.subs.has(m)), del = [...P.subs].filter(m => !want.has(m));
    try { if (add.length) ws.send(JSON.stringify({ method: 'subscribeTokenTrade', keys: add })); if (del.length) ws.send(JSON.stringify({ method: 'unsubscribeTokenTrade', keys: del })); P.subs = want; } catch {}
  }
  function onMsg(m) {
    if (!m || !m.mint) return;
    if (m.txType === 'create') { if (m.pool && m.pool !== 'pump') return; addCoin({ mint: m.mint, name: String(m.name || '').slice(0, 48), symbol: String(m.symbol || '').slice(0, 16), uri: m.uri, mcapSol: +m.marketCapSol || null, dev: m.traderPublicKey, buySol: +m.solAmount || 0, t: Date.now() }, true); return; }
    if (m.txType === 'buy' || m.txType === 'sell') {
      const r = P.by.get(m.mint);
      if (r) { r.mcapSol = +m.marketCapSol || r.mcapSol; r.trades++; r.last = m.txType; flashRow(r, m.txType); }
      const w = P.watch.get(m.mint); if (w) w(m);
      const mine = (T.coins || []).find(c => c.mint === m.mint);
      if (mine && T.agentLog) T.agentLog(`<b>$${esc(mine.symbol)}</b> ${m.txType} ${(+m.solAmount || 0).toFixed(3)} ◎ · mcap ${usd((+m.marketCapSol || 0) * (solUsd() || 0))}`);
      return;
    }
    if (/migrat/.test(String(m.txType || '')) || m.pool === 'pump-amm') { const r = P.by.get(m.mint); if (r) { r.grad = true; paintRow(r); } tapeNote(`<b>${esc(r ? '$' + r.symbol : short(m.mint))}</b> graduated to pumpswap`); }
  }
  const perMin = () => { const now = Date.now(); P.creates = P.creates.filter(t => now - t < 60000); return P.creates.length; };

  // ---- the pump.fun tab
  let pk = 'new';
  function paintPumpState() {
    const n = perMin();
    setState('pump', P.state === 'live' ? `live · ${n} new a minute` : P.state === 'polling' ? 'every 12s · via jupiter' : P.state);
    const d = $('#mtabs [data-m="pump"] i'); if (d) d.className = P.state === 'live' ? 'on' : '';
    const t = $('#ltape .lt-l .dot'); if (t) t.classList.toggle('on', P.state === 'live');
  }
  function rowHtml(r) {
    const m = mcapOf(r), pic = r.icon ? img(r.icon, 64) : face(r.mint);
    return `<span class="im"><img src="${esc(pic)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"></span><span class="nm"><b>$${esc(r.symbol || '?')}</b><em>${esc(r.name || '')}</em></span><span class="mc">${usd(m)}</span><span class="ag" data-t="${r.t}">${r.grad ? 'grad' : ago(r.t)}</span>`;
  }
  function renderPump() {
    const el = $('#mktP'); if (!el) return;
    const head = `<div class="ptab2"><button type="button" data-k="new" class="${pk === 'new' ? 'on' : ''}">new</button><button type="button" data-k="hot" class="${pk === 'hot' ? 'on' : ''}">trending 5m</button><span>${pk === 'new' ? 'newest first · click one' : 'by jupiter’s 5-minute trend'}</span></div>`;
    if (pk === 'hot') {
      if (!P.hot.length) { el.innerHTML = head + '<div class="mnote">Reading what’s moving on pump.fun…</div>'; loadHot(); return; }
      el.innerHTML = head + `<div class="plist">${P.hot.map((t, i) => `<div class="prow" data-mint="${esc(t.mint)}" style="animation-delay:${i * 24}ms"><span class="im"><img src="${esc(t.icon ? img(t.icon, 64) : face(t.mint))}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"></span><span class="nm"><b>$${esc(t.symbol)}</b><em>${esc(t.name)}</em></span><span class="mc">${usd(t.mcap)}</span><span class="ch ${dir(t.ch5m)}">${pct(t.ch5m)}</span></div>`).join('')}</div>`;
      return;
    }
    if (!P.list.length) { el.innerHTML = head + `<div class="mnote">${P.state === 'live' ? 'Listening for the next pump.fun launch…' : 'Connecting to pump.fun…'}</div>`; return; }
    el.innerHTML = head + `<div class="plist" id="plist">${P.list.slice(0, 40).map(r => `<div class="prow" data-mint="${esc(r.mint)}">${rowHtml(r)}</div>`).join('')}</div>`;
  }
  let rp = 0; function repaintPump() { clearTimeout(rp); rp = setTimeout(() => { if (pk === 'new') { document.querySelectorAll('#plist .prow').forEach(row => { const r = P.by.get(row.dataset.mint); if (r) row.querySelector('.mc').textContent = usd(mcapOf(r)); }); } }, 100); }
  function newRow(r) {
    const list = $('#plist'); if (!list || pk !== 'new' || $('#mktP').hidden) { if (pk === 'new' && $('#mktP') && !$('#mktP').hidden && !list) renderPump(); return; }
    const row = document.createElement('div'); row.className = 'prow in'; row.dataset.mint = r.mint; row.innerHTML = rowHtml(r);
    list.prepend(row); while (list.children.length > 40) list.lastChild.remove();
  }
  function paintRow(r) { const row = document.querySelector(`#plist .prow[data-mint="${r.mint}"]`); if (row) { const was = row.className; row.innerHTML = rowHtml(r); row.className = was.replace(/\b(in|b|s)\b/g, '').trim(); } }
  function flashRow(r, kind) {
    const row = document.querySelector(`#plist .prow[data-mint="${r.mint}"]`); if (!row) return;
    row.querySelector('.mc').textContent = usd(mcapOf(r));
    row.classList.remove('b', 's', 'in'); void row.offsetWidth; row.classList.add(kind === 'buy' ? 'b' : 's');
  }
  async function loadHot() {
    if (Date.now() - P.hotAt < 30000 && P.hot.length) return;
    P.hotAt = Date.now();
    try { const j = await api('/api/mkt?op=pump&k=hot', { timeout: 15000 }); if (j.ok) { P.hot = j.list; if (pk === 'hot') renderPump(); } } catch {}
  }

  // ================================================================ the tape under the header
  function paintTapeCrypto(prev = {}) {
    const el = $('#ltC'); if (!el) return;
    el.innerHTML = prices.filter(p => ['SOL', 'BTC', 'ETH', 'PUMP'].includes(p.s)).map(p => `<button type="button" class="lt-x${prev[p.s] != null && prev[p.s] !== p.price ? ' tick ' + (p.price > prev[p.s] ? 'up' : 'dn') : ''}" data-s="${esc(p.s)}"><b>${esc(p.s)}</b><span>${price(p.price)}</span><em class="${dir(p.chg)}">${pct(p.chg)}</em></button>`).join('');
  }
  function tapeCoin(r) {
    const el = $('#ltP'); if (!el || document.hidden) return;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'lt-p1'; b.dataset.mint = r.mint;
    b.innerHTML = `<img src="${esc(r.icon ? img(r.icon, 40) : face(r.mint))}" alt="" onerror="this.style.visibility='hidden'"><b>$${esc(r.symbol || '?')}</b><span>${usd(mcapOf(r))}</span>`;
    el.prepend(b); while (el.children.length > 14) el.lastChild.remove();
  }
  function tapeIcon(r) { const b = document.querySelector(`#ltP [data-mint="${r.mint}"] img`); if (b && r.icon) { b.src = img(r.icon, 40); b.style.visibility = ''; } }
  function tapeNote(html) { const el = $('#ltP'); if (!el) return; const b = document.createElement('span'); b.className = 'lt-p1 note'; b.innerHTML = html; el.prepend(b); while (el.children.length > 14) el.lastChild.remove(); }

  // ================================================================ the market pane's tabs
  const states = {};
  function setState(tab, s) { states[tab] = s; const cur = currentTab(); if (cur === tab) { const e = $('#mktState'); if (e) e.textContent = s; } }
  const currentTab = () => { const b = $('#mtabs button.on'); return b ? b.dataset.m : 'nfts'; };
  function tab(m, quiet) {
    const tabs = $('#mtabs'); if (!tabs) return;
    tabs.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.m === m));
    $('#mkt').hidden = m !== 'nfts'; $('#mktC').hidden = m !== 'crypto'; $('#mktP').hidden = m !== 'pump';
    if (m === 'nfts') { const s = T.market && T.market.state && T.market.state(); const e = $('#mktState'); if (e && s) e.textContent = s === 'live' ? 'live · magic eden' : s; }
    else if (states[m]) $('#mktState').textContent = states[m];
    if (m === 'pump') renderPump(); if (m === 'crypto') paintCrypto({});
    T.store.set('nfa:mtab', m); if (!quiet) T.sound && T.sound.sfx('tick');
  }
  T.marketTab = tab;

  // ================================================================ a chart you can scrub
  function css(v) { return getComputedStyle($('#app')).getPropertyValue(v).trim(); }
  function chartCard(o) {
    const el = document.createElement('div'); el.className = 'ccard';
    el.innerHTML = `<div class="cc-h"><span class="cc-im">${o.icon ? `<img src="${esc(img(o.icon, 80))}" alt="">` : ''}</span><div class="cc-t"><b>${esc(o.title)}</b><span>${esc(o.sub || '')}</span></div><div class="cc-p"><strong>${o.price != null ? price(o.price) : '—'}</strong><em class="${dir(o.chg)}">${o.chg != null ? pct(o.chg) + ' ' + (o.chgLabel || '24h') : ''}</em></div></div>
      <div class="cc-r">${['1h', '1d', '1w', '1m'].map(r => `<button type="button" data-r="${r}" class="${r === o.r ? 'on' : ''}">${r}</button>`).join('')}<span class="cc-st"></span></div>
      <div class="cc-c"><canvas></canvas><div class="cc-tip" hidden></div></div><div class="cc-f">${o.foot || ''}</div>`;
    const cv = el.querySelector('canvas'), tip = el.querySelector('.cc-tip'), st = el.querySelector('.cc-st');
    let pts = [], hov = -1, cur = o.r;
    async function load(r) {
      cur = r; el.querySelectorAll('.cc-r button').forEach(b => b.classList.toggle('on', b.dataset.r === r)); st.textContent = 'loading…';
      try { const j = await api(o.url(r), { timeout: 15000 }); if (!j.ok) throw new Error(j.error); pts = j.pts || []; st.textContent = pts.length ? `${pts.length} points · ${j.src}` : 'no trades in this window'; draw(); }
      catch (e) { pts = []; st.textContent = e.message || 'didn’t load'; draw(); }
    }
    function draw() {
      const w = Math.max(240, Math.min(680, el.clientWidth - 2)), h = 190, dpr = Math.min(2, devicePixelRatio || 1);
      cv.width = w * dpr; cv.height = h * dpr; cv.style.width = w + 'px'; cv.style.height = h + 'px';
      const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
      const hi = css('--hi') || '#000', line = css('--line') || '#e5e7ea', dim = css('--dim') || '#777', red = css('--red') || '#c4302b';
      if (pts.length < 2) { g.fillStyle = dim; g.font = '12px JBM, monospace'; g.fillText(pts.length ? 'one point so far' : '—', 12, h / 2); return; }
      const ys = pts.map(p => p[1]), lo = Math.min(...ys), hiV = Math.max(...ys), pad = (hiV - lo) * .12 || hiV * .01 || 1;
      const y0 = lo - pad, y1 = hiV + pad, X = i => 8 + i / (pts.length - 1) * (w - 16), Y = v => h - 18 - (v - y0) / (y1 - y0) * (h - 34);
      const up = ys[ys.length - 1] >= ys[0], col = up ? hi : red;
      g.strokeStyle = line; g.lineWidth = 1; g.setLineDash([3, 4]); g.beginPath(); g.moveTo(8, Y(ys[0])); g.lineTo(w - 8, Y(ys[0])); g.stroke(); g.setLineDash([]);
      const grd = g.createLinearGradient(0, 16, 0, h - 18); grd.addColorStop(0, up ? 'rgba(11,12,14,.10)' : 'rgba(196,48,43,.10)'); grd.addColorStop(1, 'rgba(11,12,14,0)');
      g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(X(i), Y(p[1])) : g.moveTo(X(i), Y(p[1]))); g.lineTo(X(pts.length - 1), h - 18); g.lineTo(X(0), h - 18); g.closePath(); g.fillStyle = grd; g.fill();
      g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(X(i), Y(p[1])) : g.moveTo(X(i), Y(p[1]))); g.strokeStyle = col; g.lineWidth = 1.6; g.lineJoin = 'round'; g.stroke();
      g.fillStyle = dim; g.font = '10.5px JBM, monospace'; g.fillText('high ' + price(hiV), 10, 12); const lt = 'low ' + price(lo); g.fillText(lt, 10, h - 4);
      const li = pts.length - 1; g.fillStyle = col; g.beginPath(); g.arc(X(li), Y(ys[li]), 3, 0, 7); g.fill();
      if (hov >= 0 && hov < pts.length) {
        const x = X(hov), y = Y(ys[hov]); g.strokeStyle = dim; g.lineWidth = 1; g.beginPath(); g.moveTo(x, 14); g.lineTo(x, h - 18); g.stroke();
        g.fillStyle = css('--panel') || '#fff'; g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); g.stroke();
        const d = new Date(pts[hov][0]), chg = (ys[hov] / ys[0] - 1) * 100;
        tip.hidden = false; tip.innerHTML = `<b>${price(ys[hov])}</b><span class="${dir(chg)}">${pct(chg)}</span><em>${cur === '1h' || cur === '1d' ? d.toTimeString().slice(0, 5) : d.toISOString().slice(5, 16).replace('T', ' ')}</em>`;
        tip.style.left = Math.min(w - 120, Math.max(0, x - 50)) + 'px';
      } else tip.hidden = true;
    }
    const at = e => { const r = cv.getBoundingClientRect(), x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left; return Math.round((x - 8) / (r.width - 16) * (pts.length - 1)); };
    cv.addEventListener('pointermove', e => { if (!pts.length) return; hov = Math.max(0, Math.min(pts.length - 1, at(e))); draw(); });
    cv.addEventListener('pointerleave', () => { hov = -1; draw(); });
    el.querySelector('.cc-r').addEventListener('click', e => { const b = e.target.closest('button[data-r]'); if (b) { T.sound && T.sound.sfx('tick'); load(b.dataset.r); } });
    T.node(el); load(o.r);
    const ro = new ResizeObserver(() => draw()); ro.observe(el);
    return el;
  }

  // ================================================================ commands
  T.reg('crypto', { desc: 'live prices: sol, btc, eth and solana names', alias: ['prices', 'majors'],
    async run() {
      tab('crypto', true);
      if (!prices.length) { const s = spinner('reading prices'); await loadPrices(); if (!prices.length) return s.fail('prices didn’t load. try again in a moment.'); s.done(`<b>${prices.length}</b> coins <span class="dim">· coinbase + jupiter</span>`); }
      const bars = '▁▂▃▄▅▆▇█', sl = a => { if (!a || a.length < 2) return '        '; const lo = Math.min(...a), hi = Math.max(...a), r = hi - lo || 1; return a.filter((_, i) => i % 3 === 0).map(v => bars[Math.round((v - lo) / r * 7)]).join(''); };
      print(`<span class="hdr">${'  coin'.padEnd(10)}${'price'.padStart(14)}${'24h'.padStart(10)}   ${T.cols() >= 56 ? 'last 24h' : ''}</span>`);
      for (const p of prices) print(`<span class="row" data-cmd="price ${esc(p.s)}">  ${esc(p.s.padEnd(8))}${esc(price(p.price).padStart(14))}<span class="${p.chg < 0 ? 'red' : 'hi'}">${esc(pct(p.chg).padStart(10))}</span>   ${T.cols() >= 56 ? `<span class="dim">${sl(p.spark)}</span>` : ''}</span>`);
      print('<span class="dim">click one for a chart you can scrub ·</span> ' + k('price sol') + ' ' + k('price btc 1w'));
    } });
  T.reg('price', { desc: 'a live chart: sol, btc, eth, jup, bonk, wif, pump, or any coin by mint', usage: 'price <coin> [1h|1d|1w|1m]', alias: ['chart-of', 'px'], complete: () => prices.map(p => p.s.toLowerCase()),
    async run(a) {
      const want = (a[0] || 'sol').replace(/^\$/, ''), r = ['1h', '1d', '1w', '1m'].includes(a[1]) ? a[1] : '1d';
      if (isMint(want)) return T.run('pump ' + want);
      if (!prices.length) await loadPrices();
      const p = prices.find(x => x.s === want.toUpperCase());
      if (!p) return print(`<span class="dim">no price for ${esc(want)}. try</span> ${prices.map(x => k('price ' + x.s.toLowerCase(), x.s.toLowerCase())).join('  ') || k('crypto')}`);
      tab('crypto', true);
      chartCard({ title: p.s, sub: p.name + ' · ' + (p.src === 'coinbase' ? 'coinbase' : 'jupiter + geckoterminal'), price: p.price, chg: p.chg, r, url: rr => `/api/mkt?op=chart&s=${encodeURIComponent(p.s)}&r=${rr}`,
        foot: p.high != null ? `24h high ${price(p.high)} · low ${price(p.low)} · move the pointer over the line to read it` : 'move the pointer over the line to read it' });
    } });
  T.reg('pump', { desc: 'pump.fun live: the newest coins, what’s trending, or one coin’s curve and trades', usage: 'pump [new|hot|<mint>]', alias: ['pumpfun', 'live'],
    complete: () => ['new', 'hot'],
    async run(a, { signal }) {
      const q = (a[0] || 'new').replace(/^\$/, '');
      if (q === 'new' || q === 'hot') {
        tab('pump', true); pk = q; renderPump();
        let list;
        if (q === 'hot') { const s = spinner('reading pump.fun’s 5-minute trend'); await loadHot(); list = P.hot.map(t => ({ mint: t.mint, symbol: t.symbol, name: t.name, m: t.mcap, ch: t.ch5m })); if (!list.length) return s.fail('nothing came back. try again in a moment.'); s.done(`<b>${list.length}</b> moving on pump.fun <span class="dim">· jupiter’s 5-minute trend</span>`); }
        else { if (!P.list.length) await seed(); list = P.list.slice(0, 15).map(r => ({ mint: r.mint, symbol: r.symbol, name: r.name, m: mcapOf(r), t: r.t })); if (!list.length) return print('<span class="dim">no launches seen yet. the pump.fun tab fills as they land.</span>'); print(`<b>newest on pump.fun</b> <span class="dim">· ${P.state === 'live' ? 'streaming live from pumpportal' : 'via jupiter'}</span>`); }
        const nw = T.cols() >= 60 ? 24 : 12;
        print(`<span class="hdr">${'  coin'.padEnd(14)}${T.cols() >= 60 ? 'name'.padEnd(nw) : ''}${'mcap'.padStart(10)}${(q === 'hot' ? '5m' : 'age').padStart(8)}</span>`);
        for (const x of list) print(`<span class="row" data-cmd="pump ${esc(x.mint)}">  ${esc(('$' + (x.symbol || '?')).slice(0, 12).padEnd(12))}${T.cols() >= 60 ? esc(String(x.name || '').slice(0, nw - 2).padEnd(nw)) : ''}${esc(usd(x.m).padStart(10))}${q === 'hot' ? `<span class="${x.ch < 0 ? 'red' : 'hi'}">${esc(pct(x.ch).padStart(8))}</span>` : esc(ago(x.t).padStart(8))}</span>`);
        print(`<span class="dim">click a coin for its curve, chart and live trades ·</span> ${k(q === 'hot' ? 'pump new' : 'pump hot')} ${k('launch', 'launch your own')}`);
        return;
      }
      // one coin
      let mint = q; if (!isMint(mint)) { const r = P.list.find(x => (x.symbol || '').toUpperCase() === q.toUpperCase()) || P.hot.find(x => (x.symbol || '').toUpperCase() === q.toUpperCase()); if (!r) return print(`<span class="dim">give a mint address, or a ticker from</span> ${k('pump new')}`); mint = r.mint; }
      const s = spinner('reading the coin, its curve and its chart');
      const [tj, cj] = await Promise.all([api('/api/mkt?op=tokens&ids=' + mint, { signal, timeout: 15000 }).catch(() => null), api('/api/mkt?op=curve&mint=' + mint, { signal, timeout: 15000 }).catch(() => null)]);
      const t = tj && tj.ok && tj.list[0], c = cj && cj.ok ? cj : null, r0 = P.by.get(mint);
      const sym = (t && t.symbol) || (r0 && r0.symbol) || short(mint), name = (t && t.name) || (r0 && r0.name) || '';
      s.done(`<b>$${esc(sym)}</b> <span class="dim">${esc(name)} · ${esc(mint)}</span>`);
      const mc = c && c.exists && c.mcapSol != null && solUsd() ? c.mcapSol * solUsd() : t ? t.mcap : r0 ? mcapOf(r0) : null;
      const prog = c && c.exists ? (c.complete ? 'graduated' : (c.progress * 100).toFixed(1) + '%') : t && t.curve != null ? t.curve.toFixed(1) + '%' : '—';
      const card = chartCard({ title: '$' + sym, sub: name, icon: (t && t.icon) || (r0 && r0.icon), price: t ? t.usd : null, chg: t ? t.ch1h : null, chgLabel: '1h', r: '1h', url: rr => `/api/mkt?op=chart&mint=${mint}&r=${rr}`,
        foot: `<div class="pc-g"><span>market cap <b>${usd(mc)}</b></span><span>bonding curve <b>${prog}</b></span><span>holders <b>${t && t.holders != null ? t.holders.toLocaleString() : '—'}</b></span><span>1h volume <b>${t && t.vol1h != null ? usd(t.vol1h) : '—'}</b></span></div>
          ${c && c.exists && !c.complete ? `<div class="pc-bar"><i style="width:${Math.max(1, c.progress * 100).toFixed(1)}%"></i></div>` : ''}
          <div class="pc-t" aria-live="polite"><span class="dim">live trades appear here as they happen</span></div>
          <div class="btnrow"><a class="tb pri" href="https://pump.fun/coin/${esc(mint)}" target="_blank" rel="noopener">open on pump.fun ↗</a><a class="tb" href="https://dexscreener.com/solana/${esc(mint)}" target="_blank" rel="noopener">dexscreener ↗</a><a class="tb" href="https://solscan.io/token/${esc(mint)}" target="_blank" rel="noopener">solscan ↗</a><button type="button" class="tb k" data-cmd="launch">launch your own, paired with an NFT</button></div>` });
      // stream its trades into the card for five minutes
      const tape = card.querySelector('.pc-t'); let n = 0;
      for (const [m] of P.watch) if (m !== mint && P.watch.size > 3) P.watch.delete(m);
      P.watch.set(mint, m => {
        if (!document.body.contains(card)) { P.watch.delete(mint); return; }
        if (!n++) tape.innerHTML = '';
        const line = document.createElement('div'); line.className = 'pc-tr ' + (m.txType === 'buy' ? 'b' : 's');
        line.innerHTML = `<span>${new Date().toTimeString().slice(0, 8)}</span><b>${m.txType}</b><span>${(+m.solAmount || 0).toFixed(3)} ◎</span><span>${esc(short(m.traderPublicKey || ''))}</span><span>mcap ${usd((+m.marketCapSol || 0) * (solUsd() || 0))}</span>`;
        tape.prepend(line); while (tape.children.length > 8) tape.lastChild.remove();
      });
      setTimeout(() => P.watch.delete(mint), 300000); syncSubs();
      if (P.state !== 'live') tape.innerHTML = '<span class="dim">the live trade stream is reconnecting; the chart and numbers above are current.</span>';
    } });

  // ================================================================ wiring and clocks
  document.addEventListener('click', e => {
    const t = e.target;
    const cta = t.closest('.pcta[data-run]'); if (cta) { T.sound && T.sound.sfx('open'); return T.run(cta.dataset.run); }
    const mt = t.closest('#mtabs button[data-m]'); if (mt) return tab(mt.dataset.m);
    const cr = t.closest('#mktC .crow[data-s], #ltC [data-s]'); if (cr) return T.run('price ' + cr.dataset.s.toLowerCase());
    const pr = t.closest('#mktP .prow[data-mint], #ltP [data-mint]'); if (pr) return T.run('pump ' + pr.dataset.mint);
    const p2 = t.closest('#mktP .ptab2 button[data-k]'); if (p2) { pk = p2.dataset.k; renderPump(); T.sound && T.sound.sfx('tick'); }
  });
  setInterval(() => { if (!visible()) return; document.querySelectorAll('#plist .ag[data-t]').forEach(a => { if (a.textContent !== 'grad') a.textContent = ago(+a.dataset.t); }); paintPumpState(); }, 1000);
  setInterval(() => { if (visible()) syncSubs(); }, 4000);
  setInterval(() => { if (visible()) jupFill(); }, 9000);
  setInterval(() => { if (visible()) loadPrices(); }, 20000);
  setInterval(() => { if (visible() && pk === 'hot' && !$('#mktP').hidden) { P.hotAt = 0; loadHot(); } }, 45000);
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = Date.now(); setTimeout(() => { if (document.hidden && P.ws) { const w = P.ws; P.ws = null; P.state = 'paused'; try { w.close(); } catch {} } }, 60000); }
    else { if (!P.ws) connect(); if (Date.now() - hiddenAt > 20000) loadPrices(); }
  });
  const saved = T.store.get('nfa:mtab'); tab(['nfts', 'crypto', 'pump'].includes(saved) ? saved : 'nfts', true);
  loadPrices(); seed().then(() => { renderPump(); });
  setTimeout(connect, 600);
  T.live = { prices: () => prices, pump: () => P.list, state: () => P.state };
}
