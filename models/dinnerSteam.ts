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
  AddEquation,
  CustomBlending,
  OneFactor,
  OneMinusSrcColorFactor,
  ZeroFactor,
  type Object3D,
  PlaneGeometry,
  RepeatWrapping,
  RGFormat,
  ShaderMaterial,
  UnsignedByteType,
  Vector3,
  Vector4,
} from 'three';
import { COVER_PROFILE, DINNER_BIN, PLATE_PROFILE } from './dinnerContract.ts';
import { PLUME, type Plume, type Puff, STEAM_TIME } from '../src/scenes/dinner/steam.ts';
import { REVEAL_DIR } from '../src/scenes/dinner/sequences.ts';

/**
 * Dinner v1.5 steam (plan: src/scenes/dinner/steam.ts), two instanced draws evaluated in closed
 * form at the steam clock `uTime`, so the GPU does all of it and the CPU sets a few uniforms:
 *  - Puffs (spill, release, pocket, trail, landing): camera-facing soft billboards. The vertex shader
 *    places each at its age (CPU mirror `puffAt`); the fragment shader slices a domain-warped 3D
 *    noise field through it (attached to the puff, so it billows, churns and frays into wisps as
 *    it ages; its outline is the field's, never the quad's circle).
 *  - Plumes (the column): ribbons up from the plate, as wide as the camera's horizontal, along a
 *    meandering centreline (CPU mirror `plumeCenter`); the fragment shader draws the broad sheet
 *    of vapour breaking into irregular wisps as it rises, carried up with it and churning
 *    (`plumeDensity`). Every term is continuous: a step anywhere prints a line across steam.
 * Both fade analytically against the plate, the table and the cloche (no depth texture: the
 * surfaces are known in closed form, so no edge shows where a billboard crosses them, and
 * nothing draws inside the dome, which hides its inside from this camera anyway).
 * Up to STEAM_LAYERS clocks draw at once: the reveal's, and steam a change of mind left behind
 * rising on and dispersing on its own (the same draws again with their own clock uniforms).
 *
 * Shading. Steam is droplets in air, an optically thin, nearly white scatterer: it adds the
 * room's in-scattered light and veils what is behind it by the same fraction. It is composited
 * with a screen blend (out = c + dst·(1 − c)), so it can only lighten: over the dark silver and
 * the cove it reads as white mist, over the lit porcelain it all but vanishes, as real steam does
 * when it is not backlit, and it never greys anything. The dome's shadow dims it a little.
 * `STEAM_LOOK.color` is that in-scattered radiance (linear, before exposure).
 */

export const STEAM_LOOK = {
  /** In-scattered radiance of the steam (linear, the rig's exposure and tone mapping follow). */
  color: new Color(0.94, 0.95, 0.97),
  /** Lit from above (skylight, ceiling) a little more than from below. */
  topLight: 0.12,
  /**
   * Share of the light that is the room's (the rest is the shadow-casting key): in the dome's
   * shadow the steam keeps only this. The porcelain there keeps 0.77 (sRGB 210 against 235), but
   * steam is lit from every side by the bright room and the white plate under it (it scatters
   * mostly forward and is fed by light the dome does not block), so it dims much less: at 0.77
   * the mist under the lifting dome read as a grey stain.
   */
  ambient: 0.9,
  /** Soft contact distances (su): the plate and table, the cloche's shell, the bin's body. */
  softFloor: 0.07,
  softCover: 0.02,
  softBin: 0.05,
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
/** The dome's shell top (cover space; the crown's cap above it). */
const DOME_TOP = COVER_PROFILE[COVER_PROFILE.length - 1]![1];

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
uniform float uEmitStart;
uniform float uEmitEnd;
uniform float uCapture;
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
varying vec3 vCapShift;

const float TD = ${STEAM_TIME.drag.toFixed(4)};
const float TB = ${STEAM_TIME.accel.toFixed(4)};
const float TM = ${STEAM_TIME.mix.toFixed(4)};
const float TCURL = ${STEAM_TIME.curl.toFixed(4)};
const float TIN = ${STEAM_TIME.fadeIn.toFixed(4)};

/** The puff's centre at its age (puffAt). */
vec3 puffCenter(float age) {
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
  return c;
}

void main() {
  float age = uTime - iSpawn.w;
  float life = iVel.w;
  // Only what the release window let out (a change of mind: see DinnerSteam.update).
  if (age < 0.0 || age > life || iSpawn.w < uEmitStart || iSpawn.w > uEmitEnd) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    return;
  }
  vec3 c = puffCenter(age);
  float seed = iLook.y;
  // Where this part of the puff was when the cover was set back on (captured()).
  vCapShift = uTime >= uCapture ? c - puffCenter(max(0.0, uCapture - iSpawn.w)) : vec3(0.0);
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
/** The bin, when on stage (a decline after a change of mind): axis (x, z), radius (0: none), rim. */
uniform vec4 uBin;
/** τ at which a change of mind set the cover back on the plate (far future: never), and where it sits. */
uniform float uCapture;
uniform vec3 uSeated;
${NOISE}
${glslProfile('plateTop', PLATE_LINE)}
${glslProfile('domeRadius', DOME_BY_HEIGHT)}
const float DOME_TOP = ${DOME_TOP.toFixed(4)};

/**
 * Steam the cover was set back over stays under it, and goes where the covered dish goes: 1 for
 * steam that was outside the seated dome when it closed (\`pc\`: where it was then), 0 inside. At
 * that moment everything it hides is inside the shell (contact() drops it), so nothing pops.
 */
float captured(vec3 pc) {
  if (uTime < uCapture) return 1.0;
  vec3 cv = pc - uSeated;
  float d = max(length(cv.xz) - domeRadius(clamp(cv.y, 0.0, DOME_TOP)), cv.y - DOME_TOP);
  return smoothstep(-0.03, 0.0, d);
}

/**
 * Soft contact (0 at a surface, 1 a few mm off it) with the plate, the table, the cloche's shell
 * and the bin's body; -1 inside the dome (hidden by its shell: drop the fragment).
 */
float contact(vec3 p) {
  vec3 pp = p - uPlate;
  float rp = length(pp.xz);
  // The plate's top, its rounded outer edge falling to the table over 5 mm (a step here printed a
  // line across the steam just behind the gilt rim). Only over its footprint and down to its foot:
  // a plate carried off (a decline after a change of mind) hides nothing beside or below it.
  float surface = pp.y < 0.3 && rp < 0.83 ? plateTop(min(rp, 0.8)) * (1.0 - smoothstep(0.8, 0.83, rp)) : 0.0;
  float onPlate = (1.0 - smoothstep(0.8, 0.86, rp)) * smoothstep(-0.05, 0.0, pp.y);
  float k = mix(1.0, smoothstep(0.0, ${STEAM_LOOK.softFloor.toFixed(3)}, pp.y - surface), onPlate) * smoothstep(0.0, ${STEAM_LOOK.softFloor.toFixed(3)}, p.y);
  // The bin's body (a cylinder up to its rim; open above): steam left behind never shows inside it.
  if (uBin.z > 0.0) k *= smoothstep(0.0, ${STEAM_LOOK.softBin.toFixed(3)}, max(length(p.xz - uBin.xy) - uBin.z, p.y - uBin.w));
  vec3 cv = (uCoverInv * vec4(p, 1.0)).xyz;
  float rc = length(cv.xz);
  if (cv.y > -0.06 && cv.y < 0.7 && rc < 0.75) {
    float shell = 1e3;
    if (cv.y >= 0.0 && cv.y <= DOME_TOP) {
      float R = domeRadius(cv.y);
      if (rc <= R) return -1.0;
      shell = rc - R;
    } else if (cv.y > DOME_TOP) {
      // Above the crown: distance to the crown's cap (its flat top, ≈ r 0.17).
      shell = length(vec2(max(rc - 0.17, 0.0), cv.y - DOME_TOP));
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
  // Every condition blends smoothly (a branch here printed a hard line across the steam where the
  // closest approach crossed the rim plane).
  float shade = (1.0 - smoothstep(0.82, 1.12, length(near))) * smoothstep(0.0, 0.15, along) * smoothstep(-0.25, 0.0, near.y);
  float lit = 1.0 - shade;
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
varying vec3 vCapShift;

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
  vec2 rw = vCorner + 0.5 * w;
  float env = exp(-dot(rw, rw) * (2.6 + 2.6 * vErode)) * (1.0 - smoothstep(0.6, 1.0, sqrt(r2)));
  // (Low tier: one octave and no filaments, half the lookups.)
  float n = 0.5 + 0.5 * (uLow ? 0.85 * snoise(ROT * qw) : 0.7 * snoise(ROT * qw) + 0.3 * snoise(ROT * (ROT * qw) * 2.3 + 5.3));
  // Filaments: thin sheets drawn out along the rise, in world space so they run on from puff to
  // puff, drifting up and bent by the same warp. A sheet (the spill) is mostly filament from
  // birth; a billow frays into them as it evaporates.
  vec3 wq = vPos * vec3(3.4, 1.3, 3.4) + vec3(0.0, -uTime * 0.6, 0.0) + 0.45 * w.x;
  float sn = uLow ? 0.0 : snoise(ROT * wq);
  float sheet = 1.0 - sn * sn;
  // Densest in the middle (never a shell with a hollow centre), the field modulating it.
  float dens = env * (0.35 + 0.65 * n) * 1.25 * mix(1.0, 0.25 + 0.95 * sheet * sheet, max(vWisp, vErode));
  // Evaporation thins it from its faint parts first, then it is gone.
  // Saturates softly (a clamp printed flat, cut-out plateaus with crisp edges).
  float d = 1.0 - exp(-1.3 * max(0.0, dens - 0.3 * vErode) / (1.0 - 0.3 * vErode));
  float k = contact(vPos);
  if (k < 0.0) discard;
  k *= captured(vPos - vCapShift);
  float a = d * k * vOpacity * uFade;
  if (a < 0.002) discard;
  gl_FragColor = vec4(steamLight(vPos, vLocal.y), 1.0);
  // Tone mapped and encoded like the scene, then scaled by the coverage for the screen blend.
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor = vec4(gl_FragColor.rgb * a, a);
}
`;

/** A plume's ribbon is this many times the sheet's half-width, so the sheet can wander in it. */
const PLUME_ROOM = 1.5;

const PLUME_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uEmitStart;
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
const float TAIL = ${PLUME.tail.toFixed(4)};
const float TAIL_DECAY = ${PLUME.tailDecay.toFixed(4)};
const float CUT = ${PLUME.cut.toFixed(4)};
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

/**
 * Source strength at emission time t (plumeSource): within the release window, ramped up from its
 * start and dying away over CUT after its end (a change of mind), never a step.
 */
float source(float t) {
  float a = t - iBase.w;
  if (a <= 0.0 || t <= uEmitStart || t >= uEmitEnd + CUT) return 0.0;
  float k = max(0.0, a - RAMP);
  return smoothstep(0.0, RAMP, a) * ((1.0 - TAIL) * exp(-k / iFlow.y) + TAIL * exp(-k / TAIL_DECAY))
    * smoothstep(uEmitStart, uEmitStart + RAMP, t) * (1.0 - smoothstep(uEmitEnd, uEmitEnd + CUT, t));
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
  // A broad, soft sheet of vapour (units across: its half-width; the ribbon is ROOM× wider so
  // its soft edge never meets the ribbon's), smooth for its first few centimetres and breaking
  // into many irregular wisps above: a domain-warped field in centimetres across and along the
  // rising vapour (s = h − rise·τ), churning in time (not a texture sliding up). The wisps merge,
  // split and fade; none is drawn.
  float s = h - vRise * uTime;
  float x = u * vWidth;
  float free = smoothstep(0.0, 0.2, h);
  vec2 wq = vec2(x * 3.0, s * 2.2);
  float wx = snoise(vec3(wq, vSeed + 0.6 * uTime));
  float wy = uLow ? 0.0 : snoise(vec3(wq + 7.3, vSeed + 3.1 + 0.6 * uTime));
  vec3 q = vec3(x * 7.0 + 1.3 * wx * free, s * 5.0 + 1.3 * wy * free, vSeed + 1.4 * uTime);
  float n = uLow ? snoise(q) : 0.65 * snoise(q) + 0.35 * snoise(q * 2.1 + 4.0);
  float wisps = smoothstep(-0.25, 0.45, n);
  float across = clamp(1.0 - u * u, 0.0, 1.0);
  across = across * sqrt(across);
  float d = across * mix(1.0, 0.2 + wisps, smoothstep(0.03, 0.4, h));
  d *= smoothstep(ROOM, 0.85 * ROOM, abs(u));
  float k = contact(vPos);
  if (k < 0.0) discard;
  // The vapour here rose straight up from where it was when the cover was set back on.
  k *= captured(vPos - vec3(0.0, vRise * max(0.0, uTime - uCapture), 0.0));
  // Dense parts saturate softly (a hard clamp would print a flat edge where it bites).
  float a = 0.85 * (1.0 - exp(-d * k * vDensity * uFade / 0.85));
  if (a < 0.002) discard;
  gl_FragColor = vec4(steamLight(vPos, 0.3), 1.0);
  // Tone mapped and encoded like the scene, then scaled by the coverage for the screen blend.
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

/** Steam clocks drawn at once: the reveal's and up to two left behind by changes of mind. */
export const STEAM_LAYERS = 3;
/** The release window's open ends in the shaders (finite: an infinite edge makes smoothstep NaN). */
const OPEN = 1e6;

type Uniform<T> = { value: T };
interface SteamLayer {
  group: Group;
  time: Uniform<number>;
  emitStart: Uniform<number>;
  emitEnd: Uniform<number>;
  capture: Uniform<number>;
  fade: Uniform<number>;
}

/**
 * One steam clock: steam time τ (null: none shows); the release window [emitStart, emitEnd] (a
 * change of mind stops the release; a reveal resumed part-way starts it there); `capture`, the τ
 * at which a change of mind set the cover back on the plate (what it closed over stays under it);
 * `fade`, an overall multiplier.
 */
export interface SteamClock {
  tau: number | null;
  emitStart?: number;
  emitEnd?: number;
  capture?: number;
  fade?: number;
}

/**
 * The reveal's steam: the puffs (spill, release, pocket, trail) and the column's plumes, two
 * instanced draws per steam clock (layer), all evaluated in closed form at that clock. The layers
 * share the geometry, the noise and every uniform but their clock and release window (same shader
 * source, so one compiled program each).
 */
export class DinnerSteam {
  readonly object = new Group();
  private readonly puffGeometry: InstancedBufferGeometry;
  private readonly plumeGeometry: InstancedBufferGeometry;
  private readonly materials: ShaderMaterial[] = [];
  private readonly layers: SteamLayer[] = [];
  private readonly coverInv = new Matrix4();
  /** The rig's shadow-casting key (undefined: not looked for yet; null: the rig has none). */
  private key: Object3D | null | undefined = undefined;
  private readonly noise: DataTexture;

  constructor(puffs: readonly Puff[], plumes: readonly Plume[]) {
    this.object.name = 'fx_steam';
    this.object.visible = false;
    // Shared uniforms (one object per uniform, so every material sees every update).
    this.noise = noiseTexture();
    const shared = {
      uNoise: { value: this.noise },
      uLow: { value: false },
      uColor: { value: STEAM_LOOK.color.clone() },
      uTopLight: { value: STEAM_LOOK.topLight },
      uAmbient: { value: STEAM_LOOK.ambient },
      uKeyDir: { value: new Vector3(-0.36, 0.643, 0.676).normalize() },
      uCoverInv: { value: new Matrix4() },
      uPlate: { value: new Vector3() },
      uBin: { value: new Vector4() },
      uSeated: { value: new Vector3() },
      uCamRight: { value: new Vector3(1, 0, 0) },
      uCamUp: { value: new Vector3(0, 1, 0) },
    };
    this.shared = shared;

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
    this.puffGeometry = instanced(quad, { iSpawn: spawn, iVel: vel, iShape: shape, iLook: look, iCurl: curl }, n);
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
    this.plumeGeometry = instanced(strip, { iBase: base, iFlow: flow, iWidth: width, iDirs: dirs }, m);
    strip.dispose();

    // Camera-facing in the scene's own space (the root carries the world scale), and the rig's
    // shadow-casting key's direction, once per drawn layer (before its first draw).
    const toScene = new Matrix4(), cam = new Matrix4();
    const lp = new Vector3(), cp = new Vector3();
    const beforeRender = (_r: unknown, scene: Object3D, camera: Camera) => {
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

    for (let l = 0; l < STEAM_LAYERS; l++) {
      const layer: SteamLayer = {
        group: new Group(),
        time: { value: 0 }, emitStart: { value: -OPEN }, emitEnd: { value: OPEN }, capture: { value: OPEN }, fade: { value: 1 },
      };
      const uniforms = { ...shared, uTime: layer.time, uEmitStart: layer.emitStart, uEmitEnd: layer.emitEnd, uCapture: layer.capture, uFade: layer.fade };
      const material = (name: string, vertexShader: string, fragmentShader: string) => new ShaderMaterial({
        name, uniforms, vertexShader, fragmentShader, transparent: true, depthWrite: false,
        // Screen blend (out = c + dst·(1 − c)): steam only ever adds light, it never darkens what is
        // behind it (a normal blend greyed the lit porcelain wherever the steam was dimmer than it).
        // It commutes, so overlapping layers need no order.
        blending: CustomBlending, blendEquation: AddEquation, blendSrc: OneFactor, blendDst: OneMinusSrcColorFactor,
        blendSrcAlpha: ZeroFactor, blendDstAlpha: OneFactor,
      });
      const puffMesh = new Mesh(this.puffGeometry, material('fx_steam_puff', PUFF_VERTEX, PUFF_FRAGMENT));
      const plumeMesh = new Mesh(this.plumeGeometry, material('fx_steam_plume', PLUME_VERTEX, PLUME_FRAGMENT));
      this.materials.push(puffMesh.material, plumeMesh.material);
      for (const [mesh, order] of [[plumeMesh, 5], [puffMesh, 6]] as const) {
        mesh.frustumCulled = false;
        mesh.renderOrder = order;
        mesh.userData.noShadowCast = true;
        layer.group.add(mesh);
      }
      plumeMesh.onBeforeRender = beforeRender;
      layer.group.visible = false;
      this.layers.push(layer);
      this.object.add(layer.group);
    }
  }

  private readonly shared: {
    uLow: { value: boolean };
    uCoverInv: { value: Matrix4 }; uPlate: { value: Vector3 }; uBin: { value: Vector4 }; uSeated: { value: Vector3 };
    uCamRight: { value: Vector3 }; uCamUp: { value: Vector3 }; uKeyDir: { value: Vector3 };
  };

  /** Show steam clock `layer` (0: the reveal's; 1…: left behind by a change of mind). */
  update(layer: number, { tau, emitStart = -Infinity, emitEnd = Infinity, capture = Infinity, fade = 1 }: SteamClock): void {
    const l = this.layers[layer]!;
    l.group.visible = tau !== null && fade > 0;
    l.time.value = tau ?? 0;
    l.emitStart.value = Math.max(-OPEN, emitStart);
    l.emitEnd.value = Math.min(OPEN, emitEnd);
    l.capture.value = Math.min(OPEN, capture);
    l.fade.value = fade;
    this.object.visible = this.layers.some((x) => x.group.visible);
  }

  /** Where the cover sits on the plate (scene space, untilted): what a change of mind closes it over. */
  setSeated(coverPos: Vector3): void {
    this.shared.uSeated.value.copy(coverPos);
  }

  /** Is steam clock `layer` drawn? */
  layerVisible(layer: number): boolean {
    return this.object.visible && this.layers[layer]!.group.visible;
  }

  /** The cloche's pose (scene space: position and its tilt) and the plate's, for the soft contact. */
  setSurfaces(coverPos: Vector3, tiltX: number, tiltZ: number, platePos: Vector3, binPos: Vector3 | null = null): void {
    // The bin's body: its radius plus the base cup's lip (a little wider), up to the rim.
    if (binPos) this.shared.uBin.value.set(binPos.x, binPos.z, DINNER_BIN.radius + 0.03, binPos.y + DINNER_BIN.rimTop);
    else this.shared.uBin.value.set(0, 0, 0, 0);
    this.coverInv.makeRotationFromEuler(EULER.set(tiltX, 0, tiltZ)).setPosition(coverPos).invert();
    this.shared.uCoverInv.value.copy(this.coverInv);
    this.shared.uPlate.value.copy(platePos);
  }

  /** Low tier: one noise octave and no filaments (about half the texture lookups). */
  setLowDetail(enabled: boolean): void {
    this.shared.uLow.value = enabled;
  }

  /** Show every draw for a shader warm-up (the next update restores visibility). */
  showForCompile(): void {
    this.object.visible = true;
    for (const l of this.layers) l.group.visible = true;
  }

  dispose(): void {
    this.puffGeometry.dispose();
    this.plumeGeometry.dispose();
    for (const m of this.materials) m.dispose();
    this.noise.dispose();
    this.object.removeFromParent();
  }
}
