# Rig `neutral-room` (studio pass v1.3, direction (b))

**What it is.** The Models viewer's interior rig (`scan-to-cad-rebuilds/candidates/final/env.js`, the light the
masters were judged in and photographed under for `master-renders/<master>/B-hero.png`) ported as a rig, standing on a
neutral greige painted cove. File: `src/render/rigs/neutral-room.ts`. View it at
`http://127.0.0.1:5199/?scene=<scene>&rig=neutral-room`.

| | |
|---|---|
| Stage colour (measured) | **`#D5D2CD`** (business `#D8D5D0`, party `#D1CEC8`, birthday `#D5D2CD`, sports `#D7D4CF`, dinner `#D4D0CB`) |
| Tone mapping / exposure | three `NeutralToneMapping` (Khronos PBR Neutral, what the viewer installs by hand) · **1.15** (the viewer's) |
| Environment | the viewer's room, 1024×512 linear float equirect, PMREM'd once without blur · `environmentIntensity` 1 · `metalEnvIntensity` 1 |
| Key | one soft `SpotLight` `#F3F5FA` × 1.5 (decay 0) from the window's direction, raised to 40° elevation, aimed at the content, angle 0.62, penumbra 0.8 |
| Shadow | `vogel16`, 1024², radius 5, bias −0.0004, normal bias 0.012, near 4, far 24 |
| Backdrop | `createSweepBackdrop` painted cove `#BEB9B1`, roughness 0.9, no plaster relief |
| Gobo | none |
| Low tier | `setShadows(false)` via the Stage (contact shadows remain); `setLowDetail` is a no-op (nothing expensive to drop: no cookie, no relief) and reversible |

## The room (env.js, ported verbatim in substance)

One large sheer window with soft mullions (3.4, cool) and linen drapes either side; an overcast ceiling gradient with a
skylight strip and a large soft bounce behind the camera; a narrow sheer side window; a tungsten lamp behind-right
(1.8, warm) with its halo on the greige walls; a framed print and a dark doorway behind the subject; a walnut sideboard
and a dark table runner on the camera side (the dark strokes chrome and silver need, otherwise polished metal reads as
grey satin); a mid-grey table meeting the wall at a soft horizon stroke. All parameters are kept exactly as judged in
the viewer (`NEUTRAL_ROOM` in the file); only the placement is new.

**Placement.** three's equirect convention puts θ = atan2(z, x). Placed literally (+20° for the product camera's
azimuth), the window landed camera-right and the shadows fell forward-left (round 1), the opposite of the masters, which
are lit from the upper left. The viewer evidently saw the room mirrored, so the rig maps world θ = 120° − room θ: the
viewer's camera direction (room θ ≈ 50°) lands on the product camera (world θ = 70°), the window sits camera-left-front
with its mullion cross in the cloche, the lamp's warm patch on the right of the dome, the runner and sideboard on the
camera side, the doorway behind. The cloche now reads like `silver-cloche/B-hero.png`.

**Why a key on top of an image-based window.** The viewer has no direct light (its sun is 0: its specular dot read as
CG). The brief requires a real-time soft shadow, so the window's direct share is one wide-penumbra spot from the window's
direction; at 1.5 it adds the shadow and a gentle modelling without a CG hotspot. 2.2 (rounds 2–4) washed the
reader's chin and the floor; lowering it and lifting the cove albedo kept the stage the same colour with more of the
light coming from the room.

## Iterations (`pnpm capture rigs http://127.0.0.1:5302 neutral-room`, sheet + stills each round)

1. Literal port, rotation +20°, cove `#C9C4BC` with v1.1's plaster relief at 0.18, key 2.2 at 0.5 rad / penumbra 0.9.
   Window and shadow on the wrong side (camera-right, shadows forward-left); the plaster relief read as cloudy dirt under
   the raking key. Stage `#D9D4CC`.
2. Room mirrored (world θ = 120° − room θ), clean painted cove. Window camera-left, shadows back-right, mullions in the
   cloche, lamp warm on its right. Stage `#EBE7E2`: nearly the page's warm white, the plate and vanilla cake lost their
   edge.
3. Cove `#B2ADA5`: stage `#D4D0CB`, plate, ivory cake and cream ball separate from the floor; metals, vinyl and glass
   compared against the masters (reader glass, turntable lid interior and plinth within a few levels of the viewer).
4. Key cone 0.62 / penumbra 0.8: the top corners no longer fall into a gloomy vignette.
5. Key 1.5, cove `#BEB9B1`: less direct-light wash on the brushed steel and the reader's chin, same stage colour.
6. Shadow map 1024² radius 5 (same world softness as 2048²/9 at a quarter of the memory, v1.1's budget); `stageColor`
   set to the measurement.

Checked besides the sheet: every authored path mid-motion, accept and decline (8 frames each, scratch capture): the
airborne ball over the hoop, the lifted cloche over the plate and over the dark bin, the swinging card, the cake carried
over the bin (ivory and the dark bin both hold detail), the closing turntable lid. Low tier (shadows off) and the return
to Normal (shadows back) on all five scenes, no console warnings. Clipping: at most 0.16 % of pixels ≥ 250 (glints on the
cloche), dark clipping only in the reader's black glass (as authored).

## Sheet and stills

`outputs/rigs/neutral-room/sheet.png` and `outputs/rigs/neutral-room/<scene>-<preset>-<pose>.png` (720², local, git-ignored;
regenerate with `pnpm capture rigs <baseUrl> neutral-room`). Compare with `outputs/rigs/v1.1/sheet.png` and the master
renders.

## What a judge should know

- The stage is a light warm-neutral grey (`#D5D2CD`), a step down from the page `#FBFAF7`: the canvas reads as a lit room
  set into the page rather than a continuation of it. Darker (the viewer's ~`#8A8580`) separates the white plate even more
  but sits heavily in the card; lighter (round 2) loses the white objects.
- The reader's lower front reads light grey: the master's own material under the window, not the key (it stayed when
  the key dropped by a third); the viewer's higher camera shows less of it.
- No material was graded; the rig only declares light.
