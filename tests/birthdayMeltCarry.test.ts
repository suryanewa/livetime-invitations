import { afterAll, describe, expect, it, vi } from 'vitest';
import { Color, MeshStandardMaterial } from 'three';
import { DIRECTIONS, type MaterialLibrary } from '../src/render/materials.ts';
import { createFlameMaterial } from '../src/render/flame.ts';
import { rigBirthday } from '../models/birthday.ts';
import { buildBirthdayGeometry } from '../models/birthdayParts.ts';
import { CANDLE_COUNT } from '../models/birthdayContract.ts';
import { buildDisposalBin } from '../models/disposalBin.ts';
import { BirthdayScene } from '../src/scenes/birthday/index.ts';
import { DURATIONS } from '../src/scenes/birthday/poses.ts';
import { GUEST_READY_LIT } from '../src/scenes/birthday/sequences.ts';
import { candleShortening, MELT_CAP } from '../src/scenes/birthday/melt.ts';

// v1.5 polish (motion review: "the melt pops back on a change of mind"): the live seconds the
// candles burnt at rest are carried across an interruption, and only an interruption.

const context2d = new Proxy({ createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }) } as Record<string, unknown>, {
  get: (o, k) => (k in o ? o[k as string] : () => undefined),
});
vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context2d }) });
afterAll(() => vi.unstubAllGlobals());

function testLibrary(): MaterialLibrary {
  const direction = DIRECTIONS.L2;
  const make = (name: string) => (name === 'mat_flame' ? createFlameMaterial(name) : new MeshStandardMaterial({ name, color: new Color(direction.surfaces[name]!.color) }));
  return { direction, get: make, unique: make, dispose() {} } as unknown as MaterialLibrary;
}

describe('Birthday melt: carried across a change of mind', () => {
  const lib = testLibrary();
  const build = () => {
    const rig = rigBirthday(buildBirthdayGeometry({ lib }), buildDisposalBin({ lib }), lib, 'vanilla');
    return { rig, scene: new BirthdayScene(rig, { category: 'birthday', cake: 'vanilla' }) };
  };
  // How far each wick has burnt down (the melt's one geometric read-out in the procedural rig).
  const burnt = (rig: ReturnType<typeof build>['rig']) => rig.candles.map((c) => c.wickY - c.wick.position.y);

  it('ten seconds at rest burn the candles down; an interruption keeps it, a load or replay does not', () => {
    const { rig, scene } = build();
    scene.pose('guest-ready');
    const fresh = burnt(rig);
    for (let i = 0; i < CANDLE_COUNT; i++) expect(fresh[i]).toBeCloseTo(candleShortening(i, GUEST_READY_LIT[i]!), 9);
    for (let k = 0; k < 1200; k++) scene.simulate(1 / 120);
    const watched = burnt(rig);
    for (let i = 0; i < CANDLE_COUNT; i++) {
      expect(watched[i]).toBeCloseTo(candleShortening(i, GUEST_READY_LIT[i]! + Math.min(10, MELT_CAP)), 6);
      expect(watched[i]).toBeGreaterThan(fresh[i]!);
    }
    // Accept, then a change of mind: the director asks for the cut, settles, rests on guest-ready.
    scene.sample('accept', 0.4);
    scene.interruptCut();
    scene.settle();
    scene.pose('guest-ready');
    const after = burnt(rig);
    for (let i = 0; i < CANDLE_COUNT; i++) expect(after[i]).toBeGreaterThanOrEqual(watched[i]! - 1e-9);
    // The replayed decline starts from the same melt (no pop-back as it plays).
    scene.sample('decline', 0);
    burnt(rig).forEach((b, i) => expect(b).toBeGreaterThanOrEqual(watched[i]! - 1e-9));
    // A plain settle (load, replay, reduced motion) returns to the canonical pose's melt.
    scene.settle();
    scene.pose('guest-ready');
    burnt(rig).forEach((b, i) => expect(b).toBeCloseTo(fresh[i]!, 9));
  });

  it('the blown-out wax sets on the live clock only after a watched blow-out', () => {
    const { scene } = build();
    scene.pose('guest-ready');
    scene.sample('accept', DURATIONS.accept - 1 / 120);
    scene.pose('accepted');
    expect(scene.settling()).toBe(true);
    // A canonical 'accepted' reached any other way is still once its smoke is (none here).
    const other = build().scene;
    other.pose('accepted');
    expect(other.settling()).toBe(false);
  });
});
