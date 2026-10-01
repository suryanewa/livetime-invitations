# Style reference — v1.2 · the scan-to-CAD rebuilds

## v1.2 (2026-10-01): scan-to-CAD masters

Surya asked that every interaction use the new models: *"buttery smooth and the same conceptually, but higher fidelity with the physics and our new models."* The invitation objects are now the scan-to-CAD rebuilds: eight realistic PBR objects with textured materials, rebuilt by design.inc from Meshy scans (`models/masters/*.glb`; generators in `github.com/suryanewa/scan-to-cad-rebuilds`).

- **The object look is owned by the masters and the recipes,** not by the v1.1 "Satin Enamel" object rules. `models/masters/*.glb` gives the geometry and materials. Each scene's recipe (`scripts/masters/recipes/<scene>.ts`, with a Decisions block at the top) gives the scale, pivots, joins, material policies and preset variants, plus a few load-time finishes in the scene's rig (named below). Where a v1.1 or v1.0 object statement further down disagrees with this section, this section wins; those statements are marked *superseded* and kept for the record.
- **Unchanged from v1.1:** the interface, the studio (key, gobo, fill, environment, plaster sweep, finish), the camera and the shared disposal bin. The beats and durations are also unchanged, unless a scene below records otherwise. Every choreography channel is still a pure function of time (the one exception is a change of mind mid-sequence: Dinner rewinds along its own path and Business draws a recovery path from the pose on screen, revisions #24 and #25) and is C1 at its beat boundaries (unit-tested per scene).
- **Budgets are waived for this pass** (owner's brief): the export reports state what ships (`docs/qualification.md`, v1.2).
- **Import path:** `scripts/masters/` (per-scene recipes; `scripts/masters/README.md`) merges the masters with the code-authored parts we keep into one runtime GLB. Imported materials keep their own textures and extensions; a material renamed to a library name is driven by the locked library instead.
- **Metals** without a library material get their own copy of the studio environment at 1.1 (`ownEnv`), so polished steel reads as metal, not gunmetal, under the 0.52 scene environment.
- **Low tier** also simplifies imported materials (no normal, clearcoat-normal or sheen maps; own environment 0.8), reversibly (`models/imported.ts`).
- **Textures** ship as WebP (`EXT_texture_webp`): colour and ORM maps lossy q90, capped at 2048; normal, anisotropy and lookup-table textures exact (lossless).
- **Presets** are `KHR_materials_variants` in the GLB (a second print or a recoloured material), except Dinner, which has none.
- **Per-scene detail:** `docs/scenes/<scene>-v1.2.md`, with decisions, measured contract numbers, export report, choreography changes and known gaps.

### Party (v1.2): the vintage turntable

- **Object:** the turntable master at `TT_SCALE` 1.132 (the plinth is 2.1 wide, as in v1.1, with the deck at 0.341). It has a brushed-steel plinth on rubber feet, a platter with a rubber mat and spindle, a record with its label, and a gimballed tonearm with a counterweight, headshell and cartridge. Its cue lever, arm lift and hinged smoked dust cover are also the master's. A turned chrome **tonearm rest** with a black-anodised cradle is added by the scaffold: the master's arm is posed playing and has no rest. Its materials are exact copies of the master's chrome and anodising, so the export folds them into one material each.
- **Materials of note:**
  - Every master material is kept and renamed `tt_*`.
  - The brushed steel keeps 92 % of its luminance and 40 % of its chroma (`PLINTH_TONE`), so it reads graphite-taupe rather than bronze under the warm key.
  - The spindle is turned steel (`tt_spindle`, grey 0.42, roughness 0.24) instead of mirror chrome.
  - The dust cover is lengthened in place (`extendLid`) so that, closed, it encloses the platter, knob and counterweight. It is split by face orientation into a satin outer coat (clearcoat 0.25 / 0.5, roughness 0.55) and a darker, uncoated interior with baked occlusion (`LID_LOOK`), so it stays dark smoked plastic through the close. The lid does not receive shadows.
  - The vinyl's 8192×4 groove normal and anisotropy LUTs are kept exact.
  - The status is the start/stop key cap, which lights green `#3BE08A`. The v1.1 perforation row and status lens are gone.
- **Physics upgrades:**
  - The host's align and lower are one gesture.
  - The record seats and settles like a coin: a precessing tilt that decays to exactly 0, with a rim excursion of 10.8 mm.
  - The gimballed cue lifts, swings and lowers on the master bearing, and the counterweight pitches with it.
  - The platter spins up through a belt-drive lag (95 % of speed in ≈0.35 s) and brakes on a smootherstep.
  - The lid closes as one damped hinge (a Beta(2, 4) profile) from the master's 27.6° lean.
- **Presets:** coral and cobalt label prints are variants of the master's label (`labelPrint`: the master's olive field and ink re-inked in linear light). They carry v1.1's quarter wedge and butter sliver, so the accept spin reads at stage size.
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
  - **Vanilla:** body `#E0D3BF` at roughness 0.58, piping `#FFFCF6`, rosettes `#F7EFE1`, pearls white.
  - **Cocoa:** body `#5E3727`, piping `#94603F`, rosettes `#4A281A`, pearls `#F4EADB`.
- **Known gaps:** the flames are the stylised v1.1 shader, not the master's cream teardrop. The candles are only a few pixels wide on a phone. The lean is subtle. The lookdev identity tile still builds the v1.1 cake. See `docs/scenes/birthday-v1.2.md`.

### Sports (v1.2)

- **Ball:** the basketball master (81k triangles; albedo, ORM and normal maps at 2048×1365, clearcoat 0.2) at r 0.25. Its great-circle seam cross faces the guest at guest-ready, as the v1.1 shader ball's did. The master's curved seams bow towards the cross, as on the scanned ball. A load-time multiply (`LEATHER_GRADE`) deepens the orange to about (222, 82, 24) at guest-ready. **Cream preset:** a second albedo generated from the orange one, with the panels remapped to ivory (236, 229, 212) so the lit side separates from the peach stage by hue. The pebble mottling and seams are kept, and it is stored as a material variant. The v1.1 coral equator and limb darkening are not carried over.
- **Hoop:** the master's board (dark wood frame, grey laminate face, white target), red powder-coated rim on its bracket, zinc steel hardware and a 20-strand twisted-rope net. It is scaled so the rim's inner diameter stays 1.6× the ball's. The v1.1 cream board, ink backer frame, coral target inlay and perforation row are replaced by the master's own design.
- **Stand:** the v1.1 ink pole, ogee base, clamp and arm, with the chrome trim ring and a back plate on the master board (code-authored).
- **Net:** the master's net is narrower than the ball at rest. On the made shot a **ball-following bulge** (`NetPose`, `netOpening`) opens each row just enough to clear the ball at that height, with strands, loops and knots moving together. The net stretches (≤ 20 %) while the ball drags it, then rebounds and settles to exactly rest 0.6 s after contact. The far layer keeps its 0.8 shade. *(The v1.2 foundation's uniform `netOpenScale` flare is superseded.)*
- **Physics upgrades:**
  - Spin is integrated from continuous angular-velocity profiles: 2.5 rev/s of backspin on the made shot and 2.2 on the airball. The net grips the ball and eases its spin, and from the floor it rolls without sliding after a 35 ms skid.
  - Every floor contact gets a volume-preserving squash on `ball_secondary` (≤ 10 %, scaled by impact speed).
  - The rim and board recoil on their hinges when the net tugs (peaks of 2.5° and 0.6°).
  - v1.2.1 (`a613138`) raised these from 1.2°, 0.3° and ≤ 8 %, which the judges found correct but too small to see at stage size. The shapes, fades and end times are unchanged, and in the 540 px captures the rim's front edge now dips 6–7 px.
- **Known gaps:** the recoil and the squash are still modest on a 390 px stage. The board, fixed by the 1.6× rim rule, carries more visual weight than v1.1's. The orange grade lives at runtime. See `docs/scenes/sports-v1.2.md`.

### Dinner (v1.2)

**No food (Surya, 2026-10-01).** The scene is the silver cloche and the clean plate only. The v1.1 pasta and vegetables are deleted, and so are the code-authored plate and cloche (`models/dinnerParts.ts`). There is no Dinner preset control: `dish` stays in `SceneConfig` but selects nothing, and one shared poster set serves both values. Details and every judgement call are in `docs/scenes/dinner-v1.2.md` and the Decisions block of `scripts/masters/recipes/dinner.ts`.

- **Plate:** the porcelain plate master (clearcoated porcelain, with a gilt band on the rim that has its own environment at 1.1), 1.6 across as in v1.1. The reveal shows the plate itself, the gilt rim catching the key. The v1.1 perforation row, ink foot line and cream glaze are replaced by the master's own design.
- **Cloche:** the silver cloche master's dome assembly (dome, lip bead, two bands, finial, ring handle) at the plate's scale (`DISH_SCALE` 0.8399). Its own tray is dropped and the plate takes its place.
  - **Dome:** polished silver with a **lathe-polish anisotropy**: 0.3 along the meridians (rotation π/2), roughness 0.2, own environment 0.9, set at load by `finishDish` in `models/dinner.ts`. The softbox stretches into soft vertical highlight bands with darker reflections between them. An isotropic finish of the master's near-white silver read pale and frosted in the cream studio. The first ship (0.5 at roughness 0.18) read as a ribbed dome of light and dark gores; v1.2.1 settled on 0.3 / 0.2.
  - **Bead, bands, finial and handle:** softened to roughness 0.12 at own environment 0.8, so they shade like metal rather than pale lines.
  - The v1.1 coral knob is gone with the master's ring handle.
- **Motion:** the beats and durations are the same. The reveal is handle-led (the guest-side rim tips up first). Every set-down lands the leading rim first, and the ≤ 1° rim rock follows on, C1. A change of mind rewinds the showing outcome along its own path instead of cutting (see `docs/spec-revisions.md`).
- **Known gaps:** at stage size the empty well is a near-flat white disc, and the gilt rim carries the reveal. The studio environment has no dark horizon, so the dome shows soft bands rather than room reflections. Inside the bin, the ring handle shows briefly after the dome has gone.

### Business (v1.2): the all-access badge and the RFID/NFC reader

- **Object:** the badge master at ×1.5: a printed card in a clear vinyl holder (0.744 × 1.164) with side clips, a chrome D-ring, swivel and **closed snap hook**, and a woven blue strap. The reader master is at ×0.72 (0.92 × 1.37): a brushed-steel wedge body on a plinth, with a black glass face leaning 11.6°, a window gasket, an LED bar with its glow and an NFC mark. One stage unit is 76.3 mm: the printed card's width, 0.472 master units at ×1.5, is a CR80 card's 54 mm short side.
- **Materials of note:**
  - The clear holder is drawn as a clear sheet: no diffuse, its reflection added at full strength, the master's roughness 0.03 and specular kept, and 14 % dimming. The recipe's `transmissionToAlpha` 0.35 is in the GLB, but a plain alpha blend read as a white veil.
  - The chrome is polished in the recipe (roughness 0.1, base 0.6), so it reads as metal.
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

Source of truth: `src/render/studio.ts` (key, fill, sweep, cookie, shadow filter, Low-tier detail), `src/render/lighting.ts` (L's hemisphere fill, kept under the premium key), `src/render/stage.ts` (shadow casters, backdrop wall), `src/render/camera.ts` (framing), `src/render/materials.ts` (`DIRECTIONS.L2`), `src/render/print.ts` (printed art, holo foil), `models/badgePremium.ts`, `models/cakeParts.ts`, `models/recordPremium.ts` + `models/recordParts.ts`, `models/disposalBin.ts`, `models/shadowProxy.ts`, `models/sportsPremium.ts` + `models/sportsParts.ts`, `src/render/ballMaterial.ts`, `models/dinnerPremium.ts` + `models/dinnerParts.ts` (v1.1; since v1.2 Dinner is `scripts/masters/recipes/dinner.ts` + `models/dinner.ts`, and `dinnerParts.ts` is deleted), `src/ui/shell.css` (stage finish).

### Studio (all scenes)

| Setting | Value |
| --- | --- |
| Camera | Orthographic 3/4, unchanged (az 20°, el 15°) |
| Key | Spot `#FFF1DE` × 15, decay 0, from (−4.2, 7.8, 5.4), angle 0.6, penumbra 0.7 — late-afternoon sun. L's directional key is removed from the scene (no light slot) |
| Gobo | Procedural palm cookie (768²): far layer blurred and faint, near layer of tapered drooping leaflets, crisper. Fronds enter from the edges; objects sit in open sun |
| Soft shadows | PCF 1024², radius 6, patched to 16 fixed Vogel taps (no dither noise, no extra draw calls) |
| Shadow casters | A mesh skips the shadow pass when its local (unscaled) geometry bounding box is thinner than 0.015 units or no larger than 0.05 units (1.5 mm and 5 mm at the manifest's stage-decimetre scale): decals, prints and small hardware. Lanyard strands skip only this size test; transparent meshes and `*_shadow` contact planes never do. Two explicit flags override the size test: `userData.noShadowCast` opts a mesh out, and `userData.shadowProxy` marks an invisible low-poly stand-in that casts for the meshes it replaces (and receives nothing) |
| Fill / bounce | **Combined fill, the approved look:** L's direction hemisphere, sky `#F7F3EE` / ground `#CFC4B3` × 0.9 (`lighting.ts`, left on under the premium key), plus the premium cool sky fill `#E3E9EF` / `#D6C7B2` × 0.3 (`studio.ts`). Bounce `#FFE8D2` × 0.14 |
| Environment | L's procedural softbox PMREM at 0.52 (reflections for glass, clearcoat, chrome) |
| Backdrop | Seamless cove sweep `#EAE3D6`, limewash plaster: tileable relief normal (multi-octave + pits) and matching albedo mottle, 512², repeat 2.2. Under the warm key it renders as about `#F8E4C8` (measured from the posters); the HTML stage colour matches that, so poster, fallback and canvas agree. The wall sits at z −3.2 unless a scene moves it (see Birthday) |
| Finish | CSS over poster and canvas: warm radial vignette (multiply, 12%) + fractal film grain (overlay, 16%). It adds nothing to the WebGL frame. Its cost in the browser compositor (two blended layers over a live canvas) has not been measured on desktop or on a phone. Hidden in forced-colours |
| Low tier | Shadow map off (and its target freed) and plaster normal map off; contact shadows remain. The gobo stays as a 192² copy (0.14 MiB, the 768² original freed): the cookie also dims and warms the key on every object, so dropping it brightened and cooled Low by 35–90 % per channel (measured at checkpoint 4). With the small cookie, object bodies at Low stay within 5–10 % of Normal. What the missing shadow map takes away is cast shadows: the Birthday stand's pedestal reads about 50 % brighter without the tray's shadow, and the Party and Birthday floor shadows go (contact shadows remain). At DPR 1 on small stages the Sports net's cords fall below a pixel and read as dashes. Library materials simplified as before (no normal maps or sheen). Environment response 0.8 applies only to materials with their own environment (the cloche; since v1.2 every imported metal); the rest follow the scene-wide 0.52 |

### Normal tier (revised)

The premium studio's real-time soft shadows (one 1024² map, 16-tap PCF, gobo cookie) and physical materials (clearcoat, sheen, anisotropy, the holo foil) are the revised Normal-tier definition. Master §9 defines Normal as "simple PBR; baked contact detail; no postprocessing". Its revision clause covers budgets set at the Business milestone, so this is recorded as an explicit revision of the tier itself, with the reasons: the WebGL frame still has no postprocessing (no extra passes); the CSS vignette and grain are compositor layers outside the renderer, their cost unmeasured and listed for the phone session. This follows following the premium look Surya approved at checkpoint 2b. It is pending phone measurement on the reference device (iPhone 17 Max, Safari). If Normal misses the frame-interval target there, the quality monitor drops to Low (defined above) as it would for any tier.

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

- Studio, every scene: palm cookie 768², no mipmaps, 2.25 MiB; plaster normal + albedo 2 × 512², 2.67 MiB. Total 4.9 MiB.
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
