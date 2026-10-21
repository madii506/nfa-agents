// nfa pixel characters: original 12x12 faces drawn from a seed. Used for the coin image generator, the market's
// placeholders and the hall's decor. Same seed, same face.
export function rng(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export function hashSeed(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

const GROUND = ['#e9e4ff', '#dcf2e3', '#ffe7d4', '#dfeafc', '#f4efd8', '#fde0e4', '#e0f3f6', '#efe6da', '#d9dde6', '#ffe9b8'];
const SKIN = ['#f3e7d7', '#f0c8a3', '#c98d5e', '#8a5a3c', '#b9dcff', '#c6eeb0', '#e6e6e6', '#ffd1dc'];
const HAT = ['#111111', '#2554ff', '#ff6b3d', '#2fb36b', '#8f5cff', '#ff4fa3', '#f2f2f2', '#1fb8c9'];
const SHIRT = ['#2554ff', '#111111', '#ff6b3d', '#2fb36b', '#8f5cff', '#f2c94c', '#5d5d5d', '#e04848'];
const HAIR = ['#2a1f1a', '#6b4226', '#d9b26b', '#111111', '#b8432f', '#7a7a7a'];

// traits are returned too, so a picture can be described in words
export function draw(ctx, seed, opt = {}) {
  const r = rng(seed), pick = a => a[Math.floor(r() * a.length)];
  const p = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); };
  const t = { ground: pick(GROUND), skin: pick(SKIN), shirt: pick(SHIRT), hatc: pick(HAT), hair: pick(HAIR) };
  t.hat = opt.crown ? 'crown' : pick(['cap', 'cap', 'beanie', 'band', 'hair', 'hair', 'none', 'halo']);
  t.eyes = opt.crown ? 'tall' : pick(['tall', 'tall', 'tall', 'shades', 'dot', 'tall', 'laser']);
  t.mouth = pick(['smile', 'smile', 'flat', 'open']);
  p(0, 0, 12, 12, opt.ground || t.ground);
  p(3, 10, 6, 2, t.shirt); p(2, 11, 8, 1, t.shirt);
  p(3, 4, 6, 6, t.skin); p(2, 5, 1, 4, t.skin); p(9, 5, 1, 4, t.skin);
  if (t.hat === 'cap') { p(3, 2, 6, 2, t.hatc); p(2, 3, 9, 1, t.hatc); }
  if (t.hat === 'beanie') { p(3, 2, 6, 2, t.hatc); p(2, 3, 8, 1, t.hatc); p(5, 1, 2, 1, t.hatc); }
  if (t.hat === 'band') { p(3, 3, 6, 1, t.hair); p(3, 4, 6, 1, t.hatc); p(2, 4, 1, 1, t.hatc); }
  if (t.hat === 'hair') { p(3, 3, 6, 1, t.hair); p(3, 4, 3, 1, t.hair); p(2, 4, 1, 2, t.hair); }
  if (t.hat === 'halo') { p(3, 1, 6, 1, '#f5c542'); p(3, 3, 6, 1, t.hair); }
  if (t.hat === 'crown') { const g = '#f5c542', d = '#d69e1f'; p(3, 3, 6, 1, g); p(3, 2, 1, 1, g); p(5, 1, 2, 2, g); p(8, 2, 1, 1, g); p(5, 3, 2, 1, '#e0245e'); p(3, 3, 1, 1, d); p(8, 3, 1, 1, d); }
  if (t.eyes === 'tall') { p(4, 5, 1, 2, '#111'); p(7, 5, 1, 2, '#111'); }
  if (t.eyes === 'dot') { p(4, 6, 1, 1, '#111'); p(7, 6, 1, 1, '#111'); }
  if (t.eyes === 'shades') { p(3, 5, 6, 1, '#111'); p(3, 6, 2, 1, '#111'); p(7, 6, 2, 1, '#111'); }
  if (t.eyes === 'laser') { p(4, 5, 1, 2, '#ff2b2b'); p(7, 5, 1, 2, '#ff2b2b'); p(8, 6, 4, 1, 'rgba(255,43,43,.55)'); }
  if (t.mouth === 'smile') p(5, 8, 2, 1, '#ff8a5c');
  if (t.mouth === 'flat') p(5, 8, 2, 1, '#3a2a22');
  if (t.mouth === 'open') { p(5, 8, 2, 1, '#3a2a22'); p(5, 9, 2, 1, '#3a2a22'); }
  return t;
}

// a canvas of one face at an integer scale (hard edges)
export function canvas(seed, scale = 8, opt) {
  const c = document.createElement('canvas'); c.width = c.height = 12 * scale;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  const s = document.createElement('canvas'); s.width = s.height = 12; const traits = draw(s.getContext('2d'), seed, opt);
  g.drawImage(s, 0, 0, 12 * scale, 12 * scale); c.traits = traits; return c;
}
