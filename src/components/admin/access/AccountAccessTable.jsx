import React from "react";
import { ChevronRight } from "lucide-react";
import AccessPill from "@/components/admin/access/AccessPill";
import {
  accountTypeLabel,
  formatGBP,
} from "@/lib/commercial/accountAccessOverview";

// Simplified Premium Partners table: Dealer | Access | 2026 Turnover |
// Available Credits | Projects | View.
//
// The Access column combines the existing Account.status and the derived
// Sound Proof access state into a single, clear label without changing any
// underlying definitions or enforcement:
//   Suspended     — Account.status === "suspended"
//   Not Activated — Account.status === "inactive", or no occupied seats,
//                   or only pending invitations
//   Active        — Account.status === "active" with active users
//
// The separate Credits action has been removed from each row; credit
// management remains available inside the View drawer.

const GRID = "2fr 1.1fr 1fr 0.9fr 0.7fr 100px";
const MIN_WIDTH = 880;

const HEADERS = [
  { label: "Dealer", title: "Dealer account and primary admin email" },
  { label: "Access", title: "Account access state (Active, Not Activated, Suspended)" },
  { label: "2026 turnover", title: "Eligible turnover from the Partner Portal ledger" },
  { label: "Available", title: "Canonical credit balance — SUM of the capacity ledger" },
  { label: "Projects", title: "Projects stamped to this account" },
  { label: "View", title: "" },
];

function combinedAccess(row) {
  if (row.account.status === "suspended") return { label: "Suspended", tone: "danger" };
  if (row.account.status === "inactive") return { label: "Not Activated", tone: "muted" };
  if (row.access.label === "No users") return { label: "Not Activated", tone: "muted" };
  if (row.access.label.startsWith("Pending")) return { label: "Not Activated", tone: "warn" };
  return { label: "Active", tone: "ok" };
}

/**
 * One grouped account list — simplified to six columns. Rows are already
 * assembled and filtered by the page.
 * Props: rows, onOpen(row), onAddCredits(row) [unused — kept for caller compat],
 *        emptyMessage
 */
export default function AccountAccessTable({ rows, onOpen, onAddCredits, emptyMessage }) {
  const list = Array.isArray(rows) ? rows : [];

  if (list.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[#DCDBD6] bg-white px-5 py-6 text-center text-[13px] text-[#3E4349]">
        {emptyMessage || "No accounts in this group."}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-[#DCDBD6] bg-white">
      <div className="min-w-[880px]">
        <div
          style={{ gridTemplateColumns: GRID }}
          className="grid items-center gap-2 border-b border-[#E7E5E1] bg-[#F4F3F1] px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-[#625143]"
        >
          {HEADERS.map((header) => (
            <div key={header.label} title={header.title} className={header.label === "View" ? "text-right" : ""}>
              {header.label}
            </div>
          ))}
        </div>

        {list.map((row, index) => {
          const access = combinedAccess(row);
          return (
            <div
              key={row.account.id}
              style={{ gridTemplateColumns: GRID }}
              className={`grid items-center gap-2 px-4 py-3 text-[12px] transition-colors hover:bg-[#FAFAF9] ${
                index < list.length - 1 ? "border-b border-[#EDEBE7]" : ""
              }`}
            >
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold text-[#1B1A1A]">
                  {row.account.name || "Unnamed account"}
                </div>
                <div className="truncate text-[11px] text-[#625143]">
                  {accountTypeLabel(row.account)}
                  {row.primaryEmail ? ` · ${row.primaryEmail}` : ""}
                </div>
              </div>

              <div>
                <AccessPill label={access.label} tone={access.tone} />
              </div>

              <div className="tabular-nums text-[#3E4349]">{formatGBP(row.turnover)}</div>

              <div className="text-right tabular-nums font-bold text-[#1B1A1A]">
                {row.credits.available ?? 0}
              </div>

              <div className="tabular-nums text-[#3E4349]">{row.projectCount}</div>

              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => onOpen(row)}
                  className="inline-flex items-center gap-1 rounded-lg border border-[#DCDBD6] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#1B1A1A] hover:bg-slate-50"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                  View
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}