import {
  BoxGeometry, BufferGeometry, Color, DataTexture, Float32BufferAttribute, FloatType, FrontSide, Group, HalfFloatType, InstancedBufferGeometry, LinearFilter, Matrix4, Mesh, NearestFilter,
  type Object3D, OrthographicCamera, type PerspectiveCamera, RepeatWrapping, RGBAFormat, Scene, ShaderMaterial, UnsignedByteType, Vector2, Vector3, Vector4, WebGL3DRenderTarget, WebGLRenderTarget,
  type WebGLRenderer, CustomBlending, AddEquation, OneFactor, RGFormat,
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
   * stem's ≈2.5 mm, spreading as it mixes (≈1 cm at 10 cm, 1.7 cm at 20 cm); with the meander and
   * the folds (the march's warp) the plume is ≈1–2 cm wide at 10 cm and 3–5 cm at 20 cm.
   */
  width: (z: number) => 0.0025 + 0.07 * z,
  /**
   * v1.6 polish 2: the ribbons draw each thread's laminar stem (up to its own plume's transition,
   * fire.ts smokeLaminar, 4–12 cm) and, above it, the thin filament it goes on as (re-judge: "carry
   * thin, folding, crisp structure above the stem"), `filament[0]` of its smoke at first, the rest
   * spreading into the volume's veil between `filament[1]` m under the transition and `filament[2]`
   * over it; the filament fades out between `filament[3]` and `filament[4]` m above the transition.
   * Of a thread swept off its stem (the breath) they draw only its first `ribbon[0]` m of sideways
   * travel, handing it over by `ribbon[1]`. The volume draws the rest (mass conserved).
   */
  ribbon: [0.004, 0.015] as const,
  filament: [0.85, 0.01, 0.03, 0.04, 0.16] as const,
  /** The first vapour (born within `puffHead[0]`–`[1]` s of the flame letting go) is the volume's once `[2]`–`[3]` m up. */
  puffHead: [0.12, 0.3, 0.008, 0.02] as const,
  /** v1.6 polish 2: the ribbons draw threads up to this wide (m: fading from [0] to [1]); wider smoke is the volume's. */
  ribbonWidth: [0.0028, 0.0045] as const,
  /** How far above its transition (m) a plume's sheets and folds are fully developed (the march's turbulence, 0 → 1). */
  develop: 0.045,
  /**
   * Optical depth per unit of vapour (the strands' `rate` × the seconds of emission a puff
   * carries, per scene unit of path): the fresh stem's τ ≈ 0.4 across where the volume takes it
   * over, the merged veil's a few hundredths.
   */
  mass: 0.07,
  /** Evaporation and mixing below visibility: the volume's own age fade (× each kind's ribbon fade), s. */
  ageFade: 1.4,
  /** Evaporation of the aerosol with height above the wick (e-folding, m, from 4 cm or its plume's transition, if higher). */
  evaporate: 0.09,
  /** March steps (the Low tier: `lowSteps`), probes of the occupancy, and the half-resolution pixel cap. */
  steps: 40,
  lowSteps: 24,
  probes: 12,
  marchPixels: 400_000,
  /**
   * v1.6 polish 2, the sheets inside the grid (the march): their cell size (scene units at the wicks:
   * 1 cm, growing with height), their thickness (in the field's units: ≈0.5 mm half-width at the
   * wicks, thickening as they rise), the share of the smoke left as a veil between them, and the folds'
   * amplitude (× their wavelength: 2πA/λ ≈ 1.6, rolled over).
   */
  sheet: [0.04, 0.025, 0.1, 0.35] as const,
  sheetGrow: [0.5, 0.2, 0.85] as const,
  /** v1.6 polish 2: the billows of a developing plume and the swept first puff: size (scene units: 1.2 cm), mean, contrast. */
  billow: [0.06, 1.0, 2.6] as const,
  /** Light: Henyey–Greenstein asymmetry (forward), albedo, the key's share and the room's radiance (linear, before exposure). */
  g: 0.6,
  albedo: 0.92,
  key: 0.6,
  room: [0.6, 0.62, 0.66] as const,
  /** v1.6 polish 2: the room light's multiple scattering in thick smoke (× 1 − e^−τ). */
  roomOctaves: 0.7,
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
/** Floats staged per puff. */
const STAGE = 6;

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
// The density (optical depth per scene unit) at voxel coordinate v (voxel centres at i + 0.5), and
// (v1.6 polish 2) the density × its parcels' turbulence (0 a laminar stem – 1 folded sheets).
vec2 density2(vec3 v) {
  if (any(lessThan(v, vec3(0.0))) || any(greaterThan(v, uDims))) return vec2(0.0);
  float z = clamp(v.z - 0.5, 0.0, uDims.z - 1.0);
  float z0 = floor(z), fz = z - z0, z1 = min(z0 + 1.0, uDims.z - 1.0);
  vec2 xy = clamp(v.xy, vec2(0.5), uDims.xy - 0.5);
  vec2 t0 = vec2(mod(z0, TILES_X), floor(z0 / TILES_X)) * DIMS_MAX.xy;
  vec2 t1 = vec2(mod(z1, TILES_X), floor(z1 / TILES_X)) * DIMS_MAX.xy;
  return mix(texture2D(uDensity, (t0 + xy) / ATLAS).rg, texture2D(uDensity, (t1 + xy) / ATLAS).rg, fz);
}
float density(vec3 v) { return density2(v).x; }
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
flat varying float vTurb;
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
  vTurb = B.y;
}
`;

const SPLAT_FRAGMENT = /* glsl */ `
precision highp float;
flat varying vec4 vP;
flat varying float vMass;
flat varying float vTurb;
varying vec2 vXY;
flat varying float vZ;
void main() {
  vec3 d = vec3(vXY, vZ) - vP.xyz;
  float s2 = vP.w * vP.w;
  float q = dot(d, d) / s2;
  if (q > 6.25) discard;
  // A 3D Gaussian carrying vMass (τ·unit²) over its volume: optical depth per scene unit.
  // (v1.6 polish 2: lowered to reach exactly 0 at its 2.5 σ cut: the dense first puff showed the cut's
  // 4 % as a hard rounded edge.)
  float rho = vMass * max(exp(-0.5 * q) - 0.0439369, 0.0) * 1.0459562 / (15.7496 * s2 * vP.w * ${f(VOX * VOX * VOX * 1e6)} * 1e-6);
  gl_FragColor = vec4(rho, rho * vTurb, 0.0, 0.0);
}
`;

// ── The light volume (half the grid a side): to the key, to the room above, occupancy ──
const LIGHT_FRAGMENT = /* glsl */ `
precision highp float;
${ATLAS_GLSL}
uniform vec3 uKeyDir;
uniform float uWickY;
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
  // Occupancy: the densest of the 3 × 3 × 3 neighbourhood's corners (dilated: the march's probes never
  // step over a thread, and the march's warp, ≤ 1.5 cm, never reaches smoke outside it), and the
  // smoke's turbulence there (density-weighted; v1.6 polish 2): where the march folds it into sheets.
  vec2 sum = vec2(0.0);
  for (int n = 0; n < 27; n++) {
    vec3 o = vec3(float(n % 3), float((n / 3) % 3), float(n / 9)) - 1.0;
    vec2 d = density2(v + o * 2.5);
    occ = max(occ, d.x);
    sum += d;
  }
  // (With no smoke near, the turbulence of the height: nothing to fold there, but the warp stays continuous.)
  float h = (v.y * ${f(VOX)} + uBoxMin.y) - uWickY;
  float tb = (sum.y + 0.02 * smoothstep(0.2, 0.6, h)) / (sum.x + 0.02);
  gl_FragColor = vec4(tk, tu, occ, tb);
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
// v1.6 polish 2: the sheets: cell size (scene units at the wicks), thickness (field units), the veil between them, the folds' amplitude (× their wavelength).
uniform vec4 uSheet;
// ... and how their cells and thickness grow with height (per scene unit), and their cells' stretch along the rise.
uniform vec3 uSheetGrow;
// ... and the billows: their size (scene units), mean and contrast.
uniform vec3 uBillow;
varying vec3 vRoot;

float viewDistance(float dz) {
  float n = uNearFar.x, fa = uNearFar.y;
  return uOrtho ? n + dz * (fa - n) : -(n * fa) / ((fa - n) * dz - fa);
}
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
// The light volume at grid voxel coordinate v: optical depth to the key, to the room, occupancy.
vec4 lightAt(vec3 v) {
  vec3 ld = ceil(uDims * 0.5);
  vec3 w = v * 0.5;
  if (any(lessThan(w, vec3(0.0))) || any(greaterThan(w, ld))) return vec4(0.0);
  float z = clamp(w.z - 0.5, 0.0, ld.z - 1.0);
  float z0 = floor(z), fz = z - z0, z1 = min(z0 + 1.0, ld.z - 1.0);
  vec2 xy = clamp(w.xy, vec2(0.5), ld.xy - 0.5);
  vec2 t0 = vec2(mod(z0, LTILES_X), floor(z0 / LTILES_X)) * LDIMS_MAX.xy;
  vec2 t1 = vec2(mod(z1, LTILES_X), floor(z1 / LTILES_X)) * LDIMS_MAX.xy;
  return mix(texture2D(uLight, (t0 + xy) / LATLAS), texture2D(uLight, (t1 + xy) / LATLAS), fz);
}
// The sheets' level-set field at p (box space, scene units; v1.6 polish 2): a smooth noise carried up
// with the gas, its cells ls across and 1.4 × as tall (the rise stretches the mixing layer's
// surfaces into curtains); the smoke lies on its zero set.
float sheetField(vec3 p, float ls) {
  vec3 q = (p - vec3(0.012 * uTime, 0.8 * uTime, -0.009 * uTime)) * vec3(1.0, uSheetGrow.z, 1.0) / (4.0 * ls) + vec3(0.13, 0.71, 0.37);
  return texture(uNoise, q).b - 0.5;
}
// erf (Winitzki: within 2e-4).
float erfA(float x) {
  float x2 = x * x;
  return sign(x) * sqrt(1.0 - exp(-x2 * (1.27324 + 0.147 * x2) / (1.0 + 0.147 * x2)));
}
// The mean over a step of the sheet profile exp(−(φ/ε)²) with φ linear from f0 to f1 (exact for a
// sheet crossed between two samples: a thin sheet is never missed, nor stippled by the jitter).
float sheetStep(float f0, float f1, float e) {
  float d = f1 - f0;
  if (abs(d) < 1e-3 * e) return exp(-f0 * f0 / (e * e));
  return 0.886227 * e * (erfA(f1 / e) - erfA(f0 / e)) / d;
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
  // (v1.6 polish 2: a white-noise start, not interleaved gradient noise: the thin sheets made its
  // diagonal structure show as hatching where a step is long against them.)
  float t = a0 + dt * hash12(gl_FragCoord.xy);
  vec3 L = normalize(uKeyDir);
  float g = ${f(SMOKE_VOLUME.g)};
  // Henyey–Greenstein, × 4π (isotropic is 1): forward-peaked, so the smoke is faint front-lit.
  float phase = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * dot(L, rd), 1.5);
  vec3 C = vec3(0.0);
  float K = 0.0, T = 1.0;
  // The previous sample's sheet field (v1.6 polish 2), when it was evaluated.
  float phiPrev = 0.0, tbAcc = 0.0;
  bool havePrev = false;
  for (int i = 0; i < 64; i++) {
    if (i >= uSteps || T < 0.01) break;
    vec3 p = ro + rd * t;
    t += dt;
    vec3 v0 = (p - bmin) / ${f(VOX)};
    // The light volume here: optical depth to the key, to the room, occupancy (dilated 1.25 cm) and
    // the smoke's turbulence (v1.6 polish 2: carried by its parcels, 0 on a laminar stem, 1 a plume
    // fully folded; each plume turns at its own height, fire.ts smokeLaminar).
    vec4 lt = lightAt(v0);
    if (lt.b < 1e-3) { havePrev = false; continue; }
    float tb = clamp(lt.a, 0.0, 1.0);
    // Height above the wicks (scene units: 1 = 20 cm) sets the eddies' sizes. Once turbulent the
    // column meanders (wavelength 6–10 cm, ≈ ±1 cm at 10 cm, ±2 cm at 20 cm) and folds (eddies of 1.4
    // cm growing to 2.8 cm by 20 cm), both carried up with the gas, so the folds rise with it.
    float h = p.y - uWickY;
    float hc = clamp(h, 0.0, 1.5);
    float g1 = smoothstep(0.1, 0.5, tb), g2 = smoothstep(0.2, 0.6, tb);
    vec3 warp = vec3(0.0);
    if (g1 > 0.0) {
      float lam1 = 0.3 + 0.15 * hc;
      vec3 m = texture(uNoise, (p - vec3(0.015 * uTime, 0.55 * uTime, 0.0)) / (4.0 * lam1) + vec3(0.31, 0.0, 0.57)).rgb - 0.5;
      warp += vec3(m.x, 0.35 * m.z, m.y) * 2.0 * g1 * 0.1 * max(hc, 0.3);
      // The folds: past folding over (2πA/λ ≈ 1.6), so the sheets bend, roll and double, never tear.
      float lam2 = 0.07 + 0.07 * hc;
      vec3 q2 = (p + warp - vec3(0.02 * uTime, 0.75 * uTime, -0.015 * uTime)) / (4.0 * lam2);
      vec3 n = texture(uNoise, q2).rgb - 0.5;
      warp += n * 2.0 * g2 * uSheet.w * lam2;
    }
    vec3 v = (p + warp - bmin) / ${f(VOX)};
    float rho = density(v);
    if (rho < 1e-4) { havePrev = false; continue; }
    // Sheets (v1.6 polish 2): above its stem a candle plume is thin folded surfaces of smoke, crisp
    // where seen edge-on, a faint veil face-on (re-judge: the 5 mm grid alone drew it out of focus).
    // The grid holds where the smoke is; inside it the smoke lies on the zero set of an advected field
    // (cells uSheet.x growing with height), ε thick (uSheet.y, thickening as it rises and mixes), its
    // profile integrated exactly over each step; uSheet.z of it stays a veil between the sheets.
    // Billows (v1.6 polish 2): a developing plume and the breath's swept puff are rolled, not yet
    // combed into sheets: cauliflower lumps (the noise's Worley octaves, through the same folds) of a
    // centimetre or so, denser in the lumps and thinner between, so the dense first puff reads rolled.
    float kb = smoothstep(0.1, 0.45, tb) * (1.0 - smoothstep(0.55, 0.95, tb));
    if (kb > 0.0) {
      float wl = texture(uNoise, (p + warp - vec3(0.01 * uTime, 0.5 * uTime, 0.0)) / (4.0 * uBillow.x) + vec3(0.53, 0.29, 0.81)).a;
      rho *= mix(1.0, max(0.0, uBillow.y + uBillow.z * (wl - 0.5)), kb);
    }
    float sk = smoothstep(0.55, 0.95, tb);
    if (sk > 0.0) {
      float ls = uSheet.x * (1.0 + uSheetGrow.x * hc);
      float e = uSheet.y * (1.0 + uSheetGrow.y * hc);
      float phi = sheetField(p + warp, ls);
      if (!havePrev) phiPrev = sheetField(p - rd * dt + warp, ls);
      float sh = sheetStep(phiPrev, phi, e);
      phiPrev = phi;
      havePrev = true;
      // (Mass kept: the profile's mean over space is ≈ 6 ε, the field's spread being ≈ 0.115.)
      rho *= mix(1.0, uSheet.z + (1.0 - uSheet.z) * sh / (6.0 * e), sk);
    } else havePrev = false;
    // Single scattering of the key through the smoke's own shadow, and Wrenninge's octaves for the
    // light scattered more than once (less extinction, flatter phase): a dense puff stays grey-white
    // instead of going dark. The room lights it from every side, less what the smoke above hides.
    float od = lt.r;
    // (Only where the smoke is thick enough to scatter twice: thin smoke is single-scattering.)
    float ms = 1.0 - exp(-od);
    vec3 key = uKey * ${f(SMOKE_VOLUME.key)} * (phase * exp(-od) + ms * (0.5 * mix(phase, 1.0, 0.6) * exp(-0.3 * od) + 0.25 * exp(-0.1 * od)));
    // (v1.6 polish 2: and its octaves too where the smoke is thick: a dense puff takes in the room's
    // light from every side and gives most of it back, whiter than the greige wall, as a cloud does;
    // single scattering left the first puff no brighter than the wall's +20 levels.)
    vec3 room = uRoom * (0.6 + 0.4 * exp(-0.5 * lt.g)) * (1.0 + ${f(SMOKE_VOLUME.roomOctaves)} * ms);
    vec3 S = ${f(SMOKE_VOLUME.albedo)} * (key + room);
    float Ts = exp(-rho * dt);
    C += T * (1.0 - Ts) * S;
    tbAcc += T * (1.0 - Ts) * tb;
    K += T * (1.0 - Ts) * ${f(SMOKE_VOLUME.albedo)} * dot(key, vec3(0.2126, 0.7152, 0.0722));
    T *= Ts;
  }
  float alpha = 1.0 - T;
  float lum = dot(C, vec3(0.2126, 0.7152, 0.0722));
  if (uDebug == 1) lum = alpha;
  if (uDebug == 2) lum = alpha * 2.0 * tbAcc / max(alpha, 1e-4);
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

const smooth01 = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * v1.6 polish 2: the share of a parcel the ribbons draw (its thread's laminar stem and the filament
 * above it), by how far it has risen (m) against its plume's own transition `laminar` (m) and how far
 * it has been swept sideways off its stem (`path` − `rise`, m). The volume draws the rest (1 − this).
 */
export function ribbonShare(path: number, rise: number, laminar: number, born: number, width: number): number {
  const [keep, a0, a1, f0, f1] = SMOKE_VOLUME.filament, [r0, r1] = SMOKE_VOLUME.ribbon, [p0, p1, h0, h1] = SMOKE_VOLUME.puffHead, [w0, w1] = SMOKE_VOLUME.ribbonWidth;
  const dz = rise - laminar;
  const filament = (1 - (1 - keep) * smooth01(-a0, a1, dz)) * (1 - smooth01(f0, f1, dz));
  // The first vapour's head (the starting plume's thermal, 3–5 mm wide and bunched) is a puff, not
  // a filament: the volume draws it once it has left the wick (a strip drew it as a fan of hairlines).
  const puff = (1 - smooth01(p0, p1, born)) * smooth01(h0, h1, rise);
  // (And a strip draws only a thread: smoke wider than `ribbonWidth` m is the volume's, a strip that wide
  // drew a hard-edged marshmallow at the wick.)
  return filament * (1 - puff) * (1 - smooth01(r0, r1, path - rise)) * (1 - smooth01(w0, w1, width));
}

/**
 * v1.6 polish 2: how developed a parcel's turbulence is (0 a laminar stem – 1 folded sheets): above
 * its plume's transition; swept by the breath, half of it (the march rolls and folds it from 0.1 – 0.6
 * and draws sheets only over 0.55: a swept puff is rolled, not combed into strands).
 */
export function smokeTurbulence(path: number, rise: number, laminar: number, born: number): number {
  // (The vapour the breath met, born in its first 0.3–0.5 s, is mixed by its turbulent jet from a few
  // millimetres off the wick, however little it has been carried yet.)
  const swept = Math.max(smooth01(0.005, 0.03, path - rise), (1 - smooth01(0.3, 0.5, born)) * smooth01(0.002, 0.01, path));
  return Math.max(smooth01(laminar - 0.005, laminar + SMOKE_VOLUME.develop, rise), 0.5 * swept);
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
  /** Staging: x, y, z, σ, mass, turbulence per puff (the smoke parent's space). */
  private readonly staged = new Float32Array(SMOKE_PUFFS * STAGE);
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
    // (Two channels, the density and its turbulence: half the bandwidth of RGBA to clear, splat and read.)
    this.density.texture.format = RGFormat;
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
      uSheet: { value: new Vector4(...SMOKE_VOLUME.sheet) },
      uSheetGrow: { value: new Vector3(...SMOKE_VOLUME.sheetGrow) },
      uBillow: { value: new Vector3(...SMOKE_VOLUME.billow) },
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
      name: 'fx_smoke_light', uniforms: { uDensity: u.uDensity!, uBoxMin: u.uBoxMin!, uDims: u.uDims!, uKeyDir: u.uKeyDir!, uWickY: u.uWickY! }, vertexShader: FULLSCREEN_VERTEX, fragmentShader: LIGHT_FRAGMENT,
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
  addThread(st: SmokeThread, fadeAge: readonly [number, number], tail: number, laminar: number, since: number): void {
    const n = st.age.length;
    const P = st.position;
    this.wickY += P[1]!;
    this.wicks++;
    if (tail <= 0) return;
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
      // (Still the ribbon's: the laminar stem, below its transition and not swept.)
      if (rate <= 0 || db <= 0 || ribbonShare(s1, Math.max(st.rise[k]!, st.rise[k + 1]!), laminar, since - st.age[k + 1]!, Math.min(st.full[k]!, st.full[k + 1]!)) >= 1) continue;
      const mass = SMOKE_VOLUME.mass * rate * db * ((globalThis as { __smokeMass?: number }).__smokeMass ?? 1);
      const sig = (j: number) => Math.min(SIGMA_MAX, Math.max(SIGMA_MIN, (Math.max(SMOKE_VOLUME.width(st.rise[j]!), st.full[j]!) / 2.355) * UNITS));
      const sa = sig(k), sb = sig(k + 1);
      const m = Math.max(1, Math.min(32, Math.ceil(len / (1.2 * Math.min(sa, sb)))));
      for (let j = 0; j < m; j++) {
        const u = (j + 0.5) / m;
        const age = st.age[k]! + db * u;
        // The wax aerosol evaporates as the plume mixes with the room's air: the visible smoke thins
        // with height on top of its spreading (e-folding SMOKE_VOLUME.evaporate above 4 cm), so the
        // merged veil is a few hundredths of optical depth, barely visible over the light wall.
        const rise = st.rise[k]! + (st.rise[k + 1]! - st.rise[k]!) * u;
        const sp = s0 + (s1 - s0) * u;
        // (v1.6 polish 2: from its own plume's transition: a stem that stays laminar to 12 cm has not mixed below it.)
        const w = (1 - ribbonShare(sp, rise, laminar, since - age, st.full[k]! + (st.full[k + 1]! - st.full[k]!) * u)) * (1 - smoothstep(fadeAge[0], fadeAge[1], age)) * tail * Math.exp(-Math.max(0, rise - Math.max(0.04, laminar)) / SMOKE_VOLUME.evaporate);
        const pm = (mass / m) * w;
        const s = sa + (sb - sa) * u;
        // Below what a screen could show (its peak optical depth across under 10⁻⁴): not drawn.
        if (pm / (6.283 * s * s) < 1e-4) continue;
        if (this.count >= SMOKE_PUFFS) { this.dropped++; continue; }
        const o = this.count++ * STAGE;
        const S = this.staged;
        S[o] = ax + (bx - ax) * u; S[o + 1] = ay + (by - ay) * u; S[o + 2] = az + (bz - az) * u; S[o + 3] = s; S[o + 4] = pm;
        S[o + 5] = smokeTurbulence(sp, rise, laminar, since - age);
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
      const o = i * STAGE, r = 2.5 * S[o + 3]!, m = S[o + 4]!;
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
      const o = i * STAGE;
      A[i * 4] = S[o]! - x0; A[i * 4 + 1] = S[o + 1]! - y0; A[i * 4 + 2] = S[o + 2]! - z0; A[i * 4 + 3] = S[o + 3]!;
      B[i * 4] = S[o + 4]!; B[i * 4 + 1] = S[o + 5]!;
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
    const skip = (globalThis as { __smokeSkip?: string }).__smokeSkip ?? '';
    // 1. Splat.
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(this.density);
    if (!skip.includes('splat')) {
      renderer.clear(true, false, false);
      renderer.render(this.splatScene, this.fsCamera);
    }
    // 2. The light volume.
    this.fsMesh.material = this.lightMaterial;
    renderer.setRenderTarget(this.light);
    if (!skip.includes('light')) renderer.render(this.fsScene, this.fsCamera);
    // 3. The march, at half the drawing buffer's resolution (capped).
    const scale = Math.min(0.5, Math.sqrt(SMOKE_VOLUME.marchPixels / Math.max(1, frame.size.x * frame.size.y)));
    const w = Math.max(1, Math.ceil(frame.size.x * scale)), h = Math.max(1, Math.ceil(frame.size.y * scale));
    (u.uScale!.value as Vector2).set(w / frame.size.x, h / frame.size.y);
    if (this.half.width !== w || this.half.height !== h) this.half.setSize(w, h);
    renderer.setClearColor(TMP_C.setRGB(0, 0, 1e4), 0);
    renderer.setRenderTarget(this.half);
    renderer.clear(true, false, false);
    if (!skip.includes('march')) renderer.render(this.marchScene, camera);
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
