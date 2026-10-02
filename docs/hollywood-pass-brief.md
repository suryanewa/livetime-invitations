# The v1.6 Hollywood pass: brief

Surya, 2026-10-02, on `main` at `03ca155` (v1.5, the perfection pass: `docs/perfection-pass-brief.md`,
`docs/style-reference.md` v1.5): "Everything looks great for the most part, but there are two issues" — three,
each with the same bar, **"I'm expecting Hollywood CGI level work here"**:

1. **The cake** "still has a plasticky, too perfect and geometric shape / texture".
2. **The flames** on the cake "aren't bad, but are unconvincing".
3. **The steam under the cloche** "isn't convincing; it needs to realistically accumulate under the cloche and
   somewhat match its shape when it's lifted (as it would be in real life)".

Everything else stands (the twelve v1.5 edits, the rig, the scale, the pull-back). Budgets stay waived.

## What "Hollywood CGI" means here

A feature-film food/FX shot, not a product render: the thing on screen is **believed**, at the showcase's real
sizes (square 540, laptop 1280 × 720 @2×, phone 390 × 844 @3×) and in close-up. The v1.5 rounds added mm-scale
variation, roughness maps and particle systems and the judges scored them 6–8; Surya still sees CG. So this pass
does not tune — it **rebuilds each of the three with the techniques a VFX house would use at this scale**, and
judges the result only by looking at it next to photographs and film frames of the real thing. The v1.5 owners'
records (`docs/scenes/birthday-v1.5-cake.md`, `birthday-v1.5-fire.md`, `dinner-v1.5.md`) say what exists and
what the judges still faulted; read them, keep what works (the physics, the determinism, the clocks, the APIs
other scenes depend on), replace the look.

Shared rules that still hold: pure functions of time in `sequences.ts`, live motion in `simulate`/`settling`/
`settle()`, reduced motion shows good stills, posters are stills of the live scene (`tests/browser/posters.spec.ts`
diffs them), the `neutral-room` rig and the 18° lens are the production look (no tints, no compensating grades),
60 fps p95 ≤ 16.8 ms at both sizes (measure), deterministic exports (`pnpm models <scene>`), and every claim is
proven by rendered frames before it is reported.

## Where the CG tells are (measured on `main` at the real sizes)

**Cake.** At laptop size the tiers are mathematically true cylinders with razor-clean top edges; every swag rope
is the same tube swept on the same curve; rosettes, shells, dots and pearls are instances with ±10 % scale noise
that the eye reads as "the same object copied"; the body is one flat blue with a normal map that disappears at
this size; there is no translucency, no sugar/fat micro-specular, no sag, no smear, no crumb, no contact between
piping and body (ropes sit *on* the surface instead of merging into it); the single key light and greige cove give
a product-shot flatness. The cocoa variant reads better only because ganache really is smooth. Film-quality
buttercream: look at the Pixar/Disney food work (*Ratatouille*'s food shaders, the *Cake* and *Soul* bakery
shots), at commercial food CG (The Mill, MPC food spots), and at real Lambeth-style piped cakes: the piping is
sculpted, with drag marks, pinched tails, tiny tears and overlaps where one rope meets another; the body has
knife chatter, grain from the sugar, slight translucency at thin crests (SSS), a satin specular that breaks into
micro-glints; the tiers are hand-coated so their silhouettes undulate by a few mm and the top edge is a soft
rounded bead, not a corner; everything sits with weight.

**Flames.** The v1.5 flame is a camera-facing quad with a 2D shader, real size, a screen-space glare, blackbody
colour and a flicker. It is unconvincing because a flame is a **volume**: its teardrop has depth and a soft,
self-luminous body that glows through itself; it refracts and shimmers the air above it (heat haze); its light is
not a point but a soft, flickering warm glow with soft shadows; its edge is not a cutout but a transparent
gradient that blooms. Film flames (Houdini pyro, Phoenix) are rendered volumetrically with emission from
temperature, and with bloom and heat distortion in comp. At 13 mm on screen the volume is tiny, so a per-candle
raymarched volume (a small box, 24–40 steps, 3D noise advected upward, temperature → blackbody emission with
Planckian colour, soft alpha) is affordable for six candles, and a proper HDR bloom pass (threshold above 1.0, a
mip-chain, subtle) makes the glow real. Heat haze above each flame is a small screen-space refraction. The light
on the cake must flicker with the flame and cast soft shadows from the candles.

**Steam.** The v1.5 steam is 61 billboard puffs and ribbon plumes spawned at the rim and the plate. Surya's note
is physical: under a hot cloche the vapour **accumulates** — a dense, saturated, slowly turning cloud fills the
dome and condenses on it; when the cloche is lifted, that cloud **keeps the dome's shape for a beat** (a
hemisphere of fog standing on the plate, its top dragged up a little by the rising dome), then its edges roll
outward and down over the rim, the top mushrooms up and tears into wisps as the room's air shears it, and it thins
over a few seconds while the plate keeps breathing a thin veil. Film steam is a volume (sparse grid or VDB) lit
with single scattering; here it should be a **raymarched volumetric** density field in a box above the plate: the
density starts as the dome's interior (its SDF, filled with 3D noise), is advected by an analytic velocity field
(buoyancy up the centre, outward over the rim, a little curl), diffuses and fades, with the dome itself (while it
is still over the plate) as a moving boundary that drags the top of the cloud. Lit by the key direction with a
cheap single-scatter term and ambient from the room, so it is bright against the shadowed plate and nearly
invisible against the bright cove, exactly as real steam is. Depth-tested against the plate, the dome and the
table (it needs the scene's depth).

## Owners and files

- **Cake** (`v1.6/cake`, port 5601): `scripts/masters/recipes/birthday*.ts` (the recipe's `transform` and
  `finish` hooks, textures), `models/cake*.ts`, `models/birthdayContract.ts` (re-measure after any geometry change),
  `src/scenes/birthday/{poses,sequences,placement,melt}.ts` only as far as geometry forces it. Decide whether to
  keep the master's piping geometry and sculpt it (displacement, per-instance deformation, merging into the body)
  or regenerate the piping procedurally as sculpted sweeps with noise, pinches and overlaps (the generators in
  `~/Documents/Creative/Design/Livetime/Models/scan-to-cad-rebuilds` show the conventions); either way the result
  must be deterministic and exported by `pnpm models birthday`. Materials: a real subsurface approximation on the
  frosting (three.js `MeshPhysicalMaterial` transmission/thickness is wrong for this; a wrap-diffuse + thickness-
  based translucency term in the shader patch, with a sugar micro-glint specular layer), colour variation,
  a soft rounded top edge, a few mm of silhouette undulation, drag marks and tails on the piping, contact fillets
  where piping meets body. Keep the blue palette and the cocoa variant. The candle sockets, the melt and the bin
  clearance (`CAKE_RADIUS`, `RIM_CLEARANCE`) must still hold.
- **Flames** (`v1.6/flames`, port 5602): `src/scenes/birthday/fire.ts`, `models/birthdayFire.ts`,
  `src/render/flame.ts`, `src/render/materials.ts` (flame parts). Owns the **bloom post-pass** (new, in
  `src/render/`: HDR threshold ≥ 1.0, a 4–5 level mip-chain, subtle; applied in `Stage.render`; off when nothing
  emissive is in the scene; the stage-colour measurement and the poster captures must be unaffected for scenes
  without emissives — unit-test that) and the **heat-haze refraction**. Keep the breath physics, extinction,
  smoke hand-over and the change-of-mind carry exactly; replace the flame's rendering with a raymarched volume.
  The flame's light on the cake (currently a patch on the cake materials) becomes a flickering soft light with
  soft shadows from the candles if it can be afforded (measure).
- **Steam** (`v1.6/steam`, port 5603): `src/scenes/dinner/steam.ts`, `models/dinnerSteam.ts`,
  `src/scenes/dinner/{sequences,index}.ts` (the reveal's steam parts). Owns the **scene depth** needed by the
  volume (a depth target rendered by the stage before the transparent pass, exposed to the volume shader; keep it
  self-contained in `src/render/` and off for scenes that do not ask for it). Keep the steam clock, the
  change-of-mind rules and `STEAM_END`'s role; replace the puffs and ribbons with the volumetric. Condensation on
  the dome's inside is still invisible from the lens (judge it); the cloud is what matters.

The flames owner's bloom and the steam owner's depth target both touch `src/render/stage.ts`; keep each addition
in its own small module with one hook in the stage, so the integrator can merge both.

## Process (each owner)

1. Measure and look: render the current thing at the three real sizes and in close-up; put a photograph and a film
   frame of the real thing beside it; write down the tells.
2. Research (WebSearch/WebFetch): the techniques (Pixar food shading, Houdini pyro/volume rendering, VDB steam,
   raymarched volumetrics in WebGL/three.js, single-scatter lighting, bloom mip-chains, blackbody emission).
3. Build; render stills and 60 fps frame strips through the real controller; **adversarial pass** against the
   photographs ("would a VFX supervisor sign this?"); fix; repeat until it holds.
4. `pnpm typecheck`, `pnpm test`, `pnpm test:browser` (your port), frame cost at both sizes; commit on your branch.
5. Report: what you built, the numbers, the frame paths (`evidence/v1.6/<owner>/`), the test counts, the commit.

Integration: merge steam → flames → cake, resolve the stage hooks, regenerate Birthday and Dinner posters/
thumbnails/backdrops, full suites, three judges (motion, look, guest), polish, commit, push.
