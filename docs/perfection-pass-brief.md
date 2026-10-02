# The v1.5 perfection pass: brief

Surya, 2026-10-02, on the v1.4 showcase (`main` at `7e52b80`): twelve edits across the five scenes.
"For each of these, I won't settle for anything less than perfection. Feel free to do external
research or get experimental if it helps." Earlier decisions still stand: budgets are waived
(2026-10-01); Dinner is the cloche and the clean plate, no food; the blue cake is the default;
the look follows the masters under the `neutral-room` rig; 1 world unit = 20 cm.

## The twelve edits, verbatim, with the scene that owns each

| # | Edit (Surya's words) | Owner |
| --- | --- | --- |
| 1 | Make the record player continuously spin the disc after acceptance | Party |
| 2 | The animation for placing the disc on the player isn't completely smooth | Party |
| 3 | The birthday cake reads like plastic and seems too geometrically perfect — add texture and imperfection without overdoing it | Birthday: cake |
| 4 | Actual flame and smoke physics for blowing the candles; the flame must lead to and connect with the smoke harmoniously and realistically | Birthday: fire |
| 5 | Candles must actually interact with the cake as they would in real life as they're placed | Birthday: cake |
| 6 | Candles and cake should subtly melt | Birthday: cake (wax, frosting) with Birthday: fire (flame-driven timing) |
| 7 | The basketball hoop looks far too childish because of its weird proportions / height | Sports |
| 8 | Better bounce physics for the ball | Sports |
| 9 | Better net physics as the ball passes through the hoop | Sports |
| 10 | Steam under the cloche after unveiling it | Dinner |
| 11 | The trash bin needs the same visual quality (model + texture) as the other models and better-matched proportions/scaling | Bin (shared by Birthday and Dinner decline) |
| 12 | Make the check mark and decline signs for the key card look less cheap and tacky | Business |

## Facts every owner needs

**Engine.** three.js r186, Vite, pnpm 11, Node 24. Scenes are pure time-sampled sequences
(`src/scenes/<scene>/sequences.ts`: time → transforms, replay-safe, C¹ at beat boundaries) that
write to contract nodes (`*_authored` for the sequence, `*_secondary` for physics offsets). Rigs
in `models/<scene>.ts`, dimensions in `models/<scene>Contract.ts` (measured from the masters; the
choreography trusts them). Public API `src/core/types.ts`; scene interface `src/core/sequence.ts`.

**The continuous channel already exists.** `SceneInstance.simulate(dt)` is stepped by a fixed-step
`FixedStepper` in `src/core/controller.ts` (`frame()`, ~line 499) every frame while the loop runs,
and the loop keeps running while `director.update()` reports playing **or `scene.settling()` returns
true**. Business uses it for the lanyard sway. So perpetual motion (the spinning platter, flames,
steam, melt) is `simulate` + a `settling()` that stays true while the motion matters. Rules that
follow from the code:
- `simulate` is skipped under `prefers-reduced-motion` and `settle()` must snap everything to a
  rest pose (the director calls it on interruption, reduced motion and the settle deadline).
- Hidden tabs already stop the loop (`onVisibility`); `tests/browser/idle.spec.ts` asserts that the
  loop goes idle after a sequence ("stops after settle and stays stopped"). A scene that animates
  forever after acceptance must keep this test honest: either exempt it per scene with a reason, or
  (preferred) make the perpetual motion stop when the canvas is off-screen (IntersectionObserver in
  the controller) and keep the idle test on a scene that still idles. Record the decision.
- `quality.record()` keeps measuring while the loop runs; a perpetual loop must stay within the
  tier budget on the laptop (p95 < 16.7 ms was the v1.3 figure; don't regress it).

**Scale.** `models/worldScale.ts`: 1 unit = 20 cm. Per-scene root scale: Party 1, Birthday 1,
Sports 1.8 (`SPORTS_WORLD_SCALE`), Dinner 0.844, Business 0.381. Framing (`src/render/framing.ts`,
`fitPerspectiveToHero`): the hero fills 60 % of the height or 75 % of the width; motion paths stay
4 % inside. If you change an object's size, the scene's `heroPoints`/bounds must follow.

**Masters and recipes.** `models/masters/*.glb` (unmodified scans → CAD). `scripts/masters/recipes/<scene>.ts`
composes them into `assets/scenes/<scene>/<scene>.glb` with `pnpm models <scene>` (deterministic;
WebP textures; KHR_materials_variants for presets; `scripts/masters/README.md` is the guide;
`node --experimental-transform-types scripts/masters/inspect.ts <glb>` prints a model). Runtime
import in `models/imported.ts`. Code-authored parts (bin, wicks, flames, stand) are built in
`models/*.ts` and exported by the same script.

**Rig.** `neutral-room` (`src/render/rigs/neutral-room.ts`) is production; stage `#D5D2CD`; the
18° perspective lens, az 20°, el 15°. No compensating grades anywhere (v1.3); judge materials as
the masters' PBR under this rig, not by tinting.

**Verify by looking.** `pnpm dev --host 127.0.0.1 --port <yours>`; `?scene=<scene>` (`&rig=`,
`&camera=ortho` are local-only). `pnpm capture <scene>` writes stills per beat; `pnpm capture motion`
frame strips. Headless Chrome: Playwright on the installed Google Chrome (`--use-angle=metal`).
`pnpm typecheck`, `pnpm test` (282 unit), `pnpm test:browser` (87 browser). One Chrome per agent.

**Tests to keep green or deliberately update:** `tests/<scene>.test.ts`, `tests/browser/<scene>.spec.ts`,
`tests/browser/idle.spec.ts`, `tests/browser/framing.spec.ts`, `tests/browser/fullscreen.spec.ts`.

## Standards (the bar is "perfection")

- Physics is physics: real constants where they exist (gravity 9.81 m/s² at 1 unit = 20 cm →
  49.05 units/s²; a basketball's coefficient of restitution 0.76–0.84 on hardwood; a belt-drive
  turntable's 33⅓ rpm; a candle flame's ~1,400 K tip and the buoyant plume above it). Where a
  constant is chosen for read-ability (a clip is 1.5 s), say so in a comment with the real value.
- Motion is C¹ or better at every beat boundary and replay-safe (no accumulated state between
  sequences); perpetual motion lives in `simulate` and snaps to rest in `settle()`.
- Materials are the masters' PBR plus physically motivated detail (micro-normal, roughness
  variation, subsurface where the material warrants it). No tints "to taste".
- Nothing new is cartoonish: judge every frame next to a photo of the real thing (research it).
- Every claim is verified by rendered frames (stills per beat and at least one frame strip of the
  motion) **before** reporting; attach the paths. Then an adversarial inspector reads the frames
  against this brief and the twelve edits, and the owner fixes what they find.

## Per-owner notes

**Party (#1, #2).** `src/scenes/party/{poses,sequences,index}.ts`, `models/recordContract.ts`,
`models/recordPlayer.ts`. Today `SPIN` brakes to rest at `stopAt` and the accepted pose is still
("no idle spin", poses.ts). Required: after the stylus is down the platter runs at steady speed
forever (`simulate`), as a belt-drive: the authored spin-up is kept, the brake is removed, and the
canonical `accepted` pose (posters, reduced motion, interruption snaps) is "playing at the display
angle". Interruption (accept → decline) must brake the platter with a believable deceleration while
the arm returns and the lid closes; replaying host/accept must never accumulate angle. The
placement (`host`): find the actual roughness (sample the record's position/velocity/acceleration
at 240 Hz across every beat boundary: align → lower → contact → settle) and remove it; the settle
is a coin-on-a-table precession and must look like one, not a shiver. Spec revision: the Party
sub-spec's "still after acceptance" is superseded by Surya (record it in `docs/spec-revisions.md`).

**Birthday: cake (#3, #5, #6).** `scripts/masters/recipes/birthday.ts` (blue palette: body
`#B0CBFF`, piping `#FFFDFA`, rosette `#88B0F7`, pearl `#FFFFFF`; cocoa variant), `models/cake.ts`,
`models/cakeParts.ts`, `models/birthdayContract.ts`, `src/scenes/birthday/{poses,sequences,index}.ts`.
Texture: buttercream is not plastic. It has a soft micro-relief (palette-knife strokes, a trowel
spiral on the sides, tiny air pockets), roughness that varies 0.45–0.7 across the surface, very
slight sheen only on the piping ridges, and a touch of subsurface warmth. Imperfection: the tiers
are not perfect cylinders (±1–2 % radius drift, a slightly uneven top, piping beads that vary a
little in size and spacing, one or two softened rosettes) — restrained; it must still read as a
well-made cake. Candle interaction: as each candle is placed it presses into the frosting: a small
dimple with a raised collar of displaced buttercream around the socket, a little resistance (the
candle slows as it enters and the stand/cake takes a tiny load), and the candle ends up with the
believable slight lean of a hand-placed candle (within ~2°, consistent per candle, deterministic).
Melt: subtle — over the lit beat the wax nearest the flame softens (rounded tip, a bead forming,
a slow drip run that lengthens), the candle shortens by a hair, and the frosting ring right under
the flame glosses slightly. Coordinate the timing with the fire owner (flame height drives melt
rate); both are deterministic functions of time so they compose in `sequences.ts`.

**Birthday: fire (#4, #6-timing).** `src/render/materials.ts` (`flameMaterial` shader),
`models/birthday.ts` (`wispTexture`, `fx_wisp` quads), `src/scenes/birthday/sequences.ts` (the
blow beat). Required: a flame that behaves like a diffusion flame on a wick (teardrop with a blue
base, bright core, orange mantle, ~1.2–1.5 cm tall at this scale, buoyant flicker at 10–12 Hz with
small random amplitude), that responds to the blow as a real flame does (bends away from the
breath, stretches, necks, lifts off the wick and extinguishes from the base up), and that hands
over to smoke continuously: the extinguished flame's last hot gas *is* the first smoke — a thin
grey plume that rises in a buoyant, laminar-then-turbulent column, drifts with the breath, widens
and fades. One wisp quad with a fixed texture is not enough; research real candle smoke (plume
rise speed, the ~1 s laminar section, the curl) and build it as a small particle/ribbon system or a
procedural shader, whichever you can make look real at 60 fps for six candles. Make the un-blown
flames also live (flicker in `simulate`) so the lit cake is alive before the blow. Everything
deterministic in t per candle (seeded), snaps to rest in `settle()`.

**Sports (#7, #8, #9).** `models/sportsContract.ts`, `models/sports.ts`, `models/sportsParts.ts`,
`scripts/masters/recipes/sports.ts`, `src/scenes/sports/{sequences,index}.ts`. Proportions: measure
the hoop master's rim diameter, board size and the rim height above the floor against a real
regulation hoop (rim 45.7 cm inner diameter, 3.05 m high; board 1.83 × 1.07 m; rim-to-board gap
15 cm) and a real mini hoop (the scene's reference is a mini ball, `REFERENCE_CM.miniBall`); the
current rig scales the master by `HOOP_SCALE = RIM.innerRadius / 0.451` and sits the rim at
`RIM_LOCAL.y = 1.72` on a pole with `POLE.top = 2.3`. Decide one coherent set of proportions (ball
to rim diameter 0.76 as in regulation, rim height to ball diameter plausible for the product the
scene depicts) and re-frame. Bounce: replace the closed-form one-gravity flight with a proper
bouncing-ball model: restitution 0.76–0.84, tangential friction and spin coupling (a backspin ball
checks up), a squash that follows contact force (compression ~10 % at a 1.8 m drop, duration ~
10–15 ms scaled), rolling to rest with rolling resistance; the ball never sinks into or hovers off
the floor. Net: the net must hang under gravity with slack, be pushed open by the ball (strands
displaced radially where the ball is, with bulge below the ball and pinch above it), swing and snap
back with a damped whip after the ball exits, and the rim/board recoil should respond to the real
impulse. A small mass-spring net (rows × columns of strands, Verlet, a few substeps) is in budget
(budgets are waived; keep it under 1 ms/frame on the laptop).

**Dinner (#10).** `src/scenes/dinner/{sequences,index}.ts`, `models/dinner.ts`, `models/dinnerContract.ts`.
When the cloche lifts, hot steam trapped under it escapes: a soft, wide, slow curl that spills out
from under the rim as the dome tilts (first from the raised side), then a gentle rising column from
the plate for 1–2 s that thins out, plus a faint fog on the dome's inner surface that clears. It
must be convincing under the rig (research steam from a lifted cloche: it is bright against dark,
nearly invisible against light — so lean on motion, soft edges and the dome's silver reflections,
not on opacity). Particle/ribbon system or procedural shader, deterministic in t, snaps in
`settle()`; it also plays during the decline carry if the dish is still covered? No: steam shows
only on the reveal (accept); decline keeps the cloche on.

**Bin (#11).** `models/disposalBin.ts` → `assets/shared/disposal-bin.glb`, used by Birthday and
Dinner decline (`models/birthdayContract.ts` BIN_POS/IN_BIN; `models/dinnerContract.ts` DINNER_BIN_POS/DISH_IN_BIN).
Today: a code-authored lathe pedal bin (charcoal, radius 0.94, rim 1.3, butterfly flaps). Required:
master quality — the same material fidelity as the eight masters (brushed or powder-coated steel
with a real micro-normal and roughness map, correct edge highlights, a pedal and hinge with
believable hardware, a liner rim), either by building a proper textured model in the generator
pipeline (`suryanewa/scan-to-cad-rebuilds` conventions, PBR textures in WebP) or by rebuilding the
code-authored geometry with baked PBR textures. Proportions: a real pedal bin that a 25 cm cake or a
27 cm plate + cloche drops into is ~30–35 cm mouth × 45–65 cm tall; at 1 unit = 20 cm that's 1.5–1.75
mouth diameter and 2.25–3.25 tall. Today the bin is 1.88 wide × 1.3 tall at the rim — short and
wide. Choose real proportions, confirm both the cake (with candles) and the covered dish clear the
rim before the flaps close, and re-check both scenes' framing (Dinner's hero is already the
smallest because the bin limits the frame — don't make that worse; consider moving the bin closer
or framing it tighter and record what you chose).

**Business (#12).** `models/business.ts`, `models/businessPrint.ts`, `src/scenes/business/*`. The
reader's status (LED + glow + a status tile with check/minus glyphs) reads cheap. Required: a
status that looks like a well-designed access reader's: a crisp, light-guided indicator (an edge-
lit ring or bar, or a dot-matrix/segment behind smoked acrylic) with a real emissive bloom falloff,
a correctly weighted check and minus drawn as the product's typography (rounded-stroke, optical
weight matched), proper animation (fade/pulse timing as real readers do, 200–300 ms), and colours
that sit in the palette (green `#3BE08A` is the Party status; choose the reader's accept/decline
pair deliberately and document). Research real readers (HID Signo, Salto, Apple Wallet readers).

## Workflow

Each owner works in its own worktree of this repo (`git worktree add <path> -b v1.5/<owner> main`
from `~/Developer/projects/livetime-invitations`), on its own dev-server port (5501 Party, 5502
Birthday-cake, 5503 Birthday-fire, 5504 Sports, 5505 Dinner, 5506 Bin, 5507 Business), builds →
renders → adversarial inspection → fix → verify, then reports with frame paths and a summary of
decisions for `docs/scenes/<scene>-v1.5.md`. Integration: merge in the order Bin → Party → Sports →
Business → Dinner → Birthday-cake → Birthday-fire (the two Birthday branches touch the same files;
the fire owner rebases on the cake owner's result), regenerate posters/thumbnails/backdrops, run
the full test suites, judge all five scenes against the twelve edits, polish, commit, push.
