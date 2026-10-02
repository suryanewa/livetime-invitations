# Style reference — v1.3 · the studio pass

## v1.4 scale (2026-10-02): one world scale, one framing rule

Owner: *"the sense of scale with the models is pretty poor. Make it feel more consistent."* (`docs/scale-fullscreen-brief.md`, Scale part; the fullscreen part is separate.) Where v1.3's camera section below disagrees, this section wins.

- **One world scale: 1 unit = 20 cm** (`models/worldScale.ts`). Each scene declares its world scale from one real reference, and its root carries it at runtime; contracts, choreography, tests and GLBs stay in each scene's own units, so every beat, duration and test intent holds and no GLB changed.

| Scene | Reference | World scale | Real sizes that follow |
| --- | --- | --- | --- |
| Party | 12-inch LP, 30.48 cm | 1 (already) | plinth 42.1 × 32.4 cm |
| Birthday | cake on its stand, 35 cm | 1 (already) | stand 33.5 cm, cake 27.7 cm across, bin 37.6 cm |
| Sports | mini ball, 18 cm | 1.8 | rim 28.8 cm inner (1.6 ×), board 58.6 × 46 cm, rim 62 cm up |
| Dinner | dinner plate, 27 cm | 0.844 | cloche 22 cm, covered dish 15.9 cm tall, bin 31.7 cm |
| Business | CR80 card, 5.4 cm | 0.381 | holder 5.7 × 8.9 cm, strap 1.7 cm, reader 7.0 × 10.4 cm |

- **Within each scene the proportions are the masters' real ones.** The ball-to-hoop and badge-to-reader ratios were already right for a mini hoop and a standing reader whose glass takes the card, and stay (the reader is not enlarged to the brief's 9–10 cm: at that width the 1.49:1 wedge would stand 1.5–1.7× the holder). The shared bin is one design sized against what it receives: the cake in Birthday, the dish in Dinner.
- **The set scales with the subject** (`src/render/rig.ts` setWall/setContent): the cove, the key's throw and the shadow camera's range and normal bias follow the scene's world scale, as a photographer sizes the set and the light to the product, so all five keep v1.3's look and shadow density.
- **The framing rule** (`src/render/framing.ts`, `fitPerspectiveToHero` in `src/render/camera.ts`): one lens (18°), one azimuth (20°) and elevation (15°); the distance is set by the **hero**, the objects on stage at guest-ready seen as their real silhouette, so that its height fills **60 %** of the frame (its width **75 %** when it is wide and low). Across, the hero is centred unless a path needs the room; up and down, the frame centres the whole action; every authored path stays 4 % inside the edges. Only Dinner cannot fit its open bin at that size and backs off (the recorded disposal exception).
- **Measured hero fill at the square stage** (height / width; v1.3 → v1.4): Party 0.708 / 0.762 → **0.600 / 0.650**; Birthday 0.640 / 0.467 → **0.600 / 0.439**; Sports 0.841 / 0.745 → **0.600 / 0.528**; Dinner 0.306 / 0.434 → **0.355 / 0.496** (path-limited); Business 0.817 / 0.646 → **0.600 / 0.480**. Tests: `tests/world-scale.test.ts`, `tests/framing.test.ts`, `tests/browser/framing.spec.ts`. Per-scene detail: the "v1.4 scale" section of each `docs/scenes/<scene>-v1.2.md`.
- **Stage colour:** the empty stage's centre now measures `#D5D1CC` (business `#D7D4CF`, party `#D1CEC9`, birthday `#D6D3CE`, sports `#D5D2CD`, dinner `#D4D0CB`), within one level of the `#D5D2CD` token, which is unchanged. Posters and thumbnails were regenerated with the new framing.
- **Known gaps:** the dish is still the smallest hero (its 47-cm-high open bin behind a 16 cm dish sets the frame). Every rig scales its set with the scene; `daylight-table` keeps a world-size desk and wall (only its wall depth and key throw follow), so on a local host `?rig=daylight-table` shows Sports and Business on a differently sized desk than v1.3. The comparison rigs were not re-judged.

## v1.3 (2026-10-01): the studio pass

Surya, auditing v1.2: *"Why do these look so cartoonish compared to the original renders?"* The models were not the problem: the same GLBs render photographically in the Models viewer (`scan-to-cad-rebuilds`, the light the masters were judged in). The showcase still lit, framed and finished them like the stylised v1.1 objects. The brief (`docs/studio-pass-brief.md`) names five causes, and v1.3 removes all five. The masters, recipes, beats, durations and interface are unchanged. Where a v1.2, v1.1 or v1.0 statement further down disagrees with this section, this section wins; those statements are marked *superseded in v1.3* or *(removed in v1.3)* and kept for the record. Revisions #31–#36 (`docs/spec-revisions.md`) record the deviations; the measurements are in `docs/qualification.md` (v1.3).

### The causes

1. **An orthographic camera.** Every product frame was orthographic (az 20°, el 15°). Floor and cove had no depth, so the objects read as cut-outs on a card.
2. **A studio built for cream satin toys.** One warm spot key `#FFF1DE` × 15 through a palm-frond gobo, hemisphere and sky fills, a peach limewash plaster cove, and a blurred softbox environment at 0.52. Polished metal had nothing with a shape to reflect: imported metals needed their own environment at 1.1 just to read as metal.
3. **A peach backdrop and stage token** (`#F8E4C8`) that the v1.2 objects were tuned to sit on.
4. **Grades** that the v1.2 scene agents added to make the masters fit that stage (Grades removed, below). They compensated for the light, not for the masters.
5. **A CSS finish** over poster and canvas: a warm radial vignette (multiply, 12 %) and fractal film grain (overlay, 16 %).

### Rigs: the light is a module

- A **rig** is one file in `src/render/rigs/` (contract `src/render/rig.ts`; guide and worked example `src/render/rigs/README.md`). It declares everything about the light and nothing about the objects:
  - the prefiltered environment (PMREM), `environmentIntensity`, and `metalEnvIntensity`: the strength of the environment on every material that carries its own map (`ownEnv`: the polished and imported metals), applied by the Stage on every tier;
  - the lights, the backdrop (or none), exposure and tone mapping, and an optional gobo;
  - the real-time shadow: filter (`vogel16`, `pcf` or `vsm`), map size, radius, biases and camera range;
  - the **stage colour**, measured from its own rendered backdrop.
- **Registered by file.** `src/render/rigRegistry.ts` finds every rig through `import.meta.glob('./rigs/*.ts', { eager: true })`, so adding one edits no shared index. `DEFAULT_RIG` names the production rig. The Stage takes a rig by name or object, and the controller uses `DEFAULT_RIG` unless the embedder names another.
- **The v1.1 premium studio is rig `v1.1`**, kept as the baseline: 18 orthographic stills are byte-identical before and after the refactor. `src/render/studio.ts` is now the shared kit (cookie, sweep backdrop, the 16-tap PCF patch).
- **Comparison tooling.** `pnpm capture rigs <baseUrl> [rig,…]` renders every rig (or the listed ones) on all five scenes' guest-ready and accepted stills, both presets where they differ, at 720² through the real stage. It writes `outputs/rigs/<rig>/`, one contact sheet per rig and a cross-rig sheet per scene, and never touches `assets/`. `pnpm capture stagecolor <baseUrl> <rig>` renders the stage with no object and prints the mean sRGB of its central 20 %.

### The production studio: `neutral-room`

The Models viewer's interior (`scan-to-cad-rebuilds/candidates/final/env.js`, under which the master renders `master-renders/<master>/B-hero.png` were made) ported as a rig, on a neutral greige painted cove. Source `src/render/rigs/neutral-room.ts`; reasoning and the six capture rounds in `docs/rigs/neutral-room.md`.

| Setting | Value |
| --- | --- |
| Camera | Perspective, 18° vertical, at the shared az 20° / el 15° (The camera, below) |
| Tone mapping / exposure | `NeutralToneMapping` (Khronos PBR Neutral, what the viewer installs) · exposure 1.15, the viewer's |
| Environment | The viewer's procedural room, evaluated texel by texel into a 1024 × 512 linear float equirect and prefiltered once (PMREM, no blur), with no downloads and no randomness. `environmentIntensity` 1, `metalEnvIntensity` 1 |
| The room | A large sheer window with soft mullions between linen drapes (radiance 3.4, cool); an overcast ceiling with a skylight strip and a large soft bounce behind the camera; a narrow sheer side window; a tungsten lamp behind-right (1.8, warm) with its halo on greige walls; a framed print and a dark doorway behind the subject; a walnut sideboard and a dark table runner on the camera side, the dark strokes polished metal needs; a mid-grey table meeting the wall at a soft horizon. Every parameter is the viewer's (`NEUTRAL_ROOM`). The room is mirrored and turned (world θ = 120° − room θ) so it sits round the product camera as it sat round the viewer's: the window camera-left-front, as in the master renders |
| Key | One soft `SpotLight` `#F3F5FA` × 1.5, decay 0, from the window's direction raised to 40°, 12 units from the content's centre (it follows `setContent`), angle 0.62, penumbra 0.8. It is the window's direct share and casts the real-time shadow. There are no fill or bounce lights: everything else is image-based light at full strength |
| Shadow | `vogel16` (v1.1's 16 fixed taps), 1024², radius 5, bias −0.0004, normal bias 0.012, near 4, far 24. Contact shadows are unchanged |
| Backdrop | `createSweepBackdrop`: a painted cove `#BEB9B1`, roughness 0.9, no plaster relief (the mottle read as dirt under a raking key). Each scene's `wallZ` is honoured |
| Stage colour | **`#D5D2CD`**, measured (Stage tokens, below) |
| Gobo | None |
| Low tier | The Stage frees the shadow map; contact shadows remain. `setLowDetail` is a no-op (no cookie, no relief to drop). The metals keep `metalEnvIntensity` 1 on every tier: the Stage applies it again after the libraries' Low-tier 0.8 |

**Why it won.** Three independent judges scored the four new rigs on all five scenes against the master renders: realism (35), materials reading as their materials (25), the beats still reading (15), fit with the interface (15) and artifacts (10). All three ranked `neutral-room` first, at 82, 81 and 82 (mean 81.7; realism 29 and materials 21 from each). Their reasons:

- It is the only rig whose environment puts the viewer's own window, mullion and horizon shapes into the metals. The cloche matches `silver-cloche/B-hero.png` and `B-close.png` as polished silver, not grey plastic, with no hot spot (0.006 % of pixels clipped on average).
- The plinth reads as grey brushed steel, the tonearm and spindle as chrome, the reader's screen as glass and the vinyl as black vinyl, with no grade.
- It has the masters' neutral tonality. The ivory cake, the cream ball and the white plate keep their own colours and separate from the cove.

Its weakest score was interface fit (10–11 of 15): beside the warm-white page the greige square reads a little cold (Known gaps, below).

**The other rigs stay** for the owner to compare, on a local host only: `?rig=<name>` (`localhost`, `127.0.0.1`, `[::1]`), plus `&camera=ortho` for the v1.1 lens. Under a rig other than the production one, the stage surround takes that rig's measured colour and no poster shows, because the posters belong to the production rig. Each rig's reasoning is in `docs/rigs/<name>.md`.

| Rig | Direction | Stage (measured) | Judges' mean | Judges' reasons it ranked lower |
| --- | --- | --- | --- | --- |
| `neutral-room` | The Models viewer's interior on a greige cove (brief direction b) | `#D5D2CD` | **81.7** | Ships |
| `product-studio` | Three softboxes on a light-grey cyc, black gradient flags | `#ECE9E4` | 76.7 | A crisp catalogue look, more contrasty than the masters. Its flags crush and clip on the cloche, its net shadow is stippled, and its light cove sits too close to the ivory cake, cream ball and light badge |
| `daylight-table` | A pale oak desk by a sheer window, light grey wall | `#E0D4C3` | 69.3 | The desk-to-wall horizon line, a wide per-scene stage spread (`#D8D0C4`–`#E4D1B8`) and crushed reader glass |
| `livetime-warm` | The Livetime peach plaster cove lit by a daylight window (brief direction a) | `#F6DDC3` | 69.0 | The vanilla cake nearly vanishes into the peach (it would need its grade back), and the warm stage departs from the masters' neutral one |
| `v1.1` | The v1.1 premium studio, unchanged | `#F8E4C8` declared; measures `#F6E0C5` through the perspective lens | Baseline, not scored | The look the owner called cartoonish |

### The camera

*(Framing superseded in v1.4: the distance is now set by the hero, above. The lens and angles are unchanged.)*

Perspective is the product lens: `PERSPECTIVE_FOV` 18° and `fitPerspectiveToBounds` in `src/render/camera.ts`, created by the Stage unless a caller asks for `projection: 'orthographic'`.

- **The same angle.** The shared azimuth 20° and elevation 15° are kept, so every piece of choreography that reads the view direction is unchanged: the Sports airball offset and `SEAM_FRAME`, and Dinner's transfer pacing.
- **The same fit.** The camera distance is solved so the projected silhouette samples of every authored path (`framePoints`, or the bounds' corners when a scene has none) fit with the same 8 % clearance. The view is then shifted so they sit centred.
- **The same composition.** Measured against v1.1's orthographic fit, the subject's size is 0.93 (Dinner, with its deep bin) to 1.02 (Sports) of what it was, and its centre moves at most 0.073 in normalised device units (Birthday, Dinner), under 4 % of the stage width. Every scene is seen from at least 4× its bounds radius, so the foreshortening stays photographic, not wide. All of this is unit-tested at three aspects (`tests/stage-framing.test.ts`).
- The orthographic camera stays for the study and lookdev pages and for `?camera=ortho`.

### Grades removed

Each grade below compensated for the v1.1 peach studio, not for the masters. All were removed in `a62fab0` and the GLBs re-exported, so the masters' materials stand as authored. All three judges found that **none should return** under `neutral-room`. The per-material own-environment values of v1.2 (1.1 on imported metals, 0.9 on the dome, 0.8 on the cloche trim) are replaced on every tier by the rig's `metalEnvIntensity` 1.

| Scene | Grade (v1.2) | What it did | Now | Judges, under `neutral-room` |
| --- | --- | --- | --- | --- |
| Sports | `LEATHER_GRADE` (`models/sports.ts`) | A linear multiply (0.78, 1.25, 3) on the orange ball's colour, pulling the scan-matched orange towards the v1.1 ball's hue against the peach stage | The master's albedo. The cream preset's ivory albedo stays: it is a preset, not a grade | A saturated orange-red with soft form and a rounded terminator, matching `basketball/B-hero.png`. One judge saw it slightly more saturated than the master: "if anything, a tiny saturation trim, not a darkening" |
| Party | `PLINTH_TONE` (recipe) | The brushed steel kept 92 % of its luminance and 40 % of its chroma, so it read graphite rather than bronze under the warm key | The master's base factor | Neutral taupe-grey brushed steel, like the master. The bronze cast came from the light |
| Party | `LID_LOOK` outer coat (`models/recordPlayer.ts`) | A satin coat (clearcoat 0.25 / 0.5, roughness 0.55) replacing the master's, against a mid-close flash of the cream softbox | The master's coat (clearcoat 0.6 at 0.08, roughness 0.3). The darker inner shell with baked occlusion (`splitLidInterior`) stays, as the brief allows | The exterior reads correctly. The interior split is justified: the lid's inside renders near-black, as in the master |
| Party | `SPINDLE_LOOK` | The spindle in turned grey steel (0.42, roughness 0.24) instead of mirror chrome, which had reflected only the even cream softbox | The master's chrome | A small bright chrome pin |
| Party | The label wedge and sliver (`labelPrint`) | v1.1's quarter wedge and butter sliver painted into the coral and cobalt prints so the accept spin read | The master's own label print, recoloured (field and ink only). Its off-centre square is the asymmetric mark; a unit test holds that asymmetry on the exported prints (the square's quarter against the opposite quarter) | The recoloured print reads, and its small off-centre marks show. Whether the spin reads in motion cannot be judged from stills (Known gaps) |
| Dinner | `finishDish` (`DOME_ROUGHNESS` 0.2, `DOME_ANISOTROPY` 0.3) and the trim at roughness 0.12 | A uniform "lathe polish" replacing the master's polished map, so the near-white mirror stopped reading pale and frosted in the cream studio | The master's polished silver: the dome's own roughness map, no anisotropy, and the bead, bands, finial and handle at their near-mirror 0.065–0.09 | Of all four rigs, the closest match to `silver-cloche/B-close.png`: window and mullion reflections, with 0.006–0.11 % of pixels clipped in the judges' measurements |
| Birthday | Vanilla darkening (recipe variants) | Body `#E0D3BF` at roughness 0.58 (the master's 0.42), so the ivory left the tone mapper's shoulder on the peach stage | The ivory rebuild's palette (body `#F3E9D8`, piping `#FFFDF8`, rosettes `#F3E3C7`) at the master's roughness | The ivory body (`#DEDAD4` on the cove's `#B7B4B0`) separates, with the piping in relief (luminance p1 124, p99 240, flames excepted) |
| Business | Chrome polish (recipe) | `chrome_hardware` at roughness 0.1 and base 0.6, because the master's read as white satin plastic in the beige studio | The master's chrome (roughness 0.3, base 0.86) | Badge print, lanyard weave and reader glass all read; no grade needed |

Not graded and so not removed, but tuned under the v1.1 key and not re-derived for `neutral-room`: Party's 0.65 rad presentation tilt (kept below the old key's specular lobe), Birthday's in-bin shade, and the Business holder's 14 % dimming. The judges raised none of them.

### Stage tokens

- **`--lt-stage` is `#D5D2CD`** (`src/ui/shell.css`): the production rig's measured backdrop, the mean sRGB of the central 20 % of the empty stage (`pnpm capture stagecolor`, at `40f9e04`). It is the mean of the five scenes, which measure business `#D8D5D0`, party `#D1CEC8`, birthday `#D5D2CD`, sports `#D7D4CF` and dinner `#D4D0CB`.
- **Poster, fallback, canvas and CSS agree.** The rig declares the same value (`stageColor`), and the Stage paints it as `scene.background`. The poster cross-fade, the text fallback and the collection thumbnails sit on it, and the posters and thumbnails were regenerated under `neutral-room`. Unit tests hold the CSS token to the production rig's colour, and each rig's declaration within 2 levels of its measurement whenever `outputs/rigs/<rig>/stagecolor.json` is in the checkout. `PREMIUM_STAGE_COLOR` is gone: the stage colour belongs to the rig. The agreement is exact only at the centre: the cove falls off towards the frame, so the posters' 36-pixel corner patches measure `#AFACA9`–`#C6C2BC` (top left darkest, Sports lowest; bottom left lightest; for example the Dinner poster's top left is 182/179/174, measured on the committed posters). Wherever the flat token shows on its own (the fallback sentence, the stage before the poster loads, the thumbnail fill), the square is lighter at its edges than the rendered image.
- **Against the interface.** It is a light warm-neutral grey, a clear step under the page's `#FBFAF7` (1.44:1), so the canvas reads as a lit room set into the page rather than a continuation of it. Ink text `#202320` on it is 10.5:1, and secondary text `#585C57` is 4.52:1, just over 4.5:1.
- **No CSS finish.** `.lt-stage::before` (vignette) and `::after` (grain) are deleted, and a unit test keeps them out. What the renderer draws is what shows.

### Known gaps (v1.3)

From `docs/rigs/neutral-room.md` and the judges' notes on the winner. Each judge also proposed grafts from the runners-up. None has been applied yet; they are listed here as the open items.

- **Interface fit.** All three judges found the greige square slightly cold beside the warm-white page and olive ink. They proposed lifting and warming the cove (towards `#D9D5CE`, `#E2DED7` or `#E6E3DE`) or adding a faint warm floor bounce. Any change must keep the vanilla cake and cream ball at least 10 % in luminance from the cove, and then be re-measured, with the tokens, posters and thumbnails following.
- **Metal contrast.** All three proposed one soft dark gradient card in the environment, low and camera-right, for a deeper band on the cloche, tonearm and reader bezel. The reader's lower front and bezel read near-white (the master's own material under the window, per the rig's designer; the judges would trim the lamp or skylight there, not grade the material).
- **The Party lid's inside** renders near-black (p1 21), and the plinth reads flatter and more matte than the master render. The judges would lift it with fill or a lighter baked occlusion, not a colour grade.
- **Shadow artefacts.** A speckled PCF fringe in the net's shadow and at the hoop's base, and a large curved dark shadow across the top right of the cove in Business and Sports, cast (per the adversarial review) by geometry outside the frame: the lanyard above it, the backboard. It is the most noticeable artefact left.
- **Stage spread.** The five scenes' backdrops span `#D1CEC8`–`#D8D5D0` (up to 8 levels per channel: blue, party against business) against one token, because the cove's gradient depends on each scene's framing.
- **The Party spin** on the master's own label is checked by the asymmetry test, not yet by a judge in motion.
- **Load cost.** The room is evaluated on the CPU when the stage is created (524,288 texels) and uploaded once as an 8 MiB float texture before prefiltering. That cost has not been measured, and not on a phone.

# Style reference — v1.2 · the scan-to-CAD rebuilds

## v1.2 (2026-10-01): scan-to-CAD masters

> **Superseded in part by v1.3 (above).** The studio, camera and finish statements in this section, and the grades marked *(removed in v1.3)*, record v1.2 only. The objects, recipes, physics upgrades, beats and durations still hold.

Surya asked that every interaction use the new models: *"buttery smooth and the same conceptually, but higher fidelity with the physics and our new models."* The invitation objects are now the scan-to-CAD rebuilds: eight realistic PBR objects with textured materials, rebuilt by design.inc from Meshy scans (`models/masters/*.glb`; generators in `github.com/suryanewa/scan-to-cad-rebuilds`).

- **The object look is owned by the masters and the recipes,** not by the v1.1 "Satin Enamel" object rules. `models/masters/*.glb` gives the geometry and materials. Each scene's recipe (`scripts/masters/recipes/<scene>.ts`, with a Decisions block at the top) gives the scale, pivots, joins, material policies and preset variants, plus a few load-time finishes in the scene's rig (named below). Where a v1.1 or v1.0 object statement further down disagrees with this section, this section wins; those statements are marked *superseded* and kept for the record.
- **Unchanged from v1.1:** the interface, the studio (key, gobo, fill, environment, plaster sweep, finish), the camera and the shared disposal bin. *(Superseded in v1.3: the studio is rig `neutral-room`, the camera is perspective and the CSS finish is gone; the interface and the bin are unchanged.)* The beats and durations are also unchanged, unless a scene below records otherwise. Every choreography channel is still a pure function of time (the one exception is a change of mind mid-sequence: Dinner rewinds along its own path and Business draws a recovery path from the pose on screen, revisions #24 and #25) and is C1 at its beat boundaries (unit-tested per scene).
- **Budgets are waived for this pass** (owner's brief): the export reports state what ships (`docs/qualification.md`, v1.2).
- **Import path:** `scripts/masters/` (per-scene recipes; `scripts/masters/README.md`) merges the masters with the code-authored parts we keep into one runtime GLB. Imported materials keep their own textures and extensions; a material renamed to a library name is driven by the locked library instead.
- **Metals** without a library material get their own copy of the studio environment at 1.1 (`ownEnv`), so polished steel reads as metal, not gunmetal, under the 0.52 scene environment. *(Superseded in v1.3: the production rig's `metalEnvIntensity` sets every own environment to 1.0, the same strength as the scene's, on every tier.)*
- **Low tier** also simplifies imported materials (no normal, clearcoat-normal or sheen maps; own environment 0.8), reversibly (`models/imported.ts`). *(v1.3: the maps are still dropped; the rig's own-environment 1.0 is applied again after the 0.8.)*
- **Textures** ship as WebP (`EXT_texture_webp`): colour and ORM maps lossy q90, capped at 2048; normal, anisotropy and lookup-table textures exact (lossless).
- **Presets** are `KHR_materials_variants` in the GLB (a second print or a recoloured material), except Dinner, which has none.
- **Per-scene detail:** `docs/scenes/<scene>-v1.2.md`, with decisions, measured contract numbers, export report, choreography changes and known gaps.

### Party (v1.2): the vintage turntable

- **Object:** the turntable master at `TT_SCALE` 1.132 (the plinth is 2.1 wide, as in v1.1, with the deck at 0.341). It has a brushed-steel plinth on rubber feet, a platter with a rubber mat and spindle, a record with its label, and a gimballed tonearm with a counterweight, headshell and cartridge. Its cue lever, arm lift and hinged smoked dust cover are also the master's. A turned chrome **tonearm rest** with a black-anodised cradle is added by the scaffold: the master's arm is posed playing and has no rest. Its materials are exact copies of the master's chrome and anodising, so the export folds them into one material each.
- **Materials of note:**
  - Every master material is kept and renamed `tt_*`.
  - The brushed steel keeps 92 % of its luminance and 40 % of its chroma (`PLINTH_TONE`), so it reads graphite-taupe rather than bronze under the warm key. *(removed in v1.3)*
  - The spindle is turned steel (`tt_spindle`, grey 0.42, roughness 0.24) instead of mirror chrome. *(removed in v1.3)*
  - The dust cover is lengthened in place (`extendLid`) so that, closed, it encloses the platter, knob and counterweight. It is split by face orientation into a satin outer coat (clearcoat 0.25 / 0.5, roughness 0.55; *removed in v1.3*) and a darker, uncoated interior with baked occlusion (`LID_LOOK`), so it stays dark smoked plastic through the close. The lid does not receive shadows.
  - The vinyl's 8192×4 groove normal and anisotropy LUTs are kept exact.
  - The status is the start/stop key cap, which lights green `#3BE08A`. The v1.1 perforation row and status lens are gone.
- **Physics upgrades:**
  - The host's align and lower are one gesture.
  - The record seats and settles like a coin: a precessing tilt that decays to exactly 0, with a rim excursion of 10.8 mm.
  - The gimballed cue lifts, swings and lowers on the master bearing, and the counterweight pitches with it.
  - The platter spins up through a belt-drive lag (95 % of speed in ≈0.35 s) and brakes on a smootherstep.
  - The lid closes as one damped hinge (a Beta(2, 4) profile) from the master's 27.6° lean.
- **Presets:** coral and cobalt label prints are variants of the master's label (`labelPrint`: the master's olive field and ink re-inked in linear light). They carry v1.1's quarter wedge and butter sliver, so the accept spin reads at stage size. *(removed in v1.3)*
- **Presentation tilt:** the hovering record tips 0.65 rad toward the camera (was 0.9), so it stays below the key's broad specular lobe and reads black.
- **Known gaps:** the shared director's interruption blend can turn the record back by up to π. The tonearm cue is small at stage size. The extended lid reads as a second box when closed. The settle is subtle on purpose. See `docs/scenes/party-v1.2.md`.

### Birthday (v1.2): the two-tier piped cake

- **Object:** the cake master at scale 1.1, turned 5° so the candles spread evenly from the 20° camera. It has two piped tiers (shell borders, swags, rosettes, sugar pearls) on a turned glazed-ceramic stand (`#A2B2BC`), with **six** twisted pink and blue striped candles in the master's own sockets. The stand is the `tray`, and it stays behind on decline: the cake is lifted off it, as v1.1's tray stayed.
- **Materials of note:**
  - The frosting meshes are joined into four materials (`cake_*`). Clearcoat and the pearls' iridescence are kept.
  - The master's single wick and flame meshes are dropped. Each candle has a code-authored wick at the master's size and the v1.1 view-dependent shader flame, drawn at 1.5× the master flame's height (`FLAME_DRAW`) so it reads at stage size.
  - Dense meshes skip the shadow pass. Generated proxies cast for them: cake, stand and one per candle. The candle proxies also avoid a shadow-depth texture leak (see Known gaps in the scene doc).
- **Physics upgrades:**
  - Each candle has a weighted descent that carries its speed into the buttercream, presses about 5 mm and settles on a 6 Hz spring.
  - The breath leans the flames in the picture plane (about 31°), with a 7 Hz flutter and a stretch. One smoke wisp per candle stays rooted on its wick while it unfurls.
  - The lift-off on decline reads heavy.
  - The carried cake leans like a pendulum (≤ 1.8°) and is upright before the drop.
  - Over the bin, the cake's own materials darken with height ("bin shade"), so it sinks into shade instead of staying key-lit.
- **Presets** (variants of the four frosting materials):
  - **Vanilla:** body `#E0D3BF` at roughness 0.58, piping `#FFFCF6`, rosettes `#F7EFE1`, pearls white. *(removed in v1.3)*
  - **Cocoa:** body `#5E3727`, piping `#94603F`, rosettes `#4A281A`, pearls `#F4EADB`.
- **Known gaps:** the flames are the stylised v1.1 shader, not the master's cream teardrop. The candles are only a few pixels wide on a phone. The lean is subtle. The lookdev identity tile still builds the v1.1 cake. See `docs/scenes/birthday-v1.2.md`.

### Sports (v1.2)

- **Ball:** the basketball master (81k triangles; albedo, ORM and normal maps at 2048×1365, clearcoat 0.2) at r 0.25. Its great-circle seam cross faces the guest at guest-ready, as the v1.1 shader ball's did. The master's curved seams bow towards the cross, as on the scanned ball. A load-time multiply (`LEATHER_GRADE`) deepened the orange to about (222, 82, 24) at guest-ready *(removed in v1.3)*. **Cream preset:** a second albedo generated from the orange one, with the panels remapped to ivory (236, 229, 212) so the lit side separates from the peach stage by hue. The pebble mottling and seams are kept, and it is stored as a material variant. The v1.1 coral equator and limb darkening are not carried over.
- **Hoop:** the master's board (dark wood frame, grey laminate face, white target), red powder-coated rim on its bracket, zinc steel hardware and a 20-strand twisted-rope net. It is scaled so the rim's inner diameter stays 1.6× the ball's. The v1.1 cream board, ink backer frame, coral target inlay and perforation row are replaced by the master's own design.
- **Stand:** the v1.1 ink pole, ogee base, clamp and arm, with the chrome trim ring and a back plate on the master board (code-authored).
- **Net:** the master's net is narrower than the ball at rest. On the made shot a **ball-following bulge** (`NetPose`, `netOpening`) opens each row just enough to clear the ball at that height, with strands, loops and knots moving together. The net stretches (≤ 20 %) while the ball drags it, then rebounds and settles to exactly rest 0.6 s after contact. The far layer keeps its 0.8 shade. *(The v1.2 foundation's uniform `netOpenScale` flare is superseded.)*
- **Physics upgrades:**
  - Spin is integrated from continuous angular-velocity profiles: 2.5 rev/s of backspin on the made shot and 2.2 on the airball. The net grips the ball and eases its spin, and from the floor it rolls without sliding after a 35 ms skid.
  - Every floor contact gets a volume-preserving squash on `ball_secondary` (≤ 10 %, scaled by impact speed).
  - The rim and board recoil on their hinges when the net tugs (peaks of 2.5° and 0.6°).
  - v1.2.1 (`a613138`) raised these from 1.2°, 0.3° and ≤ 8 %, which the judges found correct but too small to see at stage size. The shapes, fades and end times are unchanged, and in the 540 px captures the rim's front edge now dips 6–7 px.
- **Known gaps:** the recoil and the squash are still modest on a 390 px stage. The board, fixed by the 1.6× rim rule, carries more visual weight than v1.1's. The orange grade lives at runtime *(removed in v1.3)*. See `docs/scenes/sports-v1.2.md`.

### Dinner (v1.2)

**No food (Surya, 2026-10-01).** The scene is the silver cloche and the clean plate only. The v1.1 pasta and vegetables are deleted, and so are the code-authored plate and cloche (`models/dinnerParts.ts`). There is no Dinner preset control: `dish` stays in `SceneConfig` but selects nothing, and one shared poster set serves both values. Details and every judgement call are in `docs/scenes/dinner-v1.2.md` and the Decisions block of `scripts/masters/recipes/dinner.ts`.

- **Plate:** the porcelain plate master (clearcoated porcelain, with a gilt band on the rim that has its own environment at 1.1), 1.6 across as in v1.1. The reveal shows the plate itself, the gilt rim catching the key. The v1.1 perforation row, ink foot line and cream glaze are replaced by the master's own design.
- **Cloche:** the silver cloche master's dome assembly (dome, lip bead, two bands, finial, ring handle) at the plate's scale (`DISH_SCALE` 0.8399). Its own tray is dropped and the plate takes its place.
  - **Dome:** polished silver with a **lathe-polish anisotropy**: 0.3 along the meridians (rotation π/2), roughness 0.2, own environment 0.9, set at load by `finishDish` in `models/dinner.ts`. The softbox stretches into soft vertical highlight bands with darker reflections between them. An isotropic finish of the master's near-white silver read pale and frosted in the cream studio. The first ship (0.5 at roughness 0.18) read as a ribbed dome of light and dark gores; v1.2.1 settled on 0.3 / 0.2. *(removed in v1.3)*
  - **Bead, bands, finial and handle:** softened to roughness 0.12 at own environment 0.8, so they shade like metal rather than pale lines. *(removed in v1.3)*
  - The v1.1 coral knob is gone with the master's ring handle.
- **Motion:** the beats and durations are the same. The reveal is handle-led (the guest-side rim tips up first). Every set-down lands the leading rim first, and the ≤ 1° rim rock follows on, C1. A change of mind rewinds the showing outcome along its own path instead of cutting (see `docs/spec-revisions.md`).
- **Known gaps:** at stage size the empty well is a near-flat white disc, and the gilt rim carries the reveal. The studio environment has no dark horizon, so the dome shows soft bands rather than room reflections *(resolved in v1.3: `neutral-room`'s window, horizon, runner and sideboard give the master's dome room reflections)*. Inside the bin, the ring handle shows briefly after the dome has gone.

### Business (v1.2): the all-access badge and the RFID/NFC reader

- **Object:** the badge master at ×1.5: a printed card in a clear vinyl holder (0.744 × 1.164) with side clips, a chrome D-ring, swivel and **closed snap hook**, and a woven blue strap. The reader master is at ×0.72 (0.92 × 1.37): a brushed-steel wedge body on a plinth, with a black glass face leaning 11.6°, a window gasket, an LED bar with its glow and an NFC mark. One stage unit is 76.3 mm: the printed card's width, 0.472 master units at ×1.5, is a CR80 card's 54 mm short side.
- **Materials of note:**
  - The clear holder is drawn as a clear sheet: no diffuse, its reflection added at full strength, the master's roughness 0.03 and specular kept, and 14 % dimming. The recipe's `transmissionToAlpha` 0.35 is in the GLB, but a plain alpha blend read as a white veil.
  - The chrome is polished in the recipe (roughness 0.1, base 0.6), so it reads as metal. *(removed in v1.3)*
  - The master's static strap is dropped. The v1.1 runtime lanyard rig draws the strands in the master's own woven material (`badge_strap`: albedo, normal, ORM and sheen), from a sewn tab folded round the D-ring.
  - **Status:** the master's LED (`emissiveStrength` 1) plus a lit **status tile** (0.30 × 0.19) on the lower glass, with a dark check (accept) or minus (decline). It glows green `#3BE08A` (LED 1.0, tile 0.72) or red `#E53E3E` (LED 0.85, tile 0.66). The tile reads by shape without colour and stays in view under the pressed card.
- **Physics upgrades:**
  - The card hangs as a physical pendulum on the swivel at the master card's real size (swing 1.78 Hz, pitch 1.83 Hz, ζ 0.4).
  - The host threads the holder's slot through the snap hook's gate while the hook is held turned back, then the hook swings home carrying the card. The beats hand over their speed, with no stop.
  - The card arrives along the face normal, flat on the 11.6° glass (its reflection 41.8° from the key light), and presses 0.6 mm into the gasket. It settles in plane, then peels off along the normal.
  - A change of mind peels the card off the reader and joins the new outcome over 0.3 s from the pose on screen (see `docs/spec-revisions.md`).
- **Presets:** **light** is the master's 2048 × 1536 print. **Dark** is a deterministic re-ink of it (`darkPrint`): ink `#1F2226`, warm-white type `#F2EEE6`, cobalt lifted to `#406AE0`. Both are stored exact-lossless.
- **Known gaps:** the threading through the 2.7 mm hook gap is too small to read at stage size. The strap has no twist. The LED bar is hidden under the pressed card, and the tile carries the outcome. The dark card's lower edge on the black glass relies on the holder's rim. The lookdev page still shows the code-authored keycard rig (`models/keycard.ts`). See `docs/scenes/business-v1.2.md`.

# Style reference — direction L2 "Satin Enamel · premium" · v1.1

**v1.1 (2026-09-29).** Surya approved the premium pass at checkpoint 2b ("go with premium… high fidelity and masterful texturing, lighting and scene work"), with the orthographic camera and the two-tier cake. L2 keeps L's identity (palette, silhouettes, one enamel insert, the perforation row) and upgrades surfaces, construction, light and finish. v1.0 (below) still defines the palette and object rules unless a v1.1 rule replaces them.

Source of truth: `src/render/studio.ts` (key, fill, sweep, cookie, shadow filter, Low-tier detail), `src/render/lighting.ts` (L's hemisphere fill, kept under the premium key), `src/render/stage.ts` (shadow casters, backdrop wall), `src/render/camera.ts` (framing), `src/render/materials.ts` (`DIRECTIONS.L2`), `src/render/print.ts` (printed art, holo foil), `models/badgePremium.ts`, `models/cakeParts.ts`, `models/recordPremium.ts` + `models/recordParts.ts`, `models/disposalBin.ts`, `models/shadowProxy.ts`, `models/sportsPremium.ts` + `models/sportsParts.ts`, `src/render/ballMaterial.ts`, `models/dinnerPremium.ts` + `models/dinnerParts.ts` (v1.1; since v1.2 Dinner is `scripts/masters/recipes/dinner.ts` + `models/dinner.ts`, and `dinnerParts.ts` is deleted), `src/ui/shell.css` (stage finish). *Since v1.3* the studio below is rig `v1.1` (`src/render/rigs/v1.1.ts`, built from the kit in `src/render/studio.ts`), the camera is perspective, and `shell.css` has no finish.

### Studio (all scenes)

*Superseded in v1.3* by rig `neutral-room` (v1.3 at the top). The table is kept as the record of rig `v1.1`, which still renders under `?rig=v1.1&camera=ortho` on a local host. Rows marked *v1.3* say what the production studio does now.

| Setting | Value |
| --- | --- |
| Camera | Orthographic 3/4, unchanged (az 20°, el 15°). *v1.3: perspective, 18°, same angle* |
| Key | Spot `#FFF1DE` × 15, decay 0, from (−4.2, 7.8, 5.4), angle 0.6, penumbra 0.7 — late-afternoon sun. L's directional key is removed from the scene (no light slot). *v1.3: one soft spot `#F3F5FA` × 1.5 from the room's window* |
| Gobo | Procedural palm cookie (768²): far layer blurred and faint, near layer of tapered drooping leaflets, crisper. Fronds enter from the edges; objects sit in open sun. *v1.3: no gobo* |
| Soft shadows | PCF 1024², radius 6, patched to 16 fixed Vogel taps (no dither noise, no extra draw calls). *v1.3: the same filter at radius 5* |
| Shadow casters | A mesh skips the shadow pass when its local (unscaled) geometry bounding box is thinner than 0.015 units or no larger than 0.05 units (1.5 mm and 5 mm at the manifest's stage-decimetre scale): decals, prints and small hardware. Lanyard strands skip only this size test; transparent meshes and `*_shadow` contact planes never do. Two explicit flags override the size test: `userData.noShadowCast` opts a mesh out, and `userData.shadowProxy` marks an invisible low-poly stand-in that casts for the meshes it replaces (and receives nothing) |
| Fill / bounce | **Combined fill, the approved look:** L's direction hemisphere, sky `#F7F3EE` / ground `#CFC4B3` × 0.9 (`lighting.ts`, left on under the premium key), plus the premium cool sky fill `#E3E9EF` / `#D6C7B2` × 0.3 (`studio.ts`). Bounce `#FFE8D2` × 0.14. *v1.3: no fill or bounce lights; the room environment fills* |
| Environment | L's procedural softbox PMREM at 0.52 (reflections for glass, clearcoat, chrome). *v1.3: the Models viewer's room at 1.0, metals included* |
| Backdrop | Seamless cove sweep `#EAE3D6`, limewash plaster: tileable relief normal (multi-octave + pits) and matching albedo mottle, 512², repeat 2.2. Under the warm key it renders as about `#F8E4C8` (measured from the posters); the HTML stage colour matches that, so poster, fallback and canvas agree. The wall sits at z −3.2 unless a scene moves it (see Birthday). *v1.3: a clean painted greige cove `#BEB9B1`, rendering `#D5D2CD`, the new token; the wall rule is unchanged* |
| Finish | CSS over poster and canvas: warm radial vignette (multiply, 12%) + fractal film grain (overlay, 16%). It adds nothing to the WebGL frame. Its cost in the browser compositor (two blended layers over a live canvas) has not been measured on desktop or on a phone. Hidden in forced-colours. *v1.3: removed* |
| Low tier | Shadow map off (and its target freed) and plaster normal map off; contact shadows remain. The gobo stays as a 192² copy (0.14 MiB, the 768² original freed): the cookie also dims and warms the key on every object, so dropping it brightened and cooled Low by 35–90 % per channel (measured at checkpoint 4). With the small cookie, object bodies at Low stay within 5–10 % of Normal. What the missing shadow map takes away is cast shadows: the Birthday stand's pedestal reads about 50 % brighter without the tray's shadow, and the Party and Birthday floor shadows go (contact shadows remain). At DPR 1 on small stages the Sports net's cords fall below a pixel and read as dashes. Library materials simplified as before (no normal maps or sheen). Environment response 0.8 applies only to materials with their own environment (the cloche; since v1.2 every imported metal); the rest follow the scene-wide 0.52. *v1.3: shadow map off, contact shadows kept, no gobo or relief to drop; metals stay at 1.0* |

### Normal tier (revised)

The premium studio's real-time soft shadows (one 1024² map, 16-tap PCF, gobo cookie) and physical materials (clearcoat, sheen, anisotropy, the holo foil) are the revised Normal-tier definition. Master §9 defines Normal as "simple PBR; baked contact detail; no postprocessing". Its revision clause covers budgets set at the Business milestone, so this is recorded as an explicit revision of the tier itself, with the reasons: the WebGL frame still has no postprocessing (no extra passes); the CSS vignette and grain are compositor layers outside the renderer, their cost unmeasured and listed for the phone session. This follows the premium look Surya approved at checkpoint 2b. It is pending phone measurement on the reference device (iPhone 17 Max, Safari). If Normal misses the frame-interval target there, the quality monitor drops to Low (defined above) as it would for any tier.

*v1.3:* the production rig has no gobo and the CSS layers are gone, so Normal is one 1024² 16-tap shadow map, a full-strength environment and the physical materials, with no postprocessing and no compositor layers (revisions #32 and #33). Still pending the phone.

### Checkpoint 3 decisions (2026-09-29)

Surya approved Party (premium record player) and Birthday (two-tier cake and the shared charcoal pedal bin), so the disposal treatment is locked for Dinner. The disposal scenes may frame their object below 60 % of stage width (Birthday 52 %), because the camera fits the whole literal cake-to-bin path. Sports and Dinner get the same premium treatment as the first three scenes.

### Surfaces

*Superseded in v1.2 for the Business card and reader:* the laminated print, PVC core, holographic seal, glass faces with a champagne bezel, the status window with its glyph, the ink foot bead and the 20° scan pose describe the v1.1 code-authored keycard and scanner. Since v1.2 the card is the all-access badge master in its clear holder, and the reader is the RFID/NFC reader master. The status is the master's LED plus a lit tile with a check or minus on the glass, and the card presses flat on the 11.6° glass. See Business (v1.2) above. The hardware, buttercream and glaze bullets now describe library materials that the masters no longer use.

- **Laminated print** for cards: printed art (canvas, original geometric glyphs, no fonts), clearcoat 1 / 0.1. White PVC core on the card edge (`mat_edge #F1EDE6`).
- **One delight material per object**, used once: the badge's holographic seal (metallic rainbow sunburst whose hue rotates with viewing angle, so colour sweeps as the card swings).
- **Glass faces** (`mat_body_ink`): near-black, clearcoat 1 / 0.06, set into machined pockets with a polished champagne bezel (`mat_bezel #D8CDBA`, metal, r 0.18).
- **Hardware**: bright chrome (`mat_metal`, r 0.14), turned/cast forms; static parts that share a material are merged into one draw.
- **Buttercream / glaze / ceramics**: sheen on frosting, clearcoat on glazes and the cobalt stand.
- **Status light** (Business): the window lights green/red with a **dark glyph** (LED-display contrast) and a coloured point-light spill that tints the card at the scan beat. No halo or bloom (Master §5). The light always exists (intensity 0 idle) so status changes never recompile shaders. **Checkpoint 4:** the lit window keeps its idle glass colour and glows by emission alone, in the unchanged status tokens: green at intensity 1.0 and red at 0.85. It renders close to its token instead of clipping to mint or pink, and the two differ in value as well as hue (also under deuteranopia). The glyph is larger: the check is 0.125 wide with a 0.23 stroke, over 2 CSS px at the 328 px stage. It is solid black and fully rough, so neither light greys it. The card spill is dimmed to 0.35 and lifted off the glass, so it tints the card without a hotspot beside the window.
- **Scanner silhouette** (Business, checkpoint 4): an ink foot bead round the base gives the reader its ≥3:1 edge against the plaster.
- **Scan pose** (Business, checkpoint 4): on the reader the card turns about 20° about its long axis, so the laminate stops mirroring the key softbox (revision #18). Stills are unchanged. *Superseded in v1.2:* the badge presses flat on the reader master's 11.6° glass, which keeps its reflection 41.8° from the key light (revision #26).
- For L2 these replace v1.0's "no clearcoat, no mirror chrome".

### Construction

SDF modelling (surface nets, gradient normals, Newton projection) for continuous-fillet housings, decimated by meshoptimizer at export only; profile sweeps along plan paths with analytic normals (`models/recordParts.ts`) for the record player; parametric lathes elsewhere. Continuous fillets, crisp reveals, real drilled holes, shadow-gap feet. *Since v1.2* this applies only to what is still code-authored: the shared bin, the Sports stand, the Birthday wicks and flames, the Party tonearm rest and the contract skeletons. The invitation objects are the masters.

### Party: premium record player (M3)

*Superseded in v1.2* by the vintage turntable master (Party (v1.2) above). The swept cream body, coral plinth with its perforation strip, knurled coral controls, woven lid lining and the v1.1 label art are gone. The coral and cobalt label presets survive as re-inked variants of the master's label, carrying the v1.1 wedge.

- **Swept-profile body:** a cream satin shell with a continuous top fillet, built from profiles swept along a rounded-rectangle plan. Fillets shade smoothly, unfilleted corners stay crisp, and neighbouring sweeps share contours, so the body is watertight.
- **Coral plinth with one perforation strip:** a coral enamel plinth with a soft undercut into a recessed shadow-gap foot, separated from the shell by a crisp V reveal. One row of 25 whole dots (pitch = strip height) runs along it and stops one empty pitch before the status lens, so the lit status reads as the row's last dot switching on.
- **Knurled controls:** a coral anodised knurled speed knob, 33/45 keys (glossy ink caps in chrome trims; 33 pressed with a coral dot) and a knurled counterweight on the gimballed chrome tonearm, which has a coral finger lift.
- **Woven lid lining:** a framed thin-walled dust cover lined with woven grille cloth (`mat_lid_fabric #34363A`, weave normal, sheen), notched over two chrome hinge barrels on the pivot axis. The open lid shows a tactile face instead of bare plastic.
- Glossy vinyl with an anisotropic groove sheen, printed asymmetric labels (coral and cobalt presets), brushed platter on a rubber mat.
- 17 draw calls and about 23.9k visible triangles from the builder (`party.glb` 234.9 KiB gz).

### Birthday additions (M4 first pass)

*Cake construction superseded in v1.2* by the two-tier piped cake master with six candles on its glazed stand (Birthday (v1.2) above): there is no drip glaze and no cobalt tray. The backdrop wall, point-based framing and shared bin below still apply unchanged.

- **Shadow proxies:** the dense cake body, drip glaze, pearls, turned stand and candles carry `noShadowCast`; *(v1.2: the joined frosting and the stand skip the shadow pass, and generated proxies cast for the cake, the stand and each of the six candles)* two invisible low-poly proxies (`tray_shadow_proxy`, `cake_shadow_proxy`) cast their shadow instead. The shadow keeps its shape at a fraction of the shadow-pass triangles.
- **Per-scene backdrop wall:** a scene can push the cove wall back (`studio.wallZ`). Birthday uses z −4.3 so the bin's slide and the carried cake never meet the cove.
- **Point-based framing:** a scene can supply silhouette sample points along every authored path (`framePoints`). The orthographic fit uses them instead of bounding-box corners, which overstate round objects (a disc's box corners project about 28% wider than the disc).
- **Shared charcoal bin:** a charcoal powder-coated pedal bin (`mat_bin #34373A`, r 0.48, clearcoat 0.25) with an ink liner bucket and foot ring and a butterfly lid of two turned brushed-metal half-dome flaps hinged at the sides (about 100° open), so the open bin stays low in frame. It is sized so the cake with its candles drops fully below the rim before the flaps close: the disappearance is real occlusion, never a fade. Dinner's decline will reuse it (`assets/shared/disposal-bin.glb`).
- **Coral pedal:** the bin's one enamel insert (`mat_accent`), turned off the front so it shows at the camera angle.

### Sports: premium hoop and ball (M5, signed off by a critical reviewer at checkpoint 4)

*Superseded in v1.2* by the basketball and hoop masters (Sports (v1.2) above). The cream board, coral target inlay, perforation row, coral rim, cotton net and the shader leather ball are replaced. The ink pole, ogee base with its chrome trim ring, clamp and arm are kept as the code-authored stand. The net's far-layer 0.8 shade is kept. The keyed flare (`netDeform` widening the lower rows) is replaced by the ball-following bulge, and the shader ball is lookdev only.

- **Backboard:** cream satin board (`mat_body`, measured (240, 218, 189) on the poster, matching the approved scanner face) with a chamfered edge and a glossy ink backer frame 12 mm proud all round. The chamfer and the frame form a V reveal, and the frame gives the board its ≥3:1 silhouette. Frame, bracket arm and pole read as one ink support.
- **Target:** the coral enamel insert is a flush outline inlay (never filled) sitting 0.6 mm below the face in a 4 mm channel. An ink liner in the channel draws a dark hairline round it, and the corners are concentric. Its bottom edge sits exactly one pitch above the perforation row: 22 whole dots with more than one pitch of margin.
- **Hardware:** a chrome bracket plate with ink screw heads, a coral anodised rim (hardware, like the record player's knob, so it is not a second enamel insert) and a smooth 64-segment ogee base with a chrome trim ring.
- **Net:** tapering cotton cords (5.5 mm to 4.2 mm) with knots about 1.45× the cord and loops laced over the rim. Rows are taller at the top and shorter at the bottom. The **far layer is shaded to 0.8 through vertex colour** from the shared camera (`farLayerShade` in `models/sports.ts`, with `mat_net` using vertex colours), so the two layers read as depth rather than a crosshatch. The swish is a radial keyed deformation (`netDeform`: flare widens the lower rows, stretch lengthens the net). The net is rebuilt as float geometry in net space, because the quantised GLB positions would tear.
- **Leather ball** (`src/render/ballMaterial.ts`): shader seams with `fwidth` anti-aliasing, Worley pebble grain (frequency 11, radius 0.46) that fades into roughness at small sizes, and curved seams 40° off the centre seam. A fixed seam frame (`SEAM_FRAME`) shows the classic "( + )" to the camera at guest-ready. A unit test fails if the camera or the host pass change without recomputing it.
  - **Orange preset:** `#E36A2C` with ink seams.
  - **Cream preset:** `#EFE4CD` with ink seams and a coral equator. A post-tone-map limb darkening (0.58 at the edge) takes the lit edge from about 1.05:1 to 1.3–1.5:1 against the stage. The ink seams (about 12:1) and the contact shadow carry the silhouette, as the approved light badge's cream border does.
- **Delight:** the made shot's swish (net flare and rebound) and the leather ball's spin.
- 20.5k visible triangles and 8 draw calls; lookdev 35.9k / 18 including the shadow pass; `sports.glb` 516 KiB raw, 223 KiB gzipped.

### Dinner: premium covered dish (M6)

*Cloche and plate superseded in v1.2* by the silver cloche and porcelain plate masters (Dinner (v1.2) above). The satin `mat_cloche` (roughness 0.3, anisotropy 0.7, own environment 1.1), the polished bead at 0.18, the coral knob, the cream glazed plate and its perforation row no longer ship. The dome is now anisotropy 0.3 at roughness 0.2 with its own environment at 0.9. The layout, the transfer path and the rim rock below still apply; with no food, "the food stays in front" now means the clean plate stays in front.

**Food shelved (Surya, 2026-09-29).** Dinner is judged on the dish unveiling: cloche, plate, reveal, settle, contact shadows, framing and disposal. The pasta and vegetables models from builder round 3 stayed in place as frozen placeholders through v1.1. **Superseded in v1.2:** the food is removed for good (Surya, 2026-10-01: the scene is the cloche and the clean plate); see Dinner (v1.2) above.

- **Cloche:** satin brushed metal (`mat_cloche`, roughness 0.3, anisotropy 0.7) with its **own copy of the stage environment at 1.1** (`SurfaceSpec.ownEnv`, assigned by `Stage.assignOwnEnvironment`). In r186 a material lit by `scene.environment` takes the scene-wide 0.52 and ignores its own intensity, which rendered the dome gunmetal. It reads as satin silver and still never mirrors the room. The polished lip bead uses `mat_cloche_polished` (roughness 0.18); the knob is the coral enamel insert.
- **Plate:** cream glazed ceramic with a softened clearcoat (0.4 / 0.3). A sharp clearcoat aliased into a dashed line along the thin rolled rim at phone DPR. The whole-dot perforation row runs on the rim wall, and an ink foot line gives the silhouette.
- **Layout (checkpoint 4):** the bin stands behind-left at (−0.7, 0, −1.7) and slides in from the left margin, decelerating across the visible frame. The uncovered cloche is set down behind-left at (−1.2, 0, −0.95), so the food stays in front and the dish sits centred. The transfer into the bin is one continuous move along a rounded up–across–down path. The camera fit samples the bin's real open geometry (`openBinFramePoints`), so the flap tops keep the full 8 % clearance. The open bin, not the dish, sets the frame: ready-pose fill is 43.1 %, near the ceiling a placement search found (see the framing row in `docs/qualification.md`). The cloche rocks once on its rim (≤1°) after seating and after it is set down, and has its own contact shadow beside the plate.
- **Delight:** the reveal and the material response. The sub-spec excludes steam, particles and garnish motion.

### Budgets (per scene, measured incl. the shadow pass)

*Superseded in v1.2:* budgets are waived for the masters pass. The shipped triangles, draw calls, texture memory and GLB sizes are in `docs/qualification.md` (v1.2). The figures below are the v1.1 code-authored objects.

| Scene | Triangles | Draw calls | Budget |
| --- | --- | --- | --- |
| Business guest-ready / accepted | 53.4k / 53.5k | 33 / 35 | 60k / 40 |
| Party record player (builder count, visible pass only) | 23.9k | 17 | 60k / 40 |
| Cake (lookdev, before bin and proxies) | 65.5k | 25 | **over** before M4; M4 added shadow proxies and the bin. Re-measurement is pending in `docs/qualification.md` |

Texture memory added by L2 (RGBA8; mipmapped textures × 4/3):

- Studio, every scene: palm cookie 768², no mipmaps, 2.25 MiB; plaster normal + albedo 2 × 512², 2.67 MiB. Total 4.9 MiB. *(Rig `v1.1` only since v1.3; `neutral-room` allocates neither. Its environment is the same 768 × 1024 half-float PMREM size, about 6 MiB.)*
- Business: card prints 2 × 600 × 907 (both templates once visited), 5.54 MiB; holo seal and strap print 2 × 256², 0.67 MiB. Total 6.2 MiB, so 11.1 MiB with the studio.
- Party: label prints 2 × 512² (both presets once visited), 2.67 MiB; groove directions 256², 0.33 MiB. Total 3.0 MiB.
- Birthday: smoke wisp 64 × 160, 0.05 MiB.
- Shadow map: the 1024² target holds a 4 MiB depth texture plus the 4 MiB RGBA8 colour texture three allocates with it, so about 8 MiB. It is freed at the Low tier.

---

# Style reference — direction L "Satin Enamel" · v1.0

Locked 2026-09-28 at checkpoint 1 by Surya: **B + A restraint, keeping A's coloured candles and A's covered dish.** One consolidated refinement pass applied from the independent panel's findings (`docs/visual-study.md`). This file owns the production look for all five scenes; scenes never pick their own look.

Source of truth for values: `src/render/materials.ts` (`DIRECTIONS.L`), `src/render/lighting.ts`, `src/render/camera.ts`, `src/render/contactShadow.ts`.
Approved references (browser-rendered): `~/Creative/Livetime/invitation-interactions/study/2026-09-28-style-lock-L/`.

## Rules in one paragraph

Cream satin bodies with crisp edges. **One enamel insert per object**, drawn from coral `#FF714A`, deepened cobalt `#2C47A6` or ink `#25282B`. Brushed satin metal only where it identifies the object (clip, cloche, tonearm, platter, hinge). The family mark is **one row of inset perforations**: whole dots only, spacing equal to band height, centred with at least one pitch of margin, and only on manufactured supports (tray band, card border, scanner collar, plinth band, backboard frame, plate rim), never on food. Every object carries **at least one silhouette element at ≥3:1 against the stage** (ink keyline edge, enamel insert along the silhouette, or dark foot). No mustard bodies, no clearcoat, no mirror chrome.

## Renderer and colour

| Setting | Value |
| --- | --- |
| Renderer | Three.js r186 WebGLRenderer, WebGL2, MSAA on |
| Output | sRGB; linear working space; linear (NoColorSpace) data maps |
| Tone mapping | NeutralToneMapping, exposure 1.0 |
| Camera | Orthographic, azimuth 20°, elevation 15°, motion-bounds fit with 8% clearance |
| Stage | `#F4F1EB`, seamless, no floor line |
| Key | Directional `#FFF6EC` × 1.9 from (−3.2, 5.4, 4.2) — upper left, front |
| Fill | Hemisphere sky `#F7F3EE` / ground `#CFC4B3` × 0.9 |
| Environment | Procedural PMREM softbox room: walls 0.42, floor 0.85, key panel 5.0 upper-left, fill panel 2.0 right, rim strip 2.4 behind; intensity 1.0 |
| Post | None |

## Palette and materials

| Role | Token | Colour | Roughness / metal |
| --- | --- | --- | --- |
| Body (satin) | `mat_body` | `#ECE5D8` | 0.46 |
| Body alt (lids, secondary shells) | `mat_body_alt` | `#DAD3C6` | 0.48 |
| Ink | `mat_body_ink` | `#25282B` | 0.50 |
| Keyline edge | `mat_edge` | `#4A4C50` | 0.55 |
| Recessed foot / shadow gap | `mat_body_shadow` | `#A59E92` | 0.60 |
| Accent insert (enamel) | `mat_accent` | `#FF714A` | 0.62 |
| Cobalt insert (enamel) | `mat_insert` / `mat_tray` | `#2C47A6` | 0.66 / 0.74 |
| Butter (knobs, candle) | `mat_insert_warm` | `#EDB449` | 0.62 |
| Brushed metal | `mat_metal` / `mat_cloche` | `#CFCAC2` / `#D8D4CC` | 0.42 / 0.45, metal 1 |
| Anodised coral | `mat_anodized` | `#E8603C` | 0.34, metal 1 |
| Perforated band | `mat_signature` | host colour + dark holes | 0.52 |
| Printed detail on ink | `mat_print` | `#8E9196` | 0.50 |
| Printed detail on cobalt | `mat_card_mark` | `#F3ECDD` | 0.50 |
| Woven strap | `mat_fabric` | `#2F3135` | 0.85, weave normal, sheen 0.3 |
| Candles (A's colours, deepened) | `mat_candle_1..3` | `#F2603B`, `#2C47A6`, `#E8A93A` | 0.45 |
| Vanilla / cocoa frosting | `mat_frosting_*` | `#F5EAD8` / `#5B3627` | 0.60 / 0.52 |
| Vanilla / cocoa glaze | `mat_glaze_*` | `#FFF8EC` / `#3A2219` | 0.36 / 0.30 |
| Flame | view-dependent unlit shader | core `#FFF4C9` → tip `#FF8A2B`, silhouette alpha falloff | — |

Geometry: bevel ≈ 16% of the part's smallest dimension, 4 segments; fullness 1.04 (fuller than A, crisper than B).

## Object rules

*Superseded in v1.2 for the objects themselves:* the badge, scanner, cake, covered dish, record player and basketball are now the scan-to-CAD masters, and their look follows the masters (style reference v1.2 at the top). These rules still define the palette, the interface and the code-authored parts.

- **Badge (business).** Cream card with ink keyline edges; cobalt colour panel; cream personal-ID print (photo window + portrait glyph + three name lines, merged into one mesh); coral stripe; whole-dot row on the lower border. Satin-metal clip with anodised crimp on a **J-hook**: back leg, horizontal run through the card slot, and a gate hinged at the run's front corner. Open, the gate points forward in line with the run so the vertical card slides straight on; it then swings up clear of the card face. The attach is collision-free by construction and covered by a unit test. Woven ink lanyard that leaves the clip along the clip's up axis.
  - **Presets:** `light` = cream border. `dark` = ink border. Both keep the cobalt panel, cream print and coral stripe, so card identity survives either template.
- **Scanner (business).** Cream housing on a recessed shadow-gap foot. Ink reading face at 46°. Contactless target: two bold printed rings plus a centre dot (≈5:1 on the pad) inside a card-target keyline. A separate indicator window beside the pad (idle `#6E7175`, ≈3:1 on the faceplate) that lights green `#3BE08A` with a check glyph, or red `#E53E3E` with a minus glyph. A perforation collar row on the front.
- **Cake (birthday).** Drip-glaze cake on the cobalt enamel tray with a cream perforated band; piped bead base border; A's coloured candles; soft view-dependent flames at 82% scale. Budget ≈26k triangles before the bin.
- **Covered dish (dinner).** A's brushed satin-metal cloche with an anodised coral knob on a cream glazed plate; the perforated band runs on the plate's rim wall.
- **Record player (party).** Cream body; coral plinth band carrying the perforation row; brushed-metal platter and tonearm; warm-grey (`mat_body_alt`) framed lid on visible hinge barrels.
- **Basketball (sports).** Rim inner diameter ≈1.6× the ball's; open lattice net; pole behind the board on a bracket arm; outlined (never filled) coral target; perforation row along the board's lower frame. The production proportions are under "Sports: premium hoop and ball" above.

## Shadows

Two-layer contact shadows sized from each object's footprint: a soft spread (≈1.1–1.6× footprint, opacity 0.5, shows past the silhouette at the 15° camera) and a tight contact line (≈1.04×, opacity 0.4–0.5). Both fade with height. Layers under 1.2% opacity switch off, so a hanging card leaves no smudge.

## Status and interface

HTML stays authoritative. Accept `#176B42` + check, Decline `#A62D36` + minus. The accent `#FF714A` is never used for UI text, focus rings or button outlines on white (≈2.7:1); the focus ring is `#2F54C9`. System sans only.

## Measured at style lock (study models, M2 Pro, Chrome 153)

| Model | Triangles | Draw calls |
| --- | --- | --- |
| Cake + tray (L) | 25,724 | 16 |
| Keycard + lanyard + scanner (L) | 10,898 | 23 |

The budget is ≤60k triangles and ≤40 draw calls per scene (*waived in v1.2* for the masters pass; see `docs/qualification.md`, v1.2). These are desktop measurements of study models, not phone evidence.

## Carried into the Business scene as named experiments

1. **Card damping:** settle under 0.5° within 0.9 s from an 8° release, at most one visible overshoot at 390 px / DPR 1.5.
2. **Lanyard flex:** the lower strap visibly lags the card; no stretch or clipping; stays inside the framing clearance at 320 px.
3. **Indicator coding:** glyph-coded (≥10 CSS px at 288 px); distinguishable in greyscale and under deuteranopia; no clipping to white.
4. **Scanner and badge recognition:** a blind reviewer names the scanner a card reader and the badge a personal ID at 288 px.
5. **Signature stability:** the highlight count in the perforation band changes ≤5% between consecutive settle frames at DPR 1 and 1.5.
6. **320 px sign-off:** full frames in the ready, accepted, declined and static states with 44×44 targets, visible focus, ≥4.5:1 status text and ≥3:1 object boundaries.
