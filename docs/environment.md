# Environment and dependency record

Recorded 2026-09-28 at Milestone 0. Update when a dependency changes; never leave floating versions.

## Checkout

- Implementation checkout: `~/Developer/projects/livetime-invitations` (new; no pre-existing work to preserve).
- Creative masters and selected high-resolution exports: `~/Creative/Livetime/invitation-interactions/` (`study/`, `masters/`, `exports/`).
- Specifications stay in the Vault (Mac Mini canonical; snapshot at `~/Downloads/Livetime Spec/`). No application code or runtime logs go to the Vault.
- Conventions follow sibling projects in `~/Developer/projects/` (pnpm, exact pins, Vite, Vitest, Playwright tooling).

## Pinned dependencies

| Package | Version | Licence | Role |
| --- | --- | --- | --- |
| three | 0.186.1 | MIT | Runtime renderer, GLTFLoader, geometry utilities (only shipped dependency) |
| typescript | 5.9.3 | Apache-2.0 | Type checking (7.0.2 available; held at 5.9 for @types/three compatibility) |
| vite | 8.3.1 | MIT | Showcase dev server and static build |
| vitest | 5.0.2 | MIT | Unit tests for state, clock and lifecycle contracts |
| @types/three | 0.186.0 | MIT | Types |
| @types/node | 24.19.0 | MIT | Tooling types |
| playwright-core | 1.63.0 | Apache-2.0 | Capture/qualification scripts driving the installed Google Chrome (no browser download) |
| @gltf-transform/core, /functions | 4.5.1 | MIT | GLB assembly and optimisation (dev only; pulls sharp/libvips LGPL as a dev-time transitive, never shipped) |
| meshoptimizer | 1.3.0 | MIT | Mesh compression evaluation (dev only until measured) |

Package manager `pnpm@11.0.4`; Node `24.5.0` (engines ≥22.12). `.npmrc` sets `save-exact=true`.

## Browser requirements

- WebGL2 (Three.js r186 WebGLRenderer baseline). Without WebGL2 the component shows posters and keeps full HTML response controls.
- ES2022 JavaScript. No WebGPU dependency.
- Colour pipeline: sRGB output, linear working space, `NeutralToneMapping`, exposure 1.0 (confirmed present in r186).
- r186 removed `PCFSoftShadowMap`; this project uses baked-style contact shadows and no shadow maps.

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
| `pnpm build` | Typecheck + static build to `dist/` |
| `pnpm capture study` | Study stills into `outputs/study/` (dev server must be running) |
| `pnpm capture motion` | Study motion samples (video) into `outputs/motion/` |
