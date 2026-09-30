import {
  BackSide,
  BoxGeometry,
  Color,
  type ColorSpace,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  type PixelFormat,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  type Texture,
  type WebGLRenderer,
  WebGLRenderTarget,
} from 'three';

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

function buildEnvironmentScene(): Scene {
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
 * The PMREM target keeps the depth renderbuffer the room was rendered with (3 MiB at 768×1024),
 * needed only while generating. Copy the prefiltered texture, texel for texel, into a depth-less
 * target of the same size, type and filters, and free the original. A driver that refuses the
 * half-float copy keeps the original (and its depth buffer) rather than a blank environment.
 */
function withoutDepth(renderer: WebGLRenderer, generated: WebGLRenderTarget): WebGLRenderTarget {
  const gl = renderer.getContext();
  // Clear errors raised earlier, so the check below sees only the copy's.
  for (let i = 0; i < 8; i++) if (gl.getError() === gl.NO_ERROR) break;
  const src = generated.texture;
  const copy = new WebGLRenderTarget(generated.width, generated.height, {
    type: src.type,
    format: src.format as PixelFormat,
    colorSpace: src.colorSpace as ColorSpace,
    minFilter: src.minFilter,
    magFilter: src.magFilter,
    generateMipmaps: false,
    depthBuffer: false,
  });
  copy.texture.mapping = src.mapping;
  copy.texture.name = src.name;
  renderer.initRenderTarget(copy);
  renderer.copyTextureToTexture(src, copy.texture);
  if (gl.getError() !== gl.NO_ERROR) {
    copy.dispose();
    return generated;
  }
  generated.dispose();
  return copy;
}

export interface StudioRig {
  environment: Texture;
  lights: [DirectionalLight, HemisphereLight];
  dispose(): void;
}

export function createStudioRig(renderer: WebGLRenderer, scene: Scene): StudioRig {
  const pmrem = new PMREMGenerator(renderer);
  const envScene = buildEnvironmentScene();
  const generated = pmrem.fromScene(envScene, 0.035);
  envScene.traverse((o) => {
    if (o instanceof Mesh) {
      o.geometry.dispose();
      (o.material as MeshBasicMaterial).dispose();
    }
  });
  pmrem.dispose();
  const target = withoutDepth(renderer, generated);

  const key = new DirectionalLight(LIGHT_RIG.key.color, LIGHT_RIG.key.intensity);
  key.position.set(...LIGHT_RIG.key.position);
  const fill = new HemisphereLight(LIGHT_RIG.fill.sky, LIGHT_RIG.fill.ground, LIGHT_RIG.fill.intensity);

  scene.environment = target.texture;
  scene.environmentIntensity = LIGHT_RIG.environmentIntensity;
  scene.add(key, key.target, fill);

  return {
    environment: target.texture,
    lights: [key, fill],
    dispose() {
      scene.remove(key, key.target, fill);
      if (scene.environment === target.texture) scene.environment = null;
      target.dispose();
    },
  };
}
