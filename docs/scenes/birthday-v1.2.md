# Birthday v1.2: the scan-to-CAD cake master (v1.2.1 polish)

The Birthday scene now shows `models/masters/birthday-cake.glb`: the two-tier piped cake on its turned ceramic stand, with
six twisted candles. The beats are the same as v1.1: the host places the candles and they light, a breath blows them out
on Accept, and on Decline the cake goes into the shared pedal bin. Durations are unchanged (host 1.3 s, accept 1.4 s,
decline 1.5 s).

Files: `scripts/masters/recipes/birthday.ts` (the recipe, with a Decisions block), `models/birthdayContract.ts`
(measured contract), `models/birthdayParts.ts` (code-authored candle rig: wicks, flames), `models/birthday.ts`
(runtime rig), `src/scenes/birthday/{poses,sequences,framing,index}.ts`, `tests/birthday.test.ts`,
`tests/browser/birthday.spec.ts`.

## v1.3: the studio pass (2026-10-01)

- **Grade removed.** The v1.2.1 vanilla darkening (body `#E0D3BF` at roughness 0.58) is gone: vanilla is the ivory
  rebuild's palette again (body `#F3E9D8`, piping `#FFFDF8`, rosettes `#F3E3C7`, pearls white) at the master's own
  roughness (Decisions, Presets). The darkening fixed the judges' v1.2 must-fix "flat vanilla"; under the new light
  the ivory keeps its form without it. Cocoa is unchanged.
- **New studio.** The production rig is `neutral-room` (`docs/style-reference.md` v1.3); the cove measures
  `#D5D2CD` here, the token itself. No gobo, so the cookie's dimming no longer separates Low from Normal.
- **Judges.** The ivory body (`#DEDAD4` on the cove's `#B7B4B0`) separates, with the piping in relief (luminance p1
  124, p99 240, flames excepted). None wants the darkening back. Two caveats from them: under the peach
  `livetime-warm` rig the vanilla nearly vanished (the grade compensated for that backdrop), and if the cove is ever
  lifted towards a lighter greige, re-check the vanilla stills and take at most a 3–4 % value step, not `#E0D3BF`. The
  in-bin shade was tuned under the v1.1 key and was not re-derived.
- Posters regenerated under the new rig (21.1–22.5 KB, shared declined 11.6 KB).

## Decisions

- **Scale 1.1 (scan to scene units).** The cake with its candles and wicks, from its underside to the wick tips, is
  1.074 scan units. It has to drop below the shared bin's rim (1.30) from the liner floor (0.10), keeping the flaps'
  12 mm margin: 1.1 × 1.074 = 1.181. At this scale the stand's plate is r 0.838 and the stand is 0.776 tall (v1.1: 1.0
  and 0.70). The lower tier's piping reaches r 0.692 (v1.1: 0.815).
- **Yaw 5°.** The master turns 5° about y so that, from the 20° camera, the six candles spread evenly across the top
  tier. Without it they read as pairs 0.17 apart.
- **The stand stays behind on decline.** The cake (both tiers and all piping) goes under `cake_secondary`, and
  `cake_authored` is the cake's underside centre on the plate. The master's `cake_stand` is mapped to `tray`, with its
  pivot at its underside centre and its foot at the birthday_root origin; it stays put, as v1.1's tray did. The brief
  allowed the stand to sit under the cake's authored node. That doesn't work here: the shared bin is fixed, and fitting
  stand plus cake (1.77 scan units with wicks) under its rim would mean a scale of about 0.66. That is 40 % smaller than
  this, and well below v1.1's framing. Lifting a cake off its stand is also what a person would do.
- **Six candles, not three.** The master is composed for six. Three would leave a lopsided hexagon of empty sockets. The
  host places them in a left-to-right cascade 55 ms apart (0.18 to 0.94 s). Each one lowers for 0.30 s and settles for
  0.18 s, so the whole placement still fits in the 1.3 s host beat with the guest-ready hold at the end. Flames rise
  20 ms apart (0.84 to 1.06 s), each after its own candle has settled. On accept they go out left to right, 44 ms apart
  (0.25 to 0.595 s), with one wisp each. The sequence reads as one gesture, and each flame is still visible on its own
  in the review clips.
- **Candle sockets come from the master.** Each `candle_N_*` master node is mapped as `candle_NN_wax`, with its pivot at
  its base centre, under the builder's `candle_NN`. That node sits exactly on the master's base centre, turned by the
  yaw. Lowering `candle_NN` therefore lowers the wax, wick, flame, wisp and shadow proxy together into the master's own
  socket. Seated candles bed 18.7 mm into the top tier, as authored. They are numbered left to right on screen.
- **Wicks and flames are re-authored.** The master's `candle_wicks` and `candle_flames` are one mesh each for all six
  candles (README pitfall 4), so they are dropped. The builder authors a per-candle wick (master wick height, slight
  curl) and the v1.1 view-dependent shader flame (`mat_flame_outer`, unique per candle) at each tip. The wick is the
  master's size. The flame is drawn at `FLAME_DRAW` = 1.5× the master's height (0.228 instead of 0.152) and 1.45× its
  width, and the lathe is a quarter wider again because the shader fades the silhouette. At the master's own size the
  six flames were a few pixels tall at the shared framing and the accept beat barely registered (v1.2.1 review).
- **Joins.** The 21 tier and piping meshes become 4 (`frosting_cake_{buttercream,piping,rosette,pearl}`). The candles
  are contract nodes and stay separate.
- **Shadows.** The joined frosting (≈185k triangles) and the stand (21k) skip the shadow pass. Generated proxies cast
  for them instead:
  - `cake_shadow_proxy`, 1,798 triangles, under `cake_secondary`, so it follows the presentation yaw, the carry and the
    lean.
  - `tray_shadow_proxy`, 426 triangles.
  - Each candle casts through `candle_NN_shadow_proxy` (186 triangles, under `candle_NN`).

  The candle proxies fix a texture leak. The wax's stripe LUT is a `map`, and three's shared shadow depth material keeps
  the last caster's map (`result.map = material.map` in `WebGLShadowMap`). After the scene was disposed, the next shadow
  pass re-uploaded that disposed LUT. The result was one leaked GPU texture per Birthday visit, found and now guarded by
  the new browser test. The proxies carry no map.
- **Presets are material variants.** The master ships the blue palette: powder-blue body, cornflower rosettes
  (`tools/cake_palette.py` in the Models repo).
  - **Vanilla (the default)** recolours the four frosting materials by `baseColorFactor`: ivory body `#F3E9D8`,
    warm-white piping `#FFFDF8`, ivory-cream rosettes `#F3E3C7` and white pearls. This is close to the original ivory
    rebuild's `#EEDFC5` / `#F3E8D4`. The first rosette tone, `#EEDBB8`, read as caramel under the warm key, so it was
    lightened.
    **Studio pass v1.3:** back to the palette above at the master's own roughness; the v1.2.1 darkening below was a
    compensation for the v1.1 peach stage, removed so the ivory is judged under the new rigs.
    **v1.2.1 (removed in v1.3):** the body was `#E0D3BF` with roughness 0.58 (the master's is 0.42), the piping `#FFFCF6`, the
    rosettes `#F7EFE1` and the pearls white. At `#F3E9D8` the lit body sat in the tone mapper's shoulder, so the
    tiers rendered as a flat ivory cut-out on the peach stage and the swags lost their relief. The deeper, more
    neutral body keeps the shading, and the lighter piping now stands out from it, as on cocoa. A first try at
    `#E8D5B7` read as peach under the warm key. The cocoa copy inherits the body roughness.
  - **Cocoa** is a `KHR_materials_variants` copy of the same four materials: chocolate body `#5E3727`, milk-chocolate
    piping `#94603F`, dark rosettes `#4A281A` and ivory pearls `#F4EADB`.

  The stand (`#A2B2BC` glaze) and the candles (pink and blue stripe LUTs) keep the master's colours. Clearcoat and the
  pearls' iridescence are kept. Materials are renamed `cake_*`, so no library name collides.

## Choreography changes (v1.1 → v1.2)

| Beat | v1.1 | v1.2 | Why |
|---|---|---|---|
| Host: candles | 3 candles, 100 ms apart, 0.45 s `cubicBezier(0.4,0,0.2,1)` landing at rest | 6 candles, 55 ms apart. Each has a **weighted descent** (cubic Hermite from rest, accelerating, still moving at 0.35 units/s when it meets the buttercream), then a **settle**: a 6 Hz spring-damper (ζ 0.5) driven by that landing speed. It presses ≈5 mm in and rebounds under 1 mm, and its last millimetre fades to exactly 0 within 0.18 s | A real candle pushed into buttercream carries some speed into contact and gives a little. The descent hands its velocity to the spring, so the motion is C1 at contact |
| Host: flames | 30 ms apart | 20 ms apart, each after its candle has seated | Six flames in the same window |
| Accept: extinguish | 3 flames in 0.25 to 0.60 s, `opacity = 1 − k^1.5` | 6 flames in the same window. Opacity uses `1 − k²(1.5 − 0.5k)` and the bend uses `1 + 0.5k²` | v1.1's linear bend started with a velocity jump, and `k^1.5` has unbounded acceleration at k = 0; both are now C1 |
| Accept: wisps | Base rises 0.16 on easeOutCubic, opacity `sin(πw)` | The foot stays on the wick while the curl unfurls (height 0.4 → 1, easeOutCubic). It lifts off (0.07, ease-in w³) only as it fades. Opacity is `0.42·sin²(πw)` | v1.1's rising base left the smoke floating detached above the candle while it was most visible. Seen in the v1.2 contact sheets and fixed |
| Accept: wick return | `EASE.land` | `smoothstep` | C1 at both ends |
| Decline: carry | `cubicBezier(0.6,0,0.4,1)` plan travel, no sway | Smootherstep plan travel, which sets off and arrives with zero acceleration. Added a **pendulum lean** of `cake_secondary`: θ'' + 2ζωθ' + ω²θ = −a(t), where a(t) is the carry's closed-form plan acceleration (2.1 Hz, ζ 0.4). It is integrated once at module load (RK4, 0.25 ms) into a Hermite-sampled table, faded to upright over 0.80 to 0.93 s and scaled so the peak is 1.8° | The cake on its plate trails as it sets off (−1.42°) and swings forward as it slows over the bin (+1.80°, within the brief's 2°). It is steadied before it enters the opening, so it drops straight and centred. The shadow proxy is under `cake_secondary`, so the shadow leans with the cake |
| Accept: breath (v1.2.1) | Lean `{x −0.42, z −0.12}`, mostly away from the camera | Lean `{x −0.45, z −0.30}`: the sideways part is in the picture plane, about 31° at full breath and up to 46° as each flame dies. A 7 Hz ±12 % flutter, out of phase from candle to candle. The flame is drawn out 22 % taller and 15 % thinner (`flameStretch`) | The 20°/15° camera foreshortens a lean away from it, so the breath did not read. Accept now changes the frame by up to 0.07 mean per frame (was under 0.02) |
| Accept: wisps (v1.2.1) | `#A39B91` at 0.42·sin² | `#857C72` at 0.62·sin² | The pale wisp disappeared against the peach wall |
| Decline: lift-off (v1.2.1) | `EASE.lift` over 0.25 to 0.42 s, with its largest step (0.153 a frame) in the third frame | `cubicBezier(0.45, 0, 0.25, 1)` over 0.25 to 0.46 s, building over five frames to a peak of 0.128 a frame | Reads heavier. It still clears the bin's rim by the old margin as the carry comes over it, and the bedded shell border rises 10 mm before the cake has moved 2 mm across (new test) |
| Decline: in the bin (v1.2.1) | Candle tips and crown rosettes stayed key-lit on the black interior and read as confetti (frames 57 to 72) | **Bin shade.** Once the cake is over the opening (`cakeInBin`, from 0.72 s, while all of it is above the rim), the cake's own materials darken with world height: both frosting presets and the candles. Full light 2 cm above the rim, 6 % of it 5 cm below (`BIN_SHADE`). This is an `onBeforeCompile` ramp on the imported `cake_*` materials with shared uniforms | The liner blocks the key and most of the fill. The dropped cake now sinks into shade, and the seated candles are dim nubs in the dark until the flaps close |
| Decline: flap close | Two `cubicBezier`/`EASE.land` pieces | Two Hermite pieces that hand over at the damper's catch speed | The two pieces hand over at a shared velocity (C1 at 0.95 s and 1.2 s) |

Every channel is a pure function of time, so replay and reversal restore everything exactly. The unit tests check:

- canonical poses at 0 and at the end of every sequence;
- no jumps at 1 ms;
- C1 everywhere (second differences at 0.1 ms stay at acceleration scale);
- the cascade order, the press depth and that each candle seats exactly;
- flames only in 0.84 to 1.06 s;
- extinguish order;
- that a wisp's foot stays on its wick while it reads;
- that the lean stays within 2°, its back and forward phases, and that it is upright when off the stand and before the drop;
- that the tipped cake clears the stand, the rim and the flaps;
- that the flaps close only after the cake is below them;
- (v1.2.1) that every lit flame leans and stretches through the breath, and that the lean's picture-plane part is at
  least half its away part;
- (v1.2.1) the heavy lift-off: the first three frames stay under half the peak step, the peak stays under 0.135 a
  frame, and the shell border clears its 10 mm bed before it moves across;
- (v1.2.1) that the bin shade switches on only over the opening, with the whole cake above the shade ramp.

## Measured contract (scene units, `birthday_root` space unless noted)

Master (scan units, from `scripts/masters/inspect.ts` plus a vertex scan):

| Part | Measurement |
|---|---|
| Stand | foot underside −0.948, plate top −0.2425, plate r 0.7615, foot r 0.379 |
| Cake | underside −0.2519, widest r 0.6290, top tier 0.603, crown 0.6396 |
| Candles | base 0.586, top 0.8028, r 0.01866; sockets at (±0.285, 0) and (±0.1425, ±0.2468) |
| Wicks | 0.796 to 0.8221 |
| Flames | 0.809 to 0.947, r 0.0181 |

At `CAKE_SCALE` 1.1:

| Constant | Value |
|---|---|
| `STAND.top` / `radius` / `foot` | 0.7761 / 0.8377 / 0.4171 |
| `STAND_TOP` (cake underside on the plate; the piping beds 10 mm into the plate) | 0.7657 |
| `CAKE_RADIUS` | 0.6919 |
| `CAKE_TOTAL_HEIGHT` (underside to wick tips) | 1.1815 |
| `CANDLE.seat` (in `cake_secondary` space) / `height` / `radius` / `insert` | 0.9217 / 0.2385 / 0.0205 / 0.0187 |
| `CANDLE.flameBase` / `flameHeight` (master) / wick tip (`candle_NN` space) | 0.2453 / 0.1518 / 0.2597 |
| `FLAME.height` / `FLAME.radius` (drawn: `FLAME_DRAW` 1.5 / 1.45 × the master) | 0.2277 / 0.0289 |
| `CANDLE_SOCKETS` (x, z in `cake_secondary` space, left to right on screen) | (−0.3123, 0.0273), (−0.1325, 0.2841), (−0.1798, −0.2568), (0.1798, 0.2568), (0.1325, −0.2841), (0.3123, −0.0273) |
| Bin (shared, unchanged) | rim 1.30, floor 0.10, opening 0.89, r 0.94, at (−1.04, 0, −1.72), facing the stand |
| `CANDLE_HOVER` | 0.5 |
| `CARRY_HEIGHT` | 1.42 |
| `RIM_CLEARANCE` | 0.06 |
| `LEAN_MAX` | 1.8° |

The test "Birthday runtime GLB matches the contract" re-measures the exported GLB against these numbers: the stand box,
the frosting's underside, radius and top, each wax at its socket with the right height and radius, the shadow proxies'
parents and flags, the variant colours, and the motion bounds.

## Export report (`pnpm models birthday`)

```
── birthday export report ──
  triangles 219,780 · draw calls 23 (+ 8 shadow proxy, 3,340 tris, shadow pass only) · 55 nodes
  textures 2 · 0.0 MiB as RGBA8 + mips
    256×4 webp 0 KiB  baseColorTexture of cake_candle_pink
    256×4 webp 0 KiB  baseColorTexture of cake_candle_blue
  GLB 4343.0 KiB raw · 2427.5 KiB gzip
  contract nodes missing: none (43 found)
```

The export is deterministic: exporting twice gives the same SHA-1. The shared bin GLB is unchanged.

Frame times (390×844 @3×, Normal tier, 10 alternating accept/decline cycles after a warm-up, Chrome on this M2 Pro):
924 frames, p50 16.7 ms, p95 16.8 ms, p99 16.8 ms, max 16.8 ms, none over 20 ms. That is a locked 60 fps. Durations are
unchanged, so `capture timing` was not re-run.

## Verification

- `pnpm typecheck` and `pnpm test` pass. `tests/birthday.test.ts` has 23 tests (v1.2.1 added three): choreography,
  builder, and the runtime GLB against the contract.
- `tests/browser/birthday.spec.ts` passes, 6 tests. The new one checks that the cocoa variant changes the frame visibly
  and that vanilla comes back exactly. It also covers a Low tier round trip, and leaving and re-entering the scene
  twice (once at Low) with no texture or geometry growth and no console errors.
- `pnpm capture birthday` regenerated the posters, review clips, frames and the collection thumbnail. I read the
  stills and contact sheets of every clip over three iterations. Iteration 1 looked at the WIP. Iteration 2 fixed the
  floating wisps and the caramel rosettes. Iteration 3 confirmed the fixes after the shadow-proxy change. Compared
  with the v1.1 stills, the framing and beats are the same: the cake right of centre, the bin entering from the left,
  and the candle tips visible inside the bin before the flaps close, as in v1.1.
- v1.2.1 polish (review fixes): re-exported the GLB (deterministic: two exports give the same SHA-1), re-ran
  `pnpm capture birthday`, and checked by eye the stills, the host, accept and decline frame sequences and the cocoa
  clips. Frame differences: accept reaches up to 0.07 mean per frame during the breath (was under 0.02). The decline
  lift-off now ramps 0.4, 1.2, 2.2, 3.4, 4.3 over five frames (was 0.7, 2.4, 4.4). The six browser tests pass.

## Known gaps

- **Possible leak in other scenes.** The three.js shadow depth material keeping the last caster's `map` is not specific
  to Birthday. Any scene whose shadow-casting master mesh has a `map` and is disposed could leak that texture the same
  way. I worked around it here with proxies. A general fix belongs in shared code: for example, the stage could clear
  stale casters, or `disposeImported` could render a frame without them. I did not edit shared files.
- **Flame style.** The flames are the v1.1 shader flame, which is orange-tipped and stylised, not the master's
  cream teardrop. The brief keeps the shader, and the orange tip is what separates the flames from the cream stage.
  Since v1.2.1 they are drawn at 1.5× the master's size, so they read at stage size.
- **Thumbnail size.** The cake is small in the 192 px collection thumbnail because the shared camera fits the whole
  decline path, bin and flaps included. The deeper vanilla body helps it read there. Re-framing is a shared-camera
  decision, so it was not changed here.
- **Bin entrance.** The bin slides in fast (frames 1 to 9), and its cast shadow enters the frame one frame before the
  bin does. This is the shared bin choreography, unchanged from v1.1.
- **Thin candles.** The candles keep the master's proportions (r 0.0205), so each is only a few pixels wide on a
  phone. The larger flames now carry the cascade.
- **Lean is subtle.** The carry lean peaks at 1.8°, which reads only as a soft sway at stage size. That is the brief's
  intent (≤ 2°).
- **Lookdev tile.** The lookdev identity tile (`buildBirthday`) still builds the v1.1 code-authored cake, because the
  master GLB only loads asynchronously.
