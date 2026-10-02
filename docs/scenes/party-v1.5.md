# Party v1.5: the record plays on, and is set down in one gesture

Surya, 2026-10-02 (brief: `docs/perfection-pass-brief.md`, edits #1 and #2):

1. *"Make the record player continuously spin the disc after acceptance."*
2. *"The animation for placing the disc on the player isn't completely smooth."*

Spec revision #37 records the change to the Party sub-spec ("still after acceptance, no idle spin"),
the change of mind and the render-loop changes. Files: `src/scenes/party/{poses,sequences,index}.ts`,
`src/core/{controller,clock,sequence}.ts`, `src/motion/spring.ts`, the capture plan
(`scripts/capture.ts`, Party's accept clip runs 3.6 s), the two accepted posters (regenerated: the
display angle moved). No model, material or framing changed.

## Measured first (v1.2, `scripts/party-motion-audit.ts host 240`, `evidence/v1.5/party/before-host/`)

The roughness was in the host path itself, not only in the settle:

| Where | v1.2 | Why it read as not smooth |
| --- | --- | --- |
| Align (0–0.22 s) | Vertical speed peaked at **4.37 u/s (87 cm/s) at 0.075 s**, acceleration **104 u/s² (2.1 g)**, jerk 8,900 u/s³ | A lurch: 34 % of the whole drop in 0.1 s |
| Align → lower (0.12–0.33 s) | Speed fell to **0.64 u/s (15 % of the peak) at 0.20 s**, then rose again to **1.79 u/s at 0.325 s**; the tilt rate did the same (−4.5, −1.4, −2.6 rad/s) | Two speed peaks: lurch, near-stall, second push (the tilt-vs-descent coupling: two overlapping windows) |
| Beat joints | Acceleration steps at 0 s (0 → −20 u/s², the ease's curvature from rest), 0.12 s (42.7 → 31.3), 0.22 s (−4 → −10.6; tilt −8.5 → +2.0), 0.40 s (tilt 4.8 → 0.7) | C² breaks at every beat |
| Approach | The last centimetre took 0.25 s (0.50–0.75 s) along the bezier's tail | A creep |
| Touch (0.75 s) | Landed flat, then the settle tilt grew from zero *after* landing, lifting the centre **2.1 mm in 40 ms** (+0.33 u/s; the acceleration jumped 1.2 → 18 u/s²) | A hop |
| Settle | Tilt 0 → 0.79° in 0.05 s, a fixed 3.2 Hz precession, e^(−u/0.09); the window from 0.915 s put a kink in its tail (0.16 → −0.24 u/s²) | The shiver |
| Clock | Sequences were sampled at `performance.now()` inside the rAF callback (latency p50 1.2 ms, one 11 ms frame in the host run), not at the frame's timestamp | Sampling jitter (up to 4 px at the old peak speed) |
| Stepper | Fed the frames' own timestamps, the fixed 1/120 s stepper ran 1/2/3 steps per 60 Hz frame (8 of 75 frames off 2); 0/1/2 at 120–144 Hz | Anything run on in `simulate` would judder |

`index.ts` added nothing frame-rate dependent (pure node writes; the contact shadow follows the frame's height).

## Edit #2: the placement

One unhurried gesture, a short drop, a coin's settle (`PLACE` in `poses.ts`; `host` in `sequences.ts`):

- **Reach (0–0.9 s, released at 0.652 s).** A Beta(3, 4) progress, the speed profile of a human
  placing movement (one bell peaking at 40 %, zero speed and acceleration at the start). Peak speed
  **1.75 u/s (35 cm/s) at 0.35 s**, acceleration ≤ **1.5 m/s² (0.15 g)** before the release (v1.2:
  2.1 g). The same profile levels the record by 0.52 s and carries it back over the spindle from
  0.08 to 0.52 s (3 cm above LEVEL_BY). Levelling and moving back go together: levelling alone
  pushes the front edge 3 cm further, out of the motion bounds, and moving back before the record
  has come down puts its back edge into the open cover's lean (the host-ready hover is 2.1 mm from
  the cover's inside; this path never comes closer; v1.2's came to 1.2 mm). Then it runs straight
  down the spindle.
- **Release and drop (0.652–0.722 s).** A hand holding a 12" record by its edge cannot follow it
  below the platter's rim, so it lets go 8 mm above the mat, still moving down at 11 cm/s. One side
  leaves the fingers first: the record tips 0.8° (starting 0.12 s before the release, so slowly that
  its centre never stops descending). The low rim's gap closes along a quintic from its state at
  the release to zero gap with zero speed and acceleration: the air film under the disc brakes it
  (the "soft slap"). The low rim meets the mat at rest; the centre carries on at 1.2 cm/s into the
  settle.
- **Settle (0.722–1.002 s).** The record rides on its low rim (centre R·sin(tilt) above the mat)
  while the tilt decays as (1 − x)⁴(1 + 4x) from its peak (zero slope there, a soft tail, exactly
  zero with zero slope and curvature at the end) and never grows back: **no hop**. The low side
  runs round the rim at 6 Hz × (1 − tilt/peak): faster as it settles, Euler's disc's signature,
  capped so 60 fps never aliases it (0.77 turns while the tilt is above 1e-4 rad). Rim lift
  2.2 mm (2–3 px). Still from 1.002 s, held to the clip's end (1.2 s, unchanged).
- **Properties (unit-tested):** C² everywhere (no channel's acceleration changes by more than 5 %
  of its peak in 0.1 ms, release and touch included); the centre descends monotonically from the
  hover to the mat; one speed peak while the hand carries it; level and centred before the hole
  reaches the spindle; never below the mat; the hole never binds; inside the motion bounds; the
  open cover is never cut. Hand-over to `guest-ready` exact.
- **Clock:** the loop now samples on the frame's own timestamp (below).

Considered and rejected: a 9 mm free drop released from a nearly stopped hand (3.5× speed-up in
the last three frames: with no hand on screen it reads as a glitch, not a release), and a set-down
with no drop (the v1.2 creep).

## Edit #1: the record plays on

- **Speed: the real 33⅓ rpm** (3.49 rad/s, 1.8 s a turn). v1.2 ran 2.2× faster (7.63 rad/s) because
  a silent 1.6 s clip that braked to a stop had to read as playing. Rendered side by side
  (`evidence/v1.5/party/accept` vs `accept-v1.2-speed`, label zooms every 50 ms): at 2.2× the
  label turns in 0.82 s and reads as a 78 on a toy; at 33⅓ the off-centre marks of the master's
  print (the square, dashes and dots) move ≈ 10° every 50 ms, clearly turning, at the speed people
  know. A mild exaggeration was rendered too (`accept-45-rpm/`, 45 rpm, itself a 12" single's
  speed): it reads hurried for an LP and gains nothing in legibility. The print's asymmetry is what makes the spin legible (the vinyl's grooves are symmetric).
- **A real deck's order (polish round).** The key is pressed at 0.05 s: it lights and the motor
  starts. The hand reaches the cue lever (0.15 s), the lever lifts the arm (0.15–0.35 s), the hand
  swings it to the lead-in at a hand's pace (0.35–0.9 s, peak 1.41 rad/s = 81°/s; v1.2's swing
  peaked at 5.3 rad/s, ~300°/s, in 0.21 s), and the damper lowers the stylus over 0.75 s
  (0.9–1.65 s) onto a record already at **99.6 % of speed** (v1.2's stylus landed at 5 %). The clip
  is **1.85 s** (was 1.6): it ends 0.2 s after the touch.
- **Spin-up: belt drive, a = 4.75/s** (95 % of speed 1.0 s after the motor starts). The critically
  damped lag is kept; its rate is a DC-servo belt drive's (DJ belt decks quote "< 1 s", low-torque
  hi-fi decks 2–5 s; v1.2's 0.35 s was a direct drive's). The clip ends at 99.8 % of speed, still
  gaining; the scene keeps evaluating the same closed form, so nothing is handed over but time.
- **Lead-in:** after the touch the groove draws the stylus from the cue to `played` over 1.5 turns
  of the record (2.7 s at 33⅓), eased to rest there (the music groove's pitch then moves it
  0.05 mm a second, which no frame shows). It carries on after the clip, while the record plays.
- **No brake.** The canonical `accepted` pose is that play once the lead-in is done (`ACCEPTED_AT`,
  4.35 s into acceptance): the record at its display angle **0.977 rad**, the stylus at `played`,
  key lit. Posters show it; under reduced motion it is the still (the controller never steps
  `simulate` there).
- **How it runs (`index.ts`):** at the director's end of the clip, `pose('accepted')` keeps the
  clip's own platter model and sets `since = t_last − 1.85` (negative); `simulate(dt)` adds the
  frame's steps (they sum to the frame's clock delta), `beforeRender` draws the closed form at
  1.85 + `since` (record and lead-in). So the first frame after the clip shows the angle for its own time, and so does
  every later one: under the real `VisualDirector` and `FixedStepper` at 60, 120 and 144 Hz with
  ±0.4 ms of jitter, every frame's angle equals the closed form to 1e-9 rad (unit test).
  `settling()` is true while it plays; `settle()` re-bases it on the canonical pose (`ACCEPTED_AT`);
  any new sequence or pose ends it, so replays never accumulate angle.
- **Change of mind (decline while it plays, or during the clip).** `interruptCut()` always answers
  true and records the pose on screen with its velocities (as Business, #25); the decline clip
  starts from it: the motor is cut and the platter **coasts** (dω/dt = −(c + k·ω), k = 0.5/s,
  c = 0.5 rad/s²: from 33⅓ it is at 62 % when the closing cover hides the label, 0.7 s later, and
  stops 3.0 s after the cut; research: bearing friction alone lets a belt-drive platter coast
  10–15 s, the stopped motor and belt drag it harder), the key goes dark at once (a stop button's
  lamp), and the arm goes home along the same planner as the authored arm (`planArm`, below), and
  the cover closes as authored. The director's 150 ms straight blend would have spun the record
  backwards by up to half a turn and whipped the arm home (v1.2's known gap; #10's one-frame lift
  step is gone too). **Accept after a decline began:** the cover is lifted back open from where it
  was (it carries its closing momentum briefly, then rises: 0.5 s), the arm goes to the cue along
  the planner and is lowered at the authored time (the stylus still lands at 1.65 s), and a
  platter still coasting is picked up by the belt when the motor starts.
- **One arm planner (`planArm`, polish round)** for the authored accept and every hand-over: with
  the stylus in the groove, the tube on the rest or the arm more than half lowered, the cue lever
  first lifts it (0.2 s for the whole travel, from its own rate) while the yaw holds; an arm in the
  air keeps its velocity. Moving away from where it now has to go, the hand brakes it to rest
  (quartic, ≤ 12 rad/s², never past the mechanism's ends); moving towards it, it swings on with its
  speed when that cannot overshoot (a quintic carrying v0 is monotone while v0·T ≤ 2.55·d,
  measured; the planner keeps 2.4) or else is braked to rest exactly on the target. Then it swings
  (0.55 s for the whole swing, ∝ √distance) and is lowered: by the damper at the cue (from 0.9 s),
  into the cradle at the rest (0.25 s). Yaw stays within [`played`, `parked`], pitch within
  [lifted, contact], and each movement turns round at most once.
- **The judge's defects, fixed.** (1) The stylus landed on a nearly still record (5 % of speed):
  the motor now starts first (99.6 % at the touch). (2) The arm swung at ~300°/s: now ≤ 81°/s, the
  lift 0.2 s, the damper 0.75 s. (3) A decline during the lead-in popped the pitch (+0.0029 →
  −0.0084 rad in one frame, `blendLift`'s ceiling at yaws between the cue and `played`): the
  hand-over no longer uses that ceiling; the decline's first frame is the frame on screen to 1e-12
  and the pitch then moves at most 0.4 rad/s (tested at 40 change times, in the clip and while
  playing). (4) Rapid reversals threw the arm to −0.537 rad (0.13 past `played`), lifted it 1.85× the
  cue lift and made the yaw wobble: the planner's limits and braking keep it in range and turning
  round at most once per movement (tested over 133 reversal schedules). (5) The coin precession
  is kept: a single rock onto the other side would lift the centre again (the hop removed in
  edit #2) and kink at the edge switch; at ≤ 2 px it stays the tiny settle a real LP makes. When the decline clip ends the cover is shut and opaque; the
  platter (still coasting) takes the canonical declined pose under it unseen.
- **Clearances:** the closing cover never cuts the returning arm and the reopening cover never cuts
  the cueing arm; nothing but the stylus reaches the vinyl (geometry tests on the exported GLB for
  thirteen change times, the stylus down, lowering, in the air, at `played`, and the cover open,
  closing and shut).

## The render loop (shared: Birthday flames and Dinner steam rely on the same mechanism)

- **Off-screen pause** (`src/core/controller.ts`). An `IntersectionObserver` (threshold 0, implicit
  root, so it also works for an embed inside an iframe) watches the mount. When no part of it is in
  the viewport the loop is **suspended exactly as for a hidden tab** (`suspend()`): the pending
  frame is cancelled, the visual clock pauses, the stepper and the quality window reset, and the
  first interval after waking is not counted as a slow frame. When it is visible again (and the tab
  is visible) `wake()` resumes the clock and requests a frame. `requestFrame()` does nothing while
  off-screen. `onScreen` is assumed true until the observer's first report and wherever
  IntersectionObserver is missing. Scenes need nothing: motion that runs on keeps `settling()`
  true and is simply not stepped while unseen; it resumes where it was. Consequence (as for hidden
  tabs): a sequence also pauses off-screen, and its completion event waits until it is seen.
- **Frame timestamp:** `PlaybackClock.tick(at?)` takes the rAF timestamp; the loop passes it.
- **Exact stepper:** `FixedStepper.advance(dt, step)` splits the frame's clock delta (capped at 1/30 s)
  into the fewest equal steps ≤ 1/120 s. Steps sum to the frame's delta, so time advanced in
  `simulate` never judders; springs still integrate in steps ≤ 1/120 s (identical to v1.0 at 30, 60
  and 120 fps). `reset()` is a no-op kept for the pause paths.
- **Cost while playing** (headless Chrome, M2 Pro, Normal tier): frame interval p95 16.8 ms,
  loop callback p95 0.7 ms at 1200 × 1000 @2 (0.8 ms at 390 × 844 @3); the tier stays Normal.

## Evidence (`evidence/v1.5/party/`)

- `before-host/`: v1.2's host at 120 fps (`host-strip.jpg`, `host-landing-zoom.jpg`, clips).
- `host/`: v1.5's host at 120 fps: `host-strip.jpg` (every 33 ms), `host-landing-zoom.jpg` (every
  60 fps frame 0.55–1.05 s, the platter zoomed), `host-120fps.mp4`, `host-120fps-zoom.mp4`.
- `beats/beats.jpg`: stills at every host beat (0, 0.08, 0.26, 0.52, release 0.652, tilt peak
  0.687, touch 0.722, 0.8, still 1.002), accept 0.05 (key) / 0.25 (lift) / 0.6 (swing) / 0.9 (cue) /
  1.3 / 1.65 (touch) / 1.85 (clip end), decline 0.7 / 1.4.
- `accept/` (polish round): the 1.85 s accept clip plus 3.2 s of play at 60 fps: `accept-strip.jpg`,
  `label-zoom.jpg` (every 0.1 s: the platter starts with the key), `arm-zoom.jpg` (every 50 ms:
  lift, the swing at a hand's pace, the damper), clips, and `handover-label-62fps.jpg` (the label
  every frame across the hand-over at 1.85 s in the real render loop). `accept-v1.2-speed/` and
  `accept-45-rpm/`: the first pass's speed comparison (its old clip timing).
- `loop/` (polish round; the real controller and render loop on a virtual clock, 62.5 fps), each
  with a strip, an arm zoom (`*-arm-zoom.jpg`, every other frame from 0.2 s before the last
  change) and clips: `accept-play`, `change-while-playing` (decline at 3 s), `change-mid-clip`
  (decline mid-swing at 0.6 s), `change-lead-in` (decline at 1.75 s, the stylus in the lead-in:
  the judge's pop), `change-back` (decline, then accept at 0.6 s), `reversals` (five choices
  120 ms apart).

Tools: `scripts/party-motion-audit.ts` (240 Hz sampling, beats, kinks), `scripts/party-lab/` (the
production stage driven at exact times, dev server only), `scripts/party-evidence.ts`
(`host`, `beats`, `accept`, `loop`).

The polish round followed an independent motion judge's review of the integrated build (spin 8,
placement 8.5; 33⅓ rpm exact, no step at the hand-over, replays identical, the coast-down and the
landing confirmed) and fixed its four arm defects (Edit #1, "The judge's defects").

## Tests

`tests/party.test.ts` 58 (was 41): the v1.2 invariants kept (canonical ends, 1 ms continuity, C1,
status, presentation tilt, level before the spindle, never below the mat, the hole, one gesture,
stylus, lifted swings, lid) and new ones: host C2, monotonic descent, a single speed peak under
0.4 g, the seat-and-settle (low rim at rest, rides on it, tilt never grows back, precession,
still), belt drive at 33⅓ with no brake, the C2 hand-over to the playing pose, the coast, the
cover never cutting the arm in a change of mind, and the scene under the real director and stepper
(exact angle at 60/120/144 Hz with jitter, the stepper's sum, replays, reduced motion, decline while
playing, an arm turned back from its own velocity and the cover lifted back, rapid reversals), and
for the polish round: the deck's order (the platter first, the stylus landing at ≥ 99 % of
speed), the hand's pace (≤ 90°/s, the damper ≥ 0.6 s), no pop at 40 change times, and the
mechanism's limits with at most one turn per movement over 133 reversal schedules.
`tests/clock.test.ts`: the frame timestamp and the exact stepper. Browser: `party.spec.ts` (the
label keeps turning after the clip; rapid reversals settle to the canonical pose),
`idle.spec.ts` (idle on Business; Party runs while seen, stops off-screen and hidden, resumes; a
sequence pauses off-screen and finishes once seen).

## Known gaps

- Every Party embed that has been accepted draws at the display rate while it is on screen. That is
  the edit; the cost is above. A device too slow for it steps down tiers while it plays, down to the
  poster (Static), as during any sequence.
- A label change while the record plays resets the visual (the director's reset), so the record
  snaps to its display angle.
- The cover's hover clearance is the v1.2 hover's own 2.1 mm.
