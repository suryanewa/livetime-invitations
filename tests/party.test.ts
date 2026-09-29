import { describe, expect, it } from 'vitest';
import { Box3, Color, MeshStandardMaterial, type Object3D, Vector3 } from 'three';
import { DIRECTIONS, type MaterialLibrary } from '../src/render/materials.ts';
import { LID, PLATTER, PLATTER_TOP, RECORD, RECORD_TOP, stylusAt, TONEARM, tonearmYawFor } from '../models/recordContract.ts';
import { buildRecordPlayerGeometry } from '../models/recordPremium.ts';
import { ARM, DURATIONS, LEVEL_BY, PLAY_AT, SPIN } from '../src/scenes/party/poses.ts';
import { blendLift, frameFor, newFrame, sampleSequence, type PartyFrame } from '../src/scenes/party/sequences.ts';
import type { CanonicalPose, SequenceName } from '../src/core/types.ts';

const at = (seq: SequenceName, t: number) => sampleSequence(seq, t, newFrame());
const pose = (p: CanonicalPose) => frameFor(p, newFrame());

function close(a: PartyFrame, b: PartyFrame, eps = 1e-6) {
  expect(a.recordPos.distanceTo(b.recordPos)).toBeLessThan(eps);
  for (const k of ['recordTilt', 'wobble', 'spin', 'armYaw', 'armPitch', 'lid'] as const) expect(Math.abs(a[k] - b[k])).toBeLessThan(eps);
  expect(a.status).toBe(b.status);
}

describe('Party choreography', () => {
  it('host starts at host-ready and ends exactly at guest-ready', () => {
    close(at('host', 0), pose('host-ready'));
    close(at('host', DURATIONS.host), pose('guest-ready'));
  });

  it('accept and decline start at guest-ready and end at their canonical poses', () => {
    close(at('accept', 0), pose('guest-ready'));
    close(at('decline', 0), pose('guest-ready'));
    close(at('accept', DURATIONS.accept), pose('accepted'));
    close(at('decline', DURATIONS.decline), pose('declined'));
  });

  it('has no discontinuities: consecutive 1 ms samples never jump', () => {
    for (const seq of ['host', 'accept', 'decline'] as const) {
      let prev = at(seq, 0);
      for (let i = 1; i <= DURATIONS[seq] * 1000; i++) {
        const cur = at(seq, i / 1000);
        expect(cur.recordPos.distanceTo(prev.recordPos)).toBeLessThan(0.01);
        expect(Math.abs(cur.recordTilt - prev.recordTilt)).toBeLessThan(0.02);
        expect(Math.abs(cur.spin - prev.spin)).toBeLessThan(0.02);
        expect(Math.abs(cur.armYaw - prev.armYaw)).toBeLessThan(0.02);
        expect(Math.abs(cur.lid - prev.lid)).toBeLessThan(0.02);
        prev = cur;
      }
    }
  });

  it('the status mark lights exactly once, at the playback beat, and never on decline', () => {
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

  it('the record is level and centred before its hole reaches the spindle, and never dips into the platter', () => {
    for (let i = 0; i <= 1200; i++) {
      const f = at('host', i / 1000);
      const h = f.recordPos.y - PLATTER_TOP;
      if (h < LEVEL_BY) {
        expect(Math.abs(f.recordTilt)).toBeLessThan(1e-3);
        expect(Math.hypot(f.recordPos.x - PLATTER.x, f.recordPos.z - PLATTER.z)).toBeLessThan(1e-3);
      }
      // Lowest point of the (tilted) disc stays on or above the platter.
      const lowest = f.recordPos.y - RECORD.radius * Math.abs(Math.sin(f.recordTilt + f.wobble));
      if (h < 0.3) expect(lowest).toBeGreaterThanOrEqual(PLATTER_TOP - 1e-4);
    }
  });

  it('the record turns only inside the acceptance clip, monotonically, and lands on the display angle', () => {
    let prev = 0;
    for (let i = 0; i <= 1600; i++) {
      const s = at('accept', i / 1000).spin;
      expect(s).toBeLessThanOrEqual(prev + 1e-9);
      prev = s;
    }
    expect(at('accept', 1.6).spin).toBeCloseTo(SPIN.total, 9);
    expect(Math.abs(at('accept', 0.29).spin)).toBe(0);
    for (const p of ['guest-ready', 'declined'] as const) expect(pose(p).spin).toBe(0);
  });

  it('the stylus lands on the groove and stays on the record; parked it is clear of the record', () => {
    for (let i = 400; i <= 1600; i++) {
      const f = at('accept', i / 1000);
      const tip = stylusAt(f.armYaw, f.armPitch);
      expect(tip.y).toBeCloseTo(RECORD_TOP, 6);
      const r = Math.hypot(tip.x - PLATTER.x, tip.z - PLATTER.z);
      expect(r).toBeGreaterThan(RECORD.grooveInner);
      expect(r).toBeLessThanOrEqual(RECORD.grooveOuter + 1e-6);
    }
    const parked = stylusAt(TONEARM.parkedYaw, 0);
    expect(Math.hypot(parked.x - PLATTER.x, parked.z - PLATTER.z)).toBeGreaterThan(RECORD.radius + 0.1);
    expect(Math.hypot(stylusAt(tonearmYawFor(0.5), 0).x - PLATTER.x, stylusAt(tonearmYawFor(0.5), 0).z - PLATTER.z)).toBeCloseTo(0.5, 6);
  });

  it('the arm is lifted whenever it swings over the record (sequence and interruption blends)', () => {
    for (let i = 0; i <= 250; i++) {
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
    expect(blendLift(ARM.played)).toBe(0);
    expect(blendLift(ARM.parked)).toBe(0);
  });

  it('the lid closes on its hinge without passing closed, braking into a soft close', () => {
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
    expect(at('decline', 1.4).lid).toBe(0);
  });
});

/** Plain named materials: geometry tests run in Node (no canvas textures). */
function plainLibrary(): MaterialLibrary {
  const direction = DIRECTIONS.L2;
  const cache = new Map<string, MeshStandardMaterial>();
  const make = (name: string) => {
    const spec = direction.surfaces[name];
    if (!spec) throw new Error(`Unknown material ${name}`);
    return new MeshStandardMaterial({ name, color: new Color(spec.color) });
  };
  return {
    direction,
    get: (name: string) => cache.get(name) ?? (cache.set(name, make(name)), cache.get(name)!),
    unique: make,
    dispose() {},
  } as unknown as MaterialLibrary;
}

function worldBox(o: Object3D): Box3 {
  o.updateWorldMatrix(true, true);
  return new Box3().setFromObject(o, true);
}

describe('Party model contract', () => {
  const root = buildRecordPlayerGeometry({ lib: plainLibrary() }, 'coral');
  const get = (n: string) => root.getObjectByName(n)!;

  it('the closed dust cover encloses the record and parked tonearm with clearance', () => {
    get('lid_hinge').rotation.x = LID.closed;
    get('tonearm_pivot').rotation.y = TONEARM.parkedYaw;
    const lid = worldBox(get('lid_mesh'));
    const arm = worldBox(get('tonearm_mesh'));
    const record = worldBox(get('record_authored'));
    const innerTop = lid.max.y - 0.012; // top panel ≥ wall thickness
    expect(arm.max.y + 0.012).toBeLessThanOrEqual(innerTop + 1e-6);
    expect(record.max.y + 0.012).toBeLessThanOrEqual(innerTop + 1e-6);
    for (const b of [arm, record]) {
      expect(b.min.x).toBeGreaterThan(lid.min.x + LID.wall);
      expect(b.max.x).toBeLessThan(lid.max.x - LID.wall);
      expect(b.min.z).toBeGreaterThan(lid.min.z + LID.wall);
      expect(b.max.z).toBeLessThan(lid.max.z - LID.wall);
    }
  });

  it('the open lid, hovering record and playing arm stay inside the motion bounds', () => {
    get('lid_hinge').rotation.x = LID.open;
    const bounds = new Box3(new Vector3(-1.07, -0.01, -1.01), new Vector3(1.07, 1.87, 0.81));
    expect(bounds.containsBox(worldBox(root))).toBe(true);
  });
});
