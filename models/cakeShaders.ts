import { BufferGeometry, Float32BufferAttribute, type IUniform, type Material, type Mesh, type Object3D, ShaderChunk, Vector3, Vector4 } from 'three';
import { CANDLE, CANDLE_COUNT, CANDLE_SOCKETS, MASTER, CAKE_SCALE } from './birthdayContract.ts';

/**
 * v1.5 runtime shading for the hand-finished cake (scripts/masters/recipes/birthdayFinish.ts builds
 * the geometry and maps these read). One composable `onBeforeCompile` per cake material:
 *
 * - (the bin's light on the cake inside it is models/disposalBin.ts patchBinVisibility, chained
 *   after these and the flame light by models/birthday.ts; v1.2.1–v1.4 had a darkening ramp here);
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
  /** Dimple: the buttercream dragged down against the candle, depth and width (0.6 mm, 0.8 mm). */
  dimple: { depth: 0.003, width: 0.004 },
  /**
   * Collar (v1.5 polish, for a 10 mm insertion): the plug pushed aside rises as a ring ≈ 2.2 mm
   * out, ≈ 1.6 mm high, ≈ 1.8 mm wide (σ): ≈ 210 mm³, 40 % of the 500 mm³ the candle displaced
   * (the rest is compressed into the crumb). Readable at laptop size (≈ 1.45 px/mm).
   */
  collar: { height: 0.008, at: 0.011, width: 0.009 },
  /** Contact occlusion where the candle stands in the frosting: reach (1.4 mm) and strength. */
  foot: { reach: 0.007, strength: 0.6 },
  /**
   * The buttercream round a burning candle warms, its fat softens: within ≈ 8 mm of the candle it
   * glosses (roughness down to 40 %), darkens a shade (melted fat is more translucent: −8 %) and
   * slumps (−0.5 mm, the collar's lumps relax). v1.5 polish: v1's 2.4 mm, −35 % read as nothing,
   * and 5 mm, −50 % only within the collar.
   */
  gloss: { reach: 0.04, drop: 0.6, darken: 0.08, slump: 0.0025 },
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
  /** After `#include <normal_fragment_maps>`: may edit `normal` (view space). */
  afterNormal?: string;
  /** After `#include <lights_fragment_end>`: may scale `reflectedLight`'s indirect terms (occlusion). */
  afterLights?: string;
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
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${join('afterNormal')}`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${join('afterLights')}`)
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

// ── Bin shade gate (v1.5: models/disposalBin.ts patchBinVisibility does the shading) ─────────
/** The cake is switched to the bin's light only while all of it is `above` this far over the rim. */
export const BIN_SHADE = { above: 0.02 } as const;
export interface BinShade {
  readonly rimY: { value: number };
  readonly on: { value: number };
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
varying float vCakeGloss; varying float vCakeFoot;
float cakeDy; vec2 cakeGrad;`,
    vertexNormal: `{
  vec3 cp = position * uQS + uQO;
  cakeDy = 0.0; cakeGrad = vec2(0.0); vCakeGloss = 0.0; vCakeFoot = 0.0;
  if (cp.y > ${f(TOP_Y)}) {
    for (int i = 0; i < ${CANDLE_COUNT}; i++) {
      vec2 d = cp.xz - uCakeSockets[i].xy;
      float r = length(d);
      if (r > 0.075) continue;
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
      float lumpK = 1.0 - 0.6 * soft;
      float lump = 1.0 + lumpK * (0.30 * sin(3.0 * phi + lp.x) + 0.18 * sin(5.0 * phi + lp.y) + 0.10 * sin(9.0 * phi + lp.x * 2.3) + 0.06 * sin(14.0 * phi + lp.y * 1.7)) + 0.25 * pr.w * cos(phi - pr.z);
      float dLump = lumpK * (0.90 * cos(3.0 * phi + lp.x) + 0.90 * cos(5.0 * phi + lp.y) + 0.90 * cos(9.0 * phi + lp.x * 2.3) + 0.84 * cos(14.0 * phi + lp.y * 1.7)) - 0.25 * pr.w * sin(phi - pr.z);
      float ac = ${f(collar.height)} * pr.x * (1.0 - 0.3 * soft);
      float e = exp(-((x - xc) * (x - xc)) / (wc * wc));
      float col = ac * lump * e;
      float dColR = col * (-2.0 * (x - xc) / (wc * wc));
      float dColP = ac * dLump * e;
      vec2 er = d / max(r, 1e-5);
      vec2 ep = vec2(-er.y, er.x);
      cakeDy += dim + col;
      cakeGrad += (dDim + dColR) * er + (dColP / max(r, 1e-3)) * ep;
      vCakeFoot = max(vCakeFoot, pr.x * exp(-pow(max(x, 0.0) / ${f(PRESS.foot.reach)}, 2.0)));
      // (Windowed to 0 by the 7.5 cm cut-off, so no ring shows where the loop stops.)
      float win = 1.0 - smoothstep(0.055, 0.075, r);
      float warm = soft * win * exp(-pow(max(x, 0.0) / ${f(gloss.reach)}, 2.0));
      vCakeGloss = max(vCakeGloss, warm);
      // The warmed buttercream slumps a little (a smooth bowl, with its gradient).
      float sl = -${f(gloss.slump)} * warm;
      float dSl = x > 0.0 ? sl * (-2.0 * x / ${f(gloss.reach * gloss.reach)}) : 0.0;
      cakeDy += sl;
      cakeGrad += dSl * er;
    }
    vec3 nC = normalize(objectNormal / uQS);
    nC = normalize(nC + vec3(-cakeGrad.x, 0.0, -cakeGrad.y));
    objectNormal = normalize(nC * uQS);
  }
}`,
    vertexBegin: 'transformed.y += cakeDy / uQS.y;',
    fragmentHead: 'varying float vCakeGloss; varying float vCakeFoot;',
    afterMap: `diffuseColor.rgb *= 1.0 - ${f(gloss.darken)} * vCakeGloss;`,
    // The candle stands in the frosting: the buttercream right round its foot sees little room.
    afterLights: `reflectedLight.indirectDiffuse *= 1.0 - ${f(PRESS.foot.strength)} * vCakeFoot;
  reflectedLight.indirectSpecular *= 1.0 - ${f(PRESS.foot.strength * 0.7)} * vCakeFoot;
  reflectedLight.directDiffuse *= 1.0 - ${f(PRESS.foot.strength * 0.4)} * vCakeFoot;`,
    afterRoughness: `roughnessFactor *= 1.0 - ${f(gloss.drop)} * vCakeGloss;`,
  };
}

// ── Ridges (piping, rosettes) ──────────────────────────────────────────────────────
/**
 * Satin, not clay (v1.5 polish): buttercream is fat and sugar, its piped crests carry a soft broad
 * highlight and the grooves stay matt. Roughness follows the per-vertex convexity `_ridge` from
 * 0.62 in the grooves to 0.36 on the crests (absolute, over the material's own), the very slight
 * sheen lives on the crests, and a fine grain (≈ 0.6 mm, ±8 µm, faded out where a pixel covers it)
 * breaks the perfectly smooth, moulded read of the rosettes' and shells' faces.
 */
export const RIDGE = { groove: 0.62, crest: 0.36, grain: { freq: 330, amp: 0.00004 } } as const;

const CAKE_NOISE = /* glsl */ `
float cakeHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float cakeNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(cakeHash(i), cakeHash(i + vec3(1, 0, 0)), f.x), mix(cakeHash(i + vec3(0, 1, 0)), cakeHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(cakeHash(i + vec3(0, 0, 1)), cakeHash(i + vec3(1, 0, 1)), f.x), mix(cakeHash(i + vec3(0, 1, 1)), cakeHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
vec3 cakeBump(vec3 surfPos, vec3 surfNorm, float h, float faceDir) {
  vec3 sx = dFdx(surfPos), sy = dFdy(surfPos);
  vec3 r1 = cross(sy, surfNorm), r2 = cross(surfNorm, sx);
  float det = dot(sx, r1) * faceDir;
  vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
  return normalize(abs(det) * surfNorm - grad);
}
`;

export function ridgePatch(mesh: Mesh): Patch {
  const f = (x: number) => x.toFixed(6);
  return {
    key: 'ridge2',
    uniforms: { ...quantUniforms(mesh) },
    vertexHead: 'attribute float _ridge;\nvarying float vCakeRidge;\nvarying vec3 vCakeP;\nuniform vec3 uQS; uniform vec3 uQO;',
    vertexEnd: 'vCakeRidge = _ridge;\nvCakeP = transformed * uQS + uQO;',
    fragmentHead: `varying float vCakeRidge;\nvarying vec3 vCakeP;\n${CAKE_NOISE}`,
    afterRoughness: `roughnessFactor = mix(${f(RIDGE.groove)}, ${f(RIDGE.crest)}, smoothstep(-0.6, 0.9, vCakeRidge));`,
    afterNormal: `{
  vec3 gp = vCakeP * ${f(RIDGE.grain.freq)};
  float px = length(fwidth(gp));
  float fadeG = 1.0 - smoothstep(0.35, 0.9, px);
  if (fadeG > 0.0) {
    float h = ${f(RIDGE.grain.amp)} * fadeG * (cakeNoise(gp) + 0.5 * cakeNoise(gp * 2.17 + 3.1));
    normal = cakeBump(-vViewPosition, normal, h, faceDirection);
  }
}`,
    afterLightsSetup: '#ifdef USE_SHEEN\nmaterial.sheenColor *= 0.3 + 1.1 * max(vCakeRidge, 0.0);\n#endif',
  };
}

// ── Contact occlusion where the cake meets the plate ───────────────────────────────
/**
 * The bead border rests on the plate (v1.5 polish: it read as set onto it): its underside and the
 * frosting's foot lose most of the room's light within ≈ 3 mm of the plate (cake space height:
 * the plate's top is 10.4 mm above the cake's underside centre, where the border beds in).
 */
export const CONTACT = { plateY: 0.0104, reach: 0.016, floor: 0.45 } as const;

export function contactPatch(mesh: Mesh): Patch {
  const f = (x: number) => x.toFixed(6);
  return {
    key: 'contact',
    uniforms: { uQSc: { value: mesh.scale.clone() }, uQOc: { value: mesh.position.clone() } },
    vertexHead: 'varying float vCakeY;\nuniform vec3 uQSc; uniform vec3 uQOc;',
    vertexEnd: 'vCakeY = transformed.y * uQSc.y + uQOc.y;',
    fragmentHead: 'varying float vCakeY;',
    afterLights: `{
  float cakeAO = mix(${f(CONTACT.floor)}, 1.0, smoothstep(${f(CONTACT.plateY - 0.004)}, ${f(CONTACT.plateY + CONTACT.reach)}, vCakeY));
  reflectedLight.indirectDiffuse *= cakeAO;
  reflectedLight.indirectSpecular *= mix(1.0, cakeAO, 0.7);
  reflectedLight.directDiffuse *= mix(1.0, cakeAO, 0.35);
}`,
  };
}

/**
 * The plate round the cake's foot (the stand's material): a soft occlusion ring that starts at the
 * border's edge and fades over ≈ 1.5 cm, and goes when the cake is lifted.
 */
export interface PlateContact {
  readonly lift: { value: number };
  /** The bead border's foot on the plate (measured from the frosting at rig time): centre xz, radius. */
  readonly foot: { value: Vector3 };
}
export function plateContactPatch(contact: PlateContact): Patch {
  return {
    key: 'plate',
    uniforms: { uCakeLift: contact.lift, uCakeFoot: contact.foot },
    vertexHead: 'varying vec3 vPlateP;',
    vertexEnd: 'vPlateP = (modelMatrix * vec4(transformed, 1.0)).xyz;',
    fragmentHead: 'varying vec3 vPlateP;\nuniform float uCakeLift;\nuniform vec3 uCakeFoot;',
    afterLights: `{
  float pr = length(vPlateP.xz - uCakeFoot.xy) - uCakeFoot.z;
  float up = smoothstep(0.6, 0.9, dot(normal, normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz)));
  float ring = exp(-max(pr, 0.0) / 0.012) * (1.0 - smoothstep(0.05, 0.08, pr));
  float on = 1.0 - smoothstep(0.004, 0.03, uCakeLift);
  float ao = 1.0 - 0.5 * ring * on * up;
  reflectedLight.indirectDiffuse *= ao;
  reflectedLight.indirectSpecular *= mix(1.0, ao, 0.6);
}`,
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
// m: x shorten (scan), y round, z soften, w pool (the cup under the liquid).
vec3 candleP(float phi, float s, vec4 m) {
  float rho = 0.0045 * m.y;                // lip fillet, up to ≈ 1 mm (scan)
  float yOrig, r, y;
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
    // Under the pool: the cone melts into a shallow cup (−0.35 mm) inside a thin raised lip.
    float cup = -0.0016 * (1.0 - rn * rn) + 0.0004 * exp(-pow((1.0 - rn) / 0.12, 2.0));
    yOrig = CR;
    y = CR - m.x + mix(cone, cup, m.w);
  }
  float th = 0.96761 - 60.3186 * (yOrig - 0.596) + phi;
  return vec3(r * cos(th), y, r * sin(th));
}
`;

export interface CandleMelt {
  /** x shorten (scene units), y round, z soften, w pool. */
  readonly a: { value: Vector4 };
  /** x bead (0–1), y run length (scene units). */
  readonly b: { value: Vector4 };
  /** The low side in the wax node's own frame (unit xz). */
  readonly dir: { value: { x: number; y: number } };
  /** The wax body colour (linear) the pool and run show. */
  readonly body: { value: Vector3 };
  /** The groove the run follows: its flute phase φ (radians, the surface's own parameter). */
  readonly groove: { value: number };
  /** How set the molten wax is (0 liquid – 1 opaque, satin: melt.ts solidify). */
  readonly solid: { value: number };
  /** How far the candle is pushed in (0–1): the occlusion at its foot. */
  readonly foot: { value: number };
}

/** The candle's own wax: the lip rounds, the twist's ridges relax near the top, the top burns down and cups. */
export function meltPatch(mesh: Mesh, melt: CandleMelt): Patch {
  const s = (1 / CAKE_SCALE).toFixed(6);
  return {
    key: 'melt2',
    uniforms: { ...quantUniforms(mesh), uMeltA: melt.a, uCandleFoot: melt.foot },
    vertexHead: `uniform vec3 uQS; uniform vec3 uQO; uniform vec4 uMeltA;
attribute float _profile;
varying float vWaxY;
vec3 meltD; ${CANDLE_GLSL}`,
    vertexNormal: `{
  meltD = vec3(0.0);
  float sg = _profile;
  if (sg >= 0.0 && (uMeltA.x + uMeltA.y + uMeltA.z + uMeltA.w) > 0.0) {
    // Scan units in the master's candle frame: melt amounts arrive in scene units.
    vec4 m = vec4(uMeltA.x * ${s}, uMeltA.yzw);
    vec4 z = vec4(0.0);
    float phi = -6.28318530718 * uv.x;
    vec3 P0 = candleP(phi, sg, z);
    vec3 Pm = candleP(phi, sg, m);
    meltD = (Pm - P0) * ${CAKE_SCALE.toFixed(6)};
    // Normals: the change in the analytic normal, added to the mesh's own.
    float e = 0.004;
    float se = sg < 2.0 ? min(sg + 0.01, 3.0) : min(sg + 0.01, 2.98);
    vec3 a0 = candleP(phi + e, sg, z) - candleP(phi - e, sg, z);
    vec3 b0 = candleP(phi, se, z) - P0;
    vec3 am = candleP(phi + e, sg, m) - candleP(phi - e, sg, m);
    vec3 bm = candleP(phi, se, m) - Pm;
    vec3 n0 = cross(a0, b0), nm = cross(am, bm);
    float l0 = length(n0), lm = length(nm);
    if (l0 > 1e-12 && lm > 1e-12) {
      n0 /= l0; nm /= lm;
      vec3 nW = normalize(objectNormal / uQS);
      if (dot(n0, nW) < 0.0) { n0 = -n0; nm = -nm; }
      objectNormal = normalize(normalize(nW + nm - n0) * uQS);
    }
  }
}`,
    vertexBegin: 'transformed += meltD / uQS;',
    vertexEnd: 'vWaxY = transformed.y * uQS.y + uQO.y;',
    fragmentHead: 'uniform float uCandleFoot;\nvarying float vWaxY;',
    // Where it stands in the frosting (the collar rises ≈ 2 mm round it) the wax sees little room.
    afterLights: `{
  float footAO = 1.0 - 0.55 * uCandleFoot * (1.0 - smoothstep(${(CANDLE.insert - 0.002).toFixed(6)}, ${(CANDLE.insert + 0.016).toFixed(6)}, vWaxY));
  reflectedLight.indirectDiffuse *= footAO;
  reflectedLight.indirectSpecular *= footAO;
  reflectedLight.directDiffuse *= mix(1.0, footAO, 0.5);
}`,
  };
}

/**
 * Molten wax as its own surfaces (v1.5 polish: a drip pushed out of the candle's own surface
 * stretched the stripes through it, creased under the bead and notched the rim):
 *
 * - the run: a rivulet of the candle's body wax that leaves the pool over the lip on the low side
 *   and runs down the twist's groove (wax flows along the channel), ≈ 1.8 mm wide and 0.7 mm proud
 *   of the groove, ending in a rounded bead 2.9 mm across; its length is CandleMelt.b.y;
 * - the pool: the liquid filling the cup round the wick, a glossy disc with a meniscus that domes
 *   into a bead as it overfills.
 *
 * Both are drawn in the wax node's frame (master candle × CAKE_SCALE, base at the origin) from the
 * analytic candle surface, so they sit on the melted top whatever its shape.
 */
export const RUN_GRID = { along: 56, around: 12 } as const;
export const POOL_GRID = { rings: 10, around: 40 } as const;

export function runGeometry(): BufferGeometry {
  const g = new BufferGeometry();
  const ac: number[] = [], idx: number[] = [];
  const { along: A, around: C } = RUN_GRID;
  for (let i = 0; i <= A; i++) for (let j = 0; j <= C; j++) ac.push(i / A, (j / C) * Math.PI);
  for (let i = 0; i < A; i++) for (let j = 0; j < C; j++) {
    const k = i * (C + 1) + j;
    idx.push(k, k + 1, k + C + 1, k + 1, k + C + 2, k + C + 1);
  }
  g.setAttribute('position', new Float32BufferAttribute(new Float32Array(ac.length / 2 * 3), 3));
  g.setAttribute('normal', new Float32BufferAttribute(new Float32Array(ac.length / 2 * 3), 3));
  g.setAttribute('uv', new Float32BufferAttribute(new Float32Array(ac.length), 2));
  g.setAttribute('aMelt', new Float32BufferAttribute(ac, 2));
  g.setIndex(idx);
  return g;
}

export function poolGeometry(): BufferGeometry {
  const g = new BufferGeometry();
  const ra: number[] = [], idx: number[] = [];
  const { rings: R, around: C } = POOL_GRID;
  ra.push(0, 0);
  for (let i = 1; i <= R; i++) for (let j = 0; j < C; j++) ra.push(i / R, (j / C) * 2 * Math.PI);
  for (let j = 0; j < C; j++) idx.push(0, 1 + ((j + 1) % C), 1 + j);
  for (let i = 1; i < R; i++) for (let j = 0; j < C; j++) {
    const a = 1 + (i - 1) * C + j, b = 1 + (i - 1) * C + ((j + 1) % C), c = 1 + i * C + j, d = 1 + i * C + ((j + 1) % C);
    idx.push(a, b, c, b, d, c);
  }
  g.setAttribute('position', new Float32BufferAttribute(new Float32Array(ra.length / 2 * 3), 3));
  g.setAttribute('normal', new Float32BufferAttribute(new Float32Array(ra.length / 2 * 3), 3));
  g.setAttribute('uv', new Float32BufferAttribute(new Float32Array(ra.length), 2));
  g.setAttribute('aMelt', new Float32BufferAttribute(ra, 2));
  g.setIndex(idx);
  return g;
}

const WAX_HEAD = (s: string) => `uniform vec4 uMeltA; uniform vec4 uMeltB; uniform vec2 uMeltDir; uniform float uRunPhi;
attribute vec2 aMelt;
vec3 meltP; vec3 meltN;
${CANDLE_GLSL}
vec4 meltM() { return vec4(uMeltA.x * ${s}, uMeltA.yzw); }
// Wax node units from the master's scan units (base at the origin).
vec3 toWax(vec3 p) { return vec3(p.x, p.y - CB, p.z) * ${CAKE_SCALE.toFixed(6)}; }`;

/** The run's point at (a along, c around) on the melted surface (scan units). */
const RUN_POINT = /* glsl */ `
// The run's centre line, frame and cross-section at a ∈ [0, 1] along it (scan units).
void runFrame(float a, vec4 m, float len, out vec3 B, out vec3 side, out vec3 N, out float w, out float h) {
  float shoulder = (CR - CS) + 0.0045 * m.y;
  float total = shoulder + len;
  float d = a * total;
  float sg = d < shoulder ? 2.0 - d / shoulder : 1.0 - (d - shoulder) / (CS - CB);
  B = candleP(uRunPhi, sg, m);
  vec3 T = normalize(candleP(uRunPhi, sg - 0.003, m) - B);
  vec3 S = normalize(candleP(uRunPhi + 0.02, sg, m) - B);
  N = normalize(cross(S, T));
  // Outward from the candle (on the shoulder, outward-and-up).
  if (dot(N, vec3(B.x, 0.0, B.z)) < 0.0) N = -N;
  side = normalize(cross(N, T));
  // Profile: it leaves the pool narrow, runs ≈ 1.8 mm wide and 0.7 mm proud, ends in a bead.
  float bead = exp(-pow((a - 0.86) / 0.09, 2.0));
  float tip = a > 0.86 ? sqrt(max(1.0 - pow((a - 0.86) / 0.14, 2.0), 0.0)) : 1.0;
  float start = smoothstep(0.0, 0.1, a);
  w = (0.0041 + 0.0025 * bead) * tip * (0.55 + 0.45 * start);
  h = (0.0030 + 0.0006 * a + 0.0028 * bead) * tip * (0.45 + 0.55 * start);
}
vec3 runPoint(float a, float c, vec4 m, float len) {
  vec3 B, side, N; float w, h;
  runFrame(a, m, len, B, side, N, w, h);
  return B + side * (w * cos(c)) + N * (h * sin(c) - 0.0005);
}`;

export function runPatch(melt: CandleMelt): Patch {
  const s = (1 / CAKE_SCALE).toFixed(6);
  return {
    key: 'run',
    uniforms: { uMeltA: melt.a, uMeltB: melt.b, uMeltDir: melt.dir, uRunPhi: melt.groove, uSolid: melt.solid },
    vertexHead: WAX_HEAD(s) + RUN_POINT,
    vertexNormal: `{
  vec4 m = meltM();
  float len = uMeltB.y * ${s};
  float a = aMelt.x, c = aMelt.y;
  vec3 B, side, N; float w, h;
  runFrame(a, m, len, B, side, N, w, h);
  vec3 P = B + side * (w * cos(c)) + N * (h * sin(c) - 0.0005);
  // Analytic cross-section normal, refined by the along-slope where the bead swells.
  vec3 nA = normalize(side * (cos(c) * max(h, 1e-6)) + N * (sin(c) * max(w, 1e-6)));
  vec3 Pa = runPoint(min(a + 0.01, 1.0), c, m, len) - runPoint(max(a - 0.01, 0.0), c, m, len);
  vec3 Pc = runPoint(a, min(c + 0.05, 3.14159), m, len) - runPoint(a, max(c - 0.05, 0.0), m, len);
  vec3 n = cross(Pc, Pa);
  n = length(n) > 1e-14 ? normalize(n) : nA;
  if (dot(n, nA) < 0.0) n = -n;
  meltP = toWax(P);
  objectNormal = normalize(mix(nA, n, 0.7));
}`,
    fragmentHead: 'uniform float uSolid;',
    // Setting wax: clear and glossy while liquid, opaque and satin once set (paler, no clearcoat).
    afterMap: 'diffuseColor.rgb *= mix(1.0, 1.22, uSolid);',
    afterRoughness: 'roughnessFactor = mix(roughnessFactor, 0.45, uSolid);',
    afterLightsSetup: '#ifdef USE_CLEARCOAT\nmaterial.clearcoat *= 1.0 - uSolid;\n#endif',
    vertexBegin: 'transformed = meltP;',
  };
}

export function poolPatch(melt: CandleMelt): Patch {
  const s = (1 / CAKE_SCALE).toFixed(6);
  return {
    key: 'pool',
    uniforms: { uMeltA: melt.a, uMeltB: melt.b, uMeltDir: melt.dir, uRunPhi: melt.groove, uSolid: melt.solid },
    vertexHead: WAX_HEAD(s) + `
vec3 poolPoint(float rn, float th, vec4 m, float bead, vec2 dir) {
  float rim = CRR - 0.0045 * m.y * 0.5 - 0.0003;
  float r = rn * rim;
  vec2 xz = vec2(cos(th), sin(th)) * r;
  // Liquid stands just under the lip (the cup is full), domes as it overfills, most on the low side.
  float fill = -0.0016 + 0.0012 * smoothstep(0.0, 1.0, m.w);
  float dome = bead * (0.0010 * (1.0 - rn * rn) + 0.0005 * rn * rn * max(dot(normalize(xz + 1e-6), dir), 0.0));
  return vec3(xz.x, CR - m.x + fill + dome, xz.y);
}`,
    vertexNormal: `{
  vec4 m = meltM();
  float rn = aMelt.x, th = aMelt.y;
  vec3 P = poolPoint(rn, th, m, uMeltB.x, uMeltDir);
  vec3 dr = poolPoint(min(rn + 0.02, 1.0), th, m, uMeltB.x, uMeltDir) - poolPoint(max(rn - 0.02, 0.0), th, m, uMeltB.x, uMeltDir);
  vec3 dt = poolPoint(max(rn, 0.05), th + 0.05, m, uMeltB.x, uMeltDir) - poolPoint(max(rn, 0.05), th - 0.05, m, uMeltB.x, uMeltDir);
  vec3 n = normalize(cross(dt, dr));
  if (n.y < 0.0) n = -n;
  meltP = toWax(P);
  meltN = rn < 0.01 ? vec3(0.0, 1.0, 0.0) : n;
  objectNormal = meltN;
}`,
    fragmentHead: 'uniform float uSolid;',
    // Setting wax: clear and glossy while liquid, opaque and satin once set (paler, no clearcoat).
    afterMap: 'diffuseColor.rgb *= mix(1.0, 1.22, uSolid);',
    afterRoughness: 'roughnessFactor = mix(roughnessFactor, 0.45, uSolid);',
    afterLightsSetup: '#ifdef USE_CLEARCOAT\nmaterial.clearcoat *= 1.0 - uSolid;\n#endif',
    vertexBegin: 'transformed = meltP;',
  };
}

/** The run's groove: the flute groove nearest the low side at the lip (φ with 6φ ≡ π). */
export function runGroove(dirX: number, dirZ: number): number {
  const twistLip = 0.96761 - 60.3186 * (0.796 - 0.596);
  const want = Math.atan2(dirZ, dirX) - twistLip;
  const k = Math.round((want - Math.PI / 6) / (Math.PI / 3));
  return Math.PI / 6 + k * (Math.PI / 3);
}

export const MELT_GEOMETRY = { candleHeight: CANDLE.height } as const;
