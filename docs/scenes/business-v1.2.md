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

## Decisions

- **Scales.** Badge ×1.5: the holder is 0.744 × 1.164, a little smaller than v1.1's 0.86 × 1.3
  card. Reader ×1: 1.28 wide and 1.9 tall. At these scales the glass (1.16 × 1.58) takes the whole
  holder and still leaves the LED bar in view above it, beside the clip hardware. Smaller reader
  scales could not fit both. This makes the reader about 1.7× the card's width; a real reader is
  about 2.5×. One stage unit is 76.3 mm (the CR80 card width), and the physics uses that scale.
- **Hang pivot.** `card_authored` is the swivel eye where it sits in the D-ring's bottom bar.
  `card_secondary` holds the pendulum springs. `clip_pivot` is the master's `hardware` group
  (swivel, snap hook body and gate pin, joined into one chrome mesh) and turns about x at the eye
  and about y on the swivel. `card_mesh` is the master's `card_holder`, pivoted at its box centre:
  the clear holder, both side clips and the printed card move as one rigid body. `d_ring` and the
  strap's bar-tack stitching stay on `card_authored`.
- **Gate.** `snap_hook_gate` is mapped to `clip_gate`, pivoted on `gate_pin`'s axis.
  `gate_trigger` rides on the gate. It opens inwards (+x), as the master's geometry allows.
- **Strap.** I dropped the master's static strap, which hangs straight up from the D-ring. The
  v1.1 runtime rig still draws the two strands to the off-frame anchors, but now they use the
  master's own material, `woven_fabric_blue` → `badge_strap` (woven albedo, normal map, ORM and
  sheen). The material reaches the GLB on a 46-triangle decimated stub (`strap_material`), which
  the rig deletes. The rig adds a sewn tab folded round the D-ring's top bar, sized to the master's
  layers (0.146 wide, 0.0065 thick, centres ±0.0052 scan), so the master's stitching sits on it.
  The master strap's baked vertex shading (COLOR_0, 0.49–1.0, mean 0.9) is folded into the colour
  factor and `vertexColors` is turned off. Without that the strands, which have no colour
  attribute, render black.
- **Reader.** `front_assembly` is mapped to `scanner_face`. Its 11.6° lean is the contact plane.
  `glass` → `scanner_pad` (pivot: the face origin, so pad space = face space) carries the LED
  (`scanner_light`), its glow quad (`scanner_glow`) and the NFC mark, so the press moves all of
  them in together. `window_gasket` → `scanner_gasket`, pivoted on its back plane, compresses
  under the glass. Body, bezel, plinth and back panel are static and joined per material.
- **Status light.** `led` and `led_glow` carry `emissiveStrength 1` from the recipe. The rig
  drives emissive colour and intensity where v1.1 drove the status window: green `#3BE08A` at
  1.0 and red `#E53E3E` at 0.85, both below tone-mapping compression, with green brighter than red
  (also under deuteranopia). The halo quad fades in with it. The LED switches on at 0.72 s at 20 %
  and rises to full over 90 ms (`statusLevel`). The v1.1 check and minus glyphs are gone; the
  master reader has none. The spill point light stays (0.35). It sits 0.62 up the face and 0.4
  out from the LED, so its mirror image in the glossy glass falls off the glass. At v1.1's
  placement (straight out from the LED) it left a green dot on the glass.
- **Clear vinyl.** The recipe applies `transmissionToAlpha 0.35` as the brief asks, and the GLB
  carries it. Drawn as a plain alpha blend, though, that puts a 35 % white veil over the print
  (cobalt turns sky blue). The rig instead draws the holder as a clear sheet: no diffuse, its
  reflection added at full strength (CustomBlending ONE / ONE_MINUS_SRC_ALPHA), 8 % dimming,
  satin roughness 0.22 and specular 0.3. With a mirror-smooth sheet, the whole card flashed white
  for one frame each time it turned through the key light's mirror angle.
- **Templates.** KHR_materials_variants has two variants. `light` is the master's own 2048 × 1536
  print. `dark` is `badge_card_print_dark`, made by a deterministic pixel function
  (`darkPrint`): card stock → ink `#1F2226`, black type → warm white `#F2EEE6`, the grey signature
  panel → lifted ink, and the cobalt marks lifted to `#406AE0` (3:1 on ink). Anti-aliased edges are
  unmixed first so the marks stay clean. The card's edge stock goes to the family ink by colour
  factor. Both prints are exact-lossless WebP at source size. The master's print has no photo
  window; its marks (ALL ACCESS, MEMBER 001, the barcode, the cobalt C) stay legible in both
  templates.

## What changed in the choreography

- **Host attach (1.2 s).** The master's snap hook is a closed C, so the card cannot slide on
  vertically the way it did on v1.1's J-hook. The new sequence:
  1. (0–0.24 s) The card lifts from host-ready and is offered at 45°. The hook turns back 45° on
     its eye and 0.6 rad on its swivel to take it. The swivel turn keeps the laminate off the key
     light's mirror angle; offered face-up without it, the card flashed white.
  2. (0.24–0.40) The holder's strip is pushed through the open gate's gap: 0.036 gap, 0.035 strip.
  3. (0.40–0.64) The slot slides down the front leg and round the U. The card stays square to the
     wire, with a C1 ramp where the leg meets the arc. It threads by the slot's middle and settles
     onto the strip-on-U contact as it hangs. The hook comes back under the eye.
  4. (0.56–0.68) The spring gate snaps shut once the strip is clear of its path.
  5. (0.64–1.2) The strap takes the weight (the v1.1 dip), with a pitch kick for the drop's
     momentum.

  A test checks that the hook wire and the gate pass through the holder only by its slot
  (0.3 mm tolerance at real size).
- **Scan.** The card arrives along the face normal and lies flat on the 11.6° glass (v1.1 turned
  it 20°; the near-upright face no longer mirrors the softbox: 41.8°, threshold 40°). It sits
  over the NFC mark, low and left (face u −0.17, v −0.15), so the LED and the clip hardware above
  the card stay clear of each other. Pressed flat, the hook's U, which runs through the slot and
  bulges behind it, would pass into the reader. So the clip turns on the slot until its back
  clears the glass, as a real clip flops forward (`HOOK_LIFT`, the smallest such angle,
  0.828 rad). The press: the clips close a 0.003 hover gap and push the glass in by 1 mm
  (`PRESS_DEPTH` 0.0131). The gasket takes it (scale on its back plane), and the card never passes
  into the glass (C1 contact ramp). An in-plane settle about the face normal (0.01 rad, C1 at
  both ends) replaces v1.1's rotation settle, which would have pushed the card into the glass.
  Friction damps the springs while the card is on the glass. The card then peels off along the
  normal and comes to rest beside the reader (rest pivot (−0.3, 1.98, 0.42); z moved forward from
  0.3 so the departure never brushes the glass).
- **Physics.** A physical pendulum on the swivel at the master card's real size (plate
  0.744 × 1.164 hanging 0.835 below the eye): swing 1.78 Hz, pitch 1.83 Hz, damping ratio 0.4.
  These replace v1.1's 1.1 / 1.3 Hz at 0.85. Kicks: the travel start (as before), the host drop
  (pitch 0.9 rad/s plus a small swing), and the departure. The v1.1 pitch kick at the contact beat
  is gone: the card is on the glass then.
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
| Strap | 0.219 wide, 0.00975 thick, layers ±0.0078, strands from y 0.318 |
| Hang pivot | (−0.55, 2.3, 0.05) |
| Reader | at (0.8, 0, −0.08); 1.276 × 1.902 × 1.07 |
| Reading face | origin (0, 1.102, 0.296) in scanner space; lean 11.58°; glass front z −0.004, 1.16 × 1.58; gasket −0.020 … −0.006 |
| LED | face (0, 0.477–0.503), half-width 0.085; glow quad 0.28 × 0.12 |
| Scan pivot | (0.630, 1.731, 0.345), hardware Rx(−0.202 + 0.828) |
| Pendulum | swing 1.782 Hz, pitch 1.832 Hz, ζ 0.4 |

## Export report (`pnpm models business`, deterministic: same SHA twice)

```
triangles 76,236 · draw calls 21 · 43 nodes
textures 12 · 57.4 MiB as RGBA8 + mips
GLB 2062.5 KiB raw · 1376.5 KiB gzip
contract nodes found (18), missing: none
```

The strap's 1024² normal map (536 KiB) is most of the file. The two prints are 21 KiB each
(flat colour, exact lossless).

## Known gaps

- **Lookdev.** The keycard rig (`models/keycard.ts`, `keycardBusinessRig`) is posed with v1.2's
  numbers in lookdev only. The live scene uses the masters.
- **Clearance tolerances.** Two allowances, both far below a pixel: the hook clearance test allows
  0.3 mm of contact where the strip bears on the wire, and the master's own hang already has the U
  1 mm into the strip's edge. The gate's swept path is checked as a centreline with 80 % of the
  wire radius.
- **LED size.** The LED bar is small on a phone stage (about 26 × 6 px on a 540 px still). It reads
  through colour and the glow, not through a glyph. The fixtures' alt text still mentions "a check"
  and "a minus" (`src/demo/fixtures.ts` is a shared file).
- **Not re-measured.** The 60 fps timing capture (`pnpm capture timing`) was not re-run because
  the durations are unchanged. GPU memory rises to 57 MiB of textures (budgets waived for this
  pass) and needs a new row in `docs/qualification.md`, which is a shared file.
- **Docs.** The `docs/style-reference.md` and `docs/asset-manifest.md` rows for Business v1.2 are
  left to the foundation owner (shared files).
