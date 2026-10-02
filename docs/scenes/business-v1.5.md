# Business v1.5: the reader's status light

Surya, edit 12 of the perfection pass (`docs/perfection-pass-brief.md`): *"Make the check mark and decline
signs for the key card look less cheap and tacky."*

Branch `v1.5/business`. Files: `models/business.ts` (rig), `models/businessPrint.ts` (the light's emission
field), `models/businessContract.ts` (`STATUS_PICTOGRAM`), `src/scenes/business/sequences.ts`
(`STATUS_TIMING`, `statusEnvelope`, `recoveryFade`), `tests/business.test.ts`,
`tests/browser/business.spec.ts`. The GLB is unchanged (`pnpm models business` re-exports it byte for byte,
SHA `26ffe78d…`): the status is runtime only.

## What was wrong (measured on `main`, `evidence/v1.5/business/before/`)

- The outcome was a **flat lit tile**: a 0.30 × 0.19 rounded rectangle of saturated colour (emissive 0.72,
  below the tone curve, so no light behaviour at all) with a dark check or minus "cut" into it, plus the
  master's LED bar lit in the same colour. Under the studio it read as a sticker on the glass: hard edges,
  one flat value, no glow, no hotspot. A dark glyph on a lit field is the opposite of a lit indicator.
- It switched on at 20 % and rose to full in 90 ms: a pop.
- Its spill was a point light 0.16 out from the glass. With the matte tile gone, its mirror image showed as a
  white glint on the glass beside the glyph.

## Research: how real readers answer

| Reader | Indicator | Accept / deny |
| --- | --- | --- |
| HID Signo (20/40, Décor 30) | Light bar behind a glass face (Décor: a 90 × 90 mm glass face) | Flashing green / flashing red; idle blue |
| Salto XS4 2.0 | LED behind the reader face, plus tones | Solid green / solid red; blue while updating |
| Kisi Reader Pro 2 | LED ring round the target | Idle white → "breathing" → green or red → idle |
| Verkada AD32 (Red Dot) | Nine soft-white status LEDs and one feedback LED, deliberately dim ("without polluting environments with bright indicator lights") | Green / red feedback LED |
| Avigilon Alta (Openpath) | Centre dot and outer ring | Green dot and ring on an identified credential |
| 2N Access Unit | Back-lit pictograms and an LED | Green symbol and LED when unlocked; red LED when secured |

What drove the design: premium readers put the light **behind** a dark glass or acrylic face and show nothing
until lit (dead front). What lights is small and specific (a pictogram, a bar, a ring), never a coloured
panel. The light has a bright core and a soft halo where the face scatters it. The feedback is a short
gesture (a flash, a breath, a double flash), not an on/off switch.

## What was built

**Hardware: a dead-front pictogram behind the reader's own smoked cover glass.** The master's black glass
(clearcoated, roughness 0.06) is the smoked layer. The pictogram lights behind its lower part: below the NFC
mark, in the clear glass the pressed card leaves in view. While idle nothing is drawn, so the face is exactly
the master's. The light is drawn as the radiance it adds through the glass: an additive, tone-mapped quad on
the pad, which gives with the glass at the press. The glass's own reflections stay over the lit glyph, as
they do on a real cover glass.

There is one indicator. The master's LED pipe stays its lens, dark and frosted (roughness 0.4 → 0.85, as a
light pipe's diffusing lens is; at 0.4 its curved rim sparkled into a dotted dash at 1×). Its bar is the
minus's own shape. Lit beside the pictogram it said "minus" in green over the check and doubled the minus in
red: two red dashes at the 192 px thumbnail. The Business sub-spec's "exactly one status indicator" holds
again.

**Light: a pre-diffused HDR emission field** (`statusGlyphField`). It is pure TypeScript and deterministic:
512², 8-bit sRGB so the faint halo does not band, mipmapped, computed once per page. It is built from the
glyph's signed distance:

- A soft-edged core: the printed mask seen through the diffuser, edge 0.07 stroke.
- A near halo, the diffuser: Gaussian σ 0.4 stroke, weight 0.22.
- A far halo, the cover glass's own scatter: σ 1.3 stroke, weight 0.08. Its scale is the glass's 2–3 mm
  thickness.
- A subtle hotspot over the LED behind the middle: the stroke ends fall to 0.72. Uniform light along the
  stroke is what a good light guide aims for, so it is a hint, not a feature.
- A fade to exactly zero before the quad's edge, plus an 8 × 8 ordered dither in the byte encoding. One byte
  near black is about four output levels after the tone curve; without the dither it drew a contour round
  the halo.

Peak radiance is 2.6 (accept) and 2.7 (decline) × the status colour. Under `neutral-room`'s Neutral tone
curve (exposure 1.15), both cores pass the shoulder about threefold: bright, a little lifted towards white,
never clipped flat. On the 540 px still the check's core renders `(143, 255, 195)`, the minus's
`(255, 154, 153)`, and the halos `(31, 200, 126)` and `(195, 33, 18)`. There is no post-process and no
spill light: a 1.8 mm stroke throws no light anyone can see on a card 5 mm away. The first cut's spot moved
the frames by less than one level.

**Glyphs: the product's own, exactly.** These are the shell's check `M4.5 10.5 l3.5 3.5 7.5 −8` and minus
`M5 10 h10` (`src/ui/guestControls.ts`), stroke 2.2, round caps and joins, on the same 20-unit grid.
Decline is a minus, as everywhere in the product (DESIGN.md: "check for Accept, minus for Decline"). The
reader stands for the guest's answer, not for access control, and a red ✕ would make declining read as an
error.

- **Optical weight.** Both glyphs share one stroke weight and are centred by their boxes. The minus keeps the
  shell's 10 units against the check's 11-unit span: one unbroken lit bar reads longer and heavier than two
  angled strokes. The first cut's 11-unit minus outweighed the check.
- **Size on the glass.** The grid is 0.21 stage units, so strokes are 0.0231 (1.8 mm at the card's real
  scale). That is a hair under the printed NFC mark's 0.0236, so the face carries one stroke weight. The
  check is 8.8 mm wide.
- **Placement.** Face v −0.43, centred. During the hold it is 0.04 below the pressed card's lowest point,
  counting the glow, and its halo stays inside the window.

**Colours:**

| | token | hue | why |
| --- | --- | --- | --- |
| Accept | `#3BE08A` | 149° | Saved Pine `#176B42` is 151°; the Party status light is the same green |
| Decline | `#F12D22` | 3° | A red LED's red, with more green than blue. Garnet `#A62D36` sits at 355.5°, a pigment hue; lit at that hue (`#ED313F`, the first cut), the overdriven core rolled off pink. v1.2's `#E53E3E` was a plain warning red at 0° |

Token contrast: 2.4:1 in luminance and 1.8:1 under deuteranopia. Rendered halos: 2.71:1 and 2.13:1. The
decline runs a little hotter (2.7 against 2.6), because the minus carries 0.63 of the check's stroke and red
carries 0.37 of green's luminance. A saturated red looks brighter than its luminance suggests, so the pair
reads balanced, the minus a shade quieter, as a decline that is not an alarm should.

**Timing** (`STATUS_TIMING`, from the 0.72 s contact beat; every edge a smootherstep, C1 throughout):

- **Accept** comes up over 0.22 s (above half by 0.11 s) and holds. The canonical `accepted` pose is lit at
  1. A crest above full was tried as a "chime", but it added 5 % light to the halo only, so it was dropped.
- **Decline** is a double blink, then a hold: on over 0.08 s, held 0.07 s, off over 0.07 s, dark 0.1 s, on
  over 0.08 s and held. It is above half level for 145 ms and below it for 175 ms. The first cut held on
  225 ms and dark 96 ms, which read as a stutter. It finishes 0.4 s after contact, before the card leaves.
  The canonical `declined` pose is lit at 1.
- **Perceptual ramps.** Brightness is seen roughly as its cube root, and the HDR core reaches the tone
  curve's shoulder by 40 % of full level. A ramp linear in level therefore looks like a switch: the first
  cut, an ease-out, showed 59 % of the visible change in its first 16 ms frame. Smootherstep edges start as
  10u³, so the glyph surfaces from black and then the halo fills in. The first frame after contact is under
  6 % of full.
- **Change of mind.** The old light fades over 0.18 s on the same cubic tail (`recoveryFade`, was a
  smoothstep). The new one answers at its own contact beat.

## Adversarial inspection (two rounds, an independent reviewer reading the frames)

Round 1 found the following, and all of it was fixed:

- The cores clipped flat to near-white and the red core went pink. The near halo was twice too heavy, so
  the strokes looked 1.3–1.5× the NFC mark's: "a neon sign".
- The double blink read as a stutter.
- The spill did nothing.
- The crest was invisible.
- A faint contour ringed the halo.
- The 11-unit minus outweighed the check.

Round 2: "It now meets the bar… a crisp backlit pictogram with a soft glass halo." Its two should-fixes were:

- **The red core reads salmon** rather than warm. Neutral tone mapping lifts green and blue equally. The
  decline peak was lowered from 3.2 to 2.7, which moved the core from `(255, 165, 164)` to
  `(255, 154, 153)`. A separately tinted warm core was not added: it would be a tint to taste.
- **The dark LED pill is a ragged 2 px dash at laptop 1×.** The frosted lens calms the sparkle. What remains
  is the rasterisation of a 15 × 2 px slanted master part. MSAA is on, so this is a resolution limit.

## Evidence (`evidence/v1.5/business/`)

- `before/`: v1.4 for comparison (close-ups, phone crops, desktop page, 540 px and 192 px stills).
- `after/closeup-{off,accept,decline}.png`, `after/closeup-dark-{accept,decline}.png`: the reader from a
  2160 px still (light and dark templates).
- `after/macro-{off,accept,decline}.png`: the lower glass at 8× DPR.
- `after/screen-{desktop,laptop,phone}-{accept,decline}[-reader].png`: the real fullscreen layouts and the
  reader at its on-screen size (desktop 1440 × 900 @2×, laptop 1280 × 720 @1×, phone 390 × 844 @3×).
- `after/still-*-540.png`, `after/thumb-*-192.png`: the square stage, and the collection thumbnail size.
- `after/strip-ramp-{accept,decline}.png`: the light ramp, 16 ms frames, tight on the glyph.
- `after/strip-reader-{accept,decline}.png`: the whole reader through contact, hold and departure.
- `after/strip-change.png`: a change of mind after the light is on.
- `after/beats/capture-*.png`: `pnpm capture business` stills per beat.
- `after/clips/*.mp4`: the 62.5 fps recordings.

## Tests

- `pnpm typecheck`: clean.
- `pnpm test`: 285 passed (23 files).
  - Rewritten status tests: the light starts from 0 at contact and is under 6 % in the first frame;
    accept's 0.22 s rise and hold; decline's two flashes, dark gap and hold, C1; the colours against
    DESIGN.md's statuses and their contrast; HDR core above the shoulder but not clipped; the halo under it
    one stroke out; the glyphs parsed from `guestControls.ts`; one stroke weight against the NFC mark; the
    field crisp, deterministic and dark at its quad's edge; the pictogram in view below the pressed card,
    inside the glass, under the NFC mark.
  - Removed: the spill-light and tile-geometry checks.
- `pnpm test:browser`: 87 passed. The business status test is rewritten:
  - dead front while idle, with no lit pixel and no glint;
  - lit in colour, with the core lifted but not clipped;
  - check about twice the minus's height without colour, widths within 20 %;
  - halo medians green and red, luminance ≥ 2:1 and ≥ 1.75:1 under deuteranopia;
  - no glint on the lower glass. This would have caught v1.4's spill glint.

## Known gaps and decisions for integration

- **Posters, thumbnails and fullscreen backdrops** are not regenerated on this branch
  (`CAPTURE_STAGE_ONLY=1`). The integration step regenerates them after the merge. Until then the
  Business accepted/declined posters show v1.4's tile.
- **Shared docs.** `docs/style-reference.md` (the Business status line) and `docs/spec-revisions.md`
  row 27 are updated here, Business rows only.
- **Lookdev colours.** The lookdev keycard rig (`models/keycard.ts`) and the v1.1 material library's
  status tokens (`src/render/materials.ts`) keep v1.1's colours. They are used by lookdev and the study
  page only.
- **Unrelated to this edit.** The reviewer noticed a row of 1 px dark specks along the card holder's lower
  edge while it is pressed (already present before the light comes on: the badge, not the status).
