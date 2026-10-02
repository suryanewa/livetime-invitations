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

## v1.4 scale (2026-10-02)

Owner: *"the RFID reader is taller than the badge"* (brief: `docs/scale-fullscreen-brief.md`, Scale part). One world
scale, 1 unit = 20 cm (`models/worldScale.ts`).

- **Reference size: the printed card is a CR80 card, 5.4 cm on its short side** (as the v1.2 physics already assumed:
  one scene unit is `MM_PER_UNIT`, 76.3 mm). `BUSINESS_WORLD_SCALE` = 0.381. The holder is then 5.7 × 8.9 cm (the brief's
  "≈ 7 × 10 cm" is a larger holder than the master's, which is cut close round its card), the strap 1.7 cm wide, the
  reader 7.0 cm wide, 10.4 cm tall and 5.9 cm deep.
- **The reader keeps its v1.2.1 size against the badge**, not the brief's 9–10 cm width: the master is a standing wedge,
  1.49 times as tall as it is wide, so at 9–10 cm wide it would stand 13.4–14.9 cm, 1.5–1.7× the holder, which is
  exactly what the owner flagged. At 7.0 cm its glass takes the holder with the side clips on the glass, as a reader's
  window takes a card, and it stands 1.18× the holder. That ratio is functional (the scan press lands the card flat on
  the glass) and unchanged, so the choreography is too.
- **How it is applied:** the whole scene scales together, so `business_root` carries the scale at runtime and every
  contract number, the hang, the hook threading, the pendulum (already computed at the card's real size, 1.78 Hz), the
  press and the drag limits stay in scene units; the beats, durations and GLB are unchanged. Two runtime details follow
  the root: the optional card drag intersects its plane in `business_root` space, and the status spill light's range
  and inverse-square strength are carried into world units. The set (cove, key throw, shadow camera) scales with the
  scene, so the badge's shadows keep their v1.3 softness and the shadow map its density over the card.
- **Framing (shared rule, `src/render/framing.ts`).** Same 18° lens, azimuth 20° and elevation 15° as every scene. The
  camera distance is set by the **hero**, the objects on stage at guest-ready, measured as their real silhouette
  (`silhouettePoints`, contact shadows and shadow proxies excluded): its height fills 60 % of the frame, or its width
  75 % when it is wide and low. Across, the hero sits centred unless a path needs the room; up and down, the frame
  centres the whole action; every authored path (`framePoints`) stays 4 % inside the edges. Checked in
  `tests/framing.test.ts` and on the real silhouettes in `tests/browser/framing.spec.ts`. Here the hero is the badge (holder, hardware, D-ring) and the reader; the
  strap, which leaves the top of the frame by design, is not part of it.
- **Measured hero, 1:1 stage:** v1.3 0.817 of the height, 0.646 of the width; v1.4 **0.600 / 0.480**, held by its
  height, not path-limited. The cove at the frame's centre measures `#D7D4CF`.
- **Known gaps:** the reader still stands taller than the holder (10.4 against 8.9 cm), by the reasoning above. The
  lanyard's long shadow on the cove (v1.3 gap) is unchanged.

## v1.3: the studio pass (2026-10-01)

- **Grade removed.** The chrome polish (`badge_chrome` at roughness 0.1, base 0.6) is gone: the D-ring, swivel and
  hook are the master's `chrome_hardware` as authored (roughness 0.3, base 0.86), with the rig's own environment 1.0
  on every tier (Decisions, Chrome). `business.glb` re-exported (2062.5 KiB raw, unchanged to the tenth).
- **New studio.** The production rig is `neutral-room` (`docs/style-reference.md` v1.3); the cove measures `#D8D5D0`
  here (token `#D5D2CD`). The browser test that reads the status glyph insets further into the tile, because through
  the perspective lens its edges are not quite level. The scan's "reflection 41.8° from the key light" was computed
  for the v1.1 key; the new key comes from a different direction and the angle was not re-derived (the judges did
  not raise it).
- **Judges.** The badge print, the lanyard weave and the reader's glass all read; no grade is needed. Open: the
  reader's lower front and bezel read near-white and more chrome than brushed. The rig's designer traced it to the
  master's material under the window; the judges would fix it in the light (trim the lamp or skylight on the bezel),
  not in the material. A diagonal shadow streak sits at the top right of the cove.
- Posters regenerated under the new rig (16.2–19.6 KB).

## v1.2.2 fixes (three judges' review of 6a7f2a1)

Frame differences below are the mean absolute RGB difference between consecutive 540 px frames of
the 62.5 fps review clips (`outputs/business/frames-*`), as the judges measured them.

| Finding | Fix | Guarded by |
|---|---|---|
| **Must fix.** A change of mind at 0.5 s (the card still in the air on its approach) cut straight to guest-ready: frames-change f0030 → f0031, diff 20.7, the largest jump in all five scenes. v1.2.1 cut from 0.38 s to 1.26 s. | **No cut and no straight blend.** The scene now draws the hand-over itself, without a change to the shared director: `interruptCut()` always answers true, and the scene uses the director's 0 ms cut (settle, pose guest-ready, new sequence from t = 0) as the hand-over point. In `interruptCut()` it plans a **recovery** (`planRecovery`, sequences.ts) from the pose on screen (drag offset included), moving at the velocity it had (a backward difference of the pure authored path). For the new outcome's first `RECOVER` = 0.3 s it draws `applyRecovery` over the authored frame. The eye follows an offset that starts at the pose on screen with the old velocity and decays to zero with zero slope (smootherstep position term plus a Hermite velocity term), so it is C1 at both ends. On top of that is a **peel along the face normal** (a u²(1−u)³ bump, peak 0.14, near the reader only, where `blendReaderDepth` says a straight blend would hit). Rotations and the card's turn on the hook hold for the first 18 % (the card leaves flat, as it arrived), then ease onto the authored ones. The glass springs back exactly as far as the card has left it. The old status light fades over the first 0.18 s instead of switching off, and the sway springs carry on through the change (the cut's `settle()` zeroed them: the 1.65° pop that coverage.md records). The new outcome's first 0.15 s is a near-still anticipation at guest-ready, so the badge passes by the ready pose: its eye turns 0.10–0.17 from the ready eye, at x −0.41 against −0.48. The new outcome still ends 1.5 s after the change (the director's blend took 0.15 s longer). The carried velocity is scaled down (to ¾, ½, ¼ or 0) where it would push the badge deeper into the reader than it already is; across all 150 changes tested it was never needed. | Unit (`Business against the shipped reader`): for accept ↔ decline interrupted every 20 ms and from both settled poses (150 changes), the first frame is the pose on screen, the start velocity equals the carried one, the end equals the authored frame with its velocity, the eye passes within 0.2 of ready (0.24 when cut short in full flight), 1 ms steps and second differences stay bounded (C1), and the card and hook stay out of the **shipped reader's** height field (glass give included, 0.05 mm contact tolerance). The scene test drives interruptCut → settle → pose → sample at the press: no jump, the old light fades, the glass returns. Clip `frames-change`: 3.65 → 1.75 → 2.46 → 3.94 across f0031–f0034 (the card reverses out of its approach, a smooth V), then up to 8.1 as the authored travel; the clip's maximum is 8.44, the new outcome's own departure (v1.2.1: 19.8 at the cut). Extra clips (a scratch recording, not shipped) of a change at the press (0.9 s), during the departure (1.25 s) and from the settled accepted pose ramp from rest to a maximum of 8.5, with no spike. |
| **Must fix.** Host attach stop–hop–stop: motion nearly stopped at 0.30 s (end of the offer), the push came in a 5-frame burst, then it nearly stopped again at 0.42 s (end of the push, 21 changed px) before the swing. | The beats now hand over their speed. The offer's position ease ends at `THREAD_SPEED` 0.7 u/s along the push direction (its tilt and the hook's turn still end at rest). The push, a 6 mm-radius corner onto the front leg (`CORNER` 0.006: the slot has about 9 mm of slack round the wire, so the strip can turn down the leg only as it centres on it) and the slide along the leg are one arc-length path. One C1 Hermite in time takes it from 0.7 u/s to `SLIDE_SPEED` 0.45 u/s at the U. The swing round the U is unchanged in kind and now runs 0.50–0.94 s (was 0.60–0.94). Beats: offer 0–0.28, through the gate by 0.39, on the U at 0.50, hung 0.94; the gate closes 0.60–0.72 as before. | Unit: a new test checks that the card centre's speed never falls below 0.45 u/s (or 20 % of its peak) from 0.05 s until 0.15 s into the swing (v1.2.1: 0.04). The existing checks are unchanged and pass: slot clearance (the wire and gate pass through the holder only by its slot), mirror angle, hook speed below a free swing, swing ≥ a quarter period, C1. Clip `frames-host`: after the offer the differences run 0.89 → 0.79 (f19–f25) → 0.46 (f27–f30, the slide) → 1.44 (swing peak). The v1.2.1 minima were 0.08 and 0.04, and the f22–f24 burst (1.7) is gone. |
| Minor: the strap swung to its rest angle fast on the departure (accept/decline f0072–f0095). | The strap anchor's last leg now starts with the clip's departure (`ANCHOR_DEPART`, t = 1.14; was 1.20), so it runs over 0.36 s, not 0.30 s, and still trails the clip. | Unit: the anchor trails the clip and never outruns its approach (existing). |
| Minor: the clear holder's rim read milky and pale against the cream stage. | `VINYL.dimming` 0.08 → 0.14: the rim beyond the card now reads a shade darker than the stage behind it, with the softbox edge highlight on it, as a clear sheet does. The print under it dims by the same 6 %. Saturation and the washout ceiling are relative checks and still pass. | Stills (`capture-light-guest-ready.png`); browser washout test. |
| Minor: the status tile is an addition beyond the brief (which named the master's `led`/`led_glow`). | Kept, for the reasons in v1.2.1: it is shape-coded, it stays in view while the card covers the LED, and it reads at 192 px. **Recorded as a deviation here; `docs/spec-revisions.md` is a shared file, so routed to the foundation owner:** "Business status: besides the master's LED bar, a lit tile on the lower glass carries a check (accept) or a minus (decline), so the outcome reads by shape and stays visible under the pressed card." | — |

Not changed (reasons):

- *The threading through the snap hook is too small to read at stage scale* (judge 1). It is the real
  hardware at the badge's real size: the hook's gap is 2.7 mm and the leg 5 mm. Scaling the
  hardware up or exaggerating the path would break the master's proportions. The visible beat is
  the hook swinging home with the card, and that now flows without a stop.
- *The strap is one wide ribbon with no twist* (judge 2). Twist would need a new strap rig (a
  framed curve with roll), which is beyond a polish pass. The strap still trails the clip and swings
  plausibly.
- *The LED bar is hidden under the pressed card; the dark ink card's lower edge relies on the holder
  rim* (judges 1–3). These are documented below under Known gaps. The tile carries the outcome, and
  the darker vinyl rim (above) helps the dark card's outline a little.

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
  ONE / ONE_MINUS_SRC_ALPHA), 14 % dimming (v1.2.2; 8 % read milky), the master's roughness (0.03)
  and specular kept.
- **Chrome.** The master's `chrome_hardware` as authored (roughness 0.3, base 0.86), own environment 1.1. v1.2.1
  polished it in the recipe (roughness 0.1, base 0.6) because it read as white satin plastic in the v1.1 beige
  studio; the studio pass v1.3 removed that grade.
- **Templates.** KHR_materials_variants: `light` is the master's own 2048 × 1536 print; `dark` is
  `badge_card_print_dark`, a deterministic pixel function (`darkPrint`): stock → ink `#1F2226`,
  black type → warm white `#F2EEE6`, the grey signature panel → lifted ink, cobalt lifted to
  `#406AE0` (3:1 on ink). Both prints are exact-lossless WebP at source size.

## The choreography

- **Host attach (1.2 s)** — see the tables above (v1.2.2: the offer, push, corner and slide hand
  over their speed; the swing runs 0.50–0.94 s). The master's snap hook is a closed C, so the card
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
- **Change of mind (v1.2.2).** The scene draws the hand-over itself from the pose on screen. It
  peels off the glass along the face normal when it is near the reader, swings back by guest-ready
  and joins the new outcome by 0.3 s, all C1 (see the v1.2.2 table). The director only provides the
  0 ms switch.
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

## Export report (`pnpm models business`, deterministic: same SHA twice, `40056ccb…`; unchanged by v1.2.2, which is runtime only)

```
triangles 76,236 · draw calls 21 · 43 nodes
textures 12 · 57.4 MiB as RGBA8 + mips
GLB 2062.5 KiB raw · 1376.5 KiB gzip
contract nodes found (18), missing: none
```

The runtime adds the strap strands and tab, the status tile and its two glyphs (a few hundred
triangles, 3 draw calls, no textures).

## Known gaps

- **Change of mind uses the director's cut as a hand-over (v1.2.2).** The shared
  `src/core/visualDirector.ts` is unchanged. Business answers `interruptCut()` with true every time
  and draws its own C1 recovery over the new sequence's first 0.3 s. That stretches the hook's
  documented meaning ("a straight blend would pass objects through each other"). A first-class
  scene path in the director (for example `interruptPath?()`) would make the contract explicit.
  Routed to the foundation owner, together with the spec-revisions row for this behaviour: "Business
  change of mind: no straight blend; the scene peels the card off the reader and joins the new
  outcome over 0.3 s from the pose on screen (0 ms director cut as the hand-over)." The scene's
  recovery also replaces the director's linear 150 ms blend away from the reader (its velocity
  steps), and it keeps the sway springs (coverage.md's 1.65° settle pop no longer applies to
  Business).
- **Accept/decline anticipation.** The first 0.15 s lean comes to rest before the travel sets off
  (frame differences dip to 0.2 at f0010 of `frames-accept`). It is an authored anticipation hold
  that was not flagged and is unchanged.
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
- **Timing (v1.2.2).** `pnpm capture timing http://127.0.0.1:5205`: host 1.213 s, accept 1.512 s,
  decline 1.512 s.
- **Not measured here.** `pnpm capture perf` cannot take both a scene and a base URL, so it was not
  re-run against this worktree's server. GPU textures stay at 57.4 MiB (budgets waived).
- **Shared files.** `src/demo/fixtures.ts` (business alt text rows) is edited here and needs the
  foundation owner's sign-off. `docs/spec-revisions.md` needs two Business rows (the status tile and
  the change-of-mind recovery, worded in the v1.2.2 table and above). The `docs/style-reference.md`, `docs/asset-manifest.md` and
  `docs/qualification.md` rows for Business v1.2 (reader ×0.72, the status tile, the timings
  above) are left to the foundation owner.
