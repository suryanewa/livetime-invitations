// v1.7 net probe: drives the real net channel (src/scenes/sports/net.ts) along the accept track
// the way the controller does (director samples, FixedStepper's equal steps ≤ 1/120 s, the tail,
// then the ball at rest) and measures every #44 target on what is drawn (the skin's bones, carried
// into hoop space by the drawn recoil).
//
// Run:  node --experimental-transform-types --no-warnings evidence/v1.7/sports-net/tools/net-probe.ts [hz] [--det] [--json]
//   hz     display rate to emulate (default 120); --det compares 60/90/120/144 Hz at common times.
const P = new URL('../../../../', import.meta.url).pathname.replace(/\/$/, '');
const { Vector3, Matrix4, BufferGeometry, BufferAttribute, Object3D, Quaternion } = await import(P + '/node_modules/three/build/three.module.js');
const NETMOD = await import(P + '/models/sportsNet.ts');
const { analyseNet, HoopSprings, NET_SIM, NetSim, NetSkin, netMeshKind } = NETMOD;
const { createIO, findNode } = await import(P + '/scripts/masters/compose.ts');
const { HOOP_ROOT, RIM_LOCAL, recoilPoint, RIM_BACKSTOP, BALL_R } = await import(P + '/models/sportsContract.ts');
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
const L = analyseNet(netMeshes(doc))!;
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

function analyse(hz: number) {
  const { snaps, sim } = run(hz);
  const S: any = sim;
  const invMass: Float64Array = S.invMass;
  const mass = KNOTS.map((k) => 1 / invMass[k]);
  const rest = snaps[0]!; // before the ball arrives: the drawn rest
  const restUp = rest.up, restK = rest.knots;
  const out: Record<string, any> = { hz };
  const idx = (k: number) => KNOTS.indexOf(k);
  // Wake / settle
  const awake = snaps.findIndex((s) => !s.settled);
  out.wake = awake >= 0 ? snaps[awake]!.t : null;
  let settledAt = Infinity;
  for (let i = snaps.length - 1; i > 0; i--) if (!snaps[i]!.settled) { settledAt = snaps[i + 1]?.t ?? Infinity; break; }
  out.settleAfterExit = settledAt - exitAt;
  // Energies (drawn, hoop space): KE from frame differences, PE above rest.
  const E: { t: number; ke: number; e: number }[] = [];
  for (let i = 1; i < snaps.length; i++) {
    const a = snaps[i - 1]!, b = snaps[i]!;
    let ke = 0, pe = 0;
    for (let j = 0; j < KNOTS.length; j++) {
      const vx = (b.knots[j * 3] - a.knots[j * 3]) / (b.t - a.t), vy = (b.knots[j * 3 + 1] - a.knots[j * 3 + 1]) / (b.t - a.t), vz = (b.knots[j * 3 + 2] - a.knots[j * 3 + 2]) / (b.t - a.t);
      ke += 0.5 * mass[j]! * (vx * vx + vy * vy + vz * vz);
      pe += mass[j]! * G * (b.knots[j * 3 + 1] - restK[j * 3 + 1]);
    }
    E.push({ t: b.t, ke: ke * SU_M * SU_M, e: (ke + pe) * SU_M * SU_M });
  }
  const post = E.filter((r) => r.t > exitAt);
  const kePeak = Math.max(...post.map((r) => r.ke));
  const kePeakAt = post.find((r) => r.ke === kePeak)!.t;
  let keRise = 0, eRise = 0, eRiseAt = 0;
  for (let i = 1; i < post.length; i++) {
    if (post[i - 1]!.ke > kePeak * 1e-3) keRise = Math.max(keRise, post[i]!.ke / post[i - 1]!.ke - 1);
    const ePrev = post[i - 1]!.e, eNow = post[i]!.e;
    if (ePrev > Math.max(...post.map((r) => r.e)) * 1e-3) { const r = eNow / ePrev - 1; if (r > eRise) { eRise = r; eRiseAt = post[i]!.t; } }
  }
  const ke1pct = post.find((r, i) => post.slice(i).every((q) => q.ke < kePeak * 0.01));
  // Mechanical energy (sim state): after the exit it must only fall (no energy injected).
  const ME = snaps.filter((q) => q.t > exitAt && q.energy !== undefined).map((q) => ({ t: q.t, e: q.energy! }));
  const mePeak = Math.max(...ME.map((q) => q.e));
  let meRise = 0, meRiseAt = 0;
  for (let i = 1; i < ME.length; i++) if (ME[i - 1]!.e > mePeak * 1e-3) { const r = ME[i]!.e / ME[i - 1]!.e - 1; if (r > meRise) { meRise = r; meRiseAt = ME[i]!.t - exitAt; } }
  out.mechPeak_mJ = mePeak;
  out.mechMaxFrameRise = meRise;
  out.mechMaxFrameRiseAt = meRiseAt;
  out.mechAtExitPlus = Object.fromEntries([0, 0.25, 0.5, 1, 1.5].map((d) => [d, +((ME.find((q) => q.t >= exitAt + d)?.e ?? 0) / mePeak).toFixed(4)]));
  out.kePeak_mJ = kePeak * 1e3;
  out.kePeakAfterExit = kePeakAt - exitAt;
  out.keMaxFrameRise = keRise;
  out.eMaxFrameRise = eRise;
  out.eMaxFrameRiseAt = eRiseAt - exitAt;
  out.keBelow1pctAfterExit = ke1pct ? ke1pct.t - exitAt : Infinity;
  out.keAtExitPlus = Object.fromEntries([0.5, 1, 1.5, 2].map((d) => [d, (E.find((r) => r.t >= exitAt + d)?.ke ?? 0) / kePeak]));
  // Bottom ring coherence (in-plane, hoop space) over exit + 0.25 … 2.25 s
  const win = snaps.filter((s) => s.t > exitAt + 0.25 && s.t < exitAt + 2.25);
  const tang: number[][] = BOTTOM.map(() => []), rad: number[][] = BOTTOM.map(() => []);
  let coh2 = 0, inc2 = 0, radDev2 = 0;
  const meanX: number[] = [], meanZ: number[] = [];
  for (const s of win) {
    let mx = 0, mz = 0;
    const dxs: number[] = [], dzs: number[] = [];
    BOTTOM.forEach((k, j) => {
      const q = idx(k);
      const rx = restK[q * 3]! - RIM_LOCAL.x, rz = restK[q * 3 + 2]! - RIM_LOCAL.z;
      const ang = Math.atan2(rz, rx), ex = Math.cos(ang), ez = Math.sin(ang);
      const dx = s.knots[q * 3]! - restK[q * 3]!, dz = s.knots[q * 3 + 2]! - restK[q * 3 + 2]!;
      dxs.push(dx); dzs.push(dz); mx += dx / 10; mz += dz / 10;
      rad[j]!.push(dx * ex + dz * ez);
      tang[j]!.push(-dx * ez + dz * ex);
    });
    meanX.push(mx); meanZ.push(mz);
    coh2 += mx * mx + mz * mz;
    inc2 += dxs.reduce((a, x, j) => a + (x - mx) ** 2 + (dzs[j]! - mz) ** 2, 0) / 10;
    const rr = rad.map((r) => r[r.length - 1]!), rm = rr.reduce((a, b) => a + b) / 10;
    radDev2 += rr.reduce((a, b) => a + (b - rm) ** 2, 0) / 10;
  }
  const corr = (a: number[], b: number[]) => {
    const ma = a.reduce((x, y) => x + y) / a.length, mb = b.reduce((x, y) => x + y) / b.length;
    let sab = 0, saa = 0, sbb = 0;
    for (let i = 0; i < a.length; i++) { sab += (a[i]! - ma) * (b[i]! - mb); saa += (a[i]! - ma) ** 2; sbb += (b[i]! - mb) ** 2; }
    return sab / Math.sqrt(saa * sbb || 1e-300);
  };
  let adj = 0, adjXY = 0;
  for (let j = 0; j < 10; j++) adj += corr(tang[j]!, tang[(j + 1) % 10]!) / 10;
  // Adjacent knots' in-plane displacement correlation (x and z together)
  for (let j = 0; j < 10; j++) {
    const q1 = idx(BOTTOM[j]!), q2 = idx(BOTTOM[(j + 1) % 10]!);
    const a = win.flatMap((s) => [s.knots[q1 * 3]! - restK[q1 * 3]!, s.knots[q1 * 3 + 2]! - restK[q1 * 3 + 2]!]);
    const b = win.flatMap((s) => [s.knots[q2 * 3]! - restK[q2 * 3]!, s.knots[q2 * 3 + 2]! - restK[q2 * 3 + 2]!]);
    adjXY += corr(a, b) / 10;
  }
  // The ring's in-plane motion by angular mode: breathing (n0 radial), twist (n0 tangential),
  // translation (n1), ovalling (n2) and finer (n3–5), RMS over the window (mm).
  const modes = new Float64Array(7);
  for (let w = 0; w < win.length; w++) {
    for (let nmode = 0; nmode <= 5; nmode++) {
      let rc = 0, rs = 0, tc = 0, ts = 0;
      for (let j = 0; j < 10; j++) {
        const th = (2 * Math.PI * j) / 10;
        rc += rad[j]![w]! * Math.cos(nmode * th) / 10; rs += rad[j]![w]! * Math.sin(nmode * th) / 10;
        tc += tang[j]![w]! * Math.cos(nmode * th) / 10; ts += tang[j]![w]! * Math.sin(nmode * th) / 10;
      }
      const k = nmode === 0 || nmode === 5 ? 1 : 2;
      if (nmode === 0) { modes[0] += rc * rc; modes[1] += tc * tc; }
      else modes[nmode + 1] += k * (rc * rc + rs * rs + tc * tc + ts * ts);
    }
  }
  out.ringModes_mm = Object.fromEntries(['breathe', 'twist', 'n1', 'n2', 'n3', 'n4', 'n5'].map((name, i) => [name, +(Math.sqrt(modes[i]! / win.length) * SU_M * 1000).toFixed(2)]));
  out.ringRigidRms_mm = Math.sqrt(coh2 / win.length) * SU_M * 1000;
  out.ringRelativeRms_mm = Math.sqrt(inc2 / win.length) * SU_M * 1000;
  out.ringRigidOverRelative = out.ringRigidRms_mm / out.ringRelativeRms_mm;
  out.ringOutOfRoundRms_mm = Math.sqrt(radDev2 / win.length) * SU_M * 1000;
  out.adjTangentialCorr = adj;
  out.adjInPlaneCorr = adjXY;
  // Spectrum of the ring's mean lateral position (x: screen-lateral; z: towards the camera)
  const spectrum = (sig: number[], fs: number) => {
    // Hann-windowed (a decaying swing cut at the window's edges would otherwise leak power into every frequency).
    const N = sig.length, mean = sig.reduce((a, b) => a + b, 0) / N, x = sig.map((v, i) => (v - mean) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1))));
    const pk: { f: number; p: number }[] = [];
    for (let fq = 0.1; fq <= Math.min(fs / 2, 60); fq += 0.05) {
      let re = 0, im = 0;
      for (let i = 0; i < N; i++) { const w = (2 * Math.PI * fq * i) / fs; re += x[i]! * Math.cos(w); im -= x[i]! * Math.sin(w); }
      pk.push({ f: fq, p: re * re + im * im });
    }
    const top = pk.reduce((a, b) => (b.p > a.p ? b : a));
    const hf = pk.filter((q) => q.f >= 8).reduce((s, q) => s + q.p, 0), lf = pk.filter((q) => q.f < 8).reduce((s, q) => s + q.p, 0);
    return { peakHz: +top.f.toFixed(2), hfOverLf: hf / Math.max(lf, 1e-300), ampl_mm: (4 / N) * Math.sqrt(top.p) * SU_M * 1000 };
  };
  out.swayX = spectrum(meanX, hz);
  out.swayZ = spectrum(meanZ, hz);
  // Late swing at exit + 2 s, knot tilt rate and deviation, strand scale
  let late = 0, tiltRate = 0, tiltRateAt = 0, tiltDev = 0, sMin = Infinity, sMax = 0, tiltDevBottom1 = 0;
  for (let i = 1; i < snaps.length; i++) {
    const s = snaps[i]!, p = snaps[i - 1]!;
    if (s.t >= exitAt + 2) for (let j = 0; j < KNOTS.length; j++) late = Math.max(late, Math.hypot(s.knots[j * 3]! - restK[j * 3]!, s.knots[j * 3 + 1]! - restK[j * 3 + 1]!, s.knots[j * 3 + 2]! - restK[j * 3 + 2]!));
    if (s.t > exitAt) { sMin = Math.min(sMin, s.scaleMin); sMax = Math.max(sMax, s.scaleMax); }
    for (let j = 0; j < KNOTS.length; j++) {
      const ang = (A: Float64Array, B: Float64Array) => Math.acos(Math.min(1, Math.max(-1, A[j * 3]! * B[j * 3]! + A[j * 3 + 1]! * B[j * 3 + 1]! + A[j * 3 + 2]! * B[j * 3 + 2]!))) * DEG;
      if (s.t > exitAt + 0.25) { const r = ang(s.up, p.up) / (s.t - p.t); if (r > tiltRate) { tiltRate = r; tiltRateAt = s.t - exitAt; } }
      if (s.t > exitAt + 1) { tiltDev = Math.max(tiltDev, ang(s.up, restUp)); if (BOTTOM.includes(KNOTS[j]!)) tiltDevBottom1 = Math.max(tiltDevBottom1, ang(s.up, restUp)); }
    }
  }
  out.lateSwingAtExit2_mm = late * SU_M * 1000;
  out.tiltRateAfterExit025_degps = tiltRate;
  out.tiltRateAt = tiltRateAt;
  // Per row: the largest tilt rate after exit + 0.25 s (deg/s) and when.
  out.tiltRateByRow = L.rows.map((row: number[]) => {
    let best = 0, at = 0;
    for (let i = 1; i < snaps.length; i++) {
      const s = snaps[i]!, p = snaps[i - 1]!;
      if (s.t <= exitAt + 0.25) continue;
      for (const k of row) { const j = KNOTS.indexOf(k); const a = Math.acos(Math.min(1, s.up[j * 3]! * p.up[j * 3]! + s.up[j * 3 + 1]! * p.up[j * 3 + 1]! + s.up[j * 3 + 2]! * p.up[j * 3 + 2]!)) * DEG / (s.t - p.t); if (a > best) { best = a; at = s.t - exitAt; } }
    }
    return `${best.toFixed(0)}@${at.toFixed(2)}`;
  });
  out.tiltDevAfterExit1_deg = tiltDev;
  out.strandScaleAfterExit = [sMin, sMax];
  // Whole-run tilt (during the whip) for the record
  let tiltDevAll = 0, tiltRateAll = 0;
  for (let i = 1; i < snaps.length; i++) for (let j = 0; j < KNOTS.length; j++) {
    const s = snaps[i]!, p = snaps[i - 1]!;
    const a = Math.acos(Math.min(1, s.up[j * 3]! * restUp[j * 3]! + s.up[j * 3 + 1]! * restUp[j * 3 + 1]! + s.up[j * 3 + 2]! * restUp[j * 3 + 2]!)) * DEG;
    tiltDevAll = Math.max(tiltDevAll, a);
    tiltRateAll = Math.max(tiltRateAll, Math.acos(Math.min(1, s.up[j * 3]! * p.up[j * 3]! + s.up[j * 3 + 1]! * p.up[j * 3 + 1]! + s.up[j * 3 + 2]! * p.up[j * 3 + 2]!)) * DEG / (s.t - p.t));
  }
  out.tiltDevMax_deg = tiltDevAll;
  out.tiltRateMax_degps = tiltRateAll;
  // Wake, open, gap, lift, crossing proxies
  let maxOpen = 0, minGap = Infinity, lift = 0;
  for (const s of snaps) for (let j = 0; j < KNOTS.length; j++) {
    const x = s.knots[j * 3]! - RIM_LOCAL.x, z = s.knots[j * 3 + 2]! - RIM_LOCAL.z, rx = restK[j * 3]! - RIM_LOCAL.x, rz = restK[j * 3 + 2]! - RIM_LOCAL.z;
    maxOpen = Math.max(maxOpen, Math.hypot(x, z) - Math.hypot(rx, rz));
    minGap = Math.min(minGap, Math.hypot(s.knots[j * 3]! - s.ball.x, s.knots[j * 3 + 1]! - s.ball.y, s.knots[j * 3 + 2]! - s.ball.z) - BALL_R);
    if (s.t > exitAt && BOTTOM.includes(KNOTS[j]!)) lift = Math.max(lift, s.knots[j * 3 + 1]! - restK[j * 3 + 1]!);
  }
  out.maxOpen_su = maxOpen; out.minGap_su = minGap; out.lift_su = lift;
  // Crossing proxies: ring neighbours ≥ 70 %, two rows down ≥ 55 % of their rest distance (drawn)
  let ringMin = Infinity, vertMin = Infinity;
  const dist = (A: Float64Array, a: number, b: number) => Math.hypot(A[a * 3]! - A[b * 3]!, A[a * 3 + 1]! - A[b * 3 + 1]!, A[a * 3 + 2]! - A[b * 3 + 2]!);
  for (const s of snaps) {
    for (const row of L.rows) for (let j = 0; j < 10; j++) { const a = idx(row[j]!), b = idx(row[(j + 1) % 10]!); ringMin = Math.min(ringMin, dist(s.knots, a, b) / dist(restK, a, b)); }
    for (let r = 0; r + 2 < 6; r++) for (const k of L.rows[r]!) {
      const a = idx(k); let best = -1, bd = Infinity;
      for (const k2 of L.rows[r + 2]!) { const d = dist(restK, a, idx(k2)); if (d < bd) { bd = d; best = idx(k2); } }
      vertMin = Math.min(vertMin, dist(s.knots, a, best) / bd);
    }
  }
  out.ringNeighbourMin = ringMin; out.twoRowsMin = vertMin;
  // Hoop
  out.rimMax_deg = Math.max(...snaps.map((s) => s.rim)) * DEG;
  out.rimMin_deg = Math.min(...snaps.map((s) => s.rim)) * DEG;
  out.boardMax_deg = Math.max(...snaps.map((s) => Math.abs(s.board))) * DEG;
  out.hookForceMax_N = Math.max(...snaps.map((s) => s.force));
  let rimQuiet = Infinity;
  for (let i = snaps.length - 1; i >= 0; i--) if (Math.abs(snaps[i]!.rim) * DEG >= 0.05) { rimQuiet = (snaps[i + 1]?.t ?? Infinity) - CONTACT_AT; break; }
  out.rimQuietAfterContact = rimQuiet;
  let stopHits = 0;
  for (let i = 1; i < snaps.length; i++) if (Math.abs(snaps[i]!.rim - RIM_BACKSTOP) < 1e-9 && Math.abs(snaps[i - 1]!.rim - RIM_BACKSTOP) > 1e-9) stopHits++;
  out.rimStopHits = stopHits;
  // Bottom ring mean height over time (the whip), sampled
  out.bottomMeanDy_mm = [0, 0.1, 0.2, 0.3, 0.5, 0.75, 1, 1.5, 2].map((d) => {
    const s = snaps.find((q) => q.t >= exitAt + d);
    if (!s) return null;
    return +((BOTTOM.reduce((a, k) => a + s.knots[idx(k) * 3 + 1]! - restK[idx(k) * 3 + 1]!, 0) / 10) * SU_M * 1000).toFixed(2);
  });
  out.exitAt = exitAt;
  return out;
}

if (args.includes('--series')) {
  // The bottom ring's mean displacement (mm, hoop space) and the ball, every 1/30 s from contact.
  const { snaps } = run(HZ, NET_PASSAGE.exitAt + 2.5);
  const rest = snaps[0]!;
  const idx = (k: number) => KNOTS.indexOf(k);
  let last = -1;
  for (const s of snaps) {
    if (s.t < CONTACT_AT - 0.05 || s.t - last < 1 / 30 - 1e-9) continue;
    last = s.t;
    const m = [0, 1, 2].map((c) => (BOTTOM.reduce((a, k) => a + s.knots[idx(k) * 3 + c]! - rest.knots[idx(k) * 3 + c]!, 0) / 10) * SU_M * 1000);
    const row3 = [0, 1, 2].map((c) => (L.rows[3]!.reduce((a: number, k: number) => a + s.knots[idx(k) * 3 + c]! - rest.knots[idx(k) * 3 + c]!, 0) / 10) * SU_M * 1000);
    console.log(`${(s.t - NET_PASSAGE.exitAt).toFixed(3).padStart(7)}  ring5 x ${m[0]!.toFixed(2).padStart(7)} y ${m[1]!.toFixed(2).padStart(7)} z ${m[2]!.toFixed(2).padStart(7)} | ring3 x ${row3[0]!.toFixed(2).padStart(7)} y ${row3[1]!.toFixed(2).padStart(7)} z ${row3[2]!.toFixed(2).padStart(7)} | ball ${(s.ball.x - RIM_LOCAL.x).toFixed(3)} ${(s.ball.y - RIM_LOCAL.y).toFixed(3)} ${(s.ball.z - RIM_LOCAL.z).toFixed(3)}`);
  }
} else if (args.includes('--det')) {
  // Determinism: drawn knots at the run times every cadence shares (the tail's times included).
  const runs = [60, 90, 120, 144].map((hz) => ({ hz, snaps: run(hz, 4).snaps }));
  const key = (s: Snap) => Math.round(s.run * 1e6);
  const ref = new Map(runs[2]!.snaps.map((s) => [key(s), s]));
  for (const r of runs) {
    let maxD = 0, n = 0;
    for (const s of r.snaps) {
      const q = ref.get(key(s));
      if (!q || Math.abs(q.run - s.run) > 1e-9) continue;
      if (!runs.every((o) => o.snaps.some((x) => Math.abs(x.run - s.run) < 1e-9))) continue;
      n++;
      for (let j = 0; j < s.knots.length; j++) maxD = Math.max(maxD, Math.abs(s.knots[j]! - q.knots[j]!));
    }
    console.log(`${r.hz} Hz vs 120 Hz: ${n} common run times, max knot difference ${maxD.toExponential(2)} su`);
    if (args.includes('--verbose')) for (const s of r.snaps) {
      const q = ref.get(key(s));
      if (!q || Math.abs(q.run - s.run) > 1e-9 || !runs.every((o) => o.snaps.some((x) => Math.abs(x.run - s.run) < 1e-9))) continue;
      let d = 0;
      for (let j = 0; j < s.knots.length; j++) d = Math.max(d, Math.abs(s.knots[j]! - q.knots[j]!));
      console.log(`   run ${s.run.toFixed(4)}  diff ${d.toExponential(2)}`);
    }
  }
} else {
  const r = analyse(HZ);
  if (args.includes('--brief')) {
    const f = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : String(x));
    console.log(`${SET ?? 'default'} | settle ${f(r.settleAfterExit)} | sway x ${r.swayX.peakHz}Hz ${f(r.swayX.ampl_mm)}mm hf ${f(r.swayX.hfOverLf, 3)} z ${r.swayZ.peakHz}Hz ${f(r.swayZ.ampl_mm)}mm | rigid ${f(r.ringRigidRms_mm)} rel ${f(r.ringRelativeRms_mm)} ${JSON.stringify(r.ringModes_mm)} ratio ${f(r.ringRigidOverRelative)} adj ${f(r.adjTangentialCorr)}/${f(r.adjInPlaneCorr)} | KE1% ${f(r.keBelow1pctAfterExit)} mechRise ${f(r.mechMaxFrameRise, 3)}@${f(r.mechMaxFrameRiseAt)} | late ${f(r.lateSwingAtExit2_mm)} | tilt ${f(r.tiltRateAfterExit025_degps, 0)}dps ${f(r.tiltDevAfterExit1_deg)}deg | scale ${f(r.strandScaleAfterExit[0], 3)}-${f(r.strandScaleAfterExit[1], 3)} | open ${f(r.maxOpen_su, 3)} gap ${f(r.minGap_su, 4)} lift ${f(r.lift_su, 3)} | F ${f(r.hookForceMax_N)}N rim ${f(r.rimMax_deg)}/${f(r.rimMin_deg)} quiet ${f(r.rimQuietAfterContact)} | dy ${JSON.stringify(r.bottomMeanDy_mm)}`);
  } else if (args.includes('--json')) console.log(JSON.stringify(r));
  else for (const [k, v] of Object.entries(r)) console.log(k.padEnd(28), typeof v === 'number' ? +v.toPrecision(4) : JSON.stringify(v));
}
void masses; void RELEASE_AT;
