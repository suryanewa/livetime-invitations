import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { Box3, Color, Group, type Material, type Mesh, MeshStandardMaterial, PerspectiveCamera, ShaderLib, ShaderMaterial, Vector3, type WebGLProgramParametersWithUniforms } from 'three';
import { mulberry32 } from '../src/motion/random.ts';
import { listTextureSlots } from '@gltf-transform/functions';
import { DIRECTIONS, type MaterialLibrary } from '../src/render/materials.ts';
import {
  attachBin, BIN, BIN_BOUNDS, BIN_CLOSE, BIN_CM, BIN_FLOOR, BIN_LATHES, BIN_MATERIALS, binEntranceStart, binIn, binLight, binPlaceholder, binShadowShare, buildDisposalBin,
  detachBin, dropHeight, fillBin, flapAngles, flapsClosing, GRAVITY, openBinFramePoints, openBinSilhouette, PEDAL_HINGE, patchBinVisibility, pedalAngle, roundLoop,
} from '../models/disposalBin.ts';
import { BIN_POS, CAKE_RADIUS, CAKE_TOTAL_HEIGHT, STAND } from '../models/birthdayContract.ts';
import { COVER, DINNER_BIN, DINNER_BIN_POS, DINNER_BIN_SCALE, DINNER_WORLD_SCALE, DISH_HEIGHT, PLATE } from '../models/dinnerContract.ts';
import { createIO, findNode } from '../scripts/masters/compose.ts';

/**
 * v1.5: the shared bin is a real 47 cm butterfly pedal bin (models/disposalBin.ts), at its real size
 * in both scenes, with PBR textures generated at export (scripts/bin/).
 */

function plainLibrary(): MaterialLibrary {
  const direction = DIRECTIONS.L2;
  const make = (n: string) => new MeshStandardMaterial({ name: n, color: new Color(direction.surfaces[n]?.color ?? '#808080') });
  return { direction, get: make, unique: make, dispose() {} } as unknown as MaterialLibrary;
}

describe('Shared bin: model', () => {
  it('the open bin stays inside BIN_BOUNDS', () => {
    const bin = buildDisposalBin({ lib: plainLibrary() });
    const [l, r] = flapAngles(1);
    bin.getObjectByName('bin_flap_l')!.rotation.z = l;
    bin.getObjectByName('bin_flap_r')!.rotation.z = r;
    bin.updateMatrixWorld(true);
    const box = new Box3().setFromObject(bin);
    expect(BIN_BOUNDS.containsBox(box)).toBe(true);
    // The open flaps stand about 60 cm high, the rim at 44.5 cm, the crown at 47 cm.
    expect(box.max.y * 20).toBeGreaterThan(57);
  });

  it('closed, the lid rests on the ring and nothing stands proud of the turned body but the pedal', () => {
    const bin = buildDisposalBin({ lib: plainLibrary() });
    bin.updateMatrixWorld(true);
    const all = new Box3().setFromObject(bin);
    expect(all.max.y).toBeCloseTo(BIN.height, 3);
    const lid = new Box3().setFromObject(bin.getObjectByName('bin_lid')!);
    expect(lid.min.y).toBeGreaterThanOrEqual(BIN.rimTop - 1e-6);
    // Hinges inside the lid ring's footprint (no ears outside the silhouette).
    const hinges = new Box3().setFromObject(bin.getObjectByName('bin_hinges')!);
    expect(Math.max(hinges.max.x, -hinges.min.x)).toBeLessThan((BIN_CM.ring * 1) / 20);
    for (const name of ['bin_flap_l_knuckle', 'bin_flap_r_knuckle', 'bin_hinge_pins']) {
      const b = new Box3().setFromObject(bin.getObjectByName(name)!);
      expect(Math.max(b.max.x, -b.min.x), name).toBeLessThan(BIN_CM.ring / 20);
    }
  });

  it('every turned profile is a closed loop with unit outward normals; fillets are true arcs', () => {
    for (const part of BIN_LATHES) {
      const loop = roundLoop(part.loop);
      expect(loop[0]!.r).toBeCloseTo(loop[loop.length - 1]!.r, 9);
      expect(loop[0]!.y).toBeCloseTo(loop[loop.length - 1]!.y, 9);
      for (const p of loop) expect(Math.hypot(p.nr, p.ny), part.name).toBeCloseTo(1, 6);
    }
  });

  it('the pedal sits under the lid seam and goes down as the lid opens', () => {
    expect(BIN.pedalAngle).toBe(0);
    expect(pedalAngle(0)).toBe(0);
    expect(pedalAngle(1)).toBeCloseTo(BIN.pedalPress, 9);
    // Its tread moves about a centimetre.
    expect(Math.sin(BIN.pedalPress) * 4.4).toBeGreaterThan(0.8);
    const root = new Group();
    const bin = buildDisposalBin({ lib: plainLibrary() });
    attachBin(root, bin, plainLibrary(), new Vector3(), 0);
    const [l] = flapAngles(1);
    bin.getObjectByName('bin_flap_l')!.rotation.set(0, 0, l);
    expect(bin.getObjectByName('bin_pedal')!.rotation.x).toBeCloseTo(BIN.pedalPress, 9);
    bin.getObjectByName('bin_flap_l')!.rotation.set(0, 0, 0);
    expect(bin.getObjectByName('bin_pedal')!.rotation.x).toBe(0);
  });

  it('every material is a named PBR material the library does not own', () => {
    const bin = buildDisposalBin({ lib: plainLibrary() });
    const names = new Set<string>();
    bin.traverse((o) => { const m = o as Mesh; if (m.isMesh) names.add((m.material as MeshStandardMaterial).name); });
    expect([...names].sort()).toEqual(Object.keys(BIN_MATERIALS).sort());
    for (const n of names) expect(DIRECTIONS.L2.surfaces[n], n).toBeUndefined();
  });
});

/** Runs a material's onBeforeCompile on three's own physical shader source (as the renderer would). */
function compiled(m: Material): WebGLProgramParametersWithUniforms {
  const shader = { uniforms: {}, vertexShader: ShaderLib.physical.vertexShader, fragmentShader: ShaderLib.physical.fragmentShader } as unknown as WebGLProgramParametersWithUniforms;
  m.onBeforeCompile(shader, undefined as never);
  return shader;
}

describe('Shared bin: v1.5 polish (judge round)', () => {
  it('no coloured accent: the pedal tread is black polystyrene and every surface is near neutral', () => {
    const hsl = { h: 0, s: 0, l: 0 };
    expect(new Color(BIN_MATERIALS.bin_tread.color).getHSL(hsl).l).toBeLessThan(0.12);
    for (const [name, spec] of Object.entries(BIN_MATERIALS)) expect(new Color(spec.color).getHSL(hsl).s, name).toBeLessThan(0.1);
  });

  it('the flaps open upright, as a butterfly lid\'s halves stand (80–90°)', () => {
    expect(BIN.flapOpen).toBeLessThanOrEqual(Math.PI / 2 + 1e-12);
    expect(BIN.flapOpen).toBeGreaterThanOrEqual((80 * Math.PI) / 180);
  });

  it('attachBin: the outer shells see the floor, the open flaps cast no shadow above the crown, detachBin frees it', () => {
    const root = new Group();
    const bin = buildDisposalBin({ lib: plainLibrary() });
    attachBin(root, bin, plainLibrary(), new Vector3(-1, 0, -2), 0.4);
    const floorPatched = new Set<string>();
    bin.traverse((o) => {
      const m = (o as Mesh).material as Material | undefined;
      if ((o as Mesh).isMesh && m?.userData.binFloor) floorPatched.add(m.name);
    });
    expect([...floorPatched].sort()).toEqual([...BIN_FLOOR.materials].sort());
    const body = compiled((bin.getObjectByName('bin_body') as Mesh).material as Material);
    expect(body.fragmentShader).toMatch(/radiance = mix\(radiance, uBinFloorL \* binLit, binBelow\)/);
    expect(body.uniforms.uBinWallZ).toBe(binLight(bin).wallZ);
    // Every mesh casts through the bin's own shadow material: the flaps' discards above the crown,
    // all of them drop out below the shadow's share (it enters the frame with the bin).
    const flaps = new Set<Material>(), rest = new Set<Material>();
    for (const name of ['bin_flap_l', 'bin_flap_r']) bin.getObjectByName(name)!.traverse((o) => { if ((o as Mesh).isMesh) flaps.add(o.customDepthMaterial!); });
    bin.traverse((o) => { if ((o as Mesh).isMesh && !flaps.has(o.customDepthMaterial!)) rest.add(o.customDepthMaterial!); });
    expect(flaps.size).toBe(1);
    expect(rest.size).toBe(1);
    const depth = (m: Material) => {
      const shader = { uniforms: {}, vertexShader: ShaderLib.depth.vertexShader, fragmentShader: ShaderLib.depth.fragmentShader } as unknown as WebGLProgramParametersWithUniforms;
      m.onBeforeCompile(shader, undefined as never);
      return shader;
    };
    const flap = depth([...flaps][0]!), other = depth([...rest][0]!);
    expect(flap.fragmentShader).toMatch(/if \(vBinShadowY > uBinCrownY \+ 0\.004\) discard;/);
    expect(other.fragmentShader).not.toMatch(/uBinCrownY \+ 0\.004/);
    for (const sh of [flap, other]) expect(sh.fragmentShader).toMatch(/>= uBinCast\) discard;/);
    expect((flap.uniforms.uBinCrownY as { value: number }).value).toBeCloseTo(BIN.height, 9);
    expect(other.uniforms.uBinCast).toBe(binLight(bin).cast);
    let freed = 0;
    for (const m of [...flaps, ...rest]) m.addEventListener('dispose', () => freed++);
    detachBin(bin);
    expect(freed).toBe(2);
  });

  it('a scene rigs a placeholder and the loaded bin fills it: the same pivots, one contact shadow, the pedal linked', () => {
    const root = new Group();
    const slot = binPlaceholder();
    const flapL = slot.getObjectByName('bin_flap_l')!, flapR = slot.getObjectByName('bin_flap_r')!;
    attachBin(root, slot, plainLibrary(), new Vector3(-1, 0, -2), 0.4);
    expect(slot.getObjectByName('bin_body')).toBeUndefined();
    const built = buildDisposalBin({ lib: plainLibrary() });
    fillBin(slot, built, root, plainLibrary());
    expect(slot.getObjectByName('bin_flap_l')).toBe(flapL);
    expect(slot.getObjectByName('bin_flap_r')).toBe(flapR);
    expect(slot.getObjectByName('bin_body')).toBeDefined();
    expect(flapL.getObjectByName('bin_flap_l_shell')).toBeDefined();
    let shadows = 0;
    slot.traverse((o) => { if (o.name === 'bin_shadow') shadows++; });
    expect(shadows).toBe(1);
    // Same shapes as the bin built whole.
    const whole = buildDisposalBin({ lib: plainLibrary() });
    whole.updateMatrixWorld(true);
    slot.position.set(0, 0, 0); slot.rotation.set(0, 0, 0);
    slot.updateMatrixWorld(true);
    expect(new Box3().setFromObject(slot).distanceToPoint(new Vector3())).toBe(new Box3().setFromObject(whole).distanceToPoint(new Vector3()));
    // The pedal follows the flap.
    flapL.rotation.z = BIN.flapOpen;
    expect(slot.getObjectByName('bin_pedal')!.rotation.x).toBeCloseTo(BIN.pedalPress, 9);
    expect(() => fillBin(slot, buildDisposalBin({ lib: plainLibrary() }), root, plainLibrary())).toThrow();
    detachBin(slot);
  });

  it('the open bin\'s framing silhouette from its design holds every vertex of the built bin (the same hull)', () => {
    const root = new Group();
    const bin = buildDisposalBin({ lib: plainLibrary() });
    attachBin(root, bin, plainLibrary(), new Vector3(-1, 0, -2), 0.5, 1.2);
    const all = openBinFramePoints(bin, new Vector3(-1, 0, -2), 0.5, 1.2);
    const design = openBinSilhouette(new Vector3(-1, 0, -2), 0.5, 1.2);
    expect(design.length).toBeLessThan(all.length);
    const rand = mulberry32(7);
    for (let k = 0; k < 300; k++) {
      const d = new Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize();
      let a = -Infinity, b = -Infinity;
      for (const p of all) a = Math.max(a, p.dot(d));
      for (const p of design) b = Math.max(b, p.dot(d));
      expect(Math.abs(a - b)).toBeLessThan(1e-5);
    }
  });

  it('its shadow enters the frame with it, and its slide starts just out of the drawn view', () => {
    const root = new Group();
    const bin = buildDisposalBin({ lib: plainLibrary() });
    attachBin(root, bin, plainLibrary(), new Vector3(0, 0, 0), 0);
    const camera = new PerspectiveCamera(18, 0.5625, 0.5, 200);
    camera.position.set(4, 4, 14);
    camera.lookAt(0, 1, 0);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    const corners = [-1, 1].flatMap((x) => [-1, 1].flatMap((z) => [0, 1].map((y) => new Vector3(x * BIN.radius, y * BIN.height, z * BIN.radius))));
    expect(binShadowShare(bin, camera, corners)).toBe(1);
    const start = binEntranceStart(camera, root, 0, 0);
    expect(start).toBeLessThanOrEqual(-1);
    bin.position.x = start;
    expect(binShadowShare(bin, camera, corners)).toBe(0);
    bin.position.x = start + BIN.radius;
    const partly = binShadowShare(bin, camera, corners);
    expect(partly).toBeGreaterThan(0);
    expect(partly).toBeLessThan(1);
    // A wider view starts it further out.
    camera.aspect = 1.8;
    camera.updateProjectionMatrix();
    expect(binEntranceStart(camera, root, 0, 0)).toBeLessThan(start);
    detachBin(bin);
  });

  it('inside the bin: the mouth\'s form factor for diffuse, the aperture test for specular; only on standard materials, chained', () => {
    const bin = buildDisposalBin({ lib: plainLibrary() });
    const light = binLight(bin);
    const on = { value: 1 };
    let earlier = false;
    const m = new MeshStandardMaterial();
    m.onBeforeCompile = () => { earlier = true; };
    patchBinVisibility(m, light, on);
    const shader = compiled(m);
    expect(earlier).toBe(true);
    expect(shader.fragmentShader).toMatch(/binF \+= LTC_EdgeVectorFormFactor\(binPrev, binV\);/);
    expect(shader.fragmentShader).toMatch(/reflectedLight\.indirectDiffuse \*= mix\(1\.0, binDiff, binIn\);/);
    expect(m.customProgramCacheKey()).toMatch(/bin-visibility-v2$/);
    const custom = new ShaderMaterial();
    patchBinVisibility(custom, light, on);
    expect(custom.userData.binVisibility).toBeUndefined();
  });
});

describe('Shared bin: one real size in both scenes', () => {
  it('Dinner holds it at the inverse of its world scale', () => {
    expect(DINNER_BIN_SCALE * DINNER_WORLD_SCALE).toBeCloseTo(1, 12);
    expect(DINNER_BIN.rimTop * DINNER_WORLD_SCALE).toBeCloseTo(BIN.rimTop, 12);
    expect(binIn(1).opening).toBe(BIN.opening);
  });

  it('the pedal clears the stand (Birthday) and the plate and cloche (Dinner) by at least 2 cm', () => {
    const reach = (PEDAL_HINGE.z + 4.9) / 20; // the lever's tip from the bin axis, world units
    // Birthday: the pedal points at the stand; its foot is the nearest part at the pedal's height.
    expect(Math.hypot(BIN_POS.x, BIN_POS.z) - reach - STAND.foot).toBeGreaterThan(0.1);
    // Dinner (scene units): it points at the dish.
    expect(Math.hypot(DINNER_BIN_POS.x, DINNER_BIN_POS.z) - reach * DINNER_BIN_SCALE - Math.max(PLATE.radius, COVER.radius)).toBeGreaterThan(0.1 * DINNER_BIN_SCALE);
  });

  it('both objects fit the mouth with the 4 cm margin and sink below the rim on the bucket floor', () => {
    expect(CAKE_RADIUS).toBeLessThan(BIN.opening - 0.04);
    expect(BIN.floor + CAKE_TOTAL_HEIGHT).toBeLessThan(BIN.rimTop - 0.3);
    expect(PLATE.radius).toBeLessThan(DINNER_BIN.opening - 0.04);
    expect(DINNER_BIN.floor + DISH_HEIGHT).toBeLessThan(DINNER_BIN.rimTop - 0.3);
  });
});

describe('Shared bin: physics of the decline', () => {
  it('released at rest, the object falls under gravity and lands softly on the floor (C1)', () => {
    const y0 = BIN.rimTop + 0.06, floor = BIN.floor;
    expect(dropHeight(y0, floor, 0, GRAVITY)).toBe(y0);
    // Free fall: ½ g t² while well above the floor.
    expect(dropHeight(y0, floor, 0.1, GRAVITY)).toBeCloseTo(y0 - 0.5 * GRAVITY * 0.01, 9);
    let prev = dropHeight(y0, floor, 0, GRAVITY), prevV = 0;
    const h = 1e-4;
    for (let t = h; t < 0.6; t += h) {
      const y = dropHeight(y0, floor, t, GRAVITY);
      const v = (y - prev) / h;
      expect(y).toBeGreaterThanOrEqual(floor - 1e-9);
      expect(Math.abs(v - prevV)).toBeLessThan(0.1); // no velocity jump (the landing is rounded)
      prev = y; prevV = v;
    }
    expect(dropHeight(y0, floor, 0.6, GRAVITY)).toBe(floor);
  });

  it('the soft close is C1, nearly shut after BIN_CLOSE.toGap and shut after toGap + last', () => {
    expect(flapsClosing(0)).toBe(1);
    expect(flapsClosing(BIN_CLOSE.toGap)).toBeCloseTo(BIN_CLOSE.gap, 9);
    expect(flapsClosing(BIN_CLOSE.toGap + BIN_CLOSE.last)).toBe(0);
    const h = 1e-4;
    let prevV = 0;
    for (let t = h; t < BIN_CLOSE.toGap + BIN_CLOSE.last + 0.05; t += h) {
      const v = (flapsClosing(t) - flapsClosing(t - h)) / h;
      expect(Math.abs(v - prevV)).toBeLessThan(0.05);
      prevV = v;
    }
  });
});

describe('Shared bin: the exported GLB', () => {
  const file = join(import.meta.dirname, '..', 'assets', 'shared', 'disposal-bin.glb');

  it('carries the contract nodes, the textured materials and the second UV set where occlusion lives', async () => {
    const doc = await createIO().read(file);
    for (const n of ['bin_root', 'bin_body', 'bin_lid', 'bin_flap_l', 'bin_flap_r', 'bin_pedal', 'bin_shadow']) expect(findNode(doc, n), n).toBeTruthy();
    const mats = new Map(doc.getRoot().listMaterials().map((m) => [m.getName(), m]));
    for (const name of Object.keys(BIN_MATERIALS)) expect(mats.has(name), name).toBe(true);
    // Micro-normal on every finish but the slot and the pins; occlusion + roughness on UV1 for the turned parts.
    for (const name of ['bin_powder', 'bin_base', 'bin_ring', 'bin_liner', 'bin_plastic', 'bin_rubber', 'bin_steel', 'bin_tread']) {
      expect(mats.get(name)!.getNormalTexture(), name).toBeTruthy();
    }
    for (const name of ['bin_powder', 'bin_base', 'bin_ring', 'bin_liner']) {
      const m = mats.get(name)!;
      expect(m.getOcclusionTexture(), name).toBeTruthy();
      expect(m.getOcclusionTextureInfo()!.getTexCoord(), name).toBe(1);
      expect(m.getMetallicRoughnessTextureInfo()!.getTexCoord(), name).toBe(1);
    }
    expect(mats.get('bin_steel')!.getExtension('KHR_materials_anisotropy')).toBeTruthy();
    // Every texture is WebP; every mesh of a UV1 material has TEXCOORD_1; the steel carries tangents.
    for (const t of doc.getRoot().listTextures()) expect(t.getMimeType(), listTextureSlots(t).join()).toBe('image/webp');
    for (const mesh of doc.getRoot().listMeshes()) {
      for (const prim of mesh.listPrimitives()) {
        const name = prim.getMaterial()!.getName() as keyof typeof BIN_MATERIALS;
        if ('uv1' in BIN_MATERIALS[name]) expect(prim.getAttribute('TEXCOORD_1'), mesh.getName()).toBeTruthy();
        if (name === 'bin_steel') expect(prim.getAttribute('TANGENT'), mesh.getName()).toBeTruthy();
      }
    }
  });
});
