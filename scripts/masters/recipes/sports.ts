import { Matrix3, Matrix4, Quaternion } from 'three';
import { BALL_R, HOOP_SCALE, RIM_LOCAL, SPORTS_NODES } from '../../../models/sportsContract.ts';
import { buildSportsGeometry } from '../../../models/sportsPremium.ts';
import { SEAM_FRAME } from '../../../src/render/ballMaterial.ts';
import type { Document, Material, Texture } from '@gltf-transform/core';
import { STAND_TILE } from '../../../models/sportsPremium.ts';
import { loadSharp } from '../sharp.ts';
import * as T from '../../bin/textures.ts';
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
 *   v1.2 fidelity pass: the cream was a cooler ivory (236, 229, 212) to separate from the peach
 *   stage; v1.5 polish: against the greige `neutral-room` cove the ivory all but vanished at 540 and
 *   192 px, so the cream is a warm buff (231, 207, 163), which separates from the cool stage by hue
 *   and a little by value and still reads as a cream ball. The orange albedo is
 *   kept exactly as authored and renders as authored (v1.2's load-time LEATHER_GRADE multiply,
 *   fitted to the v1.1 peach stage, was removed in the studio pass v1.3).
 * - Hoop: `basketball-hoop.glb` at HOOP_SCALE (v1.5: rim inner radius 0.451 → 0.5115 su, the
 *   14.5" rim of the mini hoop system the scene depicts, models/sportsContract.ts HOOP_PRODUCT_CM),
 *   no rotation (+z already faces the player), aligned so the rim-ring centre lands on RIM_LOCAL
 *   (the 4 ft setting on the code-authored stand).
 *   `board` → `backboard` (pivot: centre of its flat back, where the arm's plate meets it),
 *   `rim` (pivot: the bracket plate's back-bottom edge, the ring's recoil hinge on the board face:
 *   tipping about the edge the plate bears on lifts the plate off the board instead of into it),
 *   `net` (pivot: the rim-ring centre = RIM_LOCAL, the net space the rig simulates in).
 * - Joins: the board's four parts → 3 meshes (frame, face+back, target); the rim's ring, bracket,
 *   hooks, bolts, nuts and washers → 2 (paint, steel). The net keeps its three meshes (strands,
 *   loops, knots) as children of `net`: the rig reads its cord lattice back from their components
 *   and skins the strands and knots to the simulation (models/sportsNet.ts).
 * - Decimation: only the net's knots (128,544 → 71,994 triangles: the 0.1 % error bound stops the
 *   simplifier before the 0.4 target): the knots are a few pixels across on stage.
 * - `ball_mesh` leaves the importer as an empty transform at the ball centre; the master mesh rides
 *   on its `ball_mesh_mesh` child (the importer's rule for every mapped node, README §1 4.6).
 * - Textures: four 2048×1365 ball maps (ORM, orange albedo, normal, cream albedo), the hoop's
 *   twelve small maps at source size. Normal maps exact lossless WebP, colour/ORM lossy q90.
 * - Stand (v1.5): a portable system's: a weighted base behind the board, a leaning telescoping
 *   pole, a sleeve and two arms to a back plate on the master board's back (sportsPremium.ts
 *   `parts: 'stand'`, contract STAND and POLE). The v1.1 ink backer frame,
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
 * becomes a warm cream (231, 207, 163), keeping each texel's relative brightness so the pebble
 * mottling survives. Seams and grooves (dark texels) keep their original colour. Linear-light
 * maths; a pure function of the input pixels.
 */
const lin = (c: number) => { const x = c / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
const srgb = (x: number) => Math.round(255 * Math.min(1, Math.max(0, x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055)));
const PANEL = [223, 64, 10].map(lin) as [number, number, number];
const CREAM = [231, 207, 163].map(lin) as [number, number, number];
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

/**
 * The stand's maps (v1.5 polish), generated with the shared bin's deterministic generators
 * (scripts/bin/textures.ts) and encoded by the recipe's texture policy (WebP, normals lossless):
 * - `hoop_stand_pp`: moulded polypropylene with an EDM mould grain (VDI 3400 ≈ Ref 27: 0.1–0.4 mm
 *   pits, 5° RMS slope) on UV0 (3 cm tiles), roughness 0.55 ± 0.04 mottled over 24 cm on UV1;
 * - `hoop_stand_powder`: satin powder coat with orange peel (2–3 mm wavelength, 0.55° RMS slope,
 *   sparse dust inclusions) on UV0 (5.76 cm tiles), roughness 0.36 ± 0.03 on UV1.
 */
export async function finishStand(doc: Document, log: (line: string) => void): Promise<void> {
  const sharp = loadSharp();
  const texture = async (name: string, img: T.Image): Promise<Texture> => {
    const png = await sharp(img.data, { raw: { width: img.width, height: img.height, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
    return doc.createTexture(name).setImage(new Uint8Array(png)).setMimeType('image/png');
  };
  const material = (name: string): Material => {
    const m = doc.getRoot().listMaterials().find((x) => x.getName() === name);
    if (!m) throw new Error(`stand material ${name} missing`);
    return m;
  };
  const finish = async (name: string, normal: T.Image, rough: number, spread: number, seed: number) => {
    const m = material(name);
    m.setNormalTexture(await texture(`${name}_normal`, normal)).setNormalScale(1);
    m.getNormalTextureInfo()!.setTexCoord(0);
    const mottle = T.roughnessMottle(512, 512, 3, 3, seed);
    const r = T.field(512, 512, (_u, _v, c, row) => rough + spread * mottle[row * 512 + c]!);
    m.setMetallicRoughnessTexture(await texture(`${name}_orm`, T.orm(512, 512, 1, r, 0))).setRoughnessFactor(1).setMetallicFactor(1);
    m.getMetallicRoughnessTextureInfo()!.setTexCoord(1);
  };
  await finish('hoop_stand_pp', T.edmNormal(512, STAND_TILE.pp.micro), 0.55, 0.04, 211);
  await finish('hoop_stand_powder', T.powderNormal(512, STAND_TILE.powder.micro), 0.36, 0.03, 223);
  log('  stand: moulded-PP and powder-coat maps generated');
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
  finish: finishStand,
  contract: SPORTS_NODES,
};
