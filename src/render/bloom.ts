import {
  BufferAttribute, BufferGeometry, type Camera, Color, CustomBlending, HalfFloatType, LinearFilter, Mesh, NoBlending, type Object3D, OneFactor, OrthographicCamera, RGBAFormat, Scene,
  ShaderMaterial, AddEquation, Vector2, Vector4, type WebGLRenderer, WebGLRenderTarget,
} from 'three';

/**
 * Bloom (v1.6, the Hollywood pass): the camera's glare round the scene's HDR emitters, a mip-chain
 * bloom (Jimenez, "Next Generation Post Processing in Call of Duty: Advanced Warfare", SIGGRAPH
 * 2014: a 13-tap downsample with a Karis-weighted first level and a soft-knee threshold, then a
 * 3 × 3 tent upsample added level by level).
 *
 * **Only emitters bloom, and only when one is drawn.** An emitter registers itself as it is drawn
 * in the stage's main pass (`emitBloom`, from its onBeforeRender); a frame where none was drawn
 * costs nothing and its pixels are exactly the stage's own (the stage-colour measurement, the
 * empty backdrop still and every scene without a lit emitter are untouched: the main pass is the
 * whole frame). When one was: the emitters alone (the bloom layer: a flame's HDR twin, or an
 * emissive mesh marked with `markBloom`) are drawn again, as exposed scene-linear radiance, into a
 * target at the canvas's CSS resolution (so the glow's reach is the same in CSS pixels at every
 * pixel ratio, posters at 1×, the live canvas at 2×: a sensor's glare has a pixel footprint), the
 * chain is built from it above `threshold`, and its light is added onto the canvas within the
 * emitters' reach. The emitters are not depth-tested against the scene in that pass (the flames
 * are never behind anything; a scene that needs it says so).
 *
 * The scene itself keeps its pipeline (rendered straight to the canvas, NeutralToneMapping at the
 * rig's exposure): the bloom is added after it, in display space, through the same saturating
 * response the flame uses (1 − e^−x), which over the cove's and frosting's values adds what a
 * linear add before the tone curve would to within a few per cent (decided by rendering both;
 * docs/scenes/birthday-v1.6-flames.md).
 */

/** The three.js layer of what draws in the bloom pass. */
export const BLOOM_LAYER = 30;

export const BLOOM = {
  /** Exposed scene-linear radiance where blooming starts, and the soft knee's half-width. */
  threshold: 1,
  knee: 0.5,
  /** Share of the emitters' light the chain spreads (all levels summed, then divided by their count). */
  strength: 0.1,
  /** Display-space gain of the added light (≈ the sRGB curve's slope over the stage's mid-light values). */
  display: 0.65,
  /** Mip levels: Normal/High; Low (the cheaper chain: a tighter glow, three passes fewer). */
  levels: 5,
  lowLevels: 3,
} as const;

type Rect = readonly [number, number, number, number];

interface Pending {
  any: boolean;
  full: boolean;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
const pending = new WeakMap<WebGLRenderer, Pending>();

/**
 * An emitter is being drawn in the stage's main pass (call from its onBeforeRender). `rect`: the
 * reach of its own light on screen, in drawing-buffer pixels with the GL origin (bottom-left),
 * before the glow (the bloom adds its own reach); none: anywhere. Draws into a target are ignored
 * (the bloom pass's own, tooling's).
 */
export function emitBloom(renderer: WebGLRenderer, rect?: Rect): void {
  if (renderer.getRenderTarget() !== null) return;
  let p = pending.get(renderer);
  if (!p) pending.set(renderer, (p = { any: false, full: false, x0: 0, y0: 0, x1: 0, y1: 0 }));
  if (!p.any) {
    p.any = true;
    p.full = false;
    p.x0 = p.y0 = Infinity;
    p.x1 = p.y1 = -Infinity;
  }
  if (!rect) p.full = true;
  else {
    p.x0 = Math.min(p.x0, rect[0]);
    p.y0 = Math.min(p.y0, rect[1]);
    p.x1 = Math.max(p.x1, rect[2]);
    p.y1 = Math.max(p.y1, rect[3]);
  }
}

/**
 * Tooling: the bloom may be switched off (browser tests compare a frame with the same frame without
 * it, byte for byte) and counts the passes it has run.
 */
export const bloomTooling = { enabled: true, passes: 0 };

/** Tooling: what has registered for the next `apply` on `renderer` (null: nothing; 'full': no rectangle). */
export function pendingBloom(renderer: WebGLRenderer): Rect | 'full' | null {
  const p = pending.get(renderer);
  if (!p?.any) return null;
  return p.full ? 'full' : [p.x0, p.y0, p.x1, p.y1];
}

/**
 * Everything that may bloom (weakly held: a disposed scene's emitters go with it). Before the
 * scene is drawn the stage asks whether any of them is showing (visible up to the stage's scene):
 * none, and the bloom costs nothing.
 */
const sources = new Set<WeakRef<Object3D>>();

function showing(scene: Object3D): boolean {
  for (const ref of sources) {
    const o = ref.deref();
    if (!o) {
      sources.delete(ref);
      continue;
    }
    let n: Object3D | null = o;
    while (n && n !== scene && n.visible) n = n.parent;
    if (n === scene && scene.visible) return true;
  }
  return false;
}

/** Draw `object` in the bloom pass only (a flame's HDR twin; it hides itself when it has nothing to give). */
export function bloomOnly(object: Object3D): void {
  object.layers.set(BLOOM_LAYER);
  sources.add(new WeakRef(object));
}

/**
 * An emissive mesh drawn as usual that also blooms: its radiance above the threshold, drawn again
 * in the bloom pass (unlit there: the scene's lights stay on their own layer, so what blooms is its
 * emission and environment).
 */
export function markBloom(mesh: Mesh): void {
  if (mesh.userData.bloom) return;
  mesh.userData.bloom = true;
  mesh.layers.enable(BLOOM_LAYER);
  sources.add(new WeakRef(mesh));
  const prev = mesh.onBeforeRender;
  mesh.onBeforeRender = function (renderer, ...rest) {
    prev.call(this, renderer, ...rest);
    emitBloom(renderer);
  };
}

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }`;

/** The 13 taps (in source texels) and their groups (CoD AW): four corner boxes and the centre box. */
const TAPS = /* glsl */ `
  vec3 A = texture2D(tSrc, vUv + uTexel * vec2(-2.0, 2.0)).rgb;
  vec3 B = texture2D(tSrc, vUv + uTexel * vec2(0.0, 2.0)).rgb;
  vec3 C = texture2D(tSrc, vUv + uTexel * vec2(2.0, 2.0)).rgb;
  vec3 D = texture2D(tSrc, vUv + uTexel * vec2(-2.0, 0.0)).rgb;
  vec3 E = texture2D(tSrc, vUv).rgb;
  vec3 F = texture2D(tSrc, vUv + uTexel * vec2(2.0, 0.0)).rgb;
  vec3 G = texture2D(tSrc, vUv + uTexel * vec2(-2.0, -2.0)).rgb;
  vec3 H = texture2D(tSrc, vUv + uTexel * vec2(0.0, -2.0)).rgb;
  vec3 I = texture2D(tSrc, vUv + uTexel * vec2(2.0, -2.0)).rgb;
  vec3 J = texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb;
  vec3 K = texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  vec3 L = texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  vec3 M = texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb;`;

/** First level: the soft-knee threshold per group, Karis-weighted (no single hot texel flickers). */
const PREFILTER = /* glsl */ `
  uniform sampler2D tSrc;
  uniform vec2 uTexel;
  uniform vec4 uCurve; // threshold, threshold − knee, 2 × knee, 0.25 / knee
  varying vec2 vUv;
  vec3 knee(vec3 c) {
    float br = max(c.r, max(c.g, c.b));
    float rq = clamp(br - uCurve.y, 0.0, uCurve.z);
    rq = uCurve.w * rq * rq;
    return c * max(rq, br - uCurve.x) / max(br, 1e-4);
  }
  float karis(vec3 c) { return 1.0 / (1.0 + dot(c, vec3(0.2126, 0.7152, 0.0722))); }
  void main() {
    ${TAPS}
    vec3 g0 = knee((J + K + L + M) * 0.25);
    vec3 g1 = knee((A + B + D + E) * 0.25);
    vec3 g2 = knee((B + C + E + F) * 0.25);
    vec3 g3 = knee((D + E + G + H) * 0.25);
    vec3 g4 = knee((E + F + H + I) * 0.25);
    float w0 = 0.5 * karis(g0), w1 = 0.125 * karis(g1), w2 = 0.125 * karis(g2), w3 = 0.125 * karis(g3), w4 = 0.125 * karis(g4);
    gl_FragColor = vec4((g0 * w0 + g1 * w1 + g2 * w2 + g3 * w3 + g4 * w4) / (w0 + w1 + w2 + w3 + w4), 1.0);
  }`;

const DOWNSAMPLE = /* glsl */ `
  uniform sampler2D tSrc;
  uniform vec2 uTexel;
  varying vec2 vUv;
  void main() {
    ${TAPS}
    vec3 c = E * 0.125 + (A + C + G + I) * 0.03125 + (B + D + F + H) * 0.0625 + (J + K + L + M) * 0.125;
    gl_FragColor = vec4(c, 1.0);
  }`;

const TENT = /* glsl */ `
  vec3 tent(sampler2D t, vec2 uv, vec2 d) {
    vec3 c = texture2D(t, uv).rgb * 4.0;
    c += (texture2D(t, uv + vec2(-d.x, 0.0)).rgb + texture2D(t, uv + vec2(d.x, 0.0)).rgb + texture2D(t, uv + vec2(0.0, -d.y)).rgb + texture2D(t, uv + vec2(0.0, d.y)).rgb) * 2.0;
    c += texture2D(t, uv + vec2(-d.x, -d.y)).rgb + texture2D(t, uv + vec2(d.x, -d.y)).rgb + texture2D(t, uv + vec2(-d.x, d.y)).rgb + texture2D(t, uv + vec2(d.x, d.y)).rgb;
    return c * (1.0 / 16.0);
  }`;

/** Upsample a level onto the next larger one (added by the blend). */
const UPSAMPLE = /* glsl */ `
  uniform sampler2D tSrc;
  uniform vec2 uTexel;
  varying vec2 vUv;
  ${TENT}
  void main() { gl_FragColor = vec4(tent(tSrc, vUv, uTexel), 1.0); }`;

/** The chain's light onto the canvas (added in display space through the saturating response). */
const COMPOSITE = /* glsl */ `
  uniform sampler2D tSrc;
  uniform vec2 uTexel;
  uniform vec2 uGain; // strength / levels, display gain
  uniform vec2 uView; // drawing-buffer size (px)
  ${TENT}
  void main() {
    vec2 uv = gl_FragCoord.xy / uView;
    vec3 b = tent(tSrc, uv, uTexel) * uGain.x;
    gl_FragColor = vec4(1.0 - exp(-b * uGain.y), 1.0);
  }`;

function pass(fragmentShader: string, uniforms: Record<string, { value: unknown }>): ShaderMaterial {
  return new ShaderMaterial({ vertexShader: VERTEX, fragmentShader, uniforms, depthTest: false, depthWrite: false, blending: NoBlending, toneMapped: false });
}

function target(w: number, h: number): WebGLRenderTarget {
  const rt = new WebGLRenderTarget(w, h, { type: HalfFloatType, format: RGBAFormat, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: false, generateMipmaps: false });
  rt.texture.name = 'bloom';
  return rt;
}

const clear = new Color();
const enableLight = (o: Object3D) => {
  if ((o as Object3D & { isLight?: boolean }).isLight) o.layers.enable(BLOOM_LAYER);
};
const scissor = new Vector4();

/**
 * The stage's bloom (one per stage): `prepare` before the main pass, `composite` after it; both
 * no-ops unless an emitter is showing.
 */
export class Bloom {
  private source: WebGLRenderTarget | null = null;
  private mips: WebGLRenderTarget[] = [];
  private readonly size = new Vector2();
  private readonly buffer = new Vector2();
  private readonly fsScene = new Scene();
  private readonly fsCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quad: Mesh;
  private readonly prefilter = pass(PREFILTER, { tSrc: { value: null }, uTexel: { value: new Vector2() }, uCurve: { value: [0, 0, 0, 0] } });
  private readonly down = pass(DOWNSAMPLE, { tSrc: { value: null }, uTexel: { value: new Vector2() } });
  private readonly up = pass(UPSAMPLE, { tSrc: { value: null }, uTexel: { value: new Vector2() } });
  private readonly compositing = pass(COMPOSITE, { tSrc: { value: null }, uTexel: { value: new Vector2() }, uGain: { value: new Vector2() }, uView: { value: new Vector2() } });
  private levels: number = BLOOM.levels;
  /** Whether this device can render to half floats (WebGL2 with EXT_color_buffer_float or _half_float); without it, no bloom. */
  private supported: boolean | null = null;
  /** Tooling: the drawing-buffer rectangle the last composite covered (GL origin), or null. */
  lastRect: Rect | null = null;
  /** The chain's strength (BLOOM.strength; tooling may vary it to judge). */
  strength: number = BLOOM.strength;

  constructor() {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.quad = new Mesh(g, this.down);
    this.quad.frustumCulled = false;
    this.fsScene.add(this.quad);
    for (const m of [this.up, this.compositing]) {
      m.blending = CustomBlending;
      m.blendEquation = AddEquation;
      m.blendSrc = OneFactor;
      m.blendDst = OneFactor;
    }
    const k = BLOOM.knee;
    (this.prefilter.uniforms.uCurve!.value as number[]).splice(0, 4, BLOOM.threshold, BLOOM.threshold - k, 2 * k, 0.25 / k);
  }

  /** Low tier: the cheaper chain (fewer levels). */
  setLowDetail(enabled: boolean): void {
    this.levels = enabled ? BLOOM.lowLevels : BLOOM.levels;
  }

  private ensure(w: number, h: number): void {
    if (this.source && this.size.x === w && this.size.y === h && this.mips.length === this.levels) return;
    this.size.set(w, h);
    if (!this.source) this.source = target(w, h);
    else this.source.setSize(w, h);
    for (let i = 0; i < Math.max(this.levels, this.mips.length); i++) {
      if (i >= this.levels) {
        this.mips[i]!.dispose();
        continue;
      }
      const mw = Math.max(1, w >> (i + 1)), mh = Math.max(1, h >> (i + 1));
      if (this.mips[i]) this.mips[i]!.setSize(mw, mh);
      else this.mips[i] = target(mw, mh);
    }
    this.mips.length = this.levels;
  }

  private draw(renderer: WebGLRenderer, material: ShaderMaterial, src: WebGLRenderTarget, dst: WebGLRenderTarget | null): void {
    material.uniforms.tSrc!.value = src.texture;
    (material.uniforms.uTexel!.value as Vector2).set(1 / src.width, 1 / src.height);
    this.quad.material = material;
    renderer.setRenderTarget(dst);
    renderer.render(this.fsScene, this.fsCamera);
  }

  /** Whether `prepare` built the chain for this frame (the composite adds it). */
  private ready = false;

  /**
   * Before the stage's main pass: if an emitter is showing, draw the emitters alone into the bloom
   * target (as exposed scene-linear radiance) and build the chain from it, all in the bloom's own
   * targets, so the canvas's pass is never interrupted (on a tiled GPU an interruption stores and
   * reloads the multisampled canvas). Returns whether it did.
   */
  prepare(renderer: WebGLRenderer, scene: Scene, camera: Camera): boolean {
    this.ready = false;
    this.lastRect = null;
    if (!bloomTooling.enabled || !showing(scene)) {
      // Nothing to glow (another scene, the flames out): its targets go back to the GPU's pool, so a
      // scene without emitters holds nothing for it (they are made again, in a frame, if needed).
      this.release();
      return false;
    }
    if (this.supported === null) this.supported = renderer.capabilities.isWebGL2 && (renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float'));
    if (!this.supported) return false;
    const pr = renderer.getPixelRatio();
    renderer.getDrawingBufferSize(this.buffer);
    // The chain's base: the canvas's CSS resolution (its glow's reach is in CSS pixels).
    this.ensure(Math.max(1, Math.round(this.buffer.x / pr)), Math.max(1, Math.round(this.buffer.y / pr)));
    const source = this.source!;
    const prev = { target: renderer.getRenderTarget(), autoClear: renderer.autoClear, alpha: renderer.getClearAlpha(), background: scene.background, mask: camera.layers.mask };
    renderer.getClearColor(clear);
    renderer.autoClear = false;
    renderer.setRenderTarget(source);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, false, false);
    scene.background = null;
    camera.layers.set(BLOOM_LAYER);
    // The scene's lights take part (three keeps one light state per scene: a pass with other lights
    // would make every lit material look its program up again on the next pass, ≈1 ms a frame), but
    // its shadow map is not drawn here (it is the main pass's, and may be due once).
    scene.traverse(enableLight);
    const shadows = renderer.shadowMap, auto = shadows.autoUpdate, due = shadows.needsUpdate;
    shadows.autoUpdate = false;
    shadows.needsUpdate = false;
    renderer.render(scene, camera);
    shadows.autoUpdate = auto;
    shadows.needsUpdate = due;
    camera.layers.mask = prev.mask;
    scene.background = prev.background;
    // The chain: threshold and Karis on the way into the first level, then down, then back up.
    const mips = this.mips;
    this.draw(renderer, this.prefilter, source, mips[0]!);
    for (let i = 1; i < mips.length; i++) this.draw(renderer, this.down, mips[i - 1]!, mips[i]!);
    for (let i = mips.length - 1; i > 0; i--) this.draw(renderer, this.up, mips[i]!, mips[i - 1]!);
    renderer.setRenderTarget(prev.target);
    renderer.setClearColor(clear, prev.alpha);
    renderer.autoClear = prev.autoClear;
    this.ready = true;
    bloomTooling.passes++;
    return true;
  }

  /**
   * After the stage's main pass (and the haze): the chain's light onto the canvas, within the reach
   * of the emitters the main pass drew (they registered: `emitBloom`) plus the widest level's.
   * Returns whether it added any.
   */
  composite(renderer: WebGLRenderer): boolean {
    const p = pending.get(renderer);
    const drawn = !!p?.any;
    if (p) p.any = false;
    if (!this.ready || !drawn) return false;
    this.ready = false;
    const pr = renderer.getPixelRatio();
    renderer.getDrawingBufferSize(this.buffer);
    const W = this.buffer.x, H = this.buffer.y;
    const mips = this.mips;
    const reach = Math.ceil(2.5 * (1 << mips.length) * pr);
    const x0 = p!.full ? 0 : Math.max(0, Math.floor(p!.x0 - reach)), y0 = p!.full ? 0 : Math.max(0, Math.floor(p!.y0 - reach));
    const x1 = p!.full ? W : Math.min(W, Math.ceil(p!.x1 + reach)), y1 = p!.full ? H : Math.min(H, Math.ceil(p!.y1 + reach));
    if (x1 <= x0 || y1 <= y0) return false;
    const prev = { target: renderer.getRenderTarget(), autoClear: renderer.autoClear, scissor: renderer.getScissorTest() };
    renderer.getScissor(scissor);
    const u = this.compositing.uniforms;
    (u.uGain!.value as Vector2).set(this.strength / mips.length, BLOOM.display);
    (u.uView!.value as Vector2).set(W, H);
    renderer.autoClear = false;
    renderer.setRenderTarget(null);
    renderer.setScissor(x0 / pr, y0 / pr, (x1 - x0) / pr, (y1 - y0) / pr);
    renderer.setScissorTest(true);
    this.draw(renderer, this.compositing, mips[0]!, null);
    renderer.setScissor(scissor);
    renderer.setScissorTest(prev.scissor);
    renderer.setRenderTarget(prev.target);
    renderer.autoClear = prev.autoClear;
    this.lastRect = [x0, y0, x1, y1];
    return true;
  }

  /** Free the targets (made again on the next frame that needs them). */
  private release(): void {
    if (!this.source) return;
    this.source.dispose();
    for (const m of this.mips) m.dispose();
    this.mips = [];
    this.source = null;
  }

  dispose(): void {
    this.release();
    this.quad.geometry.dispose();
    for (const m of [this.prefilter, this.down, this.up, this.compositing]) m.dispose();
  }
}
