import { type Material, type Mesh, type Object3D, PlaneGeometry } from 'three';
import { ContactShadow } from '../src/render/contactShadow.ts';
import { BIN_POS, BIN_YAW, birthdayBounds, STAND } from './birthdayContract.ts';
import { type FlameRig, rigCandleFire, SmokeRig } from './birthdayFire.ts';
import { BIRTHDAY_GLB_NODES } from './birthdayParts.ts';
import { buildCakeGeometry, type CakePreset } from './cake.ts';
import { BIN, buildDisposalBin } from './disposalBin.ts';
import type { MaterialVariants } from './imported.ts';
import { applyShadowProxies, disposeShadowProxies } from './shadowProxy.ts';
import { collectNodes, disposeGeometry, type BuiltModel, type ModelContext } from './types.ts';

/**
 * Birthday runtime rig over the cake hierarchy (the v1.2 master GLB, or the v1.1 code-authored
 * cake for tooling) plus the shared bin: contact shadow, the candle fire (v1.5: volumetric flames,
 * their light and the smoke, models/birthdayFire.ts), bin placement and frosting presets.
 */

/** Nodes the rig and the scene look up: the GLB's contract plus the shared bin's. */
export const BIRTHDAY_NODES = ['birthday_root', 'cake_authored', 'cake_secondary', 'cake_shadow', 'bin_root', 'bin_lid'] as const;
export { BIRTHDAY_GLB_NODES };

export interface CandleRig {
  candle: Object3D;
  seatedY: number;
  /** flame_NN: the flame's anchor on the candle (the fire rig draws relative to it). */
  flame: Object3D;
  fire: FlameRig;
  wick: Object3D;
}

export interface BirthdayRig {
  root: Object3D;
  nodes: Record<string, Object3D>;
  shadows: ContactShadow[];
  cakeShadow: ContactShadow;
  binShadow: ContactShadow;
  candles: CandleRig[];
  /** Every candle's smoke streaklines (v1.5). */
  smoke: SmokeRig;
  flapL: Object3D;
  flapR: Object3D;
  /** Shade uniforms shared by every cake material (frosting of both presets, candles). */
  binShade: BinShade;
  bounds: ReturnType<typeof birthdayBounds>;
  setPreset(preset: CakePreset): void;
  dispose(): void;
}

export type BirthdayModel = BirthdayRig & BuiltModel;

/**
 * Bin shade: inside the shared bin, below its rim, the ink liner blocks the key and most of the
 * fill, so whatever of the dropped cake still shows through the opening (the candle tips, the
 * crown rosettes) darkens with depth instead of staying key-lit on the black interior. A
 * world-height ramp on the cake's own materials: full light BIN_SHADE.above the rim (in the
 * mouth of the bin), BIN_SHADE.floor of it BIN_SHADE.depth below, so the seated candle tips (4 cm
 * under the rim) sink into the dark with the cake instead of reading as confetti. `uBinShadeOn` gates it to the cake over the bin (set only while the
 * whole cake is above the rim, so switching it never changes a pixel).
 */
export const BIN_SHADE = { above: 0.02, depth: 0.05, floor: 0.06 } as const;

export interface BinShade {
  /** World height of the bin's rim top. */
  readonly rimY: { value: number };
  readonly on: { value: number };
}

function patchBinShade(material: Material, shade: BinShade): void {
  if (material.userData.binShade) return;
  material.userData.binShade = true;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uBinRimY = shade.rimY;
    shader.uniforms.uBinShadeOn = shade.on;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vBinY;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n  vBinY = (modelMatrix * vec4(transformed, 1.0)).y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vBinY;\nuniform float uBinRimY;\nuniform float uBinShadeOn;')
      .replace(
        '#include <opaque_fragment>',
        `outgoingLight *= mix(1.0, ${BIN_SHADE.floor.toFixed(3)}, uBinShadeOn * (1.0 - smoothstep(uBinRimY - ${BIN_SHADE.depth.toFixed(3)}, uBinRimY + ${BIN_SHADE.above.toFixed(3)}, vBinY)));\n#include <opaque_fragment>`,
      );
  };
  material.customProgramCacheKey = () => 'birthday-bin-shade-v1';
  material.needsUpdate = true;
}

/** Candle nodes present under the cake (six on the master, three on the v1.1 tooling cake), in order. */
function candleIds(root: Object3D): string[] {
  const ids: string[] = [];
  for (let i = 1; root.getObjectByName(`candle_${String(i).padStart(2, '0')}`); i++) ids.push(String(i).padStart(2, '0'));
  return ids;
}

/**
 * `variants`: the GLB's frosting presets (KHR_materials_variants: vanilla, cocoa). Without them
 * (the v1.1 tooling cake) presets swap the library frosting and glaze materials as before.
 */
export function rigBirthday(root: Object3D, binRoot: Object3D, lib: ModelContext['lib'], preset: CakePreset = 'vanilla', variants?: MaterialVariants): BirthdayRig {
  const dir = lib.direction;
  root.add(binRoot);
  binRoot.position.copy(BIN_POS);
  binRoot.rotation.set(0, BIN_YAW, 0);
  applyShadowProxies(root);
  const nodes = collectNodes(root, BIRTHDAY_NODES);

  const replace = (name: string, shadow: ContactShadow) => {
    const placeholder = root.getObjectByName(name)!;
    shadow.position.copy(placeholder.position);
    placeholder.parent!.add(shadow);
    placeholder.removeFromParent();
    return shadow;
  };
  // The stand's contact: tight under the foot, the soft layer spreading to the plate's footprint.
  const cakeShadow = replace('cake_shadow', new ContactShadow({
    name: 'cake_shadow', width: STAND.foot * 2, depth: STAND.foot * 2, spread: [1.9, 2.1], opacity: dir.shadow.opacity, line: 0.42, color: dir.shadow.color,
  }));
  const binShadow = replace('bin_shadow', new ContactShadow({
    name: 'bin_shadow', width: BIN.radius * 1.9, depth: BIN.radius * 1.9, spread: [1.15, 1.5], opacity: dir.shadow.opacity, line: 0.45, color: dir.shadow.color,
  }));
  nodes.cake_shadow = cakeShadow;

  // The cake's own materials (both frosting presets, the candles): imported `cake_*` materials
  // under cake_secondary, plus the variants not currently assigned. The stand stays out of the bin.
  const binShade: BinShade = { rimY: { value: BIN.rimTop }, on: { value: 0 } };
  const cakeMaterials = new Set<Material>();
  const isCake = (m: Material) => m.name.startsWith('cake_') && !m.name.startsWith('cake_stand');
  nodes.cake_secondary!.traverse((o) => {
    const m = (o as Mesh).material;
    if ((o as Mesh).isMesh && !o.userData.shadowProxy) for (const x of Array.isArray(m) ? m : [m]) if (isCake(x)) cakeMaterials.add(x);
  });
  for (const m of variants?.materials ?? []) if (isCake(m)) cakeMaterials.add(m);
  for (const m of cakeMaterials) patchBinShade(m, binShade);

  // v1.5 fire (#4): each GLB lathe flame becomes a volumetric flame with its light; one ribbon
  // mesh carries every candle's smoke (models/birthdayFire.ts).
  const ids = candleIds(root);
  const flameQuad = new PlaneGeometry(1, 1);
  const candles: CandleRig[] = ids.map((id) => {
    const candle = root.getObjectByName(`candle_${id}`)!;
    const flame = root.getObjectByName(`flame_${id}`)!;
    nodes[`candle_${id}`] = candle;
    nodes[`flame_${id}`] = flame;
    const wick = candle.getObjectByName(`wick_${id}`) ?? candle.getObjectByName('wick')!;
    const fire = rigCandleFire(candle, flame, wick, lib, flameQuad);
    return { candle, seatedY: candle.position.y, flame, fire, wick };
  });
  const smoke = new SmokeRig(nodes.cake_secondary!, candles.length);

  const flapL = root.getObjectByName('bin_flap_l')!;
  const flapR = root.getObjectByName('bin_flap_r')!;

  const setPreset = (next: CakePreset) => {
    if (variants?.names.includes(next)) {
      variants.select(next);
      return;
    }
    const body = root.getObjectByName('cake_body') as Mesh | undefined;
    const drip = root.getObjectByName('cake_drip') as Mesh | undefined;
    if (body) body.material = lib.get(next === 'vanilla' ? 'mat_frosting_vanilla' : 'mat_frosting_cocoa');
    if (drip) drip.material = lib.get(next === 'vanilla' ? 'mat_glaze_vanilla' : 'mat_glaze_cocoa');
  };
  setPreset(preset);

  return {
    root,
    nodes,
    shadows: [cakeShadow, binShadow],
    cakeShadow,
    binShadow,
    candles,
    smoke,
    flapL,
    flapR,
    binShade,
    bounds: birthdayBounds(),
    setPreset,
    dispose() {
      cakeShadow.dispose();
      binShadow.dispose();
      disposeShadowProxies(root);
      for (const c of candles) {
        c.fire.material.dispose();
        c.fire.wickMaterial.dispose();
        c.fire.quad.removeFromParent();
        c.fire.light.removeFromParent();
        c.fire.light.dispose();
      }
      flameQuad.dispose();
      smoke.dispose();
    },
  };
}

/**
 * Tooling (lookdev): the v1.1 code-authored cake + bin geometry and the rig in one call. The v1.2
 * scene is the master GLB (`pnpm models birthday`), which only loads asynchronously; this keeps
 * the lookdev identity tile synchronous.
 */
export function buildBirthday(ctx: ModelContext, preset: CakePreset = 'vanilla'): BirthdayModel {
  const root = buildCakeGeometry(ctx, preset);
  const bin = buildDisposalBin(ctx);
  const rig = rigBirthday(root, bin, ctx.lib, preset);
  return {
    ...rig,
    dispose() {
      rig.dispose();
      disposeGeometry(root);
    },
  };
}
