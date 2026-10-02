import { join } from 'node:path';
import type { Node } from '@gltf-transform/core';
import { describe, expect, it } from 'vitest';
import { Box3, BoxGeometry, Color, Euler, Matrix4, Mesh, Object3D, PointLight, Quaternion, SRGBColorSpace, Vector3 } from 'three';
import {
  BUSINESS_BOUNDS, BUSINESS_NODES, CARD, CARD_OFFSET_Y, FACE, GLOW, HOLDER_CLIPS, HOOK, hookCentreline, MM_PER_UNIT, PENDULUM, PRESS_DEPTH, READER, RIDE, SCANNER_POS,
  SLOT, STATUS_COLOURS, STATUS_PICTOGRAM, STATUS_PICTOGRAM_SIZE, STRAP_TUCK, STRAP_TAB_TOP, D_RING, type BusinessRig, type StatusLit,
} from '../models/business.ts';
import { darkPrint, DARK_PRINT, encodeEmission, PRINT_COBALT, STATUS_DIFFUSION, STATUS_ICON, statusGlyphField } from '../models/businessPrint.ts';
import { boxIn, createIO, findNode } from '../scripts/masters/compose.ts';
import { cameraDirection, createStageCamera, fitCameraToBounds } from '../src/render/camera.ts';
import { LIGHT_RIG } from '../src/render/lighting.ts';
import { DIRECTIONS, type MaterialLibrary } from '../src/render/materials.ts';
import { BusinessScene } from '../src/scenes/business/index.ts';
import { DURATIONS, HOOK_LIFT, HOST, POSE, SCAN_AT, SCAN_TILT } from '../src/scenes/business/poses.ts';
import {
  applyRecovery, blendReaderDepth, cardRotation, frameFor, HOST_BEATS, newFrame, OUTCOME_BEATS, planRecovery, RECOVER, recoveryFade, sampleSequence,
  STATUS_TIMING, statusEnvelope, type BusinessFrame, type Recovery,
} from '../src/scenes/business/sequences.ts';
import type { SequenceName } from '../src/core/types.ts';

const close = (a: BusinessFrame, b: BusinessFrame, eps = 1e-6) => {
  expect(a.pivot.distanceTo(b.pivot)).toBeLessThan(eps);
  expect(Math.abs(a.rot.angleTo(b.rot))).toBeLessThan(eps);
  expect(a.cardOffset.distanceTo(b.cardOffset)).toBeLessThan(eps);
  expect(Math.abs(a.cardTilt - b.cardTilt)).toBeLessThan(eps);
  expect(Math.abs(a.clipTilt - b.clipTilt)).toBeLessThan(eps);
  expect(Math.abs(a.swivel - b.swivel)).toBeLessThan(eps);
  expect(Math.abs(a.gate - b.gate)).toBeLessThan(eps);
  expect(Math.abs(a.glass - b.glass)).toBeLessThan(eps);
  expect(Math.abs(a.anchorX - b.anchorX)).toBeLessThan(eps);
  expect(Math.abs(a.anchorY - b.anchorY)).toBeLessThan(eps);
};

const at = (seq: SequenceName, t: number) => sampleSequence(seq, t, newFrame());
const X = new Vector3(1, 0, 0), Y = new Vector3(0, 1, 0);

/** World (business_root) transform of a frame's card: centre and rotation. */
function cardWorld(f: BusinessFrame): { centre: Vector3; rot: Quaternion } {
  const rot = f.rot.clone().multiply(cardRotation(f));
  return { centre: f.cardOffset.clone().applyQuaternion(f.rot).add(f.pivot), rot };
}
/** A card-space point in business_root space. */
const cardPoint = (f: BusinessFrame, p: Vector3) => {
  const { centre, rot } = cardWorld(f);
  return p.clone().applyQuaternion(rot).add(centre);
};
/** A hook-space point (clip_pivot) in business_root space. */
const hookPoint = (f: BusinessFrame, p: Vector3) => p.clone().applyAxisAngle(Y, f.swivel).applyAxisAngle(X, f.clipTilt).applyQuaternion(f.rot).add(f.pivot);

/** Every pose value the sequences drive, for continuity checks. */
const channels = (f: BusinessFrame) => [
  f.pivot.x, f.pivot.y, f.pivot.z, f.cardOffset.x, f.cardOffset.y, f.cardOffset.z, f.cardTilt, f.clipTilt, f.swivel, f.gate, f.glass, f.anchorX, f.anchorY,
];

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

  it('accept and decline share identical motion (only the status light differs)', () => {
    for (let t = 0; t <= 1.5; t += 0.05) close(at('accept', t), at('decline', t));
  });

  it('the indicator changes exactly once, at the contact beat, and its light ramps up from dark', () => {
    let changes = 0;
    let prev = at('accept', 0).status;
    for (let i = 1; i <= 1500; i++) {
      const s = at('accept', i / 1000).status;
      if (s !== prev) changes++;
      prev = s;
    }
    expect(changes).toBe(1);
    for (const seq of ['accept', 'decline'] as const) {
      expect(at(seq, SCAN_AT - 0.001).status, seq).toBe('off');
      expect(at(seq, SCAN_AT - 0.001).statusLevel, seq).toBe(0);
      expect(at(seq, SCAN_AT).status, seq).toBe('lit');
      // v1.5: the glyph never pops: the level starts from 0 and the first 16 ms frame after the
      // contact stays under 6 % of full (the HDR core reaches the tone curve's shoulder by 40 %).
      expect(at(seq, SCAN_AT).statusLevel, seq).toBe(0);
      expect(at(seq, SCAN_AT + 0.016).statusLevel, seq).toBeLessThan(0.06);
      expect(at(seq, DURATIONS[seq]).statusLevel, seq).toBe(1);
    }
    expect(frameFor('accepted', newFrame()).statusLevel).toBe(1);
    expect(frameFor('declined', newFrame()).statusLevel).toBe(1);
  });

  it('the status light is timed as a reader: accept comes up in 0.22 s and holds, decline blinks twice and holds', () => {
    const level = (seq: 'accept' | 'decline', tau: number) => at(seq, SCAN_AT + tau).statusLevel;
    const { attack } = STATUS_TIMING.accept;
    // Accept: a 0.2–0.3 s rise to full (above half by 0.11 s), then held.
    expect(attack).toBeGreaterThanOrEqual(0.2);
    expect(attack).toBeLessThanOrEqual(0.3);
    expect(level('accept', attack)).toBeCloseTo(1, 9);
    expect(level('accept', attack / 2)).toBeCloseTo(0.5, 6);
    let rising = true;
    for (let i = 1; i <= 1000 * attack; i++) rising &&= level('accept', i / 1000) > level('accept', (i - 1) / 1000);
    expect(rising, 'accept rises monotonically to full').toBe(true);
    for (let i = Math.ceil(1000 * attack); i <= 780; i++) expect(level('accept', i / 1000)).toBe(1);
    // Decline: two flashes (two rises through half), dark between them, then held lit.
    let rises = 0, darkest = Infinity;
    for (let i = 1; i <= 780; i++) {
      const a = level('decline', (i - 1) / 1000), b = level('decline', i / 1000);
      if (a < 0.5 && b >= 0.5) rises++;
      if (rises === 1 && b < 0.5) darkest = Math.min(darkest, b);
    }
    expect(rises).toBe(2);
    expect(darkest).toBe(0);
    const { rise, hold, fall, gap } = STATUS_TIMING.decline;
    const settled = rise + hold + fall + gap + rise;
    expect(settled).toBeLessThan(0.5);
    for (let i = Math.ceil(1000 * settled); i <= 780; i++) expect(level('decline', i / 1000)).toBe(1);
    // The dark gap is long enough to read as a blink at 60 fps (five frames or more).
    expect(gap + 0.2 * (rise + fall)).toBeGreaterThan(5 / 60);
    // C1: every edge is a smootherstep, so the level's slope never jumps (1 ms second differences).
    for (const seq of ['accept', 'decline'] as const) {
      let worst = 0;
      for (let i = 2; i <= 800; i++) {
        const a = level(seq, (i - 2) / 1000), b = level(seq, (i - 1) / 1000), c = level(seq, i / 1000);
        worst = Math.max(worst, Math.abs(c - 2 * b + a));
      }
      expect(worst, seq).toBeLessThan(0.0015);
    }
    // Pure in t.
    expect(statusEnvelope('decline', 0.2)).toBe(statusEnvelope('decline', 0.2));
  });

  it('has no discontinuities: consecutive 1 ms samples never jump', () => {
    for (const seq of ['host', 'accept', 'decline'] as const) {
      let prev = at(seq, 0);
      for (let i = 1; i <= DURATIONS[seq] * 1000; i++) {
        const cur = at(seq, i / 1000);
        expect(cur.pivot.distanceTo(prev.pivot)).toBeLessThan(0.02);
        expect(cur.rot.angleTo(prev.rot)).toBeLessThan(0.03);
        expect(cardRotation(cur).angleTo(cardRotation(prev))).toBeLessThan(0.03);
        expect(cur.cardOffset.distanceTo(prev.cardOffset)).toBeLessThan(0.02);
        expect(Math.abs(cur.anchorX - prev.anchorX)).toBeLessThan(0.02);
        expect(Math.abs(cur.gate - prev.gate)).toBeLessThan(0.05);
        prev = cur;
      }
    }
  });

  it('is C1 at every beat boundary: velocity never steps (except the released spring gate)', () => {
    // Second differences over 1 ms: a velocity step of Δv shows as Δv·1 ms. The bound allows the
    // curvature of the fastest authored arcs (|a| ≲ 200 u/s²) and nothing like a step.
    for (const seq of ['host', 'accept', 'decline'] as const) {
      let a = channels(at(seq, 0)), b = channels(at(seq, 0.001));
      for (let i = 2; i <= DURATIONS[seq] * 1000; i++) {
        const t = i / 1000;
        const c = channels(at(seq, t));
        c.forEach((v, k) => {
          if (k === 9 && seq === 'host' && Math.abs(t - HOST_BEATS.gate[0]) < 0.003) return; // gate release
          const d2 = Math.abs(v - 2 * b[k]! + a[k]!);
          // Angles (cardTilt, clipTilt, swivel) turn fastest, the spring gate faster still; a step of 1 rad/s would read
          // as 1e-3 here, a step of 0.8 u/s in position as 8e-4.
          expect(d2, `${seq} t=${t} channel ${k}`).toBeLessThan(k === 10 ? 1e-4 : k === 9 ? 2.5e-3 : k >= 6 && k <= 8 ? 1e-3 : 8e-4);
        });
        a = b;
        b = c;
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
});

describe('Business host attach on the master snap hook', () => {
  const hook = hookCentreline(0.003);
  /** Gate centreline (hook space) at a rotation, pin → tip. */
  const gate = (angle: number) => {
    const pts: Vector3[] = [];
    for (let s = 0.01; s <= HOOK.gateLength; s += 0.004) pts.push(new Vector3(0, -s, 0).applyAxisAngle(X, angle).add(HOOK.pin));
    return pts;
  };
  /** Hook-space point → card space for a frame. */
  const toCard = (f: BusinessFrame, p: Vector3) => {
    const clip = p.clone().applyAxisAngle(Y, f.swivel).applyAxisAngle(X, f.clipTilt);
    return clip.sub(f.cardOffset).applyQuaternion(cardRotation(f).invert());
  };

  it('never passes the hook wire or the gate through the holder: only through its slot', () => {
    // 0.3 mm at the badge's real size: the strip bears on the wire, so contact is the norm.
    const tol = 0.004;
    const slotMid = (SLOT.top + SLOT.bottom) / 2, slotHalf = (SLOT.top - SLOT.bottom) / 2;
    let worst = Infinity;
    for (let i = 0; i <= DURATIONS.host * 1000; i += 2) {
      const f = at('host', i / 1000);
      for (const [p, r] of [...hook.map((p) => [p, HOOK.tube] as const), ...gate(f.gate).map((p) => [p, HOOK.tube * 0.8] as const)]) {
        const q = toCard(f, p);
        const inSlab = Math.abs(q.z) < CARD.depth / 2 + r - tol;
        const inOutline = Math.abs(q.y) < CARD.height / 2 + r - tol && Math.abs(q.x) < CARD.width / 2 + r - tol;
        if (!inSlab || !inOutline) continue;
        // The wire is a swept circle: outside the holder's faces only the part of it that
        // reaches past the face counts (its section there has radius √(r² − d²)).
        const past = Math.abs(q.z) - CARD.depth / 2;
        const reach = past <= 0 ? r : Math.sqrt(Math.max(0, r * r - past * past));
        const clear = slotHalf - reach - Math.abs(q.y - slotMid);
        worst = Math.min(worst, clear);
        expect(clear, `t=${i / 1000} y=${q.y.toFixed(3)} z=${q.z.toFixed(3)}`).toBeGreaterThan(-tol);
      }
    }
    // The wire does go through the slot (the card really is clipped on).
    expect(worst).toBeLessThan(0.02);
  });

  it('hangs from the U: the slot rides on the hook bottom and the gate closes after the strip is in', () => {
    const f = at('host', DURATIONS.host);
    const rideHook = new Vector3(0, HOOK.arcY - HOOK.arcR, 0);
    expect(toCard(f, rideHook).distanceTo(RIDE)).toBeLessThan(1e-6);
    expect(at('host', HOST_BEATS.gate[0] - 0.001).gate).toBe(HOST.gateOpen);
    expect(at('host', HOST_BEATS.gate[1]).gate).toBe(0);
    // The hook turns back on its eye and on its swivel to take the card, and is home by the drop.
    expect(at('host', HOST_BEATS.present).clipTilt).toBeCloseTo(HOST.hookTilt, 6);
    expect(Math.abs(at('host', HOST_BEATS.hung).clipTilt)).toBeLessThan(1e-9);
    expect(Math.abs(at('host', HOST_BEATS.hung).swivel)).toBeLessThan(1e-9);
  });

  it('the offered laminate stays as far from the key light mirror angle as the scan pose (no white flash)', () => {
    // v1.2 offered the card face-up at 45° and only required 14°: the print washed pale for 0.3 s.
    const view = cameraDirection();
    const key = new Vector3(...LIGHT_RIG.key.position).normalize();
    const mirror = (n: Vector3) => (n.clone().multiplyScalar(2 * n.dot(view)).sub(view).angleTo(key) * 180) / Math.PI;
    for (let t = 0; t <= DURATIONS.host; t += 0.005) {
      const n = new Vector3(0, 0, 1).applyQuaternion(cardWorld(at('host', t)).rot);
      expect(mirror(n), `t=${t.toFixed(3)}`).toBeGreaterThan(40);
    }
  });

  it('the hook swings home over at least a quarter pendulum period, never faster than a free swing', () => {
    // Free swing of the badge pendulum from the 80° hold: peak ≈ 2·sqrt(g·d/k²)·sin(θ/2) ≈ 9 rad/s.
    const FREE_SWING = 9;
    const card = (t: number) => cardWorld(at('host', t)).rot;
    let hookPeak = 0, cardPeak = 0;
    for (let i = 0; i < DURATIONS.host * 1000; i++) {
      const a = at('host', i / 1000), b = at('host', (i + 1) / 1000);
      hookPeak = Math.max(hookPeak, Math.abs(b.clipTilt - a.clipTilt) * 1000);
      cardPeak = Math.max(cardPeak, card(i / 1000).angleTo(card((i + 1) / 1000)) * 1000);
    }
    expect(hookPeak).toBeLessThan(FREE_SWING);
    expect(cardPeak).toBeLessThan(FREE_SWING);
    // The swing from the hold to hanging (90 % → 10 % of the hook's tilt) lasts a quarter period or more.
    let t90 = NaN, t10 = NaN;
    for (let t = HOST_BEATS.entered; t <= DURATIONS.host; t += 0.001) {
      const c = at('host', t).clipTilt;
      if (Number.isNaN(t90) && c < 0.9 * HOST.hookTilt) t90 = t;
      if (Number.isNaN(t10) && c < 0.1 * HOST.hookTilt) t10 = t;
    }
    expect(t10 - t90).toBeGreaterThanOrEqual(0.25 / PENDULUM.pitchHz);
  });

  it('hands the offer straight on to the push, the slide and the swing: no near-stop between them', () => {
    // v1.2.1 came to rest at the end of the offer (0.30 s) and again at the end of the push
    // (0.42 s): 0.04 u/s, a stop-hop-stop. Each beat now hands its speed to the next.
    const centre = (t: number) => cardWorld(at('host', t)).centre;
    let peak = 0, low = Infinity, lowAt = 0;
    for (let t = 0.05; t <= HOST_BEATS.leg + 0.15; t += 1 / 120) {
      const v = centre(t + 1 / 120).distanceTo(centre(t)) * 120;
      peak = Math.max(peak, v);
      if (v < low) { low = v; lowAt = t; }
    }
    expect(low, `t=${lowAt.toFixed(3)}`).toBeGreaterThan(0.45);
    expect(low / peak).toBeGreaterThan(0.2);
  });

  it('never stalls: the card keeps moving from the lift until it hangs (no 80 ms hold)', () => {
    const centre = (t: number) => cardWorld(at('host', t)).centre;
    for (let t = 0; t + 0.08 <= HOST_BEATS.hung; t += 0.005) {
      let path = 0;
      for (let u = t; u < t + 0.08; u += 0.002) path += centre(u + 0.002).distanceTo(centre(u));
      expect(path, `t=${t.toFixed(3)}`).toBeGreaterThan(0.004);
    }
  });
});

describe('Business at the reader', () => {
  /** Signed distance from the (pressed) glass plane, business_root space. */
  const aboveGlass = (p: Vector3, glass = 0) => p.clone().sub(SCANNER_POS).sub(FACE.origin).dot(FACE.normal) - (FACE.glass - glass);
  /** Face-space (u, v) of a point. */
  const faceUV = (p: Vector3) => {
    const d = p.clone().sub(SCANNER_POS).sub(FACE.origin);
    return { u: d.x, v: d.dot(FACE.up) };
  };
  const onFace = (p: Vector3) => {
    const { u, v } = faceUV(p);
    return Math.abs(u) < FACE.gasketHalfWidth + 0.05 && v > -0.9 && v < 0.85;
  };
  const hook = hookCentreline(0.003);

  it('lays the card flat on the 11.6° glass, clips touching inside the glass, over the NFC mark', () => {
    const f = at('accept', OUTCOME_BEATS.contact);
    const n = new Vector3(0, 0, 1).applyQuaternion(cardWorld(f).rot);
    expect(n.angleTo(FACE.normal)).toBeLessThan(1e-4);
    expect(SCAN_TILT).toBeCloseTo(-FACE.lean, 9);
    const gaps = cardBack().map((p) => aboveGlass(cardPoint(f, p)));
    expect(Math.min(...gaps)).toBeGreaterThan(0);
    expect(Math.min(...gaps)).toBeLessThan(0.005);
    // The clips (what bears on the glass) are on the glass, 0.025 or more inside its edges.
    for (const p of clipPoints()) {
      const { u, v } = faceUV(cardPoint(f, p));
      expect(FACE.glassHalfWidth - Math.abs(u)).toBeGreaterThan(0.025);
      expect(FACE.glassY1 - v).toBeGreaterThan(0.025);
      expect(v - FACE.glassY0).toBeGreaterThan(0.025);
    }
    // The card covers the NFC mark's centre.
    const v = cardBack().map((p) => faceUV(cardPoint(f, p)).v);
    expect(Math.min(...v)).toBeLessThan(FACE.icon.y - 0.15);
    expect(Math.max(...v)).toBeGreaterThan(FACE.icon.y + 0.15);
  });

  it('the status pictogram stays in view below the pressed card, inside the glass, under the NFC mark', () => {
    // The glyph's box (stroke included) in face space, and its near halo two σ round it.
    const unit = STATUS_PICTOGRAM.grid / STATUS_ICON.grid, half = STATUS_ICON.stroke / 2;
    const ys = [...STATUS_ICON.accept, ...STATUS_ICON.decline].map(([, y]) => STATUS_PICTOGRAM.v - (y - STATUS_ICON.grid / 2) * unit);
    const xs = [...STATUS_ICON.accept, ...STATUS_ICON.decline].map(([x]) => (x - STATUS_ICON.grid / 2) * unit);
    const glow = 2 * STATUS_DIFFUSION.near.sigma * STATUS_ICON.stroke * unit;
    const top = Math.max(...ys) + half * unit, bottom = Math.min(...ys) - half * unit;
    // Below the NFC mark's arcs (the icon quad is 0.6 R square; its arcs fill the middle half).
    expect(top + glow).toBeLessThan(FACE.icon.y - 0.15);
    // Inside the window: the glyph and its near glow clear the glass's edges.
    expect(bottom - glow - FACE.glassY0).toBeGreaterThan(0.04);
    expect(FACE.glassHalfWidth - Math.max(...xs.map(Math.abs)) - half * unit - glow).toBeGreaterThan(0.2);
    // The light's carrying quad stays within the glass's width.
    expect(STATUS_PICTOGRAM_SIZE / 2).toBeLessThan(FACE.glassHalfWidth);
    // Through the press and hold the card's lowest point stays above the glyph and its glow, with
    // a margin for the camera's slant (the card sits a few mm proud of the glass).
    for (let t = OUTCOME_BEATS.contact; t <= OUTCOME_BEATS.depart; t += 0.01) {
      const f = at('accept', t);
      const low = Math.min(...cardBack().map((p) => faceUV(cardPoint(f, p)).v));
      expect(low - (top + glow), `t=${t.toFixed(2)}`).toBeGreaterThan(0.02);
    }
  });

  it('the press gives the glass 0.6 mm (the gasket takes it) and the card never passes into it', () => {
    let maxGlass = 0;
    for (let i = 600; i <= 1400; i++) {
      const f = at('accept', i / 1000);
      maxGlass = Math.max(maxGlass, f.glass);
      for (const p of cardBack()) {
        const w = cardPoint(f, p);
        if (onFace(w)) expect(aboveGlass(w, f.glass), `t=${i / 1000}`).toBeGreaterThan(-1e-5);
      }
    }
    expect(maxGlass).toBeCloseTo(PRESS_DEPTH, 6);
    expect(PRESS_DEPTH * MM_PER_UNIT).toBeCloseTo(0.6, 6);
    expect(PRESS_DEPTH).toBeLessThan(FACE.gasketFront - FACE.gasketBack);
  });

  it('the clip turns on the slot so the hook never passes into the reader', () => {
    expect(HOOK_LIFT).toBeGreaterThan(0.3);
    for (let i = 450; i <= 1500; i += 2) {
      const f = at('accept', i / 1000);
      for (const h of hook) {
        const w = hookPoint(f, h);
        if (onFace(w)) expect(aboveGlass(w, f.glass) - HOOK.tube, `t=${i / 1000}`).toBeGreaterThan(-1e-3);
      }
    }
  });

  it('the card at rest hangs clear of the reader body', () => {
    const rest = frameFor('accepted', newFrame());
    const right = Math.max(...cardBack().map((p) => cardPoint(rest, p).x));
    expect(right).toBeLessThan(SCANNER_POS.x - READER.width / 2 - 0.02);
  });

  it('pressed flat, the laminate never mirrors the key softbox into the lens (no print washout)', () => {
    const view = cameraDirection();
    const key = new Vector3(...LIGHT_RIG.key.position).normalize();
    const mirror = (n: Vector3) => (n.clone().multiplyScalar(2 * n.dot(view)).sub(view).angleTo(key) * 180) / Math.PI;
    for (const seq of ['accept', 'decline'] as const) {
      for (let t = 0.55; t <= 1.15; t += 0.01) {
        const n = new Vector3(0, 0, 1).applyQuaternion(cardWorld(at(seq, t)).rot);
        expect(mirror(n), `${seq} t=${t.toFixed(2)}`).toBeGreaterThan(40);
      }
    }
  });

  it('leaves the glass from rest and never outruns its approach; the strap anchor neither', () => {
    // v1.1's departure check, both outcomes: pivot and strap-anchor speeds sampled every millisecond.
    for (const seq of ['accept', 'decline'] as const) {
      const v: { t: number; pivot: number; anchor: number }[] = [];
      let prev = at(seq, 0);
      for (let i = 1; i <= DURATIONS[seq] * 1000; i++) {
        const cur = at(seq, i / 1000);
        v.push({ t: i / 1000, pivot: cur.pivot.distanceTo(prev.pivot) * 1000, anchor: Math.abs(cur.anchorX - prev.anchorX) * 1000 });
        prev = cur;
      }
      const approach = Math.max(...v.filter((s) => s.t <= OUTCOME_BEATS.contact).map((s) => s.pivot));
      const approachAnchor = Math.max(...v.filter((s) => s.t <= OUTCOME_BEATS.contact + 0.1).map((s) => s.anchor));
      const departure = v.filter((s) => s.t >= OUTCOME_BEATS.depart);
      expect(departure[0]!.pivot).toBeLessThan(0.05);
      expect(Math.max(...departure.map((s) => s.pivot))).toBeLessThanOrEqual(approach * 1.15);
      expect(Math.max(...departure.map((s) => s.anchor))).toBeLessThanOrEqual(approachAnchor * 1.15);
      for (let i = 1; i < departure.length; i++) {
        expect(Math.abs(departure[i]!.pivot - departure[i - 1]!.pivot), `${seq} t=${departure[i]!.t}`).toBeLessThan(0.25);
        expect(Math.abs(departure[i]!.anchor - departure[i - 1]!.anchor), `${seq} t=${departure[i]!.t}`).toBeLessThan(0.25);
      }
    }
  });

  it('the strap anchor trails the clip on the way to rest', () => {
    const scan = at('accept', 1.0);
    const rest = at('accept', DURATIONS.accept);
    for (let t = OUTCOME_BEATS.depart; t < DURATIONS.accept; t += 0.01) {
      const f = at('accept', t);
      const clip = (f.pivot.x - scan.pivot.x) / (rest.pivot.x - scan.pivot.x);
      const anchor = (f.anchorX - scan.anchorX) / (rest.anchorX - scan.anchorX);
      expect(anchor, `t=${t.toFixed(2)}`).toBeLessThanOrEqual(clip + 1e-9);
    }
  });

  it('every authored path stays inside the framing bounds', () => {
    const inside = (p: Vector3) => p.x >= BUSINESS_BOUNDS.min.x - 1e-6 && p.x <= BUSINESS_BOUNDS.max.x + 1e-6 && p.y >= -1e-6 && p.y <= BUSINESS_BOUNDS.max.y + 1e-6;
    for (const seq of ['host', 'accept'] as const) {
      for (let t = 0; t <= DURATIONS[seq]; t += 0.01) {
        const f = at(seq, t);
        for (const p of cardBack()) expect(inside(cardPoint(f, p)), `${seq} t=${t.toFixed(2)}`).toBe(true);
      }
    }
  });
});

/** The holder's back: its clips (the thickest part) and the clear holder's back face. */
function clipPoints(): Vector3[] {
  const pts: Vector3[] = [];
  for (const sx of [-1, 1]) {
    for (let j = 0; j <= 8; j++) pts.push(new Vector3(sx * HOLDER_CLIPS.x * 0.94, HOLDER_CLIPS.y0 + ((HOLDER_CLIPS.y1 - HOLDER_CLIPS.y0) * j) / 8, -HOLDER_CLIPS.halfDepth));
  }
  return pts;
}
function cardBack(): Vector3[] {
  const pts: Vector3[] = [];
  for (let i = 0; i <= 10; i++) {
    for (let j = 0; j <= 14; j++) pts.push(new Vector3((i / 10 - 0.5) * CARD.width, (j / 14 - 0.5) * CARD.height, -CARD.depth / 2));
  }
  return [...pts, ...clipPoints()];
}

describe('Business against the shipped reader (business.glb geometry, not analytic planes)', async () => {
  const doc = await createIO().read(join(import.meta.dirname, '..', 'assets', 'scenes', 'business', 'business.glb'));
  const faceNode = findNode(doc, 'scanner_face');
  const toFace = new Matrix4().fromArray(faceNode.getWorldMatrix()).invert();
  const padNode = findNode(doc, 'scanner_pad');
  /**
   * Height fields of the reader's front over the face's (u, v): the largest face-space w of any
   * shipped triangle at each 4 mm cell, rasterised from the GLB. `fixed` = body, steel bezel,
   * gasket and plinth; `pad` = the glass and what is printed on it (it gives at the press).
   */
  const STEP = 0.004, U0 = -0.6, V0 = -1.1, NU = 300, NV = 500;
  const field = () => new Float32Array(NU * NV).fill(-Infinity);
  const fixed = field(), pad = field();
  const raster = (into: Float32Array, a: Vector3, b: Vector3, c: Vector3) => {
    const i0 = Math.max(0, Math.floor((Math.min(a.x, b.x, c.x) - U0) / STEP)), i1 = Math.min(NU - 1, Math.ceil((Math.max(a.x, b.x, c.x) - U0) / STEP));
    const j0 = Math.max(0, Math.floor((Math.min(a.y, b.y, c.y) - V0) / STEP)), j1 = Math.min(NV - 1, Math.ceil((Math.max(a.y, b.y, c.y) - V0) / STEP));
    const d = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
    if (Math.abs(d) < 1e-12) return; // edge-on to the face: its neighbours carry it
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const x = U0 + (i + 0.5) * STEP, y = V0 + (j + 0.5) * STEP;
        const l1 = ((b.y - c.y) * (x - c.x) + (c.x - b.x) * (y - c.y)) / d;
        const l2 = ((c.y - a.y) * (x - c.x) + (a.x - c.x) * (y - c.y)) / d;
        const l3 = 1 - l1 - l2;
        if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
        const k = j * NU + i;
        into[k] = Math.max(into[k]!, l1 * a.z + l2 * b.z + l3 * c.z);
      }
    }
  };
  const inPad = (n: Node) => { for (let p: Node | null = n; p; p = p.getParentNode()) if (p === padNode) return true; return false; };
  const el = [0, 0, 0];
  findNode(doc, 'scanner_root').traverse((n) => {
    const mesh = n.getMesh();
    if (!mesh || n.getName().includes('shadow')) return;
    const m = toFace.clone().multiply(new Matrix4().fromArray(n.getWorldMatrix()));
    const into = inPad(n) ? pad : fixed;
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION')!;
      const idx = prim.getIndices();
      const vert = (i: number) => new Vector3(...(pos.getElement(i, el) as [number, number, number])).applyMatrix4(m);
      const count = idx ? idx.getCount() : pos.getCount();
      for (let t = 0; t + 2 < count; t += 3) {
        const [i, j, k] = idx ? [idx.getScalar(t), idx.getScalar(t + 1), idx.getScalar(t + 2)] : [t, t + 1, t + 2];
        raster(into, vert(i), vert(j), vert(k));
      }
    }
  });
  /** Front of the reader at a face-space (u, v): the max over the 3 × 3 cells round it (conservative). */
  const front = (f: Float32Array, u: number, v: number) => {
    const i = Math.floor((u - U0) / STEP), j = Math.floor((v - V0) / STEP);
    let w = -Infinity;
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      const ii = i + di, jj = j + dj;
      if (ii >= 0 && ii < NU && jj >= 0 && jj < NV) w = Math.max(w, f[jj * NU + ii]!);
    }
    return w;
  };
  /** Clearance of a business_root point (less `radius`) from the shipped reader's front, glass pressed in by `glass`. */
  const clearance = (p: Vector3, glass = 0, radius = 0) => {
    const q = p.clone().applyMatrix4(toFace);
    const wf = front(fixed, q.x, q.y), wp = front(pad, q.x, q.y) - glass;
    return q.z - radius - Math.max(wf, wp);
  };
  const hook = hookCentreline(0.004);

  it('the height field sees the master reader: glass at its plane, bezel lip proud of it', () => {
    expect(front(pad, 0, 0)).toBeCloseTo(FACE.glass, 3);
    expect(front(fixed, 0, FACE.glassY0 - 0.05)).toBeGreaterThan(FACE.glass + 0.005);
  });

  it('approach, press, hold and departure keep the card and the hook out of the shipped reader', () => {
    let worst = Infinity, worstAt = '';
    for (const seq of ['accept', 'decline'] as const) {
      for (let i = 150; i <= 1500; i += 2) {
        const f = at(seq, i / 1000);
        for (const p of cardBack()) {
          const c = clearance(cardPoint(f, p), f.glass);
          if (c < worst) { worst = c; worstAt = `${seq} t=${i / 1000} card`; }
        }
        for (const h of hook) {
          const c = clearance(hookPoint(f, h), f.glass, HOOK.tube);
          if (c < worst) { worst = c; worstAt = `${seq} t=${i / 1000} hook`; }
        }
      }
    }
    // Contact is the clips on the glass (the press closes the 0.2 mm hover gap): 0.05 mm tolerance.
    expect(worst, worstAt).toBeGreaterThan(-0.0007);
  });

  /** Every change of mind the guest can make: accept ↔ decline at every 20 ms, and from the settled poses. */
  const changes = () => {
    const out: { label: string; from: BusinessFrame; vel: Vector3; into: SequenceName }[] = [];
    for (const seq of ['accept', 'decline'] as const) {
      const into = seq === 'accept' ? 'decline' : 'accept';
      for (let t = 0.02; t < DURATIONS[seq]; t += 0.02) {
        const vel = at(seq, t).pivot.sub(at(seq, t - 0.001).pivot).multiplyScalar(1000);
        out.push({ label: `${seq}@${t.toFixed(2)}`, from: at(seq, t), vel, into });
      }
      out.push({ label: `${seq} settled`, from: frameFor(seq === 'accept' ? 'accepted' : 'declined', newFrame()), vel: new Vector3(), into });
    }
    return out;
  };
  const recovered = (r: Recovery, into: SequenceName, t: number) => applyRecovery(r, t, at(into, t));

  it('a change of mind starts at the pose on screen, with its velocity, and joins the new outcome C1', () => {
    const ready = frameFor('guest-ready', newFrame());
    for (const c of changes()) {
      const r = planRecovery(c.from, c.vel, c.into);
      // No cut: the first frame is the pose on screen.
      close(recovered(r, c.into, 0), c.from, 1e-6);
      // The eye leaves with the interrupted motion's velocity (scaled down only where it would carry
      // the badge into the reader: never below a quarter of it on the way in, and only near contact).
      const v0 = recovered(r, c.into, 1e-4).pivot.sub(recovered(r, c.into, 0).pivot).multiplyScalar(1e4);
      expect(v0.distanceTo(r.vel), c.label).toBeLessThan(0.05);
      // It ends exactly on the new outcome's path, with its velocity.
      close(recovered(r, c.into, RECOVER), at(c.into, RECOVER), 1e-6);
      const e = RECOVER - 1e-4;
      const vEnd = recovered(r, c.into, RECOVER).pivot.sub(recovered(r, c.into, e).pivot).multiplyScalar(1e4);
      const vAuth = at(c.into, RECOVER).pivot.sub(at(c.into, e).pivot).multiplyScalar(1e4);
      expect(vEnd.distanceTo(vAuth), c.label).toBeLessThan(0.05);
      // On its way it comes back by guest-ready (Master §6: through the ready pose): the eye turns
      // within 0.2 of it (a sixth of the card's height) as the new outcome sets off; cut short in
      // full flight, its momentum carries it a little wider.
      let nearest = Infinity;
      for (let t = 0; t <= RECOVER; t += 0.005) nearest = Math.min(nearest, recovered(r, c.into, t).pivot.distanceTo(ready.pivot));
      expect(nearest, c.label).toBeLessThan(c.vel.length() < 2 ? 0.2 : 0.24);
    }
  });

  it('a change of mind never jumps: 1 ms steps stay small and the velocity never steps', () => {
    for (const c of changes()) {
      const r = planRecovery(c.from, c.vel, c.into);
      let a = recovered(r, c.into, 0), b = recovered(r, c.into, 0.001);
      for (let i = 2; i <= RECOVER * 1000 + 2; i++) {
        const cur = recovered(r, c.into, i / 1000);
        expect(cur.pivot.distanceTo(b.pivot), `${c.label} t=${i}`).toBeLessThan(0.012);
        expect(cur.rot.angleTo(b.rot), `${c.label} t=${i}`).toBeLessThan(0.02);
        const d2 = cur.pivot.clone().sub(b.pivot).sub(b.pivot.clone().sub(a.pivot)).length();
        expect(d2, `${c.label} t=${i}`).toBeLessThan(4e-4);
        a = b;
        b = cur;
      }
      // The interrupted outcome's light fades out over the first 60 % of the recovery.
      expect(recoveryFade(0)).toBe(1);
      expect(recoveryFade(0.6 * RECOVER)).toBe(0);
    }
  });

  it('every change of mind keeps the card and the hook out of the shipped reader', () => {
    // v1.2 blended straight through the glass (8–12 mm); v1.2.1 cut instead (a 20.7 frame jump).
    let worst = Infinity, worstAt = '', peeled = 0;
    for (const c of changes()) {
      const r = planRecovery(c.from, c.vel, c.into);
      if (r.peel > 0) peeled++;
      for (let t = 0; t <= RECOVER; t += 0.004) {
        const f = recovered(r, c.into, t);
        for (const p of cardBack()) {
          const k = clearance(cardPoint(f, p), f.glass);
          if (k < worst) { worst = k; worstAt = `${c.label} t=${t.toFixed(3)} card`; }
        }
        for (const h of hook) {
          const k = clearance(hookPoint(f, h), f.glass, HOOK.tube);
          if (k < worst) { worst = k; worstAt = `${c.label} t=${t.toFixed(3)} hook`; }
        }
      }
    }
    // As at the press: the clips may bear on the glass (0.05 mm tolerance), nothing goes in.
    expect(worst, worstAt).toBeGreaterThan(-0.0007);
    expect(peeled).toBeGreaterThan(40);
    // The peel is decided by the straight blend measured against the reader as a solid.
    expect(blendReaderDepth(at('accept', 0.9))).toBeGreaterThan(0);
    expect(planRecovery(at('accept', 0.9), new Vector3(), 'decline').peel).toBeGreaterThan(0.1);
    expect(planRecovery(frameFor('accepted', newFrame()), new Vector3(), 'decline').peel).toBe(0);
  });
});

describe('Business physics and status', () => {
  it('swings as a physical pendulum of the master card (about 1.8 Hz on the swivel)', () => {
    const m = MM_PER_UNIT / 1000;
    const d = -CARD_OFFSET_Y * m;
    // A plate's in-plane swing is always slower than a point mass at its centre, and close to it.
    const simple = Math.sqrt(9.81 / d) / (2 * Math.PI);
    expect(PENDULUM.swingHz).toBeLessThan(simple);
    expect(PENDULUM.swingHz).toBeGreaterThan(1.5);
    expect(PENDULUM.pitchHz).toBeGreaterThan(PENDULUM.swingHz);
    expect(PENDULUM.damping).toBeGreaterThan(0.2);
    expect(PENDULUM.damping).toBeLessThan(0.7);
  });

  it('the status colours are the shell’s two statuses, lit: hue for hue, green brighter than red', () => {
    const hue = (hex: string) => {
      const c = new Color(hex).getHSL({ h: 0, s: 0, l: 0 }, SRGBColorSpace);
      return c.h * 360;
    };
    const dHue = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
    // DESIGN.md: Saved Pine #176B42 (Accept), Garnet #A62D36 (Decline). The green is Pine's own hue;
    // the red is a red LED's, a few degrees warm of Garnet's pigment hue, with more green than blue,
    // so its overdriven core rolls off warm in the tone curve rather than pink.
    expect(dHue(hue(STATUS_COLOURS.accept), hue('#176B42'))).toBeLessThan(3);
    expect(dHue(hue(STATUS_COLOURS.decline), hue('#A62D36'))).toBeLessThan(10);
    const red = new Color(STATUS_COLOURS.decline);
    expect(red.g).toBeGreaterThan(red.b);
    // Lit versions: far lighter than the UI's (which sit at 6.5–6.9:1 on white).
    const lum = (hex: string) => { const c = new Color(hex); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; };
    expect(lum(STATUS_COLOURS.accept)).toBeGreaterThan(4 * lum('#176B42'));
    expect(lum(STATUS_COLOURS.decline)).toBeGreaterThan(2 * lum('#A62D36'));
    // The pair differs in value as well as hue, also under deuteranopia (Machado 2009, severity 1).
    const deutLum = (hex: string) => {
      const c = new Color(hex);
      const r = 0.367322 * c.r + 0.860646 * c.g - 0.227968 * c.b;
      const g = 0.280085 * c.r + 0.672501 * c.g + 0.047413 * c.b;
      const b = -0.01182 * c.r + 0.04294 * c.g + 0.968881 * c.b;
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    expect((lum(STATUS_COLOURS.accept) + 0.05) / (lum(STATUS_COLOURS.decline) + 0.05)).toBeGreaterThanOrEqual(2);
    expect((deutLum(STATUS_COLOURS.accept) + 0.05) / (deutLum(STATUS_COLOURS.decline) + 0.05)).toBeGreaterThanOrEqual(1.75);
  });

  it('the pictogram’s light is HDR: the stroke core rolls off in the tone curve, the halo keeps the token', () => {
    // Neutral tone mapping starts compressing at 0.76 (three's NeutralToneMapping); the rig's
    // exposure is 1.15 (neutral-room). The core passes the shoulder at full level (it rolls off a
    // little towards white: the hotspot) but not by so much that it clips flat (v1.5's first cut,
    // 4.2 and 5, pinned the whole stroke at one near-white value), and it reaches the shoulder by
    // 40 % of full, which is why the ramps are perceptual (STATUS_TIMING). One stroke out from the
    // glyph the halo sits under it (it keeps the token's colour); two strokes out it has nearly gone.
    const exposure = 1.15, shoulder = 0.76;
    for (const k of ['accept', 'decline'] as const) {
      const c = new Color(STATUS_COLOURS[k]);
      const peak = Math.max(c.r, c.g, c.b) * GLOW.glyph[k] * exposure;
      expect(peak, k).toBeGreaterThan(2.5 * shoulder);
      expect(peak, k).toBeLessThan(5 * shoulder);
      expect(peak * 0.4, k).toBeGreaterThan(shoulder);
      const f = statusGlyphField(k, 512, STATUS_PICTOGRAM.extent);
      // Sample along the vertical through the glyph's centre column, outward from the stroke.
      const texel = STATUS_PICTOGRAM.extent / 512;
      const at1 = (units: number) => f.data[Math.round((STATUS_PICTOGRAM.extent / 2 + units) / texel) * 512 + 256]!;
      // The minus's stroke is the row y = 10; the check passes x = 10 at y ≈ 12.
      const y0 = k === 'decline' ? 0 : 1.9;
      const out1 = at1(y0 + STATUS_ICON.stroke * 1.5), out2 = at1(y0 + STATUS_ICON.stroke * 2.5);
      expect(Math.max(c.r, c.g, c.b) * GLOW.glyph[k] * exposure * out1, `${k} halo`).toBeLessThan(shoulder);
      expect(out2 / f.peak, `${k} far`).toBeLessThan(0.05);
    }
    // Decline runs higher: the minus has less stroke and red less luminance.
    expect(GLOW.glyph.decline).toBeGreaterThan(GLOW.glyph.accept);
  });

  it('the scene drives the rig status, rise and press from the authored frame', () => {
    const calls: { lit: StatusLit; level: number; press: number }[] = [];
    let press = 0;
    const names = ['card_authored', 'card_secondary', 'card_mesh', 'clip_pivot', 'lanyard_anchor'];
    const nodes = Object.fromEntries(names.map((n) => [n, new Object3D()]));
    const root = new Object3D();
    nodes.card_authored!.add(nodes.card_secondary!);
    nodes.card_secondary!.add(nodes.card_mesh!, nodes.clip_pivot!);
    root.add(nodes.card_authored!, nodes.lanyard_anchor!);
    const rig: BusinessRig = {
      root, nodes, bounds: new Box3(), shadows: [{ setFootprint() {}, setHeight() {} } as never], gate: null,
      updateLanyard() {}, setTemplate() {}, dispose() {},
      setStatus(lit, level) { calls.push({ lit, level, press }); },
      setPress(d) { press = d; },
    };
    const scene = new BusinessScene(rig, { direction: DIRECTIONS.L2 } as MaterialLibrary, { category: 'business', template: 'light' });
    scene.pose('accepted');
    expect(calls.at(-1)).toMatchObject({ lit: 'accept', level: 1 });
    scene.pose('declined');
    expect(calls.at(-1)).toMatchObject({ lit: 'decline', level: 1 });
    scene.pose('guest-ready');
    expect(calls.at(-1)!.lit).toBe('off');
    scene.sample('accept', SCAN_AT + 0.1);
    expect(calls.at(-1)!.lit).toBe('accept');
    expect(calls.at(-1)!.level).toBeGreaterThan(0.2);
    expect(calls.at(-1)!.level).toBeLessThan(1);
    scene.sample('accept', (OUTCOME_BEATS.contact + 0.86) / 2);
    expect(press).toBeCloseTo(PRESS_DEPTH, 6);
    scene.sample('decline', 1.5);
    expect(calls.at(-1)).toMatchObject({ lit: 'decline', level: 1 });
    expect(press).toBe(0);
    // A change of mind at the reader: the scene takes the director's cut and starts the new outcome
    // from the pose on screen, its light fading (no jump, no pop).
    const mid = (OUTCOME_BEATS.contact + 0.86) / 2;
    scene.sample('accept', mid);
    const pressed = nodes.card_authored!.position.clone();
    const shown = calls.at(-1)!.level;
    expect(scene.interruptCut()).toBe(true);
    scene.settle();
    scene.pose('guest-ready');
    scene.sample('decline', 0);
    expect(nodes.card_authored!.position.distanceTo(pressed)).toBeLessThan(1e-9);
    expect(calls.at(-1)).toMatchObject({ lit: 'accept', level: shown });
    expect(press).toBeCloseTo(PRESS_DEPTH, 6);
    scene.sample('decline', RECOVER / 2);
    expect(nodes.card_authored!.position.distanceTo(pressed)).toBeGreaterThan(0.3);
    expect(calls.at(-1)!.level).toBeLessThan(shown);
    expect(press).toBe(0);
    scene.sample('decline', RECOVER);
    expect(calls.at(-1)!.lit).toBe('off');
    // Any other pose drops a planned recovery.
    scene.sample('accept', 0.9);
    scene.interruptCut();
    scene.pose('accepted');
    scene.sample('decline', 0);
    expect(nodes.card_authored!.position.distanceTo(frameFor('guest-ready', newFrame()).pivot)).toBeLessThan(1e-9);
    void PointLight;
  });

  it('the pictogram draws the shell’s own check and minus: one weight, one envelope, shape not only colour', async () => {
    // The shell's icons (src/ui/guestControls.ts), parsed: the check's three points and the stroke.
    const { readFile } = await import('node:fs/promises');
    const ui = await readFile(join(import.meta.dirname, '..', 'src', 'ui', 'guestControls.ts'), 'utf8');
    const check = /check: '[^']*d="M([^"]+)"[^']*stroke-width="([\d.]+)"/.exec(ui)!;
    const [x0, y0, dx1, dy1, dx2, dy2] = [...check[1]!.matchAll(/-?\d*\.?\d+/g)].map((m) => Number(m[0])) as [number, number, number, number, number, number];
    const w = Number(check[2]);
    expect(STATUS_ICON.accept).toEqual([[x0, y0], [x0 + dx1, y0 + dy1], [x0 + dx1 + dx2, y0 + dy1 + dy2]]);
    expect(STATUS_ICON.stroke).toBe(w);
    const minus = /minus: '[^']*d="M([\d.]+) ([\d.]+)h([\d.]+)"[^']*stroke-width="([\d.]+)"/.exec(ui)!;
    const [mx, my, mh, mw] = minus.slice(1).map(Number) as [number, number, number, number];
    expect(STATUS_ICON.decline).toEqual([[mx, my], [mx + mh, my]]);
    expect(mw).toBe(w);
    // One envelope: the minus (the shell's 10 units) within 10 % of the check's span, on the grid's
    // centre line; both are centred on the grid by their boxes.
    const box = (pts: readonly (readonly [number, number])[]) => {
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    };
    const a = box(STATUS_ICON.accept), d = box(STATUS_ICON.decline);
    expect(Math.abs(d.x1 - d.x0 - (a.x1 - a.x0)) / (a.x1 - a.x0)).toBeLessThan(0.1);
    expect((d.x0 + d.x1) / 2).toBe(STATUS_ICON.grid / 2);
    expect((a.x0 + a.x1) / 2).toBe(STATUS_ICON.grid / 2);
    expect((a.y0 + a.y1) / 2).toBe(STATUS_ICON.grid / 2);
    expect(d.y0).toBe(STATUS_ICON.grid / 2);
    // Shape without colour: the check stands several times the minus's height (stroke included).
    expect(a.y1 - a.y0 + STATUS_ICON.stroke).toBeGreaterThan(4 * (d.y1 - d.y0 + STATUS_ICON.stroke));
    // On the glass: 1.8 mm strokes at the card's real scale, a hair under the NFC mark's printed
    // 0.0236 (one stroke weight on the face; a lit stroke reads a little bolder).
    const stroke = (STATUS_ICON.stroke * STATUS_PICTOGRAM.grid) / STATUS_ICON.grid;
    expect(stroke * MM_PER_UNIT).toBeGreaterThan(1.6);
    expect(stroke * MM_PER_UNIT).toBeLessThan(2);
    expect(stroke).toBeLessThan(0.0236);
    expect(stroke).toBeGreaterThan(0.0236 * 0.95);
  });

  it('the glyph field is crisp, soft-edged and deterministic, and fades to nothing at its quad’s edge', () => {
    for (const k of ['accept', 'decline'] as const) {
      const f = statusGlyphField(k, 512, STATUS_PICTOGRAM.extent);
      expect([...encodeEmission(f)]).toEqual([...encodeEmission(statusGlyphField(k, 512, STATUS_PICTOGRAM.extent))]);
      // Resolution: 30+ texels across a stroke.
      expect(STATUS_ICON.stroke / (STATUS_PICTOGRAM.extent / 512)).toBeGreaterThan(30);
      // The quad's border is dark: every border texel encodes to 0.
      const bytes = encodeEmission(f);
      let border = 0;
      for (let i = 0; i < 512; i++) for (const t of [i, 511 * 512 + i, i * 512, i * 512 + 511]) border = Math.max(border, bytes[t * 4]!);
      expect(border, k).toBe(0);
      // Crisp edge: across the minus's lower edge (or the check's column through x = 10) the light
      // falls from 80 % to 30 % of the core within a third of a stroke.
      const texel = STATUS_PICTOGRAM.extent / 512;
      const col = 256, start = Math.round((STATUS_PICTOGRAM.extent / 2 + (k === 'decline' ? 0 : 1.9)) / texel);
      const core = f.data[start * 512 + col]!;
      let j80 = -1, j30 = -1;
      for (let j = start; j < 512; j++) {
        const v = f.data[j * 512 + col]! / core;
        if (j80 < 0 && v < 0.8) j80 = j;
        if (j30 < 0 && v < 0.3) { j30 = j; break; }
      }
      expect((j30 - j80) * texel, k).toBeLessThan(STATUS_ICON.stroke / 3);
      expect((j30 - j80) * texel, k).toBeGreaterThan(0);
    }
  });

  it('the strap strands start inside the sewn tab, so their open ends never show', () => {
    expect(STRAP_TUCK).toBeGreaterThan(0.02);
    expect(STRAP_TAB_TOP - STRAP_TUCK).toBeGreaterThan(D_RING.topY + D_RING.wire + 0.02);
  });

  it('pointer drag hit-tests the holder geometry, and only the holder', () => {
    const names = ['card_authored', 'card_secondary', 'card_mesh', 'clip_pivot', 'lanyard_anchor'];
    const nodes = Object.fromEntries(names.map((n) => [n, new Object3D()]));
    const root = new Object3D();
    nodes.card_authored!.add(nodes.card_secondary!);
    nodes.card_secondary!.add(nodes.card_mesh!, nodes.clip_pivot!);
    root.add(nodes.card_authored!, nodes.lanyard_anchor!);
    nodes.card_mesh!.add(new Mesh(new BoxGeometry(CARD.width, CARD.height, CARD.depth)));
    const rig: BusinessRig = {
      root, nodes, bounds: new Box3(new Vector3(-1, 0, -0.6), new Vector3(1.4, 2.6, 0.6)), shadows: [{ setFootprint() {}, setHeight() {} } as never], gate: null,
      updateLanyard() {}, setTemplate() {}, dispose() {}, setStatus() {}, setPress() {},
    };
    const scene = new BusinessScene(rig, { direction: DIRECTIONS.L2 } as MaterialLibrary, { category: 'business', template: 'light' });
    scene.pose('guest-ready');
    root.updateMatrixWorld(true);
    const camera = createStageCamera();
    fitCameraToBounds(camera, rig.bounds, 1);
    const c = new Vector3().setFromMatrixPosition(nodes.card_mesh!.matrixWorld).project(camera);
    expect(scene.pointer.hitTest(c.x, c.y, camera)).toBe(true);
    expect(scene.pointer.hitTest(c.x + 0.6, c.y, camera)).toBe(false);
    const rect = scene.pointer.screenRect(camera)!;
    expect(rect[0]).toBeLessThan(c.x);
    expect(rect[2]).toBeGreaterThan(c.x);
  });
});

describe('Business dark template print', () => {
  it('maps the master print deterministically: stock → ink, black type → warm white, cobalt kept', () => {
    const px = [[255, 255, 255], [0, 0, 0], [...PRINT_COBALT], [128, 128, 128]];
    const img = { data: new Uint8Array(px.flat()), width: 4, height: 1, channels: 3 as const };
    const out = darkPrint(img).data;
    expect([...out.slice(0, 3)]).toEqual([...DARK_PRINT.ink]);
    expect([...out.slice(3, 6)]).toEqual([...DARK_PRINT.type]);
    expect([...out.slice(6, 9)]).toEqual([...DARK_PRINT.cobalt]);
    expect([...darkPrint(img).data]).toEqual([...out]);
    // Legibility: warm-white type on the ink field is far above 7:1.
    const lum = (c: readonly number[]) => c.map((v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i]!, 0);
    expect((lum(DARK_PRINT.type) + 0.05) / (lum(DARK_PRINT.ink) + 0.05)).toBeGreaterThan(7);
    expect((lum(DARK_PRINT.cobalt) + 0.05) / (lum(DARK_PRINT.ink) + 0.05)).toBeGreaterThan(3);
  });
});

describe('Business runtime GLB matches the contract', async () => {
  const doc = await createIO().read(join(import.meta.dirname, '..', 'assets', 'scenes', 'business', 'business.glb'));
  const node = (name: string) => findNode(doc, name);
  const size = (b: { min: Vector3; max: Vector3 }) => b.max.clone().sub(b.min);
  const mid = (b: { min: Vector3; max: Vector3 }) => b.max.clone().add(b.min).multiplyScalar(0.5);
  const local = (n: Node) => new Matrix4().compose(new Vector3(...n.getTranslation()), new Quaternion(...n.getRotation()), new Vector3(...n.getScale()));

  it('has every contract node exactly once, as empty transforms with unit scale where they move', () => {
    for (const n of BUSINESS_NODES) expect(() => node(n), n).not.toThrow();
    for (const n of ['card_secondary', 'clip_pivot', 'card_mesh', 'clip_gate', 'scanner_pad', 'scanner_gasket', 'scanner_light', 'scanner_glow']) {
      expect(node(n).getMesh(), n).toBeNull();
      expect(node(n).getScale(), n).toEqual([1, 1, 1]);
    }
  });

  it('the badge hangs on the swivel eye: holder size, offset and the hook as measured', () => {
    expect(new Vector3(...node('clip_pivot').getTranslation()).length()).toBeLessThan(1e-6);
    expect(new Vector3(...node('card_mesh').getTranslation()).distanceTo(new Vector3(0, CARD_OFFSET_Y, 0))).toBeLessThan(1e-4);
    const holder = boxIn(node('card_holder_clear'), node('card_mesh'));
    expect(size(holder).x).toBeCloseTo(0.496 * 1.5, 3);
    expect(size(holder).y).toBeCloseTo(CARD.height, 3);
    expect(size(holder).z).toBeCloseTo(CARD.depth, 3);
    expect(mid(holder).length()).toBeLessThan(2e-3);
    const clips = boxIn(node('holder_clip_left'), node('card_mesh'));
    expect(-clips.min.z).toBeCloseTo(HOLDER_CLIPS.halfDepth, 3);
    expect(-clips.min.x).toBeCloseTo(HOLDER_CLIPS.x, 3);
    expect(new Vector3(...node('clip_gate').getTranslation()).distanceTo(HOOK.pin)).toBeLessThan(1e-4);
    const hook = boxIn(node('clip_pivot'), node('clip_pivot'));
    expect(hook.min.y).toBeCloseTo(HOOK.bottom, 3);
    expect(hook.min.z).toBeCloseTo(HOOK.back, 3);
    // The D-ring and the strap stitching stay with card_authored (they do not swing).
    expect(node('d_ring').getParentNode()).toBe(node('card_authored'));
    expect(node('strap_stitching').getParentNode()).toBe(node('card_authored'));
  });

  it('the reader stands on its plinth with the reading face, glass, gasket and LED as measured', () => {
    const reader = boxIn(node('scanner_root'), node('scanner_root'));
    expect(reader.min.y).toBeCloseTo(0, 3);
    expect(size(reader).y).toBeCloseTo(READER.height, 2);
    expect(size(reader).x).toBeCloseTo(READER.width, 3);
    const face = node('scanner_face');
    expect(new Vector3(...face.getTranslation()).distanceTo(FACE.origin)).toBeLessThan(1e-4);
    expect(Y.clone().applyQuaternion(new Quaternion(...face.getRotation())).angleTo(FACE.up)).toBeLessThan(1e-3);
    const glass = boxIn(node('scanner_pad_mesh'), node('scanner_face'));
    expect(glass.max.z).toBeCloseTo(FACE.glass, 3);
    expect(glass.max.x).toBeCloseTo(FACE.glassHalfWidth, 3);
    const gasket = boxIn(node('scanner_gasket'), node('scanner_face'));
    expect(gasket.min.z).toBeCloseTo(FACE.gasketBack, 3);
    expect(gasket.max.z).toBeCloseTo(FACE.gasketFront, 3);
    expect(node('scanner_gasket').getTranslation()[2]).toBeCloseTo(FACE.gasketBack, 4);
    const led = boxIn(node('scanner_light'), node('scanner_face'));
    expect(led.max.x).toBeCloseTo(FACE.ledHalfWidth, 3);
    expect(led.min.y).toBeCloseTo(FACE.ledY0, 3);
    expect(led.max.y).toBeCloseTo(FACE.ledY1, 3);
    expect(local(node('scanner_glow')).elements[13]).toBeCloseTo(FACE.led.y, 4);
  });

  it('carries the templates as material variants and the print at source size', () => {
    const json = doc.getRoot().listExtensionsUsed().map((e) => e.extensionName);
    expect(json).toContain('KHR_materials_variants');
    const mats = doc.getRoot().listMaterials().map((m) => m.getName());
    for (const m of ['badge_card_print', 'badge_card_print_dark', 'badge_card_stock', 'badge_card_stock_dark', 'badge_strap', 'badge_vinyl', 'reader_led', 'reader_led_glow']) {
      expect(mats, m).toContain(m);
    }
    const print = doc.getRoot().listMaterials().find((m) => m.getName() === 'badge_card_print_dark')!;
    expect(print.getBaseColorTexture()!.getSize()).toEqual([2048, 1536]);
    const vinyl = doc.getRoot().listMaterials().find((m) => m.getName() === 'badge_vinyl')!;
    expect(vinyl.getAlphaMode()).toBe('BLEND');
    expect(vinyl.getAlpha()).toBeCloseTo(0.35, 6);
  });

  it('the chrome hardware is the master’s (roughness 0.3, base 0.86): no studio regrade', () => {
    const chrome = doc.getRoot().listMaterials().find((m) => m.getName() === 'badge_chrome')!;
    expect(chrome.getRoughnessFactor()).toBeCloseTo(0.3, 3);
    for (const k of chrome.getBaseColorFactor().slice(0, 3)) expect(k).toBeGreaterThan(0.8);
  });
});
