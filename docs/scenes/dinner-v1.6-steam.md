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
  stays, the stem narrows to 70 %, the cap spreads by 0.32 per unit of rise (a thermal's entrainment). (3) The
  vertical map: the thermal's rise (buoyant start τ_b 0.3 s, entrainment τ_m 1.6 s, peak ≈ 13 cm/s at ≈ 0.7 s
  after the release; `riseAt`), strongest on the axis (the edge loses 38 %: the cap domes and its edge lags),
  the dome's drag up while it is over the cloud (`dragAt`, below), the cap's squash. (4) The vortex ring: a twirl
  in the meridional plane about a core inside the cap's edge, carried with it, its angle up to 3.4 rad
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
  middle), mushrooms to ≈ 1.4 s, and is gone by τ 3.2 s (`CLOUD.life`).
- **The look over age (`cloudLook`).** Young, the cloud is fog with a soft edge; then the room's air folds its
  edge into thin, bright sheets (the mixing layer) and empties its inside, the threshold above which air keeps its
  droplets rises (evaporation of the thin parts first), and the sheets gather into a few larger wisps.
- **The veil (`veilSource`, `veilDensity`).** The uncovered plate goes on breathing: a column off the well rising
  at 19 cm/s, its source full by 0.6 s, a first rush and a 45 % tail decaying over 1.25 s, fading in over its first
  2 cm and evaporating with height; drawn as a few folded sheets that snake and twist as they rise.
- **The spill (`spillSource`).** During the handle-led tip the raised rim's gap (up to 2 cm) is a doorway: the
  saturated layer leaks from the top of the gap and is caught by the hot dome's boundary layer: a thin sheet
  climbing the raised side's outer wall at ≈ 25 cm/s, strongest where the gap is widest, fed until lift-off and
  carried off by 0.46 s.
