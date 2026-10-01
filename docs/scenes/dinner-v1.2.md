# Dinner v1.2: the cloche and the clean plate on the scan-to-CAD masters (v1.2.1 polish)

Owner's direction (Surya, 2026-10-01): same beats, higher fidelity, the new models, **no food**. The scene is the
porcelain plate with its gilt rim (`dinner-plate.glb`) and the silver cloche's dome assembly (`silver-cloche.glb`
minus its tray). Recipe: `scripts/masters/recipes/dinner.ts`; contract: `models/dinnerContract.ts`; rig:
`models/dinner.ts`; choreography: `src/scenes/dinner/sequences.ts`.

## v1.3: the studio pass (2026-10-01)

- **Grades removed.** `finishDish` (the dome's uniform roughness 0.2 and anisotropy 0.3 along the meridians) and the
  trim's roughness 0.12 are gone: the dome renders with the master's own polished roughness map and no anisotropy,
  and the bead, bands, finial and handle at their near-mirror 0.065–0.09 (Decisions, Silver). The dome's 1024²
  roughness map is now used rather than freed at load (about 5.3 MiB as RGBA8 + mips). The dome, the trim and the gilt
  get the rig's own environment 1.0 on every tier (the recipe's `ownEnv` 0.9, 0.8 and 1.1 are overridden by
  `metalEnvIntensity`).
- **New studio.** The production rig is `neutral-room` (`docs/style-reference.md` v1.3): the Models viewer's room,
  whose window, mullions, horizon, runner and sideboard are what the polished dome now reflects. The known gap "the
  studio environment has no dark horizon" is resolved. The cove measures `#D4D0CB` here (token `#D5D2CD`). Through
  the perspective lens the deep bin makes the dish 0.93× its v1.1 size, the smallest of the five, and shifts the
  frame's centre by 0.073 NDC.
- **Judges.** Of all four rigs, `neutral-room` gives the closest match to `silver-cloche/B-hero.png` and `B-close.png`:
  polished silver with the master's window and mullion arcs and its bright upper band, 0.006–0.11 % of pixels
  clipped. None wants the lathe polish back. All three would add one soft dark card low and camera-right in the
  environment for a deeper lower band on the dome (open).
- Posters regenerated under the new rig (8.2–11.5 KB).

## Decisions

- **No food, no preset control.** The pasta and vegetable builders and the code-authored v1.1 plate and cloche
  (`models/dinnerParts.ts`, 1.9k lines) are deleted. The builder (`buildDinnerGeometry(…, { parts: 'skeleton' })`)
  supplies only the contract's empty nodes. The host panel renders no preset fieldset for Dinner
  (`src/demo/main.ts`, the one shared-UI edit this phase allows); `dish` stays in `SceneConfig` and
  `DEFAULT_CONFIGS` and selects nothing (`DinnerScene.setConfig` is a no-op; the rig's `setPreset` is kept as a no-op).
- **One poster set.** `assets/scenes/dinner/posters/shared-{host-ready,guest-ready,accepted,declined}.webp`;
  `posterUrl` falls back to `shared-*` for both `dish` values. The per-dish files are removed.
- **One scale for both masters**, `DISH_SCALE = 0.8 / 0.9525 = 0.83990`: the plate keeps the v1.1 plate's 1.6
  diameter, so the framing matches the v1.1 stills, and the cloche keeps its real size against the plate (it was
  built on a tray the plate's own size).
- **Mapping.** `plate` → `plate_body` (`plate_porcelain`, clearcoat kept), `gilt-rim` → `plate_gilt`
  (`plate_gilt_metal`, ownEnv 1.1), both under `plate_secondary`, aligned so the plate's flat underside centre is
  the origin. Cloche: `tray` dropped; `dome` → `cover_mesh`, `handle` → `cover_handle`; the lip bead, both applied
  bands and the finial stay under `cover_secondary` and are joined per material (4 meshes → 2). Aligned so the
  bottom centre of the lip bead (the dome's rim centre) is `cover_secondary`'s origin: `cover_authored` seats on
  and rocks about its rim.
- **Seat.** The bead's outer flank rests on the coupe rim's slope just inside the gilt band (contact at
  r ≈ 0.646, measured against the plate's upward-facing vertices in 1 mm radial bins, clearance 0.1 mm). The dome
  covers the whole well and the gilt band stays visible all round it.
- **Silver (studio pass v1.3: the master's, as authored).** `finishDish` and the trim roughness 0.12 were removed:
  the dome renders with the master's polished roughness map and no anisotropy, the bead, bands, finial and handle at
  their near-mirror 0.065–0.09. The lathe polish below compensated for a near-white mirror reflecting the v1.1 cream
  studio; the metal is judged again under the new rigs (own environment 0.9 / 0.8 kept until the rigs settle
  `ownEnv`). v1.2 record: the first pass (dome uniform roughness 0.20 at own environment 1.35;
  bead, bands, finial and handle at the master's 0.065–0.09 and 1.1) read pale and frosted, clearly less metallic
  than the v1.1 cloche: the master's near-white silver (F0 0.97) mirroring the cream studio has almost no dark
  values, the dome's lower half took the floor's colour, and the trim read as pale whitish lines. Tellingly, the
  Low tier (own environment 0.8) looked more like silver than Normal. Rendered side by side (own env 0.85–1.1,
  roughness 0.14–0.20, darker F0, anisotropy 0–0.7 along and across the meridians): every isotropic finish stayed
  a grey ball with two softbox blobs; a **lathe-polish anisotropy along the meridians** is what reads as silver
  here (the softbox stretches into vertical highlight bands with dark reflections between them, the look the v1.1
  brushed cloche had). Shipped: dome `MeshPhysicalMaterial`, roughness 0.2, anisotropy 0.3 at rotation π/2
  (v1.2.1 polish: the first ship, 0.5 at 0.18, read as distinct light and dark gores, a ribbed melon-like dome,
  in the 540 px frames; 0.3 at 0.2 keeps the stretched highlights and reads as smooth polished silver, while
  0.15 broke back into softbox blobs; compared side by side in the host, guest-ready and accepted poses),
  own environment 0.9 (`finishDish` in models/dinner.ts sets the finish at load, before `prepareImported`;
  the own env comes from the recipe); bead, bands, finial and handle roughness 0.12 at own environment 0.8
  (recipe policies), so the ring handle and the lip shade light to dark like metal. Checked at Normal, Low and
  High, in the posters and through the host, accept, decline and change frames. The master's colour is kept.
- **Shadows.** One decimated proxy per moving assembly: `cover_shadow_proxy` under `cover_secondary` (tilts and
  travels with the cover), `plate_shadow_proxy` under `plate_secondary`. The masters skip the shadow pass. The
  contact shadows (dish, cover beside the plate, bin) are unchanged from v1.1.
- **Food constants collapse to the plate.** `FOOD` and `COVER_CLEARANCE` are gone. `SAFE_SKIRT` (the rim height
  whenever the cover moves over the plate) is now `PLATE.rimHeight + 0.31` = 0.433: the plate's gilt rim plus a
  margin that keeps the v1.1 lift above the seat, so the host and reveal beats keep their heights and pace. The
  clearance tests run against the real plate geometry read from the exported GLB.

## Measured contract (master × DISH_SCALE, checked against the exported GLB in `tests/dinner.test.ts`)

| Constant | Value | Meaning |
| --- | --- | --- |
| `PLATE.radius` | 0.8 | gilt edge |
| `PLATE.rimHeight` | 0.1232 | top of the gilt band |
| `PLATE.well` / `wellRadius` | 0.0281 / 0.455 | flat well top and its extent |
| `PLATE.giltRadius` | 0.7727 | inner edge of the gilt band |
| `PLATE_PROFILE` | 38 pairs | conservative upper bound of the top surface (every vertex below it) |
| `COVER.radius` / `lipRadius` | 0.6534 / 0.642 | bead outer radius / its lowest ring (the rocking rim) |
| `COVER.domeHeight` / `height` | 0.6333 / 0.8491 | crown (finial base) / handle top |
| `COVER.grip` | 0.81 | handle loop's top bar (carry pivot) |
| `COVER_SEATED` | (0, 0.0946, 0) | seated cover origin |
| `DISH_HEIGHT` | 0.9437 | underside to handle top (still drops below the bin rim before the flaps close) |

## Choreography: what changed and why

Durations are unchanged (host 1.2 s, accept 1.5 s, decline 1.5 s). Every tilt is a lean θ about up × the direction
of travel, applied about a pivot in cover space (`poseAbout`): the rim point that touches the plate or table while
it is in contact, the handle's grip while it is carried, blended smoothly between them. That one rule gives:

- **Handle-led reveal (accept).** The guest-side rim rises first (θ peaks 4.5° at 0.18 s) while the far rim stays on
  the plate; lift-off from 0.10 s; the cover levels by 0.50 s at the top (`REVEAL_TOP` = 0.593) while it already
  travels across; it comes down far rim first (≈3.5° landing lean) at 0.80 s, its trailing side lowers onto the
  table by 0.86 s and it rocks once on its rim (≤ 1°, ~0.95° peak) until 1.31 s, then holds the accepted pose.
- **Host.** Unchanged path (preparatory rise, align and lower, the level path passing `SAFE_SKIRT` as it centres at
  0.60 s without stopping, the tipped rim then about 0.24 above the gilt; tested exactly); the
  poised lean now eases out about the landing rim, so the cover touches its leading rim at 0.84 s, the back comes
  down by 0.90 s and the rim rock follows into guest-ready.
- **C1 at every contact.** The set-down's θ arrives at exactly the rock's starting angular rate, so tilt, plan
  position and height are C1 at every beat boundary (1 ms velocity test); only the height kinks, at the two
  instants the rock passes level (it changes the rim it rocks on, a rigid contact), and the test exempts ±2 ms
  around exactly those instants.
- **Decline** keeps its v1.1 path: the covered dish as one unit, up–across–down into the bin, flaps closing once the
  handle is below the rim.
- **Change of mind (v1.2.1, replaces the v1.1 cut).** The outcome that is showing plays backwards along its own
  authored path to the covered dish, then the new outcome plays (`planAnswerChange`, `sampleAnswerChange` in
  sequences.ts; `DinnerScene.interruptCut` asks the director for its cut and starts the new playback on the exact
  interrupted frame, so the cut is never seen). The authored paths are clear of the plate and the bin, so their
  reverse is too: a lifted cover comes back down onto the plate like a reversed lift, a dish in the bin comes
  back up out of it. The rewind leaves at the outcome's own speed (Hermite, no velocity jump), is paced by
  arc length (dish and bin each in units of its own fastest frame, so a still hold such as the rock takes no
  time) and lasts the shortest 0.15–0.6 s (0.45 s before an accept) in which no frame moves the dish or the bin
  more than 1.6× its own fastest authored frame. Before a decline the bin starts coming in during the end of
  the rewind (up to the decline's 0.25 s lead) wherever it keeps 1.64 plan clearance (bin rim + bead + 0.05)
  from the returning cover; the new outcome is sped up only if it would not fit (k ≤ 1.25; 1.0 for every
  accept → decline). The capture's change clip (decline at 0.496 s): the cover rewinds in 0.24 s, frame
  diffs f30–f34 2.2, 1.8, 1.2 (v1.1: 8.2 at f30→f31); the larger diffs after that are the bin's entrance,
  the same as in the decline clip. It works the same from the accepted pose (the whole reveal rewinds in
  0.36 s) and for decline → accept. Tested in tests/dinner.test.ts (every interruption time both ways, through
  the real `VisualDirector`).

Verified by looking: `outputs/dinner/` stills and every frame strip of host, accept, decline and change (v1.2.1:
the change clip lowers the cover back onto the plate as the bin comes in, then bins the covered dish).

## Export report (`pnpm models dinner`, deterministic: two exports, identical SHA-1 de23de79…)

```
triangles 146,944 · draw calls 6 (+ 2 shadow proxy, 5,277 tris, shadow pass only) · 19 nodes
textures 1 · 5.3 MiB as RGBA8 + mips
  1024×1024 webp 6 KiB  metallicRoughnessTexture of cloche_dome
GLB 3412.5 KiB raw · 1963.0 KiB gzip
contract nodes found (10), missing: none
```

Frame cadence (`pnpm capture perf dinner`, M2 Pro, 390×844 @3x, Normal tier, with the anisotropic dome): p50
16.7 ms, p99 16.8 ms, max 16.8 ms, 0 frames over 50 ms over 908 frames (the 4× CPU simulation is the same).
Recorded in `docs/qualification.md` (v1.2 re-measure), `docs/asset-manifest.md`, `docs/style-reference.md`
(Dinner v1.2) and `docs/spec-revisions.md` (#15, #17).

## Known gaps

- **Finish at load.** The recipe API has no anisotropy policy and its roughness policy can only scale a map
  down, so the dome's finish (physical material, roughness 0.18, anisotropy 0.5) is applied at load by
  `finishDish` (models/dinner.ts, tested in tests/dinner.test.ts). The master's 1024² roughness map still
  travels in the GLB (6 KiB) only to be freed at load; a recipe option to drop a texture slot (and an anisotropy
  policy) would move all of this into the export.
- **Capture plan (fixed in the fix pass).** `scripts/capture.ts` now has one Dinner preset whose posters are all
  `shared-<pose>` (`sharedAll`) and no second-preset clips, so a plain `pnpm capture dinner` writes exactly the
  four shared posters and the thumbnail into `assets/`. Review stills are `capture-shared-*.png`.
  v1.2.1: the v1.1 per-dish posters did come back once (a stale `outputs/dinner/posters` from a v1.1 run was
  copied wholesale into `assets/`, where `posterUrl` prefers `dinner/pasta/<pose>` over `shared-<pose>`).
  `captureScene` now clears the scene's staged posters, review stills, frame strips and clips before a run and
  removes any poster in `assets/scenes/<scene>/posters` that the run did not write; `tests/dinner.test.ts`
  fails if the folder holds anything but the four shared posters.
- **Studio environment.** The stage environment has no dark horizon, so the polished dome reads as bright silver
  with soft highlight bands rather than the master viewer's room reflections; raising its environment further
  flattens it. A per-scene environment is a stage (shared) change.
- **Rock on a slope.** The seated cover's rock is computed as a rock on a flat surface about the bead's lowest ring;
  on the plate's coupe slope the far side dips by at most 1 mm into the 1 mm surface bins (tested), invisible at
  the stage's scale.
- **Rock direction.** The rock continues the set-down's rotation through level (the trailing rim takes the
  weight and the leading side lifts, θ < 0 first). A physical rebound would stop the cover or bounce the
  trailing side back up, which needs the angular velocity to reverse at the contact, a kink in the tilt. Kept
  deliberately: the tilt stays C1 at every beat (the motion brief asks for buttery smooth) and at ≤ 1° the
  direction is not visible. The height kinks only at the two instants the rock passes level (the flat beat and
  half-way through the rock: it switches the rim it rocks on); the C1 test exempts ±2 ms around exactly those
  instants and checks height everywhere else.
- **Answer change (fixed in v1.2.1, see Choreography).** Two limits: the scene keeps a little state between the
  director's cut and the new playback (the rewind plan; any other pose or sequence clears it), so the change is
  not a pure function of time like the outcomes; and a third answer inside the first ~0.6 s of a rewind-led
  decline can move the arriving bin by a few frames' worth (its clock runs ahead of the dish there).
- **Dish in the bin.** Inside the bin the dome drops out of sight before the ring handle does, so the handle
  shows briefly as a small "C" then a dash (decline f45–f51). It is the shared bin's dark interior; harmless,
  left as is.
- **Plate well.** At stage size the empty well is a near-flat white disc; the gilt rim carries the reveal, as
  the owner's no-food decision implies. Not changed (the porcelain is the master's material).
- **Other docs.** `docs/style-reference.md` (Cloche) still quotes the first ship's dome finish (anisotropy 0.5,
  roughness 0.18); it is outside this scene's files. The shipped values are 0.3 and 0.2 (`models/dinner.ts`).
- **Shared tooling text.** `study.ts`, `studyRubric.ts` and the library's food materials in
  `src/render/materials.ts` still mention food (study and lookdev pages, v1.0/v1.1 history); the lookdev label
  now says "cloche beside the clean plate".
- **User-facing copy (fixed in the fix pass).** The poster text fallback (`POSE_TEXT.dinner`, src/demo/fixtures.ts)
  describes the empty plate and the cover poised above it, lifted and set beside it; the gallery (Collection
  review) labels the Dinner column "Cloche and plate" in both preset sets (`PRESETS.dinner` has one entry;
  `presetAt` falls back to a scene's only look). The collection thumbnail `assets/ui/collection/dinner.webp`
  is the new guest-ready render.
