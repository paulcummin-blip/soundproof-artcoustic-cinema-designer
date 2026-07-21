import React from "react";

const OPTIONS = [
  ["balanced", "Balanced"],
  ["house_curve_accuracy", "House-curve accuracy"],
  ["depth", "Depth priority"],
  ["spl", "SPL priority"],
];

export default function BassPrioritySelector({ value, onChange, disabled = false }) {
  return <label className="flex min-w-[180px] items-center gap-2 text-[11px] text-[#625143]">
    <span className="shrink-0 font-medium">Priority</span>
    <select value={value || "balanced"} onChange={(event) => onChange?.(event.target.value)} disabled={disabled}
      className="h-8 min-w-0 flex-1 rounded-md border border-[#DCDBD6] bg-white px-2 text-[11px] font-semibold text-[#213428]">
      {OPTIONS.map(([mode, label]) => <option key={mode} value={mode}>{label}</option>)}
    </select>
  </label>;
}