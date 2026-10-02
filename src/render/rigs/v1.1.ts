import { DirectionalLight, HemisphereLight, NeutralToneMapping, SpotLight, type Texture } from 'three';
import { LIGHT_RIG, softboxRoom } from '../lighting.ts';
import { defineRig, prefilteredEnvironment } from '../rig.ts';
import { createSweepBackdrop, downsampledCookie, foliageCookie } from '../studio.ts';

/**
 * v1.1 premium studio (style-reference v1.1, the baseline every new rig is compared with):
 * late-afternoon sun through palms on a peach limewash plaster cove. A warm spot key with a
 * palm-frond gobo and 16-tap soft shadows, the checkpoint-1 hemisphere fill kept, a cool sky
 * fill and a warm bounce, over the softbox room at 0.52 environment intensity.
 */
export const V1_1 = {
  key: { color: '#FFF1DE', intensity: 15, position: [-4.2, 7.8, 5.4] as const, angle: 0.6, penumbra: 0.7, decay: 0 },
  fill: { sky: '#E3E9EF', ground: '#D6C7B2', intensity: 0.3 },
  bounce: { color: '#FFE8D2', intensity: 0.14, position: [3, 1.2, 4] as const },
  sweep: { color: '#EAE3D6', roughness: 0.93 },
} as const;

export default defineRig({
  label: 'v1.1 · sun through palms, plaster cove',
  // What the plaster renders as behind the objects (the v1.1 `--lt-stage` token).
  stageColor: '#F8E4C8',
  exposure: 1,
  toneMapping: NeutralToneMapping,
  environmentIntensity: 0.52,
  gobo: true,
  backdrop: { kind: 'sweep', color: V1_1.sweep.color, note: 'limewash plaster cove' },
  shadows: { filter: 'vogel16', mapSize: 1024, radius: 6, bias: -0.0004, normalBias: 0.012, near: 4, far: 20 },

  build({ renderer, target }) {
    // Environment: the checkpoint-1 softbox room, blurred.
    const env = prefilteredEnvironment(renderer, softboxRoom(), 0.035);

    // Lights. The checkpoint-1 hemisphere fill stays under the premium set (part of the look).
    const baseFill = new HemisphereLight(LIGHT_RIG.fill.sky, LIGHT_RIG.fill.ground, LIGHT_RIG.fill.intensity);
    const key = new SpotLight(V1_1.key.color, V1_1.key.intensity, 0, V1_1.key.angle, V1_1.key.penumbra, V1_1.key.decay);
    key.name = 'studio_key';
    key.position.set(...V1_1.key.position);
    key.target = target;
    // Gobo: the sun-through-palms cookie projected by the key.
    const cookie = foliageCookie();
    key.map = cookie;
    const fill = new HemisphereLight(V1_1.fill.sky, V1_1.fill.ground, V1_1.fill.intensity);
    const bounce = new DirectionalLight(V1_1.bounce.color, V1_1.bounce.intensity);
    bounce.position.set(...V1_1.bounce.position);

    // Backdrop: the plaster cove.
    const sweep = createSweepBackdrop(renderer, { color: V1_1.sweep.color, roughness: V1_1.sweep.roughness, plaster: true });

    let lowCookie: Texture | null = null;
    let lowDetail = false;
    return {
      environment: env.texture,
      objects: [baseFill, key, fill, bounce, sweep.mesh],
      shadowKey: key,
      backdrop: sweep.mesh,
      setWall: sweep.setWall,
      setContent(_bounds, scale = 1) {
        // v1.4: the set scales with the scene (rig.ts setWall), the lights' places with it.
        key.position.set(...V1_1.key.position).multiplyScalar(scale);
        bounce.position.set(...V1_1.bounce.position).multiplyScalar(scale);
      },
      setLowDetail(enabled) {
        if (enabled === lowDetail) return;
        lowDetail = enabled;
        sweep.setLowDetail(enabled);
        // Low keeps the dappled sun at 192² (0.14 MiB instead of 2.25): the cookie also dims and
        // warms the key on every object, so dropping it would brighten and cool the whole scene.
        lowCookie ??= downsampledCookie(cookie, 192);
        key.map = enabled ? lowCookie : cookie;
        // The canvases stay, so each map uploads again when it returns.
        if (enabled) cookie.dispose();
        else lowCookie.dispose();
      },
      dispose() {
        cookie.dispose();
        lowCookie?.dispose();
        sweep.dispose();
        env.dispose();
      },
    };
  },
});
