import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import type { Node as GltfNode } from '@gltf-transform/core';
import { listTextureSlots } from '@gltf-transform/functions';
import { Box3, type BufferGeometry, Matrix4, type Mesh, MeshPhysicalMaterial, MeshStandardMaterial, type Object3D, OrthographicCamera, Quaternion, Vector3 } from 'three';
import { boxIn, createIO, findNode, MASTERS_DIR } from '../scripts/masters/compose.ts';
import { loadSharp } from '../scripts/masters/sharp.ts';
import {
  armPoint, CONTACT_PITCH, CUE, fromMaster, LID, LID_CLOSED_BOX, PARTY_BOUNDS, PARTY_NODES, PLATTER, PLATTER_TOP, PLAYER, RECORD, RECORD_SEATED,
  RECORD_TOP, STATUS_KEY, stylusAt, TONEARM, tonearmYawFor, TT_SCALE,
} from '../models/recordContract.ts';
import { extendLid, LID_LOOK, splitLidInterior, type RecordPlayerRig } from '../models/recordPlayer.ts';
import { fitCameraToBounds } from '../src/render/camera.ts';
import { PartyScene, partyFramePoints } from '../src/scenes/party/index.ts';
import { VisualDirector } from '../src/core/visualDirector.ts';
import { FixedStepper } from '../src/motion/spring.ts';
import { ACCEPT_ARM, ARM, COAST, DURATIONS, HOVER, LEVEL_BY, LID_CLOSED, LID_OPEN, PLAY_AT, RPM_33, SPIN, TILT_MAX_SHEEN } from '../src/scenes/party/poses.ts';
import { labelPrint } from '../scripts/masters/recipes/party.ts';
import {
  ACCEPT_PLATTER, ACCEPTED_AT, blendLift, type Change, CONTACT_AT, DISPLAY_ANGLE, STYLUS_DOWN, frameFor, newFrame, platterAt, platterFor, playingFrame, RELEASE_AT, sampleSequence, SETTLE, settleTilt, STEADY,
  type PartyFrame,
} from '../src/scenes/party/sequences.ts';
import type { CanonicalPose, SequenceName } from '../src/core/types.ts';
import { readPartyDoc, threeFromDoc } from './partyGlb.ts';

const at = (seq: SequenceName, t: number) => sampleSequence(seq, t, newFrame());
const pose = (p: CanonicalPose) => frameFor(p, newFrame());
const CHANNELS = ['recordTilt', 'wobble', 'wobbleZ', 'spin', 'armYaw', 'armPitch', 'lid'] as const;

function close(a: PartyFrame, b: PartyFrame, eps = 1e-6) {
  expect(a.recordPos.distanceTo(b.recordPos)).toBeLessThan(eps);
  for (const k of CHANNELS) expect(Math.abs(a[k] - b[k]), k).toBeLessThan(eps);
  expect(a.status).toBe(b.status);
}

/**
 * The record's true tilt from level: the presentation tilt, or the settle's tilt vector. cos θ =
 * cos x·cos z, evaluated as sin²θ = sin²x + sin²z·cos²x (acos loses 1e-8 rad near level).
 */
const tiltOf = (f: PartyFrame) => {
  const x = f.recordTilt + f.wobble, sx = Math.sin(x), sz = Math.sin(f.wobbleZ) * Math.cos(x);
  return Math.asin(Math.min(1, Math.sqrt(sx * sx + sz * sz)));
};

describe('Party choreography', () => {
  it('host starts at host-ready and ends exactly at guest-ready', () => {
    close(at('host', 0), pose('host-ready'));
    close(at('host', DURATIONS.host), pose('guest-ready'));
  });

  it('accept and decline start at guest-ready and end at their canonical poses', () => {
    close(at('accept', 0), pose('guest-ready'));
    close(at('decline', 0), pose('guest-ready'));
    close(at('decline', DURATIONS.decline), pose('declined'));
    // Accept hands over to the record playing on (the lead-in still drawing the arm in); the
    // canonical accepted pose is that play once the lead-in is done.
    close(at('accept', DURATIONS.accept), playingFrame(ACCEPT_PLATTER, DURATIONS.accept, newFrame()));
    close(playingFrame(ACCEPT_PLATTER, ACCEPTED_AT, newFrame()), pose('accepted'));
  });

  it('has no discontinuities: consecutive 1 ms samples never jump', () => {
    for (const seq of ['host', 'accept', 'decline'] as const) {
      let prev = at(seq, 0);
      for (let i = 1; i <= DURATIONS[seq] * 1000; i++) {
        const cur = at(seq, i / 1000);
        expect(cur.recordPos.distanceTo(prev.recordPos)).toBeLessThan(0.01);
        for (const k of CHANNELS) expect(Math.abs(cur[k] - prev[k]), `${seq} ${k} ${i} ms`).toBeLessThan(0.02);
        prev = cur;
      }
    }
  });

  it('is C1 everywhere: no channel changes speed by more than 10 % of its peak in 0.5 ms (beat boundaries included)', () => {
    const dt = 0.0005;
    const values = (f: PartyFrame) => [f.recordPos.x, f.recordPos.y, f.recordPos.z, ...CHANNELS.map((k) => f[k])];
    for (const seq of ['host', 'accept', 'decline'] as const) {
      const n = Math.round(DURATIONS[seq] / dt);
      const xs = Array.from({ length: n + 1 }, (_, i) => values(at(seq, i * dt)));
      for (let c = 0; c < xs[0]!.length; c++) {
        const v = xs.slice(1).map((x, i) => (x[c]! - xs[i]![c]!) / dt);
        const peak = Math.max(...v.map(Math.abs));
        if (peak === 0) continue;
        // Starts and ends at rest (canonical poses are still), except the accepted record, which
        // plays on (its hand-over is checked below).
        expect(Math.abs(v[0]!), `${seq} channel ${c} starts at rest`).toBeLessThan(0.1 * peak);
        if (!(seq === 'accept' && c === 6)) expect(Math.abs(v[v.length - 1]!), `${seq} channel ${c} ends at rest`).toBeLessThan(0.1 * peak);
        for (let i = 1; i < v.length; i++) expect(Math.abs(v[i]! - v[i - 1]!), `${seq} channel ${c} at ${(i * dt).toFixed(4)} s`).toBeLessThan(0.1 * peak);
      }
    }
  });

  it('the status key lights exactly once, at the playback beat, and never on decline', () => {
    let changes = 0;
    let prev = at('accept', 0).status;
    for (let i = 1; i <= 1600; i++) {
      const s = at('accept', i / 1000).status;
      if (s !== prev) changes++;
      prev = s;
    }
    expect(changes).toBe(1);
    expect(at('accept', PLAY_AT - 0.001).status).toBe('off');
    expect(at('accept', PLAY_AT).status).toBe('lit');
    for (let i = 0; i <= 1400; i += 10) expect(at('decline', i / 1000).status).toBe('off');
  });

  it('the presentation tilt stays below the key’s specular lobe on the vinyl, and only decreases on the host path', () => {
    expect(HOVER.tilt).toBeLessThanOrEqual(TILT_MAX_SHEEN);
    let prev = at('host', 0).recordTilt;
    expect(prev).toBe(HOVER.tilt);
    for (let i = 1; i <= DURATIONS.host * 1000; i++) {
      const cur = at('host', i / 1000).recordTilt;
      expect(cur).toBeLessThanOrEqual(prev + 1e-12);
      prev = cur;
    }
  });

  it('the record is level and centred before its hole reaches the spindle, and never dips into the mat', () => {
    for (let i = 0; i <= 1200; i++) {
      const f = at('host', i / 1000);
      const h = f.recordPos.y - PLATTER_TOP;
      if (h < LEVEL_BY) {
        expect(Math.abs(f.recordTilt)).toBeLessThan(1e-3);
        expect(Math.hypot(f.recordPos.x - PLATTER.x, f.recordPos.z - PLATTER.z)).toBeLessThan(1e-9);
      }
      // Lowest point of the (tilted) disc stays on or above the mat.
      const lowest = f.recordPos.y - RECORD.radius * Math.sin(tiltOf(f));
      if (h < 0.3) expect(lowest).toBeGreaterThanOrEqual(PLATTER_TOP - 1e-9);
      // Round the spindle the hole never binds: its rim stays inside the hole's clearance.
      if (h < PLATTER.spindleHeight) {
        const offset = Math.hypot(f.recordPos.x - PLATTER.x, f.recordPos.z - PLATTER.z) + RECORD.thickness * Math.sin(tiltOf(f));
        expect(offset).toBeLessThan(RECORD.holeRadius - PLATTER.spindleRadius);
      }
    }
  });

  it('host is one gesture: the record never stops between its start and the touch (speed ≥ 10 % of its peak from 0.08 s until the air film brakes it, 20 ms before the touch)', () => {
    const speed = (t: number) => at('host', t + 0.0005).recordPos.distanceTo(at('host', t - 0.0005).recordPos) / 0.001;
    const ts = Array.from({ length: Math.floor(CONTACT_AT * 1000) }, (_, i) => (i + 1) / 1000);
    const peak = Math.max(...ts.map(speed));
    for (const t of ts) if (t >= 0.08 && t <= CONTACT_AT - 0.02) expect(speed(t), `${t.toFixed(3)} s`).toBeGreaterThan(0.1 * peak);
  });

  it('host is C2: no channel changes acceleration by more than 5 % of its peak in 0.1 ms (release, touch and settle included)', () => {
    const dt = 0.0001;
    const n = Math.round(DURATIONS.host / dt);
    const values = (f: PartyFrame) => [f.recordPos.x, f.recordPos.y, f.recordPos.z, f.recordTilt, f.wobble, f.wobbleZ];
    const xs = Array.from({ length: n + 1 }, (_, i) => values(at('host', i * dt)));
    for (let c = 0; c < xs[0]!.length; c++) {
      const a = xs.slice(2).map((x, i) => (x[c]! - 2 * xs[i + 1]![c]! + xs[i]![c]!) / (dt * dt));
      const peak = Math.max(...a.map(Math.abs));
      for (let i = 1; i < a.length; i++) expect(Math.abs(a[i]! - a[i - 1]!), `channel ${c} at ${((i + 1) * dt).toFixed(4)} s`).toBeLessThan(0.05 * peak);
    }
  });

  it('the record never rises: its centre descends monotonically from the hover to the mat (no hop after the touch)', () => {
    let prev = at('host', 0).recordPos.y;
    for (let i = 1; i <= 2400; i++) {
      const y = at('host', i / 2000).recordPos.y;
      expect(y, `${(i / 2000).toFixed(4)} s`).toBeLessThanOrEqual(prev + 1e-12);
      prev = y;
    }
  });

  it('one unhurried gesture: a single speed peak while the hand carries it, and under 0.4 g before the release', () => {
    const speed = (t: number) => at('host', t + 0.0005).recordPos.distanceTo(at('host', t - 0.0005).recordPos) / 0.001;
    const ts = Array.from({ length: Math.floor(RELEASE_AT * 1000) - 1 }, (_, i) => (i + 1) / 1000);
    const v = ts.map(speed);
    const top = v.indexOf(Math.max(...v));
    for (let i = 1; i < v.length; i++) {
      if (i <= top) expect(v[i]!, `rising ${ts[i]} s`).toBeGreaterThanOrEqual(v[i - 1]! - 1e-9);
      else expect(v[i]!, `falling ${ts[i]} s`).toBeLessThanOrEqual(v[i - 1]! + 1e-9);
    }
    // 0.4 g = 3.9 m/s² = 19.6 scene units/s² (1 unit = 20 cm).
    for (const t of ts) {
      const a = at('host', t + 0.001).recordPos.clone().add(at('host', t - 0.001).recordPos).sub(at('host', t).recordPos.clone().multiplyScalar(2)).length() / 1e-6;
      expect(a, `${t} s`).toBeLessThan(19.6);
    }
  });

  it('seat-and-settle: the low rim meets the mat at rest, the record rides on it while the tilt decays and its low side runs round, then it is still', () => {
    const gap = (t: number) => { const f = at('host', t); return f.recordPos.y - RECORD.radius * Math.sin(tiltOf(f)) - PLATTER_TOP; };
    expect(gap(CONTACT_AT)).toBeCloseTo(0, 9);
    // The low rim arrives with zero speed (the air film), from above.
    expect(Math.abs(gap(CONTACT_AT - 0.001) - gap(CONTACT_AT)) / 0.001).toBeLessThan(1e-3);
    expect(gap(CONTACT_AT - 0.02)).toBeGreaterThan(0);
    let peak = 0, turned = 0, prevPhi: number | null = null, prevTilt = Infinity;
    for (let t = CONTACT_AT; t < SETTLE.end; t += 0.001) {
      const f = at('host', t);
      const tilt = tiltOf(f);
      peak = Math.max(peak, tilt);
      // Rides on its lowest rim point: exactly on the mat, never below (and no edge-to-edge hop).
      expect(gap(t), `${t.toFixed(3)} s`).toBeCloseTo(0, 9);
      // The tilt only decays after the touch: it never grows back.
      expect(tilt).toBeLessThanOrEqual(prevTilt + 1e-12);
      prevTilt = tilt;
      if (tilt > 1e-4) {
        const phi = Math.atan2(f.wobbleZ, f.wobble);
        if (prevPhi !== null) turned += Math.abs(Math.atan2(Math.sin(phi - prevPhi), Math.cos(phi - prevPhi)));
        prevPhi = phi;
      }
    }
    // A settle that registers at stage size but stays a settle: the rim rises 1.6–3 mm (0.008–0.015
    // scene units, 2–3 px on the stage), the low side runs round more than half the rim.
    for (let t = RELEASE_AT; t < SETTLE.end; t += 0.001) peak = Math.max(peak, tiltOf(at('host', t)));
    expect(RECORD.radius * Math.sin(peak)).toBeGreaterThan(0.008);
    expect(RECORD.radius * Math.sin(peak)).toBeLessThan(0.015);
    expect(turned).toBeGreaterThan(Math.PI);
    // Until shortly before the fingers let go the record is held level.
    expect(settleTilt(RELEASE_AT - 0.2)).toBe(0);
    for (const t of [SETTLE.end, 1.1, 1.2]) {
      expect(settleTilt(t)).toBe(0);
      expect(at('host', t).recordPos.distanceTo(RECORD_SEATED)).toBe(0);
    }
    expect(SETTLE.end).toBeLessThan(DURATIONS.host - 0.1);
  });

  it('the record turns only after the motor starts with the key, monotonically, and the canonical pose shows it at the display angle', () => {
    let prev = 0;
    for (let i = 0; i <= DURATIONS.accept * 1000; i++) {
      const s = at('accept', i / 1000).spin;
      expect(s).toBeLessThanOrEqual(prev + 1e-9);
      prev = s;
    }
    expect(SPIN.start).toBe(PLAY_AT);
    expect(Math.abs(at('accept', SPIN.start).spin)).toBe(0);
    for (const p of ['guest-ready', 'declined', 'host-ready'] as const) expect(pose(p).spin).toBe(0);
    expect(pose('accepted').spin).toBe(-DISPLAY_ANGLE);
    expect(DISPLAY_ANGLE).toBeCloseTo(platterAt(ACCEPT_PLATTER, ACCEPTED_AT).angle % (2 * Math.PI), 12);
    // The lead-in (1.5 turns) is done ACCEPTED_AT into acceptance, after the clip.
    expect(ACCEPTED_AT).toBeGreaterThan(DURATIONS.accept);
    expect(platterAt(ACCEPT_PLATTER, ACCEPTED_AT).angle - platterAt(ACCEPT_PLATTER, STYLUS_DOWN).angle).toBeCloseTo(3 * Math.PI, 9);
  });

  it('a real deck’s order (v1.5 polish): the key starts the platter first, and the stylus lands on a record at 99 % of speed', () => {
    const f0 = at('accept', PLAY_AT);
    expect(f0.status).toBe('lit');
    expect(f0.armYaw).toBe(ARM.parked);
    expect(f0.armPitch).toBe(0);
    // The arm leaves its rest only once the motor runs.
    for (let t = 0; t <= ACCEPT_ARM.reach; t += 0.001) {
      expect(at('accept', t).armYaw).toBe(ARM.parked);
      expect(at('accept', t).armPitch).toBe(0);
    }
    // Lift, swing, then the damper: the stylus touches the vinyl first at STYLUS_DOWN, the record at speed.
    const tipY = (t: number) => { const f = at('accept', t); return stylusAt(f.armYaw, f.armPitch).y; };
    for (let t = 0.1; t < STYLUS_DOWN; t += 0.001) {
      expect(tipY(t), `${t.toFixed(3)} s`).toBeGreaterThanOrEqual(RECORD_TOP - 1e-12);
      if (t < STYLUS_DOWN - 0.1) expect(tipY(t), `${t.toFixed(3)} s`).toBeGreaterThan(RECORD_TOP + 1e-4);
    }
    expect(tipY(STYLUS_DOWN)).toBeCloseTo(RECORD_TOP, 9);
    expect(platterAt(ACCEPT_PLATTER, STYLUS_DOWN).speed / STEADY.omega).toBeGreaterThan(0.99);
    expect(STYLUS_DOWN).toBeLessThanOrEqual(DURATIONS.accept - 0.15);
  });

  it('the arm moves at a hand’s pace (≤ 90°/s), the cue lever lifts it in 0.2 s and the damper lowers it over 0.75 s', () => {
    let peak = 0;
    for (let t = 0; t < DURATIONS.accept; t += 0.001) peak = Math.max(peak, Math.abs(at('accept', t + 0.001).armYaw - at('accept', t).armYaw) / 0.001);
    expect((peak * 180) / Math.PI).toBeLessThan(90);
    expect((peak * 180) / Math.PI).toBeGreaterThan(60);
    // The damper: from fully lifted to the vinyl over ACCEPT_ARM.cue, monotonic, landing at rest.
    let prev = at('accept', ACCEPT_ARM.cueAt).armPitch;
    expect(prev).toBe(ARM.lifted);
    for (let t = ACCEPT_ARM.cueAt + 0.005; t <= STYLUS_DOWN; t += 0.005) {
      const p = at('accept', t).armPitch;
      expect(p).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = p;
    }
    expect(ACCEPT_ARM.cue).toBeGreaterThanOrEqual(0.6);
    expect(Math.abs(at('accept', STYLUS_DOWN).armPitch - at('accept', STYLUS_DOWN - 0.01).armPitch) / 0.01).toBeLessThan(0.01);
  });

  it('belt drive: the platter lags the motor and runs at the real 33⅓ rpm, with no brake', () => {
    const omega = (t: number) => -(at('accept', t + 0.0005).spin - at('accept', t - 0.0005).spin) / 0.001;
    // Starts from rest with no jerk: after 20 ms it is still under 10 % of speed.
    expect(omega(SPIN.start + 0.02)).toBeLessThan(0.1 * STEADY.omega);
    // ≥ 95 % of speed 1.05 s after the motor starts (a DC-servo belt drive), never above steady speed.
    expect(omega(SPIN.start + 1.05)).toBeGreaterThan(0.95 * STEADY.omega);
    for (let t = SPIN.start; t < DURATIONS.accept; t += 0.01) expect(omega(t)).toBeLessThanOrEqual(STEADY.omega * (1 + 1e-6));
    // Steady state is the real 33⅓ rpm: 1.8 s a turn.
    expect(STEADY.omega).toBe(RPM_33);
    expect(STEADY.beatScale).toBe(1);
    expect((2 * Math.PI) / STEADY.omega).toBeCloseTo(1.8, 9);
    // No brake: at the end of the clip it is at 99.8 % of speed and still gaining.
    expect(omega(DURATIONS.accept - 0.001)).toBeGreaterThan(0.998 * STEADY.omega);
    expect(platterAt(ACCEPT_PLATTER, DURATIONS.accept).accel).toBeGreaterThan(0);
    expect(platterAt(ACCEPT_PLATTER, 30).speed).toBeCloseTo(STEADY.omega, 9);
  });

  it('the record plays on: the clip hands over to the playing pose with no step in angle, speed or acceleration', () => {
    const T = DURATIONS.accept;
    const angle = (t: number) => (t <= T ? -at('accept', t).spin : platterAt(ACCEPT_PLATTER, t).angle);
    const h = 0.002;
    const v = (t: number) => (angle(t + h / 2) - angle(t - h / 2)) / h;
    const a = (t: number) => (angle(t + h) - 2 * angle(t) + angle(t - h)) / (h * h);
    expect(Math.abs(v(T - h) - v(T + h))).toBeLessThan(1e-3);
    expect(Math.abs(a(T - h) - a(T + h))).toBeLessThan(0.05);
    // The arm too: the lead-in goes on through the hand-over.
    const yaw = (t: number) => (t <= T ? at('accept', t) : playingFrame(ACCEPT_PLATTER, t, newFrame())).armYaw;
    expect(Math.abs((yaw(T) - yaw(T - h)) / h - (yaw(T + h) - yaw(T)) / h)).toBeLessThan(1e-3);
    // The playing pose is the accepted pose with the record turned on; at the clip's end it is the clip's last frame.
    close(playingFrame(ACCEPT_PLATTER, T, newFrame()), at('accept', T));
    const later = playingFrame(ACCEPT_PLATTER, 61.6, newFrame());
    close(later, { ...pose('accepted'), spin: later.spin });
    expect(later.spin).toBeGreaterThan(-2 * Math.PI);
    expect(later.spin).toBeLessThanOrEqual(0);
  });

  it('motor off: a playing platter coasts down (viscous and Coulomb drag) and stops 3.0 s after the cut', () => {
    const p = platterFor('decline', { armYaw: 0, armYawRate: 0, armPitch: 0, armPitchRate: 0, lid: LID_OPEN, lidRate: 0, angle: 1, speed: RPM_33 });
    const stop = Math.log(1 + (RPM_33 * COAST.k) / COAST.c) / COAST.k;
    expect(stop).toBeGreaterThan(2.9);
    expect(stop).toBeLessThan(3.1);
    let prev = platterAt(p, 0);
    expect(prev.speed).toBe(RPM_33);
    for (let t = 0.01; t <= 4; t += 0.01) {
      const s = platterAt(p, t);
      expect(s.speed).toBeLessThanOrEqual(prev.speed + 1e-12);
      expect(s.angle).toBeGreaterThanOrEqual(prev.angle - 1e-12);
      prev = s;
    }
    expect(platterAt(p, 0.7).speed / RPM_33).toBeCloseTo(0.62, 2);
    expect(platterAt(p, stop + 0.01).speed).toBe(0);
    expect(platterAt(p, 10).angle).toBeCloseTo(platterAt(p, stop).angle, 12);
    expect(LID_CLOSED).toBe(0);
  });

  it('the stylus lands on the groove and stays on the record; parked it is clear of the record', () => {
    for (let i = Math.round(STYLUS_DOWN * 1000); i <= DURATIONS.accept * 1000 + 3000; i++) {
      const f = i <= DURATIONS.accept * 1000 ? at('accept', i / 1000) : playingFrame(ACCEPT_PLATTER, i / 1000, newFrame());
      const tip = stylusAt(f.armYaw, f.armPitch);
      expect(tip.y).toBeCloseTo(RECORD_TOP, 6);
      const r = Math.hypot(tip.x - PLATTER.x, tip.z - PLATTER.z);
      expect(r).toBeGreaterThan(RECORD.grooveInner);
      expect(r).toBeLessThanOrEqual(RECORD.grooveOuter + 1e-6);
    }
    // Cued at contact pitch the stylus lands within 0.1 mm of the lead-in groove the yaw was solved for.
    expect(Math.abs(stylusAt(ARM.cue, CONTACT_PITCH).distanceTo(new Vector3(PLATTER.x, RECORD_TOP, PLATTER.z)) - RECORD.grooveOuter)).toBeLessThan(1e-4);
    const parked = stylusAt(TONEARM.parkedYaw, 0);
    expect(Math.hypot(parked.x - PLATTER.x, parked.z - PLATTER.z)).toBeGreaterThan(PLATTER.radius + 0.1);
    expect(Math.hypot(stylusAt(tonearmYawFor(0.5), 0).x - PLATTER.x, stylusAt(tonearmYawFor(0.5), 0).z - PLATTER.z)).toBeCloseTo(0.5, 6);
  });

  it('the arm is lifted whenever it swings over the record (sequence and interruption blends)', () => {
    for (let i = 0; i <= STYLUS_DOWN * 1000; i++) {
      const f = at('accept', i / 1000);
      const tip = stylusAt(f.armYaw, f.armPitch);
      const r = Math.hypot(tip.x - PLATTER.x, tip.z - PLATTER.z);
      if (r < RECORD.radius + 0.02 && Math.abs(f.armYaw - ARM.cue) > 0.01) expect(tip.y).toBeGreaterThan(RECORD_TOP + 0.015);
    }
    for (let k = 0.05; k < 1; k += 0.05) {
      const yaw = ARM.played + (ARM.parked - ARM.played) * k;
      const tip = stylusAt(yaw, blendLift(yaw));
      const r = Math.hypot(tip.x - PLATTER.x, tip.z - PLATTER.z);
      if (r < RECORD.radius) expect(tip.y).toBeGreaterThan(RECORD_TOP + 0.005);
    }
    // At either end the ceiling is the arm's resting pitch: on the vinyl, on the rest.
    expect(blendLift(ARM.played)).toBe(ARM.contact);
    expect(blendLift(ARM.parked)).toBe(0);
  });

  it('the lid closes on its hinge from the master’s 27.6° lean without passing closed, braking into a soft close', () => {
    expect(90 + (LID.open * 180) / Math.PI).toBeCloseTo(27.6, 1);
    let prev = at('decline', 0).lid;
    for (let i = 1; i <= 1400; i++) {
      const l = at('decline', i / 1000).lid;
      expect(l).toBeGreaterThanOrEqual(prev - 1e-9); // monotonic towards 0
      expect(l).toBeLessThanOrEqual(0);
      prev = l;
    }
    // Braking: the last 100 ms before contact are slower than the middle of the swing.
    const mid = at('decline', 0.65).lid - at('decline', 0.55).lid;
    const late = at('decline', 1.0).lid - at('decline', 0.9).lid;
    expect(late).toBeLessThan(mid);
    // One continuous close, no stop-and-go: the lid keeps moving until contact, and its speed
    // rises to a single peak and then only falls.
    const speed = (t: number) => at('decline', t + 0.0005).lid - at('decline', t - 0.0005).lid;
    let peak = 0.2005;
    for (let t = 0.2005; t < 1.3; t += 0.001) if (speed(t) > speed(peak)) peak = t;
    for (let t = 0.2015; t < 1.28; t += 0.001) {
      expect(speed(t)).toBeGreaterThan(0);
      if (t <= peak) expect(speed(t)).toBeGreaterThanOrEqual(speed(t - 0.001) - 1e-12);
      else expect(speed(t)).toBeLessThanOrEqual(speed(t - 0.001) + 1e-12);
    }
    // Contact exactly at 1.30 s, held to the end.
    expect(at('decline', 1.29).lid).toBeLessThan(0);
    for (const t of [1.3, 1.35, 1.4]) expect(at('decline', t).lid).toBe(0);
  });
});

// ── The exported GLB ──────────────────────────────────────────────────────────────
const doc = await readPartyDoc();
const node = (name: string) => findNode(doc, name);
const worldOf = (n: GltfNode) => new Matrix4().fromArray(n.getWorldMatrix());
/** Every vertex under `n`, in `space`'s frame (default party_root). */
function vertices(n: GltfNode, space = node('party_root')): Vector3[] {
  const out: Vector3[] = [];
  const toSpace = worldOf(space).invert();
  n.traverse((c) => {
    const m = toSpace.clone().multiply(worldOf(c));
    for (const prim of c.getMesh()?.listPrimitives() ?? []) {
      const pos = prim.getAttribute('POSITION')!;
      const e = [0, 0, 0];
      for (let i = 0; i < pos.getCount(); i++) out.push(new Vector3(...(pos.getElement(i, e) as [number, number, number])).applyMatrix4(m));
    }
  });
  return out;
}
const translation = (name: string) => new Vector3(...node(name).getTranslation());

describe('Party runtime GLB matches the contract (master at TT_SCALE)', () => {
  it('has every contract node exactly once, and mapped nodes are empty transforms with unit scale', () => {
    for (const n of PARTY_NODES) expect(() => node(n), n).not.toThrow();
    for (const n of ['platter', 'record_authored', 'record_secondary', 'record_label', 'tonearm_pivot', 'tonearm_lift', 'lid_hinge', 'cue_lever', 'cue_lift', 'player_status']) {
      expect(node(n).getMesh(), n).toBeNull();
      expect(node(n).getScale(), n).toEqual([1, 1, 1]);
    }
    expect(TT_SCALE).toBeCloseTo(2.1 / 1.855, 9);
  });

  it('the body stands on its feet at y = 0, PLAYER wide and deep, the deck at PLAYER.deck', () => {
    const body = boxIn(node('player_body'), node('party_root'));
    expect(body.min.y).toBeCloseTo(0, 4);
    const plinth = boxIn(node('body_tt_brushed_steel'), node('party_root'));
    expect(plinth.max.x - plinth.min.x).toBeCloseTo(PLAYER.width, 3);
    expect(plinth.max.z - plinth.min.z).toBeCloseTo(PLAYER.depth, 3);
    expect(plinth.max.y).toBeCloseTo(PLAYER.deck, 3);
    expect((plinth.max.x + plinth.min.x) / 2).toBeCloseTo(0, 3);
  });

  it('the platter turns on the spindle axis; its origin is the record seat on the mat', () => {
    expect(translation('platter').distanceTo(new Vector3(PLATTER.x, PLATTER_TOP, PLATTER.z))).toBeLessThan(1e-4);
    const mat = boxIn(node('rubber_mat'), node('platter'));
    expect(mat.max.y).toBeCloseTo(0, 4);
    const spindle = boxIn(node('spindle'), node('platter'));
    expect(Math.hypot((spindle.max.x + spindle.min.x) / 2, (spindle.max.z + spindle.min.z) / 2)).toBeLessThan(2e-4);
    expect((spindle.max.x - spindle.min.x) / 2).toBeCloseTo(PLATTER.spindleRadius, 3);
    expect(spindle.max.y).toBeCloseTo(PLATTER.spindleHeight, 3);
    const platter = boxIn(node('platter'), node('platter'));
    expect((platter.max.x - platter.min.x) / 2).toBeCloseTo(PLATTER.radius, 3);
  });

  it('record_authored is the record’s bottom centre, seated on the mat; vinyl, edge and label ride on record_secondary', () => {
    expect(translation('record_authored').distanceTo(RECORD_SEATED)).toBeLessThan(1e-4);
    for (const n of ['record_vinyl', 'record_edge', 'record_label']) expect(node(n).getParentNode()?.getName(), n).toBe('record_secondary');
    const rec = boxIn(node('record_secondary'), node('record_authored'));
    expect(rec.min.y).toBeCloseTo(0, 4);
    expect(rec.max.y).toBeCloseTo(RECORD.thickness, 3);
    expect((rec.max.x - rec.min.x) / 2).toBeCloseTo(RECORD.radius, 3);
    expect(Math.hypot(rec.max.x + rec.min.x, rec.max.z + rec.min.z) / 2).toBeLessThan(2e-4);
    const label = boxIn(node('record_label'), node('record_authored'));
    expect((label.max.x - label.min.x) / 2).toBeCloseTo(RECORD.labelRadius, 3);
    // The hole clears the spindle (0.34 mm), and no vertex of the record sits inside it.
    expect(RECORD.holeRadius).toBeGreaterThan(PLATTER.spindleRadius);
    for (const v of vertices(node('record_secondary'), node('record_authored'))) expect(Math.hypot(v.x, v.z)).toBeGreaterThan(RECORD.holeRadius - 1e-4);
  });

  it('the gimballed tonearm: yaw pivot and pitch axis on the master bearing, stylus at (0, −drop, length), counterweight pitching with it', () => {
    expect(translation('tonearm_pivot').distanceTo(TONEARM.pivot)).toBeLessThan(1e-4);
    const yaw = 2 * Math.atan2(node('tonearm_pivot').getRotation()[1], node('tonearm_pivot').getRotation()[3]);
    expect(yaw).toBeCloseTo(TONEARM.cueYaw, 5);
    expect(new Vector3(...node('tonearm_lift').getTranslation()).length()).toBeLessThan(1e-6);
    // The lowest point of everything that pitches is the stylus tip.
    const arm = vertices(node('tonearm_lift'), node('tonearm_lift'));
    const tip = arm.reduce((a, b) => (b.y < a.y ? b : a));
    expect(tip.distanceTo(new Vector3(0, -TONEARM.drop, TONEARM.length))).toBeLessThan(2e-3);
    // The counterweight (behind the bearing) pitches; the gimbal housing only yaws.
    expect(Math.min(...arm.map((v) => v.z))).toBeLessThan(-0.2);
    expect(node('gimbal_housing').getParentNode()?.getName()).toBe('tonearm_pivot');
    // In the master's own pose the stylus is on the lead-in groove.
    const masterTip = armPoint(TONEARM.cueYaw, 0, 0, -TONEARM.drop, TONEARM.length);
    expect(Math.hypot(masterTip.x - PLATTER.x, masterTip.z - PLATTER.z)).toBeCloseTo(RECORD.grooveOuter, 5);
  });

  it('the dust cover hinges on the master’s hinge-pin axis and is exported open at the 27.6° lean', async () => {
    const master = await createIO().read(join(MASTERS_DIR, 'vintage-turntable.glb'));
    for (const pin of ['hinge_l_pin', 'hinge_r_pin']) {
      const b = boxIn(findNode(master, pin), null);
      const axis = fromMaster(0, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2);
      expect(Math.abs(axis.y - LID.hinge.y), pin).toBeLessThan(1e-4);
      expect(Math.abs(axis.z - LID.hinge.z), pin).toBeLessThan(1e-4);
    }
    expect(translation('lid_hinge').distanceTo(LID.hinge)).toBeLessThan(1e-4);
    const q = new Quaternion(...node('lid_hinge').getRotation());
    expect(new Vector3(1, 0, 0).applyQuaternion(q).distanceTo(new Vector3(1, 0, 0))).toBeLessThan(1e-6);
    expect(2 * Math.atan2(q.x, q.w)).toBeCloseTo(LID.open, 5);
  });

  it('the cue lever, lift platform and status key are mapped from the master parts', () => {
    expect(translation('cue_lever').distanceTo(CUE.leverPivot)).toBeLessThan(1e-4);
    const key = boxIn(node('player_status'), node('party_root'));
    expect(Math.hypot((key.min.x + key.max.x) / 2 - STATUS_KEY.x, (key.min.z + key.max.z) / 2 - STATUS_KEY.z)).toBeLessThan(1e-3);
    expect(key.max.y).toBeGreaterThan(PLAYER.deck);
  });

  it('label presets are KHR_materials_variants: coral and cobalt prints of the master label', () => {
    const json = doc.getRoot().listExtensionsUsed().map((e) => e.extensionName);
    expect(json).toContain('KHR_materials_variants');
    const mats = doc.getRoot().listMaterials().map((m) => m.getName());
    for (const m of ['tt_label', 'tt_label_coral', 'tt_label_cobalt']) expect(mats).toContain(m);
    const tex = (name: string) => doc.getRoot().listMaterials().find((m) => m.getName() === name)!.getBaseColorTexture()!;
    expect(tex('tt_label_coral')).not.toBe(tex('tt_label'));
    expect(tex('tt_label_cobalt')).not.toBe(tex('tt_label_coral'));
  });

  it('label prints: the master’s own print recoloured (field to the preset, marks as dark ink), nothing painted on', () => {
    // A synthetic print: the master's olive field everywhere, one texel of its ink.
    const size = 64, img = { data: new Uint8Array(size * size * 3), width: size, height: size, channels: 3 as const };
    for (let i = 0; i < img.data.length; i += 3) img.data.set([134, 128, 94], i);
    const inkAt = (size / 2 + 20) * size * 3 + (size / 2) * 3; // straight down, r ≈ 0.63 (field there)
    img.data.set([80, 74, 56], inkAt);
    const lum = (c: ArrayLike<number>) => {
      const l = (v: number) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * l(c[0]!) + 0.7152 * l(c[1]!) + 0.0722 * l(c[2]!);
    };
    const contrast = (a: ArrayLike<number>, b: ArrayLike<number>) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
    const fields = { coral: [255, 113, 74], cobalt: [47, 84, 201] } as const;
    for (const preset of ['coral', 'cobalt'] as const) {
      const out = labelPrint(preset)(img).data;
      // Every field texel takes the preset colour, at every angle: no wedge, no sliver (v1.2's
      // painted marks were removed in the studio pass; the master's own art carries the spin).
      const colours = new Set<string>();
      for (let i = 0; i < out.length; i += 3) if (i !== inkAt) colours.add(`${out[i]},${out[i + 1]},${out[i + 2]}`);
      expect([...colours], preset).toEqual([fields[preset].join(',')]);
      // Ink: coral ≈ 5.2, cobalt ≈ 3.0 (the first pass’s 3.7 and 2.4).
      expect(contrast(out.subarray(0, 3), out.subarray(inkAt, inkAt + 3)), `${preset} ink`).toBeGreaterThan(preset === 'coral' ? 5 : 2.9);
    }
  });

  it('the exported coral and cobalt prints stay asymmetric under rotation (the accept spin reads at stage size)', async () => {
    // Replaces v1.2's wedge check: the master's own art must carry the spin. Ink coverage of the
    // quarter sector holding the off-centre square (east of the spindle) against the opposite
    // quarter, over the annulus between the spindle ring and the outer rings.
    const sharp = loadSharp();
    const lin = (v: number) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
    const luma = (r: number, g: number, b: number) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    for (const name of ['tt_label_coral', 'tt_label_cobalt']) {
      const tex = doc.getRoot().listMaterials().find((m) => m.getName() === name)!.getBaseColorTexture()!;
      const { data, info } = await sharp(tex.getImage()!).raw().toBuffer({ resolveWithObject: true });
      const { width: w, height: h, channels: ch } = info;
      const at = (x: number, y: number) => { const i = (y * w + x) * ch; return luma(data[i]!, data[i + 1]!, data[i + 2]!); };
      // The label disc fills the UV square: field at the centre-left, ink threshold halfway to the square's ink.
      const field = at(Math.round(w * 0.3), Math.round(h * 0.5));
      const squareInk = at(Math.round(w * 0.74), Math.round(h * 0.5));
      expect(squareInk, `${name}: the master's square is printed east of the spindle`).toBeLessThan(field * 0.5);
      const threshold = (field + squareInk) / 2;
      const ink = [0, 0, 0, 0], area = [0, 0, 0, 0]; // sectors centred east, north, west, south (image space)
      const R = w / 2;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const dx = x + 0.5 - R, dy = y + 0.5 - h / 2, r = Math.hypot(dx, dy) / R;
        if (r < 0.22 || r > 0.85) continue;
        const s = Math.round(((Math.atan2(-dy, dx) / (Math.PI / 2)) + 4) % 4) % 4;
        area[s]!++;
        if (at(x, y) < threshold) ink[s]!++;
      }
      const cover = ink.map((n, i) => n / area[i]!);
      // The square's quarter against the opposite quarter: a clear margin (the square alone is ≈ 2 %).
      expect(cover[0]! - cover[2]!, `${name}: east ${cover[0]!.toFixed(4)} vs west ${cover[2]!.toFixed(4)}`).toBeGreaterThan(0.015);
      // And half a turn never maps the print onto itself in either axis.
      expect(Math.abs(cover[1]! - cover[3]!), `${name}: north vs south`).toBeGreaterThan(0.005);
    }
  });

  it('the brushed steel plinth keeps the master’s own base colour (no studio regrade)', () => {
    const steel = doc.getRoot().listMaterials().find((m) => m.getName() === 'tt_brushed_steel')!;
    const [r, g, b] = steel.getBaseColorFactor();
    expect(r).toBeCloseTo(0.20155625378383743, 5);
    expect(g).toBeCloseTo(0.17788841597328695, 5);
    expect(b).toBeCloseTo(0.15292615198613213, 5);
  });

  it('the scaffold rest shares the master’s chrome and black anodising (one material each, clearcoat kept)', () => {
    const mats = doc.getRoot().listMaterials();
    for (const name of ['tt_chrome', 'tt_black_anodised']) expect(mats.filter((m) => m.getName() === name), name).toHaveLength(1);
    expect(mats.find((m) => m.getName() === 'tt_black_anodised')!.getExtension('KHR_materials_clearcoat')).toBeTruthy();
    const restMats = new Set<string>();
    node('tonearm_rest').traverse((n) => n.getMesh()?.listPrimitives().forEach((p) => restMats.add(p.getMaterial()!.getName())));
    expect([...restMats].sort()).toEqual(['tt_black_anodised', 'tt_chrome']);
  });

  it('declares WebP textures and keeps the vinyl’s groove LUTs exact (8192 × 4, decoded texels equal the master’s)', async () => {
    const webp = doc.getRoot().listExtensionsUsed().find((e) => e.extensionName === 'EXT_texture_webp');
    expect(webp?.isRequired()).toBe(true);
    const sharp = loadSharp();
    const master = await createIO().read(join(MASTERS_DIR, 'vintage-turntable.glb'));
    const vinyl = (d: typeof doc, name: string) => d.getRoot().listMaterials().find((m) => m.getName() === name)!;
    const decode = async (img: Uint8Array) => (await sharp(img).ensureAlpha().raw().toBuffer({ resolveWithObject: true })).data;
    for (const t of doc.getRoot().listTextures()) {
      expect(t.getMimeType()).toBe('image/webp');
      const chunk = new TextDecoder().decode(t.getImage()!.subarray(12, 16));
      if (listTextureSlots(t).some((s) => /normal|anisotropy/i.test(s))) expect(chunk, t.getName()).toBe('VP8L');
    }
    const ours = vinyl(doc, 'tt_vinyl'), theirs = vinyl(master, 'vinyl');
    expect(ours.getNormalTexture()!.getSize()).toEqual([8192, 4]);
    expect(Buffer.from(await decode(ours.getNormalTexture()!.getImage()!)).equals(Buffer.from(await decode(theirs.getNormalTexture()!.getImage()!)))).toBe(true);
  });
});

// ── The GLB geometry posed by the choreography ─────────────────────────────────────
/**
 * World-space samples of every triangle under `o`, no more than `step` apart along any edge,
 * so a 1.2 cm wall cannot slip between them (vertices alone leave the wide flat faces unsampled).
 */
function surfacePoints(o: Object3D, step = 0.01, keep: (p: Vector3) => boolean = () => true): Vector3[] {
  o.updateWorldMatrix(true, true);
  const out: Vector3[] = [];
  const a = new Vector3(), b = new Vector3(), c = new Vector3();
  o.traverse((n) => {
    const m = n as Mesh;
    if (!m.isMesh || m.userData.shadowProxy) return;
    const pos = m.geometry.getAttribute('position');
    const index = m.geometry.index;
    const count = index ? index.count : pos.count;
    const vertex = (v: Vector3, i: number) => v.fromBufferAttribute(pos, index ? index.getX(i) : i).applyMatrix4(m.matrixWorld);
    for (let i = 0; i < count; i += 3) {
      vertex(a, i); vertex(b, i + 1); vertex(c, i + 2);
      const n = Math.max(1, Math.ceil(Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a)) / step));
      for (let u = 0; u <= n; u++) {
        for (let v = 0; v <= n - u; v++) {
          const p = new Vector3().addScaledVector(a, (n - u - v) / n).addScaledVector(b, u / n).addScaledVector(c, v / n);
          if (keep(p)) out.push(p);
        }
      }
    }
  });
  return out;
}

describe('Party model clearances on the exported geometry', () => {
  const root = threeFromDoc(doc);
  const get = (n: string) => root.getObjectByName(n)!;
  const lidHinge = get('lid_hinge');
  extendLid(lidHinge);
  const shellMesh = lidHinge.children.find((c) => ((c as Mesh).material as MeshStandardMaterial | undefined)?.name === 'tt_lid') as Mesh;

  const apply = (f: PartyFrame) => {
    get('record_authored').position.copy(f.recordPos);
    get('record_authored').rotation.set(f.recordTilt, 0, 0);
    get('record_secondary').rotation.set(f.wobble, f.spin, f.wobbleZ);
    get('platter').rotation.set(0, f.spin, 0);
    get('tonearm_pivot').rotation.set(0, f.armYaw, 0);
    get('tonearm_lift').rotation.set(f.armPitch, 0, 0);
    lidHinge.rotation.set(f.lid, 0, 0);
    root.updateMatrixWorld(true);
  };

  // The shell in lid_hinge space (x across, y up, z forward from the hinge with the lid closed):
  // its outer box, and the cavity open underneath with walls and top LID.wall thick.
  shellMesh.geometry.computeBoundingBox();
  const outer = shellMesh.geometry.boundingBox!.clone();
  const cavity = new Box3(outer.min.clone().add(new Vector3(LID.wall, -1, LID.wall)), outer.max.clone().subScalar(LID.wall));
  const toLid = new Matrix4();
  const local = new Vector3();
  /** Points of `pts` (party space) inside the shell's walls with the lid at `angle`. */
  const cuts = (pts: Vector3[], angle: number) => {
    lidHinge.rotation.set(angle, 0, 0);
    root.updateMatrixWorld(true);
    toLid.copy(lidHinge.matrixWorld).invert();
    return pts.filter((p) => {
      local.copy(p).applyMatrix4(toLid);
      return outer.containsPoint(local) && !cavity.containsPoint(local);
    }).length;
  };
  /** Everything the cover must clear: the moving parts and the deck-top hardware (not the hinges themselves). */
  const parts = () => [
    ...['platter', 'record_authored', 'tonearm_pivot', 'tonearm_rest', 'cue_lever', 'cue_lift', 'player_status'].flatMap((n) => surfacePoints(get(n))),
    ...surfacePoints(get('player_body'), 0.01, (p) => p.y > PLAYER.deck + 0.003 && p.z > LID.hinge.z + 0.12),
  ];

  it('the extended shell closes onto the plinth: its closed box is LID_CLOSED_BOX', () => {
    apply(pose('declined'));
    // Shell and tab (the tab stands proud of the front wall).
    const box = new Box3();
    for (const c of lidHinge.children) if (['tt_lid', 'tt_aluminium'].includes(((c as Mesh).material as MeshStandardMaterial | undefined)?.name ?? '')) box.expandByObject(c, true);
    expect(box.min.distanceTo(LID_CLOSED_BOX.min)).toBeLessThan(2e-3);
    expect(box.max.distanceTo(LID_CLOSED_BOX.max)).toBeLessThan(2e-3);
    // Its rim sits just above the deck and its front wall reaches the plinth's front.
    expect(box.min.y - PLAYER.deck).toBeGreaterThan(0);
    expect(box.min.y - PLAYER.deck).toBeLessThan(0.004);
    const shell = new Box3().setFromObject(shellMesh, true);
    expect(Math.abs(PLAYER.depth / 2 - shell.max.z)).toBeLessThan(0.02);
  });

  it('the closed dust cover encloses the record, platter, parked arm and deck hardware with clearance', () => {
    apply(pose('declined'));
    const pts = parts();
    expect(pts.length).toBeGreaterThan(50_000);
    toLid.copy(lidHinge.matrixWorld).invert();
    const inner = cavity.clone().expandByVector(new Vector3(-0.003, 0, -0.003));
    inner.max.y -= 0.003;
    const outside = pts.filter((p) => !inner.containsPoint(local.copy(p).applyMatrix4(toLid)));
    expect(outside.length).toBe(0);
  });

  it('the swinging dust cover never cuts through the platter, record, tonearm or deck hardware', () => {
    // Decline closes over the guest-ready arrangement (seated record, parked arm): sweep it.
    apply(pose('guest-ready'));
    const ready = parts();
    const steps = 132;
    for (let i = 0; i <= steps; i++) {
      const angle = LID.open + (LID.closed - LID.open) * (i / steps);
      expect(cuts(ready, angle), `lid at ${angle.toFixed(3)} rad`).toBe(0);
    }
  });

  it('the open cover clears the hovering record on the whole host path and the playing arm', () => {
    for (let t = 0; t <= DURATIONS.host; t += 0.05) {
      apply(at('host', t));
      expect(cuts(surfacePoints(get('record_authored'), 0.02), LID.open), `host ${t.toFixed(2)} s`).toBe(0);
    }
    apply(pose('accepted'));
    expect(cuts(surfacePoints(get('tonearm_pivot')), LID.open)).toBe(0);
  });

  it('the parked tube lies in the rest’s cradle, between its prongs, without cutting it', () => {
    apply(pose('guest-ready'));
    // Everything in the rest's own frame (x across the tube, z along it, y up from the deck).
    const rest = get('tonearm_rest');
    const toRest = rest.matrixWorld.clone().invert();
    const cradle = surfacePoints(get('rest_cradle'), 0.002).map((p) => p.applyMatrix4(toRest));
    const saddleTop = Math.max(...cradle.filter((p) => Math.abs(p.x) < 0.012).map((p) => p.y));
    const prongs = cradle.filter((p) => p.y > saddleTop + 0.002);
    const inner = Math.min(...prongs.map((p) => Math.abs(p.x))), outerX = Math.max(...cradle.map((p) => Math.abs(p.x)));
    const prongTop = Math.max(...prongs.map((p) => p.y)), halfDepth = Math.max(...cradle.map((p) => Math.abs(p.z)));
    const arm = surfacePoints(get('tonearm_lift'), 0.003).map((p) => p.applyMatrix4(toRest));
    const over = arm.filter((p) => Math.abs(p.x) <= outerX && Math.abs(p.z) <= halfDepth && p.y < prongTop + 0.001);
    expect(over.length).toBeGreaterThan(0);
    for (const p of over) {
      // Between the prongs and on (not into) the saddle; never inside a prong.
      expect(Math.abs(p.x)).toBeLessThan(inner);
      expect(p.y).toBeGreaterThanOrEqual(saddleTop - 1e-4);
    }
    // It rests: the tube's underside is on the saddle (≤ 1.5 mm above it), not floating.
    expect(Math.min(...over.map((p) => p.y)) - saddleTop).toBeLessThan(0.0015);
  });

  it('parked, the headshell and cartridge sit beside the platter, well clear of its rim in plan', () => {
    apply(pose('guest-ready'));
    // Nearest point of the whole pitching arm (tube, headshell, cartridge) to the platter axis, in
    // plan: 0.169 beyond the rim at the 0.04 rad parked yaw (0.115 at the first pass's −0.04).
    let near = Infinity;
    for (const p of surfacePoints(get('tonearm_lift'), 0.003)) near = Math.min(near, Math.hypot(p.x - PLATTER.x, p.z - PLATTER.z));
    expect(near - PLATTER.radius).toBeGreaterThan(0.15);
  });

  it('playing, nothing on the arm but the stylus reaches the vinyl, and the arm never cuts the record or platter', () => {
    for (let t = 0; t <= DURATIONS.accept; t += 0.02) {
      apply(at('accept', t));
      const tip = stylusAt(at('accept', t).armYaw, at('accept', t).armPitch);
      for (const p of surfacePoints(get('tonearm_lift'), 0.01)) {
        const r = Math.hypot(p.x - PLATTER.x, p.z - PLATTER.z);
        if (r > PLATTER.radius + 0.002 || p.distanceTo(tip) < 0.004) continue;
        expect(p.y, `accept ${t.toFixed(2)} s`).toBeGreaterThan(RECORD_TOP - 1e-4);
      }
    }
  });

  it('every part stays inside the motion bounds through every pose and sequence', () => {
    const framed = PARTY_BOUNDS.clone().expandByScalar(0.005);
    const check = (label: string) => {
      const box = new Box3().setFromObject(root, true);
      expect(framed.containsBox(box), `${label}: ${JSON.stringify(box)}`).toBe(true);
    };
    for (const p of ['host-ready', 'guest-ready', 'accepted', 'declined'] as const) {
      apply(pose(p));
      check(p);
    }
    for (const seq of ['host', 'accept', 'decline'] as const) {
      for (let t = 0; t <= DURATIONS[seq]; t += 0.1) {
        apply(at(seq, t));
        check(`${seq} ${t.toFixed(2)} s`);
      }
    }
  });

  it('an interruption during the arm lift never drops the arm in one frame, and never drags it', () => {
    const leverRest = get('cue_lever').quaternion.clone(), liftRest = get('cue_lift').position.clone();
    const statusMaterial = new MeshStandardMaterial();
    statusMaterial.userData.statusOff = { color: statusMaterial.color.clone(), metalness: 1, roughness: 0.3 };
    const scene = new PartyScene(
      {
        root, nodes: Object.fromEntries(PARTY_NODES.map((n) => [n, get(n)])), recordShadow: { setHeight() {} },
        statusMaterial, bounds: PARTY_BOUNDS.clone(), leverRest, liftRest, setLabel() {}, dispose() {},
      } as unknown as RecordPlayerRig,
      { category: 'party', label: 'coral', songId: 'sample-track-a' },
    );
    const yawNode = get('tonearm_pivot'), liftNode = get('tonearm_lift');
    // Decline in the first 0.4 s of Accept: the director interpolates the animated nodes
    // towards guest-ready (≈1 ms steps over its 150 ms blend) and calls refresh() each step.
    for (let t = 0.01; t <= 0.4; t += 0.01) {
      scene.sample('accept', t);
      const yaw0 = yawNode.rotation.y, pitch0 = liftNode.rotation.x;
      let prev = pitch0;
      for (let k = 0; k <= 1; k += 1 / 150) {
        yawNode.rotation.y = yaw0 + (ARM.parked - yaw0) * k;
        liftNode.rotation.x = pitch0 * (1 - k);
        scene.refresh();
        const pitch = liftNode.rotation.x, label = `t ${t.toFixed(2)} k ${k.toFixed(3)}`;
        // Never below the director's interpolated pitch (negative is up): no one-frame drop.
        expect(pitch, label).toBeLessThanOrEqual(pitch0 * (1 - k) + 1e-12);
        // The only step is the lift the yaw needs at the interruption itself (the stylus must
        // clear before the arm swings); from there the arm moves continuously.
        expect(Math.abs(pitch - prev), label).toBeLessThanOrEqual(k === 0 ? Math.abs(blendLift(yaw0) - pitch0) + 1e-12 : 0.002);
        const tip = stylusAt(yawNode.rotation.y, pitch);
        if (Math.hypot(tip.x - PLATTER.x, tip.z - PLATTER.z) < RECORD.radius && Math.abs(yawNode.rotation.y - ARM.cue) > 0.01) {
          expect(tip.y).toBeGreaterThan(RECORD_TOP + 0.005);
        }
        prev = pitch;
      }
    }
    // The cueing parts follow the lift: the lever rests where the master put it with the arm down.
    scene.pose('guest-ready');
    expect(get('cue_lever').quaternion.angleTo(leverRest)).toBeLessThan(1e-9);
    expect(get('cue_lift').position.distanceTo(liftRest)).toBeLessThan(1e-9);
  });
  it('a change of mind never cuts the cover through the arm: decline after acceptance (the arm swings home under the closing cover) and accept after a decline began (the cover lifts back over the cueing arm)', () => {
    const arm = () => surfacePoints(get('tonearm_lift'), 0.01);
    const cases: [SequenceName, number, SequenceName][] = [
      ['accept', 0.1, 'decline'], ['accept', 0.25, 'decline'], ['accept', 0.5, 'decline'], ['accept', 0.75, 'decline'], ['accept', 1.0, 'decline'],
      ['accept', 1.4, 'decline'], ['accept', 1.7, 'decline'], ['accept', DURATIONS.accept, 'decline'],
      ['decline', 0.3, 'accept'], ['decline', 0.7, 'accept'], ['decline', 1.0, 'accept'], ['decline', 1.4, 'accept'],
      // Playing on, the lead-in done (the arm at `played`): decline.
      ['accept', ACCEPTED_AT + 1, 'decline'],
    ];
    for (const [first, at, next] of cases) {
      const frameAt = (t: number) => (first === 'accept' && t > DURATIONS.accept ? playingFrame(ACCEPT_PLATTER, t, newFrame()) : sampleSequence(first, t, newFrame()));
      const f = frameAt(at);
      const h = 1 / 240, b = frameAt(Math.max(0, at - h));
      const p = platterAt(platterFor(first, null), at);
      const change: Change = {
        armYaw: f.armYaw, armYawRate: (f.armYaw - b.armYaw) / h, armPitch: f.armPitch, armPitchRate: (f.armPitch - b.armPitch) / h,
        lid: f.lid, lidRate: (f.lid - b.lid) / h, angle: p.angle, speed: p.speed,
      };
      for (let t = 0; t <= DURATIONS[next]; t += 0.02) {
        const g = sampleSequence(next, t, newFrame(), change);
        apply(g);
        expect(cuts(arm(), g.lid), `${first} ${at} s → ${next} ${t.toFixed(2)} s`).toBe(0);
        // Nothing on the arm but the stylus ever reaches the vinyl.
        const tip = stylusAt(g.armYaw, g.armPitch);
        for (const q of surfacePoints(get('tonearm_lift'), 0.02)) {
          if (Math.hypot(q.x - PLATTER.x, q.z - PLATTER.z) > PLATTER.radius + 0.002 || q.distanceTo(tip) < 0.004) continue;
          expect(q.y, `${first} ${at} s → ${next} ${t.toFixed(2)} s`).toBeGreaterThan(RECORD_TOP - 1e-4);
        }
      }
    }
  });
});


// ── The scene under the real director, stepper and frame clock ─────────────────────
describe('Party plays on and changes its mind (scene, VisualDirector and FixedStepper as the controller runs them)', () => {
  /** A fresh scene on the exported hierarchy, driven frame by frame as controller.ts frame() does. */
  function harness() {
    const root = threeFromDoc(doc);
    const get = (n: string) => root.getObjectByName(n)!;
    extendLid(get('lid_hinge'));
    const statusMaterial = new MeshStandardMaterial();
    statusMaterial.userData.statusOff = { color: statusMaterial.color.clone(), metalness: 1, roughness: 0.3 };
    const scene = new PartyScene(
      {
        root, nodes: Object.fromEntries(PARTY_NODES.map((n) => [n, get(n)])), recordShadow: { setHeight() {} },
        statusMaterial, bounds: PARTY_BOUNDS.clone(), leverRest: get('cue_lever').quaternion.clone(), liftRest: get('cue_lift').position.clone(), setLabel() {}, dispose() {},
      } as unknown as RecordPlayerRig,
      { category: 'party', label: 'coral', songId: 'sample-track-a' },
    );
    const completed: string[] = [];
    const director = new VisualDirector({ complete: (s) => completed.push(s) }, 'guest', null);
    director.attach(scene);
    const stepper = new FixedStepper();
    let now = 0;
    director.update(now);
    const shown = () => ({
      spin: get('record_secondary').rotation.y, platter: get('platter').rotation.y, yaw: get('tonearm_pivot').rotation.y, pitch: get('tonearm_lift').rotation.x,
      lid: get('lid_hinge').rotation.x, lit: statusMaterial.emissiveIntensity > 0,
    });
    /** One displayed frame `dt` after the last (the clock's delta): director, stepped simulation, beforeRender. */
    const frame = (dt: number) => {
      now += dt;
      const playing = director.update(now);
      stepper.advance(dt, (h) => scene.simulate(h));
      scene.beforeRender();
      return { ...shown(), playing, settling: scene.settling() };
    };
    return { scene, director, frame, shown, completed, time: () => now };
  }
  /** Angle difference wrapped to (−π, π]. */
  const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
  /** Deterministic frame intervals: `hz` with ±0.4 ms of jitter. */
  const intervals = (hz: number, seconds: number) => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    return Array.from({ length: Math.round(seconds * hz) }, () => 1 / hz + (rnd() - 0.5) * 0.0008);
  };

  it('the record plays on after acceptance: at 60, 120 and 144 Hz with jitter every frame shows the closed form at that frame’s time, through the clip’s end', () => {
    for (const hz of [60, 120, 144]) {
      const { director, frame } = harness();
      director.setIntent('accept');
      let t = 0, worst = 0;
      for (const dt of intervals(hz, 5)) {
        t += dt;
        const f = frame(dt);
        worst = Math.max(worst, Math.abs(wrap(-f.spin - platterAt(ACCEPT_PLATTER, t).angle)));
        expect(f.platter).toBe(f.spin);
        if (t > DURATIONS.accept) expect(f.settling).toBe(true);
      }
      // Exact to float precision: no step at the hand-over and no fixed-step judder.
      expect(worst, `${hz} Hz`).toBeLessThan(1e-9);
    }
  });

  it('the old fixed 1/120 s stepper would have juddered: the stepper’s steps now sum to each frame’s delta', () => {
    for (const hz of [60, 120, 144]) {
      const stepper = new FixedStepper();
      for (const dt of intervals(hz, 2)) {
        let sum = 0;
        const n = stepper.advance(dt, (h) => { sum += h; expect(h).toBeLessThanOrEqual(1 / 120 + 1e-12); });
        expect(n).toBeGreaterThan(0);
        expect(sum).toBeCloseTo(dt, 12);
      }
    }
  });

  it('replays never accumulate angle: replaying acceptance after playing for a while shows exactly the clip, then the same play', () => {
    const { director, frame } = harness();
    director.setIntent('accept');
    for (const dt of intervals(60, 6)) frame(dt);
    director.replay();
    let t = 0;
    for (const dt of intervals(60, 3)) {
      t += dt;
      const f = frame(dt);
      expect(Math.abs(wrap(-f.spin - platterAt(ACCEPT_PLATTER, t).angle)), `${t.toFixed(3)} s`).toBeLessThan(1e-9);
      if (t < DURATIONS.accept) expect(f.yaw).toBeCloseTo(sampleSequence('accept', t, newFrame()).armYaw, 12);
    }
  });

  it('the canonical accepted pose is the record at its display angle: reduced motion snaps a playing record to it and holds it still', () => {
    const { director, frame, scene } = harness();
    director.setIntent('accept');
    for (const dt of intervals(60, 4)) frame(dt);
    director.setReducedMotion(true);
    const f = frame(0);
    expect(f.spin).toBeCloseTo(-DISPLAY_ANGLE, 12);
    close(playingFrame(ACCEPT_PLATTER, ACCEPTED_AT, newFrame()), pose('accepted'));
    // The controller does not step `simulate` under reduced motion: the pose stays put.
    scene.beforeRender();
    expect(f.spin).toBe(frame(0).spin);
    expect(f.yaw).toBe(ARM.played);
    expect(f.pitch).toBe(ARM.contact);
    expect(f.lit).toBe(true);
  });

  it('decline while the record plays: the platter coasts down from its speed, the key goes dark, the arm lifts before it swings home and is lowered onto its rest, the cover closes; no frame steps', () => {
    const { director, frame, completed } = harness();
    director.setIntent('accept');
    const dts = intervals(60, 3);
    let prev = frame(dts[0]!);
    for (const dt of dts.slice(1)) prev = frame(dt);
    const before = -prev.spin, step0 = wrap(-frame(1 / 60).spin - before);
    prev = frame(0);
    const yawAtChange = prev.yaw;
    director.setIntent('decline');
    let last = prev, lastStep = step0, t = 0;
    for (let i = 0; i < 90; i++) {
      t += 1 / 60;
      const f = frame(1 / 60);
      const step = wrap(-f.spin + last.spin);
      if (t < 1.3) {
        // Coasting: the record keeps turning the same way, a little slower each frame, from its playing speed.
        expect(step, `${t.toFixed(3)} s`).toBeGreaterThan(0);
        expect(step).toBeLessThanOrEqual(lastStep + 1e-9);
        if (i === 0) expect(step / step0).toBeGreaterThan(0.98);
        expect(f.lit).toBe(false);
      }
      // No channel jumps: the arm and cover move no faster than their authored paths (the swing to
      // the cue peaks at 0.091 rad a frame, the lift at 0.012, the closing cover at 0.035).
      expect(Math.abs(f.yaw - last.yaw), `yaw ${t.toFixed(3)} s`).toBeLessThan(0.095);
      expect(Math.abs(f.pitch - last.pitch), `pitch ${t.toFixed(3)} s`).toBeLessThan(0.012);
      expect(Math.abs(f.lid - last.lid), `lid ${t.toFixed(3)} s`).toBeLessThan(0.08);
      // The stylus is clear of the vinyl whenever the arm has left the groove.
      const tip = stylusAt(f.yaw, f.pitch);
      if (Math.abs(f.yaw - yawAtChange) > 0.004 && Math.hypot(tip.x - PLATTER.x, tip.z - PLATTER.z) < RECORD.radius) expect(tip.y).toBeGreaterThan(RECORD_TOP + 0.003);
      last = f;
      lastStep = step;
    }
    expect(completed).toContain('decline');
    expect(last.yaw).toBe(ARM.parked);
    expect(last.pitch).toBe(0);
    expect(last.lid).toBe(LID_CLOSED);
    expect(last.settling).toBe(false);
  });

  it('decline during the swing to the cue turns the arm back from its own velocity (no instant reversal), and accept after a decline began lifts the cover back from where it was', () => {
    const { director, frame } = harness();
    director.setIntent('accept');
    let prev = frame(0);
    for (let i = 0; i < 36; i++) prev = frame(1 / 60); // mid-swing (0.35–0.9 s)
    const before = frame(1 / 60);
    const rate = before.yaw - prev.yaw;
    expect(rate).toBeLessThan(0); // swinging towards the record
    director.setIntent('decline');
    const after = frame(1 / 60);
    // Same direction and similar speed in the first frame after the change.
    expect((after.yaw - before.yaw) / rate).toBeGreaterThan(0.6);
    // Change back once the cover has started to close.
    let f = after;
    for (let i = 0; i < 40; i++) f = frame(1 / 60);
    expect(f.lid).toBeGreaterThan(LID_OPEN + 0.05);
    director.setIntent('accept');
    let last = frame(1 / 60);
    for (let i = 0; i < 300; i++) { // past the lead-in
      const g = frame(1 / 60);
      expect(g.lid).toBeGreaterThanOrEqual(LID_OPEN - 1e-12);
      expect(Math.abs(g.lid - last.lid)).toBeLessThan(0.08);
      expect(Math.abs(g.yaw - last.yaw)).toBeLessThan(0.095);
      last = g;
    }
    expect(last.lid).toBe(LID_OPEN);
    expect(last.yaw).toBeCloseTo(ARM.played, 12);
    expect(last.settling).toBe(true);
  });

  it('a change of mind never pops the arm (v1.5 polish): at every moment of the clip and while it plays, the next clip starts exactly from the pose on screen and the pitch moves no faster than the cue lever', () => {
    const times = [...Array.from({ length: 37 }, (_, i) => i * 0.05), 2.5, 4.0, 6.0];
    for (const at0 of times) {
      const { director, frame } = harness();
      director.setIntent('accept');
      let before = frame(0);
      for (let t = 0; t < at0 - 1e-9; t += 1 / 120) before = frame(1 / 120);
      director.setIntent('decline');
      let prev = frame(0);
      // The cut is never seen: the decline's first frame is the frame that was showing.
      expect(Math.abs(prev.yaw - before.yaw), `${at0} s yaw`).toBeLessThan(1e-12);
      expect(Math.abs(prev.pitch - before.pitch), `${at0} s pitch`).toBeLessThan(1e-12);
      for (let i = 0; i < 60; i++) {
        const f = frame(1 / 120);
        // The lift's peak rate is 0.36 rad/s; anything faster is a pop.
        expect(Math.abs(f.pitch - prev.pitch) * 120, `${at0} s + ${i} frames`).toBeLessThan(0.4);
        prev = f;
      }
    }
  });

  it('rapid reversals keep the arm inside its mechanism and never make it wobble (v1.5 polish)', () => {
    const YAW_IN = Math.min(ARM.played, ARM.parked), YAW_OUT = Math.max(ARM.played, ARM.parked);
    for (let t1 = 0.05; t1 < 1.9; t1 += 0.1) {
      for (let d2 = 0.05; d2 < 0.7; d2 += 0.1) {
        const { director, frame } = harness();
        director.setIntent('accept');
        let f = frame(0);
        for (let t = 0; t < t1; t += 1 / 60) f = frame(1 / 60);
        const segments: number[][] = [];
        for (const [choice, hold] of [['decline', d2], ['accept', DURATIONS.accept + 0.2]] as const) {
          director.setIntent(choice);
          const yaws = [frame(0).yaw];
          for (let t = 0; t < hold; t += 1 / 60) {
            f = frame(1 / 60);
            const label = `accept → decline at ${t1.toFixed(2)} s → accept ${d2.toFixed(2)} s later`;
            expect(f.yaw, label).toBeGreaterThanOrEqual(YAW_IN - 1e-12);
            expect(f.yaw, label).toBeLessThanOrEqual(YAW_OUT + 1e-12);
            expect(f.pitch, label).toBeGreaterThanOrEqual(ARM.lifted - 1e-12);
            expect(f.pitch, label).toBeLessThanOrEqual(ARM.contact + 1e-12);
            yaws.push(f.yaw);
          }
          segments.push(yaws);
        }
        // Critically damped: within each movement (a run of frames without a pause) the yaw turns
        // round at most once (the hand's brake). A pause (the cue's descent) ends a movement: the
        // groove's lead-in that follows is the next one.
        for (const yaws of segments) {
          let turns = 0, dir = 0, still = 0;
          for (let i = 1; i < yaws.length; i++) {
            const d = yaws[i]! - yaws[i - 1]!;
            if (Math.abs(d) < 1e-7) {
              if (++still >= 6) { dir = 0; turns = 0; }
              continue;
            }
            still = 0;
            const s = Math.sign(d);
            if (dir !== 0 && s !== dir) turns++;
            dir = s;
            expect(turns, `accept → decline at ${t1.toFixed(2)} s → accept ${d2.toFixed(2)} s later`).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });

  it('rapid reversals end on the accepted pose with the record playing, and a snap then shows exactly the canonical pose', () => {
    const { director, frame } = harness();
    for (const choice of ['accept', 'decline', 'accept', 'decline', 'accept'] as const) {
      director.setIntent(choice);
      for (let i = 0; i < 7; i++) frame(1 / 60);
    }
    let f = frame(1 / 60);
    for (let i = 0; i < 300; i++) f = frame(1 / 60); // past the lead-in (ACCEPTED_AT)
    expect(f.settling).toBe(true);
    expect(f.yaw).toBeCloseTo(ARM.played, 12);
    expect(f.pitch).toBeCloseTo(ARM.contact, 12);
    expect(f.lid).toBe(LID_OPEN);
    expect(f.lit).toBe(true);
    const next = frame(1 / 60);
    expect(wrap(-next.spin + f.spin)).toBeCloseTo(RPM_33 / 60, 3);
    director.setReducedMotion(true);
    expect(frame(0).spin).toBeCloseTo(-DISPLAY_ANGLE, 12);
  });
});

describe('Party dust cover look (the decline flash fix)', () => {
  const root = threeFromDoc(doc);
  const hinge = root.getObjectByName('lid_hinge')!;
  extendLid(hinge);
  const shell = hinge.children.find((c) => ((c as Mesh).material as MeshStandardMaterial | undefined)?.name === 'tt_lid') as Mesh;
  // The runtime lid material is physical (clearcoat); stand it in for the test hierarchy's.
  const physical = new MeshPhysicalMaterial({ name: 'tt_lid', color: (shell.material as MeshStandardMaterial).color, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.08 });
  shell.material = physical;
  const trianglesBefore = (shell.geometry.index?.count ?? shell.geometry.getAttribute('position').count) / 3;
  const innerMaterial = splitLidInterior(hinge)!;
  const inner = hinge.getObjectByName('lid_shell_inner') as Mesh;
  const tris = (g: BufferGeometry) => g.index!.count / 3;

  it('splits the shell into its outside and its inside without losing a triangle (idempotent)', () => {
    expect(inner).toBeDefined();
    expect(tris(shell.geometry) + tris(inner.geometry)).toBe(trianglesBefore);
    expect(tris(inner.geometry)).toBeGreaterThan(0.2 * trianglesBefore);
    expect(tris(shell.geometry)).toBeGreaterThan(0.2 * trianglesBefore);
    expect(splitLidInterior(hinge)).toBeNull();
    expect(hinge.children.filter((c) => c.name === 'lid_shell_inner')).toHaveLength(1);
  });

  it('every inside triangle faces into the closed box, every outside one faces out; the inside covers the top panel and the walls', () => {
    const box = new Box3().setFromBufferAttribute(shell.geometry.getAttribute('position') as never);
    const centre = box.getCenter(new Vector3());
    const facing = (g: BufferGeometry) => {
      const pos = g.getAttribute('position'), idx = g.index!;
      const a = new Vector3(), b = new Vector3(), c = new Vector3(), n = new Vector3(), e = new Vector3();
      const out: { dot: number; n: Vector3; y: number }[] = [];
      for (let i = 0; i < idx.count; i += 3) {
        a.fromBufferAttribute(pos, idx.getX(i)); b.fromBufferAttribute(pos, idx.getX(i + 1)); c.fromBufferAttribute(pos, idx.getX(i + 2));
        n.subVectors(c, b).cross(e.subVectors(a, b));
        if (n.lengthSq() === 0) continue;
        const centroid = a.clone().add(b).add(c).divideScalar(3);
        out.push({ dot: n.dot(centroid.clone().sub(centre)), n: n.clone().normalize(), y: centroid.y });
      }
      return out;
    };
    const ins = facing(inner.geometry), outs = facing(shell.geometry);
    expect(ins.every((f) => f.dot < 0)).toBe(true);
    expect(outs.every((f) => f.dot >= 0)).toBe(true);
    // The top panel's underside (normal down) and the back wall's inner face (normal forward) are inside.
    expect(ins.some((f) => f.n.y < -0.99)).toBe(true);
    expect(ins.some((f) => f.n.z > 0.99)).toBe(true);
    expect(outs.some((f) => f.n.y > 0.99)).toBe(true);
  });

  it('the inside is darker and uncoated, with occlusion deepest under the top panel; the outside keeps the master’s coat', () => {
    expect(innerMaterial.name).toBe('tt_lid_inner');
    expect(inner.material).toBe(innerMaterial);
    expect(innerMaterial.clearcoat).toBe(0);
    expect(innerMaterial.defines).toHaveProperty('PHYSICAL');
    expect(innerMaterial.specularIntensity).toBe(LID_LOOK.inner.specularIntensity);
    expect(innerMaterial.color.r).toBeCloseTo(physical.color.r * LID_LOOK.inner.tint, 6);
    expect(innerMaterial.vertexColors).toBe(true);
    const ao = inner.geometry.getAttribute('color'), pos = inner.geometry.getAttribute('position');
    let lo = Infinity, hi = -Infinity, atTop = 1, yTop = -Infinity;
    for (let i = 0; i < ao.count; i++) {
      lo = Math.min(lo, ao.getX(i)); hi = Math.max(hi, ao.getX(i));
      if (pos.getY(i) > yTop) { yTop = pos.getY(i); atTop = ao.getX(i); }
    }
    expect(lo).toBeGreaterThanOrEqual(LID_LOOK.inner.aoDeep - 1e-6);
    expect(hi).toBeLessThanOrEqual(LID_LOOK.inner.aoRim + 1e-6);
    expect(atTop).toBeLessThan(LID_LOOK.inner.aoDeep + 0.05);
    // Outside: the master's own coat, untouched (studio pass v1.3 removed the satin regrade).
    expect(physical.clearcoat).toBe(0.6);
    expect(physical.clearcoatRoughness).toBe(0.08);
    expect(physical.roughness).toBe(0.3);
  });
});

describe('Party framing (Master §5)', () => {
  it('the record player fills 60–75 % of the stage width in the ready pose, as v1.1 did', () => {
    const camera = new OrthographicCamera();
    fitCameraToBounds(camera, PARTY_BOUNDS, 1, undefined, partyFramePoints());
    const inv = camera.matrixWorldInverse;
    let min = Infinity, max = -Infinity;
    for (const x of [-PLAYER.width / 2, PLAYER.width / 2]) {
      for (const z of [-PLAYER.depth / 2, PLAYER.depth / 2]) {
        for (const y of [0, PLAYER.deck]) {
          const p = new Vector3(x, y, z).applyMatrix4(inv);
          min = Math.min(min, p.x);
          max = Math.max(max, p.x);
        }
      }
    }
    const fill = (max - min) / (camera.right - camera.left);
    expect(fill).toBeGreaterThanOrEqual(0.6);
    expect(fill).toBeLessThanOrEqual(0.75);
  });

  it('every frame point lies inside the motion bounds', () => {
    const b = PARTY_BOUNDS.clone().expandByScalar(1e-6);
    for (const p of partyFramePoints()) expect(b.containsPoint(p), p.toArray().join(', ')).toBe(true);
  });
});
