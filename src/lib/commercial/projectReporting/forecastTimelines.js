/**
 * forecastTimelines.js
 * --------------------
 * The time series behind the forecast dashboard: how many forecast projects and
 * how much Artcoustic value fall in each month.
 *
 * Periods are always months, so every point on the dashboard is one month of
 * pipeline activity and the last point is the month in progress. Which ranges
 * the loaded data can fill is decided here too, so the screen never offers a
 * period that starts before the pipeline does.
 *
 * A project is placed by the date being measured — created or last updated —
 * because those answer different questions: what was specified, and what was
 * worked on. A project with neither date is never invented into a period; it is
 * reported as missing instead.
 *
 * Rules unchanged from the rest of the reporting layer:
 *   · forecast projects only
 *   · counted versions only — value and units come from the counted version
 *   · one project counted once
 *   · Artcoustic catalogue products only: retail ex VAT, trade derived from it
 *   · a period with no valued project reports no value rather than zero
 *
 * Pure: no React, no side effects, no entity access.
 */

import { referenceTime, safeArray, text, timeOf } from './reportingUtils';
import { catalogueRetailFor, catalogueUnitsFor } from './pipelineAge';
import { tradeValueOf } from './artcousticForecast';

const MAX_BUCKETS = 240;

/** The ranges offered on the dashboard, from half a year to the full history. */
export const TIMELINE_RANGES = [
  { key: 'last_6_months', label: 'Last 6 months', months: 6, unit: 'month', unitLabel: 'month' },
  { key: 'last_12_months', label: 'Last 12 months', months: 12, unit: 'month', unitLabel: 'month' },
  { key: 'all_time', label: 'All time', months: null, unit: 'month', unitLabel: 'month' },
];

export const DEFAULT_TIMELINE_RANGE = 'last_12_months';

/** The date a project is placed by. */
export const TIMELINE_BASES = [
  { key: 'created', label: 'Created', field: 'createdDate' },
  { key: 'updated', label: 'Last updated', field: 'updatedDate' },
];

export const DEFAULT_TIMELINE_BASIS = 'created';

export function timelineRangeByKey(key) {
  return TIMELINE_RANGES.find((range) => range.key === key) || TIMELINE_RANGES[1];
}

export function timelineBasisByKey(key) {
  return TIMELINE_BASES.find((basis) => basis.key === key) || TIMELINE_BASES[0];
}

const monthStart = (stamp) => {
  const date = new Date(stamp);
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

const addMonths = (stamp, count) => {
  const date = new Date(stamp);
  date.setMonth(date.getMonth() + count);
  return date.getTime();
};

const shortMonth = (stamp) => new Date(stamp).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });

/** Whole months between two month starts. */
export const monthSpan = (from, to) => (
  (new Date(to).getFullYear() - new Date(from).getFullYear()) * 12
  + (new Date(to).getMonth() - new Date(from).getMonth())
);

function monthlyBuckets(fromMonthStart, toMonthStart) {
  const buckets = [];
  let cursor = fromMonthStart;
  while (cursor <= toMonthStart && buckets.length < MAX_BUCKETS) {
    const next = addMonths(cursor, 1);
    buckets.push({ key: `month_${buckets.length}`, label: shortMonth(cursor), start: cursor, end: next });
    cursor = next;
  }
  return buckets;
}

/** Every month from the oldest dated project to the current month. */
function allTimeBuckets(reference, earliestStamp) {
  const toMonth = monthStart(reference);
  if (earliestStamp === null) return monthlyBuckets(addMonths(toMonth, -11), toMonth);

  const earliestMonth = monthStart(earliestStamp);
  const span = monthSpan(earliestMonth, toMonth) + 1;

  const fromMonth = span > MAX_BUCKETS ? addMonths(toMonth, -(MAX_BUCKETS - 1)) : earliestMonth;
  return monthlyBuckets(fromMonth, toMonth);
}

function bucketsFor(range, reference, earliestStamp) {
  if (range.months) return monthlyBuckets(addMonths(monthStart(reference), -(range.months - 1)), monthStart(reference));
  return allTimeBuckets(reference, earliestStamp);
}

/**
 * Which ranges the loaded data can actually fill, so the dashboard never offers
 * a period that starts before the pipeline does: half a year of points needs six
 * months of history, a year of points needs twelve. The full history is always
 * available, because it starts wherever the data starts.
 */
export function availableTimelineRanges(families = [], { basis = DEFAULT_TIMELINE_BASIS, now = null } = {}) {
  const basisDef = timelineBasisByKey(basis);
  const reference = referenceTime(now);
  const earliest = safeArray(families)
    .filter((family) => family?.forecastIncluded !== false)
    .map((family) => {
      const raw = text(family?.[basisDef.field]);
      return raw ? timeOf(raw) : null;
    })
    .filter((stamp) => stamp !== null)
    .reduce((min, stamp) => Math.min(min, stamp), Infinity);

  const monthsCovered = earliest === Infinity
    ? 1
    : monthSpan(monthStart(earliest), monthStart(reference)) + 1;

  return TIMELINE_RANGES
    .filter((range) => range.months === null || range.months <= monthsCovered)
    .map((range) => range.key);
}

/**
 * The forecast time series for one range and one date basis.
 *
 * @param {Array} families — forecast project families
 * @param {Object} [options]
 * @param {string} [options.rangeKey] — one of TIMELINE_RANGES
 * @param {string} [options.basis] — 'created' or 'updated'
 * @param {Object} [options.unitsByProjectId] — counted catalogue units per project
 * @param {Object} [options.retailByProjectId] — Artcoustic retail ex VAT per project
 * @param {number} [options.now] — reference instant, for deterministic reporting
 * @returns {Object} points, totals and the range that was measured
 */
export function buildForecastTimeline(families = [], {
  rangeKey = DEFAULT_TIMELINE_RANGE,
  basis = DEFAULT_TIMELINE_BASIS,
  unitsByProjectId = null,
  retailByProjectId = null,
  now = null,
} = {}) {
  const range = timelineRangeByKey(rangeKey);
  const basisDef = timelineBasisByKey(basis);
  const reference = referenceTime(now);
  const included = safeArray(families).filter((family) => family?.forecastIncluded !== false);

  // An absent date is genuinely absent: it is never read as the epoch.
  const dated = included
    .map((family) => {
      const raw = text(family?.[basisDef.field]);
      return { family, stamp: raw ? timeOf(raw) : null };
    })
    .filter((entry) => entry.stamp !== null);

  const earliest = dated.length > 0
    ? dated.reduce((min, entry) => Math.min(min, entry.stamp), Infinity)
    : null;

  const buckets = bucketsFor(range, reference, earliest);
  const first = buckets[0] || null;
  const last = buckets[buckets.length - 1] || null;

  const points = buckets.map((bucket) => {
    const inBucket = dated.filter((entry) => entry.stamp >= bucket.start && entry.stamp < bucket.end);
    const retailValues = inBucket
      .map((entry) => catalogueRetailFor(retailByProjectId, entry.family.id))
      .filter((value) => value !== null);
    const retail = retailValues.length > 0
      ? retailValues.reduce((sum, value) => sum + value, 0)
      : null;
    const units = inBucket.reduce(
      (sum, entry) => sum + catalogueUnitsFor(unitsByProjectId, entry.family.id),
      0,
    );

    return {
      key: bucket.key,
      label: bucket.label,
      startDate: new Date(bucket.start).toISOString(),
      endDate: new Date(bucket.end).toISOString(),
      projects: inBucket.length,
      projectIds: inBucket.map((entry) => entry.family.id),
      valuedProjects: retailValues.length,
      noValueProjects: inBucket.length - retailValues.length,
      retail,
      trade: retail === null ? null : tradeValueOf(retail),
      units,
    };
  });

  const retailTotals = points.map((point) => point.retail).filter((value) => value !== null);
  const totalRetail = retailTotals.length > 0 ? retailTotals.reduce((sum, value) => sum + value, 0) : null;
  const currencies = new Set(included.map((family) => family?.countedCurrency).filter(Boolean));
  const outsideWindowCount = range.key === 'all_time' || !first || !last
    ? 0
    : dated.filter((entry) => entry.stamp < first.start || entry.stamp >= last.end).length;

  return {
    rangeKey: range.key,
    rangeLabel: range.label,
    unit: range.unit,
    unitLabel: range.unitLabel,
    basis: basisDef.key,
    basisLabel: basisDef.label,
    points,
    spanLabel: first && last ? `${first.label} – ${points[points.length - 1].label}` : null,
    totals: {
      projects: points.reduce((sum, point) => sum + point.projects, 0),
      valuedProjects: points.reduce((sum, point) => sum + point.valuedProjects, 0),
      retail: totalRetail,
      trade: totalRetail === null ? null : tradeValueOf(totalRetail),
      units: points.reduce((sum, point) => sum + point.units, 0),
      currency: currencies.size === 1 ? [...currencies][0] : null,
      mixedCurrency: currencies.size > 1,
      noDateCount: included.length - dated.length,
      outsideWindowCount,
      scopeProjectCount: included.length,
    },
  };
}