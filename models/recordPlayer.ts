import {
  Box3, BufferAttribute, BufferGeometry, Color, type Material, Matrix3, Matrix4, type Mesh, Mesh as ThreeMesh, MeshPhysicalMaterial, MeshStandardMaterial,
  type Object3D, Quaternion, Vector3,
} from 'three';
import { ContactShadow } from '../src/render/contactShadow.ts';
import type { MaterialLibrary } from '../src/render/materials.ts';
import { lidExtendLocal, PARTY_BOUNDS, PARTY_NODES, PLAYER, RECORD, type RecordLabel } from './recordContract.ts';
import { buildRecordPlayerGeometry } from './recordPremium.ts';
import { applyShadowProxies, disposeShadowProxies } from './shadowProxy.ts';
import type { MaterialVariants } from './imported.ts';
import { collectNodes, disposeGeometry, type BuiltModel, type ModelContext } from './types.ts';

export * from './recordContract.ts';

export interface RecordPlayerRig {
  root: Object3D;
  nodes: Record<string, Object3D>;
  shadows: ContactShadow[];
  /** Contact shadow under the record (tightens as it seats). */
  recordShadow: ContactShadow;
  bounds: Box3;
  /** The start/stop key's own material (a clone of the master's aluminium): lit while playing. */
  statusMaterial: MeshStandardMaterial;
  /** The cue lever's rest orientation (its −6° yaw); the lever turns about its local Z from there. */
  leverRest: Quaternion;
  /** The cue lift platform's rest position. */
  liftRest: Vector3;
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

const meshesOf = (o: Object3D) => {
  const out: Mesh[] = [];
  o.traverse((c) => { if ((c as Mesh).isMesh) out.push(c as Mesh); });
  return out;
};
const materialOf = (m: Mesh) => (Array.isArray(m.material) ? m.material[0]! : m.material) as Material;

/**
 * The master's dust cover is a short display lid (recordContract.ts, LID): closed it would end
 * short of the plinth's front and cut through the knob and counterweight. Extend it in place, in
 * lid_hinge space (the closed lid's frame): every shell vertex past a threshold moves out by that
 * side's constant, so the flat walls lengthen while the rim, fillets and corners keep their exact
 * shape; the aluminium tab on the front wall moves with it (and by the mean x shift, so it stays
 * where it was relative to the lid's width). Normals are unchanged by a piecewise translation of
 * flat walls, so they are only carried into hinge space.
 *
 * GLB meshes are quantised (normalised Int16 plus a node scale/offset): each mesh is rebuilt as
 * float geometry with its node transform baked in and its node reset to identity (as netDeform
 * does for the Sports net). Idempotent per mesh (`userData.lidExtended`). Pure geometry: the tests
 * run it on the exported GLB.
 */
export function extendLid(hinge: Object3D): void {
  const e = lidExtendLocal();
  hinge.updateWorldMatrix(true, true);
  const toHinge = new Matrix4().copy(hinge.matrixWorld).invert();
  const v = new Vector3(), n = new Vector3();
  for (const mesh of meshesOf(hinge)) {
    const name = materialOf(mesh).name;
    const shell = name === 'tt_lid', tab = name === 'tt_aluminium';
    if ((!shell && !tab) || mesh.userData.lidExtended) continue;
    if (mesh.parent !== hinge) throw new Error(`extendLid: ${mesh.name} is not a direct child of lid_hinge`);
    const m = new Matrix4().multiplyMatrices(toHinge, mesh.matrixWorld);
    const nm = new Matrix3().getNormalMatrix(m);
    const g = mesh.geometry;
    const pos = g.getAttribute('position'), nor = g.getAttribute('normal');
    const p = new Float32Array(pos.count * 3), q = new Float32Array(pos.count * 3);
    const dxTab = (e.left.by + e.right.by) / 2;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      if (v.z > e.front.from) v.z += e.front.by;
      if (v.y > e.up.from) v.y += e.up.by;
      if (tab) v.x += dxTab;
      else if (v.x < e.left.from) v.x += e.left.by;
      else if (v.x > e.right.from) v.x += e.right.by;
      v.toArray(p, i * 3);
      if (nor) n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize().toArray(q, i * 3);
    }
    g.setAttribute('position', new BufferAttribute(p, 3));
    if (nor) g.setAttribute('normal', new BufferAttribute(q, 3));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    mesh.position.set(0, 0, 0);
    mesh.quaternion.identity();
    mesh.scale.set(1, 1, 1);
    mesh.updateMatrix();
    mesh.userData.lidExtended = true;
  }
}

/**
 * The smoked cover's look while it swings (decline). Outside: the master's clearcoat is a near
 * mirror (0.6 at roughness 0.08 over a roughness-0.3 base). The cover's front wall, the face
 * uppermost while it is open, meets the key's mirror direction at about 32° open, which the
 * Beta(2, 4) close passes at its speed peak. The wall is flat, the camera orthographic and the key
 * far, so every texel shares one half-vector and the whole wall flashed pale cream at once for
 * about six frames. A satin coat (thinner, rougher clearcoat, rougher base, lower specular)
 * spreads that glint over a wider arc at a much lower peak, so it reads as a sheen passing over
 * the same dark plastic (decline frame diff peak 4.2 → 2.7, docs/scenes/party-v1.2.md). Inside: its own darker, non-coated material with occlusion baked into
 * vertex colours (darkest in the deep corner under the top panel, lightest at the open rim), so the
 * interior reads as the shaded inside of a smoked box at every angle (the shell does not receive
 * shadows, see rigRecordPlayer).
 */
export const LID_LOOK = {
  outer: { clearcoat: 0.25, clearcoatRoughness: 0.5, roughness: 0.55, specularIntensity: 0.5 },
  inner: { tint: 0.7, roughness: 0.6, specularIntensity: 0.5, aoDeep: 0.6, aoRim: 1 },
} as const;

/** The spindle's turned steel (rigRecordPlayer): linear grey and roughness. */
export const SPINDLE_LOOK = { color: 0.42, roughness: 0.24 } as const;

/**
 * Splits the extended shell (`tt_lid`) into its outside and its inside: a triangle whose face
 * normal points towards the closed box's centre is inside. The inside becomes its own mesh
 * (`lid_shell_inner`, sibling under lid_hinge) with `tt_lid_inner`, and the outside keeps the
 * master material with LID_LOOK.outer. Idempotent (`userData.lidSplit`). Returns the inner
 * material (owned by the rig) or null when there is no shell.
 */
export function splitLidInterior(hinge: Object3D): MeshPhysicalMaterial | null {
  const shell = meshesOf(hinge).find((m) => materialOf(m).name === 'tt_lid');
  if (!shell || shell.userData.lidSplit) return null;
  const g = shell.geometry;
  const pos = g.getAttribute('position');
  const index = g.getIndex();
  const tri = index ? index.count / 3 : pos.count / 3;
  const vi = (k: number) => (index ? index.getX(k) : k);
  g.computeBoundingBox();
  const box = g.boundingBox!;
  const centre = box.getCenter(new Vector3());
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), n = new Vector3(), e = new Vector3();
  const outer: number[] = [], inner: number[] = [];
  for (let t = 0; t < tri; t++) {
    const i0 = vi(3 * t), i1 = vi(3 * t + 1), i2 = vi(3 * t + 2);
    a.fromBufferAttribute(pos, i0); b.fromBufferAttribute(pos, i1); c.fromBufferAttribute(pos, i2);
    n.subVectors(c, b).cross(e.subVectors(a, b));
    const centroid = a.add(b).add(c).divideScalar(3);
    (n.dot(centroid.sub(centre)) < 0 ? inner : outer).push(i0, i1, i2);
  }
  // Baked occlusion on the inside: depth into the box from its open rim (closed-lid frame, the
  // rim at the bottom), deepest under the top panel.
  const ao = new Float32Array(pos.count * 3);
  const { aoDeep, aoRim } = LID_LOOK.inner;
  for (let i = 0; i < pos.count; i++) {
    const depth = Math.min(1, Math.max(0, (pos.getY(i) - box.min.y) / (box.max.y - box.min.y)));
    const s = aoRim + (aoDeep - aoRim) * depth ** 1.5;
    ao[i * 3] = ao[i * 3 + 1] = ao[i * 3 + 2] = s;
  }
  const innerGeometry = new BufferGeometry();
  for (const [name, attr] of Object.entries(g.attributes)) innerGeometry.setAttribute(name, (attr as BufferAttribute).clone());
  innerGeometry.setAttribute('color', new BufferAttribute(ao, 3));
  innerGeometry.setIndex(inner);
  innerGeometry.computeBoundingBox();
  innerGeometry.computeBoundingSphere();
  g.setIndex(outer);

  const outerMaterial = materialOf(shell) as MeshPhysicalMaterial;
  // The standard fields only (colour, roughness, maps, userData); the physical layers stay at
  // their defaults, so the inside has no clearcoat.
  const innerMaterial = new MeshPhysicalMaterial();
  MeshStandardMaterial.prototype.copy.call(innerMaterial, outerMaterial);
  innerMaterial.defines = { STANDARD: '', PHYSICAL: '' };
  innerMaterial.name = 'tt_lid_inner';
  innerMaterial.color.multiplyScalar(LID_LOOK.inner.tint);
  innerMaterial.roughness = LID_LOOK.inner.roughness;
  innerMaterial.specularIntensity = LID_LOOK.inner.specularIntensity;
  innerMaterial.vertexColors = true;
  if (outerMaterial.isMeshPhysicalMaterial) {
    outerMaterial.clearcoat = LID_LOOK.outer.clearcoat;
    outerMaterial.clearcoatRoughness = LID_LOOK.outer.clearcoatRoughness;
    outerMaterial.specularIntensity = LID_LOOK.outer.specularIntensity;
  }
  outerMaterial.roughness = LID_LOOK.outer.roughness;
  outerMaterial.needsUpdate = true;

  const innerMesh = new ThreeMesh(innerGeometry, innerMaterial);
  innerMesh.name = 'lid_shell_inner';
  innerMesh.position.copy(shell.position);
  innerMesh.quaternion.copy(shell.quaternion);
  innerMesh.scale.copy(shell.scale);
  innerMesh.userData = { ...shell.userData };
  shell.parent!.add(innerMesh);
  shell.userData.lidSplit = true;
  innerMesh.userData.lidSplit = true;
  return innerMaterial;
}

/**
 * Runtime rig over the Party hierarchy loaded from party.glb: contact shadows, the record's shadow
 * proxy, the extended dust cover, the status key's own material and the
 * label presets (`variants`: the GLB's KHR_materials_variants; without them the label falls back
 * to the library's printed labels).
 */
export function rigRecordPlayer(root: Object3D, lib: ModelContext['lib'], label: RecordLabel = 'coral', variants?: MaterialVariants): RecordPlayerRig {
  const dir = lib.direction;
  applyShadowProxies(root);
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
    name: 'player_shadow', shape: 'rect', width: PLAYER.width * 0.97, depth: PLAYER.depth * 0.97, spread: [1.06, 1.2],
    opacity: dir.shadow.opacity, line: 0.45, color: dir.shadow.color,
  }));
  nodes.record_shadow = recordShadow;
  nodes.player_shadow = bodyShadow;

  extendLid(nodes.lid_hinge!);
  const lidInner = splitLidInterior(nodes.lid_hinge!);
  // The shell does not receive shadows. Mid-close the key grazes its inside back wall, and the
  // shadow of its own top panel there stair-stepped under the studio's 16 fixed PCF taps (a
  // saw-tooth terminator). Nothing else ever shadows the cover (it is the topmost part), so only
  // that self-shadow is lost; the interior's own darker material and baked occlusion
  // (splitLidInterior) stand in for it. The stage sets receiveShadow at setContent, so it is
  // re-asserted per draw (shadow-pass casting is unaffected).
  for (const m of meshesOf(nodes.lid_hinge!)) if (materialOf(m).name.startsWith('tt_lid')) m.onBeforeRender = () => { m.receiveShadow = false; };

  // The key's own material: a clone of the master aluminium, so lighting it touches nothing else.
  const keyMesh = meshesOf(nodes.player_status!)[0]!;
  const statusMaterial = (materialOf(keyMesh) as MeshStandardMaterial).clone();
  statusMaterial.name = 'tt_status_key';
  statusMaterial.userData = { ...statusMaterial.userData, statusOff: { color: statusMaterial.color.clone(), metalness: statusMaterial.metalness, roughness: statusMaterial.roughness } };
  keyMesh.material = statusMaterial;

  // The spindle's own material: the master's mirror chrome (0.89, roughness 0.07) only reflects
  // the studio's even cream softbox, so the thin post read as a flat pale rectangle on the label.
  // Darker turned steel with a little roughness takes the key as a highlight down one side and
  // shades round the cylinder, so it reads as a metal pin. Touches nothing else.
  const spindleMesh = meshesOf(root.getObjectByName('spindle')!)[0]!;
  const spindleMaterial = (materialOf(spindleMesh) as MeshStandardMaterial).clone();
  spindleMaterial.name = 'tt_spindle';
  spindleMaterial.color.setScalar(SPINDLE_LOOK.color);
  spindleMaterial.roughness = SPINDLE_LOOK.roughness;
  spindleMesh.material = spindleMaterial;

  const setLabel = (next: RecordLabel) => {
    if (variants?.names.includes(next)) {
      variants.select(next);
      return;
    }
    const want = lib.get(next === 'coral' ? 'mat_label_coral' : 'mat_label_cobalt');
    for (const m of meshesOf(nodes.record_label!)) m.material = want;
  };
  setLabel(label);

  return {
    root,
    nodes,
    shadows: [recordShadow, bodyShadow],
    recordShadow,
    bounds: PARTY_BOUNDS.clone(),
    statusMaterial,
    leverRest: nodes.cue_lever!.quaternion.clone(),
    liftRest: nodes.cue_lift!.position.clone(),
    setLabel,
    dispose() {
      recordShadow.dispose();
      bodyShadow.dispose();
      statusMaterial.dispose();
      lidInner?.dispose();
      spindleMaterial.dispose();
      disposeShadowProxies(root);
    },
  };
}

/** Lights the start/stop key (emission in the status token; the cap turns to a frosted lens). */
export function setStatusLit(m: MeshStandardMaterial, lit: boolean, colour: string): void {
  const off = m.userData.statusOff as { color: Color; metalness: number; roughness: number };
  if (lit) {
    m.color.set(colour).multiplyScalar(0.55);
    m.metalness = 0.15;
    m.roughness = 0.35;
    m.emissive.set(colour);
    m.emissiveIntensity = 1;
  } else {
    m.color.copy(off.color);
    m.metalness = off.metalness;
    m.roughness = off.roughness;
    m.emissive.set(0, 0, 0);
    m.emissiveIntensity = 0;
  }
}

// ── Lookdev (v1.1 code-authored model) ───────────────────────────────────────────
/** The v1.1 record player's motion bounds (lookdev framing). */
const V11_BOUNDS = new Box3(new Vector3(-1.18, 0, -1.0), new Vector3(1.18, 1.86, 0.8));

/**
 * Lookdev convenience: the v1.1 code-authored record player (recordPremium.ts) with its contact
 * shadows and printed label. The runtime scene is the turntable master since v1.2.
 */
export function buildRecordPlayer(ctx: ModelContext, label: RecordLabel = 'coral'): BuiltModel {
  const root = buildRecordPlayerGeometry(ctx, label);
  const lib: MaterialLibrary = ctx.lib;
  const names = ['party_root', 'player_body', 'lid_hinge', 'platter', 'record_authored', 'record_secondary', 'record_label', 'tonearm_pivot', 'record_shadow'];
  const nodes = collectNodes(root, names);
  const swap = (name: string, shadow: ContactShadow) => {
    const placeholder = root.getObjectByName(name)!;
    shadow.position.copy(placeholder.position);
    placeholder.parent!.add(shadow);
    placeholder.removeFromParent();
    return shadow;
  };
  const dir = lib.direction;
  const shadows = [
    swap('record_shadow', new ContactShadow({ name: 'record_shadow', shape: 'round', width: 1.2, depth: 1.2, spread: [1.05, 1.5], opacity: dir.shadow.opacity * 0.8, line: 0, color: dir.shadow.color })),
    swap('player_shadow', new ContactShadow({ name: 'player_shadow', shape: 'rect', width: 2.1, depth: 1.5, spread: [1.08, 1.22], opacity: dir.shadow.opacity, line: 0.45, color: dir.shadow.color })),
  ];
  const status = lib.unique('mat_status');
  root.getObjectByName('player_status')?.traverse((o) => { if ((o as Mesh).isMesh) (o as Mesh).material = status; });
  return {
    root,
    nodes,
    shadows,
    bounds: V11_BOUNDS.clone(),
    dispose() {
      for (const s of shadows) s.dispose();
      status.dispose();
      disposeGeometry(root);
    },
  };
}
