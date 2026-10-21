// nfa's shared server code. Every upstream call has a timeout and an honest failure message.
// Upstreams: Magic Eden's public API, Solana RPC. Nothing here holds a key: there is no wallet on this server.
// Each coin's agent vault is an address derived from the studio's PUBLIC address and the coin's mint, which only the
// studio's own wallet can sign for.
const crypto = require('crypto');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const RPCS = (process.env.RPC_URLS || 'https://solana-rpc.publicnode.com,https://api.mainnet-beta.solana.com').split(',').map(s => s.trim()).filter(Boolean);
const MOCK = process.env.NI_MOCK ? require(process.env.NI_MOCK) : null;   // dev only: canned upstreams

function send(res, code, obj, cache = 'no-store') {
  res.statusCode = code; res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (/s-maxage/.test(cache)) { res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate'); res.setHeader('CDN-Cache-Control', cache.replace(/max-age=0,\s*/, '')); }
  else res.setHeader('Cache-Control', cache);
  res.end(JSON.stringify(obj));
}
const CACHE = (s, swr = s * 10) => `public, max-age=0, s-maxage=${s}, stale-while-revalidate=${swr}`;
function query(req) { if (req.query) return req.query; return Object.fromEntries(new URL(req.url, 'http://x').searchParams); }
async function body(req, max = 64 * 1024) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') { if (req.body.length > max) return { tooBig: true }; try { return JSON.parse(req.body); } catch { return {}; } }
  const chunks = []; let n = 0; for await (const c of req) { chunks.push(c); n += c.length; if (n > max) return { tooBig: true }; }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { return {}; }
}
function ip(req) { return String(req.headers['x-forwarded-for'] || (req.socket && req.socket.remoteAddress) || '?').split(',')[0].trim(); }
const hits = new Map();
function limited(key, n, ms) { const now = Date.now(), a = (hits.get(key) || []).filter(t => now - t < ms); a.push(now); hits.set(key, a); if (hits.size > 5000) hits.delete(hits.keys().next().value); return a.length > n; }

async function getJson(url, opt = {}, ms = 9000) {
  if (MOCK) return MOCK.fetch(url, opt);
  const r = await fetch(url, { ...opt, headers: { 'user-agent': UA, accept: 'application/json', ...(opt.headers || {}) }, signal: AbortSignal.timeout(ms) });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {}
  return { status: r.status, ok: r.ok, json: j, text: t };
}
async function rpcRaw(method, params, ms = 12000) {
  let last;
  for (const u of RPCS) {
    try {
      const r = await getJson(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }, ms);
      if (r.json && (r.json.result !== undefined || (r.json.error && (method === 'sendTransaction' || method === 'simulateTransaction')))) return r.json;
      last = new Error((r.json && r.json.error && r.json.error.message) || 'rpc ' + r.status);
    } catch (e) { last = e; }
  }
  throw last || new Error('rpc failed');
}
async function rpc(method, params, ms) { const j = await rpcRaw(method, params, ms); if (j.error) throw new Error(j.error.message || 'rpc error'); return j.result; }
async function pool(items, n, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; try { await fn(items[k], k); } catch {} } })); }
const memo = new Map();
async function remember(key, ms, fn) {
  const m = memo.get(key); if (m && m.v !== undefined && Date.now() - m.at < ms) return m.v;
  if (m && m.p) return m.p;
  const p = fn().then(v => { memo.set(key, { at: Date.now(), v }); if (memo.size > 800) memo.delete(memo.keys().next().value); return v; })
    .catch(e => { if (m && m.v !== undefined) { memo.set(key, { at: m.at, v: m.v }); return m.v; } memo.delete(key); throw e; });
  memo.set(key, { ...(m || { at: 0 }), p }); return p;
}

// ---------- Solana bits without @solana/web3.js: base58, program-derived addresses ----------
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58enc(buf) {
  let n = 0n; for (const b of buf) n = n * 256n + BigInt(b);
  let s = ''; while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
  for (const b of buf) { if (b === 0) s = '1' + s; else break; }
  return s;
}
function b58dec(str) {
  let n = 0n; for (const c of str) { const i = B58.indexOf(c); if (i < 0) throw new Error('bad base58'); n = n * 58n + BigInt(i); }
  const out = []; while (n > 0n) { out.unshift(Number(n % 256n)); n /= 256n; }
  for (const c of str) { if (c === '1') out.unshift(0); else break; }
  return Buffer.from(out);
}
const P25519 = (1n << 255n) - 19n;
const modp = a => ((a % P25519) + P25519) % P25519;
function powp(b, e) { let r = 1n; b = modp(b); while (e > 0n) { if (e & 1n) r = r * b % P25519; b = b * b % P25519; e >>= 1n; } return r; }
const D25519 = modp(-121665n * powp(121666n, P25519 - 2n));
const SQRTM1 = powp(2n, (P25519 - 1n) / 4n);
function onCurve(bytes) {
  const b = Buffer.from(bytes); b[31] &= 0x7f;
  let y = 0n; for (let i = 31; i >= 0; i--) y = (y << 8n) + BigInt(b[i]);
  if (y >= P25519) return false;
  const y2 = y * y % P25519, u = modp(y2 - 1n), v = modp(D25519 * y2 + 1n);
  const x2 = u * powp(v, P25519 - 2n) % P25519;
  if (x2 === 0n) return true;
  let x = powp(x2, (P25519 + 3n) / 8n);
  if (x * x % P25519 === x2) return true;
  x = x * SQRTM1 % P25519;
  return x * x % P25519 === x2;
}
function pda(seeds, programId) {
  const prog = b58dec(programId);
  for (let bump = 255; bump >= 0; bump--) {
    const h = crypto.createHash('sha256');
    for (const sd of seeds) h.update(Buffer.from(sd));
    h.update(Buffer.from([bump])); h.update(prog); h.update(Buffer.from('ProgramDerivedAddress'));
    const k = h.digest(); if (!onCurve(k)) return b58enc(k);
  }
  throw new Error('no pda');
}
const isAddr = s => typeof s === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);

// ---------- the agent vaults: one per coin, derived from the studio's public address ----------
const SYSTEM = '11111111111111111111111111111111';
// the nfa studio's public address (no key here): the 20% treasury, and the base each coin's agent vault is derived from
const STUDIO = (process.env.STUDIO_WALLET ?? '7GSpXajPvqKqepNG8wYNdEaWzHuV1wdK1NBH26vAf6fm').trim();
const TREASURY = (process.env.TREASURY_WALLET || '').trim() || STUDIO;
const PREFUND = 0.001;                        // SOL the launcher puts in, so the vault exists before fees arrive
function seedAddress(base, seed, owner = SYSTEM) {   // = web3.PublicKey.createWithSeed(base, seed, owner)
  return b58enc(crypto.createHash('sha256').update(b58dec(base)).update(Buffer.from(seed)).update(b58dec(owner)).digest());
}
const vaultOfCoin = mint => seedAddress(STUDIO, String(mint).slice(0, 32));
const SPLIT = { vault: 8000, treasury: 2000 };
const sharesFor = mint => [{ address: vaultOfCoin(mint), bps: SPLIT.vault }, { address: TREASURY, bps: SPLIT.treasury }];

// ---------- pump.fun addresses (computed here so reading the chain needs no SDK) ----------
const PUMP = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P', PUMP_FEES = 'pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ';
const bondingCurveOf = mint => pda([Buffer.from('bonding-curve'), b58dec(mint)], PUMP);
const sharingConfigOf = mint => pda([Buffer.from('sharing-config'), b58dec(mint)], PUMP_FEES);
const creatorVaultOf = mint => pda([Buffer.from('creator-vault'), b58dec(sharingConfigOf(mint))], PUMP);
async function accounts(addrs) {             // raw accounts in order, null where none exists
  const out = [];
  for (let i = 0; i < addrs.length; i += 100) {
    const r = await rpc('getMultipleAccounts', [addrs.slice(i, i + 100), { encoding: 'base64', commitment: 'confirmed' }]);
    for (const a of r.value) out.push(a ? { data: Buffer.from(a.data[0], 'base64'), lamports: a.lamports, owner: a.owner } : null);
  }
  return out;
}
const RPC_URL = () => RPCS[0];

// ---------- the database: Postgres (Neon on Vercel; PGlite in local dev) ----------
let pg = null, made = null;
async function q(text, params = []) {
  if (process.env.NI_PGLITE) {
    if (!pg) { const { PGlite } = require('@electric-sql/pglite'); pg = new PGlite(process.env.NI_PGLITE); }
    return (await pg.query(text, params)).rows;
  }
  if (!pg) { const { neon } = require('@neondatabase/serverless'); pg = neon(dbUrl()); }
  return pg.query(text, params);
}
function dbUrl() { const e = process.env; return e.DATABASE_URL || e.POSTGRES_URL || e.STORAGE_URL || e.STORAGE_DATABASE_URL || e.DATABASE_POSTGRES_URL || ''; }
const dbReady = () => !!(process.env.NI_PGLITE || dbUrl());
function ready() {
  if (!made) made = (async () => {
    for (const st of [
      `CREATE TABLE IF NOT EXISTS nfa_coins (mint text PRIMARY KEY, name text NOT NULL, symbol text NOT NULL, description text,
        collection text NOT NULL, coll_name text, coll_image text, policy text NOT NULL, payer text NOT NULL, vault text NOT NULL, treasury text NOT NULL,
        image text, image_type text, status text NOT NULL DEFAULT 'pending', created_at timestamptz NOT NULL DEFAULT now(), live_at timestamptz, sig text)`,
      `CREATE INDEX IF NOT EXISTS nfa_coins_live ON nfa_coins(status, live_at DESC)`,
      `CREATE TABLE IF NOT EXISTS nfa_receipts (id bigserial PRIMARY KEY, mint text NOT NULL, kind text NOT NULL, nft_mint text, nft_name text, nft_image text,
        price_sol float8, tx text, to_wallet text, note text, at timestamptz NOT NULL DEFAULT now())`,
      `CREATE INDEX IF NOT EXISTS nfa_receipts_mint ON nfa_receipts(mint, id DESC)`,
      `ALTER TABLE nfa_coins ADD COLUMN IF NOT EXISTS twitter text`,
      `ALTER TABLE nfa_coins ADD COLUMN IF NOT EXISTS telegram text`,
      `ALTER TABLE nfa_coins ADD COLUMN IF NOT EXISTS website text`,
    ]) { try { await q(st); } catch (e) { if (!/already exists|duplicate key/i.test(String(e && e.message))) throw e; } }
  })().catch(e => { made = null; console.error('nfa db setup', e && e.message); throw e; });
  return made;
}

const BANNED = /\b(guarantee[ds]?|100x|1000x|risk[- ]free|cant lose|can't lose)\b/i;
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
function origin(req) { const h = req.headers['x-forwarded-host'] || req.headers.host || 'localhost'; const proto = req.headers['x-forwarded-proto'] || (/^localhost|^127\./.test(h) ? 'http' : 'https'); return proto + '://' + h; }

module.exports = {
  UA, MOCK, send, CACHE, query, body, ip, limited, getJson, rpc, rpcRaw, pool, remember, b58enc, b58dec, pda, isAddr,
  SYSTEM, STUDIO, TREASURY, PREFUND, SPLIT, seedAddress, vaultOfCoin, sharesFor, PUMP, PUMP_FEES, bondingCurveOf, sharingConfigOf, creatorVaultOf,
  accounts, RPC_URL, q, ready, dbReady, BANNED, clean, origin,
};
