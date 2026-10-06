const P = process.argv[2];
const { Vector3, Matrix4, BufferGeometry, BufferAttribute } = await import(P + '/node_modules/three/build/three.module.js');
const NETMOD = await import(P + '/models/sportsNet.ts');
const { createIO, findNode } = await import(P + '/scripts/masters/compose.ts');
const { RIM_LOCAL } = await import(P + '/models/sportsContract.ts');
const doc = await createIO().read(P + '/assets/scenes/sports/sports.glb');
const hoop = findNode(doc, 'hoop_root'), net = findNode(doc, 'net');
const toHoop = new Matrix4().fromArray(hoop.getWorldMatrix()).invert();
const out: any[] = [];
net.traverse((n: any) => { const m = n.getMesh(); if (!m) return; const mat = new Matrix4().multiplyMatrices(toHoop, new Matrix4().fromArray(n.getWorldMatrix()));
  for (const prim of m.listPrimitives()) { const p = prim.getAttribute('POSITION')!; const arr = new Float32Array(p.getCount() * 3), e = [0, 0, 0], v = new Vector3();
    for (let i = 0; i < p.getCount(); i++) { p.getElement(i, e); v.set(e[0], e[1], e[2]).applyMatrix4(mat).sub(RIM_LOCAL).toArray(arr, i * 3); }
    const g = new BufferGeometry(); g.setAttribute('position', new BufferAttribute(arr, 3)); const idx = prim.getIndices(); if (idx) g.setIndex(new BufferAttribute(Uint32Array.from(idx.getArray()!), 1));
    const kind = NETMOD.netMeshKind(n.getName()) ?? NETMOD.netMeshKind(n.getParentNode()?.getName() ?? ''); if (kind) out.push({ geometry: g, kind }); } });
let t0 = performance.now(); const L = NETMOD.analyseNet(out)!; const ta = performance.now() - t0;
let best = Infinity; for (let i = 0; i < 5; i++) { t0 = performance.now(); new NETMOD.NetSim(L); best = Math.min(best, performance.now() - t0); }
console.log(`analyseNet ${ta.toFixed(0)} ms; NetSim (the rest relaxation) best of 5: ${best.toFixed(0)} ms`);
