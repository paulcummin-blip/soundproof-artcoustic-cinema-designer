import React from "react";
import { Coins } from "lucide-react";
import {
  LEDGER_TYPE_LABELS,
  formatDate,
  formatDelta,
} from "@/lib/commercial/accountAccessOverview";

function BreakdownRow({ label, value, strong = false, negative = false }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#F1EFEC] py-1.5 last:border-none">
      <span className="text-[12px] text-[#3E4349]">{label}</span>
      <span className={`tabular-nums text-[12px] ${
        strong ? "font-bold text-[#1B1A1A]" : negative ? "text-[#8F2F2F]" : "text-[#3E4349]"
      }`}>
        {value}
      </span>
    </div>
  );
}

/**
 * Professional Project credit ledger for one account — the existing
 * CapacityLedger authority, shown in full.
 * Props: row
 */
export default function AccountDrawerCredits({ row }) {
  const credits = row?.credits || {};
  const entries = [...(row?.ledgerEntries || [])]
    .sort((a, b) => String(b?.created_date || "").localeCompare(String(a?.created_date || "")))
    .slice(0, 8);

  const extras = [
    credits.promotional ? { label: "Promotional", value: credits.promotional } : null,
    credits.distributor ? { label: "Distributor transfers", value: credits.distributor } : null,
    credits.trial ? { label: "Trial", value: credits.trial } : null,
    credits.internal ? { label: "Internal", value: credits.internal } : null,
  ].filter(Boolean);

  return (
    <section className="rounded-xl border border-[#DCDBD6] bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-[#E7E5E1] px-4 py-3">
        <div className="flex items-center gap-2">
          <Coins className="h-4 w-4 text-[#625143]" />
          <h3 className="m-0 text-sm font-bold text-[#1B1A1A]">Professional Project credits</h3>
        </div>
        <span className="rounded-full border border-[#BBD3C4] bg-[#EEF4F0] px-2.5 py-0.5 text-[11px] font-semibold text-[#213428]">
          {credits.available ?? 0} available
        </span>
      </div>

      <div className="px-4 py-2">
        <BreakdownRow label="Rewarded" value={credits.rewarded ?? 0} strong />
        <BreakdownRow label="Purchased" value={credits.purchased ?? 0} />
        <BreakdownRow label="Manually added (admin grants)" value={credits.manual ?? 0} strong />
        {extras.map((extra) => (
          <BreakdownRow key={extra.label} label={extra.label} value={extra.value} />
        ))}
        <BreakdownRow label="Used" value={credits.used ?? 0} negative />
        <BreakdownRow label="Reversed" value={formatDelta(credits.reversed ?? 0)} />
        <BreakdownRow label="Available" value={credits.available ?? 0} strong />
      </div>

      <div className="border-t border-[#EDEBE7] px-4 py-3">
        <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[#625143]">
          Recent ledger entries
        </div>
        {entries.length === 0 ? (
          <div className="text-[12px] text-[#3E4349]">No capacity entries recorded yet.</div>
        ) : (
          <div className="divide-y divide-[#F1EFEC]">
            {entries.map((entry) => (
              <div key={entry.id} className="flex items-start justify-between gap-3 py-1.5">
                <div className="min-w-0">
                  <div className="text-[12px] font-semibold text-[#1B1A1A]">
                    {LEDGER_TYPE_LABELS[entry.transaction_type] || entry.transaction_type || "Entry"}
                  </div>
                  {entry.reason && (
                    <div className="truncate text-[11px] text-[#625143]" title={entry.reason}>
                      {entry.reason}
                    </div>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <div className={`tabular-nums text-[12px] font-bold ${
                    Number(entry.delta) >= 0 ? "text-[#213428]" : "text-[#8F2F2F]"
                  }`}>
                    {formatDelta(entry.delta)}
                  </div>
                  <div className="text-[10px] text-[#625143]">{formatDate(entry.created_date)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}