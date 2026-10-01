import { presetOf, resolveConfig, sameConfig } from './config.ts';
import { PlaybackClock } from './clock.ts';
import { ResponseState, type ResponseSnapshot } from './responseState.ts';
import type { SceneInstance, SceneModule } from './sequence.ts';
import type {
  CanonicalPose,
  Category,
  CreateInvitationOptions,
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
import { QualityMonitor, TIER_DPR, type Tier } from '../render/quality.ts';
import { Stage, type StageOptions } from '../render/stage.ts';

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
   * Studio options (premium lighting, projection). Omitted, the stage uses the approved premium
   * studio ({ premium: true }); options passed replace that default, so set premium explicitly.
   */
  stage?: Omit<StageOptions, 'canvas' | 'preserveDrawingBuffer'>;
  posterFor?: PosterResolver;
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
  retryGraphics(): void;
  setQualityTier(tier: Tier): void;
  /** Tooling only (posters, review captures): render the current pose to an image URL. */
  captureStill(size: number, dpr?: number, type?: string, quality?: number): string | null;
  /** Tooling only (resource checks): live GPU object counts, or null without a stage. */
  renderInfo(): { geometries: number; textures: number; programs: number } | null;
}

export const LOAD_TIMEOUT_MS = 6000;
const ENTRANCE_MS = 220;
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
  root.classList.add('lt-stage');
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
  root.append(poster, posterText, canvasHost);

  poster.addEventListener('error', () => {
    posterFailed = true;
    poster.hidden = true;
    if (resource !== 'ready') posterText.hidden = false;
  });
  poster.addEventListener('load', () => {
    posterFailed = false;
    posterText.hidden = true;
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
  let lastFrameAt = 0;
  let warm = false;

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
        stage = Stage.create(options.stage ?? { premium: true });
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
      s.setContent(instance.root, instance.bounds, instance.studio, instance.framePoints);
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
      director.attach(instance);
      // One warm frame while the poster still covers the canvas: compileAsync neither builds the
      // shadow pass's depth program nor uploads textures, so without it the first frame after
      // 'ready' (guest input live) would link and upload synchronously. Hidden tabs never draw.
      if (!document.hidden) {
        instance.beforeRender?.();
        s.render();
      }
      if (loadTimer) clearTimeout(loadTimer);
      const late = performance.now() - startedAt > LATE_LOAD_MS;
      canvasHost.style.transition = late || reduced() ? 'none' : `opacity ${ENTRANCE_MS}ms ease-out`;
      canRetryGraphics = false;
      setResource('ready', 'loaded');
      requestFrame();
    } catch (err) {
      if (abort.signal.aborted || disposed) return;
      if (loadTimer) clearTimeout(loadTimer);
      releaseScene();
      const reason = (err as { reason?: ResourceReason }).reason ?? 'asset-failure';
      setResource('fallback', reason);
    }
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
    if (raf || disposed || document.hidden) return;
    // Waking from idle: reset the clock baseline so the first frame of a new sequence samples
    // t = 0 instead of jumping ahead by the clamped idle gap.
    if (!looping) clock.resume();
    looping = true;
    raf = requestAnimationFrame(frame);
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
    const dt = clock.tick();
    const playing = director.update(clock.seconds);
    let settling = false;
    if (scene.simulate && !reduced()) {
      if (!simulate) simulate = scene.simulate.bind(scene);
      stepper.advance(dt, simulate);
      settling = scene.settling?.() ?? false;
    }
    scene.beforeRender?.();
    stage.render();
    if (!drawnSinceReady) {
      drawnSinceReady = true;
      updatePoster();
    }
    positionGrabTarget();

    const active = playing || settling || pointerActive;
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
    stage?.premium?.setShadows(full);
    stage?.premium?.setLowDetail(!full);
  }

  /** A resize clears the drawing buffer; draw the current pose at once so no blank frame shows. */
  function redraw() {
    if (!stage || !scene || resource !== 'ready' || document.hidden) return;
    scene.beforeRender?.();
    stage.render();
  }

  function resize() {
    if (!stage) return;
    const w = root.clientWidth || 1;
    const h = root.clientHeight || w;
    stage.resize(w, h, TIER_DPR[quality.tier]);
  }

  const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
    resize();
    redraw();
    requestFrame();
  }) : null;
  resizeObserver?.observe(root);

  // ── Visibility: hidden tabs pause the visual clock ────────────────────────
  function onVisibility() {
    if (document.hidden) {
      clock.pause();
      cancelAnimationFrame(raf);
      raf = 0;
      stepper.reset();
      quality.pause();
    } else {
      clock.resume();
      requestFrame();
    }
  }
  document.addEventListener('visibilitychange', onVisibility);

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
      config = resolved.config;
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
      return { geometries: info.memory.geometries, textures: info.memory.textures, programs: info.programs?.length ?? 0 };
    },

    captureStill(size: number, dpr = 2, type = 'image/png', quality?: number) {
      if (!stage || !scene || resource !== 'ready') return null;
      scene.beforeRender?.();
      const url = stage.snapshot(size, size, dpr, type, quality);
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
      document.removeEventListener('visibilitychange', onVisibility);
      media?.removeEventListener('change', onMotionPreference);
      root.replaceChildren();
      root.classList.remove('lt-stage');
      setResource('disposed', 'disposed');
    },
  };

  updatePoster();
  emit();
  void loadScene();
  return handle;
}
