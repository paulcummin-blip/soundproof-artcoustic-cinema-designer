// PresentationModeToggle.jsx
// ---------------------------------------------------------------------------
// Stage 5 — Presentation Mode
//
// A viewing mode toggle. Not a report.
//
// When ON:
//   Hides: recommendations, authority information, engineering workflow,
//          implementation details
//   Shows: graph, RP22 pills, one-sentence assessment
//
// When OFF:
//   Full engineering workflow visible.
// ---------------------------------------------------------------------------

import React from "react";
import { Eye, EyeOff } from "lucide-react";

export default function PresentationModeToggle({ isPresentationMode, onToggle }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-[#E7E4DF] bg-white px-4 py-2.5">
      <div className="flex items-center gap-2">
        {isPresentationMode ? (
          <Eye className="w-4 h-4 text-[#213428]" />
        ) : (
          <EyeOff className="w-4 h-4 text-[#625143]" />
        )}
        <span
          className="text-[12px] font-semibold text-[#1B1A1A]"
          style={{ fontFamily: "Didact Gothic, sans-serif" }}
        >
          Presentation Mode
        </span>
      </div>
      <button
        type="button"
        onClick={() => onToggle(!isPresentationMode)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
          isPresentationMode ? "bg-[#213428]" : "bg-[#D9D5CE]"
        }`}
        aria-pressed={isPresentationMode}
        aria-label="Toggle presentation mode"
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
            isPresentationMode ? "translate-x-4.5" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}