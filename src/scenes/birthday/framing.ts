import { Vector3 } from 'three';
import { BIN_POS, BIN_YAW, CAKE, CAKE_RADIUS, CAKE_TOTAL_HEIGHT, STAND_TOP } from '../../../models/birthdayContract.ts';
import { FLAME_SCALE, STAND_FOOT } from '../../../models/cake.ts';

const STAND_FOOT_RADIUS = STAND_FOOT + 0.02;
import { BIN } from '../../../models/disposalBin.ts';
import { DURATIONS } from './poses.ts';
import { newFrame, sampleSequence } from './sequences.ts';

/**
 * Silhouette samples of every Birthday path (Master §5 framing): the stand, the lit flames,
 * the cake carried to the bin and the bin with its flaps open. Fitting these instead of a
 * box keeps the cake as large as the literal disposal path allows.
 */
export function birthdayFramePoints(): Vector3[] {
  const pts: Vector3[] = [];
  const ring = (cx: number, cz: number, r: number, y: number, n = 20) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      pts.push(new Vector3(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r));
    }
  };
  // Stand (small foot on the floor, wide plate at the top) and cake in place, flames lit.
  ring(0, 0, STAND_FOOT_RADIUS, 0);
  ring(0, 0, CAKE.trayRadius, STAND_TOP - 0.06);
  ring(0, 0, CAKE.trayRadius, STAND_TOP);
  const flameTop = STAND_TOP + CAKE.cakeHeight - CAKE.candleInsert + CAKE.candleHeight + 0.028 + 0.16 * FLAME_SCALE;
  for (const [x, z] of CAKE.sockets) pts.push(new Vector3(x, flameTop, z));
  // The carried cake, sampled along the decline path (underside and wick tips).
  const f = newFrame();
  for (let t = 0.25; t <= DURATIONS.decline; t += 0.025) {
    const p = sampleSequence('decline', t, f).cakePos;
    ring(p.x, p.z, CAKE_RADIUS, p.y, 12);
    ring(p.x, p.z, CAKE_RADIUS * 0.7, p.y + CAKE_TOTAL_HEIGHT, 8);
  }
  // Bin body, and each open flap: a half-disc standing on its hinge (tallest mid-hinge).
  ring(BIN_POS.x, BIN_POS.z, BIN.radius, 0);
  ring(BIN_POS.x, BIN_POS.z, BIN.radius, BIN.rimTop);
  const c = Math.cos(BIN_YAW), s = Math.sin(BIN_YAW);
  const flapR = BIN.radius + 0.022, lean = Math.cos(BIN.flapOpen), rise = Math.sin(BIN.flapOpen);
  for (const side of [-1, 1]) {
    for (let k = 0; k <= 16; k++) {
      const lz = -flapR + (2 * flapR * k) / 16;
      const reach = Math.sqrt(Math.max(0, flapR * flapR - lz * lz));
      const lx = side * (BIN.hingeX - reach * lean + 0.11 * Math.abs(rise) * 0);
      const y = BIN.rimTop + reach * rise + 0.11 * Math.abs(lean);
      pts.push(new Vector3(BIN_POS.x + lx * c + lz * s, y, BIN_POS.z - lx * s + lz * c));
      // The dome's outer skin leans a little further out than the hinge line.
      const ox = side * (BIN.hingeX - reach * lean + 0.11);
      pts.push(new Vector3(BIN_POS.x + ox * c + lz * s, BIN.rimTop + reach * rise, BIN_POS.z - ox * s + lz * c));
    }
  }
  return pts;
}
