/**
 * SeatScopeBadge.jsx
 * ------------------
 * Neutral "SEAT" scope badge for seat-scoped RP22 parameters.
 *
 * White background, black text, subtle border — no performance colour.
 * Used in both screen (RP22ComplianceParameterTile) and print
 * (TechnicalParameterCard) variants to replace the single L-level badge
 * that was incorrectly shown for seat-scoped parameters.
 *
 * Props:
 *   variant — "screen" (default) or "print"
 */
export default function SeatScopeBadge({ variant = "screen" }) {
  const s = variant === "print"
    ? { padding: "4px 8px", fontSize: "10pt", rad: 4, bw: 1 }
    : { padding: "4px 10px", fontSize: "11px", rad: 6, bw: 1 };

  return (
    <span
      style={{
        border: `${s.bw}px solid #D9D5CE`,
        borderRadius: s.rad,
        padding: s.padding,
        fontSize: s.fontSize,
        fontWeight: 600,
        background: "#FFFFFF",
        color: "#1B1A1A",
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