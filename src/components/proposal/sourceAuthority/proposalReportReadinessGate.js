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
 * Failed — and states the one action each condition needs.
 *
 * Derivation only: recalculates nothing, generates no report content.
 * Pure: no React, no side effects, no runtime APIs.
 */

import {
  PROPOSAL_SOURCE_STATE,
  PROPOSAL_SOURCE_REPORT,
  PROPOSAL_SOURCE_REPORT_LABEL,
  buildReportActionUrl,
} from '@/components/proposal/sourceAuthority/proposalSourceAuthority';

/** Panel heading for the Step 3 readiness block. */
export const PROPOSAL_REPORT_GATE_TITLE = 'Proposal source reports';

/** The blocking message, shown verbatim whenever Next is blocked. */
export const PROPOSAL_REPORT_GATE_MESSAGE =
  'Create Visual and Technical reports in order to continue.';

/** Why the reports are required, in the designer's own terms. */
export const PROPOSAL_REPORT_GATE_DETAIL =
  'The proposal uses the current Visual and Technical reports to describe the actual project, RP22 results, design strengths and limitations. Generate both reports before creating the proposal.';

/** Canonical display vocabulary for a report's readiness on this step. */
export const PROPOSAL_REPORT_GATE_STATUS = Object.freeze({
  [PROPOSAL_SOURCE_STATE.CURRENT]: 'Current',
  [PROPOSAL_SOURCE_STATE.MISSING]: 'Missing',
  [PROPOSAL_SOURCE_STATE.STALE]: 'Stale',
  [PROPOSAL_SOURCE_STATE.FAILED]: 'Failed',
});

/** Both reports, always in this order. */
export const PROPOSAL_REPORT_GATE_ORDER = Object.freeze([
  PROPOSAL_SOURCE_REPORT.VISUAL,
  PROPOSAL_SOURCE_REPORT.TECHNICAL,
]);

export function describeGateStatus(state) {
  return PROPOSAL_REPORT_GATE_STATUS[state] || PROPOSAL_REPORT_GATE_STATUS[PROPOSAL_SOURCE_STATE.MISSING];
}

/**
 * The action a report's state needs. A report that does not exist is created;
 * one that exists but no longer matches the version is regenerated.
 */
export function gateActionLabel(label, state) {
  switch (state) {
    case PROPOSAL_SOURCE_STATE.MISSING:
      return `Create ${label}`;
    case PROPOSAL_SOURCE_STATE.STALE:
      return `Regenerate stale ${label}`;
    case PROPOSAL_SOURCE_STATE.FAILED:
      return `Regenerate ${label}`;
    default:
      return null;
  }
}

/**
 * One readiness row, built from a report status in the source authority.
 *
 * @param {Object} params
 * @param {Object} params.report     — source authority report status
 * @param {string|null} params.projectId
 * @param {string|null} params.versionId
 * @returns {Object} row
 */
export function buildReportGateRow({ report, projectId = null, versionId = null }) {
  const key = report?.report || null;
  const label = report?.label || PROPOSAL_SOURCE_REPORT_LABEL[key] || 'Report';
  const state = report?.state || PROPOSAL_SOURCE_STATE.MISSING;
  const actionLabel = gateActionLabel(label, state);
  return {
    key,
    label,
    state,
    status: describeGateStatus(state),
    current: state === PROPOSAL_SOURCE_STATE.CURRENT,
    reason: report?.reason || null,
    actionLabel,
    actionUrl: actionLabel
      ? buildReportActionUrl({ route: report?.route, projectId, versionId })
      : null,
  };
}

/**
 * Resolve the whole gate for the selected version.
 *
 * @param {Object} params
 * @param {Object|null} params.status   — proposalSourceAuthority status for the version
 * @param {boolean} [params.loading]    — the authority read is still in flight
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

  const rows = PROPOSAL_REPORT_GATE_ORDER.map((key) => buildReportGateRow({
    report: status.reports?.[key] || { report: key },
    projectId: status.projectId,
    versionId,
  }));

  const ready = !loading && status.ready === true && rows.every((row) => row.current);

  return {
    available: true,
    checking: !!loading,
    ready,
    rows,
    message: ready ? null : PROPOSAL_REPORT_GATE_MESSAGE,
    detail: ready ? null : PROPOSAL_REPORT_GATE_DETAIL,
  };
}