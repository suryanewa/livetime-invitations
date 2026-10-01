# Livetime invitation interactions

Five real-time 3D RSVP scenes — Party (a vintage turntable), Birthday (a two-tier piped cake with six candles), Sports (a basketball and wall-mount hoop), Dinner (a silver cloche over a clean porcelain plate) and Business (an all-access badge and a card reader) — with an embeddable, framework-free controller and a standalone showcase. Since v1.2 (2026-10-01) the objects are scan-to-CAD rebuilds: realistic PBR models that design.inc rebuilt from scans. The guest chooses Accept or Decline in HTML first; the object then acts out the answer. Saves in the showcase are simulated.

## Quick start

```bash
pnpm install
pnpm dev        # showcase at http://127.0.0.1:5199/  (?scene=party|birthday|sports|dinner|business); /gallery.html compares all five
```

Requires Node ≥ 22.12 and pnpm 11 (pinned in `package.json`). Tests: `pnpm test` (unit) and `pnpm test:browser` (behaviour, uses the installed Google Chrome).

## Where things are

| Path | What |
| --- | --- |
| `src/core/` | Controller, response ledger, visual director, clock, scene contract (`types.ts` is the public API) |
| `src/scenes/<category>/` | Per-scene poses, pure time-sampled sequences and scene module |
| `models/` | Runtime rigs, the code-authored parts (Sports stand, Birthday wicks and flames, Party tonearm rest, contract skeletons, the shared bin) and the v1.1 builders kept for lookdev; `*Contract.ts` fixes the dimensions the choreography relies on, measured from the masters |
| `models/masters/` | The eight scan-to-CAD masters (`*.glb`: basketball, hoop, turntable, cake, plate, cloche, badge, reader), copied unmodified; generators and process notes in `github.com/suryanewa/scan-to-cad-rebuilds` |
| `scripts/masters/` | The master import path: one recipe per scene (`recipes/<scene>.ts`, with a Decisions block), the composer and the export report; `README.md` there is the guide |
| `src/render/` | Renderer, premium studio (light, gobo, plaster, soft shadows), materials, printed art |
| `src/demo/`, `src/ui/` | Showcase shell and guest controls; `mockAdapter.ts` is the simulated persistence |
| `assets/` | Runtime GLB models, posters, collection thumbnails |
| `scripts/` | Model export (`pnpm models <scene>`: masters + builder → one runtime GLB, deterministic) and evidence capture (`pnpm capture <mode>`) |
| `tests/`, `tests/browser/` | Unit and browser tests |
| `docs/` | Integration guide, style reference, asset manifest, qualification record, spec revisions, time log |
| `docs/scenes/` | One note per scene for v1.2 (`<scene>-v1.2.md`): decisions, measured contract numbers, export report, choreography changes, known gaps |
| `docs/new-models-brief.md` | The v1.2 brief: the owner's request, the masters, the scene mapping and the owner decisions (budgets waived; Dinner without food) |

## Documentation

- [Integration guide](docs/integration.md): embedding, configuration, responses (idempotency and ordering), fallbacks, lifecycle.
- [Style reference](docs/style-reference.md): v1.2, the objects as the scan-to-CAD masters per scene, over the approved premium studio and interface (v1.1) and the palette (v1.0).
- [Asset manifest](docs/asset-manifest.md): provenance and licence of every model, texture and dependency.
- [Qualification record](docs/qualification.md): device coverage, measurements (v1.2 re-measured, budgets waived), known limitations.
- [Coverage table](docs/coverage.md): every Master and sub-spec requirement linked to a result or a recorded exception (regenerate with `node --experimental-strip-types scripts/coverage-table.ts`). It still reflects the checkpoint 5 audit; it has not been re-audited for v1.2 (the three-candle, Dinner food and triangle-budget rows are superseded by `docs/qualification.md` v1.2).
- [Spec revisions](docs/spec-revisions.md): approved and recorded deviations to reconcile into the Master Specification.
- [Time log](docs/time-log.md): actual effort by milestone.

## Release package

`pnpm package:release` copies the source (git archive of HEAD), runtime assets, the static build, evidence clips and stills, and these docs into `~/Creative/Livetime/invitation-interactions/release-<date>/` with a SHA-256 manifest. Nothing is sent or deployed.

## Boundaries

No real RSVP provider, public deployment or native-app integration is included. Performance and phone coverage are recorded in the qualification record, including what is still unverified.

## Reconciling with the project records

The Vault notes are the owning records, and this checkout received only a read-only snapshot of them. So nothing here edits the Vault. When the notes are next reconciled on the Mac Mini, link these from the engagement note:
- **Implementation:** this repository, `~/Developer/projects/livetime-invitations` (since v1.2 also on GitHub as `suryanewa/livetime-invitations`, private). The scan-to-CAD masters' generators: `suryanewa/scan-to-cad-rebuilds` (private).
- **Creative masters and release packages:** `~/Creative/Livetime/invitation-interactions/`. `release-<date>/` holds the source archive, runtime assets, showcase build, evidence, docs and a SHA-256 manifest. `study/` holds the approved style-lock references.
- **Spec changes to fold into the Master Specification and the sub-specs:** `docs/spec-revisions.md`.
- **Qualification and coverage:** `docs/qualification.md` and `docs/coverage.md`.
