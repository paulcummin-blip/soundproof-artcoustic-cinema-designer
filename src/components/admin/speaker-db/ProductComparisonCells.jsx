// ProductComparisonCells.jsx
// ---------------------------------------------------------------------------
// The comparison-readiness cells of the Products list. Purely presentational:
// every value comes from comparisonReadiness.js, so the list and the RP22 page
// always describe the same evidence.
// ---------------------------------------------------------------------------

import React from "react";
import { INSTALLED_SPACE_ASSUMPTION_SHORT } from "@/components/utils/spl/installedSpaceAssumption.js";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#625143",
  tone: "#3E4349",
};

function Badge({ label, tone, title }) {
  return (
    <span
      title={title}
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
      style={{ background: tone + "15", color: tone }}
    >
      {label}
    </span>
  );
}

function Muted({ children, title }) {
  return (
    <div
      title={title}
      style={{
        fontSize: 11,
        color: BRAND.subtext,
        marginTop: 3,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </div>
  );
}

/** RP22 readiness: the label the dealer's comparison depends on, plus the gaps. */
export function ReadinessCell({ readiness }) {
  if (!readiness) return <span style={{ color: BRAND.subtext }}>—</span>;
  const missing = readiness.missingCriticalLabels;
  return (
    <div style={{ minWidth: 0 }}>
      <Badge label={readiness.label} tone={readiness.tone} title={readiness.meaning} />
      <Muted title={missing.length ? `Missing critical fields: ${missing.join(", ")}` : readiness.meaning}>
        {missing.length ? `Missing: ${missing.join(", ")}` : "All critical fields present"}
      </Muted>
    </div>
  );
}

/** Evidence: confidence grade plus where the capability figure comes from. */
export function EvidenceCell({ readiness, text }) {
  if (!readiness) return <span style={{ color: BRAND.subtext }}>—</span>;
  // The ADI installed-speaker normalisation assumption is stated beside the grade
  // it produces, so a C can never read as a published basis.
  const assumption = readiness.spaceAssumption;
  const showAssumption = Boolean(assumption?.applied) && readiness.eligible;
  return (
    <div style={{ minWidth: 0 }}>
      <span
        className="inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold"
        style={{ background: readiness.tone + "15", color: readiness.tone }}
        title={readiness.meaning}
      >
        {readiness.confidence}
      </span>
      <Muted title={text}>{text}</Muted>
      {showAssumption && (
        <Muted title={assumption.note}>{INSTALLED_SPACE_ASSUMPTION_SHORT}</Muted>
      )}
    </div>
  );
}

/** How much of the RP22 comparison field set this product actually supplies. */
export function CompletenessCell({ readiness }) {
  if (!readiness) return <span style={{ color: BRAND.subtext }}>—</span>;
  const { presentCount, totalCount, missingUsefulLabels } = readiness;
  return (
    <div style={{ minWidth: 0 }}>
      <span style={{ fontWeight: 600 }}>{presentCount}/{totalCount}</span>
      <Muted title={missingUsefulLabels.length ? `Useful but missing: ${missingUsefulLabels.join(", ")}` : "Every comparison and supporting field present"}>
        {missingUsefulLabels.length === 0
          ? "fields complete"
          : `missing ${missingUsefulLabels.length} useful`}
      </Muted>
    </div>
  );
}

export function TextCell({ value, muted }) {
  if (value == null || value === "") return <span style={{ color: BRAND.subtext }}>—</span>;
  return <span style={{ color: muted ? BRAND.tone : BRAND.text }}>{value}</span>;
}