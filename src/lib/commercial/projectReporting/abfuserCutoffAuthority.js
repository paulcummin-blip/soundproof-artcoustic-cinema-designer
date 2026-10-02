/**
 * abfuserCutoffAuthority.js
 * -------------------------
 * The Abfuser reporting cutoff for Project Intelligence Product Demand.
 *
 * Historic projects carry excessive Abfuser quantities because of an old
 * calculation/input issue that has since been fixed. Those projects are
 * deliberately NOT recalculated, so Product Demand — a forecasting guide, not an
 * accounting report — leaves Abfuser quantity and value out for any counted
 * version dated before 1 October 2026. From that date onwards Abfuser counts
 * normally.
 *
 * REPORTING EXCLUSION ONLY. Nothing here writes to a project, a design version,
 * a proposal, the Product Master or any other record, and only the Abfuser line
 * is affected: every other product of a historic project is still counted.
 *
 * Pure: no React, no side effects, no entity access.
 */

import { text, timeOf } from './reportingUtils';

/** The cutoff date: Abfuser counts normally from this day onwards. */
export const ABFUSER_CUTOFF_ISO = '2026-10-01';
export const ABFUSER_CUTOFF_LABEL = '1 Oct 2026';
const ABFUSER_CUTOFF_TIME = new Date(`${ABFUSER_CUTOFF_ISO}T00:00:00`).getTime();

/** The Abfuser's identity in the catalogue. */
export const ABFUSER_SKU = '500027';
export const ABFUSER_CATEGORY = 'Acoustic Treatment';

export const ABFUSER_REASON = 'Historic Abfuser cutoff';
export const NO_DATE_LABEL = 'No usable date — treated as before the cutoff';

/**
 * Whether a demand line is an Abfuser. Identified by the catalogue SKU, by the
 * model or name saying Abfuser, or by the Acoustic Treatment category as
 * confirmation.
 */
export function isAbfuserLine(line, classification = null) {
  if (line?.isAbfuser === true) return true;

  const sku = text(classification?.sku || line?.sku || line?.model);
  const product = classification?.product || null;
  const words = `${sku} ${text(line?.description)} ${text(product?.label)} ${text(product?.model)}`.toLowerCase();

  if (sku === ABFUSER_SKU) return true;
  if (words.includes('abfuser')) return true;

  const category = text(product?.category || line?.category || classification?.category);
  return category.toLowerCase() === ABFUSER_CATEGORY.toLowerCase();
}

/**
 * The date the counted version is judged on: the version's own updated date,
 * then its created date, then the project's. Null when none is usable.
 */
export function resolveCountedDate(variation, family) {
  const candidates = [
    { value: variation?.updatedDate, basis: 'Version updated' },
    { value: variation?.createdDate, basis: 'Version created' },
    { value: family?.updatedDate, basis: 'Project updated' },
    { value: family?.createdDate, basis: 'Project created' },
  ];

  for (const candidate of candidates) {
    // An absent value must not become the epoch: a candidate with nothing in it
    // is skipped, so a version with no date at all is genuinely undated.
    if (!text(candidate.value)) continue;
    const stamp = timeOf(candidate.value);
    if (stamp !== null) return { stamp, dateUsed: candidate.value, basis: candidate.basis };
  }
  return { stamp: null, dateUsed: null, basis: 'No usable date' };
}

/**
 * Apply the cutoff to one demand line.
 *
 * A line with no usable date is treated as pre-cutoff and says so, rather than
 * being counted on an assumed date.
 *
 * @returns {{ abfuser: boolean, excluded: boolean, dateUsed: string|null, dateBasis: string, warning: string|null }}
 */
export function classifyAbfuserCutoff(line, { classification = null, variation = null, family = null } = {}) {
  if (!isAbfuserLine(line, classification)) {
    return { abfuser: false, excluded: false, dateUsed: null, dateBasis: '', warning: null };
  }

  const date = resolveCountedDate(variation, family);
  if (date.stamp === null) {
    return {
      abfuser: true,
      excluded: true,
      dateUsed: null,
      dateBasis: date.basis,
      warning: `${text(family?.name) || 'A counted version'} has no usable version or project date, so its Abfuser quantity is excluded from Product Demand and treated as before ${ABFUSER_CUTOFF_LABEL}.`,
    };
  }

  return {
    abfuser: true,
    excluded: date.stamp < ABFUSER_CUTOFF_TIME,
    dateUsed: date.dateUsed,
    dateBasis: date.basis,
    warning: null,
  };
}

/** The date an audit row shows: the date used, or why there was none. */
export function formatCutoffDate(verdict) {
  // A missing date must read as missing, never as the epoch.
  if (!text(verdict?.dateUsed)) return NO_DATE_LABEL;
  const stamp = timeOf(verdict.dateUsed);
  if (stamp === null) return NO_DATE_LABEL;

  // Formatted in the same local calendar the cutoff is applied in, so a version
  // dated just after local midnight cannot show the previous day.
  const date = new Date(stamp);
  const pad = (value) => String(value).padStart(2, '0');
  const iso = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return verdict?.dateBasis ? `${iso} (${verdict.dateBasis})` : iso;
}