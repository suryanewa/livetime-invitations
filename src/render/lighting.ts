import {
  BackSide,
  BoxGeometry,
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  NeutralToneMapping,
  PlaneGeometry,
  Scene,
} from 'three';
import { prefilteredEnvironment, type Rig } from './rig.ts';

/**
 * Shared studio rig (Master §5): one large soft key from upper left, restrained fill,
 * warm floor bounce, and a prefiltered environment built procedurally — no HDR asset
 * to license or download.
 */
export const LIGHT_RIG = {
  key: { color: '#fff6ec', intensity: 1.9, position: [-3.2, 5.4, 4.2] as const },
  fill: { sky: '#f7f3ee', ground: '#cfc4b3', intensity: 0.9 },
  environmentIntensity: 1,
  env: {
    walls: 0.42,
    floor: 0.85,
    keyPanel: 5,
    fillPanel: 2.0,
    rimStrip: 2.4,
  },
} as const;

function emissive(color: string, intensity: number): MeshBasicMaterial {
  const c = new Color(color).multiplyScalar(intensity);
  return new MeshBasicMaterial({ color: c, side: BackSide, toneMapped: false });
}

function panel(w: number, h: number, intensity: number, color = '#fff8f0'): Mesh {
  const m = new MeshBasicMaterial({ color: new Color(color).multiplyScalar(intensity), toneMapped: false });
  return new Mesh(new PlaneGeometry(w, h), m);
}

/**
 * The softbox room (v1.0–v1.1): warm walls, a large key softbox upper left, a fill panel right
 * and an overhead rim strip, all emissive. Prefilter it with `prefilteredEnvironment`.
 */
export function softboxRoom(): Scene {
  const scene = new Scene();
  const e = LIGHT_RIG.env;
  const room = new Mesh(new BoxGeometry(24, 14, 24), emissive('#d9d2c7', e.walls));
  room.position.y = 5;
  scene.add(room);

  const floor = panel(24, 24, e.floor, '#efe7da');
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.9;
  scene.add(floor);

  // Large softbox, upper left and slightly in front — the broad satin gradient.
  const key = panel(9, 6, e.keyPanel);
  key.position.set(-7, 7.5, 5.5);
  key.lookAt(0, 0.5, 0);
  scene.add(key);

  // Restrained fill from the right.
  const fill = panel(5, 5, e.fillPanel, '#f3f1ee');
  fill.position.set(9, 3, 3);
  fill.lookAt(0, 1, 0);
  scene.add(fill);

  // Thin overhead strip behind the subject: edge highlight on bevels.
  const rim = panel(10, 0.9, e.rimStrip);
  rim.position.set(0, 9, -7);
  rim.lookAt(0, 0, 0);
  scene.add(rim);
  return scene;
}

/**
 * The study rig (checkpoint-1 "L" look, still used by the study and lookdev pages): the softbox
 * room at full intensity, one directional key from upper left and a hemisphere fill, on the
 * flat `STAGE_COLOR` ground, without a backdrop or a shadow map. Not registered as a showcase rig.
 */
export const STUDY_RIG: Rig = {
  name: 'study',
  label: 'Study (checkpoint-1 L)',
  stageColor: '#F4F1EB',
  exposure: 1,
  toneMapping: NeutralToneMapping,
  environmentIntensity: LIGHT_RIG.environmentIntensity,
  gobo: false,
  backdrop: { kind: 'none' },
  shadows: null,
  build({ renderer }) {
    const env = prefilteredEnvironment(renderer, softboxRoom(), 0.035);
    const key = new DirectionalLight(LIGHT_RIG.key.color, LIGHT_RIG.key.intensity);
    key.position.set(...LIGHT_RIG.key.position);
    const fill = new HemisphereLight(LIGHT_RIG.fill.sky, LIGHT_RIG.fill.ground, LIGHT_RIG.fill.intensity);
    return { environment: env.texture, objects: [key, key.target, fill], dispose: env.dispose };
  },
};
