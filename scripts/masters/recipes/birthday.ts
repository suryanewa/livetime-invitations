import { CAKE_SCALE, CAKE_YAW, MASTER_CANDLES, STAND_TOP } from '../../../models/birthdayContract.ts';
import { BIRTHDAY_CANDLE_IDS, BIRTHDAY_GLB_NODES, buildBirthdayGeometry } from '../../../models/birthdayParts.ts';
import type { MaterialPolicy, MaterialVariantSpec, NodeMap, Quat, SceneRecipe } from '../types.ts';
import { finishCake } from './birthdayFinish.ts';

/**
 * Birthday recipe: the scan-to-CAD cake master on the code-authored candle rig.
 *
 * Decisions (docs/scenes/birthday-v1.2.md has the full record)
 * - Scale 1.1 (CAKE_SCALE): the tallest the cake can be and still drop, candles and wicks
 *   included (1.181), below the shared bin's rim with the flaps' 12 mm margin. Rotation 5° about y
 *   (CAKE_YAW) so the six candles spread evenly across the frame from the 20° camera.
 * - Anchor `cake_secondary` (the cake's underside centre, at STAND_TOP on the plate): every
 *   unmapped master node (both tiers and all their piping) stays under it, so the presentation
 *   yaw, the carry and the carry lean move them together. Aligned by the stand's foot: its
 *   underside centre lands on the floor at the birthday_root origin.
 * - `cake_stand` → `tray` (pivot: its underside centre), reparented to `birthday_root`: the stand
 *   stays behind on decline, as in v1.1. Its own 21k-triangle mesh casts no shadow; a 2 %
 *   decimated proxy (`tray_shadow_proxy`) does.
 * - Six candles, all placed (decision: six in a quick cascade, ≈55 ms apart, not three): the
 *   master is composed for six; three would leave a lopsided hexagon. Each master candle is
 *   mapped as `candle_NN_wax` (pivot: its base centre) under the builder's `candle_NN`, which sits
 *   on exactly that base centre (CANDLE_SOCKETS), so lowering `candle_NN` lowers wax, wick and
 *   flame together into the master's own socket. Numbered left to right on screen.
 * - Wicks and flames: the master's `candle_wicks` and `candle_flames` cover all six candles in one
 *   mesh each (README pitfall 4) and are dropped; the builder authors a wick at each candle's tip
 *   and the flame's anchor (`flame_NN`, no mesh since v1.5: the runtime draws the real 13 mm flame,
 *   its light and its smoke there, models/birthdayFire.ts; v1.2.1's 1.5× lathe is gone).
 * - Joins: the 21 tier and piping meshes → one per material under cake_secondary (`frosting_*`);
 *   the candles are contract nodes and stay separate.
 * - Shadows: the joined frosting (≈200k triangles) skips the shadow pass; `cake_shadow_proxy`
 *   (decimated from it, under cake_secondary so it follows the yaw, the carry and the lean)
 *   casts instead. Each candle casts through its own proxy (`candle_NN_shadow_proxy`, under
 *   candle_NN so it lowers and is carried with it): not for the triangles but because the wax's
 *   stripe LUT is a `map`, and three's shared shadow depth material keeps the last caster's map;
 *   after the scene is disposed it re-uploaded that LUT (one leaked texture per Birthday visit,
 *   tests/browser/birthday.spec.ts). Proxies carry no map.
 * - Presets (variants vanilla, cocoa): the master ships a blue palette (powder-blue body, cornflower
 *   rosettes; tools/cake_palette.py in the Models repo). The default materials are recoloured to
 *   vanilla here (ivory body, warm-white piping, vanilla-cream rosettes, white pearls, by
 *   baseColorFactor; the shipped structure, the original ivory rebuild's warmth); cocoa is a
 *   KHR_materials_variants copy of the same four materials (chocolate body, milk-chocolate
 *   piping, dark rosettes, ivory pearls). Stand and candles keep the master's colours.
 * - 2026-10-02: the owner asked for the blue theme, so the default ('vanilla' key) is the master's blue palette
 *   (#B0CBFF / #FFFDFA / #88B0F7) instead of ivory.
 * - Vanilla (studio pass v1.3, superseded by the line above): back to the ivory rebuild's palette (body #F3E9D8, piping
 *   #FFFDF8, rosettes #F3E3C7) at the master's own roughness. v1.2.1 had darkened the body to
 *   #E0D3BF at roughness 0.58 (piping #FFFCF6, rosettes #F7EFE1) because the ivory sat in the
 *   tone mapper's shoulder and read as a flat cut-out on the v1.1 peach stage: a compensation for
 *   the studio, judged again under the new rigs.
 * - Materials keep the master's clearcoat and the pearls' iridescence; renamed `cake_*` so no
 *   library name (and no other scene) collides. Textures: the candles' 256×4 wax LUTs only (kept
 *   exact by the LUT rule). v1.5 (next line) takes the clearcoat off the frosting.
 * - v1.5 (edits #3, #5, #6; docs/scenes/birthday-v1.5-cake.md): the master's `transform` is the
 *   hand finish (birthdayFinish.ts). Tiers rebuilt as dense lathes of their own profile (the top's
 *   candle annulus at 0.44 mm, so the runtime can press collars into it) with a relief UV atlas;
 *   a finish field on every frosting part (tiers ±1.4 % from round at low frequency, tops ±0.7 mm,
 *   a hand wobble on the side piping); beads, shells, dots, pearls and rosettes ±2–9 % in size and
 *   up to ±12° in twist about where they touch the cake; two rosettes softened. Frosting without
 *   clearcoat; the body with generated relief (normal), roughness (0.45–0.70, lossless) and a
 *   faint albedo finish, shared by both presets; piping and rosettes with a very slight sheen and
 *   a `_RIDGE` convexity. Candles re-tessellated from the master's own twisted six-flute surface
 *   (128 around, 0.39 mm rows) with a `_PROFILE` the melt shader deforms (models/cakeShaders.ts).
 *   CAKE_RADIUS and the crown height were re-measured after the finish (models/birthdayContract.ts).
 * - v1.6 (the Hollywood pass; docs/scenes/birthday-v1.6-cake.md): the finish regenerates every piped
 *   part as sculpted star-tip sweeps (birthdayPiping.ts) at the master's placements, rounds the tiers'
 *   top edges into a 6–6.5 mm bead with a hand-pushed lip, adds the scraper's hand waves (≈ ±2 mm on
 *   the silhouette), knife chatter and the turntable's spiral to the relief, bakes occlusion and
 *   thickness (birthdayBake.ts: per vertex `_FOOD` on the piping, a unique contact map on uv1 for the
 *   body) and leaves a smear of the coat and a crumb or two on the plate (`cake_smears`, the stand's;
 *   its cocoa variant below). The runtime's film food shader is models/cakeShaders.ts foodPatch.
 */

const lin = (hex: string): [number, number, number, number] => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return [...c.map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)), 1] as [number, number, number, number];
};

/** Frosting palettes (sRGB). */
export const PALETTE = {
  // 'vanilla' is the config key (public API, posters); the look is the blue theme chosen by the owner
  // (powder-blue body, warm-white piping, cornflower rosettes: tools/cake_palette.py in the Models repo).
  vanilla: { body: '#B0CBFF', piping: '#FFFDFA', rosette: '#88B0F7', pearl: '#FFFFFF' },
  cocoa: { body: '#5E3727', piping: '#94603F', rosette: '#4A281A', pearl: '#F4EADB' },
} as const;

const FROSTING = { body: 'cake_buttercream', piping: 'cake_piping', rosette: 'cake_rosette', pearl: 'cake_pearl' } as const;

const yaw: Quat = [0, Math.sin(CAKE_YAW / 2), 0, Math.cos(CAKE_YAW / 2)];

const candleNodes: Record<string, NodeMap> = Object.fromEntries(
  MASTER_CANDLES.map(({ node }, i) => [node, { rename: `candle_${BIRTHDAY_CANDLE_IDS[i]}_wax`, parent: `candle_${BIRTHDAY_CANDLE_IDS[i]}`, pivot: { node, point: 'bottom' } }]),
);

const frostingPolicy = (key: keyof typeof FROSTING): MaterialPolicy => ({ rename: FROSTING[key], baseColorFactor: lin(PALETTE.vanilla[key]) });

const cocoa: MaterialVariantSpec[] = [
  ...(Object.keys(FROSTING) as (keyof typeof FROSTING)[]).map((key) => ({
    variant: 'cocoa', of: FROSTING[key], name: `${FROSTING[key]}_cocoa`, baseColorFactor: lin(PALETTE.cocoa[key]),
  })),
  // v1.6: the smear of the coat on the plate (birthdayFinish.ts) is the body's colour.
  { variant: 'cocoa', of: 'cake_smear', name: 'cake_smear_cocoa', baseColorFactor: lin(PALETTE.cocoa.body) },
];

export const recipe: SceneRecipe = {
  scene: 'birthday',
  builder: (ctx) => buildBirthdayGeometry(ctx),
  masters: [
    {
      file: 'birthday-cake.glb',
      anchor: 'cake_secondary',
      scale: CAKE_SCALE,
      rotation: yaw,
      align: { node: 'cake_stand', point: 'bottom', to: [0, -STAND_TOP, 0] },
      drop: ['candle_wicks', 'candle_flames'],
      // v1.5: the hand finish (birthdayFinish.ts): dense tiers, relief and roughness maps, size and
      // shape imperfection, no clearcoat on the frosting, re-tessellated candles.
      transform: finishCake,
      materials: {
        glazed_ceramic: { rename: 'cake_stand_ceramic' },
        buttercream: frostingPolicy('body'),
        buttercream_piping: frostingPolicy('piping'),
        buttercream_rosette: frostingPolicy('rosette'),
        sugar_pearl: frostingPolicy('pearl'),
        candle_wax_pink: { rename: 'cake_candle_pink' },
        candle_wax_blue: { rename: 'cake_candle_blue' },
      },
      nodes: {
        cake_stand: { rename: 'tray', parent: 'birthday_root', pivot: { node: 'cake_stand', point: 'bottom' } },
        ...candleNodes,
      },
    },
  ],
  join: [{ parent: 'cake_secondary', prefix: 'frosting' }],
  shadowProxies: [
    { name: 'tray_shadow_proxy', from: ['tray'], parent: 'birthday_root', ratio: 0.02, error: 0.01 },
    { name: 'cake_shadow_proxy', from: ['frosting_cake_buttercream', 'frosting_cake_piping', 'frosting_cake_rosette', 'frosting_cake_pearl'], parent: 'cake_secondary', ratio: 0.01, error: 0.02 },
    ...BIRTHDAY_CANDLE_IDS.map((id) => ({ name: `candle_${id}_shadow_proxy`, from: [`candle_${id}_wax`], parent: `candle_${id}`, ratio: 0.06, error: 0.02 })),
  ],
  variants: ['vanilla', 'cocoa'],
  materialVariants: cocoa,
  // The generated roughness map stays exact (its 0.40–0.66 range is the point; lossy WebP overshot it).
  textures: { maxSize: 2048, quality: 90, lossless: ['cake_buttercream/metallicRoughnessTexture'] },
  contract: BIRTHDAY_GLB_NODES,
};
