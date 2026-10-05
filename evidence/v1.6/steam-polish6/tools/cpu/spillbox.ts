import { Vector3 } from 'three';
const { cloudState, steamBounds, spillSource, SPILL, spillFade } = await import('/Users/suryanewa/Developer/projects/livetime-invitations/.claude/worktrees/v16-steam7/src/scenes/dinner/steam.ts');
for (const tau of process.argv.slice(2).map(Number)) {
  const s = cloudState(tau), a = [new Vector3(), new Vector3(), new Vector3(), new Vector3(), new Vector3(), new Vector3()];
  steamBounds(s, { tau, emitStart: -Infinity, emitEnd: Infinity }, a[0], a[1], a[2], a[3], a[4], a[5]);
  const src = Array.from({ length: SPILL.samples }, (_, k) => spillSource(tau - k * SPILL.dt).toFixed(2)).join(' ');
  console.log(tau.toFixed(3), 'fade', spillFade(tau).toFixed(2), 'src', src, 'spill', a[4].toArray().map((v) => v.toFixed(2)).join(','), '->', a[5].toArray().map((v) => v.toFixed(2)).join(','));
}
