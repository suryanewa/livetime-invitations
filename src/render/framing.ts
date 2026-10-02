import { type BufferAttribute, Matrix4, type Mesh, type Object3D, Vector3 } from 'three';

/**
 * v1.4 framing rule (one photographer for all five scenes).
 *
 * Every scene is shot through the same lens (PERSPECTIVE_FOV) from the same azimuth and elevation
 * (CAMERA_ANGLES). What used to vary per scene was the distance: the camera backed off until every
 * authored path fitted, so a scene with a long carry (the bin) showed its object small and a scene
 * with none showed it large. Since v1.4 the distance is set by the **hero** instead: the objects on
 * stage at guest-ready (the turntable; the cake on its stand; the hoop on its stand with the ball;
 * the cloche on its plate; the badge on its hardware with the reader), seen as their real
 * silhouette. The hero's projected height fills HERO_FILL.height of the frame height, unless its
 * width would then pass HERO_FILL.width of the frame width (a wide, low object: the covered plate),
 * in which case the width binds. Across, the hero sits centred, and the frame only slides (never
 * zooms) to keep every authored path inside PATH_CLEARANCE of the edges; up and down the frame
 * centres the whole action (the hero and every path), so a carry that rises above the hero keeps
 * its headroom. Only if a path cannot fit at that size does the camera back off, which the fit
 * reports (`pathLimited`): Dinner, whose open bin stands behind the dish (the recorded disposal
 * exception).
 */
export const HERO_FILL = { height: 0.6, width: 0.75 } as const;
/** Every authored path stays this far (fraction of the half-frame) inside each edge. */
export const PATH_CLEARANCE = 0.04;

/**
 * Silhouette samples of the visible meshes under `root` (in `root`'s space), as posed now: every
 * vertex of small meshes, a stride through large ones (about `perMesh` points each, the mesh's own
 * extreme vertices always kept). Contact shadows (`*_shadow` subtrees), shadow proxies and hidden
 * subtrees are skipped; `exclude` drops whole subtrees by node (e.g. the lanyard strands that leave the frame).
 */
export function silhouettePoints(root: Object3D, exclude: (o: Object3D) => boolean = () => false, perMesh = 1500): Vector3[] {
  root.updateMatrixWorld(true);
  const toRoot = new Matrix4().copy(root.matrixWorld).invert();
  const m = new Matrix4();
  const v = new Vector3();
  const pts: Vector3[] = [];
  const visit = (o: Object3D) => {
    // Contact shadows (`<x>_shadow` groups, their `_line` layers) and shadow proxies are not the object.
    if (!o.visible || exclude(o) || /_shadow(_|$)/.test(o.name) || o.userData.shadowProxy) return;
    const mesh = o as Mesh;
    if (mesh.isMesh) {
      const attr = mesh.geometry.getAttribute('position') as BufferAttribute | undefined;
      if (attr) {
        m.multiplyMatrices(toRoot, mesh.matrixWorld);
        const stride = Math.max(1, Math.floor(attr.count / perMesh));
        // Extreme vertices per local axis, so a stride never shaves a silhouette edge.
        const ext = new Set<number>();
        const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity], loI = [0, 0, 0], hiI = [0, 0, 0];
        for (let i = 0; i < attr.count; i++) {
          for (let k = 0; k < 3; k++) {
            const c = attr.getComponent(i, k);
            if (c < lo[k]!) { lo[k] = c; loI[k] = i; }
            if (c > hi[k]!) { hi[k] = c; hiI[k] = i; }
          }
        }
        for (const i of [...loI, ...hiI]) ext.add(i);
        for (let i = 0; i < attr.count; i += stride) ext.add(i);
        for (const i of ext) pts.push(v.fromBufferAttribute(attr, i).applyMatrix4(m).clone());
      }
    }
    for (const c of o.children) visit(c);
  };
  visit(root);
  return pts;
}
