import { validateConfirmedCandidate, effectiveConfigurationKey } from "./confirmedCandidateValidity.js";
import { isMaterialImprovement } from "./materialityGate.js";
import { rankRecommendations } from "./recommendationRanker.js";
import { hasPrimarySeatRegression, hasLevelRegression, extractAuthoritativeMetrics, detectMutedSubs } from "../best-layout/authoritativeFinalistSelection.js";

export function selectConfirmedRecommendations(results, snapshot, current) {
  const context = snapshot.validationContext || {
    seats: current?.perSeatP19?.map(s=>({id:s.seatId,isPrimary:s.isPrimary})),
  };
  const baselineCheck = validateConfirmedCandidate(current, context);
  const evaluations = [];
  const eligible = [];
  const baseline = baselineCheck.result;
  const candidates = (results || []).filter(r => r && r.candidateKind !== "current" && r.candidateId !== "current");
  if (!baselineCheck.valid) return { isCurrent:true, winner:null, recommendations:[], confirmedResults:[],
    currentResult:baseline, evaluations:[{candidateId:"current",status:"invalid",issues:baselineCheck.issues}],
    terminalOutcome:"incomplete", message:"Evaluation incomplete — Current could not be validated." };
  for (const source of candidates) {
    const check = validateConfirmedCandidate(source, context);
    if (!check.valid) { evaluations.push({candidateId:source.candidateId,status:"invalid",issues:check.issues}); continue; }
    const result = check.result;
    if (snapshot.effectiveConfiguration && result.configurationKey === snapshot.effectiveConfiguration) {
      evaluations.push({candidateId:result.candidateId,status:"unchanged"}); continue;
    }
    const level = hasLevelRegression(extractAuthoritativeMetrics(result),extractAuthoritativeMetrics(baseline));
    const primary = hasPrimarySeatRegression(result,baseline);
    const muted = detectMutedSubs((result.appliedTuning || []).map(t=>({id:t.sourceId,tuning:t})));
    const outputPass = result.requestedP14Pass === true &&
      result.operatingOutputDb >= result.p14TargetDb - 1e-7 &&
      result.p14AchievedDb >= result.p14TargetDb - 1e-7;
    if (!outputPass || level.regressed || primary.regressed || muted.mutedCount) {
      evaluations.push({candidateId:result.candidateId,status:"safety-rejected",outputPass,level,primary,muted});
      continue;
    }
    const materiality = isMaterialImprovement(baseline,result);
    evaluations.push({candidateId:result.candidateId,status:materiality.material?"material":"below-materiality",materiality});
    if (materiality.material) eligible.push(result);
  }
  // The established presentation ordering runs once, here. Presentation and
  // Apply consume this exact confirmed collection; neither selects another winner.
  const seed = {currentResult:baseline,confirmedResults:eligible,winner:null};
  const recommendations = rankRecommendations(seed).map((r,i)=>({...r,isWinner:i===0}));
  const winner = recommendations[0]?.result || null;
  const incomplete = evaluations.some(e=>e.status==="invalid") || snapshot.evaluationIncomplete === true;
  const rejected = evaluations.some(e=>e.status==="safety-rejected");
  const below = evaluations.some(e=>e.status==="below-materiality");
  const terminalOutcome = winner ? "material" : incomplete ? "incomplete" : rejected ? "safety-rejected" : below ? "below-materiality" : "no-better-evaluated";
  const messages = {
    incomplete:"Evaluation incomplete — one or more options could not be validated.",
    "safety-rejected":"Evaluated improvements did not meet the required safety checks.",
    "below-materiality":"Valid changes were below the material-improvement threshold.",
    "no-better-evaluated":"No better solution among the evaluated options.",
  };
  return {isCurrent:!winner,winner,recommendations,currentResult:baseline,
    confirmedResults:(results || []).filter(r=>evaluations.some(e=>e.candidateId===r.candidateId&&e.status!=="invalid")),
    evaluations,terminalOutcome,message:winner?null:messages[terminalOutcome],
    materialityReason:recommendations[0]?.materialityReason || null,
    calibrationResult:eligible.find(r=>r.candidateKind==="calibration") || null,
    calibrationMaterial:{material:eligible.some(r=>r.candidateKind==="calibration")},
  };
}
