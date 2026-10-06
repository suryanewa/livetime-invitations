import { Vector3 } from 'three';
import { BALL_R, BOARD, HOOP_ROOT, NET, netRestRadius, RIM, RIM_CENTER } from '../../../models/sportsContract.ts';
import { CAMERA_ANGLES, type CloseUp } from '../../render/camera.ts';
import { cubicBezier } from '../../motion/curves.ts';
import { newFrame, sampleTrack } from './sequences.ts';

/**
 * v1.7 polish (#43, "cutting the bottom of the board"): the decline's push-in.
 *
 * The rest frame cannot hide the stand while the ball rests on the near floor (at the shared 15°
 * elevation the base projects above the ball's floor line, docs/scenes/sports-v1.7-decline.md), but
 * the decline's dramatic moment is airborne: the bank, the glass, the rattle. So the camera leans in
 * on it: a second fit (`SceneInstance.closeUp`, kind 'focus') of the board, the rim, the net and the
 * ball's airborne path, along the shared direction at the rest fit's aim, and a channel
 * (`frameClose`) that dollies there and back (a pure function of the decline's time). At the focus
 * the frame's bottom crops the pole's lower part and the base; the glass and the rim fill it as the
 * ball strikes. 0 in every pose, so the posters, reduced motion and the declined still are unchanged.
 */

/** Outer net silhouette beyond its inner envelope (cords, knots, the far layer's thickness). */
export const NET_OUTSET = 0.05;
/**
 * How far the simulated net can swing out of its rest envelope (the made ball opens it to the
 * ball's radius and the whip throws the bottom out and up): a conservative envelope for framing.
 */
export const NET_SWING = { out: 0.12, down: 0.15 } as const;

/**
 * The hoop's frame points (sports_root space): the board's eight corners (its top-back edge is the
 * silhouette at the 15° elevation), the rim ring, and the net's rest envelope with the room its
 * swing can take. Not the stand.
 */
export function hoopFramePoints(): Vector3[] {
  const pts: Vector3[] = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const z of [BOARD.front, BOARD.front - BOARD.thickness]) {
    pts.push(new Vector3(HOOP_ROOT.x + (sx * BOARD.width) / 2, BOARD.centerY + (sy * BOARD.height) / 2, HOOP_ROOT.z + z));
  }
  const dirs = Array.from({ length: 16 }, (_, i) => [Math.cos((i / 16) * Math.PI * 2), Math.sin((i / 16) * Math.PI * 2)] as const);
  const ring = RIM.innerRadius + 2 * RIM.tube;
  for (const [cx, sz] of dirs) pts.push(new Vector3(RIM_CENTER.x + cx * ring, RIM_CENTER.y, RIM_CENTER.z + sz * ring));
  for (const [cx, sz] of dirs) {
    for (const t of [0.25, 0.5, 0.75, 1]) {
      const r = netRestRadius(t) + NET_OUTSET + NET_SWING.out * t, y = -t * NET.depth - NET_SWING.down * t * t;
      pts.push(new Vector3(RIM_CENTER.x + cx * r, RIM_CENTER.y + y, RIM_CENTER.z + sz * r));
    }
  }
  return pts;
}

/**
 * The channel's timing on the decline's clock (s): it eases in from the launch (the ball leaves the
 * hand at 0.525 s; `in[0]` just before, as the hand lifts it) to the focus before the glass (0.95 s),
 * holds through the rattle (its last strike at 1.586 s, 20 ms long), and eases back to the rest
 * frame before the ball's first floor contact (2.135 s). `path`: the ball's airborne path the focus
 * fit holds, from where the channel is four fifths in (0.78 s) to the end of the hold; before it the
 * ball is inside the frame by the ease (a per-frame check at 1/240 s, tests/sports.test.ts).
 */
export const FOCUS = { in: [0.4, 0.93], out: [1.61, 2.1], path: [0.78, 1.61] } as const;
/**
 * The ease both ways: CSS's ease-in-out, cubic-bezier(0.42, 0, 0.58, 1): zero speed at both ends,
 * symmetric, its peak only 1.72 × the mean (Dinner's close-up's (0.4, 0, 0.4, 1) 2.06 ×, the
 * decline pull's (0.3, 0, 0.3, 1) 2.18 ×): a lean, not a punch.
 */
export const FOCUS_EASE = cubicBezier(0.42, 0, 0.58, 1);
/**
 * The focus fit (the hero rule along the shared direction): the board, the rim and the net fill
 * this much of the frame's height (and at most this much of its width), every point of the ball's
 * airborne path (FOCUS.path) PATH_CLEARANCE inside. Measured (tests/sports.test.ts; the GLB's
 * stand; the real stage, `controller.framing()`): at 1:1 and 3:2 everything is 1.68× larger than
 * at rest (the ball at the strike 14.4 % of the frame's height: 76 CSS px of the laptop's 528 px
 * frame square, 45 px at rest), the frame's bottom
 * crosses the pole ≈ 45 cm above the floor, under its clamp collar, and the base's highest point
 * (its socket's boss, 17 cm) is 5 % of the frame below it (27 px on the laptop, past the 16 px the
 * fullscreen view shows under the frame square; on the phone 10 px under the dock); at 3:4 the
 * width binds: 1.60×, the base 2 % below the frame. 0.7 left the base's boss in the laptop's view.
 */
export const SPORTS_FOCUS_FILL = { height: 0.8, width: 0.8 } as const;

/** The focus channel at decline time t: 0 to FOCUS.in[0], 1 through the hold, 0 from FOCUS.out[1]. */
export function focusIn(t: number): number {
  const [a, b] = FOCUS.in, [c, d] = FOCUS.out;
  if (t <= a || t >= d) return 0;
  if (t < b) return FOCUS_EASE((t - a) / (b - a));
  if (t <= c) return 1;
  return 1 - FOCUS_EASE((t - c) / (d - c));
}

/** The focus's fit spec (`SceneInstance.closeUp`): the hoop at SPORTS_FOCUS_FILL, the ball's airborne path held. */
export function sportsFocus(): CloseUp {
  const f = newFrame(), paths: Vector3[] = [];
  for (let t = FOCUS.path[0]; t <= FOCUS.path[1] + 1e-9; t += 0.01) {
    const c = sampleTrack('decline', t, f).ballPos;
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const) paths.push(new Vector3(c.x + dx * BALL_R, c.y + dy * BALL_R, c.z + dz * BALL_R));
  }
  return {
    kind: 'focus', aim: 'stage', points: hoopFramePoints(), paths, fill: SPORTS_FOCUS_FILL,
    azimuthDeg: CAMERA_ANGLES.azimuthDeg, elevationDeg: CAMERA_ANGLES.elevationDeg,
  };
}
