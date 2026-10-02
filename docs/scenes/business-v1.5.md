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
the master's. The light is added inside the glass's own shading (polish round): the glass's emission gains the
status colour × the emission field, sampled in face space, before the clearcoat and the tone curve, so the
reflection and the light behind the glass are summed as radiance and tone-mapped together, and the light
gives with the glass at the press. (The first cut drew it as an additive quad over the glass. Blending
happens after the tone curve and in the framebuffer's sRGB encoding, so over a bright reflection it washed
the core towards white.)

There is one indicator. The master's LED pipe is hidden behind the dead-front glass (polish round; the glass
is whole under it). Its bar is the minus's own shape: lit beside the pictogram it said "minus" in green over
the check and doubled the minus in red, and dark it still made the declined face read as two dashes. The
Business sub-spec's "exactly one status indicator" holds again.

**Light: a pre-diffused HDR emission field** (`statusGlyphField`). It is pure TypeScript and deterministic:
512², 8-bit sRGB so the faint halo does not band, mipmapped, computed once per page. It is built from the
glyph's signed distance:

- A soft-edged core: the printed mask seen through the diffuser, edge 0.07 stroke.
- A near halo, the diffuser: Gaussian σ 0.55 stroke, weight 0.32.
- A far halo, the cover glass's own scatter: σ 1.4 stroke, weight 0.1. Its scale is the glass's 2–3 mm
  thickness.
- Both halos weighted per glyph (`haloGain`): ×1.4 for the check, ×3.0 for the minus. The core cannot go
  brighter without washing towards white in the tone curve, so the halo carries the glyph's presence at small
  sizes, and red has 0.37 of green's luminance.
- A subtle hotspot over the LED behind the middle: the stroke ends fall to 0.72. Uniform light along the
  stroke is what a good light guide aims for, so it is a hint, not a feature.
- A fade to exactly zero before the quad's edge, plus an 8 × 8 ordered dither in the byte encoding. One byte
  near black is about four output levels after the tone curve; without the dither it drew a contour round
  the halo.

The radiance at the glyph's brightest point is 1.95 (accept) and 1.85 (decline) × the status colour: each
glyph's strongest channel renders at 1.7–1.9 after `neutral-room`'s exposure (1.15), two to two and a half
times the Neutral tone curve's shoulder. The core rolls off gently, but the curve's path to white stays
under an eighth, so the hue holds: an LED's light is narrow-band, and its core reads as its colour, not as a
white filament. In the production view the check's core renders `(100, 249, 164)` and the minus's
`(250, 99, 96)`. Over a bright reflection of the cove (a close macro at another angle) the minus renders
`(250, 126, 126)`: that is red light plus a grey reflection, which is physics; there is no white-out. There
is no post-process and no spill light: a 1.8 mm stroke throws no light anyone can see on a card 5 mm away.
The first cut's spot moved the frames by less than one level.

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

Token contrast: 2.4:1 in luminance and 1.8:1 under deuteranopia. The decline runs a little hotter in its
strongest channel (1.63 against 1.45) and much stronger in its halo, because the minus carries 0.63 of the
check's stroke and red carries 0.37 of green's luminance. A saturated red looks brighter than its luminance
suggests, so the pair reads balanced, the minus a shade quieter, as a decline that is not an alarm should.

**Timing** (`STATUS_TIMING`, from the 0.72 s contact beat; every edge a smootherstep, C1 throughout):

- **Accept** comes up over 0.22 s (above half by 0.11 s) and holds. The canonical `accepted` pose is lit at
  1. A crest above full was tried as a "chime", but it added 5 % light to the halo only, so it was dropped.
- **Decline** is a double blink, then a hold: on over 0.08 s, held 0.07 s, off over 0.07 s, dark 0.1 s, on
  over 0.08 s and held. It is above half level for 145 ms and below it for 175 ms. The first cut held on
  225 ms and dark 96 ms, which read as a stutter. It finishes 0.4 s after contact, before the card leaves.
  The canonical `declined` pose is lit at 1.
- **Perceptual ramps.** Brightness is seen roughly as its cube root, and the HDR core reaches the tone
  curve's shoulder by about half of full level. A ramp linear in level therefore looks like a switch: the first
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

## Polish round (the integration judge: 8.5/10, four defects)

| Defect (judge) | Cause | Fix |
| --- | --- | --- |
| The red core blooms pink-white in macro | Two causes. (1) The light was an additive quad blended after the tone curve, in the framebuffer's sRGB encoding: over the bright reflection a close camera sees, red light `(1, 0, 0)` lifted green and blue from 108 to 157. (2) Peaks of 2.6 / 2.7 on the stroke put the core a quarter of the way to white. | The light is added inside the glass's own shading, before the tone curve (`addStatusLight`). The brightest point is set so the strongest channel renders at 1.7–1.9 (desaturation under an eighth). The halo carries the presence (`haloGain` 1.4 / 3.0). Minus core `(250, 99, 96)` in production; over the bright reflection `(250, 126, 126)` (was `(255, 247, 251)`) |
| The dark LED pill is the minus's dash, so the declined face shows two dashes | — | The pill is hidden behind the dead-front glass (the glass is whole under it), with its glow quad |
| Periodic light specks along the glass's bottom edge (phone) | The cover glass's 0.2 mm edge round-over, just above the gasket, faced the bright floor at grazing angles. Sub-pixel at stage scale, MSAA resolved it into evenly spaced specks. Located by recolouring the gasket, glass and steel: the speck pixels were 80 % gasket and 20 % glass sample | The round-over's normals are shaded as the face (`flattenGlassEdge`, 0.2 < n·face < 0.999); the silhouette is unchanged |
| The lanyard's shadow is a ghostly stripe on the cove | The strands run out of the frame to off-stage anchors; the key laid their shadow on the cove beside the badge with nothing visible to cast it. With the strands off, the sewn tab, its stitching and the D-ring left a detached smudge | The strands, the tab, the stitching and the D-ring cast no shadow; the hook and the card still do |

A second hostile pass on the first polish build (8.6/10) found the minus had lost 43 % of its light with the
lower core. The halo gain gives most of it back: −13 % against the earlier build, with lit area +2 %, and it
stays red.

Evidence: `evidence/v1.5/business/polish/`.
- `judge-view-glyph-macros.png` and `judge-view-reader.png` use the judge's own camera (accept / decline /
  idle).
- `edge-specks-phone-before-after.png`, `lanyard-shadow-before-after.png` (the bottom row is contrast
  stretched) and `declined-face-before-after.png` are before/after comparisons.
- `closeup-*`, `macro-*`, `screen-{desktop,laptop,phone}-*`, `still-*-540.png`, `thumb-*-192.png` and
  `strip-ramp-{accept,decline}.png` are the final renders.

## Evidence (`evidence/v1.5/business/`)

- `before/`: v1.4 for comparison (close-ups, phone crops, desktop page, 540 px and 192 px stills).
- `after/closeup-{off,accept,decline}.png`: the reader from a 2160 px still. (`closeup-dark-*` are the same
  frames: the template only changes the card, which is away from the reader in the outcome poses.)
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
- `pnpm test`: 285 passed (23 files) at the first commit; after the merge of `v1.5/integration` and the polish round, 355 passed (26 files). The polish round adds a test that the glass's edge round-over is shaded as its face, and rewrites the HDR test as an exact port of three's Neutral curve (core over the shoulder, desaturation under an eighth, weakest channel under a fifth of the strongest).
  - Rewritten status tests: the light starts from 0 at contact and is under 6 % in the first frame;
    accept's 0.22 s rise and hold; decline's two flashes, dark gap and hold, C1; the colours against
    DESIGN.md's statuses and their contrast; HDR core above the shoulder but not clipped; the halo under it
    one stroke out; the glyphs parsed from `guestControls.ts`; one stroke weight against the NFC mark; the
    field crisp, deterministic and dark at its quad's edge; the pictogram in view below the pressed card,
    inside the glass, under the NFC mark.
  - Removed: the spill-light and tile-geometry checks.
- `pnpm test:browser`: 87 passed at the first commit; 91 after the merge and the polish round (port 5507). The status test now measures the glyph's shape as the light it adds over the idle glass, and checks that the core holds its hue (weakest channel 60–125). The business status test is rewritten:
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
