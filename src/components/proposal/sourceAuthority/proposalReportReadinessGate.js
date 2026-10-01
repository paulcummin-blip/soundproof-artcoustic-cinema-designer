/**
 * proposalReportReadinessGate.js
 * ------------------------------
 * The Step 3 readiness gate for proposal creation.
 *
 * A proposal is a polished interpretation of the actual project reports. It may
 * not be generated from stale project data, guessed values or generic AI text,
 * so the Versions step refuses to advance until the selected version has BOTH
 * a current Visual Report and a current Technical Report.
 *
 * This module adds no new authority: it presents the existing
 * proposalSourceAuthority status per report — Current / Missing / Stale /
 * Failed — and states the one action each condition needs. The action is kept
 * in every state, so the buttons never disappear when the read settles, an
 * unresolved read is shown as Checking rather than as a definite Missing, and
 * its label is always "Generate <Report>" — the status text carries the state,
 * the button only says what it does.
 *
 * Derivation only: recalculates nothing, generates no report content.
 * Pure: no React, no side effects, no runtime APIs.
 */

import {
  PROPOSAL_SOURCE_REPORT,
  PROPOSAL_SOURCE_REPORT_LABEL,
} from '@/components/proposal/sourceAuthority/proposalSourceAuthority';
import {
  PROPOSAL_REPORT_ORDER,
  PROPOSAL_REPORT_STATUS_TEXT,
  PROPOSAL_REPORT_UI_STATE,
  buildReportActionRow,
  resolveReportActionRows,
} from '@/components/proposal/sourceAuthority/proposalReportActions';

/** Panel heading for the Step 3 readiness block. */
export const PROPOSAL_REPORT_GATE_TITLE = 'Proposal source reports';

/** The blocking message, shown verbatim whenever Next is blocked. */
export const PROPOSAL_REPORT_GATE_MESSAGE =
  'Generate the Visual and Technical Reports before creating a proposal. This ensures the proposal uses the current project data and RP22 results.';

/** Why the reports are required, in the designer's own terms. */
export const PROPOSAL_REPORT_GATE_DETAIL =
  'The proposal uses the current Visual and Technical reports to describe the actual project, RP22 results, design strengths and limitations.';

/** Shown once both reports read Current. */
export const PROPOSAL_REPORT_GATE_READY_COPY =
  'The proposal will be generated from these reports.';

/** Canonical display vocabulary for a report's readiness on this step. */
export const PROPOSAL_REPORT_GATE_STATUS = Object.freeze({
  [PROPOSAL_REPORT_UI_STATE.CURRENT]: PROPOSAL_REPORT_STATUS_TEXT[PROPOSAL_REPORT_UI_STATE.CURRENT],
  [PROPOSAL_REPORT_UI_STATE.MISSING]: PROPOSAL_REPORT_STATUS_TEXT[PROPOSAL_REPORT_UI_STATE.MISSING],
  [PROPOSAL_REPORT_UI_STATE.STALE]: PROPOSAL_REPORT_STATUS_TEXT[PROPOSAL_REPORT_UI_STATE.STALE],
  [PROPOSAL_REPORT_UI_STATE.FAILED]: PROPOSAL_REPORT_STATUS_TEXT[PROPOSAL_REPORT_UI_STATE.FAILED],
  [PROPOSAL_REPORT_UI_STATE.CHECKING]: PROPOSAL_REPORT_STATUS_TEXT[PROPOSAL_REPORT_UI_STATE.CHECKING],
  [PROPOSAL_REPORT_UI_STATE.UNRESOLVED]: PROPOSAL_REPORT_STATUS_TEXT[PROPOSAL_REPORT_UI_STATE.UNRESOLVED],
});

/** Both reports, always in this order. */
export const PROPOSAL_REPORT_GATE_ORDER = PROPOSAL_REPORT_ORDER;

export function describeGateStatus(state) {
  return PROPOSAL_REPORT_GATE_STATUS[state]
    || PROPOSAL_REPORT_GATE_STATUS[PROPOSAL_REPORT_UI_STATE.MISSING];
}

/**
 * One readiness row, built from a report status in the source authority.
 *
 * @param {Object} params
 * @param {Object} params.report     — source authority report status
 * @param {string|null} params.projectId
 * @param {string|null} params.versionId
 * @param {boolean} [params.checking] — the read has not settled
 * @returns {Object} row
 */
export function buildReportGateRow({
  report,
  projectId = null,
  versionId = null,
  checking = false,
}) {
  const key = report?.report || PROPOSAL_SOURCE_REPORT.VISUAL;
  return buildReportActionRow({
    reportKey: key,
    report: report || { report: key },
    checking,
    projectId,
    versionId,
  });
}

/**
 * Resolve the whole gate for the selected version.
 *
 * @param {Object} params
 * @param {Object|null} params.status   — proposalSourceAuthority status for the version
 * @param {boolean} [params.loading]    — the authority read is still in flight (shown as Checking;
 *                                        every action stays available)
 * @returns {{available: boolean, checking: boolean, ready: boolean, rows: Array, message: string|null, detail: string|null}}
 */
export function resolveReportGate({ status = null, loading = false } = {}) {
  const versionId = status?.versionId || null;
  if (!status || !versionId) {
    return {
      available: false,
      checking: !!loading,
      ready: false,
      rows: [],
      message: null,
      detail: null,
    };
  }

  const checking = !!loading;
  const rows = resolveReportActionRows({
    reports: status.reports || {},
    checking,
    projectId: status.projectId,
    versionId,
    generatedAt: status.reportGeneratedAt || null,
  });

  const ready = !checking && status.ready === true && rows.every((row) => row.current);

  return {
    available: true,
    checking,
    ready,
    rows,
    message: ready ? null : PROPOSAL_REPORT_GATE_MESSAGE,
    detail: ready ? null : PROPOSAL_REPORT_GATE_DETAIL,
  };
}

/** Report labels, kept for callers that render the gate outside a row. */
export const PROPOSAL_REPORT_GATE_LABELS = PROPOSAL_SOURCE_REPORT_LABEL;