---
name: Livetime Invitation Interactions
description: A precise, warm-neutral instrument that sits beside a tactile 3D invitation object and never competes with it.
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
  card-invitation:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
    padding: "20px"
  stage:
    backgroundColor: "{colors.stage}"
    rounded: "{rounded.stage}"
  rail-item:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.row}"
    padding: "6px 14px 6px 6px"
    height: "72px"
  rail-item-selected:
    backgroundColor: "{colors.surface}"
  drawer-summary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.title}"
    rounded: "{rounded.panel}"
    padding: "0 18px"
    height: "56px"
---

# Design System: Livetime Invitation Interactions

## Overview

**Creative North Star: "The Instrument Beside the Object"**

The 3D invitation object is the hero; everything in HTML is a precise, quiet instrument placed next to it. The interface is built from warm neutrals, olive-black ink and one segmented-control grammar, so the eye lands on the stage square first and the controls second. Nothing in the chrome is decorative except a single perforation-dot rule under the top bar, borrowed from the objects' own family mark. The page is one lifted invitation card, a collection rail and a collapsed Developer drawer. It is deliberately not a dashboard of cards.

Density is compact but never cramped: a 12 to 16px type ramp carried mostly by weight, 44px minimum targets everywhere, and 52px targets for the decisions that matter (the host's primary action, Accept and Decline). Colour is almost absent from the interface. Ink is the only filled action colour. Pine green and garnet appear only to report a response the app has confirmed, and always alongside a glyph and words.

The objects' look (satin bodies, enamel inserts, the perforation construction rule, lighting and shadows) is owned by `docs/style-reference.md` (direction L2 "Satin Enamel · premium", v1.1). This file covers the interface around the stage. It never restyles the objects.

**Key Characteristics:**
- One phone-width column holds the event, the square stage and the controls, in that order, inside one white card.
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
- **Warm White** (#FBFAF7): the page ground and the root scrollbar track.
- **Stage Greige** (#D5D2CD): the stage square behind the 3D object, and the fill behind collection thumbnails so posters and thumbs read as the same material. It is the rendered colour of the production studio's cove (the `neutral-room` rig, v1.3) measured from the empty stage, so the stage never shows a different colour while the poster, the fallback sentence or the canvas is up. (v1.1–v1.2: Stage Linen #F8E4C8, the peach plaster sweep; superseded by the studio pass, `docs/style-reference.md` v1.3.)
- **Paper White** (#FFFFFF): lifted and interactive surfaces: the invitation card, buttons, selected segment thumbs, the selected rail row, the Developer drawer.
- **Track Stone** (#EEECE6): the recessed track of every segmented control, and the "Simulated saves" badge.
- **Hairline Sand** (#E6E3DC): container rules only: the drawer border, the selected rail row border, the state list dividers.
- **Hover Wash** (#F7F6F2): hover fill on outlined white controls (choices, secondary button).
- **Keyline Grey** (#6F736D): 1.5px outlines on white controls, the inset keyline of a selected segment, and the disabled primary fill. 4.8:1 on white, 4.1:1 on the track.
- **Sage Graphite** (#585C57): secondary text: meta lines, lede, legends, notes, unselected segment labels, rail sublines and tags. 6.5:1 on the page, 5.8:1 on the track.
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
- **Display** (650, 1.5rem, 1.15, -0.018em, balanced wrap): the event title inside the invitation card. It is the only size above 16px on the page.
- **Title** (650, 1rem, 1.4, -0.01em): the collection heading, rail row names, the drawer summary. The "Livetime" wordmark uses the same size at 700.
- **Control** (600, 1rem): labels on 52px decision buttons (primary, secondary, Accept, Decline).
- **Body strong** (600, 0.9375rem): segmented-control labels, the "Will you attend?" question, the status line, quiet links.
- **Body** (400, 0.9375rem, 1.4): the event meta line (tabular numerals; date, place and "Sample event" wrap as whole items, the date never breaks, and a " · " separator never starts or ends a line), the Party song title, the collection lede (max 44ch), the brand descriptor.
- **Body small** (400, 0.875rem): rail object lines, the Motion toggle, the graphics notice.
- **Label** (600, 0.8125rem): fieldset legends naming a control group, small segmented controls. The same size at 400 is used for notes, the drawer hint and the "Song" key of the Party song line.
- **Caption** (600, 0.75rem): the status badge and the rail tag ("Showing"; "In production" for a scene not yet live).
- **Mono** (400, 0.8125rem; 0.75rem in the log): developer state values and the integration event log.

### Named Rules
**The Weight Not Size Rule.** Below the event title the ramp moves in 1px steps from 12px to 16px, and hierarchy is carried by weight and ink tone. Exactly one role (the event title at 24px) jumps in size.

**The Plain Wordmark Rule.** "Livetime" is set as text (700) beside a 400 descriptor. There is no logo, monogram or brand graphic.

**The Diagnostics-Only Mono Rule.** Monospace appears only inside the Developer drawer. Guest- and host-facing copy is always the system sans.

## Layout

The page is a warm-white field with a side gutter of `max(16px, safe-area insets)` and a bottom pad of `max(40px, safe-area-bottom)`. The header block stacks a 64px top bar (wordmark left; badge and Motion toggle right), the perforation rule and the Host/Guest switch on one measure: 1040px (1120px at ≥1280px, the 480px column at ≤900px). The rule has a 28px bottom margin (16px at ≤420px, 8px on short portrait phones, 10px in short landscape); the switch sits 14px above the card (10px on short portrait phones).

**Two columns on desktop.** The main grid is `minmax(0, 440px)` for the invitation and `minmax(0, 420px)` for the side column, pushed apart with `space-between` and gaps of 40px (rows) and 56px (columns). At ≥1280px the columns become 480px and 400px, still `space-between`, so at every desktop width the card starts at the wordmark's edge and the rail ends at the Motion toggle's. The side column is pulled up 6px so the collection heading's cap line meets the top edge of the invitation card.

**Inside the invitation column** the card stands alone under the mode switch. Inside the card, on a 16px rhythm: title and meta, then the square stage, then (Party only) the song line, then the active panel. The host panel reads preset control (Party: the Song control first, then Record label), then a two-column action pair (10px gap), then a note. The guest panel reads question, then an equal-width Accept/Decline pair (10px gap), then a 44px status row.

**Responsive behaviour** (all observed in the review captures):
- **≤900px:** one centred 480px column; the top bar, rule and switch share its measure; the collection rail and the Developer drawer follow the card.
- **≤420px:** the card padding drops to 14px (the radius stays 28px); the host action pair stacks; the brand descriptor hides; the drawer hint wraps under its title.
- **Short portrait** (portrait, height ≤740px, iPhone SE class): the rule's margin drops to 8px and the switch's to 10px, so more of the card reaches the first viewport. The answers may still need a scroll there, which the specification allows.
- **Short landscape** (landscape, height ≤540px, width ≥600px, which also catches 200% zoom on a laptop): the Host/Guest switch joins the top bar in flow, between the wordmark and the actions. Wordmark and actions share the row equally, so the switch sits at the centre while there is room; the wider side takes what it needs, and when the three cannot fit (enlarged text) the actions wrap to a row of their own. Nothing is positioned over anything else. The brand descriptor hides, the header and card run full width, and the rail is capped at 480px. The card becomes two columns: the stage square sits on the left, sized `min(100svh − 112px − safe areas, 48vw)`; title, controls and status sit on the right. The whole answer stays above the fold.
- **Landscape ≤720px wide:** the brand descriptor hides.

### Named Rules
**The Controls Under the Stage Rule.** Every control that acts on the object sits directly beneath the stage, inside the same card. In host mode the preset choice comes before the primary action, because the host picks and then acts.

**The Phone-Width Rule.** The invitation never grows beyond phone-to-small-tablet width (440–480px), even on a wide desktop. The object is shown at the size a guest will actually see it.

## Elevation & Depth

The system is tonal first. Depth comes from the warm stack: the Warm White page, the Stage Greige square, the Track Stone recess and the Paper White surfaces. Only one surface floats. Shadows otherwise appear only as a selected state, and borders are hairlines or keylines rather than structure.

### Shadow Vocabulary
- **Card lift** (`box-shadow: 0 1px 2px rgba(32,35,32,0.05), 0 18px 48px -28px rgba(32,35,32,0.32)`, with a `1px solid rgba(32,35,32,0.07)` border): the invitation card only. A long, low, negative-spread shadow that reads as the card resting on the page.
- **Selected segment** (`box-shadow: inset 0 0 0 1px #6F736D, 0 1px 2px rgba(32,35,32,0.12), 0 2px 8px -4px rgba(32,35,32,0.2)`): the white thumb of a pressed segment. The inset keyline carries the state at ≥3:1 against the track, and the lift is secondary.
- **Selected row** (`box-shadow: 0 1px 2px rgba(32,35,32,0.05)` plus a Hairline Sand border): the current collection row.
- **Pending keyline** (`box-shadow: inset 0 0 0 1.5px <status colour>` over a 2px status border): a chosen but unsaved response.
- **Emphasis keyline** (`box-shadow: inset 0 0 0 1px #202320` over an ink border): "Preview as guest" after the host has prepared the card.

### Named Rules
**The One Lifted Card Rule.** The invitation card is the only element with an ambient drop shadow. The rail, the drawer and the notices sit flat on the page.

## Shapes

The corners are soft and nested, stepping up with the size of the container: 10px segment thumbs inside a 13px track (a 3px inset, so the curves stay concentric), 12px for 44px utility controls, quiet links and 60px rail thumbnails, 14px for 52px decision buttons and the graphics notice, 16px rail rows, 18px for the drawer, 20px for the stage square and 28px for the invitation card at every width. Pills (999px) are reserved for the status badge.

Outlines are 1.5px Keyline Grey on white controls, rising to 2px in the status colour for a pending choice. The stage is always a 1:1 square that clips its contents (`overflow: hidden`, isolated stacking), so the canvas, the poster and the text fallback share one silhouette.

**The Perforation Rule.** The one ornament is a single row of whole dots under the top bar: 1.35px dots on a 12px pitch in a 6px band, in Perforation Taupe, spanning the top-bar measure. It echoes the objects' inset perforation band. It appears once per page and never as a divider between sections.

The stage keeps the showcase's 20px radius; the shared component default (`--lt-radius-stage`, 22px) applies only on the visual-study page.

## Components

### Buttons
Firm, calm and exactly sized; nothing bounces.
- **Shape:** gently rounded (14px) at 52px tall for decisions; 12px at 44px for utilities.
- **Primary:** Olive Ink fill, white 16px/600 label, 1.5px ink border, 0 16px padding. Used once per panel for the scene's host action ("Attach card", "Place record", "Place candles"), then "… again".
- **Hover / Focus:** the primary shifts to Soft Ink (#3A3D39) and the secondary takes Hover Wash, over a 120ms ease-out colour transition. Focus is the global 3px Focus Cobalt outline at a 2px offset. While the host sequence plays, the primary takes `aria-disabled` (so keyboard focus stays on it) and a Keyline Grey fill with a progress cursor.
- **Secondary:** white with a 1.5px Keyline Grey outline and an ink label. After the host prepares the card it gains emphasis (ink border plus a 1px inset ink keyline), pointing to the next step without competing with the primary.
- **Pairing:** primary and secondary share a two-column grid with a 10px gap, at equal widths. They stack at ≤420px.
- **Utility:** white, 44px, 12px radius, 14px/600 label ("Try 3D again" in the graphics notice; "Reset demo", "Simulate graphics loss" and "Restore 3D (dev)" in the drawer, so no two visible buttons share a name). This tier is reserved for the drawer and the graphics notice.

### Response Choices (signature)
- **Style:** Accept and Decline are always an equal-width pair: 52px tall, white, 1.5px Keyline Grey outline, a 16px/600 label led by an 18px stroked glyph (check for Accept, minus for Decline). They carry `aria-pressed`.
- **States:** Hover Wash on hover; a 1px press-down on `:active`. Saved: a solid Saved Pine or Garnet fill with white text. Saving or failed: white, a 2px status border plus a 1.5px inset keyline, and status-coloured text (see The Solid Means Stored Rule).

### Status Line
- **Style:** a 44px row under the choices. The left side is a polite live region (15px/600) that is rewritten only when its words change; the right side holds the quiet actions.
- **States:** "Saving response…" with a 14px ring spinner (pale muted ring, ink arc, 800ms linear). "Accepted" or "Declined" in the status colour, with an 18px check or minus that draws itself in 360ms `cubic-bezier(0.16, 1, 0.3, 1)`; this is the shell's one authored motion moment. "Couldn't save your response." in ink with a circled alert glyph, plus a bordered "Try again".

### Song Line (Party)
- **Style:** a one-line paragraph between the stage and the panel, shown in host and guest modes whenever the Party scene is up: a 13px Sage Graphite "Song" key, then the title in 15px ink, baseline-aligned with an 8px gap.
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

### Cards / Containers
- **Invitation card:** Paper White, 28px radius at every width, 20px padding (14px at ≤420px, 16px in short landscape), 16px internal gap, card-lift shadow and a 7% ink hairline border. There is exactly one per page.
- **Stage:** a Stage Greige 1:1 square, 20px radius, full card width. A poster image cross-fades to the live canvas (180ms ease-out); if graphics fail, a centred 15px Sage Graphite sentence replaces it. No CSS layer sits over poster or canvas (v1.3, revision #33; the v1.1 warm vignette and film grain were removed); what the renderer draws is what shows. The response never waits on the stage.
- **Graphics notice:** a 14px-radius warm strip under the panel, holding 14px Soft Ink text and a "Try 3D again" utility button. It is shown only when graphics are degraded. The text says what the stage shows ("Showing a still image." when a poster is up, "The 3D scene isn't available right now." when only the text description is, "The 3D scene is taking a while." during a slow load) and what still works for this viewer ("Your response still works." for a guest, "Presets and preview still work." for a host).

### Collection Rail
- **Style:** a list of full-width row buttons (72px minimum, 16px radius, 6px 14px 6px 6px padding, 6px apart; at most 480px wide). Each row has a 60px Stage Greige thumbnail (12px radius) and a name (16px/650) over an object line (14px Sage Graphite). Only the current row carries a right-aligned 12px/600 tag. Each button is named "Party, record player" and so on; `aria-pressed` carries the selection.
- **States:** hover takes a faint warm fill. The current row is Paper White with a Hairline Sand border, a 1px shadow and the tag "Showing" in ink. Scenes not yet live are `aria-disabled`, with a desaturated thumbnail (saturation 0.55, opacity 0.8), no hover and the tag "In production".
- **Choosing a scene** opens a new invitation: a fresh controller and adapter with no response, so an answer never carries from one event to the next (presets and songs change within one event and keep it). If less than half the stage is on screen (phones, where the rail follows the card), the card scrolls into view, smoothly only with Motion on. A visually hidden polite live region announces the event ("Showing Party: Rooftop listening party"), and focus stays on the pressed row so keyboard users can keep browsing.

### Developer Drawer
- **Style:** a native `details` panel: Paper White, 18px radius, Hairline Sand border. The 56px summary carries "Developer" in the Title role, a 13px Sage Graphite hint and a CSS-drawn chevron that rotates over 160ms. It is collapsed by default.
- **Body:** 18px padding, 18px stack. Small segmented controls, then a two-column definition list with hairline rules (12px labels, mono 13px values), then utility buttons, then the mono 12px event log (tabular time, bold kind, wrapping detail, newest first, 10 entries).

## Do's and Don'ts

### Do:
- **Do** keep the object the largest thing in the first viewport: a full-width square stage inside a phone-width column (440px; 480px at ≥1280px and in the single-column layout).
- **Do** place every control that acts on the object directly under the stage, inside the invitation card, with the host's preset choice before the primary action.
- **Do** use the segmented control (Track Stone recess, 3px inset, white thumb with a Keyline Grey keyline) for every finite choice.
- **Do** fill a response choice with Saved Pine or Garnet only after the save is confirmed; show pending and failed choices as a 2px status border plus a 1.5px inset keyline.
- **Do** pair every status colour with a glyph and words: check for Accept, minus for Decline, circled alert for an error.
- **Do** keep every target at least 44px tall, and make decision buttons 52px.
- **Do** use the 3px Focus Cobalt (#2F54C9) outline at a 2px offset on everything focusable.
- **Do** label simulated behaviour in the chrome itself: the "Simulated saves" badge and "Sample event" in the meta line.
- **Do** honour reduced motion: no spinner rotation, no check draw, no poster cross-fade, and no Replay control.

### Don't:
- **Don't** use the coral enamel #FF714A anywhere in the interface: not for text, fills, outlines or focus rings. It belongs to the objects.
- **Don't** add a second lifted card or a grid of cards; the invitation card is the only surface with the ambient shadow.
- **Don't** add ornament beyond the single perforation rule under the top bar, and don't repeat that rule as a section divider.
- **Don't** draw a Livetime logo, monogram or brand graphic; the wordmark is plain text.
- **Don't** outline a control (button, toggle, choice) in a grey lighter than Keyline Grey (#6F736D); Hairline Sand is for containers and rules, where text carries the affordance.
- **Don't** set monospace outside the Developer drawer.
- **Don't** put small labels above headings; the only small labels are fieldset legends that name a control group.
- **Don't** restyle the objects from the interface side; their materials, perforation construction and lighting live in `docs/style-reference.md`.
