// recommendationNarration.js
// ---------------------------------------------------------------------------
// Recommendation Narration — Stage 1: Engineering Narration
//
// Transforms the Recommendation Engine's structured output into a natural,
// designer-facing engineering explanation. This is a PRESENTATION-ONLY
// layer: it reads the engine output and formats it into the 7-part
// narration sequence. It never recalculates, never interprets engineering,
// and never invents explanations.
//
// The narration follows a fixed sequence:
//   1. Assessment        — overall engineering assessment (no RP22, no levels)
//   2. Problem            — the engineering problem (no parameters)
//   3. Likely Physical Cause — with "Likely cause" prefix when inferred
//   4. Recommended Action — one clear engineering recommendation
//   5. Expected Engineering Effect — the physical result
//   6. RP22 Evidence      — P14/P18/P19/P20 as supporting evidence only
//   7. Remaining Limitation — always ends with "The remaining limitation is..."
//
// Plus:
//   - Confidence (Very High / High / Moderate / Low; explain only Moderate/Low)
//   - Alternatives (only when a genuinely different strategy was rejected)
//   - No Recommendation first-class outcome
//
// Tone: an experienced cinema designer explaining the design.
// Not a calculator. Not an AI assistant. Short. Direct. Engineering-first.
// ---------------------------------------------------------------------------

import {
  ASSESSMENT_RATING,
  CONFIDENCE_LEVEL,
  RECOMMENDATION_TYPE,
  PROBLEM_TYPE,
  INTERVENTION_TYPE,
} from './recommendationTypes.js';

// ── 1. Assessment ─────────────────────────────────────────────────────────
// Maps the engine's rating to a single clean word. No RP22, no levels.

const ASSESSMENT_LABEL = {
  [ASSESSMENT_RATING.EXCELLENT]: 'Excellent',
  [ASSESSMENT_RATING.GOOD]: 'Good',
  [ASSESSMENT_RATING.ACCEPTABLE]: 'Acceptable',
  [ASSESSMENT_RATING.LIMITED]: 'Limited',
  [ASSESSMENT_RATING.POOR]: 'Limited',
};

function buildAssessment(engineOutput) {
  const rating = engineOutput?.assessment?.rating;
  if (!rating) return null;
  return { label: ASSESSMENT_LABEL[rating] || 'Limited' };
}

// ── 2. Problem ─────────────────────────────────────────────────────────────
// Clean engineering problem statement. No parameter references.

const PROBLEM_STATEMENT = {
  [PROBLEM_TYPE.SEAT_CONSISTENCY]: 'Seat consistency is limiting performance.',
  [PROBLEM_TYPE.RESPONSE_SMOOTHNESS]: 'Response smoothness is limiting performance.',
  [PROBLEM_TYPE.EXTENSION]: 'Bass extension is limiting performance.',
  [PROBLEM_TYPE.CAPABILITY]: 'Subwoofer capability is limiting performance.',
  [PROBLEM_TYPE.ROOM_MODE]: 'A room mode is limiting performance.',
  [PROBLEM_TYPE.LOCAL_CANCELLATION]: 'A bass cancellation is limiting performance.',
};

function buildProblem(engineOutput) {
  const type = engineOutput?.problem?.type;
  if (!type || type === PROBLEM_TYPE.NONE) return null;
  return { statement: PROBLEM_STATEMENT[type] || 'A bass issue is limiting performance.' };
}

// ── 3. Likely Physical Cause ──────────────────────────────────────────────
// Prefix "Likely cause: " when the cause is inferred, not measured.

function buildPhysicalCause(engineOutput) {
  const cause = engineOutput?.physicalCause;
  if (!cause?.description) return null;
  if (cause.description === 'No physical cause to identify.' || cause.description === 'No physical cause to address.' || cause.description === 'No data.') {
    return null;
  }
  const prefix = cause.inferred ? 'Likely cause: ' : '';
  return { statement: `${prefix}${cause.description}` };
}

// ── 4. Recommended Action ──────────────────────────────────────────────────
// One clear engineering recommendation. No RP22, no scores.

const RECOMMENDATION_TYPE_LABEL = {
  [INTERVENTION_TYPE.CALIBRATION]: 'Calibration',
  [INTERVENTION_TYPE.POSITION]: 'Design',
  [INTERVENTION_TYPE.SEATING]: 'Design',
  [INTERVENTION_TYPE.COMBINED]: 'Design',
  [INTERVENTION_TYPE.SPECIFICATION]: 'Specification',
};

function buildRecommendedAction(engineOutput) {
  const action = engineOutput?.recommendedAction;
  if (!action?.description) return null;
  if (action.description === 'No engineering action recommended.' || action.description === 'No data.') return null;
  return {
    statement: action.description,
    typeLabel: RECOMMENDATION_TYPE_LABEL[action.interventionType] || 'Engineering',
  };
}

// ── 5. Expected Engineering Effect ─────────────────────────────────────────
// The physical result, not parameter changes.

function buildExpectedEffect(engineOutput) {
  const effect = engineOutput?.expectedPhysicalEffect;
  if (!effect?.description) return null;
  if (effect.description === 'No significant physical effect expected.' || effect.description === 'No changes expected.' || effect.description === 'No data.') {
    return null;
  }
  return { statement: effect.description };
}

// ── 6. RP22 Evidence ──────────────────────────────────────────────────────
// Supporting evidence only. Never the headline.

function buildRp22Evidence(engineOutput) {
  const evidence = engineOutput?.rp22Evidence;
  if (!evidence) return null;

  const items = [];
  if (evidence.p14?.changed) {
    items.push({ parameter: 'P14', from: evidence.p14.from, to: evidence.p14.to });
  }
  if (evidence.p18?.changed) {
    items.push({ parameter: 'P18', from: evidence.p18.from, to: evidence.p18.to });
  }
  if (evidence.p19?.changed) {
    items.push({ parameter: 'P19', from: evidence.p19.from, to: evidence.p19.to });
  }
  if (evidence.p20?.changed) {
    items.push({ parameter: 'P20', from: evidence.p20.from, to: evidence.p20.to });
  }

  return items.length > 0 ? { items } : null;
}

// ── 7. Remaining Limitation ────────────────────────────────────────────────
// Always ends with "The remaining limitation is..."

const REMAINING_LIMITATION_NOUN = {
  capability: 'subwoofer capability',
  extension: 'low-frequency extension',
  seat_consistency: 'seat-to-seat variation',
  response_smoothness: 'response smoothness at the worst seat',
};

function buildRemainingLimitation(engineOutput) {
  const limitation = engineOutput?.remainingLimitation;
  if (!limitation?.description || limitation.description === 'No data.') return null;

  // If the engine identified a type, use the clean noun phrase.
  if (limitation.type && REMAINING_LIMITATION_NOUN[limitation.type]) {
    return { statement: `The remaining limitation is ${REMAINING_LIMITATION_NOUN[limitation.type]}.` };
  }

  // "No significant limitation remains" → state it directly.
  if (/no significant limitation/i.test(limitation.description)) {
    return { statement: 'No significant limitation remains.' };
  }

  // "The design is limited but no further improvement is available."
  if (/no further improvement is available/i.test(limitation.description)) {
    return { statement: 'The remaining limitation is the current design — no further improvement is available.' };
  }

  // Otherwise, frame the engine's description.
  const desc = limitation.description.replace(/\.$/, '');
  return { statement: `The remaining limitation is ${desc}.` };
}

// ── Confidence ────────────────────────────────────────────────────────────
// Display level. Explain only for Moderate or Low.

const CONFIDENCE_LABEL = {
  [CONFIDENCE_LEVEL.VERY_HIGH]: 'Very High',
  [CONFIDENCE_LEVEL.HIGH]: 'High',
  [CONFIDENCE_LEVEL.MODERATE]: 'Moderate',
  [CONFIDENCE_LEVEL.LOW]: 'Low',
};

function buildConfidence(engineOutput) {
  const conf = engineOutput?.recommendationConfidence;
  if (!conf) return null;
  const label = CONFIDENCE_LABEL[conf.level] || 'Moderate';
  const shouldExplain = conf.level === CONFIDENCE_LEVEL.MODERATE || conf.level === CONFIDENCE_LEVEL.LOW;
  return {
    label,
    explanation: shouldExplain && conf.reason ? conf.reason : null,
  };
}

// ── Alternatives ───────────────────────────────────────────────────────────
// Only display when a genuinely different engineering strategy was rejected
// for a protected objective reason.

function buildAlternatives(engineOutput) {
  const protectedObj = engineOutput?.protectedObjective;
  if (!protectedObj?.betterSolutionAvailable) return null;
  return { statement: protectedObj.betterSolutionAvailable };
}

// ── No Recommendation ─────────────────────────────────────────────────────
// First-class outcome: the design is already well optimised.

function buildNoRecommendation(engineOutput) {
  const noRec = engineOutput?.noRecommendation;
  if (!noRec?.summary) return null;
  // Detect the no-data case — render nothing (the lifecycle copy handles it).
  if (/No engineering results available/i.test(noRec.summary)) return null;
  return { summary: noRec.summary };
}

// ── Main builder ──────────────────────────────────────────────────────────

/**
 * Build the structured narration from the Recommendation Engine output.
 *
 * @param {object|null} engineOutput - the output of generateRecommendation()
 * @returns {object|null} structured narration, or null when no narration
 */
export function buildNarration(engineOutput) {
  if (!engineOutput) return null;

  const isNoRecommendation = engineOutput.recommendationType === RECOMMENDATION_TYPE.NO_RECOMMENDATION;

  if (isNoRecommendation) {
    const noRec = buildNoRecommendation(engineOutput);
    if (!noRec) return null; // no-data case — render nothing
    return {
      type: 'no_recommendation',
      assessment: buildAssessment(engineOutput),
      noRecommendation: noRec,
      remainingLimitation: buildRemainingLimitation(engineOutput),
    };
  }

  return {
    type: engineOutput.recommendationType || RECOMMENDATION_TYPE.RECOMMENDATION,
    assessment: buildAssessment(engineOutput),
    problem: buildProblem(engineOutput),
    physicalCause: buildPhysicalCause(engineOutput),
    recommendedAction: buildRecommendedAction(engineOutput),
    expectedEffect: buildExpectedEffect(engineOutput),
    rp22Evidence: buildRp22Evidence(engineOutput),
    remainingLimitation: buildRemainingLimitation(engineOutput),
    confidence: buildConfidence(engineOutput),
    alternatives: buildAlternatives(engineOutput),
  };
}