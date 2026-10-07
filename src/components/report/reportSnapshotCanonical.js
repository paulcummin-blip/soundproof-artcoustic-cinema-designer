/**
 * reportSnapshotCanonical.js
 * --------------------------
 * The ONE canonical-snapshot rule and the ONE evidence write guard.
 *
 * A saved report is a permanent artefact for a project version and report type.
 * Deciding WHICH saved row is that report is one rule, applied by every consumer
 * — the report pages, the Project Library, the version switcher, the Proposal
 * Centre readiness read and the server proposal gate — so no two surfaces can
 * resolve different rows:
 *
 *   1. carries complete evidence
 *   2. is proposal-ready
 *   3. was frozen against the authority the version holds NOW
 *   4. passed parity
 *   5. and only then, the newest generated_at / updated_date
 *
 * A newer duplicate that is stale or incomplete therefore never displaces the
 * valid Current report. That is the point of the order, not a side effect.
 *
 * Pure: no storage, no React and no status derivation. Whether the chosen report
 * is Current or Stale is decided afterwards, from fingerprints, by the shared
 * readiness authority — selection itself never consults the live design, so a
 * report can never be selected or rejected because the project was opened.
 *
 * Mirror of base44/shared/reportSnapshotCanonical.js (the server half). The two
 * halves are one rule: test/report-canonical-selection.test.mjs runs the same
 * cases through both and refuses any divergence.
 */

// Payload and evidence generations, read from the payload itself. The values are
// the authority's own generations — REPORT_SNAPSHOT_SCHEMA_VERSION and
// REPORT_EVIDENCE_VERSION in reportSnapshotAuthority / proposalReadinessAuthority.
import { validateReportEvidence } from '../../../shared/reportEvidenceCompleteness.js';

const SNAPSHOT_SCHEMA_VERSION = 1;
const EVIDENCE_VERSION = 1;

function asFingerprint(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** A row that can be read as a saved report at all. */
export function isUsableReportRow(row) {
  if (!row || typeof row !== 'object') return false;
  if (Number(row.report_schema_version) !== SNAPSHOT_SCHEMA_VERSION) return false;
  const payload = row.payload;
  return !!payload && typeof payload === 'object' && !Array.isArray(payload)
    && Object.keys(payload).length > 0;
}

/** The evidence state a saved row carries: 'none', 'incomplete' or 'ready'. */
export function reportRowEvidenceState(row) {
  const evidence = row?.payload?.reportEvidence;
  if (!evidence || typeof evidence !== 'object') return 'none';
  if (Number(evidence.evidence_version) !== EVIDENCE_VERSION) return 'none';
  return validateReportEvidence(evidence, row?.report_type || evidence.report_type).complete ? 'ready' : 'incomplete';
}

/**
 * The fingerprint a caller holds as CURRENT — either the fingerprint itself or
 * the authority object that states it (the durable publication key).
 * Unreadable on either side is never a match.
 */
export function currentAuthorityFingerprint(value) {
  if (!value) return null;
  if (typeof value === 'string') return asFingerprint(value);
  return asFingerprint(value.engineeringFingerprint ?? value.engineering_fingerprint);
}

/** The authority a saved row was frozen against. */
export function frozenAuthorityFingerprint(row) {
  return asFingerprint(row?.source_fingerprints?.engineeringFingerprint)
    || asFingerprint(row?.payload?.reportEvidence?.identity?.source_fingerprint);
}

/** Whether a saved row was frozen against the authority the version holds now. */
export function matchesCurrentAuthority(row, currentFingerprint) {
  const current = currentAuthorityFingerprint(currentFingerprint);
  const frozen = frozenAuthorityFingerprint(row);
  if (!current || !frozen) return false;
  return current === frozen;
}

/**
 * Everything selection reads from one row. Computed once per row object — the
 * rows are immutable snapshots as the database returned them — so selecting
 * across a page of duplicates never re-validates the same row.
 *
 * parity: 2 = passed, 1 = not stated (never disqualifying), 0 = stated failed.
 */
const STANDING = new WeakMap();

function computeStanding(row) {
  if (!isUsableReportRow(row)) return null;
  const evidence = row?.payload?.reportEvidence;
  const validation = (evidence && typeof evidence === 'object'
    && Number(evidence.evidence_version) === EVIDENCE_VERSION)
    ? validateReportEvidence(evidence, row?.report_type || evidence.report_type, { requireProposalReady: false })
    : { complete: false };
  const parity = row?.payload?.evidence_parity;
  return {
    complete: validation.complete === true,
    proposalReady: evidence?.proposal_ready === true,
    parity: !parity || typeof parity !== 'object' ? 1 : (parity.proposal_ready === true ? 2 : 0),
  };
}

function rowStanding(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  if (STANDING.has(row)) return STANDING.get(row);
  const standing = computeStanding(row);
  STANDING.set(row, standing);
  return standing;
}

/**
 * How usable a row is as THE saved report, coarsely:
 * 2 = carries complete proposal evidence, 1 = readable but not proposal-ready,
 * 0 = not a saved report. The full order lives in compareReportSnapshots.
 */
export function rankReportSnapshot(row) {
  const standing = rowStanding(row);
  if (!standing) return 0;
  return (standing.complete && standing.proposalReady) ? 2 : 1;
}

function generatedAtMs(row) {
  for (const value of [row?.generated_at, row?.updated_date, row?.created_date]) {
    const ms = Date.parse(value || '');
    if (Number.isFinite(ms)) return ms;
  }
  return 0;
}

/**
 * The selection order, in one place.
 *
 * @returns {number} 1 when the first row is preferred, -1 when the second is,
 *   0 when the two are equal and the newest decides.
 */
export function compareReportSnapshots(first, second, { currentFingerprint = null } = {}) {
  const a = rowStanding(first);
  const b = rowStanding(second);
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;
  if (a.complete !== b.complete) return a.complete ? 1 : -1;
  if (a.proposalReady !== b.proposalReady) return a.proposalReady ? 1 : -1;
  const matchesA = matchesCurrentAuthority(first, currentFingerprint);
  const matchesB = matchesCurrentAuthority(second, currentFingerprint);
  if (matchesA !== matchesB) return matchesA ? 1 : -1;
  if (a.parity !== b.parity) return a.parity > b.parity ? 1 : -1;
  return 0;
}

/** The better of two rows: the order above, then newest. */
function bestOf(a, b, currentFingerprint = null) {
  if (!a) return b || null;
  if (!b) return a;
  const preferred = compareReportSnapshots(a, b, { currentFingerprint });
  if (preferred > 0) return a;
  if (preferred < 0) return b;
  return generatedAtMs(b) > generatedAtMs(a) ? b : a;
}

/**
 * The canonical saved report for one version and report type.
 *
 * @param {Array<Object>} rows saved reports of that version and type
 * @param {Object} [options]
 * @param {string|null} [options.reportType] restrict to one report type
 * @param {string|Object|null} [options.currentFingerprint] the authority the
 *   version holds now. Given it, a row frozen against that authority outranks
 *   any row that is not; omitted, the rule degrades to completeness, parity and
 *   newest rather than inventing a Current row.
 */
export function selectCanonicalReportSnapshot(rows, { reportType = null, currentFingerprint = null } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  return list.reduce((canonical, row) => {
    if (!row || (reportType && row.report_type !== reportType)) return canonical;
    return bestOf(canonical, row, currentFingerprint);
  }, null);
}

/** The current fingerprint held for one version id, from a Map or a plain object. */
function fingerprintFor(byVersion, versionId) {
  if (!byVersion || !versionId) return null;
  if (typeof byVersion.get === 'function') return byVersion.get(versionId) ?? null;
  return byVersion[versionId] ?? null;
}

/**
 * The canonical row per `${version_id}::${report_type}`.
 *
 * @param {Array<Object>} rows saved reports, any version
 * @param {Object} [options]
 * @param {Map|Object|null} [options.currentFingerprintByVersion] each version's
 *   current authority fingerprint, keyed by version id.
 */
export function selectCanonicalReportSnapshotsByKey(rows, { currentFingerprintByVersion = null } = {}) {
  const byKey = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    if (!row?.version_id || !row?.report_type) return;
    const key = `${row.version_id}::${row.report_type}`;
    byKey.set(
      key,
      bestOf(byKey.get(key) || null, row, fingerprintFor(currentFingerprintByVersion, row.version_id)),
    );
  });
  return byKey;
}

/**
 * The evidence a save is allowed to write — upgrade-only.
 *
 *   nothing incoming        → keep what the row already carries (never cleared)
 *   complete → incomplete   → the saved complete evidence is kept, and the
 *                             attempted incomplete write is reported
 *   anything else           → the incoming evidence is written
 *
 * `rejected` is what the write boundary acts on: a rejected candidate is not
 * written AT ALL, so a refusal can never leave old evidence beside a new report
 * identity. See reportSnapshotStore.saveReportSnapshot.
 *
 * @returns {{evidence, preserved, rejected, rejectedReason, existingReady, incomingReady}}
 */
export function resolveEvidenceWrite({ existing = null, incoming = null } = {}) {
  const existingEvidence = existing?.payload?.reportEvidence ?? null;
  const incomingEvidence = (incoming && typeof incoming === 'object') ? incoming : null;
  const existingReady = reportRowEvidenceState(existing) === 'ready';
  const incomingReady = !!incomingEvidence
    && validateReportEvidence(incomingEvidence, incomingEvidence.report_type).complete;

  if (!incomingEvidence) {
    return {
      evidence: existingEvidence,
      preserved: !!existingEvidence,
      rejected: !!existingEvidence,
      rejectedReason: existingEvidence ? 'no-incoming-evidence' : null,
      existingReady,
      incomingReady: false,
    };
  }
  if (existingReady && !incomingReady) {
    return {
      evidence: existingEvidence,
      preserved: true,
      rejected: true,
      rejectedReason: 'incomplete-incoming-evidence',
      existingReady,
      incomingReady,
    };
  }
  return {
    evidence: incomingEvidence,
    preserved: false,
    rejected: false,
    rejectedReason: null,
    existingReady,
    incomingReady,
  };
}