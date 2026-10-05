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
 *
 * The same mirror carries the excluded client-facing parameters (P8, P15, P21)
 * from base44/shared/clientFacingParameterAuthority.js: an assumed or
 * administrative parameter is never a client-facing row either, whatever an
 * older stored table carries.
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

/** The assumed / administrative parameters no proposal may show. */
export const EXCLUDED_CLIENT_PARAMETER_CODES = ['P8', 'P15', 'P21'];

const EXCLUDED_CLIENT_PARAMETER_IDS = [8, 15, 21];

const EXCLUDED_CLIENT_PARAMETER_ROW_PATTERN = /\bP8\b|\bP15\b|\bP21\b|\bParameter\s*(?:8|15|21)\b|background noise|noise floor|up-?firing|elevation speaker/i;

/** True when a row is about the internal Design Index rather than a design result. */
export function isDesignIndexRow(row) {
  if (!row) return false;

  const key = String(row.key || '').trim().toLowerCase();
  if (key === 'dpi' || key.startsWith('dpi_') || key === 'design_index') return true;

  const label = `${row.area || ''} ${row.label || ''}`.toLowerCase();
  return DESIGN_INDEX_BANNED_TERMS.some((term) => label.includes(term.toLowerCase()));
}

/** True when a row is an assumed or administrative parameter (P8, P15, P21). */
export function isExcludedClientParameterRow(row) {
  if (!row) return false;

  const key = String(row.key || '').trim().toLowerCase();
  if (EXCLUDED_CLIENT_PARAMETER_IDS.some((id) => key === `p${id}` || key.startsWith(`p${id}_`))) return true;

  return EXCLUDED_CLIENT_PARAMETER_ROW_PATTERN.test(`${row.area || ''} ${row.label || ''}`);
}

/** The client-facing rows only: the internal Design Index rows are dropped. */
export function excludeDesignIndexRows(rows) {
  return (Array.isArray(rows) ? rows : []).filter((row) => !isDesignIndexRow(row));
}

/**
 * The rows a client proposal may show: the internal Design Index and the
 * assumed / administrative parameters (P8, P15, P21) are both dropped.
 */
export function excludeClientFacingRows(rows) {
  return excludeDesignIndexRows(rows).filter((row) => !isExcludedClientParameterRow(row));
}

export default excludeDesignIndexRows;