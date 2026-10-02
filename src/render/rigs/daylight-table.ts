import {
  type Box3,
  CanvasTexture,
  Color,
  DataTexture,
  DirectionalLight,
  EquirectangularReflectionMapping,
  FloatType,
  HemisphereLight,
  LinearFilter,
  LinearSRGBColorSpace,
  Mesh,
  MeshStandardMaterial,
  NeutralToneMapping,
  NoColorSpace,
  PlaneGeometry,
  PMREMGenerator,
  RepeatWrapping,
  RGBAFormat,
  SpotLight,
  SRGBColorSpace,
  type Texture,
  Vector3,
  type WebGLRenderer,
} from 'three';
import { defineRig } from '../rig.ts';
import { DEFAULT_WALL_Z } from '../studio.ts';
import { keepPixels } from '../textures.ts';

/**
 * daylight-table: an object photographed on a desk by a sheer-curtained window.
 *
 * Directions (three's equirect convention, θ = atan2(z, x) in degrees, el = elevation):
 * the camera sits at θ ≈ 70°, el 15° (CAMERA_ANGLES az 20°); camera-left is θ = 180°; the wall
 * behind the objects is θ = 270°. The room the environment describes is the room the backdrop
 * shows: a pale wood table (the lower hemisphere, warm), a light grey wall, a large sheer window
 * camera-left (the key), a narrow second window camera-right (the second reflection on metal),
 * a white ceiling, and dark furniture so polished metal has contrast strokes.
 */
export const DAYLIGHT = {
  exposure: 1.05,
  key: { color: '#EEF3FA', intensity: 4.4, theta: 166, el: 32, distance: 12, angle: 0.34, penumbra: 0.6, reach: 3.2 },
  bounce: { color: '#F2D3AE', intensity: 0.32 },
  sky: { sky: '#E8EEF6', ground: '#C9A27A', intensity: 0.08 },
  table: { color: '#CDB596', roughness: 0.5 },
  wall: { color: '#D4D5D3', roughness: 0.94 },
  env: {
    win: { th: 166, el: 26, hw: 34, hh: 26, soft: 7, I: 3.2, col: [0.9, 0.955, 1.04] },
    win2: { th: 18, el: 22, hw: 7, hh: 20, soft: 4, I: 1.7, col: [0.94, 0.97, 1.02] },
    wall: { I: 0.4, col: [0.97, 0.97, 0.965] },
    back: { th: 82, el: 22, hw: 46, hh: 26, soft: 16, I: 0.7, col: [0.99, 0.985, 0.975] },
    ceil: { I: 0.75, col: [0.97, 0.98, 1.0] },
    table: { I: 0.42, col: [1.0, 0.86, 0.7] },
    shelf: { th0: 100, th1: 136, el0: -6, el1: 30, I: 0.045, col: [0.9, 0.82, 0.74] },
    door: { th0: 292, th1: 318, el0: -6, el1: 46, I: 0.06, col: [1.0, 0.96, 0.92] },
    camera: { th: 70, el: 6, hw: 6, hh: 8, I: 0.08 },
  },
} as const;

const sm = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const dAng = (a: number, b: number) => Math.abs((((a - b) % 360) + 540) % 360 - 180);
const box = (dth: number, del: number, hw: number, hh: number, soft: number) =>
  (1 - sm(hw - soft, hw + soft, dth)) * (1 - sm(hh - soft, hh + soft, del));
const gauss = (d: number, w: number) => Math.exp(-(d * d) / (2 * w * w));

/** Linear radiance of the room in direction (θ, el), degrees. */
function radiance(th: number, el: number, out: number[]): void {
  const E = DAYLIGHT.env;
  let r: number, g: number, b: number;
  const dW = dAng(th, E.win.th);
  const towardWindow = 0.5 + 0.5 * Math.cos(((th - E.win.th) * Math.PI) / 180);
  const up = sm(-1.5, 1.5, el);
  // Table (lower hemisphere): pale wood, brightest in the pool under the window, darker at nadir.
  const tv = E.table.I * (0.55 + 0.45 * Math.pow(1 - Math.min(1, -el / 90), 2)) * (0.85 + 0.3 * towardWindow) +
    0.35 * gauss(dW, 30) * gauss(el + 18, 12);
  // Wall: light grey, lit by the window's spill; ceiling: soft white, brightest toward the window.
  const wv = E.wall.I * (0.7 + 0.6 * towardWindow * towardWindow) * (0.85 + 0.25 * sm(0, 50, el));
  const cv = E.ceil.I * (0.8 + 0.35 * towardWindow);
  const tc = sm(38, 58, el);
  const wr = (1 - tc) * wv * E.wall.col[0] + tc * cv * E.ceil.col[0];
  const wg = (1 - tc) * wv * E.wall.col[1] + tc * cv * E.ceil.col[1];
  const wb = (1 - tc) * wv * E.wall.col[2] + tc * cv * E.ceil.col[2];
  r = (1 - up) * tv * E.table.col[0] + up * wr;
  g = (1 - up) * tv * E.table.col[1] + up * wg;
  b = (1 - up) * tv * E.table.col[2] + up * wb;
  const mix = (m: number, v: number, c: readonly number[]) => {
    r = r * (1 - m) + m * v * c[0]!;
    g = g * (1 - m) + m * v * c[1]!;
    b = b * (1 - m) + m * v * c[2]!;
  };
  // The room's far wall behind the camera, lit by the window: the broad soft fill on every face
  // that looks at the lens (the plinth front, the reader, the badge).
  const bk = E.back;
  const mb = box(dAng(th, bk.th), Math.abs(el - bk.el), bk.hw, bk.hh, bk.soft);
  if (mb > 0) mix(mb, Math.max(bk.I, 0), bk.col);
  // Dark walnut shelf camera-left-front and a dim doorway behind right: contrast strokes for metal.
  const s = E.shelf;
  mix(box(dAng(th, (s.th0 + s.th1) / 2), Math.abs(el - (s.el0 + s.el1) / 2), (s.th1 - s.th0) / 2, (s.el1 - s.el0) / 2, 3), s.I, s.col);
  const d = E.door;
  mix(box(dAng(th, (d.th0 + d.th1) / 2), Math.abs(el - (d.el0 + d.el1) / 2), (d.th1 - d.th0) / 2, (d.el1 - d.el0) / 2, 3), d.I * (0.7 + 0.6 * sm(d.el0, d.el1, el)), d.col);
  // The photographer and tripod behind the camera: a soft dark patch (depth in the cloche's centre).
  const c = E.camera;
  mix(0.8 * box(dAng(th, c.th), Math.abs(el - c.el), c.hw, c.hh, 6), c.I, [1, 0.97, 0.94]);
  // The sheer-curtained window: soft folds, a mullion cross, brighter toward the top.
  const w = E.win;
  const mw = box(dW, Math.abs(el - w.el), w.hw, w.hh, w.soft);
  if (mw > 0) {
    const dE = el - w.el;
    const fold = 0.9 + 0.1 * Math.cos((dAng(th, w.th) * 2 * Math.PI) / 9) * (0.6 + 0.4 * Math.cos((dW * 2 * Math.PI) / 23));
    const bar = Math.max(1 - sm(0.9, 2.4, dW), 1 - sm(0.9, 2.4, Math.abs(dE - 6)));
    const v = w.I * (0.74 + 0.26 * sm(-w.hh, w.hh, dE)) * fold * (1 - 0.35 * bar);
    mix(mw, v, w.col);
  }
  // Second, narrow window camera-right: a bright band on the right of chrome, silver and glass.
  const w2 = E.win2;
  const m2 = box(dAng(th, w2.th), Math.abs(el - w2.el), w2.hw, w2.hh, w2.soft);
  if (m2 > 0) mix(m2, w2.I * (0.7 + 0.3 * sm(-w2.hh, w2.hh, el - w2.el)), w2.col);
  // The table's far edge against the wall: a soft dark line all round (where wall meets wood).
  const hz = 0.55 * gauss(el - 0.4, 2.2);
  r += (0.06 - r) * hz;
  g += (0.058 - g) * hz;
  b += (0.054 - b) * hz;
  out[0] = r;
  out[1] = g;
  out[2] = b;
}

/** The room, sampled into a float equirect and prefiltered (PMREM). Deterministic. */
function daylightEnvironment(renderer: WebGLRenderer): { texture: Texture; dispose(): void } {
  const W = 1024, H = 512;
  const data = new Float32Array(W * H * 4);
  const px = [0, 0, 0];
  for (let y = 0; y < H; y++) {
    const el = ((y + 0.5) / H - 0.5) * 180;
    for (let x = 0; x < W; x++) {
      const th = ((x + 0.5) / W - 0.5) * 360;
      radiance(th, el, px);
      const i = (y * W + x) * 4;
      data[i] = px[0]!;
      data[i + 1] = px[1]!;
      data[i + 2] = px[2]!;
      data[i + 3] = 1;
    }
  }
  const equirect = new DataTexture(data, W, H, RGBAFormat, FloatType);
  equirect.mapping = EquirectangularReflectionMapping;
  equirect.colorSpace = LinearSRGBColorSpace;
  equirect.magFilter = equirect.minFilter = LinearFilter;
  equirect.needsUpdate = true;
  const pmrem = new PMREMGenerator(renderer);
  const target = pmrem.fromEquirectangular(equirect);
  equirect.dispose();
  pmrem.dispose();
  return { texture: target.texture, dispose: () => target.dispose() };
}

/** Seeded value noise on a periodic grid (tileable). */
function noiseField(size: number, cellsX: number, cellsY: number, rand: () => number): (x: number, y: number) => number {
  const g = new Float32Array(cellsX * cellsY).map(() => rand());
  const at = (i: number, j: number) => g[((j + cellsY) % cellsY) * cellsX + ((i + cellsX) % cellsX)]!;
  return (x, y) => {
    const gx = (x / size) * cellsX, gy = (y / size) * cellsY;
    const x0 = Math.floor(gx), y0 = Math.floor(gy);
    let fx = gx - x0, fy = gy - y0;
    fx = fx * fx * (3 - 2 * fx);
    fy = fy * fy * (3 - 2 * fy);
    const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * fx;
    const c = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * fx;
    return a + (c - a) * fy;
  };
}

/**
 * Pale oak tabletop (tileable, seeded): long grain along x (warped growth rings), fine pores,
 * slight board-to-board tone. Albedo (sRGB, multiplied by the table colour), roughness and a
 * faint normal map from the same height.
 */
function woodTextures(size = 1024): { albedo: Texture; roughness: Texture; normal: Texture } {
  let seed = 23;
  const rand = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
  const warp = noiseField(size, 2, 10, rand);
  const warpFine = noiseField(size, 8, 64, rand);
  const tone = noiseField(size, 2, 6, rand);
  const streak = noiseField(size, 3, 48, rand);
  const pore = noiseField(size, 128, 1024, rand);
  const height = new Float32Array(size * size);
  const shade = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Rings run along x; their phase across y is warped so the figure wanders like flat-sawn oak.
      const v = y / size + 0.05 * warp(x, y) + 0.004 * warpFine(x, y);
      const ring = v * 96;
      const f = ring - Math.floor(ring);
      // Late wood: a narrow darker band in each ring.
      const late = sm(0.62, 0.8, f) * (1 - sm(0.86, 0.98, f));
      const p = pore(x, y);
      const poreDark = sm(0.72, 0.95, p) * (0.4 + 0.6 * late);
      const i = y * size + x;
      shade[i] = 1 - 0.06 * late - 0.05 * poreDark + 0.05 * (tone(x, y) - 0.5) + 0.05 * (streak(x, y) - 0.5);
      height[i] = -0.4 * late - 0.9 * poreDark;
    }
  }
  const canvasOf = () => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    return cv;
  };
  const ac = canvasOf(), rc = canvasOf(), nc = canvasOf();
  const actx = ac.getContext('2d')!, rctx = rc.getContext('2d')!, nctx = nc.getContext('2d')!;
  const aimg = actx.createImageData(size, size), rimg = rctx.createImageData(size, size), nimg = nctx.createImageData(size, size);
  const Hh = (x: number, y: number) => height[((y + size) % size) * size + ((x + size) % size)]!;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x, o = i * 4;
      const s = shade[i]!;
      aimg.data[o] = 255 * Math.min(1, s);
      aimg.data[o + 1] = 255 * Math.min(1, s * 0.985);
      aimg.data[o + 2] = 255 * Math.min(1, s * 0.965);
      aimg.data[o + 3] = 255;
      // Roughness: satin lacquer, slightly rougher in the pores and late wood.
      const rough = Math.min(1, Math.max(0, 0.86 + 0.12 * -height[i]!));
      rimg.data[o] = rimg.data[o + 1] = rimg.data[o + 2] = 255 * rough;
      rimg.data[o + 3] = 255;
      const dx = (Hh(x + 1, y) - Hh(x - 1, y)) * 0.6;
      const dy = (Hh(x, y + 1) - Hh(x, y - 1)) * 0.6;
      const len = Math.hypot(dx, dy, 1);
      nimg.data[o] = ((-dx / len) * 0.5 + 0.5) * 255;
      nimg.data[o + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      nimg.data[o + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      nimg.data[o + 3] = 255;
    }
  }
  actx.putImageData(aimg, 0, 0);
  rctx.putImageData(rimg, 0, 0);
  nctx.putImageData(nimg, 0, 0);
  const albedo = new CanvasTexture(keepPixels(ac));
  albedo.colorSpace = SRGBColorSpace;
  const roughness = new CanvasTexture(keepPixels(rc));
  roughness.colorSpace = NoColorSpace;
  const normal = new CanvasTexture(keepPixels(nc));
  normal.colorSpace = NoColorSpace;
  for (const t of [albedo, roughness, normal]) {
    t.wrapS = t.wrapT = RepeatWrapping;
    t.anisotropy = 8;
  }
  return { albedo, roughness, normal };
}

/** Plane geometry whose UVs are world units / `unit` (texture density independent of size). */
function worldPlane(w: number, h: number, unit: number): PlaneGeometry {
  const g = new PlaneGeometry(w, h);
  const uv = g.attributes.uv!;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / unit, (uv.getY(i) * h) / unit);
  return g;
}

const keyDir = new Vector3();

export default defineRig({
  label: 'daylight-table · sheer window, oak desk, grey wall',
  stageColor: '#E0D4C3',
  exposure: DAYLIGHT.exposure,
  toneMapping: NeutralToneMapping,
  environmentIntensity: 1,
  metalEnvIntensity: 1,
  gobo: false,
  backdrop: { kind: 'table', color: DAYLIGHT.table.color, note: 'pale oak desk against a light grey wall' },
  shadows: { filter: 'vogel16', mapSize: 2048, radius: 9, bias: -0.0003, normalBias: 0.012, near: 4, far: 26 },

  build({ renderer, target }) {
    const env = daylightEnvironment(renderer);

    // Key: the sheer window camera-left, a cool spot aimed at the content. Its cone and penumbra
    // are sized from the content's bounds in setContent (light falls off across the desk and the
    // wall as it does from a window).
    const K = DAYLIGHT.key;
    const key = new SpotLight(K.color, K.intensity, 0, K.angle, K.penumbra, 0);
    key.name = 'daylight_key';
    key.target = target;
    const th = (K.theta * Math.PI) / 180, el = (K.el * Math.PI) / 180;
    keyDir.set(Math.cos(th) * Math.cos(el), Math.sin(el), Math.sin(th) * Math.cos(el));
    key.position.copy(target.position).addScaledVector(keyDir, K.distance);

    // Warm bounce off the oak desk: a weak light from below (reaches only down-facing surfaces).
    const bounce = new DirectionalLight(DAYLIGHT.bounce.color, DAYLIGHT.bounce.intensity);
    bounce.name = 'daylight_bounce';
    bounce.position.set(-0.3, -1, 0.6);
    const skyFill = new HemisphereLight(DAYLIGHT.sky.sky, DAYLIGHT.sky.ground, DAYLIGHT.sky.intensity);

    // Backdrop: oak tabletop and a light grey painted wall meeting it at a plain corner.
    const wood = woodTextures();
    const tableMat = new MeshStandardMaterial({
      name: 'mat_table_oak',
      color: new Color(DAYLIGHT.table.color),
      roughness: DAYLIGHT.table.roughness,
      metalness: 0,
      map: wood.albedo,
      roughnessMap: wood.roughness,
      normalMap: wood.normal,
    });
    tableMat.normalScale.set(0.35, 0.35);
    const table = new Mesh(worldPlane(60, 40, 4), tableMat);
    table.name = 'daylight_table';
    table.rotation.x = -Math.PI / 2;
    table.receiveShadow = true;

    const wallMat = new MeshStandardMaterial({ name: 'mat_wall_paint', color: new Color(DAYLIGHT.wall.color), roughness: DAYLIGHT.wall.roughness, metalness: 0 });
    const wall = new Mesh(new PlaneGeometry(60, 24), wallMat);
    wall.name = 'daylight_wall';
    wall.receiveShadow = true;

    let wallZ = DEFAULT_WALL_Z;
    const place = () => {
      wall.position.set(0, 12, wallZ);
      // The table runs from the wall to well past the camera's near view.
      table.position.set(0, 0, wallZ + 20);
      renderer.shadowMap.needsUpdate = true;
    };
    place();

    let lowDetail = false;
    return {
      environment: env.texture,
      objects: [key, bounce, skyFill, table, wall],
      shadowKey: key,
      backdrop: table,
      setWall(z = DEFAULT_WALL_Z, scale = 1) {
        // v1.4: this comparison rig keeps a world-size desk and wall; only the wall's depth follows.
        if (z * scale === wallZ) return;
        wallZ = z * scale;
        place();
      },
      setContent(bounds: Box3, scale = 1) {
        // Keep the window at the same angle and distance from whatever the scene's centre is.
        key.position.copy(target.position).addScaledVector(keyDir, K.distance * scale);
        const size = bounds.getSize(new Vector3());
        // The window's light pool: the whole subject (its motion bounds) sits in the full beam, and
        // the light falls off broadly beyond it across the desk and the wall, as daylight does a
        // metre from a window. Tall scenes (Business) get a wider pool.
        const core = Math.atan((0.5 * Math.hypot(size.x, size.y, size.z)) / K.distance);
        key.angle = Math.min(1.0, Math.max(K.angle, K.reach * core));
        key.penumbra = Math.min(0.85, Math.max(0.2, 1 - (1.1 * core) / key.angle));
        key.updateMatrixWorld();
      },
      setLowDetail(enabled) {
        if (enabled === lowDetail) return;
        lowDetail = enabled;
        // Low: drop the grain relief and the roughness variation (the oak colour stays).
        tableMat.normalMap = enabled ? null : wood.normal;
        tableMat.roughnessMap = enabled ? null : wood.roughness;
        tableMat.needsUpdate = true;
        if (enabled) {
          wood.normal.dispose();
          wood.roughness.dispose();
        }
      },
      dispose() {
        wood.albedo.dispose();
        wood.roughness.dispose();
        wood.normal.dispose();
        tableMat.dispose();
        wallMat.dispose();
        table.geometry.dispose();
        wall.geometry.dispose();
        env.dispose();
      },
    };
  },
});
