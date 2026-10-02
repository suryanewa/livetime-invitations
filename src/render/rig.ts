import {
  type Box3,
  type ColorSpace,
  type DirectionalLight,
  type SpotLight,
  Mesh,
  type Material,
  type Object3D,
  type PixelFormat,
  PMREMGenerator,
  type Scene,
  type Texture,
  type ToneMapping,
  type WebGLRenderer,
  WebGLRenderTarget,
} from 'three';

/**
 * Studio rig contract (studio pass, v1.3). A rig is everything about the light a scene is shown
 * in: the prefiltered environment, the lights, the backdrop, exposure and tone mapping, the
 * shadow filter, an optional gobo, and the stage colour the interface paints around the canvas.
 * The Stage owns lifecycle and the content; a rig never touches the scene's objects.
 *
 * A rig is one file in src/render/rigs/ (`export default defineRig({ ... })`); the registry
 * (rigRegistry.ts) finds it by file name. See src/render/rigs/README.md.
 */

export interface RigContext {
  renderer: WebGLRenderer;
  /** Read-only: the rig returns its objects instead of adding them. */
  scene: Scene;
  /**
   * Follows the centre of the content's motion bounds (the Stage moves it on every setContent).
   * Aim spot and directional lights at it (`light.target = ctx.target`).
   */
  target: Object3D;
}

/**
 * Shadow filter. `vogel16` is v1.1's noise-free 16-tap PCF (it patches three's PCF shader chunk
 * for the whole page, so a `pcf` rig loaded after it on the same page filters the same way);
 * `pcf` is three's 5-tap noisy PCF; `vsm` is variance shadow maps (receivers also cast).
 */
export type RigShadowFilter = 'vogel16' | 'pcf' | 'vsm';

export interface RigShadows {
  filter: RigShadowFilter;
  mapSize: number;
  /** Blur radius in shadow-map texels. */
  radius: number;
  bias: number;
  normalBias: number;
  /** Shadow camera range (spot/directional); keep it tight around the stage for depth precision. */
  near?: number;
  far?: number;
}

export interface RigBuild {
  /** Prefiltered (PMREM) environment: reflections and image-based light. Null = none. */
  environment: Texture | null;
  /** Lights, light targets and backdrop meshes. The Stage adds them and removes them on dispose. */
  objects: Object3D[];
  /** The light that casts the real-time shadow (the Stage applies `shadows` to it). */
  shadowKey?: SpotLight | DirectionalLight | null;
  /** The backdrop mesh (receives shadows; hidden by nothing). */
  backdrop?: Mesh | null;
  /**
   * Optional extra work when the tier changes shadows (the Stage already toggles the shadow
   * map and the key's castShadow and frees the depth target).
   */
  setShadows?(enabled: boolean): void;
  /** Low/Static tier: drop expensive detail (gobo resolution, backdrop relief); reversible. */
  setLowDetail?(enabled: boolean): void;
  /**
   * Move the backdrop wall back for scenes whose motion reaches far back (`scene.studio.wallZ`, in
   * the scene's own units), and scale the set to the scene: `scale` is the scene's world scale
   * (v1.4, models/worldScale.ts; 1 unless the scene's root carries one). A photographer sizes the
   * set to the subject, so the cove, like the key's throw, scales with it: the badge is shot on a
   * small cove close to the light, the hoop on a large one, and every scene keeps one look.
   */
  setWall?(wallZ?: number, scale?: number): void;
  /**
   * The content's motion bounds (world space), on every setContent and setBounds, after
   * `ctx.target` has moved to their centre. Use it to size what depends on the scene's extent:
   * a DirectionalLight key's orthographic shadow camera (left/right/top/bottom, then
   * `shadow.camera.updateProjectionMatrix()`), a backdrop's reach. The scenes differ in size
   * (Business is tall, Sports wide and deep). `scale` is the scene's world scale (see setWall):
   * a key that follows the content keeps its throw in proportion (distance × scale).
   */
  setContent?(bounds: Box3, scale?: number): void;
  /** Free everything the build allocated (environment target, textures, geometries, materials). */
  dispose(): void;
}

export interface RigDefinition {
  /** Human label for the comparison sheets. */
  label: string;
  /**
   * The rendered backdrop colour, measured with `pnpm capture stagecolor <baseUrl> <rig>` (mean
   * sRGB of the central 20 % of the empty stage). It is the scene background behind anything the
   * backdrop does not cover, and what the interface tokens (`--lt-stage`, poster fill) must match.
   */
  stageColor: string;
  /** renderer.toneMappingExposure. */
  exposure: number;
  /** renderer.toneMapping (three's NeutralToneMapping is the product's pipeline). */
  toneMapping: ToneMapping;
  /** scene.environmentIntensity (1.0 = physically plausible; v1.1 used 0.52). */
  environmentIntensity: number;
  /**
   * envMapIntensity for the materials that carry their own environment map (`userData.ownEnv`:
   * polished and imported metals, which `scene.environmentIntensity` does not reach). Omitted,
   * they keep their material values (recipe `ownEnv`: Dinner silver 0.8, dome 0.9, gilt, chrome,
   * hoop steel and the cloche 1.1; Low tier 0.8), the compensations v1.1 was tuned with. Set it
   * (1.0 for a physically plausible rig) and the Stage applies it to every ownEnv material on
   * every tier, so the metals see the same environment strength as everything else.
   */
  metalEnvIntensity?: number;
  /** Declared for the comparison: does the key project a cookie (gobo)? */
  gobo: boolean;
  /** Declared for the comparison: what the backdrop is. */
  backdrop: { kind: 'sweep' | 'table' | 'custom'; color?: string; note?: string } | { kind: 'none' };
  /** Real-time shadow from `build().shadowKey`; null = no shadow map (contact shadows only). */
  shadows: RigShadows | null;
  build(ctx: RigContext): RigBuild;
}

export interface Rig extends RigDefinition {
  /** The file name in src/render/rigs/ (`v1.1.ts` → `v1.1`); set by the registry. */
  readonly name: string;
}

/** Identity helper so a rig file gets type checking without importing the Rig type by hand. */
export function defineRig(definition: RigDefinition): RigDefinition {
  return definition;
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

/**
 * Environment builder: prefilter a procedural room (emissive meshes; no downloads) into a PMREM
 * texture. The room's geometries and materials are freed here; call `dispose` from the rig's
 * own dispose. `sigma` blurs the whole room (0.035 is v1.1's); 0 keeps light shapes crisp.
 */
export function prefilteredEnvironment(renderer: WebGLRenderer, room: Scene, sigma = 0): { texture: Texture; dispose(): void } {
  const pmrem = new PMREMGenerator(renderer);
  const generated = pmrem.fromScene(room, sigma);
  room.traverse((o) => {
    if (o instanceof Mesh) {
      o.geometry.dispose();
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        (m as Material).dispose();
        for (const v of Object.values(m)) if (v && (v as Texture).isTexture) (v as Texture).dispose();
      }
    }
  });
  pmrem.dispose();
  const target = withoutDepth(renderer, generated);
  return { texture: target.texture, dispose: () => target.dispose() };
}
