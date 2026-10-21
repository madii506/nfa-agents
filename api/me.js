// GET /api/me?op=popular|stats|listings|pick|activity&c=<collection symbol>
// A narrow, cached window onto Magic Eden's public API: what's trending, a collection's floor, its cheapest listings
// with rarity, recent sales, and the agent's pick (rarest listing near the floor). Read-only.
const L = require('./_lib');
const ME = 'https://api-mainnet.magiceden.dev/v2';
const symOk = s => typeof s === 'string' && /^[a-z0-9][a-z0-9_\-]{1,63}$/i.test(s);
const lam = v => (v == null || !isFinite(Number(v)) ? null : Number(v) / 1e9);
// [symbol, name, a picture from one of its NFTs for the board]
const WATCH = [
  ['mad_lads', 'Mad Lads', 'https://madlads.s3.us-west-2.amazonaws.com/images/8376.png'],
  ['solana_monkey_business', 'Solana Monkey Business', 'https://arweave.net/GCqW0ZszLZMCohvYunRQ0yIrJUAY31SEvW4W7TOwl0o'],
  ['claynosaurz', 'Claynosaurz', 'https://storage.claynosaurz.com/claynosaurz/animated/3370'],
  ['degods', 'DeGods', 'https://metadata.degods.com/g/5794-dead-rm.png'],
  ['famous_fox_federation', 'Famous Fox Federation', 'https://famousfoxes.com/hd/9791.png'],
  ['okay_bears', 'Okay Bears', 'https://arweave.net/8s9YTtgompdqQzjwOBQ0KHK3_O3eMcpmJxOZ319jd5g'],
  ['collector_crypt', 'Collector Crypt', 'https://arweave.net/TTG7dbTOlV7qGF7uMfcuVOyaJIqUl9WdmBjHPAKhE58'],
  ['retardio_cousins', 'Retardio Cousins', 'https://d2nci21ylekf89.cloudfront.net/DUX8SZXLKigc84BBUcYjA7PuKe2SFwXFtQVgwmBsaXKm/1/761fe73c0a1e052af7fef4f034fa3d194d114f22ac27c7f3024d1537f9e63d55.png'],
  ['smb_gen3', 'SMB Gen3', 'https://gateway.irys.xyz/2WjGRXN2PoxVifDH4L3d6xUbmxWBP2rzhdhFCFy9bY2H'],
  ['tensorians', 'Tensorians', 'https://prod-tensor-creators-s3.s3.us-east-1.amazonaws.com/drop-metadata/24f27171-430f-42ca-b442-6a75a8daadad/images/2789.png'],
  ['aurory', 'Aurory', 'https://aurorians.cdn.aurory.io/aurorians-v2/current/images/full/4130.png'],
  ['cets_on_creck', 'Cets on Creck', 'https://cets.mypinata.cloud/ipfs/bafybeigptz7nal26d2xigwjxoek5bqfgv2oy45mdrihbyhzabdjddsirvu'],
  ['sharx', 'Sharx', 'https://arweave.net/lceIUDhwv6YORNsLzkR3asvLyta0Kv74yYwW9adWRS0?ext=png'],
  ['sensei', 'Sensei', 'https://sensei.launchifi.xyz/gif/2256.gif'],
  ['froganas', 'Froganas', 'https://arweave.net/_xqWgP1gSJuqA7uHY5is-SPwO0Uaoh-IQOdJ-gUCqls?ext=png'],
  ['portals', 'Portals', 'https://arweave.net/JPmNtGEUildq45Xhn1RO6XTMbTlaBhTap03za_rbMAY'],
  ['lifinity_flares', 'Lifinity Flares', 'https://www.arweave.net/c9gKlsJaSOYtNLaKhcRor4E9If-nk08X7ALKx-PWSuA?ext=webp']];

async function me(path, ttl) {
  return L.remember('me:' + path, ttl, async () => {
    const r = await L.getJson(ME + path, {}, 9000);
    if (r.status === 429) throw Object.assign(new Error('Magic Eden is rate limiting reads right now. Try again in a minute.'), { code: 429 });
    if (r.status === 400 || r.status === 404) throw Object.assign(new Error('No collection by that name on Magic Eden.'), { code: 404 });
    if (!r.ok || r.json == null) throw new Error('Magic Eden answered ' + r.status + '.');
    return r.json;
  });
}
const rankOf = r => {
  if (!r) return { rank: null, src: null, supply: null };
  for (const [k, src] of [['meInstant', 'magic eden'], ['merarity', 'magic eden'], ['moonrank', 'moonrank'], ['howrare', 'howrare']]) if (r[k] && Number(r[k].rank) > 0) return { rank: Number(r[k].rank), src, supply: Number(r[k].totalSupply) || null };
  return { rank: null, src: null, supply: null };
};
function mapListing(x) {
  const t = x.token || {}, R = rankOf(x.rarity);
  return { mint: x.tokenMint || t.mintAddress || null, name: L.clean(t.name, 60), img: (x.extra && x.extra.img) || t.image || null, price: Number(x.price) || null,
    rank: R.rank, src: R.src, supply: R.supply, attrs: (Array.isArray(t.attributes) ? t.attributes : []).slice(0, 14).map(a => [L.clean(a.trait_type, 24), L.clean(a.value, 32)]) };
}
async function stats(c) {
  const [s, info] = await Promise.all([me(`/collections/${c}/stats`, 45000), me(`/collections/${c}`, 600000).catch(() => null)]);
  if (!s || s.floorPrice == null && s.listedCount == null) throw Object.assign(new Error('No collection by that name on Magic Eden.'), { code: 404 });
  return { c, name: L.clean((info && info.name) || s.symbol || c, 64), image: (info && info.image) || null, desc: L.clean(info && info.description, 280),
    floor: lam(s.floorPrice), listed: s.listedCount ?? null, avg24: lam(s.avgPrice24hr), vol7: lam(s.volume7d),
    x: info && info.twitter ? String(info.twitter) : null, web: info && info.website ? String(info.website) : null };
}
async function listings(c) {
  const j = await me(`/collections/${c}/listings?offset=0&limit=100&sort=listPrice&sort_direction=asc`, 30000);
  return (Array.isArray(j) ? j : []).map(mapListing).filter(l => l.mint && l.price > 0);
}
// the agent's rule: listings priced at most 10% over the floor (25% if none), rarest first, cheaper on a tie
function pickFrom(floor, ls) {
  const ranked = ls.filter(l => l.rank);
  if (!floor || !ls.length) return { band: null, cands: [], pick: null, why: 'nothing is listed' };
  if (!ranked.length) return { band: null, cands: ls.slice(0, 8), pick: null, why: 'these listings carry no rarity rank' };
  for (const band of [10, 25]) {
    const near = ranked.filter(l => l.price <= floor * (1 + band / 100));
    if (near.length) { near.sort((a, b) => a.rank - b.rank || a.price - b.price); return { band, cands: near.slice(0, 8), pick: near[0], weighed: near.length }; }
  }
  const all = ranked.slice().sort((a, b) => a.price - b.price).slice(0, 20).sort((a, b) => a.rank - b.rank);
  return { band: null, cands: all.slice(0, 8), pick: null, why: 'nothing rare is listed near the floor right now' };
}

module.exports = async (req, res) => {
  const qy = L.query(req), op = String(qy.op || ''), c = String(qy.c || '').trim().toLowerCase();
  if (L.limited('me:' + L.ip(req), 90, 60000)) return L.send(res, 200, { ok: false, error: 'Too many requests. Wait a minute.' });
  try {
    if (op === 'popular') {
      // Magic Eden's trending endpoint went quiet, so the market board is a watchlist of major Solana collections,
      // each read live and sorted by seven-day volume.
      const list = await L.remember('watch', 600000, async () => {
        const out = WATCH.map(([c, name, image]) => ({ c, name, image, floor: null, listed: null, avg24: null, vol7: null }));
        await L.pool(out, 2, async o => {
          const s = await me(`/collections/${o.c}/stats`, 300000);
          Object.assign(o, { floor: lam(s.floorPrice), listed: s.listedCount ?? null, avg24: lam(s.avgPrice24hr), vol7: lam(s.volume7d) });
        });
        const good = out.filter(o => o.floor != null);
        if (!good.length) throw new Error('Magic Eden didn’t answer.');
        return good.sort((a, b) => (b.vol7 || 0) - (a.vol7 || 0));
      });
      return L.send(res, 200, { ok: true, at: Date.now(), basis: 'watchlist · 7-day volume', list }, L.CACHE(120));
    }
    if (!symOk(c)) return L.send(res, 200, { ok: false, error: 'Give a collection symbol, like mad_lads.' });
    if (op === 'stats') return L.send(res, 200, { ok: true, ...(await stats(c)) }, L.CACHE(45));
    if (op === 'listings') { const [s, ls] = await Promise.all([stats(c), listings(c)]); return L.send(res, 200, { ok: true, ...s, listings: ls.slice(0, 60) }, L.CACHE(30)); }
    if (op === 'pick') {
      const [s, ls] = await Promise.all([stats(c), listings(c)]);
      const p = pickFrom(s.floor, ls);
      return L.send(res, 200, { ok: true, ...s, read: ls.length, withRank: ls.filter(l => l.rank).length, ...p }, L.CACHE(30));
    }
    if (op === 'activity') {
      const j = await me(`/collections/${c}/activities?offset=0&limit=100`, 20000);
      const ev = (Array.isArray(j) ? j : []).filter(x => x && x.blockTime).map(x => ({ t: x.blockTime * 1000, type: x.type, price: Number(x.price) || null, mint: x.tokenMint || null, img: x.image || null, sig: x.signature || null }));
      return L.send(res, 200, { ok: true, c, events: ev.slice(0, 100) }, L.CACHE(20));
    }
    L.send(res, 200, { ok: false, error: 'Unknown request.' });
  } catch (e) {
    L.send(res, 200, { ok: false, code: e.code || 502, error: String(e.message || e).slice(0, 200) }, e.code === 404 ? L.CACHE(300) : 'no-store');
  }
};
