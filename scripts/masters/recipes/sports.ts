import { Matrix3, Matrix4, Quaternion } from 'three';
import { BALL_R, HOOP_SCALE, RIM_LOCAL, SPORTS_NODES } from '../../../models/sportsContract.ts';
import { buildSportsGeometry } from '../../../models/sportsPremium.ts';
import { SEAM_FRAME } from '../../../src/render/ballMaterial.ts';
import type { Quat, RawImage, SceneRecipe } from '../types.ts';

/**
 * Sports recipe: the basketball and hoop masters on the code-authored stand.
 *
 * Decisions
 * - Ball: `basketball.glb` (sphere r 0.9436 scan units) at BALL_R / 0.9436 = 0.26494, centred on
 *   `ball_secondary`, renamed `ball_mesh`. Full 81k triangles and all three maps (2048 cap, so
 *   3456×2304 → 2048×1365).
 * - Ball orientation: the master's great circles are its x = 0 and y = 0 planes and its curved
 *   seams lie either side of y = 0. Mapping master (y, x, −z) onto the v1.1 seam pattern frame
 *   (meridian, equator normal, view) and then through SEAM_FRAME's inverse puts the master's own
 *   great-circle cross in the same place the shader ball showed it at guest-ready, so the guest
 *   still faces the seam cross. (The master's curved seams bow towards the cross, as on the
 *   scanned ball; the v1.1 shader bowed them away.)
 * - Cream preset: a second albedo (`ball_leather_cream`) generated here from the orange one by a
 *   deterministic remap (below) and stored with KHR_materials_variants (variants orange, cream);
 *   ORM and normal maps are shared. `setPreset` switches with `loadMaterialVariants`.
 *   v1.2 fidelity pass: the cream is a cooler ivory (236, 229, 212; was 239, 228, 205) so its lit
 *   side separates from the peach stage by hue instead of merging with it. The orange albedo is
 *   kept exactly as authored; its look is graded at load (models/sports.ts `LEATHER_GRADE`),
 *   because the recipe has no pixel function for a default-variant material.
 * - Hoop: `basketball-hoop.glb` at HOOP_SCALE (rim inner radius 0.451 → 0.4 = 1.6 × BALL_R),
 *   no rotation (+z already faces the player), aligned so the rim-ring centre lands on RIM_LOCAL
 *   (the v1.1 rim centre, so every authored arc is unchanged).
 *   `board` → `backboard` (pivot: centre of its flat back, where the arm's plate meets it),
 *   `rim` (pivot: the bracket plate's back-bottom edge, the ring's recoil hinge on the board face:
 *   tipping about the edge the plate bears on lifts the plate off the board instead of into it),
 *   `net` (pivot: the rim-ring centre = RIM_LOCAL, the net space the rig deforms in).
 * - Joins: the board's four parts → 3 meshes (frame, face+back, target); the rim's ring, bracket,
 *   hooks, bolts, nuts and washers → 2 (paint, steel). The net keeps its three meshes (strands,
 *   loops, knots) as children of `net`, which the rig deforms.
 * - Decimation: only the net's knots (128,544 → 71,994 triangles: the 0.1 % error bound stops the
 *   simplifier before the 0.4 target): the knots are a few pixels across on stage, and the rig
 *   rewrites every net vertex on each deformed frame.
 * - `ball_mesh` leaves the importer as an empty transform at the ball centre; the master mesh rides
 *   on its `ball_mesh_mesh` child (the importer's rule for every mapped node, README §1 4.6).
 * - Textures: four 2048×1365 ball maps (ORM, orange albedo, normal, cream albedo), the hoop's
 *   twelve small maps at source size. Normal maps exact lossless WebP, colour/ORM lossy q90.
 * - Stand: the v1.1 pole, weighted base, clamp and arm, plus the chrome trim ring and a back plate
 *   on the master board's back (sportsPremium.ts `parts: 'stand'`). The v1.1 ink backer frame,
 *   channel liner and cap screws are NOT kept: the master board has its own wood frame, so a
 *   second frame round it would double the outline.
 * - Materials keep the master's look (red powder-coat rim, grey laminate face, white target, dark
 *   wood frame, zinc steel, white rope), renamed `hoop_*` so no other scene's names collide;
 *   steel gets its own environment (ownEnv 1.1) so it reads as metal under the 0.52 studio env.
 * - Shadows: the ball casts through a 3 % decimated proxy under `ball_secondary` (a sphere, so it
 *   spins with the ball for free); the master ball itself skips the shadow pass. The net casts
 *   its own (deforming) shadow.
 */

const BALL_MASTER_RADIUS = 0.9436;

/** Master ball frame → v1.1 seam pattern frame, then into ball_secondary space (R = SEAM_FRAMEᵀ · M). */
function ballRotation(): Quat {
  const toPattern = new Matrix3().set(0, 1, 0, 1, 0, 0, 0, 0, -1);
  const r = SEAM_FRAME.clone().transpose().multiply(toPattern);
  const e = r.elements;
  const m4 = new Matrix4().set(e[0]!, e[3]!, e[6]!, 0, e[1]!, e[4]!, e[7]!, 0, e[2]!, e[5]!, e[8]!, 0, 0, 0, 0, 1);
  return new Quaternion().setFromRotationMatrix(m4).normalize().toArray() as Quat;
}

/**
 * Cream albedo from the orange one. Panels: the master's panel colour (sRGB 223, 64, 10 median)
 * becomes an ivory cream (236, 229, 212), keeping each texel's relative brightness so the pebble
 * mottling survives. Seams and grooves (dark texels) keep their original colour. Linear-light
 * maths; a pure function of the input pixels.
 */
const lin = (c: number) => { const x = c / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
const srgb = (x: number) => Math.round(255 * Math.min(1, Math.max(0, x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055)));
const PANEL = [223, 64, 10].map(lin) as [number, number, number];
const CREAM = [236, 229, 212].map(lin) as [number, number, number];
const luma = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
export function creamAlbedo(img: RawImage): RawImage {
  const LUT = new Float32Array(256).map((_, i) => lin(i));
  const out = new Uint8Array(img.data.length);
  const panelY = luma(...PANEL);
  const ch = img.channels;
  for (let i = 0; i < img.data.length; i += ch) {
    const r = LUT[img.data[i]!]!, g = LUT[img.data[i + 1]!]!, b = LUT[img.data[i + 2]!]!;
    // Panel-ness from the red channel: ~1 on orange leather, ~0 in the black seams.
    const k = Math.min(1, Math.max(0, (r / PANEL[0] - 0.15) / 0.45));
    const t = k * k * (3 - 2 * k);
    const v = Math.min(1.25, luma(r, g, b) / panelY);
    out[i] = srgb(r + (CREAM[0] * v - r) * t);
    out[i + 1] = srgb(g + (CREAM[1] * v - g) * t);
    out[i + 2] = srgb(b + (CREAM[2] * v - b) * t);
    if (ch === 4) out[i + 3] = img.data[i + 3]!;
  }
  return { ...img, data: out };
}

export const recipe: SceneRecipe = {
  scene: 'sports',
  builder: (ctx) => buildSportsGeometry(ctx, 'orange', { parts: 'stand' }),
  masters: [
    {
      file: 'basketball.glb',
      anchor: 'ball_secondary',
      scale: BALL_R / BALL_MASTER_RADIUS,
      rotation: ballRotation(),
      align: { node: 'basketball/basketball', point: 'center', to: [0, 0, 0] },
      materials: { '#0': { rename: 'ball_leather' } },
      nodes: { 'basketball/basketball': { rename: 'ball_mesh', parent: 'ball_secondary' } },
    },
    {
      file: 'basketball-hoop.glb',
      anchor: 'hoop_root',
      scale: HOOP_SCALE,
      align: { node: 'rim-ring', point: 'center', to: RIM_LOCAL.toArray() },
      materials: {
        frame: { rename: 'hoop_frame' },
        'board-face': { rename: 'hoop_board_face' },
        'target-paint': { rename: 'hoop_target_paint' },
        'rim-paint': { rename: 'hoop_rim_paint' },
        steel: { rename: 'hoop_steel', ownEnv: 1.1 },
        rope: { rename: 'hoop_rope' },
      },
      decimate: { 'net-knots': { ratio: 0.4, error: 0.001 } },
      nodes: {
        board: { rename: 'backboard', pivot: { node: 'board-back', point: 'center' } },
        // Hinge on the board face at the bracket plate's back-bottom edge: the recoil tips the ring
        // down about the edge the plate bears on, so the plate lifts off the board, never into it.
        rim: { pivot: { node: 'bracket-plate', point: [0.5, 0, 0] } },
        net: { pivot: { node: 'rim-ring', point: 'center' } },
      },
    },
  ],
  join: [{ parent: 'backboard', prefix: 'board' }, { parent: 'rim' }],
  shadowProxies: [{ name: 'ball_shadow_proxy', from: ['ball_mesh'], parent: 'ball_secondary', ratio: 0.03, error: 0.01 }],
  variants: ['orange', 'cream'],
  materialVariants: [{ variant: 'cream', of: 'ball_leather', name: 'ball_leather_cream', baseColor: creamAlbedo }],
  textures: { maxSize: 2048, quality: 90 },
  contract: SPORTS_NODES,
};
