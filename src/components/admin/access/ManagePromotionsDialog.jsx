import React, { useState, useMemo, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import {
  PROMO_TYPES,
  RECIPIENT_TYPES,
  resolveRecipients,
  buildBonusPromotion,
  buildUnlimitedPromotion,
  buildPromotionalLedgerEntry,
  partitionExistingGrants,
} from "@/lib/commercial/promotionGrantAuthority";
import { isoToEndDateInput } from "@/components/admin/promotions/promotionStatus";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#3E4349",
  muted: "#625143",
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
 * Unified Manage Promotions dialog — two types:
 *   1. Add Free Credits (BONUS_PROJECTS + PROMOTIONAL ledger entries)
 *   2. Unlimited Projects (UNLIMITED_PRO_PROJECTS promotion)
 *
 * Both support: one dealer, a category, or all accounts.
 * Shows a confirmation with exact recipient count and names before applying.
 * Idempotency prevents duplicate credit grants from retries.
 *
 * Props:
 * - open: boolean
 * - onClose: () => void
 * - onApplied: () => void  (refresh callback)
 * - allAccounts: Account[]
 * - allLedgerEntries: CapacityLedger[]
 * - preselectedAccountId?: string  (from dealer drawer)
 */
export default function ManagePromotionsDialog({
  open,
  onClose,
  onApplied,
  allAccounts = [],
  allLedgerEntries = [],
  preselectedAccountId = null,
}) {
  const { user } = useAuth();
  const [step, setStep] = useState("config"); // "config" | "confirm" | "result"
  const [promoType, setPromoType] = useState("free_credits");
  const [recipientType, setRecipientType] = useState("partners");
  const [singleAccountId, setSingleAccountId] = useState("");
  const [creditsPerAccount, setCreditsPerAccount] = useState(5);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState(null);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState(null);
  const [recipients, setRecipients] = useState([]);

  // Preselect dealer when opened from the drawer
  useEffect(() => {
    if (open && preselectedAccountId) {
      setRecipientType("single");
      setSingleAccountId(preselectedAccountId);
    }
  }, [open, preselectedAccountId]);

  // Reset to config step when dialog opens
  useEffect(() => {
    if (open) {
      setStep("config");
      setError(null);
      setResult(null);
      // Default end date: 3 months from now
      if (!endDate) {
        const d = new Date();
        d.setMonth(d.getMonth() + 3);
        setEndDate(d.toISOString().slice(0, 10));
      }
      if (!startDate) {
        setStartDate(new Date().toISOString().slice(0, 10));
      }
    }
  }, [open]);

  const sortedAccounts = useMemo(() => {
    return [...allAccounts].sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || "")
    ));
  }, [allAccounts]);

  if (!open) return null;

  const selection = {
    type: recipientType,
    accountId: recipientType === "single" ? singleAccountId : null,
  };

  function handleReview() {
    setError(null);
    if (recipientType === "single" && !singleAccountId) {
      setError("Select a dealer account.");
      return;
    }
    if (promoType === "free_credits") {
      const n = Number(creditsPerAccount);
      if (!Number.isFinite(n) || n <= 0) {
        setError("Enter a positive number of credits.");
        return;
      }
    }
    if (promoType === "unlimited_projects") {
      if (!startDate || !endDate) {
        setError("Start and end dates are required.");
        return;
      }
      if (new Date(endDate).getTime() < new Date(startDate).getTime()) {
        setError("End date must be on or after the start date.");
        return;
      }
    }
    const resolved = resolveRecipients(allAccounts, selection);
    if (resolved.length === 0) {
      setError("No accounts match the selected recipients.");
      return;
    }
    setRecipients(resolved);
    setStep("confirm");
  }

  async function handleApply() {
    setApplying(true);
    setError(null);
    try {
      if (promoType === "free_credits") {
        const promoRecord = buildBonusPromotion({
          selection, creditsPerAccount, accounts: allAccounts, actor: user,
        });
        const created = await base44.entities.Promotion.create(promoRecord);

        const { newRecipients, alreadyGranted } = partitionExistingGrants(
          recipients, allLedgerEntries, created.id
        );

        let affected = 0;
        if (newRecipients.length > 0) {
          const entries = newRecipients.map((account) =>
            buildPromotionalLedgerEntry({
              accountId: account.id,
              promotionId: created.id,
              credits: creditsPerAccount,
              actor: user,
            })
          );
          await base44.entities.CapacityLedger.bulkCreate(entries);
          affected = newRecipients.length;
        }

        setResult({
          type: "free_credits",
          promotionId: created.id,
          affected,
          skipped: alreadyGranted.length,
          totalRecipients: recipients.length,
        });
      } else {
        const promoRecord = buildUnlimitedPromotion({
          selection, startDateInput: startDate, endDateInput: endDate,
          accounts: allAccounts, actor: user,
        });
        const created = await base44.entities.Promotion.create(promoRecord);
        setResult({
          type: "unlimited_projects",
          promotionId: created.id,
          affected: recipients.length,
          skipped: 0,
          totalRecipients: recipients.length,
          startDate,
          endDate,
        });
      }
      setStep("result");
      onApplied?.();
    } catch (err) {
      setError(err?.message || "Failed to apply promotion.");
    } finally {
      setApplying(false);
    }
  }

  function handleClose() {
    if (!applying) onClose();
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={handleClose}
    >
      <div
        style={{ background: BRAND.card, borderRadius: 12, border: `1px solid ${BRAND.border}`, maxWidth: 600, width: "100%", maxHeight: "90vh", overflowY: "auto", padding: "20px 24px" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: BRAND.text }}>Manage Promotions</div>
          <div style={{ fontSize: 12, color: BRAND.subtext, marginTop: 2 }}>
            Grant free credits or unlimited project access to one dealer, a category, or all accounts.
          </div>
        </div>

        {/* Step: Config */}
        {step === "config" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Promotion type */}
            <div>
              <label style={labelStyle}>Promotion type</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {PROMO_TYPES.map((t) => (
                  <label key={t.key} style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer" }}>
                    <input type="radio" name="promoType" value={t.key} checked={promoType === t.key}
                      onChange={() => setPromoType(t.key)}
                      style={{ marginTop: 3 }}
                    />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: BRAND.text }}>{t.label}</div>
                      <div style={{ fontSize: 11, color: BRAND.muted }}>{t.hint}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Recipients */}
            <div>
              <label style={labelStyle}>Recipients</label>
              <select style={inputStyle} value={recipientType}
                onChange={(e) => setRecipientType(e.target.value)}
                disabled={Boolean(preselectedAccountId)}
              >
                {RECIPIENT_TYPES.map((r) => (
                  <option key={r.key} value={r.key}>{r.label}</option>
                ))}
              </select>
            </div>

            {recipientType === "single" && (
              <div>
                <label style={labelStyle}>Dealer account</label>
                <select style={inputStyle} value={singleAccountId}
                  onChange={(e) => setSingleAccountId(e.target.value)}
                >
                  <option value="">Select a dealer…</option>
                  {sortedAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name || "Unnamed"}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Free credits amount */}
            {promoType === "free_credits" && (
              <div>
                <label style={labelStyle}>Credits per account</label>
                <input type="number" min="1" style={inputStyle} value={creditsPerAccount}
                  onChange={(e) => setCreditsPerAccount(e.target.value)}
                />
                <div style={{ fontSize: 10, color: BRAND.muted, marginTop: 3 }}>
                  Credits are recorded as PROMOTIONAL in the ledger — separate from earned and purchased credits.
                </div>
              </div>
            )}

            {/* Unlimited projects dates */}
            {promoType === "unlimited_projects" && (
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Start date</label>
                  <input type="date" style={inputStyle} value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>End date (inclusive)</label>
                  <input type="date" style={inputStyle} value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div style={{ fontSize: 11, color: BRAND.muted, padding: "8px 10px", background: "#F8F8F7", borderRadius: 8, border: `1px solid ${BRAND.border}` }}>
              A promotion never activates a dealer's Sound Proof login access. Inactive accounts may receive a future entitlement but cannot use it until authorised to access Sound Proof.
            </div>

            {error && (
              <div style={{ padding: "8px 10px", background: "rgb(253 238 238)", border: `1px solid ${BRAND.red}`, borderRadius: 8, fontSize: 12, color: BRAND.red }}>
                {error}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={handleClose} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${BRAND.border}`, background: BRAND.card, color: BRAND.text, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={handleReview} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: BRAND.btn, color: BRAND.btnText, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                Review recipients
              </button>
            </div>
          </div>
        )}

        {/* Step: Confirm */}
        {step === "confirm" && (
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: BRAND.text, marginBottom: 10 }}>
              Confirm promotion
            </div>

            <div style={{ background: "#F8F8F7", border: `1px solid ${BRAND.border}`, borderRadius: 8, padding: "12px 14px", marginBottom: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 12px", fontSize: 13 }}>
                <span style={{ color: BRAND.muted, fontWeight: 600 }}>Type</span>
                <span style={{ color: BRAND.text, fontWeight: 600 }}>
                  {promoType === "free_credits" ? "Add Free Credits" : "Unlimited Projects"}
                </span>
                {promoType === "free_credits" ? (
                  <>
                    <span style={{ color: BRAND.muted, fontWeight: 600 }}>Credits</span>
                    <span style={{ color: BRAND.text }}>{creditsPerAccount} per account</span>
                  </>
                ) : (
                  <>
                    <span style={{ color: BRAND.muted, fontWeight: 600 }}>Period</span>
                    <span style={{ color: BRAND.text }}>{startDate} to {endDate}</span>
                  </>
                )}
                <span style={{ color: BRAND.muted, fontWeight: 600 }}>Recipients</span>
                <span style={{ color: BRAND.text, fontWeight: 700 }}>{recipients.length} account{recipients.length !== 1 ? "s" : ""}</span>
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: BRAND.muted, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
                Affected accounts
              </div>
              <div style={{ maxHeight: 180, overflowY: "auto", border: `1px solid ${BRAND.border}`, borderRadius: 8, background: BRAND.card }}>
                {recipients.map((a, i) => (
                  <div key={a.id} style={{ padding: "5px 10px", fontSize: 12, color: BRAND.text, borderBottom: i < recipients.length - 1 ? `1px solid #F1EFEC` : "none" }}>
                    {a.name || "Unnamed"}
                    {a.status === "inactive" && (
                      <span style={{ fontSize: 10, color: BRAND.amber, marginLeft: 6 }}>(not activated)</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {promoType === "unlimited_projects" && (
              <div style={{ fontSize: 11, color: BRAND.muted, padding: "8px 10px", background: "#F8F8F7", borderRadius: 8, border: `1px solid ${BRAND.border}`, marginBottom: 12 }}>
                Earned and purchased credits will not be consumed during the unlimited period. Overlapping unlimited promotions retain access until the latest uninterrupted expiry.
              </div>
            )}

            {error && (
              <div style={{ padding: "8px 10px", background: "rgb(253 238 238)", border: `1px solid ${BRAND.red}`, borderRadius: 8, fontSize: 12, color: BRAND.red, marginBottom: 12 }}>
                {error}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <button onClick={() => setStep("config")} disabled={applying}
                style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${BRAND.border}`, background: BRAND.card, color: BRAND.text, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                Back
              </button>
              <button onClick={handleApply} disabled={applying}
                style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: applying ? "#888" : BRAND.green, color: "#fff", fontSize: 13, fontWeight: 600, cursor: applying ? "not-allowed" : "pointer" }}
              >
                {applying ? "Applying…" : `Apply to ${recipients.length} account${recipients.length !== 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
        )}

        {/* Step: Result */}
        {step === "result" && result && (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: BRAND.green, marginBottom: 8 }}>
              Promotion applied
            </div>
            <div style={{ fontSize: 13, color: BRAND.subtext, marginBottom: 16 }}>
              {result.type === "free_credits" ? (
                <>
                  {result.affected} account{result.affected !== 1 ? "s" : ""} received {creditsPerAccount} credit{Number(creditsPerAccount) !== 1 ? "s" : ""}.
                  {result.skipped > 0 && ` ${result.skipped} already had this grant and were skipped.`}
                </>
              ) : (
                <>
                  Unlimited Projects promotion created for {result.affected} account{result.affected !== 1 ? "s" : ""}.
                  Active {result.startDate} to {result.endDate}.
                </>
              )}
            </div>
            <button onClick={handleClose}
              style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: BRAND.btn, color: BRAND.btnText, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}