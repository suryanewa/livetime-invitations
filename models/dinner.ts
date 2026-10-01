import { type Mesh, type MeshStandardMaterial, type Object3D } from 'three';
import { ContactShadow } from '../src/render/contactShadow.ts';
import { COVER, DINNER_BIN_POS, DINNER_BIN_YAW, DINNER_NODES, dinnerBounds, PLATE, type DishPreset } from './dinnerContract.ts';
import { buildDinnerGeometry } from './dinnerPremium.ts';
import { BIN, buildDisposalBin } from './disposalBin.ts';
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
  root.add(binRoot);
  binRoot.position.copy(DINNER_BIN_POS);
  binRoot.rotation.set(0, DINNER_BIN_YAW, 0);
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
    name: 'bin_shadow', shape: 'round', width: BIN.radius * 1.9, depth: BIN.radius * 1.9, spread: [1.15, 1.5], opacity: dir.shadow.opacity, line: 0.45, color: dir.shadow.color,
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
      disposeShadowProxies(root);
    },
  };
}

/**
 * Polished-silver finish of the dome, at load (the recipe API cannot raise a roughness above its
 * map, only scale it down). The master's dome roughness map is near-uniform (G 23–34: roughness
 * 0.09–0.13, no visible lathe detail) and that near-mirror finish showed the studio softbox as hard
 * white windows and the floor as a flat grey. A uniform DOME_ROUGHNESS keeps a bright mirror polish
 * whose highlights read as soft bands; the bead, bands, finial and handle keep the master's own
 * (burnished, turned, buffed) values. The unused map is freed.
 */
export const DOME_ROUGHNESS = 0.2;
export function finishDish(root: Object3D): void {
  root.traverse((o) => {
    const m = (o as Mesh).material as MeshStandardMaterial | undefined;
    if (!(o as Mesh).isMesh || !m || m.name !== 'cloche_dome' || !m.roughnessMap) return;
    const map = m.roughnessMap;
    m.roughnessMap = null;
    if (m.metalnessMap === map) m.metalnessMap = null;
    m.roughness = DOME_ROUGHNESS;
    m.metalness = 1;
    m.needsUpdate = true;
    map.dispose();
  });
}

/** Tooling (lookdev, tests in a browser): the stand-in dish + bin geometry and the rig in one call. */
export function buildDinner(ctx: ModelContext, preset: DishPreset = 'pasta'): DinnerModel {
  const root = buildDinnerGeometry(ctx, preset);
  const rig = rigDinner(root, buildDisposalBin(ctx), ctx.lib);
  return { ...rig, dispose() { rig.dispose(); disposeGeometry(root); } };
}
