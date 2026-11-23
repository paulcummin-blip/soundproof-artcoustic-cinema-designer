/**
 * designContextFacts.js (shared)
 * --------------------------------
 * THE VERIFIED, DATA-GROUNDED FACTS about a design version, and a factual
 * validator that rejects AI-discovered questions contradicting those facts.
 *
 * WHY THIS EXISTS. The AI discovery once inferred seating rows from the seat
 * count (Math.ceil(seats / 3)), turning five seats in one row into "two rows"
 * and then repeating that unsupported figure in its question. The facts here
 * are read ONLY from the actual design state: the rowNumber values the seats
 * record, the seat positions, the enabled subwoofers and the room dimensions.
 * Nothing is invented, and nothing is inferred from a count of something else.
 *
 * TWO RESPONSIBILITIES:
 *
 *   1. readVerifiedDesignFacts(version, project) — the facts the AI prompt
 *      receives and the validator checks against. seating_rows is derived
 *      from the actual rowNumber values; where those are absent it falls back
 *      to geometry-based depth clustering (reading y-coordinates, the same
 *      approach seatingBoundaryPrinciple uses); where neither is available it
 *      is null, so the caller omits the figure rather than inventing one.
 *
 *   2. questionContradictsFacts(question, facts) — a focused factual validator
 *      that rejects questions asserting a seating-row count, seat count,
 *      subwoofer count or room dimension that contradicts the verified facts.
 *      A question that makes no verifiable claim passes; a question whose
 *      claim matches the facts passes; a question whose claim contradicts the
 *      facts, or asserts a count the facts cannot verify, is rejected.
 *
 * Pure: no React, no SDK, no runtime-specific APIs. Importable from a backend
 * function, from the discovery module and from tests.
 */

/** Seats within this distance of one another in depth are one row. */
const ROW_BAND_M = 0.4;

/** Number words the validator and the row counter read from copy. */
const NUMBER_WORDS = Object.freeze({
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
});

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function asText(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseMaybe(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function wordToNumber(word) {
  if (word == null) return null;
  const n = Number(word);
  if (Number.isFinite(n)) return n;
  return NUMBER_WORDS[String(word).toLowerCase().trim()] ?? null;
}

function readDesignState(version) {
  return parseMaybe(version?.design_state) || {};
}

function readRoomDims(state, project = null) {
  const dims = parseMaybe(state.roomDims) || {};
  const projDims = parseMaybe(project?.roomDims) || {};
  return {
    widthM: num(dims.widthM ?? dims.width_m)
      ?? num(state.room_width)
      ?? num(projDims.widthM ?? projDims.width_m)
      ?? num(project?.room_width),
    lengthM: num(dims.lengthM ?? dims.length_m)
      ?? num(state.room_length)
      ?? num(projDims.lengthM ?? projDims.length_m)
      ?? num(project?.room_length),
    heightM: num(dims.heightM ?? dims.height_m)
      ?? num(state.room_height)
      ?? num(projDims.heightM ?? projDims.height_m)
      ?? num(project?.room_height),
  };
}

function readSeatingPositions(state) {
  const seats = Array.isArray(state.seatingPositions)
    ? state.seatingPositions
    : (Array.isArray(state.seating_positions) ? state.seating_positions : []);
  return seats.map((seat, index) => ({
    id: String(seat?.id ?? `seat-${index}`),
    x: num(seat?.x ?? seat?.x_m ?? seat?.position?.x),
    y: num(seat?.y ?? seat?.y_m ?? seat?.position?.y),
    row: num(seat?.row ?? seat?.rowNumber ?? seat?.row_number),
  }));
}

/**
 * THE VERIFIED SEATING ROW COUNT.
 *
 * Read from the actual rowNumber values the seats record. Where the seats
 * carry no row metadata, fall back to geometry-based depth clustering (the
 * same ROW_BAND_M approach seatingBoundaryPrinciple uses), reading the
 * y-coordinates the design records. Where neither row metadata nor
 * y-coordinates are available, return null so the caller omits the figure
 * rather than inventing it from the seat count.
 *
 * This never divides the seat count by a fixed number of seats per row.
 *
 * @param {Array} seats — the seating positions as the design records them
 * @returns {number|null} the verified row count, or null when undeterminable
 */
export function verifiedSeatingRowCount(seats) {
  const list = Array.isArray(seats) ? seats : [];
  if (list.length === 0) return 0;

  const rowNumbers = list
    .map((seat) => num(seat?.row ?? seat?.rowNumber ?? seat?.row_number))
    .filter((n) => n !== null && Number.isFinite(n));

  if (rowNumbers.length > 0) {
    return new Set(rowNumbers.map((n) => Math.trunc(n))).size;
  }

  // No explicit row metadata: cluster by y-coordinate depth. This reads the
  // actual geometry the design records; it does not invent rows from a count.
  const ys = list
    .map((seat) => num(seat?.y ?? seat?.position?.y))
    .filter((y) => y !== null);
  if (ys.length === 0) return null;

  const sorted = [...ys].sort((a, b) => a - b);
  const rows = [];
  for (const y of sorted) {
    if (!rows.some((entry) => Math.abs(entry - y) <= ROW_BAND_M)) {
      rows.push(y);
    }
  }
  return rows.length;
}

/**
 * THE VERIFIED DESIGN FACTS, read from the version's design state and the
 * parent project's room dimensions (the same fallback the deterministic
 * checks use). Every value is read from actual recorded data; nothing is
 * inferred from a count of something else.
 *
 * @param {Object} version — the ProjectVersion record
 * @param {Object} [project] — the parent Project record
 * @returns {Object} the verified facts
 */
export function readVerifiedDesignFacts(version = null, project = null) {
  const state = readDesignState(version);
  const roomDims = readRoomDims(state, project);
  const seats = readSeatingPositions(state);
  const subs = Array.isArray(state.subwooferInstances)
    ? state.subwooferInstances
    : (Array.isArray(state.subwoofers) ? state.subwoofers : []);
  const enabledSubs = subs.filter((s) => s?.enabled !== false);

  return {
    room: {
      widthM: roomDims.widthM,
      lengthM: roomDims.lengthM,
      heightM: roomDims.heightM,
    },
    seat_count: seats.length,
    // null when neither row metadata nor y-coordinates are available.
    seating_rows: verifiedSeatingRowCount(seats),
    subwoofer_count: enabledSubs.length,
    dolby_config: asText(state.dolbyLayout || state.dolbyPreset) || null,
    overhead_model: asText(state.overheadGlobalModel) || null,
    acoustic_treatment:
      state.acousticTreatmentEnabled === true
      || state.acoustic_treatment_enabled === true,
  };
}

// ── Factual validation ──────────────────────────────────────────────────────

const WORD_ALTERNATIVES = Object.keys(NUMBER_WORDS).join('|');

/**
 * Extract a seating-row count claim from question copy.
 * Matches "two rows", "2 rows", "2-row cinema", "two-row", "single row",
 * "one row". Returns the claimed count or null.
 */
function extractRowCountClaim(text) {
  const re = new RegExp(
    `\\b(\\d+|${WORD_ALTERNATIVES}|single)\\s*[- ]?\\s*(?:seating\\s+)?rows?\\b`,
    'i',
  );
  const m = text.match(re);
  if (!m) return null;
  if (/^single$/i.test(m[1])) return 1;
  return wordToNumber(m[1]);
}

/**
 * Extract a seat-count claim from question copy.
 * Matches "five seats", "5 seats", "5-seat", "five-seat". Returns the count
 * or null.
 */
function extractSeatCountClaim(text) {
  const re = new RegExp(
    `\\b(\\d+|${WORD_ALTERNATIVES})\\s*[- ]?\\s*seats?\\b`,
    'i',
  );
  const m = text.match(re);
  if (!m) return null;
  return wordToNumber(m[1]);
}

/**
 * Extract a subwoofer-count claim from question copy.
 * Matches "four subwoofers", "4 subwoofers", "4 subs", "two-subwoofer".
 */
function extractSubwooferCountClaim(text) {
  const re = new RegExp(
    `\\b(\\d+|${WORD_ALTERNATIVES})\\s*[- ]?\\s*(?:subwoofers?|subs?)\\b`,
    'i',
  );
  const m = text.match(re);
  if (!m) return null;
  return wordToNumber(m[1]);
}

/**
 * Extract a room-dimension claim from question copy.
 * Matches "5.6m x 6.69m", "5.6m × 6.69m". Returns { widthM, lengthM } or null.
 * Both "m" markers are required so a bare "2 x 4" array is not mistaken for
 * a room.
 */
function extractRoomDimensionClaim(text) {
  const re = /(\d+(?:\.\d+)?)\s*m\s*[x×]\s*(\d+(?:\.\d+)?)\s*m/i;
  const m = text.match(re);
  if (!m) return null;
  return { widthM: Number(m[1]), lengthM: Number(m[2]) };
}

/**
 * Whether a question contradicts the verified design facts.
 *
 * Returns null when the question is consistent with the facts, or makes no
 * verifiable claim. A question that asserts a seating-row count, seat count,
 * subwoofer count or room dimension that contradicts the verified facts, or
 * asserts a count the facts cannot verify, is rejected with a reason.
 *
 * A question that asks only for a reason ("Why was this arrangement chosen?")
 * makes no verifiable factual claim and always passes.
 *
 * @param {Object} question — a discovered question with a `question` string
 * @param {Object} facts — readVerifiedDesignFacts output
 * @returns {{reason: string, claim: *, actual?: *}|null}
 */
export function questionContradictsFacts(question, facts) {
  if (!question || typeof question !== 'object') return null;
  const text = typeof question.question === 'string' ? question.question : '';
  if (!text) return null;

  const rowClaim = extractRowCountClaim(text);
  if (rowClaim !== null) {
    const actual = facts?.seating_rows;
    if (actual === null || actual === undefined) {
      return { reason: 'unsupported_seating_row_claim', claim: rowClaim };
    }
    if (rowClaim !== actual) {
      return { reason: 'seating_row_count_mismatch', claim: rowClaim, actual };
    }
  }

  const seatClaim = extractSeatCountClaim(text);
  if (seatClaim !== null) {
    const actual = facts?.seat_count;
    if (actual === null || actual === undefined) {
      return { reason: 'unsupported_seat_count_claim', claim: seatClaim };
    }
    if (seatClaim !== actual) {
      return { reason: 'seat_count_mismatch', claim: seatClaim, actual };
    }
  }

  const subClaim = extractSubwooferCountClaim(text);
  if (subClaim !== null) {
    const actual = facts?.subwoofer_count;
    if (actual === null || actual === undefined) {
      return { reason: 'unsupported_subwoofer_count_claim', claim: subClaim };
    }
    if (subClaim !== actual) {
      return { reason: 'subwoofer_count_mismatch', claim: subClaim, actual };
    }
  }

  const roomClaim = extractRoomDimensionClaim(text);
  if (roomClaim !== null) {
    const room = facts?.room;
    if (!room || room.widthM === null || room.lengthM === null) {
      return { reason: 'unsupported_room_dimension_claim', claim: roomClaim };
    }
    // 0.2 m tolerance for rounding in copy.
    if (
      Math.abs(roomClaim.widthM - room.widthM) > 0.2
      || Math.abs(roomClaim.lengthM - room.lengthM) > 0.2
    ) {
      return { reason: 'room_dimension_mismatch', claim: roomClaim, actual: room };
    }
  }

  return null;
}

export default {
  readVerifiedDesignFacts,
  verifiedSeatingRowCount,
  questionContradictsFacts,
};