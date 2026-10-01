# Master import path (v1.2)

The scan-to-CAD masters in `models/masters/*.glb` become runtime scene objects through a **recipe**
per scene: `scripts/masters/recipes/<scene>.ts`. `pnpm models <scene>` composes the scene from the
code-authored builder output **and** the masters in one glTF document, runs the usual optimisation
chain, writes `assets/scenes/<scene>/<scene>.glb` and prints a report. Sports is the worked proof.

**Scene agents edit only their own recipe file** (plus their models/, src/scenes/, tests/). All five
recipes are already registered in `recipes/index.ts`; `scripts/export-models.ts` needs no change.
A recipe with `masters: []` (the stubs) exports exactly as before: builder only, no texture policy.

## Pitfalls (read these first)

1. **Mapping a nested node moves it out of its master group.** Every key in `nodes` is reparented
   (default: the anchor), even if you only `rename` it. Its siblings stay in the master group. So
   when Party remaps `tonearm_gimbal`, the `arm_tube`, `headshell` and `cartridge` do NOT follow it:
   map them too with `parent: 'tonearm_gimbal'` (or its new name), or they stay behind when the
   runtime yaws the gimbal.
2. **A Vec3 `pivot` is in the node's current parent space, before reparenting.** For a top-level
   master node that is the master's scan-unit frame inside the placement node (scan units, before
   `scale`), NOT the anchor's scene units. Prefer a box point (`{ node, point }`): it is measured in
   that same space for you.
3. **A mapped node never keeps its own mesh.** It leaves the importer as an empty transform (its
   pivot, unit scale) and the mesh moves to a child `<final name>_mesh`. Look nodes up by the
   contract name and `traverse` for meshes; do not expect `getObjectByName('candle_1')` to be a
   `Mesh`. (Reason: gltf-transform `quantize` folds the dequantisation transform into a leaf mesh
   node's own matrix, which would move a pivot to the mesh's box centre and give it a non-unit
   scale.)
4. **There is no split-by-component.** A master mesh that covers several parts stays one mesh:
   birthday-cake.glb's `candle_wicks` and `candle_flames` cover all six candles, so per-candle wicks
   cannot follow placed candles. Drop them (`drop: ['candle_wicks', 'candle_flames']`) and keep or
   code-author per-candle wicks and flames in the builder.
5. **There is no UV operation.** Renaming a material to a library name (`paper_label` →
   `mat_label_coral`) swaps in the library material at load, but the master's UVs stay. If the
   library label texture does not fit those UVs, use `materialVariants` (a second label image from
   a pixel function over the master's own `baseColorTexture`) or keep the code-authored label.
6. **Animate scale only on empty nodes.** Mapped and created nodes are empty with unit scale;
   `*_mesh` holders and builder mesh nodes carry quantisation scale/offset (§10.6).
7. **Joins skip what moves.** A join never descends into a contract node or a `*_mesh` holder, but
   it does bake every other mesh under its parent: keep moving parts out of joined subtrees or list
   them in `contract`.
8. **Textures are cheap to keep exact.** LUTs (short edge ≤ 16 px) and data slots (normal,
   clearcoat normal, anisotropy) are kept exact automatically; list anything else in
   `textures.lossless` / `textures.keepSize` (§9). `caps` can only lower a size.

## Decisions every recipe relies on

### 1. Order of operations (fixed)

`pnpm models <scene>` with a recipe that lists masters:

1. **Builder** → document. `recipe.builder` if given (`null` = no builder, an empty document), else
   the scene's existing builder from `export-models.ts`. Exported with GLTFExporter, as today.
2. **`recipe.create`**: scene-level empty nodes (parent `'@scene'` = top level). Use this when there
   is no builder and you need a root such as `party_root`.
3. **`recipe.dropBuilderNodes`**: builder subtrees deleted (parts a master replaces). Prefer a builder
   option instead when the parts are merged into a shared mesh (Sports: `parts: 'stand'`).
4. **Each master, in array order**:
   1. `drop`: master subtrees deleted.
   2. `materials`: policies and renames (an unknown key fails the export).
   3. `decimate`: weld, then meshoptimizer `simplify` per named mesh node.
   4. merge into the scene document inside a temporary placement node under `anchor`:
      `scale` (uniform), then `rotation` (quaternion), then `offset`; or `align` instead of `offset`.
   5. `create`: new empty nodes (contract nodes such as `record_authored`).
   6. `nodes`: per master node, in object order: `pivot` (in the node's current parent space,
      before reparenting: Pitfall 2) → reparent to `parent` (**default: the anchor**) keeping its
      scene placement → its scale baked into its mesh and children → `rename` → `extras` → its own
      mesh (if any) moved to a new child `<final name>_mesh` (identity transform; `noShadowCast` /
      `shadowProxy` extras copied to it). So every mapped node leaves the importer as an **empty
      transform at its pivot with unit scale**, and keeps that through quantisation.
   7. `noShadowCast` flags.
   8. the placement node is dissolved into the anchor; master grouping nodes left empty are removed.
      Unmapped master nodes travel with their nearest mapped ancestor (or stay under the anchor).
5. **`recipe.join`**: static same-material meshes under a node → one mesh per material (never
   entering a contract node or a `*_mesh` holder).
6. **`recipe.shadowProxies`**: generated low-poly casters.
7. **`recipe.materialVariants`**: presets written as KHR_materials_variants.
8. **Contract check**: every name in `recipe.contract` must exist exactly once (else the export fails).
9. Chain (`optimizeComposed` in compose.ts, shared with `tests/masters.test.ts`): `dedup → weld →
   prune(keepLeaves, keepAttributes) → texture policy → quantize(POSITION, NORMAL) → unpartition`,
   then the report.

Masters merge **after** the builder, so a master may anchor to any builder node; a later master may
anchor to nodes created or renamed by an earlier one.

### 2. Names and lookups

- **Master keys** (`drop`, `decimate`, `nodes`, `noShadowCast`, `align.node`, `pivot.node`,
  `create.at.node`) are master node names, unique within that master, or a **path** from the
  master's scene root when a name repeats: `'basketball/basketball'`.
- **Scene keys** (`anchor`, `parent`, `join.parent`, `shadowProxies.from/parent`, `materialVariants.of`)
  are **final names** in the composed document: builder nodes, created nodes, renamed master nodes.
  Each must be unique there.
- **Unnamed master materials** are addressed as `#<index>` (`'#0'`); always rename them.
- Prefix imported material names with the object (`hoop_steel`, `cake_buttercream`) unless you mean
  a library name: a library name (`mat_label_coral`) makes `bindMaterialsByName` **replace** the
  imported material with the locked library's at load (textures dropped). That is the way to let a
  library preset drive a master surface.

### 3. Coordinates

- Every vector is in the local space of the node it is relative to: the **anchor** for `offset` and
  `align.to`, the **parent** for `create.at`, and for a Vec3 `pivot` the node's **current parent,
  before it is reparented**. For a top-level master node that parent is the temporary placement
  node, i.e. the master's own scan-unit frame (before `scale`, `rotation`, `offset`), not the
  anchor's scene units; for a nested node it is its master group's frame. A `{ node, point }` pivot
  is measured in that same space, which is why it is the safer choice.
- `BoxPoint` = exact vertex box of a master node's subtree **measured in that same space**:
  `'center' | 'bottom' | 'top' | 'back' | 'front'` or fractions `[fx, fy, fz]` (`[0.5, 0, 0.5]` =
  bottom centre; `back` = −z face, `front` = +z face, +z faces the player in every master), or
  `'origin'`: the node's **own pivot** (its authored origin, e.g. the turntable's `tonearm_gimbal`
  bearing or a candle's base), measured in the same space; it needs no geometry.
- Masters are y-up, centred, in scan units (~1.9 tall). `scale` is scan → scene units.

### 4. Creating an empty contract node and choosing its pivot

Two equivalent ways; pick whichever reads better:

- **New empty node + children** (when the authored node groups several master parts). `parent` is
  a final name in the composed document: here `party_root`, the anchor (a builder node or a
  scene-level `recipe.create` node):
  ```ts
  create: [{ name: 'record_authored', parent: 'party_root', at: { node: 'record', point: 'bottom' } }],
  nodes: {
    record: { parent: 'record_authored' },        // keeps its place; now moves with record_authored
    record_label: { parent: 'record_authored' },
  },
  ```
- **A master node becomes the contract node** (`rename` + `pivot`): its origin moves to the pivot,
  its geometry stays put, and the node leaves the importer empty (its mesh on `<name>_mesh`), so the
  pivot survives quantisation even for a leaf mesh such as a candle:
  ```ts
  nodes: {
    tonearm_gimbal: { rename: 'tonearm_pivot', pivot: { node: 'tonearm_base', point: 'top' } },
    arm_tube: { parent: 'tonearm_pivot' },        // siblings must be mapped to follow (Pitfall 1)
    headshell: { parent: 'tonearm_pivot' },
  },
  // Birthday: candle_1 at the candle's bottom centre; candle_1_mesh holds the wax.
  nodes: { candle_1_pink: { rename: 'candle_1', pivot: { node: 'candle_1_pink', point: 'bottom' } } },
  ```
  Order matters inside `nodes`: a later entry's `parent` may name an earlier entry's new name.

### 5. Extras (travel in the GLB → `userData` at load)

| Where | How | Runtime effect |
| --- | --- | --- |
| node `noShadowCast` | `noShadowCast: ['dome']` (whole subtree) or `nodes.x.extras` (copied to its `_mesh` holder) | Stage skips the shadow pass for that mesh |
| node `shadowProxy` | `shadowProxies: [...]` (generated) | invisible caster; `applyShadowProxies(root)` gives it the proxy material |
| material `ownEnv` | `materials.x.ownEnv: 1.1` (`true` = 1.1, `false` = opt a metal out) | `prepareImported` sets envMapIntensity; the stage gives it its own env map |
| material `transmissionToAlpha` | `materials.x.transmissionToAlpha: 0.35` | written by the policy (alpha blend); recorded for reference |
| anything else | `nodes.x.extras` / `materials.x.extras` / `create[].extras` | plain `userData` |

Metals (metalness ≥ 0.5) get ownEnv 1.1 at runtime without a flag: the studio's 0.52 environment
alone leaves polished metal gunmetal-grey (the cloche lesson).

Extras of a node whose mesh has **several primitives** land on a `Group` at load, not on the meshes
(GLTFLoader); the stage reads shadow flags from meshes. Masters are single-primitive per node, and
`join` produces one primitive per node, so this only bites hand-made multi-primitive meshes.

### 6. Material policies

`rename`, `transmissionToAlpha` (drops transmission + volume, alpha BLEND at that opacity — the badge
holder), `ownEnv`, `emissiveStrength` (adds KHR_materials_emissive_strength — the reader LED),
`doubleSided`, `baseColorFactor`, `roughness`, `metalness`, `extras`. Policies never touch UVs or
textures (Pitfall 5); node `pivot` vectors follow §3 (scan units for a top-level master node).

### 7. Presets that live in the GLB: material variants

```ts
variants: ['orange', 'cream'],              // first = default = the material as authored
materialVariants: [{ variant: 'cream', of: 'ball_leather', name: 'ball_leather_cream', baseColor: creamAlbedo }],
```
`baseColor` is a deterministic pixel function over the source albedo (`RawImage`, 8-bit, top row
first); the result is stored as a second image, other maps are shared. Use `baseColorFactor` for a
plain tint. At runtime:
```ts
const gltf = await new GLTFLoader().parseAsync(buffer, '');
const variants = await loadMaterialVariants(gltf);   // before root.removeFromParent()
bindMaterialsByName(root, library);
prepareImported(root, library, variants.materials);
variants.select('cream');                           // in setPreset; precompile both
```
Caveat: a **metal** variant material only gets its own env map from `Stage.assignOwnEnvironment`
when it is on a mesh at `setContent`; if a metallic variant is not the default, select it once
before the scene is handed to the stage, or keep presets on non-metals.

### 8. Joins, decimation, shadow proxies

- `join: [{ parent: 'rim' }]`: every leaf mesh descendant of `rim` is merged per material into
  `rim_<material>` children of `rim` (in `rim`'s space), except inside contract nodes and `*_mesh`
  holders (the walk does not enter them). Do not join anything else the runtime moves or deforms
  separately (the net, a lid, candles): make it a contract node or join a different parent.
- `decimate: { 'net-knots': { ratio: 0.4, error: 0.001 } }`: ratio is a target; the error bound
  (fraction of mesh radius, default 0.001 = visually lossless) wins. The log prints the result.
- `shadowProxies: [{ name, from, parent, ratio, error? }]`: clones the `from` subtrees into
  `parent`'s space (positions only), joins, welds, decimates (default error 0.02), flags it
  `shadowProxy` and the sources `noShadowCast`. The proxy is static: parent it to the node that
  moves the source, and do not proxy a deforming mesh.

### 9. Textures

Every texture → WebP, declared with `EXT_texture_webp` (required: core glTF allows only PNG/JPEG).
Keys are `'<final material name>/<slot>'` with gltf-transform's slot names (`baseColorTexture`,
`normalTexture`, `clearcoatNormalTexture`, `anisotropyTexture`, `emissiveTexture`, …).

| Texture | Size | Encoding |
| --- | --- | --- |
| **LUT**: short edge ≤ 16 px (turntable 8192×4 vinyl normal + anisotropy; cake 256×4, 4×64, 4×128) | kept, whatever `maxSize` says | exact lossless |
| **Data slot**: any `*normal*` slot, `anisotropyTexture` | fitted in `maxSize` / `caps` | exact lossless |
| listed in `textures.lossless` | fitted | exact lossless |
| listed in `textures.keepSize` | kept | by the rows above, else lossy |
| anything else (colour, ORM, emissive) | fitted in `maxSize` (default 2048) and `caps` (lower only) | lossy at `quality` (default 90) |

"Fitted" = longest edge ≤ the cap, aspect kept, Lanczos3; a texture that already fits is never
resampled. "Exact lossless" = lossless WebP with `exact` (RGB under zero alpha kept): decoded texels
equal the source's. No recipe needs `maxSize` raised for a LUT any more; raise it (or use
`keepSize`) only for a large non-LUT image you want at source size. Budgets are waived for this
pass: the report gives the cost, do not trade fidelity for it.

### 10. Runtime checklist for a scene that imports masters

1. `loadMaterialVariants(gltf)` (if the recipe has variants) before detaching the root.
2. `bindMaterialsByName(root, library)` then `prepareImported(root, library, variants.materials)`.
3. `applyShadowProxies(root)` in the rig if you generated proxies (and `disposeShadowProxies` on dispose).
4. Implement `setLowDetail(enabled) { setImportedLowDetail(this.root, enabled); }` on the scene
   instance: the controller calls it with the library's Low tier (src/core/sequence.ts).
5. `disposeImported(root)` in `dispose()` (frees the large master textures, also those the Low tier
   holds aside, at any tier; never the stage's environment map).
6. Mesh nodes are quantised (KHR_mesh_quantization: normalised Int16 positions plus a node
   scale/offset). Anything that rewrites vertices must dequantise first and bake the node transform
   (see `netDeform` in models/sports.ts). Mapped and created contract nodes are empty and leave the
   exporter at their pivot with unit scale (the mesh of a mapped node is on its `<name>_mesh` child,
   which gets the quantisation scale/offset). Builder mesh nodes that are leaves get it too. So
   animate position, rotation and scale (squash, recoil) on empty nodes (`ball_secondary`, a mapped
   contract node), never on a `*_mesh` holder or a builder mesh node.

### 11. Measuring a master and the contract

`node --experimental-transform-types --no-warnings scripts/masters/inspect.ts models/masters/<file>.glb [scale]`
prints the node tree with recipe paths, triangles, materials and exact boxes × scale. Put measured
numbers in `models/<scene>Contract.ts` with a comment saying they come from the master, and add a
test that reads the exported GLB (`createIO`, `findNode`, `boxIn` from compose.ts) and checks them,
as `tests/sports.test.ts` ("Sports runtime GLB matches the contract") does.

## Worked example: Sports (`recipes/sports.ts`)

```ts
export const recipe: SceneRecipe = {
  scene: 'sports',
  // Builder: contract nodes + the stand (pole, base, clamp, arm, back plate) fitted to the master board.
  builder: (ctx) => buildSportsGeometry(ctx, 'orange', { parts: 'stand' }),
  masters: [
    {
      file: 'basketball.glb',
      anchor: 'ball_secondary',                          // builder node; the ball spins with it
      scale: BALL_R / 0.9436,                            // scan sphere r 0.9436 → BALL_R 0.25
      rotation: ballRotation(),                          // seam cross faces the guest at guest-ready
      align: { node: 'basketball/basketball', point: 'center', to: [0, 0, 0] },
      materials: { '#0': { rename: 'ball_leather' } },   // unnamed master material
      nodes: { 'basketball/basketball': { rename: 'ball_mesh', parent: 'ball_secondary' } },
    },
    {
      file: 'basketball-hoop.glb',
      anchor: 'hoop_root',
      scale: HOOP_SCALE,                                 // rim inner radius 0.451 → 0.4 (1.6 × BALL_R)
      align: { node: 'rim-ring', point: 'center', to: RIM_LOCAL.toArray() },
      materials: { steel: { rename: 'hoop_steel', ownEnv: 1.1 }, rope: { rename: 'hoop_rope' } /* … */ },
      decimate: { 'net-knots': { ratio: 0.4, error: 0.001 } },
      nodes: {
        board: { rename: 'backboard', pivot: { node: 'board-back', point: 'center' } },
        rim: { pivot: { node: 'bracket-plate', point: 'back' } },      // hinge on the board face
        net: { pivot: { node: 'rim-ring', point: 'center' } },         // net space = RIM_LOCAL
      },
    },
  ],
  join: [{ parent: 'backboard', prefix: 'board' }, { parent: 'rim' }],  // 31 meshes → 5
  shadowProxies: [{ name: 'ball_shadow_proxy', from: ['ball_mesh'], parent: 'ball_secondary', ratio: 0.03, error: 0.01 }],
  variants: ['orange', 'cream'],
  materialVariants: [{ variant: 'cream', of: 'ball_leather', name: 'ball_leather_cream', baseColor: creamAlbedo }],
  textures: { maxSize: 2048, quality: 90 },
  contract: SPORTS_NODES,
};
```

Result (`pnpm models sports`): `sports_root › ball_authored › ball_secondary › {ball_mesh ›
ball_mesh_mesh, ball_shadow_proxy}`, `hoop_root › {hoop_stand, hoop_hardware, backboard ›
board_hoop_{frame, board_face, target_paint}, rim › rim_hoop_{rim_paint, steel}, net ›
net-{strands, loops, knots}}`, plus the builder's `ball_shadow` / `hoop_shadow` placeholders; every
contract node found. The report:

```
── sports export report ──
  triangles 259,206 · draw calls 11 (+ 1 shadow proxy, 2,436 tris, shadow pass only) · 22 nodes
  textures 16 · 62.6 MiB as RGBA8 + mips
  GLB 8071.3 KiB raw · 6159.2 KiB gzip
  contract nodes missing: none
```

Runtime: `src/scenes/sports/index.ts` (variants, prepareImported, setLowDetail, disposeImported) and
`models/sports.ts` (`rigSports(root, lib, preset, variants)`, `netDeform` on the master net).

## Files

| File | Role |
| --- | --- |
| `types.ts` | Recipe types (every field documented) |
| `compose.ts` | The importer: `composeMasters`, `optimizeComposed` (the export chain), `applyTexturePolicy` / `textureDecision`, measuring helpers (`boxIn`, `boxPoint`, `findNode`) |
| `../../tests/masters.test.ts` | End-to-end importer test on a synthetic master (pivots through quantisation, joins, exact LUTs, WebP declaration) |
| `report.ts` | Export report (triangles, draw calls, textures and GPU MiB, GLB raw/gzip KiB, contract) |
| `inspect.ts` | Master inspector for writing recipes |
| `sharp.ts` | sharp, resolved through @gltf-transform/functions (no new dependency) |
| `recipes/*.ts` | One recipe per scene; `recipes/index.ts` registers all five |
| `../../models/imported.ts` | Runtime: `prepareImported`, `setImportedLowDetail`, `loadMaterialVariants`, `disposeImported` |
