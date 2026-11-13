import { OPTIMISER_LEVER, OPTIMISER_LEVER_EVIDENCE } from "./optimiserPlanConstants.js";
import { leverEffectFrom } from "./optimiserPlanMetrics.js";
import { proveCombinedElectronicIdentity } from "./combinedElectronicIdentityProof.js";
import { clone } from "../optimiseWorkflow/electronicApplication.js";
export function buildCombinedElectronicLever({winner,instances,baselineResult,identity={},currentCrossover=null}={}){
  if(!winner || winner.combinedFrom?.crossover!==true)return null;
  const proof=proveCombinedElectronicIdentity({winner,instances,identity});
  const before=winner.electronicContext?.instances||[];
  const tuning=(winner.appliedTuning||[]).map(t=>{
    const s=before.find(i=>i.id===t.sourceId);
    return {subId:t.sourceId,label:t.sourceId,
      fromDelayMs:s?.delayMs??null,toDelayMs:t.delayMs,
      fromGainDb:s?.gainDb??null,toGainDb:t.gainDb,
      fromPhaseDeg:s?.phaseControlDeg??s?.phaseAdjust??null,toPhaseDeg:t.phaseControlDeg??t.phaseAdjust,
      fromPolarity:s?.polarity??null,toPolarity:t.polarity};
  });
  return {lever:OPTIMISER_LEVER.COMBINED_ELECTRONIC,evidenceStatus:OPTIMISER_LEVER_EVIDENCE.EVALUATED,
    evaluated:true,notEvaluated:false,actionable:proof.valid,identityProof:proof,
    reason:proof.valid?"Complete electronic improvement confirmed.":proof.issues.join(" "),
    sourceCandidateId:winner.candidateId,effect:leverEffectFrom(winner,baselineResult),
    confirmedCandidate:clone(winner),tuning,changes:tuning,
    crossover:{before:currentCrossover?clone(currentCrossover):null,after:winner.crossover?clone(winner.crossover):null},
    sourceIdentity:clone(before),candidateOrigin:winner.candidateOrigin,combinedFrom:winner.combinedFrom,
    electronicContext:winner.electronicContext?clone(winner.electronicContext):null,
    inputIdentity:winner.inputIdentity,baselineCacheKey:winner.baselineCacheKey,
    designFingerprint:identity.designFingerprint,resultFingerprint:identity.resultFingerprint,
    cacheKey:identity.cacheKey||identity.designFingerprint};
}
