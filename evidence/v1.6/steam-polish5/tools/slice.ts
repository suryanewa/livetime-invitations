import { Vector3 } from 'three';
import { cloudState, cloudDensity, cloudMaterial } from '/Users/suryanewa/Developer/projects/livetime-invitations/.claude/worktrees/v16-steam6/src/scenes/dinner/steam.ts';
const tau = Number(process.argv[2] ?? 1.2);
const s = cloudState(tau);
const chars = ' .:-=+*#%@';
const p = new Vector3(); const m = { X: new Vector3(), dilution: 1 };
console.log('tau', tau, 'rise', s.rise.toFixed(3));
for (let y = 2.2; y >= 0; y -= 0.08) {
  let row = y.toFixed(2).padStart(5) + ' |';
  for (let x = -1.2; x <= 1.2; x += 0.04) {
    p.set(x, y, 0); const d = cloudDensity(p, s);
    let c = chars[Math.min(9, Math.floor(d * 10))]!;
    if (d > 0.05) { cloudMaterial(p, s, m); if (m.X.y < 0.3) c = d > 0.3 ? 'B' : 'b'; }
    row += c;
  }
  console.log(row);
}
