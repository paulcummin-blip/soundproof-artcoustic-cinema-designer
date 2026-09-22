/**
 * Fixed presentation for the permanent P15/P21 design assumptions.
 *
 * Both parameters remain L2 until a measured result is published by the
 * engineering authority. This component is deliberately read-only: it cannot
 * create a competing grade or persistence path.
 */
import React from "react";
import RP22GradingPill from "@/components/ui/RP22GradingPill";
import { DEFAULT_ASSUMED_LEVEL } from "@/components/utils/assumedParameterAuthority";

const LABEL_FONT = "'Didact Gothic', 'Century Gothic', sans-serif";

export default function P15P21AssumptionControl({
  paramId,
  variant = "screen",
}) {
  const isP15 = Number(paramId) === 15;
  const detail = isP15
    ? "Design target: NCB 22"
    : "Early reflections have not been measured. Level 2 is used as the design assumption.";

  if (variant === "print") {
    return (
      <div
        className="p15-p21-assumption-note"
        style={{
          marginTop: "1.2mm",
          padding: "1.3mm 2mm",
          background: "#F8F7F5",
          borderRadius: 3,
          border: "1px solid #EFEEEA",
          fontSize: "7.4pt",
          color: "#625143",
          fontFamily: LABEL_FONT,
          lineHeight: 1.3,
          breakInside: "avoid",
          pageBreakInside: "avoid",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "1.5mm" }}>
          <strong style={{ color: "#1B1A1A" }}>Assumed</strong>
          <strong style={{ color: "#213428" }}>{DEFAULT_ASSUMED_LEVEL}</strong>
        </div>
        <div style={{ marginTop: "0.6mm" }}>{detail}</div>
      </div>
    );
  }

  return (
    <div
      style={{
        marginTop: 8,
        padding: "9px 10px",
        background: "#F8F7F5",
        borderRadius: 6,
        border: "1px solid #EFEEEA",
        fontFamily: LABEL_FONT,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: "#1B1A1A", letterSpacing: "0.02em" }}>
          Assumed
        </span>
        <RP22GradingPill level={DEFAULT_ASSUMED_LEVEL} />
      </div>
      <div style={{ marginTop: 6, fontSize: 10, lineHeight: 1.4, color: "#625143" }}>
        {detail}
      </div>
    </div>
  );
}
