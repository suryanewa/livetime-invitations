/**
 * Shared playback clock (Master §6). Primary timelines sample elapsed ACTIVE seconds:
 * hidden tabs pause the clock and resume without accumulated debt. A frame delta is
 * clamped so a long stall cannot jump a sequence past its contact beats.
 */

export const MAX_FRAME_DELTA = 1 / 15;

export class PlaybackClock {
  private elapsed = 0;
  private last: number | null = null;
  private paused = false;

  constructor(private readonly now: () => number = () => performance.now()) {}

  /**
   * Advance to the current time; returns the clamped frame delta in seconds. `at` (ms, the
   * performance.now() timeline) is the frame's own timestamp: the render loop passes the one
   * requestAnimationFrame hands its callback (v1.5), the time the frame is presented for, so a
   * callback that starts late (a long task before it) still samples its frame's time.
   */
  tick(at?: number): number {
    const t = at ?? this.now();
    if (this.paused || this.last === null) {
      this.last = t;
      return 0;
    }
    const dt = Math.min(Math.max(0, (t - this.last) / 1000), MAX_FRAME_DELTA);
    this.last = t;
    this.elapsed += dt;
    return dt;
  }

  get seconds(): number {
    return this.elapsed;
  }

  pause(): void {
    this.paused = true;
    this.last = null;
  }

  resume(): void {
    this.paused = false;
    this.last = null;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  reset(): void {
    this.elapsed = 0;
    this.last = null;
  }
}
