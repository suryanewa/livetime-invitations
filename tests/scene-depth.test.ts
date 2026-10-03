import { afterEach, describe, expect, it } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene, type WebGLRenderer } from 'three';
import { markDepthOccluders, requestSceneDepth, SCENE_DEPTH_LAYER, SceneDepth, type SceneDepthClient } from '../src/render/sceneDepth.ts';
import { Stage } from '../src/render/stage.ts';

/**
 * v1.6 scene depth (src/render/sceneDepth.ts): off for every scene that does not ask for it. With
 * no active client in the stage's scene the hook returns before touching the renderer at all, so
 * those scenes' frames are byte-identical to before it existed (the browser suite also compares
 * the shipped posters, tests/browser/posters.spec.ts, and draws the other scenes with the hook
 * removed, tests/browser/scene-depth.spec.ts).
 */

/** A renderer that fails the test on any use (no state may change, no pass may be drawn). */
function untouchable(): WebGLRenderer {
  return new Proxy({}, { get: (_t, key) => { throw new Error(`renderer.${String(key)} used`); } }) as WebGLRenderer;
}

/** A renderer that records what is called on it. */
function recording(log: string[]): WebGLRenderer {
  let target: unknown = null;
  return {
    autoClear: true,
    getDrawingBufferSize: (v: { set(x: number, y: number): void }) => { v.set(64, 32); return v; },
    getRenderTarget: () => target,
    setRenderTarget: (t: unknown) => { target = t; log.push(t ? 'target' : 'screen'); },
    render: (_s: Scene, c: PerspectiveCamera) => log.push(`render layers ${c.layers.mask}`),
  } as unknown as WebGLRenderer;
}

const unregister: (() => void)[] = [];
afterEach(() => { while (unregister.length) unregister.pop()!(); });

describe('Scene depth (v1.6)', () => {
  it('a scene with no client: the hook touches nothing', () => {
    const depth = new SceneDepth();
    expect(depth.render(untouchable(), new Scene(), new PerspectiveCamera())).toBe(false);
    expect(depth.passes).toBe(0);
  });

  it('a client in another scene, or an inactive one, or a hidden one: still nothing for this scene', () => {
    const other = new Scene(), scene = new Scene();
    const mine = new Group();
    scene.add(mine);
    const prepared: string[] = [];
    unregister.push(requestSceneDepth({ object: new Group(), active: () => true, prepare: () => prepared.push('stray') }));
    const elsewhere = new Group();
    other.add(elsewhere);
    unregister.push(requestSceneDepth({ object: elsewhere, active: () => true, prepare: () => prepared.push('other') }));
    unregister.push(requestSceneDepth({ object: mine, active: () => false, prepare: () => prepared.push('inactive') }));
    const depth = new SceneDepth();
    expect(depth.render(untouchable(), scene, new PerspectiveCamera())).toBe(false);
    mine.visible = false;
    const hidden: SceneDepthClient = { object: mine, active: () => true, prepare: () => prepared.push('hidden') };
    unregister.push(requestSceneDepth(hidden));
    expect(depth.render(untouchable(), scene, new PerspectiveCamera())).toBe(false);
    expect(prepared).toEqual([]);
  });

  it('an active client: one depth-only pass of the occluders’ layer, then its prepare; the camera, scene and target are restored', () => {
    const scene = new Scene(), camera = new PerspectiveCamera();
    const steam = new Group();
    scene.add(steam);
    const prepared: number[] = [];
    unregister.push(requestSceneDepth({ object: steam, active: () => true, prepare: (_r, f) => prepared.push(f.size.x * 1000 + f.size.y) }));
    const log: string[] = [];
    const depth = new SceneDepth();
    const background = scene.background;
    expect(depth.render(recording(log), scene, camera)).toBe(true);
    expect(log).toEqual(['target', `render layers ${1 << SCENE_DEPTH_LAYER}`, 'screen']);
    expect(prepared).toEqual([64032]);
    expect(camera.layers.mask).toBe(1);
    expect(scene.overrideMaterial).toBeNull();
    expect(scene.background).toBe(background);
    expect(depth.allocated).toBe(true);
    // Once nothing asks for it, the target is freed (a scene switch leaves no GPU memory behind).
    unregister.pop()!();
    expect(depth.render(recording(log), scene, camera)).toBe(false);
    expect(depth.allocated).toBe(false);
    depth.dispose();
  });

  it('occluders are the opaque meshes (not transparent ones, shadow proxies or opted-out ones)', () => {
    const root = new Group();
    const solid = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    const glass = new Mesh(new BoxGeometry(), new MeshBasicMaterial({ transparent: true }));
    const proxy = new Mesh(new BoxGeometry(), new MeshBasicMaterial({ colorWrite: false }));
    proxy.userData.shadowProxy = true;
    const fx = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    fx.userData.noSceneDepth = true;
    root.add(solid, glass, proxy, fx);
    markDepthOccluders(root);
    expect(solid.layers.isEnabled(SCENE_DEPTH_LAYER)).toBe(true);
    expect(solid.layers.isEnabled(0)).toBe(true);
    for (const m of [glass, proxy, fx]) expect(m.layers.isEnabled(SCENE_DEPTH_LAYER)).toBe(false);
  });

  it('the stage calls the hook once per render, before its own render', () => {
    const calls: string[] = [];
    const fake = {
      sceneDepth: { render: () => { calls.push('depth'); return false; } },
      renderer: { render: () => calls.push('main') },
      scene: new Scene(), camera: new PerspectiveCamera(),
    };
    Stage.prototype.render.call(fake as unknown as Stage);
    expect(calls).toEqual(['depth', 'main']);
  });
});
