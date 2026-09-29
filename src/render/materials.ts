import { Color, DoubleSide, FrontSide, type Material, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, ShaderMaterial, Vector2 } from 'three';
import { cardPrint, holoPattern, strapPrint } from './print.ts';
import { perforationDarkMap, perforationMaps, ringNormal, stippleNormal, weaveNormal } from './textures.ts';

/**
 * Material naming and roughness convention (asset contract, Master §8):
 *   mat_<role>[_<preset>]  — scenes reference names only; the direction supplies values.
 * Roughness bands: satin bodies 0.40–0.55 · enamel bodies 0.62–0.75 · metal 0.25–0.40 ·
 * food 0.55–0.85. Metalness is 0 or 1 except anodised/painted metal.
 */

export type DirectionId = 'A' | 'B' | 'L' | 'L2';

/** The production direction locked at checkpoint 1 (B construction + A restraint). */
export const LOCKED_DIRECTION: DirectionId = 'L';

export interface SurfaceSpec {
  color: string;
  roughness: number;
  metalness?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  sheen?: number;
  sheenColor?: string;
  emissive?: string;
  emissiveIntensity?: number;
  normal?: 'stipple' | 'perforation' | 'weave' | 'rings-pad' | 'rings-record' | 'rings-target';
  /** Unlit, exact colour (flames). Never tone mapped so they read as light sources. */
  unlit?: boolean;
  opacity?: number;
  /** View-dependent unlit flame: hot core facing the camera, orange rim. */
  flame?: { core: string; rim: string };
  /** Printed graphics generated at load (fidelity pass). */
  print?: 'card-light' | 'card-dark' | 'strap';
  anisotropy?: number;
  iridescence?: number;
  /** Holographic foil: iridescence driven by a sunburst thickness pattern (fidelity pass 2). */
  holo?: boolean;
  normalScale?: number;
  perforated?: boolean | 'dark';
  doubleSide?: boolean;
}

export interface DirectionTokens {
  id: DirectionId;
  name: string;
  summary: string;
  ui: {
    stage: string;
    text: string;
    muted: string;
    accent: string;
    accentText: string;
    ok: string;
    no: string;
  };
  status: { accept: string; decline: string; neutral: string };
  geometry: {
    /** Bevel radius as a fraction of the part's smallest dimension. */
    bevelRatio: number;
    bevelSegments: number;
    /** Uniform proportion push for "fuller" forms. 1 = neutral. */
    fullness: number;
  };
  signature: { kind: 'stipple' | 'perforation'; description: string; placement: string[] };
  /** Construction choices per object, so models never infer style from the signature. */
  style: {
    cake: 'piped' | 'drip';
    card: 'band' | 'panel' | 'panel-id' | 'print';
    clip: 'metal' | 'enamel';
    scanner: 'ring' | 'pill' | 'window';
    cloche: 'metal' | 'enamel';
    record: 'body' | 'accent' | 'band';
    hoop: 'blockout' | 'refined';
    /** Dark keyline on card and faceplate edges so light bodies hold a 3:1 silhouette. */
    inkEdges: boolean;
  };
  shadow: { opacity: number; color: string };
  surfaces: Record<string, SurfaceSpec>;
}

const shared = {
  stage: '#F4F1EB',
  text: '#202320',
  muted: '#DCDDD5',
  accent: '#FF714A',
  ok: '#176B42',
  no: '#A62D36',
};

const food: Record<string, SurfaceSpec> = {
  mat_status_symbol: { color: '#FFFFFF', roughness: 0.4, emissive: '#FFFFFF', emissiveIntensity: 1.2 },
  mat_frosting_vanilla: { color: '#F5EAD8', roughness: 0.6 },
  mat_frosting_cocoa: { color: '#5B3627', roughness: 0.52 },
  mat_sponge_vanilla: { color: '#E8C48C', roughness: 0.86 },
  mat_sponge_cocoa: { color: '#3E251B', roughness: 0.86 },
  mat_wick: { color: '#2A2420', roughness: 0.9 },
  mat_flame_core: { color: '#FFF6DC', roughness: 1, unlit: true },
  mat_flame_outer: { color: '#FF9A33', roughness: 1, flame: { core: '#FFF4C9', rim: '#FF8A2B' } },
  mat_pasta: { color: '#F2CF7A', roughness: 0.62 },
  mat_sauce: { color: '#C8432B', roughness: 0.45 },
  mat_basil: { color: '#3F7A45', roughness: 0.6 },
  mat_veg_green: { color: '#5E9A4E', roughness: 0.6 },
  mat_veg_orange: { color: '#EE8A3C', roughness: 0.55 },
  mat_veg_red: { color: '#D0463A', roughness: 0.5 },
};

// L2 is derived from L right after this literal.
export const DIRECTIONS = {
  A: {
    id: 'A',
    name: 'Satin Studio',
    summary:
      'Warm neutral satin bodies, machined edges, small anodised accents. Colour lives in functional inserts; a fine stippled inlay is the family mark.',
    ui: { ...shared, accentText: '#202320' },
    status: { accept: '#34D27B', decline: '#FF4B4B', neutral: '#3A3D3B' },
    geometry: { bevelRatio: 0.16, bevelSegments: 4, fullness: 1 },
    signature: {
      kind: 'stipple',
      description: 'Fine staggered stipple inlay (0.025-unit pitch) on an ink or cream band.',
      placement: ['card band', 'tray rim', 'record-player face', 'hoop support', 'scanner face'],
    },
    style: { cake: 'piped', card: 'band', clip: 'metal', scanner: 'ring', cloche: 'metal', record: 'body', hoop: 'blockout', inkEdges: false },
    shadow: { opacity: 0.5, color: '#3a2f24' },
    surfaces: {
      mat_body: { color: '#ECE5D8', roughness: 0.44, clearcoat: 0.35, clearcoatRoughness: 0.45 },
      mat_body_ink: { color: '#25282B', roughness: 0.46, clearcoat: 0.3, clearcoatRoughness: 0.5 },
      mat_body_alt: { color: '#D9D3C6', roughness: 0.48 },
      mat_accent: { color: '#FF714A', roughness: 0.42 },
      mat_insert: { color: '#2F54C9', roughness: 0.44 },
      mat_insert_warm: { color: '#F0B84A', roughness: 0.44 },
      mat_anodized: { color: '#E8603C', roughness: 0.34, metalness: 1 },
      mat_metal: { color: '#C7C3BC', roughness: 0.3, metalness: 1 },
      mat_metal_dark: { color: '#57595B', roughness: 0.34, metalness: 1 },
      mat_signature: { color: '#2A2D30', roughness: 0.5, normal: 'stipple', normalScale: 0.65 },
      mat_signature_light: { color: '#E3DCCD', roughness: 0.5, normal: 'stipple', normalScale: 0.65 },
      mat_rubber: { color: '#2B2B2A', roughness: 0.82 },
      mat_fabric: { color: '#2A2C30', roughness: 0.78, normal: 'weave', normalScale: 0.6, sheen: 0.4, sheenColor: '#8a8f98', doubleSide: true },
      mat_pad: { color: '#1F2124', roughness: 0.3, normal: 'rings-pad', normalScale: 0.14 },
      mat_status: { color: '#3A3D3B', roughness: 0.35, emissive: '#000000', emissiveIntensity: 0 },
      mat_tray: { color: '#E6DFD2', roughness: 0.42, clearcoat: 0.3, clearcoatRoughness: 0.4 },
      mat_candle_1: { color: '#FF714A', roughness: 0.5 },
      mat_candle_2: { color: '#2F54C9', roughness: 0.5 },
      mat_candle_3: { color: '#F0B84A', roughness: 0.5 },
      mat_vinyl: { color: '#1B1C1E', roughness: 0.34, normal: 'rings-record', normalScale: 0.18 },
      mat_label_coral: { color: '#FF714A', roughness: 0.55 },
      mat_label_cobalt: { color: '#2F54C9', roughness: 0.55 },
      mat_ball_orange: { color: '#E8702F', roughness: 0.62 },
      mat_ball_cream: { color: '#EEE3CC', roughness: 0.62 },
      mat_ball_seam: { color: '#26282B', roughness: 0.7 },
      mat_net: { color: '#F2EEE6', roughness: 0.8, doubleSide: true },
      mat_plate: { color: '#F3EEE4', roughness: 0.36, clearcoat: 0.4, clearcoatRoughness: 0.3 },
      mat_cloche: { color: '#D8D4CC', roughness: 0.4, metalness: 1 },
      mat_bin: { color: '#D9D3C6', roughness: 0.46 },
      mat_card_light: { color: '#EFE8DB', roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.4 },
      mat_card_dark: { color: '#25282B', roughness: 0.44, clearcoat: 0.3, clearcoatRoughness: 0.45 },
      mat_card_mark: { color: '#CFC7B8', roughness: 0.5 },
      ...food,
    },
  },
  B: {
    id: 'B',
    name: 'Enamel Workshop',
    summary:
      'Fuller forms, matte enamel colour blocks, fewer metal highlights. Everyday objects feel collectible; a restrained perforated band repeats on manufactured supports.',
    ui: { ...shared, accentText: '#202320' },
    status: { accept: '#34D27B', decline: '#FF4B4B', neutral: '#3A3D3B' },
    geometry: { bevelRatio: 0.28, bevelSegments: 5, fullness: 1.06 },
    signature: {
      kind: 'perforation',
      description: 'Single row of inset perforations, spacing equal to band height, on manufactured supports only.',
      placement: ['card border', 'tray band', 'record-player plinth', 'backboard frame', 'scanner collar'],
    },
    style: { cake: 'drip', card: 'panel', clip: 'enamel', scanner: 'pill', cloche: 'enamel', record: 'accent', hoop: 'blockout', inkEdges: false },
    shadow: { opacity: 0.46, color: '#3a2f24' },
    surfaces: {
      mat_body: { color: '#F0E6D2', roughness: 0.7 },
      mat_body_ink: { color: '#2A2C2F', roughness: 0.72 },
      mat_body_alt: { color: '#E2D6C0', roughness: 0.72 },
      mat_accent: { color: '#FF714A', roughness: 0.66 },
      mat_insert: { color: '#3553C9', roughness: 0.66 },
      mat_insert_warm: { color: '#F2BE4B', roughness: 0.66 },
      mat_anodized: { color: '#FF714A', roughness: 0.62 },
      mat_metal: { color: '#A9A59E', roughness: 0.48, metalness: 0.6 },
      mat_metal_dark: { color: '#4A4B4D', roughness: 0.55, metalness: 0.4 },
      mat_signature: { color: '#F0E6D2', roughness: 0.7, perforated: true, normal: 'perforation', normalScale: 1 },
      mat_signature_light: { color: '#F0E6D2', roughness: 0.7, perforated: true, normal: 'perforation', normalScale: 1 },
      mat_rubber: { color: '#2B2B2A', roughness: 0.85 },
      mat_fabric: { color: '#2F3135', roughness: 0.85, normal: 'weave', normalScale: 0.9, sheen: 0.3, sheenColor: '#7d828a', doubleSide: true },
      mat_pad: { color: '#2A2C2F', roughness: 0.55, normal: 'rings-pad', normalScale: 0.16 },
      mat_status: { color: '#3A3D3B', roughness: 0.5, emissive: '#000000', emissiveIntensity: 0 },
      mat_tray: { color: '#3553C9', roughness: 0.66 },
      mat_candle_1: { color: '#F7EEDC', roughness: 0.62 },
      mat_candle_2: { color: '#FF714A', roughness: 0.62 },
      mat_candle_3: { color: '#F7EEDC', roughness: 0.62 },
      mat_vinyl: { color: '#1E1F21', roughness: 0.45, normal: 'rings-record', normalScale: 0.15 },
      mat_label_coral: { color: '#FF714A', roughness: 0.66 },
      mat_label_cobalt: { color: '#3553C9', roughness: 0.66 },
      mat_ball_orange: { color: '#EC7433', roughness: 0.7 },
      mat_ball_cream: { color: '#F1E6CF', roughness: 0.7 },
      mat_ball_seam: { color: '#2A2C2F', roughness: 0.75 },
      mat_net: { color: '#F6F0E4', roughness: 0.85, doubleSide: true },
      mat_plate: { color: '#F5EEE2', roughness: 0.62 },
      mat_cloche: { color: '#F2BE4B', roughness: 0.62 },
      mat_bin: { color: '#E2D6C0', roughness: 0.7 },
      mat_card_light: { color: '#F2E8D5', roughness: 0.68 },
      mat_card_dark: { color: '#2A2C2F', roughness: 0.7 },
      mat_card_mark: { color: '#FF714A', roughness: 0.66 },
      ...food,
    },
  },
  L: {
    id: 'L',
    name: 'Satin Enamel',
    summary:
      'Locked production direction. Enamel Workshop construction and perforation signature with Satin Studio restraint: cream satin bodies, one enamel insert per object, brushed satin metal, crisp edges. Keeps A’s coloured candles and covered dish.',
    ui: { ...shared, accentText: '#202320' },
    status: { accept: '#3BE08A', decline: '#E53E3E', neutral: '#6E7175' },
    geometry: { bevelRatio: 0.16, bevelSegments: 4, fullness: 1.04 },
    signature: {
      kind: 'perforation',
      description: 'One row of inset perforations, spacing equal to band height. Whole dots only, centred with at least one pitch of margin. Manufactured supports only, never food.',
      placement: ['tray band', 'card border', 'scanner collar', 'record-player plinth band', 'backboard frame', 'plate rim band'],
    },
    style: { cake: 'drip', card: 'panel-id', clip: 'metal', scanner: 'window', cloche: 'metal', record: 'band', hoop: 'refined', inkEdges: true },
    shadow: { opacity: 0.5, color: '#3a2f24' },
    surfaces: {
      mat_body: { color: '#ECE5D8', roughness: 0.46 },
      mat_body_ink: { color: '#25282B', roughness: 0.5 },
      mat_body_alt: { color: '#DAD3C6', roughness: 0.48 },
      mat_body_shadow: { color: '#A59E92', roughness: 0.6 },
      mat_accent: { color: '#FF714A', roughness: 0.62 },
      mat_insert: { color: '#2C47A6', roughness: 0.66 },
      mat_insert_warm: { color: '#EDB449', roughness: 0.62 },
      mat_anodized: { color: '#E8603C', roughness: 0.34, metalness: 1 },
      mat_metal: { color: '#CFCAC2', roughness: 0.42, metalness: 1 },
      mat_metal_dark: { color: '#5A5C5E', roughness: 0.4, metalness: 1 },
      mat_edge: { color: '#4A4C50', roughness: 0.55 },
      mat_signature: { color: '#ECE5D8', roughness: 0.52, perforated: true, normal: 'perforation', normalScale: 1 },
      mat_signature_light: { color: '#ECE5D8', roughness: 0.52, perforated: true, normal: 'perforation', normalScale: 1 },
      mat_signature_dark: { color: '#FFFFFF', roughness: 0.5, perforated: 'dark', normal: 'perforation', normalScale: 1 },
      mat_rubber: { color: '#2B2B2A', roughness: 0.85 },
      mat_fabric: { color: '#2F3135', roughness: 0.85, normal: 'weave', normalScale: 0.9, sheen: 0.3, sheenColor: '#7d828a', doubleSide: true },
      mat_pad: { color: '#1C1E21', roughness: 0.42 },
      mat_print: { color: '#8E9196', roughness: 0.5 },
      mat_status: { color: '#6E7175', roughness: 0.45, emissive: '#000000', emissiveIntensity: 0 },
      mat_tray: { color: '#2C47A6', roughness: 0.74 },
      mat_candle_1: { color: '#F2603B', roughness: 0.45 },
      mat_candle_2: { color: '#2C47A6', roughness: 0.45 },
      mat_candle_3: { color: '#E8A93A', roughness: 0.45 },
      mat_vinyl: { color: '#1B1C1E', roughness: 0.4, normal: 'rings-record', normalScale: 0.12 },
      mat_label_coral: { color: '#FF714A', roughness: 0.62 },
      mat_label_cobalt: { color: '#2C47A6', roughness: 0.62 },
      mat_ball_orange: { color: '#E8702F', roughness: 0.64 },
      mat_ball_cream: { color: '#EEE3CC', roughness: 0.64 },
      mat_ball_seam: { color: '#26282B', roughness: 0.7 },
      mat_net: { color: '#F2EEE6', roughness: 0.8 },
      mat_plate: { color: '#F3EEE4', roughness: 0.32 },
      mat_cloche: { color: '#D8D4CC', roughness: 0.45, metalness: 1 },
      mat_bin: { color: '#ECE5D8', roughness: 0.46 },
      mat_card_light: { color: '#EFE8DB', roughness: 0.44 },
      mat_card_dark: { color: '#25282B', roughness: 0.48 },
      mat_card_mark: { color: '#F3ECDD', roughness: 0.5 },
      mat_glaze_vanilla: { color: '#FFF8EC', roughness: 0.36 },
      mat_glaze_cocoa: { color: '#3A2219', roughness: 0.3 },
      ...food,
    },
  },
} satisfies Record<Exclude<DirectionId, 'L2'>, DirectionTokens> as unknown as Record<DirectionId, DirectionTokens>;

/**
 * L2 — fidelity candidate (checkpoint 2 rework): the locked L identity with premium surfaces:
 * laminated printed cards, chrome hardware, printed woven strap, glass reader face, soft
 * buttercream sheen, glazed tray. Same palette, silhouettes and signature.
 */
{
  const L = DIRECTIONS.L;
  const up: Record<string, SurfaceSpec> = {
    mat_body: { color: '#EEE7DA', roughness: 0.4, clearcoat: 0.3, clearcoatRoughness: 0.35 },
    mat_body_alt: { color: '#DBD4C7', roughness: 0.42, clearcoat: 0.25, clearcoatRoughness: 0.35 },
    mat_body_ink: { color: '#16181B', roughness: 0.24, clearcoat: 1, clearcoatRoughness: 0.06 },
    // White PVC core: the thin bright line round a laminated card's edge.
    mat_edge: { color: '#F1EDE6', roughness: 0.5 },
    mat_holo: { color: '#FFFFFF', roughness: 0.22, metalness: 0.85, holo: true },
    mat_bezel: { color: '#D8CDBA', roughness: 0.18, metalness: 1 },
    mat_status: { color: '#0F1013', roughness: 0.3, emissive: '#000000', emissiveIntensity: 0 },
    // Dark glyph on the lit window (LED-display contrast in any light).
    mat_status_symbol: { color: '#121416', roughness: 0.5, emissive: '#000000', emissiveIntensity: 0 },
    mat_metal: { color: '#E4E3E0', roughness: 0.14, metalness: 1 },
    mat_metal_dark: { color: '#8A8C8F', roughness: 0.2, metalness: 1 },
    mat_anodized: { color: '#F0663F', roughness: 0.26, metalness: 1 },
    mat_cloche: { color: '#DAD6CF', roughness: 0.3, metalness: 1, anisotropy: 0.7 },
    mat_card_light: { color: '#FFFFFF', roughness: 0.45, clearcoat: 1, clearcoatRoughness: 0.1, print: 'card-light' },
    mat_card_dark: { color: '#FFFFFF', roughness: 0.45, clearcoat: 1, clearcoatRoughness: 0.1, print: 'card-dark' },
    mat_fabric: { color: '#FFFFFF', roughness: 0.82, print: 'strap', normal: 'weave', normalScale: 0.9, sheen: 0.7, sheenColor: '#b9c4e8', doubleSide: true },
    mat_pad: { color: '#101214', roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 },
    mat_print: { color: '#9EA2A8', roughness: 0.4 },
    mat_tray: { color: '#2C47A6', roughness: 0.38, clearcoat: 0.8, clearcoatRoughness: 0.12 },
    mat_frosting_vanilla: { color: '#F6ECDB', roughness: 0.55, sheen: 0.35, sheenColor: '#fff6e8' },
    mat_frosting_cocoa: { color: '#5B3627', roughness: 0.48, sheen: 0.3, sheenColor: '#8a5a44' },
    mat_glaze_vanilla: { color: '#FFF9EE', roughness: 0.22, clearcoat: 0.6, clearcoatRoughness: 0.15 },
    mat_glaze_cocoa: { color: '#3A2219', roughness: 0.18, clearcoat: 0.8, clearcoatRoughness: 0.1 },
    mat_candle_1: { color: '#F2603B', roughness: 0.32, clearcoat: 0.5, clearcoatRoughness: 0.2 },
    mat_candle_2: { color: '#2C47A6', roughness: 0.32, clearcoat: 0.5, clearcoatRoughness: 0.2 },
    mat_candle_3: { color: '#E8A93A', roughness: 0.32, clearcoat: 0.5, clearcoatRoughness: 0.2 },
    mat_plate: { color: '#F7F2E9', roughness: 0.22, clearcoat: 0.8, clearcoatRoughness: 0.08 },
  };
  DIRECTIONS.L2 = {
    ...L,
    id: 'L2',
    name: 'Satin Enamel · premium',
    summary: 'The locked L identity with premium surfaces and a sunlit studio: laminated printed badges, chrome hardware, printed woven straps, glass reader faces, buttercream sheen, glazed ceramics.',
    style: { ...L.style, card: 'print' },
    surfaces: { ...L.surfaces, ...up },
  };
}

function flameMaterial(name: string, core: string, rim: string): ShaderMaterial {
  return new ShaderMaterial({
    name,
    uniforms: {
      uCore: { value: new Color(core) },
      uRim: { value: new Color(rim) },
      uOpacity: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying float vHeight;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vHeight = position.y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uCore;
      uniform vec3 uRim;
      uniform float uOpacity;
      varying vec3 vNormal;
      varying float vHeight;
      void main() {
        float facing = clamp(abs(vNormal.z), 0.0, 1.0);
        // Pale core low in the flame, warm towards the tip; the silhouette fades instead of
        // drawing an outline.
        float core = smoothstep(0.2, 0.9, facing) * (1.0 - smoothstep(0.03, 0.15, vHeight));
        vec3 col = mix(uRim, uCore, core);
        float alpha = smoothstep(0.02, 0.5, facing) * uOpacity;
        gl_FragColor = vec4(col, alpha);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
}

/**
 * Holographic foil (fidelity pass 2): a metallic rainbow sunburst whose hue rotates with the
 * surface's angle to the viewer, so colour sweeps across the seal as the card swings. A small
 * emissive lift keeps it alive in shade. Standard material + a hue rotation, no extra pass.
 */
function holoFoil(name: string, spec: SurfaceSpec): Material {
  const tex = holoPattern();
  const m = new MeshStandardMaterial({
    name, color: new Color(spec.color), roughness: spec.roughness, metalness: spec.metalness ?? 0.85,
    map: tex, emissive: new Color('#ffffff'), emissiveMap: tex, emissiveIntensity: 0.22,
  });
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        vec3 holoHue(vec3 c, float a) {
          const vec3 k = vec3(0.57735);
          float ca = cos(a);
          return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
        }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec3 holoView = isOrthographic ? vec3(0.0, 0.0, 1.0) : normalize(vViewPosition);
        vec3 holoN = normalize(vNormal);
        float holoShift = 7.0 * (holoN.x * 0.7 + holoN.y * 0.45) + 2.5 * dot(holoN, holoView);
        diffuseColor.rgb = holoHue(diffuseColor.rgb, holoShift);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance = holoHue(totalEmissiveRadiance, holoShift);`);
  };
  m.customProgramCacheKey = () => 'holo-foil-v1';
  return m;
}

function buildMaterial(name: string, spec: SurfaceSpec): Material {
  if (spec.flame) return flameMaterial(name, spec.flame.core, spec.flame.rim);
  if (spec.unlit) {
    return new MeshBasicMaterial({
      name,
      color: new Color(spec.color),
      toneMapped: false,
      transparent: spec.opacity !== undefined,
      opacity: spec.opacity ?? 1,
      depthWrite: spec.opacity === undefined,
    });
  }
  if (spec.holo) return holoFoil(name, spec);
  const needsPhysical = (spec.clearcoat ?? 0) > 0 || (spec.sheen ?? 0) > 0 || (spec.anisotropy ?? 0) > 0 || (spec.iridescence ?? 0) > 0;
  const params = {
    name,
    color: new Color(spec.color),
    roughness: spec.roughness,
    metalness: spec.metalness ?? 0,
    side: spec.doubleSide ? DoubleSide : FrontSide,
  };
  const m = needsPhysical ? new MeshPhysicalMaterial(params) : new MeshStandardMaterial(params);
  if (m instanceof MeshPhysicalMaterial) {
    m.clearcoat = spec.clearcoat ?? 0;
    m.clearcoatRoughness = spec.clearcoatRoughness ?? 0.4;
    if (spec.sheen) {
      m.sheen = spec.sheen;
      m.sheenColor = new Color(spec.sheenColor ?? '#ffffff');
      m.sheenRoughness = 0.6;
    }
    if (spec.anisotropy) m.anisotropy = spec.anisotropy;
    if (spec.iridescence) m.iridescence = spec.iridescence;
  }
  if (spec.print) {
    const tex = spec.print === 'strap' ? strapPrint() : cardPrint(spec.print === 'card-light' ? 'light' : 'dark');
    if (spec.print !== 'strap') {
      // Card caps use world UVs in scene units: map the card rectangle onto the print.
      tex.repeat.set(1 / 0.86, 1 / 1.3);
      tex.offset.set(0.5, 0.5);
    } else {
      // Strap UVs run in weave tiles (0.06 units); one print tile spans the strap width.
      tex.repeat.set(0.6, 0.3);
    }
    m.map = tex;
  }
  if (spec.emissive) {
    m.emissive = new Color(spec.emissive);
    m.emissiveIntensity = spec.emissiveIntensity ?? 1;
  }
  if (spec.normal) {
    const tex =
      spec.normal === 'stipple' ? stippleNormal()
      : spec.normal === 'weave' ? weaveNormal()
      : spec.normal === 'rings-pad' ? ringNormal(9)
      : spec.normal === 'rings-record' ? ringNormal(22)
      : spec.normal === 'rings-target' ? ringNormal(3)
      : perforationMaps().normalMap;
    m.normalMap = tex;
    const s = spec.normalScale ?? 1;
    m.normalScale = new Vector2(s, s);
  }
  if (spec.perforated) m.map = spec.perforated === 'dark' ? perforationDarkMap() : perforationMaps().map;
  return m;
}

export class MaterialLibrary {
  readonly direction: DirectionTokens;
  private readonly materials = new Map<string, Material>();

  constructor(direction: DirectionId) {
    this.direction = DIRECTIONS[direction];
  }

  get(name: string): Material {
    let m = this.materials.get(name);
    if (!m) {
      const spec = this.direction.surfaces[name];
      if (!spec) throw new Error(`Unknown material ${name}`);
      m = buildMaterial(name, spec);
      this.materials.set(name, m);
    }
    return m;
  }

  /** A private instance for materials that animate (status light, flames, fades). */
  unique(name: string): Material {
    const spec = this.direction.surfaces[name];
    if (!spec) throw new Error(`Unknown material ${name}`);
    return buildMaterial(name, spec);
  }

  private lowDetail = false;
  private readonly saved = new Map<Material, { normalMap: unknown; sheen: number; envMapIntensity: number }>();

  /**
   * Low tier (Master §9): simplified materials — no normal maps or sheen, softer environment
   * response. Colours, silhouettes and timing are unchanged. Reversible.
   */
  setLowDetail(enabled: boolean): void {
    if (enabled === this.lowDetail) return;
    this.lowDetail = enabled;
    for (const m of this.materials.values()) {
      const std = m as MeshStandardMaterial & { sheen?: number };
      if (!(std instanceof MeshStandardMaterial)) continue;
      if (enabled) {
        this.saved.set(m, { normalMap: std.normalMap, sheen: std.sheen ?? 0, envMapIntensity: std.envMapIntensity });
        std.normalMap = null;
        if (std instanceof MeshPhysicalMaterial) std.sheen = 0;
        std.envMapIntensity = 0.8;
      } else {
        const prev = this.saved.get(m);
        if (!prev) continue;
        std.normalMap = prev.normalMap as MeshStandardMaterial['normalMap'];
        if (std instanceof MeshPhysicalMaterial) std.sheen = prev.sheen;
        std.envMapIntensity = prev.envMapIntensity;
      }
      std.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const m of this.materials.values()) m.dispose();
    this.materials.clear();
    this.saved.clear();
  }
}
