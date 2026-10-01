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
 * - Silver (re-tuned after review, v1.2 fix pass): the first pass (dome roughness 0.20, own env
 *   1.35; trim at the master's 0.065–0.09 and env 1.1) read pale and frosted, less metallic than
 *   the v1.1 cloche: a near-white F0 (0.97) mirroring a cream studio has almost no dark values, the
 *   dome's lower half took the floor's colour and the bead, bands and handle read as whitish lines.
 *   The Low tier (own env 0.8) read more like silver than Normal. Compared side by side (own env
 *   0.85–1.1, roughness 0.14–0.20, darker F0, anisotropy 0–0.7 at both orientations):
 *   - dome: own env 0.9, uniform roughness 0.18 and anisotropy 0.5 along the meridians (the
 *     spinning-lathe polish of a real cloche; the v1.1 cloche's 0.7 brushed look, softer). The
 *     softbox stretches into vertical highlight bands with dark reflections between them, which is
 *     what reads as silver here; isotropic finishes at any env stayed a grey ball with two
 *     softbox blobs. The roughness and the anisotropy are set at load (`finishDish`,
 *     models/dinner.ts: the recipe API has no anisotropy policy and cannot raise a roughness
 *     above its map), the own env here.
 *   - bead, bands, finial, handle: own env 0.8 and roughness 0.12 (from the master's 0.065–0.09):
 *     the handle loop and the lip shade light to dark like metal instead of mirroring the cream
 *     wall as pale lines.
 * - Shadows: the dome assembly casts through one decimated proxy under cover_secondary (it tilts
 *   and travels with the cover); the plate through one under plate_secondary. The masters
 *   themselves skip the shadow pass (dense, thin).
 * - Textures: the dome's 1024² roughness map travels (6 KiB WebP; freed at load by `finishDish`).
 *   The tray's map leaves with the tray.
 */
/** Bead, bands, finial and handle (see Decisions: Silver). */
const silver = { ownEnv: 0.8, roughness: 0.12 } as const;

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
