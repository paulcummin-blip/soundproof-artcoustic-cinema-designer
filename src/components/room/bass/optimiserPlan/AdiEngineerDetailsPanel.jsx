// AdiEngineerDetailsPanel.jsx
// ---------------------------------------------------------------------------
// LEVEL 2 — TECHNICAL DETAILS: the concise professional summary behind the
// panel's result, for a cinema designer or calibrator.
//
// It states three things, and nothing more:
//
//   1. WHAT ADI CHECKED     one line per family — tested, and its own outcome
//   2. LOW-FREQUENCY RESULT P19, the P20 pair and the limiting region
//   3. SUBWOOFER GROUPS     the optimisation groups the searches acted on
//
// …plus, only when they genuinely exist: an actionable design option, the
// concise low-frequency treatment advice, and one short reason when nothing was
// found.
//
// Everything raw — fingerprints, candidate ids, per-candidate counts, the full
// tested table, absolute delay arrays, cache and job internals, search-space
// totals, persistence diagnostics — belongs to LEVEL 3 (developer diagnostics),
// rendered inside the second disclosure and ONLY when the internal debug gate is
// on (useOptimiserDeveloperDiagnostics). A dealer therefore never reads a log,
// and nothing is deleted: the evidence is still saved and still readable under
// the gate.
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
 * An outcome that is GUIDANCE rather than a result ("Re-run the Bass Optimiser
 * to evaluate this lever"). The checked list states what the evaluation found;
 * the action belongs to the panel's own control, not beside a family name.
 */
const GUIDANCE_OUTCOME = /^(re-run|run the bass optimiser|previous result found|tried only|compare subwoofer models)/i;

/** One short outcome phrase, or null when the row carries none to state. */
function checkedOutcome(row) {
  const text = typeof row?.outcome === "string" ? row.outcome.trim() : "";
  if (!text || GUIDANCE_OUTCOME.test(text)) return null;
  const first = text.split(/(?<=\.)\s/)[0].trim();
  return first.length <= 64 ? first : `${first.slice(0, 63).trimEnd()}…`;
}

/**
 * One line per evaluated family: tested / not tested, and — for the advice row,
 * which is a consideration rather than a search — considered / not considered.
 * A family the evaluation reached also states its own outcome.
 */
export function adiTestedSummaryLines(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      if (!row?.key) return null;
      const evaluated = EVALUATED_STATUS.has(row.status);
      const state = row.advice
        ? (evaluated ? "considered" : "not considered")
        : (evaluated ? "tested" : "not tested");
      return { key: row.key, label: row.label || row.key, state, outcome: checkedOutcome(row) };
    })
    .filter(Boolean);
}

/** "±15 dB → ±12 dB" — the low-frequency pair, or whichever side exists. */
function p20PairText(beforeText, afterText) {
  if (beforeText && afterText) return `${beforeText} → ${afterText}`;
  return afterText || beforeText || null;
}

export default function AdiEngineerDetailsPanel({
  // The evaluated families, already resolved by the summary authority.
  rows = [],
  // LEVEL 2's low-frequency result, already resolved: { p19, p20Before, p20After,
  // limiting } — every value whole-number formatted by the display authority.
  lowFrequency = null,
  // The optimisation groups the searches acted on (subwoofer grouping block).
  groups = null,
  // The concise low-frequency treatment advice, when the evidence warrants it.
  treatment = null,
  // An ACTIONABLE design option only — never an empty "no change was applied" box.
  design = null,
  // One short reason when nothing useful was found, or the run did not finish.
  whyNoImprovement = null,
  whyTitle = "Why no improvement",
  // LEVEL 3 — the internal debug gate (useOptimiserDeveloperDiagnostics).
  showDiagnostics = false,
  className = "",
  children = null,
}) {
  const checked = adiTestedSummaryLines(rows);
  const p19 = lowFrequency?.p19 || null;
  const p20Pair = p20PairText(lowFrequency?.p20Before, lowFrequency?.p20After);
  // The limiting region, already resolved by the ONE limiting-frequency
  // authority: a real frequency, or the Not-identified statement. "0 Hz" is
  // impossible here — the value was never a frequency to begin with.
  const limiting = lowFrequency?.limiting || null;
  const limitingIdentified = lowFrequency?.limitingIdentified === true;
  const hasLowFrequency = Boolean(p19 || p20Pair || limiting);

  return (
    <div className={`space-y-3 ${className}`} data-adi-engineer-summary="true">
      {/* 1. WHAT ADI CHECKED — what was evaluated, in the designer's words. */}
      {checked.length > 0 && (
        <div className="space-y-0.5" data-adi-test-summary="true">
          <div className={GROUP_TITLE_CLASS}>What ADI checked</div>
          {checked.map((line) => (
            <div key={line.key} className={LINE_CLASS}>
              {line.label}: {line.state}
              {line.outcome ? ` · ${line.outcome}` : ""}
            </div>
          ))}
        </div>
      )}

      {/* 2. THE ACTIONABLE DESIGN OPTION — only when there is one to consider. */}
      {design}

      {/* 3. LOW-FREQUENCY RESULT — the three facts the decision rests on. */}
      {hasLowFrequency && (
        <div className="space-y-0.5" data-adi-low-frequency-result="true">
          <div className={GROUP_TITLE_CLASS}>Low-frequency result</div>
          {p19 && <div className={LINE_CLASS}>P19: {p19}</div>}
          {p20Pair && <div className={LINE_CLASS}>P20: {p20Pair}</div>}
          {limiting && (
            <div className={LINE_CLASS}>
              Limiting region: {limitingIdentified ? `Approximately ${limiting}` : limiting}
            </div>
          )}
        </div>
      )}

      {/* 4. LOW-FREQUENCY TREATMENT — concise advice, never a claim about an
          exact treatment location the evidence does not support. */}
      {treatment?.reason && (
        <div className="space-y-0.5" data-adi-treatment-advice="true">
          <div className={GROUP_TITLE_CLASS}>Low-frequency treatment</div>
          <div className={LINE_CLASS}>{treatment.reason}</div>
          {treatment.location && <div className={LINE_CLASS}>{treatment.location}</div>}
        </div>
      )}

      {/* 5. SUBWOOFER GROUPS — the layout the grouped searches acted on. */}
      {groups}

      {/* 6. WHY NO IMPROVEMENT — one short reason, never a paragraph. */}
      {whyNoImprovement && (
        <div className="space-y-0.5" data-adi-why-no-improvement="true">
          <div className={GROUP_TITLE_CLASS}>{whyTitle}</div>
          <div className={LINE_CLASS}>{whyNoImprovement}</div>
        </div>
      )}

      {/* LEVEL 3 — DEVELOPER DIAGNOSTICS. Rendered only under the internal debug
          gate: fingerprints, ids, per-candidate detail, cache and job internals,
          run workload and the run's own rejection reasons. */}
      {showDiagnostics && children && (
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