# Effort log

The production plan says not to treat the original 15-hour fee calculation as a verified estimate, and to record actual time by milestone. The visual study plus the complete Business scene are the estimation checkpoint.

Times are wall-clock working sessions (agent-assisted production), America/New_York. Production is agent-assisted and parallel: from Milestone 1 onward several agent streams (builders, reviewers, capture) ran at once on one working tree, so rows overlap and agent-hours are several times the wall-clock. The log records wall-clock, because that is what the schedule and the fee see.

## 2026-09-28

| Milestone | Start | End | Elapsed | Notes |
| --- | --- | --- | --- | --- |
| 0 — Workspace and contracts | 16:20 | 17:25 | ~1 h 05 m | Checkout, pinned deps, contracts, renderer/camera/lighting/contact shadows, skeleton, docs |
| 1 — Visual study (pre-selection) | 16:45 | 18:20 | ~1 h 35 m | Both directions modelled (cake, keycard) plus three blockouts; study page; deterministic captures; independent 7-agent scoring panel (≈20 min) |
| 2 — groundwork (style-independent) | 17:55 | 18:15 | ~20 m | Response ledger, clock, curves, visual director, quality monitor, mock adapter, controller draft; 38 unit tests |
| 1b — style lock (refinement pass) | 18:30 | 19:00 | ~30 m | Direction L tokens, grounding, scanner/badge recognition, whole-dot signature, lanyard flex, style reference |
| 2 — Business reference implementation | 19:00 | 20:50 | ~1 h 50 m | GLB pipeline, rig, choreography, drag, showcase UI, posters, recordings, perf/transfer evidence; two independent reviews (UI finish + 8-agent adversarial code review) and a full fix batch; 52 unit + 14 browser checks |
| 2 — checkpoint 2 package and commit | 20:50 | 23:06 | ~2 h 15 m | Checkpoint 2 clips and six-state sheet (exported 21:41); DESIGN.md, PRODUCT.md and design tokens (22:49); last browser-check edits; Milestone 2 commit `9c70bfe` at 23:06. Includes any time spent waiting on checkpoint feedback |
| CP2 rework — premium lookdev | 23:06 | 00:02 (29th) | ~1 h | Reference images and clips saved 23:20. Lookdev page comparing current L with a premium L2 candidate (orthographic and long-lens), badge, reader and cake; checkpoint sheet at 00:02. Approved at checkpoint 2b: premium, orthographic, two-tier cake |

Milestones 0 and 1 overlapped because the render foundation served both.

## 2026-09-29

Commit times come from `git log`. Where streams overlapped, the gap between two commits is when a stream landed, not how long it took.

| Milestone | Start | End | Elapsed | Notes |
| --- | --- | --- | --- | --- |
| Fidelity pass 1 — premium L2 for Business | 00:02 | 01:52 | ~1 h 50 m | Premium studio (gobo spot, 16-tap PCF soft shadows, sweep, fill/bounce), SDF reader, cast/turned clip, printed card and strap, L2 overrides, premium two-tier cake preview, Low-tier shadow drop, true poster/canvas crossfade. Commit `b2cf246` |
| Fidelity pass 2 — plaster, gobo, finish | 01:52 | 02:07 | ~15 m after pass 1 landed | Limewash plaster, layered palm cookie, cooler fill, holo seal, PVC core, bezel, status glyph and spill, CSS vignette and grain, style reference v1.1. Built alongside pass 1. Commit `27ced6d` |
| Party groundwork | ≈01:52 | 02:14 | ~20 m (start inferred), parallel with pass 2 | Record contract, rig, stand-in model, label/vinyl/platter materials, lookdev subject. Commit `2ebf1f9` |
| Party scene (stand-in model) | 02:14 | 02:25 | ~10 m | Choreography, scene module, song selector and song line, scene capture, 11 unit + 5 browser tests. Commit `53718f9` |
| 3 — premium record player; Party posters, clips, thumbnail | 02:25 | 02:54 | ~30 m | Swept-profile body, coral plinth with perforation strip, knurled controls, woven lid lining; captures. Birthday groundwork (bin model, layout contract) in parallel. Commit `15b9675` |
| 4 — Birthday first pass | 02:54 | 03:13 | ~20 m | Candle, breath, bin and drop choreography; shared bin GLB; shadow proxies; frame points and per-scene wall; capture clock fix; 10 unit tests. Commit `e3dfab6` |
| 4 — review fixes and records | 03:13 | 04:09 | ~1 h (includes a session restart at ≈03:40 that interrupted and re-ran the fix streams) | Independent audit (9 agents), then four parallel fix streams with a reviewer each: showcase focus and layout, premium defaults and texture release, Low tier, Party framing and motion, records. Birthday browser tests |

| Checkpoint 3 evidence and approval | 04:09 | 04:20 | ~10 m | Real-speed clips, posters, measurements; Surya approved Party and Birthday, the disposal framing exception and full premium for Sports and Dinner. Commits `c791b35`, `0117e29` |
| 5/6 groundwork — Sports and Dinner scenes | 04:20 | 04:42 | ~20 m | Contracts, stand-in models, rigs, choreography, scene modules, framing, tests; README/integration guide and gallery groundwork in parallel. Commits `2596581` → `c2b5952` |
| 5/6 premium models with critical reviewers; shared fixes | ≈04:42 | 08:14 | ~3 h 30 m (parallel streams) | Premium Sports and Dinner builders, each followed by a fresh critical reviewer (Sports signed off in round 1; Dinner not after two rounds); release packaging script; coverage audit (642 rows) and its fixes; shared-code review fixes; Sports commit and orchestrator fixes for Dinner (own-environment cloche, plate clearcoat, layout, settle). Commits `339c66a` → `e88ff0e` |
| (No work: session ended while the Mac slept) | 08:14 | 11:31 | — | Excluded from working time |
| Checkpoint 4 — collection review, coverage refresh, Dinner round 3 | 11:31 | 15:17 | ~3 h 45 m | Low-tier gobo and Business sway fixes; five-lens collection review with skeptic verification (54 findings confirmed); disposal framing from the real bin geometry; Dinner layout, transfer and motion fixes; Dinner builder round 3; render cost, timing and cold-load measurements; coverage refresh of every requirement. About an hour of agent progress was lost to agents being interrupted at turn changes and when the Mac slept. Commits `5ccecde` → `ae8928f` |
| Disk full; food shelved | 15:17 | 15:25 | ~10 m | The disk ran out of space (agent renders); cleaned up, Surya freed more. Surya shelved Dinner's food: focus on the unveiling |
| Checkpoint 4 — fixes and Dinner unveiling | 15:25 | 16:52 | ~1 h 25 m | Six fix batches in isolated worktrees (showcase shell, gallery, Party finish, Sports, Business, engine), each followed by an independent verifier; Dinner unveiling critical review and its fixes; interim coverage table; Dinner posters. Commits `a043537` → `baa8a00` |
| (No work: session idle overnight) | 16:52 | 15:17 (30th) | — | Excluded from working time. The verifiers that were running stopped with the session and were re-run the next day |

## 2026-09-30

| Milestone | Start | End | Elapsed | Notes |
| --- | --- | --- | --- | --- |
| Checkpoint 4 — close-out | 15:17 | 16:57 | ~1 h 40 m | Verifier fixes; Sports, Business and engine batches merged; final posters and thumbnails for all five scenes; live render-cost peaks, frame cadence, cold load; WebGL leak and Static round-trip checks; procedural textures kept in a CPU copy so a restored context is never black; final test runs (134 unit, 69 browser); release script refreshes the Creative masters and exports; coverage close-out with a skeptic on every upgrade; revision #19. Commits `eac6dc3` → `a660a1a` |
| Checkpoint 5 — qualification review and release | 16:57 | <!--END--> | <!--ELAPSED--> | Master coverage close-out; independent qualification, handoff and collection reviewers with a skeptic each, and their fixes; time log; release build and package; checkpoint review page |

## 2026-10-01

| Milestone | Start | End | Elapsed | Notes |
| --- | --- | --- | --- | --- |
| v1.2 — scan-to-CAD masters (owner request) | ≈01:50 | ≈06:45 | ~4 h 55 m (start inferred from the masters' copy time, 01:53) | Brief with measured master facts (`docs/new-models-brief.md`). Foundation: import pipeline, runtime support and the Sports proof, adversarially reviewed (`c403a32`, 02:54). Five scene agents in parallel worktrees, interrupted at 03:20 by the laptop closing (handoff `docs/RESUME.md`) and resumed at 03:37. Scene commits 03:47–04:24 (Party fix `2ecf5b1` at 04:24), Business v1.2.1 at 05:16; merges to `main` as each landed. Three independent judges (05:20–05:37), polish per scene (05:38–06:04, merged by `b225f95`), Sports amplitude pass `a613138` (06:11). Docs consolidation and two adversarial verifications (05:40–06:38). Every measurement re-run at HEAD `a613138` at 06:26–06:38 (`docs/qualification.md` v1.2). |
| v1.3 — studio pass (owner's audit: "cartoonish compared to the original renders") | ≈13:15 | ≈18:55 | ~5 h 40 m (start from the brief's file time, 13:16) | Brief with the five causes (`docs/studio-pass-brief.md`). Infrastructure: rig modules, perspective lens, grades and CSS finish removed (`a62fab0`, 13:50); metals and `?rig=` (`ee87771`, 14:20). Four rig designers in parallel worktrees, commits 16:16–16:30 (`daylight-table` recovered from an uncommitted checkout), merged 16:36. Three independent judges (16:37–17:24; two stalled and were retried). The integration agent stopped at a session limit (17:25); `neutral-room` made the default with tokens, posters and thumbnails regenerated (`40f9e04`, 17:44). Every measurement re-run at `40f9e04` (17:45–17:53). Docs pass (≈18:00–18:25). Adversarial review against the master renders (pass with fixes), then a documentation-only fix pass with the browser suite re-run (71 / 71) and a determinism re-check in a clean copy (≈18:35–18:55) |

## Actual time so far

- Estimation checkpoint (visual study + Business, 16:20 → 20:50): **4 h 30 m** elapsed, including independent reviews. The milestone rows add up to about 5 h 20 m because they overlap; the earlier checkpoint entry gave about 5 h 30 m.
- Through the Birthday first pass (16:20 → 03:13): **about 10 h 55 m** wall-clock, including the checkpoint 2 package, the premium rework that followed checkpoint 2 feedback, and any time waiting on checkpoint replies. The review-fix pass (03:13 → 04:09) adds about 1 h, so about 12 h in total.

## Forecast for the remaining scenes (refreshed at the Birthday first pass)

The checkpoint forecast was 1–1.5 h per scene with review. At the premium level the observed wall-clock was:

- **Party:** about 1 h from groundwork to the Milestone 3 commit (≈01:52 → 02:54), plus its share of the current fix pass.
- **Birthday:** about 20 min for the first pass, but only because the premium cake was built in fidelity pass 1 and the bin and layout contract landed with Milestone 3. The fix pass is still running. Counting those pieces and the fix pass, Birthday is also about 1.5 h.

So a premium scene took about 1.5 h wall-clock including its fix pass: the top of the checkpoint range, reached only because three to four agent streams ran at once. Party's and Birthday's hours overlap in wall-clock. The forecast below assumes Dinner and Sports run one after the other, each with the same parallel agent setup inside it:

| Remaining | Forecast (wall-clock) | Why |
| --- | --- | --- |
| Dinner | ~1–1.25 h + ~30 m fix pass | Cloche and plate are turned profiles (the record player's helpers cover them); decline reuses the shared bin. New work: plate and cloche choreography, glaze and anisotropic cloche lookdev |
| Sports | ~1.5 h + ~30 m fix pass | New geometry with no reuse: open lattice net, rim, bracket and board, ball seams. The net needs its own bounded secondary motion and framing checks |
| Collection review and qualification tooling | ~1.5 h | Cross-scene consistency, re-measured budgets, phone runs prepared |
| Packaging | ~1 h | Build, handoff docs, final captures |

Projected total: about 12 h done and about 6–6 h 15 m remaining, so **roughly 18 h wall-clock**. That is above the 15-hour fee calculation. It excludes physical-device time on Surya's side and any further look changes after checkpoints.

## Actual total against the forecast

Working wall-clock, gaps excluded:

| Span | Wall-clock |
| --- | --- |
| 28th 16:20 → 29th 04:09 (Milestones 0–4, checkpoints 2 and 3, including time waiting on checkpoint replies) | 11 h 49 m |
| 29th 04:09 → 08:14 (Sports and Dinner premium builds with critical reviewers) | 4 h 05 m |
| 29th 11:31 → 16:52 (checkpoint 4: collection review, Dinner round 3, fix batches) | 5 h 21 m |
| 30th 15:17 → <!--END--> (checkpoint 4 close-out, checkpoint 5 and release) | <!--TODAY--> |
| **Total** | **<!--TOTAL-->** |

The refreshed forecast was about 18 h: roughly 12 h done at the Birthday first pass and 6 h to go. From that point the work actually took about <!--REMAINING-->, twice the forecast. Where the extra time went:

- **Dinner** needed three builder rounds with a critical reviewer after each, then an unveiling review and its fixes. The forecast allowed one round and a fix pass.
- **The collection review** (checkpoint 4) confirmed 54 findings across all five scenes. They took six fix batches with a verifier each. The forecast allowed about 1.5 h for collection review and qualification tooling.
- **Lost time.** About an hour of agent progress was lost when agents were interrupted at turn changes and when the Mac slept. The disk filling up cost a restart of the fix planning, and the overnight stop meant the verifiers had to run again.

So against the 15-hour fee calculation, the premium collection took about <!--TOTAL--> of wall-clock. That total leaves out physical-device qualification on Surya's iPhone (not done yet) and any look changes after Surya reviews checkpoints 4 and 5.
