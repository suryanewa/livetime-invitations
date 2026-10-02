# Brief (v1.4): consistent scale, fullscreen scenes with overlay UI

Owner (2026-10-02): "the sense of scale with the models is pretty poor. Make it feel more consistent. Also, can we
actually fullscreen the scenes and do overlays for all the UI stuff?" Decisions (owner's answers):
- **Scale = real proportions + even framing.** Within each scene, objects keep real-world proportions to each other;
  across scenes, one camera (same lens, same height/elevation, same azimuth) and the hero object fills a similar share
  of the frame. Today each scene picks its own scale and the camera zooms to fit: the dish is tiny next to the huge
  turntable, the ball is small beside a giant hoop, the RFID reader is taller than the badge.
- **Fullscreen = showcase + embed option.** The showcase becomes a fullscreen scene with floating overlays (event
  title/meta, answer buttons + status, host presets and primary action, collection switcher, Developer drawer, the
  Simulated-saves badge and Motion toggle), and the embeddable controller gains a fullscreen/overlay mode
  (`createInvitation({ ..., layout: 'fullscreen' })` or equivalent) so the app can use it too; the square stage stays
  the default for existing embeds.
- **Phones = bottom sheet.** The scene fills the screen; the title floats at the top; answers and presets live in a
  translucent, collapsible bottom sheet.

## Scale part (real proportions)
Pick real-world reference sizes and record them in each contract: turntable ≈ 45 cm wide (12" record = 30.5 cm),
two-tier cake on its stand ≈ 35 cm tall, basketball 24 cm (or a 18 cm mini ball if the hoop is the mini wall hoop —
decide from the master: rim inner diameter ≈ 1.6× the ball must still hold), dinner plate ≈ 27 cm with a cloche to
match, ID-badge holder ≈ 7 × 10 cm with a ~2 cm strap, desktop RFID reader ≈ 9–10 cm wide, the shared bin sized
against the cake/dish it receives. Convert with ONE world scale for every scene (e.g. 1 unit = 10 cm), re-derive every
contract number that depends on size (the made-shot arc, net, clearances, carry paths, bin placement, card swing,
pivots), keep beats/durations and the tests' intents (update numbers), and re-export (`pnpm models`). Then make the
camera consistent: one lens/elevation/azimuth (already shared) and a framing rule based on the hero object (e.g. its
silhouette fills ~55–65 % of the frame height in the guest-ready pose, all authored paths still in frame) rather than
fitting every path's bounds at whatever zoom that needs. Judge it on the five guest-ready stills side by side: objects
should read at believable relative sizes and the scenes should feel shot by one photographer.

## Fullscreen part
The stage becomes a full-viewport canvas (any aspect; the camera fit must handle wide and tall viewports, keeping the
hero framing rule and the authored paths in frame); posters must cover the viewport without a different framing from
the canvas (render posters at the stage's aspect or crop consistently). All accessibility rules in DESIGN.md/PRODUCT.md
still hold (44 px targets, contrast ≥ 4.5:1 for overlay text over the scene — use a scrim or a solid surface behind
text, focus rings, reduced motion, landscape, 200 % zoom, safe areas). Update DESIGN.md (this changes the "one
phone-width card" layout), the browser tests, the UI captures, and docs (style-reference, integration for the new
layout option, spec-revisions, qualification).
