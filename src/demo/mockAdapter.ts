import type { Response, ResponseRequest, ResponseResult } from '../core/types.ts';

/**
 * SIMULATED persistence for the standalone showcase (Master §7). Never contacts a real
 * RSVP service. Demonstrates the ordering responsibility a real adapter must honour:
 * writes are serialised, so an older write can never land after a newer one.
 */

export type MockMode = 'normal' | 'slow' | 'fail';

export const MOCK_DELAYS: Record<MockMode, number> = { normal: 250, slow: 3000, fail: 900 };

export class MockResponseAdapter {
  mode: MockMode = 'normal';
  /** Last value the simulated "server" stored. */
  stored: Response | null = null;
  private queue: Promise<void> = Promise.resolve();
  private disposed = false;
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();

  constructor(private readonly deliver: (result: ResponseResult) => void, initial: Response | null = null) {
    this.stored = initial;
  }

  submit(request: ResponseRequest): void {
    const mode = this.mode;
    // Serialised write queue: each write starts after the previous one settles.
    this.queue = this.queue.then(
      () =>
        new Promise<void>((resolve) => {
          const timer = setTimeout(() => {
            this.timers.delete(timer);
            if (this.disposed) return resolve();
            if (mode === 'fail') {
              this.deliver({ requestId: request.requestId, status: 'error', message: 'Simulated network failure' });
            } else {
              this.stored = request.response;
              this.deliver({ requestId: request.requestId, status: 'saved', response: request.response });
            }
            resolve();
          }, MOCK_DELAYS[mode]);
          this.timers.add(timer);
        }),
    );
  }

  dispose(): void {
    this.disposed = true;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }
}
