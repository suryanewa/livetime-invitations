import { Color, type Material, Matrix3, Matrix4, MeshPhysicalMaterial, Quaternion } from 'three';
import type { SurfaceSpec } from './materials.ts';

/**
 * Basketball surface (Sports, L2): pebbled leather with the 8-panel seam pattern drawn in the
 * shader, so the seams stay crisp and alias-free while the ball spins and the ball mesh stays a
 * plain smooth sphere.
 *
 * Everything is evaluated on the sphere's object-space direction (a varying from the vertex
 * shader), so the pattern rotates with the ball and never depends on UVs or tessellation:
 * - Seams: two great circles (meridian x = 0, equator y = 0) plus two curved seams
 *   |x| = a − b·y², which cross the equator 40° from the meridian and close in on it near the
 *   poles, like a real ball (seen square-on: the classic "( + )"). Each seam is a distance field drawn with a box-filtered edge
 *   (width from fwidth), so it never aliases or shimmers; a sub-pixel seam fades to its
 *   average instead of breaking up.
 * - Seam channels: the leather rolls down into each seam (a Gaussian groove on the normal) and
 *   darkens slightly at the shoulders, so the seams read as recessed rubber channels that catch
 *   the key along one edge.
 * - Pebble grain: Worley domes measured in the sphere's tangent plane (the radial part of the
 *   distance is only lightly weighted), so the domes pack evenly over the whole ball instead of
 *   clustering where the sphere slices a 3D lattice. They perturb the normal and lift gloss on
 *   the dome tops. The grain fades out as its screen-space frequency rises (fwidth), towards
 *   the silhouette and at small sizes, so it never sparkles; what it loses is handed to
 *   roughness, so the filtered surface still reads as dull pebbled leather, never plastic.
 *   Where the grain has fully faded the Worley taps are skipped (a phone-cost saving).
 * The true sphere normal is rebuilt per pixel from the direction, so shading is perfectly
 * round whatever the tessellation.
 *
 * Presets: 'orange' (classic orange leather, ink seams) and 'cream' (warm pale leather, ink
 * seams, the equator seam in family coral, and a soft limb darkening so the pale ball keeps an
 * edge against the peach stage). Both share one program (customProgramCacheKey); colours and
 * the limb factor travel as per-material uniforms, so the rig's material swap never recompiles.
 */

const SEAM_INK = '#1A1B1D';
const ACCENT_CORAL = '#FF714A';
/** Output multiplier at the cream ball's limb (1 = none), eased in over the outer band of the disc. */
const CREAM_LIMB = 0.58;

/**
 * Seam frame (object → pattern space), tuned for the pose the guest actually looks at: the
 * guest-ready orientation (`frameFor('guest-ready').ballRot` in src/scenes/sports/sequences.ts,
 * the end of the host pass) under the stage camera (az 20°, el 15°). Computed offline and
 * hardcoded so the material never depends on the choreography: the pattern is aligned to the
 * screen (meridian vertical, equator horizontal) and then offset 0.12 rad in longitude, 0.06 rad
 * in elevation and rolled 0.06 rad, so the guest sees the classic "( + )" — the great-circle
 * cross just left of centre, between the two outward-bowing curved seams — with enough
 * asymmetry to read as a sphere. Recompute if the camera angles or the host pass change.
 */
export const SEAM_FRAME = new Matrix3().setFromMatrix4(
  new Matrix4().makeRotationFromQuaternion(new Quaternion(-0.136869, 0.026509, -0.82539, 0.547078)),
);

const PARS_VERTEX = /* glsl */ `
varying vec3 vBallPos;
`;

const PARS_FRAGMENT = /* glsl */ `
uniform mat3 normalMatrix;
uniform mat3 uSeamFrame;
uniform vec3 uSeamColor;
uniform vec3 uAccentColor;
uniform float uAccent;
uniform float uSeamRoughness;
uniform float uLimb;
varying vec3 vBallPos;

// Box-filtered line of half-width hw over a distance field d (same units).
float ballLine(float d, float hw) {
  float aa = max(fwidth(d), 1e-5);
  float w = max(hw, 0.5 * aa);
  return (1.0 - smoothstep(w - 0.5 * aa, w + 0.5 * aa, abs(d))) * (hw / w);
}

vec3 ballHash(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}

// Pebble grain: round domes on a jittered cubic lattice (Worley F1), measured in the tangent
// plane of the sphere (normal n): the radial part of each offset is weighted by only 0.15, so
// a feature point just above or below the surface still makes a full dome and the domes pack
// evenly instead of clustering where the sphere slices the lattice. 0.15 is about the smallest
// weight that keeps the field continuous: a point that leaves the 3×3×3 neighbourhood is
// ≥ 1.2 cells away, so its weighted distance (≥ 0.465) is already past the dome radius R.
// x = height 0..1, yzw = tangential gradient in cell units.
vec4 ballPebble(vec3 q, vec3 n) {
  vec3 i = floor(q);
  vec3 f = q - i;
  float best = 9.0;
  vec3 bv = vec3(0.0);
  for (int z = -1; z <= 1; z++)
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++) {
    vec3 g = vec3(float(x), float(y), float(z));
    vec3 v = g + 0.2 + 0.6 * ballHash(i + g) - f;
    float vn = dot(v, n);
    vec3 vt = v - vn * n;
    float dd = dot(vt, vt) + 0.15 * vn * vn;
    if (dd < best) { best = dd; bv = vt; }
  }
  float r = sqrt(best);
  const float R = 0.46;
  float t = min(r / R, 1.0);
  float k = 1.0 - t * t;
  float h = k * k;
  float dh = -4.0 * t * k / R;
  return vec4(h, dh * (-bv / max(r, 1e-4)));
}

// Smooth value noise (hide mottling), 0..1.
float ballValue(vec3 p) {
  vec3 i = floor(p);
  vec3 f = p - i;
  f = f * f * (3.0 - 2.0 * f);
  float a = mix(ballHash(i).x, ballHash(i + vec3(1, 0, 0)).x, f.x);
  float b = mix(ballHash(i + vec3(0, 1, 0)).x, ballHash(i + vec3(1, 1, 0)).x, f.x);
  float c = mix(ballHash(i + vec3(0, 0, 1)).x, ballHash(i + vec3(1, 0, 1)).x, f.x);
  float d = mix(ballHash(i + vec3(0, 1, 1)).x, ballHash(i + vec3(1, 1, 1)).x, f.x);
  return mix(mix(a, b, f.y), mix(c, d, f.y), f.z);
}

// Gaussian groove slope profile (peak 1 at |u| = 0.707).
float ballGroove(float u) { return 2.3316 * u * exp(-u * u); }
`;

const PATTERN = /* glsl */ `
  vec3 ballN = normalize(vBallPos);
  vec3 ballS = uSeamFrame * ballN;
  // Seam distance fields (≈ radians on the unit sphere) and unit tangential gradients.
  const float SEAM_HW = 0.028;
  const float CURVE_A = 0.64;
  const float CURVE_B = 0.38;
  float sd1 = ballS.x;
  vec3 sg1 = normalize(vec3(1.0, 0.0, 0.0) - ballS.x * ballS + 1e-6);
  float sd2 = ballS.y;
  vec3 sg2 = normalize(vec3(0.0, 1.0, 0.0) - ballS.y * ballS + 1e-6);
  float sgn = ballS.x >= 0.0 ? 1.0 : -1.0;
  vec3 cf = vec3(sgn, 2.0 * CURVE_B * ballS.y, 0.0);
  vec3 cft = cf - dot(cf, ballS) * ballS;
  float cfl = max(length(cft), 1e-4);
  float sd3 = (abs(ballS.x) - (CURVE_A - CURVE_B * ballS.y * ballS.y)) / cfl;
  vec3 sg3 = cft / cfl;

  float bm1 = ballLine(sd1, SEAM_HW);
  float bm2 = ballLine(sd2, SEAM_HW * mix(1.0, 1.25, uAccent));
  float bm3 = ballLine(sd3, SEAM_HW);
  float ballInk = max(max(bm1, bm3), bm2 * (1.0 - uAccent));
  float ballSeam = max(ballInk, bm2);

  // Recessed channels: the leather rolls into each seam over σ.
  const float SIGMA = 0.058;
  float gFade = 1.0 - smoothstep(0.35, 0.9, fwidth(sd2) / SIGMA);
  vec3 ballGrad = (ballGroove(sd1 / SIGMA) * sg1 + ballGroove(sd2 / SIGMA) * sg2 + ballGroove(sd3 / SIGMA) * sg3) * (0.42 * gFade);
  float ballShoulder = max(max(exp(-sd1 * sd1 / (SIGMA * SIGMA)), exp(-sd2 * sd2 / (SIGMA * SIGMA))), exp(-sd3 * sd3 / (SIGMA * SIGMA)));

  // Pebble grain on the sphere, faded by its screen-space frequency (pScreen) and into the
  // seam shoulders. The taps are skipped wherever the grain has fully faded.
  const float PEBBLE_FREQ = 11.0;
  vec3 pq = ballN * PEBBLE_FREQ;
  float pScreen = 1.0 - smoothstep(0.24, 0.6, length(fwidth(pq)));
  float pFade = pScreen * (1.0 - smoothstep(0.0, 0.8, ballShoulder * 1.2));
  vec4 peb = vec4(0.0);
  if (pFade > 0.0) peb = ballPebble(pq, ballN);
  vec3 pg = peb.yzw;
  float ballPeb = peb.x * pFade;

  // Limb factor, set in the normal block: 1 at N·V ≥ LIMB_WIDTH, uLimb at the silhouette.
  const float LIMB_WIDTH = 0.6;
  float ballLimb = 1.0;
  // Albedo: leather with a faint hide mottle and valley shading, ink seams, the preset accent.
  float ballHide = ballValue(ballN * 3.2 + 7.0) * 0.6 + ballValue(ballN * 7.5) * 0.4;
  diffuseColor.rgb *= 0.95 + 0.08 * ballHide;
  diffuseColor.rgb *= mix(1.0, 0.94 + 0.08 * peb.x, pFade) * (1.0 - 0.2 * ballShoulder * (1.0 - ballSeam));
  diffuseColor.rgb = mix(diffuseColor.rgb, uAccentColor, bm2 * uAccent);
  diffuseColor.rgb = mix(diffuseColor.rgb, uSeamColor, ballInk);
`;

const ROUGHNESS = /* glsl */ `
  // Dome tops polish slightly; grain too fine to resolve becomes micro-roughness instead.
  roughnessFactor = mix(roughnessFactor - 0.07 * ballPeb + 0.12 * (1.0 - pScreen), uSeamRoughness, ballSeam);
`;

const NORMAL = /* glsl */ `
  {
    vec3 seamGradObj = transpose(uSeamFrame) * ballGrad;
    vec3 nObj = normalize(ballN - seamGradObj - 0.07 * pFade * pg);
    normal = normalize(normalMatrix * nObj);
    // Limb darkening (cream preset; uLimb = 1 for orange): pebbled leather self-shadows at
    // grazing view, and the effect reads like a studio's black flag, so the pale ball keeps a
    // soft darker edge against the peach stage. Applied after tone mapping (below): the lit
    // cream sits in the tone curve's shoulder, where any change in light barely shows.
    vec3 ballView = isOrthographic ? vec3(0.0, 0.0, 1.0) : normalize(vViewPosition);
    float ballNdV = clamp(dot(normalize(normalMatrix * ballN), ballView), 0.0, 1.0);
    ballLimb = mix(uLimb, 1.0, smoothstep(0.0, LIMB_WIDTH, ballNdV));
  }
`;

const LIMB = /* glsl */ `
  gl_FragColor.rgb *= ballLimb;
`;

export function ballMaterial(name: string, spec: SurfaceSpec): Material {
  const cream = spec.ball === 'cream';
  const m = new MeshPhysicalMaterial({ name, color: new Color(spec.color), roughness: spec.roughness, metalness: 0 });
  if (spec.sheen) {
    m.sheen = spec.sheen;
    m.sheenColor = new Color(spec.sheenColor ?? '#ffffff');
    m.sheenRoughness = 0.55;
  }
  const uniforms = {
    uSeamFrame: { value: SEAM_FRAME },
    uSeamColor: { value: new Color(SEAM_INK) },
    uAccentColor: { value: new Color(ACCENT_CORAL) },
    uAccent: { value: cream ? 1 : 0 },
    uSeamRoughness: { value: 0.74 },
    uLimb: { value: cream ? CREAM_LIMB : 1 },
  };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${PARS_VERTEX}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vBallPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${PARS_FRAGMENT}`)
      .replace('#include <map_fragment>', `#include <map_fragment>\n${PATTERN}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${ROUGHNESS}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${NORMAL}`)
      .replace('#include <tonemapping_fragment>', `#include <tonemapping_fragment>\n${LIMB}`);
  };
  m.customProgramCacheKey = () => 'ball-leather-v2';
  m.userData.ballUniforms = uniforms;
  return m;
}
