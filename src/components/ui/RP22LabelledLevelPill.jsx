/**
 * RP22LabelledLevelPill — a named RP22 result shown with the canonical pill.
 * ---------------------------------------------------------------------------
 * The one way to display a NAMED level result outside a table cell, for
 * example "RP22 P13 (Surrounds)" beside its L3 pill. The label is plain text;
 * the level itself is always the shared RP22GradingPill, so its colours,
 * border, dimensions and typography come from the single grading authority
 * (rp22Colors.jsx) and never from a second set of styling rules.
 *
 * Props:
 *   label  — the parameter/result name, e.g. "RP22 P12"
 *   level  — 1-4 | "L1"-"L4" | 0 | "FAIL" | "N/A" | null
 *            A result that could not be computed has always read FAIL here, so
 *            a missing level keeps that meaning rather than becoming a dash.
 */

import RP22GradingPill from "@/components/ui/RP22GradingPill";

export default function RP22LabelledLevelPill({ label, level }) {
  return (
    <div
      style={{
        marginTop: 12,
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
      }}
    >
      {label ? (
        <span style={{ fontSize: 13, fontWeight: 600, color: "#3E4349" }}>
          {label}
        </span>
      ) : null}
      <RP22GradingPill level={level == null ? "FAIL" : level} />
    </div>
  );
}