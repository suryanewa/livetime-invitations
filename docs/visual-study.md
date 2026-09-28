# Visual study record — Milestone 1

Spec: `Vault Snapshot/Work/Projects/Livetime/Invitation Interactions/Visual Study.md`.
Live board: `pnpm dev` → `http://127.0.0.1:5199/study.html` (every image rendered live by the shipping renderer).

## Controlled comparison

Held identical between directions: orthographic camera (azimuth 20°, elevation 15°), motion-bounds framing with 8% clearance, stage `#F4F1EB`, studio rig (upper-left softbox key, restrained right fill, procedural PMREM environment), NeutralToneMapping at exposure 1.0, contact-shadow recipe, HTML controls and event copy, and the card-settle spring (damping 0.85, fixed 1/120 s step).

Varied: materials (satin + light clearcoat vs matte enamel), bevel ratio (16% vs 28%), fullness (1.00 vs 1.06), accent placement, and the signature detail (fine stipple inlay vs a single row of perforations).

## Required artifacts → where they are

| # | Artifact (Visual Study spec) | Location |
| --- | --- | --- |
| 1 | Four 390×844 browser style frames (cake A, keycard A, cake B, keycard B) | Board §01 · `outputs/study/frame-*.png` |
| 2 | Family contact sheet, five blockouts per direction | Board §02 · `outputs/study/contact-sheet-{A,B}.png`, blind versions `*-blind.png` |
| 3 | Two material-detail crops per direction at mobile render scale | Board §03 · `outputs/study/detail-crops.png` |
| 4 | Narrow 320 px crops of cake and card | Board §04 · `outputs/study/narrow-320.png` |
| 5 | Token sheet per direction | Board §05 · `outputs/study/token-sheets.png`, source `src/render/materials.ts` |
| 6 | Two-second browser motion sample per direction | Board §06 (live) · `outputs/motion/settle-{A,B}.mp4` (deterministic 60 fps frames) |

`outputs/` is disposable and git-ignored. On selection, the chosen frames, sheets and motion sample are copied to `~/Creative/Livetime/invitation-interactions/study/`.

## Evaluation protocol

An independent panel scored both directions on the eight rubric dimensions, using the rendered images only (no scoring from intent):

- **Four lens judges:** art director, accessibility specialist, real-time 3D technical artist, audience strategist.
- **Blind tester:** saw only the unlabelled contact sheets.
- **Panel chair:** consolidated median scores with visual evidence, a recommendation, tradeoffs and named experiments.
- **Adversarial reviewer:** tried to refute the scores and the recommendation.

Scores support the decision. They do not replace Surya's judgment.

## Outcome

Scores (median, reviewer corrections applied): **A 26/40, B 28/40, no blockers.** Blind test: all five objects named correctly in both directions. Full record in `src/demo/studyRubric.ts`; raw panel output in `outputs/study/panel/panel-result.json`.

**Selection (recorded by Surya, 2026-09-28, checkpoint 1):** B + A restraint, and additionally keep Direction A’s coloured candles and A’s covered dish. This becomes one revised token sheet, direction **L**, refined once from the panel’s consolidated defects before the Business scene (see `docs/style-reference.md`).
