import {
  Box3,
  BufferGeometry,
  CatmullRomCurve3,
  CircleGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Object3D,
  RingGeometry,
  Shape,
  Vector3,
} from 'three';
import { beveledPlate, group, lathe, mergeParts, mesh, roundedBox, wire } from './geometry.ts';
import {
  capsule,
  extrude,
  halfSpace,
  meshSDF,
  rect2,
  smoothIntersect,
  smoothSubtract,
  subtract,
  translate,
  union,
  type SDF,
} from './sdf.ts';
import type { ModelContext } from './types.ts';

/**
 * Premium Business parts (fidelity pass, direction L2). Same footprint, face angle, pad and
 * window layout as direction L, so choreography and drag geometry stay valid; construction is
 * upgraded to CAD-grade: continuous fillets, a flush glass panel in a machined pocket with a
 * crisp reveal, real drilled perforations, a shadow-gap foot, and cast/turned clip hardware.
 */

type Lib = ModelContext['lib'];

// Face line shared with direction L (keycard.ts FACE_F0/F1): back (z −0.06, y 0.82) → front (z 0.34, y 0.40).
const F0 = { z: -0.06, y: 0.82 };
const F1 = { z: 0.34, y: 0.4 };
const SLOPE = Math.atan2(F1.y - F0.y, F1.z - F0.z); // −0.81
const N = { y: Math.cos(-SLOPE), z: Math.sin(-SLOPE) }; // face normal (0, 0.69, 0.724)
const S = { y: -Math.sin(-SLOPE), z: Math.cos(-SLOPE) }; // down-slope (0, −0.724, 0.69)
const O = { y: (F0.y + F1.y) / 2, z: (F0.z + F1.z) / 2 }; // face centre
const HX = 0.46, HZ = 0.34, PLAN_R = 0.15;
const GLASS = { hu: 0.39, hv: 0.215, r: 0.05, depth: 0.02 };

/** Coordinates in the reading-face frame: u = x, v = down-slope, w = along the normal. */
function faceFrame(f: (u: number, v: number, w: number) => number): SDF {
  return (x, y, z) => {
    const dy = y - O.y, dz = z - O.z;
    return f(x, dy * S.y + dz * S.z, dy * N.y + dz * N.z);
  };
}

function housingSDF(): SDF {
  const slab = translate(extrude(rect2(HX, HZ, PLAN_R), 0.41, 0.035, 'y'), 0, 0.41, 0);
  const slopeCut = halfSpace(0, N.y, N.z, 0, F1.y, F1.z);
  let body = smoothIntersect(slab, slopeCut, 0.07);
  // Machined pocket for the glass: flat floor, tight reveal radius.
  const pocketBox = extrude(rect2(GLASS.hu, GLASS.hv, GLASS.r), GLASS.depth, 0.003, 'z');
  const pocket = faceFrame((u, v, w) => pocketBox(u, v, w));
  body = smoothSubtract(body, pocket, 0.004);
  // Signature: a row of drilled perforations on the vertical front.
  const holes: SDF[] = [];
  const pitch = 0.07, count = 9;
  for (let i = 0; i < count; i++) {
    const x = (i - (count - 1) / 2) * pitch;
    holes.push(capsule(x, 0.19, 0.28, x, 0.19, 0.6, 0.017));
  }
  return subtract(body, union(...holes));
}

function glassSDF(): SDF {
  const slab = extrude(rect2(GLASS.hu - 0.007, GLASS.hv - 0.007, GLASS.r - 0.006), 0.009, 0.004, 'z');
  return faceFrame((u, v, w) => slab(u, v, w + 0.011));
}

function footSDF(): SDF {
  return translate(extrude(rect2(HX - 0.045, HZ - 0.045, PLAN_R - 0.04), 0.019, 0.008, 'y'), 0, 0.019, 0);
}

export interface PremiumScanner {
  pad: Object3D;
  light: Object3D;
  symbolParent: Object3D;
}

/**
 * Build the premium reader under `scanner` (scanner_root). The housing sits on a recessed foot
 * `lift` above the root, like direction L.
 */
export function buildPremiumScanner(ctx: ModelContext, scanner: Object3D, lift: number): PremiumScanner {
  const { lib } = ctx;
  const simplify = ctx.simplify ?? ((g: BufferGeometry) => g);
  const body = group('scanner_housing', scanner);
  body.position.y = lift;

  const housingGeo = simplify(meshSDF(housingSDF(), new Box3(new Vector3(-HX, 0, -HZ), new Vector3(HX, 0.84, HZ)), { cell: 0.0075 }), 0.07, 0.0006);
  mesh('scanner_body', housingGeo, lib.get('mat_body'), body);
  const glassGeo = simplify(meshSDF(glassSDF(), new Box3(new Vector3(-HX, 0.35, -0.2), new Vector3(HX, 0.9, 0.42)), { cell: 0.006 }), 0.1, 0.0004);
  mesh('scanner_faceplate', glassGeo, lib.get('mat_body_ink'), body);

  // Dark hole floors so the perforations read at phone scale.
  const floors: { geometry: BufferGeometry; position: [number, number, number] }[] = [];
  for (let i = 0; i < 9; i++) floors.push({ geometry: new CircleGeometry(0.016, 16), position: [(i - 4) * 0.07, 0.19, HZ - 0.058] });
  mesh('scanner_signature', mergeParts(floors), lib.get('mat_rubber'), body);

  const foot = simplify(meshSDF(footSDF(), new Box3(new Vector3(-HX, 0, -HZ), new Vector3(HX, 0.04, HZ)), { cell: 0.01 }), 0.15, 0.0006);
  mesh('scanner_foot', foot, lib.get('mat_body_shadow'), scanner).position.y = -0.004;

  // Face frame for decals: local +Y = face normal, +Z = down-slope, origin just above the glass.
  const face = group('scanner_face', body);
  face.position.set(0, O.y + N.y * -0.0015, O.z + N.z * -0.0015);
  face.rotation.x = -SLOPE;
  const flat = -Math.PI / 2;
  const padR = 0.135;
  // Target: printed ring pad (the node the controller calls scanner_pad).
  const pad = mesh('scanner_pad', mergeParts([
    { geometry: new RingGeometry(0.052, 0.066, 64), rotationX: flat, position: [0, 0, 0] },
    { geometry: new RingGeometry(0.098, 0.11, 64), rotationX: flat, position: [0, 0, 0] },
    { geometry: new CircleGeometry(0.02, 24), rotationX: flat, position: [0, 0, 0] },
    { geometry: new RingGeometry(padR - 0.004, padR, 72), rotationX: flat, position: [0, 0, 0] },
  ]), lib.get('mat_print'), face);
  pad.position.set(-0.1, 0.0004, 0);
  // Polished champagne bezel: a thin metal frame where the glass meets the machined pocket,
  // catching one bright line of light like a finished device.
  const bezelShape = roundedRectShape(GLASS.hu - 0.0005, GLASS.hv - 0.0005, GLASS.r - 0.0005);
  bezelShape.holes.push(roundedRectShape(GLASS.hu - 0.0095, GLASS.hv - 0.0095, GLASS.r - 0.0095));
  const bezelGeo = new ExtrudeGeometry(bezelShape, { depth: 0.009, bevelEnabled: true, bevelThickness: 0.0012, bevelSize: 0.0012, bevelSegments: 2, curveSegments: 10 });
  bezelGeo.rotateX(flat);
  const bezel = mesh('scanner_bezel', bezelGeo, lib.get('mat_bezel'), face);
  bezel.position.y = -0.0102;
  // Status window: a rounded display area on the glass that lights with the glyph.
  const win = mesh('scanner_light', beveledPlate(0.2, 0.15, 0.004, 0.04, 0.0015, 2), lib.get('mat_status'), face);
  win.rotation.x = flat;
  win.position.set(0.24, 0.0012, 0);
  return { pad, light: win, symbolParent: win };
}

function roundedRectShape(hx: number, hy: number, r: number): Shape {
  const sh = new Shape();
  const q = Math.PI / 2;
  sh.moveTo(-hx + r, -hy);
  sh.lineTo(hx - r, -hy);
  sh.absarc(hx - r, -hy + r, r, -q, 0, false);
  sh.lineTo(hx, hy - r);
  sh.absarc(hx - r, hy - r, r, 0, q, false);
  sh.lineTo(-hx + r, hy);
  sh.absarc(-hx + r, hy - r, r, q, 2 * q, false);
  sh.lineTo(-hx, -hy + r);
  sh.absarc(-hx + r, -hy + r, r, 2 * q, 3 * q, false);
  return sh;
}

/**
 * Cast/turned clip hardware under clip_pivot: curved spine claw (same run and gate geometry as
 * direction L's J-hook), gate knuckle, swivel barrel with a coral anodised band, a D-ring and a
 * stitched strap fitting the lanyard strands leave from.
 */
export function buildPremiumClip(lib: Lib, clipPivot: Object3D, hook: { back: number; runY: number; hinge: number; radius: number; gateLength: number }): Object3D {
  const metal = lib.get('mat_metal');
  const { back, runY, hinge, radius, gateLength } = hook;
  const spine = new CatmullRomCurve3([
    new Vector3(0, -0.058, 0),
    new Vector3(0, -0.068, -0.02),
    new Vector3(0, -0.095, -0.043),
    new Vector3(0, -0.135, back - 0.002),
    new Vector3(0, runY + 0.012, back + 0.001),
    new Vector3(0, runY + 0.001, back + 0.014),
    new Vector3(0, runY, back + 0.03),
    new Vector3(0, runY, hinge - 0.02),
    new Vector3(0, runY, hinge),
  ], false, 'catmullrom', 0.2);
  // Static turned/cast parts share one material, so they merge into one draw: spine claw,
  // gate knuckle, swivel barrel, stem and the D-ring the strap wraps.
  const knuckle = lathe([[0, -0.018], [radius * 1.3, -0.018, 0.004], [radius * 1.3, 0.018, 0.004], [0, 0.018]], 20, 3);
  knuckle.rotateZ(Math.PI / 2);
  const ring = new CatmullRomCurve3([
    new Vector3(0, 0.004, 0), new Vector3(0.04, 0.006, 0), new Vector3(0.05, 0.028, 0),
    new Vector3(0.036, 0.046, 0), new Vector3(-0.036, 0.046, 0), new Vector3(-0.05, 0.028, 0),
    new Vector3(-0.04, 0.006, 0),
  ], true, 'catmullrom', 0.5);
  mesh('clip_body', mergeParts([
    { geometry: wire(spine.getPoints(48), radius, 12) },
    { geometry: knuckle, position: [0, runY, hinge] },
    { geometry: lathe([[0, -0.02], [0.019, -0.02, 0.004], [0.021, -0.012, 0.003], [0.021, 0.012, 0.003], [0.017, 0.02, 0.004], [0, 0.02]], 32, 3), position: [0, -0.038, 0] },
    { geometry: lathe([[0, 0], [0.008, 0, 0.002], [0.007, 0.022, 0.002], [0, 0.022]], 16, 2), position: [0, -0.018, 0] },
    { geometry: wire(ring.getPoints(40), 0.0065, 8) },
  ]), metal, clipPivot);
  const gate = group('clip_gate', clipPivot);
  gate.position.set(0, runY, hinge);
  mesh('clip_gate_leg', wire([new Vector3(0, 0, 0), new Vector3(0, gateLength * 0.5, 0.004), new Vector3(0, gateLength, 0)], radius * 0.85, 10), metal, gate);
  // Coral anodised band on the swivel barrel.
  const band = mesh('clip_crimp', new CylinderGeometry(0.0222, 0.0222, 0.008, 32), lib.get('mat_anodized'), clipPivot);
  band.position.y = -0.036;
  // Stitched fitting: the folded strap over the ring's top bar, with a stitch box.
  const fitting = group('strap_fitting', clipPivot);
  mesh('strap_fold', roundedBox(0.086, 0.085, 0.022, 0.009, 3), lib.get('mat_fabric'), fitting).position.y = 0.088;
  const stitch = mesh('strap_stitch', beveledPlate(0.056, 0.036, 0.003, 0.006, 0.001, 1), lib.get('mat_accent'), fitting);
  stitch.position.set(0, 0.096, 0.0115);
  return gate;
}

/** Height (clip space) where the lanyard strands leave the stitched fitting. */
export const PREMIUM_STRAP_TOP = 0.128;
