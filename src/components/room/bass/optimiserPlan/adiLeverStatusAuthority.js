// adiLeverStatusAuthority.js
// ---------------------------------------------------------------------------
// ONE authority for how a searched optimiser lever reports its gain status.
//
// The defect this closes: the same lever could be reported as an analysed gain
// sweep in one surface ("Gain analysed (not applicable)") and as a tested lever
// in another ("Gain: tested"), while the diagnostics said "0 candidates tested ·
// No useful improvement". Three surfaces, three claims, one run.
//
// The five exact states below are the only states. "NOT APPLICABLE" is reserved
// for a lever the design genuinely cannot search and ALWAYS carries its real
// reason; it is never used to mean "we tested it and nothing useful came of it",
// which is TESTED — NO IMPROVEMENT.
//
// Read-only: this module classifies evidence that already exists. It changes no
// threshold, runs no search and applies no change.
// ---------------------------------------------------------------------------

export const ADI_LEVER_STATUS = Object.freeze({
  NOT_TESTED: "NOT_TESTED",
  TESTED_NO_IMPROVEMENT: "TESTED_NO_IMPROVEMENT",
  TESTED_NOT_SELECTED: "TESTED_NOT_SELECTED",
  IMPROVEMENT_FOUND: "IMPROVEMENT_FOUND",
  NOT_APPLICABLE: "NOT_APPLICABLE",
});

/** The designer-facing wording. NOT APPLICABLE always appends its real reason. */
export const ADI_LEVER_STATUS_LABEL = Object.freeze({
  NOT_TESTED: "NOT TESTED",
  TESTED_NO_IMPROVEMENT: "TESTED — NO IMPROVEMENT",
  TESTED_NOT_SELECTED: "TESTED — NOT SELECTED",
  IMPROVEMENT_FOUND: "IMPROVEMENT FOUND",
  NOT_APPLICABLE: "NOT APPLICABLE",
});

/**
 * Resolve one lever's status from the evidence its search actually recorded.
 *
 * @param {object} evidence
 * @param {boolean|null} evidence.applicable - false only when the design cannot
 *        search this lever at all; a null/undefined means applicability has not
 *        been established and is never treated as "not applicable".
 * @param {string|null} evidence.notApplicableReason - the REAL reason, required
 *        whenever applicable === false.
 * @param {boolean} evidence.tested - did the search run for this lever?
 * @param {number} evidence.candidateCount - candidates the search evaluated.
 * @param {boolean} evidence.confirmed - did a candidate clear confirmation?
 * @param {boolean} evidence.selected - was a confirmed candidate taken as the
 *        run's winner (or as the applied change)?
 * @param {number|null} evidence.improvementDb - the best attempt's measured
 *        improvement, when one was measured.
 * @returns {{status: string, label: string, reason: string|null, notApplicable: boolean}}
 */
export function resolveAdiLeverStatus(evidence = {}) {
  const {
    applicable = null,
    notApplicableReason = null,
    tested = false,
    candidateCount = 0,
    confirmed = false,
    selected = false,
  } = evidence;

  if (applicable === false) {
    // A real reason is required. Without one, the lever is reported as not
    // tested rather than as a capability claim this evidence does not support.
    if (notApplicableReason) {
      return {
        status: ADI_LEVER_STATUS.NOT_APPLICABLE,
        label: `${ADI_LEVER_STATUS_LABEL.NOT_APPLICABLE} — ${notApplicableReason}`,
        reason: notApplicableReason,
        notApplicable: true,
      };
    }
    return {
      status: ADI_LEVER_STATUS.NOT_TESTED,
      label: ADI_LEVER_STATUS_LABEL.NOT_TESTED,
      reason: null,
      notApplicable: false,
    };
  }

  if (!tested) {
    return {
      status: ADI_LEVER_STATUS.NOT_TESTED,
      label: ADI_LEVER_STATUS_LABEL.NOT_TESTED,
      reason: null,
      notApplicable: false,
    };
  }

  // `confirmed` is set only when the run confirmed an improvement, so it decides
  // this on its own: improvementDb is carried for the record, never re-derived,
  // and never required for a state the run's own confirmation already proves.
  if (confirmed === true) {
    return {
      status: selected ? ADI_LEVER_STATUS.IMPROVEMENT_FOUND : ADI_LEVER_STATUS.TESTED_NOT_SELECTED,
      label: selected
        ? ADI_LEVER_STATUS_LABEL.IMPROVEMENT_FOUND
        : ADI_LEVER_STATUS_LABEL.TESTED_NOT_SELECTED,
      reason: null,
      notApplicable: false,
    };
  }

  // Tested, with evidence, and nothing material came of it. This is the state
  // that must never be reported as "not applicable".
  return {
    status: ADI_LEVER_STATUS.TESTED_NO_IMPROVEMENT,
    label: ADI_LEVER_STATUS_LABEL.TESTED_NO_IMPROVEMENT,
    reason: candidateCount > 0
      ? `${candidateCount} candidate${candidateCount === 1 ? "" : "s"} evaluated — no improvement cleared the 1 dB action threshold`
      : "Tested — no candidate cleared confirmation and the 1 dB action threshold",
    notApplicable: false,
  };
}

/** One short sentence for a run summary, from the same resolution. */
export function adiLeverSummarySentence(leverLabel, resolution) {
  const label = String(leverLabel || "This lever");
  switch (resolution?.status) {
    case ADI_LEVER_STATUS.IMPROVEMENT_FOUND:
      return `${label}: improvement found.`;
    case ADI_LEVER_STATUS.TESTED_NOT_SELECTED:
      return `${label}: tested — an improvement was confirmed but was not selected.`;
    case ADI_LEVER_STATUS.TESTED_NO_IMPROVEMENT:
      return `${label}: tested — no improvement found.`;
    case ADI_LEVER_STATUS.NOT_APPLICABLE:
      return `${label}: not applicable — ${resolution.reason}.`;
    default:
      return `${label}: not tested.`;
  }
}