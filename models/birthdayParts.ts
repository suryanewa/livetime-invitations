import type { Object3D } from 'three';
import { CANDLE, CANDLE_COUNT, CANDLE_SOCKETS, STAND_TOP } from './birthdayContract.ts';
import { wickGeometry } from './cakeParts.ts';
import { group, lathe, mesh, type ProfilePoint } from './geometry.ts';
import { markNoShadowCast } from './shadowProxy.ts';
import type { ModelContext } from './types.ts';

/**
 * Code-authored part of the v1.2 Birthday scene (scripts/masters/recipes/birthday.ts merges the
 * cake master into it): the named hierarchy the choreography drives, and the per-candle wick and
 * view-dependent flame at each master candle's tip. The master's own `candle_wicks` and
 * `candle_flames` are single meshes covering all six candles, so they cannot follow a placed
 * candle (scripts/masters/README.md, pitfall 4): they are dropped and re-authored here.
 *
 *   birthday_root
 *   ├── tray                     (master cake_stand, mapped by the recipe)
 *   ├── cake_shadow              (placeholder; the rig puts the stand's contact shadow here)
 *   └── cake_authored            (cake underside centre, on the plate)
 *       └── cake_secondary       (presentation yaw + carry lean; the master tiers and piping)
 *           └── candle_01 … 06   (base centre of each master candle; lowered by the host)
 *               ├── candle_NN_wax (master candle, mapped by the recipe)
 *               ├── wick_NN
 *               └── flame_NN › flame_NN_mesh
 */

/** Flame lathe (v1.1 profile, 0.16 tall, 0.036 at its widest), scaled per axis by FLAME_SIZE. */
const FLAME_PROFILE: ProfilePoint[] = [[0, 0], [0.026, 0.016, 0.02], [0.036, 0.048, 0.03], [0.02, 0.105, 0.025], [0, 0.16]];

/**
 * Flame node scale at full size: the master flame's height (0.152) and a width a little over the
 * master's (0.040 across): the shader fades the silhouette, so the geometry is drawn wider than
 * the visible flame.
 */
export const FLAME_SIZE = { width: (CANDLE.flameRadius * 1.25) / 0.036, height: CANDLE.flameHeight / 0.16 } as const;

export const BIRTHDAY_CANDLE_IDS = Array.from({ length: CANDLE_COUNT }, (_, i) => String(i + 1).padStart(2, '0'));

/** Every node the runtime looks up by name in the exported GLB (the recipe's contract). */
export const BIRTHDAY_GLB_NODES = [
  'birthday_root', 'tray', 'cake_authored', 'cake_secondary', 'cake_shadow', 'cake_shadow_proxy', 'tray_shadow_proxy',
  ...BIRTHDAY_CANDLE_IDS.flatMap((id) => [`candle_${id}`, `candle_${id}_wax`, `wick_${id}`, `flame_${id}`, `flame_${id}_mesh`]),
] as const;

export function buildBirthdayGeometry(ctx: ModelContext): Object3D {
  const { lib } = ctx;
  const root = group('birthday_root');
  const cakeAuthored = group('cake_authored', root);
  cakeAuthored.position.y = STAND_TOP;
  const cakeSecondary = group('cake_secondary', cakeAuthored);

  BIRTHDAY_CANDLE_IDS.forEach((id, i) => {
    const [x, z] = CANDLE_SOCKETS[i]!;
    const candle = group(`candle_${id}`, cakeSecondary);
    candle.position.set(x, CANDLE.seat, z);
    // Wick: from inside the candle's cupped top to the master's wick tip, with a slight curl.
    const wick = mesh(`wick_${id}`, wickGeometry(CANDLE.wickHeight + 0.004, Math.max(CANDLE.wickRadius, 0.0032)), lib.get('mat_wick'), candle);
    wick.position.y = CANDLE.wickBase - 0.004;
    wick.rotation.y = i * 1.1;
    markNoShadowCast(wick);

    const flame = group(`flame_${id}`, candle);
    flame.position.y = CANDLE.flameBase;
    flame.scale.set(FLAME_SIZE.width, FLAME_SIZE.height, FLAME_SIZE.width);
    const outer = mesh(`flame_${id}_mesh`, lathe(FLAME_PROFILE, 16, 5), lib.get('mat_flame_outer'), flame);
    outer.renderOrder = 2;
  });

  group('cake_shadow', root).position.set(0, 0.002, 0);
  return root;
}
