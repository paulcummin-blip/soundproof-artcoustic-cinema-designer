import React from "react";

export default function BassCapabilityReceiptDiagnostic({ receipts = [], protection = null }) {
  if (!receipts.length) return null;
  const region = protection?.maximumPermittedLfBoostRegion;
  return <details className="mt-2 rounded border border-slate-300 bg-slate-50 p-2 font-mono text-[10px] text-slate-700">
    <summary className="cursor-pointer font-semibold">LF capability envelope receipt</summary>
    <div className="mt-2 space-y-1">
      {receipts.map((item) => <div key={item.sourceId} className={item.received ? "text-emerald-700" : "text-rose-700"}>
        {item.modelName} | usable LF: {item.usableLF_neg6dB ?? "—"} Hz | response points: {item.frequencyResponseCurvePoints} | max SPL points: {item.maxSPLCurvePoints} | scalar: {item.maxSPL ?? "—"} dB | {item.received ? "RECEIVED" : "MISSING"}
      </div>)}
      {protection && <div className="border-t border-slate-200 pt-1 text-slate-800">
        Active: {protection.activeSubModels?.join(", ") || "—"} | LF limit: {protection.usableLfLimitHz ?? "—"} Hz | Soft-penalty region: {region?.activeInEvaluatedBand ? `${region.startHz?.toFixed?.(1)}–${region.endHz?.toFixed?.(1)} Hz` : "outside evaluated band"} | Permitted boost: {region?.minimumPermittedBoostDb?.toFixed?.(1) ?? "—"}–{region?.maximumPermittedBoostDb?.toFixed?.(1) ?? "—"} dB | Cost: {protection.selectedPenaltyCostDb?.toFixed?.(2) ?? "0.00"} | Influenced filters: {protection.penaltyInfluencedSelectedFilters ? "YES" : "NO"}
      </div>}
    </div>
  </details>;
}