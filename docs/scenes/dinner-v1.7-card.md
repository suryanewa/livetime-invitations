# Dinner v1.7: the invitation card under the cloche, and the close-up

Surya, 2026-10-06 (`docs/revisions-v1.7-brief.md`, verbatim): *"The steam under the cloche should reveal an invitation
card with the event name, something like 'You're invited', and the invitee name. The card should be flat on the plate
and then the camera should move so that we're facing the card head-on and it's a close-up."*

Branch `v1.7/dinner-card` (worktree `.claude/worktrees/v17-dinner-card`, port 5701), from `v1.7/integration` at
`c97793c`. Spec-revision drafts **#41** (the card, its print, the bundled face, the data) and **#42** (the close-up as
the accepted pose) are in `docs/spec-revisions.md`, **pending Surya**. Evidence: `evidence/v1.7/dinner-card/`.

This changes Surya's v1.2 decision "cloche + clean plate, no food": the plate now carries the card. Everything else in
Dinner stands: the v1.6 steam (closed; untouched, and its field needs no change), the reveal's 1.5 s, the decline and its
pull-back (#39), the bin, the rig, the lens.

## What was built

### A. The card (`models/dinnerCard.ts`, `models/dinnerContract.ts` `CARD`)

- **A heavyweight landscape card, 10 × 7 cm, 0.6 mm** (0.5926 × 0.4148 × 0.0036 su; 1 su = 16.875 cm), built at runtime
  — no GLB change — and hung by the rig (`rigDinner`) under `plate_authored`, so it rides with the plate, hides with the
  dish (`dishVisible`) and goes into the bin with it on a decline.
- **Placed in the flat well, centred:** its half-diagonal (6.1 cm) leaves 1.6 cm of the 7.7 cm well round its corners,
  so it lies on flat porcelain, never on the coupe's rise. Its underside is 0.05 mm over the porcelain's highest vertex
  under its footprint (`CARD.gap`; checked against the GLB's vertices: none pokes through, none is more than 0.15 mm
  below it). Its top is 5.4 mm over the table.
- **Turned to the shared azimuth (20°)**, so its long side runs across the showcase frame and its print reads upright
  (the print's top is the edge away from the camera).
- **Under the seated cloche, inside the steam's clear layer:** its top is 1.1 cm under the seated dome's rim plane, the
  dome's shell more than 6.7 cm above it, and inside the 5.9 mm clear layer the steam keeps over the porcelain
  (`CLOUD.floor`). The closed field's mean density at the card's top is ≤ 0.3 % of the dome's at τ 0–0.3 s (2.8–2.9 ×
  10⁻³: the clear layer is a smoothstep from the porcelain, not a cut) and exactly 0 from τ 0.6 s (the layer has grown
  past it); 0 in the porcelain under it at every τ. So the steam needs no change, as the brief expected.
- **The stock:** cream `#F2ECE0` (PRINT_COLORS.cream) on the printed face, matte (roughness 0.78); the cut edges a
  shade deeper (`#E2D9C7`, roughness 0.86), so the 0.6 mm edge reads as a line at the showcase's 15°. The face carries a
  faint tooth (a 128 px value-noise tile, overlay 3 %) and a soft 2–3 cm mottle under a level (seeded hash, never
  `Math.random`: the same on every load).
- **A depth occluder:** an opaque mesh under the plate, so `markDepthOccluders` puts it on the scene depth's layer with
  the plate (the steam's march stops at its face). Its contact shadow is transparent and is not.
- **The contact shadow** (`card_shadow`): a quad 9 mm larger than the card on every side, just over the porcelain, its
  alpha drawn from the distance to the card's outline: a ≈ 1 mm contact falloff (84 %) and a ≈ 3.2 mm skirt (16 %),
  windowed to nothing at the quad's edge. (The first cut, a 6 mm quad with a 4.5 mm skirt clamped at its edge, showed
  the quad's rectangle as a faint box round the card in the close-up; fixed.) Named `*_shadow`, so `silhouettePoints`
  skips it. The card casts no shadow-map shadow (0.6 mm: the stage's caster filter skips it) and receives the key's.
- **Judged at 15° before any camera work** (`evidence/v1.7/dinner-card/a-card/`: the host-ready pose, the cover poised,
  at laptop 1280 × 720 @2 and phone 390 × 844 @3, and a 3× crop): it reads as a card — the darker cut edge along its
  front, a tight shadow, the title legible and the eyebrow a faint line, as a printed card seen low.
- **The lookdev stand-in** (`buildDinner`) gets the card through the same rig; `models/dinnerPremium.ts` is unchanged
  (its skeleton has no card node: the card is never in the GLB).

### B. The print (`src/render/cardPrint.ts`)

- **Three lines, centred:** the eyebrow ("You’re invited") in Sage Graphite `#585C57` at the caption weight (600),
  letter-spaced capitals (+0.2 em, 3.3 mm); the event's title in ink `#1F2226` at the display weight (650, −0.018 em),
  9.2 mm, on one line or two balanced lines (the break where the longer line is shortest), stepping down 4 % at a time
  to 5.4 mm, then cut with an ellipsis; a short perforation rule (nine Perforation Taupe dots, decorative, as the
  header's rule); the invitee's name in ink at 600, 5.6 mm (shrinks to 4.2 mm, then cut). No name, no rule (the host's
  card). The block is centred a hair above the middle (optical centre). 10 mm side margins.
- **The canvas:** 2048 × 1434 (the card's 10:7; 20.5 px/mm), sRGB, mipmapped, the renderer's maximum anisotropy (set at
  precompile); 1024 × 717 on the Low tier. Redrawn only when the text (or the tier) changes. GPU: 16 MiB with mips (4 MiB
  on Low), plus the shadow's 512 × 382 (0.8 MiB).
- **One bundled face, Inter** (rsms/inter, the Fontsource build of Inter 4: the variable `wght` axis, latin 48,256 B and
  latin-ext 85,068 B woff2, OFL 1.1, `assets/shared/fonts/` with `OFL.txt`; `docs/asset-manifest.md`), registered with
  `FontFace` under the alias `Livetime Card Inter` and loaded beside the Dinner GLB (`dinnerScene.load` awaits it), so the
  first print is in it and every poster is the same on every machine. If it fails, the interface's system stack draws
  (the card still reads; only cross-machine determinism is lost). This is the one printed-text exception to "system sans
  only" (DESIGN.md); the page's HTML stays authoritative (#41).
- **Legibility** (`evidence/v1.7/dinner-card/b-print/`): the print box-reduced as a mip chain reaches the close-up's
  card width — 430 px (a 720 px poster) and 860 px (a 2× phone) — for the showcase's guest and host texts, a long title
  and name at the limits, accented text (latin-ext) and a one-word title. In the scene: the accepted 720 px poster has
  5,843 ink pixels (luma ≤ 90) inside the card's print area and **none** outside it, over 86 pixel rows
  (`tests/browser/dinner.spec.ts`); the card is ≈ 468 px wide there, ≈ 760 device px on the 3× phone
  (`f-stills/accepted-phone.webp`).

### C. The data (`src/core/{types,config,controller}.ts`, `src/demo/{fixtures,main}.ts`)

- `SceneConfig` Dinner: `{ category: 'dinner'; dish; card?: InvitationCard }`, `InvitationCard = { eyebrow?, title?,
  name? }`. `resolveConfig` keeps it, sanitised (`resolveCard`, `cardLine`): trimmed, runs of white space folded, C0/DEL/
  C1 and the bidirectional and zero-width format controls stripped, clamped to 60/80/48 whole characters (astral
  characters never split); a line that is not a string or ends up empty is dropped, and a card with no line left. Other
  categories drop it.
- `sameConfig` compares the card (absent and empty lines alike); `presetOf` does not, so the four shared Dinner posters
  stay four. A change of the card's text alone is a **print-only change** (`printOnlyChange`): the controller hands the
  scene the new config (`DinnerScene.setConfig` → `DinnerCard.setText`) and redraws, **without resetting the director** —
  a playing reveal keeps playing (tested mid-reveal), the accepted close-up stays on.
- Omitted, the eyebrow reads "You’re invited" (`CARD_EYEBROW`) and nothing else is printed.
- The showcase (`withCard`, `dinnerCard` in `fixtures.ts`): the eyebrow and `EVENTS.dinner.title` for everyone, the
  sample invitee `SAMPLE_INVITEE` ("Alex Rivera") in guest mode only; it follows the mode on every state change (a
  print-only change), and a config that brings its own card (`__showcase.setConfig({…, card})`) keeps it.
  `POSE_TEXT.dinner` host-ready and accepted describe the card. `docs/integration.md` documents the option.

### D. The close-up (`src/render/{camera,stage}.ts`, `src/core/{sequence,controller}.ts`, `src/scenes/dinner/{index,pull,sequences}.ts`)

- **A second camera channel, `close`** (0 the rest or pulled view, 1 the close-up), read by the controller every frame
  beside the pull (`SceneInstance.frameClose`, `Stage.setClose`); `controller.framing()` reports the close-up's fit
  (`closeUp`) and the live `close`.
- **On the reveal's own clock τ** (the steam's: the accept's time, k× during a change of mind's reveal, real time after
  the 1.5 s sequence, carried on in `simulate`; a clock of its own, `revealT`, so it outlives the steam's): 0 through
  host, guest-ready, the reveal's 1.5 s, the decline and the declined pose; from **τ 2.8 s** (the cloud gone,
  `CLOUD.release + life`) a **`cubic-bezier(0.4, 0, 0.4, 1)`** to **1 at τ 4.4 s** (where the plate stops steaming,
  `VEIL.end`), then held. Zero speed at both ends; half-way at 43 % of the move; peak 2.04 × the mean (1.28 close/s at
  39 %; measured against (0.45, 0, 0.25, 1) 2.63 ×, (0.3, 0, 0.3, 1) 2.18 ×, the symmetric (0.42, 0, 0.58, 1) 1.72 ×).
  `settling()` keeps the loop drawing until it lands (the steam's own end, 5.88 s, is later anyway). The accepted
  canonical pose **is** the close-up: reduced motion, a saved accept (`?saved=accept`), `settle()` and the poster land on 1.
- **The view (`CARD_VIEW`):** elevation **80°** (near plan, a hint of perspective), the shared azimuth **20°** (the
  key light holds), the same **18°** lens, the card **65 %** of the frame's width, centred. Fitted from the card's own
  eight corners along that direction (`solveCloseFit`, which is `solveHeroFits` with a direction: the hull reduction is
  exact only along the shared direction and is not used for it), aimed at the card's centre, in the same solve as the
  rest and decline fits (a fit is still solved once per content and aspect: `fitSolves` unchanged through a whole
  accept, tested). Measured: **49.2 cm** from the card's centre (2.916 su), the camera 49 cm over the table; the rest
  view is 1.45 m from its aim. In the square poster the card fills 65 % of the width on the porcelain, the coupe's rise at
  the corners; at wide fullscreen aspects the extended view adds the gilt rim and the cloche's edge as context
  (`f-stills/accepted-laptop.webp`).
- **The move (`closeUpView`):** a boom and push-in. The camera's line of sight turns from the rest view's to the
  close-up's at a fixed azimuth (elevation linear in k; the card's long edges, parallel to the camera's right, stay
  level on screen all the way: a first cut that orbited about the card's centre rolled the card ≈ 5° mid-move on the
  phone, because the rest view's aim is not the card); the point it looks at travels from the rest aim to the card; the
  distance to it moves geometrically (equal steps of k are equal ratios of size, as the decline's dolly); and the view's
  slide is solved so the card's centre crosses the screen on a straight line from where the rest view shows it to the
  centre (no swing; unit-tested to 10⁻⁶). The fullscreen frame rect extends the view exactly as `placeHeroView` does,
  so posters and fullscreen share one composition (`placeView`; tested at two layouts and four points of the move).
  `solveHeroFits` and `placeHeroView` take a direction (default the shared one) rather than being forked; the stage's
  `aim` (the rig's light target) is untouched.
- **Clearances (unit-tested at every τ of the move):** the camera stays outside every one of the steam's boxes (the
  cloud, the veil, the gush; `steamBounds` on the reveal's clock) with ≥ 1.27 su (21 cm) to spare above them (the volume
  is a FrontSide box: from inside it the steam would vanish); nothing on stage at the accepted pose comes nearer than
  2.34 su (39 cm), against the 10 cm near plane.
- **A change of mind** (`interruptCut`): the close channel comes home on its own C1 curve (`planCloseHome`,
  `closeHome`: the v1.5 `rewindCurve` with no hold), leaving at the speed it had and landing at rest on 0, no faster than
  the decline's own dolly at its top speed (3.36/s): **0.56 s** from the close-up at rest. The decline's bin waits for
  it (`planAnswerChange(…, closeHome)`): the decline's clock — its pull, then its bin — starts BIN_DELAY / k before the
  camera is home, so the two camera moves meet in one outward motion and the bin starts in only once the camera is home
  (tested: its first movement is on the frame the channel reaches 0). From the close-up at rest the reveal's rewind (the
  cover returning onto the plate) is stretched from 0.36 to **0.44 s** and the bin's lead is 0, so the decline then plays
  **1.34 ×** its own pace (the v1.5 change of mind already runs an accept up to 1.46 ×); from mid-move the homecoming is
  shorter and the plan nearer the old one (moving in at 0.5: 0.32 s, k 1.08). Decline → accept replays the move from its
  planned start (τ 2.8 s on the reveal's clock); accept → decline → accept mid-homecoming never jumps. Plans with no
  close-up out (every change during the reveal itself) are byte-identical to v1.6's. Strip:
  `evidence/v1.7/dinner-card/f-strips/change-from-close-up-laptop.jpg` (5.0–6.7 s after the tap; the channels per
  16 ms frame beside it): the cover is seen coming back over the plate as the camera rises out of the close-up — a
  reversed reveal — then the pull-back and the bin.
- **`onVisualComplete('accept')` stays at 1.5 s** (the answer is saved when the dish is uncovered; the camera is a
  flourish after it).

### E. Posters, backdrops, thumbnail, clips (`pnpm capture dinner`, `pnpm capture backdrops`, fresh 5701 server)

- **The four shared posters stay four** (`tests/dinner.test.ts`). Changed: `shared-host-ready.webp` (the card on the
  plate, no name; the cover poised) and `shared-accepted.webp` (the close-up on the card with the showcase's sample
  print: "Supper club: autumn menu", "Alex Rivera"). `shared-guest-ready.webp`, `shared-declined.webp` and the collection
  thumbnail (guest-ready, the card under the cloche) re-encode byte-identical. Per-event posters (the guest's own name
  on the accepted poster) would need a runtime still (`captureStill`), not a shipped file: every poster already shows
  sample content.
- **`backdrop-accepted.webp`** (new; 2000², q0.92, 43 KiB): the accepted poster is a different framing, so it melts
  into its own backdrop (`backdropUrl(category, 'accepted')`, as v1.5's `backdrop-declined.webp`). Unlike the others it
  is rendered **with the scene in it** (`captureStill(…, { field: 7 })`, content visible): the plate runs past the
  poster's edges on every side, and a bare-studio still would cut it off at the poster's feather. Every other scene's
  backdrop (and Dinner's rest and declined ones) re-renders byte-identical. `scripts/capture.ts` writes it for any scene
  whose framing has a close-up.
- **The accept clip** grows from 3.8 to 5.0 s, through the move (`evidence/v1.7/dinner-card/e-capture/accept.mp4`;
  `change.mp4` is the capture plan's accept → decline at 0.5 s, mid-reveal, unchanged in behaviour).
- `tests/browser/posters.spec.ts` (dinner) on the fresh server: all five stills 0.00 % of pixels over 24/255 (mean
  1.00–1.27, max 6–12).

### F. Evidence and cost (`evidence/v1.7/dinner-card/`)

| What | Where |
| --- | --- |
| The card at 15° (host-ready), laptop 1280 × 720 @2 and phone 390 × 844 @3, and a 3× crop | `a-card/` |
| The print: 2048 px, and box-reduced to 430 and 860 px, five texts | `b-print/` |
| Clips (accept 5.0 s, change), the 540 @2 accepted review still | `e-capture/` |
| 16 ms frame strips of the move (24 consecutive frames through its fastest part, and every third frame of it) at laptop and phone; the channels per frame (`close-*.txt`); frame-to-frame differences (`frame-diff-*.txt`); the change of mind from the close-up | `f-strips/` |
| Stills at laptop and phone: host-ready, accepted (the close-up), declined | `f-stills/` |
| Pacing (the judges' `pace-scene.ts`, BASE and the move's window added) | `f-cost/pacing.txt`, `pace-scene.ts` |
| The suites | `g-verification/suites.txt` |
| Scripts: stills, print, strips | `stills.ts`, `print.ts`, `strips.ts` |

- **Smoothness:** on the 16 ms virtual clock the channel follows `closeIn(τ)` frame by frame (`close-*.txt`); the
  frame-to-frame mean luma difference through the move has no spike (largest step 3.4 levels at laptop, 6.8 on the
  phone, both at the move's fastest frames, each within 2.5 × its neighbours); the card's long edges stay level and its
  centre travels straight to the middle of the frame square (the strips).
- **Pacing** (real time, three accepts with a change of mind back from the close-up between them, `RUNS=3`): laptop
  and phone p50 16.70 ms, **p95 16.70–16.80 ms**, the move's window p95 ≤ 16.80 ms, max 16.8 ms, no frame over 20 ms
  (the budget, ≤ 16.8 ms p95, holds at both sizes). The first laptop set (load average 9, half an hour after the
  machine had peaked above 400 with other sessions) had 15 long frames at 0.5–1.8 s of its first accept (inside the
  v1.6 steam's reveal, before the move; p95 still 16.80); two repeats at load 8–12 did not reproduce them (one 33 ms
  frame in one first run, as the v1.6 baseline `evidence/v1.6/verification/pacing-final.txt` has, then none). Every set
  is in `pacing.txt`.
- **What the card costs:** two draw calls (the card's two materials) and the shadow quad on every Dinner frame; one
  2048 × 1434 texture (16 MiB with mips; 4 MiB on Low) and the 130 KiB face on load. The close channel's per-frame work
  is three projections (microseconds); no fit is solved in the loop.

## Tests

| File | What it holds | Count |
| --- | --- | --- |
| `tests/dinner.test.ts` (new describe) | the card's size; centred in the flat well, never pierced by the master's porcelain; turned to the azimuth, print upright; under the seated cloche and inside the steam's clear layer (`cloudDensity` ≤ 0.5 % of the dome's at its top at τ 0–0.3, 0 from 0.6, 0 under it); the title's layout (one line, two balanced, shrink, cut); the card's body and its node-test fallbacks; the four shared posters | 33 (7 new) |
| `tests/config.test.ts` (new) | sanitising (trim, control/format characters, white space, clamps by whole characters, dropped lines), Dinner only, `sameConfig`/`printOnlyChange`, `presetOf` unchanged, the showcase's card by mode | 9 |
| `tests/pull.test.ts` (new describe) | `closeIn`: 0 to 2.8 s, 1 from 4.4 s, monotone, C1, calm; through the scene and the director: 0 for host, guest-ready, the reveal and the decline, then the move, 1 settled, under reduced motion, for a saved accept; the homecoming (C1, from its own speed, ≤ the dolly's top speed, 0.56 s from rest); accept → decline from rest and mid-move (the bin waits for the camera, k < 1.35); decline → accept replays the move; accept → decline → accept mid-homecoming without a jump | 18 (5 new) |
| `tests/framing.test.ts` (new describe) | the card 65 % of the width, centred, level, upright at 3:4, 1:1, 3:2, 45–52 cm away; the move exact at both ends, the card's centre on a straight line, growing all the way; nothing within the 10 cm near plane and the camera outside every steam box at every τ; the fullscreen frame rect as the square stage through the move | 11 (4 new) |
| `tests/stage-framing.test.ts` (new describe) | the stage fits the close-up in the same solve; `setClose(1)` puts the live camera on it, 0 brings it home exactly; resizes, insets and other aspects only place it; content without a close-up ignores the channel | 13 (2 new) |
| `tests/scene-depth.test.ts` | the card is a marked occluder, its shadow is not | 7 (1 new) |
| `tests/browser/dinner.spec.ts` | the steam visibly changes the still before the move; the camera moves in, lands on the close-up, and the loop idles after the move and STEAM_END on the canonical close-up; the close-up's print is legible (ink only on the card, in lines of type); a text change reprints it without resetting, also mid-reveal | 8 (2 new, 1 rewritten) |
| `tests/browser/framing.spec.ts` | every scene at rest is off any close-up; Dinner's accepted pose's live camera is the close-up, 0 while the reveal plays, monotone up, 1 under reduced motion, 0 at the declined pose; no fit solved | 9 (1 new) |
| `tests/browser/fullscreen.spec.ts` | the accepted poster sits over `backdrop-accepted.webp` at 1440 × 900 and 390 × 844 | 14 (1 new) |

Final verification (`g-verification/suites.txt`, on `v1.7/dinner-card`, a fresh 5701 server): typecheck clean; the
unit suite **492/492** (33 files, 91 s, `--testTimeout=1800000`); the browser suite one spec per call **120/121**, the one
failure the known Birthday bloom flake (`bloom.spec.ts` line 79, two consecutive stills of the just-accepted pose
byte-identical; `docs/RESUME.md`, "Still open"; 1 of 3 re-runs passed, the other two failed on the same line).

## Known gaps

- **Per-event posters.** The accepted poster carries the showcase's sample print; an integrating app that shows the
  poster (before load, on Static, on failure) shows "Alex Rivera" and the sample title, not its guest's. The HTML stays
  authoritative, and the pose's text fallback describes the card without naming anyone. A runtime still (render the
  accepted close-up once the scene is ready and cache it) would fix it; not built.
- **The accepted backdrop is 286 px per frame square** (a 2000 px still at 7× the field), so on a wide screen the plate's
  rim and the cloche around the poster are an upscaled, soft image until the scene is live. The rest backdrops are the
  same resolution, but they show only the smooth cove.
- **In the square poster the close-up shows the card and the porcelain only**: at 65 % of the width the frame is
  15.4 cm across, inside the 27 cm plate (the gilt rim is 13 cm from the centre; the frame's corners reach 10.9 cm).
  "A hint of the plate's rim and the cloche's edge" appears only in the fullscreen layout's extended view on wider
  screens. A smaller fill (≈ 55 %) would bring the coupe's rise into the square corners; the brief's 65 % is kept.
- **The eyebrow is lighter than the legibility check's ink threshold** (Sage Graphite, luma ≈ 91): the browser check
  counts the title and the name; the eyebrow's legibility is shown by the print reductions and the stills only.
- **The close-up while a decline is mid-pull** (a change accept → decline → accept inside the homecoming, then back
  again) composes the two channels (the close-up blended over the pulled view); it is continuous and C1 but was judged
  only in unit tests, not in frames.
- **The change of mind from the close-up plays the decline 1.34 × its pace** (within the v1.5 change of mind's 1.46 ×
  for the accept); keeping it at 1 × would need a longer decline (`durations` is fixed per sequence by the director).

## Open questions for Surya

1. **#41 and #42 as built** (`docs/spec-revisions.md`): the card (10 × 7 cm cream, 0.6 mm, centred, upright to the
   camera), its three-line print in Inter (the one bundled face: the printed-text exception), the `card` config option
   and the sample print on the shared posters; the close-up (τ 2.8 → 4.4 s, 80°, 65 %, the accepted pose).
2. **The eyebrow's case:** printed as letter-spaced capitals ("YOU’RE INVITED"); the config's text is passed as given
   and upper-cased by the print. Keep, or print as written?
3. **The fill:** 65 % (the card and porcelain only in the square poster), or ≈ 55 % so the plate's coupe frames it?
4. **The timing:** the move waits for the cloud to clear (2.8 s) and lands as the plate stops steaming (4.4 s), 2.9 s
   after the answer is saved. Shorter (e.g. 2.2 → 3.6 s, through the veil's last wisps) is a two-number change.
5. **Per-event posters** (a runtime still), or the sample print as is.
