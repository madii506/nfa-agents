// POST /api/build {mint, payer, devBuy, only} — the launch transactions for a coin /api/coin just recorded, built with
// pump.fun's SDK for the launcher's wallet to sign. only:'route' rebuilds just the fee-routing transaction (if the coin
// landed but its routing didn't). Nothing here can sign: the server has no key.
const L = require('./_lib');
module.exports = async (req, res) => {
  if (req.method === 'GET') {
    // GET /api/build?quote=<lamports>: what a first buy of that size gets on a fresh curve (pump.fun's own math)
    if (L.limited('quote:' + L.ip(req), 150, 60000)) return L.send(res, 200, { ok: false, error: 'Too many quotes. Wait a moment.' });
    const lam = Math.max(0, Math.min(5e9, Math.round(Number(L.query(req).quote) || 0)));
    try { const P = require('./_pump'); return L.send(res, 200, { ok: true, lamports: lam, ...(await P.quote({ rpcUrl: L.RPC_URL(), mock: L.MOCK, lamports: lam })) }, L.CACHE(30)); }
    catch (e) { return L.send(res, 200, { ok: false, error: 'pump.fun’s curve didn’t load: ' + String(e && e.message || e).slice(0, 120) }); }
  }
  if (req.method !== 'POST') return L.send(res, 405, { ok: false, error: 'POST only.' });
  if (L.limited('build:' + L.ip(req), 30, 600000)) return L.send(res, 200, { ok: false, error: 'Too many tries. Wait a few minutes.' });
  if (!L.dbReady()) return L.send(res, 200, { ok: false, error: 'nfa’s records are offline.' });
  const b = await L.body(req, 8 * 1024), mint = String(b.mint || ''), payer = String(b.payer || '');
  if (!L.isAddr(mint) || !L.isAddr(payer)) return L.send(res, 200, { ok: false, error: 'That request doesn’t look right.' });
  try {
    await L.ready();
    const o = (await L.q('SELECT mint, name, symbol, payer, vault, treasury, status FROM nfa_coins WHERE mint=$1', [mint]))[0];
    if (!o) return L.send(res, 200, { ok: false, error: 'Record the coin first.' });
    if (o.payer !== payer) return L.send(res, 200, { ok: false, error: 'Only the wallet that started this launch can sign it.' });
    if (o.status === 'live') return L.send(res, 200, { ok: false, error: 'This coin is already live.' });
    if (o.vault !== L.vaultOfCoin(mint) || o.treasury !== L.TREASURY) return L.send(res, 200, { ok: false, error: 'The recorded split is out of date. Start the launch again.' });
    const P = require('./_pump');
    const bh = (await L.rpc('getLatestBlockhash', [{ commitment: 'confirmed' }])).value.blockhash;
    const devBuy = Math.max(0, Math.min(5e9, Math.round(Number(b.devBuy) || 0)));
    const out = await P.buildLaunch({ rpcUrl: L.RPC_URL(), mock: L.MOCK, mint, user: payer, name: o.name, symbol: o.symbol, uri: L.origin(req) + '/m/' + mint,
      shares: L.sharesFor(mint), prefund: [{ to: o.vault, lamports: Math.round(L.PREFUND * 1e9) }], devBuy: b.only === 'route' ? 0 : devBuy, blockhash: bh });
    if (b.only === 'route') out.txs = [out.txs[1]];
    L.send(res, 200, { ok: true, ...out, shares: L.sharesFor(mint), vault: o.vault, treasury: o.treasury, studio: L.STUDIO });
  } catch (e) { L.send(res, 200, { ok: false, error: 'The transactions didn’t build: ' + String(e && e.message || e).slice(0, 160) }); }
};
