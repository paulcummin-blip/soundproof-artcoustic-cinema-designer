// PerformanceHeader.jsx
// ---------------------------------------------------------------------------
// Compact Performance header with Recalculate control.
// After the first successful calculation, the large Calculate button is
// replaced by this compact Recalculate within the Performance header,
// making the graph the dominant visual element.
// ---------------------------------------------------------------------------

import React from "react";
import { RotateCcw, Loader2 } from "lucide-react";

export default function PerformanceHeader({ hasResults, isCalculating, isStale, onRecalculate }) {
  const showRecalculate = hasResults && typeof onRecalculate === "function";

  return (
    <div className="flex items-center justify-between gap-3" data-bda-stage="performance-header">
      <h4
        className="text-[14px] font-bold text-[#1B1A1A]"
        style={{ fontFamily: "Didact Gothic, sans-serif" }}
      >
        Performance
      </h4>
      {showRecalculate && (
        <button
          type="button"
          onClick={onRecalculate}
          disabled={isCalculating}
          className="flex items-center gap-1.5 rounded-md border border-[#D9D5CE] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#213428] transition-colors hover:bg-[#F5F5F0] disabled:opacity-45"
        >
          {isCalculating ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Recalculating…
            </>
          ) : (
            <>
              <RotateCcw className="h-3.5 w-3.5" />
              Recalculate
            </>
          )}
        </button>
      )}
    </div>
  );
}