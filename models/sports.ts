import { type BufferAttribute, Float32BufferAttribute, type Material, Matrix4, type Mesh, type MeshStandardMaterial, type Object3D, Quaternion, Vector3 } from 'three';
import { cameraDirection } from '../src/render/camera.ts';
import { ContactShadow } from '../src/render/contactShadow.ts';
import {
  BALL_R, BOARD_PIVOT, NET, NET_BULGE, netBulgeCover, netOffsetWeight, netRestRadius, netRestY, netSnapWeight, POLE, recoilPoint, RIM_LOCAL, SPORTS_BOUNDS, SPORTS_NODES,
  type BallPreset, type NetDeform,
} from './sportsContract.ts';
import { buildSportsGeometry } from './sportsPremium.ts';
import { applyShadowProxies, disposeShadowProxies } from './shadowProxy.ts';
import type { MaterialVariants } from './imported.ts';
import { collectNodes, disposeGeometry, type BuiltModel, type ModelContext } from './types.ts';

export * from './sportsContract.ts';

/**
 * Sports runtime rig over the hierarchy (built or GLB-loaded): contact shadows, the net
 * deformation, the hoop recoil and ball presets.
 */

export interface SportsRig {
  root: Object3D;
  nodes: Record<string, Object3D>;
  shadows: ContactShadow[];
  ballShadow: ContactShadow;
  net: NetDeform;
  recoil: HoopRecoil;
  /** `ball_mesh`'s rest orientation (the master's seam frame); spins compose in front of it. */
  ballRest: Quaternion;
  bounds: typeof SPORTS_BOUNDS;
  setPreset(preset: BallPreset): void;
  dispose(): void;
}

export type SportsModel = SportsRig & BuiltModel;

/**
 * Net deformation on the net's own vertices (net space: y = 0 at the rim, negative downward),
 * driven by a NetPose (`netOpening` in the contract): a bulge that travels down with the made
 * ball, the drag stretch and the rebound snap. Works on any net geometry the model provides:
 * since v1.2 the master net's strands, loops and knots (three meshes under `net`). Every vertex
 * moves by a function of its rest depth and radial direction only, so cords, loops and knots at
 * one place move together and the knots stay on their cords.
 *
 * Per frame the depth-only part of the bulge (the Gaussian cover minus the rest envelope) and the
 * snap weight are tabulated over NET_TABLE rows; each vertex then needs one lookup, one dot
 * product and the soft ramp (78k vertices in well under a millisecond).
 *
 * GLB export quantises positions (normalised Int16 plus a node scale/offset), so the net is
 * first rebuilt as float geometry in net space: dequantised vertices, the node transforms baked
 * in, the net node reset to RIM_LOCAL. Deforming the raw quantised array would wrap and tear.
 */
const NET_TABLE = 512;
export function netDeform(net: Object3D): NetDeform {
  const hoop = net.parent!;
  hoop.updateWorldMatrix(true, true);
  const toHoop = new Matrix4().copy(hoop.matrixWorld).invert();
  const toCamera = cameraDirection().transformDirection(toHoop);
  interface NetMesh { attr: BufferAttribute; base: Float32Array; row: Float32Array; dir: Float32Array }
  const meshes: NetMesh[] = [];
  const v = new Vector3();
  const m4 = new Matrix4();
  net.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    m4.multiplyMatrices(toHoop, m.matrixWorld);
    const src = m.geometry.getAttribute('position') as BufferAttribute;
    const base = new Float32Array(src.count * 3);
    // Per vertex: rest depth as a table coordinate (−1 above the rim: never moves) and the unit
    // radial direction from the rim axis.
    const row = new Float32Array(src.count);
    const dir = new Float32Array(src.count * 2);
    for (let i = 0; i < src.count; i++) {
      v.fromBufferAttribute(src, i).applyMatrix4(m4).sub(RIM_LOCAL);
      base[i * 3] = v.x; base[i * 3 + 1] = v.y; base[i * 3 + 2] = v.z;
      row[i] = v.y < 0 ? Math.min(1, -v.y / NET.depth) * (NET_TABLE - 1) : -1;
      const r = Math.hypot(v.x, v.z) || 1;
      dir[i * 2] = v.x / r; dir[i * 2 + 1] = v.z / r;
    }
    const attr = new Float32BufferAttribute(base.slice(), 3);
    m.geometry.setAttribute('position', attr);
    m.geometry.setAttribute('color', farLayerShade(base, toCamera));
    // Imported rope materials do not use vertex colours by default; the shade needs them.
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
      if (!(mat as Material & { vertexColors: boolean }).vertexColors) {
        (mat as Material & { vertexColors: boolean }).vertexColors = true;
        mat.needsUpdate = true;
      }
    }
    m.geometry.deleteAttribute('normal');
    m.geometry.computeVertexNormals();
    m.frustumCulled = false;
    meshes.push({ attr, base, row, dir });
  });
  // Baked: the net node sits at the rim centre and every mesh under it is untransformed.
  net.traverse((o) => {
    if (o === net) return;
    o.position.set(0, 0, 0);
    o.quaternion.identity();
    o.scale.set(1, 1, 1);
  });
  net.position.copy(RIM_LOCAL);
  net.quaternion.identity();
  net.scale.set(1, 1, 1);

  // Depth tables, rebuilt per deformed frame: H = cover − rest envelope, Q = snap weight; and
  // the offset weight (the ball's drift only pushes rows near it).
  const H = new Float32Array(NET_TABLE), Q = new Float32Array(NET_TABLE), W = new Float32Array(NET_TABLE);
  for (let j = 0; j < NET_TABLE; j++) Q[j] = netSnapWeight(j / (NET_TABLE - 1));
  const { ramp } = NET_BULGE;
  let resting = true;
  return {
    update(pose) {
      if (!pose.active) {
        if (resting) return;
        resting = true;
        for (const { attr, base } of meshes) {
          (attr.array as Float32Array).set(base);
          attr.needsUpdate = true;
        }
        return;
      }
      resting = false;
      const by = netRestY(pose.ball.y, pose.stretch);
      for (let j = 0; j < NET_TABLE; j++) {
        const t = j / (NET_TABLE - 1);
        const dy = -t * NET.depth - by;
        H[j] = netBulgeCover(dy) - netRestRadius(t);
        W[j] = netOffsetWeight(dy);
      }
      const ox = pose.ball.x, oz = pose.ball.z, snap = pose.snap, k = 1 + pose.stretch;
      for (const { attr, base, row, dir } of meshes) {
        const a = attr.array as Float32Array;
        for (let i = 0, n = row.length; i < n; i++) {
          const r = row[i]!;
          if (r < 0) continue;
          const j = r | 0, f = r - j, j1 = j + 1 < NET_TABLE ? j + 1 : j;
          const ux = dir[i * 2]!, uz = dir[i * 2 + 1]!;
          const w = W[j]! + (W[j1]! - W[j]!) * f;
          const x = (ox * ux + oz * uz) * w + H[j]! + (H[j1]! - H[j]!) * f;
          const open = x <= 0 ? 0 : x < ramp ? (x * x) / (2 * ramp) : x - ramp / 2;
          const d = open - snap * (Q[j]! + (Q[j1]! - Q[j]!) * f);
          const i3 = i * 3;
          a[i3] = base[i3]! + ux * d;
          a[i3 + 1] = base[i3 + 1]! * k;
          a[i3 + 2] = base[i3 + 2]! + uz * d;
        }
        attr.needsUpdate = true;
      }
    },
  };
}

/**
 * Hoop recoil on the nodes: the board pitches about its pivot on the arm's back plate, the rim
 * (and the net hanging from its hooks) about its hinge on the bracket plate and with the board.
 * Rest transforms are captured once, so a recoil of 0 restores them exactly.
 */
export interface HoopRecoil {
  set(boardPitch: number, rimPitch: number): void;
}
export function hoopRecoil(backboard: Object3D, rim: Object3D, net: Object3D): HoopRecoil {
  const rest = [backboard, rim, net].map((n) => ({ n, p: n.position.clone(), q: n.quaternion.clone() }));
  const qx = new Quaternion();
  const axis = new Vector3(1, 0, 0);
  const p = new Vector3();
  let last = [0, 0];
  return {
    set(boardPitch, rimPitch) {
      if (boardPitch === last[0] && rimPitch === last[1]) return;
      last = [boardPitch, rimPitch];
      const [b, r, n] = rest as [typeof rest[0], typeof rest[0], typeof rest[0]];
      // Board: about its own origin (the pivot), so only its rotation changes.
      b.n.position.copy(BOARD_PIVOT).add(p.copy(b.p).sub(BOARD_PIVOT).applyAxisAngle(axis, boardPitch));
      b.n.quaternion.copy(qx.setFromAxisAngle(axis, boardPitch)).multiply(b.q);
      for (const c of [r, n]) {
        recoilPoint(c.p, boardPitch, rimPitch, c.n.position);
        c.n.quaternion.copy(qx.setFromAxisAngle(axis, boardPitch + rimPitch)).multiply(c.q);
      }
    },
  };
}

/**
 * The net's far layer, seen through the near one, reads a little darker (as cotton does in
 * shade): without it the two layers merge into a busy crosshatch. Shade is a function of the
 * vertex's side of the rim as seen from the shared camera, so it holds while the net deforms.
 */
export const NET_FAR_SHADE = 0.8;
export function farLayerShade(base: Float32Array, toCamera: Vector3): Float32BufferAttribute {
  const hx = toCamera.x, hz = toCamera.z, hl = Math.hypot(hx, hz);
  const colors = new Float32Array(base.length);
  for (let i = 0; i < base.length; i += 3) {
    const x = base[i]!, z = base[i + 2]!;
    const r = Math.hypot(x, z) || 1;
    const facing = (x * hx + z * hz) / (r * hl);
    const k = Math.min(1, Math.max(0, (facing + 0.35) / 0.7));
    const shade = NET_FAR_SHADE + (1 - NET_FAR_SHADE) * k * k * (3 - 2 * k);
    colors[i] = colors[i + 1] = colors[i + 2] = shade;
  }
  return new Float32BufferAttribute(colors, 3);
}

/**
 * Leather grade: per-channel multipliers (linear) on the master ball's albedo, applied at load to
 * the material colour (baseColorFactor; values above 1 are fine at runtime, though not in a glTF
 * file). The master's scan-matched orange (sRGB 223, 64, 10 median) reads a touch hot against the
 * peach stage under the warm key; this pulls its hue from about 15° towards the v1.1 ball's 21°
 * and lifts the shadow side's warmth, keeping every texel's relative value, so the pebble grain,
 * mottling and black seams are untouched (a multiply maps black to black). The cream variant is
 * tuned in its own albedo (recipes/sports.ts `creamAlbedo`) and only trimmed here.
 */
export const LEATHER_GRADE: Readonly<Record<string, readonly [number, number, number]>> = {
  ball_leather: [0.78, 1.25, 3],
  ball_leather_cream: [1, 1, 1],
};
function gradeLeather(m: Material): void {
  const g = LEATHER_GRADE[m.name];
  const std = m as MeshStandardMaterial;
  if (!g || !std.color || m.userData.leatherGraded) return;
  std.color.setRGB(std.color.r * g[0], std.color.g * g[1], std.color.b * g[2]);
  m.userData.leatherGraded = true;
}

/**
 * `variants`: the GLB's ball presets (KHR_materials_variants, `loadMaterialVariants`): the master
 * ball's orange and cream albedos. Without them (the code-authored lookdev model) presets swap the
 * library's shader balls by name.
 */
export function rigSports(root: Object3D, lib: ModelContext['lib'], preset: BallPreset = 'orange', variants?: MaterialVariants): SportsRig {
  const dir = lib.direction;
  applyShadowProxies(root);
  const nodes = collectNodes(root, SPORTS_NODES);
  const replace = (name: string, shadow: ContactShadow) => {
    const placeholder = root.getObjectByName(name)!;
    shadow.position.copy(placeholder.position);
    placeholder.parent!.add(shadow);
    placeholder.removeFromParent();
    return shadow;
  };
  const ballShadow = replace('ball_shadow', new ContactShadow({
    name: 'ball_shadow', shape: 'round', width: BALL_R * 2, depth: BALL_R * 2, spread: [1.3, 2.2], opacity: dir.shadow.opacity, line: 0.35, color: dir.shadow.color,
  }));
  const hoopShadow = replace('hoop_shadow', new ContactShadow({
    name: 'hoop_shadow', shape: 'round', width: POLE.baseRadius * 2, depth: POLE.baseRadius * 2, spread: [1.3, 1.5], opacity: dir.shadow.opacity * 0.9, line: 0.4, color: dir.shadow.color,
  }));
  nodes.ball_shadow = ballShadow;
  nodes.hoop_shadow = hoopShadow;

  const setPreset = (next: BallPreset) => {
    if (variants?.names.includes(next)) {
      variants.select(next);
      return;
    }
    const want = lib.get(next === 'orange' ? 'mat_ball_orange' : 'mat_ball_cream');
    nodes.ball_mesh!.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh && (m.material as { name?: string }).name?.startsWith('mat_ball_')) m.material = want;
    });
  };
  for (const m of variants?.materials ?? []) gradeLeather(m);
  nodes.ball_mesh!.traverse((o) => {
    const m = (o as Mesh).material;
    if (m) for (const x of Array.isArray(m) ? m : [m]) gradeLeather(x);
  });
  setPreset(preset);
  // The net is rebaked at RIM_LOCAL first, so the recoil captures its final rest transform.
  const net = netDeform(nodes.net!);

  return {
    root,
    nodes,
    shadows: [ballShadow, hoopShadow],
    ballShadow,
    net,
    recoil: hoopRecoil(nodes.backboard!, nodes.rim!, nodes.net!),
    ballRest: nodes.ball_mesh!.quaternion.clone(),
    bounds: SPORTS_BOUNDS.clone(),
    setPreset,
    dispose() {
      ballShadow.dispose();
      hoopShadow.dispose();
      disposeShadowProxies(root);
    },
  };
}

/** Tooling (lookdev, tests in a browser): geometry and rig in one call. */
export function buildSports(ctx: ModelContext, preset: BallPreset = 'orange'): SportsModel {
  const root = buildSportsGeometry(ctx, preset);
  const rig = rigSports(root, ctx.lib, preset);
  return { ...rig, dispose() { rig.dispose(); disposeGeometry(root); } };
}
