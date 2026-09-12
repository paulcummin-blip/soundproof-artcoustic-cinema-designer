/**
 * SeatScopeBadge.jsx
 * ------------------
 * Neutral "SEAT" scope badge for seat-scoped RP22 parameters.
 * Uses the canonical SEAT token from RP22_GRADE_TOKENS so the neutral
 * treatment is consistent with the rest of the pill system.
 *
 * Props:
 *   variant — "screen" (default) or "print"
 */
import { RP22_GRADE_TOKENS } from "@/components/utils/rp22Colors";

export default function SeatScopeBadge({ variant = "screen" }) {
  const t = RP22_GRADE_TOKENS.SEAT;
  const s = variant === "print"
    ? { padding: "4px 8px", fontSize: "10pt", rad: 4, bw: 1 }
    : { padding: "4px 10px", fontSize: "11px", rad: 6, bw: 1 };

  return (
    <span
      style={{
        border: `${s.bw}px solid ${t.border}`,
        borderRadius: s.rad,
        padding: s.padding,
        fontSize: s.fontSize,
        fontWeight: 600,
        background: t.bg,
        color: t.text,
        whiteSpace: "nowrap",
        lineHeight: "1.2",
        letterSpacing: "0.04em",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      SEAT
    </span>
  );
}