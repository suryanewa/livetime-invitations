import {
  Box3, BufferAttribute, BufferGeometry, type Camera, Color, type Light, DynamicDrawUsage, type Material, Matrix3, Matrix4, Mesh, type MeshStandardMaterial, type Object3D, type PlaneGeometry, Quaternion, type ShaderMaterial, Vector2,
  Vector3, Vector4, type WebGLRenderer,
} from 'three';
import type { MaterialLibrary } from '../src/render/materials.ts';
import { CANDLE } from './birthdayContract.ts';
import { bloomOnly, emitBloom } from '../src/render/bloom.ts';
import { blackbodyAt, createFlameBloomMaterial, createSmokeMaterial, FLAME_BLOOM_FLOOR, type FlameUniforms, SMOKE_GLOW, sootRadiance } from '../src/render/flame.ts';
import { addHaze } from '../src/render/heatHaze.ts';
import {
  FLAME_REST, flameScale, type FlameState, type Flicker, newSmokeStrand, rand, SMOKE_POINT_COUNT, SMOKE_STRAND_COUNT, smokeAlive, type SmokeKind, smokeSource, smokeStrand, type SmokeStrand, sootFormed, type WakeAt, type WickAt,
} from '../src/scenes/birthday/fire.ts';

/**
 * Birthday fire rig (v1.5, #4; v1.6 the Hollywood pass): per candle a ray-marched flame volume (on
 * a camera-facing quad) with its HDR twin for the bloom, its heat haze and its light on the cake
 * (flickering with it, shadowed by the candles and the top tier), and one ribbon mesh for every
 * candle's smoke streaklines. Drawing only: the states come from src/scenes/birthday/fire.ts.
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
  /**
   * v1.6: every candle as an occluder of every flame's light (world): its axis from its base to its
   * wax top (burnt down by the melt), and (the candle's radius, the flame's own radius as a light).
   */
  candleA: { value: Vector3[] };
  candleB: { value: Vector3[] };
  occluder: { value: Vector2 };
  /** The top tier as an occluder (world): its centre in plan (x, z), its top surface's height, its radius. */
  tier: { value: Vector4 };
}

export function createFlameLights(): FlameLights {
  return {
    pos: { value: Array.from({ length: FLAME_LIGHT_COUNT }, () => new Vector3()) },
    intensity: { value: Array.from({ length: FLAME_LIGHT_COUNT }, () => 0) },
    color: { value: flameLightColor() },
    radius2: { value: FLAME_LIGHT_RADIUS ** 2 },
    // Unposed candles stand far away (they occlude nothing until a flame rig places them).
    candleA: { value: Array.from({ length: FLAME_LIGHT_COUNT }, () => new Vector3(0, -1e3, 0)) },
    candleB: { value: Array.from({ length: FLAME_LIGHT_COUNT }, () => new Vector3(0, -1e3 - 0.1, 0)) },
    occluder: { value: new Vector2(CANDLE.radius, FLAME_SOURCE_RADIUS) },
    tier: { value: new Vector4(0, -1e3, -1e3, 0) },
  };
}

/**
 * The top tier as an occluder (cake_secondary units): its buttercream wall stands at 0.485–0.489
 * under the rim piping (measured on the master; the hand finish moves it by ±1.4 %), so a cylinder
 * a little inside it (every point of the wall outside it) hides the flames from the tier's sides
 * and from the tier below.
 */
const TOP_TIER_RADIUS = 0.465;
const tierAt = new Vector3();
/** The flame as a light for its shadows: the luminous zone's half-width and a little (scene units). */
const FLAME_SOURCE_RADIUS = 0.013;
/**
 * Wax glow (v1.6): a candle's top is lit from inside. The flame's light falls on the pool and the
 * rim and scatters through the wax (paraffin's transport mean free path is millimetres), so the
 * candle's top few millimetres glow warm round their whole circumference, fading downwards
 * (e-folding WAX_MFP), as in every macro photograph of a burning candle.
 */
const WAX_GLOW = 0.12;
const WAX_MFP = 0.012;

/** The flames' light in a fragment shader (pars and the loop, chained before lights_fragment_end). */
const FLAME_LIGHT_PARS = /* glsl */ `
uniform vec3 uFlamePos[${FLAME_LIGHT_COUNT}];
uniform float uFlameI[${FLAME_LIGHT_COUNT}];
uniform vec3 uFlameColor;
uniform float uFlameR2;
uniform vec3 uCandleA[${FLAME_LIGHT_COUNT}];
uniform vec3 uCandleB[${FLAME_LIGHT_COUNT}];
uniform vec2 uCandleR;
uniform vec4 uTier;`;

function flameLightLoop(wax: boolean): string {
  const N = FLAME_LIGHT_COUNT;
  return /* glsl */ `
  {
    // In the world (the candles stand along its up): this point and its normal.
    mat3 fRt = transpose(mat3(viewMatrix));
    vec3 fP = fRt * (geometryPosition - viewMatrix[3].xyz);
    vec3 fN = fRt * geometryNormal;
    ${wax ? `// The candle this point is on: its own flame's light reaches it through the wax.
    int fOwn = -1;
    float fBelow = 0.0;
    for (int k = 0; k < ${N}; k++) {
      vec3 ab = uCandleB[k] - uCandleA[k];
      float ab2 = max(dot(ab, ab), 1e-12);
      float tt = dot(fP - uCandleA[k], ab) / ab2;
      if (tt > -0.05 && tt < 1.25 && distance(fP, uCandleA[k] + ab * clamp(tt, 0.0, 1.0)) < 1.6 * uCandleR.x + 0.002) {
        fOwn = k;
        fBelow = max(0.0, 1.0 - tt) * sqrt(ab2);
      }
    }` : ''}
    // Where this point is outside the top tier, the tier's rim between it and the flames.
    vec2 fM = fP.xz - uTier.xy;
    float fOut = dot(fM, fM) - uTier.w * uTier.w;
    // Six flames: their diffuse irradiance summed exactly (each through its shadows), shaded once
    // along their summed direction (one BRDF evaluation instead of six).
    vec3 fS = vec3(0.0);
    float fE = 0.0;
    for (int fi = 0; fi < ${N}; fi++) {
      if (uFlameI[fi] <= 0.0) continue;
      vec3 F = uFlamePos[fi];
      vec3 fd = F - fP;
      float fd2 = dot(fd, fd);
      // Its own candle's shadow: the flame stands a few millimetres over the wax, so the candle
      // hides it from everything round its foot (a disk, soft-edged by the flame's size, wider the
      // further below the top; its centre opposite the flame's lean). The other candles' shadows
      // from it fall where the other five flames light (a few per cent: not drawn).
      vec3 B = uCandleB[fi];
      float H = max(F.y - B.y, 1e-3), D = B.y - fP.y;
      vec2 c = B.xz + (B.xz - F.xz) * (D / H);
      float w = uCandleR.y * D / H + 2e-4;
      float vis = D > 0.0 ? smoothstep(-w, w, length(fP.xz - c) - uCandleR.x * (H + D) / H) : 1.0;
      // The top tier's rim (outside it, below its top: the line of sight must pass over the rim).
      if (fOut > 0.0 && fP.y < uTier.z) {
        vec2 u = fd.xz;
        float a = max(dot(u, u), 1e-10), b = dot(fM, u);
        float se = (-b - sqrt(max(b * b - a * fOut, 0.0))) / a;
        float wt = uCandleR.y * se + 1e-3;
        vis *= smoothstep(-wt, wt, fP.y + se * fd.y - uTier.z);
      }
      float E = uFlameI[fi] / (fd2 + uFlameR2) * vis;
      vec3 L = fd * inversesqrt(fd2);
      fS += E * L;
      fE += E * max(dot(fN, L), 0.0);
    }
    if (fE > 0.0) {
      vec3 fL = normalize(fS + 1e-6 * fN);
      IncidentLight flameLight;
      flameLight.direction = normalize(mat3(viewMatrix) * fL);
      flameLight.color = uFlameColor * (fE / max(dot(fN, fL), 0.1));
      flameLight.visible = true;
      RE_Direct(flameLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
    }
    ${wax ? `if (fOwn >= 0 && uFlameI[fOwn] > 0.0) {
      vec3 ft = uFlamePos[fOwn] - uCandleB[fOwn];
      reflectedLight.indirectDiffuse += material.diffuseColor * uFlameColor * (uFlameI[fOwn] / (dot(ft, ft) + uFlameR2)) * ${WAX_GLOW.toFixed(3)} * exp(-fBelow / ${WAX_MFP.toFixed(4)});
    }` : ''}
  }`;
}

/**
 * The candle flames' light, on the cake's own materials only (frosting, candles): six point
 * PointLights would be evaluated by every lit fragment on stage (the cove fills the frame) for
 * ≈1.3 ms a frame at 1170² on the M2 Pro, for a contribution the cove 80 cm away never shows
 * (≈0.5 %). Added through three's own RE_Direct, so the frosting's sheen and the candles'
 * clearcoat respond to it as to any light. Chains onto an existing onBeforeCompile (the bin shade).
 *
 * v1.6: each flame's light is shadowed by every candle (an analytic soft shadow: the candle a
 * capsule, the flame a source of its own size, so the shadow is sharp at the candle's foot and
 * opens into a penumbra away from it; a candle's own flame, a few millimetres over its top, leaves
 * a dark disk round its foot, as a real candle does), and the wax of each candle glows under its
 * own flame (the light scattered through it).
 */
export function patchFlameLight(material: Material, lights: FlameLights): void {
  if (material.userData.flameLight) return;
  material.userData.flameLight = true;
  const wax = material.name.startsWith('cake_candle');
  const prev = material.onBeforeCompile;
  const prevKey = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    prev.call(material, shader, renderer);
    Object.assign(shader.uniforms, {
      uFlamePos: lights.pos, uFlameI: lights.intensity, uFlameColor: lights.color, uFlameR2: lights.radius2, uCandleA: lights.candleA, uCandleB: lights.candleB, uCandleR: lights.occluder,
      uTier: lights.tier,
    });
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FLAME_LIGHT_PARS}`)
      .replace('#include <lights_fragment_end>', `${flameLightLoop(wax)}\n#include <lights_fragment_end>`);
  };
  material.customProgramCacheKey = () => `${prevKey.call(material)}+flame-light-v4${wax ? '-wax' : ''}`;
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
  /** The wick's own material (fresh, charred, ember-lit, ash-tipped). */
  wickMaterial: MeshStandardMaterial;
  wick: WickLook;
  /** Where the charred braid's curl carries the tip (candle space, at full char): the ember and the smoke leave from there. */
  curlTip: Vector3;
  /** v1.6: the flame's HDR twin, drawn in the bloom pass only (src/render/bloom.ts). */
  twin: Mesh;
  /** v1.6: the live clock and flicker gain it was posed with (the heat haze shimmers only while live). */
  live: { time: number; gain: number };
}

/**
 * The wick's life: fresh, it is white waxed cotton (host-ready); once lit it chars black (albedo
 * ≈2 %, matt) and its braid curls the top over by about a millimetre into the flame's edge; its
 * top glows as the ember (Planck emissive at the ember's temperature) and, once the ember has
 * cooled after the breath, is left as a pale grey ash tip. Works in scene units whatever the mesh's
 * quantization (the GLB stores the wick normalised, with its scale on the node).
 */
export interface WickLook {
  ember: { value: Color };
  /** 0 fresh white cotton – 1 charred. */
  char: { value: number };
  /** 0 – 1: the grey ash tip left by a cooled ember. */
  ash: { value: number };
}

/** Wick colours (linear): waxed cotton, char, ash; how far the charred braid curls its top over (units). */
const WICK = { fresh: [0.8, 0.75, 0.64], char: [0.016, 0.015, 0.014], ash: [0.33, 0.32, 0.31], curl: 1.0 * 0.005 } as const;

/** The way candle `index`'s braid curls (the wick's own x–z, radians from +x): each its own, round the master's lean. */
const curlAngle = (index: number) => (rand(index, 41) - 0.5) * 2.4;

function wickMaterial(lib: MaterialLibrary, mesh: Mesh | null, index: number): { material: MeshStandardMaterial; look: WickLook } {
  const material = (lib.unique('mat_wick') as MeshStandardMaterial);
  const look: WickLook = { ember: { value: new Color(0, 0, 0) }, char: { value: 1 }, ash: { value: 0 } };
  const a = curlAngle(index);
  const curlDir = { value: new Vector2(Math.cos(a), Math.sin(a)) };
  mesh?.geometry.computeBoundingBox();
  const b = mesh?.geometry.boundingBox;
  // Scene units per local unit (uniform node scale; the quantization's), the wick's local extent.
  const k = mesh ? mesh.scale.y : 1;
  const y0 = { value: b?.min.y ?? 0 }, scale = { value: k }, len = { value: b ? (b.max.y - b.min.y) * k : 0.0327 };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { uEmberColor: look.ember, uWickChar: look.char, uWickAsh: look.ash, uWickY0: y0, uWickS: scale, uWickLen: len, uWickCurl: curlDir });
    const f3 = (v: readonly number[]) => `vec3(${v.map((x) => x.toFixed(4)).join(', ')})`;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vWickTop;\nvarying vec2 vWickXZ;\nuniform float uWickY0;\nuniform float uWickS;\nuniform float uWickLen;\nuniform float uWickChar;\nuniform vec2 uWickCurl;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  float wickU = (position.y - uWickY0) * uWickS;
  vWickTop = uWickLen - wickU;
  vWickXZ = position.xz;
  float wickK = clamp(wickU / uWickLen, 0.0, 1.0);
  transformed.xz += uWickCurl * (${WICK.curl.toFixed(4)} / uWickS) * uWickChar * wickK * wickK * wickK;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vWickTop;\nvarying vec2 vWickXZ;\nuniform vec3 uEmberColor;\nuniform float uWickChar;\nuniform float uWickAsh;')
      .replace('#include <color_fragment>', `#include <color_fragment>
  float wickTip = 1.0 - smoothstep(0.003, 0.008, vWickTop);
  diffuseColor.rgb = mix(${f3(WICK.fresh)}, mix(${f3(WICK.char)}, ${f3(WICK.ash)}, wickTip * uWickAsh), uWickChar);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(roughnessFactor, 1.0, uWickChar);')
      // The ember: the very tip glows (≈0.3 mm fully), fading unevenly round the braid by ≈0.6–0.9 mm.
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  float wickAng = atan(vWickXZ.y, vWickXZ.x);
  float uneven = 0.5 + 0.5 * sin(3.0 * wickAng + 1.7) * sin(5.0 * wickAng + 0.4);
  totalEmissiveRadiance += uEmberColor * (1.0 - smoothstep(0.0015, 0.003 + 0.0015 * uneven, vWickTop));`);
  };
  material.customProgramCacheKey = () => 'birthday-wick-v15c';
  return { material, look };
}

const inv = new Matrix4();
const buffer = new Vector2();
const centroid = new Vector3();
const view = new Vector3();
const clip = new Vector4();
const hazeFoot = new Vector3();
const hazeUp = new Vector3();
/**
 * The heat haze over a flame (src/render/heatHaze.ts): a column `width` × the flame's radius wide
 * and `height` × its rest length tall, from just under its tip; its light behind bent by up to
 * `px` CSS px (laptop: 2–4 device px).
 */
export const HAZE = { width: 6, height: 4.5, px: 1.2, plume: 0.6 } as const;
/**
 * Wick ember radiance scale (on soot's 1,900 K = 1 scale): a freshly bared ember (1,320 K) is a
 * bright orange point; at its in-flame glow (EMBER.lit) a dim red tip in the dark zone.
 */
const EMBER_GAIN = 320;
/** Scene units per millimetre (fire.ts MM). */
const MM_UNITS = 0.005;

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
  // Its twin for the bloom pass: the same uniforms, drawn as scene-linear HDR (its visibility is the quad's).
  const twinMaterial = createFlameBloomMaterial(material);
  material.addEventListener('dispose', () => twinMaterial.dispose());
  const twin = new Mesh(quadGeometry, twinMaterial);
  twin.name = `${node.name}_fx_bloom`;
  twin.userData.fx = true;
  twin.frustumCulled = false;
  bloomOnly(twin);
  quad.add(twin);
  const u = material.uniforms;
  u.uWidest.value = FLAME_REST.widest;
  const live = { time: 0, gain: 0 };
  /**
   * The flame's camera-dependent uniforms, for whichever pass draws it first (the bloom pass's twin,
   * before the scene; then the quad): the quad faces the camera from in front of the flame, the
   * flame's pixel size, the bloom's footprint floor. Returns where it is on screen.
   */
  const face = (renderer: WebGLRenderer, camera: Camera) => {
    inv.copy(quad.matrixWorld).invert();
    u.uCam.value.setFromMatrixPosition(camera.matrixWorld).applyMatrix4(inv);
    u.uRight.value.setFromMatrixColumn(camera.matrixWorld, 0).transformDirection(inv);
    u.uUp.value.setFromMatrixColumn(camera.matrixWorld, 1).transformDirection(inv);
    // In front of the flame (towards the camera) so the wick inside it never depth-clips the quad.
    u.uCenter.value.copy(u.uCam.value).sub(u.uMid.value).normalize().multiplyScalar(u.uBoundR.value).add(u.uMid.value);
    u.uExposure.value = renderer.toneMappingExposure;
    // On screen (the canvas, whichever target is bound): the luminous centroid, the flame's size.
    renderer.getDrawingBufferSize(buffer);
    const dpr = renderer.getPixelRatio();
    centroid.copy(u.uBase.value).addScaledVector(u.uAxisY.value, 0.55 * u.uShape.value[0]).applyMatrix4(quad.matrixWorld);
    view.copy(centroid).applyMatrix4(camera.matrixWorldInverse);
    clip.set(view.x, view.y, view.z, 1).applyMatrix4(camera.projectionMatrix);
    const depth = Math.max(1e-4, -view.z);
    const scale = quad.matrixWorld.getMaxScaleOnAxis();
    const pxPerUnit = (buffer.y * camera.projectionMatrix.elements[5]!) / (2 * depth) * scale;
    const sx = (clip.x / clip.w * 0.5 + 0.5) * buffer.x, sy = (clip.y / clip.w * 0.5 + 0.5) * buffer.y;
    u.uPx.value = 1 / pxPerUnit;
    const output = u.uState.value[2] * sootFormed(u.uState.value[3]);
    // The sensor's footprint floor for the bloom (src/render/flame.ts FLAME_BLOOM_FLOOR), in the
    // bloom target's pixels (CSS px), fading out as the flame grows large on screen.
    const tall = (u.uShape.value[0] * pxPerUnit) / dpr;
    const [f0, f1] = FLAME_BLOOM_FLOOR.fade;
    const fade = 1 - Math.min(1, Math.max(0, (tall - f0) / (f1 - f0)));
    u.uFloor.value.set(sx / dpr, sy / dpr, FLAME_BLOOM_FLOOR.sigma, FLAME_BLOOM_FLOOR.floor * output * fade);
    // The quad holds the floor's Gaussian too (in the bloom pass).
    u.uHalf.value = Math.max(u.uHalf.value, (4 * FLAME_BLOOM_FLOOR.sigma * dpr) / pxPerUnit);
    return { sx, sy, dpr, scale, pxPerUnit, output };
  };
  twin.onBeforeRender = (renderer: WebGLRenderer, _s, camera) => {
    face(renderer, camera);
  };
  quad.onBeforeRender = (renderer: WebGLRenderer, _s, camera) => {
    const { sx, sy, dpr, scale, pxPerUnit, output } = face(renderer, camera);
    // Into a target (tooling) nothing is registered: the bloom and the haze are the stage's own.
    const ember = u.uEmber.value;
    if (renderer.getRenderTarget() !== null || (output <= 1e-3 && ember <= 0.05)) return;
    // Its glow's reach, for the bloom's composite (a flame only: an ember does not bloom).
    const h = u.uHalf.value * pxPerUnit * 1.5;
    if (output > 1e-3) emitBloom(renderer, [sx - h, sy - h, sx + h, sy + h]);
    // The heat haze over it: a column from just under its tip along its axis, while live; once
    // the flame is out the hot wick goes on heating the air the first vapour rises in, so the haze
    // runs on into the plume from the ember (fading as it cools: ≈1–2 s).
    const L = u.uShape.value[0], R = u.uShape.value[1];
    if (output > 1e-3) hazeFoot.copy(u.uBase.value).addScaledVector(u.uAxisY.value, 0.85 * L).addScaledVector(u.uAxisX.value, -u.uShape.value[2] * 0.5).applyMatrix4(quad.matrixWorld);
    else hazeFoot.copy(u.uWick.value).addScaledVector(up.set(0, 1, 0).transformDirection(inv), 0.002).applyMatrix4(quad.matrixWorld);
    hazeUp.copy(output > 1e-3 ? u.uAxisY.value : up.set(0, 1, 0).transformDirection(inv)).transformDirection(quad.matrixWorld);
    const heat = Math.max(Math.min(1, output), HAZE.plume * ember);
    addHaze(renderer, index, {
      foot: hazeFoot, up: hazeUp, width: HAZE.width * R * scale, height: HAZE.height * FLAME_REST.length * scale,
      // The breath blows the hot gas away and mixes it cold within a few millimetres: no plume, no haze.
      strength: HAZE.px * dpr * live.gain * heat * (1 - u.uNoise.value.y) ** 2, time: live.time, seed: 7.3 * index + 1.1,
    });
  };
  node.add(quad);

  // The wick's mesh (its own space's top for the ember gradient).
  let wickMesh: Mesh | null = null;
  wick.traverse((o) => { if (!wickMesh && (o as Mesh).isMesh) wickMesh = o as Mesh; });
  const wm = wickMesh as Mesh | null;
  const w = wickMaterial(lib, wm, index);
  if (wm) wm.material = w.material;
  // The curl's reach at the tip in candle space (the material bends the top by WICK.curl along its
  // own x–z, scaled by the quantization): the ember and the smoke leave from the curled tip.
  const curlTip = new Vector3();
  if (wm) {
    const a = curlAngle(index), k = wm.scale.y || 1;
    curlTip.set((Math.cos(a) * WICK.curl) / k, 0, (Math.sin(a) * WICK.curl) / k)
      .applyMatrix3(new Matrix3().setFromMatrix4(new Matrix4().multiplyMatrices(toCandle, wm.matrixWorld)));
  }
  u.uWickR.value = CANDLE.wickRadius;
  return { node, quad, material, wickTip: top, index, shorten: 0, lights, wickMaterial: w.material, wick: w.look, curlTip, twin, live };
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
  if (ember > 1e-3) {
    // Through a per-channel response, as the flame's (src/render/flame.ts): a hot ember saturates
    // red, then green, so it stays orange under the Neutral curve instead of washing to salmon.
    const e = blackbodyAt(900 + 420 * ember, r.wick.ember.value).multiplyScalar(EMBER_GAIN * ember);
    // v1.6: the flame's shoulder (x / (1 + x)): it never clips red and green together (a yellow LED).
    e.setRGB(e.r / (1 + e.r), e.g / (1 + e.g), e.b / (1 + e.b));
  } else r.wick.ember.value.setRGB(0, 0, 0);
  // The light is the flame's luminous (soot) output: a fresh blue bead lights almost nothing.
  r.lights.intensity.value[r.index] = CANDLE_LIGHT * Math.max(0, f.intensity * fl.intensity) * sootFormed(f.lit);
  // The candle as an occluder of every flame's light: its axis from its base to its wax top (in the
  // world, where the light's shader works), whether or not its own flame burns.
  candle.updateWorldMatrix(true, false);
  r.lights.candleA.value[r.index]!.set(0, 0, 0).applyMatrix4(candle.matrixWorld);
  r.lights.candleB.value[r.index]!.set(0, CANDLE.height - r.shorten, 0).applyMatrix4(candle.matrixWorld);
  const ws = candle.matrixWorld.getMaxScaleOnAxis();
  r.lights.occluder.value.set(CANDLE.radius * ws, FLAME_SOURCE_RADIUS * ws);
  // The top tier (its axis is the cake's; its top where the candles stand, a few millimetres down
  // so the uneven, hand-finished top is never shadowed by itself).
  if (r.index === 0 && candle.parent) {
    candle.parent.getWorldPosition(tierAt);
    r.lights.tier.value.set(tierAt.x, tierAt.z, r.lights.candleA.value[0]!.y + (CANDLE.insert - 0.004) * ws, TOP_TIER_RADIUS * ws);
  }
  r.live.time = fl.time;
  r.live.gain = fl.gain;
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
  // The bloom's twin shows only while there is a flame to glow (an ember alone does not bloom).
  r.twin.visible = u.uState.value[2] * sootFormed(f.lit) > 1e-3;
  // The ember sits on the tip where the charred braid has curled it.
  const c = r.wick.char.value;
  u.uWick.value.set(r.wickTip.x + r.curlTip.x * c, r.wickTip.y + r.curlTip.y * c - r.shorten, r.wickTip.z + r.curlTip.z * c).applyMatrix4(toNode);
  u.uWickFoot.value.set(r.wickTip.x, r.wickTip.y - 4 * MM_UNITS - r.shorten, r.wickTip.z).applyMatrix4(toNode);
  u.uEmber.value = ember;
  u.uPhase.value = fl.phase;
  // The volume's turbulence: carried on the live clock; the breath's gust tears the flame (by its lean), and a dying flame frays.
  u.uNoise.value.set(fl.time, Math.min(1, Math.max(f.tilt / 1.1, 0.6 * f.cut)), 3.7 * r.index + 0.5);
  tip.copy(u.uBase.value).addScaledVector(u.uAxisY.value, L).addScaledVector(u.uAxisX.value, -bend);
  u.uMid.value.copy(u.uBase.value).add(tip).multiplyScalar(0.5);
  // Holds the march's box: the flame, its widest radius and the turbulence's reach.
  u.uBoundR.value = 0.5 * tip.distanceTo(u.uBase.value) + 1.7 * R + (1.2 + 3.5 * u.uNoise.value.y) * MM_UNITS;
  // The quad covers the march sphere (the box and the turbulence's reach) and the ember.
  u.uHalf.value = Math.max(u.uBoundR.value + 0.5 * R, u.uMid.value.distanceTo(u.uWick.value) + 0.005);
  r.lights.pos.value[r.index]!.copy(u.uBase.value).addScaledVector(u.uAxisY.value, 0.42 * L).applyMatrix4(r.node.matrixWorld);
}

const smokeAt = new Vector3();
const keyAt = new Vector3();
const keys = new WeakMap<Object3D, Light | null>();
/** The stage's key: the light that casts the shadow (or the brightest), looked up once per scene. */
function keyLight(scene: Object3D): Light | null {
  let k = keys.get(scene);
  if (k !== undefined) return k;
  k = null;
  scene.traverse((o) => {
    const l = o as Light;
    if (!l.isLight || (l as Light & { isAmbientLight?: boolean }).isAmbientLight || (l as Light & { isHemisphereLight?: boolean }).isHemisphereLight) return;
    if (!k || (l.castShadow && !k.castShadow) || (l.castShadow === k.castShadow && l.intensity > k.intensity)) k = l;
  });
  keys.set(scene, k);
  return k;
}

/** Candle i's wick tip for smoke born at `birth` (SmokeRig.update; fire.ts WickAt). */
export type WickSource = (i: number, birth: number, out: [number, number, number]) => number | void;

/**
 * Every candle's smoke as ribbons: SMOKE_STRAND_COUNT threads per candle, SMOKE_POINT_COUNT
 * streakline points each, two vertices per point (expanded in the vertex shader).
 */
export class SmokeRig {
  readonly mesh: Mesh;
  private readonly geometry = new BufferGeometry();
  private readonly strands: SmokeStrand[];
  private readonly attrs: Record<'position' | 'aPrev' | 'aNext' | 'aWidth' | 'aAlpha' | 'aAge' | 'aSeed' | 'aHot', BufferAttribute>;
  readonly material = createSmokeMaterial();

  /** `parent`: the room the smoke rises in (birthday_root): smoke stays where it was born, not on the carried cake. */
  constructor(parent: Object3D, private readonly candles: number) {
    const strands = candles * SMOKE_STRAND_COUNT;
    const n = strands * SMOKE_POINT_COUNT * 2;
    const mk = (size: number) => new BufferAttribute(new Float32Array(n * size), size).setUsage(DynamicDrawUsage);
    this.attrs = { position: mk(3), aPrev: mk(3), aNext: mk(3), aWidth: mk(1), aAlpha: mk(1), aAge: mk(1), aSeed: mk(1), aHot: mk(1) };
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
    this.at = Array.from({ length: candles }, (_, i) => (birth: number, out: [number, number, number]) => this.wickAt(i, birth, out));
    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.name = 'fx_smoke';
    this.mesh.userData.fx = true;
    this.mesh.renderOrder = 3;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.onBeforeRender = (renderer, scene, camera) => {
      const u = this.material.uniforms;
      u.uViewportH.value = renderer.getContext().drawingBufferHeight;
      // The rig's key (the shadow-casting light): its direction from the smoke, in view space, and
      // its irradiance (three's decay-0 spot: intensity × colour wherever its cone reaches).
      const key = keyLight(scene);
      if (key) {
        this.mesh.getWorldPosition(smokeAt);
        key.getWorldPosition(keyAt);
        u.uKeyDir.value.copy(keyAt).sub(smokeAt).normalize().transformDirection(camera.matrixWorldInverse);
        u.uKey.value.copy(key.color).multiplyScalar(key.intensity);
      }
    };
    parent.add(this.mesh);
  }

  /** Candle i's wick for the smoke (set per update): one closure per candle, made once. */
  private wickAt: WickSource = () => 0;
  private readonly at: WickAt[];

  /**
   * Smoke at time `t` of `kind`'s clock (none for t < 0 or once it is over). `wickAt(i, birth,
   * out)`: candle i's wick tip, in the smoke parent's space, when a parcel was born, returning how
   * fast it moved through the air then (m/s; negative: none of its smoke is seen); `wake`: how far
   * a moving cake has carried smoke born at a time (none: it stays still). Returns the densest
   * opacity drawn (0: nothing to see).
   */
  update(t: number, kind: SmokeKind, wickAt: WickSource, wake?: WakeAt): number {
    if (!smokeAlive(t)) {
      this.mesh.visible = false;
      return 0;
    }
    this.wickAt = wickAt;
    let any = false, peak = 0;
    const P = SMOKE_POINT_COUNT;
    const { position, aPrev, aNext, aWidth, aAlpha, aAge, aSeed, aHot } = this.attrs;
    const pos = position.array as Float32Array, prev = aPrev.array as Float32Array, next = aNext.array as Float32Array;
    const wid = aWidth.array as Float32Array, alp = aAlpha.array as Float32Array, age = aAge.array as Float32Array, seed = aSeed.array as Float32Array, hot = aHot.array as Float32Array;
    for (let i = 0; i < this.candles; i++) {
      const at = this.at[i]!;
      const bare = smokeSource(i, kind).bare;
      // A starved (snuffed) flame dies blue and dim: little glow passes to its wisp.
      const glowK = kind === 'breath' ? 1 : 0.25;
      for (let s = 0; s < SMOKE_STRAND_COUNT; s++) {
        const st = this.strands[i * SMOKE_STRAND_COUNT + s]!;
        if (smokeStrand(i, s, t, at, st, kind, wake)) any = true;
        peak = Math.max(peak, st.peak);
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
            // The flame's last glow in the first vapour (src/render/flame.ts SMOKE_GLOW): parcels
            // born as the flame lets go, cooling over their first few hundredths of a second.
            const born = t - st.age[k]! - bare;
            hot[v] = born >= 0 && born < SMOKE_GLOW.born ? glowK * (1 - born / SMOKE_GLOW.born) * Math.exp(-st.age[k]! / SMOKE_GLOW.fade) : 0;
          }
        }
      }
    }
    for (const a of Object.values(this.attrs)) a.needsUpdate = true;
    this.mesh.visible = any;
    return peak;
  }

  dispose(): void {
    this.geometry.dispose();
    (this.material as Material).dispose();
    this.mesh.removeFromParent();
  }
}
