import { describe, expect, it } from 'vitest';
import { ResponseState } from '../src/core/responseState.ts';
import type { IntegrationError, ResponseRequest } from '../src/core/types.ts';

function setup(initial?: 'accept' | 'decline') {
  const requests: ResponseRequest[] = [];
  const errors: IntegrationError[] = [];
  let n = 0;
  const state = new ResponseState(
    { request: (r) => requests.push(r), integrationError: (e) => errors.push(e) },
    initial,
    () => `r${++n}`,
  );
  return { state, requests, errors };
}

describe('ResponseState', () => {
  it('choosing accept emits exactly one request and enters saving', () => {
    const { state, requests } = setup();
    expect(state.choose('accept')).toBe(true);
    expect(requests).toEqual([{ requestId: 'r1', response: 'accept' }]);
    expect(state.state.persistence).toBe('saving');
    expect(state.state.intent).toBe('accept');
  });

  it('repeated taps of the same intent while saving or saved do not submit again', () => {
    const { state, requests } = setup();
    state.choose('accept');
    expect(state.choose('accept')).toBe(false);
    state.apply({ requestId: 'r1', status: 'saved', response: 'accept' });
    expect(state.choose('accept')).toBe(false);
    expect(requests).toHaveLength(1);
    expect(state.state.persistence).toBe('saved');
  });

  it('decline during saving creates a newer request and the stale accept result cannot overwrite it', () => {
    const { state, requests, errors } = setup();
    state.choose('accept');
    state.choose('decline');
    expect(requests.map((r) => r.requestId)).toEqual(['r1', 'r2']);
    state.apply({ requestId: 'r1', status: 'saved', response: 'accept' });
    expect(state.state.persistence).toBe('saving');
    expect(state.state.intent).toBe('decline');
    expect(errors).toEqual([]);
    state.apply({ requestId: 'r2', status: 'saved', response: 'decline' });
    expect(state.state).toMatchObject({ persistence: 'saved', savedResponse: 'decline' });
  });

  it('a stale error for a superseded request is ignored', () => {
    const { state } = setup();
    state.choose('accept');
    state.choose('decline');
    state.apply({ requestId: 'r1', status: 'error', message: 'network' });
    expect(state.state.persistence).toBe('saving');
  });

  it('an error preserves the selected intent and Retry emits a new request', () => {
    const { state, requests } = setup();
    state.choose('decline');
    state.apply({ requestId: 'r1', status: 'error', message: 'offline' });
    expect(state.state).toMatchObject({ intent: 'decline', persistence: 'error', errorMessage: 'offline' });
    expect(state.retry()).toBe(true);
    expect(requests.at(-1)).toEqual({ requestId: 'r2', response: 'decline' });
    expect(state.state.persistence).toBe('saving');
  });

  it('retry is a no-op unless the latest request failed', () => {
    const { state, requests } = setup();
    expect(state.retry()).toBe(false);
    state.choose('accept');
    expect(state.retry()).toBe(false);
    expect(requests).toHaveLength(1);
  });

  it('re-choosing the failed intent acts as retry without restarting visuals', () => {
    const { state, requests } = setup();
    state.choose('accept');
    state.apply({ requestId: 'r1', status: 'error', message: 'x' });
    expect(state.choose('accept')).toBe(false);
    expect(requests.map((r) => r.requestId)).toEqual(['r1', 'r2']);
  });

  it('a matching saved result with a different response is an integration error', () => {
    const { state, errors } = setup();
    state.choose('accept');
    state.apply({ requestId: 'r1', status: 'saved', response: 'decline' });
    expect(errors).toEqual([{ kind: 'mismatched-result', requestId: 'r1' }]);
    expect(state.state.persistence).toBe('saving');
  });

  it('an unknown request id is reported and ignored', () => {
    const { state, errors } = setup();
    state.choose('accept');
    state.apply({ requestId: 'zzz', status: 'saved', response: 'accept' });
    expect(errors).toEqual([{ kind: 'unknown-request', requestId: 'zzz' }]);
    expect(state.state.persistence).toBe('saving');
  });

  it('initial saved response displays without a new submission', () => {
    const { state, requests } = setup('accept');
    expect(state.state).toMatchObject({ intent: 'accept', persistence: 'saved', savedResponse: 'accept' });
    expect(requests).toHaveLength(0);
    expect(state.choose('accept')).toBe(false);
    expect(requests).toHaveLength(0);
  });

  it('request ids are unique across the default factory', () => {
    const ids = new Set<string>();
    const s = new ResponseState({ request: (r) => ids.add(r.requestId) });
    for (let i = 0; i < 50; i++) s.choose(i % 2 ? 'accept' : 'decline');
    expect(ids.size).toBe(50);
  });
});
