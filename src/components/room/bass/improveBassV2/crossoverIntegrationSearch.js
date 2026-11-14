// Joint crossover and electronic integration stage of the existing ADI optimiser.
// Screening never publishes grades. All retained recommendations are confirmed
// by evaluateStage2ConfirmationWithTuning, the same engineering pipeline.
import { normaliseCrossoverConfig, resolveSharedCrossoverLimits } from "../crossoverAuthority";
import { combineTunedResponse } from "../combinedTuningResponse";
import { computeOfficialP20Assessment } from "@/components/utils/bassAuthoritativeAssessment";
import { evaluateStage2ConfirmationWithTuning } from "../stage2/stage2CanonicalEvaluation";

const copyTuning = values => values.map(t => ({
  ...t, delayMs: Number(t.delayMs) || 0, gainDb: Number(t.gainDb) || 0,
  phaseControlDeg: Number(t.phaseControlDeg ?? t.phaseAdjust) || 0,
  polarity: t.polarity === -1 || t.polarity === 180 ? 180 : 0,
}));
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const keyOf = c => JSON.stringify([c.crossover, c.tuning.map(t => [t.gainDb,t.delayMs,t.phaseControlDeg,t.polarity])]);
const p20 = r => Number.isFinite(r?.achievedP20VariationDb) ? r.achievedP20VariationDb : Infinity;
const p19 = r => Number.isFinite(r?.achievedP19VariationDb) ? r.achievedP19VariationDb : Infinity;

// Multi-objective acceptance: a crossover candidate qualifies when EITHER the
// RSP P19 improves materially (P20 held within safety limits) OR the P20
// seat-to-seat consistency improves materially (P19 held within its regression
// limit). A candidate need not improve both. The material threshold is the
// same 0.25 dB the previous P20-only rule used, applied symmetrically. Lower
// deviation is better for both P19 and P20.
const MATERIAL_THRESHOLD_DB = 0.25;
const P19_REGRESSION_LIMIT_DB = 0.1;
const round2 = v => Math.round(Number(v) * 100) / 100;

export function integrationAcceptanceObjective(baseline, candidate) {
  if (!baseline || !candidate) return null;
  const p19Improvement = p19(baseline) - p19(candidate);
  const p20Improvement = p20(baseline) - p20(candidate);
  const qualifiesP19 = Number.isFinite(p19Improvement) && p19Improvement >= MATERIAL_THRESHOLD_DB;
  const qualifiesP20 = Number.isFinite(p20Improvement) && p20Improvement >= MATERIAL_THRESHOLD_DB;
  if (qualifiesP19 && qualifiesP20) return "both";
  if (qualifiesP19) return "p19";
  if (qualifiesP20) return "p20";
  return null;
}

export function integrationImprovements(baseline, candidate) {
  if (!baseline || !candidate) return null;
  const p19Delta = p19(baseline) - p19(candidate);
  const p20Delta = p20(baseline) - p20(candidate);
  return {
    p19BeforeDb: round2(p19(baseline)),
    p19AfterDb: round2(p19(candidate)),
    p19DeltaDb: Number.isFinite(p19Delta) ? round2(p19Delta) : null,
    p20BeforeDb: round2(p20(baseline)),
    p20AfterDb: round2(p20(candidate)),
    p20DeltaDb: Number.isFinite(p20Delta) ? round2(p20Delta) : null,
  };
}

export function integrationSafetyIssues(baseline, candidate) {
  if (!baseline || !candidate) return ["Canonical confirmation unavailable"];
  const issues = [];
  // ── Multi-objective acceptance (P19 OR P20) ─────────────────────────
  // A candidate must improve at least one of RSP P19 or P20 seat-to-seat
  // consistency by the material threshold. This replaces the previous
  // P20-only requirement, so an RSP-only improvement is no longer discarded
  // when seat consistency is unchanged.
  const objective = integrationAcceptanceObjective(baseline, candidate);
  if (!objective) issues.push("No useful P19 or P20 improvement");
  // P19 regression limit applies regardless of which objective qualifies: a
  // candidate that worsens RSP P19 beyond this limit is rejected even when P20
  // improves, so a P20 gain never buys an RSP regression.
  if (p19(candidate) > p19(baseline) + P19_REGRESSION_LIMIT_DB) issues.push("RSP P19 regression");
  if (candidate.physicalValidation?.passed !== true) issues.push("Physical correction constraints failed");
  if (!Number.isFinite(candidate.p14HeadroomDb) || candidate.p14HeadroomDb < 0) issues.push("Insufficient P14 headroom");
  if (candidate.p14HeadroomDb < (baseline.p14HeadroomDb ?? 0) - 1) issues.push("More than 1 dB headroom lost");
  if (![candidate.assessmentStartHz, candidate.assessmentEndHz, baseline.assessmentStartHz, baseline.assessmentEndHz].every(Number.isFinite) ||
      Math.abs(candidate.assessmentStartHz - baseline.assessmentStartHz) > 0.001 ||
      Math.abs(candidate.assessmentEndHz - baseline.assessmentEndHz) > 0.001) issues.push("Assessment band changed");
  const prior = new Map((baseline.perSeatP20 || []).map(s => [s.seatId,s]));
  const nextSeats = candidate.perSeatP20 || [];
  if (!prior.size || nextSeats.length !== prior.size || new Set(nextSeats.map(s => s.seatId)).size !== prior.size) issues.push("Assessed seat set changed");
  for (const seat of nextSeats) {
    const before = prior.get(seat.seatId);
    if (!before) { issues.push("Assessed seat missing from baseline"); continue; }
    if (!Number.isFinite(seat.variationDbRaw) || !Number.isFinite(before.variationDbRaw) || Boolean(seat.isPrimary) !== Boolean(before.isPrimary)) issues.push("Invalid seat evidence: " + seat.seatId);
    if (seat.variationDbRaw > before.variationDbRaw + (before.isPrimary ? 0.5 : 2)) {
      issues.push((before.isPrimary ? "Primary" : "Secondary") + " seat regression: " + seat.seatId);
    }
  }
  return issues;
}

export function runCrossoverIntegrationSearch({
  rawTransfer, effectiveBaseline, crossover, speakerModels,
  p14TargetBasis, p14TargetLevel, p14TargetDb, p18TargetBasis,
  maxScreenings = 1400,
}) {
  const started = performance.now();
  if (!rawTransfer?.integrationTransfers?.available || !effectiveBaseline?.length) {
    return { candidates: [], diagnostics: { status: "unavailable", reason: "Combined source transfers are required" } };
  }
  const limits = resolveSharedCrossoverLimits(speakerModels || rawTransfer.integrationTransfers.speakerModels);
  const currentCrossover = normaliseCrossoverConfig(crossover, limits);
  const currentTuning = copyTuning(effectiveBaseline);
  const canonicalParams = { p14TargetBasis,p14TargetLevel,p14TargetDb,p18TargetBasis,tuningVariant:"delay-polarity-trim" };
  const baseline = evaluateStage2ConfirmationWithTuning(rawTransfer, {
    ...canonicalParams, crossover: currentCrossover, tuning: currentTuning,
  });
  if (!baseline) return { candidates: [], diagnostics: { status: "error", reason: "Baseline confirmation failed" } };
  const baselineDone = performance.now();
  const diagnostics = {
    status: "completed", screened: 0, confirmed: 1, duplicateCandidatesAvoided: 0, slopePairs: [], linkedFrequencies: [],
    independentTested: 0, jointTrials: 0, rejected: [], searchVersion: "joint-crossover-v1",
    band: [baseline.assessmentStartHz,baseline.assessmentEndHz],
  };
  const seen = new Map();
  const all = [];
  function screen(candidate) {
    candidate.crossover = normaliseCrossoverConfig(candidate.crossover, limits);
    const key = keyOf(candidate);
    if (seen.has(key)) { diagnostics.duplicateCandidatesAvoided++; return seen.get(key); }
    if (diagnostics.screened >= maxScreenings) return null;
    const combined = combineTunedResponse(rawTransfer, candidate.tuning, candidate.crossover);
    if (!combined?.available) return null;
    const result = computeOfficialP20Assessment({
      rspPostEqCurve: combined.combinedBySeat.rsp,
      perSeatPostEqCurves: rawTransfer.seatIds.filter(id => id !== "rsp").map(seatId => ({seatId,responseData:combined.combinedBySeat[seatId]})),
      assessmentStartHz: baseline.assessmentStartHz, assessmentEndHz: baseline.assessmentEndHz,
    });
    if (!result?.available || !Number.isFinite(result.worstSeat?.variationDbRaw)) return null;
    // Same fixed band and canonical smoothing. This is only promotion evidence;
    // no proxy grade is exposed as a result or used for Apply.
    const mean = result.perSeatResults.reduce((v,s)=>v+s.variationDbRaw,0)/result.perSeatResults.length;
    const effort = candidate.tuning.reduce((v,t,i)=>v+Math.abs(t.gainDb-currentTuning[i].gainDb)*0.02+
      Math.abs(t.delayMs-currentTuning[i].delayMs)*0.01+Math.abs(t.phaseControlDeg-currentTuning[i].phaseControlDeg)*0.0002,0);
    const record = {...candidate, key, score:result.worstSeat.variationDbRaw+0.05*mean+effort};
    seen.set(key,record); all.push(record); diagnostics.screened++;
    if (candidate.crossover.linkFrequencies === false) diagnostics.independentTested++;
    return record;
  }
  const baselineScreen = screen({crossover:currentCrossover,tuning:currentTuning});
  // Every legal crossover / slope pair receives several different integration
  // starts BEFORE promotion. A poor installed delay cannot eliminate a setting.
  const frequencies = [...new Set([limits.minHz,currentCrossover.frequencyHz,...Array.from({length:13},(_,i)=>80+10*i)].filter(f=>f>=limits.minHz&&f<=limits.maxHz))].sort((a,b)=>a-b);
  diagnostics.linkedFrequencies=frequencies;
  const seeds = [];
  for (const hp of [12,24]) for (const lp of [12,24]) {
    diagnostics.slopePairs.push([hp,lp]);
    for (const hz of frequencies) {
      const cross = {...currentCrossover,frequencyHz:hz,subwooferFrequencyHz:hz,linkFrequencies:true,speakerHpSlopeDbPerOct:hp,subwooferLpSlopeDbPerOct:lp};
      const starts = [
        currentTuning,
        currentTuning.map(t=>({...t,delayMs:clamp(t.delayMs+2,0,20),phaseControlDeg:clamp(t.phaseControlDeg+45,0,175)})),
        currentTuning.map(t=>({...t,delayMs:clamp(t.delayMs-2,0,20),polarity:t.polarity===180?0:180})),
        currentTuning.map((t,i)=>({...t,gainDb:clamp(t.gainDb-(i%2?1:0),-6,0),delayMs:clamp(t.delayMs+(i%2?1:0),0,20),phaseControlDeg:clamp(t.phaseControlDeg+(i%2?60:0),0,175)})),
      ];
      const group=starts.map(tuning=>screen({crossover:cross,tuning})).filter(Boolean).sort((a,b)=>a.score-b.score);
      diagnostics.jointTrials+=3;
      if(group[0])seeds.push(group[0]);
    }
  }
  diagnostics.crossoverScreeningMs = performance.now() - baselineDone;
  diagnostics.crossoverCandidates = diagnostics.screened;
  const jointStarted = performance.now();
  // Keep diversity: best two for EACH slope pair plus the installed config.
  let beam=[baselineScreen,...diagnostics.slopePairs.flatMap(([hp,lp])=>seeds.filter(c=>c.crossover.speakerHpSlopeDbPerOct===hp&&c.crossover.subwooferLpSlopeDbPerOct===lp).sort((a,b)=>a.score-b.score).slice(0,2))].filter(Boolean);
  // Deterministic joint neighbourhoods change gain, delay and all-pass phase
  // together, including common delay relative to the screen channels.
  let randomState=1729;
  const rand=()=>{randomState=(Math.imul(randomState,1664525)+1013904223)>>>0;return randomState/4294967296;};
  for(let pass=0;pass<3;pass++){
    const next=[...beam];
    const step=pass===0?1:0.5;
    for(const parent of beam){
      for(let trial=0;trial<24;trial++){
        const group=trial<4?"all":trial%currentTuning.length;
        const sign=trial%2?1:-1;
        const tuning=parent.tuning.map((t,i)=>{
          if(group!=="all"&&i!==group)return {...t};
          return {...t,
            delayMs:clamp(Math.round((t.delayMs+sign*step*(rand()<0.3?2:1))*4)/4,0,20),
            gainDb:clamp(t.gainDb+(rand()<0.5?0:sign*0.5),-6,0),
            phaseControlDeg:clamp(t.phaseControlDeg+sign*(pass===0?15:5),0,175),
            polarity:trial===23?(t.polarity===180?0:180):t.polarity,
          };
        });
        const c=screen({crossover:{...parent.crossover},tuning});
        diagnostics.jointTrials++;
        if(c)next.push(c);
      }
    }
    beam=diagnostics.slopePairs.flatMap(([hp,lp])=>next.filter(c=>c.crossover.speakerHpSlopeDbPerOct===hp&&c.crossover.subwooferLpSlopeDbPerOct===lp).sort((a,b)=>a.score-b.score).slice(0,2));
  }
  diagnostics.jointSearchMs = performance.now() - jointStarted;
  diagnostics.jointCandidates = diagnostics.screened - diagnostics.crossoverCandidates;
  const refinementStarted = performance.now();
  // Independent frequencies are modest offsets and remain visible/editable.
  // Include fresh joint tuning starts so independent-frequency refinement is
  // not evaluated solely at a frozen electronic optimum.
  for(const parent of beam)for(const delta of [-20,-10,10,20]){
    for(const delay of [0,0.5]){
      const cross={...parent.crossover,linkFrequencies:false,subwooferFrequencyHz:clamp(parent.crossover.frequencyHz+delta,limits.minHz,limits.maxHz)};
      const tuning=parent.tuning.map(t=>({...t,delayMs:clamp(t.delayMs+delay,0,20),phaseControlDeg:clamp(t.phaseControlDeg+(delay?5:0),0,175)}));
      screen({crossover:cross,tuning});
    }
  }
  diagnostics.refinementMs = performance.now() - refinementStarted;
  diagnostics.refinementCandidates = diagnostics.screened - diagnostics.crossoverCandidates - diagnostics.jointCandidates;
  const ranked=all.slice().sort((a,b)=>a.score-b.score);
  const diverse=diagnostics.slopePairs.flatMap(([hp,lp])=>ranked.filter(c=>c.crossover.speakerHpSlopeDbPerOct===hp&&c.crossover.subwooferLpSlopeDbPerOct===lp).slice(0,1));
  const finalists=[...new Map([...ranked.slice(0,8),...diverse].map(c=>[c.key,c])).values()];
  diagnostics.baselineMs=baselineDone-started;
  diagnostics.screeningMs=performance.now()-baselineDone;
  const candidates=[];
  const confirmationStarted=performance.now();
  for(const candidate of finalists){
    const result=evaluateStage2ConfirmationWithTuning(rawTransfer,{...canonicalParams,crossover:candidate.crossover,tuning:candidate.tuning});
    diagnostics.confirmed++;
    const issues=integrationSafetyIssues(baseline,result);
    if(issues.length){diagnostics.rejected.push({crossover:candidate.crossover,p19:p19(result),p20:p20(result),issues});continue;}
    const objective=integrationAcceptanceObjective(baseline,result);
    candidates.push({...result,crossover:candidate.crossover,responseBasis:"combined-lcr-sub",integrationVerified:true,
      integrationBaseline:{p19:p19(baseline),p20:p20(baseline),crossover:currentCrossover},
      integrationObjective:objective,
      integrationImprovements:integrationImprovements(baseline,result),
      integrationExplanation:baseline.perSeatP20?.some(s=>s.worstFrequencyHz<60&&s.variationDbRaw>=p20(baseline)-0.1)
        ? "The main limitation is below the crossover. Subwoofer interaction or placement remains the stronger lever."
        : "Crossover and subwoofer timing were tested together across all seats.",
    });
  }
  // Rank finalists by the combined improvement so both P19-driven and
  // P20-driven candidates surface into the bounded confirmation set. The
  // final winner is selected downstream by the established least-intrusive
  // intervention ordering, not by this screening sort.
  candidates.sort((a,b)=>(p19(baseline)-p19(a)+p20(baseline)-p20(a))-(p19(baseline)-p19(b)+p20(baseline)-p20(b))||p20(a)-p20(b)||p19(a)-p19(b));
  diagnostics.confirmationMs=performance.now()-confirmationStarted;
  diagnostics.runtimeMs=performance.now()-started;
  diagnostics.status=candidates.length?"completed":"no_safe_improvement";
  return {baseline,candidates:candidates.slice(0,3),diagnostics};
}