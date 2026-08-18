import React, { useState } from "react";
import { ChevronDown } from "lucide-react";
import ProtectedNullNotice from "@/components/room/bass/ProtectedNullNotice";

/**
 * Groups multiple protected-null warnings into a single collapsible summary
 * so the graph area is not stacked with repeated amber alert boxes.
 * Collapsed by default; expands to reveal the full per-null detail cards.
 */
export default function ProtectedNullWarningSummary({ annotations = [] }) {
  const [open, setOpen] = useState(false);
  if (!annotations.length) return null;
  const count = annotations.length;
  const freqs = annotations.map((a) => `${a.frequencyHz.toFixed(1)} Hz`).join(", ");
  return (
    <div className="mt-2 rounded-md border border-amber-300 bg-amber-50">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-left"
      >
        <div className="text-xs text-amber-900">
          <span className="font-semibold">Protected cancellation nulls detected</span>
          <span className="ml-2 text-amber-800">
            {count} protected null{count === 1 ? "" : "s"}: {freqs}
          </span>
        </div>
        <ChevronDown className={`h-4 w-4 text-amber-800 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-3 pb-3">
          <ProtectedNullNotice annotations={annotations} />
        </div>
      )}
    </div>
  );
}