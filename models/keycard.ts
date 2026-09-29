import {
  PointLight,
  Box3,
  type BufferGeometry,
  CircleGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  type Material,
  Mesh,
  type MeshStandardMaterial,
  Object3D,
  Path,
  RingGeometry,
  Shape,
  ShapeGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three';
import { ContactShadow } from '../src/render/contactShadow.ts';
import {
  beveledPlate,
  filletPolyline,
  group,
  inlayPlate,
  lathe,
  mergeParts,
  mesh,
  perforationRow,
  roundedBox,
  roundedRectPath,
  roundedRectShape,
  wire,
  type ProfilePoint,
} from './geometry.ts';
import { buildPremiumClip, buildPremiumScanner, PREMIUM_STRAP_TOP } from './badgePremium.ts';
import { LanyardStrand } from './lanyard.ts';
import { collectNodes, disposeGeometry, type BuiltModel, type ModelContext } from './types.ts';

export type CardTemplate = 'light' | 'dark';

export const BUSINESS_NODES = [
  'business_root', 'card_authored', 'card_secondary', 'card_mesh', 'clip_pivot', 'lanyard_anchor',
  'lanyard_curve', 'scanner_root', 'scanner_pad', 'scanner_light', 'card_shadow',
] as const;

export const CARD = { width: 0.86, height: 1.3, depth: 0.034, slotW: 0.24, slotH: 0.05, slotY: 1.3 / 2 - 0.083 };
/**
 * J-hook (direction L): back leg at z = HOOK.back, a horizontal run at y = HOOK.runY that
 * passes through the card slot, and a gate hinged at the run's front corner (HOOK.hinge).
 * Open, the gate points forward in line with the run, so the slot slides straight on.
 */
export const HOOK = { back: -0.045, runY: -0.18, runFront: 0.05, hinge: 0.06, radius: 0.012, gateLength: 0.085, corner: 0.01 };
/** Card centre relative to the clip pivot when hanging: the slot's top edge rests on the run. */
export const CARD_OFFSET_Y = HOOK.runY + HOOK.radius - CARD.slotH / 2 - CARD.slotY;
/** Guest-ready pivot position. */
export const HANG_PIVOT = new Vector3(-0.5, 2.25, 0.05);
export const SCANNER_POS = new Vector3(0.62, 0, 0);
export const LANYARD_TOP_Y = 3.9;
export const LANYARD_SPREAD = 0.13;
export const SCANNER_WIDTH = 0.95;
/** Scanner body lift above its recessed foot (L). */
export const SCANNER_FOOT = 0.03;
/** Side profile (z, y) of the reading face before any foot lift. */
export const FACE_F0 = new Vector2(-0.06, 0.82);
export const FACE_F1 = new Vector2(0.34, 0.4);

/** Closed rounded polygon (x,y,fillet) → Shape. */
function roundedPolygon(points: ProfilePoint[], segments = 6): Shape {
  const n = points.length;
  const a = points[n - 1]!, b = points[0]!;
  const mid: ProfilePoint = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0];
  const pts = filletPolyline([mid, ...points, mid], segments);
  const s = new Shape();
  pts.forEach((p, i) => (i === 0 ? s.moveTo(p.x, p.y) : s.lineTo(p.x, p.y)));
  return s;
}

/** Check glyph; `stroke` is the arm width as a fraction of `size` (depth is the extrusion). */
export function checkGeometry(size: number, depth: number, stroke = 0.18): ExtrudeGeometry {
  const s = new Shape();
  const w = size * stroke;
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

function roundedRectShapeGeometry(w: number, h: number, r: number): ShapeGeometry {
  return new ShapeGeometry(roundedRectShape(w, h, r), 8);
}

/** Flat outline of a rounded rectangle (printed keyline) in the XY plane. */
function outline(w: number, h: number, r: number, stroke: number): ShapeGeometry {
  const s = roundedRectShape(w, h, r);
  s.holes.push(roundedRectPath(new Path(), w - 2 * stroke, h - 2 * stroke, Math.max(0.001, r - stroke)));
  return new ShapeGeometry(s, 12);
}

export interface StatusGlow {
  spill: PointLight;
}

/** Premium glyph on the lit window: ink that reads at phone scale. */
export const STATUS_GLYPH = { color: '#000000', roughness: 1 } as const;
/**
 * Spill light offset along the reading-face normal from the window. At this distance the
 * light's reflection falls off the glass and its bezel (no hotspot beside the window) while
 * it still tints the card at the scan beat.
 */
export const STATUS_SPILL_LIFT = 0.6;

export interface KeycardRig {
  root: Object3D;
  nodes: Record<string, Object3D>;
  shadows: ContactShadow[];
  bounds: Box3;
  strands: [LanyardStrand, LanyardStrand];
  /** Recompute strap curves from the anchor and the clip's current world transform. */
  updateLanyard(): void;
  statusMaterial: MeshStandardMaterial;
  symbolMaterial: MeshStandardMaterial;
  symbols: { accept: Object3D; decline: Object3D };
  /** Premium status light spill (null outside L2). */
  glow: StatusGlow | null;
  /** Hinged hook gate (null in study directions that have none). */
  gate: Object3D | null;
  setTemplate(template: CardTemplate): void;
  dispose(): void;
}

export type KeycardModel = KeycardRig & BuiltModel;

/**
 * Static geometry and named nodes only — the part exported to GLB. Runtime-only parts
 * (strap curves, contact shadows, unique status materials) are added by `rigKeycard`.
 */
export function buildKeycardGeometry(ctx: ModelContext, template: CardTemplate = 'light'): Object3D {
  const { lib } = ctx;
  const dir = lib.direction;
  const st = dir.style;
  const g = dir.geometry;
  const lean = dir.id === 'L';

  const root = group('business_root');

  // ── Card assembly ─────────────────────────────────────────────────────────
  const cardAuthored = group('card_authored', root);
  cardAuthored.position.copy(HANG_PIVOT);
  const cardSecondary = group('card_secondary', cardAuthored);
  const clipPivot = group('clip_pivot', cardSecondary);

  const { width: W, height: H, depth: D } = CARD;
  const radius = st.card === 'band' ? 0.085 : st.card === 'panel' ? 0.12 : 0.1;
  const slot = roundedRectPath(new Path(), CARD.slotW, CARD.slotH, CARD.slotH / 2, 0, CARD.slotY);
  const cardFace = () => lib.get(template === 'light' ? 'mat_card_light' : 'mat_card_dark');
  const cardMaterials = (): Material | Material[] => (st.inkEdges ? [cardFace(), lib.get('mat_edge')] : cardFace());
  const cardMesh = mesh('card_mesh', beveledPlate(W, H, D, radius, D * g.bevelRatio, g.bevelSegments, [slot]), cardFace(), cardSecondary);
  cardMesh.material = cardMaterials();
  cardMesh.position.y = CARD_OFFSET_Y;
  const face = D / 2;

  if (st.card === 'band') {
    // Satin Studio (study): ink stipple inlay band, coral accent stripe, shallow embossed mark.
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
  } else if (st.card === 'panel') {
    // Enamel Workshop (study): colour panel inside a cream border, stripe, perforated strip.
    const panel = mesh('card_panel', beveledPlate(W - 0.14, 0.82, 0.008, 0.07, 0.003, 2), lib.get('mat_insert'), cardMesh);
    panel.position.set(0, 0.0, face);
    const stripe = mesh('card_stripe', beveledPlate(W - 0.14, 0.05, 0.01, 0.02, 0.003, 1), lib.get('mat_accent'), cardMesh);
    stripe.position.set(0, -0.28, face);
    const markRing = mesh('card_mark', new TorusGeometry(0.07, 0.018, 10, 40), lib.get('mat_body'), cardMesh);
    markRing.scale.z = 0.4;
    markRing.position.set(-0.2, 0.2, face + 0.008);
    const row = perforationRow(W - 0.14 - 0.14, 0.07);
    const perf = mesh('card_perforation', row.geometry, [lib.get('mat_signature'), lib.get('mat_card_light')], cardMesh);
    perf.position.set(0, -0.5, face);
  } else if (st.card === 'print') {
    // Premium (L2): the whole face is a laminated print (colour block, GUEST wordmark,
    // portrait window, stripe); the perforation row stays real construction.
    const pitch = 0.06;
    const row = perforationRow(W - 0.14 - 2 * pitch, pitch);
    const perf = mesh('card_perforation', row.geometry, [lib.get('mat_signature'), cardFace()], cardMesh);
    perf.position.set(0, -0.565, face);
    // Holographic security seal: colour sweeps across it as the card swings.
    const seal = mesh('card_seal', new CircleGeometry(0.068, 48), lib.get('mat_holo'), cardMesh);
    seal.position.set(0.28, -0.405, face + 0.0007);
  } else {
    // Satin Enamel (locked): cobalt panel with a printed personal-ID layout, accent stripe,
    // whole-dot perforation row on the border, ink keyline edges.
    const panelH = 0.78;
    const panel = mesh('card_panel', beveledPlate(W - 0.14, panelH, 0.008, 0.06, 0.003, 2), lib.get('mat_insert'), cardMesh);
    panel.position.set(0, -0.02, face);
    // Personal-ID print (photo window, portrait glyph, name lines) merged into one draw call.
    const printZ = face + 0.0085;
    const lines = ([[0.23, 0.27], [0.155, 0.18], [0.085, 0.22]] as const).map(([y, len]) => ({
      geometry: roundedRectShapeGeometry(len, y === 0.23 ? 0.036 : 0.026, 0.013) as BufferGeometry,
      position: [-0.04 + len / 2, y, printZ + 0.0005] as [number, number, number],
    }));
    mesh('card_print', mergeParts([
      { geometry: outline(0.2, 0.24, 0.035, 0.018), position: [-0.19, 0.16, printZ] },
      { geometry: new CircleGeometry(0.034, 24), position: [-0.19, 0.19, printZ] },
      { geometry: new CircleGeometry(0.06, 24, 0, Math.PI), position: [-0.19, 0.075, printZ] },
      ...lines,
    ]), lib.get('mat_card_mark'), cardMesh);
    const stripe = mesh('card_stripe', beveledPlate(W - 0.14, 0.05, 0.01, 0.02, 0.003, 1), lib.get('mat_accent'), cardMesh);
    stripe.position.set(0, -0.26, face);
    const pitch = 0.06;
    const row = perforationRow(W - 0.14 - 2 * pitch, pitch);
    const perf = mesh('card_perforation', row.geometry, [lib.get('mat_signature'), cardFace()], cardMesh);
    perf.position.set(0, -0.535, face);
  }

  // Clip: body, crimp and a wire hook passing through the slot. Metal (A/L) or enamel (B).
  const premium = dir.id === 'L2';
  const metalClip = st.clip === 'metal';
  if (premium) {
    buildPremiumClip(lib, clipPivot, HOOK);
  } else {
  const clipBody = mesh('clip_body', roundedBox(0.11, 0.1, 0.056, metalClip ? 0.018 : 0.03), lib.get(metalClip ? 'mat_metal' : 'mat_accent'), clipPivot);
  clipBody.position.y = -0.04;
  const crimp = mesh('clip_crimp', roundedBox(0.13, 0.06, 0.04, metalClip ? 0.01 : 0.018), lib.get(metalClip ? 'mat_anodized' : 'mat_body_ink'), clipPivot);
  crimp.position.y = 0.04;
  const hz = 0.042, hr = 0.012;
  const hookMat = lib.get(metalClip ? 'mat_metal' : 'mat_metal_dark');
  let gate: Object3D | null = null;
  if (lean) {
    // J-hook: back leg down from the clip body, tight corner, horizontal run forward to the
    // gate hinge. The run is what passes through the card slot.
    const { back, runY, runFront, hinge, corner, gateLength } = HOOK;
    const hookPts: Vector3[] = [new Vector3(0, -0.075, back), new Vector3(0, runY + corner, back)];
    for (let i = 1; i < 6; i++) {
      const a = (i / 6) * (Math.PI / 2);
      hookPts.push(new Vector3(0, runY + corner - Math.sin(a) * corner, back + corner - Math.cos(a) * corner));
    }
    hookPts.push(new Vector3(0, runY, back + corner), new Vector3(0, runY, runFront), new Vector3(0, runY, hinge));
    mesh('clip_hook', wire(hookPts, HOOK.radius, 10), hookMat, clipPivot);
    const knuckle = mesh('clip_gate_knuckle', new CylinderGeometry(HOOK.radius * 1.35, HOOK.radius * 1.35, 0.03, 16), hookMat, clipPivot);
    knuckle.rotation.z = Math.PI / 2;
    knuckle.position.set(0, runY, hinge);
    gate = group('clip_gate', clipPivot);
    gate.position.set(0, runY, hinge);
    mesh('clip_gate_leg', wire([new Vector3(0, 0, 0), new Vector3(0, gateLength / 2, 0), new Vector3(0, gateLength, 0)], HOOK.radius * 0.9, 10), hookMat, gate);
  } else {
    const hookPts: Vector3[] = [new Vector3(0, -0.07, hz), new Vector3(0, -0.14, hz)];
    for (let i = 1; i < 12; i++) {
      const a = (i / 12) * Math.PI;
      hookPts.push(new Vector3(0, -0.14 - Math.sin(a) * hz, Math.cos(a) * hz));
    }
    hookPts.push(new Vector3(0, -0.14, -hz), new Vector3(0, -0.07, -hz));
    mesh('clip_hook', wire(hookPts, hr, 10), hookMat, clipPivot);
  }
  }

  // ── Lanyard (curves are built at runtime by the rig) ─────────────────────
  const anchor = group('lanyard_anchor', root);
  anchor.position.set(HANG_PIVOT.x, LANYARD_TOP_Y, HANG_PIVOT.z);
  group('lanyard_curve', root);

  // ── Scanner ───────────────────────────────────────────────────────────────
  const scanner = group('scanner_root', root);
  scanner.position.copy(SCANNER_POS);
  if (premium) {
    const parts = buildPremiumScanner(ctx, scanner, SCANNER_FOOT);
    // Glyphs sized for a phone: at least 10 CSS px wide on a 288 px stage, strokes above 2 CSS px
    // on a 328 px stage, and centred in the window.
    const check = checkGeometry(0.125, 0.006, 0.23);
    check.computeBoundingBox();
    const mid = check.boundingBox!.getCenter(new Vector3());
    check.translate(-mid.x, -mid.y, 0);
    const accept = mesh('scanner_symbol_accept', check, lib.get('mat_status_symbol'), parts.symbolParent);
    const decline = mesh('scanner_symbol_decline', beveledPlate(0.125, 0.032, 0.006, 0.016, 0.002, 1), lib.get('mat_status_symbol'), parts.symbolParent);
    accept.position.z = decline.position.z = 0.0055;
    accept.visible = decline.visible = false;
    group('card_shadow', root).position.set(HANG_PIVOT.x, 0.002, HANG_PIVOT.z);
    group('scanner_shadow', root).position.set(SCANNER_POS.x + 0.05, 0.002, SCANNER_POS.z - 0.02);
    return root;
  }
  const body = group('scanner_housing', scanner);
  if (lean) body.position.y = SCANNER_FOOT;
  const SW = SCANNER_WIDTH;
  const F0 = FACE_F0, F1 = FACE_F1;
  const profile: ProfilePoint[] = [
    [-0.34, 0, 0.03], [-0.34, 0.82, 0.12], [F0.x, F0.y, 0.07], [F1.x, F1.y, 0.06], [0.34, 0, 0.03],
  ];
  const sb = st.scanner === 'pill' ? 0.07 : 0.04;
  const sx = (0.68 - 2 * sb) / 0.68, sy = (0.82 - 2 * sb) / 0.82;
  const bodyShape = roundedPolygon(profile.map(([x, y, r = 0]) => [x * sx, sb + y * sy, Math.max(0.005, r - sb * 0.5)] as ProfilePoint), 6);
  const bodyGeo = new ExtrudeGeometry(bodyShape, { depth: SW - 2 * sb, bevelEnabled: true, bevelSize: sb, bevelThickness: sb, bevelSegments: g.bevelSegments, curveSegments: 8 });
  bodyGeo.translate(0, 0, -(SW - 2 * sb) / 2);
  bodyGeo.rotateY(-Math.PI / 2);
  mesh('scanner_body', bodyGeo, lib.get('mat_body'), body);

  // Reading face frame: local +Y is the face normal, local +Z runs down the face.
  const faceFrame = group('scanner_face', body);
  const fc = F0.clone().add(F1).multiplyScalar(0.5);
  const slope = Math.atan2(F1.y - F0.y, F1.x - F0.x);
  const fn = new Vector2(-(F1.y - F0.y), F1.x - F0.x).normalize();
  const scaledMid = new Vector2(fc.x * sx, sb + fc.y * sy);
  const planeOffset = sb + scaledMid.sub(fc).dot(fn);
  faceFrame.position.set(0, fc.y + fn.y * planeOffset, fc.x + fn.x * planeOffset);
  faceFrame.rotation.x = -slope;

  const plateLen = 0.42, plateW = SW - 0.2;
  const plateGeo = beveledPlate(plateW, plateLen, 0.024, st.scanner === 'pill' ? 0.07 : 0.045, st.scanner === 'pill' ? 0.009 : 0.005, g.bevelSegments);
  plateGeo.rotateX(-Math.PI / 2);
  mesh('scanner_faceplate', plateGeo, lib.get('mat_body_ink'), faceFrame).position.y = 0.006;
  const faceTop = 0.006 + 0.012;

  const padR = 0.135;
  const pad = mesh('scanner_pad', new CylinderGeometry(padR, padR, 0.012, 64), lib.get('mat_pad'), faceFrame);
  pad.position.set(-0.1, faceTop + 0.002, 0);
  const statusMaterial = lib.get('mat_status');
  const symbolMaterial = lib.get('mat_status_symbol');
  let symbolParent: Object3D = pad;
  let symbolLift = 0.008;
  let symbolSize = 0.15;

  if (st.scanner === 'ring') {
    const light = mesh('scanner_light', lathe([[padR + 0.018, 0], [padR + 0.042, 0, 0.005], [padR + 0.042, 0.01, 0.005], [padR + 0.018, 0.01]], 64, 2), statusMaterial, faceFrame);
    light.position.set(pad.position.x, faceTop - 0.002, 0);
  } else if (st.scanner === 'pill') {
    const light = mesh('scanner_light', roundedBox(0.05, 0.02, 0.2, 0.01), statusMaterial, faceFrame);
    light.position.set(0.2, faceTop + 0.004, 0);
  } else {
    // Contactless target: two bold printed rings and a centre dot (≥3:1 against the pad),
    // a card-target keyline, and an indicator window that shows the glyph when lit.
    const padTop = pad.position.y + 0.0065;
    const flat = -Math.PI / 2;
    mesh('scanner_print', mergeParts([
      { geometry: new RingGeometry(0.052, 0.068, 64), rotationX: flat, position: [pad.position.x, padTop, 0] },
      { geometry: new RingGeometry(0.098, 0.114, 64), rotationX: flat, position: [pad.position.x, padTop, 0] },
      { geometry: new CircleGeometry(0.02, 24), rotationX: flat, position: [pad.position.x, padTop, 0] },
      { geometry: outline(0.34, 0.34, 0.05, 0.01), rotationX: flat, position: [pad.position.x, faceTop + 0.0005, 0] },
    ]), lib.get('mat_print'), faceFrame);
    const win = mesh('scanner_light', beveledPlate(0.2, 0.15, 0.012, 0.035, 0.004, 2), statusMaterial, faceFrame);
    win.rotation.x = -Math.PI / 2;
    win.position.set(0.24, faceTop + 0.004, 0);
    symbolParent = win;
    symbolLift = 0.0075;
    symbolSize = 0.1;
  }

  const accept = mesh('scanner_symbol_accept', checkGeometry(symbolSize, 0.006), symbolMaterial, symbolParent);
  const decline = mesh('scanner_symbol_decline', beveledPlate(symbolSize * 0.9, symbolSize * 0.22, 0.006, symbolSize * 0.11, 0.002, 1), symbolMaterial, symbolParent);
  if (symbolParent === pad) {
    accept.rotation.x = decline.rotation.x = -Math.PI / 2;
    accept.position.y = decline.position.y = symbolLift;
  } else {
    // Window plate faces +Z in its own space.
    accept.position.z = decline.position.z = symbolLift;
  }
  accept.visible = decline.visible = false;

  // Signature on the scanner's vertical front.
  if (st.scanner === 'ring') {
    const sig = mesh('scanner_signature', inlayPlate(SW - 0.2, 0.2, 0.006, 0.03, 0.2), lib.get('mat_signature'), body);
    sig.position.set(0, 0.21, 0.34);
  } else {
    const pitch = st.scanner === 'pill' ? 0.08 : 0.07;
    const row = perforationRow(SW - 0.2 - 2 * pitch, pitch, 0.006);
    const sig = mesh('scanner_signature', row.geometry, [lib.get('mat_signature'), lib.get('mat_body')], body);
    sig.position.set(0, 0.2, 0.34);
  }

  if (lean) {
    // Recessed foot: a shadow gap in the body colour, never a hard black line.
    const foot = mesh('scanner_foot', roundedBox(SW - 0.1, SCANNER_FOOT + 0.01, 0.6, 0.012), lib.get('mat_body_shadow'), scanner);
    foot.position.y = (SCANNER_FOOT + 0.01) / 2 - 0.004;
  } else {
    const plinth = mesh('scanner_plinth', roundedBox(SW - 0.06, 0.03, 0.62, 0.012), lib.get('mat_rubber'), scanner);
    plinth.position.y = 0.012;
  }

  // Shadow placeholders: the rig replaces them with contact shadows at the same place.
  group('card_shadow', root).position.set(HANG_PIVOT.x, 0.002, HANG_PIVOT.z);
  group('scanner_shadow', root).position.set(SCANNER_POS.x + 0.05, 0.002, SCANNER_POS.z - 0.02);
  return root;
}

export const BUSINESS_BOUNDS = new Box3(new Vector3(-0.98, 0, -0.4), new Vector3(1.12, 2.45, 0.45));

/** Re-bind library materials by name on a hierarchy loaded from GLB. */
export function bindLibraryMaterials(root: Object3D, lib: ModelContext['lib']): void {
  root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    const bind = (mat: Material) => (lib.direction.surfaces[mat.name] ? lib.get(mat.name) : mat);
    m.material = Array.isArray(m.material) ? m.material.map(bind) : bind(m.material);
  });
}

/**
 * Runtime rig over any hierarchy with the Business named nodes (built or GLB-loaded):
 * strap curves, contact shadows, unique status/symbol materials and template swapping.
 */
export function rigKeycard(root: Object3D, lib: ModelContext['lib'], template: CardTemplate = 'light'): KeycardRig {
  const dir = lib.direction;
  const premiumRig = dir.id === 'L2';
  const lean = dir.id === 'L' || premiumRig;
  const nodes = collectNodes(root, BUSINESS_NODES);
  const clipPivot = nodes.clip_pivot!;
  const anchor = nodes.lanyard_anchor!;

  const strandLength = LANYARD_TOP_Y - (HANG_PIVOT.y + 0.07) + 0.02;
  const strands: [LanyardStrand, LanyardStrand] = [new LanyardStrand(strandLength), new LanyardStrand(strandLength)];
  const fabric = lib.get('mat_fabric');
  strands.forEach((s, i) => (mesh(`lanyard_strand_${i}`, s.geometry, fabric, nodes.lanyard_curve).frustumCulled = false));

  const facing = new Vector3(0, 0, 1);
  const top = new Vector3();
  const attach = new Vector3();
  const clipUp = new Vector3();
  const updateLanyard = () => {
    root.updateMatrixWorld(true);
    clipUp.set(0, 1, 0).transformDirection(clipPivot.matrixWorld);
    strands.forEach((s, i) => {
      const side = i === 0 ? -1 : 1;
      top.set(anchor.position.x + side * LANYARD_SPREAD, anchor.position.y, anchor.position.z);
      attach.set(side * 0.03, premiumRig ? PREMIUM_STRAP_TOP : 0.065, 0);
      clipPivot.localToWorld(attach);
      root.worldToLocal(attach);
      s.update(top, attach, facing, lean ? clipUp : undefined);
    });
  };

  const statusMaterial = lib.unique('mat_status') as MeshStandardMaterial;
  const symbolMaterial = lib.unique('mat_status_symbol') as MeshStandardMaterial;
  nodes.scanner_light!.traverse((o) => {
    if ((o as Mesh).isMesh) (o as Mesh).material = statusMaterial;
  });
  const accept = root.getObjectByName('scanner_symbol_accept')!;
  const decline = root.getObjectByName('scanner_symbol_decline')!;
  for (const sym of [accept, decline]) {
    sym.traverse((o) => {
      if ((o as Mesh).isMesh) (o as Mesh).material = symbolMaterial;
    });
    sym.visible = false;
  }

  // Premium: the lit window spills its colour onto whatever is close — the card at the scan
  // beat. No halo sprite (Master §5: no bloom). The light always exists (intensity 0 idle) so
  // switching status never recompiles shaders.
  let glow: StatusGlow | null = null;
  if (premiumRig) {
    // Ink glyph: black and fully rough, so neither the spill nor the key light greys it.
    symbolMaterial.color.set(STATUS_GLYPH.color);
    symbolMaterial.roughness = STATUS_GLYPH.roughness;
    const win = nodes.scanner_light!;
    const spill = new PointLight('#ffffff', 0, 1.3, 2);
    spill.name = 'scanner_spill';
    spill.position.set(win.position.x, win.position.y + STATUS_SPILL_LIFT, win.position.z);
    win.parent!.add(spill);
    glow = { spill };
  }

  const replaceShadow = (name: string, shadow: ContactShadow) => {
    const placeholder = root.getObjectByName(name)!;
    shadow.position.copy(placeholder.position);
    placeholder.parent!.add(shadow);
    placeholder.removeFromParent();
    return shadow;
  };
  const cardShadow = replaceShadow('card_shadow', new ContactShadow({
    name: 'card_shadow', shape: 'rect', width: CARD.width, depth: 0.1, spread: [1.1, 3],
    opacity: dir.shadow.opacity * 0.7, line: 0, color: dir.shadow.color,
  }));
  const scannerShadow = replaceShadow('scanner_shadow', new ContactShadow({
    name: 'scanner_shadow', shape: 'rect', width: SCANNER_WIDTH, depth: 0.72, spread: lean ? [1.22, 1.5] : [1.05, 1.1],
    opacity: dir.shadow.opacity, line: lean ? 0.5 : 0, color: dir.shadow.color,
  }));
  cardShadow.setHeight(HANG_PIVOT.y + CARD_OFFSET_Y - CARD.height / 2, 0.9);
  nodes.card_shadow = cardShadow;

  const hasDarkSignature = !!dir.surfaces.mat_signature_dark;
  const setTemplate = (next: CardTemplate) => {
    const want = lib.get(next === 'light' ? 'mat_card_light' : 'mat_card_dark');
    const sig = hasDarkSignature ? lib.get(next === 'light' ? 'mat_signature' : 'mat_signature_dark') : null;
    nodes.card_mesh!.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      const swap = (mat: Material) =>
        mat.name === 'mat_card_light' || mat.name === 'mat_card_dark' ? want
        : sig && (mat.name === 'mat_signature' || mat.name === 'mat_signature_dark') ? sig
        : mat;
      m.material = Array.isArray(m.material) ? m.material.map(swap) : swap(m.material);
    });
  };
  setTemplate(template);
  updateLanyard();

  return {
    root,
    nodes,
    shadows: [cardShadow, scannerShadow],
    bounds: BUSINESS_BOUNDS.clone(),
    strands,
    updateLanyard,
    statusMaterial,
    symbolMaterial,
    symbols: { accept, decline },
    glow,
    gate: root.getObjectByName('clip_gate') ?? null,
    setTemplate,
    dispose() {
      strands.forEach((s) => s.dispose());
      cardShadow.dispose();
      scannerShadow.dispose();
      statusMaterial.dispose();
      symbolMaterial.dispose();
      glow?.spill.removeFromParent();
    },
  };
}

/** Study/tooling convenience: geometry + rig in one call. */
export function buildKeycard(ctx: ModelContext, template: CardTemplate = 'light'): KeycardModel {
  const root = buildKeycardGeometry(ctx, template);
  const rig = rigKeycard(root, ctx.lib, template);
  return {
    ...rig,
    dispose() {
      rig.dispose();
      disposeGeometry(root);
    },
  };
}
