import React, { useState } from "react";
import {
  Building2,
  FolderOpen,
  Coins,
  Activity as ActivityIcon,
  AlertTriangle,
  Lock,
  RefreshCw,
} from "lucide-react";
import { useRicherSoundsAdminData } from "@/components/admin/richer-sounds/useRicherSoundsAdminData";
import RsAccountsTable from "@/components/admin/richer-sounds/RsAccountsTable";
import RsProjectsTable from "@/components/admin/richer-sounds/RsProjectsTable";
import RsCreditsPanel from "@/components/admin/richer-sounds/RsCreditsPanel";
import RsActivityFeed from "@/components/admin/richer-sounds/RsActivityFeed";
import RsBranchDrawer from "@/components/admin/richer-sounds/RsBranchDrawer";
import RsTransferDialog from "@/components/admin/richer-sounds/RsTransferDialog";
import { base44 } from "@/api/base44Client";

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

export default function AdminRicherSounds() {
  const { data, loading, error, reload, transfer, resend } = useRicherSoundsAdminData();
  const [tab, setTab] = useState("accounts");
  const [drawerRow, setDrawerRow] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [transferTarget, setTransferTarget] = useState(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [toast, setToast] = useState(null);

  const accounts = data?.accounts || [];
  const masterAccount = data?.masterAccount || null;
  const transfers = data?.transfers || [];
  const activity = data?.activity || [];
  const isMasterAdmin = data?.actor?.is_master_admin === true;

  const flash = (message) => {
    setToast(message);
    setTimeout(() => setToast(null), 4000);
  };

  const handleOpen = (row) => { setDrawerRow(row); setDrawerOpen(true); };
  const handleTransfer = (row) => { setTransferTarget(row || null); setTransferOpen(true); };
  const handleResend = async (row) => {
    const pending = (row.members || []).find((m) => m.status === "pending");
    if (!pending) { flash("No pending invitation to resend for this branch."); return; }
    try {
      await resend({ accountId: row.account.id, membershipId: pending.id });
      flash(`Invitation resent to ${pending.email}.`);
    } catch (e) {
      flash(e?.message || "Resend failed.");
    }
  };
  const handleTransferSubmit = async ({ destinationAccountId, amount, note }) => {
    const result = await transfer({ destinationAccountId, amount, note });
    if (result?.state === "partial") {
      flash("Transfer recorded as partial — source debited, destination pending. A master admin can reconcile.");
    } else {
      flash(`${amount} credits transferred.`);
    }
  };
  const handleReverse = async (t) => {
    if (!isMasterAdmin) { flash("Only a master admin can reverse a transfer."); return; }
    if (!window.confirm(`Return ${t.amount} credits from ${t.destination_account_name} to ${t.source_account_name}?`)) return;
    try {
      const res = await base44.functions.invoke("transferRicherSoundsCredits", {
        action: "reverse",
        transfer_id: t.transfer_id,
      });
      const result = res?.data;
      if (result?.state === "completed" || result?.state === "partial") {
        flash(result.state === "partial" ? "Reversal recorded as partial." : `${t.amount} credits returned to 93.`);
        await reload();
      } else {
        flash(result?.message || "Reversal failed.");
      }
    } catch (e) {
      flash(e?.message || "Reversal failed.");
    }
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
        <button type="button" onClick={reload} className="inline-flex items-center gap-1.5 rounded-lg border border-[#DCDBD6] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#1B1A1A] hover:bg-slate-50">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {data?.unresolvedMappingCount > 0 && (
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

      {tab === "accounts" && <RsAccountsTable accounts={accounts} onOpen={handleOpen} onTransfer={handleTransfer} onResend={handleResend} />}
      {tab === "projects" && <RsProjectsTable accounts={accounts} />}
      {tab === "credits" && <RsCreditsPanel masterAccount={masterAccount} transfers={transfers} onTransfer={handleTransfer} onReverse={handleReverse} canReverse={isMasterAdmin} />}
      {tab === "activity" && <RsActivityFeed activity={activity} />}

      <RsBranchDrawer row={drawerRow} open={drawerOpen} onOpenChange={setDrawerOpen} onTransfer={handleTransfer} onResend={handleResend} />
      <RsTransferDialog open={transferOpen} masterAccount={masterAccount} destination={transferTarget} accounts={accounts} onClose={() => setTransferOpen(false)} onSubmit={handleTransferSubmit} />

      {toast && (
        <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-[#DCDBD6] bg-[#213428] px-4 py-2 text-[12px] font-semibold text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}