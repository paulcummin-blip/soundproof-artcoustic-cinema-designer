import React, { useState } from "react";
import LiveHouseCurveDiagnostics from "@/components/room/bass/LiveHouseCurveDiagnostics";
import { buildCandidateSignature, signatureToString } from "@/components/room/bass/candidateConsistency";

const level = (value) => value > 0 ? `L${value}` : "FAIL";
const fmt = (value, unit = "") => Number.isFinite(value) ? `${value.toFixed(1)}${unit}` : "—";
const fmtMs = (value) => Number.isFinite(value) ? value.toFixed(0) : "—";

export default function BassOptimiserValidationPanel({ result, priorityMode, onPriorityModeChange, activeSubs, usableLfHz, perSeatRawCurves, rspRawCurve, includeDiagnostics = false }) {
  const [fitterDiagnosticsOpen, setFitterDiagnosticsOpen] = useState(false);
  const [showAllRevisions, setShowAllRevisions] = useState(false);
  if (!result) return null;
  return <details className="mt-3 rounded border border-emerald-300 bg-emerald-50 p-3 text-xs" open>
    <summary className="cursor-pointer font-semibold text-emerald-900">{result.isBestCalibratedAttempt ? "BEST CALIBRATED ATTEMPT — LEVEL 1 NOT ACHIEVED" : "BASS OPTIMISER VALIDATION ACTIVE"}</summary>
    <LiveHouseCurveDiagnostics
      result={result}
      activeSubs={activeSubs}
      usableLfHz={usableLfHz}
      perSeatRawCurves={perSeatRawCurves}
      rspRawCurve={rspRawCurve}
    />
    {result?.selectedCandidate && (() => {
      const sig = buildCandidateSignature({ result, rspRawCurve });
      if (!sig) return null;
      return (
        <div className="mt-1 rounded border border-slate-300 bg-slate-50 p-2 font-mono text-[9px] text-slate-700 break-all">
          <span className="font-semibold text-slate-900">Candidate signature: </span>{signatureToString(sig)}
        </div>
      );
    })()}
    <label className="mt-2 flex w-fit items-center gap-2 font-mono text-[10px] text-emerald-950">Priority mode
      <select value={priorityMode} onChange={(event) => onPriorityModeChange(event.target.value)} className="rounded border border-emerald-300 bg-white px-2 py-1">
        <option value="balanced">Balanced</option><option value="house_curve_accuracy">House-curve accuracy</option><option value="depth">Depth priority</option><option value="spl">SPL priority</option>
      </select>
    </label>
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-emerald-950">
      <span>P14 {result.achievedP14Level} ({fmt(result.achievedP14Db, " dB")})</span><span>P18 {result.achievedP18Level} ({fmt(result.achievedP18FrequencyHz, " Hz")})</span><span>P19 {result.achievedP19Level} (±{fmt(result.achievedP19VariationDb, " dB")})</span>
    </div>
    {(() => {
      // Part G: Profile contract diagnostics — safe optional access so stale or
      // incomplete results cannot crash the panel.
      const profileId = result.selectedFitProfile || result.selectedCandidate?.designEqFitProfile || "standard";
      const cfg = result.selectedFitProfileConfig || result.selectedCandidate?.designEqFitProfileConfig || null;
      const preserveP14 = cfg?.preserveP14 ?? (profileId !== "accuracy");
      const fittingTol = cfg?.fittingToleranceDb ?? (profileId === "accuracy" ? 1 : 2);
      const maxCut = cfg?.maximumCutDb ?? (profileId === "accuracy" ? 15 : 10);
      const maxBoost = cfg?.maximumAggregateBoostDb ?? 6;
      const reqP19Tol = result.requestedP19ToleranceDb ?? result.selectedCandidate?.requestedP19ToleranceDb ?? null;
      const profileLabel = profileId === "accuracy" ? "Accuracy" : "Standard";
      return <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-slate-700">
        <span>Selected fit profile: <strong className="text-slate-900">{profileLabel}</strong></span>
        <span>P14 preservation: <strong className={preserveP14 ? "text-emerald-700" : "text-amber-700"}>{preserveP14 ? "Yes" : "No"}</strong></span>
        <span>Profile fitting tolerance: <strong className="text-slate-900">±{fmt(fittingTol, " dB")}</strong></span>
        <span>Requested P19 tolerance: <strong className="text-slate-900">{Number.isFinite(reqP19Tol) ? `±${reqP19Tol.toFixed(1)} dB` : "—"}</strong></span>
        <span>Max permitted cut: <strong className="text-slate-900">−{fmt(maxCut, " dB")}</strong></span>
        <span>Max permitted boost: <strong className="text-slate-900">+{fmt(maxBoost, " dB")}</strong></span>
      </div>;
    })()}
    {result.selectedCandidate && (() => {
      const c = result.selectedCandidate;
      const seatLevel = c.worstRealSeatHouseCurveLevel > 0 ? `L${c.worstRealSeatHouseCurveLevel}` : "FAIL";
      const p20Text = c.p20Available ? (c.achievedP20Level > 0 ? `L${c.achievedP20Level}` : "FAIL") : "N/A";
      return <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-slate-700">
        <span>Official P19 (RSP): {result.achievedP19Level} (±{fmt(result.achievedP19VariationDb, " dB")})</span>
        <span>Worst-seat house-curve deviation (P19-equivalent): {seatLevel} (±{fmt(c.worstRealSeatHouseCurveVariationDb, " dB")}) @ {c.worstRealSeatHouseCurveSeatId || "—"}</span>
        <span>P20: {p20Text}{c.p20Available ? ` (±${fmt(c.achievedP20VariationDb, " dB")}) @ ${c.worstP20SeatId || "—"}` : ""}</span>
      </div>;
    })()}
    {result.selectionReason && <div className="mt-1 font-mono text-[10px] text-slate-600">Selection: {result.selectionReason}</div>}
    {includeDiagnostics && result.selectionDiagnostics && (
      <div className="mt-1 font-mono text-[10px] text-slate-600">
        Eligibility: {result.selectionDiagnostics.eligibilityGroup} | Tuple: [{result.selectionDiagnostics.rankingTuple.join(", ")}] | Signature: {result.selectionDiagnostics.selectedCandidateSignature} | Heavy pool reused: {result.selectionDiagnostics.heavyPoolReused ? "Yes" : "No"} | Worker started: {result.selectionDiagnostics.workerStarted ? "Yes" : "No"}
      </div>
    )}
    {(() => {
      const allCandidates = Array.isArray(result.candidates) ? result.candidates : [];
      const credible = allCandidates.filter((c) => Number.isFinite(c.achievedP19VariationDb));
      const bestStd = credible.filter((c) => (c.designEqFitProfile || "standard") === "standard").sort((a, b) => a.achievedP19VariationDb - b.achievedP19VariationDb)[0];
      const bestHc = credible.filter((c) => c.designEqFitProfile === "house_curve").sort((a, b) => a.achievedP19VariationDb - b.achievedP19VariationDb)[0];
      const sel = result.selectedCandidate;
      const selProfile = sel ? (sel.designEqFitProfile || "standard") : "—";
      const selP19 = sel && Number.isFinite(sel.achievedP19VariationDb) ? `±${sel.achievedP19VariationDb.toFixed(1)} dB` : "—";
      return <div className="mt-1 font-mono text-[10px] text-slate-600">
        Best Standard accuracy: {bestStd ? `±${bestStd.achievedP19VariationDb.toFixed(1)} dB` : "—"} | Best house-curve accuracy: {bestHc ? `±${bestHc.achievedP19VariationDb.toFixed(1)} dB` : "—"} | Selected: {selProfile} {selP19}
      </div>;
    })()}
    {result.selectedCandidate && (() => {
      const c = result.selectedCandidate;
      const abl = c.aggregateBankLimits || {};
      return <div className="mt-1 font-mono text-[10px] text-slate-600">
        Bank limits — Max boost: <strong className="text-slate-900">{fmt(abl.maxAggregateBoostDb, " dB")} @ {fmt(abl.maxAggregateBoostHz, " Hz")}</strong> | Max cut: <strong className="text-slate-900">{fmt(abl.maxAggregateCutDb, " dB")} @ {fmt(abl.maxAggregateCutHz, " Hz")}</strong> | Validation: <strong className={abl.allOk === true ? "text-emerald-700" : abl.allOk === false ? "text-rose-700" : "text-slate-500"}>{abl.allOk === true ? "PASS" : abl.allOk === false ? "FAIL" : "—"}</strong>
      </div>;
    })()}
    {result.selectedCandidate?.designEqFitProfile === "house_curve" && (() => {
      const c = result.selectedCandidate;
      const hbl = c.houseCurveBankLimits || {};
      const psm = Array.isArray(c.perSeatMetrics) ? c.perSeatMetrics : [];
      const baselineDev = c.houseCurveBaselineWorstSeatDeviation;
      const worstDev = c.worstSeatMaxDeviationDb;
      const diff = (Number.isFinite(baselineDev) && Number.isFinite(worstDev)) ? (worstDev - baselineDev).toFixed(1) : "—";
      return <details className="mt-2 rounded border border-indigo-300 bg-indigo-50 p-2 text-[10px]" open>
        <summary className="cursor-pointer font-mono font-semibold text-indigo-900">House-curve seat-aware diagnostics</summary>
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[10px] text-slate-700">
          <span>Objective: <strong className="text-slate-900">Worst-seat house-curve accuracy</strong></span>
          <span>Official RSP P19: <strong className="text-slate-900">{result.achievedP19Level} (±{fmt(c.achievedP19VariationDb, " dB")})</strong></span>
          <span>Worst-seat house-curve deviation (P19-equivalent): <strong className="text-slate-900">{level(c.worstSeatP19Level || 0)} (±{fmt(c.worstSeatMaxDeviationDb, " dB")}) @ {c.worstSeatId || "—"}</strong></span>
          <span>Mean seat max dev: <strong className="text-slate-900">{fmt(c.meanSeatMaxDeviationDb, " dB")}</strong></span>
          <span>RMS seat target error: <strong className="text-slate-900">{fmt(c.rmsSeatTargetErrorDb, " dB")}</strong></span>
          <span>Selected filters: <strong className="text-slate-900">{c.designEqSelectedCheckpoint?.enabledFilterCount ?? "—"}</strong></span>
          <span>Max aggregate boost: <strong className="text-slate-900">{fmt(hbl.maxAggregateBoostDb, " dB")} @ {fmt(hbl.maxAggregateBoostHz, " Hz")}</strong></span>
          <span>Max aggregate cut: <strong className="text-slate-900">{fmt(hbl.maxAggregateCutDb, " dB")} @ {fmt(hbl.maxAggregateCutHz, " Hz")}</strong></span>
          <span>Diff from Standard baseline: <strong className={Number.isFinite(diff) && Number(diff) <= 0 ? "text-emerald-700" : "text-amber-700"}>{diff} dB</strong></span>
          <span>Limiting reason: <strong className="text-slate-900">{c.houseCurveLimitingReason || "—"}</strong></span>
          <span>Stop reason: <strong className="text-slate-900">{c.houseCurveStopReason || "—"}</strong></span>
        </div>
        {psm.length > 0 && (
          <div className="mt-2 overflow-x-auto">
            <div className="font-mono text-[10px] font-semibold text-slate-700 mb-1">Per-seat house-curve deviation</div>
            <table className="min-w-[500px] text-right font-mono text-[10px] text-slate-700">
              <thead className="border-b border-slate-300 text-slate-500"><tr>{["Seat", "Max dev", "RMS dev", "Worst Hz", "Level"].map((l) => <th className="px-2 py-1" key={l}>{l}</th>)}</tr></thead>
              <tbody>{psm.map((s) => {
                const lvl = s.maxAbsDeviationDb <= 2 ? 4 : s.maxAbsDeviationDb <= 3 ? 3 : s.maxAbsDeviationDb <= 4 ? 2 : s.maxAbsDeviationDb <= 5 ? 1 : 0;
                return <tr className="border-b border-slate-200" key={s.seatId}><td className="px-2 py-1 font-semibold text-left">{s.seatId}{s.isPrimary ? " (RSP)" : ""}</td><td className="px-2 py-1">±{fmt(s.maxAbsDeviationDb, " dB")}</td><td className="px-2 py-1">{fmt(s.rmsDeviationDb, " dB")}</td><td className="px-2 py-1">{fmt(s.worstFrequencyHz, " Hz")}</td><td className="px-2 py-1"><strong className={lvl > 0 ? "text-emerald-700" : "text-rose-700"}>{level(lvl)}</strong></td></tr>;
              })}</tbody>
            </table>
          </div>
        )}
      </details>;
    })()}
    {result.priorityRerankTimeMs != null && <div className="mt-1 font-mono text-[10px] text-slate-600">Priority rerank: {fmtMs(result.priorityRerankTimeMs)} ms | Heavy pool reused: {result.heavyPoolReused ? "Yes" : "No"} | Pool: {result.physicallyCredibleCount ?? 0} credible / {result.requestedEnvelopeValidCount ?? 0} valid / {result.generatedCandidateCount ?? 0} generated</div>}
    {result.performanceSummary && (
      <div className="mt-1 font-mono text-[10px] text-slate-500">
        Optimiser: {fmtMs(result.performanceSummary.totalOptimiserTimeMs)} ms | Requests: {result.performanceSummary.requestCount ?? 0} × {result.performanceSummary.profileCount ?? 2} profiles | Core fits: {result.performanceSummary.uniqueCoreFitCount ?? 0} (Standard: {result.performanceSummary.standardFitCount ?? 0}, Accuracy: {result.performanceSummary.accuracyFitCount ?? 0}) | Core time: {fmtMs(result.performanceSummary.coreFitTimeMs)} ms | Diagnostic refit: {fmtMs(result.performanceSummary.selectedDiagnosticFitTimeMs)} ms (included in core fits) | Revisions: {result.performanceSummary.selectedRevisionCandidateCount ?? 0} | Bank evals: {result.performanceSummary.completedBankEvaluationCount ?? 0}
      </div>
    )}
    <div className="mt-2 overflow-x-auto">
      <table className="min-w-[900px] text-right font-mono text-[10px] text-slate-700">
        <thead className="border-b border-slate-300 text-slate-500"><tr>{["Requested P14", "Requested P18", "Requested P19", "Profile", "Achieved P14", "Achieved P18", "Achieved P19", "Valid band", "Valid", "Selected"].map((label) => <th className="px-2 py-1" key={label}>{label}</th>)}</tr></thead>
        <tbody>{(Array.isArray(result.displayCandidates) ? result.displayCandidates : []).map((candidate) => {
          const selected = candidate === result.selectedCandidate;
          const profileLabel = (candidate.designEqFitProfile || "standard") === "accuracy" ? "Acc" : "Std";
          return <tr className="border-b border-slate-200" key={`${candidate.requestedP14Level}-${candidate.requestedP18Level}-${candidate.requestedP19Level}-${candidate.designEqFitProfile || "standard"}`}><td className="px-2 py-1 font-semibold">{candidate.requestedP14Level}</td><td className="px-2 py-1">{candidate.requestedP18Level}</td><td className="px-2 py-1">{candidate.requestedP19Level}</td><td className="px-2 py-1"><strong className={profileLabel === "Acc" ? "text-indigo-700" : "text-slate-600"}>{profileLabel}</strong></td><td className="px-2 py-1">{level(candidate.achievedP14Level)} · {fmt(candidate.achievedP14Db, " dB")}</td><td className="px-2 py-1">{level(candidate.achievedP18Level)} · {fmt(candidate.achievedP18FrequencyHz, " Hz")}</td><td className="px-2 py-1">{level(candidate.achievedP19Level)} · ±{fmt(candidate.achievedP19VariationDb, " dB")}</td><td className="px-2 py-1">{fmt(candidate.assessmentStartHz, " Hz")}–{fmt(candidate.assessmentEndHz, " Hz")}</td><td className="px-2 py-1">{candidate.meetsRequestedEnvelope ? "Yes" : "No"}</td><td className="px-2 py-1">{selected ? "Yes" : "—"}</td></tr>;
        })}</tbody>
      </table>
    </div>
    {result.selectedCandidate?.rejectionReason && <div className="mt-2 font-mono text-[10px] text-amber-900">Rejected: {result.selectedCandidate.rejectionReason}</div>}
    {result.warningMessage && <div className="mt-2 font-medium text-amber-900">Warning: {result.warningMessage}</div>}
    {(() => {
      const candidate = result.selectedCandidate;
      const checkpoint = candidate?.designEqSelectedCheckpoint;
      const trace = Array.isArray(candidate?.designEqIterationTrace) ? candidate.designEqIterationTrace : [];
      if (!checkpoint) return null;
      return (
        <details className="mt-2 rounded border border-slate-300 bg-slate-50 p-2 text-[10px]" open={fitterDiagnosticsOpen} onToggle={(e) => setFitterDiagnosticsOpen(e.currentTarget.open)}>
          <summary className="cursor-pointer font-mono font-semibold text-slate-700">Design EQ fitter diagnostics (selected candidate)</summary>
          {fitterDiagnosticsOpen && (
          <>
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[10px] text-slate-700">
            <span>Stop reason: <strong className="text-slate-900">{candidate.designEqStopReason || "—"}</strong></span>
            <span>Generated iterations: <strong className="text-slate-900">{trace.length}</strong></span>
            <span>Returned filters: <strong className="text-slate-900">{checkpoint.enabledFilterCount}</strong></span>
            <span>Selected checkpoint: <strong className="text-slate-900">{(() => { const summaries = Array.isArray(candidate?.designEqCheckpointSummaries) ? candidate.designEqCheckpointSummaries : []; const idx = summaries.findIndex((r) => r.selected); return idx >= 0 ? `#${idx}` : "—"; })()}</strong></span>
            <span>Max abs deviation: <strong className="text-slate-900">{fmt(checkpoint.maximumAbsoluteDeviationDb, " dB")}</strong></span>
            <span>RMS deviation: <strong className="text-slate-900">{fmt(checkpoint.rmsDeviationDb, " dB")}</strong></span>
            <span>Worst residual: <strong className="text-slate-900">{fmt(checkpoint.worstResidualFrequencyHz, " Hz")}</strong></span>
            <span>Raw minimum SPL: <strong className="text-slate-900">{fmt(checkpoint.rawMinimumSpl, " dB")}</strong></span>
            <span>P14 assessment minimum (1/3 octave): <strong className="text-slate-900">{fmt(checkpoint.p14MinimumSpl, " dB")}</strong></span>
            <span>Official P14: <strong className="text-slate-900">{fmt(candidate.achievedP14Db, " dB")}</strong></span>
            <span>Checkpoint/P14 delta: <strong className={Math.abs(candidate.p14CheckpointDeltaDb ?? 999) <= 0.05 ? "text-emerald-700" : "text-amber-700"}>{fmt(candidate.p14CheckpointDeltaDb, " dB")}</strong></span>
            <span>P14-safe: <strong className={checkpoint.p14Safe ? "text-emerald-700" : "text-rose-700"}>{checkpoint.p14Safe ? "Yes" : "No"}</strong></span>
            <span>Broad below-target worsening: <strong className={checkpoint.broadBelowTargetWorsening ? "text-rose-700" : "text-emerald-700"}>{checkpoint.broadBelowTargetWorsening ? "Yes" : "No"}</strong></span>
          </div>
          {(() => {
            const bd = candidate?.designEqBankDiagnostics;
            const summaries = Array.isArray(candidate?.designEqCheckpointSummaries) ? candidate.designEqCheckpointSummaries : [];
            const worstResiduals = Array.isArray(candidate?.designEqWorstResidualDiagnostics) ? candidate.designEqWorstResidualDiagnostics : [];
            const reason = candidate?.designEqSelectionReason;
            const sbl = bd?.selectedBankLimits;
            const revDiag = candidate?.designEqRevisionDiagnostics;
            const revisionAttempts = Array.isArray(revDiag?.attempts) ? revDiag.attempts : [];
            const REVISION_ROW_LIMIT = 25;
            const visibleRevisions = showAllRevisions ? revisionAttempts : revisionAttempts.slice(0, REVISION_ROW_LIMIT);
            return (
              <div className="mt-2 border-t border-slate-300 pt-2">
                {reason && <div className="mb-2 font-mono text-[10px] text-slate-800"><strong>Selection reason:</strong> {reason}</div>}
                {sbl && (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[10px] text-slate-700">
                    <span>Selected bank max boost: <strong className="text-slate-900">{fmt(sbl.maxAggregateBoostDb, " dB")} @ {fmt(sbl.maxAggregateBoostHz, " Hz")}</strong></span>
                    <span>Selected bank max cut: <strong className="text-slate-900">{fmt(sbl.maxAggregateCutDb, " dB")} @ {fmt(sbl.maxAggregateCutHz, " Hz")}</strong></span>
                    <span>Selected bank permitted boost: <strong className="text-slate-900">{fmt(sbl.limitingPermittedBoostDb, " dB")}</strong></span>
                    <span>Selected same-region count: <strong className={sbl.sameRegionFilterCount <= 2 ? "text-emerald-700" : "text-rose-700"}>{sbl.sameRegionFilterCount}</strong></span>
                  </div>
                )}
                {bd && (
                  <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[10px] text-slate-500">
                    <span>Evaluated variants scaled by bank limit: <strong className="text-slate-700">{bd.evaluatedVariantsScaledByBankLimit}</strong></span>
                    <span>Evaluated variants rejected by bank limit: <strong className="text-slate-700">{bd.evaluatedVariantsRejectedByBankLimit}</strong></span>
                    <span>Evaluated variants rejected as near duplicates: <strong className="text-slate-700">{bd.evaluatedVariantsRejectedAsNearDuplicates}</strong></span>
                    <span>Evaluated variants rejected by same-region guard: <strong className="text-slate-700">{bd.evaluatedVariantsRejectedBySameRegionGuard}</strong></span>
                  </div>
                )}
                {summaries.length > 0 && (
                  <div className="mt-2 overflow-x-auto">
                    <div className="font-mono text-[10px] font-semibold text-slate-700 mb-1">Checkpoint summaries (every generated checkpoint)</div>
                    <table className="min-w-[1100px] text-right font-mono text-[10px] text-slate-700">
                      <thead className="border-b border-slate-300 text-slate-500">
                        <tr>{["Idx", "Filters", "P14 min", "P14-safe", "Max dev", "RMS dev", "Worst Hz", "Broad worse", "Eligibility", "Sel"].map((label) => <th className="px-2 py-1" key={label}>{label}</th>)}</tr>
                      </thead>
                      <tbody>
                        {summaries.map((row) => (
                          <tr className={`border-b border-slate-200 ${row.selected ? "bg-emerald-100" : ""}`} key={row.index}>
                            <td className="px-2 py-1 font-semibold">{row.index}</td>
                            <td className="px-2 py-1">{row.enabledFilterCount}</td>
                            <td className="px-2 py-1">{fmt(row.p14MinimumSpl, " dB")}</td>
                            <td className="px-2 py-1"><strong className={row.p14Safe ? "text-emerald-700" : "text-rose-700"}>{row.p14Safe ? "Yes" : "No"}</strong></td>
                            <td className="px-2 py-1">{fmt(row.maximumAbsoluteDeviationDb, " dB")}</td>
                            <td className="px-2 py-1">{fmt(row.rmsDeviationDb, " dB")}</td>
                            <td className="px-2 py-1">{fmt(row.worstResidualFrequencyHz, " Hz")}</td>
                            <td className="px-2 py-1"><strong className={row.broadBelowTargetWorsening ? "text-rose-700" : "text-emerald-700"}>{row.broadBelowTargetWorsening ? "Yes" : "No"}</strong></td>
                            <td className="px-2 py-1 text-left">{row.selectionEligibility}</td>
                            <td className="px-2 py-1">{row.selected ? "✓" : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {summaries.filter((row) => !row.selected && row.reasonExcluded).map((row) => (
                      <div key={`reason-${row.index}`} className="mt-1 font-mono text-[10px] text-slate-500">CP{row.index}: {row.reasonExcluded}</div>
                    ))}
                  </div>
                )}
                {worstResiduals.length > 0 && (
                  <div className="mt-2 overflow-x-auto">
                    <div className="font-mono text-[10px] font-semibold text-slate-700 mb-1">Worst-residual capability diagnostics (up to 8 distinct regions, 1/3-octave smoothed)</div>
                    <table className="min-w-[1600px] text-right font-mono text-[10px] text-slate-700">
                      <thead className="border-b border-slate-300 text-slate-500">
                        <tr>{["Freq", "Target", "Post-EQ", "Signed res", "Abs res", "Agg EQ", "Permitted boost", "Remaining point boost", "Req to target", "Req to P19 tol", "Full-target cap-lim", "P19-tol cap-lim", "LF ramp"].map((label) => <th className="px-2 py-1" key={label}>{label}</th>)}</tr>
                      </thead>
                      <tbody>
                        {worstResiduals.map((row) => (
                          <tr className="border-b border-slate-200" key={row.frequency}>
                            <td className="px-2 py-1 font-semibold">{fmt(row.frequency, " Hz")}</td>
                            <td className="px-2 py-1">{fmt(row.targetSpl, " dB")}</td>
                            <td className="px-2 py-1">{fmt(row.postEqSmoothedSpl, " dB")}</td>
                            <td className="px-2 py-1">{fmt(row.signedResidualDb, " dB")}</td>
                            <td className="px-2 py-1">{fmt(row.absoluteResidualDb, " dB")}</td>
                            <td className="px-2 py-1">{fmt(row.aggregateEqContributionDb, " dB")}</td>
                            <td className="px-2 py-1">{fmt(row.sourceDomainPermittedTotalBoostDb, " dB")}</td>
                            <td className="px-2 py-1">{fmt(row.remainingPointBoostDb, " dB")}</td>
                            <td className="px-2 py-1">{fmt(row.requiredBoostToTargetDb, " dB")}</td>
                            <td className="px-2 py-1">{fmt(row.requiredBoostToP19ToleranceDb, " dB")}</td>
                            <td className="px-2 py-1"><strong className={row.fullTargetCapabilityLimited ? "text-amber-700" : "text-emerald-700"}>{row.fullTargetCapabilityLimited ? "Yes" : "No"}</strong></td>
                            <td className="px-2 py-1"><strong className={row.p19ToleranceCapabilityLimited ? "text-rose-700" : "text-emerald-700"}>{row.p19ToleranceCapabilityLimited ? "Yes" : "No"}</strong></td>
                            <td className="px-2 py-1">{fmt(row.usableLfRampFraction)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {revisionAttempts.length > 0 && (
                  <div className="mt-2 overflow-x-auto">
                    <div className="font-mono text-[10px] font-semibold text-slate-700 mb-1">Revision candidates evaluated: {revDiag?.revisionAttemptCount ?? 0} | Passing acceptance: {revDiag?.revisionPassedAcceptanceCount ?? 0} | Selected: {revDiag?.selectedRevisionOperationCount ?? 0}</div>
                    <table className="min-w-[1500px] text-right font-mono text-[10px] text-slate-700">
                      <thead className="border-b border-slate-300 text-slate-500">
                        <tr>{["Filter idx", "Old gain", "Proposed gain", "Accepted gain", "Bank max boost", "Bank max cut", "Max dev before", "Max dev after", "RMS before", "RMS after", "Passed rules", "Rejection reason"].map((label) => <th className="px-2 py-1" key={label}>{label}</th>)}</tr>
                      </thead>
                      <tbody>
                        {visibleRevisions.map((row, i) => (
                          <tr className={`border-b border-slate-200 ${row.passedRules ? "bg-emerald-50" : ""}`} key={i}>
                            <td className="px-2 py-1 font-semibold">{row.filterIndex}</td>
                            <td className="px-2 py-1">{fmt(row.oldGainDb, " dB")}</td>
                            <td className="px-2 py-1">{fmt(row.proposedGainDb, " dB")}</td>
                            <td className="px-2 py-1">{fmt(row.acceptedGainDb, " dB")}</td>
                            <td className="px-2 py-1">{fmt(row.bankMaxBoostDb, " dB")} @ {fmt(row.bankMaxBoostHz, " Hz")}</td>
                            <td className="px-2 py-1">{fmt(row.bankMaxCutDb, " dB")} @ {fmt(row.bankMaxCutHz, " Hz")}</td>
                            <td className="px-2 py-1">{fmt(row.maximumDeviationBeforeDb, " dB")}</td>
                            <td className="px-2 py-1">{fmt(row.maximumDeviationAfterDb, " dB")}</td>
                            <td className="px-2 py-1">{fmt(row.rmsBeforeDb, " dB")}</td>
                            <td className="px-2 py-1">{fmt(row.rmsAfterDb, " dB")}</td>
                            <td className="px-2 py-1"><strong className={row.passedRules ? "text-emerald-700" : "text-rose-700"}>{row.passedRules ? "Yes" : "No"}</strong></td>
                            <td className="px-2 py-1 text-left">{row.rejectionReason || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {revisionAttempts.length > REVISION_ROW_LIMIT && (
                      <button onClick={() => setShowAllRevisions(v => !v)} className="mt-1 font-mono text-[10px] text-blue-700 underline">
                        {showAllRevisions ? "Show first 25" : `Show all (${revisionAttempts.length})`}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
          {trace.length > 0 && (
            <div className="mt-2 overflow-x-auto">
              <table className="min-w-[2100px] text-right font-mono text-[10px] text-slate-700">
                <thead className="border-b border-slate-300 text-slate-500">
                  <tr>{["Op", "Action", "Freq", "Gain", "Q", "Replaced", "Old gain", "Gain delta", "Max before", "Max after", "RMS before", "RMS after", "P14 min before", "P14 min after", "P14-safe", "Broad worse", "Agg boost after", "Agg cut after"].map((label) => <th className="px-2 py-1" key={label}>{label}</th>)}</tr>
                </thead>
                <tbody>
                  {trace.map((row) => (
                    <tr className="border-b border-slate-200" key={row.iteration}>
                      <td className="px-2 py-1 font-semibold">{row.iteration}</td>
                      <td className="px-2 py-1"><strong className={row.action === "revise" ? "text-indigo-700" : "text-slate-700"}>{row.action || "append"}</strong></td>
                      <td className="px-2 py-1">{fmt(row.selectedFrequencyHz, " Hz")}</td>
                      <td className="px-2 py-1">{fmt(row.gainDb, " dB")}</td>
                      <td className="px-2 py-1">{fmt(row.Q)}</td>
                      <td className="px-2 py-1">{row.replacedFilterIndex ?? "—"}</td>
                      <td className="px-2 py-1">{fmt(row.oldGainDb, " dB")}</td>
                      <td className="px-2 py-1">{fmt(row.gainDeltaDb, " dB")}</td>
                      <td className="px-2 py-1">{fmt(row.maximumDeviationBeforeDb, " dB")}</td>
                      <td className="px-2 py-1">{fmt(row.maximumDeviationAfterDb, " dB")}</td>
                      <td className="px-2 py-1">{fmt(row.rmsBeforeDb, " dB")}</td>
                      <td className="px-2 py-1">{fmt(row.rmsAfterDb, " dB")}</td>
                      <td className="px-2 py-1">{fmt(row.p14MinimumSplBeforeDb, " dB")}</td>
                      <td className="px-2 py-1">{fmt(row.p14MinimumSplAfterDb, " dB")}</td>
                      <td className="px-2 py-1"><strong className={row.p14Safe ? "text-emerald-700" : "text-rose-700"}>{row.p14Safe ? "Yes" : "No"}</strong></td>
                      <td className="px-2 py-1"><strong className={row.broadBelowTargetWorsening ? "text-rose-700" : "text-emerald-700"}>{row.broadBelowTargetWorsening ? "Yes" : "No"}</strong></td>
                      <td className="px-2 py-1">{fmt(row.aggregateMaxBoostAfterDb, " dB")} @ {fmt(row.aggregateMaxBoostAfterHz, " Hz")}</td>
                      <td className="px-2 py-1">{fmt(row.aggregateMaxCutAfterDb, " dB")} @ {fmt(row.aggregateMaxCutAfterHz, " Hz")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          </>
          )}
        </details>
      );
    })()}
  </details>;
}