// GET /api/me?op=popular|stats|listings|pick|activity&c=<collection symbol>
// A narrow, cached window onto Magic Eden's public API: what's trending, a collection's floor, its cheapest listings
// with rarity, recent sales, and the agent's pick (rarest listing near the floor). Read-only.
const L = require('./_lib');
const ME = 'https://api-mainnet.magiceden.dev/v2';
const symOk = s => typeof s === 'string' && /^[a-z0-9][a-z0-9_\-]{1,63}$/i.test(s);
const lam = v => (v == null || !isFinite(Number(v)) ? null : Number(v) / 1e9);
// [symbol, name, a picture we know loads] — the board. Symbols Magic Eden doesn't know drop out on their own; pictures
// are checked before they're stored, and the ones left blank are filled from the collection's own listings.
const WATCH = [
  ['mad_lads', 'Mad Lads', 'https://madlads.s3.us-west-2.amazonaws.com/images/8376.png'],
  ['solana_monkey_business', 'Solana Monkey Business', 'https://arweave.net/GCqW0ZszLZMCohvYunRQ0yIrJUAY31SEvW4W7TOwl0o'],
  ['claynosaurz', 'Claynosaurz', 'https://storage.claynosaurz.com/claynosaurz/animated/3370'],
  ['degods', 'DeGods', 'https://metadata.degods.com/g/5794-dead-rm.png'],
  ['famous_fox_federation', 'Famous Fox Federation', 'https://famousfoxes.com/hd/9791.png'],
  ['okay_bears', 'Okay Bears', 'https://arweave.net/8s9YTtgompdqQzjwOBQ0KHK3_O3eMcpmJxOZ319jd5g'],
  ['collector_crypt', 'Collector Crypt', 'https://arweave.net/TTG7dbTOlV7qGF7uMfcuVOyaJIqUl9WdmBjHPAKhE58'],
  ['retardio_cousins', 'Retardio Cousins', null],
  ['smb_gen3', 'SMB Gen3', 'https://gateway.irys.xyz/2WjGRXN2PoxVifDH4L3d6xUbmxWBP2rzhdhFCFy9bY2H'],
  ['tensorians', 'Tensorians', 'https://prod-tensor-creators-s3.s3.us-east-1.amazonaws.com/drop-metadata/24f27171-430f-42ca-b442-6a75a8daadad/images/2789.png'],
  ['aurory', 'Aurory', 'https://aurorians.cdn.aurory.io/aurorians-v2/current/images/full/4130.png'],
  ['cets_on_creck', 'Cets on Creck', 'https://cets.mypinata.cloud/ipfs/bafybeigptz7nal26d2xigwjxoek5bqfgv2oy45mdrihbyhzabdjddsirvu'],
  ['sharx', 'Sharx', 'https://arweave.net/lceIUDhwv6YORNsLzkR3asvLyta0Kv74yYwW9adWRS0?ext=png'],
  ['sensei', 'Sensei', 'https://sensei.launchifi.xyz/gif/2256.gif'],
  ['froganas', 'Froganas', 'https://arweave.net/_xqWgP1gSJuqA7uHY5is-SPwO0Uaoh-IQOdJ-gUCqls?ext=png'],
  ['portals', 'Portals', 'https://arweave.net/JPmNtGEUildq45Xhn1RO6XTMbTlaBhTap03za_rbMAY'],
  ['lifinity_flares', 'Lifinity Flares', 'https://www.arweave.net/c9gKlsJaSOYtNLaKhcRor4E9If-nk08X7ALKx-PWSuA?ext=webp'],
  ...[
    ['degenerate_ape_academy', 'Degenerate Ape Academy'], ['boryoku_dragonz', 'Boryoku Dragonz'], ['transdimensional_fox_federation', 'Transdimensional Fox Federation'],
    ['galactic_geckos', 'Galactic Geckos'], ['galactic_gecko_space_garage', 'Galactic Gecko Space Garage'], ['the_catalina_whale_mixer', 'The Catalina Whale Mixer'], ['thugbirdz', 'Thugbirdz'],
    ['shadowy_super_coder_dao', 'Shadowy Super Coder'], ['cyber_frogs', 'Cyber Frogs'], ['trippin_ape_tribe', 'Trippin Ape Tribe'], ['pesky_penguins', 'Pesky Penguins'],
    ['stoned_ape_crew', 'Stoned Ape Crew'], ['primates', 'Primates'], ['astrals', 'Astrals'], ['kanpai_pandas', 'Kanpai Pandas'], ['quekz', 'Quekz'], ['ovols', 'Ovols'],
    ['blocksmith_labs', 'Blocksmith Labs'], ['jelly_rascals', 'Jelly Rascals'], ['bodoggos', 'Bodoggos'], ['solgods', 'SolGods'], ['duelbots', 'DuelBots'],
    ['rogue_sharks', 'Rogue Sharks'], ['taiyo_robotics', 'Taiyo Robotics'], ['abc_abracadabra', 'ABC'], ['saga_monkes', 'Saga Monkes'], ['monkey_baby_business', 'Monkey Baby Business'],
    ['genopets_habitats', 'Genopets Habitats'], ['lily', 'Lily'], ['communi3_mad_scientists', 'Communi3: Mad Scientists'], ['the_heist', 'The Heist'], ['honeyland_passes', 'Honeyland'],
    ['nyan_heroes', 'Nyan Heroes'], ['sol_slugs', 'Sol Slugs'], ['solana_mfers', 'Solana Mfers'], ['naked_meerkats', 'Naked Meerkats'], ['meerkat_millionaires_country_club', 'Meerkat Millionaires'],
    ['the_suites', 'The Suites'], ['dead_kings', 'Dead Kings'], ['bonkz', 'Bonkz'], ['great_goats', 'Great Goats'], ['photo_finish_pff', 'Photo Finish'], ['chimpions', 'Chimpions'],
    ['lux_world', 'Lux World'], ['atadians', 'Atadians'], ['solcasino_io', 'SolCasino'], ['the_remnants_', 'The Remnants'], ['frogana', 'Frogana'], ['vandals', 'Vandals'],
    ['y00ts', 'y00ts'], ['claynosaurz_popkins', 'Popkins'], ['nokiamon', 'Nokiamon'], ['bitbots', 'BitBots'], ['madlads_ow', 'Mad Lads OW'], ['goblins', 'Goblins'],
    ['solana_bears', 'Solana Bears'], ['sol_bears', 'Sol Bears'], ['zeta_wizards', 'Zeta Wizards'], ['marinade_chefs', 'Marinade Chefs'], ['drippies', 'Drippies'], ['bozo_collective', 'Bozo Collective'],
    ['the_lowlifes', 'The Lowlifes'], ['player_2', 'Player 2'], ['solana_money_boys', 'Solana Money Boys'], ['bitmatrix', 'Bitmatrix'], ['the_infected_mob', 'The Infected Mob'], ['gothic_degens', 'Gothic Degens'],
    ['solana_monkette_business', 'Solana Monkette Business'], ['solarians', 'Solarians'], ['degenerate_ape_kingdom', 'Degenerate Ape Kingdom'], ['shin_sengoku', 'Shin Sengoku'],
    ['bubblegoose_ballers', 'Bubblegoose Ballers'], ['sea_shanties', 'Sea Shanties'], ['solstein', 'Solstein'], ['angomon', 'Angomon'], ['tombstoned', 'Tombstoned'], ['sorcies', 'Sorcies'],
    ['skeleton_crew_skulls', 'Skeleton Crew'], ['brohalla', 'Brohalla'], ['the_dapper_ducks', 'Dapper Ducks'], ['lotus_gang', 'Lotus Gang'], ['solpunks', 'SolPunks'], ['monkedao', 'MonkeDAO'],
    ['cryptoon', 'Cryptoon'], ['ghostkidz', 'GhostKidz'], ['playground_waves', 'Playground Waves'], ['the_vanguards', 'The Vanguards'], ['enviro', 'Enviro'], ['famous_fox_dens', 'Fox Dens'],
    ['clayno_club', 'Clayno Club'], ['madhouse', 'Madhouse'], ['taiyo_pilots', 'Taiyo Pilots'], ['okay_bears_yearbook', 'Okay Bears Yearbook'], ['gen_2_aurorians', 'Aurorians Gen 2'], ['blob_city', 'Blob City'],
  ].map(([c, n]) => [c, n, null])];

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


// a picture that actually loads: a 200 or 206 with an image (or plain binary) body, inside eight seconds. Error pages
// (html, json) don't count.
async function loads(url) {
  if (!url || !/^https:\/\//.test(url)) return false;
  if (L.MOCK) return true;
  try {
    const r = await fetch(url, { headers: { range: 'bytes=0-2047', 'user-agent': L.UA, accept: 'image/*,*/*;q=0.8' }, signal: AbortSignal.timeout(8000) });
    try { r.body && r.body.cancel && await r.body.cancel(); } catch {}
    const ct = (r.headers.get('content-type') || '').toLowerCase();
    return (r.status === 200 || r.status === 206) && !/text\/html|json|xml/.test(ct);
  } catch { return false; }
}
async function pictureFor(c, given) {
  const tries = [];
  if (given) tries.push(given);
  const info = await me(`/collections/${c}`, 86400000).catch(() => null);
  if (info && info.image) tries.push(info.image);
  for (const u of tries) if (await loads(u)) return { image: u, ok: true, name: info && info.name };
  const ls = await listings(c).catch(() => []);
  for (const l of ls.slice(0, 5)) if (l.img && await loads(l.img)) return { image: l.img, ok: true, name: info && info.name };
  // nothing loads: the collection stays off the board (its pictures are on hosts that no longer answer), checked again tomorrow
  return { image: tries[0] || (ls.find(l => l.img) || {}).img || null, ok: false, name: info && info.name };
}
const rowOut = r => ({ c: r.symbol, name: r.name, image: r.image, floor: r.floor, listed: r.listed, avg24: r.avg24, vol7: r.vol7 });
async function boardDb() {
  await L.ready();
  const rows = await L.q('SELECT * FROM nfa_colls');
  const by = new Map(rows.map(r => [r.symbol, r])), now = Date.now(), age = r => now - Date.parse(r.updated_at);
  const due = WATCH.map(([c, name, img], i) => ({ c, name, img, i, r: by.get(c) }))
    .filter(x => !x.r || (!x.r.ok ? age(x.r) > 24 * 3600e3 : x.r.img_ok == null ? age(x.r) > 60e3 : x.r.img_ok === false ? age(x.r) > 12 * 3600e3 : age(x.r) > 10 * 60e3))
    .sort((a, b) => (a.r ? 1 : 0) - (b.r ? 1 : 0) || (a.r && b.r ? age(b.r) - age(a.r) : a.i - b.i)).slice(0, 8);
  await L.pool(due, 2, async x => {
    try {
      const s = await me(`/collections/${x.c}/stats`, 120000);
      if (!s || s.floorPrice == null) throw Object.assign(new Error('empty'), { code: 404 });
      let name = (x.r && x.r.name) || x.name || x.c, image = x.r && x.r.image, imgOk = x.r ? x.r.img_ok : null;
      if (!image || !x.r || imgOk !== true) { const p = await pictureFor(x.c, x.img); image = p.image; imgOk = p.ok; if (p.name) name = L.clean(p.name, 64); }
      await L.q(`INSERT INTO nfa_colls (symbol, name, image, floor, listed, avg24, vol7, ok, img_ok, img_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8,now(),now())
        ON CONFLICT (symbol) DO UPDATE SET name=EXCLUDED.name, image=EXCLUDED.image, floor=EXCLUDED.floor, listed=EXCLUDED.listed, avg24=EXCLUDED.avg24, vol7=EXCLUDED.vol7, ok=true, img_ok=EXCLUDED.img_ok, img_at=now(), updated_at=now()`,
        [x.c, name, image, lam(s.floorPrice), s.listedCount ?? null, lam(s.avgPrice24hr), lam(s.volume7d), imgOk]);
    } catch (e) {
      if (e.code === 404) await L.q(`INSERT INTO nfa_colls (symbol, ok, updated_at) VALUES ($1,false,now()) ON CONFLICT (symbol) DO UPDATE SET ok=false, updated_at=now()`, [x.c]).catch(() => {});
    }
  });
  const fresh = await L.q('SELECT * FROM nfa_colls WHERE ok AND floor IS NOT NULL AND image IS NOT NULL AND img_ok IS NOT FALSE');
  const keep = new Set(WATCH.map(w => w[0]));
  return fresh.filter(r => keep.has(r.symbol)).map(rowOut).sort((a, b) => (b.vol7 || 0) - (a.vol7 || 0));
}
async function boardMem() {
  return L.remember('watch', 600000, async () => {
    const out = WATCH.slice(0, 24).map(([c, name, image]) => ({ c, name, image, floor: null, listed: null, avg24: null, vol7: null }));
    await L.pool(out, 2, async o => { try { const s = await me(`/collections/${o.c}/stats`, 300000); Object.assign(o, { floor: lam(s.floorPrice), listed: s.listedCount ?? null, avg24: lam(s.avgPrice24hr), vol7: lam(s.volume7d) }); } catch {} });
    return out.filter(o => o.floor != null).sort((a, b) => (b.vol7 || 0) - (a.vol7 || 0));
  });
}

module.exports = async (req, res) => {
  const qy = L.query(req), op = String(qy.op || ''), c = String(qy.c || '').trim().toLowerCase();
  if (L.limited('me:' + L.ip(req), 90, 60000)) return L.send(res, 200, { ok: false, error: 'Too many requests. Wait a minute.' });
  try {
    if (op === 'popular') {
      // Magic Eden's trending endpoint went quiet, so the board is a long watchlist of Solana collections, each read
      // live and sorted by seven-day volume. With the database, ten are refreshed per call and the rest come from the last read.
      const list = L.dbReady() ? await boardDb() : await boardMem();
      if (!list.length) throw new Error('Magic Eden didn’t answer.');
      return L.send(res, 200, { ok: true, at: Date.now(), basis: 'watchlist · 7-day volume', list }, L.CACHE(90));
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
