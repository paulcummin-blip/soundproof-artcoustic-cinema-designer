// DataQualityGuide.jsx
// ---------------------------------------------------------------------------
// A compact, presentation-only explanation of the three data-quality
// classifications used across the RP22 Speaker Capability comparison:
// FULL DATA, GOOD DATA, LIMITED DATA.
//
// These labels describe the completeness and transparency of published
// manufacturer evidence — NOT loudspeaker sound quality. They never change
// P12/P13 calculations, evidence rules, stored classifications or product
// records.
//
// Two variants:
//   variant="section"  — the full explanation block, placed beneath the
//                        speaker comparison area / inside the RP22 reference
//                        section on the SPLCalculator page.
//   variant="compact"  — a condensed version embedded inside the existing
//                        info-icon popover (ComparisonDataStatusSection),
//                        so the same explanation is accessible wherever
//                        data-quality status is displayed.
//
// Visual style: subtle classification labels (small uppercase text in the
// existing tone colours), concise body text, no large warning panels, no
// coloured background fills.
// ---------------------------------------------------------------------------

import React from "react";

const BRAND = {
  border: "#DCDBD6",
  soft: "#F1F0EE",
  text: "#1B1A1A",
  subtext: "#3E4349",
  hint: "#625143",
};

// Subtle label tones — text colour only, no background fill or border.
const LABEL_TONE = {
  FULL: "#213428",
  GOOD: "#9A6E00",
  LIMITED: "#B23A3A",
};

const CLASSIFICATIONS = [
  {
    key: "FULL",
    label: "FULL DATA",
    text: "Manufacturer-published performance data allows a direct, transparent comparison with minimal assumptions.",
  },
  {
    key: "GOOD",
    label: "GOOD DATA",
    text: "Sufficient manufacturer specifications are available to calculate a reasonable performance estimate. Some assumptions are necessary, so the comparison is less transparent than Full Data. Calculated performance uses published power handling or the maximum recommended amplifier power as an explicitly identified assumption.",
  },
  {
    key: "LIMITED",
    label: "LIMITED DATA",
    text: "The manufacturer has not published enough information for a reliable calculation. Performance may be estimated with greater uncertainty, or left ungraded where there is insufficient evidence. Sound Proof does not present an unsupported numerical guess as a defensible RP22 prediction.",
  },
];

const STANDARD_STATEMENT =
  "All manufacturers are assessed using the same RP22 methodology. Where published information is limited, Sound Proof does not assume additional performance that the manufacturer has not substantiated.";

const SCOPE_NOTE =
  "These classifications describe the completeness and transparency of published manufacturer evidence, not loudspeaker sound quality.";

function ClassificationRow({ item, compact }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: compact ? "92px 1fr" : "110px 1fr",
        gap: 10,
        padding: compact ? "5px 0" : "7px 0",
        fontSize: compact ? 11 : 12,
        lineHeight: 1.45,
        alignItems: "baseline",
      }}
    >
      <div
        style={{
          fontSize: compact ? 10 : 10,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: LABEL_TONE[item.key],
          whiteSpace: "nowrap",
        }}
      >
        {item.label}
      </div>
      <div style={{ color: BRAND.subtext }}>{item.text}</div>
    </div>
  );
}

export default function DataQualityGuide({ variant = "section" }) {
  const compact = variant === "compact";

  if (compact) {
    return (
      <div
        style={{
          marginTop: 8,
          paddingTop: 8,
          borderTop: `1px solid ${BRAND.border}`,
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: BRAND.hint,
            marginBottom: 4,
          }}
        >
          Understanding data quality
        </div>
        <div style={{ display: "grid", gap: 0 }}>
          {CLASSIFICATIONS.map((item) => (
            <ClassificationRow key={item.key} item={item} compact />
          ))}
        </div>
        <div
          style={{
            marginTop: 6,
            fontSize: 10,
            lineHeight: 1.4,
            color: BRAND.hint,
            fontStyle: "italic",
          }}
        >
          {STANDARD_STATEMENT}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          fontSize: 15,
          fontWeight: 700,
          color: BRAND.text,
          marginBottom: 4,
        }}
      >
        Understanding data quality
      </div>
      <div
        style={{
          fontSize: 12,
          color: BRAND.subtext,
          lineHeight: 1.45,
          marginBottom: 10,
        }}
      >
        {SCOPE_NOTE}
      </div>

      <div
        style={{
          border: `1px solid ${BRAND.border}`,
          borderRadius: 12,
          padding: "8px 16px",
          background: "#FFF",
        }}
      >
        {CLASSIFICATIONS.map((item, idx) => (
          <div
            key={item.key}
            style={{
              borderTop: idx === 0 ? 0 : `1px solid ${BRAND.soft}`,
            }}
          >
            <ClassificationRow item={item} compact={false} />
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 10,
          fontSize: 11,
          lineHeight: 1.5,
          color: BRAND.hint,
          fontStyle: "italic",
        }}
      >
        {STANDARD_STATEMENT}
      </div>
    </div>
  );
}