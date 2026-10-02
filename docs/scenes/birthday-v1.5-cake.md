# Birthday v1.5: the cake (edits #3, #5, #6)

Owner, 2026-10-02: *"The birthday cake reads like plastic and seems too geometrically perfect — add texture and
imperfection without overdoing it."* (#3) *"Candles must actually interact with the cake as they would in real life as
they're placed."* (#5) *"Candles and cake should subtly melt."* (#6, shared with the fire owner, who owns the flames.)

Files: `scripts/masters/recipes/birthdayFinish.ts` (the hand finish, run as the master's `transform`),
`scripts/masters/recipes/birthday.ts`, `models/cakeShaders.ts` (runtime shading), `models/birthday.ts` (rig),
`src/scenes/birthday/{melt,poses,sequences,index}.ts`, `models/birthdayContract.ts` (re-measured), tests in
`tests/birthday.test.ts` and `tests/masters.test.ts`. Pipeline: `MasterRecipe.transform` (scripts/masters/types.ts,
compose.ts step 2b, README).

## Reference notes

Photos looked at (Wikimedia Commons) and what they show, against which the frames were judged:

1. *Piping buttercream onto cake* (CakesMadeEasy, CC BY 2.5). A smooth-scraped buttercream side is satin-matte, not glossy:
   one broad soft highlight, faint horizontal scraper lines here and there (not an even brushed grain), a few shallow
   dents. Piped lines have slightly glossier crests and uneven thickness; the bead border's beads differ by ≈ 10–15 %
   in size and sit at uneven spacing. The top edge is a soft rounded lip; the top carries faint spatula smears.
2. *Birthday cake close-up 2016*. Hand-placed candles lean every which way (a few degrees) and stand at slightly
   different heights; their flames stay vertical; the frosting round each foot is pushed down and ridged; the tops of
   candles that have burnt a while are cupped, with liquid wax round the wick and runs down one side.
3. *3rd birthday cake* (Unsplash). Within seconds of lighting, a glossy molten pool forms round the wick.
4. *Italy – birthday cake with candles* (whipped cream and meringue). Soft piped ridges with satin crests and soft deep
   grooves; shadowed cream is warm and soft-edged, not grey (light travels inside it).
5. Text sources: birthday candles are paraffin; a twisted 6 cm candle burns 10–14 min (≈ 0.07 mm/s); a drip forms where
   the pool overflows the rim, on the low side when the candle leans; buttercream is a soft plastic solid that yields
   and does not spring back; pockets come from whipped air; scrapers leave lines where they are nicked.

## Decisions

**Material (#3).** The frosting's "plastic" was the master's clearcoat (0.25 at 0.35) over a single roughness: removed
from body, piping and rosettes (the sugar pearls keep theirs: dragées are glossy candy). The body gets generated maps on
a new UV atlas (sides v 0.02–0.48, ≈ 20 cm a UV unit, three repeats round each tier; tops planar in v 0.52–0.98):
relief (normal, lossless 2048²: a soft 1–4 cm waviness of ±0.25 mm, discrete scraper lines in ≈ 1 in 3 slots of
2.4 mm, sparse air pockets 0.4–1.4 mm, and on the tops 56 offset-spatula arcs with 80 µm lifted edges), roughness
0.45–0.70 (1024², mean 0.585; highs a touch glossier than lows, pockets matt; lossless so the range holds) and a faint
albedo finish (1024², sRGB mean ≈ 0.99, lows and pockets ≤ 3 % deeper). All three maps are shared by vanilla and cocoa
(GLB 4.3 → 7.7 MiB, 32 MiB of textures as RGBA8 + mips; budgets are waived). Piping and
rosettes: roughness 0.52, a very slight sheen (0.1 at 0.45), and a per-vertex convexity `_RIDGE` with which the runtime
makes crests up to 12 % glossier and grooves 12 % matter and keeps the sheen on the crests. Subsurface: a wrapped
diffuse on the key light only (body wrap 0.35 tinted by its own deepened colour × 0.7; piping 0.4 × a butter cream),
judged as an A/B under `neutral-room` (frames `wip4/hero-sss.png` vs `hero-nosss.png`): it softens and slightly
saturates the shadow side, nothing more.

**Imperfection (#3).** Deterministic, in the GLB (the finish field moves every frosting part, so what sits on a
surface rides it): tiers drift ±1.1 % from round at mid-height (2θ, 3θ, 4θ terms that lean with height, plus a 0.2 %
barrel; faded out before the candle annulus so the sockets stay put), each top is uneven by ≈ ±0.7 mm (a tilt plus two
soft bumps; at the six sockets −0.31…+0.22 mm, so the candles stand at slightly different depths), the side piping
carries a hand wobble (±0.8 mm along, ±0.55 mm up and down at ≈ 2 cm), and 273 beads, shells, dots, pearls and
rosettes vary in size (shells ±6 %, dots ±9 %, pearls ±5 %, rosettes ±4–5 % and up to ±10–12° in twist) about the point
they touch the cake. Two rosettes are softened (Taubin-relaxed ridges, 8 % slump, a slight droop; their pearls ride
down with them). The coarse twisted ropes are relaxed a little. Re-measured: widest radius 0.63424 scan (was 0.628963),
crown 0.64334 (was 0.639565); `CAKE_RADIUS` follows; every bin clearance test still passes.

**Candles into the cake (#5).** Each candle is brought down from rest (cubic Hermite, 0.3 s), meets the surface at
4.4 cm/s, then is pushed 3.7 mm in over 0.128 s with v = −v₀(1 − u²): its deceleration rises with depth (the
buttercream's resistance grows with the length of candle in contact) and it stops at the seat: no spring, no rebound
(frosting is plastic). This supersedes the v1.2 "presses ≈ 5 mm and settles on a spring" (spec revision #23). As it goes
in, the plug it pushes aside rises as a collar round the socket (runtime displacement of the dense top annulus: a
0.44 mm dimple against the candle, a ≈ 0.6 mm, ≈ 1 mm wide collar 1.4 mm out, lumpy (3, 5, 9, 14 lobes, fixed per
candle) and fuller on the side it leans to). Each candle takes its own seeded lean (0.73–1.62°, six directions) as it
seats; flames are counter-rotated so they stay vertical. The cake takes the pushes as a 14 Hz, ζ 0.35 oscillator driven
by them: peak dip 0.53 mm, tilt 0.11°, rung down to exactly 0 by 1.2 s.

**Melt (#6).** `src/scenes/birthday/melt.ts`: pure functions of flame-weighted lit time. Real paraffin, compressed
7.5× (`MELT_TIME_SCALE`): rim rounds (τ 10 s real), pool across the top (1.5–12 s), bead on the low side (10 s → run),
a run leaving the rim at 22–38 s real (the candles that lean more first; 2.9–5.1 s on screen) and lengthening to
9.5–16 mm (63 % in 14 s real), the top burning down by ≤ 0.8 mm (0.07 mm/s real, capped), the frosting round the socket
glossing (roughness −35 % at most) and the collar slumping (τ 45 s). Capped at 20 s on screen (150 s real): never
grotesque. Lit time comes from the clip (∫ flameScale, so a flame drives the melt in proportion to its size and the
melt freezes after the blow) plus the live seconds at rest at guest-ready (`BirthdayScene.simulate`, reset by
`settle()`; reduced motion never advances it, so canonical poses stay exact). Canonical guest-ready is nearly fresh
(round 0.26, pool 0.06); after a 10 s look, four runs show on the camera's side.

## Hand-off to the fire owner (`v1.5/birthday-fire`)

- `src/scenes/birthday/melt.ts`: `meltState(candle, tLit, out?)`, `candleShortening(candle, tLit)` (scene units; lower
  the flame base and the wick by it: `applyMeltTo` in `index.ts` already does both), `meltAmount(candle, tLit)`,
  `MELT_TIME_SCALE`, `MELT_CAP`.
- `src/scenes/birthday/sequences.ts`: `flameScaleOf(sequence, i, t)` is the one place the flame-size curves live; lit
  time (`litTime(sequence, i, t)`, `frame.litTime[i]`, `GUEST_READY_LIT`/`ACCEPTED_LIT`/`DECLINED_LIT`) integrates it.
  If the blow changes how a flame dies, change `flameScaleOf('accept', …)` and the melt follows.
- `src/scenes/birthday/index.ts`: `simulate(dt)` advances `liveLit` at guest-ready; `settling()` is true until
  `MELT_CAP`; `settle()` zeroes it. Live flames merge into these three methods (OR the settling conditions). The flame
  node is counter-rotated against the candle's lean (`c.flame.quaternion = lean⁻¹ · breath`).

## Evidence

`evidence/v1.5/birthday-cake/` (worktree, not committed): `baseline/` (v1.4 master), `final/` and `final-cocoa/`
(close-ups and heroes), `sheet-placement.png`, `sheet-melt.png`, `wip4/hero-sss.png` vs `hero-nosss.png`, and the
production capture in `outputs/birthday/` (stills per pose, frame strips, mp4s).
