import React, { useMemo } from "react";
import AccessPill from "@/components/admin/access/AccessPill";
import { formatDate } from "@/lib/commercial/accountAccessOverview";

export default function RsProjectsTable({ accounts }) {
  const rows = useMemo(() => {
    const out = [];
    for (const acct of Array.isArray(accounts) ? accounts : []) {
      for (const project of acct.projects || []) {
        out.push({ ...project, branch: acct.account.name, branchId: acct.account.id });
      }
    }
    return out.sort((a, b) => String(b.updated_date || "").localeCompare(String(a.updated_date || "")));
  }, [accounts]);

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[#DCDBD6] bg-white px-5 py-6 text-center text-[13px] text-[#3E4349]">
        No Richer Sounds Professional Projects yet.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-[#DCDBD6] bg-white">
      <div className="min-w-[920px]">
        <div className="grid grid-cols-[1.4fr 1.2fr 1fr 0.8fr 1fr 1fr] gap-2 border-b border-[#E7E5E1] bg-[#F4F3F1] px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-[#625143]">
          <div>Project</div><div>Branch</div><div>Status</div><div>Tier</div><div>Source</div><div className="text-right">Updated</div>
        </div>
        {rows.map((p, i) => (
          <div key={p.id} className={`grid grid-cols-[1.4fr 1.2fr 1fr 0.8fr 1fr 1fr] items-center gap-2 px-4 py-2.5 text-[12px] ${i < rows.length - 1 ? "border-b border-[#EDEBE7]" : ""}`}>
            <div className="min-w-0">
              <div className="truncate font-semibold text-[#1B1A1A]">{p.name || "Untitled"}</div>
              <div className="truncate text-[11px] text-[#625143]">{p.client_name || "—"}</div>
            </div>
            <div className="truncate text-[#3E4349]">{p.branch}</div>
            <div><AccessPill label={p.project_status || p.lifecycle_status || "—"} tone={p.project_status === "Live" ? "ok" : "muted"} /></div>
            <div className="text-[#3E4349]">{p.commercial_tier || "—"}</div>
            <div className="text-[#3E4349]">{p.commercial_source || "—"}</div>
            <div className="text-right tabular-nums text-[#625143]">{formatDate(p.updated_date)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}