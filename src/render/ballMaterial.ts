import { Color, type Material, MeshPhysicalMaterial } from 'three';
import type { SurfaceSpec } from './materials.ts';

/**
 * Basketball surface (Sports, L2): pebbled leather with seams drawn in the shader so they stay
 * crisp and alias-free while the ball spins. STAND-IN: a plain sheened physical material; the
 * premium build replaces the body of this function, never its signature.
 */
export function ballMaterial(name: string, spec: SurfaceSpec): Material {
  const m = new MeshPhysicalMaterial({ name, color: new Color(spec.color), roughness: spec.roughness, metalness: 0 });
  if (spec.sheen) {
    m.sheen = spec.sheen;
    m.sheenColor = new Color(spec.sheenColor ?? '#ffffff');
    m.sheenRoughness = 0.6;
  }
  return m;
}
