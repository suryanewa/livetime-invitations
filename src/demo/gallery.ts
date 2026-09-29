import '../ui/shell.css';
import './study.css';
import { createInvitation, type InvitationHandle, type SceneRegistry } from '../core/controller.ts';
import { presetOf } from '../core/config.ts';
import type { CanonicalPose, Category, Mode, ResourceState, SceneConfig } from '../core/types.ts';
import { CATEGORY_LABEL, OBJECT_LABEL, POSE_TEXT, PRESETS } from './fixtures.ts';
import { posterUrl } from './posters.ts';

/**
 * Collection review (Production Plan M7): the five scenes side by side, one column each, with
 * the host-ready pose, the guest-ready pose and both guest outcomes as rows (shipped posters),
 * one preset set at a time, plus one live canvas that shows or plays whichever cell is picked.
 * Tooling page (noindex); saves are acknowledged locally and never leave the page.
 */

const scenes: SceneRegistry = {
  party: () => import('../scenes/party/index.ts').then((m) => m.partyScene),
  birthday: () => import('../scenes/birthday/index.ts').then((m) => m.birthdayScene),
  sports: () => import('../scenes/sports/index.ts').then((m) => m.sportsScene),
  dinner: () => import('../scenes/dinner/index.ts').then((m) => m.dinnerScene),
  business: () => import('../scenes/business/index.ts').then((m) => m.businessScene),
};

const ORDER: Category[] = ['party', 'birthday', 'sports', 'dinner', 'business'];
const POSES: { pose: CanonicalPose; label: string; hint: string }[] = [
  { pose: 'host-ready', label: 'Host ready', hint: 'plays the preparation' },
  { pose: 'guest-ready', label: 'Guest ready', hint: 'shown at rest' },
  { pose: 'accepted', label: 'Accepted', hint: 'plays the accept' },
  { pose: 'declined', label: 'Declined', hint: 'plays the decline' },
];
/** Preset sets: A shows every scene's first curated preset, B its second. */
const SETS = ['A', 'B'];
/** A scene that had to load first plays this long after it is ready, once its canvas has faded in. */
const AFTER_READY_MS = 300;

type Pick = { category: Category; set: number; pose: CanonicalPose };

const root = document.getElementById('gallery-root')!;
root.innerHTML = `<div class="s-wrap g-page">
  <header class="s-head">
    <p class="s-kicker">Livetime · Invitation interactions · Milestone 7</p>
    <h1>Collection review</h1>
    <p>The five scenes side by side, one column each, from the shipped posters (same framing and light as the live render). Pick any cell to see it in the live stage; nothing is saved from this page.</p>
  </header>
  <div class="g-layout">
    <div class="g-live"><div class="g-stage" id="g-stage"></div><p class="g-caption" id="g-caption" aria-live="polite"></p></div>
    <div class="g-matrix">
      <div class="g-toolbar"><span class="g-toolbar__label" id="g-sets-label">Presets</span><div class="s-seg" role="group" aria-labelledby="g-sets-label" id="g-sets"></div></div>
      <div class="g-heads" id="g-heads" aria-hidden="true"></div>
      <div class="g-rows" id="g-rows"></div>
    </div>
  </div>
</div>`;

const stageEl = document.getElementById('g-stage')!;
const caption = document.getElementById('g-caption')!;
const setsEl = document.getElementById('g-sets')!;
const headsEl = document.getElementById('g-heads')!;
const rowsEl = document.getElementById('g-rows')!;

let controller: InvitationHandle | null = null;
/** The preset set the grid shows. */
let shownSet = 0;
/** The cell the live stage shows (on load: Party, first preset, guest-ready, not playing). */
let pick: Pick = { category: 'party', set: 0, pose: 'guest-ready' };
/** Every pick bumps the token; an action queued for an earlier pick never runs. */
let token = 0;
/** The current pick's action, waiting for its scene to finish loading. */
let waiting: (() => void) | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

const settled = (state: ResourceState) => state === 'ready' || state === 'fallback';
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const presetFor = (p: Pick) => PRESETS[p.category][p.set]!;
const poseLabel = (pose: CanonicalPose) => POSES.find((p) => p.pose === pose)!.label;

function mount(config: SceneConfig, mode: Mode): InvitationHandle {
  const handle: InvitationHandle = createInvitation({
    mount: stageEl,
    config,
    mode,
    scenes,
    posterFor: posterUrl,
    describePose: (c, p) => POSE_TEXT[c][p],
    // Review page: the "save" is acknowledged locally so outcomes can play; no service exists.
    onResponseRequested: (r) => queueMicrotask(() => handle.applyResponseResult({ requestId: r.requestId, status: 'saved', response: r.response })),
    onResourceState: ({ state }) => {
      if (!waiting || !settled(state)) return;
      const run = waiting;
      waiting = null;
      timer = setTimeout(run, AFTER_READY_MS);
    },
  });
  return handle;
}

/** Run `action` for pick `id` as soon as the live scene can play it: now, or once it has loaded. */
function whenPlayable(c: InvitationHandle, id: number, action: () => void) {
  const run = () => {
    if (id === token && c === controller) action();
  };
  if (settled(c.getState().resource)) run();
  else waiting = run;
}

/** Narrow layouts keep the stage sticky; if it is still out of view, bring it in. */
function revealStage() {
  const r = stageEl.getBoundingClientRect();
  if (r.top >= 0 && r.bottom <= innerHeight) return;
  stageEl.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
}

function show(next: Pick, reveal = true) {
  pick = next;
  const id = ++token;
  clearTimeout(timer);
  waiting = null;
  syncPressed();
  const { config, label } = presetFor(next);
  caption.textContent = `${CATEGORY_LABEL[next.category]} · ${label} · ${poseLabel(next.pose)}`;
  const mode: Mode = next.pose === 'host-ready' ? 'host' : 'guest';
  // The response ledger cannot be cleared through the controller; a fresh one shows guest-ready.
  if (controller && next.pose === 'guest-ready' && controller.getState().response.intent) {
    controller.dispose();
    controller = null;
  }
  if (!controller) controller = mount(config, mode);
  const c = controller;
  c.setMode(mode);
  c.setConfig(config);
  if (next.pose === 'host-ready') {
    c.resetVisual();
    whenPlayable(c, id, () => c.prepareHost());
  } else if (next.pose === 'guest-ready') {
    c.resetVisual();
  } else {
    const want = next.pose === 'accepted' ? 'accept' : 'decline';
    // A new answer is recorded at once, so the stage poster shows it while a scene loads. The
    // sequence then always plays from guest-ready, also when the answer repeats the last one.
    if (c.getState().response.intent !== want) c.chooseResponse(want);
    whenPlayable(c, id, () => c.replay());
  }
  if (reveal) revealStage();
}

function syncPressed() {
  for (const b of rowsEl.querySelectorAll<HTMLButtonElement>('.g-cell')) {
    const on = b.dataset.category === pick.category && Number(b.dataset.set) === pick.set && b.dataset.pose === pick.pose;
    b.setAttribute('aria-pressed', String(on));
  }
}

function renderSets() {
  setsEl.replaceChildren(
    ...SETS.map((name, set) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = `Preset ${name}`;
      b.setAttribute('aria-pressed', String(set === shownSet));
      b.addEventListener('click', () => {
        if (set === shownSet) return;
        shownSet = set;
        for (const [i, other] of [...setsEl.children].entries()) other.setAttribute('aria-pressed', String(i === set));
        renderMatrix();
      });
      return b;
    }),
  );
}

function renderMatrix() {
  const set = shownSet;
  const corner = document.createElement('span');
  corner.className = 'g-corner';
  headsEl.replaceChildren(
    corner,
    ...ORDER.map((category) => {
      const head = document.createElement('div');
      head.className = 'g-head';
      const { label } = PRESETS[category][set]!;
      head.innerHTML = `<b>${CATEGORY_LABEL[category]}</b><span>${label}</span>`;
      head.title = `${OBJECT_LABEL[category]} · ${label}`;
      return head;
    }),
  );
  rowsEl.replaceChildren(
    ...POSES.map(({ pose, label, hint }) => {
      const row = document.createElement('section');
      row.className = 'g-row';
      row.setAttribute('aria-labelledby', `g-row-${pose}`);
      row.innerHTML = `<h2 class="g-row__label" id="g-row-${pose}">${label} <span>${hint}</span></h2>`;
      for (const category of ORDER) {
        const preset = PRESETS[category][set]!;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'g-cell';
        b.dataset.category = category;
        b.dataset.set = String(set);
        b.dataset.pose = pose;
        const url = posterUrl(category, presetOf(preset.config), pose);
        b.innerHTML = url
          ? `<img src="${url}" alt="" loading="lazy" decoding="async" />`
          : '<span class="g-cell__pending">Poster pending</span>';
        const verb = pose === 'guest-ready' ? 'show' : 'play';
        b.setAttribute('aria-label', `${CATEGORY_LABEL[category]}, ${preset.label}, ${label}: ${verb} in the live stage`);
        b.addEventListener('click', () => show({ category, set, pose }));
        row.append(b);
      }
      return row;
    }),
  );
  syncPressed();
}

renderSets();
renderMatrix();
show(pick, false);
document.body.dataset.ready = 'true';

if (import.meta.env.DEV) {
  (window as unknown as { __gallery: unknown }).__gallery = {
    get controller() {
      return controller;
    },
    get state() {
      return controller?.getState();
    },
    get pick() {
      return pick;
    },
  };
}
