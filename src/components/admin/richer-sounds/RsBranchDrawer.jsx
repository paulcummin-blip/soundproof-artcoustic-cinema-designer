import React from "react";
import { AlertTriangle, Mail, ArrowRightLeft, ExternalLink, ChevronRight } from "lucide-react";
import AccessPill from "@/components/admin/access/AccessPill";
import RsApprovalControl from "@/components/admin/access/RsApprovalControl";
import { formatDate, formatDateTime } from "@/lib/commercial/accountAccessOverview";

function SummaryStat({ label, value, hint }) {
  return (
    <div className="rounded-xl border border-[#DCDBD6] bg-white px-4 py-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-[#625143]">{label}</div>
      <div className="mt-1 text-xl font-bold text-[#1B1A1A]">{value}</div>
      {hint && <div className="text-[11px] text-[#625143]">{hint}</div>}
    </div>
  );
}

export default function RsBranchDrawer({ row, open, onOpenChange, onTransfer, onResend }) {
  if (!row) return null;
  const account = row.account;
  return (
    <div className={`fixed inset-0 z-50 ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
      <div className={`absolute inset-0 bg-black/30 transition-opacity ${open ? "opacity-100" : "opacity-0"}`} onClick={() => onOpenChange(false)} />
      <div className={`absolute right-0 top-0 h-full w-full max-w-2xl overflow-y-auto bg-white shadow-xl transition-transform ${open ? "translate-x-0" : "translate-x-full"}`}>
        <div className="sticky top-0 flex items-center justify-between border-b border-[#DCDBD6] bg-white px-5 py-4">
          <div>
            <div className="text-[15px] font-bold text-[#1B1A1A]">{account.name}</div>
            <div className="text-[11px] text-[#625143]">{account.contact_email || row.primaryEmail || "—"}</div>
          </div>
          <button type="button" onClick={() => onOpenChange(false)} className="rounded-md border border-[#DCDBD6] px-2.5 py-1.5 text-[12px] font-semibold text-[#1B1A1A] hover:bg-slate-50">Close</button>
        </div>
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap gap-2">
            <AccessPill label={row.eligibilityState?.label} tone={row.eligibilityState?.tone} title="Sound Proof eligibility — set by master admin" />
            {row.isMaster
              ? <AccessPill label="Central admin" tone="muted" title="Custom Install - 93 — exempt from RS approval" />
              : <AccessPill label={row.rsApprovalState?.label} tone={row.rsApprovalState?.tone} title="RS internal approval — set by 93 or a master admin" />}
            <AccessPill label={row.activationPill?.label || row.activationState?.label} tone={row.activationPill?.tone || row.activationState?.tone} />
            <AccessPill label={row.mappingStatus === "verified" ? `Trading ${row.tradingNumber}` : "Mapping unresolved"} tone={row.mappingStatus === "verified" ? "ok" : "warn"} />
          </div>

          {/* RS-01 internal approval control — shared control for ordinary RS
              stores. 93 (central administrator) is exempt and shows no control. */}
          {!row.isMaster && (
            <RsApprovalControl row={row} onChanged={() => { /* drawer is read-only; parent reloads on close */ }} />
          )}

          {row.mappingStatus !== "verified" && (
            <div className="flex items-start gap-2 rounded-lg border border-[#E4D6BE] bg-[#FAF5EC] px-3 py-2.5 text-[12px] text-[#7A5B22]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>This branch's Portal trading-account mapping has not been verified against an authoritative crosswalk. The branch number is not shown. First activation still works through artcousticpartners.uk.</div>
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-4">
            <SummaryStat label="Credits" value={row.credits.available ?? 0} hint="Available" />
            <SummaryStat label="Used" value={row.credits.used ?? 0} />
            <SummaryStat label="Projects" value={row.projectCount} />
            <SummaryStat label="Users" value={`${row.seatsUsed}/${row.seatsMaximum}`} />
          </div>

          <section className="rounded-xl border border-[#DCDBD6] bg-white p-4">
            <h3 className="m-0 mb-2 text-sm font-bold text-[#1B1A1A]">Users ({row.members.length})</h3>
            {row.members.length === 0 ? (
              <div className="text-[13px] text-[#3E4349]">No users yet. Onboarding starts from artcousticpartners.uk.</div>
            ) : (
              <div className="divide-y divide-[#EDEBE7]">
                {row.members.map((m, i) => (
                  <div key={i} className="flex items-center justify-between py-2 text-[12px]">
                    <div>
                      <div className="font-semibold text-[#1B1A1A]">{m.full_name || m.email}</div>
                      <div className="text-[11px] text-[#625143]">{m.email}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <AccessPill label={m.is_account_admin ? "Admin" : m.access_level} tone={m.is_account_admin ? "ok" : "muted"} />
                      <AccessPill label={m.status} tone={m.status === "active" ? "ok" : "warn"} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-[#DCDBD6] bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="m-0 text-sm font-bold text-[#1B1A1A]">Projects (read-only)</h3>
              <span className="rounded-full border border-[#DCDBD6] px-2 py-0.5 text-[11px] font-semibold text-[#3E4349]">{row.projects.length}</span>
            </div>
            {row.projects.length === 0 ? (
              <div className="text-[13px] text-[#3E4349]">No projects yet.</div>
            ) : (
              <div className="divide-y divide-[#EDEBE7]">
                {row.projects.map((p) => (
                  <div key={p.id} className="flex items-center justify-between py-2 text-[12px]">
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-[#1B1A1A]">{p.name}</div>
                      <div className="truncate text-[11px] text-[#625143]">{p.client_name || ""} · {p.project_status || p.lifecycle_status} · {formatDate(p.updated_date)}</div>
                    </div>
                    <a href={`/RoomDesigner?project=${encodeURIComponent(p.id)}`} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[#DCDBD6] px-2.5 py-1.5 text-[11px] font-semibold text-[#1B1A1A] no-underline hover:bg-slate-50">
                      View <ChevronRight className="h-3.5 w-3.5" />
                    </a>
                  </div>
                ))}
              </div>
            )}
          </section>

          {row.audits && row.audits.length > 0 && (
            <section className="rounded-xl border border-[#DCDBD6] bg-white p-4">
              <h3 className="m-0 mb-2 text-sm font-bold text-[#1B1A1A]">Recent account events</h3>
              <div className="divide-y divide-[#EDEBE7]">
                {row.audits.slice(0, 8).map((a, i) => (
                  <div key={i} className="flex items-center justify-between py-2 text-[12px]">
                    <div className="text-[#1B1A1A]">{a.action}<span className="text-[#625143]"> · {a.actor_email}</span></div>
                    <div className="text-[11px] text-[#625143]">{formatDateTime(a.occurred_at)}</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="flex flex-wrap gap-2">
            {row.activationState?.label === "Invitation Pending" && !row.isMaster && row.members.some((m) => m.status === "pending") && (
              <button type="button" onClick={() => onResend(row)} className="inline-flex items-center gap-1.5 rounded-lg border border-[#DCDBD6] bg-white px-3 py-2 text-[12px] font-semibold text-[#1B1A1A] hover:bg-slate-50">
                <Mail className="h-4 w-4" /> Resend invitation
              </button>
            )}
            {!row.isMaster && row.eligibilityState?.label === "Approved" && row.rsApprovalState?.status === "approved" && (
              <button type="button" onClick={() => onTransfer(row)} className="inline-flex items-center gap-1.5 rounded-lg border border-[#213428] bg-[#213428] px-3 py-2 text-[12px] font-semibold text-white hover:bg-[#2A4434]">
                <ArrowRightLeft className="h-4 w-4" /> Transfer credits
              </button>
            )}
            <a href="https://artcousticpartners.uk" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-[#DCDBD6] bg-white px-3 py-2 text-[12px] font-semibold text-[#1B1A1A] no-underline hover:bg-slate-50">
              <ExternalLink className="h-4 w-4" /> Partner Portal
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}