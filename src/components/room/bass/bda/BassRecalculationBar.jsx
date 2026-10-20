// BassRecalculationBar — the permanent manual calculate / recalculate control,
// placed directly beneath the RP22 P14/P18/P19/P20 results, with the
// "Recalculation Required" warning immediately beside it.
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
import { RECALCULATION_WARNING } from "@/components/room/bass/bda/bassRecalculationWarning";

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
    <div className="col-span-2 sm:col-span-4 mt-2 flex flex-wrap items-center justify-end gap-3">
      {warning && (
        <div
          data-bass-recalculation-warning="true"
          className="mr-auto min-w-0 rounded-md px-2.5 py-1.5"
          style={{ border: "1px solid #FCD34D", background: "#FEF3C7" }}
        >
          <div className="font-semibold" style={{ fontSize: "11.5px", color: "#92400E" }}>
            {RECALCULATION_WARNING.heading}
          </div>
          <div style={{ fontSize: "11px", color: "#3E4349", lineHeight: 1.35 }}>
            {RECALCULATION_WARNING.message}
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={onCalculate}
        disabled={disabled}
        title={canCalculate ? undefined : "Complete the room, speakers and seating to calculate bass results"}
        className="shrink-0 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
        style={{ fontSize: "12px", background: "#213428", color: "#FFFFFF" }}
      >
        <RotateCw
          className={calculating ? "animate-spin" : undefined}
          style={{ width: 13, height: 13 }}
          aria-hidden="true"
        />
        {calculating
          ? "Calculating…"
          : (hasResult ? "Recalculate Bass Results" : "Calculate Bass Results")}
      </button>
    </div>
  );
}