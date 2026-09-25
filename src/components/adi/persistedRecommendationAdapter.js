// persistedRecommendationAdapter.js
// ---------------------------------------------------------------------------
// Maps the persisted Recommendation Engine output (stored inside
// completedBassAuthority.contract.recommendation) into the ADI 5-field
// decision structure that AdiRecommendation.jsx renders.
//
// On cold load / page refresh, the V2 optimiser's in-memory state (v2State)
// is empty. Without this adapter, ADI falls to "No further engineering
// changes are recommended." even when a valid recommendation was published.
//
// This adapter is a PURE mapping function — it never recalculates engineering
// and never changes the recommendation logic. It only reformats the persisted
// Recommendation Engine output into the shape ADI's render path expects.
// ---------------------------------------------------------------------------

import { ADI_OUTCOME } from './adiConstants';
import { RECOMMENDATION_INTENT } from '@/components/room/bass/recommendationAuthority/recommendationAuthority';
import {
  RECOMMENDATION_TYPE,
  LEVER_CLASS,
} from '@/components/recommendationEngine/recommendationTypes';

/**
 * Map a Recommendation Engine recommendationType to an ADI outcome.
 */
function recommendationTypeToOutcome(type) {
  if (type === RECOMMENDATION_TYPE.RECOMMENDATION) return ADI_OUTCOME.RECOMMENDATION;
  if (type === RECOMMENDATION_TYPE.TRADE_OFF_AVAILABLE) return ADI_OUTCOME.TRADE_OFF;
  return ADI_OUTCOME.NO_FURTHER_ENGINEERING;
}

/**
 * Map a lever class string to an ADI intent.
 */
function leverClassToIntent(leverClass) {
  if (leverClass === LEVER_CLASS.CALIBRATION) return RECOMMENDATION_INTENT.CALIBRATION;
  if (leverClass === LEVER_CLASS.PHYSICAL) return RECOMMENDATION_INTENT.DESIGN;
  if (leverClass === LEVER_CLASS.SPECIFICATION) return RECOMMENDATION_INTENT.SPECIFICATION;
  return RECOMMENDATION_INTENT.CALIBRATION;
}

/**
 * Build an ADI decision object from a persisted Recommendation Engine output.
 *
 * @param {object} recommendation - the persisted Recommendation Engine output
 *   (from completedBassAuthority.contract.recommendation)
 * @returns {object|null} ADI decision { outcome, intent, recommendation, leverAssessment }
 *   or null if the persisted recommendation is absent / indicates no recommendation.
 */
export function buildAdiDecisionFromPersistedRecommendation(recommendation) {
  if (!recommendation || typeof recommendation !== 'object') return null;

  const type = recommendation.recommendationType;
  const outcome = recommendationTypeToOutcome(type);

  // If the persisted recommendation is explicitly "no recommendation", do not
  // override it with a synthetic recommendation — let the caller fall through
  // to the no-improvement render path.
  if (outcome === ADI_OUTCOME.NO_FURTHER_ENGINEERING) {
    return null;
  }

  const appropriateLever = recommendation.appropriateLever || null;
  const leverClass = appropriateLever?.class || null;
  const intent = leverClassToIntent(leverClass);

  // Map the Recommendation Engine output to the ADI 5-field structure.
  const adiRecommendation = {
    assessment: recommendation.assessment?.summary || null,
    action: typeof recommendation.recommendedAction === 'string'
      ? recommendation.recommendedAction
      : recommendation.recommendedAction?.description || null,
    why: recommendation.physicalCause?.description || null,
    rp22Evidence: Array.isArray(recommendation.rp22Evidence) ? recommendation.rp22Evidence : null,
    remainingLimitation: recommendation.remainingLimitation?.description || null,
  };

  return {
    outcome,
    intent,
    recommendation: adiRecommendation,
    leverAssessment: {
      appropriateLever,
    },
  };
}