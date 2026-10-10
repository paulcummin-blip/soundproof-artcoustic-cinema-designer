/**
 * canonicalParameterWeights.js (shared)
 * -------------------------------------
 * THE ONE canonical Artcoustic System Design Rating importance table, plus the
 * parameters that are permanent design ASSUMPTIONS rather than results.
 *
 * The Project Report's ADI Design Highlights selector and the proposal writer's
 * strength selection both rank by this table, so a proposal can never sell a set
 * of strengths the report does not state. There is no second importance table,
 * and no surface may add one.
 *
 * INTERNAL ONLY. A weight is never printed, never sent to a client and never
 * named in client-facing copy.
 *
 * Dependency-free, so both runtimes read the same bytes:
 *   · the browser reads it through src/ (Vite resolves the relative path);
 *   · backend functions read it through base44/shared/canonicalParameterWeights.js,
 *     which re-exports this module.
 *
 * Artcoustic System Design Rating — proprietary Sound Proof logic. It is NOT
 * CEDIA RP22 or RP23.
 */

/** Fixed V1 importance weights per parameter. */
export const PARAM_WEIGHTS = Object.freeze({
  p1: 6, p2: 8, p3: 3, p4: 5, p5: 6, p6: 5, p7: 4,
  p8: 2, p9: 5, p10: 5, p11: 4, p12: 8, p13: 7, p14: 9,
  p15: 3, p16: 5, p17: 5, p18: 12, p19: 9, p20: 9, p21: 3,
  screen: 7,
});

/** Sum of all configured importance weights (derived from PARAM_WEIGHTS). */
export const TOTAL_WEIGHT = Object.values(PARAM_WEIGHTS).reduce((a, b) => a + b, 0);

/**
 * The parameters that are permanent design assumptions, never a measured result:
 * P8 (design/administrative), P15 (background noise) and P21 (early reflections).
 * They are excluded from every strength selection and from every client-facing
 * surface, whatever level they happen to carry.
 */
export const ASSUMED_PARAMETER_KEYS = Object.freeze(['p8', 'p15', 'p21']);

/**
 * The parameters that are assessed for each seat rather than once for the room.
 * This mirrors the canonical publication's own `scope` on each parameter entry,
 * and the frozen report evidence's own per-parameter `parameter_scope`; it is a
 * classification, never a weight.
 */
export const SEAT_SCOPED_PARAMETER_KEYS = Object.freeze([
  'p1', 'p4', 'p5', 'p6', 'p9', 'p10', 'p16', 'p17', 'p20', 'screen',
]);

export default PARAM_WEIGHTS;