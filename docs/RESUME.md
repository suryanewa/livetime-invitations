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
