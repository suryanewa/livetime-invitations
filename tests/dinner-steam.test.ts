import { describe, expect, it } from 'vitest';
import { Color, Euler, Group, Matrix4, MeshStandardMaterial, Vector3 } from 'three';
import { COVER, COVER_PROFILE, dinnerBounds, plateTop } from '../models/dinnerContract.ts';
import type { DinnerRig } from '../models/dinner.ts';
import { buildDisposalBin } from '../models/disposalBin.ts';
import { VisualDirector } from '../src/core/visualDirector.ts';
import { DIRECTIONS, type MaterialLibrary } from '../src/render/materials.ts';
import { DinnerScene } from '../src/scenes/dinner/index.ts';
import { ACCEPT, DURATIONS, newFrame, REVEAL_DIR, sampleSequence } from '../src/scenes/dinner/sequences.ts';
import {
  buildPlumes, buildPuffs, newPuffState, PLUME, plumeCenter, plumeDensity, PUFF_COUNTS, PUFF_KINDS, puffAt, riseAt, STEAM_CHANGE_FADE, STEAM_END, STEAM_REST,
  steamPlumes, steamPuffs,
} from '../src/scenes/dinner/steam.ts';

/**
 * Dinner v1.5: the steam released by the reveal (Surya: "steam under the cloche after unveiling
 * it"). The plan is checked against the reveal's choreography and the physics it claims; the
 * scene's steam clock is driven through the real VisualDirector, stepping `simulate` the way the
 * controller's fixed stepper does.
 */

const SU_CM = 16.875; // one Dinner scene unit (DINNER_WORLD_SCALE × 20 cm)

/** The dome's outer radius at height y (cover space). */
function domeRadius(y: number): number {
  for (let i = 1; i < COVER_PROFILE.length; i++) {
    const [r1, y1] = COVER_PROFILE[i]!;
    if (y <= y1) {
      const [r0, y0] = COVER_PROFILE[i - 1]!;
      return y1 > y0 ? r0 + ((r1 - r0) * (y - y0)) / (y1 - y0) : r1;
    }
  }
  return 0;
}
/** Is the scene-space point inside the dome as the accept poses it at t? */
function insideDome(p: Vector3, t: number): boolean {
  const f = sampleSequence('accept', t, newFrame());
  const q = p.clone().applyMatrix4(new Matrix4().makeRotationFromEuler(new Euler(f.coverTiltX, 0, f.coverTilt)).setPosition(f.coverPos).invert());
  return q.y >= 0 && q.y <= COVER_PROFILE[COVER_PROFILE.length - 1]![1] && Math.hypot(q.x, q.z) <= domeRadius(q.y);
}

describe('Dinner steam plan (v1.5)', () => {
  it('is one deterministic plan: the same puffs and plumes every build, all finite', () => {
    expect(buildPuffs()).toEqual(steamPuffs());
    expect(buildPlumes()).toEqual(steamPlumes());
    for (const k of PUFF_KINDS) expect(steamPuffs().filter((p) => p.kind === k)).toHaveLength(PUFF_COUNTS[k]);
    for (const p of steamPuffs()) {
      for (const v of [p.t0, p.life, p.rise, p.size, p.grow, p.peak, ...p.pos.toArray(), ...p.vel.toArray()]) expect(Number.isFinite(v)).toBe(true);
      expect(p.t0).toBeGreaterThanOrEqual(0);
    }
  });

  it('spills first from under the raised (guest) side, while the far rim is still on the plate', () => {
    const first = [...steamPuffs()].sort((a, b) => a.t0 - b.t0);
    // Everything before lift-off clears the plate (≈ 0.2 s) is the spill.
    for (const p of first.filter((p) => p.t0 < 0.2)) expect(p.kind).toBe('spill');
    expect(first[0]!.t0).toBeLessThan(ACCEPT.tipPeak);
    // The far rim (+REVEAL_DIR) is the pivot then: still on the plate when the spill begins.
    const f = sampleSequence('accept', first[0]!.t0, newFrame());
    const far = new Vector3(REVEAL_DIR.x * COVER.lipRadius, 0, REVEAL_DIR.z * COVER.lipRadius).applyEuler(new Euler(f.coverTiltX, 0, f.coverTilt)).add(f.coverPos);
    expect(far.y - plateTop(Math.hypot(far.x, far.z))).toBeLessThan(0.002);
    // Spread round the raised side (its gap is widest there): all within 75°, mean within 30°.
    const spill = steamPuffs().filter((p) => p.kind === 'spill');
    let mx = 0, mz = 0;
    for (const p of spill) {
      const cos = -(p.out.x * REVEAL_DIR.x + p.out.z * REVEAL_DIR.z);
      expect(cos).toBeGreaterThan(Math.cos((75 * Math.PI) / 180));
      mx += p.out.x;
      mz += p.out.z;
    }
    expect(-(mx * REVEAL_DIR.x + mz * REVEAL_DIR.z) / Math.hypot(mx, mz)).toBeGreaterThan(Math.cos(Math.PI / 6));
  });

  it('the pocket is the air the dome held: born inside it as it is carried off, never earlier', () => {
    for (const p of steamPuffs().filter((p) => p.kind === 'pocket')) {
      expect(p.t0).toBeGreaterThanOrEqual(0.3);
      expect(p.t0).toBeLessThanOrEqual(0.55);
      expect(insideDome(p.pos, p.t0)).toBe(true);
    }
  });

  it('the dome sheds a trail from its trailing (guest) rim as it travels, and squeezes a puff out as it lands', () => {
    for (const p of steamPuffs().filter((q) => q.kind === 'trail')) {
      expect(p.t0).toBeGreaterThan(ACCEPT.liftFrom);
      expect(p.t0).toBeLessThan(ACCEPT.touch);
      // On the side away from the dome's travel (the guest side, towards the camera).
      expect(-(p.out.x * REVEAL_DIR.x + p.out.z * REVEAL_DIR.z)).toBeGreaterThan(0.3);
    }
    const rest = sampleSequence('accept', ACCEPT.flat, newFrame()).coverPos;
    for (const p of steamPuffs().filter((q) => q.kind === 'landing')) {
      // As the trailing side comes down (touch → flat), at the rim of the landed dome, low.
      expect(p.t0).toBeGreaterThan(ACCEPT.touch - 0.02);
      expect(p.t0).toBeLessThan(ACCEPT.flat + 0.02);
      expect(Math.hypot(p.pos.x - rest.x, p.pos.z - rest.z)).toBeGreaterThan(COVER.radius);
      expect(p.pos.y).toBeLessThan(0.05);
    }
  });

  it('no puff is born in or sinks into the plate or the table', () => {
    const s = newPuffState();
    for (const p of steamPuffs()) {
      for (let tau = p.t0; tau <= p.t0 + p.life; tau += 0.01) {
        const c = puffAt(p, tau, s)!.center;
        const r = Math.hypot(c.x, c.z);
        expect(c.y, `${p.kind} t0 ${p.t0.toFixed(3)} at ${tau.toFixed(2)}`).toBeGreaterThan(r < 0.8 ? plateTop(r) : 0);
      }
    }
    for (const p of steamPlumes()) expect(p.base.y).toBeCloseTo(plateTop(Math.hypot(p.base.x, p.base.z)), 6);
  });

  it('rises like the warm air off a hot dish: at most 30 cm/s, decelerating as it mixes in; the column at 15–22 cm/s', () => {
    const a = newPuffState(), b = newPuffState();
    let vmax = 0;
    for (const p of steamPuffs()) {
      for (let t = p.t0 + 0.1; t < p.t0 + p.life - 0.01; t += 0.01) vmax = Math.max(vmax, (puffAt(p, t + 0.01, b)!.center.y - puffAt(p, t, a)!.center.y) / 0.01);
    }
    expect(vmax * SU_CM).toBeLessThan(30);
    // The buoyant rise peaks early and slows as it entrains room air.
    const w = (t: number) => (riseAt(1, t + 0.005) - riseAt(1, t - 0.005)) / 0.01;
    expect(w(1.0)).toBeLessThan(w(0.4));
    for (const p of steamPlumes()) {
      expect(p.rise * SU_CM).toBeGreaterThanOrEqual(15);
      expect(p.rise * SU_CM).toBeLessThanOrEqual(22);
    }
  });

  it('the column grows up off the plate, shows for 1–2 s after the reveal, thins and is gone by STEAM_END', () => {
    const maxDensity = (tau: number, h0 = 0, h1: number = PLUME.length) => {
      let m = 0;
      for (const p of steamPlumes()) for (let h = h0; h <= h1; h += 0.02) m = Math.max(m, plumeDensity(p, h, tau));
      return m;
    };
    // Visible above the plate's far rim (h ≳ 0.3 su from the camera) through the second after the
    // reveal, thinning, and below 1 % everywhere (invisible over the cove) by STEAM_END.
    expect(maxDensity(1.2, 0.3, 0.9)).toBeGreaterThan(0.12);
    expect(maxDensity(1.8, 0.3, 0.9)).toBeGreaterThan(0.03);
    expect(maxDensity(1.8)).toBeLessThan(maxDensity(1.2));
    expect(maxDensity(STEAM_END)).toBeLessThanOrEqual(0.0101);
    for (const p of steamPuffs()) expect(p.t0 + p.life).toBeLessThanOrEqual(STEAM_END);
    expect(STEAM_END).toBeGreaterThan(DURATIONS.accept + 1);
    expect(STEAM_END).toBeLessThan(DURATIONS.accept + 2.5);
    // It grows up off the plate at its rise speed (nothing above the front), and once the source
    // has peaked the base only thins.
    for (const p of steamPlumes()) {
      const tau = p.t0 + 0.4;
      expect(plumeDensity(p, 0.5 * p.rise * 0.4, tau)).toBeGreaterThan(0);
      expect(plumeDensity(p, p.rise * 0.4 + 0.01, tau)).toBe(0);
      for (let t = p.t0 + PLUME.ramp; t < STEAM_END; t += 0.05) expect(plumeDensity(p, 0, t + 0.05)).toBeLessThanOrEqual(plumeDensity(p, 0, t));
    }
    // The centreline starts on the plate and, wherever the sheet shows (density ≥ 1 %), meander
    // and wake lean together never slope it past 45° (it shears with the path; steeper would
    // smear it sideways).
    const c = new Vector3(), d = new Vector3();
    for (const q of steamPlumes()) {
      expect(plumeCenter(q, 0, 1, c).distanceTo(q.base)).toBeLessThan(1e-9);
      for (let tau = 0.4; tau <= 2.5; tau += 0.1) {
        for (let h = 0; h < PLUME.length; h += 0.02) {
          if (plumeDensity(q, h, tau) < 0.01) continue;
          plumeCenter(q, h, tau, c);
          plumeCenter(q, h + 0.02, tau, d);
          expect(Math.hypot(d.x - c.x, d.z - c.z) / 0.02).toBeLessThan(1);
        }
      }
    }
  });
});

// ── The scene's steam clock, through the director ───────────────────────────────
function plainLibrary(): MaterialLibrary {
  const direction = DIRECTIONS.L2;
  const cache = new Map<string, MeshStandardMaterial>();
  const make = (n: string) => new MeshStandardMaterial({ name: n, color: new Color(direction.surfaces[n]?.color ?? '#888888') });
  return { direction, get: (n: string) => cache.get(n) ?? (cache.set(n, make(n)), cache.get(n)!), unique: make, dispose() {} } as unknown as MaterialLibrary;
}

function stage() {
  const bin = buildDisposalBin({ lib: plainLibrary() });
  const plate = new Group(); plate.name = 'plate_authored';
  const cover = new Group(); cover.name = 'cover_authored';
  const root = new Group().add(plate, cover, bin);
  const stub = { setFootprint() {}, setHeight() {}, visible: false };
  const rig = {
    root, nodes: { plate_authored: plate, cover_authored: cover, bin_root: bin }, shadows: [], dishShadow: stub, coverShadow: stub,
    flapL: bin.getObjectByName('bin_flap_l')!, flapR: bin.getObjectByName('bin_flap_r')!, bounds: dinnerBounds(), setPreset() {}, dispose() {},
  } as unknown as DinnerRig;
  const scene = new DinnerScene(rig, { category: 'dinner', dish: 'pasta' });
  const director = new VisualDirector({ complete() {} }, 'guest', null);
  director.attach(scene);
  let now = 0;
  /** Frames of the controller's loop: the director, then simulate in 1/120 s steps. */
  const run = (seconds: number, each?: (t: number) => void) => {
    const end = now + seconds;
    while (now < end - 1e-9) {
      now += 1 / 60;
      const playing = director.update(now);
      scene.simulate(1 / 120);
      scene.simulate(1 / 120);
      each?.(now);
      if (!playing && !scene.settling() && !each) break;
    }
  };
  director.update(0);
  return { scene, director, run, get now() { return now; } };
}

describe('Dinner steam on stage (v1.5)', () => {
  it('the reveal releases it on its own clock, it rises on after the reveal and ends clear; the loop then idles', () => {
    const s = stage();
    expect(s.scene.steamState.visible).toBe(false);
    s.director.setIntent('accept');
    const start = s.now;
    let firstSeen = -1;
    s.run(DURATIONS.accept - 0.05, (t) => {
      const st = s.scene.steamState;
      if (st.visible && firstSeen < 0) firstSeen = t - start;
      // Driven by the reveal's samples: the steam clock is the accept's time.
      if (st.tau !== null) expect(st.tau).toBeCloseTo(t - start, 6);
    });
    expect(firstSeen).toBeGreaterThanOrEqual(0);
    expect(firstSeen).toBeLessThan(0.05);
    // The director ends the reveal (accepted pose); the steam carries on through simulate.
    s.run(0.2);
    expect(s.director.state).toBe('accepted-pose');
    expect(s.scene.settling()).toBe(true);
    expect(s.scene.steamState.visible).toBe(true);
    const mid = s.scene.steamState.tau!;
    expect(mid).toBeGreaterThan(DURATIONS.accept);
    // Until it has gone: then nothing shows and the scene no longer asks for frames.
    let frames = 0;
    s.run(STEAM_END, () => { if (s.scene.settling()) frames++; });
    expect(s.scene.settling()).toBe(false);
    expect(s.scene.steamState.visible).toBe(false);
    expect(frames / 60).toBeCloseTo(STEAM_END - mid, 1);
  });

  it('decline and covering never show steam (the cloche stays on)', () => {
    const s = stage();
    s.director.setIntent('decline');
    s.run(DURATIONS.decline + 0.5, () => expect(s.scene.steamState.visible).toBe(false));
    const h = stage();
    h.director.setMode('host');
    h.director.prepareHost();
    h.run(DURATIONS.host + 0.5, () => expect(h.scene.steamState.visible).toBe(false));
  });

  it('reduced motion and a saved accept show the canonical still; settle() snaps live steam to it', () => {
    const s = stage();
    s.director.setReducedMotion(true);
    s.director.setIntent('accept');
    s.run(0.5);
    expect(s.scene.steamState.tau).toBe(STEAM_REST?.tau ?? null);
    expect(s.scene.settling()).toBe(false);
    const live = stage();
    live.director.setIntent('accept');
    live.run(DURATIONS.accept + 0.3);
    expect(live.scene.settling()).toBe(true);
    live.scene.settle();
    expect(live.scene.settling()).toBe(false);
    expect(live.scene.steamState.tau).toBe(STEAM_REST?.tau ?? null);
  });

  it('a replay starts the steam from the beginning (nothing accumulates)', () => {
    const s = stage();
    s.director.setIntent('accept');
    s.run(DURATIONS.accept + 0.6);
    s.director.replay();
    expect(s.scene.steamState.tau).toBe(0);
    s.run(0.5);
    expect(s.scene.steamState.tau).toBeCloseTo(0.5, 6);
  });

  it('a change of mind mid-reveal lets the steam already out rise on and fade; nothing more is released', () => {
    const s = stage();
    s.director.setIntent('accept');
    s.run(0.5);
    const before = s.scene.steamState;
    s.director.setIntent('decline');
    // The cut is never seen: the same steam, on the same clock.
    const after = s.scene.steamState;
    expect(after.visible).toBe(true);
    expect(after.tau).toBe(before.tau);
    expect(after.emitEnd).toBe(before.tau);
    let prev = 1;
    s.run(STEAM_CHANGE_FADE + 0.05, () => {
      const st = s.scene.steamState;
      if (st.tau !== null) {
        expect(st.fade).toBeLessThanOrEqual(prev);
        // A steady fade over STEAM_CHANGE_FADE: no frame drops it by more than its share.
        expect(prev - st.fade).toBeLessThanOrEqual((1 / 60 / STEAM_CHANGE_FADE) * 1.001);
        prev = st.fade;
      }
    });
    expect(s.scene.steamState.visible).toBe(false);
    expect(s.scene.settling()).toBe(false);
  });
});
