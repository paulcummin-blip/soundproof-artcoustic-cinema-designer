/**
 * proposalReadinessAuthority.js
 * -----------------------------
 * THE shared per-version proposal readiness authority.
 *
 * A System Design Comparison is built from EVERY selected version, so its
 * readiness must be decided per version — never from the first selected version
 * alone, and never from one report of one version.
 *
 * Per version it states four things:
 *   Visual Report        saved report for project + version + report type
 *   Technical Report     saved report for project + version + report type
 *   Engineering Authority  the version's published engineering result
 *   the blocking reason, naming the version and the source that blocks
 *
 * The report cells are judged by the SAME fingerprint comparison the report
 * pages use (reportSnapshotAuthority), so this gate and a report's own Current
 * badge can never disagree.
 *
 * States per cell: Current / Stale / Missing / Incomplete / Unavailable /
 * Checking. A read still in flight is Checking — it is never reported as
 * Missing, and the fixed generic sentence is never used to describe it.
 *
 * Derivation only: recalculates nothing, generates no report content, reads no
 * entity. Pure — no React, no side effects, no runtime APIs.
 */

import { PROPOSAL_SOURCE_REQUIRED_MESSAGE } from '@/components/proposal/sourceAuthority/proposalSourceAuthority';

/** The readiness state of one cell, one version or the whole gate. */
export const READINESS_STATE = Object.freeze({
  CURRENT: 'current',
  STALE: 'stale',
  MISSING: 'missing',
  INCOMPLETE: 'incomplete',
  UNAVAILABLE: 'unavailable',
  CHECKING: 'checking',
});

/** Display text per state. */
export const READINESS_STATUS_TEXT = Object.freeze({
  [READINESS_STATE.CURRENT]: 'Current',
  [READINESS_STATE.STALE]: 'Stale',
  [READINESS_STATE.MISSING]: 'Missing',
  [READINESS_STATE.INCOMPLETE]: 'Incomplete',
  [READINESS_STATE.UNAVAILABLE]: 'Unavailable',
  [READINESS_STATE.CHECKING]: 'Checking…',
});

/** The three columns of the readiness table. */
export const READINESS_SOURCE = Object.freeze({
  VISUAL: 'visual',
  TECHNICAL: 'technical',
  ENGINEERING: 'engineering',
});

/** Column headings, in table order. */
export const READINESS_COLUMNS = Object.freeze([
  { key: READINESS_SOURCE.VISUAL, label: 'Visual Report' },
  { key: READINESS_SOURCE.TECHNICAL, label: 'Technical Report' },
  { key: READINESS_SOURCE.ENGINEERING, label: 'Engineering Authority' },
]);

/**
 * The clause every blocking sentence is built from. Mirrored verbatim in
 * base44/functions/generateProposal/entry.ts (the frontend cannot import from
 * base44/, so the wording lives in both places and a test asserts parity).
 */
export const READINESS_CLAUSE = Object.freeze({
  [READINESS_STATE.MISSING]: 'is missing {label}',
  [READINESS_STATE.STALE]: 'has stale {label}',
  [READINESS_STATE.INCOMPLETE]: 'has incomplete {label}',
  [READINESS_STATE.UNAVAILABLE]: 'has unreadable {label}',
});

/** Panel heading for the readiness table. */
export const PROPOSAL_READINESS_TITLE = 'Version readiness';

/** Shown once every selected version reads Current. */
export const PROPOSAL_READINESS_READY_COPY =
  'Every selected version has its current reports and engineering results. '
  + 'The proposal will be generated from these versions.';

/** The one-line rule, for documentation and tests. */
export const PROPOSAL_READINESS_RULE =
  'Every selected version must have current reports and engineering results = the proposal can be generated.';

/**
 * Blocking labels per source and state. The engineering column states what the
 * version is actually missing rather than a generic "engineering authority".
 */
export function blockerLabel({ source, state }) {
  if (source === READINESS_SOURCE.VISUAL) return 'Visual Report';
  if (source === READINESS_SOURCE.TECHNICAL) return 'Technical Report';
  if (state === READINESS_STATE.STALE) return 'bass authority';
  if (state === READINESS_STATE.INCOMPLETE) return 'engineering results';
  if (state === READINESS_STATE.MISSING) return 'calculated engineering result';
  return 'engineering authority';
}

/** `Original Design · V1` — the name the version is known by, plus its slot. */
export function versionDisplayName({ version_name: name = null, version_number: number = null } = {}) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (trimmed && number) return `${trimmed} · V${number}`;
  if (trimmed) return trimmed;
  return number ? `Version ${number}` : 'Version';
}

/**
 * One report cell's state, from the saved report and the fingerprint
 * comparison the report page itself uses.
 *
 * @param {Object} params
 * @param {boolean} params.hasSaved        a saved report exists for this version
 * @param {string|null} params.snapshotStatus 'current' | 'stale' | 'none'
 * @param {boolean} [params.checking]
 * @returns {string} READINESS_STATE
 */
export function resolveReportCellState({ hasSaved = false, snapshotStatus = null, checking = false } = {}) {
  if (checking) return READINESS_STATE.CHECKING;
  if (!hasSaved) return READINESS_STATE.MISSING;
  if (snapshotStatus === 'stale') return READINESS_STATE.STALE;
  if (snapshotStatus === 'current') return READINESS_STATE.CURRENT;
  // A saved report that cannot be restored is not a usable source.
  return READINESS_STATE.MISSING;
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

/**
 * The blockers of one version, each carrying its own sentence clause.
 *
 * @returns {Array<{source, state, label, clause, sentence}>}
 */
export function buildVersionBlockers({ versionName, visual, technical, engineering }) {
  const blockers = [];
  const push = (source, cell) => {
    if (!cell || cell.current || cell.checking) return;
    const label = blockerLabel({ source, state: cell.state });
    const clause = (READINESS_CLAUSE[cell.state] || READINESS_CLAUSE[READINESS_STATE.MISSING])
      .replace('{label}', label);
    blockers.push({
      source,
      state: cell.state,
      label,
      clause,
      sentence: `${versionName} ${clause}`,
    });
  };

  push(READINESS_SOURCE.VISUAL, visual);
  push(READINESS_SOURCE.TECHNICAL, technical);
  push(READINESS_SOURCE.ENGINEERING, engineering);
  return blockers;
}

/**
 * One version's readiness row.
 *
 * @param {Object} params
 * @param {string} params.versionId
 * @param {string} params.versionName
 * @param {Object} params.cells  — { visual, technical, engineering } readiness cells
 * @returns {Object} row
 */
export function resolveVersionReadinessRow({ versionId, versionName, versionNumber = null, cells = {} }) {
  const visual = cells.visual || buildReadinessCell({ state: READINESS_STATE.MISSING });
  const technical = cells.technical || buildReadinessCell({ state: READINESS_STATE.MISSING });
  const engineering = cells.engineering || buildReadinessCell({ state: READINESS_STATE.MISSING });
  const blockers = buildVersionBlockers({ versionName, visual, technical, engineering });
  const checking = visual.checking || technical.checking || engineering.checking;

  return {
    versionId,
    versionName,
    versionNumber,
    visual,
    technical,
    engineering,
    cells: { visual, technical, engineering },
    blockers,
    blockingSentence: blockers.length > 0
      ? `${versionName} ${blockers.map((blocker) => blocker.clause).join(' and ')}`
      : null,
    ready: !checking && blockers.length === 0,
    checking,
  };
}

/** The named sentence for the whole gate: one sentence per blocked version. */
export function buildReadinessMessage(rows = []) {
  const sentences = (Array.isArray(rows) ? rows : [])
    .map((row) => row?.blockingSentence)
    .filter(Boolean);
  return sentences.length > 0 ? sentences.join('. ') : null;
}

/**
 * Resolve the whole gate from the per-version rows.
 *
 * @param {Object} params
 * @param {Array} params.rows
 * @param {boolean} [params.loading]     the readiness read is in flight
 * @param {number} [params.minVersions]  versions required by the report type
 * @param {number|null} [params.maxVersions]
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
  const message = buildReadinessMessage(blocked);

  return {
    available: list.length > 0,
    checking,
    ready,
    rows: list,
    versionCountValid,
    blockers: blocked.flatMap((row) => row.blockers),
    // While the read is in flight nothing is missing: the table says Checking
    // and no blocking sentence is shown, because none is known yet.
    message: ready || checking ? null : (message || PROPOSAL_SOURCE_REQUIRED_MESSAGE),
    detail: ready
      ? PROPOSAL_READINESS_READY_COPY
      : checking
        ? 'Checking each selected version’s reports and engineering results…'
        : 'Generate the named reports for the blocked versions, then return to this step.',
  };
}

export default resolveProposalReadinessGate;