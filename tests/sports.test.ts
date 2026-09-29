import { describe, expect, it } from 'vitest';
import { Box3, Color, MeshStandardMaterial, OrthographicCamera, Vector3 } from 'three';
import { DIRECTIONS, type MaterialLibrary } from '../src/render/materials.ts';
import { fitCameraToBounds } from '../src/render/camera.ts';
import { BALL_AT, BALL_R, BOARD, HOOP_ROOT, NET, POLE, RIM, RIM_CENTER, RIM_LOCAL, SPORTS_BOUNDS, SPORTS_NODES } from '../models/sportsContract.ts';
import { buildSportsGeometry } from '../models/sportsPremium.ts';
import { CONTACT_AT, DURATIONS, frameFor, newFrame, sampleSequence, type SportsFrame } from '../src/scenes/sports/sequences.ts';
import { sportsFramePoints } from '../src/scenes/sports/index.ts';
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

  it('the model provides every required node, a rim on the contract and a net in net space', () => {
    const direction = DIRECTIONS.L2;
    const cache = new Map<string, MeshStandardMaterial>();
    const lib = {
      direction,
      get: (n: string) => cache.get(n) ?? (cache.set(n, new MeshStandardMaterial({ name: n, color: new Color(direction.surfaces[n]!.color) })), cache.get(n)!),
      unique: (n: string) => new MeshStandardMaterial({ name: n }),
      dispose() {},
    } as unknown as MaterialLibrary;
    const root = buildSportsGeometry({ lib }, 'orange');
    for (const n of SPORTS_NODES) expect(root.getObjectByName(n), n).toBeTruthy();
    const rim = root.getObjectByName('rim')!;
    const net = root.getObjectByName('net')!;
    expect(net.position.distanceTo(RIM_LOCAL)).toBeLessThan(1e-6);
    root.updateMatrixWorld(true);
    const rimBox = new Box3().setFromObject(rim, true);
    const c = rimBox.getCenter(new Vector3());
    expect(c.distanceTo(RIM_CENTER)).toBeLessThan(0.03);
    net.updateMatrixWorld(true);
    const netBox = new Box3().setFromObject(net, true);
    expect(netBox.max.y).toBeLessThanOrEqual(RIM_CENTER.y + 0.03);
    expect(netBox.min.y).toBeGreaterThan(RIM_CENTER.y - NET.depth - 0.06);
  });
});
