# Business v1.2: the all-access badge and the RFID/NFC reader

The Business scene now runs on two scan-to-CAD masters: `models/masters/all-access-badge.glb`
(the card, holder, clip hardware and strap material) and `models/masters/rfid-nfc-reader.glb`
(the scanner). The beats, the durations (host 1.2 s, accept and decline 1.5 s), the contact beat
(0.72 s), the optional drag and the template presets work the same way as in v1.1.

Files: `scripts/masters/recipes/business.ts` (import), `models/businessContract.ts` (measured
numbers), `models/businessFrame.ts` (the recipe's builder: empty contract nodes only),
`models/business.ts` (runtime rig), `models/businessPrint.ts` (the dark print),
`src/scenes/business/{poses,sequences,drag,index}.ts`, `tests/business.test.ts`,
`tests/browser/business.spec.ts`.

## v1.2.1 fixes (inspection of 49bf0c1)

| Finding | Fix | Guarded by |
|---|---|---|
| A change of mind at the reader blended the card straight back through the glass and bezel (8–12 mm; `frames-change/f0035–36`). The scene had no `interruptCut()`. | `interruptCut()` (`interruptCutFor` in sequences.ts): it replays the director's 150 ms straight blend (position lerp, quaternion slerp of `card_authored`, `clip_pivot`, `card_mesh`) from the pose on screen to guest-ready and measures it against the reader as a solid (`blendReaderDepth`: behind the glass, bezel or bottom lip across the reader's width, plus a margin). Any depth → cut (Master §6 allows zero). In practice it cuts from 0.38 s (the card near the face) to 1.26 s (clear after the departure) and blends before and after. | Unit: cuts through approach, press, hold and departure, blends at 0–0.2 s and from the rest poses; every blend it allows is replayed against the **shipped reader's triangles** (height field from business.glb) and stays clear; the scene's `interruptCut()` follows the displayed frame. Clip: `frames-change` cuts at f0031 and never enters the reader. |
| Host attach: the 45° face-up offer passed 11° from the key light's mirror angle (the print washed pale, cobalt (72,88,170)), the card stood still 0.24–0.44 s, then fell to hanging in 0.1 s at 15.8 rad/s. | The host holds the hook turned back 80° on its eye: its front leg is nearly level and its gate faces down. The card, hanging nearly upright below it, is pushed **up** through the gate, slides back along the leg and rounds the U while the hook swings home by exactly the angle the card turns on the wire, so the card itself never pitches more than 10° (its laminate stays 44.6° or more from the mirror angle). The swing home takes 0.24 s from 90 % to 10 % of the hook's tilt (a quarter pendulum period is 0.14 s), with the hook peaking at 5.5 rad/s; the host's own turn of the hook peaks at 8.7 rad/s and the card's rotation at 2 rad/s. The swivel no longer turns (it rotated the swivel eye in the D-ring, which a real swivel does not). Beats: offer 0–0.30, push 0.30–0.42, slide 0.42–0.60 (hands over to the swing at 0.32 u/s, C1), swing 0.60–0.94, gate snaps shut 0.60–0.72, strap takes the weight to 1.2. | Unit: mirror angle > 40° through the whole host (was 14°); hook and card angular speed below a free swing (9 rad/s); swing ≥ a quarter period; no 80 ms window where the card stops; the wire and gate still pass through the holder only by its slot. Clip: `frames-host` cobalt stays (23,58,138)–(36,67,156); after the lift no frame difference exceeds 1.72 (v1.2: 3.6). |
| The reader led the frame (56 % of the height, the card 31 %) and the thumbnail read as a reader; the outcome was a 26 × 6 px colour-only LED; the browser lit-pixel threshold had been lowered to 80. | **Reader ×0.72** (was ×1): 0.92 × 1.37, so the badge holder (57 × 89 mm at the badge's real scale) meets a 70 × 104 mm reader, a real desk reader's proportions. The layout and bounds were re-fitted (hang pivot (−0.48, 2.1, 0.05), reader at (0.74, 0, −0.06), bounds −1.0…1.2 × 0…2.34): the card is now 38 % of the frame height (v1.1: 38 %), the badge with its hardware and strap 50 %, the reader's box 50 % (its visible wedge less). The card is pressed **high** on the glass, centred: its clips bear on the glass 0.03 inside its edges and its top half overhangs the reader's top (the body falls away behind it), as v1.1's card overhung its reader. **Status tile**: a lit rounded tile (0.30 × 0.19) on the lower glass, below the pressed card and the NFC mark, with a dark check (accept) or minus (decline) stroked across it in the glass's black; it is on the pad (it gives with the press) and hidden while idle, so the idle reader is the master's. The LED bar still lights at the top of the glass. The tile is in view through the whole press and hold. | Unit: tile on the glass, below the NFC arcs, above nothing the card covers during the hold (0.02 margin), area > 20 × the LED; glyphs inside the tile, the check > 2 × the minus's height. Browser (540 px still): lit area > 600 px (restored and raised; it was 300 in v1.1 and 80 in v1.2), tile > 34 × 20 px, glyph pixels present, and **without colour** the check spans > 1.8 × the minus's height; no channel clips; no hotspot. At 192 px (`thumb.webp`) the check and the minus read. |
| The fixtures' alt text described check and minus glyphs that did not exist and a card hanging "above" a taller reader. | The glyphs exist again (the tile). The three business rows of `POSE_TEXT` in `src/demo/fixtures.ts` now read: guest-ready "A keycard hangs on a lanyard beside a card reader.", accepted "The keycard hangs beside the reader; the reader shows a green check.", declined "…shows a red minus." **Shared file: business rows only; route to the foundation owner for sign-off at merge.** | — |
| Minor: dark wedge where the left strand meets the sewn tab; notch and sliver at the tab top in motion. | The strands start 0.03 inside the tab (`STRAP_TUCK`), which is 0.0008 larger all round, so their open ends never show and the joint stays closed as the strap bends. | Unit: the strands' start is inside the tab, above the D-ring bar. Stills: no wedge (`capture-light-accepted.png`). |
| Minor: chrome read as white satin plastic. | `badge_chrome` roughness 0.3 → 0.1 and base 0.86 → 0.6 (recipe): it now carries dark reflections and reads as polished metal. | Stills. |
| Minor: clearance tests checked analytic planes only; the departure test dropped v1.1's anchor-speed check and sampled only accept. | New describe "against the shipped reader": a height field of the reader's front rasterised from business.glb's triangles (bezel, body, gasket, plinth fixed; glass, LED, icon on the pad, which gives at the press). Approach, press, hold and departure (accept and decline) keep the holder and the hook wire out of it; the interruption blends are checked against it too. The departure test checks both outcomes and the strap anchor's speed again (its last leg now eases evenly so it never outruns its approach). | Unit. |
| Minor: dark template's ink card lost its silhouette on the black glass. | Mostly resolved by the layout: pressed high, the card's top half is against the wall and only its lower part lies on the glass, where the holder's clear rim and the clips outline it. Not otherwise changed. | Clip `frames-accept-dark`. |
| Minor: timing not re-measured. | `pnpm capture timing http://127.0.0.1:5205`: host 1.212 s, accept 1.509 s, decline 1.510 s. | — |

Other changes made along the way:

- **Press depth 0.6 mm** (was 1 mm): at ×0.72 the gasket under the glass is 0.77 mm thick.
- **Spill light** moved in front of the status tile (face v −0.445, 0.16 out, 0.18): with the card
  pressed high, v1.2's spot above the LED lit the clip hardware green. Its mirror image falls on the
  tile itself.
- **Washout test** (browser): the scan-hold check compared the cobalt panel's luminance with the
  hanging rest pose (≤ 1.25 ×). Pressed flat on the 11.6° face the card turns towards the key, and
  with the card higher on a smaller reader the honest lighting difference is 1.47 × (print and stock
  brighten together; cobalt (36,67,157) at the hold vs (21,57,136) at rest). A veil shows as lost
  saturation, so the check is now saturation ≥ 0.88 × rest plus a luminance ceiling of 1.6 × (v1.1's
  washout was 2.8 ×). A contrast-to-stock metric was tried first and rejected: tone mapping
  compresses the brighter stock and confounds it.
- **Precompile** shows the status tile while compiling (it is hidden while idle and the compiler
  skips hidden meshes), so the contact beat never compiles a program.
- **Drag bounds** follow the new layout (pivot x −0.78…0.72, y ≤ 2.28).

## Decisions

- **Scales.** Badge ×1.5: the holder is 0.744 × 1.164, a little smaller than v1.1's 0.86 × 1.3
  card. Reader ×0.72 (v1.2.1; v1.2 used ×1): 0.92 wide and 1.37 tall, glass 0.835 × 1.138. One
  stage unit is 76.3 mm (the CR80 card width), and the physics uses that scale. v1.2 argued a real
  reader is about 2.5 × the card's width; desk readers of this form are about 1.2–1.5 ×, and at ×1
  the reader dominated the frame.
- **Hang pivot.** `card_authored` is the swivel eye where it sits in the D-ring's bottom bar.
  `card_secondary` holds the pendulum springs. `clip_pivot` is the master's `hardware` group
  (swivel, snap hook body and gate pin, joined into one chrome mesh) and turns about x at the eye.
  `card_mesh` is the master's `card_holder`, pivoted at its box centre: the clear holder, both side
  clips and the printed card move as one rigid body. `d_ring` and the strap's bar-tack stitching
  stay on `card_authored`.
- **Gate.** `snap_hook_gate` is mapped to `clip_gate`, pivoted on `gate_pin`'s axis.
  `gate_trigger` rides on the gate. It opens inwards (+x), as the master's geometry allows.
- **Strap.** The master's static strap (straight up from the D-ring) is dropped. The v1.1 runtime
  rig still draws the two strands to the off-frame anchors in the master's own material,
  `woven_fabric_blue` → `badge_strap` (woven albedo, normal map, ORM and sheen), carried into the
  GLB on a 46-triangle decimated stub (`strap_material`) that the rig deletes. The rig adds a sewn
  tab folded round the D-ring's top bar, sized to the master's layers, with the master's stitching
  on it; the strands start inside it. The master strap's baked vertex shading (COLOR_0, mean 0.9) is
  folded into the colour factor and `vertexColors` is turned off (the strands have no colour
  attribute and would render black).
- **Reader.** `front_assembly` → `scanner_face`; its 11.6° lean is the contact plane.
  `glass` → `scanner_pad` (pivot: the face origin, so pad space = face space) carries the LED
  (`scanner_light`), its glow quad (`scanner_glow`), the NFC mark and, at runtime, the status tile,
  so the press moves all of them in together. `window_gasket` → `scanner_gasket`, pivoted on its
  back plane, compresses under the glass. Body, bezel, plinth and back panel are joined per
  material.
- **Status.** The LED (`emissiveStrength 1` from the recipe) and the status tile glow in the status
  token: green `#3BE08A` (LED 1.0, tile 0.72) and red `#E53E3E` (LED 0.85, tile 0.66), below
  tone-mapping compression, green brighter than red (also under deuteranopia), and the tile's glyph
  says which without colour. Both switch on at 0.72 s at 20 % and rise to full over 90 ms.
- **Clear vinyl.** The recipe applies `transmissionToAlpha 0.35` as the brief asks, and the GLB
  carries it. Drawn as a plain alpha blend that is a 35 % white veil over the print, so the rig
  draws the holder as a clear sheet: no diffuse, its reflection added at full strength (CustomBlending
  ONE / ONE_MINUS_SRC_ALPHA), 8 % dimming, the master's roughness (0.03) and specular kept.
- **Chrome.** `badge_chrome` polished in the recipe (roughness 0.1, base 0.6) so it reads as metal.
- **Templates.** KHR_materials_variants: `light` is the master's own 2048 × 1536 print; `dark` is
  `badge_card_print_dark`, a deterministic pixel function (`darkPrint`): stock → ink `#1F2226`,
  black type → warm white `#F2EEE6`, the grey signature panel → lifted ink, cobalt lifted to
  `#406AE0` (3:1 on ink). Both prints are exact-lossless WebP at source size.

## The choreography

- **Host attach (1.2 s)** — see the table above. The master's snap hook is a closed C, so the card
  cannot slide on vertically the way it did on v1.1's J-hook; it is threaded through the gate with
  the hook held back, then the hook swings home carrying it. A test checks that the hook wire and the
  gate pass through the holder only by its slot (0.3 mm tolerance at real size).
- **Scan.** The card travels on an arc and arrives along the face normal, flat on the 11.6° glass
  (the reflection stays 41.8° from the key light; threshold 40°), centred and high (face u 0,
  v 0.265): it covers the NFC mark and leaves the status tile in view. Pressed flat, the hook's U
  would pass into the reader, so the clip turns on the slot until its back clears the glass
  (`HOOK_LIFT` 0.828 rad, as a real clip flops forward). The press closes the 0.2 mm hover gap and
  pushes the glass in 0.6 mm (`PRESS_DEPTH` 0.0079; the gasket takes it). An in-plane settle about
  the face normal (0.01 rad, C1) follows; friction damps the springs while the card is on the glass.
  The card then peels off along the normal to rest beside the reader (rest pivot
  (−0.24, 1.9, 0.42)); the strap anchor trails it and never outruns its approach.
- **Change of mind.** Away from the reader the director blends (150 ms) to guest-ready and plays
  the new outcome; at or near the reader the scene asks for a cut (see the table).
- **Physics.** A physical pendulum on the swivel at the master card's real size (plate
  0.744 × 1.164 hanging 0.835 below the eye): swing 1.78 Hz, pitch 1.83 Hz, damping ratio 0.4.
  Kicks: the travel start, the host's swing home (pitch −0.7 rad/s: the card's bottom carries on
  forward as the hook stops, plus a small sway) and the departure.
- **Continuity.** Every channel is C1. Beats meet at rest or share velocity; a test bounds the
  1 ms second differences (released spring gate excepted). Sequence ends are the exact canonical
  poses.

## Measured contract (stage units; `models/businessContract.ts`, checked against the GLB)

| | value |
|---|---|
| Holder (w × h × d) | 0.744 × 1.164 × 0.0351; side clips ±0.0375 deep at x ±0.387 |
| Holder centre below the eye | −0.835 |
| Slot (card space) | y 0.510–0.561, \|x\| ≤ 0.0795 |
| Hook | gate pin (0, −0.1406, 0.0495); gap −0.151 … −0.187; legs z ±0.057; U centre y −0.2366, r 0.057; wire r 0.0165; bottom −0.310 |
| D-ring top bar | y 0.158, wire 0.018 |
| Strap | 0.219 wide, 0.00975 thick, layers ±0.0078, strands from y 0.318 (tucked 0.03 into the tab) |
| Hang pivot | (−0.48, 2.1, 0.05) |
| Reader | ×0.72 at (0.74, 0, −0.06); 0.919 × 1.370 × 0.772 |
| Reading face | origin (0, 0.793, 0.213) in scanner space; lean 11.58°; glass front z −0.003, 0.835 × 1.138 (v −0.578…0.560); gasket −0.014 … −0.004 |
| LED | face v 0.343–0.362, half-width 0.061 |
| Status tile | face v −0.445, 0.30 × 0.19, corner r 0.05, glyph stroke 0.04 |
| Scan spot / pivot | face (0, 0.265); pivot (0.740, 1.829, 0.200), hardware Rx(−0.202 + 0.828) |
| Press | 0.6 mm (0.0079) |
| Bounds | (−1.0, 0, −0.45) … (1.2, 2.34, 0.45) |
| Pendulum | swing 1.782 Hz, pitch 1.832 Hz, ζ 0.4 |

## Export report (`pnpm models business`, deterministic: same SHA twice, `4a79e621…`)

```
triangles 76,236 · draw calls 21 · 43 nodes
textures 12 · 57.4 MiB as RGBA8 + mips
GLB 2062.5 KiB raw · 1376.5 KiB gzip
contract nodes found (18), missing: none
```

The runtime adds the strap strands and tab, the status tile and its two glyphs (a few hundred
triangles, 3 draw calls, no textures).

## Known gaps

- **Change of mind is a cut at the reader.** Master §6 allows it, but it is a visible jump from the
  reader to the ready pose. A blend that leaves along the face normal first would need the shared
  `src/core/visualDirector.ts` to accept a scene path; its blend is also a linear lerp that starts
  with a velocity step (both v1.1 and v1.2 behave so). Left to the foundation owner.
- **Status at the contact beat.** The tile is in view the moment it lights; the LED bar at the top of
  the glass is under the pressed card until the card leaves (it was the only signal in v1.2).
- **Dark template.** The ink card's lower edge on the black glass still relies on the holder's clear
  rim and the clips for its outline during the hold.
- **Lookdev.** The keycard rig (`models/keycard.ts`, `keycardBusinessRig`) is posed with v1.2's
  numbers in lookdev only. The live scene uses the masters.
- **Clearance tolerances.** The hook clearance test allows 0.3 mm where the strip bears on the
  wire; the gate's swept path is checked as a centreline with 80 % of the wire radius; the shipped
  reader height field is sampled at 4 mm cells (max of the 3 × 3 round each point) with 0.7 mm of
  allowance where the clips press the glass.
- **Not measured here.** `pnpm capture perf` cannot take both a scene and a base URL, so it was not
  re-run against this worktree's server. GPU textures stay at 57.4 MiB (budgets waived).
- **Shared files.** `src/demo/fixtures.ts` (business alt text rows) is edited here and needs the
  foundation owner's sign-off. The `docs/style-reference.md`, `docs/asset-manifest.md` and
  `docs/qualification.md` rows for Business v1.2 (reader ×0.72, the status tile, the timings
  above) are left to the foundation owner.
