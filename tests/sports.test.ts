import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { Box3, Matrix4, OrthographicCamera, Vector3 } from 'three';
import type { Node } from '@gltf-transform/core';
import type { KHRMaterialsVariants } from '@gltf-transform/extensions';
import { listTextureSlots } from '@gltf-transform/functions';
import { cameraDirection, fitCameraToBounds } from '../src/render/camera.ts';
import { SEAM_FRAME } from '../src/render/ballMaterial.ts';
import {
  BALL_AT, BALL_R, BOARD, HOOP_ROOT, HOOP_SCALE, NET, NET_OPEN_RADIUS, netOpenScale, netRestRadius, POLE, RIM, RIM_CENTER, RIM_LOCAL, SPORTS_BOUNDS, SPORTS_NODES,
} from '../models/sportsContract.ts';
import { boxIn, createIO, findNode } from '../scripts/masters/compose.ts';
import {
  CONTACT_AT, DURATIONS, frameFor, GRAVITY, LANDINGS, MADE_LAND_AT, MISS_LAND_AT, MISS_POINT, NET_DRAG, NET_EXIT, NET_HOLD, newFrame, PASS_LAND_AT, RELEASE_AT, sampleSequence,
  type SportsFrame,
} from '../src/scenes/sports/sequences.ts';
import { farLayerShade, NET_FAR_SHADE, NET_STRETCH, SPORTS_WALL_Z } from '../models/sports.ts';
import { COVE_RADIUS } from '../src/render/studio.ts';
import { BLEND_MARGIN, blendClearance, hoopDistance, sportsFramePoints, sportsInterruptCut } from '../src/scenes/sports/index.ts';
import type { CanonicalPose, SequenceName } from '../src/core/types.ts';

const at = (seq: SequenceName, t: number) => sampleSequence(seq, t, newFrame());
const pose = (p: CanonicalPose) => frameFor(p, newFrame());
const close = (a: SportsFrame, b: SportsFrame, eps = 1e-6) => {
  expect(a.ballPos.distanceTo(b.ballPos)).toBeLessThan(eps);
  expect(a.ballRot.angleTo(b.ballRot)).toBeLessThan(eps);
  expect(Math.abs(a.netFlare - b.netFlare)).toBeLessThan(eps);
};
const horizontal = (p: Vector3, c: Vector3) => Math.hypot(p.x - c.x, p.z - c.z);

/** Board as a box in world space. */
const BOARD_BOX = new Box3(
  new Vector3(HOOP_ROOT.x - BOARD.width / 2, BOARD.centerY - BOARD.height / 2, HOOP_ROOT.z + BOARD.front - BOARD.thickness),
  new Vector3(HOOP_ROOT.x + BOARD.width / 2, BOARD.centerY + BOARD.height / 2, HOOP_ROOT.z + BOARD.front),
);

describe('Sports choreography', () => {
  it('each sequence starts and ends exactly on its canonical poses', () => {
    close(at('host', 0), pose('host-ready'));
    close(at('host', DURATIONS.host), pose('guest-ready'));
    for (const seq of ['accept', 'decline'] as const) close(at(seq, 0), pose('guest-ready'));
    close(at('accept', DURATIONS.accept), pose('accepted'));
    close(at('decline', DURATIONS.decline), pose('declined'));
  });

  it('has no discontinuities in position or spin (1 ms samples)', () => {
    for (const seq of ['host', 'accept', 'decline'] as const) {
      let prev = at(seq, 0);
      for (let i = 1; i <= DURATIONS[seq] * 1000; i++) {
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
    for (let i = 0; i <= 1700; i++) {
      const p = at('accept', i / 1000).ballPos;
      apex = Math.max(apex, p.y);
      // Wherever the ball could reach the ring (its height band, near the hoop), it stays inside.
      if (Math.abs(p.y - RIM_CENTER.y) < BALL_R + RIM.tube && horizontal(p, RIM_CENTER) < RIM.innerRadius + BALL_R + RIM.tube + 0.05) {
        expect(horizontal(p, RIM_CENTER) + BALL_R).toBeLessThan(RIM.innerRadius - RIM.tube + 1e-6);
      }
    }
    expect(apex).toBeGreaterThan(RIM_CENTER.y + 0.6);
  });

  it('every Decline visibly misses: never within a ball-width of the ring near rim height', () => {
    for (let i = 0; i <= 1600; i++) {
      const p = at('decline', i / 1000).ballPos;
      if (Math.abs(p.y - RIM_CENTER.y) < 0.5) expect(horizontal(p, RIM_CENTER)).toBeGreaterThan(RIM.innerRadius + 2 * BALL_R + 0.1);
    }
  });

  it('the ball never enters the floor, the backboard or the pole', () => {
    const pole = new Vector3(HOOP_ROOT.x, 0, HOOP_ROOT.z + POLE.z);
    for (const seq of ['host', 'accept', 'decline'] as const) {
      for (let i = 0; i <= DURATIONS[seq] * 1000; i++) {
        const p = at(seq, i / 1000).ballPos;
        expect(p.y).toBeGreaterThanOrEqual(BALL_R - 1e-9);
        expect(BOARD_BOX.distanceToPoint(p)).toBeGreaterThan(BALL_R);
        if (p.y < POLE.top) expect(horizontal(p, pole)).toBeGreaterThan(BALL_R + POLE.radius * 1.2);
        if (p.y < BALL_R + 0.07) expect(horizontal(p, pole)).toBeGreaterThan(BALL_R + POLE.baseRadius - 0.02);
      }
    }
  });

  it('the net moves only for the made shot, from the contact beat, and is at rest at the end', () => {
    for (const seq of ['host', 'decline'] as const) {
      for (let i = 0; i <= DURATIONS[seq] * 1000; i += 5) expect(at(seq, i / 1000).netFlare).toBe(0);
    }
    expect(at('accept', CONTACT_AT - 0.001).netFlare).toBe(0);
    expect(at('accept', CONTACT_AT + 0.06).netFlare).toBeGreaterThan(0.5);
    expect(at('accept', DURATIONS.accept).netFlare).toBe(0);
  });

  it('the made ball passes through the net without touching it (flared net envelope)', () => {
    for (let i = Math.round(CONTACT_AT * 1000); i <= 1700; i++) {
      const f = at('accept', i / 1000);
      const p = f.ballPos;
      const depth = NET.depth * (1 + f.netStretch * NET_STRETCH);
      const below = RIM_CENTER.y - p.y; // how far the ball centre is under the rim
      // Any part of the ball inside the net's height range must fit its radius there.
      for (const dy of [-BALL_R, -BALL_R / 2, 0, BALL_R / 2, BALL_R]) {
        const d = below - dy;
        if (d <= 0 || d >= depth) continue;
        const frac = d / depth;
        // The master net's measured inner envelope, opened by the rig's deformation.
        const radius = netRestRadius(frac) * netOpenScale(frac, f.netFlare);
        const halfChord = Math.sqrt(Math.max(0, BALL_R * BALL_R - dy * dy));
        expect(horizontal(p, RIM_CENTER) + halfChord).toBeLessThan(radius + 1e-6);
      }
    }
  });

  it('the made ball lands after leaving the net, bounces once and settles below/beside the hoop', () => {
    let bounces = 0, rising = false, prevY = RIM_CENTER.y;
    for (let i = Math.round(CONTACT_AT * 1000); i <= 1700; i++) {
      const y = at('accept', i / 1000).ballPos.y;
      if (y > prevY + 1e-9 && !rising) { bounces++; rising = true; }
      if (y < prevY - 1e-9) rising = false;
      prevY = y;
    }
    expect(bounces).toBe(1);
    expect(horizontal(BALL_AT.made, RIM_CENTER)).toBeLessThan(0.7);
  });
});

/** Velocity and acceleration by central differences (1 ms). */
const H = 1e-3;
const pos = (seq: SequenceName, t: number) => at(seq, t).ballPos;
const vel = (seq: SequenceName, t: number) => pos(seq, t + H).sub(pos(seq, t - H)).divideScalar(2 * H);
const acc = (seq: SequenceName, t: number) => pos(seq, t + H).add(pos(seq, t - H)).sub(pos(seq, t).multiplyScalar(2)).divideScalar(H * H);
const DOWN_G = () => new Vector3(0, -GRAVITY, 0);
/** Ball centre in the shared camera's view plane (orthographic: equal to stage units). */
const screen = (p: Vector3) => {
  const camera = new OrthographicCamera();
  fitCameraToBounds(camera, SPORTS_BOUNDS, 1, undefined, sportsFramePoints());
  const q = p.clone().applyMatrix4(camera.matrixWorldInverse);
  return new Vector3(q.x, q.y, 0);
};

describe('Sports ballistics: one gravity, no stalls, bounded net drag', () => {
  it('the made ball keeps moving through the rim: no stall at the contact beat', () => {
    const before = vel('accept', CONTACT_AT - 2 * H), after = vel('accept', CONTACT_AT + 2 * H);
    // The ball enters the net with the arc's own velocity (it used to drop from −6 to 0 u/s in 1 ms).
    expect(after.distanceTo(before)).toBeLessThan(0.2);
    expect(before.y).toBeLessThan(-5);
    // Through the net and down to the floor it never slows below the net's pass-through speed.
    for (let t = CONTACT_AT; t < MADE_LAND_AT - 2 * H; t += H) expect(vel('accept', t).length()).toBeGreaterThan(0.45 * before.length());
    // Per 60 fps frame it keeps covering ground after contact (it used to sit in the rim ~6 frames).
    for (let i = 0; i < 6; i++) {
      const t = CONTACT_AT + i / 60;
      expect(pos('accept', t + 1 / 60).distanceTo(pos('accept', t))).toBeGreaterThan(0.05);
    }
  });

  it('after release every flight falls under one gravity; only the net adds a bounded drag', () => {
    expect(NET_DRAG).toBeLessThan(2.5 * GRAVITY);
    const flights: [SequenceName, number, number][] = [['host', 0.2, PASS_LAND_AT], ['accept', RELEASE_AT, MADE_LAND_AT], ['decline', RELEASE_AT, MISS_LAND_AT]];
    for (const [seq, t0, t1] of flights) {
      for (let t = t0 + 2 * H; t <= t1 - 2 * H; t += H) {
        const a = acc(seq, t);
        const inNet = seq === 'accept' && t > CONTACT_AT - 2 * H && t < CONTACT_AT + NET_EXIT + 2 * H;
        if (inNet) {
          expect(a.clone().sub(DOWN_G()).length()).toBeLessThanOrEqual(NET_DRAG + 1e-3);
          expect(a.length()).toBeLessThanOrEqual(GRAVITY + NET_DRAG);
        } else {
          // Free flight, the airball included past its miss point: exactly the shared gravity.
          expect(a.distanceTo(DOWN_G())).toBeLessThan(0.05);
        }
      }
    }
  });

  it('bounces and the catch hop fall under the same gravity', () => {
    const hops: [SequenceName, number, number][] = [['host', PASS_LAND_AT, DURATIONS.host], ['accept', MADE_LAND_AT, DURATIONS.accept], ['decline', MISS_LAND_AT, DURATIONS.decline]];
    for (const [seq, t0, t1] of hops) {
      let airborne = 0;
      for (let t = t0 + 2 * H; t <= t1 - 2 * H; t += H) {
        if (Math.min(pos(seq, t - H).y, pos(seq, t).y, pos(seq, t + H).y) <= BALL_R + 1e-9) continue;
        airborne++;
        expect(acc(seq, t).y).toBeCloseTo(-GRAVITY, 1);
      }
      expect(airborne).toBeGreaterThan(50);
    }
  });

  it('the gather hands the flight a moving ball: the release is not a step from rest', () => {
    for (const seq of ['accept', 'decline'] as const) {
      // One-sided velocities right at the release (10 µs steps).
      const e = 1e-5;
      const pre = pos(seq, RELEASE_AT - e).sub(pos(seq, RELEASE_AT - 2 * e)).divideScalar(e);
      const post = pos(seq, RELEASE_AT + 2 * e).sub(pos(seq, RELEASE_AT + e)).divideScalar(e);
      // Same horizontal velocity on both sides of the release, and already rising fast.
      expect(Math.hypot(pre.x - post.x, pre.z - post.z)).toBeLessThan(0.2);
      expect(pre.y).toBeGreaterThan(0.4 * post.y);
      // Never parked mid-air: once off the floor it only speeds up until it leaves.
      for (let t = RELEASE_AT - 0.08; t < RELEASE_AT - 0.01; t += 0.005) expect(vel(seq, t + 0.005).y).toBeGreaterThan(vel(seq, t).y);
    }
  });

  it('landing times, landing spots and the net hold are derived from the curves', () => {
    for (const [seq, landAt, land] of [['accept', MADE_LAND_AT, LANDINGS.made], ['decline', MISS_LAND_AT, LANDINGS.missed]] as const) {
      expect(pos(seq, landAt).distanceTo(land)).toBeLessThan(1e-6);
      expect(pos(seq, landAt - 0.01).y).toBeGreaterThan(BALL_R + 0.04);
    }
    // The net starts to swing back exactly when the made ball's top has left its bottom.
    expect(pos('accept', CONTACT_AT + NET_HOLD).y + BALL_R).toBeCloseTo(RIM_CENTER.y - NET.depth, 6);
    expect(at('accept', CONTACT_AT + NET_HOLD - 0.01).netFlare).toBe(1);
    expect(at('accept', CONTACT_AT + NET_HOLD + 0.05).netFlare).toBeLessThan(1);
    // Both balls land and then roll on towards their rest spots (no slide back).
    expect(horizontal(BALL_AT.made, LANDINGS.made)).toBeGreaterThan(0.15);
    expect(horizontal(BALL_AT.missed, LANDINGS.missed)).toBeGreaterThan(0.15);
    expect(horizontal(BALL_AT.missed, BALL_AT.guest)).toBeGreaterThan(horizontal(LANDINGS.missed, BALL_AT.guest));
  });
});

describe('Sports legibility: the airball is a shot, the declined pose is not the ready pose', () => {
  it('the airball travels towards the hoop, passes rim height beside it and lands past the backboard', () => {
    const guest = screen(BALL_AT.guest), miss = screen(MISS_POINT), rim = screen(RIM_CENTER);
    expect(MISS_POINT.y).toBeCloseTo(RIM_CENTER.y, 6);
    // On screen it heads for the rim, then passes it with a clear gap (ring radius + ball + margin).
    expect(miss.x - guest.x).toBeGreaterThan(0.4);
    expect(rim.x - miss.x).toBeGreaterThan(RIM.innerRadius + RIM.tube + BALL_R + 0.2);
    // In the court it travels further than the made shot and comes down behind the board's plane.
    expect(horizontal(LANDINGS.missed, BALL_AT.guest)).toBeGreaterThan(horizontal(RIM_CENTER, BALL_AT.guest));
    expect(LANDINGS.missed.z).toBeLessThan(HOOP_ROOT.z + BOARD.front - BOARD.thickness);
  });

  it('the declined ball ends well apart from guest-ready, accepted and host-ready at phone scale', () => {
    const declined = screen(pose('declined').ballPos);
    for (const other of ['guest-ready', 'accepted', 'host-ready'] as const) {
      const gap = declined.distanceTo(screen(pose(other).ballPos)) / (2 * BALL_R);
      // At least 1.2 ball diameters in 2D (never a screen-x-only test): the silhouettes never touch.
      expect(gap, other).toBeGreaterThanOrEqual(1.2);
    }
  });

  it('the airball and the declined rest never widen the frame', () => {
    for (const aspect of [0.75, 1, 1.5]) {
      const fit = (seqs: readonly SequenceName[]) => {
        const c = new OrthographicCamera();
        fitCameraToBounds(c, SPORTS_BOUNDS, aspect, undefined, sportsFramePoints(seqs));
        return [c.left, c.right, c.bottom, c.top];
      };
      const all = fit(['host', 'accept', 'decline']), without = fit(['host', 'accept']);
      for (let i = 0; i < 4; i++) expect(all[i]).toBeCloseTo(without[i]!, 6);
    }
  });
});

describe('Sports change response: blend unless a straight blend crosses the hoop', () => {
  const cut = (seq: SequenceName, t: number) => {
    const f = at(seq, t);
    return sportsInterruptCut(f.ballPos, f);
  };

  it('blends mid-flight and at rest, cuts at the rim and while the net moves', () => {
    // The old cylinder rule cut from 0.39 s; the straight path back stays clear there.
    for (let t = 0; t <= 0.75; t += 0.01) expect(cut('accept', t), `accept ${t.toFixed(2)}`).toBe(false);
    expect(cut('accept', 0.5)).toBe(false);
    // Above the rim the straight path back would clip the ring; inside the net it would cross it.
    expect(cut('accept', 0.85)).toBe(true);
    expect(cut('accept', CONTACT_AT + 0.1)).toBe(true);
    // The airball never crosses the hoop, so a change always blends (both directions now agree).
    for (let t = 0; t <= DURATIONS.decline; t += 0.01) expect(cut('decline', t), `decline ${t.toFixed(2)}`).toBe(false);
    for (const p of ['guest-ready', 'accepted', 'declined'] as const) expect(sportsInterruptCut(pose(p).ballPos, pose(p))).toBe(false);
  });

  it('a blend never passes the ball through the rim, net, board or pole', () => {
    for (const seq of ['accept', 'decline'] as const) {
      for (let t = 0; t <= DURATIONS[seq]; t += 0.01) {
        const f = at(seq, t);
        if (sportsInterruptCut(f.ballPos, f)) continue;
        // Dense re-check of the straight path (the decision samples it 32 times).
        const p = new Vector3();
        let min = Infinity;
        for (let i = 0; i <= 200; i++) min = Math.min(min, hoopDistance(p.lerpVectors(f.ballPos, BALL_AT.guest, i / 200)));
        expect(min, `${seq} ${t.toFixed(3)}`).toBeGreaterThan(BALL_R);
      }
    }
    // And the clearance really measures the hoop: from inside the rim a blend is blocked.
    expect(blendClearance(RIM_CENTER)).toBeLessThan(BALL_R + BLEND_MARGIN);
  });
});

describe('Sports framing and model contract', () => {
  it('ball and hoop fill 60–75 % of the stage width in the ready pose', () => {
    const camera = new OrthographicCamera();
    fitCameraToBounds(camera, SPORTS_BOUNDS, 1, undefined, sportsFramePoints());
    const inv = camera.matrixWorldInverse;
    let min = Infinity, max = -Infinity;
    const add = (p: Vector3) => { const q = p.clone().applyMatrix4(inv); min = Math.min(min, q.x); max = Math.max(max, q.x); };
    for (const s of [-1, 1]) add(new Vector3(BALL_AT.guest.x + s * BALL_R, BALL_R, BALL_AT.guest.z));
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) add(new Vector3(HOOP_ROOT.x + (sx * BOARD.width) / 2, BOARD.centerY + (sy * BOARD.height) / 2, HOOP_ROOT.z + BOARD.front));
    const fill = (max - min) / (camera.right - camera.left);
    expect(fill).toBeGreaterThanOrEqual(0.6);
    expect(fill).toBeLessThanOrEqual(0.75);
  });

  it('the open net clears the ball and leaves rows already wider than the ball alone', () => {
    // Fully open, every row of the net is at least NET_OPEN_RADIUS from the rim axis.
    for (let t = 0; t <= 1; t += 0.01) expect(netRestRadius(t) * netOpenScale(t, 1)).toBeGreaterThanOrEqual(NET_OPEN_RADIUS - 1e-9);
    expect(NET_OPEN_RADIUS).toBeGreaterThan(BALL_R + 0.05);
    // At rest nothing moves, and the top rows (wider than the open radius) never move.
    for (let t = 0; t <= 1; t += 0.05) expect(netOpenScale(t, 0)).toBe(1);
    expect(netOpenScale(0, 1)).toBe(1);
    // The rest envelope starts at the rim's inner radius.
    expect(Math.abs(netRestRadius(0) - RIM.innerRadius)).toBeLessThan(0.005);
  });
});

/** The exported runtime GLB (pnpm models sports), measured with gltf-transform. */
describe('Sports runtime GLB matches the contract', async () => {
  const doc = await createIO().read(join(import.meta.dirname, '..', 'assets', 'scenes', 'sports', 'sports.glb'));
  const node = (name: string) => findNode(doc, name);
  const worldOf = (n: Node) => new Matrix4().fromArray(n.getWorldMatrix());
  /** Every vertex under `n`, in sports_root space. */
  const vertices = (n: Node) => {
    const out: Vector3[] = [];
    const toRoot = worldOf(node('sports_root')).invert();
    n.traverse((c) => {
      const m = toRoot.clone().multiply(worldOf(c));
      for (const prim of c.getMesh()?.listPrimitives() ?? []) {
        const pos = prim.getAttribute('POSITION')!;
        const e = [0, 0, 0];
        for (let i = 0; i < pos.getCount(); i++) out.push(new Vector3(...(pos.getElement(i, e) as [number, number, number])).applyMatrix4(m));
      }
    });
    return out;
  };

  it('has every contract node exactly once', () => {
    for (const n of SPORTS_NODES) expect(() => node(n), n).not.toThrow();
  });

  it('the ball is the master at BALL_R, centred on ball_secondary', () => {
    const box = boxIn(node('ball_mesh'), node('ball_secondary'));
    const size = box.max.clone().sub(box.min);
    for (const k of ['x', 'y', 'z'] as const) expect(Math.abs(size[k] / 2 - BALL_R)).toBeLessThan(0.002);
    expect(box.max.clone().add(box.min).length() / 2).toBeLessThan(0.002);
    // A mapped contract node is an empty transform at its pivot with unit scale (quantisation's
    // node scale/offset lands on its `_mesh` holder child), so spins and squash compose cleanly.
    const ball = node('ball_mesh');
    expect(ball.getMesh()).toBeNull();
    expect(ball.getScale()).toEqual([1, 1, 1]);
    expect(new Vector3(...ball.getTranslation()).length()).toBeLessThan(1e-6);
    expect(node('ball_mesh_mesh').getParentNode()).toBe(ball);
    expect((node('ball_mesh_mesh').getExtras() as { noShadowCast?: boolean }).noShadowCast).toBe(true);
  });

  it('declares its WebP textures (EXT_texture_webp, required) and keeps normal maps lossless', () => {
    const webp = doc.getRoot().listExtensionsUsed().find((e) => e.extensionName === 'EXT_texture_webp');
    expect(webp?.isRequired()).toBe(true);
    for (const t of doc.getRoot().listTextures()) {
      expect(t.getMimeType()).toBe('image/webp');
      const img = t.getImage()!;
      // RIFF....WEBPVP8L = lossless bitstream, VP8 = lossy.
      const chunk = new TextDecoder().decode(img.subarray(12, 16));
      if (listTextureSlots(t).some((s) => /normal/i.test(s))) expect(chunk, t.getName()).toBe('VP8L');
    }
  });

  it('the rim ring is centred on RIM_CENTER with the contract inner radius', () => {
    const ring = vertices(node('rim')).filter((v) => Math.abs(v.y - RIM_CENTER.y) <= RIM.tube * 1.05 && v.z > RIM_CENTER.z - RIM.innerRadius - 2 * RIM.tube);
    const radii = ring.map((v) => Math.hypot(v.x - RIM_CENTER.x, v.z - RIM_CENTER.z)).filter((r) => r > 0.3);
    expect(Math.abs(Math.min(...radii) - RIM.innerRadius)).toBeLessThan(0.003);
    expect(Math.abs(Math.max(...radii) - (RIM.innerRadius + 2 * RIM.tube))).toBeLessThan(0.003);
    expect(HOOP_SCALE).toBeCloseTo(0.88692, 4);
  });

  it('the net hangs in net space at RIM_LOCAL, within NET.depth, outside its measured envelope', () => {
    const net = node('net');
    expect(new Vector3(...net.getTranslation()).distanceTo(RIM_LOCAL)).toBeLessThan(1e-4);
    expect(net.listChildren().filter((c) => c.getMesh()).length).toBe(3);
    const vs = vertices(net);
    let top = -Infinity, bottom = Infinity;
    for (const v of vs) {
      top = Math.max(top, v.y);
      bottom = Math.min(bottom, v.y);
      const t = (RIM_CENTER.y - v.y) / NET.depth;
      if (t < 0 || t > 1) continue;
      expect(Math.hypot(v.x - RIM_CENTER.x, v.z - RIM_CENTER.z)).toBeGreaterThan(netRestRadius(t) - 0.012);
    }
    expect(top).toBeLessThanOrEqual(RIM_CENTER.y + 0.005);
    expect(Math.abs(RIM_CENTER.y - bottom - NET.depth)).toBeLessThan(0.003);
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
    // The chrome back plate touches the board's back; the pole stays behind it.
    const hardware = new Box3().setFromPoints(vertices(node('hoop_hardware')));
    expect(hardware.max.z).toBeCloseTo(h.z + BOARD.front - BOARD.thickness, 2);
    const stand = vertices(node('hoop_stand'));
    expect(Math.min(...stand.map((v) => v.y))).toBeCloseTo(0, 3);
    // Above the base, the pole, clamp and arm stay behind the back plate.
    expect(Math.max(...stand.filter((v) => v.y > 0.5).map((v) => v.z))).toBeLessThanOrEqual(hardware.max.z - 0.01);
  });

  it('stores the cream ball as a material variant and nothing is left unbound', () => {
    const variants = doc.getRoot().listExtensionsUsed().find((e) => e.extensionName === 'KHR_materials_variants') as KHRMaterialsVariants | undefined;
    expect(variants?.listVariants().map((v) => v.getName())).toEqual(['orange', 'cream']);
    const names = doc.getRoot().listMaterials().map((m) => m.getName());
    expect(names).toContain('ball_leather');
    expect(names).toContain('ball_leather_cream');
    for (const m of doc.getRoot().listMaterials()) expect(m.getName(), 'every material is named').not.toBe('');
  });
});

describe('sports look guards', () => {
  it('the hard-coded seam frame shows the classic "( + )" to the shared camera at guest-ready', () => {
    // If the camera angles or the host pass change, SEAM_FRAME must be recomputed.
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
  it('the ball, wherever it touches down or rests, and its contact shadow stay on flat floor in front of the cove', () => {
    const coveStart = SPORTS_WALL_Z + COVE_RADIUS;
    const shadowReach = BALL_R * 2.2 * 0.5 + 0.05; // widest contact-shadow spread behind the ball, plus margin
    for (const seq of ['host', 'accept', 'decline'] as const) {
      for (let t = 0; t <= DURATIONS[seq] + 1e-9; t += 0.005) {
        const p = at(seq, t).ballPos;
        if (p.y <= BALL_R + 0.02) expect(p.z - shadowReach).toBeGreaterThan(coveStart);
      }
    }
    for (const p of Object.values(BALL_AT)) expect(p.z - shadowReach).toBeGreaterThan(coveStart);
  });
});
