import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { Box3, Color, type Mesh, MeshStandardMaterial, Object3D, PointLight, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CARD, HOOK, type KeycardRig } from '../models/keycard.ts';
import { DIRECTIONS, type MaterialLibrary } from '../src/render/materials.ts';
import { BusinessScene } from '../src/scenes/business/index.ts';
import { DURATIONS, SCAN_AT, STATUS_COLOURS } from '../src/scenes/business/poses.ts';
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

describe('Business departure (checkpoint 4)', () => {
  /** Speeds sampled every millisecond: card pivot (u/s) and strap anchor x (u/s). */
  const speeds = (seq: 'accept' | 'decline') => {
    const out: { t: number; pivot: number; anchor: number }[] = [];
    let prev = at(seq, 0);
    for (let i = 1; i <= DURATIONS[seq] * 1000; i++) {
      const cur = at(seq, i / 1000);
      out.push({ t: i / 1000, pivot: cur.pivot.distanceTo(prev.pivot) * 1000, anchor: Math.abs(cur.anchorX - prev.anchorX) * 1000 });
      prev = cur;
    }
    return out;
  };

  it('the card leaves the pad from rest and never outruns its approach', () => {
    for (const seq of ['accept', 'decline'] as const) {
      const v = speeds(seq);
      const approach = Math.max(...v.filter((s) => s.t <= 0.7).map((s) => s.pivot));
      const approachAnchor = Math.max(...v.filter((s) => s.t <= 0.8).map((s) => s.anchor));
      const departure = v.filter((s) => s.t >= 0.9);
      // Peak about the approach's, not twice it.
      expect(Math.max(...departure.map((s) => s.pivot))).toBeLessThanOrEqual(approach * 1.15);
      expect(Math.max(...departure.map((s) => s.anchor))).toBeLessThanOrEqual(approachAnchor * 1.15);
      // Eases in from rest: no speed step between consecutive milliseconds (the old leg
      // jumped from 0 to 16 u/s in one), and it is still slow 30 ms after it starts.
      for (let i = 1; i < departure.length; i++) {
        expect(Math.abs(departure[i]!.pivot - departure[i - 1]!.pivot), `t=${departure[i]!.t}`).toBeLessThan(0.25);
        expect(Math.abs(departure[i]!.anchor - departure[i - 1]!.anchor), `t=${departure[i]!.t}`).toBeLessThan(0.25);
      }
      const start = departure.find((s) => s.pivot > 0.01)!;
      expect(departure.find((s) => s.t >= start.t + 0.03)!.pivot).toBeLessThan(approach * 0.5);
    }
  });

  it('the strap anchor trails the clip on the way to rest', () => {
    const scan = at('accept', 1.0);
    const rest = at('accept', DURATIONS.accept);
    for (let t = 1.1; t < DURATIONS.accept; t += 0.01) {
      const f = at('accept', t);
      const clip = (f.pivot.x - scan.pivot.x) / (rest.pivot.x - scan.pivot.x);
      const anchor = (f.anchorX - scan.anchorX) / (rest.anchorX - scan.anchorX);
      expect(anchor, `t=${t.toFixed(2)}`).toBeLessThanOrEqual(clip + 1e-9);
    }
  });
});

describe('Business legibility (checkpoint 4)', () => {
  it('the shipped reader stands on an ink foot, and both glyphs are large and centred inside the window', async () => {
    // The runtime GLB, not the builder: what ships is what is checked.
    const file = await readFile(new URL('../assets/scenes/business/business.glb', import.meta.url));
    const gltf = await new GLTFLoader().parseAsync(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer, '');
    const root = gltf.scene;
    root.updateMatrixWorld(true);
    const foot = root.getObjectByName('scanner_foot') as Mesh;
    expect((foot.material as MeshStandardMaterial).name).toBe('mat_body_ink');
    // Extents in the window plane, in scene units (quantisation scale is in the node matrices).
    const win = root.getObjectByName('scanner_light')!;
    const origin = new Vector3().setFromMatrixPosition(win.matrixWorld);
    const ux = new Vector3().setFromMatrixColumn(win.matrixWorld, 0).normalize();
    const uy = new Vector3().setFromMatrixColumn(win.matrixWorld, 1).normalize();
    const glyphs = ['scanner_symbol_accept', 'scanner_symbol_decline'].map((n) => root.getObjectByName(n)!);
    /** In-plane extents of an object's meshes, skipping the glyph subtrees. */
    const extent = (o: Object3D, skip: Object3D[] = []) => {
      const v = new Vector3();
      const e = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
      const visit = (n: Object3D) => {
        if (skip.includes(n)) return;
        const p = (n as Mesh).isMesh ? (n as Mesh).geometry.getAttribute('position') : null;
        for (let i = 0; p && i < p.count; i++) {
          v.fromBufferAttribute(p, i).applyMatrix4(n.matrixWorld).sub(origin);
          const x = v.dot(ux), y = v.dot(uy);
          e.x0 = Math.min(e.x0, x); e.x1 = Math.max(e.x1, x); e.y0 = Math.min(e.y0, y); e.y1 = Math.max(e.y1, y);
        }
        n.children.forEach(visit);
      };
      visit(o);
      return e;
    };
    const w = extent(win, glyphs);
    for (const glyph of glyphs) {
      const name = glyph.name;
      expect(glyph.parent).toBe(win);
      const g = extent(glyph);
      // At least 60 % of the window's width (about 12 CSS px on a 328 px stage)...
      expect(g.x1 - g.x0, name).toBeGreaterThanOrEqual(0.6 * (w.x1 - w.x0));
      // ...centred, and clear of the window's rounded edge on every side.
      expect(Math.abs((g.x1 + g.x0) / 2 - (w.x1 + w.x0) / 2), name).toBeLessThan(0.003);
      expect(Math.abs((g.y1 + g.y0) / 2 - (w.y1 + w.y0) / 2), name).toBeLessThan(0.003);
      expect(Math.min(g.x0 - w.x0, w.x1 - g.x1), name).toBeGreaterThan(0.02);
      expect(Math.min(g.y0 - w.y0, w.y1 - g.y1), name).toBeGreaterThan(0.015);
    }
    // Minus bar: a stroke of at least 0.03 u (about 3 CSS px on a 328 px stage).
    const minus = extent(glyphs[1]!);
    expect(minus.y1 - minus.y0).toBeGreaterThanOrEqual(0.03);
  });

  it('the lit window glows by emission over the idle glass, below tone-mapping compression, green brighter than red', () => {
    const nodes = Object.fromEntries(['card_authored', 'card_secondary', 'card_mesh', 'lanyard_anchor', 'scanner_light'].map((n) => [n, new Object3D()]));
    const rig = {
      root: new Object3D(), nodes, bounds: new Box3(), shadows: [{ setFootprint() {}, setHeight() {} }],
      statusMaterial: new MeshStandardMaterial(), symbolMaterial: new MeshStandardMaterial(),
      symbols: { accept: new Object3D(), decline: new Object3D() }, glow: { spill: new PointLight('#ffffff', 0) },
      gate: null, updateLanyard() {}, setTemplate() {}, dispose() {},
    } as unknown as KeycardRig;
    const scene = new BusinessScene(rig, { direction: DIRECTIONS.L2 } as MaterialLibrary, { category: 'business', template: 'light' });
    const glass = new Color(DIRECTIONS.L2.surfaces.mat_status!.color);
    const lit: Record<'accept' | 'decline', Color> = { accept: new Color(), decline: new Color() };
    for (const [pose, key] of [['accepted', 'accept'], ['declined', 'decline']] as const) {
      scene.pose(pose);
      const m = rig.statusMaterial;
      expect(m.color.equals(glass), pose).toBe(true);
      expect(`#${m.emissive.getHexString()}`).toBe(STATUS_COLOURS[key].toLowerCase());
      lit[key].copy(m.emissive).multiplyScalar(m.emissiveIntensity);
      // Neutral tone mapping starts compressing (and desaturating towards white) at 0.76.
      expect(Math.max(lit[key].r, lit[key].g, lit[key].b), pose).toBeLessThan(0.76);
      expect(rig.symbols[key].visible).toBe(true);
      expect(rig.glow!.spill.intensity).toBeGreaterThan(0);
      expect(rig.glow!.spill.intensity).toBeLessThan(0.5);
    }
    // A value step that survives deuteranopia (Machado 2009, severity 1): at least 2:1.
    const deutLum = (c: Color) => {
      const r = 0.367322 * c.r + 0.860646 * c.g - 0.227968 * c.b;
      const g = 0.280085 * c.r + 0.672501 * c.g + 0.047413 * c.b;
      const b = -0.01182 * c.r + 0.04294 * c.g + 0.968881 * c.b;
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    expect((deutLum(lit.accept) + 0.05) / (deutLum(lit.decline) + 0.05)).toBeGreaterThanOrEqual(2);
    scene.pose('guest-ready');
    expect(rig.statusMaterial.emissiveIntensity).toBe(0);
    expect(rig.glow!.spill.intensity).toBe(0);
    expect(rig.symbols.accept.visible || rig.symbols.decline.visible).toBe(false);
  });
});
