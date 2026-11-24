import React from "react";
import { ArrowRightLeft } from "lucide-react";
import AccessPill from "@/components/admin/access/AccessPill";
import { formatDateTime } from "@/lib/commercial/accountAccessOverview";
import { transferStateTone } from "@/lib/commercial/richerSoundsAdminOverview";

function SummaryStat({ label, value, hint }) {
  return (
    <div className="rounded-xl border border-[#DCDBD6] bg-white px-4 py-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-[#625143]">{label}</div>
      <div className="mt-1 text-2xl font-bold text-[#1B1A1A]">{value}</div>
      {hint && <div className="text-[11px] text-[#625143]">{hint}</div>}
    </div>
  );
}

export default function RsCreditsPanel({ masterAccount, transfers, onTransfer, onReverse, canReverse }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryStat label="93 available credits" value={masterAccount?.credits?.available ?? 0} hint="Capacity ledger SUM" />
        <SummaryStat label="93 credits used" value={masterAccount?.credits?.used ?? 0} hint="Project activations" />
        <SummaryStat label="Transfers made" value={(transfers || []).length} hint="All Richer Sounds transfers" />
      </div>
      <div className="rounded-lg border border-[#DCDBD6] bg-white">
        <div className="flex items-center justify-between border-b border-[#E7E5E1] px-4 py-3">
          <h3 className="m-0 text-sm font-bold text-[#1B1A1A]">Transfer history</h3>
          {masterAccount && (
            <button type="button" onClick={() => onTransfer(null)} className="inline-flex items-center gap-1.5 rounded-lg border border-[#213428] bg-[#213428] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#2A4434]">
              <ArrowRightLeft className="h-3.5 w-3.5" /> New transfer
            </button>
          )}
        </div>
        {(!transfers || transfers.length === 0) ? (
          <div className="px-4 py-5 text-[13px] text-[#3E4349]">No transfers yet.</div>
        ) : (
          <div className="divide-y divide-[#EDEBE7]">
            {transfers.map((t) => (
              <div key={t.transfer_id} className="flex items-center justify-between gap-3 px-4 py-3 text-[12px]">
                <div className="min-w-0">
                  <div className="font-semibold text-[#1B1A1A]">
                    {t.source_account_name} <span className="text-[#625143]">→</span> {t.destination_account_name}
                    {t.direction === "reverse" && <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-[#2C5AA0]">Reversal</span>}
                  </div>
                  <div className="text-[11px] text-[#625143]">
                    {formatDateTime(t.created_at)} · by {t.actor_email}{t.actor_is_master_admin ? " (master admin)" : ""}
                    {t.note ? ` · ${t.note}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="tabular-nums font-bold text-[#1B1A1A]">{t.amount > 0 ? `+${t.amount}` : t.amount}</span>
                  <AccessPill label={t.state} tone={transferStateTone(t.state)} />
                  {canReverse && t.direction === "forward" && t.state === "completed" && (
                    <button type="button" onClick={() => onReverse(t)} className="rounded-md border border-[#DCDBD6] px-2 py-1 text-[10px] font-semibold text-[#1B1A1A] hover:bg-slate-50">Reverse</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}