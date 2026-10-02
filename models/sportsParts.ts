import { BufferAttribute, BufferGeometry, ExtrudeGeometry, Path, Shape, Vector2, Vector3 } from 'three';
import { mergeParts, roundedRectPath, roundedRectShape, type ProfilePoint } from './geometry.ts';
import { cap, place, planContour, planRoundedRect, profile, sweep, turned } from './recordParts.ts';
import { NET as MASTER_NET, RIM } from './sportsContract.ts';

/** The v1.1 code-authored net (lookdev model only; the runtime net is the master's). */
const NET = { depth: MASTER_NET.depth, strands: 20, rows: 6, bottomRadius: 0.2 * (MASTER_NET.depth / 0.6837) } as const;

/**
 * Parametric parts for the premium basketball hoop (Sports, direction L2): the knotted cotton
 * net (an open lattice of tube cords), a swept backboard with crisp chamfers, the outlined
 * target, the rim bracket and the turned stand. Hard-surface parts reuse the record player's
 * profile sweeps (models/recordParts.ts) for analytic normals and crisp creases.
 */

const TAU = Math.PI * 2;

// ── Tubes ─────────────────────────────────────────────────────────────────────

/**
 * Indexed tube along a polyline with parallel-transport frames (no twisting or flips on
 * helices), per-point radius, mitred joints (rings scaled so a bend keeps its width) and
 * optional end caps. Smooth normals; zero UVs (for merging).
 */
export function tube(points: Vector3[], radius: number | ((i: number) => number), radial = 5, capEnds = true): BufferGeometry {
  const n = points.length;
  const rAt = typeof radius === 'number' ? () => radius : radius;
  const tangents = points.map((_, i) => points[Math.min(n - 1, i + 1)]!.clone().sub(points[Math.max(0, i - 1)]!).normalize());
  const t0 = tangents[0]!;
  let normal = Math.abs(t0.y) < 0.9 ? new Vector3(0, 1, 0).cross(t0).normalize() : new Vector3(1, 0, 0).cross(t0).normalize();
  const pos: number[] = [], nor: number[] = [], idx: number[] = [];
  const axis = new Vector3(), bin = new Vector3(), d0 = new Vector3(), d1 = new Vector3(), dir = new Vector3();
  for (let i = 0; i < n; i++) {
    const t = tangents[i]!;
    if (i > 0) {
      const tp = tangents[i - 1]!;
      axis.crossVectors(tp, t);
      const s = axis.length();
      if (s > 1e-6) normal.applyAxisAngle(axis.divideScalar(s), Math.atan2(s, tp.dot(t)));
      // Re-orthogonalise against the new tangent.
      normal.addScaledVector(t, -normal.dot(t)).normalize();
    }
    bin.crossVectors(t, normal).normalize();
    let mitre = 1;
    if (i > 0 && i < n - 1) {
      d0.subVectors(points[i]!, points[i - 1]!).normalize();
      d1.subVectors(points[i + 1]!, points[i]!).normalize();
      mitre = Math.min(1.5, 1 / Math.max(0.3, Math.sqrt((1 + d0.dot(d1)) / 2)));
    }
    const r = rAt(i);
    const p = points[i]!;
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * TAU;
      dir.copy(normal).multiplyScalar(Math.cos(a)).addScaledVector(bin, Math.sin(a));
      const rr = r * mitre;
      pos.push(p.x + dir.x * rr, p.y + dir.y * rr, p.z + dir.z * rr);
      nor.push(dir.x, dir.y, dir.z);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j, b = i * radial + ((j + 1) % radial), c = a + radial, d = b + radial;
      idx.push(a, b, d, a, d, c);
    }
  }
  if (capEnds) {
    for (const [ring, t, flip] of [[0, tangents[0]!, true], [n - 1, tangents[n - 1]!, false]] as const) {
      const centre = pos.length / 3;
      const p = points[ring]!;
      pos.push(p.x, p.y, p.z);
      const s = flip ? -1 : 1;
      nor.push(t.x * s, t.y * s, t.z * s);
      for (let j = 0; j < radial; j++) {
        const a = ring * radial + j, b = ring * radial + ((j + 1) % radial);
        if (flip) idx.push(centre, b, a);
        else idx.push(centre, a, b);
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.setIndex(idx);
  return g;
}

/** Concatenate indexed geometries (position/normal/uv) into one indexed geometry. */
export function concatIndexed(parts: BufferGeometry[]): BufferGeometry {
  let vCount = 0, iCount = 0;
  for (const p of parts) {
    vCount += p.getAttribute('position').count;
    iCount += p.index!.count;
  }
  const pos = new Float32Array(vCount * 3), nor = new Float32Array(vCount * 3), uv = new Float32Array(vCount * 2);
  const idx = new Uint32Array(iCount);
  let vo = 0, io = 0;
  for (const p of parts) {
    const pp = p.getAttribute('position').array as Float32Array;
    pos.set(pp, vo * 3);
    nor.set(p.getAttribute('normal').array as Float32Array, vo * 3);
    const puv = p.getAttribute('uv');
    if (puv) uv.set(puv.array as Float32Array, vo * 2);
    const pi = p.index!.array;
    for (let k = 0; k < pi.length; k++) idx[io + k] = pi[k]! + vo;
    vo += pp.length / 3;
    io += pi.length;
    p.dispose();
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('normal', new BufferAttribute(nor, 3));
  g.setAttribute('uv', new BufferAttribute(uv, 2));
  g.setIndex(new BufferAttribute(vCount > 65535 ? idx : new Uint16Array(idx), 1));
  return g;
}

// ── Net ───────────────────────────────────────────────────────────────────────

/** Cord radius at the rim; the cord tapers to NET_CORD_BOTTOM at the bottom row (a lighter net). */
export const NET_CORD = 0.0055;
const NET_CORD_BOTTOM = 0.0042;
/** Cord radius where a loop crosses the top of the ring (pulled flat: the net tops out ≈ 25 mm above the rim plane). */
const NET_TOP_CORD = 0.0036;
/** The bottom knot row sits this far above −NET.depth, so the tails end within 1 cm of it. */
const NET_BOTTOM_LIFT = 0.012;

export interface NetLayout {
  /** Knot row heights (net space), row 0 = the bottom of the rim loops. */
  rowY: number[];
  /** Lattice radius per row. */
  rowR: number[];
}

/**
 * Knotted cotton net in net space (y = 0 at the rim plane, negative downward). A diamond
 * lattice: each of NET.strands loops laces over the rim tube and feeds two diagonal cords that
 * spiral down opposite ways; cords from neighbouring loops meet at a knot on every row, so the
 * net has NET.strands diamonds around and NET.rows knot rows down, tapering from about the
 * rim's inner radius to NET.bottomRadius at the bottom row, where the cords end in short tails
 * that stop within 1 cm below −NET.depth. Row spacing shrinks with depth, so the wide upper
 * diamonds are also the tallest and every diamond keeps a similar proportion; the cord thins
 * with depth. Knots are small flattened beads a little fatter than the cord. Every vertex lives
 * in net space, so the rig's radial deformation (models/sports.ts netDeform) moves cords, knots
 * and tails together.
 */
export function netGeometry(): { geometry: BufferGeometry; layout: NetLayout } {
  const S = NET.strands, rows = NET.rows;
  const D = TAU / S;
  const ringR = RIM.innerRadius + RIM.tube;
  const loopR = RIM.tube + NET_CORD * 1.1;
  const y0 = -loopR;
  const yBottom = -NET.depth + NET_BOTTOM_LIFT;
  const rowY: number[] = [], rowR: number[] = [];
  for (let k = 0; k <= rows; k++) {
    const t = k / rows;
    // Spacing falls from 1.3× to 0.7× the mean down the net: upper diamonds are taller.
    rowY.push(y0 + (yBottom - y0) * (1.3 * t - 0.3 * t * t));
    rowR.push(ringR + (NET.bottomRadius - ringR) * (0.72 * t + 0.28 * t * t));
  }
  /** Cord radius at net-space height y (thins with depth). */
  const cordAt = (y: number) => NET_CORD + (NET_CORD_BOTTOM - NET_CORD) * Math.min(1, Math.max(0, -y / NET.depth));
  const at = (r: number, y: number, a: number) => new Vector3(Math.cos(a) * r, y, -Math.sin(a) * r);
  const radial = 5;
  const parts: BufferGeometry[] = [];
  // Loop ends sit one cord apart, so the coil lies flat against itself.
  const eps = (NET_CORD * 1.15) / ringR;

  for (let i = 0; i < S; i++) {
    const th = i * D;
    const pts: Vector3[] = [];
    const radii: number[] = [];
    const push = (p: Vector3, r = cordAt(p.y)) => {
      pts.push(p);
      radii.push(r);
    };
    // A side, bottom → top: tail, knots 7 … 1.
    const aAng = (k: number) => th + (k * D) / 2;
    const bAng = (k: number) => th - (k * D) / 2;
    const tail = (ang: (k: number) => number) => {
      const last = at(rowR[rows]!, rowY[rows]!, ang(rows));
      const prev = at(rowR[rows - 1]!, rowY[rows - 1]!, ang(rows - 1));
      return last.clone().add(last.clone().sub(prev).multiplyScalar(0.28));
    };
    push(tail(aAng), NET_CORD_BOTTOM * 0.6);
    for (let k = rows; k >= 1; k--) push(at(rowR[k]!, rowY[k]!, aAng(k)));
    // Loop laced round the rim tube: bottom → inside → over the top → outside → bottom. The cord
    // pulls flat where it crosses the top of the ring, so the net rises at most NET_TOP above it.
    const loopSteps = 12;
    for (let s = 0; s <= loopSteps; s++) {
      const u = s / loopSteps;
      const phi = -Math.PI / 2 - u * TAU;
      const lift = Math.max(0, Math.sin(phi));
      const r = NET_CORD + (NET_TOP_CORD - NET_CORD) * lift ** 1.5;
      const lr = RIM.tube + r * 1.02;
      const a = th + eps * (1 - 2 * u);
      push(at(ringR + Math.cos(phi) * lr, Math.sin(phi) * lr, a), r);
    }
    for (let k = 1; k <= rows; k++) push(at(rowR[k]!, rowY[k]!, bAng(k)));
    push(tail(bAng), NET_CORD_BOTTOM * 0.6);
    parts.push(tube(pts, (j) => radii[j]!, radial, true));
  }

  // Knot beads: flattened octahedra (smooth normals), one per knot.
  for (let k = 1; k <= rows; k++) {
    for (let i = 0; i < S; i++) {
      const a = (i + k / 2) * D;
      const c = at(rowR[k]!, rowY[k]!, a);
      const out = new Vector3(Math.cos(a), 0, -Math.sin(a));
      const tan = new Vector3(-Math.sin(a), 0, -Math.cos(a));
      const up = new Vector3(0, 1, 0);
      const cord = cordAt(c.y);
      const rs = cord * 1.45, ro = cord * 1.2;
      const axes: [Vector3, number][] = [[tan, rs], [up, rs * 1.1], [out, ro]];
      const pos: number[] = [], nor: number[] = [];
      for (const [ax, r] of axes) {
        for (const s of [1, -1]) {
          pos.push(c.x + ax.x * r * s, c.y + ax.y * r * s, c.z + ax.z * r * s);
          nor.push(ax.x * s, ax.y * s, ax.z * s);
        }
      }
      // Vertices: 0 +tan, 1 −tan, 2 +up, 3 −up, 4 +out, 5 −out.
      const faces = [
        [0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4],
        [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5],
      ];
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
      g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
      g.setAttribute('uv', new BufferAttribute(new Float32Array(12), 2));
      // Orient each face outward from the bead centre.
      const idx: number[] = [];
      const va = new Vector3(), vb = new Vector3(), vc = new Vector3(), fn = new Vector3();
      for (const [p0, p1, p2] of faces) {
        va.fromArray(pos, p0! * 3); vb.fromArray(pos, p1! * 3); vc.fromArray(pos, p2! * 3);
        fn.subVectors(vb, va).cross(new Vector3().subVectors(vc, va));
        const centroid = va.clone().add(vb).add(vc).divideScalar(3).sub(c);
        if (fn.dot(centroid) >= 0) idx.push(p0!, p1!, p2!);
        else idx.push(p0!, p2!, p1!);
      }
      g.setIndex(idx);
      parts.push(g);
    }
  }
  return { geometry: concatIndexed(parts), layout: { rowY, rowR } };
}

// ── Backboard ─────────────────────────────────────────────────────────────────

/** Rounded rectangle (half sizes, corner radius) in board-local x, y. */
export interface RoundRect {
  hx: number;
  hy: number;
  r: number;
}

/**
 * Machined channel for a flush inlay (the target outline): the band between `outer` and
 * `inner`, centred on (cx, cy) in board-local x, y, cut `depth` into the face.
 */
export interface BoardChannel {
  cx: number;
  cy: number;
  outer: RoundRect;
  inner: RoundRect;
  depth: number;
}

/**
 * Backboard slab w × h × t centred on the origin, faces on ±Z: a rounded-rectangle plan swept
 * with a crisp 45° chamfer on the front (and a smaller one behind), each softened by a
 * sub-millimetre fillet so the edge catches one clean line of light. A square-walled channel
 * is machined into the face for the target inlay; the rest of the face is one clean plane.
 */
export function boardGeometry(w: number, h: number, t: number, planR: number, chamfer: number, channel: BoardChannel): BufferGeometry {
  const segs = 10;
  const plan = planRoundedRect(w / 2, h / 2, planR, segs);
  const cb = chamfer * 0.6;
  const side = sweep(plan, profile([[-cb, 0], [0, cb, 0.0012], [0, t - chamfer, 0.0016], [-chamfer, t]], 2));
  const back = cap(planContour(w / 2, h / 2, planR, segs, -cb), 0, false);
  // Plan space is (x, z) with z = −y after the final rotation.
  const { cx, cy, outer: o, inner: i, depth: d } = channel;
  const cSegs = 6;
  const outerPlan = planRoundedRect(o.hx, o.hy, o.r, cSegs, cx, -cy);
  const innerPlan = planRoundedRect(i.hx, i.hy, i.r, cSegs, cx, -cy);
  const outerC = planContour(o.hx, o.hy, o.r, cSegs, 0, cx, -cy);
  const innerC = planContour(i.hx, i.hy, i.r, cSegs, 0, cx, -cy);
  const face = cap(planContour(w / 2, h / 2, planR, segs, -chamfer), t, true, [outerC]);
  const outerWall = sweep(outerPlan, profile([[0, t], [0, t - d]], 1));
  const innerWall = sweep(innerPlan, profile([[0, t - d], [0, t]], 1));
  const floor = cap(outerC, t - d, true, [innerC]);
  const island = cap(innerC, t, true);
  const g = mergeParts([{ geometry: side }, { geometry: back }, { geometry: face }, { geometry: outerWall }, { geometry: innerWall }, { geometry: floor }, { geometry: island }]);
  // Plan z → −y (board height), sweep height → +z (thickness).
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, -t / 2);
  return g;
}

/**
 * Dark liner for the board's inlay channel (same local frame as boardGeometry): floor and both
 * walls, `inset` inside the machined surfaces and stopping just below the face. Only the gap
 * round the inlay shows it, as a fine dark line that reads as a real shadow gap at any light.
 */
export function channelLiner(t: number, channel: BoardChannel, inset: number): BufferGeometry {
  const { cx, cy, outer: o, inner: i, depth: d } = channel;
  const cSegs = 6;
  const top = t - 0.0003, floor = t - d + inset;
  const outerWall = sweep(planRoundedRect(o.hx, o.hy, o.r, cSegs, cx, -cy), profile([[-inset, top], [-inset, floor]], 1));
  const innerWall = sweep(planRoundedRect(i.hx, i.hy, i.r, cSegs, cx, -cy), profile([[inset, floor], [inset, top]], 1));
  const base = cap(planContour(o.hx, o.hy, o.r, cSegs, -inset, cx, -cy), floor, true, [planContour(i.hx, i.hy, i.r, cSegs, inset, cx, -cy)]);
  const g = mergeParts([{ geometry: outerWall }, { geometry: innerWall }, { geometry: base }]);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, -t / 2);
  return g;
}

/**
 * Ink backer frame round the backboard (same local frame as boardGeometry): a rounded ring
 * `proud` wider than the board outline all round, its front face `setBack` behind the board's
 * face, wrapping the board's edge back to a lip behind it. The board's chamfer and the frame's
 * inner wall form a crisp V reveal; the frame's rounded outer edge catches one line of light
 * and gives the pale board a dark silhouette against the stage.
 */
export function backerFrame(w: number, h: number, t: number, planR: number, proud: number, setBack: number): BufferGeometry {
  const plan = planRoundedRect(w / 2, h / 2, planR, 10);
  const front = t - setBack, back = -0.002, gap = 0.0008;
  const g = sweep(plan, profile([[-0.03, back], [proud, back, 0.003], [proud, front, 0.0045], [gap, front, 0.0006], [gap, front - 0.012]], 3));
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, -t / 2);
  return g;
}

/** Outlined rounded rectangle (the target square), face on +Z, back at z = 0, edge bevel `bevel`. */
export function outlineFrame(w: number, h: number, line: number, rOuter: number, rInner: number, depth: number, bevel: number): ExtrudeGeometry {
  const shape = roundedRectShape(w, h, rOuter);
  shape.holes.push(roundedRectPath(new Path(), w - 2 * line, h - 2 * line, rInner));
  const b = Math.min(bevel, depth * 0.45, line * 0.2);
  const g = new ExtrudeGeometry(shape, { depth: depth - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b * 0.9, bevelOffset: -b * 0.9, bevelSegments: 1, curveSegments: 8 });
  g.translate(0, 0, b);
  return g;
}

// ── Plates and hardware ───────────────────────────────────────────────────────

/** Plate from a 2D outline (x, y), extruded along +Z by `depth` with a small chamfer. */
export function outlinePlate(points: Vector2[], depth: number, bevel: number): ExtrudeGeometry {
  const shape = new Shape(points);
  return new ExtrudeGeometry(shape, { depth: depth - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 1, curveSegments: 6 }).translate(0, 0, bevel);
}

/** Domed hex-free bolt head with a washer, axis +Z, seated at z = 0. */
export function boltHead(r: number): BufferGeometry {
  const pts: ProfilePoint[] = [
    [0, 0], [r * 1.45, 0], [r * 1.45, r * 0.22, r * 0.08], [r, r * 0.26], [r, r * 0.5, r * 0.18], [r * 0.55, r * 0.78, r * 0.3], [0, r * 0.82],
  ];
  return place(turned(pts, { segments: 14, filletSegments: 2 }), { rx: Math.PI / 2 });
}

/**
 * Turned weighted base in hoop-local coordinates (axis +Y through the pole): a recessed
 * shadow-gap underside on a narrow contact ring, a chamfered drum with a scribed groove, then an
 * ogee shoulder (a convex roll turning into a concave cove, one continuous S with no cone
 * facets) rising into the collar the pole enters. 64 segments round, so the glossy shoulder
 * shows no radial facets.
 */
export function baseGeometry(radius: number, collarR: number, collarTop: number): BufferGeometry {
  const R = radius;
  const drumTop = 0.046;
  const coveTop = 0.142;
  // Ogee: cubic Bézier from the drum's vertical side to the collar's vertical side.
  const p0 = [R, drumTop], p1 = [R, drumTop + 0.05], p2 = [collarR, coveTop - 0.07], p3 = [collarR, coveTop];
  const ogee: ProfilePoint[] = [];
  const n = 15;
  for (let i = 1; i < n; i++) {
    const u = i / n, m = 1 - u;
    const a = m * m * m, b = 3 * m * m * u, c = 3 * m * u * u, d = u * u * u;
    ogee.push([a * p0[0]! + b * p1[0]! + c * p2[0]! + d * p3[0]!, a * p0[1]! + b * p1[1]! + c * p2[1]! + d * p3[1]!]);
  }
  return turned([
    [0, 0.006], [R - 0.05, 0.006], [R - 0.042, 0, 0.002], [R - 0.024, 0, 0.004], [R, 0.02, 0.008],
    [R, 0.03], [R - 0.0025, 0.0322], [R, 0.0344], [R, drumTop],
    ...ogee,
    [collarR, coveTop], [collarR, collarTop - 0.004, 0.003], [collarR - 0.004, collarTop], [0, collarTop],
  ], { segments: 64, filletSegments: 3 });
}
