import { prepareElectronicCandidate } from "../optimiseWorkflow/electronicApplication.js";
export function proveCombinedElectronicIdentity({winner,instances,identity={}}={}){
  if(winner?.combinedFrom?.crossover!==true)return {valid:false,issues:["Not a combined electronic candidate."]};
  const prepared=prepareElectronicCandidate({candidate:winner,context:identity.electronicContext,
    inputIdentity:identity.inputIdentity,cacheKey:identity.cacheKey||identity.designFingerprint,
    currentCrossover:identity.electronicContext?.integrationContext?.crossover});
  return {valid:prepared.ok,issues:prepared.ok?[]:[prepared.reason]};
}
