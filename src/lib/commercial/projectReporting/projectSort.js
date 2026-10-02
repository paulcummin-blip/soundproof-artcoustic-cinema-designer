/**
 * projectSort.js
 * --------------
 * The sort authority for the Project Intelligence Projects table.
 *
 * It orders the rows the reporting layer already produced. It never changes a
 * value, an inclusion choice, a status or a counted version, and it never removes
 * a row — sorting is display order only.
 *
 * Sorting rules:
 *  - Included groups the included projects first when ascending, because that is
 *    the group an admin normally wants.
 *  - Age orders by whole days old, youngest first. A project with no created or
 *    updated date has an unknown age, so it stays at the end either way rather
 *    than being shown as the newest project.
 *  - Last updated orders by the date actually used for the project's age.
 *  - Artcoustic retail orders numerically on the counted version's catalogue
 *    value; a version with no catalogue value is unknown, not zero, so it stays
 *    last.
 *  - Counted version orders alphabetically by version name, then by version
 *    number.
 *
 * Pure: no React, no DOM, no entity access.
 */

import { timeOf } from './reportingUtils';
import { ageBasisOf } from './pipelineAge';

const text = (value) => (value === null || value === undefined ? '' : String(value));

const byText = (left, right, direction) => (
  text(left).localeCompare(text(right), undefined, { sensitivity: 'base' }) * direction
);

const numberOrNull = (value) => (
  value === null || value === undefined || !Number.isFinite(Number(value)) ? null : Number(value)
);

/** Nulls are unknown, not smallest: they stay last in both directions. */
const byValue = (left, right, direction) => {
  const a = numberOrNull(left);
  const b = numberOrNull(right);
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return (a - b) * direction;
};

/**
 * The sortable columns of the Projects table. `compare` receives the context the
 * caller supplies so an age comparison is measured against one fixed instant.
 */
export const PROJECT_SORT_COLUMNS = [
  {
    key: 'included',
    label: 'Include',
    align: 'left',
    hint: 'Sort by inclusion — included projects first when ascending',
    compare: (a, b, direction) => {
      if (a.included === b.included) return 0;
      return (a.included ? -1 : 1) * direction;
    },
  },
  {
    key: 'age',
    label: 'Age',
    align: 'left',
    hint: 'Sort by age, youngest first. Projects with no date stay last.',
    compare: (a, b, direction, context) => byValue(
      ageBasisOf(a, context.now).days,
      ageBasisOf(b, context.now).days,
      direction,
    ),
  },
  {
    key: 'updated',
    label: 'Last updated',
    align: 'left',
    hint: 'Sort by the date the project was last updated, oldest first',
    compare: (a, b, direction) => byValue(
      timeOf(a.updatedDate) ?? timeOf(a.createdDate),
      timeOf(b.updatedDate) ?? timeOf(b.createdDate),
      direction,
    ),
  },
  {
    key: 'liveValue',
    label: 'Artcoustic retail',
    align: 'right',
    hint: 'Sort by counted-version Artcoustic retail ex VAT, highest first when descending. A project with no catalogue value stays last.',
    compare: (a, b, direction) => byValue(a.artcousticRetail, b.artcousticRetail, direction),
  },
  {
    key: 'countedVersion',
    label: 'Counted version',
    align: 'left',
    hint: 'Sort by counted version name, then version number',
    compare: (a, b, direction) => {
      const byName = byText(a.countedVersionName, b.countedVersionName, direction);
      if (byName !== 0) return byName;
      return ((Number(a.selection?.countedVersionNumber) || 0) - (Number(b.selection?.countedVersionNumber) || 0)) * direction;
    },
  },
];

const COLUMNS_BY_KEY = new Map(PROJECT_SORT_COLUMNS.map((column) => [column.key, column]));

/**
 * The opening view: the reporting layer's own order, so the Projects table opens
 * exactly as the selection was reported and only changes when a heading is
 * clicked.
 */
export const DEFAULT_PROJECT_SORT = { key: null, direction: 'asc' };

export const PROJECT_SORT_LABEL = 'the reporting order';

const SORTABLE_KEYS = new Set(PROJECT_SORT_COLUMNS.map((column) => column.key));

/** A usable sort state, or the default order when nothing valid is given. */
export function resolveProjectSort(sort) {
  const key = SORTABLE_KEYS.has(sort?.key) ? sort.key : null;
  if (key === null) return { ...DEFAULT_PROJECT_SORT };
  return { key, direction: sort?.direction === 'desc' ? 'desc' : 'asc' };
}

/**
 * The next sort state for a heading click: a new column opens ascending, and the
 * active column flips between ascending and descending.
 */
export function nextProjectSort(current, key) {
  const resolved = resolveProjectSort(current);
  if (!SORTABLE_KEYS.has(key)) return resolved;
  if (resolved.key === key) {
    return { key, direction: resolved.direction === 'asc' ? 'desc' : 'asc' };
  }
  return { key, direction: 'asc' };
}

/** The heading suffix shown on the active column. */
export function projectSortIndicator(activeSort, columnKey) {
  const resolved = resolveProjectSort(activeSort);
  if (resolved.key !== columnKey) return '';
  return resolved.direction === 'asc' ? '▲' : '▼';
}

/**
 * A new array of the same projects, in the requested order. The input is never
 * mutated, and with no column chosen the reporting order is returned untouched.
 *
 * @param {Array<Object>} families — selected project families
 * @param {Object} sort — { key, direction }
 * @param {Object} [options] — { now } reference instant for the age comparison
 * @returns {Array<Object>}
 */
export function sortProjectFamilies(families = [], sort = DEFAULT_PROJECT_SORT, { now = Date.now() } = {}) {
  const resolved = resolveProjectSort(sort);
  if (resolved.key === null) return [...families];

  const column = COLUMNS_BY_KEY.get(resolved.key);
  const direction = resolved.direction === 'asc' ? 1 : -1;
  const context = { now };

  return [...families].sort((a, b) => {
    const primary = column.compare(a, b, direction, context);
    if (primary !== 0) return primary;
    // Deterministic fallback, independent of direction.
    return byText(a.name, b.name, 1) || byText(a.id, b.id, 1);
  });
}