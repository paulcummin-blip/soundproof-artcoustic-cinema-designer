/**
 * projectReportReadiness
 * ----------------------
 * The Project Report readiness verdict shown on the project (Room Designer)
 * page. It owns no calculation of its own: it composes the SAME canonical
 * authorities the Project Report page uses —
 *   - reportReadinessAuthority.deriveReportReadiness  (required data + assessment)
 *   - reportSnapshotAuthority.resolveSnapshotStatus   (saved report vs the design
 *     as it stands, through the report's own source fingerprints)
 * — so the button can never hold a verdict of its own.
 *
 * Verdicts
 *   ready            the report matches the project as it stands
 *   waiting          required data or the engineering assessment is still missing
 *   update_required  the design moved on after the saved report was generated
 */

import { REPORT_STATE } from '@/components/report/reportReadinessAuthority';
import { REPORT_SNAPSHOT_STATUS, buildStaleSentence } from '@/components/report/reportSnapshotAuthority';

export const PROJECT_REPORT_VERDICT = Object.freeze({
  READY: 'ready',
  WAITING: 'waiting',
  UPDATE_REQUIRED: 'update_required',
});

export const PROJECT_REPORT_BUTTON_LABEL = 'Project Report';

const NOT_READY_FALLBACK_REASON =
  'This project has not been fully assessed yet.';

/**
 * The assessment detail line, stated from the version's own completeness audit.
 * Null when nothing is outstanding.
 */
export function assessmentDetail(reportCompleteness) {
  const keys = Array.isArray(reportCompleteness?.missingParameterKeys)
    ? reportCompleteness.missingParameterKeys
    : [];
  if (keys.length === 0) return null;
  return keys.length === 1
    ? '1 parameter still needs calculating.'
    : `${keys.length} parameters still need calculating.`;
}

/**
 * Compose the button's verdict from the canonical readiness state, the saved
 * report's own status and the missing-item checklist.
 *
 * @param {object} input
 * @param {object} input.readiness       deriveReportReadiness() result
 * @param {string} input.snapshotStatus  REPORT_SNAPSHOT_STATUS for the saved report
 * @param {Array}  input.changedKeys     source inputs that moved on after the save
 * @param {string} input.detail          assessment detail line, when one exists
 * @returns {{verdict:string, state:string, hasReport:boolean, reason:string,
 *            missing:Array, detail:string|null, canOpen:boolean, canUpdate:boolean}}
 */
export function composeProjectReportVerdict({
  readiness = null,
  snapshotStatus = REPORT_SNAPSHOT_STATUS.NONE,
  changedKeys = [],
  detail = null,
} = {}) {
  const state = readiness?.state || REPORT_STATE.NOT_READY;
  const missing = Array.isArray(readiness?.missing) ? readiness.missing : [];
  const hasReport = snapshotStatus === REPORT_SNAPSHOT_STATUS.CURRENT
    || snapshotStatus === REPORT_SNAPSHOT_STATUS.STALE;

  // The design moved on after the saved report was generated. Stated with the
  // report's own stale sentence, naming the inputs that changed.
  if (snapshotStatus === REPORT_SNAPSHOT_STATUS.STALE) {
    return {
      verdict: PROJECT_REPORT_VERDICT.UPDATE_REQUIRED,
      state,
      hasReport: true,
      reason: buildStaleSentence(changedKeys),
      missing,
      detail,
      canOpen: true,
      canUpdate: true,
    };
  }

  // Everything the report needs is present and reflects the current design.
  if (state === REPORT_STATE.READY) {
    return {
      verdict: PROJECT_REPORT_VERDICT.READY,
      state,
      hasReport,
      reason: hasReport
        ? 'This report reflects the project as it stands.'
        : 'Everything this report needs is in place.',
      missing: [],
      detail: null,
      canOpen: true,
      canUpdate: false,
    };
  }

  // Required data or the engineering assessment is still missing. Navigation is
  // blocked: the report cannot be produced yet, so say why.
  return {
    verdict: PROJECT_REPORT_VERDICT.WAITING,
    state,
    hasReport,
    reason: readiness?.reason || NOT_READY_FALLBACK_REASON,
    missing,
    detail,
    canOpen: false,
    canUpdate: false,
  };
}