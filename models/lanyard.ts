import { BufferAttribute, BufferGeometry, Vector3 } from 'three';

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

const p0 = new Vector3(), p1 = new Vector3(), ctrl = new Vector3();
const tangent = new Vector3(), widthDir = new Vector3(), thickDir = new Vector3();
const tmp = new Vector3();

function bezier(out: Vector3, a: Vector3, c: Vector3, b: Vector3, t: number): Vector3 {
  const mt = 1 - t;
  return out.set(
    mt * mt * a.x + 2 * mt * t * c.x + t * t * b.x,
    mt * mt * a.y + 2 * mt * t * c.y + t * t * b.y,
    mt * mt * a.z + 2 * mt * t * c.z + t * t * b.z,
  );
}

function bezierLength(a: Vector3, c: Vector3, b: Vector3): number {
  let len = 0;
  const prev = a.clone();
  const cur = new Vector3();
  for (let i = 1; i <= 16; i++) {
    bezier(cur, a, c, b, i / 16);
    len += cur.distanceTo(prev);
    prev.copy(cur);
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
  }

  /**
   * Solve the strap between a fixed top anchor and the clip. `facing` is the direction the
   * strap's broad face should point (towards the viewer).
   */
  update(top: Vector3, bottom: Vector3, facing: Vector3): void {
    p0.copy(top);
    p1.copy(bottom);
    const chord = p0.distanceTo(p1);
    ctrl.addVectors(p0, p1).multiplyScalar(0.5);
    if (chord < this.length - 1e-4) {
      // Bisection on sag depth so the Bézier arc length matches the strap length.
      let lo = 0, hi = this.length;
      for (let it = 0; it < 18; it++) {
        const mid = (lo + hi) / 2;
        tmp.copy(ctrl).y -= mid;
        if (bezierLength(p0, tmp, p1) > this.length) hi = mid;
        else lo = mid;
      }
      this.sag = (lo + hi) / 2;
      ctrl.y -= this.sag;
    } else {
      this.sag = 0;
    }

    const hw = this.width / 2, ht = this.thickness / 2;
    const prev = new Vector3(), next = new Vector3(), cur = new Vector3();
    for (let i = 0; i < SAMPLES; i++) {
      const t = i / (SAMPLES - 1);
      bezier(cur, p0, ctrl, p1, t);
      bezier(prev, p0, ctrl, p1, Math.max(0, t - 0.01));
      bezier(next, p0, ctrl, p1, Math.min(1, t + 0.01));
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
    this.geometry.computeBoundingSphere();
  }

  get currentSag(): number {
    return this.sag;
  }

  dispose(): void {
    this.geometry.dispose();
  }
}
