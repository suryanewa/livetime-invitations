import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { Box3, BufferAttribute, BufferGeometry, Matrix4, Object3D, OrthographicCamera, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import type { Document, Node } from '@gltf-transform/core';
import type { KHRMaterialsVariants } from '@gltf-transform/extensions';
import { listTextureSlots } from '@gltf-transform/functions';
import { cameraDirection, fitCameraToBounds, PERSPECTIVE_FOV, solveHeroFits } from '../src/render/camera.ts';
import { HERO_FILL, PATH_CLEARANCE } from '../src/render/framing.ts';
import { SEAM_FRAME } from '../src/render/ballMaterial.ts';
import {
  BALL_AT, BALL_MASS_KG, BALL_R, BOARD, BOARD_PIVOT, HOOP_PRODUCT_CM, HOOP_ROOT, HOOP_SCALE, NET, netRestRadius, POLE, RECOIL_LIMIT, RIM, RIM_BACKSTOP, RIM_BRACKET,
  RIM_CENTER, RIM_HINGE, RIM_LOCAL, SPORTS_BOUNDS, SPORTS_CM_PER_UNIT, SPORTS_NODES, STAND, recoilPoint,
} from '../models/sportsContract.ts';
import { analyseNet, HOOP_SPRINGS, HoopSprings, NET_SIM, NetSim, NetSkin, netMeshKind, type NetLattice } from '../models/sportsNet.ts';
import { SportsNetChannel } from '../src/scenes/sports/net.ts';
import { FixedStepper } from '../src/motion/spring.ts';
import { boxIn, createIO, findNode } from '../scripts/masters/compose.ts';
import { BallTrack, BOUNCE, floorImpulse, GRAVITY, type Hit, MS, ROLL_DECEL, squashFor, squashForImpulse, surfaceContact, surfaceImpulse, SURFACES } from '../src/scenes/sports/ballPhysics.ts';
import {
  BANK_HIT, BANK_POINT, BANK_TIMING, CONTACT_AT, CONTACTS, DURATIONS, FACE_Z, frameFor, GUEST_ROT, HITS, HOOP_COLLIDERS, MADE_APEX, MISS_REST, NET_KEEP, NET_PASSAGE, newFrame,
  RELEASE_AT, RELEASES, REST, REST_AT, RISE_FROM, sampleSequence, sampleTrack, SCREEN_RIGHT, SHOT_AXES, SHOT_BACKSPIN, type SportsFrame,
} from '../src/scenes/sports/sequences.ts';
import * as sportsModel from '../models/sports.ts';
import type { SportsRig } from '../models/sports.ts';
import { farLayerShade, NET_FAR_SHADE, SPORTS_WALL_Z } from '../models/sports.ts';
import { COVE_RADIUS } from '../src/render/studio.ts';
import {
  BLEND_MARGIN, blendClearance, hitKick, hoopDistance, SPORTS_HERO_EXCLUDE, SPORTS_HERO_FILL, sportsFramePoints, sportsInterruptCut, SportsScene,
} from '../src/scenes/sports/index.ts';
import { type Change, planChange, type Showing } from '../src/scenes/sports/change.ts';
import type { CanonicalPose, SceneConfig, SequenceName } from '../src/core/types.ts';
import { netCost } from './netCost.ts';

const SEQS = ['host', 'accept', 'decline'] as const;

/** A Sports rig without the GLB (v1.7 scene tests): the ball's three nodes, the springs, no net. */
function fakeRig(): SportsRig {
  const root = new Object3D();
  const nodes: Record<string, Object3D> = {};
  for (const n of ['ball_authored', 'ball_secondary', 'ball_mesh']) nodes[n] = Object.assign(new Object3D(), { name: n });
  root.add(nodes.ball_authored!);
  nodes.ball_authored!.add(nodes.ball_secondary!);
  nodes.ball_secondary!.add(nodes.ball_mesh!);
  const ballShadow = Object.assign(new Object3D(), { setFootprint() {}, setHeight() {} });
  return {
    root, nodes, shadows: [], ballShadow, net: null, springs: new HoopSprings(), recoil: { set() {} }, ballRest: new Quaternion(), bounds: SPORTS_BOUNDS.clone(),
    setPreset() {}, dispose() {},
  } as unknown as SportsRig;
}
/** Sample a sequence's physics at t, tails included. */
const at = (seq: SequenceName, t: number) => sampleTrack(seq, t, newFrame());
const pose = (p: CanonicalPose) => frameFor(p, newFrame());
const close = (a: SportsFrame, b: SportsFrame, eps = 1e-6) => {
  expect(a.ballPos.distanceTo(b.ballPos)).toBeLessThan(eps);
  expect(a.ballRot.angleTo(b.ballRot)).toBeLessThan(eps);
  expect(Math.abs(a.squash - b.squash)).toBeLessThan(eps);
};
const horizontal = (p: Vector3, c: Vector3) => Math.hypot(p.x - c.x, p.z - c.z);
const toCm = (su: number) => su * SPORTS_CM_PER_UNIT;

/** Board as a box in world space. */
const BOARD_BOX = new Box3(
  new Vector3(HOOP_ROOT.x - BOARD.width / 2, BOARD.centerY - BOARD.height / 2, HOOP_ROOT.z + BOARD.front - BOARD.thickness),
  new Vector3(HOOP_ROOT.x + BOARD.width / 2, BOARD.centerY + BOARD.height / 2, HOOP_ROOT.z + BOARD.front),
);
/**
 * v1.7: the board as the solid it is: its body up to the laminate face (FACE_Z), and the frame's
 * proud lip around the face's opening (BOARD.opening) up to its front. The bank touches the face.
 */
const OPEN = { x0: HOOP_ROOT.x - BOARD.opening.halfWidth, x1: HOOP_ROOT.x + BOARD.opening.halfWidth, y0: BOARD.opening.bottom, y1: BOARD.opening.top };
const BOARD_SOLID = [
  new Box3(BOARD_BOX.min.clone(), BOARD_BOX.max.clone().setZ(FACE_Z)),
  new Box3(new Vector3(BOARD_BOX.min.x, BOARD_BOX.min.y, FACE_Z), new Vector3(OPEN.x0, BOARD_BOX.max.y, BOARD_BOX.max.z)),
  new Box3(new Vector3(OPEN.x1, BOARD_BOX.min.y, FACE_Z), BOARD_BOX.max.clone()),
  new Box3(new Vector3(BOARD_BOX.min.x, BOARD_BOX.min.y, FACE_Z), new Vector3(BOARD_BOX.max.x, OPEN.y0, BOARD_BOX.max.z)),
  new Box3(new Vector3(BOARD_BOX.min.x, OPEN.y1, FACE_Z), BOARD_BOX.max.clone()),
];
const boardDistance = (p: Vector3) => Math.min(...BOARD_SOLID.map((b) => b.distanceToPoint(p)));
/** Distance from a ball centre to the rim's ring tube (its surface). */
const ringDistance = (p: Vector3) => {
  const r = Math.hypot(p.x - RIM_CENTER.x, p.z - RIM_CENTER.z);
  return Math.hypot(r - (RIM.innerRadius + RIM.tube), p.y - RIM_CENTER.y) - RIM.tube;
};
/** The rim's bracket (plate, saddle, arms) in world space. */
const BRACKET_BOX = RIM_BRACKET.clone().translate(HOOP_ROOT);
const BASE_BOX = new Box3(
  new Vector3(HOOP_ROOT.x - STAND.base.halfWidth, 0, HOOP_ROOT.z + STAND.base.back),
  new Vector3(HOOP_ROOT.x + STAND.base.halfWidth, STAND.base.height, HOOP_ROOT.z + STAND.base.front),
);
const poleDistance = (p: Vector3) => {
  const a = HOOP_ROOT.clone().add(POLE.foot), b = HOOP_ROOT.clone().add(POLE.head), d = b.clone().sub(a);
  const u = Math.min(1, Math.max(0, p.clone().sub(a).dot(d) / d.lengthSq()));
  return p.clone().sub(a).addScaledVector(d, -u).length();
};

/** Velocity and acceleration by central differences (1 ms). */
const H = 1e-3;
const pos = (seq: SequenceName, t: number) => at(seq, t).ballPos;
const vel = (seq: SequenceName, t: number) => pos(seq, t + H).sub(pos(seq, t - H)).divideScalar(2 * H);
const acc = (seq: SequenceName, t: number) => pos(seq, t + H).add(pos(seq, t - H)).sub(pos(seq, t).multiplyScalar(2)).divideScalar(H * H);
/** World angular velocity (rad/s) from orientations 1 ms apart (central difference). */
const omega = (seq: SequenceName, t: number) => {
  const q0 = at(seq, t - H).ballRot, q1 = at(seq, t + H).ballRot;
  const d = q1.clone().multiply(q0.clone().invert());
  if (d.w < 0) d.set(-d.x, -d.y, -d.z, -d.w);
  const s = Math.sqrt(Math.max(0, 1 - d.w * d.w));
  const angle = 2 * Math.atan2(s, d.w);
  return s < 1e-12 ? new Vector3() : new Vector3(d.x, d.y, d.z).divideScalar(s).multiplyScalar(angle / (2 * H));
};
/** True while t lies in (or within a ms of) a floor contact, a strike on the board or the rim (v1.7), or the net. */
const inContact = (seq: SequenceName, t: number) => [...CONTACTS[seq], ...HITS[seq]].some((c) => t > c.at - 2 * H && t < c.at + BOUNCE.contactTime + 2 * H);
const inHit = (seq: SequenceName, t: number) => HITS[seq].some((c) => t > c.at - 2 * H && t < c.at + BOUNCE.contactTime + 2 * H);
const inNet = (seq: SequenceName, t: number) => seq === 'accept' && t > CONTACT_AT - 2 * H && t < NET_PASSAGE.exitAt + 2 * H;
const lastContact = (seq: SequenceName) => CONTACTS[seq][CONTACTS[seq].length - 1]!;

describe('Sports v1.5 proportions: one real mini hoop system', () => {
  it('ball, rim, board, height and net have the product\'s proportions', () => {
    // A 7" mini ball in a 14.5" rim: ball / rim 0.49 (regulation 0.52), rim / ball 2.05.
    expect(toCm(2 * BALL_R)).toBeCloseTo(18, 6);
    expect(toCm(2 * RIM.innerRadius)).toBeCloseTo(HOOP_PRODUCT_CM.rimInner, 6);
    expect((2 * BALL_R) / (2 * RIM.innerRadius)).toBeGreaterThan(0.45);
    expect((2 * BALL_R) / (2 * RIM.innerRadius)).toBeLessThan(0.53);
    // The 4 ft setting, measured to the top of the ring.
    expect(toCm(RIM_LOCAL.y + RIM.tube)).toBeCloseTo(121.92, 6);
    // A regulation hoop's silhouette: rim height / board width 1.63 (regulation 1.67).
    expect(RIM_LOCAL.y / BOARD.width).toBeGreaterThan(1.55);
    expect(RIM_LOCAL.y / BOARD.width).toBeLessThan(1.75);
    // The master board at this rim: 74.9 × 58.9 cm, width 2.03 × the rim (a mini hoop's).
    expect(toCm(BOARD.width)).toBeCloseTo(74.9, 0);
    expect(toCm(BOARD.height)).toBeCloseTo(58.9, 0);
    // The pole below the board is ≥ 1.8 × the board's height (the old stand: 1.13).
    expect((BOARD.centerY - BOARD.height / 2) / BOARD.height).toBeGreaterThan(1.8);
    // The net hangs 0.855 × the rim (regulation 0.875).
    expect(NET.depth / (2 * RIM.innerRadius)).toBeGreaterThan(0.8);
    expect(NET.depth / (2 * RIM.innerRadius)).toBeLessThan(0.9);
  });

  it('a portable stand: the base behind the board, the pole leaning forward, the rim overhanging the base', () => {
    expect((POLE.lean * 180) / Math.PI).toBeGreaterThan(10);
    expect((POLE.lean * 180) / Math.PI).toBeLessThan(18);
    // The base's front stays behind the board's back; the rim's centre is ≥ 60 cm in front of it.
    expect(STAND.base.front).toBeLessThan(BOARD.front - BOARD.thickness);
    expect(toCm(RIM_LOCAL.z - STAND.base.front)).toBeGreaterThan(60);
    // The pole's head reaches the arms behind the board; its foot sits on the base.
    expect(POLE.foot.z).toBeGreaterThan(STAND.base.back);
    expect(POLE.foot.z).toBeLessThan(STAND.base.front);
  });

  it('the rest net is narrower than the ball (so the ball must open it) and starts at the rim', () => {
    expect(Math.min(...NET.profile.map(([, r]) => r))).toBeLessThan(BALL_R);
    expect(Math.abs(netRestRadius(0) - RIM.innerRadius)).toBeLessThan(0.006);
  });
});

describe('Sports ball physics (ballPhysics.ts)', () => {
  it('standard gravity in scene units: 9.81 m/s² at 36 cm per unit', () => {
    expect(GRAVITY).toBeCloseTo(27.25, 2);
    expect(SPORTS_CM_PER_UNIT).toBeCloseTo(36, 9);
  });

  it('a 1.8 m drop rebounds to 1,035–1,085 mm (FIBA 2026, underside to underside) and compresses the ball 10 %', () => {
    const drop = 180 / SPORTS_CM_PER_UNIT;
    const vIn = Math.sqrt(2 * GRAVITY * drop);
    const v = new Vector3(0, -vIn, 0), w = new Vector3();
    const up = floorImpulse(v, w);
    const rebound = (up * up) / (2 * GRAVITY) * SPORTS_CM_PER_UNIT;
    expect(rebound).toBeGreaterThan(103.5);
    expect(rebound).toBeLessThan(108.5);
    expect(BOUNCE.restitution).toBeGreaterThanOrEqual(0.76);
    expect(BOUNCE.restitution).toBeLessThanOrEqual(0.84);
    expect(squashFor(vIn)).toBeCloseTo(0.1, 2);
    expect(squashFor(5.94 * MS)).toBeCloseTo(0.1, 9);
  });

  it('spin couples through friction: backspin checks up, topspin runs on, no spin leaves rolling', () => {
    const bounce = (spinR: number) => {
      // Moving along +x, falling at 4 su/s; spinR = ω·R about −z (positive = topspin).
      const v = new Vector3(2, -4, 0), w = new Vector3(0, 0, -spinR / BALL_R);
      floorImpulse(v, w);
      return { v: v.x, roll: -w.z * BALL_R };
    };
    const none = bounce(0), back = bounce(-3), top = bounce(3);
    expect(back.v).toBeLessThan(none.v - 0.5);
    expect(top.v).toBeGreaterThan(none.v + 0.5);
    // No spin: grips and leaves nearly rolling (e_t reverses the contact point a little).
    expect(Math.abs(none.v - none.roll) / none.v).toBeLessThan(0.3);
    // Angular momentum about the contact point is conserved by a gripping bounce.
    const L = (v: number, r: number) => v + BOUNCE.inertia * r;
    expect(L(back.v, back.roll)).toBeCloseTo(L(2, -3), 9);
  });

  it('v1.7: a strike on any surface is the floor\'s impulse turned: +y is floorImpulse, and angular momentum about the contact point is conserved for any normal', () => {
    const up = new Vector3(0, 1, 0);
    const { restitution: e, friction: mu, tangentialRestitution: et } = BOUNCE;
    // Falling balls with every kind of spin (gripping and sliding): identical to the floor's.
    for (const [v0, w0] of [[new Vector3(2, -4, 0), new Vector3(0, 0, 12)], [new Vector3(-1, -9, 3), new Vector3(30, -4, 7)], [new Vector3(0.3, -0.5, -0.2), new Vector3(0, 0, 0)]] as const) {
      const a = v0.clone(), aw = w0.clone(), b = v0.clone(), bw = w0.clone();
      floorImpulse(a, aw);
      surfaceImpulse(b, bw, up, e, mu, et);
      expect(a.distanceTo(b)).toBeLessThan(1e-12);
      expect(aw.distanceTo(bw)).toBeLessThan(1e-12);
    }
    // Any normal: L about the contact point, per unit mass, R n × v + α R² ω, is unchanged; the
    // normal velocity reverses with e; a ball moving away is untouched.
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
    for (let i = 0; i < 200; i++) {
      const n = new Vector3(rnd(), rnd(), rnd()).normalize();
      const v = new Vector3(rnd(), rnd(), rnd()).multiplyScalar(8), w = new Vector3(rnd(), rnd(), rnd()).multiplyScalar(40);
      if (v.dot(n) > -0.05) v.addScaledVector(n, -v.dot(n) - 0.5);
      const Lc = (vv: Vector3, ww: Vector3) => n.clone().cross(vv).multiplyScalar(BALL_R).addScaledVector(ww, BOUNCE.inertia * BALL_R * BALL_R);
      const L0 = Lc(v, w), vn = v.dot(n);
      const k = SURFACES[i % 2 ? 'board' : 'rim'];
      const jn = surfaceImpulse(v, w, n, k.restitution, k.friction, k.tangentialRestitution);
      expect(jn).toBeCloseTo(-(1 + k.restitution) * vn, 9);
      expect(v.dot(n)).toBeCloseTo(-k.restitution * vn, 9);
      expect(Lc(v, w).distanceTo(L0)).toBeLessThan(1e-9);
      const away = n.clone().multiplyScalar(2), aw = new Vector3(1, 2, 3);
      expect(surfaceImpulse(away, aw, n, k.restitution, k.friction, k.tangentialRestitution)).toBe(0);
      expect(away.distanceTo(n.clone().multiplyScalar(2))).toBe(0);
    }
  });

  it('v1.7: the glass and the ring rebound the ball at their sourced restitutions', () => {
    // FIBA: a ball dropped on the backboard from 1.8 m rebounds ≥ 50 %: e ≥ 0.707, below the
    // floor's (the ball's own) 0.77. The ring and its support absorb 35–50 % of the impact energy:
    // 0.77 × √(0.5…0.65) = 0.54…0.62.
    expect(SURFACES.board.restitution).toBeGreaterThanOrEqual(Math.SQRT1_2);
    expect(SURFACES.board.restitution).toBeLessThan(BOUNCE.restitution);
    expect(SURFACES.rim.restitution).toBeGreaterThanOrEqual(BOUNCE.restitution * Math.sqrt(0.5) - 1e-9);
    expect(SURFACES.rim.restitution).toBeLessThanOrEqual(BOUNCE.restitution * Math.sqrt(0.65) + 1e-9);
    expect(SURFACES.rim.friction).toBeCloseTo(0.5, 9);
    for (const h of HITS.decline) {
      expect(h.rebound, `${h.surface} ${h.at}`).toBeCloseTo(SURFACES[h.surface].restitution * h.speed, 9);
      expect(h.squash, `${h.surface} ${h.at}`).toBeCloseTo(squashForImpulse((1 + SURFACES[h.surface].restitution) * h.speed), 9);
    }
    expect(BANK_HIT.rebound).toBeCloseTo(SURFACES.board.restitution * BANK_HIT.speed, 9);
  });

  it('v1.7: spin on the glass as Cross predicts: rising into it the backspin is kicked down, falling onto it the ball leaves overspinning, a slow touch grips', () => {
    const n = new Vector3(0, 0, 1), { restitution: e, friction: mu, tangentialRestitution: et } = SURFACES.board;
    // Backspin about the roll axis of a shot towards the board (−z): ω along +x, the top towards the shooter.
    const back = new Vector3(2 * Math.PI * 2, 0, 0);
    // Rising into the glass: the contact point slides up, friction drives the ball down by μ × the normal impulse.
    const vr = new Vector3(0, 3.6, -2.6), wr = back.clone();
    const jr = surfaceImpulse(vr, wr, n, e, mu, et);
    expect(vr.y).toBeCloseTo(3.6 - mu * jr, 9);
    expect(vr.z).toBeGreaterThan(0);
    // The backspin's roll turns (+x is topspin for the rebound towards +z): the glass took most of it.
    expect(wr.x).toBeLessThan(back.x - 10);
    // Falling onto the glass: it slides down, friction holds it up, and it leaves with overspin
    // (ω R about the rebound's roll axis above its forward speed).
    const vf = new Vector3(0, -5, -1.5), wf = back.clone();
    surfaceImpulse(vf, wf, n, e, mu, et);
    expect(vf.y).toBeGreaterThan(-5);
    expect(wf.x * BALL_R).toBeGreaterThan(vf.z);
    // A slow touch grips: the contact point's slip reverses by e_t.
    const vs = new Vector3(0.05, -0.02, -2), ws = new Vector3();
    const slip = (v: Vector3, w: Vector3) => w.clone().cross(n).multiplyScalar(-BALL_R).add(v).setZ(0);
    const before = slip(vs, ws);
    surfaceImpulse(vs, ws, n, e, mu, et);
    expect(slip(vs, ws).distanceTo(before.multiplyScalar(-et))).toBeLessThan(1e-9);
  });

  it('v1.7: a drawn strike holds the touching side on the surface and squashes along its normal; the ball leaves at the rebound', () => {
    const board = HOOP_COLLIDERS[0]!;
    const track = new BallTrack();
    const st = { t: 1, p: new Vector3(0.5, 4, FACE_Z + BALL_R), v: new Vector3(1, 2, -3), w: new Vector3(10, 0, 0), q: new Quaternion() };
    const hit = surfaceContact(track, st, board);
    expect(track.hits).toEqual([hit]);
    expect(hit.normal.z).toBe(1);
    const p = new Vector3(), q = new Quaternion(), axis = new Vector3();
    for (let t = 1; t <= 1 + BOUNCE.contactTime; t += 0.0005) {
      const s = track.sample(t, p, q);
      track.squashAxis(t, axis);
      if (t < 1 + BOUNCE.contactTime - 1e-9) expect(axis.z).toBe(1);
      // The drawn near side (centre − R (1 − s) n) stays on the face.
      expect(p.z - BALL_R * (1 - s) - FACE_Z).toBeCloseTo(0, 6);
    }
    expect(st.v.z).toBeCloseTo(hit.rebound, 9);
    expect(st.t).toBeCloseTo(1 + BOUNCE.contactTime, 12);
  });

  it('every floor contact rebounds at e × the impact speed, until a rebound would rise under 1 cm', () => {
    for (const seq of SEQS) {
      const cs = CONTACTS[seq];
      expect(cs.length, seq).toBeGreaterThanOrEqual(5);
      expect(cs.length, seq).toBeLessThan(40);
      for (const [i, c] of cs.entries()) {
        if (i < cs.length - 1) expect(c.rebound, `${seq} ${i}`).toBeCloseTo(BOUNCE.restitution * c.speed, 9);
        // Successive impacts arrive at the speed the last rebound left with.
        if (i > 0) expect(c.speed, `${seq} ${i}`).toBeCloseTo(cs[i - 1]!.rebound, 6);
      }
      expect(lastContact(seq).rebound).toBe(0);
      expect(BOUNCE.restitution * lastContact(seq).speed).toBeLessThan(BOUNCE.minBounceSpeed);
    }
  });

  it('squash follows the impact, along the floor normal, and the drawn ball never enters or hovers off the floor', () => {
    for (const seq of SEQS) {
      let peak = 0;
      for (let t = 0; t <= REST_AT[seq]; t += 0.0005) {
        const f = at(seq, t);
        expect(f.squash).toBeGreaterThanOrEqual(0);
        expect(f.squash).toBeLessThanOrEqual(0.1);
        // v1.7: on the board or the ring the squash runs along the strike's normal (tested with the bank).
        if (inHit(seq, t)) continue;
        expect(f.squashAxis.y).toBe(1);
        peak = Math.max(peak, f.squash);
        // The drawn bottom (vertical scale 1 − squash about the centre) is never below the floor…
        const bottom = f.ballPos.y - BALL_R * (1 - f.squash);
        expect(bottom, `${seq} ${t.toFixed(4)}`).toBeGreaterThanOrEqual(-1e-5);
        // …and while it is squashed it is exactly on it (no hover during a contact).
        if (f.squash > 1e-4) expect(bottom, `${seq} ${t.toFixed(4)}`).toBeLessThan(1e-5);
      }
      expect(peak, seq).toBeCloseTo(Math.max(...CONTACTS[seq].map((c) => c.squash)), 2);
    }
    // The hardest floor impact (the declined ball's first, from the ring's height) compresses ≈ 8 %;
    // small hops barely at all.
    expect(CONTACTS.decline[0]!.squash).toBeGreaterThan(0.07);
    expect(CONTACTS.decline[0]!.squash).toBeLessThan(0.1);
  });

  it('after the last bounce the ball rolls without sliding and decelerates by rolling resistance to rest', () => {
    for (const seq of SEQS) {
      const from = lastContact(seq).at + BOUNCE.contactTime + 0.05;
      let rolling = 0;
      for (let t = from; t < REST_AT[seq] - 0.01; t += 0.005) {
        const v = vel(seq, t).setY(0);
        const w = omega(seq, t);
        const expected = new Vector3(0, 1, 0).cross(v).divideScalar(BALL_R);
        expect(w.distanceTo(expected), `${seq} ${t.toFixed(3)}`).toBeLessThan(0.05 * Math.max(1, expected.length()));
        if (v.length() > 0.01) {
          rolling++;
          expect(acc(seq, t).setY(0).length(), `${seq} ${t.toFixed(3)}`).toBeCloseTo(ROLL_DECEL, 1);
        }
      }
      expect(rolling, seq).toBeGreaterThan(3);
      // At rest: no motion at all.
      expect(pos(seq, REST_AT[seq] + 1).distanceTo(pos(seq, REST_AT[seq]))).toBe(0);
    }
  });
});

describe('Sports choreography', () => {
  it('each sequence starts on its canonical pose and its physics comes to rest exactly on the next', () => {
    close(at('host', 0), pose('host-ready'));
    close(at('host', REST_AT.host), pose('guest-ready'));
    for (const seq of ['accept', 'decline'] as const) close(at(seq, 0), pose('guest-ready'));
    close(at('accept', REST_AT.accept), pose('accepted'));
    close(at('decline', REST_AT.decline), pose('declined'));
    // The director samples [0, duration]; the rest (the tail) plays in the scene's continuous channel.
    for (const seq of SEQS) {
      close(sampleSequence(seq, DURATIONS[seq] + 5, newFrame()), at(seq, DURATIONS[seq]));
      expect(REST_AT[seq]).toBeGreaterThan(DURATIONS[seq]);
      expect(REST_AT[seq]).toBeLessThan(8);
    }
    // The pass comes to rest exactly on the guest spot, in the seam frame's orientation.
    expect(REST.guest.distanceTo(BALL_AT.guest)).toBeLessThan(1e-6);
    expect(pose('guest-ready').ballRot.angleTo(GUEST_ROT)).toBeLessThan(1e-6);
  });

  it('has no discontinuities in position or spin (1 ms samples, tails included)', () => {
    for (const seq of SEQS) {
      let prev = at(seq, 0);
      for (let i = 1; i <= REST_AT[seq] * 1000; i++) {
        const cur = at(seq, i / 1000);
        expect(cur.ballPos.distanceTo(prev.ballPos)).toBeLessThan(0.02);
        expect(cur.ballRot.angleTo(prev.ballRot)).toBeLessThan(0.03);
        prev = cur;
      }
    }
  });

  it('every Accept passes through the rim centre at the contact beat without touching the ring', () => {
    expect(at('accept', CONTACT_AT).ballPos.distanceTo(RIM_CENTER)).toBeLessThan(1e-6);
    let apex = 0;
    for (let i = 0; i <= REST_AT.accept * 1000; i++) {
      const p = at('accept', i / 1000).ballPos;
      apex = Math.max(apex, p.y);
      if (Math.abs(p.y - RIM_CENTER.y) < BALL_R + RIM.tube && horizontal(p, RIM_CENTER) < RIM.innerRadius + BALL_R + RIM.tube + 0.05) {
        expect(horizontal(p, RIM_CENTER) + BALL_R).toBeLessThan(RIM.innerRadius - RIM.tube + 1e-6);
      }
    }
    expect(apex).toBeGreaterThan(RIM_CENTER.y + 0.6);
    expect(apex).toBeCloseTo(MADE_APEX, 3);
  });

  it('v1.7: every Decline banks hard off the glass on the beat, rattles the ring\'s top and never goes in', () => {
    // The glass on the 0.95 s beat, at BANK_POINT: 28 cm above the rim's top, on the laminate.
    expect(BANK_HIT).toBe(HITS.decline[0]);
    expect(BANK_HIT.surface).toBe('board');
    expect(BANK_HIT.at).toBeCloseTo(CONTACT_AT, 9);
    expect(BANK_HIT.point.distanceTo(BANK_POINT)).toBeLessThan(1e-6);
    expect(toCm(BANK_POINT.y - (RIM_CENTER.y + RIM.tube))).toBeGreaterThan(25);
    expect(toCm(BANK_POINT.y - (RIM_CENTER.y + RIM.tube))).toBeLessThan(36);
    // Hard: still rising into the glass at ≈ 0.9 m/s square on (v1.5's shared gather could only
    // kiss it at 0.53 m/s); the glass kicks it forward and down.
    expect(BANK_HIT.speed / MS).toBeGreaterThan(0.9);
    const vIn = vel('decline', CONTACT_AT - 2 * H), vOut = vel('decline', CONTACT_AT + BOUNCE.contactTime + 2 * H);
    expect(vIn.y).toBeGreaterThan(2);
    expect(vOut.y).toBeLessThan(vIn.y - 2);
    expect(vOut.z).toBeGreaterThan(1);
    // The rattle: three strikes on the ring's top (each within 20° of straight up), the first a 2 m/s clang.
    const rims = HITS.decline.filter((h) => h.surface === 'rim');
    expect(HITS.decline.slice(1)).toEqual(rims);
    expect(rims.length).toBeGreaterThanOrEqual(3);
    for (const h of rims) expect(h.normal.y, `${h.at}`).toBeGreaterThan(Math.cos((20 * Math.PI) / 180));
    expect(rims[0]!.speed / MS).toBeGreaterThan(1.8);
    for (let i = 1; i < rims.length; i++) expect(rims[i]!.speed).toBeLessThan(rims[i - 1]!.speed);
    // It never goes in: below rim height the centre stays outside the ring; the ball never sinks
    // into the tube beyond its own compression, nor touches the bracket.
    for (let i = 0; i <= REST_AT.decline * 1000; i++) {
      const t = i / 1000, f = at('decline', t), p = f.ballPos;
      if (p.y < RIM_CENTER.y + RIM.tube) expect(horizontal(p, RIM_CENTER), `${t}`).toBeGreaterThan(RIM.innerRadius + RIM.tube);
      expect(ringDistance(p), `${t}`).toBeGreaterThanOrEqual(BALL_R * (1 - f.squash) - 1e-6);
      expect(BRACKET_BOX.distanceToPoint(p), `${t}`).toBeGreaterThan(BALL_R);
    }
    // The carom: it falls off the ring's front-left and first lands in front of the hoop, wide of
    // the base and well in front of the board's back plane (the v1.5 bouncing-on-the-base illusion).
    const first = CONTACTS.decline[0]!;
    expect(first.at).toBeGreaterThan(rims[rims.length - 1]!.at);
    expect(first.at).toBeLessThan(2.2);
    expect(first.point.x).toBeLessThan(RIM_CENTER.x - RIM.innerRadius);
    expect(first.point.z - (HOOP_ROOT.z + BOARD.front - BOARD.thickness)).toBeGreaterThan(BALL_R + 0.1);
    expect(BASE_BOX.distanceToPoint(first.point)).toBeGreaterThan(BALL_R + 0.1);
    // The player traps that bounce (the hand through the floor, once): it keeps its own height and
    // runs on to MISS_REST.
    expect(CONTACTS.decline.filter((c) => c.redirected)).toEqual([first]);
    expect(first.rebound).toBeCloseTo(BOUNCE.restitution * first.speed, 9);
    expect(REST.missed.distanceTo(MISS_REST)).toBeLessThan(1e-6);
  });

  it('the ball never enters the floor, the backboard, the pole or the base', () => {
    for (const seq of SEQS) {
      for (let i = 0; i <= REST_AT[seq] * 1000; i++) {
        const f = at(seq, i / 1000), p = f.ballPos;
        expect(p.y).toBeGreaterThanOrEqual(BALL_R * (1 - 0.1) - 1e-9);
        // v1.7: the bank touches the laminate (its drawn side compressed on it), never the frame.
        expect(boardDistance(p), `${seq} board`).toBeGreaterThanOrEqual(BALL_R * (1 - f.squash) - 1e-6);
        if (!inHit(seq, i / 1000)) expect(boardDistance(p), `${seq} board`).toBeGreaterThanOrEqual(BALL_R - 1e-6);
        expect(BASE_BOX.distanceToPoint(p), `${seq} base`).toBeGreaterThan(BALL_R + 0.1);
        expect(poleDistance(p), `${seq} pole`).toBeGreaterThan(BALL_R + POLE.radius + 0.05);
      }
    }
  });

  it('the made ball leaves the net, bounces lower each time and comes to rest in front of the hoop', () => {
    const cs = CONTACTS.accept;
    expect(cs[0]!.at).toBeGreaterThan(NET_PASSAGE.exitAt);
    for (let i = 1; i < cs.length; i++) expect(cs[i]!.speed).toBeLessThan(cs[i - 1]!.speed);
    // Under the rim, then out towards the camera, clear of the base.
    expect(horizontal(cs[0]!.point, RIM_CENTER)).toBeLessThan(0.4);
    expect(REST.made.z).toBeGreaterThan(cs[0]!.point.z);
    expect(BASE_BOX.distanceToPoint(REST.made)).toBeGreaterThan(1.5);
  });
});

describe('Sports ballistics: one gravity, no stalls, a bounded net drag', () => {
  it('the made ball keeps moving through the rim and the net: no stall', () => {
    const before = vel('accept', CONTACT_AT - 2 * H), after = vel('accept', CONTACT_AT + 2 * H);
    expect(after.distanceTo(before)).toBeLessThan(0.2);
    expect(before.y).toBeLessThan(-5);
    for (let t = CONTACT_AT; t < CONTACTS.accept[0]!.at - 2 * H; t += H) expect(vel('accept', t).length()).toBeGreaterThan(0.45 * before.length());
    // The net checks the fall to NET_KEEP of the entry speed and turns the drift back out.
    expect(NET_PASSAGE.exit.y / NET_PASSAGE.entry.y).toBeCloseTo(NET_KEEP, 1);
    expect(NET_PASSAGE.exit.z).toBeGreaterThan(0);
  });

  it('after release every flight falls under standard gravity; only the net adds a bounded drag', () => {
    const g = new Vector3(0, -GRAVITY, 0);
    for (const seq of SEQS) {
      let airborne = 0;
      for (let t = RELEASES[seq] + 2 * H; t < CONTACTS[seq].at(-1)!.at; t += H) {
        if (inContact(seq, t)) continue;
        const a = acc(seq, t);
        if (inNet(seq, t)) {
          // The snug net checks the ball at up to ≈ 2.6 g.
          expect(a.distanceTo(g)).toBeLessThan(3 * GRAVITY);
          continue;
        }
        airborne++;
        expect(a.distanceTo(g), `${seq} ${t.toFixed(3)}`).toBeLessThan(0.05);
      }
      expect(airborne, seq).toBeGreaterThan(400);
    }
  });

  it('the gather hands the flight a moving ball: the release is not a step from rest', () => {
    // v1.7: the bank winds up longer (it leaves at BANK_TIMING.release, 0.525 s, from 11 cm up).
    expect(RELEASES.accept).toBe(RELEASE_AT);
    expect(RELEASES.decline).toBe(BANK_TIMING.release);
    for (const seq of ['accept', 'decline'] as const) {
      const e = 1e-5, r = RELEASES[seq];
      const pre = pos(seq, r - e).sub(pos(seq, r - 2 * e)).divideScalar(e);
      const post = pos(seq, r + 2 * e).sub(pos(seq, r + e)).divideScalar(e);
      expect(Math.hypot(pre.x - post.x, pre.z - post.z)).toBeLessThan(0.2);
      expect(pre.y).toBeGreaterThan(0.4 * post.y);
      for (let t = r - 0.08; t < r - 0.01; t += 0.005) expect(vel(seq, t + 0.005).y).toBeGreaterThan(vel(seq, t).y);
    }
    // The wind-up never parks the ball: it rolls back and forward through the whole gather.
    for (let t = 0.02; t < BANK_TIMING.release; t += 0.01) expect(vel('decline', t).length(), `${t}`).toBeGreaterThan(0);
  });
});

describe('Sports spin', () => {
  it('the shots leave with real backspin (2–3 rev/s) about their roll axes', () => {
    for (const [seq, rev, t1] of [['accept', SHOT_BACKSPIN.made, CONTACT_AT], ['decline', SHOT_BACKSPIN.missed, BANK_HIT.at]] as const) {
      expect(rev).toBeGreaterThanOrEqual(2);
      expect(rev).toBeLessThanOrEqual(3);
      for (let t = RELEASES[seq] + 0.02; t < t1 - 0.02; t += 0.05) {
        expect(omega(seq, t).dot(SHOT_AXES[seq]) / (2 * Math.PI), `${seq} ${t.toFixed(2)}`).toBeCloseTo(-rev, 2);
      }
    }
  });

  it('the spin rate never jumps: it changes only across a contact or in the net, and smoothly there', () => {
    for (const seq of SEQS) {
      let prev = omega(seq, 2 * H);
      for (let i = 3; i <= REST_AT[seq] * 1000 - 2; i++) {
        const t = i / 1000;
        const cur = omega(seq, t);
        // ≤ 2.5 rad/s per ms: the steepest handover is a contact's 30 ms skid.
        expect(cur.distanceTo(prev), `${seq} ${i} ms`).toBeLessThan(2.5);
        prev = cur;
      }
    }
  });
});

describe('Sports legibility: the airball is a shot, the declined pose is not the ready pose', () => {
  const screen = (p: Vector3) => {
    const camera = new OrthographicCamera();
    fitCameraToBounds(camera, SPORTS_BOUNDS, 1, undefined, sportsFramePoints());
    const q = p.clone().applyMatrix4(camera.matrixWorldInverse);
    return new Vector3(q.x, q.y, 0);
  };

  it('v1.7: the bank travels to the hoop and meets the glass screen-left of the ring, on the laminate clear of the frame', () => {
    const guest = screen(BALL_AT.guest), bank = screen(BANK_POINT), rim = screen(RIM_CENTER);
    // Towards the hoop, high: at the glass the ball stands above the ring on screen, left of its axis.
    expect(bank.x - guest.x).toBeGreaterThan(0.5);
    expect(bank.y - rim.y).toBeGreaterThan(0.7);
    expect(rim.x - bank.x).toBeGreaterThan(0.3);
    expect(rim.x - bank.x).toBeLessThan(RIM.innerRadius + 2 * RIM.tube + BALL_R);
    expect(RIM_CENTER.clone().sub(BANK_POINT).dot(SCREEN_RIGHT)).toBeGreaterThan(0);
    // On the laminate: its touching side inside the opening, the ball clear of the frame's proud lip.
    const lip = BOARD.front - BOARD.face;
    expect(Math.hypot(BANK_POINT.x - OPEN.x0, BALL_R - lip) - BALL_R).toBeGreaterThan(0.005);
    expect(Math.hypot(OPEN.y1 - BANK_POINT.y, BALL_R - lip) - BALL_R).toBeGreaterThan(0.05);
    expect(BANK_POINT.z).toBeCloseTo(FACE_Z + BALL_R, 12);
  });

  it('the declined ball ends well apart from guest-ready, accepted and host-ready at phone scale', () => {
    const declined = screen(pose('declined').ballPos);
    for (const other of ['guest-ready', 'accepted', 'host-ready'] as const) {
      expect(declined.distanceTo(screen(pose(other).ballPos)) / (2 * BALL_R), other).toBeGreaterThanOrEqual(1.2);
    }
    expect(screen(pose('accepted').ballPos).distanceTo(screen(pose('guest-ready').ballPos)) / (2 * BALL_R)).toBeGreaterThanOrEqual(1.2);
  });

  it('v1.7: the hero is the board, rim, net and ball; at the Sports fill no path is cut at 3:4, 1:1 or 3:2 and the ball reads 1.5 × bigger', () => {
    // The hero (#43): the board's corners, the ring, the net's hanging envelope and the ball at
    // guest-ready; no stand (v1.4–v1.6: the base's corners widened it).
    const hero: Vector3[] = [];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const z of [BOARD.front, BOARD.front - BOARD.thickness]) hero.push(new Vector3(HOOP_ROOT.x + (sx * BOARD.width) / 2, BOARD.centerY + (sy * BOARD.height) / 2, HOOP_ROOT.z + z));
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
      hero.push(new Vector3(RIM_CENTER.x + c * (RIM.innerRadius + 2 * RIM.tube), RIM_CENTER.y, RIM_CENTER.z + sn * (RIM.innerRadius + 2 * RIM.tube)));
      hero.push(new Vector3(RIM_CENTER.x + c * netRestRadius(1), RIM_CENTER.y - NET.depth, RIM_CENTER.z + sn * netRestRadius(1)));
    }
    for (const d of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const) hero.push(BALL_AT.guest.clone().add(new Vector3(...d).multiplyScalar(BALL_R)));
    // The frame points no longer hold the base's footprint (the key light's bounds still do).
    const paths = sportsFramePoints();
    expect(paths.some((p) => BASE_BOX.distanceToPoint(p) < 1e-9)).toBe(false);
    const camera = new PerspectiveCamera(PERSPECTIVE_FOV, 1, 0.5, 400);
    const aim = SPORTS_BOUNDS.getCenter(new Vector3());
    const fits = [0.75, 1, 1.5].map((aspect) => solveHeroFits(camera, aim, aspect, hero, [paths], SPORTS_HERO_FILL, PATH_CLEARANCE)[0]!);
    for (const [i, f] of fits.entries()) {
      const label = `${[0.75, 1, 1.5][i]}`;
      expect(f.pathLimited, label).toBe(false);
      for (const v of f.pathExtents) expect(Math.abs(v), label).toBeLessThanOrEqual(1 - PATH_CLEARANCE + 1e-9);
    }
    // Height binds at 1:1 and 3:2 (0.92: the paths below the hero, the made ball's rest nearest the
    // camera, allow 0.927); at 3:4 the hero's width binds at 0.76 (the paths' width allows ≈ 0.77).
    expect(fits[1]!.binding).toBe('height');
    expect(fits[1]!.heroHeight).toBeCloseTo(0.92, 3);
    expect(fits[2]!.heroHeight).toBeCloseTo(0.92, 3);
    expect(fits[0]!.binding).toBe('width');
    expect(fits[0]!.heroWidth).toBeCloseTo(0.76, 3);
    expect(fits[0]!.heroHeight).toBeGreaterThan(0.85);
    // The ball's height on screen at the square stage: 9.1 % (v1.5–v1.6: 5.9 %).
    const f1 = solveHeroFits(camera, aim, 1, hero, [paths], SPORTS_HERO_FILL, PATH_CLEARANCE)[0]!;
    camera.aspect = 1;
    camera.position.copy(aim).addScaledVector(cameraDirection(), f1.distance);
    camera.lookAt(aim);
    camera.updateMatrixWorld();
    camera.clearViewOffset();
    camera.updateProjectionMatrix();
    const top = BALL_AT.guest.clone().setY(2 * BALL_R).project(camera), bottom = BALL_AT.guest.clone().setY(0).project(camera);
    expect((top.y - bottom.y) / 2).toBeGreaterThan(0.085);
    // The old fill on the old hero, for the record: the shared 0.6 held the ball at 5.9 %.
    expect(HERO_FILL.height).toBe(0.6);
  });
});

describe('Sports change of mind: the ball carries on under its own physics (change.ts)', () => {
  const showingAt = (seq: SequenceName, t: number): Showing => (t >= REST_AT[seq] ? { kind: 'rest', pos: at(seq, t).ballPos, rot: at(seq, t).ballRot } : { kind: 'track', seq, t, change: null });
  const times = (seq: SequenceName) => [...Array.from({ length: 30 }, (_, i) => 0.1 + i * 0.06), 2.2, 2.8, 3.6, 4.5, REST_AT[seq] + 0.5];
  /** A change track's ball at time t. */
  const ball = (c: Change, t: number) => {
    const p = new Vector3(), q = new Quaternion();
    const squash = c.track.sample(t, p, q);
    return { p, squash };
  };

  it('the director blends only while the ball sits on the floor in a gather; everything else is the scene\'s hand-over', () => {
    for (let t = 0; t < RISE_FROM; t += 0.01) expect(sportsInterruptCut({ kind: 'track', seq: 'accept', t, change: null })).toBe(false);
    for (const seq of ['accept', 'decline'] as const) for (const t of times(seq)) expect(sportsInterruptCut(showingAt(seq, t)), `${seq} ${t}`).toBe(true);
  });

  for (const [from, to] of [['accept', 'decline'], ['decline', 'accept']] as const) {
    it(`${from} → ${to}: continuous, physical, clear of the hoop, and at rest exactly on the new outcome`, () => {
      const target = to === 'accept' ? REST.made : REST.missed;
      for (const t of times(from)) {
        const s = showingAt(from, t);
        const c = planChange(s, to);
        const label = `${from}→${to} @${t.toFixed(2)}`;
        // Starts exactly where the ball is, moving as it moves.
        const p0 = ball(c, 0).p, now = s.kind === 'rest' ? s.pos : at(from, t).ballPos;
        expect(p0.distanceTo(now), label).toBeLessThan(1e-9);
        if (s.kind === 'track' && t >= RELEASE_AT) {
          const v0 = ball(c, 0.001).p.sub(p0).divideScalar(0.001), v1 = at(from, t + 0.001).ballPos.sub(now).divideScalar(0.001);
          expect(v0.distanceTo(v1), label).toBeLessThan(0.05);
        }
        // Never a jump; never into the floor, the board, the base or the pole; under the shared gravity in the air.
        let prev = p0.clone();
        for (let u = 0.001; u <= c.track.end; u += 0.001) {
          const { p, squash } = ball(c, u);
          const axisUp = c.track.squashAxis(u, new Vector3()).y === 1;
          expect(p.distanceTo(prev), `${label} ${u.toFixed(3)}`).toBeLessThan(0.02);
          expect(p.y - BALL_R * (1 - (axisUp ? squash : 0)), `${label} ${u.toFixed(3)}`).toBeGreaterThanOrEqual(-1e-5);
          // v1.7: a copied bank and rattle touch the glass and the ring (compressed by their squash), never more.
          expect(boardDistance(p), `${label} board ${u.toFixed(3)}`).toBeGreaterThanOrEqual(BALL_R * (1 - squash) - 1e-4);
          if (!c.track.hitAt(u)) expect(boardDistance(p), `${label} board ${u.toFixed(3)}`).toBeGreaterThan(BALL_R - 1e-5);
          expect(ringDistance(p), `${label} ring ${u.toFixed(3)}`).toBeGreaterThanOrEqual(BALL_R * (1 - squash) - 1e-4);
          expect(BASE_BOX.distanceToPoint(p), `${label} base ${u.toFixed(3)}`).toBeGreaterThan(BALL_R);
          expect(poleDistance(p), `${label} pole ${u.toFixed(3)}`).toBeGreaterThan(BALL_R + POLE.radius);
          prev = p;
        }
        // At rest exactly on the new outcome's spot, within a few seconds.
        expect(ball(c, c.track.end).p.distanceTo(target), label).toBeLessThan(1e-5);
        expect(c.track.end, label).toBeLessThan(9);
        // The hand acts only at floor contacts.
        expect(c.track.contacts.filter((k) => k.redirected).length, label).toBeLessThanOrEqual(2);
        if (to === 'accept') {
          // It scores: through the rim centre, never touching the ring on the way.
          let best = Infinity;
          for (let u = 0; u <= c.track.end; u += 0.0005) best = Math.min(best, ball(c, u).p.distanceTo(RIM_CENTER));
          expect(best, label).toBeLessThan(0.01);
        }
      }
    });
  }

  it('v1.7: a decline → accept change before the bank lets the bank and the rattle happen (their kicks go with it), then the bounce-shot scores', () => {
    for (const t of [0.7, 0.9]) {
      const c = planChange({ kind: 'track', seq: 'decline', t, change: null }, 'accept');
      // Every strike, on the change's own clock.
      expect(c.track.hits.map((h) => h.at + t)).toEqual(HITS.decline.map((h) => h.at).map((x) => expect.closeTo(x, 9)));
      expect(c.track.hits.map((h) => h.surface)).toEqual(HITS.decline.map((h) => h.surface));
      // The ball is where the decline has it until its first floor contact, the bank's touch included.
      for (const u of [CONTACT_AT - t, CONTACT_AT - t + 0.01, 1.3 - t, CONTACTS.decline[0]!.at - t - 0.01]) expect(ball(c, u).p.distanceTo(at('decline', u + t).ballPos), `${t} ${u}`).toBeLessThan(2e-3);
      expect(ball(c, c.track.end).p.distanceTo(REST.made)).toBeLessThan(1e-5);
    }
  });

  it('v1.7: a change during the rattle keeps the strikes still to come and its squash axis, then the bounce-shot scores', () => {
    const rims = HITS.decline.filter((h) => h.surface === 'rim');
    for (const t of [rims[0]!.at + 0.005, (rims[0]!.at + rims[1]!.at) / 2, rims[1]!.at + 0.01]) {
      const c = planChange({ kind: 'track', seq: 'decline', t, change: null }, 'accept');
      const ahead = HITS.decline.filter((h) => h.at > t);
      expect(c.track.hits.filter((h) => h.at > 0).map((h) => h.at + t)).toEqual(ahead.map((h) => expect.closeTo(h.at, 9)));
      // A cut inside a strike's window keeps drawing its squash along the strike's normal.
      const under = HITS.decline.find((h) => t >= h.at && t < h.at + BOUNCE.contactTime);
      if (under) expect(c.track.squashAxis(0, new Vector3()).distanceTo(under.normal)).toBeLessThan(1e-12);
      expect(ball(c, c.track.end).p.distanceTo(REST.made)).toBeLessThan(1e-5);
      expect(c.track.contacts.filter((k) => k.redirected).length).toBeLessThanOrEqual(2);
    }
  });

  it('a change while the shot is in the air lets it finish: the made shot still goes through the rim', () => {
    const c = planChange({ kind: 'track', seq: 'accept', t: 0.6, change: null }, 'decline');
    let best = Infinity;
    for (let u = 0; u <= 0.5; u += 0.0005) best = Math.min(best, ball(c, u).p.distanceTo(RIM_CENTER));
    expect(best).toBeLessThan(1e-3);
  });

  it('changes chain: accept → decline → accept, each from the ball\'s state on screen', () => {
    const first = planChange({ kind: 'track', seq: 'accept', t: 1.2, change: null }, 'decline');
    const second = planChange({ kind: 'track', seq: 'decline', t: 0.9, change: first }, 'accept');
    expect(ball(second, 0).p.distanceTo(ball(first, 0.9).p)).toBeLessThan(1e-9);
    expect(ball(second, second.track.end).p.distanceTo(REST.made)).toBeLessThan(1e-5);
  });

  it('plans fast enough for the frame it happens in (< 40 ms)', () => {
    for (const [seq, to, t] of [['accept', 'decline', 0.5], ['decline', 'accept', 0.5], ['decline', 'accept', 1.2], ['decline', 'accept', 4]] as const) {
      const t0 = performance.now();
      planChange(showingAt(seq, t), to);
      expect(performance.now() - t0, `${seq} ${t}`).toBeLessThan(40);
    }
  });

  it('hoop distance still measures the hoop (blend clearance helper)', () => {
    expect(blendClearance(RIM_CENTER)).toBeLessThan(BALL_R + BLEND_MARGIN);
    expect(hoopDistance(BALL_AT.guest)).toBeGreaterThan(BALL_R);
  });
});

// ── The exported runtime GLB (pnpm models sports), measured with gltf-transform ──
const GLB = join(import.meta.dirname, '..', 'assets', 'scenes', 'sports', 'sports.glb');

/** The net's meshes from the GLB, in net space (as the rig bakes them). */
function netMeshes(doc: Document) {
  const hoop = findNode(doc, 'hoop_root'), net = findNode(doc, 'net');
  const toHoop = new Matrix4().fromArray(hoop.getWorldMatrix()).invert();
  const out: { geometry: BufferGeometry; kind: 'strands' | 'knots' | 'loops' }[] = [];
  net.traverse((n) => {
    const m = n.getMesh();
    if (!m) return;
    const mat = new Matrix4().multiplyMatrices(toHoop, new Matrix4().fromArray(n.getWorldMatrix()));
    for (const prim of m.listPrimitives()) {
      const p = prim.getAttribute('POSITION')!;
      const arr = new Float32Array(p.getCount() * 3), e = [0, 0, 0], v = new Vector3();
      for (let i = 0; i < p.getCount(); i++) {
        p.getElement(i, e);
        v.set(e[0]!, e[1]!, e[2]!).applyMatrix4(mat).sub(RIM_LOCAL).toArray(arr, i * 3);
      }
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(arr, 3));
      const idx = prim.getIndices();
      if (idx) g.setIndex(new BufferAttribute(Uint32Array.from(idx.getArray()!), 1));
      const kind = netMeshKind(n.getName()) ?? netMeshKind(n.getParentNode()?.getName() ?? '');
      if (kind) out.push({ geometry: g, kind });
    }
  });
  return out;
}

/** What a net run shows each frame: the time, the sim, the springs, the ball (sim space) and the skin as drawn. */
type NetFrame = (t: number, sim: NetSim, springs: HoopSprings, ball: Vector3, skin: NetSkin) => void;

/**
 * Run the net along a sequence's ball path through the scene's own net channel (`net.ts`), as the
 * controller drives it: the director's sample each frame (the run's time), then the FixedStepper's
 * equal steps ≤ 1/120 s; past the ball's rest, the ball at rest. `hz` is the display rate.
 */
function runNet(lattice: NetLattice, seq: SequenceName, seconds: number, each?: NetFrame, hz = 120, interrupt?: { at: number }) {
  const sim = new NetSim(lattice), springs = new HoopSprings();
  const skin = new NetSkin(new Object3D(), sim, []);
  const channel = new SportsNetChannel<SequenceName, null>({ net: { sim, skin }, springs, recoil: { set() {} } }, (s, _c, t) => sampleTrack(s, t, f).ballPos);
  const f = newFrame(), stepper = new FixedStepper(), ball = new Vector3(), local = new Vector3();
  for (let i = 1; i / hz <= seconds + 1e-9; i++) {
    const t = i / hz;
    const run = t <= REST_AT[seq] ? { seq, change: null, t } : null;
    if (run) channel.follow(run, false);
    ball.copy(sampleTrack(seq, Math.min(t, REST_AT[seq]), f).ballPos);
    stepper.advance(1 / hz, (h) => channel.step(h, run, ball));
    // An interruption carried over (the director's settle, then refresh): the motion goes on as before.
    if (interrupt && Math.abs(t - interrupt.at) < 0.5 / hz) { channel.settle(); channel.restore(); }
    each?.(t, sim, springs, local.copy(ball).sub(HOOP_ROOT).sub(RIM_LOCAL), skin);
  }
  return { sim, springs, skin, channel };
}

describe('Sports runtime GLB and the simulated net', async () => {
  const doc = await createIO().read(GLB);
  const node = (name: string) => findNode(doc, name);
  const worldOf = (n: Node) => new Matrix4().fromArray(n.getWorldMatrix());
  const vertices = (n: Node) => {
    const out: Vector3[] = [];
    const toRoot = worldOf(node('sports_root')).invert();
    n.traverse((c) => {
      const m = toRoot.clone().multiply(worldOf(c));
      for (const prim of c.getMesh()?.listPrimitives() ?? []) {
        const p = prim.getAttribute('POSITION')!;
        const e = [0, 0, 0];
        for (let i = 0; i < p.getCount(); i++) out.push(new Vector3(...(p.getElement(i, e) as [number, number, number])).applyMatrix4(m));
      }
    });
    return out;
  };
  const lattice = analyseNet(netMeshes(doc))!;

  it('has every contract node exactly once', () => {
    for (const n of SPORTS_NODES) expect(() => node(n), n).not.toThrow();
  });

  it('the ball is the master at BALL_R, centred on ball_secondary', () => {
    const box = boxIn(node('ball_mesh'), node('ball_secondary'));
    const size = box.max.clone().sub(box.min);
    for (const k of ['x', 'y', 'z'] as const) expect(Math.abs(size[k] / 2 - BALL_R)).toBeLessThan(0.002);
    expect(box.max.clone().add(box.min).length() / 2).toBeLessThan(0.002);
    const ball = node('ball_mesh');
    expect(ball.getMesh()).toBeNull();
    expect(ball.getScale()).toEqual([1, 1, 1]);
    expect(new Vector3(...ball.getTranslation()).length()).toBeLessThan(1e-6);
    expect(node('ball_mesh_mesh').getParentNode()).toBe(ball);
    expect((node('ball_mesh_mesh').getExtras() as { noShadowCast?: boolean }).noShadowCast).toBe(true);
  });

  it('both ball presets keep the master leather\'s neutral base colour (the albedo carries the look)', () => {
    for (const name of ['ball_leather', 'ball_leather_cream']) {
      const m = doc.getRoot().listMaterials().find((x) => x.getName() === name);
      expect(m, name).toBeDefined();
      for (const k of m!.getBaseColorFactor().slice(0, 3)) expect(k, name).toBeCloseTo(1, 5);
    }
  });

  it('declares its WebP textures (EXT_texture_webp, required) and keeps normal maps lossless', () => {
    const webp = doc.getRoot().listExtensionsUsed().find((e) => e.extensionName === 'EXT_texture_webp');
    expect(webp?.isRequired()).toBe(true);
    for (const t of doc.getRoot().listTextures()) {
      expect(t.getMimeType()).toBe('image/webp');
      const chunk = new TextDecoder().decode(t.getImage()!.subarray(12, 16));
      if (listTextureSlots(t).some((s) => /normal/i.test(s))) expect(chunk, t.getName()).toBe('VP8L');
    }
  });

  it('the rim ring is centred on RIM_CENTER with the contract inner radius (the 14.5" rim)', () => {
    const ring = vertices(node('rim')).filter((v) => Math.abs(v.y - RIM_CENTER.y) <= RIM.tube * 1.05 && v.z > RIM_CENTER.z - RIM.innerRadius - 2 * RIM.tube);
    const radii = ring.map((v) => Math.hypot(v.x - RIM_CENTER.x, v.z - RIM_CENTER.z)).filter((r) => r > 0.4);
    expect(Math.abs(Math.min(...radii) - RIM.innerRadius)).toBeLessThan(0.004);
    expect(Math.abs(Math.max(...radii) - (RIM.innerRadius + 2 * RIM.tube))).toBeLessThan(0.004);
    expect(HOOP_SCALE).toBeCloseTo(1.13421, 4);
  });

  it('the net hangs in net space at RIM_LOCAL, within NET.depth, outside its measured envelope', () => {
    const net = node('net');
    expect(new Vector3(...net.getTranslation()).distanceTo(RIM_LOCAL)).toBeLessThan(1e-4);
    expect(net.listChildren().filter((c) => c.getMesh()).length).toBe(3);
    let top = -Infinity, bottom = Infinity;
    for (const v of vertices(net)) {
      top = Math.max(top, v.y);
      bottom = Math.min(bottom, v.y);
      const t = (RIM_CENTER.y - v.y) / NET.depth;
      if (t < 0 || t > 1) continue;
      expect(Math.hypot(v.x - RIM_CENTER.x, v.z - RIM_CENTER.z)).toBeGreaterThan(netRestRadius(t) - 0.015);
    }
    expect(top).toBeLessThanOrEqual(RIM_CENTER.y + 0.006);
    expect(Math.abs(RIM_CENTER.y - bottom - NET.depth)).toBeLessThan(0.004);
  });

  it('the recoil pivots are the rim and backboard nodes\' origins (hoop space)', () => {
    expect(new Vector3(...node('rim').getTranslation()).distanceTo(RIM_HINGE)).toBeLessThan(3e-4);
    expect(new Vector3(...node('backboard').getTranslation()).distanceTo(BOARD_PIVOT)).toBeLessThan(3e-4);
    expect(RIM_HINGE.y).toBeCloseTo(RIM_BRACKET.min.y, 3);
    expect(BOARD_PIVOT.z).toBeCloseTo(BOARD.front - BOARD.thickness, 3);
  });

  it('the board matches BOARD and the stand reaches its back', () => {
    const box = new Box3().setFromPoints(vertices(node('backboard')));
    const h = HOOP_ROOT;
    expect(box.min.x).toBeCloseTo(h.x - BOARD.width / 2, 2);
    expect(box.max.x).toBeCloseTo(h.x + BOARD.width / 2, 2);
    expect(box.min.y).toBeCloseTo(BOARD.centerY - BOARD.height / 2, 2);
    expect(box.max.y).toBeCloseTo(BOARD.centerY + BOARD.height / 2, 2);
    expect(box.max.z).toBeCloseTo(h.z + BOARD.front, 2);
    expect(box.min.z).toBeCloseTo(h.z + BOARD.front - BOARD.thickness, 2);
    const hardware = new Box3().setFromPoints(vertices(node('hoop_hardware')));
    expect(hardware.max.z).toBeCloseTo(h.z + BOARD.front - BOARD.thickness, 2);
    const stand = [...vertices(node('hoop_stand')), ...vertices(node('hoop_pole'))];
    expect(Math.min(...stand.map((v) => v.y))).toBeCloseTo(0, 3);
    // Everything of the stand stays behind the board's back plate.
    expect(Math.max(...stand.map((v) => v.z))).toBeLessThanOrEqual(hardware.max.z - 0.01);
  });

  it('v1.7: the laminate\'s opening is BOARD.opening, its face FACE_Z; the hero leaves out exactly the stand', () => {
    const face = vertices(node('board_hoop_board_face'));
    const front = Math.max(...face.map((v) => v.z));
    expect(front).toBeCloseTo(FACE_Z, 3);
    const lam = face.filter((v) => v.z > front - 0.01);
    expect(Math.min(...lam.map((v) => v.x))).toBeCloseTo(HOOP_ROOT.x - BOARD.opening.halfWidth, 3);
    expect(Math.max(...lam.map((v) => v.x))).toBeCloseTo(HOOP_ROOT.x + BOARD.opening.halfWidth, 3);
    expect(Math.min(...lam.map((v) => v.y))).toBeCloseTo(BOARD.opening.bottom, 3);
    expect(Math.max(...lam.map((v) => v.y))).toBeCloseTo(BOARD.opening.top, 3);
    // The frame's lip stands proud of the face all round the opening.
    const lip = vertices(node('board_hoop_frame')).filter((v) => v.z > FACE_Z + 0.01);
    for (const v of lip) expect(v.x <= OPEN.x0 + 1e-3 || v.x >= OPEN.x1 - 1e-3 || v.y <= OPEN.y0 + 1e-3 || v.y >= OPEN.y1 - 1e-3).toBe(true);
    // The stand's three nodes, and nothing else of the hoop.
    const names: string[] = [];
    node('hoop_root').traverse((n) => { if (n.getMesh()) names.push(n.getName()); });
    expect(names.filter((n) => SPORTS_HERO_EXCLUDE.test(n)).sort()).toEqual(['hoop_hardware', 'hoop_pole', 'hoop_stand']);
  });

  it('stores the cream ball as a material variant and nothing is left unbound', () => {
    const variants = doc.getRoot().listExtensionsUsed().find((e) => e.extensionName === 'KHR_materials_variants') as KHRMaterialsVariants | undefined;
    expect(variants?.listVariants().map((v) => v.getName())).toEqual(['orange', 'cream']);
    const names = doc.getRoot().listMaterials().map((m) => m.getName());
    expect(names).toContain('ball_leather');
    expect(names).toContain('ball_leather_cream');
    for (const m of doc.getRoot().listMaterials()) expect(m.getName(), 'every material is named').not.toBe('');
  });

  it('reads the master net\'s cord lattice back: 10 loops, 6 rows of 10 knots, 120 cords; every strand and knot vertex bound', () => {
    expect(lattice).not.toBeNull();
    expect(lattice.loops).toHaveLength(10);
    expect(lattice.rows.map((r) => r.length)).toEqual([10, 10, 10, 10, 10, 10]);
    expect(lattice.cords).toHaveLength(120);
    for (const [a, b] of lattice.cords) expect(lattice.nodes[a]!.y).toBeGreaterThan(lattice.nodes[b]!.y);
    // Each knot hangs from two cords above and (above the last row) feeds two below.
    const up = new Map<number, number>(), down = new Map<number, number>();
    for (const [a, b] of lattice.cords) { down.set(a, (down.get(a) ?? 0) + 1); up.set(b, (up.get(b) ?? 0) + 1); }
    for (const [r, row] of lattice.rows.entries()) for (const k of row) {
      expect(up.get(k)).toBe(2);
      expect(down.get(k) ?? 0).toBe(r < 5 ? 2 : 0);
    }
    // v1.7: two bones per strand (its halves) and one per node; every vertex's weights sum to one.
    const bones = 2 * lattice.cords.length + lattice.nodes.length;
    for (const [, bind] of lattice.binding) {
      for (const b of bind.index) expect(b).toBeLessThan(bones);
      for (let v = 0; v < bind.weight.length; v += 4) expect(bind.weight[v]! + bind.weight[v + 1]! + bind.weight[v + 2]! + bind.weight[v + 3]!).toBeCloseTo(1, 5);
    }
  });

  it('the net hangs slack at rest under gravity: every cord within ±0.5 % of its length, the master\'s top, its bottom opened to clear the ball; it stays put without the ball', () => {
    const sim = new NetSim(lattice);
    // Hung slack (rest lengths from the hanging pose × 1.005): its own weight takes the slack up, no pre-stretch.
    for (const e of sim.restCordStrains()) expect(Math.abs(e)).toBeLessThanOrEqual(0.005);
    // The rest pose is the substep's own fixed point: a resting net woken without the ball does not creep
    // (well under a nanometre in a second; the relaxation stops at 1e-13 su per substep).
    const s = sim as unknown as { wake(sp: null): void; substep(h: number, b: null, d: number, c: number, bo: number, r: number): void };
    s.wake(null);
    for (let i = 0; i < 480; i++) s.substep(NET_SIM.step, null, NET_SIM.drag, NET_SIM.coupling, 0, 0);
    expect(sim.maxDisplacement()).toBeLessThan(1e-10);
    // The rim loops and the top rows hang as the master; the lower rows open (NET_HANG).
    const fresh = new NetSim(lattice);
    for (const k of lattice.rows[0]!) expect(lattice.nodes[k]!.distanceTo(fresh.restNode(k))).toBeLessThan(0.01);
    // The bottom ring's inner opening (knot centres less a knot) is ≥ 1.1 × the ball.
    const bottom = Math.min(...lattice.rows[5]!.map((k) => Math.hypot(fresh.restNode(k).x, fresh.restNode(k).z)));
    expect((2 * (bottom - NET_SIM.knotRadius)) / (2 * BALL_R)).toBeGreaterThan(1.1);
    for (const seq of ['host', 'decline'] as const) {
      const { sim: r, springs } = runNet(lattice, seq, REST_AT[seq]);
      expect(r.settled, seq).toBe(true);
      expect(springs.settled, seq).toBe(true);
      expect(r.maxDisplacement(), seq).toBe(0);
    }
  });

  /** One accept, recorded as drawn: the knots, their frames, the strands, the energy and the ring. */
  const acceptRun = (() => {
    let cached: ReturnType<typeof record> | null = null;
    function record() {
      const frames: { t: number; knots: Vector3[]; ups: Vector3[]; strand: [number, number]; ke: number; mech: number; settled: boolean; ball: Vector3 }[] = [];
      let wake = Infinity, maxOpen = 0, minGap = Infinity;
      const p = new Vector3();
      const knots = lattice.rows.flat();
      const { sim } = runNet(lattice, 'accept', REST_AT.accept + 2, (t, s, sp, ball, skin) => {
        if (!s.settled && wake === Infinity) wake = t;
        for (let i = 0; i < s.n; i++) {
          s.node(i, p);
          minGap = Math.min(minGap, p.distanceTo(ball) - BALL_R);
          maxOpen = Math.max(maxOpen, Math.hypot(p.x, p.z) - Math.hypot(s.restNode(i).x, s.restNode(i).z));
        }
        const S = s as unknown as { invMass: Float64Array; v: Float64Array };
        let ke = 0;
        for (const k of knots) ke += (0.5 / S.invMass[k]!) * (S.v[k * 3]! ** 2 + S.v[k * 3 + 1]! ** 2 + S.v[k * 3 + 2]! ** 2);
        const mech = s.mechanicalEnergy();
        const scales = skin.strandScales();
        frames.push({
          t, knots: knots.map((k) => skin.drawnNode(k)), ups: knots.map((k) => new Vector3(0, 1, 0).applyQuaternion(skin.bones[lattice.cords.length + k]!.quaternion)),
          strand: [Math.min(...scales), Math.max(...scales)], ke, mech, settled: s.settled && sp.settled, ball: ball.clone(),
        });
      });
      return { frames, wake, maxOpen, minGap, sim, knots };
    }
    return () => (cached ??= record());
  })();

  it('the made ball opens the net (no knot ever inside it), drags it down, and the net whips back as a whole and settles in 1.2–2.5 s', () => {
    const { frames, wake, maxOpen, minGap, sim, knots } = acceptRun();
    const exit = NET_PASSAGE.exitAt;
    const bottom = lattice.rows[5]!.map((k) => knots.indexOf(k));
    // Woken as the ball comes near the net (never before release), at the latest at contact.
    expect(wake).toBeGreaterThan(RELEASE_AT);
    expect(wake).toBeLessThan(CONTACT_AT + 0.02);
    // The knots are pushed round the ball (≥ 2 cm outward), never inside it.
    expect(maxOpen).toBeGreaterThan(0.06);
    expect(minGap).toBeGreaterThan(NET_SIM.knotRadius - 0.006);
    // The whip: once the ball has left, the bottom row rises above where it hangs.
    const rest = frames[0]!.knots;
    const lift = Math.max(...frames.filter((f) => f.t > exit).flatMap((f) => bottom.map((j) => f.knots[j]!.y - rest[j]!.y)));
    expect(lift).toBeGreaterThan(0.02);
    // It sways for a while, is still (every knot within 1.5 mm of rest) 2 s after the ball has
    // left, and snaps to rest once its motion has died: 1.2–2.5 s after the exit.
    const late = Math.max(...frames.filter((f) => f.t >= exit + 2).flatMap((f) => f.knots.map((k, j) => k.distanceTo(rest[j]!))));
    expect(toCm(late)).toBeLessThanOrEqual(0.15);
    const settledAt = frames.find((f, i) => f.t > exit && f.settled && frames.slice(i).every((g) => g.settled))!.t;
    expect(settledAt - exit).toBeGreaterThan(1.2);
    expect(settledAt - exit).toBeLessThan(2.5);
    expect(sim.settled).toBe(true);
  });

  it('it swings as a whole: the bottom ring sways at about a hertz with no buzz, neighbouring knots move together, nothing pumps energy in', () => {
    const { frames, knots } = acceptRun();
    const exit = NET_PASSAGE.exitAt, rest = frames[0]!.knots;
    const bottom = lattice.rows[5]!.map((k) => knots.indexOf(k));
    const win = frames.filter((f) => f.t > exit + 0.25 && f.t < exit + 2.25);
    // The ring's mean lateral position: its spectrum (Hann window) peaks at a whole-net sway, not a knot's buzz.
    const mean = win.map((f) => bottom.reduce((a, j) => a + f.knots[j]!.x - rest[j]!.x, 0) / bottom.length);
    const N = mean.length, avg = mean.reduce((a, b) => a + b, 0) / N, x = mean.map((v, i) => (v - avg) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1))));
    const power = (fq: number) => {
      let re = 0, im = 0;
      x.forEach((v, i) => { re += v * Math.cos((2 * Math.PI * fq * i) / 120); im -= v * Math.sin((2 * Math.PI * fq * i) / 120); });
      return re * re + im * im;
    };
    const spectrum = Array.from({ length: 1200 }, (_, i) => ({ f: 0.05 * (i + 2), p: power(0.05 * (i + 2)) }));
    const peak = spectrum.reduce((a, b) => (b.p > a.p ? b : a));
    expect(peak.f).toBeGreaterThan(0.7);
    expect(peak.f).toBeLessThan(1.6);
    const hf = spectrum.filter((q) => q.f >= 8).reduce((a, q) => a + q.p, 0), lf = spectrum.filter((q) => q.f < 8).reduce((a, q) => a + q.p, 0);
    expect(hf / lf).toBeLessThan(0.05);
    // Neighbouring bottom knots move together (in-plane displacements correlated; v1.5: −0.15).
    const corr = (a: number[], b: number[]) => {
      const ma = a.reduce((s, v) => s + v, 0) / a.length, mb = b.reduce((s, v) => s + v, 0) / b.length;
      let ab = 0, aa = 0, bb = 0;
      a.forEach((v, i) => { ab += (v - ma) * (b[i]! - mb); aa += (v - ma) ** 2; bb += (b[i]! - mb) ** 2; });
      return ab / Math.sqrt(aa * bb);
    };
    let adj = 0;
    bottom.forEach((j, i) => {
      const k = bottom[(i + 1) % bottom.length]!;
      adj += corr(win.flatMap((f) => [f.knots[j]!.x - rest[j]!.x, f.knots[j]!.z - rest[j]!.z]), win.flatMap((f) => [f.knots[k]!.x - rest[k]!.x, f.knots[k]!.z - rest[k]!.z])) / bottom.length;
    });
    expect(adj).toBeGreaterThan(0.6);
    // After the exit the net's energy (kinetic, gravitational and elastic, above its rest) only falls:
    // never more than 5 % up from one frame to the next while it shows (above 2 % of its peak; below
    // that the stiff cords' elastic energy ripples by a few per cent of next to nothing), and the
    // motion is below 1 % of its post-exit kinetic peak within 1.5 s.
    const post = frames.filter((f) => f.t > exit);
    const kePeak = Math.max(...post.map((f) => f.ke)), mechPeak = Math.max(...post.map((f) => f.mech));
    for (let i = 1; i < post.length; i++) if (post[i - 1]!.mech > 0.02 * mechPeak) expect(post[i]!.mech / post[i - 1]!.mech).toBeLessThan(1.05);
    expect(Math.max(...post.filter((f) => f.t > exit + 1.5).map((f) => f.ke))).toBeLessThan(0.01 * kePeak);
  });

  it('the skin: knots turn with the net, not their own sway; strands keep their length (bowing when slack, never shrinking)', () => {
    const { frames } = acceptRun();
    const exit = NET_PASSAGE.exitAt, rest = frames[0]!.ups;
    for (let i = 1; i < frames.length; i++) {
      const f = frames[i]!, p = frames[i - 1]!;
      if (f.t > exit + 0.25) for (const [j, u] of f.ups.entries()) expect((u.angleTo(p.ups[j]!) * 180) / Math.PI / (f.t - p.t)).toBeLessThanOrEqual(300);
      if (f.t > exit + 1) for (const [j, u] of f.ups.entries()) expect((u.angleTo(rest[j]!) * 180) / Math.PI).toBeLessThanOrEqual(5);
      if (f.t > exit) {
        expect(f.strand[0]).toBeGreaterThanOrEqual(0.97);
        expect(f.strand[1]).toBeLessThanOrEqual(1.06);
      }
    }
  });

  it('no crossing: pressed together the knots bunch, never pass through each other', () => {
    const { frames, knots } = acceptRun();
    const rest = frames[0]!.knots, at = (k: number) => knots.indexOf(k);
    for (const f of frames) {
      for (const row of lattice.rows) row.forEach((k, i) => {
        const a = at(k), b = at(row[(i + 1) % row.length]!);
        expect(f.knots[a]!.distanceTo(f.knots[b]!) / rest[a]!.distanceTo(rest[b]!)).toBeGreaterThan(0.7 - 0.02);
      });
      for (let r = 0; r + 2 < 6; r++) for (const k of lattice.rows[r]!) {
        const a = at(k), b = lattice.rows[r + 2]!.map(at).reduce((x, y) => (rest[a]!.distanceTo(rest[y]!) < rest[a]!.distanceTo(rest[x]!) ? y : x));
        expect(f.knots[a]!.distanceTo(f.knots[b]!) / rest[a]!.distanceTo(rest[b]!)).toBeGreaterThan(0.55 - 0.02);
      }
    }
  });

  it('every display rate sees the same net: 60, 90, 120 and 144 Hz agree to 1e-9 su at the times they share', () => {
    const record = (hz: number) => {
      const out = new Map<number, Float64Array>();
      runNet(lattice, 'accept', 2.5, (t, s) => out.set(Math.round(t * 1e6), Float64Array.from({ length: s.n * 3 }, (_, i) => s.drawn(Math.floor(i / 3), new Vector3()).getComponent(i % 3))), hz);
      return out;
    };
    const ref = record(120);
    let shared = 0;
    for (const hz of [60, 90, 144]) {
      for (const [k, x] of record(hz)) {
        const y = ref.get(k);
        if (!y || (k / 1e6) % (1 / 6) > 1e-6 && (1 / 6) - ((k / 1e6) % (1 / 6)) > 1e-6) continue;
        shared++;
        for (let i = 0; i < x.length; i++) expect(Math.abs(x[i]! - y[i]!), `${hz} Hz at ${k / 1e6} s`).toBeLessThan(1e-9);
      }
    }
    expect(shared).toBeGreaterThan(30);
  });

  it('a change of mind carries the swing over exactly (settle, then restore), and settle() snaps exactly to rest', () => {
    const a = runNet(lattice, 'accept', 1.6), b = runNet(lattice, 'accept', 1.6, undefined, 120, { at: 1.3 });
    for (let i = 0; i < a.sim.x.length; i++) expect(Math.abs(a.sim.x[i]! - b.sim.x[i]!)).toBeLessThan(1e-12);
    expect(a.sim.settled).toBe(false);
    a.channel.settle();
    expect(a.channel.settling()).toBe(false);
    expect(Array.from(a.sim.x)).toEqual(Array.from(a.sim.rest));
    expect([a.springs.rim, a.springs.board]).toEqual([0, 0]);
    for (const k of lattice.rows.flat()) expect(a.skin.drawnNode(k).distanceTo(a.sim.restNode(k))).toBe(0);
  });

  it('the rim and board answer the net\'s real pull: bounded, the rim stopped by the board, its ring damped, both back at rest', () => {
    let rimMax = 0, rimMin = 0, boardMax = 0, forceMax = 0, rimQuiet = 0;
    const { springs } = runNet(lattice, 'accept', REST_AT.accept + 2, (t, s, sp) => {
      rimMax = Math.max(rimMax, sp.rim);
      rimMin = Math.min(rimMin, sp.rim);
      boardMax = Math.max(boardMax, Math.abs(sp.board));
      forceMax = Math.max(forceMax, s.hookForce.length());
      if (Math.abs(sp.rim) * (180 / Math.PI) >= 0.05) rimQuiet = t;
    });
    const deg = 180 / Math.PI;
    // A swish pulls the hooks with a few newtons: the ball's own braking in the net (4–5.6 N on its track).
    expect(forceMax).toBeGreaterThan(3);
    expect(forceMax).toBeLessThan(8);
    expect(rimMax * deg).toBeGreaterThan(0.3);
    expect(rimMax * deg).toBeLessThanOrEqual(RECOIL_LIMIT.rimDeg);
    expect(rimMin).toBeGreaterThanOrEqual(RIM_BACKSTOP - 1e-12);
    // The rim's ring dies within 0.35 s of the contact (v1.5: ≈ 0.5 s, shaking the whole net).
    expect(rimQuiet - CONTACT_AT).toBeLessThan(0.35);
    // The board on its steel pole barely moves for a swish.
    expect(boardMax * deg).toBeLessThan(0.2);
    expect(springs.settled).toBe(true);
  });

  it('a strike on the hoop (HoopSprings.kick) stirs a resting net through its loops, which swings and settles', () => {
    const sim = new NetSim(lattice), springs = new HoopSprings(), skin = new NetSkin(new Object3D(), sim, []);
    const channel = new SportsNetChannel<SequenceName, null>({ net: { sim, skin }, springs, recoil: { set() {} } }, () => new Vector3());
    const far = new Vector3(5, 0, 5);
    springs.kick(1.5, 0.05);
    let moved = 0, settledAt = Infinity;
    for (let i = 1; i <= 4 * 120; i++) {
      channel.step(1 / 120, null, far);
      moved = Math.max(moved, sim.maxDisplacement());
      if (!channel.settling() && settledAt === Infinity) settledAt = i / 120;
    }
    expect(toCm(moved)).toBeGreaterThan(0.1);
    expect(settledAt).toBeLessThan(3);
    expect(sim.settled && springs.settled).toBe(true);
  });

  it('the net simulation is cheap: well under a millisecond per frame (eight fixed substeps), measured so machine load cannot fail it', () => {
    // Cost per 60 fps frame with the ball in the net, in units of a fixed reference kernel timed in
    // the same process (fastest of interleaved rounds: contention only adds time). On the M2 Pro the
    // kernel takes ≈ 0.27 ms and the net ≈ 0.14 ms per frame (ratio ≈ 0.5). The bound, 2, is ≈ 0.54
    // ms at that speed. A genuinely slow net fails every attempt; a contended measurement is retried.
    let best = Infinity, last = { perFrameMs: 0, referenceMs: 0, ratio: Infinity };
    for (let attempt = 0; attempt < 4 && best >= 2; attempt++) {
      last = netCost(lattice);
      best = Math.min(best, last.ratio);
    }
    expect(best, `net ${last.perFrameMs.toFixed(3)} ms/frame vs reference ${last.referenceMs.toFixed(3)} ms`).toBeLessThan(2);
  });
});

describe('sports look guards', () => {
  it('the hard-coded seam frame shows the classic "( + )" to the shared camera at guest-ready', () => {
    const cam = cameraDirection();
    const toObject = pose('guest-ready').ballRot.clone().invert();
    const view = cam.clone().applyQuaternion(toObject).applyMatrix3(SEAM_FRAME);
    const screenUp = new Vector3(0, 1, 0).addScaledVector(cam, -cam.y).normalize().applyQuaternion(toObject).applyMatrix3(SEAM_FRAME);
    const lon = (Math.atan2(view.x, view.z) * 180) / Math.PI;
    const el = (Math.asin(view.y) * 180) / Math.PI;
    expect(Math.abs(lon)).toBeLessThan(12);
    expect(Math.abs(el)).toBeLessThan(12);
    expect(screenUp.y).toBeGreaterThan(0.9);
  });

  it('the ball renders as the master authored it: no runtime leather grade', () => {
    expect('LEATHER_GRADE' in sportsModel).toBe(false);
  });

  it('the net far layer is shaded darker than the near layer, smoothly', () => {
    const toCam = new Vector3(cameraDirection().x, 0, cameraDirection().z).normalize();
    const side = new Vector3(-toCam.z, 0, toCam.x);
    const pts = [toCam, toCam.clone().negate(), side].map((d) => d.clone().multiplyScalar(RIM.innerRadius));
    const base = new Float32Array(pts.flatMap((p) => [p.x, -0.2, p.z]));
    const c = farLayerShade(base, cameraDirection()).array as Float32Array;
    expect(c[0]).toBeCloseTo(1, 5);
    expect(c[3]).toBeCloseTo(NET_FAR_SHADE, 5);
    expect(c[6]).toBeGreaterThan(NET_FAR_SHADE);
    expect(c[6]).toBeLessThan(1);
  });
});

describe('sports staging on the studio floor', () => {
  it('the ball, wherever it touches down or rests, its shadow and the stand stay on flat floor in front of the cove', () => {
    const coveStart = SPORTS_WALL_Z + COVE_RADIUS;
    const shadowReach = BALL_R * 2.2 * 0.5 + 0.05;
    for (const seq of SEQS) {
      for (let t = 0; t <= REST_AT[seq] + 1e-9; t += 0.005) {
        const p = at(seq, t).ballPos;
        if (p.y <= BALL_R + 0.02) expect(p.z - shadowReach).toBeGreaterThan(coveStart);
      }
    }
    for (const p of [BALL_AT.host, BALL_AT.guest, REST.made, REST.missed]) expect(p.z - shadowReach).toBeGreaterThan(coveStart);
    expect(HOOP_ROOT.z + STAND.base.back - 0.15).toBeGreaterThan(coveStart);
    // Every path stays inside the motion bounds the key light aims at.
    const grown = SPORTS_BOUNDS.clone().expandByScalar(1e-6);
    for (const p of sportsFramePoints()) expect(grown.containsPoint(p)).toBe(true);
  });
});

describe('Sports v1.7: the hoop answers the bank and the rattle (hitKick → HoopSprings.kick)', () => {
  const deg = 180 / Math.PI;
  it('the impulses follow the ball\'s mass and the levers: the glass tips the board back, the ring tips the rim down', () => {
    const toM = SPORTS_CM_PER_UNIT / 100;
    // The bank by hand: J = −m Δv (N·s), L = r_y J_z − r_z J_y about BOARD_PIVOT (m), over its inertia.
    const J = BANK_HIT.impulse.clone().multiplyScalar(-BALL_MASS_KG * toM);
    const r = BANK_HIT.contact.clone().sub(HOOP_ROOT).sub(BOARD_PIVOT).multiplyScalar(toM);
    const k = hitKick(BANK_HIT);
    expect(k.rim).toBe(0);
    expect(k.board).toBeCloseTo((r.y * J.z - r.z * J.y) / HOOP_SPRINGS.board.inertia, 12);
    // Above the pivot, pushed back: the board's top goes back (negative pitch).
    expect(k.board).toBeLessThan(-0.1);
    for (const h of HITS.decline.filter((x) => x.surface === 'rim')) {
      const kr = hitKick(h);
      expect(kr.rim, `${h.at}`).toBeGreaterThan(1);
      expect(Math.abs(kr.board), `${h.at}`).toBeLessThan(0.5);
    }
    // The first clang is the hardest: the rim would swing past its 3° travel, so it bottoms out.
    const first = hitKick(HITS.decline[1]!);
    const omega = Math.sqrt(HOOP_SPRINGS.rim.stiffness / HOOP_SPRINGS.rim.inertia);
    expect((first.rim / omega) * deg).toBeGreaterThan(RECOIL_LIMIT.rimDeg);
  });

  it('the shudder stays under the stops and rings down before the ball rests: the loop can idle', () => {
    const springs = new HoopSprings(), dt = 1 / 120;
    let rimMax = 0, rimMin = 0, boardMax = 0, settledAt = Infinity, fired = 0;
    for (let t = 0; t < REST_AT.decline + 2; t += dt) {
      for (const h of HITS.decline) if (h.at > t && h.at <= t + dt) { const k = hitKick(h); springs.kick(k.rim, k.board); fired++; }
      springs.step(dt, 0, 0);
      rimMax = Math.max(rimMax, springs.rim);
      rimMin = Math.min(rimMin, springs.rim);
      boardMax = Math.max(boardMax, Math.abs(springs.board));
      if (springs.settled && settledAt === Infinity && fired === HITS.decline.length) settledAt = t;
      if (!springs.settled) settledAt = Infinity;
    }
    expect(fired).toBe(HITS.decline.length);
    expect(rimMax * deg).toBeCloseTo(RECOIL_LIMIT.rimDeg, 6);
    expect(rimMin).toBeGreaterThanOrEqual(RIM_BACKSTOP - 1e-12);
    expect(boardMax * deg).toBeGreaterThan(0.1);
    expect(boardMax * deg).toBeLessThan(RECOIL_LIMIT.boardDeg);
    // Settled ≈ 1.5 s after the last strike, long before the ball comes to rest.
    expect(settledAt).toBeLessThan(HITS.decline.at(-1)!.at + 2.5);
    expect(settledAt).toBeLessThan(REST_AT.decline);
  });

  it('the scene kicks once per strike along the program on screen, and a change of mind mid-rattle carries the shudder over the director\'s settle', () => {
    const rig = fakeRig();
    const scene = new SportsScene(rig, { category: 'sports', ball: 'orange' } as Extract<SceneConfig, { category: 'sports' }>);
    const kicks: number[] = [];
    const kick = rig.springs.kick.bind(rig.springs);
    rig.springs.kick = (a: number, b: number) => { kicks.push(a); kick(a, b); };
    const rims = HITS.decline.filter((h) => h.surface === 'rim');
    // The director samples the decline at 60 fps up to just after the first clang (twice over the
    // same time: no double kick); a new run from 0 starts the clock afresh.
    for (let t = 0; t <= rims[0]!.at + 0.03; t += 1 / 60) scene.sample('decline', t);
    scene.sample('decline', rims[0]!.at + 0.03);
    expect(kicks.length).toBe(2);
    for (let i = 0; i < 4; i++) rig.springs.step(1 / 120, 0, 0);
    const moving = rig.springs.save();
    expect(rig.springs.settled).toBe(false);
    // An interruption: the director settles, then refreshes; the rim keeps its motion.
    scene.interruptCut();
    scene.settle();
    expect(rig.springs.settled).toBe(true);
    scene.refresh();
    expect(rig.springs.save()).toEqual(moving);
    // The change of mind's first sample: the strikes still ahead in the copied rattle fire on its clock.
    for (let t = 0; t <= 1; t += 1 / 60) scene.sample('accept', t);
    expect(kicks.length).toBe(2 + rims.filter((h) => h.at > rims[0]!.at + 0.03).length);
    // Reduced motion (settle, then a placing pose, never a refresh): the hoop is at rest.
    scene.settle();
    scene.pose('declined');
    expect(rig.springs.settled).toBe(true);
  });
});

