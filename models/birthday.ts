import { CanvasTexture, Color, type Material, type Mesh, MeshBasicMaterial, type MeshStandardMaterial, type Object3D, PlaneGeometry, type ShaderMaterial, SRGBColorSpace, Mesh as ThreeMesh, Vector3, Vector4 } from 'three';
import { keepPixels } from '../src/render/textures.ts';
import { ContactShadow } from '../src/render/contactShadow.ts';
import { BIN_POS, BIN_YAW, birthdayBounds, STAND } from './birthdayContract.ts';
import { BIRTHDAY_GLB_NODES } from './birthdayParts.ts';
import { buildCakeGeometry, type CakePreset } from './cake.ts';
import { BIN, buildDisposalBin } from './disposalBin.ts';
import type { MaterialVariants } from './imported.ts';
import { applyShadowProxies, disposeShadowProxies } from './shadowProxy.ts';
import { BIN_SHADE, binShadePatch, type BinShade, type CakePress, type CandleMelt, meltPatch, newCakePress, patchMaterial, pressPatch, ridgePatch, subsurfacePatch } from './cakeShaders.ts';
import { collectNodes, disposeGeometry, type BuiltModel, type ModelContext } from './types.ts';

/**
 * Birthday runtime rig over the cake hierarchy (the v1.2 master GLB, or the v1.1 code-authored
 * cake for tooling) plus the shared bin: contact shadow, unique flame materials, smoke wisps, bin
 * placement and frosting presets.
 */

/** Nodes the rig and the scene look up: the GLB's contract plus the shared bin's. */
export const BIRTHDAY_NODES = ['birthday_root', 'cake_authored', 'cake_secondary', 'cake_shadow', 'bin_root', 'bin_lid'] as const;
export { BIRTHDAY_GLB_NODES };

/** Shared camera azimuth: wisps face the fixed orthographic camera. */
const CAMERA_AZIMUTH = (20 * Math.PI) / 180;

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
  flame: Object3D;
  /** Flame node scale at full size (per axis), as authored. */
  flameSize: { x: number; y: number; z: number };
  flameMaterial: ShaderMaterial;
  wick: Object3D;
  wisp: Mesh;
}

export interface BirthdayRig {
  root: Object3D;
  nodes: Record<string, Object3D>;
  shadows: ContactShadow[];
  cakeShadow: ContactShadow;
  binShadow: ContactShadow;
  candles: CandleRig[];
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
 * Bin shade: inside the shared bin, below its rim, the ink liner blocks the key and most of the
 * fill, so whatever of the dropped cake still shows through the opening (the candle tips, the
 * crown rosettes) darkens with depth instead of staying key-lit on the black interior. A
 * world-height ramp on the cake's own materials (models/cakeShaders.ts binShadePatch): full light
 * BIN_SHADE.above the rim, BIN_SHADE.floor of it BIN_SHADE.depth below. `uBinShadeOn` gates it to
 * the cake over the bin (set only while the whole cake is above the rim, so switching it never
 * changes a pixel).
 */
export { BIN_SHADE, type BinShade };

/** Linear sRGB of a hex colour. */
const linear = (hex: string) => new Color(hex);

/** The candles' body colours (the stripe LUTs' main colour; the white stripes are the other). */
const WAX_BODY: Record<string, string> = { cake_candle_blue: '#AAC3DE', cake_candle_pink: '#E8B4C1' };

/**
 * v1.5 cake shading, by the role the recipe recorded (`userData.frosting`): the body gets the
 * subsurface wrap and the candles' press; piping and rosettes the wrap and their ridges; pearls
 * only the bin shade. The subsurface tint is the material's own colour, deepened (light that has
 * travelled inside a dyed frosting comes out more saturated; the near-white piping, a butter cream).
 */
function patchFrosting(material: Material, shade: BinShade, press: CakePress, body: Mesh | null): void {
  const role = material.userData.frosting as string | undefined;
  const c = (material as MeshStandardMaterial).color ?? new Color(1, 1, 1);
  const peak = Math.max(c.r, c.g, c.b, 1e-6);
  const deep: [number, number, number] = [c.r / peak, c.g / peak, c.b / peak];
  const cream = peak > 0.9 && Math.min(c.r, c.g, c.b) / peak > 0.9;
  if (role === 'body' && body) patchMaterial(material, [binShadePatch(shade), subsurfacePatch(0.35, deep.map((x) => 0.7 * x) as [number, number, number]), pressPatch(body, press)]);
  else if (role === 'piping') patchMaterial(material, [binShadePatch(shade), subsurfacePatch(0.4, (cream ? [1, 0.88, 0.74] : deep).map((x) => 0.6 * x) as [number, number, number]), ridgePatch()]);
  else patchMaterial(material, [binShadePatch(shade)]);
}

/** A soft curl of smoke: one quad, low opacity, dissolves upward. */
function wispTexture(): CanvasTexture {
  const w = 64, h = 160;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext('2d')!;
  c.filter = 'blur(3px)';
  c.strokeStyle = 'rgba(255,255,255,0.9)';
  c.lineCap = 'round';
  c.lineWidth = 9;
  c.beginPath();
  c.moveTo(w / 2, h - 8);
  c.bezierCurveTo(w * 0.15, h * 0.7, w * 0.85, h * 0.45, w * 0.4, h * 0.12);
  c.stroke();
  // Fade towards the top so it dissolves rather than ends.
  c.globalCompositeOperation = 'destination-in';
  c.filter = 'none';
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.55, 'rgba(0,0,0,0.8)');
  g.addColorStop(1, 'rgba(0,0,0,1)');
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  const t = new CanvasTexture(keepPixels(canvas));
  t.colorSpace = SRGBColorSpace;
  return t;
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
  for (const m of cakeMaterials) patchFrosting(m, binShade, press, body?.isMesh ? body : null);
  const waxClones: Material[] = [];

  const texture = wispTexture();
  // Warm grey, a step darker than v1.1's #A39B91: a pale wisp vanished against the peach studio.
  const wispMaterial = new MeshBasicMaterial({ name: 'fx_wisp', map: texture, color: '#857C72', transparent: true, opacity: 0, depthWrite: false });
  const ids = candleIds(root);
  // The master's six candles: a taller curl so a single faint wisp still reads on the peach studio.
  const wispScale = ids.length > 3 ? 1.3 : 1;
  const candles: CandleRig[] = ids.map((id) => {
    const candle = root.getObjectByName(`candle_${id}`)!;
    const flame = root.getObjectByName(`flame_${id}`)!;
    nodes[`candle_${id}`] = candle;
    nodes[`flame_${id}`] = flame;
    const flameMesh = flame.getObjectByName(`flame_${id}_mesh`) as Mesh;
    const flameMaterial = lib.unique('mat_flame_outer') as ShaderMaterial;
    flameMesh.material = flameMaterial;
    flameMesh.renderOrder = 2;
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
      patchMaterial(own, [binShadePatch(binShade), meltPatch(waxMesh, melt)]);
    } else {
      const m = waxMesh?.material as Material | undefined;
      if (m && isCake(m)) patchMaterial(m, [binShadePatch(binShade)]);
    }
    const wisp = new ThreeMesh(new PlaneGeometry(0.1 * wispScale, 0.26 * wispScale).translate(0, 0.13 * wispScale, 0), wispMaterial.clone());
    wisp.name = `wisp_${id}`;
    wisp.position.set(0, flame.position.y + 0.01, 0);
    wisp.rotation.y = CAMERA_AZIMUTH;
    wisp.visible = false;
    wisp.renderOrder = 3;
    candle.add(wisp);
    return { candle, seatedY: candle.position.y, wickY: wick.position.y, flameY: flame.position.y, melt, wax: waxNode ?? null, flame, flameSize: { x: flame.scale.x, y: flame.scale.y, z: flame.scale.z }, flameMaterial, wick, wisp };
  });

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
    flapL,
    flapR,
    binShade,
    press,
    bounds: birthdayBounds(),
    setPreset,
    dispose() {
      cakeShadow.dispose();
      binShadow.dispose();
      texture.dispose();
      wispMaterial.dispose();
      disposeShadowProxies(root);
      for (const m of waxClones) m.dispose();
      for (const c of candles) {
        c.flameMaterial.dispose();
        (c.wisp.material as Material).dispose();
        c.wisp.geometry.dispose();
        c.wisp.removeFromParent();
      }
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
