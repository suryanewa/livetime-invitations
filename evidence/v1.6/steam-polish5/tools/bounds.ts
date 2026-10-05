import { Vector3 } from 'three';
import { cloudState, steamBounds, cloudLook, CLOUD, EDGE } from '/Users/suryanewa/Developer/projects/livetime-invitations/.claude/worktrees/v16-steam6/src/scenes/dinner/steam.ts';
for (const tau of [0.5, 0.7, 0.86, 0.96, 1.024, 1.1, 1.18, 1.25, 1.4]) {
  const s = cloudState(tau);
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), d = new Vector3();
  steamBounds(s, null, a, b, c, d);
  const look = cloudLook(s.age, s.erode, undefined, s.peel);
  console.log(tau, 'age', s.age.toFixed(3), 'box x', a.x.toFixed(3), b.x.toFixed(3), 'y', a.y.toFixed(3), b.y.toFixed(3), 'turb', s.turb.toFixed(3), 'amp', look.amp.toFixed(3), 'billow', look.billow.toFixed(3), 'band', look.band.toFixed(3), 'lean', s.lean.toArray().map(v=>v.toFixed(3)), 'drag', s.dragSide.toArray().map(v=>v.toFixed(3)), 'rise', s.rise.toFixed(3), 'cap', s.cap.toFixed(3), 'ring', s.ringR.toFixed(3), s.ringY.toFixed(3), 'skirt', s.skirt.toFixed(3));
}
