import React, { useState } from "react";
import { ShieldCheck, ShieldAlert, ShieldOff, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { isMasterAdmin, isRicherSoundsAdmin } from "@/lib/accountAccess";
import AccessPill from "@/components/admin/access/AccessPill";

/**
 * RsApprovalControl — RS-01 Richer Sounds internal approval control for the
 * account detail drawer. Self-contained: reads the current user's capability
 * and invokes manageRicherSoundsApproval directly, then calls onChanged so the
 * page refreshes the row.
 *
 * Shown only for ordinary Richer Sounds stores (row.rsApprovalState !== null
 * and not the central administrator). Master admins and authorised Custom
 * Install - 93 account admins can set / suspend / restore; everyone else sees
 * the current state read-only.
 *
 * Props: row, onChanged(row) — called after a successful change so the page
 *        can refresh its data.
 */
export default function RsApprovalControl({ row, onChanged }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  const canManage = isMasterAdmin(user) || isRicherSoundsAdmin(user);
  const rsApproval = row.rsApprovalState;
  if (!rsApproval) return null;

  const run = async (action) => {
    setBusy(action);
    setError(null);
    try {
      const res = await base44.functions.invoke("manageRicherSoundsApproval", {
        action,
        account_id: row.account.id,
      });
      if (res?.data?.ok) {
        onChanged?.(row);
      } else {
        setError(res?.data?.message || res?.data?.error || "Unable to change RS approval.");
      }
    } catch (err) {
      setError(err?.message || "Unable to change RS approval.");
    } finally {
      setBusy(null);
    }
  };

  const status = rsApproval.status;

  return (
    <section className="rounded-xl border border-[#DCDBD6] bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="m-0 text-sm font-bold text-[#1B1A1A]">RS internal approval</h3>
        <AccessPill label={rsApproval.label} tone={rsApproval.tone} />
      </div>
      <p className="mt-1 text-[11px] text-[#625143]">
        A separate Richer Sounds approval, set by a Master Admin or an authorised
        Custom Install - 93 administrator. An ordinary store can activate and use
        Sound Proof only when this is approved <em>and</em> Sound Proof eligibility
        is present.
      </p>

      {error && (
        <div className="mt-2 rounded-md border border-[#E7C9C2] bg-[#FBEEEB] px-3 py-2 text-[11px] text-[#9C3A2A]">
          {error}
        </div>
      )}

      {canManage ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {status !== "approved" && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => run(status === "suspended" ? "restore" : "set")}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#BBD3C4] bg-[#EEF4F0] px-3 py-1.5 text-[11px] font-semibold text-[#213428] hover:bg-[#E3EDE8] disabled:opacity-50"
            >
              {busy === "set" || busy === "restore" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : status === "suspended" ? (
                <ShieldCheck className="h-3.5 w-3.5" />
              ) : (
                <ShieldCheck className="h-3.5 w-3.5" />
              )}
              {status === "suspended" ? "Restore approval" : "Approve"}
            </button>
          )}
          {status === "approved" && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => run("suspend")}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#E7C9C2] bg-[#FBEEEB] px-3 py-1.5 text-[11px] font-semibold text-[#9C3A2A] hover:bg-[#F6E2DD] disabled:opacity-50"
            >
              {busy === "suspend" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ShieldOff className="h-3.5 w-3.5" />
              )}
              Suspend approval
            </button>
          )}
          {status === "suspended" && (
            <span className="inline-flex items-center gap-1 text-[11px] text-[#9C3A2A]">
              <ShieldAlert className="h-3.5 w-3.5" />
              Suspended — linked users cannot use Sound Proof.
            </span>
          )}
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-[#625143]">
          Only a Master Admin or an authorised Custom Install - 93 administrator
          can change this approval.
        </p>
      )}
    </section>
  );
}