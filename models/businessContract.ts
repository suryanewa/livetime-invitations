import { Box3, Vector3 } from 'three';
import { cm, REFERENCE_CM } from './worldScale.ts';

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
/**
 * Scan units → stage units for the reader: 0.919 w × 1.369 h × 0.77 d. v1.2.1 shrank it from 1 so
 * the badge leads the frame (at 1 the reader was 56 % of the frame height and the card 31 %): the
 * holder's side clips still land on the glass (0.031 inside its edge), and the card, pressed high
 * on the face, overhangs the reader's top as v1.1's card did, leaving the lower glass for the
 * status display.
 */
export const READER_SCALE = 0.72;
/**
 * Real-world size, for the physics: the master's card is 0.472 scan units wide and a CR80 card is
 * 54 mm wide, so one stage unit is 54 / (0.472 × BADGE_SCALE) ≈ 76.3 mm.
 */
export const MM_PER_UNIT = 54 / (0.472 * BADGE_SCALE);
/**
 * World units per Business scene unit (v1.4, models/worldScale.ts): the card is a CR80 card,
 * 5.4 cm on its short side, so one scene unit (MM_PER_UNIT, 76.3 mm) is 0.381 world units. The
 * holder is then 5.7 × 8.9 cm and the reader 7.0 × 10.4 × 5.9 cm. The whole scene (the hang, the
 * hook, the card's swing and press) scales together; the pendulum was already computed at the
 * card's real size. The scene root carries the scale.
 */
export const BUSINESS_WORLD_SCALE = cm(REFERENCE_CM.cardShortSide) / (0.472 * BADGE_SCALE);

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
export const HANG_PIVOT = new Vector3(-0.48, 2.1, 0.05);
/** Strap anchors: off-frame above the stage. */
export const LANYARD_TOP_Y = 3.9;
export const LANYARD_SPREAD = 0.13;

// ── Reader ───────────────────────────────────────────────────────────────────────────
const R = READER_SCALE;
/** Reader placement: its plinth's bottom centre (business_root space). */
export const SCANNER_POS = new Vector3(0.74, 0, -0.06);
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
 * Where the card meets the reader (face space, stage units): centred, high on the glass. Its side
 * clips (the thickest part, which bear on the glass) sit 0.03 inside the glass's top and side
 * edges; the card's top half overhangs the reader's top edge (the body falls away behind it), so
 * the card covers the NFC mark and leaves the lower glass, where the status pictogram lights, in view.
 */
export const SCAN_SPOT = { u: 0, v: 0.265 } as const;
/**
 * Status pictogram (v1.5, runtime: models/business.ts): a dead-front glyph behind the lower glass,
 * below the pressed card and the NFC mark, invisible while off, lit in the status colour as a check
 * (accept) or a minus (decline), so the outcome reads by shape as well as colour. Face space, stage
 * units. `grid` is the size of the shell's 20-unit icon grid on the glass: strokes of 0.0347 (2.6 mm
 * at the card's real scale, 1.5× the printed NFC mark's 0.0236: a lit status mark, bolder than the
 * print); the check is 0.173 wide (13.2 mm). Polish 2 grew it 1.5× (from 0.21) so it reads on a
 * phone: the check 19 CSS px wide and the minus 18 × 5 on a 390 px phone (12.7 and 10.7 × 3.7
 * before). `extent` is the side of the light's texture in grid units, mapped onto the glass in face
 * space (the halo has faded to nothing before its edge). Centred across the glass at `v`: the whole
 * glyph stays 0.03 below the pressed card's lowest point (its upper glow tucks under the card's
 * edge), its halo inside the window; at rest it sits in the lower glass, 0.08 above the window's
 * lower edge (raised half a grid unit from −0.43, where the rest pose read bottom-heavy).
 */
export const STATUS_PICTOGRAM = { v: -0.422, grid: 0.315, extent: 36 } as const;
/** The pictogram's texture on the glass (face space, stage units): extent × grid / 20 on a side. */
export const STATUS_PICTOGRAM_SIZE = (STATUS_PICTOGRAM.extent * STATUS_PICTOGRAM.grid) / 20;
/** Face space z of the card centre when its clips touch the glass. */
export const SCAN_CONTACT_W = FACE.glass + HOLDER_CLIPS.halfDepth;

/**
 * Gasket compression at the scan press: the glass (with the LED, the target mark and the status
 * pictogram on it) gives by 0.6 mm and the gasket under it (0.77 mm at READER_SCALE 0.72) takes it. The
 * card itself never deforms.
 */
export const PRESS_DEPTH = 0.6 / MM_PER_UNIT;

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
export const BUSINESS_BOUNDS = new Box3(new Vector3(-1.0, 0, -0.45), new Vector3(SCANNER_POS.x + READER.width / 2, 2.34, 0.45));
