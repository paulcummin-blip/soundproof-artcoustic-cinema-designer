/**
 * proposalPreparationAuthority.js
 * -------------------------------
 * What Sound Proof does about a version that is not yet proposal-ready, decided
 * from the authorities that already exist.
 *
 * It is a translator, not an authority. It reads the readiness rows the wizard
 * already holds — each one carrying the version's saved Project Report state and
 * the state of its saved engineering publication — and answers two questions:
 *
 *   1. Can Sound Proof finish this itself, or does the designer have to do
 *      something in their design?
 *   2. What is the ONE action, in the designer's own words?
 *
 * Nothing here reads a fingerprint, publishes, writes, calculates or grades. The
 * internal vocabulary (publication, pointer, cache, fingerprint) never reaches
 * the designer: it stays in the Engineer details of the preparation panel.
 */

import {
  PROJECT_REPORT_ROUTE,
  READINESS_STATE,
  buildProjectReportAction,
} from '@/components/proposal/sourceAuthority/proposalReadinessAuthority';

/** What the preparation step resolved to. */
export const PREPARATION_STATE = Object.freeze({
  /** Every selected version already has its current Project Report. */
  READY: 'ready',
  /** Sound Proof is still checking, or is finishing the work itself. */
  PREPARING: 'preparing',
  /** The designer has one thing to do before the proposal can be written. */
  ACTION_REQUIRED: 'action_required',
  /** The saved design could not be read at all. */
  UNREADABLE: 'unreadable',
});

/** The one thing the designer is asked to do, when anything is asked at all. */
export const PREPARATION_ACTION = Object.freeze({
  /** Open the design and let Sound Proof record the current assessment. */
  RECORD_ASSESSMENT: 'record_assessment',
  /** Regenerate the version's Project Report from its saved assessment. */
  UPDATE_REPORT: 'update_report',
  /** A calculation is genuinely missing: finish the design. */
  FINISH_DESIGN: 'finish_design',
  /** The saved design could not be read: read it again. */
  RETRY_READ: 'retry_read',
});

/** The panel's one title. */
export const PREPARATION_TITLE = 'Preparing your proposal';

/** The line the designer reads while Sound Proof works. */
export const PREPARATION_LINE = 'Checking your design and reports…';

/** The line shown while the design itself must supply the last calculation. */
export const PREPARATION_DESIGN_LINE = 'Your cinema design needs one more calculation before the proposal is ready.';

/** The line shown when the designer's design must record its current assessment. */
export const PREPARATION_RECORD_LINE = 'Your design needs its current assessment recording before the proposal is ready.';

/** The line shown when the version's Project Report is out of date. */
export const PREPARATION_REPORT_LINE = 'Your Project Report needs updating before the proposal is ready.';

/** The line shown when the saved design could not be read. */
export const PREPARATION_UNREADABLE_LINE = 'Sound Proof could not read the saved design. Nothing has been treated as missing or uncalculated.';

/** The Engineer-details disclosure label — where internal terms belong. */
export const PREPARATION_ENGINEER_LABEL = 'Engineer details';

/** How urgent each need is: the first one found decides the single action. */
const NEED_PRIORITY = [
  PREPARATION_ACTION.FINISH_DESIGN,
  PREPARATION_ACTION.UPDATE_REPORT,
  PREPARATION_ACTION.RECORD_ASSESSMENT,
];

function roomDesignerHref(projectId, versionId) {
  const params = new URLSearchParams();
  if (projectId) params.set('projectId', projectId);
  if (versionId) params.set('versionId', versionId);
  const query = params.toString();
  return query ? `/RoomDesigner?${query}` : '/RoomDesigner';
}

/**
 * What ONE blocked version needs, from the two states the readiness row carries:
 * its saved Project Report, and its saved engineering publication.
 *
 * @param {Object} row — a readiness row (see useProposalReadiness)
 * @returns {string} PREPARATION_ACTION
 */
export function resolveVersionNeed(row) {
  const publication = row?.publicationStatus || null;
  const hasCompletedAssessment = row?.hasCompletedAuthority === true;
  const reportState = row?.project?.state || null;

  // No publication for this design at all. The design itself decides whether
  // that is because its assessment is incomplete, or because the completed
  // assessment simply has not been recorded yet.
  if (publication === 'stale' || publication === 'not_calculated' || !publication) {
    return hasCompletedAssessment
      ? PREPARATION_ACTION.RECORD_ASSESSMENT
      : PREPARATION_ACTION.FINISH_DESIGN;
  }

  // The publication is there and resolves: what is missing is the Project Report
  // the proposal reads, which is the report's own existing workflow.
  if (publication === 'published') return PREPARATION_ACTION.UPDATE_REPORT;

  // A publication that could not be read is not a reason to send the designer
  // anywhere: the read is repeated.
  if (publication === 'read_failed') return PREPARATION_ACTION.RETRY_READ;

  return hasCompletedAssessment
    ? PREPARATION_ACTION.RECORD_ASSESSMENT
    : PREPARATION_ACTION.FINISH_DESIGN;
}

/**
 * The designer's ONE action, in the designer's own words. The version the action
 * belongs to is named, so a comparison never sends the designer to the wrong
 * design.
 */
export function buildPreparationAction({ need, reportState = null, projectId = null, versionId = null, versionName = null } = {}) {
  const name = versionName ? ` for ${versionName}` : '';
  switch (need) {
    case PREPARATION_ACTION.RECORD_ASSESSMENT:
      return {
        key: need,
        label: 'Record the current assessment',
        href: roomDesignerHref(projectId, versionId),
        note: 'Sound Proof records it automatically when the design opens, then finishes the proposal.',
        line: PREPARATION_RECORD_LINE,
      };
    case PREPARATION_ACTION.UPDATE_REPORT: {
      // The report's own vocabulary: a version with no Project Report creates one,
      // a version whose report the design has moved past updates it.
      const report = buildProjectReportAction({
        state: reportState || READINESS_STATE.STALE,
        projectId,
        versionId,
      });
      return {
        key: need,
        label: report?.label || 'Create Updated Report',
        href: report?.url || PROJECT_REPORT_ROUTE,
        note: 'The report is rebuilt from the saved assessment. Nothing is recalculated.',
        line: PREPARATION_REPORT_LINE,
      };
    }
    case PREPARATION_ACTION.FINISH_DESIGN:
      return {
        key: need,
        label: 'Finish this design',
        href: roomDesignerHref(projectId, versionId),
        note: `Complete the missing calculation${name}, then continue — your proposal is kept where it is.`,
        line: PREPARATION_DESIGN_LINE,
      };
    case PREPARATION_ACTION.RETRY_READ:
    default:
      return {
        key: PREPARATION_ACTION.RETRY_READ,
        label: 'Try again',
        href: null,
        note: null,
        line: PREPARATION_UNREADABLE_LINE,
      };
  }
}

/**
 * Resolve the whole preparation step.
 *
 * @param {Object} params
 * @param {Array}  params.rows      — every selected version's readiness row
 * @param {boolean} params.loading  — a readiness or snapshot read is in flight
 * @param {string|null} params.error — the readiness read failed
 * @param {string|null} params.projectId
 * @returns {{state, action, line, detail, versions}}
 */
export function resolvePreparation({ rows = [], loading = false, error = null, projectId = null } = {}) {
  if (error) {
    return {
      state: PREPARATION_STATE.UNREADABLE,
      action: buildPreparationAction({ need: PREPARATION_ACTION.RETRY_READ, projectId }),
      line: PREPARATION_UNREADABLE_LINE,
      detail: error,
      versions: [],
    };
  }

  const list = Array.isArray(rows) ? rows : [];
  if (loading) {
    return { state: PREPARATION_STATE.PREPARING, action: null, line: PREPARATION_LINE, detail: null, versions: [] };
  }
  if (list.length === 0) {
    return { state: PREPARATION_STATE.PREPARING, action: null, line: PREPARATION_LINE, detail: null, versions: [] };
  }

  const blocked = list.filter((row) => !row?.ready && !row?.checking);
  if (blocked.length === 0) {
    return { state: PREPARATION_STATE.READY, action: null, line: null, detail: null, versions: [] };
  }

  const needs = blocked.map((row) => ({
    row,
    need: resolveVersionNeed(row),
  }));
  const urgent = [...needs].sort(
    (a, b) => NEED_PRIORITY.indexOf(a.need) - NEED_PRIORITY.indexOf(b.need),
  )[0];

  return {
    state: PREPARATION_STATE.ACTION_REQUIRED,
    action: buildPreparationAction({
      need: urgent.need,
      reportState: urgent.row?.project?.state || null,
      projectId,
      versionId: urgent.row?.versionId || null,
      versionName: urgent.row?.versionName || null,
    }),
    line: buildPreparationAction({ need: urgent.need }).line,
    // Internal terms only ever travel here, into the Engineer details.
    detail: needs
      .map(({ row, need }) => `${row?.versionName || row?.versionId}: ${need} · report ${row?.project?.state || 'unknown'} · publication ${row?.publicationStatus || 'unknown'}`)
      .join('\n'),
    versions: blocked.map((row) => row?.versionName).filter(Boolean),
  };
}

export default resolvePreparation;