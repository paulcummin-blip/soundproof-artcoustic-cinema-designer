/**
 * P15P21AssumptionControl.jsx
 * ---------------------------
 * Compact "Manual design estimate" selector for P15/P21 parameters.
 *
 * Screen mode: interactive <select> wired to the existing AppState safe setters.
 * Print mode:  read-only descriptive text using the existing P15/P21 mapping/label authority.
 *
 * No local state — the value is owned by AppState and persisted via the normal
 * autosave path. A change immediately updates the existing P15/P21 authority
 * and therefore any dependent ASDR/compliance presentation.
 */

import React from "react";

const P15_OPTIONS = [
  { value: "standard", label: "Standard domestic room (NCB 26 · L1)" },
  { value: "purpose-built", label: "Purpose-built home cinema (NCB 22 · L2)" },
  { value: "reference", label: "Reference-grade isolated room (NCB 18 · L3)" },
  { value: "studio", label: "Studio / screening-room grade (NCB 15 · L4)" },
];

const P21_OPTIONS = [
  { value: "l1", label: "No estimate / not applicable (N/A)" },
  { value: "l2", label: "Moderately live room (−8 dB · L2)" },
  { value: "l3", label: "Well-balanced treated room (−10 dB · L3)" },
  { value: "l4", label: "Heavily optimised room (−12 dB · L4)" },
];

const LABEL_FONT = "'Didact Gothic', 'Century Gothic', sans-serif";

export default function P15P21AssumptionControl({
  paramId,
  value,
  onChange,
  variant = "screen",
}) {
  const isP15 = paramId === 15;
  const options = isP15 ? P15_OPTIONS : P21_OPTIONS;
  const currentValue = value || (isP15 ? "purpose-built" : "l3");
  const selectedOption = options.find((o) => o.value === currentValue) || options[0];

  // Print mode: read-only descriptive text
  if (variant === "print") {
    return (
      <div
        style={{
          marginTop: "1.5mm",
          padding: "1.5mm 2mm",
          background: "#F8F7F5",
          borderRadius: 3,
          border: "1px solid #EFEEEA",
          fontSize: "8pt",
          color: "#625143",
          fontFamily: LABEL_FONT,
          lineHeight: 1.3,
        }}
      >
        <strong style={{ fontWeight: 600, color: "#1B1A1A" }}>Manual design estimate: </strong>
        {selectedOption.label}
      </div>
    );
  }

  // Screen mode: interactive selector
  return (
    <div
      style={{
        marginTop: 8,
        padding: "8px 10px",
        background: "#F8F7F5",
        borderRadius: 6,
        border: "1px solid #EFEEEA",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "#1B1A1A",
          marginBottom: 4,
          fontFamily: LABEL_FONT,
          letterSpacing: "0.02em",
        }}
      >
        Manual design estimate
      </div>
      <select
        style={{
          width: "100%",
          padding: "5px 8px",
          fontSize: 12,
          border: "1px solid #DCDBD6",
          borderRadius: 4,
          background: "#fff",
          color: "#1B1A1A",
          cursor: "pointer",
          fontFamily: LABEL_FONT,
        }}
        value={currentValue}
        onChange={(e) => onChange?.(e.target.value)}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}