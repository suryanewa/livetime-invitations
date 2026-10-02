/**
 * Party motion audit (v1.5): samples `sampleSequence(<sequence>, t)` at 240 Hz and prints the
 * record's position, velocity and acceleration (and its tilt and the settle's wobble) across every
 * beat boundary, plus the kinks the eye can catch: velocity steps (C¹ breaks), acceleration steps
 * (C² breaks) and jerk spikes, per channel. The v1.2 host measured with it is in
 * docs/scenes/party-v1.5.md (Measured).
 *
 *   node --experimental-transform-types --no-warnings scripts/party-motion-audit.ts [host|accept|decline] [hz]
 */
import { CONTACT_AT, newFrame, RELEASE_AT, sampleSequence, SETTLE, STYLUS_DOWN } from '../src/scenes/party/sequences.ts';
import { DURATIONS, PLACE, PLAY_AT, SPIN } from '../src/scenes/party/poses.ts';
import { PLATTER_TOP } from '../models/recordContract.ts';
import type { SequenceName } from '../src/core/types.ts';

const seq = (process.argv[2] ?? 'host') as SequenceName;
const HZ = Number(process.argv[3] ?? 240);
const dt = 1 / HZ;
const T = DURATIONS[seq];

type Row = { t: number; x: number; y: number; z: number; tilt: number; wob: number; spin: number; yaw: number; pitch: number; lid: number };
const sample = (t: number): Row => {
  const f = sampleSequence(seq, t, newFrame());
  return {
    t, x: f.recordPos.x, y: f.recordPos.y - PLATTER_TOP, z: f.recordPos.z, tilt: f.recordTilt,
    wob: Math.hypot(f.wobble, f.wobbleZ), spin: f.spin, yaw: f.armYaw, pitch: f.armPitch, lid: f.lid,
  };
};

const n = Math.round(T * HZ);
const rows = Array.from({ length: n + 1 }, (_, i) => sample(i * dt));
const keys = ['x', 'y', 'z', 'tilt', 'wob', 'spin', 'yaw', 'pitch', 'lid'] as const;
/** Central differences (one-sided at the ends). */
function deriv(xs: number[]): number[] {
  return xs.map((_, i) => {
    if (i === 0) return (xs[1]! - xs[0]!) / dt;
    if (i === xs.length - 1) return (xs[i]! - xs[i - 1]!) / dt;
    return (xs[i + 1]! - xs[i - 1]!) / (2 * dt);
  });
}

const BEATS: Record<SequenceName, [number, string][]> = {
  host: [[0, 'start'], [PLACE.reach.alignFrom, 'move back from'], [PLACE.reach.levelAt, 'level'], [PLACE.reach.alignAt, 'over the spindle'], [RELEASE_AT - PLACE.release.lead, 'tilt from'], [RELEASE_AT, 'release'], [SETTLE.peakAt, 'tilt peak'], [CONTACT_AT, 'low rim touches'], [SETTLE.end, 'still'], [1.2, 'clip end']],
  accept: [[0, 'start'], [0.04, 'swing from'], [0.08, 'lift end'], [0.25, 'cue'], [SPIN.start, 'motor'], [STYLUS_DOWN, 'stylus down'], [PLAY_AT, 'status'], [1.6, 'clip end (plays on)']],
  decline: [[0, 'start'], [0.2, 'lid from'], [1.3, 'lid shut'], [1.4, 'clip end']],
};

console.log(`${seq}: ${HZ} Hz, ${n + 1} samples, ${T} s`);
const report: Record<string, { v: number[]; a: number[]; j: number[] }> = {};
for (const k of keys) {
  const x = rows.map((r) => r[k]);
  const v = deriv(x), a = deriv(v), j = deriv(a);
  report[k] = { v, a, j };
  const peak = (xs: number[]) => Math.max(...xs.map(Math.abs));
  if (peak(v) < 1e-9) continue;
  console.log(`\n── ${k}: |v| peak ${peak(v).toFixed(4)}/s at ${(v.map(Math.abs).indexOf(peak(v)) * dt).toFixed(4)} s, |a| peak ${peak(a).toFixed(3)}/s², |j| peak ${peak(j).toFixed(1)}/s³ at ${(j.map(Math.abs).indexOf(peak(j)) * dt).toFixed(4)} s`);
  // Largest one-sample steps in velocity and acceleration (relative to their peaks).
  const steps = (xs: number[]) => xs.slice(1).map((y, i) => ({ t: (i + 1) * dt, d: Math.abs(y - xs[i]!) }));
  const top = (xs: { t: number; d: number }[], m = 4) => [...xs].sort((p, q) => q.d - p.d).slice(0, m).map((s) => `${s.t.toFixed(4)}s ${s.d.toExponential(2)}`).join(', ');
  console.log(`   Δv/sample top: ${top(steps(v))}  (peak v ${peak(v).toExponential(2)})`);
  console.log(`   Δa/sample top: ${top(steps(a))}  (peak a ${peak(a).toExponential(2)})`);
}

console.log('\nAt the beats (value, velocity, acceleration):');
for (const [bt, name] of BEATS[seq]) {
  const i = Math.round(bt * HZ);
  const parts = keys.filter((k) => Math.max(...report[k]!.v.map(Math.abs)) > 1e-9).map((k) => {
    const lo = Math.max(1, i - 1), hi = Math.min(n - 1, i + 1);
    return `${k} ${rows[i]![k].toFixed(4)} v[${report[k]!.v[lo]!.toFixed(3)}|${report[k]!.v[hi]!.toFixed(3)}] a[${report[k]!.a[lo]!.toFixed(2)}|${report[k]!.a[hi]!.toFixed(2)}]`;
  });
  console.log(`${bt.toFixed(3)} s ${name.padEnd(18)} ${parts.join('  ')}`);
}

if (process.argv.includes('--csv')) {
  console.log('\nt,x,y,z,tilt,wob,vy,ay,vtilt,atilt');
  rows.forEach((r, i) => console.log([r.t, r.x, r.y, r.z, r.tilt, r.wob, report.y!.v[i], report.y!.a[i], report.tilt!.v[i], report.tilt!.a[i]].map((v) => (v as number).toFixed(5)).join(',')));
}
