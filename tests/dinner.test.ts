import { describe, expect, it } from 'vitest';
import { Box3, Color, MeshStandardMaterial, type Object3D, Vector3 } from 'three';
import { DIRECTIONS, type MaterialLibrary } from '../src/render/materials.ts';
import {
  COVER, COVER_BESIDE, COVER_CLEARANCE, COVER_SEATED, DINNER_BIN_POS, DINNER_BIN_YAW, DINNER_NODES, DINNER_RIM_CLEARANCE, DISH_HEIGHT, FOOD, PLATE,
  dinnerBounds,
} from '../models/dinnerContract.ts';
import { buildDinnerGeometry } from '../models/dinnerPremium.ts';
import { BIN, buildDisposalBin } from '../models/disposalBin.ts';
import { DURATIONS, frameFor, newFrame, sampleSequence, type DinnerFrame } from '../src/scenes/dinner/sequences.ts';
import type { CanonicalPose, SequenceName } from '../src/core/types.ts';

const at = (seq: SequenceName, t: number) => sampleSequence(seq, t, newFrame());
const pose = (p: CanonicalPose) => frameFor(p, newFrame());
const close = (a: DinnerFrame, b: DinnerFrame, eps = 1e-6) => {
  expect(a.platePos.distanceTo(b.platePos)).toBeLessThan(eps);
  expect(a.coverPos.distanceTo(b.coverPos)).toBeLessThan(eps);
  expect(a.binPos.distanceTo(b.binPos)).toBeLessThan(eps);
  expect(Math.abs(a.coverTilt - b.coverTilt)).toBeLessThan(eps);
  expect(Math.abs(a.flaps - b.flaps)).toBeLessThan(eps);
  expect(a.dishVisible).toBe(b.dishVisible);
  expect(a.binVisible).toBe(b.binVisible);
};
const plan = (p: Vector3, c: Vector3) => Math.hypot(p.x - c.x, p.z - c.z);

/** Lowest point of the cover's skirt for its position and tilt. */
const skirtLow = (f: DinnerFrame) => f.coverPos.y - COVER.radius * Math.abs(Math.sin(f.coverTilt));

describe('Dinner choreography', () => {
  it('each sequence starts and ends exactly on its canonical poses', () => {
    close(at('host', 0), pose('host-ready'));
    close(at('host', DURATIONS.host), pose('guest-ready'));
    close(at('accept', 0), pose('guest-ready'));
    close(at('accept', DURATIONS.accept), pose('accepted'));
    close(at('decline', 0), pose('guest-ready'));
    close(at('decline', DURATIONS.decline), pose('declined'));
  });

  it('has no discontinuities (1 ms samples)', () => {
    for (const seq of ['host', 'accept', 'decline'] as const) {
      let prev = at(seq, 0);
      for (let i = 1; i <= DURATIONS[seq] * 1000; i++) {
        const cur = at(seq, i / 1000);
        expect(cur.coverPos.distanceTo(prev.coverPos)).toBeLessThan(0.02);
        expect(cur.platePos.distanceTo(prev.platePos)).toBeLessThan(0.02);
        expect(Math.abs(cur.coverTilt - prev.coverTilt)).toBeLessThan(0.01);
        if (seq !== 'decline' || i > 1) expect(cur.binPos.distanceTo(prev.binPos)).toBeLessThan(0.05);
        prev = cur;
      }
    }
  });

  it('covering and uncovering never pass the cover through the food or the plate rim', () => {
    for (const seq of ['host', 'accept'] as const) {
      for (let i = 0; i <= DURATIONS[seq] * 1000; i++) {
        const f = at(seq, i / 1000);
        const off = plan(f.coverPos, f.platePos);
        const seatedish = off < 1e-6 && Math.abs(f.coverTilt) < 1e-6;
        if (seatedish) continue; // Level and centred: the food is inside the cavity (model test).
        // Over the food: the skirt clears the food envelope.
        if (off < COVER.radius + FOOD.radius) expect(skirtLow(f)).toBeGreaterThan(PLATE.well + FOOD.centreHeight + COVER_CLEARANCE - 1e-6);
        // Over the plate rim: the skirt clears the rim.
        else if (off < COVER.radius + PLATE.radius) expect(skirtLow(f)).toBeGreaterThan(PLATE.rimHeight + 0.005);
      }
    }
  });

  it('the resting cover sits beside the plate, not on it', () => {
    expect(plan(COVER_BESIDE, new Vector3())).toBeGreaterThan(COVER.radius + PLATE.radius + 0.02);
  });

  it('decline: the covered dish clears the rim, passes between the flaps and drops in centred; flaps close after', () => {
    const c = Math.cos(-DINNER_BIN_YAW), s = Math.sin(-DINNER_BIN_YAW);
    let closingAt = 2;
    for (let i = 0; i <= 1500; i++) {
      const f = at('decline', i / 1000);
      const p = f.platePos;
      const dx = p.x - DINNER_BIN_POS.x, dz = p.z - DINNER_BIN_POS.z;
      const d = Math.hypot(dx, dz), lx = dx * c + dz * s;
      if (d < PLATE.radius + BIN.radius + 0.02 && d > 1e-6) expect(p.y).toBeGreaterThanOrEqual(BIN.rimTop + DINNER_RIM_CLEARANCE - 0.02);
      if (d < BIN.opening && p.y > BIN.rimTop) expect(Math.abs(lx) + PLATE.radius).toBeLessThan(BIN.hingeX - 0.02);
      if (p.y < BIN.rimTop + 0.05 && d < BIN.radius + PLATE.radius) expect(d).toBeLessThan(1e-6);
      expect(f.coverPos.clone().sub(f.platePos).distanceTo(COVER_SEATED)).toBeLessThan(1e-9); // one unit
      if (i >= 300 && f.flaps < 1 - 1e-9 && closingAt === 2) closingAt = i / 1000;
    }
    const f = at('decline', closingAt);
    expect(f.platePos.y + DISH_HEIGHT).toBeLessThan(BIN.rimTop - 0.012);
    expect(at('decline', 1.5).dishVisible).toBe(false);
  });

  it('the bin clears the plate and the dish fits its opening', () => {
    expect(Math.hypot(DINNER_BIN_POS.x, DINNER_BIN_POS.z)).toBeGreaterThanOrEqual(PLATE.radius + BIN.radius + 0.04);
    expect(PLATE.radius).toBeLessThan(BIN.opening - 0.04);
    expect(BIN.floor + DISH_HEIGHT).toBeLessThan(BIN.rimTop - 0.012);
  });
});

function plainLibrary(): MaterialLibrary {
  const direction = DIRECTIONS.L2;
  const cache = new Map<string, MeshStandardMaterial>();
  const make = (n: string) => {
    const spec = direction.surfaces[n];
    if (!spec) throw new Error(`Unknown material ${n}`);
    return new MeshStandardMaterial({ name: n, color: new Color(spec.color) });
  };
  return { direction, get: (n: string) => cache.get(n) ?? (cache.set(n, make(n)), cache.get(n)!), unique: make, dispose() {} } as unknown as MaterialLibrary;
}
const box = (o: Object3D) => { o.updateWorldMatrix(true, true); return new Box3().setFromObject(o, true); };

describe('Dinner model contract', () => {
  const lib = plainLibrary();
  for (const preset of ['pasta', 'vegetables'] as const) {
    it(`${preset}: required nodes, plate and cover on contract, food inside the envelope and under the cloche`, () => {
      const root = buildDinnerGeometry({ lib }, preset);
      for (const n of DINNER_NODES.filter((n) => !n.startsWith('bin_'))) expect(root.getObjectByName(n), n).toBeTruthy();
      const plate = box(root.getObjectByName('plate_secondary')!.children.find((c) => c.name !== 'food_root')!);
      expect(Math.max(plate.max.x, -plate.min.x, plate.max.z, -plate.min.z)).toBeLessThanOrEqual(PLATE.radius + 0.005);
      const foodGroup = root.getObjectByName(preset === 'pasta' ? 'food_pasta' : 'food_vegetables')!;
      const food = box(foodGroup);
      expect(Math.max(food.max.x, -food.min.x, food.max.z, -food.min.z)).toBeLessThanOrEqual(FOOD.radius + 0.01);
      expect(food.max.y).toBeLessThanOrEqual(PLATE.well + FOOD.centreHeight + 0.005);
      const cover = box(root.getObjectByName('cover_authored')!);
      expect(Math.max(cover.max.x, -cover.min.x, cover.max.z, -cover.min.z)).toBeLessThanOrEqual(COVER.radius + 0.03);
      expect(cover.max.y).toBeLessThanOrEqual(PLATE.well + COVER.domeHeight + COVER.handleHeight + 0.01);
      expect(cover.min.y).toBeGreaterThanOrEqual(PLATE.well - 0.005);
    });
  }

  it('the bin with open flaps, the carry and the resting cover stay inside the dinner bounds', () => {
    const bin = buildDisposalBin({ lib });
    bin.position.copy(DINNER_BIN_POS);
    bin.rotation.y = DINNER_BIN_YAW;
    bin.getObjectByName('bin_flap_l')!.rotation.z = BIN.flapOpen;
    bin.getObjectByName('bin_flap_r')!.rotation.z = -BIN.flapOpen;
    const bounds = dinnerBounds().expandByScalar(1e-6);
    expect(bounds.containsBox(box(bin))).toBe(true);
    expect(bounds.containsPoint(COVER_BESIDE.clone().add(new Vector3(COVER.radius, 0, 0)))).toBe(true);
  });
});
