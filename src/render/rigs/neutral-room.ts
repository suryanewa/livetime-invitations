import {
  DataTexture,
  EquirectangularReflectionMapping,
  FloatType,
  LinearFilter,
  LinearSRGBColorSpace,
  MathUtils,
  NeutralToneMapping,
  PMREMGenerator,
  RGBAFormat,
  SpotLight,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { defineRig } from '../rig.ts';
import { createSweepBackdrop } from '../studio.ts';

/**
 * neutral-room (studio pass v1.3): the Models viewer's interior rig
 * (scan-to-cad-rebuilds/candidates/final/env.js, the light the masters were judged in) ported as
 * a rig, with a neutral greige painted cove as the stage.
 *
 * The environment is the viewer's procedural room, evaluated texel by texel into a linear float
 * equirectangular map and prefiltered once (PMREM, no blur): a large sheer window with soft
 * mullions camera-left, linen drapes either side, an overcast ceiling gradient with a skylight
 * strip, a narrow side window, a tungsten lamp behind-right, greige walls, a framed print, a dark
 * doorway, a walnut sideboard and a dark table runner on the camera side (the strokes polished
 * metal needs for contrast), all over a mid-grey table that meets the wall at a soft horizon.
 * It is mirrored and turned so its layout sits around the product camera (azimuth 20°) the way it
 * sat around the viewer's (window camera-left, as in the master renders). The window's direct share comes from one soft spot key aimed along the window,
 * which casts the real-time shadow; everything else is image-based light at full strength.
 */

/** Angles are degrees: θ = atan2(z, x) (three's equirect u), el = elevation. */
type Rgb = readonly [number, number, number];

export const NEUTRAL_ROOM = {
  /** Equirect size of the room before PMREM. */
  W: 1024,
  H: 512,
  /**
   * Room placement: world θ = rotation − room θ. The viewer saw the room mirrored relative to
   * three's equirect convention (its masters are lit from the upper left, window camera-left), so the
   * room is mirrored and turned to put the viewer's camera direction (room θ ≈ 50°) on the product
   * camera (world θ = 70°, azimuth 20°): window camera-left, lamp behind-right, runner camera-side.
   */
  rotation: 120,
  exposure: 1.15,
  // The room (candidates/final/env.js, parameters as judged there).
  win: { th: 2, el: 30, hw: 24, hh: 23, soft: 5, I: 3.4, col: [0.89, 0.955, 1.05] as Rgb },
  mullion: { w: 1.6, depth: 0.45 },
  drape: { I: 0.2, w: 16, col: [1.0, 0.96, 0.9] as Rgb, period: 14, amp: 0.12 },
  lamp: { th: 148, el: 16, hw: 8, hh: 6, I: 1.8, halo: 0.11, haloW: 24, col: [1.0, 0.85, 0.7] as Rgb },
  horizon: { el: 0.5, sig: 3.6, w: 0.85, v: 0.045 },
  card: { th: 55, el: -9, hw: 75, hh: 6, soft: 5, w: 0.8, v: 0.065 },
  strip: { th: 30, el: 68, hw: 80, hh: 3.5, soft: 3.5, I: 1.0, col: [0.97, 0.985, 1.0] as Rgb },
  fill: { th: 62, el: 40, hw: 30, hh: 18, soft: 14, I: 1.0, col: [0.985, 0.99, 1.0] as Rgb },
  win2: { th: 118, el: 26, hw: 8, hh: 19, soft: 4, I: 2.0, col: [0.95, 0.975, 1.02] as Rgb },
  beam: { th: 200, el: 52, hw: 55, hh: 8, soft: 5, depth: 0.4 },
  wall: { base: 0.24, lo: 0.85, spill: 0.16, col: [1.0, 0.975, 0.935] as Rgb },
  ceil: { base: 0.45, zen: 0.75, spill: 0.25, col: [0.97, 0.98, 1.0] as Rgb },
  floor: { hor: 0.42, nadir: 0.14, patch: 0.25, col: [1.0, 0.982, 0.955] as Rgb },
  cabinet: { th0: 78, th1: 122, el0: -4, el1: 15, I: 0.06, soft: 3.5, col: [1.0, 0.88, 0.76] as Rgb },
  print: { th: 182, el: 24, hw: 11, hh: 9, frame: 1.4, I: 0.09, frameI: 0.42, col: [0.95, 0.97, 1.0] as Rgb },
  door: { th0: 204, th1: 226, el0: -6, el1: 44, I: 0.085, soft: 4, col: [1.0, 0.95, 0.9] as Rgb },
  /** Soft key: the window's direct share, from the window's direction (room θ, before rotation). */
  key: { th: 2, el: 40, distance: 12, color: '#F3F5FA', intensity: 1.5, angle: 0.62, penumbra: 0.8 },
  /** The cove: neutral greige paint, clean (no relief: the plaster mottle read as dirt under the raking key). */
  sweep: { color: '#BEB9B1', roughness: 0.9 },
} as const;

const P = NEUTRAL_ROOM;

const sm = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const dAng = (a: number, b: number) => Math.abs((((a - b) % 360) + 540) % 360 - 180);
/** Soft box: 1 inside |dth| < hw and |del| < hh, smooth falloff over `soft` degrees. */
const box = (dth: number, del: number, hw: number, hh: number, soft: number) =>
  (1 - sm(hw - soft, hw + soft, dth)) * (1 - sm(hh - soft, hh + soft, del));
const gauss = (d: number, w: number) => Math.exp(-(d * d) / (2 * w * w));

/** Linear radiance of the room in direction (θ, el), room coordinates (env.js `radiance`, verbatim in substance). */
export function roomRadiance(th: number, el: number, out: [number, number, number]): void {
  let r = 0, g = 0, b = 0;
  const dW = dAng(th, P.win.th), dL = dAng(th, P.lamp.th);
  const spillW = 0.5 + 0.5 * Math.cos(((th - P.win.th) * Math.PI) / 180);
  const tHor = sm(-1.2, 1.2, el);
  // Table / floor.
  if (tHor < 1) {
    const f = P.floor;
    let v = f.nadir + (f.hor - f.nadir) * Math.pow(1 - Math.min(1, -el / 90), 2.2);
    v += f.patch * gauss(dW, 22) * gauss(el + 16, 10);
    v *= 0.85 + 0.15 * spillW;
    const k = 1 - tHor;
    r += k * v * f.col[0]; g += k * v * f.col[1]; b += k * v * f.col[2];
  }
  if (tHor > 0) {
    const wl = P.wall, cl = P.ceil;
    const up = Math.max(0, el) / 90;
    let wv = wl.base * (wl.lo + (1.2 - wl.lo) * sm(0, 40, el)) + wl.spill * spillW * spillW;
    wv += P.lamp.halo * gauss(dL, P.lamp.haloW) * gauss(el - P.lamp.el, 22);
    const cv = cl.base + (cl.zen - cl.base) * sm(40, 90, el) + cl.spill * spillW * (1 - up);
    const tc = sm(30, 52, el);
    const lampTint = (gauss(dL, P.lamp.haloW) * gauss(el - P.lamp.el, 22) * P.lamp.halo) / Math.max(wv, 1e-3);
    const wc = [wl.col[0], wl.col[1] * (1 - 0.2 * lampTint), wl.col[2] * (1 - 0.4 * lampTint)];
    let rr = (1 - tc) * wv * wc[0]! + tc * cv * cl.col[0];
    let gg = (1 - tc) * wv * wc[1]! + tc * cv * cl.col[1];
    let bb = (1 - tc) * wv * wc[2]! + tc * cv * cl.col[2];
    // Overhead skylight strip, the large soft bounce behind the camera, the dark ceiling beam.
    {
      const q = P.strip, ms = box(dAng(th, q.th), Math.abs(el - q.el), q.hw, q.hh, q.soft);
      if (ms > 0) {
        const v = q.I * (0.85 + 0.15 * Math.cos((dAng(th, q.th) * Math.PI) / 180));
        rr += ms * v * q.col[0]; gg += ms * v * q.col[1]; bb += ms * v * q.col[2];
      }
      const fl = P.fill, mf = box(dAng(th, fl.th), Math.abs(el - fl.el), fl.hw, fl.hh, fl.soft);
      if (mf > 0) {
        const v = fl.I * (0.75 + 0.25 * sm(-fl.hh, fl.hh, el - fl.el));
        rr += mf * v * fl.col[0]; gg += mf * v * fl.col[1]; bb += mf * v * fl.col[2];
      }
      const bm = P.beam, mb = box(dAng(th, bm.th), Math.abs(el - bm.el), bm.hw, bm.hh, bm.soft) * bm.depth;
      rr *= 1 - mb; gg *= 1 - mb; bb *= 1 - mb;
    }
    // Linen drapes either side of the window: soft vertical folds.
    for (const s of [-1, 1]) {
      const c = P.win.th + s * (P.win.hw + P.drape.w * 0.5 + 2);
      const dd = dAng(th, c);
      const m = (1 - sm(P.drape.w * 0.5 - 2, P.drape.w * 0.5 + 2, dd)) * (1 - sm(P.win.el + P.win.hh + 6, P.win.el + P.win.hh + 12, el));
      if (m > 0) {
        const fold = 1 - P.drape.amp + P.drape.amp * Math.cos((dd * 2 * Math.PI) / P.drape.period) * (0.6 + 0.4 * Math.cos((dd * 2 * Math.PI) / 13));
        const dv = P.drape.I * fold * (0.85 + 0.3 * sm(-5, 50, el));
        rr = rr * (1 - m) + m * dv * P.drape.col[0];
        gg = gg * (1 - m) + m * dv * P.drape.col[1];
        bb = bb * (1 - m) + m * dv * P.drape.col[2];
      }
    }
    // Framed print beside the lamp.
    {
      const q = P.print, dq = dAng(th, q.th), de = Math.abs(el - q.el);
      const outer = box(dq, de, q.hw + q.frame, q.hh + q.frame, 1.2), inner = box(dq, de, q.hw, q.hh, 0.8);
      if (outer > 0) {
        const t = (el - (q.el - q.hh)) / (2 * q.hh);
        const pv = q.I * (0.7 + 0.9 * sm(0.35, 0.75, t)) * (0.9 + 0.1 * Math.cos(dq * 0.6));
        const v = inner * pv + (outer - inner) * q.frameI, m = outer;
        rr = rr * (1 - m) + v * q.col[0]; gg = gg * (1 - m) + v * q.col[1]; bb = bb * (1 - m) + v * q.col[2];
      }
    }
    // Dark doorway behind the subject.
    {
      const d = P.door;
      const md = box(dAng(th, (d.th0 + d.th1) / 2), Math.abs(el - (d.el0 + d.el1) / 2), (d.th1 - d.th0) / 2, (d.el1 - d.el0) / 2, d.soft);
      const dI = d.I * (0.75 + 0.5 * sm(d.el0, d.el1, el));
      rr = rr * (1 - md) + md * dI * d.col[0]; gg = gg * (1 - md) + md * dI * d.col[1]; bb = bb * (1 - md) + md * dI * d.col[2];
    }
    r += tHor * rr; g += tHor * gg; b += tHor * bb;
  }
  // Dark walnut sideboard straddling the horizon.
  {
    const c = P.cabinet;
    const m = box(dAng(th, (c.th0 + c.th1) / 2), Math.abs(el - (c.el0 + c.el1) / 2), (c.th1 - c.th0) / 2, (c.el1 - c.el0) / 2, c.soft);
    if (m > 0) {
      const top = 1 + 1.5 * gauss(el - c.el1, 1.2);
      r = r * (1 - m) + m * c.I * top * c.col[0]; g = g * (1 - m) + m * c.I * top * c.col[1]; b = b * (1 - m) + m * c.I * top * c.col[2];
    }
  }
  // Soft table-edge horizon stroke and the dark runner on the camera side.
  {
    const hz = P.horizon, mh = hz.w * gauss(el - hz.el, hz.sig);
    r += (hz.v - r) * mh; g += (hz.v * 0.97 - g) * mh; b += (hz.v * 0.93 - b) * mh;
    const c = P.card, mc = c.w * box(dAng(th, c.th), Math.abs(el - c.el), c.hw, c.hh, c.soft);
    r += (c.v - r) * mc; g += (c.v * 0.97 - g) * mc; b += (c.v * 0.94 - b) * mc;
  }
  // The window: sheer-diffused daylight, brighter toward the top, soft mullions.
  {
    const w = P.win, dE = el - w.el;
    const m = box(dW, Math.abs(dE), w.hw, w.hh, w.soft);
    if (m > 0) {
      let v = w.I * (0.72 + 0.28 * sm(-w.hh, w.hh, dE)) * (0.8 + 0.2 * Math.cos((Math.min(1, dW / w.hw) * Math.PI) / 2));
      const mu = P.mullion;
      const bar = Math.max(1 - sm(mu.w * 0.5, mu.w * 0.5 + 1.2, dW), 1 - sm(mu.w * 0.5, mu.w * 0.5 + 1.2, Math.abs(dE - 4)));
      v *= 1 - mu.depth * bar;
      r = r * (1 - m) + m * v * w.col[0]; g = g * (1 - m) + m * v * w.col[1]; b = b * (1 - m) + m * v * w.col[2];
    }
  }
  // Narrow sheer side window.
  {
    const w = P.win2, m = box(dAng(th, w.th), Math.abs(el - w.el), w.hw, w.hh, w.soft);
    if (m > 0) {
      const v = w.I * (0.7 + 0.3 * sm(-w.hh, w.hh, el - w.el));
      r = r * (1 - m) + m * v * w.col[0]; g = g * (1 - m) + m * v * w.col[1]; b = b * (1 - m) + m * v * w.col[2];
    }
  }
  // Tungsten lamp shade.
  {
    const l = P.lamp, m = box(dL, Math.abs(el - l.el), l.hw, l.hh, 3);
    if (m > 0) {
      const v = l.I * (0.8 + 0.2 * sm(-l.hh, l.hh, el - l.el));
      r += m * v * l.col[0]; g += m * v * l.col[1]; b += m * v * l.col[2];
    }
  }
  out[0] = r; out[1] = g; out[2] = b;
}

/** The room as a linear float equirect (three's mapping: u ↔ θ = atan2(z, x), v ↔ elevation). */
export function roomEquirect(W: number = P.W, H: number = P.H): DataTexture {
  const data = new Float32Array(W * H * 4);
  const px: [number, number, number] = [0, 0, 0];
  for (let y = 0; y < H; y++) {
    const el = ((y + 0.5) / H - 0.5) * 180;
    for (let x = 0; x < W; x++) {
      const th = P.rotation - ((x + 0.5) / W - 0.5) * 360;
      roomRadiance(th, el, px);
      const i = (y * W + x) * 4;
      data[i] = px[0]; data[i + 1] = px[1]; data[i + 2] = px[2]; data[i + 3] = 1;
    }
  }
  const tex = new DataTexture(data, W, H, RGBAFormat, FloatType);
  tex.mapping = EquirectangularReflectionMapping;
  tex.colorSpace = LinearSRGBColorSpace;
  tex.magFilter = tex.minFilter = LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

function prefilteredRoom(renderer: WebGLRenderer): { texture: Texture; dispose(): void } {
  const equirect = roomEquirect();
  const pmrem = new PMREMGenerator(renderer);
  const target = pmrem.fromEquirectangular(equirect); // no depth buffer on this path
  equirect.dispose();
  pmrem.dispose();
  return { texture: target.texture, dispose: () => target.dispose() };
}

/** World direction of a room direction (θ, el in degrees, room coordinates). */
function roomDirection(th: number, el: number): [number, number, number] {
  const t = MathUtils.degToRad(P.rotation - th), e = MathUtils.degToRad(el);
  return [Math.cos(t) * Math.cos(e), Math.sin(e), Math.sin(t) * Math.cos(e)];
}

export default defineRig({
  label: 'neutral-room · Models viewer interior, greige cove',
  stageColor: '#D5D2CD',
  exposure: P.exposure,
  toneMapping: NeutralToneMapping,
  environmentIntensity: 1,
  metalEnvIntensity: 1,
  gobo: false,
  backdrop: { kind: 'sweep', color: P.sweep.color, note: 'neutral greige painted cove' },
  shadows: { filter: 'vogel16', mapSize: 1024, radius: 5, bias: -0.0004, normalBias: 0.012, near: 4, far: 24 },

  build({ renderer, target }) {
    const env = prefilteredRoom(renderer);

    const key = new SpotLight(P.key.color, P.key.intensity, 0, P.key.angle, P.key.penumbra, 0);
    key.name = 'studio_key';
    const [dx, dy, dz] = roomDirection(P.key.th, P.key.el);
    key.position.set(dx * P.key.distance, dy * P.key.distance, dz * P.key.distance);
    key.target = target;

    const sweep = createSweepBackdrop(renderer, {
      color: P.sweep.color,
      roughness: P.sweep.roughness,
      plaster: false,
    });

    return {
      environment: env.texture,
      objects: [key, sweep.mesh],
      shadowKey: key,
      backdrop: sweep.mesh,
      setWall: sweep.setWall,
      setContent(bounds) {
        // The key keeps its direction from the window and follows the content's centre.
        const c = bounds.getCenter(key.position.clone());
        key.position.set(c.x + dx * P.key.distance, c.y + dy * P.key.distance, c.z + dz * P.key.distance);
      },
      setLowDetail(enabled) {
        sweep.setLowDetail(enabled);
      },
      dispose() {
        sweep.dispose();
        env.dispose();
      },
    };
  },
});
