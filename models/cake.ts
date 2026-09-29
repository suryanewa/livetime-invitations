import { Box3, BufferAttribute, BufferGeometry, CylinderGeometry, type Mesh, type MeshStandardMaterial, type Object3D, SphereGeometry, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ContactShadow } from '../src/render/contactShadow.ts';
import type { DirectionId } from '../src/render/materials.ts';
import {
  dripLayout,
  glazeCap,
  instances,
  mergeIndexed,
  orient,
  pearls,
  pedestalStand,
  rng,
  shellBorder,
  spiralCandle,
  starDrop,
  swags,
  tierBody,
  wickGeometry,
} from './cakeParts.ts';
import { cylinderBand, group, lathe, mergeParts, mesh } from './geometry.ts';
import { applyShadowProxies, markNoShadowCast, markShadowProxy } from './shadowProxy.ts';
import { collectNodes, disposeGeometry, type BuiltModel, type ModelContext } from './types.ts';

export type CakePreset = 'vanilla' | 'cocoa';

export const CAKE_NODES = [
  'birthday_root', 'tray', 'cake_authored', 'cake_secondary',
  'candle_01', 'candle_02', 'candle_03', 'flame_01', 'flame_02', 'flame_03', 'cake_shadow',
] as const;

/**
 * Cake dimensions per construction. `premium` (direction L2) is a two-tier vintage-piped cake
 * on a turned pedestal stand; `standard` (A/B/L) is the checkpoint-2 single tier on a tray.
 * All heights are scene units: trayTop from the floor, cakeHeight from the tray/stand top.
 */
export interface CakeMetrics {
  trayTop: number;
  trayRadius: number;
  cakeHeight: number;
  candleHeight: number;
  candleInsert: number;
  /** Candle sockets on the cake top (x, z), staggered so none occlude from the shared camera. */
  sockets: [number, number][];
}

const STANDARD: CakeMetrics = {
  trayTop: 0.085,
  trayRadius: 1.2,
  cakeHeight: 0.64,
  candleHeight: 0.36,
  candleInsert: 0.05,
  sockets: [[-0.34, 0.1], [0.02, -0.22], [0.36, 0.12]],
};

/** Premium tiers (cake_secondary space; the lower tier stands on the stand top). */
export const PREMIUM_TIERS = {
  lower: { radius: 0.72, height: 0.44 },
  upper: { radius: 0.5, height: 0.36 },
  glaze: 0.022,
} as const;

const PREMIUM: CakeMetrics = {
  trayTop: 0.7,
  trayRadius: 1.0,
  cakeHeight: PREMIUM_TIERS.lower.height + PREMIUM_TIERS.upper.height,
  candleHeight: 0.34,
  candleInsert: 0.05,
  sockets: [[-0.26, 0.05], [-0.05, -0.2], [0.27, 0.09]],
};

export const CAKE_METRICS = { standard: STANDARD, premium: PREMIUM } as const;

export function cakeMetrics(direction: DirectionId): CakeMetrics {
  return direction === 'L2' ? PREMIUM : STANDARD;
}

/**
 * Named exports describe the premium (L2) cake on its pedestal stand. Directions A/B/L keep
 * the checkpoint-2 tray cake; use cakeMetrics(direction) when the direction can vary.
 */
export const CANDLE_SOCKETS: [number, number][] = PREMIUM.sockets;
export const TRAY_TOP = PREMIUM.trayTop;
export const TRAY_RADIUS = PREMIUM.trayRadius;
export const CAKE_HEIGHT = PREMIUM.cakeHeight;
export const CANDLE_HEIGHT = PREMIUM.candleHeight;
export const CANDLE_INSERT = PREMIUM.candleInsert;

// ── Standard construction (A / B / L, unchanged from checkpoint 2) ───────────

/** Ring of small beads — a piped frosting border in one draw call. */
function beadRing(radius: number, y: number, count: number, size: number): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const s = new SphereGeometry(size, 10, 6);
    s.scale(1, 0.82, 1.15);
    s.rotateY(-a);
    s.translate(Math.cos(a) * radius, y, Math.sin(a) * radius);
    parts.push(s);
  }
  const merged = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  return merged;
}

/** Deterministic drip layout: [angle, extra length]. */
const DRIPS = [
  [0.1, 0.16], [0.55, 0.26], [0.95, 0.12], [1.4, 0.3], [1.85, 0.18], [2.3, 0.1], [2.75, 0.24],
  [3.2, 0.14], [3.6, 0.28], [4.05, 0.12], [4.5, 0.22], [4.95, 0.16], [5.4, 0.26], [5.85, 0.13],
] as const;

function dripLength(a: number): number {
  let L = 0.05;
  for (const [c, len] of DRIPS) {
    let d = Math.abs(a - c);
    d = Math.min(d, Math.PI * 2 - d);
    // Rounded tongue: capsule-ended, never a pointed icicle.
    const w = 0.13;
    if (d < w) L = Math.max(L, 0.05 + len * Math.sqrt(1 - (d / w) ** 2));
  }
  return L;
}

/**
 * Glaze cap: covers the top and falls over the edge in deterministic drips. The lower
 * edge rolls back to the cake surface over its last rings, giving a convex rounded lip.
 */
function dripCap(radius: number, height: number, fillet: number, radial = 160): BufferGeometry {
  const topRings = 8;
  const edgeRings = 6;
  const sideRings = 14;
  const t = 0.02;
  const rows: Array<(a: number) => [number, number]> = [];
  for (let i = 0; i <= topRings; i++) {
    const r = ((radius - fillet) * i) / topRings;
    rows.push(() => [r, height + t]);
  }
  for (let i = 1; i <= edgeRings; i++) {
    const th = (i / edgeRings) * (Math.PI / 2);
    rows.push(() => [radius - fillet + Math.sin(th) * (fillet + t), height - fillet + Math.cos(th) * (fillet + t)]);
  }
  for (let i = 1; i <= sideRings; i++) {
    const s = i / sideRings;
    rows.push((a) => {
      const L = dripLength(a);
      // Last 25%: roll the lip inward on a quarter circle so the tip is rounded.
      const roll = Math.max(0, (s - 0.75) / 0.25);
      const r = radius + t * Math.cos((roll * Math.PI) / 2);
      const y = height - fillet - (L * Math.min(s, 0.75)) / 0.75 - t * 0.9 * Math.sin((roll * Math.PI) / 2);
      return [r, y];
    });
  }
  const pos: number[] = [];
  const idx: number[] = [];
  for (let r = 0; r < rows.length; r++) {
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const [rad, y] = rows[r]!(a);
      pos.push(Math.cos(a) * rad, y, Math.sin(a) * rad);
    }
  }
  for (let r = 0; r < rows.length - 1; r++) {
    for (let j = 0; j < radial; j++) {
      const a = r * (radial + 1) + j;
      const b = a + radial + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildCake(ctx: ModelContext, preset: CakePreset = 'vanilla'): BuiltModel {
  return ctx.lib.direction.id === 'L2' ? buildPremiumCake(ctx, preset) : buildStandardCake(ctx, preset);
}

function buildStandardCake(ctx: ModelContext, preset: CakePreset): BuiltModel {
  const { lib } = ctx;
  const dir = lib.direction;
  const drip = dir.style.cake === 'drip';
  const perforated = dir.signature.kind === 'perforation';
  const full = dir.geometry.fullness;
  const lean = dir.id === 'L';
  const { trayTop, trayRadius, cakeHeight, candleHeight, candleInsert, sockets } = STANDARD;

  const root = group('birthday_root');

  // Tray: shallow lip, vertical outer wall that carries the signature band.
  const trayR = trayRadius;
  const tray = mesh(
    'tray',
    lathe([
      [0, 0], [trayR - 0.03, 0, 0.02], [trayR, 0.02, 0.015], [trayR, 0.1, 0.02],
      [trayR - 0.07, 0.11, 0.025], [trayR - 0.1, trayTop, 0.02], [0, trayTop],
    ], lean ? 72 : 96),
    lib.get('mat_tray'),
    root,
  );
  const band = mesh('tray_signature', cylinderBand(trayR + 0.002, 0.05, perforated ? 0.05 : 0.2, lean ? 128 : 96), lib.get(perforated ? 'mat_signature' : 'mat_signature_light'), tray);
  band.position.y = 0.058;

  const cakeAuthored = group('cake_authored', root);
  cakeAuthored.position.y = trayTop;
  const cakeSecondary = group('cake_secondary', cakeAuthored);

  const R = 0.8 * full;
  const H = cakeHeight;
  const fillet = drip ? 0.12 : 0.08;
  const frosting = lib.get(preset === 'vanilla' ? 'mat_frosting_vanilla' : 'mat_frosting_cocoa');
  mesh('cake_body', lathe([[0, 0], [R, 0, 0.012], [R, H, fillet], [0, H]], lean ? 72 : 96, 8), frosting, cakeSecondary);

  if (drip) {
    const glazeName = preset === 'vanilla' ? 'mat_glaze_vanilla' : 'mat_glaze_cocoa';
    let glaze = dir.surfaces[glazeName] ? lib.get(glazeName) : null;
    if (!glaze) {
      const m = lib.unique(preset === 'vanilla' ? 'mat_frosting_vanilla' : 'mat_frosting_cocoa') as MeshStandardMaterial;
      m.color.set(preset === 'vanilla' ? '#FFF7EA' : '#3A2219');
      m.roughness = preset === 'vanilla' ? 0.38 : 0.28;
      glaze = m;
    }
    mesh('cake_drip', dripCap(R, H, fillet, lean ? 160 : 256), glaze, cakeSecondary);
    mesh('cake_border_base', beadRing(R + 0.01, 0.035, lean ? 34 : 40, 0.052), frosting, cakeSecondary);
  } else {
    mesh('cake_border_top', beadRing(R - 0.045, H - 0.005, 40, 0.042), frosting, cakeSecondary);
    mesh('cake_border_base', beadRing(R + 0.012, 0.03, 44, 0.044), frosting, cakeSecondary);
  }

  // Candles: fixed three, inserted to a consistent depth.
  const candleR = 0.046;
  sockets.forEach(([x, z], i) => {
    const id = String(i + 1).padStart(2, '0');
    const candle = group(`candle_${id}`, cakeSecondary);
    candle.position.set(x, H - candleInsert, z);
    mesh(
      `candle_${id}_wax`,
      lathe([[0, 0], [candleR, 0, 0.004], [candleR, candleHeight, 0.018], [candleR * 0.55, candleHeight - 0.012, 0.004], [0, candleHeight - 0.014]], 24, 4),
      lib.get(`mat_candle_${i + 1}`),
      candle,
    );
    mesh('wick', lathe([[0, 0], [0.008, 0, 0], [0.007, 0.055, 0.004], [0, 0.058]], 8, 2), lib.get('mat_wick'), candle).position.y = candleHeight - 0.018;

    const flame = group(`flame_${id}`, candle);
    flame.position.y = candleHeight + 0.03;
    if (lean) flame.scale.setScalar(0.82);
    const outer = mesh(
      `flame_${id}_mesh`,
      lathe([[0, 0], [0.026, 0.016, 0.02], [0.036, 0.048, 0.03], [0.02, 0.105, 0.025], [0, 0.16]], 20, 6),
      lib.unique('mat_flame_outer'),
      flame,
    );
    outer.renderOrder = 2;
  });

  const shadow = new ContactShadow({
    name: 'cake_shadow', width: trayR * 2, depth: trayR * 2, spread: [1.14, 1.3],
    opacity: dir.shadow.opacity, line: 0.42, color: dir.shadow.color,
  });
  root.add(shadow);

  const bounds = new Box3(new Vector3(-trayR, 0, -trayR), new Vector3(trayR, H + trayTop + candleHeight + 0.2, trayR));
  return {
    root,
    nodes: collectNodes(root, CAKE_NODES),
    shadows: [shadow],
    bounds,
    dispose() {
      disposeGeometry(root);
      shadow.dispose();
    },
  };
}

// ── Premium construction (L2) ────────────────────────────────────────────────

export const FLAME_SCALE = 0.8;
export const STAND_FOOT = 0.42;

/**
 * Two-tier vintage-piped cake on a turned cobalt pedestal (fidelity pass). The lower tier
 * carries draped garlands with rosettes and pearls over a shell base border; a shell border
 * seats the upper tier, which wears a poured glaze with rounded drips and a crown of
 * swirled star drops. Spiral candles in coral, cobalt and butter. The perforated band stays
 * on the stand's rim wall (manufactured support), never on the food.
 *
 * Draw calls: stand, band, frosting, glaze, pearls, 3 candles, 3 wicks, 3 flames, shadow.
 */
/**
 * Premium cake geometry and named nodes only (exported to GLB). Runtime parts — contact
 * shadow, unique flame materials, wisps, preset swaps — are added by the Birthday rig.
 */
export function buildCakeGeometry(ctx: ModelContext, preset: CakePreset = 'vanilla'): Object3D {
  const { lib } = ctx;
  const { trayTop, trayRadius, cakeHeight, candleHeight, candleInsert, sockets } = PREMIUM;
  const { lower, upper, glaze: glazeT } = PREMIUM_TIERS;

  const root = group('birthday_root');

  // Stand (the reusable support that stays behind on decline).
  const stand = pedestalStand({ radius: trayRadius, top: trayTop, foot: STAND_FOOT });
  const tray = mesh('tray', stand.body, lib.get('mat_tray'), root);
  const band = mesh('tray_signature', cylinderBand(stand.band.radius, stand.band.height, stand.band.height, 144), lib.get('mat_signature'), tray);
  band.position.y = stand.band.y;
  markNoShadowCast(tray, band);
  // Low-poly stand silhouette casts the stand's shadow (the turned profile is 5.5k triangles).
  markShadowProxy(mesh('tray_shadow_proxy', lathe([[0, 0], [STAND_FOOT, 0], [STAND_FOOT * 0.55, 0.12], [0.075, 0.3], [0.075, trayTop - 0.1], [trayRadius, trayTop - 0.03], [trayRadius, trayTop], [0, trayTop]], 32, 0), lib.get('mat_tray'), root));

  const cakeAuthored = group('cake_authored', root);
  cakeAuthored.position.y = trayTop;
  const cakeSecondary = group('cake_secondary', cakeAuthored);

  const frosting = lib.get(preset === 'vanilla' ? 'mat_frosting_vanilla' : 'mat_frosting_cocoa');
  const glazeMat = lib.get(preset === 'vanilla' ? 'mat_glaze_vanilla' : 'mat_glaze_cocoa');
  const pearlMat = lib.get('mat_glaze_vanilla');

  const H1 = lower.height;
  const top = cakeHeight;
  const glazeTop = top + glazeT;

  // Frosting: both tiers and all piping in one draw call.
  const garland = swags({ radius: lower.radius, y: H1 - 0.075, count: 9, depth: 0.12, thickness: 0.02, phase: 0.2 });
  const rosetteAt = garland.anchors.map((p, k) => {
    const out = new Vector3(p.x, 0.25, p.z).normalize();
    const at = new Vector3(p.x, 0, p.z).setLength(lower.radius - 0.006);
    at.y = p.y + 0.004;
    return orient(out, at, k * 0.7);
  });
  const crownCount = 12;
  const crownR = upper.radius - 0.09;
  const rand = rng(3);
  const crownAt = Array.from({ length: crownCount }, (_, k) => {
    const a = ((k + 0.5) / crownCount) * Math.PI * 2;
    return orient(new Vector3(0, 1, 0), new Vector3(Math.cos(a) * crownR, glazeTop - 0.004, -Math.sin(a) * crownR), rand() * 6.28 - a);
  });
  const frostingGeo = mergeIndexed([
    tierBody(lower.radius, lower.height, 0.035, 0),
    tierBody(upper.radius, upper.height, 0.05, H1, false),
    shellBorder({ radius: lower.radius, y: 0, count: 26, size: 0.052, along: 7, cross: 10 }),
    shellBorder({ radius: upper.radius, y: H1, count: 20, size: 0.043, along: 6, cross: 8, phase: 0.5 }),
    garland.geometry,
    instances(starDrop({ radius: 0.034, height: 0.034, flutes: 5, radial: 15, rows: 4, twist: 1.1, curl: 0.05 }), rosetteAt),
    instances(starDrop({ radius: 0.058, height: 0.086, flutes: 6, radial: 24, rows: 7, twist: 1.5, curl: 0.25 }), crownAt),
  ]);
  const cakeBody = mesh('cake_body', frostingGeo, frosting, cakeSecondary);

  // Poured glaze on the upper tier.
  const drips = dripLayout(14, upper.radius, 0.21, 5);
  const cakeDrip = mesh('cake_drip', glazeCap({ radius: upper.radius, top, fillet: 0.05, thickness: glazeT, base: 0.03, drips }), glazeMat, cakeSecondary);

  // Sugar pearls: between the crown drops, under each garland rosette and each garland's low point.
  const pearlPts: Vector3[] = [];
  for (let k = 0; k < crownCount; k++) {
    const a = (k / crownCount) * Math.PI * 2;
    pearlPts.push(new Vector3(Math.cos(a) * (crownR + 0.01), glazeTop + 0.012, -Math.sin(a) * (crownR + 0.01)));
  }
  for (const p of garland.anchors) {
    const q = new Vector3(p.x, 0, p.z).setLength(lower.radius + 0.012);
    q.y = p.y - 0.05;
    pearlPts.push(q);
  }
  for (const p of garland.lows) {
    const q = new Vector3(p.x, 0, p.z).setLength(lower.radius + 0.01);
    q.y = p.y - 0.04;
    pearlPts.push(q);
  }
  const cakePearls = mesh('cake_pearls', pearls(pearlPts, 0.016), pearlMat, cakeSecondary);
  markNoShadowCast(cakeBody, cakeDrip, cakePearls);
  // Two stacked cylinders plus the candles cast the cake's shadow: ≈400 triangles, not 26k.
  const proxyParts = [
    { geometry: new CylinderGeometry(lower.radius + 0.03, lower.radius + 0.05, H1, 28), position: [0, H1 / 2, 0] as [number, number, number] },
    { geometry: new CylinderGeometry(upper.radius + 0.01, upper.radius + 0.02, upper.height + glazeT, 24), position: [0, H1 + (upper.height + glazeT) / 2, 0] as [number, number, number] },
    ...sockets.map(([x, z]) => ({ geometry: new CylinderGeometry(0.034, 0.034, candleHeight, 8), position: [x, top - candleInsert + candleHeight / 2, z] as [number, number, number] })),
  ];
  markShadowProxy(mesh('cake_shadow_proxy', mergeParts(proxyParts), frosting, cakeSecondary));

  // Candles: fixed three, inserted to a consistent depth through the glaze.
  const candleR = 0.034;
  sockets.forEach(([x, z], i) => {
    const id = String(i + 1).padStart(2, '0');
    const candle = group(`candle_${id}`, cakeSecondary);
    candle.position.set(x, top - candleInsert, z);
    const wax = mesh(`candle_${id}_wax`, spiralCandle(candleR, candleHeight), lib.get(`mat_candle_${i + 1}`), candle);
    wax.rotation.y = i * 1.3;
    const wick = mesh(`wick_${id}`, wickGeometry(0.052, 0.0062), lib.get('mat_wick'), candle);
    wick.position.y = candleHeight - 0.012;
    markNoShadowCast(wax, wick);

    const flame = group(`flame_${id}`, candle);
    flame.position.y = candleHeight + 0.028;
    flame.scale.setScalar(FLAME_SCALE);
    const outer = mesh(
      `flame_${id}_mesh`,
      lathe([[0, 0], [0.026, 0.016, 0.02], [0.036, 0.048, 0.03], [0.02, 0.105, 0.025], [0, 0.16]], 14, 4),
      lib.get('mat_flame_outer'),
      flame,
    );
    outer.renderOrder = 2;
  });

  group('cake_shadow', root).position.set(0, 0.002, 0);
  return root;
}

/** Premium cake for tooling (lookdev, study): geometry plus a contact shadow and unique flames. */
function buildPremiumCake(ctx: ModelContext, preset: CakePreset): BuiltModel {
  const { lib } = ctx;
  const dir = lib.direction;
  const { trayTop, trayRadius, candleHeight, candleInsert } = PREMIUM;
  const top = PREMIUM.cakeHeight;
  const root = buildCakeGeometry(ctx, preset);
  applyShadowProxies(root);
  root.traverse((o) => {
    const m = o as Mesh;
    if (m.isMesh && /^flame_\d\d_mesh$/.test(m.name)) m.material = lib.unique('mat_flame_outer');
  });
  root.getObjectByName('cake_shadow')?.removeFromParent();

  // Contact shadow sized from the foot; the soft layer spreads to the plate's footprint.
  const shadow = new ContactShadow({
    name: 'cake_shadow', width: STAND_FOOT * 2, depth: STAND_FOOT * 2, spread: [1.9, 2.1],
    opacity: dir.shadow.opacity, line: 0.42, color: dir.shadow.color,
  });
  root.add(shadow);

  const flameTop = candleHeight + 0.028 + 0.16 * FLAME_SCALE;
  const bounds = new Box3(
    new Vector3(-trayRadius, 0, -trayRadius),
    new Vector3(trayRadius, trayTop + top - candleInsert + flameTop + 0.03, trayRadius),
  );
  return {
    root,
    nodes: collectNodes(root, CAKE_NODES),
    shadows: [shadow],
    bounds,
    dispose() {
      disposeGeometry(root);
      shadow.dispose();
    },
  };
}
