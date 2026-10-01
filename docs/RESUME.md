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
