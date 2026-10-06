// Second probe: rest pre-tension per row, coherence of the bottom ring's motion after the swish,
// substep cadence per frame at odd display rates.
const P = new URL('../../../../', import.meta.url).pathname.replace(/\/$/, '');
const { Vector3, Matrix4, BufferGeometry, BufferAttribute } = await import(P + '/node_modules/three/build/three.module.js');
const { analyseNet, HoopSprings, NET_SIM, NetSim, netMeshKind } = await import(P + '/models/sportsNet.ts');
const { createIO, findNode } = await import(P + '/scripts/masters/compose.ts');
const { HOOP_ROOT, RIM_LOCAL, recoilPoint } = await import(P + '/models/sportsContract.ts');
const { NET_PASSAGE, newFrame, REST_AT, sampleTrack } = await import(P + '/src/scenes/sports/sequences.ts');

const doc = await createIO().read(P + '/assets/scenes/sports/sports.glb');
const hoop = findNode(doc, 'hoop_root'), netNode = findNode(doc, 'net');
const toHoop = new Matrix4().fromArray(hoop.getWorldMatrix()).invert();
const meshes: any[] = [];
netNode.traverse((n: any) => {
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
    if (kind) meshes.push({ geometry: g, kind });
  }
});
const L = analyseNet(meshes)!;
const SU_M = 0.36;
const sim = new NetSim(L);
const S: any = sim;

// 1. Rest pre-tension: cord strain at the hanging rest pose, per lower-node row.
const rowOf = new Map<number, number>();
L.rows.forEach((r: number[], i: number) => r.forEach((k) => rowOf.set(k, i)));
const strains: number[][] = [[], [], [], [], [], []];
let lens: number[] = [];
L.cords.forEach(([a, b]: [number, number]) => {
  const L0 = L.nodes[a].distanceTo(L.nodes[b]);
  const d = sim.restNode(a).distanceTo(sim.restNode(b));
  strains[rowOf.get(b)!].push((d - L0) / L0);
  lens.push(L0);
});
console.log('master cord lengths (cm): min', (Math.min(...lens) * SU_M * 100).toFixed(2), 'max', (Math.max(...lens) * SU_M * 100).toFixed(2), 'mean', (lens.reduce((a, b) => a + b) / lens.length * SU_M * 100).toFixed(2));
strains.forEach((s, r) => console.log(`row ${r}: rest strain mean ${(100 * s.reduce((a, b) => a + b) / s.length).toFixed(2)} % (min ${(100 * Math.min(...s)).toFixed(2)}, max ${(100 * Math.max(...s)).toFixed(2)}) → tension ≈ ${(s.reduce((a, b) => a + b) / s.length / 0.014).toFixed(2)} N per cord at 1.4 %/N`));
// Rest radii of each row vs the master's
L.rows.forEach((row: number[], r: number) => {
  const rm = row.reduce((a, k) => a + Math.hypot(L.nodes[k].x, L.nodes[k].z), 0) / row.length;
  const rr = row.reduce((a, k) => a + Math.hypot(sim.restNode(k).x, sim.restNode(k).z), 0) / row.length;
  const y = row.reduce((a, k) => a + sim.restNode(k).y, 0) / row.length;
  console.log(`row ${r}: master radius ${(rm * SU_M * 100).toFixed(2)} cm → hanging rest ${(rr * SU_M * 100).toFixed(2)} cm, y ${(y * SU_M * 100).toFixed(1)} cm`);
});
const m = 1 / S.invMass[L.rows[5][0]];
console.log(`knot mass ≈ ${(m * 1000).toFixed(3)} g; cord stiffness 1/(0.002 su/N) = 500 N/su = ${(500 / SU_M).toFixed(0)} N/m; single-knot cord mode ≈ ${(Math.sqrt(2 * 500 / SU_M / m) / (2 * Math.PI)).toFixed(0)} Hz; shear spring 1/(0.4 su/N) = ${(2.5 / SU_M).toFixed(1)} N/m → knot-on-diagonals mode ≈ ${(Math.sqrt(2 * 2.5 / SU_M / m) / (2 * Math.PI)).toFixed(1)} Hz; 5 cm pendulum ${(Math.sqrt(9.81 / 0.05) / (2 * Math.PI)).toFixed(2)} Hz; whole-net pendulum (31.5 cm) ${(Math.sqrt(9.81 / 0.315) / (2 * Math.PI)).toFixed(2)} Hz`);

// 2. Coherence of the bottom ring after the swish (120 Hz frame steps).
const run = (hz: number) => {
  const s = new NetSim(L), springs = new HoopSprings();
  const f = newFrame(), dt = 1 / hz;
  const toNet = (p: any, out: any) => {
    const o = recoilPoint(RIM_LOCAL, springs.board, springs.rim);
    out.copy(p).sub(HOOP_ROOT).sub(o);
    const a = -(springs.board + springs.rim), c = Math.cos(a), si = Math.sin(a);
    return out.set(out.x, out.y * c - out.z * si, out.y * si + out.z * c);
  };
  const contact = { center: new Vector3(), previous: new Vector3() };
  const out: { t: number; tang: number[]; rad: number[]; sub: number }[] = [];
  const SS: any = s;
  for (let t = 0; t < REST_AT.accept + 2.5; t += dt) {
    toNet(sampleTrack('accept', t, f).ballPos, contact.previous);
    toNet(sampleTrack('accept', t + dt, f).ballPos, contact.center);
    const pend0 = SS.pending;
    s.step(dt, contact);
    const sub = s.settled ? 0 : Math.round((pend0 + dt - SS.pending) / NET_SIM.step);
    springs.step(dt, s.settled ? 0 : s.hookTorqueRim, s.settled ? 0 : s.hookTorqueBoard);
    const tang: number[] = [], rad: number[] = [];
    const p = new Vector3();
    for (const k of L.rows[5]) {
      s.node(k, p);
      const r0 = s.restNode(k), ang = Math.atan2(-r0.z, r0.x);
      const ex = Math.cos(ang), ez = -Math.sin(ang); // radial unit
      const dx = p.x - r0.x, dz = p.z - r0.z;
      rad.push(dx * ex + dz * ez);
      tang.push(-dx * ez + dz * ex);
    }
    out.push({ t: t + dt, tang, rad, sub });
    if (s.settled && t > 2) break;
  }
  return out;
};
const exitAt = NET_PASSAGE.exitAt;
const rows = run(120);
const win = rows.filter((r) => r.t > exitAt + 0.25 && r.t < exitAt + 2.25);
const corr = (a: number[], b: number[]) => {
  const ma = a.reduce((x, y) => x + y) / a.length, mb = b.reduce((x, y) => x + y) / b.length;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < a.length; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; }
  return sab / Math.sqrt(saa * sbb);
};
const series = (j: number, which: 'tang' | 'rad') => win.map((r) => r[which][j]);
let adj = 0, opp = 0;
for (let j = 0; j < 10; j++) { adj += corr(series(j, 'tang'), series((j + 1) % 10, 'tang')) / 10; opp += corr(series(j, 'tang'), series((j + 5) % 10, 'tang')) / 10; }
console.log(`bottom ring, 0.25–2.25 s after exit: mean correlation of adjacent knots' tangential motion ${adj.toFixed(2)}, of opposite knots ${opp.toFixed(2)} (a rigid sway would give +1 adjacent, −1 opposite)`);
// coherent (rigid translation) vs incoherent part of the ring's in-plane motion
let coh = 0, inc = 0, radDev = 0;
for (const r of win) {
  // rigid translation: mean of displacement vectors
  let mx = 0, mz = 0;
  const vx: number[] = [], vz: number[] = [];
  L.rows[5].forEach((k: number, j: number) => {
    const r0 = sim.restNode(k), ang = Math.atan2(-r0.z, r0.x), ex = Math.cos(ang), ez = -Math.sin(ang);
    const x = r.rad[j] * ex - r.tang[j] * ez, z = r.rad[j] * ez + r.tang[j] * ex;
    vx.push(x); vz.push(z); mx += x / 10; mz += z / 10;
  });
  coh += Math.hypot(mx, mz);
  inc += Math.sqrt(vx.reduce((a, x, j) => a + (x - mx) ** 2 + (vz[j] - mz) ** 2, 0) / 10);
  const rm = r.rad.reduce((a, b) => a + b) / 10;
  radDev += Math.sqrt(r.rad.reduce((a, b) => a + (b - rm) ** 2, 0) / 10);
}
console.log(`ring in-plane motion: rigid sway RMS ${(coh / win.length * SU_M * 1000).toFixed(2)} mm, knot-relative (incoherent) RMS ${(inc / win.length * SU_M * 1000).toFixed(2)} mm, radial deviation (ring out-of-round) RMS ${(radDev / win.length * SU_M * 1000).toFixed(2)} mm`);
// amplitude envelope of a knot's tangential swing
const env = (from: number, to: number) => Math.max(...rows.filter((r) => r.t > from && r.t < to).map((r) => Math.max(...r.tang.map(Math.abs))));
for (const [a, b] of [[0, 0.5], [0.5, 1], [1, 1.5], [1.5, 2], [2, 2.5], [2.5, 3], [3, 3.5], [3.5, 4]]) console.log(`max |tangential| of any bottom knot, ${a}–${b} s after exit: ${(env(exitAt + a, exitAt + b) * SU_M * 1000).toFixed(1)} mm`);
// 3. Substep cadence per frame at odd rates
for (const hz of [60, 90, 120, 144]) {
  const rr = run(hz).filter((r) => r.t > 1.0 && r.t < 1.6);
  const counts = rr.map((r) => r.sub);
  const hist: Record<number, number> = {};
  for (const c of counts) hist[c] = (hist[c] ?? 0) + 1;
  console.log(`${hz} Hz frames: substeps per frame ${JSON.stringify(hist)} (frame = ${(1000 / hz).toFixed(2)} ms = ${(480 / hz).toFixed(2)} substeps)`);
}
