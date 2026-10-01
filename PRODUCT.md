# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Guests** receiving a Livetime invitation, most often on a phone and often inside an in-app browser. Their job is to understand the event and answer Accept or Decline in seconds, with the answer confirmed clearly.
- **Hosts** preparing an invitation. They pick one of a scene's finite presets and preview the preparation action and the guest view.
- **Showcase audience (confirmed 2026-09-28): client demo first.** Emily and the Livetime team preview the host → guest flows. Developers integrating the controller use the same page, with diagnostics behind a clearly labelled Developer drawer.

## Product Purpose

Five event-specific, real-time 3D RSVP interactions (Party/record, Birthday/cake, Sports/basketball, Dinner/covered dish, Business/keycard) that make responding to an invitation feel tactile and memorable while staying fast, accessible and unambiguous. Success: guests always know what they chose and whether it was saved, and the collection feels like one crafted family.

## Positioning

The guest chooses first and the motion expresses that choice. No gesture, aim, microphone or physics decides the RSVP. The scenes are a collection of small tactile objects with one construction rule (the perforation signature), not generic animated stickers.

## Operating Context

- Embedded in the Livetime product (130+ campuses; college organisations first, corporate events next) through a framework-free TypeScript controller.
- The standalone showcase is a Vite static build with fixture events and a visibly simulated persistence adapter. It never contacts a real RSVP service.
- Engagement: a deliberately discounted $600 introductory package. The scope is fixed by the master specification in the Vault.

## Capabilities and Constraints

- One live WebGL2 canvas per page; posters and HTML controls work without graphics.
- Three independent state dimensions: resource, visual, persistence. Graphics never block a response.
- Party offers a finite song choice from already-cleared metadata (demo fixtures in the showcase): a **Song** segmented control sits above the **Record label** preset in the host panel, and a **song line** under the stage (a small "Song" key, then the title) names the chosen track in HTML for host and guest, because the label art is decorative. Changing the song resets the preview, as changing the label does; changing the label keeps the song. Missing or unknown metadata shows "Selected track" and never breaks the scene. Nothing plays or streams.
- Finite curated presets only. Excluded: real RSVP storage, auth, event creation, sending invitations, music streaming, uploads, a general editor, audio in v1, the generic envelope, Livetime brand identity and logo work.
- Physical-device coverage is limited to one iPhone 17 Max (Safari). Low-end iOS and Android are recorded gaps.

## Brand Commitments

- Livetime's broader identity (logo, naming, brand palette) is **out of scope**. The showcase must not invent a Livetime logo or brand graphics.
- The invitation objects follow the locked style reference (`docs/style-reference.md`, direction L2 "Satin Enamel · premium", v1.1: L's identity with the premium surfaces and sunlit studio approved at checkpoint 2b; the studio superseded in v1.3 by the `neutral-room` rig, `docs/style-reference.md`).
- Interface tokens are study inputs, not an approved brand palette: stage `#D5D2CD` (the rendered backdrop of the production studio rig, measured so poster, fallback and canvas match; `#F8E4C8` until the v1.3 studio pass), text `#202320`, muted `#DCDDD5`, accent `#FF714A` (never for UI text or focus on white), status green `#176B42` / red `#A62D36`, focus `#2F54C9`, system sans.

## Evidence on Hand

- Fixture event copy only (e.g. "Partner Summit — Welcome Reception"). No real customers, testimonials, metrics or device claims exist, and none may be fabricated.
- Visual study, panel record and approved frames: `docs/visual-study.md`, `~/Creative/Livetime/invitation-interactions/study/`.

## Product Principles

1. The answer is the product: the choice and its saved status must never be ambiguous.
2. Declining is as calm and dignified as accepting.
3. Craft in the object, restraint in the interface.
4. Everything works without graphics, motion or sound.
5. Honest states: simulated storage is always labelled as simulated.

## Accessibility & Inclusion

WCAG 2.2 AA: keyboard-only use, VoiceOver (iOS) and NVDA; 44×44 targets; visible focus; ≥4.5:1 text and ≥3:1 UI boundaries; reduced motion honoured live; no autoplay sound, flashing or forced orientation; 320–1440 px, landscape, 200% zoom, increased text size, safe areas.
