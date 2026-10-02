import {
  Box3, BufferAttribute, BufferGeometry, Color, type DirectionalLight, type Euler, type Material, Matrix4, type Mesh, MeshDepthMaterial, MeshPhysicalMaterial,
  MeshStandardMaterial, type Object3D, Quaternion, type SpotLight, Vector2, Vector3,
} from 'three';
import { beveledPlate, group, mesh } from './geometry.ts';
import { ExtrudeGeometry, Shape } from 'three';
import { prepareImported } from './imported.ts';
import type { ModelContext } from './types.ts';

/**
 * Shared disposal bin (Birthday and Dinner decline), v1.5: a real 47 cm butterfly pedal bin.
 *
 * Product reference (research, 2026-10-02): the round premium pedal bins (Brabantia NewIcon 20 L:
 * Ø 29 × 46.7 cm; Vipp 15: Ø 29 × 52.5 cm; Vipp 14: Ø 30 × 37 cm) and simplehuman's butterfly
 * step cans (a lid split down the middle, each half hinged at its outer edge, so the open bin
 * needs half the headroom of a single lid; the pedal at the front, under the split). This one
 * swallows the 27.7 cm cake and the 27 cm plate: a 29.6 cm mouth, Ø 32.4 cm over the base, 47 cm
 * tall closed (h/d 1.45, between the Vipp 14 and the Brabantia 20 L).
 *
 * Construction, as the real product is built:
 * - body: a rolled steel shell, warm graphite powder coat, a rolled bead at the top edge;
 * - base: a satin black PP cup the shell stands in, 4 mm proud of it, on a 4 mm rubber foot ring;
 * - lid ring: satin black PP clipped over the bead (a 1 mm shadow seam under its overhang); it
 *   carries the hinges' middle knuckles and holds the inner bucket's lip;
 * - inner bucket: mid-grey PP, a rolled lip just inside the ring, a 38.6 cm deep well;
 * - butterfly lid: two halves pressed from brushed stainless coil (a gentle dome, 2.5 cm crown, a
 *   rolled 5.5 mm edge, a hemmed, recessed underside), 2 mm apart at the split, each hinged on a
 *   straight chord at its outer edge: three-knuckle hinges (two PP leaves on the lid, the ring's
 *   moulded knuckle between them, a black-oxide pin) inside the lid ring's silhouette;
 * - pedal: under the split, a brushed-stainless lever with a curved tip on a pin hinge at the
 *   front of a PP housing moulded round the base, with a black polystyrene tread (v1.5 polish:
 *   was a coral elastomer insert, v1.1's brand accent, which read as a toy sticker next to the
 *   masters). It is linked to the lid: it goes down as the flaps open (`attachBin`).
 *
 * Every edge that catches light is filleted (0.1–1 cm radii); every surface is a named PBR
 * material whose textures (micro-normal, roughness, baked occlusion) are generated at export by
 * `scripts/bin/` (WebP, `pnpm models bin`). The builder here is the geometry and the material
 * factors, so tooling that builds the bin in code (lookdev, tests) gets the same shapes.
 *
 * Units: the profiles are in centimetres; the bin is built in world units (1 unit = 20 cm), so
 * it stands at its real size in any scene whose root has world scale 1. A scene with another
 * world scale gives `bin_root` the inverse scale (`attachBin`), so the bin keeps its real size.
 */

/** Centimetres → world units. */
const U = 1 / 20;

/** Clear mouth radius (cm): the cake (13.84 cm across its piping, upright by then) plus 8 mm. */
const MOUTH = 14.8;
/** Lid-ring top above the floor (cm): the rim; the closed lid's crown is 2.5 cm above it. */
const RIM = 44.5;

/** The design in centimetres (the source of every number below). */
export const BIN_CM = {
  /** Powder-coated shell radius, base-cup outer radius, lid-ring outer radius. */
  body: MOUTH + 1.0,
  base: MOUTH + 1.42,
  ring: MOUTH + 1.24,
  /** Clear mouth: the inner bucket's wall (straight to the floor fillet). */
  mouth: MOUTH,
  /** Top of the lid ring (the flaps rest on it; the hinge plane), and the closed lid's crown. */
  rimTop: RIM,
  crown: RIM + 2.5,
  /** Top of the inner bucket's floor. */
  floor: 5.95,
  /** Lid half-shell outline radius, split half-gap (2 mm gap), split corner radius, hinge chord. */
  lid: MOUTH + 0.85,
  splitGap: 0.1,
  lidCorner: 0.3,
  lidChord: MOUTH + 0.18,
  /** Lid shell: edge top above the ring, dome rise to the crown, shell depth (rim lip). */
  lidEdge: 0.6,
  lidRise: 1.9,
  lidDepth: 0.55,
  /** Hinge pin axis: distance from the axis (along local x; the knuckles' outer edge is the ring's flat top edge) and height above the ring top. */
  hingeX: MOUTH + 0.58,
  hingeY: 0.26,
} as const;

export const BIN = {
  /** Outer radius of the lathe body (the base cup): plan clearance and the contact shadow. */
  radius: BIN_CM.base * U,
  /** Lid-ring top above the floor: the rim objects clear and sink below. */
  rimTop: BIN_CM.rimTop * U,
  /** Closed height (lid crown). */
  height: BIN_CM.crown * U,
  /** Clear opening radius: the inner bucket's wall, straight down to its floor. */
  opening: BIN_CM.mouth * U,
  /** Inner bucket floor (the lowest point anything dropped in rests on). */
  floor: BIN_CM.floor * U,
  /** Flap hinge pin: x = ±hingeX at hingeY above the rim top, axis along z. */
  hingeX: BIN_CM.hingeX * U,
  hingeY: BIN_CM.hingeY * U,
  /**
   * Flap opening angle (each flap rotates about its hinge; 0 closed): 90°, upright, as a butterfly
   * lid's halves stand open (v1.5 polish; was 100°, leaning out like ears).
   */
  flapOpen: Math.PI / 2,
  /** Pedal position around the base, from the bin's local +z (radians). */
  pedalAngle: 0,
  /** Pedal travel (rotation about its hinge, radians): the tread goes down about 1 cm. */
  pedalPress: 0.2,
} as const;

/** Gravity in world units per s² (9.81 m/s² at 1 unit = 20 cm). */
export const GRAVITY = 9.81 * (100 / 20);

/**
 * Height of something let go at rest at `y0` over the bin, `tau` s after the release: free fall
 * (C1 at the release: it starts from rest), its landing on the bucket floor rounded over `soft`
 * units of fall (a smooth maximum, so the stop is C1 too; it happens deep in the bin, out of
 * sight). `g` in the scene's units per s².
 */
export function dropHeight(y0: number, floor: number, tau: number, g: number, soft = 0.15): number {
  const fall = tau <= 0 ? y0 : y0 - 0.5 * g * tau * tau;
  const h = Math.max(soft - Math.abs(fall - floor), 0) / soft;
  return Math.max(fall, floor) + h * h * soft * 0.25;
}

/**
 * The lid's soft close, shared by both scenes (opening fraction from 1 to 0, `tau` s after it
 * starts): the flaps swing down, faster at first, and a damper catches them a sliver from shut
 * (BIN_CLOSE.toGap s), then takes up that last 3 % slowly (BIN_CLOSE.last s). C1 throughout.
 * Real soft-close lids take a second or two; this is as slow as the 1.5 s decline allows once
 * the object is below the rim.
 */
export const BIN_CLOSE = { toGap: 0.33, last: 0.15, gap: 0.03, catchRate: 0.25 } as const;
export function flapsClosing(tau: number): number {
  const { toGap, last, gap, catchRate } = BIN_CLOSE;
  const h = (u: number, p0: number, m0: number, p1: number, m1: number) => {
    const u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * m1;
  };
  if (tau <= 0) return 1;
  if (tau < toGap) return h(tau / toGap, 1, 0, gap, -catchRate * toGap);
  if (tau < toGap + last) return h((tau - toGap) / last, gap, -catchRate * last, 0, 0);
  return 0;
}

/** Bin dimensions in another scene's units (`k` = scene units per world unit). */
export function binIn(k: number): { readonly radius: number; readonly rimTop: number; readonly height: number; readonly opening: number; readonly floor: number; readonly hingeX: number; readonly flapOpen: number } {
  return { radius: BIN.radius * k, rimTop: BIN.rimTop * k, height: BIN.height * k, opening: BIN.opening * k, floor: BIN.floor * k, hingeX: BIN.hingeX * k, flapOpen: BIN.flapOpen };
}

/** `bin_lid` groups both flap pivots (`bin_flap_l`, `bin_flap_r`); `bin_pedal` is the pedal's hinge. */
export const BIN_NODES = ['bin_root', 'bin_body', 'bin_lid', 'bin_flap_l', 'bin_flap_r', 'bin_pedal'] as const;

/**
 * Bin bounds in bin_root space (world units) with the flaps fully open: the open flaps stand upright
 * on their hinges, 60 cm high; the pedal reaches 22.8 cm from the axis.
 * tests/birthday.test.ts checks the built geometry stays inside.
 */
export const BIN_BOUNDS = new Box3(new Vector3(-1.1, -0.001, -1.15), new Vector3(1.1, 3.05, 1.15));

/**
 * The bin's contact shadow (the rigs' `bin_shadow`): footprint the base cup's diameter, a tight
 * dark line round it (the 4 mm foot puts the base close to the floor) and a short soft spread,
 * as dense as the masters' contact under the cake stand and the plate (v1.4: 0.95 × the rim, line
 * 0.45, which left the bin looking set down a little apart from the floor).
 */
export const BIN_CONTACT = { shape: 'round', width: 2 * BIN.radius, depth: 2 * BIN.radius, spread: [1.22, 1.45], line: 0.85, lineScale: 1.07 } as const;

/** Rotation.z for each flap at opening fraction k (left lifts with +z, right with −z). */
export function flapAngles(k: number): [number, number] {
  return [BIN.flapOpen * k, -BIN.flapOpen * k];
}

/** Pedal hinge rotation for a flap opening fraction: the lever is down before the lid is fully open. */
export function pedalAngle(k: number): number {
  const u = Math.min(Math.max(k / 0.85, 0), 1);
  return BIN.pedalPress * u * u * (3 - 2 * u);
}

/**
 * Framing samples of the bin with its flaps fully open, taken from the bin's own geometry (every
 * vertex, placed at `position` turned by `yaw`, at the bin's own scale): exact, so the camera fit
 * keeps its clearance over the real flap tops. Contact-shadow planes and shadow proxies are
 * skipped. The flaps are restored afterwards. `scale` defaults to `bin_root`'s (a scene whose
 * world scale is not 1 scales the bin to keep it real-size: `attachBin`).
 */
export function openBinFramePoints(binRoot: Object3D, position: Vector3, yaw: number, scale = binRoot.scale.x): Vector3[] {
  const flaps = [binRoot.getObjectByName('bin_flap_l')!, binRoot.getObjectByName('bin_flap_r')!];
  const saved = flaps.map((f) => f.rotation.z);
  const open = flapAngles(1);
  flaps.forEach((f, i) => (f.rotation.z = open[i]!));
  binRoot.updateMatrixWorld(true);
  const place = new Matrix4().compose(position, new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw), new Vector3(scale, scale, scale));
  const toBin = binRoot.matrixWorld.clone().invert();
  const m = new Matrix4();
  const v = new Vector3();
  const pts: Vector3[] = [];
  binRoot.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh || mesh.name.endsWith('_shadow') || mesh.userData.shadowProxy) return;
    m.multiplyMatrices(place, toBin).multiply(mesh.matrixWorld);
    const attr = mesh.geometry.getAttribute('position') as BufferAttribute;
    for (let i = 0; i < attr.count; i++) pts.push(v.fromBufferAttribute(attr, i).applyMatrix4(m).clone());
  });
  flaps.forEach((f, i) => (f.rotation.z = saved[i]!));
  binRoot.updateMatrixWorld(true);
  return pts;
}

/**
 * Runtime placement (the Birthday and Dinner rigs): adds the bin under the scene root at
 * `position`, turned by `yaw`, scaled by `scale` (1 / the scene's world scale, so the bin keeps
 * its real size), registers its PBR materials with the scene's imported materials (own
 * environment for the steel, the Low tier, disposal: models/imported.ts), and links the pedal
 * to the lid: setting a flap's rotation (the scenes' `flapAngles`) also sets the pedal.
 */
export function attachBin(
  root: Object3D, binRoot: Object3D, lib: ModelContext['lib'], position: Vector3, yaw: number, scale = 1,
  options: { shade?: (m: Material) => boolean } = {},
): void {
  root.add(binRoot);
  binRoot.position.copy(position);
  binRoot.rotation.set(0, yaw, 0);
  binRoot.scale.setScalar(scale);
  prepareImported(root, lib);
  linkPedal(binRoot);
  const light = binLight(binRoot);
  // Its own outer shells reflect the floor it stands on (patchBinFloor).
  binRoot.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) if (BIN_FLOOR.materials.includes(m.name as never)) patchBinFloor(m, light);
  });
  // The open flaps cast no shadow above the closed lid's crown (flapShadowMaterial).
  const depth = flapShadowMaterial(light);
  binRoot.userData.flapDepth = depth;
  for (const name of ['bin_flap_l', 'bin_flap_r']) binRoot.getObjectByName(name)?.traverse((o) => {
    if ((o as Mesh).isMesh) o.customDepthMaterial = depth;
  });
  // The scene's own surfaces that can go into the bin see its walls instead of the room.
  if (options.shade) {
    const on = { value: 1 };
    root.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh || isInside(mesh, binRoot)) return;
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) if (options.shade!(m)) patchBinVisibility(m, light, on);
    });
  }
}

/** Frees what `attachBin` made for this bin (the flaps' shadow material); the scene frees the rest. */
export function detachBin(binRoot: Object3D): void {
  (binRoot.userData.flapDepth as Material | undefined)?.dispose();
  delete binRoot.userData.flapDepth;
}

function isInside(o: Object3D, ancestor: Object3D): boolean {
  for (let p: Object3D | null = o; p; p = p.parent) if (p === ancestor) return true;
  return false;
}

/** World-space uniforms of the bin's mouth, its floor and the key (kept current while the bin is drawn). */
export interface BinLight {
  readonly rimY: { value: number };
  readonly axis: { value: Vector2 };
  readonly radius: { value: number };
  /** World height of the floor the bin stands on; its footprint radius and closed height (crown). */
  readonly floorY: { value: number };
  readonly footR: { value: number };
  readonly crownY: { value: number };
  /** World direction towards the scene's key light (the first spot or directional light; up if none). */
  readonly keyDir: { value: Vector3 };
  /** World z of the cove's back wall (the rig's `studio_sweep`; far behind when there is none). */
  readonly wallZ: { value: number };
}

/** The scene's key: its first spot or directional light (the rigs' shadow-casting key). */
function findKey(scene: Object3D): SpotLight | DirectionalLight | null {
  let key: SpotLight | DirectionalLight | null = null;
  scene.traverse((o) => {
    const l = o as SpotLight & DirectionalLight;
    if (!key && (l.isSpotLight || l.isDirectionalLight)) key = l;
  });
  return key;
}

/** The bin's uniforms, created once per bin and updated before its body draws. */
export function binLight(binRoot: Object3D): BinLight {
  const existing = binRoot.userData.binLight as BinLight | undefined;
  if (existing) return existing;
  const light: BinLight = {
    rimY: { value: BIN.rimTop }, axis: { value: new Vector2() }, radius: { value: BIN.opening },
    floorY: { value: 0 }, footR: { value: BIN.radius }, crownY: { value: BIN.height }, keyDir: { value: new Vector3(0, 1, 0) },
    wallZ: { value: -1e4 },
  };
  binRoot.userData.binLight = light;
  const body = binRoot.getObjectByName('bin_body');
  const p = new Vector3(), q = new Quaternion(), k = new Vector3(), kp = new Vector3(), kt = new Vector3();
  let key: SpotLight | DirectionalLight | null = null;
  let searched: Object3D | null = null;
  const update = (_r?: unknown, scene?: Object3D) => {
    binRoot.updateWorldMatrix(true, false);
    binRoot.matrixWorld.decompose(p, q, k);
    light.axis.value.set(p.x, p.z);
    light.floorY.value = p.y;
    light.rimY.value = p.y + BIN.rimTop * k.y;
    light.crownY.value = p.y + BIN.height * k.y;
    light.radius.value = BIN.opening * k.x;
    light.footR.value = BIN.radius * k.x;
    if (scene && (searched !== scene || (key && !key.parent))) {
      searched = scene;
      key = findKey(scene);
      // The cove's back wall: the lowest z of the rig's sweep (its vertical part), if it has one.
      const sweep = scene.getObjectByName('studio_sweep') as Mesh | undefined;
      if (sweep?.isMesh) light.wallZ.value = new Box3().setFromObject(sweep).min.z;
    }
    if (key) {
      key.getWorldPosition(kp);
      if ((key as DirectionalLight).isDirectionalLight) kp.sub(key.target.getWorldPosition(kt));
      else kp.sub(p);
      if (kp.lengthSq() > 1e-12) light.keyDir.value.copy(kp).normalize();
    }
  };
  update();
  if (body) body.onBeforeRender = update as NonNullable<Object3D['onBeforeRender']>;
  return light;
}

/**
 * The floor in the bin's own reflections (v1.5 polish). The room's environment is a map at
 * infinity: below the horizon it holds the room's table and the dark runner on the camera side
 * (strokes for polished metal), and a vertical shell seen from the camera's 15° reflects exactly
 * that band (−12° to −21°), so the satin body reflected near-black and read as a flat dark
 * cylinder (v1.5 review: no highlight anywhere). What a real bin standing on the set reflects
 * there is the floor it stands on, the lit greige cove, within a metre of it. So each reflected
 * ray that goes down is traced to the floor plane: the lit floor's radiance (BIN_FLOOR, measured
 * under the production rig, scene-linear), darker inside the bin's own shadow (the footprint swept
 * away from the key), the lobe's share below the horizon softened by the roughness. The body
 * then carries a soft reflection of the floor that is brightest where the floor is lit (the key's
 * side) and at grazing angles, and falls into its own shadow on the far side.
 */
export const BIN_FLOOR = {
  /** The neutral-room cove floor's radiance near the bins, lit (scene-linear, pre-exposure). */
  radiance: [0.515, 0.497, 0.468],
  /** Inside the bin's own shadow: the floor without the key (environment only), 2.18 of 3.14. */
  shadow: 0.69,
  /** The bin's outer shells that see the floor. */
  materials: ['bin_powder', 'bin_base', 'bin_ring'],
} as const;

export function patchBinFloor(material: Material, light: BinLight): void {
  if (material.userData.binFloor || !(material as MeshStandardMaterial).isMeshStandardMaterial) return;
  material.userData.binFloor = true;
  const prev = material.onBeforeCompile;
  const prevKey = material.customProgramCacheKey;
  const floorL = new Vector3(...BIN_FLOOR.radiance);
  material.onBeforeCompile = (shader, renderer) => {
    prev?.call(material, shader, renderer);
    Object.assign(shader.uniforms, {
      uBinFloorY: light.floorY, uBinFootR: light.footR, uBinCrownY: light.crownY, uBinKeyDir: light.keyDir, uBinFloorAxis: light.axis, uBinWallZ: light.wallZ,
      uBinFloorL: { value: floorL },
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBinFloorW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n  vBinFloorW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    const floorMix = (v: string) => `${v} = mix(${v}, uBinFloorL * binLit, binBelow);`;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBinFloorW;\nuniform float uBinFloorY;\nuniform float uBinFootR;\nuniform float uBinCrownY;\nuniform vec3 uBinKeyDir;\nuniform vec2 uBinFloorAxis;\nuniform vec3 uBinFloorL;\nuniform float uBinWallZ;')
      .replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>
  #if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
  {
    vec3 binR = inverseTransformDirection(reflect(-geometryViewDir, normal), viewMatrix);
    // The lobe's share below the horizon (wider for a rougher surface).
    float binW = 0.06 + 0.8 * material.roughness * material.roughness;
    float binBelow = smoothstep(-binW, binW, -binR.y);
    // Where the ray meets the set: the floor, or the cove's back wall if it reaches that first.
    float binTF = max(vBinFloorW.y - uBinFloorY, 0.0) / max(-binR.y, 0.04);
    float binTW = binR.z < -1e-3 ? (uBinWallZ - vBinFloorW.z) / binR.z : 1e9;
    vec3 binQ = vBinFloorW + binR * min(binTF, binTW);
    binQ.y = max(binQ.y, uBinFloorY);
    // Is that point in the bin's own shadow? Towards the key, does it pass the bin (its footprint
    // radius, below its crown)?
    float binKh = max(length(uBinKeyDir.xz), 1e-4);
    vec2 binK = uBinKeyDir.xz / binKh;
    vec2 binToAxis = uBinFloorAxis - binQ.xz;
    float binAlong = dot(binToAxis, binK);
    float binPerp = length(binToAxis - binK * binAlong);
    float binYAt = binQ.y + max(binAlong, 0.0) * uBinKeyDir.y / binKh;
    float binOcc = step(0.0, binAlong) * (1.0 - smoothstep(uBinFootR * 0.8, uBinFootR * 1.2, binPerp))
      * (1.0 - smoothstep(uBinCrownY - 0.05, uBinCrownY + 0.05, binYAt));
    float binLit = mix(1.0, ${BIN_FLOOR.shadow.toFixed(3)}, binOcc);
    ${floorMix('radiance')}
    #ifdef USE_CLEARCOAT
      ${floorMix('clearcoatRadiance')}
    #endif
  }
  #endif`);
  };
  material.customProgramCacheKey = () => `${prevKey?.call(material) ?? ''}|bin-floor-v1`;
  material.needsUpdate = true;
}

/**
 * The flaps' shadow material (v1.5 polish): the flaps cast as usual up to the closed lid's crown,
 * and not above it. Open, each flap stands 16 cm over the rim; under the low window key the two
 * threw "rabbit ears" larger than the bin onto the cove behind it (the spot's throw magnifies
 * them) through the whole carry. The lid, the hinges and the rest of the bin keep their shadows,
 * so the closed bin's is unchanged and the open bin's is the closed one's. One per bin (a shared
 * material would collect every renderer's dispose listener): `detachBin` frees it.
 */
function flapShadowMaterial(light: BinLight): MeshDepthMaterial {
  const m = new MeshDepthMaterial({ name: 'fx_bin_flap_shadow' });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uBinCrownY = light.crownY;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vBinFlapY;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n  vBinFlapY = (modelMatrix * vec4(transformed, 1.0)).y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vBinFlapY;\nuniform float uBinCrownY;')
      .replace('#include <clipping_planes_fragment>', 'if (vBinFlapY > uBinCrownY + 0.004) discard;\n#include <clipping_planes_fragment>');
  };
  m.customProgramCacheKey = () => 'bin-flap-shadow-v1';
  return m;
}

/**
 * Light inside the bin, for anything that goes into it (v1.5; physically based, replacing the
 * v1.2 dimmer). Below the rim a point sees the room only through the mouth, and the rest of its
 * hemisphere sees the bucket's wall.
 *
 * - Indirect diffuse: the mouth's form factor from the point, for its own normal: the exact
 *   vector form factor of the mouth (a 16-gon on the rim circle, three's LTC edge integral) with
 *   the standard horizon-clipped sphere approximation (Hill & Heitz 2016), the rest of the
 *   hemisphere at BIN_WALL.diffuse (the grey bucket wall, itself lit only through the mouth). An
 *   upward face on the axis keeps R² / (R² + d²) (0.96 at 3 cm, 0.7 at 10 cm, 0.13 on the
 *   floor); a face turned to the wall gets far less (a vertical face just under the rim already
 *   about half): the falloff that reads as being inside (v1.5 review: "lit as if outside").
 * - Indirect specular: the room only if the reflected ray leaves through the mouth (an exact
 *   per-pixel test against the rim's plane, its edge softened by the roughness), else the wall
 *   (BIN_WALL.specular); a rough surface's reflection tends to its diffuse visibility.
 * - Direct light needs nothing: the shadow map already has the walls.
 *
 * `on` gates it (Birthday: once the cake is over the opening); it applies only inside the mouth's
 * cylinder, fading in over the last 2 cm above the rim (so switching it on never changes a pixel).
 */
export const BIN_WALL = { diffuse: 0.06, specular: 0.07 } as const;

export function patchBinVisibility(material: Material, light: BinLight, on: { value: number }): void {
  if (material.userData.binVisibility || !(material as MeshStandardMaterial).isMeshStandardMaterial) return;
  material.userData.binVisibility = true;
  const prev = material.onBeforeCompile;
  const prevKey = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    prev?.call(material, shader, renderer);
    shader.uniforms.uBinRimY = light.rimY;
    shader.uniforms.uBinAxis = light.axis;
    shader.uniforms.uBinR = light.radius;
    shader.uniforms.uBinOn = on;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBinW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n  vBinW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBinW;\nuniform float uBinRimY;\nuniform vec2 uBinAxis;\nuniform float uBinR;\nuniform float uBinOn;')
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
  {
    float binIn = uBinOn * (1.0 - smoothstep(uBinR * 0.92, uBinR * 1.08, length(vBinW.xz - uBinAxis)))
      * (1.0 - smoothstep(0.0, 0.1 * uBinR / ${BIN.opening.toFixed(4)}, vBinW.y - uBinRimY));
    if (binIn > 0.0) {
      vec3 binN = inverseTransformDirection(normal, viewMatrix);
      // Vector form factor of the mouth seen from this point (at most at the rim's plane).
      vec3 binP = vec3(vBinW.x, min(vBinW.y, uBinRimY - 1e-4), vBinW.z);
      vec3 binFirst = normalize(vec3(uBinAxis.x + uBinR, uBinRimY, uBinAxis.y) - binP);
      vec3 binPrev = binFirst;
      vec3 binF = vec3(0.0);
      for (int i = 1; i < 16; i++) {
        float a = float(i) * 0.39269908;
        vec3 binV = normalize(vec3(uBinAxis.x + uBinR * cos(a), uBinRimY, uBinAxis.y + uBinR * sin(a)) - binP);
        binF += LTC_EdgeVectorFormFactor(binPrev, binV);
        binPrev = binV;
      }
      binF += LTC_EdgeVectorFormFactor(binPrev, binFirst);
      binF *= binF.y < 0.0 ? -1.0 : 1.0;
      float binL = length(binF);
      float binVis = clamp((binL * binL + dot(binF, binN)) / (binL + 1.0), 0.0, 1.0);
      float binDiff = binVis + (1.0 - binVis) * ${BIN_WALL.diffuse.toFixed(3)};
      // The reflected ray reaches the room only if it leaves through the mouth.
      float binD = max(uBinRimY - vBinW.y, 0.0);
      vec3 binRefl = inverseTransformDirection(reflect(-geometryViewDir, normal), viewMatrix);
      vec2 binHit = vBinW.xz + binRefl.xz * (binD / max(binRefl.y, 1e-3)) - uBinAxis;
      float binEdge = 0.04 + 0.5 * material.roughness * material.roughness;
      float binOut = binRefl.y > 0.0 ? 1.0 - smoothstep(uBinR * (1.0 - binEdge), uBinR * (1.0 + binEdge), length(binHit)) : 0.0;
      float binSpec = mix(mix(${BIN_WALL.specular.toFixed(3)}, 1.0, binOut), binDiff, smoothstep(0.25, 0.8, material.roughness));
      reflectedLight.indirectDiffuse *= mix(1.0, binDiff, binIn);
      reflectedLight.indirectSpecular *= mix(1.0, binSpec, binIn);
      #ifdef USE_CLEARCOAT
        clearcoatSpecularIndirect *= mix(1.0, mix(${BIN_WALL.specular.toFixed(3)}, 1.0, binOut), binIn);
      #endif
      #ifdef USE_SHEEN
        sheenSpecularIndirect *= mix(1.0, binDiff, binIn);
      #endif
    }
  }`);
  };
  material.customProgramCacheKey = () => `${prevKey?.call(material) ?? ''}|bin-visibility-v2`;
  material.needsUpdate = true;
}

/** The pedal follows the left flap (both flaps always move together). */
function linkPedal(binRoot: Object3D): void {
  const flap = binRoot.getObjectByName('bin_flap_l');
  const pedal = binRoot.getObjectByName('bin_pedal');
  if (!flap || !pedal) return;
  // Object3D keeps quaternion and rotation in sync through the Euler's change callback; this one
  // does the same and then sets the pedal, so every way of setting the flap moves the pedal.
  const rotation = flap.rotation as Euler & { _onChange(callback: () => void): Euler };
  rotation._onChange(() => {
    flap.quaternion.setFromEuler(rotation, false);
    pedal.rotation.x = pedalAngle(rotation.z / BIN.flapOpen);
  });
  pedal.rotation.x = pedalAngle(rotation.z / BIN.flapOpen);
}

// ── Materials (factors; the export adds the textures) ──────────────────────────────────────────

/**
 * The bin's surfaces (the brushed steel parts also carry tangents: the anisotropic grain follows
 * UV0's u smoothly, where derivative tangent frames would facet it). Names are not library names, so `bindMaterialsByName` keeps them and the GLB
 * carries their textures. `uv1`: the material's occlusion (and macro roughness) lives on a second,
 * unique UV set (the lathe parts); the others are tiled micro-detail on UV0 only.
 */
export const BIN_MATERIALS = {
  bin_powder: { color: '#4A4846', roughness: 0.29, uv1: true },
  bin_base: { color: '#1D1D1D', roughness: 0.56, uv1: true },
  bin_ring: { color: '#1D1D1D', roughness: 0.52, uv1: true },
  bin_liner: { color: '#7C7C7B', roughness: 0.45, uv1: true },
  bin_plastic: { color: '#1D1D1D', roughness: 0.54 },
  bin_rubber: { color: '#0D0D0E', roughness: 0.8 },
  bin_slot: { color: '#060607', roughness: 0.9 },
  bin_steel: { color: '#CBC9C4', roughness: 0.17, metalness: 1, anisotropy: 0.6 },
  bin_pin: { color: '#2E2F31', roughness: 0.42, metalness: 1 },
  bin_tread: { color: '#1B1B1C', roughness: 0.5 },
} as const;
export type BinMaterialName = keyof typeof BIN_MATERIALS;

function binMaterials(): Record<BinMaterialName, Material> {
  const out = {} as Record<BinMaterialName, Material>;
  for (const [name, spec] of Object.entries(BIN_MATERIALS) as [BinMaterialName, (typeof BIN_MATERIALS)[BinMaterialName]][]) {
    const metal = 'metalness' in spec ? spec.metalness : 0;
    const m = 'anisotropy' in spec
      ? new MeshPhysicalMaterial({ name, color: new Color(spec.color), roughness: spec.roughness, metalness: metal, anisotropy: spec.anisotropy, anisotropyRotation: Math.PI / 2 })
      : new MeshStandardMaterial({ name, color: new Color(spec.color), roughness: spec.roughness, metalness: metal });
    out[name] = m;
  }
  return out;
}

// ── Profiles (centimetres, closed loops counter-clockwise in (r, y), with fillet radii) ────────

type Corner = [r: number, y: number, fillet?: number];

/** Each lathe part: its loop, its material, and its UV0 tile (cm per micro-texture tile). */
const RB = BIN_CM.body, RC = BIN_CM.base, RR = BIN_CM.ring;
export const BIN_LATHES: { name: string; material: BinMaterialName; loop: Corner[]; tile: number; segments: number }[] = [
  {
    // Rubber foot ring, 4 mm tall and inset 5 mm under the base: a fine dark line at the floor.
    name: 'bin_foot', material: 'bin_rubber', tile: 3, segments: 96,
    loop: [[RB - 1.1, 0, 0.12], [RB - 0.1, 0, 0.15], [RB - 0.1, 0.4, 0.1], [RB - 1.1, 0.4, 0.1]],
  },
  {
    // Base cup: a soft 6 mm bottom radius, a flat 3.4 cm wall 4 mm proud of the shell, a narrow
    // top shoulder the shell stands into.
    name: 'bin_base', material: 'bin_base', tile: 3, segments: 160,
    loop: [[RB - 2.3, 0.36, 0.12], [RC, 0.36, 0.6], [RC, 4.8, 0.26], [RB + 0.03, 4.8, 0.1], [RB + 0.03, 2.75, 0.1], [RB - 0.9, 2.75, 0.1], [RB - 0.9, 1.25, 0.1], [RB - 2.3, 1.25, 0.1]],
  },
  {
    // Powder-coated shell with its rolled bead under the lid ring.
    name: 'bin_body', material: 'bin_powder', tile: 5.76, segments: 192,
    loop: [[RB - 0.26, 2.85, 0.04], [RB, 2.85, 0.04], [RB, RIM - 2.2, 0.6], [RB + 0.14, RIM - 1.85, 0.22], [RB + 0.06, RIM - 1.56, 0.18], [RB - 0.26, RIM - 1.6, 0.12]],
  },
  {
    // Lid ring: overhangs the bead by 1 mm (the seam's shadow), a 3.4 mm flat top the lid rests on.
    name: 'bin_lid_ring', material: 'bin_ring', tile: 3, segments: 192,
    loop: [[RB - 0.3, RIM - 1.48, 0.06], [RR, RIM - 1.48, 0.15], [RR, RIM, 0.34], [MOUTH + 0.38, RIM, 0.18], [MOUTH + 0.38, RIM - 0.9, 0.08], [RB - 0.3, RIM - 0.9, 0.06]],
  },
  {
    // Inner bucket: rolled lip 4.5 mm below the ring top, a straight well (the clear mouth).
    name: 'bin_liner', material: 'bin_liner', tile: 3, segments: 128,
    loop: [[0, 5.6], [MOUTH + 0.3, 5.6, 1.0], [MOUTH + 0.3, RIM - 0.45, 0.15], [MOUTH, RIM - 0.45, 0.14], [MOUTH, 5.95, 0.9], [0, 5.95]],
  },
];

interface LoopPoint { r: number; y: number; nr: number; ny: number; s: number }

/**
 * A closed (r, y) polygon with circular fillets → points with exact outward normals and arc
 * length. Counter-clockwise, so the outward normal is the tangent turned −90°. A corner without
 * a fillet is a hard edge (the point appears twice, once per face normal).
 */
export function roundLoop(corners: readonly Corner[], arcStep = Math.PI / 20, fineRadius = 0.5): LoopPoint[] {
  const n = corners.length;
  type Piece = { a: Vector2; b: Vector2 } | { c: Vector2; r: number; from: number; to: number };
  const pieces: Piece[] = [];
  const starts: Vector2[] = [];
  const ends: Vector2[] = [];
  const arcs: (Piece | null)[] = [];
  for (let i = 0; i < n; i++) {
    const [px, py, f = 0] = corners[i]!;
    const p = new Vector2(px, py);
    const prev = new Vector2(corners[(i + n - 1) % n]![0], corners[(i + n - 1) % n]![1]);
    const next = new Vector2(corners[(i + 1) % n]![0], corners[(i + 1) % n]![1]);
    const u1 = p.clone().sub(prev).normalize();
    const u2 = next.clone().sub(p).normalize();
    const cross = u1.x * u2.y - u1.y * u2.x;
    const turn = Math.atan2(cross, u1.dot(u2));
    if (f <= 0 || Math.abs(turn) < 1e-6) {
      starts.push(p.clone());
      ends.push(p.clone());
      arcs.push(null);
      continue;
    }
    const d = f * Math.tan(Math.abs(turn) / 2);
    const t1 = p.clone().addScaledVector(u1, -d);
    const t2 = p.clone().addScaledVector(u2, d);
    // Left turn (CCW): centre on the left of the incoming direction.
    const side = turn > 0 ? 1 : -1;
    const c = t1.clone().add(new Vector2(-u1.y * side, u1.x * side).multiplyScalar(f));
    const from = Math.atan2(t1.y - c.y, t1.x - c.x);
    starts.push(t1);
    ends.push(t2);
    arcs.push({ c, r: f, from, to: from + turn });
  }
  for (let i = 0; i < n; i++) {
    const arc = arcs[i];
    if (arc) pieces.push(arc);
    else pieces.push({ a: starts[i]!, b: starts[i]! }); // hard corner marker
    pieces.push({ a: ends[i]!, b: starts[(i + 1) % n]! });
  }
  const out: LoopPoint[] = [];
  let s = 0;
  const push = (x: number, y: number, tx: number, ty: number) => {
    const l = Math.hypot(tx, ty) || 1;
    const nr = ty / l, ny = -tx / l;
    const last = out[out.length - 1];
    if (last) {
      const d = Math.hypot(x - last.r, y - last.y);
      // The arc's ends coincide with the lines' ends: keep one point where the normal agrees.
      if (d < 1e-9 && Math.abs(nr - last.nr) + Math.abs(ny - last.ny) < 1e-6) return;
      s += d;
    }
    out.push({ r: x, y, nr, ny, s });
  };
  for (const piece of pieces) {
    if ('c' in piece) {
      // Finer steps on the larger radii (their facets would show on the silhouette).
      const step = piece.r >= fineRadius ? arcStep / 2 : arcStep;
      const steps = Math.max(2, Math.ceil(Math.abs(piece.to - piece.from) / step));
      const dir = Math.sign(piece.to - piece.from);
      for (let k = 0; k <= steps; k++) {
        const a = piece.from + ((piece.to - piece.from) * k) / steps;
        // Tangent of a CCW (dir > 0) arc is the radius turned +90°.
        push(piece.c.x + Math.cos(a) * piece.r, piece.c.y + Math.sin(a) * piece.r, -Math.sin(a) * dir, Math.cos(a) * dir);
      }
    } else if (piece.a !== piece.b && piece.a.distanceTo(piece.b) > 1e-9) {
      const tx = piece.b.x - piece.a.x, ty = piece.b.y - piece.a.y;
      const len = Math.hypot(tx, ty);
      const steps = Math.max(1, Math.ceil(len / 4));
      for (let k = 0; k <= steps; k++) push(piece.a.x + (tx * k) / steps, piece.a.y + (ty * k) / steps, tx, ty);
    }
  }
  // Close the loop: repeat the first point (v1 = 1 there) with its own normal.
  const first = out[0]!, end = out[out.length - 1]!;
  out.push({ ...first, s: end.s + Math.hypot(first.r - end.r, first.y - end.y) });
  // A point on the axis takes the normal of the face that is not the (zero-area) axis segment.
  for (let i = 0; i < out.length; i++) {
    const p = out[i]!;
    if (p.r < 1e-9 && Math.abs(p.ny) < 0.5) {
      const q = out[i + 1] && out[i + 1]!.r > 1e-6 ? out[i + 1]! : out[i - 1] ?? p;
      p.nr = q.nr; p.ny = q.ny;
    }
  }
  return out;
}

/**
 * Surface of revolution about +y from a closed loop (cm): position and normal in world units,
 * `uv` tiled micro-texture coordinates (`tile` cm per tile, a whole number of tiles round),
 * `uv1` unique (u round, v along the loop) for the baked occlusion. Outward winding.
 */
export function revolveLoop(loop: LoopPoint[], segments: number, tile: number, withUv1: boolean): BufferGeometry {
  const rows = loop.length, cols = segments + 1;
  const pos = new Float32Array(rows * cols * 3), nor = new Float32Array(rows * cols * 3);
  const uv = new Float32Array(rows * cols * 2), uv1 = new Float32Array(rows * cols * 2);
  const rMax = Math.max(...loop.map((p) => p.r));
  const around = Math.max(1, Math.round((2 * Math.PI * rMax) / tile));
  const total = loop[rows - 1]!.s;
  for (let j = 0; j < rows; j++) {
    const p = loop[j]!;
    for (let i = 0; i < cols; i++) {
      const phi = (i / segments) * Math.PI * 2;
      const sn = Math.sin(phi), cs = Math.cos(phi);
      const k = j * cols + i;
      pos.set([p.r * sn * U, p.y * U, p.r * cs * U], k * 3);
      nor.set([p.nr * sn, p.ny, p.nr * cs], k * 3);
      uv.set([(i / segments) * around, p.s / tile], k * 2);
      uv1.set([i / segments, p.s / total], k * 2);
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < segments; i++) {
      const a = j * cols + i, b = a + 1, c = a + cols, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('normal', new BufferAttribute(nor, 3));
  g.setAttribute('uv', new BufferAttribute(uv, 2));
  if (withUv1) g.setAttribute('uv1', new BufferAttribute(uv1, 2));
  g.setIndex(idx);
  return orientOutward(g);
}

/** Flips the winding if the triangles face against the vertex normals (area-weighted vote). */
function orientOutward(g: BufferGeometry): BufferGeometry {
  const pos = g.getAttribute('position') as BufferAttribute, nor = g.getAttribute('normal') as BufferAttribute;
  const index = g.getIndex()!;
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), n = new Vector3(), m = new Vector3(), e1 = new Vector3(), e2 = new Vector3();
  let vote = 0;
  for (let t = 0; t < index.count; t += 3) {
    const ia = index.getX(t), ib = index.getX(t + 1), ic = index.getX(t + 2);
    a.fromBufferAttribute(pos, ia); b.fromBufferAttribute(pos, ib); c.fromBufferAttribute(pos, ic);
    n.fromBufferAttribute(nor, ia).add(m.fromBufferAttribute(nor, ib)).add(m.fromBufferAttribute(nor, ic));
    vote += e1.subVectors(b, a).cross(e2.subVectors(c, a)).dot(n);
  }
  if (vote < 0) {
    const arr = index.array as Uint16Array | Uint32Array;
    for (let t = 0; t < arr.length; t += 3) { const s = arr[t + 1]!; arr[t + 1] = arr[t + 2]!; arr[t + 2] = s; }
    index.needsUpdate = true;
  }
  return g;
}

/** A small turned part (pin, barrel, lug boss) along +y, from a loop; caller rotates it. */
function turned(loop: Corner[], segments: number, tile: number): BufferGeometry {
  return revolveLoop(roundLoop(loop, Math.PI / 16), segments, tile, false);
}

/** Merge geometries of one material, keeping position, normal, uv (and uv1 when all have it). */
function merge(parts: BufferGeometry[]): BufferGeometry {
  const keep = ['position', 'normal', 'uv', ...(parts.every((g) => g.getAttribute('uv1')) ? ['uv1'] : [])];
  let vertices = 0, indices = 0;
  for (const g of parts) { vertices += g.getAttribute('position').count; indices += g.getIndex()!.count; }
  const out = new BufferGeometry();
  for (const name of keep) {
    const size = parts[0]!.getAttribute(name).itemSize;
    const arr = new Float32Array(vertices * size);
    let o = 0;
    for (const g of parts) { const src = g.getAttribute(name) as BufferAttribute; for (let i = 0; i < src.count; i++) for (let c = 0; c < size; c++) arr[o++] = src.getComponent(i, c); }
    out.setAttribute(name, new BufferAttribute(arr, size));
  }
  const idx = new Uint32Array(indices);
  let base = 0, o = 0;
  for (const g of parts) {
    const index = g.getIndex()!;
    for (let i = 0; i < index.count; i++) idx[o++] = index.getX(i) + base;
    base += g.getAttribute('position').count;
    g.dispose();
  }
  out.setIndex(new BufferAttribute(idx, 1));
  return out;
}

/**
 * Box-projected tiled UVs (cm per tile) for small hard-surface parts, from position and normal.
 * `grainZ`: on the up/down faces u runs along z (a brushed grain along the part's length).
 */
function boxUV(g: BufferGeometry, tile: number, grainZ = false): BufferGeometry {
  const pos = g.getAttribute('position') as BufferAttribute, nor = g.getAttribute('normal') as BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i));
    const x = pos.getX(i) / U / tile, y = pos.getY(i) / U / tile, z = pos.getZ(i) / U / tile;
    if (ax >= ay && ax >= az) uv.set([z, y], i * 2);
    else if (ay >= az) uv.set(grainZ ? [z, x] : [x, z], i * 2);
    else uv.set([x, y], i * 2);
  }
  g.setAttribute('uv', new BufferAttribute(uv, 2));
  return g;
}

/** Indexed copy of a (possibly non-indexed) geometry with position, normal, uv only. */
function indexed(g: BufferGeometry): BufferGeometry {
  if (!g.index) g.setIndex(Array.from({ length: g.getAttribute('position').count }, (_, i) => i));
  for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
  g.clearGroups();
  return g;
}

/** Rounded box (cm, centred at c), world units, box-projected UVs. */
function roundedBlock(w: number, h: number, d: number, r: number, c: [number, number, number], tile: number): BufferGeometry {
  // beveledPlate: outer w × h, depth along z, edges rounded by r.
  const g = beveledPlate(w * U, h * U, d * U, r * U, r * U, 4);
  g.translate(c[0] * U, c[1] * U, c[2] * U);
  return boxUV(indexed(g), tile);
}

// ── Butterfly lid ─────────────────────────────────────────────────────────────────────────────

/** Dome height (cm above the ring top) of the lid's top surface at lid-plane (x, z). */
export function lidTop(x: number, z: number): number {
  return BIN_CM.lidEdge + BIN_CM.lidRise * (1 - (x * x + z * z) / (BIN_CM.lid * BIN_CM.lid));
}

interface OutlinePoint { x: number; z: number; nx: number; nz: number; s: number }

/**
 * Left half-shell outline (lid plane, cm): a half-disc whose outer extreme is cut by a straight
 * 7.9 cm chord (the hinge edge, carrying the knuckles), every corner rounded: 3 mm at the split,
 * 5 mm at the chord. Traversed from the split's top corner round through −x (the chord) to its
 * bottom corner, then up the split line.
 */
function lidOutline(step = 0.3): OutlinePoint[] {
  const R = BIN_CM.lid, g = BIN_CM.splitGap, rc = BIN_CM.lidCorner, xc = BIN_CM.lidChord, rk = 0.5;
  // Split-corner fillet centres (tangent to x = −g and the circle r = R).
  const cx = -g - rc, cz = Math.sqrt((R - rc) ** 2 - cx * cx);
  const arcFrom = Math.atan2(cz, cx);
  // Chord-corner fillet centres (tangent to x = −xc and the circle).
  const kx = -xc + rk, kz = Math.sqrt((R - rk) ** 2 - kx * kx);
  const chordAt = Math.atan2(kz, kx); // where the arc meets the top chord fillet
  const pts: OutlinePoint[] = [];
  let s = 0;
  let px = NaN, pz = NaN;
  const push = (x: number, z: number, nx: number, nz: number) => {
    if (!Number.isNaN(px)) s += Math.hypot(x - px, z - pz);
    pts.push({ x, z, nx, nz, s });
    px = x; pz = z;
  };
  const arc = (from: number, to: number) => {
    const n = Math.max(2, Math.ceil((Math.abs(to - from) * R) / step));
    for (let k = 0; k < n; k++) {
      const a = from + ((to - from) * k) / n;
      push(Math.cos(a) * R, Math.sin(a) * R, Math.cos(a), Math.sin(a));
    }
  };
  const fillet = (ox: number, oz: number, r: number, from: number, to: number) => {
    const n = Math.max(6, Math.ceil((Math.abs(to - from) * r) / (step * 0.25)));
    for (let k = 0; k < n; k++) {
      const a = from + ((to - from) * k) / n;
      push(ox + Math.cos(a) * r, oz + Math.sin(a) * r, Math.cos(a), Math.sin(a));
    }
  };
  const line = (x0: number, z0: number, x1: number, z1: number, nx: number, nz: number) => {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / step));
    for (let k = 0; k < n; k++) push(x0 + ((x1 - x0) * k) / n, z0 + ((z1 - z0) * k) / n, nx, nz);
  };
  arc(arcFrom, chordAt);
  fillet(kx, kz, rk, chordAt, Math.PI);
  line(-xc, kz, -xc, -kz, -1, 0);
  fillet(kx, -kz, rk, Math.PI, 2 * Math.PI - chordAt);
  arc(2 * Math.PI - chordAt, 2 * Math.PI - arcFrom);
  fillet(cx, -cz, rc, -arcFrom, 0);
  line(-g, -cz, -g, cz, 1, 0);
  fillet(cx, cz, rc, 0, arcFrom);
  return pts;
}

/**
 * One half-shell of the butterfly lid in lid space (origin: lid centre on the ring top, cm →
 * world units), as the left flap (x < 0). Returns the brushed-steel shell (dome, rolled edge,
 * hem), the PP underside panel, and the hinge knuckle with its tab.
 */
function lidHalf(): { shell: BufferGeometry; under: BufferGeometry; knuckle: BufferGeometry } {
  const outline = lidOutline();
  const N = outline.length;
  const R = BIN_CM.lid;
  const T = BIN_CM.lidDepth, rf = 0.26, rb = 0.12, hem = 0.42;
  // Interior star centre (the half-disc's centroid).
  const c = { x: -(4 * R) / (3 * Math.PI), z: 0 };
  const slopeAt = (x: number, z: number, nx: number, nz: number) => (BIN_CM.lidRise * 2 * (x * nx + z * nz)) / (R * R);

  // Edge band profile per outline point, in (n outward, y) relative to the outline point P.
  type Band = { n: number; y: number; tn: number; ty: number; t: number }[];
  const band = (p: OutlinePoint): { inset: number; pts: Band } => {
    const s = slopeAt(p.x, p.z, p.nx, p.nz); // descending outward
    const th0 = -Math.atan(s);
    const inset = rf * (1 + Math.sin(th0));
    const hI = lidTop(p.x - inset * p.nx, p.z - inset * p.nz);
    const pts: Band = [];
    let t = 0, ln = -inset, ly = hI;
    const add = (n: number, y: number, tn: number, ty: number) => { t += Math.hypot(n - ln, y - ly); ln = n; ly = y; pts.push({ n, y, tn, ty, t }); };
    pts.push({ n: -inset, y: hI, tn: Math.cos(th0), ty: Math.sin(th0), t: 0 });
    // Top fillet: heading outward-down (th0) to straight down (−π/2), centre on the right.
    const C1n = -inset + rf * Math.sin(th0), C1y = hI - rf * Math.cos(th0);
    for (let k = 1; k <= 10; k++) {
      const th = th0 + ((-Math.PI / 2 - th0) * k) / 10;
      add(C1n - rf * Math.sin(th), C1y + rf * Math.cos(th), Math.cos(th), Math.sin(th));
    }
    const yb = lidTop(p.x, p.z) - T;
    // Lip straight down to the bottom fillet.
    add(0, yb + rb, 0, -1);
    // Bottom fillet: heading down to heading inward.
    const C2n = -rb, C2y = yb + rb;
    for (let k = 1; k <= 8; k++) {
      const th = -Math.PI / 2 - (Math.PI / 2) * (k / 8);
      add(C2n - rb * Math.sin(th), C2y + rb * Math.cos(th), Math.cos(th), Math.sin(th));
    }
    // Hem: flat inward, then a small upturned return (hidden behind the panel's edge).
    add(-hem, yb, -1, 0);
    add(-hem - 0.06, yb + 0.06, -0.6, 0.8);
    add(-hem - 0.06, yb + 0.22, 0, 1);
    return { inset, pts };
  };
  const bands = outline.map(band);
  const M = bands[0]!.pts.length;

  const positions: number[] = [], normals: number[] = [], uvs: number[] = [], idx: number[] = [];
  const brush = 6; // cm per brushed tile
  const vtx = (x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number) => {
    positions.push(x * U, y * U, z * U);
    const l = Math.hypot(nx, ny, nz) || 1;
    normals.push(nx / l, ny / l, nz / l);
    uvs.push(u, v);
    return positions.length / 3 - 1;
  };
  const domeNormal = (x: number, z: number): [number, number, number] => {
    const k = (2 * BIN_CM.lidRise) / (R * R);
    return [k * x, 1, k * z];
  };
  // Dome: K rings from the centroid out to the band's inner edge. Brushed finish: the halves are
  // pressed from brushed coil, the grain running side to side, across the split (u along x), so
  // the brushed highlight stretches front to back over the lid as on a pressed stainless lid.
  const brushUV = (x: number, z: number): [number, number] => [x / brush, z / brush];
  const K = 24;
  const domeStart = positions.length / 3;
  const centre = vtx(c.x, lidTop(c.x, c.z), c.z, ...domeNormal(c.x, c.z), ...brushUV(c.x, c.z));
  for (let k = 1; k <= K; k++) {
    const rho = k / K;
    for (let i = 0; i < N; i++) {
      const p = outline[i]!, b = bands[i]!;
      const ix = p.x - b.inset * p.nx, iz = p.z - b.inset * p.nz;
      const x = c.x + (ix - c.x) * rho, z = c.z + (iz - c.z) * rho;
      vtx(x, lidTop(x, z), z, ...domeNormal(x, z), ...brushUV(x, z));
    }
  }
  const ring = (k: number, i: number) => domeStart + 1 + (k - 1) * N + (i % N);
  for (let i = 0; i < N; i++) idx.push(centre, ring(1, i + 1), ring(1, i));
  for (let k = 1; k < K; k++) {
    for (let i = 0; i < N; i++) {
      const a = ring(k, i), b = ring(k, i + 1), cc = ring(k + 1, i), d = ring(k + 1, i + 1);
      idx.push(a, b, cc, b, d, cc);
    }
  }
  // Edge band: rows along the profile, columns along the outline (closed); UV along the edge.
  const bandStart = positions.length / 3;
  const perimeter = outline[N - 1]!.s + Math.hypot(outline[0]!.x - outline[N - 1]!.x, outline[0]!.z - outline[N - 1]!.z);
  const around = Math.max(1, Math.round(perimeter / brush));
  for (let j = 0; j < M; j++) {
    for (let i = 0; i <= N; i++) {
      const p = outline[i % N]!, q = bands[i % N]!.pts[j]!;
      // Outward normal of the profile (traversed outward then down: clockwise in (n, y), so the
      // tangent turned +90°).
      const nn = -q.ty, ny = q.tn;
      vtx(p.x + q.n * p.nx, q.y, p.z + q.n * p.nz, nn * p.nx, ny, nn * p.nz, ((i === N ? perimeter : p.s) / perimeter) * around, q.t / brush);
    }
  }
  const bandIdx = (j: number, i: number) => bandStart + j * (N + 1) + i;
  for (let j = 0; j < M - 1; j++) {
    for (let i = 0; i < N; i++) {
      const a = bandIdx(j, i), b = bandIdx(j, i + 1), cc = bandIdx(j + 1, i), d = bandIdx(j + 1, i + 1);
      idx.push(a, b, cc, b, d, cc);
    }
  }
  const shell = new BufferGeometry();
  shell.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  shell.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
  shell.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  shell.setIndex(idx);
  orientOutward(shell);

  // Underside panel: the dome offset down by the shell depth (+1.2 mm recess), inside the hem,
  // facing down, its edge turned up into the hem.
  const up: number[] = [], un: number[] = [], uu: number[] = [], ui: number[] = [];
  const pv = (x: number, y: number, z: number, n: [number, number, number]) => {
    up.push(x * U, y * U, z * U);
    const l = Math.hypot(...n);
    un.push(n[0] / l, n[1] / l, n[2] / l);
    uu.push(x / brush, z / brush);
    return up.length / 3 - 1;
  };
  const inset = hem + 0.02;
  const KU = 12;
  const ucentre = pv(c.x, lidTop(c.x, c.z) - T + 0.12, c.z, [0, -1, 0]);
  for (let k = 1; k <= KU; k++) {
    const rho = k / KU;
    for (let i = 0; i < N; i++) {
      const p = outline[i]!;
      const ex = p.x - inset * p.nx, ez = p.z - inset * p.nz;
      const x = c.x + (ex - c.x) * rho, z = c.z + (ez - c.z) * rho;
      const dn = domeNormal(x, z);
      pv(x, lidTop(x, z) - T + 0.12, z, [-dn[0], -1, -dn[2]]);
    }
  }
  // Turned-up edge (two rows) so the panel's rim meets the hem's return.
  for (const [dy, dn] of [[0.06, 0.03], [0.18, 0.0]] as const) {
    for (let i = 0; i < N; i++) {
      const p = outline[i]!;
      const ex = p.x - (inset - dn) * p.nx, ez = p.z - (inset - dn) * p.nz;
      pv(ex, lidTop(ex, ez) - T + 0.12 + dy, ez, [p.nx, -0.3, p.nz]);
    }
  }
  const uring = (k: number, i: number) => 1 + (k - 1) * N + (i % N);
  for (let i = 0; i < N; i++) ui.push(ucentre, uring(1, i), uring(1, i + 1));
  for (let k = 1; k < KU + 2; k++) {
    for (let i = 0; i < N; i++) {
      const a = uring(k, i), b = uring(k, i + 1), cc = uring(k + 1, i), d = uring(k + 1, i + 1);
      ui.push(a, cc, b, b, cc, d);
    }
  }
  const under = new BufferGeometry();
  under.setAttribute('position', new BufferAttribute(new Float32Array(up), 3));
  under.setAttribute('normal', new BufferAttribute(new Float32Array(un), 3));
  under.setAttribute('uv', new BufferAttribute(new Float32Array(uu), 2));
  under.setIndex(ui);
  orientOutward(under);

  // Knuckles: two rolled barrels round the pin, either side of the ring's own knuckle, each on a
  // tab under the shell's chord edge (a three-knuckle hinge, inside the lid ring's footprint).
  const hx = -BIN_CM.hingeX, hy = BIN_CM.hingeY;
  const parts: BufferGeometry[] = [];
  for (const [z0, z1] of HINGE_KNUCKLES) {
    const barrel = turned([[0, z0], [0.26, z0, 0.07], [0.26, z1, 0.07], [0, z1]], 28, 2);
    barrel.rotateX(Math.PI / 2);
    barrel.translate(hx * U, hy * U, 0);
    parts.push(barrel, roundedBlock(1.0, 0.36, z1 - z0, 0.1, [hx + 0.55, hy - 0.04, (z0 + z1) / 2], 2));
  }
  const knuckle = merge(parts);
  return { shell, under, knuckle };
}

/** The lid's knuckles along the hinge pin (cm, z ranges): the flap's two, outside the ring's one. */
const HINGE_KNUCKLES: [number, number][] = [[-3.1, -1.12], [1.12, 3.1]];

/**
 * The lid ring's knuckle (left side; the right is mirrored): a boss moulded on the ring's top,
 * between the flap's knuckles, inside the ring's outer radius (no ears outside the silhouette).
 */
function hingeHousing(side: -1 | 1): BufferGeometry[] {
  const x = side * BIN_CM.hingeX;
  const top = BIN_CM.rimTop;
  const block = roundedBlock(0.62, 0.5, 2.1, 0.12, [x, top + BIN_CM.hingeY - 0.22, 0], 3);
  const boss = turned([[0, -1.05], [0.26, -1.05, 0.08], [0.26, 1.05, 0.08], [0, 1.05]], 28, 3);
  boss.rotateX(Math.PI / 2);
  boss.translate(x * U, (top + BIN_CM.hingeY) * U, 0);
  return [block, boss];
}

/** The hinge pin (black-oxide steel) through all three knuckles, domed heads at the ends. */
function hingePin(side: -1 | 1): BufferGeometry {
  const pin = turned([[0, -3.16], [0.12, -3.14, 0.06], [0.12, 3.14, 0.06], [0, 3.16]], 16, 1);
  pin.rotateX(Math.PI / 2);
  pin.translate(side * BIN_CM.hingeX * U, (BIN_CM.rimTop + BIN_CM.hingeY) * U, 0);
  return pin;
}

// ── Pedal ─────────────────────────────────────────────────────────────────────────────────────

/** Pedal hinge axis in the pedal frame (+z radially out at BIN.pedalAngle, cm). */
export const PEDAL_HINGE = { y: 2.3, z: BIN_CM.base + 1.63 } as const;

/**
 * A block swept round the bin's axis (pedal frame: x along the circumference, z radial, cm): a
 * rounded-rect section (radial z0–z1, height y0–y1, corner rc) carried along an arc of length
 * `length` at radius R0, its ends rounded by `re` (a moulded part following the base cup's curve).
 */
function bentBlock(length: number, z0: number, z1: number, y0: number, y1: number, rc: number, re: number, R0: number, tile: number): BufferGeometry {
  const section = (e: number) => {
    const za = z0 + e, zb = z1 - e, ya = y0 + e, yb = y1 - e, r = Math.max(rc - e, 0.04);
    // A fixed step on every fillet, so every section has the same number of points.
    const loop = roundLoop([[za, ya, r], [zb, ya, r], [zb, yb, r], [za, yb, r]], Math.PI / 12, Infinity);
    return loop.slice(0, -1);
  };
  const rows: { x: number; e: number }[] = [];
  const half = length / 2 - re;
  const endSteps = 6, mid = Math.max(2, Math.ceil((2 * half) / 0.4));
  for (let k = endSteps; k > 0; k--) { const a = (k / endSteps) * (Math.PI / 2); rows.push({ x: -half - re * Math.sin(a), e: re * (1 - Math.cos(a)) }); }
  for (let k = 0; k <= mid; k++) rows.push({ x: -half + (2 * half * k) / mid, e: 0 });
  for (let k = 1; k <= endSteps; k++) { const a = (k / endSteps) * (Math.PI / 2); rows.push({ x: half + re * Math.sin(a), e: re * (1 - Math.cos(a)) }); }
  const sections = rows.map((r) => section(r.e));
  const M = sections[0]!.length;
  const pos: number[] = [], idx: number[] = [];
  const bend = (x: number, y: number, z: number) => { const th = x / R0; pos.push(z * Math.sin(th) * U, y * U, z * Math.cos(th) * U); };
  rows.forEach((r, j) => { for (const q of sections[j]!) bend(r.x, q.y, q.r); });
  for (let j = 0; j + 1 < rows.length; j++) {
    for (let i = 0; i < M; i++) {
      const a = j * M + i, b = j * M + ((i + 1) % M), c = a + M, d = b + M;
      idx.push(a, c, b, b, c, d);
    }
  }
  // End caps: fans from each end section's centre.
  for (const [j, flip] of [[0, true], [rows.length - 1, false]] as const) {
    const cz = (z0 + z1) / 2, cy = (y0 + y1) / 2;
    const centre = pos.length / 3;
    bend(rows[j]!.x, cy, cz);
    for (let i = 0; i < M; i++) {
      const a = j * M + i, b = j * M + ((i + 1) % M);
      if (flip) idx.push(centre, a, b); else idx.push(centre, b, a);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  orientOutward(g);
  g.computeVertexNormals();
  return boxUV(g, tile);
}

/**
 * The pedal lever's plate (hinge frame: origin on the hinge axis, z out, cm): a straight back
 * edge on the barrel, a front edge curved round the bin's axis (as a stamped pedal follows the
 * base), 1.1 cm front corners, 4 mm thick with 1.2 mm rounded edges.
 */
function leverPlate(width: number, tipRadius: number, hingeZ: number, thickness: number, bevel: number): BufferGeometry {
  const hw = width / 2;
  const tipZ = (x: number) => Math.sqrt(tipRadius * tipRadius - x * x) - hingeZ;
  const corners: Corner[] = [[-hw + bevel, bevel, 0.3], [hw - bevel, bevel, 0.3]];
  for (let k = 0; k <= 24; k++) {
    const x = hw - bevel - ((2 * (hw - bevel)) * k) / 24;
    corners.push([x, tipZ(x) - bevel, k === 0 || k === 24 ? 1.0 : 0]);
  }
  const loop = roundLoop(corners, Math.PI / 48, 0).slice(0, -1);
  const shape = new Shape(loop.map((p) => new Vector2(p.r * U, p.y * U)));
  const g = new ExtrudeGeometry(shape, { depth: (thickness - 2 * bevel) * U, bevelEnabled: true, bevelThickness: bevel * U, bevelSize: bevel * U, bevelSegments: 5, curveSegments: 8 });
  // Shape in (x, z-out) → lie flat: shape y becomes z, extrusion becomes y (centred on the axis).
  g.rotateX(Math.PI / 2);
  g.translate(0, ((thickness - 2 * bevel) / 2) * U, 0);
  return g;
}

function pedalParts() {
  const { y: hy, z: hz } = PEDAL_HINGE;
  const R0 = BIN_CM.base + 0.28;
  // Housing: a PP moulding on the base cup's front, following its curve, its face 1.3 cm proud.
  const face = BIN_CM.base + 1.28;
  const housing = bentBlock(12, BIN_CM.base - 0.92, face, 0.6, 4.0, 0.55, 0.55, R0, 3);
  // The slot the lever's linkage runs through (a dark recess in the housing's face).
  const slot = bentBlock(9.6, face - 0.06, face + 0.06, hy - 0.6, hy + 0.3, 0.08, 0.08, R0, 2);
  // Hinge lugs either side of the lever's barrel, from the curved face out to the straight axis,
  // and the pin through them.
  const lugs = [-1, 1].map((sx) => {
    const x = sx * 5.0, at = Math.sqrt(face * face - x * x) - 0.3;
    return roundedBlock(0.8, 1.15, hz + 0.45 - at, 0.2, [x, hy, (at + hz + 0.45) / 2], 3);
  });
  const pin = turned([[0, -5.42], [0.13, -5.4, 0.08], [0.13, 5.4, 0.08], [0, 5.42]], 16, 1);
  pin.rotateZ(Math.PI / 2);
  pin.translate(0, hy * U, hz * U);
  // Moving parts, in the hinge's own space (origin on the hinge axis): barrel, lever, tread.
  const barrel = turned([[0, -4.5], [0.34, -4.5, 0.1], [0.34, 4.5, 0.1], [0, 4.5]], 28, 2);
  barrel.rotateZ(Math.PI / 2);
  const lever = leverPlate(9.0, hz + 4.9, hz, 0.4, 0.12);
  const tread = beveledPlate(7.6 * U, 3.3 * U, 0.3 * U, 0.85 * U, 0.1 * U, 4);
  tread.rotateX(-Math.PI / 2);
  tread.translate(0, 0.35 * U, 2.6 * U);
  return {
    housing, slot, lugs, pin,
    lever: merge([boxUV(indexed(barrel), 6), boxUV(indexed(lever), 6, true)]),
    tread: boxUV(indexed(tread), 1.2),
  };
}

// ── Build ─────────────────────────────────────────────────────────────────────────────────────

export function buildDisposalBin(_ctx: ModelContext): Object3D {
  const mats = binMaterials();
  const root = group('bin_root');

  for (const part of BIN_LATHES) {
    const loop = roundLoop(part.loop);
    const g = revolveLoop(loop, part.segments, part.tile, 'uv1' in BIN_MATERIALS[part.material]);
    mesh(part.name, g, mats[part.material], root);
  }
  const hinges = merge([...hingeHousing(-1), ...hingeHousing(1)].map((g) => boxUV(indexed(g), 3)));
  mesh('bin_hinges', hinges, mats.bin_plastic, root);
  mesh('bin_hinge_pins', merge([hingePin(-1), hingePin(1)]), mats.bin_pin, root);

  // Butterfly lid: two half-shells on their hinge pins.
  const lid = group('bin_lid', root);
  lid.position.set(0, BIN.rimTop, 0);
  const half = lidHalf();
  for (const side of [-1, 1] as const) {
    const flap = group(side < 0 ? 'bin_flap_l' : 'bin_flap_r', lid);
    flap.position.set(side * BIN.hingeX, BIN.hingeY, 0);
    const name = side < 0 ? 'bin_flap_l' : 'bin_flap_r';
    for (const [suffix, geometry, material] of [['shell', half.shell, mats.bin_steel], ['under', half.under, mats.bin_steel], ['knuckle', half.knuckle, mats.bin_plastic]] as const) {
      const g = geometry.clone();
      if (side > 0) mirrorX(g);
      g.translate(-side * BIN.hingeX, -BIN.hingeY, 0);
      if (material === mats.bin_steel) g.computeTangents();
      mesh(`${name}_${suffix}`, g, material, flap);
    }
  }
  half.shell.dispose(); half.under.dispose(); half.knuckle.dispose();

  // Pedal: its mount turns it round the base; `bin_pedal` is the hinge (rotation.x presses it).
  const p = pedalParts();
  const mount = group('bin_pedal_mount', root);
  mount.rotation.y = BIN.pedalAngle;
  mesh('bin_pedal_housing', merge([p.housing, ...p.lugs]), mats.bin_plastic, mount);
  mesh('bin_pedal_slot', p.slot, mats.bin_slot, mount);
  mesh('bin_pedal_pin', p.pin, mats.bin_pin, mount);
  const pedal = group('bin_pedal', mount);
  pedal.position.set(0, PEDAL_HINGE.y * U, PEDAL_HINGE.z * U);
  p.lever.computeTangents();
  mesh('bin_pedal_lever', p.lever, mats.bin_steel, pedal);
  mesh('bin_pedal_tread', p.tread, mats.bin_tread, pedal);

  group('bin_shadow', root).position.set(0, 0.002, 0);
  return root;
}

/** Mirror a geometry across x = 0 (the right flap), keeping outward winding. */
function mirrorX(g: BufferGeometry): void {
  g.scale(-1, 1, 1);
  const index = g.getIndex()!;
  const arr = index.array as Uint16Array | Uint32Array;
  for (let t = 0; t < arr.length; t += 3) { const s = arr[t + 1]!; arr[t + 1] = arr[t + 2]!; arr[t + 2] = s; }
  index.needsUpdate = true;
}
