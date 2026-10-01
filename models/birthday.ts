import { CanvasTexture, type Material, type Mesh, MeshBasicMaterial, type Object3D, PlaneGeometry, type ShaderMaterial, SRGBColorSpace, Mesh as ThreeMesh } from 'three';
import { keepPixels } from '../src/render/textures.ts';
import { ContactShadow } from '../src/render/contactShadow.ts';
import { BIN_POS, BIN_YAW, birthdayBounds, STAND } from './birthdayContract.ts';
import { BIRTHDAY_GLB_NODES } from './birthdayParts.ts';
import { buildCakeGeometry, type CakePreset } from './cake.ts';
import { BIN, buildDisposalBin } from './disposalBin.ts';
import type { MaterialVariants } from './imported.ts';
import { applyShadowProxies, disposeShadowProxies } from './shadowProxy.ts';
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
  bounds: ReturnType<typeof birthdayBounds>;
  setPreset(preset: CakePreset): void;
  dispose(): void;
}

export type BirthdayModel = BirthdayRig & BuiltModel;

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

  const texture = wispTexture();
  const wispMaterial = new MeshBasicMaterial({ name: 'fx_wisp', map: texture, color: '#A39B91', transparent: true, opacity: 0, depthWrite: false });
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
    const wisp = new ThreeMesh(new PlaneGeometry(0.1 * wispScale, 0.26 * wispScale).translate(0, 0.13 * wispScale, 0), wispMaterial.clone());
    wisp.name = `wisp_${id}`;
    wisp.position.set(0, flame.position.y + 0.01, 0);
    wisp.rotation.y = CAMERA_AZIMUTH;
    wisp.visible = false;
    wisp.renderOrder = 3;
    candle.add(wisp);
    return { candle, seatedY: candle.position.y, flame, flameSize: { x: flame.scale.x, y: flame.scale.y, z: flame.scale.z }, flameMaterial, wick, wisp };
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
    bounds: birthdayBounds(),
    setPreset,
    dispose() {
      cakeShadow.dispose();
      binShadow.dispose();
      texture.dispose();
      wispMaterial.dispose();
      disposeShadowProxies(root);
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
