import React, { useMemo, useState } from "react";
import {
  Building2,
  FolderOpen,
  Coins,
  Activity as ActivityIcon,
  ArrowRightLeft,
  Mail,
  ExternalLink,
  ChevronRight,
  AlertTriangle,
  Lock,
  RefreshCw,
} from "lucide-react";
import AccessPill from "@/components/admin/access/AccessPill";
import {
  formatDateTime,
  formatDate,
  buildSampleRicherSoundsAdminData,
  transferStateTone,
} from "@/lib/commercial/richerSoundsAdminOverview";

const TABS = [
  { key: "accounts", label: "Accounts", icon: Building2 },
  { key: "projects", label: "Projects", icon: FolderOpen },
  { key: "credits", label: "Credits", icon: Coins },
  { key: "activity", label: "Activity", icon: ActivityIcon },
];

function SummaryStat({ label, value, hint }) {
  return (
    <div className="rounded-xl border border-[#DCDBD6] bg-white px-4 py-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-[#625143]">{label}</div>
      <div className="mt-1 text-2xl font-bold text-[#1B1A1A]">{value}</div>
      {hint && <div className="text-[11px] text-[#625143]">{hint}</div>}
    </div>
  );
}

function AccountsTable({ accounts, onOpen, onTransfer, onResend }) {
  const GRID = "1.6fr 0.8fr 1fr 1fr 0.5fr 0.5fr 0.5fr 110px 1.1fr";
  const HEADERS = [
    { label: "Branch", align: "left" },
    { label: "Trading no.", align: "left" },
    { label: "Eligibility", align: "left" },
    { label: "Activation", align: "left" },
    { label: "Users", align: "right" },
    { label: "Credits", align: "right" },
    { label: "Projects", align: "right" },
    { label: "Last activity", align: "right" },
    { label: "Action", align: "right" },
  ];
  return (
    <div className="overflow-x-auto rounded-lg border border-[#DCDBD6] bg-white">
      <div className="min-w-[1180px]">
        <div
          style={{ gridTemplateColumns: GRID }}
          className="grid items-center gap-2 border-b border-[#E7E5E1] bg-[#F4F3F1] px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-[#625143]"
        >
          {HEADERS.map((h, i) => (
            <div key={i} className={h.align === "right" ? "text-right" : ""}>{h.label}</div>
          ))}
        </div>
        {accounts.map((row, i) => {
          const mapping = row.mappingStatus === "verified"
            ? { label: row.tradingNumber || "—", tone: "ok" }
            : { label: "Unresolved", tone: "warn" };
          const canResend = row.activationState?.label === "Invitation Pending" && !row.isMaster;
          const canTransfer = !row.isMaster && row.eligibilityState?.label === "Approved";
          return (
            <div
              key={row.account.id}
              style={{ gridTemplateColumns: GRID }}
              className={`grid items-center gap-2 px-4 py-3 text-[12px] hover:bg-[#FAFAF9] ${i < accounts.length - 1 ? "border-b border-[#EDEBE7]" : ""}`}
            >
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold text-[#1B1A1A]">
                  {row.account.name}
                  {row.isMaster && <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-[#213428]">Master</span>}
                </div>
                <div className="truncate text-[11px] text-[#625143]">{row.primaryEmail || row.account.contact_email || "—"}</div>
              </div>
              <div>
                <AccessPill label={mapping.label} tone={mapping.tone} title={row.mappingStatus === "verified" ? "Portal mapping verified" : "Branch trading number not yet verified against Portal crosswalk"} />
              </div>
              <div><AccessPill label={row.eligibilityState?.label || "—"} tone={row.eligibilityState?.tone} /></div>
              <div><AccessPill label={row.activationPill?.label || row.activationState?.label || "—"} tone={row.activationPill?.tone || row.activationState?.tone} /></div>
              <div className="text-right tabular-nums text-[#3E4349]">{row.seatsUsed}/{row.seatsMaximum}</div>
              <div className="text-right tabular-nums font-bold text-[#1B1A1A]">{row.credits.available ?? 0}</div>
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

function ProjectsTable({ accounts }) {
  const rows = useMemo(() => {
    const out = [];
    for (const acct of accounts) {
      for (const project of acct.projects || []) {
        out.push({ ...project, branch: acct.account.name, branchId: acct.account.id });
      }
    }
    return out.sort((a, b) => String(b.updated_date || "").localeCompare(String(a.updated_date || "")));
  }, [accounts]);

  if (rows.length === 0) {
    return <div className="rounded-lg border border-dashed border-[#DCDBD6] bg-white px-5 py-6 text-center text-[13px] text-[#3E4349]">No Richer Sounds Professional Projects yet.</div>;
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

function CreditsPanel({ masterAccount, transfers, onTransfer, canReverse }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryStat label="93 available credits" value={masterAccount?.credits?.available ?? 0} hint="Capacity ledger SUM" />
        <SummaryStat label="93 credits used" value={masterAccount?.credits?.used ?? 0} hint="Project activations" />
        <SummaryStat label="Transfers made" value={transfers.length} hint="All Richer Sounds transfers" />
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
        {transfers.length === 0 ? (
          <div className="px-4 py-5 text-[13px] text-[#3E4349]">No transfers yet.</div>
        ) : (
          <div className="divide-y divide-[#EDEBE7]">
            {transfers.map((t) => (
              <div key={t.transfer_id} className="flex items-center justify-between gap-3 px-4 py-3 text-[12px]">
                <div className="min-w-0">
                  <div className="font-semibold text-[#1B1A1A]">
                    {t.source_account_name} <span className="text-[#625143]">→</span> {t.destination_account_name}
                  </div>
                  <div className="text-[11px] text-[#625143]">
                    {formatDateTime(t.created_at)} · by {t.actor_email}
                    {t.note ? ` · ${t.note}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="tabular-nums font-bold text-[#1B1A1A]">{t.amount > 0 ? `+${t.amount}` : t.amount}</span>
                  <AccessPill label={t.state} tone={transferStateTone(t.state)} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ActivityFeed({ activity }) {
  if (!activity || activity.length === 0) {
    return <div className="rounded-lg border border-dashed border-[#DCDBD6] bg-white px-5 py-6 text-center text-[13px] text-[#3E4349]">No recent Richer Sounds activity.</div>;
  }
  return (
    <div className="rounded-lg border border-[#DCDBD6] bg-white">
      <div className="divide-y divide-[#EDEBE7]">
        {activity.map((a, i) => (
          <div key={i} className="flex items-center justify-between gap-3 px-4 py-3 text-[12px]">
            <div className="min-w-0">
              <div className="font-semibold text-[#1B1A1A]">{a.action}</div>
              <div className="text-[11px] text-[#625143]">{a.account_name}{a.detail ? ` · ${a.detail}` : ""}</div>
            </div>
            <div className="whitespace-nowrap text-[11px] text-[#625143]">{formatDateTime(a.occurred_at)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BranchDrawer({ row, open, onOpenChange, onTransfer, onResend }) {
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
            <AccessPill label={row.activationPill?.label || row.activationState?.label} tone={row.activationPill?.tone || row.activationState?.tone} />
            <AccessPill label={row.mappingStatus === "verified" ? `Trading ${row.tradingNumber}` : "Mapping unresolved"} tone={row.mappingStatus === "verified" ? "ok" : "warn"} />
          </div>

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
            {row.activationState?.label === "Invitation Pending" && !row.isMaster && (
              <button type="button" onClick={() => onResend(row)} className="inline-flex items-center gap-1.5 rounded-lg border border-[#DCDBD6] bg-white px-3 py-2 text-[12px] font-semibold text-[#1B1A1A] hover:bg-slate-50">
                <Mail className="h-4 w-4" /> Resend invitation
              </button>
            )}
            {!row.isMaster && row.eligibilityState?.label === "Approved" && (
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

function TransferDialog({ open, masterAccount, destination, accounts, onClose, onSubmit }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const available = masterAccount?.credits?.available ?? 0;
  const eligibleDestinations = accounts.filter((a) => !a.isMaster && a.eligibilityState?.label === "Approved" && a.account.id !== (destination?.account?.id));
  const target = destination || null;

  React.useEffect(() => {
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
        {!target && eligibleDestinations.length > 0 && (
          <div className="mt-3 text-[11px] text-[#625143]">Open a branch from the Accounts tab to select it as the destination.</div>
        )}
      </div>
    </div>
  );
}

export default function AdminRicherSounds() {
  // FIRST CHECKPOINT: sample data. The real build swaps this for the
  // readRicherSoundsAdmin backend call (same shape).
  const [data, setData] = useState(() => buildSampleRicherSoundsAdminData());
  const [tab, setTab] = useState("accounts");
  const [loading] = useState(false);
  const [error] = useState(null);
  const [drawerRow, setDrawerRow] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [transferTarget, setTransferTarget] = useState(null);
  const [transferOpen, setTransferOpen] = useState(false);

  const masterAccount = data.masterAccount;
  const accounts = data.accounts || [];
  const transfers = data.transfers || [];
  const activity = data.activity || [];

  const handleOpen = (row) => { setDrawerRow(row); setDrawerOpen(true); };
  const handleTransfer = (row) => { setTransferTarget(row || null); setTransferOpen(true); };
  const handleResend = (row) => {
    // Placeholder: real implementation calls manageRicherSoundsOnboarding.
    window.alert(`Resend invitation for ${row.account.name} — wired in the next step.`);
  };
  const handleTransferSubmit = async ({ destinationAccountId, amount, note }) => {
    // Placeholder: real implementation calls transferRicherSoundsCredits.
    await new Promise((r) => setTimeout(r, 600));
    setData((prev) => ({
      ...prev,
      masterAccount: { ...prev.masterAccount, credits: { ...prev.masterAccount.credits, available: prev.masterAccount.credits.available - amount } },
      accounts: prev.accounts.map((a) => a.account.id === destinationAccountId ? { ...a, credits: { ...a.credits, available: (a.credits.available || 0) + amount } } : a),
      transfers: [{ transfer_id: `t-${Date.now()}`, source_account_id: prev.masterAccount.account.id, source_account_name: prev.masterAccount.account.name, destination_account_id: destinationAccountId, destination_account_name: prev.accounts.find((a) => a.account.id === destinationAccountId)?.account.name, amount, actor_email: "ci93@richersounds.com", created_at: new Date().toISOString(), completed_at: new Date().toISOString(), state: "completed", note }, ...prev.transfers],
    }));
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-800" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-10">
        <div className="rounded-xl border border-[#E7C5C5] bg-[#FBEDED] p-5 text-[#8F2F2F]">
          <div className="font-bold">Unable to load Richer Sounds administration.</div>
          <div className="text-[13px]">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[#625143]">
            <Lock className="h-3.5 w-3.5" /> Delegated administration
          </div>
          <h1 className="mt-1 font-[Didact Gothic,sans-serif] text-2xl font-bold text-[#1B1A1A]">Richer Sounds Admin</h1>
          <p className="text-[13px] text-[#625143]">Scoped to Richer Sounds accounts. Master: Custom Install - 93. Paul retains global control.</p>
        </div>
        <button type="button" className="inline-flex items-center gap-1.5 rounded-lg border border-[#DCDBD6] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#1B1A1A] hover:bg-slate-50">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {data.unresolvedMappingCount > 0 && (
        <div className="mb-5 flex items-start gap-2 rounded-lg border border-[#E4D6BE] bg-[#FAF5EC] px-4 py-3 text-[12px] text-[#7A5B22]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>{data.unresolvedMappingCount} branch Portal mappings are unresolved. Trading numbers are not shown until verified against an authoritative Partner Portal crosswalk. First activation is unaffected.</div>
        </div>
      )}

      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        <SummaryStat label="Branches" value={accounts.length} hint="All Richer Sounds" />
        <SummaryStat label="Active" value={accounts.filter((a) => a.activationState?.label === "Active").length} />
        <SummaryStat label="93 credits" value={masterAccount?.credits?.available ?? 0} hint="Available to transfer" />
        <SummaryStat label="Projects" value={accounts.reduce((n, a) => n + (a.projectCount || 0), 0)} />
      </div>

      <div className="mb-4 flex gap-1 rounded-lg border border-[#DCDBD6] bg-white p-1">
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-[12px] font-semibold transition-colors ${tab === t.key ? "bg-[#213428] text-white" : "text-[#625143] hover:bg-slate-50"}`}>
            <t.icon className="h-3.5 w-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {tab === "accounts" && <AccountsTable accounts={accounts} onOpen={handleOpen} onTransfer={handleTransfer} onResend={handleResend} />}
      {tab === "projects" && <ProjectsTable accounts={accounts} />}
      {tab === "credits" && <CreditsPanel masterAccount={masterAccount} transfers={transfers} onTransfer={handleTransfer} />}
      {tab === "activity" && <ActivityFeed activity={activity} />}

      <BranchDrawer row={drawerRow} open={drawerOpen} onOpenChange={setDrawerOpen} onTransfer={handleTransfer} onResend={handleResend} />
      <TransferDialog open={transferOpen} masterAccount={masterAccount} destination={transferTarget} accounts={accounts} onClose={() => setTransferOpen(false)} onSubmit={handleTransferSubmit} />
    </div>
  );
}