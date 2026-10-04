/**
 * proposalSourceState.js
 * ----------------------
 * The saved-proposal source state: does this proposal still match the project
 * as it stands?
 *
 * A generated proposal is never silently rewritten. When a version it was built
 * from has moved on (a newer engineering publication exists, or its reports are
 * no longer saved against the version), the proposal is marked Source changed
 * and the version that moved is named.
 *
 * Judged from data already loaded for the library:
 *   - the saved report per project version and report type (ReportSnapshot)
 *   - the version's current published engineering pointer
 *     (ProjectVersion.published_fingerprint — the publication key the saved
 *     report's engineering fingerprint is written against)
 *
 * Derivation only: no reads, no recalculation, no writes. Pure.
 */

export const PROPOSAL_LIBRARY_SOURCE_STATE = Object.freeze({
  CURRENT: 'current',
  SOURCE_CHANGED: 'source_changed',
  MISSING_SOURCE: 'missing_source',
});

export const PROPOSAL_LIBRARY_SOURCE_LABEL = Object.freeze({
  [PROPOSAL_LIBRARY_SOURCE_STATE.CURRENT]: 'Current',
  [PROPOSAL_LIBRARY_SOURCE_STATE.SOURCE_CHANGED]: 'Source changed',
  [PROPOSAL_LIBRARY_SOURCE_STATE.MISSING_SOURCE]: 'Missing source',
});

const REPORT_TYPES = ['visual', 'technical'];

/** The version ids a proposal was built from, oldest field first. */
export function proposalVersionIds(proposal) {
  if (!proposal) return [];
  const selected = Array.isArray(proposal.selected_version_ids) ? proposal.selected_version_ids : [];
  if (selected.length > 0) return selected.filter(Boolean);
  return proposal.version_id ? [proposal.version_id] : [];
}

/**
 * One version's source state.
 *
 * @param {Object} params
 * @param {Object|null} params.version     — ProjectVersion record
 * @param {Object} params.savedReports     — { visual, technical } saved reports or null
 * @param {string} params.versionName
 */
export function resolveVersionSourceState({ version = null, savedReports = {}, versionName = 'Version' }) {
  const missingReports = REPORT_TYPES.filter((type) => !savedReports?.[type]);
  if (missingReports.length > 0) {
    return {
      state: PROPOSAL_LIBRARY_SOURCE_STATE.MISSING_SOURCE,
      reason: `${versionName} has no saved ${missingReports.map((type) => (type === 'visual' ? 'Visual' : 'Technical')).join(' and ')} Report`,
    };
  }

  const pointer = String(version?.published_fingerprint || '').trim();
  if (!pointer) {
    return {
      state: PROPOSAL_LIBRARY_SOURCE_STATE.SOURCE_CHANGED,
      reason: `${versionName} has no current published engineering result`,
    };
  }

  const changed = REPORT_TYPES.filter((type) => {
    const savedFingerprint = savedReports[type]?.source_fingerprints?.engineeringFingerprint || null;
    return savedFingerprint && savedFingerprint !== pointer;
  });

  if (changed.length > 0) {
    return {
      state: PROPOSAL_LIBRARY_SOURCE_STATE.SOURCE_CHANGED,
      reason: `${versionName} was regenerated after this proposal`,
    };
  }

  return { state: PROPOSAL_LIBRARY_SOURCE_STATE.CURRENT, reason: null };
}

/**
 * The whole proposal's source state, per selected version.
 *
 * @param {Object} params
 * @param {Object} params.proposal
 * @param {Map<string, Object>} params.versionsById
 * @param {Map<string, Object>} params.savedReportsByVersionId — { visual, technical } per version
 * @returns {{state, label, versionStates, changedVersionNames, missingVersionNames, reason}}
 */
export function resolveProposalSourceState({ proposal, versionsById = new Map(), savedReportsByVersionId = new Map() } = {}) {
  const versionIds = proposalVersionIds(proposal);
  const versionStates = versionIds.map((versionId, index) => {
    const version = versionsById.get(versionId) || null;
    const number = version?.version_number ?? index + 1;
    const name = version?.version_name ? `${version.version_name} · V${number}` : `Version ${number}`;
    const versionState = resolveVersionSourceState({
      version,
      savedReports: savedReportsByVersionId.get(versionId) || {},
      versionName: name,
    });
    return { versionId, versionName: name, ...versionState };
  });

  const missingVersionNames = versionStates
    .filter((entry) => entry.state === PROPOSAL_LIBRARY_SOURCE_STATE.MISSING_SOURCE)
    .map((entry) => entry.versionName);
  const changedVersionNames = versionStates
    .filter((entry) => entry.state === PROPOSAL_LIBRARY_SOURCE_STATE.SOURCE_CHANGED)
    .map((entry) => entry.versionName);

  const state = missingVersionNames.length > 0
    ? PROPOSAL_LIBRARY_SOURCE_STATE.MISSING_SOURCE
    : changedVersionNames.length > 0
      ? PROPOSAL_LIBRARY_SOURCE_STATE.SOURCE_CHANGED
      : PROPOSAL_LIBRARY_SOURCE_STATE.CURRENT;

  const reason = state === PROPOSAL_LIBRARY_SOURCE_STATE.MISSING_SOURCE
    ? versionStates.find((entry) => entry.state === state)?.reason || null
    : state === PROPOSAL_LIBRARY_SOURCE_STATE.SOURCE_CHANGED
      ? versionStates.find((entry) => entry.state === state)?.reason || null
      : null;

  return {
    state,
    label: PROPOSAL_LIBRARY_SOURCE_LABEL[state],
    reason,
    versionStates,
    changedVersionNames,
    missingVersionNames,
  };
}

export default resolveProposalSourceState;