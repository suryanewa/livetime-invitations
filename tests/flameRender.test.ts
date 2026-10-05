import { afterAll, describe, expect, it, vi } from 'vitest';
import { Color, type Material, MeshPhysicalMaterial, type Object3D, MeshStandardMaterial, PerspectiveCamera, Scene, ShaderLib, Vector2, type WebGLProgramParametersWithUniforms, type WebGLRenderer } from 'three';
import { DIRECTIONS, type MaterialLibrary } from '../src/render/materials.ts';
import { Bloom, BLOOM_LAYER, emitBloom, pendingBloom } from '../src/render/bloom.ts';
import { createFlameMaterial, FLAME_STEPS } from '../src/render/flame.ts';
import { HeatHaze, hazeColumns } from '../src/render/heatHaze.ts';
import { rigBirthday } from '../models/birthday.ts';
import { createFlameLights, patchFlameLight } from '../models/birthdayFire.ts';
import { buildBirthdayGeometry } from '../models/birthdayParts.ts';
import { buildDisposalBin } from '../models/disposalBin.ts';
import { BirthdayScene } from '../src/scenes/birthday/index.ts';
import { SMOKE_VOLUME } from '../models/birthdaySmoke.ts';
import { SCENE_DEPTH_LAYER } from '../src/render/sceneDepth.ts';
import { BREATH_AT, newSmokeStrand, smokeStrand, SMOKE_POINT_COUNT, type WickAt } from '../src/scenes/birthday/fire.ts';

/**
 * v1.6 flames (docs/scenes/birthday-v1.6-flames.md): the volume's material, the bloom's and the
 * heat haze's gates (nothing drawn, nothing done), the fire's registration of its flames and the
 * flames' light patch. The pixels themselves are judged in the browser (tests/browser/bloom.spec.ts).
 */

const context2d = new Proxy({ createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }) } as Record<string, unknown>, {
  get: (o, k) => (k in o ? o[k as string] : () => undefined),
});
vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context2d }) });
afterAll(() => vi.unstubAllGlobals());

function testLibrary(): MaterialLibrary {
  const direction = DIRECTIONS.L2;
  const make = (name: string) => (name === 'mat_flame' ? createFlameMaterial(name) : new MeshStandardMaterial({ name, color: new Color(direction.surfaces[name]!.color) }));
  return { direction, get: make, unique: make, dispose() {} } as unknown as MaterialLibrary;
}

/** A renderer that knows only what the registrations read; anything else it is asked throws. */
function strictRenderer(target: unknown = null): WebGLRenderer & { info: { render: { frame: number } } } {
  const r: Record<string, unknown> = {
    info: { render: { frame: 1 } },
    toneMappingExposure: 1.15,
    getRenderTarget: () => target,
    getDrawingBufferSize: (v: Vector2) => v.set(2560, 1440),
    getPixelRatio: () => 2,
  };
  return new Proxy(r, {
    get(o, k) {
      if (k in o) return o[k as string];
      if (typeof k === 'symbol' || k === 'then') return undefined;
      throw new Error(`renderer.${String(k)} was used`);
    },
  }) as unknown as WebGLRenderer & { info: { render: { frame: number } } };
}

describe('v1.6 flames: the volume, the bloom and the haze', () => {
  const lib = testLibrary();
  const build = () => {
    const rig = rigBirthday(buildBirthdayGeometry({ lib }), buildDisposalBin({ lib }), lib, 'vanilla');
    return { rig, scene: new BirthdayScene(rig, { category: 'birthday', cake: 'vanilla' }) };
  };
  const camera = () => {
    const c = new PerspectiveCamera(18, 16 / 9, 0.5, 200);
    c.position.set(3.2, 3.5, 9);
    c.lookAt(0, 1.6, 0);
    c.updateMatrixWorld();
    return c;
  };

  it('the flame is a ray-marched volume within the brief\'s step budget, and its HDR twin is drawn only in the bloom pass', () => {
    expect(FLAME_STEPS).toBeGreaterThanOrEqual(24);
    expect(FLAME_STEPS).toBeLessThanOrEqual(40);
    const { rig } = build();
    for (const c of rig.candles) {
      expect(c.fire.material.defines.STEPS).toBe(FLAME_STEPS);
      expect(c.fire.twin.parent).toBe(c.fire.quad);
      expect(c.fire.twin.layers.mask).toBe(1 << BLOOM_LAYER);
      expect(c.fire.quad.layers.test(c.fire.twin.layers)).toBe(false);
      expect((c.fire.twin.material as Material & { defines: Record<string, unknown> }).defines.HDR).toBe(1);
      // Posed with the flame: the very same uniform objects.
      expect((c.fire.twin.material as unknown as { uniforms: unknown }).uniforms).toBe(c.fire.material.uniforms);
    }
  });

  it('bloom and haze do nothing (and touch no renderer state) when no emitter was drawn', () => {
    const r = strictRenderer();
    const bloom = new Bloom();
    expect(bloom.prepare(r, new Scene(), camera())).toBe(false);
    expect(bloom.composite(r)).toBe(false);
    expect(new HeatHaze().apply(r, camera())).toBe(0);
    expect(pendingBloom(r)).toBeNull();
    // A draw into a target (the bloom pass's own, tooling's) never registers.
    const t = strictRenderer({});
    emitBloom(t, [0, 0, 10, 10]);
    expect(pendingBloom(t)).toBeNull();
  });

  it('a burning flame registers its glow; its haze only while the scene is live (none under reduced motion or after settle)', () => {
    const { rig, scene } = build();
    const cam = camera();
    const draw = (r: ReturnType<typeof strictRenderer>) => {
      for (const c of rig.candles) if (c.fire.quad.visible) c.fire.quad.onBeforeRender(r, new Scene(), cam, c.fire.quad.geometry, c.fire.material, null as never);
    };
    scene.pose('guest-ready');
    scene.settle();
    scene.beforeRender();
    const still = strictRenderer();
    draw(still);
    const rect = pendingBloom(still);
    expect(Array.isArray(rect)).toBe(true);
    const [x0, y0, x1, y1] = rect as readonly [number, number, number, number];
    expect(x1).toBeGreaterThan(x0);
    expect(y1).toBeGreaterThan(y0);
    // Settled (reduced motion, posters): the flames are drawn, nothing shimmers, and the volume's clock is 0.
    expect(hazeColumns(still).length).toBe(rig.candles.length);
    expect(hazeColumns(still).every((h) => h.strength === 0)).toBe(true);
    expect(rig.candles.every((c) => c.fire.material.uniforms.uNoise.value.x === 0)).toBe(true);
    // Live: the flicker's gain comes up and the plumes shimmer (a few CSS px at most).
    for (let k = 0; k < 120; k++) scene.simulate(1 / 120);
    scene.beforeRender();
    const live = strictRenderer();
    draw(live);
    expect(hazeColumns(live).every((h) => h.strength > 0.5 && h.strength < 6)).toBe(true);
    // settle() returns the still: the clock to 0 and no shimmer.
    scene.settle();
    scene.beforeRender();
    const again = strictRenderer();
    draw(again);
    expect(hazeColumns(again).every((h) => h.strength === 0)).toBe(true);
    expect(rig.candles.every((c) => c.fire.material.uniforms.uNoise.value.x === 0)).toBe(true);
    // Blown out: nothing registers (an ember does not bloom: it glows on into the bin).
    scene.pose('accepted');
    scene.beforeRender();
    expect(rig.candles.every((c) => !c.fire.quad.visible)).toBe(true);
    // The bloom's twins with them (an ember alone never blooms: it glows on down into the bin).
    scene.sample('accept', 0.9);
    scene.beforeRender();
    expect(rig.candles.every((c) => !c.fire.twin.visible)).toBe(true);
    const out = strictRenderer();
    draw(out);
    expect(pendingBloom(out)).toBeNull();
    // The hot wick goes on heating the plume (the haze runs on into the first vapour from the
    // ember), but only while the scene is live: settled here, none shimmers.
    expect(hazeColumns(out).every((h) => h.strength === 0)).toBe(true);
    for (let k = 0; k < 120; k++) scene.simulate(1 / 120);
    scene.sample('accept', 0.9);
    scene.beforeRender();
    const plume = strictRenderer();
    draw(plume);
    expect(pendingBloom(plume)).toBeNull();
    expect(hazeColumns(plume).some((h) => h.strength > 0.1)).toBe(true);
  });

  it('the breath tears the flame (turbulence follows its lean) and the box holds it', () => {
    const { rig, scene } = build();
    scene.pose('guest-ready');
    scene.settle();
    scene.beforeRender();
    const u = rig.candles[0]!.fire.material.uniforms;
    expect(u.uNoise.value.y).toBeLessThan(0.1);
    const still = u.uBoundR.value;
    scene.sample('accept', 0.2);
    scene.beforeRender();
    const turb = rig.candles.map((c) => c.fire.material.uniforms.uNoise.value.y);
    expect(Math.max(...turb)).toBeGreaterThan(0.6);
    expect(u.uBoundR.value).toBeGreaterThan(still);
  });

  it('the flames\' light is shadowed by the candles and the top tier, and the candles\' wax glows', () => {
    const lights = createFlameLights();
    const compile = (m: Material) => {
      const shader = { uniforms: {}, vertexShader: ShaderLib.physical.vertexShader, fragmentShader: ShaderLib.physical.fragmentShader } as unknown as WebGLProgramParametersWithUniforms;
      m.onBeforeCompile(shader, {} as WebGLRenderer);
      return shader;
    };
    const frosting = new MeshPhysicalMaterial({ name: 'cake_buttercream' });
    const wax = new MeshPhysicalMaterial({ name: 'cake_candle_blue' });
    patchFlameLight(frosting, lights);
    patchFlameLight(wax, lights);
    const f = compile(frosting), w = compile(wax);
    for (const s of [f, w]) {
      expect(s.fragmentShader).toContain('uniform vec4 uTier;');
      expect(s.fragmentShader.indexOf('RE_Direct( flameLight') === -1 && s.fragmentShader.indexOf('RE_Direct(flameLight') === -1).toBe(false);
      expect(s.uniforms.uTier).toBe(lights.tier);
      expect(s.uniforms.uCandleB).toBe(lights.candleB);
    }
    // One BRDF evaluation for the six flames.
    expect(f.fragmentShader.match(/RE_Direct\(flameLight/g)?.length).toBe(1);
    expect(w.fragmentShader).toContain('fBelow');
    expect(f.fragmentShader).not.toContain('fBelow');
    expect(frosting.customProgramCacheKey()).not.toBe(wax.customProgramCacheKey());
  });

  it('the scene poses every candle as an occluder and the top tier under them', () => {
    const { rig, scene } = build();
    scene.pose('guest-ready');
    scene.settle();
    scene.beforeRender();
    const L = rig.flameLights;
    for (let i = 0; i < rig.candles.length; i++) {
      const a = L.candleA.value[i]!, b = L.candleB.value[i]!;
      expect(b.y - a.y).toBeGreaterThan(0.2);
      // The flame's light point stands over its candle's wax top.
      expect(L.pos.value[i]!.y).toBeGreaterThan(b.y);
    }
    const t = L.tier.value;
    expect(t.z).toBeGreaterThan(L.candleA.value[0]!.y);
    expect(t.z).toBeLessThan(Math.min(...L.candleB.value.map((v) => v.y)));
    expect(t.w).toBeGreaterThan(0.3);
  });
  it('the smoke above its stem is a volume (v1.6 polish): the ribbon hands the vapour over along the thread, only the candles occlude it, nothing is marched without smoke', () => {
    const { rig, scene } = build();
    const smoke = rig.smoke;
    // Bloom and the scene's depth never share a layer (the depth occluders must not bloom).
    expect(BLOOM_LAYER).not.toBe(SCENE_DEPTH_LAYER);
    // Only the candles' shadow stand-ins are depth occluders (no cake, no piping).
    const occluders: Object3D[] = [];
    rig.root.traverse((o) => { if (o.layers.isEnabled(SCENE_DEPTH_LAYER)) occluders.push(o); });
    expect(occluders.length).toBeGreaterThan(0);
    const underCandle = (o: Object3D | null): boolean => !!o && (/^candle_\d\d$/.test(o.name) || underCandle(o.parent));
    for (const o of occluders) expect(underCandle(o)).toBe(true);
    // Lit: no smoke, the volume is not drawn (no depth pass, no march).
    scene.pose('guest-ready');
    for (let k = 0; k < 4; k++) scene.beforeRender();
    expect(smoke.volume.object.visible).toBe(false);
    // 1.2 s after the breath: the volume carries the smoke above the stems.
    scene.sample('accept', 1.2);
    scene.beforeRender();
    expect(smoke.volume.object.visible).toBe(true);
    expect(smoke.volume.puffs).toBeGreaterThan(50);
    expect(smoke.volume.dropped).toBe(0);
    // The hand-over: the ribbon carries a thread's first SMOKE_VOLUME.ribbon[0] of path at its full
    // opacity and nothing past ribbon[1] (the volume does). (v1.6 polish 4: the vapour leaves the ember
    // already rising, so its first parcels are counted over ribbon[1], not ribbon[0].)
    const st = newSmokeStrand();
    const w: [number, number, number] = [0, 1, 0];
    const still: WickAt = (_b, out) => { out[0] = w[0]; out[1] = w[1]; out[2] = w[2]; };
    smokeStrand(0, 0, BREATH_AT[0]!.lift + 1.5, still, st);
    const a = smoke.mesh.geometry.getAttribute('aAlpha');
    let path = 0, past = 0, near = 0;
    for (let k = 1; k < SMOKE_POINT_COUNT; k++) {
      path += Math.hypot(st.position[k * 3]! - st.position[k * 3 - 3]!, st.position[k * 3 + 1]! - st.position[k * 3 - 2]!, st.position[k * 3 + 2]! - st.position[k * 3 - 1]!) / 5;
      if (path > SMOKE_VOLUME.ribbon[1]) past++;
      else near++;
    }
    expect(past).toBeGreaterThan(10);
    expect(near).toBeGreaterThan(3);
    expect(a).toBeTruthy();
    // Settled (the canonical accepted pose: posters, reduced motion): nothing.
    scene.pose('accepted');
    scene.settle();
    scene.beforeRender();
    expect(smoke.volume.object.visible).toBe(false);
  });
});
