import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { Box3, BufferAttribute, BufferGeometry, Matrix4, OrthographicCamera, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import type { Document, Node } from '@gltf-transform/core';
import type { KHRMaterialsVariants } from '@gltf-transform/extensions';
import { listTextureSlots } from '@gltf-transform/functions';
import { cameraDirection, fitCameraToBounds, fitPerspectiveToHero, PERSPECTIVE_FOV } from '../src/render/camera.ts';
import { HERO_FILL, PATH_CLEARANCE } from '../src/render/framing.ts';
import { SEAM_FRAME } from '../src/render/ballMaterial.ts';
import {
  BALL_AT, BALL_R, BOARD, BOARD_PIVOT, HOOP_PRODUCT_CM, HOOP_ROOT, HOOP_SCALE, NET, netRestRadius, POLE, RECOIL_LIMIT, RIM, RIM_BACKSTOP, RIM_BRACKET,
  RIM_CENTER, RIM_HINGE, RIM_LOCAL, SPORTS_BOUNDS, SPORTS_CM_PER_UNIT, SPORTS_NODES, STAND, recoilPoint,
} from '../models/sportsContract.ts';
import { analyseNet, HoopSprings, NET_SIM, NetSim, netMeshKind, type NetLattice } from '../models/sportsNet.ts';
import { boxIn, createIO, findNode } from '../scripts/masters/compose.ts';
import { BOUNCE, floorImpulse, GRAVITY, MS, ROLL_DECEL, squashFor } from '../src/scenes/sports/ballPhysics.ts';
import {
  CONTACT_AT, CONTACTS, DURATIONS, frameFor, GUEST_ROT, MADE_APEX, MISS_LAND, MISS_OFFSET, MISS_POINT, NET_KEEP, NET_PASSAGE, newFrame, RELEASE_AT, REST, REST_AT, RISE_FROM,
  sampleSequence, sampleTrack, SHOT_AXES, SHOT_BACKSPIN, type SportsFrame,
} from '../src/scenes/sports/sequences.ts';
import * as sportsModel from '../models/sports.ts';
import { farLayerShade, NET_FAR_SHADE, SPORTS_WALL_Z } from '../models/sports.ts';
import { COVE_RADIUS } from '../src/render/studio.ts';
import { BLEND_MARGIN, blendClearance, hoopDistance, sportsFramePoints, sportsInterruptCut } from '../src/scenes/sports/index.ts';
import { type Change, planChange, type Showing } from '../src/scenes/sports/change.ts';
import type { CanonicalPose, SequenceName } from '../src/core/types.ts';

const SEQS = ['host', 'accept', 'decline'] as const;
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
/** True while t lies in (or within a ms of) a floor contact or the net. */
const inContact = (seq: SequenceName, t: number) => CONTACTS[seq].some((c) => t > c.at - 2 * H && t < c.at + BOUNCE.contactTime + 2 * H);
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

  it('a 1.8 m drop rebounds to 1.2–1.4 m (FIBA) and compresses the ball 10 %', () => {
    const drop = 180 / SPORTS_CM_PER_UNIT;
    const vIn = Math.sqrt(2 * GRAVITY * drop);
    const v = new Vector3(0, -vIn, 0), w = new Vector3();
    const up = floorImpulse(v, w);
    const rebound = (up * up) / (2 * GRAVITY) * SPORTS_CM_PER_UNIT;
    expect(rebound).toBeGreaterThan(120);
    expect(rebound).toBeLessThan(140);
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

  it('every floor contact rebounds at e × the impact speed, until a rebound would rise under 1 mm', () => {
    for (const seq of SEQS) {
      const cs = CONTACTS[seq];
      expect(cs.length, seq).toBeGreaterThan(5);
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
        peak = Math.max(peak, f.squash);
        // The drawn bottom (vertical scale 1 − squash about the centre) is never below the floor…
        const bottom = f.ballPos.y - BALL_R * (1 - f.squash);
        expect(bottom, `${seq} ${t.toFixed(4)}`).toBeGreaterThanOrEqual(-1e-5);
        // …and while it is squashed it is exactly on it (no hover during a contact).
        if (f.squash > 1e-4) expect(bottom, `${seq} ${t.toFixed(4)}`).toBeLessThan(1e-5);
      }
      expect(peak, seq).toBeCloseTo(Math.max(...CONTACTS[seq].map((c) => c.squash)), 2);
    }
    // The hardest impact (the airball's first) compresses ≈ 8 %; small hops barely at all.
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

  it('every Decline visibly misses: never within a ball-width of the ring near rim height', () => {
    for (let i = 0; i <= REST_AT.decline * 1000; i++) {
      const p = at('decline', i / 1000).ballPos;
      if (Math.abs(p.y - RIM_CENTER.y) < 0.5) expect(horizontal(p, RIM_CENTER)).toBeGreaterThan(RIM.innerRadius + 2 * BALL_R + 0.1);
    }
  });

  it('the ball never enters the floor, the backboard, the pole or the base', () => {
    for (const seq of SEQS) {
      for (let i = 0; i <= REST_AT[seq] * 1000; i++) {
        const p = at(seq, i / 1000).ballPos;
        expect(p.y).toBeGreaterThanOrEqual(BALL_R * (1 - 0.1) - 1e-9);
        expect(BOARD_BOX.distanceToPoint(p), `${seq} board`).toBeGreaterThan(BALL_R);
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
      for (let t = RELEASE_AT + 2 * H; t < CONTACTS[seq].at(-1)!.at; t += H) {
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
    for (const seq of ['accept', 'decline'] as const) {
      const e = 1e-5;
      const pre = pos(seq, RELEASE_AT - e).sub(pos(seq, RELEASE_AT - 2 * e)).divideScalar(e);
      const post = pos(seq, RELEASE_AT + 2 * e).sub(pos(seq, RELEASE_AT + e)).divideScalar(e);
      expect(Math.hypot(pre.x - post.x, pre.z - post.z)).toBeLessThan(0.2);
      expect(pre.y).toBeGreaterThan(0.4 * post.y);
      for (let t = RELEASE_AT - 0.08; t < RELEASE_AT - 0.01; t += 0.005) expect(vel(seq, t + 0.005).y).toBeGreaterThan(vel(seq, t).y);
    }
  });
});

describe('Sports spin', () => {
  it('the shots leave with real backspin (2–3 rev/s) about their roll axes', () => {
    for (const [seq, rev, t1] of [['accept', SHOT_BACKSPIN.made, CONTACT_AT], ['decline', SHOT_BACKSPIN.missed, CONTACTS.decline[0]!.at]] as const) {
      expect(rev).toBeGreaterThanOrEqual(2);
      expect(rev).toBeLessThanOrEqual(3);
      for (let t = RELEASE_AT + 0.02; t < t1 - 0.02; t += 0.05) {
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

  it('the airball travels towards the hoop, passes rim height beside it and lands past the backboard', () => {
    const guest = screen(BALL_AT.guest), miss = screen(MISS_POINT), rim = screen(RIM_CENTER);
    expect(MISS_POINT.y).toBeCloseTo(RIM_CENTER.y, 6);
    expect(miss.x - guest.x).toBeGreaterThan(0.1);
    expect(rim.x - miss.x).toBeGreaterThan(RIM.innerRadius + RIM.tube + BALL_R + 0.2);
    expect(MISS_OFFSET).toBeGreaterThan(RIM.innerRadius + RIM.tube + BALL_R + 0.2);
    expect(CONTACTS.decline[0]!.point.distanceTo(MISS_LAND)).toBeLessThan(1e-6);
    expect(MISS_LAND.z).toBeLessThan(HOOP_ROOT.z + BOARD.front - BOARD.thickness);
  });

  it('the declined ball ends well apart from guest-ready, accepted and host-ready at phone scale', () => {
    const declined = screen(pose('declined').ballPos);
    for (const other of ['guest-ready', 'accepted', 'host-ready'] as const) {
      expect(declined.distanceTo(screen(pose(other).ballPos)) / (2 * BALL_R), other).toBeGreaterThanOrEqual(1.2);
    }
    expect(screen(pose('accepted').ballPos).distanceTo(screen(pose('guest-ready').ballPos)) / (2 * BALL_R)).toBeGreaterThanOrEqual(1.2);
  });

  it('the ball still reads at a good size under the hero framing (≥ 5.5 % of the frame height)', () => {
    // The hero: the hoop's silhouette (board corners, base) and the ball at guest-ready.
    const hero: Vector3[] = [];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const z of [BOARD.front, BOARD.front - BOARD.thickness]) hero.push(new Vector3(HOOP_ROOT.x + (sx * BOARD.width) / 2, BOARD.centerY + (sy * BOARD.height) / 2, HOOP_ROOT.z + z));
    for (const corner of [BASE_BOX.min, BASE_BOX.max]) hero.push(corner.clone());
    hero.push(new Vector3(BASE_BOX.min.x, 0, BASE_BOX.max.z), new Vector3(BASE_BOX.max.x, 0, BASE_BOX.max.z));
    for (const d of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const) hero.push(BALL_AT.guest.clone().add(new Vector3(...d).multiplyScalar(BALL_R)));
    const camera = new PerspectiveCamera(PERSPECTIVE_FOV, 1, 0.5, 400);
    const fit = fitPerspectiveToHero(camera, SPORTS_BOUNDS.getCenter(new Vector3()), 1, hero, sportsFramePoints(), HERO_FILL, PATH_CLEARANCE);
    expect(fit.pathLimited).toBe(false);
    const top = BALL_AT.guest.clone().setY(2 * BALL_R).project(camera), bottom = BALL_AT.guest.clone().setY(0).project(camera);
    // 5.9 % (v1.4: 9 %): the real ratio of a 7" ball to a 4 ft mini system, 42 px on a 720 px poster.
    expect((top.y - bottom.y) / 2).toBeGreaterThan(0.055);
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
          expect(p.distanceTo(prev), `${label} ${u.toFixed(3)}`).toBeLessThan(0.02);
          expect(p.y - BALL_R * (1 - squash), `${label} ${u.toFixed(3)}`).toBeGreaterThanOrEqual(-1e-5);
          expect(BOARD_BOX.distanceToPoint(p), `${label} board ${u.toFixed(3)}`).toBeGreaterThan(BALL_R);
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
    for (const [seq, to, t] of [['accept', 'decline', 0.5], ['decline', 'accept', 0.5], ['decline', 'accept', 4]] as const) {
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

/** Run the net along a sequence's ball path (net space, fixed 1/120 s steps), as the scene does. */
function runNet(lattice: NetLattice, seq: SequenceName, seconds: number, each?: (t: number, sim: NetSim, springs: HoopSprings, ball: Vector3) => void) {
  const sim = new NetSim(lattice), springs = new HoopSprings();
  const dt = 1 / 120, f = newFrame();
  const toNet = (p: Vector3, out: Vector3) => {
    const o = recoilPoint(RIM_LOCAL, springs.board, springs.rim);
    out.copy(p).sub(HOOP_ROOT).sub(o);
    const a = -(springs.board + springs.rim), c = Math.cos(a), s = Math.sin(a);
    return out.set(out.x, out.y * c - out.z * s, out.y * s + out.z * c);
  };
  const contact = { center: new Vector3(), previous: new Vector3() };
  for (let t = 0; t < seconds; t += dt) {
    toNet(sampleTrack(seq, t, f).ballPos, contact.previous);
    toNet(sampleTrack(seq, t + dt, f).ballPos, contact.center);
    sim.step(dt, contact);
    springs.step(dt, sim.settled ? 0 : sim.hookTorqueRim, sim.settled ? 0 : sim.hookTorqueBoard);
    each?.(t + dt, sim, springs, contact.center);
  }
  return { sim, springs };
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
    const bones = lattice.cords.length + lattice.nodes.length;
    for (const [, bind] of lattice.binding) for (const arr of [bind.bone0, bind.bone1]) for (const b of arr) expect(b).toBeLessThan(bones);
  });

  it('the net hangs at rest under gravity: the master\'s top, its bottom opened to clear the ball; it stays put without the ball', () => {
    const sim = new NetSim(lattice);
    // The rim loops and the top rows hang as the master; the lower rows open (NET_HANG).
    for (const k of lattice.rows[0]!) expect(lattice.nodes[k]!.distanceTo(sim.restNode(k))).toBeLessThan(0.01);
    // The bottom ring's inner opening (knot centres less a knot) is ≥ 1.1 × the ball.
    const bottom = Math.min(...lattice.rows[5]!.map((k) => Math.hypot(sim.restNode(k).x, sim.restNode(k).z)));
    expect((2 * (bottom - NET_SIM.knotRadius)) / (2 * BALL_R)).toBeGreaterThan(1.1);
    for (const seq of ['host', 'decline'] as const) {
      const { sim: s, springs } = runNet(lattice, seq, REST_AT[seq]);
      expect(s.settled, seq).toBe(true);
      expect(springs.settled, seq).toBe(true);
      expect(s.maxDisplacement(), seq).toBe(0);
    }
  });

  it('the made ball opens the net (no knot ever inside it), drags it down, and the net whips back and settles', () => {
    let maxOpen = 0, minGap = Infinity, wake = Infinity, lift = 0, settledAt = Infinity, lateSwing = 0;
    const bottom = lattice.rows[5]!;
    const p = new Vector3();
    const { sim } = runNet(lattice, 'accept', REST_AT.accept, (t, s, _springs, ball) => {
      if (!s.settled && wake === Infinity) wake = t;
      if (s.settled && t > CONTACT_AT + 0.2 && settledAt === Infinity) settledAt = t;
      for (let i = 0; i < s.n; i++) {
        s.node(i, p);
        minGap = Math.min(minGap, p.distanceTo(ball) - BALL_R);
        const r = Math.hypot(p.x, p.z), r0 = Math.hypot(s.restNode(i).x, s.restNode(i).z);
        maxOpen = Math.max(maxOpen, r - r0);
      }
      // The whip: once the ball has left, the bottom row rises above where it hangs.
      if (t > NET_PASSAGE.exitAt) for (const k of bottom) lift = Math.max(lift, s.node(k, p).y - s.restNode(k).y);
      if (t > NET_PASSAGE.exitAt + 2) lateSwing = Math.max(lateSwing, s.maxDisplacement());
    });
    // Woken as the ball comes near the net (never before release), at the latest at contact.
    expect(wake).toBeGreaterThan(RELEASE_AT);
    expect(wake).toBeLessThan(CONTACT_AT + 0.02);
    // The knots are pushed round the ball (≥ 2 cm outward), never inside it.
    expect(maxOpen).toBeGreaterThan(0.06);
    expect(minGap).toBeGreaterThan(NET_SIM.knotRadius - 0.006);
    expect(lift).toBeGreaterThan(0.02);
    // It swings for a while, is all but still (every knot within 5.4 mm of rest) 2 s after the
    // ball has left, and snaps to rest once its last sub-millimetre sway has died.
    expect(lateSwing).toBeLessThan(0.015);
    expect(settledAt - NET_PASSAGE.exitAt).toBeGreaterThan(1);
    expect(settledAt - NET_PASSAGE.exitAt).toBeLessThan(4.5);
    expect(sim.settled).toBe(true);
  });

  it('the rim and board answer the net\'s real pull: bounded, the rim stopped by the board, both back at rest', () => {
    let rimMax = 0, rimMin = 0, boardMax = 0, forceMax = 0;
    const { springs } = runNet(lattice, 'accept', REST_AT.accept, (_t, s, sp) => {
      rimMax = Math.max(rimMax, sp.rim);
      rimMin = Math.min(rimMin, sp.rim);
      boardMax = Math.max(boardMax, Math.abs(sp.board));
      forceMax = Math.max(forceMax, s.hookForce.length());
    });
    const deg = 180 / Math.PI;
    // A swish pulls the hooks with a few newtons (the ball's momentum change in the net).
    expect(forceMax).toBeGreaterThan(2);
    expect(forceMax).toBeLessThan(15);
    expect(rimMax * deg).toBeGreaterThan(0.3);
    expect(rimMax * deg).toBeLessThanOrEqual(RECOIL_LIMIT.rimDeg);
    expect(rimMin).toBeGreaterThanOrEqual(RIM_BACKSTOP - 1e-12);
    // The board on its steel pole barely moves for a swish.
    expect(boardMax * deg).toBeLessThan(0.2);
    expect(springs.settled).toBe(true);
  });

  it('the net simulation is cheap: well under a millisecond per frame (two fixed steps)', () => {
    const sim = new NetSim(lattice);
    const contact = { center: new Vector3(0, -0.3, 0), previous: new Vector3(0, -0.25, 0) };
    sim.step(1 / 120, contact);
    const t0 = performance.now();
    for (let i = 0; i < 240; i++) {
      contact.previous.copy(contact.center);
      contact.center.y = -0.3 - 0.4 * Math.sin(i / 20);
      sim.step(1 / 120, contact);
    }
    expect((performance.now() - t0) / 120).toBeLessThan(1);
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

