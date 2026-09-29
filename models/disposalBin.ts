import { Box3, CylinderGeometry, LatheGeometry, type Object3D, Shape, ShapeGeometry, Vector2, Vector3 } from 'three';
import { filletPolyline, group, lathe, mergeParts, mesh, roundedBox, type ProfilePoint } from './geometry.ts';
import type { ModelContext } from './types.ts';

/**
 * Shared disposal bin (Birthday and Dinner decline): a clean brushed-steel pedal bin with an
 * ink liner bucket, ink foot ring, a butterfly lid (two turned half-dome flaps hinged at the
 * sides, so the open bin stays low in frame) and a coral pedal — the one enamel insert.
 * Sized so the cake (with candles) or the covered dish drops fully below the rim before the
 * lid closes: the disappearance is real occlusion, never a fade.
 */

export const BIN = {
  /** Outer radius at the rim; the body tapers slightly towards the foot. */
  radius: 0.9,
  /** Rim top above the floor. */
  rimTop: 1.235,
  /** Clear opening radius inside the rim roll. */
  opening: 0.85,
  /** Liner floor (the lowest point anything dropped in rests on). */
  floor: 0.12,
  /** Flap hinge offset from the axis (x = ±hingeX at the rim top), axis along z. */
  hingeX: 0.925,
  /** Flap opening angle (each flap rotates about its hinge; 0 closed). ≈ 100°. */
  flapOpen: 1.75,
} as const;

/** `bin_lid` groups both flap pivots (`bin_flap_l`, `bin_flap_r`). */
export const BIN_NODES = ['bin_root', 'bin_body', 'bin_lid', 'bin_flap_l', 'bin_flap_r'] as const;

/** Bin bounds in bin_root space with the flaps fully open. */
export const BIN_BOUNDS = new Box3(new Vector3(-1.12, 0, -0.95), new Vector3(1.12, 2.22, 0.98));

/** Rotation.z for each flap at opening fraction k (left lifts with +z, right with −z). */
export function flapAngles(k: number): [number, number] {
  return [BIN.flapOpen * k, -BIN.flapOpen * k];
}

export function buildDisposalBin(ctx: ModelContext): Object3D {
  const { lib } = ctx;
  const root = group('bin_root');
  const R = BIN.radius, top = BIN.rimTop;

  // Body: outer wall with a gentle taper, rolled rim, short inner collar (steel), one lathe.
  const body = lathe([
    [0, 0.07],
    [0.845, 0.07, 0.02],
    [0.865, 0.1, 0.03],
    [R + 0.012, top - 0.035, 0.03],
    [R, top, 0.018],
    [BIN.opening, top - 0.01, 0.01],
    [BIN.opening - 0.004, top - 0.12, 0.01],
    [0, top - 0.12],
  ], 96, 4);
  mesh('bin_body', body, lib.get('mat_metal_brushed'), root);

  // Ink liner bucket: its lip shows just inside the rim; dark interior sells the drop.
  const liner = lathe([
    [0, BIN.floor],
    [BIN.opening - 0.06, BIN.floor, 0.05],
    [BIN.opening - 0.02, top - 0.07, 0.02],
    [BIN.opening - 0.005, top - 0.05, 0.01],
    [BIN.opening - 0.03, top - 0.052, 0.005],
    [BIN.opening - 0.075, BIN.floor + 0.04, 0.05],
    [0, BIN.floor + 0.04],
  ], 72, 3);
  // Liner, foot ring and the two hinge blocks share the ink material: one draw.
  const foot = lathe([[0, 0], [0.84, 0, 0.02], [0.845, 0.075, 0.01], [0, 0.075]], 72, 2);
  mesh('bin_ink', mergeParts([
    { geometry: liner },
    { geometry: foot },
    { geometry: roundedBox(0.07, 0.07, 0.3, 0.02, 2), position: [-(BIN.hingeX + 0.005), top - 0.03, 0] },
    { geometry: roundedBox(0.07, 0.07, 0.3, 0.02, 2), position: [BIN.hingeX + 0.005, top - 0.03, 0] },
  ]), lib.get('mat_body_ink'), root);

  // Coral pedal on the front foot.
  mesh('bin_pedal', roundedBox(0.34, 0.05, 0.16, 0.022, 3), lib.get('mat_accent'), root).position.set(0, 0.06, R - 0.02);

  // Butterfly lid: two turned half-dome flaps, each with a cap on its cut face and a knuckle.
  const lid = group('bin_lid', root);
  lid.position.set(0, top, 0);
  const profile: ProfilePoint[] = [[0, -0.012], [R + 0.02, -0.012, 0.008], [R + 0.022, 0.03, 0.012], [R - 0.12, 0.085, 0.14], [0, 0.11]];
  const pts = filletPolyline(profile, 5);
  for (const side of [-1, 1] as const) {
    const flap = group(side < 0 ? 'bin_flap_l' : 'bin_flap_r', lid);
    flap.position.set(side * BIN.hingeX, 0, 0);
    // LatheGeometry places points at (sin φ·r, y, cos φ·r): φ ∈ [π, 2π] is the −x half.
    const half = new LatheGeometry(pts, 48, side < 0 ? Math.PI : 0, Math.PI);
    // Cap on the cut plane (x = 0): the profile mirrored across the axis.
    const shape = new Shape([...pts.map((p) => new Vector2(p.x, p.y)), ...[...pts].reverse().map((p) => new Vector2(-p.x, p.y))]);
    const cap = new ShapeGeometry(shape, 1);
    cap.rotateY(side < 0 ? Math.PI / 2 : -Math.PI / 2);
    const knuckle = new CylinderGeometry(0.026, 0.026, 0.24, 16);
    knuckle.rotateX(Math.PI / 2);
    const g = mergeParts([{ geometry: half }, { geometry: cap }, { geometry: knuckle, position: [side * BIN.hingeX, 0, 0] }]);
    g.translate(-side * BIN.hingeX, 0, 0);
    mesh(side < 0 ? 'bin_flap_l_mesh' : 'bin_flap_r_mesh', g, lib.get('mat_metal_brushed'), flap);
  }

  group('bin_shadow', root).position.set(0, 0.002, 0);
  return root;
}
