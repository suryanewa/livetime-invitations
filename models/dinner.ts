import { type Object3D } from 'three';
import { ContactShadow } from '../src/render/contactShadow.ts';
import { DINNER_BIN_POS, DINNER_BIN_YAW, DINNER_NODES, dinnerBounds, PLATE, type DishPreset } from './dinnerContract.ts';
import { buildDinnerGeometry } from './dinnerPremium.ts';
import { BIN, buildDisposalBin } from './disposalBin.ts';
import { collectNodes, disposeGeometry, type BuiltModel, type ModelContext } from './types.ts';

export * from './dinnerContract.ts';

/**
 * Dinner runtime rig over the dish hierarchy (built or GLB-loaded) plus the shared bin
 * approved at checkpoint 3: contact shadows, bin placement and the food preset.
 */

export interface DinnerRig {
  root: Object3D;
  nodes: Record<string, Object3D>;
  shadows: ContactShadow[];
  dishShadow: ContactShadow;
  flapL: Object3D;
  flapR: Object3D;
  bounds: ReturnType<typeof dinnerBounds>;
  setPreset(preset: DishPreset): void;
  dispose(): void;
}

export type DinnerModel = DinnerRig & BuiltModel;

export function rigDinner(root: Object3D, binRoot: Object3D, lib: ModelContext['lib'], preset: DishPreset = 'pasta'): DinnerRig {
  const dir = lib.direction;
  root.add(binRoot);
  binRoot.position.copy(DINNER_BIN_POS);
  binRoot.rotation.set(0, DINNER_BIN_YAW, 0);
  const nodes = collectNodes(root, DINNER_NODES);
  const replace = (name: string, shadow: ContactShadow) => {
    const placeholder = root.getObjectByName(name)!;
    shadow.position.copy(placeholder.position);
    placeholder.parent!.add(shadow);
    placeholder.removeFromParent();
    return shadow;
  };
  const dishShadow = replace('dish_shadow', new ContactShadow({
    name: 'dish_shadow', shape: 'round', width: PLATE.radius * 2, depth: PLATE.radius * 2, spread: [1.08, 1.3], opacity: dir.shadow.opacity, line: 0.45, color: dir.shadow.color,
  }));
  const binShadow = replace('bin_shadow', new ContactShadow({
    name: 'bin_shadow', shape: 'round', width: BIN.radius * 1.9, depth: BIN.radius * 1.9, spread: [1.15, 1.5], opacity: dir.shadow.opacity, line: 0.45, color: dir.shadow.color,
  }));
  nodes.dish_shadow = dishShadow;

  const setPreset = (next: DishPreset) => {
    nodes.food_pasta!.visible = next === 'pasta';
    nodes.food_vegetables!.visible = next === 'vegetables';
  };
  setPreset(preset);

  return {
    root,
    nodes,
    shadows: [dishShadow, binShadow],
    dishShadow,
    flapL: root.getObjectByName('bin_flap_l')!,
    flapR: root.getObjectByName('bin_flap_r')!,
    bounds: dinnerBounds(),
    setPreset,
    dispose() {
      dishShadow.dispose();
      binShadow.dispose();
    },
  };
}

/** Tooling (lookdev, tests in a browser): dish + bin geometry and the rig in one call. */
export function buildDinner(ctx: ModelContext, preset: DishPreset = 'pasta'): DinnerModel {
  const root = buildDinnerGeometry(ctx, preset);
  const rig = rigDinner(root, buildDisposalBin(ctx), ctx.lib, preset);
  return { ...rig, dispose() { rig.dispose(); disposeGeometry(root); } };
}
