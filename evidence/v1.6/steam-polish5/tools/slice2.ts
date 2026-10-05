import { Vector3 } from 'three';
import { cloudState, cloudDensity } from '/Users/suryanewa/Developer/projects/livetime-invitations/.claude/worktrees/v16-steam6/src/scenes/dinner/steam.ts';
const tau = Number(process.argv[2] ?? 1.1);
const s = cloudState(tau);
const chars = ' .:-=+*#%@';
const p = new Vector3();
console.log('tau', tau, 'ring', s.ringR.toFixed(3), s.ringY.toFixed(3), 'sigma', s.ringSigma.toFixed(3), 'roll', s.roll.toFixed(2), 'rise', s.rise.toFixed(3), 'cap', s.cap.toFixed(3));
for (let y = s.ringY + 0.45; y >= s.ringY - 0.45; y -= 0.025) {
  let row = y.toFixed(2).padStart(5) + ' |';
  for (let x = 0; x <= 1.1; x += 0.0125) {
    p.set(x, y, 0); const d = cloudDensity(p, s);
    row += chars[Math.min(9, Math.floor(d * 12))]!;
  }
  console.log(row);
}
