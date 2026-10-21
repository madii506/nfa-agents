// nfa: the way in. A white server hall: long rows of agent racks, black details, soft daylight from the ceiling and
// a polished floor. The agent, a small white cube wearing the nfa face, leads the camera down the aisle, checks two
// racks on the way and parks beside the operator console. The console boots; click it and the camera dives in.
import * as THREE from '../vendor/three.module.min.js';
import { RoundedBoxGeometry } from '../vendor/RoundedBoxGeometry.js';
import { Reflector } from '../vendor/Reflector.js';

let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp01 = k => Math.max(0, Math.min(1, k));
const ease = k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
const easeIn = k => k * k * k;
const sine = k => .5 - Math.cos(Math.PI * k) / 2;
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const FONT = 'JBM, ui-monospace, monospace';
const C = { ink: '#16181b', dim: '#8a8e95', mid: '#4b4f55', white: '#ffffff', black: '#0b0c0e' };

// the hall, in metres
const AISLE = 1.55;                    // rack fronts stand on x = ±AISLE
const RW = .62, RH = 2.2, RD = 1.05;   // rack width (along the aisle), height, depth
const Z0 = 3.2, Z1 = -33.4;            // the first and last rack
const GAPS = [[-9.0, -11.3], [-21.2, -23.5]];
const ROWX = r => AISLE + RD / 2 + r * (RD + 1.25);
const MON = V(0, 1.33, -40.62);        // the console's centre screen
const PERCH = V(1.34, 1.74, -40.05);   // where the agent parks
const SCANS = [{ side: -1, z: -14.25, t0: 3.4, t1: 4.9 }, { side: 1, z: -26.6, t0: 6.3, t1: 7.7 }];

function tex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
// the nfa mark: four rounded corner brackets and two tall eyes
function mark(g, x, y, s, col, o = {}) {
  const sw = s * .095, L = s * .3, r = s * .09, p = sw / 2, q = s - sw / 2;
  g.save(); g.translate(x, y); g.strokeStyle = col; g.lineWidth = sw; g.lineCap = 'round'; g.lineJoin = 'round';
  const k = (cx, cy, dx, dy) => { g.beginPath(); g.moveTo(cx + dx * L, cy); g.lineTo(cx + dx * r, cy); g.quadraticCurveTo(cx, cy, cx, cy + dy * r); g.lineTo(cx, cy + dy * L); g.stroke(); };
  if (o.brackets !== false) { k(p, p, 1, 1); k(q, p, -1, 1); k(p, q, 1, -1); k(q, q, -1, -1); }
  if (o.eyes !== false) {
    const blink = o.blink || 0, look = (o.look || 0) * s * .05, h = s * .26 * (1 - blink * .86), y0 = s * .36 + (s * .26 - h) / 2;
    g.fillStyle = col;
    for (const ex of [.33, .56]) { const w = s * .11, rx = Math.min(w / 2, h / 2); g.beginPath(); g.roundRect(s * ex + look, y0, w, Math.max(2, h), rx); g.fill(); }
  }
  g.restore();
}

// ---------------------------------------------------------------- the console screen: a white terminal drawn into a texture
class Screen {
  constructor() {
    this.W = 1024; this.H = 594;
    this.c = document.createElement('canvas'); this.c.width = this.W; this.c.height = this.H; this.g = this.c.getContext('2d');
    this.t = new THREE.CanvasTexture(this.c); this.t.colorSpace = THREE.SRGBColorSpace; this.t.anisotropy = 8;
    this.lines = []; this.power = 0; this.off = true; this.prompt = false; this.logo = 0; this.dive = 0; this.dirty = true; this.blink = true; this.LH = 30; this.X = 46; this.Y = 40;
  }
  push(runs) { this.lines.push(runs); while (this.lines.length > 15) this.lines.shift(); this.dirty = true; return this.lines.length - 1; }
  set(i, runs) { this.lines[i] = runs; this.dirty = true; }
  draw(now) {
    const blink = Math.floor(now / 530) % 2 === 0;
    if (!this.dirty && blink === this.blink && !(this.power > 0 && this.power < 1) && !(this.logo > 0 && this.logo < 1) && !this.dive) return;
    this.blink = blink; this.dirty = false;
    const g = this.g, W = this.W, H = this.H;
    if (this.off) { g.fillStyle = '#1a1c20'; g.fillRect(0, 0, W, H); this.t.needsUpdate = true; return; }
    if (this.power < 1) {                       // power on: white spreads out from a line
      const k = this.power; g.fillStyle = '#1a1c20'; g.fillRect(0, 0, W, H);
      const hh = Math.max(2, H * Math.max(0, (k - .35) / .65)), ww = W * Math.min(1, k / .35);
      g.fillStyle = '#ffffff'; g.fillRect(W / 2 - ww / 2, H / 2 - hh / 2, ww, hh); this.t.needsUpdate = true; return;
    }
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
    g.textBaseline = 'top'; g.font = `500 ${this.LH - 8}px ${FONT}`;
    let y = this.Y;
    const run = (runs, x0, yy) => { let x = x0; for (const [s, c] of runs) { g.fillStyle = c || C.ink; g.fillText(s, x, yy); x += g.measureText(s).width; } return x; };
    if (this.logo > 0) {
      const s = 128, k = Math.min(1, this.logo);
      g.globalAlpha = k; mark(g, this.X, y + 4, s, C.black, { blink: this.eye || 0, look: this.lookv || 0 });
      g.font = `800 64px ${FONT}`; g.fillStyle = C.black; g.fillText('nfa.', this.X + s + 34, y + 18);
      g.font = `500 22px ${FONT}`; g.fillStyle = C.dim; g.fillText('non-fungible agents', this.X + s + 38, y + 92); g.globalAlpha = 1;
      g.font = `500 ${this.LH - 8}px ${FONT}`; y += s + 30;
    }
    for (const ln of this.lines) { run(ln, this.X, y); y += this.LH; }
    if (this.prompt) { const x = run([['nfa ~ $ ', C.mid], [this.input || '', C.black]], this.X, y); if (blink) { g.fillStyle = C.black; g.fillRect(x + 2, y + 3, 12, this.LH - 8); } }
    if (this.dive > 0) {                        // the viewfinder opens outward as the camera falls in
      const k = this.dive, s = 120 + k * k * W * 1.6;
      mark(g, W / 2 - s / 2, H / 2 - s / 2, s, C.black, { eyes: k < .55 });
      if (k > .72) { g.fillStyle = `rgba(255,255,255,${(k - .72) / .28})`; g.fillRect(0, 0, W, H); }
    }
    this.t.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- the hall
function build(scene, mobile) {
  const std = o => new THREE.MeshStandardMaterial(o);
  const add = (geo, mat, x = 0, y = 0, z = 0, parent = scene, shadow = false) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (shadow && !mobile) m.castShadow = true; parent.add(m); return m; };
  const dummy = new THREE.Object3D();

  // racks: where they stand
  const racks = [];
  for (let z = Z0; z >= Z1; z -= RW + .02) {
    if (GAPS.some(([a, b]) => z < a && z > b)) continue;
    for (const side of [-1, 1]) for (let row = 0; row < 3; row++) racks.push({ side, row, z, x: side * ROWX(row), face: side * (AISLE + row * (RD + 1.25)) });
  }
  const main = racks.filter(r => r.row === 0);
  main.forEach(r => { const list = main.filter(q => q.side === r.side); r.id = (r.side < 0 ? 'A-' : 'B-') + String(list.indexOf(r) + 1).padStart(2, '0'); });

  // doors: white perforated steel over a stack of servers, three layouts so the rows don't repeat
  const doorTex = v => tex(256, 920, (g, w, h) => {
    g.fillStyle = '#eef0f2'; g.fillRect(0, 0, w, h);
    let y = 34; seed = 13 + v * 29;
    while (y < h - 44) {
      const u = [1, 1, 2, 2, 2, 4][Math.floor(rnd() * 6)] * 20;
      if (rnd() < .12 + v * .04) { y += u; continue; }               // an empty slot
      g.fillStyle = rnd() < .5 ? '#e1e4e8' : '#dcdfe4'; g.fillRect(14, y + 1, w - 28, u - 2);
      g.fillStyle = '#cdd1d7'; for (let x = 22; x < w - 60; x += 14) g.fillRect(x, y + 4, 9, u - 8);   // drive bays
      g.fillStyle = '#c4c8cf'; g.fillRect(w - 52, y + 4, 30, u - 8); g.fillStyle = '#f7f8f9'; g.fillRect(14, y + 1, w - 28, 1.5);
      y += u;
    }
    g.fillStyle = 'rgba(120,126,136,.22)'; for (let yy = 0; yy < h; yy += 5) for (let xx = (yy / 5) % 2 ? 2 : 5; xx < w; xx += 6) g.fillRect(xx, yy, 2.2, 2.2);   // the mesh
    g.strokeStyle = '#f9fafb'; g.lineWidth = 12; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = '#16181b'; g.fillRect(w - 25, h * .42, 7, h * .16);                                       // a black handle
    g.fillStyle = '#16181b'; g.fillRect(16, 14, 40, 4);
  });
  const doorMats = [0, 1, 2].map(v => std({ map: doorTex(v), roughness: .55, metalness: .05 }));
  const body = new THREE.InstancedMesh(new THREE.BoxGeometry(RD, RH, RW), std({ color: 0xeceef1, roughness: .5, metalness: .05 }), racks.length);
  racks.forEach((r, i) => { dummy.position.set(r.x, RH / 2, r.z); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); body.setMatrixAt(i, dummy.matrix); });
  body.castShadow = !mobile; body.receiveShadow = !mobile; scene.add(body);
  const doorGeo = new THREE.PlaneGeometry(RW - .05, RH - .07);
  const doorsBy = [[], [], []]; racks.forEach((r, i) => doorsBy[i % 3].push(r));
  doorsBy.forEach((list, v) => {
    const m = new THREE.InstancedMesh(doorGeo, doorMats[v], list.length);
    list.forEach((r, i) => { dummy.position.set(r.face - r.side * .004, RH / 2, r.z); dummy.rotation.set(0, -r.side * Math.PI / 2, 0); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); });
    m.receiveShadow = !mobile; scene.add(m);
  });
  // plinths: a black kick strip along the base of every rack row
  for (const side of [-1, 1]) for (let row = 0; row < 3; row++) {
    const segs = [[Z0 + .31, GAPS[0][0]], [GAPS[0][1], GAPS[1][0]], [GAPS[1][1], Z1 - .31]];
    for (const [a, b] of segs) add(new THREE.BoxGeometry(.01, .07, a - b), new THREE.MeshBasicMaterial({ color: 0x16181b }), side * (AISLE + row * (RD + 1.25)) - side * .003, .035, (a + b) / 2);
  }

  // status lights: small black dots that blink against the white doors
  const leds = [];
  racks.forEach((r, ri) => {
    const p = r.row === 0 ? .78 : r.row === 1 ? .4 : .14, y0 = .2 + rnd() * .06;
    const put = (y, u, kind) => leds.push({ x: r.face - r.side * .009, y, z: r.z + u, kind, ph: rnd() * 10, sp: .4 + rnd() * 2.2, rack: ri });
    for (let k = 0; k < 21; k++) {
      if (rnd() > p) continue;
      const y = y0 + k * .088 + (rnd() - .5) * .016;
      put(y, .205, rnd() < .55 ? 0 : 1);
      if (r.row === 0 && rnd() < .55) put(y, .18, 2);
    }
  });
  const ledMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(.012, .01, .02), new THREE.MeshBasicMaterial({ toneMapped: false }), leds.length);
  leds.forEach((l, i) => { dummy.position.set(l.x, l.y, l.z); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); ledMesh.setMatrixAt(i, dummy.matrix); ledMesh.setColorAt(i, new THREE.Color(.1, .1, .1)); });
  scene.add(ledMesh);
  // a black strip down the edge of every main-row door
  const strips = new THREE.InstancedMesh(new THREE.BoxGeometry(.006, RH - .24, .01), new THREE.MeshBasicMaterial({ color: 0x16181b }), main.length);
  main.forEach((r, i) => { dummy.position.set(r.face - r.side * .006, RH / 2, r.z - RW / 2 + .035); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); strips.setMatrixAt(i, dummy.matrix); });
  scene.add(strips);

  // rack labels on the main rows
  const labels = new Map();
  main.forEach(r => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 40; const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const m = add(new THREE.PlaneGeometry(.5, .078), new THREE.MeshBasicMaterial({ map: t, transparent: true }), r.face - r.side * .012, RH + .07, r.z);
    m.rotation.y = -r.side * Math.PI / 2; labels.set(r.id, { c, t, r, text: null });
  });
  const label = (id, text, hot) => {
    const L = labels.get(id); if (!L || L.text === text + hot) return; L.text = text + hot;
    const g = L.c.getContext('2d'); g.clearRect(0, 0, 256, 40); g.fillStyle = hot ? '#111214' : '#ffffff'; g.fillRect(0, 4, 256, 32);
    if (!hot) { g.strokeStyle = '#d5d8dd'; g.lineWidth = 2; g.strokeRect(1, 5, 254, 30); }
    g.font = `600 22px ${FONT}`; g.textBaseline = 'middle'; g.fillStyle = hot ? '#ffffff' : '#55595f'; g.fillText(text, 12, 21); L.t.needsUpdate = true;
  };
  main.forEach(r => label(r.id, r.id + '  ·  open', false));

  // the floor: polished white tiles over a faint mirror
  let mirror = null;
  if (!mobile) {
    mirror = new Reflector(new THREE.PlaneGeometry(22, 64), { clipBias: .003, textureWidth: Math.min(1400, innerWidth) * .6, textureHeight: Math.min(900, innerHeight) * .6, color: 0xb9bcc2 });
    mirror.rotation.x = -Math.PI / 2; mirror.position.set(0, -.001, -18); scene.add(mirror);
  }
  const tile = tex(512, 512, (g, w, h) => {
    g.fillStyle = '#f3f4f6'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) { const x = (i % 2) * 256, y = (i >> 1) * 256, v = 240 + rnd() * 6; g.fillStyle = `rgb(${v},${v + 1},${v + 3})`; g.fillRect(x + 2, y + 2, 252, 252); }
    g.fillStyle = '#dcdfe3'; g.fillRect(0, 0, w, 2); g.fillRect(0, 256, w, 2); g.fillRect(0, 0, 2, h); g.fillRect(256, 0, 2, h);
  }, [22 / 1.2, 64 / 1.2]);
  const floor = add(new THREE.PlaneGeometry(22, 64), std({ map: tile, roughness: .35, metalness: .0, transparent: !mobile, opacity: mobile ? 1 : .9 }), 0, 0, -18);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = !mobile;
  const vent = tex(256, 256, (g, w, h) => { g.fillStyle = '#e9ebee'; g.fillRect(0, 0, w, h); g.fillStyle = '#c9cdd3'; for (let y = 12; y < h; y += 12) for (let x = 12; x < w; x += 12) { g.beginPath(); g.arc(x, y, 2.8, 0, 7); g.fill(); } g.fillStyle = '#d8dbe0'; g.fillRect(0, 0, w, 2); g.fillRect(0, 0, 2, h); }, [2, 62 / .6]);
  const ventM = add(new THREE.PlaneGeometry(1.2, 62), std({ map: vent, roughness: .6, metalness: .05 }), 0, .003, -17);
  ventM.rotation.x = -Math.PI / 2; ventM.receiveShadow = !mobile;
  // soft contact shadow where the racks meet the floor
  const ao = tex(64, 64, (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, 'rgba(40,44,52,.32)'); gr.addColorStop(1, 'rgba(40,44,52,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  for (const side of [-1, 1]) for (let row = 0; row < 3; row++) {
    const m = add(new THREE.PlaneGeometry(.55, Z0 - Z1 + 1), new THREE.MeshBasicMaterial({ map: ao, transparent: true, depthWrite: false }), side * (AISLE + row * (RD + 1.25)) - side * .275, .006, (Z0 + Z1) / 2);
    m.rotation.x = -Math.PI / 2; if (side > 0) m.rotation.z = Math.PI;
  }

  // walls, ceiling, columns
  const wallM = std({ color: 0xe9ebee, roughness: .9 });
  add(new THREE.PlaneGeometry(64, 8), wallM, -9.4, 4, -18).rotation.y = Math.PI / 2;
  add(new THREE.PlaneGeometry(64, 8), wallM, 9.4, 4, -18).rotation.y = -Math.PI / 2;
  add(new THREE.PlaneGeometry(22, 8), wallM, 0, 4, -46.4);
  const ceil = add(new THREE.PlaneGeometry(22, 64), std({ color: 0xf4f5f7, roughness: 1, emissive: 0x9a9ea5 }), 0, 5.4, -18); ceil.rotation.x = Math.PI / 2;
  const concrete = std({ color: 0xf2f3f5, roughness: .8 });
  for (const [a, b] of GAPS) for (const s of [-1, 1]) add(new THREE.BoxGeometry(.55, 5.4, .55), concrete, s * (AISLE + RD + .62), 2.7, (a + b) / 2, scene, true);

  // overhead: white cable trays over every row, light panels over the aisle
  const steel = std({ color: 0xdadde2, roughness: .45, metalness: .2, emissive: 0x2a2c30 });
  const len = Z0 - Z1 + 1.2, zc = (Z0 + Z1) / 2;
  const rungs = new THREE.InstancedMesh(new THREE.BoxGeometry(.6, .02, .03), steel, 6 * Math.ceil(len / .34));
  let ri = 0;
  for (const side of [-1, 1]) for (let row = 0; row < 3; row++) {
    const x = side * ROWX(row);
    for (const dx of [-.3, .3]) add(new THREE.BoxGeometry(.025, .07, len), steel, x + dx, 2.62, zc);
    for (let z = Z0 + .4; z > Z1 - .6; z -= .34) { dummy.position.set(x, 2.59, z); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); rungs.setMatrixAt(ri++, dummy.matrix); }
    [[0x16181b, -.14, .045], [0xb7bcc4, .02, .04], [0x8d939c, .16, .055]].forEach(([c, dx, rad]) => { const cy = add(new THREE.CylinderGeometry(rad, rad, len, 10), std({ color: c, roughness: .6 }), x + dx, 2.64 + rad, zc); cy.rotation.x = Math.PI / 2; });
  }
  rungs.count = ri; scene.add(rungs);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  for (let z = -1.5; z > -37; z -= 3.6) { add(new THREE.BoxGeometry(.5, .05, 2.6), steel, 0, 3.84, z); add(new THREE.BoxGeometry(.42, .012, 2.5), lampMat, 0, 3.81, z); }
  for (const s of [-1, 1]) for (let z = -1; z > -36; z -= 5) { add(new THREE.BoxGeometry(.36, .04, 2.2), steel, s * ROWX(1), 4.22, z); add(new THREE.BoxGeometry(.3, .01, 2.1), lampMat, s * ROWX(1), 4.195, z); }

  // hanging signs over the cross aisles
  const sign = (text, sub, z) => {
    const t = tex(1024, 200, (g, w, h) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); g.strokeStyle = '#16181b'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
      mark(g, 34, 40, 120, '#0b0c0e'); g.textBaseline = 'middle'; g.font = `700 64px ${FONT}`; g.fillStyle = '#0b0c0e'; g.fillText(text, 196, 82); g.font = `500 34px ${FONT}`; g.fillStyle = '#6b6f75'; g.fillText(sub, 198, 146); });
    add(new THREE.PlaneGeometry(1.9, .37), new THREE.MeshBasicMaterial({ map: t }), 0, 3.25, z);
    for (const dx of [-.8, .8]) add(new THREE.BoxGeometry(.012, 1.6, .012), new THREE.MeshBasicMaterial({ color: 0x16181b }), dx, 4.25, z);
  };
  sign('HALL 01', 'agent racks A · B', (GAPS[0][0] + GAPS[0][1]) / 2);
  sign('CONSOLE', 'operator · 18 m ahead', (GAPS[1][0] + GAPS[1][1]) / 2);

  // the end of the hall: a white video wall with the agent's face, a white desk, three screens
  const wallC = document.createElement('canvas'); wallC.width = 2048; wallC.height = 640; const wallT = new THREE.CanvasTexture(wallC); wallT.colorSpace = THREE.SRGBColorSpace;
  add(new THREE.BoxGeometry(6.7, 2.25, .12), std({ color: 0x16181b, roughness: .5 }), 0, 2.78, -44.86);
  add(new THREE.PlaneGeometry(6.4, 2.0), new THREE.MeshBasicMaterial({ map: wallT, toneMapped: false }), 0, 2.78, -44.79);
  const desk = new THREE.Group(); desk.position.set(0, 0, -43.0); scene.add(desk);
  const deskMat = std({ color: 0xf4f5f7, roughness: .4, metalness: .02 }), topMat = std({ color: 0xffffff, roughness: .25, metalness: .02 });
  for (let i = -4; i <= 4; i++) {
    const a = i * .2, R = 2.75, seg = new THREE.Group(); seg.position.set(Math.sin(a) * R, 0, Math.cos(a) * R); seg.rotation.y = a; desk.add(seg);
    add(new THREE.BoxGeometry(.56, .74, .62), deskMat, 0, .37, 0, seg, true); add(new THREE.BoxGeometry(.57, .04, .72), topMat, 0, .76, -.04, seg, true);
    add(new THREE.BoxGeometry(.54, .006, .006), new THREE.MeshBasicMaterial({ color: 0x16181b }), 0, .62, .313, seg);
  }
  const screen = new Screen();
  const monitor = (w, h, x, y, z, ry, map) => {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; scene.add(g);
    add(new RoundedBoxGeometry(w + .06, h + .06, .04, 3, .012), std({ color: 0x16181b, roughness: .35, metalness: .3 }), 0, 0, -.022, g, true);
    add(new THREE.BoxGeometry(.05, y - .78, .05), std({ color: 0xdfe2e6, roughness: .4 }), 0, -(y - .78) / 2, -.07, g);
    return add(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map, toneMapped: false }), 0, 0, .0, g);
  };
  const side = v => tex(512, 300, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); g.strokeStyle = '#eceef1'; g.lineWidth = 1; for (let x = 0; x < w; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } for (let y = 0; y < h; y += 30) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.strokeStyle = '#16181b'; g.lineWidth = 3; g.beginPath(); let yy = h * .6; for (let x = 0; x <= w; x += 8) { yy += (rnd() - .5) * 22; yy = Math.max(40, Math.min(h - 30, yy)); x ? g.lineTo(x, yy) : g.moveTo(x, yy); } g.stroke();
    g.font = `500 18px ${FONT}`; g.fillStyle = '#8a8e95'; g.fillText(v ? 'vault watch' : 'market feed', 16, 26);
  });
  const monScreen = monitor(1.18, .686, MON.x, MON.y, MON.z, 0, screen.t);
  monitor(.84, .49, -1.36, 1.22, -40.95, .46, side(0));
  monitor(.84, .49, 1.36, 1.22, -40.95, -.46, side(1));
  add(new THREE.BoxGeometry(.5, .02, .17), std({ color: 0xe6e8eb, roughness: .5 }), 0, .79, -40.25);

  // the agent: a white cube wearing the mark, a thin black ring under it
  const faceC = document.createElement('canvas'); faceC.width = faceC.height = 256; const faceT = new THREE.CanvasTexture(faceC); faceT.colorSpace = THREE.SRGBColorSpace;
  const agent = new THREE.Group(); scene.add(agent);
  const shell = add(new RoundedBoxGeometry(.42, .42, .42, 5, .085), std({ color: 0xffffff, roughness: .38, metalness: .02 }), 0, 0, 0, agent, true);
  add(new THREE.PlaneGeometry(.33, .33), std({ map: faceT, transparent: true, roughness: .4 }), 0, 0, .2105, agent);
  const ring = add(new THREE.TorusGeometry(.12, .009, 8, 40), new THREE.MeshBasicMaterial({ color: 0x16181b }), 0, -.225, 0, agent); ring.rotation.x = Math.PI / 2;

  // scan lines: from the agent's face to the corners of a rack door
  const scanGeo = new THREE.BufferGeometry(); scanGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(16 * 3), 3));
  const scanMat = new THREE.LineBasicMaterial({ color: 0x0b0c0e, transparent: true, opacity: 0, depthWrite: false });
  const scanLines = new THREE.LineSegments(scanGeo, scanMat); scanLines.frustumCulled = false; scene.add(scanLines);

  // light: a bright white sky, a soft key from above that throws the racks' shadows across the aisle
  scene.add(new THREE.HemisphereLight(0xffffff, 0xcfd3d9, 2.1));
  const key = new THREE.DirectionalLight(0xffffff, 1.9); key.position.set(-6, 16, 4); key.target.position.set(0, 0, -16); scene.add(key, key.target);
  if (!mobile) {
    key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -.0006; key.shadow.normalBias = .03; key.shadow.radius = 5;
    Object.assign(key.shadow.camera, { left: -16, right: 16, top: 34, bottom: -34, near: 1, far: 50 }); key.shadow.camera.updateProjectionMatrix();
  }
  const fill = new THREE.DirectionalLight(0xf3f6ff, .7); fill.position.set(5, 6, 10); scene.add(fill);
  return { racks, main, leds, ledMesh, label, screen, monScreen, wallC, wallT, faceC, faceT, agent, ring, scanGeo, scanMat, mirror };
}

// ---------------------------------------------------------------- camera
function path(portrait) {
  const L = portrait ? [
    [V(0, 1.72, 10.5), V(0, 1.66, -40)], [V(.08, 1.72, 3), V(0, 1.6, -40)], [V(-.1, 1.72, -6), V(0, 1.55, -40)],
    [V(-.16, 1.7, -18), V(0, 1.5, -40)], [V(-.08, 1.7, -28), V(0, 1.5, -42)], [V(0, 1.7, -33.4), V(.2, 1.5, -42)]]
    : [
    [V(0, 1.72, 8.6), V(0, 1.66, -40)], [V(.15, 1.71, 2.2), V(0, 1.6, -40)], [V(-.15, 1.7, -8), V(0, 1.55, -40)],
    [V(-.22, 1.68, -18), V(0, 1.5, -40)], [V(-.12, 1.66, -28.5), V(0, 1.45, -42)], [V(0, 1.62, -34.8), V(.04, 1.42, -42)]];
  const pos = new THREE.CatmullRomCurve3(L.map(a => a[0]), false, 'centripetal'), look = new THREE.CatmullRomCurve3(L.map(a => a[1]), false, 'centripetal');
  return { pos, look, len: pos.getLength(), start: L[0], end: L[L.length - 1] };
}
const FILM = 11.6;                                   // seconds from the doorway to the console
const FOV = p => p ? [72, 60] : [50, 36];
// the camera's distance along the path at film time t: a gentle start, a steady glide, a long soft stop
function camAt(S, t) {
  const L = S.len, T = FILM, ta = 1.6, td = 2.8, v = L / (T - ta / 2 - td / 2);
  const s = t <= 0 ? 0 : t < ta ? v * t * t / (2 * ta) : t < T - td ? v * ta / 2 + v * (t - ta) : t < T ? L - v * (T - t) ** 2 / (2 * td) : L;
  const u = clamp01(s / L); return { pos: S.pos.getPointAt(u), look: S.look.getPointAt(u), u };
}
// where the agent is at film time t (seconds), and which way it faces (0 = back towards the doorway)
function agentAt(t, idleT) {
  const A = [
    { t: 0, p: V(.42, 2.02, 3.4), r: 0 },
    { t: 1.0, p: V(.3, 1.95, .4), r: Math.PI },
    { t: SCANS[0].t0, p: V(-.62, 1.52, SCANS[0].z), r: -Math.PI / 2 },
    { t: SCANS[0].t1, p: V(-.62, 1.52, SCANS[0].z), r: -Math.PI / 2 },
    { t: SCANS[1].t0, p: V(.72, 1.58, SCANS[1].z), r: Math.PI / 2 },
    { t: SCANS[1].t1, p: V(.72, 1.58, SCANS[1].z), r: Math.PI / 2 },
    { t: 10.4, p: PERCH.clone(), r: -.32 },
  ];
  if (t <= 0) return { p: A[0].p.clone().add(V(Math.sin(idleT * .7) * .05, Math.sin(idleT * 1.3) * .06, 0)), r: Math.sin(idleT * .4) * .25, v: 0 };
  let i = 0; while (i < A.length - 2 && t > A[i + 1].t) i++;
  const a = A[i], b = A[i + 1], k = ease(clamp01((t - a.t) / (b.t - a.t)));
  let dr = b.r - a.r; if (dr > Math.PI) dr -= Math.PI * 2; if (dr < -Math.PI) dr += Math.PI * 2;
  const p = a.p.clone().lerp(b.p, k); p.y += Math.sin(idleT * 1.6) * .03;
  return { p, r: a.r + dr * smooth(.0, .55, k), v: a.p.distanceTo(b.p) > .01 ? Math.sin(k * Math.PI) : 0 };
}

// ---------------------------------------------------------------- run
export async function run({ canvas, marks, mobile, sound, onEnter, onPhase, coins }) {
  try { await Promise.race([document.fonts.load(`600 22px ${FONT}`), new Promise(r => setTimeout(r, 1500))]); } catch {}
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!window.__shots });
  const dpr = Math.min(mobile ? 1.25 : 1.5, devicePixelRatio || 1);
  renderer.setPixelRatio(dpr); renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = !mobile; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0xf1f2f4); scene.fog = new THREE.FogExp2(0xf1f2f4, mobile ? .02 : .016);
  const P = build(scene, mobile), scr = P.screen;
  if (window.__shots) window.__scene = scene;
  const cam = new THREE.PerspectiveCamera(40, 1, .05, 90);
  const portrait = () => innerWidth / innerHeight < .9;
  let S = path(portrait());
  function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); S = path(portrait()); }
  resize(); addEventListener('resize', resize);

  // live hook: launched coins light up their racks and become what the agent checks on the way in
  const live = (coins || []).slice(0, P.main.length);
  live.forEach((c, i) => { const r = P.main[i]; r.coin = c; P.label(r.id, '$' + c.symbol + '  ·  ' + (c.coll || 'agent'), true); });
  const scanRack = k => {
    const withCoin = P.main.filter(r => r.coin && r.side === SCANS[k].side);
    if (withCoin.length) return withCoin[Math.min(k, withCoin.length - 1)];
    return P.main.filter(r => r.side === SCANS[k].side).reduce((a, b) => Math.abs(b.z - SCANS[k].z) < Math.abs(a.z - SCANS[k].z) ? b : a);
  };
  SCANS.forEach((s, k) => { const r = scanRack(k); s.z = r.z; s.rack = r; });

  const st = { phase: 'idle', t0: performance.now(), tFilm: 0, tReady: 0, tDive: 0, freeze: null, mx: 0, my: 0, px: 0, py: 0, blinkAt: 0, hover: false, lean: 0, done: false, skip: false };
  const setPhase = p => { st.phase = p; onPhase && onPhase(p); };
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(9, 9);
  const onScreen = () => { ray.setFromCamera(ndc, cam); return ray.intersectObject(P.monScreen, false).length > 0; };
  const sfx = (n, a) => { try { sound && sound.sfx(n, a); } catch {} };

  // the boot, as events on the film clock
  const Q = []; let qi = 0; const ev = (ms, fn) => Q.push({ ms, fn });
  const say = runs => scr.push(runs);
  let T = (FILM - 1.6) * 1000; const at = (d, fn) => { T += d; ev(T, fn); };
  at(0, () => { scr.off = false; scr.power = 0; sfx('power'); });
  for (let i = 1; i <= 16; i++) at(22, () => { scr.power = i / 16; scr.dirty = true; });
  at(30, () => { scr.power = 1; say([['nfa agentd 1.0', C.ink], ['  solana mainnet', C.dim]]); sfx('beep'); });
  const n = live.length;
  for (const [a, b] of [['vault keys', 'none held here'], ['pump.fun programs', 'linked'], ['magic eden market', 'reading'], ['agents online', n ? String(n) : '0 · launch one']]) {
    const dots = ' ' + '.'.repeat(Math.max(3, 26 - a.length)) + ' '; let i;
    at(150, () => { i = scr.push([[a, C.ink], [dots, C.dim]]); sfx('tick'); });
    at(230, () => scr.set(i, [[a, C.ink], [dots, C.dim], [b, C.black]]));
  }
  at(520, () => { scr.lines = []; scr.dirty = true; });
  for (let k = 1; k <= 14; k++) at(28, () => { scr.logo = k / 14; scr.dirty = true; });
  at(120, () => { say([['launch a coin paired with an NFT collection.', C.ink]]); });
  at(140, () => { say([['its agent spends the fees on NFTs for holders,', C.ink]]); });
  at(140, () => { say([['or for the burn. ', C.ink], ['nfa.', C.black]]); });
  at(220, () => { say([['', C.ink]]); say([['click the screen or press enter', C.dim]]); scr.prompt = true; st.posted = true; });
  Q.sort((a, b) => a.ms - b.ms);
  const flush = t => { while (qi < Q.length && (st.skip || Q[qi].ms <= t)) Q[qi++].fn(); };

  function start() { if (st.phase !== 'idle') return; st.tFilm = performance.now(); setPhase('film'); sfx('whoosh'); }
  function skip() {
    if (st.phase === 'idle') start();
    if (st.phase !== 'film') return;
    st.skip = true; st.blend = { t: performance.now(), from: cam.position.clone(), look: (st.look || S.end[1]).clone(), fov: cam.fov };
  }
  function ready() { if (st.phase !== 'film') return; st.tReady = performance.now(); setPhase('ready'); }
  function dive() {
    if (st.phase === 'dive' || st.done) return;
    if (st.phase !== 'ready') { st.pending = true; skip(); return; }
    st.tDive = performance.now(); st.diveFrom = cam.position.clone(); st.diveLook = (st.look || MON).clone(); setPhase('dive'); scr.prompt = false; sfx('dive');
  }
  const key = e => {
    if (st.done) return;
    if (e.key === 'Escape') { e.preventDefault(); if (st.phase === 'film' || st.phase === 'idle') skip(); else if (st.phase === 'ready') dive(); return; }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (st.phase === 'idle') start(); else if (st.phase === 'film') skip(); else if (st.phase === 'ready') dive(); }
  };
  addEventListener('keydown', key);
  const pm = e => { st.px = e.clientX / innerWidth * 2 - 1; st.py = e.clientY / innerHeight * 2 - 1; ndc.set(st.px, -st.py); };
  addEventListener('pointermove', pm, { passive: true });
  const click = e => { ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight * 2 - 1)); if (st.phase === 'idle') start(); else if (st.phase === 'film') skip(); else if (st.phase === 'ready') dive(); };
  canvas.addEventListener('click', click);

  // scan brackets over the racks, drawn in the page so they stay crisp
  const mk = document.createElement('div'); mk.className = 'mk'; mk.innerHTML = '<i></i><i></i><i></i><i></i><b></b>'; marks.appendChild(mk);
  const mkLabel = mk.querySelector('b');
  const proj = v => { const p = v.clone().project(cam); return { x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight, z: p.z }; };
  function showMark(r, k, text) {
    if (!r || k <= 0) { mk.style.opacity = 0; return; }
    const pts = [V(r.face, .2, r.z - RW / 2), V(r.face, .2, r.z + RW / 2), V(r.face, RH - .05, r.z - RW / 2), V(r.face, RH - .05, r.z + RW / 2)].map(proj);
    if (pts.some(p => p.z > 1)) { mk.style.opacity = 0; return; }
    const x0 = Math.min(...pts.map(p => p.x)), x1 = Math.max(...pts.map(p => p.x)), y0 = Math.min(...pts.map(p => p.y)), y1 = Math.max(...pts.map(p => p.y)), pad = 8 + (1 - k) * 26;
    mk.style.cssText = `opacity:${k};left:${x0 - pad}px;top:${y0 - pad}px;width:${x1 - x0 + pad * 2}px;height:${y1 - y0 + pad * 2}px`;
    if (mkLabel.textContent !== text) mkLabel.textContent = text;
  }

  // the agent's face, and the same face on the wall, looking at you
  let faceKey = '';
  function face(blink, look) {
    const k = blink.toFixed(2) + ':' + look.toFixed(2); if (k === faceKey) return; faceKey = k;
    const g = P.faceC.getContext('2d'); g.clearRect(0, 0, 256, 256); mark(g, 8, 8, 240, '#0b0c0e', { blink, look });
    P.faceT.needsUpdate = true;
  }
  let wallKey = '';
  function drawWall(blink, look, t) {
    const k = blink.toFixed(2) + ':' + look.toFixed(2) + ':' + Math.floor(t * 2); if (k === wallKey) return; wallKey = k;
    const g = P.wallC.getContext('2d'), W = 2048, H = 640;
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
    mark(g, W / 2 - 230, H / 2 - 230, 460, '#0b0c0e', { blink, look });
    g.font = `600 30px ${FONT}`; g.fillStyle = '#8a8e95'; g.textBaseline = 'middle';
    g.fillText('agentd', 90, 120); g.fillStyle = '#0b0c0e'; g.fillText((Math.floor(t * 2) % 2 ? '●' : '○') + ' online', 90, 166); g.fillStyle = '#8a8e95'; g.fillText('agents ' + n, 90, 212);
    g.textAlign = 'right'; g.fillStyle = '#0b0c0e'; g.fillText('nfa.', W - 90, 120); g.fillStyle = '#8a8e95'; g.fillText('non-fungible agents', W - 90, 166); g.textAlign = 'left';
    g.fillStyle = '#e3e5e8'; for (const x of [W / 4, W / 2, W * 3 / 4]) g.fillRect(x - 2, 0, 4, H); g.fillRect(0, H / 2 - 2, W, 4);
    P.wallT.needsUpdate = true;
  }

  // LEDs: black dots that hold, blink or flicker; the scanned rack goes dark top to bottom
  const ledCol = P.ledMesh.instanceColor.array;
  function lights(t) {
    const L = P.leds, scanR = st.scanRack, sweep = st.sweep;
    for (let i = 0; i < L.length; i++) {
      const l = L[i]; let on;
      if (l.kind === 0) on = Math.sin(t * .5 + l.ph) > -.6;
      else if (l.kind === 1) on = Math.sin(t * l.sp + l.ph) > .2;
      else on = Math.sin(t * 9.1 * l.sp + l.ph * 7) + Math.sin(t * 13.7 + l.ph * 3) > 1.1;
      let v = on ? .07 : .78;
      if (scanR != null && l.rack === scanR && Math.abs(l.y - sweep) < .25) v = .02;
      ledCol[i * 3] = v; ledCol[i * 3 + 1] = v; ledCol[i * 3 + 2] = v * 1.02;
    }
    P.ledMesh.instanceColor.needsUpdate = true;
  }

  const api = {
    start, skip, dive, phase: () => st.phase,
    freeze(phase, sec) {                         // still frames for checking the film; the site never calls it
      if (phase === 'idle') { st.freeze = { idle: true }; }
      if (phase === 'film') { setPhase('film'); st.freeze = { film: sec }; }
      if (phase === 'ready') { setPhase('film'); st.skip = true; st.freeze = { film: FILM + 4 }; }
      if (phase === 'dive') {
        if (st.phase !== 'ready') { this.freeze('ready'); step(performance.now()); step(performance.now()); }
        dive(); st.freeze = { film: FILM + 4, dive: sec };
      }
    },
    render() { step(performance.now()); },
  };

  let last = performance.now();
  function frame(now) { if (st.done) return; requestAnimationFrame(frame); step(now); }
  function step(now) {
    if (st.freeze && st.freeze.film != null) st.tFilm = now - st.freeze.film * 1000;
    if (st.freeze && st.freeze.dive != null) st.tDive = now - st.freeze.dive;
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    const tAll = (now - st.t0) / 1000;
    const ft = st.phase === 'idle' ? 0 : (now - st.tFilm) / 1000;
    if (st.phase !== 'idle') flush(ft * 1000);
    // camera
    const port = portrait(), [f0, f1] = FOV(port);
    const CA = camAt(S, st.phase === 'idle' ? 0 : ft);
    let u = st.phase === 'idle' ? 0 : clamp01(ft / FILM);
    let pos = CA.pos, look = CA.look, fov = f0 + (f1 - f0) * sine(CA.u);
    if (st.blend) { const b = ease(clamp01((now - st.blend.t) / 900)); pos = st.blend.from.clone().lerp(S.end[0], b); look = st.blend.look.clone().lerp(S.end[1], b); fov = st.blend.fov + (f1 - st.blend.fov) * b; if (b >= 1) u = 1; }
    if (st.phase === 'film' && st.posted && (u >= 1 || (st.blend && now - st.blend.t > 900))) { ready(); if (st.pending) { st.pending = false; dive(); } }
    st.mx += (st.px - st.mx) * .04; st.my += (st.py - st.my) * .04;
    const settle = st.phase === 'idle' ? .6 : st.phase === 'ready' ? 1 : smooth(FILM - 1, FILM + .5, ft);
    pos.x += Math.sin(tAll * .31) * .03 + st.mx * .1 * settle; pos.y += Math.sin(tAll * .45) * .015 - st.my * .05 * settle;
    if (st.phase === 'ready') { const h = onScreen(); if (h !== st.hover) { st.hover = h; canvas.style.cursor = h ? 'pointer' : 'default'; } }
    st.lean += ((st.phase === 'ready' && st.hover ? 1 : 0) - st.lean) * .06;
    if (st.lean > .001) { pos.lerp(V(MON.x, MON.y + .05, MON.z + 1.4), st.lean * .18); look.lerp(MON, st.lean * .3); }
    if (st.phase === 'dive') {
      const d = clamp01((now - st.tDive) / 1900), e = easeIn(d);
      pos = st.diveFrom.clone().lerp(V(MON.x, MON.y, MON.z + .2), e); look = st.diveLook.clone().lerp(MON, Math.min(1, e * 2)); fov = f1 - e * 6;
      scr.dive = clamp01((d - .25) / .75); scr.dirty = true;
      renderer.toneMappingExposure = 1 + e * .6;
      if (d >= 1 && !st.done && !(st.freeze && st.freeze.dive != null)) { st.done = true; cleanup(); onEnter && onEnter(); return; }
    }
    if (Math.abs(cam.fov - fov) > .001) { cam.fov = fov; cam.updateProjectionMatrix(); }
    st.look = look; cam.position.copy(pos); cam.lookAt(look);

    // the agent
    const at = st.blend ? Math.max(ft, 10.5) : ft;
    const A = agentAt(st.phase === 'idle' ? 0 : at, tAll);
    if (st.blend && !st.blendA) st.blendA = { t: now, from: P.agent.position.clone() };
    let ap = A.p; if (st.blendA) { const b = ease(clamp01((now - st.blendA.t) / 900)); ap = st.blendA.from.clone().lerp(A.p, b); }
    P.agent.position.copy(ap);
    const toCam = Math.atan2(cam.position.x - ap.x, cam.position.z - ap.z);
    const want = (st.phase === 'idle' || at >= 10.4) ? toCam + st.mx * .15 : A.r;
    let dr = want - P.agent.rotation.y; while (dr > Math.PI) dr -= Math.PI * 2; while (dr < -Math.PI) dr += Math.PI * 2;
    P.agent.rotation.y += dr * (st.freeze ? 1 : Math.min(1, dt * 5)); P.agent.rotation.z = Math.sin(tAll * 1.1) * .04 - A.v * .12; P.agent.rotation.x = A.v * .14;
    // blinks for the agent, the wall and the console
    if (tAll > st.blinkAt) st.blinkAt = tAll + 2.6 + Math.random() * 3.2;
    const bl = st.freeze ? 0 : Math.max(0, 1 - Math.abs(tAll - (st.blinkAt - 2.6)) * 9);
    const lookX = clamp01((st.mx + 1) / 2) * 2 - 1;
    let scanK = 0, scanI = -1;
    SCANS.forEach((s, i) => { const kk = smooth(s.t0 - .1, s.t0 + .3, at) * (1 - smooth(s.t1 - .3, s.t1, at)); if (kk > scanK) { scanK = kk; scanI = i; } });
    if (st.phase === 'idle' || st.skip) scanK = 0;
    face(bl, scanK > 0 ? 0 : lookX * .6);
    drawWall(bl, cam.position.x * .2 + lookX * .3, tAll);
    scr.eye = bl; scr.lookv = lookX * .5; if (scr.logo >= 1) scr.dirty = true;
    // the scan: lines from the face to the door, the rack's lights going dark in a sweep, brackets in the page
    if (scanK > 0) {
      const s = SCANS[scanI], r = s.rack, f = P.agent.localToWorld(V(0, 0, .22));
      const c = [V(r.face, .25, r.z - RW / 2), V(r.face, .25, r.z + RW / 2), V(r.face, RH - .1, r.z + RW / 2), V(r.face, RH - .1, r.z - RW / 2)];
      const a = P.scanGeo.attributes.position.array; let o = 0; const put = v => { a[o++] = v.x; a[o++] = v.y; a[o++] = v.z; };
      for (let i = 0; i < 4; i++) { put(f); put(c[i]); } for (let i = 0; i < 4; i++) { put(c[i]); put(c[(i + 1) % 4]); }
      P.scanGeo.attributes.position.needsUpdate = true; P.scanMat.opacity = scanK * .55;
      st.scanRack = P.racks.indexOf(r); st.sweep = RH - ((at - s.t0) / (s.t1 - s.t0) % 1) * RH;
      showMark(r, scanK, r.coin ? `${r.id} · $${r.coin.symbol} · ${r.coin.coll || 'agent'}` : `${r.id} · open slot`);
      if (!st['beep' + scanI] && scanK > .5) { st['beep' + scanI] = 1; sfx('scan'); }
    } else { P.scanMat.opacity = 0; st.scanRack = null; showMark(null, 0); }
    lights(tAll);
    scr.draw(now);
    renderer.render(scene, cam);
  }
  function cleanup() { removeEventListener('keydown', key); removeEventListener('resize', resize); removeEventListener('pointermove', pm); canvas.removeEventListener('click', click); setTimeout(() => { renderer.dispose(); }, 1500); }
  if (!window.__shots) requestAnimationFrame(frame);
  return api;
}
