// AdiEngineerDetailsPanel.jsx
// ---------------------------------------------------------------------------
// ENGINEER DETAILS — the concise, grouped summary behind the panel's outcome.
//
// Collapsed by default by its parent, and four short groups only:
//
//   1. Test summary             what ADI evaluated, and what it did not
//   2. Best calibration result  the result ADI's own decision named, with its
//                               P19/P20 before → after and how it stands
//   3. Best design change       the physical change only the designer may approve
//   4. Why no improvement       one short reason, when nothing was found
//
// Everything else the card can prove — per-candidate counts, raw fingerprints,
// ids, the full tested table, the per-lever detail and the run's own diagnostics
// — arrives as children and is rendered inside the second, developer-only
// disclosure. A designer therefore reads four short groups, and never a log.
//
// Presentation only: every value arrives already resolved by the authorities. No
// figure is calculated here, no claim is re-worded and nothing is re-evaluated.
// ---------------------------------------------------------------------------

import React from "react";
import { ADI_ROW_STATUS } from "./optimiserFamilyLedgerRows.js";

const GROUP_TITLE_CLASS = "text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]";
const LINE_CLASS = "text-[11px] text-[#3E4349] leading-relaxed";

/** The statuses that mean the family WAS evaluated on this design. */
const EVALUATED_STATUS = new Set([
  ADI_ROW_STATUS.TESTED,
  ADI_ROW_STATUS.RECOMMENDED,
  ADI_ROW_STATUS.TRADE_OFF,
  ADI_ROW_STATUS.REJECTED,
  ADI_ROW_STATUS.COMBINED_ONLY,
  ADI_ROW_STATUS.LAST_RESORT,
  ADI_ROW_STATUS.APPLIED,
]);

/**
 * One line per evaluated family: tested / not tested, and — for the advice row,
 * which is a consideration rather than a search — considered / not considered.
 */
export function adiTestedSummaryLines(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      if (!row?.key) return null;
      const evaluated = EVALUATED_STATUS.has(row.status);
      const state = row.advice
        ? (evaluated ? "considered" : "not considered")
        : (evaluated ? "tested" : "not tested");
      return { key: row.key, label: row.label || row.key, state };
    })
    .filter(Boolean);
}

export default function AdiEngineerDetailsPanel({
  // The evaluated families, already resolved by the summary authority.
  rows = [],
  // The best calibration result the run's own decision named.
  bestCalibrationResult = null,
  // The physical change ADI recommends and may never apply.
  seatingRecommendation = null,
  // One short reason when nothing useful was found, or the run did not finish.
  whyNoImprovement = null,
  whyTitle = "Why no improvement",
  className = "",
  children = null,
}) {
  const tested = adiTestedSummaryLines(rows);
  const calibration = bestCalibrationResult || null;
  const calibrationHeldReason = calibration?.heldLevers?.[0]?.statement || null;
  const design = seatingRecommendation || null;

  return (
    <div className={`space-y-3 ${className}`} data-adi-engineer-summary="true">
      {/* 1. TEST SUMMARY — what was evaluated, in the designer's words. */}
      {tested.length > 0 && (
        <div className="space-y-0.5" data-adi-test-summary="true">
          <div className={GROUP_TITLE_CLASS}>Test summary</div>
          {tested.map((line) => (
            <div key={line.key} className={LINE_CLASS}>
              {line.label}: {line.state}
            </div>
          ))}
        </div>
      )}

      {/* 2. BEST CALIBRATION RESULT — what it was, its before → after, and how
          it stands. The settings it touches and its candidate detail stay in the
          diagnostics below. */}
      {calibration && (
        <div className="space-y-0.5" data-adi-best-calibration="true">
          <div className={GROUP_TITLE_CLASS}>Best calibration result</div>
          {calibration.headline && <div className={LINE_CLASS}>{calibration.headline}</div>}
          {calibration.valuesStatement && (
            <div className={LINE_CLASS}>{calibration.valuesStatement}</div>
          )}
          <div className={LINE_CLASS}>
            {calibration.stateLabel}
            {calibration.applied ? " — applied to this design." : " — not applied."}
          </div>
          {!calibration.applied && calibrationHeldReason && (
            <div className={LINE_CLASS}>{calibrationHeldReason}</div>
          )}
        </div>
      )}

      {/* 3. BEST DESIGN CHANGE — the move itself, its result, and the one thing
          the designer has to do about it. */}
      {design && (
        <div className="space-y-0.5" data-adi-best-design="true">
          <div className={GROUP_TITLE_CLASS}>Best design recommendation</div>
          {design.movementLabel && <div className={LINE_CLASS}>{design.movementLabel}</div>}
          <div className={LINE_CLASS}>
            Requires your approval — ADI never applies a physical design change.
          </div>
          {(design.p20Before || design.p20After) && (
            <div className={LINE_CLASS}>
              P20: {design.p20Before || "—"} → {design.p20After || "—"}
              {design.p20LevelAfter ? ` · ${design.p20LevelAfter}` : ""}
            </div>
          )}
          {design.p19Delta && <div className={LINE_CLASS}>P19: {design.p19Delta}</div>}
        </div>
      )}

      {/* 4. WHY NO IMPROVEMENT — one short reason, never a paragraph. */}
      {whyNoImprovement && (
        <div className="space-y-0.5" data-adi-why-no-improvement="true">
          <div className={GROUP_TITLE_CLASS}>{whyTitle}</div>
          <div className={LINE_CLASS}>{whyNoImprovement}</div>
        </div>
      )}

      {/* DEVELOPER DIAGNOSTICS — everything raw, behind its own second
          disclosure: fingerprints, ids, per-candidate counts, the full tested
          table, the absolute delays and the run's own rejection reasons. */}
      {children && (
        <details
          className="rounded-md border border-[#E7E5E0] bg-[#FAF9F6] px-3 py-2"
          data-adi-developer-diagnostics="true"
        >
          <summary className={`cursor-pointer ${GROUP_TITLE_CLASS}`}>Developer diagnostics</summary>
          <div className="mt-2 space-y-3">{children}</div>
        </details>
      )}
    </div>
  );
}