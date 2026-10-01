import type { Rig, RigDefinition } from './rig.ts';

/**
 * Every studio rig, registered by file: src/render/rigs/<name>.ts with a default export from
 * `defineRig`. Adding a rig never edits this file.
 */
const modules = import.meta.glob<{ default: RigDefinition }>('./rigs/*.ts', { eager: true });

export const RIGS: ReadonlyMap<string, Rig> = new Map(
  Object.entries(modules)
    .map(([path, mod]) => {
      const name = path.slice(path.lastIndexOf('/') + 1, -'.ts'.length);
      if (!mod.default?.build) throw new Error(`Rig ${path} has no default export from defineRig()`);
      return [name, { ...mod.default, name }] as const;
    })
    .sort(([a], [b]) => a.localeCompare(b)),
);

/** The production rig: what the controller uses when the embedder names none. */
export const DEFAULT_RIG = 'v1.1';

export function rigNames(): string[] {
  return [...RIGS.keys()];
}

/** A registered rig by name; unknown names fall back to the production rig (with a warning). */
export function resolveRig(name?: string | null): Rig {
  const rig = name ? RIGS.get(name) : undefined;
  if (name && !rig) console.warn(`Unknown studio rig "${name}"; using ${DEFAULT_RIG}. Registered: ${rigNames().join(', ')}`);
  const fallback = RIGS.get(DEFAULT_RIG);
  if (!fallback) throw new Error(`The production rig ${DEFAULT_RIG} is not registered`);
  return rig ?? fallback;
}
