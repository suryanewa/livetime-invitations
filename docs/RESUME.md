# Resume here: invitation scenes on the scan-to-CAD masters

Checkpoint written 2026-10-01 ~03:20 EDT on the MacBook, when Surya closed the laptop mid-run. This file is the
handoff for the Claude instance on the Mac Mini (or anyone). Read it top to bottom, then `docs/new-models-brief.md`
and `scripts/masters/README.md`.

## Where things are

| What | Where |
| --- | --- |
| This project (invitations showcase) | GitHub `suryanewa/livetime-invitations` (private). Clone to `~/Developer/projects/livetime-invitations`; `pnpm install`; `pnpm dev` → http://127.0.0.1:5199 |
| The eight master models | committed in `models/masters/*.glb` (38 MB); their generators, viewer and process docs: GitHub `suryanewa/scan-to-cad-rebuilds` (private) — README.md and PROCESS.md there |
| The brief for this work | `docs/new-models-brief.md` (owner decisions recorded inline, e.g. Dinner = cloche + clean plate, no food, no preset control) |
| The import pipeline | `scripts/masters/` (README.md is the single guide: recipe API, pitfalls, runtime checklist); runtime side `models/imported.ts` |

## State by phase

**Phase 1 — foundation: DONE, on `main` (commit `c403a32`).** Pipeline, runtime support, Sports on the basketball +
hoop masters (contract re-measured, cream variant, tests/browser spec green, deterministic export), docs v1.2 notes.
Adversarially reviewed; the last review's finding (variant materials bypassing the loader's final-material step →
inverted normal maps) is fixed on main, plus an `origin` pivot option in the recipe API.

**Phase 2 — the five scenes: INTERRUPTED mid-build.** Five Opus agents were building in parallel, one per scene, each
in its own git worktree and branch (worktrees under `.claude/worktrees/`, which are local to the MacBook; the branches
are pushed). Each branch holds a WIP checkpoint commit of whatever the agent had done when stopped — **unreviewed,
possibly not compiling, possibly mid-edit**. None reached the inspector or fix stages.

| Scene | Branch | What the WIP contains (from `git status` at the stop) |
| --- | --- | --- |
| Sports (fidelity pass) | `worktree-wf_f35cd656-ebe-1` | edits to models/sports.ts, models/sportsContract.ts, src/scenes/sports/sequences.ts (spin/squash/net work started) |
| Party | `worktree-wf_f35cd656-ebe-2` | recipe written, party.glb exported, recordContract/recordPlayer/recordPremium, poses/sequences/index edited |
| Birthday | `worktree-wf_f35cd656-ebe-3` | recipe, birthday.glb exported, posters + thumbnail regenerated, models/birthday.ts + contract edited |
| Dinner | `worktree-wf_f35cd656-ebe-4` | recipe, dinner.glb exported, food builders removed (dinnerParts.ts deleted), src/demo/main.ts preset control change, tests edited |
| Business | `worktree-wf_f35cd656-ebe-5` | new models/business.ts, businessContract.ts, businessPrint.ts (nothing wired yet) |

Not part of this work: a branch `cp5/handoff` with another session's worktree (`wt-cp5`, qualification/docs edits);
leave it to that session.

**Phase 3 — not started:** merge the five branches into `main`, judge all scenes (stills + clips vs the masters and
the v1.1 captures), regenerate posters/thumbnails, update the shared docs (asset-manifest provenance rows for the
masters, style-reference v1.2 section, spec-revisions, qualification re-measurements with budgets noted as waived),
commit.

## How to resume (on the Mac Mini)

1. Clone/pull, `pnpm install`, confirm the baseline: `pnpm typecheck && pnpm test` on `main` (18 files / 149 tests
   at the checkpoint), `pnpm dev`, open `/?scene=sports` and see the new ball and hoop.
2. For each scene branch, `git worktree add .claude/worktrees/<scene> <branch>` (or just check it out), `pnpm install`
   there, read `docs/scenes/<scene>-v1.2.md` if the agent wrote one, run typecheck/tests to see how far it got, and
   look at the exported GLB in the showcase on its own port (`pnpm dev --port 520N`).
3. Re-run Phase 2 **per scene from that state**: the agent prompt that produced each branch is in the workflow script
   saved on the MacBook (not portable); its content is reproduced in `docs/new-models-brief.md` (mapping table +
   rules) — each scene agent's job is "finish the scene on its branch: recipe → contract → rig → sequences → tests →
   captures, then an adversarial inspection and fix". Keep one headless Chrome per agent and one dev server per
   worktree (ports 5201–5205; 5211–5215 for inspectors).
4. Then Phase 3 as above.

The workflow pattern that worked (Phase 1 and the earlier basketball retexture): one builder → adversarial reviewer →
fix → verify, judged on rendered stills, with measured facts written into the brief before agents start.

## Owner decisions so far (do not re-ask)

- Budgets (GPU memory, cold-load size, triangle/draw caps) are waived for this pass; report what ships.
- Dinner: cloche and clean plate only — no food, no preset control; `dish` stays in `SceneConfig` but selects nothing.
- The objects' look now follows the masters, not the v1.1 "Satin Enamel" object rules; studio, camera and interface
  stay. Record as style-reference v1.2 + a spec revision.
- Sports keeps the code-authored stand (the master hoop is wall-mounted).

## Completed (2026-10-01, ≈06:20 EDT)

The handoff above was picked up the same morning. Phases 2 and 3 are done: the scene work is on `main`, and this docs pass is in the working tree for the orchestrator to commit. The phase notes above are kept as the record of the interruption.

| What landed | Where |
| --- | --- |
| Foundation: import pipeline, runtime support, Sports proof | `c403a32`; `scripts/masters/` (README is the guide), `models/imported.ts` |
| Five scenes on the masters, merged from their worktree branches | Sports `75d6036` (fidelity pass); Dinner `04f9024` + `12b5cd6`; Birthday `4f6ecb1`; Party `4feb909` + `2ecf5b1`; Business `49bf0c1` + `6a7f2a1` (v1.2.1) |
| Three independent judges on all five scenes, then a polish pass per scene for their must-fix items | Party v1.2.1 `9329416`, Birthday v1.2.1 `a6a1ce2`, Dinner v1.2.1 `201a201`, Business v1.2.2 `7c951e7`; merged by `b225f95`. Scores and outcomes: `docs/qualification.md` (v1.2, Independent judging) |
| Sports v1.2.1: rim and board recoil and floor squash sized to read at stage size (rim 2.5°, board 0.6°, squash ≤ 10 %) | `a613138` (HEAD); `docs/scenes/sports-v1.2.md` (Amplitude pass) |
| Per-scene notes: decisions, measured contracts, export reports, choreography changes, known gaps | `docs/scenes/<scene>-v1.2.md`; recipe Decisions blocks in `scripts/masters/recipes/<scene>.ts` |
| Posters, review clips and collection thumbnails regenerated through the real renderer | `assets/scenes/<scene>/posters/`, `assets/ui/collection/`, `outputs/<scene>/` |
| Measurements on `main` **before the polish pass**: sequence lengths (`6a62beb`), export reports, frame cadence (all five) and 71 browser tests (`756a635`). At HEAD `a613138`: 232 unit tests, the production build's JavaScript size and every file size | `docs/qualification.md` (v1.2) |
| Shared docs: style reference v1.2, provenance rows for the eight masters and the new runtime GLBs, revisions #20–#30, the qualification v1.2 section, the integration note on the inert `dish`, README, the time log, and the showcase's pose text (Birthday's six candles) | `docs/style-reference.md`, `docs/asset-manifest.md`, `docs/spec-revisions.md`, `docs/qualification.md`, `docs/integration.md`, `README.md`, `docs/time-log.md`, `src/demo/fixtures.ts` |

Still open:

- The owner's review of v1.2 and of the recorded revisions (#23–#30, pending Surya's confirmation; #20–#22 are Surya's own decisions).
- The iPhone 17 Max session, which now has to cover much heavier scenes (budgets waived, #21).
- Re-running the checkpoint 4 harnesses for live render-cost peaks, counted GPU memory and throttled cold load.
- The shared-code follow-ups the scene docs route to the foundation owner: a scene path for interruptions in `visualDirector.ts`, a stage-level fix for the shadow-depth texture leak, and recipe options for load-time finishes.
- `docs/coverage.md` regenerates cleanly (`node --experimental-strip-types scripts/coverage-table.ts`, 650 rows), but the output is unchanged because `docs/coverage.json` still records the checkpoint 5 audit. Its rows were not re-audited for v1.2 (for example the 60k-triangle budget row, the three-candle rows and the Dinner food rows).

## Hollywood pass (v1.6)

Written 2026-10-03. Surya, on v1.5: the cake "still has a plasticky, too perfect and geometric shape / texture",
the flames "aren't bad, but are unconvincing", the steam "needs to realistically accumulate under the cloche and
somewhat match its shape when it's lifted" — each "Hollywood CGI level work". Brief: `docs/hollywood-pass-brief.md`.
Read `docs/style-reference.md` v1.6 (what each rebuild is), `docs/qualification.md` v1.6 (the VFX judges' scores
and demanded fixes), and the three scene records `docs/scenes/birthday-v1.6-cake.md`,
`docs/scenes/birthday-v1.6-flames.md`, `docs/scenes/dinner-v1.6-steam.md`.

Shape of the work: three owners in parallel worktrees (`v1.6/cake`, `v1.6/flames`, `v1.6/steam`), an integration
branch (`v1.6/integration`, worktree `.claude/worktrees/v16-int`, port 5508) merged cake → flames → steam with one
hand-resolved conflict in `src/render/stage.ts` (the depth pass runs first, then bloom prepare, scene, haze,
composite), a meshopt side task (`v1.6/meshopt`), one VFX judge per object (read-only, own frames, against
photographs and film references), then a fresh polish owner per object working from the judge's ranked tells
(`v1.6/cake-polish`, `v1.6/steam-polish`; the flames' smoke pass on `v1.6/flames`), then a second judging.

Infrastructure lesson (also in the orchestrator's memory): subagents were killed by a 10-minute watchdog whenever
they awaited their own background renders/tests or ran a >10-minute call on the shared, heavily loaded machine
(load average 30–90 with several rendering sessions); brief them to commit WIP often, keep calls under ~3
minutes, never await a background run, and write long files in pieces.

State at the last write (2026-10-05): every polish round so far is merged on `v1.6/integration` (cake ×3, flames ×4,
steam ×4, meshopt); typecheck clean, the unit suite 460/460 (with `--testTimeout=1800000` for the Party clearance
test), the Birthday and Dinner posters recaptured on the merged build, the full browser suite 117/117 on a freshly
started dev server (on a server that had hot-reloaded through many merges, `scene-depth.spec › dinner` counted zero
depth passes because its `import('/src/render/sceneDepth.ts')` got a different module instance than the app's
`sceneDepth.ts?t=…` — the same HMR trap the judges' `Stage.prototype.render` hooks hit; restart the server before
the suite or any prototype-hooking harness). The cake is **signed** by the fourth judging at square 540, laptop and
phone, vanilla and cocoa (8 / 7.5 / 7.5); the flames and smoke are **signed** by the fifth judging as a whole sequence
at laptop, phone and 540 (7 / 7 / 7) after four polish rounds (the close-up tiers — the 10× blow, the 2× smoke
detail, the 30× macro — withheld and recorded as known gaps: a limit of the 5 mm voxel smoke, below any size a guest
sees). The steam is at 6 / 6.5 after four rounds (the fourth a structural round at a 3 ms budget: a dense
intermittent sheet field, exact per-step integration, a reprojected history, a 32³ light volume); the fifth judge
called what remains constants (a bounding-box clip on the cloud's right flank from `steamBounds`, a rim-puff pop on
a decline, no held dome in the 0.15–0.25 s after lift-off, hovering rather than rising with no rolled lip, a dim lit
side) plus a resolution limit at 3 ms (soft at 2×, the crown under 2:1), so the budget was lifted to ≤ 6 ms while
steam shows and a final constants-and-resolution round commissioned (`v1.6/steam-polish5`, worktree
`.claude/worktrees/v16-steam6`, port 5617) — in progress; its result, the sixth judging and the closing of this
section are the next steps.

Still open at the time of writing (updated when the pass closes):
- `tests/party.test.ts › a change of mind never cuts the cover through the arm` takes ~19 minutes of wall-clock for
  ~80 s of CPU on this machine now, on v1.6 **and on v1.5 `main`** (timed alone, load average 5–9, 60 % memory free),
  so it is not a v1.6 regression; it passed inside its 180 s timeout during v1.5. Something in the test waits
  rather than computes (a real-time dependence in its stepping is the suspect). Run it with a long `--testTimeout`
  until it is diagnosed.
- the polish rounds and the second judging (see `docs/qualification.md` v1.6);
- a second full `pnpm models birthday` to confirm the compressed export is deterministic (the meshopt owner could
  not finish one under load; the uncompressed export reproduced the committed bytes and the codec is deterministic);
- `docs/coverage.md` §8 still says "KHR_mesh_quantization with no decoder" (generated from `coverage.json`);
- the Business reader's pictogram and the Party key are not wired to the bloom (`markBloom`: one line each; it
  changes Business's posters and adds a pass on every lit Business frame — Surya's call);
- the judges' shared-rig note: the key is too frontal for the decorated cake face; a raking key or a soft top/back
  light would help every food shot — not done, it changes every scene.

## Perfection pass (v1.5)

Written 2026-10-02. Surya's twelve edits on v1.4 (`docs/perfection-pass-brief.md`, verbatim, with the owner of
each), delivered with the workflow that has worked three times before, run at a larger scale: seven owners in
parallel worktrees (Party, Birthday cake, Birthday fire, Sports, Dinner, bin, Business; `v1.5/<owner>` branches,
dev servers 5501–5507), each measuring first, researching the real thing, building, rendering and doing a hostile
pass on its own frames; an integration branch (`v1.5/integration`, port 5508) merged in dependency order; a framing
owner for the shared-stage consequence (the real bin forced a decline-only camera pull-back; then the phone DPR, the
first-use hitch, the poster-staleness test); three independent judges on the integrated build (`docs/qualification.md`
v1.5, Judging) whose findings went back to every owner as a polish round, with the two critical interruption bugs
(Birthday relighting its candles, Sports teleporting the ball on a change of mind) fixed by giving both scenes a
scene-owned `interruptCut`. Read `docs/style-reference.md` v1.5 (the table of the twelve edits), then the scene
records `docs/scenes/<scene>-v1.5*.md` and spec revisions #37–#40.

Still open:

- **The bin's second polish round landed right after the first v1.5 push** (Surya, 2026-10-02: "push now, leave the
  bin round as a documented gap, so long as the progress is saved"; the round turned out complete and green, so it
  was merged as the next commit): the bin's 5.9 MB GLB is fetched at low priority after `ready`
  (`src/scenes/deferredBin.ts`; Birthday needs 7.9 MB before ready instead of 14.4, Dinner 3.4 instead of 10.0; a
  decline tapped before it arrives saves at once, holds the guest-ready picture and plays once it has; if it cannot
  load, the declined poster), it warms itself in idle moments once it arrives (first decline: no frame over 20 ms,
  on a 4× throttled phone too), it slides in decelerating from just outside the drawn view (0.38 s Birthday, 0.40 s
  Dinner, on screen 0.33–0.38 s at every aspect) with its cove shadow fading in with the share of it inside the
  frame, and its texture memory halved (34 → 18 MiB). **Verification at this push is partial** (Surya, out of
  time: "push it now and skip the suite"): on the merged commit, typecheck is clean and the unit suite passes
  (413); the full browser suite was started and killed before it finished, so the browser tests, the
  poster-staleness check on the recaptured Birthday and Dinner stills and the decline strips are **unverified**
  on `main` (the bin owner's own run of the same code before the merge was 107/109 browser, the two failures the
  posters since recaptured). **Run afterwards on `main` at `03ca155`:** 108 passed, one failure
  (`business.spec.ts › Optional card drag…`) that passed 3/3 when re-run alone — a load flake while three new owner
  sessions were starting their Chromes; so the push is verified. Left from that round: its warm-up still costs one ~30 ms task
  at rest on a throttled phone; the round's write-up in `docs/scenes/bin-v1.5.md` and a review of
  `evidence/v1.5/bin/guest/` were not done by the owner.
- **Owner decisions, pending:** revisions #37 (the record plays on; the deck order), #38 (the mini hoop system and
  the physics tails), #39 (the decline pull-back), #40 (Normal at 2 device pixels) and the host beat's new length
  (#23: 2.47 s, from the candle placement); Master §9's 2.5 MP buffer ceiling (the laptop renders at 1.65×, a full
  2× needs 3.7 MP, about 130 MiB with MSAA).
- **Known gaps recorded in the scene docs:** the bin body has no key-side highlight band (the rig has no light at
  its height; a traced floor bounce stands in); the Sports decline tail runs 3.5 s past its beat at FIBA's
  restitution; no steam reflection in the cloche; the smoke's colour is tuned to `neutral-room`; a change of mind
  inside the snuff's first 40 ms carries the snuff to all six candles; the dish is still held by its own cover's
  paths at rest (0.70 of the width, no longer by the bin).
- Not re-measured: the iPhone session (the scenes are heavier again: the bin is 6.6 MB, Birthday loads 14.4 MB),
  `docs/coverage.json` (still the checkpoint 5 audit).

## Studio pass (v1.3)

Written 2026-10-01 ≈18:20 EDT. Surya, auditing v1.2: *"Why do these look so cartoonish compared to the original
renders?"* The models were right; the showcase lit, framed and finished them like the v1.1 objects. Read
`docs/studio-pass-brief.md` (the five causes and the plan), then `docs/style-reference.md` v1.3 and
`src/render/rigs/README.md`.

| What landed | Where |
| --- | --- |
| Infrastructure: the rig contract and registry (rigs register by file), the v1.1 studio as rig `v1.1` (byte-identical stills), the 18° perspective lens fitted to `framePoints`, `?rig=` / `?camera=ortho` on local hosts, `pnpm capture rigs` and `pnpm capture stagecolor`, the CSS vignette and grain removed, every v1.2 grade removed and the GLBs re-exported | `a62fab0`; `src/render/rig.ts`, `src/render/rigRegistry.ts`, `src/render/rigs/`, `src/render/camera.ts`, `src/render/stage.ts`, `src/ui/shell.css`, `scripts/capture.ts` |
| `metalEnvIntensity` (the rig's environment strength on every own-environment metal, every tier), `?rig=` driving the whole stage, the Party label's asymmetry test | `ee87771` |
| Four rigs designed in parallel, one per designer, each with its reasoning and measured stage colour: `neutral-room` (`5d079fb`), `product-studio` (`f1718da`), `livetime-warm` (`13fce13`), `daylight-table` (`1aaa020`, recovered from the designer's uncommitted checkout); merged by `83a1b38`, `f387bd1`, `48b38d3` | `src/render/rigs/<name>.ts`, `docs/rigs/<name>.md` |
| Three independent judges on all five scenes: `neutral-room` 81.7, `product-studio` 76.7, `daylight-table` 69.3, `livetime-warm` 69.0; all three ranked `neutral-room` first, and none wants a removed grade back | `docs/qualification.md` v1.3 (Independent judging) |
| Integration: `DEFAULT_RIG` = `neutral-room`, `--lt-stage` = `#D5D2CD` (measured), posters, review clips and collection thumbnails regenerated | `40f9e04` |
| Every measurement re-run at `40f9e04` (timing, cadence, stage colour, export reports and determinism, 263 unit and 71 browser tests) | `docs/qualification.md` v1.3 |
| Docs: style reference v1.3, revisions #31–#36, qualification v1.3, a v1.3 note in each scene doc, manifest rows for the rigs, README, integration defaults, time log | this docs pass (in the working tree for the orchestrator to commit) |

To compare the rigs: `pnpm dev`, then `http://127.0.0.1:5199/?scene=dinner&rig=product-studio` (any scene, any rig;
`&camera=ortho` for the v1.1 lens). `pnpm capture rigs http://127.0.0.1:5199` writes every rig's stills and contact
sheets to `outputs/rigs/` (local, git-ignored); `pnpm capture stagecolor http://127.0.0.1:5199 <rig>` measures a
backdrop. A new rig is one new file in `src/render/rigs/`; changing the production rig means `DEFAULT_RIG`, then
re-measuring, setting `--lt-stage` to the measurement and regenerating posters and thumbnails (`pnpm capture <scene>`).

Still open:

- **Owner decisions, pending:** the neutral `neutral-room` over the warm `livetime-warm` direction (the brief left
  the choice to Surya; the judges chose), the perspective lens (it reverses their checkpoint 2b choice of orthographic,
  revision #2), the removal of the CSS finish they approved on review page v1, and the new stage token. Revisions
  #31–#36.
- **The brief's last two steps are done:** the adversarial review (fresh `neutral-room` captures beside every master
  render: no longer cartoonish; pass with fixes) and a documentation-only fix pass (`docs/qualification.md` v1.3,
  Known limitations). The look is unchanged, so the open polish below still stands.
- **The judges' grafts onto `neutral-room`, none applied yet** (`docs/qualification.md` v1.3, Known limitations): a
  slightly lighter and warmer cove (then re-measure, tokens, posters, thumbnails), one soft dark gradient card low
  and camera-right in the environment, the reader's near-white lower bezel, the Party lid's near-black inside, the
  speckled net and hoop-base shadow, a large curved shadow top right of the cove in Business and Sports (cast from
  outside the frame: the lanyard, the backboard; the most noticeable artefact left).
- **Stale stage colour in the coverage audit:** `docs/coverage.md` / `coverage.json` (audited at `7908069`) cite
  `#F8E4C8` and its 12.8:1 and 5.5:1 contrasts in three rows; the next audit should restate them for `#D5D2CD`
  (10.5:1 and 4.52:1). `DESIGN.md`, `PRODUCT.md` and `.impeccable/design.json` are reconciled.
- Not re-measured: the production build's JavaScript size (all five rigs are bundled), live render-cost peaks, counted
  GPU memory, throttled cold load, `neutral-room`'s CPU cost at stage creation, and the iPhone 17 Max session.
