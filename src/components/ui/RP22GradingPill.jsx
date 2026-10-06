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
import { REPORT_FONT_HEADING } from "@/components/report/typography/reportTypography";

/**
 * Variants change size only. Each carries a FIXED height and a minimum width, so
 * every pill in a row is the same box and no label can drift high or low.
 * Vertical padding is zero: the height plus centred flex alignment places the
 * label, and box-sizing keeps the border inside the box.
 */
const VARIANT_SIZES = {
  app:     { height: 28, padding: "0 12px", fontSize: "13px", radius: "6px", minWidth: "44px", fontWeight: 600 },
  compact: { height: 20, padding: "0 7px",  fontSize: "10px", radius: "5px", minWidth: "36px", fontWeight: 700 },
  report:  { height: 22, padding: "0 9px",  fontSize: "11px", radius: "4px", minWidth: "38px", fontWeight: 600 },
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
    height: size.height,
    boxSizing: "border-box",
    fontSize: size.fontSize,
    fontFamily: REPORT_FONT_HEADING,
    fontWeight: token.solid ? 700 : size.fontWeight,
    // line-height 1 on a fixed, border-box height: the label's line box is the
    // text height, so flex centring places it dead centre in the browser and in
    // the exported PDF alike.
    lineHeight: 1,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    verticalAlign: "middle",
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