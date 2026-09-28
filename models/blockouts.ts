import { Box3, CylinderGeometry, SphereGeometry, TorusGeometry, Vector3 } from 'three';
import { ContactShadow } from '../src/render/contactShadow.ts';
import { cylinderBand, group, inlayPlate, lathe, mesh, roundedBox, wire } from './geometry.ts';
import { disposeGeometry, type BuiltModel, type ModelContext } from './types.ts';

/**
 * Visual-study blockouts (Visual Study artifact 2). Rough silhouettes rendered with the
 * proposed common materials to test family coherence — not finished production models.
 */

function finish(root: ReturnType<typeof group>, shadows: ContactShadow[], bounds: Box3): BuiltModel {
  shadows.forEach((s) => root.add(s));
  return { root, nodes: {}, shadows, bounds, dispose: () => disposeGeometry(root) };
}

export function buildRecordPlayerBlockout({ lib }: ModelContext): BuiltModel {
  const dir = lib.direction;
  const enamel = dir.signature.kind === 'perforation';
  const r = enamel ? 0.13 : 0.07;
  const root = group('party_blockout');
  const W = 2.1, Hh = 0.34, Dd = 1.5;
  mesh('player_body', roundedBox(W, Hh, Dd, r, 5), lib.get(enamel ? 'mat_accent' : 'mat_body'), root).position.y = Hh / 2;
  const face = mesh('player_signature', inlayPlate(W - 0.5, enamel ? 0.1 : 0.16, 0.006, 0.03, enamel ? 0.1 : 0.2), lib.get(enamel ? 'mat_signature' : 'mat_signature'), root);
  face.position.set(-0.1, Hh / 2, Dd / 2);
  const platter = mesh('platter', new CylinderGeometry(0.64, 0.64, 0.05, 64), lib.get(enamel ? 'mat_body_ink' : 'mat_metal'), root);
  platter.position.set(-0.3, Hh + 0.025, 0.02);
  const record = mesh('record', new CylinderGeometry(0.6, 0.6, 0.02, 64), lib.get('mat_vinyl'), root);
  record.position.set(-0.3, Hh + 0.06, 0.02);
  const label = mesh('record_label', new CylinderGeometry(0.2, 0.2, 0.024, 48), lib.get('mat_label_coral'), root);
  label.position.copy(record.position);
  const armBase = mesh('tonearm_pivot', new CylinderGeometry(0.1, 0.12, 0.08, 32), lib.get(enamel ? 'mat_body' : 'mat_metal'), root);
  armBase.position.set(0.68, Hh + 0.04, -0.42);
  mesh('tonearm', wire([new Vector3(0.68, Hh + 0.14, -0.42), new Vector3(0.7, Hh + 0.14, 0.1), new Vector3(0.52, Hh + 0.12, 0.42)], 0.018), lib.get(enamel ? 'mat_body_ink' : 'mat_metal'), root);
  mesh('knob', new CylinderGeometry(0.07, 0.07, 0.05, 32), lib.get(enamel ? 'mat_insert_warm' : 'mat_anodized'), root).position.set(0.78, Hh + 0.025, 0.5);
  const hinge = group('lid_hinge', root);
  hinge.position.set(0, Hh + 0.02, -Dd / 2 + 0.02);
  hinge.rotation.x = -1.2;
  const lid = mesh('lid', roundedBox(W - 0.02, 0.05, Dd - 0.04, 0.025, 3), lib.get(enamel ? 'mat_body' : 'mat_body_alt'), hinge);
  lid.position.z = (Dd - 0.04) / 2;
  const s = new ContactShadow({ name: 'shadow', shape: 'rect', width: W * 1.12, depth: Dd * 1.15, opacity: dir.shadow.opacity, color: dir.shadow.color });
  return finish(root, [s], new Box3(new Vector3(-W / 2, 0, -Dd / 2 - 0.2), new Vector3(W / 2, 1.8, Dd / 2)));
}

export function buildBasketballBlockout({ lib }: ModelContext): BuiltModel {
  const dir = lib.direction;
  const enamel = dir.signature.kind === 'perforation';
  const root = group('sports_blockout');
  const ball = group('ball', root);
  const R = 0.4 * dir.geometry.fullness;
  ball.position.set(-0.55, R, 0.5);
  mesh('ball_mesh', new SphereGeometry(R, 48, 32), lib.get('mat_ball_orange'), ball);
  const seam = lib.get('mat_ball_seam');
  const t = 0.009;
  mesh('seam_a', new TorusGeometry(R + 0.001, t, 6, 96), seam, ball);
  mesh('seam_b', new TorusGeometry(R + 0.001, t, 6, 96), seam, ball).rotation.y = Math.PI / 2;
  const c1 = mesh('seam_c', new TorusGeometry(R * 0.72, t, 6, 96), seam, ball);
  c1.rotation.y = Math.PI / 2; c1.position.x = R * 0.69;
  const c2 = mesh('seam_d', new TorusGeometry(R * 0.72, t, 6, 96), seam, ball);
  c2.rotation.y = Math.PI / 2; c2.position.x = -R * 0.69;
  ball.rotation.set(0.4, 0.5, 0.2);

  const hoop = group('hoop_root', root);
  hoop.position.set(0.55, 0, -0.45);
  const pole = mesh('hoop_support', new CylinderGeometry(0.06, 0.07, 2.2, 32), lib.get(enamel ? 'mat_body_ink' : 'mat_body'), hoop);
  pole.position.set(0, 1.1, -0.12);
  const poleBand = mesh('hoop_signature', cylinderBand(0.066, 0.42, enamel ? 0.1 : 0.2, 48), lib.get(enamel ? 'mat_signature' : 'mat_signature'), hoop);
  poleBand.position.set(0, 0.5, -0.12);
  mesh('hoop_base', lathe([[0, 0], [0.34, 0, 0.02], [0.34, 0.06, 0.03], [0, 0.06]], 48), lib.get(enamel ? 'mat_body_ink' : 'mat_metal_dark'), hoop);
  const board = mesh('backboard', roundedBox(1.25, 0.84, 0.06, enamel ? 0.1 : 0.05, 4), lib.get(enamel ? 'mat_body' : 'mat_body'), hoop);
  board.position.set(0, 2.1, 0);
  const frame = mesh('backboard_box', roundedBox(0.42, 0.32, 0.066, 0.02, 2), lib.get(enamel ? 'mat_accent' : 'mat_body_ink'), hoop);
  frame.position.set(0, 1.93, 0.003);
  frame.scale.set(1, 1, 1);
  const rim = mesh('rim', new TorusGeometry(0.25, 0.022, 12, 64), lib.get(enamel ? 'mat_accent' : 'mat_anodized'), hoop);
  rim.rotation.x = Math.PI / 2;
  rim.position.set(0, 1.78, 0.3);
  const net = mesh('net', lathe([[0.25, 0], [0.2, -0.22, 0.05], [0.15, -0.34]], 32, 3), lib.get('mat_net'), hoop);
  net.position.copy(rim.position);
  const s1 = new ContactShadow({ name: 'ball_shadow', width: R * 2.6, depth: R * 2.6, opacity: dir.shadow.opacity, color: dir.shadow.color });
  s1.position.set(ball.position.x, 0.002, ball.position.z);
  const s2 = new ContactShadow({ name: 'hoop_shadow', width: 0.9, depth: 0.9, opacity: dir.shadow.opacity * 0.9, color: dir.shadow.color });
  s2.position.set(hoop.position.x, 0.002, hoop.position.z - 0.12);
  return finish(root, [s1, s2], new Box3(new Vector3(-1.0, 0, -0.9), new Vector3(1.2, 2.55, 0.9)));
}

export function buildDishBlockout({ lib }: ModelContext): BuiltModel {
  const dir = lib.direction;
  const enamel = dir.signature.kind === 'perforation';
  const root = group('dinner_blockout');
  mesh('plate', lathe([[0, 0], [0.62, 0, 0.02], [0.72, 0.05, 0.04], [1.08, 0.1, 0.03], [1.1, 0.13, 0.015], [1.04, 0.13, 0.02], [0.7, 0.085, 0.05], [0, 0.07]], 96), lib.get('mat_plate'), root);
  const full = dir.geometry.fullness;
  const cover = group('cover', root);
  cover.position.y = 0.07;
  mesh('cover_mesh', lathe([[0.86, 0], [0.9, 0], [0.9, 0.02, 0.06], [0.78, 0.26, 0.28], [0.34, 0.66 * full, 0.2], [0, 0.72 * full]], 96, 10), lib.get('mat_cloche'), cover);
  const handle = mesh('cover_handle', lathe([[0, 0], [0.06, 0, 0.02], [0.05, 0.08, 0.02], [0.13, 0.14, 0.05], [0.12, 0.2, 0.04], [0, 0.21]], 40, 5), lib.get(enamel ? 'mat_body_ink' : 'mat_anodized'), cover);
  handle.position.y = 0.72 * full - 0.01;
  if (enamel) {
    const band = mesh('cover_signature', cylinderBand(0.905, 0.07, 0.07, 96), lib.get('mat_signature'), cover);
    band.position.y = 0.06;
  }
  const s = new ContactShadow({ name: 'dish_shadow', width: 2.5, depth: 2.5, opacity: dir.shadow.opacity, color: dir.shadow.color });
  return finish(root, [s], new Box3(new Vector3(-1.1, 0, -1.1), new Vector3(1.1, 1.05, 1.1)));
}
