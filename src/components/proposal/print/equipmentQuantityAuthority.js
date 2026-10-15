/**
 * equipmentQuantityAuthority.js
 * -----------------------------
 * THE EQUIPMENT QUANTITY INVARIANT — the single rule that decides whether a
 * client-facing equipment row may be published at all.
 *
 * Product rule: if a client-facing equipment row exists, its quantity is a
 * positive whole number of loudspeakers (>= 1). A row never states 0, and never
 * states nothing. A count that cannot be resolved is an EQUIPMENT-AUTHORITY
 * FAILURE: the row is not published and the document is refused, so the problem
 * is surfaced before a proposal is generated or issued rather than reaching the
 * client as a blank cell.
 *
 * The blank cell the renderers can still fall back to is a defensive last resort
 * for a UI that is already on screen — it is never the accepted final state of a
 * generated or issued document.
 *
 * Pure: no imports, no React, no side effects, so the invariant can be proved on
 * its own.
 */

/** The rule, stated once, for messages and diagnostics. */
export const EQUIPMENT_QUANTITY_RULE =
  'Every equipment row states how many loudspeakers the position holds: a positive whole number, never 0 and never blank.';

/** Whether a row's quantity satisfies the invariant. */
export function isStatedQuantity(quantity) {
  return Number.isInteger(quantity) && quantity >= 1;
}

/**
 * The rows that break the invariant: the equipment-authority failures.
 *
 * @param {Array<{ role?: string, model?: string, qty?: number }>} rows
 * @returns {Array<{ role: string|null, model: string|null }>}
 */
export function unresolvedQuantities(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => !isStatedQuantity(row?.qty))
    .map((row) => ({ role: row?.role ?? null, model: row?.model ?? null }));
}

/** The position as the designer knows it, for a failure message. */
export function quantityPositionLabel(row) {
  const role = row?.role ? String(row.role) : 'An equipment position';
  return row?.model ? `${role} (${row.model})` : role;
}

/**
 * The message shown when the package cannot be published. It names the positions,
 * so the failure can be fixed rather than guessed at.
 */
export function equipmentQuantityMessage(rows) {
  const positions = unresolvedQuantities(rows).map(quantityPositionLabel);
  if (positions.length === 0) return null;
  return `Loudspeaker quantities could not be resolved for ${positions.join(', ')}. ${EQUIPMENT_QUANTITY_RULE} Nothing was issued — resolve the count for each position, then export again.`;
}

export default unresolvedQuantities;