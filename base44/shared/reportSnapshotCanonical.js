/**
 * reportSnapshotCanonical.js  (server)
 * ------------------------------------
 * The server's copy of the ONE canonical-snapshot rule and the ONE evidence
 * write guard, so the proposal gate selects exactly the saved report the report
 * pages and the readiness table select.
 *
 * Self-contained on purpose: a backend function may import this module only, so
 * the rule cannot drift behind a chain of shared imports. The values are the
 * authority's own generations — REPORT_SNAPSHOT_SCHEMA_VERSION and
 * REPORT_EVIDENCE_VERSION in ./proposalReadinessAuthority.js.
 *
 * Mirror of src/components/report/reportSnapshotCanonical.js.
 */

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
  return evidence.proposal_ready === true ? 'ready' : 'incomplete';
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