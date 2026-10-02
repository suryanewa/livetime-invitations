import { type BufferGeometry, type Object3D, SphereGeometry, TorusGeometry, Vector2 } from 'three';
import { beveledPlate, filletPolyline, group, mergeParts, mesh, perforationRow, roundedBox } from './geometry.ts';
import { cap, place, planContour, planRoundedRect, profile, sweep, turned } from './recordParts.ts';
import { markNoShadowCast } from './shadowProxy.ts';
import { BALL_AT, BALL_R, BOARD as MASTER_BOARD, BOARD_PIVOT, HOOP_ROOT, POLE, RIM, RIM_LOCAL, STAND, type BallPreset } from './sportsContract.ts';
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
 *
 * Since v1.2 the runtime GLB takes the ball, board, rim and net from the scan-to-CAD masters
 * (scripts/masters/recipes/sports.ts) and only the stand from here: `buildSportsGeometry(ctx,
 * preset, { parts: 'stand' })` builds the empty contract nodes plus the pole, base, clamp, arm and
 * the chrome back plate and trim ring, fitted to the master board (contract BOARD). The full v1.1
 * model (`parts: 'all'`, lookdev only) keeps its own board dimensions (V11_BOARD).
 */

/**
 * The v1.1 code-authored board (lookdev model only; the runtime board is the master's, contract
 * BOARD), kept where v1.1 had it relative to the rim (centre 0.36 above, face 0.41 behind).
 */
const BOARD = { width: 1.4, height: 0.92, thickness: 0.06, centerY: RIM_LOCAL.y + 0.36, front: RIM_LOCAL.z - 0.41 } as const;
type BoardDims = { width: number; height: number; thickness: number; centerY: number; front: number };

type Lib = ModelContext['lib'];

const BOARD_BOTTOM = BOARD.centerY - BOARD.height / 2;
const CHAMFER = 0.013;
const PLAN_R = 0.07;
/** Ink backer frame: proud of the board outline all round, its face set back from the board face. */
const FRAME = { proud: 0.012, setBack: 0.005 };
/** Perforation row on the board's lower frame, just above the rim (whole dots, pitch = height). */
const PERF = { pitch: 0.055, y: RIM_LOCAL.y + 0.07, span: BOARD.width - 0.15 };
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
const armY = (board: BoardDims) => board.centerY + 0.02;
const ARM_Y = armY(BOARD);
const BASE_TOP = 0.17;
/** Rim bracket: a mounting plate on the board face under the ring (12 mm clear of the bottom chamfer), and a flange under the ring. */
const BRACKET = { w: 0.25, h: 0.066, t: 0.008, y: BOARD_BOTTOM + CHAMFER + 0.012 + 0.033 };

export interface SportsBuildOptions {
  /** 'all': the v1.1 code-authored model (lookdev). 'stand': contract nodes and the stand only (export with masters). */
  parts?: 'all' | 'stand';
}

export function buildSportsGeometry(ctx: ModelContext, preset: BallPreset = 'orange', options: SportsBuildOptions = {}): Object3D {
  const { lib } = ctx;
  const standOnly = options.parts === 'stand';
  const root = group('sports_root');

  const ball = group('ball_authored', root);
  ball.position.copy(BALL_AT.guest);
  const secondary = group('ball_secondary', ball);
  if (!standOnly) mesh('ball_mesh', new SphereGeometry(BALL_R, 48, 32), lib.get(preset === 'orange' ? 'mat_ball_orange' : 'mat_ball_cream'), secondary);
  group('ball_shadow', root).position.set(BALL_AT.guest.x, 0.002, BALL_AT.guest.z);

  const hoop = group('hoop_root', root);
  hoop.position.copy(HOOP_ROOT);
  if (standOnly) {
    buildMasterStand(lib, hoop);
  } else {
    buildStand(lib, hoop);
    buildBoard(lib, hoop);
    buildRim(lib, hoop);
  }
  group('hoop_shadow', root).position.set(HOOP_ROOT.x, 0.002, HOOP_ROOT.z + (STAND.base.front + STAND.base.back) / 2);
  return root;
}

/**
 * The mini hoop system's stand behind the master board (v1.5, contract STAND and POLE), a portable
 * system to the product's proportions: a blow-moulded weighted base (rounded slab with a soft top
 * roll, a recessed foot, a screw fill cap and two wheels at the back) entirely behind the board; a
 * telescoping powder-coated pole (2" lower section, 1¾" upper section) leaning forward from a
 * socket near the base's front, with a clamp collar and pin knob at the joint; a sleeve at its
 * head carrying two parallel box-section arms to the plate on the board's flat back. Ink parts
 * merge into `hoop_stand`; the steel hardware (back plate, arm bolts, wheel hubs) into
 * `hoop_hardware`.
 */
function buildMasterStand(lib: Lib, hoop: Object3D): void {
  const { base: B, pole: P, arms: A } = STAND;
  const board = MASTER_BOARD;
  const back = board.front - board.thickness;
  const plateT = 0.022;
  // Two parallel arms, 20 cm apart, about the board's pivot height (the centre of its back).
  const armSpan = 0.56;
  const upperY = BOARD_PIVOT.y + armSpan / 2, lowerY = BOARD_PIVOT.y - armSpan / 2;
  const { foot, head, lean, collar } = POLE;
  const len = foot.distanceTo(head);
  /** Pole-local (axis +Y from the foot) → hoop space. */
  const onPole = <T extends BufferGeometry>(g: T) => place(g, { rx: lean, y: foot.y, z: foot.z });
  const along = (y: number) => (y - foot.y) / Math.cos(lean);
  const axisZ = (y: number) => foot.z + (y - foot.y) * Math.tan(lean);

  // Base: a rounded slab, plan centred between its front and back, a soft rolled top edge, a
  // recessed foot (shadow gap) and the fill cap and socket on top.
  const hz = (B.front - B.back) / 2, cz = (B.front + B.back) / 2;
  const H = B.height;
  // Blow-moulded: a generous round over the top edge, a crisp recessed foot below.
  const roll = 0.1, inset = roll + 0.03;
  const plan = planRoundedRect(B.halfWidth, hz, B.corner, 10, 0, cz);
  const side = sweep(plan, profile([[-0.035, 0], [-0.02, 0.0, 0.006], [0, 0.03, 0.012], [0, H, roll], [-inset, H]], 10));
  const top = cap(planContour(B.halfWidth, hz, B.corner, 10, -inset, 0, cz), H, true);
  const under = cap(planContour(B.halfWidth, hz, B.corner, 10, -0.035, 0, cz), 0, false);
  const fill = place(turned([[0, 0], [0.105, 0, 0.004], [0.105, 0.03, 0.01], [0.085, 0.045, 0.012], [0, 0.045]], { segments: 40, filletSegments: 2 }), { y: H - 0.003, z: B.back + 0.5 });
  const socket = onPole(turned([[0, -0.06], [P.lower + 0.07, -0.06], [P.lower + 0.07, 0.03, 0.03], [P.lower + 0.012, 0.1, 0.01], [0, 0.1]], { segments: 40, filletSegments: 3 }));
  // Wheels at the back corners (axis along x).
  const wheelR = 0.12, wheelW = 0.075, wheelZ = B.back + 0.13;
  const wheels = [-1, 1].map((sx) => place(turned([[0, -wheelW / 2], [wheelR, -wheelW / 2, 0.015], [wheelR, wheelW / 2, 0.015], [0, wheelW / 2]], { segments: 32, filletSegments: 2 }), { rz: Math.PI / 2, x: sx * (B.halfWidth + wheelW / 2 - 0.01), y: wheelR, z: wheelZ }));

  // Pole: lower section out of the socket, the clamp collar and its pin knob, the upper section to the head.
  const sc = collar * len;
  const lower = onPole(turned([[P.lower, 0], [P.lower, sc]], { segments: 32 }));
  const collarG = onPole(place(turned([[0, -P.collarHeight / 2], [P.collarRadius - 0.012, -P.collarHeight / 2, 0.006], [P.collarRadius, -P.collarHeight / 2 + 0.03, 0.01], [P.collarRadius, P.collarHeight / 2 - 0.03, 0.01], [P.collarRadius - 0.012, P.collarHeight / 2, 0.006], [0, P.collarHeight / 2]], { segments: 36, filletSegments: 2 }), { y: sc }));
  const knob = onPole(place(turned([[0, 0], [0.024, 0, 0.004], [0.024, 0.06], [0.055, 0.075, 0.01], [0.055, 0.115, 0.012], [0, 0.125]], { segments: 24, filletSegments: 2 }), { rz: -Math.PI / 2, x: P.collarRadius - 0.01, y: sc }));
  const upper = onPole(turned([[P.upper, sc], [P.upper, len - 0.02, 0.012], [P.upper - 0.012, len], [0, len]], { segments: 32, filletSegments: 3 }));
  // Sleeve on the pole's head spanning both arms, chamfered ends.
  const sleeveR = P.upper + 0.022;
  const s0 = along(lowerY) - 0.09, s1 = Math.min(len, along(upperY) + 0.09);
  const sleeve = onPole(turned([[0, s0], [sleeveR - 0.008, s0, 0.004], [sleeveR, s0 + 0.015, 0.006], [sleeveR, s1 - 0.015, 0.006], [sleeveR - 0.008, s1, 0.004], [0, s1]], { segments: 32, filletSegments: 2 }));
  // Arms: box section from the pole's axis (inside the sleeve) to the back plate; the lower one is longer (the pole leans).
  const armTo = back - plateT;
  const arms = [upperY, lowerY].map((y) => place(roundedBox(A.width, A.height, armTo - axisZ(y), 0.012, 2), { y, z: (axisZ(y) + armTo) / 2 }));
  // Satin HDPE (base, socket, fill cap, wheels, collar and knob) and black powder-coated steel (pole, sleeve, arms).
  mesh('hoop_stand', mergeParts([side, top, under, fill, socket, ...wheels, collarG, knob].map((geometry) => ({ geometry }))), lib.get('mat_stand_plastic'), hoop);
  mesh('hoop_pole', mergeParts([lower, upper, sleeve, ...arms].map((geometry) => ({ geometry }))), lib.get('mat_stand_steel'), hoop);

  // Steel: the back plate on the board's flat back, the arms' through-bolts and the wheel hubs.
  const plateH = armSpan + 0.2;
  const backPlate = place(beveledPlate(0.5, plateH, plateT, 0.03, 0.004, 1), { y: BOARD_PIVOT.y, z: back - plateT / 2 });
  const bolts = [upperY, lowerY].flatMap((y) => [-1, 1].map((sx) => place(boltHead(0.016), { ry: (sx * Math.PI) / 2, x: sx * (sleeveR - 0.002), y, z: axisZ(y) })));
  const hubs = [-1, 1].map((sx) => place(turned([[0, 0], [0.045, 0, 0.004], [0.045, 0.012, 0.006], [0, 0.016]], { segments: 24, filletSegments: 2 }), { rz: (-sx * Math.PI) / 2, x: sx * (B.halfWidth + wheelW - 0.012), y: wheelR, z: wheelZ }));
  mesh('hoop_hardware', mergeParts([backPlate, ...bolts, ...hubs].map((geometry) => ({ geometry }))), lib.get('mat_metal'), hoop);
}

// ─────────────────────────────────────────────────────────────────────────────
/** The v1.1 pole sat 0.33 behind its board's front (lookdev model only). */
const V11_POLE_Z = BOARD.front - 0.33;
function buildStand(lib: Lib, hoop: Object3D): void {
  const z = V11_POLE_Z;
  const collarR = 0.066;
  // Glossy ink: turned weighted base, slim pole with a domed cap, the hidden arm and its clamp,
  // the backer frame round the board, the dark liner of the target's channel and the bracket's
  // cap screws.
  const base = place(baseGeometry(0.3, collarR, BASE_TOP), { z });
  const pole = place(turned([[0.045, BASE_TOP - 0.01], [0.045, BOARD.centerY + 0.22 - 0.012, 0.012], [0, BOARD.centerY + 0.22]], { segments: 28, filletSegments: 3 }), { z });
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
  const trim = place(turned([[0.046, 0], [0.071, 0, 0.002], [0.071, 0.005, 0.002], [0.05, 0.008, 0.002], [0.046, 0.008]], { segments: 40, filletSegments: 2 }), { y: BASE_TOP, z: V11_POLE_Z });
  const backPlate = place(beveledPlate(0.36, 0.26, 0.012, 0.03, 0.003, 1), { y: ARM_Y, z: BOARD.front - BOARD.thickness - 0.006 });
  mesh('hoop_hardware', mergeParts([...rimBracket(), { geometry: trim }, { geometry: backPlate }]), lib.get('mat_metal'), hoop);

  // Net: net space at the rim centre (the rig deforms it radially on its own vertices).
  const { geometry } = netGeometry();
  const net = mesh('net', geometry, lib.get('mat_net'), hoop);
  net.position.copy(RIM_LOCAL);
  // Cords this thin cast nothing visible under the soft 16-tap filter.
  markNoShadowCast(net);
}
