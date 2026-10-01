// adiVisualReportCopy.js
// ---------------------------------------------------------------------------
// ARTCOUSTIC DESIGN INTELLIGENCE (ADI)
// The Visual Report's ADI Design Summary — copy builder.
//
// PRODUCT RULE
//   Visual Report   → presents the COMPLETED design (this module)
//   Bass Optimiser  → improves the design
//   Technical Report→ explains the engineering and the limitations
//
// The Visual Report is produced after the design is finalised, so this module
// never reopens the design process: it states the strongest engineering
// qualities the published results genuinely support, and nothing else.
//
//   Intro    — ADI has reviewed the completed design
//   Body     — one sentence per genuinely strong parameter (L3 or better),
//              strongest first, or a neutral assessed-design line if none
//   Optimiser— one line, and only when a Bass Optimiser result exists
//   Closing  — the design is presented as assessed; engineering detail is in
//              the Technical Report
//
// WHAT THIS MODULE DELIBERATELY DOES NOT DO
// It never prints a limiting factor, a parameter level, a worst-affected seat,
// a "next step", any repositioning guidance, a projected level, or any advice
// implying the design is unfinished. Those belong to the Technical Report, the
// RP22 parameter table, the Bass Optimiser panel and Engineer details.
//
// This module produces TEXT ONLY. It calculates nothing: each sentence is
// selected by an already-published strength, and no value is ever invented.
//
// PURE: no React, no side effects, no stores.
// ---------------------------------------------------------------------------

import {
  OPTIMISER_LEVER_STATE,
  OPTIMISER_RECORD_KIND,
  OPTIMISER_TERMINAL_OUTCOME,
} from "@/components/room/bass/optimiserPlan/optimiserPlanConstants";

/** The ADI review line that opens the Visual Report summary. */
export const ADI_VISUAL_INTRO =
  'ADI has reviewed the completed cinema design and identified the strongest engineering qualities of the system.';

/** Stated in place of strengths when no parameter reaches the strength band. */
export const ADI_VISUAL_NO_STRENGTHS_FALLBACK =
  'The completed design has been assessed in full, and its RP22 performance results are reported on the following pages.';

/**
 * The one optimiser line the Visual Report ever prints. A run means the
 * subwoofer layout was reviewed as part of the design process — never that
 * something is still waiting to be applied.
 */
export const ADI_VISUAL_OPTIMISER_REVIEWED =
  'Bass Optimiser has reviewed the subwoofer layout as part of the design process.';

/** Closes the block and points to the engineering detail. */
export const ADI_VISUAL_CLOSING =
  'This report presents the selected design as assessed. Detailed engineering evidence remains available in the Technical Report.';

/**
 * One sentence per RP22 parameter, written only for parameters the published
 * results show as genuinely strong (L3 or better). Each sentence is a positive
 * statement of what the design achieves — never a comparative or a promise.
 */
export const ADI_VISUAL_STRENGTH_SENTENCES = Object.freeze({
  1: 'The listening positions are set well clear of the room boundaries, supporting precise and stable spatial resolution.',
  4: 'The screen wall speakers are closely matched in level, supporting clear dialogue and stable imaging behind the screen.',
  5: 'The surround speakers are spaced to support smooth, convincing movement around the seating area.',
  6: 'The surround speakers are closely matched in level, supporting consistent effects all around the room.',
  7: 'The wide speakers are accurately placed, widening and stabilising the front soundstage.',
  9: 'The height speakers are spaced to support smooth, convincing movement above the seating area.',
  10: 'The overhead speakers are closely matched in level, supporting consistent effects above the listener.',
  12: 'The screen channels deliver strong dynamic capability at the reference listening position.',
  13: 'The surround and overhead channels deliver strong dynamic capability at the reference listening position.',
  14: 'The system delivers strong low-frequency output capability at the reference listening position.',
  16: 'Sound stays consistent from seat to seat across the screen channels.',
  17: 'Sound stays consistent from seat to seat across the surround and height channels.',
  18: 'The system delivers deep in-room low-frequency extension.',
  19: 'The bass response at the reference seat is smooth and well controlled.',
  20: 'Low-frequency performance stays consistent across the seating area.',
});

/** The default number of strength sentences the paragraph carries. */
export const ADI_VISUAL_PARAGRAPH_LIMIT = 3;

/**
 * One sentence per genuinely strong parameter, strongest first.
 *
 * @param {Array<{number: number}>} strengths — selected strengths, already
 *   gated on the published results by selectClientAdiStrengths
 * @param {number} [limit]
 * @returns {string[]}
 */
export function buildStrengthSentences(strengths, limit = ADI_VISUAL_PARAGRAPH_LIMIT) {
  if (!Array.isArray(strengths)) return [];
  return strengths
    .map((strength) => ADI_VISUAL_STRENGTH_SENTENCES[Number(strength?.number)] || null)
    .filter(Boolean)
    .slice(0, Math.max(1, limit));
}

/**
 * The optimiser line, or null when there is nothing to state.
 *
 * A completed review is stated as a review and nothing more — whether an option
 * was applied, confirmed or found unnecessary. A run that failed, never
 * completed, or never happened makes no claim at all: the Visual Report never
 * tells the reader to go and optimise the design.
 */
export function resolveOptimiserStatusLine(record) {
  if (!record || typeof record !== "object") return null;

  if (
    record.terminalOutcome === OPTIMISER_TERMINAL_OUTCOME.FAILED
    || record.terminalOutcome === OPTIMISER_TERMINAL_OUTCOME.EVALUATION_INCOMPLETE
  ) {
    return null;
  }

  const appliedStates = Object.values(record.applied || {});
  if (appliedStates.includes(OPTIMISER_LEVER_STATE.APPLIED)) {
    return ADI_VISUAL_OPTIMISER_REVIEWED;
  }

  if (record.recordKind === OPTIMISER_RECORD_KIND.PLAN) {
    return ADI_VISUAL_OPTIMISER_REVIEWED;
  }

  if (record.terminalOutcome === OPTIMISER_TERMINAL_OUTCOME.NO_USEFUL_IMPROVEMENT) {
    return ADI_VISUAL_OPTIMISER_REVIEWED;
  }

  return null;
}

/**
 * Build the Visual Report ADI Design Summary.
 *
 * @param {Object} params
 * @param {Array}  [params.strengths]        — selected strengths (see above)
 * @param {Object|null} [params.optimiserRecord] — persisted optimiser record
 * @param {number} [params.paragraphLimit]
 * @returns {Object|null} summary, or null when no strengths were supplied
 */
export function buildAdiVisualReportSummary({
  strengths = [],
  optimiserRecord = null,
  paragraphLimit = ADI_VISUAL_PARAGRAPH_LIMIT,
} = {}) {
  if (!Array.isArray(strengths)) return null;

  const sentences = buildStrengthSentences(strengths, paragraphLimit);

  return {
    heading: "ADI Design Summary",
    intro: ADI_VISUAL_INTRO,
    body: sentences.length > 0 ? sentences : [ADI_VISUAL_NO_STRENGTHS_FALLBACK],
    optimiserStatus: resolveOptimiserStatusLine(optimiserRecord),
    closing: ADI_VISUAL_CLOSING,
  };
}

export default buildAdiVisualReportSummary;