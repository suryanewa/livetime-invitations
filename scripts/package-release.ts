/**
 * Release package (Production Plan M8): copies the reviewable deliverables into the Creative
 * masters folder with a SHA-256 manifest. Nothing is sent or deployed.
 *
 *   node --experimental-transform-types --no-warnings scripts/package-release.ts [YYYY-MM-DD]
 *
 * Layout under ~/Creative/Livetime/invitation-interactions/release-<date>/:
 *   source/      git archive of HEAD (the code-authored models are the editable masters)
 *   runtime/     GLB models, posters, collection thumbnails (as shipped in assets/)
 *   showcase/    the static production build (dist/)
 *   evidence/    real-speed clips and review stills per scene, UI matrix, perf samples
 *   docs/        README, integration guide, style reference, asset manifest, qualification, time log
 *   MANIFEST.md  every file with its size and SHA-256
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, relative } from 'node:path';

const root = join(import.meta.dirname, '..');
const date = process.argv[2] ?? new Date().toISOString().slice(0, 10);
const out = join(homedir(), 'Creative', 'Livetime', 'invitation-interactions', `release-${date}`);

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map((e) => (e.isDirectory() ? walk(join(dir, e.name)) : Promise.resolve([join(dir, e.name)]))));
  return files.flat();
}

async function copyIfExists(from: string, to: string, filter?: (src: string) => boolean) {
  try {
    await stat(from);
  } catch {
    return;
  }
  await cp(from, to, { recursive: true, filter: filter ? (src) => filter(src) : undefined });
}

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

// Source masters: exactly the committed tree.
await mkdir(join(out, 'source'), { recursive: true });
const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root }).toString().trim();
execFileSync('git', ['archive', '--format=tar.gz', '-o', join(out, 'source', `livetime-invitations-${commit}.tar.gz`), 'HEAD'], { cwd: root });

// Runtime assets and the static build.
await copyIfExists(join(root, 'assets'), join(out, 'runtime'));
await copyIfExists(join(root, 'dist'), join(out, 'showcase'));

// Evidence: clips and stills per scene (frame dumps and scratch files excluded).
const keep = (src: string) => !/\/frames-|\/posters\/|\/_/.test(src) || /\/outputs$/.test(src);
for (const scene of ['business', 'party', 'birthday', 'sports', 'dinner']) {
  await copyIfExists(join(root, 'outputs', scene), join(out, 'evidence', scene), (src) => keep(src) && (!src.includes('.') || /\.(mp4|png|webp)$/.test(src)));
}
await copyIfExists(join(root, 'outputs', 'ui'), join(out, 'evidence', 'ui'), (src) => !/\/_/.test(src));
await copyIfExists(join(root, 'outputs', 'perf'), join(out, 'evidence', 'perf'));

// Documentation.
await mkdir(join(out, 'docs'), { recursive: true });
for (const f of ['README.md', 'PRODUCT.md', 'DESIGN.md']) await copyIfExists(join(root, f), join(out, 'docs', f));
await copyIfExists(join(root, 'docs'), join(out, 'docs'));

// Manifest.
const files = (await walk(out)).filter((f) => !f.endsWith('MANIFEST.md')).sort();
const rows: string[] = [];
let total = 0;
for (const f of files) {
  const buf = await readFile(f);
  total += buf.length;
  rows.push(`| ${relative(out, f)} | ${buf.length} | ${createHash('sha256').update(buf).digest('hex')} |`);
}
await writeFile(join(out, 'MANIFEST.md'), [
  `# Livetime invitation interactions — release package ${date}`,
  '',
  `Source commit \`${commit}\`. Prepared locally for review; nothing has been sent or deployed.`,
  `${files.length} files, ${(total / 1048576).toFixed(1)} MiB.`,
  '',
  '| File | Bytes | SHA-256 |',
  '| --- | --- | --- |',
  ...rows,
  '',
].join('\n'));
console.log(`release → ${out} (${files.length} files, ${(total / 1048576).toFixed(1)} MiB, commit ${commit})`);
