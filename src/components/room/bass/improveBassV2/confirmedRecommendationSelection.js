import { validateConfirmedCandidate, effectiveConfigurationKey } from "./confirmedCandidateValidity.js";
import { isMaterialImprovement } from "./materialityGate.js";
import { rankRecommendations } from "./recommendationRanker.js";
import { extractAuthoritativeMetrics, detectMutedSubs } from "../best-layout/authoritativeFinalistSelection.js";
import { classifyVerifiedTradeOff } from "./tradeOffClassifier.js";
import { countFailingSeats, hasHardSafetyRegression } from "./zeroFailOptimiser.js";

/** The conclusion when the current design itself could not be validated. */
export const CURRENT_BASELINE_UNVALIDATED =
  "Evaluation incomplete — the current baseline could not be validated.";

export function selectConfirmedRecommendations(results, snapshot, current) {
  // The applicable seat set comes from the per-seat metric (P20). P19 is an
  // aggregate RSP result and can never define the seat set.
  const context = snapshot.validationContext || {
    seats: current?.perSeatP20?.map(s=>({id:s.seatId,isPrimary:s.isPrimary})),
  };
  const baselineCheck = validateConfirmedCandidate(current, context);
  const evaluations = [];
  const eligible = [];
  const tradeOffs = [];
  const baseline = baselineCheck.result;
  const candidates = (results || []).filter(r => r && r.candidateKind !== "current" && r.candidateId !== "current");
  const baselineValidation = {
    candidateId: "current",
    valid: baselineCheck.valid,
    issues: baselineCheck.issues,
    message: baselineCheck.valid ? null : CURRENT_BASELINE_UNVALIDATED,
  };
  // A failed baseline NEVER discards the run: the failure is recorded, and every
  // candidate the run already evaluated is still recorded with its own issues.
  if (!baselineCheck.valid) {
    evaluations.push({candidateId:"current",status:"invalid",issues:baselineCheck.issues});
  }
  for (const source of candidates) {
    const check = validateConfirmedCandidate(source, context);
    if (!check.valid) { evaluations.push({candidateId:source.candidateId,status:"invalid",issues:check.issues}); continue; }
    const result = check.result;
    // A candidate is only ever COMPARED against a validated baseline. When the
    // baseline failed, the candidate is retained as evaluated evidence that
    // could not be compared — never silently dropped.
    if (!baselineCheck.valid) {
      evaluations.push({candidateId:result.candidateId,status:"baseline-unvalidated",
        issues:["Current baseline could not be validated — no comparison was possible"]});
      continue;
    }
    if (snapshot.effectiveConfiguration && result.configurationKey === snapshot.effectiveConfiguration) {
      evaluations.push({candidateId:result.candidateId,status:"unchanged"}); continue;
    }
    const hardSafety = hasHardSafetyRegression(extractAuthoritativeMetrics(result),extractAuthoritativeMetrics(baseline));
    const muted = detectMutedSubs((result.appliedTuning || []).map(t=>({id:t.sourceId,tuning:t})));
    const outputPass = result.requestedP14Pass === true &&
      result.operatingOutputDb >= result.p14TargetDb - 1e-7 &&
      result.p14AchievedDb >= result.p14TargetDb - 1e-7;
    if (!outputPass || hardSafety.regressed || muted.mutedCount) {
      evaluations.push({candidateId:result.candidateId,status:"safety-rejected",outputPass,level:hardSafety,muted});
      continue;
    }
    // Zero-fail-first: fail-count reduction is a material improvement, not a
    // trade-off. Short-circuit before the trade-off classifier so candidates
    // that eliminate FAILs are always classified as material improvements.
    const currentFails = countFailingSeats(baseline);
    const candidateFails = countFailingSeats(result);
    if (candidateFails < currentFails) {
      const eliminated = currentFails - candidateFails;
      const reason = candidateFails === 0
        ? `All seats now pass P19 and P20 (eliminated ${eliminated} failing seat${eliminated > 1 ? 's' : ''})`
        : `Eliminated ${eliminated} failing seat${eliminated > 1 ? 's' : ''}`;
      evaluations.push({candidateId:result.candidateId,status:"material",materiality:{material:true,reason}});
      eligible.push(result);
      continue;
    }
    const materiality = isMaterialImprovement(baseline,result);
    // Check for verified trade-off regardless of materiality — a candidate
    // that materially improves one objective while materially worsening another
    // is a trade-off (designer choice), NOT a normal recommendation.
    const tradeOff = classifyVerifiedTradeOff(baseline, result);
    if (tradeOff.isTradeOff) {
      evaluations.push({candidateId:result.candidateId,status:"trade-off",tradeOff});
      tradeOffs.push({ result, tradeOff, candidateId: result.candidateId });
    } else if (materiality.material) {
      evaluations.push({candidateId:result.candidateId,status:"material",materiality});
      eligible.push(result);
    } else {
      evaluations.push({candidateId:result.candidateId,status:"below-materiality",materiality});
    }
  }
  // ── Limit trade-offs to at most 1: the best primary-priority alternative ──
  // Do not flood the UI with every Pareto alternative. One representative
  // verified trade-off is enough for the first implementation.
  const limitedTradeOffs = tradeOffs.length > 1 ? tradeOffs.slice(0, 1) : tradeOffs;
  // The established presentation ordering runs once, here. Presentation and
  // Apply consume this exact confirmed collection; neither selects another winner.
  const seed = {currentResult:baseline,confirmedResults:eligible,winner:null};
  const recommendations = rankRecommendations(seed).map((r,i)=>({...r,isWinner:i===0}));
  const winner = recommendations[0]?.result || null;
  const incomplete = evaluations.some(e=>e.status==="invalid") || snapshot.evaluationIncomplete === true;
  const rejected = evaluations.some(e=>e.status==="safety-rejected");
  const below = evaluations.some(e=>e.status==="below-materiality");
  const hasTradeOffs = limitedTradeOffs.length > 0;
  const terminalOutcome = winner ? "material" : hasTradeOffs ? "trade-off" : incomplete ? "incomplete" : rejected ? "safety-rejected" : below ? "below-materiality" : "no-better-evaluated";
  const messages = {
    incomplete:"Evaluation incomplete — one or more options could not be validated.",
    "safety-rejected":"Evaluated improvements did not meet the required safety checks.",
    "below-materiality":"Valid changes were below the material-improvement threshold.",
    "no-better-evaluated":"No better solution among the evaluated options.",
  };
  const baselineInvalid = baselineValidation.valid !== true;
  return {isCurrent:!winner && !hasTradeOffs,winner,recommendations,currentResult:baseline,
    confirmedResults:(results || []).filter(r=>evaluations.some(e=>e.candidateId===r.candidateId&&e.status!=="invalid")),
    evaluations,baselineValidation,validationFailed:baselineInvalid,
    terminalOutcome,message:(winner||hasTradeOffs)?null:(baselineInvalid ? CURRENT_BASELINE_UNVALIDATED : messages[terminalOutcome]),
    materialityReason:recommendations[0]?.materialityReason || null,
    calibrationResult:eligible.find(r=>r.candidateKind==="calibration") || null,
    calibrationMaterial:{material:eligible.some(r=>r.candidateKind==="calibration")},
    tradeOffs: limitedTradeOffs,
  };
}