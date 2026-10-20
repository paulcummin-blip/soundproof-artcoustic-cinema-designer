import React, { useEffect, useRef, useState } from "react";
import { applyCalibrationTuning } from "../improveBassV2/improveBassV2ApplyCalibration";
import { recommendationResultMatches, recommendationSettingsMatch } from "./crossoverApplicationVerification";
import useSharedBassAuthorityState from "../useSharedBassAuthorityState";

const number = value => Number.isFinite(value) ? value.toFixed(2) : "—";
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const worst = result => (result?.perSeatP20 || []).slice().sort((a,b)=>b.variationDbRaw-a.variationDbRaw)[0];
const crossoverText = (c, hp) => c ? String(hp ? c.frequencyHz : c.subwooferFrequencyHz ?? c.frequencyHz) +
  " Hz · " + (hp ? c.speakerHpSlopeDbPerOct : c.subwooferLpSlopeDbPerOct) + " dB/oct" : "—";

// A view / apply boundary inside the existing ADI workflow, not another optimiser.
// Persisted project metadata carries the confirmed option and restore snapshot.
// Only the normal manual calculation workflow can make an applied result current.
export default function CrossoverRecommendation({
  candidate, diagnostics, shared, appState, instances, commitInstances, onRecalculate, busy,
}) {
  const { authorityState } = useSharedBassAuthorityState();
  const saved = appState?.splConfig?.crossoverRecommendation || null;
  const write = appState?.updateGlobalSpl;
  const live = useRef({shared,instances,appState,authorityState});
  live.current = {shared,instances,appState,authorityState};
  const [applying,setApplying] = useState(false);
  const [error,setError] = useState(null);
  const record = saved;
  useEffect(() => {
    if (!candidate?.integrationVerified || !candidate?.baselineCacheKey || typeof write !== "function") return;
    if (candidate.baselineCacheKey !== shared?.cacheKey) return;
    if (saved?.candidateId === candidate.candidateId && saved?.baselineCacheKey === candidate.baselineCacheKey) return;
    write({ crossoverRecommendation: {
      version:1,candidateId:candidate.candidateId,baselineCacheKey:candidate.baselineCacheKey,
      candidate,baseline:diagnostics?.baseline || null,status:"recommended",
    } });
  }, [candidate,diagnostics,write,shared?.cacheKey,saved?.candidateId,saved?.baselineCacheKey]);

  // A refreshed tab resumes verification from saved settings and the normal
  // published authority. It never marks an unfinished calculation as applied.
  useEffect(() => {
    if (applying || !record?.expectedConfiguration || !["applying","restoring","verification-required"].includes(record.status)) return;
    if (shared?.calculationInProgress || shared?.cacheKey === record.beforeCacheKey) return;
    if (authorityState.code !== "current") return;
    if (!recommendationSettingsMatch(shared?.authoritative, record.expectedConfiguration)) return;
    const restore=record.operation==="restore";
    if (!recommendationResultMatches(shared?.completedBassAuthority,restore?record.baseline:record.candidate)) return;
    write({crossoverRecommendation:{...record,status:restore?"restored":"applied",error:null,appliedCacheKey:shared.cacheKey,verifiedAt:new Date().toISOString()}});
  }, [record,applying,authorityState.code,shared?.cacheKey,shared?.calculationInProgress,shared?.completedBassAuthority,shared?.authoritative,write]);

  if (!record?.candidate) return null;
  const recommended=record.candidate;
  const baseline=record.baseline;
  const stale=["recommended","restored"].includes(record.status) && record.baselineCacheKey!==shared?.cacheKey;
  const pending=applying||busy;
  const limiter=worst(recommended);

  async function commitAndVerify(restore) {
    if (pending || typeof write !== "function" || typeof commitInstances !== "function") return;
    const current=live.current;
    if (!restore && record.baselineCacheKey!==current.shared?.cacheKey) {
      setError("The design has changed. Re-run ADI before applying this recommendation.");return;
    }
    setApplying(true);setError(null);
    const previousCacheKey=current.shared?.cacheKey;
    const previous=record.previousConfiguration || {
      instances:current.instances,
      crossover:current.shared?.authoritative?.crossover,
    };
    const nextRecord={...record,previousConfiguration:previous,status:restore?"restoring":"applying",operation:restore?"restore":"apply",beforeCacheKey:previousCacheKey,error:null};
    try {
      const nextInstances=restore ? previous.instances : applyCalibrationTuning(current.instances,recommended.appliedTuning);
      const nextCrossover=restore ? previous.crossover : recommended.crossover;
      nextRecord.expectedConfiguration={crossover:nextCrossover,tuning:nextInstances.filter(s=>s.enabled!==false).map(s=>({
        sourceId:s.id,gainDb:Number(s.gainDb)||0,delayMs:Number(s.delayMs)||0,phaseControlDeg:Number(s.phaseControlDeg??s.phaseAdjust)||0,polarity:s.polarity,
      }))};
      // Restored manual settings may include automatic distance alignment.
      if(restore)nextRecord.expectedConfiguration.tuning=baseline.appliedTuning.map((t,i)=>({...t,sourceId:t.sourceId||nextRecord.expectedConfiguration.tuning[i]?.sourceId}));
      commitInstances(nextInstances);
      write({crossover:nextCrossover,crossoverRecommendation:nextRecord});
      const queued=await onRecalculate({previousCacheKey});
      if (queued?.action==="blocked") throw new Error("Settings changed, but recalculation could not start. Use Recalculate Bass Results.");
      const started=Date.now();
      let verified=false;
      while(Date.now()-started<120000){
        await delay(150);
        const state=live.current.shared;
        if (["error","timeout","rejected"].includes(state?.calculationOutcome)) throw new Error(state.terminalMessage || "Calculation failed. Previous saved results are preserved.");
        if (state?.cacheKey===previousCacheKey || state?.calculationInProgress) continue;
        const authority=state?.completedBassAuthority;
        if (authority?.authorityStatus!=="AUTHORITATIVE" || authority.contract?.job?.resultFingerprint!==state.cacheKey) continue;
        if (live.current.authorityState.code!=="current") continue;
        const expected=restore?baseline:recommended;
        if (!recommendationSettingsMatch(state.authoritative,nextRecord.expectedConfiguration) ||
            !recommendationResultMatches(authority,expected)) {
          throw new Error("The applied calculation does not reproduce ADI's prediction. Review the result or restore the previous settings.");
        }
        write({crossoverRecommendation:{...nextRecord,status:restore?"restored":"applied",appliedCacheKey:state.cacheKey,verifiedAt:new Date().toISOString()}});
        verified=true;break;
      }
      if (!verified) throw new Error("Waiting for a successfully saved calculation. The recommendation is not yet verified.");
    } catch(e) {
      setError(e.message);
      write({crossoverRecommendation:{...nextRecord,status:"verification-required",error:e.message}});
    } finally {setApplying(false);}
  }

  return <section className="rounded-lg border border-stone-300 bg-white p-3 space-y-3" aria-label="ADI crossover recommendation">
    <div className="font-semibold text-sm">Current Design versus ADI Recommended</div>
    <table className="w-full text-xs">
      <thead><tr><th className="text-left">Setting</th><th>Current Design</th><th>ADI Recommended</th></tr></thead>
      <tbody>
        <tr><td>Speaker high-pass</td><td>{crossoverText(baseline?.crossover,true)}</td><td>{crossoverText(recommended.crossover,true)}</td></tr>
        <tr><td>Subwoofer low-pass</td><td>{crossoverText(baseline?.crossover,false)}</td><td>{crossoverText(recommended.crossover,false)}</td></tr>
        <tr><td>P19 deviation</td><td>{number(baseline?.achievedP19VariationDb)} dB</td><td>{number(recommended.achievedP19VariationDb)} dB</td></tr>
        <tr><td>P20 deviation</td><td>{number(baseline?.achievedP20VariationDb)} dB</td><td>{number(recommended.achievedP20VariationDb)} dB</td></tr>
        <tr><td>P14 headroom</td><td>{number(baseline?.p14HeadroomDb)} dB</td><td>{number(recommended.p14HeadroomDb)} dB</td></tr>
      </tbody>
    </table>
    <table className="w-full text-xs">
      <thead><tr><th className="text-left">Subwoofer</th><th>Gain</th><th>Delay</th><th>Phase</th><th>Polarity</th></tr></thead>
      <tbody>{recommended.appliedTuning?.map((t,i)=><tr key={t.sourceId||i}>
        <td>{t.sourceId || "Sub "+(i+1)}</td><td>{number(t.gainDb)} dB</td><td>{number(t.delayMs)} ms</td>
        <td>{number(t.phaseControlDeg||0)}°</td><td>{t.polarity===180||t.polarity===-1?"Inverted":"Normal"}</td>
      </tr>)}</tbody>
    </table>
    <p className="text-xs">Limiting seat: {limiter?.seatId || "—"} at {number(limiter?.worstFrequencyHz)} Hz.</p>
    <p className="text-xs">{recommended.integrationExplanation}</p>
    <p className="text-xs">Primary-seat change: {number(Math.max(0,...(recommended.perSeatP20||[]).filter(s=>s.isPrimary).map(s=>s.variationDbRaw-(baseline?.perSeatP20?.find(b=>b.seatId===s.seatId)?.variationDbRaw??s.variationDbRaw))))} dB maximum regression.</p>
    {stale && <p className="text-xs text-amber-800">Design changed — re-run ADI before applying.</p>}
    {record.status==="applied" && record.appliedCacheKey===shared?.cacheKey && <p className="text-xs text-green-800">Applied — calculated result verified and saved.</p>}
    {record.status==="restored" && record.appliedCacheKey===shared?.cacheKey && <p className="text-xs text-green-800">Previous settings restored — calculated result verified and saved.</p>}
    {(error||record.error) && <p role="alert" className="text-xs text-red-700">{error||record.error}</p>}
    <div className="flex gap-2">
      <button className="rounded bg-[#213428] px-3 py-2 text-xs text-white disabled:opacity-40" disabled={pending||stale||!["recommended","restored"].includes(record.status)} onClick={()=>commitAndVerify(false)}>
        {applying?"Calculating and saving…":"Apply Recommended Settings"}
      </button>
      {record.previousConfiguration && <button className="rounded border px-3 py-2 text-xs disabled:opacity-40" disabled={pending||record.status==="restored"} onClick={()=>commitAndVerify(true)}>Restore Previous Settings</button>}
    </div>
  </section>;
}

