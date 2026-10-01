# Brief: the scan-to-CAD rebuilds become the invitation objects

Owner's request (Surya, 2026-10-01): *"Update each interaction so they use our new models. I want the animations to be
buttery smooth and the same conceptually, but higher fidelity with the physics and our new models."* Budgets (GPU memory,
cold-load size, triangle/draw-call caps in `docs/qualification.md`) are **not a constraint for this pass** — report what we
ship, do not trade fidelity for them.

Project root: `/Users/suryanewa/Developer/projects/livetime-invitations` (pnpm 11, Node 24, three r186, Vite, Vitest,
Playwright on the installed Chrome). Read `README.md`, `docs/asset-manifest.md` (conventions), `docs/style-reference.md`
(studio, what the scenes look like today) and `src/core/sequence.ts` (the scene contract) before touching anything.

## The new models (masters)

Eight realistic PBR objects rebuilt from Meshy scans as clean geometry with textured materials. Copied into
`models/masters/*.glb` (sources and generators: `~/Documents/Creative/Design/Livetime/Models/scan-to-cad-rebuilds`, see its
README/PROCESS). All are y-up, centred on the origin (bounding-box centre), in **scan units** (about 1.9 units tall) — NOT in
the app's stage units. Each must be scaled, oriented and re-pivoted into the scene contract.

| Master | Scene | Nodes / meshes / tris | Materials (names in the GLB) | Textures | Size (scan units) |
|---|---|---|---|---|---|
| `basketball.glb` | Sports (ball) | 2 / 1 / 81k · one mesh, one material (no name) · UV0 cube-face atlas, UV1 seam distance | one PBR: baseColor + ORM (R occlusion, G roughness) + normal, clearcoat 0.2/0.4 | 3 × 3456×2304 (jpg, jpg, png) | sphere r 0.9436, carved seam grooves |
| `basketball-hoop.glb` | Sports (hoop) | 38 / 34 / 228k · `board` (board-frame, board-face, target-band, board-back), `rim` (rim-ring, bracket-plate/-saddle/-arm-l/-arm-r, hook-0..9, bolt/nut/washer-0..3), `net` (net-strands, net-loops, net-knots) | frame, board-face, target-paint, rim-paint, steel, rope (clearcoat, sheen, texture_transform) | 13 small (128²–512²) | 1.834 w × 1.9 h × 1.13 d; **wall-mount mini hoop, no pole or stand**; +z toward the player |
| `vintage-turntable.glb` | Party | 86 / 75 / 97k · plinth, feet, `platter_assembly` (platter, rubber_mat, record_edge, record, record_label, spindle), `tonearm_base`, `tonearm_gimbal` (counterweight parts), arm_tube, headshell, cartridge, dust cover (hinged, 27.6° lean), knob, keys | brushed_steel_plinth, rubber_feet, machined_aluminium, black_anodised, rubber_mat, vinyl, paper_label, chrome, cartridge_plastic, smoked_lid_plastic (anisotropy, clearcoat) | 5 (3 × 1024², 2 × 8192×4 LUTs) | 1.855 × 0.926 × 1.43 |
| `birthday-cake.glb` | Birthday | 31 / 26 / 217k · cake_stand, tier_bottom + piping parts, tier_top + piping parts, `candle_1_pink … candle_6_blue` (own transforms), candle_wicks, candle_flames | glazed_ceramic, buttercream, buttercream_piping, buttercream_rosette, sugar_pearl, candle_wax_pink/blue, candle_wick, candle_flame (clearcoat, iridescence, emissive_strength) | 4 tiny LUTs | 1.52 × 1.9 × 1.52; two tiers on a turned stand, six twisted candles |
| `dinner-plate.glb` | Dinner (plate) | 3 / 2 / 60k · `plate`, `gilt-rim` | two unnamed: porcelain (clearcoat) and a metal gilt band | none | r 0.952, 0.147 tall; no food on it |
| `silver-cloche.glb` | Dinner (cover) | 8 / 7 / 141k · `tray`, `dome`, dome-lip, dome-band-low/high, finial, `handle` | silver-dome-polished, silver-tray-lathe-polished, silver-beads-burnished, silver-handle-buffed, silver-finial-turned (anisotropy, metalness 1) | 2 × 1024² | 1.9 × 1.556 × 1.9; **includes its own tray** |
| `all-access-badge.glb` | Business (card) | 20 / 16 / 157k · `lanyard` (lanyard_strap, lanyard_stitching, lanyard_strap_tape), `hardware` (d_ring, swivel_*, snap_hook_body/gate, gate_pin, gate_trigger), `card_holder` (card_holder_clear, holder_clip_left/right, `card`) | woven_fabric_blue (+stitch, tape), chrome_hardware, clear_vinyl (**transmission + volume + ior**), clip_plastic_grey, card_stock, card_print (2048×1536 print) | 6 | 0.5 w × 1.9 h × 0.15 d (strap hangs straight up from the card) |
| `rfid-nfc-reader.glb` | Business (reader) | 13 / 10 / 14k · `front_assembly` (body, window_gasket, glass, `led`, `led_glow`, nfc_icon_front, front_plate), plinth, `back_assembly` (back_panel, nfc_icon_back) | brushed_steel, gasket_black_gloss, black_glass, **led_emissive, led_glow** (emissive_strength), icon_decal, plinth_plastic, back_panel_matte | 5 | 1.28 w × 1.9 h × 1.07 d; wedge body, front leans 11.6° |

Inspect any of them with `python3 ~/Documents/Creative/Design/Livetime/Models/scan-to-cad-rebuilds/tools/glb.py <file>` (JSON +
image sizes) or with `@gltf-transform/core` (already a dev dependency). The basketball's seam-distance function is
`TEXCOORD_1.x` (0.34 = groove edge); the cake's candles are separate transformed nodes; the hoop's `net` node is the
parent of three strand/loop/knot meshes.

## The app, in the terms that matter here

- **Scene units** are "stage decimetres": a ready-pose object spans roughly 2–2.5 units; y-up, ground at y = 0; origins at
  the natural contact point (`docs/asset-manifest.md`). The shared camera is orthographic, azimuth 20°, elevation 15°,
  fitted to each scene's motion bounds / `framePoints` (`src/render/camera.ts`). Objects should fill the stage as they do
  today (see `outputs/<scene>/capture-*.png` for the current framing).
- **Contracts**: `models/<scene>Contract.ts` fixes node names, pivots and dimensions the choreography relies on. The
  choreography (`src/scenes/<scene>/sequences.ts`) is a pure function of time writing to `*_authored` nodes; `*_secondary`
  nodes hold bounded springs; rigs (`models/<scene>.ts`) add contact shadows, deformers, presets. Keep that architecture:
  **swap the geometry and materials, update the contract numbers, keep (and upgrade) the sequences.**
- **Runtime asset path**: `pnpm models <scene>` runs `scripts/export-models.ts`: code-authored builders → GLTFExporter →
  gltf-transform (dedup, weld, prune, quantize) → `assets/scenes/<scene>/<scene>.glb`. At load the scene fetches that GLB,
  finds its root node, and `bindMaterialsByName` swaps placeholder materials by name from the locked library
  (`src/render/materials.ts`, `DIRECTIONS.L2`); **names the library does not know are left as loaded, textures and
  extensions included.** So imported PBR materials survive untouched, and a master material can be *renamed* to a library
  name (`mat_label_coral`, `mat_frosting_vanilla`…) when a preset must drive it.
- **Presets** (`SceneConfig`): Party label coral/cobalt (+ song), Birthday cake vanilla/cocoa, Sports ball orange/cream,
  Dinner dish pasta/vegetables, Business template light/dark. They must keep working with the new models (how is each
  scene agent's design decision: swapping a texture, a colour factor, a material name, or a second mesh).
- **Studio**: premium sunlit studio (`src/render/studio.ts`): spot key with a palm gobo and 16-tap PCF shadows, hemisphere
  + sky fill, L's PMREM softbox environment at `scene.environmentIntensity 0.52`, NeutralToneMapping. Note from the cloche:
  a metal lit only by `scene.environment` reads gunmetal at 0.52; polished metals want their own copy of the env map at
  ~1.1 (`SurfaceSpec.ownEnv`, `Stage.assignOwnEnvironment`, `userData.ownEnv`). Shadows: meshes thinner than 0.015 or
  smaller than 0.05 units skip the shadow pass; `userData.noShadowCast` opts out, `userData.shadowProxy` marks an invisible
  low-poly caster (`models/shadowProxy.ts`), both travel as GLB extras.
- **Quality tiers** (`src/render/quality.ts`, `MaterialLibrary.setLowDetail`): Low strips normal maps and sheen from
  *library* materials and frees the shadow map. Imported materials are outside the library — add the equivalent for them.
- **Tests**: `pnpm typecheck`, `pnpm test` (Vitest: contracts, choreography continuity at 1 ms, clearances, canonical
  poses — see `tests/<scene>.test.ts`), `pnpm test:browser` (Playwright against the dev server; `BASE_URL=http://127.0.0.1:<port>`
  points it at another server). Update tests to the new geometry; never delete a check without replacing what it protected.
- **Captures**: `pnpm capture <scene> [baseUrl]` renders posters (`assets/scenes/<scene>/posters/*.webp`), review clips and
  the rail thumbnail through the real renderer; `pnpm capture timing|perf` measure. Each capture launches a headless Chrome;
  run one at a time per agent.
- **Docs that must follow the change**: `docs/asset-manifest.md` (provenance rows for the masters: design.inc, original,
  rebuilt from Meshy scans; sizes), `docs/style-reference.md` (a v1.2 section: the objects are now the scan-to-CAD rebuilds;
  the interface, studio and camera are unchanged), `docs/spec-revisions.md` (recorded deviations), `docs/qualification.md`
  (re-measured numbers, budgets noted as waived for this pass).

## Design of the import path (foundation agent builds this; scene agents use it)

1. `scripts/masters/` — a gltf-transform importer with a per-scene **recipe**: which master(s), scale, rotation, offset,
   which master nodes become which contract nodes (rename / reparent / new empty contract nodes with scene-space
   transforms), material renames (to library names) and material policies (transmission → alpha blend with an opacity;
   `ownEnv` for metals; emissive strength), per-mesh decimation ratios (meshoptimizer via gltf-transform `simplify`),
   optional joining of static same-material meshes, texture resize/encode policy (WebP via sharp, keep normal maps
   lossless; cap sizes per recipe — default cap 2048), shadow extras (`noShadowCast`, generated low-poly `shadowProxy`
   from a decimated clone), and a printed report (tris, draw calls, texture MiB, GLB KiB) per export.
2. `scripts/export-models.ts` composes a scene from **both** sources: the code-authored builder (for parts we keep: Sports
   stand, Dinner food, Birthday flames/wisps/bin, Business status window if needed) and the imported masters, merged into one
   document, then the existing dedup/weld/prune/quantize chain. Every contract node name must exist in the output.
3. `models/imported.ts` (runtime): `prepareImported(root, lib)` — flags imported materials, applies `ownEnv` to metals,
   converts transmission if the recipe asked, registers them for `setImportedLowDetail(root, enabled)`; scenes call it after
   `bindMaterialsByName`. The controller's Low tier calls the scene's low-detail hook.
4. The GLTFLoader at runtime already supports every extension the masters use (clearcoat, sheen, anisotropy, transmission,
   volume, ior, specular, iridescence, emissive_strength, texture_transform, EXT_texture_webp, KHR_mesh_quantization).

## Scene mapping and what "same concept, higher fidelity" means

| Scene | Keep from today | New model(s) | Physics / fidelity upgrade (same beats, same durations unless a beat needs more time to read) |
|---|---|---|---|
| Sports | stand (pole, base, arm) from `sportsPremium.ts`; the one-gravity closed-form flights; net keyed deformation | ball master as `ball_mesh` (r 0.25 → scale 0.2649); hoop master's `board`, `rim`, `net` under `hoop_root`, scaled so the rim's inner radius stays 1.6× the ball's; contract (`BOARD`, `RIM`, `RIM_LOCAL`, `NET`, `HOOP_ROOT`) re-measured from the master at that scale | real ball spin on the textured ball; squash-and-stretch on bounce (`ball_secondary` scale, volume-preserving, ≤8 %); the net's three cord meshes deform with knots and loops; rim/board recoil spring when the net tugs; airball unchanged conceptually; cream preset = a second albedo generated from the ball generator (`tools/gen/hybrid.py` in the Models repo, panel colour changed) or a colour remap |
| Party | choreography (record lowered on the spindle, tonearm cue, platter spin, lid close) | turntable master: platter/mat/spindle, record + label (`record_authored` = the master's `record` + `record_label`, pivot at the record's bottom centre), tonearm chain (`tonearm_gimbal` yaw, pitch), dust cover on its real hinge axis | tonearm with gimbal pitch + yaw on the master's pivots; platter spin-up with belt-drive lag; record wobble settle; lid closing as a damped hinge with the master's 27.6° lean; label presets by renaming `paper_label` → `mat_label_<preset>` (fix UVs) or two label textures |
| Birthday | candle placement, flames (code-authored flame shader), breath + wisps, bin disposal | cake master (stand + tiers + piping) as `cake_authored` content; the master's six candles become the placeable candles (three used, or all six placed in two beats), wicks/flames mapped to the flame rig | candles lower with real sockets (positions from the master's candle nodes); flames keep the view-dependent shader; cake carried to the bin with a tiny pendulum lean; presets vanilla/cocoa by renaming `buttercream`/`buttercream_piping`/`buttercream_rosette` to library names or baking two colour sets (see `tools/cake_palette.py` in the Models repo) |
| Dinner | bin disposal, reveal choreography (**no food: Surya, 2026-10-01 — the scene is the cloche and the clean plate only**; remove the pasta/vegetable food and the Dinner preset control from the host panel; `dish` stays in `SceneConfig` for integration compatibility but selects nothing, with one shared set of posters) | plate master as `plate_*` (gilt rim), cloche master's dome assembly (dome, lip, bands, finial, handle) as the cover; the cloche's own tray is omitted (the plate takes its place) unless the agent finds it reads better | cover lift with a little rim rock (already there) plus handle-led tilt; the polished silver reads as silver (ownEnv); the reveal shows the plate itself (gilt rim catching the key), so the lift and set-down carry the beat; the clearance constants that referenced the food (`SAFE_SKIRT`, `FOOD`) collapse to the plate's well |
| Business | lanyard runtime rig (`models/lanyard.ts` strap curves) if it still fits, scanner contact beat, status light, pointer drag | badge master (card in clear holder, D-ring/swivel/snap hook as the clip hardware, grosgrain strap) as the card; reader master as the scanner, its `led` / `led_glow` as the status light (green/red emissive) | card swings on the real swivel; strap follows with the existing lag rig or the master's strap re-parented and bent along the rig's curve; dark template = a second print (derived from the master's `card_print` texture: ink field, same layout) |

## Rules

- Work in your own files: `models/<scene>*.ts`, `src/scenes/<scene>/`, `tests/<scene>*.ts`, `tests/browser/<scene>.spec.ts`,
  `assets/scenes/<scene>/`, `scripts/masters/recipes/<scene>.ts`. Shared files (`scripts/export-models.ts`,
  `src/render/materials.ts`, `src/core/*`, `src/render/*`, `scripts/capture.ts`) are edited only by the foundation agent
  or by explicit instruction; re-read before any edit.
- Deterministic exports: same code, same GLB. No manual edits to GLBs.
- Keep `pnpm typecheck` and `pnpm test` green at every hand-off; add tests for new contract numbers.
- Verify by looking: `pnpm capture <scene> <baseUrl>` then read the stills in `outputs/<scene>/`, and open the showcase.
- Record every judgement call where it is easy to find (a short "Decisions" block at the top of the recipe file).
