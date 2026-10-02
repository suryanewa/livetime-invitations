import type { SequenceName } from '../../core/types.ts';
import { declinePull } from '../../render/framing.ts';
import { type AnswerChange, changeTime } from './sequences.ts';

/**
 * v1.5 decline pull-back (src/render/framing.ts DECLINE_PULL): where the camera is between the
 * rest fit (0) and the decline fit (1), from what the scene shows. It follows the decline's bin
 * clock: the camera starts easing back as the decline starts, and the bin, BIN_DELAY behind it,
 * glides into the room it makes. On a change of mind it rides the change's own timeline
 * (`changeTime`): decline → accept rewinds the decline, so the camera comes back in along the same
 * curve as the dish comes back out of the bin; accept → decline brings the bin in on its own clock
 * during the end of the reveal's rewind (`start` ahead of the dish), and the camera with it.
 * A pure function of the sequence, its time and the change: replay-safe.
 */
export function dinnerPull(shown: { seq: SequenceName; t: number } | null, change: AnswerChange | null): number {
  if (!shown) return 0;
  if (change && shown.seq === change.next) {
    const [seq, s] = changeTime(change, shown.t);
    // The bin's clock, as sampleAnswerChange runs it: ahead of the dish while the reveal rewinds.
    const toBin = change.next === 'decline' && change.from !== 'decline';
    const binClock = toBin && shown.t < change.rewind ? shown.t - (change.rewind - change.start) : s;
    if (seq === 'decline') return declinePull(Math.max(binClock, s));
    return toBin ? declinePull(binClock) : 0;
  }
  return shown.seq === 'decline' ? declinePull(shown.t) : 0;
}
