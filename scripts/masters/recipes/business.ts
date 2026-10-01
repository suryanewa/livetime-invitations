import { BADGE_SCALE, BUSINESS_NODES, READER_SCALE } from '../../../models/businessContract.ts';
import { buildBusinessFrame } from '../../../models/businessFrame.ts';
import { DARK_STOCK_FACTOR, darkPrint } from '../../../models/businessPrint.ts';
import type { SceneRecipe } from '../types.ts';

/**
 * Business recipe: the all-access badge and the RFID/NFC reader masters on the scene's empty
 * contract nodes (models/business.ts `buildBusinessFrame`). Numbers: models/businessContract.ts.
 *
 * Decisions
 * - Badge at BADGE_SCALE 1.5 (holder 0.744 × 1.164, a little smaller than v1.1's 0.86 × 1.3
 *   card), aligned so the swivel eye's origin lands on `card_authored`: the hang pivot is the
 *   eye in the D-ring's bottom bar, so the card swings on the real swivel.
 * - `hardware` → `clip_pivot` (pivot: the swivel eye) under `card_secondary`: swivel eye, shank,
 *   barrel, neck, snap hook body and gate pin, joined to one chrome mesh. `d_ring` leaves it for
 *   `card_authored` (it hangs from the strap; the eye turns in its bar). `snap_hook_gate` →
 *   `clip_gate` with its pivot on gate_pin's axis, so the gate choreography turns it on the real
 *   pin; `gate_trigger` rides on the gate.
 * - `card_holder` → `card_mesh` (pivot: the holder's box centre) under `card_secondary`: clear
 *   holder, both side clips and the printed card move as one rigid body. Clear vinyl:
 *   transmission → alpha 0.35 (the studio renders in one pass).
 * - Strap: the master's static `lanyard` (straight up from the D-ring) is not kept as geometry.
 *   The runtime strap rig keeps drawing the strands to the off-frame anchors, now in the master's
 *   own woven material: `lanyard_strap` is decimated to a stub (`strap_material`) that only
 *   carries `badge_strap` (woven_fabric_blue: albedo, normal, ORM, sheen) into the GLB; the rig
 *   takes the material and deletes the stub. Its bar-tack stitching is kept on the runtime sewn
 *   tab round the D-ring. The tape edging is dropped (the strands have their own soft edges).
 * - Reader at READER_SCALE 1 (1.28 w × 1.9 h): the glass (1.16 × 1.58) takes the whole card with
 *   the LED bar clear above it. Aligned on the plinth's bottom centre at `scanner_root`.
 *   `front_assembly` → `scanner_face` (its 11.6° lean is the contact plane), `glass` →
 *   `scanner_pad` (pivot: the face origin, so pad space = face space) carrying the LED
 *   (`scanner_light`), its glow quad (`scanner_glow`) and the NFC mark: the press moves them in
 *   together. `window_gasket` → `scanner_gasket` (pivot: its back plane) compresses under the
 *   glass. Body, bezel, plinth and back panel are static and joined per material.
 * - LED and glow: emissiveStrength 1 (the rig drives the status colour and intensity, starting
 *   dark); the glow quad casts no shadow.
 * - Templates: KHR_materials_variants light (the master's print) / dark (`badge_card_print_dark`,
 *   a pixel function over the master's print, models/businessPrint.ts; the card's edge stock
 *   goes to the family ink by factor). Both prints lossless at source size (2048 × 1536).
 * - Runtime (models/business.ts, recorded here so the GLB's numbers are not misread): the vinyl
 *   ships at the brief's alpha 0.35, but the rig draws it as a clear sheet (no diffuse, its
 *   reflection added, 8 % dimming, satin roughness 0.22): a 35 % white veil washed the print out.
 *   The strap material's vertex colours (master COLOR_0, mean 0.9) are folded into its colour
 *   factor, because the runtime strands carry none.
 * See docs/scenes/business-v1.2.md for the measured contract, the export report and the gaps.
 */
export const recipe: SceneRecipe = {
  scene: 'business',
  builder: (ctx) => buildBusinessFrame(ctx),
  masters: [
    {
      file: 'all-access-badge.glb',
      anchor: 'card_authored',
      scale: BADGE_SCALE,
      align: { node: 'swivel_eye', point: 'origin', to: [0, 0, 0] },
      drop: ['lanyard_strap_tape'],
      materials: {
        woven_fabric_blue: { rename: 'badge_strap' },
        woven_fabric_blue_stitch: { rename: 'badge_strap_stitch' },
        chrome_hardware: { rename: 'badge_chrome', ownEnv: 1.1 },
        clear_vinyl: { rename: 'badge_vinyl', transmissionToAlpha: 0.35 },
        clip_plastic_grey: { rename: 'badge_clip_plastic' },
        card_stock: { rename: 'badge_card_stock' },
        card_print: { rename: 'badge_card_print' },
      },
      decimate: { lanyard_strap: { ratio: 0.0005, error: 1 } },
      create: [
        { name: 'card_secondary', parent: 'card_authored', at: [0, 0, 0] },
      ],
      nodes: {
        lanyard_strap: { rename: 'strap_material', parent: 'card_authored', extras: { noShadowCast: true } },
        lanyard_stitching: { rename: 'strap_stitching', parent: 'card_authored' },
        d_ring: { parent: 'card_authored' },
        hardware: { rename: 'clip_pivot', parent: 'card_secondary', pivot: { node: 'swivel_eye', point: 'origin' } },
        snap_hook_gate: { rename: 'clip_gate', parent: 'clip_pivot', pivot: { node: 'gate_pin', point: 'origin' } },
        gate_trigger: { parent: 'clip_gate' },
        card_holder: { rename: 'card_mesh', parent: 'card_secondary', pivot: { node: 'card_holder', point: 'center' } },
      },
    },
    {
      file: 'rfid-nfc-reader.glb',
      anchor: 'scanner_root',
      scale: READER_SCALE,
      align: { node: 'plinth', point: 'bottom', to: [0, 0, 0] },
      materials: {
        brushed_steel: { rename: 'reader_steel' },
        gasket_black_gloss: { rename: 'reader_gasket' },
        black_glass: { rename: 'reader_glass' },
        led_emissive: { rename: 'reader_led', emissiveStrength: 1 },
        led_glow: { rename: 'reader_led_glow', emissiveStrength: 1 },
        icon_decal: { rename: 'reader_icon' },
        icon_decal_back: { rename: 'reader_icon_back' },
        plinth_plastic: { rename: 'reader_plinth' },
        back_panel_matte: { rename: 'reader_back_panel' },
      },
      nodes: {
        front_assembly: { rename: 'scanner_face' },
        glass: { rename: 'scanner_pad', parent: 'scanner_face', pivot: [0, 0, 0] },
        led: { rename: 'scanner_light', parent: 'scanner_pad' },
        led_glow: { rename: 'scanner_glow', parent: 'scanner_pad', extras: { noShadowCast: true } },
        nfc_icon_front: { parent: 'scanner_pad', extras: { noShadowCast: true } },
        window_gasket: { rename: 'scanner_gasket', parent: 'scanner_face', pivot: { node: 'window_gasket', point: 'back' } },
      },
    },
  ],
  join: [
    { parent: 'clip_pivot', prefix: 'clip' },
    { parent: 'scanner_root', prefix: 'reader' },
  ],
  variants: ['light', 'dark'],
  materialVariants: [
    { variant: 'dark', of: 'badge_card_print', name: 'badge_card_print_dark', baseColor: darkPrint },
    { variant: 'dark', of: 'badge_card_stock', name: 'badge_card_stock_dark', baseColorFactor: DARK_STOCK_FACTOR },
  ],
  textures: {
    maxSize: 2048,
    quality: 90,
    lossless: ['badge_card_print/baseColorTexture', 'badge_card_print_dark/baseColorTexture'],
  },
  contract: BUSINESS_NODES,
};
