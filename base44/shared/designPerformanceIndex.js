/**
 * designPerformanceIndex.js (shared)
 * ----------------------------------
 * The Sound Proof Design Performance Index, read passively from the frozen
 * Engineering Snapshot.
 *
 * The index is Sound Proof's own measure of the overall result. It is published
 * in the client-facing tables as SUPPORTING EVIDENCE:
 *   - it is never called an RP22 score,
 *   - it is never presented as a percentage,
 *   - it never replaces, alters or outranks an RP22 result,
 *   - it is never the basis of a recommendation on its own.
 *
 * Nothing is calculated or banded here: the index, designation and value are
 * copied from the published engineering summary inside the snapshot.
 *
 * Pure: no React, no side effects.
 */

const SCOPES = Object.freeze({
  primary: 'primary seat',
  secondary: 'secondary seats',
  all_seat: 'all seats',
});

function readScope(snapshot, scope) {
  const entry = snapshot?.rp22?.dpi?.[scope];
  if (!entry || entry.available !== true) return null;

  const index = Number.isFinite(Number(entry.index)) ? Number(entry.index) : null;
  const percentage = Number.isFinite(Number(entry.percentage)) ? Number(entry.percentage) : null;
  const value = index !== null ? String(index) : null;
  const designation = typeof entry.designation === 'string' && entry.designation.trim()
    ? entry.designation.trim()
    : null;

  if (value === null && designation === null && percentage === null) return null;

  return {
    scope,
    index,
    // Retained for traceability only: the index is never shown as a percentage.
    percentage,
    designation,
    value,
    text: [value, designation].filter(Boolean).join(' · ') || (percentage !== null ? `${percentage}%` : null),
  };
}

/** The index for each scope, or null when that scope was not assessed. */
export function readDesignIndex(snapshot) {
  return {
    primary: readScope(snapshot, 'primary'),
    secondary: readScope(snapshot, 'secondary'),
    all_seat: readScope(snapshot, 'all_seat'),
  };
}

/**
 * The Design Index rows for a client-facing table.
 *
 * Primary and all-seat are always carried when assessed. The secondary scope is
 * carried only when it is relevant, which means it was assessed and it says
 * something the primary scope does not.
 *
 * @param {Object} snapshot — frozen Engineering Snapshot
 * @returns {Array<{ key: string, area: string, result: string }>}
 */
export function designIndexHighlightRows(snapshot) {
  const index = readDesignIndex(snapshot);
  const rows = [];

  if (index.primary?.text) {
    rows.push({
      key: 'dpi_primary',
      area: 'Design Performance Index (primary seat)',
      result: index.primary.text,
    });
  }
  if (index.secondary?.text && index.secondary.text !== index.primary?.text) {
    rows.push({
      key: 'dpi_secondary',
      area: 'Design Performance Index (secondary seats)',
      result: index.secondary.text,
    });
  }
  if (index.all_seat?.text) {
    rows.push({
      key: 'dpi_all_seat',
      area: 'Design Performance Index (all seats)',
      result: index.all_seat.text,
    });
  }

  return rows;
}

/** A one-line description of the index for a prompt evidence block. */
export function describeDesignIndex(index) {
  const parts = [
    index?.primary?.text ? `primary seat ${index.primary.text}` : null,
    index?.secondary?.text ? `secondary seats ${index.secondary.text}` : null,
    index?.all_seat?.text ? `all seats ${index.all_seat.text}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

export const DESIGN_INDEX_SCOPES = SCOPES;