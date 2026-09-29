import React from "react";
import { Clock3 } from "lucide-react";
import { formatDateTime } from "@/lib/commercial/accountAccessOverview";

const VISIBLE_LIMIT = 8;

/**
 * Recent account events from the existing append-only account-user audit trail.
 * Props: row
 */
export default function AccountDrawerEvents({ row }) {
  const audits = [...(row?.audits || [])]
    .sort((a, b) => String(b?.occurred_at || "").localeCompare(String(a?.occurred_at || "")))
    .slice(0, VISIBLE_LIMIT);

  return (
    <section className="rounded-xl border border-[#DCDBD6] bg-white">
      <div className="flex items-center gap-2 border-b border-[#E7E5E1] px-4 py-3">
        <Clock3 className="h-4 w-4 text-[#625143]" />
        <h3 className="m-0 text-sm font-bold text-[#1B1A1A]">Recent account events</h3>
      </div>

      {audits.length === 0 ? (
        <div className="px-4 py-5 text-[13px] text-[#3E4349]">No account events recorded yet.</div>
      ) : (
        <div className="divide-y divide-[#EDEBE7]">
          {audits.map((audit) => (
            <div key={audit.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <div className="text-[12px] font-semibold text-[#1B1A1A]">
                  {String(audit.action || "").replaceAll("_", " ") || "Event"}
                  <span className="font-normal text-[#3E4349]"> · {audit.target_email || "unknown user"}</span>
                </div>
                <div className="truncate text-[11px] text-[#625143]">by {audit.actor_email || "system"}</div>
              </div>
              <div className="shrink-0 text-[10px] text-[#625143]">{formatDateTime(audit.occurred_at)}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}