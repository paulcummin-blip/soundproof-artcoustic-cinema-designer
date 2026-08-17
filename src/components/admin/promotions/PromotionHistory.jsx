import React, { useState, useMemo } from "react";
import {
  deriveDisplayStatus,
  formatDateRange,
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

const STATUS_COLORS = {
  Expired: "#3E4349",
  Cancelled: "#B23A3A",
  Draft: "#625143",
  Scheduled: "#2C5AA0",
  Active: "#213428",
};

/**
 * Collapsed promotion history section for a dealer group.
 * Shows finished/cancelled/expired promotions.
 *
 * Props:
 * - promotions: Promotion[] belonging to this group (non-active)
 * - usageRecords: PromotionUsage[] (all, filtered internally)
 */
export default function PromotionHistory({ promotions, usageRecords }) {
  const [expanded, setExpanded] = useState(false);

  // Only show non-active promotions (Expired, Cancelled, Draft)
  const historyPromos = useMemo(() => {
    if (!promotions) return [];
    return promotions.filter(p => {
      const s = deriveDisplayStatus(p);
      return s === "Expired" || s === "Cancelled" || s === "Draft";
    });
  }, [promotions]);

  if (historyPromos.length === 0) return null;

  const usageCountFor = (promoId) => {
    if (!usageRecords) return 0;
    return usageRecords.filter(u => u.promotion_id === promoId).length;
  };

  const accountsUsedFor = (promoId) => {
    if (!usageRecords) return 0;
    const ids = new Set(usageRecords.filter(u => u.promotion_id === promoId).map(u => u.account_id));
    return ids.size;
  };

  return (
    <div style={{ marginTop: 8, marginBottom: 12 }}>
      {/* Toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "6px 10px", borderRadius: 8,
          border: `1px solid ${BRAND.border}`,
          background: BRAND.card, cursor: "pointer",
          fontSize: 12, fontWeight: 600, color: BRAND.subtext,
        }}
      >
        <span style={{ fontSize: 10 }}>{expanded ? "▾" : "▸"}</span>
        Promotion History ({historyPromos.length})
      </button>

      {expanded && (
        <div style={{
          marginTop: 8, background: BRAND.card,
          border: `1px solid ${BRAND.border}`,
          borderRadius: 10, overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "2fr 2fr 1fr 1fr 1fr",
            padding: "8px 12px",
            background: "rgb(244 243 241)",
            borderBottom: `1px solid ${BRAND.border}`,
            fontSize: 9, fontWeight: 700, color: BRAND.subtext,
            textTransform: "uppercase", letterSpacing: "0.05em",
          }}>
            <div>Name</div>
            <div>Dates</div>
            <div>Status</div>
            <div style={{ textAlign: "right" }}>Accounts Used</div>
            <div style={{ textAlign: "right" }}>Promo Projects</div>
          </div>

          {/* Rows */}
          {historyPromos.map((promo, i) => {
            const status = deriveDisplayStatus(promo);
            const color = STATUS_COLORS[status] || BRAND.subtext;
            return (
              <div key={promo.id} style={{
                display: "grid",
                gridTemplateColumns: "2fr 2fr 1fr 1fr 1fr",
                padding: "10px 12px",
                borderBottom: i < historyPromos.length - 1 ? `1px solid ${BRAND.border}` : "none",
                fontSize: 12, alignItems: "center",
              }}>
                <div style={{ fontWeight: 600, color: BRAND.text }}>
                  {promo.name || "—"}
                  {promo.promotion_type && promo.promotion_type !== "UNLIMITED_PRO_PROJECTS" && (
                    <span style={{ fontSize: 10, color: BRAND.subtext, marginLeft: 4 }}>
                      ({PROMOTION_TYPE_LABELS[promo.promotion_type] || promo.promotion_type})
                    </span>
                  )}
                </div>
                <div style={{ color: BRAND.subtext, fontSize: 11 }}>
                  {formatDateRange(promo.starts_at, promo.ends_at)}
                </div>
                <div>
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    padding: "2px 6px", borderRadius: 999,
                    border: `1px solid ${BRAND.border}`,
                    fontSize: 10, fontWeight: 600, color,
                  }}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: color }} />
                    {status}
                  </span>
                </div>
                <div style={{ textAlign: "right", color: BRAND.subtext }}>
                  {accountsUsedFor(promo.id)}
                </div>
                <div style={{ textAlign: "right", fontWeight: 600, color: BRAND.green }}>
                  {usageCountFor(promo.id)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}