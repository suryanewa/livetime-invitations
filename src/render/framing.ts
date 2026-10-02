import { type BufferAttribute, Matrix4, type Mesh, type Object3D, Vector3 } from 'three';
import { cubicBezier } from '../motion/curves.ts';

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
 * reports (`pathLimited`). Since v1.5 the decline's paths (the carry over the bin) are fitted
 * separately: the rule holds at rest and the camera pulls back for the decline (DECLINE_PULL).
 */
export const HERO_FILL = { height: 0.6, width: 0.75 } as const;
/** Every authored path stays this far (fraction of the half-frame) inside each edge. */
export const PATH_CLEARANCE = 0.04;

/**
 * v1.5 decline pull-back (docs/style-reference.md, "Decline pull-back"; spec revision #39). The
 * real 47 cm bin made the decline's paths (the object carried over a 44.5 cm rim, the open flaps)
 * set the one fixed frame, and shrank the Birthday and Dinner heroes at rest. Since v1.5 those two
 * scenes have two fits per aspect: `rest` (the hero and the host and accept paths; the rule above
 * holds) and `decline` (the hero and every path, as before). The camera sits on the rest fit at
 * host-ready, guest-ready and accepted, and dollies back to the decline fit during the decline
 * (`pulledView` in src/render/camera.ts): it starts at the guest's tap and is complete by
 * DECLINE_PULL.to, before the carry reaches its highest point over the rim; the declined pose is
 * at the decline fit. The bin's entrance waits for the camera (each scene's BIN_DELAY), so it
 * glides into room the camera has already made rather than sweeping across at the rest scale.
 *
 * The window: the scene's own beats bound it. It opens on the tap (nothing could anticipate it)
 * and must be complete as the carried object crests the rim (the cake at 0.65 s, where it stays
 * PATH_CLEARANCE inside the frame only at the full pull). Windows of 0.65 and 0.7 s keep the
 * carried cake and dish 4 % inside the frame on every frame of the move (no ease measured over
 * 0.75 s does); 0.65 s, the one chosen, also clips the Dinner bin's opening flaps least (below). Measured on the
 * real silhouettes at 120 Hz (scripts in docs/style-reference.md, "Decline pull-back").
 */
export const DECLINE_PULL = { from: 0, to: 0.65 } as const;

/**
 * The dolly's ease: slow in, slower out. Zero speed at both ends (C1 with the still camera before
 * and after); it gathers speed over the first third and spends the rest settling, so the camera
 * lands on the decline framing softly while the object is still rising, as a product film's
 * dolly-out does. cubic-bezier(0.3, 0, 0.3, 1), peak speed 2.18 × the mean (3.4 pull/s), chosen
 * from 86 candidates (smootherstep; cubic beziers with x1 0.3–0.55 and x2 0.1–0.4; windows 0.65
 * and 0.7 s): a symmetric smootherstep is calmer at its peak (1.87 ×) but leaves Dinner's opening
 * flaps clipped by the frame's top edge (23 % of the bin's height, 0.23 s), and the front-loaded
 * standard ease (0.4, 0, 0.2, 1) clips them barely less for a much faster middle (2.73 ×); this
 * one clips their tips (8 %, 0.18 s, while the frame is still widening) and never the cake.
 */
export const PULL_EASE = cubicBezier(0.3, 0, 0.3, 1);

/** The pull (0 rest, 1 decline) at time t (s) of the decline: 0 before DECLINE_PULL.from, 1 after .to. */
export function declinePull(t: number): number {
  const u = (t - DECLINE_PULL.from) / (DECLINE_PULL.to - DECLINE_PULL.from);
  return u <= 0 ? 0 : u >= 1 ? 1 : PULL_EASE(u);
}

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
