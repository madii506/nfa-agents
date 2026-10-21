// nfa market: Magic Eden in the terminal (top, scan, pick, view, floor, watch, info), the market pane, and the
// agent's loop: it reads one trending collection at a time and logs the listing it would pick. All of it is live data.
export function install(T) {
  const { print, k, esc, spinner, api, sleep } = T;
  let popular = [], mstate = 'reading', idx = 0, last = null; const seen = new Set();
  const img = (u, w = 240) => u ? `https://wsrv.nl/?url=${encodeURIComponent(u)}&w=${w}&h=${w}&fit=cover&output=webp&q=82` : '';
  const sol = v => v == null || !isFinite(v) ? '—' : v >= 1000 ? Math.round(v).toLocaleString() : v >= 100 ? v.toFixed(1) : v >= 1 ? v.toFixed(2) : v >= .01 ? v.toFixed(3) : v.toFixed(4);
  const vs = (p, f) => p != null && f ? (p / f - 1) * 100 : null;
  const pc = x => x == null ? '—' : (x >= 0 ? '+' : '') + x.toFixed(1) + '%';
  const me = (op, c, o) => api(`/api/me?op=${op}${c ? '&c=' + encodeURIComponent(c) : ''}`, o);
  const ME = c => `https://magiceden.io/marketplace/${encodeURIComponent(c)}`, ITEM = m => `https://magiceden.io/item-details/${encodeURIComponent(m)}`;
  const need = (a, cmd) => { const c = (a[0] || '').toLowerCase().replace(/^@/, ''); if (!c) { print(`<span class="dim">which collection? try</span> ${popular.slice(0, 5).map(p => k(cmd + ' ' + p.c, p.c)).join('  ') || k(cmd + ' mad_lads', 'mad_lads')} <span class="dim">or</span> ${k('top')}`); return null; } return c; };
  const symbols = () => popular.map(p => p.c);
  const hhmm = () => new Date().toTimeString().slice(0, 5);

  T.market = { first: () => popular[0] && popular[0].c, state: () => mstate, summary: () => ({ seen: seen.size, last }), symbols, list: () => popular, nameOf: c => { const p = popular.find(x => x.c === c); return p ? p.name : ''; } };

  // ---------------------------------------------------------------- the market pane
  const pane = document.querySelector('#mkt'), pstate0 = document.querySelector('#mktState');
  const pstate = { set textContent(t) { if (!pane.hidden && pstate0) pstate0.textContent = t; } };
  let prevFloors = {};
  function paneRender() {
    if (!popular.length) { pane.innerHTML = `<div class="mnote">${mstate === 'offline' ? 'Magic Eden didn’t answer. Retrying in a minute.' : 'Reading the market…'}</div>`; return; }
    const vmax = Math.max(...popular.map(p => p.vol7 || 0)) || 1;
    pane.innerHTML = `<div class="mrow hd"><span>#</span><span></span><span>collection</span><span>floor ◎</span><span>listed</span></div>` + popular.slice(0, 80).map((p, i) =>
      `<div class="mrow${prevFloors[p.c] != null && prevFloors[p.c] !== p.floor ? ' flash' : ''}" data-c="${esc(p.c)}" title="scan ${esc(p.c)}" style="animation-delay:${Math.min(i, 20) * 30}ms"><span class="n">${String(i + 1).padStart(2, '0')}</span>${p.image ? `<img src="${esc(img(p.image, 64))}" alt="" loading="lazy" onerror="__imgfb(this)">` : `<i class="ph">${esc(p.name.slice(0, 1))}</i>`}<span class="nm">${esc(p.name)}<u style="width:${Math.max(2, (p.vol7 || 0) / vmax * 100).toFixed(1)}%"></u></span><span class="fl">${sol(p.floor)}</span><span class="ls">${p.listed ?? '—'}</span></div>`).join('');
    prevFloors = Object.fromEntries(popular.map(p => [p.c, p.floor]));
  }
  pane.addEventListener('click', e => { const r = e.target.closest('.mrow[data-c]'); if (r) T.run('scan ' + r.dataset.c); });
  async function loadPopular() {
    try {
      const j = await me('popular', '', { timeout: 20000 });
      if (!j.ok) throw new Error(j.error);
      popular = j.list || []; mstate = 'live'; pstate.textContent = 'live · ' + hhmm();
      const b = document.querySelector('#bootMe'); if (b) { b.textContent = 'live'; b.className = 'hi'; }
    } catch (e) { mstate = popular.length ? 'live' : 'offline'; pstate.textContent = popular.length ? 'stale · retrying' : 'offline'; const b = document.querySelector('#bootMe'); if (b && !popular.length) { b.textContent = 'offline, retrying'; b.className = 'red'; } }
    paneRender();
  }
  paneRender(); loadPopular(); setInterval(loadPopular, 90000);

  // ---------------------------------------------------------------- a pick, as a card with the viewfinder locking on
  function card(d, o = {}) {
    const p = d.pick; if (!p) return null;
    const el = document.createElement('div'); el.className = 'card';
    const v = vs(p.price, d.floor);
    el.innerHTML = `<div class="shot"><img src="${esc(img(p.img, 360))}" alt="" onerror="__imgfb(this)"><div class="vf wide"><i></i><i></i><i></i><i></i></div></div>
      <div class="meta"><span class="tag">${o.tag || 'agent pick'}</span><h4>${esc(p.name || p.mint)}</h4>
      <div>rank <b>${p.rank}</b>${p.supply ? ` <span class="dim">of ${p.supply.toLocaleString()}</span>` : ''} <span class="dim">· ${esc(p.src || 'rarity')}</span></div>
      <div>price <b>${sol(p.price)} ◎</b> <span class="dim">· floor ${sol(d.floor)} ◎ · ${pc(v)}</span></div>
      <div class="dim">${esc(d.name)} · weighed ${d.weighed || d.cands.length} listing${(d.weighed || 0) === 1 ? '' : 's'} within ${d.band}% of the floor</div>
      ${p.attrs && p.attrs.length ? `<div class="traits">${p.attrs.slice(0, 8).map(([a, b]) => `<span>${esc(a)} <b>${esc(b)}</b></span>`).join('')}</div>` : ''}
      <div class="btnrow"><a class="tb" href="${ITEM(p.mint)}" target="_blank" rel="noopener">view on magic eden ↗</a>${o.more !== false ? `<button class="tb k" type="button" data-cmd="scan ${esc(d.c)}">every candidate</button>` : ''}<button class="tb pri k" type="button" data-cmd="launch ${esc(d.c)}">launch a coin paired with ${esc(d.name)}</button></div></div>`;
    T.node(el); setTimeout(() => el.querySelector('.vf').classList.remove('wide'), 60);
    T.sound && T.sound.sfx('ok');
    return el;
  }

  // ---------------------------------------------------------------- commands
  T.reg('top', { desc: 'major solana collections, live, by 7-day volume', usage: 'top [count]', alias: ['trending', 'market'],
    async run(a) {
      const n = Math.max(3, Math.min(24, parseInt(a[0]) || 12));
      if (!popular.length) { const s = spinner('reading magic eden'); await loadPopular(); if (!popular.length) return s.fail('Magic Eden didn’t answer. Try again in a minute.'); s.stop(); }
      const W = T.cols(), wide = W >= 66, nw = wide ? 30 : Math.max(10, W - 15);
      const cut = (t, w) => (t.length > w - 2 ? t.slice(0, w - 3) + '…' : t).padEnd(w);
      print(`<span class="hdr">${'  #'.padEnd(5)}${'collection'.padEnd(nw)}${'floor ◎'.padStart(10)}${wide ? 'listed'.padStart(9) + '7d vol ◎'.padStart(11) : ''}</span>`);
      for (const [i, p] of popular.slice(0, n).entries()) {
        print(`<span class="row" data-cmd="scan ${esc(p.c)}">${String(i + 1).padStart(3)}  ${esc(cut(p.name, nw))}${sol(p.floor).padStart(10)}${wide ? String(p.listed ?? '—').padStart(9) + (p.vol7 != null ? sol(p.vol7) : '—').padStart(11) : ''}</span>`);
        if (!T.mobile) await sleep(18);
      }
      print(`<span class="dim">a watchlist of major solana collections, read live from magic eden, by 7-day volume · click a row to scan it · ${k('scan', 'scan any other')} by its symbol</span>`);
    } });
  T.reg('scan', { desc: 'read a collection: floor, listings, every candidate the agent weighs', usage: 'scan <collection>', complete: symbols, more: 'the rule: {cat agent.md}',
    async run(a, { signal }) {
      const c = need(a, 'scan'); if (!c) return;
      const s = spinner(`reading ${c} on magic eden`); T.look(-1); T.agentState('scanning ' + c);
      const d = await me('pick', c, { signal, timeout: 20000 });
      if (!d.ok) { s.fail(esc(d.error)); return; }
      s.done(`<b>${esc(d.name)}</b> <span class="dim">· ${esc(d.c)}</span>`);
      print(`floor <b>${sol(d.floor)} ◎</b><span class="dim"> · ${d.listed ?? '—'} listed · 24h avg ${sol(d.avg24)} ◎ · read ${d.read} cheapest, ${d.withRank} with a rarity rank</span>`);
      if (!d.cands.length) { print(`<span class="dim">${esc(d.why || 'nothing to weigh.')}</span>`); T.agentState('idle'); return; }
      const W = T.cols(), nw = Math.max(8, Math.min(30, W - 30));
      const cut = (t, w) => (t.length > w - 2 ? t.slice(0, w - 3) + '…' : t).padEnd(w);
      print(`<span class="hdr">${'  rank'.padEnd(9)}${'listing'.padEnd(nw)}${'price ◎'.padStart(10)}${'vs fl.'.padStart(9)}</span>`);
      for (const l of d.cands) {
        const me2 = d.pick && l.mint === d.pick.mint;
        print(`<a class="row" href="${ITEM(l.mint)}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none">${me2 ? '<b>▶</b>' : ' '} ${String(l.rank ?? '—').padStart(6)}  ${esc(cut(l.name || '', nw))}${sol(l.price).padStart(10)}${pc(vs(l.price, d.floor)).padStart(9)}</a>`);
        if (!T.mobile) await sleep(22);
      }
      if (d.pick) { await sleep(150); card(d); } else print(`<span class="dim">${esc(d.why || 'no pick right now.')}</span>`);
      T.agentState('idle'); T.look(0);
    } });
  T.reg('pick', { desc: 'the listing the agent would buy right now', usage: 'pick <collection>', complete: symbols, more: 'the rule: {cat agent.md}',
    async run(a, { signal }) {
      const c = need(a, 'pick'); if (!c) return;
      const s = spinner(`the agent is reading ${c}`); T.look(1); T.agentState('picking in ' + c);
      const d = await me('pick', c, { signal, timeout: 20000 });
      if (!d.ok) { s.fail(esc(d.error)); return; }
      if (!d.pick) { s.done(`<b>${esc(d.name)}</b> <span class="dim">· ${esc(d.why || 'no pick right now')}</span>`); T.agentState('idle'); return; }
      s.done(`<b>${esc(d.name)}</b> <span class="dim">· rarest listing within ${d.band}% of the ${sol(d.floor)} ◎ floor</span>`);
      card(d); T.agentState('idle'); T.look(0);
      last = `${d.name} #${d.pick.rank}`;
    } });
  T.reg('view', { desc: 'the cheapest listings, as pictures', usage: 'view <collection>', complete: symbols, alias: ['gallery', 'listings'],
    async run(a, { signal }) {
      const c = need(a, 'view'); if (!c) return;
      const s = spinner(`loading ${c} listings`);
      const d = await me('listings', c, { signal, timeout: 20000 });
      if (!d.ok) { s.fail(esc(d.error)); return; }
      s.done(`<b>${esc(d.name)}</b> <span class="dim">· floor ${sol(d.floor)} ◎ · cheapest ${Math.min(d.listings.length, T.mobile ? 8 : 16)} of ${d.listed ?? d.listings.length} listed</span>`);
      const g = document.createElement('div'); g.className = 'grid';
      g.innerHTML = d.listings.slice(0, T.mobile ? 8 : 16).map((l, i) => `<a href="${ITEM(l.mint)}" target="_blank" rel="noopener" style="animation-delay:${i * 35}ms"><img src="${esc(img(l.img, 240))}" alt="" loading="lazy" onerror="__imgfb(this)"><b>${sol(l.price)} ◎</b><em>${esc(l.name)}</em><em>${l.rank ? 'rank ' + l.rank : 'no rank'}</em></a>`).join('');
      T.node(g);
      print(`<span class="dim">${k('pick ' + c, 'what would the agent pick?')} · <a class="lk" href="${ME(c)}" target="_blank" rel="noopener">open on magic eden ↗</a></span>`);
    } });
  T.reg('floor', { desc: 'the floor and recent sales, as a sparkline', usage: 'floor <collection>', complete: symbols, alias: ['sales'],
    async run(a, { signal }) {
      const c = need(a, 'floor'); if (!c) return;
      const s = spinner(`reading ${c} sales`);
      const [st, ac] = await Promise.all([me('stats', c, { signal }), me('activity', c, { signal })]);
      if (!st.ok) { s.fail(esc(st.error)); return; }
      s.done(`<b>${esc(st.name)}</b> <span class="dim">· floor</span> <b>${sol(st.floor)} ◎</b> <span class="dim">· ${st.listed ?? '—'} listed</span>`);
      const sales = ac.ok ? ac.events.filter(e => e.type === 'buyNow' && e.price > 0).reverse() : [];
      if (sales.length < 2) return print('<span class="dim">not enough recent sales to draw.</span>');
      const ps = sales.map(e => e.price), lo = Math.min(...ps), hi = Math.max(...ps), B = '▁▂▃▄▅▆▇█';
      print(ps.map(p => B[Math.min(7, Math.floor((p - lo) / ((hi - lo) || 1) * 7.999))]).join(''), 'hi');
      const lastS = sales[sales.length - 1];
      print(`<span class="dim">last ${sales.length} sales · low ${sol(lo)} · high ${sol(hi)} · last ${sol(lastS.price)} ◎ ${ago(lastS.t)}</span>`);
    } });
  T.reg('watch', { desc: 'live sales and listings as they happen. ctrl+c stops', usage: 'watch <collection>', complete: symbols, alias: ['tail'],
    async run(a, { signal }) {
      const c = need(a, 'watch'); if (!c) return;
      print(`<span class="dim">watching ${esc(c)} · new events every few seconds · ctrl+c stops</span>`);
      const seenSig = new Set(); let first = true; const until = Date.now() + 5 * 60e3;
      const label = { buyNow: 'sold', list: 'listed', delist: 'delisted', bid_won: 'bid won', updateBid: 'bid', cancelBid: 'bid off' };
      while (!signal.aborted && Date.now() < until) {
        const ac = await me('activity', c, { signal }).catch(e => ({ ok: false, error: e.message }));
        if (signal.aborted) return;
        if (ac.ok) {
          const fresh = ac.events.filter(e => e.sig && !seenSig.has(e.sig + e.type)).reverse();
          fresh.forEach(e => seenSig.add(e.sig + e.type));
          for (const e of first ? fresh.slice(-6) : fresh) print(`<span class="dim">${new Date(e.t).toTimeString().slice(0, 8)}</span>  ${esc((label[e.type] || e.type || '').padEnd(9))} ${e.price ? `<b>${sol(e.price)} ◎</b>` : ''}  <a class="lk" href="${ITEM(e.mint)}" target="_blank" rel="noopener">${esc(String(e.mint || '').slice(0, 6))}…</a>`);
          if (first && !fresh.length) print('<span class="dim">quiet right now. waiting.</span>');
          first = false;
        } else print(`<span class="dim">${esc(ac.error || 'no answer')}. retrying.</span>`);
        await new Promise(r => { const t = setTimeout(r, 9000); signal.addEventListener('abort', () => { clearTimeout(t); r(); }, { once: true }); });
      }
      if (!signal.aborted) print('<span class="dim">stopped after five minutes. run it again to keep watching.</span>');
    } });
  T.reg('info', { desc: 'a collection’s name, links and numbers', usage: 'info <collection>', complete: symbols, alias: ['collection'],
    async run(a, { signal }) {
      const c = need(a, 'info'); if (!c) return;
      const s = spinner(`reading ${c}`);
      const d = await me('stats', c, { signal });
      if (!d.ok) { s.fail(esc(d.error)); return; }
      s.done(`<b>${esc(d.name)}</b> <span class="dim">· ${esc(d.c)}</span>`);
      if (d.desc) print(esc(d.desc), 'dim');
      print(`floor ${sol(d.floor)} ◎ · ${d.listed ?? '—'} listed · 24h avg ${sol(d.avg24)} ◎ · 7-day volume ${sol(d.vol7)} ◎`);
      print([`<a class="lk" href="${ME(d.c)}" target="_blank" rel="noopener">magic eden ↗</a>`, d.x ? `<a class="lk" href="${esc(d.x)}" target="_blank" rel="noopener">x ↗</a>` : '', d.web ? `<a class="lk" href="${esc(d.web)}" target="_blank" rel="noopener">website ↗</a>` : '', k('pick ' + d.c, 'agent pick'), k('view ' + d.c, 'listings')].filter(Boolean).join('   '));
    } });
  const ago = t => { const s = Math.max(0, (Date.now() - t) / 1000); return s < 90 ? Math.round(s) + 's ago' : s < 5400 ? Math.round(s / 60) + 'm ago' : Math.round(s / 3600) + 'h ago'; };

  // ---------------------------------------------------------------- the agent's loop
  T.agentStat('state', 'starting'); T.agentStat('seen', '0 collections'); T.agentStat('last', '—');
  async function loop() {
    if (!popular.length) { T.agentStat('state', mstate === 'offline' ? 'market offline' : 'waiting for market'); setTimeout(loop, 8000); return; }
    const p = popular[idx++ % Math.min(popular.length, 14)];
    T.agentState('scanning'); T.agentStat('state', 'scanning'); T.status(`agent scanning <b>${esc(p.name)}</b>`, 'busy'); T.look(idx % 2 ? -1 : 1);
    try {
      const d = await me('pick', p.c, { timeout: 20000 });
      if (!d.ok) throw new Error(d.error);
      seen.add(p.c); T.agentStat('seen', seen.size + ' collection' + (seen.size === 1 ? '' : 's'));
      if (d.pick) { last = `${d.name} · rank ${d.pick.rank} · ${sol(d.pick.price)} ◎`; T.agentStat('last', esc(`rank ${d.pick.rank} · ${sol(d.pick.price)} ◎`)); T.agentLog(`<span class="mute">${hhmm()}</span> <b>${esc(d.name)}</b> · floor ${sol(d.floor)} · pick rank ${d.pick.rank} at ${sol(d.pick.price)} ◎`); }
      else T.agentLog(`<span class="mute">${hhmm()}</span> <b>${esc(d.name)}</b> · floor ${sol(d.floor)} · ${esc(d.why || 'no pick')}`);
    } catch (e) { T.agentLog(`<span class="mute">${hhmm()}</span> ${esc(p.name)} · ${esc(String(e.message || e).slice(0, 60))}`); }
    T.agentState('idle'); T.agentStat('state', 'idle · reading again soon'); T.status(`agent idle · ${seen.size} collections read`, 'on'); T.look(0);
    setTimeout(loop, 26000);
  }
  setTimeout(loop, 3500);
}
