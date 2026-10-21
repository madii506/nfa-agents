// /api/coin
//   POST {mint, payer, name, symbol, collection, coll_name, policy, image, description}
//        record a coin before it launches: its paired collection, its policy and its picture. Returns the metadata
//        uri the coin will point at and the two addresses its fees will be split between.
//   GET  ?list=1                 every live coin
//   GET  ?mint=<mint> | ?t=<sym> one coin, with what the chain says about its fee split and its agent vault
//   GET  ?me=<wallet>            coins a wallet launched
//   GET  ?receipts=1[&mint=]     the agent's receipts
const L = require('./_lib');
const ME = 'https://api-mainnet.magiceden.dev/v2';
const symOk = s => typeof s === 'string' && /^[a-z0-9][a-z0-9_\-]{1,63}$/i.test(s);
const bytes = s => Buffer.byteLength(s, 'utf8');
const pub = r => ({ mint: r.mint, name: r.name, symbol: r.symbol, collection: r.collection, coll_name: r.coll_name, coll_image: r.coll_image, policy: r.policy, vault: r.vault, treasury: r.treasury, payer: r.payer, created_at: r.created_at, live_at: r.live_at, sig: r.sig, status: r.status });

function image(dataUrl) {
  const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) return null;
  const b = Buffer.from(m[2], 'base64');
  if (b.length < 64 || b.length > 450 * 1024) return null;
  const png = b[0] === 0x89 && b[1] === 0x50, jpg = b[0] === 0xff && b[1] === 0xd8, webp = b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP';
  if (!(png || jpg || webp)) return null;
  return { buf: b, type: png ? 'image/png' : jpg ? 'image/jpeg' : 'image/webp' };
}

// an optional social link: https only, on the right host; null when empty, undefined when it doesn't check out
function link(v, host) {
  v = String(v || '').trim(); if (!v) return null;
  if (/^@?[A-Za-z0-9_]{1,15}$/.test(v) && String(host).includes('twitter')) v = 'https://x.com/' + v.replace(/^@/, '');
  if (!/^https?:\/\//i.test(v)) v = 'https://' + v.replace(/^\/+/, '');
  try { const u = new URL(v); if (!/^https?:$/.test(u.protocol) || !host.test(u.hostname) || v.length > 200) return undefined; u.protocol = 'https:'; return u.toString(); } catch { return undefined; }
}

async function post(req, res) {
  if (L.limited('coin:' + L.ip(req), 20, 600000)) return L.send(res, 200, { ok: false, error: 'Too many launches from here. Wait a few minutes.' });
  if (!L.dbReady()) return L.send(res, 200, { ok: false, error: 'nfa’s records are offline, so launching is paused. Try again shortly.' });
  if (!L.STUDIO) return L.send(res, 200, { ok: false, error: 'Launching opens once the nfa studio wallet is set. Very soon.' });
  const b = await L.body(req, 700 * 1024);
  if (b.tooBig) return L.send(res, 200, { ok: false, error: 'That picture is too big. Keep it under 400 KB.' });
  const mint = String(b.mint || ''), payer = String(b.payer || ''), name = L.clean(b.name, 64), symbol = L.clean(b.symbol, 20).replace(/^\$/, '').toUpperCase();
  const collection = String(b.collection || '').trim().toLowerCase(), policy = b.policy === 'burn' ? 'burn' : b.policy === 'holders' ? 'holders' : null;
  if (!L.isAddr(mint)) return L.send(res, 200, { ok: false, error: 'The new coin address is missing.' });
  if (!L.isAddr(payer)) return L.send(res, 200, { ok: false, error: 'Connect your wallet first.' });
  if (!name || bytes(name) > 32) return L.send(res, 200, { ok: false, error: 'Give it a name of up to 32 characters.' });
  if (!/^[A-Z0-9]{1,10}$/.test(symbol)) return L.send(res, 200, { ok: false, error: 'The ticker is 1–10 letters or numbers.' });
  if (L.BANNED.test(name + ' ' + symbol)) return L.send(res, 200, { ok: false, error: 'Pick another name.' });
  if (!symOk(collection)) return L.send(res, 200, { ok: false, error: 'Pair it with a collection symbol from Magic Eden, like mad_lads.' });
  if (!policy) return L.send(res, 200, { ok: false, error: 'Choose holders or burn.' });
  const img = image(b.image); if (!img) return L.send(res, 200, { ok: false, error: 'The picture didn’t come through. Use a PNG, JPEG or WebP under 400 KB.' });
  const links = {}; for (const [k, re, what] of [['twitter', /^(www\.|mobile\.)?(x|twitter)\.com$/i, 'X'], ['telegram', /^(www\.)?(t\.me|telegram\.me)$/i, 'Telegram'], ['website', /\./, 'website']]) {
    const v = link(b[k], re); if (v === undefined) return L.send(res, 200, { ok: false, error: `That ${what} link doesn’t look right.` }); links[k] = v;
  }
  // the collection must be real
  let coll_name = L.clean(b.coll_name, 64) || collection, coll_image = null;
  try {
    const s = await L.remember('me:/collections/' + collection + '/stats', 45000, async () => { const r = await L.getJson(`${ME}/collections/${collection}/stats`, {}, 9000); if (!r.ok || !r.json) throw new Error(String(r.status)); return r.json; });
    if (!s || (s.floorPrice == null && s.listedCount == null)) return L.send(res, 200, { ok: false, error: 'Magic Eden has no collection called ' + collection + '.' });
  } catch (e) { return L.send(res, 200, { ok: false, error: /^4\d\d$/.test(e.message) && e.message !== '429' ? 'Magic Eden has no collection called ' + collection + '.' : 'Magic Eden didn’t answer just now. Try again in a minute.' }); }
  try { const i = await L.getJson(`${ME}/collections/${collection}`, {}, 6000); if (i.ok && i.json) { coll_name = L.clean(i.json.name, 64) || coll_name; coll_image = i.json.image || null; } } catch {}
  try { const acct = await L.rpc('getAccountInfo', [L.bondingCurveOf(mint), { encoding: 'base64' }]); if (acct && acct.value) return L.send(res, 200, { ok: false, error: 'That coin is already launched; its record can’t change.' }); }
  catch { return L.send(res, 200, { ok: false, error: 'Solana didn’t answer just now. Try again in a moment.' }); }
  if (L.BANNED.test(String(b.description || ''))) return L.send(res, 200, { ok: false, error: 'Reword the description: no promises about returns.' });
  const desc = L.clean(b.description, 300) || `Paired with ${coll_name}. Its nfa agent spends 80% of this coin's creator fees buying ${coll_name} NFTs for ${policy === 'burn' ? 'the burn' : 'holders'}.`;
  const vault = L.vaultOfCoin(mint), treasury = L.TREASURY;
  try {
    await L.ready();
    const prev = await L.q('SELECT status, payer FROM nfa_coins WHERE mint=$1', [mint]);
    if (prev.length && prev[0].status !== 'pending') return L.send(res, 200, { ok: false, error: 'That coin is already recorded.' });
    await L.q(`INSERT INTO nfa_coins (mint, name, symbol, description, collection, coll_name, coll_image, policy, payer, vault, treasury, image, image_type, twitter, telegram, website)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      ON CONFLICT (mint) DO UPDATE SET name=EXCLUDED.name, symbol=EXCLUDED.symbol, description=EXCLUDED.description, collection=EXCLUDED.collection, coll_name=EXCLUDED.coll_name,
        coll_image=EXCLUDED.coll_image, policy=EXCLUDED.policy, payer=EXCLUDED.payer, image=EXCLUDED.image, image_type=EXCLUDED.image_type,
        twitter=EXCLUDED.twitter, telegram=EXCLUDED.telegram, website=EXCLUDED.website WHERE nfa_coins.status='pending'`,
      [mint, name, symbol, desc, collection, coll_name, coll_image, policy, payer, vault, treasury, img.buf.toString('base64'), img.type, links.twitter, links.telegram, links.website]);
  } catch (e) { return L.send(res, 200, { ok: false, error: 'The coin’s record didn’t save. Try again.' }); }
  const site = L.origin(req);
  L.send(res, 200, { ok: true, uri: site + '/m/' + mint, image: site + '/i/' + mint, vault, treasury, studio: L.STUDIO, prefund: L.PREFUND, shares: L.sharesFor(mint), name, symbol, collection, coll_name, policy });
}

async function get(req, res) {
  const qy = L.query(req);
  if (qy.cfg) return L.send(res, 200, { ok: true, open: !!L.STUDIO && L.dbReady(), records: L.dbReady(), studio: L.STUDIO || null, treasury: L.TREASURY || null, prefund: L.PREFUND, split: L.SPLIT }, L.CACHE(20));
  if (!L.dbReady()) return L.send(res, 200, { ok: true, coins: [], receipts: [], offline: true }, L.CACHE(30));
  await L.ready();
  if (qy.list) {
    const rows = await L.q(`SELECT mint, name, symbol, collection, coll_name, coll_image, policy, vault, treasury, payer, created_at, live_at, sig, status FROM nfa_coins WHERE status='live' ORDER BY live_at DESC LIMIT 200`);
    return L.send(res, 200, { ok: true, coins: rows.map(pub) }, L.CACHE(15));
  }
  if (qy.me) {
    if (!L.isAddr(String(qy.me))) return L.send(res, 200, { ok: false, error: 'That isn’t a wallet address.' });
    const rows = await L.q(`SELECT mint, name, symbol, collection, coll_name, coll_image, policy, vault, treasury, payer, created_at, live_at, sig, status FROM nfa_coins WHERE payer=$1 AND status='live' ORDER BY live_at DESC LIMIT 50`, [String(qy.me)]);
    return L.send(res, 200, { ok: true, coins: rows.map(pub) });
  }
  if (qy.receipts) {
    const rows = qy.mint && L.isAddr(String(qy.mint)) ? await L.q('SELECT * FROM nfa_receipts WHERE mint=$1 ORDER BY id DESC LIMIT 50', [String(qy.mint)]) : await L.q('SELECT * FROM nfa_receipts ORDER BY id DESC LIMIT 50');
    return L.send(res, 200, { ok: true, receipts: rows }, L.CACHE(15));
  }
  let row = null;
  if (qy.mint && L.isAddr(String(qy.mint))) row = (await L.q(`SELECT * FROM nfa_coins WHERE mint=$1`, [String(qy.mint)]))[0];
  else if (qy.t) row = (await L.q(`SELECT * FROM nfa_coins WHERE upper(symbol)=upper($1) AND status='live' ORDER BY live_at DESC LIMIT 1`, [String(qy.t).replace(/^\$/, '')]))[0];
  if (!row) return L.send(res, 200, { ok: false, error: 'No nfa coin by that name.' });
  let chain = null;
  try {
    const P = require('./_pump');
    const acc = async addrs => (await L.accounts(addrs));
    const r = await P.routing(row.mint, acc, [row.vault]);
    chain = { ...r, vaultLamports: r.extra && r.extra[0] ? r.extra[0].lamports : 0 }; delete chain.extra;
  } catch (e) { chain = { error: 'Solana didn’t answer just now.' }; }
  const receipts = await L.q('SELECT * FROM nfa_receipts WHERE mint=$1 ORDER BY id DESC LIMIT 20', [row.mint]);
  L.send(res, 200, { ok: true, coin: pub(row), chain, receipts, expect: L.sharesFor(row.mint) }, L.CACHE(10));
}

module.exports = async (req, res) => {
  try {
    if (req.method === 'POST') return await post(req, res);
    return await get(req, res);
  } catch (e) { L.send(res, 200, { ok: false, error: 'Something went wrong reading the records.' }); }
};
