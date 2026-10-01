/**
 * viewingResultCopy.js
 * --------------------
 * Text-only copy builder for the Visual Report "Viewing Experience" page.
 *
 * It reads the row-mapped RP23 seat results already published by
 * selectClientScreenSeating and states, in one short sentence per seating row,
 * what the viewers in that row actually get. No calculation happens here and no
 * level is invented: every level word comes from a published seat result.
 *
 * The wording is deliberately plain and never overstates a result — a row that
 * spans two levels says so, and a row below Level 1 is reported as below the
 * recommended minimum rather than dressed up.
 */

/** Block heading for the seat-mapped RP23 result. */
export const VIEWING_RESULT_HEADING = "RP23 Viewing Result";

// Weakest → strongest. "Below L1" is below the recommended minimum, not a level.
const LEVEL_ORDER = ["Below L1", "L1", "L2", "L3", "L4"];

function rank(label) {
  const index = LEVEL_ORDER.indexOf(label);
  return index === -1 ? LEVEL_ORDER.length : index;
}

function levelPhrase(label) {
  return label === "Below L1" ? "below Level 1" : `Level ${String(label).replace(/^L/, "")}`;
}

function uniqueLevels(seats) {
  const labels = seats
    .map((seat) => seat.levelLabel)
    .filter((label) => label != null && label !== "");
  return [...new Set(labels)].sort((a, b) => rank(a) - rank(b));
}

function rowSentence(row, isLastRow, multipleRows) {
  const levels = uniqueLevels(row.seats);
  if (levels.length === 0) return "";
  const seatWord = row.seats.length > 1 ? "seats" : "seat";
  const subject = `${row.label} ${seatWord}`;
  const weakest = levels[0];
  const strongest = levels[levels.length - 1];

  // One level across the row — the common case.
  if (weakest === strongest) {
    if (weakest === "Below L1") {
      return row.seats.length > 1
        ? `${subject} fall below the Level 1 viewing range.`
        : `${subject} falls below the Level 1 viewing range.`;
    }
    const verb = row.seats.length > 1 ? "achieve" : "achieves";
    const tail = isLastRow && multipleRows && strongest === "L3"
      ? ", giving a comfortable wider-room viewing position"
      : "";
    return `${subject} ${verb} ${levelPhrase(strongest)} viewing immersion${tail}.`;
  }

  // Mixed levels within one row — state the span rather than the best seat.
  const verb = row.seats.length > 1 ? "range" : "ranges";
  return `${subject} ${verb} from ${levelPhrase(weakest)} to ${levelPhrase(strongest)} viewing immersion.`;
}

/**
 * Build the short interpretation for the whole seating area.
 *
 * Identical levels across every seat collapse into one sentence; otherwise one
 * sentence per physical row, front to back.
 *
 * @param {Array} rows - rows from groupSeatsIntoRows, carrying published seat results
 * @returns {string} client-facing interpretation (empty when no results exist)
 */
export function buildViewingInterpretation(rows) {
  const filled = (Array.isArray(rows) ? rows : []).filter((row) => row?.seats?.length);
  if (filled.length === 0) return "";

  const allSeats = filled.flatMap((row) => row.seats);
  const levels = uniqueLevels(allSeats);
  if (levels.length === 1) {
    const seatCount = allSeats.length;
    if (levels[0] === "Below L1") {
      return `All ${seatCount} seats fall below the Level 1 viewing range.`;
    }
    return `All ${seatCount} seats achieve ${levelPhrase(levels[0])} viewing immersion.`;
  }

  return filled
    .map((row, index) => rowSentence(row, index === filled.length - 1, filled.length > 1))
    .filter(Boolean)
    .join(" ");
}