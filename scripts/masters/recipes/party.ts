import { buildPartyScaffold } from '../../../models/recordPremium.ts';
import { fromMaster, PARTY_NODES, TONEARM, TT_SCALE } from '../../../models/recordContract.ts';
import type { Quat, RawImage, SceneRecipe } from '../types.ts';

/**
 * Party recipe: the vintage turntable master on the code-authored scaffold.
 *
 * Decisions
 * - Scale: TT_SCALE = 2.1 / 1.855 (the master plinth's width becomes the v1.1 player's 2.1); the
 *   deck lands at 0.341, the v1.1 deck height. Placed so the plinth's x/z centre is the origin and
 *   the rubber feet stand on y = 0. +z already faces the guest (arm back-right, platter left).
 * - Anchor: the builder's `player_body`. Every static master part stays under it (plinth, feet,
 *   deck screws, bearing skirt, tonearm base, arm-lift base and post, anti-skate, cue post, speed
 *   knob, button collar, the plinth-side hinge halves) and is joined per material (36 meshes → 6).
 * - Platter: the master `platter` becomes the contract node, pivot on the spindle axis at the mat's
 *   top (the record seat); rubber mat and spindle follow it. The bearing skirt stays static.
 * - Record: `record_authored` (created at record_edge's bottom centre) › `record_secondary` ›
 *   record_vinyl (the master `record` top), record_edge (rim and underside) and record_label. The
 *   record is 0.0096 thick, under the stage's 0.015 shadow-caster floor, so a decimated proxy of
 *   its edge and underside casts its shadow (`record_shadow_proxy`, under record_secondary).
 * - Tonearm: `tonearm_pivot` is created at the gimbal bearing (the master tonearm_gimbal's own
 *   origin) turned to the master's cue yaw, so the arm frame has the stylus on +Z; `tonearm_lift`
 *   (same origin) pitches. The gimbal housing yaws only; the gimbal's other parts (arm socket,
 *   counterweight shaft, scale ring, collar, knurl, end, front), the tube and the headshell
 *   assembly pitch (joined per material under the lift; the tube keeps its own mesh).
 * - Cueing: the cue lever handle (`cue_lever`, pivot at its post's top) and the arm-lift bar
 *   (`cue_lift`) are mapped so the rig can raise them with the arm.
 * - Status: the start/stop key cap (`player_status`) is the lit status; the master has no LED or
 *   lens, and the key is the plausible lit part. The v1.1 perforation row and lens are dropped.
 * - Dust cover: the master's `dust_cover` origin already lies on the hinge pins' axis, so it
 *   becomes `lid_hinge` as is (open −62.4°: its shell leans 27.6° back from vertical). Its shell,
 *   tab and lid-side hinge halves are joined per material under it (11 meshes → 4). The rig extends the
 *   short master shell in place so the closed lid covers the deck (recordContract.ts, LID.extend).
 * - Tonearm rest: the master has none (its arm is posed playing); the scaffold adds a turned chrome
 *   post with a black-anodised cradle under the parked tube. Its materials are exact copies of the
 *   master's chrome and black anodising (clearcoat included), so dedup folds them into the
 *   master's own: one `tt_chrome`, one `tt_black_anodised` in the GLB.
 * - Parked arm: yaw +0.04 (23.7° out from the cue), so the headshell and cartridge park beside the
 *   platter, 0.169 clear of its rim in plan (recordContract.ts, TONEARM.parkedYaw).
 * - Materials: every master material keeps its look, renamed `tt_*`. Metals (plinth, aluminium,
 *   chrome) get their own environment at 1.1 automatically (metalness ≥ 0.5).
 * - Label presets: KHR_materials_variants `paper` (the master's olive print, default in the file,
 *   never selected by the app), `coral` and `cobalt`: the master's own print recoloured, its field
 *   to the v1.1 label colours and its rings, bars, ring and square kept as dark ink (`labelPrint`,
 *   below). Studio pass v1.3 removed v1.2's quarter wedge and butter sliver painted into the print:
 *   the master's off-centre square is the asymmetric mark the accept spin reads by.
 * - Lid shadows (rig): the shell casts but does not receive (its own top panel stair-stepped on its
 *   inside back wall mid-close under the studio's fixed PCF taps). v1.2.1: the rig splits the shell
 *   into outside and inside; the inside gets its own darker, uncoated material with baked
 *   occlusion (recordPlayer.ts, LID_LOOK). The outside keeps the master's clearcoat (v1.2.1's satin
 *   coat, fitted to the v1.1 cream softbox, was removed in the studio pass v1.3).
 * - Materials (v1.3): the brushed steel plinth and the spindle chrome render as the master authored
 *   them; v1.2.1's PLINTH_TONE (40 % chroma) and SPINDLE_LOOK (turned grey) compensated for the
 *   v1.1 peach studio and were removed in the studio pass.
 * - Framing (contract): silhouette frame points plus a 0.17 side margin, so the player fills the
 *   stage as v1.1 did (74.6 % of its width).
 * - Full write-up, measured contract and export report: docs/scenes/party-v1.2.md.
 * - Textures: the vinyl's 8192×4 groove normal and anisotropy LUTs kept exact (automatic); the
 *   plinth's brushed normal exact; the three label prints exact lossless (flat print, crisp edges);
 *   the plinth ORM lossy q90 at source size (1024²).
 */

const yawQuat = (yaw: number): Quat => [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];

/** Master label colours (sRGB, measured): the olive field and its darker printed ink. */
const FIELD = [134, 128, 94] as const;
const INK = [80, 74, 56] as const;
/**
 * Preset prints: field and ink (darker than the first pass so the master's bars, square and rings
 * read at stage size), on the master's own art.
 */
const LABEL = {
  coral: { field: [255, 113, 74], ink: [84, 22, 12] },
  cobalt: { field: [47, 84, 201], ink: [6, 10, 40] },
} as const;

const lin = (c: number) => { const x = c / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
const srgb = (x: number) => Math.round(255 * Math.min(1, Math.max(0, x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055)));
const luma = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/**
 * Label print in a preset's colours, from the master's own print: each texel's ink weight is read
 * from its luminance between the olive field and the ink (anti-aliased edges keep their partial
 * weights), then the field and ink are replaced by the preset's pair in linear light. Texels darker
 * than the ink (the spindle ring, the surround outside the disc) take the preset ink darkened in
 * proportion. A pure function of the input.
 */
export function labelPrint(preset: keyof typeof LABEL) {
  const field = LABEL[preset].field.map(lin), ink = LABEL[preset].ink.map(lin);
  const lf = luma(...(FIELD.map(lin) as [number, number, number])), li = luma(...(INK.map(lin) as [number, number, number]));
  const LUT = new Float32Array(256).map((_, i) => lin(i));
  const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
  return (img: RawImage): RawImage => {
    const out = new Uint8Array(img.data.length);
    const ch = img.channels;
    for (let i = 0; i < img.data.length; i += ch) {
      const r = LUT[img.data[i]!]!, g = LUT[img.data[i + 1]!]!, b = LUT[img.data[i + 2]!]!;
      const l = luma(r, g, b);
      const w = clamp01((lf - l) / (lf - li));
      // Darker than the ink (the spindle ring's heavier stroke, the surround outside the disc):
      // the preset's ink darkened in proportion, so every mark keeps its relative weight.
      const deep = l < li ? l / li : 1;
      for (let k = 0; k < 3; k++) out[i + k] = srgb((field[k]! + (ink[k]! - field[k]!) * w) * deep);
      if (ch === 4) out[i + 3] = img.data[i + 3]!;
    }
    return { ...img, data: out };
  };
}

export const recipe: SceneRecipe = {
  scene: 'party',
  builder: (ctx) => buildPartyScaffold(ctx),
  masters: [
    {
      file: 'vintage-turntable.glb',
      anchor: 'player_body',
      scale: TT_SCALE,
      align: { node: 'plinth', point: [0.5, 0, 0.5], to: fromMaster(0.0125, -0.66, 0.115).toArray() },
      materials: {
        brushed_steel_plinth: { rename: 'tt_brushed_steel' },
        rubber_feet: { rename: 'tt_rubber_feet' },
        machined_aluminium: { rename: 'tt_aluminium' },
        black_anodised: { rename: 'tt_black_anodised' },
        rubber_mat: { rename: 'tt_rubber_mat' },
        vinyl: { rename: 'tt_vinyl' },
        paper_label: { rename: 'tt_label' },
        chrome: { rename: 'tt_chrome' },
        cartridge_plastic: { rename: 'tt_cartridge' },
        smoked_lid_plastic: { rename: 'tt_lid' },
      },
      create: [
        { name: 'record_authored', parent: 'party_root', at: { node: 'record_edge', point: 'bottom' } },
        { name: 'record_secondary', parent: 'record_authored' },
        { name: 'tonearm_pivot', parent: 'party_root', at: { node: 'tonearm_gimbal', point: 'origin' }, rotation: yawQuat(TONEARM.cueYaw) },
        { name: 'tonearm_lift', parent: 'tonearm_pivot' },
      ],
      nodes: {
        platter: { parent: 'party_root', pivot: { node: 'rubber_mat', point: 'top' } },
        rubber_mat: { parent: 'platter' },
        spindle: { parent: 'platter' },
        record: { rename: 'record_vinyl', parent: 'record_secondary' },
        record_edge: { parent: 'record_secondary' },
        record_label: { parent: 'record_secondary' },
        tonearm_gimbal: { parent: 'tonearm_lift' },
        gimbal_housing: { parent: 'tonearm_pivot' },
        arm_tube: { parent: 'tonearm_lift' },
        headshell: { parent: 'tonearm_lift' },
        cue_lever_handle: { rename: 'cue_lever', parent: 'party_root', pivot: [0.772, -0.334, -0.14] },
        arm_lift_bar: { rename: 'cue_lift', parent: 'party_root' },
        button_cap: { rename: 'player_status', parent: 'party_root' },
        dust_cover: { rename: 'lid_hinge', parent: 'party_root' },
      },
    },
  ],
  join: [
    { parent: 'player_body', prefix: 'body' },
    { parent: 'tonearm_lift', prefix: 'arm' },
    { parent: 'lid_hinge', prefix: 'lid' },
  ],
  shadowProxies: [{ name: 'record_shadow_proxy', from: ['record_edge'], parent: 'record_secondary', ratio: 0.08, error: 0.01 }],
  variants: ['paper', 'coral', 'cobalt'],
  materialVariants: [
    { variant: 'coral', of: 'tt_label', name: 'tt_label_coral', baseColor: labelPrint('coral') },
    { variant: 'cobalt', of: 'tt_label', name: 'tt_label_cobalt', baseColor: labelPrint('cobalt') },
  ],
  textures: {
    maxSize: 2048,
    quality: 90,
    lossless: ['tt_label/baseColorTexture', 'tt_label_coral/baseColorTexture', 'tt_label_cobalt/baseColorTexture'],
  },
  contract: PARTY_NODES,
};
