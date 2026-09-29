import { CanvasTexture, type Material, type Mesh, MeshBasicMaterial, type Object3D, PlaneGeometry, type ShaderMaterial, SRGBColorSpace, Mesh as ThreeMesh } from 'three';
import { ContactShadow } from '../src/render/contactShadow.ts';
import { BIN_POS, BIN_YAW, birthdayBounds, CAKE } from './birthdayContract.ts';
import { buildCakeGeometry, CAKE_NODES, type CakePreset } from './cake.ts';
import { BIN, buildDisposalBin } from './disposalBin.ts';
import { applyShadowProxies } from './shadowProxy.ts';
import { collectNodes, disposeGeometry, type BuiltModel, type ModelContext } from './types.ts';

/**
 * Birthday runtime rig over the cake hierarchy (built or GLB-loaded) plus the shared bin:
 * contact shadows, unique flame materials, smoke wisps, bin placement and frosting presets.
 */

export const BIRTHDAY_NODES = [...CAKE_NODES, 'bin_root', 'bin_lid'] as const;

/** Shared camera azimuth: wisps face the fixed orthographic camera. */
const CAMERA_AZIMUTH = (20 * Math.PI) / 180;

export interface CandleRig {
  candle: Object3D;
  seatedY: number;
  flame: Object3D;
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
  c.lineWidth = 7;
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
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  return t;
}

export function rigBirthday(root: Object3D, binRoot: Object3D, lib: ModelContext['lib'], preset: CakePreset = 'vanilla'): BirthdayRig {
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
  const cakeShadow = replace('cake_shadow', new ContactShadow({
    name: 'cake_shadow', width: 0.84, depth: 0.84, spread: [1.9, 2.1], opacity: dir.shadow.opacity, line: 0.42, color: dir.shadow.color,
  }));
  const binShadow = replace('bin_shadow', new ContactShadow({
    name: 'bin_shadow', width: BIN.radius * 1.9, depth: BIN.radius * 1.9, spread: [1.15, 1.5], opacity: dir.shadow.opacity, line: 0.45, color: dir.shadow.color,
  }));
  nodes.cake_shadow = cakeShadow;

  const texture = wispTexture();
  const wispMaterial = new MeshBasicMaterial({ name: 'fx_wisp', map: texture, color: '#EDE8E0', transparent: true, opacity: 0, depthWrite: false });
  const candles: CandleRig[] = [1, 2, 3].map((i) => {
    const id = String(i).padStart(2, '0');
    const candle = nodes[`candle_${id}`]!;
    const flame = nodes[`flame_${id}`]!;
    const flameMesh = flame.getObjectByName(`flame_${id}_mesh`) as Mesh;
    const flameMaterial = lib.unique('mat_flame_outer') as ShaderMaterial;
    flameMesh.material = flameMaterial;
    const wick = candle.getObjectByName(`wick_${id}`)!;
    const wisp = new ThreeMesh(new PlaneGeometry(0.1, 0.26).translate(0, 0.13, 0), wispMaterial.clone());
    wisp.name = `wisp_${id}`;
    wisp.position.set(0, CAKE.candleHeight + 0.03, 0);
    wisp.rotation.y = CAMERA_AZIMUTH;
    wisp.visible = false;
    wisp.renderOrder = 3;
    candle.add(wisp);
    return { candle, seatedY: candle.position.y, flame, flameMaterial, wick, wisp };
  });

  const flapL = root.getObjectByName('bin_flap_l')!;
  const flapR = root.getObjectByName('bin_flap_r')!;

  const setPreset = (next: CakePreset) => {
    const frosting = lib.get(next === 'vanilla' ? 'mat_frosting_vanilla' : 'mat_frosting_cocoa');
    const glaze = lib.get(next === 'vanilla' ? 'mat_glaze_vanilla' : 'mat_glaze_cocoa');
    (root.getObjectByName('cake_body') as Mesh).material = frosting;
    (root.getObjectByName('cake_drip') as Mesh).material = glaze;
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
      for (const c of candles) {
        c.flameMaterial.dispose();
        (c.wisp.material as Material).dispose();
        c.wisp.geometry.dispose();
        c.wisp.removeFromParent();
      }
    },
  };
}

/** Tooling (lookdev, tests in a browser): cake + bin geometry and the rig in one call. */
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
