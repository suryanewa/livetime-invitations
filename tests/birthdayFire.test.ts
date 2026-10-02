import { afterAll, describe, expect, it, vi } from 'vitest';
import { Color, Mesh, MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import { DIRECTIONS, type MaterialLibrary } from '../src/render/materials.ts';
import { blackbodyAt, createFlameMaterial, SMOKE_RADIANCE, sootRadiance } from '../src/render/flame.ts';
import { rigBirthday } from '../models/birthday.ts';
import { CANDLE_LIGHT } from '../models/birthdayFire.ts';
import { buildBirthdayGeometry } from '../models/birthdayParts.ts';
import { CANDLE, CANDLE_COUNT, CANDLE_SOCKETS, STAND_TOP } from '../models/birthdayContract.ts';
import { buildDisposalBin } from '../models/disposalBin.ts';
import { BirthdayScene } from '../src/scenes/birthday/index.ts';
import { CARRY_FROM, DURATIONS, IGNITE_START, ON_STAND } from '../src/scenes/birthday/poses.ts';
import {
  ashAt, BREATH, BREATH_AT, EMBER, emberAt, extinguishedAt, FLAME_REST, wickChar, burnRate, flameScale, flameState, flicker, FLICKER, MM, newFlicker, newSmokeStrand, plumeRise,
  POOL_Y, SMOKE, SMOKE_POINT_COUNT, SMOKE_STRAND_COUNT, smokeRate, smokeSource, smokeStrand, SNUFF, type SmokeStrand, WICK_TIP_Y, type WickAt,
} from '../src/scenes/birthday/fire.ts';

/** Wick tip of candle i in cake_secondary space (seated, nominal). */
const IGNITE_START_OF = (i: number) => IGNITE_START[i]!;
const wick = (i: number): [number, number, number] => [CANDLE_SOCKETS[i]![0], CANDLE.seat + WICK_TIP_Y, CANDLE_SOCKETS[i]![1]];
/** The wick standing still (the cake on its stand): where every parcel was born. */
const still = (i: number): WickAt => (_birth, out) => { const w = wick(i); out[0] = w[0]; out[1] = w[1]; out[2] = w[2]; };
/** Densest smoke within `r` (scene units) of the wick, over the thread's points. */
const alphaNear = (st: SmokeStrand, w: [number, number, number], r: number) => {
  let m = 0;
  for (let k = 0; k < SMOKE_POINT_COUNT; k++) {
    const d = Math.hypot(st.position[k * 3]! - w[0], st.position[k * 3 + 1]! - w[1], st.position[k * 3 + 2]! - w[2]);
    if (d < r) m = Math.max(m, st.alpha[k]!);
  }
  return m;
};
const MPS = 5;

describe('Birthday fire: the flame', () => {
  it('is a birthday candle flame: 13–15 mm from the pool, 4.5–5.5 mm wide, widest at the wick top; each a little different', () => {
    const sizes = Array.from({ length: CANDLE_COUNT }, (_, i) => flameScale(i));
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(0.93);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(1.07);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeGreaterThan(0.04);
    const top = FLAME_REST.base + FLAME_REST.length - POOL_Y;
    expect(top / MM).toBeGreaterThanOrEqual(13);
    expect(top / MM).toBeLessThanOrEqual(15);
    expect((2 * FLAME_REST.radius) / MM).toBeGreaterThanOrEqual(4.5);
    expect((2 * FLAME_REST.radius) / MM).toBeLessThanOrEqual(5.5);
    expect(FLAME_REST.base + FLAME_REST.widest * FLAME_REST.length).toBeCloseTo(WICK_TIP_Y, 9);
  });

  it('flickers at 10–12 Hz with a few per cent of length, sways a few degrees in the room\'s draft, and is exactly still at gain 0', () => {
    const fl = newFlicker();
    for (let i = 0; i < CANDLE_COUNT; i++) {
      // Dominant frequency from zero crossings of the length over 4 s at 1 kHz.
      const xs: number[] = [];
      let maxDh = 0, maxSway = 0;
      for (let k = 0; k < 4000; k++) {
        flicker(i, k / 1000, 1, fl);
        xs.push(fl.height - 1);
        maxDh = Math.max(maxDh, Math.abs(fl.height - 1));
        maxSway = Math.max(maxSway, Math.hypot(fl.swayX, fl.swayZ));
      }
      // The fast component: subtract a 60 ms moving average (drops the slow sub-harmonic).
      const hi = xs.map((x, k) => x - xs.slice(Math.max(0, k - 30), k + 30).reduce((a, b) => a + b, 0) / (Math.min(xs.length, k + 30) - Math.max(0, k - 30)));
      let crossings = 0;
      for (let k = 100; k < 3900; k++) if (hi[k - 1]! < 0 && hi[k]! >= 0) crossings++;
      const hz = crossings / 3.8;
      expect(hz).toBeGreaterThan(9.5);
      expect(hz).toBeLessThan(12.5);
      expect(maxDh).toBeLessThanOrEqual(FLICKER.amplitude + 1e-9);
      expect(maxDh).toBeGreaterThan(0.01);
      expect(maxSway).toBeLessThan((3.5 * Math.PI) / 180);
      flicker(i, 1.234, 0, fl);
      for (const [v, rest] of [[fl.height, 1], [fl.width, 1], [fl.intensity, 1], [fl.swayX, 0], [fl.swayZ, 0]] as const) expect(Math.abs(v - rest)).toBe(0);
    }
  });

  it('is coloured by temperature: 1,900 K soot is orange-white, and gas cooled to 1,300 K is under 1 % as bright', () => {
    const [r, g, b] = sootRadiance(1900);
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
    const lum = (c: Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    expect(lum(blackbodyAt(1900, new Color()))).toBeCloseTo(1, 2);
    expect(lum(blackbodyAt(1300, new Color()))).toBeLessThan(0.01);
  });

  it('gives the melt its burn rate: 0 unlit, 1 for the steady flame, never more for a stretched one, 0 once out', () => {
    for (let i = 0; i < CANDLE_COUNT; i++) {
      expect(burnRate(i, IGNITE_START_OF(i) - 0.001, 'host')).toBe(0);
      expect(burnRate(i, DURATIONS.host, 'host')).toBe(1);
      expect(burnRate(i, 0.01, 'accept')).toBe(1);
      for (let t = 0; t < 1.4; t += 0.005) expect(burnRate(i, t, 'accept')).toBeLessThanOrEqual(1);
      expect(burnRate(i, extinguishedAt(i) + 0.001, 'accept')).toBe(0);
      expect(burnRate(i, 0.3, 'decline')).toBe(0);
    }
  });
});

describe('Birthday fire: the smoke', () => {
  it('rises as a candle plume: 0.3–0.5 m/s a few centimetres up, slower higher', () => {
    const v = (z: number) => {
      // Time to rise through z ± 5 mm.
      let a0 = 0, a1 = 0;
      for (let a = 0; a < 3; a += 0.0005) { if (plumeRise(a, 1) < z - 0.005) a0 = a; if (plumeRise(a, 1) < z + 0.005) a1 = a; }
      return 0.01 / (a1 - a0);
    };
    for (const z of [0.03, 0.05, 0.1]) {
      expect(v(z)).toBeGreaterThan(0.25);
      expect(v(z)).toBeLessThan(0.55);
    }
    expect(v(0.2)).toBeLessThan(v(0.03));
  });

  it('starts at the wick the moment the flame lifts off it, and is gone by SMOKE.end', () => {
    const st = newSmokeStrand();
    for (let i = 0; i < CANDLE_COUNT; i++) {
      const b = BREATH_AT[i]!;
      expect(smokeRate(i, b.lift - 1e-6)).toBe(0);
      expect(smokeStrand(i, 0, b.lift - 0.001, still(i), st)).toBe(false);
      // 40 ms after lift-off the thread reads at the wick tip (its newest parcel is on the wick).
      expect(smokeStrand(i, 0, b.lift + 0.04, still(i), st)).toBe(true);
      expect(Math.hypot(st.position[0]! - wick(i)[0], st.position[1]! - wick(i)[1], st.position[2]! - wick(i)[2])).toBeLessThan(0.05 * MM);
      expect(Math.max(...st.alpha)).toBeGreaterThan(0.05);
      for (let s = 0; s < 3; s++) expect(smokeStrand(i, s, SMOKE.end, still(i), st)).toBe(false);
    }
  });

  it('is laminar low down (a straight stem) and widens and wanders higher up', () => {
    const st = newSmokeStrand();
    // After the breath: 1.6 s.
    for (let i = 0; i < CANDLE_COUNT; i++) {
      smokeStrand(i, 0, 1.6, still(i), st);
      const w = wick(i);
      // Straightness of the stem (its first 3 cm): distance of its points from the smooth curve
      // through its foot, middle and top (the column may lean in the draft and bend in the stirred
      // air, but it does not wave), against the waves above (off the chord to the stem's top).
      const pts = Array.from({ length: SMOKE_POINT_COUNT }, (_, k) => new Vector3(st.position[k * 3]!, st.position[k * 3 + 1]!, st.position[k * 3 + 2]!));
      const stemPts = pts.filter((p) => (p.y - w[1]) / MPS < 0.03);
      const a = pts[0]!, m = stemPts[Math.floor(stemPts.length / 2)]!, e = stemPts[stemPts.length - 1]!;
      const bend = (p: Vector3) => {
        // Lagrange in height through a, m, e.
        const la = ((p.y - m.y) * (p.y - e.y)) / ((a.y - m.y) * (a.y - e.y)), lm = ((p.y - a.y) * (p.y - e.y)) / ((m.y - a.y) * (m.y - e.y)), le = ((p.y - a.y) * (p.y - m.y)) / ((e.y - a.y) * (e.y - m.y));
        return Math.hypot(p.x - (la * a.x + lm * m.x + le * e.x), p.z - (la * a.z + lm * m.z + le * e.z)) / MPS;
      };
      const off = (p: Vector3) => p.clone().sub(a).cross(e.clone().sub(a).normalize()).length() / MPS;
      const stem = Math.max(...stemPts.map(bend));
      const highPts = pts.filter((p) => (p.y - w[1]) / MPS > 0.08 && (p.y - w[1]) / MPS < 0.2);
      const wave = Math.max(...highPts.map(off));
      expect(stem).toBeLessThan(0.001);
      expect(wave).toBeGreaterThan(0.005);
      const wLow = Math.min(...st.width.slice(0, 3)), wHigh = Math.max(...st.width);
      expect(wHigh).toBeGreaterThan(2 * wLow);
    }
  });

  it('is deterministic per candle and differs between candles', () => {
    const a = newSmokeStrand(), b = newSmokeStrand();
    smokeStrand(2, 1, 0.9, still(2), a);
    smokeStrand(2, 1, 0.9, still(2), b);
    expect(Array.from(a.position)).toEqual(Array.from(b.position));
    smokeStrand(3, 1, 0.9, still(2), b);
    expect(Array.from(a.position)).not.toEqual(Array.from(b.position));
  });

  it('hands over from the flame: dense, pale smoke at the wick from the first frame the flame is gone, no puff and no jump', () => {
    const st = newSmokeStrand(), st2 = newSmokeStrand();
    // The three strands share the stem low down: their opacities composite.
    const stem = (i: number, t: number, w: [number, number, number]) => {
      let clear = 1;
      for (let s = 0; s < SMOKE_STRAND_COUNT; s++) { smokeStrand(i, s, t, still(i), st); clear *= 1 - alphaNear(st, w, 3 * MM); }
      return 1 - clear;
    };
    for (let i = 0; i < CANDLE_COUNT; i++) {
      const b = BREATH_AT[i]!, w = wick(i), out = extinguishedAt(i);
      // The first frame after the last of the flame has gone: the stem is already dense at the wick.
      expect(stem(i, out + 1 / 60, w)).toBeGreaterThan(0.65);
      // While the flame still burns, lifted off, the thread already leaves the bared wick (the
      // flame's last gas becomes the first smoke: one continuous column, no gap to fill).
      expect(stem(i, b.lift + 0.5 * (out - b.lift), w)).toBeGreaterThan(0.5);
      // Continuous in time: between 1 ms frames no drawn point of the thread moves more than 2 mm.
      for (let t = b.lift + 0.002; t < b.lift + 0.6; t += 0.001) {
        smokeStrand(i, 0, t, still(i), st);
        smokeStrand(i, 0, t + 0.001, still(i), st2);
        for (let k = 1; k < SMOKE_POINT_COUNT; k++) {
          if (st.alpha[k]! < 0.02) continue;
          const d = Math.hypot(st.position[k * 3]! - st2.position[k * 3]!, st.position[k * 3 + 1]! - st2.position[k * 3 + 1]!, st.position[k * 3 + 2]! - st2.position[k * 3 + 2]!);
          expect(d).toBeLessThan(2 * MM);
        }
      }
    }
  });

  it('smoulders 3–5 s: a thin thread that fades, weaker each second, from a wick that keeps smoking', () => {
    const st = newSmokeStrand();
    for (let i = 0; i < CANDLE_COUNT; i++) {
      const bare = smokeSource(i).bare, w = wick(i);
      const at = (a: number) => { smokeStrand(i, 0, bare + a, still(i), st); return alphaNear(st, w, 10 * MM); };
      const early = at(0.3), three = at(3), four = at(4.2);
      expect(three).toBeGreaterThan(0.08);
      expect(four).toBeGreaterThan(0.03);
      expect(three).toBeLessThan(0.5 * early);
      expect(four).toBeLessThan(three);
      expect(at(5.2)).toBeLessThan(0.05);
      expect(smokeRate(i, bare + SMOKE.stop)).toBe(0);
    }
  });

  it('no two plumes alike: each turns from a straight stem to waves at its own height', () => {
    // The height (cm) where each plume first wavers 3 mm off its stem's line, at three moments.
    for (const t of [1.2, 2.4, 3.5]) {
      const heights = Array.from({ length: CANDLE_COUNT }, (_, i) => {
        const st = newSmokeStrand(), w = wick(i);
        smokeStrand(i, 0, t, still(i), st);
        const p = (k: number) => new Vector3(st.position[k * 3]! - w[0], st.position[k * 3 + 1]! - w[1], st.position[k * 3 + 2]! - w[2]);
        let ref = 0;
        for (let k = 0; k < SMOKE_POINT_COUNT; k++) if (p(k).y / MPS < 0.02) ref = k;
        const axis = p(ref).normalize();
        for (let k = 0; k < SMOKE_POINT_COUNT; k++) {
          const v = p(k);
          if (st.alpha[k]! > 0.005 && v.clone().sub(axis.clone().multiplyScalar(v.dot(axis))).length() / MPS > 0.003) return (100 * v.y) / MPS;
        }
        return Infinity;
      });
      expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(1.5);
      expect(Math.min(...heights)).toBeGreaterThan(3);
    }
  });

  it('the snuff: each candle leaves a brief, weaker wisp; the ember barely glows', () => {
    const st = newSmokeStrand(), sb = newSmokeStrand();
    for (let i = 0; i < CANDLE_COUNT; i++) {
      const src = smokeSource(i, 'snuff'), w = wick(i);
      expect(src.bare).toBeGreaterThan(SNUFF.start + SNUFF.stagger * i);
      expect(src.bare).toBeLessThan(SNUFF.start + SNUFF.stagger * i + SNUFF.length);
      expect(smokeStrand(i, 0, src.bare - 0.001, still(i), st, 'snuff')).toBe(false);
      expect(smokeStrand(i, 0, src.bare + 0.3, still(i), st, 'snuff')).toBe(true);
      const snuff = alphaNear(st, w, 10 * MM);
      smokeStrand(i, 0, smokeSource(i).bare + 0.3, still(i), sb, 'breath');
      expect(snuff).toBeGreaterThan(0.05);
      expect(snuff).toBeLessThan(alphaNear(sb, w, 10 * MM));
      expect(emberAt(i, src.bare + EMBER.flare, 'snuff')).toBeLessThan(emberAt(i, smokeSource(i).bare + EMBER.flare, 'breath'));
      for (let s = 0; s < SMOKE_STRAND_COUNT; s++) expect(smokeStrand(i, s, SMOKE.end, still(i), st, 'snuff')).toBe(false);
    }
  });

  it('the snuff\'s wisp is brief: well under half a blown wick\'s vapour, and over within 3 s', () => {
    const total = (i: number, kind: 'breath' | 'snuff', until: number) => {
      let v = 0;
      for (let t = 0; t < until; t += 0.002) v += smokeRate(i, t, kind) * 0.002;
      return v;
    };
    for (let i = 0; i < CANDLE_COUNT; i++) {
      expect(total(i, 'snuff', SMOKE.end)).toBeLessThan(0.45 * total(i, 'breath', SMOKE.end));
      // 90 % of it is out within 3 s of the snuff.
      const bare = smokeSource(i, 'snuff').bare;
      expect(total(i, 'snuff', bare + 3)).toBeGreaterThan(0.9 * total(i, 'snuff', SMOKE.end));
    }
  });

  it('the smoke is white: brighter than a white wall under the same light, faintly bluish', () => {
    const [r, g, b] = SMOKE_RADIANCE;
    expect(Math.min(r, g, b)).toBeGreaterThan(1.2);
    expect(b).toBeGreaterThanOrEqual(g);
    expect(g).toBeGreaterThanOrEqual(r);
    expect(b / r).toBeLessThan(1.1);
  });

  it('smoke born on the carried cake starts where its wick was then, and none from a wick in the bin', () => {
    const st = newSmokeStrand();
    // The cake sets off at t = 1 and moves 5 units per second along x; from 1.15 its wicks are in the bin.
    const moving: WickAt = (birth, out) => { const w = wick(0); out[0] = w[0] + 5 * Math.max(0, birth - 1); out[1] = w[1]; out[2] = w[2]; return birth > 1.15 ? -1 : birth > 1 ? 1 : 0; };
    smokeStrand(0, 0, 1.2, moving, st, 'snuff');
    // The newest parcels (born after 1.15) carry no smoke; those born on the move are strung out
    // thin along its path (1 m/s), from where the wick was when each left it.
    const still0 = newSmokeStrand();
    smokeStrand(0, 0, 1.2, still(0), still0, 'snuff');
    for (let k = 0; k < SMOKE_POINT_COUNT; k++) {
      const birth = 1.2 - st.age[k]!;
      if (birth > 1.15) expect(st.alpha[k]).toBe(0);
      else if (birth > 1.02) {
        expect(st.alpha[k]).toBeLessThan(0.3 * still0.alpha[k]! + 1e-9);
        expect(st.position[k * 3]!).toBeGreaterThan(wick(0)[0] + 5 * (birth - 1) - 0.05);
      }
    }
    expect(Math.max(...st.alpha)).toBeGreaterThan(0.01);
  });

  it('the wick glows: dim inside the flame, flaring as the flame leaves it, cooling to dark within 3 s', () => {
    for (let i = 0; i < CANDLE_COUNT; i++) {
      const b = BREATH_AT[i]!;
      expect(emberAt(i, b.lift - 0.01)).toBe(EMBER.lit);
      expect(emberAt(i, b.lift + EMBER.flare)).toBeGreaterThan(0.9);
      expect(emberAt(i, b.lift + 1)).toBeLessThan(0.5);
      expect(emberAt(i, b.lift + EMBER.end)).toBe(0);
    }
  });

  it('the breath: a round jet from the camera side, 1/d to each candle, strong enough to blow every flame out', () => {
    for (let i = 0; i < CANDLE_COUNT; i++) {
      const b = BREATH_AT[i]!;
      expect(b.peak).toBeGreaterThan(BREATH.liftOff * 1.15);
      expect(b.peak).toBeLessThanOrEqual(BREATH.peak + 1e-9);
      expect(Math.hypot(b.dirX, b.dirZ)).toBeCloseTo(1, 9);
    }
  });
});

// Contact shadows paint a canvas: a 2D-context stub is enough here (no pixels are read).
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

describe('Birthday fire: the scene\'s secondary channel', () => {
  const lib = testLibrary();
  const build = () => {
    const rig = rigBirthday(buildBirthdayGeometry({ lib }), buildDisposalBin({ lib }), lib, 'vanilla');
    return { rig, scene: new BirthdayScene(rig, { category: 'birthday', cake: 'vanilla' }) };
  };

  it('replaces each lathe flame with the volumetric flame; the hero holds the real flame', () => {
    const { rig, scene } = build();
    for (const c of rig.candles) {
      expect(c.flame.children.some((o) => (o as Mesh).isMesh && o.userData.fx)).toBe(true);
      expect(c.flame.getObjectByName(`${c.flame.name}_mesh`)).toBeUndefined();
    }
    // Hero top: the steady flame's tip (the GLB's 1.5× lathe and the fire's quads are not counted).
    const top = Math.max(...scene.heroPoints!.map((p) => p.y));
    const tallest = Math.max(...rig.candles.map((_, i) => flameScale(i)));
    expect(top).toBeCloseTo(STAND_TOP + CANDLE.seat + FLAME_REST.base + tallest * FLAME_REST.length, 3);
  });

  it('lit: settling while the flames burn (they flicker), still after settle(); the light follows the flame', () => {
    const { rig, scene } = build();
    scene.pose('guest-ready');
    expect(scene.settling()).toBe(true);
    scene.settle();
    scene.beforeRender();
    const u = rig.candles[0]!.fire.material.uniforms;
    expect(u.uShape.value[0]).toBeCloseTo(FLAME_REST.length * flameScale(0), 9);
    expect(rig.flameLights.intensity.value[0]).toBeCloseTo(CANDLE_LIGHT, 9);
    // The light sits in the flame (world space), a few millimetres above the wick.
    const wickWorld = rig.candles[0]!.fire.wickTip.clone().applyMatrix4(rig.candles[0]!.candle.matrixWorld);
    const d = rig.flameLights.pos.value[0]!.distanceTo(wickWorld);
    expect(d).toBeGreaterThan(MM);
    expect(d).toBeLessThan(6 * MM);
    // Flicker after a moment of simulation.
    for (let k = 0; k < 120; k++) scene.simulate(1 / 120);
    const lengths = new Set<number>();
    for (let k = 0; k < 12; k++) { scene.simulate(1 / 120); scene.beforeRender(); lengths.add(u.uShape.value[0]); }
    expect(lengths.size).toBeGreaterThan(5);
    scene.settle();
    scene.beforeRender();
    expect(u.uShape.value[0]).toBeCloseTo(FLAME_REST.length * flameScale(0), 9);
    scene.pose('accepted');
    expect(scene.settling()).toBe(false);
    scene.beforeRender();
    expect(rig.candles.every((c) => !c.fire.quad.visible)).toBe(true);
    expect(rig.flameLights.intensity.value.every((v) => v === 0)).toBe(true);
  });

  it('accept: the smoke outlives the 1.4 s sequence on the live clock, then the loop may idle; settle() clears it', () => {
    const { rig, scene } = build();
    scene.pose('guest-ready');
    scene.sample('accept', DURATIONS.accept - 1 / 120);
    // The director ends the sequence on the canonical pose: the smoke carries on from there.
    scene.pose('accepted');
    expect(scene.settling()).toBe(true);
    scene.simulate(1 / 120);
    scene.beforeRender();
    expect(rig.smoke.mesh.visible).toBe(true);
    let t = DURATIONS.accept;
    while (scene.settling() && t < 10) { scene.simulate(1 / 120); t += 1 / 120; }
    expect(t).toBeCloseTo(SMOKE.end, 1);
    scene.beforeRender();
    expect(rig.smoke.mesh.visible).toBe(false);
    // Interrupted (settle) mid-smoke: none left, no frames needed.
    scene.sample('accept', DURATIONS.accept - 1 / 120);
    scene.pose('accepted');
    scene.settle();
    scene.beforeRender();
    expect(scene.settling()).toBe(false);
    expect(rig.smoke.mesh.visible).toBe(false);
    // A canonical 'accepted' reached any other way (reduced motion, a late load) has no smoke.
    scene.pose('accepted');
    expect(scene.settling()).toBe(false);
  });

  /** The director's change of mind (visualDirector.setIntent): a 0 ms cut when the scene asks for one, else a blend. */
  const changeMind = (scene: BirthdayScene, to: 'accept' | 'decline'): boolean => {
    const cut = scene.interruptCut();
    scene.settle();
    scene.pose('guest-ready');
    if (cut) scene.sample(to, 0);
    return cut;
  };
  const smokeArray = (rig: ReturnType<typeof build>['rig']) => Array.from(rig.smoke.mesh.geometry.getAttribute('position').array as Float32Array);
  const alphaSum = (rig: ReturnType<typeof build>['rig']) => (rig.smoke.mesh.geometry.getAttribute('aAlpha').array as Float32Array).reduce((a, b) => a + b, 0);
  const shortens = (rig: ReturnType<typeof build>['rig']) => rig.candles.map((c) => c.fire.shorten);
  /** Radiant output drawn per candle (a hidden quad draws none; its uniforms are left as they were). */
  const intensities = (rig: ReturnType<typeof build>['rig']) => rig.candles.map((c) => (c.fire.quad.visible ? (c.fire.material.uniforms.uState.value[2] as number) : 0));

  it('a change of mind after the blow: the blown-out candles stay out, the smoke rises on, the melt is kept', () => {
    const { rig, scene } = build();
    scene.pose('guest-ready');
    // The guest watched the candles burn for a while (the melt formed), then accepted and blew.
    for (let k = 0; k < 8 * 120; k++) scene.simulate(1 / 120);
    scene.sample('accept', 0);
    scene.sample('accept', 0.8);
    scene.beforeRender();
    const before = { smoke: smokeArray(rig), shorten: shortens(rig), out: intensities(rig) };
    expect(before.out.every((v) => v === 0)).toBe(true);
    expect(rig.smoke.mesh.visible).toBe(true);
    // Decline: a cut that carries the fire across; the very next frame is the same frame.
    expect(changeMind(scene, 'decline')).toBe(true);
    scene.beforeRender();
    expect(intensities(rig).every((v) => v === 0)).toBe(true);
    expect(rig.smoke.mesh.visible).toBe(true);
    expect(smokeArray(rig)).toEqual(before.smoke);
    expect(shortens(rig)).toEqual(before.shorten);
    expect(before.shorten.every((v) => v > 0)).toBe(true);
    // Through the whole decline: never relit; the smoke keeps rising on the breath's clock and
    // stops coming from the wicks once they are in the bin; the melt never pops back.
    for (let t = 0; t <= DURATIONS.decline; t += 1 / 60) {
      scene.sample('decline', t);
      scene.beforeRender();
      expect(intensities(rig).every((v) => v === 0)).toBe(true);
      shortens(rig).forEach((v, i) => expect(v).toBeGreaterThanOrEqual(before.shorten[i]! - 1e-12));
    }
    scene.sample('decline', 0.3);
    scene.beforeRender();
    expect(rig.smoke.mesh.visible).toBe(true);
    // The director ends it on 'declined': the tail carries the smoke on to its end on the live clock.
    scene.sample('decline', DURATIONS.decline - 1 / 120);
    scene.pose('declined');
    expect(scene.settling()).toBe(true);
    let t = 0.8 + DURATIONS.decline;
    while (scene.settling() && t < 12) { scene.simulate(1 / 120); t += 1 / 120; }
    expect(t).toBeCloseTo(SMOKE.end, 1);
  });

  it('a change of mind after the snuff: the snuffed candles stay out through the accept, their wisps rise on', () => {
    const { rig, scene } = build();
    scene.pose('guest-ready');
    scene.sample('decline', 0);
    scene.sample('decline', 0.15);
    scene.beforeRender();
    const at = intensities(rig);
    const smoke = smokeArray(rig);
    expect(changeMind(scene, 'accept')).toBe(true);
    // The same frame across the cut: the wisps go on from exactly where they were.
    scene.beforeRender();
    expect(smokeArray(rig)).toEqual(smoke);
    for (let t = 0; t <= DURATIONS.accept; t += 1 / 60) {
      scene.sample('accept', t);
      scene.beforeRender();
      intensities(rig).forEach((v, i) => expect(v).toBeLessThanOrEqual(at[i]! + 1e-9));
    }
    scene.sample('accept', 0.3);
    scene.beforeRender();
    expect(intensities(rig).every((v) => v === 0)).toBe(true);
    expect(rig.smoke.mesh.visible).toBe(true);
    expect(alphaSum(rig)).toBeGreaterThan(0);
  });

  it('a change of mind from the canonical blown-out cake keeps it out; before the breath the lit cake blends as before', () => {
    const { rig, scene } = build();
    // A returning guest's accepted cake (no smoke), then decline: no relight, no smoke.
    scene.pose('accepted');
    scene.settle();
    expect(changeMind(scene, 'decline')).toBe(true);
    for (const t of [0, 0.1, 0.2]) {
      scene.sample('decline', t);
      scene.beforeRender();
      expect(intensities(rig).every((v) => v === 0)).toBe(true);
      expect(rig.smoke.mesh.visible).toBe(false);
    }
    // Before the breath has reached anything: the usual blend, the flames burning.
    scene.pose('guest-ready');
    scene.sample('accept', 0);
    scene.sample('accept', 0.03);
    expect(changeMind(scene, 'decline')).toBe(false);
  });

  it('a change of mind from the decline once the cake has lifted: the rewind brings it back with its candles out and its smoke rising on', () => {
    const { rig, scene } = build();
    scene.pose('guest-ready');
    scene.sample('decline', 0);
    const at = CARRY_FROM + 0.3;
    scene.sample('decline', at);
    scene.beforeRender();
    const before = { smoke: smokeArray(rig), shorten: shortens(rig) };
    expect(rig.smoke.mesh.visible).toBe(true);
    expect(changeMind(scene, 'accept')).toBe(true);
    scene.beforeRender();
    // The same frame across the cut (the rewind starts from it), smoke and melt included.
    expect(smokeArray(rig)).toEqual(before.smoke);
    expect(shortens(rig)).toEqual(before.shorten);
    for (let t = 0; t <= DURATIONS.accept; t += 1 / 60) {
      scene.sample('accept', t);
      scene.beforeRender();
      expect(intensities(rig).every((v) => v === 0)).toBe(true);
      shortens(rig).forEach((v, i) => expect(v).toBeGreaterThanOrEqual(before.shorten[i]! - 1e-12));
    }
    // And one reversal later (accept after the blow → decline → back once the cake has lifted).
    const second = build();
    second.scene.pose('guest-ready');
    second.scene.sample('accept', 0);
    second.scene.sample('accept', 0.8);
    expect(changeMind(second.scene, 'decline')).toBe(true);
    second.scene.sample('decline', 0.5);
    second.scene.beforeRender();
    const smoke = smokeArray(second.rig);
    expect(changeMind(second.scene, 'accept')).toBe(true);
    second.scene.beforeRender();
    expect(smokeArray(second.rig)).toEqual(smoke);
    for (let t = 0; t <= DURATIONS.accept; t += 1 / 30) {
      second.scene.sample('accept', t);
      second.scene.beforeRender();
      expect(intensities(second.rig).every((v) => v === 0)).toBe(true);
    }
  });

  it('decline snuffs each flame into a brief wisp of smoke', () => {
    const { rig, scene } = build();
    scene.pose('guest-ready');
    scene.sample('decline', 0);
    scene.beforeRender();
    expect(rig.smoke.mesh.visible).toBe(false);
    scene.sample('decline', 0.2);
    scene.beforeRender();
    expect(rig.smoke.mesh.visible).toBe(true);
    expect(intensities(rig).every((v) => v === 0)).toBe(true);
  });

  it('the wick\'s life: fresh white cotton before it is lit, charred once lit, ember then a grey ash tip after the breath', () => {
    expect(wickChar(0)).toBe(0);
    expect(wickChar(0.12)).toBe(1);
    for (let i = 0; i < CANDLE_COUNT; i++) {
      const b = BREATH_AT[i]!;
      expect(ashAt(i, b.lift + 0.25)).toBe(0);
      expect(ashAt(i, b.lift + 2)).toBe(1);
      let prev = 0;
      for (let t = b.lift; t < b.lift + 2.2; t += 0.01) { const a = ashAt(i, t); expect(a).toBeGreaterThanOrEqual(prev); prev = a; }
    }
    const { rig, scene } = build();
    const w = rig.candles[3]!.fire.wick;
    scene.pose('host-ready');
    scene.beforeRender();
    expect(w.char.value).toBe(0);
    expect(w.ash.value).toBe(0);
    scene.pose('guest-ready');
    scene.beforeRender();
    expect(w.char.value).toBe(1);
    expect(w.ash.value).toBe(0);
    // The breath: the bared wick's ember flares (bright orange: red saturated, green part way, no
    // salmon wash), then greys to ash on the live clock.
    scene.sample('accept', BREATH_AT[3]!.lift + 0.05);
    scene.beforeRender();
    const e = w.ember.value;
    expect(e.r).toBeGreaterThan(0.9);
    expect(e.g / e.r).toBeGreaterThan(0.2);
    expect(e.g / e.r).toBeLessThan(0.75);
    expect(e.b / e.r).toBeLessThan(0.1);
    expect(w.ash.value).toBe(0);
    scene.sample('accept', DURATIONS.accept - 1 / 120);
    scene.pose('accepted');
    for (let k = 0; k < 120; k++) scene.simulate(1 / 120);
    scene.beforeRender();
    expect(w.ash.value).toBeGreaterThan(0.5);
    expect(w.ember.value.r).toBeLessThan(0.5);
    // The canonical blown-out cake (posters, reduced motion): charred, ash-tipped, cold.
    scene.settle();
    scene.pose('accepted');
    scene.beforeRender();
    expect([w.char.value, w.ash.value, w.ember.value.r]).toEqual([1, 1, 0]);
  });

  it('the smoke is drawn from the wick it belongs to', () => {
    const { rig, scene } = build();
    scene.pose('guest-ready');
    const b = BREATH_AT[0]!;
    scene.sample('accept', b.lift + 0.05);
    scene.beforeRender();
    const pos = rig.smoke.mesh.geometry.getAttribute('position');
    const c = rig.candles[0]!;
    // The wick tip as the candle stands: leaned by its hand placement, burnt down by the melt; the
    // smoke rises in the room (birthday_root), not on the cake.
    expect(c.candle.quaternion.angleTo(new Quaternion())).toBeGreaterThan(0);
    expect(rig.smoke.mesh.parent).toBe(rig.root);
    rig.root.updateMatrixWorld(true);
    const tipOf = (k: number) => {
      const ck = rig.candles[k]!;
      const tip = ck.fire.wickTip.clone().addScaledVector(ck.fire.curlTip, ck.fire.wick.char.value);
      return tip.setY(tip.y - ck.fire.shorten).applyMatrix4(ck.candle.matrixWorld).applyMatrix4(rig.root.matrixWorld.clone().invert());
    };
    // The charred braid curls its tip over by about a millimetre: the smoke leaves from there.
    expect(c.fire.curlTip.length() / MM).toBeGreaterThan(0.8);
    expect(c.fire.curlTip.length() / MM).toBeLessThan(1.2);
    expect(new Vector3(pos.getX(0), pos.getY(0), pos.getZ(0)).distanceTo(tipOf(0))).toBeLessThan(0.05 * MM);
    // On the cake carried to the bin (lifted, leaning): every candle's newest parcel is at its wick.
    scene.sample('decline', 0);
    scene.sample('decline', 0.5);
    scene.beforeRender();
    rig.root.updateMatrixWorld(true);
    expect(rig.nodes.cake_authored!.position.distanceTo(ON_STAND)).toBeGreaterThan(0.1);
    for (let k = 0; k < rig.candles.length; k++) {
      const v = (k * SMOKE_STRAND_COUNT * SMOKE_POINT_COUNT) * 2;
      expect(new Vector3(pos.getX(v), pos.getY(v), pos.getZ(v)).distanceTo(tipOf(k))).toBeLessThan(0.05 * MM);
    }
    // The braids curl each their own way.
    const dirs = rig.candles.map((ck) => Math.atan2(ck.fire.curlTip.z, ck.fire.curlTip.x));
    expect(Math.max(...dirs) - Math.min(...dirs)).toBeGreaterThan(0.8);
  });

  it('the melt burns the top down and the flame, its ember and its light follow the wick', () => {
    const { rig, scene } = build();
    scene.pose('guest-ready');
    scene.settle();
    scene.beforeRender();
    const c = rig.candles[2]!;
    const u = c.fire.material.uniforms;
    const toWorld = (v: Vector3) => v.clone().applyMatrix4(c.flame.matrixWorld);
    c.flame.updateWorldMatrix(true, false);
    const base0 = toWorld(u.uBase.value), wick0 = toWorld(u.uWick.value), s0 = c.fire.shorten;
    // A long look at the lit cake: the candles burn on (simulate), the tops go down by a hair.
    for (let k = 0; k < 30 * 120; k++) scene.simulate(1 / 120);
    scene.beforeRender();
    c.flame.updateWorldMatrix(true, false);
    const ds = c.fire.shorten - s0;
    expect(ds).toBeGreaterThan(0.2 * MM);
    expect(c.fire.shorten).toBeLessThanOrEqual(0.8 * MM + 1e-9);
    // World down by the same amount (the candle's lean is ≤ 2°: cos ≈ 1).
    expect(base0.y - toWorld(u.uBase.value).y).toBeCloseTo(ds, 4);
    expect(wick0.y - toWorld(u.uWick.value).y).toBeCloseTo(ds, 4);
    expect(rig.flameLights.pos.value[2]!.y).toBeLessThan(base0.y + FLAME_REST.length);
    // The flame stands along world up although its candle leans (the node undoes the lean).
    const axisWorld = u.uAxisY.value.clone().transformDirection(c.flame.matrixWorld);
    expect(axisWorld.y).toBeGreaterThan(Math.cos((3.5 * Math.PI) / 180));
  });
});
