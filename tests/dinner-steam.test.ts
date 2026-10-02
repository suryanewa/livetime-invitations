import { describe, expect, it } from 'vitest';
import { Color, Euler, Group, Matrix4, MeshStandardMaterial, Vector3 } from 'three';
import { COVER, COVER_PROFILE, dinnerBounds, PLATE, plateTop } from '../models/dinnerContract.ts';
import type { DinnerRig } from '../models/dinner.ts';
import { buildDisposalBin } from '../models/disposalBin.ts';
import { VisualDirector } from '../src/core/visualDirector.ts';
import { DIRECTIONS, type MaterialLibrary } from '../src/render/materials.ts';
import { DinnerScene } from '../src/scenes/dinner/index.ts';
import { ACCEPT, DURATIONS, frameFor, newFrame, REVEAL_DIR, REWIND, sampleSequence } from '../src/scenes/dinner/sequences.ts';
import {
  buildPlumes, buildPuffs, domeClearance, newPuffState, PLUME, plumeCenter, plumeDensity, POCKET_CLEAR, PUFF_COUNTS, PUFF_KINDS, leftSteamEnd, plumeSource, puffAt, riseAt, STEAM_END, steamEndAfter, STEAM_GONE, STEAM_REST, stirFade,
  steamPlumes, steamPuffs, VIEW_RIGHT,
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

  it('the pocket is the air the dome held: released inside it as it is carried off, shown once the shell is clear', () => {
    const toCover = (t: number) => {
      const f = sampleSequence('accept', t, newFrame());
      return new Matrix4().makeRotationFromEuler(new Euler(f.coverTiltX, 0, f.coverTilt)).setPosition(f.coverPos).invert();
    };
    for (const p of steamPuffs().filter((q) => q.kind === 'pocket')) {
      // Released as the dome is carried off (0.30–0.50 s), shown at least POCKET_CLEAR later.
      expect(p.t0).toBeGreaterThanOrEqual(0.3 + POCKET_CLEAR);
      expect(p.t0).toBeLessThanOrEqual(0.9);
      // Where it came from: the dome, just before it shows (within its plan circle, near its height).
      const q = p.pos.clone().applyMatrix4(toCover(p.t0 - POCKET_CLEAR));
      expect(Math.hypot(q.x, q.z)).toBeLessThan(COVER.radius + 0.35);
      // When it shows: clear of the dome by 40 % of its size (no steam traces the dome's outline).
      expect(insideDome(p.pos, p.t0)).toBe(false);
      expect(domeClearance(p.pos, p.t0), `pocket t0 ${p.t0.toFixed(3)}`).toBeGreaterThan(p.size * 0.4);
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
      expect(p.pos.y).toBeLessThan(0.07);
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

  it('rises like the warm air off a hot dish: at most 30 cm/s, decelerating as it mixes in; the column at 20–25 cm/s', () => {
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
      expect(p.rise * SU_CM).toBeGreaterThanOrEqual(20);
      expect(p.rise * SU_CM).toBeLessThanOrEqual(25);
    }
  });

  it('the column is a broad sheet over the well (60–85 % of its width), not a strand', () => {
    // Across the camera's view (its horizontal is 20° off the scene's x), each sheet's half-width
    // either side of its base.
    const right = VIEW_RIGHT;
    const lo = Math.min(...steamPlumes().map((p) => p.base.dot(right) - p.width));
    const hi = Math.max(...steamPlumes().map((p) => p.base.dot(right) + p.width));
    const share = (hi - lo) / (2 * PLATE.wellRadius);
    expect(share).toBeGreaterThan(0.6);
    expect(share).toBeLessThan(0.85);
    // Side by side, overlapping: no gap between neighbouring sheets.
    const sorted = [...steamPlumes()].sort((a, b) => a.base.dot(right) - b.base.dot(right));
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i]!.base.dot(right) - sorted[i]!.width).toBeLessThan(sorted[i - 1]!.base.dot(right) + sorted[i - 1]!.width);
    }
  });

  it('the column grows up off the plate, shows strongly for 1–2 s after the reveal, then a thin tail to ≈ 4 s, gone by STEAM_END', () => {
    const maxDensity = (tau: number, h0 = 0, h1: number = PLUME.length) => {
      let m = 0;
      for (const p of steamPlumes()) for (let h = h0; h <= h1; h += 0.02) m = Math.max(m, plumeDensity(p, h, tau));
      return m;
    };
    // Dense above the plate's far rim (h ≳ 0.3 su from the camera) through the second after the
    // reveal, thinning; a thin tail still there at 4 s (p99.9 ≈ 11 levels of 255 over the cove,
    // measured: the thin steam breaks into filaments that keep their light), a twentieth of the
    // peak; below STEAM_GONE everywhere (gone) by STEAM_END.
    expect(maxDensity(1.2, 0.3, 0.9)).toBeGreaterThan(0.3);
    expect(maxDensity(1.8, 0.3, 0.9)).toBeGreaterThan(0.15);
    expect(maxDensity(1.8)).toBeLessThan(maxDensity(1.2));
    expect(maxDensity(4.0, 0.3, 0.9)).toBeGreaterThan(0.03);
    expect(maxDensity(4.0)).toBeLessThan(0.1 * maxDensity(1.0));
    expect(maxDensity(STEAM_END)).toBeLessThanOrEqual(STEAM_GONE * 1.01);
    for (const p of steamPuffs()) expect(p.t0 + p.life).toBeLessThanOrEqual(STEAM_END);
    expect(STEAM_END).toBeGreaterThan(DURATIONS.accept + 4);
    expect(STEAM_END).toBeLessThan(DURATIONS.accept + 5.5);
    // It grows up off the plate at its rise speed (nothing above the front), and once the source
    // has peaked the formed sheet (h ≥ PLUME.base) only thins.
    for (const p of steamPlumes()) {
      const tau = p.t0 + 0.4;
      expect(plumeDensity(p, 0.5 * p.rise * 0.4, tau)).toBeGreaterThan(0);
      expect(plumeDensity(p, p.rise * 0.4 + 0.01, tau)).toBe(0);
      for (let t = p.t0 + PLUME.ramp + PLUME.base / p.rise; t < STEAM_END; t += 0.05) {
        expect(plumeDensity(p, PLUME.base, t + 0.05)).toBeLessThanOrEqual(plumeDensity(p, PLUME.base, t));
      }
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

  it('after a change back to accept, the steam follows the (possibly sped-up) reveal, then real time, with no jump', () => {
    const s = stage();
    s.director.setIntent('decline');
    s.run(0.7);
    s.director.setIntent('accept');
    let prev: number | null = null, maxStep = 0, steps = 0;
    s.run(DURATIONS.accept + 0.6, () => {
      const tau = s.scene.steamState.tau;
      if (tau !== null && prev !== null) {
        maxStep = Math.max(maxStep, tau - prev);
        expect(tau).toBeGreaterThanOrEqual(prev);
        steps++;
      }
      prev = tau;
    });
    expect(steps).toBeGreaterThan(30);
    // At most the reveal's speed-up per frame (k ≤ 1.5), never a skip.
    expect(maxStep).toBeLessThanOrEqual((1.5 / 60) * 1.01);
    expect(s.director.state).toBe('accepted-pose');
    expect(s.scene.settling()).toBe(true);
  });

  it('a change of mind mid-reveal leaves the steam already out to rise on and disperse on its own; nothing more is released', () => {
    const s = stage();
    s.director.setIntent('accept');
    s.run(0.5);
    const before = s.scene.steamState;
    const cut = before.tau!;
    s.director.setIntent('decline');
    // The cut is never seen: the same steam, on the same clock, left behind (no fade).
    const after = s.scene.steamState;
    expect(after.visible).toBe(true);
    expect(after.tau).toBeNull();
    expect(after.left).toHaveLength(1);
    expect(after.left[0]).toMatchObject({ tau: cut, emitEnd: cut, until: leftSteamEnd(cut) });
    expect(leftSteamEnd(cut)).toBeLessThanOrEqual(steamEndAfter(cut));
    // Stirred by the returning cover, it thins smoothly from the cut (no step), to 1 % within ≈ 2.5 s.
    expect(stirFade(0)).toBe(1);
    expect(1 - stirFade(1 / 60)).toBeLessThan(0.01);
    expect(stirFade(0.5)).toBeGreaterThan(0.3);
    expect(stirFade(2.5)).toBeLessThan(0.01);
    expect(after.fade).toBe(1);
    // The rewind sets the cover back on the plate: what it closes over then stays under it (the
    // first frame that counts has it seated, or barely lifted with the plate).
    const capture = after.left[0]!.capture;
    expect(capture - cut).toBeGreaterThanOrEqual(REWIND.min);
    expect(capture - cut).toBeLessThanOrEqual(REWIND.max.decline + 1 / 60);
    const seated = frameFor('guest-ready', newFrame()).coverPos;
    // It disperses over its own life (over half a second here; stirred, thinning from the cut), then it has gone and the loop idles,
    // the decline's end (its pose) notwithstanding.
    const until = after.left[0]!.until;
    expect(until - cut).toBeGreaterThan(0.6);
    let prev = cut, frames = 0, closed = false;
    s.run(until - cut + 0.1, () => {
      const l = s.scene.steamState.left;
      if (!l.length) return;
      expect(l[0]!.tau).toBeCloseTo(prev + 1 / 60, 9);
      if (!closed && l[0]!.tau >= capture) {
        closed = true;
        expect(s.scene.rig.nodes.cover_authored!.position.distanceTo(seated)).toBeLessThan(0.02);
      }
      prev = l[0]!.tau;
      frames++;
    });
    expect(closed).toBe(true);
    expect(frames / 60).toBeCloseTo(until - cut, 1);
    expect(s.scene.steamState.visible).toBe(false);
    s.run(DURATIONS.decline + 1);
    expect(s.director.state).toBe('declined-pose');
    expect(s.scene.steamState.visible).toBe(false);
    expect(s.scene.settling()).toBe(false);
    // The release stops softly: the source dies away over PLUME.cut (continuous), then nothing; the
    // column's base detaches and rises off at its rise speed.
    for (const p of steamPlumes()) {
      for (let t = cut - 0.05; t < cut + PLUME.cut + 0.05; t += 0.005) {
        expect(Math.abs(plumeSource(p, t + 0.005, -Infinity, cut) - plumeSource(p, t, -Infinity, cut))).toBeLessThan(0.08);
      }
      expect(plumeSource(p, cut + PLUME.cut, -Infinity, cut)).toBe(0);
      const tau = cut + 0.6;
      expect(plumeDensity(p, p.rise * (tau - cut - PLUME.cut) - 0.01, tau, -Infinity, cut)).toBe(0);
    }
  });

  it('changed back mid-rewind, the reveal resumes and releases its own steam beside what was left behind', () => {
    const s = stage();
    s.director.setIntent('accept');
    s.run(0.6);
    s.director.setIntent('decline');
    s.run(0.1);
    const [left] = s.scene.steamState.left;
    expect(left).toBeDefined();
    s.director.setIntent('accept');
    const st = s.scene.steamState;
    // What was left behind carries on untouched (no jump back, no pop); the cover never closed
    // over it.
    expect(st.left).toEqual([{ ...left, capture: Infinity }]);
    expect(left!.capture).toBeGreaterThan(left!.tau);
    // The reveal resumes part-way down its rewind and releases only from there (ramped up).
    expect(st.tau).not.toBeNull();
    expect(st.tau!).toBeGreaterThan(0);
    expect(st.tau!).toBeLessThan(0.6);
    expect(st.emitStart).toBe(st.tau);
    for (const p of steamPlumes()) expect(plumeSource(p, st.tau! + 0.01, st.emitStart)).toBeLessThan(0.02);
    s.run(DURATIONS.accept + 0.1);
    expect(s.director.state).toBe('accepted-pose');
    expect(s.scene.settling()).toBe(true);
  });

  it('however often the guest changes their mind, at most two lots of steam are left behind and it all ends', () => {
    const s = stage();
    for (let i = 0; i < 8; i++) {
      s.director.setIntent(i % 2 ? 'decline' : 'accept');
      s.run(0.35, () => expect(s.scene.steamState.left.length).toBeLessThanOrEqual(2));
    }
    s.director.setIntent('decline');
    s.run(STEAM_END + 1);
    expect(s.scene.steamState.visible).toBe(false);
    expect(s.scene.settling()).toBe(false);
  });
});
