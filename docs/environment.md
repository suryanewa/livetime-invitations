# Environment and dependency record

Recorded 2026-09-28 at Milestone 0; package list and licences reconciled with `package.json` and each package's own `license` field on 2026-09-29. Update when a dependency changes; never leave floating versions.

## Checkout

- Implementation checkout: `~/Developer/projects/livetime-invitations` (new; no pre-existing work to preserve).
- Creative masters and selected high-resolution exports: `~/Creative/Livetime/invitation-interactions/` (`study/`, `masters/`, `exports/`).
- Specifications stay in the Vault (Mac Mini canonical; snapshot at `~/Downloads/Livetime Spec/`). No application code or runtime logs go to the Vault.
- Conventions follow sibling projects in `~/Developer/projects/` (pnpm, exact pins, Vite, Vitest, Playwright tooling).

## Pinned dependencies

| Package | Version | Licence | Role |
| --- | --- | --- | --- |
| three | 0.186.1 | MIT | Runtime renderer, GLTFLoader, geometry utilities (the only runtime dependency) |
| typescript | 5.9.3 | Apache-2.0 | Type checking (7.0.2 available; held at 5.9 for @types/three compatibility) |
| vite | 8.3.1 | MIT | Showcase dev server and static build |
| vitest | 5.0.2 | MIT | Unit tests for state, clock, lifecycle and model contracts |
| @types/three | 0.186.0 | MIT | Types |
| @types/node | 24.19.0 | MIT | Tooling types |
| playwright-core | 1.63.0 | Apache-2.0 | Capture scripts (`scripts/capture.ts`) driving the installed Google Chrome (no browser download) |
| @playwright/test | 1.63.0 | Apache-2.0 | Browser behaviour checks (`tests/browser/`, `playwright.config.ts`), same installed Chrome |
| @gltf-transform/core | 4.5.1 | MIT | GLB assembly at export (`scripts/export-models.ts`); dev only |
| @gltf-transform/extensions | 4.5.1 | MIT | Extension registry for reading/writing the exported GLB (`KHR_mesh_quantization`, `KHR_materials_unlit`); dev only |
| @gltf-transform/functions | 4.5.1 | MIT | dedup, weld, prune, quantize at export; dev only |
| meshoptimizer | 1.3.0 | MIT | Tooling only: `models/simplify.ts` decimates the SDF-modelled parts at GLB export and on the lookdev page. Never imported by the runtime bundle, which loads the pre-decimated GLB |

Transitive, dev only: `@gltf-transform/functions` pulls `ndarray-pixels` → `sharp` 0.35.5 (Apache-2.0) with its prebuilt `@img/sharp-libvips` 1.3.4 (LGPL-3.0-or-later). The export does no image work and none of it is shipped.

Package manager `pnpm@11.0.4`; Node `24.5.0` (engines ≥22.12). `.npmrc` sets `save-exact=true`.

## Browser requirements

- WebGL2 (Three.js r186 WebGLRenderer baseline). Without WebGL2 the component shows posters and keeps full HTML response controls.
- ES2022 JavaScript. No WebGPU dependency.
- Colour pipeline: sRGB output, linear working space, `NeutralToneMapping`, exposure 1.0 (confirmed present in r186).
- Shadows: r186 removed `PCFSoftShadowMap` (it falls back to `PCFShadowMap` with a warning). The premium studio (`src/render/studio.ts`) uses `PCFShadowMap` from one spot key (1024² map, radius 6) with three's 5-tap noisy PCF chunk patched to 16 fixed Vogel taps: soft, noise-free and no extra draw calls. Contact shadows stay under every object, and at the Low tier they are the only shadows (the shadow map is switched off and freed; the Static tier shows the poster).

## Development host

- MacBook Pro, Apple M2 Pro, 16 GB, macOS 26.6 (25G5065a).
- Google Chrome 153.0.8010.53; Safari 26.6. Firefox not installed.
- Headless capture renderer: `ANGLE Metal Renderer: Apple M2 Pro` (hardware, not SwiftShader).

This host is the authoring machine, not a qualification device. Desktop timing on it is not mobile performance evidence.

## Scripts

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Showcase at `http://127.0.0.1:5199/`, study at `/study.html` |
| `pnpm typecheck` | Strict TypeScript check |
| `pnpm test` | Unit tests |
| `pnpm test:browser` | Browser behaviour checks (`tests/browser/`) against the dev server |
| `pnpm build` | Typecheck + static build to `dist/` |
| `pnpm models [scene…]` | Export code-authored masters to runtime GLB (`business`, `party`, `birthday`, `bin`) |
| `pnpm capture study` | Study stills into `outputs/study/` (dev server must be running) |
| `pnpm capture motion` | Study motion samples (video) into `outputs/motion/` |
| `pnpm capture <scene>` | Posters, review clips and rail thumbnail for `business`, `party` or `birthday` |
| `pnpm capture thumbs` / `lookdev` / `perf` / `ui` | Study-model thumbnails, fidelity lookdev, frame times, showcase UI captures |
