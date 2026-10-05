import { planAnswerChange } from '/Users/suryanewa/Developer/projects/livetime-invitations/.claude/worktrees/v16-steam6/src/scenes/dinner/sequences.ts';
import { leftSteamEnd, leftSteamFade, steamEndAfter } from '/Users/suryanewa/Developer/projects/livetime-invitations/.claude/worktrees/v16-steam6/src/scenes/dinner/steam.ts';
for (const at of [0.5, 0.3, 0.7, 1.0]) {
  const plan = planAnswerChange('accept', at, 1, 'decline');
  const capture = at + plan.rewind + 0.5 / 60;
  const until = leftSteamEnd(at, -Infinity, capture);
  console.log('decline at', at, 'rewind', plan.rewind.toFixed(3), 'capture', capture.toFixed(3), 'until', until, 'endAfter', steamEndAfter(at));
  const row = [];
  for (let t = capture - 0.12; t < until + 0.02; t += 0.016) row.push(`${t.toFixed(3)}:${leftSteamFade(t, at, capture).toFixed(3)}`);
  console.log(row.join(' '));
}
