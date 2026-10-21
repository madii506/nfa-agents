// nfa launch studio: launch a coin on pump.fun, paired with an NFT collection, in five steps you can see.
//   01 pair    pick the collection from a live grid (or paste any Magic Eden link) and see what its agent would buy
//   02 coin    name, ticker, description, links
//   03 face    a generated pixel agent, or your own picture
//   04 agent   holders or burn, and a first buy priced on pump.fun's own curve
//   05 launch  review, connect a wallet, sign once; every step of the launch shows as it happens
// It runs the same launch as `launch cli` in the shell: one wallet prompt, and the server never holds a key.
import * as PX from './px.js';

const MARK = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M1.9 6.5V3.6Q1.9 1.9 3.6 1.9H6.5M13.5 1.9h2.9Q18.1 1.9 18.1 3.6V6.5M1.9 13.5v2.9Q1.9 18.1 3.6 18.1H6.5M13.5 18.1h2.9Q18.1 18.1 18.1 16.4V13.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><rect x="6.6" y="7.2" width="2.2" height="5.2" rx="1.1" fill="currentColor"/><rect x="11.2" y="7.2" width="2.2" height="5.2" rx="1.1" fill="currentColor"/></svg>';
const VF = '<span class="vf wide"><i></i><i></i><i></i><i></i></span>';
const STEPS = ['pair', 'coin', 'face', 'agent', 'launch'];
const GROUNDS = [null, '#ffffff', '#eef0f2', '#0b0c0e', '#dfeafc', '#dcf2e3', '#ffe7d4', '#fde0e4', '#f4efd8', '#e9e4ff'];
const BUYS = [0, 0.1, 0.25, 0.5, 1, 2];
const BANNED = /\b(guarantee[ds]?|100x|1000x|risk[- ]free|cant lose|can't lose)\b/i;
const LINK = { twitter: /^(www\.|mobile\.)?(x|twitter)\.com$/i, telegram: /^(www\.)?(t\.me|telegram\.me)$/i, website: /\./ };
const symOk = s => /^[a-z0-9][a-z0-9_\-]{1,63}$/.test(s);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const DKEY = 'nfa:draft';

export function installStudio(T, K) {
  const { esc, api } = T;
  const img = (u, w = 240) => u ? `https://wsrv.nl/?url=${encodeURIComponent(u)}&w=${w}&h=${w}&fit=cover&output=webp&q=82` : '';
  const sfx = n => { try { T.sound && T.sound.sfx(n); } catch {} };
  const solf = v => v == null || !isFinite(v) ? '—' : v >= 1000 ? Math.round(v).toLocaleString() : v >= 100 ? v.toFixed(1) : v >= 1 ? v.toFixed(2) : v >= .01 ? v.toFixed(3) : v.toFixed(4);
  const big = n => !isFinite(n) ? '—' : n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(Math.round(n));
  const bytes = s => new TextEncoder().encode(s).length;
  const rnd = () => (Math.random() * 2147483646 + 1) | 0;
  const normSym = v => { v = String(v || '').trim(); const m = /magiceden\.(?:io|us)\/(?:marketplace|collections\/solana|collections)\/([A-Za-z0-9_\-]+)/i.exec(v); return (m ? m[1] : v).toLowerCase().replace(/\s+/g, '_'); };
  // a collection whose picture won't load shows its initial, not a made-up face
  const faceCache = {}; const faceUrl = c => { const x = all().find(v => v.c === c), ch = String((x && x.name) || c).charAt(0).toUpperCase().replace(/[^A-Z0-9]/, '?'); return faceCache[ch] || (faceCache[ch] = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60"><rect width="60" height="60" fill="#eef0f2"/><text x="30" y="39" font-family="monospace" font-size="26" font-weight="700" text-anchor="middle" fill="#b1b5bb">${ch}</text></svg>`)); };

  const S = { step: 0, max: 0, coll: null, pick: null, name: '', symbol: '', symTouched: false, desc: '', descTouched: false,
    links: { twitter: '', telegram: '', website: '' }, face: null, seed: rnd(), ground: null, hist: [], policy: 'holders', buy: 0, quote: null,
    open: null, busy: false, done: null, extra: [], restored: false };
  let root = null, board = [];
  const $ = s => root.querySelector(s);

  // ================================================================ the frame
  function build() {
    root = document.createElement('div'); root.className = 'stu'; root.hidden = true;
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'launch studio');
    root.innerHTML = `<div class="stu-in">
      <header class="stu-top">
        <div class="stu-id">${MARK}<b>launch studio</b><span>pump.fun · paired with an NFT collection</span></div>
        <ol class="stu-steps">${STEPS.map((s, i) => `<li data-s="${i}"><button type="button"><b>0${i + 1}</b><span>${s}</span></button></li>`).join('')}</ol>
        <button type="button" class="stu-x" aria-label="close the launch studio"><span>esc</span>✕</button>
      </header>
      <div class="stu-prog"><i></i></div>
      <button type="button" class="stu-mini" aria-label="show the preview"><canvas width="72" height="72"></canvas><span class="t"></span><img alt="" hidden><em>preview</em></button>
      <div class="stu-body">
        <div class="stu-main">
          <section class="stu-v" data-v="0">
            <div class="stu-h"><h2>pair it with an NFT collection</h2><p>its agent spends 80% of the coin’s creator fees on this collection’s NFTs. pairing is your choice; the collection’s team isn’t involved.</p></div>
            <div class="stu-search"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M13 13l4.6 4.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg><input id="stuQ" placeholder="search the board, or paste any magic eden link or symbol" spellcheck="false" autocomplete="off" autocapitalize="off" enterkeyhint="search"><em id="stuQs"></em></div>
            <div class="stu-grid" id="stuGrid"></div>
            <div class="stu-nfts" id="stuNfts" hidden><div class="stu-sub"><b>what its agent would buy right now</b><span id="stuNftsN"></span></div><div class="stu-strip" id="stuStrip"></div></div>
          </section>
          <section class="stu-v" data-v="1">
            <div class="stu-h"><h2>name it</h2><p>what people see on pump.fun. you’re the creator.</p></div>
            <div class="stu-form">
              <label class="stu-f" id="stuNameF"><span>name</span><input id="stuName" maxlength="64" placeholder="e.g. night shift" spellcheck="false" autocomplete="off"><em id="stuNameN">0/32</em></label>
              <label class="stu-f tick" id="stuSymF"><span>ticker</span><b>$</b><input id="stuSym" maxlength="10" placeholder="NIGHT" spellcheck="false" autocomplete="off" autocapitalize="characters"><em id="stuSymN">1–10 letters or numbers</em></label>
              <div class="stu-ideas" id="stuIdeas"></div>
              <label class="stu-f area" id="stuDescF"><span>about</span><textarea id="stuDesc" rows="3" maxlength="300" spellcheck="true"></textarea><em id="stuDescN"></em></label>
              <details class="stu-links" id="stuLinks"><summary>links <span>optional · shown on pump.fun</span></summary>
                <label class="stu-f" data-l="twitter"><span>x</span><input data-k="twitter" placeholder="x.com/yourcoin or @yourcoin" spellcheck="false" autocomplete="off" autocapitalize="off"><em></em></label>
                <label class="stu-f" data-l="telegram"><span>telegram</span><input data-k="telegram" placeholder="t.me/yourcoin" spellcheck="false" autocomplete="off" autocapitalize="off"><em></em></label>
                <label class="stu-f" data-l="website"><span>website</span><input data-k="website" placeholder="yourcoin.com" spellcheck="false" autocomplete="off" autocapitalize="off"><em></em></label>
              </details>
            </div>
          </section>
          <section class="stu-v" data-v="2">
            <div class="stu-h"><h2>give it a face</h2><p>a generated pixel agent, or your own picture. drop one anywhere here.</p></div>
            <div class="stu-face" id="stuFace">
              <div class="stu-stage" id="stuStage"><canvas id="stuCv" width="512" height="512"></canvas><i class="scan"></i>${VF.replace(' wide', '')}<div class="stu-drop">drop it here</div></div>
              <div class="stu-fctl">
                <div class="stu-btns"><button type="button" class="tb pri" id="stuGen">↻ generate</button><button type="button" class="tb" id="stuUp">upload a picture</button></div>
                <div class="stu-traits" id="stuTraits"></div>
                <div class="stu-sub"><b>ground</b><span>for a generated face</span></div><div class="stu-sw" id="stuSw"></div>
                <div class="stu-sub"><b>earlier</b><span>click one to bring it back</span></div><div class="stu-hist" id="stuHist"></div>
              </div>
            </div>
          </section>
          <section class="stu-v" data-v="3">
            <div class="stu-h"><h2>set its agent</h2><p>chosen once. at launch the fee split locks on-chain, and nobody can change it, not even you.</p></div>
            <div class="stu-pol" id="stuPol">
              <button type="button" class="stu-pc" data-p="holders"><span class="ic"><svg viewBox="0 0 132 56" aria-hidden="true"><g class="w"><rect x="96" y="4" width="30" height="12" rx="2.5"/><rect x="96" y="22" width="30" height="12" rx="2.5" class="hit"/><rect x="96" y="40" width="30" height="12" rx="2.5"/></g><g class="nft"><rect x="8" y="16" width="24" height="24" rx="4"/><rect x="15" y="23" width="3" height="9" rx="1.5" class="f"/><rect x="22" y="23" width="3" height="9" rx="1.5" class="f"/></g><path d="M38 28h50" class="dash"/></svg></span><b>holders</b><span>each NFT it buys goes to one holder of the coin, picked by a draw anyone can check</span></button>
              <button type="button" class="stu-pc" data-p="burn"><span class="ic"><svg viewBox="0 0 132 56" aria-hidden="true"><path d="M92 12v34M120 12v34M88 46h36" class="slot"/><g class="nft"><rect x="8" y="16" width="24" height="24" rx="4"/><rect x="15" y="23" width="3" height="9" rx="1.5" class="f"/><rect x="22" y="23" width="3" height="9" rx="1.5" class="f"/></g><path d="M38 28h44" class="dash"/></svg></span><b>burn</b><span>each NFT it buys goes to the burn, so the collection gets scarcer</span></button>
            </div>
            <div class="stu-buy">
              <div class="stu-sub"><b>your first buy</b><span>optional · lands right after the fees lock</span></div>
              <div class="stu-range"><input type="range" id="stuBuy" min="0" max="5" step="0.05" value="0" aria-label="first buy in SOL"><output id="stuBuyO">none</output></div>
              <div class="stu-chips" id="stuBuyC">${BUYS.map(v => `<button type="button" data-v="${v}">${v ? v + ' SOL' : 'none'}</button>`).join('')}</div>
              <div class="stu-quote" id="stuQuote"></div>
            </div>
          </section>
          <section class="stu-v" data-v="4">
            <div class="stu-h"><h2>launch it</h2><p>one wallet prompt signs all of it. nfa never holds a key.</p></div>
            <ul class="stu-rev" id="stuRev"></ul>
            <div class="stu-wal" id="stuWal"></div>
            <div class="stu-gate" id="stuGate" hidden></div>
            <div class="stu-gow" id="stuGoW"><button type="button" class="stu-go" id="stuGo"><span>launch on pump.fun</span><i>→</i></button><p class="stu-fine">you pay pump.fun’s and the network’s fees, shown in your wallet, plus 0.001 SOL that opens the agent vault. not financial advice.</p></div>
            <div class="stu-pipe" id="stuPipe" hidden><div class="stu-pbar"><i></i></div><ol></ol></div>
            <div class="stu-res" id="stuRes" hidden></div>
          </section>
        </div>
        <aside class="stu-pv" aria-label="preview">
          <div class="stu-pvh"><span>preview</span><em>as it reads on pump.fun</em><button type="button" class="stu-pvx" aria-label="close the preview">✕</button></div>
          <div class="stu-coin"><div class="stu-cpic"><canvas id="stuPvCv" width="208" height="208"></canvas></div><div class="stu-ct"><b id="stuPvName">your coin</b><span id="stuPvSym">$TICKER</span><p id="stuPvDesc"></p><em id="stuPvBy">created by you</em></div></div>
          <div class="stu-curve"><div class="stu-sub"><b>bonding curve</b><span id="stuCurveN"></span></div><div class="bar"><i id="stuCurveI"></i></div><div class="stu-mc" id="stuMc"></div></div>
          <div class="stu-pair none" id="stuPair"><div class="a"><canvas id="stuPvCv2" width="128" height="128"></canvas><span id="stuPvSym2">$TICKER</span></div><div class="w"><em>80% of fees</em></div><div class="b"><span class="im"><img id="stuPvColl" alt="" hidden></span><span id="stuPvCollN">no collection yet</span></div></div>
          <div class="stu-flow"><div class="src">creator fees</div><div class="br"><i>80%</i><div>its agent vault <span>→ buys <b id="stuFlowC">its collection’s</b> NFTs → <b id="stuFlowP">holders</b></span></div></div><div class="br"><i>20%</i><div>nfa treasury</div></div><div class="lk">locked at launch · admin revoked · read it on-chain any time</div></div>
          <div class="stu-tgt" id="stuTgt" hidden></div>
        </aside>
      </div>
      <footer class="stu-foot"><button type="button" class="tb stu-back">‹ back</button><span class="stu-hint" id="stuHint" aria-live="polite"></span><button type="button" class="tb pri stu-next">next ›</button></footer>
    </div>`;
    (document.querySelector('#app') || document.body).appendChild(root);
    wire();
  }

  // ================================================================ state checks
  const nameOk = () => { const n = S.name.trim(); return n.length > 0 && bytes(n) <= 32 && !BANNED.test(n); };
  const tickOk = () => /^[A-Z0-9]{1,10}$/.test(S.symbol) && !BANNED.test(S.symbol);
  const descOk = () => S.desc.length <= 300 && !BANNED.test(S.desc);
  function linkOk(k, v) {
    v = String(v || '').trim(); if (!v) return true;
    if (k === 'twitter' && /^@?[A-Za-z0-9_]{1,15}$/.test(v)) return true;
    try { const u = new URL(/^https?:\/\//i.test(v) ? v : 'https://' + v); return LINK[k].test(u.hostname) && v.length <= 200; } catch { return false; }
  }
  const linksOk = () => Object.keys(LINK).every(k => linkOk(k, S.links[k]));
  const valid = i => i === 0 ? !!S.coll : i === 1 ? nameOk() && tickOk() && descOk() && linksOk() : i === 2 ? !!S.face : true;
  const ready = () => [0, 1, 2, 3].every(valid);
  const defDesc = () => { const c = S.coll ? S.coll.name : 'an NFT collection'; return `Paired with ${c}. Its nfa agent spends 80% of this coin's creator fees buying ${S.coll ? c : 'its'} NFTs for ${S.policy === 'burn' ? 'the burn' : 'holders'}.`; };

  // ================================================================ moving between steps
  function show(n, o = {}) {
    n = Math.max(0, Math.min(4, n));
    for (let i = 0; i < n; i++) if (!valid(i)) { n = i; if (!o.quiet) nudge(i); break; }
    const prev = S.step; S.step = n; S.max = Math.max(S.max, n);
    root.querySelectorAll('.stu-v').forEach((v, i) => { v.classList.toggle('on', i === n); v.classList.toggle('back', i === n && n < prev); });
    root.querySelectorAll('.stu-steps li').forEach((li, i) => { li.classList.toggle('on', i === n); li.classList.toggle('done', i !== n && i < 4 && valid(i) && (i < n || i <= S.max)); });
    $('.stu-prog i').style.width = (n / 4 * 100) + '%';
    $('.stu-main').scrollTop = 0;
    if (n === 2 && !S.face) setFace(genFace(S.seed, S.ground), true);
    if (n === 3) { paintPolicy(); paintBuy(); quote(); }
    if (n === 4) { renderReview(); renderWal(); refreshOpen(); }
    foot(); save();
    if (n !== prev && !o.quiet) sfx('tick');
    if (!T.mobile && !o.nofocus) setTimeout(() => { const f = n === 0 ? $('#stuQ') : n === 1 ? (S.name ? null : $('#stuName')) : null; if (f) f.focus({ preventScroll: true }); }, 240);
  }
  function nudge(i) {
    const el = i === 0 ? $('#stuGrid') : i === 1 ? (!nameOk() ? $('#stuNameF') : !tickOk() ? $('#stuSymF') : !descOk() ? $('#stuDescF') : $('#stuLinks')) : i === 2 ? $('#stuStage') : null;
    if (i === 1 && !linksOk()) $('#stuLinks').open = true;
    if (el) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }
    hint(i === 0 ? 'pick a collection first' : i === 1 ? (!nameOk() ? (BANNED.test(S.name) ? 'pick another name' : 'a name of 1–32 characters') : !tickOk() ? 'a ticker of 1–10 letters or numbers' : !descOk() ? 'reword the description: no promises about returns' : 'a link doesn’t look right') : 'make a face first', true);
    sfx('err');
  }
  function foot() {
    const back = $('.stu-back'), next = $('.stu-next');
    back.hidden = S.step === 0 || S.busy || !!S.done; back.textContent = '‹ ' + (STEPS[S.step - 1] || '');
    next.hidden = S.step === 4; next.innerHTML = `${STEPS[S.step + 1] || ''} <span>›</span>`; next.classList.toggle('dimmed', !valid(S.step));
    hint();
  }
  function hint(t, bad) {
    const el = $('#stuHint');
    if (t) { el.innerHTML = esc(t); el.classList.toggle('bad', !!bad); clearTimeout(hint.t); hint.t = setTimeout(() => hint(), 2600); return; }
    el.classList.remove('bad');
    const s = S.step;
    el.innerHTML = s === 0 ? (S.coll ? `paired with <b>${esc(S.coll.name)}</b>` : 'pick a collection, or paste any magic eden link')
      : s === 1 ? (S.name ? `<b>${esc(S.name.trim())}</b> $${esc(S.symbol || '…')}` : 'a name and a ticker')
      : s === 2 ? (S.face ? (S.face.kind === 'gen' ? 'generated · ↻ for another' : 'your picture') : 'generate one, or upload yours')
      : s === 3 ? `NFTs to <b>${S.policy === 'burn' ? 'the burn' : 'holders'}</b> · first buy <b>${S.buy ? S.buy + ' SOL' : 'none'}</b>`
      : S.done ? 'it’s live' : S.busy ? 'launching · keep this open' : 'one wallet prompt signs it all';
  }

  // ================================================================ 01 pair
  async function loadBoard() {
    const fromMkt = (T.market && T.market.list && T.market.list()) || [];
    if (fromMkt.length) board = fromMkt.slice();
    else if (!board.length) { renderGrid(); try { const j = await api('/api/me?op=popular', { timeout: 20000 }); if (j.ok) board = j.list || []; } catch {} }
    renderGrid();
  }
  const all = () => { const seen = new Set(), out = []; for (const x of [...S.extra, ...board]) if (x && x.c && !seen.has(x.c)) { seen.add(x.c); out.push(x); } return out; };
  function tile(x, i, maxV) {
    const on = S.coll && S.coll.c === x.c, w = x.vol7 ? Math.max(4, Math.round(x.vol7 / maxV * 100)) : 0;
    return `<button type="button" class="stu-tile${on ? ' on' : ''}" data-c="${esc(x.c)}" style="--i:${Math.min(i, 14)}" aria-pressed="${on}">
      <span class="im">${x.image ? `<img src="${esc(img(x.image, 260))}" alt="" loading="lazy" decoding="async" data-ph="${faceUrl(x.c)}" onerror="__imgfb(this)">` : `<img src="${faceUrl(x.c)}" alt="">`}</span>
      <span class="nm">${esc(x.name)}</span>
      <span class="st"><b>${solf(x.floor)} ◎</b> floor<em>·</em>${x.listed != null ? Number(x.listed).toLocaleString() : '—'} listed</span>
      <span class="vb" title="seven-day volume"><i data-w="${w}%"></i></span>
      <span class="tg">paired</span>${on ? VF.replace(' wide', '') : VF}</button>`;
  }
  const chk = {};
  function renderGrid() {
    const g = $('#stuGrid'), list = all();
    if (!list.length) { g.innerHTML = Array.from({ length: 8 }, (_, i) => `<div class="stu-tile sk" style="--i:${i}"><span class="im"></span><span class="nm"></span><span class="st"></span></div>`).join(''); return; }
    const maxV = Math.max(1, ...list.map(x => x.vol7 || 0));
    g.innerHTML = '<button type="button" class="stu-tile chk" hidden><span class="im"><i>?</i></span><span class="nm"></span><span class="st"></span></button>' + list.map((x, i) => tile(x, i, maxV)).join('') + '<p class="stu-empty" hidden>nothing on the board matches. paste a magic eden link to pair any collection.</p>';
    requestAnimationFrame(() => g.querySelectorAll('.vb i').forEach(i => { i.style.width = i.dataset.w; }));
    filter();
  }
  function filter() {
    const raw = $('#stuQ').value, q = raw.trim().toLowerCase(), sym = normSym(raw), g = $('#stuGrid');
    let shown = 0;
    g.querySelectorAll('.stu-tile[data-c]').forEach(t => { const x = all().find(v => v.c === t.dataset.c); const hit = !q || (x && (x.name.toLowerCase().includes(q) || x.c.includes(sym))); t.hidden = !hit; if (hit) shown++; });
    const c = g.querySelector('.chk'), exact = all().some(x => x.c === sym), can = !!q && symOk(sym) && !exact;
    if (c) { c.hidden = !can; if (can) { c.dataset.chk = sym; c.querySelector('.nm').textContent = sym; c.querySelector('.st').textContent = chk[sym] === 'busy' ? 'checking magic eden…' : chk[sym] === 'no' ? 'not on magic eden' : 'check it on magic eden ↵'; c.classList.toggle('bad', chk[sym] === 'no'); } }
    const e = g.querySelector('.stu-empty'); if (e) e.hidden = !(q && !shown && !can);
    $('#stuQs').textContent = q ? `${shown} on the board` : '';
    clearTimeout(filter.t); if (can && !chk[sym]) filter.t = setTimeout(() => check(sym), 800);
  }
  const picks = {};
  async function readPick(c) {
    const p = picks[c]; if (p && Date.now() - p._at < 60000) return p;
    try { const d = await api('/api/me?op=pick&c=' + encodeURIComponent(c), { timeout: 20000 }); if (d.ok) { d._at = Date.now(); picks[c] = d; } return d; }
    catch (e) { return { ok: false, error: e.message }; }
  }
  async function check(sym) {
    if (chk[sym] === 'busy' || chk[sym] === 'ok') return;
    chk[sym] = 'busy'; filter();
    const d = await readPick(sym);
    if (!d.ok) { chk[sym] = d.code === 404 || /no collection/i.test(d.error || '') ? 'no' : undefined; filter(); if (chk[sym] !== 'no') hint(d.error || 'magic eden didn’t answer', true); sfx('err'); return; }
    chk[sym] = 'ok';
    const x = { c: d.c, name: d.name, image: d.image || (d.pick && d.pick.img) || (d.cands && d.cands[0] && d.cands[0].img) || null, floor: d.floor, listed: d.listed, vol7: d.vol7, custom: true };
    S.extra = [x, ...S.extra.filter(e => e.c !== x.c)];
    $('#stuQ').value = ''; renderGrid(); select(x.c);
  }
  function select(c, quiet) {
    const x = all().find(v => v.c === c); if (!x) return;
    S.coll = { c: x.c, name: x.name, image: x.image || null, floor: x.floor ?? null, listed: x.listed ?? null, vol7: x.vol7 ?? null };
    $('#stuGrid').querySelectorAll('.stu-tile[data-c]').forEach(t => { const on = t.dataset.c === c; t.classList.toggle('on', on); t.setAttribute('aria-pressed', on); const v = t.querySelector('.vf'); if (v) v.classList.toggle('wide', !on); });
    if (!quiet) sfx('beep');
    if (!S.descTouched) { S.desc = defDesc(); const d = $('#stuDesc'); if (d) { d.value = S.desc; descCount(); } }
    S.pick = picks[c] && picks[c].ok ? picks[c] : null;
    pv(); foot(); save(); loadPick(c);
  }
  async function loadPick(c) {
    const box = $('#stuNfts'), strip = $('#stuStrip'), note = $('#stuNftsN');
    box.hidden = false;
    if (!picks[c]) { note.textContent = 'reading its cheapest listings…'; strip.innerHTML = Array.from({ length: 8 }, (_, i) => `<span class="stu-nft sk" style="--i:${i}"><span class="im"></span><b></b><span></span></span>`).join(''); }
    const d = await readPick(c);
    if (!S.coll || S.coll.c !== c) return;
    S.pick = d.ok ? d : null;
    if (!d.ok) { note.textContent = d.error || 'magic eden didn’t answer'; strip.innerHTML = ''; pv(); return; }
    if (!S.coll.image) S.coll.image = d.image || (d.pick && d.pick.img) || null;
    if (S.coll.floor == null) S.coll.floor = d.floor;
    const list = (d.cands || []).slice(0, 8);
    note.innerHTML = d.pick ? `the rarest listing within ${d.band}% of the floor wins · ${d.weighed || list.length} weighed · rarity from ${esc(d.pick.src || 'magic eden')}` : esc(d.why || 'its cheapest listings');
    strip.innerHTML = list.map((l, i) => `<a class="stu-nft${d.pick && l.mint === d.pick.mint ? ' pick' : ''}" style="--i:${i}" href="https://magiceden.io/item-details/${encodeURIComponent(l.mint)}" target="_blank" rel="noopener" title="${esc(l.name || '')}"><span class="im"><img src="${esc(img(l.img, 200))}" alt="" loading="lazy" onerror="__imgfb(this)">${d.pick && l.mint === d.pick.mint ? '<em>its pick</em>' : ''}</span><b>${solf(l.price)} ◎</b><span>${l.rank ? 'rank ' + l.rank.toLocaleString() : 'no rank'}</span></a>`).join('') || `<p class="stu-empty">${esc(d.why || 'nothing is listed right now')}</p>`;
    pv();
  }

  // ================================================================ 02 coin
  function ideas() {
    const w = S.name.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean), out = [];
    if (w.length) { out.push(w[0].slice(0, 10)); if (w.length > 1) { out.push(w.map(x => x[0]).join('').slice(0, 10)); out.push(w.join('').slice(0, 10)); out.push((w[0].slice(0, 4) + w[w.length - 1].slice(0, 4)).slice(0, 10)); } else if (w[0].length > 5) out.push(w[0].slice(0, 4)); }
    return [...new Set(out.filter(x => /^[A-Z0-9]{2,10}$/.test(x)))].slice(0, 4);
  }
  function paintCoin() {
    const nb = bytes(S.name.trim()), nf = $('#stuNameF');
    $('#stuNameN').textContent = `${nb}/32`; nf.classList.toggle('bad', nb > 32 || BANNED.test(S.name));
    const sf = $('#stuSymF'); sf.classList.toggle('bad', !!S.symbol && !tickOk()); $('#stuSymN').textContent = S.symbol ? (tickOk() ? '✓' : 'letters or numbers only') : '1–10 letters or numbers';
    const id = ideas(); $('#stuIdeas').innerHTML = id.length ? '<span>ideas</span>' + id.map(x => `<button type="button" data-t="${x}" class="${x === S.symbol ? 'on' : ''}">$${x}</button>`).join('') : '';
    descCount();
    root.querySelectorAll('.stu-links .stu-f').forEach(f => { const k = f.dataset.l, ok = linkOk(k, S.links[k]); f.classList.toggle('bad', !ok); f.querySelector('em').textContent = ok ? '' : 'check this link'; });
  }
  function descCount() { const n = S.desc.length, f = $('#stuDescF'); $('#stuDescN').textContent = BANNED.test(S.desc) ? 'no promises about returns' : `${n}/300`; f.classList.toggle('bad', !descOk()); }

  // ================================================================ 03 face
  function genFace(seed, ground) {
    const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    const f = PX.canvas(seed, 42, ground ? { ground } : undefined), d = f.getContext('2d').getImageData(0, 0, 1, 1).data;
    g.fillStyle = `rgb(${d[0]},${d[1]},${d[2]})`; g.fillRect(0, 0, 512, 512); g.drawImage(f, 4, 4);
    c.traits = f.traits; c.seed = seed; c.ground = ground; c.kind = 'gen'; return c;
  }
  function setFace(c, anim) {
    S.face = c; if (c.kind === 'gen') { S.seed = c.seed; S.ground = c.ground; }
    if (!S.hist.includes(c)) { S.hist.unshift(c); S.hist = S.hist.slice(0, 8); }
    paintStage(anim); paintFaceCtl(); pv(); foot(); save();
  }
  function paintStage(anim) {
    const cv = $('#stuCv'), g = cv.getContext('2d'), src = S.face, st = $('#stuStage');
    st.classList.toggle('px', src.kind === 'gen');
    g.imageSmoothingEnabled = src.kind !== 'gen';
    if (!anim || reduce) { g.clearRect(0, 0, 512, 512); g.drawImage(src, 0, 0, 512, 512); return; }
    st.classList.remove('go'); void st.offsetWidth; st.classList.add('go');
    const rows = 16, h = 512 / rows, t0 = performance.now(); let r = 0;
    (function f(now) { if (S.face !== src) return; const upto = Math.min(rows, Math.ceil(((now || performance.now()) - t0) / 260 * rows)); for (; r < upto; r++) g.drawImage(src, 0, r * h, 512, h, 0, r * h, 512, h); if (r < rows) requestAnimationFrame(f); })(t0 + 1);
  }
  function paintFaceCtl() {
    const f = S.face; if (!f) return;
    $('#stuTraits').innerHTML = f.kind === 'gen' ? ['hat', 'eyes', 'mouth'].map(k => `<span>${k} <b>${esc(f.traits[k])}</b></span>`).join('') : `<span>your picture <b>${esc(f.fname || 'cropped square')}</b></span>`;
    $('#stuSw').innerHTML = GROUNDS.map(c => `<button type="button" data-g="${c || ''}" class="${(c || null) === (S.ground || null) ? 'on' : ''}${c ? '' : ' auto'}" style="${c ? 'background:' + c : ''}" title="${c || 'its own colour'}" ${f.kind !== 'gen' ? 'disabled' : ''}>${c ? '' : 'a'}</button>`).join('');
    const h = $('#stuHist'); h.innerHTML = '';
    S.hist.forEach((c, i) => { const b = document.createElement('button'); b.type = 'button'; b.className = c === S.face ? 'on' : ''; b.dataset.i = i; const t = document.createElement('canvas'); t.width = t.height = 96; const g = t.getContext('2d'); g.imageSmoothingEnabled = c.kind !== 'gen'; g.drawImage(c, 0, 0, 96, 96); b.appendChild(t); h.appendChild(b); });
  }
  async function upload(file) {
    if (!file) { file = await K.pickFile(); if (!file) return; }
    try { const c = await K.fromFile(file); c.kind = 'up'; c.fname = file.name.slice(0, 40); setFace(c, true); sfx('ok'); }
    catch (e) { hint(e.message, true); sfx('err'); }
  }

  // ================================================================ 04 agent
  function paintPolicy() { root.querySelectorAll('.stu-pc').forEach(b => { const on = b.dataset.p === S.policy; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); }); }
  function paintBuy() {
    const r = $('#stuBuy'); r.value = S.buy; r.style.setProperty('--p', (S.buy / 5 * 100) + '%');
    $('#stuBuyO').textContent = S.buy ? S.buy.toFixed(S.buy * 100 % 10 ? 2 : S.buy % 1 ? 1 : 0) + ' SOL' : 'none';
    root.querySelectorAll('#stuBuyC button').forEach(b => b.classList.toggle('on', +b.dataset.v === S.buy));
  }
  const qCache = {}; let qT = 0, qSeq = 0;
  function quote() {
    clearTimeout(qT);
    const lam = Math.round(S.buy * 1e9);
    if (qCache[lam]) { S.quote = qCache[lam]; showQuote(); return; }
    qT = setTimeout(async () => {
      const my = ++qSeq; let r = null;
      try { const j = await api('/api/build?quote=' + lam, { timeout: 12000 }); if (j.ok) r = j; } catch {}
      if (!r) r = estimate(lam);
      if (my !== qSeq) return;
      qCache[lam] = r; S.quote = r; showQuote();
    }, qCache[0] ? 160 : 0);
  }
  function estimate(lam) {
    const vS = 30e9, vT = 1073e12, rT = 793.1e12, sup = 1e15, net = lam / 1.0125, vS2 = vS + net, vT2 = vS * vT / vS2, t = vT - vT2;
    return { est: true, supply: sup, decimals: 6, tokens: t, pct: t / sup, progress: t / rT, startMcapSol: vS / vT * sup / 1e9, afterMcapSol: vS2 / vT2 * sup / 1e9 };
  }
  function showQuote() {
    const r = S.quote, el = $('#stuQuote'); if (!r || !el) return;
    const src = r.est ? 'estimated from pump.fun’s standard curve' : 'priced on pump.fun’s live curve';
    if (!S.buy) el.innerHTML = `<b>no first buy.</b> <em>it opens at ≈ ${solf(r.startMcapSol)} ◎ market cap · you can buy later like anyone · ${src}</em>`;
    else { el.innerHTML = `≈ <b class="cu" data-to="${r.tokens / 1e6}">${big(r.tokens / 1e6)}</b> $${esc(S.symbol || 'TICKER')} <em>·</em> <b>${(r.pct * 100).toFixed(2)}%</b> of supply <em>· ${src}</em>`; countUp(el.querySelector('.cu')); }
    curve(); if (S.step === 4) renderReview();
  }
  let lastCount = 0;
  function countUp(el) {
    const to = +el.dataset.to, from = lastCount; lastCount = to; if (reduce || !isFinite(from)) return;
    const t0 = performance.now(); (function f(t) { const k = Math.min(1, (t - t0) / 380), e = 1 - Math.pow(1 - k, 3); el.textContent = big(from + (to - from) * e); if (k < 1) requestAnimationFrame(f); })(t0);
  }

  // ================================================================ 05 launch
  function renderReview() {
    const f = S.face, q = S.quote;
    const rows = [
      ['coin', S.name ? `<b>${esc(S.name.trim())}</b> $${esc(S.symbol)}` : '<span class="miss">no name yet</span>', 1],
      ['paired with', S.coll ? `<b>${esc(S.coll.name)}</b> <span>· floor ${solf(S.coll.floor)} ◎</span>` : '<span class="miss">no collection yet</span>', 0],
      ['face', f ? (f.kind === 'gen' ? `a generated agent <span>· ${esc(f.traits.hat)} · ${esc(f.traits.eyes)} eyes</span>` : 'your picture') : '<span class="miss">none yet</span>', 2],
      ['its NFTs go to', S.policy === 'burn' ? '<b>the burn</b>' : '<b>holders</b> <span>· by a draw anyone can check</span>', 3],
      ['first buy', S.buy ? `<b>${S.buy} SOL</b>${q && !q.est ? ` <span>· ≈ ${big(q.tokens / 1e6)} $${esc(S.symbol)} · ${(q.pct * 100).toFixed(2)}% of supply</span>` : ''}` : 'none', 3],
      ['links', ['twitter', 'telegram', 'website'].filter(k => S.links[k].trim()).map(k => esc(k === 'twitter' ? 'x' : k)).join(' · ') || '<span>none</span>', 1],
      ['creator fees', '<b>80%</b> its agent vault <span>·</span> <b>20%</b> nfa treasury <span>· locked at launch</span>', -1],
    ];
    $('#stuRev').innerHTML = rows.map(([k, v, s], i) => `<li style="--i:${i}"><span>${k}</span><div>${v}</div>${s >= 0 && !S.busy && !S.done ? `<button type="button" data-go="${s}">edit</button>` : '<i></i>'}</li>`).join('');
    gate();
  }
  async function renderWal() {
    const W = K.W, el = $('#stuWal');
    if (S.done) { el.innerHTML = ''; return; }
    if (W.me) {
      const pn = (K.PROVS.find(p => p.id === W.id) || {}).name || '';
      el.innerHTML = `<div class="stu-wme"><i class="dot on"></i><b>${esc(K.short(W.me))}</b><span>${esc(pn)}</span><em id="stuBal">reading balance…</em>${S.busy ? '' : '<button type="button" class="stu-lnk" data-act="logout">switch</button>'}</div>`;
      try { const l = (await K.balance()) / 1e9, b = $('#stuBal'); if (b) { const need = S.buy + 0.03; b.textContent = l.toFixed(3) + ' SOL'; if (l < need) { b.classList.add('low'); b.textContent += ` · about ${need.toFixed(2)} needed`; } } }
      catch { const b = $('#stuBal'); if (b) b.textContent = ''; }
    } else {
      el.innerHTML = `<div class="stu-sub"><b>connect a wallet</b><span>you sign everything in it · nfa never holds a key</span></div><div class="stu-wl">${K.PROVS.map(p => p.get()
        ? `<button type="button" class="tb" data-wal="${p.id}"><b>${p.name}</b><span>detected</span></button>`
        : `<a class="tb ghost" href="${K.mobileUA && p.deep ? p.deep(location.href) : p.url}" target="_blank" rel="noopener"><b>${p.name}</b><span>${K.mobileUA && p.deep ? 'open in the app ↗' : 'install ↗'}</span></a>`).join('')}</div>`;
    }
    gate();
  }
  async function refreshOpen() { try { const j = await api('/api/coin?cfg=1', { timeout: 10000 }); if (j.ok) S.open = !!j.open; } catch {} gate(); }
  function gate() {
    const g = $('#stuGate'), go = $('#stuGo'); if (!g || !go) return;
    g.hidden = S.open !== false || !!S.done;
    if (S.open === false) g.innerHTML = '<b>launching opens in a moment.</b> nfa’s records are still connecting. everything up to this click works.';
    go.disabled = !ready() || S.open === false || S.busy;
    go.querySelector('span').textContent = S.busy ? 'launching…' : K.W.me ? 'launch on pump.fun' : 'connect and launch on pump.fun';
  }
  async function go() {
    if (S.busy || S.done) return;
    if (!ready()) { show(4); return; }
    if (!K.W.me) {
      const found = K.PROVS.filter(p => p.get());
      if (found.length === 1) { try { await K.connectTo(found[0].id); } catch (e) { hint(e.message, true); sfx('err'); return; } }
      else { const w = $('#stuWal'); w.classList.remove('shake'); void w.offsetWidth; w.classList.add('shake'); hint(found.length ? 'pick a wallet first' : 'install a solana wallet first, like phantom', true); sfx('err'); return; }
    }
    S.busy = true; root.classList.add('busy'); sfx('scan');
    $('#stuGoW').hidden = true; $('#stuRes').hidden = true; renderReview(); renderWal(); foot();
    const pipe = $('#stuPipe'), ol = pipe.querySelector('ol'), bar = pipe.querySelector('.stu-pbar i');
    pipe.hidden = false; ol.innerHTML = K.STEPS.map((l, i) => `<li class="stu-ps wait" style="--i:${i}"><i></i><b>${esc(l)}</b><em></em></li>`).join('');
    const rows = [...ol.children]; let cur = -1;
    const set = (i, c) => { rows[i].className = 'stu-ps ' + c; };
    const ui = {
      step(i, n) { if (cur >= 0 && rows[cur].classList.contains('run')) set(cur, 'ok'); for (let j = cur + 1; j < i; j++) if (rows[j].classList.contains('wait')) set(j, 'skip'); cur = i; set(i, 'run'); rows[i].querySelector('em').textContent = n || ''; bar.style.width = (i / K.STEPS.length * 100) + '%'; sfx('tick'); rows[i].scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' }); },
      note(i, h) { rows[i].querySelector('em').innerHTML = h; },
      skip(i) { set(i, 'skip'); rows[i].querySelector('em').textContent = 'no first buy'; },
      warn(i, t) { set(i, 'warn'); rows[i].querySelector('em').textContent = t; },
    };
    try {
      const r = await K.launchCore({ name: S.name.trim(), symbol: S.symbol, coll: { c: S.coll.c, name: S.coll.name }, policy: S.policy, canvas: S.face, buy: S.buy, desc: S.desc.trim(), links: { ...S.links } }, ui);
      if (cur >= 0 && rows[cur].classList.contains('run')) set(cur, 'ok'); bar.style.width = '100%';
      S.done = r; T.store.set(DKEY, null); try { K.liveCard(r); } catch {}
      showLive(r); sfx('ok');
    } catch (e) {
      if (cur >= 0) { set(cur, 'bad'); rows[cur].querySelector('em').innerHTML = esc(K.human(e)) + (e.unrouted ? ` <button type="button" class="stu-lnk" data-act="route" data-mint="${esc(e.unrouted)}">lock the fees now</button>` : ''); }
      else hint(K.human(e), true);
      $('#stuGoW').hidden = false; sfx('err');
    } finally { S.busy = false; root.classList.remove('busy'); gate(); foot(); renderReview(); renderWal(); if (!S.done) { const g = $('#stuGo span'); if (g && cur >= 0) g.textContent = 'try again'; } }
  }
  function showLive(r) {
    const el = $('#stuRes'); el.hidden = false;
    el.innerHTML = `<div class="stu-live"><div class="stu-lpic"><img src="${esc(r.image)}" alt="">${VF}<b class="stamp">live</b></div>
      <div class="stu-lt"><h3>${esc(r.name)} <span>$${esc(r.symbol)}</span></h3><p>paired with <b>${esc(r.coll.name)}</b> · its NFTs go to <b>${r.policy === 'burn' ? 'the burn' : 'holders'}</b></p><code>${esc(r.mint)}</code>${r.buyNote ? `<p class="amber">${esc(r.buyNote)}</p>` : ''}
      <div class="btnrow"><a class="tb pri" href="https://pump.fun/coin/${esc(r.mint)}" target="_blank" rel="noopener">open on pump.fun ↗</a><a class="tb" href="https://solscan.io/tx/${esc(r.sig)}" target="_blank" rel="noopener">transaction ↗</a><a class="tb" href="${K.shareUrl(r)}" target="_blank" rel="noopener">share on x ↗</a><button type="button" class="tb" data-act="term">see it in the shell</button><button type="button" class="tb" data-act="again">launch another</button></div></div></div>`;
    setTimeout(() => { const v = el.querySelector('.vf'); if (v) v.classList.remove('wide'); }, 120);
    el.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
    hint();
  }
  function again() {
    Object.assign(S, { step: 0, max: 0, coll: null, pick: null, name: '', symbol: '', symTouched: false, desc: '', descTouched: false, links: { twitter: '', telegram: '', website: '' }, face: null, seed: rnd(), ground: null, hist: [], policy: 'holders', buy: 0, done: null });
    $('#stuName').value = ''; $('#stuSym').value = ''; $('#stuDesc').value = ''; root.querySelectorAll('.stu-links input').forEach(i => { i.value = ''; });
    $('#stuPipe').hidden = true; $('#stuRes').hidden = true; $('#stuGoW').hidden = false; $('#stuNfts').hidden = true;
    renderGrid(); paintCoin(); pv(); show(0);
  }

  // ================================================================ the preview
  function drawTo(cv) { const g = cv.getContext('2d'); g.clearRect(0, 0, cv.width, cv.height); if (!S.face) { g.fillStyle = getComputedStyle(root).getPropertyValue('--line') || '#e5e7ea'; g.fillRect(0, 0, cv.width, cv.height); return; } g.imageSmoothingEnabled = S.face.kind !== 'gen'; g.drawImage(S.face, 0, 0, cv.width, cv.height); }
  function pv() {
    if (!root) return;
    const sym = S.symbol || 'TICKER';
    $('#stuPvName').textContent = S.name.trim() || 'your coin'; $('#stuPvSym').textContent = '$' + sym; $('#stuPvSym2').textContent = '$' + sym;
    $('#stuPvDesc').textContent = S.desc.trim() || defDesc();
    $('#stuPvBy').textContent = 'created by ' + (K.W.me ? K.short(K.W.me) : 'you');
    drawTo($('#stuPvCv')); drawTo($('#stuPvCv2')); drawTo($('.stu-mini canvas'));
    const c = S.coll, ci = $('#stuPvColl');
    $('#stuPair').classList.toggle('none', !c);
    if (c && c.image) { const u = img(c.image, 160); if (ci.getAttribute('src') !== u) ci.src = u; ci.hidden = false; } else ci.hidden = true;
    $('#stuPvCollN').textContent = c ? c.name : 'no collection yet';
    $('#stuFlowC').textContent = c ? c.name : 'its collection’s'; $('#stuFlowP').textContent = S.policy === 'burn' ? 'the burn' : 'holders';
    const p = S.pick && S.pick.pick, tg = $('#stuTgt');
    tg.hidden = !c;
    if (c) tg.innerHTML = p ? `<span class="im"><img src="${esc(img(p.img, 120))}" alt=""></span><div><span>its first target, right now</span><b>${esc(p.name || 'a listing')}</b><em>${solf(p.price)} ◎ · rank ${p.rank.toLocaleString()} · floor ${solf(S.pick.floor)} ◎</em></div>`
      : `<div><span>its first target</span><em>${S.pick ? esc(S.pick.why || 'nothing rare near the floor right now') : 'reading the listings…'}</em></div>`;
    const mi = root.querySelector('.stu-mini img'); if (c && c.image) { mi.src = img(c.image, 72); mi.hidden = false; } else mi.hidden = true;
    root.querySelector('.stu-mini .t').innerHTML = `<b>$${esc(sym)}</b><span>${c ? '⇄ ' + esc(c.name) : 'no collection yet'}</span>`;
    curve();
  }
  function curve() {
    const r = S.quote || (S.quote = estimate(Math.round(S.buy * 1e9)));
    $('#stuCurveI').style.width = (S.buy ? Math.max(.8, r.progress * 100) : 0) + '%';
    $('#stuCurveN').textContent = S.buy ? (r.progress * 100).toFixed(1) + '% after your buy' : 'starts at 0%';
    $('#stuMc').innerHTML = `opens at <b>≈ ${solf(r.startMcapSol)} ◎</b> market cap${S.buy ? ` · <b>≈ ${solf(r.afterMcapSol)} ◎</b> after your buy` : ''}<br><span>graduates to pumpswap when the curve fills</span>`;
  }

  // ================================================================ the draft survives a closed tab
  let saveT = 0;
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(() => { if (S.done) return; try { T.store.set(DKEY, JSON.stringify({ v: 1, coll: S.coll, name: S.name, symbol: S.symbol, symTouched: S.symTouched, desc: S.desc, descTouched: S.descTouched, links: S.links, seed: S.face && S.face.kind === 'gen' ? S.seed : S.seed, ground: S.ground, policy: S.policy, buy: S.buy, step: S.step, max: S.max })); } catch {} }, 300);
  }
  function restore() {
    if (S.restored) return; S.restored = true;
    try {
      const d = JSON.parse(T.store.get(DKEY) || 'null'); if (!d || d.v !== 1) return;
      Object.assign(S, { name: String(d.name || ''), symbol: String(d.symbol || ''), symTouched: !!d.symTouched, desc: String(d.desc || ''), descTouched: !!d.descTouched,
        links: { twitter: String((d.links || {}).twitter || ''), telegram: String((d.links || {}).telegram || ''), website: String((d.links || {}).website || '') },
        seed: d.seed | 0 || S.seed, ground: d.ground || null, policy: d.policy === 'burn' ? 'burn' : 'holders', buy: Math.min(5, Math.max(0, +d.buy || 0)), step: Math.min(4, d.step | 0), max: Math.min(4, d.max | 0) });
      if (d.coll && d.coll.c) { S.coll = d.coll; if (!board.some(x => x.c === d.coll.c)) S.extra.push({ ...d.coll, custom: true }); }
      if (S.max >= 2) setFace(genFace(S.seed, S.ground));
    } catch {}
  }
  function fillInputs() {
    $('#stuName').value = S.name; $('#stuSym').value = S.symbol; $('#stuDesc').value = S.desc || defDesc(); if (!S.desc) S.desc = defDesc();
    root.querySelectorAll('.stu-links input').forEach(i => { i.value = S.links[i.dataset.k] || ''; });
    if (Object.values(S.links).some(Boolean)) $('#stuLinks').open = true;
    paintCoin();
  }

  // ================================================================ wiring
  function wire() {
    root.addEventListener('click', e => {
      const t = e.target;
      if (t.closest('.stu-x')) return close();
      const st = t.closest('.stu-steps li'); if (st) return show(+st.dataset.s);
      if (t.closest('.stu-back')) return show(S.step - 1);
      if (t.closest('.stu-next')) return valid(S.step) ? show(S.step + 1) : nudge(S.step);
      if (t.closest('.stu-mini')) { root.classList.toggle('pvopen'); sfx('open'); return; }
      if (t.closest('.stu-pvx')) { root.classList.remove('pvopen'); return; }
      const tl = t.closest('.stu-tile'); if (tl) { if (tl.classList.contains('chk')) { if (tl.dataset.chk) check(tl.dataset.chk); return; } if (tl.dataset.c) select(tl.dataset.c); return; }
      const idea = t.closest('#stuIdeas button'); if (idea) { S.symbol = idea.dataset.t; S.symTouched = true; $('#stuSym').value = S.symbol; paintCoin(); pv(); foot(); save(); sfx('tick'); return; }
      if (t.closest('#stuGen')) { setFace(genFace(rnd(), S.ground), true); sfx('tick'); return; }
      if (t.closest('#stuUp')) return upload();
      const sw = t.closest('#stuSw button'); if (sw && !sw.disabled) { setFace(genFace(S.seed, sw.dataset.g || null), true); return; }
      const hb = t.closest('#stuHist button'); if (hb) { const c = S.hist[+hb.dataset.i]; if (c) { S.face = c; if (c.kind === 'gen') { S.seed = c.seed; S.ground = c.ground; } paintStage(true); paintFaceCtl(); pv(); save(); } return; }
      const pc = t.closest('.stu-pc'); if (pc) { S.policy = pc.dataset.p; paintPolicy(); if (!S.descTouched) { S.desc = defDesc(); $('#stuDesc').value = S.desc; } pv(); foot(); save(); sfx('beep'); return; }
      const bc = t.closest('#stuBuyC button'); if (bc) { S.buy = +bc.dataset.v; paintBuy(); quote(); pv(); foot(); save(); sfx('tick'); return; }
      const ed = t.closest('[data-go]'); if (ed) return show(+ed.dataset.go);
      const wb = t.closest('[data-wal]'); if (wb) { K.connectTo(wb.dataset.wal).then(() => { renderWal(); pv(); sfx('ok'); }).catch(err => { hint(err.message, true); sfx('err'); }); return; }
      if (t.closest('#stuGo')) return go();
      const act = t.closest('[data-act]'); if (act) {
        const a = act.dataset.act;
        if (a === 'logout') { K.logout(); renderWal(); pv(); }
        if (a === 'term') { const m = S.done && S.done.mint; if (solo) { location.href = m ? '/?coin=' + encodeURIComponent(m) : '/?term'; return; } close(); if (m) T.run('coin ' + m); }
        if (a === 'again') again();
        if (a === 'route') { act.disabled = true; act.textContent = 'locking…'; K.route(act.dataset.mint).then(() => { act.textContent = 'locked 80/20'; sfx('ok'); }).catch(err => { act.disabled = false; act.textContent = 'lock the fees now'; hint(K.human(err), true); }); }
      }
    });
    root.addEventListener('input', e => {
      const t = e.target;
      if (t.id === 'stuQ') return filter();
      if (t.id === 'stuName') { S.name = t.value; if (!S.symTouched) { S.symbol = ideas()[0] || ''; $('#stuSym').value = S.symbol; } }
      if (t.id === 'stuSym') { const v = t.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10); if (v !== t.value) t.value = v; S.symbol = v; S.symTouched = !!v; }
      if (t.id === 'stuDesc') { S.desc = t.value; S.descTouched = true; }
      if (t.dataset && t.dataset.k) S.links[t.dataset.k] = t.value;
      if (t.id === 'stuBuy') { S.buy = Math.round(+t.value * 100) / 100; paintBuy(); quote(); }
      paintCoin(); pv(); foot(); save();
    });
    $('#stuDesc').addEventListener('blur', () => { if (!S.desc.trim()) { S.descTouched = false; S.desc = defDesc(); $('#stuDesc').value = S.desc; paintCoin(); pv(); save(); } });
    root.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (root.classList.contains('pvopen')) root.classList.remove('pvopen'); else close(); return; }
      if (e.key === 'Enter' && !e.shiftKey && e.target.tagName === 'INPUT' && e.target.type !== 'range') {
        e.preventDefault();
        if (e.target.id === 'stuQ') { const c = root.querySelector('.stu-tile.chk:not([hidden])'); if (c && c.dataset.chk) return check(c.dataset.chk); const v = [...root.querySelectorAll('.stu-tile[data-c]:not([hidden])')]; if (v.length) { select(v[0].dataset.c); if (v.length === 1) show(1); } return; }
        if (valid(S.step)) show(S.step + 1); else nudge(S.step);
      }
    });
    // keep the shell from taking the keys while the studio is open
    root.addEventListener('keydown', e => e.stopPropagation());
    const face = $('#stuFace'), v2 = root.querySelector('.stu-v[data-v="2"]');
    ['dragenter', 'dragover'].forEach(n => v2.addEventListener(n, e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); face.classList.add('drag'); } }));
    ['dragleave', 'drop'].forEach(n => v2.addEventListener(n, e => { if (n === 'dragleave' && v2.contains(e.relatedTarget)) return; face.classList.remove('drag'); }));
    v2.addEventListener('drop', e => { e.preventDefault(); const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) upload(f); });
    if (K.W.on) K.W.on(() => { if (!root.hidden) { if (S.step === 4) renderWal(); pv(); } });
  }

  // ================================================================ open and close
  let solo = false;     // opened from the hall's right screen: the studio is the whole page, closing it goes back to the hall
  function open(o = {}) {
    if (!root) build();
    if (o.solo && !solo) { solo = true; root.classList.add('solo'); const x = $('.stu-x'); x.innerHTML = '← hall'; x.setAttribute('aria-label', 'back to the hall'); }
    if (S.done && !S.busy) again();
    loadBoard().then(() => { const had = S.extra.length; restore(); if (S.extra.length !== had || S.coll) renderGrid(); fillInputs(); if (S.face) { paintStage(); paintFaceCtl(); } pv();
      const want = o.c ? normSym(o.c) : null;
      if (want && symOk(want)) { if (all().some(x => x.c === want)) select(want, true); else check(want); show(0, { quiet: true }); }
      else show(S.step, { quiet: true });
      if (S.coll) loadPick(S.coll.c);
    });
    root.hidden = false; document.body.classList.add('stu-open');
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('on')));
    sfx('open'); refreshOpen();
    if (!S.quote) S.quote = estimate(0);
    quote();
  }
  function close() {
    if (S.busy) { hint('the launch is running. finish it in your wallet.', true); return; }
    if (solo) { location.href = '/?back'; return; }
    root.classList.remove('on', 'pvopen'); document.body.classList.remove('stu-open');
    setTimeout(() => { if (!root.classList.contains('on')) root.hidden = true; }, 280);
    sfx('tick');
    const cmd = document.querySelector('#cmd'); if (cmd && !T.mobile) cmd.focus({ preventScroll: true });
  }
  T.studio = { open, close, isOpen: () => !!root && !root.hidden };
}
