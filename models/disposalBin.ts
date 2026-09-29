import { Box3, type BufferAttribute, CylinderGeometry, LatheGeometry, Matrix4, type Mesh, type Object3D, Quaternion, Shape, ShapeGeometry, Vector2, Vector3 } from 'three';
import { filletPolyline, group, lathe, mergeParts, mesh, roundedBox, type ProfilePoint, withTangents } from './geometry.ts';
import type { ModelContext } from './types.ts';

/**
 * Shared disposal bin (Birthday and Dinner decline): a charcoal powder-coated pedal bin (the
 * classic Danish pedal-bin archetype) with an ink liner bucket, ink foot ring, a butterfly lid (two turned half-dome flaps hinged at the
 * sides, so the open bin stays low in frame) and a coral pedal — the one enamel insert.
 * Sized so the cake (with candles) or the covered dish drops fully below the rim before the
 * lid closes: the disappearance is real occlusion, never a fade.
 */

export const BIN = {
  /** Outer radius at the rim; the body tapers slightly towards the foot. */
  radius: 0.94,
  /** Rim top above the floor. */
  rimTop: 1.3,
  /** Clear opening radius inside the rim roll. */
  opening: 0.89,
  /** Liner floor (the lowest point anything dropped in rests on). */
  floor: 0.1,
  /** Flap hinge offset from the axis (x = ±hingeX at the rim top), axis along z. */
  hingeX: 0.965,
  /** Flap opening angle (each flap rotates about its hinge; 0 closed). ≈ 100°. */
  flapOpen: 1.75,
  /** Pedal position around the foot, from the bin's local +z (radians). */
  pedalAngle: -0.8,
} as const;

/** `bin_lid` groups both flap pivots (`bin_flap_l`, `bin_flap_r`). */
export const BIN_NODES = ['bin_root', 'bin_body', 'bin_lid', 'bin_flap_l', 'bin_flap_r'] as const;

/** Bin bounds in bin_root space with the flaps fully open. */
export const BIN_BOUNDS = new Box3(new Vector3(-1.16, 0, -0.99), new Vector3(1.16, 2.34, 1.0));

/** Rotation.z for each flap at opening fraction k (left lifts with +z, right with −z). */
export function flapAngles(k: number): [number, number] {
  return [BIN.flapOpen * k, -BIN.flapOpen * k];
}

/**
 * Framing samples of the bin with its flaps fully open, taken from the bin's own geometry (every
 * vertex, placed at `position` turned by `yaw`): exact, so the camera fit keeps its clearance
 * over the real flap tops (a hand-modelled flap outline sat 7 cm low). Contact-shadow planes and
 * shadow proxies are skipped. The flaps are restored afterwards.
 */
export function openBinFramePoints(binRoot: Object3D, position: Vector3, yaw: number): Vector3[] {
  const flaps = [binRoot.getObjectByName('bin_flap_l')!, binRoot.getObjectByName('bin_flap_r')!];
  const saved = flaps.map((f) => f.rotation.z);
  const open = flapAngles(1);
  flaps.forEach((f, i) => (f.rotation.z = open[i]!));
  binRoot.updateMatrixWorld(true);
  const place = new Matrix4().compose(position, new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw), new Vector3(1, 1, 1));
  const toBin = binRoot.matrixWorld.clone().invert();
  const m = new Matrix4();
  const v = new Vector3();
  const pts: Vector3[] = [];
  binRoot.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh || mesh.name.endsWith('_shadow') || mesh.userData.shadowProxy) return;
    m.multiplyMatrices(place, toBin).multiply(mesh.matrixWorld);
    const attr = mesh.geometry.getAttribute('position') as BufferAttribute;
    for (let i = 0; i < attr.count; i++) pts.push(v.fromBufferAttribute(attr, i).applyMatrix4(m).clone());
  });
  flaps.forEach((f, i) => (f.rotation.z = saved[i]!));
  binRoot.updateMatrixWorld(true);
  return pts;
}

export function buildDisposalBin(ctx: ModelContext): Object3D {
  const { lib } = ctx;
  const root = group('bin_root');
  const R = BIN.radius, top = BIN.rimTop;

  // Body: outer wall with a gentle taper, rolled rim, short inner collar (steel), one lathe.
  const body = lathe([
    [0, 0.07],
    [0.885, 0.07, 0.02],
    [0.905, 0.1, 0.03],
    [R + 0.012, top - 0.035, 0.03],
    [R, top, 0.018],
    [BIN.opening, top - 0.01, 0.01],
    [BIN.opening - 0.004, top - 0.12, 0.01],
    [0, top - 0.12],
  ], 64, 3);
  mesh('bin_body', body, lib.get('mat_bin'), root);

  // Ink liner bucket: its lip shows just inside the rim; dark interior sells the drop.
  const liner = lathe([
    [0, BIN.floor],
    [BIN.opening - 0.06, BIN.floor, 0.05],
    [BIN.opening - 0.02, top - 0.07, 0.02],
    [BIN.opening - 0.005, top - 0.05, 0.01],
    [BIN.opening - 0.03, top - 0.052, 0.005],
    [BIN.opening - 0.075, BIN.floor + 0.04, 0.05],
    [0, BIN.floor + 0.04],
  ], 48, 2);
  // Liner and foot ring share the ink material: one draw.
  const foot = lathe([[0, 0], [0.88, 0, 0.02], [0.885, 0.075, 0.01], [0, 0.075]], 48, 2);
  mesh('bin_ink', mergeParts([{ geometry: liner }, { geometry: foot }]), lib.get('mat_body_ink'), root);

  // Coral pedal on the foot, turned PEDAL_ANGLE from the bin's front so it shows beside the
  // stand from the shared camera.
  const pedal = mesh('bin_pedal', roundedBox(0.34, 0.05, 0.18, 0.022, 3), lib.get('mat_accent'), root);
  pedal.position.set(Math.sin(BIN.pedalAngle) * (R - 0.01), 0.06, Math.cos(BIN.pedalAngle) * (R - 0.01));
  pedal.rotation.y = BIN.pedalAngle;

  // Butterfly lid: two turned half-dome flaps, each with a cap on its cut face and a knuckle.
  const lid = group('bin_lid', root);
  lid.position.set(0, top, 0);
  const profile: ProfilePoint[] = [[0, -0.012], [R + 0.02, -0.012, 0.008], [R + 0.022, 0.03, 0.012], [R - 0.12, 0.085, 0.14], [0, 0.11]];
  // Fine fillets and 48 segments per half, with analytic tangents: the brushed flaps read as
  // turned metal, not radial wedges (checkpoint 4 review).
  const pts = filletPolyline(profile, 6);
  for (const side of [-1, 1] as const) {
    const flap = group(side < 0 ? 'bin_flap_l' : 'bin_flap_r', lid);
    flap.position.set(side * BIN.hingeX, 0, 0);
    // LatheGeometry places points at (sin φ·r, y, cos φ·r): φ ∈ [π, 2π] is the −x half.
    const half = withTangents(new LatheGeometry(pts, 48, side < 0 ? Math.PI : 0, Math.PI), 'around');
    // Cap on the cut plane (x = 0): the profile mirrored across the axis.
    const shape = new Shape([...pts.map((p) => new Vector2(p.x, p.y)), ...[...pts].reverse().map((p) => new Vector2(-p.x, p.y))]);
    const cap = new ShapeGeometry(shape, 1);
    cap.rotateY(side < 0 ? Math.PI / 2 : -Math.PI / 2);
    withTangents(cap, 'around');
    const knuckle = new CylinderGeometry(0.016, 0.016, 0.14, 12);
    knuckle.rotateX(Math.PI / 2);
    withTangents(knuckle, 'around');
    const g = mergeParts([{ geometry: half }, { geometry: cap }, { geometry: knuckle, position: [side * BIN.hingeX, 0, 0] }]);
    g.translate(-side * BIN.hingeX, 0, 0);
    mesh(side < 0 ? 'bin_flap_l_mesh' : 'bin_flap_r_mesh', g, lib.get('mat_metal_brushed'), flap);
  }

  group('bin_shadow', root).position.set(0, 0.002, 0);
  return root;
}
