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
 * Baked-style contact shadows (Master §8): a soft falloff card on the ground that tightens
 * and darkens at contact, spreads and fades with height. Cheaper and more controllable
 * than a shadow map, and it moves with its object.
 */

export type ShadowShape = 'round' | 'rect';

const textures = new Map<ShadowShape, Texture>();

function makeTexture(shape: ShadowShape): Texture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size * 2 - 1;
      const v = (y + 0.5) / size * 2 - 1;
      let d: number;
      if (shape === 'round') d = Math.hypot(u, v);
      else {
        // Superellipse distance gives a soft rounded-rectangle footprint.
        const p = 5;
        d = Math.pow(Math.pow(Math.abs(u), p) + Math.pow(Math.abs(v), p), 1 / p);
      }
      // Dense contact core with a short soft tail (reads at the low 15° camera).
      const core = Math.max(0, 1 - d / 0.78);
      const tail = Math.max(0, 1 - d);
      const a = Math.min(1, 0.85 * Math.pow(core, 1.6) + 0.25 * tail * tail * tail);
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

export function shadowTexture(shape: ShadowShape): Texture {
  let t = textures.get(shape);
  if (!t) {
    t = makeTexture(shape);
    textures.set(shape, t);
  }
  return t;
}

export interface ContactShadowOptions {
  name: string;
  shape?: ShadowShape;
  width: number;
  depth: number;
  opacity?: number;
  color?: string;
}

export class ContactShadow extends Mesh<PlaneGeometry, MeshBasicMaterial> {
  readonly baseWidth: number;
  readonly baseDepth: number;
  readonly baseOpacity: number;

  constructor(opts: ContactShadowOptions) {
    const material = new MeshBasicMaterial({
      map: shadowTexture(opts.shape ?? 'round'),
      color: new Color(opts.color ?? '#3a2f24'),
      transparent: true,
      depthWrite: false,
      opacity: opts.opacity ?? 0.5,
      toneMapped: false,
    });
    super(new PlaneGeometry(1, 1), material);
    this.name = opts.name;
    this.rotation.x = -Math.PI / 2;
    this.position.y = 0.002;
    this.renderOrder = -1;
    this.baseWidth = opts.width;
    this.baseDepth = opts.depth;
    this.baseOpacity = opts.opacity ?? 0.5;
    this.scale.set(opts.width, opts.depth, 1);
  }

  /** Height in scene units above contact. 0 = seated. */
  setHeight(height: number, falloff = 1.2): void {
    const h = Math.max(0, height);
    const spread = 1 + h * 0.55;
    this.scale.set(this.baseWidth * spread, this.baseDepth * spread, 1);
    this.material.opacity = this.baseOpacity * Math.max(0, 1 - h / falloff) ** 1.6;
    this.visible = this.material.opacity > 0.002;
  }

  setFootprint(x: number, z: number): void {
    this.position.x = x;
    this.position.z = z;
  }

  override dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
