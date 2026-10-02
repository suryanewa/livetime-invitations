# The shared bin v1.5: a real 45 cm butterfly pedal bin

Edit #11 (Surya, 2026-10-02): *"The trash bin needs the same visual quality (model + texture) as the other models and
better-matched proportions/scaling."* Owner: Bin (shared by the Birthday and Dinner declines). Brief:
`docs/perfection-pass-brief.md` ("Bin").

Files: `models/disposalBin.ts` (the model, its measured constants, `attachBin`, `dropHeight`), `scripts/bin/`
(`textures.ts` procedural texture generators, `ao.ts` baked occlusion, `finish.ts` the export step),
`scripts/export-models.ts` (routes `pnpm models bin` through it and the masters' texture policy),
`assets/shared/disposal-bin.glb`.

## Research

| Product | Size | What it teaches |
| --- | --- | --- |
| Brabantia NewIcon 20 L | Ø 29 × 46.7 cm | the class: a powder-coated or steel shell on a PP base, a lid ring, an inner bucket, a pedal on a pin hinge |
| Brabantia NewIcon 30 L | Ø 29.3 × 67.9 cm | larger capacity means taller, not wider |
| Vipp 15 (14 L) | Ø 29 × 52.5 cm | powder-coated steel, a rubber ring at the base, a damped lid with a rubber seal |
| Vipp 14 (8 L) | Ø 30 × 37 cm | the squattest real proportion (h/d 1.23) |
| Vipp 17 (30 L) | Ø 30 × 72 cm | |
| simplehuman butterfly step can | 10–30 L | a lid split down the middle, each half hinged at its outer edge: the open bin needs half the headroom of one lid |

Real round pedal bins are 29–30 cm across; the objects here need more: the cake is 27.7 cm across its piping (and
leans up to 1.8° while carried), the plate 27 cm. So this bin is a little wider than the catalogue (a 31 cm mouth,
33.8 cm over the base) and at the low end of the height range: 45 cm closed (h/d 1.33, between the Vipp 14 and the
Brabantia 20 L).

## Before and after

| | v1.4 Birthday | v1.4 Dinner | v1.5 (both scenes) |
| --- | --- | --- | --- |
| Diameter (widest turned part) | 37.6 cm (1.88 u) | 31.7 cm (1.59 u) | 33.84 cm (1.692 u) |
| Mouth (clear opening) | 35.6 cm | 30.0 cm | 31.0 cm (1.55 u) |
| Rim (top of the lid ring) | 26.0 cm (1.30 u) | 21.9 cm (1.10 u) | 42.4 cm (2.12 u) |
| Closed height (lid crown) | ≈ 28 cm | ≈ 23.6 cm | 44.9 cm (2.245 u) |
| Depth (rim to bucket floor) | 24.0 cm | 20.3 cm | 36.45 cm |
| Open lid top | 46.8 cm | 39.5 cm | 59.3 cm |
| h/d | 0.74 | 0.74 | 1.33 |

1 unit = 20 cm. Until v1.4 the bin scaled with each scene (Dinner's root is 0.844), so it was a different size in
each; since v1.5 `attachBin` gives `bin_root` the inverse of the scene's world scale and it is the same real object in
both (`DINNER_BIN = binIn(1 / DINNER_WORLD_SCALE)` holds its dimensions in Dinner's units).

## The model

Built in code (`buildDisposalBin`), every part as the real product is made, every light-catching edge filleted:

- **Body**: a rolled steel shell (r 16.5 cm) in charcoal powder coat, with a rolled bead at the top edge; it stands
  in the base cup.
- **Base cup**: satin black PP, 4 mm proud of the shell, a 6 mm bottom radius; on a **rubber foot ring** inset 12 mm
  (a shadow gap at the floor).
- **Lid ring**: satin black PP clipped over the bead; it overhangs the bead by 1 mm with a 0.8 mm gap under it (the
  lid/body seam reads as a fine shadow line) and has a 3.4 mm flat top the lid rests on. It carries the two
  **hinge housings** (a block and two lugs each) with **stainless pins** whose domed heads show at the lug faces.
- **Inner bucket**: dark grey PP, a rolled lip 4.5 mm below the ring top, a straight 15.5 cm-radius well (the clear
  opening) to a 9 mm floor radius, its floor 5.95 cm above the ground.
- **Butterfly lid**: two pressed brushed-stainless half-shells, each a half-disc (r 16.35 cm) with 1.1 cm corners, a
  gentle dome (2.5 cm crown at the split, 0.75 cm at the edge), a rolled 7 mm edge (3.8 mm top fillet, 1.6 mm bottom
  fillet, a 6.5 mm hem) and a satin PP underside panel; the halves are 1.5 mm apart at the split. Each has a knuckle
  (a rolled barrel and its tab) round its pin, between the housing's lugs. They open 100° about the pins.
- **Pedal**: a PP housing on the base's front-left (where the stand does not hide it), a dark slot, and a
  brushed-stainless lever on a pin hinge between two lugs, with a ribbed **coral elastomer tread** (the bin's one
  coloured insert, the brand accent). The pedal is linked to the lid: as the flaps open it goes down 11° (the tread
  about 1 cm), as they close it comes back (`attachBin` sets it from the flap's own rotation, so every scene path, the
  rewinds included, moves it).

Nodes: `bin_root › {bin_foot, bin_base, bin_body, bin_lid_ring, bin_liner, bin_hinges, bin_hinge_pins, bin_lid ›
{bin_flap_l, bin_flap_r} › {*_shell, *_under, *_knuckle}, bin_pedal_mount › {bin_pedal_housing, bin_pedal_slot,
bin_pedal_pin, bin_pedal › {bin_pedal_lever, bin_pedal_tread}}, bin_shadow}`. 210,780 triangles, 18 draw calls.

## Materials and textures

Eleven named PBR materials (`BIN_MATERIALS`; not library names, so `bindMaterialsByName` keeps them and
`prepareImported` registers them with the scene's imported materials: own environment for the steel, the Low tier,
disposal). The textures are generated at export, deterministically (integer-hash lattice noise, fixed seeds), and go
through the masters' texture policy (WebP; normals exact-lossless):

| Material | Finish | Maps |
| --- | --- | --- |
| `bin_powder` (body) | charcoal `#34373A`, satin 0.46 ± 0.035 | orange-peel micro-normal (2.6 mm cells, 1.1° RMS slope, sparse dust inclusions), 512² per 5.76 cm tile (89 px/cm); occlusion + roughness 2048 × 1024 on UV1 |
| `bin_base`, `bin_ring` | satin black PP 0.56 / 0.52 | EDM mould grain (VDI 3400 ≈ Ref 27: 0.1–0.4 mm, 5° RMS), 512² per 3 cm (171 px/cm); occlusion + roughness 1024 × 256 on UV1 |
| `bin_liner` | dark grey PP 0.50 | a softer grain (3°); occlusion + roughness 1024 × 1024 on UV1 (≈ 0.15 deep in the bucket) |
| `bin_plastic`, `bin_lid_under` | satin black PP | the EDM grain |
| `bin_steel` (lid, lever) | brushed stainless, metal 1, KHR_materials_anisotropy 0.55 across the grain | brushed grooves along u (0.12 mm cells, belt scratches; 2.5° RMS across the grain), 1024² per 6 cm (171 px/cm); roughness 0.27 with streaks at 0.4 / 1 / 2.5 mm; tangents in the mesh |
| `bin_pin` | polished stainless 0.14 | |
| `bin_rubber` | matte rubber 0.86 | grain 256² per 3 cm |
| `bin_tread` | coral elastomer `#FF714A` 0.64 | ribs (4 mm pitch, 0.5 mm crowns), 256² per 1.2 cm |
| `bin_slot` | near-black 0.9 | |

**Baked occlusion** (`scripts/bin/ao.ts`): the turned parts are surfaces of revolution, so occlusion depends only on
the position along the profile; each profile point is ray-traced (256 cosine-weighted rays) against every turned part
revolved analytically (cones, cylinders, annuli: exact intersections), with the lid open. Deep in the bucket 0.14,
the inner wall under the lip 0.5, the seam under the lid ring 0.6, the outer wall 1.

Texel density, against the masters (15–100 px/cm; the hoop's tiled maps 50 px/cm): the micro-normals 89–200 px/cm,
the unique occlusion/roughness 10–26 px/cm. 11 textures, 34 MiB on the GPU (RGBA8 + mips), 0.9 MiB of WebP; GLB
6.2 MiB raw, 3.3 MiB gzip.

## The decline, re-timed for the deeper bin

Both objects now have to rise over a 42.4 cm rim and fall 36 cm into the bucket. The move keeps every beat's
duration (decline 1.5 s):

- **Birthday**: lift off the stand 0.22–0.56 s (30 cm, a smootherstep: it gathers speed over several frames, peak
  step under 135 mm a frame), carry across 0.37–0.74 s (overlapping the end of the lift), at rest over the opening at
  0.74 s, **let go**: it falls under gravity (9.81 m/s², `dropHeight`) and is below the rim by 0.966 s; the flaps close
  from 0.97 s (soft close, shut by 1.42 s). The landing on the bucket floor (1.02 s, deep out of sight) is rounded so
  the motion stays C1.
- **Dinner**: the transfer path (up, a rounded corner, across) to rest over the opening by 0.74 s, then the same
  release and fall; the handle is out of sight by 0.93 s and the flaps close 0.94–1.15–1.30 s. The settle over the
  bin is shorter than v1.4's ease (the dish no longer hangs still for a quarter-second before it drops).
- **Dinner change of mind**: moving out of sight inside the bin costs no rewind time and sets no pace (`hiddenInBin`,
  `dishStep`); the rewind before an accept may take up to 0.6 s (was 0.45) because the dish has 6 units to come back
  (up out of the bucket, across, down), and the accept after it plays up to 1.46× fast.

## Framing (the recorded trade-off)

The camera is the shared fixed camera (18°, az 20°, el 15°) set by the hero framing rule. The object carried over a
real 42.4 cm rim needs more height than the frame had:

| Hero fill (1:1) | v1.4 | v1.5 |
| --- | --- | --- |
| Birthday (height) | 0.600 (not path-limited) | 0.579 (path-limited by 3 %) |
| Dinner (width) | 0.496 | 0.364 |

Every remedy the brief named was measured (scratch exploration with the real silhouettes and the production fit):

- **Bin placement**: a grid search over every plan position from −6 to 6 by −8 to 4 units (Dinner's units) found the
  fill flat within 1 % behind and beside the dish (0.389 in the proxy); in front of the dish it is worse (0.32–0.34):
  the bin is nearer the lens and bigger. In Birthday, further left gives 0.59 at 1:1 but 0.45 at 3:4.
- **A tighter carry**: the object already crosses the rim 1.5 cm over it (Dinner) and 1.2 cm (Birthday); its own
  height (the cake 23.6 cm, the covered dish 15.9 cm) on top of a 42.4 cm rim is what sets the frame.
- **Letting the bin crop at the frame edge**: the open flaps are lower than the carried object, so cropping them gains
  nothing; holding Dinner at 0.496 would need the frame's top edge at the rim itself, so the dish would leave the frame
  entirely while it crosses and the declined pose would show a bin cut off at its lid.

So with one fixed camera a real bin costs Dinner's hero 27 % of its width. Recommended next step (not in this branch:
it changes the shared camera, the posters and the fullscreen backdrops): a **decline camera pull-back**: frame the
hero without the bin paths at rest (Dinner 0.70 of the width, Birthday 0.60), and ease the camera back while the bin
slides in (0–0.3 s) to the framing above.
