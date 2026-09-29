# Qualification record

Living record of devices, browsers and evidence. No result is claimed here without a dated measurement or check.

## Reference device matrix (Master §11) — availability as of 2026-09-28

| Proposed device | Browser | Available to this production? | Notes |
| --- | --- | --- | --- |
| iPhone SE (2nd gen) | Safari | **No** | Gap: low-end iOS unverified |
| iPhone 12 | Safari | **No** | Gap |
| iPhone 17 Max (substitute, high-end) | Safari | **Yes — Surya's phone** | Only physical device; not representative of low-end |
| Pixel 6a | Chrome | **No** | Gap |
| Samsung Galaxy A53 | Chrome | **No** | Gap: Android unverified |
| macOS Safari | Safari 26.6 | Yes (authoring host) | Real Safari, not automated WebKit |
| macOS Chrome | Chrome 153 | Yes (authoring host) | |
| macOS Firefox | — | **No — not installed** | Gap: install or record as unavailable |
| Windows Edge | — | **No** | Gap: needs a Windows machine or agreed substitute |
| iOS in-app browser (e.g. Instagram/Messages link preview) | — | Depends on a physical iPhone | Gap |
| Android in-app browser | — | Depends on a physical Android phone | Gap |

**Recorded 2026-09-28 (checkpoint 1):** Surya has one physical phone, an **iPhone 17 Max (Safari)**. None of the four proposed reference devices is available. Consequences:

- The iPhone 17 Max is the only real-device evidence. It is a current high-end device, so passing on it does **not** establish performance on the iPhone SE (2nd gen) / Galaxy A53 class the spec targets.
- The low-end iOS and all Android coverage are recorded as **gaps**. Chrome DevTools CPU/GPU throttling on the authoring Mac can supply a supplementary stress signal, labelled as simulation and never as device evidence.
- Before claiming broad support, agree a substitute with Surya (a borrowed low-end Android, a remote device lab), or explicitly narrow the support statement.

## Milestone 0 exit evidence

| Check | Result | Evidence |
| --- | --- | --- |
| Local stage loads with readable controls at 320 px | See `outputs/skeleton/` captures | `pnpm capture skeleton` |
| Sample mesh and poster use matching framing | Poster rendered from the same camera and fit function | Showcase skeleton page |
| Environment/dependency record exists | Yes | `docs/environment.md` |

Setup evidence only. It is not visual approval.

## Milestone 2 — Business evidence (2026-09-28)

### Functional checks

| Check | Result | Evidence |
| --- | --- | --- |
| Unit: response ledger, clock, springs, curves, visual director (interrupt blend, reduced motion, late load after host prep, detach mid-sequence, hold/seek), quality tiers, Business choreography (canonical poses, identical accept/decline motion, indicator changes exactly once at 0.72 s, 1 ms continuity), **host attach clearance (hook wire and gate only ever inside the card slot)**, drag geometry (rotated-card floor clamp, reader contact instead of pass-through) | 52/52 pass | `pnpm test` |
| Browser: Accept emits one request; repeated taps and Replay emit none | Pass | `tests/browser/business.spec.ts` |
| Browser: Decline during a slow save issues a newer request; the stale Accept result cannot overwrite it; mock store ends `decline` | Pass | 〃 |
| Browser: failed save keeps intent and pressed state; Retry issues a new request; Retry hides after saving | Pass | 〃 |
| Browser: optional drag holds the timeline, never emits a request, and the scan completes on release | Pass | 〃 |
| Browser: Motion off mid-sequence snaps to the final pose; Replay hidden | Pass | 〃 |
| Browser: graphics loss → poster fallback (current intent) and responses still work | Pass | 〃 |
| Browser: initially saved response shows the final pose, no submission | Pass | 〃 |
| Browser: keyboard-only Tab/Enter answers | Pass | 〃 |
| Browser: hidden tab pauses the clock and resumes without skipping | Pass | 〃 |
| Browser: 30 controller re-creations leave one canvas and log **no** “Too many active WebGL contexts” warning (contexts are force-released) | Pass | 〃 |
| Browser: graphics loss mid-attach finishes the host state (Attach card re-enabled, grab target hidden) | Pass | 〃 |
| Browser: a load slower than 6 s clears its “taking a while” notice once ready | Pass | 〃 |
| Browser: no frames scheduled after settle; none while hidden | Pass | `tests/browser/idle.spec.ts` |
| Layout: no horizontal overflow and no target under 44×44 at 1440, 390, 320, 844×390 landscape and 200% zoom | Pass | `pnpm capture ui` → `outputs/ui/` |

### Independent reviews (2026-09-28)

- **UI finish review** (Impeccable protocol, fresh agent): disposition *fix*, 8 material findings. All were applied: saving/error states no longer look stored, the landscape answer sits above the fold, selected segments are ≥3:1, the VoiceOver toggle label is fixed, the sample event is labelled, green is reserved for saved acceptance, and the Developer summary wraps at 320–420 px. A verdict pass on the recaptures follows.
- **Adversarial code review** (4 dimension reviewers, each checked by an independent skeptic): 42 confirmed findings with overlaps, about 25 distinct. All were fixed except one spec interpretation escalated to Surya (lanyard anchor above the frame). Resolved at checkpoint 2 (2026-09-28): the strap keeps exiting the top of the frame. The high-severity ones were:
  - disposed renderers kept their WebGL contexts alive through shared texture caches;
  - early-scan contact reused a stale drag offset and teleported the card through the floor.
- Checks added for the fixes: attach clearance, drag geometry, context-warning assertion, two regression browser tests.

### Transfer (production build, gzip −9 estimate of each file)

| Item | Bytes |
| --- | --- |
| JavaScript for the first route (three.js chunk 158.1 KB + showcase 11.6 KB + Business scene 17.0 KB + keycard rig 8.5 KB) | ≈195 KB gz |
| CSS | ≈3.8 KB gz |
| Business GLB (positions/normals quantised, no decoder) | 504.4 KiB raw · 111.7 KiB gz |
| One poster (only the needed one is fetched) | 12–15 KB |
| Collection thumbnails (5) | ≈15 KB |
| **Cold first scene** | **≈345 KB gz; ≈750 KB if the host serves .glb uncompressed** — budget 2.5 MiB |
| Runtime JS | ≈195 KB gz — budget 450 KiB |

### Frame cadence (desktop only — not mobile evidence)

10 alternating accept/decline cycles after one warm-up, visible page, frames sampled only while a sequence plays (`pnpm capture perf`, raw samples in `outputs/perf/frame-times.json`):

| Run | Frames | p50 | p95 | p99 | Max | >50 ms |
| --- | --- | --- | --- | --- | --- | --- |
| M2 Pro · Chrome 153 · 390×844 @3× · Normal tier (DPR 1.5) | 1002 | 16.7 ms | 16.8 ms | 16.8 ms | 16.8 ms | 0 |
| SIMULATION: 4× CPU throttle | 1003 | 16.7 ms | 16.7 ms | 16.8 ms | 16.8 ms | 0 |

CPU throttling does not stress the GPU, so the simulated run says little about a low-end phone. **Pending: Surya's iPhone 17 Max run** (see the checkpoint instructions). Low-end iOS and Android stay unverified.

### Geometry and memory (calculated, not driver readings)

- Business scene (study-model measurement of the same builder): ≈10.9k triangles, 23 draw calls — budget 60k / 40.
- Textures: contact-shadow falloffs 4 × 256² RGBA ≈ 1.0 MiB; perforation, weave and dark-perforation maps with mips ≈ 0.35 MiB; PMREM environment (768×1024 RGBA16F) ≈ 6 MiB.
- Drawing buffer at the showcase stage (≈400 CSS px, DPR 1.5 → 600², MSAA 4×): ≈13 MiB. **Total ≈ 20 MiB** against the 48 MiB budget.
- **Risk recorded:** at the master's 2.5 MP drawing-buffer ceiling, MSAA 4× alone would need ≈90 MiB. Embeds larger than ≈700 CSS px at DPR 1.5 should create the renderer without MSAA; this is a decision for Milestone 7 integration guidance.
