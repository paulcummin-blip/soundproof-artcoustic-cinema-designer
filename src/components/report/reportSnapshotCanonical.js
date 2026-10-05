/**
 * reportSnapshotCanonical.js
 * --------------------------
 * The ONE canonical-snapshot rule and the ONE evidence write guard.
 *
 * A saved report is a permanent artefact for a project version and report type:
 * a newer duplicate row written without evidence must never displace an older
 * row that carries complete evidence, and complete evidence must never be
 * overwritten by an incomplete payload.
 *
 * Pure: no storage, no React, and no fingerprint comparison. Whether the chosen
 * report is Current or Stale is decided afterwards, from fingerprints, by the
 * shared readiness authority — selection itself never consults the live design,
 * so a report can never be selected or rejected because the project was opened.
 *
 * Mirrored for the server gate in base44/shared/reportSnapshotCanonical.js.
 */

// Payload and evidence generations, read from the payload itself. The values are
// the authority's own generations — REPORT_SNAPSHOT_SCHEMA_VERSION and
// REPORT_EVIDENCE_VERSION in reportSnapshotAuthority / proposalReadinessAuthority.
import { validateReportEvidence } from '../../../base44/shared/reportEvidenceCompleteness.js';

const SNAPSHOT_SCHEMA_VERSION = 1;
const EVIDENCE_VERSION = 1;

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
 * How usable a row is as THE saved report for its version and report type.
 * 2 = carries complete proposal evidence, 1 = readable but not proposal-ready,
 * 0 = not a saved report. Higher wins.
 */
export function rankReportSnapshot(row) {
  if (!isUsableReportRow(row)) return 0;
  return reportRowEvidenceState(row) === 'ready' ? 2 : 1;
}

function generatedAtMs(row) {
  const ms = Date.parse(row?.generated_at || '');
  if (Number.isFinite(ms)) return ms;
  const created = Date.parse(row?.created_date || '');
  return Number.isFinite(created) ? created : 0;
}

/** The better of two rows: rank first, then newest. */
function bestOf(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  const rankDifference = rankReportSnapshot(b) - rankReportSnapshot(a);
  if (rankDifference !== 0) return rankDifference > 0 ? b : a;
  return generatedAtMs(b) > generatedAtMs(a) ? b : a;
}

/**
 * The canonical saved report for one version and report type. Rank first, then
 * newest generated_at — so a newer duplicate without evidence never displaces an
 * older complete row.
 */
export function selectCanonicalReportSnapshot(rows, { reportType = null } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  return list.reduce((canonical, row) => {
    if (!row || (reportType && row.report_type !== reportType)) return canonical;
    return bestOf(canonical, row);
  }, null);
}

/** The canonical row per `${version_id}::${report_type}`. */
export function selectCanonicalReportSnapshotsByKey(rows) {
  const byKey = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    if (!row?.version_id || !row?.report_type) return;
    const key = `${row.version_id}::${row.report_type}`;
    byKey.set(key, bestOf(byKey.get(key) || null, row));
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
 * @returns {{evidence, preserved, rejectedReason, existingReady, incomingReady}}
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
      rejectedReason: existingEvidence ? 'no-incoming-evidence' : null,
      existingReady,
      incomingReady: false,
    };
  }
  if (existingReady && !incomingReady) {
    return {
      evidence: existingEvidence,
      preserved: true,
      rejectedReason: 'incomplete-incoming-evidence',
      existingReady,
      incomingReady,
    };
  }
  return { evidence: incomingEvidence, preserved: false, rejectedReason: null, existingReady, incomingReady };
}