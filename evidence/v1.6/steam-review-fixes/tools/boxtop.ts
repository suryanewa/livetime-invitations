// boxtop.ts: the gush's box top (steamBounds' spill box, su) over the accept's tau, and where it passes 1.3 su
import { Vector3 } from 'three';
import { cloudState, steamBounds, SPILL } from '/Users/suryanewa/Developer/projects/livetime-invitations/.claude/worktrees/v16-fix/src/scenes/dinner/steam.ts';
const row: string[] = [];
for (let tau = 0.3; tau < SPILL.fade[1]; tau += 0.04) {
  const lo = new Vector3(), hi = new Vector3();
  steamBounds(cloudState(tau), { tau, emitStart: -Infinity, emitEnd: Infinity }, new Vector3(), new Vector3(), new Vector3(), new Vector3(), lo, hi);
  row.push(`${tau.toFixed(2)} ${hi.y.toFixed(3)}`);
}
console.log(row.join(' | '));
