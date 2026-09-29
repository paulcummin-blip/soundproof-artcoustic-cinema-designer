import React from "react";
import { Ban, Coins, ExternalLink, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import AccessPill from "@/components/admin/access/AccessPill";
import AccountDrawerCredits from "@/components/admin/access/AccountDrawerCredits";
import AccountDrawerEvents from "@/components/admin/access/AccountDrawerEvents";
import AccountDrawerMembers from "@/components/admin/access/AccountDrawerMembers";
import AccountDrawerProjects from "@/components/admin/access/AccountDrawerProjects";
import {
  STATUS_TONES,
  accountTypeLabel,
  formatDateTime,
  formatGBP,
} from "@/lib/commercial/accountAccessOverview";

function SummaryItem({ label, value, hint }) {
  return (
    <div className="rounded-lg border border-[#E7E5E1] bg-[#FAFAF9] px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-wider text-[#625143]">{label}</div>
      <div className="mt-0.5 text-[14px] font-bold text-[#1B1A1A]">{value}</div>
      {hint && <div className="text-[10px] text-[#625143]">{hint}</div>}
    </div>
  );
}

/**
 * Account detail drawer — dealer details, users, credits, projects and events.
 * Props: open, onOpenChange, row, onAddCredits(row), onRescind(row), onReinstate(row)
 */
export default function AccountDetailDrawer({
  open,
  onOpenChange,
  row,
  onAddCredits,
  onRescind,
  onReinstate,
}) {
  if (!row) return null;

  const account = row.account;
  const isSuspended = account.status === "suspended";
  const links = row.links || [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-3xl">
        <SheetHeader className="pb-4 text-left">
          <SheetTitle className="flex flex-wrap items-center gap-2 text-lg">
            {account.name || "Unnamed account"}
            <AccessPill
              label={account.status ? account.status.charAt(0).toUpperCase() + account.status.slice(1) : "—"}
              tone={STATUS_TONES[account.status] || "muted"}
            />
            <AccessPill label={row.access.label} tone={row.access.tone} />
          </SheetTitle>
          <SheetDescription className="text-[12px]">
            {accountTypeLabel(account)}
            {account.territory ? ` · ${account.territory}` : ""}
            {account.contact_email ? ` · ${account.contact_email}` : ""}
            {row.primaryEmail && row.primaryEmail !== account.contact_email
              ? ` · admin ${row.primaryEmail}`
              : ""}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 pb-6">
          {/* Missing relationships surfaced, never hidden */}
          {row.diagnostics.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {row.diagnostics.map((diagnostic) => (
                <AccessPill key={diagnostic.label} label={diagnostic.label} tone={diagnostic.tone} />
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <Button variant="brand" size="sm" onClick={() => onAddCredits?.(row)} className="gap-2">
              <Coins className="h-3.5 w-3.5" />
              Add free credits
            </Button>
            {isSuspended ? (
              <Button variant="outline" size="sm" onClick={() => onReinstate?.(row)} className="gap-2">
                <Undo2 className="h-3.5 w-3.5" />
                Reinstate access
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => onRescind?.(row)} className="gap-2 text-[#8F2F2F]">
                <Ban className="h-3.5 w-3.5" />
                Rescind access
              </Button>
            )}
            <a
              href={`/admin/accounts/${encodeURIComponent(account.id)}`}
              className="inline-flex h-8 items-center gap-2 rounded-md border border-[#DCDBD6] px-3 text-xs font-semibold text-[#1B1A1A] no-underline hover:bg-slate-50"
            >
              Full account page
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>

          {/* Summary */}
          <div className="grid gap-2 sm:grid-cols-3">
            <SummaryItem label="2026 turnover" value={formatGBP(row.turnover)} hint="Partner Portal ledger" />
            <SummaryItem
              label="Logins"
              value={`${row.seatsUsed} of ${row.seatsMaximum}`}
              hint="Occupied seats"
            />
            <SummaryItem label="Last login" value={formatDateTime(row.lastLogin)} hint="Account access stamp" />
            <SummaryItem label="Projects" value={row.projectCount} hint="Stamped to this dealer" />
            <SummaryItem label="Available credits" value={row.credits.available ?? 0} hint="Capacity ledger SUM" />
            <SummaryItem label="Promo projects" value={row.promoProjects} hint="Promotion usage" />
          </div>

          {/* Dealer identity */}
          <section className="rounded-xl border border-[#DCDBD6] bg-white p-4">
            <h3 className="m-0 mb-2 text-sm font-bold text-[#1B1A1A]">Dealer account</h3>
            <div className="grid gap-1.5 text-[12px] text-[#3E4349] sm:grid-cols-2">
              <div>Account ID: <span className="font-mono text-[11px]">{account.id}</span></div>
              <div>Dealer group: <span className="font-semibold">{account.dealer_group || "—"}</span></div>
              <div>Territory: <span className="font-semibold">{account.territory || "—"}</span></div>
              <div>Projects counted: <span className="font-semibold">{account.project_count ?? "—"}</span></div>
              <div>
                Portal link:{" "}
                <span className={links.length > 0 ? "font-semibold" : "font-semibold text-[#7A5B22]"}>
                  {links.length > 0
                    ? links.map((link) => `${link.external_account_name || "linked"} (${link.external_account_number || "—"})`).join(", ")
                    : "none"}
                </span>
              </div>
              <div>
                Portal user id:{" "}
                <span className="font-mono text-[11px]">
                  {links[0]?.partner_user_id || "—"}
                </span>
              </div>
            </div>
          </section>

          <AccountDrawerMembers row={row} />
          <AccountDrawerCredits row={row} />
          <AccountDrawerProjects row={row} />
          <AccountDrawerEvents row={row} />
        </div>
      </SheetContent>
    </Sheet>
  );
}