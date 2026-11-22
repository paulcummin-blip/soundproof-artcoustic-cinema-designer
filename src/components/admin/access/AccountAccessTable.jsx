import React from "react";
import { ChevronRight } from "lucide-react";
import AccessPill from "@/components/admin/access/AccessPill";
import PromotionPill from "@/components/admin/access/PromotionPill";
import {
  accountTypeLabel,
  formatGBP,
  formatDate,
} from "@/lib/commercial/accountAccessOverview";

// Dealer table columns:
// Dealer | Access | 2026 Turnover | Earned | Purchased | Available | Used |
// Projects | Last Activity | Promotion | View
//
// Credit columns are all derived from the existing CapacityLedger breakdown —
// no second balance system. Numeric columns are right-aligned with tabular-nums.
// Promotion status and expiry are combined into one compact column.

// Last Activity uses a fixed column width so dates such as "14 Nov 2026" and
// the em-dash placeholder always render at the same width and right edge. The
// Promotion column keeps its badge and expiry date together in one cell,
// separated from Last Activity by a vertical divider (added per-cell below).
const GRID = "2fr 1fr 0.95fr 0.5fr 0.55fr 0.55fr 0.45fr 0.5fr 122px 1.2fr 64px";
const MIN_WIDTH = 1320;

const HEADERS = [
  { label: "Dealer", title: "Dealer account and primary admin email", align: "left" },
  { label: "Access", title: "Sound Proof eligibility (Approved / Not Approved) and activation state (Not Activated, Invitation Pending, Active, Suspended, Expired)", align: "left" },
  { label: "2026 Turnover", title: "Eligible turnover from the Partner Portal — newest source snapshot", align: "right" },
  { label: "Earned", title: "Credits awarded through UK turnover rewards", align: "right" },
  { label: "Purchased", title: "Credits purchased by the dealer", align: "right" },
  { label: "Available", title: "Canonical credit balance — SUM of the capacity ledger", align: "right" },
  { label: "Used", title: "Actual ledger deductions (PROJECT_ACTIVATION entries)", align: "right" },
  { label: "Projects", title: "Current projects stamped to this account, including promotional projects", align: "right" },
  { label: "Last Activity", title: "Latest project, login or access event — not a sync timestamp", align: "right" },
  { label: "Promotion", title: "Promotion status and expiry date", align: "left" },
  { label: "", title: "", align: "right" },
];

/**
 * One grouped account list. Rows are already assembled and filtered by the page.
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
      <div className="min-w-[1320px]">
        <div
          style={{ gridTemplateColumns: GRID }}
          className="grid items-center gap-2 border-b border-[#E7E5E1] bg-[#F4F3F1] px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-[#625143]"
        >
          {HEADERS.map((header, index) => (
            <div
              key={index}
              title={header.title}
              className={[
                header.align === "right" ? "text-right" : "",
                // Clear vertical separation before the Promotion column.
                index === 9 ? "border-l border-[#E7E5E1] pl-3" : "",
                // Keep the Last Activity header on one line, right-aligned.
                index === 8 ? "whitespace-nowrap" : "",
              ].join(" ").trim()}
            >
              {header.label}
            </div>
          ))}
        </div>

        {list.map((row, index) => {
          const eligibility = row.eligibilityState || { label: "—", tone: "muted" };
          const activation = row.activationState || { label: "—", tone: "muted" };
          const promoLabel = row.promotion?.status || "None";
          const promoExpiry = row.promotion?.expiryDisplay;
          return (
            <div
              key={row.account.id}
              style={{ gridTemplateColumns: GRID }}
              className={`grid items-center gap-2 px-4 py-3 text-[12px] transition-colors hover:bg-[#FAFAF9] ${
                index < list.length - 1 ? "border-b border-[#EDEBE7]" : ""
              }`}
            >
              {/* Dealer */}
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold text-[#1B1A1A]">
                  {row.account.name || "Unnamed account"}
                </div>
                <div className="truncate text-[11px] text-[#625143]">
                  {accountTypeLabel(row.account)}
                  {row.primaryEmail ? ` · ${row.primaryEmail}` : ""}
                </div>
              </div>

              {/* Access — eligibility over activation, stacked compactly. */}
              <div className="flex flex-col items-start gap-1">
                <AccessPill
                  label={eligibility.label}
                  tone={eligibility.tone}
                  title="Sound Proof eligibility — approved by admin"
                />
                <AccessPill
                  label={activation.label}
                  tone={activation.tone}
                  title="Activation state — account status and membership"
                />
              </div>

              {/* 2026 Turnover */}
              <div className="text-right tabular-nums text-[#3E4349]">
                {formatGBP(row.turnover)}
              </div>

              {/* Earned — turnover reward credits */}
              <div className="text-right tabular-nums text-[#3E4349]">
                {row.credits.rewarded ?? 0}
              </div>

              {/* Purchased — dealer-purchased credits */}
              <div className="text-right tabular-nums text-[#3E4349]">
                {row.credits.purchased ?? 0}
              </div>

              {/* Available credits — canonical ledger balance */}
              <div className="text-right tabular-nums font-bold text-[#1B1A1A]">
                {row.credits.available ?? 0}
              </div>

              {/* Used — actual ledger deductions, not project count */}
              <div className="text-right tabular-nums text-[#3E4349]">
                {row.credits.used ?? 0}
              </div>

              {/* Projects — current projects only */}
              <div className="text-right tabular-nums text-[#3E4349]">
                {row.projectCount}
              </div>

              {/* Last Activity — fixed-width, right-aligned; em-dash aligns with dates. */}
              <div className="whitespace-nowrap text-right tabular-nums text-[#625143]">
                {row.lastActivity ? formatDate(new Date(row.lastActivity).toISOString()) : "—"}
              </div>

              {/* Promotion — status + expiry kept together, separated by a divider. */}
              <div className="flex min-w-0 flex-nowrap items-center gap-1.5 border-l border-[#E7E5E1] pl-3">
                <PromotionPill
                  label={promoLabel}
                  tone={row.promotion?.tone || "muted"}
                  title={row.promotion?.effective?.headline || row.promotion?.effective?.name || undefined}
                />
                {promoExpiry && promoLabel !== "None" && (
                  <span className="whitespace-nowrap text-[11px] text-[#625143]">
                    {promoExpiry}
                  </span>
                )}
              </div>

              {/* View */}
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