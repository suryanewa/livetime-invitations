import { Box3, BufferGeometry, CylinderGeometry, SphereGeometry, TorusGeometry, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ContactShadow } from '../src/render/contactShadow.ts';
import { cylinderBand, group, inlayPlate, lathe, mesh, perforationRow, roundedBox, wire } from './geometry.ts';
import { disposeGeometry, type BuiltModel, type ModelContext } from './types.ts';

/**
 * Visual-study blockouts (Visual Study artifact 2). Rough silhouettes rendered with the
 * proposed common materials to test family coherence — not finished production models.
 * Direction L carries the checkpoint-1 refinements so the family sheet reflects the lock.
 */

function finish(root: ReturnType<typeof group>, shadows: ContactShadow[], bounds: Box3): BuiltModel {
  shadows.forEach((s) => root.add(s));
  return { root, nodes: {}, shadows, bounds, dispose: () => disposeGeometry(root) };
}

export function buildRecordPlayerBlockout({ lib }: ModelContext): BuiltModel {
  const dir = lib.direction;
  const st = dir.style;
  const r = st.record === 'accent' ? 0.13 : 0.07;
  const root = group('party_blockout');
  const W = 2.1, Hh = 0.34, Dd = 1.5;
  const bodyMat = lib.get(st.record === 'accent' ? 'mat_accent' : 'mat_body');
  mesh('player_body', roundedBox(W, Hh, Dd, r, 5), bodyMat, root).position.y = Hh / 2;
  if (st.record === 'band') {
    // Coral plinth band carrying the whole-dot perforation row.
    const band = mesh('player_band', roundedBox(W + 0.004, 0.11, Dd + 0.004, 0.03, 3), lib.get('mat_accent'), root);
    band.position.y = 0.075;
    const pitch = 0.07;
    const row = perforationRow(W - 0.5 - 2 * pitch, pitch, 0.006);
    const perf = mesh('player_signature', row.geometry, [lib.get('mat_signature'), lib.get('mat_accent')], root);
    perf.position.set(-0.1, 0.075, Dd / 2 + 0.003);
  } else {
    const face = mesh('player_signature', inlayPlate(W - 0.5, st.record === 'accent' ? 0.1 : 0.16, 0.006, 0.03, st.record === 'accent' ? 0.1 : 0.2), lib.get('mat_signature'), root);
    face.position.set(-0.1, Hh / 2, Dd / 2);
  }
  const platter = mesh('platter', new CylinderGeometry(0.64, 0.64, 0.05, 64), lib.get(st.record === 'accent' ? 'mat_body_ink' : 'mat_metal'), root);
  platter.position.set(-0.3, Hh + 0.025, 0.02);
  const record = mesh('record', new CylinderGeometry(0.6, 0.6, 0.02, 64), lib.get('mat_vinyl'), root);
  record.position.set(-0.3, Hh + 0.06, 0.02);
  const label = mesh('record_label', new CylinderGeometry(0.2, 0.2, 0.024, 48), lib.get('mat_label_coral'), root);
  label.position.copy(record.position);
  const armBase = mesh('tonearm_pivot', new CylinderGeometry(0.1, 0.12, 0.08, 32), lib.get(st.record === 'accent' ? 'mat_body' : 'mat_metal'), root);
  armBase.position.set(0.68, Hh + 0.04, -0.42);
  mesh('tonearm', wire([new Vector3(0.68, Hh + 0.14, -0.42), new Vector3(0.7, Hh + 0.14, 0.1), new Vector3(0.52, Hh + 0.12, 0.42)], 0.018), lib.get(st.record === 'accent' ? 'mat_body_ink' : 'mat_metal'), root);
  mesh('knob', new CylinderGeometry(0.07, 0.07, 0.05, 32), lib.get(st.record === 'accent' ? 'mat_insert_warm' : 'mat_anodized'), root).position.set(0.78, Hh + 0.025, 0.5);
  const hinge = group('lid_hinge', root);
  hinge.position.set(0, Hh + 0.03, -Dd / 2 + 0.02);
  hinge.rotation.x = -1.2;
  if (st.record === 'band') {
    // Framed shell lid with visible thickness and hinge barrels on the pivot axis.
    for (const x of [-0.72, 0.72]) {
      const barrel = mesh('lid_barrel', new CylinderGeometry(0.035, 0.035, 0.16, 20), lib.get('mat_metal'), root);
      barrel.rotation.z = Math.PI / 2;
      barrel.position.set(x, Hh + 0.03, -Dd / 2 + 0.02);
    }
    const shell = mesh('lid', roundedBox(W - 0.02, 0.06, Dd - 0.04, 0.03, 3), lib.get('mat_body_alt'), hinge);
    shell.position.set(0, 0.03, (Dd - 0.04) / 2);
  } else {
    const lid = mesh('lid', roundedBox(W - 0.02, 0.05, Dd - 0.04, 0.025, 3), lib.get(st.record === 'accent' ? 'mat_body' : 'mat_body_alt'), hinge);
    lid.position.z = (Dd - 0.04) / 2;
  }
  const s = new ContactShadow({ name: 'shadow', shape: 'rect', width: W, depth: Dd, spread: [1.1, 1.25], opacity: dir.shadow.opacity, line: 0.45, color: dir.shadow.color });
  return finish(root, [s], new Box3(new Vector3(-W / 2, 0, -Dd / 2 - 0.2), new Vector3(W / 2, 1.8, Dd / 2)));
}

/** Open net: twisted strands and two hoops, one draw call. */
function netLattice(topR: number, bottomR: number, depth: number): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const strands = 12;
  for (let i = 0; i < strands; i++) {
    for (const dirSign of [1, -1]) {
      const pts: Vector3[] = [];
      for (let k = 0; k <= 6; k++) {
        const s = k / 6;
        const r = topR + (bottomR - topR) * s;
        const a = ((i + dirSign * s * 0.9) / strands) * Math.PI * 2;
        pts.push(new Vector3(Math.cos(a) * r, -depth * s, Math.sin(a) * r));
      }
      parts.push(wire(pts, 0.006, 5));
    }
  }
  const ring = new TorusGeometry(bottomR, 0.007, 5, 40);
  ring.rotateX(Math.PI / 2);
  ring.translate(0, -depth, 0);
  parts.push(ring);
  // Wire geometry has no uv; strip uv so the merge succeeds.
  parts.forEach((p) => p.deleteAttribute('uv'));
  const merged = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  return merged;
}

export function buildBasketballBlockout({ lib }: ModelContext): BuiltModel {
  const dir = lib.direction;
  const refined = dir.style.hoop === 'refined';
  const root = group('sports_blockout');
  const ball = group('ball', root);
  // Refined: rim inner diameter ≈ 1.6 × ball diameter so the made shot is physically plausible.
  const R = refined ? 0.25 : 0.4 * dir.geometry.fullness;
  ball.position.set(-0.55, R, 0.5);
  mesh('ball_mesh', new SphereGeometry(R, 48, 32), lib.get('mat_ball_orange'), ball);
  const seam = lib.get('mat_ball_seam');
  const t = refined ? 0.007 : 0.009;
  mesh('seam_a', new TorusGeometry(R + 0.001, t, 6, 96), seam, ball);
  mesh('seam_b', new TorusGeometry(R + 0.001, t, 6, 96), seam, ball).rotation.y = Math.PI / 2;
  const c1 = mesh('seam_c', new TorusGeometry(R * 0.72, t, 6, 96), seam, ball);
  c1.rotation.y = Math.PI / 2; c1.position.x = R * 0.69;
  const c2 = mesh('seam_d', new TorusGeometry(R * 0.72, t, 6, 96), seam, ball);
  c2.rotation.y = Math.PI / 2; c2.position.x = -R * 0.69;
  ball.rotation.set(0.4, 0.5, 0.2);

  const hoop = group('hoop_root', root);
  hoop.position.set(0.55, 0, -0.45);
  const perforated = dir.signature.kind === 'perforation';
  if (refined) {
    const rimR = 0.42;
    const boardW = 1.5, boardH = 0.95, boardY = 2.15;
    const board = mesh('backboard', roundedBox(boardW, boardH, 0.07, 0.06, 4), lib.get('mat_body'), hoop);
    board.position.set(0, boardY, 0);
    // Outlined shooting target (four bars), never a filled "screen".
    const tMat = lib.get('mat_accent');
    const tw = 0.5, th = 0.36, tb = 0.03, ty = boardY - 0.14;
    for (const [x, y, w, h] of [[0, ty + th / 2, tw, tb], [0, ty - th / 2, tw, tb], [-tw / 2, ty, tb, th], [tw / 2, ty, tb, th]] as const) {
      mesh('backboard_target', roundedBox(w, h, 0.076, 0.008, 2), tMat, hoop).position.set(x, y, 0);
    }
    // Perforated frame band along the board's lower edge.
    const pitch = 0.06;
    const row = perforationRow(boardW - 0.2 - 2 * pitch, pitch, 0.006);
    const perf = mesh('hoop_signature', row.geometry, [lib.get('mat_signature'), lib.get('mat_body')], hoop);
    perf.position.set(0, boardY - boardH / 2 + 0.07, 0.036);
    // Pole behind the board with a bracket arm.
    const pole = mesh('hoop_support', new CylinderGeometry(0.055, 0.065, boardY + 0.1, 32), lib.get('mat_body_ink'), hoop);
    pole.position.set(0, (boardY + 0.1) / 2, -0.42);
    const arm = mesh('hoop_bracket', roundedBox(0.1, 0.1, 0.42, 0.03, 3), lib.get('mat_body_ink'), hoop);
    arm.position.set(0, boardY, -0.21);
    mesh('hoop_base', lathe([[0, 0], [0.36, 0, 0.02], [0.36, 0.07, 0.03], [0, 0.07]], 48), lib.get('mat_body_ink'), hoop).position.z = -0.42;
    const rim = mesh('rim', new TorusGeometry(rimR, 0.022, 12, 72), lib.get('mat_anodized'), hoop);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(0, 1.78, rimR + 0.06);
    mesh('rim_bracket', roundedBox(0.16, 0.05, 0.12, 0.015, 2), lib.get('mat_anodized'), hoop).position.set(0, 1.78, 0.08);
    const net = mesh('net', netLattice(rimR * 0.98, rimR * 0.62, 0.42), lib.get('mat_net'), hoop);
    net.position.copy(rim.position);
  } else {
    const pole = mesh('hoop_support', new CylinderGeometry(0.06, 0.07, 2.2, 32), lib.get(perforated ? 'mat_body_ink' : 'mat_body'), hoop);
    pole.position.set(0, 1.1, -0.12);
    const poleBand = mesh('hoop_signature', cylinderBand(0.066, 0.42, perforated ? 0.1 : 0.2, 48), lib.get('mat_signature'), hoop);
    poleBand.position.set(0, 0.5, -0.12);
    mesh('hoop_base', lathe([[0, 0], [0.34, 0, 0.02], [0.34, 0.06, 0.03], [0, 0.06]], 48), lib.get(perforated ? 'mat_body_ink' : 'mat_metal_dark'), hoop);
    const board = mesh('backboard', roundedBox(1.25, 0.84, 0.06, perforated ? 0.1 : 0.05, 4), lib.get('mat_body'), hoop);
    board.position.set(0, 2.1, 0);
    const frame = mesh('backboard_box', roundedBox(0.42, 0.32, 0.066, 0.02, 2), lib.get(perforated ? 'mat_accent' : 'mat_body_ink'), hoop);
    frame.position.set(0, 1.93, 0.003);
    const rim = mesh('rim', new TorusGeometry(0.25, 0.022, 12, 64), lib.get(perforated ? 'mat_accent' : 'mat_anodized'), hoop);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(0, 1.78, 0.3);
    const net = mesh('net', lathe([[0.25, 0], [0.2, -0.22, 0.05], [0.15, -0.34]], 32, 3), lib.get('mat_net'), hoop);
    net.position.copy(rim.position);
  }
  const s1 = new ContactShadow({ name: 'ball_shadow', width: R * 2, depth: R * 2, spread: [1.4, 1.4], opacity: dir.shadow.opacity, line: 0.35, color: dir.shadow.color });
  s1.position.set(ball.position.x, 0.002, ball.position.z);
  const s2 = new ContactShadow({ name: 'hoop_shadow', width: 0.7, depth: 0.7, spread: [1.3, 1.4], opacity: dir.shadow.opacity * 0.9, line: 0.4, color: dir.shadow.color });
  s2.position.set(hoop.position.x, 0.002, hoop.position.z + (refined ? -0.42 : -0.12));
  return finish(root, [s1, s2], new Box3(new Vector3(-1.0, 0, -0.9), new Vector3(1.4, 2.65, 0.95)));
}

export function buildDishBlockout({ lib }: ModelContext): BuiltModel {
  const dir = lib.direction;
  const metal = dir.style.cloche === 'metal';
  const refined = dir.id === 'L';
  const root = group('dinner_blockout');
  const plateProfile: [number, number, number?][] = refined
    ? [[0, 0], [0.62, 0, 0.02], [0.72, 0.04, 0.04], [1.1, 0.075, 0.012], [1.1, 0.14, 0.012], [1.04, 0.14, 0.02], [0.7, 0.085, 0.05], [0, 0.07]]
    : [[0, 0], [0.62, 0, 0.02], [0.72, 0.05, 0.04], [1.08, 0.1, 0.03], [1.1, 0.13, 0.015], [1.04, 0.13, 0.02], [0.7, 0.085, 0.05], [0, 0.07]];
  mesh('plate', lathe(plateProfile, refined ? 72 : 96), lib.get('mat_plate'), root);
  const full = dir.geometry.fullness;
  const cover = group('cover', root);
  cover.position.y = 0.07;
  mesh('cover_mesh', lathe([[0.86, 0], [0.9, 0], [0.9, 0.02, 0.06], [0.78, 0.26, 0.28], [0.34, 0.66 * full, 0.2], [0, 0.72 * full]], refined ? 72 : 96, 10), lib.get('mat_cloche'), cover);
  const handle = mesh('cover_handle', lathe([[0, 0], [0.06, 0, 0.02], [0.05, 0.08, 0.02], [0.13, 0.14, 0.05], [0.12, 0.2, 0.04], [0, 0.21]], 40, 5), lib.get(metal ? 'mat_anodized' : 'mat_body_ink'), cover);
  handle.position.y = 0.72 * full - 0.01;
  if (refined) {
    // Signature on the plate's rim band (a manufactured support), never on food.
    const band = mesh('plate_signature', cylinderBand(1.103, 0.045, 0.045, 128), lib.get('mat_signature'), root);
    band.position.y = 0.107;
  } else if (!metal) {
    const band = mesh('cover_signature', cylinderBand(0.905, 0.07, 0.07, 96), lib.get('mat_signature'), cover);
    band.position.y = 0.06;
  }
  const s = new ContactShadow({ name: 'dish_shadow', width: 2.2, depth: 2.2, spread: [1.12, 1.28], opacity: dir.shadow.opacity, line: 0.42, color: dir.shadow.color });
  return finish(root, [s], new Box3(new Vector3(-1.1, 0, -1.1), new Vector3(1.1, 1.05, 1.1)));
}
