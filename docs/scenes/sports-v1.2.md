# Sports v1.2: fidelity pass on the scan-to-CAD masters

The foundation commit (c403a32) put the basketball and hoop masters into the scene. This pass keeps
the same beats and durations (host 1.2 s, accept 1.7 s, decline 1.6 s) and the one-gravity
closed-form flights, and adds the physics the textured models need: real spin, squash and stretch,
a net swish that follows the ball, and hoop recoil.

Files: `src/scenes/sports/sequences.ts` (choreography), `src/scenes/sports/index.ts` (applies a
frame), `models/sportsContract.ts` (net pose, recoil pivots), `models/sports.ts` (net deformer,
recoil rig, leather grade), `scripts/masters/recipes/sports.ts` (rim hinge pivot, cream albedo),
`tests/sports.test.ts`.

## v1.4 scale (2026-10-02)

Owner: *"the ball is small beside a giant hoop"* (brief: `docs/scale-fullscreen-brief.md`, Scale part). One world
scale, 1 unit = 20 cm (`models/worldScale.ts`).

- **Reference size: a mini (size 3) basketball, 18 cm.** The hoop master is a wall-mount mini hoop, and the brief's
  test holds: with the rim's inner diameter at 1.6 × the ball (28.8 cm), its board is 58.6 × 46 cm, a real mini hoop's
  proportions (a full-size 24 cm ball would need a 45.7 cm rim, 1.9 ×, and the master's board would then be 78 cm:
  not this hoop). The ball-to-hoop ratio is the master's own and unchanged; on the code-authored stand the rim stands
  62 cm above the floor.
- **How it is applied: `SPORTS_WORLD_SCALE` = 1.8** (the ball's 0.25 scene units are 9 cm). The whole scene scales
  together, so `sports_root` carries the scale at runtime (`src/scenes/sports/index.ts`) and every contract number,
  arc, net profile, pivot, clearance and test stays in scene units: the made arc, the airball's miss offset, the net
  bulge and the recoil are geometrically the same, the beats and durations unchanged (the scene's gravity is 1.8× in
  world units; nothing reads it in world units). The GLB is unchanged. The stage carries the bounds, frame points and
  hero silhouette into the world through the root, and the set (cove, key throw, shadow camera range and normal bias)
  scales with it (`src/render/rig.ts` setWall), so the backdrop and the shadows keep their v1.3 relation to the scene.
- **Framing (shared rule, `src/render/framing.ts`).** Same 18° lens, azimuth 20° and elevation 15° as every scene. The
  camera distance is set by the **hero**, the objects on stage at guest-ready, measured as their real silhouette
  (`silhouettePoints`, contact shadows and shadow proxies excluded): its height fills 60 % of the frame, or its width
  75 % when it is wide and low. Across, the hero sits centred unless a path needs the room; up and down, the frame
  centres the whole action; every authored path (`framePoints`) stays 4 % inside the edges. Checked in
  `tests/framing.test.ts` and on the real silhouettes in `tests/browser/framing.spec.ts`.
- **Measured hero (the ball on the floor, the hoop on its stand), 1:1 stage:** v1.3 0.841 of the height, 0.745 of the
  width; v1.4 **0.600 / 0.528**, held by its height, not path-limited (the airball and the made shot stay inside the
  4 % clearance). The cove at the frame's centre measures `#D5D2CD`.
- **Known gaps:** the ball still reads small beside the hoop: that is the real ratio of a mini ball to a mini hoop on a
  stand. A wall-mount hoop at a real mini height would make it smaller still.

## v1.3: the studio pass (2026-10-01)

- **Grade removed.** `LEATHER_GRADE`, the load-time colour multiply (0.78, 1.25, 3) that pulled the orange towards
  the v1.1 ball against the peach stage, is gone: the ball renders the master's albedo as authored (Look, below).
  The cream preset's ivory albedo is a preset, not a grade, and stays. `sports.glb` is unchanged, because the grade
  was applied at load.
- **New studio.** The production rig is `neutral-room` (`docs/style-reference.md` v1.3): the Models viewer's room at
  full environment strength, one soft key from its window, a greige cove that measures `#D7D4CF` in this scene (the
  token is `#D5D2CD`). The hoop steel's own environment is now the rig's 1.0, not 1.1, on every tier. The
  perspective lens keeps the shared view direction, so the airball offset and `SEAM_FRAME` are unchanged; this scene
  is the one the lens frames slightly larger than v1.1 did (1.02×).
- **Judges.** The orange reads as saturated orange-red leather with soft form, matching `basketball/B-hero.png`; one
  judge found it slightly more saturated than the master and would trim saturation, not darken. None wants the grade
  back. Open: a speckled PCF fringe in the net's shadow and at the hoop's base, and a diagonal shadow streak at the top
  right of the cove (`docs/qualification.md`, v1.3).
- Posters regenerated under the new rig (17.7–18.8 KB).

## What changed in the choreography, and why

| Beat | v1.2 foundation | Now |
| --- | --- | --- |
| Spin | Keyed angles per segment. The rate jumped at every boundary, and the ball slid on the floor. | Each segment is an angular-velocity profile, integrated exactly (Gauss–Legendre, polynomial rates). The spin rate is continuous everywhere (test: < 1.5 rad/s change per ms, the steepest being the bounce skid). |
| Shots | 7.5 rad over the made flight, 9.6 rad/s on the airball | Backspin of **2.5 rev/s** (made) and **2.2 rev/s** (airball) about the shot's roll axis. The gather rolls on the floor and then blends into the air rate as the ball leaves the hand. |
| Made shot in the net | Fixed 1.3 rad | The net grips the ball: its backspin eases (smoothstep) to the rate it will roll at after the bounce (0.93 rev/s). At landing the roll-out needs almost no skid. |
| Bounces | The roll spin started at landing | A skid lasts exactly the 35 ms floor contact (`SKID = CONTACT_HOLD`). The air spin hands over to the rolling rate only while the ball touches the floor. From then on, ω = (up × v)/R: rolling without sliding (test). |
| Host pass | 2.4 rad of backspin, then a 0.35 rad catch roll | The lob's backspin is solved (`W_PASS` = 4.86 rad/s, 0.77 rev/s). The total turn about the pass axis is still `GUEST_TURN` = −2.05 rad (mod 2π), so guest-ready keeps the orientation the master's seam cross was fitted to. The SEAM_FRAME test still passes, and the "( + )" faces the guest. |
| Squash | none | At every floor contact (two per sequence, including the catch hop): a volume-preserving scale on `ball_secondary`, (1/√(1−a), 1−a, 1/√(1−a)) along the floor normal. a ≤ 10 %, scaled by impact speed (first-contact peaks 8.4 / 8.8 / 10.0 % for host / accept / decline, second contacts 2.5 / 4.5 / 4.0 %; stretch on the rebound ≤ 1.6 %), with a short damped recovery (11 Hz, ζ 0.5) that fades to exactly 0, earlier if the sequence ends first. During the 35 ms contact the drawn ball stays on the floor (`ballDrop`), then rejoins the authored path at zero relative speed. `ball_secondary` never rotates (the spin moved to `ball_mesh`, composed over its rest orientation), so the squash axis stays vertical. The contact blob follows the drawn bottom and widens with the squash. |
| Net | Uniform widening of every row (`netOpenScale`) | **Ball-following bulge** (`NetPose`, `netOpening`). Each net vertex moves radially by a function of its rest depth and direction only, so strands, loops and knots at one place move together. A row opens just enough to clear the ball's cross-section at that height: a Gaussian cover with σ 0.3 sits over the half-chord with a 0.008 gap, and the ball's drift is included. A C1 soft ramp keeps rows above or below the ball at rest. The net also stretches while the ball drags it (≤ 20 %). Once the ball's top has left the bottom (`NET_EXIT`, 0.201 s after contact), the net rebounds: it shortens (−3.6 %), the lower rows pull in (≤ 2.1 cm), and it settles to exactly rest at 0.6 s after contact. |
| Rim and board | static | When the net tugs, damped step responses to the net's pull (contact → NET_EXIT): the rim pitches on its bracket hinge (peak 2.5° at 133 ms after contact, 4.5 Hz, ζ 0.55, back-swing −0.29°) and the board on its arm (peak 0.6° at 150 ms, 3.5 Hz, ζ 0.3, back-swing −0.2°). Both fade to exactly 0 by 0.6 s after contact and are C1 at the onset and at the release. The net rides with the rim (`recoilPoint`), and the bulge is computed in the recoiled net frame. |

Bug fixed on the way: the interrupted WIP started the rebound when the ball's centre passed the net's
bottom. Its snap then pulled the lowest cords 1 mm into the ball's top half. The rebound now starts at
`NET_EXIT`, and the clearance test (every direction × 121 rows × every ms, rows at their envelope
less the 12 mm vertex slack) keeps a ≥ 5 mm gap.

### Amplitude pass (legibility at stage size)

Three independent reviews found the recoil and the squash correct but too small to see on a 390 px
stage (rim 1.2°, board 0.3°, squash ≤ 8 %). They were raised to read without turning cartoonish:
rim 2.5° (limit `RECOIL_LIMIT.rimDeg` 3), board 0.6° (limit 0.8), squash ≤ 10 % (`SQUASH.max`).
Same shapes, onsets, fades and end times: every pulse still ends by its sequence's end, the
canonical poses are exact, the hoop is at rest 0.6 s after contact, the net clearance test keeps
its ≥ 5 mm gap and every flight still falls under one gravity. The 1 ms smoothness bounds scale
with the amplitude (squash step < 0.015 per ms, rim rate change < 0.04 rad/s per ms; the onset is
C1, the step response starts with zero rate). Measured in the 540 px captures: the rim's front edge
dips 6–7 px as the net grips the ball (`frames-accept` 64–74) and settles back by 80; the decline
landing compresses the ball from 75 to 68 px tall and widens it to 78 px (`frames-decline` 69–70).

Interruption: `sportsInterruptCut` cuts (rather than blends) while the net or the recoil is active.
`animatedNodes` now includes `ball_mesh` (the spin), so the blend interpolates the authored path,
the squash and the spin. `refresh()` rests the net and the recoil.

## Measured contract numbers

- Rim hinge `RIM_HINGE` = (0, 1.5300, −0.0071) hoop space. This is the bracket plate's back-bottom
  edge (recipe pivot `[0.5, 0, 0]` of `bracket-plate`; it was the back centre). Tipping about the
  edge the plate bears on lifts the plate off the board. Plate height above the hinge is 0.2155,
  and the gap to the board face is 1.5 mm. The rim's −0.29° back-swing moves the plate's top 1.1 mm
  towards the board, so it never touches (test: back-swing ≥ −0.5° and the plate's top travel
  < 1.5 mm; the touch angle is −0.40°, which is why the rim spring is damped at ζ 0.55).
- Board pivot `BOARD_PIVOT` = (0, 2.0847, −0.1249). This is the centre of the board's flat back.
- The GLB test checks both against the `rim` / `backboard` node origins (< 0.2 mm).
- Unchanged from the foundation: HOOP_SCALE 0.88692, RIM inner 0.4 / tube 0.0186, BOARD 1.6264 ×
  1.2788 × 0.183, NET depth 0.6837 with its 13-sample inner profile (waist 0.177 < BALL_R).

## Look

- **Orange leather (studio pass v1.3)**: the master's albedo renders as authored; the `LEATHER_GRADE` multiply
  described next was a compensation for the v1.1 peach stage and was removed (the judges re-check the ball under
  the new rigs). v1.2 record: the master's albedo (sRGB 223, 64, 10 median, matched to the scan) rendered
  at (238, 78, 33), hue 13°, in this studio. That is hotter than both the Models viewer, which
  shows the master at (212, 70, 24), hue 15°, under a grey studio, and the v1.1 ball at
  (232, 114, 52), hue 21°. A load-time linear multiply on the material colour
  (`LEATHER_GRADE` = 0.78, 1.25, 3; values above 1 are fine at runtime) gives (222, 82, 24),
  hue 17–18° at guest-ready. That is a touch deeper and more orange. A multiply keeps the pebble
  grain and mottling and maps the black seams to black. The recipe has no pixel function for a
  default-variant material, which is why this is done at runtime (see gaps).
- **Cream**: the generated albedo's panel colour moved from warm cream (239, 228, 205) to ivory
  (236, 229, 212). The lit side used to render identical to the peach stage, (251, 230, 201) vs
  (250, 231, 204); now it separates by hue.
- **Framing**: unchanged. The fit is bounded by the board's top-back corner and the guest ball's
  floor line. At aspect 1 the ball is 0.140 of the view width (v1.1 0.146), and ball + hoop
  fill 60–75 % (test). The mini hoop's board is larger relative to the ball than v1.1's. It cannot
  shrink, because the rim's inner radius is fixed at 1.6 × BALL_R and fixes HOOP_SCALE. Every path
  stays in frame, so the ball cannot grow on screen either. At guest-ready the ball keeps its
  v1.1 screen size and spot, foreground left.

## Export report (`pnpm models sports`, deterministic: two exports, SHA-256 4775b430…af1c both times)

```
triangles 259,206 · draw calls 11 (+ 1 shadow proxy, 2,436 tris, shadow pass only) · 22 nodes
textures 16 · 62.6 MiB as RGBA8 + mips
GLB 8071.5 KiB raw · 6159.4 KiB gzip
contract nodes missing: none
```

Frame times (headless Chrome on this machine, 390×844 @3x, Normal tier, 8 accept/decline plays,
872 frames): p50 16.70 ms, p99 16.80 ms, max 16.80 ms, none over 20 ms. The net deformer rewrites
about 78k vertices only while the net is active.

## Known gaps

- The orange grade lives at runtime (`models/sports.ts`), not in the GLB. A recipe pixel function
  for a default material (or a variant hack that also stores the ungraded albedo) would bake it.
  The Low tier and the variants keep the grade, because it is the material colour.
- The board's 0.6° recoil turns it about the centre of its back, while the stand's back plate
  (`hoop_hardware`) stays put. Up to 1.6 mm of overlap at the plate edges, hidden behind the board
  from the shared camera.
- The v1.1 shader ball's coral equator seam on the cream ball is not reproduced. The master's
  seam-distance data cannot tell one seam from another.
- The net's stretch is uniform over the rows below the rim (a lengthening fraction), not
  concentrated at the ball. The bulge is localised and travels with the ball.
- `docs/style-reference.md` still describes the net as `netOpenScale` (uniform flare). It is a
  shared file outside this agent's remit; the line to update is "**Net:** the master's net is
  narrower than the ball at rest; the made shot opens it …".
- The airball's and made ball's horizontal speed drops at the first bounce (2.55 → 1.55 u/s on
  the airball). This is kept from the foundation choreography, and it reads as the backspin biting.
  The host lob's landing into the catch hop (3.8 → 1.0 u/s) is the authored "catch".
