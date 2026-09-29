import {
  CanvasTexture,
  Color,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  type Texture,
} from 'three';

/**
 * Baked-style contact shadows (Master §8). Two layers sized from the object's FOOTPRINT:
 * a soft spread that shows past the silhouette at the low 15° camera, and a tight contact
 * line that anchors the base. Both tighten and darken at contact and fade with height.
 */

export type ShadowShape = 'round' | 'rect';
type Profile = 'soft' | 'tight';

const textures = new Map<string, Texture>();

function makeTexture(shape: ShadowShape, profile: Profile): Texture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = ((x + 0.5) / size) * 2 - 1;
      const v = ((y + 0.5) / size) * 2 - 1;
      const d = shape === 'round' ? Math.hypot(u, v) : Math.pow(Math.abs(u) ** 6 + Math.abs(v) ** 6, 1 / 6);
      let a: number;
      if (profile === 'soft') {
        // Plateau under the footprint, long smooth tail to the card edge.
        const t = Math.min(1, Math.max(0, (d - 0.45) / 0.55));
        a = (1 - t * t * (3 - 2 * t)) ** 1.4;
      } else {
        // Crisp but anti-aliased edge just outside the footprint.
        const t = Math.min(1, Math.max(0, (d - 0.86) / 0.14));
        a = 1 - t * t * (3 - 2 * t);
      }
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.minFilter = LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

export function shadowTexture(shape: ShadowShape, profile: Profile = 'soft'): Texture {
  const key = `${shape}-${profile}`;
  let t = textures.get(key);
  if (!t) textures.set(key, (t = makeTexture(shape, profile)));
  return t;
}

/** Free GPU copies of the shared falloff textures (they re-upload lazily when reused). */
export function releaseShadowTextureGpu(): void {
  for (const t of textures.values()) t.dispose();
}

export interface ContactShadowOptions {
  name: string;
  shape?: ShadowShape;
  /** Object footprint on the ground (scene units). */
  width: number;
  depth: number;
  /** Soft-layer extent relative to the footprint. */
  spread?: [number, number];
  opacity?: number;
  /** Tight contact-line opacity; 0 disables it (e.g. objects that never touch down). */
  line?: number;
  color?: string;
}

function layer(shape: ShadowShape, profile: Profile, color: Color, opacity: number): MeshBasicMaterial {
  return new MeshBasicMaterial({
    map: shadowTexture(shape, profile),
    color,
    transparent: true,
    depthWrite: false,
    opacity,
    toneMapped: false,
  });
}

export class ContactShadow extends Mesh<PlaneGeometry, MeshBasicMaterial> {
  readonly footprint: [number, number];
  readonly spread: [number, number];
  readonly baseOpacity: number;
  readonly lineOpacity: number;
  private readonly line: Mesh<PlaneGeometry, MeshBasicMaterial> | null;

  constructor(opts: ContactShadowOptions) {
    const color = new Color(opts.color ?? '#3a2f24');
    const shape = opts.shape ?? 'round';
    const opacity = opts.opacity ?? 0.45;
    super(new PlaneGeometry(1, 1), layer(shape, 'soft', color, opacity));
    this.name = opts.name;
    this.rotation.x = -Math.PI / 2;
    this.position.y = 0.002;
    this.renderOrder = -2;
    this.footprint = [opts.width, opts.depth];
    this.spread = opts.spread ?? [1.3, 1.6];
    this.baseOpacity = opacity;
    this.lineOpacity = opts.line ?? 0.4;
    this.scale.set(opts.width * this.spread[0], opts.depth * this.spread[1], 1);

    if (this.lineOpacity > 0) {
      this.line = new Mesh(this.geometry, layer(shape, 'tight', color, this.lineOpacity));
      this.line.name = `${opts.name}_line`;
      this.line.renderOrder = -1;
      this.line.position.z = 0.001;
      // Child scale is relative to the soft layer: tight layer ≈ 1.04 × footprint.
      this.line.scale.set(1.04 / this.spread[0], 1.04 / this.spread[1], 1);
      this.add(this.line);
    } else {
      this.line = null;
    }
  }

  /** Height in scene units above contact. 0 = seated. */
  setHeight(height: number, falloff = 1.2): void {
    const h = Math.max(0, height);
    const grow = 1 + h * 0.55;
    this.scale.set(this.footprint[0] * this.spread[0] * grow, this.footprint[1] * this.spread[1] * grow, 1);
    this.material.opacity = this.baseOpacity * Math.max(0, 1 - h / falloff) ** 1.6;
    if (this.line) this.line.material.opacity = this.lineOpacity * Math.max(0, 1 - h / 0.06);
    // Below ~1% the layer only reads as a smudge; switch it off entirely.
    this.visible = this.material.opacity > 0.012;
  }

  setFootprint(x: number, z: number): void {
    this.position.x = x;
    this.position.z = z;
  }

  override dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.line?.material.dispose();
  }
}
