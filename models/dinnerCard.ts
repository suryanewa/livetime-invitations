import {
  BoxGeometry, CanvasTexture, Color, Group, LinearFilter, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace, type Texture,
} from 'three';
import { type CardText, CARD_INK, createCardPrint } from '../src/render/cardPrint.ts';
import { keepPixels } from '../src/render/textures.ts';
import { CARD, CARD_BOTTOM } from './dinnerContract.ts';

/**
 * v1.7 (spec revision #41, pending Surya): the invitation card the reveal uncovers, lying flat in the
 * plate's well (models/dinnerContract.ts CARD). Built at runtime — no GLB change — and hung under
 * `plate_authored` by the rig (models/dinner.ts), so it rides with the plate and hides with the dish.
 *
 * - **The stock:** a heavyweight cream card (#F2ECE0) with a matte finish (roughness 0.78, a hint of
 *   sheen), its print on the top face; the edges are the same stock a shade deeper (a cut edge
 *   catches less light than the face), so the 0.6 mm edge reads as a line at the showcase's 15°.
 * - **The contact shadow:** a tight occlusion under its edges on the porcelain (a 2–3 mm falloff
 *   drawn from the card's own outline, plus a faint wider skirt), so it lies on the plate, not over it.
 * - **The depth:** an opaque mesh, so the scene depth marks it an occluder with the plate (the steam
 *   stops at it; it sits inside the steam's clear layer, so the field needs no change).
 * It casts no shadow-map shadow (0.6 mm: the stage's caster filter skips it) and receives the key's.
 */
export class DinnerCard {
  /** `card_authored`: at the well's top, turned by CARD.yaw. */
  readonly object = new Group();
  readonly body: Mesh<BoxGeometry, MeshStandardMaterial[]>;
  /** The contact shadow (null where there is no canvas: unit tests). */
  readonly shadow: Mesh<PlaneGeometry, MeshBasicMaterial> | null;
  private readonly face: MeshStandardMaterial;
  private readonly edge: MeshStandardMaterial;
  private print: Texture | null = null;
  private text: CardText = {};
  private low = false;
  /** Anisotropy for the print (the renderer's maximum, set by the scene once it knows it). */
  private anisotropy = 1;

  constructor(shadow: { color: string; opacity: number } = { color: '#3a2f24', opacity: 0.45 }) {
    this.object.name = 'card_authored';
    this.object.position.set(0, CARD_BOTTOM, 0);
    this.object.rotation.y = CARD.yaw;
    this.face = new MeshStandardMaterial({ name: 'mat_card_face', color: new Color('#ffffff'), roughness: 0.78, metalness: 0 });
    // Without a print (unit tests, or before the first draw) the face is the bare stock.
    this.face.color.set(CARD_INK.paper);
    this.edge = new MeshStandardMaterial({ name: 'mat_card_edge', color: new Color('#E2D9C7'), roughness: 0.86, metalness: 0 });
    const geo = new BoxGeometry(CARD.width, CARD.thickness, CARD.depth);
    geo.translate(0, CARD.thickness / 2, 0);
    // BoxGeometry's groups: +x, −x, +y (the printed face), −y, +z, −z.
    this.body = new Mesh(geo, [this.edge, this.edge, this.face, this.edge, this.edge, this.edge]);
    this.body.name = 'card_body';
    this.object.add(this.body);
    this.shadow = typeof document === 'undefined' ? null : cardShadow(shadow.color, shadow.opacity);
    if (this.shadow) this.object.add(this.shadow);
  }

  /** The print (redrawn on every change of text; the same text is not redrawn). */
  setText(text: CardText): void {
    const same = text.eyebrow === this.text.eyebrow && text.title === this.text.title && text.name === this.text.name;
    if (same && this.print) return;
    this.text = { ...text };
    this.redraw();
  }

  /** The Low tier prints at half the resolution (1024 × 717). */
  setLowDetail(enabled: boolean): void {
    if (enabled === this.low) return;
    this.low = enabled;
    if (this.print) this.redraw();
  }

  setAnisotropy(n: number): void {
    this.anisotropy = Math.max(1, n);
    if (this.print) {
      this.print.anisotropy = this.anisotropy;
      this.print.needsUpdate = true;
    }
  }

  get printTexture(): Texture | null {
    return this.print;
  }

  private redraw(): void {
    const next = createCardPrint(this.text, this.low ? 'low' : 'full');
    if (!next) return;
    next.anisotropy = this.anisotropy;
    this.print?.dispose();
    this.print = next;
    this.face.map = next;
    this.face.color.set('#ffffff');
    this.face.needsUpdate = true;
  }

  dispose(): void {
    this.print?.dispose();
    this.print = null;
    this.body.geometry.dispose();
    this.face.dispose();
    this.edge.dispose();
    if (this.shadow) {
      this.shadow.geometry.dispose();
      this.shadow.material.map?.dispose();
      this.shadow.material.dispose();
    }
    this.object.removeFromParent();
  }
}

/** How far the shadow's quad reaches past the card (su; ≈ 6 mm), and its two falloffs (mm). */
const SHADOW = { reach: 0.036, contact: 1.1, skirt: 4.5, skirtShare: 0.22 } as const;

/**
 * The card's contact shadow: a quad CARD + 2·reach on the porcelain, its alpha drawn from the
 * distance to the card's outline (exp falloffs: the contact ≈ 1 mm, a faint skirt ≈ 4.5 mm), full
 * under the card (hidden by it). A transparent overlay like ContactShadow's layers, drawn first.
 */
function cardShadow(color: string, opacity: number): Mesh<PlaneGeometry, MeshBasicMaterial> {
  const w = CARD.width + 2 * SHADOW.reach, d = CARD.depth + 2 * SHADOW.reach;
  const px = 512, py = Math.round((px * d) / w);
  const canvas = document.createElement('canvas');
  canvas.width = px;
  canvas.height = py;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(px, py);
  const mmPerSu = 168.75;
  for (let j = 0; j < py; j++) {
    for (let i = 0; i < px; i++) {
      const x = ((i + 0.5) / px - 0.5) * w, z = ((j + 0.5) / py - 0.5) * d;
      const dx = Math.max(0, Math.abs(x) - CARD.width / 2), dz = Math.max(0, Math.abs(z) - CARD.depth / 2);
      const out = Math.hypot(dx, dz) * mmPerSu;
      const a = (1 - SHADOW.skirtShare) * Math.exp(-out / SHADOW.contact) + SHADOW.skirtShare * Math.exp(-out / SHADOW.skirt);
      const k = (j * px + i) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = 255;
      img.data[k + 3] = Math.round(255 * Math.min(1, a) * Math.min(1, (SHADOW.reach * mmPerSu - Math.max(Math.abs(x) - CARD.width / 2, Math.abs(z) - CARD.depth / 2) * mmPerSu) / 1.5));
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new CanvasTexture(keepPixels(canvas));
  tex.colorSpace = SRGBColorSpace;
  tex.minFilter = LinearFilter;
  tex.generateMipmaps = false;
  const mat = new MeshBasicMaterial({ map: tex, color: new Color(color), transparent: true, depthWrite: false, opacity, toneMapped: false });
  const mesh = new Mesh(new PlaneGeometry(w, d), mat);
  mesh.name = 'card_shadow';
  mesh.rotation.x = -Math.PI / 2;
  // Just over the porcelain (the card's underside is CARD.gap above it).
  mesh.position.y = -CARD.gap + 0.0001;
  mesh.renderOrder = -2;
  mesh.userData.noShadowCast = true;
  return mesh;
}
