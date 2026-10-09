/**
 * Per-version proposal readiness — the PROJECT REPORT is the only report source.
 *
 * Sound Proof has ONE report: the Project Report. It already contains the visual
 * and technical content, P1–P21 evidence, the drawings, the products and the bass
 * evidence, and it carries the reportEvidence a proposal reads. The separate
 * Visual Report and Technical Report are retired as proposal prerequisites: they
 * never satisfy readiness, never block it and are never named here.
 *
 * A version is proposal-ready when its canonical Project Report:
 *   1. exists
 *   2. is Current for the version's current engineering/design authority
 *   3. carries reportEvidence
 *   4. whose evidence is complete
 *   5. is proposal_ready
 *   6. whose parity is valid
 *
 * Client/server vocabulary is kept in sync with
 * base44/shared/proposalReadinessAuthority.js (a test asserts parity).
 *
 * Derivation only: recalculates nothing, generates no report content.
 */

import { validateReportEvidence } from '../../../../shared/reportEvidenceCompleteness.js';

/** The readiness state of one cell, one version or the whole gate. */
export const READINESS_STATE = Object.freeze({
  /** The Project Report is current and proposal-ready. */
  CURRENT: 'current',
  /** A Project Report exists, but the design has changed since it was created. */
  STALE: 'stale',
  /** No Project Report exists for this version. */
  MISSING: 'missing',
  /**
   * A Project Report exists, but its evidence/parity is not proposal-ready.
   * The report is not missing and must never be described as missing.
   */
  INCOMPLETE: 'incomplete',
  /** The saved Project Report could not be read. */
  UNAVAILABLE: 'unavailable',
  CHECKING: 'checking',
});

/** Display text per state — the four user-facing words, and nothing else. */
export const READINESS_STATUS_TEXT = Object.freeze({
  [READINESS_STATE.CURRENT]: 'Current',
  [READINESS_STATE.STALE]: 'Update needed',
  [READINESS_STATE.MISSING]: 'Not generated',
  [READINESS_STATE.INCOMPLETE]: 'Incomplete',
  [READINESS_STATE.UNAVAILABLE]: 'Unavailable',
  [READINESS_STATE.CHECKING]: 'Checking…',
});

/** The ONE report source a proposal is gated on. */
export const READINESS_SOURCE = Object.freeze({
  PROJECT: 'project',
});

/** The report's own name, everywhere readiness states it. */
export const READINESS_REPORT_LABEL = 'Project Report';

/** The one table column. */
export const READINESS_COLUMNS = Object.freeze([
  { key: READINESS_SOURCE.PROJECT, label: READINESS_REPORT_LABEL },
]);

/** Where the Project Report lives, and how it is opened or updated. */
export const PROJECT_REPORT_ROUTE = '/RP22ClientReport';

/** The one action a blocked version offers. */
export const READINESS_ACTION = Object.freeze({
  CREATE_UPDATED_REPORT: 'Create Updated Report',
  CREATE_PROJECT_REPORT: 'Create Project Report',
});

/** The action a blocked state offers: create, or create an updated one. */
export const READINESS_ACTION_BY_STATE = Object.freeze({
  [READINESS_STATE.STALE]: READINESS_ACTION.CREATE_UPDATED_REPORT,
  [READINESS_STATE.INCOMPLETE]: READINESS_ACTION.CREATE_UPDATED_REPORT,
  [READINESS_STATE.UNAVAILABLE]: READINESS_ACTION.CREATE_UPDATED_REPORT,
  [READINESS_STATE.MISSING]: READINESS_ACTION.CREATE_PROJECT_REPORT,
});

/** Panel heading for the readiness table. */
export const PROPOSAL_READINESS_TITLE = 'Version readiness';

/** Shown once every selected version reads Current. */
export const PROPOSAL_READINESS_READY_COPY =
  'Every selected version has its current Project Report. '
  + 'The proposal will be generated from these versions.';

/** The one-line rule, for documentation and tests. */
export const PROPOSAL_READINESS_RULE =
  'Every selected version must have a current Project Report = the proposal can be generated.';

/** The generic blocking clause, when a report state states nothing more exact. */
export const PROPOSAL_READINESS_BLOCK_FALLBACK = 'needs a current Project Report';

/**
 * The published-engineering result states, as read from the version pointer.
 * Kept: the published engineering fingerprint is the authority a saved Project
 * Report is judged against, and the same value the server gate compares.
 */
export const PUBLICATION_STATUS = Object.freeze({
  PUBLISHED: 'published',
  NOT_CALCULATED: 'not_calculated',
  STALE: 'stale',
  READ_FAILED: 'read_failed',
});

/** The reportEvidence payload generation a proposal may read. */
export const REPORT_EVIDENCE_VERSION = 1;

/**
 * Where a version's calculated engineering result was found. Retained so a
 * version with no separate publication still has its bass fingerprint stated:
 *   completed_calculation_authority — the version's own current fingerprint has
 *     a completed result in its analysis cache.
 *   report_source_authority — the fingerprint a saved report was generated from
 *     is still held by the analysis cache.
 */
export const CALCULATION_AUTHORITY_SOURCE = Object.freeze({
  COMPLETED_AUTHORITY: 'completed_calculation_authority',
  REPORT_SOURCE: 'report_source_authority',
});

/** A fingerprint that is present and usable, else null. */
function asFingerprint(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * The version's completed calculation authority, read from its
 * ProjectAnalysisCache record. Pure: it reads the record it is GIVEN and nothing
 * else, so the same record yields the same answer on both sides of the boundary.
 *
 * @returns {{fingerprint, source, completedAt}|null}
 */
export function resolveCalculationAuthority({ cacheRecord = null, savedTechnicalReport = null } = {}) {
  const record = (cacheRecord && typeof cacheRecord === 'object' && !Array.isArray(cacheRecord))
    ? cacheRecord
    : null;
  if (!record) return null;

  const snapshots = (record.completed_by_fingerprint
    && typeof record.completed_by_fingerprint === 'object'
    && !Array.isArray(record.completed_by_fingerprint))
    ? record.completed_by_fingerprint
    : {};

  const foundFor = (fingerprint) => {
    const key = asFingerprint(fingerprint);
    if (!key) return null;
    const entry = snapshots[key];
    return (entry && typeof entry === 'object') ? { fingerprint: key, entry } : null;
  };

  // The result's own completion time, when the record states one.
  const completedAtOf = (entry) => {
    const ms = Number(entry?.job?.completedAtMs);
    if (!Number.isFinite(ms) || ms <= 0) return null;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  };

  const authority = (found, source) => (found
    ? { fingerprint: found.fingerprint, source, completedAt: completedAtOf(found.entry) }
    : null);

  const current = authority(foundFor(record.current_fingerprint), CALCULATION_AUTHORITY_SOURCE.COMPLETED_AUTHORITY);
  if (current) return current;

  const stated = asFingerprint(savedTechnicalReport?.source_fingerprints?.calculationFingerprint);
  return authority(foundFor(stated), CALCULATION_AUTHORITY_SOURCE.REPORT_SOURCE);
}

/**
 * The version name the designer saved — `Level 4 version`, `Original Design` —
 * stated exactly, with no slot suffix.
 */
export function versionDisplayName({ version_name: name = null, version_number: number = null } = {}) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (trimmed) return trimmed;
  return number ? `Version ${number}` : 'Version';
}

/**
 * One Project Report cell's state, from the saved report and the fingerprint
 * comparison the report page itself uses.
 *
 * @returns {string} READINESS_STATE
 */
export function resolveReportCellState({ hasSaved = false, snapshotStatus = null, checking = false, incomplete = false } = {}) {
  if (checking) return READINESS_STATE.CHECKING;
  if (!hasSaved) return READINESS_STATE.MISSING;
  if (snapshotStatus === 'stale') return READINESS_STATE.STALE;
  // The report exists and is current, but the evidence it carries may not be
  // read: its evidence/parity is not proposal-ready, so it is Incomplete.
  if (incomplete) return READINESS_STATE.INCOMPLETE;
  if (snapshotStatus === 'current') return READINESS_STATE.CURRENT;
  // A saved report that cannot be restored is not a usable source.
  return READINESS_STATE.MISSING;
}

/**
 * The proposal evidence a saved report carries, and whether a proposal may read
 * it:
 *   'none'        no evidence stored at all — the Project Report is Incomplete
 *                 for proposal use until it is created again.
 *   'incomplete'  evidence stored, but its parity check failed or it is missing
 *                 required facts.
 *   'ready'       evidence stored and verified against the report itself.
 */
export function resolveEvidenceState(saved) {
  const evidence = saved?.payload?.reportEvidence;
  if (!evidence || typeof evidence !== 'object') return 'none';
  if (Number(evidence.evidence_version) !== REPORT_EVIDENCE_VERSION) return 'none';
  return validateReportEvidence(evidence, saved?.report_type || evidence.report_type).complete ? 'ready' : 'incomplete';
}

/** Whether a saved report carries proposal evidence a proposal may read. */
export function hasProposalEvidence(saved) {
  return resolveEvidenceState(saved) === 'ready';
}

/** A cell: its state, its display text and when it was generated. */
export function buildReadinessCell({ state, generatedAt = null, reason = null }) {
  return {
    state,
    status: READINESS_STATUS_TEXT[state] || READINESS_STATUS_TEXT[READINESS_STATE.MISSING],
    current: state === READINESS_STATE.CURRENT,
    checking: state === READINESS_STATE.CHECKING,
    generatedAt: state === READINESS_STATE.CURRENT ? generatedAt || null : null,
    reason,
  };
}

/** Normalise a partial fingerprint set into the canonical three-key shape. */
export function buildSourceFingerprints(input = {}) {
  const source = (input && typeof input === 'object') ? input : {};
  return {
    engineeringFingerprint: asFingerprint(source.engineeringFingerprint),
    calculationFingerprint: asFingerprint(source.calculationFingerprint),
    seatPriorityFingerprint: asFingerprint(source.seatPriorityFingerprint),
  };
}

/**
 * Compare the fingerprints a saved report was generated from against the ones
 * read now. A fingerprint stated on only one side is never compared, so an
 * unreadable fingerprint never manufactures staleness.
 */
export function compareSourceFingerprints(saved, current) {
  const savedFp = buildSourceFingerprints(saved);
  const currentFp = buildSourceFingerprints(current);
  const changed = [];
  const compared = [];

  for (const key of ['engineeringFingerprint', 'calculationFingerprint', 'seatPriorityFingerprint']) {
    const before = savedFp[key];
    const now = currentFp[key];
    if (!before || !now) continue;
    compared.push(key);
    if (before !== now) changed.push(key);
  }

  return { changed, compared };
}

/**
 * Whether a saved report can be restored: it must carry a payload and be written
 * under the current payload generation.
 */
export function isSavedReportRestorable(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return false;
  if (Number(snapshot.report_schema_version) !== 1) return false;
  const payload = snapshot.payload;
  return !!payload && typeof payload === 'object' && !Array.isArray(payload) && Object.keys(payload).length > 0;
}

/** One saved Project Report → its readiness cell. */
export function resolveSavedReportCell({ saved = null, currentFingerprints = null } = {}) {
  // No saved Project Report for this version: genuinely Not generated.
  if (!isSavedReportRestorable(saved)) {
    return buildReadinessCell({ state: READINESS_STATE.MISSING });
  }
  // A report the project has moved past is Update needed, not merely incomplete.
  if (saved.status && saved.status !== 'current') {
    return buildReadinessCell({ state: READINESS_STATE.STALE, generatedAt: saved.generated_at || null });
  }
  const { changed } = compareSourceFingerprints(saved.source_fingerprints, currentFingerprints);
  if (changed.length > 0) {
    return buildReadinessCell({ state: READINESS_STATE.STALE, generatedAt: saved.generated_at || null });
  }
  // The evidence is stored, but it does not agree with what the report shows —
  // or it is missing required facts, or is absent. The report may not be used by
  // a proposal until it is created again; it is never called missing.
  const evidence = saved.payload?.reportEvidence;
  const completeness = validateReportEvidence(evidence, saved.report_type, {
    projectId: saved.project_id, versionId: saved.version_id,
    snapshotFingerprint: saved.source_fingerprints?.engineeringFingerprint,
    sourceFingerprint: currentFingerprints?.engineeringFingerprint,
  });
  if (completeness.complete && evidence?.proposal_ready === true && saved.payload?.evidence_parity?.proposal_ready !== false) {
    return buildReadinessCell({ state: READINESS_STATE.CURRENT, generatedAt: saved.generated_at || null });
  }
  return buildReadinessCell({
    state: READINESS_STATE.INCOMPLETE,
    generatedAt: saved.generated_at || null,
    reason: 'This Project Report needs to be completed before this version can be used in a proposal.',
  });
}

/**
 * The version's blocking sentence: one short line naming the version and what it
 * needs, in the designer's own words. Never an internal term.
 */
export function buildBlockingSentence({ versionName, project } = {}) {
  if (!project || project.current || project.checking) return null;
  switch (project.state) {
    case READINESS_STATE.MISSING:
      return `${versionName} needs a Project Report.`;
    case READINESS_STATE.STALE:
      return `${versionName} needs an updated Project Report.`;
    case READINESS_STATE.INCOMPLETE:
      return `${versionName}'s Project Report needs to be completed before this version can be used in a proposal.`;
    case READINESS_STATE.UNAVAILABLE:
      return `${versionName}'s Project Report could not be read.`;
    default:
      return `${versionName} ${PROPOSAL_READINESS_BLOCK_FALLBACK}.`;
  }
}

/**
 * The blockers of one version, each carrying its own sentence clause.
 * @returns {Array<{source, state, label, clause, sentence}>}
 */
export function buildVersionBlockers({ versionName, project }) {
  if (!project || project.current || project.checking) return [];
  const sentence = buildBlockingSentence({ versionName, project });
  return [{
    source: READINESS_SOURCE.PROJECT,
    state: project.state,
    label: READINESS_REPORT_LABEL,
    clause: PROPOSAL_READINESS_BLOCK_FALLBACK,
    sentence,
  }];
}

/**
 * One version's readiness row: ONE source, the Project Report.
 *
 * @returns {Object} row — the saved version name, the Project Report cell, the
 *   blocking reason and the sentence.
 */
export function resolveVersionReadinessRow({ versionId, versionName, versionNumber = null, cells = {} }) {
  const project = cells.project || buildReadinessCell({ state: READINESS_STATE.MISSING });
  const blockers = buildVersionBlockers({ versionName, project });
  const checking = project.checking;

  return {
    versionId,
    versionName,
    versionNumber,
    project,
    cells: { project },
    project_report_status: project.status,
    blockers,
    blockingSentence: buildBlockingSentence({ versionName, project }),
    ready: !checking && blockers.length === 0,
    checking,
  };
}

/**
 * The ONE per-version readiness rule, from the version's saved Project Report.
 *
 * @param {Object} params
 * @param {Object|null} params.version              the ProjectVersion record
 * @param {Object|null} params.savedProjectReport   the canonical Project Report snapshot
 * @param {Object|null} params.currentFingerprints  the version's current authority
 * @returns {Object} readiness row
 */
export function resolveVersionReadiness({
  version = null,
  savedProjectReport = null,
  currentFingerprints = null,
} = {}) {
  return resolveVersionReadinessRow({
    versionId: version?.id || null,
    versionName: versionDisplayName(version || {}),
    versionNumber: version?.version_number ?? null,
    cells: {
      project: resolveSavedReportCell({ saved: savedProjectReport, currentFingerprints }),
    },
  });
}

/** The named sentence for the whole gate: one sentence per blocked version. */
export function buildReadinessMessage(rows = []) {
  const sentences = (Array.isArray(rows) ? rows : [])
    .map((row) => row?.blockingSentence)
    .filter(Boolean);
  return sentences.length > 0 ? `${sentences.join(' ')}` : null;
}

/**
 * Resolve the whole gate from the per-version rows.
 *
 * @returns {{available, checking, ready, rows, blockers, message, detail, versionCountValid}}
 */
export function resolveProposalReadinessGate({
  rows = [],
  loading = false,
  minVersions = 1,
  maxVersions = null,
} = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const checking = !!loading || list.some((row) => row.checking);
  const versionCountValid = list.length >= (minVersions || 1)
    && (maxVersions == null || list.length <= maxVersions);
  const blocked = list.filter((row) => !row.ready);
  const ready = !checking && versionCountValid && blocked.length === 0;
  const message = ready || checking ? null : buildReadinessMessage(blocked);

  return {
    available: list.length > 0,
    checking,
    ready,
    rows: list,
    versionCountValid,
    // Every blocked version and what it needs, so the panel and the Generate gate
    // always name the same version and the same missing item.
    blockedVersions: blocked.map((row) => ({
      version_id: row.versionId,
      version_name: row.versionName,
      blockers: row.blockers.map((blocker) => ({
        source: blocker.source,
        state: blocker.state,
        label: blocker.label,
      })),
      reason: row.blockingSentence,
    })),
    blockers: blocked.flatMap((row) => row.blockers),
    // While the read is in flight nothing is missing: the table says Checking and
    // no blocking sentence is shown, because none is known yet.
    message: ready || checking ? null : message,
    detail: ready
      ? PROPOSAL_READINESS_READY_COPY
      : checking
        ? 'Checking each selected version’s Project Report…'
        : 'Create the Project Report named above for that version, then return to this step.',
  };
}

/**
 * The one action a blocked version offers: the Project Report route for that
 * project and version. An updated report is requested for a report the design
 * has moved past or that needs completing.
 */
export function buildProjectReportAction({ state = null, projectId = null, versionId = null } = {}) {
  const label = READINESS_ACTION_BY_STATE[state] || null;
  if (!label) return null;
  const params = new URLSearchParams();
  if (projectId) params.set('projectId', projectId);
  if (versionId) params.set('versionId', versionId);
  if (state !== READINESS_STATE.MISSING) params.set('updateReport', '1');
  const query = params.toString();
  return {
    label,
    url: query ? `${PROJECT_REPORT_ROUTE}?${query}` : PROJECT_REPORT_ROUTE,
  };
}

export default resolveProposalReadinessGate;