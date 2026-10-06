/**
 * Public integration contract for Livetime invitation interactions.
 * Names follow Master Specification §7. Nothing here depends on an app framework.
 */

export type Category = 'party' | 'birthday' | 'sports' | 'dinner' | 'business';
export type Response = 'accept' | 'decline';
export type Mode = 'host' | 'guest';

export type SceneConfig =
  | { category: 'party'; songId: string; label: 'coral' | 'cobalt' }
  | { category: 'birthday'; cake: 'vanilla' | 'cocoa' }
  | { category: 'sports'; ball: 'orange' | 'cream' }
  | { category: 'dinner'; dish: 'pasta' | 'vegetables'; card?: InvitationCard }
  | { category: 'business'; template: 'light' | 'dark' };

/**
 * v1.7 (Dinner, spec revision #41): the text printed on the invitation card the reveal uncovers.
 * Every line is optional and plain text; `resolveConfig` trims it, strips control characters and
 * clamps it (eyebrow 60, title 80, name 48 characters). Omitted, the eyebrow reads "You're invited"
 * and the other lines are not printed. The page's HTML stays authoritative: the card is decorative.
 */
export interface InvitationCard {
  /** A short line over the title (printed in letter-spaced capitals). */
  eyebrow?: string;
  /** The event's name (one or two lines, shrunk to fit). */
  title?: string;
  /** The invitee's name; leave it out where there is no invitee (the host's preview). */
  name?: string;
}

export type ResponseRequest = { requestId: string; response: Response };

export type ResponseResult =
  | { requestId: string; status: 'saved'; response: Response }
  | { requestId: string; status: 'error'; message: string };

export interface InvitationController {
  setConfig(config: SceneConfig): void;
  setMode(mode: Mode): void;
  prepareHost(): void;
  chooseResponse(response: Response): void;
  retryResponse(): void;
  applyResponseResult(result: ResponseResult): void;
  replay(): void;
  resetVisual(): void;
  setReducedMotion(enabled: boolean): void;
  /**
   * Fullscreen layout (v1.4): the stage area your overlays cover, in CSS px from each edge. The
   * object is framed in the largest square left free; ignored by the square layout.
   */
  setFrameInsets(insets: Partial<FrameInsets>): void;
  dispose(): void;
}

/**
 * `square` (default): the controller renders a 1:1 stage into the mount, as since v1.0.
 * `fullscreen` (v1.4): the stage fills the mount at any aspect (size the mount yourself, e.g. the
 * viewport) and your UI floats over it; pass `frameInsets` so the object stays clear of it.
 */
export type InvitationLayout = 'square' | 'fullscreen';

/** Stage area covered by overlay UI, CSS px from each edge of the mount (fullscreen layout). */
export interface FrameInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Independent state dimensions (Master §7). */
export type ResourceState = 'poster' | 'loading' | 'ready' | 'fallback' | 'disposed';

export type VisualState =
  | 'host-ready'
  | 'host-playing'
  | 'guest-ready'
  | 'accept-playing'
  | 'decline-playing'
  | 'accepted-pose'
  | 'declined-pose';

export type PersistenceState = 'unselected' | 'saving' | 'saved' | 'error';

export type SequenceName = 'host' | 'accept' | 'decline';

/** Canonical poses every scene must be able to show exactly. */
export type CanonicalPose = 'host-ready' | 'guest-ready' | 'accepted' | 'declined';

/** Safe, enumerated reasons. Never provider or driver payloads. */
export type ResourceReason =
  | 'initial'
  | 'loading'
  | 'loaded'
  | 'webgl-unavailable'
  | 'shader-failure'
  | 'asset-failure'
  | 'context-lost'
  | 'context-restored'
  | 'timeout'
  | 'reduced-quality'
  | 'performance-static'
  | 'disposed';

export type IntegrationError =
  | { kind: 'invalid-category'; received: unknown }
  | { kind: 'mismatched-result'; requestId: string }
  | { kind: 'unknown-request'; requestId: string };

export interface InvitationCallbacks {
  onResponseRequested(request: ResponseRequest): void;
  onVisualComplete?(event: { category: Category; sequence: SequenceName }): void;
  onResourceState?(event: { state: ResourceState; reason: ResourceReason }): void;
  onIntegrationError?(error: IntegrationError): void;
}

export interface CreateInvitationOptions extends InvitationCallbacks {
  mount: HTMLElement;
  config: SceneConfig;
  mode: Mode;
  /** Authoritative response obtained from the application on load. */
  initialResponse?: Response;
  /** Defaults to the user's prefers-reduced-motion setting. */
  reducedMotion?: boolean;
  /** Base URL for scene assets and posters. Defaults to the bundled asset path. */
  assetBase?: string;
  /** Stage layout; defaults to `square` (existing embeds are unchanged). */
  layout?: InvitationLayout;
  /** Fullscreen layout: initial overlay insets (see `setFrameInsets`). Missing edges are 0. */
  frameInsets?: Partial<FrameInsets>;
}

export const CATEGORIES: readonly Category[] = ['party', 'birthday', 'sports', 'dinner', 'business'];

export const DEFAULT_CONFIGS: { readonly [C in Category]: Extract<SceneConfig, { category: C }> } = {
  party: { category: 'party', songId: 'sample-track-a', label: 'coral' },
  birthday: { category: 'birthday', cake: 'vanilla' },
  sports: { category: 'sports', ball: 'orange' },
  dinner: { category: 'dinner', dish: 'pasta' },
  business: { category: 'business', template: 'light' },
};
