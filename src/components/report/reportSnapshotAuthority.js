/**
 * reportSnapshotAuthority.js
 * --------------------------
 * Per-report-type saved report snapshots.
 *
 * ONE saved report per project version and report type — Visual Report,
 * Technical Report, System Design Summary. A report is saved against the project
 * version when it is generated and overwritten in place when it is regenerated.
 * Reopening restores the saved report while the source fingerprints it was
 * generated from still match; when a source input has moved on, the saved report
 * stays visible and is marked as generated before the latest changes, with
 * Regenerate offered. A saved report is never blanked.
 *
 * What a snapshot stores
 *   - the identity of the authority it was generated from (the published
 *     engineering publication key, the bass assessment fingerprint, the
 *     seating-priority fingerprint)
 *   - the report's frozen presentation inputs and the page inventory generated
 *   - generated_at / generated_by / schema version / status
 *
 * What a snapshot never stores
 *   Every engineering value. Each number in the saved report is read back from
 *   the immutable published engineering publication the payload points at, so a
 *   saved report remains a consumer of the ONE engineering authority instead of
 *   becoming a second copy of it.
 *
 * Pure: no React, no network, no recalculation, no re-grading.
 */

export const REPORT_SNAPSHOT_SCHEMA_VERSION = 1;

export const REPORT_SNAPSHOT_TYPE = Object.freeze({
  VISUAL: 'visual',
  TECHNICAL: 'technical',
  SYSTEM_DESIGN_SUMMARY: 'system_design_summary',
});

export const REPORT_SNAPSHOT_STATUS = Object.freeze({
  /** No saved report exists for this project version and report type. */
  NONE: 'none',
  /** The saved report matches the project as it stands. */
  CURRENT: 'current',
  /** The design changed after this report was generated. */
  STALE: 'stale',
});

/**
 * The source inputs a saved report is judged against. Each is compared only when
 * both sides state it — a fingerprint that cannot be read never manufactures
 * staleness.
 */
export const SNAPSHOT_FINGERPRINT_KEYS = Object.freeze([
  'engineeringFingerprint',
  'calculationFingerprint',
  'seatPriorityFingerprint',
]);

const FINGERPRINT_LABEL = {
  engineeringFingerprint: 'The design',
  calculationFingerprint: 'The bass assessment',
  seatPriorityFingerprint: 'The seating priorities',
};

function asText(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Human label for a report type. */
export function reportTypeLabel(reportType) {
  switch (reportType) {
    case REPORT_SNAPSHOT_TYPE.VISUAL: return 'Visual Report';
    case REPORT_SNAPSHOT_TYPE.TECHNICAL: return 'Technical Report';
    case REPORT_SNAPSHOT_TYPE.SYSTEM_DESIGN_SUMMARY: return 'System Design Summary';
    default: return 'Report';
  }
}

/** Normalise a partial fingerprint set into the canonical three-key shape. */
export function buildSourceFingerprints(input = {}) {
  const source = (input && typeof input === 'object') ? input : {};
  return {
    engineeringFingerprint: asText(source.engineeringFingerprint),
    calculationFingerprint: asText(source.calculationFingerprint),
    seatPriorityFingerprint: asText(source.seatPriorityFingerprint),
  };
}

/**
 * Compose the fingerprints describing the project AS IT STANDS NOW, from the
 * published authority plus the live seat-priority indicator. One implementation
 * so every report judges staleness the same way.
 */
export function currentSourceFingerprints({ authoritySnapshot = null, engineeringSummary = null, liveSeatPriorityFingerprint = null } = {}) {
  return buildSourceFingerprints({
    engineeringFingerprint: authoritySnapshot?.engineeringFingerprint || null,
    calculationFingerprint: authoritySnapshot?.calculationFingerprint || null,
    seatPriorityFingerprint:
      asText(liveSeatPriorityFingerprint)
      || asText(engineeringSummary?.seatPriorityFingerprint),
  });
}

/**
 * Compare the fingerprints a saved report was generated from against the ones
 * read now.
 * @returns {{changed: string[], compared: string[]}}
 */
export function compareSourceFingerprints(saved, current) {
  const savedFp = buildSourceFingerprints(saved);
  const currentFp = buildSourceFingerprints(current);
  const changed = [];
  const compared = [];

  for (const key of SNAPSHOT_FINGERPRINT_KEYS) {
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
 * under the current payload generation. A payload from another generation is
 * never rendered as a current report.
 */
export function isSnapshotRestorable(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return false;
  if (Number(snapshot.report_schema_version) !== REPORT_SNAPSHOT_SCHEMA_VERSION) return false;
  const payload = snapshot.payload;
  return !!payload && typeof payload === 'object' && !Array.isArray(payload) && Object.keys(payload).length > 0;
}

/**
 * Resolve the saved report's status against the project as it stands now.
 * @returns {{restorable: boolean, status: string, changedKeys: string[],
 *            generatedAt: string|null, generatedBy: string|null}}
 */
export function resolveSnapshotStatus({ saved = null, currentFingerprints = null } = {}) {
  if (!isSnapshotRestorable(saved)) {
    return {
      restorable: false,
      status: REPORT_SNAPSHOT_STATUS.NONE,
      changedKeys: [],
      generatedAt: null,
      generatedBy: null,
    };
  }

  const { changed } = compareSourceFingerprints(saved.source_fingerprints, currentFingerprints);

  return {
    restorable: true,
    status: changed.length > 0 ? REPORT_SNAPSHOT_STATUS.STALE : REPORT_SNAPSHOT_STATUS.CURRENT,
    changedKeys: changed,
    generatedAt: saved.generated_at || null,
    generatedBy: saved.generated_by || null,
  };
}

/** The one-saved-report key: project version + report type. */
export function snapshotIdentityKey({ projectId, versionId, reportType }) {
  return `${projectId || ''}::${versionId || ''}::${reportType || ''}`;
}

/** Plain-English names for the source inputs that changed. */
export function describeChangedFingerprints(changedKeys) {
  return (Array.isArray(changedKeys) ? changedKeys : [])
    .map((key) => FINGERPRINT_LABEL[key])
    .filter(Boolean);
}

/** One sentence stating what moved on since the report was generated. */
export function buildStaleSentence(changedKeys) {
  const labels = describeChangedFingerprints(changedKeys);
  if (labels.length === 0) {
    return 'This report was generated before the latest changes to this project.';
  }
  if (labels.length === 1) {
    return `${labels[0]} changed after this report was generated.`;
  }
  const head = labels.slice(0, -1).join(', ');
  return `${head} and ${labels[labels.length - 1]} changed after this report was generated.`;
}

/**
 * The report's own payload. Carries the publication it was generated from, the
 * frozen presentation inputs and the page inventory — never an engineering value.
 */
export function buildSnapshotPayload({ engineeringFingerprint = null, presentation = null, pages = null } = {}) {
  const given = (presentation && typeof presentation === 'object') ? presentation : {};
  const subs = Array.isArray(given.subwooferInstances) ? given.subwooferInstances : null;

  return {
    engineeringFingerprint: asText(engineeringFingerprint),
    presentation: {
      showAsdr: given.showAsdr !== false,
      priceData: given.priceData ?? null,
      seatingCount: Array.isArray(given.seatingPositions) ? given.seatingPositions.length : null,
      speakerCount: Array.isArray(given.placedSpeakers) ? given.placedSpeakers.length : null,
      subwooferCount: subs ? subs.filter((sub) => sub && sub.enabled !== false).length : null,
      dolbyLayout: given.dolbyLayout ?? null,
    },
    pages: Array.isArray(pages)
      ? pages
        .map((page) => ({
          id: page?.id ?? null,
          category: page?.category ?? null,
        }))
        .filter((page) => !!page.id)
      : [],
  };
}

/**
 * Build the record written to the database. Always `status: current` at write
 * time — regeneration is what makes a report current again.
 */
export function buildSnapshotRecord({
  projectId,
  versionId,
  accountId,
  reportType,
  sourceFingerprints,
  generatedBy = null,
  payload,
  generatedAt = null,
}) {
  const at = asText(generatedAt) || new Date().toISOString();
  return {
    project_id: projectId || null,
    version_id: versionId || null,
    account_id: accountId || null,
    report_type: reportType || null,
    report_schema_version: REPORT_SNAPSHOT_SCHEMA_VERSION,
    source_fingerprints: buildSourceFingerprints(sourceFingerprints),
    generated_at: at,
    generated_by: asText(generatedBy),
    status: REPORT_SNAPSHOT_STATUS.CURRENT,
    status_reason: null,
    status_updated_at: at,
    payload: (payload && typeof payload === 'object') ? payload : {},
  };
}