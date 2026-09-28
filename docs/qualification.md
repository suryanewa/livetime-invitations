# Qualification record

Living record of devices, browsers and evidence. No result is claimed here without a dated measurement or check.

## Reference device matrix (Master §11) — availability as of 2026-09-28

| Proposed device | Browser | Available to this production? | Notes |
| --- | --- | --- | --- |
| iPhone SE (2nd gen) | Safari | **No** | Gap: low-end iOS unverified |
| iPhone 12 | Safari | **No** | Gap |
| iPhone 17 Max (substitute, high-end) | Safari | **Yes — Surya's phone** | Only physical device; not representative of low-end |
| Pixel 6a | Chrome | **No** | Gap |
| Samsung Galaxy A53 | Chrome | **No** | Gap: Android unverified |
| macOS Safari | Safari 26.6 | Yes (authoring host) | Real Safari, not automated WebKit |
| macOS Chrome | Chrome 153 | Yes (authoring host) | |
| macOS Firefox | — | **No — not installed** | Gap: install or record as unavailable |
| Windows Edge | — | **No** | Gap: needs a Windows machine or agreed substitute |
| iOS in-app browser (e.g. Instagram/Messages link preview) | — | Depends on a physical iPhone | Gap |
| Android in-app browser | — | Depends on a physical Android phone | Gap |

**Recorded 2026-09-28 (checkpoint 1):** Surya has one physical phone, an **iPhone 17 Max (Safari)**. None of the four proposed reference devices is available. Consequences:

- The iPhone 17 Max is the only real-device evidence. It is a current high-end device, so passing on it does **not** establish performance on the iPhone SE (2nd gen) / Galaxy A53 class the spec targets.
- The low-end iOS and all Android coverage are recorded as **gaps**. Chrome DevTools CPU/GPU throttling on the authoring Mac can supply a supplementary stress signal, labelled as simulation and never as device evidence.
- Before claiming broad support, agree a substitute with Surya (a borrowed low-end Android, a remote device lab), or explicitly narrow the support statement.

## Milestone 0 exit evidence

| Check | Result | Evidence |
| --- | --- | --- |
| Local stage loads with readable controls at 320 px | See `outputs/skeleton/` captures | `pnpm capture skeleton` |
| Sample mesh and poster use matching framing | Poster rendered from the same camera and fit function | Showcase skeleton page |
| Environment/dependency record exists | Yes | `docs/environment.md` |

Setup evidence only. It is not visual approval.

## Behaviour and performance evidence

Recorded from Milestone 2 onward.
