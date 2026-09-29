import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { CARD, HOOK } from '../models/keycard.ts';
import { DURATIONS, SCAN_AT } from '../src/scenes/business/poses.ts';
import { frameFor, newFrame, sampleSequence, type BusinessFrame } from '../src/scenes/business/sequences.ts';
import type { SequenceName } from '../src/core/types.ts';

const close = (a: BusinessFrame, b: BusinessFrame, eps = 1e-6) => {
  expect(a.pivot.distanceTo(b.pivot)).toBeLessThan(eps);
  expect(Math.abs(a.rot.angleTo(b.rot))).toBeLessThan(eps);
  expect(a.cardOffset.distanceTo(b.cardOffset)).toBeLessThan(eps);
  expect(Math.abs(a.cardTilt - b.cardTilt)).toBeLessThan(eps);
  expect(Math.abs(a.gate - b.gate)).toBeLessThan(eps);
  expect(Math.abs(a.anchorX - b.anchorX)).toBeLessThan(eps);
  expect(Math.abs(a.anchorY - b.anchorY)).toBeLessThan(eps);
};

const at = (seq: SequenceName, t: number) => sampleSequence(seq, t, newFrame());

describe('Business choreography', () => {
  it('host starts at host-ready and ends exactly at guest-ready', () => {
    close(at('host', 0), frameFor('host-ready', newFrame()), 1e-3);
    close(at('host', DURATIONS.host), frameFor('guest-ready', newFrame()));
  });

  it('accept and decline start at guest-ready and end at their canonical poses', () => {
    for (const seq of ['accept', 'decline'] as const) {
      close(at(seq, 0), frameFor('guest-ready', newFrame()));
      close(at(seq, DURATIONS[seq]), frameFor(seq === 'accept' ? 'accepted' : 'declined', newFrame()));
    }
  });

  it('accept and decline share identical motion (only the status colour differs)', () => {
    for (let t = 0; t <= 1.5; t += 0.05) close(at('accept', t), at('decline', t));
  });

  it('the indicator changes exactly once, at the contact beat', () => {
    let changes = 0;
    let prev = at('accept', 0).status;
    for (let i = 1; i <= 1500; i++) {
      const s = at('accept', i / 1000).status;
      if (s !== prev) changes++;
      prev = s;
    }
    expect(changes).toBe(1);
    expect(at('accept', SCAN_AT - 0.001).status).toBe('off');
    expect(at('accept', SCAN_AT).status).toBe('lit');
  });

  it('has no discontinuities: consecutive 1 ms samples never jump', () => {
    for (const seq of ['host', 'accept', 'decline'] as const) {
      let prev = at(seq, 0);
      for (let i = 1; i <= DURATIONS[seq] * 1000; i++) {
        const cur = at(seq, i / 1000);
        expect(cur.pivot.distanceTo(prev.pivot)).toBeLessThan(0.02);
        expect(cur.rot.angleTo(prev.rot)).toBeLessThan(0.03);
        expect(Math.abs(cur.anchorX - prev.anchorX)).toBeLessThan(0.02);
        expect(Math.abs(cur.gate - prev.gate)).toBeLessThan(0.05);
        prev = cur;
      }
    }
  });

  it('samples are clamped outside the sequence and never accumulate state', () => {
    close(at('accept', -1), at('accept', 0));
    close(at('accept', 99), at('accept', DURATIONS.accept));
    const a = at('decline', 0.83);
    at('decline', 0.2);
    close(at('decline', 0.83), a);
  });

  it('guest outcomes stay within 2.0 s and rejection is never slower than acceptance', () => {
    expect(DURATIONS.accept).toBeLessThanOrEqual(2);
    expect(DURATIONS.decline).toBeLessThanOrEqual(DURATIONS.accept);
    expect(DURATIONS.host).toBeGreaterThanOrEqual(0.9);
    expect(DURATIONS.host).toBeLessThanOrEqual(1.6);
  });

  it('host attach never passes the hook wire or gate through the card (slot only)', () => {
    const { back, runY, hinge, radius, corner, gateLength } = HOOK;
    // Static hook centreline in clip space: back leg, corner, horizontal run.
    const hook: Vector3[] = [];
    for (let y = -0.075; y >= runY + corner; y -= 0.004) hook.push(new Vector3(0, y, back));
    for (let i = 0; i <= 8; i++) {
      const a = (i / 8) * (Math.PI / 2);
      hook.push(new Vector3(0, runY + corner - Math.sin(a) * corner, back + corner - Math.cos(a) * corner));
    }
    for (let z = back + corner; z <= hinge; z += 0.004) hook.push(new Vector3(0, runY, z));
    const tol = 0.002;
    const local = new Vector3();
    let worst = Infinity;
    for (let i = 0; i <= DURATIONS.host * 1000; i++) {
      const f = at('host', i / 1000);
      const pts = [...hook];
      for (let s = 0; s <= gateLength; s += 0.004) pts.push(new Vector3(0, runY + Math.cos(f.gate) * s, hinge + Math.sin(f.gate) * s));
      for (const p of pts) {
        local.copy(p).sub(f.cardOffset);
        // Undo the card tilt (rotation about x).
        const c = Math.cos(-f.cardTilt), sn = Math.sin(-f.cardTilt);
        const y = local.y * c - local.z * sn, z = local.y * sn + local.z * c;
        const inSlab = Math.abs(z) < CARD.depth / 2 + radius - tol;
        const inOutline = Math.abs(y) < CARD.height / 2 + radius - tol;
        if (!inSlab || !inOutline) continue;
        // Inside the card's footprint: the wire must be within the slot opening.
        const slotClear = CARD.slotH / 2 - radius - Math.abs(y - CARD.slotY);
        worst = Math.min(worst, slotClear);
        expect(slotClear, `t=${i / 1000} y=${y.toFixed(3)} z=${z.toFixed(3)}`).toBeGreaterThan(-tol);
      }
    }
    expect(worst).toBeLessThan(0.02);
  });
});
