// The net's cost per 60 fps frame against the reference kernel (tests/netCost.ts), best of several attempts.
// Run: node --experimental-transform-types --no-warnings evidence/v1.7/sports-net/tools/cost-probe.ts
const P = new URL('../../../../', import.meta.url).pathname.replace(/\/$/, '');
const { Vector3, Matrix4, BufferGeometry, BufferAttribute } = await import(P + '/node_modules/three/build/three.module.js');
const { analyseNet, netMeshKind } = await import(P + '/models/sportsNet.ts');
const { createIO, findNode } = await import(P + '/scripts/masters/compose.ts');
const { RIM_LOCAL } = await import(P + '/models/sportsContract.ts');
const { netCost } = await import(P + '/tests/netCost.ts');
const doc = await createIO().read(P + '/assets/scenes/sports/sports.glb');
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
const L = analyseNet(out)!;
let best = { perFrameMs: Infinity, referenceMs: 0, ratio: Infinity };
for (let a = 0; a < 4; a++) { const r = netCost(L); if (r.ratio < best.ratio) best = r; }
console.log(`net ${best.perFrameMs.toFixed(3)} ms per 60 fps frame; reference ${best.referenceMs.toFixed(3)} ms; ratio ${best.ratio.toFixed(2)} (bound 2)`);
