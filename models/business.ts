import {
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
  Matrix3,
  Matrix4,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  type Object3D,
  OneFactor,
  OneMinusSrcAlphaFactor,
  RGBAFormat,
  type Texture,
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
   * Radiance at the glyph's brightest point (× the status colour; linear, before exposure: the
   * emission field is normalised to 1 there, where the stroke's core and its halo overlap). Set so
   * each glyph's strongest channel renders at about 1.7 after the rig's 1.15 exposure: over twice
   * the Neutral tone curve's shoulder (0.76), so the core rolls off (a gentle HDR bloom) while the
   * curve's path to white stays under a tenth and the hue holds. An LED's light
   * is narrow-band: its core reads as its colour, not as a white filament. (v1.5's first cuts,
   * 4.2 / 5 and then 2.6 / 2.7 on the stroke core, washed the red core to salmon and, over a bright
   * reflection, to pink-white.) The red runs a shade hotter (1.49 against 1.45 in its strongest
   * channel: it has 0.37 of the green's luminance); the glyph's presence at small sizes is carried
   * by its size and its halo (businessPrint.ts STATUS_DIFFUSION.haloGain).
   */
  glyph: { accept: 1.95, decline: 1.7 },
} as const;
/*
 * No spill light (v1.5). A 1.8 mm stroke behind smoked glass throws no light a viewer can see on the
 * card 5 mm above it (v1.5's first cut aimed a 0.18 spot at the pressed card's edge: the frames moved
 * by less than one level), and v1.2–v1.4's point light 0.16 out showed as a white glint on the glass
 * once the matte tile no longer covered its mirror image.
 */

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

/**
 * The pictogram's light, added inside the cover glass's own shading: the glass's emission gains
 * `statusColor × statusMap`, sampled in face space through `statusUvMatrix`, before the clearcoat
 * and the tone curve. So the glass's reflection and the light behind it are summed as radiance and
 * tone-mapped together, as a camera sees a lit icon under a reflection. (v1.5's first cut drew the
 * light as an additive quad over the glass: blending happens after the tone curve and in the
 * framebuffer's sRGB encoding, so over a bright reflection it washed the glyph's core towards
 * white.) Off, `statusColor` is 0 and the glass shades exactly as the master's.
 */
function addStatusLight(glass: Mesh, toUv: Matrix4, map: DataTexture) {
  const m = glass.material as MeshPhysicalMaterial;
  const uniforms = { statusMap: { value: map as Texture }, statusColor: { value: new Color(0, 0, 0) }, statusUvMatrix: { value: toUv } };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform mat4 statusUvMatrix;\nvarying vec2 vStatusUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvStatusUv = ( statusUvMatrix * vec4( transformed, 1.0 ) ).xy;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D statusMap;\nuniform vec3 statusColor;\nvarying vec2 vStatusUv;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += statusColor * texture2D( statusMap, vStatusUv ).rgb;');
  };
  m.customProgramCacheKey = () => 'business-reader-status-light';
  m.needsUpdate = true;
  return uniforms;
}

/**
 * The cover glass's edge round-over (0.2 mm, at the window's edge where the glass meets the
 * gasket) is shaded as the face it belongs to. At stage scale it is a sub-pixel sliver turned to
 * the bright floor at grazing angles, and the 4× MSAA resolved it into a row of evenly spaced light
 * specks along the window's bottom edge (clearest on a phone). Its silhouette is unchanged.
 */
export function flattenGlassEdge(glass: Mesh, toFace: Matrix4): number {
  const nor = glass.geometry.getAttribute('normal');
  const n = new Vector3(), face = new Vector3(0, 0, 1), local = new Vector3();
  const normalToFace = new Matrix3().getNormalMatrix(toFace);
  const faceToLocal = normalToFace.clone().invert();
  local.copy(face).applyMatrix3(faceToLocal).normalize();
  let changed = 0;
  for (let i = 0; i < nor.count; i++) {
    n.fromBufferAttribute(nor, i).applyMatrix3(normalToFace).normalize();
    if (n.z > 0.2 && n.z < 0.999) {
      nor.setXYZ(i, local.x, local.y, local.z);
      changed++;
    }
  }
  nor.needsUpdate = true;
  return changed;
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
  // v1.5: the strap assembly (tab, its stitching, the D-ring) casts no shadow either: without the
  // strands, its shadow sat alone on the cove right of the reader, a detached smudge.
  tab.userData.noShadowCast = true;
  const stitching = root.getObjectByName('strap_stitching');
  for (const m of [...(stitching ? meshesUnder(stitching) : []), ...meshesUnder(nodes.d_ring!)]) m.userData.noShadowCast = true;
  const strandLength = LANYARD_TOP_Y - (HANG_PIVOT.y + STRAP_TAB_TOP - STRAP_TUCK) + 0.02;
  const strands: [LanyardStrand, LanyardStrand] = [
    new LanyardStrand(strandLength, STRAP.width, STRAP.thickness, STRAP.weaveTile),
    new LanyardStrand(strandLength, STRAP.width, STRAP.thickness, STRAP.weaveTile),
  ];
  strands.forEach((s, i) => {
    const m = mesh(`lanyard_strand_${i}`, s.geometry, fabric, nodes.lanyard_curve);
    m.frustumCulled = false;
    // v1.5: the strands cast no shadow. They run up out of the frame to anchors above the stage,
    // so the key light laid their shadow on the cove as two long grey stripes beside the badge with
    // nothing visible to cast them (a ghost in every frame). The hook and the card still cast.
    m.userData.noShadowCast = true;
  });
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

  // ── Status light: the dead-front pictogram, lit inside the glass's shading ──
  // The master's LED pipe sits behind the dead-front glass with the pictogram: unlit, it is not seen
  // (its bar, standing proud of the glass, read as a second minus over the decline). Its glow quad
  // belongs to the lit pipe. The glass is whole under it.
  const ledMesh = meshesUnder(nodes.scanner_light!)[0]!;
  ledMesh.visible = false;
  ledMesh.userData.noShadowCast = true;
  const haloMesh = meshesUnder(nodes.scanner_glow!)[0]!;
  haloMesh.visible = false;
  haloMesh.userData.noShadowCast = true;
  const pad = nodes.scanner_pad!;
  const glass = meshesUnder(pad).find((m) => (m.material as Material).name === 'reader_glass')!;
  // Glass mesh space → pad (face) space → the pictogram's texture space.
  root.updateMatrixWorld(true);
  const toFace = new Matrix4().copy(pad.matrixWorld).invert().multiply(glass.matrixWorld);
  const toUv = new Matrix4()
    .makeTranslation(0.5, 0.5 - STATUS_PICTOGRAM.v / STATUS_PICTOGRAM_SIZE, 0)
    .multiply(new Matrix4().makeScale(1 / STATUS_PICTOGRAM_SIZE, 1 / STATUS_PICTOGRAM_SIZE, 1))
    .multiply(toFace);
  flattenGlassEdge(glass, toFace);
  const lights = { accept: glyphLight('accept'), decline: glyphLight('decline') };
  const fields = { accept: lights.accept.field, decline: lights.decline.field };
  const glyphTex = {
    accept: emissionTexture(fields.accept, lights.accept.texels, 'reader_status_check'),
    decline: emissionTexture(fields.decline, lights.decline.texels, 'reader_status_minus'),
  };
  const light = addStatusLight(glass, toUv, glyphTex.accept);
  let lastStatus: StatusLit | null = null, lastLevel = -1;
  const setStatus = (lit: StatusLit, level: number) => {
    const k = lit === 'off' ? 0 : Math.min(1, Math.max(0, level));
    if (lit === lastStatus && k === lastLevel) return;
    lastStatus = lit;
    lastLevel = k;
    // Dead front: off, the glass adds no light and shades exactly as the master's.
    if (lit === 'off' || k === 0) {
      light.statusColor.value.setRGB(0, 0, 0);
      return;
    }
    // Same program for either glyph: only the uniforms change.
    light.statusMap.value = glyphTex[lit];
    light.statusColor.value.set(STATUS_COLOURS[lit]).multiplyScalar(GLOW.glyph[lit] * k);
  };

  // ── Gasket press: the glass and what is printed on it give; the gasket under it compresses ──
  const gasket = nodes.scanner_gasket!;
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
      glyphTex.accept.dispose();
      glyphTex.decline.dispose();
    },
  };
}
