import type { Material, Mesh, Object3D } from 'three';
import { ContactShadow } from '../src/render/contactShadow.ts';
import { COVER, DINNER_BIN_POS, DINNER_BIN_SCALE, DINNER_BIN_YAW, DINNER_NODES, dinnerBounds, PLATE, type DishPreset } from './dinnerContract.ts';
import { CARD_SHADOW_OPACITY, DinnerCard } from './dinnerCard.ts';
import { buildDinnerGeometry } from './dinnerPremium.ts';
import { attachBin, BIN_CONTACT, binLight, buildDisposalBin, detachBin, patchBinVisibility } from './disposalBin.ts';
import { applyShadowProxies, disposeShadowProxies } from './shadowProxy.ts';
import { collectNodes, disposeGeometry, type BuiltModel, type ModelContext } from './types.ts';

export * from './dinnerContract.ts';

/**
 * Dinner runtime rig over the dish hierarchy (the GLB with the plate and cloche masters, or the
 * tooling stand-in) plus the shared bin approved at checkpoint 3: contact shadows and the bin's
 * placement. v1.2 has no food and no dish preset (Surya, 2026-10-01): `setPreset` is kept for
 * the SceneConfig's `dish` and selects nothing.
 */

export interface DinnerRig {
  root: Object3D;
  nodes: Record<string, Object3D>;
  shadows: ContactShadow[];
  dishShadow: ContactShadow;
  /** The cloche's own floor shadow once it is set down beside the plate. */
  coverShadow: ContactShadow;
  /** v1.7 (#41): the invitation card in the plate's well (under `plate_authored`). */
  card: DinnerCard;
  /**
   * v1.7: the gate of the bin's light on the dish and the cloche (models/disposalBin.ts
   * patchBinVisibility: inside the bin's mouth they see its walls, not the room). The scene opens it
   * only while the bin is on stage (DinnerScene.apply). Its mouth's uniforms otherwise follow the
   * bin's last draw, and the bin's warm-up draws it once out of sight behind the camera
   * (src/scenes/deferredBin.ts drawOutOfSight): behind the accepted close-up's camera that is
   * straight above the plate's near half, which then read as inside the bin (a dark band across
   * the near well, under a saved accept, whose bin warms at the close-up).
   */
  binShade: { value: number };
  flapL: Object3D;
  flapR: Object3D;
  bounds: ReturnType<typeof dinnerBounds>;
  setPreset(preset: DishPreset): void;
  dispose(): void;
}

export type DinnerModel = DinnerRig & BuiltModel;

export function rigDinner(root: Object3D, binRoot: Object3D, lib: ModelContext['lib']): DinnerRig {
  const dir = lib.direction;
  // The covered dish sees the bin's walls once it is inside (models/disposalBin.ts patchBinVisibility),
  // gated by `binShade` (on while the bin is on stage: the scene sets it per frame).
  attachBin(root, binRoot, lib, DINNER_BIN_POS, DINNER_BIN_YAW, DINNER_BIN_SCALE);
  const binShade = { value: 1 };
  const light = binLight(binRoot);
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh || inBin(mesh, binRoot)) return;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material] as Material[]) patchBinVisibility(m, light, binShade);
  });
  applyShadowProxies(root);
  const nodes = collectNodes(root, DINNER_NODES);
  const replace = (name: string, shadow: ContactShadow) => {
    const placeholder = root.getObjectByName(name)!;
    shadow.position.copy(placeholder.position);
    placeholder.parent!.add(shadow);
    placeholder.removeFromParent();
    return shadow;
  };
  const dishShadow = replace('dish_shadow', new ContactShadow({
    name: 'dish_shadow', shape: 'round', width: PLATE.radius * 2, depth: PLATE.radius * 2, spread: [1.45, 1.7], opacity: dir.shadow.opacity, line: 0.45, color: dir.shadow.color,
  }));
  const binShadow = replace('bin_shadow', new ContactShadow({
    name: 'bin_shadow', ...BIN_CONTACT, spread: [...BIN_CONTACT.spread], opacity: dir.shadow.opacity, color: dir.shadow.color,
  }));
  nodes.dish_shadow = dishShadow;
  const coverShadow = new ContactShadow({
    name: 'cover_shadow', shape: 'round', width: COVER.radius * 2, depth: COVER.radius * 2, spread: [1.1, 1.35], opacity: dir.shadow.opacity, line: 0.7, lineScale: 1.07, color: dir.shadow.color,
  });
  coverShadow.visible = false;
  dishShadow.parent!.add(coverShadow);
  // v1.7: the card lies in the well and rides with the plate (after the proxies: it casts nothing).
  const card = new DinnerCard({ color: dir.shadow.color, opacity: CARD_SHADOW_OPACITY });
  nodes.plate_authored!.add(card.object);

  return {
    root,
    nodes,
    shadows: [dishShadow, coverShadow, binShadow],
    dishShadow,
    coverShadow,
    card,
    binShade,
    flapL: root.getObjectByName('bin_flap_l')!,
    flapR: root.getObjectByName('bin_flap_r')!,
    bounds: dinnerBounds(),
    setPreset() {},
    dispose() {
      dishShadow.dispose();
      coverShadow.dispose();
      binShadow.dispose();
      card.dispose();
      detachBin(binRoot);
      disposeShadowProxies(root);
    },
  };
}

function inBin(o: Object3D, binRoot: Object3D): boolean {
  for (let p: Object3D | null = o; p; p = p.parent) if (p === binRoot) return true;
  return false;
}

/** Tooling (lookdev, tests in a browser): the stand-in dish + bin geometry and the rig in one call. */
export function buildDinner(ctx: ModelContext, preset: DishPreset = 'pasta'): DinnerModel {
  const root = buildDinnerGeometry(ctx, preset);
  const rig = rigDinner(root, buildDisposalBin(ctx), ctx.lib);
  return { ...rig, dispose() { rig.dispose(); disposeGeometry(root); } };
}
