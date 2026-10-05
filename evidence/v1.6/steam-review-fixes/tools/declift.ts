import { planAnswerChange, sampleSequence, newFrame, CONTENT_END } from '/Users/suryanewa/Developer/projects/livetime-invitations/.claude/worktrees/v16-fix/src/scenes/dinner/sequences.ts';
import { COVER_SEATED } from '/Users/suryanewa/Developer/projects/livetime-invitations/.claude/worktrees/v16-fix/models/dinnerContract.ts';
const W = 0.25;
for (const [at, rate] of [[0.3, 1], [0.5, 1], [0.8, 1], [1.0, 1], [CONTENT_END.accept, 0]] as const) {
  const plan = planAnswerChange('accept', at, rate, 'decline');
  const f = newFrame();
  const row: string[] = [];
  for (let ts = 0; ts <= 0.62; ts += 1 / 60) {
    const t = plan.start + (0.5 / 60 + ts) * plan.k;
    sampleSequence('decline', t, f);
    const lift = f.coverPos.y - COVER_SEATED.y;
    row.push(`${ts.toFixed(3)} ${lift.toFixed(3)} ${(W * (1 - Math.exp(-lift / W))).toFixed(4)}`);
  }
  console.log(`at ${at} rewind ${plan.rewind.toFixed(3)} start ${plan.start.toFixed(3)} k ${plan.k.toFixed(3)}`);
  console.log(row.filter((_, i) => i % 2 === 0).join(' | '));
}
