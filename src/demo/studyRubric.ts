/**
 * Visual Study rubric record. Scores support a decision; they do not replace Surya's
 * judgment. `selection` stays null until Surya explicitly selects A, B or a stated combination.
 *
 * Source: independent panel run 2026-09-28 (four lens judges, blind recognition tester,
 * panel chair, adversarial reviewer). Median scores; the reviewer's two evidence-backed
 * corrections applied (A distinctiveness 2→3, A motion 3→2). Raw output:
 * outputs/study/panel/panel-result.json.
 */

export const RUBRIC_DIMENSIONS = [
  ['recognition', 'Recognition', 'Cake, record player, basketball, dish and badge read without labels'],
  ['distinctiveness', 'Distinctiveness', 'A repeated construction/detail rule makes the group identifiable without a logo'],
  ['coherence', 'Coherence', 'Food and manufactured objects share a world without identical materials'],
  ['accessibility', 'Accessibility', 'Objects and essential controls remain legible at 320 px and in static mode'],
  ['materials', 'Material quality', 'Bevels, contact, roughness and highlights look intentional; no cheap plastic default'],
  ['audience', 'Breadth of audience', 'Appropriate for casual, birthday, sport, dinner and professional invitations'],
  ['feasibility', 'Production feasibility', 'Geometry, lighting and details fit the master budgets on the baseline renderer'],
  ['motion', 'Motion readiness', 'Parts separate naturally for the required actions; no expensive trick needed'],
] as const;

export type RubricKey = (typeof RUBRIC_DIMENSIONS)[number][0];
export type Score = { score: number; evidence: string };

export interface StudyRecord {
  status: 'pending-evaluation' | 'evaluated' | 'selected';
  scores: Partial<Record<'A' | 'B', Partial<Record<RubricKey, Score>>>>;
  blockers: { A: string[]; B: string[] };
  recommendation: string | null;
  tradeoffs: { A: string[]; B: string[] };
  experiments: string[];
  selection: null | { choice: string; recordedBy: 'Surya'; date: string; notes: string };
}

export const STUDY_RECORD: StudyRecord = {
  status: 'selected',
  scores: {
    A: {
      recognition: { score: 4, evidence: 'All five objects were named correctly in the blind test, four with high confidence. The scanner’s ripple dial and grille could pass for a speaker.' },
      distinctiveness: { score: 3, evidence: 'The stipple reads on the card band and scanner at the 390 px frame but merges into flat bars at contact-sheet and 288 px scale. The repeated ink inset panels carry some of the family feel.' },
      coherence: { score: 3, evidence: 'Shared cream satin unifies the set, but frosting, piping and tray sit in one cream value, so food and support merge.' },
      accessibility: { score: 3, evidence: 'Candles, clip and scanner stay visible at 288 px. The tray and card bodies are about 1.1–1.3:1 against the stage.' },
      materials: { score: 3, evidence: 'The satin gradients and card-corner highlight look intentional. The wide objects have no visible contact shadow and the clip reads as flat grey.' },
      audience: { score: 4, evidence: 'The neutral badge and metal cloche suit corporate and dinner events. The red, blue and yellow candles feel like a kids’ party.' },
      feasibility: { score: 4, evidence: 'Cake 30k triangles / 15 calls, keycard 11k / 19, well inside 60k / 40. The fine stipple and knurl need re-authoring to avoid aliasing.' },
      motion: { score: 2, evidence: 'The card pivots cleanly, but the stipple glint count jumps about 414 → 287 → 382 across consecutive settle frames (shimmer) and the lanyard does not follow the card.' },
    },
    B: {
      recognition: { score: 4, evidence: 'All five named correctly in the blind test. The mustard dome dropped to medium confidence (jelly mould, bell) and the badge read as a transit or key card.' },
      distinctiveness: { score: 4, evidence: 'The single row of inset dots is legible at contact-sheet scale on the plinth, tray, cloche plate, badge and scanner. It is missing from the hoop.' },
      coherence: { score: 4, evidence: 'The frosting stays free of perforations while the cobalt tray carries the band, so food and support separate as the brief asks.' },
      accessibility: { score: 3, evidence: 'The cobalt tray and card panel give about 4–7:1 figure-ground at 288 px. The cream side candles are about 1.06:1 against the frosting and the idle indicator is about 1.7:1.' },
      materials: { score: 3, evidence: 'The perforations render as clean discs. The matte tray has a glossy rim streak, the rows end in clipped half-dots, and the scanner sits on a hard black foot line.' },
      audience: { score: 3, evidence: 'The badge stays professional, but the coral turntable, cobalt tray and mustard dome read together as toy primaries — the direction’s stated risk.' },
      feasibility: { score: 4, evidence: 'Keycard 12k triangles / 18 calls with stable perforations. The cake alone is 40k (67% of the scene budget) before the disposal bin.' },
      motion: { score: 3, evidence: 'The perforation row holds steady through the settle and the parts separate cleanly. The lanyard is as rigid as A’s.' },
    },
  },
  blockers: { A: [], B: [] },
  recommendation:
    'Recommended: one combination built on Direction B’s construction with Direction A’s restraint, producing a single revised token sheet. <strong>From B:</strong> the single-row inset-perforation signature (whole-dot counts, centred, end margins, manufactured supports only, and added to the hoop), one enamel insert per object, the cobalt tray, the drip-silhouette cake and the colour-panel badge with a cream border. <strong>From A:</strong> cream satin main bodies (so the turntable becomes cream with a coral plinth band), brushed satin metal on the cloche, clip and tonearm (the blind test shows the metal is what makes the dish read as a cloche), crisp edges, and personal-ID cues on the badge as a cream print and photo window at 3:1 or better. <strong>Family rules:</strong> the palette is cream + accent #FF714A + deepened cobalt + ink; drop mustard bodies and clearcoat; every object carries at least one silhouette element at 3:1 against the stage. Why: B is the only direction whose signature survives phone scale and motion, and A’s stipple would need a new identity to fix. B as rendered drifts toward toy primaries, which A’s restraint corrects without touching B’s construction rule.',
  tradeoffs: {
    A: [
      'Most adult and restrained. The metal cloche and avatar badge were recognised most confidently.',
      'Its signature fails in the target renderer: it disappears at small scale and shimmers in motion. Fixing that means redesigning the identity.',
      'Cream on cream: tray, cake and card sit at about 1.1–1.3:1 against the stage.',
      'The primary-colour candles and a speaker-like scanner undercut its restraint.',
    ],
    B: [
      'The only family rule that stays visible at phone scale and stable in motion.',
      'Best figure-ground where it uses colour blocks (cobalt tray about 4–7:1). Food stays free of perforations.',
      'Whole coloured bodies drift toward toy primaries. The mustard dome weakened the cloche read.',
      'Execution flaws to fix: half-clipped end dots, a hard black foot line, a glossy streak on a matte tray, and a 40k-triangle cake.',
    ],
  },
  experiments: [
    'Card damping: from an 8° release, the card settles under 0.5° within 0.9 s with at most one visible overshoot at the 390 px stage (DPR 1.5). Reduced motion shows the settled pose.',
    'Lanyard flex: the strap follows the card with visible lag on its lower 20% during settle and travel. No stretch, no clipping through the card, and it stays inside the framing clearance at 320 px.',
    'Scanner indicator: accept and decline differ by glyph (check or minus, ≥10 CSS px at 288 px), not hue alone. Distinguishable in greyscale and under deuteranopia; idle ≥3:1 against the pad; no clipping to white.',
    'Scanner and badge recognition: shown alone and unlabelled at 288 px, a blind reviewer names the scanner a card reader or check-in terminal (not a speaker) and the badge a personal ID.',
    'Signature stability: across the 120-frame settle at DPR 1 and 1.5, the highlight count inside the signature band changes by at most 5% between consecutive frames (or matches a 4× supersampled reference).',
    'Grounding and 320 px sign-off: wide objects get a soft contact shadow visible past their footprint. Full 320 px frames in the ready, accepted, declined and static states keep 44×44 targets, visible focus, ≥4.5:1 status text and ≥3:1 object boundaries.',
  ],
  selection: {
    choice: 'B + A restraint, keeping A’s coloured candles and A’s covered dish',
    recordedBy: 'Surya',
    date: '2026-09-28',
    notes:
      'Surya selected the recommended combination (B construction and perforation signature, A’s cream satin bodies, brushed metal and crisp edges) and additionally kept Direction A’s coloured candles (coral, cobalt, butter) and A’s covered dish (brushed satin-metal cloche with anodised coral knob on a cream plate). One revised token sheet: direction “L”.',
  },
};
