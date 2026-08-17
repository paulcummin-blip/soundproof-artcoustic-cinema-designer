import React from "react";
import {
  deriveDisplayStatus,
  isoToDisplayDate,
  isoToEndDisplayDate,
  PROMOTION_TYPE_LABELS,
  TARGET_SCOPE_LABELS,
  DEALER_GROUP_LABELS,
} from "./promotionStatus";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#3E4349",
  border: "#DCDBD6",
  card: "#FFFFFF",
  green: "#213428",
  amber: "#625143",
  red: "#B23A3A",
  blue: "#2C5AA0",
};

const STATUS_COLORS = {
  Active: "#213428",
  Scheduled: "#2C5AA0",
  Draft: "#625143",
  Expired: "#3E4349",
  Cancelled: "#B23A3A",
};

function StatusBadge({ status }) {
  const color = STATUS_COLORS[status] || BRAND.subtext;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 8px", borderRadius: 999,
      border: `1px solid ${BRAND.border}`,
      background: BRAND.card, fontSize: 10, fontWeight: 700, color,
      textTransform: "uppercase", letterSpacing: "0.04em",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
      {status}
    </span>
  );
}

/**
 * Compact promotion card shown under a dealer-group heading.
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

  return (
    <div style={{
      background: BRAND.card,
      border: `1px solid ${BRAND.border}`,
      borderRadius: 10,
      padding: "14px 18px",
      marginBottom: 12,
    }}>
      {/* Header row */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexWrap: "wrap", gap: 8, marginBottom: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            fontSize: 10, fontWeight: 700, color: BRAND.subtext,
            textTransform: "uppercase", letterSpacing: "0.06em",
          }}>
            {status === "Active" ? "Active Promotion" : "Promotion"}
          </span>
          <StatusBadge status={status} />
        </div>
      </div>

      {/* Title + dates */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: BRAND.text }}>
          {PROMOTION_TYPE_LABELS[promotion.promotion_type] || promotion.promotion_type}
        </div>
        <div style={{ fontSize: 12, color: BRAND.subtext, marginTop: 4, display: "flex", gap: 16, flexWrap: "wrap" }}>
          <span>From: <strong style={{ color: BRAND.text }}>{isoToDisplayDate(promotion.starts_at)}</strong></span>
          <span>To: <strong style={{ color: BRAND.text }}>{isoToEndDisplayDate(promotion.ends_at)}</strong></span>
        </div>
      </div>

      {/* Target info */}
      <div style={{ fontSize: 11, color: BRAND.subtext, marginBottom: 10 }}>
        Target: {TARGET_SCOPE_LABELS[promotion.target_scope] || promotion.target_scope}
        {promotion.target_scope === "ALL_DEALER_GROUP" && promotion.target_dealer_group
          ? ` — ${DEALER_GROUP_LABELS[promotion.target_dealer_group] || promotion.target_dealer_group}`
          : ""}
      </div>

      {/* Stats row */}
      <div style={{
        display: "flex", gap: 24, flexWrap: "wrap",
        paddingTop: 10, borderTop: `1px solid ${BRAND.border}`,
        marginBottom: 10,
      }}>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: BRAND.subtext, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Eligible accounts
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: BRAND.text }}>
            {eligibleCount}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: BRAND.subtext, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Accounts used
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: BRAND.text }}>
            {accountsUsedCount}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: BRAND.subtext, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Promo projects created
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: BRAND.green }}>
            {usageCount}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          onClick={onEdit}
          style={{
            padding: "6px 12px", borderRadius: 8,
            border: `1px solid ${BRAND.border}`,
            background: BRAND.card, color: BRAND.text,
            fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}
        >
          Edit
        </button>
        <button
          onClick={onViewUsage}
          style={{
            padding: "6px 12px", borderRadius: 8,
            border: `1px solid ${BRAND.border}`,
            background: BRAND.card, color: BRAND.text,
            fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}
        >
          View Usage
        </button>
        {canEndEarly && (
          <button
            onClick={onEndEarly}
            style={{
              padding: "6px 12px", borderRadius: 8,
              border: `1px solid ${BRAND.red}`,
              background: "transparent", color: BRAND.red,
              fontSize: 12, fontWeight: 600, cursor: "pointer",
            }}
          >
            End Early
          </button>
        )}
      </div>
    </div>
  );
}