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

OWNERS_AND_FILES_PLACEHOLDER
