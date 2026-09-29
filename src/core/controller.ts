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
import { hasWebGL2 } from '../render/createRenderer.ts';
import { type DirectionId, MaterialLibrary } from '../render/materials.ts';
import { QualityMonitor, TIER_DPR, type Tier } from '../render/quality.ts';
import { Stage } from '../render/stage.ts';

/**
 * Embeddable invitation controller (Master §7). Three independent dimensions — resource,
 * visual, persistence — that fail independently: graphics can never block a response, and a
 * pending or failed response never keeps the render loop alive.
 */

export type SceneRegistry = Partial<Record<Category, () => Promise<SceneModule>>>;
export type PosterResolver = (category: Category, preset: string, pose: CanonicalPose) => string | null;

export interface InvitationOptions extends CreateInvitationOptions {
  scenes: SceneRegistry;
  direction?: DirectionId;
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
  const direction: DirectionId = options.direction ?? 'A';
  const library = () => {
    let lib = libraries.get(direction);
    if (!lib) libraries.set(direction, (lib = new MaterialLibrary(direction)));
    return lib;
  };

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
    scene?.dispose();
    scene = null;
    simulate = null;
  }

  async function loadScene() {
    loadAbort?.abort();
    if (loadTimer) clearTimeout(loadTimer);
    releaseScene();
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
        stage = Stage.create();
        if (!stage) {
          setResource('fallback', 'webgl-unavailable');
          return;
        }
        attachCanvas(stage);
      }
      const loader = options.scenes[config.category];
      if (!loader) throw new Error(`No scene registered for ${config.category}`);
      const module = await loader();
      const instance = await module.load({
        config,
        library: library(),
        assetBase: options.assetBase ?? './assets',
        signal: abort.signal,
      });
      if (abort.signal.aborted || disposed) {
        instance.dispose();
        return;
      }
      scene = instance;
      // A preset chosen while the asset was loading wins over the one the load started with.
      instance.setConfig(config);
      stage.setContent(instance.root, instance.bounds);
      resize();
      library().setLowDetail(quality.tier === 'low');
      let shaderError = false;
      stage.renderer.debug.onShaderError = () => {
        shaderError = true;
      };
      try {
        if (instance.precompile) await instance.precompile(stage.renderer, stage.camera);
        else await stage.renderer.compileAsync(stage.scene, stage.camera);
        // compileAsync resolves even when linking failed; force the link check now so a
        // broken program becomes a poster fallback instead of a blank stage.
        for (const program of stage.renderer.info.programs ?? []) (program as { getUniforms(): unknown }).getUniforms();
      } catch {
        shaderError = true;
      }
      stage.renderer.debug.onShaderError = null;
      if (abort.signal.aborted || disposed) return;
      if (shaderError) throw Object.assign(new Error('shader'), { reason: 'shader-failure' as const });
      if (contextLost || stage.renderer.getContext().isContextLost()) {
        throw Object.assign(new Error('context'), { reason: 'context-lost' as const });
      }
      director.setReducedMotion(reduced());
      director.attach(instance);
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

  function destroyStage() {
    if (!stage) return;
    const canvas = stage.canvas;
    canvas.removeEventListener('webglcontextlost', onContextLost);
    canvas.removeEventListener('webglcontextrestored', onContextRestored);
    canvas.removeEventListener('pointerdown', onPointerDown);
    stage.dispose();
    canvas.remove();
    stage = null;
  }

  function onContextLost(event: Event) {
    event.preventDefault();
    contextLost = true;
    loadAbort?.abort();
    loadAbort = null;
    if (loadTimer) clearTimeout(loadTimer);
    cancelAnimationFrame(raf);
    raf = 0;
    looping = false;
    releaseScene();
    setResource('fallback', 'context-lost');
  }

  function onContextRestored() {
    if (restorationAttempted || disposed) return;
    restorationAttempted = true;
    destroyStage();
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
    if (!director.isPlaying) applyQuality();
  }

  function applyQuality() {
    const next = quality.applyPending();
    if (!next) return;
    if (next === 'static') {
      releaseScene();
      setResource('fallback', 'performance-static');
      return;
    }
    library().setLowDetail(next === 'low');
    resize();
    redraw();
    options.onResourceState?.({ state: resource, reason: 'reduced-quality' });
    emit();
    requestFrame();
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
        setResource('fallback', 'performance-static');
      } else if (resource !== 'ready') {
        if (contextLost) destroyStage();
        contextLost = false;
        void loadScene();
      } else {
        library().setLowDetail(tier === 'low');
        resize();
        redraw();
        requestFrame();
      }
      emit();
    },

    getState,

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
      destroyStage();
      for (const lib of libraries.values()) lib.dispose();
      libraries.clear();
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
