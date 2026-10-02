/**
 * pipelineAge.js
 * --------------
 * Age buckets and Artcoustic value ageing for the Project Intelligence overview.
 *
 * The admin needs to see how current or stale the included projects are, so
 * older open projects can be moved to won, lost or excluded and forecast
 * accuracy improves.
 *
 * Rules this module follows, unchanged from the rest of the reporting layer:
 *   · forecast projects only
 *   · counted versions only — a project's Artcoustic value and catalogue units
 *     come from its counted version, never from every version summed
 *   · one project counted once
 *   · Artcoustic catalogue products only: the value is the retail ex VAT the
 *     catalogue pass counted, and the trade value is derived from it
 *
 * Age basis: the project's last updated date where available, otherwise its
 * created date. Which basis was used is reported per project so the screen can
 * say so, and a project with neither date is never invented into a bucket.
 *
 * Pure: no React, no side effects, no entity access.
 */

import { referenceTime, safeArray, text, timeOf } from './reportingUtils';
import { getAgeDays } from '@/components/utils/projectAge';
import { tradeValueOf } from './artcousticForecast';

const DAY_MS = 86400000;

/**
 * The four age buckets, in reading order. Buckets are inclusive of both bounds
 * in whole days, so every aged project lands in exactly one bucket.
 */
export const AGE_BUCKETS = [
  { key: 'days_0_30', label: '0–30 days', fromDays: 0, toDays: 30, note: 'Current pipeline' },
  { key: 'days_31_90', label: '31–90 days', fromDays: 31, toDays: 90, note: 'Review soon' },
  { key: 'days_91_365', label: '91–365 days', fromDays: 91, toDays: 365, note: 'Likely needs status update' },
  { key: 'over_365_days', label: 'Over 1 year', fromDays: 366, toDays: null, note: 'Stale unless confirmed active' },
];

/** The bucket for projects with no usable created date. Never defaults to 0–30. */
export const UNKNOWN_AGE_BUCKET_KEY = 'unknown_age';
export const UNKNOWN_AGE_BUCKET_LABEL = 'Unknown age';

export const AGE_HELPER_NOTE = 'Older open projects should be reviewed and moved to won, lost or excluded to improve forecast accuracy.';

export const AGE_BASIS_NOTE = "Age uses the project's created date — the same age the Projects page shows. A project with no created date is reported as Unknown age, never as 0–30 days.";

export const AGE_BASIS_LABEL = Object.freeze({
  created: 'Project created',
});

/**
 * The age of one project: the ONE age authority, shared with the main Projects
 * page (getAgeDays → whole days since the project's created date).
 *
 * The project's updated date is deliberately NOT used. Editing a project does
 * not make it younger, and using it put every recently touched project into
 * 0–30 days. A project with no created date has an unknown age — never zero.
 */
export function ageBasisOf(family, now = null) {
  const reference = referenceTime(now);
  const created = text(family?.createdDate);
  const days = getAgeDays(created, reference);

  return {
    basis: days === null ? null : 'created',
    basisLabel: days === null ? null : AGE_BASIS_LABEL.created,
    date: days === null ? null : created,
    days,
  };
}

/** The bucket key for an age in days, or null when the age is unknown. */
export function ageBucketKeyForDays(days) {
  if (days === null || days === undefined || !Number.isFinite(Number(days))) return null;
  const value = Number(days);
  const bucket = AGE_BUCKETS.find(
    (candidate) => value >= candidate.fromDays && (candidate.toDays === null || value <= candidate.toDays),
  );
  return bucket?.key || null;
}

/** The bucket key for one project, or null when it carries no usable date. */
export function ageBucketKeyOf(family, now = Date.now()) {
  return ageBucketKeyForDays(ageBasisOf(family, now).days);
}

/** The bucket definition for a key, or null. Includes the Unknown age bucket. */
export function ageBucketByKey(key) {
  if (key === UNKNOWN_AGE_BUCKET_KEY) {
    return { key: UNKNOWN_AGE_BUCKET_KEY, label: UNKNOWN_AGE_BUCKET_LABEL, fromDays: null, toDays: null };
  }
  return AGE_BUCKETS.find((bucket) => bucket.key === key) || null;
}

/** The bucket label for one project, for the screen and the export. */
export function ageBucketLabelOf(family, now = Date.now()) {
  return ageBucketByKey(ageBucketKeyOf(family, now) || UNKNOWN_AGE_BUCKET_KEY)?.label
    || UNKNOWN_AGE_BUCKET_LABEL;
}

/**
 * Counted catalogue units for one project, from the catalogue pass. A project
 * with no counted catalogue line contributes nothing rather than a made-up figure.
 */
export function catalogueUnitsFor(unitsByProjectId, projectId) {
  if (!unitsByProjectId || !projectId) return 0;
  const units = unitsByProjectId instanceof Map
    ? unitsByProjectId.get(projectId)
    : unitsByProjectId[projectId];
  return Number.isFinite(Number(units)) ? Number(units) : 0;
}

/**
 * Artcoustic retail ex VAT for one project, from the catalogue pass. A project
 * with no priced catalogue line in the counted categories has no value at all —
 * never a zero standing in for unknown.
 */
export function catalogueRetailFor(retailByProjectId, projectId) {
  if (!retailByProjectId || !projectId) return null;
  const value = retailByProjectId instanceof Map
    ? retailByProjectId.get(projectId)
    : retailByProjectId[projectId];
  return value === null || value === undefined || !Number.isFinite(Number(value)) ? null : Number(value);
}

/** The single currency the given projects are counted in, or null. */
function currencyOf(families) {
  const currencies = new Set(safeArray(families).map((family) => family?.countedCurrency).filter(Boolean));
  return {
    currency: currencies.size === 1 ? [...currencies][0] : null,
    mixed: currencies.size > 1,
  };
}

const share = (part, whole) => (whole > 0 ? part / whole : null);

/**
 * The age and Artcoustic value ageing summary for the forecast projects.
 *
 * @param {Array} families — forecast project families
 * @param {Object} [options]
 * @param {Object} [options.unitsByProjectId] — counted catalogue units per project
 * @param {Object} [options.retailByProjectId] — Artcoustic retail ex VAT per project
 * @param {number} [options.now] — reference instant, for deterministic reporting
 * @returns {Object} buckets, totals and the helper copy
 */
export function buildPipelineAgeSummary(families = [], { unitsByProjectId = null, retailByProjectId = null, now = null } = {}) {
  const included = safeArray(families);
  const reference = referenceTime(now);

  const rawBuckets = AGE_BUCKETS.map((bucket) => {
    const inBucket = included.filter((family) => ageBucketKeyOf(family, reference) === bucket.key);
    const retailValues = inBucket
      .map((family) => catalogueRetailFor(retailByProjectId, family.id))
      .filter((value) => value !== null);
    const retail = retailValues.length > 0
      ? retailValues.reduce((sum, value) => sum + value, 0)
      : null;
    const units = inBucket.reduce((sum, family) => sum + catalogueUnitsFor(unitsByProjectId, family.id), 0);

    return {
      key: bucket.key,
      label: bucket.label,
      note: bucket.note,
      fromDays: bucket.fromDays,
      toDays: bucket.toDays,
      count: inBucket.length,
      valuedCount: retailValues.length,
      noValueCount: inBucket.length - retailValues.length,
      retail,
      trade: retail === null ? null : tradeValueOf(retail),
      units,
      projectIds: inBucket.map((family) => family.id),
    };
  });

  const allRetail = included
    .map((family) => catalogueRetailFor(retailByProjectId, family.id))
    .filter((value) => value !== null);
  const totalRetail = allRetail.length > 0 ? allRetail.reduce((sum, value) => sum + value, 0) : null;
  const totalUnits = included.reduce((sum, family) => sum + catalogueUnitsFor(unitsByProjectId, family.id), 0);
  const { currency, mixed } = currencyOf(included);

  // A project with no created date is reported as Unknown age — never folded
  // into 0–30 days — so the distribution still totals the included projects.
  const unknownAgeFamilies = included.filter((family) => ageBasisOf(family, reference).days === null);
  const unknownRetailValues = unknownAgeFamilies
    .map((family) => catalogueRetailFor(retailByProjectId, family.id))
    .filter((value) => value !== null);
  const unknownRetail = unknownRetailValues.length > 0
    ? unknownRetailValues.reduce((sum, value) => sum + value, 0)
    : null;
  const unknownAgeBucket = {
    key: UNKNOWN_AGE_BUCKET_KEY,
    label: UNKNOWN_AGE_BUCKET_LABEL,
    note: 'No created date recorded',
    fromDays: null,
    toDays: null,
    count: unknownAgeFamilies.length,
    valuedCount: unknownRetailValues.length,
    noValueCount: unknownAgeFamilies.length - unknownRetailValues.length,
    retail: unknownRetail,
    trade: unknownRetail === null ? null : tradeValueOf(unknownRetail),
    units: unknownAgeFamilies.reduce((sum, family) => sum + catalogueUnitsFor(unitsByProjectId, family.id), 0),
    projectIds: unknownAgeFamilies.map((family) => family.id),
    shareOfCount: share(unknownAgeFamilies.length, included.length),
    shareOfRetail: share(unknownRetail ?? 0, totalRetail ?? 0),
  };

  const buckets = [
    ...rawBuckets.map((bucket) => ({
      ...bucket,
      shareOfCount: share(bucket.count, included.length),
      shareOfRetail: share(bucket.retail ?? 0, totalRetail ?? 0),
    })),
    unknownAgeBucket,
  ];

  const overOneYear = buckets.find((bucket) => bucket.key === 'over_365_days') || null;
  const missingAgeCount = included.filter((family) => ageBasisOf(family, now).days === null).length;

  return {
    buckets,
    totals: {
      count: included.length,
      retail: totalRetail,
      trade: totalRetail === null ? null : tradeValueOf(totalRetail),
      averageRetail: allRetail.length > 0 ? totalRetail / allRetail.length : null,
      valuedCount: allRetail.length,
      noValueCount: included.length - allRetail.length,
      units: totalUnits,
      currency,
      mixedCurrency: mixed,
      projectsOverOneYear: overOneYear?.count || 0,
      unknownAgeCount: unknownAgeBucket.count,
      unknownAgeRetail: unknownAgeBucket.retail,
      unknownAgeTrade: unknownAgeBucket.trade,
      unknownAgeProjectIds: unknownAgeBucket.projectIds,
      retailOverOneYear: overOneYear?.retail ?? null,
      missingAgeCount,
    },
    helperNote: AGE_HELPER_NOTE,
    basisNote: AGE_BASIS_NOTE,
  };
}

/** A plain-text age basis sentence for one project, e.g. for a table tooltip. */
export function ageBasisSentence(family, now = Date.now()) {
  const age = ageBasisOf(family, now);
  if (age.days === null) return 'No created date recorded — age is unknown, and is never counted as 0–30 days';
  const when = text(age.date);
  return `Created ${when} — ${age.days} day${age.days === 1 ? '' : 's'} old`;
}