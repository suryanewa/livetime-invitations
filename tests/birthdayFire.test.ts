import { afterAll, describe, expect, it, vi } from 'vitest';
import { Color, Mesh, MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import { DIRECTIONS, type MaterialLibrary } from '../src/render/materials.ts';
import { blackbodyAt, createFlameMaterial, sootRadiance } from '../src/render/flame.ts';
import { rigBirthday } from '../models/birthday.ts';
import { CANDLE_LIGHT } from '../models/birthdayFire.ts';
import { buildBirthdayGeometry } from '../models/birthdayParts.ts';
import { CANDLE, CANDLE_COUNT, CANDLE_SOCKETS, STAND_TOP } from '../models/birthdayContract.ts';
import { buildDisposalBin } from '../models/disposalBin.ts';
import { BirthdayScene } from '../src/scenes/birthday/index.ts';
import { DURATIONS } from '../src/scenes/birthday/poses.ts';
import {
  BREATH, BREATH_AT, EMBER, emberAt, extinguishedAt, FLAME_REST, flameAxis, burnRate, flameScale, flameState, flicker, FLICKER, MM, newFlicker, newSmokePuffs, newSmokeStrand, plumeRise,
  POOL_Y, PUFF_COUNT, SMOKE, SMOKE_POINT_COUNT, smokePuffs, smokeRate, smokeStrand, WICK_TIP_Y,
} from '../src/scenes/birthday/fire.ts';

/** Wick tip of candle i in cake_secondary space (seated, nominal). */
const IGNITE_START_OF = (i: number) => 0.84 + 0.02 * i;
const wick = (i: number): [number, number, number] => [CANDLE_SOCKETS[i]![0], CANDLE.seat + WICK_TIP_Y, CANDLE_SOCKETS[i]![1]];
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
      expect(burnRate(i, 1.3, 'host')).toBe(1);
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
      expect(smokeStrand(i, 0, b.lift - 0.001, wick(i), st)).toBe(false);
      // 40 ms after lift-off the thread reads at the wick tip (its newest parcel is on the wick).
      expect(smokeStrand(i, 0, b.lift + 0.04, wick(i), st)).toBe(true);
      expect(Math.hypot(st.position[0]! - wick(i)[0], st.position[1]! - wick(i)[1], st.position[2]! - wick(i)[2])).toBeLessThan(0.05 * MM);
      expect(Math.max(...st.alpha)).toBeGreaterThan(0.05);
      for (let s = 0; s < 3; s++) expect(smokeStrand(i, s, SMOKE.end, wick(i), st)).toBe(false);
    }
  });

  it('is laminar low down (a straight stem) and widens and wanders higher up', () => {
    const st = newSmokeStrand();
    // After the breath: 1.6 s.
    for (let i = 0; i < CANDLE_COUNT; i++) {
      smokeStrand(i, 0, 1.6, wick(i), st);
      const w = wick(i);
      // Straightness of the stem (its first 3 cm): distance of its points from the chord to its
      // top (the column may lean in the room's draft, but it does not wave), against the waves above.
      const pts = Array.from({ length: SMOKE_POINT_COUNT }, (_, k) => new Vector3(st.position[k * 3]!, st.position[k * 3 + 1]!, st.position[k * 3 + 2]!));
      const stemPts = pts.filter((p) => (p.y - w[1]) / MPS < 0.03);
      const chordEnd = stemPts[stemPts.length - 1]!;
      const off = (p: Vector3, a: Vector3, b: Vector3) => p.clone().sub(a).cross(b.clone().sub(a).normalize()).length() / MPS;
      const stem = Math.max(...stemPts.map((p) => off(p, pts[0]!, chordEnd)));
      const highPts = pts.filter((p) => (p.y - w[1]) / MPS > 0.08 && (p.y - w[1]) / MPS < 0.2);
      const wave = Math.max(...highPts.map((p) => off(p, pts[0]!, chordEnd)));
      expect(stem).toBeLessThan(0.001);
      expect(wave).toBeGreaterThan(4 * stem);
      const wLow = Math.min(...st.width.slice(0, 3)), wHigh = Math.max(...st.width);
      expect(wHigh).toBeGreaterThan(2 * wLow);
    }
  });

  it('is deterministic per candle and differs between candles', () => {
    const a = newSmokeStrand(), b = newSmokeStrand();
    smokeStrand(2, 1, 0.9, wick(2), a);
    smokeStrand(2, 1, 0.9, wick(2), b);
    expect(Array.from(a.position)).toEqual(Array.from(b.position));
    smokeStrand(3, 1, 0.9, wick(2), b);
    expect(Array.from(a.position)).not.toEqual(Array.from(b.position));
  });

  it('hands over from the flame: the soot puff rides the dying flame, greying in place, then drifts on without a jump', () => {
    const p = newSmokePuffs(), q = newSmokePuffs();
    const axis: [number, number, number] = [0, 0, 0];
    for (let i = 0; i < CANDLE_COUNT; i++) {
      const b = BREATH_AT[i]!;
      // Nothing before lift-off; grey grows while the flame dies.
      smokePuffs(i, b.lift, wick(i), p);
      expect(Math.max(...p.alpha)).toBe(0);
      smokePuffs(i, b.lift + 0.5 * b.out, wick(i), p);
      const mid = Math.max(...p.alpha);
      smokePuffs(i, b.lift + 0.9 * b.out, wick(i), q);
      expect(Math.max(...q.alpha)).toBeGreaterThan(mid);
      // While the flame burns, the top blob sits on the flame's own axis.
      const t = b.lift + 0.3 * b.out;
      smokePuffs(i, t, wick(i), p);
      flameAxis(flameState(i, t, 'accept'), 0.98, axis, flameScale(i));
      const k = PUFF_COUNT - 1;
      const w = wick(i);
      expect(Math.abs(p.position[k * 3 + 1]! - (w[1] + FLAME_REST.base - WICK_TIP_Y + axis[1]))).toBeLessThan(1e-6);
      // Continuous: no blob jumps more than 3 mm between 1 ms samples.
      for (let tt = b.lift; tt < b.lift + 0.6; tt += 0.001) {
        smokePuffs(i, tt, w, p);
        smokePuffs(i, tt + 0.001, w, q);
        for (let n = 0; n < PUFF_COUNT; n++) {
          const d = Math.hypot(p.position[n * 3]! - q.position[n * 3]!, p.position[n * 3 + 1]! - q.position[n * 3 + 1]!, p.position[n * 3 + 2]! - q.position[n * 3 + 2]!);
          expect(d).toBeLessThan(3 * MM);
        }
      }
      // Gone within a second.
      smokePuffs(i, b.lift + 1.5, w, p);
      expect(Math.max(...p.alpha)).toBeLessThan(0.01);
    }
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

  it('the smoke is drawn from the wick it belongs to', () => {
    const { rig, scene } = build();
    scene.pose('guest-ready');
    const b = BREATH_AT[0]!;
    scene.sample('accept', b.lift + 0.05);
    scene.beforeRender();
    const pos = rig.smoke.mesh.geometry.getAttribute('position');
    const c = rig.candles[0]!;
    // The wick tip as the candle stands: leaned by its hand placement, burnt down by the melt.
    expect(c.candle.quaternion.angleTo(new Quaternion())).toBeGreaterThan(0);
    const w = c.fire.wickTip.clone().setY(c.fire.wickTip.y - c.fire.shorten).applyQuaternion(c.candle.quaternion).add(c.candle.position);
    expect(new Vector3(pos.getX(0), pos.getY(0), pos.getZ(0)).distanceTo(w)).toBeLessThan(0.05 * MM);
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
