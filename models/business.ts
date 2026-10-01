import {
  type Box3,
  CustomBlending,
  OneFactor,
  OneMinusSrcAlphaFactor,
  BufferAttribute,
  BufferGeometry,
  Color,
  type Material,
  type Mesh,
  MeshStandardMaterial,
  type Object3D,
  PointLight,
  Shape,
  ShapeGeometry,
  Vector3,
} from 'three';
import { ContactShadow } from '../src/render/contactShadow.ts';
import { mesh } from './geometry.ts';
import type { MaterialVariants } from './imported.ts';
import { LanyardStrand } from './lanyard.ts';
import {
  BUSINESS_BOUNDS, BUSINESS_NODES, CARD, CARD_OFFSET_Y, D_RING, FACE, HANG_PIVOT, LANYARD_SPREAD, LANYARD_TOP_Y, READER, READER_SCALE, SCANNER_POS,
  STATUS_TILE, STRAP, STRAP_TAB_TOP, type CardTemplate,
} from './businessContract.ts';
import { collectNodes, type ModelContext } from './types.ts';

export * from './businessContract.ts';
export { buildBusinessFrame } from './businessFrame.ts';

/**
 * Business v1.2 on the scan-to-CAD masters.
 *
 * `buildBusinessFrame` is the recipe's builder (scripts/masters/recipes/business.ts): only the
 * scene's empty contract nodes. Everything visible comes from the badge and reader masters.
 * `rigBusiness` is the runtime rig over the loaded GLB: the runtime strap (the master's woven
 * strap material on the existing curve rig, plus a sewn tab folded round the D-ring's bar), the
 * reader's LED status light and its spill, the gasket press, contact shadows and the dark
 * template (KHR_materials_variants).
 */

export type StatusLit = 'off' | 'accept' | 'decline';

/** What the Business scene drives: the master rig here, or the v1.1 keycard rig (lookdev). */
export interface BusinessRig {
  root: Object3D;
  nodes: Record<string, Object3D>;
  shadows: ContactShadow[];
  bounds: Box3;
  /** Hinged hook gate (rotation about x), or null. */
  gate: Object3D | null;
  /** Recompute strap curves from the anchor and the clip's current world transform. */
  updateLanyard(): void;
  setTemplate(template: CardTemplate): void;
  /** Status light: which colour, and how far up its short rise it is (0–1). */
  setStatus(lit: StatusLit, level: number): void;
  /** Scan press: how far the glass gives (stage units, ≥ 0). */
  setPress(depth: number): void;
  dispose(): void;
}

/**
 * Status light (premium, no bloom, Master §5): the LED bar glows by emission in the status
 * token, its halo (the master's led_glow quad) fades in over it and the spill light tints the
 * card. Green sits brighter than red, so the two differ in value as well as hue.
 */
export const STATUS_COLOURS = { accept: '#3BE08A', decline: '#E53E3E' } as const;
export const GLOW = {
  /** LED bar emissive intensity per status (below tone-mapping compression). */
  led: { accept: 1, decline: 0.85 },
  /** Halo opacity and emissive intensity. */
  halo: { opacity: 0.9, intensity: 0.75 },
  /** Status tile emissive intensity per status (below tone-mapping compression, like the LED). */
  tile: { accept: 0.72, decline: 0.66 },
  /** Spill light intensity (tints the card at the scan beat without washing its print). */
  spill: 0.18,
} as const;
/**
 * Spill light, face space: below the glass, out along the normal, under the status tile. The
 * camera sees the face nearly along its normal (3.4° above it), so a point light's mirror image in
 * the glossy glass lands just below the light: here on the steel lip under the glass, never on the
 * glass. From there it warms the pressed card's lower edge in the status colour. (v1.2 hung it
 * above the LED; with the card now pressed high, that lit the clip hardware green.)
 */
export const STATUS_SPILL = { v: STATUS_TILE.v, out: 0.16, distance: 1.6 } as const;
/**
 * Status tile glyphs (tile space, stage units, y up): a check for accept and a minus for decline,
 * stroked in the reader's glass black across the lit tile, so the outcome reads by shape too.
 */
export const STATUS_GLYPHS = {
  accept: [[-0.056, 0.002], [-0.02, -0.036], [0.058, 0.044]] as [number, number][],
  decline: [[-0.058, 0], [0.058, 0]] as [number, number][],
} as const;
/** Idle LED lens (off): a neutral dark, not the master's green tint, so idle never reads as "accepted". */
const LED_OFF = new Color(0.018, 0.02, 0.019);

/**
 * Sewn strap tab: the master strap folded round the D-ring's top bar, both layers sewn together
 * up to STRAP_TAB_TOP (the master's bar-tack stitching sits on it). Clip space, box section.
 */
export function strapTabGeometry(): BufferGeometry {
  // A hair wider and thicker than the strands, whose ends tuck STRAP_TUCK into it (no coplanar faces).
  const width = STRAP.width + TAB_INFLATE * 2, thickness = STRAP.thickness + TAB_INFLATE * 2, weaveTile = STRAP.weaveTile;
  const layer = STRAP.layerZ; // layer centre off the mid-plane (master: ±0.0052 scan)
  const bar = D_RING.topY, r = D_RING.wire + thickness / 2;
  // Centreline in (y, z): front layer down, over the bar top, back layer up.
  const pts: [number, number][] = [];
  const leg = (s: number, side: number): [number, number] => [STRAP_TAB_TOP + (bar - STRAP_TAB_TOP) * s, side * (layer + (r - layer) * s * s * (3 - 2 * s))];
  for (let i = 0; i <= 8; i++) pts.push(leg(i / 8, 1));
  for (let i = 1; i < 16; i++) {
    const a = (i / 16) * Math.PI;
    pts.push([bar + Math.sin(a) * r, Math.cos(a) * r]);
  }
  for (let i = 8; i >= 0; i--) pts.push(leg(i / 8, -1));
  const n = pts.length;
  // Four faces (outer, edge +x, inner, edge −x), each with its own vertices for crisp normals.
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  let len = 0;
  const lens = pts.map((p, i) => (i ? (len += Math.hypot(p[0] - pts[i - 1]![0], p[1] - pts[i - 1]![1])) : 0));
  const tangent = (i: number) => {
    const a = pts[Math.max(0, i - 1)]!, b = pts[Math.min(n - 1, i + 1)]!;
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [(b[0] - a[0]) / l, (b[1] - a[1]) / l] as const;
  };
  const hw = width / 2, ht = thickness / 2;
  // Face definitions: [offset along x, offset along section normal, normal x, normal along section normal]
  const faces: [[number, number], [number, number], [number, number]][] = [
    [[-hw, ht], [hw, ht], [0, 1]],
    [[hw, ht], [hw, -ht], [1, 0]],
    [[hw, -ht], [-hw, -ht], [0, -1]],
    [[-hw, -ht], [-hw, ht], [-1, 0]],
  ];
  for (const [a, b, [nx, nn]] of faces) {
    const base = pos.length / 3;
    for (let i = 0; i < n; i++) {
      const [ty, tz] = tangent(i);
      // Section normal: the tangent turned 90° in the y–z plane (points out of the fold).
      const sy = -tz, sz = ty;
      for (const [ox, on] of [a, b]) {
        pos.push(ox, pts[i]![0] + sy * on, pts[i]![1] + sz * on);
        const ny = sy * nn, nz = sz * nn;
        const l = Math.hypot(nx, ny, nz) || 1;
        nor.push(nx / l, ny / l, nz / l);
        uv.push((ox / width + 0.5) * (width / weaveTile), lens[i]! / weaveTile);
      }
    }
    for (let i = 0; i < n - 1; i++) {
      const k = base + i * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  g.setIndex(idx);
  return g;
}

/**
 * The strands start STRAP_TUCK inside the sewn tab, which is TAB_INFLATE larger all round, so
 * their open ends never show at the joint (v1.2 showed a dark wedge there: the inside of the
 * front strand's open end) and the joint stays closed while the strap bends.
 */
export const STRAP_TUCK = 0.03;
const TAB_INFLATE = 0.0008;

/** Mean of the master strap's baked vertex shading (COLOR_0, 0.49–1.0). */
export const STRAP_VERTEX_AO = 0.9;
/**
 * Clear vinyl holder: the GLB carries the recipe's transmission → alpha 0.35 (white at 35 %). As a
 * plain alpha blend that is a white veil over the print (cobalt reads sky blue). A clear sheet
 * adds its reflection and dims what is behind it a little, so the rig draws it that way: no
 * diffuse, reflection added at full strength, 14 % dimming (v1.2.2; 8 % left the rim beyond the
 * card reading milky and paler than the cream stage behind it: a clear sheet's rim reads a shade
 * darker than what it covers, with the softbox's edge highlight on it).
 */
export const VINYL = { dimming: 0.14 } as const;

/** Strap layers leave the sewn tab at these clip-space z offsets (front, back). */
const LAYER_Z = STRAP.layerZ;

/** Rounded rectangle centred on the origin (xy plane, facing +z). */
export function roundedTileGeometry(width: number, height: number, radius: number): BufferGeometry {
  const w = width / 2, h = height / 2, r = Math.min(radius, w, h);
  const shape = new Shape();
  shape.moveTo(-w + r, -h);
  shape.lineTo(w - r, -h);
  shape.quadraticCurveTo(w, -h, w, -h + r);
  shape.lineTo(w, h - r);
  shape.quadraticCurveTo(w, h, w - r, h);
  shape.lineTo(-w + r, h);
  shape.quadraticCurveTo(-w, h, -w, h - r);
  shape.lineTo(-w, -h + r);
  shape.quadraticCurveTo(-w, -h, -w + r, -h);
  return new ShapeGeometry(shape, 8);
}

/** A flat stroke along a polyline with round caps and joins (xy plane, facing +z). */
export function strokeGeometry(points: readonly (readonly [number, number])[], width: number, segments = 12): BufferGeometry {
  const pos: number[] = [];
  const r = width / 2;
  const tri = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => pos.push(ax, ay, 0, bx, by, 0, cx, cy, 0);
  for (let i = 0; i + 1 < points.length; i++) {
    const [ax, ay] = points[i]!, [bx, by] = points[i + 1]!;
    const l = Math.hypot(bx - ax, by - ay) || 1;
    const nx = (-(by - ay) / l) * r, ny = ((bx - ax) / l) * r;
    tri(ax - nx, ay - ny, bx - nx, by - ny, bx + nx, by + ny);
    tri(ax - nx, ay - ny, bx + nx, by + ny, ax + nx, ay + ny);
  }
  for (const [x, y] of points) {
    for (let k = 0; k < segments; k++) {
      const a0 = (k / segments) * Math.PI * 2, a1 = ((k + 1) / segments) * Math.PI * 2;
      tri(x, y, x + Math.cos(a0) * r, y + Math.sin(a0) * r, x + Math.cos(a1) * r, y + Math.sin(a1) * r);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  const n = new Float32Array(pos.length);
  for (let i = 2; i < n.length; i += 3) n[i] = 1;
  g.setAttribute('normal', new BufferAttribute(n, 3));
  return g;
}

function meshesUnder(o: Object3D): Mesh[] {
  const out: Mesh[] = [];
  o.traverse((c) => {
    if ((c as Mesh).isMesh) out.push(c as Mesh);
  });
  return out;
}

/**
 * Runtime rig over the loaded GLB. `variants`: the GLB's templates (KHR_materials_variants:
 * light = the master's print, dark = the generated ink print).
 */
export function rigBusiness(root: Object3D, lib: ModelContext['lib'], template: CardTemplate = 'light', variants?: MaterialVariants): BusinessRig {
  const dir = lib.direction;
  const nodes = collectNodes(root, BUSINESS_NODES);
  const authored = nodes.card_authored!;
  const anchor = nodes.lanyard_anchor!;

  // ── Strap: the master's woven strap material, carried in the GLB on a decimated stub ──
  const carrier = meshesUnder(nodes.strap_material!)[0];
  const fabric = (carrier?.material as Material | undefined) ?? lib.get('mat_fabric');
  // The master strap carries vertex colours (COLOR_0) and the loader enabled them on its
  // material; the runtime strands and tab have none, which would render black.
  // Their mean (0.9) goes into the colour factor so the strap keeps the master's value.
  if (fabric.vertexColors) {
    fabric.vertexColors = false;
    (fabric as MeshStandardMaterial).color.multiplyScalar(STRAP_VERTEX_AO);
    fabric.needsUpdate = true;
  }
  for (const m of meshesUnder(nodes.strap_material!)) m.geometry.dispose();
  nodes.strap_material!.removeFromParent();
  const tab = mesh('strap_tab', strapTabGeometry(), fabric, authored);
  tab.castShadow = true;
  const strandLength = LANYARD_TOP_Y - (HANG_PIVOT.y + STRAP_TAB_TOP - STRAP_TUCK) + 0.02;
  const strands: [LanyardStrand, LanyardStrand] = [
    new LanyardStrand(strandLength, STRAP.width, STRAP.thickness, STRAP.weaveTile),
    new LanyardStrand(strandLength, STRAP.width, STRAP.thickness, STRAP.weaveTile),
  ];
  strands.forEach((s, i) => (mesh(`lanyard_strand_${i}`, s.geometry, fabric, nodes.lanyard_curve).frustumCulled = false));
  const facing = new Vector3(0, 0, 1);
  const top = new Vector3(), attach = new Vector3(), up = new Vector3();
  const updateLanyard = () => {
    root.updateMatrixWorld(true);
    up.set(0, 1, 0).transformDirection(authored.matrixWorld);
    strands.forEach((s, i) => {
      const side = i === 0 ? -1 : 1;
      top.set(anchor.position.x + side * LANYARD_SPREAD, anchor.position.y, anchor.position.z);
      attach.set(0, STRAP_TAB_TOP - STRAP_TUCK, side * LAYER_Z);
      authored.localToWorld(attach);
      root.worldToLocal(attach);
      s.update(top, attach, facing, up);
    });
  };

  // ── Clear vinyl holder: a clear sheet (reflection added, behind dimmed), not a white veil ──
  nodes.card_mesh!.traverse((o) => {
    const m = (o as Mesh).material as MeshStandardMaterial | undefined;
    if (!(o as Mesh).isMesh || !m || m.name !== 'badge_vinyl' || m.blending === CustomBlending) return;
    m.color.set('#000000');
    m.opacity = VINYL.dimming;
    m.transparent = true;
    m.depthWrite = false;
    m.blending = CustomBlending;
    m.blendSrc = OneFactor;
    m.blendDst = OneMinusSrcAlphaFactor;
    m.needsUpdate = true;
  });

  // ── Status light: the LED bar, its halo quad and a spill light ──
  const ledMesh = meshesUnder(nodes.scanner_light!)[0]!;
  const led = (ledMesh.material as MeshStandardMaterial).clone();
  led.name = 'reader_led_status';
  led.color.copy(LED_OFF);
  led.emissiveMap = null; // the master's map is a green-tinted mask; the status sets the colour
  led.emissive.set('#000000');
  led.emissiveIntensity = 0;
  ledMesh.material = led;
  const haloMesh = meshesUnder(nodes.scanner_glow!)[0]!;
  const halo = (haloMesh.material as MeshStandardMaterial).clone();
  halo.name = 'reader_led_halo';
  // Base colour black (texture rgb ignored), shape from the texture's alpha, colour by emission.
  halo.color.set('#000000');
  halo.emissiveMap = null;
  halo.emissive.set('#000000');
  halo.emissiveIntensity = 0;
  halo.transparent = true;
  halo.depthWrite = false;
  halo.opacity = 0;
  haloMesh.material = halo;
  haloMesh.renderOrder = 1;
  haloMesh.userData.noShadowCast = true;
  ledMesh.userData.noShadowCast = true;
  const spill = new PointLight('#ffffff', 0, STATUS_SPILL.distance, 2);
  spill.name = 'scanner_spill';
  spill.position.set(0, STATUS_SPILL.v, STATUS_SPILL.out);
  nodes.scanner_face!.add(spill);
  // Status tile on the lower glass (on the pad, so it gives with the glass at the press): lit in the
  // status colour with a check or a minus in the glass's black across it. Hidden while idle, so the
  // idle reader is the master's.
  const tileMat = new MeshStandardMaterial({ name: 'reader_status_tile', color: '#000000', roughness: 0.5, metalness: 0 });
  const glyphMat = new MeshStandardMaterial({ name: 'reader_status_glyph', color: '#070808', roughness: 0.55, metalness: 0 });
  const tile = mesh('scanner_status_tile', roundedTileGeometry(STATUS_TILE.width, STATUS_TILE.height, STATUS_TILE.radius), tileMat, nodes.scanner_pad);
  tile.position.set(0, STATUS_TILE.v, FACE.glass + 0.0006);
  const glyphs = {
    accept: mesh('scanner_status_check', strokeGeometry(STATUS_GLYPHS.accept, STATUS_TILE.stroke), glyphMat, tile),
    decline: mesh('scanner_status_minus', strokeGeometry(STATUS_GLYPHS.decline, STATUS_TILE.stroke), glyphMat, tile),
  };
  for (const m of [tile, glyphs.accept, glyphs.decline]) {
    m.castShadow = false;
    m.receiveShadow = false;
    m.userData.noShadowCast = true;
  }
  glyphs.accept.position.z = glyphs.decline.position.z = 0.0005;
  tile.visible = false;
  let lastStatus: StatusLit | null = null, lastLevel = -1;
  const setStatus = (lit: StatusLit, level: number) => {
    const k = lit === 'off' ? 0 : Math.min(1, Math.max(0, level));
    if (lit === lastStatus && k === lastLevel) return;
    lastStatus = lit;
    lastLevel = k;
    tile.visible = k > 0 && lit !== 'off';
    glyphs.accept.visible = lit === 'accept';
    glyphs.decline.visible = lit === 'decline';
    if (lit === 'off' || k === 0) {
      tileMat.emissive.set('#000000');
      tileMat.emissiveIntensity = 0;
      led.emissive.set('#000000');
      led.emissiveIntensity = 0;
      halo.emissive.set('#000000');
      halo.emissiveIntensity = 0;
      halo.opacity = 0;
      spill.intensity = 0;
      return;
    }
    const colour = STATUS_COLOURS[lit];
    tileMat.emissive.set(colour);
    tileMat.emissiveIntensity = GLOW.tile[lit] * k;
    led.emissive.set(colour);
    led.emissiveIntensity = GLOW.led[lit] * k;
    halo.emissive.set(colour);
    halo.emissiveIntensity = GLOW.halo.intensity * GLOW.led[lit];
    halo.opacity = GLOW.halo.opacity * k;
    spill.color.set(colour);
    spill.intensity = GLOW.spill * k;
  };

  // ── Gasket press: the glass and what is printed on it give; the gasket under it compresses ──
  const pad = nodes.scanner_pad!, gasket = nodes.scanner_gasket!;
  const padRest = pad.position.clone();
  const gasketDepth = FACE.gasketFront - FACE.gasketBack;
  const setPress = (depth: number) => {
    const d = Math.max(0, depth);
    pad.position.copy(padRest);
    pad.position.z -= d; // scanner_face space: +z is the glass normal
    gasket.scale.set(1, 1, Math.max(0.05, 1 - d / gasketDepth));
  };

  // ── Contact shadows (blobs under the card and the reader) ──
  const replaceShadow = (name: string, shadow: ContactShadow) => {
    const placeholder = root.getObjectByName(name)!;
    shadow.position.copy(placeholder.position);
    placeholder.parent!.add(shadow);
    placeholder.removeFromParent();
    return shadow;
  };
  const cardShadow = replaceShadow('card_shadow', new ContactShadow({
    name: 'card_shadow', shape: 'rect', width: CARD.width, depth: 0.1, spread: [1.1, 3],
    opacity: dir.shadow.opacity * 0.7, line: 0, color: dir.shadow.color,
  }));
  const scannerShadow = replaceShadow('scanner_shadow', new ContactShadow({
    name: 'scanner_shadow', shape: 'rect', width: READER.width, depth: READER.front - READER.back, spread: [1.08, 1.3],
    opacity: dir.shadow.opacity, line: 0.5, color: dir.shadow.color,
  }));
  cardShadow.setHeight(HANG_PIVOT.y + CARD_OFFSET_Y - CARD.height / 2, 0.9);
  nodes.card_shadow = cardShadow;
  nodes.scanner_shadow = scannerShadow;

  const setTemplate = (next: CardTemplate) => {
    if (variants?.names.includes(next)) variants.select(next);
  };
  setTemplate(template);
  setStatus('off', 0);
  updateLanyard();

  return {
    root,
    nodes,
    shadows: [cardShadow, scannerShadow],
    bounds: BUSINESS_BOUNDS.clone(),
    gate: nodes.clip_gate!,
    updateLanyard,
    setTemplate,
    setStatus,
    setPress,
    dispose() {
      strands.forEach((s) => s.dispose());
      tab.geometry.dispose();
      cardShadow.dispose();
      scannerShadow.dispose();
      led.dispose();
      halo.dispose();
      tileMat.dispose();
      glyphMat.dispose();
      for (const m of [tile, glyphs.accept, glyphs.decline]) m.geometry.dispose();
      spill.removeFromParent();
    },
  };
}
