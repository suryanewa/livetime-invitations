// Read-only probe of the Sports net simulation (models/sportsNet.ts) along the accept track.
// Run: node --experimental-transform-types net-probe.ts [stepHz]
const P = new URL('../../../../', import.meta.url).pathname.replace(/\/$/, '');
const { Vector3, Matrix4, BufferGeometry, BufferAttribute } = await import(P + '/node_modules/three/build/three.module.js');
const { analyseNet, HoopSprings, NET_SIM, NetSim, netMeshKind } = await import(P + '/models/sportsNet.ts');
const { createIO, findNode } = await import(P + '/scripts/masters/compose.ts');
const { HOOP_ROOT, RIM_LOCAL, recoilPoint, BALL_R } = await import(P + '/models/sportsContract.ts');
const { CONTACT_AT, NET_PASSAGE, newFrame, REST_AT, sampleTrack } = await import(P + '/src/scenes/sports/sequences.ts');

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
const lattice = analyseNet(netMeshes(doc))!;
const stepHz = Number(process.argv[2] ?? 120);
const dt = 1 / stepHz;
const sim = new NetSim(lattice), springs = new HoopSprings();
const f = newFrame();
const toNet = (p: any, out: any) => {
  const o = recoilPoint(RIM_LOCAL, springs.board, springs.rim);
  out.copy(p).sub(HOOP_ROOT).sub(o);
  const a = -(springs.board + springs.rim), c = Math.cos(a), s = Math.sin(a);
  return out.set(out.x, out.y * c - out.z * s, out.y * s + out.z * c);
};
const S: any = sim;
const h = NET_SIM.step;
const n = sim.n;
const invMass: Float64Array = S.invMass;
const bottom: number[] = lattice.rows[5], top: number[] = lattice.rows[0];
const exitAt: number = NET_PASSAGE.exitAt;
const contact = { center: new Vector3(), previous: new Vector3() };
const p = new Vector3();

const rows: { t: number; ke: number; vmax: number; vrms: number; dmax: number; apart: number; strainMax: number; bY: number; bR: number; bX: number; kX: number; kY: number; rim: number }[] = [];
const kProbe = bottom[0];
for (let t = 0; t < REST_AT.accept + 2.5; t += dt) {
  toNet(sampleTrack('accept', t, f).ballPos, contact.previous);
  toNet(sampleTrack('accept', t + dt, f).ballPos, contact.center);
  sim.step(dt, contact);
  springs.step(dt, sim.settled ? 0 : sim.hookTorqueRim, sim.settled ? 0 : sim.hookTorqueBoard);
  let ke = 0, vmax = 0, v2 = 0, dmax = 0;
  for (let i = 0; i < n; i++) {
    if (invMass[i] === 0) continue;
    const vx = (sim.x[i * 3] - sim.prev[i * 3]) / h, vy = (sim.x[i * 3 + 1] - sim.prev[i * 3 + 1]) / h, vz = (sim.x[i * 3 + 2] - sim.prev[i * 3 + 2]) / h;
    const vv = vx * vx + vy * vy + vz * vz;
    ke += 0.5 * (1 / invMass[i]) * vv; // kg·su²/s²
    vmax = Math.max(vmax, Math.sqrt(vv));
    v2 += vv;
    for (let k = 0; k < 3; k++) dmax = Math.max(dmax, Math.abs(sim.x[i * 3 + k] - sim.rest[i * 3 + k]));
  }
  let apart = 0, strainMax = 0;
  for (let c = 0; c < S.ca.length; c++) {
    const a = S.ca[c], b = S.cb[c];
    const d = Math.hypot(sim.x[b * 3] - sim.x[a * 3], sim.x[b * 3 + 1] - sim.x[a * 3 + 1], sim.x[b * 3 + 2] - sim.x[a * 3 + 2]);
    if (S.mode[c] === 2 && d <= S.cl[c] + 1e-6) apart++;
    if (S.mode[c] === 1) strainMax = Math.max(strainMax, (d - S.cl[c]) / S.cl[c]);
  }
  let bY = 0, bR = 0, bX = 0;
  for (const k of bottom) { sim.node(k, p); bY += p.y - sim.restNode(k).y; bR += Math.hypot(p.x, p.z) - Math.hypot(sim.restNode(k).x, sim.restNode(k).z); bX += p.x; }
  sim.node(kProbe, p);
  rows.push({ t: t + dt, ke, vmax, vrms: Math.sqrt(v2 / 60), dmax, apart, strainMax, bY: bY / 10, bR: bR / 10, bX: bX / 10, kX: p.x - sim.restNode(kProbe).x, kY: p.y - sim.restNode(kProbe).y, rim: springs.rim });
  if (sim.settled && t > CONTACT_AT + 0.5) { console.log(`settled at t=${(t + dt).toFixed(3)} (${(t + dt - exitAt).toFixed(2)} s after exit; contact ${CONTACT_AT}, exit ${exitAt.toFixed(3)})`); break; }
}
const SU_M = 0.36;
const fmt = (x: number, d = 4) => x.toFixed(d).padStart(9);
console.log(`step ${stepHz} Hz; n=${n}; constraints=${S.ca.length} (cords ${[...S.mode].filter((m: number) => m === 1).length}, springs ${[...S.mode].filter((m: number) => m === 0).length}, apart ${[...S.mode].filter((m: number) => m === 2).length})`);
console.log('invMass range', Math.min(...invMass.filter((w: number) => w > 0)).toFixed(0), Math.max(...invMass).toFixed(0), ' alpha_cord/h2 =', (S.cc[0] / (h * h)).toFixed(1), ' alpha_spring/h2 =', (NET_SIM.shearCompliance * SU_M / (h * h)).toFixed(0));
console.log('   t      KE(mJ)   vmax(m/s) vrms(m/s)  dmax(cm)  apart strainMax%  bottomY(cm) bottomR(cm) knotX(cm) knotY(cm) rim(deg)');
let last = -1;
for (const r of rows) {
  const every = r.t < exitAt + 0.3 ? 1 / 60 : 0.1;
  if (r.t - last >= every - 1e-9 && r.t > CONTACT_AT - 0.05) {
    last = r.t;
    console.log(fmt(r.t, 3), fmt(r.ke * SU_M * SU_M * 1000, 3), fmt(r.vmax * SU_M, 3), fmt(r.vrms * SU_M, 3), fmt(r.dmax * SU_M * 100, 2), String(r.apart).padStart(6), fmt(r.strainMax * 100, 2), fmt(r.bY * SU_M * 100, 2), fmt(r.bR * SU_M * 100, 2), fmt(r.kX * SU_M * 100, 2), fmt(r.kY * SU_M * 100, 2), fmt(r.rim * 180 / Math.PI, 3));
  }
}
// Spectrum of the probe knot's displacement and of the bottom-ring mean height after the exit.
function spectrum(name: string, sig: number[], fs: number) {
  const N = sig.length;
  const mean = sig.reduce((a, b) => a + b, 0) / N;
  const x = sig.map((v) => v - mean);
  const peaks: { f: number; a: number }[] = [];
  const maxF = Math.min(fs / 2, 240);
  for (let fq = 0.5; fq <= maxF; fq += 0.5) {
    let re = 0, im = 0;
    for (let i = 0; i < N; i++) { const w = 2 * Math.PI * fq * i / fs; re += x[i] * Math.cos(w); im -= x[i] * Math.sin(w); }
    peaks.push({ f: fq, a: (2 / N) * Math.hypot(re, im) });
  }
  const top = [...peaks].sort((a, b) => b.a - a.a).slice(0, 6);
  const hf = peaks.filter((q) => q.f >= 8).reduce((s, q) => s + q.a * q.a, 0), lf = peaks.filter((q) => q.f < 8).reduce((s, q) => s + q.a * q.a, 0);
  console.log(`${name}: top peaks ` + top.map((q) => `${q.f} Hz ${(q.a * SU_M * 1000).toFixed(2)} mm`).join(', ') + `; power ≥8 Hz / <8 Hz = ${(hf / Math.max(lf, 1e-30)).toFixed(3)}`);
}
const win = rows.filter((r) => r.t > exitAt + 0.25 && r.t < exitAt + 2.25);
spectrum('knot x (0.25–2.25 s after exit)', win.map((r) => r.kX), stepHz);
spectrum('knot y', win.map((r) => r.kY), stepHz);
spectrum('bottom ring mean y', win.map((r) => r.bY), stepHz);
spectrum('bottom ring mean x (sway)', win.map((r) => r.bX), stepHz);
// Frame-to-frame jerk as a viewer sees it: second difference of the probe knot's position.
let jerk = 0, jerkN = 0;
for (let i = 2; i < win.length; i++) { const a = win[i].kX - 2 * win[i - 1].kX + win[i - 2].kX; jerk += Math.abs(a); jerkN++; }
console.log(`mean |second difference| of knot x per step: ${(jerk / jerkN * SU_M * 1000).toFixed(3)} mm`);
// Decay: KE e-folding time after the exit.
const e0 = rows.find((r) => r.t > exitAt + 0.3)!, e1 = rows.find((r) => r.t > exitAt + 1.3)!;
console.log(`KE at exit+0.3: ${(e0.ke * SU_M * SU_M * 1e3).toFixed(4)} mJ; at exit+1.3: ${(e1.ke * SU_M * SU_M * 1e3).toFixed(4)} mJ; ratio ${(e1.ke / e0.ke).toFixed(3)} (pure drag 1/s would give e^-2 = 0.135)`);
