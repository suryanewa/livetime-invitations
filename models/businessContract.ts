import { Box3, Vector3 } from 'three';

/**
 * Business contract (v1.2): the all-access badge and RFID/NFC reader masters
 * (models/masters/all-access-badge.glb, rfid-nfc-reader.glb) in stage units.
 *
 * Every number below is measured from the masters (scan units: `scripts/masters/inspect.ts` plus
 * vertex slices of the snap hook, the holder slot, the strap and the reader's face assembly) and
 * multiplied by the recipe's scale. tests/business.test.ts re-measures the exported GLB.
 *
 * Spaces
 * - clip space = `card_authored` = `card_secondary` = `clip_pivot` at rest: origin at the swivel
 *   eye's centre, where the eye hangs in the D-ring's bottom bar (the hang pivot), master axes
 *   (y up, +z towards the guest). `clip_pivot` pitches about x at the eye (the hook on its eye).
 * - card space = `card_mesh`: origin at the centre of the clear holder's box.
 * - reader face space = `scanner_face` (the master's `front_assembly`): +y up the 11.6° lean, +z
 *   the reading face's outward normal.
 */

export type CardTemplate = 'light' | 'dark';

/** Scan units → stage units for the badge: the holder (0.496 × 0.776 scan) is 0.744 × 1.164. */
export const BADGE_SCALE = 1.5;
/** Scan units → stage units for the reader (1.276 w × 1.902 h × 1.07 d). */
export const READER_SCALE = 1;
/**
 * Real-world size, for the physics: the master's card is 0.472 scan units wide and a CR80 card is
 * 54 mm wide, so one stage unit is 54 / (0.472 × BADGE_SCALE) ≈ 76.3 mm.
 */
export const MM_PER_UNIT = 54 / (0.472 * BADGE_SCALE);

const B = BADGE_SCALE;
/** The swivel eye's origin in the badge master (scan units): the hang pivot. */
export const EYE_Y = -0.0073;
/** Badge master y (scan) → clip space y (stage units). */
const clipY = (y: number) => (y - EYE_Y) * B;

/** Clear holder (the rigid body the guest handles): width, height, thickness. */
export const CARD = { width: 0.496 * B, height: 0.776 * B, depth: 0.0234 * B } as const;
/** Holder side clips: the thickest part of the holder (±0.025 scan), so they meet the reader first. */
export const HOLDER_CLIPS = { x: 0.258 * B, halfDepth: 0.025 * B, y0: (-0.726 + 0.564) * B, y1: (-0.404 + 0.564) * B } as const;
/** Holder centre below the hang pivot (clip space y). Master holder box y −0.952..−0.176. */
export const CARD_OFFSET_Y = clipY((-0.952 - 0.176) / 2);
/** The printed card inside the holder (0.472 × 0.708 scan). */
export const CARD_PRINT = { width: 0.472 * B, height: 0.708 * B } as const;
/** The holder's slot (card space): a stadium below the top strip, y −0.224..−0.190, |x| ≤ 0.053. */
export const SLOT = {
  top: (-0.19 + 0.564) * B,
  bottom: (-0.224 + 0.564) * B,
  halfWidth: 0.053 * B,
  /** Top of the holder (the strip above the slot ends here). */
  stripTop: (-0.176 + 0.564) * B,
} as const;

/**
 * Snap hook (clip space), from vertex slices of `snap_hook_body`: a C in the y–z plane
 * (|x| ≤ 0.024 scan). Back leg at z −0.038, a U whose centreline radius is 0.038 about
 * (y −0.165, z 0), a front leg at z +0.038 up to the nose (top −0.132), and the gate pinned at the
 * top front (gate_pin), closing the 0.024 gap between the pin housing and the nose. The gate opens
 * inwards: positive rotation about x swings its free end towards −z.
 */
export const HOOK = {
  /** gate_pin origin (the gate's hinge). */
  pin: new Vector3(0, clipY(-0.101), 0.033 * B),
  /** Free gap between the pin housing (top) and the nose (bottom), clip space y. */
  gapTop: clipY(-0.108),
  gapBottom: clipY(-0.132),
  /** Front and back leg centreline z (±). */
  legZ: 0.038 * B,
  /** U arc centre (y; z = 0) and centreline radius. */
  arcY: clipY(-0.165),
  arcR: 0.038 * B,
  /** Wire half-thickness (centreline to surface). */
  tube: 0.011 * B,
  /** Where the back leg starts curving forward to the neck (clip y). */
  backTopY: clipY(-0.09),
  /** Gate length (pin to tip) and its free end's front face, closed. */
  gateLength: (0.1445 - 0.101) * B,
  gateFront: 0.0455 * B,
  /** Rearmost point of the hook body (clip space z). */
  back: -0.049 * B,
  /** Lowest point of the hook (clip y). */
  bottom: clipY(-0.214),
} as const;

/** Hook centreline (clip space y, z), back leg → U → front leg, for clearance checks. */
export function hookCentreline(step = 0.004): Vector3[] {
  const pts: Vector3[] = [];
  const { arcY, arcR, legZ, backTopY, gapBottom } = HOOK;
  for (let y = backTopY; y > arcY; y -= step) pts.push(new Vector3(0, y, -legZ));
  const n = Math.ceil((Math.PI * arcR) / step);
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI; // −z → bottom → +z
    pts.push(new Vector3(0, arcY - Math.sin(a) * arcR, -Math.cos(a) * arcR));
  }
  for (let y = arcY; y < gapBottom - HOOK.tube; y += step) pts.push(new Vector3(0, y, legZ));
  return pts;
}

/** Where the holder hangs: the point of the slot that rides on the U's lowest centreline point. */
export const RIDE_HANG = new Vector3(0, HOOK.arcY - HOOK.arcR, 0);
/** The same point in card space (on the slot's centre line, just under the strip). */
export const RIDE = new Vector3(0, RIDE_HANG.y - CARD_OFFSET_Y, 0);

/**
 * D-ring (under card_authored: it hangs from the strap and does not swing with the card; the
 * swivel eye pivots in its bottom bar). Top bar centre and wire radius, clip space.
 */
export const D_RING = { topY: clipY(0.098), wire: 0.012 * B, halfWidth: 0.104 * B } as const;
/**
 * Master strap (woven, 0.146 scan wide): two layers 0.0065 thick, sewn together with their centres
 * at z ±0.0052 from y 0.15 to 0.20 (the bar-tack stitching), folded round the D-ring's top bar.
 * The runtime strands start where the layers part (STRAP_TAB_TOP).
 */
export const STRAP = { width: 0.146 * B, thickness: 0.0065 * B, layerZ: 0.0052 * B, weaveTile: B / 12.2 } as const;
export const STRAP_TAB_TOP = clipY(0.205);

/** Guest-ready pivot (the swivel eye), business_root space. */
export const HANG_PIVOT = new Vector3(-0.55, 2.3, 0.05);
/** Strap anchors: off-frame above the stage. */
export const LANYARD_TOP_Y = 3.9;
export const LANYARD_SPREAD = 0.13;

// ── Reader ───────────────────────────────────────────────────────────────────────────
const R = READER_SCALE;
/** Reader placement: its plinth's bottom centre (business_root space). */
export const SCANNER_POS = new Vector3(0.8, 0, -0.08);
/** Master offsets: plinth bottom y −0.952, plinth centre z −0.00425. */
const RY = 0.952, RZ = 0.00425;
export const READER = {
  width: 1.276 * R,
  height: (0.9505 + RY) * R,
  /** Footprint z extents relative to SCANNER_POS. */
  back: (-0.5414 + RZ) * R,
  front: (0.5306 + RZ) * R,
} as const;
/** The reading face's frame (front_assembly) in scanner_root space, and its parts in face space. */
export const FACE = {
  origin: new Vector3(0, (0.15 + RY) * R, (0.2918 + RZ) * R),
  /** Up the face (leaning back 11.6°). */
  up: new Vector3(0, 0.9796, -0.2007),
  /** Outward normal of the glass. */
  normal: new Vector3(0, 0.2007, 0.9796),
  /** Glass front surface along the normal (face space z), and its extent. */
  glass: -0.004 * R,
  glassHalfWidth: 0.58 * R,
  glassY0: -0.8023 * R,
  glassY1: 0.7778 * R,
  /** Gasket ring: back plane and front surface (face space z), outer extent. */
  gasketBack: -0.02 * R,
  gasketFront: -0.006 * R,
  gasketHalfWidth: 0.5945 * R,
  /** Steel bezel round the window: the most it stands proud of the face plane (bottom corners). */
  bezelProud: 0.014 * R,
  /** LED bar centre (the glow quad's origin) and its extent (face space). */
  led: new Vector3(0, 0.49 * R, -0.0034 * R),
  ledHalfWidth: 0.085 * R,
  ledY0: 0.477 * R,
  ledY1: 0.503 * R,
  /** NFC target mark centre (face space). */
  icon: new Vector3(0, -0.1123 * R, -0.0036 * R),
  /** Lean of the face from vertical (rad). */
  lean: Math.asin(0.2007),
} as const;

/** Face space → business_root space (point). */
export function facePoint(u: number, v: number, w: number, out = new Vector3()): Vector3 {
  return out.copy(SCANNER_POS).add(FACE.origin).addScaledVector(FACE.up, v).addScaledVector(FACE.normal, w).setX(SCANNER_POS.x + u);
}

/**
 * Where the card meets the reader (face space): its centre over the NFC mark, low enough and
 * left enough that the LED bar stays clear of the card and the clip hardware above it, with the
 * holder's side clips inside the glass.
 */
export const SCAN_SPOT = { u: -0.17, v: -0.15 } as const;
/** Face space z of the card centre when its clips touch the glass. */
export const SCAN_CONTACT_W = FACE.glass + HOLDER_CLIPS.halfDepth;

/**
 * Gasket compression at the scan press: the glass (with the LED and target mark on it) gives
 * by 1 mm and the 1.07 mm gasket under it takes it. The card itself never deforms.
 */
export const PRESS_DEPTH = 1 / MM_PER_UNIT;

export const BUSINESS_NODES = [
  'business_root', 'card_authored', 'card_secondary', 'card_mesh', 'clip_pivot', 'clip_gate', 'd_ring', 'strap_material',
  'lanyard_anchor', 'lanyard_curve', 'scanner_root', 'scanner_face', 'scanner_gasket', 'scanner_pad', 'scanner_light',
  'scanner_glow', 'card_shadow', 'scanner_shadow',
] as const;

/**
 * Physical pendulum for the badge's secondary swing (the holder and card are one rigid body
 * hanging from the swivel eye). Plate of width w and height h whose centre hangs d below the
 * pivot: ω² = g·d / (d² + (w² + h²)/12) for the in-plane swing and g·d / (d² + h²/12) for the
 * out-of-plane pitch, in metres (MM_PER_UNIT). The damping ratio stands for the eye's friction in
 * the D-ring and the strap's drag: one visible overshoot, settled under 0.5° within about 0.7 s.
 */
export const PENDULUM = (() => {
  const m = MM_PER_UNIT / 1000;
  const d = -CARD_OFFSET_Y * m, w = CARD.width * m, h = CARD.height * m;
  const hz = (k2: number) => Math.sqrt((9.81 * d) / (d * d + k2)) / (2 * Math.PI);
  return { swingHz: hz((w * w + h * h) / 12), pitchHz: hz((h * h) / 12), damping: 0.4 };
})();

/** Complete motion bounds (every authored path), business_root space. */
export const BUSINESS_BOUNDS = new Box3(new Vector3(-1.05, 0, -0.62), new Vector3(SCANNER_POS.x + READER.width / 2, 2.62, 0.6));
