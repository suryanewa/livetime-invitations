import {
  BackSide,
  BufferAttribute,
  Color,
  DirectionalLight,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  NeutralToneMapping,
  PlaneGeometry,
  Scene,
  SphereGeometry,
  SpotLight,
  Vector3,
} from 'three';
import { defineRig, prefilteredEnvironment } from '../rig.ts';
import { createSweepBackdrop } from '../studio.ts';

/**
 * product-studio (studio pass v1.3): a classic three-softbox catalogue set on a white-to-light-grey
 * cyclorama. A large key softbox upper left in front of the set (the real-time soft shadow), a tall
 * fill panel camera right, a rim strip high behind, and black gradient flags either side and on the
 * camera side so chrome, silver, vinyl and glass get dark strokes to read against. The room is a
 * dark studio shell around a bright cyc: what a polished surface facing the camera sees is the
 * studio (dark, with the softboxes in it); what lights the floor and the backdrop is the cyc.
 *
 * World: objects stand on y = 0 around the origin; the camera looks from +z, 20° to the right
 * (+x), 15° up. Camera left = −x. All environment values are linear radiance (toneMapped: false).
 */
export const PRODUCT_STUDIO = {
  exposure: 1,
  env: {
    sigma: 0.012,
    /** Studio shell: dark grey surround, brighter cyc behind and below. */
    shell: { studio: 0.15, cycWall: 0.62, cycFloor: 0.56, ceiling: 0.08 },
    key: { pos: [-6.2, 6.4, 6.2], size: [6.4, 4.6], I: 4.2, edge: 0.55, color: '#FFF8EF' },
    fill: { pos: [8.4, 2.8, 3.2], size: [3.2, 6.4], I: 1.5, edge: 0.6, color: '#F4F7FF' },
    rim: { pos: [0.6, 8.2, -6.2], size: [11, 0.9], I: 3.2, edge: 0.7, color: '#FFFFFF' },
    top: { pos: [-0.6, 10.5, 1.2], size: [7.5, 1.4], I: 1.6, edge: 0.6, color: '#FFFFFF' },
    /** White bounce card low on the camera-left side: a bright lower band on domes and bodies. */
    card: { pos: [-4.2, 0.9, 8.6], size: [4.2, 2.2], I: 0.9, edge: 0.7, color: '#FFFFFF' },
    /** Graduated scrim high in front of the set: a soft gradient on black glass, vinyl and domes. */
    scrim: { pos: [-1.6, 4.6, 9.6], size: [7.5, 3.6], I: 0.7, edge: 0.15, color: '#FFFFFF' },
    /** Black flags: value at the core, value at the edge (gradient), size, position. */
    flags: [
      { pos: [-8.8, 2.8, -1.6], size: [3.0, 6.5], core: 0.004, edge: 0.06 },
      { pos: [6.8, 2.8, -3.8], size: [3.6, 7.5], core: 0.004, edge: 0.05 },
      { pos: [5.6, 1.3, 8.6], size: [5.5, 2.6], core: 0.006, edge: 0.06 },
    ],
  },
  key: { color: '#FFFCF8', intensity: 4.6, position: [-4.4, 8.4, 6.0] as const, angle: 0.72, penumbra: 1 },
  rim: { color: '#FFFFFF', intensity: 0.9, position: [0.8, 7.5, -6] as const },
  fill: { color: '#F2F5FF', intensity: 0.45, position: [7.5, 2.6, 3.4] as const },
  /** Light-grey paper: under the key it renders as the measured #ECE9E4, a step under white. */
  sweep: { color: '#B9B9B7', roughness: 0.92 },
} as const;

type Vec3 = readonly [number, number, number];

/**
 * A rectangular emitter with a soft profile: `I` at the centre, `edge × I` at the rim (a real
 * softbox's diffusion is brighter in the middle), facing `look`. Vertex colours, linear.
 */
function emitter(size: readonly [number, number], pos: Vec3, color: string, I: number, edge: number, look: Vec3 = [0, 0.6, 0], seg = 16): Mesh {
  const g = new PlaneGeometry(size[0], size[1], seg, seg);
  const p = g.attributes.position!;
  const c = new Float32Array(p.count * 3);
  const base = new Color(color);
  for (let i = 0; i < p.count; i++) {
    const u = (p.getX(i) / size[0]) * 2, v = (p.getY(i) / size[1]) * 2;
    // Superellipse falloff: flat core, soft shoulder.
    const r = Math.min(1, Math.pow(Math.pow(Math.abs(u), 4) + Math.pow(Math.abs(v), 4), 0.25));
    const k = I * (1 - (1 - edge) * r * r);
    c[i * 3] = base.r * k;
    c[i * 3 + 1] = base.g * k;
    c[i * 3 + 2] = base.b * k;
  }
  g.setAttribute('color', new BufferAttribute(c, 3));
  const mesh = new Mesh(g, new MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: DoubleSide }));
  mesh.position.set(...pos);
  mesh.lookAt(new Vector3(...look));
  return mesh;
}

/** A black flag: darkest at the core, lifting toward the edges (a gradient flag, not a hole). */
function flag(size: readonly [number, number], pos: Vec3, core: number, edge: number): Mesh {
  const g = new PlaneGeometry(size[0], size[1], 12, 12);
  const p = g.attributes.position!;
  const c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const u = (p.getX(i) / size[0]) * 2, v = (p.getY(i) / size[1]) * 2;
    const r = Math.min(1, Math.max(Math.abs(u), Math.abs(v)));
    const k = core + (edge - core) * r * r;
    c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = k;
  }
  g.setAttribute('color', new BufferAttribute(c, 3));
  const mesh = new Mesh(g, new MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: DoubleSide }));
  mesh.position.set(...pos);
  mesh.lookAt(0, 1, 0);
  return mesh;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * The studio as an environment: a sphere shell coloured by direction. Behind the set (−z) and
 * below the horizon is the lit cyc (white floor curving into the light-grey wall, brighter low
 * where the key falls, greying toward the top); the camera side and the ceiling are the dark
 * studio. Softboxes and flags sit inside it.
 */
function studioRoom(): Scene {
  const P = PRODUCT_STUDIO.env;
  const scene = new Scene();
  const shell = new SphereGeometry(30, 96, 48);
  const p = shell.attributes.position!;
  const c = new Float32Array(p.count * 3);
  const d = new Vector3();
  for (let i = 0; i < p.count; i++) {
    d.set(p.getX(i), p.getY(i), p.getZ(i)).normalize();
    const el = Math.asin(d.y) * (180 / Math.PI);
    // Cyc wall: the half of the room behind the set (z < 0), wrapping a little around the sides.
    const behind = smooth(0.15, -0.35, d.z);
    // Floor: everything below the horizon is the white cyc floor, brightest under the key (−x, +z).
    const below = smooth(2, -4, el);
    const pool = 0.8 + 0.25 * smooth(0.6, -0.6, d.x) * smooth(-0.6, 0.6, d.z);
    const floor = P.shell.cycFloor * pool * (0.75 + 0.25 * smooth(-90, -10, el));
    // The cyc wall greys toward its top (the key falls off), the studio above it is dark.
    const wall = P.shell.cycWall * (1 - 0.45 * smooth(0, 55, el)) * smooth(78, 50, el);
    const ceiling = P.shell.ceiling + 0.04 * smooth(40, 90, el);
    const studio = P.shell.studio * (0.8 + 0.4 * smooth(-10, 40, el));
    const upper = behind * Math.max(wall, studio) + (1 - behind) * (el > 50 ? ceiling : studio);
    const v = below * floor + (1 - below) * upper;
    c[i * 3] = v;
    c[i * 3 + 1] = v;
    c[i * 3 + 2] = v * 0.996;
  }
  shell.setAttribute('color', new BufferAttribute(c, 3));
  scene.add(new Mesh(shell, new MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: BackSide })));

  for (const f of P.flags) scene.add(flag(f.size, f.pos as Vec3, f.core, f.edge));
  for (const e of [P.key, P.fill, P.rim, P.top, P.card, P.scrim]) {
    scene.add(emitter(e.size, e.pos as Vec3, e.color, e.I, e.edge));
  }
  return scene;
}

export default defineRig({
  label: 'product-studio · three softboxes, white cyc, black flags',
  stageColor: '#ECE9E4',
  exposure: PRODUCT_STUDIO.exposure,
  toneMapping: NeutralToneMapping,
  environmentIntensity: 1,
  metalEnvIntensity: 1,
  gobo: false,
  backdrop: { kind: 'sweep', color: PRODUCT_STUDIO.sweep.color, note: 'painted white-to-light-grey cyclorama' },
  shadows: { filter: 'vogel16', mapSize: 2048, radius: 8, bias: -0.0004, normalBias: 0.014, near: 4, far: 22 },

  build({ renderer, target }) {
    const S = PRODUCT_STUDIO;
    const env = prefilteredEnvironment(renderer, studioRoom(), S.env.sigma);

    // Key: the big softbox upper left, in front of the set. A wide penumbra gives the cyc its
    // white-to-grey falloff and the shadow its soft edge.
    const key = new SpotLight(S.key.color, S.key.intensity, 0, S.key.angle, S.key.penumbra, 0);
    key.name = 'product_key';
    key.position.set(...S.key.position);
    key.target = target;

    // Rim: the strip high behind the set, a crisp edge on tops and shoulders.
    const rim = new DirectionalLight(S.rim.color, S.rim.intensity);
    rim.name = 'product_rim';
    rim.position.set(...S.rim.position);
    rim.target = target;

    // Fill: the panel camera right, lifting the shadow side.
    const fill = new DirectionalLight(S.fill.color, S.fill.intensity);
    fill.name = 'product_fill';
    fill.position.set(...S.fill.position);
    fill.target = target;

    const sweep = createSweepBackdrop(renderer, { color: S.sweep.color, roughness: S.sweep.roughness, plaster: false });

    return {
      environment: env.texture,
      objects: [key, rim, fill, sweep.mesh],
      shadowKey: key,
      backdrop: sweep.mesh,
      setWall: sweep.setWall,
      // Low/Static: the Stage drops the 2048² shadow map (the only expensive part of this rig;
      // the scenes' contact shadows keep the objects grounded). The painted cove has no relief, so
      // there is nothing else to drop; the call stays for symmetry with the plaster sweep.
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
