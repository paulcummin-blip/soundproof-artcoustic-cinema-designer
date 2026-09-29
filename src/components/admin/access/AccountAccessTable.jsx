import React from "react";
import { ChevronRight, Coins } from "lucide-react";
import AccessPill from "@/components/admin/access/AccessPill";
import {
  STATUS_TONES,
  accountTypeLabel,
  formatDateTime,
  formatGBP,
} from "@/lib/commercial/accountAccessOverview";

const GRID = "1.9fr 0.85fr 0.95fr 0.75fr 1fr 1.15fr 0.6fr 0.7fr 0.6fr 0.75fr 0.7fr 1.7fr 150px";
const MIN_WIDTH = 1520;

const HEADERS = [
  { label: "Dealer", title: "Dealer account and primary admin email" },
  { label: "Status", title: "Account status" },
  { label: "2026 turnover", title: "Eligible turnover from the Partner Portal ledger" },
  { label: "Logins", title: "Occupied seats (pending + active of five)" },
  { label: "Last login", title: "Last Sound Proof access recorded for this account" },
  { label: "Sound Proof", title: "Derived Sound Proof access state" },
  { label: "Rewarded", title: "Turnover-rewarded Professional Project credits" },
  { label: "Purchased", title: "Purchased Professional Project credits" },
  { label: "Used", title: "Credits consumed by activated projects" },
  { label: "Available", title: "Canonical credit balance — SUM of the capacity ledger" },
  { label: "Projects", title: "Projects stamped to this account" },
  { label: "Promo / admin", title: "Promotional projects used and admin-granted credits" },
  { label: "Actions", title: "" },
];

function CreditCell({ value, strong = false }) {
  return (
    <div className={`text-right tabular-nums ${strong ? "font-bold text-[#1B1A1A]" : "text-[#3E4349]"}`}>
      {value ?? 0}
    </div>
  );
}

/**
 * One grouped account list. Rows are already assembled and filtered by the page.
 * Props: rows, onOpen(row), onAddCredits(row), emptyMessage
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
      <div className="min-w-[1520px]">
        <div
          style={{ gridTemplateColumns: GRID }}
          className="grid items-center gap-2 border-b border-[#E7E5E1] bg-[#F4F3F1] px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-[#625143]"
        >
          {HEADERS.map((header) => (
            <div key={header.label} title={header.title} className={header.label === "Actions" ? "text-right" : ""}>
              {header.label}
            </div>
          ))}
        </div>

        {list.map((row, index) => (
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
              <AccessPill
                label={row.account.status ? row.account.status.charAt(0).toUpperCase() + row.account.status.slice(1) : "—"}
                tone={STATUS_TONES[row.account.status] || "muted"}
              />
            </div>

            <div className="tabular-nums text-[#3E4349]">{formatGBP(row.turnover)}</div>

            <div className="tabular-nums text-[#3E4349]">
              {row.seatsUsed} / {row.seatsMaximum}
            </div>

            <div className="whitespace-nowrap text-[11px] text-[#3E4349]">{formatDateTime(row.lastLogin)}</div>

            <div>
              <AccessPill label={row.access.label} tone={row.access.tone} />
            </div>

            <CreditCell value={row.credits.rewarded} strong />
            <CreditCell value={row.credits.purchased} />
            <CreditCell value={row.credits.used} />
            <CreditCell value={row.credits.available} strong />
            <CreditCell value={row.projectCount} />

            <div className="text-[11px] text-[#625143]">
              {row.promoProjects} promo · {row.credits.manual} granted
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => onAddCredits(row)}
                title="Add free Professional Project credits"
                className="inline-flex items-center gap-1 rounded-lg border border-[#DCDBD6] px-2.5 py-1.5 text-[11px] font-semibold text-[#213428] hover:bg-[#EEF4F0]"
              >
                <Coins className="h-3.5 w-3.5" />
                Credits
              </button>
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
        ))}
      </div>
    </div>
  );
}