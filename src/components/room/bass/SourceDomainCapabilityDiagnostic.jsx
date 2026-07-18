import React, { useMemo } from "react";
import { getSourceDomainBoostAllowance, getSystemSourceCapability, interpolateCapabilityCurve } from "@/components/utils/subwooferCapability";
import { getSubwooferCurve } from "@/components/models/speakers/registry";

const TARGET_HZ = [20, 25, 35, 45, 50, 70, 100];
const fmt = (value) => Number.isFinite(value) ? value.toFixed(1) : "—";
const at = (curve, frequency) => curve?.reduce((best, point) => Math.abs(point.frequency - frequency) < Math.abs(best.frequency - frequency) ? point : best, curve[0])?.spl;

export default function SourceDomainCapabilityDiagnostic({ activeSubs, rawCurve, postEqCurve, usableLfHz, eqDiagnostics }) {
  const rows = useMemo(() => TARGET_HZ.map((frequency) => {
    const firstSub = activeSubs?.[0];
    const oneSubCapability = firstSub ? interpolateCapabilityCurve(getSubwooferCurve(firstSub.modelKey ?? firstSub.model), frequency) : null;
    const trace = eqDiagnostics?.find((entry) => Math.abs(entry.frequency - frequency) < 0.51);
    const allowance = trace?.allowance ?? getSourceDomainBoostAllowance({ frequency, requestedBoostDb: 0, activeSubs, usableLfHz });
    const rawSpl = at(rawCurve, frequency);
    const finalSpl = at(postEqCurve, frequency);
    return {
      frequency,
      oneSubCapability,
      combinedSystemCapability: getSystemSourceCapability(activeSubs, frequency),
      combinedRequestedOutput: allowance.currentSystemSourceOutputDb,
      availableSystemHeadroom: allowance.availableHeadroomDb,
      aggregateEq: trace?.appliedCorrectionDb,
      finalSpl,
    };
  }), [activeSubs, rawCurve, postEqCurve, usableLfHz, eqDiagnostics]);

  if (!activeSubs?.length || !rawCurve?.length || !postEqCurve?.length) return null;
  return <details className="mt-3 rounded border border-slate-300 bg-slate-50 p-3 text-xs">
    <summary className="cursor-pointer font-semibold text-slate-800">Temporary source-domain capability audit</summary>
    <div className="mt-2 overflow-x-auto">
      <table className="min-w-[920px] text-right font-mono text-[10px] text-slate-700">
        <thead className="border-b border-slate-300 text-slate-500"><tr>{["Hz", "One-sub capability", "Combined system capability", "Combined requested output", "Available system headroom", "Aggregate EQ", "Final RSP"].map((label) => <th className="px-2 py-1" key={label}>{label}</th>)}</tr></thead>
        <tbody>{rows.map((row) => <tr className="border-b border-slate-200" key={row.frequency}><td className="px-2 py-1 font-semibold">{row.frequency}</td><td className="px-2 py-1">{fmt(row.oneSubCapability)}</td><td className="px-2 py-1">{fmt(row.combinedSystemCapability)}</td><td className="px-2 py-1">{fmt(row.combinedRequestedOutput)}</td><td className="px-2 py-1">{fmt(row.availableSystemHeadroom)}</td><td className="px-2 py-1">{fmt(row.aggregateEq)}</td><td className="px-2 py-1">{fmt(row.finalSpl)}</td></tr>)}</tbody>
      </table>
    </div>
  </details>;
}