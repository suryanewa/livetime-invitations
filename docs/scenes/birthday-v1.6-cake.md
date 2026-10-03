# Birthday v1.6: the cake at film quality (the Hollywood pass)

Owner, 2026-10-02 (brief: `docs/hollywood-pass-brief.md`): *"The cake still has a plasticky, too perfect and geometric
shape / texture; I'm expecting Hollywood CGI level work here."* v1.5 (`docs/scenes/birthday-v1.5-cake.md`) had tuned
the master: jittered instances, maps, a wrap. This pass rebuilds the look: the piping is regenerated as hand-piped
star-tip sweeps, the tiers are hand-coated, the light the frosting does and does not get is baked, and the frosting
gets a food shader (subsurface, translucency, coloured shade, sugar glints, colour and satin variation). The physics,
the clocks, the press, the melt, the bin and every API other scenes use are kept.

Files: `scripts/masters/recipes/birthdayPiping.ts` (new: the sculpted piping), `scripts/masters/recipes/birthdayBake.ts`
(new: occlusion and thickness bake), `scripts/masters/recipes/birthdayFinish.ts` (the hand finish: bead, waves, relief,
unique atlas, regeneration, bake, smears), `scripts/masters/recipes/birthday.ts` (the smear's cocoa variant),
`models/cakeShaders.ts` (`foodPatch`, `pearlPatch`, `FOOD`), `models/birthday.ts` (wiring, draw order, smears),
`models/birthdayContract.ts` (re-measured), tests `tests/birthday.test.ts` (updated), `tests/birthdayPiping.test.ts`
(new), tooling `scripts/cake-evidence.ts` (frames) and `scripts/cake-perf.ts` (frame cost).

## The tells (measured on v1.5 at the real sizes, `evidence/v1.6/cake/baseline/`)

Square 540 @2×, laptop 1280 × 720 @2× (≈ 2.9 device px per mm on the cake), phone 390 × 844 @3×, and macros through the
live stage's own camera and lights:

1. Swags: every strand the same smooth tube on the same curve; three parallel tubes per bay read as a moulding.
2. Rosettes: identical 16-point stars (a badge), ±10 % in size; shells identical lemons; dots perfect spheres sitting
   *on* the surface; columns and tassels clean turned parts.
3. No contact: piping rests on the body with no fillet, no crease shadow, no occlusion between strands.
4. Tiers: true cylinders, a constant 3.7–4.4 mm corner fillet that reads razor-clean; the body one flat blue; its
   0.1 mm relief invisible at laptop size.
5. Material: one GGX lobe over lambert plus a uniform wrap; no translucency at thin crests, no coloured shade, no
   sparkle; grooves and crests the same colour; nothing at the base where the cake meets the stand.

## References

Looked at side by side with the frames (not copied into the repository):

- Curly Girl Kitchen, *Lambeth Cake, Vintage Pink & Blue Birthday* (2026, photo 001) and *Chocolate Cherry Lambeth
  Cake* (2022, photo 022): star-tip ropes with 6–8 visible teeth, rounded crests and narrow soft V grooves whose depth
  wanders; shells squeezed head-first with ridged tails tucked under the next head; swirl rosettes (a rope carried
  once and a quarter round, the tail riding over the start); piping lighter on its crests and deeper, more saturated
  in its grooves and shade, never grey; a satin, faintly grainy body; contact shadows in every crease.
- Before & Afters, *Retro RenderMan: shading food for Ratatouille*: irradiance scattered uniformly (not per
  channel: no waxiness), a "diffuse softening" short scatter that keeps surface detail, and scatter blended in where
  the diffuse is dark but not where it is bright.
- Penner & Borshukov, *Pre-Integrated Skin Shading* (SIGGRAPH 2011) and MJP, *An Introduction to Real-Time Subsurface
  Scattering*: curvature-driven diffusion of the N·L falloff; blurred normals for the diffuse.
- Barré-Brisebois & Bouchard, *Approximating Translucency for a Fast, Cheap and Convincing Subsurface Scattering
  Look* (GDC 2011): thickness-driven back light with distortion, power and scale.
- Deliot & Belcour, *Real-Time Rendering of Glinty Appearances using Distributed Binomial Laws on Anisotropic Grids*
  (HPG 2023): sparse facets on a grid, faded where the pixel covers many.

## Decisions

### Geometry: regenerated, not sculpted

The master's piping cannot be sculpted into hand-piped rope: its swags are 9-point half-pipes, its rosettes stars.
Every piped part is regenerated procedurally (`regeneratePiping`) *at the master's own placements, sizes and counts*
(the design stands: 26 side rosettes, 12 crown rosettes, 78 swag strands, 13 columns, 26 tassels, 59 shells, 39
dots, 2 rope borders, 118 dragées), each from its own seed (`seedOf(node) + k`), deterministic.

The rope (`sweep`): a star tip's cross-section, an ellipse of the rope's half-width and height pressed ≈ 1 mm into what
it is piped on, with teeth `((1 − cos 2πf)/2)^k` (rounded crests, soft V grooves; continuous at every groove whatever
a tooth's depth), each tooth's depth jittered ±15–20 % and drifting ±42 % along the rope, the tip turning as the bag
turns (`tw`), the teeth fading into a concave fillet where the rope meets the surface (flare 22–30 % of its height).
Along it (`pressure`, `taper`): ±7–12 % swells over ≈ 2 cm, a 12–35 % fatter start, a hiccup in a third of the ropes
(a 16 % thinning and the lump after it), a rounded start cap, the pulled tail thinning to 12–25 % and drawn into the
surface, and the very end closed. Per part:

- swag strands: the master's strand paths (their feet put on the tier's real profile), 11–13 teeth, a 0.6–1.4 mm sag
  at the low point, a ±1.4 mm curl at the tail, a 0.18 mm hand wander, either end the start;
- columns (pulled lines, 16 teeth), tassel bulbs (onion pressure, 14) and fans (flared, 18);
- shells: squeezed (a rounded head at 26–34 %) and pulled into a ridged tail, 9–10 teeth, each 1.42 slot long so its
  tail runs under the next head; the bottom border beds into the plate to the master's underside;
- rosettes: a rope (12–14 teeth, 42–47 % deep) carried 1.13–1.37 turns out from a fat start, the tail riding over
  the first loop and tucked down; side rosettes face out 6–12° above level, settle onto the tier's edge where they
  are within ≈ 3 mm of it (`restOn`, smoothed along the rope) and droop ≈ 0.9 mm where they overhang, with a soft
  mound behind (`backMound`) so the far side reads as buttercream, not a coil's flat underside; crown rosettes sit on
  the top's edge, tipped out 1–6°;
- rope borders: a 6-tooth tip turned a full turn every 8.5–10 mm (diagonal twists; the section samples turn with the
  tip so the grooves stay clean), a push's bead every ≈ 3.4 mm, piped in four overlapping runs;
- dots: round-tip domes pressed in with a fillet and the peak the bag left, drooping;
- dragées: spheres ±6 % in size and ±3.5 % out of round where the master set them.

Totals: 1,601,496 triangles (v1.5 812,816); piping ≈ 620 k vertices.

### Hand-coated tiers

- the top edge: the master's 3.7–4.4 mm fillet replaced by a 6.0 mm (bottom) / 6.5 mm (top) bead tangent to side and
  top (`handProfile`, `EDGE_BEAD`; ×1.1 at CAKE_SCALE), with a hand-pushed lip just inside it (0.45–0.5 ± 0.4 mm
  round the tier) and a shallow 0.25–0.3 mm valley where the spatula lifted (`topUneven`, `EDGE_LIP`);
- the scraper's hand waves (`HAND_WAVES`, m = 5–18 round the tier, drifting with height) on top of v1.5's low-frequency
  drift: the silhouette now −2.4 … +2.0 mm (bottom tier) and ±1.7 mm (top) about round, the top tier 2.5 mm off centre;
- relief (periodic atlas): knife chatter in patches (near-vertical ripples 2.9 mm apart, ≈ 25–30 µm), and on the tops
  the turntable's Archimedean spiral (7.5 mm pitch, ≤ 70 µm) under the palette-knife strokes;
- the base: three thin smears of the coat dragged out from under the bottom border (0.14–0.3 mm, 7–12 mm long,
  streaked along the drag) and three crumbs, on the plate (`cake_smears`, a child of the stand so they stay on it when
  the cake is carried off; one in view front right, one at the left edge, one behind). Their own material
  (`cake_smear`, `cake_smear_cocoa`).

### Baked light (`birthdayBake.ts`, in the export)

The finished frosting and the plate's top are voxelised at 0.55 mm; for every piping vertex and every texel of the
body's unique atlas, 24 cosine-weighted rays give the room's occlusion (10 mm reach) and contact (2.5 mm), and a march
inward gives the thickness light crosses (0.6–15 mm). Piping, rosettes, smears: one RGBA8 vertex attribute `_FOOD`
(x the tooth ridge, y occlusion, z thickness / 16 mm). The body: a 1024² contact map on a new unique UV set
(TEXCOORD_1: each tier's side as a 1024 × 128 band by angle, each top a 512² square; ≈ 0.75 mm a texel on the bottom
tier's side), R three's aoMap, G contact; texels under the piping refilled from the frosting beside them, lightly
blurred. 4.6–5.6 s of the ≈ 30 s export.

### The food shader (`models/cakeShaders.ts` `foodPatch`, `FOOD`)

Per fragment, on the body, piping and rosettes (both presets), in the existing patch chain (`patchMaterial` →
`patchFlameLight` → `patchBinVisibility`, press and plate contact kept):

- **subsurface**: the direct diffuse falls off with a wrap whose width grows with thinness (piping: its baked thickness
  and tooth crests; body: screen-space curvature, so the bead scatters more than the side): `w = wrap + wrapThin ·
  thin` (body 0.32 + 0.7, piping 0.38 + 0.85, cocoa 0.20/0.24 + 0.45/0.55); the light past the terminator added only
  where lambert is dark (`scatter` 0.75–0.8, cocoa 0.6–0.65), tinted by the frosting's own colour saturated ×1.3–1.5
  with a little of the fat's warmth (white piping: butter); half the lambert seen through a softened normal;
- **translucency** (the key light): `exp(−thickness / 2.6 mm)` (cocoa 1.4–1.5 mm), distortion 0.3–0.35, power 3–4,
  strength 0.5 (body) / 0.75 (piping);
- **coloured shade**: the room's light saturated ×1.15–1.2 (multiple scattering) and thin parts lit a little through;
  occlusion coloured (a crease is the frosting's colour, darker, never black: floor 0.36 on the piping);
- **occlusion**: the baked occlusion on the room's light (diffuse and specular) and at 40 % (piping) – 45 % (body)
  on the key (micro-shadowing the 1024 shadow map cannot resolve);
- **sugar glints** (vanilla only; the key, not the flames): crystals in 0.16 mm and 0.53 mm cells (55 % and 19 % of
  cells), each facet anywhere within ≈ 55° of the surface, a 380 lobe, faded where a cell is smaller than a pixel;
- **colour**: a hand-mixed mottle (±2–3 % at 2–4 cm), crests lighter and warmer, grooves and creases deeper and more
  saturated (piping up to ≈ 6 %, cocoa ≈ 10 %); the body deeper where the contact map says piping is near;
- **satin roughness**: piping 0.34 (crests) → 0.62 (grooves) + 0.1 in creases, with the very slight sheen on the crests;
  body the v1.5 map 0.40–0.66 + 0.12 in contact creases (the candles' gloss as before); cocoa: ganache 0.26–0.50
  (piping) and 0.30–0.50 (body), no glints;
- **sugar grain** (≈ 0.5 mm bump, faded out where a pixel covers it) on every frosting part.

The tiers draw first (`renderOrder −1`), so the piping's buried feet are depth-rejected before they are shaded.

### Contract and the scene's geometry hooks

Re-measured from the export: `MASTER.cakeRadius` 0.62869 scan (13.83 cm; v1.5 0.635837), `MASTER.cakeTop` 0.64371
(v1.5 0.647391); the underside stays the master's (the bottom border is flattened onto it), so `STAND_TOP`,
`CANDLE.seat`/`insert`, the press's `TOP_Y` and the plate contact are unchanged. Sockets: unchanged (the top within
±1 mm of the master's at every socket, tested). Bin clearance: `CAKE_RADIUS` is smaller (more clearance); every bin
test passes. Placement collar, dimple and melt: unchanged and working (strip below).

### Frame cost

`scripts/cake-perf.ts`, M2 Pro, Chrome 154 headless (Metal), real time, guest-ready with live flames then two accept and
two decline cycles, A/B against v1.5 (`7ebc274`) on its own server, interleaved:

- frame interval: laptop and phone both p50 16.7 / p95 16.7–16.8 / p99 16.8 ms (60 fps);
- the frame rendered back to back with a pixel read-back (wall time, the GPU waited on): v1.6 laptop 2.9–3.5 ms
  (median 3.08) vs v1.5 2.6–3.9 (3.09); phone 2.1–2.3 (2.2) vs 2.0–2.6 (2.5): no measurable difference;
- the patches alone (the same frame with the frosting's patched materials vs plain clones of them): +0.0 ± 0.2 ms at
  both sizes (≤ +1.5 ms: headroom for the flames' bloom);
- GPU timer queries around the stage's render were too noisy on this shared machine to separate builds (v1.5 alone
  4.5–6.4 ms medians run to run); recorded in `evidence/v1.6/cake/perf.txt`.

Cost elsewhere: GLB 31.9 MB raw / 15.2 MB gzip (v1.5 12.5 / 6.9; budgets waived): mostly 32-bit indices of the joined
piping. Meshopt compression in the shared export chain (`compose.ts`, with the decoder in the scene's loader) would
take most of it back; that is outside the cake's files and left to the integrator.

## Adversarial passes (frames beside the photographs: "would a VFX supervisor sign this as buttercream?")

1. First sweeps: teeth too fine and regular, crushed-ice shells (a random tooth phase per foot), dots with a sawtooth
   rim (a closing fan that confused orientation), black creases (occlusion to zero). Fixed: random draws hoisted
   per piece, smooth tooth profile, open dot foot, coloured occlusion with a floor.
2. Swags read grey and busy at laptop size; rope border crumbly and jagged; shells separate "teeth". Fixed: lighter
   groove darkening, twisted rope with twist-aligned sampling, overlapping shells.
3. Rosettes: shallow flutes (plasticine), a fin of tail, flat discs seen from behind over the far edge, lower half
   floating off the side. Fixed: 12–14 deep teeth, tail tucked, back mound, settle-onto-surface (side rosettes only:
   on the crown rosettes it crumpled them).
4. Body: corduroy chatter, a blocky dark outline round the shells (under-piping texels bleeding), no sparkle. Fixed:
   patchier, shallower chatter; gutter refill and blur; glints with wide facet distribution.

Remaining, judged at the real sizes and in close-up: the far side's rosette backs are smooth mounds (correct for
buttercream, but plainer than the fronts); crown rosettes read as tidy stacked swirls; the smear is small enough to be
missed. The single frontal key of the production rig (`neutral-room`, kept: no compensating grade) still gives the
product-shot evenness the brief mentions; the material now carries the depth.

## Evidence (`evidence/v1.6/cake/`)

- `baseline/`: v1.5 at the three sizes and in macro;
- `final/`: the same views on v1.6, vanilla and cocoa (`*-square540`, `*-laptop(-crop)`, `*-phone(-crop)`,
  `*-macro-*`: hero, side, swag, rosette, top edge, top surface, base, graze, and single pieces `z-*`), the host
  placement strip (`placement-strip`), and side-by-side sheets `compare-*.webp`;
- `perf.txt`: the frame-cost runs.

Regenerate: `pnpm models birthday`, `pnpm dev --host 127.0.0.1 --port 5601`, then
`node --experimental-transform-types --no-warnings scripts/cake-evidence.ts final http://127.0.0.1:5601 sizes,macros,cocoa,strip`
and `node --experimental-transform-types --no-warnings scripts/cake-perf.ts http://127.0.0.1:5601 v16`.

## Tests

`tests/birthdayPiping.test.ts` (new, 8): determinism to the bit; no two pieces alike; teeth that read (≥ 3 crests,
≥ 0.4 mm deep); ropes pressed in with a fillet; ends that close and tails that thin; pressure; the pulled dot; the
bake's occlusion and thickness. `tests/birthday.test.ts`: the stand test measures the stand's own mesh and checks the
smears on its plate; the material test checks the packed `_FOOD` attribute and the unique contact map; the hand-coat
test allows the scraper's waves (neighbouring 5° bins ≤ 1.2 %); a new test checks the edge bead (≥ 2.2 mm from a cut
cylinder's corner, v1.5 1.7).

Posters (`tests/browser/posters.spec.ts`) fail until the integrator regenerates the Birthday posters, thumbnails and
backdrops: the cake changed.
