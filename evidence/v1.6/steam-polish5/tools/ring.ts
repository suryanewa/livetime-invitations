import { cloudState, dragWeight } from '/Users/suryanewa/Developer/projects/livetime-invitations/.claude/worktrees/v16-steam6/src/scenes/dinner/steam.ts';
// ring.ts tau... : the vortex ring's core circle (centre x, z with the lean and side drag; radius; height; tube reach)
for (const t of process.argv.slice(2).map(Number)) {
  const s = cloudState(t); const h = Math.max(0, s.ringY - 0.15);
  const cx = s.lean.x * h + s.dragSide.x, cz = s.lean.y * h + s.dragSide.y;
  console.log(JSON.stringify({ tau: t, cx, cz, r: s.ringR, y: s.ringY, sigma: s.ringSigma, roll: s.roll }));
}
