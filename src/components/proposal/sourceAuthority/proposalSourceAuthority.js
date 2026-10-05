/**
 * proposalSourceAuthority.js
 * --------------------------
 * THE source authority for proposal generation.
 *
 * A proposal is downstream of the generated Visual and Technical Reports — it
 * is a polished interpretation of the actual Sound Proof design, never a
 * separate AI guess. This module decides whether a project version has current
 * source reports, and when it does not, exactly what has to happen next.
 *
 * Rule:
 *   No current Visual Report + current Technical Report = no proposal.
 *
 * States
 *   current  a report source exists for this version and still matches the
 *            design it was generated from.
 *   missing  no report source exists for this version yet.
 *   stale    a report source exists but no longer matches the current project,
 *            version or design.
 *   failed   the source is unavailable (generation failed or was withdrawn).
 *
 * Derivation only: this module produces no report content, recalculates no
 * engineering value, and never invents a project fact.
 *
 * Pure: no React, no side effects, no runtime APIs.
 */

export const PROPOSAL_SOURCE_STATE = Object.freeze({
  CURRENT: 'current',
  /**
   * The report EXISTS and is current, but its proposal evidence was never
   * captured: it needs refreshing for proposal comparison evidence. Never
   * stated as Missing — the report is not missing.
   */
  LEGACY: 'legacy',
  MISSING: 'missing',
  STALE: 'stale',
  FAILED: 'failed',
});

export const PROPOSAL_SOURCE_REPORT = Object.freeze({
  VISUAL: 'visual',
  TECHNICAL: 'technical',
});

export const PROPOSAL_SOURCE_REPORT_LABEL = Object.freeze({
  visual: 'Visual Report',
  technical: 'Technical Report',
});

/** Where each report is generated, so a blocker can offer the right action. */
export const PROPOSAL_SOURCE_REPORT_ROUTE = Object.freeze({
  visual: '/RP22ClientReport',
  technical: '/RP22Report',
});

/** The blocking message, shown verbatim whenever a proposal cannot be generated. */
export const PROPOSAL_SOURCE_REQUIRED_MESSAGE =
  'Generate the Visual and Technical Reports before creating a proposal. This ensures the proposal uses the current project data and RP22 results.';

/** The one-line rule, for documentation and tests. */
export const PROPOSAL_SOURCE_RULE =
  'No current Visual Report + current Technical Report = no proposal.';

/** Panel heading. */
export const PROPOSAL_SOURCE_TITLE = 'Proposal Source Data';

/** Canonical display vocabulary for a source state. */
export function describeSourceState(state) {
  switch (state) {
    case PROPOSAL_SOURCE_STATE.CURRENT:
      return 'Current';
    case PROPOSAL_SOURCE_STATE.STALE:
      return 'Stale';
    case PROPOSAL_SOURCE_STATE.FAILED:
      return 'Unavailable';
    case PROPOSAL_SOURCE_STATE.LEGACY:
      return 'Needs one-time refresh';
    case PROPOSAL_SOURCE_STATE.MISSING:
      return 'Missing';
    default:
      return 'Missing';
  }
}

/**
 * Does the report source belong to the project and version being proposed?
 *
 * The report carries its own identity; a source generated for another project
 * or another version must never be used, however complete it looks.
 *
 * @param {Object} params
 * @param {string|null} params.projectId
 * @param {string|null} params.versionId
 * @param {string|null} [params.sourceProjectId]  — report source project id
 * @param {string|null} [params.sourceVersionId]  — report source version id
 * @returns {{ok: boolean, mismatches: string[]}}
 */
export function verifySourceIdentity({ projectId, versionId, sourceProjectId, sourceVersionId }) {
  const mismatches = [];
  if (!projectId || !versionId) {
    mismatches.push('no-active-version');
  }
  if (sourceProjectId && projectId && String(sourceProjectId) !== String(projectId)) {
    mismatches.push('project');
  }
  if (sourceVersionId && versionId && String(sourceVersionId) !== String(versionId)) {
    mismatches.push('version');
  }
  return { ok: mismatches.length === 0, mismatches };
}

/**
 * Resolve one report's source state.
 *
 * @param {Object} params
 * @param {boolean} params.hasSource           a report source exists for this version
 * @param {boolean} params.identityVerified    it belongs to this project + version
 * @param {boolean} params.designMovedOn       the design changed since it was generated
 * @param {boolean} params.recalculationPending a recalculation is in flight
 * @param {boolean} params.unavailable         generation failed / withdrawn
 * @returns {string} one of PROPOSAL_SOURCE_STATE
 */
export function resolveReportSourceState({
  hasSource = false,
  identityVerified = true,
  designMovedOn = false,
  recalculationPending = false,
  unavailable = false,
}) {
  if (unavailable) return PROPOSAL_SOURCE_STATE.FAILED;
  if (!hasSource) return PROPOSAL_SOURCE_STATE.MISSING;
  if (!identityVerified) return PROPOSAL_SOURCE_STATE.STALE;
  if (designMovedOn || recalculationPending) return PROPOSAL_SOURCE_STATE.STALE;
  return PROPOSAL_SOURCE_STATE.CURRENT;
}

/**
 * The complete proposal source status for one project version.
 *
 * @param {Object} params
 * @param {string|null} params.projectId
 * @param {string|null} params.versionId
 * @param {string|null} [params.versionName]
 * @param {boolean} params.hasSource
 * @param {boolean} [params.identityVerified]
 * @param {string[]} [params.identityMismatches]
 * @param {boolean} [params.designMovedOn]
 * @param {boolean} [params.recalculationPending]
 * @param {boolean} [params.unavailable]
 * @param {string|null} [params.reportGeneratedAt]
 * @param {string|null} [params.sourceFingerprint]
 * @param {string|null} [params.sourceOutOfDateReason] exact shared authority blocker
 * @returns {Object} source status
 */
export function resolveProposalSource({
  projectId = null,
  versionId = null,
  versionName = null,
  hasSource = false,
  identityVerified = true,
  identityMismatches = [],
  designMovedOn = false,
  recalculationPending = false,
  unavailable = false,
  reportGeneratedAt = null,
  sourceFingerprint = null,
  sourceOutOfDateReason = null,
} = {}) {
  const reportInputs = {
    hasSource,
    identityVerified,
    designMovedOn: designMovedOn || !!sourceOutOfDateReason,
    recalculationPending,
    unavailable,
  };
  const state = resolveReportSourceState(reportInputs);
  const ready = state === PROPOSAL_SOURCE_STATE.CURRENT;

  // Both reports are rendered from the same current published engineering
  // authority for the version, so they share a source state — but each carries
  // its own label, reason and action, because each is regenerated on its own page.
  const reports = {
    [PROPOSAL_SOURCE_REPORT.VISUAL]: buildReportStatus('visual', state, identityMismatches),
    [PROPOSAL_SOURCE_REPORT.TECHNICAL]: buildReportStatus('technical', state, identityMismatches),
  };
  if (sourceOutOfDateReason) {
    Object.keys(reports).forEach((key) => {
      reports[key] = {
        ...reports[key],
        state: PROPOSAL_SOURCE_STATE.STALE,
        status: describeSourceState(PROPOSAL_SOURCE_STATE.STALE),
        reason: sourceOutOfDateReason,
        action: `Generate ${reports[key].label}`,
      };
    });
  }

  return {
    projectId,
    versionId,
    versionName: versionName || null,
    state,
    ready,
    rule: PROPOSAL_SOURCE_RULE,
    reports,
    blockers: ready ? [] : buildBlockers(reports),
    message: ready ? null : (sourceOutOfDateReason || PROPOSAL_SOURCE_REQUIRED_MESSAGE),
    reportGeneratedAt: reportGeneratedAt || null,
    sourceFingerprint: sourceFingerprint || null,
  };
}

function buildReportStatus(reportKey, state, identityMismatches) {
  const label = PROPOSAL_SOURCE_REPORT_LABEL[reportKey];
  return {
    report: reportKey,
    label,
    state,
    status: describeSourceState(state),
    reason: describeReportReason(state, label, identityMismatches),
    // A report that simply does not exist yet is generated; one that exists but
    // no longer matches the design is regenerated.
    action: state === PROPOSAL_SOURCE_STATE.CURRENT
      ? null
      : state === PROPOSAL_SOURCE_STATE.MISSING
        ? `Generate ${label}`
        : `Regenerate ${label}`,
    route: PROPOSAL_SOURCE_REPORT_ROUTE[reportKey],
  };
}

function describeReportReason(state, label, identityMismatches = []) {
  switch (state) {
    case PROPOSAL_SOURCE_STATE.STALE:
      if (identityMismatches.includes('project') || identityMismatches.includes('version')) {
        return `${label} was generated for a different project or version.`;
      }
      return `${label} was generated from an earlier design and no longer matches this version.`;
    case PROPOSAL_SOURCE_STATE.FAILED:
      return `${label} is not available.`;
    case PROPOSAL_SOURCE_STATE.MISSING:
      return `${label} has not been generated for this version.`;
    default:
      return null;
  }
}

function buildBlockers(reports) {
  return Object.values(reports)
    .filter((report) => report.action)
    .map((report) => ({
      key: report.report,
      label: report.label,
      state: report.state,
      reason: report.reason,
      action: report.action,
      route: report.route,
    }));
}

/**
 * The report page URL for a blocker, carrying the project and version so the
 * report is generated for exactly the version the proposal needs.
 *
 * @param {Object} params
 * @param {string} params.route
 * @param {string|null} params.projectId
 * @param {string|null} params.versionId
 * @returns {string}
 */
export function buildReportActionUrl({ route, projectId, versionId }) {
  const params = new URLSearchParams();
  if (projectId) params.set('projectId', projectId);
  if (versionId) params.set('versionId', versionId);
  const query = params.toString();
  return query ? `${route}?${query}` : route;
}