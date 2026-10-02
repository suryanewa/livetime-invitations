import {
  BufferGeometry,
  type Camera,
  Color,
  DataTexture,
  Euler,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  LinearFilter,
  Matrix4,
  Mesh,
  NormalBlending,
  type Object3D,
  PlaneGeometry,
  RepeatWrapping,
  RGFormat,
  ShaderMaterial,
  UnsignedByteType,
  Vector3,
} from 'three';
import { COVER_PROFILE, PLATE_PROFILE } from './dinnerContract.ts';
import { PLUME, type Plume, type Puff, STEAM_TIME } from '../src/scenes/dinner/steam.ts';
import { REVEAL_DIR } from '../src/scenes/dinner/sequences.ts';

/**
 * Dinner v1.5 steam (plan: src/scenes/dinner/steam.ts), two instanced draws evaluated in closed
 * form at the steam clock `uTime`, so the GPU does all of it and the CPU sets a few uniforms:
 *  - Puffs (spill, release, pocket, trail): camera-facing soft billboards. The vertex shader
 *    places each at its age (CPU mirror `puffAt`); the fragment shader slices a domain-warped 3D
 *    noise field through it (attached to the puff, so it billows, churns and frays into wisps as
 *    it ages; its outline is the field's, never the quad's circle).
 *  - Plumes (the column): ribbons up from the plate, as wide as the camera's horizontal, along a
 *    meandering centreline (CPU mirror `plumeCenter`); the fragment shader draws the thin
 *    strands a rising sheet of vapour folds into, carried up with it (`plumeDensity`).
 * Both fade analytically against the plate, the table and the cloche (no depth texture: the
 * surfaces are known in closed form, so no edge shows where a billboard crosses them, and
 * nothing draws inside the dome, which hides its inside from this camera anyway).
 *
 * Shading. Steam is droplets in air, an optically thin, nearly white scatterer: it adds the
 * room's in-scattered light and veils what is behind it by the same fraction. Under the
 * neutral-room rig it reads brighter than the dark strokes in the silver, a little lighter than
 * the greige cove and about level with the lit porcelain: bright against dark, nearly invisible
 * against light, as real steam is when it is not backlit. The dome's shadow shades it as it
 * shades the plate. `STEAM_LOOK.color` is that in-scattered radiance (linear, before exposure).
 */

export const STEAM_LOOK = {
  /** In-scattered radiance of the steam (linear, the rig's exposure and tone mapping follow). */
  color: new Color(0.94, 0.95, 0.97),
  /** Lit from above (skylight, ceiling) a little more than from below. */
  topLight: 0.12,
  /**
   * Share of the light that is the room's (the rest is the shadow-casting key): in the dome's
   * shadow the steam keeps only this, as the plate does (measured: the porcelain in the lifting
   * dome's shadow is 0.77 of its lit value, sRGB 210 against 235, linear).
   */
  ambient: 0.77,
  /** Soft contact distances (su): the plate and table, the cloche's shell. */
  softFloor: 0.03,
  softCover: 0.02,
} as const;

/** GLSL piecewise-linear lookup over [x, y] pairs (inlined constants). */
function glslProfile(name: string, pts: readonly (readonly [number, number])[]): string {
  const lines = [`float ${name}(float x) {`, `  if (x <= ${pts[0]![0].toFixed(4)}) return ${pts[0]![1].toFixed(4)};`];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]!, [x1, y1] = pts[i]!;
    if (x1 === x0) continue;
    lines.push(`  if (x <= ${x1.toFixed(4)}) return mix(${y0.toFixed(4)}, ${y1.toFixed(4)}, (x - ${x0.toFixed(4)}) / ${(x1 - x0).toFixed(4)});`);
  }
  lines.push(`  return ${pts[pts.length - 1]![1].toFixed(4)};`, '}');
  return lines.join('\n');
}

// The plate's top surface (r → y; an upper bound of the master's, so the soft contact always
// fades out above the porcelain) and the dome's outer radius by height.
const PLATE_LINE = PLATE_PROFILE;
const DOME_BY_HEIGHT = COVER_PROFILE.map(([r, y]) => [y, r] as const);

/**
 * 3D value noise from one 256² RG texture (Inigo Quilez's layered lookup: green is red shifted by
 * (37, 17), the step between z layers), so one fetch per octave instead of a simplex's ~60 ALU.
 * Deterministic (seeded), built once per scene.
 */
const NOISE = /* glsl */ `
uniform sampler2D uNoise;
float vnoise(vec3 x) {
  vec3 p = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  vec2 uv = (p.xy + vec2(37.0, 17.0) * p.z) + f.xy;
  vec2 rg = textureLod(uNoise, (uv + 0.5) / 256.0, 0.0).yx;
  return mix(rg.x, rg.y, f.z);
}
/** Signed, about the range of a simplex noise. */
float snoise(vec3 x) { return vnoise(x) * 2.0 - 1.0; }
/** A rotation between octaves and lookups: hides the value noise's lattice. */
const mat3 ROT = mat3(0.00, 0.80, 0.60, -0.80, 0.36, -0.48, -0.60, -0.48, 0.64);
`;

function noiseTexture(): DataTexture {
  let a = 0x51ea_d0e5 >>> 0;
  const rnd = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const N = 256, red = new Uint8Array(N * N), data = new Uint8Array(N * N * 2);
  for (let i = 0; i < red.length; i++) red[i] = Math.floor(rnd() * 256);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      data[(y * N + x) * 2] = red[y * N + x]!;
      data[(y * N + x) * 2 + 1] = red[((y - 17 + N) % N) * N + ((x - 37 + N) % N)]!;
    }
  }
  const t = new DataTexture(data, N, N, RGFormat, UnsignedByteType);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.magFilter = t.minFilter = LinearFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

const PUFF_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uEmitEnd;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
attribute vec4 iSpawn;  // spawn position, t0
attribute vec4 iVel;    // emission velocity, life
attribute vec4 iShape;  // rise W, wisp, size, grow
attribute vec4 iLook;   // peak, seed, sway, curl
attribute vec4 iCurl;   // outward x, outward z, curl rate, stretch
varying vec2 vCorner;
varying vec3 vPos;
varying vec3 vLocal;
varying float vOpacity;
varying float vErode;
varying float vWisp;
varying float vSeed;
varying float vAge;

const float TD = ${STEAM_TIME.drag.toFixed(4)};
const float TB = ${STEAM_TIME.accel.toFixed(4)};
const float TM = ${STEAM_TIME.mix.toFixed(4)};
const float TCURL = ${STEAM_TIME.curl.toFixed(4)};
const float TIN = ${STEAM_TIME.fadeIn.toFixed(4)};

void main() {
  float age = uTime - iSpawn.w;
  float life = iVel.w;
  if (age < 0.0 || age > life || iSpawn.w > uEmitEnd) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    return;
  }
  vec3 c = iSpawn.xyz + iVel.xyz * TD * (1.0 - exp(-age / TD));
  float rise = iShape.x / (1.0 - TB / TM) * (TM * (1.0 - exp(-age / TM)) - TB * (1.0 - exp(-age / TB)));
  c.y += rise;
  if (iLook.w > 0.0) {
    float th = iCurl.z * TCURL * (1.0 - exp(-age / TCURL));
    c.xz += vec2(iCurl.x, iCurl.y) * iLook.w * sin(th);
    c.y += iLook.w * (1.0 - cos(th));
  }
  float amp = iLook.z * rise;
  float seed = iLook.y;
  float h1 = fract(seed * 0.137), h2 = fract(seed * 0.291), h3 = fract(seed * 0.533);
  c.x += amp * (sin((2.1 + 1.6 * h1) * age + 6.283 * h2) + 0.5 * sin((4.3 + 2.0 * h3) * age + 6.283 * h1));
  c.z += amp * (sin((1.9 + 1.4 * h3) * age + 6.283 * h1) + 0.5 * sin((3.7 + 2.2 * h2) * age + 6.283 * h3));
  float radius = iShape.z + iShape.w * age;
  vOpacity = iLook.x * smoothstep(0.0, TIN, age) * (1.0 - smoothstep(0.2 * life, life, age)) * pow(iShape.z / radius, 0.8);
  vErode = smoothstep(0.0, life, age);
  vWisp = iShape.y;
  vSeed = seed;
  vAge = age;
  vCorner = position.xy;
  // Drawn out along the rise: the quad (and the field sampled through it) is iCurl.w times taller.
  vLocal = uCamRight * position.x + uCamUp * position.y;
  vPos = c + (uCamRight * position.x + uCamUp * position.y * iCurl.w) * radius;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(vPos, 1.0);
}
`;

/** Shared fragment code: uniforms, noise, the soft contact with plate/table/cloche, the light. */
const SURFACES = /* glsl */ `
uniform float uTime;
uniform float uFade;
uniform bool uLow;
uniform vec3 uColor;
uniform float uTopLight;
uniform float uAmbient;
uniform vec3 uKeyDir;
uniform mat4 uCoverInv;
uniform vec3 uPlate;
${NOISE}
${glslProfile('plateTop', PLATE_LINE)}
${glslProfile('domeRadius', DOME_BY_HEIGHT)}

/**
 * Soft contact (0 at a surface, 1 a few mm off it) with the plate, the table and the cloche's
 * shell; -1 inside the dome (hidden by its shell: drop the fragment).
 */
float contact(vec3 p) {
  vec3 pp = p - uPlate;
  float rp = length(pp.xz);
  float surface = rp < 0.8 && pp.y < 0.2 ? plateTop(rp) : 0.0;
  float k = smoothstep(0.0, ${STEAM_LOOK.softFloor.toFixed(3)}, pp.y - surface) * smoothstep(0.0, ${STEAM_LOOK.softFloor.toFixed(3)}, p.y);
  vec3 cv = (uCoverInv * vec4(p, 1.0)).xyz;
  float rc = length(cv.xz);
  if (cv.y > -0.06 && cv.y < 0.7 && rc < 0.75) {
    float shell = 1e3;
    if (cv.y >= 0.0 && cv.y <= 0.6333) {
      float R = domeRadius(cv.y);
      if (rc <= R) return -1.0;
      shell = rc - R;
    } else if (cv.y > 0.6333) {
      // Above the crown: distance to the crown's cap (its flat top, ≈ r 0.17).
      shell = length(vec2(max(rc - 0.17, 0.0), cv.y - 0.6333));
    }
    // The lip bead (a torus round the rim).
    float bead = length(vec2(rc - 0.648, cv.y - 0.011)) - 0.012;
    k *= smoothstep(0.0, ${STEAM_LOOK.softCover.toFixed(3)}, min(shell, bead));
  }
  return k;
}

/**
 * In-scattered light at p: the room's share plus the window key, which the dome shades (steam
 * under and behind the lifted cloche is in its shadow, as the plate is). The dome is taken as
 * its ellipsoid (radii 0.655, 0.645) with a soft penumbra; its open underside casts nothing.
 * \`up\` in [-1, 1]: where in the wisp (lit a little more from above: ceiling, skylight).
 */
vec3 steamLight(vec3 p, float up) {
  vec3 cv = (uCoverInv * vec4(p, 1.0)).xyz;
  vec3 sc = vec3(1.0 / 0.655, 1.0 / 0.645, 1.0 / 0.655);
  vec3 o = cv * sc;
  vec3 kd = normalize(mat3(uCoverInv) * uKeyDir * sc);
  float along = -dot(o, kd);
  vec3 near = o + kd * along;
  float lit = along > 0.0 && near.y > -0.05 ? smoothstep(0.82, 1.12, length(near)) : 1.0;
  float top = 1.0 - uTopLight + 2.0 * uTopLight * clamp(0.5 + 0.5 * up, 0.0, 1.0);
  return uColor * top * (uAmbient + (1.0 - uAmbient) * lit);
}
`;

const PUFF_FRAGMENT = /* glsl */ `
${SURFACES}
varying vec2 vCorner;
varying vec3 vPos;
varying vec3 vLocal;
varying float vOpacity;
varying float vErode;
varying float vWisp;
varying float vSeed;
varying float vAge;

void main() {
  float r2 = dot(vCorner, vCorner);
  if (r2 >= 1.0 || vOpacity <= 0.0) discard;
  if (vOpacity * uFade < 0.003) discard;
  // The puff's body: a 3D field attached to it (it moves and grows with the puff), stretched
  // along the rise, domain-warped so it curls and churning as it goes. Soft throughout: steam has
  // no edge, only density falling away. The envelope's outline is warped by the same field, so
  // no puff reads as a disc, even over the dark silver or the bin.
  vec3 q = vLocal * 1.5 + vec3(vSeed, vSeed * 0.71, vSeed * 1.37) + vec3(0.0, -0.9 * vAge, 0.3 * vAge);
  vec2 w = vec2(snoise(q * 0.9 + 3.1), snoise(q * 0.9 + 7.7));
  vec3 qw = q + 0.6 * vec3(w.x, w.y, 0.5 * w.x);
  // The envelope: a Gaussian on a radius warped by the field (so its outline is the field's, and
  // stacked puffs never print rings), shrinking as it evaporates (from the edges in), and zero
  // well inside the quad's circle.
  vec2 rw = vCorner + 0.55 * w;
  float env = exp(-dot(rw, rw) * (2.6 + 2.6 * vErode)) * (1.0 - smoothstep(0.6, 1.0, sqrt(r2)));
  // (Low tier: one octave and no filaments, half the lookups.)
  float n = 0.5 + 0.5 * (uLow ? 0.85 * snoise(ROT * qw) : 0.7 * snoise(ROT * qw) + 0.3 * snoise(ROT * (ROT * qw) * 2.3 + 5.3));
  // Filaments: thin sheets drawn out along the rise, in world space so they run on from puff to
  // puff, drifting up and bent by the same warp. A sheet (the spill) is mostly filament from
  // birth; a billow frays into them as it evaporates.
  vec3 wq = vPos * vec3(3.4, 1.3, 3.4) + vec3(0.0, -uTime * 0.6, 0.0) + 0.45 * w.x;
  float sn = uLow ? 0.0 : snoise(ROT * wq);
  float sheet = 1.0 - sn * sn;
  float dens = env * n * n * 1.7 * mix(1.0, 0.25 + 0.95 * sheet * sheet, max(vWisp, vErode));
  // Evaporation thins it from its faint parts first, then it is gone.
  float d = clamp((dens - 0.3 * vErode) / (1.0 - 0.3 * vErode), 0.0, 1.0);
  float k = contact(vPos);
  if (k < 0.0) discard;
  float a = d * k * vOpacity * uFade;
  if (a < 0.002) discard;
  gl_FragColor = vec4(steamLight(vPos, vLocal.y), 1.0);
  // Tone mapped and encoded like the scene, then premultiplied by the coverage.
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor = vec4(gl_FragColor.rgb * a, a);
}
`;

/** A plume's ribbon is this many times the sheet's half-width, so the sheet can wander in it. */
const PLUME_ROOM = 2.2;

const PLUME_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uEmitEnd;
uniform vec3 uCamRight;
attribute vec4 iBase;   // base point on the plate, source start t0
attribute vec4 iFlow;   // rise (su/s), decay (s), strength, seed
attribute vec4 iWidth;  // half-width at the base, spread per su, sway per su, flap direction (angle)
attribute vec4 iDirs;   // meander directions (x, z) × 2
varying vec2 vRib;      // across (−1..1), height along the plume (su)
varying vec3 vPos;
varying float vDensity;
varying float vSeed;
varying float vWidth;
varying float vRise;

const float LENGTH = ${PLUME.length.toFixed(4)};
const float ROOM = ${PLUME_ROOM.toFixed(2)};
const float RAMP = ${PLUME.ramp.toFixed(4)};
const float TOP = ${PLUME.top.toFixed(4)};
const float BASE = ${PLUME.base.toFixed(4)};
const float FLAP = ${PLUME.flap.toFixed(4)};
const float FLAP_W = ${(2 * Math.PI * PLUME.flapHz).toFixed(5)};
const float EVAPORATE = ${PLUME.evaporate.toFixed(4)};
const float K1 = ${(2 * Math.PI / PLUME.wave1).toFixed(5)};
const float K2 = ${(2 * Math.PI / PLUME.wave2).toFixed(5)};

vec3 centre(float h, float seed) {
  float amp = iWidth.z * pow(max(h, 0.0), 1.2);
  float s = h - iFlow.x * uTime;
  vec3 c = iBase.xyz + vec3(0.0, h, 0.0);
  // The dome's wake leans the young column along the reveal's path (plumeDrift).
  float drift = ${PLUME.drift.toFixed(4)} * exp(-max(0.0, uTime - 0.5) / ${PLUME.driftDecay.toFixed(4)}) * smoothstep(0.25, 0.5, uTime);
  c.xz += vec2(${REVEAL_DIR.x.toFixed(5)}, ${REVEAL_DIR.z.toFixed(5)}) * drift * h;
  c.xz += iDirs.xy * amp * sin(K1 * s + seed);
  c.xz += iDirs.zw * ${PLUME.wave2Share.toFixed(3)} * amp * sin(K2 * s + 1.7 * seed);
  // The whole plume flaps side to side (not carried up: the draught moves it, not the vapour).
  c.xz += vec2(cos(iWidth.w), sin(iWidth.w)) * FLAP * h * sin(FLAP_W * uTime + seed + 1.5 * h);
  return c;
}

float source(float t) {
  float a = t - iBase.w;
  if (a <= 0.0 || iBase.w > uEmitEnd) return 0.0;
  return smoothstep(0.0, RAMP, a) * exp(-max(0.0, a - RAMP) / iFlow.y);
}

void main() {
  float h = position.y * LENGTH;
  float seed = iFlow.w;
  float w = iWidth.x + iWidth.y * h;
  // What is at height h left the plate h / rise ago; it forms a little off the surface, thins as
  // it evaporates and widens, and is gone by the ribbon's top (plumeDensity).
  vDensity = iFlow.z * source(uTime - h / iFlow.x) * smoothstep(0.0, BASE, h) * exp(-h / EVAPORATE) * sqrt(iWidth.x / w) * (1.0 - smoothstep(LENGTH - TOP, LENGTH, h));
  // Across is the camera's horizontal: the sheet shears with its meander but never twists or
  // folds over itself (a tangent-built frame flips where the path swings).
  vPos = centre(h, seed) + uCamRight * position.x * w * ROOM;
  vRib = vec2(position.x, h);
  vSeed = seed;
  vWidth = w;
  vRise = iFlow.x;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(vPos, 1.0);
}
`;

const PLUME_FRAGMENT = /* glsl */ `
${SURFACES}
const float ROOM = ${PLUME_ROOM.toFixed(2)};
varying vec2 vRib;
varying vec3 vPos;
varying float vDensity;
varying float vSeed;
varying float vWidth;
varying float vRise;

void main() {
  if (vDensity <= 0.0005) discard;
  float u = vRib.x * ROOM, h = vRib.y;
  // The sheet in the frame of the rising vapour (s = h − rise·τ), seen as the thin strands it
  // folds into: each wanders and curls side to side along its height (laminar for the first few
  // centimetres, freer above, a second strand peeling off the first), and the pattern itself
  // churns as it rises (it is not a texture sliding up). The strands widen by diffusion and break
  // into wisps as the vapour evaporates. Units across are the sheet's half-width; the ribbon is
  // ROOM× wider so the wandering strands never meet its edges.
  float s = h - vRise * uTime;
  float free = smoothstep(0.0, 0.25, h);
  float c1 = (0.85 * snoise(vec3(s * 2.6, vSeed, 0.9 * uTime)) + (uLow ? 0.0 : 0.35 * snoise(vec3(s * 5.5, vSeed + 3.0, 1.3 * uTime)))) * free * (1.0 + 0.6 * h);
  float c2 = c1 + 0.9 * snoise(vec3(s * 2.0, vSeed + 5.0, 0.8 * uTime)) * free;
  float sig = 0.3 + 0.35 * h;
  float a1 = (u - c1) / sig, a2 = (u - c2) / (1.25 * sig);
  float strands = max(exp(-a1 * a1), 0.7 * exp(-a2 * a2));
  float breakup = 0.5 + 0.5 * snoise(vec3(u * 1.2, s * 4.0, vSeed + 9.0 + 0.8 * uTime));
  float d = strands * mix(1.0, smoothstep(0.1, 0.8, breakup), 0.85 * smoothstep(0.15, 0.9, h));
  d *= smoothstep(ROOM, 0.8 * ROOM, abs(u));
  float k = contact(vPos);
  if (k < 0.0) discard;
  float a = min(d * k * vDensity * uFade, 0.85);
  if (a < 0.002) discard;
  gl_FragColor = vec4(steamLight(vPos, 0.3), 1.0);
  // Tone mapped and encoded like the scene, then premultiplied by the coverage.
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor = vec4(gl_FragColor.rgb * a, a);
}
`;

const EULER = new Euler();

/** The scene's shadow-casting key light (spot or directional), or null. */
function findKey(scene: Object3D): Object3D | null {
  let key: Object3D | null = null;
  scene.traverse((o) => {
    const l = o as Object3D & { isSpotLight?: boolean; isDirectionalLight?: boolean };
    if (!key && (l.isSpotLight || l.isDirectionalLight)) key = o;
  });
  return key;
}

/** A ribbon of `segments` rows: x across (−1..1), y along (0..1). */
function stripGeometry(segments: number): BufferGeometry {
  const g = new BufferGeometry();
  const pos: number[] = [], index: number[] = [];
  for (let i = 0; i <= segments; i++) pos.push(-1, i / segments, 0, 1, i / segments, 0);
  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setIndex(index);
  return g;
}

function instanced(base: BufferGeometry, attributes: Record<string, Float32Array>, count: number): InstancedBufferGeometry {
  const g = new InstancedBufferGeometry();
  g.index = base.index;
  g.setAttribute('position', base.getAttribute('position'));
  for (const [name, data] of Object.entries(attributes)) g.setAttribute(name, new InstancedBufferAttribute(data, 4));
  g.instanceCount = count;
  return g;
}

/**
 * The reveal's steam: the puffs (spill, release, pocket, trail) and the column's plumes, two
 * instanced draws under one group, both evaluated in closed form at the steam clock.
 */
export class DinnerSteam {
  readonly object = new Group();
  private readonly puffs: Mesh<InstancedBufferGeometry, ShaderMaterial>;
  private readonly plumes: Mesh<InstancedBufferGeometry, ShaderMaterial>;
  private readonly materials: ShaderMaterial[];
  private readonly coverInv = new Matrix4();
  /** The rig's shadow-casting key (undefined: not looked for yet; null: the rig has none). */
  private key: Object3D | null | undefined = undefined;
  private readonly noise: DataTexture;

  constructor(puffs: readonly Puff[], plumes: readonly Plume[]) {
    this.object.name = 'fx_steam';
    this.object.visible = false;
    // Shared uniforms (one object per uniform, so both materials see every update).
    this.noise = noiseTexture();
    const shared = {
      uNoise: { value: this.noise },
      uLow: { value: false },
      uTime: { value: 0 },
      uEmitEnd: { value: Infinity },
      uFade: { value: 1 },
      uColor: { value: STEAM_LOOK.color.clone() },
      uTopLight: { value: STEAM_LOOK.topLight },
      uAmbient: { value: STEAM_LOOK.ambient },
      uKeyDir: { value: new Vector3(-0.36, 0.643, 0.676).normalize() },
      uCoverInv: { value: new Matrix4() },
      uPlate: { value: new Vector3() },
      uCamRight: { value: new Vector3(1, 0, 0) },
      uCamUp: { value: new Vector3(0, 1, 0) },
    };
    this.shared = shared;
    const material = (name: string, vertexShader: string, fragmentShader: string) => new ShaderMaterial({
      name, uniforms: shared, vertexShader, fragmentShader, transparent: true, depthWrite: false, blending: NormalBlending, premultipliedAlpha: true,
    });

    const quad = new PlaneGeometry(2, 2);
    const n = puffs.length;
    const spawn = new Float32Array(n * 4), vel = new Float32Array(n * 4), shape = new Float32Array(n * 4), look = new Float32Array(n * 4), curl = new Float32Array(n * 4);
    puffs.forEach((p, i) => {
      spawn.set([p.pos.x, p.pos.y, p.pos.z, p.t0], i * 4);
      vel.set([p.vel.x, p.vel.y, p.vel.z, p.life], i * 4);
      shape.set([p.rise, p.wisp, p.size, p.grow], i * 4);
      look.set([p.peak, p.seed, p.sway, p.curl], i * 4);
      curl.set([p.out.x, p.out.z, p.curlRate, p.stretch], i * 4);
    });
    this.puffs = new Mesh(instanced(quad, { iSpawn: spawn, iVel: vel, iShape: shape, iLook: look, iCurl: curl }, n), material('fx_steam_puff', PUFF_VERTEX, PUFF_FRAGMENT));
    quad.dispose();

    const strip = stripGeometry(48);
    const m = plumes.length;
    const base = new Float32Array(m * 4), flow = new Float32Array(m * 4), width = new Float32Array(m * 4), dirs = new Float32Array(m * 4);
    plumes.forEach((p, i) => {
      base.set([p.base.x, p.base.y, p.base.z, p.t0], i * 4);
      flow.set([p.rise, p.decay, p.strength, p.seed], i * 4);
      width.set([p.width, p.spread, p.sway, Math.atan2(p.dir3.z, p.dir3.x)], i * 4);
      dirs.set([p.dir1.x, p.dir1.z, p.dir2.x, p.dir2.z], i * 4);
    });
    this.plumes = new Mesh(instanced(strip, { iBase: base, iFlow: flow, iWidth: width, iDirs: dirs }, m), material('fx_steam_plume', PLUME_VERTEX, PLUME_FRAGMENT));
    strip.dispose();

    this.materials = [this.puffs.material, this.plumes.material];
    for (const [mesh, order] of [[this.plumes, 5], [this.puffs, 6]] as const) {
      mesh.frustumCulled = false;
      mesh.renderOrder = order;
      mesh.userData.noShadowCast = true;
      this.object.add(mesh);
    }
    // Camera-facing in the scene's own space (the root carries the world scale), and the rig's
    // shadow-casting key's direction, once per frame (the first of the two draws).
    const toScene = new Matrix4(), cam = new Matrix4();
    const lp = new Vector3(), cp = new Vector3();
    this.plumes.onBeforeRender = (_r, scene: Object3D, camera: Camera) => {
      const parent = this.object.parent;
      if (!parent) return;
      toScene.copy(parent.matrixWorld).invert();
      cam.multiplyMatrices(toScene, camera.matrixWorld);
      shared.uCamRight.value.setFromMatrixColumn(cam, 0).normalize();
      shared.uCamUp.value.setFromMatrixColumn(cam, 1).normalize();
      if (this.key === undefined || (this.key && !this.key.parent)) this.key = findKey(scene);
      if (this.key) {
        lp.setFromMatrixPosition(this.key.matrixWorld).applyMatrix4(toScene);
        cp.setFromMatrixPosition(parent.matrixWorld).applyMatrix4(toScene);
        shared.uKeyDir.value.copy(lp).sub(cp).normalize();
      }
    };
  }

  private readonly shared: {
    uLow: { value: boolean };
    uTime: { value: number }; uEmitEnd: { value: number }; uFade: { value: number };
    uCoverInv: { value: Matrix4 }; uPlate: { value: Vector3 };
    uCamRight: { value: Vector3 }; uCamUp: { value: Vector3 }; uKeyDir: { value: Vector3 };
  };

  /**
   * Show the steam at steam time τ. `emitEnd`: nothing released after it shows (a change of mind
   * stops the release); `fade`: overall multiplier (1 normally). Hidden when `tau` is null.
   */
  update(tau: number | null, emitEnd = Infinity, fade = 1): void {
    this.object.visible = tau !== null && fade > 0;
    this.shared.uTime.value = tau ?? 0;
    this.shared.uEmitEnd.value = emitEnd;
    this.shared.uFade.value = fade;
  }

  /** The cloche's pose (scene space: position and its tilt) and the plate's, for the soft contact. */
  setSurfaces(coverPos: Vector3, tiltX: number, tiltZ: number, platePos: Vector3): void {
    this.coverInv.makeRotationFromEuler(EULER.set(tiltX, 0, tiltZ)).setPosition(coverPos).invert();
    this.shared.uCoverInv.value.copy(this.coverInv);
    this.shared.uPlate.value.copy(platePos);
  }

  /** Low tier: one noise octave and no filaments (about half the texture lookups). */
  setLowDetail(enabled: boolean): void {
    this.shared.uLow.value = enabled;
  }

  /** Show both draws for a shader warm-up (the next update restores visibility). */
  showForCompile(): void {
    this.object.visible = true;
  }

  dispose(): void {
    this.puffs.geometry.dispose();
    this.plumes.geometry.dispose();
    for (const m of this.materials) m.dispose();
    this.noise.dispose();
    this.object.removeFromParent();
  }
}
