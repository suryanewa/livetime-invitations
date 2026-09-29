import { CylinderGeometry, type Object3D, SphereGeometry, TorusGeometry } from 'three';
import { COVER, COVER_SEATED, PLATE, type DishPreset } from './dinnerContract.ts';
import { group, lathe, mesh } from './geometry.ts';
import type { ModelContext } from './types.ts';

/**
 * Dinner geometry (static parts + named nodes; exported to GLB). The shared bin comes from
 * assets/shared/disposal-bin.glb and is attached by the rig.
 * STAND-IN: honours every contract dimension in dinnerContract.ts so choreography can be
 * authored; the premium build replaces the construction, never the contract.
 */
export function buildDinnerGeometry(ctx: ModelContext, preset: DishPreset = 'pasta'): Object3D {
  const { lib } = ctx;
  const root = group('dinner_root');

  const plate = group('plate_authored', root);
  const plateSecondary = group('plate_secondary', plate);
  mesh('plate_mesh', lathe([[0, 0], [PLATE.radius - 0.1, 0, 0.02], [PLATE.radius, PLATE.rimHeight, 0.02], [PLATE.radius - 0.03, PLATE.rimHeight, 0.01], [PLATE.wellRadius, PLATE.well, 0.02], [0, PLATE.well]], 64, 3), lib.get('mat_plate'), plateSecondary);
  const food = group('food_root', plateSecondary);
  food.position.y = PLATE.well;
  const pasta = group('food_pasta', food);
  for (let i = 0; i < 4; i++) {
    const ring = mesh(`pasta_ring_${i}`, new TorusGeometry(0.34 - i * 0.07, 0.035, 8, 40), lib.get('mat_pasta'), pasta);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.04 + i * 0.05;
  }
  mesh('pasta_sauce', new SphereGeometry(0.1, 16, 10), lib.get('mat_sauce'), pasta).position.y = 0.22;
  const veg = group('food_vegetables', food);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const m = mesh(`veg_${i}`, i % 2 ? new SphereGeometry(0.08, 16, 10) : new CylinderGeometry(0.035, 0.035, 0.26, 10), lib.get(i % 3 === 0 ? 'mat_veg_orange' : i % 3 === 1 ? 'mat_veg_red' : 'mat_veg_green'), veg);
    m.position.set(Math.cos(a) * 0.3, 0.08, Math.sin(a) * 0.3);
    if (!(i % 2)) m.rotation.z = Math.PI / 2;
  }
  pasta.visible = preset === 'pasta';
  veg.visible = preset === 'vegetables';

  const cover = group('cover_authored', root);
  cover.position.copy(COVER_SEATED);
  const coverSecondary = group('cover_secondary', cover);
  mesh('cover_mesh', lathe([[COVER.radius, 0], [COVER.radius, 0.05, 0.02], [COVER.radius * 0.8, COVER.domeHeight * 0.8, 0.2], [0, COVER.domeHeight]], 64, 4), lib.get('mat_cloche'), coverSecondary);
  mesh('cover_handle', lathe([[0, 0], [0.05, 0.02, 0.01], [0.06, COVER.handleHeight * 0.8, 0.03], [0, COVER.handleHeight]], 24, 2), lib.get('mat_anodized'), coverSecondary).position.y = COVER.domeHeight - 0.01;

  group('dish_shadow', root).position.set(0, 0.002, 0);
  return root;
}
