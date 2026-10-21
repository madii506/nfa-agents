// GET /api/mkt?op=prices             SOL, BTC, ETH (Coinbase) and a few Solana names (Jupiter): price, 24h change, a 24-hour line
// GET /api/mkt?op=chart&s=SOL&r=1d   one chart, 1h | 1d | 1w | 1m: Coinbase candles for majors, GeckoTerminal for Solana tokens
// GET /api/mkt?op=chart&mint=<mint>  the same for any Solana token, pump.fun coins included
// GET /api/mkt?op=tokens&ids=a,b     coins by mint: name, icon, market cap, holders, changes (Jupiter)
// GET /api/mkt?op=pump&k=new|hot     pump.fun's newest coins, or the ones trending in the last five minutes (Jupiter)
// GET /api/mkt?op=curve&mint=<mint>  one pump.fun coin's bonding curve, read from the chain
// Read-only, cached, and every number comes from the source named next to it.
const L = require('./_lib');
const CB = 'https://api.exchange.coinbase.com', JUP = 'https://lite-api.jup.ag', GT = 'https://api.geckoterminal.com/api/v2';
const MAJ = { SOL: ['Solana', 'SOL-USD'], BTC: ['Bitcoin', 'BTC-USD'], ETH: ['Ethereum', 'ETH-USD'] };
const SPL = { PUMP: ['Pump', 'pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn'], JUP: ['Jupiter', 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN'], BONK: ['Bonk', 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'], WIF: ['dogwifhat', 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm'] };
const RANGES = { '1h': { cb: 60, n: 60, gt: ['minute', 1, 60] }, '1d': { cb: 300, n: 288, gt: ['minute', 15, 96] }, '1w': { cb: 3600, n: 168, gt: ['hour', 1, 168] }, '1m': { cb: 21600, n: 120, gt: ['hour', 4, 180] } };
const num = v => (v == null || v === '' || !isFinite(Number(v)) ? null : Number(v));

async function get(url, ttl, headers = {}) {
  return L.remember('mkt:' + url, ttl, async () => {
    const r = await L.getJson(url, { headers: { accept: 'application/json', ...headers } }, 9000);
    if (r.status === 429) throw new Error('The source is rate limiting right now. Try again in a minute.');
    if (!r.ok || r.json == null) throw new Error('The source answered ' + r.status + '.');
    return r.json;
  });
}
const tok = t => t && t.id ? {
  mint: t.id, name: L.clean(t.name, 48), symbol: L.clean(t.symbol, 16), icon: t.icon || null, usd: num(t.usdPrice), mcap: num(t.mcap ?? t.fdv), liq: num(t.liquidity),
  holders: num(t.holderCount), pad: t.launchpad || null, created: (t.firstPool && t.firstPool.createdAt) || t.createdAt || null, curve: num(t.bondingCurve), grad: !!t.graduatedPool,
  ch5m: num(t.stats5m && t.stats5m.priceChange), ch1h: num(t.stats1h && t.stats1h.priceChange), ch24: num(t.stats24h && t.stats24h.priceChange),
  vol1h: t.stats1h ? (num(t.stats1h.buyVolume) || 0) + (num(t.stats1h.sellVolume) || 0) : null, buys1h: num(t.stats1h && t.stats1h.numBuys), sells1h: num(t.stats1h && t.stats1h.numSells),
  x: t.twitter || null, web: t.website || null, dev: t.dev || null,
} : null;
const isPump = t => t && (t.launchpad === 'pump.fun' || /pump$/.test(t.id || ''));

async function prices() {
  const majors = await Promise.all(Object.entries(MAJ).map(async ([s, [name, id]]) => {
    try {
      const [st, cs] = await Promise.all([get(`${CB}/products/${id}/stats`, 15000), get(`${CB}/products/${id}/candles?granularity=3600`, 120000).catch(() => [])]);
      const last = num(st.last), open = num(st.open);
      return { s, name, src: 'coinbase', price: last, chg: last && open ? (last / open - 1) * 100 : null, high: num(st.high), low: num(st.low), vol: num(st.volume),
        spark: Array.isArray(cs) ? cs.slice(0, 24).reverse().map(c => num(c[4])).filter(v => v != null) : [] };
    } catch { return { s, name, src: 'coinbase', price: null }; }
  }));
  let spl = [];
  try {
    const j = await get(`${JUP}/price/v3?ids=${Object.values(SPL).map(v => v[1]).join(',')}`, 15000);
    spl = Object.entries(SPL).map(([s, [name, mint]]) => { const p = j && j[mint]; return p && num(p.usdPrice) ? { s, name, mint, src: 'jupiter', price: num(p.usdPrice), chg: num(p.priceChange24h), spark: [] } : null; }).filter(Boolean);
  } catch {}
  return [...majors.filter(x => x.price != null), ...spl];
}
async function poolOf(mint) {
  const j = await get(`${GT}/networks/solana/tokens/${mint}/pools?page=1`, 600000);
  const p = j && Array.isArray(j.data) && j.data[0];
  if (!p) throw Object.assign(new Error('No pool trades this coin yet.'), { code: 404 });
  return p.attributes.address;
}
async function chart(qy) {
  const s = String(qy.s || '').toUpperCase(), r = RANGES[qy.r] ? qy.r : '1d', R = RANGES[r];
  if (MAJ[s]) {
    const cs = await get(`${CB}/products/${MAJ[s][1]}/candles?granularity=${R.cb}`, r === '1h' ? 30000 : 120000);
    return { s, name: MAJ[s][0], r, src: 'coinbase', pts: (Array.isArray(cs) ? cs : []).slice(0, R.n).reverse().map(c => [c[0] * 1000, num(c[4])]).filter(p => p[1] != null) };
  }
  const mint = SPL[s] ? SPL[s][1] : L.isAddr(String(qy.mint || '')) ? String(qy.mint) : null;
  if (!mint) throw Object.assign(new Error('Name a coin: SOL, BTC, ETH, JUP, BONK, WIF, PUMP or a mint address.'), { code: 400 });
  const pool = await poolOf(mint), [tf, ag, lim] = R.gt;
  const j = await get(`${GT}/networks/solana/pools/${pool}/ohlcv/${tf}?aggregate=${ag}&limit=${lim}&currency=usd`, r === '1h' ? 30000 : 120000);
  const list = (j && j.data && j.data.attributes && j.data.attributes.ohlcv_list) || [];
  return { s: SPL[s] ? s : null, mint, pool, r, src: 'geckoterminal', pts: list.slice().reverse().map(c => [c[0] * 1000, num(c[4])]).filter(p => p[1] != null) };
}

module.exports = async (req, res) => {
  const qy = L.query(req), op = String(qy.op || '');
  if (L.limited('mkt:' + L.ip(req), 240, 60000)) return L.send(res, 200, { ok: false, error: 'Too many requests. Wait a minute.' });
  try {
    if (op === 'prices') return L.send(res, 200, { ok: true, at: Date.now(), list: await prices() }, L.CACHE(15));
    if (op === 'chart') return L.send(res, 200, { ok: true, ...(await chart(qy)) }, L.CACHE(30));
    if (op === 'tokens') {
      const ids = [...new Set(String(qy.ids || '').split(',').map(s => s.trim()).filter(L.isAddr))].slice(0, 50);
      if (!ids.length) return L.send(res, 200, { ok: true, list: [] });
      const j = await get(`${JUP}/tokens/v2/search?query=${ids.sort().join(',')}`, 15000);
      return L.send(res, 200, { ok: true, list: (Array.isArray(j) ? j : []).map(tok).filter(Boolean) }, L.CACHE(15));
    }
    if (op === 'pump') {
      const hot = qy.k === 'hot';
      const j = await get(hot ? `${JUP}/tokens/v2/toptrending/5m?limit=100` : `${JUP}/tokens/v2/recent`, hot ? 30000 : 8000);
      return L.send(res, 200, { ok: true, k: hot ? 'hot' : 'new', at: Date.now(), list: (Array.isArray(j) ? j : []).filter(isPump).map(tok).filter(Boolean).slice(0, 40) }, L.CACHE(hot ? 30 : 8));
    }
    if (op === 'curve') {
      const mint = String(qy.mint || ''); if (!L.isAddr(mint)) return L.send(res, 200, { ok: false, error: 'That isn’t a coin address.' });
      const P = require('./_pump');
      return L.send(res, 200, { ok: true, mint, ...(await P.curveOf(mint, L.accounts, L.RPC_URL(), L.MOCK)) }, L.CACHE(8));
    }
    L.send(res, 200, { ok: false, error: 'Unknown request.' });
  } catch (e) { L.send(res, 200, { ok: false, code: e.code || 502, error: String(e.message || e).slice(0, 200) }, 'no-store'); }
};
