import { Box3, Vector3 } from 'three';

/**
 * Sports (basketball) contract — shared by the model (`sportsPremium.ts`), the rig
 * (`sports.ts`) and the choreography (`src/scenes/sports`). Everything the sequences touch is
 * fixed here, so geometry can be refined without breaking the made shot, the airball, rim
 * occlusion or the motion bounds.
 */

export type BallPreset = 'orange' | 'cream';

export const SPORTS_NODES = [
  'sports_root', 'ball_authored', 'ball_secondary', 'ball_mesh', 'hoop_root', 'backboard', 'rim', 'net',
  'ball_shadow', 'hoop_shadow',
] as const;

/**
 * Ball radius (scene units). The rim's inner diameter is 1.6 × the ball's. The ball is the
 * basketball master (sphere r 0.9436 scan units) at BALL_R / 0.9436.
 */
export const BALL_R = 0.25;

/**
 * Hoop: `hoop_root` sits on the floor behind and right of the ball. The board, rim and net are the
 * scan-to-CAD hoop master (`models/masters/basketball-hoop.glb`, a wall-mount mini hoop) imported by
 * `scripts/masters/recipes/sports.ts` at HOOP_SCALE, placed so its rim-ring centre lands exactly on
 * RIM_LOCAL; the pole, base, arm and back plate are code-authored (`sportsPremium.ts`, stand mode).
 * Every number below was measured from the master at that scale (scripts/masters/README.md,
 * "Measuring a master"); `tests/sports.test.ts` re-measures the exported GLB against them.
 */
export const HOOP_ROOT = new Vector3(0.55, 0, -0.75);
/** Rim ring: inner radius 1.6 × BALL_R; the master's tube (0.021 scan units) at HOOP_SCALE. */
export const RIM = { innerRadius: 0.4, tube: 0.0186 } as const;
/** Scan units → scene units for the hoop master: its rim's inner radius (0.451) becomes RIM.innerRadius. */
export const HOOP_SCALE = RIM.innerRadius / 0.451;
/**
 * Board (hoop space): `front` is the front of the wood frame's proud lip, `face` the grey laminate
 * face inside it, `front − thickness` the flat back the arm's back plate meets. The frame's outline
 * is width × height about (0, centerY).
 */
export const BOARD = { width: 1.6264, height: 1.2788, thickness: 0.183, centerY: 2.0818, front: 0.0581, face: -0.0086 } as const;
export const POLE = { z: -0.3, top: 2.3, radius: 0.045, baseRadius: 0.3 } as const;
/** Rim centre in hoop space (unchanged from v1.1, so every authored arc still meets it). */
export const RIM_LOCAL = new Vector3(0, 1.72, 0.44);
/** Rim centre in world (sports_root) space: the made shot passes exactly through it. */
export const RIM_CENTER = HOOP_ROOT.clone().add(RIM_LOCAL);
/** The master's rim bracket (plate, saddle and arms) in hoop space: the ring's mount on the board face. */
export const RIM_BRACKET = new Box3(new Vector3(-0.2177, 1.5299, -0.007), new Vector3(0.2177, 1.7455, 0.0865));
/**
 * Net: 20 twisted-rope strands from 10 rim hooks, 6 knot rows, hanging NET.depth below the rim
 * centre. `profile` is its inner envelope: [depth fraction, smallest radius of any cord, knot or
 * loop vertex in that band] (horizontal, from the rim axis). The mini hoop's net is narrow: at rest
 * its waist (0.18) is smaller than the ball, so the made shot bulges it round the ball (`netOpening`).
 */
export const NET = {
  depth: 0.6837,
  bottomRadius: 0.2,
  strands: 20,
  rows: 6,
  profile: [
    [0, 0.401], [0.083, 0.367], [0.167, 0.337], [0.25, 0.306], [0.333, 0.27], [0.417, 0.231], [0.5, 0.226],
    [0.583, 0.201], [0.667, 0.185], [0.75, 0.191], [0.833, 0.177], [0.917, 0.182], [1, 0.2],
  ] as readonly (readonly [number, number])[],
} as const;

/** Rest inner radius of the net at depth fraction t ∈ [0, 1] (linear between profile samples). */
export function netRestRadius(t: number): number {
  const p = NET.profile;
  const x = Math.min(1, Math.max(0, t));
  for (let i = 1; i < p.length; i++) {
    const [t1, r1] = p[i]!;
    if (x <= t1) {
      const [t0, r0] = p[i - 1]!;
      return r0 + ((r1 - r0) * (x - t0)) / (t1 - t0);
    }
  }
  return p[p.length - 1]![1];
}

/**
 * The made shot's swish (v1.2 fidelity pass): a bulge that travels down the net with the ball.
 *
 * The net is deformed in net space (origin at the rim centre, y = 0 at the rim, negative down,
 * axes parallel to hoop space). Every vertex moves as a function of its rest depth fraction t
 * and its radial direction u only, so the cords, loops and knots at one place move together:
 *
 * - **Bulge** (radial, outwards): the row at rest depth y must clear the ball's cross-section in
 *   direction u, i.e. reach the support o·u + c(dy) of the ball's disc at that height (o: the
 *   ball's horizontal offset from the rim axis, c: its half-chord). The bulge uses a Gaussian
 *   stand-in for c, (BALL_R + margin)·exp(−dy²/2σ²) with σ ≥ BALL_R + margin, which is ≥ c
 *   everywhere and falls off smoothly above and below the ball. Rows already wider than that do
 *   not move (a C1 soft ramp, so a row starts and stops moving without a kink). The side the
 *   ball drifts towards bulges most; the far side stays put.
 * - **Stretch**: the net lengthens while the ball drags its lower rows (y' = y · (1 + stretch)).
 * - **Snap**: once the ball has left, the lower rows pull in past rest and settle (the rebound).
 *
 * Clearance is by construction: a vertex at radius ≥ netRestRadius(t) − NET_ENVELOPE_SLACK moves
 * out by the bulge, so it ends at ≥ o·u + c + (margin − slack − ramp/2). The ball follows its
 * authored path; the net follows the ball. Shared by the rig (`netDeform`) and the tests.
 */
export interface NetPose {
  /** False: exactly at rest (the rig skips the net). */
  active: boolean;
  /** Ball centre in net space (deformed frame: y as the ball really is, below the rim < 0). */
  ball: Vector3;
  /** Lengthening fraction of the rows below the rim (0 at rest). */
  stretch: number;
  /** Inward pull of the lower rows in scene units (the rebound; 0 at rest, may be negative). */
  snap: number;
}

export const newNetPose = (): NetPose => ({ active: false, ball: new Vector3(), stretch: 0, snap: 0 });

/** How far inside the profile a master net vertex may sit (the GLB test's tolerance). */
export const NET_ENVELOPE_SLACK = 0.012;
/**
 * Bulge shape: `margin` = slack + ramp/2 + a 0.008 gap the ball always keeps from the cords;
 * `sigma` ≥ BALL_R + margin so the Gaussian covers the ball's half-chord; `ramp` = width of the
 * soft start of each row's movement.
 */
export const NET_BULGE = { margin: 0.03, sigma: 0.3, ramp: 0.02 } as const;
/** Top rows (above this depth fraction) never snap: they hang from the hooks. */
const SNAP_FROM = 0.25;

/** C1 ramp: 0 below 0, a parabola over [0, ε], then x − ε/2. */
const softRamp = (x: number, eps: number) => (x <= 0 ? 0 : x < eps ? (x * x) / (2 * eps) : x - eps / 2);

/** Rest depth (net space, ≤ 0) of the deformed height y under a stretch. */
export const netRestY = (y: number, stretch: number) => (y < 0 ? y / (1 + stretch) : y);

/** Bulge reach before the soft ramp: the Gaussian cover of the ball at rest-space distance dy. */
export function netBulgeCover(dy: number): number {
  const { margin, sigma } = NET_BULGE;
  return (BALL_R + margin) * Math.exp(-(dy * dy) / (2 * sigma * sigma));
}

/**
 * Weight of the ball's horizontal drift in the bulge at rest-space distance dy: 1 wherever the
 * ball has a cross-section (|dy| ≤ BALL_R, where clearance needs it), fading to 0 a quarter unit
 * beyond, so rows far from the ball never feel its drift.
 */
export function netOffsetWeight(dy: number): number {
  const s = Math.min(1, Math.max(0, (Math.abs(dy) - BALL_R) / 0.25));
  return 1 - s * s * (3 - 2 * s);
}

/** Weight of the snap at depth fraction t (0 for the top rows, 1 at the bottom). */
export function netSnapWeight(t: number): number {
  const s = Math.min(1, Math.max(0, (t - SNAP_FROM) / (1 - SNAP_FROM)));
  return s * s * (3 - 2 * s);
}

/**
 * Radial displacement (scene units, + outwards) of the net row at rest depth fraction t
 * (0 rim … 1 bottom) in horizontal unit direction (ux, uz), for a net pose.
 */
export function netOpening(t: number, ux: number, uz: number, pose: NetPose): number {
  if (!pose.active || t <= 0) return 0;
  const tc = Math.min(1, t);
  const dy = -tc * NET.depth - netRestY(pose.ball.y, pose.stretch);
  const need = (pose.ball.x * ux + pose.ball.z * uz) * netOffsetWeight(dy) + netBulgeCover(dy);
  return softRamp(need - netRestRadius(tc), NET_BULGE.ramp) - pose.snap * netSnapWeight(tc);
}

/** The net's deformed inner radius at rest depth fraction t in direction (ux, uz). */
export function netInnerRadius(t: number, ux: number, uz: number, pose: NetPose): number {
  return netRestRadius(t) + netOpening(t, ux, uz, pose);
}

// ── Hoop recoil: the rim on its bracket and the board on the arm answer the net's tug ──
/**
 * Pivots in hoop space, measured from the master at HOOP_SCALE (the `rim` and `backboard` nodes'
 * origins in the exported GLB; tests/sports.test.ts checks them). Both pitch about +x: positive
 * tips the front (+z) down. The rim hinges on the bracket plate's back-bottom edge (the edge it
 * bears on, 1.5 mm proud of the board face), the board on the centre of its flat back (where the
 * stand's back plate holds it).
 */
export const RIM_HINGE = new Vector3(0, 1.53, -0.0071);
export const BOARD_PIVOT = new Vector3(0, 2.0847, -0.1249);
/** Recoil limits (degrees). */
export const RECOIL_LIMIT = { rimDeg: 3, boardDeg: 0.8 } as const;

const _q = new Vector3();
/**
 * Hoop-space point p carried by the recoil: the rim's hinge pitch, then the board's (the rim is
 * mounted on the board face). Pure; used by the rig (nodes) and the choreography (net space).
 */
export function recoilPoint(p: Vector3, boardPitch: number, rimPitch: number, out = new Vector3()): Vector3 {
  _q.copy(p).sub(RIM_HINGE);
  const c1 = Math.cos(rimPitch), s1 = Math.sin(rimPitch);
  out.set(_q.x, _q.y * c1 - _q.z * s1, _q.y * s1 + _q.z * c1).add(RIM_HINGE).sub(BOARD_PIVOT);
  const c2 = Math.cos(boardPitch), s2 = Math.sin(boardPitch);
  return out.set(out.x, out.y * c2 - out.z * s2, out.y * s2 + out.z * c2).add(BOARD_PIVOT);
}

/** Ball rest positions (ball centre, sports_root space). */
export const BALL_AT = {
  /** Host staging: the far side, from where the ball is passed to the guest. */
  host: new Vector3(1.45, BALL_R, 0.05),
  /** Guest-ready presentation: foreground left, resting on the floor. */
  guest: new Vector3(-0.55, BALL_R, 0.75),
  /** Made shot: settles below and slightly in front of the hoop. */
  made: new Vector3(0.3, BALL_R, 0.12),
  /**
   * Airball: rolled out past the hoop's left side, behind the backboard's plane, so the
   * declined still sits clearly apart from guest-ready and made (≥1.2 ball diameters on
   * screen). The airball flies in the vertical plane from the guest spot towards this spot.
   */
  missed: new Vector3(-0.77, BALL_R, -1.75),
} as const;

/** Descending through rim height, the airball is this far screen-left of the rim centre. */
export const MISS_OFFSET = 0.95;

/** Net deformation hook (the model builds the net; the rig drives it with a NetPose). */
export interface NetDeform {
  update(pose: NetPose): void;
}

/**
 * Motion bounds box: the key light aims at its centre and box-framed tools (lookdev) fit it, so
 * it stays fixed with the approved look. The scene frames the camera with silhouette points of
 * every path; the declined rest lies behind this box but well inside its framed view.
 */
export const SPORTS_BOUNDS = new Box3(new Vector3(-1.2, 0, -1.2), new Vector3(1.8, 2.9, 1.1));

/**
 * Backdrop wall for this scene (studio sweep wall z), pushed back like Birthday's and Dinner's so
 * the airball's landing and the declined rest spot sit on flat floor, clear of the cove: on the
 * default wall the cove rose under the resting ball and sliced its contact shadow.
 */
export const SPORTS_WALL_Z = -4.2;
