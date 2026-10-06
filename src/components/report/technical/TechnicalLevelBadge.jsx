/**
 * TechnicalLevelBadge.jsx
 * ------------------------
 * Rectangular level badge for the Technical Report parameter cards.
 * Never circular — always a flat rectangle per the design specification.
 *
 * Semantic colours come from the canonical RP22_GRADE_TOKENS authority
 * (same tokens as the app pill).  Only the form factor is distinct.
 *
 * Sizes:
 *   "normal" — 38×28px (card result area)
 *   "small"  — 26×18px (seat grid cells)
 */

import React from "react";
import { resolveGradeToken } from "@/components/utils/rp22Colors";
import { REPORT_FONT_HEADING } from "@/components/report/typography/reportTypography";

const normalizeLevel = (lvl) => {
  if (typeof lvl === "number" && lvl >= 1 && lvl <= 4) return lvl;
  const m = String(lvl || "").trim().toUpperCase().match(/^L([1-4])$/);
  if (m) return parseInt(m[1], 10);
  return null;
};

export default function TechnicalLevelBadge({ level, size = "normal" }) {
  const n = normalizeLevel(level);
  const isFail = String(level || "").trim().toUpperCase() === "FAIL";
  const { token } = resolveGradeToken(isFail ? "FAIL" : n ?? "—");
  const label = n ? `L${n}` : isFail ? "FAIL" : "—";

  const dims =
    size === "small"
      ? { w: 26, h: 18, fs: "8pt", rad: 3, bw: 1 }
      : { w: 38, h: 28, fs: "12pt", rad: 4, bw: 1.5 };

  return (
    <div
      className={size === "small" ? "tech-seat-badge" : undefined}
      style={{
        width: dims.w,
        height: dims.h,
        minWidth: dims.w,
        borderRadius: dims.rad,
        border: `${dims.bw}px solid ${token.border}`,
        background: token.bg,
        color: token.text,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        // box-sizing keeps the border inside the fixed box, so every badge in a
        // row is the same size; line-height 1 plus the centred flex alignment
        // places the label centrally in the browser and in the exported PDF.
        boxSizing: "border-box",
        textAlign: "center",
        fontSize: dims.fs,
        fontWeight: 700,
        // The shared brand heading face — never a one-off stack.
        fontFamily: REPORT_FONT_HEADING,
        flexShrink: 0,
        lineHeight: 1,
        letterSpacing: "0.02em",
      }}
    >
      {label}
    </div>
  );
}