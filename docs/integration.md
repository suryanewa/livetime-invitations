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
pnpm capture <mode> # evidence: business | party | birthday | sports | dinner | ui | perf | lookdev
```

## Embedding

```ts
import { createInvitation } from './src/core/controller.ts';
import type { ResponseResult } from './src/core/types.ts';
import { posterUrl } from './src/demo/posters.ts';

const invitation = createInvitation({
  mount: document.querySelector('#invitation')!,   // the controller renders a square stage into it
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

Defaults: the approved look (direction `L2`, premium studio), the user's `prefers-reduced-motion`, and the Normal quality tier with automatic step-down. Pass `reducedMotion` to override the OS setting, `direction` or `stage` only for tooling.

### Configuration (finite presets)

| Category | Config | Host action label |
| --- | --- | --- |
| Party | `{ category: 'party', songId, label: 'coral' \| 'cobalt' }` | Place record |
| Birthday | `{ category: 'birthday', cake: 'vanilla' \| 'cocoa' }` | Place candles |
| Sports | `{ category: 'sports', ball: 'orange' \| 'cream' }` | Pass ball |
| Dinner | `{ category: 'dinner', dish: 'pasta' \| 'vegetables' }` | Cover dish |
| Business | `{ category: 'business', template: 'light' \| 'dark' }` | Attach card |

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
- **Quality tiers**: High, Normal, Low (no shadow map or plaster relief, a small copy of the gobo, simplified materials), Static (poster only). The controller steps down on sustained slow frames; `setQualityTier` forces a tier (tooling).
- **Render on demand**: the loop stops when nothing moves and pauses in hidden tabs; the visual clock resumes without skipping.

## Assets

Runtime models are GLB files in `assets/scenes/<category>/` plus the shared disposal bin `assets/shared/disposal-bin.glb` (Birthday, Dinner). Posters are `assets/scenes/<category>/posters/<preset>-<pose>.webp` (or `shared-<pose>.webp` when presets look identical); only the needed poster is fetched. With Vite these are bundled with hashed URLs. `assetBase` in the options is passed to scenes but the bundled scenes resolve their own URLs; hosting assets on another origin needs a small resolver change.

Sources for every model, material and texture are listed in `docs/asset-manifest.md`; the approved look in `docs/style-reference.md`.

## Lifecycle

`dispose()` stops the loop, removes the canvas, frees scene and material resources and releases the WebGL context. Browser tests create and dispose the controller 30 times and check that one canvas and no extra contexts remain.
