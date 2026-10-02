/**
 * pipelineTrends.js
 * ----------------
 * Rolling 90-day trend analysis for the Project Intelligence Trends view.
 *
 * Purpose: show whether more or fewer projects are being specified, and whether
 * they are higher or lower value, using plain windows and plain numbers.
 *
 * A project sits in the period it was created in — that is what "projects
 * specified" means. Its value and catalogue units come from its counted version,
 * and only included projects are measured. Windows are adjacent and never
 * overlap, so each period can be compared with the one before it.
 *
 * Language is deliberately neutral: a change is only called higher or lower when
 * it is material, and "Trend unclear due to limited data" is an honest answer.
 *
 * Pure: no React, no side effects, no entity access.
 */

import { safeArray, timeOf } from './reportingUtils';
import { catalogueUnitsFor } from './pipelineAge';

const DAY_MS = 86400000;

export const TREND_WINDOW_DAYS = 90;
export const TREND_WINDOW_COUNT = 5;

/** A change smaller than this is described as broadly unchanged, never as a trend. */
export const TREND_MATERIAL_CHANGE = 0.1;

export const TREND_SPARSE_MESSAGE = 'Trend data will become more useful as dealers create projects in their own accounts.';
export const TREND_UNCLEAR_MESSAGE = 'Trend unclear due to limited data';

const dayLabel = (stamp) => new Date(stamp).toLocaleDateString('en-GB', {
  day: '2-digit', month: 'short', year: 'numeric',
});

/**
 * The rolling 90-day windows, newest first: ending today, then 90, 180, 270 and
 * 360 days ago. Each window covers [start, end), and its label names the days it
 * actually contains.
 */
export function buildRollingWindows(now = Date.now(), count = TREND_WINDOW_COUNT) {
  const reference = timeOf(now) ?? Date.now();
  const span = TREND_WINDOW_DAYS * DAY_MS;

  return Array.from({ length: count }, (_, index) => {
    const end = reference - index * span;
    const start = end - span;
    return {
      key: `window_${index}`,
      index,
      start,
      end,
      startDate: new Date(start).toISOString(),
      endDate: new Date(end).toISOString(),
      label: `${dayLabel(start)} – ${dayLabel(end - DAY_MS)}`,
    };
  });
}

const numericValue = (value) => (
  value === null || value === undefined || !Number.isFinite(Number(value)) ? null : Number(value)
);

/** Where a project sits for period and dealer purposes. */
const dealerKeyOf = (family) => (
  family?.dealerName || family?.accountName || family?.accountId || null
);

/** Higher, lower or broadly unchanged — nulls are never called a trend. */
function directionOf(current, previous) {
  if (current === null || previous === null) return 'flat';
  if (previous === 0) return current > 0 ? 'up' : 'flat';
  const change = (current - previous) / previous;
  if (Math.abs(change) < TREND_MATERIAL_CHANGE) return 'flat';
  return change > 0 ? 'up' : 'down';
}

/**
 * The neutral trend statements for the newest two windows. At most a few short
 * sentences, each one readable straight off the numbers in the table.
 */
export function buildTrendStatements(windows = []) {
  const latest = windows[0];
  const previous = windows[1];
  if (!latest || !previous) return [TREND_UNCLEAR_MESSAGE];
  if (latest.projects === 0 && previous.projects === 0) return [TREND_UNCLEAR_MESSAGE];

  const statements = [];
  const projectDirection = directionOf(latest.projects, previous.projects);
  const valueDirection = directionOf(latest.totalLiveValue, previous.totalLiveValue);
  const averageDirection = directionOf(latest.averageValue, previous.averageValue);

  if (projectDirection === 'up' && averageDirection === 'down') statements.push('More projects, lower average value');
  else if (projectDirection === 'down' && averageDirection === 'up') statements.push('Fewer projects, higher average value');
  else if (projectDirection === 'up' && valueDirection === 'up') statements.push('More projects, higher total value');
  else if (projectDirection === 'down' && valueDirection !== 'up') statements.push('Lower activity than previous 90 days');
  else if (projectDirection === 'up') statements.push('More projects than the previous 90 days');
  else if (projectDirection === 'down') statements.push('Fewer projects than the previous 90 days');
  else statements.push('Project count broadly unchanged versus the previous 90 days');

  if (valueDirection === 'up' && averageDirection !== 'down') {
    statements.push('Higher total live value than the previous 90 days');
  } else if (valueDirection === 'down' && statements[0] !== 'Lower activity than previous 90 days') {
    statements.push('Lower total live value than the previous 90 days');
  } else if (valueDirection === 'flat') {
    statements.push('Total live value broadly unchanged versus the previous 90 days');
  }

  // Two projects in a window is not enough to call a direction.
  if (latest.projects < 2 && previous.projects < 2) statements.push(TREND_UNCLEAR_MESSAGE);

  return statements.slice(0, 3);
}

/**
 * The rolling 90-day trend summary.
 *
 * @param {Array} families — included project families (counted selection applied)
 * @param {Object} [options]
 * @param {Object} [options.unitsByProjectId] — counted catalogue units per project
 * @param {number} [options.now] — reference instant, for deterministic reporting
 * @param {string|null} [options.accountId] — restrict the trends to one dealer/account
 * @returns {Object} windows (newest first), cards data, statements and the sparse flag
 */
export function buildTrendSummary(families = [], { unitsByProjectId = null, now = Date.now(), accountId = null } = {}) {
  const included = safeArray(families).filter((family) => family?.included !== false);
  const scoped = accountId ? included.filter((family) => family.accountId === accountId) : included;
  const windows = buildRollingWindows(now);

  const rows = windows.map((window) => {
    const inWindow = scoped.filter((family) => {
      const created = timeOf(family?.createdDate);
      return created !== null && created >= window.start && created < window.end;
    });

    const values = inWindow.map((family) => numericValue(family?.countedLiveValue)).filter((value) => value !== null);
    const totalLiveValue = values.length > 0 ? values.reduce((sum, value) => sum + value, 0) : null;
    const units = inWindow.reduce((sum, family) => sum + catalogueUnitsFor(unitsByProjectId, family.id), 0);
    const accounts = new Set(inWindow.map(dealerKeyOf).filter(Boolean));
    const currencies = new Set(inWindow.map((family) => family?.countedCurrency).filter(Boolean));

    return {
      key: window.key,
      label: window.label,
      startDate: window.startDate,
      endDate: window.endDate,
      projects: inWindow.length,
      projectIds: inWindow.map((family) => family.id),
      valuedProjects: values.length,
      unpricedProjects: inWindow.length - values.length,
      totalLiveValue,
      averageValue: values.length > 0 ? totalLiveValue / values.length : null,
      units,
      averageUnitsPerProject: inWindow.length > 0 ? units / inWindow.length : null,
      activeAccounts: accounts.size,
      currency: currencies.size === 1 ? [...currencies][0] : null,
      mixedCurrency: currencies.size > 1,
    };
  });

  // Each window is compared with the previous 90 days — the next row down.
  const withChange = rows.map((row, index) => {
    const previous = rows[index + 1] || null;
    const change = (current, prior) => (
      current === null || prior === null || prior === undefined ? null : current - prior
    );

    return {
      ...row,
      previousProjects: previous ? previous.projects : null,
      previousTotalLiveValue: previous ? previous.totalLiveValue : null,
      previousAverageValue: previous ? previous.averageValue : null,
      previousUnits: previous ? previous.units : null,
      changeProjects: change(row.projects, previous?.projects ?? null),
      changeValue: change(row.totalLiveValue, previous?.totalLiveValue ?? null),
      changeAverageValue: change(row.averageValue, previous?.averageValue ?? null),
      changeUnits: change(row.units, previous?.units ?? null),
    };
  });

  const totalProjectsInView = withChange.reduce((sum, row) => sum + row.projects, 0);
  const sparse = totalProjectsInView < 3;
  const currencies = new Set(scoped.map((family) => family?.countedCurrency).filter(Boolean));

  return {
    windows: withChange,
    latest: withChange[0] || null,
    previous: withChange[1] || null,
    currency: currencies.size === 1 ? [...currencies][0] : null,
    mixedCurrency: currencies.size > 1,
    scopedProjectCount: scoped.length,
    activeAccountCount: new Set(scoped.map(dealerKeyOf).filter(Boolean)).size,
    windowDays: TREND_WINDOW_DAYS,
    sparse,
    sparseMessage: sparse ? TREND_SPARSE_MESSAGE : null,
    statements: buildTrendStatements(withChange),
  };
}