import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { Box3, BoxGeometry, Color, Euler, Group, Matrix4, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, type Object3D, OrthographicCamera, Texture, Vector3 } from 'three';
import { DOME_ANISOTROPY, DOME_ROUGHNESS, finishDish, type DinnerRig } from '../models/dinner.ts';
import { VisualDirector } from '../src/core/visualDirector.ts';
import type { Node } from '@gltf-transform/core';
import { listTextureSlots } from '@gltf-transform/functions';
import { fitCameraToBounds } from '../src/render/camera.ts';
import { DinnerScene, dinnerFramePoints } from '../src/scenes/dinner/index.ts';
import { DIRECTIONS, type MaterialLibrary } from '../src/render/materials.ts';
import {
  COVER, COVER_BESIDE, COVER_SEATED, COVER_TOP, DINNER_BIN_POS, DINNER_BIN_YAW, DINNER_GLB_NODES, DINNER_NODES, DINNER_RIM_CLEARANCE, DISH_HEIGHT,
  DISH_SCALE, PLATE, plateTop, dinnerBounds,
} from '../models/dinnerContract.ts';
import { buildDinnerGeometry } from '../models/dinnerPremium.ts';
import { BIN, buildDisposalBin, openBinFramePoints } from '../models/disposalBin.ts';
import { boxIn, createIO, findNode } from '../scripts/masters/compose.ts';
import {
  ACCEPT, type AnswerChange, BIN_CLEARANCE, binStep, changeTime, CONTENT_END, coverBlendSafe, coverLowering, dishStep, DURATIONS, outcomePace, planAnswerChange, REWIND,
  sampleAnswerChange, frameFor, HOST_FLAT, HOST_TOUCH, newFrame, REVEAL_DIR, SAFE_SKIRT, sampleSequence, SETTLE_TILT, TIP,
  type DinnerFrame,
} from '../src/scenes/dinner/sequences.ts';
import type { CanonicalPose, SequenceName } from '../src/core/types.ts';

const at = (seq: SequenceName, t: number) => sampleSequence(seq, t, newFrame());
const pose = (p: CanonicalPose) => frameFor(p, newFrame());
const close = (a: DinnerFrame, b: DinnerFrame, eps = 1e-6) => {
  expect(a.platePos.distanceTo(b.platePos)).toBeLessThan(eps);
  expect(a.coverPos.distanceTo(b.coverPos)).toBeLessThan(eps);
  expect(a.binPos.distanceTo(b.binPos)).toBeLessThan(eps);
  expect(Math.abs(a.coverTilt - b.coverTilt)).toBeLessThan(eps);
  expect(Math.abs(a.coverTiltX - b.coverTiltX)).toBeLessThan(eps);
  expect(Math.abs(a.flaps - b.flaps)).toBeLessThan(eps);
  expect(a.dishVisible).toBe(b.dishVisible);
  expect(a.binVisible).toBe(b.binVisible);
};
const plan = (p: Vector3, c: Vector3) => Math.hypot(p.x - c.x, p.z - c.z);
const tiltOf = (f: DinnerFrame) => Math.hypot(f.coverTilt, f.coverTiltX);
/** Lowest point of the cover's rim ring for its position and tilt. */
const skirtLow = (f: DinnerFrame) => f.coverPos.y - COVER.lipRadius * Math.abs(Math.sin(tiltOf(f)));

// ── The exported runtime GLB (pnpm models dinner), read once ───────────────────────
const doc = await createIO().read(join(import.meta.dirname, '..', 'assets', 'scenes', 'dinner', 'dinner.glb'));
const node = (name: string) => findNode(doc, name);
const worldOf = (n: Node) => new Matrix4().fromArray(n.getWorldMatrix());
/** Every rendered vertex under `n` (shadow proxies excluded), in `space`'s frame. */
function vertices(n: Node, space: Node): Vector3[] {
  const out: Vector3[] = [];
  const inv = worldOf(space).invert();
  n.traverse((c) => {
    if (c.getName().endsWith('shadow_proxy')) return;
    const m = inv.clone().multiply(worldOf(c));
    for (const prim of c.getMesh()?.listPrimitives() ?? []) {
      const pos = prim.getAttribute('POSITION')!;
      const e = [0, 0, 0];
      for (let i = 0; i < pos.getCount(); i++) out.push(new Vector3(...(pos.getElement(i, e) as [number, number, number])).applyMatrix4(m));
    }
  });
  return out;
}
const plateVerts = vertices(node('plate_secondary'), node('plate_authored'));
const coverVerts = vertices(node('cover_secondary'), node('cover_authored'));
/**
 * The plate's top surface from its upward-facing vertices: the highest per 1 mm radial bin,
 * linear between bins (the flat well has few vertices; the coupe rim has many).
 */
const plateTopVerts: Vector3[] = [];
{
  const inv = worldOf(node('plate_authored')).invert();
  node('plate_secondary').traverse((c) => {
    if (c.getName().endsWith('shadow_proxy')) return;
    const m = inv.clone().multiply(worldOf(c));
    const nm = new Matrix4().copy(m).invert().transpose();
    for (const prim of c.getMesh()?.listPrimitives() ?? []) {
      const pos = prim.getAttribute('POSITION')!, nor = prim.getAttribute('NORMAL')!;
      const e = [0, 0, 0], n = [0, 0, 0];
      for (let i = 0; i < pos.getCount(); i++) {
        const normal = new Vector3(...(nor.getElement(i, n) as [number, number, number])).transformDirection(nm);
        if (normal.y > 0.3) plateTopVerts.push(new Vector3(...(pos.getElement(i, e) as [number, number, number])).applyMatrix4(m));
      }
    }
  });
}
const BIN_W = 0.001;
const topBins = new Map<number, number>();
for (const v of plateTopVerts) {
  const k = Math.floor(Math.hypot(v.x, v.z) / BIN_W);
  topBins.set(k, Math.max(topBins.get(k) ?? -1, v.y));
}
const topKeys = [...topBins.keys()].sort((a, b) => a - b);
const plateSurface = (r: number) => {
  const k = Math.floor(r / BIN_W);
  if (topBins.has(k)) return topBins.get(k)!;
  let i = topKeys.findIndex((x) => x > k);
  if (i <= 0) return i === 0 ? topBins.get(topKeys[0]!)! : topBins.get(topKeys[topKeys.length - 1]!)!;
  const k0 = topKeys[i - 1]!, k1 = topKeys[i]!;
  const y0 = topBins.get(k0)!, y1 = topBins.get(k1)!;
  return y0 + ((y1 - y0) * (k - k0)) / (k1 - k0);
};
/** The cover's lower part (rim bead, bands, skirt): what can touch the plate or the table. */
const coverLow = coverVerts.filter((v) => v.y < 0.2).filter((_, i) => i % 3 === 0);
if (process.env.DINNER_DEBUG) {
  for (let r = 0.6; r <= 0.8; r += 0.004) console.log('surf', r.toFixed(3), plateSurface(r).toFixed(4), plateTop(r).toFixed(4));
  const seated = coverVerts.map((v) => ({ r: Math.hypot(v.x, v.z), y: v.y + COVER_SEATED.y })).map((p) => ({ ...p, g: p.y - plateSurface(p.r) })).sort((a, b) => a.g - b.g).slice(0, 5);
  console.log(JSON.stringify(seated));
  let need = -1, at = 0;
  for (const v of coverVerts) { const r = Math.hypot(v.x, v.z); if (r < PLATE.radius && plateSurface(r) - v.y > need) { need = plateSurface(r) - v.y; at = r; } }
  console.log('seat needed', need, 'contact r', at);
  const rows: string[] = [];
  for (let i = 44; i <= 80; i++) {
    const r = i / 100;
    let m = 0;
    for (const v of plateVerts) { const rr = Math.hypot(v.x, v.z); if (Math.abs(rr - r) <= 0.01) m = Math.max(m, v.y); }
    rows.push(`[${r.toFixed(2)}, ${m.toFixed(4)}]`);
  }
  console.log('PROFILE', rows.join(', '));
}

/** Smallest gap between the cover (as posed by `f`) and the plate's top surface or the table. */
const e3 = new Euler();
const q = new Vector3();
function coverGap(f: DinnerFrame): number {
  e3.set(f.coverTiltX, 0, f.coverTilt);
  let gap = Infinity;
  for (const v of coverLow) {
    q.copy(v).applyEuler(e3).add(f.coverPos);
    const r = plan(q, f.platePos);
    const floor = r < PLATE.radius ? f.platePos.y + plateSurface(r) : 0;
    gap = Math.min(gap, q.y - floor);
  }
  return gap;
}

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
        // A teleport guard, not a speed limit: the decline transfer is paced on screen and its
        // depth leg is fast in world units (up to about 25 u/s) while it stays smooth on screen.
        expect(cur.coverPos.distanceTo(prev.coverPos)).toBeLessThan(0.03);
        expect(cur.platePos.distanceTo(prev.platePos)).toBeLessThan(0.03);
        expect(Math.abs(cur.coverTilt - prev.coverTilt)).toBeLessThan(0.01);
        expect(Math.abs(cur.coverTiltX - prev.coverTiltX)).toBeLessThan(0.01);
        if (seq !== 'decline' || i > 1) expect(cur.binPos.distanceTo(prev.binPos)).toBeLessThan(0.05);
        prev = cur;
      }
    }
  });

  it('is C1: tilt, plan position and height change speed smoothly at every beat boundary (1 ms)', () => {
    // Velocity from 1 ms differences; a kink shows as a velocity step at one sample that its
    // neighbours do not share (smooth acceleration changes every step alike). Allowed: the height
    // kinks only at the instants the rim rock passes level (it switches the rim it rocks on: a
    // rigid contact), i.e. at the flat beat and half-way through the rock; ±2 ms around each.
    const h = 0.001;
    for (const seq of ['host', 'accept'] as const) {
      const vel = (t: number) => {
        const a = at(seq, t), b = at(seq, t + h);
        return [(b.coverTilt - a.coverTilt) / h, (b.coverTiltX - a.coverTiltX) / h, (b.coverPos.x - a.coverPos.x) / h, (b.coverPos.z - a.coverPos.z) / h, (b.coverPos.y - a.coverPos.y) / h];
      };
      const n = Math.round(DURATIONS[seq] * 1000) - 1;
      const v = Array.from({ length: n }, (_, i) => vel(i * h));
      const flat = seq === 'host' ? HOST_FLAT : ACCEPT.flat;
      const settled = seq === 'host' ? DURATIONS.host : ACCEPT.settled;
      const levelAt = [flat, flat + (settled - flat) / 2];
      for (let i = 2; i < n - 1; i++) {
        for (let c = 0; c < 5; c++) {
          const dv = Math.abs(v[i]![c]! - v[i - 1]![c]!);
          const around = Math.max(Math.abs(v[i - 1]![c]! - v[i - 2]![c]!), Math.abs(v[i + 1]![c]! - v[i]![c]!));
          if (c === 4 && levelAt.some((x) => Math.abs(i / 1000 - x) <= 0.002)) continue;
          expect(dv, `${seq} channel ${c} at ${i} ms`).toBeLessThan(0.01 + 3 * around);
        }
      }
    }
  });

  it('covering and uncovering never pass the cover through the plate or the table (real master geometry)', () => {
    let seatedGap = Infinity;
    for (const seq of ['host', 'accept'] as const) {
      for (let i = 0; i <= DURATIONS[seq] * 1000; i += 2) {
        const f = at(seq, i / 1000);
        const gap = coverGap(f);
        // Resting or rocking on its rim (seated on the plate's slope or on the table): contact
        // within the 1 mm surface bins (BIN_W); moving anywhere else: clear of the plate.
        const onRim = (seq === 'host' && i / 1000 >= HOST_TOUCH) || (seq === 'accept' && (i / 1000 <= 0.1 || i / 1000 >= ACCEPT.touch));
        if (onRim) seatedGap = Math.min(seatedGap, gap);
        else expect(gap, `${seq} at ${i} ms`).toBeGreaterThan(-0.0003);
        expect(gap, `${seq} at ${i} ms`).toBeGreaterThan(-0.001);
      }
    }
    expect(seatedGap).toBeGreaterThan(-0.001);
  });

  it('the reveal is handle-led: the guest-side rim rises first (≈4.5°) while the far rim stays on the plate, then the cover levels', () => {
    // At the tip's peak the far rim (towards the resting place) is still on the plate.
    const f = at('accept', ACCEPT.tipPeak);
    expect(tiltOf(f)).toBeGreaterThan(TIP * 0.95);
    expect(tiltOf(f)).toBeLessThan((6 * Math.PI) / 180);
    const e = new Euler(f.coverTiltX, 0, f.coverTilt);
    const far = REVEAL_DIR.clone().multiplyScalar(COVER.lipRadius).applyEuler(e).add(f.coverPos);
    const near = REVEAL_DIR.clone().multiplyScalar(-COVER.lipRadius).applyEuler(e).add(f.coverPos);
    expect(far.y - COVER_SEATED.y).toBeLessThan(0.03);
    expect(near.y - COVER_SEATED.y).toBeGreaterThan(0.09);
    // Level (within 1.5°) once it is up and carried.
    expect(tiltOf(at('accept', ACCEPT.top))).toBeLessThan((1.5 * Math.PI) / 180);
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
      // Over the rim (the plate reaches past the opening but not past the rim roll): clears it.
      const overRim = d > BIN.opening - PLATE.radius - 0.01 && d < PLATE.radius + BIN.radius + 0.02;
      if (overRim && p.y < BIN.rimTop + 0.3) expect(p.y).toBeGreaterThanOrEqual(BIN.rimTop + DINNER_RIM_CLEARANCE - 0.02);
      if (d < BIN.opening && p.y > BIN.rimTop) expect(Math.abs(lx) + PLATE.radius).toBeLessThan(BIN.hingeX - 0.02);
      // Below the rim the plate is inside the opening, centred to within its clearance.
      if (p.y < BIN.rimTop + 0.05 && d < BIN.radius + PLATE.radius) expect(d).toBeLessThan(BIN.opening - PLATE.radius - 0.01);
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

describe('Dinner runtime GLB matches the contract (plate and cloche masters, no food)', () => {
  it('has every contract node exactly once, and no food', () => {
    for (const n of DINNER_GLB_NODES) expect(() => node(n), n).not.toThrow();
    const names: string[] = [];
    doc.getRoot().listNodes().forEach((n) => names.push(n.getName()));
    expect(names.filter((n) => /food|pasta|veg|tray/.test(n))).toEqual([]);
    expect(DISH_SCALE).toBeCloseTo(0.8399, 4);
  });

  it('the plate is the master at the v1.1 diameter: underside at the origin, flat well, gilt rim on top', () => {
    const b = boxIn(node('plate_secondary'), node('plate_authored'));
    expect(Math.abs(b.min.y)).toBeLessThan(0.0005);
    expect(Math.max(b.max.x, -b.min.x, b.max.z, -b.min.z)).toBeCloseTo(PLATE.radius, 3);
    expect(b.max.y).toBeCloseTo(PLATE.rimHeight, 3);
    const gilt = boxIn(node('plate_gilt'), node('plate_authored'));
    expect(gilt.max.y).toBeCloseTo(PLATE.rimHeight, 3);
    // The flat well and the profile: every top vertex lies under the contract's conservative profile.
    for (let r = 0.02; r < PLATE.wellRadius; r += 0.02) expect(plateSurface(r)).toBeCloseTo(PLATE.well, 3);
    for (const v of plateVerts) expect(v.y, `r ${Math.hypot(v.x, v.z)}`).toBeLessThanOrEqual(plateTop(Math.hypot(v.x, v.z)) + 0.0002);
  });

  it('the cover is the cloche’s dome assembly with its pivot at the rim centre; seated, its bead rests on the plate inside the gilt band', () => {
    const cover = node('cover_authored');
    expect(new Vector3(...cover.getTranslation()).distanceTo(COVER_SEATED)).toBeLessThan(1e-4);
    const b = boxIn(node('cover_secondary'), cover);
    expect(Math.abs(b.min.y)).toBeLessThan(0.0005);
    expect(b.max.y).toBeCloseTo(COVER_TOP, 3);
    expect(Math.max(b.max.x, -b.min.x, b.max.z, -b.min.z)).toBeCloseTo(COVER.radius, 3);
    expect(boxIn(node('cover_mesh'), cover).max.y).toBeCloseTo(COVER.domeHeight, 3);
    // The lowest ring of the bead (it rests and rocks on it) is at lipRadius.
    const lowest = coverVerts.reduce((a, v) => (v.y < a.y ? v : a));
    expect(Math.hypot(lowest.x, lowest.z)).toBeCloseTo(COVER.lipRadius, 2);
    // Seated: touching the plate (no gap, no overlap beyond a bin), well inside the gilt band.
    const seated = coverGap(frameFor('guest-ready', newFrame()));
    expect(seated).toBeGreaterThan(-0.0005);
    expect(seated).toBeLessThan(0.0015);
    expect(COVER.radius).toBeLessThan(PLATE.giltRadius - 0.1);
    // The handle tops the dome; mapped nodes are empty transforms with their meshes on `_mesh`.
    expect(boxIn(node('cover_handle'), cover).max.y).toBeCloseTo(COVER_TOP, 3);
    for (const n of ['cover_mesh', 'cover_handle', 'plate_body', 'plate_gilt']) {
      expect(node(n).getMesh(), n).toBeNull();
      expect(node(`${n}_mesh`).getParentNode()).toBe(node(n));
    }
  });

  it('casts through two proxies (cover, plate); the masters skip the shadow pass', () => {
    expect((node('cover_shadow_proxy').getExtras() as { shadowProxy?: boolean }).shadowProxy).toBe(true);
    expect(node('cover_shadow_proxy').getParentNode()).toBe(node('cover_secondary'));
    expect((node('plate_shadow_proxy').getExtras() as { shadowProxy?: boolean }).shadowProxy).toBe(true);
    for (const n of ['cover_mesh_mesh', 'cover_handle_mesh', 'plate_body_mesh', 'plate_gilt_mesh']) {
      expect((node(n).getExtras() as { noShadowCast?: boolean }).noShadowCast, n).toBe(true);
    }
  });

  it('keeps the masters’ materials (silver and gilt with their own environment) and declares WebP', () => {
    const names = doc.getRoot().listMaterials().map((m) => m.getName()).sort();
    expect(names).toEqual(['cloche_beads', 'cloche_dome', 'cloche_finial', 'cloche_handle', 'fx_shadow_proxy', 'plate_gilt_metal', 'plate_porcelain']);
    for (const m of doc.getRoot().listMaterials()) {
      if (m.getName().startsWith('cloche_') || m.getName() === 'plate_gilt_metal') expect((m.getExtras() as { ownEnv?: number }).ownEnv, m.getName()).toBe(m.getName() === 'cloche_dome' ? 0.9 : m.getName() === 'plate_gilt_metal' ? 1.1 : 0.8);
    }
    // Bead, bands, finial and handle: softened from the master's near-mirror 0.065–0.09.
    for (const name of ['cloche_beads', 'cloche_finial', 'cloche_handle']) {
      expect(doc.getRoot().listMaterials().find((m) => m.getName() === name)!.getRoughnessFactor(), name).toBeCloseTo(0.12, 6);
    }
    const webp = doc.getRoot().listExtensionsUsed().find((e) => e.extensionName === 'EXT_texture_webp');
    expect(webp?.isRequired()).toBe(true);
    for (const t of doc.getRoot().listTextures()) {
      expect(t.getMimeType()).toBe('image/webp');
      expect(listTextureSlots(t)).toContain('metallicRoughnessTexture');
    }
  });
});

describe('Dinner tooling stand-in', () => {
  it('has the rig’s nodes and the contract’s size (lookdev builds it synchronously)', () => {
    const root = buildDinnerGeometry({ lib: plainLibrary() });
    for (const n of DINNER_NODES.filter((n) => !n.startsWith('bin_'))) expect(root.getObjectByName(n), n).toBeTruthy();
    const plate = box(root.getObjectByName('plate_secondary')!);
    expect(Math.max(plate.max.x, -plate.min.x)).toBeCloseTo(PLATE.radius, 2);
    const cover = box(root.getObjectByName('cover_secondary')!);
    expect(Math.max(cover.max.x, -cover.min.x)).toBeCloseTo(COVER.radius, 2);
  });

  it('the bin with open flaps, the carry and the resting cover stay inside the dinner bounds', () => {
    const bin = buildDisposalBin({ lib: plainLibrary() });
    bin.position.copy(DINNER_BIN_POS);
    bin.rotation.y = DINNER_BIN_YAW;
    bin.getObjectByName('bin_flap_l')!.rotation.z = BIN.flapOpen;
    bin.getObjectByName('bin_flap_r')!.rotation.z = -BIN.flapOpen;
    const bounds = dinnerBounds().expandByScalar(1e-6);
    expect(bounds.containsBox(box(bin))).toBe(true);
    for (const d of [new Vector3(COVER.radius, 0, 0), new Vector3(-COVER.radius, 0, 0), new Vector3(0, 0, -COVER.radius)]) {
      expect(bounds.containsPoint(COVER_BESIDE.clone().add(d))).toBe(true);
    }
  });
});

describe('Dinner settle', () => {
  it('the cover settles within 1° by rocking on its rim, never sinking into plate or floor', () => {
    let peak = 0;
    for (const [seq, from, to, rest] of [['host', HOST_FLAT, 1.2, COVER_SEATED], ['accept', ACCEPT.flat, ACCEPT.settled, COVER_BESIDE]] as const) {
      for (let t = from; t <= to; t += 0.001) {
        const f = at(seq, t);
        const tilt = tiltOf(f);
        peak = Math.max(peak, tilt);
        expect(tilt).toBeLessThanOrEqual((1 * Math.PI) / 180);
        expect(skirtLow(f)).toBeGreaterThanOrEqual(rest.y - 1e-6);
        expect(plan(f.coverPos, rest)).toBeLessThan(1e-9);
      }
    }
    expect(peak).toBeGreaterThan(0.005);
  });

  it('every set-down lands the leading rim first, then the trailing side comes down onto it', () => {
    for (const [seq, touch, flat] of [['host', HOST_TOUCH, HOST_FLAT], ['accept', ACCEPT.touch, ACCEPT.flat]] as const) {
      for (let t = touch + 0.005; t < flat - 0.002; t += 0.005) expect(tiltOf(at(seq, t))).toBeGreaterThan(1e-4);
      expect(tiltOf(at(seq, flat))).toBeLessThan(1e-9);
    }
  });
});

describe('Dinner framing (Master §5, recorded disposal exception)', () => {
  it('the covered dish fills at least 42 % of the stage width in the ready pose; the open bin keeps 8 % clearance', () => {
    // The open bin's flaps set the fixed frame; a placement search put the ceiling near 45 %.
    const bin = buildDisposalBin({ lib: plainLibrary() });
    const binPts = openBinFramePoints(bin, DINNER_BIN_POS, DINNER_BIN_YAW);
    const camera = new OrthographicCamera();
    fitCameraToBounds(camera, dinnerBounds(), 1, undefined, [...dinnerFramePoints(), ...binPts]);
    const top = Math.max(...binPts.map((p) => p.clone().applyMatrix4(camera.matrixWorldInverse).y));
    expect((camera.top - top) / (camera.top - camera.bottom)).toBeGreaterThanOrEqual(0.08 - 1e-6);
    const inv = camera.matrixWorldInverse;
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      const p = new Vector3(Math.cos(a) * PLATE.radius, 0, Math.sin(a) * PLATE.radius).applyMatrix4(inv);
      min = Math.min(min, p.x);
      max = Math.max(max, p.x);
    }
    const fill = (max - min) / (camera.right - camera.left);
    expect(fill).toBeGreaterThanOrEqual(0.42);
    expect(fill).toBeLessThanOrEqual(0.75);
  });
});

describe('Dinner motion continuity (checkpoint 4)', () => {
  it('the reveal opens a gap at the guest-side rim by 0.20 s and never stops before it is set down', () => {
    const f = at('accept', 0.2);
    const e = new Euler(f.coverTiltX, 0, f.coverTilt);
    const near = REVEAL_DIR.clone().multiplyScalar(-COVER.lipRadius).applyEuler(e).add(f.coverPos);
    expect(near.y - COVER_SEATED.y).toBeGreaterThan(0.08);
    expect(near.y - COVER_SEATED.y).toBeLessThan(0.16);
    for (let i = 10; i < ACCEPT.flat * 1000; i += 5) {
      const a = at('accept', i / 1000), b = at('accept', (i + 5) / 1000);
      expect(b.coverPos.distanceTo(a.coverPos) + Math.abs(tiltOf(b) - tiltOf(a))).toBeGreaterThan(1e-4);
    }
  });

  it('the host cover never hovers still between aligning and lowering', () => {
    for (let i = 250; i < HOST_FLAT * 1000; i += 5) {
      const a = at('host', i / 1000), b = at('host', (i + 5) / 1000);
      expect(b.coverPos.distanceTo(a.coverPos) + Math.abs(tiltOf(b) - tiltOf(a))).toBeGreaterThan(1e-4);
    }
  });

  it('a straight blend would be clean only while the cover is over the plate (the clearance reference)', () => {
    expect(coverBlendSafe(at('accept', 0.3))).toBe(true);
    expect(coverBlendSafe(at('accept', 0.7))).toBe(false);
    expect(SAFE_SKIRT).toBeGreaterThan(PLATE.rimHeight + 0.25);
  });

  it('the host cover lowers through SAFE_SKIRT as it centres over the plate (0.60 s), without stopping', () => {
    // The level path passes SAFE_SKIRT exactly at 0.60 s.
    expect(coverLowering(0.6, COVER_SEATED.y + 1)).toBeCloseTo(SAFE_SKIRT, 12);
    // The cover itself is centred there, still descending, and (tipped towards its landing rim)
    // its lowest rim point is well clear of the plate's gilt rim.
    const f = at('host', 0.6);
    expect(plan(f.coverPos, COVER_SEATED)).toBeLessThan(0.01);
    expect(at('host', 0.601).coverPos.y).toBeLessThan(f.coverPos.y);
    expect(skirtLow(f)).toBeGreaterThan(PLATE.rimHeight + 0.2);
    expect(skirtLow(f)).toBeLessThan(SAFE_SKIRT);
  });
});

describe('Dinner silver finish at load (finishDish)', () => {
  it('turns the dome into an anisotropic physical metal, keeping its own-environment extras', () => {
    const map = new Texture();
    const dome = new MeshStandardMaterial({ name: 'cloche_dome', color: new Color(0.97, 0.96, 0.915), metalness: 1, roughness: 1, roughnessMap: map, metalnessMap: map });
    dome.userData.ownEnv = 0.9;
    const mesh = new Mesh(new BoxGeometry(), dome);
    const other = new Mesh(new BoxGeometry(), new MeshStandardMaterial({ name: 'cloche_beads', roughness: 0.12 }));
    const root = new Group().add(mesh, other);
    finishDish(root);
    const m = mesh.material as MeshPhysicalMaterial;
    expect(m).toBeInstanceOf(MeshPhysicalMaterial);
    expect(m.name).toBe('cloche_dome');
    expect(m.roughness).toBe(DOME_ROUGHNESS);
    expect(m.roughnessMap).toBeNull();
    expect(m.anisotropy).toBe(DOME_ANISOTROPY);
    expect(m.anisotropyRotation).toBeCloseTo(Math.PI / 2, 12);
    expect(m.metalness).toBe(1);
    expect(m.color.r).toBeCloseTo(0.97, 6);
    expect(m.userData.ownEnv).toBe(0.9);
    expect((other.material as MeshStandardMaterial).roughness).toBe(0.12);
    // Idempotent.
    finishDish(root);
    expect(mesh.material).toBe(m);
  });
});


describe('Dinner change of mind (v1.2.1: rewind along the authored path, no cut)', () => {
  const FRAME = 1 / 60;
  /** Largest 60 fps step of the dish and of the bin over [t0, t1] of a change's playback. */
  const fastest = (c: AnswerChange, t0: number, t1: number) => {
    let prev = sampleAnswerChange(c, t0, newFrame()), dish = 0, bin = 0;
    for (let t = t0 + FRAME; t <= t1 + 1e-9; t += FRAME) {
      const f = sampleAnswerChange(c, t, newFrame());
      dish = Math.max(dish, dishStep(prev, f));
      bin = Math.max(bin, binStep(prev, f));
      prev = f;
    }
    return [dish, bin] as const;
  };

  it('starts on the exact interrupted frame, never jumps, and ends on the new outcome', () => {
    for (const [from, next] of [['accept', 'decline'], ['decline', 'accept']] as const) {
      const [ownDish, ownBin] = outcomePace(from);
      const [nextDish, nextBin] = outcomePace(next);
      for (let a = 0.05; a <= DURATIONS[from] + 1e-9; a += 0.05) {
        const c = planAnswerChange(from, a, a < DURATIONS[from] ? 1 : 0, next);
        const label = `${from}@${a.toFixed(2)} → ${next}`;
        close(sampleAnswerChange(c, 0, newFrame()), at(from, Math.min(a, CONTENT_END[from])));
        expect(c.rewind, label).toBeGreaterThanOrEqual(REWIND.min);
        expect(c.rewind, label).toBeLessThanOrEqual(REWIND.max[next]);
        // The rewind: each part at most REWIND.pace × its own fastest authored frame.
        const [rd, rb] = fastest(c, 0, c.rewind);
        expect(rd, label).toBeLessThanOrEqual(REWIND.pace * ownDish + 1e-3);
        expect(rb, label).toBeLessThanOrEqual(REWIND.pace * Math.max(ownBin, nextBin) + 1e-3);
        // The new outcome after it: its own path, sped up by at most k (≤ 1.25).
        expect(c.k, label).toBeLessThanOrEqual(1.25);
        const [nd, nb] = fastest(c, c.rewind, DURATIONS[next]);
        expect(nd, label).toBeLessThanOrEqual(Math.max(c.k * nextDish, REWIND.pace * ownDish) + 1e-3);
        expect(nb, label).toBeLessThanOrEqual(c.k * Math.max(nextBin, ownBin) + 1e-3);
        close(sampleAnswerChange(c, DURATIONS[next], newFrame()), pose(next === 'accept' ? 'accepted' : 'declined'));
        // The bin never comes in through the returning cover (it sweeps past the reveal's landing spot).
        for (let t = 0; t <= c.rewind + 0.3; t += 0.004) {
          const f = sampleAnswerChange(c, t, newFrame());
          if (f.binVisible && f.platePos.lengthSq() < 1e-9) expect(plan(f.coverPos, f.binPos), `${label} t=${t.toFixed(3)}`).toBeGreaterThanOrEqual(BIN_CLEARANCE - 1e-6);
        }
      }
    }
  });

  it('the mid-reveal change lowers the cover back onto the plate in about 0.25 s along its own path, then declines', () => {
    const c = planAnswerChange('accept', 0.496, 1, 'decline');
    expect(c.rewind).toBeGreaterThanOrEqual(0.15);
    expect(c.rewind).toBeLessThanOrEqual(0.25);
    // It keeps its speed for an instant (no velocity jump), then comes back along the reveal's
    // clear path; the bin comes in meanwhile, and the cover is seated when the dish lifts.
    expect(changeTime(c, 0)[2]).toBeCloseTo(1, 1);
    for (let t = 0; t < c.rewind; t += 0.004) {
      const [seq, s] = changeTime(c, t);
      expect(seq).toBe('accept');
      expect(s).toBeLessThanOrEqual(0.52);
    }
    const seated = sampleAnswerChange(c, c.rewind, newFrame());
    expect(seated.coverPos.distanceTo(COVER_SEATED)).toBeLessThan(1e-6);
    expect(tiltOf(seated)).toBeLessThan(1e-9);
    // The bin starts in only once it cannot sweep through the returning cover.
    expect(c.start).toBeGreaterThan(0.05);
    expect(c.k).toBeLessThan(1.1);
  });

  it('the scene rewinds through the director: accept → decline mid-reveal, back to accept mid-decline, and from the accepted pose', () => {
    const lib = plainLibrary();
    const bin = buildDisposalBin({ lib });
    const plate = new Group(); plate.name = 'plate_authored';
    const cover = new Group(); cover.name = 'cover_authored';
    const root = new Group().add(plate, cover, bin);
    const stub = { setFootprint() {}, setHeight() {}, visible: false };
    const rig = {
      root, nodes: { plate_authored: plate, cover_authored: cover, bin_root: bin }, shadows: [], dishShadow: stub, coverShadow: stub,
      flapL: bin.getObjectByName('bin_flap_l')!, flapR: bin.getObjectByName('bin_flap_r')!, bounds: dinnerBounds(), setPreset() {}, dispose() {},
    } as unknown as DinnerRig;
    const scene = new DinnerScene(rig, { category: 'dinner', dish: 'pasta' });
    const v = new VisualDirector({ complete() {} }, 'guest', null);
    v.attach(scene);
    const snap = () => ({ p: cover.position.clone(), q: cover.quaternion.clone(), d: plate.position.clone() });
    const jump = (a: ReturnType<typeof snap>, b: ReturnType<typeof snap>) => Math.max(a.p.distanceTo(b.p) + a.q.angleTo(b.q), a.d.distanceTo(b.d));
    const limit = REWIND.pace * Math.max(outcomePace('accept')[0], outcomePace('decline')[0]) * 1.25;
    const run = (from: number, to: number) => {
      let prev = snap(), max = 0;
      for (let t = from; t <= to + 1e-9; t += FRAME) { v.update(t); const s = snap(); max = Math.max(max, jump(prev, s)); prev = s; }
      return max;
    };
    v.update(0);
    v.setIntent('accept');
    run(FRAME, 0.496);
    const before = snap();
    v.setIntent('decline');
    expect(jump(before, snap())).toBeLessThan(1e-9);
    expect(run(0.496 + FRAME, 0.496 + 0.5)).toBeLessThan(limit);
    // Mid-decline, back to accept: the dish comes back out along its path and the reveal plays.
    const mid = snap();
    v.setIntent('accept');
    expect(jump(mid, snap())).toBeLessThan(1e-9);
    expect(run(0.996 + FRAME, 3)).toBeLessThan(limit);
    expect(v.state).toBe('accepted-pose');
    // From the accepted pose (no playback), a change to decline rewinds the whole reveal.
    const rest = snap();
    v.setIntent('decline');
    expect(jump(rest, snap())).toBeLessThan(1e-9);
    expect(run(3 + FRAME, 5)).toBeLessThan(limit);
    expect(v.state).toBe('declined-pose');
    expect(plate.visible).toBe(false);
    // A replay starts clean from guest-ready (no rewind left over).
    v.replay();
    expect(cover.position.distanceTo(COVER_SEATED)).toBeLessThan(1e-9);
  });
});

describe('Dinner posters (one shared set, no food)', () => {
  it('ships exactly the four shared posters: no per-dish (v1.1 food) poster can shadow them', async () => {
    const { readdirSync } = await import('node:fs');
    const files = readdirSync(join(import.meta.dirname, '..', 'assets', 'scenes', 'dinner', 'posters')).filter((f) => !f.startsWith('.')).sort();
    expect(files).toEqual(['shared-accepted.webp', 'shared-declined.webp', 'shared-guest-ready.webp', 'shared-host-ready.webp']);
  });
});
