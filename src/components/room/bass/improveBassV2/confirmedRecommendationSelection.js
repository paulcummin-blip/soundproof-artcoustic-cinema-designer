import { validateConfirmedCandidate, effectiveConfigurationKey } from "./confirmedCandidateValidity.js";
import { isMaterialImprovement } from "./materialityGate.js";
import { rankRecommendations } from "./recommendationRanker.js";
import { hasLevelRegression, extractAuthoritativeMetrics, detectMutedSubs } from "../best-layout/authoritativeFinalistSelection.js";
import { hasPrimarySeatLevelRegression, classifyVerifiedTradeOff } from "./tradeOffClassifier.js";

export function selectConfirmedRecommendations(results, snapshot, current) {
  const context = snapshot.validationContext || {
    seats: current?.perSeatP19?.map(s=>({id:s.seatId,isPrimary:s.isPrimary})),
  };
  const baselineCheck = validateConfirmedCandidate(current, context);
  const evaluations = [];
  const eligible = [];
  const tradeOffs = [];
  const baseline = baselineCheck.result;
  const candidates = (results || []).filter(r => r && r.candidateKind !== "current" && r.candidateId !== "current");
  if (!baselineCheck.valid) return { isCurrent:true, winner:null, recommendations:[], confirmedResults:[],
    currentResult:baseline, evaluations:[{candidateId:"current",status:"invalid",issues:baselineCheck.issues}],
    terminalOutcome:"incomplete", message:"Evaluation incomplete — Current could not be validated.", tradeOffs:[] };
  for (const source of candidates) {
    const check = validateConfirmedCandidate(source, context);
    if (!check.valid) { evaluations.push({candidateId:source.candidateId,status:"invalid",issues:check.issues}); continue; }
    const result = check.result;
    if (snapshot.effectiveConfiguration && result.configurationKey === snapshot.effectiveConfiguration) {
      evaluations.push({candidateId:result.candidateId,status:"unchanged"}); continue;
    }
    const level = hasLevelRegression(extractAuthoritativeMetrics(result),extractAuthoritativeMetrics(baseline));
    // HARD SAFETY: primary seat LEVEL regression (not same-level raw worsening,
    // which is reclassified as a trade-off signal).
    const primaryLevel = hasPrimarySeatLevelRegression(result,baseline);
    const muted = detectMutedSubs((result.appliedTuning || []).map(t=>({id:t.sourceId,tuning:t})));
    const outputPass = result.requestedP14Pass === true &&
      result.operatingOutputDb >= result.p14TargetDb - 1e-7 &&
      result.p14AchievedDb >= result.p14TargetDb - 1e-7;
    if (!outputPass || level.regressed || primaryLevel.regressed || muted.mutedCount) {
      evaluations.push({candidateId:result.candidateId,status:"safety-rejected",outputPass,level,primary:primaryLevel,muted});
      continue;
    }
    const materiality = isMaterialImprovement(baseline,result);
    if (materiality.material) {
      evaluations.push({candidateId:result.candidateId,status:"material",materiality});
      eligible.push(result);
    } else {
      // Not a pure material improvement — check for verified trade-off
      const tradeOff = classifyVerifiedTradeOff(baseline, result);
      if (tradeOff.isTradeOff) {
        evaluations.push({candidateId:result.candidateId,status:"trade-off",tradeOff});
        tradeOffs.push({ result, tradeOff, candidateId: result.candidateId });
      } else {
        evaluations.push({candidateId:result.candidateId,status:"below-materiality",materiality});
      }
    }
  }
  // The established presentation ordering runs once, here. Presentation and
  // Apply consume this exact confirmed collection; neither selects another winner.
  const seed = {currentResult:baseline,confirmedResults:eligible,winner:null};
  const recommendations = rankRecommendations(seed).map((r,i)=>({...r,isWinner:i===0}));
  const winner = recommendations[0]?.result || null;
  const incomplete = evaluations.some(e=>e.status==="invalid") || snapshot.evaluationIncomplete === true;
  const rejected = evaluations.some(e=>e.status==="safety-rejected");
  const below = evaluations.some(e=>e.status==="below-materiality");
  const hasTradeOffs = tradeOffs.length > 0;
  const terminalOutcome = winner ? "material" : hasTradeOffs ? "trade-off" : incomplete ? "incomplete" : rejected ? "safety-rejected" : below ? "below-materiality" : "no-better-evaluated";
  const messages = {
    incomplete:"Evaluation incomplete — one or more options could not be validated.",
    "safety-rejected":"Evaluated improvements did not meet the required safety checks.",
    "below-materiality":"Valid changes were below the material-improvement threshold.",
    "no-better-evaluated":"No better solution among the evaluated options.",
  };
  return {isCurrent:!winner && !hasTradeOffs,winner,recommendations,currentResult:baseline,
    confirmedResults:(results || []).filter(r=>evaluations.some(e=>e.candidateId===r.candidateId&&e.status!=="invalid")),
    evaluations,terminalOutcome,message:(winner||hasTradeOffs)?null:messages[terminalOutcome],
    materialityReason:recommendations[0]?.materialityReason || null,
    calibrationResult:eligible.find(r=>r.candidateKind==="calibration") || null,
    calibrationMaterial:{material:eligible.some(r=>r.candidateKind==="calibration")},
    tradeOffs,
  };
}