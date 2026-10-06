import { Box3, Vector3 } from 'three';
import { cm, REFERENCE_CM, WORLD_UNIT_CM } from './worldScale.ts';

/**
 * Sports (basketball) contract — shared by the model (`sportsPremium.ts`), the rig
 * (`sports.ts`, `sportsNet.ts`) and the choreography (`src/scenes/sports`). Everything the
 * sequences touch is fixed here, so geometry can be refined without breaking the made shot, the
 * airball, the net or the motion bounds.
 */

export type BallPreset = 'orange' | 'cream';

export const SPORTS_NODES = [
  'sports_root', 'ball_authored', 'ball_secondary', 'ball_mesh', 'hoop_root', 'backboard', 'rim', 'net',
  'ball_shadow', 'hoop_shadow',
] as const;

/** Ball radius (scene units): the basketball master (sphere r 0.9436 scan units) at BALL_R / 0.9436. */
export const BALL_R = 0.25;
/**
 * World units per Sports scene unit (v1.4, models/worldScale.ts): the ball is a mini (size 3)
 * basketball, 18 cm, so BALL_R (0.25) is 9 cm = 0.45 world units: 1.8. The whole scene (arcs,
 * net, pivots, rest spots) scales together, so every number here stays in scene units; the scene
 * root carries the scale.
 */
export const SPORTS_WORLD_SCALE = cm(REFERENCE_CM.miniBall / 2) / BALL_R;
/** Centimetres per Sports scene unit (36). */
export const SPORTS_CM_PER_UNIT = WORLD_UNIT_CM * SPORTS_WORLD_SCALE;
const su = (centimetres: number) => centimetres / SPORTS_CM_PER_UNIT;
/**
 * The ball's mass (kg): a 7" rubber mini (size 3) basketball. Spalding's basketball size guide
 * (https://www.spalding.com/size-guide/basketball, read 2026-10-06) gives the Mini, size 3, as
 * 22" in circumference (7.0", 17.8 cm across: our 18 cm ball) and 10.5 oz: 0.298 kg. Strikes on
 * the hoop scale by it (J = m·Δv·r about a pivot; `HoopSprings.kick` takes J over the part's inertia).
 */
export const BALL_MASS_KG = 10.5 * 0.028349523125;

/**
 * v1.5 proportions: one real product. The scene shows a **mini hoop system** of the SKLZ Pro Mini
 * Hoop System class (sklz.com: a 7" mini ball, a 14.5" spring-action rim, a 33 × 23" board on a
 * steel pole that adjusts from 3.5 to 7 ft, a weighted base), set at 4 ft. Before v1.5 the rim
 * was 1.6 × the ball (28.8 cm: the ball looked too big for it) and stood 62 cm above the floor on
 * a short pole with a round lamp base, its board nearly as wide as the rim was high: a toddler's
 * toy. Now:
 * - ball / rim inner diameter 18 / 36.8 = 0.49 (regulation 23.9 / 45.7 = 0.52; the product 0.48);
 * - the board is the master's (its width is 2.03 × the rim, as on every mini hoop: SKLZ 2.28,
 *   18"/9" door hoops 2.0; regulation's 4.0 is a court's), so at this rim it is 74.9 × 58.9 cm;
 * - the rim stands at 4 ft (121.9 cm), one of the product's settings, chosen so the system has a
 *   regulation hoop's silhouette: rim height / board width 1.63 (regulation 3.05 / 1.83 = 1.67);
 *   the pole below the board is 1.85 × the board's height (regulation 2.7, the old stand 1.13);
 * - the net hangs 31.5 cm (0.855 × the rim; regulation 40 / 45.7 = 0.875).
 */
export const HOOP_PRODUCT_CM = {
  /** 14.5" rim (inner diameter). */
  rimInner: 36.83,
  /** The 4 ft setting (rim top plane above the floor). */
  rimHeight: 121.92,
} as const;

/**
 * The hoop master's own measurements (scan units, `node --experimental-transform-types
 * scripts/masters/inspect.ts models/masters/basketball-hoop.glb`). Every hoop number below is one
 * of these at HOOP_SCALE, placed so the rim ring's centre lands on RIM_LOCAL; tests/sports.test.ts
 * re-measures the exported GLB against them.
 */
export const HOOP_MASTER = {
  /** Rim ring: centre, inner radius and tube radius. */
  ring: { x: 0, y: -0.1797, z: 0.0917, inner: 0.451, tube: 0.021 },
  /** Board frame (the wood frame's outline): half width, bottom, top, flat back and proud front lip. */
  frame: { halfWidth: 0.9169, bottom: -0.4927, top: 0.9492, back: -0.5453, front: -0.3389 },
  /** The grey laminate face inside the frame. */
  face: -0.4141,
  /** Centre of the board's flat back (`board-back`). */
  backCenterY: 0.2315,
  /** Rim bracket (plate, saddle and arms): the ring's mount on the board face. */
  bracket: { halfWidth: 0.2455, bottom: -0.394, top: -0.151, back: -0.4123, front: -0.3069 },
  /** Lowest net vertex (the tails). */
  netBottom: -0.9506,
} as const;

/** Rim ring: inner radius (the 14.5" rim) and tube (the master's, at HOOP_SCALE: 17 mm stock). */
const RIM_INNER = su(HOOP_PRODUCT_CM.rimInner / 2);
/** Scan units → scene units for the hoop master: its rim's inner radius becomes RIM.innerRadius. */
export const HOOP_SCALE = RIM_INNER / HOOP_MASTER.ring.inner;
export const RIM = { innerRadius: RIM_INNER, tube: HOOP_MASTER.ring.tube * HOOP_SCALE } as const;

/**
 * The stand (hoop space: origin on the floor below the arms' sleeve, +z towards the player),
 * code-authored in `sportsPremium.ts` as a portable system: a weighted, fillable base (51 cm wide,
 * 65 deep, 13 tall, two wheels at the back) entirely behind the board; a telescoping steel pole
 * (2" lower section, 1¾" upper section with a clamp collar and pin knob at the joint) rising from
 * the base's front and leaning forward 14° like every portable hoop's, so the rim overhangs the
 * base by 47 cm and the ball comes down well clear of it; a sleeve at its top carrying two
 * parallel box-section arms (a parallelogram, as on adjustable systems) to the plate on the
 * board's back.
 */
export const STAND = {
  base: { halfWidth: su(25.5), front: su(-25), back: su(-90), height: su(13), corner: su(9) },
  pole: { lower: su(5.08 / 2), upper: su(4.45 / 2), collarRadius: su(3.4), collarHeight: su(7) },
  /** The two box-section arms from the sleeve to the board's back plate. */
  arms: { width: su(3.2), height: su(1.9) },
} as const;

/** Hoop-space z of the board's flat back (the arms reach it 15 cm in front of the pole's axis). */
const BOARD_BACK_Z = su(15);
/**
 * Rim centre in hoop space: the 4 ft setting (rim height is measured to the top of the ring, as on
 * a court), the ring's centre where the master puts it in front of its board.
 */
export const RIM_LOCAL = new Vector3(0, su(HOOP_PRODUCT_CM.rimHeight) - RIM.tube, BOARD_BACK_Z + (HOOP_MASTER.ring.z - HOOP_MASTER.frame.back) * HOOP_SCALE);

/** A master point (scan units) in hoop space. */
export function hoopFromMaster(x: number, y: number, z: number, out = new Vector3()): Vector3 {
  const r = HOOP_MASTER.ring;
  return out.set(x - r.x, y - r.y, z - r.z).multiplyScalar(HOOP_SCALE).add(RIM_LOCAL);
}

/**
 * Board (hoop space): `front` is the front of the wood frame's proud lip, `face` the grey laminate
 * face inside it, `front − thickness` the flat back the arms' plate meets. The frame's outline is
 * width × height about (0, centerY).
 */
export const BOARD = (() => {
  const f = HOOP_MASTER.frame;
  const lo = hoopFromMaster(0, f.bottom, f.back), hi = hoopFromMaster(0, f.top, f.front);
  return {
    width: 2 * f.halfWidth * HOOP_SCALE,
    height: hi.y - lo.y,
    thickness: hi.z - lo.z,
    centerY: (lo.y + hi.y) / 2,
    front: hi.z,
    face: hoopFromMaster(0, 0, HOOP_MASTER.face).z,
  } as const;
})();

/**
 * Pole (hoop space): its axis runs from `foot` (on the base's top, near its front) to `head` (the
 * top of the sleeve, just above the upper arm), leaning forward; `collar` is the telescoping
 * joint's height fraction along it. `baseRadius` is the base's footprint as a disc (contact shadow).
 */
export const POLE = (() => {
  const head = new Vector3(0, BOARD.centerY + su(14), 0);
  const foot = new Vector3(0, STAND.base.height, su(-34));
  return {
    foot,
    head,
    lean: Math.atan2(head.z - foot.z, head.y - foot.y),
    collar: 0.42,
    radius: STAND.pole.lower,
    top: head.y,
    baseRadius: su(30),
  } as const;
})();

/** Rim centre in world (sports_root space): the made shot passes exactly through it. */
export const HOOP_ROOT = new Vector3(0.62, 0, -1.0);
export const RIM_CENTER = HOOP_ROOT.clone().add(RIM_LOCAL);
/** The master's rim bracket (plate, saddle and arms) in hoop space: the ring's mount on the board face. */
export const RIM_BRACKET = (() => {
  const b = HOOP_MASTER.bracket;
  return new Box3(hoopFromMaster(-b.halfWidth, b.bottom, b.back), hoopFromMaster(b.halfWidth, b.top, b.front));
})();

/**
 * Net: the master's knotted net (10 loops on 10 rim hooks, 6 knot rows of 10 knots: a diamond
 * lattice, each knot joined to two knots on the row above and two below), hanging NET.depth below
 * the rim centre. `profile` is its inner envelope at HOOP_SCALE (master scan: [depth fraction,
 * smallest radius of any cord, knot or loop vertex in that band], horizontal from the rim axis).
 * Since v1.5 the net is a simulated cord lattice (`sportsNet.ts`); these numbers describe the
 * master's bind pose.
 */
const NET_PROFILE_SCAN: readonly (readonly [number, number])[] = [
  [0, 0.4521], [0.083, 0.4138], [0.167, 0.38], [0.25, 0.345], [0.333, 0.3044], [0.417, 0.2605], [0.5, 0.2548],
  [0.583, 0.2266], [0.667, 0.2086], [0.75, 0.2154], [0.833, 0.1996], [0.917, 0.2052], [1, 0.2255],
];
export const NET = {
  depth: (HOOP_MASTER.ring.y - HOOP_MASTER.netBottom) * HOOP_SCALE,
  loops: 10,
  rows: 6,
  profile: NET_PROFILE_SCAN.map(([t, r]) => [t, r * HOOP_SCALE] as const),
} as const;

/** Rest inner radius of the master net at depth fraction t ∈ [0, 1] (linear between profile samples). */
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
 * The net as it hangs (v1.5 polish): the master's envelope, opened in its lower half so the
 * bottom ring's inner opening is 1.14 × the ball (a real net's bottom clears the ball; the ball
 * spreads the cords as it passes and they slide on it, rather than the net hugging it like a sock).
 * The simulation hangs the master's knots on this envelope (`sportsNet.ts`) and the made ball's net
 * drag engages against it. v1.7: the cords' rest lengths come from this hang (× 1.005: hung slack),
 * so the opened rows are no longer pre-stretched; gravity settles the net a few millimetres from it.
 */
export const NET_HANG = { inner: 0.285, from: 0.42, to: 0.62 } as const;
export function netHangRadius(t: number): number {
  const s = Math.min(1, Math.max(0, (t - NET_HANG.from) / (NET_HANG.to - NET_HANG.from)));
  return Math.max(netRestRadius(t), NET_HANG.inner * s * s * (3 - 2 * s));
}

// ── Hoop recoil: the rim on its bracket and the board on its arms answer the net's pull ──
/**
 * Pivots in hoop space, measured from the master at HOOP_SCALE (the `rim` and `backboard` nodes'
 * origins in the exported GLB; tests/sports.test.ts checks them). Both pitch about +x: positive
 * tips the front (+z) down. The rim hinges on the bracket plate's back-bottom edge (the edge it
 * bears on, proud of the board face), the board on the centre of its flat back (where the arms'
 * plate holds it).
 */
export const RIM_HINGE = hoopFromMaster(0, HOOP_MASTER.bracket.bottom, HOOP_MASTER.bracket.back);
export const BOARD_PIVOT = hoopFromMaster(0, HOOP_MASTER.backCenterY, HOOP_MASTER.frame.back);
/** Recoil limits (degrees): the spring-action rim's travel before it bottoms out, the board's play on its arms. */
export const RECOIL_LIMIT = { rimDeg: 3, boardDeg: 0.8 } as const;
/**
 * The rim's back stop (radians, < 0): tipping back about its hinge, the bracket plate's top edge
 * meets the board face (the plate stands 2 mm proud of the face, 27.6 cm tall: −0.42°).
 */
export const RIM_BACKSTOP = -Math.atan2(
  (HOOP_MASTER.bracket.back - HOOP_MASTER.face) * HOOP_SCALE,
  (HOOP_MASTER.bracket.top - HOOP_MASTER.bracket.bottom) * HOOP_SCALE,
);

const _q = new Vector3();
/**
 * Hoop-space point p carried by the recoil: the rim's hinge pitch, then the board's (the rim is
 * mounted on the board face). Pure; used by the rig (nodes) and the scene (net space).
 */
export function recoilPoint(p: Vector3, boardPitch: number, rimPitch: number, out = new Vector3()): Vector3 {
  _q.copy(p).sub(RIM_HINGE);
  const c1 = Math.cos(rimPitch), s1 = Math.sin(rimPitch);
  out.set(_q.x, _q.y * c1 - _q.z * s1, _q.y * s1 + _q.z * c1).add(RIM_HINGE).sub(BOARD_PIVOT);
  const c2 = Math.cos(boardPitch), s2 = Math.sin(boardPitch);
  return out.set(out.x, out.y * c2 - out.z * s2, out.y * s2 + out.z * c2).add(BOARD_PIVOT);
}

/** Ball rest positions the choreography aims for (ball centre, sports_root space). */
export const BALL_AT = {
  /** Host staging: the far side, from where the ball is passed to the guest. */
  host: new Vector3(1.95, BALL_R, 0.35),
  /** Guest-ready presentation: foreground left, resting on the floor. */
  guest: new Vector3(-0.72, BALL_R, 0.92),
} as const;

/**
 * Motion bounds box: the key light aims at its centre and box-framed tools (lookdev) fit it. The
 * scene frames the camera with silhouette points of every path (tails to rest included).
 */
export const SPORTS_BOUNDS = new Box3(new Vector3(-1.6, -0.05, -3.7), new Vector3(2.4, 4.8, 1.4));

/**
 * Backdrop wall for this scene (studio sweep wall z), pushed back like Birthday's and Dinner's so
 * the airball's bounces and the declined rest spot sit on flat floor, clear of the cove.
 */
export const SPORTS_WALL_Z = -5.4;
