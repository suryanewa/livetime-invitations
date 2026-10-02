import { AddEquation, Color, CustomBlending, DoubleSide, NormalBlending, OneFactor, OneMinusSrcColorFactor, ShaderMaterial, Vector2, Vector3 } from 'three';

/**
 * Candle flame and smoke shaders (v1.5, Birthday #4). The physics and choreography live in
 * src/scenes/birthday/fire.ts; these only draw a given state.
 *
 * **Flame.** A camera-facing quad over each flame, ray-marched through the flame's emission field
 * in the flame's own 3D frame (so a lean away from the camera foreshortens correctly): a hollow
 * soot (yellow) zone that fills in above the wick, a thin blue cup at the base (CH* and C2*
 * chemiluminescence), a dark fuel-rich core round the wick, soft edges, and a cooler orange tip.
 * Colour is the Planck radiance of soot (ε ∝ 1/λ) at each point's temperature, integrated
 * against analytic CIE 1931 matching functions (Wyman, Sloan & Shirley 2013) into linear sRGB:
 * the flame is one HDR emitter whose bright core saturates to a warm white through a per-channel
 * camera response (red first, then green: orange, yellow, white), as a photograph does, with
 * orange where it is thin. The detached gas of a blown-out flame cools
 * through the same table (yellow → orange → dull red → nothing). The glowing wick tip is a small
 * Gaussian ember integrated in closed form, and a faint veiling-glare halo stands in for the
 * camera's bloom. Blended as `screen` (1 − (1 − a)(1 − b)), which never darkens and saturates
 * like light added in a compressed space.
 *
 * **Smoke.** Thin camera-facing ribbons along simulated streaklines (points from fire.ts), widened
 * in the vertex shader perpendicular to both the thread and the view, never thinner than a pixel
 * (opacity scaled down instead, so a 1 mm thread does not shimmer), with a soft cross-section and
 * age-driven wisp noise. Grey: wax aerosol side-scatters less than the lit greige cove reflects,
 * so a thin thread reads a little darker than the wall and lighter over shade.
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
  uEmber: { value: number };
  uPhase: { value: number };
  uWidest: { value: number };
  uGain: { value: number };
  uGlow: { value: number };
  uBB: { value: Vector3[] };
  uExposure: { value: number };
  /** Screen-space glare: the luminous centroid in drawing-buffer pixels, the PSF's σ (px), the glow's peak. */
  uScreenC: { value: Vector2 };
  uPsf: { value: Vector2 };
  uPsfPeak: { value: number };
}

/** Emission scale: the steady flame's luminous core integrates to ≈5 (three stops over white). */
export const FLAME_GAIN = 480;
/** Veiling-glare halo strength (fraction of the 1,900 K soot's radiance). */
export const FLAME_GLOW = 0.05;

/**
 * The camera's glare on a flame, in screen space (CSS px): a point-spread of σ 3 px (bleed) with a
 * 9 px skirt, carrying FLAME_GLARE of the flame's on-screen flux (luminous area in px² × its
 * radiance, ≈5 on the film's scale). A real lens and sensor spread a few per cent of a bright
 * source's light this way; it is why a small candle flame in a photograph glows larger than it
 * is. The peak is capped (FLAME_GLARE_CAP × its radiance) so a close-up's large flame gets no blob.
 */
export const FLAME_GLARE = { sigma: 3, skirt: 9, fraction: 0.05, cap: 0.6 } as const;

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
    uEmber: { value: 0 },
    uPhase: { value: 0 },
    uWidest: { value: 0.25 },
    uGain: { value: FLAME_GAIN },
    uGlow: { value: FLAME_GLOW },
    uBB: { value: bbTable() },
    uExposure: { value: 1 },
    uScreenC: { value: new Vector2(-1e4, -1e4) },
    uPsf: { value: new Vector2(6, 18) },
    uPsfPeak: { value: 0 },
  };
  const m = new ShaderMaterial({
    name,
    uniforms: uniforms as unknown as ShaderMaterial['uniforms'],
    defines: { BB_N, BB_T0: BB_T0.toFixed(1), BB_T1: BB_T1.toFixed(1), STEPS: 28 },
    vertexShader: /* glsl */ `
      uniform vec3 uRight;
      uniform vec3 uUp;
      uniform vec3 uCenter;
      uniform float uHalf;
      varying vec3 vLocal;
      varying vec2 vQuad;
      void main() {
        vec3 p = uCenter + (position.x * uRight + position.y * uUp) * (2.0 * uHalf);
        vLocal = p;
        vQuad = position.xy * 2.0;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
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
      uniform float uEmber;
      uniform float uPhase;
      uniform float uWidest;
      uniform float uGain;
      uniform float uGlow;
      uniform vec3 uBB[BB_N];
      uniform float uExposure;
      uniform vec2 uScreenC;
      uniform vec2 uPsf;
      uniform float uPsfPeak;
      varying vec3 vLocal;
      varying vec2 vQuad;

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

      float profile(float s) {
        if (s <= 0.0 || s >= 1.0) return 0.0;
        if (s < uWidest) { float u = (uWidest - s) / uWidest; return sqrt(max(0.0, 1.0 - u * u)); }
        float u = (s - uWidest) / (1.0 - uWidest);
        return pow(1.0 - u, 0.75) * (1.0 + 0.5 * u);
      }

      // Emission (linear radiance per unit length, before uGain) at a local point.
      vec3 emission(vec3 p) {
        vec3 d = p - uBase;
        float L = uShape.x;
        float s = dot(d, uAxisY) / L;
        if (s <= 0.0 || s >= 1.0) return vec3(0.0);
        // Axis curls back towards vertical (bend), the flame necks at its base.
        float x = dot(d, uAxisX) + uShape.z * s * s;
        float z = dot(d, uAxisZ);
        // Varicose flicker wave travelling up the flame (the buoyant vortices' pinch), ±3 %.
        float wave = 1.0 + 0.03 * sin(uPhase - 7.0 * s) * smoothstep(0.15, 0.6, s);
        float R = uShape.y * profile(s) * wave * (1.0 - uShape.w * 0.55 * exp(-pow((s - 0.12) / 0.14, 2.0)));
        float r = length(vec2(x, z)) / max(R, 1e-6);
        if (r > 1.08) return vec3(0.0);
        // The luminous zone ends within a few tenths of a millimetre (a diffusion flame's sheet).
        float edge = 1.0 - smoothstep(0.84, 1.04, r);
        float cut = uState.x, cool = uState.y, lit = uState.w;
        // Extinction front, base up.
        float alive = smoothstep(cut * 1.12 - 0.12, cut * 1.12, s);
        // Soot zone (Sunderland et al. 2011, thin-wick photographs): it begins at about the wick's
        // top, as an inverted U over the dark fuel-rich core, which it closes over higher up; round
        // the wick there is only the faint blue envelope.
        float rin = 0.78 * (1.0 - smoothstep(uWidest * 0.8, uWidest * 2.0, s));
        float soot = smoothstep(rin - 0.2, rin + 0.12, r) * edge;
        soot *= smoothstep(uWidest * 0.55, uWidest * 1.15, s) * (1.0 - 0.5 * smoothstep(0.72, 1.0, s));
        soot *= sootFormed(lit);
        // Temperature: hottest soot mid-flame; cooler at the tip and the outer mantle; the cut-off gas cools.
        float T = 1900.0 - 330.0 * smoothstep(0.45, 1.0, s) - 160.0 * smoothstep(0.55, 1.05, r);
        T -= 1250.0 * cool;
        T -= 260.0 * (1.0 - lit);
        vec3 col = soot * blackbody(T);
        // Blue cup: a thin shell at the base, fading up the sides under the soot zone.
        float shell = smoothstep(0.5, 0.88, r) * (1.0 - smoothstep(0.96, 1.12, r));
        float cup = shell * (1.0 - smoothstep(0.02, 0.24, s)) + 0.6 * exp(-pow(s / 0.06, 2.0)) * (1.0 - smoothstep(0.6, 1.0, r));
        // A fresh or starved flame is mostly blue; the cooling gas has no blue left.
        col += cup * vec3(0.008, 0.02, 0.105) * (1.0 + 2.2 * (1.0 - lit)) * (1.0 - cool);
        return col * alive;
      }

      float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

      void main() {
        // Rays start on the quad (in front of the flame, millimetres from it): measured from the
        // camera (≈10 units away) the sphere and point distances lose everything to float32.
        vec3 rd = normalize(vLocal - uCam);
        vec3 ro = vLocal;
        vec3 L = vec3(0.0);
        float intensity = uState.z;
        // March through the bounding sphere (it lies behind the quad).
        vec3 oc = ro - uMid;
        float bq = dot(oc, rd);
        float cq = dot(oc, oc) - uBoundR * uBoundR;
        float disc = bq * bq - cq;
        if (disc > 0.0 && intensity > 1e-4) {
          float sq = sqrt(disc);
          float t0 = max(-bq - sq, 0.0), t1 = -bq + sq;
          float dt = (t1 - t0) / float(STEPS);
          float j = ign(gl_FragCoord.xy);
          for (int k = 0; k < STEPS; k++) {
            vec3 p = ro + rd * (t0 + (float(k) + j) * dt);
            L += emission(p);
          }
          L *= dt * uGain * intensity;
        }
        // Ember: the wick tip's glow (σ 0.5 mm round it), evaluated in closed form along the ray.
        vec3 w = uWick - ro;
        float along = dot(w, rd);
        float dperp2 = max(dot(w, w) - along * along, 0.0);
        float se = 0.0025;
        float Te = 900.0 + 420.0 * uEmber;
        L += step(1e-3, uEmber) * 420.0 * exp(-dperp2 / (se * se)) * blackbody(Te);
        // Veiling glare round the luminous zone (the lens's bloom), windowed to the quad.
        vec3 c = uBase + uAxisY * (0.45 * uShape.x);
        vec3 wc = c - ro;
        float ac = dot(wc, rd);
        float dc2 = max(dot(wc, wc) - ac * ac, 0.0);
        float sg = 1.7 * uShape.y;
        L += uGlow * intensity * exp(-0.5 * dc2 / (sg * sg)) * blackbody(1900.0 - 900.0 * uState.y);
        // The camera's own glare (lens and sensor point-spread): its width is fixed on the sensor,
        // in pixels, not in millimetres of flame; its energy a fixed fraction of the flame's flux
        // on screen (uPsfPeak, set per frame from the projected size). Two lobes: the bleed and
        // the faint skirt.
        vec2 dp = gl_FragCoord.xy - uScreenC;
        float r2 = dot(dp, dp);
        float psf = 0.75 * exp(-0.5 * r2 / (uPsf.x * uPsf.x)) + 0.25 * (uPsf.x * uPsf.x) / (uPsf.y * uPsf.y) * exp(-0.5 * r2 / (uPsf.y * uPsf.y));
        L += uPsfPeak * psf * blackbody(1900.0 - 900.0 * uState.y);
        L *= 1.0 - smoothstep(0.75, 1.0, max(abs(vQuad.x), abs(vQuad.y)));
        // A camera's response, per channel: an overexposed blackbody saturates red, then green,
        // through orange and yellow to a warm white (a hue-preserving tone curve turns it pink).
        vec3 film = 1.0 - exp(-L * uExposure);
        gl_FragColor = vec4(film, 1.0);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: DoubleSide,
    blending: CustomBlending,
    blendEquation: AddEquation,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcColorFactor,
  });
  // Its own camera response (per channel, in the shader) instead of the scene's tone curve.
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
 * Smoke radiance: a little under the lit cove's, so a thin thread reads grey over the wall and
 * lighter over shade (and over cocoa); faintly cool, as sub-micron droplets side-scatter blue.
 */
export const SMOKE_COLOR = '#7b7c80';

export function createSmokeMaterial(): ShaderMaterial & { uniforms: SmokeUniforms } {
  const uniforms: SmokeUniforms = {
    uViewportH: { value: 1000 },
    uMinPx: { value: 1.3 },
    uColor: { value: new Color(SMOKE_COLOR) },
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
        vec3 side = cross(tng, view);
        float sl = length(side);
        side = sl > 1e-12 ? side / sl : vec3(1.0, 0.0, 0.0);
        float pxPerUnit = uViewportH * 0.5 * projectionMatrix[1][1] / max(1e-5, -c.z);
        float w = aWidth;
        float a = aAlpha;
        float px = w * pxPerUnit;
        // Never thinner than uMinPx: widen and keep the same amount of smoke (no shimmer).
        if (px < uMinPx) { a *= px / uMinPx; w = uMinPx / pxPerUnit; }
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

/**
 * Soot puff: soft camera-facing Gaussian blobs (the blown-out flame's own soot), same colour as
 * the smoke threads, with a little turbulent texture so overlapping blobs read as one cloud.
 */
export function createPuffMaterial(color: Color): ShaderMaterial & { uniforms: { uColor: { value: Color } } } {
  const uniforms = { uColor: { value: color } };
  const m = new ShaderMaterial({
    name: 'fx_puff',
    uniforms,
    vertexShader: /* glsl */ `
      attribute vec2 aCorner;
      attribute float aRadius;
      attribute float aAlpha;
      varying vec2 vCorner;
      varying float vAlpha;
      varying float vSeed;
      void main() {
        vec4 c = modelViewMatrix * vec4(position, 1.0);
        c.xy += aCorner * aRadius * 2.2;
        gl_Position = projectionMatrix * c;
        vCorner = aCorner * 2.2;
        vAlpha = aAlpha;
        vSeed = position.x * 91.7 + position.z * 53.3;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying vec2 vCorner;
      varying float vAlpha;
      varying float vSeed;
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y);
      }
      void main() {
        float r2 = dot(vCorner, vCorner);
        float g = exp(-1.6 * r2);
        float tex = 0.8 + 0.4 * n2(vCorner * 1.7 + vSeed) * n2(vCorner * 3.1 - vSeed);
        float a = clamp(vAlpha * g * tex * (1.0 - smoothstep(4.0, 4.84, r2)), 0.0, 1.0);
        gl_FragColor = vec4(uColor, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
  });
  m.toneMapped = true;
  return m as ShaderMaterial & { uniforms: { uColor: { value: Color } } };
}
