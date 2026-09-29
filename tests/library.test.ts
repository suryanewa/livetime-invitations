import { afterAll, describe, expect, it, vi } from 'vitest';
import { type Material, MeshPhysicalMaterial, type MeshStandardMaterial, type Texture } from 'three';
import { MaterialLibrary } from '../src/render/materials.ts';

// Node has no canvas: generated prints become plain textures and the cached normal maps draw
// into a no-op 2D context. Ownership never looks at pixels.
vi.mock('../src/render/print.ts', async () => {
  const { Texture } = await import('three');
  const make = () => new Texture();
  return { cardPrint: make, strapPrint: make, holoPattern: make, labelPrint: make, grooveDirections: make };
});
const context2d = {
  createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
  putImageData() {},
  fillRect() {},
  beginPath() {},
  arc() {},
  fill() {},
  createRadialGradient: () => ({ addColorStop() {} }),
};
vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context2d }) });
afterAll(() => vi.unstubAllGlobals());

/** Counts 'dispose' events (three frees GPU copies on this event). */
function watch(target: Material | Texture) {
  const spy = vi.fn();
  (target as Texture).addEventListener('dispose', spy);
  return spy;
}
const std = (m: Material) => m as MeshStandardMaterial;

describe('MaterialLibrary ownership', () => {
  it('dispose() frees every material it built; get() rebuilds afterwards', () => {
    const lib = new MaterialLibrary('L2');
    const body = lib.get('mat_body');
    const metal = lib.get('mat_metal');
    expect(lib.get('mat_body')).toBe(body);
    const spies = [body, metal].map(watch);
    lib.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledOnce();
    const rebuilt = lib.get('mat_body');
    expect(rebuilt).not.toBe(body);
    expect(rebuilt).toBeInstanceOf(MeshPhysicalMaterial);
    lib.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledOnce();
  });

  it('frees the generated textures it owns: prints, labels, holo, grooves, unique instances', () => {
    const lib = new MaterialLibrary('L2');
    const card = std(lib.get('mat_card_light')).map!;
    const label = std(lib.get('mat_label_coral')).map!;
    const holo = std(lib.get('mat_holo'));
    expect(holo.emissiveMap).toBe(holo.map);
    const grooves = (lib.get('mat_vinyl') as MeshPhysicalMaterial).anisotropyMap!;
    const uniqueLabel = std(lib.unique('mat_label_cobalt')).map!;
    const spies = [card, label, holo.map!, grooves, uniqueLabel].map(watch);
    lib.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledOnce();
    // Rebuilt materials get fresh textures, owned (and freed) in turn.
    const again = std(lib.get('mat_label_coral')).map!;
    expect(again).not.toBe(label);
    const spy = watch(again);
    lib.dispose();
    expect(spy).toHaveBeenCalledOnce();
  });

  it('releases shared cached maps; the last library holding one frees and evicts it', () => {
    const a = new MaterialLibrary('L2');
    const b = new MaterialLibrary('L2');
    const weave = std(a.get('mat_lid_fabric')).normalMap!;
    expect(std(b.get('mat_lid_fabric')).normalMap).toBe(weave);
    const perf = std(a.get('mat_signature'));
    const perfMaps = [perf.map!, perf.normalMap!];
    const spy = watch(weave);
    const perfSpies = perfMaps.map(watch);
    a.dispose();
    a.dispose();
    expect(spy).not.toHaveBeenCalled();
    for (const s of perfSpies) expect(s).toHaveBeenCalledOnce();
    b.dispose();
    expect(spy).toHaveBeenCalledOnce();
    const fresh = std(a.get('mat_lid_fabric')).normalMap;
    expect(fresh).not.toBe(weave);
    a.dispose();
  });

  it('frees maps stripped by low detail, and rebuilds at full detail after dispose', () => {
    const lib = new MaterialLibrary('L2');
    const fabric = std(lib.get('mat_lid_fabric'));
    const weave = fabric.normalMap!;
    const spy = watch(weave);
    lib.setLowDetail(true);
    expect(fabric.normalMap).toBeNull();
    lib.dispose();
    expect(spy).toHaveBeenCalledOnce();
    const rebuilt = std(lib.get('mat_lid_fabric'));
    expect(rebuilt.normalMap).not.toBeNull();
    lib.setLowDetail(true);
    expect(rebuilt.normalMap).toBeNull();
    lib.dispose();
  });
});
