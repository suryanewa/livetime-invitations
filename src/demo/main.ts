/*
 * DIRECTION CONTRACT (showcase shell)
 * THESIS: the object is the hero; the interface is a precise instrument beside it. Refuses
 *   the dashboard-of-cards demo page.
 * OWN-WORLD: warm white page, #D5D2CD stage (the production rig's measured backdrop), ink type, segmented controls on a #EEECE6 track,
 *   one perforation-dot rule echoing the objects' signature. System sans (pinned by spec).
 * STORY: host prepares the card → previews as guest → guest answers → simulated save status.
 * FIRST VIEWPORT (v1.4): the scene fills the screen; the header (brand, badge, Motion, the
 *   event) floats top-left and the dock (mode, panel, collection, Developer) floats right, or as
 *   a bottom sheet in portrait. The object is framed in the square the overlays leave free. In
 *   host mode the preset choice precedes the primary action because the host picks, then acts.
 * FORM: shaped directly from a precisely specified brief. Concept roll waived by user,
 *   2026-09-28 (checkpoint 2: "keep the shell"), so no seed key exists.
 * FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review,
 *   the verdict, and DESIGN.md
 */
import '../ui/shell.css';
import './showcase.css';
import { createInvitation, type InvitationHandle, type InvitationState, type SceneRegistry } from '../core/controller.ts';
import { presetOf } from '../core/config.ts';
import type { Category, FrameInsets, Mode, ResponseRequest, SceneConfig } from '../core/types.ts';
import { DEFAULT_CONFIGS } from '../core/types.ts';
import { createGuestControls, ICONS } from '../ui/guestControls.ts';
import type { Tier } from '../render/quality.ts';
import { MockResponseAdapter, type MockMode, MOCK_DELAYS } from './mockAdapter.ts';
import { CATEGORY_LABEL, EVENTS, HOST_ACTION, LIVE_CATEGORIES, OBJECT_LABEL, POSE_TEXT, PRESET_LEGEND, PRESETS, SONGS, songTitle, withCard } from './fixtures.ts';
import { backdropUrl, posterUrl } from './posters.ts';
import { collectionThumb } from './collection.ts';
import { DEFAULT_RIG, RIGS, rigNames } from '../render/rigRegistry.ts';

const scenes: SceneRegistry = {
  party: () => import('../scenes/party/index.ts').then((m) => m.partyScene),
  birthday: () => import('../scenes/birthday/index.ts').then((m) => m.birthdayScene),
  sports: () => import('../scenes/sports/index.ts').then((m) => m.sportsScene),
  dinner: () => import('../scenes/dinner/index.ts').then((m) => m.dinnerScene),
  business: () => import('../scenes/business/index.ts').then((m) => m.businessScene),
};

const app = document.getElementById('app')!;
app.innerHTML = `
  <div class="sc">
    <div class="sc-stage" data-bind="stage"></div>
    <header class="sc-top sc-surface" data-bind="top">
      <div class="sc-bar">
        <p class="sc-brand"><strong>Livetime</strong><span>Invitation interactions</span></p>
        <div class="sc-top-actions">
          <span class="sc-badge" title="This demo never contacts a real RSVP service">Simulated saves</span>
          <button class="sc-motion" type="button" aria-pressed="true" data-action="motion">
            <span class="sc-motion__label">Motion</span><span class="sc-motion__value" aria-hidden="true">On</span>
          </button>
        </div>
      </div>
      <div class="sc-rule" aria-hidden="true"></div>
      <div class="sc-event">
        <h1 class="sc-event__title" data-bind="title"></h1>
        <p class="sc-event__meta"><span class="sc-meta"><span data-bind="when"></span><span data-bind="where"></span><span class="sc-sample">Sample event</span></span></p>
        <p class="sc-track" data-bind="track" hidden><span class="sc-track__k">Song</span> <span data-bind="track-title"></span></p>
      </div>
    </header>
    <section class="sc-dock sc-surface" aria-label="Invitation controls" data-bind="dock" data-collapsed="false">
      <div class="sc-dock__head">
        <div class="sc-seg sc-mode" role="group" aria-label="Preview as">
          <button type="button" data-mode="host" aria-pressed="true">Host</button>
          <button type="button" data-mode="guest" aria-pressed="false">Guest</button>
        </div>
        <button class="sc-collapse" type="button" aria-expanded="true" aria-controls="sc-dock-body" aria-label="Controls" data-action="collapse">
          <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M5.5 8l4.5 4.5L14.5 8" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
      <div class="sc-dock__body" id="sc-dock-body" data-bind="dock-body">
        <div class="sc-dock__primary" data-bind="primary">
          <div class="sc-panel" data-panel="host">
            <fieldset class="sc-field" data-bind="songs-field" hidden>
              <legend>Song</legend>
              <div class="sc-seg sc-seg--wrap" data-bind="songs"></div>
            </fieldset>
            <fieldset class="sc-field">
              <legend data-bind="preset-legend">Card template</legend>
              <div class="sc-seg" data-bind="presets"></div>
            </fieldset>
            <div class="sc-host-actions">
              <button class="sc-primary" type="button" data-action="prepare"></button>
              <button class="sc-secondary" type="button" data-action="preview">Preview as guest</button>
            </div>
            <p class="sc-note" data-bind="host-note">Changing the template resets the preview. Nothing is sent to guests from this page.</p>
          </div>
          <div class="sc-panel" data-panel="guest" hidden></div>
          <div class="sc-graphics" data-bind="graphics" hidden>
            <p data-bind="graphics-text"></p>
            <button class="sc-quiet-btn" type="button" data-action="retry-3d">Try 3D again</button>
          </div>
        </div>

        <section class="sc-collection" aria-labelledby="sc-collection-h">
          <h2 id="sc-collection-h">The collection</h2>
          <ul class="sc-rail" data-bind="rail"></ul>
          <p class="visually-hidden" aria-live="polite" data-bind="announce"></p>
        </section>

        <details class="sc-dev">
          <summary><span>Developer</span><span class="sc-dev__hint">State, simulated saves and fallbacks</span></summary>
          <div class="sc-dev__body">
            <fieldset class="sc-field">
              <legend>Simulated save</legend>
              <div class="sc-seg sc-seg--small" data-bind="mock">
                <button type="button" data-mock="normal" aria-pressed="true">Normal <small>${MOCK_DELAYS.normal} ms</small></button>
                <button type="button" data-mock="slow" aria-pressed="false">Slow <small>3 s</small></button>
                <button type="button" data-mock="fail" aria-pressed="false">Fail</button>
              </div>
            </fieldset>
            <fieldset class="sc-field">
              <legend>Render quality</legend>
              <div class="sc-seg sc-seg--small" data-bind="tier">
                <button type="button" data-tier="high" aria-pressed="false">High</button>
                <button type="button" data-tier="normal" aria-pressed="true">Normal</button>
                <button type="button" data-tier="low" aria-pressed="false">Low</button>
                <button type="button" data-tier="static" aria-pressed="false">Static</button>
              </div>
            </fieldset>
            <dl class="sc-state" data-bind="state"></dl>
            <div class="sc-dev__actions">
              <button class="sc-quiet-btn" type="button" data-action="reset">Reset demo</button>
              <button class="sc-quiet-btn" type="button" data-action="lose-context">Simulate graphics loss</button>
              <button class="sc-quiet-btn" type="button" data-action="retry-3d">Restore 3D (dev)</button>
            </div>
            <h3 class="sc-dev__h">Integration events</h3>
            <ol class="sc-log" data-bind="log" aria-live="off"></ol>
          </div>
        </details>
      </div>
    </section>
  </div>`;

const $ = <T extends Element = HTMLElement>(sel: string) => app.querySelector<T>(sel)!;
const $$ = <T extends Element = HTMLElement>(sel: string) => [...app.querySelectorAll<T>(sel)];
/** Polite, visually hidden: names the event a rail choice just opened. */
const announce = $('[data-bind="announce"]');

// ── Overlay layout (v1.4: fullscreen scene, floating UI) ───────────────────
const stageEl = $('[data-bind="stage"]');
const topEl = $('[data-bind="top"]');
const dock = $('[data-bind="dock"]');
const primary = $('[data-bind="primary"]');
const collapseBtn = $<HTMLButtonElement>('[data-action="collapse"]');
/** CSS owns the breakpoints: the dock says whether it is a bottom sheet or a side column. */
const sheetLayout = () => getComputedStyle(dock).getPropertyValue('--sc-layout').trim() === 'sheet';
/** Breathing room between an overlay and the object's frame square. */
const FRAME_GAP = 8;

/**
 * The stage area the overlays cover. The controller frames the object in the largest square left
 * free, so the title and the controls never sit on it: the header strip above, and the dock to
 * the right (side column) or below (bottom sheet).
 */
function overlayInsets(): FrameInsets {
  const s = stageEl.getBoundingClientRect();
  const t = topEl.getBoundingClientRect();
  const d = dock.getBoundingClientRect();
  const top = Math.max(0, t.bottom - s.top + FRAME_GAP);
  if (sheetLayout()) return { top, right: 0, bottom: Math.max(0, s.bottom - d.top + FRAME_GAP), left: 0 };
  return { top, right: Math.max(0, s.right - d.left + FRAME_GAP), bottom: 16, left: 0 };
}

/**
 * The sheet's resting height is the active panel plus a peek of the collection, so the scene keeps
 * most of the phone; the rest of the sheet (collection, Developer) scrolls inside it.
 */
function syncOverlay() {
  document.documentElement.style.setProperty('--sc-top-h', `${Math.round(topEl.getBoundingClientRect().bottom)}px`);
  dock.style.setProperty('--sc-primary-h', `${Math.ceil(primary.getBoundingClientRect().height)}px`);
  controller?.setFrameInsets(overlayInsets());
}
const overlayObserver = new ResizeObserver(() => syncOverlay());
for (const el of [topEl, dock, primary]) overlayObserver.observe(el);
addEventListener('resize', syncOverlay);

function setCollapsed(collapsed: boolean) {
  dock.dataset.collapsed = String(collapsed);
  collapseBtn.setAttribute('aria-expanded', String(!collapsed));
  syncOverlay();
}
collapseBtn.addEventListener('click', () => setCollapsed(dock.dataset.collapsed !== 'true'));

/** ?scene=party opens a live scene directly (links, tests, captures). */
const sceneParam = new URLSearchParams(location.search).get('scene') as Category | null;
let category: Category = sceneParam && LIVE_CATEGORIES.includes(sceneParam) ? sceneParam : 'business';
let config: SceneConfig = DEFAULT_CONFIGS[category];
let mode: Mode = 'host';
const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
let motionOn = !motionQuery.matches;
/** Once the viewer uses the toggle it wins; until then the OS preference is followed live. */
let motionOverridden = false;
let mockMode: MockMode = 'normal';
let controller: InvitationHandle | null = null;
let adapter: MockResponseAdapter | null = null;
let hostPrepared = false;
/** v1.7: whether the showcase prints Dinner's card (its sample text by mode) or a config brought its own. */
let ownCard = true;
/** Dev/test: ?saved=accept|decline simulates an authoritative response loaded from the app. */
const savedParam = new URLSearchParams(location.search).get('saved');
/**
 * `?rig=<name>` picks a studio rig from src/render/rigs/ for comparison, on a local dev host only
 * (as the Models viewer accepts `?env=`); everywhere else the production rig renders.
 */
const LOCAL_HOST = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(location.hostname);
const rigParam = LOCAL_HOST ? new URLSearchParams(location.search).get('rig') : null;
if (rigParam && !RIGS.has(rigParam)) console.warn(`Unknown rig "${rigParam}"; registered: ${rigNames().join(', ')}`);
const rig = rigParam && RIGS.has(rigParam) ? rigParam : DEFAULT_RIG;
/**
 * The posters (and the `--lt-stage` token) belong to the production rig. A comparison rig shows no
 * poster (the stage waits on its own colour; Static shows the pose sentence) and paints the stage
 * surround in its own measured colour, so poster, canvas and CSS agree under every `?rig=`.
 */
const comparisonRig = rig !== DEFAULT_RIG ? RIGS.get(rig)! : null;
/** `?camera=ortho` (local only): the v1.1 orthographic camera, for before/after composition checks. */
const projection = LOCAL_HOST && new URLSearchParams(location.search).get('camera') === 'ortho' ? 'orthographic' : 'perspective';
let initialResponse: 'accept' | 'decline' | undefined = savedParam === 'accept' || savedParam === 'decline' ? savedParam : undefined;
if (initialResponse) mode = 'guest';
const requests: ResponseRequest[] = [];
const events: string[] = [];

const guest = createGuestControls({
  onChoose: (r) => controller?.chooseResponse(r),
  onRetry: () => controller?.retryResponse(),
  onReplay: () => controller?.replay(),
});
$('[data-panel="guest"]').append(guest.element);

// ── Integration event log (developer drawer) ───────────────────────────────
const logEl = $('[data-bind="log"]');
function log(kind: string, detail: string) {
  const li = document.createElement('li');
  const time = new Date().toLocaleTimeString([], { hour12: false });
  li.innerHTML = `<time>${time}</time><b>${kind}</b><span>${detail}</span>`;
  events.push(`${kind} ${detail}`);
  logEl.prepend(li);
  while (logEl.children.length > 10) logEl.lastElementChild!.remove();
}

// ── Controller lifecycle ───────────────────────────────────────────────────
function mount() {
  controller?.dispose();
  adapter?.dispose();
  hostPrepared = false;
  const stage = $('[data-bind="stage"]');
  stage.replaceChildren();
  if (comparisonRig) stage.style.setProperty('--lt-stage', comparisonRig.stageColor);
  adapter = new MockResponseAdapter((result) => {
    log('result', result.status === 'saved' ? `${result.requestId} saved ${result.response}` : `${result.requestId} error`);
    controller?.applyResponseResult(result);
  });
  adapter.mode = mockMode;
  if (initialResponse) adapter.stored = initialResponse;
  // v1.7: Dinner's card prints the event and, in guest mode, a sample invitee (fixtures.ts).
  config = withCard(config, mode, ownCard);
  controller = createInvitation({
    mount: stage,
    layout: 'fullscreen',
    frameInsets: overlayInsets(),
    config,
    mode,
    initialResponse,
    direction: 'L2',
    stage: { rig, projection },
    reducedMotion: motionOverridden ? !motionOn : undefined,
    scenes,
    posterFor: comparisonRig ? undefined : posterUrl,
    backdropFor: comparisonRig ? undefined : backdropUrl,
    describePose: (c, pose) => POSE_TEXT[c][pose],
    onResponseRequested: (req) => {
      requests.push(req);
      log('request', `${req.requestId} ${req.response}`);
      adapter?.submit(req);
    },
    onVisualComplete: ({ sequence }) => {
      log('visual', `${sequence} complete`);
      if (sequence === 'host') hostPrepared = true;
      render(controller!.getState());
    },
    onResourceState: ({ state, reason }) => log('resource', `${state} · ${reason}`),
    onIntegrationError: (e) => log('integration', e.kind),
    onStateChange: render,
  });
  // The graphics notice names what the stage shows: the controller swaps a poster that fails
  // to load for a sentence without emitting, so re-render when the poster settles.
  const poster = stage.querySelector('img.lt-stage__poster');
  const settle = () => controller && render(controller.getState());
  poster?.addEventListener('load', settle);
  poster?.addEventListener('error', settle);
}

// ── Rendering ──────────────────────────────────────────────────────────────
function renderStatic() {
  const ev = EVENTS[category];
  $('[data-bind="title"]').textContent = ev.title;
  $('[data-bind="when"]').textContent = ev.when;
  $('[data-bind="where"]').textContent = ev.where;
  $('[data-action="prepare"]').textContent = HOST_ACTION[category];
  const words = PRESET_LEGEND[category];
  // Dinner (v1.2) is the cloche and the clean plate, no food: no preset control. Its config keeps
  // `dish` for integration compatibility; it selects nothing.
  const presetControl = category !== 'dinner';
  $('[data-bind="preset-legend"]').textContent = words.legend;
  $('[data-bind="host-note"]').textContent = presetControl
    ? `Changing the ${words.noun} resets the preview. Nothing is sent to guests from this page.`
    : 'Nothing is sent to guests from this page.';

  const presets = $('[data-bind="presets"]');
  (presets.closest('fieldset') as HTMLFieldSetElement).hidden = !presetControl;
  presets.replaceChildren(
    ...(presetControl ? PRESETS[category] : []).map((p) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = p.label;
      b.dataset.preset = presetOf(p.config);
      b.addEventListener('click', () => {
        // Party keeps the chosen song when the label changes.
        config = config.category === 'party' && p.config.category === 'party' ? { ...p.config, songId: config.songId } : p.config;
        hostPrepared = false;
        controller?.setConfig(config);
        syncPresets();
      });
      return b;
    }),
  );

  // Party: finite song choice (demo fixtures) shown in HTML; the label art stays decorative.
  const songsField = $('[data-bind="songs-field"]');
  songsField.hidden = category !== 'party';
  $('[data-bind="songs"]').replaceChildren(
    ...SONGS.map((song) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = song.title;
      b.dataset.song = song.id;
      b.addEventListener('click', () => {
        if (config.category !== 'party') return;
        config = { ...config, songId: song.id };
        hostPrepared = false;
        controller?.setConfig(config);
        syncPresets();
      });
      return b;
    }),
  );
  syncPresets();

  const rail = $('[data-bind="rail"]');
  // Choosing a scene rebuilds the rail; keyboard focus returns to the item just pressed.
  const railFocused = rail.contains(document.activeElement);
  rail.replaceChildren(
    ...(['party', 'birthday', 'sports', 'dinner', 'business'] as Category[]).map((c) => {
      const li = document.createElement('li');
      const live = LIVE_CATEGORIES.includes(c);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sc-rail__item';
      b.setAttribute('aria-pressed', String(c === category));
      // aria-pressed carries "showing"; the name stays the scene and its object.
      b.setAttribute('aria-label', `${CATEGORY_LABEL[c]}, ${OBJECT_LABEL[c].toLowerCase()}${live ? '' : ', in production'}`);
      if (!live) b.setAttribute('aria-disabled', 'true');
      b.innerHTML = `
        <img src="${collectionThumb(c)}" alt="" width="96" height="96" loading="lazy" decoding="async" />
        <span class="sc-rail__name" aria-hidden="true">${CATEGORY_LABEL[c]}</span>`;
      b.addEventListener('click', () => {
        if (!live || c === category) return;
        // Each category is its own invitation: dispose and mount a fresh controller and adapter
        // with no response, never carry one across (Master §7, docs/integration.md).
        category = c;
        config = DEFAULT_CONFIGS[c];
        initialResponse = undefined;
        mount();
        renderStatic();
        log('demo', `new invitation · ${c}`);
        announce.textContent = `Showing ${CATEGORY_LABEL[c]}: ${EVENTS[c].title}`;
      });
      li.append(b);
      return li;
    }),
  );
  if (railFocused) rail.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus();
}

function syncPresets() {
  const current = presetOf(config);
  $$<HTMLButtonElement>('[data-bind="presets"] button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.preset === current)));
  const songId = config.category === 'party' ? config.songId : undefined;
  $$<HTMLButtonElement>('[data-bind="songs"] button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.song === songId)));
  const track = $('[data-bind="track"]');
  track.hidden = config.category !== 'party';
  $('[data-bind="track-title"]').textContent = songTitle(songId);
}

/** The controller's poster has a source and has not failed (a loading poster counts; a failure re-renders). */
function posterShown(): boolean {
  const img = $('[data-bind="stage"]').querySelector<HTMLImageElement>('img.lt-stage__poster');
  return !!img && !img.hidden && img.hasAttribute('src') && !(img.complete && img.naturalWidth === 0);
}

function render(state: InvitationState) {
  mode = state.mode;
  // v1.7: the card follows the mode (the host's has no name line): a print-only change, which
  // reprints the card where it lies and resets nothing (controller.setConfig).
  const card = ownCard ? withCard(config, mode, true) : config;
  if (card !== config && JSON.stringify(card) !== JSON.stringify(config)) {
    config = card;
    controller?.setConfig(config);
  }
  $$<HTMLButtonElement>('.sc-mode button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
  ($('[data-panel="host"]') as HTMLElement).hidden = mode !== 'host';
  ($('[data-panel="guest"]') as HTMLElement).hidden = mode !== 'guest';
  const prepare = $<HTMLButtonElement>('[data-action="prepare"]');
  const playing = state.visual === 'host-playing';
  prepare.textContent = hostPrepared ? `${HOST_ACTION[category]} again` : HOST_ACTION[category];
  // aria-disabled, not disabled: a disabled button would drop keyboard focus mid-sequence.
  prepare.setAttribute('aria-disabled', String(playing));
  $<HTMLButtonElement>('[data-action="preview"]').dataset.emphasis = hostPrepared ? 'true' : 'false';
  guest.update(state);

  const graphics = $('[data-bind="graphics"]');
  const unavailable = state.resource === 'fallback' || state.canRetryGraphics;
  // Hiding the notice must not drop keyboard focus to the page: hand it to the scene's control.
  const hadFocus = !unavailable && !graphics.hidden && graphics.contains(document.activeElement);
  graphics.hidden = !unavailable;
  if (hadFocus) (mode === 'host' ? $<HTMLButtonElement>('[data-action="prepare"]') : $<HTMLButtonElement>('[data-panel="guest"] button'))?.focus();
  // Hosts have no response to reassure about; a missing or failed poster leaves a sentence, not an image.
  const works = mode === 'host' ? 'Presets and preview still work.' : 'Your response still works.';
  const shows = state.resource !== 'fallback' ? 'The 3D scene is taking a while.' : posterShown() ? 'Showing a still image.' : 'The 3D scene isn’t available right now.';
  $('[data-bind="graphics-text"]').textContent = `${shows} ${works}`;

  $$<HTMLButtonElement>('[data-bind="tier"] button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tier === state.tier)));
  const rows: [string, string][] = [
    ['Resource', `${state.resource} · ${state.resourceReason}`],
    ['Visual', state.visual],
    ['Response', `${state.response.intent ?? '—'} · ${state.response.persistence}`],
    ['Request', state.response.latestRequestId ?? '—'],
    ['Quality', state.tier],
    ['Motion', state.reducedMotion ? 'reduced' : 'full'],
    ['Stored (mock)', adapter?.stored ?? '—'],
  ];
  $('[data-bind="state"]').innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
}

// ── Wiring ─────────────────────────────────────────────────────────────────
$$<HTMLButtonElement>('.sc-mode button').forEach((b) =>
  b.addEventListener('click', () => {
    // Choosing a mode means using its panel: a collapsed dock opens again.
    if (dock.dataset.collapsed === 'true') setCollapsed(false);
    controller?.setMode(b.dataset.mode as Mode);
  }),
);
$('[data-action="prepare"]').addEventListener('click', () => {
  // Ignored while the host sequence plays (the button is aria-disabled then).
  if (controller?.getState().visual === 'host-playing') return;
  controller?.prepareHost();
});
$('[data-action="preview"]').addEventListener('click', () => {
  controller?.setMode('guest');
  // This button's panel just hid; keep keyboard focus in the flow on the first answer.
  $<HTMLButtonElement>('[data-panel="guest"] [data-response="accept"]').focus();
});

const motionBtn = $<HTMLButtonElement>('[data-action="motion"]');
function syncMotion() {
  motionBtn.setAttribute('aria-pressed', String(motionOn));
  // Shell CSS motion (saving spinner, check draw) honours this as it does the OS setting.
  document.documentElement.dataset.motion = motionOn ? 'on' : 'off';
  motionBtn.querySelector('.sc-motion__value')!.textContent = motionOn ? 'On' : 'Off';
}
motionBtn.addEventListener('click', () => {
  motionOn = !motionOn;
  motionOverridden = true;
  syncMotion();
  controller?.setReducedMotion(!motionOn);
});
motionQuery.addEventListener('change', () => {
  if (motionOverridden) return;
  motionOn = !motionQuery.matches;
  syncMotion();
});

$$<HTMLButtonElement>('[data-bind="mock"] button').forEach((b) =>
  b.addEventListener('click', () => {
    mockMode = b.dataset.mock as MockMode;
    if (adapter) adapter.mode = mockMode;
    $$<HTMLButtonElement>('[data-bind="mock"] button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    log('mock', `save mode ${mockMode}`);
  }),
);
$$<HTMLButtonElement>('[data-bind="tier"] button').forEach((b) =>
  b.addEventListener('click', () => controller?.setQualityTier(b.dataset.tier as Tier)),
);
$('[data-action="reset"]').addEventListener('click', () => {
  logEl.replaceChildren();
  initialResponse = undefined;
  mount();
  log('demo', 'reset');
});
$$('[data-action="retry-3d"]').forEach((b) => b.addEventListener('click', () => controller?.retryGraphics()));
$('[data-action="lose-context"]').addEventListener('click', () => {
  const canvas = $('[data-bind="stage"] canvas') as HTMLCanvasElement | null;
  const gl = canvas?.getContext('webgl2');
  gl?.getExtension('WEBGL_lose_context')?.loseContext();
  log('demo', 'graphics context lost (simulated)');
});

// Tooling hook (dev builds only): drives deterministic captures and posters.
if (import.meta.env.DEV) {
  (window as unknown as { __showcase: unknown }).__showcase = {
    get controller() {
      return controller;
    },
    get state() {
      return controller?.getState();
    },
    get adapter() {
      return adapter;
    },
    requests,
    events,
    /** Registered studio rigs and the one this page renders (capture tooling). */
    rigs: rigNames(),
    rig,
    setConfig(next: SceneConfig) {
      const switched = next.category !== category;
      // A Dinner config without a card takes the showcase's (capture and tests pass the preset only);
      // one with its own card keeps it, and the showcase stops reprinting it on mode changes.
      ownCard = next.category !== 'dinner' || !next.card;
      config = withCard(next, mode);
      category = next.category;
      controller?.setConfig(config);
      if (switched) renderStatic();
      else syncPresets();
    },
  };
}

void ICONS;
syncMotion();
renderStatic();
mount();
