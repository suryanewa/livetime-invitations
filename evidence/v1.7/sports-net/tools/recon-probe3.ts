// Third probe: what the skin shows — knot-frame tilt (tails/knots rotate with it), cord length
// ratio (strand bones scale with it), and the rim's ringing; 120 Hz frame steps along accept.
const P = new URL('../../../../', import.meta.url).pathname.replace(/\/$/, '');
const { Vector3, Matrix4, BufferGeometry, BufferAttribute } = await import(P + '/node_modules/three/build/three.module.js');
const { analyseNet, HoopSprings, NetSim, netMeshKind } = await import(P + '/models/sportsNet.ts');
const { createIO, findNode } = await import(P + '/scripts/masters/compose.ts');
const { HOOP_ROOT, RIM_LOCAL, recoilPoint, RIM_BACKSTOP } = await import(P + '/models/sportsContract.ts');
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
const SU_M = 0.36, DEG = 180 / Math.PI;
const sim = new NetSim(L), springs = new HoopSprings();
const upper: number[][] = L.nodes.map(() => []);
for (const [a, b] of L.cords) upper[b].push(a);
const restLen = L.cords.map(([a, b]: [number, number]) => sim.restNode(a).distanceTo(sim.restNode(b)));
const f = newFrame(), dt = 1 / 120;
const toNet = (p: any, out: any) => {
  const o = recoilPoint(RIM_LOCAL, springs.board, springs.rim);
  out.copy(p).sub(HOOP_ROOT).sub(o);
  const a = -(springs.board + springs.rim), c = Math.cos(a), si = Math.sin(a);
  return out.set(out.x, out.y * c - out.z * si, out.y * si + out.z * c);
};
const contact = { center: new Vector3(), previous: new Vector3() };
const exitAt = NET_PASSAGE.exitAt;
const a = new Vector3(), c = new Vector3(), up = new Vector3();
const tiltOf = (i: number) => {
  sim.node(i, a);
  up.set(0, 0, 0);
  for (const u of upper[i]) up.add(sim.node(u, c));
  up.divideScalar(upper[i].length).sub(a).normalize();
  return Math.acos(Math.min(1, Math.max(-1, up.y))) * DEG; // tilt from vertical
};
const restTilt = (i: number) => {
  sim.restNode(i, a);
  up.set(0, 0, 0);
  for (const u of upper[i]) up.add(sim.restNode(u, c));
  up.divideScalar(upper[i].length).sub(a).normalize();
  return Math.acos(up.y) * DEG;
};
const bottom: number[] = L.rows[5];
const rest5 = bottom.map(restTilt);
let prevTilt: number[] | null = null;
const win: { t: number; tiltDev: number; tiltRate: number; minRatio: number; maxRatio: number; slack: number; rim: number }[] = [];
let rimSign = 0, rimCross = 0, rimQuietAt = Infinity, rimStopHits = 0, lastRim = 0;
for (let t = 0; t < REST_AT.accept + 2.5; t += dt) {
  toNet(sampleTrack('accept', t, f).ballPos, contact.previous);
  toNet(sampleTrack('accept', t + dt, f).ballPos, contact.center);
  sim.step(dt, contact);
  springs.step(dt, sim.settled ? 0 : sim.hookTorqueRim, sim.settled ? 0 : sim.hookTorqueBoard);
  const tilts = bottom.map(tiltOf);
  const tiltDev = Math.max(...tilts.map((v, j) => Math.abs(v - rest5[j])));
  const tiltRate = prevTilt ? Math.max(...tilts.map((v, j) => Math.abs(v - prevTilt![j]))) / dt : 0;
  prevTilt = tilts;
  let minRatio = Infinity, maxRatio = 0, slack = 0;
  L.cords.forEach(([x, y]: [number, number], k: number) => {
    const r = sim.node(x, a).distanceTo(sim.node(y, c)) / restLen[k];
    minRatio = Math.min(minRatio, r); maxRatio = Math.max(maxRatio, r);
    if (r < 0.995) slack++;
  });
  const rim = springs.rim;
  const s = Math.sign(rim - 0.0005 * (rim > 0 ? 1 : -1));
  if (t > 1 && rimSign !== 0 && s !== rimSign && s !== 0) rimCross++;
  if (s !== 0) rimSign = s;
  if (t > 1 && Math.abs(rim - RIM_BACKSTOP) < 1e-9 && Math.abs(lastRim - RIM_BACKSTOP) > 1e-9) rimStopHits++;
  lastRim = rim;
  if (t > 1.2 && Math.abs(rim) * DEG < 0.05 && rimQuietAt === Infinity && Math.abs(springs.board) < 1e-3) rimQuietAt = t + dt;
  if (t > 1.2 && Math.abs(rim) * DEG >= 0.05) rimQuietAt = Infinity;
  win.push({ t: t + dt, tiltDev, tiltRate, minRatio, maxRatio, slack, rim });
  if (sim.settled && t > 2) break;
}
const fmt = (x: number, d = 2) => x.toFixed(d).padStart(8);
console.log('   t   maxTiltDev(deg) maxTiltRate(deg/s) cordLen/rest min  max  slack(<99.5%) rim(deg)');
let last = -1;
for (const r of win) {
  const every = r.t < exitAt + 0.4 ? 1 / 30 : 0.25;
  if (r.t - last >= every - 1e-9 && r.t > 0.95) { last = r.t; console.log(fmt(r.t, 3), fmt(r.tiltDev), fmt(r.tiltRate, 0), fmt(r.minRatio, 3), fmt(r.maxRatio, 3), String(r.slack).padStart(6), fmt(r.rim * DEG, 3)); }
}
const w = win.filter((r) => r.t > exitAt + 0.25 && r.t < exitAt + 1.25);
console.log(`0.25–1.25 s after exit: bottom-knot tilt deviation from rest: mean of per-frame max ${(w.reduce((s, r) => s + r.tiltDev, 0) / w.length).toFixed(1)}°, peak ${Math.max(...w.map((r) => r.tiltDev)).toFixed(1)}°; tilt rate peak ${Math.max(...w.map((r) => r.tiltRate)).toFixed(0)}°/s; cords slack (drawn shortened) per frame mean ${(w.reduce((s, r) => s + r.slack, 0) / w.length).toFixed(1)} of 120, shortest ${(Math.min(...w.map((r) => r.minRatio)) * 100).toFixed(1)} % of rest`);
console.log(`rim: zero crossings after contact ${rimCross}, back-stop hits ${rimStopHits}, |rim| < 0.05° for good from t = ${rimQuietAt.toFixed(2)} s (${(rimQuietAt - 0.95).toFixed(2)} s after contact); peak ${(Math.max(...win.map((r) => r.rim)) * DEG).toFixed(2)}°, trough ${(Math.min(...win.map((r) => r.rim)) * DEG).toFixed(2)}° (stop ${(RIM_BACKSTOP * DEG).toFixed(2)}°)`);
