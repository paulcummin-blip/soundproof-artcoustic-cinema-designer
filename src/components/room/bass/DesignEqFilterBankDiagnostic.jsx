import React from "react";

const fmt = (value, digits = 1) => Number.isFinite(value) ? value.toFixed(digits) : "—";

const READOUT_HZ = [20, 25, 35, 45, 50, 70, 100, 200];

function closestCorrection(curve, frequency) {
  return curve.reduce((best, point) => Math.abs(point.frequency - frequency) < Math.abs(best.frequency - frequency) ? point : best, curve[0])?.spl;
}

export default function DesignEqFilterBankDiagnostic({ filters = [], combinedEqCurve = [] }) {
  return (
    <details className="mt-3 rounded border border-slate-300 bg-slate-50 p-3 text-xs">
      <summary className="cursor-pointer font-semibold text-slate-800">Temporary 10-band Design EQ filter bank</summary>
      <div className="mt-1 font-mono text-[10px] text-slate-600">House-curve constraint: cut up to −15 dB / boost up to +6 dB, capability-limited</div>
      <div className="mt-2 overflow-x-auto">
        <table className="min-w-[820px] text-right font-mono text-[10px] text-slate-700">
          <thead className="border-b border-slate-300 text-slate-500">
            <tr>{["Band", "Enabled", "Type", "Frequency", "Gain", "Q", "Start", "End", "Reason"].map((label) => <th className="px-2 py-1" key={label}>{label}</th>)}</tr>
          </thead>
          <tbody>{filters.map((filter) => (
            <tr className="border-b border-slate-200" key={filter.band}>
              <td className="px-2 py-1 font-semibold">{filter.band}</td><td className="px-2 py-1">{filter.enabled ? "Yes" : "No"}</td><td className="px-2 py-1">{filter.type}</td><td className="px-2 py-1">{fmt(filter.frequencyHz)} Hz</td><td className="px-2 py-1">{fmt(filter.gainDb)} dB</td><td className="px-2 py-1">{fmt(filter.Q, 2)}</td><td className="px-2 py-1">{fmt(filter.startHz)} Hz</td><td className="px-2 py-1">{fmt(filter.endHz)} Hz</td><td className="px-2 py-1 text-left">{filter.reason}</td>
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