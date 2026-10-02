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
| Pocket | 14 | 0.30–0.49 s | inside the dome as it is carried off (weighted to its crown, where the warm air sat) | 20–35 % of the dome's velocity (its wake), then a fast buoyant rise, fraying | 0.45–0.7 s |
| Column | 7 plumes | 0.24–0.32 s, as the rim clears the well: at full strength at once, then thinning (decay 0.5–0.65 s) | the middle of the plate's well, r < 0.26 su | rises at 17–21 cm/s; a meander frozen into the rising vapour, the whole plume flapping ±1–2 cm at 0.7 Hz, strands that churn and curl; a slight lean after the departing dome (its wake) | gone by STEAM_END, 3.44 s |

- **Puffs** are camera-facing soft billboards. The vertex shader places each puff at its age: emission momentum
  decaying over 0.18 s, buoyant acceleration (0.2 s) and deceleration by entrainment (1.6 s), radius growth, meander
  growing with height, and the spill's curl. The fragment shader slices a domain-warped 3D value-noise field through
  the puff. The field is attached to the puff and churns as it rises. Density is soft throughout: no thresholded
  edge, a Gaussian envelope on a radius the field warps (so stacked puffs never print discs or rings), shrinking
  from the edges in as it evaporates, and an outline that comes from the field, never the quad. Spill puffs are
  mostly filament from birth (thin sheets drawn out along the rise, in world space). The billows fray into those
  filaments as they evaporate.
- **Plumes** are ribbons up from the plate, as wide as the camera's horizontal, so they shear with their path and
  never twist or fold. Their density at height h is the source as it was h/rise ago. So the column grows up off the
  plate at its strongest, then thins from the bottom as the source weakens, while its first vapour rises away and
  evaporates (e^(−h/14 cm)). It fades in over its first 1.3 cm and out over its top 6 cm, so no ribbon end shows and
  nothing lies on the plate. The fragment shader draws the strand or two a rising sheet folds into: wandering and
  curling side to side (laminar for the first few centimetres), the pattern itself churning in time rather than
  sliding up, breaking into wisps higher.
- **Shading** (`STEAM_LOOK`): a near-white in-scatter (linear 0.94–0.97) through the rig's exposure and tone mapping.
  The window key is shaded by the dome, an analytic ellipsoid shadow with a soft penumbra, so steam under and behind
  the lifting cloche is dimmed to the room's share (0.77, the porcelain's measured shade-to-lit ratio). The top is a
  touch brighter (skylight).
- **Soft contact.** No depth texture is used. The plate's top surface (the contract's upper-bound profile), the table
  and the dome's shell (its profile, crown and lip bead, at the cover's live pose) are known in closed form. Steam
  fades to nothing within 5 mm (plate, table) and 3 mm (silver) of them, so no billboard ever draws a line where it
  crosses a surface. Fragments inside the dome are dropped, because its shell hides them from this camera anyway.
- **Noise:** one 256² RG8 texture (Inigo Quilez's layered 3D value-noise lookup), seeded and built at load in under
  1 ms, at one fetch per octave. This replaced simplex noise, whose ALU cost was most of a 5.6 ms first version.

## Timing on stage

- **Plays on the reveal only.** The accept's samples drive the steam clock (`steamState.tau` is the accept's time),
  so a replay starts it from zero and nothing accumulates. Decline and host never show steam: the cloche stays on.
- **After the reveal**, the director poses `accepted` at 1.5 s and the steam carries on in `simulate`. `settling()`
  stays true while it rises, until `STEAM_END` (3.44 s), when every puff has gone and every plume is below 1 %
  density (white at 1 % moves the greige cove by 0.3 of an 8-bit step). The scene then ends clear and the loop idles
  (browser test: no frames after it, and the frame equals the reduced-motion still).
- **`settle()`** snaps the steam to rest. The exception is the settle that comes with a change of mind's cut: the
  steam already released keeps rising on its own clock. Nothing more is released (`emitEnd`), and it clears over
  0.25 s while the cover rewinds onto the plate, because a mid-reveal change would otherwise pop the most visible
  steam off in one frame. Fragments the returning dome passes over are dropped (inside its shell).
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
| 0.3 s | 0.27 ms | 0.27 ms |
| 0.5 s | 0.36 ms | 0.44 ms |
| 0.7 s (pocket, peak) | 0.57 ms | 0.61 ms |
| 1.0 s | 0.35 ms | 0.51 ms |
| 1.5 s | 0.17 ms | 0.14 ms |
| 2.2 s | 0.23 ms | 0.33 ms |

The budget was < 1 ms. CPU work per frame is a handful of uniform writes.

## Decisions

- **No change to the lift choreography.** The steam exposed no flaw in it. The spill leaves the raised side first
  because the handle-led tilt opens that side first, and the pocket is left behind because the dome is carried off
  sideways faster than warm air can follow.
- **The spill reads late, by physics.** Steam leaving the gap at the front-right sits over the white porcelain,
  which is close to invisible under front light, and the dome lifts faster (up to 54 cm/s) than the warm air can
  climb its skirt (a ≈ 1.2 m/s² buoyant start). It shows from ≈ 0.24 s as a soft curl beside the dome's right flank,
  and from ≈ 0.3 s past the plate's right rim against the cove. The haze under the lifting dome (over its shadow on
  the plate) is what "under the cloche" looks like here.
- **The column leans towards the dome at first.** The cloche's wake is a real slow drift towards the back-left. It
  also puts the young column over the dome's darker right flank, where it is easiest to see.

## Known gaps

- **No reflections of the steam in the silver.** The dome reflects the rig's environment, not the steam beside it.
  A real polished cloche would show a faint bright smear of the steam in its flank.
- **No refraction or heat shimmer.** A warm plate shimmers the background slightly. The stage has no scene-colour
  copy to distort, and the effect is near the threshold of visibility at this scale.
- **One steam clock.** After accept → decline → accept in quick succession, the first reveal's fading steam is
  replaced by the new reveal's when it starts. At most 0.25 s of clearing steam is lost, at the moment the new
  reveal begins.
- **Thin over light.** By design the steam is subtle against the cove and the porcelain (see Research). It is most
  legible in motion and over the silver.
