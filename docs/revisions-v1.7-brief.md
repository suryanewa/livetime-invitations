# The v1.7 revisions: brief

Surya, 2026-10-06, on `main` at `64b4108` (v1.6, the Hollywood pass; `docs/hollywood-pass-brief.md`,
`docs/style-reference.md` v1.6), verbatim:

> Some comments on the interactions for revisions:
>
> The steam under the cloche should reveal an invitation card with the event name, something like "You're invited",
> and the invitee name. The card should be flat on the plate and then the camera should move so that we're facing the
> card head-on and it's a close-up.
>
> For the basketball decline animation, I think it should bounce off the backboard and not go in in a more dramatic
> way. I also think it would look better bigger by cutting the bottom of the board and making it more focused on the
> backboard and ball. I'm also completely dissatisfied with the net physics; it just vibrates really weirdly and
> unrealistically.

Three revisions, then:

1. **Dinner: the card under the cloche.** The reveal uncovers an invitation card lying flat on the plate — the event
   name, a line such as "You're invited", the invitee's name — and once the steam has cleared the camera moves to face
   the card head-on in close-up. (This changes Surya's v1.2 decision "cloche + clean plate, no food": the plate now
   carries the card.)
2. **Sports: the decline as a dramatic backboard miss, framed tighter.** The ball strikes the backboard and does not go
   in, more dramatically than today; the framing is bigger, cutting the bottom of the board (the pole and base) so the
   shot is about the backboard and the ball.
3. **Sports: the net physics rebuilt.** The net "just vibrates really weirdly and unrealistically"; it must move like a
   nylon net — swing, absorb, settle.

Everything else stands (the v1.5 twelve edits, the v1.6 rebuilds, the rig, the scale, the pull-back, the steam at
7.5 / 7.5 with its approved limits). Budgets stay waived. The v1.6 "Decisions for Surya" were all approved on
2026-10-05 (`docs/RESUME.md`).

Shared rules that still hold: pure functions of time in `sequences.ts`, live motion in `simulate`/`settling`/
`settle()`, reduced motion shows good stills, posters are stills of the live scene (`tests/browser/posters.spec.ts`
diffs them), the `neutral-room` rig and the 18° lens are the production look, 60 fps p95 ≤ 16.8 ms at both sizes
(measure), deterministic exports, and every claim proven by rendered frames before it is reported. Owners work in
their own worktrees (`.claude/worktrees/v17-*`, branches `v1.7/<owner>`, ports 5701–5703), commit WIP often, keep
every tool call under ~3 minutes, never await their own background runs. Integration on `v1.7/integration` (worktree
`.claude/worktrees/v16-int`, port 5508), judges on the integrated build through the real controller, polish rounds
from the judges' ranked tells, then `main`.

## Decisions taken to build (the orchestrator, 2026-10-06; each a draft spec-revision row pending Surya)

- **The card (#41):** a flat 7 × 10 cm landscape heavyweight cream card (#F2ECE0), 0.6 mm, centred in the plate's flat
  well, rotated so its print reads upright from the showcase camera; built at runtime (no GLB change), a depth occluder
  with a contact shadow; inside the steam's 5.9 mm clear layer, so the steam field is untouched (it is closed). The print:
  "You're invited" (Sage Graphite caption), the event title (ink, display weight), the invitee's name (ink) on a canvas
  texture, with **one bundled OFL typeface (Inter)** so posters are deterministic — the one printed-text exception to
  "system sans only, HTML authoritative". The data: `SceneConfig.dinner.card { eyebrow, title, name }`, sanitised; the
  showcase passes the event title and a sample invitee name in guest mode, no name line in host mode. The four shared
  Dinner posters stay four; the accepted poster becomes the close-up with the showcase's sample print (per-event posters
  would need a runtime still).
- **The close-up (#42):** a second camera channel `close` (0…1), a pure function of the accept's time: 0 everywhere but
  the accept; from τ 2.8 s (the cloud gone) a C1 ease to 1 at 4.4 s (the veil's last wisps crossing the card), then held —
  the accepted canonical pose *is* the close-up (reduced motion, a saved accept and the poster land on it). The view:
  elevation ≈ 80° (a hint of the plate's rim and the cloche's edge as context), azimuth kept at 20° so the light holds,
  the same 18° lens, the card ≈ 65 % of the frame width, the camera never inside the steam's box; on a change of mind
  the close channel comes home C1 before the decline's pull. An exception to the one-angle rule, like #39's dolly.
  `onVisualComplete('accept')` stays at 1.5 s.
- **The Sports decline and frame (#43):** the ball banks hard off the glass well above the rim, rattles the ring's
  front/top, and caroms forward and wide, never through the rim, landing clear of the base; the strike kicks the hoop's
  springs (a `HoopSprings.kick` API shared with the net owner, impulses scaled by a sourced mini-ball mass). The frame:
  the hero is **board + rim + net + ball** (the stand excluded from the hero and the base's footprint from the frame
  points), at the largest fill that keeps every path inside PATH_CLEARANCE at 3:4, 1:1 and 3:2 (≈ 0.85–0.9), so the stand
  may be cropped by the frame's bottom and right edges — at the shared 15° elevation the pole and base project *above*
  the ball's floor line, so "cutting the bottom of the board" cannot hide the stand while the ball rests in frame; this
  is the realisable reading, applied to every pose (one rest fit). Beats unchanged (decline 1.6 s, the glass hit on the
  0.95 s beat).
- **The net (#44):** rebuilt in place behind the same interface: hung slack (cord rest lengths from the hanging pose, the
  1.13× bottom opening kept so the silhouette and posters stand), XPBD at fixed 1/480 s substeps with two ordered
  constraint passes and real damping of the diamond 'scissor' mode, a sphere-with-friction ball contact that injects no
  energy, smoothed knot frames (no wagging tails), render interpolation so 90/144 Hz displays see no cadence jitter, the
  rim's ring damped; targets: whole-net sway 0.7–1.3 Hz with ring coherence ≥ 0.8, settle 1.5–2.5 s after a swish, knot
  tilt rate ≤ 300°/s, strand scale 0.97–1.06, no crossing (the v1.5 guarantee), cost ≤ 0.5 ms (≤ 1 ms with the record),
  deterministic at 60/90/120/144 Hz.

## Owners and files

A pre-split on `v1.7/integration` extracts the net channel from `src/scenes/sports/index.ts` into
`src/scenes/sports/net.ts` and adds `HoopSprings.kick` + `BALL_MASS_KG`, so the two Sports owners own disjoint files.

- **Dinner card** (`v1.7/dinner-card`, worktree `v17-dinner-card`, port 5701): `src/scenes/dinner/{index,sequences,pull}.ts`
  (not `steam.ts`), `models/dinner.ts`, `models/dinnerContract.ts`, `models/dinnerPremium.ts`, new `models/dinnerCard.ts`,
  new `src/render/cardPrint.ts`, `src/render/{camera,stage,framing}.ts`, `src/core/{types,config,controller,sequence}.ts`,
  `src/demo/{fixtures,main,posters}.ts`, `scripts/capture.ts` (dinner + backdrops), `assets/scenes/dinner/**`,
  `assets/ui/collection/dinner.webp`, `assets/shared/fonts/**`, `tests/{dinner,config,pull,framing,stage-framing,scene-depth}.test.ts`,
  `tests/browser/{dinner,framing,fullscreen,posters}.spec.ts`, `docs/scenes/dinner-v1.7-card.md`, `docs/integration.md`,
  `docs/asset-manifest.md`, `docs/spec-revisions.md` (append).
- **Sports decline and frame** (`v1.7/sports-decline`, worktree `v17-sports-decline`, port 5702):
  `src/scenes/sports/{sequences,ballPhysics,change,index}.ts` (index without the net channel), `models/sportsContract.ts`
  outside the NET/NET_HANG block, `tests/sports.test.ts` describes other than the net suite, `tests/browser/sports.spec.ts`,
  `scripts/sports-strips.ts`, `scripts/capture.ts` (the sports entry), Sports posters/backdrop/thumbnail,
  `docs/scenes/sports-v1.7-decline.md`, `docs/spec-revisions.md` (append).
- **Sports net** (`v1.7/sports-net`, worktree `v17-sports-net`, port 5703): `src/scenes/sports/net.ts`, `models/sportsNet.ts`,
  the NetSkin parts of `models/sports.ts`, the NET/NET_HANG lines of `models/sportsContract.ts`, the net describes in
  `tests/sports.test.ts`, `tests/netCost.ts`, `docs/scenes/sports-v1.7-net.md`, `docs/spec-revisions.md` (append).
- **Integration** (`v1.7/integration`, worktree `v16-int`, port 5508): merges net → decline → dinner, resolves the shared
  Sports contract and the posters, re-runs the suites on a fresh server, commissions one judge per revision and a
  guest-experience judge, polish rounds from their ranked tells, the docs, then `main`.
