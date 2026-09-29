# Style reference — direction L "Satin Enamel" · v1.0

Locked 2026-09-28 at checkpoint 1 by Surya: **B + A restraint, keeping A's coloured candles and A's covered dish.** One consolidated refinement pass applied from the independent panel's findings (`docs/visual-study.md`). This file owns the production look for all five scenes; scenes never pick their own look.

Source of truth for values: `src/render/materials.ts` (`DIRECTIONS.L`), `src/render/lighting.ts`, `src/render/camera.ts`, `src/render/contactShadow.ts`.
Approved references (browser-rendered): `~/Creative/Livetime/invitation-interactions/study/2026-09-28-style-lock-L/`.

## Rules in one paragraph

Cream satin bodies with crisp edges. **One enamel insert per object**, drawn from coral `#FF714A`, deepened cobalt `#2C47A6` or ink `#25282B`. Brushed satin metal only where it identifies the object (clip, cloche, tonearm, platter, hinge). The family mark is **one row of inset perforations**: whole dots only, spacing equal to band height, centred with at least one pitch of margin, and only on manufactured supports (tray band, card border, scanner collar, plinth band, backboard frame, plate rim), never on food. Every object carries **at least one silhouette element at ≥3:1 against the stage** (ink keyline edge, enamel insert along the silhouette, or dark foot). No mustard bodies, no clearcoat, no mirror chrome.

## Renderer and colour

| Setting | Value |
| --- | --- |
| Renderer | Three.js r186 WebGLRenderer, WebGL2, MSAA on |
| Output | sRGB; linear working space; linear (NoColorSpace) data maps |
| Tone mapping | NeutralToneMapping, exposure 1.0 |
| Camera | Orthographic, azimuth 20°, elevation 15°, motion-bounds fit with 8% clearance |
| Stage | `#F4F1EB`, seamless, no floor line |
| Key | Directional `#FFF6EC` × 1.9 from (−3.2, 5.4, 4.2) — upper left, front |
| Fill | Hemisphere sky `#F7F3EE` / ground `#CFC4B3` × 0.9 |
| Environment | Procedural PMREM softbox room: walls 0.42, floor 0.85, key panel 5.0 upper-left, fill panel 2.0 right, rim strip 2.4 behind; intensity 1.0 |
| Post | None |

## Palette and materials

| Role | Token | Colour | Roughness / metal |
| --- | --- | --- | --- |
| Body (satin) | `mat_body` | `#ECE5D8` | 0.46 |
| Body alt (lids, secondary shells) | `mat_body_alt` | `#DAD3C6` | 0.48 |
| Ink | `mat_body_ink` | `#25282B` | 0.50 |
| Keyline edge | `mat_edge` | `#4A4C50` | 0.55 |
| Recessed foot / shadow gap | `mat_body_shadow` | `#A59E92` | 0.60 |
| Accent insert (enamel) | `mat_accent` | `#FF714A` | 0.62 |
| Cobalt insert (enamel) | `mat_insert` / `mat_tray` | `#2C47A6` | 0.66 / 0.74 |
| Butter (knobs, candle) | `mat_insert_warm` | `#EDB449` | 0.62 |
| Brushed metal | `mat_metal` / `mat_cloche` | `#CFCAC2` / `#D8D4CC` | 0.42 / 0.45, metal 1 |
| Anodised coral | `mat_anodized` | `#E8603C` | 0.34, metal 1 |
| Perforated band | `mat_signature` | host colour + dark holes | 0.52 |
| Printed detail on ink | `mat_print` | `#8E9196` | 0.50 |
| Printed detail on cobalt | `mat_card_mark` | `#F3ECDD` | 0.50 |
| Woven strap | `mat_fabric` | `#2F3135` | 0.85, weave normal, sheen 0.3 |
| Candles (A's colours, deepened) | `mat_candle_1..3` | `#F2603B`, `#2C47A6`, `#E8A93A` | 0.45 |
| Vanilla / cocoa frosting | `mat_frosting_*` | `#F5EAD8` / `#5B3627` | 0.60 / 0.52 |
| Vanilla / cocoa glaze | `mat_glaze_*` | `#FFF8EC` / `#3A2219` | 0.36 / 0.30 |
| Flame | view-dependent unlit shader | core `#FFF4C9` → tip `#FF8A2B`, silhouette alpha falloff | — |

Geometry: bevel ≈ 16% of the part's smallest dimension, 4 segments; fullness 1.04 (fuller than A, crisper than B).

## Object rules

- **Badge (business).** Cream card with ink keyline edges; cobalt colour panel; cream personal-ID print (photo window + portrait glyph + three name lines, merged into one mesh); coral stripe; whole-dot row on the lower border. Satin-metal clip with anodised crimp on a **J-hook**: back leg, horizontal run through the card slot, and a gate hinged at the run's front corner. Open, the gate points forward in line with the run so the vertical card slides straight on; it then swings up clear of the card face. The attach is collision-free by construction and covered by a unit test. Woven ink lanyard that leaves the clip along the clip's up axis.
  - **Presets:** `light` = cream border. `dark` = ink border. Both keep the cobalt panel, cream print and coral stripe, so card identity survives either template.
- **Scanner (business).** Cream housing on a recessed shadow-gap foot. Ink reading face at 46°. Contactless target: two bold printed rings plus a centre dot (≈5:1 on the pad) inside a card-target keyline. A separate indicator window beside the pad (idle `#6E7175`, ≈3:1 on the faceplate) that lights green `#3BE08A` with a check glyph, or red `#E53E3E` with a minus glyph. A perforation collar row on the front.
- **Cake (birthday).** Drip-glaze cake on the cobalt enamel tray with a cream perforated band; piped bead base border; A's coloured candles; soft view-dependent flames at 82% scale. Budget ≈26k triangles before the bin.
- **Covered dish (dinner).** A's brushed satin-metal cloche with an anodised coral knob on a cream glazed plate; the perforated band runs on the plate's rim wall.
- **Record player (party).** Cream body; coral plinth band carrying the perforation row; brushed-metal platter and tonearm; warm-grey (`mat_body_alt`) framed lid on visible hinge barrels.
- **Basketball (sports).** Rim inner diameter ≈1.6× the ball's; open lattice net; pole behind the board on a bracket arm; outlined (never filled) coral target; perforation row along the board's lower frame. Full production proportions are settled in Milestone 5.

## Shadows

Two-layer contact shadows sized from each object's footprint: a soft spread (≈1.1–1.6× footprint, opacity 0.5, shows past the silhouette at the 15° camera) and a tight contact line (≈1.04×, opacity 0.4–0.5). Both fade with height. Layers under 1.2% opacity switch off, so a hanging card leaves no smudge.

## Status and interface

HTML stays authoritative. Accept `#176B42` + check, Decline `#A62D36` + minus. The accent `#FF714A` is never used for UI text, focus rings or button outlines on white (≈2.7:1); the focus ring is `#2F54C9`. System sans only.

## Measured at style lock (study models, M2 Pro, Chrome 153)

| Model | Triangles | Draw calls |
| --- | --- | --- |
| Cake + tray (L) | 25,724 | 16 |
| Keycard + lanyard + scanner (L) | 10,898 | 23 |

The budget is ≤60k triangles and ≤40 draw calls per scene. These are desktop measurements of study models, not phone evidence.

## Carried into the Business scene as named experiments

1. **Card damping:** settle under 0.5° within 0.9 s from an 8° release, at most one visible overshoot at 390 px / DPR 1.5.
2. **Lanyard flex:** the lower strap visibly lags the card; no stretch or clipping; stays inside the framing clearance at 320 px.
3. **Indicator coding:** glyph-coded (≥10 CSS px at 288 px); distinguishable in greyscale and under deuteranopia; no clipping to white.
4. **Scanner and badge recognition:** a blind reviewer names the scanner a card reader and the badge a personal ID at 288 px.
5. **Signature stability:** the highlight count in the perforation band changes ≤5% between consecutive settle frames at DPR 1 and 1.5.
6. **320 px sign-off:** full frames in the ready, accepted, declined and static states with 44×44 targets, visible focus, ≥4.5:1 status text and ≥3:1 object boundaries.
