import React, { useState } from "react";
import { Ban, Undo2, Users, ExternalLink } from "lucide-react";
import { base44 } from "@/api/base44Client";
import AccessPill from "@/components/admin/access/AccessPill";
import { formatDate } from "@/lib/commercial/accountAccessOverview";

/**
 * AccountDrawerAccessSection — the compact Sound Proof Access summary and
 * controls shown near the top of each dealer's View drawer.
 *
 * Displays separately:
 *   - Eligible: Yes / No (with an admin toggle using set_eligible)
 *   - Account status: Not Activated / Active / Suspended / Expired
 *   - Access expiry: Date or Not Started
 *   - Users: occupied seats out of five
 *
 * Includes the Suspend / Restore controls (which route through the existing
 * manageSoundProofAccess authority via the parent's onRescind / onReinstate
 * callbacks) and a Manage Users link to the full account page.
 *
 * Setting Eligible to Yes does NOT activate the dealer, start their 90-day
 * term, or send an invitation. First activation remains through the verified
 * Partner Portal process.
 *
 * Props: row, onRescind(row), onReinstate(row), onAccessChanged()
 */
function effectiveAccessStatus(account) {
  if (account?.status === "suspended") return { label: "Suspended", tone: "danger" };
  if (account?.status === "inactive") return { label: "Not Activated", tone: "muted" };
  // status === "active" or "trial"
  const expiry = account?.soundproof_access_expires_at;
  if (expiry) {
    const expired = new Date(expiry).getTime() < Date.now();
    if (expired) return { label: "Expired", tone: "warn" };
  }
  if (account?.status === "trial") return { label: "Trial", tone: "warn" };
  return { label: "Active", tone: "ok" };
}

function expiryLabel(account) {
  const expiry = account?.soundproof_access_expires_at;
  if (!expiry) return "Not Started";
  const date = new Date(expiry);
  if (Number.isNaN(date.getTime())) return "Not Started";
  return formatDate(expiry);
}

export default function AccountDrawerAccessSection({ row, onRescind, onReinstate, onAccessChanged }) {
  const account = row?.account;
  const [eligibleBusy, setEligibleBusy] = useState(false);
  const [eligibilityError, setEligibilityError] = useState(null);

  if (!account) return null;

  const isEligible = account.soundproof_eligible === true;
  const status = effectiveAccessStatus(account);
  const expiry = expiryLabel(account);
  const isSuspended = account.status === "suspended";
  const hasPromotion = Boolean(row.promotion?.effective);

  async function handleEligibilityChange(value) {
    setEligibleBusy(true);
    setEligibilityError(null);
    try {
      const res = await base44.functions.invoke("manageSoundProofAccess", {
        action: "set_eligible",
        account_id: account.id,
        eligible: value,
      });
      const data = res?.data || {};
      if (!data.ok) {
        const failed = (data.results || []).find((r) => !r.ok);
        throw new Error(failed?.error || data.error || "Eligibility could not be changed.");
      }
      onAccessChanged?.();
    } catch (err) {
      setEligibilityError(err?.message || "Eligibility could not be changed.");
    } finally {
      setEligibleBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-[#DCDBD6] bg-white p-4">
      <h3 className="m-0 mb-3 text-sm font-bold text-[#1B1A1A]">Sound Proof Access</h3>

      {/* Access facts */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#625143]">Eligible</div>
          <div className="mt-0.5 flex items-center gap-2">
            <AccessPill label={isEligible ? "Yes" : "No"} tone={isEligible ? "ok" : "muted"} />
            <button
              type="button"
              disabled={eligibleBusy}
              onClick={() => handleEligibilityChange(!isEligible)}
              className="text-[11px] font-semibold text-[#213428] underline underline-offset-2 hover:no-underline disabled:opacity-50"
            >
              {eligibleBusy ? "…" : isEligible ? "Set No" : "Set Yes"}
            </button>
          </div>
        </div>

        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#625143]">Account status</div>
          <div className="mt-0.5">
            <AccessPill label={status.label} tone={status.tone} />
          </div>
        </div>

        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#625143]">Access expiry</div>
          <div className="mt-0.5 text-[13px] font-semibold text-[#1B1A1A]">{expiry}</div>
        </div>

        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#625143]">Users</div>
          <div className="mt-0.5 text-[13px] font-semibold text-[#1B1A1A]">
            {row.seatsUsed} of {row.seatsMaximum}
          </div>
        </div>
      </div>

      {/* Eligibility note */}
      <div className="mt-2 text-[11px] text-[#625143]">
        Setting eligibility does not activate the dealer, start their 90-day term, or send an invitation.
        First activation is through the verified Partner Portal process.
      </div>

      {eligibilityError && (
        <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">
          {eligibilityError}
        </div>
      )}

      {/* Suspend / Restore + Manage Users */}
      <div className="mt-3 flex flex-wrap gap-2 border-t border-[#E7E5E1] pt-3">
        {isSuspended ? (
          <button
            type="button"
            onClick={() => onReinstate?.(row)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#DCDBD6] px-3 py-1.5 text-[12px] font-semibold text-[#213428] hover:bg-slate-50"
          >
            <Undo2 className="h-3.5 w-3.5" />
            Restore access
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onRescind?.(row)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#DCDBD6] px-3 py-1.5 text-[12px] font-semibold text-[#8F2F2F] hover:bg-[#FBEDED]"
          >
            <Ban className="h-3.5 w-3.5" />
            Suspend access
          </button>
        )}
        <a
          href={`/admin/accounts/${encodeURIComponent(account.id)}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#DCDBD6] px-3 py-1.5 text-[12px] font-semibold text-[#1B1A1A] no-underline hover:bg-slate-50"
        >
          <Users className="h-3.5 w-3.5" />
          Manage Users
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {/* Compact promotion status — independent of login access */}
      {hasPromotion && (
        <div className="mt-3 border-t border-[#E7E5E1] pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#625143]">
              Unlimited projects
            </span>
            <AccessPill label={row.promotion.status} tone={row.promotion.tone} />
            {row.promotion.expiryDisplay && (
              <span className="text-[11px] text-[#625143]">· {row.promotion.expiryDisplay}</span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}