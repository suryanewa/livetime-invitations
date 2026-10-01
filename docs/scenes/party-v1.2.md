# Party v1.2: the record player is the scan-to-CAD turntable master

The Party scene now uses `models/masters/vintage-turntable.glb`, composed with a small code-authored
scaffold by `scripts/masters/recipes/party.ts` (`pnpm models party` → `assets/scenes/party/party.glb`).
The architecture is the same as before: the contract is in `models/recordContract.ts`, the rig in
`models/recordPlayer.ts`, and the choreography in `src/scenes/party/{poses,sequences,index}.ts`. The
beats, durations (host 1.2 s, accept 1.6 s, decline 1.4 s), song line and metadata logic are unchanged.

## Decisions

| Topic | Decision |
| --- | --- |
| Scale and placement | `TT_SCALE = 2.1 / 1.855` (1.13208). The master plinth is 1.855 wide and becomes 2.1 wide, the v1.1 player width. The plinth's x/z centre is placed at the origin and the feet stand on y = 0, which puts the deck at 0.341, the v1.1 deck height. +z already faces the guest. |
| Body | Every static master part (plinth, feet, deck screws, bearing skirt, tonearm base, arm-lift base and post, anti-skate, cue post, speed knob, button collar, plinth-side hinge halves) is anchored under `player_body` and joined per material: 36 meshes become 6. |
| Platter | The master `platter` is the contract node. Its pivot is on the spindle axis at the mat's top, which is the record seat. `rubber_mat` and `spindle` are its children. The bearing skirt stays static. |
| Record | `record_authored` is created at the record's bottom centre. `record_secondary` is its child and carries the spin and the settle. The master `record` (renamed `record_vinyl`), `record_edge` and `record_label` sit under `record_secondary`. The record is 0.0096 thick, under the stage's 0.015 shadow-caster floor, so a decimated proxy of `record_edge` casts its shadow (`record_shadow_proxy`, 368 tris). |
| Tonearm (gimballed) | `tonearm_pivot` is created at the gimbal bearing, which is the master `tonearm_gimbal`'s own origin (`point: 'origin'`). It is turned to the master's cue yaw, so the stylus lies on +Z of the arm frame. `tonearm_pivot` yaws. `tonearm_lift` sits at the same origin and pitches. The gimbal housing yaws only. The counterweight stack, arm socket, tube and headshell assembly all pitch with the lift. |
| Cueing | The master cue-lever handle (`cue_lever`, pivot at its post's top) and the arm-lift bar (`cue_lift`) are mapped. The rig turns the lever and raises the bar from the arm's lift. |
| Tonearm rest | The master has no rest: its arm is posed playing. The scaffold adds a turned chrome post with a black-anodised cradle under the parked tube. It uses placeholder materials named after the master's, and the rig swaps in the master's own material instances. |
| Dust cover hinge | The master `dust_cover` origin is on the hinge pins' axis (y −0.387, z −0.609 scan, checked against both `hinge_*_pin` boxes in the test), so it becomes `lid_hinge` unchanged. The master poses the lid open at −62.4° about +X, which is a 27.6° lean back from vertical. That angle is `LID.open`, and `LID.closed` is 0. |
| Dust cover length | The master cover is a short display lid. Closed, it would stop 0.30 scan short of the plinth front, cut through the platter rim and the speed knob, and leave the counterweight poking through its top. `extendLid` (rig) lengthens it in place by piecewise translation: front +0.33, up +0.034, left +0.04, right +0.065 scan. The fillets, rim and tab keep their exact shape. The closed outer box is `LID_CLOSED_BOX`. |
| Lid self-shadow | The lid shell does not receive shadows. Mid-close, the key light grazes its inside back wall, and the shadow of its own top panel there stair-stepped into a saw-tooth under the studio's 16 fixed PCF taps (a shared filter). The rig re-asserts `receiveShadow = false` per draw. The cover still casts. |
| Status | The master has no LED or lens. The start/stop key cap (`button_cap` → `player_status`) gets its own clone of the aluminium material and lights green (`#3BE08A`, emissive, frosted) from the playback beat. The v1.1 perforation row and status lens are dropped. |
| Materials | Every master material keeps its look and is renamed `tt_*`. The metals (plinth, aluminium, chrome) get their own environment at 1.1 (metalness ≥ 0.5). The smoked lid plastic is opaque in the master and stays opaque. |
| Label presets | The label presets are KHR_materials_variants: `paper` (the master's olive print, the file default, never selected by the app), `coral` and `cobalt`. `labelPrint()` reads each texel's ink weight from its luminance between the olive field and the ink, then substitutes the preset's field and ink pair in linear light. Anti-aliased edges keep their partial weight, and darker strokes keep their relative weight. This is deterministic, and the three prints are stored lossless. The master label UVs are a disc print that does not fit the library's `mat_label_*`, so variants were used instead of renaming. |
| Textures | The vinyl's 8192×4 groove normal and anisotropy LUTs are kept exact automatically. The test checks the decoded texels against the master. The brushed-plinth normal is lossless. The plinth ORM is lossy q90 at 1024². |
| Framing | `partyFramePoints` (silhouette samples of every path) plus a 0.17 side margin (`FRAME_MARGIN_X`). The plinth fills 74.6 % of the stage width, against v1.1's 74.9 % (the test band is 60–75 %). |

## Measured contract (scene units, from the master × TT_SCALE; re-measured on the GLB by tests/party.test.ts)

| Item | Value |
| --- | --- |
| Plinth | 2.1 × 1.619, deck 0.3408, feet on y = 0 |
| Platter (spindle axis) | x −0.1783, z 0.0079; radius 0.789; seat (mat top) `PLATTER_TOP` 0.4223; spindle radius 0.01755, height 0.0790 above the seat |
| Record | radius 0.7608, thickness 0.00962, label radius 0.2626, hole radius 0.01789 (0.34 mm round the spindle), lead-in groove 0.6723, `RECORD_TOP` 0.4319 |
| Tonearm bearing | pivot (0.7104, 0.5355, −0.4494); arm length 0.8741; drop 0.1010; cue yaw −0.3733 (master pose); parked −0.04; played −0.4023; lifted pitch −0.035; contact pitch +0.00294 |
| Rest saddle | (0.778, 0.4788, 0.0971) |
| Lid hinge | (−0.0142, 0.3555, −0.8196); open −1.08909 rad (27.6° lean); closed outer box x ±1.044, y 0.343–0.636, z −0.845–0.853 (tab) |
| Motion bounds | x ±1.22, y 0–2.02, z −1.9–0.86 |

## Choreography: what changed and why

- **Host: seat-and-settle.** In v1.1 the record rocked between two opposite edges, and the centre was lifted by R·|sin θ|. That has a velocity kink each time the contact point jumps edges. The record now settles like a coin. It touches down at 0.75 s with zero velocity. A small tilt vector then precesses at 3.2 turns/s while it decays (τ 0.09 s, windowed to exactly 0 at 1.05 s). The record turns about its lowest rim point, and its centre rises by R·sin(true tilt), so the edge rides exactly on the mat. The peak tilt is 0.0065 rad, a rim excursion of about 5 mm. This is C1 throughout.
- **Host: level earlier.** The presentation tilt is now zero by 0.44 s (was 0.48 s). The master's spindle is taller (0.079 vs 0.045), so the record has to be level higher up to clear `LEVEL_BY`.
- **Accept: gimballed cue.** The arm lifts off the rest (0–0.08 s) and swings to the lead-in groove (0.04–0.25 s) on the master bearing. The cue damper then lowers it (0.25–0.40 s) onto the already turning record. The counterweight pitches with it. The cue lever and lift platform follow the lift. During interruption blends the yaw-derived pitch ceiling lifts the stylus clear of the vinyl and the rest's prongs.
- **Accept: belt drive.** The motor starts at 0.30 s. The platter follows through the elastic belt as a critically damped lag, ω = ω_ss·(1 − (1 + a·u)·e^(−a·u)) with a = 13.5/s, so it starts with zero angular acceleration and reaches 95 % of speed in about 0.35 s. The steady state is 33⅓ rpm × 2.19 (7.63 rad/s; a silent 1.6 s clip has to read as playing). It brakes along a smootherstep from 1.10 s to rest at 1.60 s, on the display angle (−(2π + 0.6)). The spin is the closed-form integral, so it is exact and monotonic. The record and platter share one angle, and the label print makes the turn visible.
- **Decline: damped hinge.** The lid is released from the master's 27.6° lean as one continuous Beta(2, 4) CDF over 0.20–1.30 s: gravity start, a single speed peak, and the damper brakes it into contact at zero speed. It never passes closed.

## Export report (`pnpm models party`, deterministic: two exports, same SHA-1 b31dc540…)

```
triangles 97,948 · draw calls 28 (+ 1 shadow proxy, 368 tris, shadow pass only) · 60 nodes
textures 7 · 27.0 MiB as RGBA8 + mips
GLB 2334.5 KiB raw · 1159.2 KiB gzip
contract nodes missing: none
```

Frame pacing in headless Chrome on this machine (1200×1000 at DPR 2, Normal tier): host, accept and decline each have a median 16.7 ms and a maximum of 16.8 ms per frame (60 fps).

## Tests

`tests/party.test.ts` (31 tests) covers:

- canonical poses at the ends of every sequence;
- 1 ms continuity;
- C1 (no channel changes speed by more than 10 % of its peak in 0.5 ms, beat boundaries included, starts and ends at rest);
- the status beat;
- the record level and centred before the spindle, never below the mat, and the hole never binding;
- the settle;
- spin monotonic, the belt lag and steady state;
- the stylus on the groove;
- lifted swings;
- the lid's monotonic soft close.

It also reads the exported GLB to check the contract nodes, body, platter axis, record pivot, gimbal pivot and stylus tip, hinge-pin axis, cue parts, variants and exact LUTs.

On the GLB geometry (`tests/partyGlb.ts` builds a three.js hierarchy from it) it checks:

- the extended lid box;
- the closed lid enclosing every part;
- a 133-step lid sweep that cuts nothing;
- the open lid clearing the hovering record and the playing arm;
- the parked tube lying in the cradle between its prongs;
- nothing on the arm except the stylus touching the vinyl;
- motion bounds;
- an interruption with the real nodes;
- framing.

`tests/browser/party.spec.ts` runs unchanged (9 tests pass).

## Known gaps

- **Interruption spin.** The visual director's blend slerps every animated node linearly, along the shortest path. An Accept→Decline change mid-spin therefore turns the record back by up to π in 150 ms, and the velocity jumps at the blend's ends. This is shared behaviour (v1.1 did the same), in `src/core/visualDirector.ts`, which this pass may not edit.
- **Hovering vinyl.** At the 0.9 rad presentation tilt the vinyl's clearcoat reflects the bright sweep, so the hovering record reads warm grey with lighter track gaps, not jet black. This is the master's material, kept as it is.
- **Shared docs.** `docs/asset-manifest.md`, `docs/style-reference.md`, `docs/qualification.md` and `docs/spec-revisions.md` are not updated here; they are shared files. The rows they need are this document's decisions and report.
- **Lid self-shadow.** The lid shell does not receive shadows (see Decisions). A record hovering in front of the open lid casts no shadow onto its inside.
