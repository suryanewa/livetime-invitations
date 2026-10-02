# Dinner v1.5: steam under the cloche

Surya, 2026-10-02 (edit #10 of the perfection pass, `docs/perfection-pass-brief.md`): *"Steam under the cloche
after unveiling it."* Plan: `src/scenes/dinner/steam.ts`; render: `models/dinnerSteam.ts`; scene clock:
`src/scenes/dinner/index.ts`; tests: `tests/dinner-steam.test.ts`, `tests/browser/dinner.spec.ts`.

## What the reveal looks like, measured first

The accept is unchanged (handle-led tilt, rim rock; v1.2). In scene units (1 su = 16.9 cm): the guest-side rim, the
one that rises first, faces 31.6° off the camera in plan (front right). Its gap opens from 0.004 su at 0.02 s to
0.12 su (2 cm) at the tilt's peak (0.18 s) while the far rim stays on the plate until ≈ 0.12 s. The cover lifts off
between 0.22 and 0.34 s, rising at up to 3.2 su/s (54 cm/s). It levels at the top (rim 0.59 su) by 0.50 s while it is
carried back-left at up to 6.3 su/s (≈ 1 m/s), lands at 0.80 s and is flat by 0.86 s.

**The dome's inside is never on screen.** The camera (15° elevation) stays above the rim plane at every frame of the
reveal (the tilt never exceeds 4.5°), so a straight line from the camera can reach the inside only through the open
bottom, which faces away from it. A condensation fog on the inner surface would never be seen, so none is built.
Droplets at the rim bead would be 2–3 mm, which is 2–3 px at poster size and 4–6 px on a phone at 3× DPR. They would
read as specks of noise, not water, so none are built either. What the camera does see is the plate under the dome
through the opening gap (in the dome's shadow), the dome's outer silver, and the greige cove behind.

## Research: what steam does when a cloche comes off a hot plate

- **What is visible.** The visible part is droplets that condense where warm, saturated air meets the cooler room,
  and that evaporate again as the cloud mixes in. So steam appears a short way off its source and is gone within a
  second or two, about 10–25 cm up ([UK SciWorks, *Why does it happen?*](https://www.pa.uky.edu/sciworks/THE/heat/fog.htm)).
  In the model: no density at the surface (the column forms ≈ 1.3 cm off the porcelain), condensation that forms
  within 0.06 s, densest at release and only thinning from then on, and evaporation with age and height.
- **How it reads under light.** Steam is a transparent scatterer. Front light goes through it, and it pops only
  under a 3/4 backlight ([Pixel Valley Studio, *Capturing steam on video*](https://pixelvalleystudio.com/pmf-articles/capturing-steam-on-video-other-lighting-tips)),
  best against a dark ground.
  The neutral-room key is the window in front-left, so here the steam must be subtle: legible over the dark strokes
  in the silver (and over the bin, on a change of mind), close to invisible over the greige cove and the porcelain.
  Motion and soft edges carry it.
- **How a released warm pocket moves.** A released buoyant bubble rolls up into a vortex-ring cap and decelerates as
  it entrains room air (≈ t^−½). Above a warm surface the plume rises at a few cm/s to ≈ 10 cm/s. Sources:
  [starting plume following a thermal](https://www.sciencedirect.com/science/article/abs/pii/S1290072923003034),
  [head bubble of a starting plume](https://www.osti.gov/pages/servlets/purl/2422493), and PIV of natural convection
  ([DTU](https://orbit.dtu.dk/en/publications/temperature-and-velocity-fields-in-natural-convection-by-piv-and-/)).
  The air under a cloche on a hot dish is ≈ 40–50 K warmer than the room and the dome itself is hot, so it rises
  more briskly than those gentle plumes. In the model: puffs that accelerate buoyantly and slow as they mix
  (≤ 30 cm/s), and a column at 17–21 cm/s that flaps and curls as it rises.
- **The tilt.** A tipped dome is a doorway at its raised rim. The warm layer flows out at the top of the gap while
  room air runs in along the plate (exchange flow, u ≈ 0.5 √(g′h), 5–7 cm/s for a 1–2 cm gap at ≈ 45 K). The
  outflow is caught at once by the warm boundary layer rising up the hot dome's outer wall: a thin sheet climbing
  the raised side.
- **Steam off a plate**, from the above: thin, wavering wisps, laminar at the base and curling higher, a column
  that leans with any draught, gone within ≈ 15–25 cm.

## What was built

A deterministic plan in steam time τ (seconds since the reveal began, the accept's own clock, one fixed seed). Every
element is a closed-form function of its age; nothing integrates. Two instanced draws evaluate it on the GPU, and
the CPU sets a handful of uniforms per frame.

| Element | Count | Born (τ) | Where | Motion | Life |
| --- | --- | --- | --- | --- | --- |
| Spill | 22 puffs | 0.10–0.30 s, weighted to the widening gap | round the raised rim (all within 70° of it, mean within 30°), 6–8 mm off the bead | up the raised side's outer wall at 15–24 cm/s (the exchange outflow caught by the hot wall's boundary layer, drawn up by the lifting dome): a thin filament sheet, drawn out 1.7–2.1× along the rise | 0.35–0.5 s |
| Release | 10 | 0.21–0.35 s | under the lifting dome, at least 1.3 cm above the plate and below the rim | lifts off with the dome (30–50 % of its rise) and on, buoyant | 0.4–0.6 s |
| Pocket | 14 | released 0.30–0.50 s, shown 0.40–0.67 s (once the dome is clear of it) | inside the dome as it is carried off (weighted to its crown, where the warm air sat), lobes 1.4–4 cm | drawn after the dome by its wake while it clears, then 12–25 % of its velocity and a fast buoyant rise, fraying | 0.45–0.7 s |
| Trail | 8 | 0.39–0.58 s | shed off the trailing (guest-side) rim of the travelling dome, beyond the rim by more than its own size | left behind (8–20 % of the dome's velocity), rising; thinning | 0.3–0.45 s |
| Landing | 7 | 0.79–0.86 s, as the trailing side comes down | the landed dome's trailing rim, either side of the plate's edge (1.4 cm away), 2–4 cm up | squeezed out across the table at 4–7 cm/s, rising a little | 0.35–0.5 s |
| Column (polish round) | 3 broad sheets side by side across the camera's view, overlapping: together ≈ 70 % of the well's width at the base, fanning out to ≈ 1.5× by 17 cm | 0.22–0.30 s, as the rim clears the well: up to full strength over 0.22 s (a soft rounded front), then a first rush that thins from the bottom (decay 0.45–0.6 s) and a thin tail (32 % of the source, decaying over 1.4 s) as the plate goes on steaming | over the well, ±3 cm about its middle | rises at 21–24 cm/s (clear of the plate's far rim as the dome leaves); forms only 5 cm off the porcelain; a meander frozen into the rising vapour, a slow sway at 0.6 Hz and a draught that leans the whole column from side to side (0.13 Hz); smooth for its first few centimetres, then breaking into irregular wisps with ragged, peeling edges and thin fold lines, churning and swirling in time; where it is thin (the top, the tail) it breaks into rising filaments; evaporates gently (e^(−h/14 cm)) | tail visible to ≈ 4.5 s; gone by STEAM_END, 6.61 s |

- **Puffs** are camera-facing soft billboards. A pocket puff shows only once the dome, carried off at ≈ 1 m/s,
  is clear of it by 40 % of its size (checked against the dome's live pose, at least 0.06 s after release), so no
  steam ever traces the dome's outline. The vertex shader places each puff at its age: emission momentum
  decaying over 0.18 s, buoyant acceleration (0.2 s) and deceleration by entrainment (1.6 s), radius growth, meander
  growing with height, and the spill's curl. The fragment shader slices a domain-warped 3D value-noise field through
  the puff. The field is attached to the puff and churns as it rises. Density is soft throughout: no thresholded
  edge, a Gaussian envelope on a radius the field warps (so stacked puffs never print discs or rings), shrinking
  from the edges in as it evaporates, and an outline that comes from the field, never the quad. Spill puffs are
  mostly filament from birth (thin sheets drawn out along the rise, in world space). The billows fray into those
  filaments as they evaporate.
- **Plumes** are ribbons up from the plate, as wide as the camera's horizontal, so they shear with their path and
  never twist or fold. Their density at height h is the source as it was h/rise ago. So the column grows up off the
  plate at its strongest, then thins from the bottom as the source weakens, while its first vapour keeps rising out
  of view. It fades in over its first 5 cm and out over the top 7 cm of its 27 cm, so no ribbon end shows and
  nothing lies on the plate. Dense cores saturate softly (no clamp edge), short of opaque (0.7). The fragment shader draws a broad, soft
  sheet (its half-width is the plume's width; the ribbon is 1.7× wider so the sheet's soft edge never meets the
  ribbon's) that is smooth for its first few centimetres and breaks into irregular wisps above: a domain-warped
  value-noise field in centimetres across and along the rising vapour, churning and swirling in time rather than
  sliding up. The sheet's edges are taken on the same warp, so they waver and peel. Where a sheet turns edge-on a
  ridge of the field draws a thin, brighter fold line. Where the steam is thin (its top, the tail) it breaks into
  rising filaments (a ridge of a field drawn out along the rise) that keep their light, instead of dimming as a veil.
  (Before the polish round it drew one or two strands, which the judge read as incense.)
- **Puffs** (polish round): the field through each puff is thresholded into lobes and gaps as it ages, with the same
  fold lines, its outline warped harder, and it churns faster, so no puff reads as a featureless blob.
- **Shading** (`STEAM_LOOK`): a near-white in-scatter (linear 0.94–0.97) through the rig's exposure and tone mapping,
  composited with a **screen blend** (out = c + dst·(1 − c)): steam only ever adds light, so it can never darken what
  is behind it. The window key is shaded by the dome, an analytic ellipsoid shadow with a soft penumbra, so steam
  under and behind the lifting cloche keeps the room's share, 0.9 (it was 0.77, the porcelain's shade-to-lit ratio;
  steam is lit from every side by the bright room and the white plate, and at 0.77 under a normal blend it read as a
  grey stain). The top is a touch brighter (skylight).
- **Soft contact.** No depth texture is used. The plate's top surface (the contract's upper-bound profile), the table
  and the dome's shell (its profile, crown and lip bead, at the cover's live pose) are known in closed form. Steam
  fades to nothing within 5 mm (plate, table) and 3 mm (silver) of them, so no billboard ever draws a line where it
  crosses a surface. Fragments inside the dome are dropped, because its shell hides them from this camera anyway.
  The plate's contact holds only over its footprint and down to its foot (a plate carried off in a decline hides
  nothing beside or below it), and the bin's body is a soft cylinder up to its rim (steam left behind by a change of
  mind never shows inside it).
- **Noise:** one 256² RG8 texture (Inigo Quilez's layered 3D value-noise lookup), seeded and built at load in under
  1 ms, at one fetch per octave. This replaced simplex noise, whose ALU cost was most of a 5.6 ms first version.

## Timing on stage

- **Plays on the reveal only.** The accept's samples drive the steam clock (`steamState.tau` is the accept's time),
  so a replay starts it from zero and nothing accumulates. Decline and host never show steam: the cloche stays on.
- **After the reveal**, the director poses `accepted` at 1.5 s and the steam carries on in `simulate`. `settling()`
  stays true while it rises, until `STEAM_END` (6.61 s since the polish round's tail; 3.09 s before), when every
  puff has gone and every plume is below `STEAM_GONE` (0.6 %; its last wisps then lift the cove by a level or two at
  most). The scene then ends clear and the loop idles (browser test: still drawing 3 s after the pose, no frames after
  STEAM_END, and the frame equals the reduced-motion still).
- **`settle()`** snaps the steam to rest. The exception is the settle that comes with a change of mind's cut (see
  the polish round below): the steam already released is left behind on its own clock and rises on and disperses
  over its own life, and what the cover closes over when it is set back on the plate stays under it.
- **Accepted still: no steam.** This covers posters, reduced motion and a saved accept (`STEAM_REST = null`).
  Rendered side by side at poster size (`evidence/v1.5/dinner/rest-compare.png`: none, and the column frozen at
  τ = 1.3, 1.6 and 2.0 s), a frozen wisp of steam against the light cove reads as a smudge beside the dome, not as
  heat. Steam is carried by its motion. With no residue, the still is identical to where the live reveal ends, the
  posters are unchanged and no assets need regenerating. Reduced motion shows the still: steam is motion.
- **Low tier:** one noise octave and no filaments (`setLowDetail`), about half the lookups.

## Frame cost (M2 Pro, Chrome/ANGLE Metal, the real scene on the production stage)

Measured by A/B timing of the scene's draw with the steam on and off, each frame synced by a 1-pixel read-back (15
alternating rounds, medians; `scripts/_scratch/steam-bench.ts`, not committed):

| τ | 1400² | 2000² |
| --- | --- | --- |
| 0.3 s | 0.23 ms | 0.15 ms |
| 0.5 s | 0.30 ms | 0.46 ms |
| 0.7 s (pocket, peak) | 0.42 ms | 0.49 ms |
| 1.0 s | 0.30 ms | 0.46 ms |
| 1.5 s | 0.26 ms | 0.26 ms |
| 2.2 s | 0.18 ms | 0.28 ms |

Frame cadence through four reveals with their steam, on a phone viewport (390×844 at 3×, Normal tier, real time):
p50 16.7 ms, p95 16.7 ms, p99 16.8 ms. With 4× CPU throttling it is the same. The tier stays Normal
(`evidence/v1.5/dinner/perf-cadence.jsonl`). One intermittent 100 ms frame about 0.12 s into the first accept after
load also appears with the steam hidden: it predates this work.

The budget was < 1 ms. CPU work per frame is a handful of uniform writes.

## Adversarial review (five rounds, by an independent reviewer reading the frames)

A reviewer with a VFX and food-steam brief read every evidence set and measured the steam on its own. Its metric is
the brightening against a no-steam render of the same frames, `nosteam-720/`. What each round found, and the fix:

1. **Not steam yet.** The spill was a lumpy sideways billow at rim height. Over the plate's shadow the steam looked
   like a grey stain. The column appeared only after a dead gap and read as a texture sliding up. **Fix:** the spill
   became a rising, short-lived sheet; the column was started at lift-off at full strength, made to flap and churn,
   kept off the plate (no layer lying on it), and given ring-free puff envelopes.
2. **A second wave.** The steam swelled again after the landing. The strands looked like a comb, and the column
   seemed to sink back. **Fix:** a few uneven plumes; a single visible-steam curve that peaks at the reveal and only
   fades; gentler evaporation so the first vapour keeps rising; the trail shed from the trailing rim and the
   squeeze-out puff at set-down (both physically real, and both the reviewer's suggestions); solid puff centres. The
   reviewer conceded the interior-fog point: the band under the raised rim is the outer skirt reflecting the plate.
3. **Comb in the opening, and the column did not read.** **Fix:** the spill became an uneven sheet whose lobes vary
   4–14 cm, shear and roll over; the column's base became soft and laminar; one dominant plume carries dense filaments
   (p99.9 ≈ 43 levels against the cove) with eddies that reshape fast.
4. **"Yes, it reads as steam, with conditions."** The conditions were twin rails and a flat edge at the column's base,
   a glow along the dome's shoulder, and blotches over the plate's shadow. **Root cause of the rails and the edge: a
   shader seam.** The second strand's offset used `sign()`, which jumped it across a horizontal line. Two more seams
   were found and fixed: the plate profile stepped to the table at the plate's edge, and the dome-shadow test was a
   branch. Pocket puffs now appear only once the dome is clear of them, and the release mist is lighter.
5. **Signed off.** *"It reads as real steam, and I'd sign it off. … Even frame by frame there is no giveaway left
   that I would block on."* The remaining minor note was more churn in the young column at 1.0–1.3 s. It was applied
   (strand churn 1.5× faster, frayed strand edges).

The visible-steam curve (`steam-visibility-curve.txt`, summed brightening over the frame, 720 px):

- **Rise:** 40 at 0.19 s, 302 at 0.38 s.
- **Peak:** 372 at 0.58 s, as the dome slides clear of the plate. The reviewer judged this rise physically justified,
  because steam that was hidden behind the dome comes into view.
- **Fade:** 176 at 0.96 s, 159 at 1.34 s, 51 at 1.92 s, 4 at 2.69 s and 0 by 3.1 s, with no swell after the landing.

## Decisions

- **No change to the lift choreography.** The steam exposed no flaw in it. The spill leaves the raised side first
  because the handle-led tilt opens that side first, and the pocket is left behind because the dome is carried off
  sideways faster than warm air can follow.
- **The spill reads late, by physics.** Steam leaving the gap at the front-right sits over the white porcelain,
  which is close to invisible under front light, and the dome lifts faster (up to 54 cm/s) than the warm air can
  climb its skirt (a ≈ 1.2 m/s² buoyant start). It shows from ≈ 0.24 s as a soft curl beside the dome's right flank,
  and from ≈ 0.3 s past the plate's right rim against the cove. The haze under the lifting dome (over its shadow on
  the plate) is what "under the cloche" looks like here.
- **No lean of the column towards the cloche.** A first version leaned it after the dome's wake. That made it read
  as steam leaking from under the landed cloche, so the drift is now zero and the column stands over the plate.
- **The pocket comes into view rather than being born in view.** The warm air the dome held is released inside it
  and appears only as the shell slides clear. This is the physically right reading, and the only way to keep steam
  from tracing the dome's outline.

## Known gaps

- **No reflections of the steam in the silver.** The dome reflects the rig's environment, not the steam beside it.
  A real polished cloche would show a faint bright smear of the steam in its flank.
- **No refraction or heat shimmer.** A warm plate shimmers the background slightly. The stage has no scene-colour
  copy to distort, and the effect is near the threshold of visibility at this scale.
- **At most two lots of steam left behind.** Three steam clocks draw at once (the reveal's and two left behind by
  changes of mind). A guest who changes their mind more than four times within about two seconds replaces the
  leftover closest to gone (the faintest), which can then end a little early.
- **Captured steam is judged at the cover's seat.** What the returning cover closes over is decided by where the
  steam was when it sat back on the plate (half a frame after; the decline lifts the dish at once, so it may be up to
  a centimetre higher by then). A wisp straddling the rim keeps its outside part.
- **Reviewer's cosmetic notes left as they are.** A faint lift (+26 levels) on the landed dome's lower band at
  0.90–1.02 s: invisible at normal size. The young column's curl can read as a fairly regular arc for a moment.
- **Steam over the white plate is nearly invisible.** Under the screen blend, steam over the lit porcelain adds at
  most ≈ 7 % of the remaining headroom, so the column reads only once it clears the plate's far rim (≈ 0.6 s); the
  burst under the lifting rim shows mostly where it is over the dome's shadow. This is how steam looks in front light.
- **Thin over light.** By design the steam is subtle against the cove and the porcelain (see Research). It is most
  legible in motion and over the silver.

## Integration with v1.5/integration (2026-10-02)

Merged `v1.5/integration` (`9561419`: Party, Business, Sports, both Birthday branches and the bin) into this branch.

- **No textual conflicts.** `scripts/capture.ts` keeps both Party's 3.6 s accept clip and Dinner's 3.8 s one. The
  steam does not touch the cloche's material, so the bin owner's chained `patchBinVisibility` is unaffected.
- **The steam clock after a change back to accept.** With the real bin, a decline → accept rewind may take 0.6 s,
  and the accept after it then plays up to 1.46× faster (`REWIND.max.accept`, `k`). The steam now follows the
  accept's own time while the cover moves and real time after the reveal's motion ends (`revealSteamTime`, which
  is continuous). Without this, `changeTime` holding at `CONTENT_END` would have frozen the steam until the
  director's end. The reveal's end no longer jumps the clock to 1.5 s, so it carries on from the last sample. Tested:
  the steam clock never steps more than k per frame and never goes back.
- **The change of mind's 0.25 s clearing is independent of the rewind's length**, so it composes with the new
  `REWIND.max.accept` and `outcomePace`. Verified in the merged change strip: the steam is gone over the bin by
  0.69 s.
- **Party's controller changes** (equal sub-steps ≤ 1/120 s per frame, the rAF clock, the off-screen pause) need no
  change here: `simulate` sums its steps and `settling()` ends with the steam.
- **Re-measured on the merged code:**
  - Steam frame cost: at most 0.24 ms at 1400² and 0.27 ms at 2000². The dish is now smaller in the frame, under
    the bigger bin.
  - Cadence on the phone viewport: p95 16.8 ms, tier Normal.
  - One 0.5 s main-thread task right after the first accept on the 390×844 page. It is the camera refit
    (`fitPerspectiveToHero` → `extents` over Dinner's frame points), and it is identical with the steam hidden: it
    comes with the integration, not the steam (reported).
- **Merged evidence:** `evidence/v1.5/dinner/merged/`. It holds reveal frames and strips in the new framing,
  close-ups, the change, decline and host strips with the real bin (decline shows no steam), and the frame cost and
  cadence results. The pre-merge strips are in `pre-merge/`.

## Polish round (2026-10-02, judge's score 6)

Merged `v1.5/integration` (`5072dd4`: the framing pull-back, the bin's entrance and flap timing) first, with no
conflicts. The judge's five defects and what changed:

1. **"A grey stain" under the lifting dome.** The steam was composited with a normal blend, so wherever it was
   dimmer than the porcelain behind it, it greyed it; the dome's shadow (0.77 of the light) made that worse. It is
   now a **screen blend**, which can only lighten, and keeps 0.9 of its light in the dome's shadow. Measured over the
   whole reveal: the largest drop anywhere in the frame, steam on against off, is 0 levels in every frame
   (`polish/steam-visibility-curve.txt`). The grey patch still seen on the plate is the dome's own shadow, the same
   without steam (`polish/under-dome-nosteam-vs-steam.png`).
2. **"Incense."** The column is now three overlapping broad sheets, together ≈ 70 % of the well's width at the base
   (test: 60–85 %), fanning out as they rise, with ragged edges, fold lines and filaments, leaning in a slow draught
   (`polish/closeup-column.png`, `polish/column-nosteam-vs-steam-stretched.png`).
3. **"Gone by ≈ 2 s."** A hot plate goes on steaming as it cools, more thinly. The source keeps a 32 % share decaying
   over 1.4 s after the first rush, and thin steam breaks into filaments that keep their light. Steam-only
   brightening at 720 px (p99.9 / max, 8-bit levels): 44 / 87 at 1.9 s, 40 / 75 at 2.5 s, 25 / 51 at 3.1 s,
   20 / 45 at 3.5 s, 11 / 22 at 4.0 s, 7 / 14 at 4.4 s, 4 / 7 at 4.8 s, 1–2 to 6.5 s, then 0
   (`polish/tail-normal-2.5-4.5s.png` at normal contrast, `polish/tail-stretched-2.5-4.5s.png` stretched).
   `STEAM_END` is 6.61 s, where the density is below `STEAM_GONE` (0.6 %): it ends with no step.
4. **A change of mind faded the steam in 0.25 s.** The steam already out is now **left behind** on its own clock (up
   to two lots, `STEAM_LAYERS`), drawn by the same two instanced draws again with their own clock uniforms (same
   shader source, so no new program). It rises on and disperses over its own life. The column's source dies away
   over 0.15 s (`PLUME.cut`), so its base detaches and rises off as a soft gradient. The cover coming back down
   through it and the dish carried off stir it, so it mixes in and evaporates sooner than a column in still air
   (`STEAM_STIR`, 0.4 s, from a smooth start). What the cover closes over when the rewind sets it back on the plate
   stays under it and leaves with the dish (`uCapture`): steam is judged by where it was at that moment, over a
   ragged 4 cm band inside the shell. At that moment all of it is inside the shell and already hidden, so nothing
   pops. A reveal resumed part-way (changed back mid-rewind) releases only from where it resumes, ramped up like a
   first release, beside the steam left behind. Fixed with it: the plate's soft contact hid every bit of steam below
   a carried plate's height (steam popped back when the dish dropped into the bin), and steam showed through the
   bin's body. Evidence: `polish/change-sheet.png` (cut at 0.5 s), `polish/change-late-sheet.png` and
   `polish/change-late-bin.png` (cut at 2.0 s, column full), `polish/change-bin-steam.png`.
   - **After a change back** (decline → accept), the reveal plays up to 1.46× faster and the steam follows its clock
     while the cover moves (≈ 0.4 s of real time, the spill and the column's first rise), then runs in real time
     (`polish/changeback-sheet.png`). In the strip it reads as a brisker lift, not as fast-forwarded steam.
     Accept → decline → accept at 0.6 / 0.75 s: `polish/double-sheet.png`.
5. **No reflection of the steam in the silver.** Not done: the cloche's reflections come from the rig's prefiltered
   environment, and a steam term would need either a second pass into a reflection probe or a patch into the
   imported silver material (whose shader the bin's `patchBinVisibility` already chains). Neither is cheap. It stays a
   known gap; the reviewer did not find its absence glaring.

**Hostile review against real photographs** (an independent reviewer; references: Wikimedia Commons *Coffee steaming
in a mug*, *Cup of coffee on black background*, *Hot coffee on a cold day*). First pass, 6.5/10: defects 1 and 5
fixed; the column still a comb of fingers at 1.0–1.25 s and a parallel-sided slab later; the tail a uniform veil
visible only to ≈ 2.7 s at normal contrast; the late change of mind printing the dome's outline as a crisp arc at
the base of the left-behind column, over the bin ("smoke leaking out of the bin"); the escaping puffs featureless
blobs; the column arriving ≈ 0.3 s after the plate is uncovered; everything soft, with no fold lines; the field
scrolling rather than evolving; the dense base washing the gilt rim. All of these were acted on (the items above,
plus: a faster first rush, 21–24 cm/s, so the column clears the far rim as the dome leaves; coverage capped at
0.7). The reviewer's references agree with the result's main reads: a source ≈ 80 % of the opening that fans out
to ≈ 1.4×, curtain-like sheets with brighter fold lines, filaments with feathered edges, visible only over darker
ground.

Frame cost after the round (A/B, medians, M2 Pro; `polish/perf-bench.txt`): 0.18–0.52 ms at 1400², 0.22–0.35 ms
at 2000², and 0.52 / 0.70 ms for the worst overlap (the reveal's steam at 1.0 s beside a whole left-behind lot at
1.0 s). `steamEndAfter` costs ≈ 0.1–0.5 ms once, at the cut.

## Evidence and tests

Evidence is under `evidence/v1.5/dinner/` and is not committed:

- **The reveal at 62.5 fps:** `reveal-62fps/` (239 frames at 720 px), `reveal-62fps.mp4` and
  `reveal-62fps-crop2x.mp4`.
- **Strips:** `reveal-strip-0-1s.png`, `reveal-strip-1-3.8s.png`, and `reveal-consecutive-0.40s.png` /
  `reveal-consecutive-0.80s.png` (12 consecutive frames each).
- **Close-ups at 1080 px:** `closeup-rim-spill.png`, `closeup-pocket.png`, `closeup-column.png`, frames in
  `closeups-src/`.
- **Change of mind, decline and host:** `change-strip.png`, `decline-strip.png`, `host-strip.png` (no steam).
- **Stills per beat and clips:** `capture/` from `pnpm capture dinner`. Its accept clip now runs 3.8 s, through the
  steam.
- **Accepted still:** `rest-compare.png`, the comparison behind the no-residue decision.
- **Steam metric and Low tier:** `steam-visibility-curve.txt` against `nosteam-720/`; `low-tier-strip.png`.
- **Frame cost:** `perf-bench.json`, `perf-cadence.jsonl`.
- **Polish round:** `polish/`: `reveal/` (1080 px, every 64 ms to 4.8 s) and `reveal-sheet.png`; close-ups
  `closeup-under-dome.png`, `closeup-puffs.png`, `closeup-column.png`, `under-dome-nosteam-vs-steam.png`,
  `column-nosteam-vs-steam-stretched.png`, `tail-normal-2.5-4.5s.png`, `tail-stretched-2.5-4.5s.png`; changes of
  mind `change/`, `change-late/`, `changeback/`, `double/` with their sheets, `change-bin-steam.png` and
  `change-late-bin.png`; Low tier `low-tier-sheet.png`; `steam-visibility-curve.txt` (to 6.6 s, `steam-720/`
  against `nosteam-720/`) and `perf-bench.txt`.

The four posters re-captured with the steam match the shipped ones (0 pixels differ at 2 % fuzz), so `assets/` is
untouched.

Tests:

- `tests/dinner-steam.test.ts` has 16 tests. The plan: deterministic; spills first from the raised side while the
  far rim is down; the pocket is released inside the dome and shown once clear; a trail from the trailing rim and a
  set-down puff; nothing in or through the plate or the table; speeds; the column is a broad sheet (60–85 % of the
  well); it grows, shows, keeps a thin tail at 4 s and is gone by STEAM_END, with no fold. On stage: the reveal
  clock; the steam carries on and ends clear; decline and host show none; reduced motion and settle; replay; the
  steam clock through a change back to accept; a change of mind leaves the steam to rise on and disperse (its clock
  untouched, the source dying away continuously, the cover seated when it closes over it); changed back mid-rewind,
  the reveal resumes beside the steam left behind; eight quick changes leave at most two lots and all of it ends.
- `tests/browser/dinner.spec.ts` checks that the steam shows after the reveal, that the loop keeps drawing while it
  rises (still 3 s after the pose) and then idles, and that the final frame equals the reduced-motion still.
- Totals: unit 294 and browser 88 before the merge; unit 354 and browser 91 after it; unit 370 and browser 95 after
  the polish round.
