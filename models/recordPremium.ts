import { type BufferGeometry, Matrix4, MeshStandardMaterial, type Object3D, RingGeometry, SphereGeometry, TorusGeometry, Vector2, Vector3, Shape, ExtrudeGeometry } from 'three';
import { filletPolyline, group, mergeParts, mesh, perforationRow, roundedBox, wire, type ProfilePoint } from './geometry.ts';
import { PLATTER as PLATTER_V12, PLATTER_TOP as PLATTER_TOP_V12, PLAYER as PLAYER_V12, REST, TONEARM as TONEARM_V12, type RecordLabel } from './recordContract.ts';
import { cap, circleContour, knurlBand, place, planCircle, planContour, planRoundedRect, profile, sweep, transformed, turned } from './recordParts.ts';
import type { ModelContext } from './types.ts';

// ═════════════════════════════════════════════════════════════════════════════
// v1.2 scaffold: the code-authored parts of the master-based Party scene.
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The builder half of the v1.2 Party scene (`scripts/masters/recipes/party.ts` merges the turntable
 * master into it): `party_root`, the `player_body` group the master's static parts are anchored
 * and joined under, the two contact-shadow placeholders, and the tonearm rest the master lacks.
 *
 * The rest (a turned chrome post with a black-anodised cradle) sits under the parked tube at
 * REST; its materials are named after the master's (`tt_chrome`, `tt_black_anodised`) and the rig
 * swaps in the master's own material instances at load, so it matches the master's finish.
 */
export function buildPartyScaffold(_ctx: ModelContext): Object3D {
  const root = group('party_root');
  group('player_body', root);
  group('record_shadow', root).position.set(PLATTER_V12.x, PLATTER_TOP_V12 + 0.001, PLATTER_V12.z);
  group('player_shadow', root).position.set(0, 0.002, 0);
  buildTonearmRest(root);
  return root;
}

/** Placeholder materials named after the master's; the rig rebinds them to the master's instances. */
const restMaterial = (name: string, color: string, metalness: number, roughness: number) => new MeshStandardMaterial({ name, color, metalness, roughness });

function buildTonearmRest(root: Object3D): void {
  const rest = group('tonearm_rest', root);
  const deck = PLAYER_V12.deck;
  rest.position.set(REST.x, deck, REST.z);
  // Square to the tube, which runs at restAngle to the pivot→stylus line here.
  rest.rotation.y = TONEARM_V12.parkedYaw + TONEARM_V12.restAngle;
  // Saddle height above the deck; the tube (r ≈ 0.014) lies in the cradle at pitch 0.
  const saddle = REST.y - deck;
  const tubeR = TONEARM_V12.tubeRadius;
  // Turned post: flanged foot on the deck, a slim stem, a collar under the cradle.
  const post = turned([
    [0, -0.001], [0.026, -0.001], [0.026, 0.004, 0.0015], [0.016, 0.009, 0.003], [0.0075, 0.016, 0.004], [0.0075, saddle - 0.024],
    [0.011, saddle - 0.02, 0.002], [0.011, saddle - 0.013, 0.002], [0, saddle - 0.013],
  ], { segments: 28, filletSegments: 2 });
  mesh('rest_post', post, restMaterial('tt_chrome', '#E2E2E2', 1, 0.07), rest);
  // Cradle across the tube (local x): a padded saddle block with two low prongs, the tube's own
  // radius clear between them, so the parked tube rests in it and lifts out cleanly.
  const across = tubeR * 2 + 0.006;
  const cradle = mergeParts([
    { geometry: place(roundedBox(across + 0.02, 0.012, 0.02, 0.004, 1), { y: saddle - 0.007 }) },
    // Low prongs (top 6 mm over the saddle): an interruption blend's yaw-derived lift clears them.
    { geometry: place(roundedBox(0.008, 0.011, 0.02, 0.0035, 1), { x: -(across / 2 + 0.004), y: saddle + 0.0005 }) },
    { geometry: place(roundedBox(0.008, 0.011, 0.02, 0.0035, 1), { x: across / 2 + 0.004, y: saddle + 0.0005 }) },
  ]);
  mesh('rest_cradle', cradle, restMaterial('tt_black_anodised', '#0F0F10', 0.3, 0.34), rest);
}

// ═════════════════════════════════════════════════════════════════════════════
// v1.1 code-authored record player (lookdev tooling only since v1.2).
// ═════════════════════════════════════════════════════════════════════════════

/** v1.1 contract numbers, frozen here: the v1.2 contract (recordContract.ts) is the master's. */
const PLAYER = { width: 2.1, depth: 1.5, deck: 0.34 } as const;
const PLATTER = { x: -0.3, z: 0.02, radius: 0.64, height: 0.05, spindleRadius: 0.016, spindleHeight: 0.045 } as const;
const RECORD = { radius: 0.6, thickness: 0.02, labelRadius: 0.2, holeRadius: 0.02 } as const;
const TONEARM = {
  pivot: new Vector3(0.68, 0.44, -0.42), length: 0.98, drop: 0.44 - (PLAYER.deck + PLATTER.height + RECORD.thickness), parkedYaw: -0.102,
  rest: new Vector3(0.6, 0.428, 0.36),
} as const;
const LID = { hinge: new Vector3(0, 0.36, -0.73), open: -1.32, width: 2.06, length: 1.46, height: 0.17, wall: 0.014 } as const;
const STATUS_MARK = new Vector3(0.74, 0.11, PLAYER.depth / 2 + 0.003);

/**
 * Party record player — premium production model (direction L2, style reference v1.1).
 * Since v1.2 the runtime scene is the turntable master; this model remains for the lookdev page.
 *
 * Construction: parametric profile sweeps with analytic normals (models/recordParts.ts) — a
 * cream satin shell with a continuous top fillet over a coral enamel plinth with a soft
 * undercut, separated by a crisp V reveal, on a recessed shadow-gap foot; a machined platter
 * well; a turned, brushed platter with a rubber mat; a gimballed chrome tonearm with a knurled
 * counterweight and a coral finger lift; a framed thin-walled dust cover lined with woven grille
 * cloth, notched over two chrome hinge barrels on the pivot axis. The family perforation row runs
 * along the plinth and ends one empty pitch before the status lens, so the lit status reads as the
 * row's last dot switching on.
 *
 * Every contract dimension, pivot and node lives in recordContract.ts; this file only builds.
 * Static parts that share a material are merged (one draw each): 17 draw calls, ≈24k triangles.
 */

type Lib = ModelContext['lib'];
type Part = { geometry: BufferGeometry };

const HX = PLAYER.width / 2;
const HZ = PLAYER.depth / 2;
const DECK = PLAYER.deck;

// ── Plinth ────────────────────────────────────────────────────────────────────
const PLAN_R = 0.11; // plan corner radius (lid is concentric, 0.02 inside)
const CORNER_SEGS = 10;
const FOOT = { height: 0.022, inset: 0.05 };
/** Reveal between the coral plinth and the cream shell (V groove from two 5 mm fillets). */
const REVEAL_Y = 0.166;
const TOP_FILLET = 0.028;
const CAP_IN = 0.06; // where the top fillet sweep hands over to the flat deck cap
const WELL = { radius: 0.658, lip: 0.664, depth: 0.01 };
/** Perforation row: pitch = band height; last dot one empty pitch before the status lens. */
const PERF = { pitch: 0.06, count: 25, y: STATUS_MARK.y };

// ── Deck furniture (world x/z on the deck) ────────────────────────────────────
const KNOB = { x: 0.875, z: 0.49, r: 0.064 };
const KNOB_H = 0.044;
/** 33 / 45 keys (the 33 key is selected: pressed 1.5 mm, coral dot). */
const KEYS = [
  { x: 0.795, z: 0.22, r: 0.03, pressed: true },
  { x: 0.915, z: 0.22, r: 0.03, pressed: false },
];
const HINGE_X = 0.84;
const BARREL = { r: 0.016, half: 0.058 };

// ── Dust cover (hinge-local: x across, z forward from the hinge line, y up) ───
const LID_PLAN_R = PLAN_R - 0.02;
const LID_YB = DECK + 0.0015 - LID.hinge.y; // rim 1.5 mm above the deck
const LID_YT = LID_YB + LID.height;
const LID_FRAME = 0.05; // inner offset of the lining pocket (frame width + wall)
const LID_POCKET = 0.005; // lining recess into the top panel (45° chamfered frame edge)
const LID_NOTCH_Y = BARREL.r + 0.005;

export function buildRecordPlayerGeometry(ctx: ModelContext, label: RecordLabel = 'coral'): Object3D {
  const { lib } = ctx;
  const root = group('party_root');

  buildBody(lib, root);
  buildPlatter(lib, root);
  buildRecord(lib, root, label);
  buildTonearm(lib, root);
  buildLid(lib, root);

  // Status lens: a small glossy dome on a one-tile disc of the perforation strip (the disc is
  // merged into the signature mesh, so the rig's unique status material only touches the lens).
  const lens = turned([[0, -0.002], [0.0162, -0.002], [0.0162, -0.0008, 0.0008], [0.01, 0.0016, 0.004], [0, 0.002]], { segments: 20, filletSegments: 2 });
  const status = mesh('player_status', place(lens, { rx: Math.PI / 2 }), lib.get('mat_status'), root);
  status.position.copy(STATUS_MARK);

  group('player_shadow', root).position.set(0, 0.002, 0);
  return root;
}

// ─────────────────────────────────────────────────────────────────────────────
function buildBody(lib: Lib, root: Object3D): void {
  const body = group('player_body', root);
  const plan = planRoundedRect(HX, HZ, PLAN_R, CORNER_SEGS);

  // Cream satin shell: reveal fillet → vertical wall → continuous top fillet → deck.
  const shell = sweep(plan, profile([[-0.015, REVEAL_Y], [0, REVEAL_Y, 0.005], [0, DECK, TOP_FILLET], [-CAP_IN, DECK]], 4));
  const deck = cap(planContour(HX, HZ, PLAN_R, CORNER_SEGS, -CAP_IN), DECK, true, [circleContour(PLATTER.x, PLATTER.z, WELL.lip, 64)]);
  // Machined platter well: crisp lip, shallow floor (closed to the axis, hidden by the platter).
  const well = place(turned([[WELL.lip, 0], [WELL.radius, 0, 0.003], [WELL.radius, -WELL.depth, 0.002], [0, -WELL.depth]], { segments: 64, filletSegments: 2 }), { x: PLATTER.x, y: DECK, z: PLATTER.z });
  mesh('body_shell', mergeParts([{ geometry: shell }, { geometry: deck }, { geometry: well }]), lib.get('mat_body'), body);

  // 33 / 45 keys: glossy ink caps (echoing the vinyl and the status lens) in chrome trims.
  const keys = KEYS.map((k) => ({
    geometry: place(turned([[0, 0], [k.r - 0.002, 0], [k.r - 0.002, 0.007, 0.0025], [k.r - 0.008, 0.0095, 0.004], [0, 0.0098]], { segments: 20, filletSegments: 2 }), {
      x: k.x, y: DECK - (k.pressed ? 0.0035 : 0.002), z: k.z,
    }),
  }));
  mesh('body_keys', mergeParts(keys), lib.get('mat_body_ink'), body);

  // Coral enamel plinth: soft undercut into the foot, flat face centred on the perforation line.
  const band = sweep(plan, profile([[-FOOT.inset, FOOT.height], [-0.03, FOOT.height, 0.01], [0, 0.052, 0.012], [0, REVEAL_Y, 0.005], [-0.015, REVEAL_Y]], 4));
  mesh('body_band', band, lib.get('mat_accent'), body);

  // Recessed shadow-gap foot, closed underneath (the shadow pass renders back faces).
  const foot = sweep(plan, profile([[-FOOT.inset - 0.02, 0], [-FOOT.inset, 0, 0.004], [-FOOT.inset, FOOT.height]], 3));
  const bottom = cap(planContour(HX, HZ, PLAN_R, CORNER_SEGS, -FOOT.inset - 0.02), 0, false);
  mesh('body_foot', mergeParts([{ geometry: foot }, { geometry: bottom }]), lib.get('mat_body_shadow'), body);

  // Signature: one row of whole dots, pitch = strip height, proud of the band by 1.8 mm.
  const row = perforationRow(PERF.count * PERF.pitch + 1e-6, PERF.pitch, 0.004);
  const lastDot = STATUS_MARK.x - 2 * PERF.pitch;
  const rowCentre = lastDot + PERF.pitch / 2 - row.length / 2;
  // The status lens sits on a one-tile disc of the same strip, one empty pitch after the row:
  // lit, it reads as the row's last dot switching on.
  const disc = perforationRow(PERF.pitch + 1e-6, PERF.pitch, 0.004);
  const perfZ = HZ + 0.0018 - 0.002;
  mesh('body_signature', mergeParts([
    { geometry: row.geometry, position: [rowCentre, PERF.y, perfZ] },
    { geometry: disc.geometry, position: [STATUS_MARK.x, PERF.y, perfZ] },
  ]), lib.get('mat_signature'), body);

  mesh('body_hardware', mergeParts(staticHardware()), lib.get('mat_metal'), body);
  mesh('body_knob', mergeParts(speedKnob()), lib.get('mat_anodized'), body);
}

/** Static chrome: tonearm bearing, rest post and clip, hinge barrels, knob trim and pin, key trims. */
function staticHardware(): Part[] {
  const parts: Part[] = [];
  const { pivot, rest, parkedYaw } = TONEARM;

  // Turned bearing: flange, stepped pillar with a machined groove; stops 1.5 mm under the
  // yawing collar of the arm.
  const pillarTop = pivot.y - 0.0295 - DECK;
  parts.push({
    geometry: place(turned([
      [0.074, 0], [0.074, 0.008, 0.003], [0.064, 0.012, 0.002], [0.035, 0.012, 0.003], [0.031, 0.019, 0.002],
      [0.031, 0.036], [0.0285, 0.0385], [0.031, 0.041], [0.029, pillarTop, 0.002], [0, pillarTop],
    ], { segments: 32, filletSegments: 2 }), { x: pivot.x, y: DECK - 0.0005, z: pivot.z }),
  });

  // Rest post: turned collar and stem, a cradle whose floor is the saddle, and an open clip.
  const saddle = rest.y - DECK;
  const stemTop = saddle - 0.012;
  parts.push({
    geometry: place(turned([[0, 0], [0.021, 0], [0.021, 0.006, 0.002], [0.012, 0.011, 0.002], [0.0075, 0.016, 0.003], [0.0075, stemTop + 0.001], [0, stemTop + 0.001]], { segments: 20, filletSegments: 2 }), {
      x: rest.x, y: DECK - 0.0005, z: rest.z,
    }),
  });
  const cradle = new Matrix4().makeRotationY(parkedYaw).setPosition(rest.x, DECK, rest.z);
  // Low prongs (5 mm, 17 mm apart from the tube axis) so an unlifted interruption blend, which
  // raises the tube only ≈0.33 mm per mm of swing near the rest, never drags through them.
  const cradleParts: Part[] = [
    { geometry: place(roundedBox(0.05, 0.012, 0.018, 0.004, 1), { y: saddle - 0.006 }) },
    { geometry: place(roundedBox(0.008, 0.011, 0.018, 0.0035, 1), { x: -0.021, y: saddle - 0.0005 }) },
    { geometry: place(roundedBox(0.008, 0.011, 0.018, 0.0035, 1), { x: 0.021, y: saddle - 0.0005 }) },
    { geometry: wire([new Vector3(0.024, saddle + 0.004, 0), new Vector3(0.033, saddle + 0.008, 0), new Vector3(0.042, saddle + 0.004, 0), new Vector3(0.045, saddle - 0.002, 0)], 0.0028, 8) },
  ];
  for (const p of cradleParts) parts.push({ geometry: transformed(p.geometry, cradle) });

  // Hinge barrels on the pivot axis (a turned knuckle stack) on mounting blocks at the back.
  for (const sx of [-1, 1]) {
    const x = sx * HINGE_X;
    const { r, half } = BARREL;
    const barrel = turned([
      [0, -half], [r - 0.004, -half], [r, -half + 0.004, 0.002], [r, -0.026], [r - 0.0018, -0.024], [r, -0.022],
      [r, 0.022], [r - 0.0018, 0.024], [r, 0.026], [r, half - 0.004], [r - 0.004, half, 0.002], [0, half],
    ], { segments: 16, filletSegments: 2 });
    parts.push({ geometry: place(barrel, { rz: -Math.PI / 2, x, y: LID.hinge.y, z: LID.hinge.z }) });
    parts.push({ geometry: place(roundedBox(0.1, 0.022, 0.026, 0.005, 1), { x, y: LID.hinge.y - 0.015, z: LID.hinge.z - 0.006 }) });
  }

  // Knob trim ring and indicator pin.
  parts.push({ geometry: place(turned([[KNOB.r + 0.006, 0], [KNOB.r + 0.012, 0], [KNOB.r + 0.012, 0.0035, 0.0015], [KNOB.r + 0.006, 0.0045, 0.001], [KNOB.r + 0.006, 0]], { segments: 40, filletSegments: 2 }), { x: KNOB.x, y: DECK - 0.0005, z: KNOB.z }) });
  parts.push({ geometry: place(turned([[0, 0], [0.0042, 0], [0.0042, 0.0032, 0.0014], [0, 0.0042]], { segments: 12, filletSegments: 2 }), { x: KNOB.x, y: DECK + KNOB_H - 0.0005, z: KNOB.z + KNOB.r - 0.019 }) });

  // Key trims: slim polished rings around the ink caps.
  for (const k of KEYS) {
    parts.push({ geometry: place(turned([[k.r - 0.001, 0], [k.r + 0.005, 0], [k.r + 0.005, 0.003, 0.0012], [k.r + 0.001, 0.0045, 0.001], [k.r - 0.001, 0.0045], [k.r - 0.001, 0]], { segments: 20, filletSegments: 2 }), { x: k.x, y: DECK - 0.0005, z: k.z }) });
  }
  return parts;
}

/** Coral anodised: knurled speed knob (turned chamfers, softly domed top) and the selected-key dot. */
function speedKnob(): Part[] {
  const { r } = KNOB;
  const ridges = 36, depth = 0.003, rv = r - depth;
  const y0 = 0.008, y1 = KNOB_H - 0.009;
  const at = (g: BufferGeometry) => place(g, { x: KNOB.x, y: DECK, z: KNOB.z });
  const sel = KEYS.find((k) => k.pressed)!;
  return [
    { geometry: at(turned([[0, 0.004], [rv - 0.002, 0.004, 0.0015], [rv, y0]], { segments: ridges, filletSegments: 2 })) },
    { geometry: at(knurlBand(r, depth, y0, y1, ridges)) },
    { geometry: at(turned([[rv, y1], [rv, y1 + 0.002], [r - 0.006, KNOB_H - 0.003, 0.002], [r - 0.012, KNOB_H - 0.0022, 0.002], [0.024, KNOB_H - 0.0006, 0.01], [0, KNOB_H]], { segments: ridges, filletSegments: 3 })) },
    // Selected-speed dot on the 33 key.
    { geometry: place(turned([[0, 0], [0.0055, 0], [0.0055, 0.001, 0.0006], [0, 0.0014]], { segments: 12, filletSegments: 1 }), { x: sel.x, y: DECK - 0.0035 + 0.0095, z: sel.z }) },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
function buildPlatter(lib: Lib, root: Object3D): void {
  const platter = group('platter', root);
  platter.position.set(PLATTER.x, DECK, PLATTER.z);
  const R = PLATTER.radius, H = PLATTER.height;
  const matTop = H, metalTop = H - 0.006;

  // Brushed, turned platter: chamfered underside, machined V line on the rim, a low lip
  // around the mat; spindle with a chamfered tip.
  const body = turned([
    [0, 0.003], [R - 0.018, 0.003, 0.003], [R, 0.016, 0.004], [R, 0.027], [R - 0.0025, 0.029], [R, 0.031],
    [R, H - 0.006, 0.003], [R - 0.004, H - 0.002, 0.0015], [R - 0.009, H - 0.002, 0.001], [R - 0.011, metalTop], [0, metalTop],
  ], { segments: 64, filletSegments: 2 });
  const spindle = turned([
    [0, metalTop], [PLATTER.spindleRadius, metalTop], [PLATTER.spindleRadius, H + PLATTER.spindleHeight - 0.006, 0.002],
    [PLATTER.spindleRadius - 0.005, H + PLATTER.spindleHeight, 0.003], [0, H + PLATTER.spindleHeight],
  ], { segments: 20, filletSegments: 2 });
  mesh('platter_mesh', mergeParts([{ geometry: body }, { geometry: spindle }]), lib.get('mat_metal_brushed'), platter);

  // Rubber mat: its top is the platter top (record seat); two low concentric ribs for the
  // presentation pose; seated, it shows as a dark ring between the record and the metal lip.
  const matR = R - 0.012;
  const rib = (r: number): ProfilePoint[] => [[r + 0.0045, matTop], [r, matTop + 0.0009], [r - 0.0045, matTop]];
  const matGeo = turned([
    [matR, metalTop], [matR, matTop - 0.002, 0.0015], [matR - 0.004, matTop, 0.002],
    ...rib(0.5), ...rib(0.36), [0.021, matTop], [0.021, metalTop],
  ], { segments: 48, filletSegments: 1 });
  mesh('platter_mat', matGeo, lib.get('mat_rubber'), platter);

  group('record_shadow', platter).position.set(0, PLATTER.height + 0.001, 0);
}

// ─────────────────────────────────────────────────────────────────────────────
function buildRecord(lib: Lib, root: Object3D, label: RecordLabel): void {
  const record = group('record_authored', root);
  record.position.set(PLATTER.x, DECK + PLATTER.height, PLATTER.z);
  const secondary = group('record_secondary', record);
  const R = RECORD.radius, T = RECORD.thickness;
  // Vinyl: planar disc UVs 0–1 across the record's square (RingGeometry convention) for the
  // tangential groove-sheen map. Rolled edge, a faint raised bead at the rim, flat groove area.
  const vinyl = sweep(
    planCircle(64),
    profile([
      [RECORD.holeRadius, T], [RECORD.holeRadius, 0], [R - 0.006, 0, 0.004], [R, 0.006, 0.003], [R, T - 0.006, 0.003],
      [R - 0.006, T + 0.0005, 0.003], [R - 0.016, T + 0.0005, 0.002], [R - 0.02, T], [RECORD.labelRadius - 0.004, T], [RECORD.holeRadius, T],
    ], 2),
    { planar: { radius: R } },
  );
  mesh('record_vinyl', vinyl, lib.get('mat_vinyl'), secondary);
  const labelGeo = new RingGeometry(RECORD.holeRadius, RECORD.labelRadius, 64, 1);
  labelGeo.rotateX(-Math.PI / 2);
  const lab = mesh('record_label', labelGeo, lib.get(label === 'coral' ? 'mat_label_coral' : 'mat_label_cobalt'), secondary);
  lab.position.y = T + 0.0004;
}

// ─────────────────────────────────────────────────────────────────────────────
function buildTonearm(lib: Lib, root: Object3D): void {
  const pivot = group('tonearm_pivot', root);
  pivot.position.copy(TONEARM.pivot);
  pivot.rotation.y = TONEARM.parkedYaw;
  const lift = group('tonearm_lift', pivot);
  const arm = group('tonearm_mesh', lift);
  const L = TONEARM.length, drop = TONEARM.drop;
  const alongZ = (g: BufferGeometry) => place(g, { rx: Math.PI / 2 }); // +Y → +Z
  const alongMinusZ = (g: BufferGeometry) => place(g, { rx: -Math.PI / 2 }); // +Y → −Z

  // Chrome: yaw collar, gimbal ring with its pitch axle and hub, the tube (full radius to the
  // rest, tapering towards the headshell), headshell collar and plate, counterweight stub.
  const tubeR = 0.012;
  const headZ = L - 0.08;
  const chrome: Part[] = [
    { geometry: turned([[0, -0.028], [0.03, -0.028, 0.002], [0.03, -0.0055, 0.0015], [0, -0.0055]], { segments: 24, filletSegments: 2 }) },
    { geometry: place(new TorusGeometry(0.034, 0.0055, 8, 32), { rx: Math.PI / 2 }) },
    { geometry: place(turned([[0, -0.036], [0.006, -0.036, 0.002], [0.006, 0.036, 0.002], [0, 0.036]], { segments: 12, filletSegments: 2 }), { rz: Math.PI / 2 }) },
    { geometry: alongZ(turned([[0, -0.022], [0.0135, -0.02, 0.006], [0.0135, 0.02, 0.006], [0, 0.022]], { segments: 16, filletSegments: 2 })) },
    { geometry: alongZ(turned([[tubeR, 0.018], [tubeR, headZ - 0.07], [0.0095, headZ + 0.004]], { segments: 16 })) },
    { geometry: alongZ(turned([[0.0092, headZ - 0.012], [0.0128, headZ - 0.01, 0.002], [0.0128, headZ + 0.008, 0.002], [0, headZ + 0.01]], { segments: 16, filletSegments: 2 })) },
    { geometry: headshell(headZ) },
    { geometry: alongMinusZ(turned([[0.0085, 0.015], [0.0085, 0.196, 0.003], [0, 0.2]], { segments: 12, filletSegments: 2 })) },
  ];
  mesh('tonearm_chrome', mergeParts(chrome), lib.get('mat_metal'), arm);

  // Gunmetal: knurled counterweight (turned rings), cartridge body and cantilever to the tip.
  const cw: ProfilePoint[] = [[0.0086, 0.1], [0.029, 0.1, 0.002], [0.032, 0.103]];
  for (let i = 0; i < 3; i++) cw.push([0.034, 0.105 + i * 0.005], [0.0322, 0.1075 + i * 0.005]);
  cw.push([0.034, 0.121], [0.034, 0.1375], [0.0322, 0.1385], [0.0322, 0.1515], [0.034, 0.1525], [0.034, 0.169]);
  for (let i = 0; i < 3; i++) cw.push([0.0322, 0.1715 + i * 0.005], [0.034, 0.174 + i * 0.005]);
  cw.push([0.032, 0.187], [0.029, 0.19, 0.002], [0.0086, 0.19]);
  const tip = new Vector3(0, -drop, L);
  const dark: Part[] = [
    { geometry: alongMinusZ(turned(cw, { segments: 24, filletSegments: 2 })) },
    { geometry: place(roundedBox(0.028, 0.0145, 0.046, 0.003, 1), { y: -0.0192, z: L - 0.024 }) },
    { geometry: wire([new Vector3(0, -0.0245, L - 0.007), tip.clone().add(new Vector3(0, 0.0012, -0.0006))], 0.0012, 6) },
  ];
  mesh('tonearm_dark', mergeParts(dark), lib.get('mat_metal_dark'), arm);

  // Coral anodised: finger lift on the headshell and the counterweight's locking ring.
  const liftPath = [new Vector3(0.02, -0.009, L - 0.006), new Vector3(0.038, -0.0072, L - 0.002), new Vector3(0.054, 0.001, L), new Vector3(0.064, 0.013, L - 0.001)];
  const coral: Part[] = [
    { geometry: wire(liftPath, 0.0042, 8) },
    { geometry: place(new SphereGeometry(0.0042, 8, 6), { x: liftPath[3]!.x, y: liftPath[3]!.y, z: liftPath[3]!.z }) },
    { geometry: alongMinusZ(turned([[0.031, 0.139], [0.0346, 0.1395, 0.0012], [0.0346, 0.1505, 0.0012], [0.031, 0.151]], { segments: 24, filletSegments: 2 })) },
  ];
  mesh('tonearm_accent', mergeParts(coral), lib.get('mat_anodized'), arm);
}

/** Tapered headshell plate under the tube end (extruded rounded trapezoid, 5 mm thick). */
function headshell(headZ: number): BufferGeometry {
  const L = TONEARM.length;
  const pts = filletPolyline([
    [0, headZ - 0.004], [0.015, headZ - 0.004, 0.004], [0.026, L - 0.012, 0.01], [0.022, L + 0.022, 0.006], [-0.022, L + 0.022, 0.006],
    [-0.026, L - 0.012, 0.01], [-0.015, headZ - 0.004, 0.004], [0, headZ - 0.004],
  ], 4);
  const shape = new Shape(pts.map((p) => new Vector2(p.x, p.y)));
  const g = new ExtrudeGeometry(shape, { depth: 0.0035, bevelEnabled: true, bevelThickness: 0.0008, bevelSize: 0.0008, bevelSegments: 1, curveSegments: 4 });
  g.rotateX(Math.PI / 2); // shape y → world z, extrusion → world −y
  g.translate(0, -0.0065, 0);
  return g;
}

// ─────────────────────────────────────────────────────────────────────────────
function buildLid(lib: Lib, root: Object3D): void {
  const hinge = group('lid_hinge', root);
  hinge.position.copy(LID.hinge);
  hinge.rotation.x = LID.open;
  const lid = group('lid_mesh', hinge);
  const hx = LID.width / 2, hz = LID.length / 2, cz = hz, R = LID_PLAN_R, t = LID.wall;
  const notches = [-1, 1].map((sx) => {
    const a = sx * HINGE_X - BARREL.half - 0.006, b = sx * HINGE_X + BARREL.half + 0.006;
    return { x0: Math.min(a, b), x1: Math.max(a, b), y: LID_NOTCH_Y };
  });
  const plan = planRoundedRect(hx, hz, R, CORNER_SEGS, 0, cz, notches);
  const yb = LID_YB, yt = LID_YT;

  // Outer skin: rim, walls, a continuous top fillet and a crisp reveal that frames the top panel:
  // 14 mm across and 4 mm deep with 45° walls, so it holds one continuous line at phone scale
  // (checkpoint 4: the 8 × 2 mm groove broke into dashes there).
  const outer = sweep(plan, profile([
    [-t, yb], [0, yb, 0.003], [0, yt, 0.022], [-0.05, yt], [-0.054, yt - 0.004], [-0.06, yt - 0.004], [-0.064, yt], [-0.066, yt],
  ], 4));
  const top = cap(planContour(hx, hz, R, CORNER_SEGS, -0.066, 0, cz), yt, true);
  // Inner skin: walls, a soft inner corner, the slim frame and the lining pocket step.
  const innerTop = yt - t;
  const inner = sweep(plan, profile([
    [-t, yb], [-t, innerTop, 0.008], [-LID_FRAME + LID_POCKET, innerTop], [-LID_FRAME, innerTop + LID_POCKET],
  ], 3), { flip: true });
  const pocket = cap(planContour(hx, hz, R, CORNER_SEGS, -LID_FRAME, 0, cz), innerTop + LID_POCKET, false);
  mesh('lid_shell', mergeParts([{ geometry: outer }, { geometry: top }, { geometry: inner }, { geometry: pocket }]), lib.get('mat_lid'), lid);

  // Woven grille-cloth lining in the pocket: planar UVs, 0.25 units per weave tile, turned 45° so
  // the weave's main ridges run parallel to the hinge (reads as ribbed audio cloth, not twill).
  const lining = cap(planContour(hx, hz, R, CORNER_SEGS, -LID_FRAME - 0.0004, 0, cz), innerTop + LID_POCKET - 0.0006, false, [], 0.25, Math.PI / 4);
  mesh('lid_lining', lining, lib.get('mat_lid_fabric'), lid);
}
