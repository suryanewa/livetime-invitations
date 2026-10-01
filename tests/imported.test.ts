import { describe, expect, it } from 'vitest';
import { Group, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, SphereGeometry, Texture, WebGLRenderTarget } from 'three';
import { DIRECTIONS, type MaterialLibrary } from '../src/render/materials.ts';
import { disposeImported, IMPORTED_OWN_ENV, importedLowDetail, prepareImported, setImportedLowDetail } from '../models/imported.ts';

const lib = { direction: DIRECTIONS.L2 } as unknown as MaterialLibrary;

function scene() {
  const root = new Group();
  const geo = new SphereGeometry(1, 4, 4);
  const steel = new MeshStandardMaterial({ name: 'hoop_steel', metalness: 1 });
  const flagged = new MeshStandardMaterial({ name: 'painted', metalness: 0 });
  flagged.userData.ownEnv = 1.3;
  const optOut = new MeshStandardMaterial({ name: 'gunmetal', metalness: 1 });
  optOut.userData.ownEnv = 0;
  const rope = new MeshPhysicalMaterial({ name: 'hoop_rope', sheen: 0.5, normalMap: new Texture() });
  const library = new MeshStandardMaterial({ name: 'mat_metal', metalness: 1 });
  for (const m of [steel, flagged, optOut, rope, library]) root.add(new Mesh(geo, m));
  return { root, steel, flagged, optOut, rope, library };
}

describe('imported master materials (models/imported.ts)', () => {
  it('flags imported materials, gives metal its own environment and leaves library materials alone', () => {
    const s = scene();
    const list = prepareImported(s.root, lib);
    expect(list).toHaveLength(4);
    expect(s.library.userData.imported).toBeUndefined();
    expect(s.steel.userData).toMatchObject({ imported: true, ownEnv: true });
    expect(s.steel.envMapIntensity).toBe(IMPORTED_OWN_ENV);
    expect(s.flagged.envMapIntensity).toBe(1.3);
    expect(s.flagged.userData.ownEnv).toBe(true);
    expect(s.optOut.userData.ownEnv).toBeUndefined();
    expect(s.rope.userData.ownEnv).toBeUndefined();
  });

  it('Low strips normal maps and sheen reversibly, also from materials registered later', () => {
    const s = scene();
    prepareImported(s.root, lib);
    const normal = s.rope.normalMap;
    setImportedLowDetail(s.root, true);
    expect(importedLowDetail(s.root)).toBe(true);
    expect(s.rope.normalMap).toBeNull();
    expect(s.rope.sheen).toBe(0);
    expect(s.steel.envMapIntensity).toBeLessThan(IMPORTED_OWN_ENV);
    // A variant registered while Low is active is simplified at once.
    const variant = new MeshPhysicalMaterial({ name: 'rope_variant', sheen: 0.4, normalMap: new Texture() });
    prepareImported(s.root, lib, [variant]);
    expect(variant.normalMap).toBeNull();
    setImportedLowDetail(s.root, false);
    expect(s.rope.normalMap).toBe(normal);
    expect(s.rope.sheen).toBe(0.5);
    expect(s.steel.envMapIntensity).toBe(IMPORTED_OWN_ENV);
    expect(variant.sheen).toBe(0.4);
    expect(variant.normalMap).not.toBeNull();
  });

  const disposals = (...textures: Texture[]) => {
    const fired = new Map<Texture, number>(textures.map((t) => [t, 0]));
    for (const t of textures) t.addEventListener('dispose', () => fired.set(t, fired.get(t)! + 1));
    return fired;
  };
  const physical = () => new MeshPhysicalMaterial({
    name: 'ball_leather', normalMap: new Texture(), clearcoat: 0.2, clearcoatNormalMap: new Texture(), map: new Texture(),
  });

  it('dispose frees every texture, including the maps the Low tier holds aside', () => {
    for (const low of [false, true]) {
      const root = new Group();
      const m = physical();
      root.add(new Mesh(new SphereGeometry(1, 4, 4), m));
      const fired = disposals(m.normalMap!, m.clearcoatNormalMap!, m.map!);
      prepareImported(root, lib);
      if (low) setImportedLowDetail(root, true);
      disposeImported(root);
      for (const [t, n] of fired) expect(n, `${low ? 'Low' : 'Normal'}: ${t === m.map ? 'map' : 'normal map'}`).toBe(1);
      // The registry is gone: a second dispose is a no-op, nothing fires twice.
      disposeImported(root);
      for (const n of fired.values()) expect(n).toBe(1);
    }
  });

  it('dispose never frees the stage environment on an ownEnv metal', () => {
    const root = new Group();
    const steel = new MeshStandardMaterial({ name: 'hoop_steel', metalness: 1 });
    root.add(new Mesh(new SphereGeometry(1, 4, 4), steel));
    prepareImported(root, lib);
    // What Stage.assignOwnEnvironment does: the shared PMREM (a render-target texture).
    const env = new WebGLRenderTarget(4, 4).texture;
    steel.envMap = env;
    const fired = disposals(env);
    disposeImported(root);
    expect(fired.get(env)).toBe(0);
  });
});
