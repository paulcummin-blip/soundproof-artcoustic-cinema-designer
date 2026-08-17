import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import {
  isEffective,
  isLiveOrScheduled,
  promotionBelongsToGroup,
  getEligibleAccounts,
} from "./promotionStatus";
import PromotionCard from "./PromotionCard";
import PromotionFormDialog from "./PromotionFormDialog";
import PromotionUsagePanel from "./PromotionUsagePanel";
import PromotionHistory from "./PromotionHistory";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#3E4349",
  border: "#DCDBD6",
  card: "#FFFFFF",
  green: "#213428",
  amber: "#625143",
  red: "#B23A3A",
};

/**
 * Promotion management area shown between a dealer-group heading and its table.
 *
 * Props:
 * - groupKey: string (premiumPartners, richerSounds, otherDealers, distributors, internalTest)
 * - promotions: Promotion[] (all promotions)
 * - promotionUsage: PromotionUsage[] (all usage records)
 * - allAccounts: Account[] (all accounts for eligible/usage resolution)
 * - onPromotionsChanged: () => void (refresh callback)
 */
export default function GroupPromotionArea({
  groupKey,
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

  // Promotions belonging to this group
  const groupPromotions = useMemo(() => {
    if (!promotions) return [];
    return promotions.filter(p => promotionBelongsToGroup(p, groupKey, allAccounts));
  }, [promotions, groupKey, allAccounts]);

  // All currently-effective (active) promotions — may be more than one.
  const activePromotions = useMemo(() => {
    return groupPromotions.filter(p => isEffective(p));
  }, [groupPromotions]);

  // History promotions (non-active, non-scheduled)
  const historyPromotions = useMemo(() => {
    return groupPromotions.filter(p => !isLiveOrScheduled(p));
  }, [groupPromotions]);

  // Per-promotion usage stats, keyed by promotion id.
  const usageStatsByPromo = useMemo(() => {
    const map = new Map();
    if (!activePromotions.length || !promotionUsage) return map;
    for (const promo of activePromotions) {
      const records = promotionUsage.filter(u => u.promotion_id === promo.id);
      const accountsUsed = new Set(records.map(u => u.account_id)).size;
      const eligible = getEligibleAccounts(allAccounts, promo).length;
      map.set(promo.id, {
        usageCount: records.length,
        accountsUsedCount: accountsUsed,
        eligibleCount: eligible,
      });
    }
    return map;
  }, [activePromotions, promotionUsage, allAccounts]);

  // Detect overlapping live promotions: same promotion_type + overlapping dates.
  // Admin-only warning — does not block or auto-resolve.
  const hasOverlap = useMemo(() => {
    if (activePromotions.length < 2) return false;
    for (let i = 0; i < activePromotions.length; i++) {
      for (let j = i + 1; j < activePromotions.length; j++) {
        const a = activePromotions[i];
        const b = activePromotions[j];
        if (a.promotion_type !== b.promotion_type) continue;
        const aStart = new Date(a.starts_at).getTime();
        const aEnd = new Date(a.ends_at).getTime();
        const bStart = new Date(b.starts_at).getTime();
        const bEnd = new Date(b.ends_at).getTime();
        if (aStart < bEnd && bStart < aEnd) return true;
      }
    }
    return false;
  }, [activePromotions]);

  function handleCreate() {
    setEditPromotion(null);
    setFormOpen(true);
  }

  function handleEdit(promo) {
    setEditPromotion(promo);
    setFormOpen(true);
  }

  function handleFormClose() {
    setFormOpen(false);
    setEditPromotion(null);
  }

  function handleFormSaved() {
    setFormOpen(false);
    setEditPromotion(null);
    onPromotionsChanged?.();
  }

  async function handleEndEarly() {
    if (!endConfirm) return;
    setEnding(true);
    try {
      await base44.entities.Promotion.update(endConfirm.id, { status: "CANCELLED" });
      setEndConfirm(null);
      onPromotionsChanged?.();
    } catch (err) {
      // Keep dialog open on error; the error is visible via the button state
    } finally {
      setEnding(false);
    }
  }

  // Internal/test group: no promotion management
  if (groupKey === "internalTest" && groupPromotions.length === 0) return null;

  return (
    <>
      {/* Active promotion summaries — vertical list (one per effective promotion) */}
      {activePromotions.map(promo => {
        const stats = usageStatsByPromo.get(promo.id) || {
          eligibleCount: 0, usageCount: 0, accountsUsedCount: 0,
        };
        return (
          <div key={promo.id}>
            <PromotionCard
              promotion={promo}
              eligibleCount={stats.eligibleCount}
              usageCount={stats.usageCount}
              accountsUsedCount={stats.accountsUsedCount}
              onEdit={() => handleEdit(promo)}
              onViewUsage={() =>
                setUsagePromotionId(prev => prev === promo.id ? null : promo.id)
              }
              onEndEarly={() => setEndConfirm(promo)}
            />
            {usagePromotionId === promo.id && (
              <PromotionUsagePanel
                promotion={promo}
                usageRecords={promotionUsage}
                allAccounts={allAccounts}
              />
            )}
          </div>
        );
      })}

      {/* Overlap warning — admin-only, does not block */}
      {hasOverlap && (
        <div style={{
          padding: "6px 12px", marginBottom: 8,
          borderLeft: `3px solid ${BRAND.amber}`,
          background: "#F3F0EB", borderRadius: 4,
          fontSize: 11, color: BRAND.amber, fontWeight: 600,
        }}>
          Multiple live promotions overlap for this group
        </div>
      )}

      {/* Create Promotion — always visible (admin may schedule future promos) */}
      <div style={{ marginBottom: 12 }}>
        <button
          onClick={handleCreate}
          style={{
            padding: "8px 14px", borderRadius: 8,
            border: `1px solid ${BRAND.border}`,
            background: BRAND.card, color: BRAND.text,
            fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}
        >
          + Create Promotion
        </button>
      </div>

      {/* History */}
      <PromotionHistory
        promotions={historyPromotions}
        usageRecords={promotionUsage}
      />

      {/* Form dialog */}
      <PromotionFormDialog
        open={formOpen}
        promotion={editPromotion}
        allAccounts={allAccounts}
        allPromotions={promotions}
        usageCount={editPromotion
          ? (promotionUsage || []).filter(u => u.promotion_id === editPromotion.id).length
          : 0}
        onSaved={handleFormSaved}
        onClose={handleFormClose}
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
                style={{
                  padding: "8px 16px", borderRadius: 8,
                  border: `1px solid ${BRAND.border}`,
                  background: BRAND.card, color: BRAND.text,
                  fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}
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