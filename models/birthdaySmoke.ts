import {
  BoxGeometry, BufferGeometry, Color, DataTexture, Float32BufferAttribute, FloatType, FrontSide, Group, HalfFloatType, InstancedBufferGeometry, LinearFilter, Matrix4, Mesh, NearestFilter,
  type Object3D, OrthographicCamera, type PerspectiveCamera, RepeatWrapping, RGBAFormat, Scene, ShaderMaterial, UnsignedByteType, Vector2, Vector3, WebGL3DRenderTarget, WebGLRenderTarget,
  type WebGLRenderer, CustomBlending, AddEquation, OneFactor,
} from 'three';
import { requestSceneDepth, type SceneDepthFrame } from '../src/render/sceneDepth.ts';

/**
 * Birthday v1.6 polish: the candle smoke as a ray-marched volume (docs/scenes/birthday-v1.6-flames.md,
 * "Polish round: the judge's fixes"). The technique is the Dinner steam's (models/dinnerSteam.ts,
 * docs/scenes/dinner-v1.6-steam.md): a client of the stage's scene depth that, before the main
 * render, marches the volume at half resolution up to the opaque scene, and composites it in the
 * main pass with a depth-aware upsample. What it marches is different: not an analytic cloud but the
 * candles' own smoke physics (src/scenes/birthday/fire.ts `smokeStrand`), splatted every frame.
 *
 *  - **Splat.** Every strand's streakline (its parcels, from the wick up) is resampled into Gaussian
 *    puffs closer than their width, each carrying the vapour the wick gave off between its parcels
 *    (mass conserved), and drawn additively into a small 3D density grid over the top tier: 5 mm
 *    voxels, at most 80 × 96 × 64 (40 × 48 × 32 cm), its z slices tiled in one 2D half-float atlas,
 *    the box placed each frame round what is showing (snapped to the voxel lattice, so nothing
 *    swims). The width a puff is drawn at grows with its height above the wick (≈ 2 mm at the
 *    wick, 1–2 cm at 10 cm, 3–5 cm at 20 cm) and its density falls as it widens: the plume thins,
 *    it does not fade; neighbouring plumes overlap into one veil above 6–10 cm.
 *  - **Light volume.** Per frame, at half the grid's resolution: each voxel's optical depth towards
 *    the rig's key (8 taps over 12 cm) and up to the room (4 taps), and the densest voxel near it
 *    (empty-space skipping for the march).
 *  - **March.** Each half-resolution pixel finds where along its ray the grid holds smoke (probes of
 *    the light volume's occupancy), stops at the opaque scene's depth, and marches 40 jittered steps
 *    through that span. Each sample's lookup is warped by advected 3D noise (curl-like, from 4–8 cm
 *    above the wick, growing with height: wavelengths of 1–2 cm, growing), and eroded by finer
 *    noise into folded sheets (edge-on folds read brighter: the march integrates them). Single
 *    scattering of the key (Henyey–Greenstein g 0.6, forward), self-shadowed through the light
 *    volume, albedo 0.92, and the room's light occluded from above: grey-white, a little blue-grey
 *    where the key does not reach. Integrated front to back, energy-conserving.
 *  - **Composite.** The main pass draws the volume's box: a 4 × 4 gather of the half-resolution
 *    march weighted by depth (no smoke over a candle in front of it), tone mapped like the scene
 *    and laid over it premultiplied.
 *
 * The ribbons (models/birthdayFire.ts SmokeRig) still draw the first few centimetres of each
 * thread, where a laminar stem is honestly a 1–2 mm strip; the volume takes over from them along
 * the thread (the same vapour, handed over by path length).
 */

/** The volume's grid and look. */
export const SMOKE_VOLUME = {
  /** Voxel size (scene units: 5 mm) and the most voxels a side (40 × 48 × 32 cm). */
  voxel: 0.025,
  dims: [80, 96, 64] as const,
  /** z slices per atlas row (64 slices: 8 × 8 tiles). */
  tilesX: 8,
  /**
   * A sheet's own thickness (full width at half maximum, m) at height z above the wick: the laminar
   * stem's ≈2.5 mm, thickening slowly by diffusion (≈6 mm at 10 cm, 9 mm at 20 cm). The plume's
   * width is its meander and folds (the march's warp: ≈1–2 cm at 10 cm, 3–5 cm at 20 cm).
   */
  width: (z: number) => 0.0025 + 0.03 * z,
  /**
   * The ribbon draws a thread's first `ribbon[0]` m of path from the wick, handing it over to the
   * volume by `ribbon[1]`.
   */
  ribbon: [0.025, 0.05] as const,
  /**
   * Optical depth per unit of vapour (the strands' `rate` × the seconds of emission a puff
   * carries, per scene unit of path): the fresh stem's τ ≈ 0.4 across where the volume takes it
   * over, the merged veil's a few hundredths.
   */
  mass: 0.07,
  /** Evaporation and mixing below visibility: the volume's own age fade (× each kind's ribbon fade), s. */
  ageFade: 2,
  /** March steps (the Low tier: `lowSteps`), probes of the occupancy, and the half-resolution pixel cap. */
  steps: 40,
  lowSteps: 24,
  probes: 12,
  marchPixels: 400_000,
  /** Light: Henyey–Greenstein asymmetry (forward), albedo, the key's share and the room's radiance (linear, before exposure). */
  g: 0.6,
  albedo: 0.92,
  key: 0.6,
  room: [0.6, 0.62, 0.66] as const,
} as const;

const VOX = SMOKE_VOLUME.voxel;
const [NX, NY, NZ] = SMOKE_VOLUME.dims;
const TX = SMOKE_VOLUME.tilesX;
const TY = Math.ceil(NZ / TX);
/** The light volume: half the grid a side. */
const LX = NX / 2, LY = NY / 2, LZ = NZ / 2, LTX = 8, LTY = Math.ceil(LZ / LTX);
/** Puffs at most (the points texture: 64 × 64). */
export const SMOKE_PUFFS = 4096;
const PUFF_W = 64;
/** Slices a puff may span (its σ is held under this). */
const SLICES = 24;
const SIGMA_MIN = 0.55 * VOX, SIGMA_MAX = ((SLICES - 1) / 5) * VOX;
const NOISE_SIZE = 64;

const f = (x: number) => x.toFixed(5);

// ── Noise: one tileable 64³ texture, generated on the GPU (the steam's generator) ──
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
float perlin(vec3 p, int n, int seed) {
  vec3 x = p * float(n);
  ivec3 i = ivec3(floor(x));
  vec3 fr = fract(x);
  vec3 u = fr * fr * fr * (fr * (fr * 6.0 - 15.0) + 10.0);
  float v[8];
  for (int k = 0; k < 8; k++) {
    ivec3 o = ivec3(k & 1, (k >> 1) & 1, (k >> 2) & 1);
    vec3 g = normalize(hash3(wrap(i + o, n), seed) * 2.0 - 1.0 + 1e-4);
    v[k] = dot(g, fr - vec3(o));
  }
  return mix(mix(mix(v[0], v[1], u.x), mix(v[2], v[3], u.x), u.y), mix(mix(v[4], v[5], u.x), mix(v[6], v[7], u.x), u.y), u.z) * 1.6;
}
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
  return 0.58 * perlin(p, n, seed) + 0.29 * perlin(p, n * 2, seed + 1) + 0.13 * perlin(p, n * 4, seed + 2);
}
float worleyFbm(vec3 p, int n, int seed) {
  return 0.625 * (1.0 - worley(p, n, seed)) + 0.25 * (1.0 - worley(p, n * 2, seed + 1)) + 0.125 * (1.0 - worley(p, n * 4, seed + 2));
}
void main() {
  vec3 p = vec3(vUv, (uLayer + 0.5) / ${NOISE_SIZE}.0);
  // Two Perlin fBms (the warp, x and z), a third (its y), and a Worley fBm (the sheets' erosion).
  gl_FragColor = vec4(0.5 + 0.5 * perlinFbm(p, 4, 11), 0.5 + 0.5 * perlinFbm(p, 4, 23), 0.5 + 0.5 * perlinFbm(p, 4, 41), worleyFbm(p, 4, 53));
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

/** The grid's atlas lookups (trilinear: two bilinear taps inside a tile), shared by the light pass and the march. */
const ATLAS_GLSL = /* glsl */ `
const vec3 DIMS_MAX = vec3(${NX}.0, ${NY}.0, ${NZ}.0);
const float TILES_X = ${TX}.0;
const vec2 ATLAS = vec2(${NX * TX}.0, ${NY * TY}.0);
const vec3 LDIMS_MAX = vec3(${LX}.0, ${LY}.0, ${LZ}.0);
const float LTILES_X = ${LTX}.0;
const vec2 LATLAS = vec2(${LX * LTX}.0, ${LY * LTY}.0);
uniform sampler2D uDensity;
uniform vec3 uBoxMin;
uniform vec3 uDims;
// The density (optical depth per scene unit) at voxel coordinate v (voxel centres at i + 0.5).
float density(vec3 v) {
  if (any(lessThan(v, vec3(0.0))) || any(greaterThan(v, uDims))) return 0.0;
  float z = clamp(v.z - 0.5, 0.0, uDims.z - 1.0);
  float z0 = floor(z), fz = z - z0, z1 = min(z0 + 1.0, uDims.z - 1.0);
  vec2 xy = clamp(v.xy, vec2(0.5), uDims.xy - 0.5);
  vec2 t0 = vec2(mod(z0, TILES_X), floor(z0 / TILES_X)) * DIMS_MAX.xy;
  vec2 t1 = vec2(mod(z1, TILES_X), floor(z1 / TILES_X)) * DIMS_MAX.xy;
  return mix(texture2D(uDensity, (t0 + xy) / ATLAS).r, texture2D(uDensity, (t1 + xy) / ATLAS).r, fz);
}
`;

// ── Splat: Gaussian puffs into the density atlas ──────────────────────────────
const SPLAT_VERTEX = /* glsl */ `
precision highp float;
precision highp int;
uniform sampler2D uPuffA; // centre (box space, scene units), σ (scene units)
uniform sampler2D uPuffB; // optical depth × area it carries (τ·unit²), the first vapour's share
uniform vec3 uDims;
flat varying vec4 vP;
flat varying float vMass;
varying vec2 vXY;
flat varying float vZ;
const float SLICES = ${SLICES}.0;
void main() {
  int id = gl_InstanceID / ${SLICES};
  int j = gl_InstanceID - id * ${SLICES};
  ivec2 tc = ivec2(id % ${PUFF_W}, id / ${PUFF_W});
  vec4 A = texelFetch(uPuffA, tc, 0);
  vec4 B = texelFetch(uPuffB, tc, 0);
  vec3 p = A.xyz / ${f(VOX)};
  float s = A.w / ${f(VOX)};
  float r = 2.5 * s;
  float k = ceil(p.z - r - 0.5) + float(j);
  float dz = k + 0.5 - p.z;
  float rr = r * r - dz * dz;
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  if (B.x <= 0.0 || rr <= 0.0 || k < 0.0 || k >= uDims.z) return;
  float rx = sqrt(rr);
  vec2 lo = clamp(floor(p.xy - rx), vec2(0.0), uDims.xy), hi = clamp(ceil(p.xy + rx), vec2(0.0), uDims.xy);
  if (hi.x <= lo.x || hi.y <= lo.y) return;
  vec2 corner = mix(lo, hi, position.xy * 0.5 + 0.5);
  vec2 texel = vec2(mod(k, ${TX}.0), floor(k / ${TX}.0)) * vec2(${NX}.0, ${NY}.0) + corner;
  gl_Position = vec4(texel / vec2(${NX * TX}.0, ${NY * TY}.0) * 2.0 - 1.0, 0.0, 1.0);
  vXY = corner;
  vZ = k + 0.5;
  vP = vec4(p, s);
  vMass = B.x;
}
`;

const SPLAT_FRAGMENT = /* glsl */ `
precision highp float;
flat varying vec4 vP;
flat varying float vMass;
varying vec2 vXY;
flat varying float vZ;
void main() {
  vec3 d = vec3(vXY, vZ) - vP.xyz;
  float s2 = vP.w * vP.w;
  float q = dot(d, d) / s2;
  if (q > 6.25) discard;
  // A 3D Gaussian carrying vMass (τ·unit²) over its volume: optical depth per scene unit.
  float rho = vMass * exp(-0.5 * q) / (15.7496 * s2 * vP.w * ${f(VOX * VOX * VOX * 1e6)} * 1e-6);
  gl_FragColor = vec4(rho, 0.0, 0.0, 0.0);
}
`;

// ── The light volume (half the grid a side): to the key, to the room above, occupancy ──
const LIGHT_FRAGMENT = /* glsl */ `
precision highp float;
${ATLAS_GLSL}
uniform vec3 uKeyDir;
varying vec2 vUv;
void main() {
  vec2 px = floor(vUv * LATLAS);
  vec2 tile = floor(px / LDIMS_MAX.xy);
  float k = tile.y * LTILES_X + tile.x;
  vec2 ij = px - tile * LDIMS_MAX.xy;
  // This light voxel's centre in grid voxels (two a side).
  vec3 v = vec3(ij, k) * 2.0 + 1.0;
  if (k * 2.0 >= uDims.z || ij.x * 2.0 >= uDims.x || ij.y * 2.0 >= uDims.y) { gl_FragColor = vec4(0.0); return; }
  vec3 L = normalize(uKeyDir);
  float tk = 0.0, tu = 0.0, occ = 0.0;
  // Towards the key: 8 taps of 1.5 cm (the first half a tap in).
  for (int n = 0; n < 8; n++) tk += density(v + L * ((float(n) + 0.5) * 3.0));
  tk *= 3.0 * ${f(VOX)};
  for (int n = 0; n < 4; n++) tu += density(v + vec3(0.0, (float(n) + 0.5) * 4.0, 0.0));
  tu *= 4.0 * ${f(VOX)};
  // Occupancy: the densest of the 3 × 3 × 3 neighbourhood's corners (dilated: the march's probes never step over a thread).
  for (int n = 0; n < 27; n++) {
    vec3 o = vec3(float(n % 3), float((n / 3) % 3), float(n / 9)) - 1.0;
    occ = max(occ, density(v + o * 1.5));
  }
  gl_FragColor = vec4(tk, tu, occ, 1.0);
}
`;

// ── The march (half resolution, before the main pass) ─────────────────────────
/** The box: a unit cube placed over the grid in the root's space (both the march and the composite draw it). */
const BOX_VERTEX = /* glsl */ `
uniform vec3 uBoxMin;
uniform vec3 uDims;
varying vec3 vRoot;
void main() {
  vRoot = uBoxMin + (position + 0.5) * uDims * ${f(VOX)};
  gl_Position = projectionMatrix * modelViewMatrix * vec4(vRoot, 1.0);
}
`;

const MARCH_FRAGMENT = /* glsl */ `
precision highp float;
precision highp sampler3D;
${ATLAS_GLSL}
uniform sampler2D uLight;
uniform sampler3D uNoise;
uniform sampler2D uSceneDepth;
uniform bool uHasDepth;
uniform bool uOrtho;
uniform vec2 uNearFar;
uniform vec3 uCam;
uniform mat4 uMV;
uniform vec2 uScale;
uniform int uSteps;
uniform int uProbes;
uniform vec3 uKeyDir;
uniform vec3 uKey;
uniform vec3 uRoom;
uniform float uTime;
uniform float uWickY;
uniform int uDebug;
varying vec3 vRoot;

float viewDistance(float dz) {
  float n = uNearFar.x, fa = uNearFar.y;
  return uOrtho ? n + dz * (fa - n) : -(n * fa) / ((fa - n) * dz - fa);
}
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
// The light volume at grid voxel coordinate v: optical depth to the key, to the room, occupancy.
vec3 lightAt(vec3 v) {
  vec3 ld = ceil(uDims * 0.5);
  vec3 w = v * 0.5;
  if (any(lessThan(w, vec3(0.0))) || any(greaterThan(w, ld))) return vec3(0.0);
  float z = clamp(w.z - 0.5, 0.0, ld.z - 1.0);
  float z0 = floor(z), fz = z - z0, z1 = min(z0 + 1.0, ld.z - 1.0);
  vec2 xy = clamp(w.xy, vec2(0.5), ld.xy - 0.5);
  vec2 t0 = vec2(mod(z0, LTILES_X), floor(z0 / LTILES_X)) * LDIMS_MAX.xy;
  vec2 t1 = vec2(mod(z1, LTILES_X), floor(z1 / LTILES_X)) * LDIMS_MAX.xy;
  return mix(texture2D(uLight, (t0 + xy) / LATLAS).rgb, texture2D(uLight, (t1 + xy) / LATLAS).rgb, fz);
}
vec2 boxHit(vec3 ro, vec3 rd, vec3 lo, vec3 hi) {
  vec3 inv = 1.0 / rd;
  vec3 a = (lo - ro) * inv, b = (hi - ro) * inv;
  vec3 tn = min(a, b), tf = max(a, b);
  return vec2(max(max(tn.x, tn.y), tn.z), min(min(tf.x, tf.y), tf.z));
}

void main() {
  vec3 ro = uCam;
  vec3 rd = normalize(vRoot - uCam);
  rd = vec3(abs(rd.x) < 1e-7 ? 1e-7 : rd.x, abs(rd.y) < 1e-7 ? 1e-7 : rd.y, abs(rd.z) < 1e-7 ? 1e-7 : rd.z);
  vec3 bmin = uBoxMin, bmax = uBoxMin + uDims * ${f(VOX)};
  vec2 th = boxHit(ro, rd, bmin, bmax);
  float t0 = max(th.x, 0.0), t1 = th.y;
  // The opaque scene along this ray: the farthest of the full-resolution pixels this one covers
  // (the upsample keeps the nearer ones off it by depth).
  float used = 1e4;
  vec4 v0 = uMV * vec4(ro, 1.0);
  vec4 v1 = uMV * vec4(rd, 0.0);
  if (uHasDepth) {
    vec2 lo = floor(gl_FragCoord.xy - 0.5) / uScale, hi = (floor(gl_FragCoord.xy - 0.5) + 1.0) / uScale - 1.0;
    ivec2 lim = textureSize(uSceneDepth, 0) - 1;
    ivec2 a = clamp(ivec2(lo + 0.5), ivec2(0), lim), b = clamp(ivec2(hi + 0.5), ivec2(0), lim);
    float dz = max(max(texelFetch(uSceneDepth, a, 0).r, texelFetch(uSceneDepth, ivec2(b.x, a.y), 0).r),
      max(texelFetch(uSceneDepth, ivec2(a.x, b.y), 0).r, texelFetch(uSceneDepth, b, 0).r));
    if (dz < 1.0) {
      used = viewDistance(dz);
      if (v1.z < 0.0) t1 = min(t1, (-used - v0.z) / v1.z);
    }
  }
  if (t1 <= t0) { gl_FragColor = vec4(0.0, 0.0, used, 0.0); return; }
  // Probes of the occupancy: where along the ray the grid holds anything.
  float dp = (t1 - t0) / float(uProbes);
  float first = 1e9, last = -1e9;
  for (int i = 0; i <= 32; i++) {
    if (i > uProbes) break;
    float tp = t0 + dp * float(i);
    if (lightAt((ro + rd * tp - bmin) / ${f(VOX)}).b > 2e-3) { first = min(first, tp); last = tp; }
  }
  if (last < first) { gl_FragColor = vec4(0.0, 0.0, used, 0.0); return; }
  float a0 = max(t0, first - dp), a1 = min(t1, last + dp);
  float dt = (a1 - a0) / float(uSteps);
  float t = a0 + dt * ign(gl_FragCoord.xy);
  vec3 L = normalize(uKeyDir);
  float g = ${f(SMOKE_VOLUME.g)};
  // Henyey–Greenstein, × 4π (isotropic is 1): forward-peaked, so the smoke is faint front-lit.
  float phase = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * dot(L, rd), 1.5);
  vec3 C = vec3(0.0);
  float K = 0.0, T = 1.0;
  for (int i = 0; i < 64; i++) {
    if (i >= uSteps || T < 0.01) break;
    vec3 p = ro + rd * t;
    t += dt;
    // Height above the wicks (scene units: 1 = 20 cm) sets the turbulence. Laminar low down; from
    // 3–9 cm the column meanders (wavelength 6–10 cm, its envelope growing to ≈ ±1.2 cm at 10 cm and
    // ±2.4 cm at 20 cm), and from 4–8 cm it folds (eddies of 1.2 cm growing to 2.4 cm by 20 cm,
    // ±5 mm growing to ±1.1 cm). Both are carried up with the gas, so the folds rise with it.
    float h = p.y - uWickY;
    float g1 = smoothstep(0.15, 0.45, h), g2 = smoothstep(0.2, 0.4, h);
    vec3 warp = vec3(0.0);
    float sheet = 1.0;
    if (g1 > 0.0) {
      float hc = clamp(h, 0.0, 1.5);
      float lam1 = 0.3 + 0.15 * hc;
      vec3 m = texture(uNoise, (p - vec3(0.015 * uTime, 0.55 * uTime, 0.0)) / (4.0 * lam1) + vec3(0.31, 0.0, 0.57)).rgb - 0.5;
      warp += vec3(m.x, 0.35 * m.z, m.y) * 2.0 * g1 * 0.13 * hc;
      // The folds: just past folding over (2πA/λ ≈ 1.3), so the sheet bends and doubles, never tears.
      float lam2 = 0.07 + 0.07 * hc;
      vec3 q2 = (p + warp - vec3(0.02 * uTime, 0.75 * uTime, -0.015 * uTime)) / (4.0 * lam2);
      vec3 n = texture(uNoise, q2).rgb - 0.5;
      warp += n * 2.0 * g2 * 0.2 * lam2;
      // Erosion: thinner and denser stretches along the sheets.
      float e = texture(uNoise, q2 * 1.3 + vec3(0.37, 0.0, 0.11)).a;
      sheet = mix(1.0, 1.5 * smoothstep(0.25, 0.75, e), 0.5 * g2);
    }
    vec3 v = (p + warp - bmin) / ${f(VOX)};
    float rho = density(v) * sheet;
    if (rho < 1e-4) continue;
    vec3 lt = lightAt(v);
    vec3 key = uKey * ${f(SMOKE_VOLUME.key)} * phase * exp(-lt.r);
    vec3 room = uRoom * (0.45 + 0.55 * exp(-lt.g));
    vec3 S = ${f(SMOKE_VOLUME.albedo)} * (key + room);
    float Ts = exp(-rho * dt);
    C += T * (1.0 - Ts) * S;
    K += T * (1.0 - Ts) * ${f(SMOKE_VOLUME.albedo)} * dot(key, vec3(0.2126, 0.7152, 0.0722));
    T *= Ts;
  }
  float alpha = 1.0 - T;
  float lum = dot(C, vec3(0.2126, 0.7152, 0.0722));
  if (uDebug == 1) lum = alpha;
  // Premultiplied luminance, coverage, the depth used, and the key's share of the light (its colour).
  gl_FragColor = vec4(lum, alpha, used, lum > 1e-6 ? K / lum : 0.0);
}
`;

/** The composite (the main pass, over the box's footprint): the half-resolution march upsampled by depth. */
const COMPOSITE_FRAGMENT = /* glsl */ `
precision highp float;
uniform sampler2D uVolume;
uniform sampler2D uSceneDepth;
uniform bool uHasDepth;
uniform bool uReady;
uniform bool uOrtho;
uniform vec2 uNearFar;
uniform vec3 uRoomTint;
uniform vec3 uKeyTint;
uniform vec2 uScale;
float viewDistance(float dz) {
  float n = uNearFar.x, fa = uNearFar.y;
  return uOrtho ? n + dz * (fa - n) : -(n * fa) / ((fa - n) * dz - fa);
}
void main() {
  if (!uReady) discard;
  float own = 1e4;
  if (uHasDepth) {
    float dz = texelFetch(uSceneDepth, ivec2(gl_FragCoord.xy), 0).r;
    if (dz < 1.0) own = viewDistance(dz);
  }
  ivec2 size = textureSize(uVolume, 0);
  vec2 hp = gl_FragCoord.xy * uScale - 0.5;
  // A 4 × 4 gather with a smooth kernel, weighted by how well each sample's depth matches this pixel's.
  ivec2 b = ivec2(floor(hp)) - 1;
  vec2 fr = hp - floor(hp);
  vec3 acc = vec3(0.0);
  float wsum = 0.0, best = 1e9;
  vec3 bestV = vec3(0.0);
  for (int k = 0; k < 16; k++) {
    ivec2 o = ivec2(k & 3, k >> 2);
    vec4 v = texelFetch(uVolume, clamp(b + o, ivec2(0), size - 1), 0);
    vec2 dxy = abs(vec2(o) - 1.0 - fr);
    vec2 t = max(vec2(0.0), 1.0 - dxy / 2.0);
    float wb = t.x * t.x * t.x * t.y * t.y * t.y;
    float dd = abs(v.z - own);
    float wd = exp(-dd / (0.02 * min(own, v.z) + 0.003));
    acc += vec3(v.x, v.y, v.w * v.x) * wb * wd;
    wsum += wb * wd;
    if (dd < best && wb > 0.05) { best = dd; bestV = vec3(v.x, v.y, v.w * v.x); }
  }
  vec3 g = wsum > 1e-4 ? acc / wsum : bestV;
  float a = g.y;
  if (a < 0.002) discard;
  float keyShare = clamp(g.z / max(g.x, 1e-6), 0.0, 1.0);
  gl_FragColor = vec4(mix(uRoomTint, uKeyTint, keyShare) * (g.x / max(a, 1e-4)), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor = vec4(gl_FragColor.rgb * a, a);
}
`;

// ── The volume ──────────────────────────────────────────────────────────────────
/** One thread of smoke for the volume (fire.ts SmokeStrand's arrays, the smoke parent's space). */
export interface SmokeThread {
  position: Float32Array;
  age: Float32Array;
  rate: Float32Array;
  rise: Float32Array;
  full: Float32Array;
}

const TMP_M = new Matrix4(), TMP_A = new Vector3(), TMP_B = new Vector3(), TMP_C = new Color(), TMP_D = new Color();
const smoothstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** Scene units per metre (fire.ts MPS). */
const UNITS = 5;

/**
 * The smoke volume: `begin()`, `addThread()` for every strand, `end()` once a frame (CPU: the
 * puffs and the box); the stage's scene depth calls `prepare` before its main render (GPU: splat,
 * light, march), and the box composites in the main pass.
 */
export class SmokeVolume {
  readonly object = new Group();
  private readonly composite: Mesh;
  private readonly compositeMaterial: ShaderMaterial;
  private readonly marchScene = new Scene();
  private readonly marchMesh: Mesh;
  private readonly marchMaterial: ShaderMaterial;
  private readonly splatScene = new Scene();
  private readonly splatGeometry: InstancedBufferGeometry;
  private readonly splatMaterial: ShaderMaterial;
  private readonly fsScene = new Scene();
  private readonly fsCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly fsMesh: Mesh;
  private readonly lightMaterial: ShaderMaterial;
  private readonly density: WebGLRenderTarget;
  private readonly light: WebGLRenderTarget;
  private readonly half: WebGLRenderTarget;
  private noise: WebGL3DRenderTarget | null = null;
  private noiseFor: WebGLRenderer | null = null;
  private readonly puffA: DataTexture;
  private readonly puffB: DataTexture;
  /** Staging: x, y, z, σ, mass per puff (the smoke parent's space). */
  private readonly staged = new Float32Array(SMOKE_PUFFS * 5);
  private count = 0;
  private wickY = 0;
  private wicks = 0;
  private ready = false;
  private key: Object3D | null = null;
  private keyScene: Object3D | null = null;
  private readonly unregister: () => void;
  readonly uniforms: Record<string, { value: unknown }>;
  /** Tooling: frames marched, puffs drawn last frame, puffs that did not fit. */
  marched = 0;
  puffs = 0;
  dropped = 0;

  constructor(parent: Object3D) {
    this.object.name = 'fx_smoke_volume';
    this.object.userData.fx = true;
    this.object.visible = false;
    const rt = (w: number, h: number, linear: boolean) => {
      const t = new WebGLRenderTarget(w, h, { type: HalfFloatType, format: RGBAFormat, depthBuffer: false, generateMipmaps: false, minFilter: linear ? LinearFilter : NearestFilter, magFilter: linear ? LinearFilter : NearestFilter });
      t.texture.name = 'fx_smoke_volume';
      return t;
    };
    this.density = rt(NX * TX, NY * TY, true);
    this.light = rt(LX * LTX, LY * LTY, true);
    this.half = rt(1, 1, false);
    const tex = () => {
      const t = new DataTexture(new Float32Array(PUFF_W * (SMOKE_PUFFS / PUFF_W) * 4), PUFF_W, SMOKE_PUFFS / PUFF_W, RGBAFormat, FloatType);
      t.minFilter = t.magFilter = NearestFilter;
      t.needsUpdate = true;
      return t;
    };
    this.puffA = tex();
    this.puffB = tex();
    const room = new Color(...SMOKE_VOLUME.room);
    const lum = (c: Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    this.uniforms = {
      uDensity: { value: this.density.texture },
      uLight: { value: this.light.texture },
      uNoise: { value: null },
      uBoxMin: { value: new Vector3() },
      uDims: { value: new Vector3(1, 1, 1) },
      uPuffA: { value: this.puffA },
      uPuffB: { value: this.puffB },
      uKeyDir: { value: new Vector3(-0.36, 0.64, 0.68).normalize() },
      uKey: { value: new Vector3(1.5, 1.5, 1.5) },
      uRoom: { value: new Vector3(room.r, room.g, room.b) },
      uSceneDepth: { value: null },
      uHasDepth: { value: false },
      uOrtho: { value: false },
      uNearFar: { value: new Vector2(0.5, 200) },
      uCam: { value: new Vector3() },
      uMV: { value: new Matrix4() },
      uScale: { value: new Vector2(0.5, 0.5) },
      uSteps: { value: SMOKE_VOLUME.steps },
      uProbes: { value: SMOKE_VOLUME.probes },
      uTime: { value: 0 },
      uWickY: { value: 0 },
      uDebug: { value: 0 },
      uVolume: { value: this.half.texture },
      uReady: { value: false },
      uRoomTint: { value: new Vector3(room.r, room.g, room.b).multiplyScalar(1 / lum(room)) },
      uKeyTint: { value: new Vector3(1, 1, 1) },
    };
    const u = this.uniforms;
    // The splat: instanced quads, one per puff and slice it may touch, added into the atlas.
    this.splatGeometry = new InstancedBufferGeometry();
    this.splatGeometry.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0], 3));
    this.splatGeometry.setIndex([0, 1, 2, 2, 1, 3]);
    this.splatGeometry.instanceCount = 0;
    this.splatMaterial = new ShaderMaterial({
      name: 'fx_smoke_splat', uniforms: { uPuffA: u.uPuffA!, uPuffB: u.uPuffB!, uDims: u.uDims! }, vertexShader: SPLAT_VERTEX, fragmentShader: SPLAT_FRAGMENT,
      depthTest: false, depthWrite: false, blending: CustomBlending, blendEquation: AddEquation, blendSrc: OneFactor, blendDst: OneFactor, toneMapped: false,
    });
    const splat = new Mesh(this.splatGeometry, this.splatMaterial);
    splat.frustumCulled = false;
    this.splatScene.add(splat);
    // The light volume (a fullscreen pass over its atlas); the noise's generator uses the same triangle.
    this.lightMaterial = new ShaderMaterial({
      name: 'fx_smoke_light', uniforms: { uDensity: u.uDensity!, uBoxMin: u.uBoxMin!, uDims: u.uDims!, uKeyDir: u.uKeyDir! }, vertexShader: FULLSCREEN_VERTEX, fragmentShader: LIGHT_FRAGMENT,
      depthTest: false, depthWrite: false, toneMapped: false,
    });
    this.fsMesh = new Mesh(fullscreenTriangle(), this.lightMaterial);
    this.fsMesh.frustumCulled = false;
    this.fsScene.add(this.fsMesh);
    // The march: the box's front faces into the half-resolution target, posed with the smoke's parent.
    const box = new BoxGeometry(1, 1, 1);
    this.marchMaterial = new ShaderMaterial({ name: 'fx_smoke_march', uniforms: u, vertexShader: BOX_VERTEX, fragmentShader: MARCH_FRAGMENT, depthTest: false, depthWrite: false, side: FrontSide, toneMapped: false });
    this.marchMesh = new Mesh(box, this.marchMaterial);
    this.marchMesh.frustumCulled = false;
    this.marchMesh.matrixAutoUpdate = false;
    this.marchMesh.matrixWorldAutoUpdate = false;
    this.marchScene.add(this.marchMesh);
    // The composite: the same box in the main pass.
    this.compositeMaterial = new ShaderMaterial({
      name: 'fx_smoke_volume', uniforms: u, vertexShader: BOX_VERTEX, fragmentShader: COMPOSITE_FRAGMENT,
      transparent: true, depthWrite: false, depthTest: true, side: FrontSide, premultipliedAlpha: true,
    });
    this.composite = new Mesh(box, this.compositeMaterial);
    this.composite.name = 'fx_smoke_volume_box';
    this.composite.frustumCulled = false;
    // Before the ribbons (3) and the flames (4): the stems and the flames composite over it.
    this.composite.renderOrder = 2;
    this.composite.userData.fx = true;
    this.composite.userData.noShadowCast = true;
    this.composite.userData.noSceneDepth = true;
    this.composite.onBeforeRender = () => { u.uReady!.value = this.ready; };
    this.composite.onAfterRender = () => { this.ready = false; };
    this.object.add(this.composite);
    parent.add(this.object);
    this.unregister = requestSceneDepth({ object: this.object, active: () => this.object.visible, prepare: (renderer, frame) => this.prepare(renderer, frame) });
  }

  /** Start a frame's puffs. */
  begin(): void {
    this.count = 0;
    this.wickY = 0;
    this.wicks = 0;
    this.dropped = 0;
  }

  /**
   * One thread: its parcels resampled into puffs closer than their width, each carrying the vapour
   * emitted between its parcels (× `fade`: the kind's age fade, stretched, and the tail's), handed
   * over from the ribbon along the thread's path. `fadeAge`: the volume's age fade [start, end] (s).
   */
  addThread(st: SmokeThread, fadeAge: readonly [number, number], tail: number): void {
    const n = st.age.length;
    const P = st.position;
    this.wickY += P[1]!;
    this.wicks++;
    if (tail <= 0) return;
    const [r0, r1] = SMOKE_VOLUME.ribbon;
    let path = 0;
    for (let k = 0; k < n - 1; k++) {
      const ax = P[k * 3]!, ay = P[k * 3 + 1]!, az = P[k * 3 + 2]!;
      const bx = P[k * 3 + 3]!, by = P[k * 3 + 4]!, bz = P[k * 3 + 5]!;
      const len = Math.hypot(bx - ax, by - ay, bz - az);
      const s0 = path / UNITS;
      path += len;
      const s1 = path / UNITS;
      const rate = 0.5 * (st.rate[k]! + st.rate[k + 1]!);
      const db = st.age[k + 1]! - st.age[k]!;
      if (rate <= 0 || db <= 0 || s1 < r0) continue;
      const mass = SMOKE_VOLUME.mass * rate * db;
      const sig = (j: number) => Math.min(SIGMA_MAX, Math.max(SIGMA_MIN, (Math.max(SMOKE_VOLUME.width(st.rise[j]!), st.full[j]!) / 2.355) * UNITS));
      const sa = sig(k), sb = sig(k + 1);
      const m = Math.max(1, Math.min(32, Math.ceil(len / (0.8 * Math.min(sa, sb)))));
      for (let j = 0; j < m; j++) {
        const u = (j + 0.5) / m;
        const age = st.age[k]! + db * u;
        const w = smoothstep(r0, r1, s0 + (s1 - s0) * u) * (1 - smoothstep(fadeAge[0], fadeAge[1], age)) * tail;
        const pm = (mass / m) * w;
        const s = sa + (sb - sa) * u;
        // Below what a screen could show (its peak optical depth across under 10⁻⁴): not drawn.
        if (pm / (6.283 * s * s) < 1e-4) continue;
        if (this.count >= SMOKE_PUFFS) { this.dropped++; continue; }
        const o = this.count++ * 5;
        const S = this.staged;
        S[o] = ax + (bx - ax) * u; S[o + 1] = ay + (by - ay) * u; S[o + 2] = az + (bz - az) * u; S[o + 3] = s; S[o + 4] = pm;
      }
    }
  }

  /** Close the frame: the box round the puffs (snapped to the voxel lattice), the puffs' textures, the clock. */
  end(time: number): void {
    const S = this.staged, n = this.count;
    this.puffs = n;
    const u = this.uniforms;
    if (n === 0) {
      // (A warm-up keeps the empty volume drawn for its first frames: its passes link then, under the poster.)
      this.object.visible = this.warm > 0;
      if (this.warm > 0) {
        this.warm--;
        this.splatGeometry.instanceCount = 0;
        (u.uDims!.value as Vector3).set(1, 1, 1);
      }
      return;
    }
    this.warm = 0;
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity, cx = 0, cz = 0, cy = 0, mt = 0;
    for (let i = 0; i < n; i++) {
      const o = i * 5, r = 2.5 * S[o + 3]!, m = S[o + 4]!;
      x0 = Math.min(x0, S[o]! - r); x1 = Math.max(x1, S[o]! + r);
      y0 = Math.min(y0, S[o + 1]! - r); y1 = Math.max(y1, S[o + 1]! + r);
      z0 = Math.min(z0, S[o + 2]! - r); z1 = Math.max(z1, S[o + 2]! + r);
      cx += S[o]! * m; cy += S[o + 1]! * m; cz += S[o + 2]! * m; mt += m;
    }
    cx /= mt; cy /= mt; cz /= mt;
    // Too wide: centred on the smoke's mass; too tall: kept from the bottom (the dense part), up to the grid's height.
    const fit = (lo: number, hi: number, c: number, N: number, bottom: boolean) => {
      const span = N * VOX;
      if (hi - lo <= span) return lo;
      return bottom ? lo : Math.min(hi - span, Math.max(lo, c - span / 2));
    };
    x0 = fit(x0, x1, cx, NX, false); y0 = fit(y0, y1, cy, NY, true); z0 = fit(z0, z1, cz, NZ, false);
    x0 = Math.floor(x0 / VOX) * VOX; y0 = Math.floor(y0 / VOX) * VOX; z0 = Math.floor(z0 / VOX) * VOX;
    const dims = (u.uDims!.value as Vector3).set(
      Math.min(NX, Math.max(1, Math.ceil((x1 - x0) / VOX))), Math.min(NY, Math.max(1, Math.ceil((y1 - y0) / VOX))), Math.min(NZ, Math.max(1, Math.ceil((z1 - z0) / VOX))),
    );
    (u.uBoxMin!.value as Vector3).set(x0, y0, z0);
    const A = this.puffA.image.data as Float32Array, B = this.puffB.image.data as Float32Array;
    for (let i = 0; i < n; i++) {
      const o = i * 5;
      A[i * 4] = S[o]! - x0; A[i * 4 + 1] = S[o + 1]! - y0; A[i * 4 + 2] = S[o + 2]! - z0; A[i * 4 + 3] = S[o + 3]!;
      B[i * 4] = S[o + 4]!; B[i * 4 + 1] = 0;
    }
    this.puffA.needsUpdate = true;
    this.puffB.needsUpdate = true;
    this.splatGeometry.instanceCount = n * SLICES;
    u.uTime!.value = time;
    u.uWickY!.value = this.wicks ? this.wickY / this.wicks : y0;
    void dims;
    this.object.visible = true;
  }

  /** Before the main render (the scene depth's client): the noise once, the splat, the light volume, the half-resolution march. */
  private prepare(renderer: WebGLRenderer, frame: SceneDepthFrame): void {
    if (!this.noise || this.noiseFor !== renderer) this.generateNoise(renderer);
    const u = this.uniforms;
    const camera = frame.camera as PerspectiveCamera;
    const prev = renderer.getRenderTarget();
    renderer.getClearColor(TMP_D);
    const alpha = renderer.getClearAlpha();
    const auto = renderer.autoClear;
    renderer.autoClear = false;
    // The parent's pose: the march draws its box in the parent's space.
    const parent = this.object.parent!;
    parent.updateWorldMatrix(true, false);
    this.marchMesh.matrixWorld.copy(parent.matrixWorld);
    const inv = TMP_M.copy(parent.matrixWorld).invert();
    (u.uCam!.value as Vector3).setFromMatrixPosition(camera.matrixWorld).applyMatrix4(inv);
    (u.uMV!.value as Matrix4).multiplyMatrices(camera.matrixWorldInverse, parent.matrixWorld);
    u.uSceneDepth!.value = frame.texture;
    u.uHasDepth!.value = true;
    (u.uNearFar!.value as Vector2).set(camera.near, camera.far);
    u.uOrtho!.value = (camera as unknown as { isOrthographicCamera?: boolean }).isOrthographicCamera === true;
    u.uDebug!.value = (globalThis as { __smokeDebug?: number }).__smokeDebug ?? 0;
    // The key (the shadow-casting light), in the parent's space.
    if (this.keyScene !== frame.scene || (this.key && !this.key.parent)) {
      this.key = findKey(frame.scene);
      this.keyScene = frame.scene;
    }
    const key = this.key;
    if (key) {
      const box = u.uBoxMin!.value as Vector3, dims = u.uDims!.value as Vector3;
      const c = TMP_A.copy(dims).multiplyScalar(0.5 * VOX).add(box);
      TMP_B.setFromMatrixPosition(key.matrixWorld).applyMatrix4(inv);
      (u.uKeyDir!.value as Vector3).copy(TMP_B).sub(c).normalize();
      const l = key as unknown as { color: Color; intensity: number };
      (u.uKey!.value as Vector3).set(l.color.r, l.color.g, l.color.b).multiplyScalar(l.intensity);
    }
    // 1. Splat.
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(this.density);
    renderer.clear(true, false, false);
    renderer.render(this.splatScene, this.fsCamera);
    // 2. The light volume.
    this.fsMesh.material = this.lightMaterial;
    renderer.setRenderTarget(this.light);
    renderer.render(this.fsScene, this.fsCamera);
    // 3. The march, at half the drawing buffer's resolution (capped).
    const scale = Math.min(0.5, Math.sqrt(SMOKE_VOLUME.marchPixels / Math.max(1, frame.size.x * frame.size.y)));
    const w = Math.max(1, Math.ceil(frame.size.x * scale)), h = Math.max(1, Math.ceil(frame.size.y * scale));
    (u.uScale!.value as Vector2).set(w / frame.size.x, h / frame.size.y);
    if (this.half.width !== w || this.half.height !== h) this.half.setSize(w, h);
    renderer.setClearColor(TMP_C.setRGB(0, 0, 1e4), 0);
    renderer.setRenderTarget(this.half);
    renderer.clear(true, false, false);
    renderer.render(this.marchScene, camera);
    renderer.setRenderTarget(prev);
    renderer.setClearColor(TMP_D, alpha);
    renderer.autoClear = auto;
    this.ready = true;
    this.marched++;
  }

  private generateNoise(renderer: WebGLRenderer): void {
    this.noise?.dispose();
    const rt = new WebGL3DRenderTarget(NOISE_SIZE, NOISE_SIZE, NOISE_SIZE, { format: RGBAFormat, type: UnsignedByteType, depthBuffer: false, generateMipmaps: false });
    const tex = rt.texture;
    tex.wrapS = tex.wrapT = tex.wrapR = RepeatWrapping;
    tex.minFilter = tex.magFilter = LinearFilter;
    tex.name = 'fx_smoke_noise';
    const layer = { value: 0 };
    const mat = new ShaderMaterial({ name: 'fx_smoke_noise_gen', uniforms: { uLayer: layer }, vertexShader: FULLSCREEN_VERTEX, fragmentShader: NOISE_GEN, depthTest: false, depthWrite: false });
    this.fsMesh.material = mat;
    const prev = renderer.getRenderTarget();
    for (let z = 0; z < NOISE_SIZE; z++) {
      layer.value = z;
      renderer.setRenderTarget(rt, z);
      renderer.render(this.fsScene, this.fsCamera);
    }
    renderer.setRenderTarget(prev);
    this.fsMesh.material = this.lightMaterial;
    mat.dispose();
    this.noise = rt;
    this.noiseFor = renderer;
    this.uniforms.uNoise!.value = tex;
  }

  /** Low tier: fewer steps. */
  setLowDetail(enabled: boolean): void {
    this.uniforms.uSteps!.value = enabled ? SMOKE_VOLUME.lowSteps : SMOKE_VOLUME.steps;
  }

  /** Show the volume for a shader warm-up (its passes link in the next frame; the next `end` restores visibility). */
  showForCompile(): void {
    this.object.visible = true;
    this.warm = 3;
  }
  private warm = 0;

  dispose(): void {
    this.unregister();
    this.splatGeometry.dispose();
    this.splatMaterial.dispose();
    this.lightMaterial.dispose();
    this.marchMaterial.dispose();
    this.compositeMaterial.dispose();
    this.composite.geometry.dispose();
    (this.fsMesh.geometry as BufferGeometry).dispose();
    this.density.dispose();
    this.light.dispose();
    this.half.dispose();
    this.noise?.dispose();
    this.puffA.dispose();
    this.puffB.dispose();
    this.object.removeFromParent();
  }
}

/** The scene's shadow-casting key light (spot or directional), or null. */
function findKey(scene: Object3D): Object3D | null {
  let key: Object3D | null = null;
  scene.traverse((o) => {
    const l = o as Object3D & { isSpotLight?: boolean; isDirectionalLight?: boolean; castShadow?: boolean };
    if ((l.isSpotLight || l.isDirectionalLight) && (!key || (l.castShadow && !(key as Object3D & { castShadow?: boolean }).castShadow))) key = o;
  });
  return key;
}
