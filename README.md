# Livetime invitation interactions

Five real-time 3D RSVP scenes — Party (a vintage turntable), Birthday (a two-tier piped cake with six candles), Sports (a basketball and wall-mount hoop), Dinner (a silver cloche over a clean porcelain plate) and Business (an all-access badge and a card reader) — with an embeddable, framework-free controller and a standalone showcase. Since v1.2 (2026-10-01) the objects are scan-to-CAD rebuilds: realistic PBR models that design.inc rebuilt from scans. The guest chooses Accept or Decline in HTML first; the object then acts out the answer. Saves in the showcase are simulated.

## Quick start

```bash
pnpm install
pnpm dev        # showcase at http://127.0.0.1:5199/  (?scene=party|birthday|sports|dinner|business); /gallery.html compares all five
```

Since v1.4 the showcase is fullscreen: the scene fills the viewport and the UI floats over it (a side dock on landscape screens, a bottom sheet on portrait ones). Embeds choose with `createInvitation({ layout: 'square' | 'fullscreen' })`; square stays the default (`docs/integration.md`).

v1.7 (2026-10-06) is the revisions: the Dinner reveal uncovers an invitation card lying flat on the plate — "You're invited", the event title and the invitee's name in a bundled Inter print — and the camera then turns down to a head-on close-up that is the accepted pose; the Sports decline is a hard bank off the glass that rattles three times on the ring and never goes in, framed 1.5× larger on backboard, rim, net and ball; and the net is rebuilt as a slack, damped net that wraps the ball, whips back as one body and hangs still in 1.6 s (`docs/style-reference.md` v1.7; `docs/revisions-v1.7-brief.md`; `docs/scenes/*-v1.7*.md`; the decisions #41–#44 in `docs/spec-revisions.md`, pending Surya). V17_README_STATUS_PLACEHOLDER

v1.6 (2026-10-03 → 05) is the Hollywood pass: the cake's piping is regenerated as hand-piped star-tip rope under a baked-light food shader (signed by its VFX judge at square, laptop and phone size; the 30× macro stays at 5.5 / 5 as a known gap, below any size a guest sees), the flames are raymarched volumes with a selective HDR bloom and heat haze and the smoke a marched volume with torn threads and sheet fold lines (signed as a whole sequence at the showcase sizes; the close-up tiers are known gaps of a 5 mm voxel smoke), the steam is a raymarched volume that accumulates in the cloche's cavity, holds its shape as the cloche lifts and rises as a thinning condensate cap (eight polish rounds, the last merged at 004e95d: a steam-only light and a full-resolution edge pass; 7.5 / 7.5 at the eighth judging and 8 / 7.5 at CSS size, not signed: its soft 2× body is the method's limit — `docs/qualification.md` v1.6 has every score and `docs/RESUME.md` the next approach), and every runtime GLB is meshopt-compressed (`docs/style-reference.md` v1.6; `docs/hollywood-pass-brief.md`; `docs/scenes/*-v1.6*.md`).

v1.5 (2026-10-02) is the perfection pass: the record plays on at 33⅓ rpm after acceptance, the candles are real-size flames that blow out into smoke and melt the wax, the cake is hand-finished buttercream, the ball bounces and the net is simulated, steam spills from under the cloche, the bin is a real pedal bin and the reader's status is a backlit pictogram; the camera pulls back only for the decline. `docs/style-reference.md` v1.5 has the table of the twelve edits; `docs/perfection-pass-brief.md` the brief; `docs/scenes/<scene>-v1.5*.md` each owner's record.

On a local host the showcase also takes `?rig=<name>` to light the scene with another studio rig from `src/render/rigs/` (`neutral-room` is the production rig; `product-studio`, `daylight-table`, `livetime-warm` and `v1.1` are kept for comparison), and `&camera=ortho` for the v1.1 orthographic camera.

Requires Node ≥ 22.12 and pnpm 11 (pinned in `package.json`). Tests: `pnpm test` (unit) and `pnpm test:browser` (behaviour, uses the installed Google Chrome).

## Where things are

| Path | What |
| --- | --- |
| `src/core/` | Controller, response ledger, visual director, clock, scene contract (`types.ts` is the public API) |
| `src/scenes/<category>/` | Per-scene poses, pure time-sampled sequences and scene module |
| `models/` | Runtime rigs, the code-authored parts (Sports stand, Birthday wicks and flames, Party tonearm rest, contract skeletons, the shared bin) and the v1.1 builders kept for lookdev; `*Contract.ts` fixes the dimensions the choreography relies on, measured from the masters |
| `models/masters/` | The eight scan-to-CAD masters (`*.glb`: basketball, hoop, turntable, cake, plate, cloche, badge, reader), copied unmodified; generators and process notes in `github.com/suryanewa/scan-to-cad-rebuilds` |
| `scripts/masters/` | The master import path: one recipe per scene (`recipes/<scene>.ts`, with a Decisions block), the composer and the export report; `README.md` there is the guide |
| `src/render/` | Renderer, stage and camera (the 18° perspective product lens), the rig contract (`rig.ts`) and registry (`rigRegistry.ts`), the shared studio kit (sweep backdrop, 16-tap soft shadows, the v1.1 gobo and plaster), materials, printed art |
| `src/render/rigs/` | Studio rigs, one file each, registered by file name: `neutral-room` (production, `DEFAULT_RIG`: the Models viewer's room on a greige cove), `product-studio`, `daylight-table`, `livetime-warm`, `v1.1`. Selectable with `?rig=` on a local host; `README.md` there is the guide. `pnpm capture rigs` and `pnpm capture stagecolor` compare them and measure their backdrops |
| `src/demo/`, `src/ui/` | Showcase shell and guest controls; `mockAdapter.ts` is the simulated persistence |
| `assets/` | Runtime GLB models, posters, collection thumbnails |
| `scripts/` | Model export (`pnpm models <scene>`: masters + builder → one runtime GLB, deterministic) and evidence capture (`pnpm capture <mode>`) |
| `tests/`, `tests/browser/` | Unit and browser tests |
| `docs/` | Integration guide, style reference, asset manifest, qualification record, spec revisions, time log |
| `docs/scenes/` | One note per scene for v1.2 (`<scene>-v1.2.md`): decisions, measured contract numbers, export report, choreography changes, known gaps |
| `docs/new-models-brief.md` | The v1.2 brief: the owner's request, the masters, the scene mapping and the owner decisions (budgets waived; Dinner without food) |
| `docs/studio-pass-brief.md`, `docs/rigs/` | The v1.3 studio pass: the brief (why v1.2 looked cartoonish and the five causes) and one note per rig with its reasoning, measured stage colour and iterations |
| `docs/perfection-pass-brief.md`, `docs/scenes/*-v1.5*.md` | The v1.5 perfection pass: the twelve edits with their owners and standards, and one record per owner (Party, Birthday cake, Birthday fire, Sports, Dinner, bin, Business) with the research, the numbers, the judges' findings and what each polish round changed |

## Documentation

- [Integration guide](docs/integration.md): embedding, configuration, responses (idempotency and ordering), fallbacks, lifecycle.
- [Style reference](docs/style-reference.md): v1.7, the revisions (the card and the close-up, the bank, the net), v1.6, the Hollywood pass (the cake, the flames, the steam, meshopt), v1.5, the perfection pass (the twelve edits, the decline pull-back, the stage at 2 device pixels), v1.4 (one world scale, the hero framing rule), v1.3, the studio pass (the production rig, the perspective lens, the grades removed, the stage token), over v1.2 (the objects as the scan-to-CAD masters per scene), the interface (v1.1) and the palette (v1.0).
- [Asset manifest](docs/asset-manifest.md): provenance and licence of every model, texture and dependency.
- [Qualification record](docs/qualification.md): device coverage, measurements (v1.5 frame pacing at 2 device pixels on laptop and phone; v1.3 re-measured under the new studio, budgets waived), the v1.6 VFX judgings of the cake, the flames and the steam (seven steam rounds and their scores), the v1.5 judging of the twelve edits, the rig judging, known limitations.
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
