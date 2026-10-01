# Party v1.2: the record player is the scan-to-CAD turntable master

The Party scene now uses `models/masters/vintage-turntable.glb`, composed with a small code-authored
scaffold by `scripts/masters/recipes/party.ts` (`pnpm models party` → `assets/scenes/party/party.glb`).
The architecture is the same as before: the contract is in `models/recordContract.ts`, the rig in
`models/recordPlayer.ts`, and the choreography in `src/scenes/party/{poses,sequences,index}.ts`. The
beats, durations (host 1.2 s, accept 1.6 s, decline 1.4 s), song line and metadata logic are unchanged.

**v1.2.1 polish (judges' review).** Must-fix: the smoked cover no longer flashes pale cream mid-close, and its
inside stays dark (Decisions: Lid look). Minor items done: the host's align and lower are one gesture, the settle is
doubled, the spindle reads as turned steel, and the plinth is toned towards graphite. Kept, with reasons (Known
gaps): the interruption blend (shared `visualDirector.ts`), the lid's proportions, the tonearm's size at stage
scale and the label wedge.

## v1.3: the studio pass (2026-10-01)

- **Grades removed** (rows marked v1.3 in Decisions): `PLINTH_TONE` (the brushed steel is the master's factor),
  the lid's satin outer coat (`LID_LOOK.outer`; the master's clearcoat 0.6 at 0.08, roughness 0.3), `SPINDLE_LOOK`
  (the spindle is the master's chrome) and the label's quarter wedge and butter sliver. The coral and cobalt labels
  are the master's print with only its field and ink recoloured; the master's off-centre square carries the spin,
  and `tests/party.test.ts` checks on the exported prints that the square's quarter holds clearly more ink than the
  opposite one. The darker interior shell with baked occlusion (`splitLidInterior`) stays, as the brief allows.
- **Re-export:** `party.glb` 2334.6 KiB raw / 1032.4 KiB gzip −9 (2,390,588 / 1,057,191 bytes; was 2355.3 / 1053.6 KiB, 2,411,828 / 1,078,855 bytes at `fd136ac`); the label prints are 16 KiB
  each (were 26 and 27). Triangles and draw calls unchanged.
- **New studio.** The production rig is `neutral-room` (`docs/style-reference.md` v1.3); the cove measures `#D1CEC8`
  in this scene (token `#D5D2CD`). The plinth, aluminium and chrome get the rig's own environment 1.0 on every tier.
- **Judges.** The plinth reads as neutral taupe-grey brushed steel like the master (the bronze cast came from the
  light), the tonearm and spindle as chrome, the lid's exterior correctly. None wants a grade back. Open: the lid's
  inside renders near-black (p1 21), which the judges would lift with baked occlusion or a warm bounce, not a grade;
  no reviewer has yet watched the accept spin on the master's print. The 0.65 rad presentation tilt was set below
  the v1.1 key's specular lobe and was not re-derived for the new key.
- Posters regenerated under the new rig (15.3–16.7 KB, shared declined 7.7 KB).

## Decisions

| Topic | Decision |
| --- | --- |
| Scale and placement | `TT_SCALE = 2.1 / 1.855` (1.13208). The master plinth is 1.855 wide and becomes 2.1 wide, the v1.1 player width. The plinth's x/z centre is placed at the origin and the feet stand on y = 0, which puts the deck at 0.341, the v1.1 deck height. +z already faces the guest. |
| Body | Every static master part (plinth, feet, deck screws, bearing skirt, tonearm base, arm-lift base and post, anti-skate, cue post, speed knob, button collar, plinth-side hinge halves) is anchored under `player_body` and joined per material: 36 meshes become 6. |
| Platter | The master `platter` is the contract node. Its pivot is on the spindle axis at the mat's top, which is the record seat. `rubber_mat` and `spindle` are its children. The bearing skirt stays static. |
| Record | `record_authored` is created at the record's bottom centre. `record_secondary` is its child and carries the spin and the settle. The master `record` (renamed `record_vinyl`), `record_edge` and `record_label` sit under `record_secondary`. The record is 0.0096 thick, under the stage's 0.015 shadow-caster floor, so a decimated proxy of `record_edge` casts its shadow (`record_shadow_proxy`, 368 tris). |
| Tonearm (gimballed) | `tonearm_pivot` is created at the gimbal bearing, which is the master `tonearm_gimbal`'s own origin (`point: 'origin'`). It is turned to the master's cue yaw, so the stylus lies on +Z of the arm frame. `tonearm_pivot` yaws. `tonearm_lift` sits at the same origin and pitches. The gimbal housing yaws only. The counterweight stack, arm socket, tube and headshell assembly all pitch with the lift. |
| Cueing | The master cue-lever handle (`cue_lever`, pivot at its post's top) and the arm-lift bar (`cue_lift`) are mapped. The rig turns the lever and raises the bar from the arm's lift. |
| Tonearm rest | The master has no rest: its arm is posed playing. The scaffold adds a turned chrome post with a black-anodised cradle under the parked tube. Its materials are exact copies of the master's `chrome` and `black_anodised` (factors as stored, clearcoat included) under the renamed names, so the export's dedup folds them into the master's own: the GLB holds one `tt_chrome` and one `tt_black_anodised`, and nothing is rebound at runtime. |
| Parked arm | `TONEARM.parkedYaw` is +0.04 rad, 23.7° out from the cue (the first pass had −0.04, 19°). The headshell and cartridge park beside the platter: the nearest point of the pitching arm is 0.169 beyond the platter rim in plan, up from 0.115. From the 15° camera the headshell still meets the silver rim's front-right edge in projection, but by less. |
| Dust cover hinge | The master `dust_cover` origin is on the hinge pins' axis (y −0.387, z −0.609 scan, checked against both `hinge_*_pin` boxes in the test), so it becomes `lid_hinge` unchanged. The master poses the lid open at −62.4° about +X, which is a 27.6° lean back from vertical. That angle is `LID.open`, and `LID.closed` is 0. |
| Dust cover length | The master cover is a short display lid. Closed, it would stop 0.30 scan short of the plinth front, cut through the platter rim and the speed knob, and leave the counterweight poking through its top. `extendLid` (rig) lengthens it in place by piecewise translation: front +0.33, up +0.034, left +0.04, right +0.065 scan. The fillets, rim and tab keep their exact shape. The closed outer box is `LID_CLOSED_BOX`. |
| Lid self-shadow | The lid shell does not receive shadows. Mid-close, the key light grazes its inside back wall, and the shadow of its own top panel there stair-stepped into a saw-tooth under the studio's 16 fixed PCF taps (a shared filter). The rig re-asserts `receiveShadow = false` per draw (on both halves of the split shell). The cover still casts. The interior's own material and baked occlusion (next row) stand in for the lost self-shadow. |
| Lid look (v1.2.1; outer coat removed in v1.3) | **Studio pass v1.3:** the outside now keeps the master's own coat (clearcoat 0.6 at 0.08, roughness 0.3); the satin regrade below was fitted to the v1.1 cream softbox and orthographic camera and was removed so the cover is judged under the new rigs. The interior split stays. v1.2.1 record: `splitLidInterior` (rig) splits the extended shell by face orientation: a triangle whose normal points towards the closed box's centre is inside. The inside becomes `lid_shell_inner` with `tt_lid_inner`: the lid colour × 0.7, no clearcoat, roughness 0.6, specular 0.5, and occlusion baked into vertex colours from 1.0 at the open rim to 0.6 under the top panel (depth^1.5). The outside keeps `tt_lid` as a satin coat: clearcoat 0.6 → 0.25, clearcoat roughness 0.08 → 0.5, roughness 0.3 → 0.55, specular 0.5 (`LID_LOOK`). Why: the cover's front wall (uppermost while open) meets the key's mirror direction at about 32° open, which the Beta(2, 4) close passes at its speed peak; the wall is flat, the camera orthographic and the key far, so every texel shared one half-vector and the whole wall flashed pale cream at once. Four coats were rendered side by side over decline frames 28–40 (the master's, 0.3/0.3, 0.25/0.5, 0.15/0.6); 0.25/0.5 is the lightest that keeps the wall dark bronze at the mirror angle while the closed cover keeps a visible sheen. |
| Plinth tone (v1.2.1; removed in v1.3) | **Removed in the studio pass v1.3:** the plinth renders with the master's own factor (a compensation for the v1.1 peach studio). v1.2.1 record: the brushed steel's base factor keeps 92 % of its luminance and 40 % of its chroma (`PLINTH_TONE` in the recipe: linear 0.202, 0.178, 0.153 → 0.174, 0.165, 0.156). Under the warm key and cream softbox the master's own factor read warm bronze against the master renders' dark graphite-taupe. Textures untouched. |
| Spindle (v1.2.1; removed in v1.3) | **Removed in the studio pass v1.3:** the spindle is the master's mirror chrome again; under a rig with real reflections it should read as chrome. v1.2.1 record: the spindle got its own clone of the chrome (`tt_spindle`): linear grey 0.42, roughness 0.24 (`SPINDLE_LOOK`). The mirror chrome (0.89, 0.07) reflected only the even cream softbox and read as a flat pale post on the label; the turned steel shades round the cylinder and catches the key down one side. |
| Status | The master has no LED or lens. The start/stop key cap (`button_cap` → `player_status`) gets its own clone of the aluminium material and lights green (`#3BE08A`, emissive, frosted) from the playback beat. The v1.1 perforation row and status lens are dropped. |
| Materials | Every master material keeps its look and is renamed `tt_*`. The metals (plinth, aluminium, chrome) get their own environment at 1.1 (metalness ≥ 0.5). The smoked lid plastic is opaque in the master and stays opaque. |
| Label presets | **Studio pass v1.3:** the prints are the master's own art recoloured, nothing painted on (`labelPrint` keeps only the field and ink substitution); the wedge and sliver below were removed. The master's off-centre square is the asymmetric mark the accept spin reads by; if the judges find the spin no longer reads, add the smallest mark that fixes it (a small off-centre dot), not a wedge. v1.2 record: the label presets are KHR_materials_variants: `paper` (the master's olive print, the file default, never selected by the app), `coral` and `cobalt`. `labelPrint()` reads each texel's ink weight from its luminance between the olive field and the ink, then substitutes the preset's field and ink pair in linear light. Anti-aliased edges keep their partial weight, and darker strokes keep their relative weight. Under the ink it paints the v1.1 label's bold quarter wedge (130°–220°, in the other preset's colour: navy `#1D3180` on coral, coral on cobalt) and its butter sliver (220°–232°), anti-aliased over one texel, on the side the master's bars and square leave clear; the master's rings and centre ring print over it. The inks are darker than the first pass (coral `#54160C`, cobalt `#060A28`): field-to-ink contrast ratio 5.2 and 3.0, up from 3.7 and 2.4; field to wedge 4.3 and 2.4, on top of the hue contrast. The vinyl's sheen is rotationally symmetric and the master's marks are small, so without the wedge the accept spin hardly read. This is deterministic, and the three prints are stored lossless. The master label UVs are a disc print that does not fit the library's `mat_label_*`, so variants were used instead of renaming. |
| Textures | The vinyl's 8192×4 groove normal and anisotropy LUTs are kept exact automatically. The test checks the decoded texels against the master. The brushed-plinth normal is lossless. The plinth ORM is lossy q90 at 1024². |
| Presentation tilt | `HOVER.tilt` is 0.65 rad (was 0.9). From about 0.8 rad up, the studio key's broad specular lobe on the vinyl (roughness 0.38, anisotropy 0.8) fills the disc: it read as a grey-silver CD with white rings, then fell off within a few hundredths of a radian, so the record flipped to black in two frames at the start of the host beat. The vinyl's clearcoat and the environment are not the cause (measured: clearcoat 0, or its own environment at 0 to 0.52, leave the frame unchanged). At 0.65 the record reads black with a faint groove sheen and the label still faces the camera; the host path (0.65 → 0.30 → 0) never crosses the lobe. The master's vinyl material is untouched. `TILT_MAX_SHEEN` (0.7) is the measured bound the test holds it under. |
| Framing | `partyFramePoints` (silhouette samples of every path) plus a 0.17 side margin (`FRAME_MARGIN_X`). The plinth fills 74.6 % of the stage width, against v1.1's 74.9 % (the test band is 60–75 %). |

## Measured contract (scene units, from the master × TT_SCALE; re-measured on the GLB by tests/party.test.ts)

| Item | Value |
| --- | --- |
| Plinth | 2.1 × 1.619, deck 0.3408, feet on y = 0 |
| Platter (spindle axis) | x −0.1783, z 0.0079; radius 0.789; seat (mat top) `PLATTER_TOP` 0.4223; spindle radius 0.01755, height 0.0790 above the seat |
| Record | radius 0.7608, thickness 0.00962, label radius 0.2626, hole radius 0.01789 (0.34 mm round the spindle), lead-in groove 0.6723, `RECORD_TOP` 0.4319 |
| Tonearm bearing | pivot (0.7104, 0.5355, −0.4494); arm length 0.8741; drop 0.1010; cue yaw −0.3733 (master pose); parked +0.04; played −0.4023; lifted pitch −0.035; contact pitch +0.00294 |
| Rest saddle | (0.8215, 0.4788, 0.0900) |
| Lid hinge | (−0.0142, 0.3555, −0.8196); open −1.08909 rad (27.6° lean); closed outer box x ±1.044, y 0.343–0.636, z −0.845–0.853 (tab) |
| Motion bounds | x ±1.22, y 0–2.02, z −1.9–0.86 |

## Choreography: what changed and why

- **Host: one gesture (v1.2.1).** The align (0–0.22 s, over the spindle) and the lower (0.12 s to contact at 0.75 s) overlap: the record position is HOVER plus the eased align step plus the eased lower step, and the tilt likewise (level by 0.40 s, was 0.44, because the record now descends sooner). Both steps move the record down and level it, so height and tilt stay monotonic and the sum is C1. The record's speed no longer stops between them: its minimum across the hand-over is 13 % of the host's peak (was about 0), and the captured frame diff bottoms at 0.58 (frame 14) where it was 0.03. It reads as one hand setting the record down.
- **Host: seat-and-settle.** In v1.1 the record rocked between two opposite edges, and the centre was lifted by R·|sin θ|. That has a velocity kink each time the contact point jumps edges. The record now settles like a coin. It touches down at 0.75 s with zero velocity. A small tilt vector then precesses at 3.2 turns/s while it decays (τ 0.09 s, windowed to exactly 0 at 1.05 s). The record turns about its lowest rim point, and its centre rises by R·sin(true tilt), so the edge rides exactly on the mat. v1.2.1 doubles it so it registers at stage size: amplitude 0.024 (was 0.011), peak tilt 0.0141 rad, a rim excursion of 10.8 mm in scene units (was 5 mm; about 2 mm on a real 12-inch record). Captured frame diff during the settle 0.22–0.26 (was 0.11–0.13). This is C1 throughout.
- **Host: presentation tilt 0.65.** The record hovers tipped 0.65 rad towards the camera, not 0.9, so it reads black at host-ready and in the posters, and its shade changes smoothly as it aligns and lowers (see Decisions). Captured: the frame's dark-pixel count falls monotonically 33.5k → 25.5k over the align (the disc foreshortening), where the first pass jumped 11.5k → 23.3k → 30.1k in two frames; the largest frame-to-frame mean difference is 3.0 at the align's speed peak, a smooth bell, against 3.96 at the flip.
- **Host: level earlier.** The presentation tilt is now zero by 0.40 s (0.48 s in v1.1, 0.44 s in the first v1.2 pass). The master's spindle is taller (0.079 vs 0.045), so the record has to be level higher up to clear `LEVEL_BY`.
- **Accept: gimballed cue.** The arm lifts off the rest (0–0.08 s) and swings to the lead-in groove (0.04–0.25 s) on the master bearing. The cue damper then lowers it (0.25–0.40 s) onto the already turning record. The counterweight pitches with it. The cue lever and lift platform follow the lift. During interruption blends the yaw-derived pitch ceiling lifts the stylus clear of the vinyl and the rest's prongs.
- **Accept: belt drive.** The motor starts at 0.30 s. The platter follows through the elastic belt as a critically damped lag, ω = ω_ss·(1 − (1 + a·u)·e^(−a·u)) with a = 13.5/s, so it starts with zero angular acceleration and reaches 95 % of speed in about 0.35 s. The steady state is 33⅓ rpm × 2.19 (7.63 rad/s; a silent 1.6 s clip has to read as playing). It brakes along a smootherstep from 1.10 s to rest at 1.60 s, on the display angle (−(2π + 0.6)). The spin is the closed-form integral, so it is exact and monotonic. The record and platter share one angle. The label's wedge makes the turn visible: in the captures the navy (or coral) quarter sweeps round the label every frame, and the whole-frame mean difference during the spin is 0.03–0.04 grey levels, up from 0.01–0.02, all of it on the label.
- **Decline: damped hinge.** The lid is released from the master's 27.6° lean as one continuous Beta(2, 4) CDF over 0.20–1.30 s: gravity start, a single speed peak, and the damper brakes it into contact at zero speed. It never passes closed.

## Export report (`pnpm models party`, deterministic: two exports, same SHA-1 9251469d…)

```
triangles 97,948 · draw calls 28 (+ 1 shadow proxy, 368 tris, shadow pass only) · 60 nodes
textures 7 · 27.0 MiB as RGBA8 + mips
label prints 18 / 26 / 27 KiB (paper / coral / cobalt, lossless WebP)
GLB 2355.3 KiB raw · 1180.4 KiB gzip
contract nodes missing: none
```

Frame pacing in headless Chrome on this machine (1200×1000 at DPR 2, Normal tier), measured on the first pass: host, accept and decline each have a median 16.7 ms and a maximum of 16.8 ms per frame (60 fps). The fixes change no geometry, draw call or shader (one label texture each, the same size), so it was not re-measured.

## Tests

`tests/party.test.ts` (39 tests) covers:

- canonical poses at the ends of every sequence;
- 1 ms continuity;
- C1 (no channel changes speed by more than 10 % of its peak in 0.5 ms, beat boundaries included, starts and ends at rest);
- the status beat;
- the presentation tilt below the key's specular lobe (`TILT_MAX_SHEEN`), only decreasing on the host path;
- the record level and centred before the spindle, never below the mat, and the hole never binding;
- the host as one gesture (speed ≥ 10 % of its peak from 0.06 s to 0.45 s, across the hand-over);
- the settle (rim excursion 8–15 mm);
- spin monotonic, the belt lag and steady state;
- the stylus on the groove;
- the label prints (on a synthetic print through `labelPrint`): the wedge and sliver where they belong, the field half a turn away, and the wedge and ink contrast;
- lifted swings;
- the lid's monotonic soft close.

It also reads the exported GLB to check the contract nodes, body, platter axis, record pivot, gimbal pivot and stylus tip, hinge-pin axis, cue parts, variants, the rest sharing the master's chrome and black anodising (one material each, clearcoat kept) and exact LUTs.

On the GLB geometry (`tests/partyGlb.ts` builds a three.js hierarchy from it) it checks:

- the extended lid box;
- the closed lid enclosing every part;
- a 133-step lid sweep that cuts nothing;
- the open lid clearing the hovering record and the playing arm;
- the parked tube lying in the cradle between its prongs;
- the parked arm (tube, headshell, cartridge) more than 0.15 beyond the platter rim in plan;
- nothing on the arm except the stylus touching the vinyl;
- motion bounds;
- an interruption with the real nodes;
- framing;
- the lid look: the split loses no triangle and is idempotent, every inside triangle faces into the box and every outside one out, the inside is uncoated, darker and physical with its occlusion deepest under the top panel, and the outside carries the satin coat.

`tests/browser/party.spec.ts` runs unchanged (9 tests pass).

## Known gaps

- **Interruption spin.** The visual director's blend slerps every animated node linearly, along the shortest path. An Accept→Decline change mid-spin therefore turns the record back by up to π in 150 ms, the arm whips back to its rest, and the velocity jumps at the blend's ends. This is shared behaviour (v1.1 did the same), in `src/core/visualDirector.ts`, which this pass may not edit.
- **Shared docs.** `docs/asset-manifest.md`, `docs/style-reference.md`, `docs/qualification.md` and `docs/spec-revisions.md` are not updated here; they are shared files. The rows they need are this document's decisions and report.
- **Lid self-shadow.** The lid shell still does not receive shadows (see Decisions), so a record hovering in front of the open lid casts no shadow onto its inside. Since v1.2.1 the inside has its own dark material and baked occlusion, so it no longer reads as an even light cream mid-close, and the outside's satin coat removed the cream flash: decline frames 29–38 stay dark bronze, and the clip's largest frame-to-frame mean difference is 2.65 (frame 32), a flat plateau over the hinge's speed peak, where it was 4.21 with a second hump at frames 37–38. The sheen still brightens the front wall a little as it passes the mirror angle; that is the glint a real smoked cover shows.
- **Subtle settle.** Even doubled, the seat-and-settle is about 2–3 px of rim lift at stage size (frame diff 0.22–0.26). It stays a settle on purpose: a real record settles almost flat.
- **Smoked lid.** The master's smoked lid plastic is opaque (and v1.1's closed case was too), so the declined pose is a closed dark box.
- **Lid proportions (judges, v1.2.1: kept).** The extended cover is taller and deeper than the master's short display lid, and closed it reads as a second box on the plinth. Without the extension the closed lid cuts through the platter rim, the speed knob and the counterweight (Decisions, Dust cover length), so the closed decline pose needs it.
- **Tonearm at stage size (judges, v1.2.1: kept).** The gimballed cue (lift, swing, lower, counterweight pitch) is correct but small at stage size, and from the 15° camera the parked headshell still meets the platter's front-right rim in projection (0.169 clear in plan). Making it read larger means a different camera or a larger arm than the master's, both outside this pass.
- **Label wedge (judges, v1.2.1: kept).** The coral/cobalt quarter wedge is a v1.1 graphic over the master's print. It stays: it is what makes the accept spin legible at stage size, and all three judges read the spin through it.
