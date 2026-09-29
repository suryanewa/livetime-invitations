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
