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

## Milestone 2 — Business evidence (2026-09-28, direction L; superseded by the checkpoint 3 figures below)

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

## Checkpoint 5: qualification review and release (2026-09-30)

Checkpoint 5 (Production Plan M7 and M8) was carried out by three fresh independent reviewers, each followed by a skeptic who tried to reproduce and refute every finding. As with checkpoint 4, their sign-offs are **pending Surya's confirmation**. None of this is phone evidence.

| Reviewer | Result | What was done |
| --- | --- | --- |
| Final collection art director | **Signed off.** 3 findings, all confirmed, none blocking | Re-rendered all 40 canonical stills (5 scenes × 2 presets × 4 poses) from the live tree at HEAD and compared them with the shipped posters: mean difference ≈ 1.05/255 after a 3 px blur, under WebP q0.86 noise, so the posters still match after the engine and texture changes. Unit 134/134 and browser 69/69 at HEAD; every checkpoint 4 fix confirmed in the live build; the five scenes read as one family at 390 px. Findings: (1) the release package predated the final docs (rebuilt at the end of checkpoint 5); (2) the review clips dropped one frame in 25 because the 62.5 fps frames were converted to 60 fps: all 30 clips were re-encoded at their native 62.5 fps from the recorded frames, and the capture script no longer converts; (3) at 175–200 % text on 320–375 px phones the showcase header ran off the right edge: the header actions now wrap, and the large-text test covers 150, 175 and 200 % |
| New-developer handoff | **Not signed off.** 12 findings, all confirmed, all fixed | Cloned, installed offline, built, ran 134/134 unit and 69/69 browser tests in the clone, re-exported all six GLBs byte-identical to the committed ones, checked every SHA-256 in the release manifest, and ran the packaged showcase from a subpath. Then embedded one scene from the guide's snippet on a bare page. Fixes: the stage stylesheet (`src/ui/stage.css`) now ships with the controller, so the snippet works on a page with no other CSS, and a new browser test embeds the snippet on a bare page; callbacks start one microtask after `createInvitation` returns; the controller marks reduced motion on the mount (`data-motion`) and `dispose()` removes its attributes; the release script refuses uncommitted changes, a stale `dist/` or missing evidence, builds beside the old package and swaps it in only when complete, filters on relative paths, puts the README at the package root and records the commit and build time; the integration guide now states the Vite requirement, the real `onResourceState` pairs, the modes after the host sequence, host previews, repeat taps after an error and validation; README and the environment notes cover `masters/`, `exports/`, `?saved=`, a second checkout and every capture target; the Master coverage rows were re-verified |
| Qualification auditor | See below | Audits every claim in this record, the coverage table and the other docs against the code, tests and evidence |

## Checkpoint 4 evidence (2026-09-29, all five scenes, premium L2)

All figures were measured on the authoring Mac (M2 Pro; Chrome 153, then 154 after an automatic update during the session; see Release environment) from the committed tree during checkpoint 4. None of this is phone evidence. Checkpoint 4 was carried out by independent critical reviewers at Surya's request; their sign-offs are recorded as **pending Surya's confirmation**.

### Release environment (recorded 2026-09-29, Master §11)

| Item | Version |
| --- | --- |
| Host | Apple M2 Pro, macOS 26.6 (build 25G5065a) |
| Google Chrome (all automated checks) | 154.0.8037.58 (auto-updated during the day from 153; checkpoint 3 figures were taken on 153) |
| Safari (installed, not automated) | 26.6 |
| Firefox, Edge | Not installed |
| Previous major browser versions | Not installable on this host (auto-updating Chrome, system Safari): recorded as unverified |
| Node / pnpm | 24.5.0 / 11.0.4 |
| three.js / playwright-core | 0.186.1 / 1.63.0 |

### Checks

| Check | Result |
| --- | --- |
| Typecheck | Clean |
| Unit tests (Vitest) | 134 / 134 pass (16 files) on the final tree. Added since checkpoint 3: Sports seam-frame, net far-layer, motion continuity after contact, airball read, blend safety and flat-floor staging; Dinner settle, continuity, exact cloche clearance, blend safety and framing (8 % clearance over the real open bin, ≥42 % fill); poster completeness; Party lining weave; WebGL2 probe caching |
| Browser tests (Playwright, system Chrome) | 69 / 69 pass on the final tree. Suites: Business, Party, Birthday, Sports, Dinner, collection, gallery, accessibility, idle, and resilience (graphics loss and restore, failed downloads, touch cancel, rotation, large text, unknown song, Static releasing the stage, 30 re-creations). An earlier run had 50 / 51, failing only because Dinner's posters were not yet in `assets/` |
| Real-time sequence length (live showcase, `pnpm capture timing`, median of 3) | Business host 1.21 / accept 1.51 / decline 1.51 s · Party 1.21 / 1.61 / 1.41 · Birthday 1.31 / 1.41 / 1.51 · Sports 1.21 / 1.71 / 1.61 · Dinner 1.21 / 1.51 / 1.51 (each about 10 ms over the authored length: one animation frame to detect the end) |

### Checkpoint 4 collection review (independent critical reviewers, pending Surya's confirmation)

The reviewers each covered the collection through one lens:
- cohesion;
- phone-scale legibility and tiers;
- motion;
- interface and accessibility;
- runtime quality.

Each reviewer's findings went to a separate skeptic who tried to reproduce and refute them. 59 findings were raised, 54 confirmed and 5 rejected. Fixes ran in six isolated worktrees, one per file set. A separate reviewer verified each fix before it was merged.

| Batch | Outcome |
| --- | --- |
| Showcase shell (11 findings) | Merged, verified. A category switch is a new invitation. On phones the stage comes into view and the new event is announced. The event line wraps and reads correctly to screen readers. The graphics notice is correct for image and text fallbacks. Layout survey: 204 cases, no overflow, overlap or target under 44 px. The one open copy item (preset labels) is left for Surya |
| Collection gallery (4) | Merged, verified: five scenes side by side, a live stage on load, readable captions, replay on repeat clicks, phone scrolling |
| Party finish (2) | Merged, verified: lid-lining moiré removed, reveal groove continuous; the approved look and the lanyard strap unchanged |
| Sports motion and legibility (6) | Merged. The round-1 fix was verified for five findings: the made ball and the airball continue on their own arcs, answer changes blend where a blend is clean, the pass and the shot share one gravity family, and the airborne ball shows one shadow. Its declined rest spot sat on the rising backdrop cove. The orchestrator pushed the Sports wall back to z −4.2, like Birthday's and Dinner's, and a unit test now keeps every touchdown and rest on flat floor. A second round that moved the rest spot instead had pulled the airball back towards a vertical toss, so it was not used |
| Business motion and legibility (4) | Merged. The card-glare finding needed a second round; the other three passed verification in round 1. The card leaves the pad from rest at 1.14 s (peak 8.4 u/s against the approach's 7.7; it was 16.1 from a dead stop) and still lands on its canonical pose at 1.5 s (revision #19). The status window is lit by emission alone over the idle glass, so accept and decline no longer clip to mint and pink, and they now differ in value as well as hue (deuteranopia luminance ratio 1.92:1, was 1.2:1); the glyphs are bolder ink. The scanner's foot is ink, giving the reader a 3:1 silhouette. Round 2: during the scan hold the laminate had mirrored the softbox (cobalt panel 2.8× its rest luminance), so the card now turns 20° on the reader, hinged at the pad's right edge (1.2×; revision #18). The canonical stills match the previous commit pixel for pixel |
| Engine and renderer (8) | Merged. The verifier found that round 1's teardown fix still left one leak path, and round 2 closed it. Stage teardown now disposes three's shared DFG lookup table and the shared shadow-proxy material (Birthday, Dinner); before, their dispose listeners kept every disposed renderer and its WebGL2 context reachable. Other fixes: a superseded load stops after its precompile and is freed once its compiles settle (no GL errors on a quick switch back); Static releases the WebGL stage and leaving Static rebuilds it; one warm frame before 'ready' links the shadow program, so the first ready frame compiles nothing; tier switches compile the new variants first, so the first switch to Low no longer blocks for 40–110 ms; context loss disposes the stage and restore builds a fresh one; the environment map drops its 3 MiB depth buffer; the WebGL2 probe runs once per page. Browser tests: 30 re-creations across all five scenes leave one canvas and one renderer, and Static leaves no renderer or context reachable. A heap check (CDP) after remounts, remounts during a load, loss and retry, and Static round trips found exactly one live WebGL context |
| Dinner (orchestrator) | Frame fit taken from the real bin geometry (the flaps had come within 2.3 % of the top edge). New layout; a continuous transfer paced on screen; flaps close once the dish is out of sight; a continuous reveal and lowering; a contact-driven rim rock; the cloche's own contact shadow; a gentler bin entrance; blends while the cloche is still over the food; the host lifts the cloche from where the guest's reveal sets it down. A separate unveiling review (food shelved) drove the last round |
| Studio (orchestrator) | The near palm frond whose tip streaked the front floor is removed. The Low tier keeps a small gobo |
| Procedural textures (orchestrator) | Under heavy load, a scene rebuilt after Static could come back dark, because Chrome dropped the pixels of the canvases behind its procedural textures (gobo, plaster, prints, contact shadows) before they were re-uploaded. Each canvas's finished pixels are now copied once into a CPU-backed canvas that the texture uploads from. Renders are pixel-identical, Static round trips render identically, and cold load is unchanged (drawing directly into CPU-backed canvases had cost 0.7 s, so the copy is made after drawing) |

Deferred, with reasons:
- **Interruption blends:** an eased or cross-dissolved interruption blend, and removing the Party label's backwards turn during the reset blend. Polish; it crosses the director and three scenes, and a dissolve needs a snapshot layer.
- **The "land" ease used from rest:** in Party's stylus drop and Birthday's wick return. Polish in approved scenes.
- **Thicker Sports net cords for the Low tier:** a Low-tier limitation, recorded below; changing the cords would change the signed-off Normal look.
- **The Birthday stand and the floor shadows at Low:** recorded as a Low-tier limitation.

### Render cost per scene (lookdev, 358² @3×, including the shadow pass, contact shadows and the studio sweep)

| Scene (ready pose) | Triangles | Draw calls | Budget |
| --- | --- | --- | --- |
| Business guest-ready / accepted (dark) | 53.4k / 53.5k | 32 / 34 | 60k / 40 |
| Party guest-ready | 44.7k | 32 | 60k / 40 |
| Birthday guest-ready (bin off stage) | 35.1k | 21 | 60k / 40 |
| Sports guest-ready | 35.9k | 18 | 60k / 40 |
| Dinner accepted (cloche beside the pasta, bin off stage) | 27.3k | 20 | 60k / 40 |

These lookdev numbers are a static ready pose. The budget is judged on the **live per-frame peak** across host, accept, decline and an answer change, both presets. The peak includes the shadow pass and everything on stage: lanyard, status light and the bin while it is on stage. It was sampled every frame in the running showcase with the checkpoint 4 technical reviewer's harness.

| Scene | Ready pose, tris / calls | Live peak, tris (main + shadow) | Live peak, calls (main + shadow) | Budget |
| --- | --- | --- | --- | --- |
| Business (light / dark) | 56.4k / 37 | 57.1k (29.1k + 27.9k), in accept, decline and answer changes | 39 (24 + 15): one call under budget, so any new Business geometry needs a shadow proxy or a merge | 60k / 40 |
| Party (either label) | 45.6k / 34 | 45.6k (24.0k + 21.6k) | 34 (21 + 13) | 60k / 40 |
| Birthday (either cake) | 39.2k / 19 | 58.0k (43.0k + 15.0k), in the decline with the bin | 34 (26 + 8) | 60k / 40 |
| Sports (either ball) | 35.9k / 18 | 35.9k (20.6k + 15.3k) | 18 (13 + 5) | 60k / 40 |
| Dinner (pasta / vegetables) | 27.3k / 20, 27.9k / 21 | 44.7k / 45.3k (33.9k + 11.4k), in the decline with the bin | 32 / 33 (24 + 9) | 60k / 40 |

Birthday's decline is the tightest: 2k triangles under budget. Smoother bin flaps (48 segments) had pushed it to 61.4k, so the flaps now use 40 segments.

### Frame cadence (desktop only, `pnpm capture perf <scene>`)

Ten alternating accept/decline cycles after one warm-up pair, 390×844 @3×, Normal tier (DPR 1.5), on a visible page. Frames are sampled only while a sequence plays. Raw samples are in `outputs/perf/frame-times-<scene>.json`.

| Scene | Frames | p50 | p95 | p99 | Max | >50 ms | 4× CPU throttle (simulation): p95 / max / >50 ms |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Business | 1,000 | 16.7 ms | 16.7 | 16.8 | 16.8 | 0 | 16.7 / 16.8 / 0 |
| Party | 1,000 | 16.7 | 16.8 | 16.8 | 16.8 | 0 | 16.7 / 50.0 / 0 |
| Birthday | 921 | 16.7 | 16.7 | 16.8 | 16.8 | 0 | 16.7 / 16.8 / 0 |
| Sports | 1,092 | 16.7 | 16.7 | 16.8 | 16.8 | 0 | 16.7 / 16.8 / 0 |
| Dinner | 905 | 16.7 | 16.7 | 16.8 | 33.3 | 0 | 16.8 / 16.8 / 0 |

- **Sports:** a first Sports run with two review agents rendering in parallel logged one 66.6 ms frame; the rerun on the quieter machine (above) had none.
- **Targets (Master §9):** p95 ≤ 20 ms, p99 ≤ 34 ms, no application stall over 50 ms. Met on this desktop.
- **Not phone evidence:** the M2 Pro is locked to 60 Hz and much faster than the reference phones. CPU throttling does not stress the GPU. The iPhone 17 Max session is still pending, and low-end iOS and Android remain unverified.

### Transfer and cold load

| Asset | Raw | Gzip −9 |
| --- | --- | --- |
| business.glb | 720.8 KiB | 251.5 KiB |
| party.glb | 608.3 KiB | 234.7 KiB |
| birthday.glb | 561.7 KiB | 270.8 KiB |
| sports.glb | 516.3 KiB | 203.0 KiB |
| dinner.glb | 841.3 KiB | 405.4 KiB |
| shared/disposal-bin.glb | 155.7 KiB | 63.8 KiB |

Cold load from the final production build after all checkpoint 4 fixes (`pnpm build`, `pnpm preview`) on a throttled network (4 Mbps down, 100 ms latency, cache disabled; `pnpm capture network`, bytes from Chrome's `loadingFinished` events):

| Scene | Controls usable | Render-ready | Transferred |
| --- | --- | --- | --- |
| Business | 1.01 s | 2.81 s | 1.01 MB |
| Party | 0.95 s | 2.74 s | 0.89 MB |
| Birthday | 0.91 s | 2.70 s | 1.00 MB |
| Sports | 0.91 s | 2.19 s | 0.80 MB |
| Dinner | 0.93 s | 3.22 s | 1.30 MB |

Targets (Master §9): controls usable ≤2 s, render-ready ≤6 s, cold first scene ≤2.5 MiB. All five pass on this desktop simulation. `vite preview` serves the GLB files uncompressed, so these byte counts are the uncompressed worst case; a host that gzips `.glb` would transfer less.

### Framing (Master §5: 60–75 % of stage width in the ready pose)

| Scene | Measured | Status |
| --- | --- | --- |
| Business | 61.6 % | Pass (checkpoint 3) |
| Party | 71.2 % | Pass (checkpoint 3) |
| Birthday | 52.1 % | Accepted exception (Surya, checkpoint 3) |
| Sports | 70.9 % (ball and board, geometric; locked to 60–75 % by a unit test) | Pass |
| Dinner | 43.1 % (geometric, unit test) | **Recorded exception, pending Surya.** The open bin's flaps set the fixed frame. The fit now samples the bin's real open geometry with the full 8 % clearance: a hand-modelled flap outline had let the flaps reach within 2.3 % of the top edge, which a critical reviewer caught. A placement search over bin and cloche positions put the ceiling near 43–44 %. The dish is centred horizontally but sits in the lower third of the frame. Revision #3 in `docs/spec-revisions.md` |

### Quality tiers

The Low tier kept the objects' look only after a fix. Dropping the palm gobo at Low had brightened and cooled every object by 35–90 % per colour channel, because the cookie also dims and warms the key. Low now keeps a 192² copy of the gobo. Measured object brightness at Low against Normal: Sports +5 %, Party +10 %, Business +9 % (linear RGB means over the object pixels). The remaining difference is the missing shadow map.


### GPU memory (Master §9: texture allocation ≤ 48 MiB; counted allocations, not driver readings)

Measured at HEAD after the engine fixes by wrapping the WebGL calls that allocate (textures, renderbuffers, buffers) and adding the default framebuffer with 4× MSAA. Two layouts: phone (430×932 @3×, 534² drawing buffer) and desktop (1440×900 @2×, 657²). "Both presets" is after switching to the second preset, with both resident. Raw figures: `outputs/perf/gpu-memory.json`.

| Scene | Phone: Normal / both presets / Low | Desktop: Normal / both presets / Low |
| --- | --- | --- |
| Business | 34.0 / 36.8 / 19.9 MiB | 39.0 / 41.8 / 22.2 MiB |
| Party | 32.4 / 33.7 / 16.9 | 37.4 / 38.8 / 19.1 |
| Birthday | 30.2 / 30.2 / 13.4 | 35.3 / 35.3 / 15.6 |
| Sports | 30.3 / 30.3 / 13.4 | 35.3 / 35.3 / 15.6 |
| Dinner | 30.3 / 30.8 / 13.9 | 35.3 / 35.8 / 16.1 |

Every scene is within 48 MiB in both layouts; the peak is Business on desktop with both card prints resident (41.8 MiB). No renderbuffer remains after load (the environment map's 3 MiB depth buffer is freed), and each page holds one live WebGL context. The drawing buffer is the part that grows with the embed: the risk recorded at checkpoint 3 (MSAA 4× near the 2.5 MP ceiling) still applies to embeds much larger than the showcase stage. Phone driver figures belong to the iPhone session.

### Still open after checkpoint 4

- **iPhone 17 Max session (Surya).** Every scene at Normal and Low: frame times, cold shader compile, shimmer (net, grooves, card edge), legibility at arm's length, and the compositor cost of the CSS vignette and grain. Also VoiceOver on iOS, and touch. See the steps in the checkpoint review page. Low-end iOS, Android, Firefox, Edge, in-app browsers and previous-major browser versions remain unverified (not available on this host).
- **Decisions for Surya.**
  - Dinner's plate: cream or a cobalt enamel band (a rendered option is on the review page).
  - Dinner's 43 % framing and its low placement (revision #3).
  - Whether the shelved food shows as placeholders or an empty plate (#17).
  - The cloche's rest place and the decline path (#13, #14).
  - The Business scan pose and departure timing (#18, #19).
  - The showcase's preset label copy.
  - Confirmation of the critical reviewers' sign-offs for Sports, checkpoint 4 and checkpoint 5.
- **Low-tier limits.** Recorded, not defects: cast shadows are gone (Birthday stand and the Party and Birthday floor shadows), and Sports net cords fall below a pixel at DPR 1 on small stages.
- **Polish deferred.**
  - An eased or cross-dissolved interruption blend, including the Party label turning back during the reset.
  - The "land" ease used from rest in Party's stylus drop and Birthday's wick return.
  - The tonearm's 0.5° one-frame lift step on an answer change (recorded at checkpoint 3).
- **Business draw-call headroom.** The live peak is 39 of 40 calls, so new Business geometry needs a merge or a shadow proxy.

## Checkpoint 3 evidence (2026-09-29, premium L2: Business, Party, Birthday)

All figures measured on the authoring Mac (M2 Pro, Chrome 153) from the committed build at checkpoint 3. None of this is phone evidence.

### Checks

| Check | Result |
| --- | --- |
| Typecheck | Clean |
| Unit tests (Vitest) | 82 / 82 pass (11 files): choreography continuity and canonical endpoints per scene, stylus/lid/spindle contacts, swept-lid clearance, rim clearance and occlusion order for the bin drop, model fit, framing lock, response ledger, clock, quality tiers, material-library disposal |
| Browser tests (Playwright, system Chrome) | 33 / 33 pass: Business 12, Party 9, Birthday 5, keyboard access 5, idle loop 2 |
| Real-time sequence length (live showcase) | Business accept 1.53 s (spec 1.5), Party accept 1.63 s (1.6), Birthday accept 1.43 s (1.4) |
| UI matrix (320, 390, landscape 844×390, 200 % zoom, desktop 1440) × Business, Party, Birthday × host and guest | No horizontal overflow; no target under 44 × 44 |

**Capture harness correction.** Review recordings made before this checkpoint (including the checkpoint 2 Business clips) played about 2.4× too fast: `page.clock.install()` lets real time keep flowing, so each captured frame advanced by its own capture time. The harness now pauses the page clock after load. Runtime timing was never affected (see the real-time lengths above). All clips were re-recorded.

### Render cost per scene (lookdev, 358² @3×, includes the shadow pass, contact shadows and the studio sweep)

| Scene (ready pose) | Triangles | Draw calls | Budget |
| --- | --- | --- | --- |
| Business, guest-ready / accepted (dark) | 53.4k / 53.5k | 32 / 34 | 60k / 40 |
| Party, guest-ready | 44.7k | 32 | 60k / 40 |
| Birthday, guest-ready (bin off stage) | 35.1k | 21 | 60k / 40 |

Birthday's dense frosting, glaze and pearls skip the shadow pass; two invisible low-poly proxies cast for them (the cake was 65.5k triangles before). The shared bin adds about 8.4k triangles and 5 draw calls only while it is on stage during decline.

### Frame cadence (desktop only)

Business, 10 alternating answer cycles, 390×844 @3×, Normal tier: 1,004 frames, p50 16.7 ms, p95 16.7 ms, p99 16.8 ms, max 16.8 ms, none over 50 ms. The 4× CPU-throttle run matched (a simulation, not device evidence). Party and Birthday are not yet measured separately; they cost less per frame than Business on this machine.

### Transfer (gzip −9 of each file)

| Asset | Raw | Gzip |
| --- | --- | --- |
| business.glb | 720.6 KiB | 251.6 KiB |
| party.glb | 608.3 KiB | 234.9 KiB |
| birthday.glb | 561.7 KiB | 270.8 KiB |
| shared/disposal-bin.glb | 143.7 KiB | 61.4 KiB |
| Posters (23 files, all scenes) | 552 KiB total | only the needed one is fetched (15–30 KB) |

A cold first scene is the runtime JavaScript (≈195 KB gz at Milestone 2; re-measure at packaging), the scene's GLB (235–271 KiB gz, plus 61 KiB for the bin in Birthday) and one poster: well under the 2.5 MiB budget.

### Framing (Master §5: 60–75 % of stage width in the ready pose)

| Scene | Measured | Status |
| --- | --- | --- |
| Business | 61.6 % (card and reader footprint projected with the shared camera fit; lanyard excluded) | Pass, near the low edge |
| Party | 71.2 % on the guest-ready poster (was 78 %; bounds widened, locked by a unit test) | Pass |
| Birthday | 52.1 % on the guest-ready poster | **Accepted exception** (Surya, checkpoint 3, 2026-09-29): the camera must fit the literal cake-to-bin path, and a bin deep enough to swallow the cake with its candles sets the frame height. Applies to the two disposal scenes (Birthday, Dinner) |

### GPU memory (calculated, not driver readings)

The material library now owns its textures and frees them on every category switch and stage teardown, so memory no longer accumulates across scenes. Per-scene peak on the Normal tier: drawing buffer ≈ 13 MiB (≈400 CSS px at DPR 1.5, MSAA 4×), PMREM environment ≈ 6 MiB, shadow map 4–8 MiB, gobo cookie 2.3 MiB, plaster 2.7 MiB, contact shadows ≈ 1 MiB, plus the scene's own prints (Business ≈ 6 MiB for both card prints; Party and Birthday under 2 MiB). About 35–40 MiB against the 48 MiB budget, to be confirmed on the phone. Low and Static free the shadow map and drop the gobo and plaster relief.

### Still open

- iPhone 17 Max session (Business, Party, Birthday at Normal and Low): frame times, cold shader compile, shimmer, legibility, compositor cost of the CSS finish.
- A remaining tonearm lift step of about 0.5° in a single frame when a guest changes from accepting to declining while the stylus is on the record (the interruption blend lifts the arm from its captured pose; removing it needs a director-level lift-before-swing). Judged invisible at phone scale; recorded rather than fixed.
