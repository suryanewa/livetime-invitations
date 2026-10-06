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

## v1.6: the Hollywood pass (2026-10-03 → 05), first judging (2026-10-03)

Surya's three items on v1.5 (`docs/hollywood-pass-brief.md`), each at "Hollywood CGI level". Each object was
rebuilt by one owner, then judged by an independent VFX-supervisor agent that rendered its own frames through the
production stage against photographs and film references at the three real sizes and in macro, and demanded fixes
before signing; a second owner per object then made them, and each later judging and round is recorded below.

| Object | First build | Judge's scores (0–10 vs "Hollywood CGI") | Verdict and the five demanded fixes |
| --- | --- | --- | --- |
| Cake | Regenerated star-tip piping, hand-coated tiers, baked-light food shader (`birthday-v1.6-cake.md`) | square 540: 6 / cocoa 6.5; laptop 5.5 / 6.5; phone 5.5 / 6.5; macro 3.5 / 4.5 | Not signed: "the swags now read as piped rope; what still reads as CG is everything around them". Fixes: (1) a coat whose satin sheen, 3–6 % mottle, strokes and pinholes survive at laptop size (σ ≥ 3–5/255 over 3 cm; the first build measured 0.55–1.8); (2) break the twins (rosettes ±12–18 % with random start and tilt, dots ±20 % with random peaks, bays ±2–3 mm, domed crown swirls, grooved far-side backs); (3) a continuous shell chain squashed onto the board, pearls bedded with fillets and no black crevices; (4) macro geometry (no self-intersecting tucks or poking swag ends, smoother silhouettes, deeper star grooves, a 1–2 mm contact crease, a feathered smear); (5) light and colour (visible soft candle shadows and a warm pool, ivory white piping, thin-edge glow) |
| Flames | Raymarched flame volume, selective HDR bloom, heat haze, shadowed flickering light (`birthday-v1.6-flames.md`); the owner's own three-round VFX reviewer: macro 5 → 7, laptop 6 → 7.5, phone 6 → 7.5, 540 card 6 → 7.5, 192 thumbnail 4, blow 3 → 6, light 6 | (independent judge pending the smoke pass) | The owner's reviewer called it "signable at laptop, phone and 540"; the v1.5 smoke became the loudest tell, so the smoke was rebuilt to the same standard |
| Steam | Raymarched volume from the dome's cavity, material-space advection, vortex roll, scattering, steam shadow, scene depth (`dinner-v1.6-steam.md`) | laptop: form 3.5, motion 5, lighting 3.5, integration 4.5 → **4**; phone 5 / 5.5 / 4.5 / 5 → **5** | Not signed: "the timing is right … but it reads as a frosted cotton-wool ball with a crawling sand grain; the dome shape holds ~0.1 s". Fixes: (1) a sharp lobed edge and silky interior (a narrow threshold band carved by flow-advected billows, noise stretched along the flow, no upsample blur at the edge); (2) no grain (jitter anchored in material space or TAA, no octaves finer than ~4 px); (3) light it as a body (room ~0.3, steep key falloff, two-lobe phase, a legible offset shadow on the plate); (4) a visible bright sheet spilling from the gap at 0.15–0.35 s, then the dome-shaped wall held crisp for 0.25–0.4 s; (5) less vapour (cap no wider than the plate, half the opacity by 1.2 s), a real vortex ring, backlit wisps through 3–5 s, the returning cover pushing the cloud aside |

Also landed: meshopt compression of every runtime GLB (−58 % raw, −45 % gzip; the cake 31.9 → 11.0 MiB raw after
its regeneration grew it from 12.5), decoded geometry bit-identical, 36 capture stills pixel-identical. A second
and third full `pnpm models birthday` on the merged build (2026-10-05, 7ca077f) reproduced the committed compressed GLB
byte for byte (the verification below).

### Second and later judgings, after the polish rounds (2026-10-03 → 05)

| Object | Polish round | Re-judge's scores (first judging in brackets) | Verdict and what remains |
| --- | --- | --- | --- |
| Cake | Fix 1 the coat (satin range, scraper streaks, hue drift, hand relief, clustered pinholes, glints in the sheen); fixes 2–5: no two pieces alike (rosettes ±15 % with random start and ±8° tilt, far-side backs ridged, domed crown swirls, dots ±20 % with leaning peaks, bays ±2.6 mm with fuller loops), a continuous shell chain slumped onto the plate with a crease, pearls bedded after the piping with a pearlescent dented material and occlusion never below 60 %, rosette centres as a star kiss, swag ends tucked, 4.6 samples per tooth, grooves tinted to the frosting, the contact gradient 1–2 mm, a feathered smear, pulled tassel hems, ivory piping, thin-edge glow, a warm pool (`FLAME_POOL`); 1.79 M triangles, +0.01 ms | square 540: vanilla **7** (6) / cocoa **7.5** (6.5); laptop **6.5** (5.5) / **7** (6.5); phone **6.5** (5.5) / **7** (6.5); macro **4.5** (3.5) / **5** (4.5). Coat σ in the laptop crop: side 3.3–4.3 (passes), top 2.3 (fails the ≥ 3 bar) | "The polish is real and visible at every showcase size": ivory piping, streaks that read, no twins, a shell chain, no black crevices, the contact gradient and the stacked crown rings gone. **Signed for cocoa at square 540 and phone; not vanilla, not laptop.** The smallest set for a signature at all three sizes: (1) the side rosettes at the silhouette read as terraced stacks of ridged sheets (the all-round-teeth overhang and coil backs) → the rope continuing round, ≤ 2 visible loops, no free sheet edges; (2) the tail riding over the rosette's start reads smeared/folded, with a crater round the star kiss → merge the tail into its first loop; (3) the flame light tints the whole top lilac (+27 R, hue 219° → 228°, evenly) instead of pooling → ≤ +10 R at the centre, falloff within ~3 cm, soft candle shadows from the key; (4) top σ ≥ 3 and the turntable marks as broken spiral arcs, not concentric rings. Macro needs crisper star ridges, sugar grain, a window reflection on cocoa, irregular tassel beads and a less frontal key (rig). **Polish round 2** (a third owner, `8d5f793`): the stacked sheets were a mid-air rope flare where no surface lay behind a rosette and a too-short press blend — fixed, with a plain round underside and a smooth back, 10–11 broader teeth; the tail tapers over its overlap with the ridges fading, the start pressed flat, the star kiss flush (0.90–1.13 of the crest, tested); per-candle halos (`FLAME_POOL` gain 4.5, ~2 cm falloff) with the broad light at 0.28 and analytic key shadows of the candles (`KEY_CANDLE_SHADOW`; the 1024² shadow map cannot resolve an 8 mm candle): the top centre lifts +4 R (+7 against the flames polish's doubled light) at hue 220–221° against the side's 220.5°, the halo +29–37 R at 0.5–1 cm falling to +9–10 at 4–5 cm, a candle shadow 168 vs 188 at laptop; spatula-mark spiral arcs with landing ridges and lifting lips replace the ring streaks, top σ 3.35 with the candle shadows off (8.55 as shipped; cocoa 4.34 / 5.68); a third fewer shell-junction pearls, ±10 % varied, no egg pearl; 1.74 M triangles, +0.03 ms; `birthdayPiping` 9, `birthday` 34. **Third judging:** square 540 vanilla **7.5** / cocoa **8**; laptop **7** / **7**; phone **7** / **7.5**; macro **5** / **5**. All four acceptance tests pass as written (the silhouette rosettes, the tail, the centre lift +8 R at hue 221° against 220.5°, σ 3.81 with light and shadows off). **Signed: cocoa at square 540 and phone.** Withheld: vanilla at every size — the flame light's lilac now sits in six overlapping halos (+32–38 R at 0.5–1 cm, green rising only 0.37× the red so the hue reaches 232–234°; whole-top mean +21 R, 75 % of pixels > 3° off) and turns the new candle shadows into desaturated mauve smudges (hue 225.1°, saturation 0.280 vs the lit coat's 220.8° / 0.316); cocoa at laptop — the spatula arcs' thin ridges alias into evenly spaced specular specks ("stitched leather"). The smallest set: a hue-preserving pool (halo ≤ +15–18 R at 0.5–1 cm, ≤ +5 R by 2 cm, within 3° of the side, whole-top mean ≤ +10 R, ≤ 25 % off, shadows keeping their blue) and footprint-filtered arc specular. **Polish round 3** (a fourth owner, `1c71f6e`, `models/cakeShaders.ts` only): the halo multiplies the coat's own lit colour instead of adding the soot colour (`FLAME_POOL` gain 1.0, reach 1.2 cm, broad 0.2 as a white light at the flame's peak channel), so a key shadow inside a halo stays blue; measured: halo +11–13 R at 0.5 cm, +7–9 at 1 cm, +3–5 at 2 cm, hue 219.3–222.6° (shift from the coat's own −0.7…+1.9°), whole-top mean +6.0 / +4.5 / +3.4, 3 % of the top > 3° off (was 74 %), shadows 219.5–220° / sat 0.36 against the lit coat's 220° / 0.33; holds for a warm-cream flame colour; the arcs' ridges prefiltered to the pixel footprint and Tokuyoshi–Kaplanyan specular anti-aliasing (`SPEC_AA`): isolated highlights on the cocoa top 50 → 6 at laptop, 147 → 27 at 540 @2, 66 → 1 at phone; top σ 3.29 with lights off; +0.09 ms. **Fourth judging: signed at square 540, laptop and phone, vanilla and cocoa** — **8 / 8**, **7.5 / 7.5**, **7.5 / 7.5** (macro 5.5 / 5, outside the signature); every acceptance number passing on the judge's own frames: halo +12–13 / +8–10 / +3–4 R at 0.5 / 1 / 2 cm, halos 219.3–221.3° within 1.3° of the side, whole-top +4.7…+6.6 R with 0–1 % of pixels > 3° off (the same mask on the third judge's frames: +20.6 and 73 %), the laptop candle shadow 219.4° / sat 0.360 against the lit coat's 219.0° / 0.341, cocoa isolated highlights 50 → 9 / 147 → 27 / 66 → 1, top σ 3.25. Watch item: the coat's own σ fell 3.81 → 3.25 (2.81 with the flames' light on and shadows off) |
| Steam | All five fixes (edge band 2.5 mm → 1.4 cm carved by billows in material space; material-space jitter with a reprojected temporal history and no octave under 6.6 mm; room 0.3 / key 1.25, two-lobe phase, a 42 % plate shadow; the spill 0.19–0.38 s, the dome's shape held to ~0.75 s; the cap within the plate, ~0.69× the opacity at 1.2–1.6 s, a 5.2 rad roll, smooth wisps to ~4 s, the returning cover pushing the fog); a material-axis bug fixed; cost 1.9–2.2 ms under load (est. 1.1–1.3 quiet) | laptop: form **5** (3.5), motion **6** (5), lighting **4.5** (3.5), integration **5** (4.5) → **5** (4); phone **5.5** / **6.5** / **5** / **5.5** → **5.5** (5). Cost on this build (interleaved on/off bench, the same at load 5 and 10): 1400² 1.9–2.3 ms, 2000² 2.0–2.4 ms, of which 0.7–1.0 ms is not the march | Gone: the cotton wool, the grain (fine noise 0.73 vs 2.01 levels, the frame difference now coherent motion), the dome shape barely holding (inside the seated outline 0.43–0.67 s, top drawn up ~30 px, holds ~0.3 s), too much vapour, the grainy veil. Improved: the rim spill (now a one-sided lump washing the flank white), the lighting (an offset table shadow sells a volume, but ~10 levels light-to-shade across the body), the roll (a C-curl only at 1:1), the return (a smooth halo, no puffs). Worse: the plate goes grey under the held fog (26–36 levels at the centre, 47–69 at the side). New: a frosted-glass ghost cloche (a perfectly smooth wall with nothing finer than 6.6 mm, a crisp elliptical foot), a torn-paper waterline across the plate 0.74–1.0 s, cold neutral steam in a warm room, a felt pattern on the aging cap at 2×. **Not signed.** Seven fixes: fine 2–4 mm edge structure carried with the air and boundary turbulence from lift-off; no steam shadow on the plate where the fog is in front of it and multiple scattering raised so dense fog ≈ 0.95× the plate; the cap's underside band widened to 1.5–2 cm; the steam lit in colour (red − blue +5 to +8); a dense ring core that rolls and tears into 3–6 lobes; the return squeezing puffs out under the rim and the spill as a thin sheet; cost ≤ 1.5 ms (reuse the main depth, cheaper resolve/composite). **Polish round 2** (a third owner, `a27c6fb`): the outer layer peels from lift-off into ~7 mm lobes with 2–4 mm curls and tearing sheets, room air undercutting the foot (lobes per 10 cm at 2×: walls 5–8, crown 3.5–4.6 — the ≥ 6 target met about half the time); the steam's shadow per full-resolution pixel and suppressed wherever fog stands in front of the surface, capped at 0.16, multiple scattering raised, the plate bouncing light up (plate centre −5…+1 levels, shaded side −10…−19); a 1.7 cm soft band under the cap (strongest vertical step median 1.8–2.2, no column > 12); key and room kept separate through the march and tinted at the composite (red − blue +6.3…+7.9); a dense tube round the cap's edge with the rolled sheet wound round it, tearing into lobes from ~1.15 s (curl contrast median 10–16, best 22–29 against 15–20); puffs leaving the closing gap on the return at 0.67–0.80 s, the spill a 3–6 mm sheet (flank +0…+1), a cap of fog still over the seated dome; cost 1.1–1.5 ms at both sizes (1.5–1.6 with two clouds) by removing the ray-entry bisection (~0.9 ms), a `holdDepth` hook, a checkerboard march and phase budgets — the main pass's depth cannot be reused (a multisampled default framebuffer). Tests: `dinner-steam` 23, `scene-depth` 6, `dinner` 27, `dinner.spec` 6, `scene-depth.spec` 5, `collection.spec` 3. **Third judging:** laptop form **5** / motion **6** / lighting **4.5** / integration **5.5** → **5**; phone 5.5 / 6.5 / 5 / 6 → **5.5**. Passed: the white plate (centre −5…+4), no waterline (step median 2.2–2.5), warm colour (red − blue +6.3…+7.9), the crisp foot and the grain gone, cost ≤ 1.5 ms except τ 0.7 and two clouds (1.6). Failed: lobes per 10 cm 3.9–7.8 / 3.4–4.7 (the structure exists — 0.37–0.89 mm rms in the 2–8 mm band — but reads as isotropic cotton fringe), the curl contrast measures a doughnut's hole. **Not signed:** the body swung from the ghost cloche to a near-opaque, flatly lit cotton tuft (far-rim transmittance 0.03–0.08 vs 0.14–0.20 before; dense-body p5–p95 16–25 levels vs 20–57; lit vs shaded flank 3–8), 1.3–1.6× polish 1's vapour, a hollow fog doughnut at 0.93–1.2 s, no legible gush from the gap (a white ceramic bowl under the rim, checkerboard stair-steps at 2×), a cotton cap on the seated dome on the return. The remaining set — for the signature: transmittance 0.3–0.5 at 0.5–0.75 s; self-shadowing with p5–p95 ≥ 40 and the shaded flank 20–30 below the lit one; the edge as ≥ 2:1 stretched sheets; the crown closing over the ring (hole dip ≤ 5); to ship: a gush at 0.2–0.37 s (outside-silhouette p95 60–80 over twice the area), no cap on the seated dome after 0.70 s, τ 0.7 and two clouds ≤ 1.5 ms. **Polish round 3** (a fourth owner, `4f21974`): the young core density 2.2 → 0.2 with a ~6 mm mixing skin carrying the outline and the inside folded into sheets along the rise (far-rim transmittance 0.33–0.41, vapour at 1.2 s 1.00× polish 1); multiple scattering pulled back (0.45/0.18 → 0.18/0.06), the key 0.95 → 1.55 with a 2.5× steeper shadow, the room a fill at 0.12, a finer 28³ light volume, the plate's bounce only near the plate (dense-body p5–p95 42–60 — met; lit minus shaded flank +5…+12 on the steam's own colour — short of 20–30); billows and the peeling layer drawn out 4× along the rise, the isotropic curls removed (anisotropy 1.3–2.1:1 — short of 2:1; the crown now as fine as the walls; lobes ≥ 6 only at 0.54 s); the cap keeping its fog with the stem feeding it (filled visually; the dip measure 10–13 at 0.93–1.06 s then ≤ 3 — short of 5); a curtain of puffs rolling 3.7 cm out over the rim at up to 33 cm/s (outside-silhouette 74–116 k px, p95 67–82, the flank unwashed; a depth-aware fill/denoise removing the stair-steps); the returning dome's wake clearing a 6–10 cm band (over the crown 43–4.7 k px vs 12–29 k; a thin veil p95 7–15 at 0.70–0.80 s); steps 15/12/11, budgets 290 k and ×0.35 for two clouds, an 11-tap light volume, analytic gush tongues (1400²: 1.2–1.4 ms, two clouds 1.5–1.8; 2000²: 1.3–2.4, two clouds 1.5–2.3 — the two-cloud case is fixed costs); the room tint #E6D7C0 (R − B +5.6…+7.3, no ivory cast); regressed: edge temporal noise 1.1 rms at 0.58–0.67 s. Tests `dinner-steam` 25, `scene-depth` 6, `dinner` 27, `dinner.spec` 6, `scene-depth.spec` 5. **Fourth judging:** laptop form **5.5** / motion **6.5** / lighting **5** / integration **6** → **5.5**; phone 6 / 7 / 5.5 / 6.5 → **6**. Passed: transmittance (far rim 0.33–0.43, core 0.28–0.40, vapour 0.85–1.00× polish 1), dense-body p5–p95 42–60, the gush (74–116 k px, p95 67–82, flank 0–1, no stair-steps), the crown as fine as the walls, the white plate, no waterline, the foot, the warm colour; the cap filled; cost one cloud 1.2–1.5 ms, two clouds 1.5 / 1.6. Failed: the lit-minus-shaded flank (−3…+12 on the steam's own colour — interior mottle, no terminator; the eroded interior 27), anisotropy 1.3–2.1 (2:1 only on the right wall at 0.74 s), the hole dip 10–13 to 1.09 s, a thin arc over the crown at 0.70–0.80 s, the roll (a featureless blob). New: translucent felt/lint (spatial grain 1.42 / 1.23 rms vs 0.90), body boil (temporal 1.70 / 1.47 vs 0.84 / 1.03), a limb-dense shell (coverage 0.60 inside rising to 0.71–0.80 at 32–64 px — a bubble read), greyer dimmer steam (bright pixels 6–31 k at luma 218–228 vs 52–122 k at 230–237), salt-and-pepper specks over the cloche's dark reflections at 0.43–0.48 s. **Not signed.** The judge's diagnosis: items 1–4 are a design limit of a half-resolution 11–15-step single-scattered march at ~1.3 ms — translucency, self-shadowing and crisp sheets together need a thin, dense, intermittent field sampled with temporal accumulation (motion-vector reprojection), full resolution in the edge band and real light transport, which exceeds 1.5 ms. **Decision (orchestrator, 2026-10-05): the steam's budget is lifted to ≤ 3.0 ms while steam shows (budgets waived by Surya; the Dinner frame has the headroom at 60 fps) and a structural fifth round is commissioned on that prescription.** **Polish round 4, the structural round** (a fifth owner, `fdaa20c`): the body as the zero set of a smooth two-octave sheet field — thin dense sheets with clear air between, drawn out 2× along the rise, carried and rolled by the flow, torn by the billows, a light skin in place of the dense one; every sharp feature (boundary, skin, sheets, torn edges) integrated exactly over each march step, every pixel marched every frame with 28/22/16 steps, the budget set by the steam's on-screen footprint, a history reprojected through the flow at blend 0.1 with a light denoise and a 1.25σ clip, four warm-up marches when none exists (temporal grain 0.84 / 0.74 — met; spatial 1.01 / 1.09 overall, 0.74 / 0.65 over the backdrop, the rest the plate's rim seen through fog at the required transmittance; far-rim transmittance 0.31–0.39); multiple-scattering octaves on the bright side only, the room fill occluded toward the window, the key 2.0 falling at 3.8× the light volume's depth, a 32³ light volume, each sample integrating the sheet field 1.5 cm toward the key so a sheet shadows the air behind it (lit − shaded +28 / +23 / +22 as a coherent gradient, eroded interior p5–p95 57 / 55 / 46 — met); coverage core / ring 1.25–1.42 (met); anisotropy right wall 1.63–2.01, left wall 1.90–2.23, crown 1.33–1.81 (the crown not met — taller crown tongues reached 1.69–2.18 at temporal grain 1.00); a stem as wide as the well feeding the cap (dip 4/9/8/5/5/5/0/3/3/0 — two frames at 0.96 and 0.99 s are the lifted cloche's shadow); the squeeze puffs kept low, the wake clearing further and a final sweep from 70 ms before seating (0 px over the crown at 0.67–0.83 s — met); the speckles over the cloche's reflections and the gap's mottle gone; the gush 74–126 k px at p95 64–78 with the flank at 0; vapour 0.87–1.14× polish 1; dome IoU 0.42–0.55. Cost: one cloud 0.7–2.6 ms at laptop/phone, two clouds 2.3–2.4, 1.9–3.0 at the judges' 1400²/2000², the whole frame 2.5–4.9 ms with steam (laptop 3.2–4.9, phone 2.5–4.9; 1.8–2.4 without); real-time pacing p95 16.7–16.8 ms, no frame over 20 ms. Tests `dinner-steam` 25, `scene-depth` 6, `dinner` 27, `dinner.spec` 6, `scene-depth.spec` 5. The owner's view: a real step up, soft at 2× (0.55 march px per CSS px), the crown under 2:1, the dome at 0.55–0.75 s a mound with a frayed top, no distinct rolled lip. **Fifth judging:** laptop form **6** / motion **7** / lighting **6** / integration **6** → **6**; phone 6.5 / 7.5 / 6.5 / 6.5 → **6.5**; the whole reveal as a guest sees it 6 / 6.5. The structural round did what it set out to do: the felt, the boil, the shell, the specks and the gap's mottle are gone; the body reads as translucent self-shadowed veils; grain (temporal 0.84 / 0.74; the steam's own spatial 0.65–0.86), the terminator (+22–28), coverage (1.25–1.42), the return's crown (0 px), cost (2.8–2.9 ms at τ 0.3–0.7, 1.9 later; pacing p95 16.7–16.8, no frame over 20 ms) pass; anisotropy (crown 1.33–1.81) and two dip frames (on the cloche's shadow) fail. **Not signed.** New: a bounding-box clip down the cloud's right flank at 0.86–1.25 s (44–64 px tall, visible at guest size — `steamBounds` no longer contains the sheet field); the cloche's shape not legible at 0.40–0.60 s (haze plus strands, the crown fraying at once; inside/outside brightening ratio 1.0–1.3 — polish 3's dense felt read more like the cloche); soft at 2× (edge gradient 0.53–0.78 vs 0.72–1.54); it hovers then evaporates in place (centroid +2 cm by 1.12 s, mass 6.56 M → 2.02 M by 1.38 s); rim puffs popping out in one frame on a decline (30 k → 2.7 k px); greyer dimmer steam remains. The judge's kinds: the box clip, the rim-puff pop, a held dome for 0.15–0.25 s, rise and a rolled lip, a brighter lit side — constants ("a sixth round would likely reach ~6.5 at laptop and 7 at phone"); the softness at 2× and the crown anisotropy — a design limit at 3 ms. **Decision (orchestrator, 2026-10-05): the budget lifted once more to ≤ 6 ms while steam shows (the frame paces at 16.7 ms with 2.5–4.9 ms used) and a final round commissioned on all six items, the budget spent on march resolution.** **Polish 5** (merged 5772303): the box clip traced not to `steamBounds` but to the march's three occupancy probes stepping over the flank (the per-clock boxes had carried the shadow's reach; now steam-only, probes ≤ 0.3 su apart: vcut 0 px); the decline's rim puffs moved from the cover's frame into the room's air (−7…−26 % a frame while visible); the crown taking 20 % of the dome's drag until 0.6 s (inside/outside 50 → 1.9 over 0.45–0.67 s, IoU 0.83 → 0.45); a 23.9 cm/s thermal (centroid +6.8 cm by 1.2 s, cap mass 104 % at 1.38 s, lip +22 levels); key 3.2; march 0.82–0.85 px per CSS px at the clip, 34/28/20 steps. Not met: lit side ≥ 232 (7–12 k px), edge ≥ 1.2 at 2×, crown 2:1; the own-colour terminator lost (+1…+3). **Sixth judging:** laptop form **6.5** / motion **7** / lighting **5.5** / integration **6.5** → **6.5**; phone 7 / 7.5 / 6 / 7 → **7**; guest size 6.5 / 7. Every owner number reproduced; two runs byte-identical; no-steam twins identical to judge 4's. Items 1–2 pass, 3 passes on ratio and outline (edge ≥ 1.2 only from 0.61 s), 4 passes on its numbers but the cap reads as a smoke ring, 5 and 6 fail. **Not signed.** Ranked tells: (1) past 1 s the cloud behaves like smoke, not condensate — mass 7.58 M at 0.99 s → 8.89 M at 1.12 s (it gains mass after release), vapour 2.0–2.3× polish 1, a hollow underside with curled rims (ring centre 0.35–0.45), a cap 1.3× the plate, then 80 % gone in 0.3 s while the area holds (a cross-dissolve in place; condensate thins from its edges) — constants; (2) soft and brushed at 2× (edge ≈ 0.44–1.08 on the fifth judge's scale, fine detail 0.41–0.58, anisotropy 1.04–1.35) — a design limit of the approach, and at the app's real framing the march runs 0.68 / 0.57 / 0.48 px per CSS px at 0.45 / 1.0 / 2.2 s (the 0.82 holds only at the clip); (3) flat lighting: own colour 249–251 everywhere, lit − shaded +1…+3, the key's direction no longer legible in the volume — constants; (4) laptop steam cost 5.0–6.5 ms at the app's real framing (the owner's clip-sized bench saw 1.1–4.2; the in-app bench `bench6.ts` at the real DSF is now the reference) — constants (march pixel budget); (5) the gush an airbrushed blob dissolving in place over four frames — constants; (6) the held dome freezing briefly (1.6 levels a frame at 0.53–0.59 s) — minor. Phone 3.2–4.5 ms; two clouds 3.6–4.6; pacing p95 16.7–16.8, max 16.8, no frame over 20 ms at either size. The judge: "a supervisor would accept that the beat now works … but it does not read as filmed steam"; with constants alone ≈ 7 / 7.5; **signing needs a different approach** (a density advected per frame at 1–2 mm, more samples, multiple scattering — not in 6 ms with this half-resolution analytic march), on which the owner and the judge agree. **Decision (orchestrator, 2026-10-05): one more constants round (polish 6) on the envelope, the filled plate-sized cap, the terminator, the gush and the cost at the real framing; the brighter-lit-side target withdrawn in favour of a legible terminator; the softness recorded as the design limit, with the different approach proposed for a later version.** **Polish 6** (merged 1c61c25): the condensate's envelope — the visible edge recedes into the cloud from 0.3 s of the thermal (2.1 cm by 1.0 s), the cap no longer gathers fog: the cloud's mass peaks 5.11 M at 0.74 s and falls every frame after, half by 1.30 s, worst 0.3 s window −43 % (was +18 % after release, then −80 % in 0.3 s), the edge band to 0.38 of its peak while the core holds 0.6, the cloud alone shrinking 130 → 46 k px, vapour 0.77–0.80× polish 1 (was 2.0–2.3×); the cap filled (ring centre 0.68–0.83 of its rims, was 0.35–0.45; lip +17–19.5 levels; 0.52–0.62 of the plate's width); the gush carried up (2.5 cm up / 0.8 out over 0.43–0.56 s, 6.4 cm by 0.61 s, gone by 0.67 s, no exit pop) instead of dissolving in place; the held dome's freeze gone (2.8–6.6 levels a frame at 0.53–0.61 s); the march boxes following the receding cloud and the march budget 240 k → 180 k pixels, so the laptop steam cost at the app's real framing is 5.0 / 5.1 / 5.4 / 4.9 / 5.3 / 3.9 ms at 0.3–0.7 s and 3.5–4.0 at 1.0–2.2 s (was 5.6–6.3), phone 3.8–4.7, two clouds 4.3–4.5 / 3.7–4.1, the resumed reveal 4.4–4.9 (was 5.9–6.2). Not met: the own-colour terminator (+2 / +3 / +5 against +15) — the key is up-left-front, 44° off the camera, so the dome's right side is lit through its top; a ×20 self-shadow reached +16…+41 but made 38–53 k px of the shaded steam darker than the wall and, with a light floor, broke the lip and the envelope: a rig decision, not a constant. **Seventh judging:** laptop form **7** / motion **7.5** / lighting **5.5** / integration **7** → **7**; phone 7.5 / 8 / 6 / 7.5 → **7.5**; the reveal at CSS size 7 / 7.5. Every owner number reproduced; re-renders and judge 4's no-steam twins byte-identical; the cap's width settled at 0.62 → 0.52 of the plate's gilt rim (no measure gives the sixth judge's 1.3×). Items 1, 2, 4 (motion), 5, 6 pass (laptop p50 touching 6.0 ms at 0.45 s in one run: no margin on the median); 3 fails (a rig decision: the composite's +51 "lit side" is the cloche's dark reflections behind the steam, not the key — over the cove alone the sign is inconsistent; the own colour sits on the tone curve's shoulder at p95 250–251, so only shade, not a stronger key, can make a lit side); 7 fails (the design limit: edge 0.56–0.99, anisotropy 1.13–1.41, march 0.70 / 0.65 / 0.58 px per CSS px). Every regression check passes (box clip in every direction, decline puffs, return crown, specks, pops, plate, waterline, reduced motion, determinism, Low tier, tail, two clouds, no steam darker than the wall, warmth, far rim). **Not signed.** Ranked tells: (1) the gush, an airbrushed ball beside the plate's right rim at 0.42–0.62 s (112–156 k px, p90 35–65, half the frame's visible steam at 0.48 s; whole-frame dome IoU 0.53 / 0.40 / 0.43) — its size and brightness constants, its lack of structure a design limit; (2) flat lighting (own colour p5–p95 within 4–18 levels, lit − shaded +2…+11) — a rig decision (a steam-specific rim or back light against the cove, the own colour brought off the shoulder); (3) soft and combed at 2× — the design limit of this approach; (4) the cloud's last 0.4 s ending as a ring-shaped wisp while the plate's veil grows under it (plausible; minor); (5) the held dome competing with the gush. The judge's closing: "a supervisor would sign off the beat, the timing and the technique … but the brief is a frame that reads as photographed steam at delivery size"; the second tell needs a lighting decision and the third a different method, so it cannot be signed with constants; a guest sees a convincing steam beat at CSS size, the one thing they may notice the soft white ball beside the plate at ≈ 0.45 s. **Decision (orchestrator, 2026-10-05): a last constants-only round on the gush's size and brightness (polish 7), re-checked by the same judge on that tell; the terminator surfaced to Surya as a rig decision; the softness and the gush's structure recorded as the design limits, with the next approach in `docs/RESUME.md`.** **Polish 7** (merged 7ca077f; `GUSH.density` 5.2 → 1.72, a drawn growth of 0.26 under the box's 0.45 so the march's footprint and the cloud are untouched, the spill's fade from 0.40 s): the gush's share of the visible steam at 0.48 s 50.8 → 22.1 % (phone 46 → 21 %), area 112–156 k → ≤ 67 k px, p90 65 → ≤ 39, still legible (26–43 k px over 8 levels, p90 22–43 at 0.42–0.50 s), still carried (+2.3 cm over 0.43–0.56 s, +4.7 by 0.61 s, gone by 0.74 s, no exit pop), the whole-frame dome IoU 0.53 / 0.40 / 0.43 → 0.71 / 0.64 / 0.67, inside/outside 91 → 2.0 over 0.45–0.67 s, the frame's mass peak now the condensate's own (5.12 M at 0.74 s); the cloud-only and gush-off twins byte-identical before and after (41 of 41 frames); laptop cost 3.9–5.2 ms at 0.3–0.7 s (was 4.6–5.5), phone 3.8–4.5; laptop pacing p95 16.7. Re-exposed: the held dome's own stillness, 2.2–2.5 levels a frame at 0.53–0.56 s (the large gush's motion had carried polish 6's "no freeze" item). Phone pacing not measured cleanly by the owner (load 11–20). **Re-check (the seventh judge, 7ca077f):** the gush's share 34 / 22 / 15 / 4 % at 0.416–0.608 s (polish 6: 63 / 51 / 45 / 23), area 45–67 k px, p90 25 at 0.48 s (45 / 43 at 0.384 / 0.40 s, ≤ 39 from 0.416 s); from 0.48 s the dome dominates (p90 70–78 against the gush's 7–25); at CSS size the gush "no longer takes the eye" — a faint wisp off the plate's right rim, the dome under the lifted cloche the subject (at 2× still a smooth featureless oval: a minor tell now, its structure the spill parcels' design limit); the dome's stillness at 0.53–0.56 s is not a visible freeze (the gush-off twin of polish 6 had the same 2.7–2.9 levels a frame; the top rises 4–7 px a frame at 2×, 20–22 % of its CSS pixels change by over 4 levels a frame — a held dome rising slowly, the intended beat); the gush-off twin byte-identical to polish 6's over 28 frames. Dinner pacing laptop and phone ×3: p50 16.70, p95 16.70–16.80, max 16.8, no frame over 20 ms. **Re-scored:** laptop form **7.5** / motion **7.5** / lighting **5.5** / integration **7.5** → **7** (unchanged); phone 8 / 8 / 6 / 8 → **7.5** (unchanged); the reveal at CSS size **7.5 / 7.5** (laptop was 7). **Not signed:** "what a supervisor would still reject is the flat, directionless white lighting of the volume and the soft, combed body at 2× — those need a decision on how the steam is lit and a different rendering method, not constants" **Decision (orchestrator, 2026-10-05, after the push of 4e815b7): the pass's bar is Surya's "Hollywood CGI level", and both blockers have a path inside the steam module — the seventh judge's own prescriptions: a steam-specific rim or back light seen only by the steam's light transport with the own colour brought off the tone curve's shoulder (no change to the scene's rig), and a full-resolution edge band with motion-vector accumulation or a per-frame advected 1–2 mm density, at a steam budget of ≤ 9 ms while steam shows (budgets waived; the frame has the headroom). A second structural round (polish 8, `v1.6/steam-polish8` from main) is commissioned on those two items, polish 7 the fallback; an eighth judging follows** **Polish 8** (`v1.6/steam-polish8` 6c32749, not merged at the time of writing): prototype A/B on a throwaway branch — (b) a 128³ advected sheet field (2.6 mm voxels) came out *softer* than the analytic field it advects (the grid's resampling diffuses the sheets each step; edge 0.53–0.86, +5–6 ms), (a) a full-resolution march with a sharper boundary and finer sheets reached edge 0.69–1.25 and fine detail 0.66–0.77 at temporal grain 0.99–1.19, so (a) was built, confined to the silhouette band. Item 1, light direction: a steam-only second key low from the window's side at 3.0 carrying the lit/shade split, the rig key in the steam 2.8 → 1.0 with ×60 self-shadow, room 0.15 → 0.65 (#EEE9E1) as the shade's floor, a back light at 1.3 on the cloud's outer 5 mm composited as light against the cove (in the own colour it dragged the split to +6…+13), a steam tone curve (exposure 0.79, shoulder from 0.5), gush density 1.72 → 1.35 for an unchanged share: **own-colour lit − shaded +18 / +18 / +21** at 0.61 / 0.67 / 0.74 s (target ≥ +15; was +3 / +3 / +5), top − underside +15…+29, the sign over the cove positive in own colour wherever measurable (composite −3 at 0.74 s over 504 px), no steam darker than the wall but ≈ 300 px of 4–6 levels over the cloche's window reflection, plate +1…+2 / ≥ −8, far rim 0.29–0.45, warmth +6.9…+7.6 — met. Item 2, the 2× softness: a full-resolution edge pass over the silhouette band (1 march px per CSS px, its own reprojected variance-clipped history, blended seamlessly into the half-res steam, only while a cloud is young, skipping gush and veil) with millimetre tears in the band (≈ 1 mm across, 3.4 mm deep, 10× at the crown): edge gradient 0.68–1.02 (target ≥ 1.2; was 0.56–0.99), outline gradient 1.70–1.99 (was 0.75–1.38), fine detail 0.47–0.64 (met at 0.48 and 0.67 s only), crown anisotropy 1.15–1.76 but horizontal, temporal grain 0.89 / 0.93 / 0.79 and spatial 1.03 / 0.75 / 0.64 (limit 0.9; most of the rise the tone curve spending more levels on the shade) — **not met**. Marginal slips: whole-frame IoU 0.69 at 0.48 s, mass +1 % at 1.12 s and half-peak at 1.35 s, cap 0.66 of the plate at 0.99 s, 63 faint px over the seated crown on a decline, clip runs to 23 px. Cost (bench6, real framing, polish 7 as a same-session control): laptop 4.6–7.6 ms (worst p50 8.3 at 0.45 s) vs 3.4–5.2, phone 4.5–6.9 vs 3.4–4.5, two clouds 6.3–6.8 / 5.3–6.0, resumed reveal 5.0–5.9 / 4.4–5.0 — within 9 ms; pacing laptop p95 16.7–16.8 clean; phone p95 16.7–16.8 in all 12 accepts but 3 had 3–4 frames of 33–50 ms under background load while the control was clean (unproven either way). Tests `dinner-steam` 30, `scene-depth` 6, `dinner` 27, `dinner.spec` 6, `scene-depth.spec` 5, `posters.spec` 5. **Eighth judging (polish 8 vs polish 7 A/B):** pending |
| Flames | All five fixes and the light: the smoke as a volume (`models/birthdaySmoke.ts`: the strand physics stays the source, ribbons draw the first 2.5 cm, parcels splat into a 5 mm grid of ≤ 80 × 96 × 64 voxels over the top tier, a low-res light pass toward the key, a 40-step half-res march with scene depth; laminar to 3–4 cm then folding into sheets 1–2 cm wide at 10 cm and 3–5 cm at 20 cm, the six merging by 20 cm, a first puff 1.8× denser for 0.45 s; 0.63 / 0.57 ms); the flame on its wick (15.5 mm ±12 %, the bright zone's foot 1.2 mm below the tip, visible bare wick 0.11 of the flame, a glowing charred bead, one continuous blue shell); colour and bloom (a 1 − e⁻ˣ response, the white core 46 % of the width low in the flame, body G/R 0.79–0.88, tip 0.61–0.67, an amber two-lobe bloom that no longer adds onto the flame, ±2–4° rest lean per candle); motion (the coherent 11 Hz buzz dropped on the research — bundled flames oscillate, a single one is steady — for per-candle 1/f sway RMS 2° at 0.31–2.4 Hz, breathing RMS 3.2 %, 100–300 ms flutters one candle at a time; sideways 0.35–1.7 px at laptop size); the blow (bends from the base, ×1.58 long ×0.58 wide at lift-off, the bright zone torn into tongues and gone within 44 ms, the base a dim blue sheet); the light calibrated to ~900 lx against ~2,500 lx of room: +24.5 % at the top tier's centre with warm pools and glowing wax tops. Whole fire ≤ 1.6 ms at both sizes. The depth pass now lets the scene's lights take part (−0.5 ms of program re-checks for every depth client); bloom on layer 29 | re-judge (laptop / phone / 540 / 192), first judging in brackets: flame at rest **7** (5.5) / **7** (5.5) / **7** (6) / **5.5** (5); flicker/life **6.5** (4); blow **6.5** (5), 2× close-up 5.5; smoke 0.3–0.8 s **6.5** (6.5); smoke 1–4 s **4.5** (3) / **5** / **5**, close-up 4; light (provisional) **4** (3.5); macro **6** (5). Measured: sideways tip motion sd 0.95–2.1 px (was 0.15–0.47), dominant 1–2 Hz (was 10.9–11.9), area correlation −0.03, breathing sd 3.1 %; the top-centre +51 R / +19 G / 0 B when lit, static | "The flame is now a candle flame. The buzz, the stick and the lemon colour are gone." **Signed for the flame at rest at phone and 540 and for the blow at laptop and phone; not as a whole.** Remaining: the smoke 1–4 s (six parallel bright stems 3–6 cm tall are still the main read at laptop; above them the 5 mm voxels blur to ~8 device px with no crisp sheet edges or curls), the light recolouring the whole top lilac (+73 % R, +20 % G, 0 % B in linear, evenly) and snapping back at the blow (−51 R in 180 ms), an orange collar and a match-head bead at the foot, a pale glass-bubble blue cup, a detached golden sliver and a salmon puff at lift-off, a weak first puff. The smallest set: crisp folding sheet structure above the stem with stems ending at different heights; a dense white first puff (+25–40 levels for 0.15–0.4 s); the foot fading to a dim blue zone with a ≤ 0.6 mm irregular bead; lift-off dropping to a dim wisp within one frame; the light warm cream (≤ +10–15 R), breathing with the flames, fading candle by candle at the blow (with the cake owner's pooling). **Polish round 2** (a third owner, `4da0508`): each candle's smoke stem ends at its own height (4.2–11.4 cm) and lean (4.5–7.4°), five strands per candle, the ribbons drawing the stem and then 1–3 mm filaments fading 6–24 cm above, the volume carrying a turbulence channel that draws sub-voxel sheets (sharp lines per plume at 2×: 2.3 at 1.1 s, 5.2 at 1.6 s, 3.0–4.3 to 3 s; median +10–17 levels, half-width 3.0–3.4 px; the physics 0.76 ms with each plume computed once); a first puff 12× the smoulder rate rolled by the breath (core +20–33 levels at 0.24–0.40 s, red 7–10 below green — no salmon; the hairline fan gone with the ribbons drawing only threads); the bright zone starting 0.4 mm above the wick tip with an 18 % dim blue zone (orange share of the bottom 10–20 % 10–21 %, was 50–71 %; the lowest 20 % at laptop 10–19 % orange, was 40–52 %), a 0.6 mm lumpy bead at ~1,130 K, a deep-blue cup adding ≤ +3 B; lift-off dimming to 0.3 % within 16 ms; the light (1, 0.84, 0.45) — soot at 1,900 K through a camera balanced part-way to the candles — at +6.0 / +5.0 / +1.3 levels on the top centre, breathing sd 1.4 %, fading candle by candle over 112–272 ms at the blow; whole fire 1.21 ms lit, 0.81 ms in the smoke; tests `birthdayFire` 35, `flameRender` 7, `birthday.spec` 7, `bloom.spec` 3. **Third judging** (laptop / phone / 540 / 192): flame at rest **7.5 / 7.5 / 7.5 / 6**, flicker **6.5**, blow **7** (close-up 5.5), smoke 0.3–0.8 s **7** (close-up 5.5), smoke 1–4 s **6.5 / 6.5 / 6** (close-up 5.5), light **6.5**, macro **6.5**. Gone: the six stems, the soft columns (2.3–4.3 crisp edges per plume), the lilac top (+6.2 / +5.3 / +4.2 on the top), the snap-back, the collar, the bead, the blue bubble, the salmon puff, the hairline fan; the first puff passes (+25–34 levels). **Signed: the flame at rest at every size, the blow at laptop and phone, the smoke 0.3–0.8 s at laptop and phone; not as a whole.** Remaining: a static white "marshmallow" at each wick 160–300 ms after extinction (new in polish 2), filaments reading as wire (half-width 0.7–1.5 mm to 20 cm, fold knots +22–30), the flame hovering ~1.5 mm above its wick at 30×, brushed striations at the torn foot, the halo peaking inside each candle's own shadow (optional). **Polish round 3** (a fourth owner, `7f83f52`): the capsule was the smoke ribbon drawn 3.15–3.4 mm wide and nearly opaque, carried end-on by the dying breath — the burst now e-folds in 0.08 s (`puff` 12 → 30, the same total vapour, 58–62 % given off in the breath), the stream 1.0–1.13 mm at the wick widening only with age, flapping on the jet's eddies, the roll winding the smooth path (largest 1 ms move 0.9–1.4 mm), dense ribbons taking the volume's multiple-scattering terms; the first puff kept (+22.7 / +23–27 / +24–46 levels); filaments widening linearly from 5 cm and thinning as they widen (half-width 0.67 / 0.88 / 1.42 / 2.26 / 2.96 mm from 0–4 to 16–20 cm at 1.97 s, was 0.69–1.19; +7.8 → +4.9 levels at 16–20 cm), the three knot causes (runs pointing at the lens, fold reversals, tight turns) drawn once — no knot over +6 (the second judge's crisp-line count above the stems falls to 0.2–0.8 per plume); `FLAME.foot` 0.8 mm under the wick tip with a 1.7 mm dim ramp and a two-capsule occluder following the curl (flame 3 reaching 0.48 mm below the ember's top, flame 1's wick 1 mm inside; orange share 39 / 7 / 10 / 22 %); 64 march steps in a gust with white-noise jitter and the soot gone 8.5 ms after lift-off (the sliver frame 86 → 1.3 %); the own-candle halo handed to the cake owner (`FLAME_POOL` skips its own candle). Cost lit 1.38–1.60 / 1.19 ms, gust 1.71, smoke 0.78 + 0.57–0.76 ms physics; `birthdayFire` 37, `birthday.spec` 7, `bloom.spec` 3, Birthday posters not stale. **Fourth judging** (laptop / phone / 540 / 192): flame at rest **7.5 / 7.5 / 7.5 / 6**, flicker **6.5**, blow **7.5** (close-up 6), smoke 0.3–0.8 s **7** (close-up 6), smoke 1–4 s **6.5 / 6.5 / 6.5** (close-up 5.5), light **6.5**, macro **7**. Gone: the hover, the striations and sliver frame, the fold knots, the wire above 8 cm. **Signed: the flame at rest at every size, the blow at laptop/phone/540, the smoke 0.3–0.8 s at laptop/phone/540; not as a whole.** Remaining: a static jet at the wick (IoU 64–84 % over 48 ms, FWHM 1.5–2.0 mm at 1 mm, a rounded cone "like a spray nozzle"), the widening as a blur (crisp lines per plume 0.2–1.2, the plume nearly gone above 16 cm, the curls and folds lost; below 8 cm six evenly bright threads), the denser puff fogging the back-right candle to saturation 0.03–0.05. The smallest set: a ≤ 1.2 mm stream torn downwind into a thinning streak that turns upward within 80 ms and holds nothing still for 48 ms; ≥ 2 crisp fold lines per plume at 8–20 cm bounding the veils, the plume to 20 cm at 2 s, ±30 % width/brightness variation along 0–8 cm; the puff leaving a candle behind it at saturation ≥ 0.10. **Polish round 4** (a fifth owner, `13aad66`): the cone was the 5 mm-voxel volume drawing the stream from 2–8 mm of travel — now a 0.45 mm thread at the ember thinning as it is carried, drawn by the ribbons until it rolls into the puff 1.5–4.5 cm out (FWHM 0.5–1.0 mm at 1 mm, tapering outward, IoU 0–61 % over 48 ms, ≤ 42 % of pixels still, turning to 68–70° within 78 ms of the breath halving); widened filaments drawn as sheets — a faint 10 % band across the width and the rest in fold lines at the two edges, the stronger edge shifting as the sheet turns, filaments to 30 cm (crisp lines 5.8 / 6.7 / 5.0 / 2.7 / 3.7 / 2.0 per plume at 1.07–3.50 s, 255 peaks at 16–20 cm, the stems necking ±35 % and the ember's output wavering ±35 %); the burst diluted more by the breath with its scattering boosted (the back-right candle's saturation minimum 0.141 / 0.100 upper half; puff cores +22–34). Costs lit 1.44–1.63 ms, puff 1.09–1.54, smoke 0.69–1.40; `birthdayFire` 41, `birthday.spec` 7, `bloom.spec` 3 (one pre-existing one-pixel flake). **Fifth judging** (laptop / phone / 540 / 192; the flame frames bit-identical to the fourth judging's): flame at rest **7.5 / 7.5 / 7.5 / 6**, flicker **6.5**, blow **7.5** (10× close-up 6.5), smoke 0.3–0.8 s **7** (3.5× close-up 6.5), smoke 1–4 s **7 / 7 / 7** (2× close-up 7), light **6.5**, macro **7**, **the whole sequence 7 / 7 / 7**. The fourth judging's items: the static jet gone (FWHM 0.5–1.0 mm at 1 mm, IoU 0–28 % over 48 ms, 0–17 % of pixels held still, turning up 78 ms after the breath halves); the blur gone at 2× (crisp lines 5.8 / 6.7 / 5.0 / 2.7 / 3.7 / 2.0 per plume, 161–351 peaks at 16–20 cm, stems ±22–31 % in brightness); the fogged candle gone exactly at the threshold (saturation 0.141 / 0.100). The 0.3–0.8 s stage still reads with the thinner puff (its peak unchanged at p98 +27–29, its area 61–64 %); "the threads now lead visibly into rolling puffs". **Signed: the flame at rest at every size; the blow, the smoke 0.3–0.8 s, the smoke 1–4 s and the whole sequence from ignition through the smoke at 4 s, at laptop, phone and 540.** Not signed: the 10× blow close-up, the 2× smoke detail and the 30× macro — the thread feeds a shapeless puff ("a balloon on a string": detail finer than 3 mm at 0.6–0.8 levels rms, a design limit of the 5 mm voxels), the stream a clean constant-brightness line with angular notches at 10×, the 1–4 s smoke made only of 0.44–0.59 mm lines at 2× with zigzags at tight turns, the smoke after 1.5 s fainter (a watch item), the rising puff combed into vertical streaks at 2–3×, the phone's puffs detached for one frame at 0.3 s. **Decision (orchestrator): the close-up tiers are below any size a guest sees; recorded as known gaps, no further round** |

### Verification on the integrated build (v1.6)

The machine was shared by up to six rendering sessions during this pass (load average 30–90), so timing-sensitive
unit tests (the Party clearance test, the Sports planning test) timed out under load and were re-run alone.

- **At 1c61c25** (`v1.6/integration` with steam polish 6): `pnpm typecheck` clean; the unit suite **461/461**, the Party
  clearance test (`tests/party.test.ts › a change of mind never cuts the cover through the arm`) with
  `--testTimeout=1800000` (its wall time tracks the machine's load: on a quiet machine, load average 3.7, the whole
  suite ran in 85 s); the browser suite **117/117 (1c61c25)** on a freshly started dev server — on a server that had
  hot-reloaded through many merges, `scene-depth.spec › dinner` counted zero depth passes because its
  `import('/src/render/sceneDepth.ts')` got a different module instance than the app's (the HMR trap; restart the
  server before the suite or any harness that hooks `Stage.prototype`).
- **At 7ca077f** (steam polish 7 merged): the Dinner, scene-depth and posters specs 16/16.
- **At 1796b77 + 5ac3518** (the review's steam fixes 1 and 2 merged, the evidence cherry-picked; fix 3 left on its
  branch — `docs/scenes/dinner-v1.6-steam.md`, Review fixes): `pnpm typecheck` clean; `dinner-steam` 29, `scene-depth` 6,
  `dinner` 27; the Dinner, scene-depth and posters specs 16/16 on a fresh server; the Dinner posters byte-identical.
  The full suites on that build: `pnpm typecheck` clean; unit **463/463** (two tests added by the fixes); browser
  **115/117**, the two failures the known bloom flake (passed 1/1 on re-run) and `resilience.spec › 30 stage re-creations…`
  failing once at `dinner: Static` with one renderer and one context still reachable after two forced collections —
  passed 4/4 on re-run and in every earlier full run of the session (a GC-timing race in the check, right after
  `setQualityTier('static')`; recorded in `docs/RESUME.md`).
  The full suites at 7ca077f: `pnpm typecheck` clean, unit **461/461**, browser **116/117** with the one failure the
  known flaky bloom assertion below (the spec passed 3/3 when re-run on the same server).
- **Dinner pacing, from the judges' own `pace.ts`** (real-time rAF intervals over three whole accepts each, laptop
  1280 × 720 @2 and phone 390 × 844 @3): fifth judging p95 16.7–16.8 ms, no frame over 20 ms; sixth and seventh
  p95 16.7–16.8, max 16.8, no frame over 20 ms at either size. After polish 7 the owner measured the laptop at p95
  16.70, and the seventh judge's re-check at 7ca077f gave laptop and phone ×3: p50 16.70, p95 16.70–16.80, max 16.8,
  no frame over 20 ms.
- **Birthday integrated pacing** (the seventh judge's `pace-scene.ts`, a fresh reload per run, lit candles → blow → smoke
  to ≈ 4.5 s, laptop ×6 and phone ×9, load average 3.3–4.8 with other sessions' browsers active): p50 16.70 and p95
  16.70–16.80 in 5 of 6 laptop and 7 of 9 phone runs, max 16.8 and no frame over 20 ms in 5 of 6 and 5 of 9; the other
  runs had 1–22 frames of 33–100 ms, clustered where the other sessions' GPU work landed, not where the scene's cost
  rises: the in-app whole-frame render cost through the accept is flat (p50 9.2–10.8 ms, p90 ≤ 12.6, max 13–17 ms at
  both sizes; Dinner 3.2–6.2). Birthday has ≈ 6 ms of headroom against Dinner's 10, so it drops vsync under background
  load where Dinner does not. **On a quiet machine** (load average 3.0–3.9, no other browser, the same harness, 2026-10-05 at 5ac3518, laptop ×3 and
  phone ×3 each, `evidence/v1.6/verification/pacing-final.txt`): Birthday p50 16.70, p95 16.70–16.80, max 16.8, no frame
  over 20 ms in all six runs; Dinner p50 16.70, p95 16.70–16.80, max 16.8 in five of six runs — the sixth (laptop run 0) had
  one 33.3 ms frame, the very first frame of the accept (a first-use hitch, not the steam), none after. Both scenes pace at
  60 fps at both sizes on the integrated build.
- **A known flaky test:** `tests/browser/bloom.spec.ts › Birthday: the lit candles bloom…` fails now and then in its
  last assertion (two stills of the just-accepted pose, bloom on and off, must be byte-identical). Consecutive stills
  differ by two pixels by 1–7 levels inside the smoke's region on the merged build and on the pre-merge build alike:
  GPU-level nondeterminism in the live smoke march, not a logic change (`docs/RESUME.md` has the fix in the test).
- **The compressed export's determinism:** the compressed export of a test document is bit-deterministic
  (`tests/masters.test.ts`), the cake's piping generator too (`tests/birthdayPiping.test.ts`), and the uncompressed
  export reproduced the committed bytes, and two consecutive full `pnpm models birthday` runs on the merged
  build (2026-10-05, 7ca077f, load average ≈ 4, ≈ 35 s each) gave byte-identical GLBs (sha256 2a5d3aa2…ee6a33) and left
  `git status` clean: the compressed export reproduces the committed `birthday.glb` byte for byte.

### Known limitations (v1.6)

From the last judging of each object and its record's last polish round (`docs/scenes/birthday-v1.6-cake.md`,
`docs/scenes/birthday-v1.6-flames.md`, `docs/scenes/dinner-v1.6-steam.md`, each under "Known gaps").

- **Cake: signed at square 540, laptop and phone** (fourth judging, vanilla / cocoa 8 / 8, 7.5 / 7.5, 7.5 / 7.5). The
  30× macro stays at 5.5 / 5, outside the signature and below any size a guest sees: crisper star ridges, sugar grain,
  a window reflection on cocoa and irregular tassel beads (the second judging's macro list), and the record's
  macro-only list (the concentric arcs, the tail-tip horn, toothpaste ropes, the regular star kiss, pinhole specks,
  uniformly glossy cocoa piping). Watch item: the coat's own σ fell 3.81 → 3.25 (2.81 with the flames' light on and
  the candle shadows off). The candles' key shadows are analytic upright capsules (the 1024² shadow map cannot
  resolve an 8 mm candle). The shared rig's key is frontal (left, ≈ 40°): the judges asked for a less frontal key for
  the decorated face — a rig decision, not the cake's.
- **Flames: signed as a whole sequence at laptop, phone and 540** (fifth judging, 7 / 7 / 7; the flame at rest at
  every size, the 192 thumbnail 6). Withheld and recorded as known gaps, below any size a guest sees: the 10× blow
  close-up (6.5), the 2× smoke detail and the 30× macro. Their tells: the thread feeds a shapeless puff ("a balloon on
  a string": detail finer than 3 mm at 0.6–0.8 levels rms, the limit of the 5 mm voxel smoke), the stream a clean
  constant-brightness line with angular notches at 10×, the 1–4 s smoke made only of 0.44–0.59 mm lines at 2× with
  zigzags at tight turns, the rising puff combed into vertical streaks at 2–3×.
  The light scored 6.5. The smoke after 1.5 s is fainter (a watch item), and the phone's puffs detach for one frame at
  0.3 s. The live smoke march is not bit-deterministic between consecutive stills (two pixels; the bloom.spec flake
  above).
- **Steam: 7 / 7.5, not signed** (seventh judging, confirmed by its re-check of polish 7: 7.5 / 7.5 at CSS size). Soft and combed edges at 2×
  (edge 0.56–0.99, crown anisotropy 1.13–1.41, the march 0.70 / 0.65 / 0.58 px per CSS px): the design limit of a
  half-resolution analytic march. No light direction in the volume (own lit − shaded +2…+5 at 0.61–0.74 s on the
  owner's measure, +2…+11 on the judge's): a rig decision — the key, 44° off the camera, lights the dome's right side
  through its top, and the own colour sits on the tone curve's shoulder (p95 250–251), so no steam constant makes a
  terminator. The gush at 0.42–0.62 s is a structureless soft puff (a limit of the spill parcels; its size and
  brightness cut by polish 7 to 22 % of the visible steam at 0.48 s). The held dome's own stillness shows: 2.2–2.5
  levels a frame at 0.53–0.56 s. The laptop steam cost is 3.9–5.2 ms at the app's real framing (p10, `bench6.ts`) with
  no margin on the median at 0.45 s, where the judge saw p50 touch 6.0 ms in one run; two clouds (4.3–4.5 laptop,
  3.7–4.1 phone) and the resumed reveal (4.4–4.9 laptop, 4.1–4.2 phone) are within the 6 ms budget (polish 6's bench;
  polish 7 left the cloud byte-identical). No reflection of the steam in the
  silver (as v1.5). The next approach is in `docs/RESUME.md`.

## v1.5: the judging of the twelve edits (2026-10-02)

Three independent judges measured the integrated build (`v1.5/integration` at `aae7b65`–`b46ed48`, before the polish rounds), each rendering its own frames through the real controller rather than trusting the owners' evidence: **A**, motion and physics (frame strips at 62.5 fps with a per-frame scene-graph probe, pure functions sampled at 2 kHz); **B**, materials and look (close-ups through the production stage against product and food photographs, at the real on-screen sizes); **C**, the guest's experience (real-time Playwright sessions on 1280 × 720 @2× and 390 × 844 @3× with touch, every flow of every scene, frame pacing, memory, downloads, reduced motion, hidden tab and off-screen). Their scores against "perfection" and the findings that drove the polish round:

| # | Edit | A | B | C | What the judges found → what the polish round did |
| --- | --- | --- | --- | --- | --- |
| 1 | Record keeps spinning | 8 | – | 8.5 | 33⅓ rpm exact, no step at the hand-over, replays identical; but the stylus landed on a platter at 5 % of speed and the arm swung at 300°/s, with a one-frame pitch pop and an overshoot on rapid reversals → the deck order (motor first, cue at speed), a hand's pace, one arm planner for every change of mind |
| 2 | Disc placement | 8.5 | – | 8.5 | One speed bell, zero-speed touch, no hop; the ≤ 2 px settle kept |
| 3 | Cake texture | – | 6 | 7 | Not plastic any more but "matte clay": the ±0.8 mm variation was sub-pixel at laptop size, the top's arcs read as cracks, pockets looked stamped, ropes faceted → variation that shows (±4 mm swags, ±2.5° columns), broad knife relief, sparse pockets, 16-sided ropes, satin crests |
| 4 | Flame → smoke | 6 | 6.5 | 7.5 | The hand-over broke (a red ghost, then a separate dark puff), six identical sinusoid plumes, smoke too dark and over by 2.9 s; the flames did not read lit at 192 px; **critical: a change of mind after the blow relit all six candles in one frame** → one white ribbon from the first frame, merging plumes, a 3–5.5 s smoulder, a screen-space glare floor, a scene-owned `interruptCut` carrying flame, smoke and lit time |
| 5 | Candles press in | 4 | – | 7 | The frosting resisted less than the air, a 0.6 g start jolt, 3.7 mm insertion and a 1 px collar → a hand-paced descent, 10 mm in with rising drag, a visible collar with contact shading, a 1.9 mm cake dip |
| 6 | Melt | 6.5 | 6.5 | 6 | Well paced but the drips read as smeared candle surface, the pool matte, the gloss under the flame invisible, and the melt popped back on a change of mind → glossy translucent rivulets and pools, a visible gloss, wax that sets after the blow, the lit time carried |
| 7 | Hoop proportions | – | 8 | 7.5 | Reads as a real portable mini system at every size; the stand lacked maps and the cream ball vanished against the stage → moulded-PP and powder-coat textures, a warm buff cream |
| 8 | Bounce | 7 | – | 6.5 | Restitution right, never sinks; but the ball spun up on the floor with no hand, the airball pogoed 21 times, tails ran 6.6–8 s, and **critical: a change of mind slid the ball in a straight line or teleported it** → spin arrives with the launch, a 1 cm rest threshold, FIBA 2026 restitution (e = 0.77), a scene-owned `interruptCut` that lets the ball carry on under gravity |
| 9 | Net | 5.5 | – | 8 | An elastic sock: opening equal to the ball, cords 9 %/N, 70 % grip, the bottom tangled → opening 1.13×, 1.4 %/N, 30 % grip, exit at 82 % of entry speed, cord separation constraints, a fixed 1/480 s clock (which also let the loop idle again) |
| 10 | Steam | 6 | – | 7.5 | Read as a grey stain under the dome and then a single incense strand, gone by 2 s → screen-blended (only lightens), three sheets over 70 % of the well breaking into filaments, a thin tail to 6.6 s, released steam dispersing on its own through a change of mind |
| 11 | Bin | – | 7 | 7 | Proportions and hardware as good as the masters; the body a dead-flat cylinder, the coral pedal the most saturated thing in the frame, rabbit-ear flap shadows on the cove, the object inside lit as if outside; the first decline uploaded 216k triangles mid-sequence → a traced floor bounce (a key-side band needs a light at the bin's height: open), a black polystyrene pedal, flaps at 90° with no shadow above the lid, the mouth's form factor inside, the warm frame uploading everything hidden at load |
| 12 | Reader status | – | 8.5 | 6.5 | "The best edit in my scope": crisp and backlit; the red core bloomed pink, the LED pill read as a second dash, specks along the glass edge, and the glyphs were undersized on a phone → the light added inside the glass shader before the tone curve, the pill hidden, the glass edge flattened, glyphs 1.5× larger with the minus spanning the check |

Cross-cutting, found by B and C: the canvas drew at 1.5 device pixels on phones (now 2, below); four scenes' posters were still v1.4's because owners captured stage-only (regenerated at integration; a browser test now diffs every poster against the live scene); reduced motion, hidden tabs and off-screen embeds all pause and resume cleanly; no console errors in any flow; 60 fps p50/p95 in every sequence at both sizes. Per-scene before polish (C): Party 8.5, Dinner 7.5, Sports 7, Business 7, Birthday 6.5. The judges' frames and data are not in the repository (session scratch); the owners' evidence is under each worktree's `evidence/v1.5/`.

## v1.5: Normal at 2 device pixels, the frame-square ease (2026-10-02)

The judges measured the integrated v1.5 build: the live canvas drew at 1.5 device pixels per CSS pixel on the 2× laptop and the 3× phone (Normal's Master §9 cap), so on the phone every edge, the stand's grooves, the flames and the prints were upscaled 2× next to crisp UI. Normal now renders at up to 2 (spec revision #40), within the 2.5-million-pixel drawing-buffer ceiling, which is kept. Before any tier drop Normal takes one cheaper step down to 1.5 (p95 over 20 ms in two consecutive 1 s windows, between sequences, never undone automatically).

Frame pacing, every sequence of every scene (the judges' own harness, `flows.mjs`: host ×2, the first accept and decline, decline after accept and back, both mid-sequence changes of mind, replay), M2 Pro, Chrome, other Chromes running. Worst p50 / worst p95 over the nine sequences, ms:

| Device | Party | Birthday | Sports | Dinner | Business |
| --- | --- | --- | --- | --- | --- |
| 390 × 844 @3× (buffer 780 × 1688, ratio 2) | 16.7 / 16.8 | 16.7 / 16.8 | 16.7 / 16.8 | 16.7 / 16.8 | 16.7 / 16.8 |
| 1280 × 720 @2× (buffer 2108 × 1185, ratio 1.65: the 2.5 MP ceiling) | 16.7 / 16.8 | 16.7 / 16.8 | 16.7 / 16.8 | 16.7 / 16.8 | 16.7 / 16.8 |

Every sequence holds 60 fps at the new ratio (p95 ≤ 16.8 ms), so nothing steps down on this machine. Single slow frames remained only in a scene's first decline: the bin's first appearance uploaded its 216k-triangle geometry and its textures inside one frame (33–100 ms; the judges' 1.5× runs had the same spikes elsewhere). The controller's warm frame at load now draws everything hidden once, behind the poster: profiled again at both sizes (four first declines each), no frame exceeds 30 ms and no frame spends more than 4.4 ms in script; time to ready is unchanged within noise (A/B, five loads each: Birthday median 984 vs 1014 ms, Dinner 821 vs 849 ms; the longest load task about 210 ms either way). The flows harness still records isolated 33–67 ms frames under the machine's background load (other Chromes running), at p95 ≤ 16.8 ms. The laptop's full 2× (3.7 MP at 1280 × 720) would need the ceiling raised, an owner's decision (memory: 4× MSAA at 3.7 MP is about 130 MiB of drawing buffer).

"Preview as guest" on the phone swapped the sheet's panel and the frame square jumped 1.56× in one frame; it now eases over 250 ms (237 → 369 px in 15 frames, `evidence/v1.5/framing/phone-preview-ease-every32ms.webp`).

## v1.3: the studio pass (2026-10-01)

The masters are now lit by a physically plausible studio, rig `neutral-room`: the Models viewer's room at full environment strength, one soft key, a greige cove. They are seen through an 18° perspective lens, with no CSS finish and none of the v1.2 grades (revisions #31–#36; `docs/style-reference.md` v1.3). The objects, beats and durations are those of v1.2. The budgets stay waived. The tables below supersede v1.2's sequence-length, cadence and GLB tables; v1.2's budget and cold-load figures still hold to within a few KiB (Runtime GLBs, below).

**Every run below was taken at HEAD `40f9e04`** (17:45–17:53 on 2026-10-01), the integration commit that made `neutral-room` the default: `pnpm capture timing`, `pnpm capture perf`, `pnpm capture stagecolor … neutral-room`, `pnpm models` for every scene, and the typecheck and unit tests. The browser suite passed at the same commit. The machine is the authoring Mac (M2 Pro), with Chrome 153. None of this is phone evidence.

### Checks

| Check | Result |
| --- | --- |
| Typecheck | Clean |
| Unit tests (Vitest) | 263 / 263 pass (20 files, at HEAD `40f9e04`; again on this docs pass). Added in v1.3 (from 232): `tests/rigs.test.ts` (the registry; each rig's declarations; the studio-pass rules for every rig but `v1.1`: environment and metal intensity 1 and a real-time shadow; each declared stage colour within 2 levels of its measurement, when the measurement file `outputs/rigs/<rig>/stagecolor.json` is in the checkout; the CSS token equal to the production rig's colour; no `.lt-stage::before` or `::after`; `metalEnvIntensity` reaching the metals on every tier), `tests/stage-framing.test.ts` (the perspective fit for all five scenes), GLB checks that every removed grade is gone, and the Party label's asymmetry on the exported prints |
| Browser tests (Playwright, system Chrome) | 71 / 71 pass (`pnpm test:browser`, at HEAD `40f9e04`). The integration run kept no log; the adversarial review re-ran it against `:5199` (71 / 71, 4.7 min), and the fix pass again at 18:42 with the output saved (`final-measurements-v1.3/browser.txt` in the session scratchpad: 71 passed, 4.8 min; working tree = `40f9e04` plus docs and two code comments) |
| Deterministic exports | Every GLB is byte-identical to the committed file. The integration run's status file (`determinism.txt`) is empty, which alone does not show the export ran; so the fix pass re-ran `pnpm models` (all scenes) at 18:40 in a clean `git archive 40f9e04` copy, leaving the live dev server's `assets/` untouched, and compared SHA-256: all six exported GLBs (five scenes and the disposal bin) equal `40f9e04`'s and the working tree's, and `git status -- assets` is empty (`final-measurements-v1.3/determinism-recheck.txt`) |
| Stage colour | `neutral-room` measures `#D5D2CD`, the value of `--lt-stage` and of the rig's `stageColor` (Stage colour, below) |
| Production build | Not re-run for v1.3. All five rigs are registered eagerly, so the comparison rigs ship in the runtime JavaScript even though only a local host can select them (about 52 KB of source together, before minification and gzip); the effect on the first-route size is unmeasured |

### Real-time sequence lengths (`pnpm capture timing`, live showcase, HEAD `40f9e04`)

| Scene | Host | Accept | Decline | Authored |
| --- | --- | --- | --- | --- |
| Business | 1.210 s | 1.510 | 1.512 | 1.2 / 1.5 / 1.5 |
| Party | 1.209 | 1.612 | 1.412 | 1.2 / 1.6 / 1.4 |
| Birthday | 1.314 | 1.413 | 1.513 | 1.3 / 1.4 / 1.5 |
| Sports | 1.212 | 1.713 | 1.613 | 1.2 / 1.7 / 1.6 |
| Dinner | 1.212 | 1.512 | 1.512 | 1.2 / 1.5 / 1.5 |

The durations are unchanged. As in v1.2, each run is 9–14 ms over the authored length: one animation frame to detect the end.

### Frame cadence (desktop only, `pnpm capture perf`, HEAD `40f9e04`)

Ten alternating accept/decline cycles after a warm-up, 390×844 @3×, Normal tier, visible page, frames sampled only while a sequence plays. GPU objects are three.js's `renderer.info` counts at the end of the run; the v1.2 counts are given for comparison.

| Scene | Frames | p50 | p95 | p99 | Max | >50 ms | 4× CPU throttle (simulation): p95 / max / >50 ms | GPU geometries / textures / programs | v1.2 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Business | 909 | 16.7 ms | 16.7 | 16.8 | 16.8 | 0 | 16.7 / 16.8 / 0 | 28 / 16 / 11 | 28 / 19 / 12 |
| Party | 1,000 | 16.7 | 16.7 | 16.8 | 16.8 | 0 | 16.8 / 16.8 / 0 | 33 / 12 / 9 | 33 / 15 / 10 |
| Birthday | 926 | 16.7 | 16.7 | 16.8 | 16.8 | 0 | 16.8 / 16.8 / 0 | 30 / 9 / 11 | 30 / 12 / 12 |
| Sports | 1,089 | 16.7 | 16.7 | 16.8 | 16.8 | 0 | 16.8 / 16.8 / 0 | 15 / 21 / 12 | 15 / 24 / 13 |
| Dinner | 907 | 16.7 | 16.7 | 16.8 | 16.8 | 0 | 16.7 / 16.8 / 0 | 17 / 7 / 8 | 17 / 9 / 8 |

The Master §9 targets (p95 ≤ 20 ms, p99 ≤ 34 ms, no stall over 50 ms) are met on this desktop. Every scene holds three textures fewer than in v1.2: the v1.1 studio's gobo cookie and plaster normal and albedo are gone, and `neutral-room` adds none besides its environment, which is the same size as v1.1's (a 768 × 1024 half-float PMREM, about 6 MiB). Dinner holds one more than that implies, because the dome's own 1024² roughness map now stays (`finishDish` had freed it): about 5.3 MiB as RGBA8 + mips. These are counts and calculations, not driver readings; the counting harness was not re-run.

### Runtime GLBs (`pnpm models <scene>` export reports at HEAD `40f9e04`; sizes from the committed files)

| Scene | GLB raw | Gzip −9 | Report gzip | Triangles (visible pass) | Draw calls (+ shadow proxies) | Textures (as RGBA8 + mips) | Change from v1.2 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Business | 2062.5 KiB | 1272.0 KiB | 1376.5 | 76,236 | 21 | 12 (57.4 MiB) | The chrome's policy is the master's (40 bytes larger) |
| Party | 2334.6 | 1032.4 | 1159.4 | 97,948 | 28 (+ 1, 368 tris) | 7 (27.0 MiB) | 20.7 KiB smaller: no `PLINTH_TONE`, no `tt_spindle`, and the coral and cobalt prints are the master's art without the wedge (16 KiB each, were 26 and 27) |
| Birthday | 4343.0 | 2201.9 | 2427.5 | 219,780 | 23 (+ 8, 3,340 tris) | 2 LUTs (0.0 MiB) | The vanilla palette is the ivory rebuild's again, at the master's roughness (4 bytes smaller) |
| Sports | 8071.5 | 5915.7 | 6159.4 | 259,206 | 11 (+ 1, 2,436 tris) | 16 (62.6 MiB) | None: `LEATHER_GRADE` was applied at load |
| Dinner | 3412.5 | 1753.5 | 1963.0 | 146,944 | 6 (+ 2, 5,277 tris) | 1 (5.3 MiB; now kept at load) | The trim's roughness is the master's (4 bytes larger) |
| shared/disposal-bin.glb | 155.7 | 63.8 | — | ≈ 8.4k while on stage | 5 | 0 | None |

Posters (720², q0.86) and collection thumbnails (192²) were regenerated under `neutral-room` at `40f9e04`. The flatter greige backdrop compresses better: Business 16.2–19.6 KB, Party 15.3–16.7 KB (shared declined 7.7), Birthday 21.1–22.5 KB (shared declined 11.6), Sports 17.7–18.8 KB, Dinner 8.2–11.5 KB; thumbnails 2.2–3.6 KB, 16.0 KB together. The cold first-scene figures in v1.2's budget table are therefore upper bounds (Party's GLB is 21 KiB smaller gzipped, every poster smaller); `pnpm capture network` was not re-run.

### Stage colour (`pnpm capture stagecolor http://127.0.0.1:5199 neutral-room`, HEAD `40f9e04`)

The mean sRGB of the central 20 % of the empty stage (content hidden for that frame), per scene and averaged:

| Business | Party | Birthday | Sports | Dinner | Mean (the token) |
| --- | --- | --- | --- | --- | --- |
| `#D8D5D0` | `#D1CEC8` | `#D5D2CD` | `#D7D4CF` | `#D4D0CB` | **`#D5D2CD`** |

`--lt-stage` (`src/ui/shell.css`) and `neutral-room`'s `stageColor` are both `#D5D2CD`, and `tests/rigs.test.ts` holds them equal. The scenes differ by up to 8 levels per channel (blue, party against business; red and green by 7), because the cove's gradient depends on each scene's framing and wall. On the interface: ink `#202320` on the stage is 10.5:1, secondary text `#585C57` 4.52:1, and the page `#FBFAF7` against the stage 1.44:1 (calculated, WCAG).

The other rigs' measured colours, from their own runs: `product-studio` `#ECE9E4`, `daylight-table` `#E0D4C3` (spread `#D8D0C4`–`#E4D1B8`), `livetime-warm` `#F6DDC3`. `v1.1` keeps the v1.2 token `#F8E4C8` as its declaration (what its posters were made with) and measures `#F6E0C5` through the perspective lens, the palm shadow dappling the centre slightly below it (`src/render/rigs/README.md`).

### Independent judging of the rigs (three judges, 2026-10-01, 16:37–17:24)

Three fresh judges scored each rig on all five scenes' stills against the master renders (`master-renders/<master>/B-hero.png`, `B-close.png`): realism (35), materials reading as their materials (25), the beats still reading in the accepted stills (15), fit with the interface around the stage (15) and artifacts (10), out of 100. The scores below are transcribed from the three judges' reports to the orchestrating session; no score file was saved with the measurements, so they cannot be re-checked against one.

| Rig | Mean | Judge 1 | Judge 2 | Judge 3 |
| --- | --- | --- | --- | --- |
| `neutral-room` | **81.7** | 82, 1st (realism 29, materials 21, beats 13, interface 11, artifacts 8) | 81, 1st (29, 21, 13, 10, 8) | 82, 1st (29, 21, 13, 11, 8) |
| `product-studio` | 76.7 | 2nd | 2nd | 2nd |
| `daylight-table` | 69.3 | 3rd | 4th | 3rd |
| `livetime-warm` | 69.0 | 4th | 3rd | 4th |

The per-judge totals of the three runners-up were not kept in the run's record; their means and every judge's ranking were. All three judges answered the brief's question on the removed grades the same way: none should return under `neutral-room` (`docs/style-reference.md` v1.3, Grades removed). Their proposed grafts from the runners-up are open (Known limitations, below). As at checkpoints 4 and 5 and in v1.2, the verdict is **pending Surya's confirmation**: the brief left the warm and neutral directions open to the owner, and every rig stays comparable under `?rig=` on a local host.

### Known limitations (v1.3)

From `docs/rigs/neutral-room.md` and the three judges' notes on the winner. None of the judges' grafts had been applied when this was recorded.

- **Interface fit (the lowest sub-score, 10–11 of 15).** The greige square reads slightly cold beside the warm-white page and olive ink. The judges proposed lifting and warming the cove towards `#D9D5CE`–`#E6E3DE`, or a faint 2700–3000 K floor bounce kept out of the environment's upper hemisphere. Any change must keep the vanilla cake and the cream ball at least 10 % in luminance from the cove, then be re-measured, with the token, posters and thumbnails following.
- **Metal contrast.** All three proposed one soft dark gradient card in the environment, low and camera-right (not a visible flag), for a deeper reflected band on the cloche, the tonearm and the reader's bezel. The reader's lower front and bezel read near-white. The rig's designer traced that to the master's material under the window, not to the key; the judges would trim the lamp or skylight there, not regrade the material.
- **Party lid interior** renders near-black (p1 21), and the plinth reads flatter and more matte than in the master render. The kept interior split is justified, but the judges would lift its baked occlusion or add a warm bounce so it holds dark-grey form.
- **Shadow artefacts.** A speckled PCF fringe in the net's shadow and at the hoop's base, and a large curved dark shadow across the top right of the cove in Business and Sports, which the adversarial reviewer attributes to geometry outside the frame (the lanyard above it; the backboard). It is the most noticeable artefact left.
- **Stage spread.** One token against per-scene backdrops that span `#D1CEC8`–`#D8D5D0`, and the token is the centre only: the posters' corners measure `#AFACA9`–`#C6C2BC`, so wherever the flat token shows alone (fallback sentence, stage before the poster, thumbnail fill) the square is lighter at its edges than the rendered image.
- **Party accept spin.** The master's own label carries the spin through its off-centre square; a unit test holds the asymmetry, and the judges could not judge motion from stills. No reviewer has yet watched the spin on the master's print.
- **Not re-derived.** Party's 0.65 rad presentation tilt, Birthday's in-bin shade and the Business holder's 14 % dimming were tuned under the v1.1 key; none was flagged.
- **Load cost.** `neutral-room` evaluates its room on the CPU when the stage is created (1024 × 512 = 524,288 texels) and uploads an 8 MiB float texture once for prefiltering. That cost was not measured, and not on a phone.
- **Not re-measured for v1.3:** the production build's JavaScript size (the comparison rigs are bundled), live render-cost peaks, counted GPU memory, throttled cold load and the iPhone 17 Max session. **Adversarial review and fix pass (2026-10-01, ≈18:30–18:50):** the reviewer captured `neutral-room` fresh beside every `master-renders/*/B-hero.png` and found the five scenes no longer cartoonish (metals reflect a room, steel neutral, no peach, vignette, grain or wedge, the dome the master's polished silver); verdict pass with fixes. The fixes were documentation only (stale finish and colour claims in `DESIGN.md`, `PRODUCT.md`, `.impeccable/design.json`, revision #36 and `docs/RESUME.md`; the stage-spread figure; provenance for the browser, determinism and judging rows above); the look did not change, so no scene was re-captured.

## v1.2: the scan-to-CAD masters (2026-10-01)

*Superseded in part by v1.3 (above): its sequence-length, cadence and GLB tables replace the ones below, and the look items marked v1.3 in Known limitations are resolved.* The five scenes now run on the scan-to-CAD masters (revision #20). **Budgets are waived for this pass** (owner's brief, `docs/new-models-brief.md`, revision #21). The figures below are what ships; they are not a pass/fail against the budgets. Where they exceed a cap, the cap is shown next to them. They supersede the checkpoint 4 render-cost, cadence, transfer, cold-load and GPU-memory tables further down, which describe the v1.1 code-authored objects.

**Every run below was taken at HEAD `a613138`** (06:26–06:38 on 2026-10-01), after the Birthday, Party and Dinner v1.2.1 and Business v1.2.2 polish (`a6a1ce2`, `9329416`, `201a201`, `7c951e7`, merged by `b225f95`) and the Sports v1.2.1 amplitude pass (`a613138`): `pnpm models` for all scenes (every GLB byte-identical to the committed file), `pnpm capture timing`, `pnpm capture perf`, the full browser suite and the typecheck and unit tests (232 / 232). Earlier runs during the pass (05:15–05:42, on `6a62beb` and `756a635`, before the polish) gave the same cadence and the same 71 / 71 and differed from these only by a few milliseconds in the sequence lengths; they are superseded. The machine is the authoring Mac (M2 Pro), with the browser tests run in Chrome 153. None of this is phone evidence. Per-scene detail, including every decision and the measured contract numbers, is in `docs/scenes/<scene>-v1.2.md`.

### Checks

| Check | Result |
| --- | --- |
| Typecheck | Clean |
| Unit tests (Vitest) | 232 / 232 pass (18 files, at HEAD `a613138`). Added in v1.2: contract numbers re-measured on each exported GLB, clearances against the shipped geometry (plate profile, reader height field, lid sweep, net envelope), C1 continuity, the change-of-mind paths (Dinner rewind, Business recovery), variants and the importer (`tests/masters.test.ts`) |
| Browser tests (Playwright, system Chrome) | 71 / 71 pass (`pnpm test:browser`, 4.2 min, at HEAD `a613138`). New in v1.2: Birthday frosting variants and Low tier round trips with no texture leaks; the Business lit status by shape and its washout check; Sports Low tier on the imported masters, including a dispose at Low that frees every texture; and Dinner with no preset control and an inert `dish`. An earlier full run in this pass failed two focus-timing tests in `a11y.spec.ts` (lines 50 and 100) while other agents were rendering on the same machine. The rerun passed 71 / 71 |
| Deterministic exports | Each scene exported twice to the same hash (scene docs). Re-running `pnpm models party`, `business` and `birthday` for this record left the tree clean |
| Production build | `vite build` succeeds. Runtime JavaScript for all five scenes together is 261.6 KiB gzip −9 (every chunk except the lookdev, study and gallery pages), so a first route fetches less |

### Real-time sequence lengths (`pnpm capture timing`, live showcase, HEAD `a613138`)

| Scene | Host | Accept | Decline | Authored |
| --- | --- | --- | --- | --- |
| Business | 1.212 s | 1.512 | 1.509 | 1.2 / 1.5 / 1.5 |
| Party | 1.211 | 1.610 | 1.410 | 1.2 / 1.6 / 1.4 |
| Birthday | 1.313 | 1.411 | 1.510 | 1.3 / 1.4 / 1.5 |
| Sports | 1.214 | 1.714 | 1.610 | 1.2 / 1.7 / 1.6 |
| Dinner | 1.210 | 1.514 | 1.514 | 1.2 / 1.5 / 1.5 |

The durations are unchanged from v1.1. Each run is about 10–15 ms over the authored length: one animation frame to detect the end.

### Frame cadence (desktop only, `pnpm capture perf`, HEAD `a613138`)

Ten alternating accept/decline cycles after a warm-up, 390×844 @3×, Normal tier, visible page. Frames are sampled only while a sequence plays. GPU objects are three.js's `renderer.info` counts at the end of the run.

| Scene | Frames | p50 | p95 | p99 | Max | >50 ms | 4× CPU throttle (simulation): p95 / max / >50 ms | GPU geometries / textures / programs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Business | 908 | 16.7 ms | 16.8 | 16.8 | 16.8 | 0 | 16.7 / 16.8 / 0 | 28 / 19 / 12 |
| Party | 998 | 16.7 | 16.8 | 16.8 | 16.8 | 0 | 16.8 / 16.8 / 0 | 33 / 15 / 10 |
| Birthday | 923 | 16.7 | 16.7 | 16.8 | 16.8 | 0 | 16.7 / 16.8 / 0 | 30 / 12 / 12 |
| Sports | 1,093 | 16.7 | 16.8 | 16.8 | 16.8 | 0 | 16.8 / 16.8 / 0 | 15 / 24 / 13 |
| Dinner | 906 | 16.7 | 16.7 | 16.8 | 16.8 | 0 | 16.7 / 16.8 / 0 | 17 / 9 / 8 |

The Master §9 targets (p95 ≤ 20 ms, p99 ≤ 34 ms, no stall over 50 ms) are met on this desktop with the masters. The M2 Pro is locked to 60 Hz and is far faster than the reference phones, and CPU throttling does not stress the GPU. The heavier geometry and textures make the phone session more important than it was for v1.1.

### Runtime GLBs (`pnpm models <scene>` export reports at HEAD `a613138`; sizes from the committed files, which the re-export reproduced byte for byte)

| Scene | GLB raw | Gzip −9 | Report gzip | Triangles (visible pass) | Draw calls (+ shadow proxies) | Textures (as RGBA8 + mips) | Nodes / primitives | v1.1 GLB raw / gz |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Business | 2062.5 KiB | 1272.0 KiB | 1376.5 | 76,236 (the rig adds a few hundred) | 21 (+ 3 runtime: strap, tab, status tile) | 12 (57.4 MiB) | 43 / 20 | 720.8 / 251.5 KiB |
| Party | 2355.3 | 1053.6 | 1180.4 | 97,948 | 28 (+ 1, 368 tris) | 7 (27.0 MiB) | 60 / 29 | 608.3 / 234.7 |
| Birthday | 4343.0 | 2201.9 | 2427.5 | 219,780 | 23 (+ 8, 3,340 tris) | 2 LUTs (0.0 MiB) | 55 / 21 | 561.7 / 270.8 |
| Sports | 8071.5 | 5915.7 | 6159.4 | 259,206 | 11 (+ 1, 2,436 tris) | 16 (62.6 MiB) | 22 / 12 | 516.3 / 203.0 |
| Dinner | 3412.5 | 1753.5 | 1963.0 | 146,944 | 6 (+ 2, 5,277 tris) | 1 (5.3 MiB; freed at load) | 19 / 8 | 841.3 / 405.4 |
| shared/disposal-bin.glb (unchanged) | 155.7 | 63.8 | — | ≈8.4k while on stage | 5 | 0 | 10 / 5 | same |

"Report gzip" is the export report's figure: Node's zlib at level 9. The "Gzip −9" column, which the asset manifest uses, is macOS `gzip -9c`; the two compressors differ by a few percent at the same level (Sports 6159.4 vs 5915.7 KiB).

### Budgets: waived, with the actual figures against the old caps

| Cap (Master §9) | Business | Party | Birthday | Sports | Dinner |
| --- | --- | --- | --- | --- | --- |
| ≤ 60k visible triangles | 76k (over) | 98k (over) | 220k (over; + bin 8.4k in the decline) | 259k (over) | 147k (over; + bin) |
| ≤ 40 draw calls | 24 | 28 | 23 (+ bin 5) | 11 | 6 (+ bin 5) |
| ≤ 48 MiB texture allocation (estimate) | ≈ 87 MiB (over) | ≈ 57 MiB (over) | ≈ 30 MiB | ≈ 93 MiB (over) | ≈ 30 MiB |
| ≤ 2.5 MiB cold first scene, gzip-serving host | 1.52 MiB | 1.30 MiB | 2.49 MiB (with the bin) | 6.05 MiB (over) | 2.04 MiB (with the bin) |
| Same, host serving `.glb` uncompressed | 2.29 MiB | 2.57 MiB (over) | 4.67 MiB (over) | 8.16 MiB (over) | 3.75 MiB (over) |

- **Triangles and draw calls** are the GLB's visible pass. Masters that cast their own shadows add their triangles again in the shadow pass. The checkpoint 4 live-peak harness (main + shadow, every frame) was **not re-run** for v1.2, so the live per-frame peaks are unmeasured.
- **Texture allocation** is an estimate: the checkpoint 4 phone figure for a scene with few textures of its own (≈ 30 MiB: drawing buffer, environment, shadow map, gobo, plaster, contact shadows) plus the GLB's textures as RGBA8 with mips, both presets resident. It is not a counted allocation; the checkpoint 4 counting harness was not re-run. Dinner frees its one texture at load, and Birthday's are two 256×4 LUTs. Low frees the shadow map and drops normal and sheen maps from the imported materials, which lowers these figures but was not counted either.
- **Cold first scene** is recomputed from the file sizes. It adds the runtime JavaScript (≤ 261.6 KiB gz, every scene's chunks, so an upper bound), the scene GLB, the bin for Birthday and Dinner, and the largest poster of the scene (14.9–25.9 KiB). `pnpm capture network` was not re-run. At the Master's 4 Mbps test link, the whole cold first scene above (JavaScript, GLB, bin and poster) takes about 3.2 s (Business), 2.7 s (Party), 5.2 s (Birthday), 4.3 s (Dinner) and 12.7 s (Sports) with the GLBs gzipped. With the GLBs uncompressed, as `vite preview` serves them, it takes about 4.8, 5.4, 9.8, 7.9 and 17.1 s. Render-ready within 6 s is therefore unlikely for Sports in either case, and for Birthday and Dinner uncompressed. The controls stay usable before the GLB arrives (checkpoint 4: 0.91–1.01 s), because the DOM does not wait for it.

### Independent judging (three judges, then a polish pass per scene)

Three fresh judges scored each scene against its masters and the v1.1 captures (stills, contact sheets, frame-difference series of every clip). The scores are means of the three, out of 10.

| Scene | Look | Concept | Smooth | Physics | Presets | Polish | Must-fix (all judges) | Polish pass |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Sports | 8 | 9 | 8.8 | 8.5 | 8 | 8 | 0 | v1.2.1 `a613138`: recoil and squash raised to read at stage size (no must-fix) |
| Party | 8 | 9 | 8 | 8 | 8.5 | 6.7 | 2 (lid flash and pale interior mid-close) | v1.2.1 `9329416`: fixed |
| Birthday | 7.7 | 8.8 | 8 | 7.5 | 8.7 | 7.2 | 2 (flat vanilla; accept barely registers) | v1.2.1 `a6a1ce2`: fixed |
| Dinner | 8 | 8.3 | 7.8 | 7.8 | 10 | 6.8 | 3 (stale food posters, twice; change-of-mind pop) | v1.2.1 `201a201`: fixed |
| Business | 9 | 8.2 | 7.5 | 8.2 | 9 | 8.2 | 3 (change-of-mind cut, twice; host stop–hop–stop) | v1.2.2 `7c951e7`: fixed (the judges scored v1.2.1 `6a7f2a1`) |

Overall, the judges found that all five scenes use the masters and keep v1.1's beats, durations and framing. Sports was ranked strongest, with Business close behind. The polish agents verified each fix on rendered frames, with frame-difference numbers in the scene docs. The judges were not re-run on the polished scenes. As with checkpoints 4 and 5, their verdicts are **pending Surya's confirmation**. Several named physics upgrades were correct but hard to see at stage size: the rim and board recoil, the squash, the cake lean, the cloche rim rock and the tonearm cue. Party's settle and Birthday's flames and breath were enlarged in v1.2.1, and the Sports recoil and squash in Sports v1.2.1 (`a613138`: rim 1.2° → 2.5°, board 0.3° → 0.6°, squash ≤ 8 % → ≤ 10 %).

### Known limitations (from the scene docs' known gaps)

- **Shared director.** Party's interruption blend still slerps linearly, so an accept → decline change mid-spin can turn the record back by up to π and whip the arm to its rest. Sports' change clip blends at a constant rate. Business uses the director's 0 ms cut as a hand-over for its own recovery (#25). A first-class scene path in `src/core/visualDirector.ts` would make this explicit. Dinner's rewind keeps a little state between the cut and the new playback (#24).
- **Shadow-depth texture leak (shared).** three.js's shadow depth material keeps the last caster's `map`. Birthday avoids leaking a disposed texture per visit by casting through proxies with no map. A scene whose shadow-casting master mesh has a map could leak the same way; the general fix belongs in the stage.
- **Load-time finishes outside the GLB.** The Sports leather grade, Dinner's dome anisotropy and roughness (its unused 1024² roughness map still travels, 6 KiB), Party's lid extension and split, and the Birthday bin shade are applied at load. *(v1.3: the leather grade and the dome finish are removed, and the dome's map is used again; the lid extension and split and the bin shade remain.)* The recipe API has no pixel function for a default material, no anisotropy policy and no way to drop a texture slot.
- **Small at stage size.** The Business hook threading (a 2.7 mm gap), Birthday's thin candles (r 0.0205) and the 1.8° carry lean, the Party tonearm cue and settle, the Sports recoil and squash (raised in `a613138` to 2.5° / 0.6° and ≤ 10 %; the rim's front edge now dips 6–7 px in the 540 px captures), and the Dinner rim rock (≤ 1°) are all correct but small at stage size.
- **Look.**
  - The Sports board carries more visual weight than v1.1's, fixed by the 1.6× rim rule. The cream ball has no coral equator.
  - The Party closed lid reads as a second box. The label wedge is a v1.1 graphic over the master print *(removed in v1.3: the label is the master's print, recoloured)*.
  - The Birthday flames are the stylised v1.1 shader. The cake is small in the 192 px thumbnail.
  - Dinner's empty well is a near-flat white disc. The studio environment has no dark horizon for the polished dome *(resolved in v1.3: `neutral-room`'s room gives the master's dome window, horizon and dark-furniture reflections)*.
  - The Business strap has no twist. The LED bar is under the pressed card, and the tile carries the outcome. The dark card's lower edge relies on the holder's rim.
- **Small geometric allowances (tested, invisible).** The Sports board recoil (0.6° since `a613138`) can overlap the stand's back plate by up to 1.6 mm, hidden from the camera. Dinner's rim rock can dip up to 1 mm on the coupe slope. The Business clearance tests allow 0.3 mm at the hook wire and 0.7 mm where the clips press the glass.
- **Lookdev.** The lookdev identity tiles still build the v1.1 cake and the code-authored keycard rig: the master GLBs load asynchronously.
- **Not re-measured for v1.2:** live render-cost peaks, counted GPU memory, cold load on the throttled network, framing percentages beyond the unit tests (Party 74.6 %; Business card 38 % of the frame height), and the iPhone 17 Max session. The phone session now has to cover much heavier scenes.

### Dinner first re-measure (v1.2, before the v1.2.1 polish; superseded by the tables above)

*Historical: this was Dinner's first v1.2 record, before the v1.2.1 polish (`201a201`). The v1.2 tables above replace it; the 158 / 158 unit count is from that worktree, not today's suite.* **Budgets are waived for this pass** (owner's brief, `docs/new-models-brief.md`). Desktop only; none of this is phone evidence.

| Measure | Dinner v1.2 | v1.1 (checkpoint 4, for reference) |
| --- | --- | --- |
| Runtime GLB (`pnpm models dinner`, deterministic: two exports byte-identical) | `dinner.glb` 3412.5 KiB raw / 1753.5 KiB gz (gzip −9) | 841.3 KiB / 405.4 KiB |
| Triangles (dish GLB, visible pass) | 146,944 (+ 5,277 in 2 shadow proxies, shadow pass only) | 27.3k guest-ready (lookdev, incl. shadow pass) |
| Draw calls (dish GLB) | 6 (plate body, gilt band, dome, handle, joined bead/bands, finial) + 2 shadow proxies; the shared bin adds its own as in v1.1 | 20 |
| Textures (dish GLB) | 1: the dome's 1024² roughness map (6 KiB WebP, 5.3 MiB as RGBA8 + mips if kept), freed at load by `finishDish` | — |
| Frame cadence (`pnpm capture perf dinner`, M2 Pro, Chrome 153, 390×844 @3×, Normal tier, 908 frames) | p50 16.7 · p95 16.7 · p99 16.8 · max 16.8 ms · 0 over 50 ms (4× CPU simulation: p50 16.7 · p99 16.8 · max 16.8 · 0 over 50 ms, 906 frames) | p50 16.7 · p99 16.8 (905 frames) |
| Unit tests / Dinner browser spec | `pnpm test` 158 / 158 (18 files) · `tests/browser/dinner.spec.ts` 5 / 5 and `gallery.spec.ts` 4 / 4 against the worktree's dev server | — |
| Sequence lengths | unchanged: host 1.2 s, accept 1.5 s, decline 1.5 s | same |

Captured with `pnpm capture dinner` (one shared poster set, `assets/scenes/dinner/posters/shared-*.webp`, 13.6–15.3 KB). Details: `docs/scenes/dinner-v1.2.md`.

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

*Superseded for v1.2 by the v1.2 section above: these figures describe the v1.1 code-authored objects.*

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

*Superseded for v1.2 by the v1.2 section above: these figures describe the v1.1 code-authored objects.*

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

*Superseded for v1.2 by the v1.2 section above: these figures describe the v1.1 code-authored objects.*

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

*v1.2: the camera and layouts are unchanged; Party measures 74.6 % on the master (unit test band 60–75 %), Sports is locked to 60–75 % by its unit test, and Business was re-fitted (card 38 % of the frame height). The other rows below were not re-measured.*

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

*Superseded for v1.2 by the v1.2 section above: these figures describe the v1.1 code-authored objects.*

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

*v1.2 (2026-10-01): the plate colour and the food question are settled by the masters and the no-food decision (#22); the Business scan pose (#18) is superseded by #26; the Business draw-call headroom note applies to the v1.1 objects. The rest stands, and the phone session now has to cover the heavier v1.2 scenes.*

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
