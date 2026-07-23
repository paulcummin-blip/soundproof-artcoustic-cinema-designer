import React from "react";

export default function BassCapabilityReceiptDiagnostic({ receipts = [] }) {
  if (!receipts.length) return null;
  return <details className="mt-2 rounded border border-slate-300 bg-slate-50 p-2 font-mono text-[10px] text-slate-700">
    <summary className="cursor-pointer font-semibold">LF capability envelope receipt</summary>
    <div className="mt-2 space-y-1">
      {receipts.map((item) => <div key={item.sourceId} className={item.received ? "text-emerald-700" : "text-rose-700"}>
        {item.modelName} | usable LF: {item.usableLF_neg6dB ?? "—"} Hz | response points: {item.frequencyResponseCurvePoints} | max SPL points: {item.maxSPLCurvePoints} | scalar: {item.maxSPL ?? "—"} dB | {item.received ? "RECEIVED" : "MISSING"}
      </div>)}
    </div>
  </details>;
}