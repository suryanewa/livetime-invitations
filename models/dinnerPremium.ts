import { LatheGeometry, type Object3D, TorusGeometry, Vector2 } from 'three';
import { COVER, COVER_PROFILE, COVER_SEATED, PLATE, PLATE_PROFILE, type DishPreset } from './dinnerContract.ts';
import { group, mesh } from './geometry.ts';
import type { ModelContext } from './types.ts';

/**
 * Dinner node skeleton (exported to GLB with the masters) and a tooling stand-in.
 *
 * v1.2: the runtime dish is the scan-to-CAD masters (scripts/masters/recipes/dinner.ts): the
 * builder only supplies the contract's empty nodes (`parts: 'skeleton'`) and the masters are
 * merged under `plate_secondary` and `cover_secondary`. There is no food any more (Surya,
 * 2026-10-01): the v1.1 pasta and vegetable builders and the code-authored plate and cloche
 * (models/dinnerParts.ts) are gone.
 *
 * `parts: 'standin'` (default; lookdev and other synchronous tooling, which cannot load the GLB)
 * adds plain lathe stand-ins turned from the contract's measured profiles (PLATE_PROFILE,
 * COVER_PROFILE), so tooling shows the masters' silhouettes and sizes. The shared bin comes from
 * assets/shared/disposal-bin.glb and is attached by the rig. `preset` is accepted for
 * compatibility and selects nothing.
 */
export function buildDinnerGeometry(ctx: ModelContext, _preset: DishPreset = 'pasta', opts: { parts?: 'skeleton' | 'standin' } = {}): Object3D {
  const { lib } = ctx;
  const parts = opts.parts ?? 'standin';
  const root = group('dinner_root');

  const plate = group('plate_authored', root);
  const plateSecondary = group('plate_secondary', plate);
  const cover = group('cover_authored', root);
  cover.position.copy(COVER_SEATED);
  const coverSecondary = group('cover_secondary', cover);
  group('dish_shadow', root).position.set(0, 0.002, 0);
  if (parts === 'skeleton') return root;

  // Plate: top surface from the measured profile, a flat foot underneath.
  const platePts = [new Vector2(0, 0), new Vector2(PLATE.radius * 0.78, 0), new Vector2(PLATE.radius, PLATE.rimHeight * 0.55)];
  for (let i = PLATE_PROFILE.length - 1; i >= 0; i--) platePts.push(new Vector2(...PLATE_PROFILE[i]!));
  mesh('plate_body', new LatheGeometry(platePts, 96), lib.get('mat_plate'), plateSecondary);
  // Cloche: the dome's outer silhouette (open underneath) and a loop handle on the crown.
  const domePts = COVER_PROFILE.map(([r, y]) => new Vector2(r, y));
  mesh('cover_mesh', new LatheGeometry(domePts, 96), lib.get('mat_cloche_polished'), coverSecondary);
  const handle = mesh('cover_handle', new TorusGeometry(0.1, 0.018, 12, 32, Math.PI), lib.get('mat_cloche_polished'), coverSecondary);
  handle.position.y = COVER.domeHeight + 0.06;
  return root;
}
