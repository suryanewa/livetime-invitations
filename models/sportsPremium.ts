import { type BufferGeometry, type Object3D, SphereGeometry, TorusGeometry, Vector2 } from 'three';
import { beveledPlate, filletPolyline, group, mergeParts, mesh, perforationRow, roundedBox } from './geometry.ts';
import { place, turned } from './recordParts.ts';
import { markNoShadowCast } from './shadowProxy.ts';
import { BALL_AT, BALL_R, BOARD, HOOP_ROOT, POLE, RIM, RIM_LOCAL, type BallPreset } from './sportsContract.ts';
import { backerFrame, type BoardChannel, baseGeometry, boardGeometry, boltHead, channelLiner, netGeometry, outlineFrame, outlinePlate } from './sportsParts.ts';
import type { ModelContext } from './types.ts';

/**
 * Sports (basketball) — premium production model (direction L2, style reference v1.1).
 *
 * The ball is the delight: a smooth sphere whose pebbled leather, recessed channels and 8-panel
 * seams are drawn in its shader (src/render/ballMaterial.ts), crisp at any spin.
 * The hoop: a cream satin backboard swept with crisp chamfers, seated in a glossy ink backer
 * frame (the board's dark silhouette against the stage; frame, arm and pole read as one ink
 * support). The outlined coral target (the enamel insert) is a flush inlay in a machined
 * channel, one pitch above the family perforation row on the board's lower frame. A coral
 * anodised rim on a polished chrome bracket (mounting plate and a flange under the ring, fixed
 * with ink cap screws); a knotted cotton net laced over the rim; a slim glossy ink pole behind
 * the board on its arm, rising from a turned, weighted ink base with an ogee shoulder, a chrome
 * trim ring and a recessed shadow-gap underside.
 *
 * Every contract dimension, pivot and node lives in sportsContract.ts; this file only builds.
 * Static parts that share a material are merged (one draw each): 8 visible draw calls. The
 * target and the perforation strip are children of `backboard`, so they follow any board move.
 */

type Lib = ModelContext['lib'];

const BOARD_BOTTOM = BOARD.centerY - BOARD.height / 2;
const CHAMFER = 0.013;
const PLAN_R = 0.07;
/** Ink backer frame: proud of the board outline all round, its face set back from the board face. */
const FRAME = { proud: 0.012, setBack: 0.005 };
/** Perforation row on the board's lower frame, just above the rim (whole dots, pitch = height). */
const PERF = { pitch: 0.055, y: 1.79, span: BOARD.width - 0.15 };
/**
 * Target square: outlined (never filled), 4:3-ish, concentric corner radii. Its bottom edge sits
 * one pitch above the perforation row. A flush inlay: it sits in a machined channel `gap` wider
 * than the line on each side and stops `recess` below the face; the channel's ink liner shows in
 * that gap as a fine dark line round it.
 */
const TARGET = {
  w: 0.62, h: 0.44, line: 0.034, rOuter: 0.04, rInner: 0.006,
  cy: PERF.y + PERF.pitch * 1.5 + 0.22, gap: 0.003, depth: 0.004, recess: 0.0008,
};
/** The target's channel in board-local x, y. */
const CHANNEL: BoardChannel = {
  cx: 0, cy: TARGET.cy - BOARD.centerY, depth: TARGET.depth,
  outer: { hx: TARGET.w / 2 + TARGET.gap, hy: TARGET.h / 2 + TARGET.gap, r: TARGET.rOuter + TARGET.gap },
  inner: { hx: TARGET.w / 2 - TARGET.line - TARGET.gap, hy: TARGET.h / 2 - TARGET.line - TARGET.gap, r: Math.max(0.001, TARGET.rInner - TARGET.gap) },
};
/** Hidden arm from the pole to the board's back plate. */
const ARM_Y = BOARD.centerY + 0.02;
const BASE_TOP = 0.17;
/** Rim bracket: a mounting plate on the board face under the ring (12 mm clear of the bottom chamfer), and a flange under the ring. */
const BRACKET = { w: 0.25, h: 0.066, t: 0.008, y: BOARD_BOTTOM + CHAMFER + 0.012 + 0.033 };

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
  buildStand(lib, hoop);
  buildBoard(lib, hoop);
  buildRim(lib, hoop);
  group('hoop_shadow', root).position.set(HOOP_ROOT.x, 0.002, HOOP_ROOT.z + POLE.z);
  return root;
}

// ─────────────────────────────────────────────────────────────────────────────
function buildStand(lib: Lib, hoop: Object3D): void {
  const z = POLE.z;
  const collarR = 0.066;
  // Glossy ink: turned weighted base, slim pole with a domed cap, the hidden arm and its clamp,
  // the backer frame round the board, the dark liner of the target's channel and the bracket's
  // cap screws.
  const base = place(baseGeometry(POLE.baseRadius, collarR, BASE_TOP), { z });
  const pole = place(turned([[POLE.radius, BASE_TOP - 0.01], [POLE.radius, POLE.top - 0.012, 0.012], [0, POLE.top]], { segments: 28, filletSegments: 3 }), { z });
  const clamp = place(turned([[0, -0.07], [0.062, -0.07, 0.008], [0.062, 0.07, 0.008], [0, 0.07]], { segments: 20, filletSegments: 2 }), { y: ARM_Y, z });
  const armLen = -z - BOARD.thickness / 2 - 0.012;
  const arm = place(roundedBox(0.075, 0.1, armLen, 0.018, 2), { y: ARM_Y, z: z + armLen / 2 });
  const boardAt = { y: BOARD.centerY, z: BOARD.front - BOARD.thickness / 2 };
  const frame = place(backerFrame(BOARD.width, BOARD.height, BOARD.thickness, PLAN_R, FRAME.proud, FRAME.setBack), boardAt);
  const liner = place(channelLiner(BOARD.thickness, CHANNEL, 0.0001), boardAt);
  const screws = [-0.085, 0.085].map((x) => ({ geometry: place(boltHead(0.0095), { x, y: BRACKET.y - 0.008, z: BOARD.front + BRACKET.t }) }));
  mesh('hoop_stand', mergeParts([{ geometry: base }, { geometry: pole }, { geometry: clamp }, { geometry: arm }, { geometry: frame }, { geometry: liner }, ...screws]), lib.get('mat_body_ink'), hoop);
}

/** Rim bracket (chrome): mounting plate on the board face below the ring, flange directly under it. */
function rimBracket(): { geometry: BufferGeometry }[] {
  const plate = place(beveledPlate(BRACKET.w, BRACKET.h, BRACKET.t, 0.014, 0.0034, 3), { y: BRACKET.y, z: BOARD.front + BRACKET.t / 2 });
  // Flange: from the board face forward to an arc just inside the ring, directly under it.
  const flangeTop = RIM_LOCAL.y - RIM.tube + 0.0005;
  const arcR = RIM.innerRadius - 0.008;
  const hw = 0.13;
  const zAt = (x: number) => RIM_LOCAL.z - Math.sqrt(arcR * arcR - x * x);
  const pts: [number, number, number?][] = [[0, BOARD.front], [hw, BOARD.front, 0.004]];
  for (let i = 0; i <= 8; i++) {
    const x = hw - (i / 8) * 2 * hw;
    pts.push([x, zAt(x), i === 0 || i === 8 ? 0.01 : 0]);
  }
  pts.push([-hw, BOARD.front, 0.004], [0, BOARD.front]);
  const outline = filletPolyline(pts, 3).slice(0, -1).map((p) => new Vector2(p.x, p.y));
  const flange = place(outlinePlate(outline, 0.008, 0.0015), { rx: Math.PI / 2, y: flangeTop });
  return [{ geometry: plate }, { geometry: flange }];
}

// ─────────────────────────────────────────────────────────────────────────────
function buildBoard(lib: Lib, hoop: Object3D): void {
  const { w, h, line, rOuter, rInner, depth, recess } = TARGET;
  const channel = CHANNEL;
  const board = mesh('backboard', boardGeometry(BOARD.width, BOARD.height, BOARD.thickness, PLAN_R, CHAMFER, channel), lib.get('mat_body'), hoop);
  board.position.set(0, BOARD.centerY, BOARD.front - BOARD.thickness / 2);
  const face = BOARD.thickness / 2; // board-local z of the face

  // Coral target: an outlined (never filled) inlay seated on the channel floor, just below the face.
  const target = mesh('board_target', outlineFrame(w, h, line, rOuter, rInner, depth - recess, 0.0007), lib.get('mat_accent'), board);
  target.position.set(0, channel.cy, face - depth + 0.0002);

  // Signature: whole dots, pitch = strip height, at least one empty pitch to the chamfers and
  // the frame (the 22-dot row leaves 1.7 pitches each side).
  const row = perforationRow(PERF.span, PERF.pitch, 0.004);
  const sig = mesh('board_signature', row.geometry, lib.get('mat_signature'), board);
  sig.position.set(0, PERF.y - BOARD.centerY, face - 0.0002);
}

// ─────────────────────────────────────────────────────────────────────────────
function buildRim(lib: Lib, hoop: Object3D): void {
  const ringR = RIM.innerRadius + RIM.tube;
  const rim = mesh('rim', new TorusGeometry(ringR, RIM.tube, 12, 80), lib.get('mat_anodized'), hoop);
  rim.rotation.x = Math.PI / 2;
  rim.position.copy(RIM_LOCAL);

  // Chrome hardware: the rim bracket (plate and flange), the base trim ring and the board's back plate.
  const trim = place(turned([[0.046, 0], [0.071, 0, 0.002], [0.071, 0.005, 0.002], [0.05, 0.008, 0.002], [0.046, 0.008]], { segments: 40, filletSegments: 2 }), { y: BASE_TOP, z: POLE.z });
  const backPlate = place(beveledPlate(0.36, 0.26, 0.012, 0.03, 0.003, 1), { y: ARM_Y, z: BOARD.front - BOARD.thickness - 0.006 });
  mesh('hoop_hardware', mergeParts([...rimBracket(), { geometry: trim }, { geometry: backPlate }]), lib.get('mat_metal'), hoop);

  // Net: net space at the rim centre (the rig deforms it radially on its own vertices).
  const { geometry } = netGeometry();
  const net = mesh('net', geometry, lib.get('mat_net'), hoop);
  net.position.copy(RIM_LOCAL);
  // Cords this thin cast nothing visible under the soft 16-tap filter.
  markNoShadowCast(net);
}
