import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import {
  isEffective,
  matchesTarget,
  deriveDisplayStatus,
  PROMOTION_TYPE_LABELS,
} from "./promotionStatus";
import PromotionFormDialog from "./PromotionFormDialog";
import PromotionUsagePanel from "./PromotionUsagePanel";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#3E4349",
  border: "#DCDBD6",
  card: "#FFFFFF",
  green: "#213428",
  amber: "#625143",
  red: "#B23A3A",
};

function formatDate(val) {
  if (!val) return "—";
  try {
    return new Date(val).toLocaleDateString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
    });
  } catch {
    return "—";
  }
}

/**
 * Admin-only panel shown on AccountDashboard for SINGLE_ACCOUNT promotions
 * targeting this specific account.
 *
 * Shows headline, date range, promotion type, status, and admin actions
 * (Edit, View Usage, End Early).
 *
 * Props:
 * - account: Account record
 * - promotions: Promotion[] (all)
 * - promotionUsage: PromotionUsage[] (all)
 * - allAccounts: Account[] (for PromotionFormDialog)
 * - onPromotionsChanged: () => void (refresh callback)
 */
export default function TargetedPromotionPanel({
  account,
  promotions,
  promotionUsage,
  allAccounts,
  onPromotionsChanged,
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [editPromotion, setEditPromotion] = useState(null);
  const [usagePromotionId, setUsagePromotionId] = useState(null);
  const [endConfirm, setEndConfirm] = useState(null);
  const [ending, setEnding] = useState(false);

  // SINGLE_ACCOUNT promotions targeting this account that are currently effective.
  const targetedPromos = useMemo(() => {
    if (!promotions || !account) return [];
    return promotions.filter(p =>
      p.target_scope === "SINGLE_ACCOUNT" &&
      isEffective(p) &&
      matchesTarget(p, account)
    );
  }, [promotions, account]);

  if (targetedPromos.length === 0) return null;

  async function handleEndEarly() {
    if (!endConfirm) return;
    setEnding(true);
    try {
      await base44.entities.Promotion.update(endConfirm.id, { status: "CANCELLED" });
      setEndConfirm(null);
      onPromotionsChanged?.();
    } catch (err) {
      // Keep dialog open on error
    } finally {
      setEnding(false);
    }
  }

  function handleEdit(promo) {
    setEditPromotion(promo);
    setFormOpen(true);
  }

  function handleFormSaved() {
    setFormOpen(false);
    setEditPromotion(null);
    onPromotionsChanged?.();
  }

  return (
    <>
      {targetedPromos.map(promo => {
        const status = deriveDisplayStatus(promo);
        const usageCount = (promotionUsage || []).filter(
          u => u.promotion_id === promo.id && u.account_id === account.id
        ).length;

        return (
          <div key={promo.id} style={{
            background: BRAND.card,
            border: `1px solid ${BRAND.green}`,
            borderRadius: 10,
            padding: "14px 18px",
            marginBottom: 16,
          }}>
            <div style={{
              fontSize: 10, fontWeight: 700, color: BRAND.green,
              textTransform: "uppercase", letterSpacing: "0.06em",
              marginBottom: 6,
            }}>
              Targeted Promotion
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: BRAND.text }}>
              {promo.headline || promo.name || "Promotion"}
            </div>
            <div style={{ fontSize: 12, color: BRAND.subtext, marginTop: 4 }}>
              {formatDate(promo.starts_at)} → {formatDate(promo.ends_at)}
            </div>
            <div style={{ fontSize: 12, color: BRAND.subtext, marginTop: 4 }}>
              {PROMOTION_TYPE_LABELS[promo.promotion_type] || promo.promotion_type}
              {" · "}
              {status}
              {" · "}
              Used {usageCount}
            </div>

            {/* Admin actions */}
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button
                onClick={() => handleEdit(promo)}
                style={actionBtnStyle(BRAND.card, BRAND.text, BRAND.border)}
              >
                Edit
              </button>
              <button
                onClick={() =>
                  setUsagePromotionId(prev => prev === promo.id ? null : promo.id)
                }
                style={actionBtnStyle(BRAND.card, BRAND.text, BRAND.border)}
              >
                View Usage
              </button>
              <button
                onClick={() => setEndConfirm(promo)}
                style={actionBtnStyle(BRAND.card, BRAND.red, BRAND.border)}
              >
                End Early
              </button>
            </div>

            {usagePromotionId === promo.id && (
              <div style={{ marginTop: 12 }}>
                <PromotionUsagePanel
                  promotion={promo}
                  usageRecords={promotionUsage}
                  allAccounts={allAccounts || [account]}
                />
              </div>
            )}
          </div>
        );
      })}

      {/* Form dialog */}
      <PromotionFormDialog
        open={formOpen}
        promotion={editPromotion}
        allAccounts={allAccounts || [account]}
        allPromotions={promotions}
        usageCount={editPromotion
          ? (promotionUsage || []).filter(u => u.promotion_id === editPromotion.id).length
          : 0}
        onSaved={handleFormSaved}
        onClose={() => { setFormOpen(false); setEditPromotion(null); }}
      />

      {/* End Early confirmation */}
      {endConfirm && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(0,0,0,0.4)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 16,
        }} onClick={() => !ending && setEndConfirm(null)}>
          <div
            style={{
              background: BRAND.card, borderRadius: 12,
              border: `1px solid ${BRAND.border}`,
              maxWidth: 420, width: "100%",
              padding: "20px 24px",
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontSize: 16, fontWeight: 700, color: BRAND.text, marginBottom: 8 }}>
              End this promotion early?
            </div>
            <div style={{ fontSize: 13, color: BRAND.subtext, marginBottom: 16 }}>
              Existing projects created under the promotion will remain Professional.
              No capacity will be consumed or refunded.
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                onClick={() => setEndConfirm(null)}
                disabled={ending}
                style={actionBtnStyle(BRAND.card, BRAND.text, BRAND.border)}
              >
                Cancel
              </button>
              <button
                onClick={handleEndEarly}
                disabled={ending}
                style={{
                  padding: "8px 16px", borderRadius: 8,
                  border: "none",
                  background: ending ? "#888" : BRAND.red, color: "#fff",
                  fontSize: 13, fontWeight: 600, cursor: ending ? "not-allowed" : "pointer",
                }}
              >
                {ending ? "Ending…" : "End Promotion"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function actionBtnStyle(bg, color, border) {
  return {
    padding: "6px 12px", borderRadius: 8,
    border: `1px solid ${border}`,
    background: bg, color,
    fontSize: 12, fontWeight: 600, cursor: "pointer",
  };
}