import React from "react";
import {
  deriveDisplayStatus,
  isoToDisplayDate,
  isoToEndDisplayDate,
  PROMOTION_TYPE_LABELS,
} from "./promotionStatus";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#3E4349",
  border: "#DCDBD6",
  card: "#FFFFFF",
  green: "#213428",
  amber: "#625143",
  red: "#B23A3A",
};

// Max message length to display inline — longer messages are omitted to
// keep the group overview clean.
const MAX_MESSAGE_LEN = 140;

/**
 * Compact live-promotion summary shown under a dealer-group heading.
 *
 * Layout (P2.1C):
 *   PROMOTION LIVE
 *   Unlimited Professional Projects
 *   17 Aug 2026 → 31 Dec 2026
 *   [message if short enough]
 *   Eligible 25 · Used 0 · Promo Projects 0
 *   Edit · View Usage · End Early
 *
 * Props:
 * - promotion: Promotion record
 * - eligibleCount: number of eligible accounts
 * - usageCount: number of PromotionUsage records
 * - accountsUsedCount: distinct accounts that used the promotion
 * - onEdit: () => void
 * - onViewUsage: () => void
 * - onEndEarly: () => void
 */
export default function PromotionCard({
  promotion,
  eligibleCount,
  usageCount,
  accountsUsedCount,
  onEdit,
  onViewUsage,
  onEndEarly,
}) {
  if (!promotion) return null;
  const status = deriveDisplayStatus(promotion);
  const canEndEarly = status === "Active" || status === "Scheduled";

  // Dealer-facing headline, falling back to the promotion-type label.
  const headline = promotion.headline || PROMOTION_TYPE_LABELS[promotion.promotion_type] || "Promotion";

  // Date range with → arrow (London timezone, inclusive end date).
  const dateRange = `${isoToDisplayDate(promotion.starts_at)} → ${isoToEndDisplayDate(promotion.ends_at)}`;

  // Message — only if short enough to remain clean.
  const rawMessage = (promotion.message || "").trim();
  const showMessage = rawMessage && rawMessage.length <= MAX_MESSAGE_LEN;
  const messageText = showMessage
    ? (rawMessage.length > MAX_MESSAGE_LEN - 3
        ? rawMessage.slice(0, MAX_MESSAGE_LEN - 3) + "…"
        : rawMessage)
    : null;

  return (
    <div style={{
      background: BRAND.card,
      border: `1px solid ${BRAND.border}`,
      borderLeft: `3px solid ${BRAND.green}`,
      borderRadius: 8,
      padding: "10px 14px",
      marginBottom: 8,
    }}>
      {/* Status label */}
      <div style={{
        fontSize: 9, fontWeight: 700, color: BRAND.green,
        textTransform: "uppercase", letterSpacing: "0.08em",
        marginBottom: 4,
      }}>
        Promotion Live
      </div>

      {/* Headline */}
      <div style={{ fontSize: 14, fontWeight: 700, color: BRAND.text, marginBottom: 2 }}>
        {headline}
      </div>

      {/* Date range */}
      <div style={{ fontSize: 12, color: BRAND.subtext, marginBottom: 4 }}>
        {dateRange}
      </div>

      {/* Message (only if short) */}
      {messageText && (
        <div style={{ fontSize: 11, color: BRAND.subtext, marginBottom: 4, lineHeight: 1.4 }}>
          {messageText}
        </div>
      )}

      {/* Usage summary — one line */}
      <div style={{ fontSize: 11, color: BRAND.subtext, marginBottom: 6 }}>
        Eligible <strong style={{ color: BRAND.text }}>{eligibleCount}</strong>
        {" · "}Used <strong style={{ color: BRAND.text }}>{accountsUsedCount}</strong>
        {" · "}Promo Projects <strong style={{ color: BRAND.green }}>{usageCount}</strong>
      </div>

      {/* Inline actions */}
      <div style={{ fontSize: 11, display: "flex", gap: 6, alignItems: "center" }}>
        <ActionLink onClick={onEdit} label="Edit" />
        <Separator />
        <ActionLink onClick={onViewUsage} label="View Usage" />
        {canEndEarly && (
          <>
            <Separator />
            <ActionLink onClick={onEndEarly} label="End Early" color={BRAND.red} />
          </>
        )}
      </div>
    </div>
  );
}

function ActionLink({ onClick, label, color }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: 0, border: "none", background: "transparent",
        color: color || BRAND.blue, fontSize: 11, fontWeight: 600,
        cursor: "pointer", textDecoration: "none",
      }}
      onMouseEnter={e => { e.currentTarget.style.textDecoration = "underline"; }}
      onMouseLeave={e => { e.currentTarget.style.textDecoration = "none"; }}
    >
      {label}
    </button>
  );
}

function Separator() {
  return <span style={{ color: BRAND.border, fontSize: 11 }}>·</span>;
}