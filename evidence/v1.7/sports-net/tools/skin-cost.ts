// The skin's cost per frame: NetSkin.update (bones from the drawn sim) + the skeleton's bone
// matrices (three.js Skeleton.update, what the renderer does per frame), the net mid-swing.
const P = new URL('../../../../', import.meta.url).pathname.replace(/\/$/, '');
const { Vector3, Matrix4, BufferGeometry, BufferAttribute, Object3D } = await import(P + '/node_modules/three/build/three.module.js');
const { analyseNet, NetSim, NetSkin, netMeshKind } = await import(P + '/models/sportsNet.ts');
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
    const kind = netMeshKind(n.getName()) ?? netMeshKind(n.getParentNode()?.getName() ?? ''); if (kind) out.push({ geometry: g, kind }); } });
const L = analyseNet(out)!;
const sim = new NetSim(L);
const holder = new Object3D();
const skin = new NetSkin(holder, sim, []);
const c = { center: new Vector3(0, -0.3, 0), previous: new Vector3(0, -0.25, 0) };
for (let i = 0; i < 60; i++) { c.previous.copy(c.center); c.center.y = -0.3 - 0.4 * Math.sin(i / 20); sim.step(1 / 60, c); }
let best = Infinity;
for (let r = 0; r < 15; r++) {
  const t0 = performance.now();
  for (let k = 0; k < 200; k++) { skin.update(0.001, 0.004); holder.updateMatrixWorld(true); skin.skeleton.update(); }
  best = Math.min(best, (performance.now() - t0) / 200);
}
console.log(`skin: ${skin.bones.length} bones; update + matrices + skeleton ${best.toFixed(3)} ms per frame`);
