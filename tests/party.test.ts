import { describe, expect, it } from 'vitest';
import { Box3, Color, DoubleSide, Mesh, MeshBasicMaterial, MeshStandardMaterial, type Object3D, Raycaster, Vector3 } from 'three';
import { DIRECTIONS, type MaterialLibrary } from '../src/render/materials.ts';
import {
  LID, PARTY_BOUNDS, PARTY_NODES, PLATTER, PLATTER_TOP, RECORD, RECORD_TOP, stylusAt, TONEARM, tonearmYawFor,
} from '../models/recordContract.ts';
import type { RecordPlayerRig } from '../models/recordPlayer.ts';
import { buildRecordPlayerGeometry } from '../models/recordPremium.ts';
import { PartyScene } from '../src/scenes/party/index.ts';
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

/**
 * World-space samples of every triangle under `o`, no more than `step` apart along any edge,
 * so a 1.4 cm wall cannot slip between them (vertices alone leave the wide flat faces unsampled).
 */
function surfacePoints(o: Object3D, step = 0.01): Vector3[] {
  o.updateWorldMatrix(true, true);
  const out: Vector3[] = [];
  const a = new Vector3(), b = new Vector3(), c = new Vector3();
  o.traverse((node) => {
    const m = node as Mesh;
    if (!m.isMesh) return;
    const pos = m.geometry.getAttribute('position');
    const index = m.geometry.index;
    const count = index ? index.count : pos.count;
    const vertex = (v: Vector3, i: number) => v.fromBufferAttribute(pos, index ? index.getX(i) : i).applyMatrix4(m.matrixWorld);
    for (let i = 0; i < count; i += 3) {
      vertex(a, i); vertex(b, i + 1); vertex(c, i + 2);
      const n = Math.max(1, Math.ceil(Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a)) / step));
      for (let u = 0; u <= n; u++) {
        for (let v = 0; v <= n - u; v++) out.push(new Vector3().addScaledVector(a, (n - u - v) / n).addScaledVector(b, u / n).addScaledVector(c, v / n));
      }
    }
  });
  return out;
}

describe('Party model contract', () => {
  const lib = plainLibrary();
  const root = buildRecordPlayerGeometry({ lib }, 'coral');
  const get = (n: string) => root.getObjectByName(n)!;

  /** Pose the built hierarchy from a choreography frame, as PartyScene does the loaded one. */
  const apply = (f: PartyFrame) => {
    get('record_authored').position.copy(f.recordPos);
    get('record_authored').rotation.set(f.recordTilt, 0, 0);
    get('record_secondary').rotation.set(f.wobble, f.spin, 0);
    get('platter').rotation.set(0, f.spin, 0);
    get('tonearm_pivot').rotation.set(0, f.armYaw, 0);
    get('tonearm_lift').rotation.set(f.armPitch, 0, 0);
    get('lid_hinge').rotation.set(f.lid, 0, 0);
    root.updateMatrixWorld(true);
  };

  it('the closed dust cover encloses the record and parked tonearm with clearance', () => {
    apply(pose('declined'));
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

  it('the swinging dust cover never cuts through the platter, record or tonearm', () => {
    // Shell in lid_mesh space (x across, z forward from the hinge, y up): the built outer skin
    // less a cavity open underneath, with walls and top LID.wall thick.
    const shell = (get('lid_shell') as Mesh).geometry;
    shell.computeBoundingBox();
    const outer = shell.boundingBox!.clone();
    expect(outer.max.x - outer.min.x).toBeCloseTo(LID.width, 4);
    expect(outer.max.y - outer.min.y).toBeCloseTo(LID.height, 4);
    expect(outer.max.z - outer.min.z).toBeCloseTo(LID.length, 4);
    const cavity = new Box3(outer.min.clone().add(new Vector3(LID.wall, -1, LID.wall)), outer.max.clone().subScalar(LID.wall));
    const lidMesh = get('lid_mesh');
    const local = new Vector3();
    const cuts = (points: Vector3[]) => {
      const toLid = lidMesh.matrixWorld.clone().invert();
      return points.filter((p) => {
        local.copy(p).applyMatrix4(toLid);
        return outer.containsPoint(local) && !cavity.containsPoint(local);
      }).length;
    };
    const parts = () => ['platter', 'record_authored', 'tonearm_pivot'].flatMap((n) => surfacePoints(get(n)));

    // Decline closes over the guest-ready arrangement (seated record, parked arm): sweep it.
    apply(pose('guest-ready'));
    const ready = parts();
    expect(ready.length).toBeGreaterThan(10_000);
    const steps = 132;
    for (let i = 0; i <= steps; i++) {
      get('lid_hinge').rotation.x = LID.open + (LID.closed - LID.open) * (i / steps);
      root.updateMatrixWorld(true);
      expect(cuts(ready), `lid at ${get('lid_hinge').rotation.x.toFixed(3)} rad`).toBe(0);
    }
    // The open cover also clears the presented record and the playing arm.
    for (const p of ['host-ready', 'accepted'] as const) {
      apply(pose(p));
      expect(cuts(parts()), p).toBe(0);
    }
  });

  it('the closed lid frames its top panel with one reveal wide and deep enough to read on a phone', () => {
    // Cross-sections of the outer skin across the right and front edges (lid_mesh space). The
    // 8 × 2 mm groove broke into dashes at phone scale (checkpoint 4); the reveal must span
    // ≥ 12 mm and sink ≥ 3 mm, as a single run, so it resolves as one continuous line.
    const shell = new Mesh((get('lid_shell') as Mesh).geometry, new MeshBasicMaterial({ side: DoubleSide }));
    const box = new Box3().setFromObject(shell);
    const top = box.max.y, step = 0.0005;
    const ray = new Raycaster();
    const section = (at: (inset: number) => [number, number]) => Array.from({ length: 121 }, (_, i) => {
      const [x, z] = at(0.03 + i * step);
      ray.set(new Vector3(x, top + 0.1, z), new Vector3(0, -1, 0));
      return ray.intersectObject(shell)[0]!.point.y;
    });
    const mid = box.getCenter(new Vector3());
    const sections = { right: section((d) => [box.max.x - d, mid.z]), front: section((d) => [mid.x, box.max.z - d]) };
    for (const [side, heights] of Object.entries(sections)) {
      const below = heights.map((y) => y < top - 0.00025);
      expect(below.filter((b, i) => b && !below[i - 1]).length, side).toBe(1);
      expect(below.filter(Boolean).length * step, side).toBeGreaterThanOrEqual(0.012);
      expect(top - Math.min(...heights), side).toBeGreaterThanOrEqual(0.003);
    }
  });

  it('the open lid, hovering record and playing arm stay inside the motion bounds', () => {
    // Tight envelope of the authored motion; PARTY_BOUNDS adds framing margin on x only.
    const motion = new Box3(new Vector3(-1.07, -0.01, -1.01), new Vector3(1.07, 1.87, 0.81));
    const framed = PARTY_BOUNDS.clone().expandByScalar(0.01);
    const check = (label: string) => {
      const box = worldBox(root);
      expect(motion.containsBox(box), label).toBe(true);
      expect(framed.containsBox(box), label).toBe(true);
    };
    for (const p of ['host-ready', 'guest-ready', 'accepted', 'declined'] as const) {
      apply(pose(p));
      check(p);
    }
    for (const seq of ['host', 'accept', 'decline'] as const) {
      for (let t = 0; t <= DURATIONS[seq]; t += 0.05) {
        apply(at(seq, t));
        check(`${seq} ${t.toFixed(2)} s`);
      }
    }
  });

  it('an interruption during the arm lift never drops the arm in one frame, and never drags it', () => {
    const scene = new PartyScene(
      {
        root, nodes: Object.fromEntries(PARTY_NODES.map((n) => [n, get(n)])), recordShadow: { setHeight() {} },
        statusMaterial: new MeshStandardMaterial(), bounds: PARTY_BOUNDS.clone(), setLabel() {}, dispose() {},
      } as unknown as RecordPlayerRig,
      lib,
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
        expect(Math.abs(pitch - prev), label).toBeLessThanOrEqual(k === 0 ? Math.abs(blendLift(yaw0)) + 1e-12 : 0.002);
        const tip = stylusAt(yawNode.rotation.y, pitch);
        if (Math.hypot(tip.x - PLATTER.x, tip.z - PLATTER.z) < RECORD.radius && Math.abs(yawNode.rotation.y - ARM.cue) > 0.01) {
          expect(tip.y).toBeGreaterThan(RECORD_TOP + 0.005);
        }
        prev = pitch;
      }
    }
  });
});

describe('Party framing (Master §5)', () => {
  it('the record player fills 60–75 % of the stage width in the ready pose', async () => {
    const { OrthographicCamera } = await import('three');
    const { fitCameraToBounds } = await import('../src/render/camera.ts');
    const { PARTY_BOUNDS, PLAYER } = await import('../models/recordContract.ts');
    const camera = new OrthographicCamera();
    fitCameraToBounds(camera, PARTY_BOUNDS, 1);
    // The player's own footprint (body box) projected with the fitted camera.
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
});
