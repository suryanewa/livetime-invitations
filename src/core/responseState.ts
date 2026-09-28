import type { IntegrationError, PersistenceState, Response, ResponseRequest, ResponseResult } from './types.ts';

/**
 * Response persistence ledger (Master §7). Independent of graphics: visuals never own it,
 * and a graphics failure cannot block it.
 *
 * Rules:
 * - A changed intent issues exactly one request with a fresh id.
 * - Re-choosing the current intent while saving/saved issues nothing.
 * - Re-choosing the current intent after an error is treated as Retry (new id).
 * - Only a result matching the latest request id updates visible status.
 * - A matching `saved` result whose response differs from the intent is an integration error.
 */

export interface ResponseSnapshot {
  intent: Response | null;
  persistence: PersistenceState;
  latestRequestId: string | null;
  savedResponse: Response | null;
  errorMessage: string | null;
}

export interface ResponseStateHooks {
  request(request: ResponseRequest): void;
  change?(snapshot: ResponseSnapshot): void;
  integrationError?(error: IntegrationError): void;
}

let instanceCounter = 0;

function makeIdFactory(): () => string {
  const prefix =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.floor(Math.random() * 0xffffffff).toString(16);
  const instance = ++instanceCounter;
  let n = 0;
  return () => `${prefix}-${instance}-${++n}`;
}

export class ResponseState {
  private snapshot: ResponseSnapshot = {
    intent: null,
    persistence: 'unselected',
    latestRequestId: null,
    savedResponse: null,
    errorMessage: null,
  };
  private readonly issued = new Set<string>();
  private readonly nextId: () => string;

  constructor(
    private readonly hooks: ResponseStateHooks,
    initialResponse?: Response,
    idFactory?: () => string,
  ) {
    this.nextId = idFactory ?? makeIdFactory();
    if (initialResponse) {
      this.snapshot = { ...this.snapshot, intent: initialResponse, persistence: 'saved', savedResponse: initialResponse };
    }
  }

  get state(): Readonly<ResponseSnapshot> {
    return this.snapshot;
  }

  /** Returns true when the visual intent changed (caller starts the outcome sequence). */
  choose(response: Response): boolean {
    const { intent, persistence } = this.snapshot;
    if (intent === response) {
      if (persistence === 'error') this.issue(response);
      return false;
    }
    this.issue(response);
    return true;
  }

  /** Retry the failed intent with a new id. No-op unless the latest request failed. */
  retry(): boolean {
    const { intent, persistence } = this.snapshot;
    if (persistence !== 'error' || !intent) return false;
    this.issue(intent);
    return true;
  }

  apply(result: ResponseResult): void {
    if (result.requestId !== this.snapshot.latestRequestId) {
      if (!this.issued.has(result.requestId)) {
        this.hooks.integrationError?.({ kind: 'unknown-request', requestId: result.requestId });
      }
      // Stale result for a superseded request: never updates visible status.
      return;
    }
    if (result.status === 'saved') {
      if (result.response !== this.snapshot.intent) {
        this.hooks.integrationError?.({ kind: 'mismatched-result', requestId: result.requestId });
        return;
      }
      this.set({ persistence: 'saved', savedResponse: result.response, errorMessage: null });
    } else {
      this.set({ persistence: 'error', errorMessage: result.message });
    }
  }

  private issue(response: Response): void {
    const requestId = this.nextId();
    this.issued.add(requestId);
    this.set({ intent: response, persistence: 'saving', latestRequestId: requestId, errorMessage: null });
    this.hooks.request({ requestId, response });
  }

  private set(patch: Partial<ResponseSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.hooks.change?.(this.snapshot);
  }
}
