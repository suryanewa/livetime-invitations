import { type Material, type Mesh, type Object3D, type Texture, Vector3 } from 'three';
import binUrl from '../../assets/shared/disposal-bin.glb?url';
import { fillBin } from '../../models/disposalBin.ts';
import { gltfLoader } from '../../models/imported.ts';
import { bindMaterialsByName } from '../../models/types.ts';
import type { MaterialLibrary } from '../render/materials.ts';
import type { DeferredContext } from '../core/sequence.ts';

/**
 * The shared bin, loaded after the scene is ready (v1.5; Birthday and Dinner). The bin is 6.6 MB
 * and only the decline shows it, so a scene is rigged with `binPlaceholder()` and becomes ready
 * without it; this then fetches the GLB at low priority, moves its parts into the placeholder
 * (`fillBin`, `adopt`: the stage's shadows and own environment) and warms it, so the first
 * decline costs nothing:
 *
 * 1. its programs compile off the main thread (`compileAsync`, one material per idle moment);
 * 2. its textures upload one per idle moment (`initTexture`; the first decline used to upload
 *    eleven at once, a 52 ms task on a phone);
 * 3. one draw with the bin out of sight (behind the camera, its shadow held at 0) links its
 *    shadow pass's programs and uploads its geometry; the picture is the one already on screen.
 *
 * `prefetch` does this in idle moments (never during a sequence); `ensure` (a decline tapped before
 * it is done) the same without waiting for idle moments. Both share one load and one warm-up.
 */
export class DeferredBin {
  private loading: Promise<void> | null = null;
  private warming: Promise<void> | null = null;
  /** A scene rigged with the whole bin (tooling, tests) has nothing to load. */
  private warmed: boolean;
  /** A decline is waiting: no more idle waits. */
  private hurry = false;
  private disposed = false;
  private readonly abort = new AbortController();
  /** Waits in progress (`moment`): dispose ends them at once, so nothing keeps the renderer. */
  private readonly wake = new Set<() => void>();
  private loaded: Object3D | null = null;

  /**
   * `binRoot`: the placeholder the scene was rigged with, under `root`. `onFilled` runs once the
   * parts are in (the scene re-applies its current frame: flaps, pedal, visibility).
   */
  constructor(
    private readonly binRoot: Object3D,
    private readonly root: Object3D,
    private readonly library: MaterialLibrary | undefined,
    private readonly onFilled: () => void,
  ) {
    this.warmed = !binRoot.userData.binPlaceholder;
  }

  /** Loaded, attached and warm: the decline can play. */
  get ready(): boolean {
    return this.warmed;
  }

  prefetch(context: DeferredContext): Promise<void> {
    return this.warm(context);
  }

  ensure(context: DeferredContext): Promise<void> {
    this.hurry = true;
    return this.warm(context);
  }

  dispose(): void {
    this.disposed = true;
    this.abort.abort();
    for (const w of this.wake) w();
    this.wake.clear();
  }

  private load(context: DeferredContext): Promise<void> {
    this.loading ??= (async () => {
      const library = this.library;
      if (!library) throw new Error('DeferredBin: a placeholder bin needs the scene\'s material library');
      const res = await fetch(binUrl, { signal: this.abort.signal, priority: 'low' } as RequestInit);
      if (!res.ok) throw Object.assign(new Error(`asset ${res.status}`), { reason: 'asset-failure' as const });
      const gltf = await gltfLoader().parseAsync(await res.arrayBuffer(), '');
      const loaded = gltf.scene.getObjectByName('bin_root');
      if (!loaded) throw Object.assign(new Error('missing bin_root'), { reason: 'asset-failure' as const });
      if (this.disposed) {
        disposeTree(loaded);
        throw Object.assign(new Error('disposed'), { reason: 'aborted' as const });
      }
      this.loaded = loaded;
      bindMaterialsByName(loaded, library);
      fillBin(this.binRoot, loaded, this.root, library);
      context.adopt(this.binRoot);
      this.onFilled();
    })();
    return this.loading;
  }

  private warm(context: DeferredContext): Promise<void> {
    if (this.warmed) return Promise.resolve();
    this.warming ??= (async () => {
      await this.load(context);
      const { renderer, scene, camera } = context;
      // 1. Programs, off the main thread, one material per idle moment (making a program still
      // costs the main thread a few ms on a phone; all at once that was a dropped frame).
      for (const mesh of oneMeshPerMaterial(this.binRoot)) {
        await this.moment(context);
        if (this.disposed) return;
        await renderer.compileAsync(mesh, camera, scene);
      }
      if (this.disposed) return;
      // 2. Textures, one per idle moment.
      for (const texture of binTextures(this.binRoot)) {
        await this.moment(context);
        if (this.disposed) return;
        renderer.initTexture(texture);
      }
      // 3. One draw with the bin behind the camera: its shadow programs and its geometry.
      await this.moment(context);
      if (this.disposed) return;
      this.drawOutOfSight(context);
      this.warmed = true;
    })();
    return this.warming;
  }

  /** The next idle moment that is not during a sequence (none once a decline waits). */
  private async moment(context: DeferredContext): Promise<void> {
    while (!this.hurry && !this.disposed) {
      let w: () => void = () => {};
      await Promise.race([context.idle(), new Promise<void>((r) => this.wake.add((w = r)))]);
      this.wake.delete(w);
      if (!context.busy()) return;
    }
  }

  private drawOutOfSight({ renderer, scene, camera }: DeferredContext): void {
    const bin = this.binRoot;
    const saved = { visible: bin.visible, position: bin.position.clone() };
    const meshes: Mesh[] = [];
    bin.traverse((o) => { if ((o as Mesh).isMesh) meshes.push(o as Mesh); });
    // Behind the camera: nothing of it reaches the picture; its shadow's every texel is dropped.
    camera.updateMatrixWorld();
    const behind = new Vector3(0, 0, 4).applyMatrix4(camera.matrixWorld);
    bin.parent!.updateWorldMatrix(true, false);
    bin.position.copy(bin.parent!.worldToLocal(behind));
    bin.visible = true;
    bin.userData.castHold = 0;
    for (const m of meshes) m.frustumCulled = false;
    renderer.render(scene, camera);
    for (const m of meshes) m.frustumCulled = true;
    delete bin.userData.castHold;
    bin.position.copy(saved.position);
    bin.visible = saved.visible;
    bin.updateMatrixWorld(true);
    renderer.shadowMap.needsUpdate = true;
  }
}

/** One mesh for each of the bin's materials (compiling it compiles that material's program). */
function oneMeshPerMaterial(binRoot: Object3D): Mesh[] {
  const seen = new Set<Material>();
  const out: Mesh[] = [];
  binRoot.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material) || seen.has(mesh.material)) return;
    seen.add(mesh.material);
    out.push(mesh);
  });
  return out;
}

/** Every texture of the bin's materials, once each. */
function binTextures(binRoot: Object3D): Texture[] {
  const set = new Set<Texture>();
  binRoot.traverse((o) => {
    const m = (o as Mesh).material as Material | Material[] | undefined;
    for (const mat of Array.isArray(m) ? m : m ? [m] : []) {
      for (const value of Object.values(mat)) {
        // Its own maps (the stage's environment, a render target the steel shares, is up already).
        if ((value as Texture | null)?.isTexture && !(value as Texture & { isRenderTargetTexture?: boolean }).isRenderTargetTexture) set.add(value as Texture);
      }
    }
  });
  return [...set];
}

function disposeTree(root: Object3D): void {
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      for (const value of Object.values(m)) if ((value as Texture | null)?.isTexture) (value as Texture).dispose();
      m.dispose();
    }
  });
}
