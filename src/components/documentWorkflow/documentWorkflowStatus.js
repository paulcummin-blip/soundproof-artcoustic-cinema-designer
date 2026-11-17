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
 * @returns {{state: string, record?: Object, reason?: string}}
 */
export function resolveWorkflowStepState({
  exports = [],
  versionId = null,
  documentType = null,
  engineeringFingerprint = null,
  isGenerating = false,
  generationError = null,
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
    return { state: WORKFLOW_STATE.OUTDATED, record: anyExport };
  }
  return { state: WORKFLOW_STATE.NOT_CREATED };
}

/**
 * The full workflow status for one version, from stored exports and the
 * Speaker Design in-session generation signal.
 *
 * @returns {{loading: boolean, technicalReport, speakerDesign, proposalAvailable: boolean}}
 */
export function resolveWorkflowStatus({
  exports = [],
  versionId = null,
  engineeringFingerprint = null,
  speakerDesignGenerating = false,
  speakerDesignError = null,
}) {
  const technicalReport = resolveWorkflowStepState({
    exports,
    versionId,
    documentType: TECHNICAL_REPORT_TYPE,
    engineeringFingerprint,
  });
  const speakerDesign = resolveWorkflowStepState({
    exports,
    versionId,
    documentType: SPEAKER_DESIGN_TYPE,
    engineeringFingerprint,
    isGenerating: speakerDesignGenerating,
    generationError: speakerDesignError,
  });
  const proposalAvailable =
    technicalReport.state === WORKFLOW_STATE.READY
    && speakerDesign.state === WORKFLOW_STATE.READY;
  return { technicalReport, speakerDesign, proposalAvailable };
}

/** Whether a project record uses the v2 coordinated workflow. */
export function isV2WorkflowProject(project) {
  return project?.document_workflow === 'v2';
}

export default resolveWorkflowStatus;