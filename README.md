# Livetime invitation interactions

Five real-time 3D RSVP scenes — Party (record player), Birthday (cake), Sports (basketball), Dinner (covered dish) and Business (keycard) — with an embeddable, framework-free controller and a standalone showcase. The guest chooses Accept or Decline in HTML first; the object then acts out the answer. Saves in the showcase are simulated.

## Quick start

```bash
pnpm install
pnpm dev        # showcase at http://127.0.0.1:5199/  (?scene=party|birthday|sports|dinner|business)
```

Requires Node ≥ 22.12 and pnpm 11 (pinned in `package.json`). Tests: `pnpm test` (unit) and `pnpm test:browser` (behaviour, uses the installed Google Chrome).

## Where things are

| Path | What |
| --- | --- |
| `src/core/` | Controller, response ledger, visual director, clock, scene contract (`types.ts` is the public API) |
| `src/scenes/<category>/` | Per-scene poses, pure time-sampled sequences and scene module |
| `models/` | Code-authored models and runtime rigs; `*Contract.ts` fixes the dimensions the choreography relies on |
| `src/render/` | Renderer, premium studio (light, gobo, plaster, soft shadows), materials, printed art |
| `src/demo/`, `src/ui/` | Showcase shell and guest controls; `mockAdapter.ts` is the simulated persistence |
| `assets/` | Runtime GLB models, posters, collection thumbnails |
| `scripts/` | Model export (`pnpm models`) and evidence capture (`pnpm capture <mode>`) |
| `tests/`, `tests/browser/` | Unit and browser tests |
| `docs/` | Integration guide, style reference, asset manifest, qualification record, time log |

## Documentation

- [Integration guide](docs/integration.md): embedding, configuration, responses (idempotency and ordering), fallbacks, lifecycle.
- [Style reference](docs/style-reference.md): the approved premium look (v1.1) and object rules.
- [Asset manifest](docs/asset-manifest.md): provenance and licence of every model, texture and dependency.
- [Qualification record](docs/qualification.md): device coverage, measurements, known limitations.
- [Time log](docs/time-log.md): actual effort by milestone.

## Boundaries

No real RSVP provider, public deployment or native-app integration is included. Performance and phone coverage are recorded in the qualification record, including what is still unverified.
