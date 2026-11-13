// AdiSearchStatusList.jsx
// ---------------------------------------------------------------------------
// A compact, evidence-based list of the search categories the Bass ADI run
// actually performed: Phase / Delay / Gain / Crossover / Placement / Seating.
//
// A green dot is shown ONLY for a genuinely completed evaluation. Skipped or
// not-applicable stages remain neutral and are accurately labelled. The list
// never uses green merely because the whole optimiser finished — it reads the
// run's own per-category status (searchStatus) carried through the plan.
//
// Technical evidence (the hierarchy gate decision and electronics reasons) is
// available when expanded. Minimal by default.
// ---------------------------------------------------------------------------

import React, { useState } from "react";

const STATUS_DOT = {
  completed: { colour: "#213428", label: "Tested" },
  not_applicable: { colour: "#C1B6AD", label: "Not applicable" },
  skipped: { colour: "#C1B6AD", label: "Skipped" },
  failed: { colour: "#B91C1C", label: "Failed" },
  incomplete: { colour: "#C1B6AD", label: "Not completed" },
  not_run: { colour: "#DCDBD6", label: "Not run" },
};

export default function AdiSearchStatusList({ searchStatus = null, hierarchyGateDiagnostics = null }) {
  const [expanded, setExpanded] = useState(false);
  const categories = searchStatus?.categories;
  if (!Array.isArray(categories) || categories.length === 0) return null;

  return (
    <div className="rounded-md border border-[#E5E5E5] bg-white px-3 py-2" data-adi-search-status="true">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[#625143] mb-1.5">
        Searches performed
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {categories.map((cat) => {
          const dot = STATUS_DOT[cat.status] || STATUS_DOT.not_run;
          const isGreen = cat.status === "completed" && cat.evaluated === true;
          return (
            <div key={cat.key} className="flex items-center gap-1.5" data-adi-search-status-item={cat.key}>
              <span
                className="inline-block h-2 w-2 rounded-full shrink-0"
                style={{ background: isGreen ? "#213428" : dot.colour }}
              />
              <span className="text-[11px] font-medium text-[#3E4349]">{cat.label}</span>
              <span className="text-[10px] text-[#8A7B6A]">{dot.label}</span>
            </div>
          );
        })}
      </div>
      {hierarchyGateDiagnostics && (
        <div className="mt-1.5">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-[10px] font-medium text-[#625143] underline underline-offset-2 hover:no-underline"
          >
            {expanded ? "Hide gate decision" : "Show gate decision"}
          </button>
          {expanded && (
            <div className="mt-1 text-[10px] text-[#8A7B6A] leading-relaxed space-y-0.5">
              <div>
                Electronics complete:{" "}
                <span className="font-medium text-[#3E4349]">
                  {hierarchyGateDiagnostics.electronicsComplete ? "Yes" : "No"}
                </span>
                {Array.isArray(hierarchyGateDiagnostics.electronicsReasons)
                  && hierarchyGateDiagnostics.electronicsReasons.length > 0
                  ? ` (${hierarchyGateDiagnostics.electronicsReasons.join(", ")})`
                  : ""}
              </div>
              <div>
                Placement gate:{" "}
                <span className="font-medium text-[#3E4349]">
                  {hierarchyGateDiagnostics.placementGate ? "Open" : "Closed"}
                </span>
                {hierarchyGateDiagnostics.placementExclusionReason
                  ? ` (not eligible: ${hierarchyGateDiagnostics.placementExclusionReason})`
                  : ""}
              </div>
              <div>
                Seating gate:{" "}
                <span className="font-medium text-[#3E4349]">
                  {hierarchyGateDiagnostics.seatingGate ? "Open" : "Closed"}
                </span>
                {hierarchyGateDiagnostics.seatingExclusionReason
                  ? ` (not eligible: ${hierarchyGateDiagnostics.seatingExclusionReason})`
                  : ""}
              </div>
              {hierarchyGateDiagnostics.electronicLevels && (
                <div>
                  Electronic levels — P19:{" "}
                  {hierarchyGateDiagnostics.electronicLevels.p19Rsp ?? "—"},
                  P20 Primary: {hierarchyGateDiagnostics.electronicLevels.p20Primary ?? "—"},
                  P20 Secondary:{" "}
                  {hierarchyGateDiagnostics.electronicLevels.p20Secondary ?? "—"}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}