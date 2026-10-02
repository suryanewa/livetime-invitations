import {
  Bone, BufferAttribute, BufferGeometry, Float32BufferAttribute, Matrix4, type Material, type Mesh, type Object3D, Quaternion, Skeleton, SkinnedMesh, Uint16BufferAttribute, Vector3,
} from 'three';
import { BALL_R, BOARD, BOARD_PIVOT, NET, netHangRadius, netRestRadius, RECOIL_LIMIT, RIM_BACKSTOP, RIM_HINGE, RIM_LOCAL, SPORTS_CM_PER_UNIT } from './sportsContract.ts';

/**
 * Sports v1.5: the net is a simulated cord lattice that drives the master's net.
 *
 * **The lattice is the master's own.** The master net (`models/masters/basketball-hoop.glb`) is
 * a knotted diamond net: 10 loops laced over the rim, each feeding two cords; cords from
 * neighbouring loops meet at a knot, 6 knot rows of 10, and below the last row 10 short tails.
 * Each cord piece between two knots (or between a loop and the first knot row) is its own mesh
 * component, each knot two components. `analyseNet` reads that structure back from the geometry:
 * the 10 loop attachments (pinned to the rim), the 60 knots (the simulated nodes) and the 120
 * cord pieces joining them (the structural constraints).
 *
 * **Simulation** (`NetSim`): position-based (Verlet with XPBD constraints, Macklin et al. 2016,
 * "small steps": fixed 1/480 s substeps on the sim's own clock, one constraint pass each), gravity 9.81 m/s²,
 * per-knot mass of a 40 g nylon mini net (±10 % seeded jitter, so the net is not a perfect
 * lathe), cords as elastic tension-only constraints (braided nylon: they stretch under the ball's
 * drag and snap back, and go slack under compression, so the net can bunch and billow), the
 * diamond's two diagonals as soft shear springs (the knots' and the braid's bending stiffness: the
 * net keeps its open diamonds instead of collapsing to a rope), air drag on the cords, the board
 * face as a wall behind the net, and the ball as a moving sphere: knots inside it are pushed out
 * along its normal and dragged along its surface by the leather's grip.
 * The hanging rest pose is the equilibrium under gravity (`rest`), solved once.
 *
 * **Rendering** (`NetSkin`): the master's strand and knot meshes become skinned meshes with one
 * bone per cord piece (its frame: along the cord, radial, binormal, stretched with the cord) and
 * one per knot (its frame from the cords above it). The GPU does the per-vertex work (~70k
 * vertices), the CPU only sets 190 bone transforms; the shadow pass skins the same way. The
 * loops stay on the rim.
 *
 * **Rim and board** (`HoopSprings`): the cords pinned to the loops pull on the rim; their summed
 * force (from the constraint multipliers) drives the spring-action rim about its bracket hinge and
 * the board on its pole, each a damped torsion spring with real constants (below), so the recoil
 * follows the actual impulse the net takes from the ball.
 */

const SU_M = SPORTS_CM_PER_UNIT / 100;
/** Standard gravity in scene units (su/s²). */
const G = 9.81 / SU_M;

export interface NetLattice {
  /** Node rest positions (net space: origin at the rim centre, y = 0 at the rim plane). */
  nodes: Vector3[];
  /** Pinned nodes (the loop attachments on the rim). */
  pinned: boolean[];
  /** Knot rows (node indices, sorted by angle), top row first. */
  rows: number[][];
  /** The loop attachments (node indices, sorted by angle). */
  loops: number[];
  /** Cord pieces: [upper node, lower node]. */
  cords: [number, number][];
  /**
   * Mesh binding: per mesh, per vertex, up to two bones (a cord's index, or cords.length + node
   * index for a knot) and the second's weight: a strand near a knot blends into the knot's bone, so
   * the cord meets its knot without a seam however the two turn.
   */
  binding: Map<BufferGeometry, { bone0: Uint16Array; bone1: Uint16Array; weight1: Float32Array }>;
}

const TAU = Math.PI * 2;
const angleOf = (p: Vector3) => Math.atan2(-p.z, p.x);

interface Component {
  verts: number[];
  centroid: Vector3;
}

/** Connected components of a mesh (index connectivity plus coincident positions). */
function components(pos: ArrayLike<number>, index: ArrayLike<number> | null): Component[] {
  const n = pos.length / 3;
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (a: number): number => {
    while (parent[a] !== a) a = parent[a] = parent[parent[a]!]!;
    return a;
  };
  const join = (a: number, b: number) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };
  if (index) for (let i = 0; i < index.length; i += 3) { join(index[i]!, index[i + 1]!); join(index[i]!, index[i + 2]!); }
  else for (let i = 0; i < n; i += 3) { join(i, i + 1); join(i, i + 2); }
  // Coincident positions (to 0.05 mm) join too: an exact integer key (|coordinate| < 2 su).
  const key = new Map<number, number>();
  const q = (v: number) => Math.round(v * 2e4) + 40000;
  for (let i = 0; i < n; i++) {
    const k = (q(pos[i * 3]!) * 80001 + q(pos[i * 3 + 1]!)) * 80001 + q(pos[i * 3 + 2]!);
    const o = key.get(k);
    if (o === undefined) key.set(k, i);
    else join(o, i);
  }
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    let g = groups.get(r);
    if (!g) groups.set(r, (g = []));
    g.push(i);
  }
  return [...groups.values()].map((verts) => {
    const c = new Vector3();
    for (const i of verts) c.x += pos[i * 3]!, c.y += pos[i * 3 + 1]!, c.z += pos[i * 3 + 2]!;
    return { verts, centroid: c.divideScalar(verts.length) };
  });
}

/** The two ends of an elongated component: the centres of its farthest-apart vertex clusters. */
function ends(pos: ArrayLike<number>, c: Component): [Vector3, Vector3] {
  const v = (i: number, out = new Vector3()) => out.set(pos[i * 3]!, pos[i * 3 + 1]!, pos[i * 3 + 2]!);
  const far = (from: Vector3) => {
    let best = -1, bi = c.verts[0]!;
    const p = new Vector3();
    for (const i of c.verts) {
      const d = v(i, p).distanceToSquared(from);
      if (d > best) { best = d; bi = i; }
    }
    return v(bi);
  };
  const a = far(c.centroid), b = far(a);
  const span = a.distanceTo(b);
  const mean = (end: Vector3) => {
    const m = new Vector3(), p = new Vector3();
    let k = 0;
    for (const i of c.verts) if (v(i, p).distanceTo(end) < span * 0.12) { m.add(p); k++; }
    return m.divideScalar(Math.max(1, k));
  };
  return [mean(a), mean(b)];
}

/**
 * Read the cord lattice back from the master net's meshes (net space). Returns null if the
 * geometry is not the master's knotted net (e.g. the v1.1 code-authored lookdev net).
 */
export function analyseNet(meshes: { geometry: BufferGeometry; kind: 'strands' | 'knots' | 'loops' }[]): NetLattice | null {
  const knotMesh = meshes.find((m) => m.kind === 'knots'), strandMesh = meshes.find((m) => m.kind === 'strands');
  if (!knotMesh || !strandMesh) return null;
  const posOf = (g: BufferGeometry) => (g.getAttribute('position') as BufferAttribute).array;
  const idxOf = (g: BufferGeometry) => g.getIndex()?.array ?? null;

  // Knots: component pairs (each knot is two half-shells) merged by proximity.
  const kPos = posOf(knotMesh.geometry);
  const kComps = components(kPos, idxOf(knotMesh.geometry));
  const knots: { c: Vector3; comps: Component[] }[] = [];
  for (const comp of kComps) {
    const k = knots.find((x) => x.c.distanceTo(comp.centroid) < 0.05);
    if (k) {
      k.comps.push(comp);
      k.c.set(0, 0, 0);
      let n = 0;
      for (const cc of k.comps) { k.c.addScaledVector(cc.centroid, cc.verts.length); n += cc.verts.length; }
      k.c.divideScalar(n);
    } else knots.push({ c: comp.centroid.clone(), comps: [comp] });
  }
  if (knots.length !== 60) return null;
  // Rows by height: 6 rows of 10, top first, each sorted by angle.
  const byY = [...knots.keys()].sort((a, b) => knots[b]!.c.y - knots[a]!.c.y);
  const rowsK: number[][] = [];
  for (let r = 0; r < 6; r++) rowsK.push(byY.slice(r * 10, r * 10 + 10).sort((a, b) => angleOf(knots[a]!.c) - angleOf(knots[b]!.c)));

  // Strand pieces: ends matched to knots, or to loop attachments (above the first knot row).
  const sPos = posOf(strandMesh.geometry);
  const sComps = components(sPos, idxOf(strandMesh.geometry));
  const topY = Math.min(...rowsK[0]!.map((i) => knots[i]!.c.y));
  const bottomY = Math.max(...rowsK[5]!.map((i) => knots[i]!.c.y));
  const nearestKnot = (p: Vector3) => {
    let best = Infinity, bi = -1;
    knots.forEach((k, i) => {
      const d = k.c.distanceTo(p);
      if (d < best) { best = d; bi = i; }
    });
    return { i: bi, d: best };
  };
  const tops: { p: Vector3; comp: Component; lower: number }[] = [];
  const cordsK: { a: number; b: number; comp: Component }[] = [];
  const tails: { knot: number; comp: Component }[] = [];
  for (const comp of sComps) {
    const [e0, e1] = ends(sPos, comp);
    const [hi, lo] = e0.y > e1.y ? [e0, e1] : [e1, e0];
    const nh = nearestKnot(hi), nl = nearestKnot(lo);
    if (hi.y > topY + 0.04) {
      if (nl.d > 0.06) return null;
      tops.push({ p: hi, comp, lower: nl.i });
    } else if (lo.y < bottomY - 0.02 && nl.d > 0.04) {
      tails.push({ knot: nh.i, comp });
    } else {
      if (nh.d > 0.06 || nl.d > 0.06 || nh.i === nl.i) return null;
      cordsK.push({ a: nh.i, b: nl.i, comp });
    }
  }
  // Loop attachments: the strand tops clustered by angle (each loop feeds two cords).
  const loopsP: { p: Vector3; n: number }[] = [];
  for (const t of tops) {
    const l = loopsP.find((x) => x.p.clone().divideScalar(x.n).distanceTo(t.p) < 0.08);
    if (l) { l.p.add(t.p); l.n++; } else loopsP.push({ p: t.p.clone(), n: 1 });
  }
  if (loopsP.length !== 10 || tops.length !== 20 || cordsK.length !== 100 || tails.length !== 10) return null;

  // Node list: loops first (pinned), then knots row by row.
  const nodes: Vector3[] = [], pinned: boolean[] = [];
  const loopOrder = [...loopsP.keys()].sort((a, b) => angleOf(loopsP[a]!.p) - angleOf(loopsP[b]!.p));
  const loopNode = new Map<number, number>();
  for (const l of loopOrder) { loopNode.set(l, nodes.length); nodes.push(loopsP[l]!.p.clone().divideScalar(loopsP[l]!.n)); pinned.push(true); }
  const knotNode = new Map<number, number>();
  const rows: number[][] = rowsK.map((row) => row.map((k) => { knotNode.set(k, nodes.length); nodes.push(knots[k]!.c.clone()); pinned.push(false); return nodes.length - 1; }));
  const loops = loopOrder.map((l) => loopNode.get(l)!);
  const cords: [number, number][] = [];
  const cordComps: Component[] = [];
  for (const t of tops) {
    const l = loopsP.findIndex((x) => x.p.clone().divideScalar(x.n).distanceTo(t.p) < 0.08);
    cords.push([loopNode.get(l)!, knotNode.get(t.lower)!]);
    cordComps.push(t.comp);
  }
  for (const c of cordsK) { cords.push([knotNode.get(c.a)!, knotNode.get(c.b)!]); cordComps.push(c.comp); }

  // Binding: strand vertices to their cord's bone, blending into the knot's bone over the last
  // KNOT_BLEND of either end (pinned ends stay on the cord); knot and tail vertices to their knot's bone.
  const binding: NetLattice['binding'] = new Map();
  const nv = sPos.length / 3;
  const sb = { bone0: new Uint16Array(nv), bone1: new Uint16Array(nv), weight1: new Float32Array(nv) };
  const vp = new Vector3();
  cordComps.forEach((comp, ci) => {
    const [a, b] = cords[ci]!;
    for (const v of comp.verts) {
      sb.bone0[v] = ci;
      vp.set(sPos[v * 3]!, sPos[v * 3 + 1]!, sPos[v * 3 + 2]!);
      let best = -1, bd = Infinity;
      for (const end of [a, b]) {
        if (pinned[end]) continue;
        const d = vp.distanceTo(nodes[end]!);
        if (d < bd) { bd = d; best = end; }
      }
      if (best >= 0 && bd < KNOT_BLEND) {
        const k = 1 - bd / KNOT_BLEND;
        sb.bone1[v] = cords.length + best;
        sb.weight1[v] = k * k * (3 - 2 * k);
      }
    }
  });
  for (const t of tails) for (const v of t.comp.verts) sb.bone0[v] = cords.length + knotNode.get(t.knot)!;
  binding.set(strandMesh.geometry, sb);
  const nk = kPos.length / 3;
  const kb = { bone0: new Uint16Array(nk), bone1: new Uint16Array(nk), weight1: new Float32Array(nk) };
  knots.forEach((k, ki) => { for (const comp of k.comps) for (const v of comp.verts) kb.bone0[v] = cords.length + knotNode.get(ki)!; });
  binding.set(knotMesh.geometry, kb);
  return { nodes, pinned, rows, loops, cords, binding };
}

/** How far from a knot's centre a strand blends into the knot's bone (su; ≈ 1.4 cm, past the knot's own size). */
const KNOT_BLEND = 0.04;

/** Deterministic PRNG (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Physical constants of the net (SI where noted; the sim converts). */
export const NET_SIM = {
  /**
   * The sim's own fixed substep (s). It keeps its own clock (an accumulator), so whatever frame
   * steps the director hands it, the net integrates in the same 1/480 s steps: Verlet with a varying
   * step would misread the velocity, and one XPBD pass hangs a little differently at each step size
   * (a 0.3 mm shimmer that never settles).
   */
  step: 1 / 480,
  /** Whole-net mass (kg): a nylon mini net. */
  mass: 0.04,
  /**
   * Cord compliance (su/N): a 5 cm piece of 3-ply nylon net cord stretches 0.7 mm (1.4 %) per
   * newton. The cord is stiff; what moves is the net's slack (its diamonds open and close).
   */
  cordCompliance: 0.002,
  /** Diamond diagonals: soft (the knots' and braid's stiffness), compliance in su/N. */
  shearCompliance: 0.4,
  /**
   * Hard limits that keep the cords from crossing (pressed together they bunch, never pass through
   * each other): neighbouring knots in a row stay ≥ 70 % of their hanging spacing apart, a knot and
   * the one two rows below ≥ 55 %, and a cord running through a knot never folds back on itself
   * (its ends stay ≥ 80 % of their straight-through distance apart).
   */
  minRing: 0.7,
  minVertical: 0.55,
  minThrough: 0.8,
  /** Air drag on the cords (1/s): velocity decays e^(−drag·t). */
  drag: 1,
  /** Ball–cord grip (fraction of the relative tangential velocity removed per contact step): the cords slide on the leather. */
  friction: 0.3,
  /** Cord radius at a knot (su): the ball keeps this clearance from a knot's centre. */
  knotRadius: 0.018,
  /** Settled when every knot moves slower than this (su/s) and lies within `restTolerance` of rest. */
  settleSpeed: 0.01,
  restTolerance: 0.003,
} as const;

export interface BallContact {
  /** Ball centre in net space at the end of the step, and at its start. */
  center: Vector3;
  previous: Vector3;
}

/**
 * The net's dynamics: Verlet positions, XPBD cords (tension only) and shear springs, ball and
 * board collisions, and the pinned cords' pull on the rim (`hookForce`, `hookTorque`).
 */
export class NetSim {
  readonly n: number;
  /** Positions, previous positions and the hanging rest pose (net space, flat xyz). */
  readonly x: Float64Array;
  readonly prev: Float64Array;
  readonly rest: Float64Array;
  private readonly invMass: Float64Array;
  /** Constraints: a, b, length, compliance, mode (0 spring, 1 cord: tension only, 2 apart: a minimum distance). */
  private readonly ca: Uint16Array;
  private readonly cb: Uint16Array;
  private readonly cl: Float64Array;
  private readonly cc: Float64Array;
  private readonly mode: Uint8Array;
  /**
   * Net force (N, net space) the cords pull on the rim's hooks with, and the change of its moment
   * about the rim hinge and the board pivot from the hanging net's (N·m, about +x).
   */
  readonly hookForce = new Vector3();
  hookTorqueRim = 0;
  hookTorqueBoard = 0;
  /** The hanging net's own pull on the rim at rest (N·m): the rim's rest pose already carries it. */
  restTorqueRim = 0;
  restTorqueBoard = 0;
  settled = true;
  /** Wall: the board face plane (net space z) the net cannot pass. */
  private readonly wallZ: number;

  constructor(readonly lattice: NetLattice, seed = 7) {
    const L = lattice;
    this.n = L.nodes.length;
    this.x = new Float64Array(this.n * 3);
    this.prev = new Float64Array(this.n * 3);
    this.rest = new Float64Array(this.n * 3);
    this.invMass = new Float64Array(this.n);
    const rand = rng(seed);
    const free = L.pinned.filter((p) => !p).length;
    // The knots start on the hanging envelope (contract NET_HANG): the master's, opened in its lower
    // half; the cords keep the master's lengths, so the opened rows ride up a little as they hang.
    const hang = L.nodes.map((p, i) => {
      if (L.pinned[i]) return p.clone();
      const t = Math.min(1, Math.max(0, -p.y / NET.depth));
      const k = Math.max(1, netHangRadius(t) / netRestRadius(t));
      return new Vector3(p.x * k, p.y, p.z * k);
    });
    hang.forEach((p, i) => {
      p.toArray(this.x, i * 3);
      this.invMass[i] = L.pinned[i] ? 0 : 1 / ((NET_SIM.mass / free) * (0.9 + 0.2 * rand()));
    });
    // Constraints: the cords (tension only, the master's lengths), each diamond's horizontal and
    // vertical diagonals (soft springs at the hanging spacing, and hard minimum distances), and the
    // cords running straight through each knot (hard minimum distances).
    const cons: { a: number; b: number; len: number; compliance: number; mode: 0 | 1 | 2 }[] = [];
    const MODE = { spring: 0, cord: 1, apart: 2 } as const;
    for (const [a, b] of L.cords) cons.push({ a, b, len: L.nodes[a]!.distanceTo(L.nodes[b]!), compliance: NET_SIM.cordCompliance, mode: MODE.cord });
    const pair = (a: number, b: number, min: number) => {
      const len = hang[a]!.distanceTo(hang[b]!);
      cons.push({ a, b, len, compliance: NET_SIM.shearCompliance, mode: MODE.spring });
      cons.push({ a, b, len: len * min, compliance: 0, mode: MODE.apart });
    };
    for (const row of L.rows) row.forEach((a, i) => pair(a, row[(i + 1) % row.length]!, NET_SIM.minRing));
    const levels = [L.loops, ...L.rows];
    const wrap = (d: number) => Math.atan2(Math.sin(d), Math.cos(d));
    for (let r = 0; r + 2 < levels.length; r++) {
      for (const a of levels[r]!) {
        let best = -1, bd = Infinity;
        for (const b of levels[r + 2]!) {
          const dd = Math.abs(wrap(angleOf(L.nodes[b]!) - angleOf(L.nodes[a]!)));
          if (dd < bd) { bd = dd; best = b; }
        }
        pair(a, best, NET_SIM.minVertical);
      }
    }
    for (let b = 0; b < this.n; b++) {
      const ups = L.cords.filter(([, lo]) => lo === b).map(([up]) => up), downs = L.cords.filter(([up]) => up === b).map(([, lo]) => lo);
      for (const a of ups) for (const c of downs) {
        const s1 = wrap(angleOf(L.nodes[b]!) - angleOf(L.nodes[a]!)), s2 = wrap(angleOf(L.nodes[c]!) - angleOf(L.nodes[b]!));
        if (Math.sign(s1) === Math.sign(s2)) cons.push({ a, b: c, len: hang[a]!.distanceTo(hang[c]!) * NET_SIM.minThrough, compliance: 0, mode: MODE.apart });
      }
    }
    const m = cons.length;
    this.ca = new Uint16Array(m);
    this.cb = new Uint16Array(m);
    this.cl = new Float64Array(m);
    this.cc = new Float64Array(m);
    this.mode = new Uint8Array(m);
    cons.forEach((c, i) => {
      this.ca[i] = c.a;
      this.cb[i] = c.b;
      this.cl[i] = c.len;
      // Compliance in su per sim force unit (kg·su/s²): 1 N = 1/SU_M sim units.
      this.cc[i] = c.compliance * SU_M;
      this.mode[i] = c.mode;
    });
    this.wallZ = BOARD.face - RIM_LOCAL.z + NET_SIM.knotRadius;
    // Hanging rest pose: the equilibrium under gravity (strongly damped relaxation).
    this.prev.set(this.x);
    for (let i = 0; i < 1600; i++) this.substep(NET_SIM.step, null, 0, 40);
    // Relax to a full stop, then read the hanging net's steady pull on the rim (no drag, so the
    // constraints carry its whole weight).
    for (let i = 0; i < 4; i++) this.prev.set(this.x), this.substep(NET_SIM.step, null, 0, 1e6);
    this.prev.set(this.x);
    const f = this.substep(NET_SIM.step, null, 0, 0);
    this.restTorqueRim = f.rim;
    this.restTorqueBoard = f.board;
    this.rest.set(this.x);
    this.settle();
  }

  /** The motion state (positions, previous positions), to carry it across an interruption. */
  save(): { x: Float64Array; prev: Float64Array; settled: boolean } {
    return { x: this.x.slice(), prev: this.prev.slice(), settled: this.settled };
  }
  restore(state: { x: Float64Array; prev: Float64Array; settled: boolean }): void {
    this.x.set(state.x);
    this.prev.set(state.prev);
    this.settled = state.settled;
  }

  /** Snap to the hanging rest pose. */
  settle(): void {
    this.x.set(this.rest);
    this.prev.set(this.rest);
    this.hookForce.set(0, 0, 0);
    this.hookTorqueRim = 0;
    this.hookTorqueBoard = 0;
    this.pending = 0;
    this.settled = true;
  }

  /** The sim's clock lead: frame time not yet integrated (less than one substep). */
  private pending = 0;
  /** Advance by dt with the ball (net space, moving from `previous` to `center` over dt), or none. */
  step(dt: number, ball: BallContact | null): void {
    const h = NET_SIM.step;
    const near = ball && this.ballNear(ball);
    if (this.settled && !near) { this.pending = 0; return; }
    this.settled = false;
    // Substeps ending inside this frame step; the ball is placed by each substep's end time.
    const from = this.pending;
    let count = Math.floor((from + dt) / h + 1e-9);
    this.pending = from + dt - count * h;
    if (this.pending < 0) this.pending = 0;
    if (count === 0) return;
    this.hookForce.set(0, 0, 0);
    if (near && dt > 0) this._vb.subVectors(ball.center, ball.previous).divideScalar(dt);
    else this._vb.set(0, 0, 0);
    let torqueRim = 0, torqueBoard = 0;
    for (let s = 1; s <= count; s++) {
      const f = this.substep(h, near ? ball : null, dt > 0 ? Math.min(1, Math.max(0, (s * h - from) / dt)) : 1, NET_SIM.drag);
      torqueRim += f.rim / count;
      torqueBoard += f.board / count;
    }
    this.hookForce.divideScalar(count);
    // The rim's springs hold the hanging net already: they feel only the change.
    this.hookTorqueRim = torqueRim - this.restTorqueRim;
    this.hookTorqueBoard = torqueBoard - this.restTorqueBoard;
    // Settled: everything slow and back at rest (then snap exactly, so the bones return to rest).
    let vmax = 0, dmax = 0;
    for (let i = 0; i < this.n * 3; i++) {
      vmax = Math.max(vmax, Math.abs(this.x[i]! - this.prev[i]!) / h);
      dmax = Math.max(dmax, Math.abs(this.x[i]! - this.rest[i]!));
    }
    if (!near && vmax < NET_SIM.settleSpeed && dmax < NET_SIM.restTolerance) this.settle();
  }

  private ballNear(ball: BallContact): boolean {
    // Anywhere near the net's volume (rim plane to below the bottom row, within the rim radius).
    const r = BALL_R + 0.1;
    for (const c of [ball.center, ball.previous]) {
      if (c.y < 0.1 + r && c.y > -1.2 && Math.hypot(c.x, c.z) < 0.6 + r) return true;
    }
    return false;
  }

  private readonly _c = new Vector3();
  private readonly _vb = new Vector3();
  /** One substep: integrate, constraints (one XPBD pass), collisions. Returns the hook moments (N·m). */
  private substep(h: number, ball: BallContact | null, frac: number, drag: number): { rim: number; board: number } {
    const x = this.x, prev = this.prev, w = this.invMass, n = this.n;
    const damp = Math.exp(-drag * h);
    for (let i = 0; i < n; i++) {
      if (w[i] === 0) continue;
      for (let k = 0; k < 3; k++) {
        const j = i * 3 + k;
        const v = (x[j]! - prev[j]!) * damp;
        prev[j] = x[j]!;
        x[j] = x[j]! + v + (k === 1 ? -G * h * h : 0);
      }
    }
    // Constraints.
    const h2 = h * h;
    let rim = 0, board = 0;
    for (let c = 0; c < this.ca.length; c++) {
      const a = this.ca[c]!, b = this.cb[c]!;
      const dx = x[b * 3]! - x[a * 3]!, dy = x[b * 3 + 1]! - x[a * 3 + 1]!, dz = x[b * 3 + 2]! - x[a * 3 + 2]!;
      const d = Math.hypot(dx, dy, dz);
      if (d < 1e-9) continue;
      const C = d - this.cl[c]!;
      const mode = this.mode[c]!;
      if ((mode === 1 && C <= 0) || (mode === 2 && C >= 0)) continue;
      const wa = w[a]!, wb = w[b]!;
      const alpha = this.cc[c]! / h2;
      // XPBD with one pass per substep (λ starts at 0 each substep).
      const dl = -C / (wa + wb + alpha);
      const nx = dx / d, ny = dy / d, nz = dz / d;
      x[a * 3] = x[a * 3]! - wa * dl * nx; x[a * 3 + 1] = x[a * 3 + 1]! - wa * dl * ny; x[a * 3 + 2] = x[a * 3 + 2]! - wa * dl * nz;
      x[b * 3] = x[b * 3]! + wb * dl * nx; x[b * 3 + 1] = x[b * 3 + 1]! + wb * dl * ny; x[b * 3 + 2] = x[b * 3 + 2]! + wb * dl * nz;
      if (wa === 0 || wb === 0) {
        // The constraint's pull on its pinned end (sim units → N): ∓dl·n/h² (towards the free node when stretched).
        const k = ((wa === 0 ? -dl : dl) / h2) * SU_M;
        const fx = k * nx, fy = k * ny, fz = k * nz;
        const pin = wa === 0 ? a : b;
        this.hookForce.x += fx; this.hookForce.y += fy; this.hookForce.z += fz;
        const py = x[pin * 3 + 1]! + RIM_LOCAL.y, pz = x[pin * 3 + 2]! + RIM_LOCAL.z;
        // Moments about +x (front down positive): (r − pivot) × F, x component, in N·m.
        rim += ((py - RIM_HINGE.y) * fz - (pz - RIM_HINGE.z) * fy) * SU_M;
        board += ((py - BOARD_PIVOT.y) * fz - (pz - BOARD_PIVOT.z) * fy) * SU_M;
      }
    }
    // Collisions: the ball (moving sphere, friction) and the board face.
    if (ball) {
      const c = this._c.lerpVectors(ball.previous, ball.center, frac);
      const R = BALL_R + NET_SIM.knotRadius;
      const vbx = this._vb.x, vby = this._vb.y, vbz = this._vb.z;
      for (let i = 0; i < n; i++) {
        if (w[i] === 0) continue;
        const j = i * 3;
        const dx = x[j]! - c.x, dy = x[j + 1]! - c.y, dz = x[j + 2]! - c.z;
        const d = Math.hypot(dx, dy, dz);
        if (d >= R || d < 1e-9) continue;
        const nx = dx / d, ny = dy / d, nz = dz / d;
        x[j] = c.x + nx * R; x[j + 1] = c.y + ny * R; x[j + 2] = c.z + nz * R;
        // Velocity relative to the ball: keep the separating normal part, drag the tangential part.
        let rvx = (x[j]! - prev[j]!) / h - vbx, rvy = (x[j + 1]! - prev[j + 1]!) / h - vby, rvz = (x[j + 2]! - prev[j + 2]!) / h - vbz;
        const rn = Math.max(0, rvx * nx + rvy * ny + rvz * nz);
        const tx = rvx - (rvx * nx + rvy * ny + rvz * nz) * nx, ty = rvy - (rvx * nx + rvy * ny + rvz * nz) * ny, tz = rvz - (rvx * nx + rvy * ny + rvz * nz) * nz;
        const keep = 1 - NET_SIM.friction;
        rvx = rn * nx + tx * keep; rvy = rn * ny + ty * keep; rvz = rn * nz + tz * keep;
        prev[j] = x[j]! - (rvx + vbx) * h; prev[j + 1] = x[j + 1]! - (rvy + vby) * h; prev[j + 2] = x[j + 2]! - (rvz + vbz) * h;
      }
    }
    for (let i = 0; i < n; i++) {
      if (w[i] === 0) continue;
      if (x[i * 3 + 2]! < this.wallZ) { x[i * 3 + 2] = this.wallZ; prev[i * 3 + 2] = this.wallZ; }
    }
    return { rim, board };
  }

  /** Node i's position (net space). */
  node(i: number, out = new Vector3()): Vector3 {
    return out.set(this.x[i * 3]!, this.x[i * 3 + 1]!, this.x[i * 3 + 2]!);
  }
  restNode(i: number, out = new Vector3()): Vector3 {
    return out.set(this.rest[i * 3]!, this.rest[i * 3 + 1]!, this.rest[i * 3 + 2]!);
  }
  /** Largest knot speed (su/s) over the last substep — diagnostics. */
  maxDisplacement(): number {
    let d = 0;
    for (let i = 0; i < this.n * 3; i++) d = Math.max(d, Math.abs(this.x[i]! - this.rest[i]!));
    return d;
  }
}

/**
 * The spring-action rim on its bracket hinge and the board on its pole, driven by the net's pull.
 * Real constants (SI): the rim (steel ring and bracket, 0.9 kg about 20 cm in front of the hinge,
 * I ≈ 0.045 kg·m²) on a break-away spring of 80 N·m/rad (5° under 7 N·m: a firm hand pull at the
 * front of a mini rim), ζ 0.15 (7 Hz); the board (3 kg polycarbonate in a steel frame, I ≈ 0.27
 * kg·m² about its back) on a 1¾" steel pole and its clamp, 2500 N·m/rad, ζ 0.06 (15 Hz). A swish
 * (≈ 6 N on the hooks at its peak) dips the rim about a degree, and it springs back onto its stop
 * against the board; the board moves a few hundredths of a degree: the net does the work.
 */
export const HOOP_SPRINGS = {
  rim: { inertia: 0.045, stiffness: 80, zeta: 0.15 },
  board: { inertia: 0.27, stiffness: 2500, zeta: 0.06 },
} as const;

export class HoopSprings {
  rim = 0;
  board = 0;
  private rimV = 0;
  private boardV = 0;
  settled = true;
  step(dt: number, torqueRim: number, torqueBoard: number): void {
    if (this.settled && torqueRim === 0 && torqueBoard === 0) return;
    this.settled = false;
    const sub = 8, h = dt / sub;
    const spring = (x: number, v: number, tq: number, p: { inertia: number; stiffness: number; zeta: number }) => {
      const c = 2 * p.zeta * Math.sqrt(p.stiffness * p.inertia);
      for (let i = 0; i < sub; i++) {
        v += ((tq - p.stiffness * x - c * v) / p.inertia) * h;
        x += v * h;
      }
      return [x, v] as const;
    };
    [this.rim, this.rimV] = spring(this.rim, this.rimV, torqueRim, HOOP_SPRINGS.rim);
    [this.board, this.boardV] = spring(this.board, this.boardV, torqueBoard, HOOP_SPRINGS.board);
    const rl = (RECOIL_LIMIT.rimDeg * Math.PI) / 180, bl = (RECOIL_LIMIT.boardDeg * Math.PI) / 180;
    if (this.rim > rl) { this.rim = rl; this.rimV = 0; }
    // Tipping back, the bracket plate's top meets the board face: a hard stop (a small rebound).
    if (this.rim < RIM_BACKSTOP) { this.rim = RIM_BACKSTOP; this.rimV = Math.max(0, -0.3 * this.rimV); }
    if (Math.abs(this.board) > bl) { this.board = Math.sign(this.board) * bl; this.boardV = 0; }
    if (torqueRim === 0 && torqueBoard === 0 && Math.abs(this.rim) < 1e-5 && Math.abs(this.rimV) < 1e-4 && Math.abs(this.board) < 1e-6 && Math.abs(this.boardV) < 1e-5) this.settle();
  }
  settle(): void {
    this.rim = this.board = this.rimV = this.boardV = 0;
    this.settled = true;
  }
  save(): [number, number, number, number, boolean] {
    return [this.rim, this.board, this.rimV, this.boardV, this.settled];
  }
  restore(state: [number, number, number, number, boolean]): void {
    [this.rim, this.board, this.rimV, this.boardV, this.settled] = state;
  }
}

/**
 * Skinning of the master net onto the lattice: the strand and knot meshes become skinned meshes
 * (one bone per vertex); `update()` sets the bones from the simulation.
 */
export class NetSkin {
  readonly bones: Bone[] = [];
  /** The shared skeleton (its bone texture is a GPU resource: `dispose()` frees it). */
  readonly skeleton: Skeleton;
  private readonly restLen: number[];
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly t = new Vector3();
  private readonly nn = new Vector3();
  private readonly b = new Vector3();
  private readonly a = new Vector3();
  private readonly c = new Vector3();
  private readonly up = new Vector3();
  /** Upper neighbours per node (for the knot frames). */
  private readonly upper: number[][];

  constructor(net: Object3D, private readonly sim: NetSim, meshes: Mesh[]) {
    const L = sim.lattice;
    this.upper = L.nodes.map(() => []);
    for (const [a, b] of L.cords) this.upper[b]!.push(a);
    this.restLen = L.cords.map(([a, b]) => sim.restNode(a).distanceTo(sim.restNode(b)));
    const count = L.cords.length + L.nodes.length;
    for (let i = 0; i < count; i++) {
      const bone = new Bone();
      bone.name = `net_bone_${i}`;
      net.add(bone);
      this.bones.push(bone);
    }
    // Bind pose: the master's own geometry, so the bones' rest frames come from the lattice as analysed.
    this.pose((i, out) => out.copy(L.nodes[i]!), true);
    net.updateMatrixWorld(true);
    const skeleton = (this.skeleton = new Skeleton(this.bones));
    for (const mesh of meshes) {
      const bind = L.binding.get(mesh.geometry);
      if (!bind) continue;
      const g = mesh.geometry;
      const n = bind.bone0.length;
      const idx = new Uint16Array(n * 4), wt = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) {
        idx[i * 4] = bind.bone0[i]!;
        idx[i * 4 + 1] = bind.bone1[i]!;
        wt[i * 4] = 1 - bind.weight1[i]!;
        wt[i * 4 + 1] = bind.weight1[i]!;
      }
      g.setAttribute('skinIndex', new Uint16BufferAttribute(idx, 4));
      g.setAttribute('skinWeight', new Float32BufferAttribute(wt, 4));
      const skinned = new SkinnedMesh(g, mesh.material as Material);
      skinned.name = mesh.name;
      skinned.castShadow = mesh.castShadow;
      skinned.receiveShadow = mesh.receiveShadow;
      skinned.frustumCulled = false;
      skinned.userData = { ...mesh.userData };
      skinned.position.copy(mesh.position);
      skinned.quaternion.copy(mesh.quaternion);
      skinned.scale.copy(mesh.scale);
      mesh.parent!.add(skinned);
      mesh.removeFromParent();
      skinned.updateMatrixWorld(true);
      skinned.bind(skeleton);
    }
    this.update();
  }

  /** Set the bones from node positions (`at`). `bind` uses unit stretch. */
  private pose(at: (i: number, out: Vector3) => Vector3, bind = false): void {
    const L = this.sim.lattice;
    const { t, nn, b, a, c, up, q, m } = this;
    L.cords.forEach(([ia, ib], k) => {
      at(ia, a);
      at(ib, c);
      t.subVectors(c, a);
      const len = t.length();
      t.divideScalar(len || 1);
      const bone = this.bones[k]!;
      this.frame(t, (a.x + c.x) / 2, (a.z + c.z) / 2, nn, b);
      m.makeBasis(t, nn, b);
      bone.quaternion.setFromRotationMatrix(m);
      bone.position.copy(a);
      bone.scale.set(bind ? 1 : len / this.restLen[k]!, 1, 1);
    });
    L.nodes.forEach((_, i) => {
      const bone = this.bones[L.cords.length + i]!;
      at(i, a);
      const ups = this.upper[i]!;
      if (ups.length) {
        up.set(0, 0, 0);
        for (const u of ups) up.add(at(u, c));
        up.divideScalar(ups.length).sub(a).normalize();
      } else up.set(0, 1, 0);
      // Knot frame: (radial, up, radial × up).
      this.frame(up, a.x, a.z, nn, b);
      m.makeBasis(nn, up, b.negate());
      q.setFromRotationMatrix(m);
      bone.quaternion.copy(q);
      bone.position.copy(a);
      bone.scale.set(1, 1, 1);
    });
  }

  /** Radial direction at (x, z) made perpendicular to `axis`, and axis × radial. */
  private frame(axis: Vector3, x: number, z: number, outN: Vector3, outB: Vector3): void {
    const r = Math.hypot(x, z) || 1;
    outN.set(x / r, 0, z / r);
    outN.addScaledVector(axis, -outN.dot(axis));
    if (outN.lengthSq() < 1e-10) outN.set(1, 0, 0).addScaledVector(axis, -axis.x);
    outN.normalize();
    outB.crossVectors(axis, outN);
  }

  /** Bones from the simulation's current positions. */
  update(): void {
    this.pose((i, out) => this.sim.node(i, out));
  }

  dispose(): void {
    this.skeleton.dispose();
  }
}

/** Mesh kind from its node name (the master's `net-strands`, `net-knots`, `net-loops`). */
export function netMeshKind(name: string): 'strands' | 'knots' | 'loops' | null {
  return /knot/i.test(name) ? 'knots' : /loop/i.test(name) ? 'loops' : /strand/i.test(name) ? 'strands' : null;
}
