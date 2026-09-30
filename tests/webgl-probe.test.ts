import { afterAll, describe, expect, it, vi } from 'vitest';
import { hasWebGL2, resetWebGL2Probe } from '../src/render/createRenderer.ts';

// Node has no canvas: a fake one counts the throwaway contexts the probe creates.
let available = true;
const created: { lost: boolean }[] = [];
vi.stubGlobal('document', {
  createElement: () => ({
    getContext: (type: string) => {
      if (type !== 'webgl2' || !available) return null;
      const ctx = { lost: false };
      created.push(ctx);
      return { getExtension: () => ({ loseContext: () => (ctx.lost = true) }) };
    },
  }),
});
afterAll(() => vi.unstubAllGlobals());

describe('hasWebGL2', () => {
  it('probes once per page and releases the probe context', () => {
    resetWebGL2Probe();
    for (let i = 0; i < 5; i++) expect(hasWebGL2()).toBe(true);
    expect(created).toHaveLength(1);
    expect(created[0]!.lost).toBe(true);
  });

  it('remembers a missing WebGL2 until reset, then probes again', () => {
    resetWebGL2Probe();
    created.length = 0;
    available = false;
    expect(hasWebGL2()).toBe(false);
    available = true;
    expect(hasWebGL2()).toBe(false);
    resetWebGL2Probe();
    expect(hasWebGL2()).toBe(true);
    expect(created).toHaveLength(1);
  });
});
