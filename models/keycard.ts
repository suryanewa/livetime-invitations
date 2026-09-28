import {
  Box3,
  CylinderGeometry,
  ExtrudeGeometry,
  Mesh,
  type MeshStandardMaterial,
  Object3D,
  Path,
  Shape,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ContactShadow } from '../src/render/contactShadow.ts';
import { beveledPlate, filletPolyline, group, inlayPlate, lathe, mesh, roundedBox, roundedRectPath, wire, type ProfilePoint } from './geometry.ts';
import { LanyardStrand } from './lanyard.ts';
import { collectNodes, disposeGeometry, type BuiltModel, type ModelContext } from './types.ts';

export type CardTemplate = 'light' | 'dark';

export const BUSINESS_NODES = [
  'business_root', 'card_authored', 'card_secondary', 'card_mesh', 'clip_pivot', 'lanyard_anchor',
  'lanyard_curve', 'scanner_root', 'scanner_pad', 'scanner_light', 'card_shadow',
] as const;

export const CARD = { width: 0.86, height: 1.3, depth: 0.05, slotW: 0.24, slotH: 0.05 };
/** Card centre relative to the clip pivot when hanging. */
export const CARD_OFFSET_Y = -0.747;
/** Guest-ready pivot position. */
export const HANG_PIVOT = new Vector3(-0.5, 2.25, 0.05);
export const SCANNER_POS = new Vector3(0.62, 0, 0);
export const LANYARD_TOP_Y = 3.9;
export const LANYARD_SPREAD = 0.13;

/** Closed rounded polygon (x,y,fillet) → Shape. */
function roundedPolygon(points: ProfilePoint[], segments = 6): Shape {
  const n = points.length;
  // Rotate so the polyline starts and ends on a straight midpoint, letting every corner fillet.
  const a = points[n - 1]!, b = points[0]!;
  const mid: ProfilePoint = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0];
  const pts = filletPolyline([mid, ...points, mid], segments);
  const s = new Shape();
  pts.forEach((p, i) => (i === 0 ? s.moveTo(p.x, p.y) : s.lineTo(p.x, p.y)));
  return s;
}

function checkGeometry(size: number, depth: number) {
  const s = new Shape();
  const w = size * 0.16;
  // A thick check stroke built as a polygon.
  s.moveTo(-0.5 * size, 0.02 * size);
  s.lineTo(-0.16 * size, -0.32 * size);
  s.lineTo(0.52 * size, 0.36 * size);
  s.lineTo(0.52 * size - w * 0.8, 0.36 * size + w * 0.8);
  s.lineTo(-0.16 * size, -0.32 * size + w * 1.13);
  s.lineTo(-0.5 * size + w * 0.8, 0.02 * size + w * 0.8);
  s.closePath();
  const g = new ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: depth * 0.4, bevelThickness: depth * 0.4, bevelSegments: 2 });
  g.translate(0, 0, -depth / 2);
  return g;
}

export interface KeycardModel extends BuiltModel {
  strands: [LanyardStrand, LanyardStrand];
  /** Recompute strap curves from the anchor and the clip's current world transform. */
  updateLanyard(): void;
  statusMaterial: MeshStandardMaterial;
  symbols: { accept: Object3D; decline: Object3D };
}

export function buildKeycard(ctx: ModelContext, template: CardTemplate = 'light'): KeycardModel {
  const { lib } = ctx;
  const dir = lib.direction;
  const enamel = dir.signature.kind === 'perforation';
  const g = dir.geometry;

  const root = group('business_root');

  // ── Card assembly ───────────────────────────────────────────────────────────
  const cardAuthored = group('card_authored', root);
  cardAuthored.position.copy(HANG_PIVOT);
  const cardSecondary = group('card_secondary', cardAuthored);
  const clipPivot = group('clip_pivot', cardSecondary);

  const { width: W, height: H, depth: D } = CARD;
  const radius = enamel ? 0.12 : 0.085;
  const slot = roundedRectPath(new Path(), CARD.slotW, CARD.slotH, CARD.slotH / 2, 0, H / 2 - 0.1);
  const cardMesh = mesh(
    'card_mesh',
    beveledPlate(W, H, D, radius, D * g.bevelRatio, g.bevelSegments, [slot]),
    lib.get(template === 'light' ? 'mat_card_light' : 'mat_card_dark'),
    cardSecondary,
  );
  cardMesh.position.y = CARD_OFFSET_Y;
  const face = D / 2;

  if (!enamel) {
    // Satin Studio: ink stipple inlay band, coral accent stripe, shallow embossed mark.
    const band = mesh('card_band', inlayPlate(W - 0.12, 0.3, 0.006, 0.04, 0.2), lib.get(template === 'light' ? 'mat_signature' : 'mat_signature_light'), cardMesh);
    band.position.set(0, -0.24, face);
    const stripe = mesh('card_stripe', beveledPlate(W - 0.12, 0.034, 0.006, 0.012, 0.002, 1), lib.get('mat_accent'), cardMesh);
    stripe.position.set(0, -0.04, face);
    const mark = mesh('card_mark', new TorusGeometry(0.062, 0.012, 8, 40), lib.get('mat_card_mark'), cardMesh);
    mark.scale.z = 0.35;
    mark.position.set(-0.26, 0.2, face);
    for (const [y, len] of [[0.235, 0.34], [0.17, 0.22]] as const) {
      const bar = mesh('card_mark_bar', beveledPlate(len, 0.026, 0.006, 0.013, 0.002, 1), lib.get('mat_card_mark'), cardMesh);
      bar.position.set(-0.13 + len / 2, y, face);
    }
  } else {
    // Enamel Workshop: colour panel inside a cream border, accent stripe, perforated strip.
    const panel = mesh('card_panel', beveledPlate(W - 0.14, 0.82, 0.008, 0.07, 0.003, 2), lib.get('mat_insert'), cardMesh);
    panel.position.set(0, 0.0, face);
    const stripe = mesh('card_stripe', beveledPlate(W - 0.14, 0.05, 0.01, 0.02, 0.003, 1), lib.get('mat_accent'), cardMesh);
    stripe.position.set(0, -0.28, face);
    const markRing = mesh('card_mark', new TorusGeometry(0.07, 0.018, 10, 40), lib.get('mat_body'), cardMesh);
    markRing.scale.z = 0.4;
    markRing.position.set(-0.2, 0.2, face + 0.008);
    const perf = mesh('card_perforation', inlayPlate(W - 0.14, 0.07, 0.004, 0.02, 0.07), lib.get('mat_signature'), cardMesh);
    perf.position.set(0, -0.5, face);
  }

  // Clip: body, crimp and a wire hook passing through the slot.
  const clipBody = mesh('clip_body', roundedBox(0.11, 0.1, 0.056, enamel ? 0.03 : 0.018), lib.get(enamel ? 'mat_accent' : 'mat_metal'), clipPivot);
  clipBody.position.y = -0.04;
  const crimp = mesh('clip_crimp', roundedBox(0.13, 0.06, 0.04, enamel ? 0.018 : 0.01), lib.get(enamel ? 'mat_body_ink' : 'mat_anodized'), clipPivot);
  crimp.position.y = 0.04;
  const hookPts: Vector3[] = [];
  const hz = 0.042, hr = 0.012;
  hookPts.push(new Vector3(0, -0.07, hz), new Vector3(0, -0.14, hz));
  for (let i = 1; i < 12; i++) {
    const a = (i / 12) * Math.PI;
    hookPts.push(new Vector3(0, -0.14 - Math.sin(a) * hz, Math.cos(a) * hz));
  }
  hookPts.push(new Vector3(0, -0.14, -hz), new Vector3(0, -0.07, -hz));
  mesh('clip_hook', wire(hookPts, hr, 10), lib.get(enamel ? 'mat_metal_dark' : 'mat_metal'), clipPivot);

  // ── Lanyard ────────────────────────────────────────────────────────────────
  const anchor = group('lanyard_anchor', root);
  anchor.position.set(HANG_PIVOT.x, LANYARD_TOP_Y, HANG_PIVOT.z);
  const strandLength = LANYARD_TOP_Y - (HANG_PIVOT.y + 0.07) + 0.02;
  const strands: [LanyardStrand, LanyardStrand] = [new LanyardStrand(strandLength), new LanyardStrand(strandLength)];
  const lanyard = group('lanyard_curve', root);
  const fabric = lib.get('mat_fabric');
  strands.forEach((s, i) => mesh(`lanyard_strand_${i}`, s.geometry, fabric, lanyard).frustumCulled = false);

  const facing = new Vector3(0, 0, 1);
  const top = new Vector3();
  const attach = new Vector3();
  const updateLanyard = () => {
    root.updateMatrixWorld(true);
    strands.forEach((s, i) => {
      const side = i === 0 ? -1 : 1;
      top.set(anchor.position.x + side * LANYARD_SPREAD, anchor.position.y, anchor.position.z);
      attach.set(side * 0.03, 0.065, 0);
      clipPivot.localToWorld(attach);
      root.worldToLocal(attach);
      s.update(top, attach, facing);
    });
  };

  // ── Scanner ────────────────────────────────────────────────────────────────
  const scanner = group('scanner_root', root);
  scanner.position.copy(SCANNER_POS);
  const SW = 0.95;
  // Side profile (z, y): long 46° reading face so the pad presents to the shared camera.
  const F0 = new Vector2(-0.06, 0.82), F1 = new Vector2(0.34, 0.4);
  const profile: ProfilePoint[] = [
    [-0.34, 0, 0.03], [-0.34, 0.82, 0.12], [F0.x, F0.y, 0.07], [F1.x, F1.y, 0.06], [0.34, 0, 0.03],
  ];
  const sb = enamel ? 0.07 : 0.04;
  // Inset the profile by the bevel so the bevelled outer surface lands on the design profile.
  const sx = (0.68 - 2 * sb) / 0.68, sy = (0.82 - 2 * sb) / 0.82;
  const bodyShape = roundedPolygon(profile.map(([x, y, r = 0]) => [x * sx, sb + y * sy, Math.max(0.005, r - sb * 0.5)] as ProfilePoint), 6);
  const bodyGeo = new ExtrudeGeometry(bodyShape, { depth: SW - 2 * sb, bevelEnabled: true, bevelSize: sb, bevelThickness: sb, bevelSegments: g.bevelSegments, curveSegments: 8 });
  bodyGeo.translate(0, 0, -(SW - 2 * sb) / 2);
  bodyGeo.rotateY(-Math.PI / 2);
  mesh('scanner_body', bodyGeo, lib.get('mat_body'), scanner);

  // Reading face frame: local +Y is the face normal, local +Z runs down the face.
  const faceFrame = group('scanner_face', scanner);
  const fc = F0.clone().add(F1).multiplyScalar(0.5);
  const slope = Math.atan2(F1.y - F0.y, F1.x - F0.x); // negative: face falls towards the front
  // Outward face normal in (z, y), and the exact plane shift caused by inset-scale + bevel.
  const fn = new Vector2(-(F1.y - F0.y), F1.x - F0.x).normalize();
  const scaledMid = new Vector2(fc.x * sx, sb + fc.y * sy);
  const planeOffset = sb + scaledMid.sub(fc).dot(fn);
  faceFrame.position.set(0, fc.y + fn.y * planeOffset, fc.x + fn.x * planeOffset);
  faceFrame.rotation.x = -slope;

  const plateLen = 0.42, plateW = SW - 0.2;
  const plateGeo = beveledPlate(plateW, plateLen, 0.024, enamel ? 0.07 : 0.045, enamel ? 0.009 : 0.005, g.bevelSegments);
  plateGeo.rotateX(-Math.PI / 2);
  const plate = mesh('scanner_faceplate', plateGeo, lib.get('mat_body_ink'), faceFrame);
  plate.position.y = 0.006;
  const faceTop = 0.006 + 0.012;

  const padR = 0.135;
  const pad = mesh('scanner_pad', new CylinderGeometry(padR, padR, 0.012, 64), lib.get('mat_pad'), faceFrame);
  pad.position.set(-0.1, faceTop + 0.002, 0);
  const statusMaterial = lib.unique('mat_status') as MeshStandardMaterial;
  let light: Mesh;
  if (!enamel) {
    // Satin: a machined light ring around the pad.
    light = mesh('scanner_light', lathe([[padR + 0.018, 0], [padR + 0.042, 0, 0.005], [padR + 0.042, 0.01, 0.005], [padR + 0.018, 0.01]], 64, 2), statusMaterial, faceFrame);
    light.position.set(pad.position.x, faceTop - 0.002, 0);
  } else {
    // Enamel: an understated pill indicator beside the pad.
    light = mesh('scanner_light', roundedBox(0.05, 0.02, 0.2, 0.01), statusMaterial, faceFrame);
    light.position.set(0.2, faceTop + 0.004, 0);
  }

  const symbolMat = lib.unique('mat_status') as MeshStandardMaterial;
  symbolMat.emissive.set('#ffffff');
  symbolMat.emissiveIntensity = 1.4;
  const accept = mesh('scanner_symbol_accept', checkGeometry(0.15, 0.008), symbolMat, pad);
  accept.rotation.x = -Math.PI / 2;
  accept.position.y = 0.008;
  const decline = mesh('scanner_symbol_decline', beveledPlate(0.14, 0.034, 0.008, 0.017, 0.003, 1), symbolMat, pad);
  decline.rotation.x = -Math.PI / 2;
  decline.position.y = 0.008;
  accept.visible = decline.visible = false;

  // Signature on the scanner's vertical front.
  const sig = mesh(
    'scanner_signature',
    inlayPlate(SW - 0.2, enamel ? 0.08 : 0.2, 0.006, enamel ? 0.02 : 0.03, enamel ? 0.08 : 0.2),
    lib.get(enamel ? 'mat_signature' : 'mat_signature'),
    scanner,
  );
  sig.position.set(0, enamel ? 0.2 : 0.21, 0.34);

  // Feet line: a slim dark plinth grounds the object.
  const plinth = mesh('scanner_plinth', roundedBox(SW - 0.06, 0.03, 0.62, 0.012), lib.get('mat_rubber'), scanner);
  plinth.position.y = 0.012;

  // ── Shadows ────────────────────────────────────────────────────────────────
  const cardShadow = new ContactShadow({ name: 'card_shadow', shape: 'rect', width: W * 1.05, depth: 0.3, opacity: dir.shadow.opacity * 0.8, color: dir.shadow.color });
  const scannerShadow = new ContactShadow({ name: 'scanner_shadow', shape: 'rect', width: SW * 1.02, depth: 0.78, opacity: dir.shadow.opacity, color: dir.shadow.color });
  // Key light is upper-left: bias the footprint slightly right and back.
  scannerShadow.position.set(SCANNER_POS.x + 0.1, 0.002, SCANNER_POS.z - 0.02);
  root.add(cardShadow, scannerShadow);

  updateLanyard();

  const bounds = new Box3(new Vector3(-0.98, 0, -0.4), new Vector3(1.12, 2.45, 0.45));
  void mergeGeometries;
  return {
    root,
    nodes: collectNodes(root, BUSINESS_NODES),
    shadows: [cardShadow, scannerShadow],
    bounds,
    strands,
    updateLanyard,
    statusMaterial,
    symbols: { accept, decline },
    dispose() {
      disposeGeometry(root);
      statusMaterial.dispose();
      symbolMat.dispose();
    },
  };
}
