/**
 * seatScopeConclusionAuthority.js
 * ------------------------------
 * The seat-scope conclusion stated beneath the Technical Report's RP22
 * Performance Summary.
 *
 * It replaces a categorical all-seat claim — "no listening position shows
 * material compromise" — which asserted an absence of limitation the seat-scope
 * results themselves can contradict: a design with a strong reference-position
 * response and a Level 1 seat-to-seat bass result has a real, stated limitation
 * and must say so.
 *
 * The line states what the published results actually support, read from the one
 * canonical parameter authority:
 *
 *   · P19 — response quality AT the reference seating position only;
 *   · P20 — bass consistency from seat to seat.
 *
 * Nothing is hard-coded per project and no level is invented: a result that is
 * not published states no clause, and the line never claims more seats, or more
 * evenness, than the published results bear.
 *
 * Pure: no React, no fetching, no side effects.
 */

import { readReportParameter } from '@/components/report/reportParameterEvidence';

/** A published level that reads as a strength. L1 and L2 are real limitations. */
const STRONG = /\bL[34]\b/i;

/** The published level for one parameter, or null when it states nothing. */
function publishedLevel(engineeringSummary, id) {
  const row = engineeringSummary ? readReportParameter(engineeringSummary, id) : null;
  const level = String(row?.level ?? '').trim();
  return /^L[1-4]$/i.test(level) ? level.toUpperCase() : null;
}

/**
 * The seat-scope conclusion for this design, or null when neither parameter is
 * published (the caller then states nothing rather than a generic reassurance).
 *
 * @param {object|null} engineeringSummary - the published engineering summary
 * @returns {{ statement: string, p19Level: string|null, p20Level: string|null }|null}
 */
export function buildSeatScopeConclusion(engineeringSummary) {
  if (!engineeringSummary) return null;
  const p19 = publishedLevel(engineeringSummary, 19);
  const p20 = publishedLevel(engineeringSummary, 20);
  if (!p19 && !p20) return null;

  // P19 is the response at the reference position: the only position it is
  // assessed at, and the only one this clause claims.
  const responseClause = p19
    ? (STRONG.test(p19)
      ? 'Response quality at the reference seating position is strong'
      : 'Response quality at the reference seating position is qualified by the deviation the result states')
    : null;

  // P20 is the seat-to-seat bass result, and it is stated whether or not it is a
  // strength: a limitation is part of the design's honest account of itself.
  const consistencyClause = p20
    ? (STRONG.test(p20)
      ? 'seat-to-seat bass consistency is maintained across the assessed seating positions'
      : 'seat-to-seat bass consistency remains the principal performance limitation across the seating area')
    : 'seat-to-seat bass consistency is stated per seat on the seat-scope results';

  const statement = responseClause
    ? `${responseClause}, while ${consistencyClause}.`
    : `Bass consistency is stated across the seating area: ${consistencyClause}.`;

  return {
    statement,
    p19Level: p19,
    p20Level: p20,
  };
}

export default buildSeatScopeConclusion;