/**
 * statusInclusion.js
 * ------------------
 * Which resolved project statuses count towards the Artcoustic forecast.
 *
 * The forecast covers open work and leaves out what is already decided. Statuses
 * are per account and dealers create their own, so nothing here is tied to a
 * status id: the statuses actually present in the loaded projects are enumerated,
 * each one gets a default from its own label and canonical bucket, and the admin
 * can override any of them.
 *
 * Decided wording wins over the canonical bucket, because the dealer's own label
 * is the account's truth. A status nobody has classified is included and flagged
 * for review rather than silently dropped.
 *
 * Pure: no React, no side effects, no entity access.
 */

import { BUCKET, BUCKET_LABEL } from './statusBuckets';
import { safeArray, text } from './reportingUtils';
import { tradeValueOf } from './artcousticForecast';

/** A status whose own wording says the work is already decided. */
export const STATUS_EXCLUDED_TERMS = [
  'won',
  'completed',
  'complete',
  'sold',
  'ordered',
  'closed won',
  'lost',
  'cancelled',
  'canceled',
  'dead',
  'closed lost',
];

/** A status whose own wording says the work is still open. */
export const STATUS_INCLUDED_TERMS = [
  'prospective',
  'prospect',
  'pending',
  'live',
  'open',
  'active',
  'design',
  'proposal',
  'sent to dealer',
  'quote',
  'quoted',
  'follow up',
  'in progress',
];

/** Buckets that are decided or retired, so they are out of the forecast by default. */
const BUCKET_EXCLUDED = [BUCKET.COMPLETED, BUCKET.LOST, BUCKET.ARCHIVED];

/** Buckets that are open work, so they are in the forecast by default. */
const BUCKET_INCLUDED = [BUCKET.PROSPECTIVE, BUCKET.LIVE];

export const STATUS_REVIEW_PILL = 'Review status';
export const STATUS_NOT_IN_FORECAST_PILL = 'Excluded: status not in forecast';

/** The status the forecast groups a project by: the raw status id where there is one. */
export function statusKeyOf(family) {
  return text(family?.rawStatusId) || text(family?.rawStatusLabel) || '(no status set)';
}

/** The label the admin recognises for that status. */
export function statusLabelOf(family) {
  return text(family?.rawStatusLabel) || text(family?.rawStatusId) || '(no status set)';
}

const matchedTerm = (haystack, terms) => terms.find((term) => haystack.includes(term)) || null;

/**
 * The default inclusion for one status, and why.
 *
 * @returns {{ included: boolean, source: string, term: string|null, review: boolean }}
 */
export function defaultStatusInclusion({ key = '', label = '', bucket = BUCKET.UNCLASSIFIED } = {}) {
  const haystack = `${text(label)} ${text(key)}`.toLowerCase();
  const excludedTerm = matchedTerm(haystack, STATUS_EXCLUDED_TERMS);
  const includedTerm = matchedTerm(haystack, STATUS_INCLUDED_TERMS);

  if (excludedTerm && includedTerm) {
    return { included: false, source: 'ambiguous label', term: excludedTerm, review: true };
  }
  if (excludedTerm) return { included: false, source: 'label', term: excludedTerm, review: false };
  if (includedTerm) return { included: true, source: 'label', term: includedTerm, review: false };

  if (BUCKET_EXCLUDED.includes(bucket)) {
    return { included: false, source: 'status bucket', term: BUCKET_LABEL[bucket] || bucket, review: false };
  }
  if (BUCKET_INCLUDED.includes(bucket)) {
    return { included: true, source: 'status bucket', term: BUCKET_LABEL[bucket] || bucket, review: false };
  }

  // An unclassified or dealer-invented status: included, and flagged for review.
  return { included: true, source: 'unclassified', term: null, review: true };
}

/**
 * One row per resolved status present in the loaded projects, with the project
 * count and the Artcoustic retail and trade value behind it. The values come from
 * the same catalogue pass Product Demand reads, so a status total and the demand
 * total cannot disagree.
 *
 * @param {Array} families — selected project families (inclusion applied)
 * @param {Object} preferences — { [statusKey]: boolean } admin overrides
 * @param {Object} [options]
 * @param {Map} [options.retailByProjectId] — Artcoustic retail per project
 */
export function buildStatusRows(families = [], preferences = {}, { retailByProjectId = null } = {}) {
  const groups = new Map();

  for (const family of safeArray(families)) {
    const key = statusKeyOf(family);
    const entry = groups.get(key) || {
      key,
      label: statusLabelOf(family),
      bucket: family?.bucket || BUCKET.UNCLASSIFIED,
      projectIds: [],
    };
    entry.projectIds.push(family?.id);
    groups.set(key, entry);
  }

  const rows = [...groups.values()].map((entry) => {
    const fallback = defaultStatusInclusion(entry);
    const override = preferences?.[entry.key];
    const included = typeof override === 'boolean' ? override : fallback.included;
    const retailValues = entry.projectIds
      .map((projectId) => retailByProjectId?.get?.(projectId) ?? null)
      .filter((value) => value !== null && value !== undefined);
    const retail = retailValues.length > 0
      ? retailValues.reduce((sum, value) => sum + Number(value), 0)
      : null;

    return {
      key: entry.key,
      label: entry.label,
      bucket: entry.bucket,
      bucketLabel: BUCKET_LABEL[entry.bucket] || entry.bucket || 'Unclassified',
      count: entry.projectIds.length,
      projectIds: entry.projectIds,
      included,
      defaultIncluded: fallback.included,
      defaultSource: fallback.source,
      overridden: typeof override === 'boolean',
      review: fallback.review,
      retail,
      trade: retail === null ? null : tradeValueOf(retail),
    };
  });

  return rows.sort((a, b) => (
    Number(b.included) - Number(a.included)
    || b.count - a.count
    || String(a.label).localeCompare(String(b.label))
  ));
}

/** The status keys the forecast counts. */
export function includedStatusKeys(rows = []) {
  return new Set((rows || []).filter((row) => row.included).map((row) => row.key));
}

/**
 * Mark every project with whether it is inside the forecast. Manual inclusion and
 * status inclusion both have to hold, and the reason a project is left out travels
 * with it, so the screen and the export can state it.
 */
export function applyStatusInclusion(families = [], includedKeys = new Set()) {
  const keys = includedKeys instanceof Set ? includedKeys : new Set(includedKeys || []);

  return safeArray(families).map((family) => {
    const statusIncluded = keys.has(statusKeyOf(family));
    const manuallyIncluded = family?.included === true;

    let reason = null;
    if (!manuallyIncluded) {
      reason = family?.selection?.inclusionPill || 'Not included in the forecast selection';
    } else if (!statusIncluded) {
      reason = `Status not included in the forecast: ${statusLabelOf(family)}`;
    }

    return {
      ...family,
      statusIncluded,
      forecastIncluded: manuallyIncluded && statusIncluded,
      forecastExclusionReason: reason,
      forecastExclusionPill: reason && manuallyIncluded ? STATUS_NOT_IN_FORECAST_PILL : null,
    };
  });
}