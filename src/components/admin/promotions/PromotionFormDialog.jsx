import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import {
  startDateInputToIso,
  endDateInputToIso,
  isoToStartDateInput,
  isoToEndDateInput,
  DEALER_GROUP_OPTIONS,
  PROMOTION_TYPE_LABELS,
  buildPromotionSummary,
  deriveDisplayStatus,
  formatDateRange,
  DEALER_GROUP_LABELS,
} from "./promotionStatus";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#3E4349",
  border: "#DCDBD6",
  card: "#FFFFFF",
  btn: "#1B1A1A",
  btnText: "#FFFFFF",
  green: "#213428",
  amber: "#625143",
  red: "#B23A3A",
};

const inputStyle = {
  width: "100%", padding: "8px 10px", borderRadius: 8,
  border: `1px solid ${BRAND.border}`, background: BRAND.card,
  fontSize: 13, color: BRAND.text, outline: "none",
};

const labelStyle = {
  fontSize: 11, fontWeight: 700, color: BRAND.subtext,
  textTransform: "uppercase", letterSpacing: "0.04em",
  marginBottom: 4, display: "block",
};

/**
 * Create or edit a promotion.
 *
 * Props:
 * - open: boolean
 * - promotion: existing Promotion record (null = create mode)
 * - allAccounts: Account[] (for single-account dropdown)
 * - usageCount: number of PromotionUsage records (for edit warning)
 * - onSaved: () => void
 * - onClose: () => void
 */
export default function PromotionFormDialog({
  open,
  promotion,
  allAccounts,
  allPromotions,
  usageCount,
  onSaved,
  onClose,
}) {
  const isEdit = !!promotion;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [templateId, setTemplateId] = useState("");

  const [name, setName] = useState("");
  const [headline, setHeadline] = useState("");
  const [message, setMessage] = useState("");
  const [promotionType, setPromotionType] = useState("UNLIMITED_PRO_PROJECTS");
  const [targetScope, setTargetScope] = useState("ALL_DEALER_GROUP");
  const [targetDealerGroup, setTargetDealerGroup] = useState("PREMIUM_PARTNER");
  const [targetAccountId, setTargetAccountId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState("DRAFT");

  // Track original values to detect changes that need warnings
  const [origTargetScope, setOrigTargetScope] = useState(null);
  const [origPromotionType, setOrigPromotionType] = useState(null);

  // Sorted template promotions (all statuses, most recent first by created_date)
  const templatePromotions = useMemo(() => {
    if (!allPromotions || !Array.isArray(allPromotions)) return [];
    return [...allPromotions].sort((a, b) => {
      const aDate = a.created_date ? new Date(a.created_date).getTime() : 0;
      const bDate = b.created_date ? new Date(b.created_date).getTime() : 0;
      return bDate - aDate;
    });
  }, [allPromotions]);

  // Apply a template: prefill the form from an existing promotion.
  // This is a template only — the source record is never modified.
  function applyTemplate(sourcePromo) {
    if (!sourcePromo) {
      setTemplateId("");
      setName("");
      setHeadline("");
      setMessage("");
      setPromotionType("UNLIMITED_PRO_PROJECTS");
      setTargetScope("ALL_DEALER_GROUP");
      setTargetDealerGroup("PREMIUM_PARTNER");
      setTargetAccountId("");
      setStartDate("");
      setEndDate("");
      setStatus("DRAFT");
      return;
    }
    setTemplateId(sourcePromo.id);
    setName((sourcePromo.name || "Promotion") + " — Copy");
    setHeadline(sourcePromo.headline || "");
    setMessage(sourcePromo.message || "");
    setPromotionType(sourcePromo.promotion_type || "UNLIMITED_PRO_PROJECTS");
    setTargetScope(sourcePromo.target_scope || "ALL_DEALER_GROUP");
    setTargetDealerGroup(sourcePromo.target_dealer_group || "PREMIUM_PARTNER");
    setTargetAccountId(sourcePromo.target_account_id || "");
    setStartDate(isoToStartDateInput(sourcePromo.starts_at));
    setEndDate(isoToEndDateInput(sourcePromo.ends_at));
    // Copied promotions always default to DRAFT — never auto-activate.
    setStatus("DRAFT");
  }

  useEffect(() => {
    if (!open) return;
    setTemplateId("");
    if (promotion) {
      setName(promotion.name || "");
      setHeadline(promotion.headline || "");
      setMessage(promotion.message || "");
      setPromotionType(promotion.promotion_type || "UNLIMITED_PRO_PROJECTS");
      setTargetScope(promotion.target_scope || "ALL_DEALER_GROUP");
      setTargetDealerGroup(promotion.target_dealer_group || "PREMIUM_PARTNER");
      setTargetAccountId(promotion.target_account_id || "");
      setStartDate(isoToStartDateInput(promotion.starts_at));
      setEndDate(isoToEndDateInput(promotion.ends_at));
      setStatus(promotion.status || "DRAFT");
      setOrigTargetScope(promotion.target_scope || "ALL_DEALER_GROUP");
      setOrigPromotionType(promotion.promotion_type || "UNLIMITED_PRO_PROJECTS");
    } else {
      setName("");
      setHeadline("");
      setMessage("");
      setPromotionType("UNLIMITED_PRO_PROJECTS");
      setTargetScope("ALL_DEALER_GROUP");
      setTargetDealerGroup("PREMIUM_PARTNER");
      setTargetAccountId("");
      setStartDate("");
      setEndDate("");
      setStatus("DRAFT");
      setOrigTargetScope(null);
      setOrigPromotionType(null);
    }
    setError(null);
  }, [open, promotion]);

  const targetScopeChanged = isEdit && origTargetScope && targetScope !== origTargetScope;
  const promotionTypeChanged = isEdit && origPromotionType && promotionType !== origPromotionType;
  const showUsageWarning = isEdit && usageCount > 0 && (targetScopeChanged || promotionTypeChanged);

  const sortedAccounts = useMemo(() => {
    if (!allAccounts) return [];
    return [...allAccounts].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [allAccounts]);

  if (!open) return null;

  async function handleSave() {
    setError(null);

    if (!name.trim()) { setError("Name is required."); return; }
    if (!startDate) { setError("Start date is required."); return; }
    if (!endDate) { setError("End date is required."); return; }

    const startsIso = startDateInputToIso(startDate);
    const endsIso = endDateInputToIso(endDate);

    if (!startsIso || !endsIso) { setError("Invalid dates."); return; }
    if (new Date(endsIso).getTime() <= new Date(startsIso).getTime()) {
      setError("End date must be after start date."); return;
    }

    if (targetScope === "SINGLE_ACCOUNT" && !targetAccountId) {
      setError("Select a target account."); return;
    }

    const payload = {
      name: name.trim(),
      headline: headline.trim(),
      message: message.trim(),
      promotion_type: promotionType,
      target_scope: targetScope,
      target_dealer_group: targetScope === "ALL_DEALER_GROUP" ? targetDealerGroup : null,
      target_account_id: targetScope === "SINGLE_ACCOUNT" ? targetAccountId : null,
      starts_at: startsIso,
      ends_at: endsIso,
      status,
    };

    setSaving(true);
    try {
      if (isEdit) {
        await base44.entities.Promotion.update(promotion.id, payload);
      } else {
        await base44.entities.Promotion.create(payload);
      }
      onSaved();
    } catch (err) {
      setError(err?.message || "Failed to save promotion.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.4)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 16,
    }} onClick={onClose}>
      <div
        style={{
          background: BRAND.card, borderRadius: 12,
          border: `1px solid ${BRAND.border}`,
          maxWidth: 560, width: "100%",
          maxHeight: "90vh", overflowY: "auto",
          padding: "20px 24px",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: BRAND.text }}>
            {isEdit ? "Edit Promotion" : "Create Promotion"}
          </div>
          <div style={{ fontSize: 12, color: BRAND.subtext, marginTop: 2 }}>
            {isEdit ? "Update promotion details" : "Set up a new dealer promotion"}
          </div>
        </div>

        {/* Usage warning */}
        {showUsageWarning && (
          <div style={{
            padding: "10px 12px", marginBottom: 14,
            background: "rgb(253 246 234)",
            border: `1px solid ${BRAND.amber}`,
            borderRadius: 8, fontSize: 12, color: BRAND.amber,
          }}>
            ⚠ This promotion has {usageCount} usage record{usageCount !== 1 ? "s" : ""}.
            Changing the target scope or promotion type may affect eligibility.
            Existing usage history will not be deleted.
          </div>
        )}

        {/* Fields */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={labelStyle}>Name</label>
            <input style={inputStyle} value={name} onChange={e => setName(e.target.value)}
              placeholder="Internal admin name" />
          </div>

          <div>
            <label style={labelStyle}>Dealer-facing headline</label>
            <input style={inputStyle} value={headline} onChange={e => setHeadline(e.target.value)}
              placeholder="Short headline shown to dealers" />
          </div>

          <div>
            <label style={labelStyle}>Dealer-facing message</label>
            <textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
              value={message} onChange={e => setMessage(e.target.value)}
              placeholder="Longer message explaining the promotion" />
          </div>

          <div>
            <label style={labelStyle}>Promotion Type</label>
            <select style={inputStyle} value={promotionType}
              onChange={e => setPromotionType(e.target.value)}>
              <option value="UNLIMITED_PRO_PROJECTS">
                {PROMOTION_TYPE_LABELS.UNLIMITED_PRO_PROJECTS}
              </option>
            </select>
            <div style={{ fontSize: 10, color: BRAND.subtext, marginTop: 3 }}>
              Other types (Discount, Bonus) are reserved for future use.
            </div>
          </div>

          <div>
            <label style={labelStyle}>Target</label>
            <select style={inputStyle} value={targetScope}
              onChange={e => setTargetScope(e.target.value)}>
              <option value="ALL_DEALER_GROUP">Dealer Group</option>
              <option value="SINGLE_ACCOUNT">Single Account</option>
            </select>
          </div>

          {targetScope === "ALL_DEALER_GROUP" && (
            <div>
              <label style={labelStyle}>Dealer Group</label>
              <select style={inputStyle} value={targetDealerGroup}
                onChange={e => setTargetDealerGroup(e.target.value)}>
                {DEALER_GROUP_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          )}

          {targetScope === "SINGLE_ACCOUNT" && (
            <div>
              <label style={labelStyle}>Account</label>
              <select style={inputStyle} value={targetAccountId}
                onChange={e => setTargetAccountId(e.target.value)}>
                <option value="">Select an account…</option>
                {sortedAccounts.map(a => (
                  <option key={a.id} value={a.id}>{a.name || "Unnamed"}</option>
                ))}
              </select>
            </div>
          )}

          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Start date</label>
              <input type="date" style={inputStyle} value={startDate}
                onChange={e => setStartDate(e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>End date (inclusive)</label>
              <input type="date" style={inputStyle} value={endDate}
                onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Status</label>
            <select style={inputStyle} value={status}
              onChange={e => setStatus(e.target.value)}>
              <option value="DRAFT">Draft</option>
              <option value="ACTIVE">Active</option>
            </select>
          </div>
        </div>

        {error && (
          <div style={{
            marginTop: 12, padding: "8px 10px",
            background: "rgb(253 238 238)",
            border: `1px solid ${BRAND.red}`,
            borderRadius: 8, fontSize: 12, color: BRAND.red,
          }}>
            {error}
          </div>
        )}

        {/* Actions */}
        <div style={{
          display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18,
        }}>
          <button onClick={onClose} style={{
            padding: "8px 16px", borderRadius: 8,
            border: `1px solid ${BRAND.border}`,
            background: BRAND.card, color: BRAND.text,
            fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving} style={{
            padding: "8px 16px", borderRadius: 8,
            border: "none",
            background: saving ? "#888" : BRAND.btn, color: BRAND.btnText,
            fontSize: 13, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer",
          }}>
            {saving ? "Saving…" : (isEdit ? "Save Changes" : "Create Promotion")}
          </button>
        </div>
      </div>
    </div>
  );
}