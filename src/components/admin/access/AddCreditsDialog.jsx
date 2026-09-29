import React, { useEffect, useState } from "react";
import { Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const QUICK_AMOUNTS = [1, 2, 5, 10];

/**
 * Adds free Professional Project credits as an append-only ledger entry.
 * Props: open, onOpenChange, row, onSubmit({ credits, reason }), busy, error
 */
export default function AddCreditsDialog({ open, onOpenChange, row, onSubmit, busy = false, error = null }) {
  const [credits, setCredits] = useState(1);
  const [reason, setReason] = useState("");
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    if (open) {
      setCredits(1);
      setReason("");
      setLocalError("");
    }
  }, [open]);

  const accountName = row?.account?.name || "this account";
  const available = row?.credits?.available ?? 0;

  function handleSubmit(event) {
    event.preventDefault();
    const amount = Number(credits);
    if (!Number.isFinite(amount) || amount <= 0) {
      setLocalError("Enter a whole number of credits greater than zero.");
      return;
    }
    if (!reason.trim()) {
      setLocalError("A reason is required so the grant is auditable.");
      return;
    }
    onSubmit?.({ credits: Math.round(amount), reason: reason.trim() });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Coins className="h-4 w-4 text-[#213428]" />
            Add free credits
          </DialogTitle>
          <DialogDescription className="text-[13px]">
            Grants Professional Project credits to <span className="font-semibold text-[#1B1A1A]">{accountName}</span>.
            Currently {available} available.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[#625143]">
              Credits to add
            </Label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                step="1"
                value={credits}
                onChange={(event) => setCredits(event.target.value)}
                className="h-9 w-24 rounded-lg border border-[#DCDBD6] px-3 text-sm outline-none focus:border-[#213428]"
              />
              {QUICK_AMOUNTS.map((amount) => (
                <button
                  key={amount}
                  type="button"
                  onClick={() => setCredits(amount)}
                  className={`h-9 rounded-lg border px-3 text-xs font-semibold ${
                    Number(credits) === amount
                      ? "border-[#213428] bg-[#213428] text-white"
                      : "border-[#DCDBD6] text-[#3E4349] hover:bg-slate-50"
                  }`}
                >
                  +{amount}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[#625143]">
              Reason / note
            </Label>
            <Textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              placeholder="Why these credits are being granted"
              className="text-sm"
            />
          </div>

          <p className="rounded-lg border border-[#E7E5E1] bg-[#FAFAF9] p-3 text-[11px] leading-relaxed text-[#625143]">
            Written to the existing capacity ledger as an admin grant, so rewarded, manually added and
            available credits update immediately and the change is visible in the account history.
            The current credit model has no expiry field, so granted credits do not expire.
          </p>

          {(localError || error) && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-[12px] text-red-800">
              {localError || error}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange?.(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Adding…" : "Add credits"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}