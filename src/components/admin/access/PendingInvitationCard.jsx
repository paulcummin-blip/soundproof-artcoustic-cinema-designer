import React, { useState } from "react";
import { Mail, Pencil, Ban, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatDateTime } from "@/lib/commercial/accountAccessOverview";

/**
 * PendingInvitationCard
 * ---------------------
 * Master-admin management of a pending, unclaimed dealer activation
 * invitation. Shown inside the Account Access drawer when the account has a
 * pending administrator membership that has not yet been claimed.
 *
 * Three actions, all routed through the existing manageAccountUsers authority:
 *   Resend Invitation       — re-sends the native invitation to the nominated
 *                             email (existing resend mechanism, 60s throttle).
 *   Change Email & Resend    — corrects the nominated email and re-sends. The
 *                             previous email can no longer claim the membership.
 *   Cancel Invitation        — withdraws the pending membership and releases
 *                             the seat so the dealer can re-apply through the
 *                             Partner Portal.
 *
 * None of these actions activate the account or start the 90-day term. Props:
 * row, onAccessChanged().
 */
const PENDING_BADGE = "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold";
const BRAND_GREEN = "#213428";
const CANCEL_RED = "#A63C32";

function findPendingInvitation(row) {
  return (row?.members || []).find(
    (member) => member?.status === "pending" && member?.is_account_admin && !member?.user_id
  ) || null;
}

export default function PendingInvitationCard({ row, onAccessChanged }) {
  const pending = findPendingInvitation(row);
  const account = row?.account;
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [changeOpen, setChangeOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [deliveryWarning, setDeliveryWarning] = useState(null);

  if (!pending || !account) return null;

  const tradingNumber = (row.links || []).map((l) => l.external_account_number).filter(Boolean).join(", ");
  const groupLabel = account.dealer_group || "";
  const subLabel = [groupLabel, tradingNumber].filter(Boolean).join(" · ");
  const accessStarted = Boolean(account.first_activated_at || account.soundproof_access_expires_at);

  async function invoke(payload) {
    const response = await base44.functions.invoke("manageAccountUsers", payload);
    return response?.data || response || {};
  }

  async function handleResend() {
    setBusy("resend");
    setError(null)
    setDeliveryWarning(null);
    try {
      const data = await invoke({ action: "resend", account_id: account.id, membership_id: pending.id });
      if (data.error) {
        setError(data.message || data.error);
        return;
      }
      onAccessChanged?.();
    } catch (err) {
      setError(err?.message || "The invitation could not be resent.");
    } finally {
      setBusy(null);
    }
  }

  async function handleChangeEmail() {
    const trimmed = newEmail.trim().toLowerCase();
    if (!trimmed || !trimmed.includes("@")) {
      setError("Enter a valid replacement email address.");
      return;
    }
    setBusy("change_email");
    setError(null);
    try {
      const data = await invoke({
        action: "change_email",
        account_id: account.id,
        membership_id: pending.id,
        new_email: trimmed,
      });
      if (data.error === "INVITATION_DELIVERY_FAILED" || data.invitation_delivery?.ok === false) {
        setDeliveryWarning({
          email: data.corrected_email || trimmed,
          message: data.message || "The email was corrected but the invitation could not be sent. Retry sending.",
        });
        setChangeOpen(false);
        setNewEmail("");
        onAccessChanged?.();
        return;
      }
      if (data.error) {
        setError(data.message || data.error);
        return;
      }
      setChangeOpen(false);
      setNewEmail("");
      setDeliveryWarning(null);
      onAccessChanged?.();
    } catch (err) {
      setError(err?.message || "The email could not be corrected.");
    } finally {
      setBusy(null);
    }
  }

  async function handleCancel() {
    setBusy("cancel");
    setError(null);
    try {
      const data = await invoke({ action: "cancel_invitation", account_id: account.id, membership_id: pending.id });
      if (data.error) {
        setError(data.message || data.error);
        return;
      }
      setCancelOpen(false);
      setDeliveryWarning(null);
      onAccessChanged?.();
    } catch (err) {
      setError(err?.message || "The invitation could not be cancelled.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-xl border border-[#DCDBD6] bg-white">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <div className="text-[15px] font-bold text-[#1B1A1A]">{account.name}</div>
          {subLabel && (
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#625143]">{subLabel}</div>
          )}
        </div>
        <span className={PENDING_BADGE} style={{ background: "#FCE8E0", color: "#7A3B12" }}>Invitation pending</span>
      </div>

      <div className="border-t border-[#E7E5E1]" />

      {/* Body */}
      <div className="space-y-1 px-4 py-3 text-[13px] text-[#1B1A1A]">
        {pending.full_name && <div className="font-semibold">{pending.full_name}</div>}
        <div className="break-words text-[#3E4349]">{pending.email}</div>
        <div className="text-[12px] text-[#625143]">
          Invitation requested: {pending.invited_at ? formatDateTime(pending.invited_at) : "—"}
        </div>
        <div className="text-[12px] text-[#625143]">
          {accessStarted ? "Access period commenced" : "Access period not yet started"}
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-2 px-4 pb-4">
        <Button
          type="button"
          disabled={busy !== null}
          onClick={handleResend}
          className="w-full gap-2 text-white"
          style={{ background: BRAND_GREEN }}
        >
          {busy === "resend" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
          Resend Invitation
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy !== null}
          onClick={() => { setError(null); setChangeOpen(true); }}
          className="w-full gap-2 border-[#DCDBD6] text-[#1B1A1A]"
        >
          <Pencil className="h-4 w-4" />
          Change Email & Resend
        </Button>

        {deliveryWarning && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
            <div>{deliveryWarning.message}</div>
            <button
              type="button"
              disabled={busy !== null}
              onClick={handleResend}
              className="mt-1 font-semibold underline underline-offset-2 hover:no-underline disabled:opacity-50"
            >
              {busy === "resend" ? "Sending…" : `Resend to ${deliveryWarning.email}`}
            </button>
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">{error}</div>
        )}

        <div className="pt-1 text-center">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => { setError(null); setCancelOpen(true); }}
            className="text-[12px] font-semibold hover:underline disabled:opacity-50"
            style={{ color: CANCEL_RED }}
          >
            Cancel Invitation
          </button>
        </div>
      </div>

      {/* Change Email dialog */}
      <AlertDialog open={changeOpen} onOpenChange={(open) => { if (!busy) setChangeOpen(open); }}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Change email & resend invitation</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-[13px] leading-relaxed">
              <span className="block">Correct the nominated administrator email for {account.name}. The previous email will no longer be able to claim this membership.</span>
              <span className="block text-[#625143]">Current: <span className="font-mono text-[12px]">{pending.email}</span></span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-1">
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#625143]">Replacement email</label>
            <Input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="ross.braybrook@avensys.co.uk"
              disabled={busy !== null}
              onKeyDown={(e) => { if (e.key === "Enter") handleChangeEmail(); }}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy === "change_email" || !newEmail.trim()}
              onClick={(e) => { e.preventDefault(); handleChangeEmail(); }}
              className="text-white"
              style={{ background: BRAND_GREEN }}
            >
              {busy === "change_email" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Correct & Resend"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel dialog */}
      <AlertDialog open={cancelOpen} onOpenChange={(open) => { if (!busy) setCancelOpen(open); }}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel pending invitation?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-[13px] leading-relaxed">
              <span className="block">
                The pending invitation to <span className="font-mono text-[12px]">{pending.email}</span> will be withdrawn and the reserved seat released. The dealer can submit a fresh activation request through the Partner Portal.
              </span>
              <span className="block text-[#625143]">The account is not activated, the 90-day term is not started, and eligibility, Premium Partner status, promotions, Project Tokens and the Partner Portal identity link are all preserved.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Keep invitation</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy === "cancel"}
              onClick={(e) => { e.preventDefault(); handleCancel(); }}
              className="bg-[#B23A3A] text-white hover:bg-[#8F2F2F]"
            >
              {busy === "cancel" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cancel invitation"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}