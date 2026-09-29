import { CircleGeometry, CylinderGeometry, type Object3D, RingGeometry, Vector3 } from 'three';
import { group, mesh, roundedBox, wire } from './geometry.ts';
import { LID, PLATTER, PLAYER, RECORD, STATUS_MARK, TONEARM, type RecordLabel } from './recordContract.ts';
import type { ModelContext } from './types.ts';

/**
 * Party record player geometry (static parts + named nodes; exported to GLB).
 * STAND-IN: honours every contract dimension in recordPlayer.ts so choreography can be
 * authored; the premium build replaces the construction, never the contract.
 */
export function buildRecordPlayerGeometry(ctx: ModelContext, label: RecordLabel = 'coral'): Object3D {
  const { lib } = ctx;
  const root = group('party_root');
  const flat = -Math.PI / 2;

  const body = mesh('player_body', roundedBox(PLAYER.width, PLAYER.deck, PLAYER.depth, 0.06, 4), lib.get('mat_body'), root);
  body.position.y = PLAYER.deck / 2;
  const band = mesh('player_band', roundedBox(PLAYER.width + 0.004, 0.11, PLAYER.depth + 0.004, 0.03, 3), lib.get('mat_accent'), root);
  band.position.y = 0.075;

  const platter = group('platter', root);
  platter.position.set(PLATTER.x, PLAYER.deck, PLATTER.z);
  mesh('platter_mesh', new CylinderGeometry(PLATTER.radius, PLATTER.radius, PLATTER.height, 72), lib.get('mat_metal_brushed'), platter).position.y = PLATTER.height / 2;
  mesh('platter_spindle', new CylinderGeometry(PLATTER.spindleRadius, PLATTER.spindleRadius, PLATTER.spindleHeight, 16), lib.get('mat_metal'), platter).position.y = PLATTER.height + PLATTER.spindleHeight / 2;

  const record = group('record_authored', root);
  record.position.set(PLATTER.x, PLAYER.deck + PLATTER.height, PLATTER.z);
  const secondary = group('record_secondary', record);
  const disc = mesh('record_mesh', new CylinderGeometry(RECORD.radius, RECORD.radius, RECORD.thickness, 72), lib.get('mat_vinyl'), secondary);
  disc.position.y = RECORD.thickness / 2;
  const top = mesh('record_grooves', new RingGeometry(RECORD.labelRadius, RECORD.radius - 0.004, 72, 1), lib.get('mat_vinyl'), secondary);
  top.rotation.x = flat;
  top.position.y = RECORD.thickness + 0.0005;
  const lab = mesh('record_label', new CircleGeometry(RECORD.labelRadius, 48), lib.get(label === 'coral' ? 'mat_label_coral' : 'mat_label_cobalt'), secondary);
  lab.rotation.x = flat;
  lab.position.y = RECORD.thickness + 0.001;
  group('record_shadow', platter).position.set(0, PLATTER.height + 0.001, 0);

  // Tonearm: fixed pillar + rest, then the yawing pivot and pitching lift.
  mesh('tonearm_base', new CylinderGeometry(0.07, 0.085, TONEARM.pivot.y - PLAYER.deck, 32), lib.get('mat_metal'), root)
    .position.set(TONEARM.pivot.x, (TONEARM.pivot.y + PLAYER.deck) / 2, TONEARM.pivot.z);
  mesh('tonearm_rest', new CylinderGeometry(0.012, 0.014, TONEARM.rest.y - PLAYER.deck, 12), lib.get('mat_metal'), root)
    .position.set(TONEARM.rest.x, (TONEARM.rest.y + PLAYER.deck) / 2, TONEARM.rest.z);
  const pivot = group('tonearm_pivot', root);
  pivot.position.copy(TONEARM.pivot);
  pivot.rotation.y = TONEARM.parkedYaw;
  const lift = group('tonearm_lift', pivot);
  const arm = group('tonearm_mesh', lift);
  mesh('tonearm_tube', wire([new Vector3(0, 0, -0.16), new Vector3(0, 0, TONEARM.length - 0.08), new Vector3(0, -0.01, TONEARM.length - 0.02)], 0.012, 10), lib.get('mat_metal'), arm);
  mesh('tonearm_head', roundedBox(0.05, 0.02, 0.1, 0.006, 2), lib.get('mat_body_ink'), arm).position.set(0, -TONEARM.drop + 0.012, TONEARM.length - 0.03);
  mesh('tonearm_weight', new CylinderGeometry(0.04, 0.04, 0.07, 24), lib.get('mat_metal_dark'), arm).rotation.x = Math.PI / 2;
  arm.children[arm.children.length - 1]!.position.z = -0.17;

  // Dust cover (box shell) on its hinge.
  const hinge = group('lid_hinge', root);
  hinge.position.copy(LID.hinge);
  hinge.rotation.x = LID.open;
  const lid = mesh('lid_mesh', roundedBox(LID.width, LID.height, LID.length, 0.03, 3), lib.get('mat_lid'), hinge);
  lid.position.set(0, LID.height / 2 - 0.02, LID.length / 2);

  const status = mesh('player_status', new CircleGeometry(0.018, 20), lib.get('mat_status'), root);
  status.position.copy(STATUS_MARK);
  group('player_shadow', root).position.set(0, 0.002, 0);
  return root;
}
