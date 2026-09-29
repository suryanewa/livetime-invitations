import { CylinderGeometry, type Object3D, SphereGeometry, TorusGeometry } from 'three';
import { group, lathe, mesh, roundedBox } from './geometry.ts';
import { BALL_AT, BALL_R, BOARD, HOOP_ROOT, NET, POLE, RIM, RIM_LOCAL, type BallPreset } from './sportsContract.ts';
import type { ModelContext } from './types.ts';

/**
 * Sports geometry (static parts + named nodes; exported to GLB).
 * STAND-IN: honours every contract dimension in sportsContract.ts so choreography can be
 * authored; the premium build replaces the construction, never the contract.
 */
export function buildSportsGeometry(ctx: ModelContext, preset: BallPreset = 'orange'): Object3D {
  const { lib } = ctx;
  const root = group('sports_root');

  const ball = group('ball_authored', root);
  ball.position.copy(BALL_AT.guest);
  const secondary = group('ball_secondary', ball);
  mesh('ball_mesh', new SphereGeometry(BALL_R, 48, 32), lib.get(preset === 'orange' ? 'mat_ball_orange' : 'mat_ball_cream'), secondary);
  group('ball_shadow', root).position.set(BALL_AT.guest.x, 0.002, BALL_AT.guest.z);

  const hoop = group('hoop_root', root);
  hoop.position.copy(HOOP_ROOT);
  mesh('hoop_base', lathe([[0, 0], [POLE.baseRadius, 0, 0.02], [POLE.baseRadius, 0.06, 0.02], [0, 0.06]], 48), lib.get('mat_body_ink'), hoop).position.z = POLE.z;
  mesh('hoop_pole', new CylinderGeometry(POLE.radius, POLE.radius * 1.2, POLE.top, 24), lib.get('mat_body_ink'), hoop).position.set(0, POLE.top / 2, POLE.z);
  mesh('hoop_arm', roundedBox(0.09, 0.09, -POLE.z, 0.02, 2), lib.get('mat_body_ink'), hoop).position.set(0, BOARD.centerY, POLE.z / 2);
  const board = mesh('backboard', roundedBox(BOARD.width, BOARD.height, BOARD.thickness, 0.05, 3), lib.get('mat_body'), hoop);
  board.position.set(0, BOARD.centerY, BOARD.front - BOARD.thickness / 2);
  const rim = mesh('rim', new TorusGeometry(RIM.innerRadius + RIM.tube, RIM.tube, 10, 64), lib.get('mat_anodized'), hoop);
  rim.rotation.x = Math.PI / 2;
  rim.position.copy(RIM_LOCAL);
  const net = mesh('net', lathe([[RIM.innerRadius, 0], [NET.bottomRadius, -NET.depth]], 24, 0), lib.get('mat_net'), hoop);
  net.position.copy(RIM_LOCAL);
  group('hoop_shadow', root).position.set(HOOP_ROOT.x, 0.002, HOOP_ROOT.z + POLE.z);
  return root;
}
