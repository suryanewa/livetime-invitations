import { planAnswerChange, sampleSequence, newFrame } from '/Users/suryanewa/Developer/projects/livetime-invitations/.claude/worktrees/v16-steam6/src/scenes/dinner/sequences.ts';
import { COVER_SEATED } from '/Users/suryanewa/Developer/projects/livetime-invitations/.claude/worktrees/v16-steam6/models/dinnerContract.ts';
const plan = planAnswerChange('accept', 0.5, 1, 'decline');
console.log(JSON.stringify(plan));
const f = newFrame();
const row = [];
for (let ts = 0; ts <= 0.45; ts += 0.032) {
  const t = plan.start + (plan.rewind + 0.5 / 60 + ts - plan.rewind) * plan.k;
  sampleSequence('decline', t, f);
  row.push(`${ts.toFixed(3)}: lift ${(f.coverPos.y - COVER_SEATED.y).toFixed(3)} x ${f.coverPos.x.toFixed(2)} z ${f.coverPos.z.toFixed(2)} plateY ${f.platePos.y.toFixed(3)}`);
}
console.log(row.join('\n'));
