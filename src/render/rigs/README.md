# Studio rigs

A **rig** is everything about the light the five invitation scenes are shown in: the prefiltered
environment (reflections and image-based light), the lights, the backdrop, exposure and tone mapping,
the real-time shadow, an optional gobo, and the **stage colour** the interface paints around the canvas.
One rig is one file in this folder. Write `src/render/rigs/<name>.ts`; nothing else changes:

- The registry (`src/render/rigRegistry.ts`) finds it through
  `import.meta.glob('./rigs/*.ts', { eager: true })`; the file name is the rig's name.
- The showcase renders it at `http://127.0.0.1:5199/?scene=party&rig=<name>` (local hosts only; add
  `&camera=ortho` for the v1.1 orthographic camera). Everywhere else the production rig
  (`DEFAULT_RIG` in the registry) renders. Under a `?rig=` other than the production rig the whole
  stage follows the rig: the surround (`--lt-stage` on the stage element) is the rig's `stageColor`,
  and no poster shows (the posters were captured under the production rig), so the stage waits on
  its own colour and the Static tier shows the pose sentence.
- `pnpm capture rigs <baseUrl> [rig,…]` renders it on all five scenes (below).

The contract is in `src/render/rig.ts`. The Stage (`src/render/stage.ts`) owns the lifecycle; a rig never
touches the scene's content.

## The interface

```ts
import { defineRig, prefilteredEnvironment } from '../rig.ts';

export default defineRig({
  label: string,                 // for the comparison sheets
  stageColor: '#RRGGBB',         // MEASURED backdrop colour (pnpm capture stagecolor); scene background + CSS tokens
  exposure: number,              // renderer.toneMappingExposure
  toneMapping: ToneMapping,      // three's NeutralToneMapping is the product pipeline
  environmentIntensity: number,  // scene.environmentIntensity (1.0 = physically plausible)
  metalEnvIntensity?: number,    // envMapIntensity of every ownEnv metal (set 1.0; omitted = the material values)
  gobo: boolean,                 // declared: does the key project a cookie?
  backdrop: { kind: 'sweep' | 'table' | 'custom', color?, note? } | { kind: 'none' },   // declared
  shadows: { filter: 'vogel16' | 'pcf' | 'vsm', mapSize, radius, bias, normalBias, near?, far? } | null,
  build(ctx: { renderer, scene, target }): {
    environment: Texture | null, // PMREM texture (prefilteredEnvironment)
    objects: Object3D[],         // lights, light targets, backdrop meshes: the Stage adds and removes them
    shadowKey?: SpotLight | DirectionalLight | null,  // the Stage applies `shadows` to it
    backdrop?: Mesh | null,
    setShadows?(enabled), setLowDetail?(enabled), setWall?(wallZ?),
    setContent?(bounds: Box3),   // the content's motion bounds: size a DirectionalLight's shadow camera
    dispose(),                   // free everything build() allocated
  },
});
```

What the Stage does with it, in order: sets `renderer.toneMapping` / `toneMappingExposure`, paints
`scene.background` with `stageColor`, adds `ctx.target` (an empty that follows the centre of the content's
motion bounds), calls `build`, sets `scene.environment` / `environmentIntensity`, adds `objects`, and, when
`shadows` is set and `shadowKey` given, configures the key's shadow (map size, radius, biases, camera range),
picks the shadow-map type (`vogel16` → v1.1's noise-free 16 fixed taps over three's PCF, page-wide; `pcf`;
`vsm`) and turns shadows on. On every `setContent` it moves `ctx.target`, calls `setWall(scene.studio.wallZ)`
and marks content meshes as casters/receivers (thin decals and transparent parts excluded), gives the
`ownEnv` materials the environment as their own map (with `metalEnvIntensity`, below), and calls
`setContent(bounds)` with the content's motion bounds (also on `setBounds`). A rig that declares
`shadows` but returns no `shadowKey` gets a console warning and no shadow map.

**Metals (`metalEnvIntensity`).** Polished and imported metals carry their own copy of the environment
(`userData.ownEnv`: the cloche, the Dinner silver, dome and gilt, the Business chrome, the hoop steel, and
any imported material with metalness ≥ 0.5), so `scene.environmentIntensity` never reaches them; their
`envMapIntensity` comes from the recipes (`ownEnv`: Dinner silver 0.8, dome 0.9, the rest 1.1; Low tier
0.8), values tuned to make metal read under v1.1's 0.52 environment. Declare `metalEnvIntensity: 1` and
the Stage sets every ownEnv material to it at `setContent` and again after each tier change (the
libraries' Low tier softens them first), so the metals see the same environment as everything else.
Omitted (v1.1), the material values stand and the render is unchanged. Caveat as in
`scripts/masters/README.md`: a metal *variant* material only takes the environment (and this value) if
it is on a mesh at `setContent`.

**Scene extent (`setContent`).** A SpotLight key aimed at `ctx.target` needs nothing. A
DirectionalLight key's orthographic shadow camera must cover the content: size
`shadow.camera.left/right/top/bottom` from the bounds (plus the backdrop area the shadow falls on) and
call `shadow.camera.updateProjectionMatrix()`. The scenes differ (Business is tall, Sports wide and
deep), so a fixed ±5 frustum wastes resolution on the small ones.

Tiers: Normal/High call `setShadows(true)` and `setLowDetail(false)`; Low/Static call `setShadows(false)`
(the Stage disables the shadow map, clears the key's `castShadow` and frees its depth target, then calls your
hook) and `setLowDetail(true)` (drop or downsample what is expensive: the gobo cookie, the backdrop's relief;
must be reversible). On teardown the Stage removes `objects` and calls `dispose`.

Rules every rig keeps (brief, "Rigs"): one key casts the real-time soft shadow; `environmentIntensity` 1.0 and
`metalEnvIntensity` 1.0 so metals, glass and vinyl reflect something with shape; deterministic (seeded procedural textures, no
downloads, no HDRI files); Low tier works; all five scenes stay lit and readable through every authored path
(the airborne ball, the lifted cloche, the swinging card, the carried cake); report the measured stage colour.

## Worked example: `v1.1.ts` (the baseline)

The v1.1 premium studio, refactored into a rig with byte-for-byte the same render (checked: 18 stills,
orthographic, identical PNGs before and after the refactor).

```ts
export default defineRig({
  label: 'v1.1 · sun through palms, plaster cove',
  stageColor: '#F8E4C8',            // the plaster as rendered (the v1.1 --lt-stage token)
  exposure: 1,
  toneMapping: NeutralToneMapping,
  environmentIntensity: 0.52,       // v1.1 stepped the IBL back under the spot key
  gobo: true,
  backdrop: { kind: 'sweep', color: '#EAE3D6', note: 'limewash plaster cove' },
  shadows: { filter: 'vogel16', mapSize: 1024, radius: 6, bias: -0.0004, normalBias: 0.012, near: 4, far: 20 },

  build({ renderer, target }) {
    // 1. Environment builder: a procedural room of emissive meshes, prefiltered into a PMREM texture.
    const env = prefilteredEnvironment(renderer, softboxRoom(), 0.035);
    // 2. Lights: a warm spot key aimed at the content, carrying the gobo, plus fills and a bounce.
    const key = new SpotLight('#FFF1DE', 15, 0, 0.6, 0.7, 0);
    key.position.set(-4.2, 7.8, 5.4);
    key.target = target;                 // follows the content
    const cookie = foliageCookie();      // 3. Gobo: a seeded canvas cookie
    key.map = cookie;
    const fill = new HemisphereLight('#E3E9EF', '#D6C7B2', 0.3);
    // 4. Backdrop: the plaster cove sweep (studio.ts kit), receiving the key's shadow.
    const sweep = createSweepBackdrop(renderer, { color: '#EAE3D6', roughness: 0.93, plaster: true });
    return {
      environment: env.texture,
      objects: [/* checkpoint-1 fill, */ key, fill, /* bounce, */ sweep.mesh],
      shadowKey: key,                    // 5. Shadows: the Stage applies `shadows` to this light
      backdrop: sweep.mesh,
      setWall: sweep.setWall,            // Birthday and Dinner push the wall back
      setLowDetail(low) { sweep.setLowDetail(low); key.map = low ? smallCookie : cookie; /* … */ },
      dispose() { cookie.dispose(); sweep.dispose(); env.dispose(); },
    };
  },
});
```

The real file is the reference (it also keeps the checkpoint-1 hemisphere fill and frees the cookie copies).

### Building blocks

- `prefilteredEnvironment(renderer, roomScene, sigma)` (`rig.ts`): PMREM from any `Scene` of emissive
  `MeshBasicMaterial`s (`toneMapped: false`, colour × intensity, `side: BackSide` for the room shell). Frees
  the room's geometry and materials and the depth buffer; returns `{ texture, dispose }`. `sigma` 0 keeps light
  shapes crisp (window bars, softbox edges: what reads as reflections on chrome); v1.1 blurred at 0.035.
  The Models viewer's `candidates/final/env.js` interior ports directly: build its room into a `Scene`.
- `softboxRoom()` (`lighting.ts`): the v1.0–v1.1 room (warm walls, key softbox, fill panel, rim strip).
- `createSweepBackdrop(renderer, { color, roughness, plaster?, normalScale?, wallZ? })` (`studio.ts`): the
  seamless cove (floor curving into a back wall at `DEFAULT_WALL_Z`, `COVE_RADIUS` 1.6), with `setWall`,
  `setLowDetail` and `dispose`. `plaster: false` gives a clean painted cove.
- `foliageCookie()`, `downsampledCookie(texture, size)` (`studio.ts`): the v1.1 gobo and its Low-tier copy.
- Scenes ask for a deeper wall through `scene.studio.wallZ` (Birthday, Dinner); a custom backdrop should honour
  `setWall` or be deep enough for both.

## Comparing rigs

```sh
pnpm capture rigs http://127.0.0.1:5199              # every registered rig
pnpm capture rigs http://127.0.0.1:5199 v1.1,neutral-room
pnpm capture rigs http://127.0.0.1:5199 v1.1 --ortho # the v1.1 orthographic camera (composition checks)
pnpm capture stagecolor http://127.0.0.1:5199 neutral-room
```

`rigs` renders, through the real stage (720², reduced motion), the guest-ready and accepted stills of every
preset of every scene into `outputs/rigs/<rig>/<scene>-<preset>-<pose>.png`, a contact sheet per rig
(`outputs/rigs/<rig>/sheet.png`), a cross-rig sheet per scene (`outputs/rigs/_compare/<scene>.png`), and the
rig's measured stage colour (`outputs/rigs/<rig>/stagecolor.json`). It never writes into `assets/`.
The cross-rig sheets hold only the rigs of that invocation: a run for a subset overwrites
`_compare/<scene>.png` with that subset, so the integrator renders every rig in one run (no list).

**Stage colour.** `stagecolor` (also run by `rigs`) loads each scene with the rig, hides the content for one
frame (`captureStill(…, { empty: true })`: same light, camera and backdrop), and prints the mean sRGB of the
central 20 % × 20 %, per scene and averaged. Put the average in the rig's `stageColor`; when the rig ships,
the integrator sets `--lt-stage` (`src/ui/shell.css`) to the same value (`tests/rigs.test.ts` holds the
production rig's `stageColor` and the token equal) and regenerates posters and thumbnails.

`tests/rigs.test.ts` enforces the rules for every rig except v1.1: `environmentIntensity` and
`metalEnvIntensity` 1, `shadows` declared, and, when `outputs/rigs/<rig>/stagecolor.json` exists in the
checkout, a `stageColor` within 2 levels per channel of the measurement.

v1.1 is the one exception to "declare the measured colour": it keeps the shipped `#F8E4C8` token (what its
posters and the interface were made with) and measures `#F6E0C5` (business `#F6E0C4`, party `#F6E0C4`, birthday `#F3DCC0`, sports `#FBE8CF`, dinner
`#F3DDC1`) through the perspective lens: the palm shadow dapples the centre slightly below the token.
