import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { Box3, Color, Matrix4, MeshStandardMaterial, type Object3D, Vector3 } from 'three';
import type { Node } from '@gltf-transform/core';
import type { KHRMaterialsVariants } from '@gltf-transform/extensions';
import { DIRECTIONS, type MaterialLibrary } from '../src/render/materials.ts';
import { boxIn, createIO, findNode } from '../scripts/masters/compose.ts';
import { PALETTE, recipe } from '../scripts/masters/recipes/birthday.ts';
import {
  BIN_POS, BIN_YAW, birthdayBounds, CAKE_RADIUS, CAKE_SCALE, CAKE_TOTAL_HEIGHT, CANDLE, CANDLE_COUNT, CANDLE_SOCKETS, FLAME_TOP, LEAN_MAX, MASTER,
  RIM_CLEARANCE, screenX, STAND, STAND_TOP,
} from '../models/birthdayContract.ts';
import { BIRTHDAY_GLB_NODES, buildBirthdayGeometry, FLAME_SIZE } from '../models/birthdayParts.ts';
import { BIN, buildDisposalBin } from '../models/disposalBin.ts';
import {
  CANDLE_DESCENT, CANDLE_HOVER, CANDLE_LAND_SPEED, CANDLE_SEATED, CANDLE_START, DURATIONS, FLAME_RISE, FLAME_START, LEAN_FADE, OUT_LEN, OUT_START, WISP_OPACITY,
} from '../src/scenes/birthday/poses.ts';
import { candleDrop, carryLean, frameFor, LEAN_AXIS, newFrame, sampleSequence, type BirthdayFrame } from '../src/scenes/birthday/sequences.ts';
import { birthdayFramePoints } from '../src/scenes/birthday/framing.ts';
import type { CanonicalPose, SequenceName } from '../src/core/types.ts';

const at = (seq: SequenceName, t: number) => sampleSequence(seq, t, newFrame());
const pose = (p: CanonicalPose) => frameFor(p, newFrame());
const ARRAYS = ['drop', 'flameScale', 'flameOpacity', 'flameLean', 'wispOpacity', 'wispRise', 'wispGrow'] as const;
const SCALARS = ['cakeYaw', 'cakeLean', 'wickLean', 'flaps'] as const;
const DEG = Math.PI / 180;

function close(a: BirthdayFrame, b: BirthdayFrame, eps = 1e-6) {
  expect(a.cakePos.distanceTo(b.cakePos)).toBeLessThan(eps);
  expect(a.binPos.distanceTo(b.binPos)).toBeLessThan(eps);
  for (const k of SCALARS) expect(Math.abs(a[k] - b[k]), k).toBeLessThan(eps);
  for (const k of ARRAYS) {
    expect(a[k].length).toBe(CANDLE_COUNT);
    for (let i = 0; i < CANDLE_COUNT; i++) expect(Math.abs(a[k][i]! - b[k][i]!), `${k}[${i}]`).toBeLessThan(eps);
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

/** Every animated channel of a frame as one flat list (for the velocity-continuity test). */
function channels(f: BirthdayFrame): number[] {
  const out = [f.cakePos.x, f.cakePos.y, f.cakePos.z, f.binPos.x, f.binPos.y, f.binPos.z, f.cakeYaw, f.cakeLean, f.wickLean, f.flaps];
  for (const k of ARRAYS) out.push(...f[k]);
  return out;
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
        expect(Math.abs(cur.cakeLean - prev.cakeLean)).toBeLessThan(0.001);
        for (let k = 0; k < CANDLE_COUNT; k++) {
          expect(Math.abs(cur.drop[k]! - prev.drop[k]!)).toBeLessThan(0.01);
          expect(Math.abs(cur.flameOpacity[k]! - prev.flameOpacity[k]!)).toBeLessThan(0.05);
        }
        expect(Math.abs(cur.flaps - prev.flaps)).toBeLessThan(0.03);
        if (seq !== 'decline' || i > 1) expect(cur.binPos.distanceTo(prev.binPos)).toBeLessThan(0.05);
        prev = cur;
      }
    }
  });

  it('is C1: no velocity jumps anywhere (second differences at 0.1 ms stay at acceleration scale)', () => {
    // A velocity jump Δv shows as a second difference ≈ Δv·h; smooth motion gives a·h². With
    // h = 0.1 ms, 1e-5 allows accelerations up to 1000 units/s² (a flame's 0.12 s rise peaks at
    // 420/s²) and catches any velocity jump over 0.1 units/s. Exempt: a flame's scale, lean and a
    // wisp's rise while they are invisible (opacity 0), and the first step of decline, where the
    // bin appears (a visibility switch, not motion).
    const h = 0.0001;
    for (const seq of ['host', 'accept', 'decline'] as const) {
      for (let i = 1; i < DURATIONS[seq] / h - 0.5; i++) {
        if (seq === 'decline' && i < 2) continue;
        const a = at(seq, (i - 1) * h), b = at(seq, i * h), c = at(seq, (i + 1) * h);
        const ca = channels(a), cb = channels(b), cc = channels(c);
        const names = ['cake.x', 'cake.y', 'cake.z', 'bin.x', 'bin.y', 'bin.z', ...SCALARS, ...ARRAYS.flatMap((k) => Array.from({ length: CANDLE_COUNT }, (_, j) => `${k}[${j}]`))];
        for (let k = 0; k < cb.length; k++) {
          const name = names[k]!;
          const m = /^(flameScale|flameLean|flameOpacity)\[(\d)\]$/.exec(name);
          if (m && Math.min(a.flameOpacity[+m[2]!]!, c.flameOpacity[+m[2]!]!) < 1e-9) continue;
          const w = /^(?:wispRise|wispGrow)\[(\d)\]$/.exec(name);
          if (w && Math.min(a.wispOpacity[+w[1]!]!, c.wispOpacity[+w[1]!]!) < 1e-9) continue;
          const d2 = Math.abs(ca[k]! - 2 * cb[k]! + cc[k]!);
          // Positions: the bin's 2.8-unit slide-in peaks near 1100 units/s²; allow 3000 (jumps > 0.3 units/s).
          if (d2 >= (k < 6 ? 3e-5 : 1e-5)) throw new Error(`${seq} ${name} at ${(i * h * 1000).toFixed(1)} ms: second difference ${d2.toExponential(2)}`);
        }
      }
    }
  });

  it('six candles lower 55 ms apart, left to right, press in a few millimetres and seat exactly', () => {
    expect(CANDLE_START).toHaveLength(6);
    for (let i = 1; i < CANDLE_COUNT; i++) expect(CANDLE_START[i]! - CANDLE_START[i - 1]!).toBeCloseTo(0.055, 9);
    for (let i = 0; i < CANDLE_COUNT; i++) {
      expect(at('host', CANDLE_START[i]! - 0.001).drop[i]).toBe(CANDLE_HOVER);
      expect(at('host', CANDLE_START[i]! + 0.05).drop[i]).toBeLessThan(CANDLE_HOVER);
      expect(at('host', CANDLE_SEATED[i]!).drop[i]).toBe(0);
      expect(CANDLE_SEATED[i]).toBeLessThan(FLAME_START[i]!);
    }
    // Descent: monotone, landing at CANDLE_LAND_SPEED; then the settle stays within 2–8 mm.
    let prev = Infinity, press = 0, rebound = 0;
    for (let ms = 0; ms <= 600; ms++) {
      const d = candleDrop(ms / 1000);
      if (ms / 1000 <= CANDLE_DESCENT) expect(d).toBeLessThanOrEqual(prev);
      else { press = Math.min(press, d); rebound = Math.max(rebound, d); }
      prev = d;
    }
    expect(-press).toBeGreaterThan(0.002);
    expect(-press).toBeLessThan(0.008);
    expect(rebound).toBeLessThan(0.002);
    const v = (candleDrop(CANDLE_DESCENT + 1e-6) - candleDrop(CANDLE_DESCENT - 1e-6)) / 2e-6;
    expect(v).toBeCloseTo(-CANDLE_LAND_SPEED, 3);
  });

  it('flames appear only in 0.84–1.06 s as a restrained rise, never a flash', () => {
    const end = FLAME_START[CANDLE_COUNT - 1]! + FLAME_RISE;
    expect(end).toBeLessThanOrEqual(1.06 + 1e-9);
    let prev = Array.from({ length: CANDLE_COUNT }, () => 0);
    for (let i = 0; i <= 1300; i++) {
      const f = at('host', i / 1000);
      for (let k = 0; k < CANDLE_COUNT; k++) {
        const o = f.flameOpacity[k]!;
        if (i / 1000 < 0.84) expect(o).toBe(0);
        if (i / 1000 >= end) expect(o).toBe(1);
        expect(o).toBeGreaterThanOrEqual(prev[k]! - 1e-12);
        expect(f.flameScale[k]!).toBeLessThanOrEqual(1);
        prev[k] = o;
      }
    }
  });

  it('accept: flames go out left to right by 0.60 s; one faint wisp each, gone by 1.00 s; wicks at rest', () => {
    const outAt = Array.from({ length: CANDLE_COUNT }, (_, k) => {
      for (let i = 0; i <= 1400; i++) if (at('accept', i / 1000).flameOpacity[k] === 0) return i;
      return Infinity;
    });
    for (let k = 1; k < CANDLE_COUNT; k++) expect(outAt[k - 1]).toBeLessThan(outAt[k]!);
    expect(outAt[CANDLE_COUNT - 1]).toBeLessThanOrEqual(600);
    expect(OUT_START[CANDLE_COUNT - 1]! + OUT_LEN).toBeLessThanOrEqual(0.6);
    for (let i = 0; i <= 1400; i++) {
      const f = at('accept', i / 1000);
      for (let k = 0; k < CANDLE_COUNT; k++) {
        expect(f.wispOpacity[k]!).toBeLessThanOrEqual(WISP_OPACITY + 1e-9);
        if (i < 600 || i >= 1000) expect(f.wispOpacity[k]).toBe(0);
        // While it reads (over half its peak) the wisp's foot stays on the wick: no floating smoke.
        if (f.wispOpacity[k]! >= WISP_OPACITY / 2) expect(f.wispRise[k]!).toBeLessThan(0.03);
      }
    }
    expect(at('accept', 1.4).wickLean).toBe(0);
  });

  it('candles are numbered left to right as the shared camera sees them', () => {
    const xs = CANDLE_SOCKETS.map(([x, z]) => screenX(x, z));
    for (let i = 1; i < CANDLE_COUNT; i++) expect(xs[i]!).toBeGreaterThan(xs[i - 1]! + 0.05);
  });

  it('decline: the carry lean is a damped sway within 2°, upright off the stand and before the drop', () => {
    let peak = 0, back = 0, fwd = 0;
    for (let i = 0; i <= 1500; i++) {
      const t = i / 1000, l = carryLean(t);
      peak = Math.max(peak, Math.abs(l));
      if (t < 0.48) back = Math.min(back, l);
      if (t > 0.5 && t < 0.75) fwd = Math.max(fwd, l);
      if (t <= 0.25 || t >= LEAN_FADE[1]) expect(l).toBe(0);
    }
    expect(peak).toBeLessThanOrEqual(LEAN_MAX + 1e-9);
    expect(LEAN_MAX).toBeLessThanOrEqual(2 * DEG);
    expect(peak).toBeGreaterThan(1.5 * DEG);
    // Leans back (top trailing) as it sets off towards the bin, forward as it slows over it.
    expect(back).toBeLessThan(-0.5 * DEG);
    expect(fwd).toBeGreaterThan(0.5 * DEG);
    expect(Math.abs(LEAN_AXIS.y)).toBeLessThan(1e-9);
    expect(LEAN_AXIS.dot(new Vector3(BIN_POS.x, 0, BIN_POS.z))).toBeCloseTo(0, 9);
  });

  it('decline: the cake clears the stand and the rim, passes between the flaps and drops straight down, centred', () => {
    // Plan radius of the shell border (the cake's underside rim), the part that tips lowest.
    const baseR = MASTER.cakeRadius * CAKE_SCALE;
    for (let i = 0; i <= 1500; i++) {
      const f = at('decline', i / 1000);
      const p = f.cakePos;
      const tip = Math.sin(Math.abs(f.cakeLean));
      const local = binLocal(p);
      // Any plan overlap with the bin: the underside (tipped) is above the rim.
      if (local.d < CAKE_RADIUS + BIN.radius + 0.02 && p.y > BIN.floor + 0.01 && local.d > 0.01) expect(p.y - baseR * tip).toBeGreaterThanOrEqual(BIN.rimTop + RIM_CLEARANCE - 0.03);
      // Over the opening: stays between the open flaps, lean included.
      if (local.d < BIN.opening && p.y > BIN.rimTop) expect(Math.abs(local.x) + CAKE_RADIUS + CAKE_TOTAL_HEIGHT * tip).toBeLessThan(BIN.hingeX - 0.02);
      // Below the rim: exactly centred in the opening, the tipped cake clear of its wall, and
      // upright (steadied) once it is fully inside.
      if (p.y < BIN.rimTop + 0.05 && local.d < BIN.radius + CAKE_RADIUS) {
        expect(local.d).toBeLessThan(1e-6);
        expect(CAKE_RADIUS + CAKE_TOTAL_HEIGHT * tip).toBeLessThan(BIN.opening - 0.04);
        if (p.y + CAKE_TOTAL_HEIGHT < BIN.rimTop) expect(Math.abs(f.cakeLean)).toBeLessThan(0.05 * DEG);
      }
      // While over the stand, the tipped underside never sinks below its seat on the plate.
      if (Math.hypot(p.x, p.z) < STAND.radius + CAKE_RADIUS) expect(p.y - baseR * tip).toBeGreaterThanOrEqual(STAND_TOP - 1e-9);
    }
  });

  it('decline: flaps close only once the cake and candles are below them; the hidden cake stops rendering', () => {
    const closingStarts = (() => {
      for (let i = 300; i <= 1500; i++) if (at('decline', i / 1000).flaps < 1 - 1e-9) return i / 1000;
      return 2;
    })();
    const f = at('decline', closingStarts);
    expect(f.cakePos.y + CAKE_TOTAL_HEIGHT).toBeLessThan(BIN.rimTop - 0.012);
    expect(at('decline', 1.2).flaps).toBeLessThan(0.05);
    expect(at('decline', 1.5).cakeVisible).toBe(false);
    expect(at('decline', 0.2).flameOpacity.every((o) => o === 0)).toBe(true);
  });

  it('the bin clears the stand: plan distance exceeds plate + bin radii', () => {
    expect(Math.hypot(BIN_POS.x, BIN_POS.z)).toBeGreaterThanOrEqual(STAND.radius + BIN.radius + 0.04);
  });

  it('the cake with candles fits the bin opening and sits below the flaps on the liner floor', () => {
    expect(CAKE_RADIUS).toBeLessThan(BIN.opening - 0.04);
    expect(BIN.floor + CAKE_TOTAL_HEIGHT).toBeLessThan(BIN.rimTop - 0.006);
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

describe('Birthday builder (code-authored candles)', () => {
  const lib = plainLibrary();
  const root = buildBirthdayGeometry({ lib });

  it('puts each candle on its master socket with a wick and a flame at the tip', () => {
    for (let i = 0; i < CANDLE_COUNT; i++) {
      const id = String(i + 1).padStart(2, '0');
      const candle = root.getObjectByName(`candle_${id}`)!;
      expect(candle.position.x).toBeCloseTo(CANDLE_SOCKETS[i]![0], 9);
      expect(candle.position.z).toBeCloseTo(CANDLE_SOCKETS[i]![1], 9);
      expect(candle.position.y).toBeCloseTo(CANDLE.seat, 9);
      const flame = candle.getObjectByName(`flame_${id}`)!;
      expect(flame.position.y).toBeCloseTo(CANDLE.flameBase, 9);
      const fb = box(flame);
      const cb = box(candle);
      expect(fb.max.y - fb.min.y).toBeCloseTo(CANDLE.flameHeight, 3);
      expect(fb.max.x - fb.min.x).toBeLessThan(CANDLE.flameRadius * 2 * 1.4);
      const wick = box(candle.getObjectByName(`wick_${id}`)!);
      const base = STAND_TOP + CANDLE.seat;
      expect(wick.max.y - base).toBeGreaterThan(CANDLE.wickBase + CANDLE.wickHeight - 0.002);
      expect(wick.min.y - base).toBeLessThan(CANDLE.height);
      expect(wick.max.y).toBeLessThan(fb.min.y + CANDLE.flameHeight * 0.3);
      expect(cb.max.y).toBeCloseTo(fb.max.y, 9);
    }
    expect(FLAME_SIZE.height).toBeGreaterThan(0.9);
  });
});

/** The exported runtime GLB (pnpm models birthday), measured with gltf-transform. */
describe('Birthday runtime GLB matches the contract', async () => {
  const doc = await createIO().read(join(import.meta.dirname, '..', 'assets', 'scenes', 'birthday', 'birthday.glb'));
  const node = (name: string) => findNode(doc, name);
  const worldOf = (n: Node) => new Matrix4().fromArray(n.getWorldMatrix());
  const names = doc.getRoot().listNodes().map((n) => n.getName());

  it('has every contract node exactly once, and none of the master\'s shared wick or flame meshes', () => {
    for (const n of BIRTHDAY_GLB_NODES) expect(names.filter((x) => x === n), n).toHaveLength(1);
    expect(recipe.contract).toBe(BIRTHDAY_GLB_NODES);
    for (const n of ['candle_wicks', 'candle_flames', 'cake_stand']) expect(names).not.toContain(n);
    for (const m of doc.getRoot().listMaterials()) expect(['candle_wick', 'candle_flame']).not.toContain(m.getName());
  });

  it('the stand is the master at CAKE_SCALE, its foot on the floor at the origin', () => {
    const tray = node('tray');
    expect(tray.getMesh()).toBeNull();
    expect(tray.getScale()).toEqual([1, 1, 1]);
    expect(new Vector3(...tray.getTranslation()).length()).toBeLessThan(1e-4);
    const b = boxIn(tray, node('birthday_root'));
    expect(Math.abs(b.min.y)).toBeLessThan(2e-4);
    expect(Math.abs(b.max.y - STAND.top)).toBeLessThan(2e-4);
    expect(Math.abs(b.max.x - STAND.radius)).toBeLessThan(1e-3);
    expect(Math.abs(b.min.z + STAND.radius)).toBeLessThan(1e-3);
  });

  it('the tiers and piping sit on cake_secondary: underside at its origin, widest at CAKE_RADIUS', () => {
    const cs = node('cake_secondary');
    expect(new Vector3(...node('cake_authored').getTranslation()).distanceTo(new Vector3(0, STAND_TOP, 0))).toBeLessThan(1e-6);
    const frosting = cs.listChildren().filter((c) => c.getName().startsWith('frosting_'));
    expect(frosting.map((c) => c.getName()).sort()).toEqual(['frosting_cake_buttercream', 'frosting_cake_pearl', 'frosting_cake_piping', 'frosting_cake_rosette']);
    let minY = Infinity, maxR = 0, maxY = -Infinity;
    const toCs = worldOf(cs).invert();
    for (const f of frosting) {
      f.traverse((c) => {
        const m = toCs.clone().multiply(worldOf(c));
        for (const prim of c.getMesh()?.listPrimitives() ?? []) {
          const pos = prim.getAttribute('POSITION')!;
          const e = [0, 0, 0];
          for (let i = 0; i < pos.getCount(); i++) {
            const v = new Vector3(...(pos.getElement(i, e) as [number, number, number])).applyMatrix4(m);
            minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y); maxR = Math.max(maxR, Math.hypot(v.x, v.z));
          }
        }
      });
      expect((f.getExtras() as { noShadowCast?: boolean }).noShadowCast, f.getName()).toBe(true);
    }
    expect(Math.abs(minY)).toBeLessThan(3e-4);
    expect(Math.abs(maxR - CAKE_RADIUS)).toBeLessThan(2e-3);
    expect(Math.abs(maxY - (MASTER.cakeTop - MASTER.cakeBottom) * CAKE_SCALE)).toBeLessThan(2e-3);
  });

  it('each master candle stands on its socket: candle_NN_wax at the candle_NN origin, base to tip CANDLE.height', () => {
    for (let i = 0; i < CANDLE_COUNT; i++) {
      const id = String(i + 1).padStart(2, '0');
      const candle = node(`candle_${id}`), wax = node(`candle_${id}_wax`);
      expect(wax.getParentNode()).toBe(candle);
      expect(wax.getMesh()).toBeNull();
      expect(new Vector3(...wax.getTranslation()).length(), id).toBeLessThan(3e-4);
      const b = boxIn(wax, candle);
      expect(Math.abs(b.min.y)).toBeLessThan(3e-4);
      expect(Math.abs(b.max.y - CANDLE.height)).toBeLessThan(5e-4);
      expect(Math.abs((b.max.x + b.min.x) / 2)).toBeLessThan(5e-4);
      expect(Math.abs((b.max.z + b.min.z) / 2)).toBeLessThan(5e-4);
      expect(Math.abs((b.max.x - b.min.x) / 2 - CANDLE.radius)).toBeLessThan(2e-3);
      // The seated candle beds CANDLE.insert into the top tier.
      expect(new Vector3(...candle.getTranslation()).y + CANDLE.insert).toBeCloseTo((MASTER.tierTop - MASTER.cakeBottom) * CAKE_SCALE, 6);
    }
  });

  it('shadow proxies cast for the stand, the cake (under cake_secondary) and each candle (under candle_NN)', () => {
    expect(node('cake_shadow_proxy').getParentNode()).toBe(node('cake_secondary'));
    expect(node('tray_shadow_proxy').getParentNode()).toBe(node('birthday_root'));
    for (const n of ['cake_shadow_proxy', 'tray_shadow_proxy']) expect((node(n).getExtras() as { shadowProxy?: boolean }).shadowProxy).toBe(true);
    expect((node('tray_mesh').getExtras() as { noShadowCast?: boolean }).noShadowCast).toBe(true);
    // Each candle casts through a map-free proxy that lowers with it (the wax's LUT map must not
    // reach three's shared shadow depth material, which outlives the scene).
    for (let i = 0; i < CANDLE_COUNT; i++) {
      const id = String(i + 1).padStart(2, '0');
      const proxy = node(`candle_${id}_shadow_proxy`);
      expect(proxy.getParentNode()).toBe(node(`candle_${id}`));
      expect((proxy.getExtras() as { shadowProxy?: boolean }).shadowProxy).toBe(true);
      expect((node(`candle_${id}_wax_mesh`).getExtras() as { noShadowCast?: boolean }).noShadowCast).toBe(true);
      const b = boxIn(proxy, node(`candle_${id}`));
      expect(Math.abs(b.max.y - CANDLE.height)).toBeLessThan(0.01);
      expect(b.min.y).toBeLessThan(0.01);
    }
  });

  it('carries vanilla (default) and cocoa frostings as material variants; stand and candles keep the master colours', () => {
    const variants = doc.getRoot().listExtensionsUsed().find((e) => e.extensionName === 'KHR_materials_variants') as KHRMaterialsVariants | undefined;
    expect(variants?.listVariants().map((v) => v.getName())).toEqual(['vanilla', 'cocoa']);
    const mat = (n: string) => doc.getRoot().listMaterials().find((m) => m.getName() === n)!;
    const lin = (hex: string) => new Color(hex).toArray();
    for (const [key, name] of [['body', 'cake_buttercream'], ['piping', 'cake_piping'], ['rosette', 'cake_rosette'], ['pearl', 'cake_pearl']] as const) {
      const v = mat(name).getBaseColorFactor(), c = mat(`${name}_cocoa`).getBaseColorFactor();
      lin(PALETTE.vanilla[key]).forEach((x, i) => expect(v[i]!).toBeCloseTo(x, 4));
      lin(PALETTE.cocoa[key]).forEach((x, i) => expect(c[i]!).toBeCloseTo(x, 4));
    }
    // The master's glazed stand (#A2B2BC) and white candle wax under their stripe LUTs.
    expect(new Color().fromArray(mat('cake_stand_ceramic').getBaseColorFactor()).getHexString()).toBe('a2b2bc');
    for (const n of ['cake_candle_pink', 'cake_candle_blue']) expect(mat(n).getBaseColorTexture()?.getSize()).toEqual([256, 4]);
  });

  it('the stand, hovering candles, the carried cake and the open bin stay inside the motion bounds and frame points', () => {
    const bounds = birthdayBounds().expandByScalar(1e-6);
    const lib = plainLibrary();
    const bin = buildDisposalBin({ lib });
    bin.position.copy(BIN_POS);
    bin.rotation.y = BIN_YAW;
    bin.getObjectByName('bin_flap_l')!.rotation.z = BIN.flapOpen;
    bin.getObjectByName('bin_flap_r')!.rotation.z = -BIN.flapOpen;
    expect(bounds.containsBox(box(bin))).toBe(true);
    const cakeTop = STAND_TOP + boxIn(node('cake_secondary'), node('cake_secondary')).max.y;
    expect(cakeTop).toBeLessThan(bounds.max.y);
    expect(STAND_TOP + CANDLE.seat + CANDLE_HOVER + FLAME_TOP).toBeLessThanOrEqual(bounds.max.y);
    const pts = new Box3().setFromPoints(birthdayFramePoints());
    expect(pts.max.y).toBeGreaterThanOrEqual(STAND_TOP + CANDLE.seat + CANDLE_HOVER + CANDLE.height - 1e-9);
  });
});
