// nfa launch: wallets (Phantom, Solflare, Backpack), the launch wizard, and the coins it makes.
// One wallet prompt signs the transactions the server built with pump.fun's own SDK:
//   1  the coin (create_v2, creator = you) + its fee-sharing config
//   2  the agent vault's first 0.001 SOL + the split: 80% agent vault, 20% treasury, admin revoked (locked forever)
//   3  your first buy (optional), after the fees are routed
// Before you sign, this page reads the transactions itself: the coin is the one made here, the creator is you, and the
// split pays exactly the vault it derives on its own from the studio wallet and the mint.
export function install(T) {
  const { print, k, esc, spinner, api, sleep } = T;
  const PUMP = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P', FEES = 'pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ';
  const D_CREATE = '214,144,76,236,95,139,49,180', D_UPDATE = '111,251,49,6,78,78,106,18';
  const W = { me: null, prov: null, id: null }; T.wallet = W;
  const short = a => a ? a.slice(0, 4) + '…' + a.slice(-4) : '';
  const sol = l => (Number(l) / 1e9).toFixed(Number(l) >= 1e9 ? 3 : 4) + ' SOL';
  const mobileUA = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const PROVS = [
    { id: 'phantom', name: 'Phantom', get: () => (window.phantom && window.phantom.solana) || (window.solana && window.solana.isPhantom && window.solana), url: 'https://phantom.com', deep: u => 'https://phantom.app/ul/browse/' + encodeURIComponent(u) + '?ref=' + encodeURIComponent(location.origin) },
    { id: 'solflare', name: 'Solflare', get: () => (window.solflare && window.solflare.isSolflare && window.solflare) || null, url: 'https://solflare.com', deep: u => 'https://solflare.com/ul/v1/browse/' + encodeURIComponent(u) + '?ref=' + encodeURIComponent(location.origin) },
    { id: 'backpack', name: 'Backpack', get: () => window.backpack && (window.backpack.solana || window.backpack), url: 'https://backpack.app', deep: null },
  ];
  const walBtn = document.querySelector('#wal');
  function setMe(pk, pr, id) {
    W.me = pk; W.prov = pr; W.id = id; T.store.set('nfa:wallet', id);
    walBtn.textContent = short(pk); walBtn.classList.add('on');
    if (pr.on) try { pr.on('accountChanged', kk => { if (kk) setMe(kk.toString(), pr, id); else logout(); }); } catch {}
  }
  function logout() { try { W.prov && W.prov.disconnect && W.prov.disconnect(); } catch {} W.me = W.prov = W.id = null; T.store.set('nfa:wallet', null); walBtn.textContent = 'connect'; walBtn.classList.remove('on'); }
  walBtn.addEventListener('click', () => T.run(W.me ? 'wallet' : 'connect'));
  (async function reconnect() { const id = T.store.get('nfa:wallet'), p = PROVS.find(x => x.id === id); if (!p) return; for (let i = 0; i < 8 && !p.get(); i++) await sleep(250); if (!p.get()) return; try { const pr = p.get(), r = await pr.connect({ onlyIfTrusted: true }), pk = (r && r.publicKey) || pr.publicKey; if (pk) setMe(pk.toString(), pr, id); } catch {} })();

  async function connect(which) {
    if (W.me) return true;
    const found = PROVS.filter(p => p.get());
    let p = which ? PROVS.find(x => x.id === which) : found.length === 1 ? found[0] : null;
    if (!p) {
      print('<b>connect a wallet</b> <span class="dim">· you sign everything in your own wallet; nfa never holds a key</span>');
      print(PROVS.map(x => x.get() ? `  ${k('connect ' + x.id, x.name.toLowerCase())} <span class="dim">detected</span>` : `  <a class="lk" href="${mobileUA && x.deep ? x.deep(location.href) : x.url}" target="_blank" rel="noopener">${x.name.toLowerCase()}</a> <span class="dim">${mobileUA && x.deep ? 'open this site in the app ↗' : 'install ↗'}</span>`).join('\n'));
      return false;
    }
    const pr = p.get(); if (!pr) { print(`<span class="dim">${p.name} isn’t installed here.</span> <a class="lk" href="${p.url}" target="_blank" rel="noopener">get it ↗</a>`); return false; }
    const s = spinner(`asking ${p.name} to connect`);
    try { const r = await pr.connect(), pk = (r && r.publicKey) || pr.publicKey; if (!pk) throw new Error('no key'); setMe(pk.toString(), pr, p.id); s.done(`connected <b>${short(W.me)}</b> <span class="dim">· ${p.name}</span>`); return true; }
    catch (e) { s.fail(`${p.name} didn’t connect. ${/reject|denied|cancel/i.test(String(e && e.message)) ? 'You declined it.' : ''}`); return false; }
  }

  // ---------------------------------------------------------------- solana, through the page's narrow rpc window
  let web3 = null;
  function loadWeb3() { if (window.solanaWeb3) return Promise.resolve(window.solanaWeb3); if (web3) return web3; web3 = new Promise((ok, no) => { const s = document.createElement('script'); s.src = '/assets/vendor/web3.min.js'; s.onload = () => ok(window.solanaWeb3); s.onerror = () => { web3 = null; no(new Error('Couldn’t load the Solana library. Check your connection.')); }; document.head.appendChild(s); }); return web3; }
  async function rpc(method, params) { const j = await api('/api/rpc', { body: { method, params }, timeout: 20000 }); if (!j.ok) { const e = new Error(explain(j.error, j.logs)); e.logs = j.logs; throw e; } return j.result; }
  const toB64 = u => { let s = ''; const a = u instanceof Uint8Array ? u : Uint8Array.from(u); for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); };
  const fromB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  async function confirm(sig) {
    for (let i = 0; i < 50; i++) {
      await sleep(1400);
      const st = await rpc('getSignatureStatuses', [[sig], { searchTransactionHistory: false }]).catch(() => null);
      const s = st && st.value && st.value[0];
      if (s && s.err) throw new Error('It failed on-chain, so nothing changed. ' + (JSON.stringify(s.err).includes('6018') || JSON.stringify(s.err).includes('6025') ? 'pump.fun refused the launch shape.' : ''));
      if (s && (s.confirmationStatus === 'confirmed' || s.confirmationStatus === 'finalized')) return true;
    }
    throw new Error('Solana hasn’t confirmed it yet. Check your wallet’s activity before trying again.');
  }
  const send = tx => rpc('sendTransaction', [toB64(tx.serialize()), { encoding: 'base64', preflightCommitment: 'confirmed', maxRetries: 5 }]);
  async function simulate(tx) {
    const r = await rpc('simulateTransaction', [toB64(tx.serialize()), { encoding: 'base64', sigVerify: false, replaceRecentBlockhash: true, commitment: 'confirmed' }]);
    const v = r && r.value; if (!v) throw new Error('Solana didn’t simulate it.');
    if (v.err) { const e = new Error(explain(v.err, v.logs)); e.logs = v.logs; throw e; }
    return v;
  }
  function explain(err, logs) {
    const s = (typeof err === 'string' ? err : JSON.stringify(err)) + ' ' + (logs || []).join(' ');
    if (/insufficient lamports|InsufficientFunds|0x1\b|insufficient funds/i.test(s)) return 'Not enough SOL in your wallet for this.';
    if (/6018|6025/.test(s)) return 'pump.fun refused the launch shape. Reload and try again.';
    if (/already in use/i.test(s)) return 'That coin address is taken. Try again; a new one is made each time.';
    if (/AccountNotFound/i.test(s)) return 'Your wallet has no SOL on it yet.';
    return typeof err === 'string' ? err.slice(0, 200) : 'Solana would reject this: ' + String(JSON.stringify(err)).slice(0, 140);
  }
  const human = m => { m = String((m && m.message) || m); return /reject|denied|cancel|declined|closed/i.test(m) ? 'You cancelled it in your wallet. Nothing was sent.' : /insufficient|0x1\b|lamports/i.test(m) ? 'Not enough SOL in your wallet for that.' : m.slice(0, 280); };
  async function signAll(txs) { if (txs.length > 1 && W.prov.signAllTransactions) return W.prov.signAllTransactions(txs); const out = []; for (const t of txs) out.push(await W.prov.signTransaction(t)); return out; }

  // read the transactions before signing: the right coin, you as creator, the split we derived ourselves
  function ixs(tx) { const m = tx.message, keys = m.staticAccountKeys.map(x => x.toBase58()); return m.compiledInstructions.map(ix => ({ prog: keys[ix.programIdIndex], keys: ix.accountKeyIndexes.map(i => keys[i]), data: ix.data })); }
  const head = d => Array.from(d.slice(0, 8)).join(',');
  function b58(bytes) { const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'; let n = 0n; for (const b of bytes) n = n * 256n + BigInt(b); let s = ''; while (n > 0n) { s = A[Number(n % 58n)] + s; n /= 58n; } for (const b of bytes) { if (b === 0) s = '1' + s; else break; } return s; }
  function check(txs, want) {
    const create = ixs(txs[0]).find(i => i.prog === PUMP && head(i.data) === D_CREATE);
    if (!create) throw new Error('The coin creation is missing, so nothing was signed.');
    if (create.keys[0] !== want.mint) throw new Error('That isn’t the coin made here, so nothing was signed.');
    const d = create.data; let o = 8; for (let q = 0; q < 3; q++) { const n = d[o] | d[o + 1] << 8 | d[o + 2] << 16 | d[o + 3] << 24; o += 4 + n; }
    if (b58(d.slice(o, o + 32)) !== want.me) throw new Error('The coin’s creator isn’t you, so nothing was signed.');
    const up = ixs(txs[1]).find(i => i.prog === FEES && head(i.data) === D_UPDATE);
    if (!up) throw new Error('The fee split is missing, so nothing was signed.');
    const u = up.data, n = u[8] | u[9] << 8 | u[10] << 16 | u[11] << 24, got = [];
    for (let q = 0, p = 12; q < n; q++, p += 34) got.push({ address: b58(u.slice(p, p + 32)), bps: u[p + 32] | u[p + 33] << 8 });
    if (got.length !== want.shares.length || got.some((s, i) => s.address !== want.shares[i].address || s.bps !== want.shares[i].bps)) throw new Error('The fee split isn’t 80/20 to the vault and treasury, so nothing was signed.');
    return got;
  }
  async function derive(w3, studio, mint) { return (await w3.PublicKey.createWithSeed(new w3.PublicKey(studio), mint.slice(0, 32), w3.SystemProgram.programId)).toBase58(); }

  // ---------------------------------------------------------------- the coin picture: generated or uploaded
  function generated(seed) {
    const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    const f = T.PX.canvas(seed, 42); const t = f.traits; g.fillStyle = (f.getContext('2d').getImageData(0, 0, 1, 1).data.slice(0, 3)).reduce((s, v) => s + v.toString(16).padStart(2, '0'), '#'); g.fillRect(0, 0, 512, 512); g.drawImage(f, 4, 4); c.traits = t; return c;
  }
  function fromFile(file) {
    return new Promise((ok, no) => {
      if (!/^image\//.test(file.type)) return no(new Error('That isn’t a picture.'));
      if (file.size > 12e6) return no(new Error('That picture is over 12 MB.'));
      const url = URL.createObjectURL(file), im = new Image();
      im.onload = () => { const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d'); const s = Math.max(512 / im.width, 512 / im.height), w = im.width * s, h = im.height * s; g.fillStyle = '#fff'; g.fillRect(0, 0, 512, 512); g.drawImage(im, (512 - w) / 2, (512 - h) / 2, w, h); URL.revokeObjectURL(url); ok(c); };
      im.onerror = () => { URL.revokeObjectURL(url); no(new Error('That picture didn’t open.')); };
      im.src = url;
    });
  }
  function dataUrl(c) { let d = c.toDataURL('image/png'); if (d.length > 520000) { for (const q of [.9, .82, .72, .6]) { d = c.toDataURL('image/jpeg', q); if (d.length < 520000) break; } } return d; }
  function pickFile() { return new Promise(res => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/png,image/jpeg,image/webp,image/gif'; i.onchange = () => res(i.files && i.files[0] || null); i.click(); setTimeout(() => res(null), 120000); }); }

  // ---------------------------------------------------------------- the wizard
  T.reg('launch', { desc: 'launch a coin paired with an NFT collection', usage: 'launch', alias: ['new', 'create', 'deploy'], more: 'how the fees move: {cat fees.md}',
    async run(a, { signal }) {
      print('<b>launch a coin</b> <span class="dim">· paired with one NFT collection · its fees lock 80/20 at launch · esc cancels</span>');
      // name and ticker
      let name; for (;;) { name = await T.ask('name', { hint: 'up to 32 characters' }); if (name == null) return; name = name.trim(); if (name && new TextEncoder().encode(name).length <= 32) break; print('<span class="red">a name of 1–32 characters.</span>'); }
      const sug = name.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 6);
      let symbol; for (;;) { symbol = await T.ask('ticker', { hint: sug || 'e.g. AGENT' }); if (symbol == null) return; symbol = (symbol.trim() || sug).replace(/^\$/, '').toUpperCase(); if (/^[A-Z0-9]{1,10}$/.test(symbol)) break; print('<span class="red">1–10 letters or numbers.</span>'); }
      // the collection, checked live
      let coll; const sy = (T.market && T.market.symbols && T.market.symbols()) || [];
      print('<span class="dim">pair it with a solana collection on magic eden, by its symbol (the part after /marketplace/ in its url).</span>');
      for (;;) {
        const c = await T.ask('collection', { hint: sy[0] || 'mad_lads', choices: sy.slice(0, 6) }); if (c == null) return;
        const v = (c.trim() || sy[0] || 'mad_lads').toLowerCase().replace(/^.*marketplace\//, '').replace(/[/?#].*$/, '');
        const s = spinner('checking ' + v + ' on magic eden'); const d = await api('/api/me?op=stats&c=' + encodeURIComponent(v), { signal }).catch(e => ({ ok: false, error: e.message }));
        if (d.ok) { coll = d; s.done(`<b>${esc(d.name)}</b> <span class="dim">· floor ${d.floor != null ? d.floor.toFixed(d.floor >= 1 ? 2 : 3) : '—'} ◎ · ${d.listed ?? '—'} listed</span>`); break; }
        s.fail(esc(d.error || 'not found'));
      }
      // policy
      print(`<span class="dim">where do the NFTs go?</span>\n  <b>holders</b> <span class="dim">· each NFT the agent buys goes to one holder, by a draw anyone can check</span>\n  <b>burn</b>    <span class="dim">· each NFT goes to the burn, so the collection gets scarcer</span>`);
      let policy; for (;;) { const p = await T.ask('policy', { hint: 'holders or burn', choices: [{ value: 'holders', label: 'holders' }, { value: 'burn', label: 'burn' }] }); if (p == null) return; policy = /^b/i.test(p.trim()) ? 'burn' : /^h/i.test(p.trim()) || !p.trim() ? 'holders' : null; if (policy) break; }
      // the picture
      let canvas = null, seed = (Math.random() * 1e9) | 0;
      for (;;) {
        const pv = document.createElement('div'); pv.className = 'preview';
        if (canvas) { const show = document.createElement('canvas'); show.width = show.height = 512; show.getContext('2d').drawImage(canvas, 0, 0); pv.appendChild(show); const t = document.createElement('div'); t.className = 'dim'; t.innerHTML = canvas.traits ? `a generated agent · ${esc(canvas.traits.hat)} · ${esc(canvas.traits.eyes)} eyes` : 'your picture, cropped square'; pv.appendChild(t); T.node(pv); }
        const opts = canvas ? [{ value: 'use', label: 'use this' }, { value: 'generate', label: canvas.traits ? 'another one' : 'generate one' }, { value: 'upload', label: 'upload' }] : [{ value: 'generate', label: 'generate one' }, { value: 'upload', label: 'upload' }];
        const c = await T.ask('picture', { hint: canvas ? 'use, generate or upload' : 'generate or upload', choices: opts }); if (c == null) return;
        const v = c.trim().toLowerCase() || (canvas ? 'use' : 'generate');
        if (canvas && /^(use|use this|yes|y|ok)$/.test(v)) break;
        if (v.startsWith('up')) { const f = await pickFile(); if (!f) { print('<span class="dim">no file chosen.</span>'); continue; } try { canvas = await fromFile(f); } catch (e) { print(`<span class="red">${esc(e.message)}</span>`); } continue; }
        seed = (seed * 16807 + 11) % 2147483647; canvas = generated(seed + name.length * 97);
      }
      // a first buy
      let buy = 0; for (;;) { const b = await T.ask('first buy (SOL)', { hint: '0 for none, up to 5', choices: ['0', '0.1', '0.5', '1'] }); if (b == null) return; const n = parseFloat(String(b).replace(',', '.') || '0'); if (isFinite(n) && n >= 0 && n <= 5) { buy = n; break; } print('<span class="red">a number from 0 to 5.</span>'); }
      // review
      const pv = document.createElement('div'); pv.className = 'preview'; const show = document.createElement('canvas'); show.width = show.height = 512; show.getContext('2d').drawImage(canvas, 0, 0); pv.appendChild(show);
      const rv = document.createElement('div'); rv.innerHTML = `<b>${esc(name)}</b> <span class="dim">$${esc(symbol)}</span><br>paired with <b>${esc(coll.name)}</b> <span class="dim">(${esc(coll.c)})</span><br>NFTs go to <b>${policy === 'burn' ? 'the burn' : 'holders, by draw'}</b><br>creator fees <b>80%</b> <span class="dim">this coin’s agent vault ·</span> <b>20%</b> <span class="dim">nfa treasury · locked</span><br>first buy <b>${buy ? buy + ' SOL' : 'none'}</b><br><span class="dim">cost: pump.fun and network fees (your wallet shows them) + 0.001 SOL to open the vault</span>`;
      pv.appendChild(rv); T.node(pv);
      const go = await T.ask('launch it?', { hint: 'yes or no', choices: [{ value: 'yes', label: 'launch it' }, { value: 'no', label: 'cancel' }] });
      if (!go || !/^y|^launch/i.test(go.trim())) { print('<span class="dim">cancelled. nothing was sent.</span>'); return; }
      if (!W.me) { const ok = await connect(); if (!ok) { print(`<span class="dim">connect a wallet, then run ${k('launch')} again.</span>`); return; } }
      await doLaunch({ name, symbol, coll, policy, canvas, buy, signal });
    } });

  async function doLaunch({ name, symbol, coll, policy, canvas, buy, signal }) {
    const steps = ['recording the coin', 'building the transactions', 'reading them before you sign', 'waiting for your wallet', 'creating the coin', 'locking the fees 80/20', 'your first buy', 'waking its agent'];
    let s = null; const step = i => { if (s) s.done(`<span class="dim">${steps[i - 1]}</span>`); s = spinner(steps[i]); T.agentState(steps[i]); };
    try {
      const w3 = await loadWeb3();
      const mintKp = w3.Keypair.generate(), mint = mintKp.publicKey.toBase58();
      step(0);
      const meta = await api('/api/coin', { body: { mint, payer: W.me, name, symbol, collection: coll.c, coll_name: coll.name, policy, image: dataUrl(canvas) }, timeout: 30000 });
      if (!meta.ok) throw new Error(meta.error);
      const vault = await derive(w3, meta.studio, mint);
      if (vault !== meta.vault) throw new Error('The vault address didn’t check out, so nothing was sent.');
      const want = [{ address: vault, bps: 8000 }, { address: meta.treasury, bps: 2000 }];
      step(1);
      const b = await api('/api/build', { body: { mint, payer: W.me, devBuy: String(Math.round(buy * 1e9)) }, timeout: 30000 });
      if (!b.ok) throw new Error(b.error);
      const txs = b.txs.map(t => w3.VersionedTransaction.deserialize(fromB64(t)));
      step(2); check(txs, { mint, me: W.me, shares: want });
      await simulate(txs[0]);
      step(3); let signed; try { signed = await signAll(txs); } catch (e) { throw new Error(human(e)); }
      signed[0].sign([mintKp]);
      if (!signed[0].signatures.every(x => x && x.some(v => v !== 0))) throw new Error('A signature is missing, so nothing was sent.');
      step(4); const sig = await send(signed[0]); await confirm(sig);
      step(5);
      let routed = false;
      try { const s2 = await send(signed[1]); await confirm(s2); routed = true; } catch { routed = await route(mint).catch(() => false); }
      if (!routed) { s.fail(`the coin is live, but its fees aren’t locked yet. finish with ${k('coin ' + mint, 'coin ' + symbol)} → route.`); return; }
      let buyNote = '';
      if (signed[2]) { step(6); try { const s3 = await send(signed[2]); await confirm(s3); } catch { buyNote = 'your first buy didn’t confirm; check your wallet.'; } }
      step(7);
      let st = null; for (let i = 0; i < 8; i++) { st = await api('/api/settle', { body: { mint, sig } }).catch(() => null); if (st && st.live) break; await sleep(2500); }
      s.done('<span class="dim">its agent is awake</span>'); s = null;
      T.coins.unshift({ mint, symbol, name, collection: coll.c, coll_name: coll.name, policy });
      const el = document.createElement('div'); el.className = 'card';
      el.innerHTML = `<div class="shot px"><img src="${esc(meta.image)}" alt=""><div class="vf wide"><i></i><i></i><i></i><i></i></div></div><div class="meta"><span class="tag">live</span><h4>${esc(name)} <span class="dim">$${esc(symbol)}</span></h4>
        <div>paired with <b>${esc(coll.name)}</b> · NFTs to <b>${policy === 'burn' ? 'the burn' : 'holders'}</b></div><div class="dim">${esc(mint)}</div><div class="dim">fees 80% → ${esc(short(vault))} · 20% → ${esc(short(meta.treasury))} · locked</div>${buyNote ? `<div class="amber">${esc(buyNote)}</div>` : ''}
        <div class="btnrow"><a class="tb pri" href="https://pump.fun/coin/${esc(mint)}" target="_blank" rel="noopener">open on pump.fun ↗</a><a class="tb" href="https://solscan.io/tx/${esc(sig)}" target="_blank" rel="noopener">transaction ↗</a><a class="tb" href="https://x.com/intent/post?text=${encodeURIComponent(`I just launched $${symbol} on nfa, paired with ${coll.name}. Its agent spends the fees on ${coll.name} NFTs for ${policy === 'burn' ? 'the burn' : 'holders'}.\n\n${location.origin}`)}" target="_blank" rel="noopener">share on x ↗</a></div></div>`;
      T.node(el); setTimeout(() => el.querySelector('.vf').classList.remove('wide'), 60); T.sound && T.sound.sfx('ok'); T.agentState('idle');
    } catch (e) { if (s) s.fail(esc(human(e))); else print(`<span class="red">✗</span> ${esc(human(e))}`); T.agentState('idle'); }
  }
  async function route(mint) {
    const w3 = await loadWeb3();
    const b = await api('/api/build', { body: { mint, payer: W.me, only: 'route' } }); if (!b.ok) throw new Error(b.error);
    const tx = w3.VersionedTransaction.deserialize(fromB64(b.txs[0]));
    const [signed] = await signAll([tx]); const s = await send(signed); await confirm(s);
    await api('/api/settle', { body: { mint } }).catch(() => null); return true;
  }

  // ---------------------------------------------------------------- the rest of the wallet and coin commands
  T.reg('connect', { desc: 'connect phantom, solflare or backpack', usage: 'connect [phantom|solflare|backpack]', complete: () => PROVS.map(p => p.id), alias: ['login'],
    async run(a) { if (W.me) return print(`<span class="dim">already connected:</span> ${esc(W.me)} <span class="dim">·</span> ${k('disconnect')}`); await connect(a[0] && a[0].toLowerCase()); } });
  T.reg('disconnect', { desc: 'forget the connected wallet', alias: ['logout'], run() { if (!W.me) return print('<span class="dim">no wallet connected.</span>'); logout(); print('<span class="dim">disconnected.</span>'); } });
  T.reg('wallet', { desc: 'your wallet: address, balance, your coins', alias: ['me', 'balance'],
    async run() {
      if (!W.me) { print('<span class="dim">no wallet connected.</span>'); await connect(); if (!W.me) return; }
      print(`<b>${esc(W.me)}</b> <span class="dim">· ${esc(W.id || '')}</span>`);
      const s = spinner('reading balance');
      try { const r = await rpc('getBalance', [W.me, { commitment: 'confirmed' }]); s.done(`${sol(r.value)} <span class="dim">in this wallet</span>`); } catch (e) { s.fail('balance didn’t load.'); }
      const j = await api('/api/coin?me=' + W.me).catch(() => null);
      if (j && j.ok && j.coins.length) print('your coins: ' + j.coins.map(c => k('coin ' + c.mint, '$' + c.symbol)).join('  '));
      else print(`<span class="dim">no coins launched from this wallet yet.</span> ${k('launch')}`);
      print(`${k('disconnect')}`, 'dim');
    } });
  const findCoin = async (q) => {
    if (!q) return null;
    const j = await api(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(q) ? '/api/coin?mint=' + q : '/api/coin?t=' + encodeURIComponent(q.replace(/^\$/, '')), { timeout: 20000 });
    return j;
  };
  T.reg('coins', { desc: 'every coin launched on nfa, with live market caps', alias: ['ls-coins', 'board'],
    async run(a, { signal }) {
      const s = spinner('reading the records');
      const j = await api('/api/coin?list=1', { signal }).catch(e => ({ ok: false, error: e.message }));
      if (!j.ok) return s.fail(esc(j.error));
      T.coins = j.coins || [];
      if (!T.coins.length) { s.done('<b>no coins yet.</b> <span class="dim">the first rack in the hall is empty.</span>'); print(`${k('launch', 'launch the first one')} <span class="dim">·</span> ${k('how')}`); return; }
      s.done(`<b>${T.coins.length}</b> coin${T.coins.length === 1 ? '' : 's'} live`);
      let caps = {};
      try { const mints = T.coins.slice(0, 30).map(c => c.mint).join(','); const r = await fetch('https://api.dexscreener.com/latest/dex/tokens/' + mints, { signal }); const d = await r.json(); for (const p of d.pairs || []) { const m = p.baseToken && p.baseToken.address; if (m && (!caps[m] || (p.liquidity && p.liquidity.usd) > caps[m].liq)) caps[m] = { mc: p.marketCap || p.fdv, liq: p.liquidity && p.liquidity.usd || 0 }; } } catch {}
      const wide = T.cols() >= 64, cw = wide ? 26 : Math.max(8, T.cols() - 26);
      print(`<span class="hdr">${'  coin'.padEnd(14)}${'paired with'.padEnd(cw)}${wide ? 'policy'.padEnd(10) : ''}${'mcap'.padStart(10)}</span>`);
      for (const c of T.coins.slice(0, 60)) {
        const mc = caps[c.mint] && caps[c.mint].mc;
        print(`<span class="row" data-cmd="coin ${esc(c.mint)}">  ${esc(('$' + c.symbol).padEnd(12))}${esc(String(c.coll_name || c.collection).slice(0, cw - 2).padEnd(cw))}${wide ? esc(c.policy.padEnd(10)) : ''}${(mc ? '$' + (mc >= 1e6 ? (mc / 1e6).toFixed(2) + 'M' : mc >= 1e3 ? (mc / 1e3).toFixed(1) + 'K' : Math.round(mc)) : '—').padStart(10)}</span>`);
      }
      print('<span class="dim">click a coin for its vault, split and receipts · market caps from dexscreener, a dash means no data yet</span>');
    } });
  T.reg('coin', { desc: 'one coin: its split on-chain, its agent vault, its receipts', usage: 'coin <ticker|mint>', complete: () => T.coins.map(c => c.symbol),
    async run(a, { signal }) {
      if (!a[0]) { print(`<span class="dim">which coin?</span> ${T.coins.slice(0, 8).map(c => k('coin ' + c.mint, '$' + c.symbol)).join('  ') || k('coins')}`); return; }
      const s = spinner('reading the coin and the chain');
      const j = await findCoin(a[0]).catch(e => ({ ok: false, error: e.message }));
      if (!j || !j.ok) return s.fail(esc((j && j.error) || 'not found'));
      const c = j.coin, ch = j.chain || {};
      s.done(`<b>${esc(c.name)}</b> <span class="dim">$${esc(c.symbol)} · ${esc(c.mint)}</span>`);
      const want = j.expect || [];
      const ok = ch.exists && ch.routed && ch.revoked && want.every(w => (ch.shareholders || []).some(x => x.address === w.address && x.bps === w.bps));
      print(`paired with <b>${esc(c.coll_name || c.collection)}</b> <span class="dim">(${esc(c.collection)})</span> · NFTs to <b>${c.policy === 'burn' ? 'the burn' : 'holders'}</b>`);
      print(`split       ${ch.exists ? (ok ? '<b>80/20 locked</b> <span class="dim">· admin revoked · read from chain</span>' : '<span class="amber">not locked yet</span>') : '<span class="dim">' + esc(ch.error || 'not on chain') + '</span>'}`);
      print(`agent vault <b>${esc(c.vault)}</b> <span class="dim">· ${ch.vaultLamports != null ? sol(ch.vaultLamports) : '—'}</span>`);
      print(`treasury    <span class="dim">${esc(c.treasury)}</span>`);
      if (ch.exists) print(`waiting     ${sol(ch.waitingLamports || 0)} <span class="dim">in pump.fun’s creator vault · anyone can push it out:</span> ${k('feed ' + c.mint, 'feed')}`);
      if (ch.mcapSol) print(`market cap  ${ch.mcapSol.toFixed(1)} ◎ <span class="dim">on the bonding curve${ch.complete ? ', graduated' : ''}</span>`);
      if (j.receipts && j.receipts.length) { print('<b>receipts</b>'); j.receipts.forEach(r => print(`  ${new Date(r.at).toISOString().slice(0, 16).replace('T', ' ')}  ${esc(r.kind)}  ${esc(r.nft_name || '')} ${r.price_sol ? r.price_sol + ' ◎' : ''} ${r.tx ? `<a class="lk" href="https://solscan.io/tx/${esc(r.tx)}" target="_blank" rel="noopener">tx ↗</a>` : ''}`)); }
      else print('<span class="dim">no buys yet. receipts appear here with their transactions.</span>');
      const btn = [`<a class="tb" href="https://pump.fun/coin/${esc(c.mint)}" target="_blank" rel="noopener">pump.fun ↗</a>`, `<a class="tb" href="https://solscan.io/account/${esc(c.vault)}" target="_blank" rel="noopener">vault on solscan ↗</a>`, `<button class="tb k" type="button" data-cmd="pick ${esc(c.collection)}">agent pick</button>`];
      if (ch.exists && !ok && W.me === c.payer) btn.push(`<button class="tb pri k" type="button" data-cmd="route ${esc(c.mint)}">lock the fees</button>`);
      print(`<div class="btnrow">${btn.join('')}</div>`);
    } });
  T.reg('route', { hidden: true, desc: 'finish locking a coin’s fees', run: async (a) => { if (!W.me && !(await connect())) return; const s = spinner('rebuilding the fee split'); try { await route(a[0]); s.done('fees locked 80/20.'); } catch (e) { s.fail(esc(human(e))); } } });
  T.reg('feed', { desc: 'push a coin’s waiting fees out to its agent vault and treasury', usage: 'feed <ticker|mint>', complete: () => T.coins.map(c => c.symbol),
    async run(a) {
      if (!a[0]) return print(`<span class="dim">which coin?</span> ${T.coins.slice(0, 8).map(c => k('feed ' + c.mint, '$' + c.symbol)).join('  ') || k('coins')}`);
      if (!W.me && !(await connect())) return;
      const j = await findCoin(a[0]).catch(() => null); if (!j || !j.ok) return print(`<span class="red">✗</span> ${esc((j && j.error) || 'no such coin')}`);
      const s = spinner('building the payout');
      try {
        const w3 = await loadWeb3();
        const b = await api('/api/feed', { body: { mint: j.coin.mint, payer: W.me } }); if (!b.ok) throw new Error(b.error);
        if (!b.waiting) { s.done('<span class="dim">nothing is waiting right now. fees build up as people trade.</span>'); return; }
        s.set('waiting for your wallet · it only pays the network fee');
        const tx = w3.VersionedTransaction.deserialize(fromB64(b.tx)); const [signed] = await signAll([tx]);
        s.set('sending'); const sig = await send(signed); await confirm(sig);
        s.done(`paid out ${sol(b.waiting)} · 80% to the agent vault, 20% to the treasury <a class="lk" href="https://solscan.io/tx/${esc(sig)}" target="_blank" rel="noopener">tx ↗</a>`);
      } catch (e) { s.fail(esc(human(e))); }
    } });
  T.reg('receipts', { desc: 'every NFT the agents bought, with transactions', alias: ['buys'],
    async run() {
      const s = spinner('reading receipts');
      const j = await api('/api/coin?receipts=1').catch(e => ({ ok: false, error: e.message }));
      if (!j.ok) return s.fail(esc(j.error));
      if (!j.receipts.length) { s.done('<b>no receipts yet.</b> <span class="dim">the first buy posts here with its transaction.</span>'); return; }
      s.done(`${j.receipts.length} receipts`);
      j.receipts.forEach(r => print(`${new Date(r.at).toISOString().slice(0, 16).replace('T', ' ')}  ${esc(r.kind.padEnd(6))} ${esc(r.nft_name || '')} ${r.price_sol ? r.price_sol + ' ◎' : ''} ${r.tx ? `<a class="lk" href="https://solscan.io/tx/${esc(r.tx)}" target="_blank" rel="noopener">tx ↗</a>` : ''}`));
    } });
}
