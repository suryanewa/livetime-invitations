import { presetOf, printOnlyChange, resolveConfig, sameConfig } from './config.ts';
import { PlaybackClock } from './clock.ts';
import { ResponseState, type ResponseSnapshot } from './responseState.ts';
import type { DeferredContext, SceneInstance, SceneModule } from './sequence.ts';
import type {
  CanonicalPose,
  Category,
  CreateInvitationOptions,
  FrameInsets,
  InvitationController,
  Mode,
  Response,
  ResourceReason,
  ResourceState,
  SceneConfig,
  VisualState,
} from './types.ts';
import { VisualDirector } from './visualDirector.ts';
import { FixedStepper } from '../motion/spring.ts';
import { hasWebGL2, resetWebGL2Probe } from '../render/createRenderer.ts';
import { type DirectionId, LOCKED_DIRECTION, MaterialLibrary } from '../render/materials.ts';
import { QualityMonitor, type Tier } from '../render/quality.ts';
import { DEFAULT_RIG } from '../render/rigRegistry.ts';
import { type FramingReport, Stage, type StageOptions } from '../render/stage.ts';
import { type FrameRect, frameSquare, NO_INSETS } from '../render/camera.ts';
import { PATH_CLEARANCE, PULL_EASE } from '../render/framing.ts';

/**
 * Embeddable invitation controller (Master §7). Three independent dimensions — resource,
 * visual, persistence — that fail independently: graphics can never block a response, and a
 * pending or failed response never keeps the render loop alive.
 */

export type SceneRegistry = Partial<Record<Category, () => Promise<SceneModule>>>;
export type PosterResolver = (category: Category, preset: string, pose: CanonicalPose) => string | null;

export interface InvitationOptions extends CreateInvitationOptions {
  scenes: SceneRegistry;
  /** Material direction; defaults to the approved LOCKED_DIRECTION (L2, style-reference v1.1). */
  direction?: DirectionId;
  /**
   * Studio options: the rig (src/render/rigs/, by name) and the projection. Omitted, or without a
   * rig, the stage uses the production rig (DEFAULT_RIG) through the perspective product lens.
   */
  stage?: Omit<StageOptions, 'canvas' | 'preserveDrawingBuffer'>;
  posterFor?: PosterResolver;
  /**
   * A still of the studio at BACKDROP_FIELD × the frame field, centred on the same framing (`pnpm
   * capture backdrops`). It extends the square poster to the whole stage, so a poster covers any
   * aspect with the canvas's framing (fullscreen; v1.7 posters, also a square-layout mount of another
   * aspect; never fetched while the frame square is the whole stage). Omitted, the stage colour does.
   * v1.5: asked for the pose of the poster it surrounds, since a scene that pulls back for its
   * decline (Birthday, Dinner) shows its declined poster at a wider framing and needs that
   * framing's backdrop (`backdrop-declined.webp`). v1.7 posters: the showcase's stills have the
   * scene in them at that pose (`backdropUrl`), so what lies outside the frame square is there.
   */
  backdropFor?: (category: Category, pose: CanonicalPose) => string | null;
  /** Human-readable description of each pose for the text fallback when a poster fails. */
  describePose?: (category: Category, pose: CanonicalPose) => string;
  onStateChange?: (state: InvitationState) => void;
}

export interface InvitationState {
  config: SceneConfig;
  mode: Mode;
  resource: ResourceState;
  resourceReason: ResourceReason;
  visual: VisualState;
  response: ResponseSnapshot;
  tier: Tier;
  reducedMotion: boolean;
  /** True after 6 s without readiness: the UI may offer "Try 3D again". */
  canRetryGraphics: boolean;
}

export interface InvitationHandle extends InvitationController {
  readonly element: HTMLElement;
  getState(): InvitationState;
  /** Fullscreen layout: the frame square in mount CSS px (null for the square layout). */
  getFrame(): FrameRect | null;
  retryGraphics(): void;
  setQualityTier(tier: Tier): void;
  /**
   * Tooling only (posters, review captures): render the current pose to an image URL. `empty`
   * renders the bare stage (content hidden for that frame) for the stage-colour measurement.
   */
  captureStill(size: number, dpr?: number, type?: string, quality?: number, options?: { empty?: boolean; field?: number }): string | null;
  /**
   * Tooling only (resource checks): live GPU object counts, and the drawing buffer (its device
   * pixels per CSS pixel and its size), or null without a stage.
   */
  renderInfo(): { geometries: number; textures: number; programs: number; pixelRatio: number; buffer: [number, number] } | null;
  /**
   * Tooling only (framing checks): the hero fits at `aspect` (width / height), or null: `rest`
   * (pull 0: host-ready, guest-ready) and `decline` (pull 1: the declined pose), the same fit for a
   * scene that does not pull back; v1.7 `closeUp`, the close-up's fit where a scene has one (Dinner's
   * accepted pose, close 1), or (v1.7 polish) `focusFit`, the focus's (Sports' push-in on the bank);
   * the live `pull`, `close` and `focus`; and the fit's cost guards (`solves` so far, the reduced
   * `points`).
   */
  framing(aspect?: number): FramingReport | null;
  /**
   * Tooling only (captures, resource and frame-time checks): whether the live scene has loaded and
   * warmed what it loads after ready (v1.5: the shared bin); true for a scene that defers nothing.
   */
  deferredReady(): boolean;
}

export const LOAD_TIMEOUT_MS = 6000;
/** The backdrop still's field, in frame squares (it is this many frame sizes wide and tall). */
export const BACKDROP_FIELD = 7;
/**
 * The poster's edge feather, as a fraction of the frame square (v1.7 posters): the framing rule's
 * clearance (every hero and path sample stays PATH_CLEARANCE inside the frame in NDC, i.e. half of
 * it of the frame's size from each edge), so the feather only ever crosses the set's static parts
 * and the studio, never what moves. v1.4–v1.6: 9 %, which faded content once a scene's frame was
 * filled (Sports' board top and balls at fill 0.85–0.92). Only the edges where the poster meets the
 * backdrop are feathered, never one lying on the stage's own edge.
 */
export const POSTER_FEATHER = PATH_CLEARANCE / 2;
const ENTRANCE_MS = 220;
/** How long the frame square takes to follow a change of the overlay insets (v1.5). */
export const INSET_EASE_MS = 250;
const LATE_LOAD_MS = 1200;

export function createInvitation(options: InvitationOptions): InvitationHandle {
  const initial = resolveConfig(options.config);
  if (!initial.ok) throw new TypeError(`Invalid invitation category: ${String(initial.received)}`);

  let config = initial.config;
  let mode: Mode = options.mode;
  let resource: ResourceState = 'poster';
  let resourceReason: ResourceReason = 'initial';
  let canRetryGraphics = false;
  let disposed = false;
  let restorationAttempted = false;
  let contextLost = false;

  const media = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  let explicitReduced: boolean | undefined = options.reducedMotion;
  const reduced = () => explicitReduced ?? media?.matches ?? false;

  const quality = new QualityMonitor('normal');
  const clock = new PlaybackClock();
  const stepper = new FixedStepper();
  const libraries = new Map<DirectionId, MaterialLibrary>();
  const direction: DirectionId = options.direction ?? LOCKED_DIRECTION;
  const library = () => {
    let lib = libraries.get(direction);
    if (!lib) libraries.set(direction, (lib = new MaterialLibrary(direction)));
    return lib;
  };
  /**
   * Free every material and texture; call only once the stage no longer shows them. `afterCompile`
   * waits for in-flight precompiles first (see afterCompiles).
   */
  function freeLibraries(afterCompile = false) {
    const freed = [...libraries.values()];
    libraries.clear();
    const free = () => {
      for (const lib of freed) lib.dispose();
    };
    if (afterCompile) afterCompiles(free);
    else free();
  }
  /**
   * Precompiles still running. Chrome links programs in parallel (KHR_parallel_shader_compile)
   * and logs glGetProgramiv errors for a program deleted mid-link, so a superseded load's scene
   * and materials are freed only once the compiles that may be linking them have settled.
   */
  const compiling = new Set<Promise<unknown>>();
  function afterCompiles(release: () => void) {
    if (compiling.size === 0) release();
    else void Promise.allSettled([...compiling]).then(release);
  }
  function trackCompile<T>(compile: Promise<T>): Promise<T> {
    compiling.add(compile);
    const done = () => compiling.delete(compile);
    compile.then(done, done);
    return compile;
  }
  /** The category whose scene last drew from the library. */
  let libraryCategory: Category | null = null;

  // ── DOM ────────────────────────────────────────────────────────────────────
  const root = options.mount;
  const fullscreen = options.layout === 'fullscreen';
  let insets: FrameInsets = { ...NO_INSETS, ...options.frameInsets };
  /**
   * The insets the frame square is shown at (v1.5): `insets` eased in over INSET_EASE_MS when the
   * host's overlays change size while the scene is live (a bottom sheet swapping its panel), so the
   * object scales with the sheet instead of jumping in one frame.
   */
  let shownInsets: FrameInsets = { ...insets };
  let insetTween: { from: FrameInsets; to: FrameInsets; start: number } | null = null;
  let frameRect: FrameRect | null = null;
  /** Whether the stage shows more than the frame square (an edge of the square inside the stage). */
  let frameInside = false;
  root.classList.add('lt-stage');
  root.classList.toggle('lt-stage--fullscreen', fullscreen);
  root.dataset.resource = resource;
  const poster = document.createElement('img');
  poster.className = 'lt-stage__poster';
  poster.alt = '';
  poster.decoding = 'async';
  poster.setAttribute('aria-hidden', 'true');
  const posterText = document.createElement('p');
  posterText.className = 'lt-stage__fallback';
  posterText.setAttribute('aria-hidden', 'true');
  posterText.hidden = true;
  const canvasHost = document.createElement('div');
  canvasHost.className = 'lt-stage__canvas';
  canvasHost.setAttribute('aria-hidden', 'true');
  /**
   * The studio around the square poster, at the canvas's framing: wherever the stage is larger than
   * the frame square (fullscreen; v1.7 posters: also a square-layout mount sized to another aspect).
   * v1.7 posters: the still has the scene in it, so what the live view shows outside the frame
   * square (the set's cast shadows, Business's lanyard, Dinner's plate) is there before it is live,
   * and the poster's feather blends like with like. Shown only under a poster that has loaded: never
   * alone (its content is a still of one pose, at a seventh of the poster's resolution), never under
   * the text fallback.
   */
  const backdrop = document.createElement('div');
  backdrop.className = 'lt-stage__backdrop is-waiting';
  backdrop.setAttribute('aria-hidden', 'true');
  backdrop.style.setProperty('--lt-backdrop-field', String(BACKDROP_FIELD));
  root.append(backdrop, poster, posterText, canvasHost);

  poster.addEventListener('error', () => {
    posterFailed = true;
    poster.hidden = true;
    backdrop.classList.add('is-waiting');
    if (resource !== 'ready') posterText.hidden = false;
  });
  poster.addEventListener('load', () => {
    posterFailed = false;
    posterText.hidden = true;
    backdrop.classList.remove('is-waiting');
  });

  // ── State dimensions ──────────────────────────────────────────────────────
  const responses = new ResponseState(
    {
      request: (r) => options.onResponseRequested(r),
      change: () => emit(),
      integrationError: (e) => options.onIntegrationError?.(e),
    },
    options.initialResponse,
  );

  const director = new VisualDirector(
    {
      complete: (sequence) => options.onVisualComplete?.({ category: config.category, sequence }),
      change: () => {
        updatePoster();
        emit();
      },
      // v1.5 deferred assets (the shared bin): load and warm them now, then draw; failed, the poster.
      ensure: (target) => {
        const s = stage, live = scene;
        if (!s || !live?.ensure) return Promise.resolve();
        return live.ensure(target, deferredContext(s)).then(
          () => requestFrame(),
          (err: unknown) => {
            if (scene === live && !disposed && (err as { reason?: string }).reason !== 'aborted') {
              releaseScene();
              setResource('fallback', 'asset-failure');
            }
            throw err;
          },
        );
      },
    },
    mode,
    options.initialResponse ?? null,
  );
  director.setReducedMotion(reduced());

  let stage: Stage | null = null;
  /** A stage's canvas after its context was lost: it keeps only the restore listener. */
  let lostCanvas: HTMLCanvasElement | null = null;
  let scene: SceneInstance | null = null;
  let loadAbort: AbortController | null = null;
  let loadTimer: ReturnType<typeof setTimeout> | null = null;
  let raf = 0;
  /** The mount intersects the viewport (see `intersection` below). */
  let onScreen = true;
  let lastFrameAt = 0;
  let warm = false;

  /** The next idle moment between frames (or 60 ms where the browser has no idle callback). */
  function idleMoment(): Promise<void> {
    return new Promise((resolve) => {
      const idle = (window as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
      if (idle) idle(() => resolve(), { timeout: 600 });
      else setTimeout(resolve, 60);
    });
  }

  function emit() {
    options.onStateChange?.(getState());
  }

  function getState(): InvitationState {
    return {
      config,
      mode,
      resource,
      resourceReason,
      visual: director.state,
      response: responses.state,
      tier: quality.tier,
      reducedMotion: reduced(),
      canRetryGraphics,
    };
  }

  function setResource(state: ResourceState, reason: ResourceReason) {
    resource = state;
    resourceReason = reason;
    root.dataset.resource = state;
    options.onResourceState?.({ state, reason });
    updatePoster();
    emit();
  }

  let posterFailed = false;
  /** The canvas replaces the poster only after it has actually drawn (hidden tabs never do). */
  let drawnSinceReady = false;
  function updatePoster() {
    if (disposed) return;
    const showPoster = resource !== 'ready' || !drawnSinceReady;
    const pose = director.targetPose;
    const url = options.posterFor?.(config.category, presetOf(config), pose) ?? null;
    posterText.textContent = options.describePose?.(config.category, pose) ?? '';
    if (showPoster && url) {
      if (poster.getAttribute('src') !== url) {
        posterFailed = false;
        poster.hidden = false;
        poster.src = url;
      } else {
        poster.hidden = posterFailed;
        posterText.hidden = !posterFailed;
      }
    } else if (showPoster) {
      poster.hidden = true;
      poster.removeAttribute('src');
      posterText.hidden = !posterText.textContent;
    }
    if (!showPoster) posterText.hidden = true;
    // Only where the stage shows more than the frame square (a square embed fetches no backdrop).
    const bg = frameInside ? options.backdropFor?.(config.category, pose) ?? null : null;
    const css = bg ? `url("${bg}")` : 'none';
    if (backdrop.style.backgroundImage !== css) {
      backdrop.style.backgroundImage = css;
      // A new backdrop (another scene's, another framing's) waits for its poster, so it never
      // shows around the poster it does not belong to.
      if (!(poster.complete && poster.naturalWidth > 0)) backdrop.classList.add('is-waiting');
    }
    if (!url || posterFailed) backdrop.classList.add('is-waiting');
    backdrop.classList.toggle('is-hidden', !showPoster);
    poster.classList.toggle('is-hidden', !showPoster);
    canvasHost.classList.toggle('is-visible', !showPoster);
  }

  // ── Scene lifecycle ───────────────────────────────────────────────────────
  function releaseScene() {
    drawnSinceReady = false;
    endPointer(true);
    grab.hidden = true;
    director.attach(null);
    stage?.setContent(null);
    const released = scene;
    scene = null;
    simulate = null;
    if (released) afterCompiles(() => released.dispose());
  }

  async function loadScene() {
    loadAbort?.abort();
    if (loadTimer) clearTimeout(loadTimer);
    releaseScene();
    // A new category shares nothing with the old scene (now off the stage): free its materials
    // and textures so the next scene builds only what it needs.
    if (libraryCategory !== config.category) freeLibraries(true);
    libraryCategory = config.category;
    canRetryGraphics = false;

    if (!hasWebGL2()) {
      setResource('fallback', 'webgl-unavailable');
      return;
    }
    if (quality.tier === 'static') {
      setResource('fallback', 'performance-static');
      return;
    }
    if (contextLost) {
      setResource('fallback', 'context-lost');
      return;
    }

    const abort = new AbortController();
    loadAbort = abort;
    const startedAt = performance.now();
    setResource('loading', 'loading');
    loadTimer = setTimeout(() => {
      if (resource === 'loading' && !disposed) {
        canRetryGraphics = true;
        options.onResourceState?.({ state: 'loading', reason: 'timeout' });
        emit();
      }
    }, LOAD_TIMEOUT_MS);

    try {
      if (!stage) {
        dropLostCanvas();
        stage = Stage.create({ ...options.stage, rig: options.stage?.rig ?? DEFAULT_RIG });
        if (!stage) {
          setResource('fallback', 'webgl-unavailable');
          return;
        }
        attachCanvas(stage);
      }
      const s = stage;
      const loader = options.scenes[config.category];
      if (!loader) throw new Error(`No scene registered for ${config.category}`);
      const module = await loader();
      if (abort.signal.aborted || disposed) return;
      const lib = library();
      const instance = await module.load({
        config,
        library: lib,
        assetBase: options.assetBase ?? './assets',
        signal: abort.signal,
      });
      if (abort.signal.aborted || disposed) {
        instance.dispose();
        // A load superseded by a category change may bind into a library already freed and
        // dropped; free what it built there too.
        if (libraries.get(direction) !== lib) lib.dispose();
        return;
      }
      scene = instance;
      // A preset chosen while the asset was loading wins over the one the load started with.
      instance.setConfig(config);
      s.setContent(instance.root, instance.bounds, instance.studio, instance.framePoints, instance.heroPoints, instance.restFramePoints, instance.closeUp, instance.heroFill);
      resize();
      applyTierDetail(quality.tier);
      let shaderError = false;
      const onShaderError = () => {
        shaderError = true;
      };
      const debug = s.renderer.debug;
      debug.onShaderError = onShaderError;
      try {
        await trackCompile<unknown>(instance.precompile ? instance.precompile(s.renderer, s.camera) : s.renderer.compileAsync(s.scene, s.camera));
      } catch {
        shaderError = true;
      }
      // A superseded load stops here: the link check below would force the newer load's
      // in-flight programs to finish synchronously, and the shader hook may be the newer load's.
      if (abort.signal.aborted || disposed) {
        if (debug.onShaderError === onShaderError) debug.onShaderError = null;
        return;
      }
      try {
        // compileAsync resolves even when linking failed; force the link check now so a
        // broken program becomes a poster fallback instead of a blank stage.
        for (const program of s.renderer.info.programs ?? []) (program as { getUniforms(): unknown }).getUniforms();
      } catch {
        shaderError = true;
      }
      if (debug.onShaderError === onShaderError) debug.onShaderError = null;
      if (shaderError) throw Object.assign(new Error('shader'), { reason: 'shader-failure' as const });
      if (contextLost || s.renderer.getContext().isContextLost()) {
        throw Object.assign(new Error('context'), { reason: 'context-lost' as const });
      }
      director.setReducedMotion(reduced());
      // v1.5: the pose the scene opens on may need what it otherwise loads after ready (a saved
      // decline shows the bin): load it now, under the poster.
      for (const target of new Set([director.currentPose, director.targetPose])) {
        if (instance.needs?.(target)) await instance.ensure!(target, deferredContext(s));
      }
      if (abort.signal.aborted || disposed) return;
      director.attach(instance);
      // One warm frame while the poster still covers the canvas: compileAsync neither builds the
      // shadow pass's depth program nor uploads textures or geometry, so without it the first
      // frame after 'ready' (guest input live) would link and upload synchronously. Hidden tabs
      // never draw.
      if (!document.hidden) {
        // v1.5: also everything hidden for now (the bin, the flames, smoke and steam) for one frame,
        // so that their first appearance mid-sequence uploads nothing: the bin's first decline drew
        // its 216k-triangle geometry and its textures inside one frame (a 33–100 ms frame).
        const hidden: { visible: boolean }[] = [];
        instance.root.traverse((o) => {
          if (!o.visible) {
            hidden.push(o);
            o.visible = true;
          }
        });
        if (hidden.length) {
          s.render();
          for (const o of hidden) o.visible = false;
          s.renderer.shadowMap.needsUpdate = true;
        }
        prepareFrame(s, instance);
        s.render();
      }
      if (loadTimer) clearTimeout(loadTimer);
      const late = performance.now() - startedAt > LATE_LOAD_MS;
      canvasHost.style.transition = late || reduced() ? 'none' : `opacity ${ENTRANCE_MS}ms ease-out`;
      canRetryGraphics = false;
      setResource('ready', 'loaded');
      requestFrame();
      startPrefetch(instance, s);
    } catch (err) {
      if (abort.signal.aborted || disposed) return;
      if (loadTimer) clearTimeout(loadTimer);
      releaseScene();
      const reason = (err as { reason?: ResourceReason }).reason ?? 'asset-failure';
      setResource('fallback', reason);
    }
  }

  /** v1.5: what a scene's deferred loading needs from the stage (src/core/sequence.ts). */
  function deferredContext(s: Stage): DeferredContext {
    return {
      renderer: s.renderer,
      scene: s.scene,
      camera: s.camera,
      adopt: (object) => s.adoptContent(object),
      idle: idleMoment,
      busy: () => director.isPlaying || director.waiting !== null,
    };
  }

  /**
   * v1.5: after ready, in idle moments, the scene loads and warms what it deferred (the shared
   * bin): a failure here is left to the decline's own `ensure` (which retries the same load and,
   * failing, shows the poster).
   */
  function startPrefetch(instance: SceneInstance, s: Stage) {
    if (!instance.prefetch) return;
    const context = deferredContext(s);
    void context.idle()
      .then(() => (scene === instance && stage === s && !disposed ? instance.prefetch!(context) : undefined))
      .then(() => requestFrame())
      .catch(() => {});
  }

  function attachCanvas(s: Stage) {
    const canvas = s.canvas;
    canvasHost.append(canvas);
    canvas.addEventListener('webglcontextlost', onContextLost, false);
    canvas.addEventListener('webglcontextrestored', onContextRestored, false);
    canvas.addEventListener('pointerdown', onPointerDown);
  }

  /**
   * Dispose the stage and every material and texture it drew. On context loss (`lost`) this runs
   * while the context is lost, so the deletes are silent no-ops (after a restore they would
   * target objects of the old context), and the dead canvas stays, hidden behind the poster,
   * with only its restore listener.
   */
  function destroyStage(lost = false) {
    dropLostCanvas();
    if (!stage) return;
    const canvas = stage.canvas;
    canvas.removeEventListener('webglcontextlost', onContextLost);
    canvas.removeEventListener('pointerdown', onPointerDown);
    stage.dispose();
    stage = null;
    // Library materials and textures hold GPU resources of the renderer just disposed.
    freeLibraries();
    if (lost) {
      lostCanvas = canvas;
    } else {
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      canvas.remove();
    }
  }

  function dropLostCanvas() {
    if (!lostCanvas) return;
    lostCanvas.removeEventListener('webglcontextrestored', onContextRestored);
    lostCanvas.remove();
    lostCanvas = null;
  }

  function onContextLost(event: Event) {
    // Prevented, the browser may restore the context (webglcontextrestored).
    event.preventDefault();
    contextLost = true;
    loadAbort?.abort();
    loadAbort = null;
    if (loadTimer) clearTimeout(loadTimer);
    cancelAnimationFrame(raf);
    raf = 0;
    looping = false;
    releaseScene();
    destroyStage(true);
    setResource('fallback', 'context-lost');
  }

  function onContextRestored() {
    if (restorationAttempted || disposed) return;
    restorationAttempted = true;
    // The stage went with the loss; loadScene builds a fresh one (new canvas and context).
    dropLostCanvas();
    contextLost = false;
    void loadScene().then(() => {
      if (resource === 'ready') options.onResourceState?.({ state: 'ready', reason: 'context-restored' });
    });
  }

  // ── Render loop: on demand only ───────────────────────────────────────────
  let looping = false;
  function requestFrame() {
    if (raf || disposed || document.hidden || !onScreen) return;
    // Waking from idle: reset the clock baseline so the first frame of a new sequence samples
    // t = 0 instead of jumping ahead by the clamped idle gap.
    if (!looping) clock.resume();
    looping = true;
    raf = requestAnimationFrame(frame);
  }

  /**
   * Everything a frame needs after sampling and simulation, before drawing: the scene's own
   * per-frame work, then the camera's place between the rest and decline fits (v1.5 decline
   * pull-back: `framePull`, 0 for a scene without one). Every draw goes through it (the loop, the
   * resize redraw, the warm frame, stills), so the pointer's projection and the grab target, which
   * read the stage's one camera after the draw, see the camera that was drawn.
   */
  function prepareFrame(s: Stage, instance: SceneInstance) {
    instance.beforeRender?.();
    s.setPull(instance.framePull?.() ?? 0);
    // v1.7 (#42): the close-up (Dinner's card) or (v1.7 polish) the focus (Sports' push-in), 0 for a scene without one.
    s.setClose(instance.frameClose?.() ?? 0);
  }

  /**
   * One frame of the inset ease (`shownInsets` towards `insets`): the pull's ease (PULL_EASE) over
   * INSET_EASE_MS of wall time; the frame square, the poster's place and the camera follow (the
   * fit is cached: this only places the camera).
   */
  function stepInsets(now: number) {
    const tw = insetTween;
    if (!tw || !stage) return;
    const u = Math.min(1, Math.max(0, (now - tw.start) / INSET_EASE_MS));
    const k = PULL_EASE(u);
    const mix = (a: number, b: number) => a + (b - a) * k;
    shownInsets = { top: mix(tw.from.top, tw.to.top), right: mix(tw.from.right, tw.to.right), bottom: mix(tw.from.bottom, tw.to.bottom), left: mix(tw.from.left, tw.to.left) };
    if (u >= 1) {
      shownInsets = { ...tw.to };
      insetTween = null;
    }
    updateFrame();
    stage.setFrameInsets(shownInsets);
  }

  let simulate: ((dt: number) => void) | null = null;
  function frame(now: number) {
    raf = 0;
    if (!stage || !scene || resource !== 'ready') {
      // No live scene: still deliver queued snap completions, then go idle.
      looping = false;
      director.update(clock.seconds);
      return;
    }
    // The frame's own timestamp, not the callback's start: sampled times stay on the display's cadence.
    const dt = clock.tick(now);
    const playing = director.update(clock.seconds);
    let settling = false;
    if (scene.simulate && !reduced()) {
      if (!simulate) simulate = scene.simulate.bind(scene);
      stepper.advance(dt, simulate);
      settling = scene.settling?.() ?? false;
    }
    stepInsets(now);
    prepareFrame(stage, scene);
    stage.render();
    if (!drawnSinceReady) {
      drawnSinceReady = true;
      updatePoster();
    }
    positionGrabTarget();

    const active = playing || settling || pointerActive || insetTween !== null;
    looping = active;
    if (active) {
      if (warm && lastFrameAt) quality.record(now - lastFrameAt, now);
      warm = true;
      lastFrameAt = now;
      raf = requestAnimationFrame(frame);
    } else {
      warm = false;
      lastFrameAt = 0;
      quality.pause();
      stepper.reset();
    }
    // Tier drops wait for a safe point (between sequences), except Static: from Low, a device
    // still too slow completes the current intent as a poster right away (Master §9).
    if (!director.isPlaying || quality.pending === 'static') applyQuality();
  }

  function applyQuality() {
    // The pixel-ratio step (v1.5): a smaller drawing buffer, nothing else changes.
    if (quality.applyPendingDpr()) {
      resize();
      redraw();
      options.onResourceState?.({ state: resource, reason: 'reduced-quality' });
      emit();
      return;
    }
    const next = quality.applyPending();
    if (!next) return;
    if (next === 'static') {
      // Static shows the poster only: release the stage (context, drawing buffer, environment,
      // materials). Leaving Static reloads the scene on a fresh stage.
      releaseScene();
      destroyStage();
      setResource('fallback', 'performance-static');
      return;
    }
    void switchTier(next);
    options.onResourceState?.({ state: resource, reason: 'reduced-quality' });
    emit();
  }

  /**
   * A tier change on the live scene. The new material and light variants compile off the main
   * thread first (the first switch to Low links 4–6 programs, 40–110 ms if the redraw did it);
   * the resize, which clears the drawing buffer, and the redraw wait for them, so the last frame
   * stays up meanwhile. A frame drawn before they are ready finishes the link itself.
   */
  async function switchTier(tier: Tier) {
    applyTierDetail(tier);
    const s = stage;
    const live = scene;
    if (s && live && resource === 'ready') {
      try {
        await trackCompile(s.renderer.compileAsync(s.scene, s.camera));
      } catch {
        // The redraw compiles instead.
      }
      if (disposed || stage !== s || scene !== live || quality.tier !== tier) return;
    }
    resize();
    redraw();
    requestFrame();
  }

  /**
   * Tier detail on the live stage and library: Low and Static drop the shadowed key (freeing its
   * shadow map), the gobo and the plaster relief; Low also simplifies materials: the library's,
   * and through the scene's optional hook those it imported from masters (models/imported.ts).
   */
  function applyTierDetail(tier: Tier) {
    const full = tier === 'normal' || tier === 'high';
    libraries.get(direction)?.setLowDetail(tier === 'low');
    scene?.setLowDetail?.(tier === 'low');
    stage?.setShadows(full);
    stage?.setLowDetail(!full);
  }

  /** A resize clears the drawing buffer; draw the current pose at once so no blank frame shows. */
  function redraw() {
    if (!stage || !scene || resource !== 'ready' || document.hidden) return;
    prepareFrame(stage, scene);
    stage.render();
  }

  /**
   * The frame square for the mount's current size and insets. The poster (a square still of the
   * same framing) is laid over it through CSS variables, so poster, text fallback and canvas show
   * the object in the same place at every aspect. v1.7 posters: the square layout too, with no
   * insets (the centred square: the whole stage at 1:1); a square-layout mount the host sizes to
   * another aspect is framed like fullscreen, so its poster sits on the square the canvas frames,
   * over the backdrop, instead of being cover-cropped to the mount. Each edge of the poster that
   * lies inside the stage gets the feather (POSTER_FEATHER); one on the stage's edge stays sharp.
   */
  function updateFrame() {
    const w = root.clientWidth || 1, h = root.clientHeight || 1;
    const f = frameSquare(w, h, fullscreen ? shownInsets : NO_INSETS);
    frameRect = fullscreen ? f : null;
    root.style.setProperty('--lt-frame-x', `${f.x}px`);
    root.style.setProperty('--lt-frame-y', `${f.y}px`);
    root.style.setProperty('--lt-frame-size', `${f.size}px`);
    const feather = POSTER_FEATHER * f.size;
    const edges = { left: f.x, top: f.y, right: w - f.x - f.size, bottom: h - f.y - f.size };
    let inside = false;
    for (const [edge, gap] of Object.entries(edges)) {
      const open = gap > 0.5;
      inside ||= open;
      root.style.setProperty(`--lt-poster-feather-${edge}`, open ? `${feather}px` : '0px');
    }
    poster.classList.toggle('is-feathered', inside);
    if (inside !== frameInside) {
      frameInside = inside;
      updatePoster();
    }
  }

  function resize() {
    updateFrame();
    if (!stage) return;
    const w = root.clientWidth || 1;
    const h = root.clientHeight || w;
    stage.setFrameInsets(fullscreen ? shownInsets : NO_INSETS);
    stage.resize(w, h, quality.dprCap);
  }

  const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
    resize();
    redraw();
    requestFrame();
  }) : null;
  resizeObserver?.observe(root);

  // ── Visibility: a hidden tab or an off-screen stage pauses the visual clock ──
  /**
   * The loop draws nothing nobody can see. A hidden tab (visibilitychange) or a stage scrolled out
   * of view (IntersectionObserver on the mount, v1.5) suspends it: no frame is scheduled, the visual
   * clock pauses (a sequence or a perpetual motion resumes where it was, without debt) and the
   * quality window is dropped. Showing it again wakes the loop if the scene still wants frames.
   * Scenes need nothing for this: a motion that runs forever (Party's playing record, a flame) keeps
   * `settling()` true and simply stops being stepped while unseen.
   */
  function suspend() {
    clock.pause();
    cancelAnimationFrame(raf);
    raf = 0;
    stepper.reset();
    quality.pause();
    // The first interval after waking spans the pause; it must not count as a slow frame.
    warm = false;
    lastFrameAt = 0;
  }
  function wake() {
    if (document.hidden || !onScreen) return;
    clock.resume();
    requestFrame();
  }
  function onVisibility() {
    if (document.hidden) suspend();
    else wake();
  }
  document.addEventListener('visibilitychange', onVisibility);
  /**
   * On screen (`onScreen`): any part of the mount inside the viewport (threshold 0). Assumed true
   * until the observer's first report, and always where IntersectionObserver is missing. For an
   * embed in an iframe the observer measures against the top-level viewport, so an iframe scrolled
   * out of the host page pauses too.
   */
  const intersection = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver((entries) => {
      const visible = entries[entries.length - 1]!.isIntersecting;
      if (visible === onScreen) return;
      onScreen = visible;
      if (visible) wake();
      else suspend();
    })
    : null;
  intersection?.observe(root);

  function onMotionPreference() {
    if (explicitReduced !== undefined) return;
    director.setReducedMotion(reduced());
    if (reduced()) endPointer(true);
    requestFrame();
    emit();
  }
  media?.addEventListener('change', onMotionPreference);

  // ── Optional direct manipulation (scene.pointer) ──────────────────────────
  let pointerActive = false;
  let pointerId: number | null = null;
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  const grab = document.createElement('div');
  grab.className = 'lt-stage__grab';
  grab.hidden = true;
  grab.setAttribute('aria-hidden', 'true');
  root.append(grab);

  function ndc(event: PointerEvent): [number, number] {
    const r = root.getBoundingClientRect();
    return [((event.clientX - r.left) / r.width) * 2 - 1, -(((event.clientY - r.top) / r.height) * 2 - 1)];
  }

  function positionGrabTarget() {
    const p = scene?.pointer;
    const allowed = !!p && p.enabled() && !reduced() && resource === 'ready';
    grab.hidden = !allowed;
    if (!allowed || !stage || !scene?.pointer) return;
    const rect = scene.pointer.screenRect(stage.camera);
    if (!rect) return;
    const [x0, y0, x1, y1] = rect;
    grab.style.left = `${((x0 + 1) / 2) * 100}%`;
    grab.style.top = `${((1 - y1) / 2) * 100}%`;
    grab.style.width = `${((x1 - x0) / 2) * 100}%`;
    grab.style.height = `${((y1 - y0) / 2) * 100}%`;
  }

  function onPointerDown(event: PointerEvent) {
    const p = scene?.pointer;
    if (!p || !stage || reduced() || !p.enabled() || pointerActive) return;
    const [x, y] = ndc(event);
    if (!p.hitTest(x, y, stage.camera)) return;
    pointerActive = true;
    pointerId = event.pointerId;
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    p.begin(x, y, stage.camera);
    armHold();
    requestFrame();
  }
  grab.addEventListener('pointerdown', onPointerDown);

  function armHold() {
    if (holdTimer) clearTimeout(holdTimer);
    // A pointer held still for 2 s releases the optional hold (Business sub-spec).
    holdTimer = setTimeout(() => endPointer(false), 2000);
  }

  function onPointerMove(event: PointerEvent) {
    if (!pointerActive || event.pointerId !== pointerId || !stage || !scene?.pointer) return;
    const [x, y] = ndc(event);
    scene.pointer.move(x, y, stage.camera);
    armHold();
    requestFrame();
  }

  function onPointerUp(event: PointerEvent) {
    if (event.pointerId !== pointerId) return;
    endPointer(event.type === 'pointercancel');
  }

  function endPointer(cancelled: boolean) {
    if (holdTimer) clearTimeout(holdTimer);
    holdTimer = null;
    if (!pointerActive) return;
    pointerActive = false;
    for (const el of [grab, stage?.canvas]) {
      if (el && pointerId !== null && el.hasPointerCapture?.(pointerId)) el.releasePointerCapture(pointerId);
    }
    pointerId = null;
    scene?.pointer?.end(cancelled);
    requestFrame();
  }

  for (const el of [grab, canvasHost]) {
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);
    el.addEventListener('lostpointercapture', onPointerUp as EventListener);
  }

  // ── Public API ────────────────────────────────────────────────────────────
  const handle: InvitationHandle = {
    element: root,

    setConfig(next: SceneConfig) {
      if (disposed) return;
      const resolved = resolveConfig(next);
      if (!resolved.ok) {
        options.onIntegrationError?.({ kind: 'invalid-category', received: resolved.received });
        return;
      }
      if (sameConfig(resolved.config, config)) return;
      const categoryChanged = resolved.config.category !== config.category;
      const printOnly = printOnlyChange(config, resolved.config);
      config = resolved.config;
      if (printOnly) {
        // v1.7: only the Dinner card's text changed: it is printed again where it lies; nothing
        // that is playing is reset (the preset, and so the poster, is the same).
        scene?.setConfig(config);
        redraw();
        requestFrame();
        emit();
        return;
      }
      endPointer(true);
      if (categoryChanged) {
        director.reset();
        void loadScene();
      } else {
        director.reset();
        scene?.setConfig(config);
        director.reset();
        requestFrame();
      }
      updatePoster();
      emit();
    },

    setMode(next: Mode) {
      if (disposed || next === mode) return;
      mode = next;
      endPointer(true);
      director.setMode(next);
      requestFrame();
      emit();
    },

    prepareHost() {
      if (disposed || mode !== 'host') return;
      director.prepareHost();
      requestFrame();
    },

    chooseResponse(response: Response) {
      if (disposed) return;
      endPointer(true);
      const changed = responses.choose(response);
      if (changed) {
        director.setIntent(response);
        requestFrame();
      }
    },

    retryResponse() {
      if (!disposed) responses.retry();
    },

    applyResponseResult(result) {
      if (!disposed) responses.apply(result);
    },

    replay() {
      if (disposed) return;
      endPointer(true);
      director.replay();
      requestFrame();
    },

    resetVisual() {
      if (disposed) return;
      endPointer(true);
      director.reset();
      requestFrame();
    },

    setFrameInsets(next: Partial<FrameInsets>) {
      if (disposed || !fullscreen) return;
      const merged = { ...NO_INSETS, ...next };
      if (merged.top === insets.top && merged.right === insets.right && merged.bottom === insets.bottom && merged.left === insets.left) return;
      insets = merged;
      // Eased only while the live canvas shows (a poster is placed at once), with motion on.
      if (stage && scene && resource === 'ready' && drawnSinceReady && !reduced() && !document.hidden && onScreen) {
        insetTween = { from: { ...shownInsets }, to: { ...merged }, start: performance.now() };
        requestFrame();
        return;
      }
      insetTween = null;
      shownInsets = { ...merged };
      resize();
      redraw();
      requestFrame();
    },

    getFrame() {
      return frameRect ? { ...frameRect } : null;
    },

    setReducedMotion(enabled: boolean) {
      if (disposed) return;
      explicitReduced = enabled;
      if (enabled) endPointer(true);
      director.setReducedMotion(enabled);
      requestFrame();
      emit();
    },

    retryGraphics() {
      if (disposed || resource === 'ready') return;
      if (quality.tier === 'static') quality.tier = 'low';
      contextLost = false;
      resetWebGL2Probe();
      destroyStage();
      void loadScene();
    },

    setQualityTier(tier: Tier) {
      if (disposed) return;
      quality.tier = tier;
      quality.pending = null;
      quality.resetDpr();
      if (tier === 'static') {
        loadAbort?.abort();
        loadAbort = null;
        if (loadTimer) clearTimeout(loadTimer);
        releaseScene();
        destroyStage();
        setResource('fallback', 'performance-static');
      } else if (resource !== 'ready') {
        if (contextLost) destroyStage();
        contextLost = false;
        void loadScene();
      } else {
        void switchTier(tier);
      }
      emit();
    },

    getState,

    renderInfo() {
      if (!stage) return null;
      const info = stage.renderer.info;
      const gl = stage.renderer.getContext();
      return {
        geometries: info.memory.geometries, textures: info.memory.textures, programs: info.programs?.length ?? 0,
        pixelRatio: stage.renderer.getPixelRatio(), buffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
      };
    },

    deferredReady() {
      const live = scene;
      return !!live && resource === 'ready' && !live.needs?.('decline') && !live.needs?.('declined');
    },

    framing(aspect = 1) {
      if (!stage || !scene || resource !== 'ready') return null;
      const pair = stage.measureFraming(aspect);
      if (!pair) return null;
      // v1.7 polish: the content's second fit and its channel, reported as a close-up (Dinner) or a focus (Sports).
      const focus = stage.closeKind === 'focus', k = stage.currentClose;
      const { closeUp, ...fits } = pair;
      const second = closeUp ? (focus ? { focusFit: closeUp } : { closeUp }) : {};
      return { ...fits, ...second, pull: stage.currentPull, close: focus ? 0 : k, focus: focus ? k : 0, solves: stage.fitSolves, points: stage.framingPointCounts };
    },

    captureStill(size: number, dpr = 2, type = 'image/png', quality?: number, captureOptions?: { empty?: boolean; field?: number }) {
      if (!stage || !scene || resource !== 'ready') return null;
      // At the pose's own framing (v1.5): the declined pose at the decline fit, the others at rest.
      prepareFrame(stage, scene);
      const url = stage.snapshot(size, size, dpr, type, quality, captureOptions?.empty, captureOptions?.field);
      resize();
      requestFrame();
      return url;
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      loadAbort?.abort();
      if (loadTimer) clearTimeout(loadTimer);
      cancelAnimationFrame(raf);
      endPointer(true);
      releaseScene();
      // Materials first, while the renderer that uploaded them is still alive.
      freeLibraries();
      destroyStage();
      resizeObserver?.disconnect();
      intersection?.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      media?.removeEventListener('change', onMotionPreference);
      root.replaceChildren();
      root.classList.remove('lt-stage', 'lt-stage--fullscreen');
      for (const v of ['--lt-frame-x', '--lt-frame-y', '--lt-frame-size', ...['left', 'top', 'right', 'bottom'].map((e) => `--lt-poster-feather-${e}`)]) root.style.removeProperty(v);
      setResource('disposed', 'disposed');
    },
  };

  updateFrame();
  updatePoster();
  emit();
  void loadScene();
  return handle;
}
