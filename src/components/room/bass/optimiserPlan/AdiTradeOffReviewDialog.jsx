// AdiTradeOffReviewDialog.jsx
// ---------------------------------------------------------------------------
// REVIEW TRADE-OFF — the decision first, the evidence below it.
//
// The designer sees the DECISION before any Apply is offered, in this order:
//   • TRADE-OFF — the decision in one sentence, naming the seat it costs
//   • YOU GAIN / YOU GIVE UP — two blocks: the measure that improves and the
//     exact seat that gets worse, with the exact amount it loses
//   • the protected metric that is NOT the trade-off (P19), stated lightly
//   • ENGINEERING DETAIL — the CURRENT vs PROPOSED rows, as supporting evidence
// and only then is the deliberate Apply available.
//
// Presentation only: every row and every figure arrives already resolved by
// optimiserTradeOffState.js. Nothing here calculates, grades or applies
// anything by itself — the Apply it draws calls the existing lever apply path.
// ---------------------------------------------------------------------------

import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import AdiTradeOffDecisionSummary from "./AdiTradeOffDecisionSummary.jsx";
import AdiAppliedStateLine from "./AdiAppliedStateLine.jsx";
import {
  TRADE_OFF_ACTIONS,
  TRADE_OFF_DIRECTION,
  TRADE_OFF_TITLE,
  tradeOffApplySentence,
} from "./optimiserTradeOffState.js";

const DIRECTION_STYLE = {
  [TRADE_OFF_DIRECTION.IMPROVES]: { color: "#213428", label: "Improves" },
  [TRADE_OFF_DIRECTION.UNCHANGED]: { color: "#625143", label: "Unchanged" },
  [TRADE_OFF_DIRECTION.WORSENS]: { color: "#B45309", label: "Worsens" },
};

const BUTTON_PRIMARY = "inline-flex items-center rounded-md bg-[#213428] px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#3E4349]";
const BUTTON_SECONDARY = "inline-flex items-center rounded-md border border-[#D9D5CE] bg-white px-5 py-2.5 text-[13px] font-semibold text-[#213428] transition-colors hover:border-[#213428]";

/** The rows of one group, stated current → proposed with their direction. */
function GroupRows({ group, rows }) {
  const groupRows = rows.filter((row) => row.group === group);
  if (!groupRows.length) return null;
  return (
    <div className="space-y-1">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">{group}</div>
      {groupRows.map((row) => {
        const style = DIRECTION_STYLE[row.direction] || DIRECTION_STYLE[TRADE_OFF_DIRECTION.UNCHANGED];
        const pairKnown = row.pairKnown !== false;
        return (
          <div key={row.key} className="flex flex-wrap items-baseline gap-x-2 text-[12px]" data-adi-trade-off-row={row.key}>
            <span className="min-w-[180px] flex-1 text-[#3E4349]">{row.label}</span>
            {/* A row whose pair this run never retained states no values at all:
                its direction and the exact amount it loses are the whole row. */}
            {pairKnown ? (
              <>
                <span className="text-[#3E4349]">{row.before}</span>
                <span className="text-[#8A7B6A]">→</span>
                <span className="font-semibold text-[#1B1A1A]">{row.after}</span>
              </>
            ) : null}
            <span className="font-semibold" style={{ color: style.color }}>
              {style.label}
              {row.delta ? ` · ${row.delta}` : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function AdiTradeOffReviewDialog({
  open = false,
  tradeOff = null,
  // THE ONE RESULT. The seat the change costs, the exact amount it loses and
  // whether the change is held or applied are read from the view model when it
  // is present, so this review can never name a different seat, a different
  // amount or a different applied state from the card that opened it.
  resultModel = null,
  onOpenChange = null,
  onApply = null,
  onKeep = null,
  applyBusy = false,
  className = "",
}) {
  if (!tradeOff) return null;
  const rows = Array.isArray(tradeOff.rows) ? tradeOff.rows : [];
  const seatLabel = resultModel?.affectedSeat?.label || tradeOff.seat?.label || null;
  // The exact amount the affected seat loses — the same figure the give-up block
  // states, used to make the Apply sentence explicit.
  const amountText = resultModel?.affectedSeatRegression?.amountText
    || tradeOff.amountText
    || null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`max-w-2xl ${className}`} data-adi-trade-off-review="true">
        <DialogHeader>
          <DialogTitle className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#8A5A2B]" data-adi-trade-off-title="true">
            {TRADE_OFF_TITLE}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* THE DECISION FIRST: one sentence, then what the change buys and what
              it costs. Everything below it is supporting evidence. */}
          <AdiTradeOffDecisionSummary
            sentence={tradeOff.decisionSentence}
            gain={tradeOff.gain}
            giveUp={tradeOff.giveUp}
            protectedMetric={tradeOff.protectedMetric}
          />

          {/* HELD / APPLIED — the persisted terminal decision, in the same words
              every other surface states it. This review never applies anything
              of its own: the deliberate Apply below calls the existing lever
              apply path. */}
          <AdiAppliedStateLine resultModel={resultModel} />

          {tradeOff.adjustment && (
            <div className="text-[13px] font-semibold text-[#1B1A1A]" data-adi-trade-off-adjustment="true">
              {tradeOff.adjustment}
            </div>
          )}

          <div className="space-y-2 rounded-md border border-[#E7E5E0] bg-[#FBFBF9] px-3 py-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]" data-adi-trade-off-detail-title="true">
              Engineering detail
            </div>
            <div className="flex flex-wrap items-baseline gap-x-2 text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">
              <span className="min-w-[180px] flex-1">Measure</span>
              <span>Current</span>
              <span className="w-4" />
              <span>Proposed</span>
            </div>
            <GroupRows group="Overall" rows={rows} />
            <GroupRows group="Primary seats" rows={rows} />
            <GroupRows group="Secondary seats" rows={rows} />
          </div>

          {tradeOff.scopeNote && (
            <p className="text-[11px] text-[#625143] leading-relaxed">{tradeOff.scopeNote}</p>
          )}

          {/* The regression is stated beside the Apply itself, so the designer's
              own approval is always given with it in view. */}
          <p className="text-[12px] font-semibold text-[#8A5A2B] leading-relaxed" data-adi-trade-off-apply-note="true">
            {tradeOffApplySentence(seatLabel, amountText)}
          </p>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {onApply && (
              <button
                type="button"
                onClick={onApply}
                disabled={applyBusy}
                data-adi-trade-off-apply="true"
                className={`${BUTTON_PRIMARY} ${applyBusy ? "cursor-not-allowed opacity-70" : ""}`}
              >
                {TRADE_OFF_ACTIONS.APPLY}
              </button>
            )}
            {/* The designer's own no. Chosen inside the review it means exactly
                what it means on the card: the candidate is dismissed for this
                run, and nothing is applied or written. */}
            {onKeep ? (
              <button
                type="button"
                onClick={() => {
                  onKeep();
                  onOpenChange?.(false);
                }}
                data-adi-trade-off-dialog-keep="true"
                className={BUTTON_SECONDARY}
              >
                {TRADE_OFF_ACTIONS.KEEP}
              </button>
            ) : (
              <button type="button" onClick={() => onOpenChange?.(false)} className={BUTTON_SECONDARY}>
                Close
              </button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}