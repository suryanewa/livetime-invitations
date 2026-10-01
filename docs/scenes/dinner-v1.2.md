# Dinner v1.2: the cloche and the clean plate on the scan-to-CAD masters

Owner's direction (Surya, 2026-10-01): same beats, higher fidelity, the new models, **no food**. The scene is the
porcelain plate with its gilt rim (`dinner-plate.glb`) and the silver cloche's dome assembly (`silver-cloche.glb`
minus its tray). Recipe: `scripts/masters/recipes/dinner.ts`; contract: `models/dinnerContract.ts`; rig:
`models/dinner.ts`; choreography: `src/scenes/dinner/sequences.ts`.

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
- **Silver.** Every silver part keeps its master material renamed `cloche_*` with its own environment. The dome's
  master roughness map is near-uniform 0.09–0.13; at that polish the dome showed the studio softbox as hard
  rectangular windows (rendered and compared: master map, 0.12, 0.16, 0.18, 0.20 at env 1.35–2.0). The dome is
  set to a uniform roughness 0.20 at load (`finishDish`, see gaps) with its own environment at 1.35: soft highlight
  bands, no hard gobo or window shapes, and enough contrast to read as metal. Higher env (1.6–2.0) whitened the
  dome but flattened it towards frosted ceramic, so 1.35 stays. The bead, bands, finial and handle keep the
  master's burnished, turned and buffed values at ownEnv 1.1. The gilt rim catches the key on the reveal.
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
- **Host.** Unchanged path (preparatory rise, align and lower through `SAFE_SKIRT` at 0.60 s without stopping); the
  poised lean now eases out about the landing rim, so the cover touches its leading rim at 0.84 s, the back comes
  down by 0.90 s and the rim rock follows into guest-ready.
- **C1 at every contact.** The set-down's θ arrives at exactly the rock's starting angular rate, so tilt, plan
  position and height are C1 at every beat boundary (1 ms velocity test); only the height may kink where the rock
  passes level (it changes the rim it rocks on, a rigid contact).
- **Decline** keeps its v1.1 path: the covered dish as one unit, up–across–down into the bin, flaps closing once the
  handle is below the rim.

Verified by looking: `outputs/dinner/` stills and every frame strip of host, accept, decline and change (the
change clip cuts to the covered dish once the cover is aside, as v1.1 did).

## Export report (`pnpm models dinner`, deterministic: two exports, identical SHA-1 576f0c31…)

```
triangles 146,944 · draw calls 6 (+ 2 shadow proxy, 5,277 tris, shadow pass only) · 19 nodes
textures 1 · 5.3 MiB as RGBA8 + mips
  1024×1024 webp 6 KiB  metallicRoughnessTexture of cloche_dome
GLB 3412.5 KiB raw · 1963.0 KiB gzip
contract nodes found (10), missing: none
```

Frame cadence (`pnpm capture perf dinner`, M2 Pro, 390×844 @3x, Normal tier): p50 16.7 ms, p99 16.8 ms, max
16.8 ms, 0 frames over 50 ms over 902 frames (the 4× CPU simulation is the same).

## Known gaps

- **Roughness above a map.** The recipe's material policy can only scale a roughness map down (glTF factor × map),
  so the dome's uniform 0.20 is set at load by `finishDish` (models/dinner.ts), which also frees the map. The map
  still travels in the GLB (6 KiB). A recipe option to drop a texture slot would move this into the export.
- **Capture plan.** `scripts/capture.ts` (shared) still lists Dinner's two `dish` presets, so a capture writes
  `capture-pasta-*` / `capture-vegetables-*` stills and `*-vegetables` clips that are identical to the first set,
  and stages per-dish posters. This pass ran it with `CAPTURE_STAGE_ONLY=1` and installed the four posters as
  `shared-*` by hand (pasta and vegetables were byte-identical). A plain `pnpm capture dinner` would copy
  `pasta-*` / `vegetables-*` posters back into `assets/`; the capture plan should become one preset with all
  poses shared.
- **Studio environment.** The stage environment has no dark horizon, so the polished dome reads as bright silver
  with soft highlight bands rather than the master viewer's room reflections; raising its environment further
  flattens it. A per-scene environment is a stage (shared) change.
- **Rock on a slope.** The seated cover's rock is computed as a rock on a flat surface about the bead's lowest ring;
  on the plate's coupe slope the far side dips by at most 1 mm into the 1 mm surface bins (tested), invisible at
  the stage's scale.
- **`study.html` / gallery thumbnails** (`src/demo/*`, shared) were not touched; the collection thumbnail
  `assets/ui/collection/dinner.webp` is the new guest-ready render.
