import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { NeutralToneMapping } from 'three';
import { DEFAULT_RIG, RIGS, resolveRig, rigNames } from '../src/render/rigRegistry.ts';

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

  it('no CSS finish sits over poster or canvas (the render is the photograph)', () => {
    const css = readFileSync(join(import.meta.dirname, '..', 'src', 'ui', 'shell.css'), 'utf8');
    expect(css).not.toMatch(/\.lt-stage::(before|after)/);
    expect(css).not.toMatch(/feTurbulence/);
  });
});
