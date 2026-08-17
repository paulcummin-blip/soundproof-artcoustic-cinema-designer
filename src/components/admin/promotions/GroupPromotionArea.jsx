import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import {
  isEffective,
  isLiveOrScheduled,
  deriveDisplayStatus,
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
  const [usageOpen, setUsageOpen] = useState(false);
  const [endConfirm, setEndConfirm] = useState(null);
  const [ending, setEnding] = useState(false);

  // Promotions belonging to this group
  const groupPromotions = useMemo(() => {
    if (!promotions) return [];
    return promotions.filter(p => promotionBelongsToGroup(p, groupKey, allAccounts));
  }, [promotions, groupKey, allAccounts]);

  // The effective (active) promotion
  const activePromotion = useMemo(() => {
    return groupPromotions.find(p => isEffective(p)) || null;
  }, [groupPromotions]);

  // Usage records for the active promotion
  const activeUsageRecords = useMemo(() => {
    if (!activePromotion || !promotionUsage) return [];
    return promotionUsage.filter(u => u.promotion_id === activePromotion.id);
  }, [activePromotion, promotionUsage]);

  const eligibleCount = useMemo(() => {
    if (!activePromotion) return 0;
    return getEligibleAccounts(allAccounts, activePromotion).length;
  }, [activePromotion, allAccounts]);

  const usageCount = activeUsageRecords.length;
  const accountsUsedCount = useMemo(() => {
    const ids = new Set(activeUsageRecords.map(u => u.account_id));
    return ids.size;
  }, [activeUsageRecords]);

  // History promotions (non-active)
  const historyPromotions = useMemo(() => {
    return groupPromotions.filter(p => !isLiveOrScheduled(p));
  }, [groupPromotions]);

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

  // Don't render anything if no promotions exist for this group and group is empty
  if (groupPromotions.length === 0) {
    // Show "Create Promotion" button for dealer-group sections (not internal/test)
    if (groupKey === "internalTest") return null;
    return (
      <>
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
        <PromotionFormDialog
          open={formOpen}
          promotion={null}
          allAccounts={allAccounts}
          usageCount={0}
          onSaved={handleFormSaved}
          onClose={handleFormClose}
        />
      </>
    );
  }

  return (
    <>
      {/* Active promotion card or Create button */}
      {activePromotion ? (
        <>
          <PromotionCard
            promotion={activePromotion}
            eligibleCount={eligibleCount}
            usageCount={usageCount}
            accountsUsedCount={accountsUsedCount}
            onEdit={() => handleEdit(activePromotion)}
            onViewUsage={() => setUsageOpen(!usageOpen)}
            onEndEarly={() => setEndConfirm(activePromotion)}
          />
          {usageOpen && (
            <PromotionUsagePanel
              promotion={activePromotion}
              usageRecords={promotionUsage}
              allAccounts={allAccounts}
            />
          )}
        </>
      ) : (
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
      )}

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