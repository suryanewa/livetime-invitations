/**
 * Coverage table (Production Plan M7 exit evidence): renders docs/coverage.json — one row per
 * requirement of the Master Specification and each scene sub-spec, with status, evidence and
 * note — into docs/coverage.md.
 *
 *   node --experimental-strip-types scripts/coverage-table.ts
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

interface Row {
  key: string;
  section: string;
  requirement: string;
  status: 'met' | 'partial' | 'unverified' | 'exception' | 'not met';
  evidence: string;
  note?: string;
  /** Work this row still waits for (captures, measurements, release, surya, cp4-fix:<id>). */
  pendingOn?: string[];
}

const root = join(import.meta.dirname, '..');
const data = JSON.parse(await readFile(join(root, 'docs', 'coverage.json'), 'utf8')) as { audited: string; commit: string; rows: Row[] };

const DOCS: [string, string][] = [
  ['master', 'Master Specification'],
  ['business', 'Business — Keycard'],
  ['party', 'Party — Record Player'],
  ['birthday', 'Birthday — Cake'],
  ['sports', 'Sports — Basketball'],
  ['dinner', 'Dinner — Covered Dish'],
];
const STATUSES = ['met', 'exception', 'partial', 'unverified', 'not met'] as const;
const cell = (s: string | undefined) => (s ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim();
const docOf = (r: Row) => r.key.split('-')[0]!;
const noteOf = (r: Row) => cell([r.note, r.pendingOn?.length ? `Pending: ${r.pendingOn.join(', ')}.` : ''].filter(Boolean).join(' '));

const out: string[] = [
  '# Coverage table',
  '',
  `Every requirement in the Master Specification and the five scene sub-specs, linked to a result or an explicit exception (Production Plan M7 exit evidence). Audited ${data.audited} at commit \`${data.commit}\`; regenerate with \`node --experimental-strip-types scripts/coverage-table.ts\` from \`docs/coverage.json\`.`,
  '',
  '- **met**: implemented and checked (test, measurement or recorded review).',
  '- **exception**: an approved or recorded deviation (see `docs/spec-revisions.md`).',
  '- **partial**: implemented, but part of the evidence is missing.',
  '- **unverified**: needs a device, a person or a tool this production does not have (mostly the phone session, VoiceOver/NVDA and other browsers).',
  '- **not met**: open.',
  '',
  '## Summary',
  '',
  `| Document | ${STATUSES.join(' | ')} | Total |`,
  `| --- | ${STATUSES.map(() => '---:').join(' | ')} | ---: |`,
];
for (const [key, title] of DOCS) {
  const rows = data.rows.filter((r) => docOf(r) === key);
  out.push(`| ${title} | ${STATUSES.map((s) => rows.filter((r) => r.status === s).length).join(' | ')} | ${rows.length} |`);
}
out.push(`| **All** | ${STATUSES.map((s) => data.rows.filter((r) => r.status === s).length).join(' | ')} | ${data.rows.length} |`, '');

out.push('## Open items (not met, partial, unverified)', '', '| Document | Section | Requirement | Status | Note |', '| --- | --- | --- | --- | --- |');
for (const [key, title] of DOCS) {
  for (const r of data.rows.filter((x) => docOf(x) === key && (x.status === 'not met' || x.status === 'partial' || x.status === 'unverified'))) {
    out.push(`| ${title} | ${cell(r.section)} | ${cell(r.requirement)} | ${r.status} | ${noteOf(r)} |`);
  }
}
out.push('');

for (const [key, title] of DOCS) {
  out.push(`## ${title}`, '', '| Section | Requirement | Status | Evidence | Note |', '| --- | --- | --- | --- | --- |');
  for (const r of data.rows.filter((x) => docOf(x) === key)) {
    out.push(`| ${cell(r.section)} | ${cell(r.requirement)} | ${r.status} | ${cell(r.evidence)} | ${noteOf(r)} |`);
  }
  out.push('');
}

await writeFile(join(root, 'docs', 'coverage.md'), out.join('\n'));
console.log(`coverage → docs/coverage.md (${data.rows.length} rows)`);
