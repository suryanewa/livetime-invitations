import { type Box3, type Material, type Mesh, MeshStandardMaterial, type Object3D } from 'three';
import { ContactShadow } from '../src/render/contactShadow.ts';
import { PARTY_BOUNDS, PARTY_NODES, PLAYER, RECORD, type RecordLabel } from './recordContract.ts';
import { buildRecordPlayerGeometry } from './recordPremium.ts';
import { collectNodes, disposeGeometry, type BuiltModel, type ModelContext } from './types.ts';

export * from './recordContract.ts';

export interface RecordPlayerRig {
  root: Object3D;
  nodes: Record<string, Object3D>;
  shadows: ContactShadow[];
  bounds: Box3;
  statusMaterial: MeshStandardMaterial;
  setLabel(label: RecordLabel): void;
  dispose(): void;
}

export type RecordPlayerModel = RecordPlayerRig & BuiltModel;

/** Rebind GLB placeholder materials to the live library by name. */
export function bindPartyMaterials(root: Object3D, lib: ModelContext['lib']): void {
  root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    const swap = (mat: Material) => (lib.direction.surfaces[mat.name] ? lib.get(mat.name) : mat);
    m.material = Array.isArray(m.material) ? m.material.map(swap) : swap(m.material);
  });
}

/**
 * Runtime rig over the Party hierarchy (built or GLB-loaded): contact shadows, the unique
 * status material and label swapping.
 */
export function rigRecordPlayer(root: Object3D, lib: ModelContext['lib'], label: RecordLabel = 'coral'): RecordPlayerRig {
  const dir = lib.direction;
  const nodes = collectNodes(root, PARTY_NODES);
  const replace = (name: string, shadow: ContactShadow) => {
    const placeholder = root.getObjectByName(name)!;
    shadow.position.copy(placeholder.position);
    placeholder.parent!.add(shadow);
    placeholder.removeFromParent();
    return shadow;
  };
  const recordShadow = replace('record_shadow', new ContactShadow({
    name: 'record_shadow', shape: 'round', width: RECORD.radius * 2, depth: RECORD.radius * 2, spread: [1.05, 1.5],
    opacity: dir.shadow.opacity * 0.8, line: 0, color: dir.shadow.color,
  }));
  const bodyShadow = replace('player_shadow', new ContactShadow({
    name: 'player_shadow', shape: 'rect', width: PLAYER.width, depth: PLAYER.depth, spread: [1.08, 1.22],
    opacity: dir.shadow.opacity, line: 0.45, color: dir.shadow.color,
  }));
  nodes.record_shadow = recordShadow;

  const statusMaterial = lib.unique('mat_status') as MeshStandardMaterial;
  root.getObjectByName('player_status')?.traverse((o) => {
    if ((o as Mesh).isMesh) (o as Mesh).material = statusMaterial;
  });

  const setLabel = (next: RecordLabel) => {
    const want = lib.get(next === 'coral' ? 'mat_label_coral' : 'mat_label_cobalt');
    nodes.record_label!.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh) m.material = want;
    });
  };
  setLabel(label);

  return {
    root,
    nodes,
    shadows: [recordShadow, bodyShadow],
    bounds: PARTY_BOUNDS.clone(),
    statusMaterial,
    setLabel,
    dispose() {
      recordShadow.dispose();
      bodyShadow.dispose();
      statusMaterial.dispose();
    },
  };
}

/** Study/tooling convenience: geometry + rig in one call. */
export function buildRecordPlayer(ctx: ModelContext, label: RecordLabel = 'coral'): RecordPlayerModel {
  const root = buildRecordPlayerGeometry(ctx, label);
  const rig = rigRecordPlayer(root, ctx.lib, label);
  return {
    ...rig,
    dispose() {
      rig.dispose();
      disposeGeometry(root);
    },
  };
}
