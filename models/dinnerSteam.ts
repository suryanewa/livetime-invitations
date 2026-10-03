import {
  BoxGeometry,
  BufferGeometry,
  type Camera,
  Color,
  Euler,
  Float32BufferAttribute,
  FrontSide,
  Group,
  HalfFloatType,
  LinearFilter,
  Matrix4,
  NearestFilter,
  Mesh,
  type Object3D,
  OrthographicCamera,
  type PerspectiveCamera,
  RepeatWrapping,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  UnsignedByteType,
  Vector2,
  Vector3,
  Vector4,
  WebGL3DRenderTarget,
  WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';
import { COVER, PLATE_PROFILE } from './dinnerContract.ts';
import {
  CAP_BAND, CLOUD, CLOUD_Y_MAX, cloudLook, RAISED_DIR, STEM_BAND, SPILL, spillFade, spillSource, type CloudState, cloudState, newCloudState, OUTER_STEPS, RISE_BAND, SKIRT_STEPS, type SteamClock, steamBounds, VEIL, VERTICAL_STEPS, veilSource,
} from '../src/scenes/dinner/steam.ts';
import { requestSceneDepth, type SceneDepthFrame } from '../src/render/sceneDepth.ts';

export type { SteamClock } from '../src/scenes/dinner/steam.ts';

/**
 * Dinner v1.6 steam: a raymarched volume (plan and CPU mirror: src/scenes/dinner/steam.ts; decisions:
 * docs/scenes/dinner-v1.6-steam.md).
 *
 *  - Noise: one tileable 64³ RGBA8 3D texture, generated once on the GPU (two Perlin fBms for the
 *    turbulent warp, a Perlin-Worley billow and a Worley fBm for the fine wisps).
 *  - The flow map: per frame, per steam clock, the axisymmetric part of the cloud's inverse map
 *    (`axisInverse`: the vortex ring's roll, the rise, the dome's drag, the cap's spread, the base's
 *    slump) is tabulated into a small half-float texture (ρ × y → the material's radius and height
 *    at the seat, its mean density, a dilated mean for empty-space skipping). The march then reads
 *    the map with one fetch instead of solving the flow at every sample.
 *  - The volume: a box over the plate, sized each frame to what is alive, raymarched front to back
 *    (40 steps, 24 on the Low tier, jittered start), up to the opaque scene's depth (the plate, the
 *    cloche, the bin: src/render/sceneDepth.ts) and the table. Each sample undoes the turbulence and
 *    the draught, reads the map, and reads the cloud's noise at the material point, so its structure
 *    is carried, sheared and rolled with the flow; the plate's veil is added on its own clock.
 *  - Light: single scattering from the rig's key (Henyey-Greenstein, forward-leaning), its
 *    transmittance taken through the cloud's own mean density along the key (two taps of the map)
 *    and a local tap of the noise, with Wrenninge's multiple-scattering octaves; the room's ambient,
 *    occluded from above; the lifted dome's shadow. Integrated energy-conserving (Hillaire 2015) and
 *    composited premultiplied over the scene, tone mapped like it.
 * Up to STEAM_LAYERS clocks draw at once in the one march: the reveal's, and steam a change of mind
 * left behind.
 */

/** Steam clocks drawn at once: the reveal's and up to two left behind by changes of mind. */
export const STEAM_LAYERS = 3;
/** The release window's open ends in the shaders (finite: an infinite edge makes smoothstep NaN). */
const OPEN = 1e6;

export const STEAM_LOOK = {
  /** Extinction per su at full density (the cloud under the crown: optical depth ≈ 3–4 through it). */
  sigma: 3.4,
  /** The key's share (its colour × intensity scaled to steam's in-scatter) and the room's (linear). */
  key: new Color(0.98, 0.99, 1.0).multiplyScalar(0.8),
  ambient: new Color(0.6, 0.6, 0.61),
  /** Henyey-Greenstein asymmetry (water droplets scatter forward). */
  g: 0.45,
  /** Room light the lifted dome's shadow leaves on the steam under it (it is lit from every side). */
  domeShade: 0.82,
  /** The key's share of the light on the plate, the cloche and the table: what the steam's shadow can take away. */
  shadow: 0.3,
  /**
   * March steps by what is showing: the dense young cloud, the cloud thinning into wisps, the
   * plate's veil (and the spill) alone. The Low tier takes `lowShare` of them.
   */
  steps: { dense: 28, thin: 20, veil: 16 },
  /** The march's pixel budget: half the drawing buffer a side, at most this many pixels. */
  marchPixels: 460_000,
  lowShare: 0.6,
} as const;

/** The flow map's domain and resolution (per clock): ρ ∈ [0, RHO_MAX], y ∈ [0, Y_MAX] (su). */
const RHO_MAX = 1.5, BOX_MAX = 2.6, Y_MAX = CLOUD_Y_MAX, MAP_W = 96, MAP_H = 160;
const NOISE_SIZE = 64;
/** The spill's density at its full source. */
const SPILL_STRENGTH = 7.5;
/** The light volume: N³ voxels over the proxy box, its z-slices tiled COLS × ROWS in one 2D atlas. */
const LIGHT_N = 24, LIGHT_COLS = 6, LIGHT_ROWS = 4;
/** Probes of the march's occupancy along each ray. */
const PROBES = 6;

const f = (x: number) => x.toFixed(5);

/** GLSL piecewise-linear lookup over [x, y] pairs (inlined constants). */
function glslProfile(name: string, pts: readonly (readonly [number, number])[]): string {
  const lines = [`float ${name}(float x) {`, `  if (x <= ${f(pts[0]![0])}) return ${f(pts[0]![1])};`];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]!, [x1, y1] = pts[i]!;
    if (x1 === x0) continue;
    lines.push(`  if (x <= ${f(x1)}) return mix(${f(y0)}, ${f(y1)}, (x - ${f(x0)}) / ${f(x1 - x0)});`);
  }
  lines.push(`  return ${f(pts[pts.length - 1]![1])};`, '}');
  return lines.join('\n');
}

// ── Noise: one tileable 64³ texture, generated on the GPU ──────────────────────
const NOISE_GEN = /* glsl */ `
precision highp float;
precision highp int;
uniform float uLayer;
varying vec2 vUv;

uvec3 pcg3d(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}
vec3 hash3(ivec3 c, int seed) { return vec3(pcg3d(uvec3(c + ivec3(seed * 131, seed * 71, seed * 37)))) / 4294967295.0; }
ivec3 wrap(ivec3 c, int n) { return ((c % n) + n) % n; }

/** Tileable gradient noise (period n cells over the unit cube), in [-1, 1]. */
float perlin(vec3 p, int n, int seed) {
  vec3 x = p * float(n);
  ivec3 i = ivec3(floor(x));
  vec3 fr = fract(x);
  vec3 u = fr * fr * fr * (fr * (fr * 6.0 - 15.0) + 10.0);
  float r = 0.0;
  float v[8];
  for (int k = 0; k < 8; k++) {
    ivec3 o = ivec3(k & 1, (k >> 1) & 1, (k >> 2) & 1);
    vec3 g = normalize(hash3(wrap(i + o, n), seed) * 2.0 - 1.0 + 1e-4);
    v[k] = dot(g, fr - vec3(o));
  }
  return mix(mix(mix(v[0], v[1], u.x), mix(v[2], v[3], u.x), u.y), mix(mix(v[4], v[5], u.x), mix(v[6], v[7], u.x), u.y), u.z) * 1.6;
}
/** Tileable Worley F1 distance (period n cells), ≈ [0, 1]. */
float worley(vec3 p, int n, int seed) {
  vec3 x = p * float(n);
  ivec3 i = ivec3(floor(x));
  vec3 fr = fract(x);
  float d = 1e9;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int xx = -1; xx <= 1; xx++) {
    ivec3 o = ivec3(xx, y, z);
    vec3 c = vec3(o) + hash3(wrap(i + o, n), seed) - fr;
    d = min(d, dot(c, c));
  }
  return clamp(sqrt(d), 0.0, 1.0);
}
float perlinFbm(vec3 p, int n, int seed) {
  return 0.55 * perlin(p, n, seed) + 0.28 * perlin(p, n * 2, seed + 1) + 0.12 * perlin(p, n * 4, seed + 2) + 0.05 * perlin(p, n * 8, seed + 3);
}
float worleyFbm(vec3 p, int n, int seed) {
  return 0.625 * (1.0 - worley(p, n, seed)) + 0.25 * (1.0 - worley(p, n * 2, seed + 1)) + 0.125 * (1.0 - worley(p, n * 4, seed + 2));
}

void main() {
  vec3 p = vec3(vUv, (uLayer + 0.5) / ${NOISE_SIZE}.0);
  float a = perlinFbm(p, 4, 11);
  float b = perlinFbm(p, 4, 23);
  // Perlin-Worley: billows with irregular, connected structure (Schneider, Nubis).
  float w = worleyFbm(p, 4, 37);
  float pw = clamp((0.5 + 0.5 * perlinFbm(p, 4, 41)) * 0.55 + w * 0.65 - 0.1, 0.0, 1.0);
  float detail = worleyFbm(p, 8, 53);
  gl_FragColor = vec4(0.5 + 0.5 * a, 0.5 + 0.5 * b, pw, detail);
}
`;

const FULLSCREEN_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

function fullscreenTriangle(): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  return g;
}

// ── The flow map (per frame, per clock) ─────────────────────────────────────────
/** GLSL mirror of the plan's weights and the axisymmetric inverse map (steam.ts `axisInverse`). */
const FLOW_GLSL = /* glsl */ `
${glslProfile('plateTop', PLATE_PROFILE)}
float riseWeight(float Y) { return ${f(CLOUD.base)} + ${f(1 - CLOUD.base)} * smoothstep(${f(RISE_BAND[0])}, ${f(RISE_BAND[1])}, Y); }
float dsmooth(float a, float b, float x) { if (x <= a || x >= b) return 0.0; float t = (x - a) / (b - a); return 6.0 * t * (1.0 - t) / (b - a); }
float riseWeightD(float Y) { return ${f(1 - CLOUD.base)} * dsmooth(${f(RISE_BAND[0])}, ${f(RISE_BAND[1])}, Y); }
float dragWeight(float Y) { return smoothstep(0.2, 0.72, Y); }
float dragWeightD(float Y) { return dsmooth(0.2, 0.72, Y); }
float capWeight(float Y) { return smoothstep(${f(CAP_BAND[0])}, ${f(CAP_BAND[1])}, Y); }
float capIntegral(float Y) {
  float a = ${f(CAP_BAND[0])}, b = ${f(CAP_BAND[1])};
  if (Y <= a) return 0.0;
  if (Y >= b) return 0.5 * (b - a) + (Y - b);
  float t = (Y - a) / (b - a);
  return (b - a) * (t * t * t - 0.5 * t * t * t * t);
}
float skirtWeight(float Y, float P) { return (1.0 - smoothstep(0.06, 0.2, Y)) * smoothstep(0.3, 0.6, P); }
float radialScale(float Y, vec4 s1) { return 1.0 + (s1.y - 1.0) * smoothstep(${f(STEM_BAND[0])}, ${f(STEM_BAND[1])}, Y) + (s1.x - s1.y) * capWeight(Y); }
float slumpSurface(float r) { return plateTop(min(r, ${f(0.8)})) * (1.0 - smoothstep(0.79, 0.95, r)); }
`;

const MAP_FRAGMENT = /* glsl */ `
precision highp float;
uniform vec4 uS0[${STEAM_LAYERS}]; // rise, dragUp, squash, (active)
uniform vec4 uS1[${STEAM_LAYERS}]; // cap, stem, skirt, roll
uniform vec4 uS2[${STEAM_LAYERS}]; // ringR, ringY, ringSigma, fade
uniform vec4 uS3[${STEAM_LAYERS}]; // floor, turb, stem fade, -
varying vec2 vUv;
${FLOW_GLSL}

float centreWeight(float P) { return 1.0 - ${f(CLOUD.centre)} * min(1.0, pow(P / ${f(CLOUD.radius)}, 2.0)); }
float dragCentre(float P) { return 1.45 - 0.9 * min(1.0, pow(P / ${f(CLOUD.radius)}, 2.0)); }
float vForward(float Y, float P, vec4 s0) { return Y + s0.x * riseWeight(Y) * centreWeight(P) + s0.y * dragWeight(Y) * dragCentre(P) - s0.z * capIntegral(Y); }
float solveY(float y, float P, vec4 s0) {
  float lo = y - s0.x - 1.5 * s0.y - 0.05, hi = y + s0.z + 0.05;
  for (int i = 0; i < ${VERTICAL_STEPS}; i++) {
    float mid = 0.5 * (lo + hi);
    if (vForward(mid, P, s0) < y) lo = mid; else hi = mid;
  }
  return 0.5 * (lo + hi);
}
float solveP(float P1, float Y, float skirt) {
  float a = max(0.0, P1 - skirt - 0.01), b = P1;
  for (int i = 0; i < ${SKIRT_STEPS}; i++) {
    float mid = 0.5 * (a + b);
    if (mid + skirt * skirtWeight(Y, mid) < P1) a = mid; else b = mid;
  }
  return 0.5 * (a + b);
}
float vSlope(float Y, float P, vec4 s0) { return 1.0 + s0.x * riseWeightD(Y) * centreWeight(P) + s0.y * dragWeightD(Y) * dragCentre(P) - s0.z * capWeight(Y); }

/** The cloud at the seat (cloudSeat): \`grow\` widens the soft wall (the dilated occupancy). */
float seat(float r, float Y, float floorH, float grow) {
  float q = Y - ${f(CLOUD.rim)};
  float k = q > 0.0 ? pow(pow(r / ${f(CLOUD.radius)}, ${f(CLOUD.power)}) + pow(q / ${f(CLOUD.height)}, ${f(CLOUD.power)}), ${f(1 / CLOUD.power)}) : r / ${f(CLOUD.radius)};
  float d = (1.0 - k) * ${f(Math.min(CLOUD.radius, CLOUD.height))};
  float inside = smoothstep(-grow, ${f(CLOUD.wall)}, d);
  float above = smoothstep(-grow, floorH, Y - plateTop(min(r, 0.8)));
  float grade = ${f(CLOUD.baseDensity)} + ${f(1 - CLOUD.baseDensity)} * smoothstep(0.05, 0.6, Y);
  return inside * above * grade;
}

void main() {
  float lf = vUv.y * float(${STEAM_LAYERS});
  int l = int(min(floor(lf), float(${STEAM_LAYERS - 1})));
  vec4 s0 = uS0[l], s1 = uS1[l], s2 = uS2[l], s3 = uS3[l];
  if (s0.w <= 0.0) { gl_FragColor = vec4(0.0); return; }
  float rho0 = vUv.x * ${f(RHO_MAX)};
  float y0 = fract(lf) * ${f(Y_MAX)};
  // The vortex ring's twirl, undone.
  vec2 e = vec2(rho0 - s2.x, y0 - s2.y);
  float phi = s1.w * exp(-dot(e, e) / (s2.z * s2.z));
  float c = cos(phi), sn = sin(phi);
  float rho = max(0.0, s2.x + c * e.x - sn * e.y);
  float y = s2.y + sn * e.x + c * e.y;
  // The rise (strongest on the axis), the drag up and the cap's squash, and the radial scale:
  // nested bisections (steam.ts axisInverse).
  float lo = 0.0, hi = rho / min(s1.y, 1.0) + 0.01;
  for (int k = 0; k < ${OUTER_STEPS}; k++) {
    float mid = 0.5 * (lo + hi);
    float Ym = solveY(y, mid, s0);
    if (mid * radialScale(Ym, s1) < rho) lo = mid; else hi = mid;
  }
  float P = 0.5 * (lo + hi);
  float Y = solveY(y, P, s0);
  float S = radialScale(Y, s1);
  float stretch = vSlope(Y, P, s0);
  // The base's slump (nested bisections).
  if (s1.z > 0.0) {
    float P1 = P, Y1 = Y;
    float a = Y1 - 0.2, b = Y1 + 0.2;
    for (int i = 0; i < ${SKIRT_STEPS}; i++) {
      float mid = 0.5 * (a + b);
      if (mid + slumpSurface(P1) - slumpSurface(solveP(P1, mid, s1.z)) < Y1) a = mid; else b = mid;
    }
    Y = 0.5 * (a + b);
    P = solveP(P1, Y, s1.z);
  }
  float dil = min(1.0, 1.0 / (stretch * S * S)) * (1.0 - s3.z * (1.0 - smoothstep(0.12, 0.42, Y)));
  float evap = exp(-max(0.0, y0 - ${f(CLOUD.evapFrom)}) / ${f(CLOUD.evaporate)});
  float k = dil * evap * s2.w * smoothstep(0.0, 0.012, y0 - slumpSurface(rho0));
  gl_FragColor = vec4(P, Y, seat(P, Y, s3.x, 0.0) * k, seat(P, Y, s3.x, s3.y + 0.03) * k);
}
`;

// ── The volume ──────────────────────────────────────────────────────────────────
const VOLUME_VERTEX = /* glsl */ `
uniform vec3 uBoxMin;
uniform vec3 uBoxMax;
varying vec3 vLocal;
void main() {
  vLocal = uBoxMin + (position + 0.5) * (uBoxMax - uBoxMin);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(vLocal, 1.0);
}
`;

const STEAM_CORE = /* glsl */ `
precision highp float;
precision highp sampler3D;
uniform sampler2D uMap;
uniform sampler3D uNoise;
uniform sampler2D uSceneDepth;
uniform bool uHasDepth;
uniform bool uOrtho;
uniform vec2 uNearFar;
uniform vec3 uCamLocal;
uniform mat4 uModelView;
uniform vec3 uBoxMin;
uniform vec3 uBoxMax;
/** Per clock: the cloud's and the veil's bounds (an empty box, min > max: none). */
uniform vec3 uCloudMin[${STEAM_LAYERS}];
uniform vec3 uCloudMax[${STEAM_LAYERS}];
uniform vec3 uVeilMin[${STEAM_LAYERS}];
uniform vec3 uVeilMax[${STEAM_LAYERS}];
uniform vec3 uSpillMin[${STEAM_LAYERS}];
uniform vec3 uSpillMax[${STEAM_LAYERS}];
/** The light volume's box (the clouds and the veils: it never jumps when the spill's box goes). */
uniform vec3 uLightMin;
uniform vec3 uLightMax;
uniform int uSteps;
uniform int uProbes;
/** The march's resolution over the drawing buffer's (≈ 0.42–0.5 a side). */
uniform vec2 uScale;
uniform bool uLow;
uniform float uSigma;
uniform int uDebug;
uniform vec3 uKeyDir;
uniform vec3 uKeyColor;
uniform vec3 uAmbient;
uniform float uG;
uniform float uDomeShade;
uniform mat4 uCoverInv;
uniform vec3 uSeated;
/** The light volume (an atlas of z-slices over the proxy box): optical depth to the key, from above, the dome's light. */
uniform sampler2D uLight;
/** Per clock: τ, drawn (0/1), fade, carries the cloud (0/1). */
uniform vec4 uA[${STEAM_LAYERS}];
/** Per clock: side drag (x, z), the draught's lean (x, z). */
uniform vec4 uB[${STEAM_LAYERS}];
/** Per clock: turbulence (su), erosion, thermal age (s), the thermal's rise (su). */
uniform vec4 uC[${STEAM_LAYERS}];
/** Per clock: release window start, end, capture τ, the cloud's rise since the capture (su). */
uniform vec4 uD[${STEAM_LAYERS}];
/** Per clock, the cloud's look at its age: turbulence amplitude, threshold, warp strength, fine octave's share. */
uniform vec4 uE[${STEAM_LAYERS}];
/** Per clock: the inside's fog, its soft width, the mixing sheet's width and strength. */
uniform vec4 uF[${STEAM_LAYERS}];
/** Per clock: the spill's source at τ − k·dt (k = 0..7, faded), and whether there is any. */
uniform vec4 uSp0[${STEAM_LAYERS}];
uniform vec4 uSp1[${STEAM_LAYERS}];
uniform float uSpillOn[${STEAM_LAYERS}];

const float RHO_MAX = ${f(RHO_MAX)};
const float Y_MAX = ${f(Y_MAX)};
const float LAYERS = ${STEAM_LAYERS}.0;

float sat(float x) { return clamp(x, 0.0, 1.0); }

/** The map at a plan radius and height on clock l: (P, Y, mean density, dilated mean). */
vec4 mapAt(float rho, float y, int l) {
  if (y < 0.0 || y > Y_MAX || rho > RHO_MAX) return vec4(0.0);
  vec2 uv = vec2(rho / RHO_MAX, (float(l) + clamp(y / Y_MAX, 0.5 / ${MAP_H}.0, 1.0 - 0.5 / ${MAP_H}.0)) / LAYERS);
  return texture(uMap, uv);
}

/** Steam the cover was set back over stays under it (v1.5 \`captured\`): 0 inside the seated dome. */
float captured(vec3 pc, int l) {
  if (uA[l].x < uD[l].z) return 1.0;
  vec3 cv = pc - uSeated;
  float r = length(cv.xz);
  float d = max(r - 0.66 * sqrt(max(0.0, 1.0 - pow(max(cv.y, 0.0) / 0.64, 2.2))), cv.y - 0.64);
  // (Low over the table the cover's skirt and the lifted plate sweep it further: the base's ring.)
  float reach = 0.2 + 0.32 * (1.0 - smoothstep(0.05, 0.3, cv.y));
  float band = smoothstep(0.0, reach, d + 0.08 * (texture(uNoise, pc * 2.3).r - 0.5) * 2.0);
  return smoothstep(-0.03, 0.0, d) * mix(1.0, band, smoothstep(0.0, 0.3, uA[l].x - uD[l].z));
}

/** The plate's veil at p on clock l: a thin, wispy column rising off the well. */
float veil(vec3 p, int l, float detail) {
  float h = p.y - ${f(PLATE_PROFILE[0]![1])};
  if (h <= 0.0 || h > ${f(VEIL.length)}) return 0.0;
  float tau = uA[l].x;
  // The source as it was h/rise ago (veilSource), with its release window.
  float te = tau - h / ${f(VEIL.rise)};
  float a = te - ${f(VEIL.t0)};
  if (a <= 0.0 || te <= uD[l].x || te >= uD[l].y + ${f(VEIL.cut)}) return 0.0;
  float k = max(0.0, a - ${f(VEIL.ramp)});
  float src = smoothstep(0.0, ${f(VEIL.ramp)}, a) * (${f(1 - VEIL.tail)} * exp(-k / ${f(VEIL.decay)}) + ${f(VEIL.tail)} * exp(-k / ${f(VEIL.tailDecay)}))
    * smoothstep(uD[l].x, uD[l].x + ${f(VEIL.ramp)}, te) * (1.0 - smoothstep(uD[l].y, uD[l].y + ${f(VEIL.cut)}, te));
  if (src <= 0.0) return 0.0;
  vec2 c = p.xz - uB[l].zw * h * 0.6;
  float w = ${f(VEIL.radius)} + ${f(VEIL.spread)} * h;
  float r = length(c);
  float lateral = 1.0 - smoothstep(0.45 * w, w, r);
  if (lateral <= 0.0) return 0.0;
  // Rising with the vapour, churning as it goes (its coordinates move up with it, and a slow field
  // warps them): a few thin, folded sheets (ridges of the noise), bright where they turn edge-on,
  // with clear air between them, as steam off a plate is.
  float s = h - ${f(VEIL.rise)} * tau;
  // A slow field that changes with height bends the sheets as they rise (they snake and twist,
  // never stand as a curtain of straight streaks), and breaks the column into a few wisps.
  vec4 n = texture(uNoise, vec3(c.x * 0.8, s * 0.9, c.y * 0.8) + vec3(0.0, 0.0, 0.05 * tau));
  vec3 qw = vec3(c.x * 0.95, s * 0.5, c.y * 0.95) + (n.xyz - 0.5) * (0.8 + 1.2 * smoothstep(0.0, 0.6, h));
  float ridge = 1.0 - abs(2.0 * texture(uNoise, qw + 3.7).r - 1.0);
  // (A few ribbons, not a curtain: the large field leaves most of the column clear.)
  float sheets = smoothstep(0.62, 0.96, ridge) * smoothstep(0.45, 0.7, n.b);
  float wisps = mix(0.6, 0.06 + 4.6 * sheets, smoothstep(0.02, 0.2, h));
  wisps *= mix(1.0, 0.7 + 0.6 * n.a, detail);
  return ${f(VEIL.strength)} * src * smoothstep(0.0, ${f(VEIL.base)}, h) * exp(-h / ${f(VEIL.evaporate)})
    * pow(${f(VEIL.radius)} / w, 2.0) * lateral * wisps * (1.0 - smoothstep(${f(VEIL.length - VEIL.top)}, ${f(VEIL.length)}, h));
}

/** Whether the veil could be at p on clock l (the probes' cheap test: inside its column, its source alive). */
bool veilOccupies(vec3 p, int l) {
  float h = p.y - ${f(PLATE_PROFILE[0]![1])};
  float te = uA[l].x - h / ${f(VEIL.rise)};
  if (h <= 0.0 || te <= ${f(VEIL.t0)} || te <= uD[l].x || te >= uD[l].y + ${f(VEIL.cut)}) return false;
  return length(p.xz - uB[l].zw * h * 0.6) < ${f(VEIL.radius)} + ${f(VEIL.spread)} * h;
}

/** The cloud's mean density at p on clock l (the map only: for the light's taps). */
float cloudMean(vec3 p, int l) {
  if (uA[l].w <= 0.0) return 0.0;
  vec2 q = p.xz - uB[l].zw * max(0.0, p.y - 0.15);
  return mapAt(length(q), p.y, l).b;
}

/** The cloud on clock l at p: the turbulence and the draught undone, the map read, the noise at the material point. */
/** The dome's outer radius at height y in its own frame (the superellipse fitted to its profile). */
float domeWall(float y) {
  float t = clamp(y / ${f(COVER.domeHeight)}, 0.0, 1.0);
  return ${f(COVER.radius)} * pow(1.0 - pow(t, 2.2), 1.0 / 2.2);
}

/** Whether the spill could be at p on clock l (the probes' test): near the dome's outer wall. */
bool spillOccupies(vec3 p, int l) {
  if (uSpillOn[l] <= 0.0) return false;
  vec3 cv = (uCoverInv * vec4(p, 1.0)).xyz;
  return cv.y > -0.1 && cv.y < ${f(COVER.domeHeight + 0.03)} && abs(length(cv.xz) - domeWall(cv.y) - 0.03) < 0.09;
}

/**
 * The spill on clock l at p: a thin sheet just off the dome's outer wall on its raised side, its
 * air the gap's outflow of climb / rise ago, rising in lobes and filaments.
 */
float spill(vec3 p, int l, float detail) {
  if (uSpillOn[l] <= 0.0) return 0.0;
  vec3 cv = (uCoverInv * vec4(p, 1.0)).xyz;
  float y = cv.y;
  if (y < -0.1 || y > ${f(COVER.domeHeight + 0.03)}) return 0.0;
  float r = length(cv.xz);
  float d = r - domeWall(y);
  float w = 0.008 + 0.045 * max(y, 0.0);
  if (d < -0.004 || d > w + 0.02) return 0.0;
  float c = dot(cv.xz / max(r, 1e-4), vec2(${f(RAISED_DIR.x)}, ${f(RAISED_DIR.y)}));
  float ang = acos(clamp(c, -1.0, 1.0));
  float az = exp(-(ang * ang) / ${f(SPILL.spread * SPILL.spread)});
  // When this air left the gap (it climbs the wall at the boundary layer's speed).
  float k = (max(y, 0.0) + 0.5 * max(-y, 0.0)) / ${f(SPILL.rise)} / ${f(SPILL.dt)};
  if (k >= ${SPILL.samples - 1}.0) return 0.0;
  int i = int(floor(k));
  float fk = k - float(i);
  float a = i < 4 ? uSp0[l][i] : uSp1[l][i - 4];
  float b = i + 1 < 4 ? uSp0[l][i + 1] : uSp1[l][i - 3];
  float src = mix(a, b, fk);
  if (src <= 0.0) return 0.0;
  float sheet = smoothstep(-0.004, 0.004, d) * (1.0 - smoothstep(0.4 * w, w + 0.02, d));
  // Lobes and filaments, rising with the air and curling over at the rim.
  float tau = uA[l].x;
  vec3 q = vec3(cv.x * 3.2, (y - ${f(SPILL.rise)} * tau) * 2.2, cv.z * 3.2);
  vec4 n = texture(uNoise, q * 0.5 + vec3(0.3, 0.0, 0.7));
  float lobes = smoothstep(0.32, 0.72, n.b + (n.r - 0.5) * 0.7);
  return ${f(SPILL_STRENGTH)} * src * az * sheet * mix(1.0, 0.25 + 1.5 * lobes, detail);
}

/** Whether clock l's cloud could show at p (the dilated mean, lifted by the most the turbulence can): the probes' test. */
bool cloudOccupies(vec3 p, int l) {
  if (uA[l].w <= 0.0) return false;
  vec2 q = p.xz - uB[l].zw * max(0.0, p.y - 0.15);
  return mapAt(length(q), p.y, l).a > 1e-3;
}

/**
 * The cloud on clock l at p: the draught and the dome's side drag undone, the map read (the flow's
 * axisymmetric inverse), the cloud's own turbulence at the material point.
 */
float cloud(vec3 p, int l, float detail, vec3 L, out float shadeOd) {
  shadeOd = 0.0;
  if (uA[l].w <= 0.0) return 0.0;
  vec4 E = uE[l], F = uF[l];
  vec3 q = p;
  q.xz -= uB[l].zw * max(0.0, q.y - 0.15);
  // The room's air shears it: a large turbulent warp of the cloud's outline that grows with age
  // (billows bulge and tear off), evolving rather than scrolling.
  float tau0 = uA[l].x;
  vec4 w = texture(uNoise, q * 0.75 + vec3(0.13, -0.3 * uC[l].z, 0.07 * tau0));
  q -= uC[l].x * (w.rgb - 0.5) * 2.0;
  // The dome's side drag moved the upper cloud (by material height: its height less the rise).
  q.xz -= uB[l].xy * smoothstep(0.2, 0.72, q.y - uC[l].w);
  float rho = length(q.xz);
  vec4 m = mapAt(rho, q.y, l);
  float shape = m.b;
  // (The turbulence moves the mixture only within the cloud's reach: the dilated mean.)
  float reach = smoothstep(0.0, 0.25, m.a);
  if (shape + 0.6 * E.x * reach < E.y) return 0.0;
  vec2 dir = rho > 1e-5 ? q.xz / rho : vec2(1.0, 0.0);
  vec3 X = vec3(dir * m.r, m.g);
  // The cloud's own turbulence, carried with the flow (in material space) and evolving: a large
  // smooth field warps a finer fBm, so the structure folds and curls.
  float tau = uA[l].x;
  vec3 Xs = X * 1.15 + vec3(0.31, 0.17 + 0.05 * tau, 0.53);
  vec4 n1 = texture(uNoise, Xs * 0.55);
  vec3 warp = (n1.rgb - 0.5) * E.z;
  vec4 n2 = texture(uNoise, Xs + warp);
  // Mostly large swirls; the finer octave only where it is thin and torn.
  float fbm = (n2.r - 0.5) + E.w * (n2.g - 0.5) * detail;
  // Visible steam is the droplets of the saturated air, densest where it mixes with the room's (the
  // mixing layer: steam's sheets and fold lines). The mean shape, perturbed by the turbulence, is
  // the mixture. Under the dome it was fog with a soft edge; once out, the room's air folds its
  // edge into sheets and empties the inside as it mixes; evaporation raises the threshold (only
  // the wettest air keeps its droplets). The inside swirls: the cloud was turning under the dome.
  float c = shape + E.x * fbm * (1.0 - 0.35 * shape) * reach;
  float sh = (c - E.y) / F.z;
  // (As it thins, its sheets gather into a few larger wisps: patches of the large field.)
  float gather = mix(1.0, smoothstep(0.35, 0.65, n1.b), sat((uC[l].z - 0.3) * 0.9));
  float d = F.x * (0.15 + 1.25 * smoothstep(0.3, 0.75, n2.b)) * smoothstep(E.y, E.y + F.y, c) + F.w * exp(-sh * sh) * (0.45 + 0.55 * smoothstep(0.0, 0.3, shape)) * gather;
  // A change of mind: once the cover is back on the plate, the fog low over the plate (the base and
  // its slump over the rim) is swept by its skirt and leaves with the plate.
  if (uA[l].x > uD[l].z) d *= 1.0 - (1.0 - smoothstep(0.12, 0.26, X.y)) * smoothstep(uD[l].z, uD[l].z + 0.25, uA[l].x);
  // The billows' own shade: the mixture a little way towards the key.
  if (d > 0.02 && detail > 0.0 && uC[l].z < 1.0) {
    vec4 nl = texture(uNoise, Xs + warp + L * 0.12);
    shadeOd = 0.06 * sat((shape + E.x * (nl.r - 0.5) - E.y) * 3.0);
  }
  return d;
}

/** The veil's mean density at p (no wisps: for the light volume). */
float veilMean(vec3 p, int l) {
  float h = p.y - ${f(PLATE_PROFILE[0]![1])};
  if (h <= 0.0 || h > ${f(VEIL.length)}) return 0.0;
  float te = uA[l].x - h / ${f(VEIL.rise)};
  float a = te - ${f(VEIL.t0)};
  if (a <= 0.0 || te <= uD[l].x || te >= uD[l].y + ${f(VEIL.cut)}) return 0.0;
  float k = max(0.0, a - ${f(VEIL.ramp)});
  float src = smoothstep(0.0, ${f(VEIL.ramp)}, a) * (${f(1 - VEIL.tail)} * exp(-k / ${f(VEIL.decay)}) + ${f(VEIL.tail)} * exp(-k / ${f(VEIL.tailDecay)}));
  float w = ${f(VEIL.radius)} + ${f(VEIL.spread)} * h;
  float r = length(p.xz - uB[l].zw * h * 0.6);
  return 0.5 * ${f(VEIL.strength)} * src * smoothstep(0.0, ${f(VEIL.base)}, h) * exp(-h / ${f(VEIL.evaporate)}) * pow(${f(VEIL.radius)} / w, 2.0) * (1.0 - smoothstep(0.45 * w, w, r));
}

/** The light volume's atlas: N³ voxels over the proxy box, z-slices tiled COLS across. */
const float LN = ${LIGHT_N}.0;
const float LCOLS = ${LIGHT_COLS}.0;
const float LROWS = ${LIGHT_ROWS}.0;
vec3 lightAt(vec3 p) {
  vec3 u = clamp((p - uLightMin) / max(uLightMax - uLightMin, vec3(1e-4)), 0.0, 1.0);
  vec2 xy = clamp(u.xy * LN, 0.5, LN - 0.5);
  float fz = clamp(u.z * LN - 0.5, 0.0, LN - 1.0);
  float z0 = floor(fz), z1 = min(z0 + 1.0, LN - 1.0);
  vec2 a = (vec2(mod(z0, LCOLS), floor(z0 / LCOLS)) * LN + xy) / vec2(LCOLS * LN, LROWS * LN);
  vec2 b = (vec2(mod(z1, LCOLS), floor(z1 / LCOLS)) * LN + xy) / vec2(LCOLS * LN, LROWS * LN);
  return mix(texture(uLight, a).rgb, texture(uLight, b).rgb, fz - z0);
}

/** Henyey-Greenstein. */
float hg(float c, float g) { float g2 = g * g; return (1.0 - g2) / (4.0 * 3.14159265 * pow(1.0 + g2 - 2.0 * g * c, 1.5)); }

/** The lifted dome's shadow from the key (its ellipsoid, a soft penumbra; v1.5 steamLight). */
float domeLit(vec3 p) {
  vec3 cv = (uCoverInv * vec4(p, 1.0)).xyz;
  vec3 sc = vec3(1.0 / 0.655, 1.0 / 0.645, 1.0 / 0.655);
  vec3 o = cv * sc;
  vec3 kd = normalize(mat3(uCoverInv) * uKeyDir * sc);
  float along = -dot(o, kd);
  vec3 near = o + kd * along;
  float shade = (1.0 - smoothstep(0.82, 1.12, length(near))) * smoothstep(0.0, 0.15, along) * smoothstep(-0.25, 0.0, near.y);
  return 1.0 - shade;
}

/** Interleaved gradient noise: the march's per-pixel start (a fixed dither, deterministic). */
float ign(vec2 px) { return fract(52.9829189 * fract(dot(px, vec2(0.06711056, 0.00583715)))); }

vec2 boxHit(vec3 ro, vec3 rd, vec3 bmin, vec3 bmax) {
  vec3 inv = 1.0 / rd;
  vec3 t0 = (bmin - ro) * inv, t1 = (bmax - ro) * inv;
  vec3 tmin = min(t0, t1), tmax = max(t0, t1);
  return vec2(max(max(tmin.x, tmin.y), tmin.z), min(min(tmax.x, tmax.y), tmax.z));
}
`;

/** The light volume (per frame): each voxel's optical depth to the key and to the room above, through the steam's mean density, and the dome's shade. */
const LIGHT_FRAGMENT = /* glsl */ `
${STEAM_CORE}
varying vec2 vUv;
float meanAt(vec3 p) {
  float m = 0.0;
  for (int l = 0; l < ${STEAM_LAYERS}; l++) {
    if (uA[l].y <= 0.0) continue;
    m += (cloudMean(p, l) + veilMean(p, l)) * uA[l].z;
  }
  return m;
}
void main() {
  vec2 px = vUv * vec2(LCOLS * LN, LROWS * LN);
  vec2 cell = floor(px / LN);
  float z = cell.y * LCOLS + cell.x;
  if (z >= LN) { gl_FragColor = vec4(0.0); return; }
  vec3 u = vec3(mod(px, LN) / LN, (z + 0.5) / LN);
  vec3 p = uLightMin + u * (uLightMax - uLightMin);
  vec3 L = normalize(uKeyDir);
  float od = 0.0, up = 0.0;
  for (int i = 0; i < 9; i++) {
    float s = (float(i) + 0.5) * 0.12;
    od += meanAt(p + L * s) * 0.12;
  }
  for (int i = 0; i < 4; i++) {
    float s = (float(i) + 0.5) * 0.16;
    up += meanAt(p + vec3(0.0, s, 0.0)) * 0.16;
  }
  gl_FragColor = vec4(od, up, domeLit(p), 1.0);
}
`;

const VOLUME_FRAGMENT = /* glsl */ `
${STEAM_CORE}
varying vec3 vLocal;
/** View distance (positive) of a [0, 1] scene depth. */
float viewDistance(float dz) {
  float n = uNearFar.x, fa = uNearFar.y;
  return uOrtho ? n + dz * (fa - n) : -(n * fa) / ((fa - n) * dz - fa);
}

void main() {
  vec3 ro = uCamLocal;
  vec3 rd = normalize(vLocal - ro);
  // The ray's span through every live box (the clouds and the veils), not the whole proxy box.
  float t0 = 1e9, t1 = -1e9;
  for (int l = 0; l < ${STEAM_LAYERS}; l++) {
    if (uA[l].y <= 0.0) continue;
    vec2 a = boxHit(ro, rd, uCloudMin[l], uCloudMax[l]);
    if (a.y > a.x && uCloudMin[l].x <= uCloudMax[l].x) { t0 = min(t0, a.x); t1 = max(t1, a.y); }
    vec2 b = boxHit(ro, rd, uVeilMin[l], uVeilMax[l]);
    if (b.y > b.x && uVeilMin[l].x <= uVeilMax[l].x) { t0 = min(t0, b.x); t1 = max(t1, b.y); }
    vec2 c = boxHit(ro, rd, uSpillMin[l], uSpillMax[l]);
    if (c.y > c.x && uSpillMin[l].x <= uSpillMax[l].x) { t0 = min(t0, c.x); t1 = max(t1, c.y); }
  }
  t0 = max(t0, 0.0);
  // The table.
  float tSurf = 1e9;
  if (rd.y < 0.0) { tSurf = -ro.y / rd.y; t1 = min(t1, tSurf); }
  // The opaque scene (plate, cloche, bin) along this ray: the farthest of the four full-resolution
  // pixels this one covers (the upsample keeps the nearer ones off it by depth).
  float used = 1e4;
  vec4 v0 = uModelView * vec4(ro, 1.0);
  vec4 v1 = uModelView * vec4(rd, 0.0);
  if (uHasDepth) {
    // This pixel's footprint in the full-resolution depth (1/uScale pixels across): its corners.
    vec2 lo = floor(gl_FragCoord.xy - 0.5) / uScale, hi = (floor(gl_FragCoord.xy - 0.5) + 1.0) / uScale - 1.0;
    ivec2 lim = textureSize(uSceneDepth, 0) - 1;
    ivec2 a = clamp(ivec2(lo + 0.5), ivec2(0), lim), b = clamp(ivec2(hi + 0.5), ivec2(0), lim);
    float dz = max(max(texelFetch(uSceneDepth, a, 0).r, texelFetch(uSceneDepth, ivec2(b.x, a.y), 0).r),
      max(texelFetch(uSceneDepth, ivec2(a.x, b.y), 0).r, texelFetch(uSceneDepth, b, 0).r));
    if (dz < 1.0) {
      used = viewDistance(dz);
      if (v1.z < 0.0) { float ts = (-used - v0.z) / v1.z; tSurf = min(tSurf, ts); t1 = min(t1, ts); }
    }
  }
  // The steam's shadow on what the ray meets (the plate, the cloche, the table): the key is part of
  // their light, and the light volume knows how much steam lies between them and it.
  float shadow = 1.0;
  if (tSurf < 1e8) {
    vec3 ps = ro + rd * tSurf;
    // (A margin: the table's points sit exactly on the box's floor, and rounding must not flip them.)
    if (all(greaterThanEqual(ps, uLightMin - 0.02)) && all(lessThanEqual(ps, uLightMax + 0.02))) {
      // Faded towards the box's sides, so its edge never draws a line.
      vec3 e = min(ps - uLightMin, uLightMax - ps);
      float inside = smoothstep(-0.02, 0.12, min(e.x, e.z));
      shadow = 1.0 - ${f(STEAM_LOOK.shadow)} * inside * (1.0 - exp(-uSigma * lightAt(ps).x));
    }
  }
  if (t1 <= t0) { gl_FragColor = vec4(0.0, 0.0, used, shadow); return; }
  // Probes: where along the ray anything can show (the dilated mean, the veil's column), so the
  // march's steps all fall where the steam is.
  float dp = (t1 - t0) / float(uProbes);
  float first = 1e9, last = -1e9;
  for (int i = 0; i <= 32; i++) {
    if (i > uProbes) break;
    float tp = t0 + dp * float(i);
    vec3 p = ro + rd * tp;
    bool hit = false;
    for (int l = 0; l < ${STEAM_LAYERS} && !hit; l++) {
      if (uA[l].y <= 0.0) continue;
      if (all(greaterThanEqual(p, uCloudMin[l])) && all(lessThanEqual(p, uCloudMax[l])) && cloudOccupies(p, l)) hit = true;
      else if (all(greaterThanEqual(p, uVeilMin[l])) && all(lessThanEqual(p, uVeilMax[l])) && veilOccupies(p, l)) hit = true;
      else if (all(greaterThanEqual(p, uSpillMin[l])) && all(lessThanEqual(p, uSpillMax[l])) && spillOccupies(p, l)) hit = true;
    }
    if (hit) { first = min(first, tp); last = tp; }
  }
  if (last < first) { gl_FragColor = vec4(0.0, 0.0, used, shadow); return; }
  float a0 = max(t0, first - dp), a1 = min(t1, last + dp);
  int steps = uSteps;
  float dt = (a1 - a0) / float(steps);
  float t = a0 + dt * ign(gl_FragCoord.xy);
  vec3 L = normalize(uKeyDir);
  float cosT = dot(rd, L);
  // Phase: forward-leaning single scattering blended towards isotropic for the multiple-scattering octaves.
  // (Dense steam scatters many times: its effective phase is much flatter than a droplet's.)
  float ph0 = mix(hg(cosT, uG), 1.0 / (4.0 * 3.14159265), 0.6), ph1 = hg(cosT, uG * 0.3), ph2 = 1.0 / (4.0 * 3.14159265);
  float detail = uLow ? 0.0 : 1.0;
  vec3 C = vec3(0.0);
  float T = 1.0;
  for (int i = 0; i < 128; i++) {
    if (i >= steps || T < 0.01) break;
    vec3 p = ro + rd * t;
    t += dt;
    float dens = 0.0, localOd = 0.0;
    for (int l = 0; l < ${STEAM_LAYERS}; l++) {
      if (uA[l].y <= 0.0) continue;
      float so = 0.0;
      bool inCloud = all(greaterThanEqual(p, uCloudMin[l])) && all(lessThanEqual(p, uCloudMax[l]));
      bool inVeil = all(greaterThanEqual(p, uVeilMin[l])) && all(lessThanEqual(p, uVeilMax[l]));
      bool inSpill = all(greaterThanEqual(p, uSpillMin[l])) && all(lessThanEqual(p, uSpillMax[l]));
      float dl = (inCloud && uDebug != 3 && uDebug != 5 ? cloud(p, l, detail, L, so) : 0.0) + (inSpill ? spill(p, l, detail) : 0.0)
        + (inVeil && uDebug != 4 ? veil(p, l, detail) : 0.0);
      if (dl <= 0.0) continue;
      float k = uA[l].z * captured(p - vec3(0.0, uD[l].w, 0.0), l);
      dens += dl * k;
      localOd += so * k;
    }
    if (dens <= 1e-4) continue;
    float sig = uSigma * dens;
    // The light volume: the optical depth to the key through the cloud's mean and to the room
    // above, and the lifted dome's shade; the billows' own shade from the local tap.
    vec3 lv = lightAt(p);
    float od = uSigma * (1.5 * lv.x + 0.03 * dens + localOd);
    // Wrenninge's octaves: each scatters again with less extinction, less light and a flatter phase.
    float key = exp(-od) * ph0 + 0.5 * exp(-0.3 * od) * ph1 + 0.25 * exp(-0.1 * od) * ph2;
    float lit = mix(uDomeShade, 1.0, lv.z);
    // The room from every side (less under the cloud's own cover), and the white plate's bounce from below.
    float bounce = 0.22 * (1.0 - smoothstep(0.05, 0.9, p.y)) * (1.0 - smoothstep(0.7, 1.0, length(p.xz)));
    vec3 Sc = (uKeyColor * (4.0 * 3.14159265) * key + uAmbient * (0.3 + 0.7 * exp(-uSigma * lv.y * 0.8) + bounce)) * lit;
    float Ts = exp(-sig * dt);
    C += T * (1.0 - Ts) * Sc;
    T *= Ts;
  }
  float alpha = 1.0 - T;
  if (uDebug == 1 || uDebug == 5) C = vec3(alpha);
  if (uDebug == 2) C = vec3((a1 - a0) * 0.5);
  // Premultiplied luminance (steam is white: the tint is the composite's), coverage, the depth used.
  gl_FragColor = vec4(dot(C, vec3(0.2126, 0.7152, 0.0722)), alpha, used, shadow);
}
`;

/**
 * The composite (the main pass, over the box's footprint): the half-resolution volume upsampled
 * by depth (each full-resolution pixel takes the half-resolution samples whose depth matches its
 * own, so no steam bleeds over the cloche's edge or leaves a gap behind it), tone mapped like the
 * scene and laid over it premultiplied.
 */
const COMPOSITE_FRAGMENT = /* glsl */ `
precision highp float;
uniform sampler2D uVolume;
uniform sampler2D uSceneDepth;
uniform bool uHasDepth;
uniform bool uReady;
uniform bool uOrtho;
uniform vec2 uNearFar;
uniform vec3 uTint;
uniform vec2 uScale;
uniform int uDebug;

float viewDistance(float dz) {
  float n = uNearFar.x, fa = uNearFar.y;
  return uOrtho ? n + dz * (fa - n) : -(n * fa) / ((fa - n) * dz - fa);
}

void main() {
  if (!uReady || uDebug == 7) discard;
  float own = 1e4;
  if (uHasDepth) {
    float dz = texelFetch(uSceneDepth, ivec2(gl_FragCoord.xy), 0).r;
    if (dz < 1.0) own = viewDistance(dz);
  }
  ivec2 size = textureSize(uVolume, 0);
  vec2 hp = gl_FragCoord.xy * uScale - 0.5;
  // A 4 × 4 gather with a smooth (tent² ≈ cubic B-spline) kernel: it upsamples without blocks and
  // soaks up the march's dithered start, weighted by how well each sample's depth matches this pixel's.
  ivec2 b = ivec2(floor(hp)) - 1;
  vec2 fr = hp - floor(hp);
  vec3 acc = vec3(0.0);
  float wsum = 0.0;
  float best = 1e9;
  vec3 bestV = vec3(0.0, 0.0, 1.0);
  for (int k = 0; k < 16; k++) {
    ivec2 o = ivec2(k & 3, k >> 2);
    vec4 v = texelFetch(uVolume, clamp(b + o, ivec2(0), size - 1), 0);
    vec2 dxy = abs(vec2(o) - 1.0 - fr);
    vec2 t = max(vec2(0.0), 1.0 - dxy / 2.0);
    float wb = t.x * t.x * t.x * t.y * t.y * t.y;
    float dd = abs(v.z - own);
    float wd = exp(-dd / (0.02 * min(own, v.z) + 0.003));
    acc += vec3(v.x, v.y, v.w) * wb * wd;
    wsum += wb * wd;
    if (dd < best && wb > 0.05) { best = dd; bestV = vec3(v.x, v.y, v.w); }
  }
  vec3 g = wsum > 1e-4 ? acc / wsum : bestV;
  vec2 v = g.xy;
  // The steam veils what is behind by its coverage; its shadow darkens what it falls on further.
  float cover = 1.0 - (1.0 - v.y) * g.z;
  if (uDebug == 8) { gl_FragColor = vec4(g.z, wsum > 1e-4 ? 1.0 : 0.0, own > 9000.0 ? 1.0 : 0.0, 1.0); return; }
  if (uDebug == 1 || uDebug == 5) { gl_FragColor = vec4(v.x, 0.0, 0.0, 1.0); return; }
  if (cover < 0.002) discard;
  gl_FragColor = vec4(uTint * (v.x / max(v.y, 1e-4)), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor = vec4(gl_FragColor.rgb * v.y, cover);
}
`;

const COMPOSITE_VERTEX = VOLUME_VERTEX;

const EULER = new Euler();
const TMP_M = new Matrix4(), TMP_A = new Vector3(), TMP_B = new Vector3(), TMP_C = new Color(), TMP_D = new Color();

/** The scene's shadow-casting key light (spot or directional), or null. */
function findKey(scene: Object3D): Object3D | null {
  let key: Object3D | null = null;
  scene.traverse((o) => {
    const l = o as Object3D & { isSpotLight?: boolean; isDirectionalLight?: boolean };
    if (!key && (l.isSpotLight || l.isDirectionalLight)) key = o;
  });
  return key;
}

/**
 * The reveal's steam: one raymarched volume over the plate, drawn for up to STEAM_LAYERS clocks at
 * once. A client of the stage's scene depth while it shows: before the main render it draws the
 * flow map and marches the volume at half resolution; in the main render its box composites it.
 */
export class DinnerSteam {
  readonly object = new Group();
  private readonly volume: Mesh;
  private readonly march: Mesh;
  private readonly marchScene = new Scene();
  private readonly material: ShaderMaterial;
  private readonly marchMaterial: ShaderMaterial;
  private readonly clocks: { tau: number | null; emitStart: number; emitEnd: number; capture: number; fade: number; state: CloudState }[] = [];
  private readonly coverInv = new Matrix4();
  private key: Object3D | null | undefined = undefined;
  private noise: WebGL3DRenderTarget | null = null;
  private noiseFor: WebGLRenderer | null = null;
  private readonly map: WebGLRenderTarget;
  private readonly half: WebGLRenderTarget;
  private readonly light: WebGLRenderTarget;
  private readonly lightMaterial: ShaderMaterial;
  private readonly mapMaterial: ShaderMaterial;
  private readonly pass: { scene: Scene; camera: OrthographicCamera; mesh: Mesh };
  private readonly unregister: () => void;
  private readonly uniforms: Record<string, { value: unknown }>;
  private readonly compositeUniforms: Record<string, { value: unknown }>;
  private readonly mapUniforms: Record<string, { value: unknown }>;
  /** Whether the volume was marched for the current frame (prepare); cleared after the composite. */
  private ready = false;
  private readonly look = cloudLook(0, 0);
  /** The march's steps for what is showing (set by sync). */
  private steps: number = STEAM_LOOK.steps.dense;
  /** Frames marched (tooling). */
  marched = 0;

  constructor() {
    this.object.name = 'fx_steam';
    this.object.visible = false;
    for (let l = 0; l < STEAM_LAYERS; l++) this.clocks.push({ tau: null, emitStart: -Infinity, emitEnd: Infinity, capture: Infinity, fade: 1, state: newCloudState() });
    const v4 = () => Array.from({ length: STEAM_LAYERS }, () => new Vector4());
    const v3 = () => Array.from({ length: STEAM_LAYERS }, () => new Vector3());
    this.map = new WebGLRenderTarget(MAP_W, MAP_H * STEAM_LAYERS, {
      type: HalfFloatType, format: RGBAFormat, depthBuffer: false, minFilter: LinearFilter, magFilter: LinearFilter, generateMipmaps: false,
    });
    this.map.texture.name = 'fx_steam_flow_map';
    this.half = new WebGLRenderTarget(1, 1, {
      type: HalfFloatType, format: RGBAFormat, depthBuffer: false, minFilter: NearestFilter, magFilter: NearestFilter, generateMipmaps: false,
    });
    this.half.texture.name = 'fx_steam_half';
    this.light = new WebGLRenderTarget(LIGHT_N * LIGHT_COLS, LIGHT_N * LIGHT_ROWS, {
      type: HalfFloatType, format: RGBAFormat, depthBuffer: false, minFilter: LinearFilter, magFilter: LinearFilter, generateMipmaps: false,
    });
    this.light.texture.name = 'fx_steam_light';
    this.mapUniforms = { uS0: { value: v4() }, uS1: { value: v4() }, uS2: { value: v4() }, uS3: { value: v4() } };
    this.mapMaterial = new ShaderMaterial({ name: 'fx_steam_map', uniforms: this.mapUniforms, vertexShader: FULLSCREEN_VERTEX, fragmentShader: MAP_FRAGMENT, depthTest: false, depthWrite: false });
    const passScene = new Scene();
    const passMesh = new Mesh(fullscreenTriangle(), this.mapMaterial);
    passMesh.frustumCulled = false;
    passScene.add(passMesh);
    this.pass = { scene: passScene, camera: new OrthographicCamera(-1, 1, 1, -1, 0, 1), mesh: passMesh };

    this.uniforms = {
      uMap: { value: this.map.texture },
      uNoise: { value: null },
      uSceneDepth: { value: null },
      uHasDepth: { value: false },
      uOrtho: { value: false },
      uNearFar: { value: new Vector2(0.5, 200) },
      uCamLocal: { value: new Vector3() },
      uModelView: { value: new Matrix4() },
      uBoxMin: { value: new Vector3(-1, 0, -1) },
      uBoxMax: { value: new Vector3(1, 2, 1) },
      uCloudMin: { value: v3() }, uCloudMax: { value: v3() }, uVeilMin: { value: v3() }, uVeilMax: { value: v3() },
      uSpillMin: { value: v3() }, uSpillMax: { value: v3() }, uLightMin: { value: new Vector3() }, uLightMax: { value: new Vector3(1, 1, 1) },
      uSteps: { value: STEAM_LOOK.steps.dense },
      uProbes: { value: PROBES },
      uScale: { value: new Vector2(0.5, 0.5) },
      uDebug: { value: 0 },
      uLow: { value: false },
      uSigma: { value: STEAM_LOOK.sigma },
      uKeyDir: { value: new Vector3(-0.36, 0.643, 0.676).normalize() },
      uKeyColor: { value: new Vector3(STEAM_LOOK.key.r, STEAM_LOOK.key.g, STEAM_LOOK.key.b) },
      uAmbient: { value: new Vector3(STEAM_LOOK.ambient.r, STEAM_LOOK.ambient.g, STEAM_LOOK.ambient.b) },
      uG: { value: STEAM_LOOK.g },
      uDomeShade: { value: STEAM_LOOK.domeShade },
      uCoverInv: { value: new Matrix4() },
      uSeated: { value: new Vector3() },
      uLight: { value: this.light.texture },
      uA: { value: v4() }, uB: { value: v4() }, uC: { value: v4() }, uD: { value: v4() }, uE: { value: v4() }, uF: { value: v4() }, uSp0: { value: v4() }, uSp1: { value: v4() }, uSpillOn: { value: [0, 0, 0] },
    };
    this.lightMaterial = new ShaderMaterial({
      name: 'fx_steam_light', uniforms: this.uniforms, vertexShader: FULLSCREEN_VERTEX, fragmentShader: LIGHT_FRAGMENT, depthTest: false, depthWrite: false, toneMapped: false,
    });
    this.marchMaterial = new ShaderMaterial({
      name: 'fx_steam_march', uniforms: this.uniforms, vertexShader: VOLUME_VERTEX, fragmentShader: VOLUME_FRAGMENT,
      depthTest: false, depthWrite: false, side: FrontSide, toneMapped: false,
    });
    const box = new BoxGeometry(1, 1, 1);
    this.march = new Mesh(box, this.marchMaterial);
    this.march.frustumCulled = false;
    this.march.matrixAutoUpdate = false;
    this.march.matrixWorldAutoUpdate = false;
    this.marchScene.add(this.march);

    this.compositeUniforms = {
      uVolume: { value: this.half.texture },
      uSceneDepth: this.uniforms.uSceneDepth!,
      uHasDepth: this.uniforms.uHasDepth!,
      uOrtho: this.uniforms.uOrtho!,
      uNearFar: this.uniforms.uNearFar!,
      uBoxMin: this.uniforms.uBoxMin!,
      uBoxMax: this.uniforms.uBoxMax!,
      uDebug: this.uniforms.uDebug!,
      uScale: this.uniforms.uScale!,
      uReady: { value: false },
      uTint: { value: new Vector3(1, 1, 1) },
    };
    this.material = new ShaderMaterial({
      name: 'fx_steam_volume', uniforms: this.compositeUniforms, vertexShader: COMPOSITE_VERTEX, fragmentShader: COMPOSITE_FRAGMENT,
      transparent: true, depthWrite: false, depthTest: true, side: FrontSide, premultipliedAlpha: true,
    });
    this.volume = new Mesh(box, this.material);
    this.volume.name = 'fx_steam_volume';
    this.volume.frustumCulled = false;
    this.volume.renderOrder = 5;
    this.volume.userData.noShadowCast = true;
    this.volume.userData.noSceneDepth = true;
    this.volume.onBeforeRender = () => { this.compositeUniforms.uReady!.value = this.ready; };
    this.volume.onAfterRender = () => { this.ready = false; };
    this.object.add(this.volume);
    this.unregister = requestSceneDepth({
      object: this.object,
      active: () => this.object.visible,
      prepare: (renderer, frame) => this.prepare(renderer, frame),
    });
  }

  /** Before the main render (the scene depth's client): the noise once, the flow map, the half-resolution march. */
  private prepare(renderer: WebGLRenderer, frame: SceneDepthFrame): void {
    if (!this.noise || this.noiseFor !== renderer) this.generateNoise(renderer);
    const prev = renderer.getRenderTarget();
    const dbg = globalThis as { __steamDebug?: number; __steamSteps?: number; __steamSkip?: string };
    // The camera, the key and the depth.
    const camera = frame.camera as PerspectiveCamera | OrthographicCamera;
    const u = this.uniforms;
    this.march.matrixWorld.copy(this.volume.matrixWorld);
    const inv = TMP_M.copy(this.volume.matrixWorld).invert();
    (u.uCamLocal!.value as Vector3).setFromMatrixPosition(camera.matrixWorld).applyMatrix4(inv);
    (u.uModelView!.value as Matrix4).multiplyMatrices(camera.matrixWorldInverse, this.volume.matrixWorld);
    if (this.key === undefined || (this.key && !this.key.parent)) this.key = findKey(frame.scene);
    if (this.key) {
      const lp = TMP_A.setFromMatrixPosition(this.key.matrixWorld).applyMatrix4(inv);
      const cp = TMP_B.setFromMatrixPosition(this.object.matrixWorld).applyMatrix4(inv);
      (u.uKeyDir!.value as Vector3).copy(lp).sub(cp).normalize();
    }
    u.uSceneDepth!.value = frame.texture;
    (u.uNearFar!.value as Vector2).set(camera.near, camera.far);
    u.uOrtho!.value = (camera as OrthographicCamera).isOrthographicCamera === true;
    u.uHasDepth!.value = true;
    u.uDebug!.value = dbg.__steamDebug ?? 0;
    u.uProbes!.value = (globalThis as { __steamProbes?: number }).__steamProbes ?? PROBES;
    u.uSteps!.value = dbg.__steamSteps ?? Math.round(this.steps * (u.uLow!.value ? STEAM_LOOK.lowShare : 1));
    // The flow map for every drawn clock (one draw), then the light volume through it (one draw).
    renderer.setRenderTarget(this.map);
    if (!dbg.__steamSkip?.includes('map')) renderer.render(this.pass.scene, this.pass.camera);
    this.pass.mesh.material = this.lightMaterial;
    renderer.setRenderTarget(this.light);
    if (!dbg.__steamSkip?.includes('light')) renderer.render(this.pass.scene, this.pass.camera);
    this.pass.mesh.material = this.mapMaterial;
    // The march, at half the drawing buffer's resolution.
    const scale = Math.min(0.5, Math.sqrt(STEAM_LOOK.marchPixels / Math.max(1, frame.size.x * frame.size.y)));
    const w = Math.max(1, Math.ceil(frame.size.x * scale)), h = Math.max(1, Math.ceil(frame.size.y * scale));
    (u.uScale!.value as Vector2).set(w / frame.size.x, h / frame.size.y);
    if (this.half.width !== w || this.half.height !== h) this.half.setSize(w, h);
    renderer.getClearColor(TMP_C);
    const alpha = renderer.getClearAlpha();
    // (Empty: no light, no cover, far, and no shadow.)
    renderer.setClearColor(TMP_D.setRGB(0, 0, 1e4), 1);
    renderer.setRenderTarget(this.half);
    renderer.clear(true, false, false);
    if (!dbg.__steamSkip?.includes('march')) renderer.render(this.marchScene, camera);
    renderer.setRenderTarget(prev);
    renderer.setClearColor(TMP_C, alpha);
    this.ready = true;
    this.marched++;
  }

  private generateNoise(renderer: WebGLRenderer): void {
    this.noise?.dispose();
    const rt = new WebGL3DRenderTarget(NOISE_SIZE, NOISE_SIZE, NOISE_SIZE, { format: RGBAFormat, type: UnsignedByteType, depthBuffer: false, generateMipmaps: false });
    const tex = rt.texture;
    tex.wrapS = tex.wrapT = tex.wrapR = RepeatWrapping;
    tex.minFilter = tex.magFilter = LinearFilter;
    tex.name = 'fx_steam_noise';
    const layer = { value: 0 };
    const mat = new ShaderMaterial({ name: 'fx_steam_noise_gen', uniforms: { uLayer: layer }, vertexShader: FULLSCREEN_VERTEX, fragmentShader: NOISE_GEN, depthTest: false, depthWrite: false });
    const mesh = new Mesh(fullscreenTriangle(), mat);
    mesh.frustumCulled = false;
    const scene = new Scene().add(mesh);
    const prev = renderer.getRenderTarget();
    for (let z = 0; z < NOISE_SIZE; z++) {
      layer.value = z;
      renderer.setRenderTarget(rt, z);
      renderer.render(scene, this.pass.camera);
    }
    renderer.setRenderTarget(prev);
    mesh.geometry.dispose();
    mat.dispose();
    this.noise = rt;
    this.noiseFor = renderer;
    this.uniforms.uNoise!.value = tex;
  }

  /** Show steam clock `layer` (0: the reveal's; 1…: left behind by a change of mind). */
  update(layer: number, { tau, emitStart = -Infinity, emitEnd = Infinity, capture = Infinity, fade = 1 }: SteamClock): void {
    const c = this.clocks[layer]!;
    c.tau = tau;
    c.emitStart = emitStart;
    c.emitEnd = emitEnd;
    c.capture = capture;
    c.fade = fade;
    this.sync();
  }

  /** Per-clock uniforms, the map's, and the volume's bounds. */
  private sync(): void {
    const A = this.uniforms.uA!.value as Vector4[], B = this.uniforms.uB!.value as Vector4[];
    const Cc = this.uniforms.uC!.value as Vector4[], D = this.uniforms.uD!.value as Vector4[];
    const E = this.uniforms.uE!.value as Vector4[], F = this.uniforms.uF!.value as Vector4[];
    const G = this.uniforms.uSp0!.value as Vector4[], H = this.uniforms.uSp1!.value as Vector4[];
    const spillOn = this.uniforms.uSpillOn!.value as number[];
    const S0 = this.mapUniforms.uS0!.value as Vector4[], S1 = this.mapUniforms.uS1!.value as Vector4[];
    const S2 = this.mapUniforms.uS2!.value as Vector4[], S3 = this.mapUniforms.uS3!.value as Vector4[];
    const cMin = this.uniforms.uCloudMin!.value as Vector3[], cMax = this.uniforms.uCloudMax!.value as Vector3[];
    const vMin = this.uniforms.uVeilMin!.value as Vector3[], vMax = this.uniforms.uVeilMax!.value as Vector3[];
    const sMin = this.uniforms.uSpillMin!.value as Vector3[], sMax = this.uniforms.uSpillMax!.value as Vector3[];
    const lightMin = (this.uniforms.uLightMin!.value as Vector3).set(Infinity, Infinity, Infinity);
    const lightMax = (this.uniforms.uLightMax!.value as Vector3).set(-Infinity, -Infinity, -Infinity);
    const min = (this.uniforms.uBoxMin!.value as Vector3).set(Infinity, Infinity, Infinity);
    const max = (this.uniforms.uBoxMax!.value as Vector3).set(-Infinity, -Infinity, -Infinity);
    const limMin = TMP_A.set(-BOX_MAX, 0, -BOX_MAX), limMax = TMP_B.set(BOX_MAX, Y_MAX, BOX_MAX);
    let any = false;
    let steps: number = STEAM_LOOK.steps.veil;
    this.clocks.forEach((c, l) => {
      const drawn = c.tau !== null && c.fade > 0;
      // An empty box (min > max) is never entered.
      cMin[l]!.set(1, 1, 1); cMax[l]!.set(0, 0, 0); vMin[l]!.set(1, 1, 1); vMax[l]!.set(0, 0, 0); sMin[l]!.set(1, 1, 1); sMax[l]!.set(0, 0, 0);
      if (!drawn) {
        A[l]!.set(0, 0, 0, 0);
        S0[l]!.set(0, 0, 0, 0);
        spillOn[l] = 0;
        return;
      }
      const tau = c.tau!;
      const s = cloudState(tau, c.emitStart, c.emitEnd, c.state);
      const present = s.present && s.fade > 0;
      A[l]!.set(tau, 1, c.fade, present ? 1 : 0);
      if (present) steps = Math.max(steps, s.age < 1.15 ? STEAM_LOOK.steps.dense : STEAM_LOOK.steps.thin);
      B[l]!.set(s.dragSide.x, s.dragSide.y, s.lean.x, s.lean.y);
      Cc[l]!.set(s.turb, s.erode, s.age, s.rise);
      const look = cloudLook(s.age, s.erode, this.look);
      E[l]!.set(look.amp, look.threshold, look.warp, look.fine);
      F[l]!.set(look.core, look.coreWidth, look.sheetWidth, look.sheet);
      // The spill's source over the last half-second (what is on the wall now left the gap then).
      const fade = spillFade(tau);
      let on = 0;
      for (let k = 0; k < SPILL.samples; k++) {
        const v = fade > 0 ? fade * spillSource(tau - k * SPILL.dt, c.emitStart, c.emitEnd) : 0;
        (k < 4 ? G[l]! : H[l]!).setComponent(k % 4, v);
        on = Math.max(on, v);
      }
      spillOn[l] = on;
      const capRise = tau >= c.capture ? 0.8 * (s.rise - cloudState(Math.max(c.capture, 0), c.emitStart, c.emitEnd).rise) : 0;
      D[l]!.set(Math.max(-OPEN, c.emitStart), Math.min(OPEN, c.emitEnd), Math.min(OPEN, c.capture), capRise);
      S0[l]!.set(s.rise, s.dragUp, s.squash, present ? 1 : 0);
      S1[l]!.set(s.cap, s.stem, s.skirt, s.roll);
      S2[l]!.set(s.ringR, s.ringY, s.ringSigma, s.fade);
      S3[l]!.set(s.floor, s.turb, s.stemFade, 0);
      steamBounds(s, { tau, emitStart: c.emitStart, emitEnd: c.emitEnd }, cMin[l]!, cMax[l]!, vMin[l]!, vMax[l]!, sMin[l]!, sMax[l]!);
      for (const [lo, hi, lit] of [[cMin[l]!, cMax[l]!, true], [vMin[l]!, vMax[l]!, true], [sMin[l]!, sMax[l]!, false]] as const) {
        if (lit && lo.x <= hi.x) {
          // Its shadow on the plate and the table falls away from the key: the box reaches over it.
          const k = this.uniforms.uKeyDir!.value as Vector3;
          const sx = (-k.x / Math.max(k.y, 0.2)) * hi.y, sz = (-k.z / Math.max(k.y, 0.2)) * hi.y;
          lo.x = Math.min(lo.x, lo.x + sx); hi.x = Math.max(hi.x, hi.x + sx);
          lo.z = Math.min(lo.z, lo.z + sz); hi.z = Math.max(hi.z, hi.z + sz);
          lo.y = 0;
        }
        lo.max(limMin);
        hi.min(limMax);
        if (lo.x > hi.x || lo.y > hi.y) { lo.set(1, 1, 1); hi.set(0, 0, 0); continue; }
        min.min(lo);
        max.max(hi);
        if (lit) { lightMin.min(lo); lightMax.max(hi); }
        any = true;
      }
    });
    this.steps = steps;
    if (!any) {
      min.set(-1, 0, -1);
      max.set(1, 1, 1);
    }
    if (lightMin.x > lightMax.x) { lightMin.copy(min); lightMax.copy(max); }
    this.object.visible = any;
  }

  /** Where the cover sits on the plate (scene space, untilted): what a change of mind closes it over. */
  setSeated(coverPos: Vector3): void {
    (this.uniforms.uSeated!.value as Vector3).copy(coverPos);
  }

  /** Is steam clock `layer` drawn? */
  layerVisible(layer: number): boolean {
    const c = this.clocks[layer]!;
    return this.object.visible && c.tau !== null && c.fade > 0;
  }

  /** The cloche's pose (scene space: position and its tilt), for its shadow on the steam. The plate and the bin are in the scene's depth. */
  setSurfaces(coverPos: Vector3, tiltX: number, tiltZ: number, _platePos?: Vector3, _binPos?: Vector3 | null): void {
    this.coverInv.makeRotationFromEuler(EULER.set(tiltX, 0, tiltZ)).setPosition(coverPos).invert();
    (this.uniforms.uCoverInv!.value as Matrix4).copy(this.coverInv);
  }

  /** Low tier: fewer steps, no fine detail. */
  setLowDetail(enabled: boolean): void {
    this.uniforms.uLow!.value = enabled;
  }

  /** Show the draw for a shader warm-up (the next update restores visibility). */
  showForCompile(): void {
    this.object.visible = true;
  }

  dispose(): void {
    this.unregister();
    this.volume.geometry.dispose();
    this.material.dispose();
    this.marchMaterial.dispose();
    this.mapMaterial.dispose();
    this.lightMaterial.dispose();
    this.pass.mesh.geometry.dispose();
    this.map.dispose();
    this.half.dispose();
    this.light.dispose();
    this.noise?.dispose();
    this.object.removeFromParent();
  }
}

