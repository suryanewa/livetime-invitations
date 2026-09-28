import '../ui/shell.css';
import { buildKeycard } from '../../models/keycard.ts';
import { MaterialLibrary } from '../render/materials.ts';
import { Stage } from '../render/stage.ts';

/**
 * Milestone 0 skeleton: one stage, readable controls at 320 px, and a poster rendered from
 * the same camera to prove matching framing. Replaced by the full showcase in Milestone 2.
 */
const app = document.getElementById('app')!;
app.innerHTML = `
  <main class="lt-invite" style="max-width:420px;margin:0 auto;padding-top:24px;padding-bottom:40px">
    <div>
      <p class="lt-invite__eyebrow">Milestone 0 · setup skeleton</p>
      <h1 class="lt-invite__title">Stage and poster framing check</h1>
      <p class="lt-invite__meta">Live canvas above, poster from the same camera below.</p>
    </div>
    <div class="lt-stage" id="live"></div>
    <div class="lt-stage" id="poster"></div>
    <div class="lt-choices">
      <button class="lt-choice" type="button" data-response="accept" aria-pressed="false">Accept</button>
      <button class="lt-choice" type="button" data-response="decline" aria-pressed="false">Decline</button>
    </div>
    <p class="lt-status" role="status">Controls are inert in the skeleton.</p>
  </main>`;

const live = document.getElementById('live')!;
const posterBox = document.getElementById('poster')!;
const stage = Stage.create();
if (!stage) {
  live.textContent = 'WebGL2 unavailable — poster fallback path.';
} else {
  const model = buildKeycard({ lib: new MaterialLibrary('A') });
  live.append(stage.canvas);
  stage.setContent(model.root, model.bounds);
  const size = () => live.clientWidth;
  stage.resize(size(), size(), 1.5);
  stage.render();
  const img = new Image();
  img.alt = 'Poster: badge on lanyard above scanner';
  img.src = stage.snapshot(size(), size(), 2, 'image/webp', 0.9);
  posterBox.append(img);
  new ResizeObserver(() => { stage.resize(size(), size(), 1.5); stage.render(); }).observe(live);
}
