import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { Group, Mesh, MeshStandardMaterial, NeutralToneMapping, SphereGeometry, Texture, type WebGLRenderer } from 'three';
import { DEFAULT_RIG, RIGS, resolveRig, rigNames } from '../src/render/rigRegistry.ts';
import { defineRig, type Rig } from '../src/render/rig.ts';
import { Stage } from '../src/render/stage.ts';
import { DIRECTIONS, type MaterialLibrary } from '../src/render/materials.ts';
import { prepareImported, setImportedLowDetail } from '../models/imported.ts';

/** A Stage around a stand-in renderer (no GL): enough for the material work setContent does. */
function stageWith(rig: Rig): Stage {
  const renderer = { shadowMap: {}, toneMapping: 0, toneMappingExposure: 1 } as unknown as WebGLRenderer;
  const Ctor = Stage as unknown as new (r: WebGLRenderer, o: { rig: Rig }) => Stage;
  return new Ctor(renderer, { rig });
}

function testRig(metalEnvIntensity?: number): Rig {
  const env = new Texture();
  return { ...defineRig({
    label: 'test', stageColor: '#808080', exposure: 1, toneMapping: NeutralToneMapping, environmentIntensity: 1, gobo: false,
    backdrop: { kind: 'none' }, shadows: null, metalEnvIntensity,
    build: () => ({ environment: env, objects: [], dispose() {} }),
  }), name: 'test' };
}

/** Imported metals as the recipes ship them: Dinner silver (ownEnv 0.8), dome 0.9, chrome by metalness (1.1); and a dielectric. */
function metals() {
  const root = new Group();
  const geo = new SphereGeometry(1, 4, 4);
  const silver = new MeshStandardMaterial({ name: 'plate_silver', metalness: 1 });
  silver.userData.ownEnv = 0.8;
  const dome = new MeshStandardMaterial({ name: 'cloche_dome', metalness: 1 });
  dome.userData.ownEnv = 0.9;
  const chrome = new MeshStandardMaterial({ name: 'badge_chrome', metalness: 1 });
  const paper = new MeshStandardMaterial({ name: 'paper_label', metalness: 0 });
  for (const m of [silver, dome, chrome, paper]) root.add(new Mesh(geo, m));
  prepareImported(root, { direction: DIRECTIONS.L2 } as unknown as MaterialLibrary);
  return { root, silver, dome, chrome, paper };
}

/** Studio rigs (src/render/rigs/): the registry, each rig's declaration, and the interface's agreement. */
describe('studio rigs', () => {
  it('registers every file in src/render/rigs/ by name, the production rig among them', () => {
    expect(rigNames()).toContain('v1.1');
    expect(RIGS.has(DEFAULT_RIG)).toBe(true);
    for (const [name, rig] of RIGS) expect(rig.name).toBe(name);
  });

  for (const [name, rig] of RIGS) {
    it(`${name}: declares a complete, plausible rig`, () => {
      expect(rig.label.length, name).toBeGreaterThan(0);
      expect(rig.stageColor, name).toMatch(/^#[0-9A-F]{6}$/);
      expect(rig.exposure, name).toBeGreaterThan(0);
      expect(rig.environmentIntensity, name).toBeGreaterThanOrEqual(0);
      expect(typeof rig.gobo, name).toBe('boolean');
      expect(['sweep', 'table', 'custom', 'none'], name).toContain(rig.backdrop.kind);
      if (rig.shadows) {
        expect(['vogel16', 'pcf', 'vsm'], name).toContain(rig.shadows.filter);
        expect(Math.log2(rig.shadows.mapSize) % 1, `${name} map size is a power of two`).toBe(0);
        expect(rig.shadows.mapSize, name).toBeLessThanOrEqual(2048);
      }
      expect(typeof rig.build, name).toBe('function');
    });
  }

  // The brief's rules for the studio-pass rigs (v1.1 is the baseline that predates them).
  for (const [name, rig] of RIGS) {
    if (name === 'v1.1') continue;
    it(`${name}: keeps the studio-pass rules (full environment on everything, a real-time shadow, a measured stage colour)`, () => {
      expect(rig.environmentIntensity, name).toBe(1);
      expect(rig.metalEnvIntensity, `${name}: metals reflect the environment at full strength too`).toBe(1);
      expect(rig.shadows, `${name}: one key casts the real-time soft shadow`).not.toBeNull();
      // The declared colour is the measured one, when this checkout has measured it (outputs/ is local).
      const measured = join(import.meta.dirname, '..', 'outputs', 'rigs', name, 'stagecolor.json');
      if (existsSync(measured)) {
        const m = (JSON.parse(readFileSync(measured, 'utf8')) as { stageColor: string }).stageColor;
        const ch = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
        const d = Math.max(...ch(m).map((v, i) => Math.abs(v - ch(rig.stageColor)[i]!)));
        expect(d, `${name}: stageColor ${rig.stageColor} vs measured ${m}`).toBeLessThanOrEqual(2);
      }
    });
  }

  it('v1.1 is the approved premium studio, declared as shipped (the comparison baseline)', () => {
    const v = RIGS.get('v1.1')!;
    expect(v).toMatchObject({ stageColor: '#F8E4C8', exposure: 1, toneMapping: NeutralToneMapping, environmentIntensity: 0.52, gobo: true });
    expect(v.backdrop.kind).toBe('sweep');
    expect(v.shadows).toMatchObject({ filter: 'vogel16', mapSize: 1024, radius: 6 });
  });

  it('an unknown rig name falls back to the production rig, with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(resolveRig('no-such-rig').name).toBe(DEFAULT_RIG);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
    expect(resolveRig().name).toBe(DEFAULT_RIG);
  });

  it('the interface paints the production rig’s measured stage colour (poster, canvas and CSS agree)', () => {
    const css = readFileSync(join(import.meta.dirname, '..', 'src', 'ui', 'shell.css'), 'utf8');
    const token = /--lt-stage:\s*(#[0-9a-fA-F]{6})/.exec(css)?.[1];
    expect(token?.toUpperCase()).toBe(resolveRig().stageColor);
  });

  it('a rig’s metalEnvIntensity reaches the ownEnv metals on every tier; undeclared, the material values stand', () => {
    // Undeclared (v1.1): the recipe's compensation values, untouched.
    const a = metals();
    const v11 = stageWith(testRig());
    v11.setContent(a.root);
    expect(a.silver.envMap).toBe(v11.scene.environment);
    expect([a.silver.envMapIntensity, a.dome.envMapIntensity, a.chrome.envMapIntensity]).toEqual([0.8, 0.9, 1.1]);

    // Declared: every ownEnv material takes it; the dielectric (lit by scene.environment) is untouched.
    const b = metals();
    const stage = stageWith(testRig(1));
    stage.setContent(b.root);
    expect([b.silver.envMapIntensity, b.dome.envMapIntensity, b.chrome.envMapIntensity]).toEqual([1, 1, 1]);
    expect(b.paper.envMap).toBeNull();
    // Low tier, in the controller's order (materials first, then the stage), and back.
    setImportedLowDetail(b.root, true);
    expect(b.chrome.envMapIntensity, 'the material Low tier softens it').toBe(0.8);
    stage.setLowDetail(true);
    expect([b.silver.envMapIntensity, b.dome.envMapIntensity, b.chrome.envMapIntensity]).toEqual([1, 1, 1]);
    setImportedLowDetail(b.root, false);
    stage.setLowDetail(false);
    expect([b.silver.envMapIntensity, b.dome.envMapIntensity, b.chrome.envMapIntensity]).toEqual([1, 1, 1]);
  });

  it('no CSS finish sits over poster or canvas (the render is the photograph)', () => {
    const css = readFileSync(join(import.meta.dirname, '..', 'src', 'ui', 'shell.css'), 'utf8');
    expect(css).not.toMatch(/\.lt-stage::(before|after)/);
    expect(css).not.toMatch(/feTurbulence/);
  });
});
