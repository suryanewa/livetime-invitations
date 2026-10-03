import { type Camera, FramebufferTexture, LinearFilter, Mesh, NoBlending, PlaneGeometry, Scene, ShaderMaterial, Vector2, Vector3, type WebGLRenderer } from 'three';

/**
 * Heat haze (v1.6, the Hollywood pass): the hot plume over a flame bends the light coming through
 * it, so what is behind it shimmers. A screen-space refraction: after the stage's main pass the
 * canvas under the plumes is copied (only that rectangle), and each plume draws a camera-facing
 * column (about its own axis, depth-tested against the scene: what stands in front of the plume
 * is not bent) that samples the copy at offsets from the gradient of a refractive-index field
 * rising with the gas. Where the field's envelope is zero (the column's edges) the copy comes back
 * texel for texel, so the column has no seam.
 *
 * A plume registers itself as its source is drawn in the main pass (`addHaze`, from its
 * onBeforeRender); a frame without one costs nothing and is the main pass's own. Off under reduced
 * motion (its sources register no strength) and on the Low tier.
 */

export interface HazeColumn {
  /** World position of the column's foot (just under the flame's tip) and its axis (unit, world). */
  foot: Vector3;
  up: Vector3;
  /** Width and height (world units). */
  width: number;
  height: number;
  /** Peak displacement of the light behind it, in drawing-buffer pixels; 0: none. */
  strength: number;
  /** The plume's clock (s) and its seed. */
  time: number;
  seed: number;
}

interface Entry extends HazeColumn {
  frame: number;
}

const registry = new WeakMap<WebGLRenderer, Map<number, Entry>>();

/** Tooling: the haze may be switched off (tests) and counts the columns it has drawn. */
export const hazeTooling = { enabled: true, columns: 0 };

/** Tooling: the plumes registered on `renderer` in its current frame. */
export function hazeColumns(renderer: WebGLRenderer): HazeColumn[] {
  const frame = renderer.info.render.frame;
  return [...(registry.get(renderer)?.values() ?? [])].filter((e) => e.frame === frame);
}

/** Plume `id` is being drawn in the stage's main pass (call from its source's onBeforeRender). */
export function addHaze(renderer: WebGLRenderer, id: number, c: HazeColumn): void {
  if (renderer.getRenderTarget() !== null) return;
  let map = registry.get(renderer);
  if (!map) registry.set(renderer, (map = new Map()));
  let e = map.get(id);
  if (!e) map.set(id, (e = { foot: new Vector3(), up: new Vector3(), width: 0, height: 0, strength: 0, time: 0, seed: 0, frame: -1 }));
  e.foot.copy(c.foot);
  e.up.copy(c.up);
  e.width = c.width;
  e.height = c.height;
  e.strength = c.strength;
  e.time = c.time;
  e.seed = c.seed;
  e.frame = renderer.info.render.frame;
}

const VERTEX = /* glsl */ `
  uniform vec3 uFoot;
  uniform vec3 uUp;
  uniform vec3 uSide;
  uniform vec2 uSize;
  varying vec2 vUv;
  void main() {
    vUv = vec2(position.x * 2.0, position.y + 0.5);
    vec3 p = uFoot + uSide * (position.x * uSize.x) + uUp * ((position.y + 0.5) * uSize.y);
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }`;

const FRAGMENT = /* glsl */ `
  uniform sampler2D tCopy;
  uniform vec2 uOrigin;
  uniform vec2 uCopySize;
  uniform vec3 uHaze; // strength (px), time (s), seed
  varying vec2 vUv;
  float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float vn(vec2 x) {
    vec2 i = floor(x), f = fract(x), u = f * f * (3.0 - 2.0 * f);
    return mix(mix(h12(i), h12(i + vec2(1.0, 0.0)), u.x), mix(h12(i + vec2(0.0, 1.0)), h12(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  // The plume's index field: cells of a few millimetres rising with the hot gas and churning.
  float field(vec2 q) {
    float t = uHaze.y;
    return vn(q * vec2(2.2, 5.0) - vec2(0.0, 7.5 * t) + uHaze.z) + 0.5 * vn(q * vec2(4.4, 10.0) - vec2(1.3 * t, 15.0 * t) + uHaze.z * 1.7);
  }
  void main() {
    // Strongest just above the flame, thinning as the plume cools and spreads; nothing at its edges.
    float env = smoothstep(0.0, 0.14, vUv.y) * (1.0 - smoothstep(0.25, 1.0, vUv.y)) * (1.0 - smoothstep(0.35, 1.0, abs(vUv.x)));
    vec2 q = vec2(vUv.x, vUv.y);
    float e = 0.04;
    float f0 = field(q);
    vec2 g = vec2(field(q + vec2(e, 0.0)) - f0, field(q + vec2(0.0, e)) - f0) / e;
    // The field's gradient is ≈8 per unit of the column at these frequencies: ≈ uHaze.x px at most.
    vec2 off = g * (uHaze.x * env / 8.0);
    vec2 uv = (gl_FragCoord.xy + off - uOrigin) / uCopySize;
    gl_FragColor = texture2D(tCopy, uv);
  }`;

const SLOTS = 8;
const corner = new Vector3();
const view = new Vector3();
const side = new Vector3();

/** The stage's heat haze (one per stage). `apply` after the main pass; a no-op unless a plume was drawn. */
export class HeatHaze {
  /** Off on the Low tier. */
  enabled = true;
  private readonly scene = new Scene();
  private readonly meshes: Mesh[] = [];
  private readonly geometry = new PlaneGeometry(1, 1);
  private copy: FramebufferTexture | null = null;
  private readonly buffer = new Vector2();
  private readonly origin = new Vector2();
  /** Tooling: how many columns the last frame drew. */
  lastColumns = 0;
  private compiled = false;

  private slot(i: number): Mesh {
    let m = this.meshes[i];
    if (m) return m;
    const material = new ShaderMaterial({
      name: 'fx_heat_haze',
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        tCopy: { value: null }, uOrigin: { value: new Vector2() }, uCopySize: { value: new Vector2() }, uHaze: { value: new Vector3() },
        uFoot: { value: new Vector3() }, uUp: { value: new Vector3() }, uSide: { value: new Vector3() }, uSize: { value: new Vector2() },
      },
      depthTest: true,
      depthWrite: false,
      blending: NoBlending,
      toneMapped: false,
    });
    m = new Mesh(this.geometry, material);
    m.frustumCulled = false;
    this.meshes[i] = m;
    this.scene.add(m);
    return m;
  }

  apply(renderer: WebGLRenderer, camera: Camera): number {
    this.lastColumns = 0;
    const map = registry.get(renderer);
    if (!map?.size) {
      this.release();
      return 0;
    }
    const frame = renderer.info.render.frame;
    const live: Entry[] = [];
    let seen = false;
    for (const [id, e] of map) {
      if (e.frame !== frame) map.delete(id);
      else {
        seen = true;
        if (e.strength > 0.05 && this.enabled && hazeTooling.enabled && live.length < SLOTS) live.push(e);
      }
    }
    // Its program is linked the first time a plume is drawn at all (the scene's warm frame, still
    // under the poster), not on the first frame it shimmers.
    if (seen && !this.compiled) {
      this.compiled = true;
      this.slot(0);
      renderer.compile(this.scene, camera);
    }
    if (!live.length) {
      // Nothing shimmers (the flames out, still, or another scene): its copy goes back to the GPU.
      this.release();
      return 0;
    }
    renderer.getDrawingBufferSize(this.buffer);
    const W = this.buffer.x, H = this.buffer.y;
    camera.updateMatrixWorld();
    // The columns' rectangle on the canvas (drawing-buffer px, GL origin), with room for the offsets.
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, reach = 0;
    for (const e of live) {
      view.setFromMatrixPosition(camera.matrixWorld).sub(e.foot);
      side.crossVectors(e.up, view).normalize();
      if (side.lengthSq() < 0.5) side.set(1, 0, 0);
      for (let k = 0; k < 4; k++) {
        corner.copy(e.foot).addScaledVector(side, (k & 1 ? 0.5 : -0.5) * e.width).addScaledVector(e.up, k & 2 ? e.height : 0).project(camera);
        const px = (corner.x * 0.5 + 0.5) * W, py = (corner.y * 0.5 + 0.5) * H;
        x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
      }
      reach = Math.max(reach, e.strength);
    }
    const pad = Math.ceil(reach) + 2;
    x0 = Math.max(0, Math.floor(x0 - pad)); y0 = Math.max(0, Math.floor(y0 - pad));
    x1 = Math.min(W, Math.ceil(x1 + pad)); y1 = Math.min(H, Math.ceil(y1 + pad));
    if (x1 <= x0 || y1 <= y0) return 0;
    // The copy: sized in steps of 64 px (no reallocation as the flames flicker), kept on the canvas.
    const cw = Math.min(W, Math.ceil((x1 - x0) / 64) * 64), ch = Math.min(H, Math.ceil((y1 - y0) / 64) * 64);
    if (!this.copy || this.copy.image.width !== cw || this.copy.image.height !== ch) {
      this.copy?.dispose();
      this.copy = new FramebufferTexture(cw, ch);
      this.copy.minFilter = this.copy.magFilter = LinearFilter;
      this.copy.name = 'heat_haze';
    }
    this.origin.set(Math.min(x0, W - cw), Math.min(y0, H - ch));
    renderer.copyFramebufferToTexture(this.copy, this.origin);
    live.forEach((e, i) => {
      const m = this.slot(i);
      const u = (m.material as ShaderMaterial).uniforms;
      view.setFromMatrixPosition(camera.matrixWorld).sub(e.foot);
      (u.uSide!.value as Vector3).crossVectors(e.up, view).normalize();
      (u.uFoot!.value as Vector3).copy(e.foot);
      (u.uUp!.value as Vector3).copy(e.up);
      (u.uSize!.value as Vector2).set(e.width, e.height);
      (u.uHaze!.value as Vector3).set(e.strength, e.time, e.seed);
      u.tCopy!.value = this.copy;
      (u.uOrigin!.value as Vector2).copy(this.origin);
      (u.uCopySize!.value as Vector2).set(cw, ch);
      m.visible = true;
    });
    for (let i = live.length; i < this.meshes.length; i++) this.meshes[i]!.visible = false;
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(this.scene, camera);
    renderer.autoClear = autoClear;
    this.lastColumns = live.length;
    hazeTooling.columns += live.length;
    return live.length;
  }

  private release(): void {
    this.copy?.dispose();
    this.copy = null;
  }

  dispose(): void {
    this.release();
    this.geometry.dispose();
    for (const m of this.meshes) (m.material as ShaderMaterial).dispose();
  }
}
