# Asset conventions and provenance manifest

Owner: design.inc. Every mesh, texture, font, environment and sound used at runtime is listed here with creator/source, licence, modifications, source master and runtime derivative (Master §8).

## Conventions

- **Axes and units.** Y-up, right-handed, ground plane at y = 0. One scene unit is a "stage decimetre": objects are stylised, not real-world scale. A ready-pose object spans roughly 2–2.5 units so the shared camera frames every family consistently.
- **Transforms.** Applied transforms; origins at the natural contact point (base centre for grounded objects, clip pivot for the card). Pivots are named nodes, never implicit mesh origins.
- **Named nodes.** Each scene exports exactly the node names in its sub-spec (e.g. `business_root`, `card_authored`, `card_secondary`, `clip_pivot` …). Authored motion writes `*_authored`; bounded secondary springs write only `*_secondary` children. No node is written by two systems.
- **Materials.** `mat_<role>[_<preset>]`, resolved at runtime from the selected direction's material library, so presets and art direction change values, not geometry. Roughness bands: satin 0.40–0.55, enamel 0.62–0.75, metal 0.25–0.40, food 0.55–0.86. Metalness 0 or 1 except explicitly anodised or painted metal.
- **Status materials** are unique instances (`mat_status`) so indicator colour never touches card or body materials.
- **Signature detail.** UVs on signature surfaces map one UV unit to one tile in scene units, so stipple or perforation density is identical on every object.
- **Contact shadows** are named `<object>_shadow`, move with their object, and fade and spread with height.
- **Posters.** WebP per scene × visually distinct preset × {guest-ready, accepted, declined}, same framing/background as the renderer, generated from the browser renderer. Only the currently needed poster is fetched.
- **Runtime binding.** GLB materials are named placeholders; `bindLibraryMaterials` re-binds them from the locked library at load, so tokens change without re-exporting geometry.
- **Masters.** Models are code-authored parametric sources in `models/` (see below). Selected high-resolution exports and approved style frames go to `~/Creative/Livetime/invitation-interactions/`.

## Why code-authored masters

This machine has no Blender installation, and the handoff transfers no DCC files. The models are therefore authored as explicit, parametric TypeScript builders: lathe profiles with per-corner fillets, bevelled extrusions, rounded boxes and fixed-length strap curves. Each builder is the editable master. It is original work, has no third-party geometry, and exports deterministically to GLB from Milestone 2 onward. Primitive-looking parts are placeholders only where the study labels them "blockout". This substitution needs Surya's visual approval at the style-selection gate (Master §5: "do not substitute generic primitive assemblies … without visual approval").

## Provenance

| Asset | Creator / source | Licence | Modifications | Source master | Runtime derivative |
| --- | --- | --- | --- | --- | --- |
| Studio environment (softbox room) | design.inc, procedural | Original | — | `src/render/lighting.ts` | PMREM texture generated at load (no file) |
| Stipple normal map | design.inc, procedural | Original | — | `src/render/textures.ts` | Canvas texture generated at load |
| Perforation colour/normal maps | design.inc, procedural | Original | — | `src/render/textures.ts` | Canvas textures generated at load |
| Weave normal map (lanyard) | design.inc, procedural | Original | — | `src/render/textures.ts` | Canvas texture generated at load |
| Ring normal maps (pad, record) | design.inc, procedural | Original | — | `src/render/textures.ts` | Canvas texture generated at load |
| Contact-shadow falloff | design.inc, procedural | Original | — | `src/render/contactShadow.ts` | Canvas texture generated at load |
| Premium studio: palm gobo cookie, limewash plaster sweep, 16-tap PCF patch | design.inc, procedural | Original | — | `src/render/studio.ts` | Canvas textures generated at load (768² cookie, 512² plaster normal + albedo) |
| Printed art: badge faces, strap, record labels, holo seal, groove directions | design.inc, procedural (original geometric glyphs, no fonts) | Original | — | `src/render/print.ts` | Canvas textures generated at load |
| Stage finish: vignette + film grain | design.inc | Original | — | `src/ui/shell.css` (SVG feTurbulence data URI) | Inline CSS |
| Cake, tray, candles, flames | design.inc | Original | — | `models/cake.ts` | Study: runtime geometry. Production: `assets/scenes/birthday/` (M4) |
| Keycard, clip, scanner (static geometry, L2 premium) | design.inc | Original | — | `models/keycard.ts` + `models/badgePremium.ts` (SDF reader, cast clip) | `assets/scenes/business/business.glb` — `pnpm models`: GLTFExporter → gltf-transform dedup/weld/prune/quantise; SDF parts decimated with meshoptimizer at export · 720.6 KiB raw / 267.6 KiB gz · 32 nodes · 19 primitives |
| Lanyard strap curves, contact shadows, status/symbol materials | design.inc | Original | Runtime rig | `models/keycard.ts` (`rigKeycard`), `models/lanyard.ts` | Generated at load; not in the GLB |
| Business posters (light/dark × host-ready, guest-ready, accepted, declined) | design.inc, browser-rendered | Original | — | `pnpm capture business` (shipping renderer, fixed camera, reduced-motion canonical poses) | `assets/scenes/business/posters/*.webp`, 720², q0.86, 12–15 KB each |
| Collection-rail thumbnails (5) | design.inc, browser-rendered | Original | Live scenes from their production capture (`pnpm capture <scene>`); others from direction-L study models (`pnpm capture thumbs`) | — | `assets/ui/collection/*.webp`, 192², 2–3.5 KB each |
| Record player (production) | design.inc | Original | — | `models/recordContract.ts`, `models/recordPremium.ts`, rig `models/recordPlayer.ts` | `assets/scenes/party/party.glb` — `pnpm models party` |
| Party posters (coral/cobalt × host-ready, guest-ready, accepted; shared declined) | design.inc, browser-rendered | Original | — | `pnpm capture party` | `assets/scenes/party/posters/*.webp`, 720², q0.86 |
| Basketball/hoop, covered dish blockouts | design.inc | Original | Study blockouts only | `models/blockouts.ts` | Study only |
| Three.js RoundedBoxGeometry, BufferGeometryUtils, LatheGeometry | three.js authors | MIT | Used as library code | `node_modules/three` | Bundled |
| UI typography | Platform system fonts (SF Pro, Segoe UI, Roboto) | OS-provided, not redistributed | — | — | None shipped |
| Icons (check, minus, back chevron) | design.inc, inline SVG paths | Original | — | `src/demo/study.ts`, `src/ui/` | Inline |
| Audio | None | — | Audio is absent from v1 | — | — |

No fonts, HDRIs, photographs, generated images or brand assets from third parties are used.
