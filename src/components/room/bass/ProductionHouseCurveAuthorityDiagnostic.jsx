import React from "react";
import { applyBassSmoothing } from "./bassGraphSmoothing";
import { interpolateCanonicalTarget, requiredCorrectionDb } from "@/components/utils/houseCurveTargetAuthority";
import { getSourceDomainBoostAllowance } from "@/components/utils/subwooferCapability";
import { interpolateCurve } from "./candidateConsistency";

const PROBES = [20, 30, 34, 40, 50, 60, 75, 100, 120];
const fmt = (value) => Number.isFinite(value) ? value.toFixed(2) : "—";
const protectedAt = (frequency, regions) => (regions || []).find((region) => frequency >= region.startHz && frequency <= region.endHz);

function residualMetrics(curve, target, startHz, endHz, protectedNulls) {
  const values = applyBassSmoothing(curve || [], "third").filter((point) => point.frequency >= startHz && point.frequency <= endHz)
    .filter((point) => !protectedAt(point.frequency, protectedNulls))
    .map((point) => point.spl - interpolateCanonicalTarget(target, point.frequency)).filter(Number.isFinite);
  return values.length ? { rms: Math.sqrt(values.reduce((sum, value) => sum + value ** 2, 0) / values.length), max: Math.max(...values.map(Math.abs)) } : { rms: null, max: null };
}

export default function ProductionHouseCurveAuthorityDiagnostic({ result, rspRawCurve, activeSubs, usableLfHz }) {
  const candidate = result?.selectedCandidate;
  if (!candidate) return null;
  const target = candidate.productionHouseCurveTarget || [];
  const before = rspRawCurve || [];
  const after = candidate.finalPostEqCurve || [];
  const eq = candidate.combinedEqCurve || [];
  const nulls = candidate.houseCurveDiagnostics?.protectedNullRegions || [];
  const correctionStart = candidate.correctionStartHz;
  const correctionEnd = candidate.correctionEndHz;
  const probes = [...new Set([...PROBES, correctionEnd].filter(Number.isFinite))];
  const beforeMetrics = residualMetrics(before, target, correctionStart, correctionEnd, nulls);
  const afterMetrics = residualMetrics(after, target, correctionStart, correctionEnd, nulls);
  return <details id="production-house-curve-authority" open className="mt-2 rounded border border-violet-300 bg-violet-50 p-2 text-[10px]">
    <summary className="cursor-pointer font-mono font-semibold text-violet-950">Canonical target authority and production correction table</summary>
    <div className="mt-2 grid grid-cols-2 gap-1 font-mono text-slate-700">
      <span>Anchor source: <strong>{candidate.targetAnchorSource || "—"}</strong></span><span>Anchor: <strong>{fmt(candidate.requestedTargetSpl)} dB</strong></span>
      <span>Target: <strong>{fmt(target[0]?.frequency)}–{fmt(target.at(-1)?.frequency)} Hz</strong></span><span>First/last: <strong>{fmt(target[0]?.spl)} / {fmt(target.at(-1)?.spl)} dB</strong></span>
      <span>P19 scoring: <strong>{fmt(candidate.assessmentStartHz)}–{fmt(candidate.assessmentEndHz)} Hz</strong></span><span>EQ correction: <strong>{fmt(correctionStart)}–{fmt(correctionEnd)} Hz</strong></span>
      <span>Correctable RMS: <strong>{fmt(beforeMetrics.rms)} → {fmt(afterMetrics.rms)} dB</strong></span><span>Correctable max: <strong>{fmt(beforeMetrics.max)} → {fmt(afterMetrics.max)} dB</strong></span>
      <span>P14: <strong>{fmt(candidate.preEqP14Db)} → {fmt(candidate.achievedP14Db)} dB</strong></span><span>Bank cut/boost: <strong>{fmt(candidate.aggregateBankLimits?.maxAggregateCutDb)} / +{fmt(candidate.aggregateBankLimits?.maxAggregateBoostDb)} dB</strong></span>
    </div>
    {nulls.map((region) => <div className="mt-1 font-mono text-amber-900" key={region.centreFrequencyHz}>Protected {fmt(region.startHz)}–{fmt(region.endHz)} Hz: {region.reason}</div>)}
    <div className="mt-2 overflow-x-auto"><table className="min-w-[1000px] font-mono text-[10px] text-slate-700">
      <thead><tr>{["Hz", "Before", "Target", "Required", "Applied EQ", "After", "After residual", "Protected", "Product-limited"].map((label) => <th className="px-2 py-1 text-right" key={label}>{label}</th>)}</tr></thead>
      <tbody>{probes.map((frequency) => {
        const responseBefore = interpolateCurve(before, frequency); const targetSpl = interpolateCanonicalTarget(target, frequency);
        const appliedEq = interpolateCurve(eq, frequency); const responseAfter = interpolateCurve(after, frequency);
        const protectedRegion = protectedAt(frequency, nulls); const allowance = getSourceDomainBoostAllowance({ frequency, requestedBoostDb: Math.max(0, appliedEq || 0), activeSubs, usableLfHz, requestedSystemOutputDb: candidate.requestedTargetSpl });
        const productLimited = (appliedEq || 0) > 0 && Number.isFinite(allowance?.allowedBoostDb) && appliedEq > allowance.allowedBoostDb + 0.05;
        return <tr className="border-t border-violet-200" key={frequency}>{[frequency, responseBefore, targetSpl, requiredCorrectionDb(targetSpl, responseBefore), appliedEq, responseAfter, responseAfter - targetSpl].map((value, index) => <td className="px-2 py-1 text-right" key={index}>{fmt(value)}</td>)}<td className="px-2 py-1 text-right">{protectedRegion ? "Yes" : "No"}</td><td className="px-2 py-1 text-right">{productLimited ? "Yes" : "No"}</td></tr>;
      })}</tbody>
    </table></div>
  </details>;
}