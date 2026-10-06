# Dinner v1.6: the steam under the cloche, as a volume

Surya, 2026-10-02 (the Hollywood pass, `docs/hollywood-pass-brief.md`): *"The steam under the cloche isn't
convincing; it needs to realistically accumulate under the cloche and somewhat match its shape when it's lifted
(as it would be in real life)."* Plan and CPU mirror: `src/scenes/dinner/steam.ts`; renderer:
`models/dinnerSteam.ts`; scene depth: `src/render/sceneDepth.ts` (one hook in `src/render/stage.ts`); scene
clocks: `src/scenes/dinner/index.ts`; tests: `tests/dinner-steam.test.ts`, `tests/scene-depth.test.ts`,
`tests/browser/scene-depth.spec.ts`, `tests/browser/dinner.spec.ts`.

The v1.5 steam (61 billboard puffs and three ribbon plumes, `docs/scenes/dinner-v1.5.md`) is replaced. Its clocks,
its change-of-mind rules, `STEAM_END`'s role and the accepted still's "no steam" are kept.

## What real steam under a lifted cloche does (research)

- **It accumulates.** Under a hot cloche the air is saturated and the dome's wall is cooler than the food: the
  vapour condenses into a fog that fills the cavity, densest under the crown (warm moist air rises; the wall
  condenses it) and clear just above the hot surface (the surface re-evaporates it).
- **It keeps the dome's shape for a beat.** A released buoyant bubble starts from rest: its top moves only about
  ½·g′·t² with a virtual-mass factor, ≈ 1 cm in the first 0.2 s for g′ ≈ g·ΔT/T ≈ 1.5 m/s² (ΔT ≈ 45 K) and a
  10 cm bubble. The dome lifts off faster than that (up to 54 cm/s), so the fog stands as a hemisphere on the
  plate while the dome leaves it, its top drawn up a little by the dome's lift (the cavity's air follows it).
- **Then it is a thermal.** It rises at w ≈ C·√(g′·R) and slows as it entrains room air; its radius grows about a
  quarter of the distance it rises (Scorer 1957; entrainment α ≈ 0.25), the rise speed falling as t^−½. A
  starting thermal rolls up into a vortex ring: up through the middle, outward at the top, down outside, in at
  the bottom — the cap mushrooms and its edge curls outward and down. Sources:
  [Scorer, *Buoyant vortex rings*, Proc. R. Soc. A 1957](https://royalsocietypublishing.org/doi/10.1098/rspa.1957.0022),
  [*What controls the entrainment rate of dry buoyant thermals* (JAS 2023)](https://journals.ametsoc.org/view/journals/atsc/80/11/JAS-D-23-0063.1.pdf),
  [*Buoyancy-driven entrainment in dry thermals*](https://arxiv.org/pdf/1906.07224).
- **Visible steam is droplets.** It shows where saturated air mixes with the room and is densest in that mixing
  layer: steam's sheets and bright fold lines. It thins from its thin parts first as it mixes and evaporates.
- **Its light.** An optically thin cloud of droplets scatters forward (Henyey-Greenstein g ≈ 0.5–0.8): front lit
  it is faint, backlit it glows. A dense fog scatters many times and behaves like a soft white body, bright on
  the side facing the window, greyer underneath, lit from every side by the room.
- **How film renders it.** A sparse volume (VDB) of density, raymarched with single scattering from the key and a
  multiple-scattering approximation (Wrenninge, *Art-Directable Multiple Volumetric Scattering*, SIGGRAPH 2015
  talk; *Production Volume Rendering*, SIGGRAPH 2017 course); energy-conserving integration per step (Hillaire,
  *Physically Based and Unified Volumetric Rendering in Frostbite*, SIGGRAPH 2015). Real-time clouds use the same
  with a light march or a precomputed light volume, a jittered start and a reduced-resolution march
  (Schneider, *The Real-Time Volumetric Cloudscapes of Horizon Zero Dawn*, SIGGRAPH 2015;
  [Heckel, *Real-time dreamy cloudscapes with volumetric raymarching*](https://blog.maximeheckel.com/posts/real-time-cloudscapes-with-volumetric-raymarching/)).
- **Photographs and film.** Cloche reveals in restaurant and stock footage (smoke and steam under glass and silver
  cloches, e.g. [Getty: food smoke](https://www.gettyimages.com/photos/food-smoke),
  [iStock: food smoke video](https://www.istockphoto.com/videos/food-smoke)), lifted pot lids and dry-ice cloche
  service. No reference image was downloaded into the repository (the review compared the frames with these references
  and with the physical description above).
- **What the judges compared against.** The first judging was briefed to judge against photographs and film
  references (the footage above is the kind); the record does not list which images it opened. From the second judging
  on, the record names no fixed photograph or film frame: each judge rendered its own frames through the production
  stage (`frames.ts`) and judged them against no-steam twins, the previous judge's frames, numeric criteria and the
  physical description above — the second the plate's grey and the grain's levels; the third transmittance 0.3–0.5,
  dense-body p5–p95 ≥ 40, a 20–30 level terminator, 2:1 sheets and a hole dip ≤ 5; the fourth the same plus felt, boil
  and shell measures and its design-limit diagnosis; the fifth the box clip, the held dome's inside/outside ratio and
  the rise and mass; the sixth condensate against smoke (mass after release, vapour against polish 1, the ring's centre
  against its rims, thinning from the edges); the seventh the gush's share and the dome's IoU, against the brief's "a
  frame that reads as photographed steam at delivery size". The judges' frames and outputs live in the orchestrating
  session's scratchpad (`judge-steam2/` … `judge-steam7/`), not in the repository; copies of the judges' frame, bench
  and pacing scripts are in `evidence/v1.6/steam-polish4/tools/` to `steam-polish7/tools/`.

## What was built

### The field (`src/scenes/dinner/steam.ts`)

One density field in steam time τ (the accept's own clock, as v1.5), a pure function of τ: replay, rewind and frame
rate cannot accumulate anything. The cloud is a material: the shader finds, for every sample, where its air was
at the seat (the inverse of the flow) and reads the cloud there, so its structure is carried, stretched and rolled
by the flow instead of scrolling.

- **At the seat (`cloudSeat`).** The dome's cavity: a superellipse (r/R)^p + (y/H)^p = 1 fitted to `COVER_PROFILE`
  within 1.5 % (R 0.63, H 0.62, p 2.2, inside the 1.5 mm shell), down to the porcelain; soft at the wall
  (1.3 cm), clear for the first 6 mm above the hot plate (deepening to 2.3 cm as it re-heats the uncovered air),
  densest under the crown (the base keeps 55 %).
- **The flow (forward, newest last; `axisForward`).** (1) The base's slump: the lowest air, outer half, slides
  outward up to 5 cm and keeps its height over the surface, which falls over the plate's rounded rim to the table
  (`slumpSurface`): its edge rolls out and down over the rim. (2) The radial scale by material height: the base
  stays, the stem narrows to 70 %, the cap spreads by 0.22 per unit of rise (a thermal's entrainment, α ≈ 0.14 of the bubble's radius). (3) The
  vertical map: the thermal's rise (buoyant start τ_b 0.25 s, entrainment τ_m 0.9 s: ≈ 1.4 cm in its first 0.2 s, a
  peak of 15 cm/s ≈ 0.45 s after the release, half that by 1.3 s; `riseAt`), strongest on the axis (the edge loses 38 %: the cap domes and its edge lags),
  the dome's drag up while it is over the cloud (`dragAt`, below; strongest on the axis, so
  the top is drawn into a peak after the dome), the cap's squash. (4) The vortex ring: a twirl
  in the meridional plane about a core inside the cap's edge, carried with it, its angle up to 3.4 rad, its core 0.26 su across
  (outward on top, down outside: the cap's edge curls over). (5) Plan shifts: the dome's side drag (≈ 1 cm along
  its path) and the room's draught (a lean growing to 14 % of the height).
- **The inverse (`axisInverse`, the shader's flow map).** The twirl is undone exactly (it keeps the distance to its
  core). The vertical map is monotonic in the material height for a given material radius, and the radial scale is
  monotonic in the radius through it, so two nested bisections (11 × 13 steps) find the material point; the slump
  is undone by two more (10 × 10). Tested: forward(inverse(p)) = p within 0.5 cm wherever the cloud is
  (`tests/dinner-steam.test.ts`); where the slump folds the base over itself either preimage is valid.
- **The dome is a moving boundary.** Its lift drags the cavity's air after it while it is over the plate: the
  crown's air follows 32 % of its rise, integrated with a weight falling from 1 to 0 as its horizontal offset grows
  from 2.5 to 12 cm, so the cloud's top is drawn up ≈ 2.5 cm and stops when the dome has gone (`dragAt`). The
  scene's depth clips the cloud by the shell itself: whatever is still inside the cavity is hidden by the silver,
  and seen through the opening gap as it rises.
- **The release.** The thermal clock starts at τ 0.3 s (the rim ≈ 5 cm up and moving off). The cloud then holds
  the cavity's outline within 1.5 cm until ≈ 0.6 s (tested at 0.45 s, when the dome is clear of the plate's
  middle), mushrooms to ≈ 1.4 s, thins into wisps and is gone by τ 2.8 s (`CLOUD.life`).
- **The look over age (`cloudLook`).** Young, the cloud is fog with a soft edge; then the room's air folds its
  edge into thin, bright sheets (the mixing layer) and empties its inside, the threshold above which air keeps its
  droplets rises (evaporation of the thin parts first), and the sheets gather into a few larger wisps.
- **The veil (`veilSource`, `veilDensity`).** The uncovered plate goes on breathing: a column off the well rising
  at 19 cm/s, its source full by 0.6 s, a first rush and a 50 % tail decaying over 1.1 s; thin steam keeps a few
  bright ribbons (its visible density goes as the flow^0.5 while fewer ribbons survive), and the plate stops
  steaming visibly between τ 4.0 and 5.3 s; drawn as folded sheets drawn out along the rise that snake and twist.
- **The spill (`spillSource`).** During the handle-led tip the raised rim's gap (up to 2 cm) is a doorway: the
  saturated layer leaks from the top of the gap and is caught by the hot dome's boundary layer: a thin sheet
  climbing the raised side's outer wall at ≈ 25 cm/s (1–6 cm thick, thin face-on so it reads where it turns
  edge-on at the silhouette, not as a frosted veil), strongest where the gap is widest, fed until lift-off and
  carried off by 0.46 s; it has its own bounds.

### The renderer (`models/dinnerSteam.ts`)

Per frame, before the main render (the scene depth's client, `prepare`), and only while steam shows:

1. **Noise, once.** One tileable 64³ RGBA8 3D texture (1 MB) generated on the GPU in 64 layer draws at the first
   steam frame (the controller's warm frame, under the poster): two three-octave Perlin fBms (the warps), a
   Perlin-Worley billow and a Worley fBm (a fourth octave at two voxels a cell aliased into a hatch).
2. **The flow map** (one draw, 96 × 160 texels per clock, half-float): for every (ρ, y) about the plate's axis,
   the nested bisections of `axisInverse` give the material radius and height, the mean density (the seat's
   cloud × the flow's dilution × the stem's evaporation × the cloud's fade, nothing in the porcelain) and a
   dilated mean for empty-space skipping. The march then reads the flow with one texture fetch per sample.
3. **The light volume** (one draw, 24³ voxels over the live bounds, tiled as z-slices in one 2D atlas): each
   voxel's optical depth to the rig's key through the steam's mean (9 taps), to the room above (4 taps), and the
   lifted dome's shadow (its ellipsoid with a soft penumbra). Its box is the clouds' and the veils' (and the
   ground under them towards the shadow), never the spill's: a box that jumped when the spill ended re-lit the
   whole cloud in one frame (the review's pop at 0.46 s).
4. **The march**, at half the drawing buffer's resolution a side, capped at 460 k pixels (0.42–0.5 a side):
   each pixel intersects its ray with every live clock's cloud and veil boxes (`steamBounds`: the cavity's
   outline carried forward by the flow, the veil as far as it has risen), stops at the table and at the opaque
   scene's depth (the farthest of the full-resolution pixels it covers), finds with 6 probes of the dilated
   mean where along that span anything can show, and marches only there: 28 steps for the dense young cloud, 20
   as it thins into wisps, 16 for the veil alone (the Low tier 60 % of these), from an interleaved-gradient-noise
   start (a fixed white-noise dither of the pixel: deterministic; interleaved-gradient noise left a diagonal hatch). Each sample undoes the room's large turbulent warp (growing to 2.5 cm),
   the draught's lean and the dome's side drag, reads the flow map, and reads the cloud's own turbulence at the
   material point: a large field warping a finer fBm (in material space, so it is carried, stretched and rolled
   with the air). The mixture (the mean perturbed by it) gives fog inside and a thin bright mixing sheet at its
   edge; the veil and the spill add their own sheets.
5. **Light per sample.** Single scattering from the key with Henyey-Greenstein (g 0.45, flattened towards
   isotropic for the dense cloud), its transmittance from the light volume plus a local tap of the billows for
   the young cloud's own shade; Wrenninge's multiple-scattering octaves (0.5 and 0.25 of the light at 0.3 and 0.1
   of the extinction, flatter phases); the room's ambient, occluded from above, plus the white plate's bounce from
   below; the lifted dome's shade. The steam's own soft shadow falls on what each ray meets (the plate, the
   table; not the cloche, not where the cloche already shades the key, not while the cloud is still enclosed):
   up to 16 % of the light, from the light volume's optical depth. Integrated front to back, energy-conserving (Hillaire 2015): σ_t 3.4 per
   scene unit at full density.
6. **The composite** (the main render's transparent pass, over the box's footprint): a 4 × 4 depth-aware
   gather (a smooth B-spline-like kernel weighted by how well each half-resolution sample's depth matches the
   pixel's own) upsamples without blocks or halos at the cloche's edge and soaks up the dither; the radiance is
   tone mapped like the scene and laid over it premultiplied: background × transmittance × shadow + in-scatter,
   so the steam can veil and shade, not only add light.

The clocks (`update`) set per-clock uniforms from `cloudState`, `cloudLook` and the spill's last half-second of
source; up to three clocks share the one march (the reveal's and two left behind by changes of mind).

### The scene depth (`src/render/sceneDepth.ts`)

A small module with one hook in `Stage.render` (`this.sceneDepth.render(...)` before the main render) and one
line in `Stage.dispose`. A client registers itself (`requestSceneDepth`) and says each frame whether it needs the
depth. With no active client in the stage's scene the hook returns before touching the renderer; with one, the
meshes the client marked (`markDepthOccluders`: the plate and the cloche, and the bin once it has arrived) are
drawn depth-only (a colourless override material, both sides, on a dedicated camera layer, so no lights, no
shadow pass and no transparent parts) into a 32-bit float depth texture the size of the drawing buffer, then the
client's `prepare` runs. Camera layers, override material, background and render target are restored. The
target is freed on the first frame no client needs it (a scene switch leaves no GPU memory behind:
`tests/browser/collection.spec.ts`'s resource check failed until it was).
Tested: the hook makes no renderer call for a scene without an active client (`tests/scene-depth.test.ts`); the
other four scenes' stills are byte-identical with the hook removed, at rest and mid-sequence, and draw no depth
pass (`tests/browser/scene-depth.spec.ts`); the posters are unchanged (`tests/browser/posters.spec.ts`).

## The clocks and a change of mind (kept from v1.5)

- **The steam clock τ** is the accept's own time while the reveal plays (`revealSteamTime` after a change back,
  continuous, up to `k` × faster while the cover moves), then `simulate` carries it on in real time until
  `STEAM_END`; `settling()` keeps the loop drawing until then. `STEAM_END` is now the later of the cloud's life
  (τ 2.8 s) and the veil falling below `STEAM_GONE` everywhere: 5.88 s (v1.5: 6.61 s).
- **The accepted still has no steam** (`STEAM_REST = null`): posters, reduced motion and a saved accept are
  unchanged (the shipped Dinner posters match at 0.00 %), and the depth pass does not run for them.
- **A change of mind** leaves the steam already out on its own clock (up to two lots, `STEAM_LAYERS` 3), stirred
  by the returning cover (`stirFade`) and broken up by the binned dish's wake (`wakeFade`; the stir is now 0.3 s, was 0.4); the veil's source dies
  away over `VEIL.cut` (0.15 s) so its column detaches and rises off as a gradient. What the cover closes over
  stays under it (`captured`, judged by where the cloud was at the capture). New in v1.6: the fog low over the
  plate (the cloud's base and its slump over the rim) is swept by the cover's skirt and leaves with the plate
  over 0.25 s from the capture, and the stirred band round the seated dome reaches further near the table
  (without it, the base's ring stayed on the table as a grey haze in front of the bin: "smoke from the bin").
- **A reveal resumed part-way** (changed back mid-rewind) carries no new cloud: its cloud is the one left
  behind; it releases only the plate's veil, ramped up from where it resumes (`cloudState(τ, emitStart).present`).
- **The dome's drag stops at a cut** (`dragAt(min(τ, emitEnd))`): a cloud left behind is no longer drawn after a
  dome that is coming back down.

## Numbers (first build, superseded — current figures and frames: Polish round 7 and `evidence/v1.6/steam-polish7/`)

- **Steps:** 28 (dense young cloud), 22 (thinning), 22 (veil only); Low tier 60 % of these (17/13/13) and no
  fine octave or billow-shade tap. 6 occupancy probes per ray. March resolution: half the drawing buffer a side,
  at most 460 k pixels (0.42 a side at 2.5 M).
- **Noise:** 64³ RGBA8, 1 MB, generated once on the GPU. Flow map 96 × 160 × 3 clocks (half float). Light volume
  24³ (one 144 × 96 atlas, half float). Scene depth: a 32-bit float depth texture the size of the drawing buffer.
- **Frame cost** (the real scene on the production stage, M2 Pro, Chrome/ANGLE Metal; each frame synced by a
  1-pixel read-back, steam on and off interleaved frame by frame, 10th percentiles; `scripts/_scratch/gpu-bench.ts`,
  not committed). Measured while two other owners were rendering on the same GPU (load average 8–10), so these are
  upper bounds; at load average 33–66 later in the day the numbers were meaningless and no final run was possible:

  | τ | 1400² | 2000² (2.5 M, capped) |
  | --- | --- | --- |
  | 0.3 s (tip, spill) | 0.8–0.9 ms | 0.9–1.0 ms |
  | 0.5 s (dome-shaped cloud) | 1.0 ms | 1.1 ms |
  | 0.8 s | 1.0–1.1 ms | 1.1 ms |
  | 1.2 s (mushroom) | 1.1–1.2 ms | 1.2–1.3 ms |
  | 1.5–1.8 s | 1.3–1.4 ms | 1.3–1.4 ms |
  | 2.2 s (wisps) | 1.5 ms | 1.5 ms |
  | 4.0 s (veil) | 0.8 ms | 0.9 ms |
  | reveal at 1.0 s + a whole left-behind lot at 1.0 s | 1.6 ms | 1.6 ms |

  Of which the scene depth, flow map, light volume and composite ≈ 0.3–0.5 ms, the march the rest. Zero when no
  steam shows (no client is active: no depth pass, no march; tested). The 4 × 4 composite and the shadow were
  added after this table; they were not re-measured.
- **Visible steam** (`evidence/v1.6/steam/final/steam-visibility-curve.txt`, luma against a no-steam twin at
  720 px): brightening p99.9 45 at 0.38 s, 122 at 0.77 s (peak), 86 at 1.15 s, 46 at 2.3 s, 22 at 3.1 s, 12 at
  4.2 s, 8 at 5.0 s, ≈ 1 by 5.8 s; v1.5 peaked at 43. Darkening (the steam's grey core and shadow over the white
  plate): ≤ 27 levels at the cloud's peak, 4 at 3.8 s, none before the cloud is out (re-checked at 0.77, 1.15 and
  3.84 s after the last change).

## Adversarial review

An independent reviewer (VFX-supervisor brief, the frames and steam/no-steam twins, the change-of-mind strips)
scored the first complete version **4/10** with six Musts. What was done about each:

1. **"Steam shows through the cloche; the silver looks frosted, then pops."** Three causes, all fixed. The spill
   sheet was too dense face-on (a frosted veil over the raised side): now thin, read only edge-on. The light
   volume's box grew with the spill's bounds and shrank when the spill ended, re-lighting the whole cloud in one
   frame (the pop at 0.46 s): the spill now has its own box and the light volume never includes it. The steam's
   new shadow first darkened the cloche's own flank from the cloud inside it: the shadow is now off on the
   cloche, where the cloche already shades the key, and while the cloud is enclosed (frame 0 is byte-identical to
   a no-steam render). From 0.43 s the cloud does stand in front of the lower right of the departing cloche, from
   this camera: that veil is real occlusion, not see-through.
2. **"It only adds light; no shade, no shadow."** It now composites as a medium (transmittance and in-scatter):
   a greyer core and underside (key transmittance ×1.5, ambient occluded from above 0.3–1.0) and a soft shadow on
   the plate and the table. Over the white plate the cloud now reads as a 3D fog with lit billows and grey hollows
   (`evidence/v1.6/steam/iter21-plate.png`).
3. **"A feathered matte."** The young cloud's wall is 0.85 cm (was 1.3), its core edge narrower, its billows'
   reach larger; the lifting dome now draws a peak (strongest on the axis). Still soft-edged: freshly released fog
   under a front light is; a crisper, lobed edge would need a finer march.
4. **"It inflates instead of rolling."** The thermal now has a visible buoyant speed-up and slow-down (peak 15
   cm/s at ≈ 0.75 s, half by 1.6 s), spreads less (0.22 per unit rise, was 0.32), thins sooner (erosion from
   a 0.35 s, gone by 2.8 s), stays in frame; the vortex roll is stronger (3.4 rad). The curled cap is in the field
   (`scripts/_scratch/outline.ts` sections) but, through a translucent, turbulent cloud from this angle, it reads as
   a rounded, swelling cap more than as a curled rim.
5. **"A fixed fine grain."** Two causes: the march's interleaved-gradient dither (diagonal structure that
   survived the upsample) and noise octaves at two voxels a cell (aliased under the flow's shear). Fixed: a
   white-noise dither the 4 × 4 gather averages out, three-octave noise. The remaining texture is soft mottling.
6. **"The veil is missing."** The veil now keeps a few bright, thin, vertically drawn ribbons as it thins: 33 levels
   at 3.5 s, 16 at 3.8 s, 12 at 4.2 s, gone by ≈ 5.6 s.

Shoulds acted on: the spill (thin, edge-on); the left-behind cloud disperses sooner (stir 0.3 s); the amount of
vapour (shorter life, smaller cap). **Not re-reviewed after these fixes** (the session ran out of time with the
machine at load average ≈ 66); the final reveal frames (`final/reveal-62fps`, 62.5 fps to 6 s) were rendered with
all of them but the last shadow strength (16 %, from 30 %), which was checked on three frames.

## Polish round: the judge's fixes (`v1.6/steam-polish`)

An independent VFX judge scored the version above **4/10 at laptop size, 5/10 at phone size**: the timing was right
(it stands, drifts, forms a cap, tears and thins, with no pops) but it did not read as steam: "a frosted
cotton-wool ball with a crawling sand grain over it", the dome's shape held for ≈ 0.1 s and half invisible over the
white plate. Eleven tells, five fixes. Each fix is its own commit; frames are rendered with the judge's own script
(`frames.ts`: the real controller on a 16 ms virtual clock, laptop 1280 × 720 @2, phone 390 × 844 @3).

1. **A sharp, lobed edge and a silky interior** (`cloud()`, `cloudLook`). The density is no longer the mean
   perturbed by noise: it is the signed distance to the cavity's wall *in material space* (carried, stretched and
   rolled with the air), moved by billows (convex Perlin-Worley lobes, cells 2.6 / 1.3 / 0.66 cm, folded by the
   large field, drawn out 1.6× along the rise; displacement 4.7 mm young → 1.2 cm) and a larger swell (1.3 mm →
   1.3 cm), remapped through a narrow band: **2.5 mm young, widening to 1.4 cm** as the room's air mixes in. Inside,
   a silky fog (density 1.3 young, ±25 % large-scale variation); at the boundary, the mixing layer's thin sheet,
   which starts at the boundary (nothing feathers outside it). The march finds where each ray enters the steam by
   bisection (3 steps, an eighth of a step) while the edge is narrow, and the composite upsamples bilinearly by
   depth (the 4 × 4 B-spline gather softened the edge by ≈ 4 px).
2. **No grain** (`RESOLVE_FRAGMENT`). The march's start moves every frame along a golden-ratio sequence seeded by the
   steam clock (frame = round(τ·60): a capture at a given τ is byte-identical across runs, checked), and a resolve
   pass blends each half-resolution pixel into a history (two half-float targets, ping-pong) fetched **where that
   steam was on the previous frame**: the steam's opacity-weighted depth along the ray (packed with the shadow in a
   float target) gives its point; its material coordinates come from this frame's flow map and the analytic forward
   map with the previous frame's state gives where it was (the veil and the spill rise instead); the previous
   camera projects it. New frame's share 10 %, history clipped to the neighbourhood's mean ± 1.6 σ, dropped where
   the opaque scene in front changed under the steam or the clock jumped. No octave finer than 6.6 mm (≈ 18 device
   px at laptop size, 22 at phone size); the Worley cells' borders are rounded (a smooth minimum: their creases read
   as a crawling web); the veil's sheets have smooth crests (they were the speckle at the cloud's base). A bug found
   on the way (in the first version too): the material point was built as `vec3(dir * r, y)`, putting the height in
   z, so the noise's anisotropy and the change-of-mind sweep used a horizontal axis as height.
3. **Lit as a body.** Room light 0.6 → **0.3** (occluded from above: a greyer underside); key 0.8 → 1.25 and its
   optical depth through the cloud 1.5 → **2.1×** the light volume's, which now carries the cloud's *visible* share
   (an emptied cloud no longer shades like a full one), read 2.4 cm towards the key plus the sample's own first
   stretch (the coarse volume's smear darkened lit faces). A **two-lobe phase**: Henyey-Greenstein g 0.7 forward and
   g −0.3 backward at 35 % (was g 0.45 pulled 60 % towards isotropic); Wrenninge octaves 0.45·e^(−0.35τ) (g halved)
   and 0.18·e^(−0.12τ) (isotropic). The billows' own shade is three times deeper (lit tops, shaded creases). The
   steam's shadow on the plate and the table 16 % → **42 %** of the key, from the lift-off. The light volume no longer
   counts the fog still enclosed by the dome (it shadowed everything just outside the silver a second time).
4. **The release, then the shape held.** The spill is a sheet that curls out of the raised gap (a roll 1–1.5 cm
   proud of the wall) and climbs the hot wall, thickening as it rises, its face torn into lobes, three times denser
   and wrapped further round the raised side (Gaussian 0.8 rad): visible 0.19–0.38 s on the front-right. The fog
   seen through the opening gap is shaded by the dome (no key under the silver, the room's light only through the
   gap, less higher up), and the lifted dome's shadow takes the key fully (it took 18 %). The thermal starts at
   **0.4 s** (was 0.3) with a slower buoyant start (0.3 s), and the slump, the stem, the roll, the sway and the
   draught's lean wait (lean from 0.65 s): **the fog stands in the dome's shape from the lift-off to ≈ 0.75 s**, its
   walls within 1.5 cm of the cavity's at 0.72 s (tested), its top drawn up into the dome's wake, no sideways drift.
5. **Less vapour and a real roll.** The cap spreads 0.08 per unit of rise (was 0.22), the draught leans it half as
   much (0.07): **at its peak the cap is within the plate** (outline + lean + mean edge reach ≤ 0.8 su while it has
   substance: tested; 0.93× the plate's radius at 1.1 s, 1.0× at 1.3 s as it evaporates; the judge measured 1.2–1.4×). The fog inside empties by 1.2 s, evaporation starts at
   0.2 s of the thermal, the cloud is gone 0.5 s sooner (life 2.0 s); the veil's first rush is smaller and shorter
   with a longer, flatter tail so its smooth wisps show to 4–5 s. Coverage against the first version (laptop, steam
   opacity summed over the frame, the no-steam twins byte-identical): **1.01× at 0.74 s (the hold), 1.03× at 0.99 s,
   0.69× at 1.2 s, 0.69× at 1.6 s**. The vortex ring rolls 5.2 rad (was 3.4) about a tighter core (0.2 su) and keeps
   its fog longest (a denser, self-shaded core; its rolled lip outlines the cap in the coverage view at 1.2 s). On a
   change of mind the returning cover shoves the fog it left outward and down round its wall and, as its rim closes
   on the plate, pushes a jet along the porcelain, both torn by the noise.

**Cost** (`scripts/_scratch/gpu-bench.ts`, the first owner's A/B: steam on/off interleaved frame by frame, 10th
percentiles; one session, load 3–5, the first version's build in the integration worktree on another port; τ 0.3 /
0.6 / 1.2 s): at 1400² the first version **1.4 / 2.0 / 2.0 ms**, this one **1.9 / 2.1 / 1.7 ms** (later, at load 7, after
the thin-steam steps went 15 → 18: 1.9 / 2.2 / 1.9 ms); at 2000², this one 2.0 / 2.2 / 1.9 ms (the first version's page
timed out there in that session; earlier the same day, at load ≈ 5, it measured 1.9 / 2.4 / 3.2 ms at τ 0.5 / 1.0 /
1.5 s). Under this load the first version reads ≈ 1.6–1.8× its quiet-machine numbers (0.8–1.2 ms), so this one is
≈ 1.1–1.3 ms on a quiet machine, within the 1.5 ms budget; a quiet-machine run is still owed. What paid for the
resolve and the bisection: one light-volume read per sample, the billows' self-shade only while young, the
thin-steam step count once the fog inside has gone (0.75 s of the thermal; the dense count was in force to 1.15 s),
the bisection only for the young edge, the march budget 400 k pixels (was 460 k). Zero cost with no steam, as before,
and the march and its history now give their memory back when no steam shows. Steps: dense 22, thin 18, veil 13
(Low tier 60 %).

**The tells**, re-judged on the judge's own views (`evidence/v1.6/steam-polish/`, not committed):

- Gone: (1) cotton wool: a firm lobed boundary over a silky fog (`crops/dome-0.43-0.74.png`); (2) the crawling grain
  (`crops/grain-1.6s-x2.png`, `crops/absdiff-1.6.png`: the frame difference is coherent motion, not speckle); (3) the
  dome's shape holds ≈ 0.3 s with no drift and reads by its outline, its greyer lower side and its offset shadow;
  (5) flat lighting: lit side, terminator, grey underside; (6) far too much vapour: the cap stays within the plate,
  0.69× the vapour at 1.2 s, the phone's header clear (`sheets/phone-0.48-1.6.png`); (9) grainy veil: smooth
  wisps to ≈ 4 s.
- Improved, not gone: (4) the spill reads as a turbulent sheet on the front-right 0.19–0.38 s (`crops/spill-0.27-0.37.png`),
  but the fog below the rim through the gap is lit from the front (the key is front-left, so that face is
  genuinely lit) and still reads pale over the white plate; (7) the roll: the rolled lip shows in the coverage and
  as a curl on the cap's right edge at 1.06–1.22 s, but through a thin translucent cap the darker ring core is weak;
  (8) the plate at 1.0–1.6 s shows a softer shade (the cap is high, so its offset shadow falls mostly off the plate,
  back-right); (10) the returning cover displaces the fog into a shell round its wall (`sheets/decline-0.5-return.png`),
  but the shove reads smooth and the gap's jet is too small to read at this size; (11) the cloud in front of the
  departing silver now has a firm edge, but still veils the silver's lower right (real occlusion from this camera).

**Tests.** `tests/dinner-steam.test.ts` 21 (new: the hold at 0.72 s, no lean before 0.65 s, the cap within the plate,
the fog gone and evaporation under way by 1.2 s, the young band ≤ 3 mm widening ≥ 2.5×, lobes ≥ 3 mm, the roll past
half a turn by 1.2 s; the veil's tail at 4 s now < 45 % of 1.2 s, was 25 %); `tests/scene-depth.test.ts` 5 (the stage
hook test stubs the bloom and haze hooks merged at integration: it failed on `v1.6/integration`);
`tests/dinner.test.ts` 27; `tests/browser/dinner.spec.ts` 6/6, `tests/browser/scene-depth.spec.ts` 5/5;
`pnpm typecheck` clean.

## Polish round 2: the re-judge's fixes (`v1.6/steam-polish2`)

The re-judge scored the polish round **5 at laptop size, 5.5 at phone size** and named seven fixes (the first
five for the signature, the last two to ship) and seven new tells (A–G). Each fix is its own commit; frames are
rendered with the re-judge's own `frames.ts` (laptop 1280 × 720 @2 in its 620 CSS-px clip, phone 390 × 844 @3,
16 ms virtual clock) and measured against no-steam twins; the numbers are in
`evidence/v1.6/steam-polish2/measurements.txt`, the cost in `evidence/v1.6/steam-polish2/cost.txt`.

1. **Fine structure on the edge, from the lift-off** (`EDGE`, `cloud()`). Once the rim lifts off (`peel`,
   τ 0.27–0.6 s) the outer layer is a shear layer: the young billows grow by ≈ 1 cm, and the dense boundary
   takes its own lobes (Worley bulges, ≈ 7 mm cells, rounded so that seen edge-on each keeps its outline) with
   2–4 mm curls folded in, and here and there tears off in thin translucent sheets out to ≈ 1 cm; all in
   material space, the outer layer sliding against the inner, faded out by 0.45 s of the thermal as the band
   widens (the felt pattern on the aging cap, tell G). The young fog is denser (core 2.2, skin 1.2) so the lobes
   keep their outline. The room's cooler air undercuts the foot from the rim as a gravity current (≈ 12 cm/s,
   up to 2 cm deep at the rim, 6 cm in) whose head breaks into lobes and clefts: the foot is no ellipse (tell A).
   The history is fetched Catmull-Rom (bilinear resampling blurred the edge each frame) and clipped at 1.25 σ.
   Lobes per 10 cm of the outline at 0.54–0.67 s at 2× (`py/lobes.py`): walls 5–8 (judge's frames 0–4.5),
   crown 3.5–4.6 (2.5–2.7); the dome stays inside the seated outline to 0.74 s
   (`dome-0.43-0.74-outline.png`, `dome-edge-x2-0.54-0.67.png`).
2. **The plate stays white** (`surfaceShadow` in the composite). The steam's shadow on the plate and the table is
   computed per full-resolution pixel in the composite: none where the fog itself stands in front of the
   surface (it reads offset, beside the fog), its optical depth the fog's extinction less what it scatters
   forward onto the surface (× 0.45), at most 0.16 of the light. The fog is lit as a dense white body:
   Wrenninge's octaves raised (0.45 / 0.18, the second's extinction 0.2), the white plate's bounce on the fog
   above it (its view factor, through the fog below it: a downward optical depth in the light volume's fourth
   channel), the key's optical depth 1.25× the light volume's (was 2.1×). Plate centre 0.48–1.0 s: −5 to +1
   levels (judge's frames −24 to −35); its shaded right side −10 to −19 (−42 to −79) (tell B).
3. **No waterline** (`STEAM_LOOK.underBand`). The undercut's foot, the stem and the wall material that rolls
   under the cap take a 1.7 cm band as the thermal rises (from 0.28 s of the thermal); the walls keep the
   young 2.5 mm edge. Part of the torn line was a lighting step (the cap's shadow on the base through the
   steeper key falloff), gone with fix 2. Strongest vertical step per column over the well at 0.74–0.96 s:
   median 1.8–2.2 levels, no column over 12 (judge's frames median 3.8–9.2, 26 % of columns over 12 at
   0.83 s) (tell C).
4. **Warm steam** (`keyTint`, `roomTint`). The march keeps the key's and the room's light apart (luminance each)
   and packs the key's share of each pixel (7 bits) beside its depth; the resolve carries the key's luminance
   through the history; the composite colours the steam by the share, each tint of unit luminance: the key as
   the white plate renders it under this rig (neutral), the room the greige cove, walls and table (#E2DBD0).
   Red − blue of the bright steam 0.48–0.99 s: **+6.3 to +7.9** (judge's frames +1.7), over the plate +6 to
   +8; the backdrop is +8.6 (tell F).
5. **The cap rolls up round a ring core and tears** (`ringFog`, `ringTube`). A tube of fog round the cap's
   edge (the ring's reach × 0.55, density 5) with the rolled sheet wound round it, shading its own underside
   (three analytic taps towards the key; the light volume carries its mean too); it holds its fog from ≈ 0.2 s
   of the thermal, tears round its circumference into a few lobes as a slow field's threshold rises, and has
   gone by ≈ 1.6 s. The dip between the ring's lit back and front arcs, through the cap's middle at 0.96–1.12 s:
   median 10–16 levels, best 22–29 (judge's frames median 0–7); torn into 3–5 lobes at 1.15–1.35 s
   (`roll-1.06-1.22.png`, `mushroom-0.99-1.76.png`, `cap-1.02-1.15-x2.png`).
6. **The return squeezes; the spill is a sheet** (`squeeze`, `spill`). On a change of mind the returning cover's
   shove is torn at two scales, the stirred fog breaks into lumps, and the wall's own boundary layer sweeps the
   centimetre next to the silver clear (it veiled the returning dome). The seating squeezes: from 0.1 s before
   the capture the air under the dome leaves the closing gap in puffs along the porcelain (≈ 5 cm, rising as
   they slow, gone in ≈ 0.3 s; their own field, not held by the capture), a few round the rim
   (`decline-0.5-return.png`: 0.67–0.80 s; tell E). The spill is a 3–6 mm sheet that wraps the raised rim's lip
   and climbs only a little way, torn into strips: the dome's right flank brightens by +0 to +1 levels at
   0.30–0.37 s (judge's frames +3 to +20, p90 +49) (tell D's wash). The march's step adapts in dense fog (at most
   ≈ 0.45 of optical depth): the speckle in the fog seen through the gap went with it.
7. **Cost.** See `cost.txt`: with the re-judge's `bench.ts`, **1.1–1.5 ms** at 1400² and 2000² over τ 0.3–2.2 s
   (1.1 / 1.4 / 1.3 at the re-judge's τ 0.3 / 0.6 / 1.2 s, against 1.7–2.1 for the integration build in the same
   session), the overlap case (two full clouds) 1.5–1.6. What paid: no bisection at the ray's entry (divergent:
   ≈ 0.9 ms alone); the scene depth keeps its target while the steam is only paused (`holdDepth`); a
   checkerboard march packed into a half-width target, the other half rebuilt by the resolve; budgets by
   phase (330 k pixels young, 200 k thin, × 0.45 with two clouds; steps 18 / 14 / 12, adaptive in dense fog,
   early exit at 2 %; probes 5); the peel's fetches only near the boundary. The main pass's own depth could not
   be reused: the stage draws it into the multisampled default framebuffer, which WebGL cannot sample.
   (Tooling, for the bench and the frames: `__steamFlags` turns single features off by bit, `__steamFull`
   marches every pixel, `__steamPixels` overrides the budget; `scripts/_scratch/gpu-bench.ts` takes
   `_`-joined variants such as `f256_s14`.)

**The tells** (the re-judge's 1–11 and A–G): gone — A (the ghost cloche: lobed wall, broken foot), B (the
smoked-glass plate), C (the waterline), F (cold steam), G (the felt on the aging cap), the rim spill's lump and
white wash (4, D's wash); improved — the roll (7: a legible ring core that tears), the return (10, E: puffs at
the seating and a torn shove, though the displaced fog still reads partly as a cap round the dome), the lighting
(5: warm and white, but light-to-shade across the lit body is still small, ≈ 5–20 levels), the silver under the
fog (11: the fog in front of it has a lobed edge, no crescent; its contrast is the fog's real occlusion);
remain — the fine 2–4 mm detail is at the march's resolution limit (1.2 mm a march pixel young) and partly
smoothed by the history; the crown's lobes are larger than the walls'. The temporal high-frequency noise at 1.6 s
is 0.54 levels rms (judge's frames 0.46): the checkerboard adds a little, no pattern. The same frame is
byte-identical across runs (the checkerboard's parity is the march's frame count).

**Tests.** `tests/dinner-steam.test.ts` 23 (new: the peel and the undercut; the colour and the budgets),
`tests/scene-depth.test.ts` 6 (new: a paused client keeps the target, one that lets go or leaves the scene frees
it), `tests/dinner.test.ts` 27; `tests/browser/dinner.spec.ts` 6/6, `tests/browser/scene-depth.spec.ts` 5/5,
`tests/browser/collection.spec.ts` 3/3; `pnpm typecheck` clean.

## Polish round 3: the third judge's fixes (`v1.6/steam-polish3`)

The third judge scored polish 2 **5 at laptop size, 5.5 at phone size**: the integration was fixed (white plate, no
waterline, warm colour, no crisp foot, ≈ 1.5 ms) but the body had become "a near-opaque, flatly lit cotton tuft that
turns into a hollow fog doughnut". Seven items: four for the signature (translucency, body light, edge as sheets, no
hollow ring), three to ship (a legible gush, no cap on the seated dome after a change of mind, τ 0.7 and two clouds
≤ 1.5 ms). Frames are the judge's own (`frames.ts`, laptop 1240² clip of 1280 × 720 @2, WARM 2000, phone 390 × 844 @3)
measured against its no-steam twins; the numbers are in `evidence/v1.6/steam-polish3/measurements.txt` (the new
measuring scripts in `evidence/v1.6/steam-polish3/tools/`), the cost in `cost.txt`.

1. **Translucency** (`cloudLook.core`, `.sheet`, `.sheetWidth`; `folds` in `cloud()`). The young fog's own density
   is 0.2 (polish 2: 2.2) and the mixing skin where it meets the room's air carries the outline (1.5, ≈ 6 mm wide),
   so the limb reads and the middle shows through; inside, the fog is folded into thin sheets drawn out along the
   rise (the ridges of the billow field's gradient noise). Transmittance (DEBUG 1 coverage) at the plate's far rim
   **0.33–0.41** at 0.48–0.74 s (polish 2: 0.03–0.08), through the core 0.28–0.40. The vapour summed over the frame
   against polish 1: **1.00× at 1.2 s** (polish 2: 1.61×), 0.86–1.03× from 0.54 to 1.28 s; 1.27× at 0.48 s, where the
   gush (5) adds what polish 1 did not have. The veil's density in the march is halved (`STEAM_LOOK.veilGain`): its
   wisps were lit for the old, dimmer key and made 40 % of the vapour at 1.2 s.
2. **Body light** (`STEAM_LOOK.key`, `keyFall`, `ms`, `room`, `bounce`; the light volume). Multiple scattering pulled
   back (octaves 0.45 / 0.18 → 0.18 / 0.06), the key stronger (0.95 → 1.55) and its optical depth through the cloud
   steeper (1.25 → 2.5×), the room a fill (0.22 → 0.12) that the cloud's own cover towards the window shades too. The
   light volume is finer (24³ → 28³) and read 1 cm towards the key (was 2.4 cm: a lit face read the shade behind it).
   The billows' own shade only on the boundary (inside a translucent fog it drew a mottled grey). The white plate's
   bounce lights only the fog close over it (the share of the sphere the plate fills, cubed) and in the key's neutral
   colour: the plate stays white through the composite's shadow suppression, not by flattening the fog. Dense body
   p5–p95 **42 / 52 / 60 / 59** levels at 0.61 / 0.74 / 0.80 / 0.90 s (polish 2: 26 / 17 / 17 / 24). The steam's own
   colour (DEBUG 14) lit flank − shaded flank +12 / +8 / +5 at 0.61 / 0.74 / 0.90 s: short of the 20–30 asked (the
   composite's flanks are confounded by the backdrop behind each). Plate centre −0 … +3, its shaded right −9 … −2
   (polish 2: −10 … −19).
3. **Edge as sheets** (`Xb`, `Xp` in `cloud()`; `EDGE.billow`, `EDGE.wisp`). The billows and the peeling layer are
   read in a material space drawn out 4× along the rise (was 1.6×), the peeling layer's isotropic 2–4 mm curls are
   gone (seen through the translucent fog they read as fur), its lobes finer (≈ 4.5 mm), the skin torn into strips
   along the flow and the torn sheets denser (`EDGE.wisp` 2.6). Anisotropy of the edge band (a structure tensor of the
   steam-only image band-passed 2–8 px): **1.3–2.1 : 1** (polish 2: 1.2–1.7; polish 1: 1.6–6); the 2–8 mm outline
   band 0.34–0.76 mm rms on the crown and the left wall, 0.5–2.0 on the right wall (a torn sheet doubles the outline
   at 0.61 s); lobes per 10 cm, walls 2.0–8.6, crown 4.1–5.5 (polish 2: walls 3.9–7.8, crown 3.4–4.7): the crown is now
   as fine as the walls, but the ≥ 6 asked is met only at 0.54 s and the ≥ 2 : 1 only on the right wall at 0.74 s.
4. **No hollow ring** (`cloudLook.capCore`, `uK`; `ringFog`). As the stem and base empty the cap keeps a fog of its own
   (0.24, thinning to 0.04 by 1.4 s), and the stem's core feeds it from below (the cap's fog reaches down the axis);
   the ring's own tube is lighter (5 → 1.5) and fades from 1.1 s (was 1.35 s). The cap reads filled over the plate
   (`pair-0.83-1.15.png`): no backdrop through a clean hole. The judge's dip measure: median **10–13** at 0.93–1.06 s,
   4–6 at 1.12–1.15, ≤ 3 from 1.2 s (polish 2: 10–16 to 1.12 s); the dips left sit between the cap's lower edge and
   the plate's far rim (rows y ≈ 650), not through the cap, but the ≤ 5 asked is not met before 1.1 s.
5. **The gush** (`GUSH`, `gushOut`, `gushRise`, `raisedGap`; `spill()` in the shader; `RESOLVE_FRAGMENT`). The raised
   gap's outflow is a curtain of puffs (the exchange flow pulses as the dome rocks up) leaving where the gap is
   widest, rolling ≈ 3.7 cm out over the plate's rim and rising as it slows (≤ 33 cm/s, drawn up by the hot dome's boundary layer), carried with its air (its
   noise moves out and up with each parcel), thicker where the gap was wider, gone by 0.56 s. Outside the cloche's
   silhouette at 0.29–0.37 s: **74–116 k px** over 8 levels (polish 2: 40–61 k), p95 **67–82** (polish 2: 24–30); on the
   cloche's flank p95 0, mean ≤ +0.1 (polish 2: p95 17–31). The resolve fills and denoises only from neighbours that
   saw the same opaque surface (the rim cut the half-resolution steam into stair-steps; `gap-x2-0.32-0.37.png`).
6. **No cap on the seated dome** (`cloud()`'s change-of-mind block, `captured`). The returning dome's wake drags the
   fog it comes down past along its wall and out at the rim: the band it clears widens from the silver to ≈ 6–10 cm
   as it comes down, so nothing stands on it when it seats (the seating's puffs at the rim stay); `captured` clears
   its band within ≈ 0.1 s of the seating. Over the crown and shoulders (3 cm above the rim and up) at 0.67–0.80 s:
   **43 / 1.5 k / 3.2 k / 4.7 k / 2.7 k px** over 8 levels, mean +0.1 … +3.9 (polish 2: 12 k / 27 k / 29 k / 27 k /
   21 k, mean +8 … +28); a thin veil (p95 7–15) remains 0.70–0.80 s (`return-0.67-0.83.png`).
7. **Cost** (`cost.txt`). Steps 18 / 14 / 12 → 15 / 12 / 11 (the march's span is bisected to the steam at both ends, so
   fewer steps cover it as finely), the young budget 330 k → 290 k pixels and × 0.45 → × 0.35 with two clouds, the light
   volume 28³ with 11 taps (32³ with 15 while fixing 2), the gush's tongues analytic. With the judge's `bench.ts`, in the
   clean runs (load 4–8): **1.3–1.5 ms** for one cloud at τ 0.3 / 0.6 / 0.7 / 1.2, two clouds **1.5–1.8** at 1400² and
   1.5–2.3 at 2000²; runs under contention read 3–6× and are listed apart. The two-cloud case is fixed costs (the
   flow map per clock, the light volume, the resolve): halving its pixels does not move it. Not reliably ≤ 1.5 ms.

**Kept** (same frames): no waterline (steam-only step median 1.6–1.8, p90 2.4–4.1), the foot (1.6–2.5), the colour (the
bright steam's R − B +5.6 … +7.3, no drift to +9.7; over the plate +1.2 … +3.1, was +4 … +8.4: no ivory cast; the room's
tint is warmer, #E6D7C0, since it is a smaller share of the light), determinism (the same frame byte-identical across
runs), the clocks and `STEAM_END`, zero cost with no steam, the end (5.95 s within 2 levels of the clean frame).
**Regressed:** the edge's temporal noise early in the hold, 1.1 levels rms at 0.58–0.67 s (polish 2: 0.8–0.9; the same
from 0.9 s); the translucent fog shows its sampling. 40 steps take it to 0.7; no jitter, a step aligned to the ray, no
checkerboard and a slower history did not.

**The tells:** cotton wool — improved (translucent, the far rim and the well read through, sheets inside; at 1:1 the
edge still reads partly fibrous); flat lighting — improved (p5–p95 doubled; the lit/shaded flank still small); too much
vapour — gone (1.00× polish 1 at 1.2 s); the fog doughnut — improved (the cap is filled; the dip measure still 10–13 to
1.06 s); the release under-reads — gone (a gush twice the area, no wash, no white bowl, no stair-steps); a cotton cap on
the seated dome — mostly gone (a thin veil 0.70–0.80 s); the reflection in the silver — remains (not attempted).

**Tests.** `tests/dinner-steam.test.ts` 25 (new: the translucent body, the cap's fog and the light's balance; the gush,
its path, its speed and its box), `tests/scene-depth.test.ts` 6, `tests/dinner.test.ts` 27; `tests/browser/dinner.spec.ts`
6/6, `tests/browser/scene-depth.spec.ts` 5/5; `pnpm typecheck` clean.

## Polish round 4: the structural round (`v1.6/steam-polish4`)

The fourth judge scored polish 3 **5.5 at laptop size, 6 at phone size** and diagnosed a design limit: translucency,
strong self-shadowing and crisp stretched sheets together need a thin, dense, intermittent field, and a half-resolution
11–15-step single-scattered march through a noise-carved field at ≈ 1.3 ms cannot sample one without grain or boil;
every polish round had moved along the same trade-off (opaque and flat ↔ translucent and grainy). **The budget
decision (orchestrator, 2026-10-05, budgets waived by Surya): ≤ 3.0 ms while steam shows, at the laptop and phone
sizes, the Dinner frame still pacing at 60 fps (p95 ≤ 16.8 ms); zero with no steam.** This round rebuilt the field, the
sampling and the light on the judge's prescription, in six steps, each its own commit measured with the judge's own
`frames.ts` and scripts (laptop 1240² clip of 1280 × 720 @2, WARM 2000; the judge's no-steam twins, byte-identical to
this build's): `evidence/v1.6/steam-polish4/measurements.txt` (the new scripts in `tools/`), `cost.txt`.

Sources for the design: temporal integration with reprojection and per-step energy-conserving integration (Hillaire,
*Physically Based and Unified Volumetric Rendering in Frostbite*, SIGGRAPH 2015; *Physically Based Sky, Atmosphere and
Cloud Rendering in Frostbite*, 2016); remapped, eroded density and a history reprojected and clamped (Schneider & Vos,
*The Real-Time Volumetric Cloudscapes of Horizon Zero Dawn*, SIGGRAPH 2015: their 1/16-of-the-image-per-frame is for
distant, slow clouds; this steam is close and fast, so every pixel is marched every frame and the history smooths, it
does not reconstruct); multiple-scattering octaves (Wrenninge, *Art-Directable Multiple Volumetric Scattering*,
SIGGRAPH 2015), here only on the lit side; Bauer, *Creating the Atmospheric World of Red Dead Redemption 2* (SIGGRAPH
2019: raymarched volumes amortised by temporal accumulation); Houdini pyro's
disturbance and shredding (sheets drawn out along the velocity, torn where the noise is low). The step-exact integration
of a thin feature (a feature's antiderivative over a step with the field taken as linear along it) is this round's own.

**What the design is now, and why.**

1. **The field: thin dense sheets with clear air between** (`cloud()`, `cloudLook.fold`, `.foldWidth`, `.haze`). The
   body is no longer a fog carved by noise: it is the zero set of a smooth two-octave sheet field (the noise texture's
   green channel is now two octaves, so a sheet is a surface folded at its cell's scale, not felt), read in its own
   frame (cells ≈ 3.7 cm across, 2× that along the rise, folded by the large field, carried, stretched and rolled with
   the air by the flow map), a Gaussian sheet ≈ 3–5 mm thick, `fold` (10×) the core's density inside it, a haze of half
   the core between; the sheets gather where the large field is high (intermittent, clear air between) and are torn
   where the billow field is low (veils and strands, not curtains). The mixing skin is light (0.6 → 0.3 young: the dense
   skin round a thin body was the judge's limb-dense "bubble"). The envelope is softer (≈ 6 mm young, was 2.5 mm): the
   sheets that cross it carry the outline. The crown is drawn up into the lifting dome's wake: its boundary frays into
   upward tongues ≈ 5 mm across and up to 1.3 cm tall (fast across the flow, slow along it), its top band 1.2 cm, fading
   by ≈ 0.5 s of the thermal. The peeling layer keeps only its torn sheets outside the boundary (its ±5 mm isotropic
   lobes went, and its cost).
2. **The sampling: integrated, not point-sampled.** What made the grain and the boil was the march jittering in and out
   of sharp features: a 2.5 mm boundary, a 3 mm sheet, a torn wisp, each crossed by a 3–8 mm step. Each is now averaged
   over the step exactly, the field taken as linear along it (`stepMean`, `gaussMean`: the antiderivatives of the
   smoothstep and of the Gaussian, Winitzki's erf; the ray keeps each clock's last value of the sheet field, the
   boundary's signed distance and the torn-sheet field): a sheet seen face-on by a long step contributes its exact
   optical depth, edge-on it is a bright fold line, and nothing is aliased whatever the step. Every pixel is marched
   every frame (the checkerboard only on the Low tier), 28 / 22 / 16 steps (dense / thin / veil; no step under 2 mm),
   budgeted by the steam's **footprint on screen** (its box's projection), ≤ 120 k march pixels and ≤ 0.31 per CSS
   pixel of it (a 3× phone's buffer packs four times the laptop's pixels into a CSS pixel: both march the same detail
   per CSS pixel and cost the same). The temporal resolve keeps the reprojection through the flow (the dominant
   clock's material coordinates, the previous frame's forward map and camera), blends 0.1, takes half of the new
   frame from its same-surface neighbourhood (a light denoise before the blend), clips the history to the
   neighbourhood's mean ± 1.25 σ, and is scissored to the footprint. Where it has no history (the first steam frame, a
   change of mind, a capture at another size, a jump of the clock) it builds one at once from four marches with their
   own jitter (a running mean), so a still is never one noisy frame; the jitter is seeded by the steam clock, so a
   capture at a given τ is byte-identical across runs (checked). (A Catmull-Rom upsample in the composite was tried:
   sharper, but it raised the temporal grain to 0.96: not kept.)
3. **The light: a terminator, and sheets that shade each other.** The multiple-scattering octaves now light the bright
   side only (their extinction 0.9 and 0.7 of the key's, was 0.35 and 0.2: with the key's shadow they were what made the
   body flat: without them lit − shaded was +39 against +16); the room's fill is occluded by the cloud towards the
   window (its shaded flank keeps ~15–20 levels over the cove instead of vanishing into it); the key is brighter (1.55
   → 2.0) and falls 3.8× the light volume's depth (was 2.5×); the light volume is finer (32³, was 28³); and each sample
   integrates the sheet field 1.5 cm towards the key (one fetch, the same Gaussian integral), so a sheet shadows the air
   behind it, which the 1.5 cm voxels cannot see. The white plate's bounce on the fog just over it is stronger (0.9 →
   2.0, still the cube of its share of the sky: the plate stays white, centre +0…+4). `__steamDebug 15` shows the key's
   transmittance.
4. **The cap and its stem.** The cap's own fog reaches down a stem as wide as the well until the cap has formed (fading
   over 0.7–0.95 s of the thermal), the base follows a fifth of the rise (`CLOUD.base` 0 → 0.2) and the stem narrows half
   as much (0.3 → 0.15): the cap stays joined to the plate. The plate's veil is a full column while its first rush is
   strong (emitted before 0.6–0.9 s), ribbons after; its gain 0.5 → 0.35 and the late cap thinner keep the vapour. A
   denser rolled ring tube was tried for a visible roll: it read as a band and deepened the dips: not kept. The roll is
   carried by the sheets folded round the ring's core.
5. **The return.** What the judge saw as an arc over the crown at 0.70–0.80 s was fog *behind* the returning dome, which
   this elevated camera sees over its crown: the seating's puffs at the back rim rising 4.5 cm, and the cloud's far
   side. The puffs now stay low (≤ 1.5 cm) and none leave behind the dome as the camera sees it (those in front, at the
   rim, stay); the dome's wake clears up to 1.9× further behind it; and a final sweep from 70 ms before the seating
   carries off what is left over its crown and shoulders out to ≈ 15 cm (behind it from the plate up).
6. **The cost.** The march is bound by each ray's serial work more than by its pixel count (10 k march pixels cost
   ≈ 0.8 ms of the 1.3–1.8 at 120 k), so the steps are what is paid for: 28 / 22 / 16 (the integration keeps the quality:
   grain and anisotropy are the same at 28 as at 32), 3 occupancy probes and 2 + 2 bisections (was 5 and 3 + 3:
   ≈ 0.4 ms), and with two clouds (a change of mind: every sample evaluates both) two thirds of the steps and 0.4 of the
   pixels.

**Numbers** (the judge's scripts on the final build; polish 3 in brackets; `measurements.txt`):

- (1) Body grain (tn2) at 0.58 / 0.67 s: temporal **0.84 / 0.74** (1.70 / 1.47); spatial 1.01 / 1.09 (1.42 / 1.23),
  of which the steam over the cove (rows above the plate's far rim, 12 k / 7 k px) **0.74 / 0.65** and the plate's far
  rim seen through the fog (4.6 k / 5.5 k px) 1.51 / 1.47: the rim's own lines (2.25 in the clean frame) at the
  transmittance asked for. Far-rim transmittance **0.31–0.39** at 0.48–0.74 s.
- (2) Own colour (DEBUG 14) lit − shaded **+28 / +23 / +22** at 0.61 / 0.67 / 0.74 s (+12 / +8), a coherent gradient
  left to right (`own-colour-0.61-0.74-levels180-255.png`, `key-transmittance-0.61-0.74.png`); eroded interior (s8)
  p5–p95 **57 / 55 / 46** (52 / 27).
- (3) Coverage by depth from the outline (`tools/cov.py`, DEBUG 1) at 0.54–0.74 s: 4–16 px 0.16–0.21, 16–32 px
  0.31–0.40, 32–64 px 0.60–0.65, 64–128 px 0.74–0.75; core / 1–2 cm ring **1.25–1.42** (0.81–0.82): coverage rises to
  the core, no shell.
- (4) Edge anisotropy (DoG 2/8) at 0.54–0.74 s: right wall 1.63–2.01, crown 1.33–1.81, left wall 1.90–2.23
  (1.41–2.06 / 1.30–1.52 / 1.35–1.43). **Not met on the crown**: its band (8–40 px under the top outline) holds the
  wake's tongues and the vertical sheets (gx² > gy²) but also the tops of the tongues and the folds over the crown;
  a sharper crown band, finer tongues and striations along the rise were tried (1.24–2.0); taller tongues (2 cm) reach
  1.69–2.18 on the crown but the temporal grain rises to 1.00: the trade-off was left on the grain's side.
- (5) The dip through the cap, 0.93–1.25 s: **4 / 9 / 8 / 5 / 5 / 5 / 0 / 3 / 3 / 0** (10 / 10 / 13 / 13 / 10 / 9 / 4 / 6 / 3
  / 0). The two left over 5, at 0.96 and 0.99 s, are the lifted cloche's shadow across the cloud's lower left (luma
  202–210 at rows 660–737, x 560–640; `tools/dipwhere.py`), not a hole: the cap is joined to the plate.
- (6) The return (decline at 0.5 s), over the crown and shoulders: **0 / 0 / 0 / 0 / 0 / 0 px** over 8 levels at
  0.67–0.83 s (43 / 1512 / 3221 / 4729 / 2747 / 0); the puffs at the front rim remain (`return-0.64-0.83.png`).
- (7) Cost (`cost.txt`): laptop 1280 × 720 @2 **0.8–2.0 ms**, two clouds 2.3; phone 390 × 844 @3 (its buffer at the app's
  dpr cap 2) **0.7–2.6**, two clouds 2.4; the judges' squares 1400² 1.9–2.9, 2000² 2.0–3.0. The whole Dinner frame with
  steam, p50–p95, laptop 3.2–4.9 ms, phone 2.5–4.9 (without 1.8–2.4). Real-time pacing of the whole accept (`tools/pace.ts`, three accepts each):
  **p95 16.7–16.8 ms, max 16.8, no frame over 20 ms**, laptop and phone. Zero with no steam (unchanged).
- (8) The roll: the cap is folded sheets now, not a featureless blob, but no distinct rolled lip (`cap-roll-0.93-1.25.png`).
- Kept: the gush 74–126 k px outside the silhouette at 0.29–0.37 s, p95 64–78, the flank unwashed (0); vapour 0.87–1.14×
  polish 1 (1.21 at 0.48 s with the gush; polish 3 1.27); plate centre +0…+4, its right −2…−9; no waterline (median step
  1.3–1.6); warm colour (R − B +5.3…+6.6); the dome's shape (IoU with the seated dome 0.46 / 0.55 / 0.48 / 0.45 / 0.42 at
  0.48–0.74 s, polish 3 0.46 / 0.53 / 0.47 / 0.44 / 0.40); the end (5.95 s within 2 levels of clean); determinism; the
  clocks; `STEAM_END`; reduced motion; the Low tier (checkerboard, 60 % of the steps). Where the summary header of
  `measurements.txt` disagrees with its own rows (own colour +27 at 0.61 s, coverage 1.25–1.54, the right wall 1.62–2.11,
  warmth to +6.7, IoU 0.45 at 0.48 s) the figures here are the rows'.
- Also gone: the salt-and-pepper over the cloche's dark reflections at 0.43–0.48 s and the gap's grey mottle at 0.32–0.35
  s (`speckle-1to1-0.43-0.48-p3left-p4right.png`, `gap-1to1-0.32-0.35-p3left-p4right.png`). Not changed: bright steam
  (> 40 over the cove) 9–27 k px at luma 222–226 (polish 3 6–31 k at 218–228): translucent white steam over a 192-level
  cove composites to ≈ 225 at most; only an opaque body (polish 2) reaches 230+.

**What a fifth judge would still see** (the owner's view): the steam reads as layered translucent veils with fold lines
rising from the plate (`c38-1to1-p3-p4.png`, `laptop-real-0.608.png`), no felt, no boil; but at 2× it is **soft** (the
march is ≈ 0.55 march pixels per CSS pixel, and sharpening it brought the grain back), the crown's edge is not yet
2:1, the dome's shape at 0.55–0.75 s reads as a mound with a frayed top more than as the cloche's outline, the cap has
no distinct rolled lip, and the lifted cloche's shadow leaves a grey band across the cloud's lower left at 0.96–0.99 s.

**Tests.** `tests/dinner-steam.test.ts` 25 (changed: the young band under 7 mm widening 2×, was under 3 mm widening
2.5×; the body's sheets denser than the haze between them and than the skin, was the skin 4× the core);
`tests/scene-depth.test.ts` 6, `tests/dinner.test.ts` 27; `tests/browser/dinner.spec.ts` 6/6,
`tests/browser/scene-depth.spec.ts` 5/5; `pnpm typecheck` clean.

## Polish round 5: constants and resolution (`v1.6/steam-polish5`)

The fifth judge scored the structural round **6 at laptop size, 6.5 at phone size** and listed six items, mostly
constants, the sixth the softness at 2× that the 3 ms march could not resolve. **The budget decision (orchestrator,
2026-10-05, the last steam round): ≤ 6.0 ms while steam shows, at laptop 1280 × 720 @2 and phone 390 × 844 @3, the
Dinner frame still pacing at 60 fps (p95 ≤ 16.8 ms); zero with no steam.** Each item is its own commit, measured with
the judge's `frames.ts` (laptop 1240² clip of 1280 × 720 @2, WARM 2000) and its scripts, its no-steam twins
byte-identical on this build; the scripts this round added are in `evidence/v1.6/steam-polish5/tools/` (`rise.py`
recovers the judge's centroid and mass: on its own frames it gives its 672 → 616 rows and 6.56 / 2.02 M exactly).
Every number below is in `evidence/v1.6/steam-polish5/measurements.txt` (final code; polish 4, 3 and 2 on the same
scripts for reference) and `cost.txt`.

**1. The bounding-box clip** (`models/dinnerSteam.ts` `sync`, the march's probes). The straight cut down the cloud's
right flank was not the field leaving `steamBounds`' box (its margin holds the field: with a box 0.3 su wider the
frames differ there only by the sampling's noise). The per-clock march boxes carried the steam's *shadow's* reach (to x 2.2, z −2.4 su), so a ray's span
through them was 2–3× the steam's, and the march's three occupancy probes, that far apart, stepped over the flank where
the ray grazes the cloud: the cut sat where the front box face's probe spacing outran the flank's chord. The march's
boxes now stay on the steam (the shadow's reach is the composite's and the light volume's only), and the probes are at
most 0.3 su apart (3–12). **vcut 0 px in every frame 0.83–1.31 s** (was 37 px at 1.024 s, a median step of 7 levels);
`vcut2`'s runs are 11–43 px, the cap's rounded right flank at ≤ 2 levels a pixel (the box face was 44–64 px, 13–17
levels across 3 px); the phone's cut is gone too (`boxcut-1to1-1.024-1.184-p4top-p5bottom.png`,
`boxcut-laptop-css-1.024.png`).

**2. The decline's rim puffs** (`squeeze`, `SQUEEZE` in `steam.ts`). The 30 k px that went in one frame at 0.832 s
were the seating's puffs in the *cover's* frame: the decline lifts the dish 46 cm in 0.3 s and they left their box at
the seat with it. They are now in the room's air where they were squeezed out (riding the descending cover before the
capture, as before), drawn up a few centimetres in the dish's wake (≤ 4 cm, those over the porcelain most), with the
strength the fog had at the seating and their own fade (≈ 10 % a frame) to nothing by `SQUEEZE.life` (0.62 s); the
clock that carries them outlives them (`leftSteamEnd`). **Area over 8 levels 45.8 k at 0.816 s, 49.5 k at 0.832 s,
peaks 51.2 k at 0.848 s, then −7…−26 % a frame down to 2.5 k at 1.136 s (max 13 levels)**; the last 2.5 k px of the faint tail (≤ 12 levels)
lose 36–49 % a frame and are gone by 1.22 s. The target (no frame losing over 30 % of the puffs' area) holds while
they show at 13 levels or more. Over the seated dome's crown still 0 px (`decline-puffs-0.784-1.120.png`).

**3. A held dome, then the crown frays** (`CLOUD.hold`, `dragHeld`, `heldDrag`, `crownFray`). What spread the
trapped steam past the seated outline at 0.45–0.65 s was the dome's drag (the crown drawn up 2.5–3.6 cm and 7 mm along
its path at once, from the lift-off) with the wake's tongues on it. The crown's air now takes up only 20 % of the
drag while the fog holds the dome's shape (≈ 0.8 cm on the axis: the air's inertia; the wake's suction has not yet set
it moving), the rest catching up over 0.6–1.03 s; the wake's tongues come with the catch-up (`crownFray`, 0.6–0.78 s)
and go as the cap rolls. **Inside / outside the seated outline 50 / 19 / 7.5 / 3.2 / 2.3 / 1.9 / 2.1 / 1.9 at
0.45–0.67 s** (polish 4 1.0–1.3), then 1.5 / 1.2 / 1.0 at 0.70 / 0.74 / 0.80 s as the crown frays: ≥ 1.6 for 0.22 s
after the rim clears the cloud's side (the release, 0.40–0.45 s). Inside brightening 47–63 (31–50). IoU with the
seated dome **0.83 / 0.78 / 0.66 / 0.55 / 0.45** at 0.48–0.74 s (0.46 / 0.55 / 0.48 / 0.45 / 0.42). The envelope's
gradient at the outline (`soft.py` oedge, a proxy: the judge's script was not kept) 1.06 / 1.07 / 1.20 at 0.54 / 0.58 /
0.61 s (polish 4 0.82 / 1.09 / 1.03): ≥ 1.2 only from 0.61 s (`dome-0.48-0.80-brightening-outline.png`, the seated
outline in red, the outside band blue).

**4. It rises away; a rolled lip** (`CLOUD.riseW/riseStart/riseMix`, `centre`, `erode`, `evapFrom/evaporate`,
`stemFade`, `STEM_HEAT`, `capCore`, the ring). The thermal peaked at 16 cm/s (not the 22 the record said) and its cap
evaporated where it stood. Now a stronger buoyant thermal under the 25 cm/s ceiling (23.9 cm/s peak, 1.4 cm in its first
0.2 s, 14 cm by 0.8 s), its edge lagging less (centre 0.25, was 0.38), slower erosion (0.3–1.8 s of the thermal, was
0.2–1.3) and evaporation from 25 cm over 25 cm (was 15 / 15); the stem's share of the fog goes sooner (0.45–0.7 s of
the thermal) and the base evaporates over the hot plate only while it is still low over it. The cap gathers the dome's
fog as the core empties (0.17 → 0.25) and keeps it to ≈ 1.4 s, and the air the thermal carries up from the dome's
lower half into the cap is the cap's, with its fog (without that the cap was a smoke ring, a thin lid over a hollow:
the ring's centre 0.11–0.24 of its rims). The ring's tube is narrower (0.42 of its reach, was 0.55) and stays whole
while it rolls (tears from 0.75 s of the thermal, was 0.45). **Centroid (B > 10 above row 760) 704 → 521 rows by
1.2 s: 6.8 cm** at 27 px/cm (polish 4: 672 → 620, 1.9 cm); top 604 → 245 rows; **the cap's mass at 1.38 s 104 % of
its 0.99 s** (7.81 / 7.53 M; polish 4 31 %). **The lip** (`lip.py`: the ring's core projected, at the cap's right side):
the tube +21.6…+22.0 levels over the notch inside it at 1.06–1.22 s (target ≥ 15), +6…+8 over the notch under it; the
ring's centre 0.35–0.45 of its rims (a filled cap). The dip through the cap (`o_ringprof.py`) median 0–6, best 9–26
levels: the notch under the lip. Vapour 0.79–0.91× polish 1 to 0.74 s, 1.20× at 0.99 s and **2.0–2.3× at 1.2–1.3 s**
(the cap rising away where polish 1's had thinned: the judge allowed it) (`cap-css-1.056-1.120-1.216.png`,
`lip-1to1-1.056-1.120-1.216.png`, `guest-css-0.45-1.38-p4top-p5bottom.png`).

**5. A brighter lit side** (`STEAM_LOOK.key` 2.0 → 3.2, `bounce` 2.0 → 1.5). The lit steam's own colour sits above the
plate's white now (≈ 249–250 against 241 after the neutral tone mapping); the plate's bounce on the fog just over it is
smaller so the plate's middle stays within +4. **Bright steam (B > 40, luma > 215) 23 / 35 / 41 / 41 / 28 k px at a
mean of 226–228** at 0.48–0.74 s (polish 4 7–27 k at 225–226; polish 2 53–100 k at 230–237); **at luma ≥ 232 7–12 k px**
(polish 4 1–5 k; polish 2 25–91 k). **Not met** (≥ 232 over ≥ 40 k px). With the denser held dome alone the key gave
40–53 k at 230–231 (19–26 k at ≥ 232); item 6's density cut, for the far rim's transmittance, took half of that back.
The limit is the translucency: the visible steam's coverage is 0.6–0.93 (median 0.8) over a 155-level backdrop, so a
composite of 232 needs an own colour ≥ 251, at the tone curve's shoulder (a key of 4.5 brought the own colour to 252 and
the bright set only to 26–44 k at 228–229, and flattened the body). Plate centre +3…+4, right 0…−10.

**6. The march's resolution, the steps, the history, the crown** (`cssDensity`, `maxScale`, `marchPixels`,
`thinPixels`, `steps`, `denoise`, `tongue`; the budget over the march's own boxes). The march is 0.5 a side of the
buffer (was 0.338 at the laptop, 0.278 at the phone): **0.82 march pixels per CSS pixel at the laptop's 1.65× buffer,
0.85 at the phone's 2×** (0.56 before); 34 / 28 / 20 steps (were 28 / 22 / 16); the new frame's same-surface denoise
0.25 (was 0.5); the crown's tongues up to 2 cm (1.3); the pixel budget spent over the steam's boxes, the scissor still
over the composite's. **Not taken:** one march pixel per CSS pixel at the laptop (0.607 a side) cost 6.5 ms at the held
dome, and at 20 steps (to fit) its temporal grain was 1.15; a tighter or looser history clip (γ 1.0–3.0) and a lower
blend raised the grain without sharpening; a Catmull-Rom upsample gave +0.03 of fine detail for +0.09 of grain;
thinner, denser sheets +0.04 for +0.1. **Sharpness** (`soft.py`, proxies calibrated on the judges' frames; the fifth
judge's own scripts were not kept): the edge band's median gradient 1.01 / 1.06 / 1.00 / 0.73 / 0.55 levels/px at
0.54 / 0.58 / 0.61 / 0.67 / 0.74 s (polish 4 0.72 / 0.73 / 0.75 / 0.71 / 0.58; polish 3 1.21 / – / 0.96 / 0.76 / 0.65),
at the outline 1.06 / 1.07 / 1.20 / 1.45 / 1.39 (0.82 / 1.09 / 1.03 / 0.93 / 0.83), detail under 1.5 px 0.44 / 0.43 /
0.44 / 0.58 / 0.51 rms (0.45 / 0.48 / 0.48 / 0.51 / 0.47; polish 3 0.81 / – / 0.66 / 0.64 / 0.57). **Not met** (≥ 1.2,
≥ 0.6): +35–45 % on the body's gradient at 0.54–0.61 s, −2…+67 % at the outline, the finest detail −8…+14 %. **Grain over the backdrop**
temporal 0.82 / 0.77 / 0.53 at 0.58 / 0.67 / 0.90 s, spatial 0.94 / 0.63 / 0.44 (polish 4 0.86 / 0.64 and 0.74 / 0.65):
within 0.9 but the spatial at 0.58 s (+0.04). **Crown anisotropy** (DoG 2/8) 1.35 / 1.05 / 1.04 / 1.29 / 1.22 / 1.31 at
0.54–0.86 s: **not met** (polish 4 1.33–1.81); the walls 1.33–2.76 (`dome-edge-x2-0.54-0.61-0.67-p4top-p5bottom.png`).
The far rim seen through the denser held dome went to 0.23: the young core 0.2 → 0.19 and the base's share of the
density 0.55 → 0.35. The gush's last tenth of light (0.5–0.56 s) cost 2.7 ms of the judges' 1400² frame at the finer
march: it fades by 0.5 s (0.34–0.5, was 0.36–0.56).

**Kept / changed of what had passed:** far-rim transmittance **0.43 / 0.37 / 0.35 / 0.34 / 0.39 / 0.47** at 0.43–0.74 s;
coverage still rising to the core (core / 1–2 cm ring 1.06–1.10, polish 4 1.25–1.42); the return's crown 0 px; no specks
(0.43–0.48 s at 3×); the gush 28–122 k px outside the silhouette at 0.19–0.37 s, p95 48–81, the flank's p95 0–1 (as polish 4); the white plate
(centre +1…+4, right 0…−10); no waterline (median step 1.1–1.6, 0 % over 12); eroded interior s8 p5–p95 99 / 78 / 58
(polish 4 57 / 55 / 46); determinism (re-renders byte-identical); the clocks, `STEAM_END`, reduced motion (the tests);
the Low tier (checkerboard, 60 % of the steps; grain 0.62 / 0.67 at 0.61 s); no pops (no frame's change over 1.8× its
neighbours', 0.32–1.44 s); the end (5.95 s within 2 levels of clean; wisps to 5.1 s, ≤ 20 levels). **Lost: the own
colour's terminator** (`own.py`, lit − shaded) +1 / +1 / +3 at 0.61 / 0.67 / 0.74 s (polish 4 +28 / +23 / +22): it was
the drawn-up crown shading the cloud's centre-right below it (with the drag restored, +17 at 0.61 s), and the brighter key
puts both sides near the tone curve's shoulder; the composite still shows the lit side over the shaded (brightening
+28 / +52 / +51, polish 4 +39 / +65 / +60). Warmth R − B +4.2…+4.8 (polish 4 +5.3…+6.6): the neutral key is a larger
share of the light.

**Cost** (`cost.txt`; p10 of the frame with steam less without, laptop and phone at their real buffers): **laptop
1.1–4.2 ms**, two clouds 3.1; **phone 1.3–5.1 ms**, two clouds 2.8; the judges' squares 1400² 3.0–5.2, 2000² 3.1–5.5
(polish 4: 0.8–2.0, 0.7–2.6, 1.9–2.9, 2.0–3.0). The whole Dinner frame with steam p50 3.4–7.8 ms. **Real-time pacing
of the whole accept: p95 16.7–16.8 ms, max 16.8, no frame over 20 ms**, laptop and phone, three accepts each. Zero
with no steam (unchanged: the scene-depth specs). (The fifth judge's bench opened its page at deviceScaleFactor 1, so
its "laptop" ran a 1280 × 720 buffer; `tools/bench.ts` takes `DSF`.)

**What a sixth judge would see** (the owner's view): the trapped steam now stands in the cloche's shape for a fifth of
a second as the cloche clears it, then its crown frays and the whole of it rises away as a thermal, a filled cap with a
rolled lip at its edge, and thins out high in the frame by 1.6 s; no cut, no pop at the seating. It is still **soft at
2×** — the march is finer and the grain lower, but the converged image of an integrated, translucent field is as smooth
as its structure, which is centimetre-scale: polish 3's "crisper" edge was grain (with no history at all this build
reaches 1.22–1.34 / 0.60–0.76 on the same proxies, at a temporal grain of 1.2). The crown is not streaked 2:1, the lit
side composites to 226–231 rather than 232+, and the own colour's terminator is gone; the cap at 1.2 s could read to
some eyes as a vortex ring (that is what a thermal is), and there is about twice polish 1's vapour as it rises.
**Whether the rest is reachable with this approach:** the constants are near their limits. Hollywood-crisp steam needs
millimetre filaments that survive integration — a density advected per frame at ≈ 1–2 mm (a 128³–256³ simulated or
advected volume, or a separate high-frequency filament pass) and many more samples per pixel; at this resolution
budget that is not reachable in 6 ms, and the bright side is bounded by translucency at the neutral tone curve.

**Tests.** `tests/dinner-steam.test.ts` 25 (changed: the drag — under 1.5 cm on the axis during the hold, 1–4 cm by
1.2 s, the hold's timing; the held dome's top 0.5–5 cm, was 1–5; the rise ≥ 12 cm by 0.8 s of the thermal; the cap
within 1.15× the plate's radius by 1.3 s, was the plate's; the cap keeping its fog to 1.4 s; the base's slump lifted
≤ 1.35 cm; the base's density over 0.3; the gush gone by 0.5 s; the leftover clock outliving its seating's puffs);
`tests/scene-depth.test.ts` 6, `tests/dinner.test.ts` 27; `tests/browser/dinner.spec.ts` 6/6,
`tests/browser/scene-depth.spec.ts` 5/5 (fresh server); `pnpm typecheck` clean.

## Polish round 6: the condensate's envelope, the terminator, the cost at the real framing (`v1.6/steam-polish6`)

The sixth judge scored polish 5 **6.5 at laptop size, 7 at phone size**: the beat works (it accumulates in the cloche's
shape, holds it, rises off as a thermal with a rolled lip, nothing clips or pops) and the softness at 2× is this march's
design limit; but past one second the cloud behaved like smoke, not condensate, its own lighting had gone flat, the gush
faded in place and the laptop's cost was over budget at the app's real framing. Same budget: **≤ 6.0 ms at laptop
1280 × 720 @2 and phone 390 × 844 @3, the whole frame pacing at 60 fps, zero with no steam**. Every number is in
`evidence/v1.6/steam-polish6/measurements.txt` (final code; "before" is the judge's own polish-5 frames on the same
scripts) and `cost.txt` / `pacing.txt`; the round's scripts are in `evidence/v1.6/steam-polish6/tools/` (the judge's
`frames.ts`, `bench6.ts`, `pace.ts` and `py/clip.py`, polish 5's scripts, and `env.py`, `capw.py`, `gushc.py`, `dark.py`,
`motion.py`, `own_lin.py`). Laptop clip as the judge's (1240² of 1280 × 720 @2, WARM 2000); its no-steam twins are
byte-identical on this build in the scene; re-renders byte-identical.

**1. The condensate's envelope** (`CLOUD.recede`, `recedeTime`, `recedeCrown`, `recedeWeight`; `capCore`; `erode`,
the shader's edge-weighted erosion; `core`'s emptying 0.25–0.75 s of the thermal; `life` 2.0 → 2.4, `fadeOut` 0.6 → 1.0;
`riseW` 2.4 → 2.3; the veil's `evaporate` 0.85 → 0.7, `decay` 0.4 → 0.8, `tail` 0.55 → 0.5). The visible boundary now
recedes into the cloud from 0.3 s of the thermal (material space, up to 4 cm, time constant 0.4 s: 2.1 cm by 1.0 s,
3.4 cm by 1.4 s), the crown's leading face 70 % less than the sides and the base; the vortex ring's core moves in with it;
the march's and the light volume's mean take the same receded edge. The cap no longer gathers the dome's fog
(0.17 → 0.25 was the mass gain the judge saw): it loses 45 % of it over ≈ 0.5 s from 0.45 s of the thermal and keeps the
rest to its fade (1.6–2.6 s); the erosion's holes are the edge's (the core takes 0.4 of it) and slower (to 2.2 s).
**Visible mass (the judge's Σ B over B > 8)**: the frame without its gush (its gush-off twin) **peaks at 5.11 M at
0.74 s**; the frame itself 5.12 M at 0.74, 4.53 at 0.86, 4.08 at 0.99, 3.63 at 1.12, 2.85 at 1.25, 2.48 at 1.31,
2.14 at 1.38, 1.72 at 1.50, 1.05 at 1.79, 0.44 at 2.24 s — **falling at every frame after 0.74 s, half of the
condensate's peak by 1.30 s, the worst 0.3 s window −43 %** (1.38 → 1.66 s) (before, on the same Σ B: 7.58 at 0.99 → 8.89 at
1.12 → 7.47 at 1.41 → 1.31 M at 1.73 s, −82 % in 0.32 s). The frame's own peak is the carried gush's, 6.49 M at 0.48–0.54 s
(item 4). **Edges first**: the edge band's brightening falls to 0.67 / 0.57 / 0.46 / 0.38 of its peak at 0.86 / 0.93 /
0.99 / 1.06 s while the core's holds at 0.62 / 0.58 / 0.59 / 0.59; the cloud alone (no gush, no veil) shrinks with its
mass from 0.99 s (130 → 108 → 92 → 71 → 46 k px at 0.99–1.50 s). **Not met as the judge may measure it**: the whole
frame's visible area still grows to 1.25 s (95 → 158 k px) as the plate's veil rises into view behind the thinning cloud,
then falls (37 k at 2.24 s). **Vapour vs polish 1** at 1.20 / 1.28 s **0.77 / 0.80×** (target ≤ 1.2; before 2.04 /
2.32×). **Centroid 705 → 531 rows by 1.2 s: 6.4 cm** (target ≥ 6; before 6.8).

**2. A filled, plate-sized cap** (`ringAt` 0.34 → 0.38, `roll` 5.2 → 3.0, `ringCore` 0.42 → 0.36, `ringFog` 1.25 → 1.2
after 0.8 for the item, the ring's fog over 0.45–2.05 s of the thermal, was 0.7–1.3). The ring's core sat at the cap's
underside, which the thermal stretches 3–4× into the stem (the hollow); it is now inside the cap's body. **Centre/rims
0.68 / 0.71 / 0.75 / 0.80 / 0.81 / 0.83 at 1.06–1.22 s** (target ≥ 0.6; before 0.35–0.45); **the lip +17.2 / +19.0 /
+19.2 / +19.3 / +19.5 / +17.5 levels over the notch inside it** (≥ 15; before +21.6…+22.0); the dip through the cap
(`o_ringprof.py`) median 0–7, best 9–27 levels at 0.93–1.25 s; **the cap 0.62 / 0.60 / 0.58 / 0.56 / 0.54 / 0.52 of the plate's width
at 0.99–1.31 s** (`capw.py`, B > 10, the gilt rim's 733 px; before 0.85–0.96 on the same script; the judge's "1.3×" was
not reproduced by any width measure here); the centroid as item 1.

**3. A terminator in the steam's own colour** (`key` 3.2 → 2.8, `keyFall` 3.8 → 6, `keyFloor` 0.15, `ringShadow` 0.1,
`bounce` 1.5 → 2.0, `room` 0.12 → 0.15, the steam's surface `shadow` 0.16 → 0.14). **Own lit − shaded +2 / +3 / +5 at
0.61 / 0.67 / 0.74 s — not met** (target +15; before +1 / +1 / +3). The composite's brightening lit − shaded **+51 / +53 /
+52** (≥ +25), far-rim transmittance **0.31–0.44** at 0.43–0.74 s, plate centre **+1…+4**, its side **+6…−9** (the gush brightens
it at 0.48 s) at 0.48–1.6 s, warmth **R − B +4.9…+5.8** at 0.48–0.86 s, no steam darker than the wall behind it. **Why not met — the trade measured**: on this
view the key comes from up-left-front, 44° off the camera, so the held dome's right third (own.py's "shaded") is mostly
lit through the dome's top; a terminator that legible needs a key self-shadow of ×20 (key 2.0): it gave +16 / +23 / +41,
but the dense body under the rising cap went 10–17 levels darker than the cove behind it (38–53 k px at 0.86–0.99 s:
smoke); with a 0.15 transmittance floor and a room fill rising with height, +10 / +12 / +19, and then the cap's rolled lip
(read on the same shaded right side) fell to +4…+14 levels, and the visible mass dipped at 0.86–1.0 s and rose 11 % at
1.12 s, breaking item 1. The milder setting keeps items 1 and 2 (commits 3, 3b, 3c record each step). A real terminator here
needs the key moved (a rig decision) or a light volume that resolves the sheets (not a constant).

**4. The gush carried upward** (`SPILL.fade` 0.34–0.5 → 0.42–0.66 s; `SPILL.stop` 0.24–0.3 → 0.2–0.36 s). It now rides its
parcels up and out before it fades: on the frame less its gush-off twin (`gushc.py`) **its area stays 0.97–1.35× its
0.416 s area to 0.62 s** (≥ 0.6 to 0.56; before 0.77 at 0.48, 0.20 at 0.50, gone by 0.51), **its centroid 2.5 cm up and
0.8 cm out over 0.43–0.56 s** (≥ 1 cm), 6.4 cm up by 0.61 s, gone by 0.67 s. The feed's end swept through the shader's
eight parcels in four frames once it was carried this long (−43 % of the puff in one frame at 0.576 s, a pop): it tails
off over 0.2–0.36 s now. **The held dome's IoU in the whole frame is lost to it**: 0.53 / 0.40 / 0.43 at 0.48 / 0.54 /
0.61 s (the gush beside the dome joins the steam mask); the dome alone (gush-off twin) **0.84 / 0.78 / 0.68** (≥ 0.75 at
0.48 s), inside/outside the seated outline 26 / 12.7 / 6.3 / 3.2 / 2.4 / 2.0 / 2.3 / 2.0 at 0.45–0.67 s (≥ 1.6 for 0.22 s).

**5. The held dome's freeze** (no change of its own: the carried gush and the receding edge move it). Mean frame-to-frame
change in the cloud (`motion.py`) **4.7 / 2.8 / 3.9 / 6.6 / 3.9 / 3.5 at 0.53–0.61 s** — no three consecutive frames under 3
levels while the dome holds (before 3.2 / 2.7 / 2.8 / 3.0 / 3.5). After 0.96 s the thinning cloud changes by 1.2–2.9 levels
a frame (its brightening is lower); no frame's change over 1.8× its neighbours' (0.18–1.6 s).

**6. The cost at the real framing** (`steamBounds`: the cloud's box from the receded outline, the draught's lean and side
drag one-sided, the gush's box from its live parcels; `marchPixels` 240 k → 180 k, `maxScale` 0.5 → 0.46, half the budget
for two clouds (was 0.4 of 240 k), 0.7 of it for one cloud among several clocks). With the tighter boxes the same budget
went finer and dearer (7.2 ms at 0.45 s at 240 k): the budget came down with them. **March pixels per CSS pixel at the
laptop 0.70 / 0.65 / 0.58 at 0.45 / 1.0 / 2.2 s** (before 0.68 / 0.57 / 0.48); the phone 0.85 / 0.85 / 0.81 (0.85 /
0.85 / 0.76).

| steam cost, p10 ms (bench6, N 40 × 6) | 0.3 | 0.4 | 0.45 | 0.5 | 0.6 | 0.7 | 1.0 | 1.2 | 1.5 | 2.2 | 3.0 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| laptop, before (this session) | 5.6 | 6.3 | 6.0 | 4.8 | 5.6 | 6.2 | 3.9 | 4.1 | 4.4 | 4.9 | 1.7 |
| **laptop, final** | **5.0** | **5.1** | **5.4** | **4.9** | **5.3** | **3.9** | **3.5** | **3.7** | **3.8** | **4.0** | **1.7** |
| **phone, final** (before 3.2–4.5) | **3.8** | **4.1** | **4.2** | **4.4** | **4.7** | **3.5** | **3.3** | **4.3** | **4.3** | **4.0** | **1.3** |

Two clouds (1000:decline, 1450:accept) at 1.7 / 1.8 / 1.9 s: laptop **4.5 / 4.3 / 4.5**, phone **4.1 / 3.7 / 3.9** (before
3.6–4.1 / 4.2–4.6). The resumed reveal (900:decline, 1100:accept) at 1.7 / 1.9 / 2.1 s: laptop **4.6 / 4.9 / 4.4**, phone
**4.1 / 4.2 / 4.1** (before 5.9–6.2 at the laptop). Late (4.5 / 5.5 / 6.0 s) 1.9 / 1.7 / 1.5. Load averages 2.8–4.1.
**Pacing** (`pace.ts`, three whole accepts each): laptop p50 16.70, **p95 16.70**, max 16.8, steam window p95 16.70;
phone p95 **16.70–16.80**, max 16.8; no frame over 20 ms. Zero with no steam (the scene-depth specs).

**Kept / changed of what had passed**: the box clip 0 px (`vcut` 0 at 0.83–1.31 s; `clip.py` in every direction: right
runs ≤ 14 px, the left and bottom runs the cloche's and the plate's far rim's occlusions, as before; full laptop and phone
the same; two clouds 0 from 1.66 s, 20 px at 1.536 s at the lifting cloche's edge; Low tier 0); the decline's puffs
unchanged (−6…−26 % a frame from 0.85 s, the faint tail as before); the return's crown 0 px; far-rim transmittance; no
waterline (median step 0.9–1.4); grain over the backdrop temporal 0.56 / 0.73 / 0.58, spatial 0.63 / 0.63 / 0.48 at
0.58 / 0.67 / 0.90 s (≤ 0.9); the Low tier's 0.45 / 0.57 and 0.47 / 0.50; reduced motion byte-identical to its no-steam
twin (0.16–3.2 s); the tail 2 levels at 5.95 s; the clocks and `STEAM_END` (the tests). **Changed**: coverage core / ring
0.97 at 0.61 s (the gush beside the dome; 1.11–1.14 at the other frames; before 1.06–1.10); the sharpness proxies at
0.54–0.61 s (`soft.py`) are lower (grad 0.30–0.62, oedge 0.23–0.47) where the carried gush's soft puff sits in their
outline band, as at 0.67–0.74 s they are as before (0.72 / 1.39, 0.57 / 1.32); polish 5's "eroded interior" 99 / 78 at
0.61 / 0.67 s was the cloche's reflections inside its mask: on the steam body alone 11 / 11 then, 8 / 10 now.

**What a seventh judge would still see** (the owner's view): past one second the steam now thins and shrinks as it rises
— a compact, filled puff with a rolled lower edge, narrower than the plate, gone into faint wisps by 1.6–1.8 s while the
plate breathes on — rather than a wide smoke mushroom that cross-dissolves; the gush rides up beside the dome and fades
high. It is still **soft at 2×** (the design limit the judge named), the gush is still a soft airbrushed puff, only
carried; the **own colour's terminator is not legible** (+2…+5), and on the frame's measures the gush makes the visible
mass peak at 0.48–0.54 s, the whole frame's visible area grows to 1.25 s with the veil, and the held dome's IoU with the
gush counted is 0.53. A judge who reads the volume's terminator as the priority will mark item 3; it cannot be had with
these constants without the smoke-grey shade and the lip's loss measured above.

**Tests.** `tests/dinner-steam.test.ts` 26 (new: the condensate's receding edge, its crown least, the ring inside the
visible edge, no fog gained after the release; changed: the visible cap narrower than the held dome and within 0.85 of the
plate's radius at 1.3 s, the erosion and the recession by 1.2 s, the roll over 2 rad, the cap's fog 0.6 of its 1.0 s at
1.4 s and gone by 2.6 s, the gush fading over 0.42–0.66 s and its box at 0.6 s, its feed's tail-off, the light's
constants); `tests/scene-depth.test.ts` 6, `tests/dinner.test.ts` 27; `tests/browser/dinner.spec.ts` 6/6,
`tests/browser/scene-depth.spec.ts` 5/5 (fresh server each); `pnpm typecheck` clean.

## Polish round 7: the gush's size and brightness (`v1.6/steam-polish7`)

The seventh judge scored polish 6 **7 at laptop size, 7.5 at phone size** and withheld; its top tell, the one a guest sees
at CSS size: the gush, from 0.42 to 0.62 s, is "an airbrushed ball", a round, radially soft, featureless puff beside the
plate's right rim, 112–156 k px of the laptop clip with p90 35–65 levels, about half the frame's visible steam at 0.48 s
(3.65 of 7.18 M), a cotton ball parked by the plate while the dome holds, and it pulls the whole frame's dome IoU down to
0.53 / 0.40 / 0.43 at 0.48 / 0.54 / 0.61 s. Its kind: size and brightness are constants; its lack of structure is the design
limit and is not touched here. A constants-only round. Every number is in `evidence/v1.6/steam-polish7/measurements.txt`
(laptop 1240² clip of 1280 × 720 @2, WARM 2000, the judge's `frames.ts`; "before" is the judge's own polish-6 frames, which
this session's re-renders match byte for byte), the cost in `cost.txt`; the scripts in `evidence/v1.6/steam-polish7/tools/`
(the judge's `frames.ts`, `bench6.ts`, `pace.ts`, `envmine.py`, `iou.py`, `domefill.py`, polish 6's `gushc.py`, `env.py`,
`motion.py`, and `gush7.py`, `gushfull.py`, `sheet.py` new), all on port 5619.

**What changed** (`GUSH.density` 5.2 → **1.72**; `GUSH.shownGrow` **0.26**, new; `SPILL.fade` 0.42–0.66 → **0.4–0.66**). The
drawn tube now widens by 0.26 of each parcel's travel out and up where the box (`steamBounds`) keeps `grow`'s 0.45 as their
reach, the puff is a third as dense, and its fade starts 20 ms earlier. **Why not a smaller `radius` / `grow`, a later
`stop`, an earlier fade's end or fewer parcels:** each of those moves the gush's box, and the box is part of the march's
footprint (the laptop's march is budget-bound at 0.40–0.46 of the buffer a side over 0.3–0.7 s: a smaller footprint is a finer
march) and of every ray's span through the boxes (the steps' positions): any of them redraws the cloud, and the cloud-only twin
must stay byte-identical. Density, the drawn growth and the fade's start do not touch the box, the probes' occupancy or the
on/off of the spill (`uSpillOn`), so the march is the same march: its footprint and scale at every benched time are the
judge's (`steam 1034×724 scale 0.460` at 0.3 s, `1162×856 0.425` at 0.4–0.45 s, `1233×931 0.396` at 0.5 s, …).

Gush alone = the frame less its gush-off twin (`__steamFlags` 67108864; `gush7.py`, `gushc.py`'s D); its share is its mass
(Σ D over D > 4) over the frame's visible steam (`envmine.py`'s S+ = Σ max(frame − clean, 0)).

| laptop clip | before | after | target |
|---|---|---|---|
| gush's share of the frame's visible steam at 0.48 s | 50.8 % (3.65 of 7.18 M) | **22.1 %** (0.98 of 4.46 M) | ≤ 25 % |
| its area (D > 4) at 0.416–0.624 s | 112–156 k | **≤ 67.4 k** (0.416–0.56: 50.0 / 46.6 / 52.7 / 61.0 / 66.7 / 57.4 / 52.9 / 60.7 / 67.4 / 62.3; then 47.1 / 38.8 / 36.0 / 8.6) | ≤ 70 k |
| its p90 at 0.416–0.624 s | 10–65 (64.8 / 51.8 / 52.0 … 35.0 at 0.416–0.544) | **7–38.9** (38.9 / 28.6 / 26.9 / 26.9 / 25.2 / 20.9 / 17.9 / 17.1 / 15.9 at 0.416–0.544) | ≤ 40 |
| legible spill: D > 8 outside the seated outline, right of its centre, 0.416–0.496 s | 64–97 k, p90 47–73 | **26.1–43.3 k** (29.8 / 26.1 / 34.0 / 41.6 / 43.3 / 35.2), **p90 21.9–42.7** | ≥ 25 k, p90 ≥ 20 |
| centroid up over 0.43–0.56 s | +1.26 → +3.80 cm (+2.5) | **+0.95 → +3.27 cm (+2.3)**; +4.7 cm by 0.61 s | ≥ 1 cm |
| area as a share of its 0.416 s area, each frame to 0.56 s | 0.97–1.35 | **0.93–1.35** | ≥ 0.6 |
| gone | 5.2 k at 0.672, 1.2 k at 0.704 | **1.8 k at 0.672, 0.3 k at 0.704, none at 0.736** | by ≈ 0.67 s |
| whole-frame dome IoU 0.48 / 0.544 / 0.608 s | 0.53 / 0.40 / 0.43 | **0.71 / 0.64 / 0.67** | ≥ 0.65 / 0.6 |
| the dome alone (gush-off twin) IoU | 0.84 / 0.78 / 0.68 | 0.84 / 0.78 / 0.68 (byte-identical twin) | unchanged |
| inside / outside the seated outline 0.448–0.672 s, whole frame | 26.0 / 12.7 / 6.3 / 3.2 / 2.4 / 2.0 / 2.3 / 2.0 | **91.3 / 25.1 / 7.9 / 3.5 / 2.5 / 2.0 / 2.3 / 2.0** (the dome alone 91.1 / 27.6 / 8.1 / 3.5 / 2.5 / 2.0 / 2.3 / 2.0) | ≥ 1.6 to 0.61 s |
| the frame's visible mass (Σ B over B > 8), peak | 6.49 M at 0.544 s (the gush's) | **5.12 M at 0.736 s** (the condensate's own, its gush-off twin's peak) | earlier / lower |

**Exit and motion.** No pop: `motion.py` on the whole frame finds none (before none); the gush's own change per frame
(Σ |ΔD|) is 0.10 / 0.11 / 0.14 / 0.10 / 0.06 M at 0.608–0.672 s, smooth into nothing (before 0.37 / 0.47 / 0.64 / 0.40 /
0.19). Its D > 4 area falls 36.0 → 8.6 k at 0.608 → 0.624 s, but that is a haze of p90 7 levels (mass 0.20 → 0.05 M; before
the same exit was 125 → 61 → 9.7 k at 0.624–0.656 s at p90 10 → 7). A stricter test on the gush's thresholded mass (Σ D over D > 4)
flags its puffs' pulses mid-flight at 0.496 / 0.512 / 0.576 s and the haze's crossing of the 4-level cut at 0.624 s (before
0.496 / 0.576 / 0.640 s), each a change of ≤ 0.25 M (before ≤ 1.09 M); the unthresholded Σ |ΔD| has no exit step.
**The held dome's stillness shows** (`motion.py`'s freeze, polish 6's item 5): 2.5 / 2.2 / 2.5 levels at 0.528–0.56 s (before
4.7 / 2.8 / 3.9, the big carried gush's motion counted in); the dome alone (its gush-off twin, unchanged) is 2.8 / 2.7 / 2.7 /
2.9 at 0.528–0.576 s, a freeze by the same test. Polish 6 met item 5 through the gush's motion; with a puff this size the
dome's own hold is what the test sees, and the dome is not this round's to move.

**Byte-identical / within noise.** The cloud-only twin (`__steamFlags` 67174400: no gush, no veil) **before vs after: 41 of
41 frames byte-identical** (0.352–0.736 s every frame, 0.8–2.24 s every sixth); the gush-off twin byte-identical (0.416–0.736
s). The whole frame after the gush: the temporal history's residue of the larger before-gush is ≤ 4 levels at 0.736 s,
≤ 2 from 0.768 s, ≤ 1 level on ≤ 2.1 k px from 0.8 s, 2–17 px from 1.1 s, byte-identical from 2.05 s; **the frame's visible
mass falls at every listed frame after 0.736 s** (5.12 → 4.66 → 4.53 → … → 0.44 M at 2.24 s, the same as before).
**Full frames**: the laptop's 2560 × 1440 is the clip's numbers (the gush lies inside it); the phone (1170 × 2532, the canvas
above the page's buttons) **share at 0.48 s 46.1 → 20.8 %**, area 128 / 136 / 133 → 60 / 73 / 69 k px at 0.416 / 0.48 /
0.544 s, p90 66 / 51 / 37 → 39 / 26 / 16. Crops: `gush-1to1-0.42-0.48-0.54-0.61.png` (before / after / the gush-off twin at
1:1), `gush-css-laptop-…png` and `gush-css-phone-…png` (the full frames at CSS size): at the guest's size the puff by the rim
reads as a small, faint spill from the gap at 0.42–0.48 s and has thinned to a breath beside the dome by 0.54 s; the dome is
the shape; the gilt rim, which the before's puff washed out at 0.42–0.48 s, stays gold. Still a soft puff at 1:1 (the design
limit), now a small one.

**Cost** (`bench6.ts` at the real framing and DSF, p10 ms; before = the judge's two runs on the polish-6 build; after = this
build, each time re-run until its steam-hidden frame was clean, the machine being shared at load 3–23; `cost.txt`,
`cost-raw-after.txt`). The march is the same march (footprint, scale and steps at every time are the judge's), so only the
gush's own density evaluation differs; with the narrower drawn tube more of its box returns early.

| steam cost, p10 ms | 0.3 | 0.4 | 0.45 | 0.5 | 0.55 | 0.6 | 0.65 | 0.7 |
|---|---|---|---|---|---|---|---|---|
| laptop, before | 4.6 / 4.8 | 5.1 / 5.2 | 5.4 / 5.5 | 4.9 / 5.0 | 5.1 | 5.3 / 5.3 | 4.8 | 3.9 / 3.9 |
| **laptop, after** | **3.9** | **4.9** | **5.2** | **4.8** | **4.8** | **4.9** | **4.4** | **3.9** |
| phone, before | 3.9 | 4.2 | 4.3 | 4.4 | – | 4.7 | – | 3.5 |
| **phone, after** | **3.8** | **4.1** | **4.2** | **4.4** | – | **4.5** | – | **3.6** |

The phone at 0.7 s (3.6, runs 3.6 / 3.8 / 4.1, its steam-hidden frame 2.1–2.2 ms against the judge's 1.8) is after the gush
(τ 0.688, past the fade's end at 0.66: no spill box, `uSpillOn` 0, the before's code path exactly): machine noise, not the
change. **Pacing** (`pace.ts`): laptop p50 16.70, **p95 16.70**, max 16.8, steam window p95 16.70, no frame over 20 ms (the
judge's polish 6: the same). The phone's pacing could not be measured clean in this session (load 11–20: p95 33.3 with the
page's own frames slow, `pacing-raw-after.txt`); its steam cost is at or under the before at every benched time.

**Tests.** `tests/dinner-steam.test.ts` 26 (changed: the gush's fade is full to 0.4 s, was 0.42, and its drawn growth is
within the box's, `shownGrow ≤ grow`); `tests/dinner.test.ts` 27, `tests/scene-depth.test.ts` 6;
`tests/browser/dinner.spec.ts` 6/6 (fresh server); `pnpm typecheck` clean.

## Review fixes before main (`v1.6/steam-review-fixes`, merged 1796b77)

A pre-push code review of polish 5 and 6 (one reviewer, every finding checked by two independent skeptics) confirmed three
defects, none visible in a plain accept. **1 (should-fix).** The seating's squeeze puffs were still gated on the cloud's
fade (`present = s.present && s.fade > 0`) while polish 5's `leftSteamEnd` promised them `capture + SQUEEZE.life`, so a
decline from the accepted pose at τ ≈ 2.0–2.3 s (capture at 2.37–2.67 s) squeezed puffs from a nearly faded cloud and cut
them in one frame at τ = 2.8 s — the very cut polish 5 set out to remove — while the clock stayed alive to ≈ 3.2 s drawing
nothing. Now `squeezeStrength` (the fog's light at the capture, on a clock that carried a cloud), `squeezeLive` (the window
capture − lead … capture + life) and `squeezeFade` gate the puffs, the box and the clock's end: the accept byte-identical at
seven times; in the worst late decline (2.304 s) 41.4 k px at up to 59 levels that vanished in one frame now fall
−8 / −11 / −12 / −12 % a frame across 2.8 s, no frame losing over 27 % while the puffs show at ≥ 13 levels, gone by 3.10 s;
the clock ends with the puffs. A capture at τ ≈ 2.9 now draws faint puffs (≈ 0.09 of the light) from a cloud that has
fully faded, where before none were drawn. **2 (minor).** The puffs' room-frame lift followed the live cover lift, so on
decline → change back → accept they sank up to 4 cm with the returning dish and rose again. Each clock now latches the
highest lift since its capture (`wakeLift`, `uWake[l]`), used by `squeezeFrame` and the box top (a fixed function of time
was tried and dropped: up to 5 mm off in the 0.5 s decline and 0.1 s early in a 0.3 s one). The accept byte-identical; the
plain decline identical in 47 of 51 frames (the other four 1–3 px at one level); in the change-back case the puffs' height
holds at 6.2–6.6 cm where it sank to 3.1. **3 (minor, not taken).** `spillOccupies` capped the gush at p.y < 1.3 su while
the polish-6 gush box reaches 1.52–1.58 su; the fix (`p.y <= uSpillMax[l].y`) is correct but changes accept frames at
0.48–0.85 s by up to 21 levels (19–39 k px) for no visible gain — the fog above 1.3 su is invisible (the gush alone changes
≤ 1 level); the longer ray spans resample the cloud at the same step count (+0.3–0.8 % noise, +0.1–0.3 ms). It stays on the
branch (c859360) with its test. Three new tests in `tests/dinner-steam.test.ts` (29 in all): the late-decline continuity
and clock end, the latched lift never falling, (on the branch) the box containing the drawn tube. Evidence:
`evidence/v1.6/steam-review-fixes/` (before/after sheets for the accept, the two late declines and the change back,
`measurements.txt`, `tools/`).

## Polish round 8: the second structural round — a light of its own, a full-resolution edge (`v1.6/steam-polish8`)

The seventh judge left the steam at laptop 7 / phone 7.5 (7.5 / 7.5 at CSS size), **not signed**, on two items that are not
constants: no light direction in the volume (the own colour 246–251 everywhere, lit − shaded +2 / +3 / +5 at 0.61 / 0.67 /
0.74 s, target ≥ +15), and soft, combed edges at 2× (on the dome alone edge gradient 0.56–0.99, fine detail 0.43–0.55, the
crown 1.13–1.41:1 against ≥ 1.2, ≥ 0.6, ≥ 2:1). Budget for the round: **≤ 9.0 ms of steam at the app's real framing, the whole
Dinner frame pacing at 60 fps, zero with no steam.** Every number below is the judge's own script on the laptop 1240² clip of
1280 × 720 @2 (WARM 2000, the judge's `frames.ts`), its no-steam twins byte-identical on this build, re-renders
byte-identical; "before" is polish 7 (main 4e815b7) on the same scripts (its frames byte-identical to the judge's re-check
frames). All of it is in `evidence/v1.6/steam-polish8/measurements.txt`, `cost.txt`, `pacing.txt`, `prototype.txt`; the
scripts in `evidence/v1.6/steam-polish8/tools/` (port 5621; `m8.sh` runs the judge's set on a run directory, `lt.sh` the
light's, `proto.sh` the edge's, `terms.sh` + `py8/opt.py` + `py8/search.py` the light's balance offline).

**Research.** Film and food photography light steam from behind: steam is white and translucent, so against a lighter or
equal background it has no edge; it reads when a light behind it (at "10–11 o'clock", behind and to the side) shines through
it towards the lens against a darker background, its thin edges glowing (expertphotography.com, fstoppers.com "How to
capture steam and smoke in food photography"). The physics is the droplets' forward scattering (Henyey–Greenstein g ≈ 0.7–0.9:
the silver lining of a cloud between the viewer and the sun; Schneider & Vos 2015 use a two-lobe HG for exactly that): the
light behind reaches the camera through the thin parts, the dense body, which it cannot cross, stays dark. Two findings about
this scene came out of measuring the light transport term by term (DEBUG 16, the own linear radiance, below):
(1) **with the rig's key alone no balance of the existing terms separates the sides.** The steam is optically thin (the far
rim seen through it at T 0.3–0.5), and the key, up-left-front and 48° off the camera, lights the dome's visible front through
its top: over own.py's spans the key's own lit / shaded ratio is 1.35–1.6, the fill flat; an offline search over the terms'
weights, the exposure and the shoulder (each light's in-scatter is linear in its weight, so the own colour of any balance can
be composed from renders at unit weight: `terms.sh`, `py8/opt.py`) gave at most +5 levels at 0.61–0.74 s once the shade is
held over the wall to 1.25 s (it goes under it at 0.9–1.25 s as the cap rises). The key's self-shadow at ×20–×60 shades the
dome's underside and lower right, not its right side. (2) **The over-composite caps a backlit wisp**: the composite lays the
steam's tone-mapped own colour over the scene by its coverage, so a wisp of coverage 0.2 over the 191-level cove reaches 203
at most however bright its light; light adds: the same wisp with three units of radiance on a cove of 0.55 tone maps to ≈ 245.

**The prototype comparison, (a) against (b)** (`prototype.txt`, the dome alone on the judge's `soft.py`, `aniso.py` at DoG 2/8,
`hfsplit.py`; ≈ an hour on the throwaway branch `proto/steam8-ab`, e67cd6d):

| on the dome alone, 0.48–0.74 s | edge gradient | fine detail | crown | temporal / spatial grain (0.58 / 0.67 / 0.90 s) | cost |
|---|---|---|---|---|---|
| polish 7 | 0.59–0.99 | 0.43–0.55 | 1.14–1.42, horizontal | 0.74 / 0.70 / 0.57, 0.87 / 0.61 / 0.48 | 6.1–6.9 ms (that session) |
| (a1) the whole march at 1 px per CSS px | 0.59–1.04 | 0.49–0.64 | 1.02–1.44 | 0.93 / 0.81 / 0.66, 1.00 / 0.71 / 0.53 | — |
| (a2) + a sharper boundary with 1.5 mm streaked tears | 0.58–1.03 | 0.52–0.67 | 1.21–1.73, horizontal | 1.01 / 0.83 / 0.68 | — |
| (a3) + thinner, denser, finer sheets everywhere | **0.69–1.25** | **0.66–0.77** | 1.16–1.49, vertical | 1.19 / 1.14 / 0.99, 1.91 / 0.95 / 0.79 | — |
| (b) the sheet field advected per frame on 128³ (2.6 mm), curl noise, the present march | 0.53–0.86 | 0.41–0.52 | 1.30–1.55, horizontal | 0.76 / 0.59 / 0.54 | **+5–6 ms** |

**Decision: (a).** (b) is softer than the analytic field it advects (the grid's resampling diffuses the sheets each step; the
analytic flow already carries the field exactly, so the advection adds only the curl noise's stretching) and costs 128 slice
draws a frame (+5–6 ms at the laptop, over the budget before anything else); its finest structure is two voxels, 5 mm, where
fine detail under 1.5 px at 2× is sub-millimetre. (a) reaches the edge and the fine detail only with finer structure *and* a
finer march, at the price of grain — so the structure goes where the judges asked for it, in the edge band, marched at full
resolution, the interior staying as it was.

**What was built.**

1. **The steam lit on purpose** (`models/dinnerSteam.ts` `STEAM_LOOK`; the march, the light volume, the composite).
   - *The window as an area light.* The rig's key is the window's centre (high, in front); its steam share 2.8 → **1.0**,
     shadowing at ×60 (`keyFall` 6 → 60, `keyFloor` 0.15 → 0); and the window's low spread from its side, **`windowWrap`**
     (3.0, its own optical depth through the steam's mean at ×20, direction 0.4 / 0.85 / 0.35 towards the camera / left / up
     in the camera's horizontal frame), a second key direction seen only by the steam: across the dome its light falls from
     the window's side to the far side — the terminator.
   - *The room as the ambient it is.* 0.15 → **0.65**, half of it from every side (`roomFloor` 0.5, was 0.3): the shade's floor
     is the room's light, about the cove's own (a non-absorbing fog lit only by its surroundings has their radiance), so the
     shade never goes under the wall; its tint #E6D7C0 → **#EEE9E1** (at the old tint the shade read beige, as dust). The
     octaves 0.6× (0.108 / 0.036).
   - *A back light of its own* (`backLight`): behind, above and a little right of the camera (0.8 / 0.25 / 0.55 behind /
     right / up), HG g 0.6, its own light volume (a second 32³ atlas, `light2`, one more pass), only on the condensate's outer
     5 mm (`rim`: the boundary's signed distance before the edge band's tears, smooth over centimetres, squared), not on the
     gush, the veil or the seating's puffs. **It is composited as light**: its share of the steam's light rides the march's
     fourth value through the resolve (the key's share was there: the steam's colour is now a fixed key / room blend,
     `keyShare` 0.5), and against the cove (beyond 9 su from the camera: not the plate, the cloche or the table) the composite
     adds what it adds there — the steam's light and the cove's (`radiance.cove`) tone mapped with and without it — so a
     backlit edge is brighter than its coverage of a white colour. Tried and measured on the way: further right (0.75 / 0.5 /
     0.3) it lit the shaded side's body (own colour +4 where +15 was aimed); in the own colour (an over-layer) it took the
     separation +20 → +6…+13; sharpened by two fine taps at ×200 it was a sharp light point-sampled by the march (temporal grain
     1.5–1.7); a hard rim at the boundary, grain 1.28.
   - *The own colour off the shoulder*: a tone curve of the steam's own (`steamTone`: the scene's neutral curve — its toe,
     offset and desaturation — with its shoulder from 0.5 rolling off exponentially, was 0.76 hyperbolic) at an exposure of
     **0.79**: the scene's curve maps 1.0 → 240 and 2.0 → 251 of 255 (11 levels for a doubling), this one 1.0 → 231, 2.0 → 252
     before the exposure.
   - The gush's density 1.72 → **1.35** (`GUSH.density`): the new ambient and the window's spread light the thin puff fully
     where the dense body shades itself; its share is kept.
2. **The edge** (`STEAM_LOOK.edge`, `edgeBand`; the march's and the resolve's `uEdgePass`).
   - *A full-resolution edge pass.* After the half-resolution march and its resolve, the silhouette's band is marched again
     at **one march pixel per CSS pixel** (0.607 of the laptop's 1.647× buffer, 0.5 of the phone's 2×): a pixel is marched
     where the half-resolution steam's coverage falls under 0.05 within a 6 CSS px ring (≈ 4.5 mm at the laptop: its outline,
     its holes, its torn ends), skipped inside (the half-resolution steam taken as it is) and outside; the gush and the veil
     keep the half-resolution steam; 0.6 of the steps (its rays cross the outer layer). Its own history (reprojected through
     the flow from the previous frame's state, snapshotted before the half-resolution resolve replaces it; clipped to the
     neighbourhood's mean ± 1.25 σ; built from four jittered marches where it has none), blended into the half-resolution
     steam where the band ends (no seam). Only while a cloud is young (0.8 s of its thermal: to ≈ 1.2 s of the reveal), and
     not on the Low tier.
   - *Millimetre tears in the band.* The boundary's band 0.25× (the young envelope ≈ 1.5 mm, was 6 mm), displaced by a fine
     field in the cloud's own frame (carried with its air) — 3.4 mm deep, ≈ 1 mm across, 5× taller than wide, 10× at the crown —
     fading in over the outer 1 cm. The sheets inside are unchanged: finer, denser sheets everywhere (prototype a3) reach the
     fine detail but are the interior's grain.
   - Tried and dropped: the crown's tears taller (5 → 30:1) and stronger (no change to the crown's measure: its band, 3–15 mm
     inside the outline, is the sheets' and the outline's, not the tears'); a stronger history (blend 0.06, clip 1.6 σ:
     grain 1.16–1.19, worse, as polish 5 found); more spatial denoise (no change); the body's sheets 0.6× (grain unchanged,
     the edge gradient down).

**Item 1 against its targets** (laptop clip; before → after):

| | target | polish 7 | polish 8 |
|---|---|---|---|
| own colour lit − shaded (own.py) at 0.61 / 0.67 / 0.74 s | 15–25 | +3 / +3 / +5 | **+18 / +18 / +21** (0.48 s +19; 0.90 s +37) |
| lit / shaded own colour at 0.61 s | room above the shade | 249 / 246 | 250 / 232 |
| own colour top − underside (owntop.py) at 0.61 / 0.67 / 0.74 / 0.90 s | readable terminator | +5 / +5 / +7 / +8 | **+17 / +15 / +20 / +29**; 0.99 s +13, 1.12 / 1.25 s −3 / −6 |
| body's own colour p5–p95 at 0.61 / 0.67 / 0.74 s | — | 11 / 13 / 61 | 28 / 33 / 61 |
| sign over the cove (litfair.py, own colour over the wall) | consistent | 249/235 at 0.90 s, else unmeasurable | 246/210 (0.90 s), 233/210 (0.99 s): lit side over the shade wherever both are measurable; the composite over the wall +26 / +11 / +19 at 0.90 / 0.99 / 1.12 s, −3 at 0.74 s (504 px on the lit side: the thin edge by the cloche); polish 7 −14 at 0.74 s |
| a rim where the back light grazes the sheets | — | none | a glow on the crown's and the right side's outer layer against the cove, legible from ≈ 0.7 s, strongest on the rising cap's top at 0.9–1.3 s (`guest-laptop-css-p7top-p8bottom.png`) |
| steam darker than the wall (dark.py) | 0 | 0 at every frame | 0 at 0.48–0.74 s and 1.12–1.25 s; **0.1 k px at 0.90 and 0.99 s** (≈ 300 px, −4…−6 levels, over the lifted cloche's window reflection, N ≈ 234: the fog in the cloche's shadow veiling a highlight, not the cove) |
| the white plate: centre / side | ≤ +4 / ≥ −10 | +2…+5 / +3…−9 | **+1…+2 / +2…−8** |
| far-rim transmittance 0.43–0.74 s | 0.3–0.5 | 0.31–0.44 | **0.29–0.45** (0.29 at 0.61 s: the edge band's sharper boundary; a hair under) |
| warmth R − B of the bright steam | ≥ +4 | +5.4…+6.1 | **+6.9…+7.6** |
| the cloche's reflections the only modelling | no | they were | the own colour carries it: lit 247–250, shade 207–232 over the same spans |

**Item 2 against its targets** (the dome alone — the gush-off twin, as the judge measured it; the whole frame in
`measurements.txt`):

| at 0.48 / 0.54 / 0.58 / 0.61 / 0.67 / 0.74 s | target | polish 7 | polish 8 |
|---|---|---|---|
| edge band's gradient (soft.py grad) | ≥ 1.2 | 0.59 / 0.97 / 0.99 / 0.96 / 0.70 / 0.56 | 0.94 / 1.02 / 0.95 / 0.95 / 0.74 / 0.68 — **not met** |
| the outline's gradient (soft.py oedge) | — | 0.75 / 1.14 / 1.20 / 1.38 / 1.35 / 1.27 | **1.97 / 1.99 / 1.89 / 1.80 / 1.91 / 1.70** |
| fine detail under 1.5 px (soft.py fine) | ≥ 0.6 | 0.48 / 0.46 / 0.43 / 0.44 / 0.55 / 0.52 | 0.64 / 0.51 / 0.47 / 0.48 / 0.60 / 0.57 — **met at 0.48 and 0.67 s only** |
| crown anisotropy (DoG 2/8) at 0.54 / 0.61 / 0.67 / 0.74 s | ≥ 2:1 | 1.36 / 1.22 / 1.14 / 1.42 (horizontal but the last) | 1.72 / 1.76 / 1.76 / 1.15 — **not met, and horizontal** (gx/gy 0.57–0.59: the crown's lit rim and its crisper outline run along it) |
| walls (R / L) at 0.54–0.74 s | — | R 1.33–2.59, L 1.47–2.15 | R 1.78–1.98, L 1.41–2.77 |
| temporal grain over the backdrop at 0.58 / 0.67 / 0.90 s (hfsplit upper T) | ≤ 0.9 | 0.74 / 0.70 / 0.57 | **0.89 / 0.93 / 0.79** |
| spatial grain (hfsplit upper S) | ≤ 0.9 | 0.87 / 0.61 / 0.48 | **1.03 / 0.75 / 0.64** |
| march px per CSS px over the silhouette's band, laptop / phone | ≥ 1 | 0.64 / 0.85 | **1.0 / 1.0** (the interior 0.64 / 0.85 as before) |

Where the grain rose and why (each measured): the light alone, with the scene's neutral tone curve, leaves it at
0.80 / 0.72 / 0.62 and 0.91 / 0.62 / 0.51; the steam's own tone curve, which spends more levels on the shade (the point of
item 1), shows the march's residual noise more (+15–25 %); the back light's glow adds ≈ +0.1 at 0.58 and 0.67 s; the edge pass
and its tears ≈ +0.05. The fine-detail measure counts noise as well as structure (with no history this build's dome reaches
0.7+), so it and the grain trade: the round's early edge builds reached fine 0.63–0.76 at grain 1.07–1.33.

**Cost** (`bench6.ts`, the judge's in-app bench at the real framing and device scale factor, p10 of steam visible less hidden;
`cost.txt`): the machine throttled for an hour of this session (the
steam-hidden frame rising from 2.5 to 25 ms within a run, polish 7 alike): those runs are discarded; the table is the quiet
runs, with polish 7 benched in the same session as a control (a temporary worktree of main on port 5622).

| steam cost, p10 (p50) ms | 0.3 | 0.4 | 0.45 | 0.5 | 0.55 | 0.6 | 0.65 | 0.7 | 1.0 | 1.2 | 1.5 | 2.2 | 3.0 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| laptop, polish 7 (this session) | – | – | 5.2 (5.6) | – | – | 4.8 (5.0) | – | – | 3.4 (3.7) | – | – | 4.1 (4.6) | – |
| **laptop, polish 8** | **5.9 (6.1)** | **7.2 (7.6)** | **7.6 (8.3)** | **7.4 (7.5)** | **7.4 (7.6)** | **7.6 (8.0)** | **6.9 (7.3)** | **7.0 (7.5)** | **5.7 (6.0)** | **5.9 (6.4)** | **4.6 (5.4)** | **4.8 (5.5)** | **2.2 (2.2)** |
| phone, polish 7 (this session) | – | – | 4.3 (4.4) | – | – | 4.5 (4.6) | – | – | 3.4 (3.5) | – | – | – | – |
| **phone, polish 8** | **5.7 (5.6)** | **6.3 (6.3)** | **6.4 (6.5)** | **6.9 (7.0)** | – | **6.7 (6.9)** | – | **5.7 (5.8)** | **4.5 (4.7)** | **5.7 (5.9)** | **5.5 (5.6)** | **5.0 (5.2)** | **1.5 (1.6)** |

Two clouds (1000:decline, 1450:accept) at 1.7 / 1.8 / 1.9 s: laptop **6.5 / 6.3 / 6.8**, phone **6.0 / 5.3 / 5.6**; the resumed
reveal (900:decline, 1100:accept) at 1.7 / 1.9 / 2.1 s: laptop **5.0 / 5.9 / 5.0**, phone **4.4 / 4.8 / 5.0**. **Within 9.0 ms
everywhere (the worst p50 8.3 ms, the laptop at 0.45 s); +2.2–2.8 ms over polish 7** while the edge pass runs (to ≈ 1.2 s),
+0.7–1.5 after (the back light's and the window's light volume, their march terms, the glow). The whole Dinner frame with
steam p50 ≤ 10.8 ms at the laptop, ≤ 8.8 at the phone (steam hidden 2.5 / 1.9). Zero with no steam (the scene-depth specs).

**Pacing** (`pace-scene.ts`, SCENE=dinner, three accepts each, `pacing.txt`): laptop **p50 16.70, p95 16.70–16.80, max 16.8, no
frame over 20 ms** (×3, load 6.4); phone **p95 16.70–16.80 in all twelve accepts**, nine clean, three with 3–4 frames of 33–50 ms
(at 1.8–2.2 s in two, 3.5–5.6 s in one; load 4.5–5.4: Backblaze and Adobe after the machine woke); the polish-7 control in the
same minutes ×3 clean. Not shown to be the steam (its cost at 1.8–5.6 s is ≤ 5.6 ms of a 16.7 ms frame), not shown not to be.

**The regression list** (every judge's; the final code; `measurements.txt`):

- The beat and the envelope: dome IoU at 0.48 s **0.69** in the whole frame (polish 7 0.71; target ≥ 0.7: a hair under), **0.79**
  on the dome alone (0.84); 0.65 / 0.67 at 0.54 / 0.61 s (0.64 / 0.67). Inside / outside the seated outline 86 / 14 / 5.2 /
  2.5 / 1.8 / **1.6** at 0.45–0.61 s, 1.9 / 1.7 at 0.64 / 0.67 s (≥ 1.6 to 0.61 s: met). The mass (Σ B over B > 8) peaks at
  0.74 s (4.97 M) and falls at every listed frame but one: **+1 % at 1.12 s** (3.32 M against 3.30 M at 1.06 s; polish 7 fell
  every frame); **half the peak at ≈ 1.35 s** (0.53 at 1.31 s, 0.49 at 1.38 s; polish 7 1.30 s): the risen cap is lit by the
  window's spread and rims as it thins. Edge first: the edge band falls to 0.44 / 0.37 of its peak at 0.99 / 1.12 s while the
  core holds 0.81 / 0.63. Centroid 701 → 531 rows by 1.18 s: **6.3 cm** (≥ 6). The cap 0.66 → 0.52 of the plate's gilt rim at
  0.99–1.31 s (0.62 → 0.52; target 0.5–0.65: 0.66 at 0.99 s). Lip and the cap's fill: not re-measured (`lip.py` needs the
  ring's projection; the field and the ring are unchanged; the cap's shade side is now in shade, which the lip measure reads).
- The gush: share of the visible steam at 0.48 s **20.9 %** (≤ 25; polish 7 22.1), area ≤ 68 k px, p90 21–33, legible 22–39 k
  px at p90 22–36 at 0.42–0.48 s (31 k at p90 18 at 0.50 s: a hair under polish 7's 22), carried up +1.5 → +4.1 cm by 0.61 s,
  gone by 0.70 s, no pop.
- Box clip (`clip.py` in every direction, 0.74–1.50 s): right runs ≤ 23 px (polish 7 ≤ 14; the sharper boundary's straight
  stretches on the right wall at 0.74 s), the left and bottom runs the cloche's and the plate's far rim's occlusions, the top
  run at 1.50 s the frame's edge; no vertical cut down the flank.
- The decline at 0.5 s: the rim puffs −5…−29 % a frame from 0.85 s while they show at ≥ 13 levels, the faint tail (≤ 12 levels)
  −41…−64 % to nothing by 1.22 s (as polish 5–7); **over the seated crown 4 / 63 px at 0.70 / 0.74 s** (polish 7 0 / 0;
  p95 0.0, mean +0.04: a few faint pixels of the edge band's tears), 0 from 0.77 s.
- No pops (motion.py 0.43–0.75 s; the held dome's stillness at 0.53–0.56 s as polish 7's re-check accepted it); no waterline
  (median step 1.0–1.5, 0 % of columns over 12); reduced motion byte-identical to its no-steam twin (frames 10–200);
  determinism (re-renders byte-identical); the Low tier (no edge pass; cheaper steps; clip runs as polish 6–7; grain T
  0.65–0.93, S 0.69–0.71); the tail 2 levels at 5.95 s (as polish 7); the clocks and `STEAM_END` (the unit tests); zero cost
  with no steam (`scene-depth.spec`, 5/5).

**Tests.** `tests/dinner-steam.test.ts` **30** (new: the steam's own light — the window's spread from its side and falling
steeply, the back light behind and above on the outer centimetre, the room's floor, the steam's tone curve ≥ 15 levels between
1 and 2 in linear radiance where the scene's gives ≈ 11, the radiance composite over the cove only; the edge band and its pass
— millimetre tears, one march pixel per CSS pixel, fewer steps, young clouds only; changed: the room no longer under a tenth of
the key); `tests/scene-depth.test.ts` 6, `tests/dinner.test.ts` 27; `tests/browser/dinner.spec.ts` 6/6,
`tests/browser/scene-depth.spec.ts` 5/5, `tests/browser/posters.spec.ts` 5/5 (fresh server); `pnpm typecheck` clean.

**The owner's view.** Item 1 is met on the judge's own-colour measures: the volume now has a lit side and a shade — the window's
side bright to 247–250, the far side and the underside at 207–232, never under the cove — and a back light's glow on its outer
layer against the cove, strongest on the rising cap. It is a steam rig, not the scene's: the rig's key alone could not do it on
this view (measured: ≤ +5), so the steam sees the window as the area light it is and a back light of its own, and its own
colour has a tone curve of its own; a supervisor may ask whether the shade side, now greyer, still reads as white steam at 1.2
s (`guest-laptop-css-p7top-p8bottom.png`). Item 2 is **not met**: the outline is crisper (its gradient 1.7–2.0, was 0.75–1.4) and
the band is marched at one pixel per CSS pixel, but the body's median gradient (0.68–1.02), the fine detail (0.47–0.64) and the
crown (1.15–1.76, horizontal) do not reach 1.2 / 0.6 / 2:1, and the grain is over 0.9 at 0.58–0.67 s (0.89–1.03). The judges'
measures pull against each other here: what raises the fine detail and the edge's gradient — finer structure, a finer march, a
brighter rim — is what the grain measures over the same pixels (the body is translucent, so its edge band is most of its
B > 15 mask). An eighth judge would see a lit, directional cloud with a glowing edge and a crisper outline, still a soft body
at 2×, a crown that is not streaked, and a little more grain than polish 7.

## Decisions

- **A material field, not particles.** Every sample asks where its air came from (the analytic flow's inverse), so
  the cloud's structure is carried with the flow: it stands, stretches, rolls and tears without scrolling.
- **The flow's inverse is tabulated per frame** (a flow map of the axisymmetric part, by nested bisections): exact
  to the bisection tolerance, at one texture fetch per sample.
- **Half-resolution march, depth-aware composite.** A full-resolution march cost 2–5 ms; the half-resolution one
  with probes and a light volume fits ≈ 1.5 ms with better lighting. (Polish 4: the march is budgeted by the steam's
  footprint and the CSS pixel, and its sharp features are integrated over each step rather than sampled: ≤ 3.0 ms.
  Polish 5: 0.5 of the buffer a side, 0.82–0.85 march pixels per CSS pixel, 34 / 28 / 20 steps: ≤ 6.0 ms. Polish 6: the
  boxes follow the visible, receding cloud and the gush's live parcels, 180 k march pixels, 0.46 a side at most:
  0.58–0.85 march pixels per CSS pixel, ≤ 5.4 ms at the app's real framing. Polish 8: the silhouette's band marched again at
  one pixel per CSS pixel while a cloud is young, with its own history.)
- **The steam lit on purpose** (polish 8): the window as an area light (the rig's key and its low spread), the room as the
  ambient, a back light of the steam's own composited as light against the cove, and a tone curve of the steam's own; the
  rig, the materials and the posters untouched.
- **Visible-steam physics over brightness.** In this front light, steam over the white plate is nearly invisible;
  the cloud reads against the cove, over the silver and over the table, and by its shade over the plate.
- **The scene depth is generic** and off unless a client asks: the other scenes' frames are byte-identical.
- **The accepted still keeps no steam** (v1.5's decision stands): posters and reduced motion unchanged.

## Known gaps

As of polish 8 (`v1.6/steam-polish8`, not merged; the eighth judging pending). Before it, as merged (7ca077f, polish 7), the
seventh judging: laptop 7, phone 7.5, **not signed**, on the two items polish 8 took up. The first build's own list (soft young
edge, no temporal accumulation, luminance-only steam, a subtle spill, a weak curl) was closed by the polish rounds.

- **Soft at 2×, the crown not streaked** (polish 8, item 2, not met): on the dome alone the edge band's gradient 0.68–1.02
  (≥ 1.2), fine detail 0.47–0.64 (≥ 0.6 at 0.48 and 0.67 s only), the crown 1.15–1.76:1 and horizontal (≥ 2:1 vertical);
  the outline itself is crisper (its gradient 1.7–2.0, was 0.75–1.4) and the silhouette's band is marched at one pixel per
  CSS pixel. What raises these measures raises the grain over the same pixels (prototype a3: 1.2 / 0.7 at grain 1.0–1.9).
- **More grain than polish 7**: over the backdrop temporal 0.89 / 0.93 / 0.79, spatial 1.03 / 0.75 / 0.64 at 0.58 / 0.67 /
  0.90 s (polish 7 0.74 / 0.70 / 0.57 and 0.87 / 0.61 / 0.48; target ≤ 0.9): the steam's own tone curve shows the march's
  residual noise more (the price of a shade side), the back light's glow and the edge pass add a little.
- **The light is a steam rig** (polish 8, item 1, met on own colour: +18 / +18 / +21): the rig's key alone gave ≤ +5 on this
  view, so the steam sees the window's low spread and a back light of its own, composited as light against the cove, with a
  tone curve of its own. The shaded side is greyer than polish 7's (207–232 of own colour); the rising cap's top is lit less
  than its underside at 1.1–1.3 s (top − underside −3 / −6); the fog in the lifted cloche's shadow veils its window
  reflection by 4–6 levels at 0.9–1.0 s (≈ 300 px "darker than what is behind it", not the cove).
- **The envelope's last tenth**: the mass rises 1 % at 1.12 s and is half its peak at ≈ 1.35 s (polish 7: falling every frame,
  half by 1.30 s); the dome's IoU at 0.48 s 0.69 (0.71); 63 faint pixels over the seated crown at 0.74 s on a decline (0).
- **The gush is a structureless soft puff** at 0.42–0.62 s: a limit of the spill parcels (its share of the visible steam at
  0.48 s 20.9 %; at CSS size a small spill from the gap).
- **The held dome's own stillness**: ≈ 2.6–2.8 levels a frame at 0.53–0.56 s, the intended slow rise (the seventh judge's
  re-check).
- **The cost**: 4.6–7.6 ms at the laptop and 4.5–6.9 at the phone (p10, `bench6.ts`), within the 9 ms budget, +2.2–2.8 ms
  over polish 7 while the edge pass runs (to ≈ 1.2 s). Phone pacing: 3 of 12 accepts had 3–4 frames of 33–50 ms under load
  (p95 16.7–16.8 in all; the polish-7 control clean ×3).
- **No reflection of the steam in the silver** (as v1.5).
- **The next approach** for the remaining softness (an offline simulation baked into a sparse 4D volume with millimetre
  filaments, or many more samples per pixel) is in `docs/RESUME.md`, a version of its own with its own budget; polish 8's
  prototype ruled out a 128³ per-frame advection at this budget (softer, +5–6 ms).

## Tests

(Of the first build. Each polish round's **Tests** line has its counts; as merged, `tests/dinner-steam.test.ts` 26,
`tests/scene-depth.test.ts` 6, `tests/dinner.test.ts` 27, `tests/browser/dinner.spec.ts` 6/6,
`tests/browser/scene-depth.spec.ts` 5/5; the integrated suites are in `docs/qualification.md` v1.6.)

- `tests/dinner-steam.test.ts` (20): the field is pure in τ; at the seat it is the dome's cavity (dense under the
  crown, nothing outside the cloche or on the porcelain); the dome's drag (1–5 cm up, stopping once the dome has
  gone, a centimetre along its path); the dome's shape held within 1.5 cm at 0.45 s, the bubble's slow start, the
  mushroom (top up > 8 cm, cap > 1.15× by 1.3 s); the base's slump out over the gilt rim and down; rise ≤ 25 cm/s,
  decelerating; forward(inverse(p)) = p within 0.5 cm wherever the cloud is; nothing in or under the plate or the
  table, the bounds hold all of it; tearing, evaporation, the veil's tail and `STEAM_END`; the spill from the raised
  side while the far rim is on the plate; a resumed reveal carries no cloud, the veil's soft cut; no steam in the
  accepted still; and the eight v1.5 on-stage clock tests, adapted (reveal clock, carry-on and idle, decline and
  host, reduced motion and settle, replay, change back, change of mind with capture, mid-rewind resume, eight
  quick changes).
- `tests/scene-depth.test.ts` (5): no renderer call without an active client, nor for a client elsewhere,
  inactive or hidden; one depth-only pass of the occluders' layer then `prepare`, everything restored, the target
  freed when no longer needed; the occluder marking; the stage's hook order.
- `tests/browser/scene-depth.spec.ts` (5): Party, Birthday, Sports and Business stills byte-identical with the hook
  removed (at rest, mid-sequence, later) and no depth pass drawn; Dinner draws it during the reveal, not for the
  accepted still.
- Results on the final code: `pnpm typecheck` clean; `pnpm test` 421 of 422 (30 files), the one failure a Party
  clearance test timing out at 180 s with the suite taking 1275 s under load (it passed in the earlier full run on
  this branch, 422/422, and does not touch the steam). Browser: `tests/browser/dinner.spec.ts` 6/6,
  `tests/browser/scene-depth.spec.ts` 5/5, the Dinner posters check 1/1 (0.00 % changed), the collection resource
  check 1/1 after the target-release fix. **The full browser suite was not completed** on the final code (an
  earlier partial run, under load, failed the collection resource check, since fixed, and two Party timing tests
  that do not involve the steam: `idle.spec.ts` off-screen pause and `party.spec.ts` cobalt label); it is left to
  the integration run.

## Evidence (first build, superseded — current figures and frames: Polish round 7 and `evidence/v1.6/steam-polish7/`)

The first build's and the first polish round's frames were not committed (the paths below were under
`evidence/v1.6/steam/` in the owner's worktree); the earliest committed steam evidence is
`evidence/v1.6/steam-polish2/`, and each later round has its own `evidence/v1.6/steam-polish<N>/`.

- `final/reveal-62fps/` (376 frames, 720 px, 62.5 fps, 0–6 s) and `final/reveal-62fps.mp4`; `final/nosteam-62fps/`
  (the same frames without steam); `final/strip-0-1s.png`, `final/strip-1-6s.png`, `final/consecutive-0.40s.png`,
  `final/consecutive-1.0s.png`, `final/steam-visibility-curve.txt` — all from the final code but the 16 % shadow.
- Close-ups at 1080 px (rendered before the round-1 fixes): `final/closeup-spill.png`, `final/closeup-dome-shape.png`,
  `final/closeup-roll-mushroom.png`, `final/closeup-tearing.png`, `final/closeup-veil.png`; after the fixes:
  `dome3-sheet.png` (0.45–0.69 s), `therm1-sheet.png` (0.8–2.1 s), `veil9-sheet.png` (veil alone, 1.5–4.2 s),
  `grain3.png`, `tip1-sheet.png` (0.26–0.50 s, the pop gone), `iter21-sheet.png`, `iter21-plate.png`.
- Changes of mind (720 px, every 32 ms; after the round-1 fixes but the last shadow changes):
  `final/change-0.5-sheet.png`, `final/change-2.0-sheet.png`, `final/changeback-sheet.png`, `final/double-sheet.png`.
- Real sizes (before the round-1 fixes): `final/real-laptop.png` (1280 × 720 @2), `final/real-phone.png`
  (390 × 844 @3), `final/real-sizes/square-540@2-*.png`; Low tier: `final/low-tier-sheet.png`.
- The reviewer's diff sheets: the session scratchpad (`steam/z5.png`, `z8.png`, `z11.png`, `c1–c3.png`).
