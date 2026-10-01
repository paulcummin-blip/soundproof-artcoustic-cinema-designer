// adiVisualReportCopy.js
// ---------------------------------------------------------------------------
// ARTCOUSTIC DESIGN INTELLIGENCE (ADI)
// The Visual Report's ADI Design Summary — copy builder.
//
// PRODUCT RULE
//   Visual Report    → WHY this design works for this room (this module)
//   Technical Report → HOW the engineering measures
//   Bass Optimiser   → how to improve the design
//
// The Visual Report is produced after the design is complete, so the ADI
// summary explains the design directly — it never announces that it is about
// to explain why the design is good, and carries no framing line.
//
//   Body     — how the layout suits this room and its seating, one sentence per
//              genuinely strong parameter (L3 or better), strongest first, then
//              the balance-with-constraints statement
//   Optimiser— one line, and only when a Bass Optimiser result exists
//   Closing  — the engineering detail lives in the Technical Report
//
// WHAT THIS MODULE DELIBERATELY DOES NOT DO
// It never prints a limiting factor, a parameter level, a worst-affected seat,
// a "next step", any repositioning guidance, a projected level, or a
// speculative change that has not been applied. Those belong to the Technical
// Report, the RP22 parameter table, the Bass Optimiser panel and Engineer
// details.
//
// This module produces TEXT ONLY. It calculates nothing: the room facts come
// from the geometry and seating already published for this version, and every
// strength sentence is selected by an already-published parameter result.
//
// PURE: no React, no side effects, no stores.
// ---------------------------------------------------------------------------

import {
  OPTIMISER_LEVER_STATE,
  OPTIMISER_RECORD_KIND,
  OPTIMISER_TERMINAL_OUTCOME,
} from "@/components/room/bass/optimiserPlan/optimiserPlanConstants";

/** Stated in place of strengths when no parameter reaches the strength band. */
export const ADI_VISUAL_NO_STRENGTHS_FALLBACK =
  'The completed design has been assessed in full, and its RP22 performance results are reported on the following pages.';

/** The balance statement that closes the strength paragraph. */
export const ADI_VISUAL_BALANCE =
  'Within the room’s architectural constraints, the design gives a high-performance result that is practical to install and credible to calibrate.';

/**
 * The one optimiser line the Visual Report ever prints. A run means the
 * subwoofer layout was reviewed as part of the design process — never that
 * something is still waiting to be applied.
 */
export const ADI_VISUAL_OPTIMISER_REVIEWED =
  'Bass Optimiser has reviewed the subwoofer layout as part of the design process.';

/** Closes the block and points to the engineering detail. */
export const ADI_VISUAL_CLOSING =
  'Detailed engineering results remain available in the Technical Report.';

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

const hasLength = (value) => Number.isFinite(Number(value)) && Number(value) > 0;
const metres = (value) => Number(value).toFixed(1);

/**
 * How the layout suits this room — built only from the room geometry and
 * seating already published for this version. No dimension is invented: an
 * unknown room simply loses the dimension clause.
 *
 * @param {Object} [context]
 * @param {Object} [context.roomDims] — { widthM, lengthM, heightM }
 * @param {number} [context.seatCount]
 * @returns {string}
 */
export function buildRoomSentence({ roomDims, seatCount } = {}) {
  const dims = roomDims || {};
  const hasDims = hasLength(dims.widthM) && hasLength(dims.lengthM) && hasLength(dims.heightM);
  const seats = Number(seatCount) > 0 ? Number(seatCount) : 0;
  const seatClause = seats > 0
    ? ` and the ${seats} seating position${seats === 1 ? '' : 's'} it has to serve`
    : '';

  if (hasDims) {
    return `The speaker layout works with this room’s ${metres(dims.widthM)} m × ${metres(dims.lengthM)} m × ${metres(dims.heightM)} m proportions${seatClause}, rather than fighting them.`;
  }
  return `The speaker layout works with the space available${seatClause}, rather than fighting it.`;
}

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
 * @param {Object} [params.context]          — { roomDims, seatCount }
 * @param {Object|null} [params.optimiserRecord] — persisted optimiser record
 * @param {number} [params.paragraphLimit]
 * @returns {Object|null} summary, or null when no strengths were supplied
 */
export function buildAdiVisualReportSummary({
  strengths = [],
  context = {},
  optimiserRecord = null,
  paragraphLimit = ADI_VISUAL_PARAGRAPH_LIMIT,
} = {}) {
  if (!Array.isArray(strengths)) return null;

  const sentences = buildStrengthSentences(strengths, paragraphLimit);

  return {
    heading: "ADI Design Summary",
    body: [
      buildRoomSentence(context),
      ...(sentences.length > 0 ? sentences : [ADI_VISUAL_NO_STRENGTHS_FALLBACK]),
      ADI_VISUAL_BALANCE,
    ],
    optimiserStatus: resolveOptimiserStatusLine(optimiserRecord),
    closing: ADI_VISUAL_CLOSING,
  };
}

export default buildAdiVisualReportSummary;