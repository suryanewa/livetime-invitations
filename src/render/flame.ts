import { AddEquation, AdditiveBlending, Color, CustomBlending, DoubleSide, NormalBlending, OneFactor, OneMinusSrcAlphaFactor, ShaderMaterial, Vector3, Vector4 } from 'three';

/**
 * Candle flame and smoke shaders (v1.5, Birthday #4; the flame rebuilt as a volume in v1.6, the
 * Hollywood pass: docs/scenes/birthday-v1.6-flames.md). The physics and choreography live in
 * src/scenes/birthday/fire.ts; these only draw a given state.
 *
 * **Flame.** A ray-marched volume: a camera-facing quad covers the flame's box (in the flame's own
 * frame, so a lean away from the camera foreshortens correctly) and each pixel marches through it,
 * front to back, accumulating soot's emission attenuated by soot's absorption. The field is the
 * flame's analytic shape (Sunderland et al. 2011): a soot shell, hollow over the dark fuel-rich
 * core round the wick and closing above it, its foot a dome over the wick's tip; a crisp outer
 * sheet whose last fifth thins and cools into an orange rim; a cooler, rounded orange apex; a thin
 * blue sheath (CH*, C2* chemiluminescence) under the luminous foot, never over the soot. Value
 * noise carried up the flame on the live clock warps it: a tenth of a millimetre at the tip in
 * still air, a torn tail in the breath's gust. Colour is the Planck radiance of soot (ε ∝ 1/λ) at
 * each point's temperature, integrated against analytic CIE 1931 matching functions (Wyman, Sloan
 * & Shirley 2013) into linear sRGB; the HDR emission goes through a per-channel camera response
 * with a little crosstalk (red saturates, then green, then blue: orange, yellow, a cream-white
 * core, as a photograph does) and is composited premultiplied over the scene, soot's absorption
 * its alpha. The glowing wick tip is a small Gaussian ember integrated in closed form. Its twin
 * (`createFlameBloomMaterial`) draws the same field as exposed scene-linear HDR for the bloom
 * (src/render/bloom.ts), the camera's real glare round it.
 *
 * **Smoke.** Thin camera-facing ribbons along simulated streaklines (points from fire.ts), widened
 * in the vertex shader perpendicular to both the thread and the view, never thinner than a pixel
 * (opacity scaled down instead, so a 1 mm thread does not shimmer), with a soft cross-section and
 * age-driven wisp noise. White: wax aerosol scatters nearly all the light it catches.
 */

// ── Blackbody table ──────────────────────────────────────────────────────────
export const BB_T0 = 700;
export const BB_T1 = 2300;
export const BB_N = 33;
/** Soot temperature that renders at radiance 1 (the steady flame's luminous zone, K). */
export const BB_REF = 1900;

const lobe = (l: number, mu: number, s1: number, s2: number) => {
  const s = l < mu ? s1 : s2;
  const d = (l - mu) / s;
  return Math.exp(-0.5 * d * d);
};
/** CIE 1931 2° matching functions, multi-lobe fit (Wyman, Sloan & Shirley, JCGT 2013). */
function cie(l: number): [number, number, number] {
  const x = 1.056 * lobe(l, 599.8, 37.9, 31.0) + 0.362 * lobe(l, 442.0, 16.0, 26.7) - 0.065 * lobe(l, 501.1, 20.4, 26.2);
  const y = 0.821 * lobe(l, 568.8, 46.9, 40.5) + 0.286 * lobe(l, 530.9, 16.3, 31.1);
  const z = 1.217 * lobe(l, 437.0, 11.8, 36.0) + 0.681 * lobe(l, 459.0, 26.0, 13.8);
  return [x, y, z];
}

/** Linear sRGB radiance of soot at temperature T (Planck × ε ∝ 1/λ), unscaled. */
export function sootRadiance(T: number): [number, number, number] {
  let X = 0, Y = 0, Z = 0;
  for (let l = 380; l <= 780; l += 5) {
    const m = l * 1e-9;
    const planck = 1 / (m ** 5 * (Math.exp(1.4388e-2 / (m * T)) - 1));
    const e = planck / l; // soot emissivity ∝ 1/λ
    const [x, y, z] = cie(l);
    X += x * e; Y += y * e; Z += z * e;
  }
  const r = 3.2406 * X - 1.5372 * Y - 0.4986 * Z;
  const g = -0.9689 * X + 1.8758 * Y + 0.0415 * Z;
  const b = 0.0557 * X - 0.204 * Y + 1.057 * Z;
  return [Math.max(0, r), Math.max(0, g), Math.max(0, b)];
}

/** BB_N linear-sRGB radiances from BB_T0 to BB_T1, scaled so BB_REF has luminance 1. */
export function blackbodyTable(): Vector3[] {
  const ref = sootRadiance(BB_REF);
  const lum = 0.2126 * ref[0] + 0.7152 * ref[1] + 0.0722 * ref[2];
  return Array.from({ length: BB_N }, (_, k) => {
    const T = BB_T0 + ((BB_T1 - BB_T0) * k) / (BB_N - 1);
    const [r, g, b] = sootRadiance(T);
    return new Vector3(r / lum, g / lum, b / lum);
  });
}

let table: Vector3[] | null = null;
const bbTable = () => (table ??= blackbodyTable());

/** Soot radiance at T (table, log-interpolated as the shader does), on the 1,900 K = 1 scale. */
export function blackbodyAt(T: number, out: Color): Color {
  const tb = bbTable();
  if (T < BB_T0) return out.setRGB(0, 0, 0);
  const x = Math.min(1, (T - BB_T0) / (BB_T1 - BB_T0)) * (BB_N - 1);
  const i = Math.floor(x), j = Math.min(i + 1, BB_N - 1), f = x - i;
  const a = tb[i]!, b = tb[j]!;
  const li = (p: number, q: number) => Math.exp(Math.log(Math.max(p, 1e-12)) * (1 - f) + Math.log(Math.max(q, 1e-12)) * f);
  return out.setRGB(li(a.x, b.x), li(a.y, b.y), li(a.z, b.z));
}

// ── Flame ────────────────────────────────────────────────────────────────────
export interface FlameUniforms {
  uCam: { value: Vector3 };
  uRight: { value: Vector3 };
  uUp: { value: Vector3 };
  uCenter: { value: Vector3 };
  uHalf: { value: number };
  uMid: { value: Vector3 };
  uBoundR: { value: number };
  uBase: { value: Vector3 };
  uAxisX: { value: Vector3 };
  uAxisY: { value: Vector3 };
  uAxisZ: { value: Vector3 };
  /** length, radius, bend offset (scene units at the tip), neck. */
  uShape: { value: [number, number, number, number] };
  /** cut, cool, intensity, lit. */
  uState: { value: [number, number, number, number] };
  uWick: { value: Vector3 };
  /** The wick inside the flame, from its foot to its (curled) tip, and its radius: it hides the flame behind it. */
  uWickFoot: { value: Vector3 };
  uWickR: { value: number };
  uEmber: { value: number };
  uPhase: { value: number };
  uWidest: { value: number };
  uGain: { value: number };
  uBB: { value: Vector3[] };
  /** The renderer's exposure (the rig's), so the flame sits on the scene's own scale. */
  uExposure: { value: number };
  /** Turbulence: the live clock (s, still under reduced motion), the breath's turbulence (0 still air – 1 a full gust), this flame's seed. */
  uNoise: { value: Vector3 };
  /** World size of a pixel at the flame (the luminous edge is never sharper than one). */
  uPx: { value: number };
  /**
   * Bloom pass only (src/render/bloom.ts): the sensor's footprint floor round the luminous centroid,
   * in the bloom target's pixels: centre x, y, σ (px), peak radiance (exposed).
   */
  uFloor: { value: Vector4 };
}

/**
 * Emission scale (per scene unit of soot path): the steady flame's luminous zone integrates to ≈8–12
 * after the rig's exposure where the line of sight grazes its shell (≈20× the lit greige cove,
 * which a candle flame of ≈10⁴ cd/m² in a ≈2,500 lx room is), ≈5–7 straight through it.
 */
export const FLAME_GAIN = 1900;
/**
 * Soot's absorption per scene unit at full soot loading: a candle flame is optically thin (a few
 * per cent), but its far side seen through the near one is a little dimmer, which is what gives
 * the body depth (≈0.25 optical depth through the shell's middle).
 */
export const FLAME_KAPPA = 100;
/** Ray-march steps through the flame's box. */
export const FLAME_STEPS = 32;
/** How much of a pixel's light reaches every channel of the camera's sensor, × its luminance² (the path to white). */
export const FLAME_CROSSTALK = 0.025;

/**
 * The sensor's footprint floor (bloom pass): a flame of a few pixels saturates them however small
 * it is, and the glare round them has a fixed pixel footprint (v1.5's glare floor, now a source for
 * the real bloom): a Gaussian of σ `sigma` CSS px at the luminous centroid, its peak the larger of
 * `floor` × the flame's luminous output and nothing, faded out as the flame grows past `fade` px tall
 * (a large flame blooms from its own radiance).
 */
export const FLAME_BLOOM_FLOOR = { sigma: 1.1, floor: 26, fade: [18, 60] as const } as const;

/** Shared GLSL: the flame's field and march. `HDR` is defined for the bloom pass's twin. */
const FLAME_FRAGMENT = /* glsl */ `
  #define MM 0.005
  uniform vec3 uCam;
  uniform vec3 uMid;
  uniform float uBoundR;
  uniform vec3 uBase;
  uniform vec3 uAxisX;
  uniform vec3 uAxisY;
  uniform vec3 uAxisZ;
  uniform vec4 uShape;
  uniform vec4 uState;
  uniform vec3 uWick;
  uniform vec3 uWickFoot;
  uniform float uWickR;
  uniform float uEmber;
  uniform float uPhase;
  uniform float uWidest;
  uniform float uGain;
  uniform vec3 uBB[BB_N];
  uniform float uExposure;
  uniform vec3 uNoise;
  uniform vec4 uFloor;
  uniform float uPx;
  varying vec3 vLocal;

  vec3 blackbody(float T) {
    float x = clamp((T - BB_T0) / (BB_T1 - BB_T0), 0.0, 1.0) * float(BB_N - 1);
    int i = int(floor(x));
    int j = min(i + 1, BB_N - 1);
    float f = x - float(i);
    // Log-interpolated: radiance spans decades between table entries.
    vec3 a = max(uBB[i], vec3(1e-12)), b = max(uBB[j], vec3(1e-12));
    vec3 c = exp(mix(log(a), log(b), f));
    return T < BB_T0 ? vec3(0.0) : c;
  }

  // A growing flame makes soot (turns yellow) once it is a third of its size (fire.ts sootFormed).
  float sootFormed(float lit) { return smoothstep(0.1, 0.5, lit); }

  // Value noise in [-1, 1] (hash: Hoskins, "Hash without Sine").
  float hash13(vec3 p3) {
    p3 = fract(p3 * 0.1031);
    p3 += dot(p3, p3.zyx + 31.32);
    return fract((p3.x + p3.y) * p3.z);
  }
  float vnoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    vec3 u = f * f * (3.0 - 2.0 * f);
    float a = hash13(i), b = hash13(i + vec3(1.0, 0.0, 0.0));
    float c = hash13(i + vec3(0.0, 1.0, 0.0)), d = hash13(i + vec3(1.0, 1.0, 0.0));
    float e = hash13(i + vec3(0.0, 0.0, 1.0)), g = hash13(i + vec3(1.0, 0.0, 1.0));
    float h = hash13(i + vec3(0.0, 1.0, 1.0)), k = hash13(i + vec3(1.0, 1.0, 1.0));
    return 2.0 * mix(mix(mix(a, b, u.x), mix(c, d, u.x), u.y), mix(mix(e, g, u.x), mix(h, k, u.x), u.y), u.z) - 1.0;
  }

  // How much of the blue sheath this ray shows: a hair's breadth of it lies in front of the wick.
  float gBlue = 1.0;

  // Closest distance between the ray and the segment a–b.
  float raySegment(vec3 ro, vec3 rd, vec3 a, vec3 b) {
    vec3 u = b - a, w0 = ro - a;
    float B = dot(rd, u), C = dot(u, u), D = dot(rd, w0), E = dot(u, w0);
    float den = C - B * B;
    float tc = den > 1e-12 ? clamp((E - B * D) / den, 0.0, 1.0) : 0.0;
    vec3 q = a + u * tc;
    float sc = max(dot(q - ro, rd), 0.0);
    return length(ro + rd * sc - q);
  }

  // Where the ray first meets the wick (a capsule from its foot to its tip; Quilez), or never.
  float rayCapsule(vec3 ro, vec3 rd, vec3 pa, vec3 pb, float ra) {
    vec3 ba = pb - pa, oa = ro - pa;
    float baba = dot(ba, ba), bard = dot(ba, rd), baoa = dot(ba, oa), rdoa = dot(rd, oa), oaoa = dot(oa, oa);
    float a = baba - bard * bard, b = baba * rdoa - baoa * bard, c = baba * oaoa - baoa * baoa - ra * ra * baba;
    float h = b * b - a * c;
    if (h >= 0.0 && a > 1e-20) {
      float t = (-b - sqrt(h)) / a;
      float y = baoa + t * bard;
      if (y > 0.0 && y < baba) return t;
      vec3 oc = y <= 0.0 ? oa : ro - pb;
      b = dot(rd, oc);
      c = dot(oc, oc) - ra * ra;
      h = b * b - c;
      if (h > 0.0) return -b - sqrt(h);
    }
    return 1e9;
  }

  float profile(float s) {
    if (s <= 0.0 || s >= 1.0) return 0.0;
    if (s < uWidest) { float u = (uWidest - s) / uWidest; return sqrt(max(0.0, 1.0 - u * u)); }
    float u = (s - uWidest) / (1.0 - uWidest);
    return pow(1.0 - u, 0.75) * (1.0 + 0.5 * u);
  }

  // The flame's field at p: soot emission (linear radiance per unit length, before uGain), the
  // blue sheath's, and soot's absorption.
  void field(vec3 p, out vec3 j, out float kap) {
    j = vec3(0.0);
    kap = 0.0;
    vec3 d = p - uBase;
    float L = uShape.x;
    float y = dot(d, uAxisY);
    float s = y / L;
    if (s <= 0.0 || s >= 1.0) return;
    float x = dot(d, uAxisX);
    float z = dot(d, uAxisZ);
    // Turbulence, in millimetres of the flame's own frame, carried up the flame: in still air a
    // laminar flame barely stirs (a tenth of a millimetre at the tip); in the breath's gust its
    // downstream half tears and flutters. A domain warp, so the luminous sheet stays a sheet.
    float turb = uNoise.y;
    vec3 q = vec3(x, y, z) / MM;
    q.y -= uNoise.x * (14.0 + 120.0 * turb);
    float tip = smoothstep(0.12, 1.0, s);
    float amp = (0.12 + 2.4 * turb) * tip * tip;
    vec3 qa = q * vec3(0.32, 0.13, 0.32) + vec3(uNoise.z, 0.0, 2.7 * uNoise.z);
    x += amp * MM * vnoise(qa);
    z += amp * MM * vnoise(qa + vec3(17.3, 3.1, 9.7));
    // The axis curls back towards vertical (bend); the flame necks at its base.
    x += uShape.z * s * s;
    // Varicose flicker wave travelling up the flame (the buoyant vortices' pinch), ±3 %.
    float wave = 1.0 + 0.03 * sin(uPhase - 7.0 * s) * smoothstep(0.15, 0.6, s);
    float rough = 1.0 + (0.015 + 0.12 * turb) * s * vnoise(q * 0.55 + vec3(3.1, 0.0, uNoise.z));
    // Never under ≈1.1 px across (a flame thinner than a pixel falls between the pixels' samples:
    // at the thumbnail one would blink out), its light spread over the wider body (flux kept).
    float R0 = max(uShape.y, 1.1 * uPx);
    float R = R0 * profile(s) * wave * rough * (1.0 - uShape.w * 0.55 * exp(-pow((s - 0.12) / 0.14, 2.0)));
    float r = length(vec2(x, z)) / max(R, 1e-6);
    if (r > 1.1) return;
    float cut = uState.x, cool = uState.y, lit = uState.w;
    // Extinction front, base up.
    float alive = smoothstep(cut * 1.12 - 0.12, cut * 1.12, s);
    // Soot zone (Sunderland et al. 2011): it begins above the wick's tip and closes over the dark
    // fuel-rich core higher up; seen through, the shell is brightest where the line of sight
    // grazes it (limb brightening, as in a macro photograph). It is narrower than the flame's
    // envelope (the blue sheath) at its foot: its bottom is rounded, widest about a third of the
    // way up it, the dark core pushing up into its centre: a teardrop, not a bullet on a flat foot.
    float W = uWidest;
    float sf = W * 1.02, sm = sf + 0.32 * (1.0 - sf);
    float rl = s < sm ? sqrt(max(0.0, 1.0 - pow((sm - s) / (sm - sf), 2.0))) : 1.0;
    float rr = r / max(rl, 1e-3);
    // The luminous zone ends within a few tenths of a millimetre (soot burns out at the flame
    // sheet): seen overexposed, a crisp silhouette whose last fifth thins and cools into a narrow
    // amber rim (never sharper than a pixel: no stair-steps on a 9 px flame); the glow round it
    // is the camera's (the bloom).
    // (Its colour ramp and its cut are never narrower than ≈2 px: the 11 Hz flicker moves the edge
    // by fractions of a pixel, and a thinner rim crawls.)
    float px = uPx / max(R * rl, 1e-6);
    float ew = max(0.04, 2.0 * px);
    float edge = exp(-max(rr - 0.78, 0.0) / max(1.0 / 22.0, 1.6 * px)) * (1.0 - smoothstep(1.0 - ew, 1.0, rr));
    float rin = 0.78 * (1.0 - smoothstep(W * 1.2, W * 2.6, s));
    float soot = smoothstep(rin - 0.18, rin + 0.1, rr) * edge * step(sf, s);
    // The core's push into the foot: no soot on the axis just above the wick.
    soot *= smoothstep(sf, sf + 0.12, s - 0.25 * (1.0 - min(rr, 1.0)) * (sm - sf));
    soot *= 1.0 - 0.5 * smoothstep(0.72, 1.0, s);
    // The apex: the soot burns out a little before the profile closes (a rounded, orange tip).
    soot *= 1.0 - smoothstep(0.86, 1.0, s);
    float sootShell = soot;
    // The soot loading varies a little and drifts up with the gas (in a gust, a lot).
    soot *= 1.0 + (0.06 + 0.3 * turb) * vnoise(q * vec3(0.8, 0.4, 0.8) + vec3(5.0 + uNoise.z, 0.0, 1.3));
    soot *= sootFormed(lit);
    // Temperature: hottest soot mid-flame; cooler at the tip and the outer mantle; just-formed soot
    // at the zone's foot is cooler (orange); the cut-off gas cools.
    float T = 1900.0 - 380.0 * smoothstep(0.5, 1.0, s) - 430.0 * smoothstep(0.6, 1.0, rr);
    T -= 220.0 * (1.0 - smoothstep(sf, sm + 0.1, s));
    T -= 330.0 * cool;
    T -= 260.0 * (1.0 - lit);
    j = soot * blackbody(T);
    // Its soot burns out as it glows (a blown flame's soot is gone in tens of milliseconds, the
    // smoke that follows is the wick's vapour): the absorption goes with the radiant output, so a
    // dying flame thins away instead of darkening into a sooty ghost.
    kap = soot * ${FLAME_KAPPA.toFixed(1)} * uState.z * clamp(dot(blackbody(T), vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
    // Blue sheath: the reaction zone round the bottom of the flame is a thin, translucent shell
    // (CH*, C2* chemiluminescence) outside the luminous zone, brightest where it curves under the
    // flame and where it is seen edge-on, fading up its sides.
    // Thin (a few tenths of a millimetre, a limb seen edge-on), never over the soot (blue and yellow
    // never add up to lilac), and closed under the flame (no seam at the cup's foot).
    float shell = smoothstep(0.86, 0.96, r) * (1.0 - smoothstep(0.99, 1.06, r));
    float cup = shell * (1.0 - smoothstep(0.0, 0.2, s)) * (0.35 + 0.65 * (1.0 - smoothstep(0.0, 0.07, s)));
    cup *= smoothstep(0.0, 0.12, s) * (1.0 - smoothstep(W * 0.8, W * 1.25, s)) * (1.0 - smoothstep(0.0, 0.2, sootShell));
    // A dim, saturated blue limb that shows only where it covers a pixel and more (at the
    // showcase's sizes against the daylit wall it is all but invisible, as it is to a camera).
    cup *= smoothstep(1.4, 2.6, 0.14 * R / max(uPx, 1e-7));
    // A fresh or starved flame is mostly blue; the cooling gas has no blue left.
    j += gBlue * cup * vec3(0.0003, 0.0026, 0.0058) * (1.0 + 2.2 * (1.0 - lit)) * (1.0 - cool);
    j *= alive;
    kap *= alive;
  }

  float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

  void main() {
    // Rays start on the quad (in front of the flame, millimetres from it): measured from the
    // camera (≈10 units away) the distances lose everything to float32.
    vec3 rd = normalize(vLocal - uCam);
    vec3 ro = vLocal;
    vec3 Ls = vec3(0.0);
    float Tr = 1.0;
    float intensity = uState.z;
    // The flame's box (its own frame): base to tip, the widest radius and the turbulence's reach.
    vec3 o = ro - uBase;
    vec3 lo = vec3(dot(o, uAxisX), dot(o, uAxisY), dot(o, uAxisZ));
    vec3 ld = vec3(dot(rd, uAxisX), dot(rd, uAxisY), dot(rd, uAxisZ));
    ld = vec3(ld.x < 0.0 ? -1.0 : 1.0, ld.y < 0.0 ? -1.0 : 1.0, ld.z < 0.0 ? -1.0 : 1.0) * max(abs(ld), vec3(1e-7));
    float L = uShape.x, m = 1.15 * max(uShape.y, 1.1 * uPx) + (0.2 + 2.5 * uNoise.y) * MM;
    vec3 bmin = vec3(-m - max(uShape.z, 0.0), -0.03 * L, -m);
    vec3 bmax = vec3(m + max(-uShape.z, 0.0), L, m);
    vec3 ta3 = (bmin - lo) / ld, tb3 = (bmax - lo) / ld;
    vec3 tn = min(ta3, tb3), tf = max(ta3, tb3);
    float t0 = max(max(tn.x, tn.y), max(tn.z, 0.0));
    float t1 = min(min(tf.x, tf.y), tf.z);
    // The wick hides the flame behind it (it is drawn already, opaque); in front of it lies a
    // hair's breadth of the blue sheath (v1.5 judge: a wick seen through blue read purple).
    t1 = min(t1, rayCapsule(ro, rd, uWickFoot, uWick, uWickR));
    gBlue = 0.2 + 0.8 * smoothstep(1.4 * uWickR, 2.6 * uWickR, raySegment(ro, rd, uWickFoot, uWick));
    if (t1 > t0 && intensity > 1e-4) {
      float dt = (t1 - t0) / float(STEPS);
      float jit = ign(gl_FragCoord.xy);
      for (int k = 0; k < STEPS; k++) {
        vec3 p = ro + rd * (t0 + (float(k) + jit) * dt);
        vec3 jj;
        float kk;
        field(p, jj, kk);
        Ls += Tr * jj;
        Tr *= exp(-kk * dt);
      }
      float rk = uShape.y / max(uShape.y, 1.1 * uPx);
      Ls *= dt * uGain * intensity * rk * rk;
    }
    // A flame cut off from its fuel (the breath's) fades much faster than it cools (soot's
    // radiance falls roughly as T^5 and its soot burns out): amber, then gone.
    float fade = 1.0 - uState.y;
    vec3 Lx = Ls * uExposure * fade * fade * fade;
    // A camera's response, per channel: an overexposed blackbody saturates red, then green, then
    // (a sensor's channels overlap: a little of all its light reaches each) blue: orange, yellow, a
    // cream-white core, as in photographs (a hue-preserving tone curve turns it pink).
    // (the crosstalk grows with the exposure: a body a few times over the wall stays yellow, a core
    // twenty times over it goes cream.)
    float yl = dot(Lx, vec3(0.2126, 0.7152, 0.0722));
    vec3 sensor = Lx + CROSSTALK * yl * yl;
  #ifdef HDR
    // Bloom pass: the exposed scene-linear radiance, its colour halfway to the camera's (a lens's
    // glare carries the light's own orange; a film's glow, the picture's warm white), and the
    // sensor's footprint floor.
    vec3 seen = sensor / (1.0 + sensor);
    Lx = mix(Lx, seen * (yl / max(dot(seen, vec3(0.2126, 0.7152, 0.0722)), 1e-4)), 0.5);
    vec2 dp = gl_FragCoord.xy - uFloor.xy;
    Lx += uFloor.w * exp(-0.5 * dot(dp, dp) / (uFloor.z * uFloor.z)) * vec3(1.0, 0.62, 0.25);
    gl_FragColor = vec4(Lx, 1.0);
  #else
    // Ember: the wick tip's glow (σ 0.5 mm round it), evaluated in closed form along the ray, an
    // orange point (its own response, without the flame's path to white; not a bloom source: the
    // bare embers glow on into the decline, down into the bin).
    vec3 w = uWick - ro;
    float along = dot(w, rd);
    float dperp2 = max(dot(w, w) - along * along, 0.0);
    float se = 0.0025;
    float Te = 900.0 + 420.0 * uEmber;
    // Its hottest channel stays under 1 before the response: orange, then red, then nothing.
    sensor += step(1e-3, uEmber) * 70.0 * exp(-dperp2 / (se * se)) * blackbody(Te) * uExposure;
    // The camera's shoulder, per channel: x / (1 + x) never clips two channels together (no lemon:
    // red stays above green through the yellow body), a cream core, an amber rim.
    vec3 film = sensor / (1.0 + sensor);
    // Premultiplied over what is behind: soot's absorption is the flame's alpha (the limb, where
    // the line of sight runs longest through the soot shell, holds its colour against a bright
    // wall), and where it is bright it outshines what is behind (a film's response to a highlight
    // over a lit wall: the wall's blue does not wash its rim to peach).
    float yf = 1.0 - dot(film, vec3(0.2126, 0.7152, 0.0722));
    float a = 1.0 - Tr * yf * yf;
    gl_FragColor = vec4(film, a);
    #include <colorspace_fragment>
  #endif
  }`;

const FLAME_VERTEX = /* glsl */ `
  uniform vec3 uRight;
  uniform vec3 uUp;
  uniform vec3 uCenter;
  uniform float uHalf;
  varying vec3 vLocal;
  void main() {
    vec3 p = uCenter + (position.x * uRight + position.y * uUp) * (2.0 * uHalf);
    vLocal = p;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`;

/**
 * The candle flame (v1.6): a ray-marched volume. A camera-facing quad covers the flame's box (its
 * frame: base to tip along the lean, the widest radius round it); each pixel marches FLAME_STEPS
 * steps through the box, front to back, accumulating soot's Planck emission (temperature → colour)
 * attenuated by soot's absorption, and the blue sheath's chemiluminescence; the wick (drawn,
 * opaque) ends the ray. The field is the v1.5 analytic flame (Sunderland et al.'s zones, the
 * breath's lean, stretch, neck, lift-off and extinction from the base) under a domain warp of value
 * noise carried up the flame on the live clock (still air: a tenth of a millimetre at the tip; a
 * gust: the downstream half tears). Drawn as `screen` through the camera's per-channel response;
 * its twin (`createFlameBloomMaterial`) draws the same field as scene-linear HDR into the bloom
 * pass's target (src/render/bloom.ts).
 */
export function createFlameMaterial(name: string): ShaderMaterial & { uniforms: FlameUniforms } {
  const uniforms: FlameUniforms = {
    uCam: { value: new Vector3(0, 0, 10) },
    uRight: { value: new Vector3(1, 0, 0) },
    uUp: { value: new Vector3(0, 1, 0) },
    uCenter: { value: new Vector3() },
    uHalf: { value: 0.1 },
    uMid: { value: new Vector3() },
    uBoundR: { value: 0.05 },
    uBase: { value: new Vector3() },
    uAxisX: { value: new Vector3(1, 0, 0) },
    uAxisY: { value: new Vector3(0, 1, 0) },
    uAxisZ: { value: new Vector3(0, 0, 1) },
    uShape: { value: [0.065, 0.0125, 0, 0] },
    uState: { value: [0, 0, 1, 1] },
    uWick: { value: new Vector3() },
    uWickFoot: { value: new Vector3() },
    uWickR: { value: 0.0015 },
    uEmber: { value: 0 },
    uPhase: { value: 0 },
    uWidest: { value: 0.25 },
    uGain: { value: FLAME_GAIN },
    uBB: { value: bbTable() },
    uExposure: { value: 1 },
    uNoise: { value: new Vector3(0, 0, 0) },
    uFloor: { value: new Vector4(-1e4, -1e4, 1, 0) },
    uPx: { value: 0 },
  };
  const m = new ShaderMaterial({
    name,
    uniforms: uniforms as unknown as ShaderMaterial['uniforms'],
    defines: { BB_N, BB_T0: BB_T0.toFixed(1), BB_T1: BB_T1.toFixed(1), STEPS: FLAME_STEPS, CROSSTALK: FLAME_CROSSTALK.toFixed(3) },
    vertexShader: FLAME_VERTEX,
    fragmentShader: FLAME_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: DoubleSide,
    blending: CustomBlending,
    blendEquation: AddEquation,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
  });
  // Its own camera response (per channel, in the shader) instead of the scene's tone curve.
  m.toneMapped = false;
  return m as ShaderMaterial & { uniforms: FlameUniforms };
}

/**
 * The flame's twin for the bloom pass: the same field and the same uniform objects (so it is posed
 * with the flame), drawn as exposed scene-linear radiance, added (src/render/bloom.ts).
 */
export function createFlameBloomMaterial(flame: ShaderMaterial & { uniforms: FlameUniforms }): ShaderMaterial & { uniforms: FlameUniforms } {
  const m = new ShaderMaterial({
    name: `${flame.name}_bloom`,
    uniforms: flame.uniforms as unknown as ShaderMaterial['uniforms'],
    defines: { ...flame.defines, HDR: 1 },
    vertexShader: FLAME_VERTEX,
    fragmentShader: FLAME_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: DoubleSide,
    blending: AdditiveBlending,
  });
  m.toneMapped = false;
  return m as ShaderMaterial & { uniforms: FlameUniforms };
}

// ── Smoke ────────────────────────────────────────────────────────────────────
export interface SmokeUniforms {
  uViewportH: { value: number };
  uMinPx: { value: number };
  uColor: { value: Color };
  uTime: { value: number };
}

/**
 * Smoke radiance (linear, before the tone curve): wax aerosol is white (sub-micron droplets scatter
 * nearly all the light they catch, faintly bluish), so where it is dense it is brighter than the
 * greige cove behind it (≈ 0.6 albedo): ≈ 245 of 255 on screen against the wall's ≈ 210 (v1.5
 * judge: '#c9c9cb' matched the wall and vanished). A thread reads as a pale wisp over the wall and
 * stands out more over shade, the bin or cocoa.
 */
export const SMOKE_RADIANCE = [1.4, 1.414, 1.456] as const;

export function createSmokeMaterial(): ShaderMaterial & { uniforms: SmokeUniforms } {
  const uniforms: SmokeUniforms = {
    uViewportH: { value: 1000 },
    uMinPx: { value: 1.3 },
    uColor: { value: new Color().setRGB(...SMOKE_RADIANCE) },
    uTime: { value: 0 },
  };
  const m = new ShaderMaterial({
    name: 'fx_smoke',
    uniforms: uniforms as unknown as ShaderMaterial['uniforms'],
    vertexShader: /* glsl */ `
      attribute vec3 aPrev;
      attribute vec3 aNext;
      attribute float aSide;
      attribute float aWidth;
      attribute float aAlpha;
      attribute float aAge;
      attribute float aSeed;
      uniform float uViewportH;
      uniform float uMinPx;
      varying float vAlpha;
      varying float vAcross;
      varying float vAge;
      varying float vAlong;
      void main() {
        vec4 c = modelViewMatrix * vec4(position, 1.0);
        vec3 tp = (modelViewMatrix * vec4(aPrev, 1.0)).xyz;
        vec3 tn = (modelViewMatrix * vec4(aNext, 1.0)).xyz;
        vec3 tng = tn - tp;
        vec3 view = normalize(-c.xyz);
        float pxPerUnit = uViewportH * 0.5 * projectionMatrix[1][1] / max(1e-5, -c.z);
        float w = aWidth;
        float a = aAlpha;
        float px = w * pxPerUnit;
        // Never thinner than uMinPx: widen and keep the same amount of smoke (no shimmer).
        if (px < uMinPx) { a *= px / uMinPx; w = uMinPx / pxPerUnit; }
        // Across the thread on screen: perpendicular to its projected tangent. Where it points at
        // the camera that tangent shrinks under a pixel and its direction is noise: only there it
        // blends towards the screen horizontal (a rising thread's own side), so an end-on stretch
        // draws as a soft blob of its width, never a fan of strips (a star), and a thread seen
        // side-on keeps its full width.
        vec3 across = cross(tng, view);
        float al = length(across);
        float sure = smoothstep(0.3, 1.0, al * pxPerUnit);
        vec3 side = (al > 1e-12 ? across / al : vec3(1.0, 0.0, 0.0)) * sure + vec3(1.0 - sure, 0.0, 0.0);
        float sl = length(side);
        side = sl > 1e-6 ? side / sl : vec3(1.0, 0.0, 0.0);
        // The Gaussian cross-section reaches past the nominal width.
        c.xyz += side * aSide * w * 1.1;
        gl_Position = projectionMatrix * c;
        vAlpha = a;
        vAcross = aSide;
        vAge = aAge;
        vAlong = aSeed;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uTime;
      varying float vAlpha;
      varying float vAcross;
      varying float vAge;
      varying float vAlong;
      float h(float n) { return fract(sin(n) * 43758.5453); }
      float n1(float x) { float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h(i), h(i + 1.0), f); }
      void main() {
        // Cross-section: Gaussian, ±2.2σ across the strip.
        float x = vAcross * 1.1;
        float prof = exp(-2.4 * x * x);
        // Older smoke breaks into streaky wisps (noise along the thread, advected with it).
        float wisp = mix(1.0, 0.35 + 1.1 * n1(vAlong * 9.0 + vAcross * 1.7) * n1(vAlong * 23.0 - vAcross * 2.3 + 3.1), smoothstep(0.15, 0.7, vAge));
        float a = clamp(vAlpha * prof * wisp, 0.0, 1.0);
        gl_FragColor = vec4(uColor, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: DoubleSide,
    blending: NormalBlending,
  });
  m.toneMapped = true;
  return m as ShaderMaterial & { uniforms: SmokeUniforms };
}
