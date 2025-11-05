import React from "react";

/** Text-only printer: never returns objects/arrays to React */
function t(v, fb = "—") {
  if (v == null) return fb;
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (typeof v === "object") {
    if (typeof v.name === "string") return v.name;
    if (typeof v.model === "string") return v.model;
    try { return JSON.stringify(v); } catch { return fb; }
  }
  return fb;
}

export default function SystemSummarySafe({ activeProjectId, summary }) {
  // Hard defaults to guarantee string-only rendering
  const s = summary || {};
  const rows = [
    ["Layout",                     t(s?.dolbyLayout)],
    ["Target SPL (dB) LCR",        s?.targetSPL_LCR_dB != null ? `${t(s?.targetSPL_LCR_dB)} dB LCR` : "—"],
    ["LCR",                        t(s?.lcrModel, "Not set yet")],
    ["Surround",                   t(s?.surroundModel, "Not set yet")],
    ["Height",                     t(s?.heightModel, "Not set yet")],
    ["Subwoofer(s)",               s?.subModel ? `${t(s?.subModel)}${s?.subCount ? ` × ${t(s?.subCount)}` : ""}` : "Not set yet"],
    ["Amp headroom",               s?.ampHeadroom_dB != null ? `${t(s?.ampHeadroom_dB)} dB` : "Not set yet"],
  ];

  return (
    <div className="bg-white border border-[#DCDBD6] rounded-lg">
      <div className="px-6 py-4 border-b border-[#DCDBD6]">
        <h3 className="text-[#1B1A1A] font-header text-lg">System Summary</h3>
      </div>
      <div className="p-6 text-sm space-y-3 font-body">
        {!activeProjectId ? (
          <p className="text-[#3E4349]">Open a project in Room Designer to populate the summary.</p>
        ) : (
          rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4">
              <span className="text-[#3E4349]">{label}</span>
              <span className="text-[#1B1A1A] font-medium">{value}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}