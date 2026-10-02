import {
  BackSide,
  BoxGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  type MeshStandardMaterial,
  NeutralToneMapping,
  PlaneGeometry,
  Scene,
  type Side,
  SpotLight,
} from 'three';
import { defineRig, prefilteredEnvironment } from '../rig.ts';
import { createSweepBackdrop } from '../studio.ts';

/**
 * livetime-warm (studio pass v1.3): the Livetime peach plaster identity, lit like a room.
 *
 * A tall daylight window camera-left is the key: in the environment it is a bright, mullioned
 * shape the metals reflect, and in the real-time light it is a broad, soft spot (no gobo) that
 * casts the shadow. An overcast skylight strip overhead gives crowns and rims a highlight; a
 * warm-white plaster room and a sunlit peach floor give the bounce; a camera-side linen panel lifts
 * the fronts, a sheer glass door gives the reader's black glass a sheen, and dark walnut strokes
 * (a sideboard, a tall cabinet behind, a low table edge round the room) give
 * chrome, silver, vinyl and glass the contrast they need to read as reflective. Everything is
 * procedural (emissive meshes, PMREM'd once at sigma 0 so the light shapes stay crisp).
 *
 * World axes: the camera looks from +z, 20° to +x, 15° up; "camera left" is −x.
 */
export const WARM = {
  exposure: 1,
  key: { color: '#FFF7EE', intensity: 3.0, position: [-6.2, 7.4, 5.6] as const, angle: 0.62, penumbra: 1 },
  /** Cool overcast sky over a warm sunlit floor (the floor bounce). */
  fill: { sky: '#E6ECF2', ground: '#E8C9A6', intensity: 0.18 },
  /** Warm bounce from the floor onto the objects' undersides (lights nothing facing up). */
  bounce: { color: '#FFD9B3', intensity: 0.22, position: [1.5, -2, 3] as const },
  sweep: { color: '#F0DCC6', roughness: 0.92 },
  env: {
    walls: { color: '#EFE6DC', intensity: 0.5 },
    ceiling: { color: '#F4F3F0', intensity: 0.85 },
    floor: { color: '#F1DCC6', intensity: 0.6 },
    window: { color: '#F4F8FF', top: 3.2, bottom: 2.3 },
    skylight: { color: '#F7F7F5', intensity: 2.0 },
    linen: { color: '#FBF4EC', intensity: 1.0 },
    door: { color: '#F6F8FB', top: 2.4, bottom: 0.9 },
    lamp: { color: '#FFCF9E', intensity: 2.4 },
    /** Dark strokes, linear radiance (never black: a walnut piece in a lit room, ≈ 0.05). */
    walnut: { color: '#B08870', intensity: 0.13 },
  },
} as const;

function lin(color: string, intensity: number): Color {
  return new Color(color).multiplyScalar(intensity);
}

function basic(color: Color, side: Side = DoubleSide): MeshBasicMaterial {
  return new MeshBasicMaterial({ color, side, toneMapped: false });
}

/** A flat emissive panel facing `look`. */
function panel(w: number, h: number, color: Color, pos: readonly [number, number, number], look: readonly [number, number, number] = [0, 1, 0]): Mesh {
  const m = new Mesh(new PlaneGeometry(w, h), basic(color));
  m.position.set(...pos);
  m.lookAt(...look);
  return m;
}

/** A panel graded bottom → top (vertex colours): sky brighter at the top of the window. */
function gradedPanel(w: number, h: number, bottom: Color, top: Color, pos: readonly [number, number, number], look: readonly [number, number, number]): Mesh {
  const g = new PlaneGeometry(w, h, 1, 6);
  const p = g.getAttribute('position');
  const colors: number[] = [];
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) + h / 2) / h;
    const c = bottom.clone().lerp(top, t);
    colors.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new Float32BufferAttribute(colors, 3));
  const m = new Mesh(g, new MeshBasicMaterial({ vertexColors: true, side: DoubleSide, toneMapped: false }));
  m.position.set(...pos);
  m.lookAt(...look);
  return m;
}

/**
 * The warm daylit room, as emissive meshes around the stage origin (the PMREM camera sits at
 * the origin, 1.9 above the floor plane of the room).
 */
export function warmRoom(): Scene {
  const e = WARM.env;
  const scene = new Scene();
  // Shell: plaster walls, an overcast-lit ceiling, a sunlit warm floor. Box face order +x −x +y −y +z −z.
  const wall = basic(lin(e.walls.color, e.walls.intensity), BackSide);
  const shell = new Mesh(new BoxGeometry(26, 14, 26), [
    wall,
    wall,
    basic(lin(e.ceiling.color, e.ceiling.intensity), BackSide),
    basic(lin(e.floor.color, e.floor.intensity), BackSide),
    wall,
    wall,
  ]);
  shell.position.y = 5.1;
  scene.add(shell);

  // The window, camera-left and a little in front: four tall sheer-lit panes with mullions
  // (the wall shows between them), brighter towards the sky. The key's direction.
  const target = [0, 0.6, 0] as const;
  const win = { cx: -12.8, cy: 5.2, cz: 3.2, pane: [2.3, 3.6] as const, gap: 0.32 };
  for (let col = 0; col < 2; col++) {
    for (let row = 0; row < 2; row++) {
      const z = win.cz + (col - 0.5) * (win.pane[0] + win.gap);
      const y = win.cy + (row - 0.5) * (win.pane[1] + win.gap);
      const lo = e.window.bottom + (e.window.top - e.window.bottom) * row * 0.5;
      const hi = e.window.bottom + (e.window.top - e.window.bottom) * (0.5 + row * 0.5);
      const pane = gradedPanel(win.pane[0], win.pane[1], lin(e.window.color, lo), lin(e.window.color, hi), [win.cx, y, z], [0, y, z]);
      scene.add(pane);
    }
  }
  // Sheer daylight glow on the floor under the window (the sunlit patch the room bounces).
  const pool = panel(7, 6, lin('#FFE6C8', 0.95), [-7.5, -1.88, 2.6], [-7.5, 5, 2.6]);
  scene.add(pool);

  // Overcast skylight strip overhead, slightly behind: the graded highlight on crowns and rims.
  scene.add(panel(11, 1.4, lin(e.skylight.color, e.skylight.intensity), [0.5, 11.9, -2.5], [0.5, 0, -2.5]));

  // Camera-side linen panel behind the camera, high: the soft front fill that fronts reflect.
  scene.add(panel(9, 5, lin(e.linen.color, e.linen.intensity), [5.5, 4.6, 12.8], target));

  // A sheer glass door behind the camera, left of it, graded (sky at the top). The reader's black
  // glass faces +z and, seen from the camera, mirrors az −16°, el +5° (±6° across the face,
  // probed): the door's right jamb runs just right of that point, so the face carries a soft
  // vertical sheen on its left, as a real glass face would, instead of a flat black.
  scene.add(gradedPanel(4.2, 7.4, lin(e.door.color, e.door.bottom), lin(e.door.color, e.door.top), [-5.4, 2.8, 12.8], [-5.4, 2.8, 0]));

  // A warm table lamp, right and behind: a small warm glint on chrome.
  scene.add(panel(1.6, 1.2, lin(e.lamp.color, e.lamp.intensity), [10.5, 2.1, -9], target));

  // Dark strokes for metal contrast: a walnut sideboard camera-right, a tall cabinet behind left, and
  // a soft low table edge running round the room just under the horizon.
  scene.add(panel(9, 2.6, lin(e.walnut.color, e.walnut.intensity), [12.8, -0.4, 4.5], [0, -0.4, 4.5]));
  scene.add(panel(3.4, 7.5, lin(e.walnut.color, e.walnut.intensity * 0.9), [-6.5, 1.8, -12.8], [-6.5, 1.8, 0]));
  const edge = new Mesh(new CylinderGeometry(11.5, 11.5, 0.7, 48, 1, true), basic(lin(e.walnut.color, e.walnut.intensity * 1.2), BackSide));
  edge.position.y = -1.25;
  scene.add(edge);
  return scene;
}

export default defineRig({
  label: 'livetime-warm · daylight window, peach plaster cove',
  stageColor: '#F6DDC3',
  exposure: WARM.exposure,
  toneMapping: NeutralToneMapping,
  environmentIntensity: 1,
  metalEnvIntensity: 1,
  gobo: false,
  backdrop: { kind: 'sweep', color: WARM.sweep.color, note: 'peach limewash plaster cove under a daylight window' },
  shadows: { filter: 'vogel16', mapSize: 1024, radius: 9, bias: -0.0004, normalBias: 0.014, near: 5, far: 22 },

  build({ renderer, target }) {
    const env = prefilteredEnvironment(renderer, warmRoom(), 0);

    const key = new SpotLight(WARM.key.color, WARM.key.intensity, 0, WARM.key.angle, WARM.key.penumbra, 0);
    key.name = 'warm_window_key';
    key.position.set(...WARM.key.position);
    key.target = target;
    const fill = new HemisphereLight(WARM.fill.sky, WARM.fill.ground, WARM.fill.intensity);
    const bounce = new DirectionalLight(WARM.bounce.color, WARM.bounce.intensity);
    bounce.position.set(...WARM.bounce.position);
    bounce.target = target;

    const sweep = createSweepBackdrop(renderer, { color: WARM.sweep.color, roughness: WARM.sweep.roughness, plaster: true, normalScale: 0.18 });
    // A cleaner painted plaster: keep a whisper of trowel relief, drop the cloudy albedo mottle
    // (under a soft window it read as stains at stage size).
    (sweep.mesh.material as MeshStandardMaterial).map = null;
    return {
      environment: env.texture,
      objects: [key, fill, bounce, sweep.mesh],
      shadowKey: key,
      backdrop: sweep.mesh,
      setWall: sweep.setWall,
      setContent(_bounds, scale = 1) {
        // v1.4: the set scales with the scene (rig.ts setWall), the lights' places with it.
        key.position.set(...WARM.key.position).multiplyScalar(scale);
        bounce.position.set(...WARM.bounce.position).multiplyScalar(scale);
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
