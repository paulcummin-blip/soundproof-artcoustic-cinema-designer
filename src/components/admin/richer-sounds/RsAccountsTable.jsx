import React from "react";
import { Mail, ChevronRight, ArrowRightLeft } from "lucide-react";
import AccessPill from "@/components/admin/access/AccessPill";
import { formatDate } from "@/lib/commercial/accountAccessOverview";

const GRID = "1.5fr 0.7fr 0.9fr 0.9fr 0.9fr 0.5fr 0.5fr 0.5fr 110px 1.1fr";

const HEADERS = [
  { label: "Branch", align: "left" },
  { label: "Trading no.", align: "left" },
  { label: "Eligibility", align: "left" },
  { label: "RS approval", align: "left" },
  { label: "Activation", align: "left" },
  { label: "Users", align: "right" },
  { label: "Allocated", align: "right" },
  { label: "Projects", align: "right" },
  { label: "Last activity", align: "right" },
  { label: "Action", align: "right" },
];

export default function RsAccountsTable({ accounts, onOpen, onTransfer, onResend }) {
  const list = Array.isArray(accounts) ? accounts : [];
  if (list.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[#DCDBD6] bg-white px-5 py-6 text-center text-[13px] text-[#3E4349]">
        No Richer Sounds accounts found.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-[#DCDBD6] bg-white">
      <div className="min-w-[1280px]">
        <div
          style={{ gridTemplateColumns: GRID }}
          className="grid items-center gap-2 border-b border-[#E7E5E1] bg-[#F4F3F1] px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-[#625143]"
        >
          {HEADERS.map((h, i) => (
            <div key={i} className={h.align === "right" ? "text-right" : ""}>{h.label}</div>
          ))}
        </div>
        {list.map((row, i) => {
          const mapping = row.mappingStatus === "verified"
            ? { label: row.tradingNumber || "—", tone: "ok" }
            : { label: "Unresolved", tone: "warn" };
          const canResend = row.activationState?.label === "Invitation Pending" && !row.isMaster;
          // Allocations require both Sound Proof eligibility and RS internal
          // approval, so tokens are only sent to branches that can actually use them.
          const canTransfer = !row.isMaster
            && row.eligibilityState?.label === "Approved"
            && row.rsApprovalState?.status === "approved";
          return (
            <div
              key={row.account.id}
              style={{ gridTemplateColumns: GRID }}
              className={`grid items-center gap-2 px-4 py-3 text-[12px] hover:bg-[#FAFAF9] ${i < list.length - 1 ? "border-b border-[#EDEBE7]" : ""}`}
            >
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold text-[#1B1A1A]">
                  {row.account.name}
                  {row.isMaster && <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-[#213428]">Master</span>}
                </div>
                <div className="truncate text-[11px] text-[#625143]">{row.primaryEmail || row.account.contact_email || "—"}</div>
              </div>
              <div>
                <AccessPill
                  label={mapping.label}
                  tone={mapping.tone}
                  title={row.mappingStatus === "verified" ? "Portal mapping verified" : "Branch trading number not yet verified against Portal crosswalk"}
                />
              </div>
              <div><AccessPill label={row.eligibilityState?.label || "—"} tone={row.eligibilityState?.tone} title="Sound Proof eligibility — set by master admin" /></div>
              <div>
                {row.isMaster
                  ? <AccessPill label="Central admin" tone="muted" title="Custom Install - 93 — exempt from RS approval" />
                  : <AccessPill label={row.rsApprovalState?.label || "—"} tone={row.rsApprovalState?.tone} title="RS internal approval — set by 93 or a master admin" />}
              </div>
              <div><AccessPill label={row.activationPill?.label || row.activationState?.label || "—"} tone={row.activationPill?.tone || row.activationState?.tone} /></div>
              <div className="text-right tabular-nums text-[#3E4349]">{row.seatsUsed}/{row.seatsMaximum}</div>
              <div className="text-right tabular-nums font-bold text-[#1B1A1A]" title={row.isMaster ? "93 central pool (available)" : "Total tokens allocated in from 93"}>
                {row.isMaster ? (row.credits.available ?? 0) : (row.credits.rsTransferred ?? 0)}
              </div>
              <div className="text-right tabular-nums text-[#3E4349]">{row.projectCount}</div>
              <div className="whitespace-nowrap text-right tabular-nums text-[#625143]">
                {row.lastActivity ? formatDate(new Date(row.lastActivity).toISOString()) : "—"}
              </div>
              <div className="flex items-center justify-end gap-1.5">
                {canResend && (
                  <button type="button" onClick={() => onResend(row)} title="Resend pending invitation" className="inline-flex items-center gap-1 rounded-lg border border-[#DCDBD6] bg-white px-2 py-1.5 text-[11px] font-semibold text-[#1B1A1A] hover:bg-slate-50">
                    <Mail className="h-3.5 w-3.5" /> Resend
                  </button>
                )}
                {canTransfer && (
                  <button type="button" onClick={() => onTransfer(row)} title="Transfer credits from 93" className="inline-flex items-center gap-1 rounded-lg border border-[#213428] bg-[#213428] px-2 py-1.5 text-[11px] font-semibold text-white hover:bg-[#2A4434]">
                    <ArrowRightLeft className="h-3.5 w-3.5" /> Transfer
                  </button>
                )}
                <button type="button" onClick={() => onOpen(row)} className="inline-flex items-center gap-1 rounded-lg border border-[#DCDBD6] bg-white px-2 py-1.5 text-[11px] font-semibold text-[#1B1A1A] hover:bg-slate-50">
                  View <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}