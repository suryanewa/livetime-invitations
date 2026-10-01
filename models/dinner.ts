import { type Mesh, MeshPhysicalMaterial, type MeshStandardMaterial, type Object3D } from 'three';
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
 * Polished-silver finish of the dome, at load: the recipe API has no anisotropy policy and cannot
 * raise a roughness above its map (a factor only scales it down). The master's dome roughness map
 * is near-uniform (G 23–34: roughness 0.09–0.13, no visible lathe detail); as an isotropic
 * near-mirror of a near-white F0 in the cream studio it read pale and frosted (v1.2 review). The
 * dome becomes a MeshPhysicalMaterial with a uniform DOME_ROUGHNESS and DOME_ANISOTROPY along its
 * meridians (the lathe polish: the softbox stretches into vertical bands with dark reflections
 * between them, as the v1.1 cloche's brushed finish did). Its own environment (0.9) comes from the
 * recipe's extras. The unused roughness map is freed. Call before `prepareImported`, so the
 * replacement is the material registered for the Low tier and disposal.
 */
export const DOME_ROUGHNESS = 0.18;
export const DOME_ANISOTROPY = 0.5;
/** Anisotropy direction in the dome's UV frame: π/2 runs along v, the meridians. */
export const DOME_ANISOTROPY_ROTATION = Math.PI / 2;
export function finishDish(root: Object3D): void {
  root.traverse((o) => {
    const mesh = o as Mesh;
    const m = mesh.material as MeshStandardMaterial | undefined;
    if (!mesh.isMesh || !m || m.name !== 'cloche_dome' || m instanceof MeshPhysicalMaterial) return;
    const dome = new MeshPhysicalMaterial({
      name: m.name,
      color: m.color,
      metalness: 1,
      roughness: DOME_ROUGHNESS,
      anisotropy: DOME_ANISOTROPY,
      anisotropyRotation: DOME_ANISOTROPY_ROTATION,
      side: m.side,
      envMapIntensity: m.envMapIntensity,
    });
    dome.userData = { ...m.userData };
    mesh.material = dome;
    m.roughnessMap?.dispose();
    if (m.metalnessMap && m.metalnessMap !== m.roughnessMap) m.metalnessMap.dispose();
    m.dispose();
  });
}

/** Tooling (lookdev, tests in a browser): the stand-in dish + bin geometry and the rig in one call. */
export function buildDinner(ctx: ModelContext, preset: DishPreset = 'pasta'): DinnerModel {
  const root = buildDinnerGeometry(ctx, preset);
  const rig = rigDinner(root, buildDisposalBin(ctx), ctx.lib);
  return { ...rig, dispose() { rig.dispose(); disposeGeometry(root); } };
}
