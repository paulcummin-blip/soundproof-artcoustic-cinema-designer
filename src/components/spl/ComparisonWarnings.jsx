import React from "react";

// Data warning: triggers when any source field indicates incomplete/estimated authority.
// Does NOT trigger for published/high/yes-published data.
export function shouldShowDataWarning(record) {
  if (!record) return false;
  const authority = String(record.spl_authority || "").toLowerCase();
  const confidence = String(record.data_confidence || "").toLowerCase();
  const eligibleRaw = record.p12_p13_eligible;
  const eligibleStr = String(eligibleRaw ?? "").toLowerCase();

  if (authority.includes("calculated")) return true;
  if (authority.includes("incomplete")) return true;
  if (["b", "c", "insufficient", "low", "medium", "unverified"].includes(confidence)) return true;
  if (eligibleRaw === false || eligibleStr.includes("incomplete")) return true;

  return false;
}

// Open-back warning: triggers when product_type is In-wall AND open_back is Y/Yes/true.
export function shouldShowOpenBackWarning(record) {
  if (!record) return false;
  const productType = String(record.product_type || "").toLowerCase();
  const openBack = String(record.open_back || "").toLowerCase().trim();

  if (!productType.includes("in-wall")) return false;
  return ["y", "yes", "true"].includes(openBack);
}

export default function ComparisonWarnings({ record }) {
  if (!record) return null;

  const showData = shouldShowDataWarning(record);
  const showOpenBack = shouldShowOpenBackWarning(record);

  if (!showData && !showOpenBack) return null;

  return (
    <div
      style={{
        margin: "0 16px 6px",
        padding: "6px 10px",
        background: "#FFF8E1",
        border: "1px solid #F5C518",
        borderRadius: 8,
        fontSize: 12,
        color: "#7A5C00",
        lineHeight: 1.5,
      }}
    >
      {showData && (
        <div>⚠ Incomplete data from manufacturer. Estimated values based on data available.</div>
      )}
      {showOpenBack && (
        <div>⚠ These are an open back design and subject to inconsistent installed results.</div>
      )}
    </div>
  );
}