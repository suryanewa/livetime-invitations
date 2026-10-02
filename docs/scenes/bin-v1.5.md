# The shared bin v1.5: a real 47 cm butterfly pedal bin

Edit #11 (Surya, 2026-10-02): *"The trash bin needs the same visual quality (model + texture) as the other models and
better-matched proportions/scaling."* Owner: Bin (shared by the Birthday and Dinner declines). Brief:
`docs/perfection-pass-brief.md` ("Bin").

Files: `models/disposalBin.ts` (the model, its constants, `attachBin`, `patchBinVisibility`, `dropHeight`,
`flapsClosing`), `scripts/bin/` (`textures.ts` procedural texture generators, `ao.ts` baked occlusion, `finish.ts` the
export step), `scripts/export-models.ts` (routes `pnpm models bin` through it and the masters' texture policy),
`assets/shared/disposal-bin.glb`, `tests/bin.test.ts`.

## Research

| Product | Size | What it teaches |
| --- | --- | --- |
| Brabantia NewIcon 20 L | Ø 29 × 46.7 cm | the class: a powder-coated or steel shell on a PP base, a lid ring, an inner bucket, a pedal on a pin hinge |
| Brabantia NewIcon 30 L | Ø 29.3 × 67.9 cm | larger capacity means taller, not wider |
| Vipp 15 (14 L) | Ø 29 × 52.5 cm | powder-coated steel, a rubber ring at the base, a damped lid |
| Vipp 14 (8 L) | Ø 30 × 37 cm | the squattest real proportion (h/d 1.23) |
| Vipp 17 (30 L) | Ø 30 × 72 cm | |
| simplehuman butterfly step can | 10–45 L | a lid split down the middle, each half hinged at its outer edge: the open bin needs half the headroom of one lid; the pedal at the front, under the split |

Real round pedal bins are 29–30 cm across; the objects here need a little more: the cake is 27.7 cm across its
piping, the plate 27 cm. The mouth is the cake's limit, 29.6 cm (8 mm each side; the carry's sway is steadied before
the release, so the cake goes in upright), 32.4 cm over the base, and the bin is the Brabantia NewIcon 20 L's height,
47 cm closed (h/d 1.45, between the Vipp 14's 1.23 and the Brabantia's 1.61). Taller (the 52–56 cm of a 1.65 h/d)
would cost the framing more (below); this is the owner's call.

## Before and after

| | v1.4 Birthday | v1.4 Dinner | v1.5 (both scenes) |
| --- | --- | --- | --- |
| Diameter (widest turned part) | 37.6 cm (1.88 u) | 31.7 cm (1.59 u) | 32.44 cm (1.622 u) |
| Mouth (clear opening) | 35.6 cm | 30.0 cm | 29.6 cm (1.48 u) |
| Rim (top of the lid ring) | 26.0 cm (1.30 u) | 21.9 cm (1.10 u) | 44.5 cm (2.225 u) |
| Closed height (lid crown) | ≈ 28 cm | ≈ 23.6 cm | 47.0 cm (2.35 u) |
| Depth (rim to bucket floor) | 24.0 cm | 20.3 cm | 38.55 cm |
| Open lid top | 46.8 cm | 39.5 cm | 59.8 cm |
| h/d | 0.74 | 0.74 | 1.45 |
| Triangles / draw calls | 8,712 / 5 | | 216,052 / 18 |
| Textures | none (library colours) | | 11 WebP (0.8 MiB), 34.0 MiB as RGBA8 + mips |

1 unit = 20 cm. Until v1.4 the bin scaled with each scene (Dinner's root is 0.844), so it was a different size in
each; since v1.5 `attachBin` gives `bin_root` the inverse of the scene's world scale and it is the same real object in
both (`DINNER_BIN = binIn(1 / DINNER_WORLD_SCALE)` holds its dimensions in Dinner's units).

## The model

Built in code (`buildDisposalBin`), every part as the real product is made, every light-catching edge filleted
(profiles are closed loops with true circular fillets, `roundLoop`; surfaces of revolution with exact normals):

- **Body**: a rolled steel shell (r 15.8 cm) in graphite powder coat, a rolled bead at the top edge; it stands in
  the base cup.
- **Base cup**: satin black PP, 4 mm proud of the shell, a 6 mm bottom radius, on a 4 mm **rubber foot ring** inset
  5 mm (a fine dark line at the floor).
- **Lid ring**: satin black PP clipped over the bead; it overhangs the bead by 1 mm with a 0.8 mm gap under it (the
  lid/body seam reads as a fine shadow line) and has a 3.4 mm flat top the lid rests on.
- **Inner bucket**: mid-grey PP, a rolled lip 4.5 mm below the ring top, a straight 14.8 cm-radius well (the clear
  opening) to a 9 mm floor radius, its floor 5.95 cm above the ground.
- **Butterfly lid**: two halves pressed from brushed stainless coil (the grain runs side to side, across the split;
  the undersides are the same coil), each a half-disc (r 15.65 cm) whose outer extreme is cut by a straight 9 cm
  **hinge chord**; a gentle dome (2.5 cm crown at the split), a rolled 5.5 mm edge (2.6 mm top fillet, 1.2 mm bottom
  fillet, a 4.2 mm hem with a return) and a recessed underside; the halves are 2 mm apart at the split, with 3 mm
  corners. They open 100°.
- **Hinges**: three-knuckle hinges inside the lid ring's footprint (nothing stands outside the silhouette, nothing
  above the lid's edge): two black PP knuckle leaves on tabs under each half's chord, the ring's moulded knuckle
  between them, a black-oxide pin through all three.
- **Pedal**: under the lid's split (the front), as on a butterfly step can: a PP housing moulded round the base cup's
  curve, a dark slot, a stainless lever with a front edge curved round the bin's axis on a pin hinge between two lugs,
  and a ribbed **coral elastomer tread** (the bin's one coloured insert, the brand accent). The pedal is linked to
  the lid: as the flaps open it goes down 11° (the tread about 1 cm) and comes back as they close (`attachBin` sets
  it from the flap's own rotation, so every scene path, the rewinds included, moves it). In Birthday the cake stand
  stands in front of it (moving the bin left to show it would drop the 3:4 portrait fill to about 0.45–0.5); in Dinner
  it faces the camera, and the bin stands 2.32 units from the dish so the pedal clears the plate and the cloche by
  2.9 cm.

Nodes: `bin_root › {bin_foot, bin_base, bin_body, bin_lid_ring, bin_liner, bin_hinges, bin_hinge_pins, bin_lid ›
{bin_flap_l, bin_flap_r} › {*_shell, *_under, *_knuckle}, bin_pedal_mount › {bin_pedal_housing, bin_pedal_slot,
bin_pedal_pin, bin_pedal › {bin_pedal_lever, bin_pedal_tread}}, bin_shadow}`.

## Materials and textures

Ten named PBR materials (`BIN_MATERIALS`; not library names, so `bindMaterialsByName` keeps them and
`prepareImported` registers them with the scene's imported materials: own environment for the steel, the Low tier,
disposal). The textures are generated at export, deterministically (integer-hash lattice noise, fixed seeds: two
exports give byte-identical GLBs), and go through the masters' texture policy (WebP; normals exact-lossless):

| Material | Finish | Maps |
| --- | --- | --- |
| `bin_powder` (body) | warm-neutral graphite `#4A4846`, satin 0.29 ± 0.04 over 20–40 cm | orange-peel micro-normal (2.2 mm cells and a finer octave, 0.55° RMS slope, sparse dust inclusions), 512² per 5.76 cm tile (89 px/cm); occlusion + roughness 2048 × 1024 on UV1 |
| `bin_base`, `bin_ring` | satin black PP `#1D1D1D` 0.56 / 0.52 | EDM mould grain (VDI 3400 ≈ Ref 27: 0.1–0.4 mm, 5° RMS), 512² per 3 cm (171 px/cm); occlusion + roughness 1024 × 256 on UV1 |
| `bin_liner` | mid-grey PP `#7C7C7B`, 0.45 | a softer grain (3°); occlusion + roughness 1024 × 1024 on UV1 (0.14 deep in the bucket) |
| `bin_plastic` | satin black PP (hinge knuckles, pedal housing) | the EDM grain |
| `bin_steel` (lid top and underside, lever) | brushed stainless, metal 1, KHR_materials_anisotropy 0.6 across the grain | brushed grooves (0.12 mm cells, belt scratches; 2.5° RMS across the grain), 1024² per 6 cm (171 px/cm); roughness 0.17 along the grain with streaks at 0.4 / 1 / 2.5 mm; tangents in the mesh (the grain follows UV0's u: across the lid, along its rolled edge) |
| `bin_pin` | black-oxide steel 0.42 | |
| `bin_rubber` | matte rubber 0.86 | grain 256² per 3 cm |
| `bin_tread` | coral elastomer `#FF714A` 0.64 | ribs (4 mm pitch, 0.5 mm crowns), 256² per 1.2 cm |
| `bin_slot` | near-black 0.9 | |

**Baked occlusion** (`scripts/bin/ao.ts`): the turned parts are surfaces of revolution, so occlusion depends only on
the position along the profile; each profile point is ray-traced (256 cosine-weighted rays) against every turned part
revolved analytically (cones, cylinders, annuli: exact intersections), with the lid open. Deep in the bucket 0.14,
the inner wall under the lip 0.5, the seam under the lid ring 0.6, the outer wall 1.

Texel density, against the masters (15–100 px/cm; the hoop's tiled maps 50 px/cm): the micro-normals 89–200 px/cm,
the unique occlusion/roughness 10–26 px/cm. GLB 6592.8 KiB raw, 3288.7 KiB gzip.

**Contact shadow** (`BIN_CONTACT`): footprint the base's diameter, a tight line at 0.85 reaching 7 % past the base and
a short spread: about half the floor's light at contact, as under the stand and the plate.

**Light inside the bin** (`patchBinVisibility`, on the cake's materials in Birthday, replacing v1.2's dimmer, and on
the plate and cloche in Dinner): below the rim a point sees the room only through the mouth. Its indirect diffuse
light is the mouth's cosine-weighted share of the sky, R² / (R² + d²) at depth d (0.96 at 3 cm, 0.69 at 10 cm, 0.13
on the floor); its indirect specular reflects the room only when the reflected ray leaves through the mouth (an exact
per-pixel test against the rim's plane), else the grey bucket wall (an eighth of the room). The direct light needs nothing: the shadow map has the walls. It applies inside the mouth's cylinder
only and fades in over the last 2 cm above the rim, so switching it on over the opening changes no pixel. In Birthday
it is the last link on every cake material (frosting of both presets, piping, pearls, each candle's own melting wax):
after the cake's own patches (`models/cakeShaders.ts`: subsurface, press, ridges, melt) and the flames' light
(`models/birthdayFire.ts patchFlameLight`), each chaining the one before; the cake's v1.2.1 darkening ramp
(`binShadePatch`) is gone from that chain, `BIN_SHADE.above` and the `binShade.on` gate stay.

## The decline, re-timed for the deeper bin

Both objects now rise over a 44.5 cm rim and fall 38 cm into the bucket. Every beat's duration is kept (decline
1.5 s):

- **Birthday**: lift off the stand 0.22–0.58 s (32 cm, a smootherstep: it gathers speed over several frames, peak
  step under 135 mm a frame), carry across 0.39–0.76 s (overlapping the end of the lift; the sway is steadied by
  0.76 s), at rest over the opening at 0.76 s, then **let go**: it falls under gravity (9.81 m/s², `dropHeight`) and
  is below the rim by 0.986 s. It lands on the bucket floor at 1.045 s, 15 cm under the rim, out of sight (the landing
  is rounded so the motion stays C1). The flaps close from 0.99 s.
- **Dinner**: the transfer path (up, a rounded corner, across) to rest over the opening by 0.74 s (a shorter settle
  than v1.4's ease, which held the dish still over the bin for a quarter-second), then the same release and fall;
  the handle is out of sight by 0.93 s, the flaps close from 0.94 s.
- **Soft close** (`flapsClosing`, both scenes): the flaps swing down, faster at first, a damper catches them 3 % from
  shut after 0.33 s and takes up the last gap in 0.15 s.
- **Dinner change of mind**: motion out of sight inside the bin costs no rewind time and sets no pace
  (`hiddenInBin`, `dishStep` measures the dish where it can be seen); the rewind before an accept may take up to 0.6 s
  (was 0.45) because the dish has 6 units to come back (up out of the bucket, across, down), and the accept after it
  may play up to 1.5× fast (measured: at most 1.35×).

## Framing (the recorded trade-off)

The camera is the shared fixed camera (18°, az 20°, el 15°) set by the hero framing rule. The object carried over a
real 44.5 cm rim needs more height than the frame had:

| Hero fill (1:1) | v1.4 | v1.5 |
| --- | --- | --- |
| Birthday (height) | 0.600 (not path-limited) | 0.563 (path-limited, −6 %); 0.524 (−13 %) merged with the v1.5 fire |
| Dinner (width) | 0.496 | 0.354 (−29 %) |

Merged with the v1.5 fire (`v1.5/integration`), the Birthday hero lost the padding of the v1.2 drawn flames (4.5 cm, now
the real 1.4 cm): the hero is shorter while the carried cake (flames out) still sets the frame, so the same camera
shows it at 0.524 of the height, at every aspect and centred across. Every Birthday fill below scales by the same 0.93.

Every remedy the brief named was measured (scratch exploration with the real silhouettes and the production fit):

- **Bin placement**: a grid search over every plan position from −6 to 6 by −8 to 4 units (Dinner's units) found the
  fill flat within 1 % behind and beside the dish (0.389 in the proxy); in front of the dish it is worse (0.32–0.34):
  the bin is nearer the lens and bigger. In Birthday, further left gives 0.59 at 1:1 but 0.45 at 3:4.
- **A tighter carry**: the object already crosses the rim 1.5 cm over it (Dinner) and 1.2 cm (Birthday); its own
  height (the cake 23.6 cm, the covered dish 15.9 cm) on top of a 44.5 cm rim is what sets the frame.
- **Letting the bin crop at the frame edge**: the open flaps are lower than the carried object, so cropping them gains
  nothing; holding Dinner at 0.496 would need the frame's top edge at the rim itself, so the dish would leave the frame
  entirely while it crosses and the declined pose would show a bin cut off at its lid.

So with one fixed camera a real bin costs Dinner's hero 29 % of its width (a 45 cm bin cost 27 %, the brief's floor). Recommended next step (not in this branch:
it changes the shared camera, the posters and the fullscreen backdrops): a **decline camera pull-back**: frame the
hero without the bin paths at rest (Dinner 0.70 of the width, Birthday 0.60), and ease the camera back while the bin
slides in (0–0.3 s) to the framing above.

## Review

Three adversarial reviews of the rendered frames (production camera, close-ups at the same lens; scored "as real as
the masters next to it"). Round 1, 5/10: a blue-black body with no sheen, a lid that read as grey paint, a black-hole
interior, the cake dimmed by a ramp and the cloche mirroring the room inside the bin, the pedal off the lid's axis,
hinge ears, a V-notched seam, black-paddle undersides, a weak contact shadow, a slamming lid, hammertone peel.
Round 2, 6.5/10: drum proportions, a hubcap (spun) lid, the cloche turned to pewter by a crude specular term, chrome
hinge specks on the silhouette, a navy cast. Round 3, 7/10: the lid still read flat grey (the grain ran front to back,
so the brushed highlight stretched sideways into the dim wall; now it runs across, sharper along the grain). All fixed
as above. Not changed, and why: the height (framing; the owner's call), the Birthday pedal behind the stand (3:4
framing), the open flaps' shadows on the cove (the shared rig's key), the frame-edge clearance (the shared framing
rule's 4 % of the half-frame), the cake not shadowed inside the bin by the rim (the shared rig's shadow map).
