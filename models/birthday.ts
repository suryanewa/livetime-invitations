import { Color, type Material, type Mesh, MeshPhysicalMaterial, type MeshStandardMaterial, Mesh as ThreeMesh, type Object3D, PlaneGeometry, Vector3, Vector4 } from 'three';
import { ContactShadow } from '../src/render/contactShadow.ts';
import { BIN_POS, BIN_YAW, birthdayBounds, STAND } from './birthdayContract.ts';
import { createFlameLights, type FlameLights, type FlameRig, patchFlameLight, rigCandleFire, SmokeRig } from './birthdayFire.ts';
import { BIRTHDAY_GLB_NODES } from './birthdayParts.ts';
import { buildCakeGeometry, type CakePreset } from './cake.ts';
import { attachBin, BIN, BIN_CONTACT, binLight, buildDisposalBin, detachBin, patchBinVisibility } from './disposalBin.ts';
import type { MaterialVariants } from './imported.ts';
import { applyShadowProxies, disposeShadowProxies } from './shadowProxy.ts';
import { BIN_SHADE, type BinShade, type CakePress, type CandleMelt, contactPatch, meltPatch, newCakePress, patchMaterial, type PlateContact, plateContactPatch, poolGeometry, poolPatch, pressPatch, ridgePatch, runGeometry, runPatch, subsurfacePatch } from './cakeShaders.ts';
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
  /** v1.5 polish: molten wax as its own surfaces (the run down the low side, the pool in the cup). */
  run: Mesh | null;
  pool: Mesh | null;
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
  /** v1.5 polish: the plate's contact ring under the bead border (`lift`: how far the cake is off its seat). */
  plate: PlateContact;
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
 * subsurface wrap, the candles' press and the contact occlusion at its foot; piping and rosettes
 * the wrap, their satin ridges and grain (and the contact where the bead border meets the plate);
 * pearls the contact (every cake material gets the flame light and the bin's light below). The
 * subsurface tint is the material's own colour, deepened (light that has travelled inside a dyed
 * frosting comes out more saturated; the near-white piping, a butter cream). `mesh` is the joined
 * frosting mesh the material is drawn on (both presets share it).
 */
function patchFrosting(material: Material, press: CakePress, mesh: Mesh | null): void {
  const role = material.userData.frosting as string | undefined;
  if (!mesh) return;
  const c = (material as MeshStandardMaterial).color ?? new Color(1, 1, 1);
  const peak = Math.max(c.r, c.g, c.b, 1e-6);
  const deep: [number, number, number] = [c.r / peak, c.g / peak, c.b / peak];
  const cream = peak > 0.9 && Math.min(c.r, c.g, c.b) / peak > 0.9;
  if (role === 'body') patchMaterial(material, [subsurfacePatch(0.4, deep.map((x) => 0.7 * x) as [number, number, number]), pressPatch(mesh, press), contactPatch(mesh)]);
  else if (role === 'piping') patchMaterial(material, [subsurfacePatch(0.5, (cream ? [1, 0.88, 0.74] : deep).map((x) => 0.7 * x) as [number, number, number]), ridgePatch(mesh), contactPatch(mesh)]);
  else if (role === 'pearl') patchMaterial(material, [contactPatch(mesh)]);
}

/** The joined frosting mesh each frosting material (either preset) is drawn on. */
function frostingMeshes(root: Object3D): Map<string, Mesh> {
  const out = new Map<string, Mesh>();
  for (const name of ['buttercream', 'piping', 'rosette', 'pearl']) {
    const m = root.getObjectByName(`frosting_cake_${name}`) as Mesh | undefined;
    if (m?.isMesh) out.set(`cake_${name}`, m);
  }
  return out;
}

/**
 * Where the bead border stands on the plate (birthday_root space at rest): the bounding circle of the
 * piping within 1 cm of the plate (the finish sets the bottom tier a little off-centre).
 */
function measureFoot(piping: Mesh): Vector3 {
  const pos = piping.geometry.getAttribute('position');
  piping.updateMatrix();
  const v = new Vector3();
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  const pts: Vector3[] = [];
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(piping.matrix);
    if (v.y > 0.02) continue;
    pts.push(v.clone());
    x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); z0 = Math.min(z0, v.z); z1 = Math.max(z1, v.z);
  }
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  let r = 0;
  for (const p of pts) r = Math.max(r, Math.hypot(p.x - cx, p.z - cz));
  return new Vector3(cx, cz, r);
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
  const frosting = frostingMeshes(root);
  for (const m of cakeMaterials) patchFrosting(m, press, frosting.get(m.name.replace(/_cocoa$/, '')) ?? null);
  // The plate round the cake's foot darkens a little where the bead border rests on it.
  const plate: PlateContact = { lift: { value: 0 }, foot: { value: new Vector3(0, 0, 0.66) } };
  const piping = frosting.get('cake_piping');
  if (piping) plate.foot.value.copy(measureFoot(piping));
  root.getObjectByName('tray')?.traverse((o) => {
    const m = (o as Mesh).material as Material | undefined;
    if ((o as Mesh).isMesh && !o.userData.shadowProxy && m && m.name.startsWith('cake_stand')) patchMaterial(m, [plateContactPatch(plate)]);
  });
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
    let run: Mesh | null = null, pool: Mesh | null = null;
    const waxNode = candle.getObjectByName(`candle_${id}_wax`);
    const waxMesh = candle.getObjectByName(`candle_${id}_wax_mesh`) as Mesh | undefined;
    if (waxNode && waxMesh?.isMesh && waxMesh.geometry.getAttribute('_profile')) {
      const shared = waxMesh.material as MeshStandardMaterial;
      const own = shared.clone();
      waxClones.push(own);
      waxMesh.material = own;
      const body = linear(WAX_BODY[shared.name] ?? '#FFFFFF');
      melt = { a: { value: new Vector4() }, b: { value: new Vector4() }, dir: { value: { x: 1, y: 0 } }, body: { value: new Vector3().setFromColor(body) }, groove: { value: 0 }, solid: { value: 0 }, foot: { value: 1 } };
      patchMaterial(own, [meltPatch(waxMesh, melt)]);
      lit.add(own);
      // Molten wax: the run down the low side and the pool in the cup, the body wax made liquid
      // (glossy, a little translucent: a wide wrap tinted by the wax itself), in the wax node's frame.
      const peak = Math.max(body.r, body.g, body.b, 1e-6);
      const tint: [number, number, number] = [body.r / peak, body.g / peak, body.b / peak];
      const runMat = new MeshPhysicalMaterial({
        name: 'cake_candle_run', color: body.clone().multiplyScalar(0.9), roughness: 0.16, clearcoat: 0.35, clearcoatRoughness: 0.12,
        sheen: 0.3, sheenColor: body, sheenRoughness: 0.4,
      });
      patchMaterial(runMat, [subsurfacePatch(0.65, tint.map((x) => 0.8 * x) as [number, number, number]), runPatch(melt)]);
      const poolMat = new MeshPhysicalMaterial({ name: 'cake_candle_pool', color: body.clone().multiplyScalar(0.8), roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.03 });
      patchMaterial(poolMat, [subsurfacePatch(0.5, tint.map((x) => 0.7 * x) as [number, number, number]), poolPatch(melt)]);
      run = new ThreeMesh(runGeometry(), runMat);
      pool = new ThreeMesh(poolGeometry(), poolMat);
      for (const [mesh, name] of [[run, `candle_${id}_run`], [pool, `candle_${id}_pool`]] as const) {
        mesh.name = name;
        // Drawn from the shader: the geometry's own positions are placeholders.
        mesh.frustumCulled = false;
        mesh.visible = false;
        mesh.userData.noShadowCast = true;
        waxNode.add(mesh);
      }
      waxClones.push(runMat, poolMat);
      lit.add(runMat);
      lit.add(poolMat);
    } else {
      const m = waxMesh?.material as Material | undefined;
      if (m && isCake(m)) lit.add(m);
    }
    const fire = rigCandleFire(candle, flame, wick, lib, flameQuad, flameLights, ids.indexOf(id));
    return { candle, seatedY: candle.position.y, wickY: wick.position.y, flameY: flame.position.y, melt, run, pool, wax: waxNode ?? null, flame, fire, wick };
  });
  const smoke = new SmokeRig(nodes.cake_secondary!, candles.length);
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
    plate,
    bounds: birthdayBounds(),
    setPreset,
    dispose() {
      cakeShadow.dispose();
      binShadow.dispose();
      detachBin(binRoot);
      disposeShadowProxies(root);
      for (const m of waxClones) m.dispose();
      for (const c of candles) for (const mesh of [c.run, c.pool]) if (mesh) { mesh.geometry.dispose(); mesh.removeFromParent(); }
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
