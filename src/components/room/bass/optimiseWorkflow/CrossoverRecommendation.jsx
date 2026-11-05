import React, { useEffect, useRef, useState } from "react";
import { CheckCircle2, Undo2, Loader2, AlertCircle } from "lucide-react";
import { applyCalibrationTuning } from "../improveBassV2/improveBassV2ApplyCalibration";
import { recommendationResultMatches, recommendationSettingsMatch } from "./crossoverApplicationVerification";
import { buildCrossoverComparison, buildRecommendationSentence, buildTuningComparison, hasSettingChanges } from "./crossoverRecommendationComparison";
import useSharedBassAuthorityState from "../useSharedBassAuthorityState";

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const worst = result => (result?.perSeatP20 || []).slice().sort((a,b)=>b.variationDbRaw-a.variationDbRaw)[0];
const dbText = value => value === null || value === undefined ? null
  : Number.isFinite(Number(value)) ? `±${Math.abs(Number(value)).toFixed(2)} dB` : null;

// RP22 level text — P20 (L1–L4 / FAIL) and P19 (L1–L4 / FAIL). Honest "—" when
// the run did not record a level, never invented.
const p20LevelText = (level) => {
  const upper = String(level ?? "").toUpperCase();
  if (level === 0 || upper === "FAIL") return "FAIL";
  const m = upper.match(/^L?([1-4])$/);
  return m ? `L${m[1]}` : "—";
};
const p19LevelText = (level) => {
  const n = Number(level);
  if (Number.isFinite(n)) return n > 0 ? `L${n}` : "FAIL";
  const m = String(level || "").toUpperCase().match(/^L?([0-4])$/);
  return m ? (Number(m[1]) === 0 ? "FAIL" : `L${m[1]}`) : "—";
};

// "3.00 dB improvement" — a reduction in deviation is an improvement. Null when
// the run did not record both values or the change is not meaningful.
const improvementText = (beforeDb, afterDb) => {
  const before = Number(beforeDb);
  const after = Number(afterDb);
  if (!Number.isFinite(before) || !Number.isFinite(after)) return null;
  const gain = before - after;
  if (gain <= 0.05) return null;
  return `${gain.toFixed(2)} dB improvement`;
};

// "L1" or "L2 → L1" — the level line, maintained or moved. Null when no level.
const levelLine = (beforeLevel, afterLevel, textFn) => {
  const before = beforeLevel != null ? textFn(beforeLevel) : null;
  const after = afterLevel != null ? textFn(afterLevel) : null;
  if (!after) return before ? `${before} maintained` : null;
  if (!before) return after;
  return before === after ? `${after} maintained` : `${before} → ${after}`;
};

// The "Settings now in use" rows — the ACTIVE applied values only, read from
// the applied crossover and tuning. Crossover freq+slope are combined; each
// subwoofer's gain, delay and phase are one row each; polarity is included only
// when the applied value changed it, to keep the list concise.
function buildAppliedSettings(crossoverRows, tuningRows) {
  const byKey = Object.fromEntries((crossoverRows || []).map(r => [r.key, r]));
  const rows = [];
  const speakerHp = [byKey.speakerHz?.afterText, byKey.speakerSlope?.afterText]
    .filter(v => v && v !== "—").join(" · ");
  if (speakerHp) rows.push({ setting: "Speaker high-pass", value: speakerHp });
  const subLp = [byKey.subHz?.afterText, byKey.subSlope?.afterText]
    .filter(v => v && v !== "—").join(" · ");
  if (subLp) rows.push({ setting: "Subwoofer low-pass", value: subLp });
  for (const row of tuningRows || []) {
    const gain = row.cells.find(c => c.key === "gain");
    const del = row.cells.find(c => c.key === "delay");
    const phase = row.cells.find(c => c.key === "phase");
    const polarity = row.cells.find(c => c.key === "polarity");
    if (gain?.afterText && gain.afterText !== "—") rows.push({ setting: `${row.label} gain`, value: gain.afterText });
    if (del?.afterText && del.afterText !== "—") rows.push({ setting: `${row.label} delay`, value: del.afterText });
    if (phase?.afterText && phase.afterText !== "—") rows.push({ setting: `${row.label} phase`, value: phase.afterText });
    if (polarity?.changed && polarity.afterText && polarity.afterText !== "—") rows.push({ setting: `${row.label} polarity`, value: polarity.afterText });
  }
  return rows;
}

// One performance metric card. Green values only for an applied/verified state;
// neutral for pending.
function MetricCard({ label, afterText, beforeText, footLine, applied }) {
  const valueColour = applied ? "#213428" : "#1B1A1A";
  const footColour = applied ? "#213428" : "#625143";
  return (
    <div className="rounded-lg border border-[#E5E7EB] bg-white px-3 py-2.5" data-adi-metric-card={label}>
      <div className="text-[11px] font-medium text-[#757575] leading-tight">{label}</div>
      <div className="mt-1 text-[22px] font-bold leading-none" style={{ color: valueColour }}>
        {afterText || "—"}
      </div>
      {beforeText && (
        <div className="mt-1 text-[11px] text-[#757575] leading-tight">Previously {beforeText}</div>
      )}
      {footLine && (
        <div className="mt-0.5 text-[11px] font-medium leading-tight" style={{ color: footColour }}>{footLine}</div>
      )}
    </div>
  );
}

// A view / apply boundary inside the existing ADI workflow, not another optimiser.
// Persisted project metadata carries the confirmed option and restore snapshot.
// Only the normal manual calculation workflow can make an applied result current.
//
// THREE STATES (one result component):
//   1. Pending recommendation  — "ADI recommendation", neutral predicted cards,
//      Apply + Ignore, identified as predicted.
//   2. Applied and verified    — "Bass optimisation applied", green confirmed
//      results, "Settings now in use" (active values only), Restore Previous.
//   3. Automatically applied by ADI — the same verified layout, "Applied by ADI".
//
// Engineering integrity is unchanged: the apply/restore/verify logic, the
// comparison builders, the result-match verification and the persisted record
// are all preserved. Only the presentation is restructured.
export default function CrossoverRecommendation({
  candidate, diagnostics, shared, appState, instances, commitInstances, onRecalculate, busy,
  receiptState, onOperationChange, projectId, producingPlan,
}) {
  const { authorityState } = useSharedBassAuthorityState();
  const saved = appState?.splConfig?.crossoverRecommendation || null;
  const write = appState?.updateGlobalSpl;
  const live = useRef({shared,instances,appState,authorityState});
  live.current = {shared,instances,appState,authorityState};
  const [applying,setApplying] = useState(false);
  const [error,setError] = useState(null);
  const versionId = appState?.activeVersionId || null;
  const record = saved;
  useEffect(() => {
    if (!candidate?.integrationVerified || !candidate?.baselineCacheKey || typeof write !== "function") return;
    if (candidate.baselineCacheKey !== shared?.cacheKey) return;
    if (saved?.candidateId === candidate.candidateId && saved?.baselineCacheKey === candidate.baselineCacheKey) return;
    write({ crossoverRecommendation: {
      version:1,versionId,runId:producingPlan?.run?.runId || null,candidateId:candidate.candidateId,baselineCacheKey:candidate.baselineCacheKey,
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
    setError(null);
    write({crossoverRecommendation:{...record,status:restore?"restored":"applied",error:null,appliedCacheKey:shared.cacheKey,verifiedAt:new Date().toISOString()}});
  }, [record,applying,authorityState.code,shared?.cacheKey,shared?.calculationInProgress,shared?.completedBassAuthority,shared?.authoritative,write]);

  if (!record?.candidate || !receiptState?.ownsPanel) return null;
  // Only this version's own recommendation for the CURRENT design is shown.
  // An inherited, other-version or outdated recommendation hides the whole table.
  if (record.versionId && record.versionId !== versionId) return null;

  const recommended=record.candidate;
  const baseline=record.baseline;
  const cacheKey=shared?.cacheKey;
  const authorityCurrent = authorityState.code === "current";

  // ── State determination ──
  const dismissed = record.status === "dismissed";
  // The design still carries the applied snapshot when the current cache key
  // matches the one that was verified at apply time. This stays true during a
  // same-design re-calculation (the authority may briefly not be "current"
  // while it re-verifies); only the Verified badge waits for the authority.
  const appliedCacheMatches = record.status === "applied"
    && record.appliedCacheKey === cacheKey;
  const verifiedApplied = appliedCacheMatches && authorityCurrent;
  const appliedByAdi = verifiedApplied && record.autoApplied === true;
  const appliedStale = record.status === "applied" && !appliedCacheMatches;
  const staleRecommended = ["recommended","restored"].includes(record.status) && record.baselineCacheKey !== cacheKey;
  const restoredVerified = record.status === "restored"
    && record.appliedCacheKey === cacheKey && authorityCurrent;

  // Dismissed (designer ignored) or a recommendation for a different design
  // hides the panel entirely.
  if (dismissed) return null;
  if (staleRecommended) return null;

  const pending = applying || busy;
  const limiter=worst(recommended);

  // The compared settings — used both for the pending sentence and the applied
  // "Settings now in use" list (which reads the afterText of each row).
  const crossoverRows=buildCrossoverComparison({baselineCrossover:baseline?.crossover,recommendedCrossover:recommended.crossover});
  const tuningRows=buildTuningComparison({baselineTuning:baseline?.appliedTuning,recommendedTuning:recommended.appliedTuning});
  const willChange=hasSettingChanges({crossoverRows,tuningRows});
  const recommendationSentence=buildRecommendationSentence({
    crossoverRows,tuningRows,limitingFrequencyHz:limiter?.worstFrequencyHz ?? null,
    p20BeforeDb:baseline?.achievedP20VariationDb ?? null,p20AfterDb:recommended.achievedP20VariationDb ?? null,
  });

  // P19 / P20 before-and-after. In the verified state the authority reproduces
  // the recommended result (recommendationResultMatches), so the recommended
  // values ARE the verified actuals — no figure is invented.
  const p20AfterText = dbText(recommended.achievedP20VariationDb);
  const p20BeforeText = dbText(baseline?.achievedP20VariationDb);
  const p19AfterText = dbText(recommended.achievedP19VariationDb);
  const p19BeforeText = dbText(baseline?.achievedP19VariationDb);
  const p20Improvement = improvementText(baseline?.achievedP20VariationDb, recommended.achievedP20VariationDb);
  const p20LevelLine = levelLine(baseline?.achievedP20Level, recommended.achievedP20Level, p20LevelText);
  const p19LevelLine = levelLine(baseline?.achievedP19Level, recommended.achievedP19Level, p19LevelText);

  async function commitAndVerify(restore) {
    if (pending || !receiptState?.ownsPanel || (!restore && !receiptState.canApply) || typeof write !== "function" || typeof commitInstances !== "function") return;
    const current=live.current;
    if (!restore && record.baselineCacheKey!==current.shared?.cacheKey) {
      setError("The design has changed. Re-run ADI before applying this recommendation.");return;
    }
    setApplying(true);setError(null);
    onOperationChange?.({projectId,versionId,candidateId:record.candidateId,baselineCacheKey:record.baselineCacheKey,kind:restore?"restore":"apply"});
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
    } finally {setApplying(false);onOperationChange?.(null);}
  }

  function handleIgnore() {
    if (typeof write !== "function") return;
    setError(null);
    write({ crossoverRecommendation: { ...record, status: "dismissed", error: null } });
  }

  function handleRestore() {
    if (!record.previousConfiguration || pending) return;
    commitAndVerify(true);
  }

  // ── STATE 2 / 3: Applied (designer or ADI) ──
  // The card is shown while the design still carries the applied snapshot. The
  // badge states "Verified" only once the authoritative calculation is current;
  // during a same-design re-calculation it states "Recalculating…" so a verified
  // result is never claimed before the authority has caught up.
  if (appliedCacheMatches) {
    const appliedSettings = buildAppliedSettings(crossoverRows, tuningRows);
    const badgeLabel = appliedByAdi
      ? "Applied by ADI"
      : (verifiedApplied ? "Verified" : "Recalculating…");
    const title = appliedByAdi ? "Bass optimisation applied by ADI" : "Bass optimisation applied";
    const subtitle = appliedByAdi
      ? "Crossover, subwoofer levels, delay and phase applied by ADI and verified."
      : "Crossover, subwoofer levels, delay and phase adjusted by ADI.";
    return (
      <section
        className="rounded-lg border border-[#E5E7EB] bg-white p-4 space-y-4"
        aria-label="ADI crossover recommendation applied"
        data-adi-crossover-state="applied"
        data-adi-applied-by-adi={appliedByAdi ? "true" : undefined}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            <CheckCircle2 className="h-5 w-5 text-[#213428] mt-0.5 shrink-0" />
            <div className="min-w-0">
              <div className="text-[15px] font-bold text-[#111827] leading-snug">{title}</div>
              <div className="text-[12px] text-[#757575] leading-relaxed">{subtitle}</div>
            </div>
          </div>
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide"
            style={{ background: "#E8F0EC", color: "#213428", border: "1px solid #213428" }}
            data-adi-applied-badge={appliedByAdi ? "adi" : "verified"}
          >
            {badgeLabel}
          </span>
        </div>

        {/* The performance improvements — the main visual feature. */}
        <div className="grid grid-cols-2 gap-2.5">
          <MetricCard
            label="P20 · Worst-seat variation"
            afterText={p20AfterText}
            beforeText={p20BeforeText}
            footLine={[p20Improvement, p20LevelLine].filter(Boolean).join(" · ") || p20LevelLine || null}
            applied
          />
          <MetricCard
            label="P19 · RSP response"
            afterText={p19AfterText}
            beforeText={p19BeforeText}
            footLine={p19LevelLine}
            applied
          />
        </div>

        {/* Settings now in use — only the active applied values. */}
        {appliedSettings.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[12px] font-semibold text-[#111827]">Settings now in use</div>
            <div className="overflow-hidden rounded-md border border-[#E5E7EB]">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-[#F7F6F3] text-[10px] font-semibold uppercase tracking-wide text-[#625143]">
                    <th className="px-3 py-1.5">Setting</th>
                    <th className="px-3 py-1.5">Applied value</th>
                  </tr>
                </thead>
                <tbody>
                  {appliedSettings.map((row, i) => (
                    <tr key={`${row.setting}-${i}`} className="border-t border-[#EFEDE8] text-[12px]">
                      <td className="px-3 py-1.5 font-medium text-[#111827]">{row.setting}</td>
                      <td className="px-3 py-1.5 text-[#3E4349]">{row.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="text-[11px] text-[#757575] leading-relaxed">
            Previous settings remain available for restoration.
          </div>
          {record.previousConfiguration && (
            <button
              type="button"
              onClick={handleRestore}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#D9D5CE] bg-white px-3 py-2 text-[12px] font-semibold text-[#213428] transition-colors hover:border-[#213428] disabled:opacity-40"
              data-adi-restore-previous="true"
            >
              <Undo2 className="h-3.5 w-3.5" />
              Restore Previous Settings
            </button>
          )}
        </div>
      </section>
    );
  }

  // ── Applied but stale: the design changed since this was applied. The
  // verified state is removed; the current calculation status owns the panel
  // (stated by the journey card). A restore stays available so the designer can
  // return to the pre-optimisation settings. ──
  if (appliedStale) {
    return (
      <section
        className="rounded-lg border border-[#E5E7EB] bg-white p-3 space-y-2"
        aria-label="ADI crossover recommendation stale"
        data-adi-crossover-state="applied-stale"
      >
        <div className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-[#4A230F] mt-0.5 shrink-0" />
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-[#1B1A1A]">
              This optimisation is no longer verified
            </div>
            <div className="text-[11px] text-[#625143] leading-relaxed">
              The design has changed since the bass optimisation was applied, so the verified result
              no longer matches. Re-run ADI against the current design, or restore the previous settings.
            </div>
          </div>
        </div>
        {record.previousConfiguration && (
          <button
            type="button"
            onClick={handleRestore}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#D9D5CE] bg-white px-3 py-2 text-[12px] font-semibold text-[#213428] transition-colors hover:border-[#213428] disabled:opacity-40"
            data-adi-restore-previous="true"
          >
            <Undo2 className="h-3.5 w-3.5" />
            Restore Previous Settings
          </button>
        )}
      </section>
    );
  }

  // ── STATE 1: Pending recommendation ──
  // Covers "recommended", "restored" (returned to pending after a restore) and
  // the transient applying/restoring/verification-required states. Neutral
  // colours; results identified as predicted, not yet applied.
  const isRestoredPending = restoredVerified;
  const isWorking = receiptState.operationActive === true;
  const showApply = receiptState.canApply;
  const showIgnore = record.status === "recommended";
  const displayError = error || record.error || null;

  return (
    <section
      className="rounded-lg border border-[#E5E7EB] bg-white p-4 space-y-3"
      aria-label="ADI crossover recommendation"
      data-adi-crossover-state="pending"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[15px] font-bold text-[#111827] leading-snug">ADI recommendation</div>
          <div className="text-[12px] text-[#757575] leading-relaxed">
            {isRestoredPending
              ? "Previous settings restored. The recommendation below is available to apply again."
              : isWorking ? "The selected settings are being calculated and saved."
              : receiptState.state === "verification-required" ? "Apply is no longer running. Recalculate Bass Results to verify the saved settings."
              : "A combined crossover and subwoofer integration improvement is available for approval."}
          </div>
        </div>
        <span
          className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide bg-[#F1F0EE] text-[#3E4349] border border-[#DCDBD6]"
          data-adi-pending-badge="true"
        >
          {isWorking ? (receiptState.state === "restoring" ? "Restoring" : "Applying") : receiptState.state === "verification-required" ? "Verification required" : "Awaiting approval"}
        </span>
      </div>

      {/* What ADI recommends, in one sentence. */}
      <p className="text-[12px] text-[#3E4349] leading-relaxed" data-adi-recommendation-sentence="true">
        {recommendationSentence}
      </p>

      {/* Predicted before/after performance cards — neutral colours. */}
      <div className="grid grid-cols-2 gap-2.5">
        <MetricCard
          label="P20 · Worst-seat variation"
          afterText={p20AfterText}
          beforeText={p20BeforeText}
          footLine={[p20Improvement, p20LevelLine].filter(Boolean).join(" · ") || p20LevelLine || null}
          applied={false}
        />
        <MetricCard
          label="P19 · RSP response"
          afterText={p19AfterText}
          beforeText={p19BeforeText}
          footLine={p19LevelLine}
          applied={false}
        />
      </div>
      <div className="text-[11px] text-[#757575] leading-relaxed">
        Predicted outcome, pending application and recalculation.
      </div>

      {recommended.integrationExplanation && (
        <p className="text-[11px] text-[#625143] leading-relaxed">{recommended.integrationExplanation}</p>
      )}

      {displayError && (
        <p role="alert" className="text-[11px] text-red-700 leading-relaxed" data-adi-crossover-error="true">
          {displayError}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {showApply && (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md bg-[#213428] px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-[#3E4349] disabled:opacity-40"
            disabled={pending || staleRecommended || !willChange}
            onClick={() => commitAndVerify(false)}
            data-adi-apply-recommended="true"
          >
            {isWorking ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Calculating and saving…
              </>
            ) : (
              "Apply Recommended Settings"
            )}
          </button>
        )}
        {showIgnore && (
          <button
            type="button"
            onClick={handleIgnore}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#D9D5CE] bg-white px-3 py-2 text-[12px] font-semibold text-[#213428] transition-colors hover:border-[#213428] disabled:opacity-40"
            data-adi-ignore-recommendation="true"
          >
            Ignore
          </button>
        )}
      </div>
    </section>
  );
}