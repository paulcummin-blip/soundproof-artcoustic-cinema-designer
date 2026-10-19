/**
 * seatingRowHeightDefaults.js
 * ---------------------------
 * The Room Designer's single authority for a seating row's DEFAULT heights.
 *
 * Row 1 keeps the established base ear height (1.2 m). A NEW row defaults to
 * 0.4 m above the row in front of it, so a designer adding rows gets a sensible
 * riser pattern straight away and can still type either value by hand.
 *
 * Platform height is stored per seat as an ABSOLUTE height (row 1 = 0) and is
 * derived from the row ear heights by the seat-rebuild authority — the room's
 * own physical relationship, not a second calculation. A row that steps up
 * 0.4 m in ear height therefore steps up 0.4 m in platform height, and the
 * Link ear & platform heights control keeps working on deltas as before.
 *
 * This is a CREATION DEFAULT only. It never rewrites a row that is already
 * saved, it is never re-applied once a designer has stated a value, and it
 * changes no calculation. Pure: no React, no SDK, no runtime APIs.
 */

/** How far a newly created row sits above the row in front of it. */
export const ROW_EAR_HEIGHT_INCREMENT_M = 0.4;

/** The Ear Height field's own bounds (metres). */
export const EAR_HEIGHT_MIN_M = 0.1;
export const EAR_HEIGHT_MAX_M = 3.0;

/** Ear height per 1-based row, for a row the designer has stated no height for. */
export function getEarHeightForRow(rowNumber) {
  switch (rowNumber) {
    case 1: return 1.2;
    case 2: return 1.5;
    case 3: return 1.8;
    default: return 1.2 + (rowNumber - 1) * 0.3;
  }
}

/** The Ear Height field resolves to 0.1 m, so a default is stated the same way. */
function toEarResolution(value) {
  return Math.round(value * 10) / 10;
}

/**
 * The ear heights the designer is currently shown, one entry per row: the row's
 * own stated height when it has one, otherwise that row's default. Padded or
 * trimmed to `rowCount`, so an entry always belongs to the row it is read for.
 *
 * @param {{rowEarHeights?: Array<number>, rowCount?: number}} input
 * @returns {Array<number>}
 */
export function resolveRowEarHeights({ rowEarHeights = [], rowCount = 1 } = {}) {
  const stored = Array.isArray(rowEarHeights) ? rowEarHeights : [];
  const rows = Math.max(1, Math.floor(Number(rowCount) || 1));
  return Array.from({ length: rows }, (_, index) => {
    const stated = Number(stored[index]);
    return Number.isFinite(stated) && stated > 0 ? stated : getEarHeightForRow(index + 1);
  });
}

/**
 * The ear height a newly created row starts at: 0.4 m above the row in front.
 * Falls back to the row-1 base height when no previous row is known, and stays
 * inside the Ear Height field's own bounds.
 *
 * @param {{previousEarHeightM?: number|null}} input
 * @returns {number} metres
 */
export function defaultEarHeightForNewRow({ previousEarHeightM = null } = {}) {
  const stated = Number(previousEarHeightM);
  const previous = Number.isFinite(stated) && stated > 0 ? stated : getEarHeightForRow(1);
  const stepped = toEarResolution(previous + ROW_EAR_HEIGHT_INCREMENT_M);
  return Math.max(EAR_HEIGHT_MIN_M, Math.min(EAR_HEIGHT_MAX_M, stepped));
}