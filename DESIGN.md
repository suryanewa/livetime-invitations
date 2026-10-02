---
name: Livetime Invitation Interactions
description: A precise, warm-neutral instrument that floats beside a tactile 3D invitation object, filling the screen, and never competes with it.
colors:
  ink: "#202320"
  ink-soft: "#3A3D39"
  ink-secondary: "#585C57"
  line-strong: "#6F736D"
  accept: "#176B42"
  decline: "#A62D36"
  focus: "#2F54C9"
  page: "#FBFAF7"
  stage: "#D5D2CD"
  surface: "#FFFFFF"
  track: "#EEECE6"
  hairline: "#E6E3DC"
  hover-wash: "#F7F6F2"
  perforation: "#CDC7BB"
  glass: "rgba(251, 250, 247, 0.9)"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 650
    lineHeight: 1.15
    letterSpacing: "-0.018em"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 650
    lineHeight: 1.4
    letterSpacing: "-0.01em"
  control:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.4
  body-strong:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.4
  body-sm:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
    lineHeight: 1.4
  caption:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.4
  mono:
    fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  segment: "10px"
  control-sm: "12px"
  track: "13px"
  control: "14px"
  row: "16px"
  panel: "18px"
  stage: "20px"
  overlay: "22px"
  sheet: "24px"
  card: "28px"
  pill: "999px"
spacing:
  xxs: "2px"
  xs: "6px"
  sm: "8px"
  pair: "10px"
  md: "12px"
  stack: "14px"
  lg: "16px"
  card: "20px"
  section: "28px"
  row-gap: "40px"
  column-gap: "56px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "52px"
  button-primary-hover:
    backgroundColor: "{colors.ink-soft}"
  button-primary-disabled:
    backgroundColor: "{colors.line-strong}"
    textColor: "{colors.surface}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "52px"
  button-secondary-hover:
    backgroundColor: "{colors.hover-wash}"
  choice:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "52px"
  choice-hover:
    backgroundColor: "{colors.hover-wash}"
  choice-accept-saved:
    backgroundColor: "{colors.accept}"
    textColor: "{colors.surface}"
  choice-decline-saved:
    backgroundColor: "{colors.decline}"
    textColor: "{colors.surface}"
  choice-accept-pending:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.accept}"
  choice-decline-pending:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.decline}"
  segmented-track:
    backgroundColor: "{colors.track}"
    rounded: "{rounded.track}"
    padding: "3px"
  segmented-option:
    backgroundColor: "transparent"
    textColor: "{colors.ink-secondary}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.segment}"
    padding: "0 16px"
    height: "44px"
  segmented-option-selected:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
  segmented-option-small:
    typography: "{typography.label}"
    padding: "0 12px"
  badge-status:
    backgroundColor: "{colors.track}"
    textColor: "{colors.ink-soft}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: "0 10px"
    height: "28px"
  button-utility:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control-sm}"
    padding: "0 14px"
    height: "44px"
  link-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.control-sm}"
    padding: "0 12px"
    height: "44px"
  overlay-header:
    backgroundColor: "{colors.glass}"
    rounded: "{rounded.overlay}"
    padding: "6px 18px 18px"
  overlay-dock:
    backgroundColor: "{colors.glass}"
    rounded: "{rounded.overlay}"
    width: "380px"
  bottom-sheet:
    backgroundColor: "{colors.glass}"
    rounded: "{rounded.sheet}"
  stage:
    backgroundColor: "{colors.stage}"
  rail-item:
    backgroundColor: "transparent"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.control}"
    padding: "4px 2px 6px"
  rail-item-selected:
    textColor: "{colors.ink}"
  drawer-summary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.title}"
    rounded: "{rounded.row}"
    padding: "9px 16px"
    height: "52px"
---

# Design System: Livetime Invitation Interactions

## Overview

**Creative North Star: "The Instrument Beside the Object"**

The 3D invitation object is the hero; everything in HTML is a precise, quiet instrument placed next to it. Since v1.4 (2026-10-02, owner: "can we actually fullscreen the scenes and do overlays for all the UI stuff?") the scene fills the screen and the interface floats over it on two translucent surfaces: the **header** (brand, honest-state badge, Motion, the event) and the **dock** (Host/Guest, the active panel, the collection, Developer). The dock is a side column on landscape screens and a bottom sheet on portrait ones. The interface is built from warm neutrals, olive-black ink and one segmented-control grammar, so the eye lands on the object first and the controls second. Nothing in the chrome is decorative except a single perforation-dot rule in the header, borrowed from the objects' own family mark. It is deliberately not a dashboard of cards. (v1.0–v1.3: one phone-width white card holding the event, a square stage and the controls, a collection rail and a collapsed drawer beside it.)

Density is compact but never cramped: a 12 to 16px type ramp carried mostly by weight, 44px minimum targets everywhere, and 52px targets for the decisions that matter (the host's primary action, Accept and Decline). Colour is almost absent from the interface. Ink is the only filled action colour. Pine green and garnet appear only to report a response the app has confirmed, and always alongside a glyph and words.

The objects' look (satin bodies, enamel inserts, the perforation construction rule, lighting and shadows) is owned by `docs/style-reference.md` (direction L2 "Satin Enamel · premium", v1.1). This file covers the interface around the stage. It never restyles the objects.

**Key Characteristics:**
- The scene fills the viewport at any aspect; the object is framed in the largest square the overlays leave free, exactly as on the square stage.
- Two overlay surfaces only: the header (top) and the dock (right column, or bottom sheet in portrait).
- A warm tonal stack (page, stage, track, hairline, white) instead of borders and shadows.
- One segmented-control pattern for every finite choice.
- Status colour is earned: solid fill only after a confirmed save.
- The system sans is pinned by the client specification; hierarchy comes from weight, not typeface.
- A single perforation rule is the only ornament.

## Colors

A near-monochrome warm-neutral palette with olive-black ink; the only saturated colours are the two response statuses and the focus ring.

### Primary
- **Olive Ink** (#202320): body text, headings and the one filled action colour (the host's primary button). The selected text in every segmented control. 15.2:1 on the page.

### Semantic
- **Saved Pine** (#176B42): Accept. Fills an accepted choice only after the save is confirmed; otherwise it tints the pending outline, the "Accepted" status line and its drawn check. 6.5:1 on white.
- **Garnet** (#A62D36): Decline, with the same rules as Saved Pine. Declining is given exactly the same visual weight as accepting. 6.9:1 on white.
- **Focus Cobalt** (#2F54C9): the 3px focus outline on every focusable element, and (at 18% alpha) the text selection wash. 6.5:1 on white.

### Neutral
- **Warm White** (#FBFAF7): the overlay ground and the root scrollbar track. As **Glass** (Warm White at 90 % over a 22px blur of the scene) it is the header and dock surface: over the darkest possible scene it still measures ≥ #E2E1DE, so Sage Graphite text stays ≥ 5.2:1 and ink ≥ 13:1. Without backdrop-filter it rises to 97 %; with reduced transparency or increased contrast it is solid Warm White.
- **Stage Greige** (#D5D2CD): the stage behind the 3D object (the page background before the controller mounts), and the fill behind collection thumbnails so posters and thumbs read as the same material. It is the rendered colour of the production studio's cove (the `neutral-room` rig, v1.3) measured from the empty stage, so the stage never shows a different colour while the poster, the fallback sentence or the canvas is up. (v1.1–v1.2: Stage Linen #F8E4C8, the peach plaster sweep; superseded by the studio pass, `docs/style-reference.md` v1.3.)
- **Paper White** (#FFFFFF): interactive surfaces on the glass: buttons, selected segment thumbs, the Motion toggle, the dock's collapse button, the Developer drawer.
- **Track Stone** (#EEECE6): the recessed track of every segmented control, and the "Simulated saves" badge.
- **Hairline Sand** (#E6E3DC): container rules only: the drawer border, the rule above the collection, the state list dividers.
- **Hover Wash** (#F7F6F2): hover fill on outlined white controls (choices, secondary button).
- **Keyline Grey** (#6F736D): 1.5px outlines on white controls, the inset keyline of a selected segment, and the disabled primary fill. 4.8:1 on white, 4.1:1 on the track.
- **Sage Graphite** (#585C57): secondary text: meta lines, legends, notes, unselected segment labels, collection names. 6.5:1 on Warm White, ≥5.2:1 on Glass over any scene, 5.8:1 on the track.
- **Soft Ink** (#3A3D39): text on tinted fills (badge text, the graphics notice, the developer event log) and the primary button's hover fill.
- **Perforation Taupe** (#CDC7BB): the dots of the perforation rule. Decorative and hidden from assistive tech; never used for text or boundaries.

### Named Rules
**The Solid Means Stored Rule.** A response choice fills with Saved Pine or Garnet only when the application has confirmed the save. While saving, or after a failed save, the chosen button stays white with a 2px border plus a 1.5px inset keyline and status-coloured text. The UI never implies persistence it has not confirmed.

**The Enamel Stays in the Object Rule.** The coral enamel #FF714A belongs to the objects. The interface never uses it, not for text, fills, outlines or focus (it measures 2.7:1 on white).

**The Ink Acts Rule.** Olive Ink is the only filled action colour. Status colours fill nothing except a saved choice, and every other control is white with a keyline or a tint of the track.

## Typography

**Display Font:** the system display face (-apple-system / SF Pro Display, falling back to Segoe UI, Roboto, Helvetica Neue, Arial)
**Body Font:** the system text face (-apple-system / SF Pro Text, with the same fallbacks)
**Label/Mono Font:** ui-monospace (SF Mono, Menlo, Consolas), Developer drawer only

**Character:** Plain, native and exact. The face is pinned by the client specification (PRODUCT.md Brand Commitments), so the system does not rely on typeface personality. Character comes from weight steps (400, 500, 600, 650, 700), tight negative tracking on the two heading roles, and tabular numerals wherever dates, times or counts appear.

### Hierarchy
- **Display** (650, 1.5rem, 1.15, -0.018em, balanced wrap): the event title in the header. It is the only size above 16px on the page. It steps down where the header must stay low: 1.375rem on small landscape screens (≤1100px wide or ≤760px tall), 1.25rem in portrait, 1.125rem on short landscape (≤540px tall) and short portrait (≤700px tall) phones.
- **Title** (650, 1rem, 1.4, -0.01em): the drawer summary. The "Livetime" wordmark uses the same size at 700.
- **Control** (600, 1rem): labels on 52px decision buttons (primary, secondary, Accept, Decline).
- **Body strong** (600, 0.9375rem): segmented-control labels, the "Will you attend?" question, the status line, quiet links.
- **Body** (400, 0.9375rem, 1.4): the event meta line (tabular numerals; date, place and "Sample event" wrap as whole items, the date never breaks, and a " · " separator never starts or ends a line), the Party song title, the brand descriptor.
- **Body small** (400, 0.875rem): the Motion toggle, the graphics notice, the meta line in portrait and short landscape.
- **Label** (600, 0.8125rem): fieldset legends naming a control group, the collection heading, small segmented controls. The same size at 400 is used for notes, the drawer hint and the "Song" key of the Party song line.
- **Caption** (600, 0.75rem): the status badge and the collection names under the thumbnails.
- **Mono** (400, 0.8125rem; 0.75rem in the log): developer state values and the integration event log.

### Named Rules
**The Weight Not Size Rule.** Below the event title the ramp moves in 1px steps from 12px to 16px, and hierarchy is carried by weight and ink tone. Exactly one role (the event title, 24px on desktop, 18–22px on smaller screens) jumps in size.

**The Plain Wordmark Rule.** "Livetime" is set as text (700) beside a 400 descriptor. There is no logo, monogram or brand graphic.

**The Diagnostics-Only Mono Rule.** Monospace appears only inside the Developer drawer. Guest- and host-facing copy is always the system sans.

## Layout

**Fullscreen scene, floating instruments (v1.4).** The scene is a full-viewport canvas (`createInvitation({ layout: 'fullscreen' })`, `position: fixed; inset: 0`) at any aspect. Every piece of UI floats over it on one of two Glass surfaces, inset by a gutter of 24px (16px on screens ≤1100px wide or ≤760px tall, 12px on short landscape and in portrait, 8px at ≤360px) plus the safe-area insets on every edge. Nothing scrolls the page: the dock scrolls inside itself when its content is taller than the screen.

**The frame square.** The showcase measures the area the overlays cover (header to its bottom edge plus 8px; the dock to its inner edge plus 8px; 16px at the bottom in side layout) and passes it to the controller as `frameInsets`. The controller frames the object in the largest square left free, centred in it, exactly as the square stage frames it; the rest of the viewport extends the same view (more studio, never a different composition). The object never sits under the title or the controls. Collapsing the dock or switching between Host and Guest (panels of different heights) re-measures, and the object re-frames.

**Regions per breakpoint** (all observed in the review captures):
- **Desktop and landscape tablets** (landscape, >540px tall): the **header** floats top-left, at most 520px wide and never closer than one gutter to the dock: a 52px bar (wordmark and descriptor left; "Simulated saves" and Motion right), the perforation rule, the event title, the meta line and (Party) the song line. The **dock** is a right column 380px wide (400px at ≥1280px; 360px on smaller screens), from the top gutter down to at most the bottom gutter, content-height otherwise: a head row (Host/Guest switch, collapse button), then the active panel, the graphics notice, a hairline, the collection strip and the Developer drawer. The frame square sits left of the dock, below the header.
- **Short landscape** (landscape, ≤540px tall: phones on their side, 200% zoom on a laptop): the same two regions, tighter. The header drops the brand descriptor and the rule, and runs as wide as the scene's side allows so the meta keeps to one line; the dock is 352px wide and its host action labels step down to 15px. Accept and Decline stay on screen without scrolling.
- **Portrait phones** (portrait, or anything narrower than 600px): the header spans the top (title 20px). The dock becomes a **bottom sheet**, edge to edge, with a 24px top radius and its own upward shadow. Its resting height is the active panel plus a 40px peek of the collection (`--sc-primary-h`, measured), and never more than the screen below the header minus `max(30svh, 180px)`, which the scene keeps; past that the sheet's body scrolls (collection, Developer). The collapse button lowers the sheet to its head row (Host/Guest and the button), giving the object the screen; choosing Host or Guest raises it again.
- **Portrait tablets** (portrait, ≥600px wide): the header and the sheet share one centred 560px measure; the sheet floats one gutter above the bottom with the overlay radius on every corner.
- **≤420px:** the brand descriptor hides. **≤360px:** the gutter is 8px, the bar's gaps tighten so wordmark, badge and Motion keep one row at 320px, and the host action pair stacks. **Short portrait** (≤700px tall, iPhone SE class): the rule hides and the title is 18px.

### Named Rules
**The Instrument Beside the Object Rule.** Overlays never cover the object: the controller frames it in the square the overlays leave free. Controls that act on the object live in the dock, the host's preset choice before the primary action, because the host picks and then acts.

**The Same Shot Rule.** Whatever the viewport, the object is framed exactly as on the square stage and in the square posters; a wider or taller screen only shows more of the studio around it.

**The Answer Within Reach Rule.** At every supported size (320×568 to 1440×900, landscape 844×390, 200% zoom) Accept and Decline are on screen in guest mode without scrolling the page or the dock.

## Elevation & Depth

The system is tonal first. Depth comes from the warm stack: the scene, the Glass overlays, the Track Stone recess and the Paper White controls. Only the two overlays float. Shadows otherwise appear only as a selected state, and borders are hairlines or keylines rather than structure.

### Shadow Vocabulary
- **Overlay lift** (`box-shadow: 0 1px 2px rgba(32,35,32,0.06), 0 18px 48px -28px rgba(32,35,32,0.36)`, with a `1px solid rgba(32,35,32,0.08)` border): the header and the dock only. A long, low, negative-spread shadow that lifts the glass off the scene. The bottom sheet casts it upward (`0 -18px 48px -30px`).
- **Selected segment** (`box-shadow: inset 0 0 0 1px #6F736D, 0 1px 2px rgba(32,35,32,0.12), 0 2px 8px -4px rgba(32,35,32,0.2)`): the white thumb of a pressed segment. The inset keyline carries the state at ≥3:1 against the track, and the lift is secondary.
- **Selected thumbnail** (a 2px Olive Ink outline at a 2px offset): the current scene in the collection strip.
- **Pending keyline** (`box-shadow: inset 0 0 0 1.5px <status colour>` over a 2px status border): a chosen but unsaved response.
- **Emphasis keyline** (`box-shadow: inset 0 0 0 1px #202320` over an ink border): "Preview as guest" after the host has prepared the card.

### Named Rules
**The Two Overlays Rule.** The header and the dock are the only elements with an ambient drop shadow. The collection, the drawer and the notices sit flat on the glass. (v1.0–v1.3: the One Lifted Card Rule, the invitation card.)

## Shapes

The corners are soft and nested, stepping up with the size of the container: 10px segment thumbs inside a 13px track (a 3px inset, so the curves stay concentric), 12px for 44px utility controls, quiet links, the collapse button and the collection thumbnails, 14px for 52px decision buttons, the graphics notice and the collection buttons, 16px for the drawer, 22px for the header and the dock, 24px for the top corners of the phone bottom sheet. Pills (999px) are reserved for the status badge.

Outlines are 1.5px Keyline Grey on white controls, rising to 2px in the status colour for a pending choice. The fullscreen stage has no corners; it clips its contents (`overflow: hidden`, isolated stacking). The square poster and the text fallback sit on the frame square; the poster's edges fade (a 9% mask on each side) into the backdrop still, the bare studio rendered at 7× the frame field around the same framing, so poster and canvas show the same object in the same place at any aspect. (Square embeds keep the 1:1 stage with its radius.)

**The Perforation Rule.** The one ornament is a single row of whole dots in the header, between the bar and the event: 1.35px dots on a 12px pitch in a 6px band, in Perforation Taupe, spanning the header. It hides on short screens. It echoes the objects' inset perforation band. It appears once per page and never as a divider between sections.

A square embed's stage takes the shared component default radius (`--lt-radius-stage`, 22px); the fullscreen stage has none.

## Components

### Buttons
Firm, calm and exactly sized; nothing bounces.
- **Shape:** gently rounded (14px) at 52px tall for decisions; 12px at 44px for utilities.
- **Primary:** Olive Ink fill, white 16px/600 label, 1.5px ink border, 0 16px padding. Used once per panel for the scene's host action ("Attach card", "Place record", "Place candles"), then "… again".
- **Hover / Focus:** the primary shifts to Soft Ink (#3A3D39) and the secondary takes Hover Wash, over a 120ms ease-out colour transition. Focus is the global 3px Focus Cobalt outline at a 2px offset. While the host sequence plays, the primary takes `aria-disabled` (so keyboard focus stays on it) and a Keyline Grey fill with a progress cursor.
- **Secondary:** white with a 1.5px Keyline Grey outline and an ink label. After the host prepares the card it gains emphasis (ink border plus a 1px inset ink keyline), pointing to the next step without competing with the primary.
- **Pairing:** primary and secondary share a two-column grid with a 10px gap, at equal widths. They stack at ≤420px.
- **Utility:** white, 44px, 12px radius, 14px/600 label ("Try 3D again" in the graphics notice; "Reset demo", "Simulate graphics loss" and "Restore 3D (dev)" in the drawer, so no two visible buttons share a name). This tier is reserved for the drawer and the graphics notice.
- **Collapse:** a white 44×44 button with a 1px Keyline Grey border and a 20px chevron at the end of the dock's head row, named "Controls" with `aria-expanded` (controls the dock body). Side column: the chevron points up to fold the panel away, down to open it. Sheet: down to lower the sheet, up to raise it. The chevron turns over 160ms (none with reduced motion). Focus stays on it.

### Response Choices (signature)
- **Style:** Accept and Decline are always an equal-width pair: 52px tall, white, 1.5px Keyline Grey outline, a 16px/600 label led by an 18px stroked glyph (check for Accept, minus for Decline). They carry `aria-pressed`.
- **States:** Hover Wash on hover; a 1px press-down on `:active`. Saved: a solid Saved Pine or Garnet fill with white text. Saving or failed: white, a 2px status border plus a 1.5px inset keyline, and status-coloured text (see The Solid Means Stored Rule).

### Status Line
- **Style:** a 44px row under the choices. The left side is a polite live region (15px/600) that is rewritten only when its words change; the right side holds the quiet actions.
- **States:** "Saving response…" with a 14px ring spinner (pale muted ring, ink arc, 800ms linear). "Accepted" or "Declined" in the status colour, with an 18px check or minus that draws itself in 360ms `cubic-bezier(0.16, 1, 0.3, 1)`; this is the shell's one authored motion moment. "Couldn't save your response." in ink with a circled alert glyph, plus a bordered "Try again".

### Song Line (Party)
- **Style:** a one-line paragraph under the event meta in the header, shown in host and guest modes whenever the Party scene is up: a 13px Sage Graphite "Song" key, then the title in 15px ink, baseline-aligned with an 8px gap.
- **Why:** the record label art is decorative, so the chosen song is always named in HTML. Unknown or missing metadata reads "Selected track".

### Quiet Links
- **Style:** transparent, ink, 15px/600, underlined (1px thickness, 3px offset), 44px target with 0 12px padding and a 16px leading glyph where needed ("Replay"). A faint warm fill on hover.
- **Recovery variant:** "Try again" drops the underline and takes a 1.5px Keyline Grey border. Recovery is an action, so it never reads as a stray link.

### Segmented Control (signature)
- **Style:** a Track Stone recess (13px radius, 3px padding, 2px gap) holding transparent 44px options in 15px/600 Sage Graphite.
- **State:** the selected option becomes a white 10px thumb with ink text, an inset Keyline Grey keyline and a small lift (see Elevation). Hover darkens the label to ink. Transitions run 120ms ease-out on background, colour and shadow. State is exposed through `aria-pressed` inside a labelled group.
- **Small variant:** 13px labels with 0 12px padding, used for developer settings. Secondary figures ("250 ms", "3 s") sit in a 500-weight tabular `small`.
- **Wrapping variant:** for long labels (the Party song titles) the options share a row while they fit and wrap onto further rows when they don't (they stack at 320–340px) instead of overflowing.
- **Use:** every finite choice (Host/Guest mode, scene presets such as card template, record label and frosting, the Party song, simulated save mode, render quality). Inside a fieldset the control stretches to full width.

### Status Badge and Motion Toggle
- **Badge:** a Track Stone pill, 28px tall, 12px/600 Soft Ink ("Simulated saves"). It is an honest-state label, not a button.
- **Motion toggle:** a labelled toggle button ("Motion" in Sage Graphite 400, value "On"/"Off" in ink 700), 44px tall with a 12px radius. It follows the OS reduced-motion setting live until the viewer overrides it.

### Overlays / Containers
- **Header:** Glass, 22px radius, overlay lift, 6px 18px 18px padding (tighter on smaller screens). The bar, the perforation rule, the event title, the meta line, the song line. There is exactly one.
- **Dock:** Glass, 22px radius (24px top corners as a phone sheet), overlay lift. A head row (12px padding: Host/Guest switch at least 84px per option, collapse button), then a scrolling body (14px side padding, stable scrollbar gutter, contained overscroll): the active panel and the graphics notice on a 14px stack, a Hairline Sand rule, the collection strip, the Developer drawer. There is exactly one.
- **Stage:** the full viewport in Stage Greige. A poster image cross-fades to the live canvas (180ms ease-out), with the backdrop still around it; if graphics fail, a centred 15px Sage Graphite sentence replaces the poster on the frame square. No CSS layer sits over poster or canvas (v1.3, revision #33); what the renderer draws is what shows. The response never waits on the stage.
- **Graphics notice:** a 14px-radius warm strip (#F1EEE7) under the panel, holding 14px Soft Ink text and a "Try 3D again" utility button. It is shown only when graphics are degraded. The text says what the stage shows ("Showing a still image." when a poster is up, "The 3D scene isn't available right now." when only the text description is, "The 3D scene is taking a while." during a slow load) and what still works for this viewer ("Your response still works." for a guest, "Presets and preview still work." for a host).

### Collection Strip
- **Style:** a "The collection" Label heading over a five-column grid of buttons (6px gap). Each holds a Stage Greige thumbnail (up to 56px, 12px radius) over its name in Caption. Each button is named "Party, record player" and so on (the visible name is hidden from assistive tech so it is not read twice); `aria-pressed` carries the selection.
- **States:** hover takes a 5% ink wash and darkens the name. The current scene's thumbnail carries a 2px Olive Ink outline at a 2px offset, and its name is ink. Scenes not yet live are `aria-disabled`, with a desaturated thumbnail (saturation 0.55, opacity 0.8) and no hover.
- **Choosing a scene** opens a new invitation: a fresh controller and adapter with no response, so an answer never carries from one event to the next (presets and songs change within one event and keep it). The scene is always on screen, so nothing scrolls. A visually hidden polite live region announces the event ("Showing Party: Rooftop listening party"), and focus stays on the pressed button so keyboard users can keep browsing.

### Developer Drawer
- **Style:** a native `details` panel at the end of the dock: Paper White, 16px radius, Hairline Sand border. The 52px summary carries "Developer" in the Title role with a CSS-drawn chevron that rotates over 160ms, and the 13px Sage Graphite hint on a line under it. It is collapsed by default; opened, the dock scrolls to it.
- **Body:** 16px padding, 18px stack. Small segmented controls, then a two-column definition list with hairline rules (12px labels, mono 13px values), then utility buttons, then the mono 12px event log (tabular time, bold kind, wrapping detail, newest first, 10 entries).

## Do's and Don'ts

### Do:
- **Do** keep the object the hero of the whole screen: frame it in the square the overlays leave free, and keep at least 30% of a phone's height for it.
- **Do** place every control that acts on the object in the dock, with the host's preset choice before the primary action.
- **Do** put overlay text on the Glass surfaces only, never straight on the scene.
- **Do** use the segmented control (Track Stone recess, 3px inset, white thumb with a Keyline Grey keyline) for every finite choice.
- **Do** fill a response choice with Saved Pine or Garnet only after the save is confirmed; show pending and failed choices as a 2px status border plus a 1.5px inset keyline.
- **Do** pair every status colour with a glyph and words: check for Accept, minus for Decline, circled alert for an error.
- **Do** keep every target at least 44px tall, and make decision buttons 52px.
- **Do** use the 3px Focus Cobalt (#2F54C9) outline at a 2px offset on everything focusable.
- **Do** label simulated behaviour in the chrome itself: the "Simulated saves" badge and "Sample event" in the meta line.
- **Do** honour reduced motion: no spinner rotation, no check draw, no poster cross-fade, and no Replay control.

### Don't:
- **Don't** use the coral enamel #FF714A anywhere in the interface: not for text, fills, outlines or focus rings. It belongs to the objects.
- **Don't** add a third floating surface or a grid of cards; the header and the dock are the only surfaces with the ambient shadow.
- **Don't** let an overlay cover the object; pass the overlays' extent to the controller as `frameInsets`.
- **Don't** add ornament beyond the single perforation rule in the header, and don't repeat that rule as a section divider.
- **Don't** draw a Livetime logo, monogram or brand graphic; the wordmark is plain text.
- **Don't** outline a control (button, toggle, choice) in a grey lighter than Keyline Grey (#6F736D); Hairline Sand is for containers and rules, where text carries the affordance.
- **Don't** set monospace outside the Developer drawer.
- **Don't** put small labels above headings; the only small labels are fieldset legends that name a control group.
- **Don't** restyle the objects from the interface side; their materials, perforation construction and lighting live in `docs/style-reference.md`.
