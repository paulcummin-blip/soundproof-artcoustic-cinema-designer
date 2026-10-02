/**
 * designIndexRowAuthority.js
 * --------------------------
 * The Design Index is an internal designer diagnostic. It is never a
 * client-facing proposal result:
 *   - never a Key Performance Highlights row, in a summary or a comparison,
 *   - never described as a client-facing result,
 *   - never expressed as a percentage,
 *   - never evidence in generated copy.
 *
 * Proposals generated before this rule existed still carry the row in stored
 * data, so the guard is applied when rows are rendered for the editor, the
 * preview and the print/PDF document. The stored record is never modified.
 *
 * This is the frontend mirror of the shared rule in
 * base44/shared/reportWritingStyleContract.js (DESIGN_INDEX_BANNED_TERMS and
 * isDesignIndexRow). The app shell cannot import a shared backend module, so the
 * terms are repeated here and a test asserts the two lists stay identical.
 */

export const DESIGN_INDEX_BANNED_TERMS = [
  'Design Index',
  'Design Performance Index',
  'Design Score',
  'Design Rating',
  'Primary score',
  'Primary index',
  '(Primary)',
];

/** True when a row is about the internal Design Index rather than a design result. */
export function isDesignIndexRow(row) {
  if (!row) return false;

  const key = String(row.key || '').trim().toLowerCase();
  if (key === 'dpi' || key.startsWith('dpi_') || key === 'design_index') return true;

  const label = `${row.area || ''} ${row.label || ''}`.toLowerCase();
  return DESIGN_INDEX_BANNED_TERMS.some((term) => label.includes(term.toLowerCase()));
}

/** The client-facing rows only: the internal Design Index rows are dropped. */
export function excludeDesignIndexRows(rows) {
  return (Array.isArray(rows) ? rows : []).filter((row) => !isDesignIndexRow(row));
}

export default excludeDesignIndexRows;