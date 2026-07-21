// normalizedSeriesBuilder.js — Builds the graph series object for the
// product-independent normalized room response. Extracted from BassResponse.jsx
// to reduce file size. No physics or data changes — pure presentation builder.
//
// Phase 2B: The label reflects the two-stage calculation quality:
//   - "preview" when the fast interactive preview is showing
//   - "refining" when a preview is showing but the refinement is still running
//   - "refined" when the full-physics refinement has completed
//
// The tooltip always states this is product-independent and not predicted product SPL.

export function buildNormalizedSeries(rspCurve, quality, isRefining) {
  if (!rspCurve || !rspCurve.length) return null;

  let label;
  if (quality === "refined") {
    label = "Live normalized room response — refined";
  } else if (quality === "preview" && isRefining) {
    label = "Live normalized room response — refining";
  } else {
    label = "Live normalized room response — preview";
  }

  return {
    id: "normalized-rsp",
    kind: "normalized",
    label,
    tooltipLabel: "Product-independent normalized room response (94 dB flat reference) — not predicted product SPL",
    color: "#16A34A",
    strokeWidth: 2,
    data: rspCurve,
  };
}