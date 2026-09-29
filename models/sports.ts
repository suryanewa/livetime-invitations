import { type BufferAttribute, type Mesh, type Object3D } from 'three';
import { ContactShadow } from '../src/render/contactShadow.ts';
import { BALL_R, NET, POLE, SPORTS_BOUNDS, SPORTS_NODES, type BallPreset, type NetDeform } from './sportsContract.ts';
import { buildSportsGeometry } from './sportsPremium.ts';
import { collectNodes, disposeGeometry, type BuiltModel, type ModelContext } from './types.ts';

export * from './sportsContract.ts';

/**
 * Sports runtime rig over the hierarchy (built or GLB-loaded): contact shadows, the keyed net
 * deformation and ball presets.
 */

export interface SportsRig {
  root: Object3D;
  nodes: Record<string, Object3D>;
  shadows: ContactShadow[];
  ballShadow: ContactShadow;
  net: NetDeform;
  bounds: typeof SPORTS_BOUNDS;
  setPreset(preset: BallPreset): void;
  dispose(): void;
}

export type SportsModel = SportsRig & BuiltModel;

/**
 * Radial net deformation on the net's own vertices (net space: y = 0 at the rim, negative
 * downward). Lower rows widen with `flare` and the whole net lengthens with `stretch`, so the
 * swish reads without cloth simulation. Works on any net geometry the model provides.
 */
function netDeform(net: Object3D): NetDeform {
  const meshes: { attr: BufferAttribute; base: Float32Array }[] = [];
  net.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    const attr = m.geometry.getAttribute('position') as BufferAttribute;
    meshes.push({ attr, base: new Float32Array(attr.array as Float32Array) });
    m.frustumCulled = false;
  });
  let last = { flare: 0, stretch: 0 };
  return {
    update(flare, stretch) {
      if (flare === last.flare && stretch === last.stretch) return;
      last = { flare, stretch };
      for (const { attr, base } of meshes) {
        const a = attr.array as Float32Array;
        for (let i = 0; i < a.length; i += 3) {
          const x = base[i]!, y = base[i + 1]!, z = base[i + 2]!;
          const d = Math.min(1, Math.max(0, -y / NET.depth));
          const widen = 1 + flare * 0.32 * d ** 1.3;
          a[i] = x * widen;
          a[i + 1] = y * (1 + stretch * 0.3);
          a[i + 2] = z * widen;
        }
        attr.needsUpdate = true;
      }
    },
  };
}

export function rigSports(root: Object3D, lib: ModelContext['lib'], preset: BallPreset = 'orange'): SportsRig {
  const dir = lib.direction;
  const nodes = collectNodes(root, SPORTS_NODES);
  const replace = (name: string, shadow: ContactShadow) => {
    const placeholder = root.getObjectByName(name)!;
    shadow.position.copy(placeholder.position);
    placeholder.parent!.add(shadow);
    placeholder.removeFromParent();
    return shadow;
  };
  const ballShadow = replace('ball_shadow', new ContactShadow({
    name: 'ball_shadow', shape: 'round', width: BALL_R * 2, depth: BALL_R * 2, spread: [1.3, 2.2], opacity: dir.shadow.opacity, line: 0.35, color: dir.shadow.color,
  }));
  const hoopShadow = replace('hoop_shadow', new ContactShadow({
    name: 'hoop_shadow', shape: 'round', width: POLE.baseRadius * 2, depth: POLE.baseRadius * 2, spread: [1.3, 1.5], opacity: dir.shadow.opacity * 0.9, line: 0.4, color: dir.shadow.color,
  }));
  nodes.ball_shadow = ballShadow;
  nodes.hoop_shadow = hoopShadow;

  const setPreset = (next: BallPreset) => {
    const want = lib.get(next === 'orange' ? 'mat_ball_orange' : 'mat_ball_cream');
    nodes.ball_mesh!.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh && (m.material as { name?: string }).name?.startsWith('mat_ball_')) m.material = want;
    });
  };
  setPreset(preset);

  return {
    root,
    nodes,
    shadows: [ballShadow, hoopShadow],
    ballShadow,
    net: netDeform(nodes.net!),
    bounds: SPORTS_BOUNDS.clone(),
    setPreset,
    dispose() {
      ballShadow.dispose();
      hoopShadow.dispose();
    },
  };
}

/** Tooling (lookdev, tests in a browser): geometry and rig in one call. */
export function buildSports(ctx: ModelContext, preset: BallPreset = 'orange'): SportsModel {
  const root = buildSportsGeometry(ctx, preset);
  const rig = rigSports(root, ctx.lib, preset);
  return { ...rig, dispose() { rig.dispose(); disposeGeometry(root); } };
}
