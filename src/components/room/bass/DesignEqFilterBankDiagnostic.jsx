import React from "react";

const fmt = (value, digits = 1) => Number.isFinite(value) ? value.toFixed(digits) : "—";

const READOUT_HZ = [20, 25, 35, 45, 50, 70, 100, 200];

function closestCorrection(curve, frequency) {
  return curve.reduce((best, point) => Math.abs(point.frequency - frequency) < Math.abs(best.frequency - frequency) ? point : best, curve[0])?.spl;
}

export default function DesignEqFilterBankDiagnostic({ filters = [], decisionDiagnostics = [], rejectedCandidates = [], protectedNullRegions = [], combinedEqCurve = [], profile = "standard", profileConfig = null }) {
  const filterRows = decisionDiagnostics.length ? decisionDiagnostics : filters.map((filter) => ({ ...filter, classification: "—", expectedAction: filter.gainDb < 0 ? "Cut" : "Boost if capable", actualAction: filter.gainDb < 0 ? "Cut" : "Boost", reason: filter.reason }));
  const rejectedRows = rejectedCandidates.map((candidate, index) => ({
    frequencyHz: candidate.frequencyHz ?? candidate.frequency, Q: candidate.Q ?? candidate.proposedQ,
    gainDb: candidate.gainDb ?? candidate.proposedGainDb, classification: candidate.classification || "Capability limited",
    expectedAction: candidate.expectedAction || "Boost if capable", actualAction: "Rejected",
    reason: candidate.reason || candidate.rejectionReason || "Proposed correction was rejected by physical capability authority.", key: `rejected-${index}`,
  }));
  const nullRows = protectedNullRegions.map((region, index) => ({
    frequencyHz: region.frequencyHz ?? region.centreFrequencyHz ?? region.centerFrequencyHz ?? region.centerHz,
    Q: null, gainDb: 0, classification: "Null", expectedAction: "Protect", actualAction: "No EQ",
    reason: region.reason || "Narrow destructive cancellation is protected from corrective EQ.", key: `protected-null-${index}`,
  }));
  const rows = [...filterRows, ...rejectedRows, ...nullRows];
  return (
    <details className="mt-3 rounded border border-slate-300 bg-slate-50 p-3 text-xs">
      <summary className="cursor-pointer font-semibold text-slate-800">Temporary 10-band Design EQ filter bank</summary>
      <div className="mt-1 font-mono text-[10px] text-slate-600">{profile === "house_curve" ? "House-curve constraint: cut up to −15 dB / boost up to +6 dB, capability-limited" : `Profile constraint: cut up to −${profileConfig?.maximumCutDb ?? 10} dB / boost up to +${profileConfig?.maximumAggregateBoostDb ?? 6} dB, capability-limited`}</div>
      <div className="mt-2 overflow-x-auto">
        <table className="min-w-[980px] text-right font-mono text-[10px] text-slate-700">
          <thead className="border-b border-slate-300 text-slate-500">
            <tr>{["Frequency", "Q", "Classification", "Gain", "Expected Action", "Actual Action", "Reason"].map((label) => <th className="px-2 py-1" key={label}>{label}</th>)}</tr>
          </thead>
          <tbody>{rows.map((row, index) => (
            <tr className="border-b border-slate-200" key={row.key || `${row.frequencyHz}-${index}`}>
              <td className="px-2 py-1 font-semibold">{fmt(row.frequencyHz)} Hz</td><td className="px-2 py-1">{fmt(row.Q, 2)}</td><td className="px-2 py-1">{row.classification || "—"}</td><td className="px-2 py-1">{fmt(row.gainDb)} dB</td><td className="px-2 py-1">{row.expectedAction || "—"}</td><td className="px-2 py-1">{row.actualAction === "No EQ" ? "No EQ" : `${fmt(row.gainDb)} dB ${row.actualAction || "—"}`}</td><td className="px-2 py-1 text-left">{row.reason || "—"}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className="mt-3 overflow-x-auto">
        <div className="mb-1 font-semibold text-slate-800">Combined EQ response</div>
        <table className="min-w-[520px] text-right font-mono text-[10px] text-slate-700">
          <thead className="border-b border-slate-300 text-slate-500"><tr>{["Hz", "Aggregate EQ"].map((label) => <th className="px-2 py-1" key={label}>{label}</th>)}</tr></thead>
          <tbody>{READOUT_HZ.map((frequency) => <tr className="border-b border-slate-200" key={frequency}><td className="px-2 py-1 font-semibold">{frequency}</td><td className="px-2 py-1">{fmt(closestCorrection(combinedEqCurve, frequency))} dB</td></tr>)}</tbody>
        </table>
      </div>
    </details>
  );
}