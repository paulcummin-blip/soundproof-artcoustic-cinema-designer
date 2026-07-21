// normalizedSeriesBuilder.js — Builds the graph series object for the
// product-independent normalized room response. Extracted from BassResponse.jsx
// to reduce file size. No physics or data changes — pure presentation builder.

export function buildNormalizedSeries(rspCurve) {
  if (!rspCurve || !rspCurve.length) return null;
  return {
    id: "normalized-rsp",
    kind: "normalized",
    label: "Normalized room response (RSP)",
    tooltipLabel: "Product-independent normalized room response (94 dB flat reference) — not predicted product SPL",
    color: "#16A34A",
    strokeWidth: 2,
    data: rspCurve,
  };
}