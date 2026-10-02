/**
 * Recipe types for the master importer (scripts/masters/compose.ts). One recipe per scene in
 * `scripts/masters/recipes/<scene>.ts`; see scripts/masters/README.md for the order in which every
 * field is applied and a worked example.
 *
 * Coordinates: every vector is in the LOCAL space of the node it is relative to (the `anchor` for
 * a master placement, the `parent` for a created node), in scene units, y-up, before quantisation.
 * Exception: a Vec3 `NodeMap.pivot` is in the node's parent space before reparenting (scan units for
 * a top-level master node).
 */
import type { Document } from '@gltf-transform/core';
import type { Object3D } from 'three';
import type { ModelContext } from '../../models/types.ts';

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];

/**
 * A point on the axis-aligned bounding box of a master node's subtree, measured in the space it is
 * used in (the anchor's space for `align`, the parent's space for `create.at`). Fractions per axis:
 * [0.5, 0, 0.5] is the bottom centre, [0.5, 0.5, 0] the back centre (−z face), [0.5, 0.5, 1] the
 * front centre (+z, towards the player in every master).
 */
/** A point of a master node's vertex box, or `origin`: the node's own pivot (no geometry needed). */
export type BoxPoint = 'center' | 'bottom' | 'top' | 'back' | 'front' | 'origin' | Vec3;

/** A point on a master node's box. `node` is a master node name or path (`a/b`), resolved in its master. */
export interface NodePoint {
  node: string;
  point: BoxPoint;
}

export interface MaterialPolicy {
  /** New material name, e.g. a library name (`mat_label_coral`) so a preset can rebind it at load. */
  rename?: string;
  /**
   * Transmission → alpha blend with this opacity: drops KHR_materials_transmission / volume and sets
   * alphaMode BLEND with baseColorFactor.a = opacity (the studio's single-pass renderer has no
   * transmission pass to spare).
   */
  transmissionToAlpha?: number;
  /**
   * Own environment map at this envMapIntensity (polished metal; `true` = 1.1). Travels as material
   * extras `{ ownEnv: n }`; `prepareImported` applies it. Metallic materials (metalness ≥ 0.5) get
   * 1.1 automatically at runtime; set `false` to opt a metal out.
   */
  ownEnv?: number | boolean;
  /** KHR_materials_emissive_strength value (adds the extension if missing). */
  emissiveStrength?: number;
  doubleSided?: boolean;
  /** Factor overrides (linear colour). */
  baseColorFactor?: [number, number, number, number];
  roughness?: number;
  metalness?: number;
  /** Arbitrary material extras (become `material.userData` at load). */
  extras?: Record<string, unknown>;
}

export interface NodeMap {
  /** New node name (a contract name such as `ball_mesh`). */
  rename?: string;
  /**
   * Reparent under this node (builder node, created node or renamed master node, by final name;
   * default: the master's anchor). The node keeps its scene-space placement: its local transform
   * is recomputed. Every mapped node leaves the master's own grouping nodes, even when only
   * renamed; its siblings do not follow (map them with `parent` too). Unmapped master nodes travel
   * with their (mapped) ancestor, and grouping nodes left empty are removed.
   */
  parent?: string;
  /**
   * Move this node's origin to a point, keeping its geometry where it is (its mesh and children are
   * compensated). A NodePoint (box point of this or another master node) or a Vec3 in the node's
   * current parent space BEFORE reparenting: for a top-level master node that is the master's own
   * scan-unit frame (before scale/rotation/offset), not the anchor's scene units. Prefer a
   * NodePoint. This is how a master node becomes the pivot of an authored node.
   *
   * Every mapped node leaves the importer as an empty transform (pivot, unit scale): its own mesh
   * moves to a child `<final name>_mesh`, so quantisation cannot move the pivot.
   */
  pivot?: NodePoint | Vec3;
  /** Node extras (become `userData` at load), e.g. `{ noShadowCast: true }`. */
  extras?: Record<string, unknown>;
}

export interface CreateNode {
  /** Name of the new empty node (a contract node such as `record_authored`). */
  name: string;
  /** Parent node, by final name (builder node, earlier created node or renamed master node). */
  parent: string;
  /** Origin: a Vec3 in the parent's space, or a box point of a master node (measured in the parent's space). */
  at?: Vec3 | NodePoint;
  rotation?: Quat;
  scale?: Vec3;
  extras?: Record<string, unknown>;
}

export interface MasterRecipe {
  /** File in models/masters/ (an absolute path is used as is; tests/masters.test.ts). */
  file: string;
  /** Node (by final name) whose local space the master is placed in. Created nodes may be anchors. */
  anchor: string;
  /** Uniform scale from scan units to scene units. */
  scale: number;
  /** Rotation applied after the scale (quaternion x, y, z, w). */
  rotation?: Quat;
  /** Translation in the anchor's space. Ignored when `align` is set. */
  offset?: Vec3;
  /** Translate so this box point of a master node (after scale and rotation) lands at `to` in anchor space. */
  align?: NodePoint & { to: Vec3 };
  /** Master nodes (subtrees) deleted before anything else. */
  drop?: string[];
  /** Master material name → policy. An unnamed material is addressed as `#<index>`. */
  materials?: Record<string, MaterialPolicy>;
  /** Master mesh node → decimation ratio (0–1, meshoptimizer via gltf-transform) or {ratio, error}. */
  decimate?: Record<string, number | { ratio: number; error?: number }>;
  /** Empty nodes created after the master is placed (in order). */
  create?: CreateNode[];
  /** Master node (name or `a/b` path) → mapping, applied in object order after `create`. */
  nodes?: Record<string, NodeMap>;
  /** Master nodes whose meshes (whole subtree) skip the shadow pass (`userData.noShadowCast`). */
  noShadowCast?: string[];
  /**
   * Deterministic edit of the master's own document (scan units, before decimate and merge): runs
   * after `drop` and `materials`, so material names are already the renamed ones. For geometry and
   * texture work no policy covers (v1.5 Birthday: the hand-finished frosting, generated relief and
   * roughness maps, re-tessellated candles). Must be a pure function of the master.
   */
  transform?: (doc: Document, log: (line: string) => void) => void | Promise<void>;
}

/** Join static same-material meshes under `parent` into one mesh child per material. */
export interface JoinSpec {
  /** Node (final name) whose mesh descendants are joined, in its local space. */
  parent: string;
  /** Only these descendants (final names; default: every mesh descendant that is not a contract node). */
  nodes?: string[];
  /** Name prefix of the joined nodes (default: parent name): `<prefix>_<material>`. */
  prefix?: string;
}

/** A generated low-poly shadow caster (`userData.shadowProxy`, see models/shadowProxy.ts). */
export interface ShadowProxySpec {
  name: string;
  /** Nodes (final names) whose mesh subtrees are cloned, joined and decimated; they get `noShadowCast`. */
  from: string[];
  /** Parent of the proxy (final name); the proxy is built in its local space. */
  parent: string;
  /** Decimation target ratio of the joined clone. */
  ratio: number;
  /** Simplifier error bound (fraction of mesh radius). Default 0.02. */
  error?: number;
}

/** Raw 8-bit image handed to a variant generator (channels 3 or 4, row-major, top row first). */
export interface RawImage {
  data: Uint8Array;
  width: number;
  height: number;
  channels: 3 | 4;
}

/**
 * A preset stored in the GLB with KHR_materials_variants: a copy of material `of` named `name`,
 * with generated or overridden inputs. `models/imported.ts` (`loadMaterialVariants`) switches
 * between them at runtime.
 */
export interface MaterialVariantSpec {
  /** Variant name (e.g. 'cream'); the source material is mapped to the recipe's default variant. */
  variant: string;
  /** Source material (final name, after renames). */
  of: string;
  /** Name of the generated material. */
  name: string;
  /** Pixel function over the source's base-colour image; must be deterministic. */
  baseColor?: (image: RawImage) => RawImage | Promise<RawImage>;
  baseColorFactor?: [number, number, number, number];
}

/**
 * Texture keys are `'<final material name>/<slot>'`, slot as gltf-transform names it:
 * `baseColorTexture`, `normalTexture`, `metallicRoughnessTexture`, `occlusionTexture`,
 * `emissiveTexture`, `clearcoatNormalTexture`, `anisotropyTexture`, `sheenColorTexture`… A texture
 * shared by several materials or slots matches if any of its keys does.
 *
 * Automatic rules (no recipe entry needed):
 * - data slots (any `*normal*` slot, `anisotropyTexture`) are exact lossless WebP;
 * - LUTs (short edge ≤ 16 px, e.g. the turntable's 8192×4 groove maps, the cake's 256×4 wax ramps)
 *   keep their size whatever `maxSize` says and are exact lossless WebP.
 */
export interface TexturePolicy {
  /** Longest-edge cap in pixels (default 2048). */
  maxSize?: number;
  /** Per-texture caps (can only lower the cap), e.g. `{ 'hoop_rope/normalTexture': 512 }`. */
  caps?: Record<string, number>;
  /** WebP quality for colour/ORM maps (default 90). Data slots and LUTs are always lossless. */
  quality?: number;
  /** Extra textures encoded as exact lossless WebP, e.g. `['paper_label/baseColorTexture']`. */
  lossless?: string[];
  /** Textures never resized (`maxSize` and `caps` ignored), e.g. a print whose texels must stay 1:1. */
  keepSize?: string[];
}

export interface SceneRecipe {
  scene: string;
  /** Human-readable status for the export log, e.g. 'no masters yet'. */
  status?: string;
  /**
   * The code-authored part of the scene. Omitted: the scene's existing builder from
   * scripts/export-models.ts. `null`: no builder (the masters alone, plus created nodes).
   */
  builder?: ((ctx: ModelContext) => Object3D) | null;
  /**
   * Empty nodes created before any master is merged (e.g. the scene root when `builder` is null:
   * parent '@scene'). Box-point origins are not available here (no master yet).
   */
  create?: CreateNode[];
  /** Builder nodes (subtrees) removed before the masters are merged. */
  dropBuilderNodes?: string[];
  /** Masters, merged in this order. Empty: the scene exports exactly as before (builder only). */
  masters: MasterRecipe[];
  /** Scene-level joins, after every master is mapped. */
  join?: JoinSpec[];
  shadowProxies?: ShadowProxySpec[];
  /** Variant names; the first is the default (the materials as authored). */
  variants?: string[];
  materialVariants?: MaterialVariantSpec[];
  textures?: TexturePolicy;
  /**
   * Deterministic edit of the composed scene document after the variants (before the contract
   * check and the optimisation chain): for textures on builder materials no master carries (v1.5
   * Sports: the stand's moulded-plastic and powder-coat micro-normals). Must be a pure function.
   */
  finish?: (doc: Document, log: (line: string) => void) => void | Promise<void>;
  /** Every node the runtime looks up by name; a missing one fails the export. */
  contract: readonly string[];
}
