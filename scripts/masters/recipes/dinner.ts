import { DINNER_GLB_NODES, DISH_SCALE } from '../../../models/dinnerContract.ts';
import { buildDinnerGeometry } from '../../../models/dinnerPremium.ts';
import type { SceneRecipe } from '../types.ts';

/**
 * Dinner recipe: the porcelain plate and the silver cloche masters, no food.
 *
 * Decisions
 * - No food (Surya, 2026-10-01): the scene is the cloche and the clean plate. The builder only
 *   supplies the contract's empty nodes (`parts: 'skeleton'`: dinner_root, plate_authored ›
 *   plate_secondary, cover_authored › cover_secondary, dish_shadow); the v1.1 pasta, vegetables,
 *   code-authored plate and cloche are gone.
 * - One scale for both masters, DISH_SCALE = 0.8 / 0.9525 = 0.83990: the plate keeps the v1.1
 *   plate's 1.6 diameter, and the cloche keeps its real size against the plate (it was built on a
 *   0.95 tray, the plate's own size), so the dome (bead r 0.6534) seats on the coupe rim's slope
 *   just inside the gilt band (gilt inner edge r 0.7727) and covers the whole well.
 * - Plate: `plate` → `plate_body` (porcelain, `plate_porcelain`), `gilt-rim` → `plate_gilt`
 *   (`plate_gilt` metal: ownEnv 1.1 so the gold reads as metal and catches the key on the
 *   reveal). Aligned so the plate's flat underside centre is plate_secondary's origin.
 * - Cloche: the tray is dropped (the plate takes its place). `dome` → `cover_mesh`, `handle` →
 *   `cover_handle`; the lip bead, the two applied bands and the finial stay under
 *   `cover_secondary` and are joined per material (beads: lip + bands → one mesh; finial).
 *   Aligned so the lip bead's lowest ring centre (the dome's rim centre) is cover_secondary's
 *   origin, i.e. cover_authored pivots and rocks on its rim.
 * - Silver (studio pass v1.3): every silver part renders as the master authored it: the dome
 *   with its own polished roughness map, the bead, bands, finial and handle at their near-mirror
 *   0.065–0.09. v1.2's load-time "lathe polish" (uniform roughness 0.2, anisotropy 0.3 along the
 *   meridians, `finishDish`) and the trim softened to 0.12 compensated for a near-white F0
 *   mirroring the v1.1 cream studio; both were removed so the metal is judged under a rig with
 *   real reflections. Own environment: dome 0.9, trim 0.8 (kept until the rigs settle ownEnv).
 * - Shadows: the dome assembly casts through one decimated proxy under cover_secondary (it tilts
 *   and travels with the cover); the plate through one under plate_secondary. The masters
 *   themselves skip the shadow pass (dense, thin).
 * - Textures: the dome's 1024² roughness map travels (6 KiB WebP) and is drawn.
 *   The tray's map leaves with the tray.
 */
/** Bead, bands, finial and handle (see Decisions: Silver). */
const silver = { ownEnv: 0.8 } as const;

export const recipe: SceneRecipe = {
  scene: 'dinner',
  builder: (ctx) => buildDinnerGeometry(ctx, 'pasta', { parts: 'skeleton' }),
  masters: [
    {
      file: 'dinner-plate.glb',
      anchor: 'plate_secondary',
      scale: DISH_SCALE,
      align: { node: 'plate', point: 'bottom', to: [0, 0, 0] },
      materials: {
        '#0': { rename: 'plate_porcelain' },
        '#1': { rename: 'plate_gilt_metal', ownEnv: 1.1 },
      },
      nodes: {
        plate: { rename: 'plate_body', parent: 'plate_secondary' },
        'gilt-rim': { rename: 'plate_gilt', parent: 'plate_secondary' },
      },
    },
    {
      file: 'silver-cloche.glb',
      anchor: 'cover_secondary',
      scale: DISH_SCALE,
      align: { node: 'dome-lip', point: 'bottom', to: [0, 0, 0] },
      drop: ['tray'],
      materials: {
        'silver-dome-polished': { rename: 'cloche_dome', ownEnv: 0.9 },
        'silver-beads-burnished': { rename: 'cloche_beads', ...silver },
        'silver-handle-buffed': { rename: 'cloche_handle', ...silver },
        'silver-finial-turned': { rename: 'cloche_finial', ...silver },
      },
      nodes: {
        dome: { rename: 'cover_mesh', parent: 'cover_secondary' },
        handle: { rename: 'cover_handle', parent: 'cover_secondary' },
      },
    },
  ],
  join: [{ parent: 'cover_secondary', prefix: 'cover' }],
  shadowProxies: [
    { name: 'cover_shadow_proxy', from: ['cover_secondary'], parent: 'cover_secondary', ratio: 0.04 },
    { name: 'plate_shadow_proxy', from: ['plate_secondary'], parent: 'plate_secondary', ratio: 0.03 },
  ],
  textures: { maxSize: 2048, quality: 90 },
  contract: DINNER_GLB_NODES,
};
