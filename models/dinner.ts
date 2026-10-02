import type { Object3D } from 'three';
import { ContactShadow } from '../src/render/contactShadow.ts';
import { COVER, DINNER_BIN_POS, DINNER_BIN_SCALE, DINNER_BIN_YAW, DINNER_NODES, dinnerBounds, PLATE, type DishPreset } from './dinnerContract.ts';
import { buildDinnerGeometry } from './dinnerPremium.ts';
import { attachBin, BIN_CONTACT, buildDisposalBin, detachBin } from './disposalBin.ts';
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
  flapL: Object3D;
  flapR: Object3D;
  bounds: ReturnType<typeof dinnerBounds>;
  setPreset(preset: DishPreset): void;
  dispose(): void;
}

export type DinnerModel = DinnerRig & BuiltModel;

export function rigDinner(root: Object3D, binRoot: Object3D, lib: ModelContext['lib']): DinnerRig {
  const dir = lib.direction;
  // The covered dish sees the bin's walls once it is inside (models/disposalBin.ts patchBinVisibility).
  attachBin(root, binRoot, lib, DINNER_BIN_POS, DINNER_BIN_YAW, DINNER_BIN_SCALE, { shade: () => true });
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

  return {
    root,
    nodes,
    shadows: [dishShadow, coverShadow, binShadow],
    dishShadow,
    coverShadow,
    flapL: root.getObjectByName('bin_flap_l')!,
    flapR: root.getObjectByName('bin_flap_r')!,
    bounds: dinnerBounds(),
    setPreset() {},
    dispose() {
      dishShadow.dispose();
      coverShadow.dispose();
      binShadow.dispose();
      detachBin(binRoot);
      disposeShadowProxies(root);
    },
  };
}

/** Tooling (lookdev, tests in a browser): the stand-in dish + bin geometry and the rig in one call. */
export function buildDinner(ctx: ModelContext, preset: DishPreset = 'pasta'): DinnerModel {
  const root = buildDinnerGeometry(ctx, preset);
  const rig = rigDinner(root, buildDisposalBin(ctx), ctx.lib);
  return { ...rig, dispose() { rig.dispose(); disposeGeometry(root); } };
}
