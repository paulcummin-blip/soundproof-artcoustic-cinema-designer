/**
 * documentWorkflowStatus.js
 * --------------------------
 * Pure logic for the coordinated document workflow (v2 projects only).
 *
 * Determines the state of each workflow step from the project's stored
 * ProjectAssetExport records and the current engineering fingerprint:
 *
 *   1a — Technical Report  (document_type "project")
 *   1b — Speaker Design    (document_type "speaker_design")
 *   2  — Client Proposal   (available when 1a and 1b both have stored PDFs)
 *
 * A document is Ready only when a stored export exists for this version with a
 * matching engineering fingerprint AND a valid file reference (file_uri or
 * file_url). This survives reload — the stored record IS the authority, never
 * an in-session signal alone.
 *
 * Pure: no React, no network, no side effects.
 */

/** The three coordinated workflow steps. */
export const WORKFLOW_STEP = Object.freeze({
  TECHNICAL_REPORT: 'technical_report',
  SPEAKER_DESIGN: 'speaker_design',
  CLIENT_PROPOSAL: 'client_proposal',
});

/** The state of one workflow step. */
export const WORKFLOW_STATE = Object.freeze({
  NOT_CREATED: 'not_created',
  GENERATING: 'generating',
  READY: 'ready',
  FAILED: 'failed',
  OUTDATED: 'outdated',
});

/** User-facing labels for each state. */
export const WORKFLOW_STATE_LABEL = Object.freeze({
  [WORKFLOW_STATE.NOT_CREATED]: 'Not created',
  [WORKFLOW_STATE.GENERATING]: 'Generating…',
  [WORKFLOW_STATE.READY]: 'Ready',
  [WORKFLOW_STATE.FAILED]: 'Failed',
  [WORKFLOW_STATE.OUTDATED]: 'Outdated',
});

/**
 * User-facing display labels in the coordinated-workflow vocabulary.
 * These replace the older short labels on the dealer-facing panel:
 *   - "Ready to Create" — prerequisites satisfied, PDF not generated yet.
 *   - "Creating…" — generation in progress.
 *   - "Created" — a complete PDF exists in Project Assets.
 *   - "Failed" — generation failed, Retry available.
 *   - "Outdated" — an existing PDF no longer matches the current design.
 * "Not Available" (below) is shown when a step's prerequisites are missing.
 */
export const WORKFLOW_DISPLAY_LABEL = Object.freeze({
  [WORKFLOW_STATE.NOT_CREATED]: 'Ready to Create',
  [WORKFLOW_STATE.GENERATING]: 'Creating…',
  [WORKFLOW_STATE.READY]: 'Created',
  [WORKFLOW_STATE.FAILED]: 'Failed',
  [WORKFLOW_STATE.OUTDATED]: 'Outdated',
});

/** Label shown when a step's prerequisites are not satisfied. */
export const NOT_AVAILABLE_LABEL = 'Not Available';

/**
 * Resolve the user-facing display label for a workflow step. Step 2 (Client
 * Proposal) shows "Not Available" instead of "Ready to Create" when its
 * prerequisites (1a and 1b Created) are not met, so the dealer is never told
 * Step 2 is ready before its source documents exist.
 */
export function resolveStepDisplayLabel(stepKey, state, proposalAvailable = false) {
  if (stepKey === WORKFLOW_STEP.CLIENT_PROPOSAL && state === WORKFLOW_STATE.NOT_CREATED) {
    return proposalAvailable
      ? WORKFLOW_DISPLAY_LABEL[WORKFLOW_STATE.NOT_CREATED]
      : NOT_AVAILABLE_LABEL;
  }
  return WORKFLOW_DISPLAY_LABEL[state] || WORKFLOW_DISPLAY_LABEL[WORKFLOW_STATE.NOT_CREATED];
}

/** The document_type values the workflow tracks. */
const TECHNICAL_REPORT_TYPE = 'project';
const SPEAKER_DESIGN_TYPE = 'speaker_design';

/**
 * Find the latest stored export of a given type for a version whose engineering
 * fingerprint matches the current design and whose file reference is valid.
 */
function findMatchingExport(exports, versionId, documentType, engineeringFingerprint) {
  if (!Array.isArray(exports) || !versionId || !documentType) return null;
  return exports.find((record) => {
    if (record?.version_id !== versionId) return false;
    if (record?.document_type !== documentType) return false;
    if (!record?.file_uri && !record?.file_url) return false;
    const fp = record?.source_fingerprints?.engineeringFingerprint || null;
    return fp === engineeringFingerprint && fp !== null;
  }) || null;
}

/**
 * Find any stored export of a given type for a version (any fingerprint),
 * so an outdated document can be distinguished from no document at all.
 */
function findAnyExport(exports, versionId, documentType) {
  if (!Array.isArray(exports) || !versionId || !documentType) return null;
  return exports.find((record) => {
    if (record?.version_id !== versionId) return false;
    if (record?.document_type !== documentType) return false;
    return !!(record?.file_uri || record?.file_url);
  }) || null;
}

/**
 * Resolve the state of one workflow step from stored records and in-session
 * generation signals.
 *
 * @returns {{state: string, record?: Object, reason?: string, freshnessReason?: string|null}}
 */
export function resolveWorkflowStepState({
  exports = [],
  versionId = null,
  documentType = null,
  engineeringFingerprint = null,
  isGenerating = false,
  generationError = null,
  freshnessReason = null,
}) {
  if (isGenerating) {
    return { state: WORKFLOW_STATE.GENERATING };
  }
  if (generationError) {
    return { state: WORKFLOW_STATE.FAILED, reason: generationError };
  }
  const match = findMatchingExport(exports, versionId, documentType, engineeringFingerprint);
  if (match) {
    return { state: WORKFLOW_STATE.READY, record: match };
  }
  const anyExport = findAnyExport(exports, versionId, documentType);
  if (anyExport) {
    return { state: WORKFLOW_STATE.OUTDATED, record: anyExport, freshnessReason };
  }
  return { state: WORKFLOW_STATE.NOT_CREATED };
}

/**
 * The full workflow status for one version, from stored exports and the
 * Speaker Design in-session generation signal.
 *
 * @param {Object} [options.freshnessReasons]  map of documentType → human-readable
 *   reason for the OUTDATED state, computed from the saved and current
 *   publications' frozen facts. Passed through unchanged to each step.
 * @returns {{loading: boolean, technicalReport, speakerDesign, proposalAvailable: boolean}}
 */
export function resolveWorkflowStatus({
  exports = [],
  versionId = null,
  engineeringFingerprint = null,
  speakerDesignGenerating = false,
  speakerDesignError = null,
  freshnessReasons = {},
}) {
  const technicalReport = resolveWorkflowStepState({
    exports,
    versionId,
    documentType: TECHNICAL_REPORT_TYPE,
    engineeringFingerprint,
    freshnessReason: freshnessReasons[TECHNICAL_REPORT_TYPE] || null,
  });
  const speakerDesign = resolveWorkflowStepState({
    exports,
    versionId,
    documentType: SPEAKER_DESIGN_TYPE,
    engineeringFingerprint,
    isGenerating: speakerDesignGenerating,
    generationError: speakerDesignError,
    freshnessReason: freshnessReasons[SPEAKER_DESIGN_TYPE] || null,
  });
  const proposalAvailable =
    technicalReport.state === WORKFLOW_STATE.READY
    && speakerDesign.state === WORKFLOW_STATE.READY;
  const proposalExports = exports.filter((record) =>
    ['proposal', 'system_design_summary'].includes(record?.document_type)
    && record?.rendering !== 'text_vector'
    && record?.preview_status !== 'partial'
    && (!record.selected_version_ids?.length ||
      (record.selected_version_ids.length === 1 && record.selected_version_ids[0] === versionId))
  ).map((record) => ({ ...record, document_type: 'proposal' }));
  const clientProposal = resolveWorkflowStepState({
    exports: proposalExports,
    versionId,
    documentType: 'proposal',
    engineeringFingerprint,
    freshnessReason: freshnessReasons.proposal || null,
  });
  return { technicalReport, speakerDesign, clientProposal, proposalAvailable };
}

/** Whether a project record uses the v2 coordinated workflow. */
export function isV2WorkflowProject(project) {
  return project?.document_workflow === 'v2';
}

export default resolveWorkflowStatus;