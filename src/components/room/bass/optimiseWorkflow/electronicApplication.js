// Candidate-owned electronic settings. No acoustic calculations or RP22 scoring.
import { isCalibrationOnlyResult } from "./calibrationIdentityGuard.js";
import { applyCalibrationTuning } from "../improveBassV2/improveBassV2ApplyCalibration.js";

import { canonicalLevel } from "../improveBassV2/confirmedCandidateValidity.js";

export const clone = value => JSON.parse(JSON.stringify(value));
export function stable(value) {
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.keys(value).sort().filter(k => value[k] !== undefined).map(k => JSON.stringify(k) + ":" + stable(value[k])).join(",") + "}";
  return JSON.stringify(value);
}
const finite = v => typeof v === "number" && Number.isFinite(v);
const nonempty = v => typeof v === "string" && v.trim().length > 0;
export function completeTuning(tuning, instances) {
  const active = (instances || []).filter(s => s.enabled !== false);
  const ids = active.map(s => s.id);
  if (!ids.length || ids.some(id => !nonempty(id)) || new Set(ids).size !== ids.length ||
      !Array.isArray(tuning) || tuning.length !== ids.length) return false;
  const seen = new Set();
  return tuning.every(t => {
    if (!t || !ids.includes(t.sourceId) || seen.has(t.sourceId)) return false;
    seen.add(t.sourceId);
    return finite(t.delayMs) && finite(t.gainDb) && finite(t.phaseControlDeg ?? t.phaseAdjust) &&
      [1,-1,0,180].includes(t.polarity);
  });
}
export function completeCrossover(c) {
  return !!c && finite(c.frequencyHz) && c.frequencyHz > 0 &&
    [12,24].includes(c.speakerHpSlopeDbPerOct) && [12,24].includes(c.subwooferLpSlopeDbPerOct) &&
    typeof c.linkFrequencies === "boolean" &&
    (c.linkFrequencies || (finite(c.subwooferFrequencyHz) && c.subwooferFrequencyHz > 0));
}
export function electronicContext(p) {
  // Keep exact values, including orientation, XYZ, heights, models, priority,
  // amplifier and main-speaker integration. Never round identity evidence.
  return clone({
    instances: p.subwooferInstances,
    roomDims: p.roomDims, seatingPositions: p.seatingPositions, rspPosition: p.rspPosition,
    selectedSubModel: p.selectedSubModel, amplifierPowerPerSubW: p.amplifierPowerPerSubW,
    frontOrientation: p.frontOrientation ?? null, rearOrientation: p.rearOrientation ?? null,
    integrationContext: p.integrationContext ?? null,
    rspMode: p.rspMode ?? null, designatedRspSeatId: p.designatedRspSeatId ?? null,
    manualRspX_m:p.manualRspX_m??null,manualRspY_m:p.manualRspY_m??null,
    targets:[p.p14TargetBasis??null,p.p14TargetLevel??null,p.p14TargetDb??null,p.p18TargetBasis??null],
  });
}
export function electronicContextFromUi({shared,appState,subwooferInstances,roomDims,seatingPositions,frontSubsCfg,rearSubsCfg,amplifierPowerPerSubW}) {
  const a = shared?.authoritative;
  if (!a?.rspPosition || !Array.isArray(subwooferInstances) || !Array.isArray(seatingPositions)) return null;
  const requested=a.requested||{}, authority=shared.completedBassAuthority||{};
  return electronicContext({
    p14TargetBasis:requested.p14TargetBasis||authority.p14TargetBasis||"minimum",
    p14TargetLevel:requested.requestedLevel||requested.selectedP14Level||requested.p14TargetLevel||requested.selectedP14TargetLevel||authority.p14TargetLevel||2,
    p14TargetDb:requested.selectedP14TargetDb||authority.p14TargetDb||117,
    p18TargetBasis:requested.p18TargetBasis||requested.selectedP18TargetBasis||authority.p18TargetBasis||"minimum",
    manualRspX_m:appState?.manualRspX_m??null,manualRspY_m:appState?.manualRspY_m??null,
    subwooferInstances, roomDims, seatingPositions, rspPosition:a.rspPosition,
    selectedSubModel:frontSubsCfg?.model || rearSubsCfg?.model || null,
    amplifierPowerPerSubW,
    frontOrientation:frontSubsCfg?.orientation ?? null, rearOrientation:rearSubsCfg?.orientation ?? null,
    rspMode:appState?.rspMode || null, designatedRspSeatId:appState?.designatedRspSeatId || null,
    integrationContext:a.combinedAuthorityEnabled ? {
      roomDims, seatingPositions, rspPosition:a.rspPosition, speakerSources:a.lcrSources,
      crossover:a.crossover, physics:a.physics, identity:a.fingerprintInputs?.combinedResponseIdentity,
    } : null,
  });
}
export function prepareElectronicCandidate({candidate,context,inputIdentity,cacheKey,currentCrossover,currentEffectiveCrossover=currentCrossover}) {
  if (!candidate || !isCalibrationOnlyResult(candidate) || candidate.isCrossQuantity ||
      !candidate.electronicContext || !context) return {ok:false,reason:"Unproven installed configuration."};
  if (!nonempty(inputIdentity) || !nonempty(cacheKey) ||
      candidate.inputIdentity !== inputIdentity || candidate.baselineCacheKey !== cacheKey ||
      stable(candidate.electronicContext) !== stable(context)) return {ok:false,reason:"The design changed after confirmation."};
  if (!context.instances.length || context.instances.some(s => s.enabled !== false &&
      (!nonempty(s.model) || !finite(s.position?.x) || !finite(s.position?.y) ||
       !finite(s.bottomHeightM) || !finite(s.rotationDeg)))) return {ok:false,reason:"Incomplete installed geometry."};
  if ((candidate.combinedFrom?.crossover || candidate.integrationVerified) && !completeCrossover(candidate.crossover))
    return {ok:false,reason:"Incomplete confirmed crossover settings."};
  const tuning = candidate.appliedTuning;
  const crossover = candidate.crossover || currentEffectiveCrossover;
  if (!completeTuning(tuning,context.instances)) return {ok:false,reason:"Incomplete confirmed per-source tuning."};
  if (!completeCrossover(crossover) || !completeCrossover(currentEffectiveCrossover)) return {ok:false,reason:"Incomplete canonical crossover settings."};
  const nextInstances = applyCalibrationTuning(context.instances,clone(tuning));
  // The only mutated fields are those written by the established tuning adapter.
  return {ok:true,instances:nextInstances,crossover:clone(crossover),tuning:clone(tuning),
    before:clone({instances:context.instances,crossover:currentCrossover,effectiveCrossover:currentEffectiveCrossover})};
}
export function settingsEqual(a,b) {
  return !!a && !!b && stable(a.instances) === stable(b.instances) && stable(a.crossover) === stable(b.crossover);
}
export function changedSettings(before,after) {
  const rows=[];
  const add=(label,from,to,unit="")=>{if(from!==to)rows.push({label,from:String(from)+unit,to:String(to)+unit});};
  (after.instances||[]).filter(s=>s.enabled!==false).forEach((s,i)=>{
    const old=before.instances.find(x=>x.id===s.id);
    if(!old)return;
    const label="Sub "+(i+1)+" · ";
    // Stored defaults belong to the installed design, never to a candidate.
    add(label+"Phase",old.phaseControlDeg??old.phaseAdjust??0,s.phaseControlDeg??s.phaseAdjust??0,"°");
    const pol=v=>v===-1||v===180?"Inverted":"Normal";
    add(label+"Polarity",pol(old.polarity),pol(s.polarity));
    add(label+"Delay",old.delayMs??0,s.delayMs??0," ms");
    add(label+"Gain",old.gainDb??0,s.gainDb??0," dB");
  });
  const a=before.effectiveCrossover||before.crossover,b=after.effectiveCrossover||after.crossover;
  if(a&&b){
    add("Speaker high-pass",a.frequencyHz,b.frequencyHz," Hz");
    add("Speaker high-pass slope",a.speakerHpSlopeDbPerOct,b.speakerHpSlopeDbPerOct," dB/oct");
    add("Subwoofer low-pass",a.linkFrequencies?a.frequencyHz:a.subwooferFrequencyHz,b.linkFrequencies?b.frequencyHz:b.subwooferFrequencyHz," Hz");
    add("Subwoofer low-pass slope",a.subwooferLpSlopeDbPerOct,b.subwooferLpSlopeDbPerOct," dB/oct");
    add("Crossover frequencies",a.linkFrequencies?"Linked":"Independent",b.linkFrequencies?"Linked":"Independent");
  }
  return rows;
}
export function resultLevels(result) {
  const seats=result?.perSeatP20 || [];
  const group=primary=>{
    const rows=seats.filter(s=>s.isPrimary===primary);
    const levels=rows.map(s=>canonicalLevel(s.level??s.achievedLevel??s.p20Level));
    return rows.length && levels.every(finite)?Math.min(...levels):null;
  };
  return {p19:canonicalLevel(result?.achievedP19Level),primary:group(true),secondary:group(false)};
}


export function physicalContext(context){
  if(!context)return null;
  const c=clone(context);
  c.instances=(c.instances||[]).map(s=>{
    const x={...s};
    for(const k of ["delayMs","gainDb","phaseControlDeg","phaseAdjust","polarity","tuningSource","phaseAdjustDeg","calibrationSource","appliedV2Provenance"])delete x[k];
    return x;
  });
  if(c.integrationContext){delete c.integrationContext.crossover;delete c.integrationContext.identity;}
  return c;
}
export function comparisonReceipt(result){
  const keys=["achievedP19VariationDb","achievedP19Level","achievedP20VariationDb","achievedP20Level","p14AchievedDb","p14AchievedLevel","achievedP18Hz","p18AchievedLevel","perSeatP20"];
  return Object.fromEntries(keys.map(k=>[k,result?.[k]??null]));
}

// Pure transaction orchestrator. The persistence owner supplies the save lock,
// whole-version writes and forced readback. A failed verification rolls back
// the complete pair, never just crossover or tuning.
export async function executeElectronicTransaction({before,after,receipt,persist,readback,commit,verify,guard}) {
  let wrote=false;
  const ensure=()=>{if(!guard())throw new Error("The design changed; ADI stopped applying settings.");};
  try {
    ensure();
    wrote=true;
    await persist(after,{...receipt,status:"verifying"});
    ensure();
    if(!settingsEqual(await readback(),after))throw new Error("Saved settings did not match the confirmed candidate.");
    commit(after,{...receipt,status:"verifying"});
    ensure();
    const verified=await verify(after);
    ensure();
    if(!verified)throw new Error("Canonical recalculation did not reproduce the confirmed candidate.");
    const finalReceipt={...receipt,status:"verified",verifiedAt:new Date().toISOString(),resultFingerprint:verified.fingerprint,afterLevels:verified.levels};
    await persist(after,finalReceipt);
    ensure();
    const saved=await readback();
    if(!settingsEqual(saved,after)||saved.receipt?.status!=="verified"||saved.receipt?.runId!==receipt.runId)throw new Error("The verified receipt could not be read back.");
    commit(after,finalReceipt);
    return finalReceipt;
  } catch(error) {
    if(wrote){
      // Do not overwrite another operation's electronic edits. Preserve the
      // prior pair in the pending receipt for recovery in that exceptional case.
      const saved=await readback().catch(()=>null);
      if(saved && (settingsEqual(saved,after)||settingsEqual(saved,before))){
        const failed={...receipt,status:"restored",error:error.message};
        await persist(before,failed);
        if(!settingsEqual(await readback(),before))throw new Error("Restoration requires attention; prior settings are retained in the ADI receipt.");
        commit(before,failed);
        await verify(before,true).catch(()=>null);
      }
    }
    throw error;
  }
}
