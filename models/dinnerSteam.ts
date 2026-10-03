import {
  BoxGeometry,
  BufferGeometry,
  type Camera,
  Color,
  Euler,
  Float32BufferAttribute,
  FloatType,
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
  CAP_BAND, CLOUD, CLOUD_Y_MAX, cloudLook, EDGE, RAISED_DIR, STEM_BAND, SPILL, spillFade, spillSource, type CloudState, cloudState, newCloudState, OUTER_STEPS, RISE_BAND, SKIRT_STEPS, type SteamClock, steamBounds, VEIL, VERTICAL_STEPS, veilSource,
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
  /** The key's share (its intensity scaled to steam's in-scatter) and the room's (linear luminance). */
  key: 0.95,
  /** (v1.6 polish: 0.6 → 0.3, so the key does the work: a lit side, a terminator, a grey core; polish 2: 0.22.) */
  room: 0.22,
  /**
   * Their colours (v1.6 polish 2: the judge saw "cold steam in a warm room"): the key is the
   * window's daylight (the rig's key, #F3F5FA); the room is what surrounds the steam on every side
   * but the window's: the greige walls and cove, the table and the white plate that reflects them.
   */
  keyTint: new Color('#F3F5FA'),
  roomTint: new Color('#E0D7CA'),
  /** Henyey-Greenstein asymmetry (water droplets scatter forward). */
  g: 0.7,
  /** The phase's second, backward lobe (asymmetry, weight): front-lit droplets still return some light. */
  gBack: -0.3,
  back: 0.35,
  /** The key's optical depth through the cloud is the light volume's times this (steeper: a dark core). */
  keyFall: 1.25,
  /** The underside's band (su: the undercut's foot, the stem and the cap's underside as it rises; the walls' is 2.5 mm young). */
  underBand: 0.1,
  /** Wrenninge's multiple-scattering octaves (their share of the key; v1.6 polish 2: 0.45 / 0.18 → raised). */
  ms: [0.45, 0.18] as const,
  /** The white plate's light on the fog just above it (linear radiance at the porcelain). */
  bounce: 0.5,
  /** Room light the lifted dome's shadow leaves on the steam under it (it is lit from every side). */
  domeShade: 0.82,
  /** The key's share of the light on the plate, the cloche and the table: what the steam's shadow can take away. */
  shadow: 0.2,
  /** The shadow's optical depth: the fog's extinction less what it scatters forward onto the surface (≈ 1 − g). */
  shadowOd: 0.45,
  /**
   * March steps by what is showing: the dense young cloud, the cloud thinning into wisps, the
   * plate's veil (and the spill) alone. The Low tier takes `lowShare` of them.
   */
  steps: { dense: 22, thin: 18, veil: 13 },
  /** The temporal resolve: the new frame's share of each pixel (≈ the last 7 frames averaged). */
  history: 0.15,
  /** The march's pixel budget: half the drawing buffer a side, at most this many pixels. */
  marchPixels: 400_000,
  lowShare: 0.6,
} as const;

/** The flow map's domain and resolution (per clock): ρ ∈ [0, RHO_MAX], y ∈ [0, Y_MAX] (su). */
const RHO_MAX = 1.5, BOX_MAX = 2.6, Y_MAX = CLOUD_Y_MAX, MAP_W = 96, MAP_H = 160;
const NOISE_SIZE = 64;
/** The spill's density at its full source. */
const SPILL_STRENGTH = 9.0;
/** The light volume: N³ voxels over the proxy box, its z-slices tiled COLS × ROWS in one 2D atlas. */
const LIGHT_N = 24, LIGHT_COLS = 6, LIGHT_ROWS = 4;
/** Probes of the march's occupancy along each ray. */
const PROBES = 6;

const f = (x: number) => x.toFixed(5);
/** A colour scaled to unit (Rec. 709) luminance, as a vector. */
const unitLuminance = (c: Color) => { const l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; return new Vector3(c.r / l, c.g / l, c.b / l); };
const smoothstep01 = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };

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
  // (v1.6 polish: a smooth minimum, so the cells' borders are rounded folds, not creases: under the
  // flow the creases read as a crawling web over thin steam.)
  float acc = 0.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int xx = -1; xx <= 1; xx++) {
    ivec3 o = ivec3(xx, y, z);
    vec3 c = vec3(o) + hash3(wrap(i + o, n), seed) - fr;
    acc += exp(-9.0 * length(c));
  }
  return clamp(-log(acc) / 9.0, 0.0, 1.0);
}
/** (Three octaves: a fourth, at 2 voxels a cell, aliased into a fine diagonal hatch under the flow's shear.) */
float perlinFbm(vec3 p, int n, int seed) {
  return 0.58 * perlin(p, n, seed) + 0.29 * perlin(p, n * 2, seed + 1) + 0.13 * perlin(p, n * 4, seed + 2);
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
  float detail = worleyFbm(p, 4, 53);
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
float centreWeight(float P) { return 1.0 - ${f(CLOUD.centre)} * min(1.0, pow(P / ${f(CLOUD.radius)}, 2.0)); }
float dragCentre(float P) { return 1.45 - 0.9 * min(1.0, pow(P / ${f(CLOUD.radius)}, 2.0)); }
float vForward(float Y, float P, vec4 s0) { return Y + s0.x * riseWeight(Y) * centreWeight(P) + s0.y * dragWeight(Y) * dragCentre(P) - s0.z * capIntegral(Y); }
/** The forward map (steam.ts axisForward): where material (P, Y) at the seat is on a clock, as (ρ, y) before the lean and the side drag. */
vec2 axisForward(float P, float Y, vec4 s0, vec4 s1, vec4 s2) {
  float P1 = P, Y1 = Y;
  if (s1.z > 0.0) { P1 = P + s1.z * skirtWeight(Y, P); Y1 = Y + slumpSurface(P1) - slumpSurface(P); }
  float rho = P1 * radialScale(Y1, s1), y = vForward(Y1, P1, s0);
  vec2 e = vec2(rho - s2.x, y - s2.y);
  float phi = s1.w * exp(-dot(e, e) / (s2.z * s2.z));
  float c = cos(phi), sn = sin(phi);
  return vec2(max(0.0, s2.x + c * e.x + sn * e.y), s2.y - sn * e.x + c * e.y);
}
/** The signed distance (su, + inside) from material (P, Y) to the cavity's wall at the seat (the superellipse's p-norm, ≈ su near it). */
float seatDistance(float r, float Y) {
  float q = Y - ${f(CLOUD.rim)};
  float k = q > 0.0 ? pow(pow(r / ${f(CLOUD.radius)}, ${f(CLOUD.power)}) + pow(q / ${f(CLOUD.height)}, ${f(CLOUD.power)}), ${f(1 / CLOUD.power)}) : r / ${f(CLOUD.radius)};
  return (1.0 - k) * ${f(Math.min(CLOUD.radius, CLOUD.height))};
}
/** Densest under the crown (the base keeps CLOUD.baseDensity). */
float seatGrade(float Y) { return ${f(CLOUD.baseDensity)} + ${f(1 - CLOUD.baseDensity)} * smoothstep(0.05, 0.6, Y); }
/** The cloud at the seat (cloudSeat): \`grow\` widens the soft wall (the dilated occupancy). */
float seat(float r, float Y, float floorH, float grow) {
  float inside = smoothstep(-grow, ${f(CLOUD.wall)}, seatDistance(r, Y));
  float above = smoothstep(-grow, floorH, Y - plateTop(min(r, 0.8)));
  return inside * above * seatGrade(Y);
}
`;

const MAP_FRAGMENT = /* glsl */ `
precision highp float;
uniform vec4 uS0[${STEAM_LAYERS}]; // rise, dragUp, squash, (active)
uniform vec4 uS1[${STEAM_LAYERS}]; // cap, stem, skirt, roll
uniform vec4 uS2[${STEAM_LAYERS}]; // ringR, ringY, ringSigma, fade
uniform vec4 uS3[${STEAM_LAYERS}]; // floor, turb, stem fade, -
varying vec2 vUv;
${FLOW_GLSL}

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
  // (v1.6 polish: the march takes the seat's distance itself, for a sharp edge; the map keeps the
  // flow's dilution, evaporation and fade, and the occupancy dilated by the edge's reach.)
  gl_FragColor = vec4(P, Y, k, seat(P, Y, s3.x, s3.y) * k);
}
`;

// ── Light helpers (the march and the composite) ─────────────────────────────────
/** The dome's wall, the light volume's lookup and the lifted dome's shadow (uLight, uLightMin/Max, uCoverInv, uKeyDir). */
const LIGHT_GLSL = /* glsl */ `
/** The dome's outer radius at height y in its own frame (the superellipse fitted to its profile). */
float domeWall(float y) {
  float t = clamp(y / ${f(COVER.domeHeight)}, 0.0, 1.0);
  return ${f(COVER.radius)} * pow(1.0 - pow(t, 2.2), 1.0 / 2.2);
}
/** The light volume's atlas: N³ voxels over the proxy box, z-slices tiled COLS across. */
const float LN = ${LIGHT_N}.0;
const float LCOLS = ${LIGHT_COLS}.0;
const float LROWS = ${LIGHT_ROWS}.0;
vec4 lightAt(vec3 p) {
  vec3 u = clamp((p - uLightMin) / max(uLightMax - uLightMin, vec3(1e-4)), 0.0, 1.0);
  vec2 xy = clamp(u.xy * LN, 0.5, LN - 0.5);
  float fz = clamp(u.z * LN - 0.5, 0.0, LN - 1.0);
  float z0 = floor(fz), z1 = min(z0 + 1.0, LN - 1.0);
  vec2 a = (vec2(mod(z0, LCOLS), floor(z0 / LCOLS)) * LN + xy) / vec2(LCOLS * LN, LROWS * LN);
  vec2 b = (vec2(mod(z1, LCOLS), floor(z1 / LCOLS)) * LN + xy) / vec2(LCOLS * LN, LROWS * LN);
  return mix(texture(uLight, a), texture(uLight, b), fz - z0);
}

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
/** The steam's shadow on the scene: none while the cloud is still enclosed by the cloche. */
uniform float uShadowOn;
uniform int uSteps;
uniform int uProbes;
/** The march's resolution over the drawing buffer's (≈ 0.42–0.5 a side). */
uniform vec2 uScale;
uniform bool uLow;
uniform float uSigma;
uniform int uDebug;
/** Tooling: lighting terms off (bits: 1 key, 2 octaves, 4 room, 8 bounce, 16 no key depth, 32 no depth down). */
uniform int uFlags;
/** The jitter's frame (from the steam clock). */
uniform float uFrame;
/** Whether the march bisects where rays enter the steam (the young cloud's narrow edge). */
uniform bool uRefine;
uniform vec3 uKeyDir;
uniform float uG;
uniform float uDomeShade;
uniform mat4 uCoverInv;
/** The cloche's rim lift over its seat (su). */
uniform float uLift;
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
/** Per clock: the inside's fog, the mixing sheet's strength and width, the clear layer over the porcelain. */
uniform vec4 uF[${STEAM_LAYERS}];
/** Per clock: the vortex ring's core (ρ, y, reach, su) and how much fog it holds (0..1). */
uniform vec4 uR[${STEAM_LAYERS}];
/** Per clock (v1.6 polish 2): the peeling layer's fine amplitude (su), the peel (0..1), the room's air under the base: reach in from the rim, height (su). */
uniform vec4 uH[${STEAM_LAYERS}];
/** Per clock: the spill's source at τ − k·dt (k = 0..7, faded), and whether there is any. */
uniform vec4 uSp0[${STEAM_LAYERS}];
uniform vec4 uSp1[${STEAM_LAYERS}];
uniform float uSpillOn[${STEAM_LAYERS}];

const float RHO_MAX = ${f(RHO_MAX)};
const float Y_MAX = ${f(Y_MAX)};
const float LAYERS = ${STEAM_LAYERS}.0;
${FLOW_GLSL}
${LIGHT_GLSL}

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
  float flow = ${f(1 - VEIL.tail)} * exp(-k / ${f(VEIL.decay)}) + ${f(VEIL.tail)} * exp(-k / ${f(VEIL.tailDecay)});
  float src = smoothstep(0.0, ${f(VEIL.ramp)}, a) * pow(flow, ${f(VEIL.gather)}) * (1.0 - smoothstep(${f(VEIL.end[0])}, ${f(VEIL.end[1])}, te))
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
  vec4 n = texture(uNoise, vec3(c.x * 0.8, s * 0.5, c.y * 0.8) + vec3(0.0, 0.0, 0.05 * tau));
  // (Drawn out along the rise: ribbons, not puffs.)
  // (v1.6 polish: the sheets' crests are smooth (a squared fold, not a crease) and the noise is read
  // at a scale where its finest octave is ≈ 6 cm: thin ribbons that never break into a speckle.)
  vec3 qw = vec3(c.x * 0.65, s * 0.22, c.y * 0.65) + (n.xyz - 0.5) * vec3(0.7, 0.3, 0.7) * (0.8 + 1.2 * smoothstep(0.0, 0.6, h));
  float fold = 2.0 * texture(uNoise, qw + 3.7).r - 1.0;
  float ridge = 1.0 - fold * fold;
  // (A few ribbons, not a curtain: the large field leaves most of the column clear.)
  float sheets = smoothstep(0.8 + 0.1 * (1.0 - src), 0.995, ridge) * smoothstep(0.42 + 0.15 * (1.0 - src), 0.75, n.b);
  float wisps = mix(0.6, 0.06 + 4.2 * sheets, smoothstep(0.02, 0.2, h));
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
  vec4 m = mapAt(length(q), p.y, l);
  return m.a > 0.0 ? seat(m.r, m.g, uF[l].w, 0.0) * m.b : 0.0;
}


/**
 * How much the lifted dome still encloses p (v1.6 polish: the fog seen through the opening gap was
 * a bright bowl): 0 outside, towards 1 deep under the silver. The key cannot reach in, and the
 * room's light comes in only through the gap, less the higher up inside (uLift: the rim's lift).
 */
float domeCavity(vec3 p) {
  vec3 cv = (uCoverInv * vec4(p, 1.0)).xyz;
  if (cv.y < -0.03 || cv.y > ${f(COVER.domeHeight)}) return 0.0;
  float inside = 1.0 - smoothstep(-0.03, 0.01, length(cv.xz) - domeWall(max(cv.y, 0.0)));
  return inside * smoothstep(-0.03, 0.02, cv.y) * (1.0 - 0.6 * exp(-max(cv.y, 0.0) / (0.05 + uLift)));
}

/** Whether the spill could be at p on clock l (the probes' test): near the dome's outer wall. */
bool spillOccupies(vec3 p, int l) {
  if (uSpillOn[l] <= 0.0) return false;
  vec3 cv = (uCoverInv * vec4(p, 1.0)).xyz;
  return cv.y > -0.1 && cv.y < ${f(COVER.domeHeight + 0.03)} && abs(length(cv.xz) - domeWall(cv.y) - 0.045) < 0.11;
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
  // (v1.6 polish.) The gap's outflow curls out of the raised rim (a roll ≈ 1.5 cm proud of the
  // wall) and is caught by the hot wall's boundary layer: a sheet that climbs it, thickening as it
  // rises, its outer face torn into lobes.
  float curl = 0.07 * exp(-pow((y - 0.015) / 0.08, 2.0));
  float w = 0.016 + 0.07 * max(y, 0.0) + 0.5 * curl;
  if (d < -0.004 || d > curl + w + 0.05) return 0.0;
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
  // Lobes and filaments, rising with the air: the sheet's outer face moves in and out with them.
  float tau = uA[l].x;
  vec3 q = vec3(cv.x * 2.4, (y - ${f(SPILL.rise)} * tau) * 1.6, cv.z * 2.4);
  vec4 n = texture(uNoise, q * 0.5 + vec3(0.3, 0.0, 0.7));
  float lobes = smoothstep(0.3, 0.7, n.b + (n.r - 0.5) * 0.7);
  float outer = curl + w * (0.55 + 0.9 * lobes);
  float sheet = smoothstep(-0.004, 0.004, d) * (1.0 - smoothstep(outer - 0.01, outer, d));
  return ${f(SPILL_STRENGTH)} * src * az * sheet * mix(1.0, 0.4 + 1.0 * lobes, detail);
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
  // A change of mind (v1.6 polish): the returning cover does not pass through the fog it left; it
  // shoves it out of its way, outward and down in a ring round its wall, and as its rim closes on
  // the plate the air under it leaves the narrowing gap as a jet along the porcelain. (The fog at p
  // came from nearer the dome: read it there.)
  if (uA[l].x > uD[l].y) {
    vec3 cv = (uCoverInv * vec4(p, 1.0)).xyz;
    float r = length(cv.xz);
    float dOut = r - domeWall(clamp(cv.y, 0.0, ${f(COVER.domeHeight)}));
    if (r > 1e-3 && dOut > -0.05 && cv.y > -0.12 && cv.y < ${f(COVER.domeHeight + 0.1)}) {
      vec2 out2 = cv.xz / r;
      float on = smoothstep(uD[l].y, uD[l].y + 0.12, uA[l].x);
      float shove = 0.09 * exp(-max(dOut, 0.0) / 0.08) * (1.0 - smoothstep(${f(COVER.domeHeight - 0.1)}, ${f(COVER.domeHeight + 0.1)}, cv.y));
      float jet = 0.28 * (1.0 - smoothstep(0.015, 0.14, uLift)) * exp(-pow((cv.y + 0.01) / 0.035, 2.0)) * exp(-max(dOut, 0.0) / 0.22);
      // (Shoved air is torn: the push varies round the wall and along the jet.)
      vec4 pn = texture(uNoise, vec3(cv.x * 1.7, cv.y * 2.3 - 0.4 * uA[l].x, cv.z * 1.7) + 0.37);
      float torn = 0.45 + 1.1 * pn.b;
      q.xz -= out2 * on * (shove + jet) * torn;
      q.y += on * shove * torn * 0.5 * (1.0 - smoothstep(0.0, 0.3, cv.y));
    }
  }
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
  // The vortex ring keeps its fog longest (a dense, self-shaded core; its lip rolls over it).
  vec2 rr = vec2(rho - uR[l].x, q.y - uR[l].y) / (0.75 * uR[l].z);
  float ring = uR[l].w * exp(-dot(rr, rr));
  // (Outside the edge's furthest reach: the dilated occupancy.)
  if (m.a <= 1e-4) return 0.0;
  vec4 H = uH[l];
  // (Further outside the wall than the swell, the billows and the peeling layer can reach: clear, before any noise.)
  float dw = seatDistance(m.r, m.g);
  if (dw < -(E.x + 1.3 * E.z + 2.6 * H.x + 0.01)) return 0.0;
  vec2 dir = rho > 1e-5 ? q.xz / rho : vec2(1.0, 0.0);
  // (Plan direction in x/z, height in y.)
  vec3 X = vec3(dir.x * m.r, m.g, dir.y * m.r);
  float tau = uA[l].x;
  // The boundary where the saturated air meets the room's (v1.6 polish): the signed distance to the
  // cavity's wall at the seat, in material space (carried, stretched and rolled with the air),
  // moved by a large swell (E.x) and by billows (E.z: convex Perlin-Worley lobes 1–2 cm across,
  // folded by the large field, drawn out along the rise), then a narrow band (E.y) from room air to
  // fog: a firm, lobed edge rather than a feathered matte.
  vec3 Xs = X * vec3(1.15, 0.8, 1.15) + vec3(0.31, 0.17 + 0.04 * tau, 0.53);
  vec4 n1 = texture(uNoise, Xs * 0.55);
  vec3 Xb = X * vec3(1.6, 1.0, 1.6) + (n1.rgb - 0.5) * E.w + vec3(0.71, 0.05 * tau, 0.23);
  vec4 nb = texture(uNoise, Xb);
  float lobes = nb.b + 0.3 * (nb.a - 0.5) * detail;
  // v1.6 polish 2: the room's cooler air slides in under the warm fog from the rim (a gravity
  // current): a boundary like the wall, deepest at the rim, so the foot lifts off the porcelain. Its
  // head breaks into lobes and clefts (as a gravity current's does), so the foot is no ellipse.
  float under = 0.0;
  if (H.w > 0.0) {
    float reachU = H.z * (0.35 + 1.3 * nb.a);
    float hU = H.w * (0.55 + 0.9 * n1.b) * smoothstep(${f(CLOUD.radius)} - reachU, ${f(CLOUD.radius + 0.02)}, m.r);
    float dU = m.g - plateTop(min(m.r, 0.8)) - hU;
    under = smoothstep(-0.01, 0.03, dw - dU);
    dw = min(dw, dU);
  }
  float dEff = dw + E.z * (lobes - 0.5) * 2.0 + E.x * (n1.r - 0.5) * 2.0;
  // v1.6 polish 2: the peeling layer, on the edge band only. From the lift-off the outer centimetre
  // or two is a shear layer (the room's air sliding down the wall and in, the cloud's drawn up): the
  // dense boundary takes its own lobes (≈ 1.3 cm Worley bulges: rounded, so seen edge-on each keeps
  // its outline), and outside it the layer peels off in thin curling sheets of 2–4 mm, translucent,
  // fading out over ≈ 1.3 cm. All in material space (carried with the air), the outer layer sliding
  // slowly along the wall against the inner; its coordinates are turned off the noise's tiling axes.
  float wisp = 0.0, fineD = 0.0;
  if (H.x > 0.0 && detail > 0.0 && dEff > -(2.6 * H.x + 4.0 * H.x + 0.01) && dEff < 2.6 * H.x + E.y) {
    float outer = sat(0.5 - dw / 0.08);
    vec3 Xp = mat3(0.80, 0.36, -0.48, -0.20, 0.91, 0.36, 0.56, -0.20, 0.80) * X;
    vec3 Xf = Xp * 4.6 + (nb.rgb - 0.5) * 0.9 + vec3(0.37, -0.6 * H.y * outer * (tau - 0.27) + 0.21, 0.53 + 0.3 * tau);
    vec4 nf = texture(uNoise, Xf);
    vec4 ng = texture(uNoise, Xf * 2.3 + (nf.rgb - 0.5) * 1.2 + vec3(0.11, 0.0, 0.29));
    // (The shade below reads the boundary without these: the face keeps its silky fog.)
    fineD = H.x * (1.8 * (nf.a - 0.6) * 2.0 + 1.3 * (ng.a - 0.6) * 2.0);
    // Here and there the layer tears off in thin curling sheets (the zero set of a gradient noise,
    // folded by a finer one), translucent, out to ≈ 1.3 cm.
    float wd = -(dEff + fineD);
    if (wd > -E.y && wd < 4.0 * H.x) {
      float fold = (nf.g - 0.5) * 2.0 + 0.45 * (ng.r - 0.5) * 2.0;
      float sheetW = smoothstep(0.8, 0.97, 1.0 - fold * fold) * smoothstep(0.55, 0.75, nb.a + 0.4 * (nf.b - 0.5));
      wisp = ${f(EDGE.wisp)} * H.y * sheetW * (1.0 - smoothstep(0.0, 4.0 * H.x, wd)) * smoothstep(-E.y, 0.0, wd);
    }
  }
  float dShade = dEff;
  dEff += fineD;
  if (dEff < -0.06 && wisp <= 0.0) return 0.0;
  // v1.6 polish 2: the underside is no crisp line. The undercut's head mixes the room's air into the
  // fog's foot, and as the thermal rises its stem and the wall material that rolls under the cap
  // dilute and evaporate over the hot plate: their band is ≈ 1.7 cm (the judge's torn-paper
  // waterline across the plate at 0.74–1.0 s was the cap's 2.5 mm underside).
  float low = (1.0 - smoothstep(0.26, 0.5, m.g)) * smoothstep(0.1, 0.38, uC[l].z);
  float band = mix(E.y, ${f(STEAM_LOOK.underBand)}, max(low, under));
  float edge = smoothstep(0.0, band, dEff);
  // Inside, a silky fog that empties as it ages; at the edge, the mixing layer's thin sheet.
  // (Both start at the boundary: nothing feathers outside it but the peeling layer.)
  float sh = (dEff - band) / F.z;
  float d = (F.x * (0.75 + 0.5 * (n1.g - 0.5)) + F.y * exp(-sh * sh)) * edge + wisp;
  d *= m.b * seatGrade(m.g) * smoothstep(0.0, F.w, m.g - plateTop(min(m.r, 0.8)));
  // Evaporation takes the thin parts first: holes open where the large field is low, and the
  // sheets gather into a few larger wisps.
  float er = uC[l].y * (1.0 - 0.6 * ring);
  d *= (1.0 + 1.6 * ring) * smoothstep(er - 0.08, er + 0.12, 0.62 * n1.b + 0.38 * lobes + 0.12);
  // A change of mind: once the cover is back on the plate, the fog low over the plate (the base and
  // its slump over the rim) is swept by its skirt and leaves with the plate.
  if (uA[l].x > uD[l].z) d *= 1.0 - (1.0 - smoothstep(0.12, 0.26, X.y)) * smoothstep(uD[l].z, uD[l].z + 0.25, uA[l].x);
  // The billows' own shade: the edge a little way towards the key.
  if (d > 0.02 && detail > 0.0 && uC[l].z < 0.7) {
    vec4 nl = texture(uNoise, Xb + L * 0.2);
    shadeOd = 0.24 * sat((dShade + E.z * (nl.b - nb.b) * 2.0) / 0.06);
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
  float src = smoothstep(0.0, ${f(VEIL.ramp)}, a) * pow(${f(1 - VEIL.tail)} * exp(-k / ${f(VEIL.decay)}) + ${f(VEIL.tail)} * exp(-k / ${f(VEIL.tailDecay)}), ${f(VEIL.gather)})
    * (1.0 - smoothstep(${f(VEIL.end[0])}, ${f(VEIL.end[1])}, te));
  float w = ${f(VEIL.radius)} + ${f(VEIL.spread)} * h;
  float r = length(p.xz - uB[l].zw * h * 0.6);
  return 0.5 * ${f(VEIL.strength)} * src * smoothstep(0.0, ${f(VEIL.base)}, h) * exp(-h / ${f(VEIL.evaporate)}) * pow(${f(VEIL.radius)} / w, 2.0) * (1.0 - smoothstep(0.45 * w, w, r));
}

/** Henyey-Greenstein. */
float hg(float c, float g) { float g2 = g * g; return (1.0 - g2) / (4.0 * 3.14159265 * pow(1.0 + g2 - 2.0 * g * c, 1.5)); }

/**
 * The march's per-pixel start: an integer hash of the pixel (a fixed dither, deterministic). White,
 * not interleaved-gradient noise: IGN's diagonal structure survived the upsample's gather as a fine
 * hatch in thin steam; white noise averages out under it.
 */
/**
 * The march's fourth channel (a float target; v1.6 polish 2): a drawn pixel is ≥ 512 (the cleared
 * value is 1), then whether the steam it shows is mostly the rising veil or spill (+256), the key's
 * share of its light (7 bits: the composite colours it by key and room), and its depth along the ray
 * (su, the fraction × 64; ≈ 4 mm steps).
 */
float packMarch(float keyShare, bool rising, float depth) { return 512.0 + (rising ? 256.0 : 0.0) + floor(clamp(keyShare, 0.0, 1.0) * 127.0 + 0.5) + clamp(depth / 64.0, 0.0, 0.999); }
bool unpackDrawn(float w) { return w >= 512.0; }
float unpackKey(float w) { return w >= 512.0 ? mod(floor(w - 512.0), 256.0) / 127.0 : 0.0; }
bool unpackRising(float w) { return w >= 768.0; }
float unpackDepth(float w) { return fract(w) * 64.0; }

float ign(vec2 px) {
  uvec2 v = uvec2(px);
  uint h = v.x * 1597334677u ^ v.y * 3812015801u;
  h = (h ^ (h >> 16u)) * 2246822519u;
  h ^= h >> 13u;
  return float(h) / 4294967295.0;
}

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
  // (Fog still enclosed by the lifting dome shades nothing outside it: the silver already does.)
  if (domeCavity(p) > 0.5) return 0.0;
  for (int l = 0; l < ${STEAM_LAYERS}; l++) {
    if (uA[l].y <= 0.0) continue;
    // (The veil's mean overstates a few thin ribbons' shade: a third of it.)
    // (The cloud's visible share: its fog, and a part of its sheets, as it empties with age.)
    m += (cloudMean(p, l) * clamp(uF[l].x + 0.35 * uF[l].y, 0.1, 1.6) + 0.35 * veilMean(p, l)) * uA[l].z;
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
  // (v1.6 polish 2) Down to the plate: how much fog the white plate's light crosses to reach here.
  float down = 0.0;
  for (int i = 0; i < 4; i++) {
    float s = (float(i) + 0.5) * 0.07;
    down += meanAt(p - vec3(0.0, s, 0.0)) * 0.07;
  }
  gl_FragColor = vec4(od, up, domeLit(p), down);
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

/** Every live clock's steam at p (the cloud, the spill, the veil), and the billows' own shade. */
float sampleAt(vec3 p, vec3 L, float detail, out float localOd, out float rising) {
  float dens = 0.0;
  localOd = 0.0;
  rising = 0.0;
  for (int l = 0; l < ${STEAM_LAYERS}; l++) {
    if (uA[l].y <= 0.0) continue;
    float so = 0.0;
    bool inCloud = all(greaterThanEqual(p, uCloudMin[l])) && all(lessThanEqual(p, uCloudMax[l]));
    bool inVeil = all(greaterThanEqual(p, uVeilMin[l])) && all(lessThanEqual(p, uVeilMax[l]));
    bool inSpill = all(greaterThanEqual(p, uSpillMin[l])) && all(lessThanEqual(p, uSpillMax[l]));
    float dc = inCloud && uDebug != 3 && uDebug != 5 ? cloud(p, l, detail, L, so) : 0.0;
    float dr = (inSpill ? spill(p, l, detail) : 0.0) + (inVeil && uDebug != 4 ? veil(p, l, detail) : 0.0);
    if (dc + dr <= 0.0) continue;
    float k = uA[l].z * captured(p - vec3(0.0, uD[l].w, 0.0), l);
    dens += (dc + dr) * k;
    rising += dr * k;
    localOd += so * k;
  }
  return dens;
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
  // (v1.6 polish 2: the steam's shadow on what the ray meets is the composite's, at full resolution.)
  if (t1 <= t0) { gl_FragColor = vec4(0.0, 0.0, used, 1.0); return; }
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
  if (last < first) { gl_FragColor = vec4(0.0, 0.0, used, 1.0); return; }
  float a0 = max(t0, first - dp), a1 = min(t1, last + dp);
  int steps = uSteps;
  float dt = (a1 - a0) / float(steps);
  // (The start moves every frame, along a golden-ratio sequence seeded by the steam clock: the
  // temporal resolve averages the starts, and a capture at a given τ is the same every time.)
  float t = a0 + dt * (uDebug == 10 ? 0.5 : fract(ign(gl_FragCoord.xy) + 0.6180339887 * uFrame));
  vec3 L = normalize(uKeyDir);
  float cosT = dot(rd, L);
  // Phase: forward-leaning single scattering blended towards isotropic for the multiple-scattering octaves.
  // (Dense steam scatters many times: its effective phase is much flatter than a droplet's.)
  // A two-lobe phase (v1.6 polish): water droplets' forward lobe (g 0.7) and a weaker backward lobe,
  // so front-lit steam returns some light without the phase going flat; the multiple-scattering
  // octaves halve the asymmetry, then isotropic.
  float ph0 = mix(hg(cosT, uG), hg(cosT, ${f(STEAM_LOOK.gBack)}), ${f(STEAM_LOOK.back)});
  float ph1 = mix(hg(cosT, 0.5 * uG), hg(cosT, ${f(0.5 * STEAM_LOOK.gBack)}), ${f(STEAM_LOOK.back)}), ph2 = 1.0 / (4.0 * 3.14159265);
  float detail = uLow || uDebug == 9 ? 0.0 : 1.0;
  vec2 C = vec2(0.0);
  float T = 1.0, wt = 0.0, tw = 0.0, rw = 0.0;
  // Each sample stands for the span since the last one. Where the ray enters the steam from clear
  // air, the boundary is found by bisection (3 steps: an eighth of a step), so the edge is where the
  // field puts it, not where the dither happened to land: a crisp silhouette at any step size.
  bool clear = true;
  int refined = 0;
  for (int i = 0; i < 128; i++) {
    if (i >= steps || T < 0.01) break;
    vec3 p = ro + rd * t;
    float localOd, rising;
    float dens = sampleAt(p, L, detail, localOd, rising);
    float seg = dt;
    if (uRefine && dens > 1e-4 && clear && refined < 1) {
      float lo = max(t - dt, a0), hi = t, od2, r2;
      for (int b = 0; b < 3; b++) {
        float mid = 0.5 * (lo + hi);
        if (sampleAt(ro + rd * mid, L, detail, od2, r2) > 1e-4) hi = mid; else lo = mid;
      }
      seg = t - 0.5 * (lo + hi);
      refined++;
    }
    clear = dens <= 1e-4;
    t += dt;
    if (clear) continue;
    float sig = uSigma * dens;
    // The light volume: the optical depth to the key through the cloud's mean and to the room
    // above, and the lifted dome's shade; the billows' own shade from the local tap.
    // (The volume's voxels are ≈ 2 cm: read from 2.4 cm towards the key, and take the first stretch
    // from this sample's own density, so a lit face is not darkened by the cloud behind it.)
    // (One read serves the key, the room above and the dome's shade: 2.4 cm is well inside a voxel.)
    vec4 lv = lightAt(p + L * 0.14);
    if ((uFlags & 16) != 0) lv.x = 0.0;
    if ((uFlags & 32) != 0) lv.w = 0.0;
    float od = uSigma * (${f(STEAM_LOOK.keyFall)} * lv.x + 0.07 * dens + localOd);
    // Wrenninge's octaves: each scatters again with less extinction, less light and a flatter phase.
    // (v1.6 polish 2: the octaves raised, so dense front-lit fog is about as white as the plate: a
    // dense fog of droplets scatters nearly all it receives, many times.)
    float key = ((uFlags & 1) != 0 ? 0.0 : exp(-od) * ph0) + ((uFlags & 2) != 0 ? 0.0 : ${f(STEAM_LOOK.ms[0])} * exp(-0.35 * od) * ph1 + ${f(STEAM_LOOK.ms[1])} * exp(-0.2 * od) * ph2);
    float lit = mix(uDomeShade, 1.0, lv.z);
    // (Still under the lifting dome: no key, the room's light only through the gap.)
    float cav = domeCavity(p);
    // The room from every side (less under the cloud's own cover), and the white plate's bounce from below.
    // (v1.6 polish 2: the white plate under the fog fills most of the lower sky of the air just above
    // it, and lights its underside: as bright as the plate seen through the fog below it lets it be.)
    // (A disc of radius ≈ 0.8 su seen from hp above its middle: its view factor a²/(a² + h²).)
    float hp = max(0.0, p.y - ${f(PLATE_PROFILE[0]![1])});
    float bounce = ${f(STEAM_LOOK.bounce)} * (1.0 - smoothstep(0.62, 0.92, length(p.xz))) * (0.64 / (0.64 + hp * hp)) * exp(-uSigma * lv.w);
    // The room: from above (occluded by the cloud over it: a greyer underside), the plate's bounce.
    // (The lifted dome's shadow takes the key; the room's light round it a little.)
    if ((uFlags & 8) != 0) bounce = 0.0;
    // (v1.6 polish 2: in luminance, by source: the key's, and the room's with the plate's bounce; the
    // composite gives each its colour.)
    float sKey = ${f(STEAM_LOOK.key)} * (4.0 * 3.14159265) * key * lv.z * (1.0 - cav);
    float sRoom = ((uFlags & 4) != 0 ? 0.0 : ${f(STEAM_LOOK.room)} * (0.25 + 0.75 * exp(-uSigma * lv.y * 0.9)) * lit * (1.0 - 0.85 * cav))
      + bounce * (1.0 - 0.6 * cav);
    float Ts = exp(-sig * seg);
    C += T * (1.0 - Ts) * vec2(sKey, sRoom);
    // (The steam's depth along the ray, weighted by what it shows: where the resolve reprojects from.)
    wt += T * (1.0 - Ts);
    tw += T * (1.0 - Ts) * (t - dt);
    rw += T * (1.0 - Ts) * rising / dens;
    T *= Ts;
  }
  float alpha = 1.0 - T;
  if (uDebug == 1 || uDebug == 5) C = vec2(alpha, 0.0);
  if (uDebug == 2) C = vec2((a1 - a0) * 0.5, 0.0);
  // Premultiplied luminance, coverage, the depth used, and (packed) the key's share of the light,
  // the steam's depth along the ray and whether it is the rising veil or spill.
  float lum = C.x + C.y;
  gl_FragColor = vec4(lum, alpha, used, packMarch(lum > 1e-5 ? C.x / lum : 0.5, rw > 0.5 * wt, wt > 1e-4 ? tw / wt : 0.0));
}
`;

/**
 * The temporal resolve (v1.6 polish; per frame, over the half-resolution march): the march's start
 * moves every frame, and each pixel blends its new value into the history, fetched where that steam
 * was on the previous frame: its point (the march's steam depth along the ray) carried back through
 * the dominant clock's flow (the material coordinates from this frame's map, the forward map with
 * the previous frame's state; the veil rises) and projected with the previous camera. The history is
 * clipped to the new frame's neighbourhood (mean ± 1.25 σ), and dropped where the opaque scene in
 * front changed (the cloche moving over it) or on a jump of the clock: no smear, no ghost.
 */
const RESOLVE_FRAGMENT = /* glsl */ `
${STEAM_CORE}
uniform sampler2D uCur;
uniform sampler2D uHist;
uniform bool uHistValid;
uniform float uBlend;
uniform mat4 uInvVPL;
uniform mat4 uPrevVPL;
uniform int uL0;
uniform vec4 uPS0;
uniform vec4 uPS1;
uniform vec4 uPS2;
uniform vec4 uPB;
uniform float uVeilShift;
varying vec2 vUv;

/**
 * The history at uv, Catmull-Rom filtered (v1.6 polish 2: five bilinear taps; a plain bilinear fetch
 * resampled the history every frame and blurred the edge's fine structure away). Its .z (the depth
 * used) is the middle tap's.
 */
vec4 historyAt(vec2 uv) {
  vec2 size = vec2(textureSize(uHist, 0));
  vec2 sp = uv * size;
  vec2 tc = floor(sp - 0.5) + 0.5;
  vec2 fr = sp - tc;
  vec2 w0 = fr * (-0.5 + fr * (1.0 - 0.5 * fr));
  vec2 w1 = 1.0 + fr * fr * (-2.5 + 1.5 * fr);
  vec2 w2 = fr * (0.5 + fr * (2.0 - 1.5 * fr));
  vec2 w3 = fr * fr * (-0.5 + 0.5 * fr);
  vec2 w12 = w1 + w2;
  vec2 t0 = (tc - 1.0) / size, t3 = (tc + 2.0) / size, t12 = (tc + w2 / w12) / size;
  vec4 mid = texture(uHist, t12);
  vec4 r = texture(uHist, vec2(t12.x, t0.y)) * (w12.x * w0.y) + texture(uHist, vec2(t0.x, t12.y)) * (w0.x * w12.y)
    + mid * (w12.x * w12.y) + texture(uHist, vec2(t3.x, t12.y)) * (w3.x * w12.y) + texture(uHist, vec2(t12.x, t3.y)) * (w12.x * w3.y);
  r /= w12.x * w0.y + w0.x * w12.y + w12.x * w12.y + w3.x * w12.y + w12.x * w3.y;
  return vec4(r.xyw, mid.z).xywz;
}

/** Where the steam at local point p was on the previous frame (the veil and the spill: rising). */
vec3 previous(vec3 p, bool rising) {
  for (int l = 0; l < ${STEAM_LAYERS}; l++) {
    if (rising) break;
    if (l != uL0) continue;
    if (!(all(greaterThanEqual(p, uCloudMin[l])) && all(lessThanEqual(p, uCloudMax[l])))) break;
    vec3 q = p;
    q.xz -= uB[l].zw * max(0.0, q.y - 0.15);
    q.xz -= uB[l].xy * smoothstep(0.2, 0.72, q.y - uC[l].w);
    float rho = length(q.xz);
    vec4 m = mapAt(rho, q.y, l);
    if (m.a <= 0.0) break;
    vec2 dir = rho > 1e-5 ? q.xz / rho : vec2(1.0, 0.0);
    vec2 fw = axisForward(m.r, m.g, uPS0, uPS1, uPS2);
    vec3 o = vec3(dir.x * fw.x, fw.y, dir.y * fw.x);
    o.xz += uPB.xy * smoothstep(0.2, 0.72, m.g);
    o.xz += uPB.zw * max(0.0, o.y - 0.15);
    return o;
  }
  return p - vec3(0.0, uVeilShift, 0.0);
}

void main() {
  ivec2 px = ivec2(gl_FragCoord.xy);
  ivec2 lim = textureSize(uCur, 0) - 1;
  vec4 c = texelFetch(uCur, px, 0);
  // (v1.6 polish 2) Luminance, coverage and the key's luminance (its share of the light, for the colour).
  vec3 cur = vec3(c.xy, unpackKey(c.w) * c.x);
  vec3 res = cur;
  if (uHistValid) {
    vec3 m1 = vec3(0.0), m2 = vec3(0.0);
    float bestA = -1.0, bestW = 0.0;
    for (int k = 0; k < 9; k++) {
      vec4 v = texelFetch(uCur, clamp(px + ivec2(k % 3 - 1, k / 3 - 1), ivec2(0), lim), 0);
      vec3 x = vec3(v.xy, unpackKey(v.w) * v.x);
      m1 += x;
      m2 += x * x;
      if (v.y > bestA) { bestA = v.y; bestW = v.w; }
    }
    m1 /= 9.0;
    vec3 sd = sqrt(max(m2 / 9.0 - m1 * m1, 0.0));
    vec2 uv = (vec2(px) + 0.5) / vec2(lim + 1);
    vec2 puv = uv;
    // The steam's point: this pixel's, or (at an edge it has just left) its densest neighbour's.
    float depth = unpackDrawn(bestW) ? unpackDepth(bestW) : 0.0;
    float viewZ = 1e4;
    if (bestA > 0.002 && depth > 0.0) {
      vec4 fa = uInvVPL * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
      vec3 rd = normalize(fa.xyz / fa.w - uCamLocal);
      vec3 sp = uCamLocal + rd * depth;
      viewZ = -(uModelView * vec4(sp, 1.0)).z;
      vec4 pc = uPrevVPL * vec4(previous(sp, unpackRising(bestW)), 1.0);
      puv = pc.xy / pc.w * 0.5 + 0.5;
    }
    if (all(greaterThanEqual(puv, vec2(0.0))) && all(lessThanEqual(puv, vec2(1.0)))) {
      vec4 h = historyAt(puv);
      // (A moving occluder only matters where it cuts the steam: steam well in front of both keeps its history.)
      if (abs(h.z - c.z) < 0.03 * max(min(h.z, c.z), 1e-3) || viewZ < min(h.z, c.z) - 0.1) {
        vec3 hc = clamp(h.xyw, m1 - 1.25 * sd - 0.004, m1 + 1.25 * sd + 0.004);
        res = mix(hc, cur, uBlend);
        if (uDebug == 11) res = vec3(1.0, 1.0, 0.5);
      } else if (uDebug == 11) res = vec3(0.4, 1.0, 0.2);
    } else if (uDebug == 11) res = vec3(0.0, 1.0, 0.0);
  }
  gl_FragColor = vec4(res.xy, c.z, res.z);
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
uniform vec3 uKeyTint;
uniform vec3 uRoomTint;
uniform vec2 uScale;
uniform int uDebug;
uniform vec3 uCamLocal;
uniform mat4 uModelView;
uniform sampler2D uLight;
uniform vec3 uLightMin;
uniform vec3 uLightMax;
uniform mat4 uCoverInv;
uniform vec3 uKeyDir;
uniform float uShadowOn;
uniform float uSigma;
uniform int uFlags;
varying vec3 vLocal;
${LIGHT_GLSL}

float viewDistance(float dz) {
  float n = uNearFar.x, fa = uNearFar.y;
  return uOrtho ? n + dz * (fa - n) : -(n * fa) / ((fa - n) * dz - fa);
}

/**
 * The steam's shadow on what this pixel shows (the plate, the table; not the cloche), at full
 * resolution (v1.6 polish 2). The key is part of their light and the light volume knows how much
 * steam lies between them and it. Droplets scatter forward (g ≈ 0.7–0.85), so what a fog takes from
 * the key mostly reaches the surface under it diffused: the shadow is the fog's extinction less its
 * forward share, and where the fog itself stands in front of the surface there is none (the judge:
 * "the smoked-glass plate"); it reads offset, beside the fog, where the surface is seen clear.
 */
float surfaceShadow(float own, float alphaFront) {
  if (own > 9000.0 || uShadowOn <= 0.0 || (uFlags & 64) != 0) return 1.0;
  vec3 rd = normalize(vLocal - uCamLocal);
  vec4 v0 = uModelView * vec4(uCamLocal, 1.0), v1 = uModelView * vec4(rd, 0.0);
  if (v1.z >= 0.0) return 1.0;
  vec3 ps = uCamLocal + rd * ((-own - v0.z) / v1.z);
  vec3 cs = (uCoverInv * vec4(ps, 1.0)).xyz;
  if (cs.y > -0.03 && cs.y < ${f(COVER.height + 0.02)} && length(cs.xz) < max(domeWall(max(cs.y, 0.0)), 0.14) + 0.04) return 1.0;
  if (any(lessThan(ps, uLightMin - 0.02)) || any(greaterThan(ps, uLightMax + 0.02))) return 1.0;
  // Faded towards the light volume's sides, so its edge never draws a line.
  vec3 e = min(ps - uLightMin, uLightMax - ps);
  float inside = smoothstep(-0.02, 0.12, min(e.x, e.z));
  float clear = 1.0 - smoothstep(0.03, 0.3, alphaFront);
  // (Where the cloche already shades the key, the steam takes nothing more.)
  return 1.0 - ${f(STEAM_LOOK.shadow)} * uShadowOn * inside * clear * domeLit(ps) * (1.0 - exp(-uSigma * ${f(STEAM_LOOK.shadowOd)} * lightAt(ps).x));
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
  // A bilinear upsample (v1.6 polish: the 4 × 4 B-spline gather softened the edge by ≈ 4 pixels;
  // the temporal resolve has already taken the dither out), weighted by how well each sample's depth
  // matches this pixel's, so no steam bleeds over the cloche's edge or leaves a gap behind it.
  ivec2 b = ivec2(floor(hp));
  vec2 fr = hp - floor(hp);
  vec3 acc = vec3(0.0);
  float wsum = 0.0;
  float best = 1e9;
  vec3 bestV = vec3(0.0);
  for (int k = 0; k < 4; k++) {
    ivec2 o = ivec2(k & 1, k >> 1);
    vec4 v = texelFetch(uVolume, clamp(b + o, ivec2(0), size - 1), 0);
    vec2 t = mix(1.0 - fr, fr, vec2(o));
    float wb = t.x * t.y;
    float dd = abs(v.z - own);
    float wd = exp(-dd / (0.02 * min(own, v.z) + 0.003));
    acc += v.xyw * wb * wd;
    wsum += wb * wd;
    if (dd < best) { best = dd; bestV = v.xyw; }
  }
  // (Luminance, coverage, the key's luminance.)
  vec3 g = wsum > 1e-4 ? acc / wsum : bestV;
  vec2 v = g.xy;
  // The steam veils what is behind by its coverage; its shadow darkens what it falls on further.
  float shadow = surfaceShadow(own, v.y);
  float cover = 1.0 - (1.0 - v.y) * shadow;
  if (uDebug == 8) { gl_FragColor = vec4(shadow, wsum > 1e-4 ? 1.0 : 0.0, own > 9000.0 ? 1.0 : 0.0, 1.0); return; }
  if (uDebug == 1 || uDebug == 5) { gl_FragColor = vec4(v.x, 0.0, 0.0, 1.0); return; }
  if (cover < 0.002) discard;
  // (Tooling: the steam's own linear radiance / 2, unpremultiplied, where it is dense enough.)
  if (uDebug == 12) { gl_FragColor = vec4(vec3(v.y > 0.5 ? 0.5 * v.x / v.y : 0.0), 1.0); return; }
  // (v1.6 polish 2: lit in colour: the key's light is the window's, the room's the warm greige of
  // the walls and the table that surround it, each of unit luminance.)
  float keyShare = clamp(g.z / max(v.x, 1e-6), 0.0, 1.0);
  gl_FragColor = vec4(mix(uRoomTint, uKeyTint, keyShare) * (v.x / max(v.y, 1e-4)), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor = vec4(gl_FragColor.rgb * v.y, cover);
}
`;

const COMPOSITE_VERTEX = VOLUME_VERTEX;

const EULER = new Euler();
const TMP_VP = new Matrix4(), TMP_M = new Matrix4(), TMP_A = new Vector3(), TMP_B = new Vector3(), TMP_C = new Color(), TMP_D = new Color();

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
  /** The temporal resolve's history (ping-pong, half resolution): luminance, coverage, the depth used, the shadow. */
  private readonly hist: [WebGLRenderTarget, WebGLRenderTarget];
  private histIndex = 0;
  private readonly resolveMaterial: ShaderMaterial;
  private readonly resolveUniforms: Record<string, { value: unknown }>;
  /** The previous frame's camera, clock and dominant clock's flow (for the reprojection), or null. */
  private prev: { vp: Matrix4; tau: number; l0: number; s0: Vector4; s1: Vector4; s2: Vector4; b: Vector4; w: number; h: number; cloud: boolean; frame: number } | null = null;
  /** The dominant clock (its cloud's flow reprojects the history; its τ seeds the jitter), and whether it carries the cloud. */
  private l0 = -1;
  private l0Cloud = false;
  private tau0 = 0;
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
    // (Float: its fourth channel packs the shadow with the steam's depth for the reprojection.)
    this.half = new WebGLRenderTarget(1, 1, {
      type: FloatType, format: RGBAFormat, depthBuffer: false, minFilter: NearestFilter, magFilter: NearestFilter, generateMipmaps: false,
    });
    this.half.texture.name = 'fx_steam_half';
    const histTarget = (i: number) => {
      const rt = new WebGLRenderTarget(1, 1, {
        type: HalfFloatType, format: RGBAFormat, depthBuffer: false, minFilter: LinearFilter, magFilter: LinearFilter, generateMipmaps: false,
      });
      rt.texture.name = `fx_steam_history_${i}`;
      return rt;
    };
    this.hist = [histTarget(0), histTarget(1)];
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
      uSpillMin: { value: v3() }, uSpillMax: { value: v3() }, uLightMin: { value: new Vector3() }, uLightMax: { value: new Vector3(1, 1, 1) }, uShadowOn: { value: 0 },
      uSteps: { value: STEAM_LOOK.steps.dense },
      uProbes: { value: PROBES },
      uScale: { value: new Vector2(0.5, 0.5) },
      uDebug: { value: 0 },
      uFlags: { value: 0 },
      uFrame: { value: 0 },
      uRefine: { value: true },
      uLow: { value: false },
      uSigma: { value: STEAM_LOOK.sigma },
      uKeyDir: { value: new Vector3(-0.36, 0.643, 0.676).normalize() },
      uG: { value: STEAM_LOOK.g },
      uDomeShade: { value: STEAM_LOOK.domeShade },
      uCoverInv: { value: new Matrix4() },
      uLift: { value: 0 },
      uSeated: { value: new Vector3() },
      uLight: { value: this.light.texture },
      uR: { value: v4() }, uH: { value: v4() }, uA: { value: v4() }, uB: { value: v4() }, uC: { value: v4() }, uD: { value: v4() }, uE: { value: v4() }, uF: { value: v4() }, uSp0: { value: v4() }, uSp1: { value: v4() }, uSpillOn: { value: [0, 0, 0] },
    };
    this.lightMaterial = new ShaderMaterial({
      name: 'fx_steam_light', uniforms: this.uniforms, vertexShader: FULLSCREEN_VERTEX, fragmentShader: LIGHT_FRAGMENT, depthTest: false, depthWrite: false, toneMapped: false,
    });
    this.resolveUniforms = {
      ...this.uniforms,
      uCur: { value: this.half.texture },
      uHist: { value: this.hist[0].texture },
      uHistValid: { value: false },
      uBlend: { value: STEAM_LOOK.history },
      uInvVPL: { value: new Matrix4() },
      uPrevVPL: { value: new Matrix4() },
      uL0: { value: -1 },
      uPS0: { value: new Vector4() }, uPS1: { value: new Vector4() }, uPS2: { value: new Vector4() }, uPB: { value: new Vector4() },
      uVeilShift: { value: 0 },
    };
    this.resolveMaterial = new ShaderMaterial({
      name: 'fx_steam_resolve', uniforms: this.resolveUniforms, vertexShader: FULLSCREEN_VERTEX, fragmentShader: RESOLVE_FRAGMENT, depthTest: false, depthWrite: false, toneMapped: false,
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
      uKeyTint: { value: unitLuminance(STEAM_LOOK.keyTint) }, uRoomTint: { value: unitLuminance(STEAM_LOOK.roomTint) },
      uCamLocal: this.uniforms.uCamLocal!, uModelView: this.uniforms.uModelView!, uLight: this.uniforms.uLight!,
      uLightMin: this.uniforms.uLightMin!, uLightMax: this.uniforms.uLightMax!, uCoverInv: this.uniforms.uCoverInv!,
      uKeyDir: this.uniforms.uKeyDir!, uShadowOn: this.uniforms.uShadowOn!, uSigma: this.uniforms.uSigma!, uFlags: this.uniforms.uFlags!,
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
    const dbg = globalThis as { __steamDebug?: number; __steamSteps?: number; __steamSkip?: string; __steamNoTaa?: boolean };
    if (dbg.__steamSkip?.includes('prep')) return;
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
    u.uFlags!.value = (globalThis as { __steamFlags?: number }).__steamFlags ?? 0;
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
    u.uFrame!.value = Math.round(this.tau0 * 60);
    renderer.setClearColor(TMP_D.setRGB(0, 0, 1e4), 1);
    renderer.setRenderTarget(this.half);
    renderer.clear(true, false, false);
    if (!dbg.__steamSkip?.includes('march')) renderer.render(this.marchScene, camera);
    if (dbg.__steamSkip?.includes('resolve')) this.compositeUniforms.uVolume!.value = this.half.texture;
    else this.resolve(renderer, camera, w, h, dbg);
    renderer.setRenderTarget(prev);
    renderer.setClearColor(TMP_C, alpha);
    this.ready = true;
    this.marched++;
  }

  /**
   * The temporal resolve: this frame's march blended into the history, fetched where its steam was
   * on the previous frame (the dominant clock's flow and the previous camera). The history is
   * dropped on a resize, a change of the dominant clock, a jump of its τ (a replay, a change of
   * mind, a capture between live frames) or when the steam was not drawn on the previous frame.
   */
  private resolve(renderer: WebGLRenderer, camera: PerspectiveCamera | OrthographicCamera, w: number, h: number, dbg: { __steamNoTaa?: boolean }): void {
    const ru = this.resolveUniforms;
    const vp = TMP_VP.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    (ru.uInvVPL!.value as Matrix4).multiplyMatrices(vp, this.volume.matrixWorld).invert();
    const p = this.prev, tau = this.tau0, l0 = this.l0;
    const src = this.hist[this.histIndex]!, dst = this.hist[1 - this.histIndex]!;
    const sized = src.width === w && src.height === h;
    if (!sized) src.setSize(w, h);
    if (dst.width !== w || dst.height !== h) dst.setSize(w, h);
    const valid = !!p && sized && p.w === w && p.h === h && p.l0 === l0 && tau >= p.tau && tau - p.tau <= 0.1 && p.frame === this.marched - 1 && !dbg.__steamNoTaa;
    ru.uHistValid!.value = valid;
    ru.uL0!.value = -1;
    if (p && valid) {
      (ru.uPrevVPL!.value as Matrix4).multiplyMatrices(p.vp, this.volume.matrixWorld);
      if (p.cloud && this.l0Cloud) {
        ru.uL0!.value = l0;
        (ru.uPS0!.value as Vector4).copy(p.s0); (ru.uPS1!.value as Vector4).copy(p.s1);
        (ru.uPS2!.value as Vector4).copy(p.s2); (ru.uPB!.value as Vector4).copy(p.b);
      }
      ru.uVeilShift!.value = VEIL.rise * (tau - p.tau);
    }
    ru.uHist!.value = src.texture;
    this.pass.mesh.material = this.resolveMaterial;
    renderer.setRenderTarget(dst);
    renderer.render(this.pass.scene, this.pass.camera);
    this.pass.mesh.material = this.mapMaterial;
    this.compositeUniforms.uVolume!.value = dst.texture;
    this.histIndex = 1 - this.histIndex;
    // This frame, for the next one.
    const S0 = this.mapUniforms.uS0!.value as Vector4[], S1 = this.mapUniforms.uS1!.value as Vector4[], S2 = this.mapUniforms.uS2!.value as Vector4[];
    const B = this.uniforms.uB!.value as Vector4[];
    const next = this.prev ?? { vp: new Matrix4(), tau: 0, l0: -1, s0: new Vector4(), s1: new Vector4(), s2: new Vector4(), b: new Vector4(), w: 0, h: 0, cloud: false, frame: 0 };
    next.vp.copy(vp);
    Object.assign(next, { tau, l0, w, h, cloud: this.l0Cloud, frame: this.marched });
    if (l0 >= 0) { next.s0.copy(S0[l0]!); next.s1.copy(S1[l0]!); next.s2.copy(S2[l0]!); next.b.copy(B[l0]!); }
    this.prev = next;
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
    const E = this.uniforms.uE!.value as Vector4[], F = this.uniforms.uF!.value as Vector4[], R = this.uniforms.uR!.value as Vector4[];
    const Hh = this.uniforms.uH!.value as Vector4[];
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
    let shadowOn = 0, refine = false;
    this.l0 = -1;
    this.l0Cloud = false;
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
      if (this.l0 < 0 || (present && !this.l0Cloud)) { this.l0 = l; this.l0Cloud = present; this.tau0 = tau; }
      // (The fog inside has mostly gone by ≈ 0.75 s of the thermal: wisps take fewer steps, and the
      // edge's bisection is for the young cloud's narrow band.)
      if (present) steps = Math.max(steps, s.age < 0.75 ? STEAM_LOOK.steps.dense : STEAM_LOOK.steps.thin);
      if (present && s.age < 0.75) refine = true;
      // (Its shadow once the dome has lifted off it: τ 0.3 s on.)
      shadowOn = Math.max(shadowOn, present ? Math.min(1, Math.max(0, (tau - 0.3) / 0.15)) : 1);
      B[l]!.set(s.dragSide.x, s.dragSide.y, s.lean.x, s.lean.y);
      Cc[l]!.set(s.turb, s.erode, s.age, s.rise);
      const look = cloudLook(s.age, s.erode, this.look, s.peel);
      E[l]!.set(look.amp, look.band, look.billow, look.warp);
      Hh[l]!.set(EDGE.fine * s.peel, s.peel, s.undercutReach, s.undercutHeight);
      F[l]!.set(look.core, look.sheet, look.sheetWidth, s.floor);
      // (The ring holds fog once it has rolled up, until the cloud has gone.)
      R[l]!.set(s.ringR, s.ringY, s.ringSigma, smoothstep01((s.age - 0.25) / 0.4) * (1 - smoothstep01((s.age - 1.2) / 0.6)));
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
      // (The occupancy reaches as far as the turbulence, the swell and the billows can move the edge.)
      S3[l]!.set(s.floor, s.turb + look.amp + look.billow + 2 * EDGE.fine * s.peel + 0.03, s.stemFade, 0);
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
    this.uniforms.uShadowOn!.value = shadowOn;
    this.uniforms.uRefine!.value = refine;
    if (!any) {
      min.set(-1, 0, -1);
      max.set(1, 1, 1);
      // (No steam: the half-resolution march and its history give their memory back, and the next
      // steam starts a fresh history.)
      if (this.half.width > 1) for (const rt of [this.half, ...this.hist]) rt.setSize(1, 1);
      this.prev = null;
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
    this.uniforms.uLift!.value = Math.max(0, coverPos.y - (this.uniforms.uSeated!.value as Vector3).y);
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
    this.resolveMaterial.dispose();
    this.hist[0].dispose();
    this.hist[1].dispose();
    this.pass.mesh.geometry.dispose();
    this.map.dispose();
    this.half.dispose();
    this.light.dispose();
    this.noise?.dispose();
    this.object.removeFromParent();
  }
}

