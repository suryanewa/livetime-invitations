import type { Response } from '../core/types.ts';
import type { InvitationState } from '../core/controller.ts';

/**
 * Accessible guest response controls (Master §4, §10). Native buttons with equal weight;
 * selected intent via aria-pressed; persistence in a polite live region that never claims a
 * response is stored before the application confirms it. Motion beats are never announced.
 */

export const ICONS = {
  check: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M4.5 10.5l3.5 3.5 7.5-8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  minus: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M5 10h10" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  alert: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M10 6.5v4.5M10 13.8v.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="10" cy="10" r="7.25" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  replay: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M4.5 10a5.5 5.5 0 1 0 1.8-4.1M4.5 3.5v3h3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

export interface GuestControlsOptions {
  onChoose(response: Response): void;
  onRetry(): void;
  onReplay(): void;
  question?: string;
}

export interface GuestControls {
  element: HTMLElement;
  update(state: InvitationState): void;
}

let uid = 0;

export function createGuestControls(options: GuestControlsOptions): GuestControls {
  const id = `lt-q-${++uid}`;
  const el = document.createElement('div');
  el.className = 'lt-respond';
  el.innerHTML = `
    <p class="lt-question" id="${id}">${options.question ?? 'Will you attend?'}</p>
    <div class="lt-choices" role="group" aria-labelledby="${id}">
      <button class="lt-choice" type="button" data-response="accept" aria-pressed="false">${ICONS.check}<span>Accept</span></button>
      <button class="lt-choice" type="button" data-response="decline" aria-pressed="false">${ICONS.minus}<span>Decline</span></button>
    </div>
    <div class="lt-status-row">
      <p class="lt-status" role="status" aria-live="polite" aria-atomic="true"></p>
      <div class="lt-status-actions">
        <button class="lt-quiet" type="button" data-action="retry" hidden>Try again</button>
        <button class="lt-quiet" type="button" data-action="replay" hidden>${ICONS.replay}<span>Replay</span></button>
      </div>
    </div>`;

  const accept = el.querySelector<HTMLButtonElement>('[data-response="accept"]')!;
  const decline = el.querySelector<HTMLButtonElement>('[data-response="decline"]')!;
  const status = el.querySelector<HTMLParagraphElement>('.lt-status')!;
  const retry = el.querySelector<HTMLButtonElement>('[data-action="retry"]')!;
  const replay = el.querySelector<HTMLButtonElement>('[data-action="replay"]')!;

  accept.addEventListener('click', () => options.onChoose('accept'));
  decline.addEventListener('click', () => options.onChoose('decline'));
  retry.addEventListener('click', () => options.onRetry());
  replay.addEventListener('click', () => options.onReplay());

  let lastText = '';
  return {
    element: el,
    update(state) {
      const { intent, persistence } = state.response;
      accept.setAttribute('aria-pressed', String(intent === 'accept'));
      decline.setAttribute('aria-pressed', String(intent === 'decline'));
      el.dataset.persistence = persistence;

      let html = '';
      let text = '';
      if (persistence === 'saving') {
        text = 'Saving response…';
        html = `<span class="lt-spinner" aria-hidden="true"></span>${text}`;
      } else if (persistence === 'saved') {
        text = intent === 'accept' ? 'Accepted' : 'Declined';
        html = `${intent === 'accept' ? ICONS.check : ICONS.minus}${text}`;
      } else if (persistence === 'error') {
        text = 'Couldn’t save your response.';
        html = `${ICONS.alert}${text}`;
      }
      // Rewrite the live region only when the words change, so it announces once.
      if (text !== lastText) {
        status.innerHTML = html;
        lastText = text;
      }
      status.dataset.tone = persistence === 'saved' ? (intent ?? '') : persistence;
      retry.hidden = persistence !== 'error';
      replay.hidden = !intent || state.mode !== 'guest' || state.reducedMotion;
    },
  };
}
