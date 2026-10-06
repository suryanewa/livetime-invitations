// v1.7 polish (item 3): the net judge's probe (judge-net/tools/judge-probe.ts), unchanged but for
// the tails: since the polish each tail has its own bone (2·cords + nodes + its index, NetSkin's
// lag), so its tip is found and drawn on that bone when the lattice has \`tails\`; on a lattice
// without them (before) it reads the bottom knots' bones as the judge's did.
//   P_ROOT=<worktree> node --experimental-transform-types --no-warnings tail-probe.ts 120
// v1.7 net probe: drives the real net channel (src/scenes/sports/net.ts) along the accept track
// the way the controller does (director samples, FixedStepper's equal steps ≤ 1/120 s, the tail,
// then the ball at rest) and measures every #44 target on what is drawn (the skin's bones, carried
// into hoop space by the drawn recoil).
//
// Run:  node --experimental-transform-types --no-warnings evidence/v1.7/sports-net/tools/net-probe.ts [hz] [--det] [--json]
//   hz     display rate to emulate (default 120); --det compares 60/90/120/144 Hz at common times.
const P = process.env.P_ROOT!;
const { Vector3, Matrix4, BufferGeometry, BufferAttribute, Object3D, Quaternion } = await import(P + '/node_modules/three/build/three.module.js');
const NETMOD = await import(P + '/models/sportsNet.ts');
const { analyseNet, HoopSprings, NET_SIM, NetSim, NetSkin, netMeshKind } = NETMOD;
const { createIO, findNode } = await import(P + '/scripts/masters/compose.ts');
const { HOOP_ROOT, RIM_LOCAL, recoilPoint, RIM_BACKSTOP, BALL_R, NET, netRestRadius } = await import(P + '/models/sportsContract.ts');
const { CONTACT_AT, DURATIONS, NET_PASSAGE, RELEASE_AT, newFrame, REST_AT, sampleTrack } = await import(P + '/src/scenes/sports/sequences.ts');
const { SportsNetChannel } = await import(P + '/src/scenes/sports/net.ts');
const { FixedStepper } = await import(P + '/src/motion/spring.ts');

const args = process.argv.slice(2);
const HZ = Number(args.find((a) => /^\d+$/.test(a)) ?? 120);
// --set key=value,...: override NET_SIM (or rim.zeta / board.zeta of HOOP_SPRINGS) for a sweep.
const SET = args.find((a) => a.startsWith('--set='))?.slice(6);
if (SET) for (const kv of SET.split(',')) {
  const [k, v] = kv.split('=') as [string, string];
  if (k.startsWith('rim.') || k.startsWith('board.')) { const [part, f] = k.split('.') as ['rim' | 'board', string]; (NETMOD.HOOP_SPRINGS as any)[part][f] = Number(v); }
  else (NETMOD.NET_SIM as any)[k] = Number(v);
}
// --tail=lag,gravity: a sweep of NetSkin's TAIL.
const TAILSET = args.find((a) => a.startsWith('--tail='))?.slice(7);
if (TAILSET && NETMOD.TAIL) { const [lag, gravity] = TAILSET.split(',').map(Number); Object.assign(NETMOD.TAIL, { lag, gravity }); }
const SU_M = 0.36, DEG = 180 / Math.PI, G = 9.81 / SU_M;

const doc = await createIO().read(P + '/assets/scenes/sports/sports.glb');
function netMeshes(doc: any) {
  const hoop = findNode(doc, 'hoop_root'), net = findNode(doc, 'net');
  const toHoop = new Matrix4().fromArray(hoop.getWorldMatrix()).invert();
  const out: any[] = [];
  net.traverse((n: any) => {
    const m = n.getMesh();
    if (!m) return;
    const mat = new Matrix4().multiplyMatrices(toHoop, new Matrix4().fromArray(n.getWorldMatrix()));
    for (const prim of m.listPrimitives()) {
      const p = prim.getAttribute('POSITION')!;
      const arr = new Float32Array(p.getCount() * 3), e = [0, 0, 0], v = new Vector3();
      for (let i = 0; i < p.getCount(); i++) { p.getElement(i, e); v.set(e[0], e[1], e[2]).applyMatrix4(mat).sub(RIM_LOCAL).toArray(arr, i * 3); }
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(arr, 3));
      const idx = prim.getIndices();
      if (idx) g.setIndex(new BufferAttribute(Uint32Array.from(idx.getArray()!), 1));
      const kind = netMeshKind(n.getName()) ?? netMeshKind(n.getParentNode()?.getName() ?? '');
      if (kind) out.push({ geometry: g, kind });
    }
  });
  return out;
}
const MESHES = netMeshes(doc); const L = analyseNet(MESHES)!;
const NC = L.cords.length;
const KNOTS: number[] = L.rows.flat();
const BOTTOM: number[] = L.rows[5];

interface Snap { energy?: number; t: number; run: number; knots: Float64Array; up: Float64Array; scaleMin: number; scaleMax: number; rim: number; board: number; force: number; settled: boolean; ball: any }

/** One accept run through the channel at `hz`; a snapshot of what is drawn after every frame. */
function run(hz: number, seconds = REST_AT.accept + 2.5) {
  const sim = new NetSim(L), springs = new HoopSprings();
  const holder = new Object3D();
  const skin = new NetSkin(holder, sim, []);
  const drawnRecoil = { board: 0, rim: 0 };
  const rig = { net: { sim, skin }, springs, recoil: { set(b: number, r: number) { drawnRecoil.board = b; drawnRecoil.rim = r; } } };
  const f = newFrame();
  const path = (_s: any, _c: any, t: number) => sampleTrack('accept', t, f).ballPos;
  const ch = new SportsNetChannel(rig as any, path);
  const stepper = new FixedStepper();
  const snaps: Snap[] = [];
  const restBall = sampleTrack('accept', REST_AT.accept, newFrame()).ballPos.clone();
  const dt = 1 / hz;
  let tail: { seq: string; change: null; t: number } | null = null;
  let sampling: { seq: string; change: null; t: number } | null = null;
  let tailDone = false;
  const ballAt = new Vector3();
  let runT = 0;
  for (let i = 1; i * dt <= seconds + 1e-9; i++) {
    const T = i * dt;
    // Director: sample while t < duration; at t ≥ duration pose(final) → the scene starts the tail at DURATIONS.
    if (!tail && !tailDone && T < DURATIONS.accept) {
      sampling = { seq: 'accept', change: null, t: T };
      ch.follow(sampling, false);
      ballAt.copy(path(null, null, T));
      runT = T;
    } else if (!tail && !tailDone) {
      tail = { seq: 'accept', change: null, t: DURATIONS.accept };
      sampling = null;
      ballAt.copy(path(null, null, tail.t));
    }
    stepper.advance(dt, (h: number) => {
      if (tail) {
        tail.t = Math.min(tail.t + h, REST_AT.accept);
        ballAt.copy(path(null, null, tail.t));
        runT = tail.t;
        if (tail.t >= REST_AT.accept) { tail = null; tailDone = true; }
      }
      ch.step(h, tail ?? sampling, tailDone ? restBall : ballAt);
      if (tailDone) runT += h;
    });
    snaps.push(snapshot(T, runT, skin, sim, springs, drawnRecoil, ballAt));
    snaps[snaps.length - 1]!.energy = simEnergy(sim);
  }
  return { snaps, sim, springs, skin, ch };
}

/** The net's mechanical energy above its hanging rest (mJ): KE + gravity + the cords' and diagonals' elastic energy (the sim's own state). */
let restPotential: number | null = null;
function potential(S: any, x: Float64Array): number {
  let pe = 0;
  for (let i = 0; i < S.n; i++) if (S.invMass[i] > 0) pe += (1 / S.invMass[i]) * G * x[i * 3 + 1];
  for (let c = 0; c < S.ca.length; c++) {
    const a = S.ca[c], b = S.cb[c], mode = S.mode[c], cc = S.cc[c];
    if (mode === 2 || cc === 0) continue;
    const d = Math.hypot(x[b * 3] - x[a * 3], x[b * 3 + 1] - x[a * 3 + 1], x[b * 3 + 2] - x[a * 3 + 2]);
    const C = d - S.cl[c];
    if (mode === 1 && C <= 0) continue;
    pe += (0.5 * C * C) / cc;
  }
  return pe;
}
function simEnergy(S: any): number {
  if (!S.v) return NaN; // v1.5's sim keeps no velocities (Verlet)
  if (restPotential === null) restPotential = potential(S, S.rest);
  let ke = 0;
  for (let i = 0; i < S.n; i++) if (S.invMass[i] > 0) ke += 0.5 * (1 / S.invMass[i]) * (S.v[i * 3] ** 2 + S.v[i * 3 + 1] ** 2 + S.v[i * 3 + 2] ** 2);
  return (ke + potential(S, S.x) - restPotential) * SU_M * SU_M * 1000;
}
const _q = new Quaternion(), _p = new Vector3(), _o = new Vector3(), _u = new Vector3();
/** Net-frame point → hoop space under the drawn recoil. */
function toHoop(p: any, board: number, rim: number, out: any) {
  recoilPoint(RIM_LOCAL, board, rim, _o);
  const a = board + rim, c = Math.cos(a), s = Math.sin(a);
  return out.set(p.x, p.y * c - p.z * s, p.y * s + p.z * c).add(_o);
}
function snapshot(T: number, runT: number, skin: any, sim: any, springs: any, rec: { board: number; rim: number }, ball: any): Snap {
  const knots = new Float64Array(KNOTS.length * 3), up = new Float64Array(KNOTS.length * 3);
  KNOTS.forEach((k, j) => {
    const b = skin.bones[NC + k];
    toHoop(b.position, rec.board, rec.rim, _p).toArray(knots, j * 3);
    _u.set(0, 1, 0).applyQuaternion(b.quaternion);
    // rotate the up vector into hoop space too
    const a = rec.board + rec.rim, c = Math.cos(a), s = Math.sin(a);
    up[j * 3] = _u.x; up[j * 3 + 1] = _u.y * c - _u.z * s; up[j * 3 + 2] = _u.y * s + _u.z * c;
  });
  let scaleMin = Infinity, scaleMax = 0;
  const scales: number[] = typeof skin.strandScales === 'function' ? skin.strandScales() : skin.bones.slice(0, NC).map((b: any) => b.scale.x);
  for (const s of scales) { scaleMin = Math.min(scaleMin, s); scaleMax = Math.max(scaleMax, s); }
  return { t: T, run: runT, knots, up, scaleMin, scaleMax, rim: rec.rim, board: rec.board, force: sim.hookForce.length(), settled: sim.settled && springs.settled, ball: ball.clone().sub(HOOP_ROOT) };
}

const exitAt: number = NET_PASSAGE.exitAt;
const masses = KNOTS.map((k) => 1 / (NETMOD.NetSim.prototype && (L as any) ? 1 : 1));
// ---------------- judge additions ----------------
// Per-frame capture of every knot bone (position, quaternion) and each bottom knot's tail tip, in hoop space.
const NN = L.nodes.length;
function tailTips(skin: any) {
  // For each bottom knot bone: the bound vertex (weight 1 on that bone) furthest from the knot's bind position = its tail tip.
  return null;
}
function captureRun(hz: number, seconds = REST_AT.accept + 2.5) {
  const sim = new NetSim(L), springs = new HoopSprings();
  const holder = new Object3D();
  // meshes: rebuild from the glb so the tail geometry is known
  const skin = new NetSkin(holder, sim, []);
  const drawnRecoil = { board: 0, rim: 0 };
  const rig = { net: { sim, skin }, springs, recoil: { set(b: number, r: number) { drawnRecoil.board = b; drawnRecoil.rim = r; } } };
  const f = newFrame();
  const path = (_s: any, _c: any, t: number) => sampleTrack('accept', t, f).ballPos;
  const ch = new SportsNetChannel(rig as any, path);
  const stepper = new FixedStepper();
  const restBall = sampleTrack('accept', REST_AT.accept, newFrame()).ballPos.clone();
  const dt = 1 / hz;
  let tail: any = null, sampling: any = null, tailDone = false;
  const ballAt = new Vector3();
  const frames: { t: number; kp: Float64Array; kq: Float64Array; tips: Float64Array; ball: any }[] = [];
  const NN0 = L.nodes.length;
  const bottomBones = BOTTOM.map((k) => (L.tails ? skin.bones[2 * NC + NN0 + L.tails.indexOf(k)] : skin.bones[NC + k]));
  // tail tip offsets in each bottom bone's local frame: from the bind pose (bones at L.nodes, frames from pose(true)).
  holder.updateMatrixWorld(true);
  const tipLocal = BOTTOM.map((k, j) => {
    const b = bottomBones[j]; const inv = new Matrix4().copy(b.matrixWorld).invert();
    return TAIL_TIP[j]!.clone().applyMatrix4(inv);
  });
  for (let i = 1; i * dt <= seconds + 1e-9; i++) {
    const T = i * dt;
    if (!tail && !tailDone && T < DURATIONS.accept) { sampling = { seq: 'accept', change: null, t: T }; ch.follow(sampling, false); ballAt.copy(path(null, null, T)); }
    else if (!tail && !tailDone) { tail = { seq: 'accept', change: null, t: DURATIONS.accept }; sampling = null; ballAt.copy(path(null, null, tail.t)); }
    stepper.advance(dt, (h: number) => {
      if (tail) { tail.t = Math.min(tail.t + h, REST_AT.accept); ballAt.copy(path(null, null, tail.t)); if (tail.t >= REST_AT.accept) { tail = null; tailDone = true; } }
      ch.step(h, tail ?? sampling, tailDone ? restBall : ballAt);
    });
    holder.updateMatrixWorld(true);
    const kp = new Float64Array(KNOTS.length * 3), kq = new Float64Array(KNOTS.length * 4), tips = new Float64Array(30);
    const a = drawnRecoil.board + drawnRecoil.rim, c = Math.cos(a), s = Math.sin(a);
    KNOTS.forEach((k, j) => {
      const b = skin.bones[NC + k];
      toHoop(b.position, drawnRecoil.board, drawnRecoil.rim, _p).toArray(kp, j * 3);
      kq[j * 4] = b.quaternion.x; kq[j * 4 + 1] = b.quaternion.y; kq[j * 4 + 2] = b.quaternion.z; kq[j * 4 + 3] = b.quaternion.w;
    });
    BOTTOM.forEach((k, j) => { const p = tipLocal[j]!.clone().applyMatrix4(bottomBones[j].matrixWorld); toHoop(p, drawnRecoil.board, drawnRecoil.rim, _p).toArray(tips, j * 3); });
    frames.push({ t: T, kp, kq, tips, ball: ballAt.clone().sub(HOOP_ROOT) });
  }
  return frames;
}
// Tail tips at bind: from the master's tail geometry (vertices of the knots/strands meshes bound with weight 1 to a bottom knot's bone, furthest from that knot).
const meshesForTips = MESHES;
const TAIL_TIP: any[] = BOTTOM.map(() => null);
const tipDist = BOTTOM.map(() => 0);
for (const m of meshesForTips) {
  const bind = L.binding.get(m.geometry); if (!bind) continue;
  const pos = m.geometry.getAttribute('position');
  for (let v = 0; v < pos.count; v++) {
    let bone: number;
    if (bind.weight) { if (bind.weight[v * 4] < 0.999) continue; bone = bind.index[v * 4]; }
    else { if (bind.weight1[v] > 0.001) continue; bone = bind.bone0[v]; }
    const node = L.tails && bone >= 2 * NC + L.nodes.length ? L.tails[bone - 2 * NC - L.nodes.length] : bone - NC; const j = BOTTOM.indexOf(node);
    if (j < 0) continue;
    const p = new Vector3(pos.getX(v), pos.getY(v), pos.getZ(v));
    const d = p.distanceTo(L.nodes[node]);
    if (d > tipDist[j]!) { tipDist[j] = d; TAIL_TIP[j] = p; }
  }
}
console.log(`tail tips: length from knot (cm) ${tipDist.map((d) => (d * 36).toFixed(1)).join(' ')}`);
if (TAIL_TIP.some((p) => !p)) { console.log('tail tips missing (binding layout differs) — tips fall back to knot'); TAIL_TIP.forEach((p, j) => { if (!p) TAIL_TIP[j] = L.nodes[BOTTOM[j]!].clone().add(new Vector3(0, -0.04, 0)); }); }

const HZ2 = HZ;
const fr = captureRun(HZ2);
const exit = NET_PASSAGE.exitAt;
const MM = SU_M * 1000;
const rest = fr[0]!;
const iOf = (t: number) => fr.findIndex((q) => q.t >= t - 1e-9);
// 1. per-knot spectra of drawn displacement over [exit, exit + 2] (Hann), power fraction >= 5 Hz and >= 8 Hz; HF RMS (>= 5 Hz) in mm
function spec(sig: number[], fs: number) {
  const N = sig.length, mean = sig.reduce((a, b) => a + b, 0) / N;
  const w = sig.map((v, i) => (v - mean) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1))));
  const out: { f: number; p: number }[] = [];
  for (let k = 1; k < N / 2; k++) { let re = 0, im = 0; for (let i = 0; i < N; i++) { const a = (2 * Math.PI * k * i) / N; re += w[i]! * Math.cos(a); im -= w[i]! * Math.sin(a); } out.push({ f: (k * fs) / N, p: re * re + im * im }); }
  return out;
}
const i0 = iOf(exit), i1 = iOf(exit + 2);
const rowStats: string[] = [];
let worst5 = 0, worst8 = 0, worstHfMm = 0, worstKnot = -1;
for (let r = 0; r < 6; r++) {
  let m5 = 0, m8 = 0, hfmm = 0, pk = 0;
  for (const k of L.rows[r]) {
    const j = KNOTS.indexOf(k);
    let p5 = 0, p8 = 0, pt = 0, hfa = 0;
    for (let ax = 0; ax < 3; ax++) {
      const sig = fr.slice(i0, i1).map((q) => q.kp[j * 3 + ax]! - rest.kp[j * 3 + ax]!);
      const S = spec(sig, HZ2);
      for (const q of S) { pt += q.p; if (q.f >= 5) p5 += q.p; if (q.f >= 8) p8 += q.p; }
      // HF RMS: subtract a 0.2 s centred moving average (first null at 5 Hz)
      const W = Math.round(0.2 * HZ2);
      for (let i = 0; i < sig.length; i++) { let s = 0, n = 0; for (let d = -W / 2; d <= W / 2; d++) { const x = sig[i + d]; if (x !== undefined) { s += x; n++; } } hfa += (sig[i]! - s / n) ** 2 / sig.length; }
    }
    const f5 = p5 / pt, f8 = p8 / pt, hf = Math.sqrt(hfa) * MM;
    m5 = Math.max(m5, f5); m8 = Math.max(m8, f8); hfmm = Math.max(hfmm, hf);
    if (f8 > worst8) { worst8 = f8; worstKnot = k; }
    worst5 = Math.max(worst5, f5); worstHfMm = Math.max(worstHfMm, hf);
  }
  rowStats.push(`row ${r}: max over knots: power >=5 Hz ${(m5 * 100).toFixed(2)} %, >=8 Hz ${(m8 * 100).toFixed(3)} %, HF RMS (>~5 Hz) ${hfmm.toFixed(3)} mm`);
}
console.log(`[1] per-knot drawn displacement spectra, exit..exit+2 s @${HZ2} Hz`);
rowStats.forEach((s) => console.log('   ' + s));
// 2. velocity reversals per knot (direction changes of the frame velocity along its principal axis, |v| > 2 mm/s), exit+0.25..exit+1.75
const iA = iOf(exit + 0.25), iB = iOf(exit + 1.75);
const rev: number[] = [];
for (let j = 0; j < KNOTS.length; j++) {
  // principal axis: the displacement covariance's dominant direction (power iteration)
  const D = fr.slice(iA, iB).map((q) => [0, 1, 2].map((a) => q.kp[j * 3 + a]! - rest.kp[j * 3 + a]!));
  let v = [1, 0.3, 0.2];
  for (let it = 0; it < 30; it++) { const nv = [0, 0, 0]; for (const d of D) { const s = d[0]! * v[0]! + d[1]! * v[1]! + d[2]! * v[2]!; nv[0] += s * d[0]!; nv[1] += s * d[1]!; nv[2] += s * d[2]!; } const n = Math.hypot(...nv) || 1; v = nv.map((x) => x / n); }
  let last = 0, n = 0;
  for (let i = 1; i < D.length; i++) { const vel = ((D[i]![0]! - D[i - 1]![0]!) * v[0]! + (D[i]![1]! - D[i - 1]![1]!) * v[1]! + (D[i]![2]! - D[i - 1]![2]!) * v[2]!) * HZ2 * MM; if (Math.abs(vel) < 2) continue; const sg = Math.sign(vel); if (last && sg !== last) n++; last = sg; }
  rev.push(n / 1.5);
}
const byRow = L.rows.map((row: number[]) => { const xs = row.map((k) => rev[KNOTS.indexOf(k)]!); return `${(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1)}/${Math.max(...xs).toFixed(1)}`; });
console.log(`[2] velocity reversals per second (|v| > 2 mm/s), exit+0.25..1.75 s, row mean/max: ${byRow.join('  ')}  (a 1.15 Hz sway gives 2.3)`);
// 3. bone angular rate (full frame, not just up) and tail tips
const qAng = (q: Float64Array, p: Float64Array, j: number) => 2 * Math.acos(Math.min(1, Math.abs(q[j * 4]! * p[j * 4]! + q[j * 4 + 1]! * p[j * 4 + 1]! + q[j * 4 + 2]! * p[j * 4 + 2]! + q[j * 4 + 3]! * p[j * 4 + 3]!))) * DEG;
for (const [a, b] of [[0, 0.25], [0.25, 0.5], [0.5, 1], [1, 2]] as const) {
  let rowMax = L.rows.map(() => 0), tipSpd = 0, tipOut = 0, tipOutJ = -1, tipOutT = 0, tipDev = 0;
  for (let i = iOf(exit + a) + 1; i < iOf(exit + b); i++) {
    const q = fr[i]!, p = fr[i - 1]!;
    L.rows.forEach((row: number[], r: number) => { for (const k of row) { const j = KNOTS.indexOf(k); rowMax[r] = Math.max(rowMax[r]!, qAng(q.kq, p.kq, j) / (q.t - p.t)); } });
    for (let j = 0; j < 10; j++) {
      const kj = KNOTS.indexOf(BOTTOM[j]!);
      const sp = Math.hypot(...[0, 1, 2].map((c) => (q.tips[j * 3 + c]! - p.tips[j * 3 + c]!) - (q.kp[kj * 3 + c]! - p.kp[kj * 3 + c]!))) / (q.t - p.t) * SU_M * 100; // tip speed relative to its knot, cm/s
      tipSpd = Math.max(tipSpd, sp);
      // tail direction vs rest: outward (radial, horizontal) component of tip - knot, change from rest (mm)
      const rx = rest.kp[kj * 3]! - RIM_LOCAL.x, rz = rest.kp[kj * 3 + 2]! - RIM_LOCAL.z, rn = Math.hypot(rx, rz);
      const out = ((q.tips[j * 3]! - q.kp[kj * 3]!) * rx + (q.tips[j * 3 + 2]! - q.kp[kj * 3 + 2]!) * rz) / rn - ((rest.tips[j * 3]! - rest.kp[kj * 3]!) * rx + (rest.tips[j * 3 + 2]! - rest.kp[kj * 3 + 2]!) * rz) / rn;
      if (out * MM > tipOut) { tipOut = out * MM; tipOutJ = j; tipOutT = q.t - exit; }
      tipDev = Math.max(tipDev, Math.hypot(...[0, 1, 2].map((c) => (q.tips[j * 3 + c]! - q.kp[kj * 3 + c]!) - (rest.tips[j * 3 + c]! - rest.kp[kj * 3 + c]!))) * MM);
    }
  }
  console.log(`[3] exit+${a}..${b} s: bone angular rate max by row (deg/s) ${rowMax.map((x) => x.toFixed(0)).join('/')}; tail tip vs its knot: speed max ${tipSpd.toFixed(1)} cm/s, offset from rest max ${tipDev.toFixed(1)} mm, outward flick max ${tipOut.toFixed(1)} mm (tail ${tipOutJ} at exit+${tipOutT.toFixed(3)} s)`);
}
// 4. frame-to-frame second difference (drawn knot acceleration proxy) and its sign flips: a buzz alternates
let maxD2 = 0, flips = 0, cnt = 0;
for (let i = iOf(exit + 0.25) + 1; i < iOf(exit + 2) - 1; i++) for (let j = 0; j < KNOTS.length; j++) for (let c = 0; c < 3; c++) {
  const d2 = fr[i + 1]!.kp[j * 3 + c]! - 2 * fr[i]!.kp[j * 3 + c]! + fr[i - 1]!.kp[j * 3 + c]!;
  const d2n = fr[i + 2] ? fr[i + 2]!.kp[j * 3 + c]! - 2 * fr[i + 1]!.kp[j * 3 + c]! + fr[i]!.kp[j * 3 + c]! : 0;
  maxD2 = Math.max(maxD2, Math.abs(d2));
  if (Math.abs(d2) * MM > 0.005 && Math.abs(d2n) * MM > 0.005) { cnt++; if (Math.sign(d2) !== Math.sign(d2n)) flips++; }
}
console.log(`[4] exit+0.25..2 s: max |2nd difference| of a drawn knot ${(maxD2 * MM).toFixed(4)} mm/frame²; consecutive 2nd differences > 5 µm that flip sign: ${(100 * flips / Math.max(cnt, 1)).toFixed(1)} % of ${cnt}`);
// 5. bottom-ring mean y and the max single-knot lift through time (the whip), every 50 ms from exit
const bot = BOTTOM.map((k) => KNOTS.indexOf(k));
let line = '';
for (let d = 0; d <= 1.0001; d += 0.05) { const q = fr[iOf(exit + d)]!; const dy = bot.map((j) => (q.kp[j * 3 + 1]! - rest.kp[j * 3 + 1]!) * MM); line += ` ${d.toFixed(2)}:${(dy.reduce((a, b) => a + b) / 10).toFixed(1)}/${Math.max(...dy).toFixed(1)}`; }
console.log(`[5] bottom ring dy mean/max-knot (mm) at exit+:${line}`);
// 6. the settle snap: the largest knot jump in a single frame at the settle vs the previous frame's
let snapPrev = 0, snap = 0, snapT = 0;
for (let i = 2; i < fr.length; i++) { let m = 0, mp = 0; for (let j = 0; j < KNOTS.length; j++) { m = Math.max(m, Math.hypot(...[0, 1, 2].map((c) => fr[i]!.kp[j * 3 + c]! - fr[i - 1]!.kp[j * 3 + c]!))); mp = Math.max(mp, Math.hypot(...[0, 1, 2].map((c) => fr[i - 1]!.kp[j * 3 + c]! - fr[i - 2]!.kp[j * 3 + c]!))); }
  if (fr[i]!.t > exit + 1 && m > 0 && fr.slice(i + 1, i + 5).every((q) => [...Array(KNOTS.length * 3).keys()].every((x) => q.kp[x] === fr[i]!.kp[x]))) { snap = m; snapPrev = mp; snapT = fr[i]!.t - exit; break; } }
console.log(`[6] last moving frame (settle) at exit+${snapT.toFixed(3)} s: largest knot step ${(snap * MM).toFixed(3)} mm vs ${(snapPrev * MM).toFixed(3)} mm the frame before`);
