# Rig `daylight-table`: an object on a desk by a sheer window

File: `src/render/rigs/daylight-table.ts`. Preview: `http://127.0.0.1:5199/?scene=<scene>&rig=daylight-table`.
Sheet: `outputs/rigs/daylight-table/sheet.png` (`pnpm capture rigs <baseUrl> daylight-table`).

**Measured stage colour: `#E0D4C3`** (mean of the central 20 % of the empty stage, averaged over the five
scenes: business `#D8D0C4`, party `#E4D1B8`, birthday `#E3D6C5`, sports `#E1D8CC`, dinner `#E3D4C1`).
The centre of the frame is where the oak desk meets the grey wall, so the token sits between the two: a warm
light greige. That is close to the interface's warm-white page (`#FBFAF7`) without being peach.

## The idea

This is the most "photograph of an object on a desk" of the four directions. A pale oak desk stands against
a light grey painted wall. A large sheer-curtained window camera-left lights the room, with a second, narrow
window camera-right. The window is the key light: cool, broad and soft. It throws a soft shadow to the right
and back across the wood, and it falls off over the desk and the wall the way daylight does a metre from
a window. The desk bounces warm light up into the undersides. Metal, glass and vinyl reflect a room with real
shapes in it: the big window with its mullion cross and curtain folds, the narrow second window, a white
ceiling, a dark shelf and a dim doorway (dark strokes for contrast), and a soft dark patch where the
photographer stands.

## What it is made of

| Part | Setting | Why |
|---|---|---|
| Environment | Procedural equirect (1024×512 float, sampled from a `radiance(θ, el)` function), prefiltered with `PMREMGenerator.fromEquirectangular`; no depth buffer, nothing downloaded, deterministic | The same method as the Models viewer's winning `candidates/final/env.js`, re-authored for this room. The room the reflections show is the room the backdrop shows. |
| Main window (env) | θ 166°, el 26°, 68°×52°, radiance 3.2, cool `[0.90, 0.955, 1.04]`, mullion cross, sheer folds | The large soft highlight on chrome, silver and vinyl, on the side the key comes from |
| Second window (env) | θ 18°, el 22°, narrow (14°×40°), radiance 1.7 | The "hint of a second window": a thin bright band on the right of the cloche, the hoop, the badge chrome and the reader's glass |
| Far wall behind the camera (env) | θ 82°, el 22°, broad, radiance 0.7 | Fill for every face that looks at the lens (the plinth front, the reader, the badge), so they are not muddy |
| Dark strokes (env) | walnut shelf camera-left-front, dim doorway behind-right, photographer patch | Polished metal needs dark shapes as well as bright ones, or it reads as grey plastic |
| Desk (env lower hemisphere) | warm `[1.0, 0.86, 0.7]`, radiance 0.42, brighter in the pool under the window | The warm table bounce in the image-based light |
| Key | `SpotLight #EEF3FA × 4.4`, decay 0, from θ 166°, el 32°, 12 units from the content's centre (repositioned on every `setContent`) | The window. Its cone is sized from the content's motion bounds: the whole subject sits in the full beam, with a broad penumbra beyond it, so the desk and wall fall off naturally and tall Business gets a wider pool |
| Bounce | `DirectionalLight #F2D3AE × 0.32` from below | Warm light off the oak onto down-facing surfaces (the cake stand's underside, the rim of the lifted cloche, the ball's belly in flight) |
| Sky fill | `HemisphereLight #E8EEF6 / #C9A27A × 0.08` | A trace; the environment does the filling |
| Desk | `MeshStandardMaterial #CDB596`, roughness 0.5 × a seeded oak roughness map, seeded oak albedo (fine flat-sawn rings, pores, long tonal streaks) and a faint normal map; world-scaled UVs (one tile = 4 units) | Satin-lacquered pale oak: a soft sheen of the window on the wood, with grain that reads at 720² without turning into stripes |
| Wall | `#D4D5D3`, roughness 0.94; a plane at `wallZ` (honours `setWall`, so Birthday and Dinner push it back) | Light grey matte paint; the plain corner where it meets the desk is part of the "desk" read |
| Shadows | `vogel16`, 2048², radius 9, bias −0.0003, normal bias 0.012, near 4, far 26 | A soft window shadow with no noise; the scenes' contact shadows still ground the objects |
| Tone | `NeutralToneMapping`, exposure 1.05; `environmentIntensity` 1, `metalEnvIntensity` 1 | Rule of the pass; no compensations |
| Gobo | none | A window cookie made it look staged |
| Low tier | `setLowDetail(true)` drops the desk's normal and roughness maps (the colour stays) and frees them; the Stage drops the shadow map | Checked: Normal → Low → Normal is pixel-identical before and after, with no console errors (party, dinner) |

## Iterations (all five scenes each round, read on the sheet and on full-size stills)

1. **First light.** The structure worked straight away: the cloche showed the window, the dark shelf and the
   second window. Problems: the wood was orange with coarse wavy stripes (the rings were about 5 cm apart in
   object scale, which read as a cartoon), the wall was a dull mid grey, and the frame felt underexposed.
2. **Room brighter, wood finer and paler.** Ring frequency went up 2.5×, contrast down, colour changed to pale
   oak `#CDB596`. Wall `#DADAD6`, exposure 1.1, and the far wall behind the camera became a broad fill. Airy
   and photographic, but too evenly lit: the shadows nearly vanished.
3. **More key, less fill.** Key 2.6 → 4.4, back fill 0.85 → 0.6, wall env 0.46 → 0.40, exposure 1.05. Cast
   shadows read again (the cake, turntable and reader all throw a soft shadow to the right), but the wall went
   near-white and flat.
4. **A light pool, not a floodlight.** The key cone is now sized from the content's bounds, with a broad
   penumbra, and the wall is a cooler `#D4D5D3`. The wall now darkens toward the upper corners and away from
   the window, which was the missing "real room" cue. Mid-motion probes (accept and decline at 250 to 1300 ms
   for every scene) showed every authored pose lit and readable: the airborne ball over the hoop, the lifted
   cloche, the swinging badge in front of the reader, and the cake carried over the black bin with its
   interior visible.
5. **Muddy plinth front.** The turntable's front faces mirror the desk near the camera, which was dim and
   orange. The near-desk radiance went 0.30 → 0.42 and was desaturated.
6. **Fill 0.6 → 0.7** behind the camera. The party's 1st-percentile luminance rose from 18 to 22. The sheet
   held steady, so this is the final round.

Final numbers (720² stills; luminance; "clip" = all three channels ≥ 252):

| Scene | mean | clip | p1 | p99.5 |
|---|---|---|---|---|
| business | 166–173 | 0.00 % | 1 (the reader's black glass, by design) | 217 |
| party | 148 | 0.00 % | 22 | 223 |
| birthday | 191–205 | 0.00 % | 34 (cocoa) / 117 (vanilla) | 230–244 |
| sports | 192–194 | 0.00 % | 48 | 230–238 |
| dinner | 207–210 | 0.02 % (pinpoint glints on the cloche) | 81 | 247 |

The silver and the chrome are not blown, and the plinth and the reader are not crushed.

## Against the references

- **Master renders** (Models viewer, neutral grey studio): the cloche reads as the same polished silver. It
  has a large window highlight, dark strokes and a narrow bright band on the right; ours adds the warm desk
  in the lower half of the dome, as a real cloche on a wooden table would. The basketball's pebbled leather
  and the cake's piping keep their relief under the raking window light. The porcelain plate has a soft sheen
  with its gold rim lit. The turntable's plinth and lid read darker and warmer than in the master. That is the
  model's dark taupe plus a wood room around it, not a grade; the front face is no longer muddy (p1 22).
- **v1.1** (peach plaster, palm gobo): v1.1 was a stage; this is a place. The gobo and the peach are gone. The
  objects sit on a surface that has a material of its own, and the shadows fall where the window says they
  should.

## Known limits

- The stage token is warm greige (`#E0D4C3`), not peach or neutral white. If the owner wants the canvas surround
  to vanish into the warm-white page, this rig will always show a visible frame. That is part of the
  "photograph" look.
- The desk-to-wall corner is a hard line in every scene. A judge may prefer the wall pushed further back for
  Sports (the backboard is close to it).
- Wood grain is subtle at thumbnail size. That was a choice: stronger grain competed with the objects.
