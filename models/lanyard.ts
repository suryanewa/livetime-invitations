import { BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three';

/**
 * Curve-based fabric strap (Business sub-spec): fixed length, sag profile from slack,
 * rebuilt in place each frame. No cloth simulation.
 */

const SAMPLES = 28;
/**
 * Rounded-rectangle cross-section: flat broad faces (shared normal) joined by soft edges.
 * [widthOffset -1..1, thicknessOffset -1..1, normalW, normalT]
 */
const SECTION: [number, number, number, number][] = [
  [1, 0, 1, 0],
  [0.92, 0.9, 0.7, 0.7],
  [0.86, 1, 0, 1],
  [-0.86, 1, 0, 1],
  [-0.92, 0.9, -0.7, 0.7],
  [-1, 0, -1, 0],
  [-0.92, -0.9, -0.7, -0.7],
  [-0.86, -1, 0, -1],
  [0.86, -1, 0, -1],
  [0.92, -0.9, 0.7, -0.7],
  [1, 0, 1, 0],
];
const RING = SECTION.length;

const p0 = new Vector3(), p1 = new Vector3(), c1 = new Vector3(), c2 = new Vector3();
const UP = new Vector3(0, 1, 0);
const tangent = new Vector3(), widthDir = new Vector3(), thickDir = new Vector3();
const prev = new Vector3(), next = new Vector3(), cur = new Vector3();
const bottomAxis = new Vector3();
let handleK1 = 0, handleK2 = 0;

function placeControls(handle: number, droop: number): void {
  c1.set(p0.x, p0.y - handleK1 * handle - droop, p0.z);
  c2.copy(p1).addScaledVector(bottomAxis, handleK2 * handle);
  c2.y -= droop * 0.7;
}

function cubic(out: Vector3, a: Vector3, b: Vector3, c: Vector3, d: Vector3, t: number): Vector3 {
  const mt = 1 - t;
  const w0 = mt * mt * mt, w1 = 3 * mt * mt * t, w2 = 3 * mt * t * t, w3 = t * t * t;
  return out.set(
    w0 * a.x + w1 * b.x + w2 * c.x + w3 * d.x,
    w0 * a.y + w1 * b.y + w2 * c.y + w3 * d.y,
    w0 * a.z + w1 * b.z + w2 * c.z + w3 * d.z,
  );
}

const lenPrev = new Vector3(), lenCur = new Vector3();
function cubicLength(a: Vector3, b: Vector3, c: Vector3, d: Vector3): number {
  let len = 0;
  lenPrev.copy(a);
  for (let i = 1; i <= 20; i++) {
    cubic(lenCur, a, b, c, d, i / 20);
    len += lenCur.distanceTo(lenPrev);
    lenPrev.copy(lenCur);
  }
  return len;
}

export class LanyardStrand {
  readonly geometry = new BufferGeometry();
  private readonly positions = new Float32Array(SAMPLES * RING * 3);
  private readonly normals = new Float32Array(SAMPLES * RING * 3);
  /** Last solved sag, reused as the bisection seed. */
  private sag = 0;

  constructor(
    readonly length: number,
    readonly width = 0.1,
    readonly thickness = 0.014,
    readonly weaveTile = 0.06,
  ) {
    const uv = new Float32Array(SAMPLES * RING * 2);
    const index: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      for (let j = 0; j < RING; j++) {
        const k = (i * RING + j) * 2;
        uv[k] = (SECTION[j]![0] * 0.5 + 0.5) * (width / weaveTile);
        uv[k + 1] = ((i / (SAMPLES - 1)) * length) / weaveTile;
      }
    }
    for (let i = 0; i < SAMPLES - 1; i++) {
      for (let j = 0; j < RING - 1; j++) {
        const a = i * RING + j, b = a + RING;
        index.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('normal', new BufferAttribute(this.normals, 3));
    this.geometry.setAttribute('uv', new BufferAttribute(uv, 2));
    this.geometry.setIndex(index);
    // Strands are never frustum-culled; a fixed generous sphere avoids per-frame recompute.
    this.geometry.boundingSphere = new Sphere(new Vector3(0, 2, 0), 6);
  }

  /**
   * Solve the strap between the top anchor and the clip. The strap hangs straight down from
   * the anchor and leaves the clip along `bottomDir` (the clip's own up axis), so when the
   * card swings the lower part of the strap bends with it. Arc length always matches the
   * strap length: slack becomes sag, tension shortens the tangent handles.
   * `facing` is the direction the strap's broad face points (towards the viewer).
   */
  update(top: Vector3, bottom: Vector3, facing: Vector3, bottomDir: Vector3 = UP): void {
    p0.copy(top);
    p1.copy(bottom);
    const chord = p0.distanceTo(p1);
    handleK1 = 0.3 * chord;
    handleK2 = 0.24 * chord;
    bottomAxis.copy(bottomDir);
    const place = placeControls;
    place(1, 0);
    const base = cubicLength(p0, c1, c2, p1);
    if (base < this.length) {
      let lo = 0, hi = this.length;
      for (let it = 0; it < 18; it++) {
        const mid = (lo + hi) / 2;
        place(1, mid);
        if (cubicLength(p0, c1, c2, p1) > this.length) hi = mid;
        else lo = mid;
      }
      this.sag = (lo + hi) / 2;
      place(1, this.sag);
    } else {
      let lo = 0, hi = 1;
      for (let it = 0; it < 14; it++) {
        const mid = (lo + hi) / 2;
        place(mid, 0);
        if (cubicLength(p0, c1, c2, p1) > this.length) hi = mid;
        else lo = mid;
      }
      this.sag = 0;
      place(lo, 0);
    }

    const hw = this.width / 2, ht = this.thickness / 2;
    for (let i = 0; i < SAMPLES; i++) {
      const t = i / (SAMPLES - 1);
      cubic(cur, p0, c1, c2, p1, t);
      cubic(prev, p0, c1, c2, p1, Math.max(0, t - 0.01));
      cubic(next, p0, c1, c2, p1, Math.min(1, t + 0.01));
      tangent.subVectors(next, prev).normalize();
      widthDir.crossVectors(tangent, facing).normalize();
      thickDir.crossVectors(widthDir, tangent).normalize();
      for (let j = 0; j < RING; j++) {
        const [w, th, nw, nt] = SECTION[j]!;
        const k = (i * RING + j) * 3;
        this.positions[k] = cur.x + widthDir.x * w * hw + thickDir.x * th * ht;
        this.positions[k + 1] = cur.y + widthDir.y * w * hw + thickDir.y * th * ht;
        this.positions[k + 2] = cur.z + widthDir.z * w * hw + thickDir.z * th * ht;
        const nx = widthDir.x * nw + thickDir.x * nt;
        const ny = widthDir.y * nw + thickDir.y * nt;
        const nz = widthDir.z * nw + thickDir.z * nt;
        const nl = Math.hypot(nx, ny, nz) || 1;
        this.normals[k] = nx / nl;
        this.normals[k + 1] = ny / nl;
        this.normals[k + 2] = nz / nl;
      }
    }
    (this.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('normal') as BufferAttribute).needsUpdate = true;
  }

  get currentSag(): number {
    return this.sag;
  }

  dispose(): void {
    this.geometry.dispose();
  }
}
