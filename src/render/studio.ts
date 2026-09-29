import {
  BufferAttribute,
  CanvasTexture,
  Color,
  DirectionalLight,
  HemisphereLight,
  LinearFilter,
  Mesh,
  MeshStandardMaterial,
  NoColorSpace,
  Object3D,
  PCFShadowMap,
  ShaderChunk,
  PlaneGeometry,
  RepeatWrapping,
  type Scene,
  SpotLight,
  SRGBColorSpace,
  type Texture,
  type WebGLRenderer,
} from 'three';

/**
 * Premium studio (fidelity pass): a sunlit key with a soft-edged foliage gobo, a seamless
 * paper sweep that receives real soft shadows, and a quiet hemisphere fill. Everything is
 * procedural (no HDRI, no downloads). Low tier drops the shadowed key for the contact-shadow
 * rig; camera, silhouette and timing are unchanged.
 */

export const STUDIO = {
  key: { color: '#fff6ec', intensity: 13, position: [-4.2, 7.8, 5.4] as const, angle: 0.6, penumbra: 0.7, decay: 0 },
  fill: { sky: '#f4f2ee', ground: '#cfc6b8', intensity: 0.42 },
  bounce: { color: '#fff1e2', intensity: 0.14, position: [3, 1.2, 4] as const },
  sweep: { color: '#E4DDD1', roughness: 0.95 },
  shadow: { mapSize: 1024, radius: 6, bias: -0.0004, normalBias: 0.012 },
} as const;

/** Soft foliage shadow cookie: overlapping palm-like fronds, blurred, mostly open light. */
export function foliageCookie(size = 512): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  // Deterministic pseudo-random fronds so every render (and poster) matches.
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  ctx.filter = `blur(${Math.max(2, Math.round(size / 260))}px)`;
  ctx.fillStyle = 'rgba(40, 32, 26, 0.72)';
  const frond = (cx: number, cy: number, len: number, angle: number) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    for (let i = 0; i < 14; i++) {
      const t = i / 14;
      const leafLen = len * (0.35 + 0.3 * Math.sin(Math.PI * t));
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(t * len, 0);
        ctx.rotate(side * (0.5 + 0.25 * rand()));
        ctx.beginPath();
        ctx.ellipse(leafLen / 2, 0, leafLen / 2, len * 0.018, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.lineWidth = len * 0.01;
    ctx.strokeStyle = 'rgba(40, 32, 26, 0.65)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(len, 0);
    ctx.stroke();
    ctx.restore();
  };
  // Fronds enter from the frame edges so the centre (the objects) stays mostly open light.
  frond(size * -0.04, size * 0.1, size * 0.55, 0.3);
  frond(size * 1.04, size * 0.04, size * 0.5, 2.55);
  frond(size * 1.02, size * 0.9, size * 0.42, 3.7);
  frond(size * 0.05, size * 0.98, size * 0.4, -0.85);
  frond(size * 0.5, size * -0.06, size * 0.36, 1.75);
  ctx.filter = 'none';
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.minFilter = LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

/** Fine paper tooth for the sweep: a very low-amplitude normal map. */
function paperNormal(size = 256): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  let seed = 11;
  const rand = () => ((seed = (seed * 48271) % 2147483647) / 2147483647);
  const h = new Float32Array(size * size).map(() => rand());
  // Two box-blur passes give a soft, fibrous tooth.
  for (let pass = 0; pass < 2; pass++) {
    const out = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let s = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += h[((y + dy + size) % size) * size + ((x + dx + size) % size)]!;
        out[y * size + x] = s / 9;
      }
    }
    h.set(out);
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (h[y * size + ((x + 1) % size)]! - h[y * size + ((x - 1 + size) % size)]!) * 2.2;
      const dy = (h[((y + 1) % size) * size + x]! - h[((y - 1 + size) % size) * size + x]!) * 2.2;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      img.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = NoColorSpace;
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.repeat.set(10, 10);
  return tex;
}

/**
 * Seamless cove sweep: floor that curves up into a back wall, so objects sit in a real
 * space and their shadows (and the gobo) land on something.
 */
export function createSweep(color: string = STUDIO.sweep.color): Mesh {
  const width = 16, depth = 7, height = 8, radius = 1.6, segs = 24;
  // Profile in (z, y): front edge → floor → cove arc → wall top.
  const profile: [number, number][] = [];
  // Wall far enough back that the cove never swallows a tray or scanner (objects reach z ≈ −1.2).
  const wallZ = -3.2;
  profile.push([depth, 0], [wallZ + radius, 0]);
  for (let i = 1; i < segs; i++) {
    const a = (i / segs) * (Math.PI / 2);
    profile.push([wallZ + radius - Math.sin(a) * radius, radius - Math.cos(a) * radius]);
  }
  profile.push([wallZ, radius], [wallZ, height]);
  const cols = 2;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  let run = 0;
  for (let r = 0; r < profile.length; r++) {
    if (r > 0) run += Math.hypot(profile[r]![0] - profile[r - 1]![0], profile[r]![1] - profile[r - 1]![1]);
    for (let c = 0; c < cols; c++) {
      const x = (c / (cols - 1) - 0.5) * width;
      pos.push(x, profile[r]![1], profile[r]![0]);
      uv.push(x / 4, run / 4);
    }
  }
  for (let r = 0; r < profile.length - 1; r++) {
    const a = r * cols, b = a + cols;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const g = new PlaneGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new MeshStandardMaterial({ name: 'mat_sweep', color: new Color(color), roughness: STUDIO.sweep.roughness, metalness: 0, normalMap: paperNormal() });
  m.normalScale.set(0.35, 0.35);
  const mesh = new Mesh(g, m);
  mesh.name = 'studio_sweep';
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * three's PCF rotates 5 taps per pixel with interleaved gradient noise, which dithers wide
 * penumbrae. Swap it (spot/directional path only) for 16 fixed Vogel taps, each a hardware
 * bilinear compare: smooth, noise-free soft shadows, and unlike VSM no extra draw calls.
 */
let pcfPatched = false;
function smoothPcf(): void {
  if (pcfPatched) return;
  pcfPatched = true;
  const noisy = /float phi = interleavedGradientNoise\( gl_FragCoord\.xy \) \* PI2;\s*shadow = \([\s\S]*?\) \* 0\.2;/;
  const chunk = ShaderChunk.shadowmap_pars_fragment;
  if (!noisy.test(chunk)) {
    if (import.meta.env?.DEV) console.warn('studio: PCF chunk changed; keeping three default filtering');
    return;
  }
  ShaderChunk.shadowmap_pars_fragment = chunk.replace(
    noisy,
    `shadow = 0.0;
				for ( int i = 0; i < 16; i ++ ) {
					shadow += texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( i, 16, 0.0 ) * radius, shadowCoord.z ) );
				}
				shadow *= 0.0625;`,
  );
}

export interface PremiumStudio {
  key: SpotLight;
  sweep: Mesh;
  /** Shadows and gobo on (Normal/High) or off (Low/Static). */
  setShadows(enabled: boolean): void;
  dispose(): void;
}

/** Add the premium key/fill/sweep to a scene that already has the PMREM environment. */
export function createPremiumStudio(renderer: WebGLRenderer, scene: Scene, target: Object3D): PremiumStudio {
  smoothPcf();
  renderer.shadowMap.type = PCFShadowMap;
  const key = new SpotLight(STUDIO.key.color, STUDIO.key.intensity, 0, STUDIO.key.angle, STUDIO.key.penumbra, STUDIO.key.decay);
  key.name = 'studio_key';
  key.position.set(...STUDIO.key.position);
  key.target = target;
  key.map = foliageCookie();
  key.castShadow = true;
  key.shadow.mapSize.set(STUDIO.shadow.mapSize, STUDIO.shadow.mapSize);
  key.shadow.radius = STUDIO.shadow.radius;
  key.shadow.bias = STUDIO.shadow.bias;
  key.shadow.normalBias = STUDIO.shadow.normalBias;
  key.shadow.camera.near = 4;
  key.shadow.camera.far = 20;

  const fill = new HemisphereLight(STUDIO.fill.sky, STUDIO.fill.ground, STUDIO.fill.intensity);
  const bounce = new DirectionalLight(STUDIO.bounce.color, STUDIO.bounce.intensity);
  bounce.position.set(...STUDIO.bounce.position);
  const sweep = createSweep();
  scene.add(key, fill, bounce, sweep);

  const setShadows = (enabled: boolean) => {
    renderer.shadowMap.enabled = enabled;
    key.castShadow = enabled;
    renderer.shadowMap.needsUpdate = true;
  };
  setShadows(true);

  return {
    key,
    sweep,
    setShadows,
    dispose() {
      scene.remove(key, fill, bounce, sweep);
      key.map?.dispose();
      key.shadow.map?.dispose();
      sweep.geometry.dispose();
      const m = sweep.material as MeshStandardMaterial;
      m.normalMap?.dispose();
      m.dispose();
    },
  };
}
