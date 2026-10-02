import { Vector3 } from 'three';
import { BIN_POS, BIN_YAW, CAKE_RADIUS, CAKE_TOTAL_HEIGHT, CANDLE, CANDLE_HOVER, CANDLE_SOCKETS, FLAME_TOP, LEAN_MAX, STAND, STAND_TOP } from '../../../models/birthdayContract.ts';
import { BIN } from '../../../models/disposalBin.ts';
import { DURATIONS } from './poses.ts';
import { newFrame, sampleSequence } from './sequences.ts';

const ring = (pts: Vector3[], cx: number, cz: number, r: number, y: number, n = 20) => {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push(new Vector3(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r));
  }
};

/**
 * Silhouette samples of every Birthday path (Master §5 framing): the stand, the hovering and the
 * lit candles, the cake carried to the bin (with its lean) and the bin with its flaps open.
 * Fitting these instead of a box keeps the cake as large as the literal disposal path allows.
 */
export function birthdayFramePoints(): Vector3[] {
  return [...birthdayRestFramePoints(), ...birthdayDeclineFramePoints()];
}

/**
 * The paths that must be in frame at rest (v1.5 decline pull-back): the stand and the cake in
 * place, flames lit, and the candles hovering at host-ready. The accept (the breath, the smoke)
 * stays inside these.
 */
export function birthdayRestFramePoints(): Vector3[] {
  const pts: Vector3[] = [];
  // Stand (foot on the floor, plate at the top) and cake in place, flames lit; candles hovering (host-ready).
  ring(pts, 0, 0, STAND.foot + 0.02, 0);
  ring(pts, 0, 0, STAND.radius, STAND.top - 0.06);
  ring(pts, 0, 0, STAND.radius, STAND.top);
  for (const [x, z] of CANDLE_SOCKETS) {
    pts.push(new Vector3(x, STAND_TOP + CANDLE.seat + FLAME_TOP, z));
    pts.push(new Vector3(x, STAND_TOP + CANDLE.seat + CANDLE_HOVER + CANDLE.height, z));
  }
  return pts;
}

/** The decline's own paths: the cake carried to the bin and the bin's open flaps (its body: openBinFramePoints). */
export function birthdayDeclineFramePoints(): Vector3[] {
  const pts: Vector3[] = [];
  const ring2 = (cx: number, cz: number, r: number, y: number, n = 20) => ring(pts, cx, cz, r, y, n);
  // The carried cake, sampled along the decline path (underside and wick tips), widened by its lean.
  const f = newFrame();
  const lean = CAKE_TOTAL_HEIGHT * Math.sin(LEAN_MAX);
  for (let t = 0.25; t <= DURATIONS.decline; t += 0.025) {
    const p = sampleSequence('decline', t, f).cakePos;
    ring2(p.x, p.z, CAKE_RADIUS + 0.02, p.y, 12);
    ring2(p.x, p.z, CANDLE_SOCKETS.reduce((m, [x, z]) => Math.max(m, Math.hypot(x, z)), 0) + lean, p.y + CAKE_TOTAL_HEIGHT, 8);
  }
  // Bin body, and each open flap: a half-disc standing on its hinge (tallest mid-hinge).
  ring2(BIN_POS.x, BIN_POS.z, BIN.radius, 0);
  ring2(BIN_POS.x, BIN_POS.z, BIN.radius, BIN.rimTop);
  const c = Math.cos(BIN_YAW), s = Math.sin(BIN_YAW);
  const flapR = BIN.radius + 0.022, lean2 = Math.cos(BIN.flapOpen), rise = Math.sin(BIN.flapOpen);
  for (const side of [-1, 1]) {
    for (let k = 0; k <= 16; k++) {
      const lz = -flapR + (2 * flapR * k) / 16;
      const reach = Math.sqrt(Math.max(0, flapR * flapR - lz * lz));
      const lx = side * (BIN.hingeX - reach * lean2);
      const y = BIN.rimTop + reach * rise + 0.11 * Math.abs(lean2);
      pts.push(new Vector3(BIN_POS.x + lx * c + lz * s, y, BIN_POS.z - lx * s + lz * c));
      // The dome's outer skin leans a little further out than the hinge line.
      const ox = side * (BIN.hingeX - reach * lean2 + 0.11);
      pts.push(new Vector3(BIN_POS.x + ox * c + lz * s, BIN.rimTop + reach * rise, BIN_POS.z - ox * s + lz * c));
    }
  }
  return pts;
}
