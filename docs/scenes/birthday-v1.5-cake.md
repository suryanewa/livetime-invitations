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

The first pass (commits `af60354`, `0fee10c`) was judged at 6/10 (cake) and 6.5/10 (melt) by a still-frame judge and 4/10
(placement) by a motion judge; the polish round answers both. Numbers below are the polish round's.

**Material (#3).** The frosting's "plastic" was the master's clearcoat (0.25 at 0.35) over a single roughness: removed
from body, piping and rosettes (the sugar pearls keep theirs: dragées are glossy candy). The body gets generated maps on
a new UV atlas (sides v 0.02–0.48, ≈ 20 cm a UV unit, three repeats round each tier; tops planar in v 0.52–0.98):

- relief (normal, lossless 2048²): a soft 1–4 cm waviness of ±0.25 mm, discrete scraper lines in ≈ 1 in 3 slots of
  2.4 mm, and on the tops 26 broad palette-knife swooshes per tier (arcs 2.5–5 cm wide, a 0.1–0.25 mm scoop with a soft
  3–5 mm lip on the outer side, laid over one another). Polish: these replace 56 narrow spatula arcs whose 80 µm
  lifted edges read as cracks;
- air pockets, sparse and irregular: a jittered grid (7 % of 6 mm cells on the sides, 8 % of 9 mm cells on the tops),
  sizes on a steep power law (mostly 0.3 mm pinholes, now and then a 2 mm bubble), elongated and lobed, half of them
  open. Polish: the first pass's pockets were evenly spaced and all alike;
- roughness 0.40–0.66 (1024², mean 0.517; lossless so the range holds): satin on the scraped highs (≈ 0.42, a broad
  visible highlight), matte in the lows and pockets (≈ 0.62). The first pass was 0.45–0.70 (mean 0.585) and read
  flat;
- a faint albedo finish (1024², sRGB mean ≈ 0.99; lows and pockets ≤ 3 % deeper).

All three maps are shared by vanilla and cocoa (GLB 12.3 MiB raw, 7.0 MiB gzip; budgets are waived). Piping and
rosettes: roughness from a per-vertex convexity `_RIDGE`, 0.62 in the grooves to 0.36 on the crests (polish: was
±12 % about 0.52, invisible); a very slight sheen (0.1 at 0.45) kept on the crests; a fine grain (≈ 0.6 mm, ±8 µm,
faded where a pixel covers it) breaks the moulded read of shells and rosettes. Subsurface: a wrapped diffuse on the
key light only (body wrap 0.35 tinted by its own deepened colour × 0.7; piping 0.4 × a butter cream). Contact: the
bead border and the frosting's foot lose most of the room's light within ≈ 3 mm of the plate (floor 0.45), and the
plate darkens under the border (polish: the cake read as set onto the plate).

**Imperfection (#3).** Deterministic, in the GLB (the finish field moves every frosting part, so what sits on a
surface rides it):

- tiers drift ±1.4 % from round at mid-height (2θ, 3θ, 4θ terms that lean with height, plus a 0.2 % barrel; faded
  out before the candle annulus so the sockets stay put). Polish: the top tier sits 2.4 mm off the lower tier's
  centre (stacked by hand; it reads on the silhouette), the lower tier 0.5 mm off the stand's;
- the bays are uneven (polish, judged at laptop size where 1 mm ≈ 1.45 px): each bay's decorations shifted ±2.3 mm
  along the side (neighbours differ by up to ±4 mm), the columns leaning ±2.5°, the swags dropping ±4 mm;
- each top is uneven by ≈ ±0.7 mm (a tilt plus two soft bumps; at the six sockets −0.31…+0.22 mm, so the candles
  stand at slightly different depths); the side piping carries a hand wobble (±0.8 mm along, ±0.55 mm up and down);
- 273 shells, dots, pearls and rosettes vary in size about the point they touch the cake (polish: shells ±10 %,
  rosettes ±9–10 % and ±15° in twist, dots ±12 %, pearls ±7 %; the first pass's ±4–6 % did not read). Two rosettes
  are softened (Taubin-relaxed ridges, 8 % slump, a slight droop);
- geometry (polish): the swag ropes are rebuilt as closed 16-sided tubes (40 rings a strand, Catmull-Rom), their
  tails flattened and tucked under the side; dots, pearls and rosette centres refitted as 24 × 16 spheres; the open
  edges of columns, tassels, shells and rosettes tucked 1.3 mm into the frosting (never below the cake's underside);
- the cake's reach is eased (tanh, over its outer 3.5 mm) to clear the bin's mouth by 8 mm: one large bottom shell on
  a bulge of the side would otherwise reach 0.5 mm past it.

Re-measured: widest radius 0.635837 scan (13.99 cm; the master's 0.628963), crown 0.647391 (the master's 0.639565);
`CAKE_RADIUS` follows; every bin clearance test passes.

**Candles into the cake (#5).** `src/scenes/birthday/placement.ts` (polish: the first pass dropped each candle in
0.3 s and pushed it 3.7 mm in 0.128 s, which read as a stamp). A hand places six candles left to right:

- seeded starts (gaps 60–115 ms: 0.16–0.62 s) and approaches (0.60–0.74 s each);
- each is lowered 6 cm from rest on a minimum-jerk (C²) bell: peak 12.8 cm/s, acceleration ≤ 0.57 m/s², slowed to a
  steady 5 cm/s with zero acceleration as its base meets the buttercream;
- it is then pushed 10 mm in (`CANDLE.insert`, ≈ 0.43 s): the skin yields first (speed dips 35 % over the first
  18 %), then the drag grows with the length of candle in it (v ∝ 1 − u²) until the hand stops at the seat. No
  rebound: buttercream is viscoplastic. Seated at 1.22–1.77 s; the lighter starts 0.12 s after the last;
- the plug it pushes aside rises as a collar round the socket (runtime displacement of the dense top annulus):
  ≈ 1.6 mm high, ≈ 2.2 mm out, ≈ 1.8 mm wide, ≈ 210 mm³ (40 % of the 500 mm³ displaced, the rest compressed into
  the crumb), lumpy (3, 5, 9, 14 lobes per candle) and fuller on the side it leans to; a 0.6 mm dimple against the
  candle; contact occlusion at the foot (1.4 mm reach);
- each candle takes its own seeded lean (0.73–1.62°) as it seats; flames are counter-rotated so they stay vertical;
- the cake takes the pushes as a 9 Hz, ζ 0.22 oscillator: the top tier dips 1.9 mm at the peak, tilts ≤ 0.17°, and
  rings down (one 0.19 mm overshoot) to exactly 0 before the beat ends.

The host beat is 2.465 s (was 1.3 s): the time the slower hand needs. This supersedes the v1.2 "presses ≈ 5 mm and
settles on a spring" (spec revision #23) and the first pass's timing.

**Melt (#6).** `src/scenes/birthday/melt.ts`: pure functions of flame-weighted lit time. Real paraffin, compressed
7.5× (`MELT_TIME_SCALE`): rim rounds (τ 10 s real), pool across the top (1.5–12 s), bead on the low side (10 s → run),
a run leaving the rim at 22–38 s real (2.9–5.1 s on screen) and lengthening to 9.5–16 mm, the top burning down by
≤ 0.8 mm. Capped at 20 s on screen (150 s real): never grotesque. Polish:

- molten wax is its own surfaces (`models/cakeShaders.ts`, `runPatch`, `poolPatch`; first pass: a drip pushed out of
  the candle surface stretched the stripes, creased under the bead and notched the rim): a rivulet of body wax
  (≈ 1.8 mm wide, 0.7 mm proud) leaves the pool over the lip on the low side, runs down the twist's groove and ends
  in a 2.9 mm bead (roughness 0.16, a little clearcoat, translucent); the pool is a glossy disc (roughness 0.05,
  clearcoat 1) with a meniscus that domes as it overfills. The rim is no longer notched;
- after the blow-out the wax sets: liquid → opaque satin over 22 s real (`solidify`, `SET_AFTER` ≈ 2.9 s on screen),
  on the live clock where the guest watched the blow-out (the director's hand-over, as for the smoke); a canonical
  `accepted` reached any other way is still;
- the buttercream round a burning candle glosses visibly: within ≈ 5 mm, roughness halved, 7 % darker, slumped
  0.3 mm (the first pass's 2.4 mm, −35 % read as nothing);
- a change of mind keeps the melt: `interruptCut()` marks the interruption and the following `settle()` keeps the
  live lit seconds instead of resetting them (no pop-back). Load, replay and reduced motion still return to the
  canonical pose's melt.

Lit time comes from the clip (∫ flameScale, so a flame drives the melt in proportion to its size and the melt freezes
after the blow) plus the live seconds at rest at guest-ready (`BirthdayScene.simulate`; reduced motion never
advances it, so canonical poses stay exact).

## Hand-off to the fire owner (`v1.5/birthday-fire`)

- `src/scenes/birthday/melt.ts`: `meltState(candle, tLit, out?)`, `candleShortening(candle, tLit)` (scene units; lower
  the flame base and the wick by it: `applyMeltTo` in `index.ts` already does both), `meltAmount(candle, tLit)`,
  `solidify(tCool)`, `SET_AFTER`, `MELT_TIME_SCALE`, `MELT_CAP`.
- `src/scenes/birthday/placement.ts`: `LIGHT_FROM` (0.12 s after the last candle seats); `fire.ts` keys
  `IGNITE_START[i] = LIGHT_FROM + 0.02·i` on it (the only edit to `fire.ts`), and `DURATIONS.host` is
  `IGNITE_START[5] + IGNITE + 0.14` (≈ 2.465 s). `tests/birthdayFire.test.ts` reads `IGNITE_START` and
  `DURATIONS.host` instead of fixed times.
- `src/scenes/birthday/sequences.ts`: `flameScaleOf(sequence, i, t)` is the one place the flame-size curves live; lit
  time (`litTime`, `frame.litTime[i]`, `GUEST_READY_LIT`/`ACCEPTED_LIT`/`DECLINED_LIT`) integrates it; `frame.cool[i]`
  (`coolTime`, `OUT_ACCEPT`/`OUT_DECLINE`) is the seconds since each flame went out.
- `src/scenes/birthday/index.ts`: `simulate(dt)` advances `liveLit` at guest-ready and `liveCool` after a watched
  blow-out; `settling()` ORs both; `interruptCut()` sets `interrupting`, so the next `settle()` keeps `liveLit`.
  If the fire branch carries the live lit time its own way, keep one of the two and make `applyMeltTo` read it.

## Evidence

`evidence/v1.5/birthday-cake/` (worktree, not committed): `baseline/` (v1.4 master), `final/` and `final-cocoa/`
(first pass), `polish/` (this round: laptop and phone crops, macros against the judge's views, placement and melt
strips), and the production capture in `outputs/birthday/` (stills per pose, frames, mp4s).
