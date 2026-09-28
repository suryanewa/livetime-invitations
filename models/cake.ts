import { Box3, BufferAttribute, BufferGeometry, type MeshStandardMaterial, SphereGeometry, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ContactShadow } from '../src/render/contactShadow.ts';
import { cylinderBand, group, lathe, mesh } from './geometry.ts';
import { collectNodes, disposeGeometry, type BuiltModel, type ModelContext } from './types.ts';

export type CakePreset = 'vanilla' | 'cocoa';

export const CAKE_NODES = [
  'birthday_root', 'tray', 'cake_authored', 'cake_secondary',
  'candle_01', 'candle_02', 'candle_03', 'flame_01', 'flame_02', 'flame_03', 'cake_shadow',
] as const;

/** Candle sockets on the cake top (x, z), staggered so none occlude from the shared camera. */
export const CANDLE_SOCKETS: [number, number][] = [
  [-0.34, 0.1],
  [0.02, -0.22],
  [0.36, 0.12],
];

export const TRAY_TOP = 0.085;

/** Ring of small beads — a piped frosting border in one draw call. */
function beadRing(radius: number, y: number, count: number, size: number): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const s = new SphereGeometry(size, 12, 8);
    s.scale(1, 0.82, 1.15);
    s.rotateY(-a);
    s.translate(Math.cos(a) * radius, y, Math.sin(a) * radius);
    parts.push(s);
  }
  const merged = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  return merged;
}

/**
 * Glossy drip cap for the fuller Enamel cake: covers the top and falls over the edge in
 * deterministic drips. Tucks back to the cake surface at its lower edge so it has thickness.
 */
function dripCap(radius: number, height: number, fillet: number): BufferGeometry {
  const radial = 256;
  const topRings = 10;
  const edgeRings = 6;
  const sideRings = 18;
  const t = 0.02;
  // Deterministic drip layout.
  const drips = [
    [0.1, 0.16], [0.55, 0.26], [0.95, 0.12], [1.4, 0.3], [1.85, 0.18], [2.3, 0.1], [2.75, 0.24],
    [3.2, 0.14], [3.6, 0.28], [4.05, 0.12], [4.5, 0.22], [4.95, 0.16], [5.4, 0.26], [5.85, 0.13],
  ] as const;
  const dripLength = (a: number) => {
    let L = 0.05;
    for (const [c, len] of drips) {
      let d = Math.abs(a - c);
      d = Math.min(d, Math.PI * 2 - d);
      // Rounded drip: a capsule-ended tongue, not a pointed icicle.
      const w = 0.13;
      if (d < w) L = Math.max(L, 0.05 + len * Math.sqrt(1 - (d / w) ** 2));
    }
    return L;
  };
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
    rows.push((a) => [radius + t * (i === sideRings ? 0.15 : 1), height - fillet - dripLength(a) * s]);
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
  const { lib } = ctx;
  const dir = lib.direction;
  const full = dir.geometry.fullness;
  const enamel = dir.signature.kind === 'perforation';

  const root = group('birthday_root');

  // Tray: shallow lip, vertical outer wall that carries the signature band.
  const trayR = 1.2;
  const tray = mesh(
    'tray',
    lathe([
      [0, 0], [trayR - 0.03, 0, 0.02], [trayR, 0.02, 0.015], [trayR, 0.1, 0.02],
      [trayR - 0.07, 0.11, 0.025], [trayR - 0.1, TRAY_TOP, 0.02], [0, TRAY_TOP],
    ], 96),
    lib.get('mat_tray'),
    root,
  );
  const band = mesh('tray_signature', cylinderBand(trayR + 0.002, 0.05, enamel ? 0.05 : 0.2), lib.get(enamel ? 'mat_signature' : 'mat_signature_light'), tray);
  band.position.y = 0.058;

  const cakeAuthored = group('cake_authored', root);
  cakeAuthored.position.y = TRAY_TOP;
  const cakeSecondary = group('cake_secondary', cakeAuthored);

  const R = 0.8 * full;
  const H = 0.64;
  const fillet = enamel ? 0.12 : 0.08;
  const frosting = lib.get(preset === 'vanilla' ? 'mat_frosting_vanilla' : 'mat_frosting_cocoa');
  mesh('cake_body', lathe([[0, 0], [R, 0, 0.012], [R, H, fillet], [0, H]], 96, 8), frosting, cakeSecondary);

  if (enamel) {
    const drip = lib.unique(preset === 'vanilla' ? 'mat_frosting_vanilla' : 'mat_frosting_cocoa') as MeshStandardMaterial;
    drip.color.set(preset === 'vanilla' ? '#FFF7EA' : '#3A2219');
    drip.roughness = preset === 'vanilla' ? 0.38 : 0.28;
    mesh('cake_drip', dripCap(R, H, fillet), drip, cakeSecondary);
    mesh('cake_border_base', beadRing(R + 0.01, 0.035, 40, 0.052), frosting, cakeSecondary);
  } else {
    mesh('cake_border_top', beadRing(R - 0.045, H - 0.005, 40, 0.042), frosting, cakeSecondary);
    mesh('cake_border_base', beadRing(R + 0.012, 0.03, 44, 0.044), frosting, cakeSecondary);
  }

  // Candles: fixed three, inserted to a consistent depth.
  const candleH = 0.36;
  const candleR = 0.046;
  const insert = 0.05;
  CANDLE_SOCKETS.forEach(([x, z], i) => {
    const id = String(i + 1).padStart(2, '0');
    const candle = group(`candle_${id}`, cakeSecondary);
    candle.position.set(x, H - insert, z);
    mesh(
      `candle_${id}_wax`,
      lathe([[0, 0], [candleR, 0, 0.004], [candleR, candleH, 0.018], [candleR * 0.55, candleH - 0.012, 0.004], [0, candleH - 0.014]], 24, 4),
      lib.get(`mat_candle_${i + 1}`),
      candle,
    );
    mesh('wick', lathe([[0, 0], [0.008, 0, 0], [0.007, 0.055, 0.004], [0, 0.058]], 8, 2), lib.get('mat_wick'), candle).position.y = candleH - 0.018;

    const flame = group(`flame_${id}`, candle);
    flame.position.y = candleH + 0.03;
    const outer = mesh(
      `flame_${id}_mesh`,
      lathe([[0, 0], [0.026, 0.016, 0.02], [0.036, 0.048, 0.03], [0.02, 0.105, 0.025], [0, 0.16]], 20, 6),
      lib.unique('mat_flame_outer'),
      flame,
    );
    outer.renderOrder = 2;
  });

  const shadow = new ContactShadow({ name: 'cake_shadow', width: trayR * 2.5, depth: trayR * 2.5, opacity: dir.shadow.opacity, color: dir.shadow.color });
  root.add(shadow);

  const bounds = new Box3(new Vector3(-trayR, 0, -trayR), new Vector3(trayR, H + TRAY_TOP + candleH + 0.2, trayR));
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
