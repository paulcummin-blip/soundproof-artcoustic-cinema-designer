import { finalistKey, verifiedFinalist } from "../stage1/stage1FinalistEvidence";
import { STAGE1_REFINEMENT_POINTS_PER_OCTAVE } from "../stage1/stage1Constants";
import { recommendationTarget } from "./stage1RecommendationSelection";
import { createStage1EvaluationPool } from "../stage1/stage1EvaluationPool";

export const resultField = { 1: "one_sub_result", 2: "two_sub_result", 4: "four_sub_result" };

export function replaceRecommendation(bucket, option, evidence) {
  const target = recommendationTarget(bucket);
  if (!target || finalistKey(target, option.quantity, option.fingerprint) !== option.evidenceKey) {
    throw new Error("The saved layout has changed. Reopen its recommendations.");
  }
  const repaired = { ...target, ...evidence };
  return { ...bucket, recommendationId: target.id,
    recommendationFinalist: bucket.recommendationFinalist?.id === target.id ? repaired : null,
    finalists: bucket.finalists.map(f => f.id === target.id ? repaired : f) };
}

export async function refineMissingResponse(bucket, option, context, signal, poolFactory = createStage1EvaluationPool) {
  const candidate = recommendationTarget(bucket);
  if (finalistKey(candidate, option.quantity, option.fingerprint) !== option.evidenceKey) {
    throw new Error("The saved layout no longer matches this room.");
  }
  const pool = poolFactory({ size: 1, context, signal });
  try {
    const result = await pool.evaluate(candidate, {
      pointsPerOctave: STAGE1_REFINEMENT_POINTS_PER_OCTAVE, returnResponseEvidence: true,
    });
    if (!verifiedFinalist(result, option.quantity, option.fingerprint, context.seatingPositions) ||
        result.responseEvidence.key !== option.evidenceKey) {
      throw new Error("The worker returned incomplete or mismatched response evidence.");
    }
    return { screening: result.screening, responseEvidence: result.responseEvidence };
  } finally {
    pool.terminateAll();
  }
}
