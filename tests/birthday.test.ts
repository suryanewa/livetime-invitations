import { describe, expect, it } from 'vitest';
import { Box3, Color, MeshStandardMaterial, type Object3D, Vector3 } from 'three';
import { DIRECTIONS, type MaterialLibrary } from '../src/render/materials.ts';
import { BIN_POS, BIN_YAW, birthdayBounds, CAKE, CAKE_RADIUS, CAKE_TOTAL_HEIGHT, RIM_CLEARANCE, STAND_TOP } from '../models/birthdayContract.ts';
import { buildCakeGeometry } from '../models/cake.ts';
import { BIN, buildDisposalBin } from '../models/disposalBin.ts';
import { CANDLE_HOVER, CANDLE_START, DURATIONS, WISP_OPACITY } from '../src/scenes/birthday/poses.ts';
import { frameFor, newFrame, sampleSequence, type BirthdayFrame } from '../src/scenes/birthday/sequences.ts';
import type { CanonicalPose, SequenceName } from '../src/core/types.ts';

const at = (seq: SequenceName, t: number) => sampleSequence(seq, t, newFrame());
const pose = (p: CanonicalPose) => frameFor(p, newFrame());

function close(a: BirthdayFrame, b: BirthdayFrame, eps = 1e-6) {
  expect(a.cakePos.distanceTo(b.cakePos)).toBeLessThan(eps);
  expect(a.binPos.distanceTo(b.binPos)).toBeLessThan(eps);
  for (const k of ['cakeYaw', 'wickLean', 'flaps'] as const) expect(Math.abs(a[k] - b[k])).toBeLessThan(eps);
  for (const k of ['drop', 'flameScale', 'flameOpacity', 'flameLean', 'wispOpacity'] as const) {
    for (let i = 0; i < 3; i++) expect(Math.abs(a[k][i]! - b[k][i]!)).toBeLessThan(eps);
  }
  expect(a.cakeVisible).toBe(b.cakeVisible);
  expect(a.binVisible).toBe(b.binVisible);
}

/** Cake position in the bin's local frame (x across the flaps, z along the approach). */
function binLocal(p: Vector3) {
  const dx = p.x - BIN_POS.x, dz = p.z - BIN_POS.z;
  const c = Math.cos(-BIN_YAW), s = Math.sin(-BIN_YAW);
  return { x: dx * c + dz * s, z: -dx * s + dz * c, d: Math.hypot(dx, dz) };
}

describe('Birthday choreography', () => {
  it('each sequence starts and ends exactly on its canonical poses', () => {
    close(at('host', 0), pose('host-ready'));
    close(at('host', DURATIONS.host), pose('guest-ready'));
    close(at('accept', 0), pose('guest-ready'));
    close(at('accept', DURATIONS.accept), pose('accepted'));
    close(at('decline', 0), pose('guest-ready'));
    close(at('decline', DURATIONS.decline), pose('declined'));
  });

  it('has no discontinuities: consecutive 1 ms samples never jump', () => {
    for (const seq of ['host', 'accept', 'decline'] as const) {
      let prev = at(seq, 0);
      for (let i = 1; i <= DURATIONS[seq] * 1000; i++) {
        const cur = at(seq, i / 1000);
        expect(cur.cakePos.distanceTo(prev.cakePos)).toBeLessThan(0.02);
        for (let k = 0; k < 3; k++) {
          expect(Math.abs(cur.drop[k]! - prev.drop[k]!)).toBeLessThan(0.01);
          expect(Math.abs(cur.flameOpacity[k]! - prev.flameOpacity[k]!)).toBeLessThan(0.05);
        }
        expect(Math.abs(cur.flaps - prev.flaps)).toBeLessThan(0.03);
        if (seq !== 'decline' || i > 1) expect(cur.binPos.distanceTo(prev.binPos)).toBeLessThan(0.05);
        prev = cur;
      }
    }
  });

  it('candles lower ≈100 ms apart and land at exactly the insertion depth', () => {
    for (let i = 0; i < 3; i++) {
      expect(at('host', CANDLE_START[i]! - 0.001).drop[i]).toBeCloseTo(CANDLE_HOVER, 9);
      expect(at('host', CANDLE_START[i]! + 0.05).drop[i]).toBeLessThan(CANDLE_HOVER);
      expect(at('host', 0.85).drop[i]).toBeCloseTo(0, 9);
    }
    expect(CANDLE_START[1]! - CANDLE_START[0]!).toBeCloseTo(0.1, 9);
    expect(CANDLE_START[2]! - CANDLE_START[1]!).toBeCloseTo(0.1, 9);
  });

  it('flames appear only in 0.85–1.05 s as a restrained rise, never a flash', () => {
    let prev = [0, 0, 0];
    for (let i = 0; i <= 1300; i++) {
      const f = at('host', i / 1000);
      for (let k = 0; k < 3; k++) {
        const o = f.flameOpacity[k]!;
        if (i / 1000 < 0.85) expect(o).toBe(0);
        if (i / 1000 >= 1.05) expect(o).toBe(1);
        expect(o).toBeGreaterThanOrEqual(prev[k]! - 1e-12);
        expect(f.flameScale[k]!).toBeLessThanOrEqual(1);
        prev[k] = o;
      }
    }
  });

  it('accept: flames go out left to right by 0.60 s; one faint wisp each, gone by 1.00 s; wicks at rest', () => {
    const outAt = [0, 1, 2].map((k) => {
      for (let i = 0; i <= 1400; i++) if (at('accept', i / 1000).flameOpacity[k] === 0) return i;
      return Infinity;
    });
    expect(outAt[0]).toBeLessThan(outAt[1]!);
    expect(outAt[1]).toBeLessThan(outAt[2]!);
    expect(outAt[2]).toBeLessThanOrEqual(600);
    for (let i = 0; i <= 1400; i++) {
      const f = at('accept', i / 1000);
      for (let k = 0; k < 3; k++) {
        expect(f.wispOpacity[k]!).toBeLessThanOrEqual(WISP_OPACITY + 1e-9);
        if (i < 600 || i >= 1000) expect(f.wispOpacity[k]).toBe(0);
      }
    }
    expect(at('accept', 1.4).wickLean).toBe(0);
  });

  it('decline: the cake clears the rim, passes between the flaps and drops straight down, centred', () => {
    for (let i = 0; i <= 1500; i++) {
      const f = at('decline', i / 1000);
      const p = f.cakePos;
      const local = binLocal(p);
      // Any plan overlap with the bin: the underside is above the rim.
      if (local.d < CAKE_RADIUS + BIN.radius + 0.02 && p.y > BIN.floor + 0.01 && local.d > 0.01) expect(p.y).toBeGreaterThanOrEqual(BIN.rimTop + RIM_CLEARANCE - 0.02);
      // Over the opening: stays between the open flaps.
      if (local.d < BIN.opening && p.y > BIN.rimTop) expect(Math.abs(local.x) + CAKE_RADIUS).toBeLessThan(BIN.hingeX - 0.02);
      // Below the rim: exactly centred in the opening.
      if (p.y < BIN.rimTop + 0.05 && local.d < BIN.radius + CAKE_RADIUS) expect(local.d).toBeLessThan(1e-6);
      // While over the stand, never below its top.
      if (Math.hypot(p.x, p.z) < CAKE.trayRadius + CAKE_RADIUS) expect(p.y).toBeGreaterThanOrEqual(STAND_TOP - 1e-9);
    }
  });

  it('decline: flaps close only once the cake and candles are below them; the hidden cake stops rendering', () => {
    const closingStarts = (() => {
      for (let i = 300; i <= 1500; i++) if (at('decline', i / 1000).flaps < 1 - 1e-9) return i / 1000;
      return 2;
    })();
    const f = at('decline', closingStarts);
    expect(f.cakePos.y + CAKE_TOTAL_HEIGHT).toBeLessThan(BIN.rimTop - 0.012);
    expect(at('decline', 1.5).cakeVisible).toBe(false);
    expect(at('decline', 0.2).flameOpacity.every((o) => o === 0)).toBe(true);
  });

  it('the bin clears the stand: plan distance exceeds plate + bin radii', () => {
    expect(Math.hypot(BIN_POS.x, BIN_POS.z)).toBeGreaterThanOrEqual(CAKE.trayRadius + BIN.radius + 0.04);
  });
});

function plainLibrary(): MaterialLibrary {
  const direction = DIRECTIONS.L2;
  const cache = new Map<string, MeshStandardMaterial>();
  const make = (name: string) => {
    const spec = direction.surfaces[name];
    if (!spec) throw new Error(`Unknown material ${name}`);
    return new MeshStandardMaterial({ name, color: new Color(spec.color) });
  };
  return {
    direction,
    get: (name: string) => cache.get(name) ?? (cache.set(name, make(name)), cache.get(name)!),
    unique: make,
    dispose() {},
  } as unknown as MaterialLibrary;
}

function box(o: Object3D): Box3 {
  o.updateWorldMatrix(true, true);
  return new Box3().setFromObject(o, true);
}

describe('Birthday model contract', () => {
  const lib = plainLibrary();
  const cake = buildCakeGeometry({ lib }, 'vanilla');
  // Flames are out before the cake travels: measure with them collapsed.
  for (const i of [1, 2, 3]) cake.getObjectByName(`flame_0${i}`)!.scale.setScalar(1e-6);
  const cakeBox = box(cake.getObjectByName('cake_authored')!);

  it('the cake (with piping) fits the bin opening and sits below the flaps on the liner floor', () => {
    const radius = Math.max(cakeBox.max.x, -cakeBox.min.x, cakeBox.max.z, -cakeBox.min.z);
    expect(radius).toBeLessThanOrEqual(CAKE_RADIUS + 1e-6);
    expect(CAKE_RADIUS).toBeLessThan(BIN.opening - 0.04);
    const height = cakeBox.max.y - STAND_TOP;
    expect(height).toBeLessThanOrEqual(CAKE_TOTAL_HEIGHT + 1e-6);
    expect(BIN.floor + height).toBeLessThan(BIN.rimTop - 0.012);
  });

  it('the bin with open flaps and the cake arc stay inside the birthday motion bounds', () => {
    const bin = buildDisposalBin({ lib });
    bin.position.copy(BIN_POS);
    bin.rotation.y = BIN_YAW;
    bin.getObjectByName('bin_flap_l')!.rotation.z = BIN.flapOpen;
    bin.getObjectByName('bin_flap_r')!.rotation.z = -BIN.flapOpen;
    const bounds = birthdayBounds().expandByScalar(1e-6);
    const binBox = box(bin);
    if (!bounds.containsBox(binBox)) console.log('bin', binBox.min.toArray(), binBox.max.toArray(), 'bounds', bounds.min.toArray(), bounds.max.toArray());
    if (!bounds.containsBox(cakeBox)) console.log('cake', cakeBox.min.toArray(), cakeBox.max.toArray());
    expect(bounds.containsBox(binBox)).toBe(true);
    expect(bounds.containsBox(cakeBox)).toBe(true);
    void new Vector3();
  });
});
