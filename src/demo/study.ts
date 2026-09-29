import '../ui/shell.css';
import './study.css';
import { Vector3 } from 'three';
import { buildBasketballBlockout, buildDishBlockout, buildRecordPlayerBlockout } from '../../models/blockouts.ts';
import { buildCake, CAKE_METRICS } from '../../models/cake.ts';
import { buildKeycard, CARD, CARD_OFFSET_Y, HANG_PIVOT, SCANNER_POS, type KeycardModel } from '../../models/keycard.ts';
import type { BuiltModel } from '../../models/types.ts';
import { CAMERA_ANGLES } from '../render/camera.ts';
import { LIGHT_RIG } from '../render/lighting.ts';
import { DIRECTIONS, type DirectionId, MaterialLibrary } from '../render/materials.ts';
import { Stage } from '../render/stage.ts';
import { ANGLE_EPSILON, FixedStepper, Spring } from '../motion/spring.ts';
import { RUBRIC_DIMENSIONS, STUDY_RECORD } from './studyRubric.ts';

const ICON = {
  check: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4.5 10.5l3.5 3.5 7.5-8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  minus: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 10h10" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

const EVENTS = {
  cake: { eyebrow: "You're invited", title: "Alex's birthday", meta: 'Sat, Oct 17 · 7:00 PM · The Loft, 214 Grand St' },
  keycard: { eyebrow: "You're invited", title: 'Partner Summit — Welcome Reception', meta: 'Thu, Nov 12 · 6:30 PM · Hudson Yards' },
};

type Subject = 'cake' | 'keycard' | 'record' | 'sports' | 'dish';
const SUBJECT_LABEL: Record<Subject, string> = { cake: 'Cake', keycard: 'Badge', record: 'Record player', sports: 'Basketball', dish: 'Covered dish' };

const DIRS = ['L', 'A', 'B'] as const;
const dirLabel = (d: DirectionId) => (d === 'L' ? 'L — Satin Enamel (locked)' : `${d} — ${DIRECTIONS[d].name}`);

const libraries: Record<DirectionId, MaterialLibrary> = { A: new MaterialLibrary('A'), B: new MaterialLibrary('B'), L: new MaterialLibrary('L'), L2: new MaterialLibrary('L2') };

function build(subject: Subject, dir: DirectionId): BuiltModel {
  const ctx = { lib: libraries[dir] };
  switch (subject) {
    case 'cake': return buildCake(ctx, 'vanilla');
    case 'keycard': return buildKeycard(ctx, 'light');
    case 'record': return buildRecordPlayerBlockout(ctx);
    case 'sports': return buildBasketballBlockout(ctx);
    case 'dish': return buildDishBlockout(ctx);
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (html) e.innerHTML = html;
  return e;
}

function section(num: string, title: string, note: string): HTMLElement {
  const s = el('section', { class: 's-section' });
  s.append(el('header', {}, `<h2><span>${num}</span>${title}</h2><p class="s-note">${note}</p>`));
  return s;
}

function inviteMarkup(subject: 'cake' | 'keycard', stageSrc: string, alt: string): string {
  const e = EVENTS[subject];
  return `
    <div class="lt-invite">
      <div>
        <h3 class="lt-invite__title">${e.title}</h3>
        <p class="lt-invite__meta">${e.meta}</p>
      </div>
      <div class="lt-stage"><img src="${stageSrc}" alt="${alt}" /></div>
      <p class="lt-question">Will you attend?</p>
      <div class="lt-choices">
        <button class="lt-choice" type="button" data-response="accept" aria-pressed="false">${ICON.check}Accept</button>
        <button class="lt-choice" type="button" data-response="decline" aria-pressed="false">${ICON.minus}Decline</button>
      </div>
      <p class="lt-footnote">Your host sees your response. You can change it later.</p>
    </div>`;
}

function phone(subject: 'cake' | 'keycard', stageSrc: string, alt: string): HTMLElement {
  const p = el('div', { class: 's-phone' });
  p.innerHTML = `
    <div class="s-phone__bar" aria-hidden="true"><span>9:41</span><span>●●●</span></div>
    <div class="s-phone__nav">${ICON.back}<span>Invitation</span></div>
    ${inviteMarkup(subject, stageSrc, alt)}`;
  return p;
}

/** Pixel position of a world point in a snapshot of the given size. */
function project(stage: Stage, point: Vector3, w: number, h: number, dpr: number): [number, number] {
  const v = point.clone().project(stage.camera);
  return [((v.x + 1) / 2) * w * dpr, ((1 - v.y) / 2) * h * dpr];
}

async function crop(src: string, cx: number, cy: number, size: number, caption: string): Promise<HTMLElement> {
  const img = new Image();
  img.src = src;
  await img.decode();
  const c = el('canvas', { width: String(size), height: String(size), 'aria-label': caption });
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, cx - size / 2, cy - size / 2, size, size, 0, 0, size, size);
  const fig = el('figure');
  fig.append(c, el('figcaption', {}, caption));
  return fig;
}

async function main() {
  const root = document.getElementById('study-root')!;
  const wrap = el('div', { class: 's-wrap' });
  root.append(wrap);

  wrap.append(
    el('header', { class: 's-head' }, `
      <p class="s-kicker">Livetime · Invitation interactions · Milestone 1 · style lock</p>
      <h1>Visual study: locked direction L, with the A / B comparison</h1>
      <p>Each section shows the locked direction <strong>L — Satin Enamel</strong> (B’s construction and perforation signature with A’s restraint, keeping A’s coloured candles and covered dish, refined once from the panel’s findings) above the original checkpoint-1 comparison of A and B. Camera, composition, light, scale, controls and copy are identical throughout. Every image is rendered live by the shipping browser renderer (Three.js WebGL2, NeutralToneMapping).</p>
      <span class="s-pill">${STUDY_RECORD.selection ? `Selected: ${STUDY_RECORD.selection.choice}` : 'Neither direction selected — awaiting Surya'}</span>`),
  );

  const stage = Stage.create({ preserveDrawingBuffer: true });
  if (!stage) {
    wrap.append(el('p', {}, 'WebGL2 is unavailable in this browser, so the study cannot render.'));
    return;
  }
  const liveSize = 420;
  stage.resize(liveSize, liveSize, 2);

  const stats: Record<string, { triangles: number; calls: number; materials: number }> = {};
  const shot = (subject: Subject, dir: DirectionId, size: number, dpr: number, type = 'image/png', quality?: number) => {
    const m = build(subject, dir);
    stage.setContent(m.root, m.bounds);
    const url = stage.snapshot(size, size, dpr, type, quality);
    const info = stage.renderer.info.render;
    const mats = new Set<string>();
    m.root.traverse((o) => { const mat = (o as { material?: { uuid: string } }).material; if (mat) mats.add(mat.uuid); });
    stats[`${subject}-${dir}`] = { triangles: info.triangles, calls: info.calls, materials: mats.size };
    return { m, url };
  };

  // 01 — Style frames
  const s1 = section('01', 'Primary browser style frames', '390 × 844 CSS px. Stage rendered at 3× device pixel ratio, guest-ready pose, unselected response.');
  const frames = el('div', { class: 's-frames' });
  const frameShots: Record<string, string> = {};
  for (const dir of DIRS) {
    for (const subject of ['cake', 'keycard'] as const) {
      const { m, url } = shot(subject, dir, 358, 3);
      frameShots[`${subject}-${dir}`] = url;
      m.dispose();
      const fig = el('figure', { class: 's-frame-wrap', style: 'margin:0', 'data-name': `frame-${subject}-${dir}` });
      fig.append(phone(subject, url, `${SUBJECT_LABEL[subject]} in direction ${dir}`));
      fig.append(el('figcaption', {}, `${SUBJECT_LABEL[subject]} · ${dirLabel(dir)}`));
      frames.append(fig);
    }
  }
  s1.append(frames);
  wrap.append(s1);

  // 02 — Family contact sheet
  const s2 = section('02', 'Family contact sheet', 'Five blockout objects per direction with the proposed common materials. Record player, basketball and dish are rough silhouettes, not finished models.');
  const blind = el('button', { class: 's-btn', type: 'button', 'aria-pressed': 'false' }, 'Hide labels for blind recognition check');
  s2.querySelector('header')!.append(blind);
  const sheets: HTMLElement[] = [];
  for (const dir of DIRS) {
    s2.append(el('p', { class: 's-dir-label' }, `${DIRECTIONS[dir].name} <small>Direction ${dir}${dir === 'L' ? ' · locked' : ''}</small>`));
    const sheet = el('div', { class: 's-sheet', 'data-dir': dir });
    for (const subject of ['record', 'cake', 'sports', 'dish', 'keycard'] as const) {
      const { m, url } = shot(subject, dir, 240, 2);
      m.dispose();
      const fig = el('figure');
      fig.append(el('img', { src: url, alt: '' }), el('figcaption', {}, SUBJECT_LABEL[subject]));
      sheet.append(fig);
    }
    sheets.push(sheet);
    s2.append(sheet);
  }
  blind.addEventListener('click', () => {
    const on = blind.getAttribute('aria-pressed') !== 'true';
    blind.setAttribute('aria-pressed', String(on));
    blind.textContent = on ? 'Show labels' : 'Hide labels for blind recognition check';
    sheets.forEach((s) => s.toggleAttribute('data-blind', on));
  });
  wrap.append(s2);

  // 03 — Material detail crops at actual mobile render scale
  const s3 = section('03', 'Material detail crops', 'Cropped from the 390 pt style frames at 3× — device pixels shown 1:1 then enlarged ≈2.2× without smoothing. This is exactly what a phone rasterises.');
  const crops = el('div', { class: 's-crops' });
  for (const dir of DIRS) {
    const m = build('keycard', dir);
    stage.setContent(m.root, m.bounds);
    const url = frameShots[`keycard-${dir}`]!;
    const cornerWorld = new Vector3(HANG_PIVOT.x - CARD.width / 2 + 0.12, HANG_PIVOT.y + CARD_OFFSET_Y + CARD.height / 2 - 0.08, HANG_PIVOT.z + 0.03);
    const clipWorld = HANG_PIVOT.clone().add(new Vector3(-0.1, -0.1, 0));
    const [x1, y1] = project(stage, cornerWorld.lerp(clipWorld, 0.5), 358, 358, 3);
    crops.append(await crop(url, x1, y1, 120, `${dir} · Bevel and edge highlight (card corner, clip)`));
    const bandWorld = new Vector3(HANG_PIVOT.x + 0.05, HANG_PIVOT.y + CARD_OFFSET_Y - (dir === 'A' ? 0.24 : dir === 'B' ? 0.5 : 0.535), HANG_PIVOT.z + 0.03);
    const [x2, y2] = project(stage, bandWorld, 358, 358, 3);
    crops.append(await crop(url, x2, y2, 120, `${dir} · Shared surface detail (${DIRECTIONS[dir].signature.kind})`));
    m.dispose();
  }
  for (const dir of DIRS) {
    const m = build('cake', dir);
    stage.setContent(m.root, m.bounds);
    const url = frameShots[`cake-${dir}`]!;
    const [x, y] = project(stage, new Vector3(0.35, 0.06, 1.15), 358, 358, 3);
    crops.append(await crop(url, x, y, 120, `${dir} · Tray band detail`));
    const [cx, cy] = project(stage, new Vector3(0.36, CAKE_METRICS.standard.trayTop + 0.98, 0.12), 358, 358, 3);
    crops.append(await crop(url, cx, cy, 120, `${dir} · Candle, flame and frosting edge`));
    m.dispose();
  }
  s3.append(crops);
  wrap.append(s3);

  // 04 — 320 px checks
  const s4 = section('04', 'Narrow 320 px checks', 'Stage at 288 CSS px (320 viewport minus 16 px gutters). Candles, clip, scanner and object boundaries must stay visible.');
  const narrow = el('div', { class: 's-narrow' });
  for (const dir of DIRS) {
    for (const subject of ['cake', 'keycard'] as const) {
      const { m, url } = shot(subject, dir, 288, 3);
      m.dispose();
      const fig = el('figure', { 'data-name': `narrow-${subject}-${dir}` });
      fig.append(el('img', { src: url, alt: `${SUBJECT_LABEL[subject]} at 320 px, direction ${dir}` }), el('figcaption', {}, `${SUBJECT_LABEL[subject]} · ${dir} · 288 px stage`));
      narrow.append(fig);
    }
  }
  s4.append(narrow);
  wrap.append(s4);

  // 05 — Token sheets
  const s5 = section('05', 'Token sheets', 'Study inputs only. Status colours pair with symbols and text; UI contrast verified separately.');
  const tokens = el('div', { class: 's-tokens' });
  for (const dir of DIRS) {
    const d = DIRECTIONS[dir];
    const card = el('article', { class: 's-token-card' });
    const swatchNames = ['mat_body', 'mat_body_ink', 'mat_accent', 'mat_insert', 'mat_insert_warm', 'mat_metal', 'mat_anodized', 'mat_tray', 'mat_fabric', 'mat_cloche'];
    const ui = Object.entries(d.ui).map(([k, v]) => `<div class="s-swatch"><i style="background:${v}"></i>${k}<br><code>${v}</code></div>`).join('');
    const mats = swatchNames.map((n) => {
      const s = d.surfaces[n]!;
      return `<div class="s-swatch"><i style="background:${s.color}"></i>${n.replace('mat_', '')}<br><code>${s.color} · r${s.roughness}${s.metalness ? ` · m${s.metalness}` : ''}</code></div>`;
    }).join('');
    card.innerHTML = `
      <h3>${dirLabel(dir)}</h3>
      <p>${d.summary}</p>
      <p class="s-kicker" style="margin-bottom:8px">Interface</p>
      <div class="s-swatches">${ui}</div>
      <p class="s-kicker" style="margin-bottom:8px">Materials</p>
      <div class="s-swatches">${mats}</div>
      <table class="s-table"><tbody>
        <tr><th>Camera</th><td>Orthographic · azimuth ${CAMERA_ANGLES.azimuthDeg}° · elevation ${CAMERA_ANGLES.elevationDeg}° · 8% motion-bounds clearance</td></tr>
        <tr><th>Lighting</th><td>Key <code>${LIGHT_RIG.key.color}</code> ×${LIGHT_RIG.key.intensity} upper-left · hemisphere fill ×${LIGHT_RIG.fill.intensity} · procedural softbox environment ×${LIGHT_RIG.environmentIntensity}</td></tr>
        <tr><th>Tone</th><td>NeutralToneMapping · exposure 1.0 · sRGB output · linear data maps</td></tr>
        <tr><th>Background</th><td><code>${d.ui.stage}</code> seamless stage, no floor line</td></tr>
        <tr><th>Shadow</th><td>Contact card <code>${d.shadow.color}</code> at ${d.shadow.opacity} opacity; spreads ×(1+0.55h) and fades by height</td></tr>
        <tr><th>Edges</th><td>Bevel ≈ ${Math.round(d.geometry.bevelRatio * 100)}% of the smallest part dimension · ${d.geometry.bevelSegments} segments · fullness ${d.geometry.fullness}</td></tr>
        <tr><th>Roughness</th><td>${dir === 'A' ? 'Satin bodies 0.42–0.48 with light clearcoat · metal 0.30–0.34' : dir === 'B' ? 'Enamel bodies 0.66–0.72, no clearcoat · painted metal 0.48–0.55' : 'Satin bodies 0.44–0.48, no clearcoat · enamel inserts 0.62–0.74 · brushed metal 0.42–0.45'} · food 0.52–0.86</td></tr>
        <tr><th>Signature</th><td>${d.signature.description}<br>Placement: ${d.signature.placement.join(', ')}</td></tr>
        <tr><th>Type</th><td>System sans (SF Pro / Segoe / Roboto). Title 26/1.15 semibold · body 15 · meta 15 muted <code>#585C57</code></td></tr>
        <tr><th>Status</th><td>Accept <code>${d.ui.ok}</code> + check · Decline <code>${d.ui.no}</code> + minus · scanner light accept <code>${d.status.accept}</code> / decline <code>${d.status.decline}</code> (emissive, always paired with symbol)</td></tr>
      </tbody></table>`;
    tokens.append(card);
  }
  s5.append(tokens);
  const feas = el('table', { class: 's-table', style: 'margin-top:24px;background:#fff;border-radius:12px' });
  const subjects: Subject[] = ['cake', 'keycard', 'record', 'sports', 'dish'];
  feas.innerHTML = `<thead><tr><th>Measured at render (study models)</th>${subjects.map((x) => `<th>${SUBJECT_LABEL[x]}</th>`).join('')}</tr></thead><tbody>${DIRS.map((d) => `<tr><th>${d} triangles · draw calls · materials</th>${subjects.map((x) => { const st = stats[`${x}-${d}`]; return `<td><code>${st ? `${st.triangles.toLocaleString()} · ${st.calls} · ${st.materials}` : '—'}</code></td>`; }).join('')}</tr>`).join('')}<tr><th>Master budget</th><td colspan="5"><code>≤ 60,000 triangles · ≤ 40 draw calls per scene (normal quality)</code></td></tr></tbody>`;
  s5.append(feas);
  (window as unknown as { __studyStats: unknown }).__studyStats = stats;
  wrap.append(s5);

  // 06 — Motion sample (the single live canvas)
  const s6 = section('06', 'Two-second motion sample', 'Identical card settle in every direction: 9° swing and 4° pitch released into the shared spring (damping ratio 0.85, fixed 1/120 s step). Watch the edge highlight and specular crawl.');
  const motion = el('div', { class: 's-motion' });
  const stageBox = el('div', { class: 'lt-stage' });
  stageBox.append(stage.canvas);
  stage.canvas.setAttribute('aria-hidden', 'true');
  const side = el('div');
  const seg = el('div', { class: 's-seg', role: 'group', 'aria-label': 'Direction' });
  const btnL = el('button', { type: 'button', 'aria-pressed': 'true' }, 'L — locked');
  const btnA = el('button', { type: 'button', 'aria-pressed': 'false' }, 'A — Satin Studio');
  const btnB = el('button', { type: 'button', 'aria-pressed': 'false' }, 'B — Enamel Workshop');
  seg.append(btnL, btnA, btnB);
  const replay = el('button', { class: 's-btn', type: 'button' }, 'Replay settle');
  const controls = el('div', { class: 's-controls' });
  controls.append(seg, replay);
  const readout = el('p', { class: 's-note', 'aria-live': 'off' });
  side.append(controls, readout);
  motion.append(stageBox, side);
  s6.append(motion);
  wrap.append(s6);

  let current: KeycardModel | null = null;
  let raf = 0;
  const swing = new Spring({ frequency: 0.95, limit: (12 * Math.PI) / 180, epsilon: ANGLE_EPSILON, maxVelocity: 4 });
  const pitch = new Spring({ frequency: 1.2, limit: (12 * Math.PI) / 180, epsilon: ANGLE_EPSILON, maxVelocity: 4 });
  const stepper = new FixedStepper();

  const showDir = (dir: DirectionId) => {
    cancelAnimationFrame(raf);
    current?.dispose();
    current = buildKeycard({ lib: libraries[dir] }, 'light');
    stage.setContent(current.root, current.bounds);
    stage.resize(stageBox.clientWidth || liveSize, stageBox.clientWidth || liveSize, 2);
    btnL.setAttribute('aria-pressed', String(dir === 'L'));
    btnA.setAttribute('aria-pressed', String(dir === 'A'));
    btnB.setAttribute('aria-pressed', String(dir === 'B'));
    play();
  };

  /** Deterministic settle pose at time t (seconds): replays the fixed-step spring from rest. */
  const poseAt = (model: KeycardModel, t: number) => {
    swing.snap(); pitch.snap();
    swing.kick((9 * Math.PI) / 180);
    pitch.kick((-4 * Math.PI) / 180);
    const steps = Math.round(t / (1 / 120));
    for (let i = 0; i < steps; i++) { swing.step(1 / 120); pitch.step(1 / 120); }
    if (t >= 2) { swing.snap(); pitch.snap(); }
    applyPose(model);
  };

  const applyPose = (model: KeycardModel) => {
    model.nodes.card_secondary!.rotation.set(pitch.x, 0, swing.x);
    model.updateLanyard();
    const shadow = model.shadows[0]!;
    shadow.setHeight(HANG_PIVOT.y + CARD_OFFSET_Y - CARD.height / 2, 2.2);
    shadow.setFootprint(HANG_PIVOT.x + Math.sin(swing.x) * 0.7, HANG_PIVOT.z);
  };

  const play = () => {
    if (!current) return;
    cancelAnimationFrame(raf);
    const model = current;
    swing.snap(); pitch.snap();
    swing.kick((9 * Math.PI) / 180);
    pitch.kick((-4 * Math.PI) / 180);
    stepper.reset();
    let last = performance.now();
    let elapsed = 0;
    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      elapsed += dt;
      stepper.advance(dt, (h) => { swing.step(h); pitch.step(h); });
      if (elapsed >= 2) { swing.snap(); pitch.snap(); }
      applyPose(model);
      stage.render();
      readout.textContent = `t = ${Math.min(elapsed, 2).toFixed(2)} s · swing ${((swing.x * 180) / Math.PI).toFixed(2)}° · pitch ${((pitch.x * 180) / Math.PI).toFixed(2)}°${swing.settled && pitch.settled ? ' · settled (exact canonical pose)' : ''}`;
      if (!(swing.settled && pitch.settled)) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  };

  // Capture hook (tooling only): deterministic frames for the motion-sample recording.
  (window as unknown as { __studySettle: unknown }).__studySettle = {
    show: (dir: DirectionId) => { showDir(dir); cancelAnimationFrame(raf); },
    frame: (t: number, size: number) => {
      if (!current) return '';
      poseAt(current, t);
      return stage.snapshot(size, size, 2);
    },
  };

  btnL.addEventListener('click', () => showDir('L'));
  btnA.addEventListener('click', () => showDir('A'));
  btnB.addEventListener('click', () => showDir('B'));
  replay.addEventListener('click', play);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelAnimationFrame(raf);
  });
  void SCANNER_POS;
  showDir('L');

  // 07 — Rubric and recommendation
  const s7 = section('07', 'Selection rubric', 'Scores 1–5 with one sentence of visual evidence. Any failure of recognition, legibility or feasibility blocks selection regardless of total.');
  const table = el('table', { class: 's-rubric' });
  const row = (key: string, label: string, hint: string) => {
    const cell = (dir: 'A' | 'B') => {
      const s = STUDY_RECORD.scores[dir]?.[key as never] as { score: number; evidence: string } | undefined;
      return s ? `<td><span class="s-score">${s.score}/5</span><p>${s.evidence}</p></td>` : '<td><span class="s-score">—</span><p>Pending evaluation</p></td>';
    };
    return `<tr><th scope="row">${label}<p>${hint}</p></th>${cell('A')}${cell('B')}</tr>`;
  };
  const total = (dir: 'A' | 'B') => {
    const vals = Object.values(STUDY_RECORD.scores[dir] ?? {}).map((s) => s!.score);
    return vals.length ? `${vals.reduce((a, b) => a + b, 0)}/${vals.length * 5}` : '—';
  };
  table.innerHTML = `<thead><tr><th>Dimension</th><th>A — Satin Studio</th><th>B — Enamel Workshop</th></tr></thead>
    <tbody>${RUBRIC_DIMENSIONS.map(([k, l, h]) => row(k, l, h)).join('')}
    <tr><th scope="row">Total</th><td><span class="s-score">${total('A')}</span></td><td><span class="s-score">${total('B')}</span></td></tr></tbody>`;
  s7.append(table);
  const reco = el('div', { class: 's-reco' });
  const list = (items: string[]) => (items.length ? `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>` : '<p>Pending.</p>');
  reco.innerHTML = `
    <article><h3>Recommendation</h3><p>${STUDY_RECORD.recommendation ?? 'Pending evaluation.'}</p></article>
    <article><h3>A — tradeoffs</h3>${list(STUDY_RECORD.tradeoffs.A)}</article>
    <article><h3>B — tradeoffs</h3>${list(STUDY_RECORD.tradeoffs.B)}</article>
    <article><h3>Named experiments for the Business scene</h3>${list(STUDY_RECORD.experiments)}</article>
    <article><h3>Selection record</h3><p>${STUDY_RECORD.selection ? `${STUDY_RECORD.selection.choice} — recorded by Surya on ${STUDY_RECORD.selection.date}. ${STUDY_RECORD.selection.notes}` : 'Not selected. Surya selects A, B, or a precisely stated combination of attributes; a combination produces one revised token sheet.'}</p></article>`;
  s7.append(reco);
  wrap.append(s7);

  // Tooling hook: collection-rail thumbnails from the locked direction.
  (window as unknown as { __studyThumb: unknown }).__studyThumb = (subject: Subject, size: number) => {
    const { m, url } = shot(subject, 'L', size, 1, 'image/webp', 0.9);
    m.dispose();
    return url;
  };
  document.body.dataset.ready = 'true';
}

main();
