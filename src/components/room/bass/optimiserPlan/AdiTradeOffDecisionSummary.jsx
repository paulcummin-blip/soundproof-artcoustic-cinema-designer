// AdiTradeOffDecisionSummary.jsx
// ---------------------------------------------------------------------------
// THE TRADE-OFF DECISION, IN PLAIN LANGUAGE — the first thing the review shows.
//
//   TRADE-OFF
//   Overall bass consistency improves, but Row 1 - Seat 2 gets worse.
//
//   YOU GAIN                        YOU GIVE UP
//   Overall bass consistency        Row 1 - Seat 2
//   ±15 dB → ±12 dB                 Worsens by 1.2 dB
//   Approximately 2 dB better
//
//   P19 response quality — Unchanged · L4
//
// P20 — the seat-to-seat level consistency measure — is the metric both blocks
// are stated on. P19 is response quality: it is not part of this trade, so it is
// stated separately and lightly and never reads as a second competing benefit or
// cost.
//
// Presentation only: every value arrives already resolved by
// optimiserTradeOffState.js. Nothing here calculates, grades or invents a
// figure — a value the run never retained is simply absent from the block.
// ---------------------------------------------------------------------------

import React from "react";

const BLOCK_GAIN = "rounded-md border border-[#DCE7DE] bg-[#F7FAF7] px-3 py-2.5";
const BLOCK_COST = "rounded-md border border-[#F0DCC2] bg-[#FEFAF4] px-3 py-2.5";
const TITLE_GAIN = "text-[10px] font-semibold uppercase tracking-wide text-[#213428]";
const TITLE_COST = "text-[10px] font-semibold uppercase tracking-wide text-[#8A5A2B]";

/** One block of the decision: its heading, and the fact it states. */
function DecisionBlock({ title, tone, testId, children }) {
  const gain = tone === "gain";
  return (
    <div
      className={gain ? BLOCK_GAIN : BLOCK_COST}
      data-adi-trade-off-block={testId}
    >
      <div className={gain ? TITLE_GAIN : TITLE_COST}>{title}</div>
      <div className="mt-1 space-y-0.5">{children}</div>
    </div>
  );
}

export default function AdiTradeOffDecisionSummary({
  // The whole decision in one sentence, naming the seat it costs.
  sentence = null,
  // What the change buys: the metric, its own current → proposed pair and the
  // improvement in whole dB. Null when nothing improved.
  gain = null,
  // What it costs: the exact seat, and the exact amount it loses.
  giveUp = null,
  // The metric that is NOT the trade-off (P19 response quality).
  protectedMetric = null,
  className = "",
}) {
  return (
    <div className={`space-y-2 ${className}`} data-adi-trade-off-decision-summary="true">
      {sentence && (
        <p className="text-[14.5px] font-semibold leading-snug text-[#1B1A1A]" data-adi-trade-off-sentence="true">
          {sentence}
        </p>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {gain && (
          <DecisionBlock title="You gain" tone="gain" testId="gain">
            <div className="text-[12.5px] font-semibold text-[#1B1A1A]" data-adi-trade-off-gain-title="true">
              {gain.title}
            </div>
            {gain.pair && (
              <div className="text-[12.5px] text-[#3E4349]" data-adi-trade-off-gain-pair="true">
                {gain.pair}
              </div>
            )}
            {gain.delta && (
              <div className="text-[12px] font-semibold text-[#213428]" data-adi-trade-off-gain-delta="true">
                {gain.delta}
              </div>
            )}
          </DecisionBlock>
        )}

        {giveUp && (
          <DecisionBlock title="You give up" tone="cost" testId="give-up">
            <div className="text-[12.5px] font-semibold text-[#1B1A1A]" data-adi-trade-off-give-up-seat="true">
              {giveUp.label}
            </div>
            <div className="text-[12px] font-semibold text-[#8A5A2B]" data-adi-trade-off-give-up-amount="true">
              {giveUp.amount}
            </div>
          </DecisionBlock>
        )}
      </div>

      {/* NOT PART OF THE TRADE: the protected metric, stated once and lightly. */}
      {protectedMetric?.text && (
        <div className="text-[11.5px] text-[#625143]" data-adi-trade-off-protected-metric="true">
          {protectedMetric.text}
        </div>
      )}
    </div>
  );
}