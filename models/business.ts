import {
  AdditiveBlending,
  type Box3,
  BufferAttribute,
  BufferGeometry,
  ClampToEdgeWrapping,
  Color,
  CustomBlending,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  type Material,
  type Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PlaneGeometry,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
  Vector3,
} from 'three';
import { ContactShadow } from '../src/render/contactShadow.ts';
import { mesh } from './geometry.ts';
import type { MaterialVariants } from './imported.ts';
import { LanyardStrand } from './lanyard.ts';
import {
  BUSINESS_BOUNDS, BUSINESS_NODES, CARD, CARD_OFFSET_Y, D_RING, FACE, HANG_PIVOT, LANYARD_SPREAD, LANYARD_TOP_Y, READER, READER_SCALE, SCANNER_POS,
  STATUS_PICTOGRAM, STATUS_PICTOGRAM_SIZE, STRAP, STRAP_TAB_TOP, type CardTemplate,
} from './businessContract.ts';
import { encodeEmission, statusGlyphField, type EmissionField } from './businessPrint.ts';
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
 * reader's status pictogram, the gasket press, contact shadows and the dark
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
 * Status light (v1.5): light behind the reader's smoked cover glass, as a well-made access reader
 * shows its outcome. One indicator, the **pictogram**: a dead-front glyph in the lower glass
 * (STATUS_PICTOGRAM), invisible while off (nothing is drawn; the idle face is the master's black
 * glass), lit as the shell's own check or minus (models/businessPrint.ts STATUS_ICON) with a
 * soft-edged core, the diffuser's halo and a hotspot over the LED behind it (statusGlyphField),
 * on the timing of src/scenes/business/sequences.ts `statusEnvelope`.
 *
 * The light is drawn as the radiance it adds through the glass (additive, tone-mapped with the
 * scene: no bloom pass): the glass's own reflections stay over it, as they do over a lit icon
 * behind a real cover glass. Its peak is a true HDR value, so the stroke's core rolls off towards
 * white in the Neutral tone curve while its halo keeps the token's colour.
 *
 * The master's LED pipe at the top of the glass stays its dark lens (v1.2 lit it too). Its bar is
 * the minus's own shape: lit beside the pictogram it read as a green minus over the check and as a
 * second minus over the decline (two red dashes at the 192 px thumbnail). One light, one answer.
 *
 * Colours (DESIGN.md): the shell's two status colours as lights. Accept is `#3BE08A` (hue 149°:
 * Saved Pine `#176B42` is 151°; the Party status light shares it). Decline is `#F12D22`, a red
 * LED's red (hue 3°, a few degrees warm of Garnet `#A62D36`'s 355.5° pigment hue, with more green
 * than blue): a bluish red pushed up the tone curve rolls off to pink (v1.5's first cut, Garnet's
 * own hue `#ED313F`, lit pink at its core). The pair differs in value as well as hue, 2.4:1 in
 * luminance and 1.8:1 for a deuteranope, and the glyph says which without either.
 */
export const STATUS_COLOURS = { accept: '#3BE08A', decline: '#F12D22' } as const;
export const GLOW = {
  /**
   * Peak radiance of the pictogram's stroke core (× the status colour, linear, before exposure).
   * Both cores pass the Neutral tone curve's shoulder (0.76 after the rig's 1.15 exposure) about
   * threefold: bright and a little lifted towards white, never clipped flat (v1.5's first cut, 4.2
   * and 5, pinned whole strokes at one near-white value and turned the red core pink). The minus
   * carries 0.63 of the check's stroke and red 0.37 of green's luminance, so decline runs a little
   * higher; a saturated red looks brighter than its luminance, and the pair reads balanced, the
   * minus a shade quieter, as a decline that is not an alarm should.
   */
  glyph: { accept: 2.6, decline: 2.7 },
} as const;
/**
 * No spill light (v1.5). A 1.8 mm stroke behind smoked glass throws no light a viewer can see on the
 * card 5 mm above it (v1.5's first cut aimed a 0.18 spot at the pressed card's edge: the frames moved
 * by less than one level), and v1.2–v1.4's point light 0.16 out showed as a white glint on the glass
 * once the matte tile no longer covered its mirror image.
 */
/** Idle LED lens (off): a neutral dark, not the master's green tint, so idle never reads as "accepted". */
const LED_OFF = new Color(0.018, 0.02, 0.019);
const LED_LENS_ROUGHNESS = 0.85;

/**
 * The pictogram's fields and their texels, computed once per page (a pure function of constants,
 * about 40 ms each): a reset or a preset change rebuilds the rig, not the light.
 */
const glyphLight = (() => {
  const cache = new Map<'accept' | 'decline', { field: EmissionField; texels: Uint8Array }>();
  return (kind: 'accept' | 'decline') => {
    let hit = cache.get(kind);
    if (!hit) {
      const field = statusGlyphField(kind, 512, STATUS_PICTOGRAM.extent);
      cache.set(kind, (hit = { field, texels: encodeEmission(field) }));
    }
    return hit;
  };
})();

/** An emission field as a texture: sRGB bytes (smooth halo), mipmapped, clamped. */
function emissionTexture(field: EmissionField, texels: Uint8Array, name: string): DataTexture {
  const t = new DataTexture(texels, field.width, field.height, RGBAFormat, UnsignedByteType);
  t.name = name;
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = ClampToEdgeWrapping;
  t.magFilter = LinearFilter;
  t.minFilter = LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

/** Additive light through the glass: no lighting of its own, tone-mapped with the scene. */
function lightMaterial(name: string, map: DataTexture): MeshBasicMaterial {
  const m = new MeshBasicMaterial({ name, map, color: '#000000', transparent: true, blending: AdditiveBlending, depthWrite: false });
  m.polygonOffset = true;
  m.polygonOffsetFactor = -1;
  m.polygonOffsetUnits = -4;
  return m;
}

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

  // ── Status light: the dead-front pictogram; the LED pipe is the master's dark lens ──
  const S = READER_SCALE;
  const ledMesh = meshesUnder(nodes.scanner_light!)[0]!;
  const led = (ledMesh.material as MeshStandardMaterial).clone();
  led.name = 'reader_led_lens';
  led.color.copy(LED_OFF);
  // A frosted lens, as a light pipe's is (it diffuses its LED): the master's 0.4 let the curved rim
  // throw sub-pixel highlights that broke the unlit pill into a dotted dash at 1× (before v1.5 it
  // was lit over them in every answer state).
  led.roughness = LED_LENS_ROUGHNESS;
  led.emissiveMap = null;
  led.emissive.set('#000000');
  led.emissiveIntensity = 0;
  ledMesh.material = led;
  ledMesh.userData.noShadowCast = true;
  // The master's glow quad belongs to the lit pipe: it stays hidden.
  const haloMesh = meshesUnder(nodes.scanner_glow!)[0]!;
  haloMesh.visible = false;
  haloMesh.userData.noShadowCast = true;
  // The pictogram: one quad on the pad (it gives with the glass at the press), a field per glyph.
  const lights = { accept: glyphLight('accept'), decline: glyphLight('decline') };
  const fields = { accept: lights.accept.field, decline: lights.decline.field };
  const glyphTex = {
    accept: emissionTexture(fields.accept, lights.accept.texels, 'reader_status_check'),
    decline: emissionTexture(fields.decline, lights.decline.texels, 'reader_status_minus'),
  };
  const pictogramMat = lightMaterial('reader_status_light', glyphTex.accept);
  const pictogram = mesh('scanner_status_light', new PlaneGeometry(STATUS_PICTOGRAM_SIZE, STATUS_PICTOGRAM_SIZE), pictogramMat, nodes.scanner_pad);
  pictogram.position.set(0, STATUS_PICTOGRAM.v, FACE.glass + 0.0004 * S);
  pictogram.renderOrder = 1;
  pictogram.castShadow = pictogram.receiveShadow = false;
  pictogram.userData.noShadowCast = true;
  pictogram.visible = false;
  let lastStatus: StatusLit | null = null, lastLevel = -1;
  const setStatus = (lit: StatusLit, level: number) => {
    const k = lit === 'off' ? 0 : Math.min(1, Math.max(0, level));
    if (lit === lastStatus && k === lastLevel) return;
    lastStatus = lit;
    lastLevel = k;
    const on = lit !== 'off' && k > 0;
    // Dead front: nothing is drawn while the light is off, so the idle face is the master's glass.
    pictogram.visible = on;
    if (!on) {
      pictogramMat.color.set('#000000');
      return;
    }
    const colour = STATUS_COLOURS[lit];
    // Same program for either glyph: only the texture uniform changes.
    pictogramMat.map = glyphTex[lit];
    pictogramMat.color.set(colour).multiplyScalar(GLOW.glyph[lit] * fields[lit].peak * k);
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
      glyphTex.accept.dispose();
      glyphTex.decline.dispose();
      pictogramMat.dispose();
      pictogram.geometry.dispose();
    },
  };
}
