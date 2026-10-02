/**
 * designPerformanceIndex.js (shared)
 * ----------------------------------
 * The Sound Proof Design Performance Index, read passively from the frozen
 * Engineering Snapshot.
 *
 * THE INDEX IS INTERNAL. It is a designer diagnostic, never a client-facing
 * result:
 *   - it is never mentioned in proposal copy,
 *   - it is never a Key Performance Highlights row or any other table row,
 *   - it is never evidence in a System Design Summary or System Design
 *     Comparison,
 *   - it is never called an RP22 score and never presented as a percentage.
 *
 * The client-facing publishers that used to live here (the table row builder and
 * the prompt line) have been removed, so nothing in this module can reach a
 * client-facing surface. It remains the internal read authority for designer,
 * admin and diagnostic surfaces.
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

export const DESIGN_INDEX_SCOPES = SCOPES;