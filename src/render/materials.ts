import { Color, DoubleSide, type Material, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, ShaderMaterial, Vector2 } from 'three';
import { perforationMaps, ringNormal, stippleNormal, weaveNormal } from './textures.ts';

/**
 * Material naming and roughness convention (asset contract, Master §8):
 *   mat_<role>[_<preset>]  — scenes reference names only; the direction supplies values.
 * Roughness bands: satin bodies 0.40–0.55 · enamel bodies 0.62–0.75 · metal 0.25–0.40 ·
 * food 0.55–0.85. Metalness is 0 or 1 except anodised/painted metal.
 */

export type DirectionId = 'A' | 'B';

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
  normal?: 'stipple' | 'perforation' | 'weave' | 'rings-pad' | 'rings-record';
  /** Unlit, exact colour (flames). Never tone mapped so they read as light sources. */
  unlit?: boolean;
  opacity?: number;
  /** View-dependent unlit flame: hot core facing the camera, orange rim. */
  flame?: { core: string; rim: string };
  normalScale?: number;
  perforated?: boolean;
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

export const DIRECTIONS: Record<DirectionId, DirectionTokens> = {
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
};

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
        float core = smoothstep(0.35, 0.95, facing) * (1.0 - smoothstep(0.06, 0.14, vHeight));
        vec3 col = mix(uRim, uCore, core);
        gl_FragColor = vec4(col, uOpacity);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
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
  const needsPhysical = (spec.clearcoat ?? 0) > 0 || (spec.sheen ?? 0) > 0;
  const params = {
    name,
    color: new Color(spec.color),
    roughness: spec.roughness,
    metalness: spec.metalness ?? 0,
    side: spec.doubleSide ? DoubleSide : undefined,
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
      : perforationMaps().normalMap;
    m.normalMap = tex;
    const s = spec.normalScale ?? 1;
    m.normalScale = new Vector2(s, s);
  }
  if (spec.perforated) m.map = perforationMaps().map;
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

  dispose(): void {
    for (const m of this.materials.values()) m.dispose();
    this.materials.clear();
  }
}
