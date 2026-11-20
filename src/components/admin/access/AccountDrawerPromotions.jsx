import React, { useState } from "react";
import { Gift, Plus, Pencil, Ban, ChevronDown, ChevronRight } from "lucide-react";
import { base44 } from "@/api/base44Client";
import {
  PROMOTION_TYPE_LABELS,
  deriveDisplayStatus,
  isoToDisplayDate,
  isoToEndDisplayDate,
} from "@/components/admin/promotions/promotionStatus";
import {
  formatPromotionDate,
  deriveIntroductoryReadiness,
} from "@/lib/commercial/promotionEntitlementOverview";
import PromotionFormDialog from "@/components/admin/promotions/PromotionFormDialog";
import AccessPill from "@/components/admin/access/AccessPill";

/**
 * Account drawer promotions section — shows current entitlement, historical
 * promotional periods, projects created during each period, introductory
 * unlimited readiness, and existing controls to grant / extend / cancel.
 *
 * Props: row, onPromotionsChanged?
 */
export default function AccountDrawerPromotions({ row, onPromotionsChanged }) {
  const account = row?.account;
  const promotion = row?.promotion;
  const allPromotions = promotion?.all || [];
  const promoUsageByPromo = row?.promoUsageByPromo || new Map();
  const [showHistory, setShowHistory] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editPromotion, setEditPromotion] = useState(null);
  const [endConfirm, setEndConfirm] = useState(null);
  const [ending, setEnding] = useState(false);

  if (!account) return null;

  const effective = promotion?.effective || null;
  const intro = deriveIntroductoryReadiness(account, effective);

  function refresh() {
    onPromotionsChanged?.();
  }

  function handleEdit(promo) {
    setEditPromotion(promo);
    setFormOpen(true);
  }

  function handleFormSaved() {
    setFormOpen(false);
    setEditPromotion(null);
    refresh();
  }

  async function handleEndEarly() {
    if (!endConfirm) return;
    setEnding(true);
    try {
      await base44.entities.Promotion.update(endConfirm.id, { status: "CANCELLED" });
      setEndConfirm(null);
      refresh();
    } catch {
      // keep dialog open on error
    } finally {
      setEnding(false);
    }
  }

  function promoUsageCount(promoId) {
    return promoUsageByPromo.get(promoId) || 0;
  }

  return (
    <section className="rounded-xl border border-[#DCDBD6] bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-[#E7E5E1] px-4 py-3">
        <div className="flex items-center gap-2">
          <Gift className="h-4 w-4 text-[#625143]" />
          <h3 className="m-0 text-sm font-bold text-[#1B1A1A]">Promotions</h3>
        </div>
        <button
          type="button"
          onClick={() => { setEditPromotion(null); setFormOpen(true); }}
          className="inline-flex items-center gap-1 rounded-lg border border-[#DCDBD6] px-2.5 py-1 text-[11px] font-semibold text-[#1B1A1A] hover:bg-slate-50"
        >
          <Plus className="h-3.5 w-3.5" />
          Grant promotion
        </button>
      </div>

      <div className="space-y-3 px-4 py-3">
        {/* Current entitlement */}
        {effective ? (
          <div className="rounded-lg border border-[#BBD3C4] bg-[#EEF4F0] px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#213428]">
                  Current entitlement
                </div>
                <div className="mt-0.5 text-[13px] font-bold text-[#1B1A1A]">
                  {effective.headline || effective.name || "Unlimited Professional Projects"}
                </div>
                <div className="text-[11px] text-[#3E4349]">
                  {PROMOTION_TYPE_LABELS[effective.promotion_type] || effective.promotion_type}
                  {" · "}
                  {formatPromotionDate(effective.starts_at)} – {isoToEndDisplayDate(effective.ends_at)}
                </div>
              </div>
              <AccessPill label={deriveDisplayStatus(effective)} tone="ok" />
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-[11px] text-[#3E4349]">
                Expires {isoToEndDisplayDate(effective.ends_at)}
              </span>
              <span className="text-[11px] text-[#625143]">·</span>
              <span className="text-[11px] text-[#3E4349]">
                {promoUsageCount(effective.id)} project{promoUsageCount(effective.id) !== 1 ? "s" : ""} created
              </span>
            </div>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => handleEdit(effective)}
                className="inline-flex items-center gap-1 rounded-md border border-[#DCDBD6] px-2 py-1 text-[11px] font-semibold text-[#1B1A1A] hover:bg-white"
              >
                <Pencil className="h-3 w-3" />
                Extend
              </button>
              <button
                type="button"
                onClick={() => setEndConfirm(effective)}
                className="inline-flex items-center gap-1 rounded-md border border-[#DCDBD6] px-2 py-1 text-[11px] font-semibold text-[#8F2F2F] hover:bg-[#FBEDED]"
              >
                <Ban className="h-3 w-3" />
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-[#DCDBD6] bg-[#FAFAF9] px-3 py-2.5">
            <div className="text-[12px] text-[#3E4349]">
              No active unlimited promotion.
            </div>
          </div>
        )}

        {/* Introductory unlimited readiness */}
        <div className="rounded-lg border border-[#E7E5E1] bg-[#F8F8F7] px-3 py-2.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#625143]">
            Introductory unlimited
          </div>
          <div className="mt-0.5 text-[12px] text-[#3E4349]">{intro.label}</div>
          {intro.windowStart && intro.windowEnd && (
            <div className="text-[11px] text-[#625143]">
              Window: {formatPromotionDate(intro.windowStart)} – {formatPromotionDate(intro.windowEnd)}
            </div>
          )}
          {intro.state === "active" && (
            <div className="mt-1 text-[11px] font-semibold text-[#213428]">
              Earned and purchased credits are not consumed during unlimited access.
            </div>
          )}
          {intro.state === "eligible" && (
            <div className="mt-1 text-[11px] text-[#7A5B22]">
              Not yet granted. Grant a promotion above to activate.
            </div>
          )}
        </div>

        {/* Historical promotional periods */}
        {allPromotions.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              className="flex w-full items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-[#625143] hover:text-[#1B1A1A]"
            >
              {showHistory ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              All promotions ({allPromotions.length})
            </button>
            {showHistory && (
              <div className="mt-1.5 divide-y divide-[#F1EFEC]">
                {allPromotions.map((promo) => {
                  const status = deriveDisplayStatus(promo);
                  const usage = promoUsageCount(promo.id);
                  const isEffective = promo.id === effective?.id;
                  return (
                    <div key={promo.id} className="flex items-center justify-between gap-2 py-1.5">
                      <div className="min-w-0">
                        <div className="truncate text-[12px] font-semibold text-[#1B1A1A]">
                          {promo.headline || promo.name || "Promotion"}
                        </div>
                        <div className="text-[11px] text-[#625143]">
                          {formatPromotionDate(promo.starts_at)} – {isoToEndDisplayDate(promo.ends_at)}
                          {" · "}
                          {PROMOTION_TYPE_LABELS[promo.promotion_type] || promo.promotion_type}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <AccessPill
                          label={isEffective ? "Current" : status}
                          tone={status === "Active" ? "ok" : status === "Expired" ? "muted" : status === "Cancelled" ? "danger" : "info"}
                        />
                        <div className="mt-0.5 text-[10px] text-[#625143]">
                          {usage} project{usage !== 1 ? "s" : ""}
                        </div>
                        {!isEffective && promo.status === "ACTIVE" && (
                          <button
                            type="button"
                            onClick={() => handleEdit(promo)}
                            className="mt-0.5 text-[10px] font-semibold text-[#2C5AA0] hover:underline"
                          >
                            Edit
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Promotion form dialog (create / edit / extend) */}
      <PromotionFormDialog
        open={formOpen}
        promotion={editPromotion}
        allAccounts={[account]}
        allPromotions={allPromotions}
        usageCount={editPromotion ? promoUsageCount(editPromotion.id) : 0}
        onSaved={handleFormSaved}
        onClose={() => { setFormOpen(false); setEditPromotion(null); }}
      />

      {/* End-early confirmation */}
      {endConfirm && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-4"
          onClick={() => !ending && setEndConfirm(null)}
        >
          <div
            className="w-full max-w-[420px] rounded-xl border border-[#DCDBD6] bg-white p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 text-base font-bold text-[#1B1A1A]">
              End this promotion early?
            </div>
            <div className="mb-4 text-[13px] text-[#3E4349]">
              Existing projects created under the promotion will remain Professional.
              No capacity will be consumed or refunded.
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEndConfirm(null)}
                disabled={ending}
                className="rounded-lg border border-[#DCDBD6] px-4 py-2 text-[13px] font-semibold text-[#1B1A1A] hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleEndEarly}
                disabled={ending}
                className="rounded-lg bg-[#B23A3A] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#9A3232] disabled:opacity-50"
              >
                {ending ? "Ending…" : "End Promotion"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}