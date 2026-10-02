import { Color, type Material, type Mesh, type MeshStandardMaterial, type Object3D, PlaneGeometry, Vector3, Vector4 } from 'three';
import { ContactShadow } from '../src/render/contactShadow.ts';
import { BIN_POS, BIN_YAW, birthdayBounds, STAND } from './birthdayContract.ts';
import { createFlameLights, type FlameLights, type FlameRig, patchFlameLight, rigCandleFire, SmokeRig } from './birthdayFire.ts';
import { BIRTHDAY_GLB_NODES } from './birthdayParts.ts';
import { buildCakeGeometry, type CakePreset } from './cake.ts';
import { attachBin, BIN, BIN_CONTACT, binLight, buildDisposalBin, patchBinVisibility } from './disposalBin.ts';
import type { MaterialVariants } from './imported.ts';
import { applyShadowProxies, disposeShadowProxies } from './shadowProxy.ts';
import { BIN_SHADE, type BinShade, type CakePress, type CandleMelt, meltPatch, newCakePress, patchMaterial, pressPatch, ridgePatch, subsurfacePatch } from './cakeShaders.ts';
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
  /** The wick's and the flame's authored heights (the melt lowers both as the top burns down). */
  wickY: number;
  flameY: number;
  /** v1.5 melt uniforms of this candle's own wax material (null on the v1.1 tooling cake). */
  melt: CandleMelt | null;
  /** The master candle under candle_NN (its frame turns with the master's own candle rotation). */
  wax: Object3D | null;
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
  /** The flames' light on the cake's own materials. */
  flameLights: FlameLights;
  flapL: Object3D;
  flapR: Object3D;
  /** Shade uniforms shared by every cake material (frosting of both presets, candles). */
  binShade: BinShade;
  /** v1.5: the candles' dimples and collars in the top tier, and the gloss round them. */
  press: CakePress;
  bounds: ReturnType<typeof birthdayBounds>;
  setPreset(preset: CakePreset): void;
  dispose(): void;
}

export type BirthdayModel = BirthdayRig & BuiltModel;

/**
 * Bin shade: inside the shared bin the cake sees the room only through the bin's mouth. Since
 * v1.5 this is the physically based visibility of `patchBinVisibility` (models/disposalBin.ts:
 * the indirect diffuse and specular light a point at depth d under the mouth still gets; the
 * walls' shadow does the direct light), chained onto the cake's own materials after their
 * frosting / melt patches and the flame light, and switched on (`binShade.on`) once the cake is
 * over the opening with all of it above the rim plus BIN_SHADE.above, so switching it never
 * changes a pixel. (v1.2–v1.4: a ramp to 6 % within 5 cm of the rim, which read as a dimmer in
 * the 36 cm-deep bin.)
 */
export { BIN_SHADE, type BinShade };

/** Linear sRGB of a hex colour. */
const linear = (hex: string) => new Color(hex);

/** The candles' body colours (the stripe LUTs' main colour; the white stripes are the other). */
const WAX_BODY: Record<string, string> = { cake_candle_blue: '#AAC3DE', cake_candle_pink: '#E8B4C1' };

/**
 * v1.5 cake shading, by the role the recipe recorded (`userData.frosting`): the body gets the
 * subsurface wrap and the candles' press; piping and rosettes the wrap and their ridges; pearls
 * nothing of their own (every cake material gets the flame light and the bin's light below). The
 * subsurface tint is the material's own colour, deepened (light that has travelled inside a dyed
 * frosting comes out more saturated; the near-white piping, a butter cream).
 */
function patchFrosting(material: Material, press: CakePress, body: Mesh | null): void {
  const role = material.userData.frosting as string | undefined;
  const c = (material as MeshStandardMaterial).color ?? new Color(1, 1, 1);
  const peak = Math.max(c.r, c.g, c.b, 1e-6);
  const deep: [number, number, number] = [c.r / peak, c.g / peak, c.b / peak];
  const cream = peak > 0.9 && Math.min(c.r, c.g, c.b) / peak > 0.9;
  if (role === 'body' && body) patchMaterial(material, [subsurfacePatch(0.35, deep.map((x) => 0.7 * x) as [number, number, number]), pressPatch(body, press)]);
  else if (role === 'piping') patchMaterial(material, [subsurfacePatch(0.4, (cream ? [1, 0.88, 0.74] : deep).map((x) => 0.6 * x) as [number, number, number]), ridgePatch()]);
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
  attachBin(root, binRoot, lib, BIN_POS, BIN_YAW);
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
    name: 'bin_shadow', ...BIN_CONTACT, spread: [...BIN_CONTACT.spread], opacity: dir.shadow.opacity, color: dir.shadow.color,
  }));
  nodes.cake_shadow = cakeShadow;

  // The cake's own materials (both frosting presets, the candles): imported `cake_*` materials
  // under cake_secondary, plus the variants not currently assigned. The stand stays out of the bin.
  const binShade: BinShade = { rimY: { value: BIN.rimTop }, on: { value: 0 } };
  const press = newCakePress();
  const cakeMaterials = new Set<Material>();
  const isCake = (m: Material) => m.name.startsWith('cake_') && !m.name.startsWith('cake_stand');
  // Candle wax is patched per candle below (each candle melts on its own).
  const isWax = (m: Material) => m.name.startsWith('cake_candle');
  nodes.cake_secondary!.traverse((o) => {
    const m = (o as Mesh).material;
    if ((o as Mesh).isMesh && !o.userData.shadowProxy) for (const x of Array.isArray(m) ? m : [m]) if (isCake(x) && !isWax(x)) cakeMaterials.add(x);
  });
  for (const m of variants?.materials ?? []) if (isCake(m) && !isWax(m)) cakeMaterials.add(m);
  const body = root.getObjectByName('frosting_cake_buttercream') as Mesh | undefined;
  for (const m of cakeMaterials) patchFrosting(m, press, body?.isMesh ? body : null);
  const waxClones: Material[] = [];
  /** Every cake material the flames light (frosting, each candle's wax), patched once at the end. */
  const lit = new Set<Material>(cakeMaterials);
  const flameLights = createFlameLights();

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
    // v1.5: this candle's own wax material, so it melts on its own (models/cakeShaders.ts meltPatch).
    let melt: CandleMelt | null = null;
    const waxNode = candle.getObjectByName(`candle_${id}_wax`);
    const waxMesh = candle.getObjectByName(`candle_${id}_wax_mesh`) as Mesh | undefined;
    if (waxNode && waxMesh?.isMesh && waxMesh.geometry.getAttribute('_profile')) {
      const shared = waxMesh.material as MeshStandardMaterial;
      const own = shared.clone();
      waxClones.push(own);
      waxMesh.material = own;
      melt = { a: { value: new Vector4() }, b: { value: new Vector4() }, dir: { value: { x: 1, y: 0 } }, body: { value: new Vector3().setFromColor(linear(WAX_BODY[shared.name] ?? '#FFFFFF')) } };
      patchMaterial(own, [meltPatch(waxMesh, melt)]);
      lit.add(own);
    } else {
      const m = waxMesh?.material as Material | undefined;
      if (m && isCake(m)) lit.add(m);
    }
    const fire = rigCandleFire(candle, flame, wick, lib, flameQuad, flameLights, ids.indexOf(id));
    return { candle, seatedY: candle.position.y, wickY: wick.position.y, flameY: flame.position.y, melt, wax: waxNode ?? null, flame, fire, wick };
  });
  const smoke = new SmokeRig(root, candles.length);
  // The flames light the cake's own materials, chained after the cake's patches (models/birthdayFire.ts);
  // then the bin's light, once the cake is in it (models/disposalBin.ts patchBinVisibility).
  const light = binLight(binRoot);
  for (const m of lit) {
    patchFlameLight(m, flameLights);
    patchBinVisibility(m, light, binShade.on);
  }

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
    flameLights,
    flapL,
    flapR,
    binShade,
    press,
    bounds: birthdayBounds(),
    setPreset,
    dispose() {
      cakeShadow.dispose();
      binShadow.dispose();
      disposeShadowProxies(root);
      for (const m of waxClones) m.dispose();
      for (const c of candles) {
        c.fire.material.dispose();
        c.fire.wickMaterial.dispose();
        c.fire.quad.removeFromParent();
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
