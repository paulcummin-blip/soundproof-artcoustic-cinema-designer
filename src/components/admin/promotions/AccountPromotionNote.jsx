import React, { useMemo } from "react";
import {
  isEffective,
  formatEndsLabel,
  PROMOTION_TYPE_LABELS,
  matchesTarget,
} from "./promotionStatus";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#3E4349",
  border: "#DCDBD6",
  card: "#FFFFFF",
  green: "#213428",
};

/**
 * Small admin-only note shown on AccountDashboard when the account
 * is eligible for an active promotion.
 *
 * Props:
 * - account: Account record
 * - promotions: Promotion[] (all)
 * - promotionUsage: PromotionUsage[] (all)
 */
export default function AccountPromotionNote({ account, promotions, promotionUsage }) {
  // Only ALL_DEALER_GROUP promotions are shown here as a general eligibility note.
  // SINGLE_ACCOUNT promotions are shown in the dedicated TargetedPromotionPanel
  // on the AccountDashboard, not here.
  const activePromo = useMemo(() => {
    if (!promotions || !account) return null;
    return promotions.find(p =>
      p.promotion_type === "UNLIMITED_PRO_PROJECTS" &&
      p.target_scope === "ALL_DEALER_GROUP" &&
      isEffective(p) &&
      matchesTarget(p, account)
    ) || null;
  }, [promotions, account]);

  const accountUsageCount = useMemo(() => {
    if (!activePromo || !promotionUsage) return 0;
    return promotionUsage.filter(
      u => u.promotion_id === activePromo.id && u.account_id === account.id
    ).length;
  }, [activePromo, promotionUsage, account]);

  if (!activePromo) return null;

  return (
    <div style={{
      background: BRAND.card,
      border: `1px solid ${BRAND.green}`,
      borderRadius: 10,
      padding: "12px 16px",
      marginBottom: 16,
    }}>
      <div style={{
        fontSize: 10, fontWeight: 700, color: BRAND.green,
        textTransform: "uppercase", letterSpacing: "0.06em",
        marginBottom: 4,
      }}>
        Active Promotion
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: BRAND.text }}>
        {PROMOTION_TYPE_LABELS[activePromo.promotion_type] || activePromo.promotion_type}
      </div>
      <div style={{ fontSize: 12, color: BRAND.subtext, marginTop: 2 }}>
        {formatEndsLabel(activePromo.ends_at)}
      </div>
      <div style={{ fontSize: 12, color: BRAND.subtext, marginTop: 6 }}>
        Promo projects created by this account: <strong style={{ color: BRAND.green }}>{accountUsageCount}</strong>
      </div>
    </div>
  );
}