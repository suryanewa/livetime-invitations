import { describe, expect, it } from 'vitest';
import { Object3D } from 'three';
import { INTERRUPT_BLEND, VisualDirector, type SceneDriver } from '../src/core/visualDirector.ts';
import type { CanonicalPose, SequenceName } from '../src/core/types.ts';

/** Fake scene: one node whose x encodes the pose/sequence progress. */
function fakeDriver() {
  const node = new Object3D();
  const X: Record<CanonicalPose, number> = { 'host-ready': -1, 'guest-ready': 0, accepted: 1, declined: -2 };
  const calls: string[] = [];
  const driver: SceneDriver & { node: Object3D; calls: string[] } = {
    node,
    calls,
    durations: { host: 1.2, accept: 1.5, decline: 1.5 },
    animatedNodes: [node],
    pose(p) {
      calls.push(`pose:${p}`);
      node.position.x = X[p];
    },
    sample(seq: SequenceName, t: number) {
      const from = seq === 'host' ? X['host-ready'] : X['guest-ready'];
      const to = seq === 'host' ? X['guest-ready'] : seq === 'accept' ? X.accepted : X.declined;
      node.position.x = from + (to - from) * Math.min(1, t / this.durations[seq]);
    },
  };
  return driver;
}

function setup(mode: 'host' | 'guest' = 'guest', intent: 'accept' | 'decline' | null = null) {
  const completed: SequenceName[] = [];
  const v = new VisualDirector({ complete: (s) => completed.push(s) }, mode, intent);
  const d = fakeDriver();
  v.attach(d);
  return { v, d, completed };
}

describe('VisualDirector', () => {
  it('plays accept from guest-ready and emits exactly one completion', () => {
    const { v, d, completed } = setup();
    v.update(0);
    v.setIntent('accept');
    expect(v.state).toBe('accept-playing');
    for (let t = 0; t <= 2; t += 1 / 60) v.update(t);
    expect(v.state).toBe('accepted-pose');
    expect(d.node.position.x).toBe(1);
    expect(completed).toEqual(['accept']);
  });

  it('a scene that asks for a cut changes answer without a blend, then plays the new outcome', () => {
    const { v, d, completed } = setup();
    let cut = true;
    d.interruptCut = () => cut;
    v.update(0);
    v.setIntent('accept');
    v.update(0.9);
    d.calls.length = 0;
    v.setIntent('decline');
    // Cut: guest-ready is posed at once and the decline sequence starts from it (no blend frames).
    expect(d.calls).toContain('pose:guest-ready');
    expect(v.state).toBe('decline-playing');
    expect(d.node.position.x).toBe(0);
    v.update(0.9 + 0.1);
    expect(d.node.position.x).toBeLessThan(0);
    for (let t = 1; t <= 3; t += 1 / 60) v.update(t);
    expect(v.state).toBe('declined-pose');
    expect(completed).toEqual(['decline']);
    cut = false;
  });

  it('interrupting accept with decline blends through ready and cancels the old completion', () => {
    const { v, d, completed } = setup();
    v.update(0);
    v.setIntent('accept');
    v.update(0.5);
    const mid = d.node.position.x;
    expect(mid).toBeGreaterThan(0);
    v.setIntent('decline');
    v.update(0.5 + INTERRUPT_BLEND / 2);
    expect(d.node.position.x).toBeLessThan(mid);
    expect(d.node.position.x).toBeGreaterThan(0);
    v.update(0.5 + INTERRUPT_BLEND);
    expect(d.node.position.x).toBeCloseTo(0);
    for (let t = 0.7; t <= 3; t += 1 / 60) v.update(t);
    expect(v.state).toBe('declined-pose');
    expect(d.node.position.x).toBe(-2);
    expect(completed).toEqual(['decline']);
  });

  it('reduced motion snaps directly to the final pose', () => {
    const { v, d, completed } = setup();
    v.setReducedMotion(true);
    v.setIntent('decline');
    expect(v.state).toBe('declined-pose');
    expect(d.node.position.x).toBe(-2);
    expect(v.update(0)).toBe(false);
    expect(completed).toEqual(['decline']);
  });

  it('enabling reduced motion mid-sequence finishes at the canonical final pose', () => {
    const { v, d } = setup();
    v.update(0);
    v.setIntent('accept');
    v.update(0.4);
    v.setReducedMotion(true);
    expect(v.isPlaying).toBe(false);
    expect(d.node.position.x).toBe(1);
  });

  it('a late scene load shows the current final intent pose without replaying', () => {
    const completed: SequenceName[] = [];
    const v = new VisualDirector({ complete: (s) => completed.push(s) }, 'guest', null);
    v.setIntent('accept');
    expect(v.state).toBe('accepted-pose');
    v.update(0);
    const d = fakeDriver();
    v.attach(d);
    expect(v.isPlaying).toBe(false);
    expect(d.node.position.x).toBe(1);
    expect(v.update(0.1)).toBe(false);
  });

  it('replay re-runs the outcome from ready; resetVisual restores the final intent pose', () => {
    const { v, d, completed } = setup('guest', 'accept');
    expect(d.node.position.x).toBe(1);
    v.update(0);
    v.replay();
    expect(v.state).toBe('accept-playing');
    v.update(0.3);
    v.reset();
    expect(v.state).toBe('accepted-pose');
    expect(d.node.position.x).toBe(1);
    for (let t = 0.3; t < 3; t += 0.1) v.update(t);
    expect(completed).toEqual([]);
  });

  it('host preparation plays host → guest-ready; mode change cancels without completion', () => {
    const { v, d, completed } = setup('host');
    expect(d.node.position.x).toBe(-1);
    v.update(0);
    v.prepareHost();
    expect(v.state).toBe('host-playing');
    v.update(0.6);
    v.setMode('guest');
    expect(v.state).toBe('guest-ready');
    for (let t = 0.6; t < 3; t += 0.1) v.update(t);
    expect(completed).toEqual([]);
    v.setMode('host');
    v.prepareHost();
    for (let t = 3; t < 5; t += 1 / 60) v.update(t);
    expect(v.state).toBe('guest-ready');
    expect(completed).toEqual(['host']);
  });

  it('sequences are frame-rate invariant: same pose at the same active time', () => {
    const run = (fps: number) => {
      const { v, d } = setup();
      v.update(0);
      v.setIntent('decline');
      for (let t = 0; t <= 0.9; t += 1 / fps) v.update(t);
      v.update(0.9);
      return d.node.position.x;
    };
    expect(run(30)).toBeCloseTo(run(120), 6);
  });

  it('holding pauses the timeline and a seek jumps it forward, never backward', () => {
    const { v, d, completed } = setup();
    let hold = false;
    let seek: number | null = null;
    d.holding = () => hold;
    d.takeSeek = () => { const s = seek; seek = null; return s; };
    v.update(0);
    v.setIntent('accept');
    v.update(0.3);
    const at03 = d.node.position.x;
    hold = true;
    v.update(1.0);
    v.update(2.0);
    expect(d.node.position.x).toBeCloseTo(at03);
    hold = false;
    seek = 1.2;
    v.update(2.05);
    expect(d.node.position.x).toBeCloseTo(1.2 / 1.5);
    seek = 0.1;
    v.update(2.1);
    expect(d.node.position.x).toBeGreaterThan(1.2 / 1.5);
    for (let t = 2.1; t < 3; t += 1 / 60) v.update(t);
    expect(completed).toEqual(['accept']);
  });

  it('a late load after a completed host preparation keeps the prepared pose', () => {
    const completed: SequenceName[] = [];
    const v = new VisualDirector({ complete: (s) => completed.push(s) }, 'host', null);
    v.prepareHost();
    expect(v.state).toBe('guest-ready');
    v.update(0);
    expect(completed).toEqual(['host']);
    const d = fakeDriver();
    v.attach(d);
    expect(v.state).toBe('guest-ready');
    expect(d.node.position.x).toBe(0);
    v.update(0.1);
    expect(completed).toEqual(['host']);
  });

  it('detaching the scene mid-sequence finishes at the final state instead of sticking', () => {
    const { v, completed } = setup();
    v.update(0);
    v.setIntent('accept');
    v.update(0.4);
    v.attach(null);
    expect(v.isPlaying).toBe(false);
    expect(v.state).toBe('accepted-pose');
    v.update(0.5);
    expect(completed).toEqual(['accept']);
  });
});
