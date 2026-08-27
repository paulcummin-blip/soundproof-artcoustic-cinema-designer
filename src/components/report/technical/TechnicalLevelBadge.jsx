/**
 * TechnicalLevelBadge.jsx
 * ------------------------
 * Rectangular level badge for the Technical Report parameter cards.
 * Never circular — always a flat rectangle per the design specification.
 *
 * Sizes:
 *   "normal" — 38×28px (card result area)
 *   "small"  — 26×18px (seat grid cells)
 */

import React from "react";
import { getLevelColors } from "@/components/utils/rp22Colors";

const normalizeLevel = (lvl) => {
  if (typeof lvl === "number" && lvl >= 1 && lvl <= 4) return lvl;
  const m = String(lvl || "").trim().toUpperCase().match(/^L([1-4])$/);
  if (m) return parseInt(m[1], 10);
  return null;
};

export default function TechnicalLevelBadge({ level, size = "normal" }) {
  const n = normalizeLevel(level);
  const isFail = String(level || "").trim().toUpperCase() === "FAIL";
  const colors = isFail
    ? { bg: "#F8F8F7", text: "#DC2626", border: "#E6E4DD" }
    : n
    ? getLevelColors(n)
    : { bg: "#F3F4F6", text: "#9CA3AF", border: "#E5E7EB" };

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
        border: `${dims.bw}px solid ${colors.border}`,
        background: colors.bg,
        color: colors.text,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: dims.fs,
        fontWeight: 700,
        fontFamily: "'Futura PT Light', 'Century Gothic', sans-serif",
        flexShrink: 0,
        lineHeight: 1,
        letterSpacing: "0.02em",
      }}
    >
      {label}
    </div>
  );
}