import React, { useMemo } from "react";
import {
  isoToDisplayDate,
  PROMOTION_TYPE_LABELS,
  TARGET_SCOPE_LABELS,
  DEALER_GROUP_LABELS,
  getEligibleAccounts,
} from "./promotionStatus";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#3E4349",
  border: "#DCDBD6",
  card: "#FFFFFF",
  green: "#213428",
  amber: "#625143",
};

function formatDate(val) {
  if (!val) return "—";
  return isoToDisplayDate(val);
}

/**
 * Expandable usage panel for a promotion.
 * All data derived from PromotionUsage — no stored aggregate counters.
 *
 * Props:
 * - promotion: Promotion record
 * - usageRecords: PromotionUsage[] for this promotion
 * - allAccounts: Account[] (for resolving account names + eligible count)
 */
export default function PromotionUsagePanel({
  promotion,
  usageRecords,
  allAccounts,
}) {
  const eligibleAccounts = useMemo(
    () => getEligibleAccounts(allAccounts, promotion),
    [allAccounts, promotion]
  );

  // Group usage by account_id
  const byAccount = useMemo(() => {
    const map = new Map();
    if (!Array.isArray(usageRecords)) return map;
    for (const u of usageRecords) {
      if (u.promotion_id !== promotion?.id) continue;
      const aid = u.account_id;
      if (!map.has(aid)) map.set(aid, []);
      map.get(aid).push(u);
    }
    return map;
  }, [usageRecords, promotion]);

  const accountsUsedCount = byAccount.size;
  const totalProjects = usageRecords
    ? usageRecords.filter(u => u.promotion_id === promotion?.id).length
    : 0;

  // First/last use across all usage records
  const sortedUsage = useMemo(() => {
    const relevant = (usageRecords || []).filter(u => u.promotion_id === promotion?.id);
    return [...relevant].sort((a, b) =>
      new Date(a.used_at).getTime() - new Date(b.used_at).getTime()
    );
  }, [usageRecords, promotion]);

  const firstUse = sortedUsage.length > 0 ? sortedUsage[0].used_at : null;
  const lastUse = sortedUsage.length > 0 ? sortedUsage[sortedUsage.length - 1].used_at : null;

  // Build dealer rows
  const dealerRows = useMemo(() => {
    const rows = [];
    for (const [aid, records] of byAccount) {
      const account = allAccounts?.find(a => a.id === aid);
      const sorted = [...records].sort((a, b) =>
        new Date(a.used_at).getTime() - new Date(b.used_at).getTime()
      );
      rows.push({
        id: aid,
        name: account?.name || "Unknown",
        count: records.length,
        firstUse: sorted[0]?.used_at || null,
        lastUse: sorted[sorted.length - 1]?.used_at || null,
      });
    }
    return rows.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [byAccount, allAccounts]);

  return (
    <div style={{
      background: BRAND.card,
      border: `1px solid ${BRAND.border}`,
      borderRadius: 10,
      padding: "14px 18px",
      marginBottom: 12,
    }}>
      {/* Summary */}
      <div style={{
        fontSize: 10, fontWeight: 700, color: BRAND.subtext,
        textTransform: "uppercase", letterSpacing: "0.06em",
        marginBottom: 10,
      }}>
        Usage — {PROMOTION_TYPE_LABELS[promotion?.promotion_type] || ""}
      </div>

      <div style={{
        display: "flex", gap: 24, flexWrap: "wrap",
        marginBottom: 14, paddingBottom: 12,
        borderBottom: `1px solid ${BRAND.border}`,
      }}>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: BRAND.subtext, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Eligible accounts
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: BRAND.text }}>
            {eligibleAccounts.length}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: BRAND.subtext, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Accounts that used
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
            {totalProjects}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: BRAND.subtext, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            First use
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: BRAND.text }}>
            {formatDate(firstUse)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: BRAND.subtext, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Last use
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: BRAND.text }}>
            {formatDate(lastUse)}
          </div>
        </div>
      </div>

      {/* Dealer rows */}
      {dealerRows.length === 0 ? (
        <div style={{ fontSize: 12, color: BRAND.subtext, padding: "8px 0" }}>
          No dealers have used this promotion yet.
        </div>
      ) : (
        <div>
          {/* Header */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr 1fr 1fr",
            padding: "6px 0",
            fontSize: 9, fontWeight: 700, color: BRAND.subtext,
            textTransform: "uppercase", letterSpacing: "0.05em",
            borderBottom: `1px solid ${BRAND.border}`,
          }}>
            <div>Dealer</div>
            <div style={{ textAlign: "right" }}>Promo Projects Created</div>
            <div style={{ textAlign: "right" }}>First Use</div>
            <div style={{ textAlign: "right" }}>Last Use</div>
          </div>
          {/* Rows */}
          {dealerRows.map((row, i) => (
            <div key={row.id} style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr 1fr 1fr",
              padding: "8px 0",
              fontSize: 12,
              borderBottom: i < dealerRows.length - 1 ? `1px solid ${BRAND.border}` : "none",
              alignItems: "center",
            }}>
              <div style={{ fontWeight: 600, color: BRAND.text }}>{row.name}</div>
              <div style={{ textAlign: "right", fontWeight: 700, color: BRAND.green }}>{row.count}</div>
              <div style={{ textAlign: "right", color: BRAND.subtext, fontSize: 11 }}>{formatDate(row.firstUse)}</div>
              <div style={{ textAlign: "right", color: BRAND.subtext, fontSize: 11 }}>{formatDate(row.lastUse)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}