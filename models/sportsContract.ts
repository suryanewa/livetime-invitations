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
 * its waist (0.18) is smaller than the ball, so the made shot needs the net opened (`netOpenScale`).
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
 * Radius the net opens to while the made ball passes through (flare 1): the ball plus its drift
 * inside the deeper master net (the authored path carries the ball up to 0.12 off the rim axis
 * towards its landing spot) plus a hair of margin. Rows already wider than this do not move.
 * v1.2 foundation value; a ball-following bulge (scene agent) can replace the uniform opening.
 */
export const NET_OPEN_RADIUS = 0.375;

/**
 * Radial scale of the net at depth fraction t for a flare in [0, 1]: rows narrower than
 * NET_OPEN_RADIUS widen towards it, so at flare 1 the inner envelope is max(rest, open).
 * Shared by the rig's deformation and the clearance checks.
 */
export function netOpenScale(t: number, flare: number): number {
  const r = netRestRadius(t);
  return 1 + flare * Math.max(0, NET_OPEN_RADIUS / r - 1);
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

/**
 * Stylised net deformation hook (the model builds the net; the rig drives it). `flare` 0 is
 * at rest; positive values widen the lower rows and stretch the net downward.
 */
export interface NetDeform {
  update(flare: number, stretch: number): void;
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
