import { MeshBasicMaterial, type Mesh, type Object3D } from 'three';

/**
 * Shadow proxies (fidelity v1.1 draw budget). Dense decorative meshes (piped frosting, glaze,
 * pearls) set `userData.noShadowCast`; a low-poly stand-in with `userData.shadowProxy` casts
 * their shadow instead. The proxy writes no colour or depth in the main pass, so it is
 * invisible, while the shadow pass renders it with the usual depth material. Flags travel in
 * the GLB as extras; `applyShadowProxies` re-applies the proxy material after loading.
 */

let shared: MeshBasicMaterial | null = null;

export function shadowProxyMaterial(): MeshBasicMaterial {
  if (!shared) {
    shared = new MeshBasicMaterial({ name: 'fx_shadow_proxy', colorWrite: false, depthWrite: false });
  }
  return shared;
}

export function markShadowProxy(mesh: Mesh): Mesh {
  mesh.userData.shadowProxy = true;
  mesh.material = shadowProxyMaterial();
  mesh.renderOrder = -1;
  return mesh;
}

export function markNoShadowCast(...meshes: Object3D[]): void {
  for (const m of meshes) m.userData.noShadowCast = true;
}

export function applyShadowProxies(root: Object3D): void {
  root.traverse((o) => {
    const m = o as Mesh;
    if (m.isMesh && m.userData.shadowProxy) {
      m.material = shadowProxyMaterial();
      m.renderOrder = -1;
    }
  });
}
