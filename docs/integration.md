# Integration guide

How to embed a Livetime invitation scene in an app page. You need no knowledge of the scenes' internals: the controller owns loading, rendering, motion, fallbacks and the response ledger; your app owns persistence.

The public contract lives in `src/core/types.ts` (names follow Master Specification §7) and `src/core/controller.ts` (`createInvitation`, `InvitationHandle`, `InvitationState`). The standalone showcase (`src/demo/main.ts`) is a complete working example.

## Boundaries

- **No real RSVP service is included.** The showcase saves through `src/demo/mockAdapter.ts`, a clearly labelled simulation (normal 250 ms, slow 3 s, fail). Connecting a real provider is separate, authorised work.
- **Web only.** The controller is framework-free DOM + WebGL2 (Three.js r186). Native-app integration (a WebView bridge, offline asset packaging) has not been built or tested.
- **Evidence so far is desktop.** Phone and in-app-browser coverage is listed in `docs/qualification.md`, including the gaps.

## Install, run, build

Requires Node ≥ 22.12 and pnpm 11 (versions pinned in `package.json`).

```bash
pnpm install
pnpm dev            # showcase at http://127.0.0.1:5199/
pnpm build          # typecheck + production build into dist/
pnpm preview        # serve dist/ at http://127.0.0.1:5198/ (add --host for a phone on the same Wi-Fi)
pnpm test           # unit tests (Vitest)
pnpm test:browser   # behaviour tests in the installed Google Chrome (Playwright)
pnpm models         # re-export scene models to assets/ (GLB, quantised)
pnpm capture <mode> # evidence: business | party | birthday | sports | dinner | ui | perf | lookdev | backdrops
```

## Embedding

```ts
import { createInvitation } from './src/core/controller.ts';
import type { ResponseResult } from './src/core/types.ts';
import { posterUrl } from './src/demo/posters.ts';

const invitation = createInvitation({
  mount: document.querySelector('#invitation')!,   // the controller renders a square stage into it (see Layout)
  config: { category: 'birthday', cake: 'vanilla' },
  mode: 'guest',
  initialResponse: savedResponseFromYourApp,       // 'accept' | 'decline' | undefined
  scenes: {
    // Lazy: only the scene you show is downloaded.
    party: () => import('./src/scenes/party/index.ts').then((m) => m.partyScene),
    birthday: () => import('./src/scenes/birthday/index.ts').then((m) => m.birthdayScene),
    sports: () => import('./src/scenes/sports/index.ts').then((m) => m.sportsScene),
    dinner: () => import('./src/scenes/dinner/index.ts').then((m) => m.dinnerScene),
    business: () => import('./src/scenes/business/index.ts').then((m) => m.businessScene),
  },
  posterFor: posterUrl,                            // still images for loading, fallback and static tiers
  describePose: (category, pose) => myPoseText[category][pose], // text if a poster cannot load
  onResponseRequested: (request) => save(request), // see "Responses"
  onVisualComplete: ({ sequence }) => {},          // optional
  onResourceState: ({ state, reason }) => {},      // optional: poster | loading | ready | fallback | disposed
  onIntegrationError: (error) => report(error),    // optional: invalid category, mismatched or unknown result
  onStateChange: (state) => render(state),         // optional: full snapshot for your UI
});
```

Defaults: the approved look (direction `L2`; since v1.3 the production studio rig `neutral-room` through the perspective lens, with the stage token `--lt-stage` `#D5D2CD`), the user's `prefers-reduced-motion`, and the Normal quality tier with automatic step-down. Pass `reducedMotion` to override the OS setting, `direction` or `stage` (an options object, `stage: { rig, projection, fov }`: `rig` a rig name from `src/render/rigs/` or a `Rig`, `projection` `'perspective'` (default) or `'orthographic'`; `src/core/controller.ts`) only for tooling: the posters and the `--lt-stage` token belong to the production rig.

### Layout: square (default) or fullscreen (v1.4)

`layout` picks how the stage fills its mount. Existing embeds need no change.

- **`'square'`** (default): the controller renders a 1:1 stage, full width of the mount, with the stage radius. Everything else on the page is yours to lay out around it.
- **`'fullscreen'`**: the stage fills the mount at any aspect (size the mount yourself, e.g. `position: fixed; inset: 0`, or any box) and your UI floats over it. Tell the controller what your overlays cover so the object stays clear of them:

```ts
const invitation = createInvitation({
  mount: document.querySelector('#scene')!,       // sized by your CSS, any aspect
  layout: 'fullscreen',
  frameInsets: { top: 180, right: 0, bottom: 320, left: 0 }, // CSS px of the mount your UI covers
  backdropFor: backdropUrl,                        // optional, see below
  // …the same options as above
});
// Whenever your overlays move or resize (a sheet collapses, the viewport rotates):
invitation.setFrameInsets({ top: header.bottom + 8, bottom: innerHeight - sheet.top + 8 });
```

The controller frames the object in the **frame square**, the largest square left free by the insets, centred in that area, *exactly as the square stage frames it* (same camera position and lens over the square); the rest of the mount extends the same view, so a wide or tall screen shows more studio, never a different composition. Missing edges count as 0; with no insets the frame square is the centred square of the mount. Insets that would leave less than a quarter of the mount's shorter side are scaled back. `getFrame()` returns the current frame square (`{ x, y, size, width, height }`, mount CSS px), for example to place your own UI relative to the object. `setFrameInsets` is ignored by the square layout.

**Posters in fullscreen.** Posters stay the square stills they always were (the square framing). The controller lays the poster (and the text fallback) on the frame square, so it shows the object exactly where the canvas will, and fades its edges into the **backdrop still**: the bare studio rendered at 7× the frame field (`BACKDROP_FIELD`) around the same framing, centred on the frame square, which covers the rest of the mount. Pass `backdropFor(category)` (the showcase's `backdropUrl` in `src/demo/posters.ts` resolves `assets/scenes/<category>/backdrop.webp`, 15–20 KiB each); without it the poster sits on the stage colour. Regenerate the backdrops with `pnpm capture backdrops [baseUrl]` whenever a scene's bounds, the rig or the framing change (and the posters with `pnpm capture <scene>`, as before).

The mount gets `lt-stage lt-stage--fullscreen` and three CSS variables, `--lt-frame-x`, `--lt-frame-y` and `--lt-frame-size`. The standalone showcase (`src/demo/main.ts`, `syncOverlay`) is the reference: it measures its header and dock with a `ResizeObserver` and passes the result on every change.

Accessibility over the scene is the host page's job: put overlay text on a surface or scrim that keeps 4.5:1 over any scene (the showcase's Glass is Warm White at 90 % over a blur; see `DESIGN.md`), keep 44px targets and safe-area insets.

### Configuration (finite presets)

| Category | Config | Host action label |
| --- | --- | --- |
| Party | `{ category: 'party', songId, label: 'coral' \| 'cobalt' }` | Place record |
| Birthday | `{ category: 'birthday', cake: 'vanilla' \| 'cocoa' }` | Place candles |
| Sports | `{ category: 'sports', ball: 'orange' \| 'cream' }` | Pass ball |
| Dinner | `{ category: 'dinner', dish: 'pasta' \| 'vegetables' }` (accepted; selects nothing since v1.2, see below) | Cover dish |
| Business | `{ category: 'business', template: 'light' \| 'dark' }` | Attach card |

**Dinner's `dish` is inert since v1.2.** The scene is the silver cloche and the clean plate, with no food (Surya, 2026-10-01; revision #22). `dish` is still accepted and defaulted (`DEFAULT_CONFIGS.dinner` is `{ category: 'dinner', dish: 'pasta' }`), so existing integrations keep compiling and running. Either value gives the same scene and the same shared posters (`shared-<pose>.webp`): the scene's `setConfig` ignores it. The showcase offers no Dinner preset control. Nothing else in the public API changed in v1.2 (v1.4 adds the optional `layout`, `frameInsets`, `setFrameInsets`, `getFrame` and `backdropFor`, above): `src/core/types.ts` and the `createInvitation` options are unchanged from v1.1 (same categories, configs, callbacks, states and options). The only core change is internal to the scene contract: `src/core/sequence.ts` gained an optional `setLowDetail` hook, which the controller calls on tier changes so imported master materials follow the Low tier. The new models change only what the scenes load (larger GLBs; see `docs/qualification.md`, v1.2).

`setConfig(config)` switches preset or category. A category change loads the new scene and frees the old one's GPU resources; a preset change swaps materials at a canonical pose. Party's `songId` is carried through for your UI; the scene never fetches song data, and the showcase shows "Selected track" when metadata is missing.

### Modes

- **Host**: `setMode('host')`, choose presets with `setConfig`, then `prepareHost()` plays the preparation (for example attaching the card). It never creates a response request.
- **Guest**: `setMode('guest')` shows the guest-ready pose. `chooseResponse('accept' | 'decline')` records intent and plays the matching outcome.

`replay()` replays visuals only (never a request). `resetVisual()` returns to the resting pose for the current mode and intent.

### One invitation per controller

A controller and its response adapter belong to exactly one invitation identity (one event, one guest). Its request ids, ordering and saved state are only meaningful for that identity. To show a different invitation, call `dispose()` and create a new controller with that invitation's config and `initialResponse`; never reuse a controller or adapter across invitations.

## Responses: idempotency and ordering

The guest's choice is recorded before any animation and is independent of graphics: it works with a poster, with WebGL unavailable, or mid-animation.

1. `chooseResponse(r)` creates a request `{ requestId, response }` and calls `onResponseRequested` **once**. Repeated taps on the same choice create nothing new.
2. Your app persists it and calls `applyResponseResult({ requestId, status: 'saved', response })` or `{ requestId, status: 'error', message }`.
3. **Latest request wins.** If the guest changes their mind while a save is in flight, the newer request supersedes the older; a late result for an older request is ignored and cannot overwrite the newer intent. A result whose `requestId` or `response` does not match is reported through `onIntegrationError` and ignored.
4. On `error`, the chosen intent stays selected and the UI offers Retry; `retryResponse()` sends a **new** request for the same intent.
5. **Your adapter must serialise writes** (or reject stale ones server-side) so an older write can never land after a newer one. `MockResponseAdapter` shows the pattern: a promise queue.

Pass the authoritative saved answer as `initialResponse` on load: the scene shows its final pose immediately, with no animation and no new request.

State for your UI comes from `getState()` / `onStateChange`: `response.intent`, `response.persistence` (`unselected | saving | saved | error`), `response.latestRequestId`. Show "Saving response…", "Accepted", "Declined" or "Couldn't save your response. Try again" from those fields; never infer the outcome from the animation.

## Graphics, motion and fallbacks

- **Resource states**: `poster` (still image) → `loading` → `ready` (live 3D) or `fallback` (poster or text). After 6 s without readiness `canRetryGraphics` becomes true: offer "Try 3D again" (`retryGraphics()`). Context loss falls back to the poster and responses keep working.
- **Reduced motion**: sequences snap to their final pose; no simulation runs; the drag handle hides. `setReducedMotion(enabled)` applies live.
- **Quality tiers**: High, Normal, Low (no shadow map, simplified materials; under rig `v1.1` also no plaster relief and a small copy of the gobo, which the production rig does not have), Static (poster only; the WebGL stage and its context are released, and rebuilt if a tier above Static is chosen again). The controller steps down on sustained slow frames and never steps back up on its own; `setQualityTier` forces a tier (tooling).
- **Render on demand**: the loop stops when nothing moves and pauses in hidden tabs; the visual clock resumes without skipping.

## Assets

Runtime models are GLB files in `assets/scenes/<category>/` plus the shared disposal bin `assets/shared/disposal-bin.glb` (Birthday, Dinner). Since v1.2 the scene GLBs are built from the scan-to-CAD masters and are larger: 1.0–5.8 MiB each with gzip −9, 2.0–7.9 MiB raw (the shared bin is unchanged at 155.7 KiB raw). Serve `.glb` with gzip or brotli; the textures inside are already WebP. The GLBs use `KHR_mesh_quantization`, `EXT_texture_webp`, `KHR_texture_transform` (Sports, Dinner) and the PBR material extensions (clearcoat, sheen, anisotropy, transmission, volume, IOR, specular, iridescence, emissive strength), which three r186's `GLTFLoader` reads with no extra decoder. The presets of Business, Party, Birthday and Sports are stored with `KHR_materials_variants`, which `GLTFLoader` does not apply without a separately registered plugin; the bundled scenes read the variants themselves (`loadMaterialVariants` in `models/imported.ts`). Posters are `assets/scenes/<category>/posters/<preset>-<pose>.webp` (or `shared-<pose>.webp` when presets look identical); only the needed poster is fetched. With Vite these are bundled with hashed URLs. `assetBase` in the options is passed to scenes but the bundled scenes resolve their own URLs; hosting assets on another origin needs a small resolver change.

Sources for every model, material and texture are listed in `docs/asset-manifest.md`; the approved look in `docs/style-reference.md`.

## Lifecycle

`dispose()` stops the loop, removes the canvas, frees scene and material resources and releases the WebGL context, dropping every reference to the renderer. Browser tests create and dispose the controller 30 times and check that one canvas and no extra contexts remain. A heap check after repeated remounts, remounts during a load, context-loss retries and Static round trips found exactly one live WebGL context.
