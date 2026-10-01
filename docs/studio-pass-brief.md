# Brief: the studio pass (v1.3) — light the masters like the masters

Owner's verdict (Surya, 2026-10-01, auditing v1.2): *"Why do these look so cartoonish compared to the original renders?"*
The models are right (the same GLBs render photographically in the Models viewer); the invitation showcase still lights,
frames and finishes them like the stylised v1.1 objects. Fix every cause below. Budgets stay waived.

Project: `/Users/suryanewa/Developer/projects/livetime-invitations` (branch `main`). Read `docs/new-models-brief.md`
(the v1.2 job and owner decisions), `docs/style-reference.md` (v1.2 section + the Studio table), `src/render/stage.ts`,
`src/render/studio.ts`, `src/render/lighting.ts`, `src/render/camera.ts`, `src/render/createRenderer.ts`, `src/ui/shell.css`
(the finish block), `scripts/capture.ts`, and `docs/scenes/<scene>-v1.2.md` for what each scene agent compensated for.

## The reference look

The Models viewer (`~/Documents/Creative/Design/Livetime/Models/scan-to-cad-rebuilds`, served at http://localhost:8123)
renders each master with a **perspective** camera, a physically plausible procedural room environment at full intensity
(window, skylight, lamp, dark furniture strokes: `candidates/final/env.js` is the winning rig, API
`export default async ({THREE, renderer}) => ({ texture, exposure?, toneMapping?, background?, sun?, envIntensity?,
envIntensityMetal?, decorate? })`), Khronos PBR Neutral tone mapping, exposure 1.15, a neutral grey stage. Reference
stills of every master in that viewer: `/private/tmp/claude-502/-Users-suryanewa-Documents-Creative-Design-Livetime-Models/0a10c895-e721-47a1-9000-06cba54d16c5/scratchpad/master-renders/<master>/B-hero.png` and `B-close.png`.

## Causes, each to be fixed

1. **Orthographic camera.** `Stage` defaults to `createStageCamera()` (orthographic, az 20°, el 15°,
   `fitCameraToBounds` with the scene's `framePoints`). A long-lens perspective path exists (`projection: 'perspective'`,
   `fov 18`, `fitPerspectiveToBounds`, used by `src/demo/lookdev.ts` "premium-persp") but fits only the bounds box, not
   `framePoints`, and the controller always creates `{ premium: true }` (orthographic). → Make perspective the default, keep
   the shared azimuth/elevation, fit the projected `framePoints` (and the bounds when a scene has none) with the same 8 %
   clearance, so every authored path stays in frame; pick the focal length that keeps v1.1's composition (lookdev used fov 18).
   Choreography that reads screen-space from `CAMERA_ANGLES` (Sports airball offset, Dinner transfer pacing, the Sports
   `SEAM_FRAME` test) uses the view direction, which does not change.
2. **A studio built for cream satin toys.** Premium stage = `createStudioRig` (procedural softbox PMREM, `scene.environment`)
   with `scene.environmentIntensity = 0.52`, plus `createPremiumStudio`: one warm spot key `#FFF1DE × 15` with a
   **palm-frond gobo cookie**, hemisphere + sky fill, a peach limewash **plaster cove sweep** `#EAE3D6` that renders about
   `#F8E4C8`, 16-tap PCF shadows. Imported metals needed `ownEnv 1.1` just to read as metal. → Replace with a physically
   plausible rig at full environment intensity (1.0): real reflections for brushed steel, chrome, vinyl, glass, silver,
   laminate; a soft key with the real-time shadow kept (the shadow map and contact shadows are good); no gobo unless a judge
   prefers a faint one; exposure/tone mapping tuned once for all five scenes (NeutralToneMapping stays; exposure is free).
   `ownEnv` then becomes 1.0 (or is removed).
3. **The backdrop and the stage token.** The stage colour is part of the interface (`--lt-stage: #f8e4c8` in
   `src/ui/shell.css`, `PREMIUM_STAGE_COLOR` in `src/render/stage.ts`, poster cross-fade, the text fallback, the collection
   thumbnails' fill): poster, canvas and CSS must agree. → Whatever backdrop the winning rig has, measure its rendered colour
   (mean of the empty backdrop at the stage's centre) and set both tokens to it; keep `docs/style-reference.md`'s statement
   true. Two directions are in play — the owner has not chosen: (a) the warm Livetime peach look, lit properly; (b) a neutral
   studio like the Models viewer. Build both as rigs and let the judges and the owner compare (section "Rigs").
4. **Grades the scene agents added to fit the peach stage** (all compensations; remove them and let the masters' materials
   stand under proper light; keep only what a judge then proves still necessary):
   - Sports: `LEATHER_GRADE` colour multiply on the ball (`models/sports.ts`); the cream variant retuned to ivory is fine.
   - Party: `PLINTH_TONE` baseColorFactor on the brushed steel (40 % chroma; `scripts/masters/recipes/party.ts`),
     `LID_LOOK` (satin outer coat replacing the master's clearcoat; the interior split with baked occlusion may stay if it
     still helps), `SPINDLE_LOOK` (turned grey instead of the master's chrome) in `models/recordPlayer.ts`; the **label**:
     v1.1's quarter wedge and butter sliver painted into the print (`labelPrint` in the recipe) — use the master's own
     `paper_label` print, recoloured for coral/cobalt; if the accept spin then fails to read, add the smallest asymmetric
     mark that fixes it (a small off-centre dot or the master's own art), not a wedge.
   - Dinner: `DOME_ROUGHNESS` 0.2 / `DOME_ANISOTROPY` 0.3 "lathe polish" replacing the master's polished map
     (`models/dinner.ts`): revert to the master's polished silver and judge it under the new environment.
   - Birthday: the vanilla body darkened to `#E0D3BF` for form (recipe variants): return to the master's ivory and judge.
   - Business: check `models/business.ts` for colour or roughness overrides on the master's materials and remove them too.
5. **CSS finish.** `.lt-stage::before` (warm radial vignette, multiply 12 %) and `::after` (fractal film grain, overlay
   16 %) in `src/ui/shell.css` sit over poster and canvas. → Remove both (keep the forced-colours rule harmless).

## Infrastructure to build first (one agent), so rigs can be compared like for like

- A **rig module** interface in `src/render/rigs/`: a rig builds the environment texture (PMREM) and the lights, declares the
  backdrop (sweep colour/material or none), exposure, tone mapping, whether it has a gobo, shadow settings, and the CSS
  stage colour it measured. The current premium studio becomes rig `v1.1` (baseline for comparison). Rigs register by
  file through `import.meta.glob('./rigs/*.ts', { eager: true })` so designers never edit a shared index. The stage takes
  a rig; the showcase accepts `?rig=<name>` on localhost only (as the Models viewer accepts `?env=`); the controller's default
  stays the production rig.
- `pnpm capture rigs <baseUrl> [rig,…]`: for every rig (or the listed ones) and every scene, render the guest-ready and
  accepted stills (both presets where they differ) at 720² through the real stage, into `outputs/rigs/<rig>/<scene>-<preset>-<pose>.png`,
  plus one contact sheet per rig (`outputs/rigs/<rig>/sheet.png`: five rows × up to four stills) and a cross-rig sheet per
  scene. The capture must not write into `assets/` (Vite reload).
- A backdrop-colour measurement (`pnpm capture stagecolor <baseUrl> <rig>` or part of `rigs`): render the stage with no
  object and print the mean sRGB of the central 20 %; the integrator uses it for the tokens.
- Perspective camera with `framePoints` support (cause 1), the CSS finish removed (cause 5), the grades removed (cause 4),
  with every test updated to the new numbers (`pnpm typecheck && pnpm test` green) and committed on `main`.

## Rigs (four designers in parallel, one rig each, own worktree + dev server)

Each designer writes `src/render/rigs/<name>.ts` only (plus `docs/rigs/<name>.md` with the reasoning and the sheet), iterates on
all five scenes' stills with `pnpm capture rigs`, and commits on their branch. Directions:
- `livetime-warm`: the warm Livetime peach/plaster identity kept, but lit physically — a large soft daylight key through a
  window, a bright overcast sky, warm floor bounce, full-strength environment with distinct light shapes for the metals,
  the plaster sweep kept (or a cleaner painted cove), stage colour measured.
- `neutral-room`: a port of the Models viewer's `candidates/final/env.js` interior (window, skylight strip, lamp, dark
  furniture strokes) with a neutral greige cove, PBR-Neutral tone mapping, exposure ≈ 1.15.
- `product-studio`: a classic three-softbox product set on a white-to-light-grey cyclorama: large key softbox, fill panel,
  rim strip, dark gradient flags for metal contrast; crisp, catalogue-like.
- `daylight-table`: a tabletop by a sheer window — cool window key, warm wood-toned table bounce, light grey wall, soft
  shadows; the most "photograph of an object on a desk" of the four.
Every rig must: keep the real-time soft shadow from a key light; have `scene.environmentIntensity` 1.0 (metals and glass must
reflect something with shape); fit all five scenes (the airborne ball, the lifted cloche, the swinging card, the carried
cake all stay lit and readable); keep Low tier working (`setShadows`, `setLowDetail`); be deterministic (seeded, no
downloads); and report its measured stage colour.

## Judging and shipping

Three independent judges score each rig on all five scenes (realism vs the master renders; metals/glass/vinyl reading as
their materials; the beats still reading; fit with the interface — warm-white page `#FBFAF7`, white card, olive-ink text;
artifacts). The winner ships as the default; the others stay as `?rig=` options for the owner to compare. The integrator
then regenerates posters and collection thumbnails (`pnpm capture <scene>` ×5), sets the stage tokens to the measured
colour, updates tests (posters, framing, any that encoded the grades), re-measures perf/timing/browser suite, writes
`docs/style-reference.md` v1.3 (the studio pass: what changed and why, superseding the v1.1 Studio table), updates
`docs/qualification.md`, `docs/spec-revisions.md`, `docs/scenes/*.md` where grades were removed, and `docs/RESUME.md`.
Then an adversarial reviewer checks the stills against the master renders and the owner's complaint, and a fix pass follows.
