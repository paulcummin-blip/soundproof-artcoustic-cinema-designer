/**
 * statusBuckets.js
 * ----------------
 * The canonical commercial status bucket for a project.
 *
 * Project.status is per account: the same project_status value means different
 * things for different dealers, so a raw status id is never used on its own.
 * The account's resolved ProjectStatus label is read first, then the raw id,
 * and anything that cannot be resolved confidently is bucketed as Unclassified
 * and surfaced as a warning. Nothing is silently mapped.
 *
 * Project.lifecycle_status is a separate axis: Archived is an archive state,
 * not a sales status, and it always wins when set.
 *
 * Pure: no React, no side effects.
 */

export const BUCKET = Object.freeze({
  PROSPECTIVE: 'prospective',
  LIVE: 'live',
  COMPLETED: 'completed',
  LOST: 'lost',
  ARCHIVED: 'archived',
  UNCLASSIFIED: 'unclassified',
});

export const STATUS_BUCKETS = Object.freeze([
  { key: BUCKET.PROSPECTIVE, label: 'Prospective / Pending' },
  { key: BUCKET.LIVE, label: 'Live / Open' },
  { key: BUCKET.COMPLETED, label: 'Completed / Won' },
  { key: BUCKET.LOST, label: 'Lost' },
  { key: BUCKET.ARCHIVED, label: 'Archived' },
  { key: BUCKET.UNCLASSIFIED, label: 'Unclassified' },
]);

export const BUCKET_LABEL = Object.freeze(
  STATUS_BUCKETS.reduce((map, bucket) => ({ ...map, [bucket.key]: bucket.label }), {}),
);

/**
 * Keyword → bucket. Deliberately conservative: a status whose wording implies
 * two different outcomes at once (for example "Live or Lost") matches more than
 * one bucket and is therefore Unclassified.
 */
const BUCKET_KEYWORDS = [
  { bucket: BUCKET.PROSPECTIVE, words: ['prospect', 'pending', 'quote', 'quotation', 'enquir', 'inquir', 'lead', 'design stage', 'tender'] },
  { bucket: BUCKET.LIVE, words: ['live', 'open', 'active', 'in progress', 'in-progress', 'ongoing', 'installing', 'on site', 'scheduled'] },
  { bucket: BUCKET.COMPLETED, words: ['completed', 'complete', 'won', 'installed', 'delivered', 'handover', 'signed off', 'closed won'] },
  { bucket: BUCKET.LOST, words: ['lost', 'cancelled', 'canceled', 'declined', 'rejected', 'closed lost', 'dead'] },
  { bucket: BUCKET.ARCHIVED, words: ['archive', 'archived'] },
];

function bucketsFor(text) {
  const haystack = String(text || '').toLowerCase();
  if (!haystack.trim()) return [];
  return BUCKET_KEYWORDS
    .filter((entry) => entry.words.some((word) => haystack.includes(word)))
    .map((entry) => entry.bucket);
}

/**
 * Resolve the canonical bucket for one project.
 *
 * @param {Object} input
 * @param {string|null} input.projectStatus — raw Project.project_status value
 * @param {string|null} input.statusLabel — the account's resolved ProjectStatus label
 * @param {string|null} input.statusGroup — optional status group/provider hint (unused today)
 * @param {string|null} input.lifecycleStatus — Project.lifecycle_status
 * @returns {{ bucket: string, reason: string|null, source: string }}
 */
export function resolveStatusBucket({ projectStatus = null, statusLabel = null, lifecycleStatus = null } = {}) {
  if (String(lifecycleStatus || '') === 'Archived') {
    return { bucket: BUCKET.ARCHIVED, reason: null, source: 'lifecycle_status' };
  }

  // A resolved per-account status label is the account's own wording for the
  // status, so it is read first and is trusted over the raw id.
  const labelMatches = bucketsFor(statusLabel);
  if (labelMatches.length === 1) {
    return { bucket: labelMatches[0], reason: null, source: 'status_label' };
  }

  const idMatches = bucketsFor(projectStatus);
  if (idMatches.length === 1) {
    return { bucket: idMatches[0], reason: null, source: 'status_id' };
  }

  const ambiguous = labelMatches.length > 1 || idMatches.length > 1;
  const raw = statusLabel || projectStatus || '(no status set)';
  return {
    bucket: BUCKET.UNCLASSIFIED,
    reason: ambiguous
      ? `Status "${raw}" matches more than one commercial stage, so it was not mapped.`
      : `Status "${raw}" is not a recognised commercial stage for this account.`,
    source: 'unresolved',
  };
}

/** True when this project must be shown in the Unclassified warning panel. */
export function isUnclassified(bucket) {
  return bucket === BUCKET.UNCLASSIFIED;
}