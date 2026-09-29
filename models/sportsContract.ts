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

/** Ball radius (scene units). The rim's inner diameter is 1.6 × the ball's. */
export const BALL_R = 0.25;

/**
 * Hoop: `hoop_root` sits on the floor behind and right of the ball. In hoop space the pole
 * rises behind the board, the board's front face is at z = BOARD.front, and the rim ring is
 * centred at RIM_LOCAL in front of it.
 */
export const HOOP_ROOT = new Vector3(0.55, 0, -0.75);
export const BOARD = { width: 1.4, height: 0.92, thickness: 0.06, centerY: 2.08, front: 0.03 } as const;
export const POLE = { z: -0.3, top: 2.3, radius: 0.045, baseRadius: 0.3 } as const;
export const RIM = { innerRadius: 0.4, tube: 0.018 } as const;
export const RIM_LOCAL = new Vector3(0, 1.72, BOARD.front + RIM.innerRadius + 0.01);
/** Rim centre in world (sports_root) space: the made shot passes exactly through it. */
export const RIM_CENTER = HOOP_ROOT.clone().add(RIM_LOCAL);
/** Net: hangs from the rim ring, tapering to NET.bottomRadius over NET.depth. */
export const NET = { depth: 0.42, bottomRadius: 0.27, strands: 12, rows: 7 } as const;

/** Ball rest positions (ball centre, sports_root space). */
export const BALL_AT = {
  /** Host staging: the far side, from where the ball is passed to the guest. */
  host: new Vector3(1.45, BALL_R, 0.05),
  /** Guest-ready presentation: foreground left, resting on the floor. */
  guest: new Vector3(-0.55, BALL_R, 0.75),
  /** Made shot: settles below and slightly in front of the hoop. */
  made: new Vector3(0.3, BALL_R, 0.12),
  /** Airball: lands and settles away to the hoop's left. */
  missed: new Vector3(-0.85, BALL_R, -0.3),
} as const;

/** The miss passes this far left of the rim centre at rim height: an unmistakable airball. */
export const MISS_OFFSET = 0.95;

/**
 * Stylised net deformation hook (the model builds the net; the rig drives it). `flare` 0 is
 * at rest; positive values widen the lower rows and stretch the net downward.
 */
export interface NetDeform {
  update(flare: number, stretch: number): void;
}

/** Complete motion bounds (box fallback; the scene also supplies silhouette frame points). */
export const SPORTS_BOUNDS = new Box3(new Vector3(-1.2, 0, -1.2), new Vector3(1.8, 2.9, 1.1));
