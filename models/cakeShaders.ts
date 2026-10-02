import { type IUniform, type Material, type Mesh, type Object3D, ShaderChunk, Vector3, Vector4 } from 'three';
import { CANDLE, CANDLE_COUNT, CANDLE_SOCKETS, MASTER, CAKE_SCALE } from './birthdayContract.ts';

/**
 * v1.5 runtime shading for the hand-finished cake (scripts/masters/recipes/birthdayFinish.ts builds
 * the geometry and maps these read). One composable `onBeforeCompile` per cake material:
 *
 * - bin shade (v1.2.1, all cake materials): the ramp that darkens the cake inside the bin;
 * - subsurface (frosting body and piping): buttercream is a fat-and-sugar foam, light enters it,
 *   so the key's terminator is soft and coloured by the frosting itself. A wrapped-diffuse term
 *   on the direct light only (the image-based light is already soft), tinted by the material;
 * - press (frosting body): each candle pushes a dimple and a raised, slightly lumpy collar of
 *   displaced buttercream into the top tier as it goes in (CakePress.press), and the frosting
 *   right round it glosses a little as the flame warms it (CakePress.gloss);
 * - ridges (piping, rosettes): the per-vertex convexity `_ridge` makes crests a touch glossier
 *   and grooves a touch matter, and puts the very slight sheen on the crests;
 * - melt (each candle its own material): the rounded lip, the pool in its cup, the bead and the
 *   run down the low side, the top burning down (src/scenes/birthday/melt.ts drives it).
 *
 * Mesh nodes are quantized (KHR_mesh_quantization): `position` is normalised; the node's scale
 * and offset (`uQS`, `uQO`) take it to its parent's space, where the shaders work.
 */

export const PRESS = {
  /** Candle radius at the frosting (mean of the flutes, scene units). */
  candleR: 0.0194,
  /** Dimple: the buttercream dragged down against the candle, depth and width (0.44 mm, 0.7 mm). */
  dimple: { depth: 0.0022, width: 0.0035 },
  /** Collar: the plug pushed aside rises as a ring ≈ 1.4 mm out, ≈ 0.6 mm high, ≈ 1 mm wide. */
  collar: { height: 0.003, at: 0.007, width: 0.005 },
  /** Reach of the gloss ring past the candle (2.4 mm) and its roughness drop at full (35 %). */
  gloss: { reach: 0.012, drop: 0.35 },
} as const;

type Patch = {
  key: string;
  uniforms?: Record<string, IUniform>;
  vertexHead?: string;
  /** After `#include <beginnormal_vertex>`: may edit `objectNormal` (reads `position`). */
  vertexNormal?: string;
  /** After `#include <begin_vertex>`: may edit `transformed`. */
  vertexBegin?: string;
  /** After `#include <project_vertex>`. */
  vertexEnd?: string;
  fragmentHead?: string;
  afterMap?: string;
  afterRoughness?: string;
  afterLightsSetup?: string;
  /** Extra direct diffuse inside RE_Direct_Physical (geometryNormal, directLight, material in scope). */
  directDiffuse?: string;
  beforeOpaque?: string;
};

/** Installs `patches` on `material` (replacing any earlier cake patch). */
export function patchMaterial(material: Material, patches: Patch[]): void {
  const key = patches.map((p) => p.key).join('+');
  material.userData.cakePatch = key;
  // The live uniforms, for tooling (A/B frames) and tests.
  material.userData.cakeUniforms = Object.assign({}, ...patches.map((p) => p.uniforms ?? {}));
  material.onBeforeCompile = (shader) => {
    for (const p of patches) Object.assign(shader.uniforms, p.uniforms ?? {});
    const join = (k: keyof Patch) => patches.map((p) => (p[k] as string | undefined) ?? '').join('\n');
    let v = shader.vertexShader, f = shader.fragmentShader;
    v = v.replace('#include <common>', `#include <common>\n${join('vertexHead')}`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n${join('vertexNormal')}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${join('vertexBegin')}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${join('vertexEnd')}`);
    const direct = join('directDiffuse');
    f = f.replace('#include <common>', `#include <common>\n${join('fragmentHead')}`)
      .replace('#include <map_fragment>', `#include <map_fragment>\n${join('afterMap')}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${join('afterRoughness')}`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>\n${join('afterLightsSetup')}`)
      .replace('#include <opaque_fragment>', `${join('beforeOpaque')}\n#include <opaque_fragment>`);
    if (direct.trim()) {
      const line = 'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );';
      const chunk = ShaderChunk.lights_physical_pars_fragment;
      if (!chunk.includes(line)) throw new Error('cake shaders: three.js lighting chunk changed (RE_Direct_Physical)');
      f = f.replace('#include <lights_physical_pars_fragment>', chunk.replace(line, `${line}\n${direct}`));
    }
    shader.vertexShader = v;
    shader.fragmentShader = f;
  };
  material.customProgramCacheKey = () => `birthday-cake-${key}`;
  material.needsUpdate = true;
}

// ── Bin shade (v1.2.1) ─────────────────────────────────────────────────────────────
export const BIN_SHADE = { above: 0.02, depth: 0.05, floor: 0.06 } as const;
export interface BinShade {
  readonly rimY: { value: number };
  readonly on: { value: number };
}

export function binShadePatch(shade: BinShade): Patch {
  return {
    key: 'bin',
    uniforms: { uBinRimY: shade.rimY, uBinShadeOn: shade.on },
    vertexHead: 'varying float vBinY;',
    vertexEnd: 'vBinY = (modelMatrix * vec4(transformed, 1.0)).y;',
    fragmentHead: 'varying float vBinY;\nuniform float uBinRimY;\nuniform float uBinShadeOn;',
    beforeOpaque: `outgoingLight *= mix(1.0, ${BIN_SHADE.floor.toFixed(3)}, uBinShadeOn * (1.0 - smoothstep(uBinRimY - ${BIN_SHADE.depth.toFixed(3)}, uBinRimY + ${BIN_SHADE.above.toFixed(3)}, vBinY)));`,
  };
}

// ── Subsurface (wrapped diffuse) ───────────────────────────────────────────────────
/**
 * Wrap 0.3–0.4 (light reaching ≈ 17–22° past the terminator) at a fraction of the diffuse: the
 * soft, slightly saturated shadow edge of buttercream. `tint` multiplies the extra light (≤ 1).
 */
export function subsurfacePatch(wrap: number, tint: [number, number, number]): Patch {
  return {
    key: `sss${wrap.toFixed(2)}`,
    uniforms: { uSssWrap: { value: wrap }, uSssTint: { value: new Vector3(...tint) } },
    fragmentHead: 'uniform float uSssWrap;\nuniform vec3 uSssTint;',
    directDiffuse: `{
      float cakeNL = dot( geometryNormal, directLight.direction );
      float cakeWrap = saturate( ( cakeNL + uSssWrap ) / ( 1.0 + uSssWrap ) ) - saturate( cakeNL );
      reflectedLight.directDiffuse += cakeWrap * directLight.color * uSssTint * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );
    }`,
  };
}

// ── Press and gloss (frosting body) ────────────────────────────────────────────────
export interface CakePress {
  /** Per candle: x press (0–1), y gloss (0–1), z lean azimuth (cake space), w lean (0–1). */
  readonly press: { value: Vector4[] };
  /** Collar lumps: two phases per candle (fixed). */
  readonly lumps: { value: Vector4[] };
  readonly sockets: { value: Vector4[] };
}

export function newCakePress(): CakePress {
  // Fixed lumps: each collar is irregular in its own way (a hand-pushed candle, not a lathe).
  const lumps = Array.from({ length: CANDLE_COUNT }, (_, i) => new Vector4(1.3 + 2.1 * i, 0.4 + 1.7 * i * i, 0, 0));
  return {
    press: { value: Array.from({ length: CANDLE_COUNT }, () => new Vector4(0, 0, 0, 0)) },
    lumps: { value: lumps },
    sockets: { value: CANDLE_SOCKETS.map(([x, z]) => new Vector4(x, z, 0, 0)) },
  };
}

/** Top surface of the upper tier in cake space, less a margin: the press acts above it. */
const TOP_Y = (MASTER.tierTop - MASTER.cakeBottom) * CAKE_SCALE - 0.012;

function quantUniforms(mesh: Object3D): { uQS: IUniform; uQO: IUniform } {
  if (Math.abs(mesh.quaternion.w) < 1 - 1e-6) throw new Error(`cake shaders: ${mesh.name} carries a rotation; expected a quantization scale and offset`);
  return { uQS: { value: mesh.scale.clone() }, uQO: { value: mesh.position.clone() } };
}

export function pressPatch(mesh: Mesh, press: CakePress): Patch {
  const { candleR, dimple, collar, gloss } = PRESS;
  const f = (x: number) => x.toFixed(6);
  return {
    key: 'press',
    uniforms: { ...quantUniforms(mesh), uCakePress: press.press, uCakeLumps: press.lumps, uCakeSockets: press.sockets },
    vertexHead: `uniform vec3 uQS; uniform vec3 uQO;
uniform vec4 uCakePress[${CANDLE_COUNT}]; uniform vec4 uCakeLumps[${CANDLE_COUNT}]; uniform vec4 uCakeSockets[${CANDLE_COUNT}];
varying float vCakeGloss;
float cakeDy; vec2 cakeGrad;`,
    vertexNormal: `{
  vec3 cp = position * uQS + uQO;
  cakeDy = 0.0; cakeGrad = vec2(0.0); vCakeGloss = 0.0;
  if (cp.y > ${f(TOP_Y)}) {
    for (int i = 0; i < ${CANDLE_COUNT}; i++) {
      vec2 d = cp.xz - uCakeSockets[i].xy;
      float r = length(d);
      if (r > 0.045) continue;
      vec4 pr = uCakePress[i];
      float x = r - ${f(candleR)};
      // Dimple: dragged down against the candle (continued flat inside it, where it is hidden).
      float xd = max(x, -0.004);
      float dim = -${f(dimple.depth)} * pr.x * exp(-(xd * xd) / ${f(dimple.width * dimple.width)});
      float dDim = x > -0.004 ? dim * (-2.0 * xd / ${f(dimple.width * dimple.width)}) : 0.0;
      // Collar: lumpy, a little fuller on the side the candle leans to; it slumps as it warms.
      float soft = pr.y;
      float wc = ${f(collar.width)} * (1.0 + 0.35 * soft);
      float xc = ${f(collar.at)} * (1.0 + 0.15 * soft);
      float phi = atan(d.y, d.x);
      vec4 lp = uCakeLumps[i];
      float lump = 1.0 + 0.30 * sin(3.0 * phi + lp.x) + 0.18 * sin(5.0 * phi + lp.y) + 0.10 * sin(9.0 * phi + lp.x * 2.3) + 0.06 * sin(14.0 * phi + lp.y * 1.7) + 0.25 * pr.w * cos(phi - pr.z);
      float dLump = 0.90 * cos(3.0 * phi + lp.x) + 0.90 * cos(5.0 * phi + lp.y) + 0.90 * cos(9.0 * phi + lp.x * 2.3) + 0.84 * cos(14.0 * phi + lp.y * 1.7) - 0.25 * pr.w * sin(phi - pr.z);
      float ac = ${f(collar.height)} * pr.x * (1.0 - 0.3 * soft);
      float e = exp(-((x - xc) * (x - xc)) / (wc * wc));
      float col = ac * lump * e;
      float dColR = col * (-2.0 * (x - xc) / (wc * wc));
      float dColP = ac * dLump * e;
      vec2 er = d / max(r, 1e-5);
      vec2 ep = vec2(-er.y, er.x);
      cakeDy += dim + col;
      cakeGrad += (dDim + dColR) * er + (dColP / max(r, 1e-3)) * ep;
      vCakeGloss = max(vCakeGloss, soft * exp(-pow(max(x, 0.0) / ${f(gloss.reach)}, 2.0)));
    }
    vec3 nC = normalize(objectNormal / uQS);
    nC = normalize(nC + vec3(-cakeGrad.x, 0.0, -cakeGrad.y));
    objectNormal = normalize(nC * uQS);
  }
}`,
    vertexBegin: 'transformed.y += cakeDy / uQS.y;',
    fragmentHead: 'varying float vCakeGloss;',
    afterRoughness: `roughnessFactor *= 1.0 - ${f(gloss.drop)} * vCakeGloss;`,
  };
}

// ── Ridges (piping, rosettes) ──────────────────────────────────────────────────────
export function ridgePatch(): Patch {
  return {
    key: 'ridge',
    vertexHead: 'attribute float _ridge;\nvarying float vCakeRidge;',
    vertexEnd: 'vCakeRidge = _ridge;',
    fragmentHead: 'varying float vCakeRidge;',
    // Crests a touch glossier, grooves a touch matter (±12 %); the sheen lives on the crests.
    afterRoughness: 'roughnessFactor *= 1.0 - 0.12 * vCakeRidge;',
    afterLightsSetup: '#ifdef USE_SHEEN\nmaterial.sheenColor *= 0.35 + 0.9 * max(vCakeRidge, 0.0);\n#endif',
  };
}

// ── Candle melt ────────────────────────────────────────────────────────────────────
/**
 * The candle's surface as the recipe builds it (birthdayFinish.ts CANDLE_SHAPE, master scan units),
 * in GLSL, with the melt applied: `P(φ, σ)` from the flute phase φ = −2πu and the profile σ.
 */
export const CANDLE_GLSL = /* glsl */ `
const float CB = 0.586, CS = 0.796, CR = 0.8, CT = 0.8028, CRR = 0.016;
float candleFlute(float phi, float soften, float w) {
  float a = 0.001212 * cos(6.0 * phi) - 0.000132 * cos(12.0 * phi);
  return 0.017616 + a * (1.0 - soften * w);
}
// m: x shorten (scan), y round, z soften, w pool; b: x bead, y run length (scan), z run half-width (scan), w unused.
// dir: the low side (unit, local xz). Returns the point; varyings via out params.
vec3 candleP(float phi, float s, vec4 m, vec4 b, vec2 dir, out float pool, out float run) {
  pool = 0.0; run = 0.0;
  float rho = 0.0045 * m.y;                // lip fillet, up to ≈ 1 mm (scan)
  float yOrig, r, y;
  float th;
  if (s <= 1.0) {
    yOrig = CB + (CS - CB) * s;
    // The top 1 cm takes the burn-down (≤ 8 % compression there; the stripes below stay put).
    y = yOrig - m.x * smoothstep(CS - 0.045, CS, yOrig);
    float w = smoothstep(CS - 0.028, CS, yOrig);
    r = candleFlute(phi, m.z, w);
    // Fillet: the side's last ρ rounds in towards the lip.
    float t = clamp((yOrig - (CS - rho)) / max(rho, 1e-6), 0.0, 1.0);
    r -= rho * 0.55 * (1.0 - sqrt(max(1.0 - t * t, 0.0)));
  } else if (s <= 2.0) {
    float t = s - 1.0;
    yOrig = CS + (CR - CS) * t;
    y = yOrig - m.x;
    float rs = candleFlute(phi, m.z, 1.0) - rho * 0.55;
    float rim = CRR - rho * 0.5;
    float e = mix(4.0, 1.7, m.y);
    r = rs + (rim - rs) * pow(t, e);
    // The lip rises a hair with the fillet (the melted edge rolls over).
    y += rho * 0.25 * sin(3.14159 * t);
  } else {
    float t = min(1.0, s - 2.0);
    float rim = CRR - rho * 0.5;
    r = rim * (1.0 - t);
    float k = sqrt((r / rim) * (r / rim) + 0.015) - sqrt(0.015);
    float cone = (CT - CR) * (1.0 - k / (sqrt(1.015) - sqrt(0.015)));
    float rn = r / rim;
    // The pool: the cone becomes a shallow cup (−0.35 mm), filling to a meniscus that bulges as it
    // overfills (the bead), most on the low side.
    float cup = -0.0016 * (1.0 - rn * rn) + 0.0004 * exp(-pow((1.0 - rn) / 0.12, 2.0));
    yOrig = CR;
    y = CR - m.x + mix(cone, cup, m.w);
    pool = m.w * (1.0 - smoothstep(0.85, 0.98, rn));
    y += b.x * 0.0011 * (1.0 - rn * rn);
  }
  th = 0.96761 - 60.3186 * (yOrig - 0.596) + phi;
  vec2 radial = vec2(cos(th), sin(th));
  // The run: a rivulet down the low side, a rounded bead at its end, filling the grooves it crosses.
  if (b.y > 0.0 && s <= 2.0) {
    float lip = CR - m.x;
    float below = lip - y;                    // distance down from the lip
    float ang = acos(clamp(dot(radial, dir), -1.0, 1.0));
    float across = ang * 0.0178 / b.z;        // in half-widths of the stream
    float along = below / b.y;                // 0 at the lip, 1 at the bead's tip
    if (across < 2.2 && along < 1.0) {
      // The bead: centred at 0.86 of the run, 1.7× the stream's width, a rounded tip below it.
      float bulb = exp(-pow((along - 0.86) / 0.1, 2.0));
      float tip = along > 0.86 ? sqrt(max(1.0 - pow((along - 0.86) / 0.14, 2.0), 0.0)) : 1.0;
      float width = (1.0 + 0.7 * bulb) * tip;
      float a = across / max(width, 1e-3);
      // A smooth cap across (C1 at the contact line, so the edge shades softly).
      float prof = a < 1.0 ? pow(1.0 - a * a, 2.0) : 0.0;
      // Over the ridges: 0.5 mm at the lip to 0.65 mm down the stream, 1.2 mm at the bead.
      float thick = 0.0023 + 0.0007 * along + 0.0032 * bulb;
      float target = 0.0187 - 0.0012 * m.z * smoothstep(CS - 0.028, CS, yOrig) + thick * tip;
      float lipFade = s > 1.0 ? 1.0 - smoothstep(1.3, 2.0, s) : 1.0;
      float h = prof * lipFade;
      r = max(r, mix(r, target, h));
      run = smoothstep(0.0, 0.25, h);
    }
  }
  // The bead hangs over the rim on the low side before it runs.
  if (s > 1.4 && s <= 2.0) r += b.x * 0.0005 * max(dot(radial, dir), 0.0) * smoothstep(1.4, 2.0, s);
  return vec3(r * radial.x, y, r * radial.y);
}
`;

export interface CandleMelt {
  /** x shorten (scene units), y round, z soften, w pool. */
  readonly a: { value: Vector4 };
  /** x bead, y run length (scene units), z run half-width (scene units). */
  readonly b: { value: Vector4 };
  /** The low side in the wax node's own frame (unit xz). */
  readonly dir: { value: { x: number; y: number } };
  /** The wax body colour (linear) the pool and run show. */
  readonly body: { value: Vector3 };
}

export function meltPatch(mesh: Mesh, melt: CandleMelt): Patch {
  const s = (1 / CAKE_SCALE).toFixed(6);
  return {
    key: 'melt',
    uniforms: { ...quantUniforms(mesh), uMeltA: melt.a, uMeltB: melt.b, uMeltDir: melt.dir, uWaxBody: melt.body },
    vertexHead: `uniform vec3 uQS; uniform vec3 uQO; uniform vec4 uMeltA; uniform vec4 uMeltB; uniform vec2 uMeltDir;
attribute float _profile;
varying float vMeltPool; varying float vMeltRun;
vec3 meltD; ${CANDLE_GLSL}`,
    vertexNormal: `{
  meltD = vec3(0.0); vMeltPool = 0.0; vMeltRun = 0.0;
  float sg = _profile;
  bool meltOn = sg >= 0.0 && (uMeltA.x + uMeltA.y + uMeltA.z + uMeltA.w + uMeltB.x + uMeltB.y) > 0.0;
  if (meltOn) {
    // Scan units in the master's candle frame: melt amounts arrive in scene units.
    vec4 m = vec4(uMeltA.x * ${s}, uMeltA.yzw);
    vec4 b = vec4(uMeltB.x, uMeltB.y * ${s}, uMeltB.z * ${s}, 0.0);
    vec4 z = vec4(0.0);
    float phi = -6.28318530718 * uv.x;
    float p0, r0, pm, rm, dummy, dummy2;
    vec3 P0 = candleP(phi, sg, z, z, uMeltDir, p0, r0);
    vec3 Pm = candleP(phi, sg, m, b, uMeltDir, pm, rm);
    vMeltPool = pm; vMeltRun = rm;
    meltD = (Pm - P0) * ${CAKE_SCALE.toFixed(6)};
    // Normals: the change in the analytic normal, added to the mesh's own.
    float e = 0.004;
    float se = sg < 2.0 ? min(sg + 0.01, 3.0) : min(sg + 0.01, 2.98);
    vec3 a0 = candleP(phi + e, sg, z, z, uMeltDir, dummy, dummy2) - candleP(phi - e, sg, z, z, uMeltDir, dummy, dummy2);
    vec3 b0 = candleP(phi, se, z, z, uMeltDir, dummy, dummy2) - P0;
    vec3 am = candleP(phi + e, sg, m, b, uMeltDir, dummy, dummy2) - candleP(phi - e, sg, m, b, uMeltDir, dummy, dummy2);
    vec3 bm = candleP(phi, se, m, b, uMeltDir, dummy, dummy2) - Pm;
    vec3 n0 = cross(a0, b0), nm = cross(am, bm);
    float l0 = length(n0), lm = length(nm);
    if (l0 > 1e-12 && lm > 1e-12) {
      n0 /= l0; nm /= lm;
      // Orientation as the mesh's (outward / up).
      vec3 nW = normalize(objectNormal / uQS);
      if (dot(n0, nW) < 0.0) { n0 = -n0; nm = -nm; }
      objectNormal = normalize(normalize(nW + nm - n0) * uQS);
    }
  }
}`,
    vertexBegin: 'transformed += meltD / uQS;',
    fragmentHead: 'uniform vec3 uWaxBody;\nvarying float vMeltPool; varying float vMeltRun;',
    // Molten wax is the candle's body colour, deeper (more translucent), and the pool is liquid.
    afterMap: 'diffuseColor.rgb = mix(diffuseColor.rgb, uWaxBody * 0.86, clamp(max(vMeltPool, vMeltRun * 0.9), 0.0, 1.0));',
    afterRoughness: 'roughnessFactor = mix(roughnessFactor, 0.07, vMeltPool); roughnessFactor = mix(roughnessFactor, 0.3, vMeltRun);',
  };
}

export const MELT_GEOMETRY = { candleHeight: CANDLE.height } as const;
