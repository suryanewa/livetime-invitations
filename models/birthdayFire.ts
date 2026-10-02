import {
  Box3, BufferAttribute, BufferGeometry, Color, DynamicDrawUsage, type Material, Matrix4, Mesh, type MeshStandardMaterial, type Object3D, type PlaneGeometry, Quaternion, type ShaderMaterial, Vector2,
  Vector3, Vector4, type WebGLRenderer,
} from 'three';
import type { MaterialLibrary } from '../src/render/materials.ts';
import { blackbodyAt, createPuffMaterial, createSmokeMaterial, FLAME_GLARE, type FlameUniforms, sootRadiance } from '../src/render/flame.ts';
import {
  FLAME_REST, flameScale, type FlameState, type Flicker, newSmokePuffs, sootFormed, newSmokeStrand, PUFF_COUNT, SMOKE_POINT_COUNT, SMOKE_STRAND_COUNT, smokePuffs, type SmokePuffs, smokeStrand,
  type SmokeStrand,
} from '../src/scenes/birthday/fire.ts';

/**
 * Birthday fire rig (v1.5, #4): per candle a ray-marched flame on a camera-facing quad and a warm
 * point light at the flame, and one ribbon mesh for every candle's smoke streaklines. Drawing only:
 * the states come from src/scenes/birthday/fire.ts.
 */

/**
 * A candle flame's light. A candle is ≈1 cd. three's physical point light gives irradiance I/d²
 * with d in scene units, read as metres; the scene is 1 unit = 20 cm, so a real I_cd/d_m² is
 * 25·I_cd/d² here. The studio's irradiance on the cake is ≈1.5 in its units and it depicts a
 * daylit room by a large window, ≈2,500 lx on the table: CANDLE_LIGHT_SCALE converts lux to it.
 * So the six flames add ≈15 % (warm) to the top tier between them, while the candle tips under
 * the flames, millimetres away, glow (measured: top tier red +16 %, outputs/v1.5 evidence).
 */
export const CANDLE_CANDELA = 1;
const CANDLE_LIGHT_SCALE = 1.5 / 2500;
export const CANDLE_LIGHT = CANDLE_CANDELA * 25 * CANDLE_LIGHT_SCALE;

/** The flame's light colour: soot at ≈1,900 K (linear sRGB, luminance-normalised). */
export function flameLightColor(): Color {
  const [r, g, b] = sootRadiance(1900);
  const m = Math.max(r, g, b);
  return new Color(r / m, g / m, b / m);
}

/** Flames lighting the cake (the master has six candles; the v1.1 tooling cake three). */
export const FLAME_LIGHT_COUNT = 6;
/**
 * A flame is not a point: within a few millimetres the inverse square would blow up. Treated as a
 * source of radius a, E = I/(d² + a²) (a = 3 mm, the luminous zone's half-width and then some).
 */
const FLAME_LIGHT_RADIUS = 0.015;

/** World positions and intensities (candela-equivalent, CANDLE_LIGHT units) of the flames' light. */
export interface FlameLights {
  pos: { value: Vector3[] };
  intensity: { value: number[] };
  color: { value: Color };
  radius2: { value: number };
}

export function createFlameLights(): FlameLights {
  return {
    pos: { value: Array.from({ length: FLAME_LIGHT_COUNT }, () => new Vector3()) },
    intensity: { value: Array.from({ length: FLAME_LIGHT_COUNT }, () => 0) },
    color: { value: flameLightColor() },
    radius2: { value: FLAME_LIGHT_RADIUS ** 2 },
  };
}

/**
 * The candle flames' light, on the cake's own materials only (frosting, candles): six point
 * PointLights would be evaluated by every lit fragment on stage (the cove fills the frame) for
 * ≈1.3 ms a frame at 1170² on the M2 Pro, for a contribution the cove 80 cm away never shows
 * (≈0.5 %). Added through three's own RE_Direct, so the frosting's sheen and the candles'
 * clearcoat respond to it as to any light. Chains onto an existing onBeforeCompile (the bin shade).
 */
export function patchFlameLight(material: Material, lights: FlameLights): void {
  if (material.userData.flameLight) return;
  material.userData.flameLight = true;
  const prev = material.onBeforeCompile;
  const prevKey = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    prev.call(material, shader, renderer);
    shader.uniforms.uFlamePos = lights.pos;
    shader.uniforms.uFlameI = lights.intensity;
    shader.uniforms.uFlameColor = lights.color;
    shader.uniforms.uFlameR2 = lights.radius2;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform vec3 uFlamePos[${FLAME_LIGHT_COUNT}];\nuniform float uFlameI[${FLAME_LIGHT_COUNT}];\nuniform vec3 uFlameColor;\nuniform float uFlameR2;`)
      .replace('#include <lights_fragment_end>', `
  for (int fi = 0; fi < ${FLAME_LIGHT_COUNT}; fi++) {
    if (uFlameI[fi] <= 0.0) continue;
    vec3 flv = (viewMatrix * vec4(uFlamePos[fi], 1.0)).xyz - geometryPosition;
    float fd2 = dot(flv, flv);
    IncidentLight flameLight;
    flameLight.direction = flv * inversesqrt(fd2);
    flameLight.color = uFlameColor * (uFlameI[fi] / (fd2 + uFlameR2));
    flameLight.visible = true;
    RE_Direct(flameLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
  }
#include <lights_fragment_end>`);
  };
  material.customProgramCacheKey = () => `${prevKey.call(material)}+flame-light-v1`;
  material.needsUpdate = true;
}

export interface FlameRig {
  /** flame_NN: the anchor (CANDLE.flameBase on the candle's axis). */
  node: Object3D;
  quad: Mesh;
  material: ShaderMaterial & { uniforms: FlameUniforms };
  /** Wick tip in candle_NN space. */
  wickTip: Vector3;
  /** This flame's slot in the shared FlameLights. */
  index: number;
  /** How far the candle's top has burnt down (melt.ts candleShortening): the wick and flame follow. */
  shorten: number;
  lights: FlameLights;
  /** The wick's own material (charred, ember-lit tip). */
  wickMaterial: MeshStandardMaterial;
  wickEmber: { value: Color };
}

/**
 * The wick: charred cotton (albedo ≈3 %), dark inside its flame's fuel-rich core as in photographs
 * (it takes no flame light). Its top 1.5 mm glows as the ember (emissive, Planck colour at the
 * ember's temperature).
 */
function wickMaterial(lib: MaterialLibrary, yTop: number): { material: MeshStandardMaterial; ember: { value: Color } } {
  const material = (lib.unique('mat_wick') as MeshStandardMaterial);
  const ember = { value: new Color(0, 0, 0) };
  const top = { value: yTop };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uEmberColor = ember;
    shader.uniforms.uWickTop = top;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vWickY;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vWickY = position.y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vWickY;\nuniform vec3 uEmberColor;\nuniform float uWickTop;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += uEmberColor * smoothstep(uWickTop - 0.0075, uWickTop - 0.001, vWickY);');
  };
  material.customProgramCacheKey = () => 'birthday-wick-v15';
  return { material, ember };
}

const inv = new Matrix4();
const buffer = new Vector2();
const centroid = new Vector3();
const view = new Vector3();
const clip = new Vector4();
/** Wick ember radiance scale (on soot's 1,900 K = 1 scale). */
const EMBER_GAIN = 260;

/**
 * Replace a candle's authored flame mesh (the GLB's v1.1 lathe) with the volumetric flame and add
 * its light. `wick` is measured for its tip (the wick curls, so the tip is off the candle axis).
 */
export function rigCandleFire(candle: Object3D, node: Object3D, wick: Object3D, lib: MaterialLibrary, quadGeometry: PlaneGeometry, lights: FlameLights, index: number): FlameRig {
  // The GLB's lathe flame: dropped (its geometry freed here; nothing else references it).
  for (const child of [...node.children]) {
    const m = child as Mesh;
    if (m.isMesh) {
      m.geometry.dispose();
      m.removeFromParent();
    }
  }
  node.scale.set(1, 1, 1);
  node.rotation.set(0, 0, 0);
  // Wick tip: top of the wick's box, in candle space, at the centre of its top cross-section.
  candle.updateWorldMatrix(true, true);
  const toCandle = new Matrix4().copy(candle.matrixWorld).invert();
  const box = new Box3();
  wick.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    m.geometry.computeBoundingBox();
    const b = m.geometry.boundingBox!.clone().applyMatrix4(new Matrix4().multiplyMatrices(toCandle, m.matrixWorld));
    box.union(b);
  });
  const top = new Vector3((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2);
  // The curl leans the top cross-section towards +x of the wick: take the top quarter's centre.
  let sx = 0, sz = 0, n = 0;
  wick.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    const pos = m.geometry.getAttribute('position') as BufferAttribute;
    const mm = new Matrix4().multiplyMatrices(toCandle, m.matrixWorld);
    const v = new Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mm);
      if (v.y > box.max.y - (box.max.y - box.min.y) * 0.25) { sx += v.x; sz += v.z; n++; }
    }
  });
  if (n) top.set(sx / n, box.max.y, sz / n);

  const material = lib.unique('mat_flame') as ShaderMaterial & { uniforms: FlameUniforms };
  const quad = new Mesh(quadGeometry, material);
  quad.name = `${node.name}_fx`;
  quad.userData.fx = true;
  quad.renderOrder = 4;
  quad.frustumCulled = false;
  const u = material.uniforms;
  u.uWidest.value = FLAME_REST.widest;
  quad.onBeforeRender = (renderer: WebGLRenderer, _s, camera) => {
    inv.copy(quad.matrixWorld).invert();
    u.uCam.value.setFromMatrixPosition(camera.matrixWorld).applyMatrix4(inv);
    u.uRight.value.setFromMatrixColumn(camera.matrixWorld, 0).transformDirection(inv);
    u.uUp.value.setFromMatrixColumn(camera.matrixWorld, 1).transformDirection(inv);
    // In front of the flame (towards the camera) so the wick inside it never depth-clips the quad.
    u.uCenter.value.copy(u.uCam.value).sub(u.uMid.value).normalize().multiplyScalar(u.uBoundR.value).add(u.uMid.value);
    // The camera's glare (src/render/flame.ts FLAME_GLARE): the luminous centroid on screen, the
    // flame's projected luminous area, the PSF in device pixels; the quad grows to hold the skirt.
    renderer.getDrawingBufferSize(buffer);
    const dpr = renderer.getPixelRatio();
    centroid.copy(u.uBase.value).addScaledVector(u.uAxisY.value, 0.45 * u.uShape.value[0]).applyMatrix4(quad.matrixWorld);
    view.copy(centroid).applyMatrix4(camera.matrixWorldInverse);
    clip.set(view.x, view.y, view.z, 1).applyMatrix4(camera.projectionMatrix);
    const depth = Math.max(1e-4, -view.z);
    const pxPerUnit = (buffer.y * camera.projectionMatrix.elements[5]!) / (2 * depth);
    u.uScreenC.value.set((clip.x / clip.w * 0.5 + 0.5) * buffer.x, (clip.y / clip.w * 0.5 + 0.5) * buffer.y);
    const s1 = FLAME_GLARE.sigma * dpr, s2 = FLAME_GLARE.skirt * dpr;
    u.uPsf.value.set(s1, s2);
    // Luminous area (teardrop ≈ 0.6 of its box) × its radiance on the film's scale (≈5) × the
    // fraction the optics spread, over the bleed lobe's area: the PSF's peak, capped.
    const area = 0.6 * (u.uShape.value[0] * pxPerUnit) * (2 * u.uShape.value[1] * pxPerUnit);
    const flux = 5 * area * u.uState.value[2];
    u.uPsfPeak.value = Math.min(FLAME_GLARE.cap * 5 * u.uState.value[2], (FLAME_GLARE.fraction * flux) / (2 * Math.PI * s1 * s1));
    u.uHalf.value = Math.max(u.uHalf.value, (3.2 * s2) / pxPerUnit);
  };
  node.add(quad);

  // The wick's mesh (its own space's top for the ember gradient).
  let wickMesh: Mesh | null = null;
  wick.traverse((o) => { if (!wickMesh && (o as Mesh).isMesh) wickMesh = o as Mesh; });
  const wm = wickMesh as Mesh | null;
  wm?.geometry.computeBoundingBox();
  const w = wickMaterial(lib, wm?.geometry.boundingBox?.max.y ?? 0);
  if (wm) wm.material = w.material;
  return { node, quad, material, wickTip: top, index, shorten: 0, lights, wickMaterial: w.material, wickEmber: w.ember };
}

const qInv = new Quaternion();
const qCake = new Quaternion();
const toNode = new Matrix4();
const up = new Vector3();
const flow = new Vector3();
const sway = new Vector3();
const dirH = new Vector3();
const anchor = new Vector3();
const tip = new Vector3();

/**
 * Draw candle flame `r` in state `f` with the live flicker `fl` and the wick ember (0–1). The flame
 * stands along world up (buoyancy) whatever the candle's tilt, leans towards the flow given in the
 * cake's plan (f.dirX, f.dirZ), and is anchored on the wick.
 */
export function poseFlame(r: FlameRig, candle: Object3D, f: FlameState, fl: Flicker, ember: number): void {
  const u = r.material.uniforms;
  const visible = f.intensity > 1e-4 || ember > 1e-3;
  r.quad.visible = visible;
  // The ember on the wick itself: Planck colour at 900–1,320 K (EMBER_GAIN calibrated with the flame's).
  if (ember > 1e-3) blackbodyAt(900 + 420 * ember, r.wickEmber.value).multiplyScalar(EMBER_GAIN * ember);
  else r.wickEmber.value.setRGB(0, 0, 0);
  // The light is the flame's luminous (soot) output: a fresh blue bead lights almost nothing.
  r.lights.intensity.value[r.index] = CANDLE_LIGHT * Math.max(0, f.intensity * fl.intensity) * sootFormed(f.lit);
  if (!visible) return;
  // World up and the cake-plan flow in the flame node's frame (the node may be counter-rotated
  // against its candle's lean, or not: both go through world space).
  r.node.updateWorldMatrix(true, false);
  r.node.getWorldQuaternion(qInv).invert();
  up.set(0, 1, 0).applyQuaternion(qInv);
  if (candle.parent) candle.parent.getWorldQuaternion(qCake);
  else qCake.identity();
  flow.set(f.dirX, 0, f.dirZ).applyQuaternion(qCake).applyQuaternion(qInv);
  flow.addScaledVector(up, -flow.dot(up)).normalize();
  // Candle space → the node's frame (its position, lowered with the melt, and its rotation).
  r.node.updateMatrix();
  toNode.copy(r.node.matrix).invert();
  // Lean = breath lean along the flow + room-draft sway.
  sway.set(fl.swayX, 0, fl.swayZ).addScaledVector(up, -fl.swayX * up.x - fl.swayZ * up.z);
  dirH.copy(flow).multiplyScalar(f.tilt).add(sway);
  let tilt = dirH.length();
  if (tilt > 1e-6) dirH.divideScalar(tilt);
  else { dirH.copy(flow); tilt = 0; }
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  u.uAxisY.value.copy(up).multiplyScalar(ct).addScaledVector(dirH, st);
  u.uAxisX.value.copy(up).multiplyScalar(-st).addScaledVector(dirH, ct);
  u.uAxisZ.value.crossVectors(u.uAxisX.value, u.uAxisY.value).normalize();
  const size = flameScale(r.index);
  const L = FLAME_REST.length * size * Math.max(f.height, 1e-3) * fl.height;
  const R = FLAME_REST.radius * size * Math.max(f.width, 1e-3) * fl.width;
  const bend = 0.5 * L * tilt * f.bend;
  // Base: on the wick's axis at the cup's height, carried downstream once it has lifted off.
  anchor.set(r.wickTip.x, FLAME_REST.base - r.shorten, r.wickTip.z).applyMatrix4(toNode);
  u.uBase.value.copy(anchor).addScaledVector(flow, f.lift);
  u.uShape.value[0] = L;
  u.uShape.value[1] = R;
  u.uShape.value[2] = bend;
  u.uShape.value[3] = f.neck;
  u.uState.value[0] = f.cut;
  u.uState.value[1] = f.cool;
  u.uState.value[2] = Math.max(0, f.intensity * fl.intensity);
  u.uState.value[3] = f.lit;
  u.uWick.value.set(r.wickTip.x, r.wickTip.y - r.shorten, r.wickTip.z).applyMatrix4(toNode);
  u.uEmber.value = ember;
  u.uPhase.value = fl.phase;
  tip.copy(u.uBase.value).addScaledVector(u.uAxisY.value, L).addScaledVector(u.uAxisX.value, -bend);
  u.uMid.value.copy(u.uBase.value).add(tip).multiplyScalar(0.5);
  u.uBoundR.value = 0.5 * tip.distanceTo(u.uBase.value) + 1.25 * R + 0.0008;
  // The quad covers the march sphere, the halo and the ember.
  u.uHalf.value = Math.max(u.uBoundR.value + 7 * R, u.uMid.value.distanceTo(u.uWick.value) + 0.005);
  r.lights.pos.value[r.index]!.copy(u.uBase.value).addScaledVector(u.uAxisY.value, 0.42 * L).applyMatrix4(r.node.matrixWorld);
}

/**
 * Every candle's smoke as ribbons: SMOKE_STRAND_COUNT threads per candle, SMOKE_POINT_COUNT
 * streakline points each, two vertices per point (expanded in the vertex shader).
 */
export class SmokeRig {
  readonly mesh: Mesh;
  private readonly geometry = new BufferGeometry();
  private readonly strands: SmokeStrand[];
  private readonly attrs: Record<'position' | 'aPrev' | 'aNext' | 'aWidth' | 'aAlpha' | 'aAge' | 'aSeed', BufferAttribute>;
  readonly material = createSmokeMaterial();
  /** The blown-out flames' soot puffs: soft blobs, one quad each. */
  readonly puffMesh: Mesh;
  private readonly puffGeometry = new BufferGeometry();
  private readonly puffMaterial = createPuffMaterial(this.material.uniforms.uColor.value);
  private readonly puffs: SmokePuffs[];
  private readonly puffAttrs: Record<'position' | 'aRadius' | 'aAlpha', BufferAttribute>;

  constructor(parent: Object3D, private readonly candles: number) {
    {
      const nb = candles * PUFF_COUNT, nv = nb * 4;
      const mk = (size: number) => new BufferAttribute(new Float32Array(nv * size), size).setUsage(DynamicDrawUsage);
      this.puffAttrs = { position: mk(3), aRadius: mk(1), aAlpha: mk(1) };
      for (const [k, a] of Object.entries(this.puffAttrs)) this.puffGeometry.setAttribute(k, a);
      const corner = new Float32Array(nv * 2);
      const idx: number[] = [];
      for (let q = 0; q < nb; q++) {
        corner.set([-1, -1, 1, -1, 1, 1, -1, 1], q * 8);
        idx.push(q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3);
      }
      this.puffGeometry.setAttribute('aCorner', new BufferAttribute(corner, 2));
      this.puffGeometry.setIndex(idx);
      this.puffs = Array.from({ length: candles }, () => newSmokePuffs());
      this.puffMesh = new Mesh(this.puffGeometry, this.puffMaterial);
      this.puffMesh.name = 'fx_puff';
      this.puffMesh.userData.fx = true;
      this.puffMesh.renderOrder = 3;
      this.puffMesh.frustumCulled = false;
      this.puffMesh.visible = false;
      parent.add(this.puffMesh);
    }
    const strands = candles * SMOKE_STRAND_COUNT;
    const n = strands * SMOKE_POINT_COUNT * 2;
    const mk = (size: number) => new BufferAttribute(new Float32Array(n * size), size).setUsage(DynamicDrawUsage);
    this.attrs = { position: mk(3), aPrev: mk(3), aNext: mk(3), aWidth: mk(1), aAlpha: mk(1), aAge: mk(1), aSeed: mk(1) };
    for (const [k, a] of Object.entries(this.attrs)) this.geometry.setAttribute(k, a);
    const side = new Float32Array(n);
    for (let v = 0; v < n; v++) side[v] = v % 2 ? 1 : -1;
    this.geometry.setAttribute('aSide', new BufferAttribute(side, 1));
    const index: number[] = [];
    for (let s = 0; s < strands; s++) {
      for (let k = 0; k < SMOKE_POINT_COUNT - 1; k++) {
        const v = (s * SMOKE_POINT_COUNT + k) * 2;
        index.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
      }
    }
    this.geometry.setIndex(index);
    this.strands = Array.from({ length: strands }, () => newSmokeStrand());
    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.name = 'fx_smoke';
    this.mesh.userData.fx = true;
    this.mesh.renderOrder = 3;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.onBeforeRender = (renderer) => {
      this.material.uniforms.uViewportH.value = renderer.getContext().drawingBufferHeight;
    };
    parent.add(this.mesh);
  }

  /**
   * Smoke at accept time `t` (or none, t < 0). `wicks[i]`: candle i's wick tip in the smoke
   * parent's space (cake_secondary).
   */
  update(t: number, wicks: readonly (readonly [number, number, number])[]): void {
    if (t < 0) {
      this.mesh.visible = false;
      this.puffMesh.visible = false;
      return;
    }
    let anyPuff = false;
    {
      const { position, aRadius, aAlpha } = this.puffAttrs;
      const pos = position.array as Float32Array, rad = aRadius.array as Float32Array, alp = aAlpha.array as Float32Array;
      for (let i = 0; i < this.candles; i++) {
        const p = this.puffs[i]!;
        if (smokePuffs(i, t, wicks[i]!, p)) anyPuff = true;
        for (let k = 0; k < PUFF_COUNT; k++) {
          for (let v = 0; v < 4; v++) {
            const at = (i * PUFF_COUNT + k) * 4 + v;
            pos[at * 3] = p.position[k * 3]!;
            pos[at * 3 + 1] = p.position[k * 3 + 1]!;
            pos[at * 3 + 2] = p.position[k * 3 + 2]!;
            rad[at] = p.radius[k]!;
            alp[at] = p.alpha[k]!;
          }
        }
      }
      for (const a of Object.values(this.puffAttrs)) a.needsUpdate = true;
      this.puffMesh.visible = anyPuff;
    }
    let any = false;
    const P = SMOKE_POINT_COUNT;
    const { position, aPrev, aNext, aWidth, aAlpha, aAge, aSeed } = this.attrs;
    const pos = position.array as Float32Array, prev = aPrev.array as Float32Array, next = aNext.array as Float32Array;
    const wid = aWidth.array as Float32Array, alp = aAlpha.array as Float32Array, age = aAge.array as Float32Array, seed = aSeed.array as Float32Array;
    for (let i = 0; i < this.candles; i++) {
      for (let s = 0; s < SMOKE_STRAND_COUNT; s++) {
        const st = this.strands[i * SMOKE_STRAND_COUNT + s]!;
        if (smokeStrand(i, s, t, wicks[i]!, st)) any = true;
        const base = (i * SMOKE_STRAND_COUNT + s) * P;
        for (let k = 0; k < P; k++) {
          const kp = Math.max(0, k - 1), kn = Math.min(P - 1, k + 1);
          for (let side = 0; side < 2; side++) {
            const v = (base + k) * 2 + side;
            for (let c = 0; c < 3; c++) {
              pos[v * 3 + c] = st.position[k * 3 + c]!;
              prev[v * 3 + c] = st.position[kp * 3 + c]!;
              next[v * 3 + c] = st.position[kn * 3 + c]!;
            }
            wid[v] = st.width[k]!;
            alp[v] = st.alpha[k]!;
            age[v] = st.age[k]!;
            // Noise coordinate travels with the parcel (its birth), distinct per thread.
            seed[v] = (t - st.age[k]!) * 2.3 + s * 7.31 + i * 3.77;
          }
        }
      }
    }
    for (const a of Object.values(this.attrs)) a.needsUpdate = true;
    this.mesh.visible = any;
  }

  dispose(): void {
    this.geometry.dispose();
    (this.material as Material).dispose();
    this.mesh.removeFromParent();
    this.puffGeometry.dispose();
    this.puffMaterial.dispose();
    this.puffMesh.removeFromParent();
  }
}
