import '../ui/shell.css';
import './study.css';
import { createInvitation, type InvitationHandle, type SceneRegistry } from '../core/controller.ts';
import { presetOf } from '../core/config.ts';
import type { CanonicalPose, Category, SceneConfig } from '../core/types.ts';
import { CATEGORY_LABEL, OBJECT_LABEL, POSE_TEXT, PRESETS } from './fixtures.ts';
import { posterUrl } from './posters.ts';

/**
 * Collection review (Production Plan M7): every scene's ready pose and both guest outcomes,
 * per preset, side by side from the shipped posters, plus one live canvas that plays or shows
 * whichever cell is picked. Tooling page (noindex); saves are never requested here.
 */

const scenes: SceneRegistry = {
  party: () => import('../scenes/party/index.ts').then((m) => m.partyScene),
  birthday: () => import('../scenes/birthday/index.ts').then((m) => m.birthdayScene),
  sports: () => import('../scenes/sports/index.ts').then((m) => m.sportsScene),
  dinner: () => import('../scenes/dinner/index.ts').then((m) => m.dinnerScene),
  business: () => import('../scenes/business/index.ts').then((m) => m.businessScene),
};

const ORDER: Category[] = ['party', 'birthday', 'sports', 'dinner', 'business'];
const POSES: { pose: CanonicalPose; label: string }[] = [
  { pose: 'host-ready', label: 'Host ready' },
  { pose: 'guest-ready', label: 'Guest ready' },
  { pose: 'accepted', label: 'Accepted' },
  { pose: 'declined', label: 'Declined' },
];

const root = document.getElementById('gallery-root')!;
root.innerHTML = `<div class="s-wrap">
  <header class="s-head">
    <p class="s-kicker">Milestone 7 · collection review</p>
    <h1>The five scenes side by side</h1>
    <p>Posters are the shipped runtime stills (identical framing and light to the live render). Pick any cell to play it in the live stage: host cells play the preparation, outcome cells play the guest's answer. Nothing is saved from this page.</p>
  </header>
  <div class="g-layout">
    <div class="g-live"><div class="g-stage" id="g-stage"></div><p class="g-caption" id="g-caption" aria-live="polite"></p></div>
    <div class="g-grid" id="g-grid"></div>
  </div>
</div>`;

const style = document.createElement('style');
style.textContent = `
.g-layout { display: grid; grid-template-columns: minmax(280px, 380px) minmax(0, 1fr); gap: 28px; align-items: start; }
.g-live { position: sticky; top: 16px; display: grid; gap: 10px; }
.g-stage { width: 100%; }
.g-caption { margin: 0; font-size: 0.875rem; color: var(--lt-text-2); min-height: 2.6em; }
.g-grid { display: grid; gap: 22px; min-width: 0; }
.g-row h2 { margin: 0 0 8px; font-size: 1rem; }
.g-row h2 span { color: var(--lt-text-2); font-weight: 500; }
.g-cells { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.g-cell { display: grid; gap: 4px; padding: 0; border: 0; background: none; text-align: left; font: inherit; cursor: pointer; border-radius: 10px; }
.g-cell img { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 10px; background: var(--lt-stage); display: block; }
.g-cell span { font-size: 0.75rem; color: var(--lt-text-2); }
.g-cell[aria-pressed="true"] img { outline: 2px solid var(--lt-focus); outline-offset: 2px; }
.g-cell:focus-visible { outline: 2px solid var(--lt-focus); outline-offset: 3px; }
@media (max-width: 760px) { .g-layout { grid-template-columns: 1fr; } .g-live { position: static; } .g-cells { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
`;
document.head.append(style);

let controller: InvitationHandle | null = null;
const caption = document.getElementById('g-caption')!;

function show(config: SceneConfig, pose: CanonicalPose, button: HTMLButtonElement) {
  document.querySelectorAll('.g-cell[aria-pressed="true"]').forEach((b) => b.setAttribute('aria-pressed', 'false'));
  button.setAttribute('aria-pressed', 'true');
  caption.textContent = `${CATEGORY_LABEL[config.category]} · ${presetOf(config)} · ${POSES.find((p) => p.pose === pose)!.label}`;
  if (!controller) {
    controller = createInvitation({
      mount: document.getElementById('g-stage')!,
      config,
      mode: pose === 'host-ready' ? 'host' : 'guest',
      scenes,
      posterFor: posterUrl,
      describePose: (c, p) => POSE_TEXT[c][p],
      // Review page: the "save" is acknowledged locally so outcomes can play; no service exists.
      onResponseRequested: (r) => queueMicrotask(() => controller?.applyResponseResult({ requestId: r.requestId, status: 'saved', response: r.response })),
    });
  } else {
    controller.setConfig(config);
  }
  const c = controller;
  if (pose === 'host-ready') {
    c.setMode('host');
    c.resetVisual();
    setTimeout(() => c.prepareHost(), 400);
  } else {
    c.setMode('guest');
    if (pose === 'accepted') setTimeout(() => c.chooseResponse('accept'), 400);
    if (pose === 'declined') setTimeout(() => c.chooseResponse('decline'), 400);
  }
}

const grid = document.getElementById('g-grid')!;
for (const category of ORDER) {
  for (const preset of PRESETS[category]) {
    const row = document.createElement('section');
    row.className = 'g-row';
    row.innerHTML = `<h2>${CATEGORY_LABEL[category]} <span>· ${OBJECT_LABEL[category]} · ${preset.label}</span></h2><div class="g-cells"></div>`;
    const cells = row.querySelector('.g-cells')!;
    for (const { pose, label } of POSES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'g-cell';
      b.setAttribute('aria-pressed', 'false');
      const url = posterUrl(category, presetOf(preset.config), pose);
      b.innerHTML = `${url ? `<img src="${url}" alt="" loading="lazy" decoding="async" />` : '<img alt="" />'}<span>${label}</span>`;
      b.setAttribute('aria-label', `${CATEGORY_LABEL[category]}, ${preset.label}, ${label}: play in the live stage`);
      b.addEventListener('click', () => show(preset.config, pose, b));
      cells.append(b);
    }
    grid.append(row);
  }
}
document.body.dataset.ready = 'true';
