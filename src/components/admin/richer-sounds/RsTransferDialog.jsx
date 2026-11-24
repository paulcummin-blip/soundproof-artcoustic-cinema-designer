import React, { useEffect, useState } from "react";

export default function RsTransferDialog({ open, masterAccount, destination, accounts, onClose, onSubmit }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const available = masterAccount?.credits?.available ?? 0;
  const target = destination || null;

  useEffect(() => {
    if (open) { setAmount(""); setNote(""); setError(null); setSubmitting(false); }
  }, [open]);

  if (!open) return null;
  const amt = parseInt(amount, 10);
  const valid = Number.isFinite(amt) && amt > 0 && amt <= available && target;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-xl border border-[#DCDBD6] bg-white p-5 shadow-xl">
        <h2 className="m-0 mb-1 text-base font-bold text-[#1B1A1A]">Transfer credits from Custom Install - 93</h2>
        <p className="mt-0 mb-4 text-[12px] text-[#625143]">A real ledger transfer: 93 is debited and the branch is credited. Reversible only by a master admin.</p>
        <div className="mb-3 rounded-lg border border-[#E7E5E1] bg-[#FAFAF9] px-3 py-2 text-[12px]">
          <div className="flex justify-between"><span className="text-[#625143]">93 available</span><span className="font-bold tabular-nums text-[#1B1A1A]">{available}</span></div>
          <div className="flex justify-between"><span className="text-[#625143]">Destination</span><span className="font-semibold text-[#1B1A1A]">{target?.account?.name || "Select a branch"}</span></div>
        </div>
        <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-[#625143]">Amount</label>
        <input type="number" min="1" max={available} value={amount} onChange={(e) => setAmount(e.target.value)} className="mb-3 w-full rounded-lg border border-[#DCDBD6] px-3 py-2 text-[13px]" placeholder="e.g. 5" />
        <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-[#625143]">Note (optional)</label>
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} className="mb-4 w-full rounded-lg border border-[#DCDBD6] px-3 py-2 text-[13px]" placeholder="Onboarding allocation" />
        {error && <div className="mb-3 rounded-lg border border-[#E7C5C5] bg-[#FBEDED] px-3 py-2 text-[12px] text-[#8F2F2F]">{error}</div>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-[#DCDBD6] px-3 py-2 text-[12px] font-semibold text-[#1B1A1A] hover:bg-slate-50">Cancel</button>
          <button
            type="button"
            disabled={!valid || submitting}
            onClick={async () => {
              if (!valid) { setError("Enter a positive amount up to the 93 balance and choose a destination."); return; }
              setSubmitting(true);
              setError(null);
              try {
                await onSubmit({ destinationAccountId: target.account.id, amount: amt, note: note.trim() });
                onClose();
              } catch (e) {
                setError(e?.message || "Transfer failed.");
              } finally {
                setSubmitting(false);
              }
            }}
            className="rounded-lg border border-[#213428] bg-[#213428] px-3 py-2 text-[12px] font-semibold text-white hover:bg-[#2A4434] disabled:opacity-50"
          >
            {submitting ? "Transferring…" : "Confirm transfer"}
          </button>
        </div>
        {!target && (
          <div className="mt-3 text-[11px] text-[#625143]">Open a branch from the Accounts tab to select it as the destination.</div>
        )}
      </div>
    </div>
  );
}