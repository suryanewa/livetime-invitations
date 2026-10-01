# Rig `product-studio`: three softboxes, white-to-light-grey cyc, black flags

File: `src/render/rigs/product-studio.ts`. Compare at `http://127.0.0.1:5199/?scene=dinner&rig=product-studio`.
Sheet: `outputs/rigs/product-studio/sheet.png` (`pnpm capture rigs <baseUrl> product-studio`).

**Measured stage colour: `#ECE9E4`** (business `#ECEAE4`, party `#EBE9E3`, birthday `#EDEAE5`, sports `#EBE8E3`,
dinner `#ECE9E4`). This is a light warm grey, one step under the page's `#FBFAF7`, so the stage reads as a set
sitting on the white card, not as a hole in it.

## The idea

This is a catalogue set. The objects stand on a seamless light-grey paper cyc, lit by one large softbox from the
upper left in front of the set. A tall fill panel sits camera right, a thin rim strip is high behind, and black
flags give the polished surfaces something dark to reflect. The environment is built to match. The half of the
room behind the set and everything below the horizon is the lit cyc. The camera side and the ceiling are a dark
studio, and the softboxes and flags hang in it. Rough surfaces get their light from the cyc and the softboxes.
A polished surface facing the camera sees the studio, so chrome gets the hard light shapes and dark strokes it
needs to read as chrome.

| Part | Value | Why |
| --- | --- | --- |
| Tone mapping / exposure | `NeutralToneMapping`, 1.0 | The product pipeline. Exposure stays at 1 and the brightness is set by the lights. Clipping measured on all 18 stills: no more than 0.05 % of pixels at ≥ 250 (only the specular highlights on the cloche, badge clip and reader bezel), and no crushed blacks outside the cloche's flag reflection (0.1 %). |
| Environment | procedural studio, PMREM σ 0.012, `environmentIntensity` 1, `metalEnvIntensity` 1 | The light shapes stay crisp, so the cloche, tonearm, badge clip, spindle and reader bezel show real softbox edges. |
| Shell | studio 0.15, cyc wall 0.62 (greys toward its top), cyc floor 0.56 (pooled under the key), ceiling 0.08 | Rough surfaces are lit by a bright floor, which gives the white-to-grey cyc gradient. Chrome sees a mid-dark studio, not a black void. |
| Key softbox (env) | 6.4 × 4.6 at (−6.2, 6.4, 6.2), radiance 4.2, superellipse falloff to 55 % at the edge | The broad highlight on the dome's shoulder, the turntable plinth and the reader's brushed side. |
| Fill panel (env) | 3.2 × 6.4 camera right, 1.5, slightly cool | A tall highlight on the right side of round things, and it lifts the shadow side. |
| Rim strip (env) | 11 × 0.9 high behind, 3.2 | A crisp line on the tops of the plate rim, cake tiers, record and hoop. |
| Top strip (env) | 7.5 × 1.4 overhead, 1.6 | The crown highlight on the dome and the handle ring. |
| Bounce card (env) | 4.2 × 2.2 low, camera left, 0.9 | A bright lower band on the dome and bodies, so the base of the cloche is not a black hole. |
| Front scrim (env) | 7.5 × 3.6 high in front, 0.7, fades to 15 % at the edges | A soft gradient on the reader's black glass and the vinyl. Without it both read as flat black. |
| Black flags (env) | left (behind the key), right-behind, and right-front on the camera side. Gradient flags: 0.004 at the core, 0.05–0.06 at the edges | Each one is a dark stroke on chrome and silver. The gradient keeps the strokes from cutting out like holes. |
| Key light | `SpotLight` `#FFFCF8` × 4.6, decay 0, at (−4.4, 8.4, 6.0), angle 0.72, penumbra 1, aimed at `ctx.target` | Casts the real-time shadow. The full penumbra gives the cyc a gentle falloff (white under the objects, greying toward the top corners) instead of a cone edge. It sits high enough that the shadows stay short on the wall. |
| Rim / fill lights | `DirectionalLight` white × 0.9 from behind-above, `#F2F5FF` × 0.45 from camera right | The direct parts of the rim and fill panels. |
| Shadow | `vogel16`, 2048², radius 8, bias −0.0004, normal bias 0.014, near 4, far 22 | Soft and noise-free. See the tuning notes. |
| Backdrop | `createSweepBackdrop`, painted (no plaster), `#B9B9B7`, roughness 0.92 | Light-grey paper. Under the key it renders as `#ECE9E4`. Honours `setWall` (Birthday, Dinner, Sports). |
| Gobo | none | A catalogue set has no gobo. |

## Iteration (seven capture rounds on all five scenes, plus mid-motion and Low-tier stills)

1. **First pass:** white paper `#F1F1EF` and a warm key `#FFF6EC`. The stage measured `#F8F2E9`: blown-out and
   peach. Pre-tonemap, the key alone put about 1.0 on the paper, so Neutral compressed it to near-white and the
   warm key showed through. The chrome read well, but the front flag was too big and left a large black slab
   across the dome.
2. **Neutral key `#FFFAF4`, paper `#DEDEDB`, studio shell lifted to 0.09, front flag halved, bounce card added:**
   the cloche had fewer black areas. The stage was still `#F6F2EB`. The paper change hardly moved it because the
   values were deep in the tone curve's shoulder.
3. **Diagnosis:** with the key turned off the stage measured `#91908D`, so the key carries about 70 % of the
   backdrop. The paper went to `#C9C9C6` (stage `#F1EFE8`) and then `#B9B9B7` (stage `#EAE7E2`), and the key
   went to `#FFFCF8`. The cyc now reads as light-grey paper with a white floor under the objects. The objects
   keep their exposure, because only the paper changed.
4. **Shadows:** the cone had been widened to 0.8 to even out the far wall, and that cost shadow-map texels. The
   net's shadow broke into a dithered mat. The fix was a 2048² map and a tighter 0.66 cone with penumbra 1. The
   studio shell went to 0.15 and the left flag got smaller, so the dome is silver with black strokes rather than
   mostly black.
5. **Softer, shorter shadows:** key raised to y 8.4, radius 11. This was softer, but the vogel 16-tap pattern
   showed as concentric rings in the ball's shadow, and the tighter cone (0.62) greyed the Sports and Business
   corners.
6. **Front scrim added (black glass and vinyl now show a gradient), cone 0.72:** the corners were even again.
7. **Shadow radius 8:** the rings are gone and the edges stay soft. The final values are the ones in the table above.

## Checks

- **Every authored pose** (`outputs/rigs/product-studio-motion/`, 200–1400 ms into accept and decline): the
  airborne ball over the rim stays lit against the grey wall. The lifted cloche keeps its reflections at every
  height. The swinging card stays readable over the reader, and the reader's check and cross are clear. The cake
  carried over the dark bin keeps its form, and the bin reads as matte black with its lit flaps. The cloche
  dropped into the bin is visible inside it.
- **Low tier** (`setQualityTier('low')`): the Stage drops the 2048² shadow map, and the scenes' contact shadows
  keep everything grounded. `setLowDetail` passes through to the painted sweep, which has no relief to drop
  (a no-op). Nothing else in this rig is expensive.
- **Determinism:** the environment is vertex colours on fixed geometry, with no random numbers, textures or
  downloads.
- `pnpm typecheck` and `pnpm test` pass (257 tests). `tests/rigs.test.ts` checks this rig's environment 1,
  metal 1, shadows declared, and stage colour within 2 levels of `stagecolor.json`.

## Against the masters and v1.1

- **Compared with v1.1:** the metals read as their materials. The v1.1 cloche is a flat grey blob, while here it
  is polished silver with softbox panes, a crown highlight and flag strokes. The tonearm, spindle and badge clip
  are chrome. The reader's brushed side shows a soft vertical sheen. The vinyl shows its grooves in the scrim
  gradient. The peach cast and the palm dapple are gone, so the cream ball, the vanilla cake and the porcelain
  plate are their own colours.
- **Compared with the Models viewer** (`master-renders/*/B-hero.png`): the viewer's room is a lived-in interior
  with a window and lamp on a mid-grey stage. This rig is a deliberate catalogue alternative: brighter and
  crisper, with harder black strokes on the chrome (the cloche is more contrasty than the master's) and a
  lighter surround. Where the master gives the dome a soft room reflection, this rig gives it studio panes.
- **Open questions for the judges:** the net's shadow on the Sports floor is a fine dappled pattern (the real
  cords at shadow-map resolution). The backboard's shadow edge has a faint double step from the 16-tap kernel.
  Neither shows at the sheet scale.
