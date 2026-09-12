/**
 * RP22GradingPill.jsx — CANONICAL RP22 GRADING PILL
 * --------------------------------------------------
 * The single semantic grading-pill component for the entire Sound Proof app
 * and all report surfaces.  One component, multiple size/context variants.
 *
 * Colours come exclusively from RP22_GRADE_TOKENS (rp22Colors.jsx).
 * Variants change ONLY dimensions, font size and padding — never colours or
 * semantic treatment.  L3 in the app looks like the same L3 in the report.
 *
 * Props:
 *   level    — 1-4 | "L1"-"L4" | 0 | "FAIL" | "SEAT" | "N/A" |
 *              "NOT CALCULATED" | "—" | "-" | undefined
 *   variant  — "app" (default) | "compact" | "report"
 *   compact  — (legacy boolean) maps to variant="compact" for backward compat
 *   count    — optional number appended as ": N" (legacy)
 *   children — optional override label
 *   style    — optional inline style merge
 */

import { resolveGradeToken } from "@/components/utils/rp22Colors";

const VARIANT_SIZES = {
  app:     { padding: "6px 12px", fontSize: "13px", radius: "6px", minWidth: "44px", fontWeight: 600 },
  compact: { padding: "3px 7px",  fontSize: "10px", radius: "5px", minWidth: "36px", fontWeight: 700 },
  report:  { padding: "4px 9px",  fontSize: "11px", radius: "4px", minWidth: "38px", fontWeight: 600 },
};

export default function RP22GradingPill({ level, variant, compact = false, count, children, style }) {
  // Legacy: compact boolean maps to variant="compact" unless an explicit variant is passed.
  const resolvedVariant = variant || (compact ? "compact" : "app");
  const { token, label: baseLabel } = resolveGradeToken(level);
  const label = children ?? (count !== undefined ? `${baseLabel}: ${count}` : baseLabel);

  const size = VARIANT_SIZES[resolvedVariant] || VARIANT_SIZES.app;

  const styleBase = {
    border: `1px solid ${token.border}`,
    borderRadius: size.radius,
    padding: size.padding,
    fontSize: size.fontSize,
    fontWeight: token.solid ? 700 : size.fontWeight,
    lineHeight: "1.2",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    background: token.bg,
    color: token.text,
    whiteSpace: "nowrap",
    minWidth: size.minWidth,
    letterSpacing: "0.01em",
    ...style,
  };

  return <span style={styleBase}>{label}</span>;
}