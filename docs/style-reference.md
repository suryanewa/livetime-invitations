# Style reference — direction L2 "Satin Enamel · premium" · v1.1

**v1.1 (2026-09-29).** Surya approved the premium pass at checkpoint 2b ("go with premium… high fidelity and masterful texturing, lighting and scene work"), with the orthographic camera and the two-tier cake. L2 keeps L's identity (palette, silhouettes, one enamel insert, the perforation row) and upgrades surfaces, construction, light and finish. v1.0 (below) still defines the palette and object rules unless a v1.1 rule replaces them.

Source of truth: `src/render/studio.ts` (key, fill, sweep, cookie, shadow filter, Low-tier detail), `src/render/lighting.ts` (L's hemisphere fill, kept under the premium key), `src/render/stage.ts` (shadow casters, backdrop wall), `src/render/camera.ts` (framing), `src/render/materials.ts` (`DIRECTIONS.L2`), `src/render/print.ts` (printed art, holo foil), `models/badgePremium.ts`, `models/cakeParts.ts`, `models/recordPremium.ts` + `models/recordParts.ts`, `models/disposalBin.ts`, `models/shadowProxy.ts`, `models/sportsPremium.ts` + `models/sportsParts.ts`, `src/render/ballMaterial.ts`, `models/dinnerPremium.ts` + `models/dinnerParts.ts`, `src/ui/shell.css` (stage finish).

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
| Low tier | Shadow map off (and its target freed), gobo cookie off, plaster normal map off; contact shadows remain. Library materials simplified as before (no normal maps or sheen). Environment response 0.8 applies only to materials with their own environment (the cloche); the rest follow the scene-wide 0.52 |

### Normal tier (revised)

The premium studio's real-time soft shadows (one 1024² map, 16-tap PCF, gobo cookie) and physical materials (clearcoat, sheen, anisotropy, the holo foil) are the revised Normal-tier definition. Master §9 defines Normal as "simple PBR; baked contact detail; no postprocessing". Its revision clause covers budgets set at the Business milestone, so this is recorded as an explicit revision of the tier itself, with the reasons: the WebGL frame still has no postprocessing (no extra passes); the CSS vignette and grain are compositor layers outside the renderer, their cost unmeasured and listed for the phone session. This follows following the premium look Surya approved at checkpoint 2b. It is pending phone measurement on the reference device (iPhone 17 Max, Safari). If Normal misses the frame-interval target there, the quality monitor drops to Low (defined above) as it would for any tier.

### Checkpoint 3 decisions (2026-09-29)

Surya approved Party (premium record player) and Birthday (two-tier cake and the shared charcoal pedal bin), so the disposal treatment is locked for Dinner. The disposal scenes may frame their object below 60 % of stage width (Birthday 52 %), because the camera fits the whole literal cake-to-bin path. Sports and Dinner get the same premium treatment as the first three scenes.

### Surfaces

- **Laminated print** for cards: printed art (canvas, original geometric glyphs, no fonts), clearcoat 1 / 0.1. White PVC core on the card edge (`mat_edge #F1EDE6`).
- **One delight material per object**, used once: the badge's holographic seal (metallic rainbow sunburst whose hue rotates with viewing angle, so colour sweeps as the card swings).
- **Glass faces** (`mat_body_ink`): near-black, clearcoat 1 / 0.06, set into machined pockets with a polished champagne bezel (`mat_bezel #D8CDBA`, metal, r 0.18).
- **Hardware**: bright chrome (`mat_metal`, r 0.14), turned/cast forms; static parts that share a material are merged into one draw.
- **Buttercream / glaze / ceramics**: sheen on frosting, clearcoat on glazes and the cobalt stand.
- **Status light** (Business): the window lights green/red with a **dark glyph** (LED-display contrast) and a coloured point-light spill that tints the card at the scan beat. No halo or bloom (Master §5). The light always exists (intensity 0 idle) so status changes never recompile shaders.
- For L2 these replace v1.0's "no clearcoat, no mirror chrome".

### Construction

SDF modelling (surface nets, gradient normals, Newton projection) for continuous-fillet housings, decimated by meshoptimizer at export only; profile sweeps along plan paths with analytic normals (`models/recordParts.ts`) for the record player; parametric lathes elsewhere. Continuous fillets, crisp reveals, real drilled holes, shadow-gap feet.

### Party: premium record player (M3)

- **Swept-profile body:** a cream satin shell with a continuous top fillet, built from profiles swept along a rounded-rectangle plan. Fillets shade smoothly, unfilleted corners stay crisp, and neighbouring sweeps share contours, so the body is watertight.
- **Coral plinth with one perforation strip:** a coral enamel plinth with a soft undercut into a recessed shadow-gap foot, separated from the shell by a crisp V reveal. One row of 25 whole dots (pitch = strip height) runs along it and stops one empty pitch before the status lens, so the lit status reads as the row's last dot switching on.
- **Knurled controls:** a coral anodised knurled speed knob, 33/45 keys (glossy ink caps in chrome trims; 33 pressed with a coral dot) and a knurled counterweight on the gimballed chrome tonearm, which has a coral finger lift.
- **Woven lid lining:** a framed thin-walled dust cover lined with woven grille cloth (`mat_lid_fabric #34363A`, weave normal, sheen), notched over two chrome hinge barrels on the pivot axis. The open lid shows a tactile face instead of bare plastic.
- Glossy vinyl with an anisotropic groove sheen, printed asymmetric labels (coral and cobalt presets), brushed platter on a rubber mat.
- 17 draw calls and about 23.9k visible triangles from the builder (`party.glb` 234.9 KiB gz).

### Birthday additions (M4 first pass)

- **Shadow proxies:** the dense cake body, drip glaze, pearls, turned stand and candles carry `noShadowCast`; two invisible low-poly proxies (`tray_shadow_proxy`, `cake_shadow_proxy`) cast their shadow instead. The shadow keeps its shape at a fraction of the shadow-pass triangles.
- **Per-scene backdrop wall:** a scene can push the cove wall back (`studio.wallZ`). Birthday uses z −4.3 so the bin's slide and the carried cake never meet the cove.
- **Point-based framing:** a scene can supply silhouette sample points along every authored path (`framePoints`). The orthographic fit uses them instead of bounding-box corners, which overstate round objects (a disc's box corners project about 28% wider than the disc).
- **Shared charcoal bin:** a charcoal powder-coated pedal bin (`mat_bin #34373A`, r 0.48, clearcoat 0.25) with an ink liner bucket and foot ring and a butterfly lid of two turned brushed-metal half-dome flaps hinged at the sides (about 100° open), so the open bin stays low in frame. It is sized so the cake with its candles drops fully below the rim before the flaps close: the disappearance is real occlusion, never a fade. Dinner's decline will reuse it (`assets/shared/disposal-bin.glb`).
- **Coral pedal:** the bin's one enamel insert (`mat_accent`), turned off the front so it shows at the camera angle.

### Sports: premium hoop and ball (M5, signed off by a critical reviewer at checkpoint 4)

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

- **Cloche:** satin brushed metal (`mat_cloche`, roughness 0.3, anisotropy 0.7) with its **own copy of the stage environment at 1.1** (`SurfaceSpec.ownEnv`, assigned by `Stage.assignOwnEnvironment`). In r186 a material lit by `scene.environment` takes the scene-wide 0.52 and ignores its own intensity, which rendered the dome gunmetal. It reads as satin silver and still never mirrors the room. The polished lip bead uses `mat_cloche_polished` (roughness 0.18); the knob is the coral enamel insert.
- **Plate:** cream glazed ceramic with a softened clearcoat (0.4 / 0.3). A sharp clearcoat aliased into a dashed line along the thin rolled rim at phone DPR. The whole-dot perforation row runs on the rim wall, and an ink foot line gives the silhouette.
- **Layout (checkpoint 4):** the bin stands behind the dish, a little left, at (−0.5, 0, −1.9), and slides in from the left margin behind the plate. The uncovered cloche rests behind-right at (0.8, 0, −1.33), so the food stays in front of it. The reveal leans the cloche along its path. The open bin's flaps (2.27 high), not the dish, set the fixed frame. This is the most compact literal disposal found in a search over bin and cloche placements (see the framing row in `docs/qualification.md`).
- **Delight:** the reveal and the material response. The sub-spec excludes steam, particles and garnish motion.

### Budgets (per scene, measured incl. the shadow pass)

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

- **Badge (business).** Cream card with ink keyline edges; cobalt colour panel; cream personal-ID print (photo window + portrait glyph + three name lines, merged into one mesh); coral stripe; whole-dot row on the lower border. Satin-metal clip with anodised crimp on a **J-hook**: back leg, horizontal run through the card slot, and a gate hinged at the run's front corner. Open, the gate points forward in line with the run so the vertical card slides straight on; it then swings up clear of the card face. The attach is collision-free by construction and covered by a unit test. Woven ink lanyard that leaves the clip along the clip's up axis.
  - **Presets:** `light` = cream border. `dark` = ink border. Both keep the cobalt panel, cream print and coral stripe, so card identity survives either template.
- **Scanner (business).** Cream housing on a recessed shadow-gap foot. Ink reading face at 46°. Contactless target: two bold printed rings plus a centre dot (≈5:1 on the pad) inside a card-target keyline. A separate indicator window beside the pad (idle `#6E7175`, ≈3:1 on the faceplate) that lights green `#3BE08A` with a check glyph, or red `#E53E3E` with a minus glyph. A perforation collar row on the front.
- **Cake (birthday).** Drip-glaze cake on the cobalt enamel tray with a cream perforated band; piped bead base border; A's coloured candles; soft view-dependent flames at 82% scale. Budget ≈26k triangles before the bin.
- **Covered dish (dinner).** A's brushed satin-metal cloche with an anodised coral knob on a cream glazed plate; the perforated band runs on the plate's rim wall.
- **Record player (party).** Cream body; coral plinth band carrying the perforation row; brushed-metal platter and tonearm; warm-grey (`mat_body_alt`) framed lid on visible hinge barrels.
- **Basketball (sports).** Rim inner diameter ≈1.6× the ball's; open lattice net; pole behind the board on a bracket arm; outlined (never filled) coral target; perforation row along the board's lower frame. Full production proportions are settled in Milestone 5.

## Shadows

Two-layer contact shadows sized from each object's footprint: a soft spread (≈1.1–1.6× footprint, opacity 0.5, shows past the silhouette at the 15° camera) and a tight contact line (≈1.04×, opacity 0.4–0.5). Both fade with height. Layers under 1.2% opacity switch off, so a hanging card leaves no smudge.

## Status and interface

HTML stays authoritative. Accept `#176B42` + check, Decline `#A62D36` + minus. The accent `#FF714A` is never used for UI text, focus rings or button outlines on white (≈2.7:1); the focus ring is `#2F54C9`. System sans only.

## Measured at style lock (study models, M2 Pro, Chrome 153)

| Model | Triangles | Draw calls |
| --- | --- | --- |
| Cake + tray (L) | 25,724 | 16 |
| Keycard + lanyard + scanner (L) | 10,898 | 23 |

The budget is ≤60k triangles and ≤40 draw calls per scene. These are desktop measurements of study models, not phone evidence.

## Carried into the Business scene as named experiments

1. **Card damping:** settle under 0.5° within 0.9 s from an 8° release, at most one visible overshoot at 390 px / DPR 1.5.
2. **Lanyard flex:** the lower strap visibly lags the card; no stretch or clipping; stays inside the framing clearance at 320 px.
3. **Indicator coding:** glyph-coded (≥10 CSS px at 288 px); distinguishable in greyscale and under deuteranopia; no clipping to white.
4. **Scanner and badge recognition:** a blind reviewer names the scanner a card reader and the badge a personal ID at 288 px.
5. **Signature stability:** the highlight count in the perforation band changes ≤5% between consecutive settle frames at DPR 1 and 1.5.
6. **320 px sign-off:** full frames in the ready, accepted, declined and static states with 44×44 targets, visible focus, ≥4.5:1 status text and ≥3:1 object boundaries.
