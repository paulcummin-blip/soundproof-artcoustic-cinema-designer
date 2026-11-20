// BassRecalculationBar — the permanent manual calculate / recalculate control,
// placed directly beneath the RP22 P14/P18/P19/P20 results, with the
// "Calculation Required" warning immediately beside it.
//
// ALWAYS visible and available once the design is calculable, including when
// performance is already current. Every click raises the existing authoritative
// calculation, saving and publication workflow; this control does no
// calculation of its own and holds no change detection, warning or fingerprint
// of any kind — the warning it renders is the flag its parent reads from the
// existing authority.
//
// PRESENTATION ONLY.
import React from "react";
import { RotateCw } from "lucide-react";
// The warning copy is now passed in as a prop (resolveRecalculationWarning)
// so the heading and message adapt to the two states: "Calculation Required"
// (no previous result) and "Update Required" (previous result is outdated).

export default function BassRecalculationBar({
  hasResult = false,
  calculating = false,
  canCalculate = false,
  warning = false,
  onCalculate = null,
}) {
  if (typeof onCalculate !== "function") return null;
  const disabled = calculating || !canCalculate;

  return (
    <div className="col-span-2 sm:col-span-4 mt-2 flex flex-col gap-3">
      {warning && (
        <div
          data-bass-recalculation-warning="true"
          className="min-w-0 rounded-md px-2.5 py-1.5"
          style={{ border: "1px solid #C1B6AD", background: "#F1F0EE" }}
        >
          <div className="font-semibold" style={{ fontSize: "11.5px", color: "#625143" }}>
            {warning.heading}
          </div>
          <div style={{ fontSize: "11px", color: "#3E4349", lineHeight: 1.35 }}>
            {warning.message}
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={onCalculate}
        disabled={disabled}
        title={canCalculate ? undefined : "Complete the room, speakers and seating to calculate bass parameters"}
        className="w-full rounded-lg bg-[#213428] px-4 py-3 text-[13px] font-semibold text-white transition-opacity hover:bg-[#3E4349] disabled:cursor-not-allowed disabled:opacity-45 flex items-center justify-center gap-2"
      >
        <RotateCw
          className={calculating ? "animate-spin" : undefined}
          style={{ width: 16, height: 16 }}
          aria-hidden="true"
        />
        {calculating ? "Calculating…" : "Calculate Bass Parameters"}
      </button>
    </div>
  );
}