// resolveRetestPresentation.js
// ---------------------------------------------------------------------------
// THE RE-TEST STATE'S PRESENTATION FACTS — pure, presentation only.
//
// In the re-test state the panel has to do two things and nothing else:
//
//   1. draw ONE control — the panel's own run control, worded as the re-test
//   2. keep the previous run's candidate OUT of the main panel, so no designer
//      weighs an unconfirmed candidate before deciding to re-test
//
// This module resolves both facts from values the authorities already produced.
// It decides no eligibility, changes no result, applies nothing and touches no
// saved setting: it reads an outcome, a journey state key, an already-resolved
// headline and the designer summary, and returns what the panel may state where.
// ---------------------------------------------------------------------------

import { OPTIMISER_OUTCOME } from "./resolveOptimiserPresentationState.js";
import { ADI_OPTIMISER_JOURNEY_STATE } from "./resolveAdiOptimiserJourney.js";

/**
 * The headline kinds that carry a PREVIOUS candidate rather than a live
 * decision. An "applied" or "running" headline states what is in the design or
 * what is happening now, so it is never treated as an old candidate.
 */
const PREVIOUS_CANDIDATE_KINDS = Object.freeze(["consider", "rejected", "state"]);

/**
 * Is the panel in the re-test state? Two ways in: the presentation authority's
 * own re-test outcome (badge "Re-test Needed"), or — with no presentation
 * authority supplied, or one its baseline-parity gate sets aside — the journey's
 * own evaluation states, which carry that same badge.
 *
 * @param {object} params
 * @param {string|null} [params.outcome] - the resolved OPTIMISER_OUTCOME
 * @param {string|null} [params.journeyStateKey] - the resolved journey state
 * @returns {boolean}
 */
export function resolveRetestNeeded({ outcome = null, journeyStateKey = null } = {}) {
  if (outcome) return outcome === OPTIMISER_OUTCOME.RETEST_NEEDED;
  return journeyStateKey === ADI_OPTIMISER_JOURNEY_STATE.EVALUATION_INCOMPLETE
    || journeyStateKey === ADI_OPTIMISER_JOURNEY_STATE.REEVALUATION_REQUIRED;
}

/**
 * The previous candidate's own detail, resolved for Engineer details — or null
 * when there is nothing to move there: the panel is not in the re-test state, or
 * the headline states something other than a candidate.
 *
 * @param {object} params
 * @param {boolean} [params.retestNeeded]
 * @param {object|null} [params.headline] - the resolved panel headline
 * @param {object|null} [params.summary] - the resolved designer summary
 * @returns {null|{adjustment:string|null, benefit:string|null, comparison:string|null,
 *   staleCopy:object|null, previousBest:string|null}}
 */
export function resolvePreviousCandidate({ retestNeeded = false, headline = null, summary = null } = {}) {
  if (!retestNeeded) return null;
  if (!PREVIOUS_CANDIDATE_KINDS.includes(headline?.kind)) return null;

  const candidate = {
    adjustment: headline.adjustment ?? null,
    benefit: headline.benefit ?? null,
    comparison: headline.comparison ?? null,
    staleCopy: summary?.staleCopy ?? null,
    previousBest: summary?.previousBest ?? null,
  };
  const hasDetail = Boolean(candidate.adjustment
    || candidate.benefit
    || candidate.comparison
    || candidate.staleCopy
    || candidate.previousBest);
  return hasDetail ? candidate : null;
}