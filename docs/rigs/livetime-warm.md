# Rig `livetime-warm`: a daylight window on the peach plaster cove

Studio pass v1.3, direction (a) of `docs/studio-pass-brief.md`. This rig keeps the Livetime peach and
plaster identity, and lights it like a room: a large, soft window key, a bright overcast sky, a warm floor
bounce, and an environment at full strength whose light shapes give the metals something to reflect.
The source is `src/render/rigs/livetime-warm.ts`. Preview it at `?rig=livetime-warm` on localhost.

| | |
|---|---|
| Stage colour (measured) | **`#F6DDC3`**. Per scene: business `#F6DDC3`, party `#F6DDC3`, birthday `#F6DEC3`, sports `#F5DCC2`, dinner `#F6DDC3` |
| Tone mapping / exposure | `NeutralToneMapping`, exposure **1.0** |
| Environment | `environmentIntensity` 1.0, `metalEnvIntensity` 1.0, PMREM at sigma 0 (light shapes stay crisp) |
| Key | `SpotLight` `#FFF7EE` × 3.0, decay 0, at (−6.2, 7.4, 5.6), angle 0.62, penumbra 1, aimed at `ctx.target`. It casts the shadow. |
| Shadow | `vogel16`, 1024², radius 9, bias −0.0004, normal bias 0.014, near 5 / far 22 |
| Fill / bounce | Hemisphere `#E6ECF2` / `#E8C9A6` × 0.18. Directional `#FFD9B3` × 0.22 from below-front (it lights only undersides). |
| Backdrop | The plaster cove sweep `#F0DCC6`, roughness 0.92. Relief at normal scale 0.18, cloudy albedo mottle removed. |
| Gobo | None |
| Low tier | The Stage drops the shadow map. `setLowDetail` drops the plaster relief normal, and back on return. Checked on all five scenes, Low → Normal, with no console errors. |

## Results

- Rig sheet: `outputs/rigs/livetime-warm/sheet.png`. It has five scenes, both presets, guest-ready and accepted.
- Authored poses mid-motion: `outputs/rigs/livetime-warm-poses/sheet.png` (from a scratch script).
  - Sports accept: the ball airborne, over the rim, and in the net.
  - Dinner accept: the cloche lifted and set down.
  - Business accept: the card swinging to the reader and the tap.
  - Birthday decline: the cake carried over the open charcoal bin.
  - Party decline: the lid closing.

  Every pose stays lit and readable, and the cake reads clearly against the dark bin.
- Low vs Normal: `outputs/rigs/livetime-warm-low/sheet.png`.

## The environment: a warm daylit room

The room is built from emissive meshes and prefiltered once. Nothing is downloaded, and the room is the
same on every load. The camera looks from +z, 20° towards +x and 15° up, so camera-left is −x.

- **Shell.**
  - Walls: warm-white plaster `#EFE6DC` × 0.5.
  - Ceiling: overcast `#F4F3F0` × 0.85.
  - Floor: sunlit peach `#F1DCC6` × 0.6.
  - Floor pool: a brighter sunlit patch under the window, `#FFE6C8` × 0.95.

  The floor and the pool are the warm bounce.
- **Window, camera-left, in front.** Four sheer panes in a 2 × 2 grid, 2.3 × 3.6 each. Mullion gaps let the
  wall show through. The panes are graded from 2.3 at the sill to 3.2 at the head, the sky being brighter
  at the top. This is the key's direction, and the shape the cloche, chrome and porcelain reflect.
- **Skylight strip** overhead, slightly behind: × 2.0. It puts a graded highlight on crowns and rims (the
  cloche knob, the cake top, the platter lip).
- **Linen panel** behind and above the camera: × 1.0. It is the soft front fill that fronts reflect.
- **Sheer glass door** behind the camera on the left: graded from 0.9 to 2.4. The reader's black glass
  (roughness 0.06, clearcoat 1) faces +z. A probe of the live scene put its mirror direction at az −16°,
  el +5°, varying by ±6° across the face. The door's right jamb runs just to the right of that point, so
  the glass carries a soft vertical sheen on its left side instead of a flat black.
- **Warm lamp** right and behind: a small `#FFCF9E` × 2.4 glint on the chrome.
- **Dark walnut strokes:**
  - a sideboard camera-right;
  - a tall cabinet behind on the left;
  - a low table-edge band round the room just under the horizon.

  They are linear ≈ 0.05, not black, so a reflection never crushes. They give silver, chrome and vinyl
  the dark contrast that makes them read as mirrors and not as grey paint.

## How it got here: six capture rounds on all five scenes

1. **First pass.** The room was peach (walls `#E9D3BC` × 0.42) under a key of × 2.6, on the v1.1 plaster
   with full mottle. The result was too orange (stage `#EDCDAB`):
   - the cloche read as bronze, because it reflected tan walls;
   - the plaster mottle read as stains under soft light;
   - the record player and the reader looked brown.
2. **Neutral room, peach object.** I moved the warmth into the plaster's albedo and kept the light close to
   daylight: brighter, less saturated walls, ceiling and floor, and a brighter window, skylight and linen.
   I also dropped the cloudy albedo mottle and kept a trace of relief. Result:
   - the cloche turned silver, with readable window panes and dark strokes;
   - the stage settled at `#F3DABF`.
3. **More shaping.** Walls 0.5, key 2.5 → 2.8 → 3.0. The shadows now read: the cake stand's shadow, the
   ball's contact, the reader's shadow on the cove.
4. **The reader's black glass.** It stayed flat black through two guesses at its mirror direction. I probed
   the live scene: the face normal is (0, 0.20, 0.98) and the camera sits at (3.4, 3.8, 9.1), which gives
   a reflection of az −16°, el +5°. I placed the glass door there, and the face now shows a sheen
   gradient as in the master render.
5. **Clipping and crushing.** In the dinner stills, 212 pixels had all channels ≥ 250 (window highlights on
   the dome) and 83 pixels were ≤ 12 (the near-black sideboard reflection). I lowered the window to
   3.2 / 2.3, raised the key to 3.0 to compensate, and made the walnut strokes non-black. Result:
   - dinner: 55–67 clipped pixels (small specular glints, as on real silver) and 0 crushed;
   - party: 13 crushed (the gaps between vinyl grooves);
   - every other still: 0–1.
6. **Final pass.** Measured the stage colour `#F6DDC3`, ran the mid-motion poses, and checked Low ↔ Normal.

## Compared with the masters and v1.1

- **Against the Models viewer master renders** (B-hero):
  - the cloche reads as polished silver, with the window panes and dark furniture in it;
  - the platter's gilt rim and the porcelain have a soft sheen;
  - the record's grooves read, and the brushed plinth has its grain highlight;
  - the hoop steel and the badge chrome read as metal.

  The look stays warm and bright rather than the masters' neutral grey stage. That is this direction's
  premise.
- **Against v1.1:**
  - the palm gobo and the dappled stage are gone;
  - the backdrop is a clean, slightly darker peach (`#F6DDC3` vs the shipped `#F8E4C8` token);
  - the objects carry real reflections instead of stepped-back, satin-looking metal.

## Known gaps

- **The record player's lid interior renders very dark brown.** That comes from the material
  (`tt_lid_inner` with baked occlusion and `LID_LOOK.inner.tint` in `models/recordPlayer.ts`), not from
  the light. The master shows it as a lighter smoked grey. A judge may want that tint revisited.
- **The Sports net's cast shadow is feathery.** Thin strands under a radius-9 filter give the floor behind
  the stand a streaky look. v1.1 shows the same at radius 6.
- **The backdrop is cleaner than v1.1's limewash.** If the owner wants more texture, raise the relief
  (normal scale 0.18 → 0.3). The cloudy albedo mottle is what read as stains.
- **The window is a fixed environment shape.** It does not move with the scene's content. The
  environment is captured at the origin, so on Business, the tallest scene, the reflections near the top
  of the strap come from slightly the wrong place.
