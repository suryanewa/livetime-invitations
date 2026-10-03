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
client's `prepare` runs. Camera layers, override material, background and render target are restored.
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

## Numbers

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

## Decisions

- **A material field, not particles.** Every sample asks where its air came from (the analytic flow's inverse), so
  the cloud's structure is carried with the flow: it stands, stretches, rolls and tears without scrolling.
- **The flow's inverse is tabulated per frame** (a flow map of the axisymmetric part, by nested bisections): exact
  to the bisection tolerance, at one texture fetch per sample.
- **Half-resolution march, depth-aware composite.** A full-resolution march cost 2–5 ms; the half-resolution one
  with probes and a light volume fits ≈ 1.5 ms with better lighting.
- **Visible-steam physics over brightness.** In this front light, steam over the white plate is nearly invisible;
  the cloud reads against the cove, over the silver and over the table, and by its shade over the plate.
- **The scene depth is generic** and off unless a client asks: the other scenes' frames are byte-identical.
- **The accepted still keeps no steam** (v1.5's decision stands): posters and reduced motion unchanged.

## Known gaps

- **Not re-reviewed after the round-1 fixes**, and the final frame cost not re-measured (machine load).
- **The curled mushroom rim is weak on screen**; the cap reads as swelling and rounding more than curling.
- **The young cloud's edge is still soft** (a feathered look at 1:1 in close-ups).
- **No reflection of the steam in the silver** (as v1.5).
- **No temporal accumulation:** the dither is fixed per pixel (deterministic captures); thin wisps show a soft
  mottling at 1:1.
- **Steam is luminance only** in the half-resolution target (white, tinted 1:1:1 in the composite).
- **The spill is subtle**: thin, it reads mainly at the cloche's silhouette during 0.15–0.35 s.

## Evidence (not committed; `evidence/v1.6/steam/`)

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
