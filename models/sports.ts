import { type BufferAttribute, Float32BufferAttribute, type Material, Matrix4, type Mesh, type Object3D, Quaternion, Vector3 } from 'three';
import { cameraDirection } from '../src/render/camera.ts';
import { ContactShadow } from '../src/render/contactShadow.ts';
import { BALL_R, BOARD_PIVOT, recoilPoint, RIM_LOCAL, SPORTS_BOUNDS, SPORTS_NODES, STAND, type BallPreset } from './sportsContract.ts';
import { analyseNet, HoopSprings, NetSim, NetSkin, netMeshKind } from './sportsNet.ts';
import { buildSportsGeometry } from './sportsPremium.ts';
import { applyShadowProxies, disposeShadowProxies } from './shadowProxy.ts';
import type { MaterialVariants } from './imported.ts';
import { collectNodes, disposeGeometry, type BuiltModel, type ModelContext } from './types.ts';

export * from './sportsContract.ts';
export { HOOP_SPRINGS, NET_SIM } from './sportsNet.ts';

/**
 * Sports runtime rig over the hierarchy (built or GLB-loaded): contact shadows, the simulated
 * net, the hoop recoil and ball presets.
 */

export interface SportsRig {
  root: Object3D;
  nodes: Record<string, Object3D>;
  shadows: ContactShadow[];
  ballShadow: ContactShadow;
  /** The simulated net (null for a net without the master's knotted lattice: static). */
  net: SportsNet | null;
  /** The rim and board springs the net's pull drives. */
  springs: HoopSprings;
  recoil: HoopRecoil;
  /** `ball_mesh`'s rest orientation (the master's seam frame); spins compose in front of it. */
  ballRest: Quaternion;
  bounds: typeof SPORTS_BOUNDS;
  setPreset(preset: BallPreset): void;
  dispose(): void;
}

export type SportsModel = SportsRig & BuiltModel;

/**
 * The net, rebaked in net space and driven by the cord simulation (`sportsNet.ts`).
 *
 * GLB export quantises positions (normalised Int16 plus a node scale/offset), so the net is first
 * rebuilt as float geometry in net space: dequantised vertices, the node transforms baked in, the
 * net node reset to RIM_LOCAL (origin at the rim centre). Then the lattice is read back from the
 * master's components, the strands and knots become skinned meshes and the simulation drives
 * their bones. Without the master's knotted net (the v1.1 lookdev net) the net stays static.
 */
export interface SportsNet {
  sim: NetSim;
  skin: NetSkin;
}
export function rigNet(net: Object3D): SportsNet | null {
  const hoop = net.parent!;
  hoop.updateWorldMatrix(true, true);
  const toHoop = new Matrix4().copy(hoop.matrixWorld).invert();
  const toCamera = cameraDirection().transformDirection(toHoop);
  const v = new Vector3();
  const m4 = new Matrix4();
  const meshes: Mesh[] = [];
  net.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    m4.multiplyMatrices(toHoop, m.matrixWorld);
    const src = m.geometry.getAttribute('position') as BufferAttribute;
    const base = new Float32Array(src.count * 3);
    for (let i = 0; i < src.count; i++) {
      v.fromBufferAttribute(src, i).applyMatrix4(m4).sub(RIM_LOCAL);
      base[i * 3] = v.x; base[i * 3 + 1] = v.y; base[i * 3 + 2] = v.z;
    }
    m.geometry.setAttribute('position', new Float32BufferAttribute(base, 3));
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
    meshes.push(m);
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
  const kinds = meshes.map((m) => ({ geometry: m.geometry, kind: netMeshKind(m.name || m.parent?.name || '') })).filter((k) => k.kind) as Parameters<typeof analyseNet>[0];
  const lattice = analyseNet(kinds);
  if (!lattice) return null;
  const sim = new NetSim(lattice);
  const skin = new NetSkin(net, sim, meshes.filter((m) => lattice.binding.has(m.geometry)));
  return { sim, skin };
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
  // The base is a rounded slab: a rectangular blob under its footprint.
  const hoopShadow = replace('hoop_shadow', new ContactShadow({
    name: 'hoop_shadow', shape: 'rect', width: STAND.base.halfWidth * 2, depth: STAND.base.front - STAND.base.back, spread: [1.15, 1.12], opacity: dir.shadow.opacity * 0.9, line: 0.4, color: dir.shadow.color,
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
  // The ball's leather renders as the master authored it (studio pass v1.3 removed v1.2's
  // LEATHER_GRADE colour multiply, a compensation for the v1.1 peach stage).
  setPreset(preset);
  // The net is rebaked at RIM_LOCAL first, so the recoil captures its final rest transform.
  const net = rigNet(nodes.net!);

  return {
    root,
    nodes,
    shadows: [ballShadow, hoopShadow],
    ballShadow,
    net,
    springs: new HoopSprings(),
    recoil: hoopRecoil(nodes.backboard!, nodes.rim!, nodes.net!),
    ballRest: nodes.ball_mesh!.quaternion.clone(),
    bounds: SPORTS_BOUNDS.clone(),
    setPreset,
    dispose() {
      ballShadow.dispose();
      hoopShadow.dispose();
      net?.skin.dispose();
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
